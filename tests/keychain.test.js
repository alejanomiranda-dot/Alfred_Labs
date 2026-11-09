import {qrFromExport} from '../scripts/keychain-qr-check.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {unzipSync,strFromU8} from 'fflate';
import {defaults,validate,buildModel} from '../src/model.js';
import {traceColorLogo,keychainUrl,validateKeychain,keychainColors,keychainLogoNotes,colorName,planKeychainColorChange,parseKeychainColorRequest,recolorKeychain} from '../src/keychain.js';
import {contourField,blurField,ringArea} from '../src/trace.js';
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
 assert.ok(new Set(model.parts.map(p=>p.color)).size<=4,'Hasta 4 filamentos');assert.equal(model.qr.face,'back');assert.ok(model.qr.module>=.8);assert.ok(model.volume>0);
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
 const config=traceColorLogo(data,32,32,'Cuadrado');assert.equal(config.layers.length,1);assert.equal(config.layers[0].polygons.length,1);
 // The outline follows the square to within a fraction of a pixel; only the corners are softened.
 const square=config.layers[0].polygons[0],xs=square.map(p=>p[0]),ys=square.map(p=>p[1]);
 assert.ok(Math.max(...xs)-Math.min(...xs)>31.5&&Math.max(...xs)-Math.min(...xs)<32.5);assert.ok(Math.max(...ys)-Math.min(...ys)>31.5&&Math.max(...ys)-Math.min(...ys)<32.5);
 assert.ok(square.length<=16,'Lados rectos con pocos vértices');
});

test('el pedido de logo y QR va al creador directo, sin confundirlo con un relieve visual',()=>{
 assert.ok(isTwoSidedKeychain('Quiero un llavero con el logo de UNIR adelante y QR en el dorso'));
 assert.equal(isTwoSidedKeychain('Quiero una galaxia en relieve'),false);assert.equal(isTwoSidedKeychain('Un llavero solo con QR'),false);
});

// Logo with a three-color mark and a gray name underneath, like «Mutual UNIR».
function brandLogo(){
 const size=160,data=new Uint8ClampedArray(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const d=Math.hypot(x+.5-80,y+.5-62);let rgb=null;
  if(d<50)rgb=x<80?[149,65,141]:y<62?[206,106,182]:[250,158,75];
  else if(y>=128&&y<146&&x>=20&&x<140&&(x-20)%20<16)rgb=[97,97,97];
  if(rgb)data.set([...rgb,255],(y*size+x)*4);
 }
 return traceColorLogo(data,size,size,'Marca con nombre');
}
const brandParams=()=>validate({...params(),keychain:brandLogo(),qrText:'https://www.mutualunir.com.ar/'});
const modelXml=model=>strFromU8(unzipSync(threeMfBytes(model))['3D/3dmodel.model']);

test('los contornos del logo son suaves, sin escalones de píxel, también en el 3MF exportado',()=>{
 const W=64,field=new Float32Array(W*W);
 for(let y=0;y<W;y++)for(let x=0;x<W;x++){const d=Math.hypot(x+.5-32,y+.5-32);field[y*W+x]=d<20&&d>8?1:0;}
 const rings=contourField(blurField(field,W,W),W,W);assert.equal(rings.length,2,'Borde exterior y agujero');
 for(const [ring,radius] of [[rings.find(r=>Math.abs(ringArea(r))>800),20],[rings.find(r=>Math.abs(ringArea(r))<800),8]]){
  const radii=ring.map(([x,y])=>Math.hypot(x-32,y-32));assert.ok(radii.every(r=>Math.abs(r-radius)<.3),'Sigue el círculo a menos de 0,3 px');
 }
 // A disk logo exported to 3MF: the top face of the relief follows the circle instead of a pixel staircase.
 const size=128,data=new Uint8ClampedArray(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(Math.hypot(x+.5-64,y+.5-64)<50)data.set([40,40,40,255],(y*size+x)*4);
 const logo=traceColorLogo(data,size,size,'Disco'),model=buildModel(api,{...params(),keychain:logo}),scale=Math.min(40/logo.width,45/logo.height);
 const xml=modelXml(model),object=[...xml.matchAll(/<object id="\d+" type="model" name="([^"]+)" pid="1" pindex="\d+"><mesh><vertices>(.*?)<\/vertices>/gs)].find(m=>m[1].startsWith('Logo'));
 const top=[...object[2].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].map(m=>m.slice(1).map(Number)).filter(v=>Math.abs(v[2]-3.8)<1e-4);
 const cx=(Math.max(...top.map(v=>v[0]))+Math.min(...top.map(v=>v[0])))/2,cy=(Math.max(...top.map(v=>v[1]))+Math.min(...top.map(v=>v[1])))/2;
 const deviation=Math.max(...top.map(([x,y])=>Math.abs(Math.hypot(x-cx,y-cy)-50*scale)));
 assert.ok(top.length>=24,'El borde tiene suficientes vértices para ser curvo');
 assert.ok(deviation<.4*scale,'El borde exportado se aparta menos de 0,4 px del círculo (un escalón de píxel se aparta hasta 0,7): '+(deviation/scale).toFixed(2)+' px');
});

test('el nombre debajo de la marca queda como parte aparte y se avisa si tomó prestado un color',()=>{
 const logo=brandLogo(),text=logo.layers.filter(l=>l.region==='texto');
 assert.equal(text.length,1);assert.equal(colorName(text[0].source),'gris oscuro');assert.equal(text[0].color,logo.layers.find(l=>l.region==='marca'&&colorName(l.color)==='violeta').color);
 assert.equal(keychainColors(logo).length,3);assert.match(keychainLogoNotes(logo),/gris oscuro.*violeta.*nombre en negro/);
 const model=buildModel(api,brandParams()),names=model.parts.map(p=>p.name);
 assert.ok(names.includes('Texto del logo · violeta')&&names.includes('QR del dorso · violeta'),names.join(', '));
 assert.ok(new Set(model.parts.map(p=>p.color)).size<=4);
});

test('«el nombre en negro» pinta solo el texto, conserva 4 filamentos y el texto sigue aparte en el 3MF',()=>{
 const first='Necesito que el nombre "Mutual Unir" sea en negro o al menos despues pueda cambiarle el color desde el software de bambu labs',second='El nombre "Mutual UNIR" lo veo violeta, no negro';
 for(const prompt of [first,second]){
  const base=brandParams(),plan=planKeychainColorChange(base,prompt);
  assert.match(plan.message,/^Listo: el nombre queda en negro\./);assert.match(plan.message,/4 filamentos/);assert.match(plan.message,/Bambu Studio/);
  const next=validate({...base,...plan.patch}),model=buildModel(api,next),text=model.parts.find(p=>p.region==='texto');
  assert.equal(text.name,'Texto del logo · negro');assert.equal(colorName(text.color),'negro');
  assert.ok(model.parts.filter(p=>p.region==='marca').every(p=>colorName(p.color)!=='negro'),'La marca no se pinta de negro');
  assert.ok(new Set(model.parts.map(p=>p.color)).size<=4,'Hasta 4 filamentos con la base');
  assert.match(modelXml(model),/<base name="Texto del logo · negro" displaycolor="#1B1B1BFF"\/>/);
  assert.equal(qrFromExport(threeMfBytes(model),model.qr.size),'https://www.mutualunir.com.ar/','El QR negro se sigue leyendo');
  // Asking again does not repeat the same change: it says it is already done.
  assert.match(planKeychainColorChange(next,second).message,/^El nombre ya está en negro\. Si lo seguís viendo violeta, descargá el 3MF de nuevo/);
 }
});

test('los pedidos de color se entienden sin confundir el color actual con el pedido',()=>{
 const logo=brandLogo();
 assert.deepEqual(['region','colorName'].map(k=>parseKeychainColorRequest('El nombre lo veo violeta, no negro',logo)[k]),['texto','negro']);
 assert.deepEqual(['region','colorName'].map(k=>parseKeychainColorRequest('quiero la marca en azul, no violeta',logo)[k]),['marca','azul']);
 assert.equal(parseKeychainColorRequest('hacelo de 40 mm de ancho',logo),null);
 assert.equal(parseKeychainColorRequest('¿lo puedo cambiar de color en Bambu Studio?',logo).bambu,true);
 const base=brandParams();
 assert.equal(planKeychainColorChange(base,'¿lo puedo cambiar de color en Bambu Studio?').patch,undefined);
 assert.match(planKeychainColorChange(base,'la base en negro').message,/tiene que ser clara/);
 // A keychain traced before the name was split asks for the logo again instead of pretending.
 const old={...base,keychain:{...base.keychain,layers:base.keychain.layers.map(({region,source,...layer})=>layer)}};
 const plan=planKeychainColorChange(old,'el nombre en negro');assert.equal(plan.patch,undefined);assert.match(plan.message,/Volvé a adjuntar el logo/);
});

test('«Colores del archivo» recolorea una parte y une colores si pasaría de 4 filamentos',()=>{
 const logo=brandLogo(),orange=logo.layers.find(l=>colorName(l.color)==='naranja').color;
 const same=recolorKeychain(logo,{region:'marca',from:orange,color:'#2e9d4f'});assert.equal(same.merged,null);assert.equal(keychainColors(same.config).length,3);
 const black=recolorKeychain(logo,{region:'texto',color:'#1b1b1b'});assert.ok(black.merged);assert.equal(keychainColors(black.config).length,3);
 assert.ok(black.config.layers.filter(l=>l.region==='texto').every(l=>l.color==='#1b1b1b'&&l.source));
 assert.throws(()=>validateKeychain({...logo,layers:[...logo.layers,{color:'#00ff00',polygons:logo.layers[0].polygons,region:'marca'}]}),/4 filamentos/);
});

test('el pedido real con error de tipeo pinta solo el nombre, y si no dice qué parte pregunta en vez de pintar todo',()=>{
 const base=brandParams(),typo=planKeychainColorChange(base,'Necesito que el nomreb "Mutual Unir" sea en negro o al menos despues pueda cambiarle el color desde el software de bambu labs');
 assert.match(typo.message,/^Listo: el nombre queda en negro\./);
 assert.ok(typo.patch.keychain.layers.filter(l=>l.region==='marca').every(l=>colorName(l.color)!=='negro'));
 assert.equal(parseKeychainColorRequest('"Mutual UNIR" en negro',base.keychain).region,'texto');
 const unclear=planKeychainColorChange(base,'ponelo en negro');assert.equal(unclear.patch,undefined);assert.match(unclear.message,/^¿Qué parte querés en negro\?/);
 const all=planKeychainColorChange(base,'todo el logo en negro');assert.ok(all.patch.keychain.layers.every(l=>l.color==='#1b1b1b'));
 assert.equal(parseKeychainColorRequest('la figura de debajo en azul',base.keychain).region,'marca');
});
