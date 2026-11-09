// Figura esculpida → un solo sólido cerrado e imprimible.
// Las partes se funden con una unión suave (función de distancia) y manifold-3d arma la superficie con levelSet,
// así que el resultado siempre es una malla cerrada. Después se queda con la parte más grande, corta una base plana
// que apoye bien en la cama y lleva la figura a la medida pedida.
import {validateSculpt,sculptPalette} from '../shared/sculpt-schema.js';

const minPrintRadius=1.1;// mm: ningún tubo o elipsoide más fino que 2,2 mm de diámetro una vez escalado
const rad=Math.PI/180;

// Unión y resta suaves (k en mm): dentro de k las superficies se funden en vez de cortarse en arista.
const smin=(a,b,k)=>{if(k<=0)return Math.min(a,b);const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25;};
const smax=(a,b,k)=>-smin(-a,-b,k);

function rotation([ax,ay,az]){
 const [cx,sx,cy,sy,cz,sz]=[Math.cos(ax*rad),Math.sin(ax*rad),Math.cos(ay*rad),Math.sin(ay*rad),Math.cos(az*rad),Math.sin(az*rad)];
 // R = Rz·Ry·Rx (la pieza se gira primero en X, después en Y y por último en Z).
 return [cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx, sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx, -sy,cy*sx,cy*cx];
}
// Distancia aproximada a un elipsoide (negativa adentro); exacta en la superficie y conservadora afuera.
function ellipsoid(part){
 const [x0,y0,z0]=part.center,[a,b,c]=part.radii,m=rotation(part.rotate),r=Math.max(a,b,c),q=Math.min(a,b,c);
 const f=(x,y,z)=>{
  const dx=x-x0,dy=y-y0,dz=z-z0,lx=m[0]*dx+m[3]*dy+m[6]*dz,ly=m[1]*dx+m[4]*dy+m[7]*dz,lz=m[2]*dx+m[5]*dy+m[8]*dz;
  const k0=Math.hypot(lx/a,ly/b,lz/c),k1=Math.hypot(lx/(a*a),ly/(b*b),lz/(c*c));
  return k1<1e-9?-q:k0*(k0-1)/k1;
 };
 return {f,min:[x0-r,y0-r,z0-r],max:[x0+r,y0+r,z0+r]};
}
// Cono redondeado entre dos esferas (centro y radio en cada punta).
function roundCone(a,b){
 const [ax,ay,az,r1]=a,[bx,by,bz,r2]=b,bax=bx-ax,bay=by-ay,baz=bz-az,l2=bax*bax+bay*bay+baz*baz,rr=r1-r2,a2=l2-rr*rr;
 // Si una esfera contiene a la otra, el tramo es solo la esfera grande.
 if(a2<=1e-9){const [cx,cy,cz,r]=r1>=r2?a:b;return (x,y,z)=>Math.hypot(x-cx,y-cy,z-cz)-r;}
 const il2=1/l2;
 return (x,y,z)=>{
  const px=x-ax,py=y-ay,pz=z-az,yy=px*bax+py*bay+pz*baz,zz=yy-l2;
  const qx=px*l2-bax*yy,qy=py*l2-bay*yy,qz=pz*l2-baz*yy,x2=qx*qx+qy*qy+qz*qz,y2=yy*yy*l2,z2=zz*zz*l2,k=Math.sign(rr)*rr*rr*x2;
  if(Math.sign(zz)*a2*z2>k)return Math.sqrt(x2+z2)*il2-r2;
  if(Math.sign(yy)*a2*y2<k)return Math.sqrt(x2+y2)*il2-r1;
  return (Math.sqrt(x2*a2*il2)+yy*rr)*il2-r1;
 };
}
function tube(part){
 const segments=part.points.slice(1).map((p,i)=>roundCone(part.points[i],p));
 const min=[0,1,2].map(j=>Math.min(...part.points.map(p=>p[j]-p[3]))),max=[0,1,2].map(j=>Math.max(...part.points.map(p=>p[j]+p[3])));
 return {f:(x,y,z)=>{let d=Infinity;for(const s of segments){const v=s(x,y,z);if(v<d)d=v;}return d;},min,max};
}
const boxDistance=(x,y,z,min,max)=>Math.hypot(Math.max(min[0]-x,0,x-max[0]),Math.max(min[1]-y,0,y-max[1]),Math.max(min[2]-z,0,z-max[2]));

// Engrosa lo que quedaría más fino que lo imprimible con la escala final estimada.
function printable(spec,scale){
 const r=minPrintRadius/Math.max(scale,1e-6);
 return {...spec,parts:spec.parts.map(p=>p.op==='carve'?p:p.shape==='tube'?{...p,points:p.points.map(q=>[q[0],q[1],q[2],Math.max(q[3],r)])}:{...p,radii:p.radii.map(v=>Math.max(v,r))})};
}
function extent(spec){
 const parts=spec.parts.filter(p=>p.op==='add').map(p=>p.shape==='tube'?tube(p):ellipsoid(p));
 return {min:[0,1,2].map(j=>Math.min(...parts.map(p=>p.min[j]))),max:[0,1,2].map(j=>Math.max(...parts.map(p=>p.max[j])))};
}
// La función de distancia de toda la figura, con signo de manifold: positiva adentro.
export function sculptSdf(raw){
 const spec=validateSculpt(raw);
 const parts=spec.parts.map(p=>({...p,...(p.shape==='tube'?tube(p):ellipsoid(p))}));
 const sdf=([x,y,z])=>{
  let d=Infinity;
  for(const p of parts){
   const lower=boxDistance(x,y,z,p.min,p.max);
   if(p.op==='add'){
    if(d!==Infinity&&lower>=d+p.blend)continue;// ni la toca ni la funde
    const v=p.f(x,y,z);d=d===Infinity?v:smin(d,v,p.blend);
   }else{
    if(lower>=p.blend-d)continue;
    d=smax(d,-p.f(x,y,z),p.blend);
   }
  }
  return -d;
 };
 // Qué pieza (por su nombre) queda más cerca de un punto: para decir cuál quedó suelta.
 const nearest=([x,y,z])=>{let best=null,d=Infinity;for(const p of parts)if(p.op==='add'){const v=p.f(x,y,z);if(v<d){d=v;best=p;}}return best?.name||best?.shape||'';};
 return {sdf,spec,nearest};
}
// Se queda con la parte más grande y anota qué piezas quedaron sueltas y cuánto pesan.
function largest(solid,own,nearest,loose){
 const pieces=solid.decompose().map(own);if(pieces.length<2)return solid;
 pieces.sort((a,b)=>b.volume()-a.volume());const total=pieces.reduce((a,p)=>a+p.volume(),0);
 for(const p of pieces.slice(1)){const v=p.getMesh().vertProperties;loose.push({name:nearest([v[0],v[1],v[2]]),share:p.volume()/total});}
 return pieces[0];
}
// Altura del corte de la base: lo más bajo que dé un apoyo amplio, sin comerse más del 15 % de la figura.
function baseCut(api,solid,own,scale){
 const b=solid.boundingBox(),h=b.max[2]-b.min[2],footprint=(b.max[0]-b.min[0])*(b.max[1]-b.min[1]);
 const want=Math.min(.45*footprint,Math.max(.18*footprint,150/(scale*scale)));
 let best={t:.04,area:0};
 for(let t=.03;t<=.151;t+=.01){const area=own(solid.slice(b.min[2]+t*h)).area();if(area>best.area)best={t,area};if(area>=want)return b.min[2]+t*h;}
 return b.min[2]+best.t*h;
}
// target = [ancho, profundidad, alto] en mm con 0 en los ejes libres (como expectedSize); sin medidas, 80 mm de alto.
export function scaleFor(size,target){
 const ratios=(target||[]).map((want,i)=>want>0&&size[i]>0?want/size[i]:0).filter(v=>v>0);
 return ratios.length?Math.min(...ratios):80/Math.max(size[2],1e-6);
}
// Construye la figura: {name, vertices, triangles} listo para prepareImport, más notas para la persona.
export function buildSculpt(api,raw,{target=raw?.target||null,name='Figura',resolution=120}={}){
 const owned=[],own=x=>(owned.push(x),x);
 try{
  let spec=validateSculpt(raw);
  const first=extent(spec),firstSize=first.max.map((v,i)=>v-first.min[i]),estimate=scaleFor([firstSize[0],firstSize[1],firstSize[2]*.94],target);
  spec=printable(spec,estimate);
  const {sdf,nearest}=sculptSdf(spec),box=extent(spec),margin=Math.max(2,...spec.parts.map(p=>p.blend))+1;
  const bounds={min:box.min.map(v=>v-margin),max:box.max.map(v=>v+margin)},edge=Math.max(...box.max.map((v,i)=>v-box.min[i]))/resolution;
  let solid=own(api.Manifold.levelSet(sdf,bounds,edge));
  if(solid.isEmpty())throw Error('La figura quedó vacía. Probá describirla de otra manera.');
  const loose=[];solid=largest(solid,own,nearest,loose);
  const cut=baseCut(api,solid,own,estimate);
  solid=own(solid.trimByPlane([0,0,1],cut));
  solid=largest(solid,own,nearest,loose);
  const b=solid.boundingBox(),size=b.max.map((v,i)=>v-b.min[i]),s=scaleFor(size,target);
  const shift=[-(b.min[0]+b.max[0])/2,-(b.min[1]+b.max[1])/2,-b.min[2]];
  solid=own(own(solid.translate(shift)).scale([s,s,s]));
  const mesh=solid.getMesh(),vertices=[];
  for(let i=0;i<mesh.vertProperties.length;i+=mesh.numProp)vertices.push(mesh.vertProperties[i],mesh.vertProperties[i+1],mesh.vertProperties[i+2]);
  const removed=loose.length,notes=removed?['Quité '+(removed===1?'una parte suelta':removed+' partes sueltas')+' que no tocaba'+(removed===1?'':'n')+' la figura.']:[];
  return {name,vertices,triangles:Array.from(mesh.triVerts),size:size.map(v=>v*s),volume:solid.volume(),notes,loose,placement:{shift,scale:s}};
 }finally{for(const x of owned.reverse())x.delete();}
}

// ---- Colores ----
// Cada pieza con color reclama su volumen un poco agrandado (para cubrir la unión suave con sus vecinas);
// si dos se pisan, gana la que viene después en la lista, como al pintar. Lo que no reclama nadie es del color base.
// Devuelve, por cada color que no es la base, una zona cerrada en las coordenadas finales de la figura.
const zoneCache=new Map();
export function sculptColorZones(api,raw,own,{resolution=80}={}){
 const spec=validateSculpt(raw),palette=sculptPalette(spec);
 if(!palette||palette.colors.length<2||!spec.placement)return [];
 const key=JSON.stringify(spec)+'|'+resolution;
 if(!zoneCache.has(key)){
  const parts=spec.parts.map((p,i)=>({...p,color:palette.colorOf[i],...(p.op==='add'?p.shape==='tube'?tube(p):ellipsoid(p):{})})).filter(p=>p.op==='add');
  for(const p of parts)p.margin=.5+.35*p.blend;
  const claim=(p,x,y,z)=>{const bound=p.margin-boxDistance(x,y,z,p.min,p.max);return bound<-4?bound:p.margin-p.f(x,y,z);};
  const box=extent(spec),margin=Math.max(3,...spec.parts.map(p=>p.blend))+1,bounds={min:box.min.map(v=>v-margin),max:box.max.map(v=>v+margin)};
  const edge=Math.max(...box.max.map((v,i)=>v-box.min[i]))/resolution,{shift,scale}=spec.placement,zones=[];
  for(const color of palette.colors.filter(c=>c!==palette.base)){
   const field=([x,y,z])=>{
    const later=new Map();let best=-Infinity;
    for(let j=parts.length-1;j>=0;j--){
     const p=parts[j],c=claim(p,x,y,z);
     if(p.color===color){let other=-Infinity;for(const [k,v] of later)if(k!==color&&v>other)other=v;const v=Math.min(c,-other);if(v>best)best=v;}
     if(!(later.get(p.color)>=c))later.set(p.color,c);
    }
    return best;
   };
   const zone=api.Manifold.levelSet(field,bounds,edge);
   const placed=zone.translate(shift),scaled=placed.scale([scale,scale,scale]),mesh=scaled.getMesh();
   zones.push({color,vertProperties:Float32Array.from(mesh.vertProperties),triVerts:Uint32Array.from(mesh.triVerts),numProp:mesh.numProp,empty:scaled.isEmpty()});
   zone.delete();placed.delete();scaled.delete();
  }
  if(zoneCache.size>6)zoneCache.delete(zoneCache.keys().next().value);
  zoneCache.set(key,zones);
 }
 return zoneCache.get(key).filter(z=>!z.empty).map(z=>({color:z.color,solid:own(new api.Manifold(new api.Mesh({numProp:z.numProp,vertProperties:z.vertProperties,triVerts:z.triVerts})))}));
}
