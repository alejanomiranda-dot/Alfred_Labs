import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import Module from 'manifold-3d';
import {applyFinish,defaultFinish,finishTextures,finishMinWall} from '../src/finish.js';
import {countParts,reviewPrint} from '../src/printability.js';
import {defaults,validate,buildModel} from '../src/model.js';
import {prepareForgeProposal,appendForgeRevision,revisionFromResult,forgeProgram,withFinish,finishOf} from '../src/forge-project.js';
import {stlBytes} from '../src/export.js';
import {validateForgeArchive,finishFromModel} from '../shared/forge-schema.js';
import {generateForgeSource,validateForgeRequest} from '../server/forge.js';
const api=await Module();api.setup();const M=api.Manifold;

// Luna hueca como la que arma Forge: esfera facetada, cavidad, abertura de Ø24 abajo y base plana en z=0.
const moon=(outer=45,inner=40)=>M.sphere(outer,32).translate([0,0,40]).subtract(M.sphere(inner,32).translate([0,0,40])).subtract(M.cylinder(20,12,12,32,false).translate([0,0,-5])).trimByPlane([0,0,1],0);
const meshOf=s=>{const r=s.getMesh();return {numProp:r.numProp,positions:new Float32Array(r.vertProperties),triangles:new Uint32Array(r.triVerts)};};
const sizeOf=s=>{const b=s.boundingBox();return b.max.map((v,i)=>v-b.min[i]);};
// Espesor real: desde cada vértice de la cara exterior, un rayo hacia el centro hasta la cavidad.
function thinnestWall(s,center=[0,0,40]){
 const m=meshOf(s),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(m.positions,3));geometry.setIndex(new THREE.BufferAttribute(m.triangles,1));
 const bvh=new MeshBVH(geometry),ray=new THREE.Ray(),c=new THREE.Vector3(...center);let min=Infinity;
 for(let v=0;v<m.positions.length;v+=3){
  const p=new THREE.Vector3(m.positions[v],m.positions[v+1],m.positions[v+2]);if(p.z<14||p.distanceTo(c)<42.5)continue;// fuera de la abertura y la base
  const dir=c.clone().sub(p).normalize();ray.set(p.clone().addScaledVector(dir,1e-3),dir);const hit=bvh.raycastFirst(ray,THREE.DoubleSide);if(hit)min=Math.min(min,hit.distance);
 }
 return min;
}

test('cada acabado deja la luna cerrada, de una pieza, con la base, la abertura y las medidas intactas',()=>{
 const solid=moon(),size=sizeOf(solid),contact=reviewPrint(meshOf(solid),solid.volume()).contactArea;
 for(const texture of finishTextures){
  const out=applyFinish(api,solid,defaultFinish(texture)),mesh=meshOf(out);
  assert.equal(out.status(),'NoError',texture);
  assert.equal(countParts(mesh),1,texture);
  assert.ok(out.volume()>0,texture);
  assert.ok(out.numTri()>solid.numTri()*10&&out.numTri()<=190000,texture+': la malla se refina sin pasarse del límite');
  // Décimas de milímetro: muy por debajo de la tolerancia de medidas de Forge (2 mm o 5 %).
  sizeOf(out).forEach((v,i)=>assert.ok(Math.abs(v-size[i])<1,texture+': medida '+i+' '+v.toFixed(2)+' en vez de '+size[i].toFixed(2)));
  assert.ok(Math.abs(out.boundingBox().min[2])<1e-6,texture+': la base sigue en z=0');
  assert.ok(out.boundingBox().min[2]>-1e-6,texture+': nada por debajo de la cama');
  assert.ok(reviewPrint(mesh,out.volume()).contactArea>contact*.95,texture+': la base sigue apoyando');
  // La abertura no se achica: ningún punto cerca de la cama queda dentro del radio del agujero.
  let hole=Infinity;for(let v=0;v<mesh.positions.length;v+=3)if(mesh.positions[v+2]>.5&&mesh.positions[v+2]<4)hole=Math.min(hole,Math.hypot(mesh.positions[v],mesh.positions[v+1]));
  assert.ok(hole>11.9,texture+': abertura de '+hole.toFixed(2)+' mm de radio');
  assert.ok(thinnestWall(out)>=finishMinWall-.05,texture+': pared');
 }
});

test('una textura profunda en una pared fina se limita para no bajar del espesor mínimo',()=>{
 const thin=moon(45,42.6),before=thinnestWall(thin);assert.ok(before>2.2&&before<2.5);
 const out=applyFinish(api,thin,{texture:'craters',smooth:.8,depth:3,scale:10,seed:3});
 const wall=thinnestWall(out);assert.ok(wall>=finishMinWall-.05,'pared de '+wall.toFixed(2)+' mm');
 assert.ok(out.volume()<thin.volume(),'los cráteres sí se tallan donde hay material de sobra');
});

test('el acabado es determinístico y sin acabado no cambia nada',()=>{
 const solid=moon(),f={texture:'rock',smooth:.6,depth:.8,scale:7,seed:2};
 assert.equal(applyFinish(api,solid,f).volume(),applyFinish(api,solid,f).volume());
 assert.equal(applyFinish(api,solid,{texture:'none',smooth:0,depth:0,scale:8}),null);
});

test('Forge guarda el acabado en la versión y lo aplica como última operación, que el panel puede cambiar',async()=>{
 const solid=moon(),stl=Buffer.from(stlBytes(meshOf(solid))).toString('base64');
 const finish={texture:'craters',smooth:.9,depth:1.4,scale:10};
 const revision=revisionFromResult({scad:'// luna hueca de prueba\nsphere(45);\n',finish,description:'Luna',assumptions:[],caveats:[],created:new Date().toISOString()},'luna');
 assert.deepEqual(revision.finish,finish);
 const archive=appendForgeRevision(null,revision);assert.deepEqual(validateForgeArchive(JSON.parse(JSON.stringify(archive))).revisions[0].finish,finish);
 const checked=prepareForgeProposal(api,{...defaults},{files:{stl}},archive);
 assert.deepEqual(checked.candidate.freeDesign.nodes.map(n=>n.type),['imported','finish']);
 assert.deepEqual(finishOf(checked.candidate.freeDesign),finish);
 assert.ok(checked.built.combined.triangles.length/3>50000,'la pieza armada es la terminada');
 checked.built.dimensions.forEach((v,i)=>assert.ok(Math.abs(v-sizeOf(solid)[i])<1));
 // Cambiar el acabado reutiliza la pieza importada; sacarlo vuelve a la malla compilada.
 const smoother=withFinish(checked.candidate.freeDesign,{...finish,texture:'none'});
 assert.deepEqual(smoother.nodes.at(-1),{type:'finish',inputs:[0],position:[0,0,0],rotation:[0,0,0],texture:'none',smooth:.9,depth:0,scale:10,seed:1});
 const plain=withFinish(checked.candidate.freeDesign,{texture:'none',smooth:0,depth:0,scale:8});assert.deepEqual(plain.nodes.map(n=>n.type),['imported']);
 const rebuilt=buildModel(api,validate({...checked.candidate,freeDesign:plain}));assert.equal(rebuilt.combined.triangles.length/3,solid.numTri());
 // Versiones viejas sin acabado siguen igual.
 assert.deepEqual(forgeProgram(undefined).nodes.map(n=>n.type),['imported']);
 assert.throws(()=>validate({...checked.candidate,freeDesign:withFinish(plain,{texture:'lava',smooth:1,depth:1,scale:5})}),/Acabado no disponible/);
});

test('el modelo elige el acabado; valores fuera de rango se acotan y el acabado anterior viaja en el pedido',async()=>{
 assert.deepEqual(finishFromModel({texture:'craters',smooth:4,depth_mm:9,scale_mm:.1}),{texture:'craters',smooth:1,depth:3,scale:1});
 assert.deepEqual(finishFromModel({texture:'lava'}),{texture:'none',smooth:0,depth:0,scale:8});
 assert.equal(finishFromModel({texture:'none',smooth:.8,depth_mm:2,scale_mm:5}).depth,0);
 let sent;
 const fetcher=async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({scad:'// luna hueca de prueba\nsphere(45, $fn=32);\n',finish:{texture:'craters',smooth:.9,depth_mm:1.4,scale_mm:10},description:'Luna',assumptions:[],caveats:[]})}]}]})};};
 const body=validateForgeRequest({action:'generate',prompt:'más cráteres',previous:'// luna hueca de prueba\nsphere(45, $fn=32);\n',previousFinish:{texture:'craters',smooth:.9,depth:1,scale:12}});
 const result=await generateForgeSource(body,{OPENAI_API_KEY:'fake-unit-test-key'},{fetcher});
 assert.deepEqual(result.finish,{texture:'craters',smooth:.9,depth:1.4,scale:10});
 assert.deepEqual(JSON.parse(sent.input.at(-1).content).acabadoAnterior,{texture:'craters',smooth:.9,depth_mm:1,scale_mm:12});
 assert.ok(sent.text.format.schema.required.includes('finish'));
 assert.throws(()=>validateForgeRequest({action:'generate',prompt:'luna',previousFinish:{texture:'lava',smooth:1,depth:1,scale:5}}),/Acabado de Forge inválido/);
});
