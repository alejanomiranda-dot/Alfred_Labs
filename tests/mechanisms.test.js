import {test} from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {unzipSync,strFromU8} from 'fflate';
import {validateManufacturing,manufacturingOf} from '../shared/manufacturing.js';
import {reviewPrint,reviewMechanism,countParts} from '../src/printability.js';
import {prepareForgeProposal,appendForgeRevision,revisionFromResult,base64Bytes} from '../src/forge-project.js';
import {validate,defaults,buildModel} from '../src/model.js';
import {reviewForge} from '../src/forge-review.js';
import {threeMfBytes,stlBytes} from '../src/export.js';
import {readMeshFile} from '../src/mesh-import.js';
import {prepareImport} from '../src/solid-program.js';
import {printGuide} from '../src/handoff.js';
import {generateForgeSource,validateForgeRequest} from '../server/forge.js';
import {routeOf} from '../server/assistant.js';
import {sampleMotion} from '../src/mechanism-motion.js';
const api=await Module();api.setup();
const spec={mode:'print_in_place',expectedParts:2,clearance:.4,minWall:1.2};
const toMesh=s=>{const m=s.getMesh();return {numProp:m.numProp,positions:m.vertProperties,triangles:m.triVerts};};
function pair(gap=.4,z=0){
 const a=api.Manifold.cube([10,10,4]),b=api.Manifold.cube([10,10,4]),moved=b.translate([10+gap,0,z]),both=api.Manifold.union([a,moved]);
 try{return {mesh:toMesh(both),volume:both.volume()};}finally{both.delete();moved.delete();b.delete();a.delete();}
}
test('mecanismos: distancia medida en triángulos detecta holgura insuficiente, cuerpos fusionados y cuerpos flotantes',()=>{
 const good=pair(),review=reviewPrint(good.mesh,good.volume,{manufacturing:spec,minWall:spec.minWall});
 assert.equal(review.mechanism.parts,2);assert.ok(Math.abs(review.mechanism.minGap-.4)<1e-4);assert.deepEqual(review.issues,[]);
 assert.ok(reviewMechanism(pair(.12).mesh,spec).issues.some(i=>i.kind==='clearance'));
 const fused=reviewMechanism(pair(-.1).mesh,spec);assert.equal(fused.parts,1);assert.ok(fused.issues.some(i=>i.kind==='parts'));
 assert.ok(reviewMechanism(pair(.5,2).mesh,spec).issues.some(i=>i.kind==='contact'));
 const far=reviewMechanism(pair(3).mesh,spec);assert.equal(far.minGap,3,'también mide distancias por encima de la holgura objetivo');
});
test('contrato de fabricación validado, histórico compatible y acabado técnico obligatorio incluso al reabrir',()=>{
 for(const bad of [{...spec,expectedParts:1},{...spec,expectedParts:33},{...spec,clearance:.1},{...spec,clearance:NaN},{...spec,minWall:.8},{...spec,mode:'single'}])assert.throws(()=>validateManufacturing(bad));
 const encoded=Buffer.from(stlBytes(pair().mesh)).toString('base64');
 const result={scad:'// mecanismo de prueba\ncube([10,10,4]);',manufacturing:spec,finish:{texture:'rock',smooth:1,depth:1,scale:8},description:'Dos cuerpos',assumptions:[],caveats:[],created:new Date().toISOString(),files:{stl:encoded}};
 const archive=appendForgeRevision(null,revisionFromResult(result,'mecanismo'));
 const checked=prepareForgeProposal(api,defaults,result,archive);
 assert.equal(checked.candidate.freeDesign.nodes.length,1);assert.equal(countParts(checked.built.combined),2);
 assert.deepEqual(manufacturingOf(validate(JSON.parse(JSON.stringify(checked.candidate)))) ,spec);
 assert.deepEqual(reviewForge(checked,[20.4,10,4]).problems,[]);
 const corrupt={...checked.candidate,freeDesign:{version:1,nodes:[...checked.candidate.freeDesign.nodes,{type:'finish',inputs:[0],position:[0,0,0],rotation:[0,0,0],texture:'rock',smooth:1,depth:1,scale:8,seed:1}]}};
 assert.throws(()=>buildModel(api,corrupt),/holguras/);
 const zip=unzipSync(threeMfBytes(checked.built)),xml=strFromU8(zip['3D/3dmodel.model']);assert.match(xml,/unit="millimeter"/);
 const restored=buildModel(api,JSON.parse(strFromU8(zip['Metadata/taller-de-vero.json'])));
 assert.equal(countParts(restored.combined),2);assert.ok(Math.abs(reviewMechanism(restored.combined,spec).minGap-.4)<1e-3);
 const stl=prepareImport(api,readMeshFile('test.stl',base64Bytes(encoded)));assert.ok(stl.volume>0);
 assert.match(printGuide(checked.candidate,checked.built.dimensions),/SIN VALIDACIÓN FÍSICA/);
 assert.match(printGuide(checked.candidate,checked.built.dimensions),/no uses organizar/);
});
test('generación y corrección conservan fabricación y anulan acabado orgánico propuesto por IA',async()=>{
 let sent;
 const body=validateForgeRequest({action:'generate',prompt:'más grande',previousManufacturing:spec});
 const reply={scad:'// bisagra de prueba\ncube([20,20,4]);',manufacturing:spec,finish:{texture:'fur',smooth:1,depth_mm:.7,scale_mm:4},description:'Bisagra',assumptions:[],caveats:[]};
 const result=await generateForgeSource(body,{OPENAI_API_KEY:'test'},{fetcher:async(_,init)=>{sent=JSON.parse(init.body);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(reply)}]}]})};}});
 assert.deepEqual(JSON.parse(sent.input.at(-1).content).fabricacionAnterior,spec);
 assert.equal(result.finish.smooth,0);assert.equal(result.finish.texture,'none');
 assert.deepEqual(result.manufacturing,spec);
 assert.throws(()=>validateForgeRequest({action:'generate',prompt:'a',previousManufacturing:{...spec,expectedParts:0}}));
 const downgraded={...reply,manufacturing:{mode:'single',expectedParts:1,clearance:0,minWall:1.2}};
 await assert.rejects(()=>generateForgeSource(body,{OPENAI_API_KEY:'test'},{fetcher:async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(downgraded)}]}]})})}),/perdió las articulaciones/);
});
test('un dragón articulado no pasa por el escultor que fusiona sus cuerpos; las consultas se conservan',()=>{
 const r={route:'sculpt',message:'Dragón',generation:null,forgePrompt:'Dragón con 5 segmentos',canApply:false};
 assert.equal(routeOf({...r},'Un dragón articulado de cinco segmentos'),'forge');
 assert.equal(routeOf({...r},'Un dragón no articulado'),'sculpt');
 assert.equal(routeOf({route:'chat',generation:null,canApply:false},'¿Cómo funciona un dragón articulado?'),'chat');
});
test('la simulación acotada detecta colisión durante movimiento aunque la posición inicial tenga holgura',()=>{
 const {mesh}=pair(.4);
 const scenario={name:'desplazamiento',positions:[0,-.2,-.8],groups:[{bodies:[1],motion:'linear',axis:'x',pivot:[0,0,0],ratio:1}]};
 const result=sampleMotion(api,mesh,scenario);
 assert.equal(result.samples[0].collisionMm3,0);assert.equal(result.samples[1].collisionMm3,0);assert.ok(result.samples[2].collisionMm3>1);assert.equal(result.passed,false);
 assert.throws(()=>sampleMotion(api,mesh,{...scenario,groups:[{...scenario.groups[0],bodies:[9]}]}),/Cuerpo móvil/);
});
