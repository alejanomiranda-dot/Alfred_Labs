import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'manifold-3d';
import jsQR from 'jsqr';
import {unzipSync,strFromU8} from 'fflate';
import {defaults,buildModel,validate,templateFont} from '../src/model.js';
import {stlBytes,threeMfBytes} from '../src/export.js';
const api=await Module();api.setup();
function assertClosed(mesh){
 const edges=new Map();
 for(let i=0;i<mesh.triangles.length;i+=3){const tri=mesh.triangles.slice(i,i+3);for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');const v=edges.get(key)||[0,0];v[0]++;v[1]+=a<b?1:-1;edges.set(key,v);}}
 for(const [key,[count,orientation]] of edges){assert.equal(count,2,'arista '+key);assert.equal(orientation,0,'orientación '+key);}
}
test('chapita cerrada, medidas reales y agujero pasante',()=>{
 const model=buildModel(api,defaults);assertClosed(model.combined);
 const mesh=model.combined,coords=[[],[],[]];for(let i=0;i<mesh.positions.length;i+=mesh.numProp)for(let j=0;j<3;j++)coords[j].push(mesh.positions[i+j]);
 for(const [axis,size] of [[0,45],[1,32],[2,3.2]])assert.ok(Math.abs(Math.max(...coords[axis])-Math.min(...coords[axis])-size)<.001);
 assert.ok(model.volume>1000);
 const holeY=32/2-4/2-2.5;
 for(let i=0;i<model.base.positions.length;i+=model.base.numProp)assert.ok(Math.hypot(model.base.positions[i],model.base.positions[i+1]-holeY)>1.99);
 const bytes=stlBytes(mesh);assert.equal(bytes.length,84+mesh.triangles.length/3*50);assert.equal(new DataView(bytes.buffer).getUint32(80,true),mesh.triangles.length/3);
});
test('QR recupera exactamente el destino y produce una pieza cerrada',()=>{
 const model=buildModel(api,{...defaults,kind:'qr',width:50,height:58,baseColor:'#ffffff',detailColor:'#000000'});assertClosed(model.combined);
 const {matrix}=model.qr,scale=8,size=(matrix.size+8)*scale,pixels=new Uint8ClampedArray(size*size*4);pixels.fill(255);
 for(let row=0;row<matrix.size;row++)for(let col=0;col<matrix.size;col++)if(matrix.get(row,col))for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const i=(((row+4)*scale+dy)*size+(col+4)*scale+dx)*4;pixels[i]=pixels[i+1]=pixels[i+2]=0;}
 assert.equal(jsQR(pixels,size,size).data,defaults.qrText);assert.equal(model.qr.quietZone,4);
});
test('3MF contiene unidades mm, materiales y un ensamblado de dos partes',()=>{
 const model=buildModel(api,defaults),files=unzipSync(threeMfBytes(model));
 const xml=strFromU8(files['3D/3dmodel.model']);assert.match(xml,/unit="millimeter"/);assert.equal((xml.match(/<component objectid=/g)||[]).length,2);assert.equal((xml.match(/<base name=/g)||[]).length,2);assert.deepEqual(JSON.parse(strFromU8(files['Metadata/taller-de-vero.json'])),model.params);
});
test('ovalados, acentos y logo con hueco siguen siendo sólidos cerrados',()=>{
 for(const p of [{...defaults,shape:'oval',name:'LÍA'},{...defaults,kind:'logo',width:45,height:40},{...defaults,kind:'logo',height:40,logoPolygons:[[[0,0],[10,0],[10,10],[0,10]],[[3,3],[7,3],[7,7],[3,7]]]}])assertClosed(buildModel(api,p).combined);
});
test('datos imposibles y QR vacío no exportan',()=>{
 for(const p of [{...defaults,width:0},{...defaults,width:NaN},{...defaults,kind:'qr',qrText:''},{...defaults,logoPolygons:[[[0,0],[1,1],[Infinity,3]]]}])assert.throws(()=>validate(p));
});

test('el huesito grabado elimina material real del dorso y conserva el frente',()=>{
 const plain=buildModel(api,{...defaults,shape:'oval'}),back=buildModel(api,{...defaults,shape:'oval',backDecoration:'bone',backStyle:'engraved',backDepth:.8});
 assertClosed(back.combined);assert.ok(back.backArea>10);
 assert.ok(Math.abs((plain.volume-back.volume)-back.backArea*.8)<.01);
 assert.deepEqual(back.detail,plain.detail);assert.equal(back.totalHeight,plain.totalHeight);
 const files=unzipSync(threeMfBytes(back));const saved=JSON.parse(strFromU8(files['Metadata/taller-de-vero.json']));assert.equal(saved.backDecoration,'bone');assert.equal(saved.backStyle,'engraved');
 // The exported STL must include the recessed surface at z=0.8, not just metadata.
 const stl=stlBytes(back.combined),view=new DataView(stl.buffer);let recessedVertices=0;
 for(let i=0;i<back.combined.triangles.length/3;i++)for(let j=0;j<3;j++)if(Math.abs(view.getFloat32(84+i*50+12+j*12+8,true)-.8)<.0001)recessedVertices++;
 assert.ok(recessedVertices>10);
});
test('huesito en relieve tiene volumen adicional, coordenadas positivas y advertencia',()=>{
 const plain=buildModel(api,defaults),raised=buildModel(api,{...defaults,backDecoration:'bone',backStyle:'raised',backDepth:.8});assertClosed(raised.combined);
 assert.ok(Math.abs(raised.volume-plain.volume-raised.backArea*.8)<.01);assert.equal(raised.totalHeight,4);
 assert.ok(raised.warnings.some(x=>x.includes('soportes')));const z=[];for(let i=2;i<raised.combined.positions.length;i+=raised.combined.numProp)z.push(raised.combined.positions[i]);assert.equal(Math.min(...z),0);assert.ok(Math.abs(Math.max(...z)-4)<.0001);
});
test('proyectos anteriores abren sin agregar decoración; opciones inválidas se rechazan',()=>{
 const old={...defaults};delete old.backDecoration;delete old.backStyle;delete old.backDepth;assert.equal(validate(old).backDecoration,'none');assert.throws(()=>validate({...defaults,backDecoration:'unicorn'}));
});
test('generar muestras reales para revisión en Bambu Studio',()=>{
 fs.mkdirSync('muestras',{recursive:true});for(const [name,p] of [['chapita-mora',defaults],['llavero-qr',{...defaults,kind:'qr',project:'Llavero QR de ejemplo',width:50,height:58,baseColor:'#fff8e9',detailColor:'#254e40'}]]){const model=buildModel(api,p);fs.writeFileSync(`muestras/${name}.stl`,stlBytes(model.combined));fs.writeFileSync(`muestras/${name}.3mf`,threeMfBytes(model));fs.writeFileSync(`muestras/${name}.json`,JSON.stringify(p,null,2));}
});
test('las plantillas usan letra sin serifas y conservan acentos y Ñ sin cambiar el nombre',()=>{
 const plain=validate({...defaults,name:'MORA',phone:'11 2345 6789'}),accented=validate({...defaults,name:'ÑATO',phone:'Sofía 1234'});
 assert.ok(templateFont(plain).data.familyName.includes('Helvetiker'));
 assert.ok(templateFont(accented).data.familyName.includes('Gentilis'));
 for(const p of [plain,accented]){const m=buildModel(api,p);assertClosed(m.combined);assert.ok(m.volume>0);}
});
