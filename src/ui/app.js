// Alfred: una sola conversación que decide cómo construir la pieza, con cambios directos y Deshacer.
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import {defaults,validate,buildModel} from '../model.js';
import {checkProposal,proposalChanges} from '../proposals.js';
import {reviewPrint,costOf,durationText,composeRotation,countParts,partsOf as meshParts,keepParts} from '../printability.js';
import {stlBytes,threeMfBytes} from '../export.js';
import {revisionName} from '../handoff.js';
import {loadSettings,money} from '../settings.js';
import {saveVersion,listProjects,deleteProject,countProjects,migrateLegacy,pruneProject} from '../library.js';
import {cloudConfigured,currentUser,onAccountChange,accountName,preloadGoogle,signIn,signOut,syncLibrary,pushVersion,removeFromCloud,versionParams} from '../cloud.js';
import {thumbnail} from '../studio-output.js';
import {readMeshFile} from '../mesh-import.js';
import {prepareImport,describeImport} from '../solid-program.js';
import {projectFromBytes,savedProjectIn} from '../project-file.js';
import {readKeychainLogo,keychainUrl,isTwoSidedKeychain,planKeychainColorChange,recolorKeychain,keychainLogoNotes,colorName} from '../keychain.js';
import {readQrImage} from '../qr-image.js';
import {reliefFromImage,generatedParams} from '../relief.js';
import {validateGeneration} from '../generation-spec.js';
import {revisionFromResult,prepareForgeProposal,appendForgeRevision,finishOf,isSculpt} from '../forge-project.js';
import {buildSculpt} from '../sculpt.js';
import {sculptPalette} from '../../shared/sculpt-schema.js';
import {hasFinish} from '../finish.js';
import {openPhotoMeasure} from '../photo-measure.js';
import {openSparePart} from '../spare-part.js';
import {setupTheme} from './theme.js';
import {createViewer} from './viewer.js';
import {renderPanel,renderStatus} from './panel.js';
import {createPrint,download} from './print.js';

const $=id=>document.getElementById(id);
const assistantFields=['kind','project','name','phone','qrText','caption','shape','width','height','thickness','relief','hole','baseColor','detailColor','backDecoration','backStyle','backDepth','freeDesign'];
const emptyParams=()=>({...defaults,kind:'free',project:'Mi pieza',freeDesign:null,importedMesh:null,importedColors:null,sourceInfo:null,forge:null});
const sizeText=v=>v.map(x=>String(Math.round(x*10)/10).replace('.',',')).join(' × ')+' mm';
const tick=()=>new Promise(r=>setTimeout(r,30));
class Stale extends Error{}

const S={api:null,params:emptyParams(),model:null,history:[],future:[],lastPush:0,conversation:[],attachment:null,busy:false,busyText:'',controller:null,
 review:null,heatOn:false,settings:loadSettings(),projectId:null,relief:null,pendingIntent:null,keychainDraft:null,forgeStatus:undefined,epoch:0,dirty:false,assistantReady:location.hostname==='127.0.0.1',imageTarget:'attach'};

const hasPiece=()=>!(S.params.kind==='free'&&!S.params.freeDesign);
const partsOf=(m,p)=>m.parts||[{mesh:m.base,color:p.baseColor},{mesh:m.detail,color:p.detailColor}];
function sizeOf(m){if(m.dimensions)return m.dimensions;const p=m.combined.positions,k=m.combined.numProp,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<p.length;i+=k)for(let j=0;j<3;j++){min[j]=Math.min(min[j],p[i+j]);max[j]=Math.max(max[j],p[i+j]);}return max.map((v,j)=>v-min[j]);}
function build(p){const m=buildModel(S.api,p);if(!m.dimensions)m.dimensions=sizeOf(m);return m;}

function toast(message){const t=$('toast');t.textContent=message;t.style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.style.display='none',4200);}

// ---------- Visor ----------
const viewer=createViewer($('viewer'));
setupTheme($('themeToggle'),()=>viewer.repaint());
for(const [id,view] of [['viewPerspective','perspective'],['viewFront','front'],['viewBack','back']])$(id).onclick=()=>{viewer.setView(view);for(const b of ['viewPerspective','viewFront','viewBack'])$(b).setAttribute('aria-pressed',String(b===id));};
const pressed=(id,on)=>$(id).setAttribute('aria-pressed',String(on));
$('dimsTool').onclick=()=>{const on=$('dimsTool').getAttribute('aria-pressed')!=='true';pressed('dimsTool',on);viewer.tools.setDims(on);};
$('rulerTool').onclick=()=>{const on=$('rulerTool').getAttribute('aria-pressed')!=='true';pressed('rulerTool',on);viewer.tools.setRuler(on);if(on)toast('Hacé clic en dos puntos de la pieza para medir.');};
const section={axis:'z',amount:.5};
const syncSection=()=>viewer.tools.setSection($('sectionPanel').hidden?null:{...section});
$('sectionTool').onclick=()=>{$('sectionPanel').hidden=!$('sectionPanel').hidden;pressed('sectionTool',!$('sectionPanel').hidden);syncSection();};
for(const b of $('sectionPanel').querySelectorAll('[data-axis]'))b.onclick=()=>{section.axis=b.dataset.axis;for(const o of $('sectionPanel').querySelectorAll('[data-axis]'))o.setAttribute('aria-pressed',String(o===b));syncSection();};
$('sectionAmount').oninput=e=>{section.amount=Number(e.target.value)/100;syncSection();};

// ---------- Modo de pantalla ----------
function updateMode(){
 const empty=!hasPiece()&&!S.conversation.length&&!S.busy;
 document.body.dataset.mode=empty?'empty':'working';
 const target=empty?$('heroComposer'):$('composerHome');
 if($('composer').parentElement!==target)target.append($('composer'));
 $('stageEmpty').hidden=empty||!!S.model;
 $('prompt').placeholder=empty?'Describí la pieza que querés imprimir…':'Pedile un cambio a Alfred…';
}

// ---------- Estado de la pieza ----------
function refresh({keepView=false,panel=true,built=null}={}){
 S.model=null;
 if(built){S.model=built;S.params=built.params;}
 else if(hasPiece()){try{S.model=build(S.params);S.params=S.model.params;}catch(e){toast(e.message);}}
 viewer.draw(S.model,S.model?partsOf(S.model,S.params):[],{keepView,smooth:!!S.params.sourceInfo||(S.params.kind==='free'&&hasFinish(finishOf(S.params.freeDesign)))});
 $('dimensions').textContent=S.model?sizeText(S.model.dimensions):'';
 const flat=S.params.kind!=='free'||!!S.params.sourceInfo;$('viewFront').textContent=flat?'Frente':'Arriba';$('viewBack').textContent=flat?'Dorso':'Abajo';
 $('project').value=S.params.project||'';$('project').size=Math.max(8,Math.min(36,($('project').value.length||8)+1));
 updateMode();updateHistoryButtons();updateSaved();
 if(panel)renderPiecePanel();
 S.review=null;S.heatOn=false;viewer.tools.setHeat(null);renderPieceStatus();scheduleReview();
}
function pushHistory(){S.history.push(structuredClone(S.params));if(S.history.length>30)S.history.shift();S.future=[];}
function updateHistoryButtons(){$('undo').disabled=!S.history.length;$('redo').disabled=!S.future.length;}
function markDirty(){S.dirty=true;updateSaved();}
function updateSaved(){$('savedState').textContent=!hasPiece()?'':S.dirty?'Sin guardar':S.projectId?'Guardado':'';}

// Cambio de la conversación: se aplica directo y queda una línea con Deshacer.
function apply(candidate,built,note){
 const before=S.params;pushHistory();markDirty();
 const changes=note||summarize(before,built.params);
 refresh({built});
 addMessage('event',changes+' · '+sizeText(S.model.dimensions));
 // Historial: cada pieza que arma Alfred queda en «Mis diseños», para volver a ella o descargarla otra vez.
 storeVersion(changes).catch(()=>{});
}
// Resumen en palabras simples, sin nombres internos.
function summarize(before,after){
 if(!hasPieceParams(before)||before.kind!==after.kind)return 'Pieza nueva';
 const list=proposalChanges(before,after).filter(t=>!t.startsWith('Proyecto')&&!t.includes('importada')).map(t=>t==='Nueva geometría de la pieza'?'Forma actualizada':t);
 return list.slice(0,2).join(' · ')||'Pieza actualizada';
}
function hasPieceParams(p){return !(p.kind==='free'&&!p.freeDesign);}
// Una pieza nueva por medidas no arrastra la malla, el relieve ni las versiones de la anterior.
function withoutLeftovers(c){
 const usesImport=c.kind==='free'&&c.freeDesign?.nodes?.some(n=>n.type==='imported');
 return usesImport?c:{...c,importedMesh:null,importedColors:null,sourceInfo:null,forge:null};
}
let liveTimer;
function update(patch,{live=false,rerender=false}={}){
 clearTimeout(liveTimer);
 const commit=()=>{
  const now=Date.now();if(now-S.lastPush>1500)pushHistory();S.lastPush=now;
  try{const next={...S.params,...patch},built=build(next);markDirty();refresh({keepView:true,panel:rerender,built});}
  catch(e){toast(e.message);}
 };
 if(live)liveTimer=setTimeout(commit,140);else commit();
}
function undo(){if(!S.history.length||S.busy)return;S.future.push(structuredClone(S.params));S.params=S.history.pop();markDirty();refresh({keepView:true});toast('Cambio deshecho.');}
function redo(){if(!S.future.length||S.busy)return;S.history.push(structuredClone(S.params));S.params=S.future.pop();markDirty();refresh({keepView:true});toast('Cambio rehecho.');}
$('undo').onclick=undo;$('redo').onclick=redo;
addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey)||e.key.toLowerCase()!=='z'||e.target.closest('input,textarea,select'))return;e.preventDefault();e.shiftKey?redo():undo();});
$('project').addEventListener('change',()=>{S.params={...S.params,project:$('project').value.trim().slice(0,60)||'Mi pieza'};markDirty();});

// ---------- Panel «Tu pieza» y revisión ----------
function renderPiecePanel(){
 if(!hasPiece()||!S.model){$('pieceControls').replaceChildren();return;}
 renderPanel($('pieceControls'),{params:S.params,model:S.model,update,editProgram,replaceLogo:()=>{S.imageTarget='logo';$('imageFile').click();},recolorLogo,
  canRebuildRelief:!!S.relief&&!!S.params.sourceInfo,reliefInverted:!!S.relief?.invert,rebuildRelief,forgeVersion,forgeSource});
}
// «Colores del archivo»: pinta una parte del logo; si suma un cuarto color, se unen los dos más parecidos.
function recolorLogo(region,from,color){
 try{const {config,merged}=recolorKeychain(S.params.keychain,{region,from,color});update({keychain:config},{rerender:true});if(merged)toast('Para no pasar de 4 filamentos, el '+colorName(merged.from)+' pasó a '+colorName(merged.to)+'.');}
 catch(e){toast(e.message);}
}
function editProgram(program){try{const built=build(validate({...S.params,freeDesign:program}));pushHistory();markDirty();refresh({keepView:true,panel:false,built});return null;}catch(e){return e.message;}}
let reviewTimer;
function scheduleReview(){clearTimeout(reviewTimer);if(!S.model)return;const model=S.model;reviewTimer=setTimeout(()=>{if(model!==S.model)return;try{S.review=reviewPrint(model.combined,model.volume);}catch(e){console.error(e);S.review=null;}renderPieceStatus();printer.refresh();},280);}
function renderPieceStatus(){
 renderStatus($('pieceStatus'),{review:S.review,model:S.model,settings:S.settings,money,durationText,costOf,heatOn:S.heatOn,canOrient:S.params.kind==='free'&&!!S.review?.suggestion,
  onHeat:()=>{S.heatOn=!S.heatOn;viewer.tools.setHeat(S.heatOn&&S.review?[{mesh:S.review.highlight.overhang,color:'#ff5a5f'},{mesh:S.review.highlight.thin,color:'#ffb020'}]:null);renderPieceStatus();if(S.heatOn)toast('Rojo: partes que necesitan soporte. Naranja: paredes muy finas.');},
  onOrient:()=>{if(!S.review?.suggestion)return;update({printRotation:composeRotation(S.params.printRotation,S.review.suggestion.rotation)});toast('La giré para que necesite menos soportes.');},
  onPrint:()=>printer.open()});
}

// ---------- Conversación ----------
function addMessage(role,content,extra={}){S.conversation.push({role,content,...extra});renderConversation();updateMode();}
function renderConversation(){
 const host=$('conversation');host.replaceChildren();
 const lastEvent=S.conversation.findLastIndex(m=>m.role==='event');
 S.conversation.forEach((m,i)=>{
  const row=document.createElement('div');row.className='msg '+m.role;
  if(m.role==='event'){
   const tickMark=document.createElement('span');tickMark.className='tick';tickMark.textContent='✓';
   const text=document.createElement('span');text.className='text';text.textContent=m.content;row.append(tickMark,text);
   if(i===lastEvent&&S.history.length){const b=document.createElement('button');b.type='button';b.textContent='Deshacer';b.onclick=undo;row.append(b);}
  }else{
   row.textContent=m.content;
   if(m.image){const img=document.createElement('img');img.src=m.image;img.alt=m.imageName||'Imagen adjunta';img.style.cssText='display:block;max-width:160px;max-height:120px;border-radius:8px;margin-top:6px;background:#fff';row.append(img);}
  }
  host.append(row);
 });
 if(S.busy){const row=document.createElement('div');row.className='msg thinking';row.textContent=S.busyText;host.append(row);}
 host.scrollTop=host.scrollHeight;
}
function setBusy(on,text='Alfred está pensando…'){
 S.busy=on;S.busyText=text;$('stopAssistant').hidden=!on;$('askAssistant').disabled=on;
 $('pieceControls').inert=on;renderConversation();updateMode();
}
const recentHistory=()=>S.conversation.filter(m=>m.role==='user'||m.role==='assistant').slice(-12).map(m=>({role:m.role,content:m.content.slice(0,1600)}));

async function post(url,body,timeout=200000){
 const signal=AbortSignal.any([S.controller.signal,AbortSignal.timeout(timeout)]);
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
 if(!(r.headers.get('content-type')||'').includes('application/json'))throw Error('El servidor no respondió. Probá de nuevo en unos segundos.');
 const data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo completar el pedido.');return data;
}

async function send(text){
 const prompt=(text??$('prompt').value).trim();if(!prompt||S.busy)return;
 const attachment=S.attachment;$('prompt').value='';autosize();clearAttachment();
 addMessage('user',prompt,attachment?{image:attachment.preview,imageName:attachment.name}:{});
 const epoch=S.epoch;S.controller=new AbortController();setBusy(true);
 try{
  // Cambios de color del llavero actual («el nombre en negro»): se resuelven acá, sin rearmarlo ni consultar a la IA.
  const recolor=!attachment&&hasPiece()&&S.params.kind==='keychain'?planKeychainColorChange(S.params,prompt):null;
  if(recolor){keychainColorChange(recolor);return;}
  const wantsKeychain=isTwoSidedKeychain(prompt)||(S.pendingIntent==='keychain'&&(attachment||findUrl(prompt)));
  if(!wantsKeychain)S.pendingIntent=null;
  if(wantsKeychain)await keychainFlow(prompt,attachment,epoch);
  else await assistantFlow(prompt,attachment,epoch);
 }catch(e){
  if(e instanceof Stale||epoch!==S.epoch)return;
  addMessage('assistant',S.controller.signal.aborted?'Detuve el pedido. Podés escribirlo de nuevo cuando quieras.':e.message);
 }finally{if(epoch===S.epoch)setBusy(false);}
}
const check=epoch=>{if(epoch!==S.epoch)throw new Stale();};

function findUrl(text){
 const m=text.match(/https?:\/\/[^\s,;]+|\bwww\.[^\s,;]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|ar|net|org|io|app|dev|ai|co|info|edu|gob|uy|cl|mx|es)(?:\.[a-z]{2})?(?:\/[^\s,;]*)?/i);
 if(!m)return null;try{const raw=m[0].replace(/[.)]+$/,'');return keychainUrl(/^https?:\/\//i.test(raw)?raw:'https://'+raw);}catch{return null;}
}

function keychainColorChange(plan){
 S.pendingIntent=null;addMessage('assistant',plan.message);if(!plan.patch)return;
 const candidate=validate({...S.params,...plan.patch});apply(candidate,build(candidate),plan.note);
}
// Pedido sobre un llavero ya armado que la IA mandó por la ruta del llavero: se cambia lo pedido, sin rearmarlo de cero.
function keychainEdit(result){
 const base=S.params,patch={},url=result.params?.qrText&&result.params.qrText!==defaults.qrText?findUrl(result.params.qrText):null;
 if(url&&url!==base.qrText)patch.qrText=url;
 for(const key of ['width','height'])if(Number.isFinite(result.params?.[key])&&Math.round(result.params[key])!==base[key])patch[key]=Math.round(result.params[key]);
 const message=typeof result.message==='string'&&result.message.trim()?result.message.trim():'¿Qué querés cambiar del llavero? Puedo cambiar el tamaño, el enlace del QR o los colores del logo («el nombre en negro»).';
 if(!Object.keys(patch).length){addMessage('assistant',message);return;}
 const candidate=validate({...base,...patch}),built=build(candidate);addMessage('assistant',message);apply(candidate,built);
}
// Llavero logo + QR: se arma en el navegador con el archivo original, sin generar imágenes.
const colorsOf=built=>new Set(built.parts.slice(1).map(part=>part.color.toLowerCase())).size;
async function keychainFlow(prompt,attachment,epoch){
 const draft=S.keychainDraft||(S.keychainDraft={});
 S.pendingIntent='keychain';
 if(!draft.logo&&S.params.kind==='keychain'){draft.logo=S.params.keychain;draft.qrText??=S.params.qrText;}
 if(attachment){
  setBusy(true,'Leyendo el archivo adjunto…');const qr=await readQrImage(attachment.file);check(epoch);
  if(qr){draft.qrText=keychainUrl(qr);draft.qrName=attachment.name;}
  else{
   if(/\bqr\b/i.test(attachment.name)||draft.logo&&/\bqr\b/i.test(prompt)&&!/cambi[aá]|reemplaz|nuevo logo/i.test(prompt))throw Error('No pude leer el QR adjunto. Conservé el logo; probá con un PNG más nítido o escribí el enlace.');
   setBusy(true,'Preparando los colores y contornos del logo…');const r=await readKeychainLogo(attachment.file,attachment.name);check(epoch);draft.logo=r.config;
  }
 }
 const url=findUrl(prompt);if(url)draft.qrText=url;
 if(!draft.logo&&S.params.kind==='keychain')draft.logo=S.params.keychain;
 if(!draft.logo){S.pendingIntent='keychain';addMessage('assistant',(draft.qrText?'Leí el QR: lleva a '+draft.qrText+'. ':'Dale. ')+ 'Adjuntá el logo con el botón + (mejor un PNG con fondo transparente o un JPG con fondo blanco)'+(draft.qrText?'.':' y adjuntá el QR o decime su enlace.'));return;}
 if(!draft.qrText){S.pendingIntent='keychain';addMessage('assistant','Ya tengo el logo. Adjuntá la imagen del QR con el botón + o escribí la dirección a la que tiene que llevar.');return;}
 setBusy(true,'Armando las dos caras del llavero…');await tick();check(epoch);
 const name=draft.logo.name.replace(/\.[^.]+$/,'');
 const candidate=validate({...defaults,kind:'keychain',keychain:draft.logo,qrText:draft.qrText,project:('Llavero · '+name).slice(0,60),shape:'round',width:50,height:60,thickness:3.2,relief:.6,hole:4,baseColor:'#ffffff',detailColor:'#30213d',caption:''});
 const built=build(candidate);S.pendingIntent=null;S.keychainDraft=null;S.relief=null;
 addMessage('assistant','Listo: un llavero de 50 × 60 mm con bordes biselados y tu logo completo adelante, en '+colorsOf(built)+(colorsOf(built)===1?' color':' colores')+' sobre una base blanca, y el QR al ras del dorso que lleva a '+draft.qrText+'. '+(draft.qrName?'Leí el destino de '+draft.qrName+' y reconstruí sus módulos para imprimirlos con nitidez. ':'')+(keychainLogoNotes(draft.logo)?keychainLogoNotes(draft.logo)+' ':'')+'Podés cambiar el tamaño, el enlace o los colores en «Tu pieza». Revisá los filamentos en Bambu Studio e imprimí una muestra para escanearla.');
 apply(candidate,built,'Llavero con logo y QR');
}

async function assistantFlow(prompt,attachment,epoch){
 if(!S.assistantReady){addMessage('assistant','El asistente con IA no está disponible en este servidor. Podés abrir un proyecto, importar un STL o armar un llavero con logo y QR.');return;}
 const base=S.params,params=Object.fromEntries(assistantFields.filter(k=>k in base).map(k=>[k,base[k]]));
 const currentEngine=!hasPiece()?'none':base.forge?(isSculpt(base.forge)?'sculpt':'forge'):base.sourceInfo?'relief':base.kind==='keychain'?'keychain':base.kind==='free'?'cad':'template';
 const body={prompt,currentEngine,style:S.settings,params,history:recentHistory().slice(0,-1),
  ...(attachment?{imageDataUrl:attachment.dataUrl}:{}),
  ...(base.sourceInfo?{pendingGeneration:base.sourceInfo}:{}),
  ...(base.importedMesh&&!base.sourceInfo?{importedSummary:{name:base.project,size:sizeOf(S.model||build(base)),...describeImport(S.api,base.importedMesh)}}:{})};
 let result,checked=null,correction;
 for(let attempt=1;attempt<=3;attempt++){
  if(attempt>1)setBusy(true,'Revisando la pieza y corrigiendo medidas…');
  result=await post('/api/assistant',{...body,...(correction?{correction}:{})});check(epoch);
  if(S.params!==base)throw Error('Cambiaste la pieza mientras pensaba. Volvé a enviar el pedido para incluir esos cambios.');
  if(result.route==='relief')return reliefFlow(result,attachment,epoch);
  if(result.route==='forge'){addMessage('assistant',result.message);return forgeFlow('generate',result.forgePrompt,epoch,undefined,result.expectedSize,{title:prompt});}
  if(result.route==='sculpt'){addMessage('assistant',result.message);return sculptFlow('generate',result.forgePrompt,epoch,{expected:result.expectedSize,attachment,title:prompt});}
  if(result.route==='keychain'&&base.kind==='keychain'&&!attachment&&!isTwoSidedKeychain(prompt))return keychainEdit(result);
  if(result.route==='keychain'){const url=result.params?.qrText&&result.params.qrText!==defaults.qrText?findUrl(result.params.qrText):null;if(url)(S.keychainDraft||(S.keychainDraft={})).qrText=url;return keychainFlow(prompt,attachment,epoch);}
  if(!result.canApply){addMessage('assistant',result.message);return;}
  try{checked=checkProposal(S.api,base,result);break;}catch(e){correction={error:e.message.slice(0,1500),program:result.params.freeDesign??null};}
 }
 if(!checked){
  const status=await forgeAvailability();check(epoch);
  if(status.generate){addMessage('assistant','Con el modelado por medidas no me cerró. Lo intento con el generador avanzado.');return forgeFlow('generate',prompt,epoch);}
  addMessage('assistant','No pude construir una pieza válida con ese pedido. Probá con medidas más simples o describila por partes.');return;
 }
 addMessage('assistant',result.message);
 const clean=withoutLeftovers(checked.candidate);
 let candidate=checked.candidate,built=checked.built;
 if(clean!==checked.candidate){S.relief=null;candidate=validate(clean);built=build(candidate);}
 // Una pieza nueva toma el nombre del pedido en vez de «Mi pieza».
 if(!hasPieceParams(base)&&(!built.params.project||built.params.project==='Mi pieza'||built.params.project===defaults.project))built.params={...built.params,project:shortName(prompt)};
 apply(candidate,built);
}

// Relieve: con imagen adjunta se usa tal cual; si no, se genera. Cambiar medidas después no vuelve a generar.
async function reliefFlow(result,attachment,epoch){
 const spec=validateGeneration(result.generation);addMessage('assistant',result.message);
 // direct: la imagen es la propia (logo o dibujo) y se convierte tal cual. reference: la foto o imagen original
 // de la persona, que se conserva para volver a dibujar con otros colores o medidas.
 let image=null,invert=false,direct=false,reference=attachment?.dataUrl||S.relief?.reference||null;
 const samePalette=S.relief&&(S.relief.spec.palette||[]).join()===spec.palette.join();
 if(attachment&&!spec.redraw){image=attachment.dataUrl;direct=true;}
 // Una imagen propia se vuelve a convertir con los colores nuevos, sin redibujarla.
 else if(!attachment&&S.relief&&S.relief.spec.subject===spec.subject&&(samePalette||S.relief.direct)){image=S.relief.image;invert=S.relief.invert;direct=S.relief.direct;}
 else{
  // Una foto se redibuja en colores planos; pasar a colores (o cambiarlos) también redibuja, con la original de referencia.
  if(!/^data:image\/(png|jpeg);base64,/.test(reference||'')||reference.length>850000)reference=null;
  setBusy(true,reference&&spec.redraw?'Dibujando el retrato en colores a partir de la foto… puede tardar hasta dos minutos.':spec.palette.length?'Dibujando el motivo en sus colores… puede tardar hasta dos minutos.':'Dibujando la imagen del relieve… puede tardar hasta dos minutos.');
  const data=await post('/api/assistant',{action:'generateVisual',spec,...(reference?{imageDataUrl:reference}:{})},200000);check(epoch);image=data.imageDataUrl;
 }
 setBusy(true,spec.palette.length?'Separando los colores en partes…':'Construyendo el relieve en 3D…');await tick();
 const mesh=await reliefFromImage(image,spec,{invert});check(epoch);
 const candidate=validate(generatedParams(S.params,mesh,spec)),built=build(candidate);
 S.relief={image,spec,invert,direct,reference};
 if(mesh.missing?.length)addMessage('assistant','No encontré en la imagen '+(mesh.missing.length===1?'el color '+mesh.missing[0]:'los colores '+mesh.missing.join(', '))+'; la pieza quedó con el resto.');
 apply(candidate,built,(spec.palette.length?'Relieve en '+spec.palette.length+' colores de ':'Relieve de ')+spec.width+' × '+spec.height+' mm');
}
async function rebuildRelief(spec,invert=S.relief?.invert){
 if(!S.relief)return;
 try{const s=validateGeneration({...S.relief.spec,...spec,mode:'relief'}),mesh=await reliefFromImage(S.relief.image,s,{invert});const candidate=validate(generatedParams(S.params,mesh,s)),built=build(candidate);pushHistory();S.relief={...S.relief,spec:s,invert};markDirty();refresh({keepView:true,built});}
 catch(e){toast(e.message);}
}

// Nombre corto a partir del pedido: hasta la primera coma o punto.
function shortName(text){const first=String(text||'').split(/[.,;:\n]/)[0].trim().replace(/^(quiero|necesito|me gustaría|haceme|hacé|creá|crear|hacer|generar|diseñar|diseñá|armá|armar)\s+/i,'').replace(/^(un|una|el|la)\s+/i,'');return (first.charAt(0).toUpperCase()+first.slice(1)).slice(0,48)||'Mi pieza';}

// Generador avanzado (OpenSCAD): para formas orgánicas o lo que el modelado por medidas no resuelve.
async function forgeAvailability(){
 if(S.forgeStatus===undefined){try{const r=await fetch('/api/forge');S.forgeStatus=r.ok&&(r.headers.get('content-type')||'').includes('application/json')?await r.json():null;}catch{S.forgeStatus=null;}}
 const s=S.forgeStatus;const runs=!!s&&(s.local||(s.remote&&s.enabled));
 return {example:runs,compile:runs&&!!s.compiler,generate:runs&&!!s.compiler&&!!s.ai};
}
// Problemas verificables de una pieza generada: partes sueltas y medidas lejos de lo pedido.
function forgeProblems({built,inverted},expected){
 const problems=[],pieces=meshParts(built.combined),parts=pieces.length,got=built.dimensions,axes=['ancho','profundidad','alto'];
 // La app ya la dio vuelta para medirla bien, pero las restas de OpenSCAD sobre una malla al revés pueden tapar agujeros o huecos.
 if(inverted)problems.push('salió con las caras hacia adentro y algún agujero o hueco puede haber quedado tapado: en cada polyhedron() los puntos de cada cara van en sentido horario mirando la pieza desde afuera, así que invertí ese orden (o usá sphere, hull y scale en lugar de polyhedron) para que las restas funcionen');
 if(parts>1)problems.push('tiene '+parts+' partes que no se tocan y se imprimirían sueltas ('+describeLoose(pieces)+'): metelas al menos 1,5 mm dentro de la parte vecina para que todo sea un solo sólido continuo');
 const off=(expected||[]).map((want,i)=>want>0&&Math.abs(got[i]-want)>Math.max(2,want*.05)?axes[i]+' '+want+' mm':'').filter(Boolean);
 let contact=0;try{const r=reviewPrint(built.combined,built.volume);if(r.issues.some(i=>i.kind==='contact')){contact=1;problems.push('apoya muy poco en la cama ('+Math.round(r.contactArea)+' mm²): bajá el modelo 2 mm y cortalo plano en z=0 para que tenga una base amplia');}}catch{}
 if(off.length)problems.push('mide '+sizeText(got)+' y tiene que medir '+off.join(', ')+': ajustá la escala de toda la pieza (por ejemplo envolviéndola en scale) para llegar a esas medidas, conservando las proporciones');
 return {problems,score:parts-1+off.length+contact+(inverted?1:0)};
}
// Dónde está cada parte suelta, en palabras, para que la corrección sepa qué unir.
function describeLoose(pieces){
 const min=[0,1,2].map(j=>Math.min(...pieces.map(p=>p.min[j]))),max=[0,1,2].map(j=>Math.max(...pieces.map(p=>p.max[j])));
 const where=(p,j,words)=>{const c=((p.min[j]+p.max[j])/2-min[j])/Math.max(1e-6,max[j]-min[j]);return c<.34?words[0]:c>.66?words[2]:words[1];};
 return pieces.slice(1,4).map(p=>{const size=p.max.map((v,j)=>Math.max(1,Math.round(v-p.min[j]))).join(' × ');return 'una parte de '+size+' mm '+[where(p,2,['abajo','a media altura','arriba']),where(p,1,['adelante','en el centro','atrás']),where(p,0,['a la izquierda','al medio','a la derecha'])].join(', ');}).join('; ');
}
// Último recurso: detalles sueltos diminutos (menos del 2 % de la superficie) se quitan del STL.
function dropTinyParts(api,base,result,archive,checked){
 // Sobre la malla compilada, no la terminada: el acabado se vuelve a aplicar al armar la pieza.
 const raw=checked.candidate.importedMesh,mesh={numProp:3,positions:Float32Array.from(raw.vertices),triangles:Uint32Array.from(raw.triangles)};
 const pieces=meshParts(mesh),total=pieces.reduce((a,p)=>a+p.area,0);
 if(pieces.length<2||pieces.slice(1).some(p=>p.area>total*.02))return null;
 const bytes=stlBytes(keepParts(mesh,[pieces[0]]));let bin='';for(let i=0;i<bytes.length;i+=32768)bin+=String.fromCharCode(...bytes.subarray(i,i+32768));
 return {checked:prepareForgeProposal(api,base,{...result,files:{stl:btoa(bin)}},archive),removed:pieces.length-1};
}
async function forgeFlow(action,prompt,epoch,scad,expected=null,{polish=true,note='Pieza generada',title=prompt}={}){
 const status=await forgeAvailability();check(epoch);
 if(!status[action]){addMessage('assistant',action==='generate'?'Esta pieza necesita el generador avanzado, que no está disponible en este momento. Probá describirla con medidas y formas simples.':'El generador avanzado no está disponible en este momento.');return;}
 const archive=S.params.forge,previous=archive?.revisions.find(r=>r.id===archive.selected);
 setBusy(true,action==='generate'?'Modelando la pieza con el generador avanzado… puede tardar unos minutos.':'Preparando la pieza…');
 const body=action==='example'?{action}:action==='compile'?{action,scad}:{action,prompt,history:recentHistory().slice(-8).map(m=>({...m,content:m.content.slice(0,2000)})),...(previous?{previous:previous.scad,previousFinish:finishOf(S.params.freeDesign)}:{})};
 let result=await post('/api/forge',body,345000);check(epoch);
 let revision=action==='compile'?{...previous}:revisionFromResult(result,action==='example'?'Árbol VERO y ALE · ejemplo':prompt);
 let nextArchive=action==='compile'?archive:appendForgeRevision(archive,revision);
 const base=action==='generate'&&!S.params.forge?{...S.params,project:shortName(title),keepProject:true}:S.params;
 let checked=prepareForgeProposal(S.api,base,result,nextArchive);
 // Se verifica la pieza real; si tiene partes sueltas o no llega a las medidas pedidas, se corrige sola una vez.
 let review=action==='generate'?forgeProblems(checked,expected):{problems:[],score:0};
 if(review.problems.length){
  setBusy(true,'Revisando medidas y uniones de la pieza…');
  try{
   result=await post('/api/forge',{action:'generate',prompt:'Corregí la versión anterior porque '+review.problems.join('; y ')+'. No cambies nada más.',history:[],previous:revision.scad},345000);check(epoch);
   const fixed=revisionFromResult(result,prompt+' · corregida'),fixedArchive=appendForgeRevision(nextArchive,fixed),fixedCheck=prepareForgeProposal(S.api,base,result,fixedArchive),fixedReview=forgeProblems(fixedCheck,expected);
   if(fixedReview.score<review.score){revision=fixed;nextArchive=fixedArchive;checked=fixedCheck;review=fixedReview;}
  }catch(e){if(e instanceof Stale)throw e;}
 }
 if(action==='generate'&&countParts(checked.built.combined)>1){const cleaned=dropTinyParts(S.api,base,result,nextArchive,checked);if(cleaned){checked=cleaned.checked;review=forgeProblems(checked,expected);addMessage('assistant','Quité '+(cleaned.removed===1?'un detalle suelto muy chico':cleaned.removed+' detalles sueltos muy chicos')+' que no se iba'+(cleaned.removed===1?'':'n')+' a poder imprimir.');}}
 S.relief=null;
 if(action==='example')addMessage('assistant',revision.description);
 else if(review.problems.length)addMessage('assistant','Ojo: la pieza '+review.problems[0].split(':')[0]+'. Pedime que lo ajuste o mirá «Tu pieza».');
 apply(checked.candidate,checked.built,action==='compile'?'Versión recuperada':note);
 if(action==='generate'&&polish)await polishShape(prompt,epoch,fixes=>forgeFlow('generate','Mejorá la forma de la versión anterior: '+fixes,epoch,undefined,expected,{polish:false,note:'Forma pulida'}));
}
// Figuras orgánicas: OpenAI describe piezas suaves que se funden y el navegador arma un solo sólido cerrado,
// con base plana y a la medida pedida. No necesita OpenSCAD. Pasa por los mismos controles, el acabado y la revisión visual.
async function sculptFlow(action,prompt,epoch,{expected=null,attachment=null,polish=true,note='Figura generada',title=prompt}={}){
 const archive=S.params.forge,previous=archive?.revisions.find(r=>r.id===archive.selected),before=previous?.sculpt?S.model?.dimensions:null;
 let result;
 if(action==='compile')result={...previous};
 else{
  setBusy(true,'Esculpiendo la figura… puede tardar un par de minutos.');
  result=await post('/api/assistant',{action:'sculpt',prompt,history:recentHistory().slice(-8).map(m=>({...m,content:m.content.slice(0,2000)})),
   ...(previous?.sculpt?{previous:previous.sculpt,previousFinish:finishOf(S.params.freeDesign)}:{}),
   ...(expected?{expectedSize:expected}:{}),...(attachment?{imageDataUrl:attachment.dataUrl}:{})},200000);check(epoch);
 }
 // Medida final: la pedida; si no, la de la versión anterior (un cambio no la achica ni la agranda); si no, 80 mm de alto.
 const target=action==='compile'?result.sculpt.target||null:expected?.some(v=>v>0)?expected:before?[0,0,Math.round(before[2]*10)/10]:null;
 const sized=r=>({...r.sculpt,...(target?{target}:{})});
 setBusy(true,'Armando la figura en 3D…');await tick();check(epoch);
 let mesh=buildSculpt(S.api,sized(result),{name:shortName(title)});check(epoch);
 // Una pieza que se ve (ala, cola, pata) y quedó suelta se pide pegar una vez, en vez de perderla sin avisar.
 const lost=[...new Set(mesh.loose.filter(l=>l.share>.005).map(l=>l.name))];
 if(action==='generate'&&lost.length){
  setBusy(true,'Pegando partes que quedaron sueltas…');
  try{
   const fixed=await post('/api/assistant',{action:'sculpt',prompt:'Estas piezas quedaron separadas del resto de la figura y se perderían al imprimir: '+lost.join(', ')+'. Movelas o agrandalas para que entren al menos 2 mm dentro de su vecina (el cuerpo, la cabeza o la base). No cambies nada más.',history:[],previous:result.sculpt,previousFinish:result.finish},200000);check(epoch);
   const again=buildSculpt(S.api,sized(fixed),{name:shortName(title)}),share=m=>m.loose.reduce((a,l)=>a+l.share,0);check(epoch);
   if(share(again)<share(mesh)){result={...fixed,description:result.description,assumptions:result.assumptions};mesh=again;}
  }catch(e){if(e instanceof Stale)throw e;}
 }
 const revision=action==='compile'?previous:revisionFromResult({...result,sculpt:{...sized(result),placement:mesh.placement}},prompt);
 const nextArchive=action==='compile'?archive:appendForgeRevision(archive,revision);
 const base=action==='generate'&&!S.params.forge?{...S.params,project:shortName(title),keepProject:true}:S.params;
 const checked=prepareForgeProposal(S.api,base,{mesh},nextArchive);
 const review=forgeProblems(checked,target);
 S.relief=null;
 for(const text of mesh.notes)addMessage('assistant',text);
 if(action!=='compile'&&sculptPalette(revision.sculpt)?.merged)addMessage('assistant','La figura pedía más de 4 colores: uní los más parecidos para que entre en los 4 carretes del AMS.');
 if(review.problems.length)addMessage('assistant','Ojo: la figura '+review.problems[0].split(':')[0]+'. Pedime que lo ajuste o mirá «Tu pieza».');
 apply(checked.candidate,checked.built,action==='compile'?'Versión recuperada':note);
 if(action==='generate'&&polish)await polishShape(prompt,epoch,fixes=>sculptFlow('generate','Mejorá la forma de la versión anterior: '+fixes,epoch,{expected:target,polish:false,note:'Forma pulida',title}));
}
// Revisión visual: Alfred mira la pieza desde tres lados; si no se reconoce bien lo pedido, la pule una vez.
async function critique(subject,epoch){
 try{const images=viewer.snapshots();if(!images.length)return null;const r=await post('/api/assistant',{action:'critique',subject,images},120000);check(epoch);return typeof r?.score==='number'?r:null;}
 catch(e){if(e instanceof Stale)throw e;return null;}
}
async function polishShape(prompt,epoch,regenerate){
 setBusy(true,'Mirando cómo quedó…');await tick();
 const first=await critique(prompt,epoch);
 if(!first||first.score>=8||!first.fixes)return;
 setBusy(true,'Puliendo la forma para que se reconozca mejor…');
 try{await regenerate(first.fixes);}
 catch(e){if(e instanceof Stale)throw e;return;}
 setBusy(true,'Comparando con la versión anterior…');await tick();
 const second=await critique(prompt,epoch);
 if(second&&second.score<first.score&&S.history.length){S.params=S.history.pop();S.future=[];refresh();addMessage('event','Volví a la primera versión: se reconocía mejor');}
 else if(second?.verdict)addMessage('assistant',second.verdict);
}
async function forgeVersion(id){
 const archive=S.params.forge,revision=archive?.revisions.find(r=>r.id===id);if(!revision||S.busy)return;
 const epoch=S.epoch;S.controller=new AbortController();
 const before=S.params;S.params={...S.params,forge:{...archive,selected:id}};
 try{await (revision.sculpt?sculptFlow('compile','',epoch):forgeFlow('compile','',epoch,revision.scad));}catch(e){if(!(e instanceof Stale)){S.params=before;toast(e.message);}}finally{if(epoch===S.epoch)setBusy(false);}
}
function forgeSource(id){const r=S.params.forge?.revisions.find(x=>x.id===id);if(!r)return;if(r.sculpt)download(JSON.stringify(r.sculpt,null,1),'alfred-figura-'+r.id.slice(0,8)+'.json','application/json');else download(r.scad,'alfred-'+r.id.slice(0,8)+'.scad','text/plain');}

$('stopAssistant').onclick=()=>S.controller?.abort();

// ---------- Composer y adjuntos ----------
const prompt=$('prompt');
function autosize(){prompt.style.height='auto';prompt.style.height=Math.min(prompt.scrollHeight,180)+'px';}
prompt.addEventListener('input',autosize);
prompt.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('composer').requestSubmit();}});
$('composer').addEventListener('submit',e=>{e.preventDefault();send();});
for(const b of document.querySelectorAll('[data-suggestion]'))b.onclick=()=>{prompt.value=b.dataset.suggestion;autosize();prompt.focus();};
const menu=$('attachMenu');
$('attachToggle').onclick=e=>{e.stopPropagation();menu.hidden=!menu.hidden;$('attachToggle').setAttribute('aria-expanded',String(!menu.hidden));};
addEventListener('click',e=>{if(!menu.hidden&&!e.target.closest('.attach')){menu.hidden=true;$('attachToggle').setAttribute('aria-expanded','false');}});
for(const b of menu.querySelectorAll('[data-attach]'))b.onclick=()=>{
 menu.hidden=true;const kind=b.dataset.attach;
 if(kind==='image'){S.imageTarget='attach';$('imageFile').click();}
 else if(kind==='model')$('modelFile').click();
 else if(kind==='project')$('importProject').click();
 else openSparePart(S.settings,text=>{prompt.value=text;autosize();send();});
};
function clearAttachment(){S.attachment=null;$('attachments').hidden=true;$('attachments').replaceChildren();}
function showAttachment(){
 const a=S.attachment,host=$('attachments');host.replaceChildren();if(!a){host.hidden=true;return;}
 const chip=document.createElement('div');chip.className='chip';
 const img=document.createElement('img');img.src=a.preview;img.alt='';
 const name=document.createElement('span');name.textContent=a.name;
 const measure=document.createElement('button');measure.type='button';measure.className='ghost';measure.textContent='Medir';measure.title='Medir en la foto con una referencia de tamaño';
 measure.onclick=()=>openPhotoMeasure(a.dataUrl,text=>{prompt.value=(prompt.value.trim()?prompt.value.trim()+' ':'')+text;autosize();prompt.focus();});
 const remove=document.createElement('button');remove.type='button';remove.className='ghost';remove.textContent='Quitar';remove.onclick=clearAttachment;
 chip.append(img,name,measure,remove);host.append(chip);host.hidden=false;
}
async function imageDataUrl(file,max=768){
 const bitmap=await createImageBitmap(file);
 try{const scale=Math.min(max/bitmap.width,max/bitmap.height,1),c=document.createElement('canvas');c.width=Math.max(1,Math.round(bitmap.width*scale));c.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(bitmap,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.82);}finally{bitmap.close();}
}
$('imageFile').onchange=async()=>{
 const file=$('imageFile').files[0];$('imageFile').value='';if(!file)return;
 try{
  if(!['image/png','image/jpeg'].includes(file.type)||file.size>10e6)throw Error('Elegí una imagen PNG o JPG de hasta 10 MB.');
  if(S.imageTarget==='logo'){const r=await readKeychainLogo(file,file.name);update({keychain:r.config},{rerender:true});toast('Logo actualizado.');return;}
  const dataUrl=await imageDataUrl(file);if(dataUrl.length>850000)throw Error('La imagen es demasiado compleja. Probá con una más chica.');
  S.attachment={file,name:file.name,dataUrl,preview:dataUrl};showAttachment();prompt.focus();
 }catch(e){toast(e.message);}finally{S.imageTarget='attach';}
};

// ---------- Proyectos: nuevo, importar, abrir, guardar ----------
function resetProject(next=emptyParams()){
 S.epoch++;S.controller?.abort();S.busy=false;S.params=next;S.history=[];S.future=[];S.conversation=[];S.projectId=null;S.relief=null;S.pendingIntent=null;S.keychainDraft=null;S.dirty=false;
 clearAttachment();setBusy(false);renderConversation();viewer.setView('perspective');
 for(const b of ['viewPerspective','viewFront','viewBack'])pressed(b,b==='viewPerspective');
}
$('newProject').onclick=()=>{if(S.dirty&&hasPiece()&&!confirm('¿Empezar una pieza nueva? Los cambios sin guardar de esta se pierden.'))return;resetProject();refresh();prompt.focus();};
$('modelFile').onchange=async()=>{
 const file=$('modelFile').files[0];$('modelFile').value='';if(!file)return;
 try{
  if(!S.api)throw Error('El motor 3D todavía se está preparando. Probá en unos segundos.');if(file.size>80e6)throw Error('El archivo supera 80 MB.');
  toast('Leyendo '+file.name+'…');await tick();
  const bytes=new Uint8Array(await file.arrayBuffer()),saved=savedProjectIn(file.name,bytes);let warning='';
  // A 3MF saved by Alfred opens as the project it is (parts, colors, logo and QR), not as a single-color mesh.
  if(saved){
   try{const candidate=validate(saved),built=build(candidate);resetProject(candidate);refresh({built});addMessage('assistant','Abrí tu proyecto «'+candidate.project+'» tal como lo guardaste: '+sizeText(S.model.dimensions)+(S.model.parts?.length>1?', con sus '+S.model.parts.length+' partes y colores':'')+'. Podés seguir cambiándolo.');return;}
   catch(e){warning='Este 3MF es un proyecto de Alfred, pero no lo pude abrir como proyecto ('+e.message+'). Lo traje solo como forma 3D, de un color. ';}
  }
  const read=readMeshFile(file.name,bytes),prepared=prepareImport(S.api,read);
  resetProject({...emptyParams(),project:read.name.slice(0,60)||'Pieza importada',importedMesh:prepared.mesh,freeDesign:{version:1,nodes:[{type:'imported',position:[0,0,0],rotation:[0,0,0]}]}});
  refresh();if(!S.model)throw Error('No se pudo construir una pieza con ese archivo.');
  const notes=[read.parts>1?'Tenía '+read.parts+' partes y las uní en una sola.':'',prepared.tolerance?'La simplifiqué de '+prepared.original.toLocaleString('es-AR')+' a '+prepared.triangles.toLocaleString('es-AR')+' triángulos para trabajar más ágil.':''].filter(Boolean).join(' ');
  addMessage('assistant',warning+'Abrí «'+read.name+'»: mide '+sizeText(S.model.dimensions)+'. '+notes+' ¿Qué le cambiamos? Por ejemplo: grabarle un nombre, agregarle un agujero o recortarla.');
 }catch(e){toast('No se pudo importar: '+e.message);}
};
$('importProject').onchange=async()=>{
 const file=$('importProject').files[0];$('importProject').value='';if(!file)return;
 try{if(file.size>40e6)throw Error('El proyecto es demasiado grande.');const candidate=validate(projectFromBytes(file.name,new Uint8Array(await file.arrayBuffer())));build(candidate);resetProject(candidate);refresh();toast('Proyecto abierto.');}
 catch(e){toast('No se pudo abrir: '+e.message);}
};
async function storeVersion(note){
 if(!S.model)throw Error('Todavía no hay una pieza para guardar.');S.projectId=S.projectId||crypto.randomUUID();
 const projectId=S.projectId,params=S.params,owner=currentUser()?.id;
 const version={id:crypto.randomUUID(),projectId,date:new Date().toISOString(),name:params.project,note,params:validate(params),thumb:thumbnail(viewer.capture()),...(owner?{owner,cloud:false}:{})};
 await saveVersion(version);
 if(S.params===params){S.dirty=false;updateSaved();}
 // Con la cuenta abierta también va a la nube; si falla, sube en la próxima sincronización.
 pushVersion(version).catch(()=>{});
 removeFromCloud(await pruneProject(projectId)).catch(()=>{});updateCount();
}
async function saveCurrent(){
 try{await storeVersion('Guardado a mano');toast('Guardado en «Mis diseños».');}
 catch(e){toast('No se pudo guardar: '+e.message);}
}
// Arma la pieza de una versión guardada y descarga su 3MF, sin abrirla ni tocar la pieza actual.
async function downloadVersion(v){
 toast('Preparando el archivo…');await tick();
 try{const m=build(validate(await versionParams(v)));download(threeMfBytes(m),revisionName(v.name)+'.3mf','model/3mf');toast('Descarga iniciada: '+sizeText(m.dimensions)+'.');}
 catch(e){toast('No se pudo descargar: '+e.message);}
}
$('saveVersion').onclick=saveCurrent;
function updateCount(){countProjects().then(n=>{$('savedCount').textContent=n;}).catch(()=>{});}
async function showLibrary(){
 const host=$('libraryList');host.replaceChildren();let projects=[];renderLibraryHint();
 try{projects=await listProjects();}catch{host.textContent='Este navegador no permite guardar proyectos.';}
 if(!projects.length&&!host.textContent)host.innerHTML='<p class="hint">Todavía no hay piezas. Las que arme Alfred se guardan solas acá.</p>';
 const open=async v=>{try{const candidate=validate(await versionParams(v));build(candidate);resetProject(candidate);S.projectId=v.projectId;refresh();$('library').close();toast('Abriste «'+v.name+'».');}catch(e){toast(e.message);}};
 for(const p of projects){
  const card=document.createElement('article');card.className='library-card';
  const img=document.createElement('img');img.alt='';if(p.latest.thumb)img.src=p.latest.thumb;
  const info=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('small');title.textContent=p.name;meta.textContent=new Date(p.latest.date).toLocaleDateString('es-AR')+' · '+p.versions.length+(p.versions.length>1?' versiones':' versión');info.append(title,meta);
  const actions=document.createElement('div');actions.className='library-actions';
  const openBtn=document.createElement('button');openBtn.className='primary';openBtn.textContent='Abrir';openBtn.onclick=()=>open(p.latest);
  const list=document.createElement('ol');list.className='version-list';list.hidden=true;
  for(const v of p.versions){
   const li=document.createElement('li'),b=document.createElement('button'),file=document.createElement('button');
   b.className='link';b.textContent=new Date(v.date).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})+(v.note?' · '+v.note:'');b.title='Abrir esta versión';b.onclick=()=>open(v);
   file.className='link';file.textContent='3MF';file.title='Descargar esta versión para Bambu Studio';file.onclick=()=>downloadVersion(v);
   li.append(b,' ',file);list.append(li);
  }
  const fileBtn=document.createElement('button');fileBtn.textContent='Descargar 3MF';fileBtn.onclick=()=>downloadVersion(p.latest);
  const versions=document.createElement('button');versions.textContent='Versiones ('+p.versions.length+')';versions.onclick=()=>{list.hidden=!list.hidden;};
  const remove=document.createElement('button');remove.className='ghost';remove.textContent='Eliminar';remove.onclick=async()=>{if(!confirm('¿Eliminar «'+p.name+'» y sus '+p.versions.length+' versiones? No se puede deshacer.'))return;removeFromCloud(await deleteProject(p.projectId)).catch(()=>{});if(S.projectId===p.projectId)S.projectId=null;updateCount();showLibrary();};
  actions.append(openBtn,fileBtn,versions,remove);card.append(img,info,actions,list);host.append(card);
 }
 if(!$('library').open)$('library').showModal();
}
$('libraryToggle').onclick=()=>{showLibrary();syncNow({interactive:true});};

// ---------- Cuenta ----------
// Con la cuenta de Google, «Mis diseños» se guarda también en tu Google Drive y es el mismo en cualquier computadora (src/cloud.js).
function renderLibraryHint(){
 const user=currentUser(),hint=$('libraryHint');hint.replaceChildren();
 if(user){hint.textContent='Tus piezas se guardan solas en tu Google Drive ('+(user.email||accountName(user))+'), con sus versiones. Las ves en cualquier computadora donde entres con Google.';return;}
 hint.textContent='Cada pieza que arma Alfred se guarda sola en este navegador, con sus versiones. Desde acá podés volver a abrir o descargar el 3MF de cualquiera.';
 if(cloudConfigured){const b=document.createElement('button');b.type='button';b.className='link';b.textContent='Entrá con Google';b.onclick=enterAccount;hint.append(' ',b,' para tenerlas también en otras computadoras.');}
}
function renderAccount(){
 const user=currentUser(),b=$('account');b.hidden=!cloudConfigured;
 b.textContent=user?(user.given||accountName(user).split(/[\s@]/)[0]||'Mi cuenta'):'Entrar';
 b.title=user?'Cuenta: '+(user.email||accountName(user)):'Entrar con Google para ver tus diseños en cualquier computadora';
 if($('library').open)renderLibraryHint();
}
let syncing=null,lastSync=0;
// interactive solo desde un clic: si el permiso de Google venció, abre su ventana para renovarlo.
function syncNow({quiet=false,interactive=false}={}){
 if(!currentUser()||syncing)return syncing;
 lastSync=Date.now();
 syncing=syncLibrary({interactive}).then(r=>{if(r.needsToken)return;updateCount();if($('library').open)showLibrary();if(!quiet&&r.pulled+r.pushed)toast('«Mis diseños» está al día con tu Google Drive.');})
  .catch(e=>{if(!quiet)toast('No se pudieron sincronizar tus diseños: '+e.message);})
  .finally(()=>{syncing=null;});
 return syncing;
}
async function enterAccount(){
 try{const user=await signIn();renderAccount();toast('Entraste como '+(user.email||accountName(user))+'. Sincronizando tus diseños…');syncNow();}
 catch(e){toast('No se pudo entrar: '+e.message);}
}
$('account').onclick=async()=>{
 const user=currentUser();if(!user)return enterAccount();
 if(!confirm('Entraste como '+(user.email||accountName(user))+'.\n\n¿Cerrar la sesión en esta computadora? Tus diseños quedan guardados en tu Google Drive.'))return;
 try{await signOut();updateCount();if($('library').open)showLibrary();toast('Cerraste la sesión. Tus diseños siguen en tu Google Drive.');}
 catch(e){toast('No se pudo cerrar la sesión: '+e.message);}
};$('closeLibrary').onclick=()=>$('library').close();

// ---------- Imprimir ----------
const printer=createPrint({dialog:$('printDialog'),toast,app:{model:()=>S.model,params:()=>S.params,review:()=>S.review,settings:()=>S.settings,setSettings:s=>{S.settings=s;renderPieceStatus();},api:()=>S.api,capture:()=>viewer.capture(),colors:()=>S.model?partsOf(S.model,S.params).filter(p=>p.mesh.triangles.length).map(p=>p.color):[]}});
$('printOpen').onclick=()=>{if(!S.model){toast('Todavía no hay una pieza para imprimir.');return;}printer.open();};

// Pieza de ejemplo sin IA, para ver cómo funciona.
$('tryExample').onclick=async()=>{
 if(S.busy)return;const epoch=S.epoch;S.controller=new AbortController();
 addMessage('assistant','Te muestro una pieza de ejemplo: un árbol con dos nombres y un corazón. Después podés pedirme la tuya.');setBusy(true,'Preparando el ejemplo…');
 try{await forgeFlow('example','',epoch);}catch(e){if(!(e instanceof Stale))addMessage('assistant',e.message);}finally{if(epoch===S.epoch)setBusy(false);}
};

// ---------- Arranque ----------
updateMode();renderConversation();
renderAccount();preloadGoogle();
onAccountChange(()=>{renderAccount();updateCount();});
migrateLegacy().catch(()=>0).then(updateCount).then(()=>syncNow({quiet:true}));
// Al volver a esta pestaña se traen los cambios hechos en otra computadora.
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&Date.now()-lastSync>60000)syncNow({quiet:true});});
if(!S.assistantReady)fetch('/api/assistant').then(r=>r.ok?r.json():null).then(s=>{S.assistantReady=s?.enabled===true;}).catch(()=>{});
try{S.api=await Module({locateFile:p=>p.endsWith('.wasm')?wasmUrl:p});S.api.setup();refresh();}
catch(e){console.error(e);toast('No se pudo iniciar el motor 3D. Recargá la página.');}
window.addEventListener('beforeunload',e=>{if(S.dirty&&hasPiece()){e.preventDefault();e.returnValue='';}});
