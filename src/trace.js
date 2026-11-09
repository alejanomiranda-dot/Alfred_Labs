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

// Contornos suaves de un campo 0..1 (marching squares con interpolación lineal en las aristas).
// El campo se muestrea en el centro de cada píxel; afuera de la imagen vale 0, así que todo contorno cierra.
// Devuelve polígonos en coordenadas de imagen (un píxel = una unidad), simplificados con Douglas–Peucker.
export function contourField(field,width,height,{iso=.5,tolerance=.3,minArea=2}={}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>1<<20||field.length!==width*height)throw Error('Imagen demasiado grande para vectorizar.');
 const level=iso-1e-6,W=width+2,H=height+2,value=(X,Y)=>X<1||Y<1||X>width||Y>height?0:field[(Y-1)*width+X-1];
 // Cruce sobre una arista, calculado siempre desde su extremo izquierdo/superior para que dos celdas lo compartan exacto.
 const points=new Map(),cross=(X,Y,horizontal)=>{const id=(Y*W+X)*2+(horizontal?0:1);if(!points.has(id)){const a=value(X,Y),b=horizontal?value(X+1,Y):value(X,Y+1),t=(level-a)/(b-a);points.set(id,horizontal?[X+t-.5,Y-.5]:[X-.5,Y+t-.5]);}return id;};
 const next=new Map();
 for(let Y=0;Y<H-1;Y++)for(let X=0;X<W-1;X++){
  // Esquinas en sentido horario (y hacia abajo): sup-izq, sup-der, inf-der, inf-izq.
  const v=[value(X,Y),value(X+1,Y),value(X+1,Y+1),value(X,Y+1)],inside=v.map(x=>x>=level);
  if(inside.every(Boolean)||!inside.some(Boolean))continue;
  const edge=[cross.bind(null,X,Y,true),cross.bind(null,X+1,Y,false),cross.bind(null,X,Y+1,true),cross.bind(null,X,Y,false)];
  const entries=[],exits=[];
  for(let i=0;i<4;i++){const a=inside[i],b=inside[(i+1)%4];if(a!==b)(b?entries:exits).push(i);}
  // Una sola zona: la entrada se une con la salida. En los casos de silla decide el centro de la celda.
  if(entries.length===1)next.set(edge[entries[0]](),edge[exits[0]]());
  else{
   const connected=(v[0]+v[1]+v[2]+v[3])/4>=level,[e1,e2]=entries,after=e=>exits.find(x=>x>e)??exits[0],before=e=>[...exits].reverse().find(x=>x<e)??exits[exits.length-1];
   for(const e of [e1,e2])next.set(edge[e](),edge[connected?before(e):after(e)]());
  }
 }
 const polygons=[],used=new Set();
 for(const start of next.keys()){
  if(used.has(start))continue;const ring=[];let id=start;
  while(!used.has(id)){used.add(id);ring.push(points.get(id));id=next.get(id);if(id===undefined)break;}
  const clean=ring.filter((p,i)=>{const q=ring[(i+1)%ring.length];return Math.abs(p[0]-q[0])+Math.abs(p[1]-q[1])>1e-9;});
  if(clean.length<3)continue;
  const simple=simplifyRing(clean,tolerance);
  if(simple.length>=3&&Math.abs(ringArea(simple))>=minArea)polygons.push(simple.map(([x,y])=>[Math.min(width,Math.max(0,x)),Math.min(height,Math.max(0,y))]));
 }
 return polygons;
}
export const ringArea=ring=>ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;

// Douglas–Peucker sobre un anillo cerrado: se corta en el vértice más lejano al primero y se simplifica cada mitad.
export function simplifyRing(ring,tolerance){
 if(ring.length<=4||tolerance<=0)return ring;
 let far=0,best=-1;for(let i=1;i<ring.length;i++){const d=(ring[i][0]-ring[0][0])**2+(ring[i][1]-ring[0][1])**2;if(d>best){best=d;far=i;}}
 const keep=new Uint8Array(ring.length);keep[0]=keep[far]=1;
 const stack=[[0,far],[far,ring.length]],tol2=tolerance*tolerance,at=i=>ring[i%ring.length];
 while(stack.length){
  const [a,b]=stack.pop();if(b-a<2)continue;
  const [ax,ay]=at(a),[bx,by]=at(b),dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy;let index=-1,max=tol2;
  for(let i=a+1;i<b;i++){const [px,py]=at(i);let d;if(len2<1e-12)d=(px-ax)**2+(py-ay)**2;else{const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/len2));d=(ax+t*dx-px)**2+(ay+t*dy-py)**2;}if(d>max){max=d;index=i;}}
  if(index>=0){keep[index]=1;stack.push([a,index],[index,b]);}
 }
 return ring.filter((_,i)=>keep[i]);
}

// Suavizado gaussiano 3×3 separable (1-2-1): borra el escalonado de una máscara sin comerse trazos de 2 px.
export function blurField(field,width,height,passes=1){
 let src=Float32Array.from(field),tmp=new Float32Array(src.length);
 for(let p=0;p<passes;p++){
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;tmp[i]=((x?src[i-1]:0)+2*src[i]+(x<width-1?src[i+1]:0))/4;}
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;src[i]=((y?tmp[i-width]:0)+2*tmp[i]+(y<height-1?tmp[i+width]:0))/4;}
 }
 return src;
}
