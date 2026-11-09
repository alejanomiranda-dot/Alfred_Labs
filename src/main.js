import {projectFromBytes} from './project-file.js';
import {createKeychainDesigner,isTwoSidedKeychain} from './keychain-ui.js';
import './style.css';
import {mountForge} from './forge-ui.js';
import {createVisualDesigner} from './visual-designer.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import {defaults,validate,buildModel} from './model.js';
import {checkProposal as verifyProposal,proposalChanges,pendingContext} from './proposals.js';
import {stlBytes,threeMfBytes} from './export.js';
import {revisionName,handoffZip,handoffFiles,writeFolder,saveAsFile,safeName} from './handoff.js';
import {traceBitmap} from './trace.js';
import {readMeshFile} from './mesh-import.js';
import {createViewerTools} from './viewer-tools.js';
import {renderOpEditor} from './op-editor.js';
import {saveVersion,listProjects,deleteProject,countProjects,migrateLegacy} from './library.js';
import {productPhoto,thumbnail,quoteHtml,printHtml} from './studio-output.js';
import {openPhotoMeasure} from './photo-measure.js';
import {openSparePart} from './spare-part.js';
import {fitCoupon} from './solid-program.js';
import {reviewPrint,costOf,durationText,composeRotation} from './printability.js';
import {loadSettings,saveSettings,money,settingDefaults} from './settings.js';
import {prepareImport,describeImport} from './solid-program.js';
const $=id=>document.getElementById(id),storageKey='taller-vero-projects-v1';
let forgeUI=null,keychainDesigner=null;
let params={...defaults},model=null,api=null,timer,toastTimer,renderer,scene,camera,controls,group,stageGrid,wireframe=false,renderDirty=true,tools=null;
// Colored parts of a model: templates have base + relief; free designs can have several colors.
function partsOf(m,p){return m.parts||[{mesh:m.base,color:p.baseColor},{mesh:m.detail,color:p.detailColor}];}
let conversation=[],referenceImage=null,projectEpoch=0;
let proposal=null,previousDesign=null,previousAppliedSnapshot=null,proposalBase=null,assistantBusy=false,requestController=null,requestSerial=0,previewModel=null,previewParams=null,visualDesigner=null;
let settings=loadSettings(),review=null,reviewTimer,heatOn=false,history=[],future=[];
// Undo / redo for every change to the design (edits, proposals, orientation).
function rememberState(){history.push(structuredClone(params));if(history.length>20)history.shift();future=[];updateHistoryButtons();}
function updateHistoryButtons(){if($('undoEdit')){$('undoEdit').disabled=!history.length;$('redoEdit').disabled=!future.length;}}
function clearGeometry(){if(group)while(group.children.length){const m=group.children[0];group.remove(m);m.geometry.dispose();m.material.dispose();}tools?.afterDraw();}
function showConversation(){
 const host=$('conversation');if(!host)return;host.replaceChildren();
 const messages=conversation.length?conversation:[{role:'assistant',content:'¿Qué vamos a crear? Contame la forma y las medidas, o pedime un cambio sobre la pieza que ves.'}];
 for(const item of messages){const row=document.createElement('div');row.className='chat-message '+(item.event?'event':item.role==='assistant'?'from-assistant':item.role);const who=document.createElement('strong'),text=document.createElement('p');who.textContent=item.event?'Diseño':item.role==='user'?'Vos':'Alfred';text.textContent=item.content;row.append(who,text);host.append(row);}
 host.scrollTop=host.scrollHeight;
}
function addMessage(role,content,event=false){conversation.push({role,content,event});showConversation();}

function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',4200);}

function updateCount(){countProjects().then(n=>{$('savedCount').textContent=n;}).catch(()=>{});}
let currentProjectId=null;
function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function basename(){return(params.project||'diseno').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/gi,'-').slice(0,60);}
function geometry(m){const g=new THREE.BufferGeometry();const xyz=[];for(let i=0;i<m.positions.length;i+=m.numProp)xyz.push(m.positions[i],m.positions[i+1],m.positions[i+2]);g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));g.setIndex(new THREE.BufferAttribute(m.triangles,1));g.computeVertexNormals();return g;}
let ghostFit=null;
function resetView(front=false,back=false,fit=null){const ref=fit||ghostFit||model,refParams=ref?.params||params;const halfFov=Math.min(camera.fov*Math.PI/360,Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect));const distance=Math.hypot(...(ref?.dimensions||[refParams.width,refParams.height,refParams.thickness+refParams.relief]))/2/Math.sin(halfFov)*1.08;camera.up.set(0,back||front?1:0,back||front?0:1);camera.position.copy(new THREE.Vector3(front||back?0:.65,front||back?0:-.95,back?-1:1.15).normalize().multiplyScalar(distance));controls.target.set(0,0,(ref?.totalHeight||params.thickness+params.relief)/2);camera.position.add(controls.target);if(stageGrid){stageGrid.visible=!back;$('toggleGrid')?.setAttribute('aria-pressed',String(stageGrid.visible));}controls.update();}
function initializeViewer(){
 const host=$('viewer');scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(34,1,.1,2000);camera.up.set(0,0,1);
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.appendChild(renderer.domElement);
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=2;controls.maxDistance=1800;controls.maxPolarAngle=Math.PI*.85;controls.addEventListener('change',()=>{renderDirty=true;});
 scene.add(new THREE.HemisphereLight(0xeaf5ff,0x1b2843,2.5));const light=new THREE.DirectionalLight(0xffffff,3.8);light.position.set(-40,-20,90);light.castShadow=true;light.shadow.mapSize.set(2048,2048);light.shadow.camera.left=-90;light.shadow.camera.right=90;light.shadow.camera.top=90;light.shadow.camera.bottom=-90;light.shadow.normalBias=.1;scene.add(light);
 const rim=new THREE.DirectionalLight(0x7bc5ff,2.1);rim.position.set(30,60,30);scene.add(rim);const fill=new THREE.DirectionalLight(0xb0ffdf,1);fill.position.set(-60,0,20);scene.add(fill);
 const backLight=new THREE.DirectionalLight(0xd9ebff,1.8);backLight.position.set(-40,-35,-50);backLight.castShadow=true;backLight.shadow.mapSize.set(2048,2048);backLight.shadow.camera.left=-80;backLight.shadow.camera.right=80;backLight.shadow.camera.top=80;backLight.shadow.camera.bottom=-80;backLight.shadow.normalBias=.025;scene.add(backLight);
 const grid=new THREE.GridHelper(250,50,0x456d91,0x2a415d);stageGrid=grid;grid.rotation.x=Math.PI/2;grid.position.z=-.3;grid.material.transparent=true;grid.material.opacity=.5;scene.add(grid);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(1000,1000),new THREE.ShadowMaterial({opacity:.12}));floor.position.z=-.2;floor.receiveShadow=true;scene.add(floor);
 group=new THREE.Group();scene.add(group);
 tools=createViewerTools({host,scene,camera,renderer,group,markDirty:()=>{renderDirty=true;},meshGeometry:geometry});
 const resize=()=>{const {width,height}=host.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height);renderDirty=true;camera.aspect=width/height;camera.updateProjectionMatrix();resetView(Boolean(previewModel)&&previewParams?.kind!=='free',false,previewModel);};new ResizeObserver(resize).observe(host);resize();
 renderer.setAnimationLoop(()=>{controls.update();if(renderDirty||controls.autoRotate){renderer.render(scene,camera);tools.beforeRender();renderDirty=false;}});
 const toolbar=document.createElement('div');toolbar.className='viewport-tools';toolbar.innerHTML='<button class="small" id="toggleGrid" title="Mostrar u ocultar cuadrícula" aria-label="Cuadrícula" aria-pressed="true"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor"><path d="M2 2h16v16H2ZM2 7h16M2 13h16M7 2v16M13 2v16"/></svg></button><button class="small" id="wireframe" title="Ver la malla del modelo" aria-label="Malla del modelo" aria-pressed="false"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor"><path d="m10 1 8 4v10l-8 4-8-4V5ZM2 5l8 5 8-5M10 10v9M2 5l8 14 8-14M2 15l8-14 8 14"/></svg></button><button class="small" id="autoRotate" title="Girar automáticamente" aria-label="Giro automático" aria-pressed="false"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor"><path d="M16 7a7 7 0 1 0 1 6M16 2v5h-5"/></svg></button><button class="small" id="rulerTool" title="Regla: hacé clic en dos puntos de la pieza" aria-label="Regla" aria-pressed="false"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor"><path d="m2 14 12-12 4 4L6 18ZM5 11l2 2M8 8l2 2M11 5l2 2"/></svg></button><button class="small" id="dimsTool" title="Cotas: medidas totales" aria-label="Cotas" aria-pressed="false"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor"><path d="M2 16h16M2 13v6M18 13v6M5 3h10v8H5Z"/></svg></button><button class="small" id="sectionTool" title="Plano de corte: ver la pieza por dentro" aria-label="Corte" aria-pressed="false"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor"><path d="M3 6h14v11H3ZM1 11h18" stroke-dasharray="2 1.5"/></svg></button>';
 host.append(toolbar);const info=document.createElement('div');info.className='viewport-info';info.textContent='ESPACIO DE DISEÑO · mm';host.append(info);
 $('toggleGrid').onclick=()=>{grid.visible=!grid.visible;renderDirty=true;$('toggleGrid').setAttribute('aria-pressed',String(grid.visible));};
 $('wireframe').onclick=()=>{wireframe=!wireframe;for(const mesh of group.children)mesh.material.wireframe=wireframe;renderDirty=true;$('wireframe').setAttribute('aria-pressed',String(wireframe));};
 const sectionPanel=document.createElement('div');sectionPanel.className='section-panel';sectionPanel.hidden=true;sectionPanel.innerHTML='<span>CORTE</span><div role="group" aria-label="Eje del corte"><button class="small" data-axis="x">X</button><button class="small" data-axis="y">Y</button><button class="small" data-axis="z" aria-pressed="true">Z</button></div><input id="sectionAmount" type="range" min="2" max="98" value="50" aria-label="Posición del corte">';host.append(sectionPanel);
 const section={axis:'z',amount:.5};const syncSection=()=>tools.setSection(sectionPanel.hidden?null:{...section});
 $('sectionTool').onclick=()=>{sectionPanel.hidden=!sectionPanel.hidden;$('sectionTool').setAttribute('aria-pressed',String(!sectionPanel.hidden));syncSection();};
 for(const b of sectionPanel.querySelectorAll('[data-axis]'))b.onclick=()=>{section.axis=b.dataset.axis;for(const o of sectionPanel.querySelectorAll('[data-axis]'))o.setAttribute('aria-pressed',String(o===b));syncSection();};
 $('sectionAmount').oninput=e=>{section.amount=Number(e.target.value)/100;syncSection();};
 $('rulerTool').onclick=()=>{const on=$('rulerTool').getAttribute('aria-pressed')!=='true';$('rulerTool').setAttribute('aria-pressed',String(on));tools.setRuler(on);if(on)toast('Regla: hacé clic en dos puntos de la pieza.');};
 $('dimsTool').onclick=()=>{const on=$('dimsTool').getAttribute('aria-pressed')!=='true';$('dimsTool').setAttribute('aria-pressed',String(on));tools.setDims(on);};
 $('autoRotate').onclick=()=>{controls.autoRotate=!controls.autoRotate;controls.autoRotateSpeed=.65;$('autoRotate').setAttribute('aria-pressed',String(controls.autoRotate));};
}
function draw(){
 while(group.children.length){const m=group.children[0];group.remove(m);m.geometry.dispose();m.material.dispose();}
 for(const {mesh:meshData,color} of partsOf(model,params)){if(!meshData.triangles.length)continue;const mesh=new THREE.Mesh(geometry(meshData),new THREE.MeshStandardMaterial({color,roughness:.4,metalness:.12,flatShading:true,wireframe}));mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
 tools?.afterDraw();
}
function setExportEnabled(enabled){for(const id of ['exportStl','export3mf'])$(id).disabled=!enabled;if($('keychainDownload'))$('keychainDownload').disabled=!(proposal?.kind==='keychain'?previewModel:params.kind==='keychain'?model:null);}
function render(){
 clearTimeout(timer);renderDirty=true;if(!api)return;
 model=null;setExportEnabled(false);
 if(params.kind==='free'&&!params.freeDesign){clearGeometry();$('loading').style.display='block';$('loading').textContent='Tu mesa está lista. Contale a la guía qué querés crear.';$('dimensions').textContent='Por definir';$('totalHeight').textContent='—';$('partLabel').textContent='Proyecto nuevo';$('statusTitle').textContent='Esperando tu idea';$('statusText').textContent='La pieza aparecerá cuando apliques una propuesta.';$('warnings').replaceChildren();return;}
 try{
  if(!$('designForm').checkValidity())throw Error('Completá las medidas dentro de los límites indicados.');
  model=buildModel(api,params);params=model.params;
  if(params.kind!=='free'){ $('height').value=params.height; $('height').readOnly=params.shape==='circle'; $('height').title=params.shape==='circle'?'El alto coincide con el diámetro del círculo.':''; }
  if(renderer)draw();
  $('loading').style.display='none';$('dimensions').textContent=`${model.dimensions?model.dimensions.map(v=>v.toFixed(1)).join(' × '):params.width+' × '+params.height} mm`;$('totalHeight').textContent=`${model.totalHeight.toFixed(1).replace('.',',')} mm`;
  $('partLabel').textContent=params.kind==='keychain'?'Logo + QR · '+model.parts.length+' colores':params.kind==='free'?(model.parts?'Multicolor · '+model.parts.length+' colores':'Sólido libre · 1 color'):'Base + relieve';$('statusTitle').textContent='Geometría generada';$('statusText').textContent='Sólido cerrado. Pendiente de revisar en el laminador y probar impreso.';
  $('warnings').replaceChildren();for(const w of model.warnings){const el=document.createElement('div');el.className='warning';el.textContent=w;$('warnings').append(el);}setExportEnabled(true);scheduleReview();
 }catch(error){$('statusTitle').textContent='Hay algo para revisar';$('statusText').textContent=error.message; $('warnings').replaceChildren();$('loading').style.display='block';$('loading').textContent='Corregí los datos para actualizar la pieza.';clearGeometry();}
}
function sync(){
 invalidateProposal();invalidateAssistantUndo();
 for(const key of Object.keys(defaults))if($(key)&&'value' in $(key))$(key).value=params[key];
 for(const button of document.querySelectorAll('[data-kind]'))button.classList.toggle('selected',button.dataset.kind===params.kind);
 for(const kind of ['tag','qr','logo'])$(kind+'Fields').hidden=params.kind!==kind;
 $('designForm').classList.toggle('free-mode',params.kind==='free');$('freeInfo').hidden=params.kind!=='free';if(params.kind==='free')$('freeOperations').textContent=(params.freeDesign?.nodes||[]).map((n,i)=>(i+1)+'. '+({box:'Bloque',open_box:'Caja abierta · paredes y fondo',imported:'Pieza importada del archivo',open_cylinder:'Recipiente redondo · paredes y fondo',revolve:'Pieza de revolución (perfil por tramos)',engrave_text:'Texto grabado',emboss_text:'Texto en relieve',cylinder:'Cilindro / cono',sphere:'Esfera',ellipsoid:'Elipsoide',capsule:'Cápsula',torus:'Anillo',extrude:'Contorno extruido',text:'Texto',union:'Unión',subtract:'Sustracción / hueco',intersect:'Intersección'}[n.type]||n.type)).join('\n')||'Todavía no hay geometría. Empecemos por tu idea.';
 if($('opEditor')){if(params.kind==='free'&&params.freeDesign)renderOpEditor($('opEditor'),params.freeDesign,editProgram);else $('opEditor').replaceChildren();}updateHistoryButtons();
 $('logoNote').textContent=params.logoPolygons?'Logo vectorial cargado. El relieve usa un solo color.':'Usá un SVG con formas rellenas y textos convertidos a curvas. Se crea un relieve de un color.';
 render();forgeUI?.sync();syncKeychainActions();
}
$('designForm').addEventListener('submit',e=>e.preventDefault());
$('designForm').addEventListener('input',e=>{if(!(e.target.id in defaults))return;rememberState();params[e.target.id]=e.target.type==='number'?Number(e.target.value):e.target.value;if(params.shape==='circle'&&params.kind!=='free')params.height=params.width;invalidateProposal();invalidateAssistantUndo();model=null;setExportEnabled(false);clearTimeout(timer);timer=setTimeout(render,180);});
for(const button of document.querySelectorAll('[data-kind]'))button.addEventListener('click',()=>{
 resetProjectContext();params.kind=button.dataset.kind;
 Object.assign(params,params.kind==='tag'?{project:'Chapita de Mora',width:45,height:32,baseColor:'#e9a08c',detailColor:'#fff8e9'}:params.kind==='qr'?{project:'Mi llavero QR',width:50,height:58,shape:'round',baseColor:'#fff8e9',detailColor:'#254e40'}:params.kind==='free'?{project:'Mi diseño libre',freeDesign:null,importedMesh:null}:{project:'Mi llavero con logo',width:45,height:40,baseColor:'#254e40',detailColor:'#fff8e9'});sync();if(camera)resetView();
});
$('front').onclick=()=>resetView(true);$('perspective').onclick=()=>resetView();$('resetView').onclick=()=>resetView();
const backButton=document.createElement('button');backButton.id='backView';backButton.className='small';backButton.textContent='Dorso';backButton.onclick=()=>resetView(false,true);$('front').after(backButton);
const freeInfo=document.createElement('div');freeInfo.id='freeInfo';freeInfo.hidden=true;freeInfo.innerHTML='<p class="eyebrow">DISEÑO POR OPERACIONES</p><p>Describí al asistente qué pieza necesitás, con sus medidas en milímetros. Podés pedir volúmenes, paredes, agujeros, textos y contornos propios.</p><p class="hint">El asistente prepara la pieza y vos decidís cuándo aplicarla. Para cambiarla después, pedí nuevas medidas o detalles.</p><pre id="freeOperations" aria-label="Operaciones de la pieza" hidden></pre><div class="op-tools"><span class="eyebrow">AJUSTE DIRECTO</span><button type="button" id="undoEdit" class="small" disabled>↶ Deshacer</button><button type="button" id="redoEdit" class="small" disabled>↷ Rehacer</button></div><div id="opEditor"></div><p class="hint">Hasta 60 operaciones y 300 mm por eje. Este límite de diseño no representa el volumen de tu impresora. Revisá el tamaño y las tolerancias en Bambu Studio.</p>';$('project').parentElement.after(freeInfo);
const backFields=document.createElement('section');backFields.innerHTML='<div class="divider"></div><label>Decoración del dorso<select id="backDecoration"><option value="none">Sin decoración</option><option value="bone">Huesito</option></select></label><div class="fields"><label>Terminación<select id="backStyle"><option value="engraved">Grabado</option><option value="raised">Relieve</option></select></label><label>Profundidad · mm<input id="backDepth" type="number" min="0.2" max="1.2" step="0.2" value="0.6" required></label></div><p class="hint">El grabado entra en la base. El relieve sobresale y puede requerir soportes. Usá «Dorso» para revisar el resultado.</p>';$('save').before(backFields);
$('exportStl').onclick=()=>{render();if(model)download(stlBytes(model.combined),basename()+'.stl','model/stl');};
$('export3mf').onclick=async()=>{render();if(!model)return;try{const name=revisionName(params.project)+'.3mf',bytes=threeMfBytes(model);const result=await saveAsFile(window,bytes,name,'3mf');if(result.method==='download'){download(bytes,name,'model/3mf');toast('Descarga iniciada. La ubicación depende de la configuración del navegador.');}else if(result.method==='picker')toast('Archivo guardado. Abrilo o arrastralo a Bambu Studio.');}catch(e){toast('No se pudo guardar: '+e.message);}};
$('exportProject').onclick=()=>{try{download(JSON.stringify(validate(params),null,2),basename()+'.json','application/json');}catch(e){toast(e.message);}};
$('importProject').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>40e6)throw Error('El proyecto es demasiado grande.');const candidate=validate(projectFromBytes(file.name,new Uint8Array(await file.arrayBuffer())));resetProjectContext();const previous=params;params=candidate;sync();if(!model){params=previous;sync();throw Error('El proyecto no pudo generar una pieza válida.');}if(camera)resetView();toast('Proyecto abierto.');}catch(error){toast('No se pudo abrir: '+error.message);}finally{e.target.value='';}};
$('save').onclick=async()=>{try{render();if(!model)throw Error('Revisá el diseño antes de guardarlo.');const first=!currentProjectId;currentProjectId=currentProjectId||crypto.randomUUID();await saveVersion({id:crypto.randomUUID(),projectId:currentProjectId,date:new Date().toISOString(),name:params.project,params:validate(params),thumb:camera?thumbnail(captureTarget()):null});updateCount();toast(first?'Proyecto guardado en la biblioteca.':'Nueva versión guardada. Las anteriores siguen en la biblioteca.');}catch(error){toast('No se pudo guardar: '+error.message);}};
async function showLibrary(){
 const host=$('libraryList');host.replaceChildren();let projects=[];try{projects=await listProjects();}catch{host.textContent='Este navegador no permite guardar proyectos.';}
 if(!projects.length&&!host.textContent)host.textContent='Tu próximo diseño empieza acá. Guardá una pieza para encontrarla en esta biblioteca, con todas sus versiones.';
 const openVersion=v=>{try{resetProjectContext();params=validate(v.params);currentProjectId=v.projectId;sync();if(camera)resetView();$('library').close();toast('Abriste «'+v.name+'» del '+new Date(v.date).toLocaleString('es-AR')+'.');}catch(e){toast(e.message);}};
 for(const p of projects){
  const card=document.createElement('article');card.className='library-card';const img=document.createElement('img');img.alt='';if(p.latest.thumb)img.src=p.latest.thumb;else img.className='empty';
  const info=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('small');title.textContent=p.name;meta.textContent=new Date(p.latest.date).toLocaleDateString('es-AR')+' · '+p.versions.length+(p.versions.length>1?' versiones':' versión');info.append(title,meta);
  const actions=document.createElement('div');actions.className='library-actions';const open=document.createElement('button');open.className='secondary';open.textContent='Abrir';open.onclick=()=>openVersion(p.latest);
  const list=document.createElement('ol');list.className='version-list';list.hidden=true;for(const v of p.versions){const li=document.createElement('li'),b=document.createElement('button');b.className='subtle';b.textContent=new Date(v.date).toLocaleString('es-AR')+(v.note?' · '+v.note:'');b.onclick=()=>openVersion(v);li.append(b);list.append(li);}
  const versions=document.createElement('button');versions.className='subtle';versions.textContent='Versiones';versions.onclick=()=>{list.hidden=!list.hidden;};
  const remove=document.createElement('button');remove.className='subtle';remove.textContent='Eliminar';remove.onclick=async()=>{if(!confirm('¿Eliminar «'+p.name+'» y sus '+p.versions.length+' versiones? No se puede deshacer.'))return;await deleteProject(p.projectId);if(currentProjectId===p.projectId)currentProjectId=null;updateCount();showLibrary();};
  actions.append(open,versions,remove);card.append(img,info,actions,list);host.append(card);
 }
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
setExportEnabled(false);migrateLegacy().catch(()=>0).then(updateCount);
try{initializeViewer();}catch(error){$('loading').textContent='La vista 3D necesita WebGL. Las exportaciones siguen disponibles.';console.error(error);}
try{api=await Module({locateFile:path=>path.endsWith('.wasm')?wasmUrl:path});api.setup();sync();}catch(error){$('loading').textContent='No se pudo iniciar el motor 3D. Recargá la página.';$('statusText').textContent=error.message;console.error(error);}

// Local handoff: the browser grants access only to the folder selected by Vero.
const handoff=document.createElement('section');handoff.className='handoff';handoff.id='handoffPanel';
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

const assistant=document.createElement('section');assistant.className='assistant';assistant.id='assistantPanel';
assistant.innerHTML=`<div class="chat-heading"><div><span class="eyebrow">TU COMPAÑERO DE DISEÑO</span><h2>Alfred</h2></div><span class="chat-status">Conversá → revisá → aplicá</span></div>
<div id="conversation" class="conversation" role="log" aria-label="Conversación con Alfred" aria-live="polite" aria-relevant="additions text"></div>
<section id="proposalCard" class="proposal-card" aria-label="Propuesta pendiente" hidden><div class="proposal-heading"><strong>Propuesta lista</strong><span>Sin aplicar</span></div><p id="proposalSummary"></p><details><summary>Ver cambios</summary><ul id="proposalChanges"></ul></details><div id="ghostSwitch" class="ghost-switch" role="group" aria-label="Comparar propuesta" hidden><span>Ver:</span><button type="button" class="small" data-ghost="both" aria-pressed="true">Comparar</button><button type="button" class="small" data-ghost="proposal" aria-pressed="false">Propuesta</button><button type="button" class="small" data-ghost="current" aria-pressed="false">Actual</button></div><div class="proposal-actions"><button id="applyProposal" class="primary" type="button" hidden>Aplicar</button><button id="previewOnMobile" class="secondary mobile-only" type="button">Ver pieza</button><button id="discardProposal" class="subtle" type="button">Descartar</button></div><small>Podés seguir conversando para ajustarla antes de aplicar.</small></section>
<p id="assistantReply" role="status"></p><button id="undoProposal" class="subtle" type="button" hidden>↶ Deshacer cambio del asistente</button>
<div id="referencePanel" hidden><img id="referencePreview" alt="Referencia visual del proyecto"><p id="referenceName" class="hint"></p><button id="measureReference" type="button" class="secondary">Medir en la foto</button><button id="removeReference" type="button" class="subtle">Quitar referencia</button></div>
<div id="visualHost"></div><form id="assistantForm" class="chat-composer"><label class="design-mode">Qué querés crear<select id="designMode"><option value="auto">Elegir según mi pedido</option><option value="relief">Dibujo, escudo o rostro en relieve</option></select></label><label for="assistantPrompt">Mensaje a Alfred</label><textarea id="assistantPrompt" maxlength="2000" rows="2" placeholder="Un escudo en relieve, una maceta, una luna…" required></textarea><div class="composer-actions"><label class="reference-upload">＋ Foto o dibujo<input id="referenceFile" type="file" accept="image/png,image/jpeg" hidden></label><button id="stopAssistant" type="button" class="subtle" hidden>Detener</button><button id="askAssistant" class="primary" type="submit">Enviar ↑</button></div><small>Enter para enviar · Shift + Enter para una nueva línea</small></form>
<details class="chat-privacy"><summary>Sobre esta conversación</summary><p>Al enviar, compartís el pedido, la conversación reciente, el diseño y la referencia adjunta con OpenAI. La conversación y la foto duran esta sesión. El proyecto editable conserva la geometría.</p></details>`;
document.querySelector('.workspace').append(assistant);
showConversation();
// Keep creation, conversation and fabrication in separate, reachable places.
const workspaceActions=document.createElement('nav');workspaceActions.className='workspace-actions';workspaceActions.setAttribute('aria-label','Herramientas del proyecto');
workspaceActions.innerHTML='<span>DISEÑÁ CON ALFRED</span><button id="saveQuick" class="secondary" type="button">Guardar versión</button><button id="toggleProperties" class="secondary" type="button" aria-expanded="false" aria-controls="propertiesPanel">Ajustes de la pieza</button><button id="toggleFabrication" class="secondary" type="button" aria-expanded="false" aria-controls="fabricationPanel">Preparar para imprimir ↓</button>';
document.querySelector('.workspace').before(workspaceActions);
const editor=document.querySelector('.editor');editor.id='propertiesPanel';
$('saveQuick').onclick=()=>$('save').click();
document.querySelector('.studio-rail a[href="#designForm"]').onclick=()=>{editor.classList.add('is-open');$('toggleProperties').setAttribute('aria-expanded','true');};
$('toggleProperties').onclick=()=>{const open=editor.classList.toggle('is-open');$('toggleProperties').setAttribute('aria-expanded',String(open));};
const fabrication=document.createElement('details');fabrication.id='fabricationPanel';fabrication.className='fabrication-panel';fabrication.innerHTML='<summary>Preparar para imprimir <span>Revisión, archivos, costos y exportación</span></summary>';document.querySelector('.workspace').after(fabrication);fabrication.append(document.querySelector('.output'),$('handoffPanel'));
$('toggleFabrication').onclick=()=>{fabrication.open=!fabrication.open;$('toggleFabrication').setAttribute('aria-expanded',String(fabrication.open));if(fabrication.open)fabrication.scrollIntoView({behavior:'smooth',block:'start'});};
document.querySelector('.studio-rail a[href="#handoffPanel"]').onclick=()=>{fabrication.open=true;};
fabrication.addEventListener('toggle',()=>$('toggleFabrication').setAttribute('aria-expanded',String(fabrication.open)));
const viewTabs=document.createElement('nav');viewTabs.className='workspace-mode-tabs';viewTabs.setAttribute('aria-label','Vista del espacio de diseño');viewTabs.innerHTML='<button type="button" class="secondary" data-workspace-view="piece" aria-pressed="false">Pieza 3D</button><button type="button" class="secondary" data-workspace-view="chat" aria-pressed="true">Chat con Alfred</button>';document.querySelector('.workspace').prepend(viewTabs);document.querySelector('.workspace').dataset.mobileView='chat';
function showWorkspaceView(view,scroll=true){document.querySelector('.workspace').dataset.mobileView=view;for(const b of viewTabs.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.workspaceView===view));if(scroll&&matchMedia('(max-width:1050px)').matches)viewTabs.scrollIntoView({behavior:'smooth',block:'start'});}
for(const b of viewTabs.querySelectorAll('button'))b.onclick=()=>showWorkspaceView(b.dataset.workspaceView);
$('previewOnMobile').onclick=()=>showWorkspaceView('piece');
function clearProposal(){proposal=null;proposalBase=null;hideGhost();$('proposalCard').hidden=true;$('applyProposal').hidden=true;syncKeychainActions();}
function invalidateProposal(){if(proposal&&JSON.stringify(params)!==proposalBase){clearProposal();$('assistantReply').textContent='La pieza cambió. Pedí una propuesta nueva para incluir tus ajustes.';}}
function invalidateAssistantUndo(){if(previousDesign&&JSON.stringify(params)!==previousAppliedSnapshot){previousDesign=null;previousAppliedSnapshot=null;if($('undoProposal'))$('undoProposal').hidden=true;}}
function setAssistantBusy(busy){assistantBusy=busy;$('askAssistant').disabled=busy||!localAssistant;$('stopAssistant').hidden=!busy;$('applyProposal').disabled=busy;$('discardProposal').disabled=busy;$('conversation').setAttribute('aria-busy',String(busy));}
let localAssistant=location.hostname==='127.0.0.1';
document.querySelector('.output details p').textContent='Cinco formas de empezar: desde cero, desde una foto, desde tu archivo 3D (STL o 3MF), un repuesto a medida o una plantilla. Guía con inteligencia artificial que verifica cada propuesta antes de mostrarla. Volúmenes, recipientes, piezas por perfil, textos e íconos grabados, en relieve, incrustados o alrededor de superficies curvas, hasta 4 colores. Regla, cotas, corte, revisión de impresión con material, tiempo y costo, prueba de encaje, versiones, foto de producto y presupuesto.';
if(!localAssistant){$('askAssistant').disabled=true;$('assistantReply').textContent='Comprobando disponibilidad del asistente…';fetch('/api/assistant').then(async response=>{if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error();const status=await response.json();localAssistant=status.enabled===true;if(!localAssistant){$('assistantReply').textContent='El asistente todavía no está configurado en el servidor.';return;}$('askAssistant').disabled=false;$('assistantReply').textContent='El asistente está listo. Contale qué querés crear.';}).catch(()=>$('assistantReply').textContent='Este alojamiento no tiene servidor de IA. Podés usar las herramientas de diseño y exportación o abrir la versión local.');}
function sizeText(v){return v.map(x=>String(Math.round(x*10)/10).replace('.',',')).join(' × ')+' mm';}
$('assistantPrompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!assistantBusy&&!$('askAssistant').disabled)$('assistantForm').requestSubmit();}});
$('stopAssistant').onclick=()=>{requestController?.abort();};
visualDesigner=createVisualDesigner({host:$('visualHost'),getParams:()=>params,getReference:()=>referenceImage,
 begin(){if(assistantBusy||forgeUI?.isBusy()||!localAssistant){toast('Esperá a que termine la consulta actual y comprobá que el asistente esté disponible.');return null;}const epoch=projectEpoch,serial=++requestSerial,controller=new AbortController();requestController=controller;setAssistantBusy(true);return {api,signal:controller.signal,headers:{'Content-Type':'application/json'},isCurrent:()=>epoch===projectEpoch&&serial===requestSerial,finish(){if(serial===requestSerial){requestController=null;setAssistantBusy(false);}}};},
 onProposal({candidate,built,snapshot}){clearProposal();proposal=candidate;proposalBase=snapshot;$('proposalChanges').replaceChildren(...proposalChanges(params,candidate).map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));$('proposalSummary').textContent='Relieve visual · '+sizeText(built.dimensions);$('proposalCard').hidden=false;$('applyProposal').hidden=false;showGhost(built,candidate);$('assistantReply').textContent='Relieve listo para revisar. Aplicá cuando estés conforme.';},
 onMessage:message=>addMessage('assistant',message),onError:message=>{$('assistantReply').textContent=message;}
});
$('assistantForm').onsubmit=async e=>{
 e.preventDefault();if(forgeUI?.isBusy()){toast('Esperá a que termine Forge o detené la generación.');return;}if(!localAssistant||assistantBusy)return;
 const prompt=$('assistantPrompt').value.trim();if(!prompt)return;
 if(isTwoSidedKeychain(prompt)){addMessage('user',prompt);$('assistantPrompt').value='';addMessage('assistant','Vamos a armar un solo llavero con tu logo adelante y el QR atrás. Revisá el logo y completá el enlace; no hace falta generar otra imagen.');keychainDesigner.open({...(referenceImage?{imageDataUrl:referenceImage}:{}),url:prompt.match(/https?:\/\/[^\s]+/)?.[0]});return;}
 invalidateProposal();
 const snapshot=JSON.stringify(params),base=JSON.parse(snapshot),epoch=projectEpoch,serial=++requestSerial,maxAttempts=3;
 const pendingDesign=proposal?structuredClone(proposal):null,pending=pendingContext(params,proposal,proposalBase),pendingGeneration=visualDesigner?.pending(),recent=conversation.slice(-12).map(({role,content})=>({role,content:content.slice(0,1600)})),image=referenceImage;
 const controller=new AbortController();requestController=controller;setAssistantBusy(true);
 addMessage('user',prompt);$('assistantPrompt').value='';$('assistantReply').textContent='Alfred está pensando…';
 try{let result,checked=null,correction,lastError='';
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   if(attempt>1){$('assistantReply').textContent='Comprobando la pieza y ajustando la propuesta…';await new Promise(r=>setTimeout(r,2100));controller.signal.throwIfAborted();if(epoch!==projectEpoch)return;}
   const response=await fetch('/api/assistant',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,designMode:$('designMode').value,...(pendingGeneration?{pendingGeneration}:{}),style:settings,params:{...base,importedMesh:undefined,forge:undefined},history:recent,imageDataUrl:image,...(pending?{pendingProposal:pending}:{}),...(base.importedMesh?{importedSummary:{name:base.importedMesh.name,size:importedSize(base.importedMesh),...describeImport(api,base.importedMesh)}}:{}),...(correction?{correction}:{})})});
   result=await response.json();if(epoch!==projectEpoch||serial!==requestSerial)return;

   if(!response.ok)throw Error(result.error||'No se pudo obtener una propuesta.');
   if(!result.canApply)break;
   try{checked=verifyProposal(api,base,result,pendingDesign);break;}catch(error){lastError=error.message;correction={error:lastError.slice(0,1500),program:result.params.freeDesign??null};}
  }
  if(result.generation){if(JSON.stringify(params)!==snapshot)throw Error('La pieza cambió durante la consulta. Reenviá el pedido.');clearProposal();visualDesigner.offer(result.generation);}
  const failed=result.canApply&&!checked;
  addMessage('assistant',failed?'No pude construir una pieza válida con esa propuesta. Podemos ajustar las medidas o hacerla por partes.':result.message);
  if(JSON.stringify(params)!==snapshot){invalidateProposal();$('assistantReply').textContent='Cambiaste la pieza durante la consulta. Reenviá el pedido para incluir esos ajustes.';return;}
  $('assistantReply').textContent=failed?'La verificación detectó un problema. Tu diseño sigue como estaba.':checked?'Vista previa lista. Aplicá la propuesta cuando estés conforme.':proposal?'Tu propuesta sigue pendiente. Podés ajustarla o aplicarla.':'';
  if(checked){visualDesigner.reset();const candidate=checked.candidate;proposal=candidate;proposalBase=snapshot;
   const size=checked.built.dimensions||[candidate.width,candidate.height,checked.built.totalHeight];
   $('proposalSummary').textContent=(candidate.shape==='circle'&&candidate.kind!=='free'?'Círculo de '+candidate.width+' mm de diámetro · ':sizeText(size)+' · ')+'Vista previa';
   $('proposalChanges').replaceChildren(...proposalChanges(base,candidate).map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
   $('proposalCard').hidden=false;$('applyProposal').hidden=false;showGhost(checked.built,candidate);}
 }catch(error){
  if(epoch!==projectEpoch||serial!==requestSerial)return;
  const canceled=controller.signal.aborted;
  addMessage('assistant',canceled?'Detuve la consulta. Podés editar el mensaje y volver a enviarlo.':error.message);
  $('assistantReply').textContent=proposal?'La propuesta anterior sigue pendiente.':'';
  if(!$('assistantPrompt').value)$('assistantPrompt').value=prompt;
 }finally{if(serial===requestSerial){requestController=null;setAssistantBusy(false);}}
};
$('applyProposal').onclick=()=>{
 if(!proposal||assistantBusy||forgeUI?.isBusy())return;
 if(JSON.stringify(params)!==proposalBase){invalidateProposal();toast('La pieza cambió. Pedí una propuesta nueva.');return;}
 const next=proposal;previousDesign=structuredClone(params);clearProposal();rememberState();params=next;previousAppliedSnapshot=JSON.stringify(params);sync();
 if(camera)resetView(false,params.kind!=='free'&&params.backDecoration==='bone');
 addMessage('user','Apliqué la propuesta al diseño.',true);$('assistantReply').textContent='Propuesta aplicada a la pieza.';$('undoProposal').hidden=false;toast('Propuesta aplicada.');
};
$('discardProposal').onclick=()=>{if(assistantBusy)return;clearProposal();addMessage('user','Descarté la propuesta. Seguimos sobre la pieza actual.',true);$('assistantReply').textContent='';};
$('undoProposal').onclick=()=>{
 if(!previousDesign)return;const before=previousDesign;previousDesign=null;clearProposal();rememberState();params=before;sync();if(camera)resetView();
 addMessage('user','Deshice el cambio del asistente. El diseño actual vuelve al estado anterior.',true);$('undoProposal').hidden=true;$('assistantReply').textContent='Cambio deshecho.';
};

function resetProjectContext(){visualDesigner?.reset();projectEpoch++;requestSerial++;requestController?.abort();requestController=null;if($('stopAssistant'))setAssistantBusy(false);if($('proposalCard'))$('proposalCard').hidden=true;history=[];future=[];updateHistoryButtons();previousAppliedSnapshot=null;currentProjectId=null;hideGhost();conversation=[];referenceImage=null;showConversation();if($('referencePanel'))$('referencePanel').hidden=true;if($('assistantPrompt'))$('assistantPrompt').value='';if($('applyProposal'))$('applyProposal').hidden=true;if($('undoProposal'))$('undoProposal').hidden=true;if($('proposalChanges'))$('proposalChanges').replaceChildren();if($('assistantReply'))$('assistantReply').textContent='Contame qué vamos a crear y para qué lo necesitás.';proposal=null;proposalBase=null;previousDesign=null;}
function startBlank(){forgeUI?.openCad();resetProjectContext();showWorkspaceView('chat',false);params={...defaults,kind:'free',project:'Mi nuevo proyecto',freeDesign:null};sync();if(camera)resetView();$('assistantPrompt').placeholder='Un escudo en relieve, una luna, una botella, una maceta…';showWorkspaceView('chat',false);$('assistantPanel').scrollIntoView({behavior:'smooth',block:'center'});$('assistantPrompt').focus();}
$('startBlank').onclick=startBlank;
$('startPhoto').onclick=()=>{$('referenceFile').dataset.newProject='yes';$('referenceFile').click();};
$('startTemplate').onclick=()=>keychainDesigner?.open();
$('startSaved').onclick=()=>{$('importProject').click();};
$('referenceFile').onchange=async e=>{const input=e.target,file=input.files[0];try{if(!file)return;if(!['image/png','image/jpeg'].includes(file.type)||file.size>10e6)throw Error('Elegí una foto o dibujo PNG/JPG de hasta 10 MB.');const bitmap=await createImageBitmap(file);let url;try{const scale=Math.min(768/bitmap.width,768/bitmap.height,1),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);url=canvas.toDataURL('image/jpeg',.8);}finally{bitmap.close();}if(url.length>850000)throw Error('La imagen es demasiado compleja. Usá una referencia más pequeña.');if(input.dataset.newProject==='yes')startBlank();referenceImage=url;$('referencePreview').src=url;$('referenceName').textContent=file.name+' · Se enviará con tu próximo mensaje.';$('referencePanel').hidden=false;$('assistantReply').textContent='Referencia lista. Contame qué querés construir a partir de ella y qué medidas conocés.';$('assistantPrompt').focus();}catch(error){toast(error.message);}finally{input.value='';delete input.dataset.newProject;}};
$('removeReference').onclick=()=>{referenceImage=null;$('referencePreview').removeAttribute('src');$('referencePanel').hidden=true;};

$('referenceFile').oncancel=()=>{delete $('referenceFile').dataset.newProject;};

// Start from the person's own 3D file: it becomes the first operation of a free design.
function importedSize(m){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<m.vertices.length;i++){min[i%3]=Math.min(min[i%3],m.vertices[i]);max[i%3]=Math.max(max[i%3],m.vertices[i]);}return max.map((v,i)=>v-min[i]);}
const modelInput=document.createElement('input');modelInput.type='file';modelInput.accept='.stl,.3mf';modelInput.hidden=true;modelInput.id='modelFile';document.body.append(modelInput);
$('startModel').onclick=()=>{if(!api){toast('El motor 3D todavía se está preparando. Probá de nuevo en unos segundos.');return;}modelInput.click();};
modelInput.onchange=async()=>{const file=modelInput.files[0];modelInput.value='';if(!file)return;
 try{if(file.size>80e6)throw Error('El archivo supera 80 MB.');toast('Leyendo '+file.name+'…');await new Promise(r=>setTimeout(r,30));
  const read=readMeshFile(file.name,new Uint8Array(await file.arrayBuffer())),prepared=prepareImport(api,read);
  forgeUI?.openCad();resetProjectContext();params={...defaults,kind:'free',project:read.name.slice(0,60)||'Pieza importada',importedMesh:prepared.mesh,freeDesign:{version:1,nodes:[{type:'imported',position:[0,0,0],rotation:[0,0,0]}]}};sync();if(!model)throw Error($('statusText').textContent);if(camera)resetView();
  const size=sizeText(prepared.size),notes=[read.parts>1?'El archivo tenía '+read.parts+' partes; se unieron en una sola pieza.':'',prepared.tolerance?'La malla se simplificó de '+prepared.original.toLocaleString('es-AR')+' a '+prepared.triangles.toLocaleString('es-AR')+' triángulos (tolerancia '+String(prepared.tolerance).replace('.',',')+' mm) para que el taller funcione ágil.':''].filter(Boolean).join(' ');
  conversation.push({role:'assistant',content:'Abrí tu pieza «'+read.name+'»: mide '+size+'. '+notes+' Contame qué querés cambiarle: un grabado, un texto en relieve, un agujero, recortarla o sumarle algo.'});showConversation();
  $('assistantReply').textContent='Pieza importada. Contale a la guía qué querés cambiarle.';$('assistantPrompt').placeholder='Grabale VERO abajo, agregale un agujero de 5 mm…';showWorkspaceView('chat',false);$('assistantPanel').scrollIntoView({behavior:'smooth',block:'center'});$('assistantPrompt').focus();toast('Pieza importada: '+size+'.');
 }catch(error){toast('No se pudo importar: '+error.message);}};

// Proposal preview: the guide's piece is drawn translucent over the current one before applying it.
function showGhost(built,candidate){previewModel=built;previewParams=candidate;if(!tools)return;tools.setGhost(built,partsOf(built,candidate));setGhostMode('proposal');$('loading').style.display='none';ghostFit=!model||Math.max(...(built.dimensions||[0]))>Math.max(...(model.dimensions||[1]))*1.3?built:null;if(camera)resetView(candidate.kind!=='free',false,built);$('ghostSwitch').hidden=false;}
function hideGhost(){tools?.setGhost(null);ghostFit=null;previewModel=null;previewParams=null;if($('dimensions'))updatePreviewStats(false);if(params.kind==='free'&&!params.freeDesign&&$('loading'))$('loading').style.display='block';if($('ghostSwitch'))$('ghostSwitch').hidden=true;}
function updatePreviewStats(showPreview){const ref=showPreview?previewModel:model,p=showPreview?previewParams:params;if(!p)return;document.querySelector('.live').innerHTML='<i></i>'+(showPreview?(p.kind==='keychain'?'TU LLAVERO · VISTA PREVIA':'PROPUESTA · SIN APLICAR'):'PIEZA ACTUAL');$('dimensions').textContent=ref?sizeText(ref.dimensions||[p.width,p.height]):'Por definir';$('totalHeight').textContent=ref?ref.totalHeight.toFixed(1).replace('.',',')+' mm':'—';$('partLabel').textContent=p.kind==='keychain'?'Logo + QR · '+ref.parts.length+' colores':p.kind==='free'?(p.forge?'Forge · sólido importado':'Diseño libre'):'Base + relieve';}
function setGhostMode(mode){tools?.setGhostMode(mode);updatePreviewStats(mode!=='current'&&Boolean(previewModel));for(const b of document.querySelectorAll('[data-ghost]'))b.setAttribute('aria-pressed',String(b.dataset.ghost===mode));}
for(const b of document.querySelectorAll('[data-ghost]'))b.onclick=()=>setGhostMode(b.dataset.ghost);

// ---- Print review: material, time, cost, supports, thin walls and best orientation.
{const card=document.createElement('section');card.className='print-review';card.id='printReview';card.hidden=true;card.innerHTML='<p class="eyebrow">REVISIÓN DE IMPRESIÓN</p><div class="review-stats"><div><small>MATERIAL</small><strong id="reviewGrams">—</strong></div><div><small>TIEMPO</small><strong id="reviewTime">—</strong></div><div><small>COSTO</small><strong id="reviewCost">—</strong></div></div><p id="reviewPrice" class="hint"></p><ul id="reviewIssues"></ul><div class="review-actions"><button type="button" id="reviewHeat" class="secondary" aria-pressed="false">Marcar en la pieza</button><button type="button" id="reviewOrient" class="secondary" hidden>Apoyar como sugiero</button><button type="button" id="reviewReset" class="subtle" hidden>Volver a la orientación original</button><button type="button" id="openSettings" class="subtle">Costos y estilo</button></div><p class="hint">Estimación para boquilla de 0,4 mm, capas de 0,2 mm y relleno del 15 %. Bambu Studio da el valor final.</p>';$('warnings').after(card);}
function scheduleReview(){clearTimeout(reviewTimer);reviewTimer=setTimeout(runReview,250);}
function runReview(){if(!model){review=null;showReview();return;}try{review=reviewPrint(model.combined,model.volume);}catch(e){console.error(e);review=null;}showReview();}
function showReview(){
 const has=Boolean(review&&model);$('printReview').hidden=!has;if(!has){tools?.setHeat(null);return;}
 const c=costOf(review,settings);$('reviewGrams').textContent=review.grams.toFixed(1).replace('.',',')+' g';$('reviewTime').textContent=durationText(review.seconds);$('reviewCost').textContent=money(c.cost,settings);
 $('reviewPrice').textContent='Precio sugerido con '+settings.margin+' % de margen: '+money(c.price,settings)+(review.supportVolume>1?' · incluye soportes estimados':'');
 $('reviewIssues').replaceChildren(...(review.issues.length?review.issues:[{kind:'ok',text:'Sin problemas detectados: no necesita soportes y las paredes tienen espesor suficiente.'}]).map(i=>{const li=document.createElement('li');li.className='issue '+i.kind;li.textContent=i.text;return li;}));
 const free=params.kind==='free';$('reviewOrient').hidden=!(free&&review.suggestion);$('reviewReset').hidden=!(free&&params.printRotation.some(Boolean));
 if(review.suggestion)$('reviewOrient').textContent='Apoyar como sugiero (soportes '+Math.round(review.overhangArea)+' → '+Math.round(review.suggestion.overhang)+' mm²)';
 tools?.setHeat(heatOn?[{mesh:review.highlight.overhang,color:'#ff5a5f'},{mesh:review.highlight.thin,color:'#ffb020'}]:null);
}
$('reviewHeat').onclick=()=>{heatOn=!heatOn;$('reviewHeat').setAttribute('aria-pressed',String(heatOn));showReview();if(heatOn)toast('Rojo: voladizos que necesitan soporte. Naranja: paredes demasiado finas.');};
$('reviewOrient').onclick=()=>{if(!review?.suggestion)return;rememberState();params.printRotation=composeRotation(params.printRotation,review.suggestion.rotation);sync();if(camera)resetView();toast('Pieza reorientada para imprimir con menos soportes.');};
$('reviewReset').onclick=()=>{params.printRotation=[0,0,0];sync();if(camera)resetView();};
// ---- Settings: costs and personal style.
{const dialog=document.createElement('dialog');dialog.id='settingsDialog';dialog.innerHTML='<form method="dialog" id="settingsForm"><div class="panel-title"><h2>Costos y estilo</h2><button value="cancel" class="subtle">Cerrar ✕</button></div><p class="eyebrow">COSTOS</p><div class="fields"><label>Filamento · precio por kg<input name="pricePerKg" type="number" min="0" step="100"></label><label>Moneda<input name="currency" maxlength="4"></label></div><div class="fields"><label>Uso de la impresora · por hora<input name="hourly" type="number" min="0" step="10"></label><label>Extra por pieza (armado, envío)<input name="extra" type="number" min="0" step="10"></label></div><label>Margen de ganancia · %<input name="margin" type="number" min="0" max="1000" step="5"></label><label>Nombre del emprendimiento (para presupuestos)<input name="business" maxlength="60"></label><p class="eyebrow">MI ESTILO</p><div class="fields"><label>Color base favorito<input name="baseColor" type="color"></label><label>Color de detalle favorito<input name="detailColor" type="color"></label></div><label>Tipografía preferida<select name="font"><option value="gentilis">Clásica (Gentilis)</option><option value="helvetiker">Moderna (Helvetiker)</option><option value="optimer">Elegante (Optimer)</option></select></label><label>Holgura para encastres · mm<input name="fitClearance" type="number" min="0" max="1" step="0.05"></label><label>Notas de estilo para la guía<textarea name="styleNotes" maxlength="400" rows="2" placeholder="Me gustan las formas redondeadas, bordes suaves, letras grandes…"></textarea></label><button value="save" class="primary full">Guardar</button></form>';document.body.append(dialog);
 dialog.addEventListener('close',()=>{if(dialog.returnValue!=='save')return;const form=new FormData($('settingsForm')),next={...settings};for(const [k,v] of form)next[k]=typeof settingDefaults[k]==='number'?Math.max(0,Number(v)||0):String(v);settings=next;saveSettings(settings);showReview();toast('Ajustes guardados en este navegador.');});}
function openSettings(){const form=$('settingsForm');for(const [k,v] of Object.entries(settings))if(form.elements[k])form.elements[k].value=v;$('settingsDialog').showModal();}
$('openSettings').onclick=openSettings;

function editProgram(program){const candidate={...params,freeDesign:program};try{buildModel(api,validate(candidate));}catch(e){return e.message;}rememberState();params=candidate;sync();return null;}
$('undoEdit').onclick=()=>{if(!history.length)return;future.push(structuredClone(params));params=history.pop();sync();updateHistoryButtons();toast('Cambio deshecho.');};
$('redoEdit').onclick=()=>{if(!future.length)return;history.push(structuredClone(params));params=future.pop();sync();updateHistoryButtons();toast('Cambio rehecho.');};

// ---- Spare parts: measuring guide, measures on the photo and a quick fit test.
$('startSpare').onclick=()=>openSparePart(settings,prompt=>{startBlank();$('assistantPrompt').value=prompt;if(localAssistant&&!$('askAssistant').disabled)$('assistantForm').requestSubmit();else toast('Revisá el pedido y envialo a la guía.');});
$('measureReference').onclick=()=>{if(!referenceImage)return;openPhotoMeasure(referenceImage,text=>{const p=$('assistantPrompt');p.value=(p.value.trim()?p.value.trim()+' ':'')+text;p.focus();toast('Medidas agregadas a tu pedido.');});};
{const box=document.createElement('section');box.className='fit-test';box.innerHTML='<p class="eyebrow">PRUEBA DE ENCAJE</p><p class="hint">Imprimí solo una franja de la pieza (unos minutos) para probar cómo encaja antes de gastar el material completo.</p><div class="fields"><label>Desde · mm<input id="couponFrom" type="number" min="0" step="0.5" value="0"></label><label>Alto · mm<input id="couponHeight" type="number" min="1" step="0.5" value="6"></label></div><button type="button" id="exportCoupon" class="secondary full">Descargar prueba de encaje (3MF)</button>';$('exportStl').nextElementSibling.after(box);}
$('exportCoupon').onclick=async()=>{render();if(!model)return;try{const coupon=fitCoupon(api,model,Number($('couponFrom').value),Number($('couponHeight').value));const name=revisionName(params.project+' prueba')+'.3mf',bytes=threeMfBytes(coupon);const result=await saveAsFile(window,bytes,name,'3mf');if(result.method==='download')download(bytes,name,'model/3mf');toast('Prueba de encaje lista: '+coupon.dimensions.map(v=>v.toFixed(1).replace('.',',')).join(' × ')+' mm.');}catch(e){toast(e.message);}};

// ---- Studio outputs: product photo and quote.
function captureTarget(){return {renderer,scene,camera,hide:[stageGrid,tools?.overlay]};}
{const box=document.createElement('section');box.className='studio-output';box.innerHTML='<p class="eyebrow">PARA MOSTRAR Y VENDER</p><div class="review-actions"><button type="button" id="productPhoto" class="secondary">Foto de producto</button><button type="button" id="quotePdf" class="secondary">Presupuesto (PDF)</button></div><p class="hint">La foto usa la vista actual: girá la pieza hasta el ángulo que más te guste.</p>';$('printReview').after(box);}
$('productPhoto').onclick=async()=>{render();if(!model||!camera)return;const blob=await productPhoto(captureTarget(),{title:params.project,subtitle:[settings.business,modelSize().map(v=>v.toFixed(0)).join(' × ')+' mm'].filter(Boolean).join(' · ')});download(blob,basename()+'-foto.png','image/png');toast('Foto de producto descargada.');};
$('quotePdf').onclick=()=>{render();if(!model||!camera)return;if(!review)runReview();if(!review){toast('Esperá a que termine la revisión de impresión.');return;}
 const c=costOf(review,settings),colors=partsOf(model,params).filter(p=>p.mesh.triangles.length).map(p=>p.color),work=c.price-c.cost;
 printHtml(quoteHtml({business:settings.business,date:new Date().toLocaleDateString('es-AR'),project:params.project,image:thumbnail(captureTarget()).replace('image/jpeg','image/jpeg'),size:modelSize().map(v=>v.toFixed(1).replace('.',',')).join(' × ')+' mm',grams:review.grams.toFixed(1).replace('.',',')+' g',time:durationText(review.seconds),colors,material:money(c.material,settings),machine:c.machine?money(c.machine,settings):'',extra:settings.extra?money(settings.extra,settings):'',work:money(work,settings),total:money(c.price,settings)}));
 toast('Se abrió el diálogo de impresión: elegí «Guardar como PDF».');};

function modelSize(){if(model.dimensions)return model.dimensions;const p=model.combined.positions,k=model.combined.numProp,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<p.length;i+=k)for(let j=0;j<3;j++){min[j]=Math.min(min[j],p[i+j]);max[j]=Math.max(max[j],p[i+j]);}return max.map((v,j)=>v-min[j]);}


// Forge shares the proven proposal/preview/apply flow; compiler code stays server-side.
forgeUI=mountForge({host:assistant,api,getContext:()=>({current:params,pending:proposal,epoch:projectEpoch,busy:assistantBusy}),download,toast,onBusy:busy=>{$('applyProposal').disabled=busy||assistantBusy;$('discardProposal').disabled=busy||assistantBusy;},onView:()=>showWorkspaceView('piece',false),offerProposal:(checked,base)=>{
 if(JSON.stringify(params)!==base)throw Error('La pieza cambió. Volvé a generar la propuesta.');
 visualDesigner.reset();
 proposal=checked.candidate;proposalBase=base;
 $('proposalSummary').textContent='Alfred Forge · '+sizeText(checked.built.dimensions)+' · sin aplicar';
 $('proposalChanges').replaceChildren(...['Reemplazar la geometría por la versión de Forge seleccionada.','Conservar fuente OpenSCAD e historial en el proyecto editable.','Tu pieza actual se conserva hasta que uses Aplicar.'].map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
 $('proposalCard').hidden=false;$('applyProposal').hidden=false;showGhost(checked.built,checked.candidate);if(camera)resetView(false,false,checked.built);
}});
// Keep the shared proposal reachable in either design mode.
assistant.append($('proposalCard'));
const forgeStart=document.createElement('button');forgeStart.id='startForge';forgeStart.className='start-card';forgeStart.innerHTML='<span>✦</span><b>Alfred Forge</b><small>Generá y corregí piezas · experimental.</small>';document.querySelector('.start-options').append(forgeStart);
forgeStart.onclick=()=>{forgeUI.open();showWorkspaceView('chat',false);assistant.scrollIntoView({behavior:'smooth',block:'start'});};

// A direct path for a common physical product: logo + link, without an AI detour.
$('startTemplate').innerHTML='<span>▦</span><b>Llavero · logo + QR</b><small>Tu marca adelante. El enlace atrás.</small>';
$('startTemplate').classList.add('keychain-start');
const quickCreate=document.createElement('section');quickCreate.className='quick-create';quickCreate.innerHTML='<div><p class="eyebrow">CREACIÓN GUIADA</p><h2>Un llavero. Tu marca. Dos caras.</h2><p>Subí el logo, indicá el enlace y revisá la pieza. Un solo archivo para Bambu Studio.</p></div>';const entry=$('startTemplate');quickCreate.append(entry);document.querySelector('.intro').after(quickCreate);const moreProjects=document.createElement('details');moreProjects.className='more-projects';moreProjects.innerHTML='<summary>Otros proyectos y herramientas</summary>';quickCreate.after(moreProjects);moreProjects.append(document.querySelector('.project-start'),document.querySelector('.products'));
const keychainActions=document.createElement('section');keychainActions.id='keychainActions';keychainActions.className='keychain-result';keychainActions.hidden=true;
keychainActions.innerHTML='<div><p class="eyebrow">TU LLAVERO DE DOS CARAS</p><strong id="keychainResultTitle"></strong><p id="keychainDestination"></p></div><div class="keychain-result-buttons"><button class="secondary" id="keychainFrontView">Ver frente</button><button class="secondary" id="keychainBackView">Ver dorso</button><button class="primary" id="keychainDownload" disabled>Guardar 3MF para Bambu Studio</button><button class="subtle" id="keychainEdit">Cambiar logo o enlace</button><details class="keychain-extra"><summary>Más opciones</summary><button class="secondary" id="keychainApply">Usar en el taller</button><button class="subtle" id="keychainCancel">Descartar</button></details></div>';
document.querySelector('.workspace').before(keychainActions);
function syncKeychainActions(){
 const host=$('keychainActions');if(!host)return;const pending=proposal?.kind==='keychain',active=pending?proposal:params.kind==='keychain'?params:null;host.hidden=!active;document.querySelector('.workspace').classList.toggle('keychain-workspace',!!active);document.querySelector('.workspace-actions').hidden=!!active;if(!active)return;
 $('keychainResultTitle').textContent=active.width+' × '+active.height+' mm · '+(pending?'vista previa lista':'llavero aplicado');$('keychainDestination').textContent='El QR lleva a '+active.qrText;
 $('keychainApply').hidden=!pending;$('keychainCancel').hidden=!pending;$('keychainApply').disabled=assistantBusy||!!forgeUI?.isBusy();$('keychainDownload').hidden=false;$('keychainDownload').disabled=!(pending?previewModel:model);
}
$('keychainFrontView').onclick=()=>{showWorkspaceView('piece',false);if(camera)resetView(true,false,previewModel);};
$('keychainBackView').onclick=()=>{showWorkspaceView('piece',false);if(camera)resetView(false,true,previewModel);};
$('keychainApply').onclick=()=>$('applyProposal').click();$('keychainCancel').onclick=()=>$('discardProposal').click();
$('keychainDownload').onclick=()=>{const output=proposal?.kind==='keychain'?previewModel:params.kind==='keychain'?model:null;if(output)download(threeMfBytes(output),safeName(output.params.project)+'.3mf','model/3mf');};
$('keychainEdit').onclick=()=>{const active=proposal?.kind==='keychain'?proposal:params;keychainDesigner.open({keychain:active.keychain,url:active.qrText,width:active.width,height:active.height});};
keychainDesigner=createKeychainDesigner({onError:toast,onCreate(config){
 if(assistantBusy||forgeUI?.isBusy())throw Error('Esperá a que termine la consulta actual.');
 const candidate=validate({...defaults,...config,kind:'keychain',project:('Llavero · '+config.keychain.name.replace(/\.[^.]+$/,'')).slice(0,60),shape:'round',thickness:3.2,relief:.6,hole:4,baseColor:'#ffffff',detailColor:'#30213d',caption:''}),built=buildModel(api,candidate);
 clearProposal();visualDesigner.reset();forgeUI?.openCad();proposal=candidate;proposalBase=JSON.stringify(params);
 $('proposalSummary').textContent='Logo original en el frente + QR en el dorso · '+sizeText(built.dimensions);$('proposalChanges').replaceChildren(...['Una sola pieza con agujero para argolla.','Logo completo adaptado a colores de filamento.','QR de color al ras del dorso, con margen libre.'].map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
 $('proposalCard').hidden=false;$('applyProposal').hidden=false;showGhost(built,candidate);syncKeychainActions();showWorkspaceView('piece',false);
 $('assistantReply').textContent='Llavero listo. Revisá frente y dorso y guardá el 3MF. Usar en el taller es opcional.';keychainActions.scrollIntoView({behavior:'smooth',block:'start'});
}});
