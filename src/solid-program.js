// Declarative CAD. Data only: no eval, scripts, imports, filesystem or network.
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import fontData from 'three/examples/fonts/gentilis_bold.typeface.json' with {type:'json'};
const font=new FontLoader().parse(fontData);
export const nodeTypes=['imported','box','open_box','cylinder','open_cylinder','revolve','sphere','extrude','text','engrave_text','emboss_text','union','subtract','intersect'];
export const faces=['top','bottom','front','back','left','right'];
const faceTypes=['engrave_text','emboss_text'];
const booleanTypes=['union','subtract','intersect'];
function number(v,min,max,label){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(label+' fuera de rango.');return v;}
// Older programs have no floorThickness: the floor then matches the walls. 0 also means "same as walls".
export function floorOf(n){return typeof n.floorThickness==='number'&&n.floorThickness>0?n.floorThickness:n.wallThickness;}
export function validateProgram(program){
 if(!program||program.version!==1||!Array.isArray(program.nodes)||!program.nodes.length||program.nodes.length>60)throw Error('El diseño libre requiere entre 1 y 60 operaciones.');
 let vertices=0;
 program.nodes.forEach((n,i)=>{
  if(!n||!nodeTypes.includes(n.type))throw Error('Operación CAD no disponible.');
  for(const [key,range] of [['position',[-500,500]],['rotation',[-360,360]]]){if(!Array.isArray(n[key])||n[key].length!==3)throw Error('Transformación inválida.');n[key].forEach(v=>number(v,...range,key));}
  if(['box','open_box'].includes(n.type)){if(!Array.isArray(n.size)||n.size.length!==3)throw Error('Faltan las tres medidas del volumen.');n.size.forEach(v=>number(v,.2,300,'Medida'));}
  if(['open_box','open_cylinder'].includes(n.type)){number(n.wallThickness,.2,20,'Pared');number(floorOf(n),.2,50,'Fondo');}
  if(n.type==='open_box'&&(n.wallThickness*2>=Math.min(n.size[0],n.size[1])||floorOf(n)>=n.size[2]))throw Error('El espesor no deja espacio interior en la caja.');
  if(['cylinder','open_cylinder','sphere'].includes(n.type))number(n.radius,.1,150,'Radio');
  if(['cylinder','open_cylinder'].includes(n.type))number(n.radiusTop,n.type==='open_cylinder'?.1:0,150,'Radio superior');
  if(['cylinder','open_cylinder','extrude','text'].includes(n.type))number(n.height,.2,300,'Altura');
  if(n.type==='open_cylinder'&&(n.wallThickness+.2>Math.min(n.radius,n.radiusTop)||floorOf(n)>=n.height))throw Error('El espesor no deja espacio interior en el recipiente.');
  if(n.type==='imported'&&!program.hasImported)throw Error('El proyecto no tiene una pieza importada.');
  if(n.type==='revolve'){
   if(!Array.isArray(n.points)||n.points.length<2||n.points.length>200)throw Error('El perfil necesita entre 2 y 200 puntos [radio, altura].');vertices+=n.points.length;
   n.points.forEach((p,k)=>{if(!Array.isArray(p)||p.length!==2)throw Error('Punto de perfil inválido.');number(p[0],0,150,'Radio del perfil');number(p[1],-300,300,'Altura del perfil');if(k&&p[1]<n.points[k-1][1])throw Error('El perfil debe ir de abajo hacia arriba (alturas crecientes).');});
   if(n.points.at(-1)[1]-n.points[0][1]<.2)throw Error('El perfil necesita altura.');
   number(n.wallThickness,0,20,'Pared');number(typeof n.floorThickness==='number'?n.floorThickness:0,0,50,'Fondo');
   if(n.wallThickness>0&&n.points.some(p=>p[0]<n.wallThickness+.2))throw Error('Con esa pared, el perfil hueco necesita radios mayores a '+(n.wallThickness+.2)+' mm en todos sus puntos.');
   if(n.wallThickness>0&&n.floorThickness>=n.points.at(-1)[1]-n.points[0][1])throw Error('El fondo es más alto que la pieza.');
  }
  if(n.type==='extrude'){if(!Array.isArray(n.points)||n.points.length<3||n.points.length>500)throw Error('Contorno inválido.');vertices+=n.points.length;n.points.forEach(p=>{if(!Array.isArray(p)||p.length!==2)throw Error('Punto inválido.');p.forEach(v=>number(v,-300,300,'Coordenada'));});}
  if(faceTypes.includes(n.type)){if(!faces.includes(n.face))throw Error('Cara inválida para el texto.');if(!Array.isArray(n.offset)||n.offset.length!==2)throw Error('Desplazamiento inválido.');n.offset.forEach(v=>number(v,-300,300,'Desplazamiento'));number(n.height,.2,10,'Profundidad del texto');if(!Array.isArray(n.inputs)||n.inputs.length!==1||!Number.isInteger(n.inputs[0])||n.inputs[0]<0||n.inputs[0]>=i)throw Error('El texto debe aplicarse sobre una pieza anterior.');}
  if(['text',...faceTypes].includes(n.type)){if(typeof n.text!=='string'||!n.text.trim()||n.text.length>60)throw Error('Texto inválido.');number(n.fontSize,1,80,'Tamaño del texto');for(const c of n.text.normalize('NFC'))if(c!==' '&&!font.data.glyphs[c])throw Error('Carácter no disponible: '+c);}
  if(booleanTypes.includes(n.type)){if(!Array.isArray(n.inputs)||n.inputs.length<2||n.inputs.length>30||n.inputs.some(v=>!Number.isInteger(v)||v<0||v>=i))throw Error('Las operaciones deben referirse a volúmenes anteriores.');}
 });
 if(vertices>2000)throw Error('El contorno tiene demasiados puntos.');
 // Only the last operation is the piece: anything not consumed by a later boolean would be silently lost.
 const used=new Set(program.nodes.flatMap(n=>[...booleanTypes,...faceTypes].includes(n.type)?n.inputs:[]));
 const loose=program.nodes.slice(0,-1).map((_,i)=>i).filter(i=>!used.has(i));
 if(loose.length)throw Error('Operaciones sueltas que no forman parte de la pieza final: '+loose.map(i=>i+1).join(', ')+'. Combinalas con unión, sustracción o intersección.');
 return program;
}
function textSection(C,own,text,fontSize){const shapes=font.generateShapes(text.normalize('NFC'),fontSize),polys=shapes.flatMap(s=>{const e=s.extractPoints(6);return [e.shape,...e.holes].map(p=>p.map(v=>[v.x,v.y]));});const cs=own(new C(polys,'EvenOdd'));if(cs.isEmpty())throw Error('El texto quedó vacío.');const b=cs.bounds();return own(cs.translate([-(b.min[0]+b.max[0])/2,-(b.min[1]+b.max[1])/2]));}
// Rotation that turns text lying on XY (extruded +Z, read from +Z) to face outwards and read correctly from that side.
const faceFrames={top:{rot:[0,0,0],axis:2,sign:1,span:[0,1]},bottom:{rot:[0,180,0],axis:2,sign:-1,span:[0,1]},front:{rot:[90,0,0],axis:1,sign:-1,span:[0,2]},back:{rot:[90,0,180],axis:1,sign:1,span:[0,2]},right:{rot:[90,0,90],axis:0,sign:1,span:[1,2]},left:{rot:[90,0,-90],axis:0,sign:-1,span:[1,2]}};
// Engraves (cuts in) or embosses (adds) text on a flat outer face of a previous solid.
// If the requested spot crosses a hole or an edge, the nearest spot fully on solid material is used instead.
function textOnFace(M,C,own,target,n,notes){
 const frame=faceFrames[n.face],box=target.boundingBox(),center=[0,1,2].map(i=>(box.min[i]+box.max[i])/2),extent=[0,1,2].map(i=>box.max[i]-box.min[i]);
 const base=textSection(C,own,n.text,n.fontSize),tb=base.bounds(),textW=tb.max[0]-tb.min[0],textH=tb.max[1]-tb.min[1],engrave=n.type==='engrave_text',depth=n.height,embed=.3;
 const faceW=extent[frame.span[0]],faceH=extent[frame.span[1]],faceName={top:'superior',bottom:'inferior',front:'frontal',back:'trasera',left:'izquierda',right:'derecha'}[n.face];
 if(textW>faceW-1||textH>faceH-1)throw Error('El texto «'+n.text+'» mide '+textW.toFixed(1)+' × '+textH.toFixed(1)+' mm y no entra en la cara '+faceName+' ('+faceW.toFixed(1)+' × '+faceH.toFixed(1)+' mm). Achicá las letras.');
 if(engrave&&depth>=extent[frame.axis]-.4)throw Error('El grabado es más profundo que la pieza.');
 const thick=engrave?depth+.5:depth+embed,expected=base.area()*(engrave?depth:embed),shift=[...center];shift[frame.axis]=(frame.sign>0?box.max[frame.axis]:box.min[frame.axis])-frame.sign*(engrave?depth:embed);
 const fits=([u,v])=>Math.abs(u)+textW/2<=faceW/2-.5&&Math.abs(v)+textH/2<=faceH/2-.5;
 const place=o=>own(own(own(own(base.translate(o)).extrude(thick)).rotate(frame.rot)).translate(shift));
 const coverage=cutter=>own(target.intersect(cutter)).volume()/expected;
 const candidates=[n.offset],step=Math.max(1,n.fontSize*.3),reach=Math.max(faceW,faceH)/2;
 for(let r=step;r<=reach&&candidates.length<120;r+=step)for(let k=0;k<12;k++){const a=k*Math.PI/6+(k%2?0:Math.PI/2);candidates.push([n.offset[0]+r*Math.cos(a),n.offset[1]+r*Math.sin(a)]);}
 let best=0;
 for(const o of candidates){if(!fits(o))continue;const cutter=place(o),c=coverage(cutter);best=Math.max(best,c);
  if(c>=.95){const moved=Math.hypot(o[0]-n.offset[0],o[1]-n.offset[1]);if(moved>0)notes.push('El texto «'+n.text+'» se corrió '+moved.toFixed(1).replace('.',',')+' mm para no pisar un agujero o borde de la cara '+faceName+'.');return own(engrave?target.subtract(cutter):target.add(cutter));}}
 if(best<.6)throw Error('La cara '+faceName+' no es plana o está hueca donde va el texto. El grabado y el relieve de texto necesitan una cara plana y maciza.');
 throw Error('No hay lugar en la cara '+faceName+' para el texto «'+n.text+'» sin pisar agujeros o bordes. Achicá las letras o elegí otra cara.');
}
// The imported file is kept outside the program (it can be large); the program only says where it is used.
export function withImport(program,params){return {...program,hasImported:Boolean(params?.importedMesh)};}
function importedSolid(api,own,data){
 const mesh=new api.Mesh({numProp:3,vertProperties:Float32Array.from(data.vertices),triVerts:Uint32Array.from(data.triangles)});mesh.merge();
 let solid;try{solid=own(new api.Manifold(mesh));}catch{throw Error('La pieza importada no es un sólido cerrado (tiene agujeros o caras sueltas en la malla). Repará el archivo en Bambu Studio o en el programa donde lo hiciste.');}
 if(solid.status()!=='NoError'||solid.isEmpty())throw Error('La pieza importada no es un sólido cerrado (tiene agujeros o caras sueltas en la malla). Repará el archivo en Bambu Studio o en el programa donde lo hiciste.');
 return solid;
}
// Turns a freshly read file into the stored piece: it must be a closed solid; heavy meshes are
// simplified with a tolerance of hundredths of a millimeter so the project stays light.
export function prepareImport(api,file){
 const owned=[],own=x=>(owned.push(x),x);
 try{
  let solid=importedSolid(api,own,file);const original=solid.numTri();let tolerance=0;
  for(const t of [.01,.02,.05]){if(solid.numTri()<=60000)break;solid=own(solid.simplify(t));tolerance=t;}
  if(solid.numTri()>150000)throw Error('La pieza es demasiado detallada para importarla. Simplificala antes en otro programa.');
  const raw=solid.getMesh(),vertices=[],triangles=Array.from(raw.triVerts);
  for(let i=0;i<raw.vertProperties.length;i+=raw.numProp)vertices.push(...[0,1,2].map(k=>Math.round(raw.vertProperties[i+k]*1e4)/1e4));
  const b=solid.boundingBox();
  return {mesh:{name:file.name,vertices,triangles},size:b.max.map((v,i)=>v-b.min[i]),original,triangles:solid.numTri(),tolerance,volume:solid.volume()};
 }finally{for(const x of owned.reverse())x.delete();}
}
// What the guide needs to place things on an imported piece: its exact extents and real cuts at several heights
// (outer width/depth and, when hollow, the size of the opening at that height).
export function describeImport(api,mesh){
 const owned=[],own=x=>(owned.push(x),x);
 try{
  const solid=importedSolid(api,own,mesh),b=solid.boundingBox(),round=v=>Math.round(v*10)/10,h=b.max[2]-b.min[2],steps=8,profile=[];
  for(let i=0;i<=steps;i++){
   const z=b.min[2]+Math.min(Math.max(h*i/steps,.05),h-.05),cut=own(solid.slice(z));if(cut.isEmpty())continue;
   const polys=cut.toPolygons().map(p=>{const xs=p.map(v=>v[0]),ys=p.map(v=>v[1]);return {w:Math.max(...xs)-Math.min(...xs),d:Math.max(...ys)-Math.min(...ys)};}).sort((a,c)=>c.w*c.d-a.w*a.d);
   const cb=cut.bounds(),row={z:round(z),ancho:round(cb.max[0]-cb.min[0]),prof:round(cb.max[1]-cb.min[1])};
   if(polys.length>1){row.hueco_ancho=round(polys[1].w);row.hueco_prof=round(polys[1].d);}
   profile.push(row);
  }
  return {ocupa:{x:[round(b.min[0]),round(b.max[0])],y:[round(b.min[1]),round(b.max[1])],z:[round(b.min[2]),round(b.max[2])]},cortes:profile};
 }finally{for(const x of owned.reverse())x.delete();}
}
export function buildSolidProgram(api,program,params){
 validateProgram(withImport(program,params));const notes=[],owned=[],own=x=>(owned.push(x),x),solids=[];const {Manifold:M,CrossSection:C}=api;
 try{
  for(const n of program.nodes){let solid;
   if(n.type==='imported')solid=importedSolid(api,own,params.importedMesh);
   if(n.type==='box')solid=own(M.cube(n.size,true));
   if(n.type==='open_box'){const [w,d,h]=n.size,t=n.wallThickness,outer=own(M.cube(n.size,true)),inner=own(own(M.cube([w-2*t,d-2*t,h],true)).translate([0,0,floorOf(n)]));solid=own(outer.subtract(inner));}
   if(n.type==='cylinder')solid=own(M.cylinder(n.height,n.radius,n.radiusTop,64,true));
   if(n.type==='open_cylinder'){
    // Vessel open towards +Z: outer radii as given, walls measured horizontally, floor of its own thickness.
    const h=n.height,t=n.wallThickness,f=floorOf(n),slope=(n.radiusTop-n.radius)/h,extra=1;
    const outer=own(M.cylinder(h,n.radius,n.radiusTop,96,true));
    const inner=own(own(M.cylinder(h-f+extra,n.radius+slope*f-t,Math.max(.05,n.radiusTop+slope*extra-t),96,false)).translate([0,0,-h/2+f]));
    solid=own(outer.subtract(inner));
   }
   if(n.type==='revolve'){
    // Lathe: points are the outer silhouette [radius, z] from bottom to top. wallThickness 0 = solid;
    // otherwise a shell of that (normal) thickness, open at the top, with a floor (floorThickness>0) or open at the bottom (0).
    const pts=n.points,t=n.wallThickness,z0=pts[0][1],zn=pts.at(-1)[1];
    solid=own(own(new C([[[0,z0],...pts,[0,zn]]],'EvenOdd')).revolve(96));
    if(t>0){
     const ext=[[pts[0][0],z0-t-2],...pts,[pts.at(-1)[0],zn+t+2]],full=[...ext,...ext.slice().reverse().map(([r,z])=>[-r,z])];
     const bottom=n.floorThickness>0?z0+n.floorThickness:z0-t-3,clip=own(C.square([800,zn+t+3-bottom]).translate([-400,bottom]));
     const cavity=own(own(own(new C([full],'EvenOdd')).offset(-t,'Miter',2)).intersect(clip));
     if(cavity.isEmpty())throw Error('La pared es demasiado gruesa para ese perfil.');
     solid=own(solid.subtract(own(cavity.revolve(96))));
    }
   }
   if(n.type==='sphere')solid=own(M.sphere(n.radius,48));
   if(n.type==='extrude')solid=own(own(new C([n.points],'EvenOdd')).extrude(n.height));
   if(n.type==='text')solid=own(textSection(C,own,n.text,n.fontSize).extrude(n.height));
   if(faceTypes.includes(n.type))solid=textOnFace(M,C,own,solids[n.inputs[0]],n,notes);
   if(n.type==='union')solid=own(M.union(n.inputs.map(i=>solids[i])));
   if(n.type==='subtract'){solid=solids[n.inputs[0]];for(const i of n.inputs.slice(1))solid=own(solid.subtract(solids[i]));}
   if(n.type==='intersect'){solid=solids[n.inputs[0]];for(const i of n.inputs.slice(1))solid=own(solid.intersect(solids[i]));}
   solid=own(own(solid.rotate(n.rotation)).translate(n.position));
   if(solid.status()!=='NoError'||solid.isEmpty())throw Error('La operación '+(solids.length+1)+' produce un sólido vacío o inválido.');
   if(solid.numTri()>200000)throw Error('La operación genera demasiados triángulos. Simplificá la pieza.');
   solids.push(solid);
  }
  const operationBounds=solids.map((x,i)=>{const b=x.boundingBox();return {index:i+1,type:program.nodes[i].type,min:b.min,max:b.max};});
  let solid=solids.at(-1);const bounds=solid.boundingBox(),dimensions=bounds.max.map((v,i)=>v-bounds.min[i]);
  if(dimensions.some(v=>!Number.isFinite(v)||v<.2||v>300))throw Error('La pieza debe medir entre 0,2 y 300 mm en cada eje.');
  solid=own(solid.translate([-(bounds.min[0]+bounds.max[0])/2,-(bounds.min[1]+bounds.max[1])/2,-bounds.min[2]]));
  const raw=solid.getMesh(),mesh={numProp:raw.numProp,positions:new Float32Array(raw.vertProperties),triangles:new Uint32Array(raw.triVerts)};
  if(mesh.triangles.length/3>200000)throw Error('La pieza generada es demasiado compleja.');
  const components=solid.decompose();const count=components.length;components.forEach(s=>s.delete());
  return {params,base:mesh,detail:{numProp:3,positions:new Float32Array(),triangles:new Uint32Array()},combined:mesh,volume:solid.volume(),dimensions,totalHeight:dimensions[2],operationBounds,warnings:['Diseño libre: revisar medidas, paredes, encastres y soportes en Bambu Studio. No es una validación de resistencia.',...notes,...(count>1?[`La pieza contiene ${count} volúmenes separados. Revisá si deben estar unidos.`]:[])],qr:null};
 }finally{for(const x of owned.reverse())x.delete();}
}
