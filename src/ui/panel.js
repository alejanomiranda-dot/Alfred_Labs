// «Tu pieza»: solo los controles que tienen sentido para el tipo de pieza actual.
import {keychainLogoPreview,keychainUrl} from '../keychain.js';
import {renderOpEditor} from '../op-editor.js';

const el=(tag,props={},...children)=>{const node=Object.assign(document.createElement(tag),props);node.append(...children.filter(c=>c!==null&&c!==undefined&&c!==false));return node;};
const fmt=v=>String(Math.round(v*10)/10).replace('.',',');

function group(title,...children){return el('section',{className:'group'},title?el('h3',{textContent:title}):null,...children);}

function numberControl({label,value,min,max,step=1,unit='mm',disabled=false,onCommit}){
 const out=el('output',{textContent:fmt(value)+' '+unit});
 const range=el('input',{type:'range',min,max,step,value,disabled});
 const error=el('div',{className:'error',hidden:true});
 range.setAttribute('aria-label',label);
 range.addEventListener('input',()=>{out.textContent=fmt(Number(range.value))+' '+unit;onCommit(Number(range.value),{live:true});});
 range.addEventListener('change',()=>onCommit(Number(range.value),{live:false}));
 return el('div',{className:'control'},el('span',{},label,out),range,error);
}
function textControl({label,value,maxLength,placeholder='',onCommit,validate}){
 const input=el('input',{type:'text',value:value??'',maxLength,placeholder});
 const error=el('div',{className:'error',hidden:true});
 let timer;
 input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{
  let value=input.value;
  if(validate){try{value=validate(value);error.hidden=true;}catch(e){error.textContent=e.message;error.hidden=false;return;}}
  onCommit(value);
 },350);});
 return el('label',{className:'control'},label,input,error);
}
function choiceControl({label,value,options,onCommit}){
 const box=el('div',{className:'choice',role:'group'});box.setAttribute('aria-label',label);
 for(const [key,text] of options){const b=el('button',{type:'button',textContent:text});b.setAttribute('aria-pressed',String(key===value));b.onclick=()=>{for(const o of box.children)o.setAttribute('aria-pressed',String(o===b));onCommit(key);};box.append(b);}
 return el('div',{className:'control'},el('span',{},label),box);
}
function colorControl(items){
 const row=el('div',{className:'swatches'});
 for(const {label,value,onCommit,readOnly} of items){
  const sw=el('label',{className:'swatch',title:label});sw.style.background=value;
  if(!readOnly){const input=el('input',{type:'color',value});input.setAttribute('aria-label',label);input.addEventListener('input',()=>{sw.style.background=input.value;onCommit(input.value);});sw.append(input);}
  row.append(sw);
 }
 return row;
}

const shapes=[['circle','Redonda'],['round','Rectangular'],['oval','Ovalada'],['bone','Hueso']];

function templateControls(p,ctx){
 const set=key=>(value,opts)=>ctx.update({[key]:value},opts);
 const nodes=[];
 if(p.kind==='tag')nodes.push(group('Texto',textControl({label:'Nombre',value:p.name,maxLength:20,onCommit:set('name')}),textControl({label:'Teléfono o dato de contacto',value:p.phone,maxLength:24,onCommit:set('phone')})));
 if(p.kind==='qr')nodes.push(group('Enlace',textControl({label:'¿A dónde lleva el QR?',value:p.qrText,maxLength:180,onCommit:set('qrText')})));
 if(p.kind==='logo')nodes.push(group('Texto',textControl({label:'Texto bajo el logo',value:p.caption,maxLength:20,onCommit:set('caption')})));
 nodes.push(group('Forma y tamaño',
  choiceControl({label:'Forma',value:p.shape,options:shapes,onCommit:shape=>ctx.update(shape==='circle'?{shape,height:p.width}:{shape},{rerender:true})}),
  numberControl({label:p.shape==='circle'?'Diámetro':'Ancho',value:p.width,min:25,max:100,onCommit:(v,o)=>ctx.update(p.shape==='circle'?{width:v,height:v}:{width:v},o)}),
  p.shape==='circle'?null:numberControl({label:'Alto',value:p.height,min:25,max:100,onCommit:set('height')})
 ));
 nodes.push(group('Colores',colorControl([{label:'Color de la placa',value:p.baseColor,onCommit:set('baseColor')},{label:'Color de letras y detalles',value:p.detailColor,onCommit:set('detailColor')}])));
 const more=el('details',{},el('summary',{textContent:'Más ajustes'}),
  numberControl({label:'Grosor de la placa',value:p.thickness,min:1.6,max:6,step:.2,onCommit:set('thickness')}),
  numberControl({label:'Altura de letras y dibujo',value:p.relief,min:.4,max:2,step:.2,onCommit:set('relief')}),
  numberControl({label:'Agujero para la argolla',value:p.hole,min:2,max:6,step:.5,onCommit:set('hole')}),
  choiceControl({label:'Dibujo en el dorso',value:p.backDecoration,options:[['none','Ninguno'],['bone','Huesito']],onCommit:v=>ctx.update({backDecoration:v},{rerender:true})}),
  p.backDecoration==='bone'?choiceControl({label:'Terminación del dorso',value:p.backStyle,options:[['engraved','Grabado'],['raised','En relieve']],onCommit:set('backStyle')}):null
 );
 nodes.push(group(null,more));
 return nodes;
}

function keychainControls(p,ctx){
 const preview=el('img',{className:'logo-preview',alt:'Logo del frente',src:keychainLogoPreview(p.keychain)});
 const change=el('button',{type:'button',className:'secondary full',textContent:'Cambiar logo'});change.onclick=()=>ctx.replaceLogo();
 const colors=(ctx.model?.parts||[]).map(part=>({label:'Color del llavero',value:part.color,readOnly:true}));
 return [
  group('Frente',preview,change),
  group('Dorso · QR',textControl({label:'¿A dónde lleva el QR?',value:p.qrText,maxLength:180,validate:v=>keychainUrl(/^https?:\/\//i.test(v.trim())?v:'https://'+v.trim()),onCommit:v=>ctx.update({qrText:v})})),
  group('Tamaño',numberControl({label:'Ancho',value:p.width,min:45,max:100,onCommit:(v,o)=>ctx.update({width:v},o)}),numberControl({label:'Alto',value:p.height,min:50,max:100,onCommit:(v,o)=>ctx.update({height:v},o)})),
  colors.length?group('Colores del archivo',colorControl(colors),el('p',{className:'note',textContent:'Base clara y hasta 3 colores tomados del logo. Asignalos a tus filamentos en Bambu Studio.'})):null
 ].filter(Boolean);
}

function reliefControls(p,ctx){
 const spec={...p.sourceInfo};
 if(!ctx.canRebuildRelief)return [group('Relieve',el('p',{className:'note',textContent:'Relieve de '+fmt(spec.width)+' × '+fmt(spec.height)+' mm. Para cambiar el tamaño o el dibujo, pedíselo a Alfred en el chat.'}))];
 const commit=(key)=>(v,o)=>{if(o?.live)return;spec[key]=v;ctx.rebuildRelief({...spec});};
 const invert=el('input',{type:'checkbox',checked:ctx.reliefInverted});invert.onchange=()=>ctx.rebuildRelief({...spec},invert.checked);
 return [group('Tamaño del relieve',
  numberControl({label:'Ancho',value:spec.width,min:10,max:250,onCommit:commit('width')}),
  numberControl({label:'Alto',value:spec.height,min:10,max:250,onCommit:commit('height')}),
  numberControl({label:'Base',value:spec.baseThickness,min:1.2,max:8,step:.2,onCommit:commit('baseThickness')}),
  numberControl({label:'Profundidad del dibujo',value:spec.depth,min:.4,max:15,step:.2,onCommit:commit('depth')}),
  el('label',{className:'control'},invert,' Elevar las zonas oscuras'),
  el('p',{className:'note',textContent:'Cambiar estas medidas no vuelve a generar la imagen.'})
 )];
}

function forgeControls(p,ctx){
 const archive=p.forge,selected=archive.revisions.find(r=>r.id===archive.selected);
 const select=el('select',{});for(const [i,r] of archive.revisions.entries()){const o=el('option',{value:r.id,textContent:(i+1)+'. '+r.prompt.slice(0,48)});o.selected=r.id===archive.selected;select.append(o);}
 const rebuild=el('button',{type:'button',className:'secondary',textContent:'Ver esta versión'});rebuild.onclick=()=>ctx.forgeVersion(select.value);
 const source=el('button',{type:'button',className:'secondary',textContent:'Descargar fuente .scad'});source.onclick=()=>ctx.forgeSource(select.value);
 const notes=[...(selected?.assumptions||[]),...(selected?.caveats||[])];
 const summary=(selected?.description||'Pieza generada por Alfred.').split(/(?<=.)s/)[0];
 return [
  group('Pieza generada',el('p',{className:'note',textContent:summary}),el('p',{className:'note',textContent:'Para cambiarla, pedíselo a Alfred: «más alta», «sin cola», «orejas más grandes».'})),
  group(null,el('details',{},el('summary',{textContent:'Avanzado · versiones, notas y fuente'}),el('label',{},'Versión',select),el('div',{className:'library-actions'},rebuild,source),notes.length?el('ul',{className:'note'},...notes.map(t=>el('li',{textContent:t}))):null,el('pre',{className:'forge-code',textContent:selected?.scad||''})))
 ];
}

function freeControls(p,ctx){
 const nodes=[];
 if(!ctx.model?.parts||ctx.model.parts.length<=1)nodes.push(group('Color',colorControl([{label:'Color de la pieza',value:p.baseColor,onCommit:v=>ctx.update({baseColor:v})}])));
 else nodes.push(group('Colores',colorControl(ctx.model.parts.map(part=>({label:'Color',value:part.color,readOnly:true}))),el('p',{className:'note',textContent:'Para cambiar un color, pedíselo a Alfred: «la tapa en rojo».'})));
 if(p.freeDesign?.nodes?.length){
  const editor=el('div',{id:'opEditor'});
  renderOpEditor(editor,p.freeDesign,program=>ctx.editProgram(program));
  nodes.push(group(null,el('details',{},el('summary',{textContent:'Avanzado · medidas de cada parte'}),el('p',{className:'note',textContent:'Cada parte de la pieza con sus medidas exactas en mm.'}),editor)));
 }
 return nodes;
}

export function renderPanel(host,ctx){
 const p=ctx.params;host.replaceChildren();
 let nodes;
 if(p.kind==='keychain')nodes=keychainControls(p,ctx);
 else if(p.kind!=='free')nodes=templateControls(p,ctx);
 else if(p.sourceInfo)nodes=reliefControls(p,ctx);
 else if(p.forge)nodes=forgeControls(p,ctx);
 else nodes=freeControls(p,ctx);
 host.append(...nodes);
}

export function renderStatus(host,{review,model,settings,money,durationText,costOf,heatOn,canOrient,onHeat,onOrient,onPrint}){
 host.replaceChildren();
 if(!model){host.append(el('div',{className:'status idle'},el('strong',{textContent:'Todavía no hay pieza'}),'Contale a Alfred qué querés imprimir.'));return;}
 if(!review){host.append(el('div',{className:'status idle'},el('strong',{textContent:'Revisando la pieza…'})));return;}
 const c=costOf(review,settings),meta=el('span',{className:'meta',textContent:review.grams.toFixed(1).replace('.',',')+' g · '+durationText(review.seconds)+' · '+money(c.cost,settings)});
 const real=review.issues.filter(i=>i.kind!=='ok');
 if(!real.length){
  const print=el('button',{type:'button',textContent:'Imprimir'});print.onclick=onPrint;
  host.append(el('div',{className:'status ok'},el('strong',{textContent:'Lista para imprimir'}),'No necesita soportes y las paredes tienen buen espesor.',meta,el('div',{className:'actions'},print)));return;
 }
 const actions=el('div',{className:'actions'});
 const heat=el('button',{type:'button',textContent:heatOn?'Ocultar marcas':'Ver dónde'});heat.onclick=onHeat;actions.append(heat);
 if(canOrient){const orient=el('button',{type:'button',textContent:'Apoyarla mejor'});orient.onclick=onOrient;actions.append(orient);}
 host.append(el('div',{className:'status warn'},el('strong',{textContent:real.length===1?'1 cosa para revisar':real.length+' cosas para revisar'}),el('ul',{},...real.map(i=>el('li',{textContent:i.text}))),meta,actions));
}
