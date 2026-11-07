// Extract boundaries of a binary image. Shared pixel edges are omitted, so holes
// and disconnected regions survive as independent closed contours.
export function traceBitmap(rgba,width,height,threshold=150,invert=false){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>65536||rgba.length!==width*height*4)throw Error('Imagen demasiado grande para vectorizar.');
 const mask=new Uint8Array(width*height);let filled=0;
 for(let i=0;i<mask.length;i++){const j=i*4,a=rgba[j+3]/255;const gray=(.2126*rgba[j]+.7152*rgba[j+1]+.0722*rgba[j+2])*a+255*(1-a);mask[i]=rgba[j+3]>20&&((gray<threshold)!==invert)?1:0;filled+=mask[i];}
 if(!filled)throw Error('No se detectó un dibujo. Ajustá el contraste o invertí la imagen.');
 if(filled>mask.length*.93)throw Error('Se seleccionó casi todo el fondo. Invertí la imagen o ajustá el contraste.');
 const edges=[],outgoing=new Map();const key=(x,y)=>y*(width+1)+x;
 const add=(x,y,xx,yy,dir)=>{const edge={a:key(x,y),b:key(xx,yy),x,y,dir,used:false};edges.push(edge);const list=outgoing.get(edge.a)||[];list.push(edge);outgoing.set(edge.a,list);};
 const on=(x,y)=>x>=0&&y>=0&&x<width&&y<height&&mask[y*width+x];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(on(x,y)){
  if(!on(x,y-1))add(x,y,x+1,y,0);
  if(!on(x+1,y))add(x+1,y,x+1,y+1,1);
  if(!on(x,y+1))add(x+1,y+1,x,y+1,2);
  if(!on(x-1,y))add(x,y+1,x,y,3);
 }
 const polygons=[];
 for(const first of edges){if(first.used)continue;let edge=first;const path=[];
  do{edge.used=true;path.push([edge.x,edge.y]);if(edge.b===first.a)break;
   const candidates=(outgoing.get(edge.b)||[]).filter(e=>!e.used);
   // Keep diagonal touching pixels as separate loops: turn right first.
   const rank=e=>[1,0,3,2].indexOf((e.dir-edge.dir+4)%4);
   candidates.sort((a,b)=>rank(a)-rank(b));edge=candidates[0];
   if(!edge)throw Error('No se pudo cerrar el contorno de la imagen.');
  }while(path.length<=edges.length);
  const simple=path.filter((point,i)=>{const before=path[(i+path.length-1)%path.length],after=path[(i+1)%path.length];return (point[0]-before[0])*(after[1]-point[1])!==(point[1]-before[1])*(after[0]-point[0]);});
  const area=Math.abs(simple.reduce((sum,p,i)=>{const q=simple[(i+1)%simple.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2);
  if(simple.length>=3&&area>=3)polygons.push(simple);
 }
 if(!polygons.length)throw Error('El dibujo es demasiado pequeño. Usá una imagen más definida.');
 if(polygons.length>500||polygons.reduce((n,p)=>n+p.length,0)>20000)throw Error('La imagen tiene demasiado detalle. Probá con un logo o silueta más simple.');
 return {polygons,mask,filled};
}
