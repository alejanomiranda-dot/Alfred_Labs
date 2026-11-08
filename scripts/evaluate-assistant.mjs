// Explicit live evaluation; never runs during npm test. Prints no credentials.
import {loadEnv} from 'vite';
import Module from 'manifold-3d';
import assert from 'node:assert/strict';
import {proposeDesign} from '../server/assistant.js';
import {defaults} from '../src/model.js';
import {checkProposal} from '../src/proposals.js';
const env=loadEnv('development',process.cwd(),'');
if(!env.OPENAI_API_KEY)throw Error('Falta la clave local configurada.');
const api=await Module();api.setup();
const pending={...defaults,shape:'circle',width:40,height:40};
const cases=[
 {name:'Rectángulo a chapita redonda',prompt:'Hacé la chapita redonda.',check:p=>{assert.equal(p.shape,'circle');assert.equal(p.width,45);assert.equal(p.height,45);}},
 {name:'Diámetro explícito',prompt:'Quiero la chapita circular de 40 mm de diámetro. Conservá el resto.',check:p=>{assert.equal(p.shape,'circle');assert.equal(p.width,40);assert.equal(p.height,40);assert.equal(p.phone,defaults.phone);assert.equal(p.name,defaults.name);}},
 {name:'Ajuste antes de aplicar',prompt:'Mejor de 35 mm y que diga LUNA.',pendingProposal:pending,history:[{role:'user',content:'Hacela redonda de 40 mm'},{role:'assistant',content:'Te propongo un círculo de 40 mm. Podés aplicarlo.'}],check:p=>{assert.equal(p.shape,'circle');assert.equal(p.width,35);assert.equal(p.height,35);assert.equal(p.name,'LUNA');}},
 {name:'Consulta sin cambios',prompt:'¿Para qué sirve el agujero de la chapita? Solo explicame, no cambies nada.',pendingProposal:pending,canApply:false},
 {name:'Ovalada conserva sus dos ejes',prompt:'Hacé la chapita ovalada de 50 mm de ancho y 35 mm de alto.',check:p=>{assert.equal(p.shape,'oval');assert.equal(p.width,50);assert.equal(p.height,35);}},
 {name:'Dorso grabado, frente conservado',prompt:'Poné un huesito grabado atrás de 0,6 mm. Conservá el frente.',check:p=>{assert.equal(p.backDecoration,'bone');assert.equal(p.backStyle,'engraved');assert.equal(p.name,defaults.name);assert.equal(p.phone,defaults.phone);}},
 {name:'Caja abierta con medidas verificadas',prompt:'Creá una caja abierta de 80 mm de ancho, 50 mm de profundidad y 30 mm de alto, paredes y fondo de 2 mm.',check:p=>{assert.equal(p.kind,'free');assert.ok(p.freeDesign);}}
];
let failed=0;
for(const c of cases){const start=Date.now();try{
 const {name,check,canApply=true,...body}=c,result=await proposeDesign({...body,params:defaults},env.OPENAI_API_KEY);
 assert.equal(result.canApply,canApply);
 if(canApply){const {candidate}=checkProposal(api,defaults,result);check(candidate);}
 console.log(JSON.stringify({case:name,status:'PASS',seconds:Math.round((Date.now()-start)/100)/10}));
}catch(error){failed++;console.log(JSON.stringify({case:c.name,status:'FAIL',error:error.message}));}}
console.log(JSON.stringify({passed:cases.length-failed,total:cases.length}));process.exitCode=failed?1:0;
