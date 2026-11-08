// Explicit API integration check, with synthetic data. Image generation is opt-in.
import {loadEnv} from 'vite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {designService} from '../server/design-service.js';
import {defaults} from '../src/model.js';
import Module from 'manifold-3d';
import {checkProposal} from '../src/proposals.js';
const api=await Module();api.setup();
const env=loadEnv('development',process.cwd(),''),params={...defaults,phone:'',name:'PRUEBA',project:'Prueba del motor creativo'};
const cases=[
 {name:'Newells',prompt:"Necesito el escudo de Newell's Old Boys de Rosario en relieve de 80 mm.",visual:true},
 {name:'Rosario Central',prompt:'Quiero el escudo de Rosario Central en una placa en relieve.',visual:true},
 {name:'Manchester United',prompt:'Haceme el escudo del Manchester United en relieve de 100 por 100 mm.',visual:true},
 {name:'Leono en relieve',prompt:'La cara de Leono de los Thundercats en relieve para una placa de 80 mm.',visual:true},
 {name:'Galaxia decorativa',prompt:'Una galaxia espiral en una placa en relieve de 100 por 100 mm.',visual:true},
 {name:'Botella con medidas',prompt:'Una botella hueca de 150 mm de alto, diámetro del cuerpo 60 mm hasta altura110, hombro hasta130 y cuello de 25 mm de diámetro hasta150, pared2 y fondo3.',visual:false}
];
let failed=0;for(const c of cases){try{const r=await designService({prompt:c.prompt,params},env);assert.equal(Boolean(r.generation),c.visual);if(c.visual){assert.equal(r.canApply,false);assert.equal(r.generation.mode,'relief');assert.ok(r.generation.subject.length>5);}else{assert.equal(r.canApply,true);assert.ok(r.params.freeDesign);checkProposal(api,params,r);}console.log(JSON.stringify({case:c.name,status:'PASS',route:r.generation?'visual':'geometry'}));}catch(error){failed++;console.log(JSON.stringify({case:c.name,status:'FAIL',error:error.message}));}}
if(process.argv.includes('--image')){try{const r=await designService({action:'generateVisual',spec:{mode:'relief',subject:'Una galaxia espiral decorativa con estrellas grandes',width:80,height:80,baseThickness:2,depth:3}},env);fs.mkdirSync('muestras',{recursive:true});fs.writeFileSync('muestras/galaxia-mapa-alturas.png',Buffer.from(r.imageDataUrl.split(',')[1],'base64'));console.log(JSON.stringify({image:'PASS',file:'muestras/galaxia-mapa-alturas.png'}));}catch(error){failed++;console.log(JSON.stringify({image:'FAIL',error:error.message}));}}
process.exitCode=failed?1:0;
