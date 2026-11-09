import {test} from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {defaults,buildModel} from '../src/model.js';
import {reviewPrint,costOf,durationText,composeRotation,countParts,partsOf,keepParts} from '../src/printability.js';
const api=await Module();api.setup();
const node=(type,extra={})=>({type,position:[0,0,0],rotation:[0,0,0],...extra});
const free=(nodes,extra={})=>buildModel(api,{...defaults,kind:'free',freeDesign:{version:1,nodes},...extra});
test('maceta boca arriba no necesita soportes; invertida se sugiere darla vuelta',()=>{
 const pot=node('open_cylinder',{radius:35,radiusTop:35,height:60,wallThickness:2,floorThickness:3});
 const up=reviewPrint(free([pot]).combined,free([pot]).volume);assert.equal(up.issues.length,0);assert.equal(up.suggestion,null);assert.ok(up.grams>25&&up.grams<45);
 const down=free([{...pot,rotation:[180,0,0]}]),r=reviewPrint(down.combined,down.volume);
 assert.ok(r.issues.some(i=>i.kind==='overhang'));assert.ok(r.suggestion);
 const fixed=free([{...pot,rotation:[180,0,0]}],{printRotation:composeRotation([0,0,0],r.suggestion.rotation)});
 assert.equal(reviewPrint(fixed.combined,fixed.volume).issues.length,0);
});
test('paredes finas se avisan; costo, precio y duración se calculan',()=>{
 const thin=free([node('open_box',{size:[40,30,20],wallThickness:.5})]),r=reviewPrint(thin.combined,thin.volume);
 assert.ok(r.issues.some(i=>i.kind==='thin'));
 const c=costOf({grams:100,seconds:7200},{pricePerKg:20000,hourly:100,extra:50,margin:50});
 assert.equal(c.material,2000);assert.equal(c.cost,2250);assert.equal(c.price,3375);
 assert.equal(durationText(3900),'1 h 05 min');assert.equal(durationText(600),'10 min');
 assert.deepEqual(composeRotation([90,0,0],[90,0,0]),[180,0,0]);
});
test('prueba de encaje: una franja de la pieza con sus colores, apoyada en la mesa',async()=>{
 const {fitCoupon}=await import('../src/solid-program.js');
 const pot=free([node('open_cylinder',{radius:35,radiusTop:35,height:60,wallThickness:2,floorThickness:3})]);
 const ring=fitCoupon(api,pot,40,5);assert.deepEqual(ring.dimensions.map(Math.round),[70,70,5]);assert.ok(Math.abs(ring.volume-Math.PI*(35**2-33**2)*5)<5);
 const tag=fitCoupon(api,buildModel(api,defaults),0,3);assert.equal(tag.parts.length,2);
 assert.throws(()=>fitCoupon(api,pot,70,5),/por encima/);
});
test('las partes que no se tocan se cuentan y se avisan',()=>{
 const cube=(x)=>{const v=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]].flatMap(([a,b,c])=>[a+x,b,c]);return v;};
 const faces=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
 const two={positions:new Float32Array([...cube(0),...cube(5)]),numProp:3,triangles:new Uint32Array([...faces,...faces.map(i=>i+8)])};
 const one={positions:new Float32Array(cube(0)),numProp:3,triangles:new Uint32Array(faces)};
 assert.equal(countParts(two),2);assert.equal(countParts(one),1);
});
test('las partes se ordenan por tamaño y se pueden quitar las chicas',()=>{
 const box=(x,s)=>[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]].flatMap(([a,b,c])=>[a*s+x,b*s,c*s]);
 const faces=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
 const mesh={positions:new Float32Array([...box(20,1),...box(0,10)]),numProp:3,triangles:new Uint32Array([...faces,...faces.map(i=>i+8)])};
 const parts=partsOf(mesh);assert.equal(parts.length,2);assert.ok(parts[0].area>parts[1].area*50);assert.deepEqual(parts[1].min.map(Math.round),[20,0,0]);
 assert.equal(countParts(keepParts(mesh,[parts[0]])),1);
});
