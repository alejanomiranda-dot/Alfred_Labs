import {test} from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {defaults,buildModel} from '../src/model.js';
import {reliefMesh,generatedParams} from '../src/relief.js';
import {validateGeneration} from '../src/generation-spec.js';
import {generateVisual} from '../server/visual-generation.js';
import {designService} from '../server/design-service.js';
import {checkProposal,pendingContext} from '../src/proposals.js';
import {stlBytes,threeMfBytes} from '../src/export.js';
const api=await Module();api.setup();
const spec={mode:'relief',subject:'Luna de prueba',width:80,height:60,baseThickness:2,depth:3};

test('relieve reemplaza fuente Forge anterior y la guía CAD no recibe su historial',()=>{
 const previous={...defaults,forge:{version:1,selected:'old',revisions:[{scad:'fuente-privada'}]}};
 const mesh=reliefMesh(new Uint8ClampedArray(16).fill(255),2,2,spec);
 const candidate=generatedParams(previous,mesh,spec);
 assert.equal(candidate.forge,null);
 assert.equal(buildModel(api,candidate).params.sourceInfo.subject,spec.subject);
 const pending=pendingContext(defaults,previous,JSON.stringify(defaults));
 assert.equal(pending.forge,undefined);
 assert.ok(!JSON.stringify(pending).includes('fuente-privada'));
});

test('modelo configurado en el entorno local llega a la guía además de Forge',async()=>{
 let sent;
 await designService({prompt:'Solo explicame qué puedo hacer',params:defaults},{OPENAI_API_KEY:'test',OPENAI_MODEL:'configured-test-model'},async(_url,options)=>{
  sent=JSON.parse(options.body);
  return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({message:'Podés crear piezas.',canApply:false,params:defaults})}]}]})};
 });
 assert.equal(sent.model,'configured-test-model');
});
function edgesClosed(mesh){const edges=new Map();for(let i=0;i<mesh.triangles.length;i+=3)for(let j=0;j<3;j++){const a=mesh.triangles[i+j],b=mesh.triangles[i+(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');const e=edges.get(key)||[0,0];e[0]++;e[1]+=a<b?1:-1;edges.set(key,e);}for(const e of edges.values())assert.deepEqual(e,[2,0]);}
test('mapa de alturas produce relieve cerrado con base plana, medidas y volumen reales',()=>{
 // Fondo negro con un cuadrado blanco al centro: el fondo queda en la base y el cuadrado sube toda la profundidad.
 const pixels=new Uint8ClampedArray(8*8*4);for(let i=0;i<64;i++){const x=i%8,y=Math.floor(i/8),v=x>1&&x<6&&y>1&&y<6?255:0;pixels.set([v,v,v,255],i*4);}
 const mesh=reliefMesh(pixels,8,8,spec);edgesClosed(mesh);
 const model=buildModel(api,generatedParams(defaults,mesh,spec));edgesClosed(model.combined);
 assert.deepEqual(model.dimensions,[80,60,5]);assert.ok(model.volume>80*60*2+1&&model.volume<80*60*5);assert.ok(stlBytes(model.combined).length>84);assert.ok(threeMfBytes(model).length>100);
 assert.equal(model.params.sourceInfo.subject,spec.subject);
});
test('imagen transparente queda en el plano base, inversión y orientación se conservan',()=>{
 // Fondo blanco con un cuadrado negro y una esquina transparente: el fondo se toma del borde,
 // el dibujo sube, lo transparente queda en la base e invertir da vuelta el dibujo.
 const n=24,p=new Uint8ClampedArray(n*n*4);
 for(let r=0;r<n;r++)for(let x=0;x<n;x++){const i=(r*n+x)*4,square=x>=8&&x<16&&r>=8&&r<16,clear=x<5&&r<5;p.set(clear?[0,0,0,0]:square?[0,0,0,255]:[255,255,255,255],i);}
 const z=(mesh,x,r)=>mesh.vertices[((n-1-r)*n+x)*3+2];
 const normal=reliefMesh(p,n,n,spec),inverse=reliefMesh(p,n,n,spec,{invert:true});
 assert.ok(z(normal,12,12)>4.5);assert.equal(z(normal,20,20),2);assert.equal(z(normal,1,1),2);
 assert.equal(z(inverse,12,12),2);assert.ok(z(inverse,20,20)>4.5);assert.equal(z(inverse,1,1),2);edgesClosed(normal);
});
test('ruido de una imagen densa sigue siendo un sólido cerrado dentro de los límites',()=>{
 const p=new Uint8ClampedArray(160*160*4);for(let i=0;i<p.length;i+=4){p[i]=p[i+1]=p[i+2]=(i*17)%256;p[i+3]=255;}
 const mesh=reliefMesh(p,160,160,spec);edgesClosed(mesh);const model=buildModel(api,generatedParams(defaults,mesh,spec));assert.ok(model.volume>0);assert.ok(model.combined.triangles.length/3<150000);
});
test('medidas inválidas, exceso de resolución e imagen faltante no construyen piezas',()=>{
 for(const raw of [{...spec,width:NaN},{...spec,baseThickness:0},{...spec,depth:100},{...spec,mode:'sculpture'}])assert.throws(()=>validateGeneration(raw));
 assert.throws(()=>reliefMesh([],300,300,spec));
});
test('un ajuste conversado usa la malla de la propuesta visual, sin necesitar aplicarla primero',()=>{
 const pixels=new Uint8ClampedArray(16*4).fill(255),pending=generatedParams(defaults,reliefMesh(pixels,4,4,spec),spec);
 const program={version:1,nodes:[...pending.freeDesign.nodes,{type:'cylinder',radius:3,radiusTop:3,height:20,position:[0,0,3],rotation:[0,0,0]},{type:'subtract',inputs:[0,1],position:[0,0,0],rotation:[0,0,0]}]};
 const checked=checkProposal(api,defaults,{designSource:'pending',params:{kind:'free',freeDesign:program}},pending);
 assert.equal(checked.candidate.importedMesh,pending.importedMesh);assert.ok(checked.built.volume<80*60*5);assert.equal(defaults.importedMesh,null);edgesClosed(checked.built.combined);
});
test('nuevas formas suaves conservan medidas, agujeros y sólidos cerrados',()=>{
 const n=(type,extra)=>({type,position:[0,0,0],rotation:[0,0,0],...extra});
 for(const [node,size] of [[n('ellipsoid',{size:[40,30,60]}),[40,30,60]],[n('capsule',{radius:5,height:30}),[10,10,30]],[n('torus',{radius:20,radiusTop:3}),[46,46,6]]]){const model=buildModel(api,{...defaults,kind:'free',freeDesign:{version:1,nodes:[node]}});edgesClosed(model.combined);assert.ok(model.dimensions.every((v,i)=>Math.abs(v-size[i])<.01));}
});
test('generación visual usa OpenAI, respeta referencia y devuelve solo la imagen verificada',async()=>{
 let sent;const fetcher=async(url,options)=>{sent={url,...options};return {ok:true,json:async()=>({data:[{b64_json:'aGVsbG8='}]})};};
 const response=await generateVisual({spec},'test-key',fetcher);assert.match(response.imageDataUrl,/^data:image\/png;base64,/);assert.equal(response.interpretation,true);assert.equal(JSON.parse(sent.body).model,'gpt-image-1.5');assert.match(JSON.parse(sent.body).prompt,/HEIGHT MAP/);
 await generateVisual({spec,imageDataUrl:'data:image/png;base64,aGVsbG8='},'test-key',fetcher);assert.match(sent.url,/images\/edits$/);assert.ok(sent.body instanceof FormData);assert.ok(sent.body.has('image'));
});
test('errores de acceso a imágenes se explican sin revelar credenciales ni detalles del proveedor',async()=>{
 await assert.rejects(generateVisual({spec},'test-key',async()=>({ok:false,status:403,json:async()=>({error:{message:'private-upstream'}})})),e=>e.message.includes('adjuntar una imagen')&&!e.message.includes('private-upstream'));
 await assert.rejects(designService({action:'bad'},{}),/Acción/);
 const noCall=()=>{throw Error('No debe salir a internet');};await assert.rejects(generateVisual({spec,imageDataUrl:'https://example.com'},'test-key',noCall),/referencia/);
});

// Escudo sintético: placa blanca, mitad roja y mitad negra, con una franja blanca (letras) en el medio.
function shieldImage(n=160){
 const rgba=new Uint8ClampedArray(n*n*4).fill(255);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const inside=Math.hypot(x-n/2,y-n/2)<n*.38,stripe=Math.abs(y-n/2)<n*.04&&Math.abs(x-n/2)<n*.25;
  if(!inside||stripe)continue;const i=(y*n+x)*4,red=x<n/2;
  rgba[i]=red?205:20;rgba[i+1]=red?25:20;rgba[i+2]=red?35:20;
 }
 return rgba;
}
test('relieve en colores: una parte por color, placa del primer color y 3MF listo para el AMS',()=>{
 const colorSpec=validateGeneration({...spec,width:80,height:80,palette:['#FFFFFF','#d71920','#111111']});
 assert.deepEqual(colorSpec.palette,['#ffffff','#d71920','#111111']);
 const mesh=reliefMesh(shieldImage(),160,160,colorSpec);
 assert.equal(mesh.colors.layers.length,2);assert.equal(mesh.colors.zFrom,2);
 const params=generatedParams(defaults,mesh,colorSpec);
 assert.equal(params.baseColor,'#ffffff');assert.equal('colors' in params.importedMesh,false);
 const model=buildModel(api,params);
 assert.deepEqual(model.parts.map(p=>p.color),['#ffffff','#d71920','#111111']);
 assert.ok(model.parts.every(p=>p.mesh.triangles.length>0));
 // Los colores solo están arriba de la placa: la base se imprime con un único filamento.
 for(const part of model.parts.slice(1)){let low=Infinity;for(let i=2;i<part.mesh.positions.length;i+=part.mesh.numProp)low=Math.min(low,part.mesh.positions[i]);assert.ok(low>=1.99,'color debajo de la placa: '+low);}
 assert.deepEqual(model.dimensions.map(Math.round),[80,80,5]);
 const zip=threeMfBytes(model);assert.ok(zip.length>1000);
 // Monocromo sigue igual: sin paleta no hay partes de color.
 const mono=buildModel(api,generatedParams(defaults,reliefMesh(shieldImage(),160,160,spec),validateGeneration(spec)));
 assert.equal(mono.parts,undefined);assert.equal(mono.params.importedColors,null);
});
test('paleta inválida o de un solo color no rompe el relieve monocromo',()=>{
 assert.deepEqual(validateGeneration({...spec,palette:['#ffffff']}).palette,[]);
 assert.deepEqual(validateGeneration(spec).palette,[]);
 assert.throws(()=>validateGeneration({...spec,palette:['rojo','#000000']}));
 assert.throws(()=>validateGeneration({...spec,palette:['#000000','#111111','#222222','#333333','#444444']}));
});
