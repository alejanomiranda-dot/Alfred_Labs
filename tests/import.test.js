import {test} from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {zipSync,strToU8} from 'fflate';
import {readMeshFile} from '../src/mesh-import.js';
import {prepareImport} from '../src/solid-program.js';
import {defaults,buildModel,validate} from '../src/model.js';
import {stlBytes,threeMfBytes} from '../src/export.js';
import {proposeDesign} from '../server/assistant.js';
const api=await Module();api.setup();
const node=(type,extra={})=>({type,position:[0,0,0],rotation:[0,0,0],...extra});
const tube=buildModel(api,{...defaults,kind:'free',freeDesign:{version:1,nodes:[node('revolve',{points:[[18.5,0],[13.25,20],[13.25,40]],wallThickness:3,floorThickness:0})]}});
const asciiStl=mesh=>{let s='solid t\n';for(let i=0;i<mesh.triangles.length;i+=3){s+='facet normal 0 0 0\nouter loop\n';for(let j=0;j<3;j++){const k=mesh.triangles[i+j]*mesh.numProp;s+=`vertex ${mesh.positions[k]+50} ${mesh.positions[k+1]-20} ${mesh.positions[k+2]+7}\n`;}s+='endloop\nendfacet\n';}return strToU8(s+'endsolid t\n');};
const open=(name,bytes)=>{const file=readMeshFile(name,bytes),prepared=prepareImport(api,file);return {file,prepared,model:buildModel(api,{...defaults,kind:'free',importedMesh:prepared.mesh,freeDesign:{version:1,nodes:[node('imported')]}})};};
test('STL binario, STL de texto y 3MF propio conservan medidas y volumen, centrados sobre la mesa',()=>{
 for(const [name,bytes] of [['pieza.stl',stlBytes(tube.combined)],['texto.stl',asciiStl(tube.combined)],['pieza.3mf',threeMfBytes(tube)]]){
  const {file,model}=open(name,bytes);
  assert.deepEqual(model.dimensions.map(v=>Math.round(v*100)/100),tube.dimensions.map(v=>Math.round(v*100)/100),name);
  assert.ok(Math.abs(model.volume-tube.volume)/tube.volume<.001,name);
  const zs=file.vertices.filter((_,i)=>i%3===2);assert.equal(Math.min(...zs),0);
 }
});
test('3MF con componentes en otro archivo y transformaciones, como los de Bambu Studio',()=>{
 const v=[[0,0,0],[10,0,0],[0,10,0],[0,0,10]],t=[[0,2,1],[0,1,3],[1,2,3],[0,3,2]];
 const mesh=`<?xml version="1.0"?><model unit="centimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices>${v.map(p=>`<vertex x="${p[0]}" y="${p[1]}" z="${p[2]}"/>`).join('')}</vertices><triangles>${t.map(p=>`<triangle v1="${p[0]}" v2="${p[1]}" v3="${p[2]}"/>`).join('')}</triangles></mesh></object></resources></model>`;
 const main=`<?xml version="1.0"?><model unit="centimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"><resources><object id="2" type="model"><components><component p:path="/3D/Objects/object_1.model" objectid="1" transform="2 0 0 0 1 0 0 0 1 5 5 5"/></components></object></resources><build><item objectid="2" transform="1 0 0 0 1 0 0 0 1 100 100 0"/></build></model>`;
 const {file}=open('bambu.3mf',zipSync({'3D/3dmodel.model':strToU8(main),'3D/Objects/object_1.model':strToU8(mesh)}));
 assert.deepEqual(file.size,[200,100,100]);
});
test('una malla con las caras hacia adentro se da vuelta: volumen, peso y tiempo nunca son negativos',async()=>{
 const {reviewPrint}=await import('../src/printability.js');
 const t=tube.combined.triangles,flipped=new Uint32Array(t.length);for(let i=0;i<t.length;i+=3)flipped.set([t[i],t[i+2],t[i+1]],i);
 const inverted={...tube.combined,triangles:flipped};
 assert.equal(open('derecho.stl',stlBytes(tube.combined)).prepared.inverted,false);
 const {prepared,model}=open('al-reves.stl',stlBytes(inverted));
 assert.equal(prepared.inverted,true);
 assert.ok(Math.abs(prepared.volume-tube.volume)/tube.volume<.001);
 assert.ok(Math.abs(model.volume-tube.volume)/tube.volume<.001);
 // Proyectos guardados antes de la corrección: la malla invertida guardada se reconstruye bien.
 const raw=readMeshFile('viejo.stl',stlBytes(inverted)),old=buildModel(api,{...defaults,kind:'free',importedMesh:{name:'viejo',vertices:raw.vertices,triangles:raw.triangles},freeDesign:{version:1,nodes:[node('imported')]}});
 assert.ok(old.volume>0);
 const review=reviewPrint(inverted,-tube.volume);
 assert.ok(review.grams>0&&review.seconds>0&&review.material>0);
 // Lo que ve el panel: la pieza importada pesa y tarda lo mismo que la original.
 const want=reviewPrint(tube.combined,tube.volume),got=reviewPrint(model.combined,model.volume);
 assert.ok(Math.abs(got.grams-want.grams)/want.grams<.01&&Math.abs(got.seconds-want.seconds)/want.seconds<.01);
});
test('la pieza importada se puede grabar y perforar; archivos rotos o pesados se explican',()=>{
 const {prepared}=open('pieza.stl',stlBytes(tube.combined));
 const engraved=buildModel(api,{...defaults,kind:'free',importedMesh:prepared.mesh,freeDesign:{version:1,nodes:[node('imported'),node('box',{size:[3,50,6],position:[0,0,30]}),node('subtract',{inputs:[0,1]})]}});
 assert.ok(engraved.volume<tube.volume);
 assert.throws(()=>validate({...defaults,kind:'free',freeDesign:{version:1,nodes:[node('imported')]}}),/no tiene una pieza importada/);
 const broken=stlBytes({...tube.combined,triangles:tube.combined.triangles.slice(0,-3)});
 assert.throws(()=>prepareImport(api,readMeshFile('roto.stl',broken)),/no es un sólido cerrado/);
 assert.throws(()=>readMeshFile('dibujo.obj',new Uint8Array(4)),/STL o 3MF/);
 assert.equal(validate({...prepared.mesh&&{...defaults,kind:'tag',importedMesh:prepared.mesh}}).importedMesh,null);
});
test('la guía recibe solo el resumen de la pieza importada, nunca la malla',async()=>{
 let payload;const fetcher=async(url,opts)=>{payload=opts.body;return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({imageReading:'',imageDifferences:'',proportionCheck:'',message:'¿Qué le agrego?',canApply:false,expectedSize:null,params:defaults})}]}]})};};
 await proposeDesign({prompt:'Grabale VERO',params:{...defaults,importedMesh:{name:'x',vertices:[1,2,3],triangles:[0,0,0]}},importedSummary:{name:'pieza',size:[37,36.29,40]}},'test-key',fetcher);
 assert.match(payload,/piezaImportada/);assert.match(payload,/36\.29/);assert.doesNotMatch(payload,/"vertices"/);
});
test('el perfil medido de la pieza importada muestra base, cuello y hueco reales',async()=>{
 const {describeImport}=await import('../src/solid-program.js');
 const {prepared}=open('pieza.stl',stlBytes(tube.combined)),d=describeImport(api,prepared.mesh);
 assert.deepEqual(d.ocupa.z,[0,40]);
 const low=d.cortes[0],top=d.cortes.at(-1);assert.ok(Math.abs(low.ancho-37)<.3);assert.ok(Math.abs(top.ancho-26.5)<.3);assert.ok(Math.abs(top.hueco_ancho-20.5)<.3);
});
