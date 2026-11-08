import {test} from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {defaults,buildModel} from '../src/model.js';
import {reliefMesh,generatedParams} from '../src/relief.js';
import {validateGeneration} from '../src/generation-spec.js';
import {generateVisual} from '../server/visual-generation.js';
import {designService} from '../server/design-service.js';
import {checkProposal} from '../src/proposals.js';
import {stlBytes,threeMfBytes} from '../src/export.js';
const api=await Module();api.setup();
const spec={mode:'relief',subject:'Luna de prueba',width:80,height:60,baseThickness:2,depth:3};
function edgesClosed(mesh){const edges=new Map();for(let i=0;i<mesh.triangles.length;i+=3)for(let j=0;j<3;j++){const a=mesh.triangles[i+j],b=mesh.triangles[i+(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');const e=edges.get(key)||[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(key,e);}for(const e of edges.values())assert.deepEqual(e,[2,0]);}
test('mapa de alturas produce relieve cerrado con base plana, medidas y volumen reales',()=>{
 const pixels=new Uint8ClampedArray(4*4*4);for(let i=0;i<16;i++)pixels.set([i%4*85,i%4*85,i%4*85,255],i*4);
 const mesh=reliefMesh(pixels,4,4,spec);edgesClosed(mesh);
 const model=buildModel(api,generatedParams(defaults,mesh,spec));edgesClosed(model.combined);
 assert.deepEqual(model.dimensions,[80,60,5]);assert.ok(Math.abs(model.volume-80*60*3.5)<.01);assert.ok(stlBytes(model.combined).length>84);assert.ok(threeMfBytes(model).length>100);
 assert.equal(model.params.sourceInfo.subject,spec.subject);
});
test('imagen transparente queda en el plano base, inversión y orientación se conservan',()=>{
 const p=new Uint8ClampedArray([255,255,255,255,0,0,0,0,0,0,0,255,255,255,255,255]);
 const normal=reliefMesh(p,2,2,spec),inverse=reliefMesh(p,2,2,spec,{invert:true});
 assert.equal(normal.vertices[2],2);assert.equal(normal.vertices[8],5);assert.equal(normal.vertices[11],2);assert.equal(inverse.vertices[2],5);assert.equal(inverse.vertices[11],2);edgesClosed(normal);
});
test('ruido de una imagen densa sigue siendo un sólido cerrado dentro de los límites',()=>{
 const p=new Uint8ClampedArray(160*160*4);for(let i=0;i<p.length;i+=4){p[i]=p[i+1]=p[i+2]=(i*17)%256;p[i+3]=255;}
 const mesh=reliefMesh(p,160,160,spec);edgesClosed(mesh);const model=buildModel(api,generatedParams(defaults,mesh,spec));assert.ok(model.volume>0);assert.ok(model.combined.triangles.length/3<150000);
});
test('medidas inválidas, exceso de resolución e imagen faltante no construyen piezas',()=>{
 for(const raw of [{...spec,width:NaN},{...spec,baseThickness:0},{...spec,depth:100},{...spec,mode:'sculpture'}])assert.throws(()=>validateGeneration(raw));
 assert.throws(()=>reliefMesh([],300,300,spec));
});
test('un ajuste conversado usa la malla de la propuesta visual, sin necesitar aplicarla primero',()=>{
 const pixels=new Uint8ClampedArray(16*4).fill(255),pending=generatedParams(defaults,reliefMesh(pixels,4,4,spec),spec);
 const program={version:1,nodes:[...pending.freeDesign.nodes,{type:'cylinder',radius:3,radiusTop:3,height:20,position:[0,0,3],rotation:[0,0,0]},{type:'subtract',inputs:[0,1],position:[0,0,0],rotation:[0,0,0]}]};
 const checked=checkProposal(api,defaults,{designSource:'pending',params:{kind:'free',freeDesign:program}},pending);
 assert.equal(checked.candidate.importedMesh,pending.importedMesh);assert.ok(checked.built.volume<80*60*5);assert.equal(defaults.importedMesh,null);edgesClosed(checked.built.combined);
});
test('nuevas formas suaves conservan medidas, agujeros y sólidos cerrados',()=>{
 const n=(type,extra)=>({type,position:[0,0,0],rotation:[0,0,0],...extra});
 for(const [node,size] of [[n('ellipsoid',{size:[40,30,60]}),[40,30,60]],[n('capsule',{radius:5,height:30}),[10,10,30]],[n('torus',{radius:20,radiusTop:3}),[46,46,6]]]){const model=buildModel(api,{...defaults,kind:'free',freeDesign:{version:1,nodes:[node]}});edgesClosed(model.combined);assert.ok(model.dimensions.every((v,i)=>Math.abs(v-size[i])<.01));}
});
test('generación visual usa OpenAI, respeta referencia y devuelve solo la imagen verificada',async()=>{
 let sent;const fetcher=async(url,options)=>{sent={url,...options};return {ok:true,json:async()=>({data:[{b64_json:'aGVsbG8='}]})};};
 const response=await generateVisual({spec},'test-key',fetcher);assert.match(response.imageDataUrl,/^data:image\/png;base64,/);assert.equal(response.interpretation,true);assert.equal(JSON.parse(sent.body).model,'gpt-image-1.5');assert.match(JSON.parse(sent.body).prompt,/HEIGHT MAP/);
 await generateVisual({spec,imageDataUrl:'data:image/png;base64,aGVsbG8='},'test-key',fetcher);assert.match(sent.url,/images\/edits$/);assert.ok(sent.body instanceof FormData);assert.ok(sent.body.has('image'));
});
test('errores de acceso a imágenes se explican sin revelar credenciales ni detalles del proveedor',async()=>{
 await assert.rejects(generateVisual({spec},'test-key',async()=>({ok:false,status:403,json:async()=>({error:{message:'private-upstream'}})})),e=>e.message.includes('adjuntar una imagen')&&!e.message.includes('private-upstream'));
 await assert.rejects(designService({action:'bad'},{}),/Acción/);
 const noCall=()=>{throw Error('No debe salir a internet');};await assert.rejects(generateVisual({spec,imageDataUrl:'https://example.com'},'test-key',noCall),/referencia/);
});
