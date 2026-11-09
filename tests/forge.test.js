import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Module from 'manifold-3d';
import {unzipSync,strFromU8} from 'fflate';
import {validateSource,validateForgeArchive} from '../shared/forge-schema.js';
import {forgeStatus,runForge,runCompiler,compileForgeSource,generateForgeSource,validateForgeRequest,fileLimit} from '../server/forge.js';
import {prepareForgeProposal,appendForgeRevision,revisionFromResult,base64Bytes} from '../src/forge-project.js';
import {defaults,validate,buildModel} from '../src/model.js';
const source='$fn=24; difference(){cube([30,20,10]);translate([10,10,-1])cylinder(h=12,d=4);}';
const api=await Module();api.setup();
const notes={scad:source,description:'Bloque de 30 × 20 × 10 mm',assumptions:['mm'],caveats:[]};
const reply=(data,status=200)=>({ok:status===200,status,json:async()=>data});
const aiReply=result=>reply({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]});

test('Forge rechaza entradas inválidas y referencias externas; historial acotado y saneado',()=>{
 for(const body of [null,[],{}, {action:'generate',prompt:''},{action:'generate',prompt:'a'.repeat(2001)},{action:'compile',scad:'cube(1);'},{action:'compile',scad:source+'import("/etc/passwd");'}])assert.throws(()=>validateForgeRequest(body));
 assert.throws(()=>validateSource(source+'include <secret.scad>'));
 let archive=null;for(let i=0;i<11;i++)archive=appendForgeRevision(archive,revisionFromResult({...notes,created:new Date().toISOString()},'pieza '+i,'v'+i));
 assert.equal(archive.revisions.length,8);assert.equal(archive.selected,'v10');
 assert.throws(()=>validateForgeArchive({...archive,selected:'missing'}));
 assert.throws(()=>validateForgeArchive({...archive,revisions:[{...archive.revisions[0],scad:'bad'}]}));
 assert.throws(()=>base64Bytes('@@@'));
 assert.deepEqual(validate({...defaults}).forge,null);
});

test('Responses recibe la fuente previa completa y roles; errores no filtran claves ni respuestas privadas',async()=>{
 let sent;
 const result=await generateForgeSource({prompt:'Más alto',previous:source,history:[{role:'assistant',content:'Propuesta pendiente'}]},{OPENAI_API_KEY:'secret-test',OPENAI_FORGE_MODEL:'model-test'},{fetcher:async(url,init)=>{assert.equal(url,'https://api.openai.com/v1/responses');sent=JSON.parse(init.body);return aiReply(notes);}});
 assert.equal(result.scad,source);assert.equal(sent.store,false);assert.equal(sent.model,'model-test');assert.equal(sent.text.format.strict,true);assert.equal(sent.input[0].role,'assistant');assert.equal(JSON.parse(sent.input[1].content).fuenteAnterior,source);
 await assert.rejects(()=>generateForgeSource({prompt:'x',history:[]},{OPENAI_API_KEY:'secret-test'},{fetcher:async()=>reply({error:{message:'private secret-test',code:'insufficient_quota'}},429)}),e=>/créditos/.test(e.message)&&!e.message.includes('secret-test'));
 await assert.rejects(()=>generateForgeSource({prompt:'x',history:[]},{},{fetcher:()=>{throw Error('No debe llamar');}}),/OPENAI_API_KEY/);
 for(const response of [reply({status:'incomplete'}),reply({output:[]}),aiReply({...notes,scad:'broken'})])await assert.rejects(()=>generateForgeSource({prompt:'x',history:[]},{OPENAI_API_KEY:'test'},{fetcher:async()=>response}));
});

test('compilador ausente falla antes de llamar a la IA; no hay reintentos con gasto oculto',async()=>{
 let calls=0;
 await assert.rejects(()=>runForge({action:'generate',prompt:'Árbol'},{env:{OPENSCAD_BIN:'/no-such-forge-compiler',OPENAI_API_KEY:'test'},fetcher:async()=>{calls++;return aiReply(notes);}}));
 assert.equal(calls,0);
});

test('watchdog, cancelación y logs excesivos terminan el proceso; hijo sin clave heredada',async()=>{
 const cwd=await fs.mkdtemp(path.join(os.tmpdir(),'forge-test-'));
 try{
  await assert.rejects(()=>runCompiler(process.execPath,['-e','setInterval(()=>{},1000)'],{cwd,limited:false,timeoutMs:40}),e=>e.code==='compile_timeout');
  const ac=new AbortController();setTimeout(()=>ac.abort(),40);
  await assert.rejects(()=>runCompiler(process.execPath,['-e','setInterval(()=>{},1000)'],{cwd,limited:false,signal:ac.signal}),e=>e.code==='canceled');
  await assert.rejects(()=>runCompiler(process.execPath,['-e','console.log("x".repeat(300000))'],{cwd,limited:false}),e=>e.code==='compile_output_limit');
  const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='not-for-compiler';
  try{await runCompiler(process.execPath,['-e','if(process.env.OPENAI_API_KEY)process.exit(7)'],{cwd,limited:false});}finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
 }finally{await fs.rm(cwd,{recursive:true,force:true});}
});

test('archivos excesivos, vacíos o fallidos se rechazan y se limpia la carpeta temporal',async()=>{
 let directory;
 const runner=async(_bin,args,{cwd})=>{if(!args.includes('-o'))return '';directory=cwd;const dest=args[args.indexOf('-o')+1];await fs.writeFile(dest,'x');};
 await assert.rejects(()=>compileForgeSource(source,{runner}),e=>e.code==='compile_size');
 assert.equal(await fs.access(directory).then(()=>true,()=>false),false);
 await assert.rejects(()=>compileForgeSource(source,{runner:async(_bin,args,{cwd})=>{directory=cwd;const f=await fs.open(args[args.indexOf('-o')+1],'w');await f.truncate(fileLimit+1);await f.close();}}),e=>e.code==='compile_size');
 assert.equal(await fs.access(directory).then(()=>true,()=>false),false);
 await assert.rejects(()=>compileForgeSource(source,{runner:async(_bin,_args,{cwd})=>{directory=cwd;throw Error('compilation failed');}}),/compilation failed/);
 assert.equal(await fs.access(directory).then(()=>true,()=>false),false);
});

test('Vercel no puede ejecutar ni comprobar Forge',async()=>{
 const old=process.env.VERCEL;process.env.VERCEL='1';
 try{await assert.rejects(()=>runForge({action:'example'}),e=>e.code==='local_only');await assert.rejects(()=>forgeStatus(),e=>e.code==='local_only');}
 finally{if(old===undefined)delete process.env.VERCEL;else process.env.VERCEL=old;}
});

test('muestra real: STL y 3MF cerrados, propuesta sin mutar original, guardado de fuente e historial',async t=>{
 if(!(await forgeStatus()).compiler){t.skip('OpenSCAD no instalado; ejecutar npm run forge:check en la computadora de prueba.');return;}
 const result=await runForge({action:'example'});
 const revision=revisionFromResult(result,'Muestra','example');const archive=appendForgeRevision(null,revision);
 const before=JSON.stringify(defaults),checked=prepareForgeProposal(api,defaults,result,archive);
 assert.equal(JSON.stringify(defaults),before);assert.equal(checked.candidate.kind,'free');assert.deepEqual(checked.built.dimensions.map(Math.round),[78,78,140]);assert.ok(checked.built.volume>1000);

 const {readMeshFile}=await import('../src/mesh-import.js');const {prepareImport}=await import('../src/solid-program.js');
 const m3=prepareImport(api,readMeshFile('tree.stl',base64Bytes(result.files.stl)));assert.deepEqual(m3.size.map(Math.round),[78,78,140]);assert.ok(Math.abs(m3.volume-checked.built.volume)<1);assert.equal(result.files['3mf'],undefined,'Forge compila solo el STL; la app arma el 3MF');
 const restored=validate(JSON.parse(JSON.stringify(checked.candidate)));assert.equal(restored.forge.revisions[0].scad,result.scad);assert.ok(buildModel(api,restored).volume>0);
 assert.throws(()=>prepareForgeProposal(api,defaults,{...result,files:{stl:'aW52YWxpZA=='}},archive));assert.equal(JSON.stringify(defaults),before);
 await assert.rejects(()=>compileForgeSource(source+'this is not valid scad;'),e=>e.code==='compile_failed');
});

test('generar y corregir: Responses simulado, compilación real, medidas e historial sin aplicar',async t=>{
 if(!(await forgeStatus()).compiler){t.skip('OpenSCAD no instalado.');return;}
 const result=await runForge({action:'generate',prompt:'Bloque con agujero'},{env:{OPENAI_API_KEY:'fake-unit-test-key'},fetcher:async()=>aiReply(notes)});
 const first=revisionFromResult(result,'Bloque con agujero','first'),archive=appendForgeRevision(null,first);
 const before=JSON.stringify(defaults),one=prepareForgeProposal(api,defaults,result,archive);
 assert.deepEqual(one.built.dimensions.map(Math.round),[30,20,10]);
 const scad='$fn=24; difference(){cube([30,20,18]);translate([10,10,-1])cylinder(h=20,d=4);}';
 let received;
 const corrected=await runForge({action:'generate',prompt:'Mantené el agujero y subí el alto a 18 mm',previous:result.scad,history:[{role:'user',content:'Bloque con agujero'}]},{env:{OPENAI_API_KEY:'fake-unit-test-key'},fetcher:async(_url,init)=>{received=JSON.parse(init.body);return aiReply({...notes,scad,description:'Bloque de 30 × 20 × 18 mm'});}});
 assert.equal(JSON.parse(received.input.at(-1).content).fuenteAnterior,source);
 const second=revisionFromResult(corrected,'Alto de 18 mm','second'),two=prepareForgeProposal(api,defaults,corrected,appendForgeRevision(archive,second));
 assert.deepEqual(two.built.dimensions.map(Math.round),[30,20,18]);assert.equal(two.candidate.forge.revisions.length,2);
 assert.equal(JSON.stringify(defaults),before);assert.equal(one.candidate.forge.revisions.length,1);
});
test('Forge usa un modelo de razonamiento por defecto con instrucciones de impresión',async()=>{
 let sent;
 await generateForgeSource({prompt:'Un gato de 80 mm',history:[]},{OPENAI_API_KEY:'secret-test'},{fetcher:async(_,init)=>{sent=JSON.parse(init.body);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({scad:'cube([10,10,10]); // pieza de prueba suficientemente larga',description:'Cubo',assumptions:[],caveats:[]})}]}]})};}});
 assert.equal(sent.model,'gpt-6.1-sol');assert.equal(sent.reasoning.effort,'medium');assert.match(sent.instructions,/resize\(\[0,0,80\]/);assert.match(sent.instructions,/intersection/);
});
