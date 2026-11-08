#!/usr/bin/env node
// Alfred Forge 0.1 — LOCAL EXPERIMENT ONLY. This is not a sandbox and must not be exposed to public users.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dir,'../..');
const output=path.join(dir,'output');
fs.mkdirSync(output,{recursive:true});

function envFile(file){
 if(!fs.existsSync(file))return;
 for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){
  const m=line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if(!m||process.env[m[1]])continue;
  let v=m[2];
  if((v[0]==='"'&&v.at(-1)==='"')||(v[0]==="'"&&v.at(-1)==="'"))v=v.slice(1,-1);
  process.env[m[1]]=v;
 }
}
envFile(path.join(root,'.env.local'));
envFile(path.join(dir,'.env.local'));

function checkScript(scad){
 if(typeof scad!=='string'||scad.length<30||scad.length>60000)throw Error('Código OpenSCAD inválido o demasiado grande.');
 const stripped=scad.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
 if(/\b(?:include|use|import|surface)\s*(?:\(|<)/i.test(stripped))throw Error('Código con referencias externas no permitidas.');
 if(/\b(?:https?|file):\/\//i.test(stripped))throw Error('Referencias URL prohibidas.');
 // IMPORTANT: these checks are not a security sandbox.
}
function compile(scad,name){
 checkScript(scad);
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'alfred-forge-'));
 const src=path.join(temp,'object.scad');
 fs.writeFileSync(src,scad);
 const results=[];
 try{
  for(const [ext,format] of [['stl','binstl'],['3mf',null]]){
   const dest=path.join(temp,'object.'+ext);
   const args=[...(format?['--export-format',format]:[]),'-o',dest,src];
   const r=spawnSync(process.env.OPENSCAD_BIN||'openscad',args,{
    timeout:120000,maxBuffer:4*1024*1024,encoding:'utf8',windowsHide:true
   });
   const log=[r.stdout,r.stderr].filter(Boolean).join('\n');
   if(r.error||r.status!==0||!fs.existsSync(dest)||fs.statSync(dest).size<100)
    throw Error('OpenSCAD '+ext+': '+(r.error?.message||log.slice(-2200)||'Sin archivo.'));
   results.push({ext,dest,bytes:fs.statSync(dest).size});
  }
  for(const r of results)fs.copyFileSync(r.dest,path.join(output,name+'.'+r.ext));
  fs.writeFileSync(path.join(output,name+'.scad'),scad);
  return results.map(r=>({file:name+'.'+r.ext,bytes:r.bytes}));
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
async function fromAI(prompt,feedback=''){
 const key=process.env.OPENAI_API_KEY;
 if(!key)throw Error('Falta OPENAI_API_KEY en .env.local.');
 const instructions="Sos Alfred Forge, un diseñador de objetos imprimibles en OpenSCAD 2021.01. Convertí el pedido en un único script OpenSCAD completo, paramétrico y compilable. Unidades en mm, sólido sobre z=0. Medidas máximas 320x310x315 mm como guía preliminar. Podés usar hull, loops, rotate_extrude, difference, union, polyhedron, minkowski. Uniones con solape real y paredes de espesor sensato. Si faltan medidas esenciales de piezas funcionales, explicalo sin inventar precisión. Para esculturas orgánicas complejas hacé una aproximación procedural honesta, sin prometer fidelidad. No uses include, use, import, surface, referencias externas ni código Python. Cuando pidan letras, nombres, grabados o corazones, deben existir en la geometría. Devolvé solamente el JSON del esquema.";
 const schema={type:'object',properties:{scad:{type:'string'},description:{type:'string'},
  assumptions:{type:'array',items:{type:'string'}},caveats:{type:'array',items:{type:'string'}}},
  required:['scad','description','assumptions','caveats'],additionalProperties:false};
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),90000);
 try{
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',
   headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},signal:ac.signal,
   body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1',store:false,max_output_tokens:10500,
    instructions,input:[{role:'user',content:'PEDIDO: '+prompt+(feedback?'\nCORRECCIÓN: '+feedback.slice(0,1800):'')}],
    text:{format:{type:'json_schema',name:'alfred_forge',strict:true,schema}}})});
  const data=await r.json();
  if(!r.ok)throw Error('OpenAI '+r.status+': '+(data.error?.message||'Error API.'));
  const text=data.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text;
  if(!text)throw Error('OpenAI no devolvió un programa completo.');
  return JSON.parse(text);
 }finally{clearTimeout(timer);}
}
function slug(v){return v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase().slice(0,42)||'pieza';}
const argv=process.argv.slice(2),example=argv.includes('--example');
const prompt=argv.filter(x=>x!=='--example').join(' ').trim();
if(!example&&!prompt){
 console.error('Uso: node experiments/alfred-forge/forge.mjs --example  ó  node experiments/alfred-forge/forge.mjs "Una pieza..."');
 process.exit(1);
}
try{
 const name=example?'arbol-vero-ale':slug(prompt)+'-'+new Date().toISOString().replace(/[-:T]/g,'').slice(0,12);
 let result,scad;
 if(example){
  scad=fs.readFileSync(path.join(dir,'examples','arbol-vero-ale.scad'),'utf8');
  result={description:'Árbol procedural sin API',assumptions:['Monocolor'],caveats:['Revisar en Bambu Studio']};
 }else{
  result=await fromAI(prompt);
  scad=result.scad;
 }
 let files;
 try{files=compile(scad,name);}
 catch(e){
  if(example)throw e;
  console.error('Compilación fallida. Se solicita una sola corrección a la IA.');
  result=await fromAI(prompt,'Error: '+e.message+'\nCódigo anterior:\n'+scad.slice(0,9000));
  scad=result.scad;
  files=compile(scad,name);
 }
 const manifest={prompt:example?'Ejemplo sin API':prompt,description:result.description,
  assumptions:result.assumptions,caveats:result.caveats,files,created:new Date().toISOString(),
  state:'Geometría sin laminar; requiere revisión y aprobación humana'};
 fs.writeFileSync(path.join(output,name+'.json'),JSON.stringify(manifest,null,2));
 console.log(JSON.stringify(manifest,null,2));
}catch(e){console.error('ERROR: '+e.message);process.exitCode=1;}
