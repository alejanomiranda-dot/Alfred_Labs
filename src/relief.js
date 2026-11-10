import {validateGeneration} from './generation-spec.js';
import {traceBitmap} from './trace.js';

// A height field with a flat back and manifold sides. Every boundary vertex is
// shared by top, side and back; no open edges, floating pixels or zero thickness.
// Altura de cada píxel: cuánto se diferencia del fondo (tomado de los bordes de la imagen).
// Así un dibujo oscuro sobre blanco o claro sobre negro sube igual, y el relleno transparente queda a nivel del fondo.
export function heightField(rgba,columns,rows,{invert=false,levels=0,labels=null}={}){
 if(labels)return colorHeights(labels,columns,rows);
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
// Relieve en colores: cada píxel toma el color más cercano de la paleta (0 = placa). Las zonas del motivo
// suben como una meseta de borde corto, para que los límites entre colores queden sobre una superficie plana.
const rgbOf=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
function colorDistance(r,g,b,c){const mean=(r+c[0])/2,dr=r-c[0],dg=g-c[1],db=b-c[2];return (2+mean/256)*dr*dr+4*dg*dg+(2+(255-mean)/256)*db*db;}
export function paletteLabels(rgba,columns,rows,palette){
 const colors=palette.map(rgbOf);let labels=new Uint8Array(columns*rows);
 for(let p=0;p<labels.length;p++){
  const i=p*4;if(rgba[i+3]<128)continue;
  let best=0,distance=Infinity;
  for(let k=0;k<colors.length;k++){const d=colorDistance(rgba[i],rgba[i+1],rgba[i+2],colors[k]);if(d<distance){distance=d;best=k;}}
  labels[p]=best;
 }
 // Dos pasadas de mayoría 3 × 3 borran píxeles sueltos y los halos de los bordes.
 for(let pass=0;pass<2;pass++)labels=majority(labels,columns,rows,colors.length,1);
 return labels;
}
function majority(labels,columns,rows,count,r){
 const out=new Uint8Array(labels.length),votes=new Uint16Array(count);
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
  votes.fill(0);
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<columns&&yy<rows)votes[labels[yy*columns+xx]]++;}
  const own=labels[y*columns+x];let best=own;for(let k=0;k<count;k++)if(votes[k]>votes[best])best=k;
  out[y*columns+x]=best;
 }
 return out;
}
function colorHeights(labels,columns,rows){
 const mask=Float32Array.from(labels,v=>v?1:0),soft=boxBlur(mask,columns,rows,1),out=new Float32Array(labels.length);
 for(let p=0;p<out.length;p++){const t=Math.max(0,Math.min(1,(soft[p]-.2)/.6)),v=t*t*(3-2*t);out[p]=v<.02?0:v;}
 return out;
}
// Contornos de cada color en milímetros, con el mismo encuadre que la malla del relieve.
export function colorLayers(labels,columns,rows,spec){
 const layers=[],warnings=[];
 const toMm=([cx,cy])=>[Math.round(((cx-.5)/(columns-1)-.5)*spec.width*1e3)/1e3,Math.round(((rows-1-(cy-.5))/(rows-1)-.5)*spec.height*1e3)/1e3];
 for(let k=1;k<spec.palette.length;k++){
  let current=labels,polygons=null;
  for(let attempt=0;attempt<3&&!polygons;attempt++){
   const binary=new Uint8ClampedArray(columns*rows*4).fill(255);
   for(let p=0;p<current.length;p++)if(current[p]===k){binary[p*4]=binary[p*4+1]=binary[p*4+2]=0;}
   try{polygons=traceBitmap(binary,columns,rows,128).polygons;}
   catch(error){
    if(/No se detectó|demasiado pequeño/.test(error.message))break;
    // Demasiados contornos: se simplifica más esa imagen y se vuelve a intentar.
    current=majority(current,columns,rows,spec.palette.length,attempt+1);
   }
  }
  // Los puntos medios de cada lado convierten la escalera de píxeles en diagonales: sin serrucho en los bordes.
  if(polygons)layers.push({color:spec.palette[k],polygons:polygons.map(poly=>poly.map((p,i)=>{const q=poly[(i+1)%poly.length];return toMm([(p[0]+q[0])/2,(p[1]+q[1])/2]);}))});
  else warnings.push(spec.palette[k]);
 }
 return {layers,missing:warnings};
}
// Litofanía: las zonas oscuras de la foto se vuelven más gruesas (dejan pasar menos luz) y las claras más finas,
// conservando los tonos continuos de la fotografía sin convertirla en una meseta plana.
export function lithophaneHeights(rgba,columns,rows,{invert=false}={}){
 const lum=new Float32Array(columns*rows),alpha=new Float32Array(columns*rows),samples=[];
 for(let p=0;p<lum.length;p++){
  const i=p*4;alpha[p]=rgba[i+3]/255;
  lum[p]=(.2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2])/255;
  if(alpha[p]>=.5)samples.push(lum[p]);
 }
 samples.sort((a,b)=>a-b);
 const lo=samples.length?samples[Math.floor(samples.length*.02)]:0;
 const hi=samples.length?samples[Math.floor(samples.length*.98)]:1;
 const span=Math.max(.08,hi-lo),raw=new Float32Array(lum.length);
 for(let p=0;p<lum.length;p++){
  if(alpha[p]<.5){raw[p]=0;continue;}
  const norm=Math.max(0,Math.min(1,(lum[p]-lo)/span));
  raw[p]=Math.pow(invert?norm:1-norm,.9);
 }
 const fine=boxBlur(raw,columns,rows,1),soft=boxBlur(raw,columns,rows,2),out=new Float32Array(lum.length);
 for(let p=0;p<lum.length;p++)out[p]=alpha[p]<.5?0:Math.max(0,Math.min(1,.72*fine[p]+.28*soft[p]));
 return out;
}
function activeBounds(rgba,columns,rows){
 let x0=columns,x1=-1,y0=rows,y1=-1;
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)if(rgba[(y*columns+x)*4+3]>=128){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
 if(x1<=x0||y1<=y0){x0=0;x1=columns-1;y0=0;y1=rows-1;}
 return {x0,x1,y0,y1,pw:Math.max(1,x1-x0),ph:Math.max(1,y1-y0)};
}
function bilinearSampler(heights,columns,rows,{x0,y0,pw,ph}){
 return (u,v)=>{
  const fx=x0+Math.max(0,Math.min(1,u))*pw,fy=y0+(1-Math.max(0,Math.min(1,v)))*ph;
  const ix=Math.min(columns-2,Math.max(0,Math.floor(fx))),iy=Math.min(rows-2,Math.max(0,Math.floor(fy))),tx=fx-ix,ty=fy-iy;
  const a=heights[iy*columns+ix],b=heights[iy*columns+ix+1],c=heights[(iy+1)*columns+ix],d=heights[(iy+1)*columns+ix+1];
  return (a*(1-tx)+b*tx)*(1-ty)+(c*(1-tx)+d*tx)*ty;
 };
}
// Esfera hueca en litofanía (bola de Navidad / adorno luminoso): malla cerrada de polo exterior a polo interior,
// con apoyo plano en z=0 y abertura circular inferior (spec.hole) hacia la cavidad interna lisa.
function sphericalLithophaneMesh(rgba,columns,rows,spec,{invert=false}={}){
 const heights=lithophaneHeights(rgba,columns,rows,{invert}),bounds=activeBounds(rgba,columns,rows);
 const aspect=Math.max(.5,Math.min(3.4,bounds.pw/bounds.ph)),sample=bilinearSampler(heights,columns,rows,bounds);
 const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
 const R=spec.width/2,tMin=Math.min(spec.baseThickness,R*.2),depth=Math.min(spec.depth,R*.25);
 const rHole=Math.min(Math.max(2,(spec.hole||8)/2),R*.42),rFlat=Math.max(rHole+4.5,Math.min(R*.38,R-tMin-depth-2));
 const zc=Math.sqrt(Math.max(1,R*R-rFlat*rFlat)),phiBot=-Math.acos(Math.min(.98,rFlat/R)),zTop=zc+R;
 const S=R-tMin-depth,delta=Math.max(.6,(1.6+S-zc)/2),zcIn=zc+delta,rIn=Math.max(rHole+1.5,S-delta);
 const phiInStart=-Math.acos(Math.min(.98,rHole/rIn)),zThroat=Math.max(1.2,zcIn+rIn*Math.sin(phiInStart));
 const phiWinMin=Math.max(phiBot+.18,-.92),phiWinMax=.96,halfTheta=Math.min(Math.PI*.92,Math.max(.85,(phiWinMax-phiWinMin)/2*aspect));
 const M=Math.max(48,Math.min(200,Math.round(Math.max(columns,rows)*.85)));
 const nOut=Math.max(32,Math.min(124,Math.round(Math.max(columns,rows)*.5))),nIn=24;
 const vertices=[0,0,zTop],triangles=[];
 for(let k=1;k<=nOut;k++){
  const t=k/nOut,phi=Math.PI/2-t*(Math.PI/2-phiBot),cp=Math.cos(phi),sp=Math.sin(phi);
  const v=(phi-phiWinMin)/(phiWinMax-phiWinMin),by=k===nOut?0:smooth(0,.07,v)*smooth(0,.07,1-v);
  for(let j=0;j<M;j++){
   const th=-Math.PI+2*Math.PI*j/M,dth=Math.atan2(Math.sin(th+Math.PI/2),Math.cos(th+Math.PI/2));
   const u=dth/(2*halfTheta)+.5,bx=by>0?smooth(0,.07,u)*smooth(0,.07,1-u):0,blend=bx*by;
   const r=blend>0?R-blend*(1-sample(u,v))*depth:R;
   if(k===nOut)vertices.push(rFlat*Math.cos(th),rFlat*Math.sin(th),0);
   else vertices.push(r*cp*Math.cos(th),r*cp*Math.sin(th),Math.max(.05,zc+r*sp));
  }
 }
 for(const z of [0,zThroat])for(let j=0;j<M;j++){const th=-Math.PI+2*Math.PI*j/M;vertices.push(rHole*Math.cos(th),rHole*Math.sin(th),z);}
 for(let m=1;m<nIn;m++){
  const phi=phiInStart+(m/nIn)*(Math.PI/2-phiInStart),rho=rIn*Math.cos(phi),z=zcIn+rIn*Math.sin(phi);
  for(let j=0;j<M;j++){const th=-Math.PI+2*Math.PI*j/M;vertices.push(rho*Math.cos(th),rho*Math.sin(th),z);}
 }
 const poleIn=vertices.length/3;vertices.push(0,0,zcIn+rIn);
 const rings=nOut+1+nIn;
 for(let j=0;j<M;j++){const j1=(j+1)%M;triangles.push(0,1+j,1+j1);}
 for(let r=0;r<rings-1;r++){
  const a0=1+r*M,b0=a0+M;
  for(let j=0;j<M;j++){const j1=(j+1)%M;triangles.push(a0+j,b0+j,b0+j1,a0+j,b0+j1,a0+j1);}
 }
 const last=1+(rings-1)*M;
 for(let j=0;j<M;j++){const j1=(j+1)%M;triangles.push(last+j,poleIn,last+j1);}
 return {name:(spec.subject.slice(0,95)+' · litofanía esférica').slice(0,120),vertices,triangles};
}
// Litofanía curva autoportante (arco de 60° apoyado verticalmente en z=0): se mantiene parada sola en una mesa o repisa.
function curvedLithophaneMesh(rgba,columns,rows,spec,{invert=false}={}){
 const heights=lithophaneHeights(rgba,columns,rows,{invert}),sample=bilinearSampler(heights,columns,rows,{x0:0,y0:0,pw:Math.max(1,columns-1),ph:Math.max(1,rows-1)});
 const nx=Math.max(2,Math.min(180,columns)),ny=Math.max(2,Math.min(140,rows));
 const span=Math.PI/3,rBack=spec.width/(2*Math.sin(span/2)),vertices=[],triangles=[];
 const frameThick=spec.baseThickness+spec.depth*.65,border=Math.max(1,Math.round(Math.min(nx,ny)*.03));
 // Superficie frontal tallada (mirando hacia -Y) y respaldo liso a radio constante rBack.
 for(let side=0;side<2;side++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
  const u=x/(nx-1),v=y/(ny-1),th=(u-.5)*span,z=v*spec.height;
  const isBorder=x<border||x>=nx-border||y<border||y>=ny-border;
  const thick=side===1?0:isBorder?frameThick:spec.baseThickness+sample(u,v)*spec.depth;
  const rho=rBack+thick;
  vertices.push(rho*Math.sin(th),rBack-rho*Math.cos(th),z);
 }
 const offset=nx*ny;
 for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
  const a=y*nx+x,b=a+1,c=a+nx,d=c+1;
  triangles.push(a,b,d,a,d,c);
  triangles.push(offset+a,offset+d,offset+b,offset+a,offset+c,offset+d);
 }
 const edge=[];for(let x=0;x<nx;x++)edge.push(x);for(let y=1;y<ny;y++)edge.push(y*nx+nx-1);for(let x=nx-2;x>=0;x--)edge.push((ny-1)*nx+x);for(let y=ny-2;y>0;y--)edge.push(y*nx);
 edge.forEach((top,i)=>{const next=edge[(i+1)%edge.length],b0=offset+top,b1=offset+next;triangles.push(top,b0,b1,top,b1,next);});
 return {name:(spec.subject.slice(0,95)+' · litofanía curva').slice(0,120),vertices,triangles};
}
// Fanal / pantalla cilíndrica 360° en litofanía con aro de apoyo inferior y abertura central (spec.hole) para vela LED o portalámparas.
function cylindricalLithophaneMesh(rgba,columns,rows,spec,{invert=false}={}){
 const heights=lithophaneHeights(rgba,columns,rows,{invert}),bounds=activeBounds(rgba,columns,rows),sample=bilinearSampler(heights,columns,rows,bounds);
 const R=spec.width/2,H=spec.height,tMin=Math.min(spec.baseThickness,R*.22),depth=Math.min(spec.depth,R*.28);
 const rIn=Math.max(4,R-tMin-depth),rHole=Math.min(rIn-1.2,Math.max(2,(spec.hole||20)/2));
 const M=Math.max(48,Math.min(180,columns)),nZ=Math.max(28,Math.min(120,rows)),vertices=[],triangles=[];
 const pushRing=(rhoFn,z)=>{for(let j=0;j<M;j++){const th=-Math.PI+2*Math.PI*j/M,r=typeof rhoFn==='function'?rhoFn(j,th):rhoFn;vertices.push(r*Math.cos(th),r*Math.sin(th),z);}};
 // Anillos exteriores desde z=0 hasta z=H (con bisel/marco limpio en los extremos).
 for(let k=0;k<nZ;k++){
  const v=k/(nZ-1),z=v*H,frame=k===0||k===nZ-1||v<.04||v>.96;
  pushRing(j=>frame?R:R-(1-sample(j/M,v))*depth,z);
 }
 // Tapa anular superior hacia la pared interna lisa, bajada interna y brida inferior en z=0 con abertura rHole.
 pushRing(rIn,H);
 pushRing(rIn,Math.min(H*.5,2.4));
 pushRing(rHole,Math.min(H*.5,2.4));
 pushRing(rHole,0);
 const totalRings=vertices.length/(3*M);
 for(let r=0;r<totalRings;r++){
  const a0=r*M,b0=((r+1)%totalRings)*M;
  for(let j=0;j<M;j++){const j1=(j+1)%M;triangles.push(a0+j,b0+j,b0+j1,a0+j,b0+j1,a0+j1);}
 }
 return {name:(spec.subject.slice(0,95)+' · fanal en litofanía').slice(0,120),vertices,triangles};
}
// Cortante y sello de galletitas / cerámica: base ergonómica de apoyo en z=0, filo de corte en el contorno exterior
// y sello interior a menor altura para marcar el dibujo sobre la masa.
export function cutterHeights(rgba,columns,rows,{invert=false}={}){
 const h=heightField(rgba,columns,rows,{invert}),fg=Float32Array.from(h,v=>v>.12?1:0);
 const rBlade=Math.max(1,Math.round(Math.min(columns,rows)/42)),rFlange=Math.max(rBlade+2,Math.round(Math.min(columns,rows)/14));
 const inner=boxBlur(fg,columns,rows,1),outerBlade=boxBlur(fg,columns,rows,rBlade),outerFlange=boxBlur(fg,columns,rows,rFlange);
 const out=new Float32Array(h.length);
 for(let p=0;p<h.length;p++){
  // Borde de la silueta = pared de corte (altura 1.0); detalles internos = sello (altura 0.62); brida exterior = base (0).
  const isBlade=outerBlade[p]>.14&&inner[p]<.82;
  const isStamp=inner[p]>=.82&&h[p]>.35;
  const inFootprint=outerFlange[p]>.08;
  out[p]=isBlade?1:isStamp?.62:inFootprint?.05:0;
 }
 const blurred=boxBlur(out,columns,rows,1);
 let max=0;for(const v of blurred)if(v>max)max=v;
 if(max>0)for(let i=0;i<blurred.length;i++)blurred[i]/=max;
 return blurred;
}
export function reliefMesh(rgba,columns,rows,raw,{invert=false}={}){
 const spec=validateGeneration(raw);
 if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<2||rows<2||columns>384||rows>384||rgba.length!==columns*rows*4)throw Error('Imagen de relieve inválida.');
 if(spec.mode==='lithophane_sphere')return sphericalLithophaneMesh(rgba,columns,rows,spec,{invert});
 if(spec.mode==='lithophane_arc')return curvedLithophaneMesh(rgba,columns,rows,spec,{invert});
 if(spec.mode==='lithophane_cylinder')return cylindricalLithophaneMesh(rgba,columns,rows,spec,{invert});
 const labels=spec.palette.length?paletteLabels(rgba,columns,rows,spec.palette):null;
 const vertices=[],triangles=[];
 const heights=spec.mode==='lithophane'?lithophaneHeights(rgba,columns,rows,{invert}):spec.mode==='cutter'?cutterHeights(rgba,columns,rows,{invert}):heightField(rgba,columns,rows,{invert,labels});
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
  const light=heights[(rows-1-y)*columns+x];
  vertices.push((x/(columns-1)-.5)*spec.width,(y/(rows-1)-.5)*spec.height,spec.baseThickness+light*spec.depth);
 }
 for(let y=0;y<rows-1;y++)for(let x=0;x<columns-1;x++){const a=y*columns+x,b=a+1,c=a+columns,d=c+1;triangles.push(a,b,d,a,d,c);}
 const edge=[];for(let x=0;x<columns;x++)edge.push(x);for(let y=1;y<rows;y++)edge.push(y*columns+columns-1);for(let x=columns-2;x>=0;x--)edge.push((rows-1)*columns+x);for(let y=rows-2;y>0;y--)edge.push(y*columns);
 const bottom=edge.map(top=>{const index=vertices.length/3;vertices.push(vertices[top*3],vertices[top*3+1],0);return index;});
 const center=vertices.length/3;vertices.push(0,0,0);
 edge.forEach((top,i)=>{const next=(i+1)%edge.length;triangles.push(top,bottom[i],bottom[next],top,bottom[next],edge[next],center,bottom[next],bottom[i]);});
 const suffix=spec.mode==='lithophane'?' · litofanía':spec.mode==='cutter'?' · cortante':' · relieve';
 const mesh={name:(spec.subject.slice(0,95)+suffix).slice(0,120),vertices,triangles};
 if(!labels)return mesh;
 const {layers,missing}=colorLayers(labels,columns,rows,spec);
 if(!layers.length)throw Error('No encontré en la imagen los colores pedidos. Probá con otros colores o una imagen más nítida.');
 // Los colores empiezan arriba de la placa: las capas de la base salen de un solo filamento, sin cambios.
 return {...mesh,colors:{zFrom:spec.baseThickness,layers},missing};
}

export async function reliefFromImage(imageOrList,spec,{invert=false}={}){
 const list=(Array.isArray(imageOrList)?imageOrList:[imageOrList]).filter(Boolean);
 if(!list.length||list.some(u=>typeof u!=='string'||u.length>6000000||!/^data:image\/(png|jpeg|webp);base64,/.test(u)))throw Error('La referencia del relieve no es una imagen válida.');
 const images=await Promise.all(list.slice(0,6).map(async src=>{const img=new Image();img.src=src;await img.decode();return img;}));
 const multi=images.length>1&&spec.mode.startsWith('lithophane');
 const max=256,ratio=multi?Math.min(2.5,images.length*.85):spec.width/spec.height;
 const columns=Math.max(16,Math.round(max*Math.min(1,ratio))),rows=Math.max(16,Math.round(max/Math.max(1,ratio)));
 const canvas=document.createElement('canvas');canvas.width=columns;canvas.height=rows;const context=canvas.getContext('2d',{willReadFrequently:true});
 context.clearRect(0,0,columns,rows);
 if(!spec.palette?.length)context.filter='blur('+Math.max(.6,Math.min(columns,rows)/180)+'px)';
 if(multi){
  const slotW=columns/images.length;
  images.forEach((image,i)=>{
   const scale=Math.min(slotW*.94/image.width,rows*.94/image.height),w=image.width*scale,h=image.height*scale;
   context.drawImage(image,i*slotW+(slotW-w)/2,(rows-h)/2,w,h);
  });
 }else{
  const image=images[0],scale=Math.min(spec.width/image.width,spec.height/image.height),w=image.width*scale/spec.width*columns,h=image.height*scale/spec.height*rows;
  context.drawImage(image,(columns-w)/2,(rows-h)/2,w,h);
 }
 context.filter='none';
 const pixels=context.getImageData(0,0,columns,rows);
 return reliefMesh(pixels.data,columns,rows,spec,{invert});
}

const cadNode=o=>({type:'imported',face:'top',offset:[0,0],color:'',font:'',icon:'',size:[1,1,1],wallThickness:2,floorThickness:0,radius:1,radiusTop:1,height:1,points:[],text:'',fontSize:5,inputs:[],position:[0,0,0],rotation:[0,0,0],...o});
export function generatedParams(base,mesh,spec){
 const {colors=null,missing,...stored}=mesh,litho=spec.mode.startsWith('lithophane');
 let nodes=[{type:'imported',position:[0,0,0],rotation:[0,0,0]}];
 if(spec.mode==='lithophane_sphere'){
  const R=spec.width/2,zTop=stored.vertices[2]||spec.width*.96;
  const rCollar=Math.round(Math.max(3,R*.11)*100)/100,hCollar=Math.round(Math.max(4,R*.12)*100)/100;
  const rTube=Math.round(Math.max(1.8,R*.055)*100)/100,rLoop=Math.round(Math.max(rTube+2.2,R*.14)*100)/100;
  nodes=[
   cadNode({type:'imported'}),
   cadNode({type:'cylinder',radius:rCollar,radiusTop:rCollar,height:hCollar,position:[0,0,Math.round((zTop-hCollar*.35)*100)/100]}),
   cadNode({type:'torus',radius:rLoop,radiusTop:rTube,rotation:[90,0,0],position:[0,0,Math.round((zTop+rLoop+.4)*100)/100]}),
   cadNode({type:'union',inputs:[0,1,2]})
  ];
 }
 // En colores, la placa toma el primer color de la paleta; en litofanías, PLA blanco natural translúcido.
 return {...base,kind:'free',project:spec.subject.slice(0,60),importedMesh:stored,importedColors:colors,...(colors?{baseColor:spec.palette[0]}:litho?{baseColor:'#f7f4ec'}:{}),freeDesign:{version:1,nodes},printRotation:[0,0,0],sourceInfo:{...spec},forge:null};
}
