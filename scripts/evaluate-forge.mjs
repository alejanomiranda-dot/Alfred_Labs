// Evaluación de piezas reales pedidas como un principiante. Consume crédito de OpenAI.
// Uso: LIVE_URL=http://127.0.0.1:5176 node scripts/evaluate-forge.mjs [número de pedido]
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import Module from 'manifold-3d';
import {validate,buildModel} from '../src/model.js';
import {reviewPrint,countParts} from '../src/printability.js';

const url=process.env.LIVE_URL||'http://127.0.0.1:5173',directory='artifacts/forge-eval/'+(process.env.EVAL_TAG||'actual');
const requests=[
 {name:'gato',prompt:'Un gato sentado de 80 mm de alto para decorar mi escritorio',size:[0,0,80]},
 {name:'buho',prompt:'Un búho de unos 60 mm de alto',size:[0,0,60]},
 {name:'dinosaurio',prompt:'Un dinosaurio tipo T-rex parado, de 100 mm de largo',size:[100,0,0]},
 {name:'soporte',prompt:'Un soporte para apoyar el celular en el escritorio',size:[0,0,0]},
 {name:'maceta',prompt:'Una maceta redonda de 10 cm de diámetro y 9 cm de alto con agujero de drenaje',size:[100,100,90]},
 {name:'llavero',prompt:'Un llavero con el nombre SOFÍA',size:[0,0,0]}
];
const only=process.argv[2]?[requests[Number(process.argv[2])-1]]:requests;
await fs.mkdir(directory,{recursive:true});
const api=await Module();api.setup();
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report=[];
try{
 for(const r of only){
  const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
  await page.addInitScript(()=>{window.showSaveFilePicker=undefined;try{localStorage.setItem('alfred-theme','light');}catch{}});
  const routes=[],forgeCalls=[],critiques=[];
  page.on('response',async res=>{const u=res.url();if(res.request().method()!=='POST')return;try{if(u.endsWith('/api/assistant')){const d=await res.json();if(res.request().postDataJSON()?.action==='critique')critiques.push(d.score+': '+d.verdict);else routes.push(d.route);}if(u.endsWith('/api/forge'))forgeCalls.push(res.status());}catch{}});
  await page.goto(url);await page.waitForFunction(()=>document.body.dataset.mode==='empty');
  const started=Date.now();
  await page.locator('#prompt').fill(r.prompt);await page.locator('#askAssistant').click();
  await page.waitForFunction(()=>document.getElementById('stopAssistant').hidden&&document.body.dataset.mode==='working',{},{timeout:900000});
  const seconds=Math.round((Date.now()-started)/1000);
  const messages=await page.locator('.msg.assistant').allTextContents();
  const entry={name:r.name,prompt:r.prompt,seconds,routes,forgeCalls,critiques,messages};
  if(await page.locator('#dimensions').textContent()){
   await page.waitForTimeout(800);await page.screenshot({path:`${directory}/${r.name}-3d.png`});
   for(const view of ['viewFront','viewBack']){await page.locator('#'+view).click();await page.waitForTimeout(400);await page.screenshot({path:`${directory}/${r.name}-${view==='viewFront'?'arriba':'abajo'}.png`,clip:{x:360,y:56,width:780,height:944}});}
   await page.locator('#viewPerspective').click();
   await page.locator('#printOpen').click();await page.locator('#printDialog summary',{hasText:'Más formatos'}).click();
   const event=page.waitForEvent('download');await page.locator('#exportProject').click();const file=`${directory}/${r.name}.json`;await (await event).saveAs(file);
   const params=validate(JSON.parse(await fs.readFile(file,'utf8'))),model=buildModel(api,params),review=reviewPrint(model.combined,model.volume);
   const size=model.dimensions||(()=>{const p=model.combined.positions,k=model.combined.numProp,lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];for(let i=0;i<p.length;i+=k)for(let j=0;j<3;j++){lo[j]=Math.min(lo[j],p[i+j]);hi[j]=Math.max(hi[j],p[i+j]);}return hi.map((v,j)=>v-lo[j]);})();
   const dims=size.map(v=>Math.round(v*10)/10);
   const sizeOk=r.size.every((want,i)=>!want||Math.abs(dims[i]-want)<=Math.max(2,want*.05));
   Object.assign(entry,{dims,sizeOk,parts:countParts(model.combined),contact:Math.round(review.contactArea),overhang:Math.round(review.overhangArea),grams:Math.round(review.grams*10)/10,issues:review.issues.map(i=>i.kind),versions:params.forge?.revisions.length||0});
  }
  report.push(entry);console.log(JSON.stringify(entry));
  await page.close();
 }
}finally{await browser.close();await fs.writeFile(directory+'/reporte.json',JSON.stringify(report,null,2));}
