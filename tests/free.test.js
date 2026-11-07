import {test} from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {unzipSync,strFromU8} from 'fflate';
import {defaults,buildModel,validate} from '../src/model.js';
import {validateProgram} from '../src/solid-program.js';
import {threeMfBytes,stlBytes} from '../src/export.js';
const api=await Module();api.setup();
const node=(type,extra={})=>({type,position:[0,0,0],rotation:[0,0,0],...extra});
const free=nodes=>buildModel(api,{...defaults,kind:'free',freeDesign:{version:1,nodes}});
function closed(m){if(m.mesh)m=m.mesh;const edges=new Map();for(let i=0;i<m.triangles.length;i+=3)for(let j=0;j<3;j++){const a=m.triangles[i+j],b=m.triangles[i+(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');const e=edges.get(key)||[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(key,e);}for(const e of edges.values())assert.deepEqual(e,[2,0]);}
test('caja abierta tiene medidas y volumen de paredes reales; 3MF sin partes vacías',()=>{
 const m=free([node('box',{size:[80,50,30]}),node('box',{size:[76,46,30],position:[0,0,2]}),node('subtract',{inputs:[0,1]})]);
 assert.deepEqual(m.dimensions,[80,50,30]);assert.ok(Math.abs(m.volume-(80*50*30-76*46*28))<.01);closed(m.combined);
 const xml=strFromU8(unzipSync(threeMfBytes(m))['3D/3dmodel.model']);assert.equal((xml.match(/<component objectid=/g)||[]).length,1);assert.doesNotMatch(xml,/<vertices><\/vertices>/);assert.ok(stlBytes(m.combined).length>84);
});
test('agujero transversal, contorno extruido, texto y unión producen sólidos cerrados',()=>{
 const hole=free([node('box',{size:[20,20,10]}),node('cylinder',{radius:2,radiusTop:2,height:22,rotation:[90,0,0]}),node('subtract',{inputs:[0,1]})]);assert.ok(hole.volume<4000);closed(hole.combined);
 const m=free([node('extrude',{points:[[-10,-10],[10,-10],[0,10]],height:3}),node('text',{text:'A',fontSize:5,height:1,position:[0,0,2.8]}),node('union',{inputs:[0,1]})]);closed(m.combined);assert.ok(m.volume>600);
 const intersection=free([node('sphere',{radius:10}),node('box',{size:[15,15,15]}),node('intersect',{inputs:[0,1]})]);closed(intersection.combined);assert.ok(intersection.volume>0);
});
test('caja abierta calcula paredes y fondo exactos sin interpretación de coordenadas',()=>{
 const m=free([node('open_box',{size:[80,50,30],wallThickness:2})]);assert.deepEqual(m.dimensions,[80,50,30]);assert.ok(Math.abs(m.volume-22112)<.01);closed(m.combined);
 const large=buildModel(api,{...m.params,width:250,height:200,relief:0,freeDesign:{version:1,nodes:[node('box',{size:[250,200,10]})]}});assert.deepEqual(large.dimensions,[250,200,10]);
 assert.throws(()=>free([node('open_box',{size:[10,10,10],wallThickness:5})]),/espacio interior/);
});
test('programas imposibles o excesivos y piezas vacías se rechazan',()=>{
 for(const nodes of [[node('eval')],[node('union',{inputs:[0,1]})],[node('box',{size:[-1,1,1]})],Array.from({length:61},()=>node('sphere',{radius:1}))])assert.throws(()=>validateProgram({version:1,nodes}));
 assert.throws(()=>free([node('box',{size:[10,10,10]}),node('subtract',{inputs:[0,0]})]),/vacío/);
 assert.throws(()=>free([node('box',{size:[300,300,300],rotation:[0,0,45]})]),/300/);
 assert.throws(()=>validate({...defaults,kind:'free'}));
});
test('hueso es un contorno real distinto de oval y conserva texto y argolla',()=>{
 for(const [width,height,hole] of [[45,32,4],[25,25,6],[100,25,2]]){
  const m=buildModel(api,{...defaults,shape:'bone',name:'LOLA',width,height,hole});closed(m.combined);
  const pts=m.base.positions,coords=[[],[],[]];for(let i=0;i<pts.length;i+=m.base.numProp)for(let j=0;j<3;j++)coords[j].push(pts[i+j]);
  assert.ok(Math.abs(Math.max(...coords[0])-Math.min(...coords[0])-width)<.001);assert.ok(Math.abs(Math.max(...coords[1])-Math.min(...coords[1])-height)<.001);
  assert.ok(m.detail.triangles.length>0);assert.ok(m.volume<width*height*defaults.thickness);
 }
});
test('recipiente redondo tiene pared y fondo exactos, y acepta drenaje',()=>{
 const pot=free([node('open_cylinder',{radius:35,radiusTop:35,height:60,wallThickness:2,floorThickness:3})]);
 assert.ok(pot.dimensions.every((v,i)=>Math.abs(v-[70,70,60][i])<.01));closed(pot.combined);
 const ring=Math.PI*(35**2-33**2)*57,floor=Math.PI*35**2*3;assert.ok(Math.abs(pot.volume-(ring+floor))/(ring+floor)<.01);
 const drained=free([node('open_cylinder',{radius:35,radiusTop:35,height:60,wallThickness:2,floorThickness:3}),node('cylinder',{radius:4,radiusTop:4,height:10,position:[0,0,-30]}),node('subtract',{inputs:[0,1]})]);
 assert.ok(Math.abs(pot.volume-drained.volume-Math.PI*16*3)<1);closed(drained.combined);
 const tapered=free([node('open_cylinder',{radius:25,radiusTop:35,height:50,wallThickness:2,floorThickness:2})]);closed(tapered.combined);assert.ok(Math.abs(tapered.dimensions[0]-70)<.01);
 assert.throws(()=>free([node('open_cylinder',{radius:3,radiusTop:3,height:10,wallThickness:3})]),/espacio interior/);
});
test('caja abierta respeta un fondo distinto de las paredes',()=>{
 const m=free([node('open_box',{size:[80,50,30],wallThickness:2,floorThickness:4})]);assert.ok(Math.abs(m.volume-(80*50*30-76*46*26))<.01);closed(m.combined);
});
test('operaciones sueltas que no llegan a la pieza final se rechazan',()=>{
 const loose=[node('cylinder',{radius:35,radiusTop:35,height:60}),node('cylinder',{radius:33,radiusTop:33,height:57}),node('cylinder',{radius:4,radiusTop:4,height:10})];
 assert.throws(()=>validateProgram({version:1,nodes:loose}),/sueltas.*1, 2/);
});
test('texto grabado no cambia medidas y el relieve crece en la cara elegida',()=>{
 const block=node('box',{size:[60,40,10]});
 for(const face of ['top','bottom','front','back','left','right']){
  const engraved=free([block,node('engrave_text',{inputs:[0],text:'VERO',fontSize:6,height:.6,face,offset:[0,0]})]);
  assert.deepEqual(engraved.dimensions.map(v=>Math.round(v*100)/100),[60,40,10]);assert.ok(engraved.volume<60*40*10-5);closed(engraved.combined);
  const raised=free([block,node('emboss_text',{inputs:[0],text:'VERO',fontSize:6,height:.8,face,offset:[0,0]})]);closed(raised.combined);
  const axis={top:2,bottom:2,front:1,back:1,left:0,right:0}[face];assert.ok(Math.abs(raised.dimensions[axis]-[60,40,10][axis]-.8)<.01,face);
 }
});
test('texto que no entra o sobre una cara hueca o curva se rechaza con explicación',()=>{
 assert.throws(()=>free([node('box',{size:[20,20,5]}),node('engrave_text',{inputs:[0],text:'VERONICA',fontSize:10,height:.6,face:'top',offset:[0,0]})]),/no entra/);
 const pot=node('open_cylinder',{radius:35,radiusTop:35,height:60,wallThickness:2,floorThickness:3});
 const inside=free([pot,node('engrave_text',{inputs:[0],text:'VERO',fontSize:10,height:.6,face:'top',offset:[0,0]})]),plain=free([pot]);assert.ok(inside.volume<plain.volume-10);assert.ok(Math.abs(inside.dimensions[2]-60)<.01);// visto desde arriba, se graba en el fondo interior
 assert.throws(()=>free([pot,node('emboss_text',{inputs:[0],text:'VERO',fontSize:8,height:.8,face:'front',offset:[0,0]})]),/no es plana|No hay lugar/);
 const dodged=free([pot,node('cylinder',{radius:4,radiusTop:4,height:10,position:[0,0,-30]}),node('subtract',{inputs:[0,1]}),node('engrave_text',{inputs:[2],text:'VERO',fontSize:10,height:.6,face:'bottom',offset:[3,0]})]);assert.ok(dodged.warnings.some(w=>/se corrió/.test(w)));closed(dodged.combined);
 assert.ok(free([node('open_box',{size:[40,30,10],wallThickness:2}),node('engrave_text',{inputs:[0],text:'VERO',fontSize:8,height:.6,face:'top',offset:[0,0]})]).volume<40*30*10-36*26*8);
 const under=free([pot,node('engrave_text',{inputs:[0],text:'VERO',fontSize:10,height:.6,face:'bottom',offset:[0,-15]})]);assert.ok(Math.abs(under.dimensions[2]-60)<.01);closed(under.combined);
});
test('pieza de revolución por tramos: maciza, tubo abierto y con fondo',()=>{
 const points=[[30,0],[15,20],[15,40]];
 const solid=free([node('revolve',{points,wallThickness:0,floorThickness:0})]),tube=free([node('revolve',{points,wallThickness:2,floorThickness:0})]),cup=free([node('revolve',{points,wallThickness:2,floorThickness:3})]);
 for(const m of [solid,tube,cup]){assert.deepEqual(m.dimensions.map(v=>Math.round(v*100)/100),[60,60,40]);closed(m.combined);}
 const cone=Math.PI*20/3*(30**2+30*15+15**2),neck=Math.PI*15**2*20;assert.ok(Math.abs(solid.volume-(cone+neck))/(cone+neck)<.01);
 assert.ok(tube.volume<cup.volume&&cup.volume<solid.volume/2);
 assert.throws(()=>validateProgram({version:1,nodes:[node('revolve',{points:[[10,5],[10,0]],wallThickness:0,floorThickness:0})]}),/abajo hacia arriba/);
 assert.throws(()=>validateProgram({version:1,nodes:[node('revolve',{points:[[1,0],[10,10]],wallThickness:2,floorThickness:0})]}),/radios mayores/);
});
test('multicolor: relieves, incrustados e íconos salen como partes de color en el 3MF',()=>{
 const m=free([node('box',{size:[60,40,8]}),node('emboss_text',{inputs:[0],icon:'paw',fontSize:18,height:1,face:'top',offset:[-18,0],text:'',color:'#ffffff'}),node('engrave_text',{inputs:[1],text:'LOLA',fontSize:9,height:.8,face:'top',offset:[10,0],color:'#ff3366'})]);
 assert.deepEqual(m.parts.map(p=>p.color),['#e9a08c','#ffffff','#ff3366']);for(const p of m.parts)closed(p);
 const total=m.parts.reduce((s,p)=>s+p.mesh.triangles.length,0);assert.ok(total>0);
 const xml=strFromU8(unzipSync(threeMfBytes(m))['3D/3dmodel.model']);assert.equal((xml.match(/<component objectid=/g)||[]).length,3);assert.match(xml,/FF3366FF/);
 assert.throws(()=>free([node('box',{size:[60,40,8]}),...['#111111','#222222','#333333','#444444'].map((c,i)=>node('emboss_text',{inputs:[i],icon:'star',fontSize:8,height:1,face:'top',offset:[-22+i*14,0],text:'',color:c}))]),/hasta 4/);
});
test('texto envuelto en cilindros y conos, tipografías e íconos',()=>{
 const pot=node('open_cylinder',{radius:35,radiusTop:35,height:60,wallThickness:3,floorThickness:3}),plain=free([pot]);
 const wrapped=free([pot,node('engrave_text',{inputs:[0],text:'VERO',fontSize:12,height:.8,face:'around',offset:[0,0]})]);
 assert.ok(wrapped.volume<plain.volume-20);assert.deepEqual(wrapped.dimensions.map(Math.round),[70,70,60]);closed(wrapped.combined);
 const raised=free([pot,node('emboss_text',{inputs:[0],text:'VERO',fontSize:12,height:1,face:'around',offset:[0,0]})]);assert.ok(raised.volume>plain.volume+20);
 assert.throws(()=>free([pot,node('engrave_text',{inputs:[0],text:'VERO VERO VERO VERO VERO',fontSize:20,height:.8,face:'around',offset:[0,0]})]),/no entra alrededor/);
 for(const font of ['gentilis','helvetiker','optimer'])closed(free([node('box',{size:[60,20,5]}),node('engrave_text',{inputs:[0],text:'Verónica',font,fontSize:8,height:.6,face:'top',offset:[0,0]})]).combined);
 for(const icon of ['heart','paw','star','leaf','flower','bone','house','moon'])closed(free([node('box',{size:[60,40,5]}),node('emboss_text',{inputs:[0],icon,text:'',fontSize:20,height:1,face:'top',offset:[0,0]})]).combined);
});
