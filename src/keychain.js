import QRCode from 'qrcode';
import {traceBitmap} from './trace.js';

export function keychainUrl(value){
 let url;try{url=new URL(value.trim());}catch{throw Error('Escribí un enlace completo, por ejemplo https://tumutual.com.');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.href.length>180)throw Error('Usá un enlace web público de hasta 180 caracteres, sin contraseñas.');
 return url.href;
}
export function validateKeychain(raw){
 if(!raw||raw.version!==1||typeof raw.name!=='string'||raw.name.length>120||!Number.isInteger(raw.width)||!Number.isInteger(raw.height)||raw.width<2||raw.height<2||raw.width>256||raw.height>256||!Array.isArray(raw.layers)||!raw.layers.length||raw.layers.length>3)throw Error('El logo del llavero no es válido. Volvé a cargarlo.');
 let count=0;
 for(const layer of raw.layers){
  if(!/^#[a-f\d]{6}$/i.test(layer.color)||!Array.isArray(layer.polygons)||!layer.polygons.length||layer.polygons.length>500)throw Error('Los colores o contornos del logo no son válidos.');
  for(const polygon of layer.polygons){if(!Array.isArray(polygon)||polygon.length<3)throw Error('Contorno de logo inválido.');for(const point of polygon){if(!Array.isArray(point)||point.length!==2||!point.every((v,i)=>Number.isFinite(v)&&v>=0&&v<=(i?raw.height:raw.width)))throw Error('Coordenadas de logo inválidas.');count++;}}
 }
 if(count>20000)throw Error('El logo tiene demasiados detalles para este llavero.');
 return raw;
}
const luminance=rgb=>rgb.reduce((sum,c,i)=>sum+[.2126,.7152,.0722][i]*(c/255<=.04045?c/255/12.92:((c/255+.055)/1.055)**2.4),0);
const colorRgb=color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
const hex=rgb=>'#'+rgb.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const distance=(a,b)=>a.reduce((sum,v,i)=>sum+(v-b[i])**2,0);

// Reduce an existing logo to printable color regions; no generated interpretation.
export function traceColorLogo(rgba,width,height,name='Logo'){
 if(width<2||height<2||width>224||height>224||rgba.length!==width*height*4)throw Error('El logo debe prepararse a una resolución de hasta 224 px.');
 const pixels=[],mask=new Int16Array(width*height).fill(-1);
 for(let i=0;i<mask.length;i++){const rgb=Array.from(rgba.slice(i*4,i*4+3));if(rgba[i*4+3]>=128&&Math.min(...rgb)<245)pixels.push({index:i,rgb});}
 if(pixels.length<8)throw Error('No se detectó el logo. Usá un PNG transparente o un dibujo sobre fondo blanco.');
 let minX=width,minY=height,maxX=0,maxY=0;
 for(const p of pixels){minX=Math.min(minX,p.index%width);maxX=Math.max(maxX,p.index%width);minY=Math.min(minY,Math.floor(p.index/width));maxY=Math.max(maxY,Math.floor(p.index/width));}
 const centers=[pixels.reduce((a,b)=>luminance(a.rgb)<luminance(b.rgb)?a:b).rgb.slice()];
 while(centers.length<3){const next=pixels.reduce((a,b)=>Math.min(...centers.map(c=>distance(b.rgb,c)))>Math.min(...centers.map(c=>distance(a.rgb,c)))?b:a);if(Math.min(...centers.map(c=>distance(next.rgb,c)))<400)break;centers.push(next.rgb.slice());}
 for(let iteration=0;iteration<8;iteration++){
  const sums=centers.map(()=>[0,0,0,0]);
  for(const p of pixels){let chosen=0;for(let j=1;j<centers.length;j++)if(distance(p.rgb,centers[j])<distance(p.rgb,centers[chosen]))chosen=j;mask[p.index]=chosen;for(let k=0;k<3;k++)sums[chosen][k]+=p.rgb[k];sums[chosen][3]++;}
  for(let j=0;j<centers.length;j++)if(sums[j][3])centers[j]=sums[j].slice(0,3).map(v=>v/sums[j][3]);
 }
 const cropW=maxX-minX+1,cropH=maxY-minY+1,layers=[];
 for(let j=0;j<centers.length;j++){
  const margin=Math.ceil(Math.max(cropW,cropH)*.025)+1,paddedW=cropW+2*margin,paddedH=cropH+2*margin,binary=new Uint8ClampedArray(paddedW*paddedH*4);binary.fill(255);
  for(let y=0;y<cropH;y++)for(let x=0;x<cropW;x++)if(mask[(y+minY)*width+x+minX]===j){const i=((y+margin)*paddedW+x+margin)*4;binary[i]=binary[i+1]=binary[i+2]=0;}
  try{const {polygons}=traceBitmap(binary,paddedW,paddedH,128);layers.push({color:hex(centers[j]),polygons:polygons.map(poly=>poly.map(([x,y])=>[x-margin,y-margin]))});}catch(error){if(!/No se detectó|demasiado pequeño/.test(error.message))throw error;}
 }
 if(!layers.length)throw Error('El logo no tiene contornos imprimibles a este tamaño.');
 return validateKeychain({version:1,name:name.slice(0,120),width:cropW,height:cropH,layers});
}

export async function readKeychainLogo(source,name='Logo'){
 const image=source instanceof Blob?await createImageBitmap(source):await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('No se pudo leer el logo. Usá PNG o JPG.'));img.src=source;});
 try{
  // Crop transparent/white padding before downsampling so small lettering keeps useful detail.
  const scan=document.createElement('canvas'),scanScale=Math.min(1024/image.width,1024/image.height,1);scan.width=Math.max(2,Math.round(image.width*scanScale));scan.height=Math.max(2,Math.round(image.height*scanScale));
  const scanCtx=scan.getContext('2d');scanCtx.drawImage(image,0,0,scan.width,scan.height);const pixels=scanCtx.getImageData(0,0,scan.width,scan.height).data;
  let minX=scan.width,minY=scan.height,maxX=-1,maxY=-1;
  for(let y=0;y<scan.height;y++)for(let x=0;x<scan.width;x++){const i=(y*scan.width+x)*4;if(pixels[i+3]>=128&&Math.min(pixels[i],pixels[i+1],pixels[i+2])<245){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
  if(maxX<minX)throw Error('No se detectó el logo. Usá un PNG transparente o un dibujo sobre fondo blanco.');
  const cropWidth=maxX-minX+1,cropHeight=maxY-minY+1,scale=Math.min(224/cropWidth,224/cropHeight,1),canvas=document.createElement('canvas');canvas.width=Math.max(2,Math.round(cropWidth*scale));canvas.height=Math.max(2,Math.round(cropHeight*scale));
  const ctx=canvas.getContext('2d');ctx.drawImage(scan,minX,minY,cropWidth,cropHeight,0,0,canvas.width,canvas.height);
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
  const w=p.width,h=p.height,t=p.thickness,r=p.relief;
  if(w<45||h<50||p.shape!=='round'||t<2.4)throw Error('Para logo y QR usá una base rectangular redondeada de al menos 45 × 50 mm y 2,4 mm de espesor.');
  if(luminance(colorRgb(p.baseColor))<.7)throw Error('El QR del dorso necesita una base clara para mantener el contraste.');
  const contour=[],cr=5;
  for(const [cx,cy,start] of [[w/2-cr,h/2-cr,0],[-w/2+cr,h/2-cr,90],[-w/2+cr,-h/2+cr,180],[w/2-cr,-h/2+cr,270]])for(let i=0;i<=16;i++){const a=(start+i*90/16)*Math.PI/180;contour.push([cx+cr*Math.cos(a),cy+cr*Math.sin(a)]);}
  const outline=own(new C([contour],'EvenOdd')),hole=own(own(C.circle(p.hole/2,48)).translate([0,h/2-p.hole/2-2.5])),base2=own(outline.subtract(hole));
  const matrix=QRCode.create(url,{errorCorrectionLevel:'M'}).modules,size=Math.min(w-8,h-18),module=size/(matrix.size+8);
  if(module<.8)throw Error('Ese enlace deja el QR demasiado fino. Acortá el enlace o aumentá el tamaño del llavero.');
  const qrPolygons=[];
  for(let row=0;row<matrix.size;row++)for(let col=0;col<matrix.size;col++)if(matrix.get(row,col)){
   // Mirror X so the underside, viewed from outside, reads in its normal orientation.
   const x=size/2-(col+5)*module,y=size/2-(row+5)*module-3;
   qrPolygons.push([[x,y],[x+module,y],[x+module,y+module],[x,y+module]]);
  }
  const back=own(new C(qrPolygons,'NonZero'));
  if(back.area()-own(back.intersect(base2)).area()>.01)throw Error('El QR invade el borde o el agujero. Aumentá la base.');
  const byColor=new Map(),logoScale=Math.min((w-10)/logo.width,(h-15)/logo.height),maxLogoY=logo.height*logoScale/2-3;
  if(maxLogoY>h/2-p.hole-3)throw Error('El logo invade el agujero del llavero.');
  for(const layer of logo.layers){
   const polygons=layer.polygons.map(poly=>poly.map(([x,y])=>[(x-logo.width/2)*logoScale,(logo.height/2-y)*logoScale-3]));
   const cross=own(new C(polygons,'EvenOdd'));
   if(cross.area()-own(cross.intersect(base2)).area()>.01)throw Error('El logo invade el borde. Aumentá el tamaño.');
   const solid=own(own(cross.extrude(r)).translate([0,0,t]));
   byColor.set(layer.color,byColor.has(layer.color)?own(M.union([byColor.get(layer.color),solid])):solid);
  }
  const darkest=logo.layers.reduce((a,b)=>luminance(colorRgb(a.color))<luminance(colorRgb(b.color))?a:b).color;
  let qrColor=darkest;
  // Reuse a sufficiently dark logo color; otherwise consolidate the darkest into purple-black.
  if((luminance(colorRgb(p.baseColor))+.05)/(luminance(colorRgb(darkest))+.05)<4.5){qrColor='#30213d';const solid=byColor.get(darkest);byColor.delete(darkest);byColor.set(qrColor,byColor.has(qrColor)?own(M.union([byColor.get(qrColor),solid])):solid);}
  const inset=own(back.extrude(.6));byColor.set(qrColor,byColor.has(qrColor)?own(M.union([byColor.get(qrColor),inset])):inset);
  const base=own(own(base2.extrude(t)).subtract(inset)),all=own(M.union([base,...byColor.values()]));
  if(all.status()!=='NoError'||all.isEmpty())throw Error('No se pudo cerrar el llavero. Revisá el logo.');
  const mesh=solid=>{const m=solid.getMesh();return {numProp:m.numProp,positions:new Float32Array(m.vertProperties),triangles:new Uint32Array(m.triVerts)};};
  const parts=[{mesh:mesh(base),color:p.baseColor,name:'Base clara'},...[...byColor].map(([color,solid])=>({mesh:mesh(solid),color,name:color===qrColor?'Logo y QR del dorso':'Logo del frente'}))];
  return {params:{...p,qrText:url},base:parts[0].mesh,detail:{numProp:3,positions:new Float32Array(),triangles:new Uint32Array()},parts,combined:mesh(all),volume:all.volume(),dimensions:[w,h,t+r],totalHeight:t+r,backArea:back.area(),warnings:[`QR en el dorso: módulos de ${module.toFixed(2)} mm y margen libre de 4 módulos. Escaneá una primera impresión antes de entregar.`,`Logo adaptado a ${logo.layers.length} colores sólidos, sin regenerarlo con IA. Los degradados se simplifican para imprimir con hasta 4 filamentos.`,'Dorso plano con QR de color al ras; asigná los filamentos del 3MF en Bambu Studio.'],qr:{matrix,size,module,quietZone:4,face:'back',offsetY:-3,color:qrColor}};
 }finally{for(const item of owned.reverse())item.delete();}
}
