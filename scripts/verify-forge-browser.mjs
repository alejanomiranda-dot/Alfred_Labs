// Optional real-browser verification. Uses sample only: never spends OpenAI credit.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const port=5174,url='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
let browser;
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Vite no inició: '+logs)),15000);server.once('exit',()=>{clearTimeout(timer);reject(Error('Vite terminó: '+logs));});server.stdout.on('data',()=>{if(logs.includes('Local:')){clearTimeout(timer);resolve();}});});
 browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForSelector('#startForge');
 const initial=await page.locator('#dimensions').textContent();
 await page.locator('#startForge').click();await page.waitForFunction(()=>!document.getElementById('forgeExample').disabled);
 const sampleResponse=page.waitForResponse(r=>r.url().endsWith('/api/forge')&&r.request().method()==='POST');
 await page.locator('#forgeExample').click();await page.waitForFunction(()=>document.getElementById('forgeProgress').textContent.startsWith('Vista previa lista'),{},{timeout:90000});
 const sampleResult=await (await sampleResponse).json();
 assert.match(await page.locator('#proposalSummary').textContent(),/78 × 78 × 140/);
 await page.locator('[data-ghost="current"]').click();assert.equal(await page.locator('#dimensions').textContent(),initial);
 await page.locator('[data-ghost="proposal"]').click();
 await fs.mkdir('artifacts/forge',{recursive:true});await page.screenshot({path:'artifacts/forge/preview.png',fullPage:true});
 const sourcePromise=page.waitForEvent('download');await page.locator('#forgeSource').click();const source=await sourcePromise;await source.saveAs('artifacts/forge/sample.scad');assert.match(await fs.readFile('artifacts/forge/sample.scad','utf8'),/VERO/);
 const zipPromise=page.waitForEvent('download');await page.locator('#forgeBundle').click();await (await zipPromise).saveAs('artifacts/forge/sample.zip');
 // Simulated provider failure must retain the pending proposal and original project.
 await page.route('**/api/forge',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{local:true,compiler:true,ai:true}});
  if(route.request().postDataJSON().action==='generate')return route.fulfill({status:422,json:{error:'Error de compilación simulado'}});
  return route.continue();
 });
 await page.locator('#forgeRefresh').click();await page.waitForFunction(()=>!document.getElementById('forgeGenerate').disabled);
 await page.locator('#forgePrompt').fill('Hacelo más alto');await page.locator('#forgeGenerate').click();await page.waitForFunction(()=>document.getElementById('forgeProgress').textContent.includes('Error de compilación simulado'));
 assert.equal(await page.locator('#proposalCard').isVisible(),true);assert.equal(await page.locator('#applyProposal').isEnabled(),true);
 await page.unroute('**/api/forge');
 await page.locator('#applyProposal').click();assert.match(await page.locator('#dimensions').textContent(),/78.*78.*140/);
 await page.locator('#forgeRestore').click();await page.waitForFunction(()=>document.getElementById('forgeStop').hidden,{},{timeout:90000});
 await page.locator('#discardProposal').click();assert.match(await page.locator('#dimensions').textContent(),/78.*78.*140/);
 await page.locator('#saveQuick').click();await page.waitForFunction(()=>document.getElementById('savedCount').textContent==='1');
 await page.locator('#libraryToggle').click();await page.locator('.library-card button').filter({hasText:'Abrir'}).first().click();assert.match(await page.locator('#forgeCode').textContent(),/VERO/);
 await page.setViewportSize({width:390,height:844});await page.locator('[data-workspace-view="chat"]').click();await page.screenshot({path:'artifacts/forge/mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.setViewportSize({width:1440,height:1000});
 let remoteHeaders;
 await page.route('**/api/forge',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{local:false,remote:true,enabled:true,compiler:true,ai:true,needsCode:false}});
  remoteHeaders=route.request().headers();return route.fulfill({json:{...sampleResult,remote:true}});
 });
 await page.locator('#forgeRefresh').click();
 assert.equal(await page.locator('#forgeAccess').count(),0);
 assert.equal(await page.locator('#accessPanel').count(),0);
 await page.waitForFunction(()=>!document.getElementById('forgeGenerate').disabled);
 await page.locator('#forgeExample').click();await page.waitForFunction(()=>document.getElementById('forgeProgress').textContent.startsWith('Vista previa lista'));
 assert.equal(remoteHeaders['x-access-code'],undefined);await page.screenshot({path:'artifacts/forge/online-ui.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('FORGE BROWSER OK: preview, compare, failure preserves proposal, apply, downloads, restore, discard, library, mobile, remote flow without access code.');
}catch(e){console.error(logs);throw e;}finally{await browser?.close();server.kill();}
