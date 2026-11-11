import QRCode from 'qrcode';
import {contourField,blurField,ringArea} from './trace.js';

export function keychainUrl(value){
 let url;try{url=new URL(value.trim());}catch{throw Error('Escribí un enlace completo, por ejemplo https://tumutual.com.');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.href.length>180)throw Error('Usá un enlace web público de hasta 180 caracteres, sin contraseñas.');
 return url.href;
}
const REGIONS=['marca','texto'];
export function validateKeychain(raw){
 if(!raw||raw.version!==1||typeof raw.name!=='string'||raw.name.length>120||!Number.isInteger(raw.width)||!Number.isInteger(raw.height)||raw.width<2||raw.height<2||raw.width>1024||raw.height>1024||!Array.isArray(raw.layers)||!raw.layers.length||raw.layers.length>8)throw Error('El logo del llavero no es válido. Volvé a cargarlo.');
 let count=0;
 for(const layer of raw.layers){
  if(!/^#[a-f\d]{6}$/i.test(layer.color)||!Array.isArray(layer.polygons)||!layer.polygons.length||layer.polygons.length>800)throw Error('Los colores o contornos del logo no son válidos.');
  if(layer.region!==undefined&&!REGIONS.includes(layer.region)||layer.source!==undefined&&!/^#[a-f\d]{6}$/i.test(layer.source))throw Error('Las partes del logo no son válidas.');
  for(const polygon of layer.polygons){if(!Array.isArray(polygon)||polygon.length<3)throw Error('Contorno de logo inválido.');for(const point of polygon){if(!Array.isArray(point)||point.length!==2||!point.every((v,i)=>Number.isFinite(v)&&v>=0&&v<=(i?raw.height:raw.width)))throw Error('Coordenadas de logo inválidas.');count++;}}
 }
 if(count>40000)throw Error('El logo tiene demasiados detalles para este llavero.');
 if(new Set(raw.layers.map(l=>l.color.toLowerCase())).size>3)throw Error('El logo usa más de 3 colores; con la base serían más de los 4 filamentos del AMS.');
 return raw;
}
const luminance=rgb=>rgb.reduce((sum,c,i)=>sum+[.2126,.7152,.0722][i]*(c/255<=.04045?c/255/12.92:((c/255+.055)/1.055)**2.4),0);
const colorRgb=color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
const hex=rgb=>'#'+rgb.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const distance=(a,b)=>a.reduce((sum,v,i)=>sum+(v-b[i])**2,0);

// Colores con nombre para entender pedidos («el nombre en negro») y contar los cambios en palabras.
const NAMED=[['negro','#1b1b1b'],['blanco','#ffffff'],['gris','#808080'],['gris oscuro','#4a4a4a'],['gris claro','#c8c8c8'],['rojo','#d0312d'],['bordó','#7b1e2e'],['naranja','#f39237'],['amarillo','#f6c90e'],['dorado','#c9a227'],['verde','#2e9d4f'],['verde oscuro','#1e5631'],['celeste','#5ab4e5'],['azul','#1f4fbf'],['azul marino','#1b2a4a'],['violeta','#7d4a9e'],['lila','#b39ddb'],['rosa','#e57bb8'],['fucsia','#d63384'],['marrón','#7a4a2a'],['beige','#e6d5b8'],['plateado','#b8bec6']];
const WORDS=[['negr[oa]s?','negro'],['blanc[oa]s?','blanco'],['gris(?:es)? oscur[oa]s?','gris oscuro'],['gris(?:es)? clar[oa]s?','gris claro'],['gris(?:es)?','gris'],['roj[oa]s?','rojo'],['bordo','bordó'],['naranjas?|anaranjad[oa]s?','naranja'],['amarill[oa]s?','amarillo'],['dorad[oa]s?|oro','dorado'],['verdes? oscur[oa]s?','verde oscuro'],['verdes?','verde'],['celestes?','celeste'],['azul(?:es)? marino','azul marino'],['azul(?:es)?','azul'],['violetas?|morad[oa]s?|purpura','violeta'],['lilas?','lila'],['rosas?|rosad[oa]s?','rosa'],['fucsias?|magentas?','fucsia'],['marron(?:es)?|cafe','marrón'],['beige','beige'],['platead[oa]s?|plata','plateado']];
export function colorName(color){const rgb=colorRgb(color);return NAMED.reduce((a,b)=>distance(colorRgb(b[1]),rgb)<distance(colorRgb(a[1]),rgb)?b:a)[0];}
const plain=text=>text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

function kmeans(pixels,max,minShare=.03){
 if(!pixels.length)return [];
 const centers=[pixels.reduce((a,b)=>luminance(a.rgb)<luminance(b.rgb)?a:b).rgb.slice()];
 while(centers.length<max){const next=pixels.reduce((a,b)=>Math.min(...centers.map(c=>distance(b.rgb,c)))>Math.min(...centers.map(c=>distance(a.rgb,c)))?b:a);if(Math.min(...centers.map(c=>distance(next.rgb,c)))<400)break;centers.push(next.rgb.slice());}
 for(let iteration=0;iteration<8;iteration++){
  const sums=centers.map(()=>[0,0,0,0]);
  for(const p of pixels){let chosen=0;for(let j=1;j<centers.length;j++)if(distance(p.rgb,centers[j])<distance(p.rgb,centers[chosen]))chosen=j;for(let k=0;k<3;k++)sums[chosen][k]+=p.rgb[k];sums[chosen][3]++;}
  for(let j=0;j<centers.length;j++)if(sums[j][3])centers[j]=sums[j].slice(0,3).map(v=>v/sums[j][3]);
  // A color that only covers antialiased rims is not a filament: drop it and let its pixels join a neighbour.
  if(iteration===3&&centers.length>1){const keep=centers.filter((_,j)=>sums[j][3]>=pixels.length*minShare);if(keep.length&&keep.length<centers.length)centers.splice(0,centers.length,...keep);}
 }
 return centers;
}

// Bandas separadas por filas (o columnas) vacías. Una banda ancha y baja, aparte del dibujo principal, es texto.
function textBands(solid,width,height){
 for(const vertical of [false,true]){
  const length=vertical?width:height,across=vertical?height:width,at=(i,j)=>vertical?solid[j*width+i]:solid[i*width+j];
  const counts=new Int32Array(length);for(let i=0;i<length;i++)for(let j=0;j<across;j++)counts[i]+=at(i,j);
  const gap=Math.max(2,Math.round(length*.02)),bands=[];let start=-1,empty=0;
  for(let i=0;i<=length;i++){
   if(i<length&&counts[i]){if(start<0)start=i;empty=0;continue;}
   if(start<0)continue;empty++;if(empty>=gap||i===length){bands.push([start,i-empty+1]);start=-1;empty=0;}
  }
  if(bands.length<2)continue;
  const info=bands.map(([a,b])=>{let pixels=0,lo=across,hi=-1;for(let i=a;i<b;i++)for(let j=0;j<across;j++)if(at(i,j)){pixels++;lo=Math.min(lo,j);hi=Math.max(hi,j);}return {a,b,pixels,size:b-a,span:hi-lo+1};});
  const main=info.reduce((x,y)=>y.pixels>x.pixels?y:x);
  // Texto debajo/encima: banda más ancha que alta. Texto al costado (columnas): banda más ancha que alta también.
  const text=info.filter(b=>b!==main&&b.size<=length*.45&&(vertical?b.size>=b.span*1.6:b.span>=b.size*2));
  if(text.length)return {vertical,bands:text.map(b=>[b.a,b.b])};
 }
 return null;
}

// Reduce an existing logo to printable color regions; no generated interpretation.
// Each region (the mark and, when it stands apart, the lettering) keeps its own parts so it can be recolored.
// Outlines come from a smoothed coverage field with sub-pixel contours, so edges are not stepped.
export function traceColorLogo(rgba,width,height,name='Logo'){
 if(width<2||height<2||width>640||height>640||rgba.length!==width*height*4)throw Error('El logo debe prepararse a una resolución de hasta 640 px.');
 const cover=new Float32Array(width*height);
 for(let i=0;i<cover.length;i++){const m=Math.min(rgba[i*4],rgba[i*4+1],rgba[i*4+2]);cover[i]=rgba[i*4+3]/255*Math.max(0,Math.min(1,(245-m)/20));}
 let minX=width,minY=height,maxX=-1,maxY=-1,count=0;
 for(let i=0;i<cover.length;i++)if(cover[i]>=.5){const x=i%width,y=Math.floor(i/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;}
 if(count<8)throw Error('No se detectó el logo. Usá un PNG transparente o un dibujo sobre fondo blanco.');
 const margin=2,cropW=maxX-minX+1,cropH=maxY-minY+1,W=cropW+2*margin,H=cropH+2*margin;
 const solid=new Uint8Array(cropW*cropH);for(let y=0;y<cropH;y++)for(let x=0;x<cropW;x++)solid[y*cropW+x]=cover[(y+minY)*width+x+minX]>=.5?1:0;
 const split=textBands(solid,cropW,cropH),regionOf=(x,y)=>{if(!split)return 0;const v=split.vertical?x:y;return split.bands.some(([a,b])=>v>=a-1&&v<=b)?1:0;};
 // Color clusters: up to 3 for the mark; the lettering takes its own color only while the total stays at 3.
 const groups=[[],[]];
 for(let y=0;y<cropH;y++)for(let x=0;x<cropW;x++){const i=(y+minY)*width+x+minX;if(cover[i]>=.5)groups[regionOf(x,y)].push({rgb:[rgba[i*4],rgba[i*4+1],rgba[i*4+2]]});}
 const mark=kmeans(groups[0],3).map(c=>({center:c,color:hex(c)})),palette=mark.map(c=>c.color);
 const text=kmeans(groups[1],2,.15).map(c=>{
  const near=mark.length?mark.reduce((a,b)=>distance(b.center,c)<distance(a.center,c)?b:a):null,own=hex(c);
  if(near&&distance(near.center,c)<900)return {center:c,color:near.color};
  if(palette.length<3){palette.push(own);return {center:c,color:own};}
  // Without room for another filament, the lettering borrows the closest color and remembers its own.
  return {center:c,color:near?near.color:palette[0],source:own};
 });
 const clusters=[mark,text],label=new Int8Array(W*H).fill(-1),regionAt=new Int8Array(W*H),field=new Float32Array(W*H);
 for(let y=0;y<cropH;y++)for(let x=0;x<cropW;x++){
  const i=(y+minY)*width+x+minX;if(!cover[i])continue;
  let r=regionOf(x,y);if(!clusters[r].length)r=1-r;
  const list=clusters[r],rgb=[rgba[i*4],rgba[i*4+1],rgba[i*4+2]];
  let chosen=0;for(let j=1;j<list.length;j++)if(distance(rgb,list[j].center)<distance(rgb,list[chosen].center))chosen=j;
  const o=(y+margin)*W+x+margin;label[o]=chosen;regionAt[o]=r;field[o]=cover[i];
 }
 const layers=[],minArea=Math.max(2,(Math.max(W,H)/150)**2);
 for(const r of [0,1])for(const color of new Set(clusters[r].map(c=>c.color))){
  // Clusters that end up in the same filament (a letter and its lighter rim) are traced together, without a seam.
  const members=clusters[r].map((c,j)=>c.color===color?j:-1).filter(j=>j>=0),source=clusters[r][members[0]].source,mask=new Float32Array(W*H);
  for(let i=0;i<mask.length;i++)if(regionAt[i]===r&&members.includes(label[i]))mask[i]=field[i];
  const polygons=contourField(blurField(mask,W,H),W,H,{tolerance:.3,minArea});
  if(polygons.length)layers.push({color,polygons,region:REGIONS[r],...(source?{source}:{})});
 }
 if(!layers.length)throw Error('El logo no tiene contornos imprimibles a este tamaño.');
 return validateKeychain({version:1,name:name.slice(0,120),width:W,height:H,layers});
}

// Colors of the logo as filaments, each with the regions that use it and its area.
export function keychainColors(config){
 const out=new Map();
 for(const layer of config.layers){const key=layer.color.toLowerCase(),entry=out.get(key)||{color:key,regions:new Set(),area:0};entry.regions.add(layer.region||'marca');entry.area+=layer.polygons.reduce((s,p)=>s+Math.abs(ringArea(p)),0);out.set(key,entry);}
 return [...out.values()];
}
export const hasLogoText=config=>config.layers.some(l=>l.region==='texto');

// Paint a region (or the layers of one color) and keep at most 3 logo colors:
// if the change adds a fourth, the closest pair of the other colors becomes one.
export function recolorKeychain(config,{region=null,from=null,color}){
 if(!/^#[a-f\d]{6}$/i.test(color))throw Error('Color inválido.');color=color.toLowerCase();
 const layers=config.layers.map(layer=>{
  const match=(!region||(layer.region||'marca')===region)&&(!from||layer.color.toLowerCase()===from.toLowerCase());
  return match&&layer.color.toLowerCase()!==color?{...layer,color,source:layer.source||layer.color}:layer;
 });
 let next={...config,layers},merged=null;
 const colors=keychainColors(next);
 if(colors.length>3){
  let best=null;
  for(const a of colors)for(const b of colors)if(a!==b&&a.color!==color){const d=distance(colorRgb(a.color),colorRgb(b.color))*(1+a.area/(a.area+b.area));if(!best||d<best.d)best={d,a,b};}
  merged={from:best.a.color,to:best.b.color,regions:[...best.a.regions]};
  next={...next,layers:next.layers.map(l=>l.color.toLowerCase()===merged.from?{...l,color:merged.to,source:l.source||l.color}:l)};
 }
 return {config:validateKeychain(next),merged};
}

const regionWord={texto:'el texto del logo',marca:'la marca',qr:'el QR',base:'la base',todo:'el logo'};
// Optimal string alignment distance: tolerates a typo such as «nomreb» for «nombre».
function editDistance(a,b){
 const d=Array.from({length:a.length+1},(_,i)=>[i,...Array(b.length).fill(0)]);for(let j=1;j<=b.length;j++)d[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);}
 return d[a.length][b.length];
}
const REGION_WORDS={texto:['nombre','texto','letra','leyenda','palabra','tipografia','escrito','escrita'],marca:['marca','isotipo','simbolo','dibujo','figura','cinta','franja']};
function requestRegion(text,prompt){
 const words=text.match(/[a-z]+/g)||[],near=list=>words.some(w=>list.some(k=>w===k||w===k+'s'||w===k+'es'||w.length>=4&&Math.abs(w.length-k.length)<=2&&editDistance(w,k)<=(k==='nombre'?2:1)));
 if(near(REGION_WORDS.texto))return 'texto';
 if(/\bqr\b|codigo/.test(text))return 'qr';
 if(/\b(base|fondo|placa)\b/.test(text))return 'base';
 if(near(REGION_WORDS.marca))return 'marca';
 // Quoted words («"Mutual UNIR" en negro») are the lettering of the logo.
 if(/["“«][^"”»]{2,60}["”»]/.test(prompt))return 'texto';
 if(/\b(tod[oa]|complet[oa]|enter[oa]|logo)\b/.test(text))return 'todo';
 return null;
}
// Understands «el nombre en negro», «la marca en azul» or «quiero cambiarle el color en Bambu».
// region: texto, marca, qr, base, todo (the whole logo) or null when the request does not say which part.
export function parseKeychainColorRequest(prompt,config){
 const text=plain(prompt),bambu=/bambu|studio|filamento|carrete|\bams\b/.test(text)&&/color|cambi|asign/.test(text);
 const region=requestRegion(text,prompt);
 const mentions=[];
 for(const [pattern,name] of WORDS){
  const re=new RegExp('(^|[^a-z])(no\\s+(?:en\\s+|de\\s+)?)?('+pattern+')(?![a-z])','g');let m;
  while((m=re.exec(text))){const start=m.index+m[1].length+(m[2]||'').length;if(!mentions.some(x=>start>=x.start&&start<x.end))mentions.push({name,color:NAMED.find(n=>n[0]===name)[1],negated:!!m[2],start,end:start+m[3].length});}
 }
 for(const m of prompt.matchAll(/#[a-f\d]{6}\b/gi))mentions.push({name:m[0].toLowerCase(),color:m[0].toLowerCase(),negated:false,start:m.index,end:m.index+7});
 mentions.sort((a,b)=>a.start-b.start);
 if(!mentions.length&&!bambu)return null;
 // «Lo veo violeta, no negro»: the color someone sees describes the present; the one after «no» is what they asked for.
 for(const m of mentions)m.seen=/\b(veo|ves|ve|sale|salio|queda|quedo|esta|aparece|aparecio)\s+(?:en\s+|de\s+|color\s+)?$/.test(text.slice(Math.max(0,m.start-30),m.start));
 let pick;
 if(mentions.some(m=>m.seen)){const others=mentions.filter(m=>!m.seen);pick=others.find(m=>m.negated)||others[0];}
 else{
  // Otherwise a color the region already has is the present too («el nombre negro, no violeta»).
  const current=new Set(config.layers.filter(l=>!['texto','marca'].includes(region)||(l.region||'marca')===region).map(l=>colorName(l.color)));
  const wanted=mentions.filter(m=>!current.has(m.name));pick=wanted.find(m=>!m.negated)||wanted[0]||mentions.find(m=>!m.negated);
 }
 return {region,label:region==='texto'&&(text.match(/[a-z]+/g)||[]).some(w=>w.length>=4&&editDistance(w,'nombre')<=2)?'el nombre':regionWord[region||'todo'],color:pick?.color||null,colorName:pick?.name||null,seen:mentions.find(m=>m.seen)?.name||null,bambu};
}

const capital=s=>s[0].toUpperCase()+s.slice(1);
// QR color: the darkest logo color if it contrasts with the base; otherwise a purple-black that does.
export function keychainQrColor(config,baseColor){
 const darkest=config.layers.reduce((a,b)=>luminance(colorRgb(a.color))<luminance(colorRgb(b.color))?a:b).color.toLowerCase();
 return (luminance(colorRgb(baseColor))+.05)/(luminance(colorRgb(darkest))+.05)<4.5?'#30213d':darkest;
}
// Plan a color change of the current keychain from a chat request: {patch?, message, note?}, or null if it is not one.
export function planKeychainColorChange(params,prompt){
 const config=params.keychain,request=config&&parseKeychainColorRequest(prompt,config);if(!request)return null;
 const partNote=hasLogoText(config)?' En el 3MF el texto es una parte aparte («Texto del logo»): en Bambu Studio le podés asignar el filamento que quieras.':'';
 if(!request.color)return {message:'Cada color del llavero es una parte del 3MF y en Bambu Studio le asignás un filamento a cada una.'+partNote+' También podés cambiar los colores acá, en «Colores del archivo», o pedímelo: «el nombre en negro».'};
 const name=request.colorName;
 if(request.region==='qr')return {message:'El QR del dorso toma el color más oscuro del logo para que se lea bien; no lo cambio por separado. Si oscurecés el logo o el texto, el QR los acompaña.'};
 if(request.region==='base'){
  if(luminance(colorRgb(request.color))<.7)return {message:'La base tiene que ser clara para que el QR del dorso tenga contraste: no la puedo poner en '+name+'. Probá con blanco, beige o gris claro.'};
  if(params.baseColor.toLowerCase()===request.color.toLowerCase())return {message:'La base ya está en '+name+'.'};
  return {patch:{baseColor:request.color},message:'Listo: la base queda en '+name+'.',note:'Base en '+name};
 }
 if(request.region==='texto'&&!hasLogoText(config))return {message:config.layers.some(l=>l.region)?'En este logo no encontré un texto separado del dibujo, así que no lo puedo pintar aparte. Podés cambiar cada color en «Colores del archivo».':'Este llavero se armó con una versión anterior que no separaba el texto del dibujo. Volvé a adjuntar el logo con el botón + y te dejo el texto como una parte aparte para pintarlo.'};
 // Without saying which part, painting the whole logo would be a guess: ask, unless it has a single color.
 if(!request.region&&keychainColors(config).length>1)return {message:'¿Qué parte querés en '+name+'? '+(hasLogoText(config)?'Decime «el nombre en '+name+'», «la marca en '+name+'» o «todo el logo en '+name+'».':'Decime «todo el logo en '+name+'» o tocá el color que quieras cambiar en «Colores del archivo».')};
 const region=request.region==='todo'?null:request.region,targets=config.layers.filter(l=>!region||(l.region||'marca')===region);
 if(targets.every(l=>l.color.toLowerCase()===request.color.toLowerCase()))return {message:capital(request.label)+' ya está en '+name+'.'+(request.seen&&request.seen!==name?' Si lo seguís viendo '+request.seen+', descargá el 3MF de nuevo: un archivo anterior todavía lo tiene en '+request.seen+'.':'')+partNote};
 const {config:next,merged}=recolorKeychain(config,{region,color:request.color});
 const before=keychainQrColor(config,params.baseColor),after=keychainQrColor(next,params.baseColor);
 let message='Listo: '+request.label+' queda en '+name+'.';
 if(merged)message+=' Para no pasar de los 4 filamentos del AMS, '+(merged.regions.length===1?'el '+colorName(merged.from)+' de '+regionWord[merged.regions[0]]:'el '+colorName(merged.from))+' pasa a '+colorName(merged.to)+'.';
 if(before!==after)message+=' El QR del dorso pasa a '+colorName(after)+', el color más oscuro, para que se lea bien.';
 message+=partNote+' Si querés otro tono, cambialo en «Colores del archivo».';
 return {patch:{keychain:next},message,note:(request.region==='texto'?'Texto':request.region==='marca'?'Marca':'Logo')+' en '+name};
}
// Remark after reading a logo: lettering that had to borrow another color to fit the AMS.
export function keychainLogoNotes(config){
 const borrowed=config.layers.find(l=>l.region==='texto'&&l.source&&l.source.toLowerCase()!==l.color.toLowerCase());
 return borrowed?'El texto del logo es '+colorName(borrowed.source)+' en el archivo, pero lo dejé en '+colorName(borrowed.color)+' para no pasar de 4 filamentos. Si lo querés en otro color, pedímelo («el nombre en negro»).':'';
}

export async function readKeychainLogo(source,name='Logo'){
 const image=source instanceof Blob?await createImageBitmap(source):await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('No se pudo leer el logo. Usá PNG o JPG.'));img.src=source;});
 try{
  // Crop transparent/white padding, then trace at about 512 px so outlines and small lettering come out smooth.
  const scan=document.createElement('canvas'),scanScale=Math.min(1024/image.width,1024/image.height,1);scan.width=Math.max(2,Math.round(image.width*scanScale));scan.height=Math.max(2,Math.round(image.height*scanScale));
  const scanCtx=scan.getContext('2d');scanCtx.drawImage(image,0,0,scan.width,scan.height);const pixels=scanCtx.getImageData(0,0,scan.width,scan.height).data;
  let minX=scan.width,minY=scan.height,maxX=-1,maxY=-1;
  for(let y=0;y<scan.height;y++)for(let x=0;x<scan.width;x++){const i=(y*scan.width+x)*4;if(pixels[i+3]>=128&&Math.min(pixels[i],pixels[i+1],pixels[i+2])<245){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
  if(maxX<minX)throw Error('No se detectó el logo. Usá un PNG transparente o un dibujo sobre fondo blanco.');
  // Keep the soft antialiased rim: it places the outline between pixels.
  minX=Math.max(0,minX-2);minY=Math.max(0,minY-2);maxX=Math.min(scan.width-1,maxX+2);maxY=Math.min(scan.height-1,maxY+2);
  const cropWidth=maxX-minX+1,cropHeight=maxY-minY+1,scale=Math.min(512/cropWidth,512/cropHeight,4),canvas=document.createElement('canvas');canvas.width=Math.max(2,Math.round(cropWidth*scale));canvas.height=Math.max(2,Math.round(cropHeight*scale));
  const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(scan,minX,minY,cropWidth,cropHeight,0,0,canvas.width,canvas.height);
  const config=traceColorLogo(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,name);
  return {config,preview:keychainLogoPreview(config)};
 }finally{image.close?.();}
}

export function keychainLogoPreview(config){
 validateKeychain(config);const preview=document.createElement('canvas');preview.width=config.width;preview.height=config.height;const ctx=preview.getContext('2d');
 for(const layer of config.layers){ctx.fillStyle=layer.color;ctx.beginPath();for(const polygon of layer.polygons){ctx.moveTo(...polygon[0]);for(const point of polygon.slice(1))ctx.lineTo(...point);ctx.closePath();}ctx.fill('evenodd');}
 return preview.toDataURL('image/png');
}

export function buildKeychain(api,p){
 const logo=validateKeychain(p.keychain),url=keychainUrl(p.qrText),{CrossSection:C,Manifold:M}=api,owned=[],own=x=>(owned.push(x),x);
 try{
  const w=p.width,h=p.height,t=p.thickness,r=p.relief,ring=p.hook==='ring',size2=n=>String(n).replace('.',',');
  if(p.shape!=='round')throw Error('El llavero con logo y QR usa una base rectangular redondeada.');
  if(w<25||h<25||t<1.6)throw Error('El llavero con logo y QR necesita al menos 25 × 25 mm y 1,6 mm de espesor.');
  if(luminance(colorRgb(p.baseColor))<.7)throw Error('El QR del dorso necesita una base clara para mantener el contraste.');
  const contour=[],cr=Math.min(5,w/5,h/5);
  for(const [cx,cy,start] of [[w/2-cr,h/2-cr,0],[-w/2+cr,h/2-cr,90],[-w/2+cr,-h/2+cr,180],[w/2-cr,-h/2+cr,270]])for(let i=0;i<=16;i++){const a=(start+i*90/16)*Math.PI/180;contour.push([cx+cr*Math.cos(a),cy+cr*Math.sin(a)]);}
  // Hook: a hole drilled inside the plate, or a ring (argolla) with its own rim above the plate,
  // which leaves the whole plate free for the logo and the QR.
  const ringRim=2,ringY=h/2+p.hole/2+.4,ringR=p.hole/2+ringRim;
  const outline=own(new C([contour],'EvenOdd')),ringDisc=ring?own(own(C.circle(ringR,64)).translate([0,ringY])):null;
  const hole=own(own(C.circle(p.hole/2,48)).translate([0,ring?ringY:h/2-p.hole/2-2.5])),footprint=ring?own(C.union(outline,ringDisc)):outline,base2=own(footprint.subtract(hole));
  // Light area of the back that is free for the QR: the whole plate, or the plate below the hole.
  const freeTop=ring?h/2:h/2-p.hole-2.5,freeSide=Math.min(w,freeTop+h/2);
  // The QR fills that area leaving at least 2 mm (and 2 modules) of light border all around.
  const matrix=QRCode.create(url,{errorCorrectionLevel:'M'}).modules,n=matrix.size,module=Math.min(freeSide/(n+4),(freeSide-4)/n),qrSide=n*module,quiet=(freeSide-qrSide)/2,qrY=(freeTop-h/2)/2;
  if(module<.8)throw Error(`Ese enlace deja el QR demasiado fino en ${size2(w)} × ${size2(h)} mm${ring?'':' con el agujero adentro'}. Acortá el enlace, agrandá el llavero${ring?'':' o pasá el enganche a una argolla arriba'}.`);
  const qrPolygons=[];
  for(let row=0;row<n;row++)for(let col=0;col<n;col++)if(matrix.get(row,col)){
   // Mirror X so the underside, viewed from outside, reads in its normal orientation.
   const x=qrSide/2-(col+1)*module,y=qrY+qrSide/2-(row+1)*module;
   qrPolygons.push([[x,y],[x+module,y],[x+module,y+module],[x,y+module]]);
  }
  const back=own(new C(qrPolygons,'NonZero'));
  if(back.area()-own(back.intersect(base2)).area()>.01)throw Error('El QR invade el borde o el agujero. Aumentá la base.');
  // The logo fills the front inside a margin that grows with the plate (2.5 to 5 mm), below the hole if it is inside.
  const margin=Math.min(5,Math.max(2.5,Math.min(w,h)*.09)),logoTop=ring?h/2-margin:h/2-p.hole-2.5-1.2,logoBottom=-h/2+margin;
  if(logoTop-logoBottom<8)throw Error('El logo no entra debajo del agujero. Agrandá el llavero o pasá el enganche a una argolla arriba.');
  const logoScale=Math.min((w-2*margin)/logo.width,(logoTop-logoBottom)/logo.height),logoY=(logoTop+logoBottom)/2;
  // The QR takes the darkest logo color; when it lacks contrast, that color becomes a purple-black everywhere.
  const darkest=logo.layers.reduce((a,b)=>luminance(colorRgb(a.color))<luminance(colorRgb(b.color))?a:b).color.toLowerCase(),qrColor=keychainQrColor(logo,p.baseColor),paint=c=>c.toLowerCase()===darkest?qrColor:c.toLowerCase();
  const groups=new Map();let taken=null;
  for(const layer of logo.layers){
   const polygons=layer.polygons.map(poly=>poly.map(([x,y])=>[(x-logo.width/2)*logoScale,(logo.height/2-y)*logoScale+logoY]));
   let cross=own(new C(polygons,'EvenOdd'));
   if(cross.area()-own(cross.intersect(base2)).area()>.01)throw Error('El logo invade el borde. Aumentá el tamaño.');
   // Neighbouring colors share an outline: each layer keeps only what earlier ones left free, so parts never overlap.
   if(taken)cross=own(cross.subtract(taken));
   if(cross.area()<1e-3)continue;
   taken=taken?own(C.union(taken,cross)):cross;
   const region=layer.region||'marca',color=paint(layer.color),key=region+color,group=groups.get(key);
   groups.set(key,{region,color,layerColor:layer.color.toLowerCase(),cross:group?own(C.union(group.cross,cross)):cross});
  }
  if(!groups.size)throw Error('El logo no tiene contornos imprimibles a este tamaño.');
  const logoParts=[...groups.values()].map(g=>({...g,solid:own(own(g.cross.extrude(r)).translate([0,0,t]))}));
  const inset=own(back.extrude(.6));
  // Convex outer shell: small lower chamfer and 0.4 mm upper bevel, then drill the ring hole.
  // The QR stays flush on z=0 and the full width is retained around the middle.
  // The ring gets its own convex shell, so only the ring and its rim stand above the plate.
  const bevelled=shape=>{
   const lower=own(own(own(shape.offset(-.2)).extrude(.001)).translate([0,0,0]));
   const middle=own(own(shape.extrude(t-.6)).translate([0,0,.2]));
   const upper=own(own(own(shape.offset(-.4)).extrude(.001)).translate([0,0,t-.001]));
   return own(M.hull([lower,middle,upper]));
  };
  const shell=ring?own(M.union([bevelled(outline),bevelled(ringDisc)])):bevelled(outline);
  const bore=own(own(hole.extrude(t+2)).translate([0,0,-1]));
  const base=own(own(shell.subtract(bore)).subtract(inset)),all=own(M.union([base,...logoParts.map(g=>g.solid),inset]));
  if(all.status()!=='NoError'||all.isEmpty())throw Error('No se pudo cerrar el llavero. Revisá el logo.');
  const mesh=solid=>{const m=solid.getMesh();return {numProp:m.numProp,positions:new Float32Array(m.vertProperties),triangles:new Uint32Array(m.triVerts)};};
  const named=g=>(g.region==='texto'?'Texto del logo':'Logo')+' · '+colorName(g.color);
  const parts=[{mesh:mesh(base),color:p.baseColor,name:'Base clara'},...logoParts.map(g=>({mesh:mesh(g.solid),color:g.color,name:named(g),region:g.region,layerColor:g.layerColor})),{mesh:mesh(inset),color:qrColor,name:'QR del dorso · '+colorName(qrColor),region:'qr'}];
  const colors=new Set(parts.map(x=>x.color.toLowerCase()));
  if(colors.size>4)throw Error('El llavero usa '+colors.size+' colores; el AMS admite hasta 4. Uní dos colores del logo en «Colores del archivo».');
  return {params:{...p,qrText:url},base:parts[0].mesh,detail:{numProp:3,positions:new Float32Array(),triangles:new Uint32Array()},parts,combined:mesh(all),volume:all.volume(),dimensions:[w,ring?ringY+ringR+h/2:h,t+r],totalHeight:t+r,backArea:back.area(),warnings:[`QR en el dorso: módulos de ${module.toFixed(2)} mm y ${quiet.toFixed(1).replace('.',',')} mm de borde libre. Escaneá una primera impresión antes de entregar.`,`Logo adaptado a ${colors.size-1} colores sólidos, sin regenerarlo con IA. Los degradados se simplifican para imprimir con hasta 4 filamentos.`,'Dorso plano con QR de color al ras; asigná los filamentos del 3MF en Bambu Studio.',...(ring?[`Argolla arriba de ${size2(p.hole)} mm de agujero con ${ringRim} mm de reborde: la pieza mide ${size2(+(ringY+ringR+h/2).toFixed(1))} mm de alto con la argolla.`]:[]),...(t<2.2?[`Con ${size2(t)} mm de espesor queda fino y algo flexible: imprimilo con 3 o más paredes.`]:[])],logo:{scale:logoScale,offsetY:logoY},qr:{matrix,size:qrSide+2*quiet,module,quietZone:quiet/module,face:'back',offsetY:qrY,color:qrColor}};
 }finally{for(const item of owned.reverse())item.delete();}
}

// Pedido de llavero con logo adelante y QR atrás: se arma directo, sin generar imágenes.
export const isTwoSidedKeychain=prompt=>/llaver|chapita|tarjeta|frente|dorso|atr[aá]s/i.test(prompt)&&/\bqr\b|c[oó]digo/i.test(prompt)&&/logo|marca/i.test(prompt);
