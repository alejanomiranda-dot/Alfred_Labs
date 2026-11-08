import {test} from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {defaults,buildModel,validate} from '../src/model.js';
import {checkProposal,pendingContext,proposalChanges} from '../src/proposals.js';
const api=await Module();api.setup();

test('redonda genera un círculo real de diámetro único; los rectángulos antiguos conservan su forma',()=>{
 const circular=buildModel(api,{...defaults,shape:'circle',width:40,height:32}),old=buildModel(api,defaults);
 assert.equal(circular.params.height,40);assert.equal(old.params.height,32);
 const outer=[];
 for(let i=0;i<circular.base.positions.length;i+=circular.base.numProp){const [x,y]=circular.base.positions.slice(i,i+2),r=Math.hypot(x,y);if(r>19)outer.push(r);}
 assert.ok(outer.length>100);assert.ok(outer.every(r=>Math.abs(r-20)<.00001));
 const disk=Math.PI*20**2,hole=Math.PI*2**2;
 assert.ok(Math.abs(circular.volume-(disk-hole)*defaults.thickness)>0); // relief is real volume
 assert.ok(circular.volume<40*40*defaults.thickness);
 assert.ok(old.base.positions.some((_,i)=>i%old.base.numProp===0&&Math.hypot(old.base.positions[i],old.base.positions[i+1])>23));
});
test('QR y logo en círculo caben sin cortar detalles y exportan una base circular',()=>{
 for(const kind of ['qr','logo']){const m=buildModel(api,{...defaults,kind,shape:'circle',width:50,height:50});assert.ok(m.volume>0);assert.equal(m.params.shape,'circle');}
});
test('la propuesta se verifica contra el sólido y sus ejes, sin modificar la pieza actual',()=>{
 const current=structuredClone(defaults),result={params:{shape:'circle',width:40,height:40}};
 const checked=checkProposal(api,current,result);assert.equal(checked.candidate.shape,'circle');assert.deepEqual(current,defaults);
 assert.throws(()=>checkProposal(api,current,{params:defaults}),/no contiene cambios/);
 const program={version:1,nodes:[{type:'box',size:[80,50,30],position:[0,0,0],rotation:[0,0,0]}]};
 assert.throws(()=>checkProposal(api,current,{params:{kind:'free',freeDesign:program},expectedSize:[50,80,30]}),/se esperaba/);
});
test('solo se envía una propuesta pendiente mientras la pieza siga igual, sin mallas ni contornos',()=>{
 const next={...defaults,shape:'circle',width:40,height:40,importedMesh:{private:'mesh'},logoPolygons:[[]]},snapshot=JSON.stringify(defaults);
 const context=pendingContext(defaults,next,snapshot);assert.equal(context.shape,'circle');assert.ok(!('importedMesh' in context));assert.ok(!('logoPolygons' in context));
 assert.equal(pendingContext({...defaults,name:'LUNA'},next,snapshot),undefined);
 assert.equal(pendingContext(defaults,null,snapshot),undefined);
});
test('el resumen usa nombres de la persona y distingue círculo de rectángulo redondeado',()=>{
 const next=validate({...defaults,shape:'circle',width:40,name:'LUNA'}),changes=proposalChanges(defaults,next);
 assert.ok(changes.includes('Forma: Redonda · círculo'));assert.ok(changes.includes('Nombre: MORA → LUNA'));assert.ok(changes.some(t=>t==='Alto: 32 → 40 mm'));
});
