import {test} from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {defaults,buildModel} from '../src/model.js';
import {reviewPrint,costOf,durationText,composeRotation} from '../src/printability.js';
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
