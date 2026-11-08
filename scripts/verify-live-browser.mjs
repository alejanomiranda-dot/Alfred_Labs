// Explicit live acceptance check. Uses the existing local server and OpenAI credit.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import Module from 'manifold-3d';
import {validate,buildModel} from '../src/model.js';

const url='http://127.0.0.1:5173',directory='artifacts/live';
const status=await (await fetch(url+'/api/forge')).json();
assert.ok(status.local&&status.compiler&&status.ai,'Iniciá npm run dev con OpenSCAD y la clave local configurados.');
await fs.mkdir(directory,{recursive:true});
const api=await Module();api.setup();
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
const errors=[],report={date:new Date().toISOString(),checks:[]};
page.on('pageerror',error=>errors.push(error.message));
function passed(check,details={}){report.checks.push({check,...details});console.log(JSON.stringify({check,status:'PASS',...details}));}
async function download(selector,name){const event=page.waitForEvent('download');await page.locator(selector).click();const file=await event;const target=directory+'/'+name;await file.saveAs(target);return target;}
async function project(name){
 if(!await page.locator('.fabrication-panel').evaluate(element=>element.open))await page.locator('.fabrication-panel>summary').click();
 const file=await download('#exportProject',name+'.json');
 const params=validate(JSON.parse(await fs.readFile(file,'utf8'))),model=buildModel(api,params);
 assert.ok(model.volume>0);return {params,model};
}
async function forge(prompt){
 await page.locator('#forgePrompt').fill(prompt);
 const event=page.waitForResponse(r=>r.url().endsWith('/api/forge')&&r.request().method()==='POST',{timeout:345000});
 await page.locator('#forgeGenerate').click();const response=await event,data=await response.json();
 assert.ok(response.ok(),data.error||'Forge falló');
 await page.waitForFunction(()=>document.getElementById('forgeStop').hidden,{},{timeout:90000});
 assert.match(await page.locator('#forgeProgress').textContent(),/^Vista previa lista/);
}
async function chat(prompt){
 await page.locator('#assistantPrompt').fill(prompt);await page.locator('#askAssistant').click();
 await page.waitForFunction(()=>document.getElementById('stopAssistant').hidden,{},{timeout:160000});
}
try{
 await page.goto(url);await page.waitForSelector('#startForge');
 const initial=await page.locator('#dimensions').textContent();
 await page.locator('#startForge').click();await page.waitForFunction(()=>!document.getElementById('forgeGenerate').disabled);
 await forge('Creá un bloque rectangular macizo de 30 mm de ancho, 20 mm de profundidad y 10 mm de alto, con un agujero vertical pasante de 4 mm de diámetro centrado. Apoyado en z=0, sin texto, sin redondeos ni otros detalles.');
 assert.match(await page.locator('#proposalSummary').textContent(),/30 × 20 × 10/);
 await page.locator('[data-ghost="current"]').click();assert.equal(await page.locator('#dimensions').textContent(),initial);
 await page.locator('[data-ghost="proposal"]').click();
 await download('#forgeBundle','bloque-inicial.zip');passed('Forge: generación real, geometría verificada y diseño anterior conservado');
 await forge('Conservá exactamente el bloque de 30 por 20 mm y el agujero centrado pasante de 4 mm de diámetro. Cambiá únicamente el alto total a 18 mm; el agujero debe seguir atravesando todo el alto.');
 assert.match(await page.locator('#proposalSummary').textContent(),/30 × 20 × 18/);
 await download('#forgeBundle','bloque-corregido.zip');
 await page.locator('#applyProposal').click();
 const block=await project('bloque-corregido');assert.deepEqual(block.model.dimensions.map(Math.round),[30,20,18]);assert.equal(block.params.forge.revisions.length,2);
 assert.ok(Math.abs(block.model.volume-(30*20-Math.PI*4)*18)<3);
 await page.screenshot({path:directory+'/forge-real.png',fullPage:true});passed('Forge: corrección real, agujero conservado, dos versiones y proyecto reconstruible',{dimensions:block.model.dimensions});

 await page.locator('#cadMode').click();await page.locator('#startBlank').click();
 await chat('Creá una caja rectangular abierta arriba de 80 mm de ancho exterior, 50 mm de profundidad exterior y 30 mm de alto exterior. Paredes de 2 mm y fondo de 2 mm, sin tapa, sin textos ni otros detalles.');
 assert.equal(await page.locator('#applyProposal').isVisible(),true,await page.locator('#assistantReply').textContent());
 await page.locator('#applyProposal').click();const box=await project('caja-cad');assert.deepEqual(box.model.dimensions.map(Math.round),[80,50,30]);
 passed('Guía CAD: OpenAI a sólido de medidas comprobadas',{dimensions:box.model.dimensions});

 if(process.argv.includes('--image')){
  await page.locator('#startBlank').click();await page.locator('#designMode').selectOption('relief');
  await chat('Una luna creciente y tres estrellas grandes, en relieve monocromo sobre una placa rectangular de 60 por 50 mm, base de 2 mm y profundidad de 3 mm. Es un adorno plano con dorso plano.');
  await page.waitForFunction(()=>!document.getElementById('visualDesigner').hidden);
  await page.locator('#visualWidth').fill('60');await page.locator('#visualHeight').fill('50');
  await page.locator('#visualBase').fill('2');await page.locator('#visualDepth').fill('3');
  let calls=0;page.on('request',request=>{if(request.url().endsWith('/api/assistant')&&request.method()==='POST')calls++;});
  const imageResponse=page.waitForResponse(r=>r.url().endsWith('/api/assistant')&&r.request().postDataJSON()?.action==='generateVisual',{timeout:180000});
  await page.locator('#generateVisual').click();const response=await imageResponse,data=await response.json();assert.ok(response.ok(),data.error||'Falló la generación visual');
  await fs.writeFile(directory+'/luna-mapa-alturas.png',Buffer.from(data.imageDataUrl.split(',')[1],'base64'));
  await page.waitForFunction(()=>document.getElementById('visualStatus').textContent.startsWith('Relieve 3D construido'),{},{timeout:90000});
  const beforeRebuild=calls;await page.locator('#visualDesigner>summary').click();await page.locator('#visualDepth').fill('4');await page.locator('#rebuildRelief').click();
  await page.waitForFunction(()=>document.getElementById('visualStatus').textContent.startsWith('Relieve 3D construido'));
  assert.equal(calls,beforeRebuild);
  await page.locator('#applyProposal').click();const relief=await project('luna-relieve');assert.deepEqual(relief.model.dimensions.slice(0,2).map(Math.round),[60,50]);assert.equal(relief.params.sourceInfo.depth,4);assert.equal(relief.params.forge,null);
  await download('#exportStl','luna-relieve.stl');
  await page.screenshot({path:directory+'/relieve-real.png',fullPage:true});passed('Relieve: imagen real de OpenAI, sólido cerrado, ajuste sin otra llamada y exportación',{dimensions:relief.model.dimensions,triangles:relief.model.combined.triangles.length/3});
 }
 await page.setViewportSize({width:390,height:844});await page.locator('[data-workspace-view="chat"]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:directory+'/mobile-real.png',fullPage:true});assert.deepEqual(errors,[]);passed('Navegador: sin errores JavaScript y sin desborde móvil');
 await fs.writeFile(directory+'/resultado.json',JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:directory+'/fallo.png',fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();}
