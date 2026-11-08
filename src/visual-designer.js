import {validateGeneration} from './generation-spec.js';
import {reliefFromImage,generatedParams} from './relief.js';
import {validate,buildModel} from './model.js';

export function createVisualDesigner({host,getParams,getReference,begin,onProposal,onMessage,onError,onUnauthorized}){
 const panel=document.createElement('details');panel.id='visualDesigner';panel.className='visual-designer';panel.hidden=true;
 panel.innerHTML=`<summary>Crear un relieve visual</summary><div class="visual-body"><p class="hint">Relieve de un solo color sobre una base plana, con profundidad real. Revisá el motivo y las medidas antes de aplicar.</p><fieldset><label>Qué vamos a representar<textarea id="visualSubject" maxlength="1600" rows="2"></textarea></label><div class="fields"><label>Ancho · mm<input id="visualWidth" type="number" min="10" max="250" step="1" value="80"></label><label>Alto · mm<input id="visualHeight" type="number" min="10" max="250" step="1" value="80"></label></div><div class="fields"><label>Base · mm<input id="visualBase" type="number" min="1.2" max="8" step="0.2" value="2"></label><label>Profundidad · mm<input id="visualDepth" type="number" min="0.4" max="15" step="0.2" value="3"></label></div><label class="visual-invert"><input id="visualInvert" type="checkbox"> Elevar zonas oscuras</label><img id="visualImage" alt="Imagen usada para construir el relieve" hidden><button id="generateVisual" type="button" class="primary full">Generar ilustración y relieve</button><button id="referenceRelief" type="button" class="secondary full">Crear relieve de la imagen adjunta</button><button id="rebuildRelief" type="button" class="secondary full" hidden>Actualizar relieve con estas medidas</button></fieldset><p id="visualStatus" role="status"></p><p class="hint">La generación visual usa OpenAI. Una interpretación generada puede diferir del escudo o personaje original. Una imagen adjunta conserva mejor su identidad. La geometría y el proyecto se guardan al aplicar y exportar.</p><button id="closeVisual" class="subtle" type="button">Descartar este pedido visual</button></div>`;
 host.append(panel);
 const $=id=>panel.querySelector('#'+id);let imageDataUrl=null,version=0,working=false;
 function read(){return validateGeneration({mode:'relief',subject:$('visualSubject').value,width:Number($('visualWidth').value),height:Number($('visualHeight').value),baseThickness:Number($('visualBase').value),depth:Number($('visualDepth').value)});}
 function offer(spec){spec=validateGeneration(spec);version++;if(spec.subject!==$('visualSubject').value){imageDataUrl=null;$('visualImage').hidden=true;}$('rebuildRelief').hidden=!imageDataUrl;$('visualInvert').checked=false;$('visualSubject').value=spec.subject;for(const [key,id] of [['width','visualWidth'],['height','visualHeight'],['baseThickness','visualBase'],['depth','visualDepth']])$(id).value=spec[key];$('visualStatus').textContent='Pedido visual listo. Podés ajustar las medidas antes de generar.';panel.hidden=false;panel.open=true;}
 async function run(action){
  if(working)return;const task=begin();if(!task)return;
  const localVersion=version,base=structuredClone(getParams()),snapshot=JSON.stringify(base);working=true;panel.querySelector('fieldset').disabled=true;$('closeVisual').disabled=true;
  try{
   const spec=read();let source=imageDataUrl,invert=$('visualInvert').checked;
   if(action==='generate'){
    $('visualStatus').textContent='Generando la ilustración. Puede tardar hasta dos minutos…';
    const reference=getReference();
    const response=await fetch('/api/assistant',{method:'POST',signal:task.signal,headers:task.headers,body:JSON.stringify({action:'generateVisual',spec,...(reference?{imageDataUrl:reference}:{})})});
    const data=await response.json();if(response.status===401)onUnauthorized?.();if(!response.ok)throw Error(data.error||'No se pudo generar la ilustración.');source=data.imageDataUrl;invert=false;
   }else if(action==='reference'){
    source=getReference();if(!source)throw Error('Adjuntá primero una imagen con «Foto o dibujo» en el chat.');
   }
   if(!source)throw Error('Generá una ilustración o adjuntá una imagen primero.');
   task.signal.throwIfAborted();$('visualStatus').textContent='Construyendo y verificando la geometría 3D…';await new Promise(r=>setTimeout(r,30));
   const mesh=await reliefFromImage(source,spec,{invert}),candidate=validate(generatedParams(base,mesh,spec)),built=buildModel(task.api,candidate);
   if(localVersion!==version||!task.isCurrent()||snapshot!==JSON.stringify(getParams()))throw Error('El proyecto cambió durante la generación. Volvé a preparar el relieve sobre la pieza actual.');
   imageDataUrl=source;$('visualImage').src=source;$('visualImage').hidden=false;$('visualInvert').checked=invert;$('rebuildRelief').hidden=false;
   onProposal({candidate,built,snapshot});
   $('visualStatus').textContent='Relieve 3D construido. Revisá la vista previa y usá Aplicar.';panel.open=false;
   onMessage('Preparé un relieve de '+spec.width+' × '+spec.height+' mm, base de '+spec.baseThickness+' mm y hasta '+spec.depth+' mm de profundidad. Es una pieza con fondo plano; revisá el dibujo en la vista previa antes de aplicar.');
  }catch(error){if(localVersion===version&&task.isCurrent()){$('visualStatus').textContent=task.signal.aborted?'Generación detenida. Podés volver a intentarlo.':error.message;onError($('visualStatus').textContent);}}
  finally{working=false;panel.querySelector('fieldset').disabled=false;$('closeVisual').disabled=false;task.finish();}
 }
 $('generateVisual').onclick=()=>run('generate');$('referenceRelief').onclick=()=>run('reference');$('rebuildRelief').onclick=()=>run('rebuild');$('closeVisual').onclick=()=>{version++;panel.hidden=true;imageDataUrl=null;onMessage('Descarté el pedido visual pendiente.');};
 return {offer,reset(){version++;panel.hidden=true;imageDataUrl=null;},pending(){if(panel.hidden)return undefined;try{return read();}catch{return undefined;}}};
}
