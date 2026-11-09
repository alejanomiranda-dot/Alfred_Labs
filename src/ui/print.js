// «Imprimir»: revisión, un archivo principal para Bambu Studio y el resto de los formatos a demanda.
import {stlBytes,threeMfBytes} from '../export.js';
import {revisionName,handoffZip,handoffFiles,writeFolder,saveAsFile} from '../handoff.js';
import {fitCoupon} from '../solid-program.js';
import {productPhoto,thumbnail,quoteHtml,printHtml} from '../studio-output.js';
import {costOf,durationText} from '../printability.js';
import {money,saveSettings,settingDefaults} from '../settings.js';
import {validate} from '../model.js';

const closeIcon='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg>';

export function download(data,name,type){const url=URL.createObjectURL(data instanceof Blob?data:new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
export function basename(project){return(project||'pieza').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,60)||'pieza';}

export function createPrint({dialog,app,toast}){
 let directory=null;
 dialog.innerHTML=`<div class="sheet-head"><h2 id="printTitle">Imprimir</h2><button type="button" class="icon" data-close aria-label="Cerrar">${closeIcon}</button></div>
 <div id="printReview"></div>
 <button type="button" class="primary print-main" id="export3mf">Guardar para Bambu Studio (3MF)</button>
 <ol class="steps"><li>Abrí el archivo en Bambu Studio: Archivo → Importar, o arrastralo a la ventana.</li><li>Si tiene varios colores, asigná un filamento a cada uno. Las partes son un solo objeto: no las separes.</li><li id="supportStep">Elegí el perfil de tu impresora, laminá y mirá la vista previa.</li><li>Imprimí una primera muestra. Si tiene un QR, escanealo en la pieza real.</li></ol>
 <details class="more"><summary>Más formatos y herramientas</summary>
  <div class="tools">
   <button type="button" id="exportStl">STL de una sola pieza</button>
   <button type="button" id="exportProject">Proyecto editable</button>
   <button type="button" id="savePackage">Paquete ZIP con guía</button>
   <button type="button" id="productPhoto">Foto de producto</button>
   <button type="button" id="quotePdf">Presupuesto en PDF</button>
   <button type="button" id="openSettings">Costos y estilo</button>
  </div>
  <fieldset><legend>Prueba de encaje</legend><p class="hint">Imprimí solo una franja de la pieza para probar cómo encaja antes de gastar el material completo.</p><div class="fields"><label>Desde · mm<input id="couponFrom" type="number" min="0" step="0.5" value="0"></label><label>Alto · mm<input id="couponHeight" type="number" min="1" step="0.5" value="6"></label></div><button type="button" id="exportCoupon">Descargar la franja (3MF)</button></fieldset>
  <fieldset><legend>Carpeta de trabajo</legend><p class="hint" id="folderStatus">Guardá cada revisión en una carpeta de tu computadora (Chrome o Edge).</p><div class="library-actions"><button type="button" id="chooseFolder">Elegir carpeta</button><button type="button" id="saveFolder">Guardar en la carpeta</button></div></fieldset>
 </details>`;
 const $=id=>dialog.querySelector('#'+id);
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();

 function renderReview(){
  const host=$('printReview'),review=app.review(),settings=app.settings();host.replaceChildren();
  if(!review){host.innerHTML='<p class="hint">Calculando material y tiempo…</p>';return;}
  const c=costOf(review,settings);
  host.innerHTML=`<div class="stats"><div class="stat"><small>Material</small><strong>${review.grams.toFixed(1).replace('.',',')} g</strong></div><div class="stat"><small>Tiempo</small><strong>${durationText(review.seconds)}</strong></div><div class="stat"><small>Costo</small><strong>${money(c.cost,settings)}</strong></div></div><p class="hint">Precio sugerido con ${settings.margin} % de margen: ${money(c.price,settings)}. Estimación para boquilla de 0,4 mm y capas de 0,2 mm; Bambu Studio da el valor final.</p>`;
  const list=document.createElement('ul');list.className='issues';
  for(const i of review.issues.length?review.issues:[{kind:'ok',text:'Sin problemas: no necesita soportes y las paredes tienen buen espesor.'}]){const li=document.createElement('li');li.className=i.kind;li.textContent=i.text;list.append(li);}
  host.append(list);
  $('supportStep').textContent=review.issues.some(i=>i.kind==='overhang')?'Elegí el perfil de tu impresora y activá Soportes (tipo árbol, automático). Laminá y mirá la vista previa.':'Elegí el perfil de tu impresora, laminá y mirá la vista previa. No necesita soportes.';
 }
 const model=()=>{const m=app.model();if(!m)toast('Todavía no hay una pieza para exportar.');return m;};
 async function save(bytes,name,ext,type){const result=await saveAsFile(window,bytes,name,ext);if(result.method==='download'){download(bytes,name,type);toast('Descarga iniciada.');}else if(result.method==='picker')toast('Archivo guardado.');}

 $('export3mf').onclick=async()=>{const m=model();if(!m)return;try{await save(threeMfBytes(m),revisionName(app.params().project)+'.3mf','3mf','model/3mf');}catch(e){toast('No se pudo guardar: '+e.message);}};
 $('exportStl').onclick=()=>{const m=model();if(m)download(stlBytes(m.combined),basename(app.params().project)+'.stl','model/stl');};
 $('exportProject').onclick=()=>{try{download(JSON.stringify(validate(app.params()),null,2),basename(app.params().project)+'.json','application/json');}catch(e){toast(e.message);}};
 $('savePackage').onclick=async()=>{const m=model();if(!m)return;try{const stem=revisionName(app.params().project);await save(handoffZip(m,stem),stem+'.zip','zip','application/zip');}catch(e){toast('No se pudo guardar el paquete: '+e.message);}};
 $('exportCoupon').onclick=async()=>{const m=model();if(!m)return;try{const coupon=fitCoupon(app.api(),m,Number($('couponFrom').value),Number($('couponHeight').value));download(threeMfBytes(coupon),revisionName(app.params().project+' prueba')+'.3mf','model/3mf');toast('Franja lista: '+coupon.dimensions.map(v=>v.toFixed(1).replace('.',',')).join(' × ')+' mm.');}catch(e){toast(e.message);}};
 $('productPhoto').onclick=async()=>{const m=model();if(!m)return;const settings=app.settings();const blob=await productPhoto(app.capture(),{title:app.params().project,subtitle:[settings.business,m.dimensions.map(v=>v.toFixed(0)).join(' × ')+' mm'].filter(Boolean).join(' · ')});download(blob,basename(app.params().project)+'-foto.png','image/png');};
 $('quotePdf').onclick=()=>{const m=model(),review=app.review();if(!m)return;if(!review){toast('Esperá a que termine la revisión.');return;}const settings=app.settings(),c=costOf(review,settings);
  printHtml(quoteHtml({business:settings.business,date:new Date().toLocaleDateString('es-AR'),project:app.params().project,image:thumbnail(app.capture()),size:m.dimensions.map(v=>v.toFixed(1).replace('.',',')).join(' × ')+' mm',grams:review.grams.toFixed(1).replace('.',',')+' g',time:durationText(review.seconds),colors:app.colors(),material:money(c.material,settings),machine:c.machine?money(c.machine,settings):'',extra:settings.extra?money(settings.extra,settings):'',work:money(c.price-c.cost,settings),total:money(c.price,settings)}));
  toast('Se abrió el diálogo de impresión: elegí «Guardar como PDF».');};
 $('chooseFolder').onclick=async()=>{if(!window.showDirectoryPicker){toast('Este navegador no permite elegir carpetas. Usá el paquete ZIP.');return;}try{directory=await window.showDirectoryPicker({id:'alfred-folder',mode:'readwrite'});$('folderStatus').textContent='Carpeta: '+directory.name+'. Cada guardado crea una revisión nueva.';}catch(e){if(e.name!=='AbortError')toast('El navegador no habilitó la carpeta.');}};
 $('saveFolder').onclick=async()=>{const m=model();if(!m)return;if(!directory){toast('Elegí primero una carpeta.');return;}try{if(await directory.requestPermission({mode:'readwrite'})!=='granted')throw Error('No se concedió acceso a la carpeta.');const stem=revisionName(app.params().project),folder=await directory.getDirectoryHandle(stem,{create:true});await writeFolder(folder,handoffFiles(m,stem));$('folderStatus').textContent='Guardado en '+directory.name+' / '+stem+'.';}catch(e){toast('No se completó el guardado: '+e.message);}};
 $('openSettings').onclick=()=>openSettings(app,toast,renderReview);

 return {open(){renderReview();if(!dialog.open)dialog.showModal();},refresh(){if(dialog.open)renderReview();}};
}

export function openSettings(app,toast,after){
 let dialog=document.getElementById('settingsDialog');
 if(!dialog){
  dialog=document.createElement('dialog');dialog.id='settingsDialog';dialog.className='sheet';
  dialog.innerHTML=`<form method="dialog" id="settingsForm"><div class="sheet-head"><h2>Costos y estilo</h2><button value="cancel" class="icon" aria-label="Cerrar">${closeIcon}</button></div><p class="eyebrow">Costos</p><div class="fields"><label>Filamento · precio por kg<input name="pricePerKg" type="number" min="0" step="100"></label><label>Moneda<input name="currency" maxlength="4"></label></div><div class="fields"><label>Uso de la impresora · por hora<input name="hourly" type="number" min="0" step="10"></label><label>Extra por pieza<input name="extra" type="number" min="0" step="10"></label></div><label>Margen de ganancia · %<input name="margin" type="number" min="0" max="1000" step="5"></label><label>Nombre del emprendimiento (para presupuestos)<input name="business" maxlength="60"></label><p class="eyebrow">Mi estilo</p><div class="fields"><label>Color base favorito<input name="baseColor" type="color"></label><label>Color de detalle favorito<input name="detailColor" type="color"></label></div><label>Tipografía preferida<select name="font"><option value="helvetiker">Moderna</option><option value="gentilis">Clásica</option><option value="optimer">Elegante</option></select></label><label>Holgura para encastres · mm<input name="fitClearance" type="number" min="0" max="1" step="0.05"></label><label>Notas de estilo para Alfred<textarea name="styleNotes" maxlength="400" rows="2" placeholder="Me gustan las formas redondeadas y las letras grandes"></textarea></label><button value="save" class="primary full">Guardar</button></form>`;
  document.body.append(dialog);
  dialog.addEventListener('close',()=>{if(dialog.returnValue!=='save')return;const form=new FormData(dialog.querySelector('form')),next={...app.settings()};for(const [k,v] of form)next[k]=typeof settingDefaults[k]==='number'?Math.max(0,Number(v)||0):String(v);app.setSettings(next);saveSettings(next);dialog.after?.();toast('Ajustes guardados en este navegador.');});
 }
 dialog.after=after;
 const form=dialog.querySelector('form');for(const [k,v] of Object.entries(app.settings()))if(form.elements[k])form.elements[k].value=v;
 dialog.showModal();
}
