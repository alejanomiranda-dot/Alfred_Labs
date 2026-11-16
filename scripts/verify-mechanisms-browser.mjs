// Regression through the real UI, with a tiny mobile body that must never be removed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {runForge} from '../server/forge.js';
import {validate,buildModel} from '../src/model.js';
import {countParts} from '../src/printability.js';
import Module from 'manifold-3d';
const url=process.env.LIVE_URL||'http://127.0.0.1:5173',dir='artifacts/premium-20261116/browser';await fs.mkdir(dir,{recursive:true});
const compiled=await runForge({action:'compile',scad:'// Dos cuerpos: el pequeno ocupa menos del 2% de la superficie\ncube([40,40,8]);translate([40.4,0,0])cube([2,2,3]);'});
const result={...compiled,manufacturing:{mode:'print_in_place',expectedParts:2,clearance:.4,minWall:1.2},finish:{texture:'none',smooth:0,depth:0,scale:8}};
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];let forgeCalls=0,critiques=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/assistant',route=>{const body=route.request().postDataJSON();if(body.action==='critique')critiques++;return route.fulfill({json:{route:'forge',message:'Preparo el mecanismo de prueba.',forgePrompt:'Mecanismo de dos cuerpos',canApply:false,params:{},expectedSize:null,generation:null}});});
 await page.route('**/api/forge',route=>{if(route.request().method()==='GET')return route.fulfill({json:{local:true,compiler:true,ai:true}});forgeCalls++;return route.fulfill({json:result});});
 await page.goto(url);await page.waitForFunction(()=>document.body.dataset.mode==='empty');
 await page.locator('#prompt').fill('Un mecanismo articulado');await page.locator('#askAssistant').click();
 await page.waitForFunction(()=>document.getElementById('stopAssistant').hidden&&document.body.dataset.mode==='working');
 await page.waitForFunction(()=>document.getElementById('pieceStatus').textContent.includes('Prototipo para laminar'));
 assert.equal(forgeCalls,1,'no fusionar ni borrar el cuerpo pequeño');assert.equal(critiques,0,'la crítica estética no puede rediseñar el mecanismo');
 assert.equal(await page.locator('#pieceControls h3',{hasText:/^Acabado$/}).count(),0);
 await page.locator('#printOpen').click();assert.match(await page.locator('#supportStep').textContent(),/Evitá soportes dentro/);
 assert.match(await page.locator('#printReview').textContent(),/0.400 mm/);
 await page.locator('#printDialog summary',{hasText:'Más formatos'}).click();
 const download=page.waitForEvent('download');await page.locator('#exportProject').click();const file=dir+'/mecanismo.json';await(await download).saveAs(file);
 const params=validate(JSON.parse(await fs.readFile(file,'utf8'))),api=await Module();api.setup();assert.equal(countParts(buildModel(api,params).combined),2);
 await page.locator('#printDialog [data-close]').click();
 // Inspect the actual generated hinge rather than only the synthetic regression.
 const real=process.env.MECHANISM_PROJECT||'artifacts/premium-20261116/mejorado/bisagra.json';
 await page.locator('#importProject').setInputFiles(real);await page.waitForFunction(()=>/60 × 30 × 10/.test(document.getElementById('dimensions').textContent));
 await page.waitForFunction(()=>document.getElementById('pieceStatus').textContent.includes('Prototipo para laminar'));
 await page.screenshot({path:dir+'/bisagra.png',fullPage:true});
 await page.locator('#printOpen').click();await page.screenshot({path:dir+'/revision-bisagra.png',fullPage:true});await page.locator('#printDialog [data-close]').click();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:dir+'/mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('MECANISMOS UI OK: cuerpos pequeños conservados, sin acabado ni retoque estético, holgura visible, exportación íntegra, apertura de bisagra real y móvil sin desborde.');
}catch(error){console.error(error.message);throw error;}finally{await browser.close();}
