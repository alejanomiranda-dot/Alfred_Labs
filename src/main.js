import './style.css';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import {defaults,validate,buildModel} from './model.js';
import {stlBytes,threeMfBytes} from './export.js';
import {revisionName,handoffZip,handoffFiles,writeFolder,saveAsFile} from './handoff.js';
import {traceBitmap} from './trace.js';
const $=id=>document.getElementById(id),storageKey='taller-vero-projects-v1';
let params={...defaults},model=null,api=null,timer,toastTimer,renderer,scene,camera,controls,group;
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',4200);}
function readLibrary(){try{return JSON.parse(localStorage.getItem(storageKey)||'[]');}catch{return [];}}
function updateCount(){$('savedCount').textContent=readLibrary().length;}
function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function basename(){return(params.project||'diseno').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/gi,'-').slice(0,60);}
function geometry(m){const g=new THREE.BufferGeometry();const xyz=[];for(let i=0;i<m.positions.length;i+=m.numProp)xyz.push(m.positions[i],m.positions[i+1],m.positions[i+2]);g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));g.setIndex(new THREE.BufferAttribute(m.triangles,1));g.computeVertexNormals();return g;}
function resetView(front=false){const halfFov=Math.min(camera.fov*Math.PI/360,Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect));const distance=Math.hypot(params.width,params.height)/2/Math.sin(halfFov)*1.08;camera.position.copy(new THREE.Vector3(front?0:.65,front?0:-.95,1.15).normalize().multiplyScalar(distance));controls.target.set(0,0,0);controls.update();}
function initializeViewer(){
 const host=$('viewer');scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(34,1,.1,2000);camera.up.set(0,0,1);
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.appendChild(renderer.domElement);
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=25;controls.maxDistance=400;controls.maxPolarAngle=Math.PI*.85;
 scene.add(new THREE.HemisphereLight(0xffffff,0x74836b,2.8));const light=new THREE.DirectionalLight(0xfff9eb,3.5);light.position.set(-40,-20,90);light.castShadow=true;light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-90;light.shadow.camera.right=90;light.shadow.camera.top=90;light.shadow.camera.bottom=-90;light.shadow.normalBias=.1;scene.add(light);
 const grid=new THREE.GridHelper(250,50,0xc7d1ba,0xd7decd);grid.rotation.x=Math.PI/2;grid.position.z=-.3;grid.material.transparent=true;grid.material.opacity=.55;scene.add(grid);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(1000,1000),new THREE.ShadowMaterial({opacity:.12}));floor.position.z=-.2;floor.receiveShadow=true;scene.add(floor);
 group=new THREE.Group();scene.add(group);
 const resize=()=>{const {width,height}=host.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();};new ResizeObserver(resize).observe(host);resize();resetView();
 renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
}
function draw(){
 while(group.children.length){const m=group.children[0];group.remove(m);m.geometry.dispose();m.material.dispose();}
 for(const [meshData,color] of [[model.base,params.baseColor],[model.detail,params.detailColor]]){const mesh=new THREE.Mesh(geometry(meshData),new THREE.MeshStandardMaterial({color,roughness:.65,metalness:0,flatShading:true}));mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
}
function setExportEnabled(enabled){for(const id of ['exportStl','export3mf'])$(id).disabled=!enabled;}
function render(){
 clearTimeout(timer);if(!api)return;
 model=null;setExportEnabled(false);
 try{
  if(!$('designForm').checkValidity())throw Error('Completá las medidas dentro de los límites indicados.');
  model=buildModel(api,params);params=model.params;
  if(renderer)draw();
  $('loading').style.display='none';$('dimensions').textContent=`${params.width} × ${params.height} mm`;$('totalHeight').textContent=`${(params.thickness+params.relief).toFixed(1).replace('.',',')} mm`;
  $('statusTitle').textContent='Geometría generada';$('statusText').textContent='Sólido cerrado. Pendiente de revisar en el laminador y probar impreso.';
  $('warnings').replaceChildren();for(const w of model.warnings){const el=document.createElement('div');el.className='warning';el.textContent=w;$('warnings').append(el);}setExportEnabled(true);
 }catch(error){$('statusTitle').textContent='Hay algo para revisar';$('statusText').textContent=error.message; $('warnings').replaceChildren();$('loading').style.display='block';$('loading').textContent='Corregí los datos para actualizar la pieza.';if(group)while(group.children.length){const child=group.children[0];group.remove(child);child.geometry.dispose();child.material.dispose();}}
}
function sync(){
 for(const key of Object.keys(defaults))if($(key)&&'value' in $(key))$(key).value=params[key];
 for(const button of document.querySelectorAll('[data-kind]'))button.classList.toggle('selected',button.dataset.kind===params.kind);
 for(const kind of ['tag','qr','logo'])$(kind+'Fields').hidden=params.kind!==kind;
 $('logoNote').textContent=params.logoPolygons?'Logo vectorial cargado. El relieve usa un solo color.':'Usá un SVG con formas rellenas y textos convertidos a curvas. Se crea un relieve de un color.';
 render();
}
$('designForm').addEventListener('submit',e=>e.preventDefault());
$('designForm').addEventListener('input',e=>{if(!(e.target.id in defaults))return;params[e.target.id]=e.target.type==='number'?Number(e.target.value):e.target.value;model=null;setExportEnabled(false);clearTimeout(timer);timer=setTimeout(render,180);});
for(const button of document.querySelectorAll('[data-kind]'))button.addEventListener('click',()=>{
 params.kind=button.dataset.kind;
 Object.assign(params,params.kind==='tag'?{project:'Chapita de Mora',width:45,height:32,baseColor:'#e9a08c',detailColor:'#fff8e9'}:params.kind==='qr'?{project:'Mi llavero QR',width:50,height:58,shape:'round',baseColor:'#fff8e9',detailColor:'#254e40'}:{project:'Mi llavero con logo',width:45,height:40,baseColor:'#254e40',detailColor:'#fff8e9'});sync();if(camera)resetView();
});
$('front').onclick=()=>resetView(true);$('perspective').onclick=()=>resetView();$('resetView').onclick=()=>resetView();
$('exportStl').onclick=()=>{render();if(model)download(stlBytes(model.combined),basename()+'.stl','model/stl');};
$('export3mf').onclick=async()=>{render();if(!model)return;try{const name=revisionName(params.project)+'.3mf',bytes=threeMfBytes(model);const result=await saveAsFile(window,bytes,name,'3mf');if(result.method==='download'){download(bytes,name,'model/3mf');toast('Descarga iniciada. La ubicación depende de la configuración del navegador.');}else if(result.method==='picker')toast('Archivo guardado. Abrilo o arrastralo a Bambu Studio.');}catch(e){toast('No se pudo guardar: '+e.message);}};
$('exportProject').onclick=()=>{try{download(JSON.stringify(validate(params),null,2),basename()+'.json','application/json');}catch(e){toast(e.message);}};
$('importProject').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>2e6)throw Error('El proyecto es demasiado grande.');const candidate=validate(JSON.parse(await file.text()));const previous=params;params=candidate;sync();if(!model){params=previous;sync();throw Error('El proyecto no pudo generar una pieza válida.');}if(camera)resetView();toast('Proyecto abierto.');}catch(error){toast('No se pudo abrir: '+error.message);}finally{e.target.value='';}};
$('save').onclick=()=>{try{render();if(!model)throw Error('Revisá el diseño antes de guardarlo.');const all=readLibrary();all.unshift({id:crypto.randomUUID(),date:new Date().toISOString(),params:validate(params)});localStorage.setItem(storageKey,JSON.stringify(all.slice(0,50)));updateCount();toast('Diseño guardado en este navegador.');}catch(error){toast('No se pudo guardar: '+error.message);}};
function showLibrary(){
 $('libraryList').replaceChildren();const all=readLibrary();if(!all.length){$('libraryList').textContent='Tu próximo diseño empieza acá. Guardá una pieza para encontrarla en esta biblioteca.';}
 all.forEach(item=>{const row=document.createElement('div');row.className='saved-row';const content=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('small');title.textContent=item.params.project;meta.textContent=new Date(item.date).toLocaleDateString('es-AR')+' · '+item.params.width+' × '+item.params.height+' mm';content.append(title,meta);const open=document.createElement('button');open.className='secondary';open.textContent='Abrir';open.onclick=()=>{try{params=validate(item.params);sync();if(camera)resetView();$('library').close();}catch(e){toast(e.message);}};const remove=document.createElement('button');remove.className='subtle';remove.textContent='Eliminar';remove.onclick=()=>{try{localStorage.setItem(storageKey,JSON.stringify(readLibrary().filter(x=>x.id!==item.id)));updateCount();showLibrary();}catch{toast('El navegador no permite modificar el guardado.');}};row.append(content,open,remove);$('libraryList').append(row);});
 if(!$('library').open)$('library').showModal();
}
$('libraryToggle').onclick=showLibrary;$('closeLibrary').onclick=()=>$('library').close();
$('logoFile').onchange=async e=>{
 try{
  const file=e.target.files[0];if(!file)return;if(file.size>500000)throw Error('Usá un SVG menor a 500 KB.');const source=await file.text();
  const documentXml=new DOMParser().parseFromString(source,'image/svg+xml');
  if(documentXml.querySelector('parsererror')||documentXml.documentElement.localName!=='svg')throw Error('El archivo no es un SVG válido.');
  if(documentXml.querySelector('script,image,use,foreignObject,text,style,filter,clipPath,mask')||/\bon\w+\s*=|(?:href|url)\s*[=(]/i.test(source))throw Error('Convertí textos y trazos a formas rellenas, sin imágenes, estilos externos ni máscaras.');
  const data=new SVGLoader().parse(source),polygons=[];
  for(const path of data.paths){if(path.userData?.style?.fill==='none')continue;for(const shape of SVGLoader.createShapes(path)){const p=shape.extractPoints(8);for(const contour of [p.shape,...p.holes])polygons.push(contour.map(v=>[v.x,v.y]));}}
  if(!polygons.length)throw Error('No se encontraron formas rellenas.');
  const candidate=validate({...params,logoPolygons:polygons});const check=buildModel(api,candidate);params=check.params;sync();toast('Logo importado como relieve.');
 }catch(error){toast(error.message);}finally{e.target.value='';}
};
setExportEnabled(false);updateCount();
try{initializeViewer();}catch(error){$('loading').textContent='La vista 3D necesita WebGL. Las exportaciones siguen disponibles.';console.error(error);}
try{api=await Module({locateFile:path=>path.endsWith('.wasm')?wasmUrl:path});api.setup();sync();}catch(error){$('loading').textContent='No se pudo iniciar el motor 3D. Recargá la página.';$('statusText').textContent=error.message;console.error(error);}

// Local handoff: the browser grants access only to the folder selected by Vero.
const handoff=document.createElement('section');handoff.className='handoff';
handoff.innerHTML='<h2>Tu carpeta de trabajos</h2><p>Guardá la pieza para Bambu Studio y una copia editable para volver a trabajarla.</p><div class="handoff-actions"><button id="chooseFolder" class="secondary">Elegir carpeta de trabajo</button><button id="saveFolder" class="secondary">Guardar trabajo en carpeta</button><button id="savePackage" class="primary">Descargar paquete ZIP</button></div><p id="folderStatus" class="hint">Sin carpeta elegida. El paquete ZIP funciona también si tu navegador no permite guardar en carpetas.</p><ol><li>Guardá el 3MF o extraé el ZIP.</li><li>En Bambu Studio: Archivo → Importar (Ctrl+I), o arrastrá el 3MF a la ventana.</li><li>Conservá las partes del mismo objeto y asigná los filamentos.</li><li>Elegí el perfil de tu A2L, laminá, revisá y enviá desde Bambu Studio.</li></ol><p class="hint">El 3MF contiene la pieza. La configuración de impresora y el laminado se guardan después desde Bambu Studio.</p>';
document.querySelector('.workspace').after(handoff);
$('export3mf').innerHTML='Guardar para Bambu Studio <span>↗</span>';
let directory=null;
$('chooseFolder').onclick=async()=>{if(!window.showDirectoryPicker){toast('Este navegador no permite elegir carpetas. Usá el paquete ZIP o abrí el taller en Chrome o Edge.');return;}try{directory=await window.showDirectoryPicker({id:'taller-vero-folder',mode:'readwrite'});$('folderStatus').textContent='Carpeta elegida: '+directory.name+'. Disponible durante esta sesión; cada guardado crea una revisión nueva.';}catch(e){if(e.name!=='AbortError')toast('El navegador no habilitó la carpeta. Podés usar el paquete ZIP.');}};
$('saveFolder').onclick=async()=>{if(!directory){toast('Elegí primero una carpeta, o descargá el paquete ZIP.');return;}try{if(await directory.requestPermission({mode:'readwrite'})!=='granted')throw Error('No se concedió acceso a la carpeta.');render();if(!model)throw Error('Revisá los datos del diseño.');const stem=revisionName(params.project),folder=await directory.getDirectoryHandle(stem,{create:true});await writeFolder(folder,handoffFiles(model,stem));$('folderStatus').textContent='Guardado en '+directory.name+' / '+stem+' · 3MF, proyecto editable y guía.';toast('Trabajo guardado en la carpeta.');}catch(e){toast('No se completó el guardado: '+e.message+' Puede haber archivos parciales; volvé a guardar una revisión.');}};
$('savePackage').onclick=async()=>{render();if(!model){toast('Revisá los datos del diseño.');return;}try{const stem=revisionName(params.project),bytes=handoffZip(model,stem),result=await saveAsFile(window,bytes,stem+'.zip','zip');if(result.method==='download')download(bytes,stem+'.zip','application/zip');else if(result.method==='picker')toast('Paquete guardado. Extraelo antes de abrir el 3MF.');}catch(e){toast('No se pudo guardar el paquete: '+e.message);}};

const imageTools=document.createElement('div');imageTools.className='image-tools';
imageTools.innerHTML='<label class="upload">Importar dibujo PNG o JPG<input id="rasterFile" type="file" accept="image/png,image/jpeg"></label><div id="traceControls" hidden><label>Contraste del contorno<input id="traceThreshold" type="range" min="30" max="240" value="150"></label><label><input id="traceInvert" type="checkbox"> Invertir figura y fondo</label><canvas id="tracePreview" width="128" height="128" aria-label="Vista del dibujo convertido"></canvas><button id="applyTrace" type="button" class="secondary full">Usar este contorno en relieve</button></div><p class="hint">Para logos oscuros sobre fondo claro y siluetas simples. Una fotografía no se reconstruye como objeto 3D: se convierte su contraste en un contorno plano.</p>';
$('logoNote').after(imageTools);let raster=null,traced=null;
function updateTrace(){traced=null;if(!raster)return;const canvas=$('tracePreview'),ctx=canvas.getContext('2d');try{const result=traceBitmap(raster.data,raster.width,raster.height,Number($('traceThreshold').value),$('traceInvert').checked);traced=result.polygons;const image=ctx.createImageData(raster.width,raster.height);result.mask.forEach((v,i)=>{image.data[i*4]=image.data[i*4+1]=image.data[i*4+2]=v?37:255;image.data[i*4+3]=255;});ctx.putImageData(image,0,0);$('applyTrace').disabled=false;}catch(e){$('applyTrace').disabled=true;ctx.clearRect(0,0,canvas.width,canvas.height);toast(e.message);}}
$('rasterFile').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>10e6)throw Error('Usá una imagen menor a 10 MB.');if(!['image/png','image/jpeg'].includes(file.type))throw Error('Usá PNG o JPG.');const image=await createImageBitmap(file);try{const scale=Math.min(128/image.width,128/image.height,1),canvas=$('tracePreview');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);raster=ctx.getImageData(0,0,canvas.width,canvas.height);}finally{image.close();}$('traceControls').hidden=false;updateTrace();}catch(e){toast(e.message);}finally{e.target.value='';}};
$('traceThreshold').oninput=updateTrace;$('traceInvert').onchange=updateTrace;
$('applyTrace').onclick=()=>{if(!traced)return;try{const candidate=validate({...params,logoPolygons:traced});buildModel(api,candidate);params=candidate;sync();toast('Contorno aplicado. Revisá los detalles pequeños antes de imprimir.');}catch(e){toast(e.message);}};

const assistant=document.createElement('section');assistant.className='handoff assistant';
assistant.innerHTML='<h2>Contale tu idea al asistente</h2><p>Pedí una chapita, un llavero o un cambio de medidas. Revisá la propuesta antes de aplicarla.</p><form id="assistantForm"><label>Tu pedido<textarea id="assistantPrompt" maxlength="2000" rows="3" placeholder="Una chapita ovalada para Luna, de 50 por 35 mm, con base rosa y nombre blanco." required></textarea></label><button id="askAssistant" class="primary" type="submit">Preparar propuesta</button></form><p id="assistantReply" role="status"></p><div id="proposalChanges"></div><button id="applyProposal" class="secondary" hidden>Aplicar propuesta al diseño</button><button id="undoProposal" class="subtle" hidden>Deshacer último cambio del asistente</button><p class="hint">Al enviar, compartís el pedido y los campos de este diseño con OpenAI. Las imágenes no se envían. Las propuestas no envían trabajos a la impresora.</p>';
document.querySelector('.workspace').before(assistant);let proposal=null,previousDesign=null,proposalBase=null;
let localAssistant=location.hostname==='127.0.0.1';
document.querySelector('.output details p').textContent='Chapitas, QR, logos SVG y dibujos PNG/JPG convertidos a relieve. Vista 3D, guardado en carpeta, paquetes ZIP, STL y 3MF. El asistente con IA funciona desde el servidor local. La reconstrucción de objetos desde fotos y los repuestos arbitrarios siguen pendientes.';
if(!localAssistant){$('askAssistant').disabled=true;$('assistantReply').textContent='Comprobando disponibilidad del asistente…';fetch('/api/assistant').then(async response=>{if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error();const status=await response.json();localAssistant=status.enabled===true;$('askAssistant').disabled=!localAssistant;$('assistantReply').textContent=localAssistant?'El asistente está listo. Contale qué querés crear.':'La clave del asistente todavía no está configurada en el servidor.';}).catch(()=>$('assistantReply').textContent='Este alojamiento no tiene servidor de IA. Podés usar las herramientas de diseño y exportación o abrir la versión local.');}
$('assistantForm').onsubmit=async e=>{e.preventDefault();if(!localAssistant)return;proposal=null;proposalBase=null;$('applyProposal').hidden=true;$('proposalChanges').replaceChildren();$('askAssistant').disabled=true;$('assistantReply').textContent='Preparando una propuesta…';const snapshot=JSON.stringify(params);try{const response=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:$('assistantPrompt').value,params})});const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo obtener una propuesta.');$('assistantReply').textContent=result.message;if(result.canApply){const candidate=validate({...JSON.parse(snapshot),...result.params});buildModel(api,candidate);proposal=candidate;proposalBase=snapshot;for(const key of Object.keys(candidate)){if(key==='logoPolygons'||candidate[key]===JSON.parse(snapshot)[key])continue;const row=document.createElement('p');row.className='hint';row.textContent=key+': '+JSON.parse(snapshot)[key]+' → '+candidate[key];$('proposalChanges').append(row);}$('applyProposal').hidden=false;}}catch(error){$('assistantReply').textContent=error.message;}finally{$('askAssistant').disabled=false;}};
$('applyProposal').onclick=()=>{if(!proposal)return;if(JSON.stringify(params)!==proposalBase){toast('El diseño cambió mientras preparábamos la propuesta. Pedí una nueva para conservar tus cambios.');$('applyProposal').hidden=true;return;}previousDesign=structuredClone(params);params=proposal;sync();if(camera)resetView();$('applyProposal').hidden=true;$('undoProposal').hidden=false;proposal=null;toast('Propuesta aplicada. Podés ajustar la pieza o deshacer el cambio.');};
$('undoProposal').onclick=()=>{if(!previousDesign)return;params=previousDesign;previousDesign=null;sync();if(camera)resetView();$('undoProposal').hidden=true;toast('Se restauró el diseño anterior al cambio del asistente.');};
