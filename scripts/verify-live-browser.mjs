// Prueba en vivo con IA real: usa el servidor local (npm run dev) y consume crédito de OpenAI.
// Comprueba que un único chat elija el camino correcto: medidas, generador avanzado y relieve (--image).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import Module from 'manifold-3d';
import {validate,buildModel} from '../src/model.js';
import {countParts} from '../src/printability.js';

const url=process.env.LIVE_URL||'http://127.0.0.1:5173',directory='artifacts/live';
const status=await (await fetch(url+'/api/forge')).json();
assert.ok(status.local&&status.compiler&&status.ai,'Iniciá npm run dev con OpenSCAD y la clave local configurados.');
await fs.mkdir(directory,{recursive:true});
const api=await Module();api.setup();
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
await page.addInitScript(()=>{window.showSaveFilePicker=undefined;});
const errors=[],report={date:new Date().toISOString(),checks:[]};
page.on('pageerror',error=>errors.push(error.message));
const routes=[];page.on('response',async r=>{if(r.url().endsWith('/api/assistant')&&r.request().method()==='POST'&&!r.request().postDataJSON()?.action){try{routes.push((await r.json()).route);}catch{}}});
function passed(check,details={}){report.checks.push({check,...details});console.log(JSON.stringify({check,status:'PASS',...details}));}
async function chat(prompt){await page.locator('#prompt').fill(prompt);await page.locator('#askAssistant').click();await page.waitForFunction(()=>document.getElementById('stopAssistant').hidden,{},{timeout:400000});}
async function project(name){
 await page.locator('#printOpen').click();
 if(!await page.locator('#printDialog details.more').evaluate(e=>e.open))await page.locator('#printDialog summary',{hasText:'Más formatos'}).click();
 const event=page.waitForEvent('download');await page.locator('#exportProject').click();const file=directory+'/'+name+'.json';await (await event).saveAs(file);
 await page.locator('#printDialog [data-close]').click();
 const params=validate(JSON.parse(await fs.readFile(file,'utf8'))),model=buildModel(api,params);assert.ok(model.volume>0);return {params,model};
}
const newProject=async()=>{page.once('dialog',d=>d.accept());await page.locator('#newProject').click();await page.waitForFunction(()=>document.body.dataset.mode==='empty');};
try{
 await page.goto(url);await page.waitForFunction(()=>document.body.dataset.mode==='empty');

 await chat('Una caja rectangular abierta arriba de 80 mm de ancho exterior, 50 mm de profundidad exterior y 30 mm de alto exterior. Paredes de 2 mm y fondo de 2 mm, sin tapa, sin textos ni otros detalles.');
 const box=await project('caja');assert.deepEqual(box.model.dimensions.map(Math.round),[80,50,30],await page.locator('.msg.assistant').last().textContent());
 assert.equal(routes.at(-1),'cad');passed('Medidas: el chat eligió modelado preciso y la caja mide 80 × 50 × 30',{dimensions:box.model.dimensions});

 await newProject();
 await chat('Un gato sentado estilizado de unos 60 mm de alto, de un solo color, con una base plana para apoyarlo en la cama. Es un adorno de escritorio.');
 assert.equal(routes.at(-1),'forge',await page.locator('.msg.assistant').last().textContent());
 const cat=await project('gato');assert.ok(cat.params.forge?.revisions.length>=1);
 const askedBefore=routes.length;await chat('Hacelo de 80 mm de alto, el resto igual.');
 assert.deepEqual(routes.slice(askedBefore),['forge'],'La corrección de una pieza de Forge debe ir directo a Forge');
 const taller=await project('gato-80');assert.ok(taller.params.forge.revisions.length>cat.params.forge.revisions.length);assert.ok(Math.abs(taller.model.dimensions[2]-80)<8,'Alto '+taller.model.dimensions[2]);assert.equal(countParts(taller.model.combined),1,'El gato debe ser una sola pieza');
 await page.screenshot({path:directory+'/forge-real.png'});passed('Forma orgánica: el chat eligió el generador avanzado y corrigió sobre la versión anterior',{dimensions:taller.model.dimensions});

 if(process.argv.includes('--image')){
  await newProject();
  let calls=0;page.on('request',r=>{if(r.url().endsWith('/api/assistant')&&r.method()==='POST')calls++;});
  await chat('Una luna creciente y tres estrellas grandes en relieve sobre una placa de 60 por 50 mm, base de 2 mm y profundidad de 3 mm. Adorno plano con dorso plano.');
  assert.equal(routes.at(-1),'relief');
  const before=calls;await page.locator('#pieceControls input[type=range]').nth(3).fill('4');await page.waitForTimeout(1500);assert.equal(calls,before);
  const relief=await project('luna');assert.deepEqual(relief.model.dimensions.slice(0,2).map(Math.round),[60,50]);assert.equal(relief.params.sourceInfo.depth,4);
  await page.screenshot({path:directory+'/relieve-real.png'});passed('Relieve: imagen real, sólido cerrado y ajuste de profundidad sin otra llamada',{dimensions:relief.model.dimensions});
 }
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:directory+'/celular-real.png',fullPage:true});assert.deepEqual(errors,[]);passed('Navegador: sin errores JavaScript y sin desborde en celular');
 await fs.writeFile(directory+'/resultado.json',JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:directory+'/fallo.png',fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();}
