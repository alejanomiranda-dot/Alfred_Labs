import {zipSync,strToU8} from 'fflate';
import {base64Bytes,revisionFromResult,prepareForgeProposal,appendForgeRevision} from './forge-project.js';
export function mountForge({host,api,getContext,offerProposal,download,toast,onView,onBusy=()=>{}}){
 const cad=document.createElement('div');cad.id='cadAssistant';
 while(host.firstChild)cad.append(host.firstChild);
 const tabs=document.createElement('div');tabs.className='forge-mode-tabs';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Modo de diseño');
 tabs.innerHTML='<button type="button" class="secondary" id="cadMode" aria-pressed="true">Guía CAD</button><button type="button" class="secondary" id="forgeMode" aria-pressed="false">Alfred Forge · experimental</button>';
 const panel=document.createElement('section');panel.id='forgePanel';panel.hidden=true;
 panel.innerHTML=`<div class="chat-heading"><div><span class="eyebrow">GENERACIÓN EXPERIMENTAL LOCAL</span><h2>Alfred Forge</h2></div></div>
 <p>Describí tu pieza y revisá la propuesta en la mesa 3D antes de aplicarla.</p>
 <p id="forgeAvailability" class="hint" role="status">Comprobando OpenSCAD…</p>
 <div class="review-actions"><button type="button" class="secondary" id="forgeExample">Abrir árbol de muestra · sin IA</button><button type="button" class="subtle" id="forgeRefresh">Comprobar instalación</button></div>
 <div id="forgeConversation" class="conversation" role="log" aria-label="Conversación con Forge" aria-live="polite"></div>
 <form id="forgeForm" class="chat-composer"><label for="forgePrompt">Tu pedido o corrección</label><textarea id="forgePrompt" rows="3" maxlength="2000" required placeholder="Un árbol de 140 mm que diga VERO y ALE, con un corazón…"></textarea><label class="forge-checkbox"><input id="forgeCorrect" type="checkbox" disabled> Corregir la versión seleccionada</label><div class="composer-actions"><button id="forgeStop" type="button" class="subtle" hidden>Detener</button><button id="forgeGenerate" type="submit" class="primary" disabled>Generar propuesta</button></div></form>
 <p id="forgeProgress" role="status"></p>
 <div id="forgeVersions" hidden><label for="forgeVersion">Versiones de esta sesión o proyecto</label><select id="forgeVersion"></select><p class="hint">Se conservan las últimas 8 fuentes. Elegí una versión y usá «Ver versión» para recompilarla sin gastar API.</p><div class="review-actions"><button type="button" class="secondary" id="forgeRestore">Ver versión</button><button type="button" class="secondary" id="forgeSource">Descargar fuente .scad</button><button type="button" class="secondary" id="forgeBundle" disabled>Descargar paquete Forge</button></div><details><summary>Fuente y notas de la versión</summary><p id="forgeDescription"></p><ul id="forgeNotes"></ul><pre id="forgeCode" class="forge-code"></pre></details></div>
 <p class="hint">Forge reconstruye su propia fuente. No modifica exactamente un STL ajeno ni incorpora automáticamente los cambios hechos después con la Guía CAD. Para esas modificaciones usá la guía habitual. Las figuras orgánicas son aproximaciones procedurales.</p>
 <p class="hint">El proyecto editable y la biblioteca conservan las fuentes al aplicar y guardar. Antes de aplicar, descargá el paquete para conservar tu propuesta. El 3MF es geometría sin laminar: revisalo en Bambu Studio.</p>
 <details><summary>Privacidad y uso local</summary><p>Al generar con IA se envían el pedido, hasta 8 mensajes recientes y la fuente seleccionada a OpenAI. Abrir la muestra o recompilar una versión no consume API. La clave permanece en el servidor local. Forge ejecuta OpenSCAD solo desde el servidor de desarrollo en 127.0.0.1; no está habilitado en el sitio público.</p></details>`;
 host.append(tabs,cad,panel);
 const $=id=>panel.querySelector('#'+id);
 panel.querySelector('#forgeForm').after(panel.querySelector('#forgeConversation'));
 const switchMode=forge=>{cad.hidden=forge;panel.hidden=!forge;tabs.querySelector('#cadMode').setAttribute('aria-pressed',String(!forge));tabs.querySelector('#forgeMode').setAttribute('aria-pressed',String(forge));if(forge){sync();$('forgePrompt').focus();}};
 tabs.querySelector('#cadMode').onclick=()=>switchMode(false);tabs.querySelector('#forgeMode').onclick=()=>switchMode(true);
 let status=null,busy=false,controller=null,archive=null,messages=[],epoch=-1,selectedFiles=null,selectedFileId=null,serial=0;
 function message(role,content){messages.push({role,content});messages=messages.slice(-16);const row=document.createElement('div');row.className='chat-message '+role;const who=document.createElement('strong'),p=document.createElement('p');who.textContent=role==='user'?'Vos':'Forge';p.textContent=content;row.append(who,p);$('forgeConversation').append(row);while($('forgeConversation').children.length>16)$('forgeConversation').firstChild.remove();$('forgeConversation').scrollTop=$('forgeConversation').scrollHeight;}
 function selected(){return archive?.revisions.find(r=>r.id===archive.selected);}
 function controls(){
  const usable=status?.local&&status?.compiler;
  $('forgeExample').disabled=busy||!status?.local;$('forgeGenerate').disabled=busy||!usable||!status?.ai;
  $('forgeRefresh').disabled=busy;$('forgeStop').hidden=!busy;
  for(const id of ['forgeRestore','forgeVersion','forgeSource'])$(id).disabled=busy||!selected();
  $('forgeBundle').disabled=busy||selectedFileId!==archive?.selected||!selectedFiles;
  $('forgeCorrect').disabled=busy||!selected();$('forgePrompt').disabled=busy;
  $('forgeConversation').setAttribute('aria-busy',String(busy));
 }
 function renderVersions(){
  $('forgeVersions').hidden=!archive;
  $('forgeVersion').replaceChildren(...(archive?.revisions||[]).map((r,i)=>{const o=document.createElement('option');o.value=r.id;o.textContent=(i+1)+'. '+r.prompt.slice(0,65)+' · '+new Date(r.created).toLocaleTimeString('es-AR');o.selected=r.id===archive.selected;return o;}));
  const r=selected();$('forgeDescription').textContent=r?.description||'';$('forgeCode').textContent=r?.scad||'';
  $('forgeNotes').replaceChildren(...[...(r?.assumptions||[]),...(r?.caveats||[])].map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));controls();
 }
 function sync(){
  const context=getContext();
  if(epoch!==context.epoch){
   epoch=context.epoch;serial++;controller?.abort();controller=null;busy=false;onBusy(false);archive=context.current.forge?structuredClone(context.current.forge):null;messages=[];selectedFiles=null;selectedFileId=null;$('forgeConversation').replaceChildren();$('forgeProgress').textContent='';$('forgePrompt').value='';$('forgeCorrect').checked=!!archive;renderVersions();
  }
 }
 async function refresh(){
  if(location.hostname!=='127.0.0.1'){status=null;$('forgeAvailability').textContent='Forge requiere la versión local: abrí http://127.0.0.1:5173 en tu computadora.';controls();return;}
  try{const response=await fetch('/api/forge');if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error();status=await response.json();$('forgeAvailability').textContent=!status.compiler?'Falta OpenSCAD. Podés abrir la muestra precompilada; instalalo para crear o corregir piezas.':!status.ai?'OpenSCAD listo. Sin clave de IA: podés abrir la muestra y recompilar versiones.':'OpenSCAD e IA configurados. Listo para generar propuestas.';}
  catch{status=null;$('forgeAvailability').textContent='Forge necesita el servidor local de desarrollo. Cerrá y volvé a abrir «Iniciar taller».';}controls();
 }
 async function request(action,prompt=''){
  sync();if(busy)return;
  const context=getContext();if(context.busy){toast('Esperá a que termine la consulta con la Guía CAD.');return;}
  const base=JSON.stringify(context.current),requestEpoch=context.epoch,requestSerial=++serial;
  const previous=selected(),correct=$('forgeCorrect').checked&&previous;
  const body={action,...(action==='generate'?{prompt,history:correct?messages.slice(-8).map(m=>({...m,content:m.content.slice(0,2000)})):[],...(correct?{previous:previous.scad}:{})}:action==='compile'?{scad:previous.scad}:{})};
  controller=new AbortController();const ownController=controller;busy=true;onBusy(true);controls();
  if(prompt)message('user',prompt);
  $('forgeProgress').textContent=action==='generate'?'Generando y compilando la pieza… Puede tardar unos minutos.':'Compilando la muestra o versión seleccionada…';
  // A local watchdog also bounds stalled HTTP connections; cancellation reaches the compiler.
  const timer=setTimeout(()=>ownController.abort(),345000);
  try{
   const response=await fetch('/api/forge',{method:'POST',headers:{'Content-Type':'application/json'},signal:ownController.signal,body:JSON.stringify(body)});
   if(!response.headers.get('content-type')?.includes('application/json'))throw Error('El servidor local de Forge no está disponible. Reiniciá el taller.');
   const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo generar la pieza.');
   if(requestSerial!==serial||requestEpoch!==getContext().epoch)return;
   if(JSON.stringify(getContext().current)!==base)throw Error('La pieza cambió durante la generación. Tu diseño se conservó; volvé a enviar el pedido.');
   const revision=action==='compile'?previous:revisionFromResult(result,action==='example'?'Árbol VERO y ALE · muestra':prompt);
   const nextArchive=action==='compile'?archive:appendForgeRevision(archive,revision);
   // No mutation of the project or outstanding proposal until the real mesh passes validation.
   const checked=prepareForgeProposal(api,context.current,result,nextArchive);
   offerProposal(checked,base);
   archive=nextArchive;selectedFiles=result.files;selectedFileId=revision.id;$('forgeCorrect').checked=true;
   message('assistant',revision.description+' Propuesta lista, todavía sin aplicar.');
   $('forgeProgress').textContent='Vista previa lista: usá Aplicar o Descartar debajo.'+(result.precompiled?' Muestra precompilada; OpenSCAD no está instalado.':'')+(checked.simplified?' Se simplificó la malla para el visor; el paquete conserva los archivos originales.':'');
   if(action==='generate')$('forgePrompt').value='';renderVersions();onView();
  }catch(e){if(requestSerial===serial){const text=ownController.signal.aborted?'Generación detenida. Tu pieza y la propuesta anterior se conservaron.':e.message;message('assistant',text);$('forgeProgress').textContent=text;}}
  finally{clearTimeout(timer);if(requestSerial===serial){busy=false;controller=null;onBusy(false);controls();}}
 }
 $('forgeForm').onsubmit=e=>{e.preventDefault();const prompt=$('forgePrompt').value.trim();if(prompt)request('generate',prompt);};
 $('forgePrompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!$('forgeGenerate').disabled)$('forgeForm').requestSubmit();}};
 $('forgeExample').onclick=()=>request('example');$('forgeRestore').onclick=()=>request('compile');$('forgeRefresh').onclick=refresh;$('forgeStop').onclick=()=>controller?.abort();
 $('forgeVersion').onchange=()=>{archive.selected=$('forgeVersion').value;renderVersions();};
 $('forgeSource').onclick=()=>{const r=selected();download(r.scad,'alfred-forge-'+r.id.slice(0,8)+'.scad','text/plain');};
 $('forgeBundle').onclick=()=>{
  const r=selected();if(!r||selectedFileId!==r.id||!selectedFiles)return;
  const files={'pieza.scad':strToU8(r.scad),'pieza.stl':base64Bytes(selectedFiles.stl),'pieza.3mf':base64Bytes(selectedFiles['3mf']),'historial-forge.json':strToU8(JSON.stringify(archive,null,2)),'LEEME.txt':strToU8('Alfred Forge — geometría sin laminar.\nRevisá tamaño, soportes y tolerancias en Bambu Studio.\nSTL/3MF originales de la fuente seleccionada; no incluyen ediciones CAD posteriores.\nAplicá la propuesta y exportá el proyecto editable desde el taller para conservar también la malla.\n')};
  download(zipSync(files),'alfred-forge-'+r.id.slice(0,8)+'.zip','application/zip');
 };
 sync();refresh();return {sync,isBusy:()=>busy,open:()=>switchMode(true)};
}
