// Figura esculpida: piezas suaves (elipsoides y tubos con radio variable) que se funden entre sí.
// Solo datos: validar una figura nunca ejecuta nada; el sólido lo arma src/sculpt.js.
export const sculptLimits={parts:64,points:24,coord:400,radius:150,blend:20};
export const sculptShapes=['ellipsoid','tube'],sculptOps=['add','carve'];
const vec=(n,extra={})=>({type:'array',items:{type:'number'},minItems:n,maxItems:n,...extra});
// Esquema estricto para la respuesta del modelo: todos los campos presentes, los que no usa la forma van vacíos o en cero.
export const sculptJsonSchema={type:'object',additionalProperties:false,required:['parts'],properties:{parts:{type:'array',items:{type:'object',additionalProperties:false,
 required:['name','shape','op','center','radii','rotate','points','blend','color'],
 properties:{name:{type:'string'},shape:{type:'string',enum:sculptShapes},op:{type:'string',enum:sculptOps},center:vec(3),radii:vec(3),rotate:vec(3),points:{type:'array',items:vec(4)},blend:{type:'number'},color:{type:'string'}}}}}};
const num=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):null;
// Acepta lo que devuelve el modelo o un proyecto guardado; recorta valores fuera de rango en lugar de fallar,
// pero rechaza una figura sin volumen o con datos que no son números.
export function validateSculpt(raw){
 if(!raw||typeof raw!=='object'||!Array.isArray(raw.parts)||!raw.parts.length)throw Error('Figura inválida: no tiene partes.');
 const {coord,radius,blend}=sculptLimits,parts=[];
 for(const p of raw.parts.slice(0,sculptLimits.parts)){
  if(!p||typeof p!=='object'||!sculptShapes.includes(p.shape))throw Error('Figura inválida: forma desconocida.');
  const op=p.op==='carve'?'carve':'add',name=typeof p.name==='string'?p.name.slice(0,40):'';
  const b=num(p.blend,0,blend)??0,color=op==='add'&&/^#[0-9a-f]{6}$/i.test(p.color)?p.color.toLowerCase():'';
  if(p.shape==='ellipsoid'){
   const center=(p.center||[]).map(v=>num(v,-coord,coord)),radii=(p.radii||[]).map(v=>num(v,.2,radius)),rotate=(p.rotate||[0,0,0]).map(v=>num(v,-360,360)??0);
   if(center.length!==3||radii.length!==3||rotate.length!==3||center.includes(null)||radii.includes(null))throw Error('Figura inválida: elipsoide sin centro o radios.');
   parts.push({name,shape:'ellipsoid',op,center,radii,rotate,points:[],blend:b,color});
  }else{
   const points=(Array.isArray(p.points)?p.points:[]).slice(0,sculptLimits.points).map(q=>Array.isArray(q)&&q.length===4?[num(q[0],-coord,coord),num(q[1],-coord,coord),num(q[2],-coord,coord),num(q[3],.2,radius)]:null);
   if(points.length<2||points.some(q=>!q||q.includes(null)))throw Error('Figura inválida: un tubo necesita al menos dos puntos con radio.');
   parts.push({name,shape:'tube',op,center:[0,0,0],radii:[0,0,0],rotate:[0,0,0],points,blend:b,color});
  }
 }
 if(!parts.some(p=>p.op==='add'))throw Error('Figura inválida: no tiene volumen.');
 // Medida final elegida al armarla (como expectedSize), para que volver a una versión dé la misma pieza.
 const target=Array.isArray(raw.target)&&raw.target.length===3&&raw.target.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=300)&&raw.target.some(v=>v>0)?raw.target.slice():null;
 // Cómo se llevó la figura a su lugar y medida final (la calcula Alfred), para ubicar las zonas de color.
 const pl=raw.placement,placement=pl&&Array.isArray(pl.shift)&&pl.shift.length===3&&pl.shift.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1000)&&typeof pl.scale==='number'&&pl.scale>0&&pl.scale<=100?{shift:pl.shift.slice(),scale:pl.scale}:null;
 return {parts,...(target?{target}:{}),...(placement?{placement}:{})};
}
// Distancia como la ve el ojo (CIE Lab): un verde apagado y un gris tienen RGB parecidos pero no se confunden.
function lab(c){
 const [r,g,b]=[1,3,5].map(i=>{const v=parseInt(c.slice(i,i+2),16)/255;return v>.04045?((v+.055)/1.055)**2.4:v/12.92;});
 const f=t=>t>216/24389?Math.cbrt(t):(24389/27*t+16)/116,x=f((.4124*r+.3576*g+.1805*b)/.95047),y=f(.2126*r+.7152*g+.0722*b),z=f((.0193*r+.1192*g+.9505*b)/1.08883);
 return [116*y-16,500*(x-y),200*(y-z)];
}
// Colores de la figura para el AMS: el de la primera pieza es la base; como mucho 4 en total
// (si hay más, se unen los más parecidos). colorOf da el color final de cada pieza (vacío en las que tallan).
export function sculptPalette(spec,max=4){
 const first=spec.parts.find(p=>p.op==='add'&&p.color)?.color;if(!first)return null;
 const own=spec.parts.map(p=>p.op==='add'?p.color||first:''),distinct=[...new Set(own.filter(Boolean))],map=new Map(distinct.map(c=>[c,c]));
 while(new Set(map.values()).size>max){
  const live=[...new Set(map.values())];let pair=null,best=Infinity;
  for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){const a=lab(live[i]),b=lab(live[j]),d=(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;if(d<best){best=d;pair=[live[i],live[j]];}}
  for(const [k,v] of map)if(v===pair[1])map.set(k,pair[0]);
 }
 const colorOf=own.map(c=>c?map.get(c):'');
 return {base:map.get(first),colors:[...new Set(colorOf.filter(Boolean))],colorOf,merged:distinct.length>max};
}
