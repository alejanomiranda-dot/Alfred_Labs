// Verificación en navegador real del estudio unificado. Las respuestas de IA se simulan: no consume crédito de OpenAI.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {qrFromExport} from './keychain-qr-check.mjs';
const port=5174,url='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
let browser;
const node=o=>({type:'box',face:'top',offset:[0,0],color:'',font:'',icon:'',size:[1,1,1],wallThickness:2,floorThickness:0,radius:1,radiusTop:1,height:1,points:[],text:'',fontSize:5,inputs:[],position:[0,0,0],rotation:[0,0,0],...o});
const reply=o=>({route:'chat',forgePrompt:'',designSource:'current',generation:null,imageReading:'',imageDifferences:'',proportionCheck:'',message:'',canApply:false,expectedSize:null,params:{},...o});
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Vite no inició: '+logs)),15000);server.once('exit',()=>{clearTimeout(timer);reject(Error('Vite terminó: '+logs));});server.stdout.on('data',()=>{if(logs.replace(/\x1b\[[0-9;]*m/g,'').includes('Local:')){clearTimeout(timer);resolve();}});});
 browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.showSaveFilePicker=undefined;});
 await fs.mkdir('artifacts/forge',{recursive:true});
 const dims=()=>page.locator('#dimensions').textContent();
 const lastAssistant=()=>page.locator('.msg.assistant').last().textContent();
 const idle=()=>page.waitForFunction(()=>document.getElementById('stopAssistant').hidden,{},{timeout:120000});
 const send=async text=>{await page.locator('#prompt').fill(text);await page.locator('#askAssistant').click();await idle();};
 let assistantReply=null,assistantBodies=[],forgeBodies=[],forgeGenerate=null,forgeHeaders=null;
 await page.route('**/api/assistant',route=>{const body=route.request().postDataJSON();assistantBodies.push(body);if(!assistantReply)return route.abort();return route.fulfill({json:typeof assistantReply==='function'?assistantReply(body):assistantReply});});
 await page.route('**/api/forge',route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{local:true,compiler:true,ai:true}});
  const body=route.request().postDataJSON();forgeBodies.push(body);forgeHeaders=route.request().headers();
  if(body.action==='generate'&&forgeGenerate)return route.fulfill(forgeGenerate);
  return route.continue();
 });

 // 1. Inicio: una sola pregunta, sin menús de opciones ni motores.
 await page.goto(url);await page.waitForFunction(()=>document.body.dataset.mode==='empty');
 assert.equal(await page.locator('#hero h1').textContent(),'¿Qué querés imprimir?');
 for(const old of ['#forgeMode','#cadMode','#startTemplate','#applyProposal','#designMode'])assert.equal(await page.locator(old).count(),0,old+' no debe existir');
 await page.screenshot({path:'artifacts/forge/inicio.png'});

 // 2. Pieza de ejemplo: se aplica directo, sin «Aplicar».
 const sampleResponse=page.waitForResponse(r=>r.url().endsWith('/api/forge')&&r.request().method()==='POST');
 await page.locator('#tryExample').click();await idle();
 const sampleResult=await (await sampleResponse).json();
 assert.match(await dims(),/78 × 78 × 140/);assert.equal(await page.evaluate(()=>document.body.dataset.mode),'working');
 await page.locator('summary',{hasText:'Avanzado · versiones'}).click();assert.match(await page.locator('.forge-code').textContent(),/VERO/);
 const sourcePromise=page.waitForEvent('download');await page.locator('button',{hasText:'Descargar fuente .scad'}).click();await (await sourcePromise).saveAs('artifacts/forge/sample.scad');
 assert.match(await fs.readFile('artifacts/forge/sample.scad','utf8'),/VERO/);
 await page.screenshot({path:'artifacts/forge/ejemplo.png'});

 // 3. Deshacer y rehacer.
 await page.locator('#undo').click();assert.equal(await dims(),'');assert.equal(await page.locator('#stageEmpty').isVisible(),true);
 await page.locator('#redo').click();assert.match(await dims(),/78 × 78 × 140/);

 // 4. Un error del generador avanzado conserva la pieza; la corrección envía la fuente anterior.
 assistantReply=reply({route:'forge',forgePrompt:'Árbol de 160 mm de alto',message:'Lo hago más alto con el generador avanzado.'});
 forgeGenerate={status:422,json:{error:'Error de compilación simulado'}};
 await send('Hacelo más alto');
 assert.match(await lastAssistant(),/Error de compilación simulado/);assert.match(await dims(),/78 × 78 × 140/);
 forgeGenerate={status:200,json:{...sampleResult,remote:true}};
 await send('Probá de nuevo');
 assert.match(forgeBodies.at(-1).previous,/VERO/);assert.equal(forgeHeaders['x-access-code'],undefined);assert.match(await dims(),/78 × 78 × 140/);

 // 5. Guardar en «Mis diseños».
 await page.locator('#saveVersion').click();await page.waitForFunction(()=>document.getElementById('savedCount').textContent==='1');
 assert.equal(await page.locator('#savedState').textContent(),'Guardado');

 // 6. Pieza por medidas: reemplaza la anterior sin arrastrar su malla ni sus versiones.
 assistantReply=b=>reply({route:'cad',message:'Te armo una caja abierta de 120 × 80 × 40 mm.',canApply:true,expectedSize:[120,80,40],params:{...b.params,kind:'free',project:'Caja organizadora',freeDesign:{version:1,nodes:[node({type:'open_box',size:[120,80,40]})]}}});
 await send('Mejor una caja organizadora de 120 × 80 × 40 mm');
 assert.match(await dims(),/120 × 80 × 40/);
 assert.equal(await page.locator('summary',{hasText:'Avanzado · versiones'}).count(),0);
 assert.equal(await page.locator('#project').inputValue(),'Caja organizadora');

 // 7. Plantilla: chapita; los ajustes del panel cambian la pieza al instante.
 assistantReply=b=>reply({route:'template',message:'Te la dejo redonda de 40 mm con TOBY.',canApply:true,params:{...b.params,kind:'tag',name:'TOBY',shape:'circle',width:40,height:40,freeDesign:null}});
 await send('Ahora una chapita redonda de 40 mm que diga TOBY');
 assert.match(await dims(),/^40 × 40/);
 await page.locator('#pieceControls input[type=range]').first().fill('60');await page.waitForFunction(()=>/^60 × 60/.test(document.getElementById('dimensions').textContent));
 await page.locator('#undo').click();assert.match(await dims(),/^40 × 40/);
 await page.screenshot({path:'artifacts/forge/chapita.png'});

 // 8. Relieve con imagen adjunta: no genera otra imagen; las medidas se cambian sin volver a generar.
 const moon=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d');ctx.fillStyle='black';ctx.fillRect(0,0,32,32);ctx.fillStyle='white';ctx.beginPath();ctx.arc(16,16,10,0,Math.PI*2);ctx.fill();return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#imageFile').setInputFiles({name:'luna.png',mimeType:'image/png',buffer:Buffer.from(moon,'base64')});
 await page.waitForFunction(()=>!document.getElementById('attachments').hidden);
 assistantReply=reply({route:'relief',message:'Paso la luna a relieve de 60 × 50 mm.',generation:{mode:'relief',subject:'Luna de prueba',width:60,height:50,baseThickness:2,depth:3}});
 await send('Convertí la luna adjunta en relieve de 60 por 50 mm');
 assert.match(await dims(),/^60 × 50/);assert.ok(assistantBodies.at(-1).imageDataUrl.startsWith('data:image/'));
 assert.equal(assistantBodies.filter(b=>b.action==='generateVisual').length,0);
 assert.ok(await page.locator('h3',{hasText:'Tamaño del relieve'}).count());
 await page.locator('#printOpen').click();await page.locator('#printDialog summary',{hasText:'Más formatos'}).click();
 const projectPromise=page.waitForEvent('download');await page.locator('#exportProject').click();await (await projectPromise).saveAs('artifacts/forge/relieve.json');
 const restored=JSON.parse(await fs.readFile('artifacts/forge/relieve.json','utf8'));assert.equal(restored.sourceInfo.subject,'Luna de prueba');assert.equal(restored.forge,null);
 await page.locator('#printDialog [data-close]').click();

 // 9. Llavero logo + QR: directo en el navegador, sin pedir nada a la IA.
 page.once('dialog',d=>d.accept());await page.locator('#newProject').click();await page.waitForFunction(()=>document.body.dataset.mode==='empty');
 const calls=assistantBodies.length;assistantReply=null;
 const logo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');for(const [color,x] of [['#602682',8],['#cd3d97',24],['#ffa543',40]]){ctx.fillStyle=color;ctx.fillRect(x,8,16,48);}return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#imageFile').setInputFiles({name:'logo-test.png',mimeType:'image/png',buffer:Buffer.from(logo,'base64')});
 await send('Un llavero con mi logo adelante y un QR atrás a mutualunir.com');
 assert.match(await dims(),/^50 × 60/);assert.equal(assistantBodies.length,calls);
 await page.locator('#viewBack').click();await page.screenshot({path:'artifacts/forge/llavero-dorso.png'});
 await page.locator('#printOpen').click();
 const keychainPromise=page.waitForEvent('download');await page.locator('#export3mf').click();await (await keychainPromise).saveAs('artifacts/forge/llavero.3mf');
 assert.equal(qrFromExport(await fs.readFile('artifacts/forge/llavero.3mf'),42),'https://mutualunir.com/');
 await page.locator('#printDialog [data-close]').click();

 // 10. Abrir desde «Mis diseños» recupera la pieza de Forge guardada.
 await page.locator('#libraryToggle').click();await page.locator('.library-card button',{hasText:'Abrir'}).first().click();
 assert.match(await dims(),/78 × 78 × 140/);

 // 11. Temas y celular.
 await page.locator('#themeToggle').click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
 await page.locator('#themeToggle').click();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
 await page.screenshot({path:'artifacts/forge/oscuro.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Sin desborde horizontal en celular');
 await page.screenshot({path:'artifacts/forge/celular.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('ESTUDIO OK: inicio, ejemplo, deshacer, error de Forge sin perder la pieza, corrección con fuente previa, guardar, caja por medidas, chapita y panel, relieve sin generar imagen, llavero con QR leído del 3MF, biblioteca, temas y celular.');
}catch(e){console.error(logs.slice(-3000));throw e;}finally{await browser?.close();server.kill();}
