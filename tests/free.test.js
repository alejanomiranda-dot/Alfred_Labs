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
function closed(m){const edges=new Map();for(let i=0;i<m.triangles.length;i+=3)for(let j=0;j<3;j++){const a=m.triangles[i+j],b=m.triangles[i+(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');const e=edges.get(key)||[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(key,e);}for(const e of edges.values())assert.deepEqual(e,[2,0]);}
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
