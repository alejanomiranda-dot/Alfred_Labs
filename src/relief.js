import {validateGeneration} from './generation-spec.js';

// A height field with a flat back and manifold sides. Every boundary vertex is
// shared by top, side and back; no open edges, floating pixels or zero thickness.
// Altura de cada píxel: cuánto se diferencia del fondo (tomado de los bordes de la imagen).
// Así un dibujo oscuro sobre blanco o claro sobre negro sube igual, y el relleno transparente queda a nivel del fondo.
export function heightField(rgba,columns,rows,{invert=false,levels=0}={}){
 const lum=new Float32Array(columns*rows),alpha=new Float32Array(columns*rows);
 for(let p=0;p<lum.length;p++){const i=p*4;alpha[p]=rgba[i+3]/255;lum[p]=(.2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2])/255;}
 const ring=[];for(let x=0;x<columns;x++)for(const y of [0,rows-1]){const p=y*columns+x;if(alpha[p]>.5)ring.push(lum[p]);}
 for(let y=1;y<rows-1;y++)for(const x of [0,columns-1]){const p=y*columns+x;if(alpha[p]>.5)ring.push(lum[p]);}
 ring.sort((a,b)=>a-b);const background=ring.length?ring[Math.floor(ring.length/2)]:0;
 const raw=new Float32Array(lum.length);for(let p=0;p<lum.length;p++)raw[p]=alpha[p]<.5?0:Math.abs(lum[p]-background);
 const sorted=Float32Array.from(raw).sort(),top=Math.max(.08,sorted[Math.floor(sorted.length*.995)]);
 const h=new Float32Array(lum.length);
 for(let p=0;p<lum.length;p++){let v=Math.min(1,raw[p]/top);if(v<.08)v=0;if(invert)v=alpha[p]<.5?0:1-v;h[p]=v;}
 // La imagen define la silueta; la altura se arma acá: mesetas con bordes redondeados y un detalle interno suave.
 // Así el sombreado de una ilustración no se convierte en rugosidad, y las líneas oscuras finas quedan como surcos.
 const mask=h.map(v=>v>.25?1:0),radius=Math.max(1,Math.round(Math.min(columns,rows)/45));
 const pillow=boxBlur(boxBlur(mask,columns,rows,radius),columns,rows,radius),detail=boxBlur(h,columns,rows,1);
 const out=new Float32Array(lum.length);
 const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
 for(let p=0;p<lum.length;p++){
  // El borde baja con un bisel suave (sin escalera de píxeles); el interior suma un detalle leve.
  const v=.8*smooth(.12,.7,pillow[p])+.2*detail[p]*smooth(.3,.7,pillow[p]);
  out[p]=v<.02?0:levels?Math.round(v*levels)/levels:v;
 }
 return out;
}
function boxBlur(src,columns,rows,r){
 const tmp=new Float32Array(src.length),out=new Float32Array(src.length);
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){let s=0,n=0;for(let k=-r;k<=r;k++){const xx=x+k;if(xx>=0&&xx<columns){s+=src[y*columns+xx];n++;}}tmp[y*columns+x]=s/n;}
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){let s=0,n=0;for(let k=-r;k<=r;k++){const yy=y+k;if(yy>=0&&yy<rows){s+=tmp[yy*columns+x];n++;}}out[y*columns+x]=s/n;}
 return out;
}
export function reliefMesh(rgba,columns,rows,raw,{invert=false}={}){
 const spec=validateGeneration(raw);
 if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<2||rows<2||columns>384||rows>384||rgba.length!==columns*rows*4)throw Error('Imagen de relieve inválida.');
 const vertices=[],triangles=[],heights=heightField(rgba,columns,rows,{invert});
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
  const light=heights[(rows-1-y)*columns+x];
  vertices.push((x/(columns-1)-.5)*spec.width,(y/(rows-1)-.5)*spec.height,spec.baseThickness+light*spec.depth);
 }
 for(let y=0;y<rows-1;y++)for(let x=0;x<columns-1;x++){const a=y*columns+x,b=a+1,c=a+columns,d=c+1;triangles.push(a,b,d,a,d,c);}
 const edge=[];for(let x=0;x<columns;x++)edge.push(x);for(let y=1;y<rows;y++)edge.push(y*columns+columns-1);for(let x=columns-2;x>=0;x--)edge.push((rows-1)*columns+x);for(let y=rows-2;y>0;y--)edge.push(y*columns);
 const bottom=edge.map(top=>{const index=vertices.length/3;vertices.push(vertices[top*3],vertices[top*3+1],0);return index;});
 const center=vertices.length/3;vertices.push(0,0,0);
 edge.forEach((top,i)=>{const next=(i+1)%edge.length;triangles.push(top,bottom[i],bottom[next],top,bottom[next],edge[next],center,bottom[next],bottom[i]);});
 return {name:spec.subject.slice(0,100)+' · relieve',vertices,triangles};
}

export async function reliefFromImage(imageDataUrl,spec,{invert=false}={}){
 if(typeof imageDataUrl!=='string'||imageDataUrl.length>6000000||!/^data:image\/(png|jpeg|webp);base64,/.test(imageDataUrl))throw Error('La referencia del relieve no es una imagen válida.');
 const image=new Image();image.src=imageDataUrl;await image.decode();
 const max=256,ratio=spec.width/spec.height,columns=Math.max(16,Math.round(max*Math.min(1,ratio))),rows=Math.max(16,Math.round(max/Math.max(1,ratio)));
 const canvas=document.createElement('canvas');canvas.width=columns;canvas.height=rows;const context=canvas.getContext('2d',{willReadFrequently:true});
 context.clearRect(0,0,columns,rows);
 // Preserve the reference's proportions with padding, rather than stretching it.
 const scale=Math.min(spec.width/image.width,spec.height/image.height),w=image.width*scale/spec.width*columns,h=image.height*scale/spec.height*rows;
 // Un suavizado leve antes de muestrear evita bordes dentados y paredes finas al imprimir.
 context.filter='blur('+Math.max(.6,Math.min(columns,rows)/180)+'px)';
 context.drawImage(image,(columns-w)/2,(rows-h)/2,w,h);
 context.filter='none';
 const pixels=context.getImageData(0,0,columns,rows);
 return reliefMesh(pixels.data,columns,rows,spec,{invert});
}

export function generatedParams(base,mesh,spec){
 return {...base,kind:'free',project:spec.subject.slice(0,60),importedMesh:mesh,freeDesign:{version:1,nodes:[{type:'imported',position:[0,0,0],rotation:[0,0,0]}]},printRotation:[0,0,0],sourceInfo:{...spec},forge:null};
}
