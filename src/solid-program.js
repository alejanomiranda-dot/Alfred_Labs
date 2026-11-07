// Declarative CAD. Data only: no eval, scripts, imports, filesystem or network.
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import fontData from 'three/examples/fonts/gentilis_bold.typeface.json' with {type:'json'};
const font=new FontLoader().parse(fontData);
export const nodeTypes=['box','open_box','cylinder','sphere','extrude','text','union','subtract','intersect'];
function number(v,min,max,label){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(label+' fuera de rango.');return v;}
export function validateProgram(program){
 if(!program||program.version!==1||!Array.isArray(program.nodes)||!program.nodes.length||program.nodes.length>60)throw Error('El diseño libre requiere entre 1 y 60 operaciones.');
 let vertices=0;
 program.nodes.forEach((n,i)=>{
  if(!n||!nodeTypes.includes(n.type))throw Error('Operación CAD no disponible.');
  for(const [key,range] of [['position',[-500,500]],['rotation',[-360,360]]]){if(!Array.isArray(n[key])||n[key].length!==3)throw Error('Transformación inválida.');n[key].forEach(v=>number(v,...range,key));}
  if(['box','open_box'].includes(n.type)){if(!Array.isArray(n.size)||n.size.length!==3)throw Error('Faltan las tres medidas del volumen.');n.size.forEach(v=>number(v,.2,300,'Medida'));}
  if(n.type==='open_box'){number(n.wallThickness,.2,20,'Pared');if(n.wallThickness*2>=Math.min(n.size[0],n.size[1])||n.wallThickness>=n.size[2])throw Error('El espesor no deja espacio interior en la caja.');}
  if(['cylinder','sphere'].includes(n.type))number(n.radius,.1,150,'Radio');
  if(n.type==='cylinder')number(n.radiusTop,0,150,'Radio superior');
  if(['cylinder','extrude','text'].includes(n.type))number(n.height,.2,300,'Altura');
  if(n.type==='extrude'){if(!Array.isArray(n.points)||n.points.length<3||n.points.length>500)throw Error('Contorno inválido.');vertices+=n.points.length;n.points.forEach(p=>{if(!Array.isArray(p)||p.length!==2)throw Error('Punto inválido.');p.forEach(v=>number(v,-300,300,'Coordenada'));});}
  if(n.type==='text'){if(typeof n.text!=='string'||!n.text.trim()||n.text.length>60)throw Error('Texto inválido.');number(n.fontSize,1,80,'Tamaño del texto');for(const c of n.text.normalize('NFC'))if(c!==' '&&!font.data.glyphs[c])throw Error('Carácter no disponible: '+c);}
  if(['union','subtract','intersect'].includes(n.type)){if(!Array.isArray(n.inputs)||n.inputs.length<2||n.inputs.length>30||n.inputs.some(v=>!Number.isInteger(v)||v<0||v>=i))throw Error('Las operaciones deben referirse a volúmenes anteriores.');}
 });
 if(vertices>2000)throw Error('El contorno tiene demasiados puntos.');
 return program;
}
export function buildSolidProgram(api,program,params){
 validateProgram(program);const owned=[],own=x=>(owned.push(x),x),solids=[];const {Manifold:M,CrossSection:C}=api;
 try{
  for(const n of program.nodes){let solid;
   if(n.type==='box')solid=own(M.cube(n.size,true));
   if(n.type==='open_box'){const [w,d,h]=n.size,t=n.wallThickness,outer=own(M.cube(n.size,true)),inner=own(own(M.cube([w-2*t,d-2*t,h],true)).translate([0,0,t]));solid=own(outer.subtract(inner));}
   if(n.type==='cylinder')solid=own(M.cylinder(n.height,n.radius,n.radiusTop,64,true));
   if(n.type==='sphere')solid=own(M.sphere(n.radius,48));
   if(n.type==='extrude')solid=own(own(new C([n.points],'EvenOdd')).extrude(n.height));
   if(n.type==='text'){const shapes=font.generateShapes(n.text.normalize('NFC'),n.fontSize),polys=shapes.flatMap(s=>{const e=s.extractPoints(6);return [e.shape,...e.holes].map(p=>p.map(v=>[v.x,v.y]));});const cs=own(new C(polys,'EvenOdd'));if(cs.isEmpty())throw Error('El texto quedó vacío.');const b=cs.bounds();solid=own(own(cs.translate([-(b.min[0]+b.max[0])/2,-(b.min[1]+b.max[1])/2])).extrude(n.height));}
   if(n.type==='union')solid=own(M.union(n.inputs.map(i=>solids[i])));
   if(n.type==='subtract'){solid=solids[n.inputs[0]];for(const i of n.inputs.slice(1))solid=own(solid.subtract(solids[i]));}
   if(n.type==='intersect'){solid=solids[n.inputs[0]];for(const i of n.inputs.slice(1))solid=own(solid.intersect(solids[i]));}
   solid=own(own(solid.rotate(n.rotation)).translate(n.position));
   if(solid.status()!=='NoError'||solid.isEmpty())throw Error('La operación '+(solids.length+1)+' produce un sólido vacío o inválido.');
   if(solid.numTri()>200000)throw Error('La operación genera demasiados triángulos. Simplificá la pieza.');
   solids.push(solid);
  }
  let solid=solids.at(-1);const bounds=solid.boundingBox(),dimensions=bounds.max.map((v,i)=>v-bounds.min[i]);
  if(dimensions.some(v=>!Number.isFinite(v)||v<.2||v>300))throw Error('La pieza debe medir entre 0,2 y 300 mm en cada eje.');
  solid=own(solid.translate([-(bounds.min[0]+bounds.max[0])/2,-(bounds.min[1]+bounds.max[1])/2,-bounds.min[2]]));
  const raw=solid.getMesh(),mesh={numProp:raw.numProp,positions:new Float32Array(raw.vertProperties),triangles:new Uint32Array(raw.triVerts)};
  if(mesh.triangles.length/3>200000)throw Error('La pieza generada es demasiado compleja.');
  const components=solid.decompose();const count=components.length;components.forEach(s=>s.delete());
  return {params,base:mesh,detail:{numProp:3,positions:new Float32Array(),triangles:new Uint32Array()},combined:mesh,volume:solid.volume(),dimensions,totalHeight:dimensions[2],warnings:['Diseño libre: revisar medidas, paredes, encastres y soportes en Bambu Studio. No es una validación de resistencia.',...(count>1?[`La pieza contiene ${count} volúmenes separados. Revisá si deben estar unidos.`]:[])],qr:null};
 }finally{for(const x of owned.reverse())x.delete();}
}
