import {qrFromExport} from '../scripts/keychain-qr-check.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {unzipSync,strFromU8} from 'fflate';
import {defaults,validate,buildModel} from '../src/model.js';
import {traceColorLogo,keychainUrl,validateKeychain} from '../src/keychain.js';
import {isTwoSidedKeychain} from '../src/keychain.js';
import {threeMfBytes} from '../src/export.js';
import {projectFromBytes} from '../src/project-file.js';
const api=await Module();api.setup();
const url='https://mutualunir.com/';
function logo(){
 const data=new Uint8ClampedArray(64*64*4);
 for(let y=8;y<56;y++)for(let x=8;x<56;x++)if(!(x>24&&x<40&&y>24&&y<40)){const rgb=x<24?[98,40,130]:x<40?[205,61,151]:[255,165,67];data.set([...rgb,255],(y*64+x)*4);}
 return traceColorLogo(data,64,64,'Logo de prueba');
}
const params=()=>({...defaults,kind:'keychain',project:'Llavero de prueba',shape:'round',width:50,height:60,thickness:3.2,relief:.6,baseColor:'#ffffff',keychain:logo(),qrText:url});
function closed(mesh){
 const edges=new Map();for(let i=0;i<mesh.triangles.length;i+=3)for(let j=0;j<3;j++){const a=mesh.triangles[i+j],b=mesh.triangles[i+(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');edges.set(key,(edges.get(key)||0)+1);}for(const count of edges.values())assert.equal(count,2);
}

test('llavero de dos caras: logo real por regiones, dorso plano, sólido y hasta cuatro colores',()=>{
 const model=buildModel(api,params());assert.deepEqual(model.dimensions,[50,60,3.8000000000000003]);closed(model.combined);model.parts.forEach(p=>closed(p.mesh));
 assert.ok(model.parts.length<=4);assert.equal(model.qr.face,'back');assert.ok(model.qr.module>=.8);assert.ok(model.volume>0);
 const partsVolume=model.parts.reduce((sum,part)=>{const raw=new api.Mesh({numProp:part.mesh.numProp,vertProperties:part.mesh.positions,triVerts:part.mesh.triangles}),solid=new api.Manifold(raw);const volume=solid.volume();solid.delete();return sum+volume;},0);
 assert.ok(Math.abs(partsVolume-model.volume)<.001,'Los colores no se solapan y completan la pieza');
 assert.equal(qrFromExport(threeMfBytes(model),model.qr.size),url,'El QR exportado se lee desde el dorso, sin espejo');
 const vertices=model.base.positions,k=model.base.numProp;
 const boundsAt=z=>{const points=[];for(let i=0;i<vertices.length;i+=k)if(Math.abs(vertices[i+2]-z)<1e-4)points.push(Math.abs(vertices[i]));return Math.max(...points);};
 assert.ok(boundsAt(0)<25&&boundsAt(3.2)<25,'Ambas aristas exteriores tienen bisel');
 assert.equal(boundsAt(.2),25,'El canto central conserva el ancho nominal');
});

test('proyecto y 3MF conservan el logo, las dos caras y el destino exacto del QR',()=>{
 const first=buildModel(api,params()),files=unzipSync(threeMfBytes(first)),saved=validate(JSON.parse(strFromU8(files['Metadata/taller-de-vero.json']))),again=buildModel(api,saved);
 assert.equal(saved.qrText,url);assert.deepEqual(saved.keychain,first.params.keychain);assert.equal(again.volume,first.volume);assert.equal(qrFromExport(threeMfBytes(again),again.qr.size),url);
 assert.deepEqual(projectFromBytes('llavero.3mf',threeMfBytes(first)),first.params);
 assert.deepEqual(projectFromBytes('llavero.json',new TextEncoder().encode(JSON.stringify(first.params))),first.params);
});

test('se rechazan enlaces inseguros, logos inválidos y QR demasiado fino',()=>{
 for(const value of ['javascript:alert(1)','file:///etc/passwd','https://user:secret@example.com','sin enlace'])assert.throws(()=>keychainUrl(value));
 assert.throws(()=>validateKeychain({version:1,layers:[]}));assert.throws(()=>buildModel(api,{...params(),width:30}));
 assert.throws(()=>buildModel(api,{...params(),qrText:'https://example.com/'+('a'.repeat(120))}),/fino/);
 assert.equal(validate({...defaults}).keychain,null);
 assert.throws(()=>buildModel(api,{...params(),baseColor:'#111111'}),/clara/);
});

test('logo monocromo con fondo transparente conserva una figura rectangular y sus huecos',()=>{
 const data=new Uint8ClampedArray(32*32*4);for(let i=0;i<32*32;i++)data.set([30,30,30,255],i*4);
 const config=traceColorLogo(data,32,32,'Cuadrado');assert.equal(config.layers.length,1);assert.deepEqual(config.layers[0].polygons[0],[[0,0],[32,0],[32,32],[0,32]]);
});

test('el pedido de logo y QR va al creador directo, sin confundirlo con un relieve visual',()=>{
 assert.ok(isTwoSidedKeychain('Quiero un llavero con el logo de UNIR adelante y QR en el dorso'));
 assert.equal(isTwoSidedKeychain('Quiero una galaxia en relieve'),false);assert.equal(isTwoSidedKeychain('Un llavero solo con QR'),false);
});
