import {test} from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {validateSculpt,sculptPalette} from '../shared/sculpt-schema.js';
import {validateForgeArchive} from '../shared/forge-schema.js';
import {buildSculpt,sculptSdf,scaleFor} from '../src/sculpt.js';
import {prepareForgeProposal,revisionFromResult,appendForgeRevision,isSculpt} from '../src/forge-project.js';
import {countParts,reviewPrint} from '../src/printability.js';
import {defaults,buildModel} from '../src/model.js';
import {threeMfBytes} from '../src/export.js';
import {generateSculpt,validateSculptRequest} from '../server/sculpt.js';
import {routeOf,proposeDesign} from '../server/assistant.js';
import {designService} from '../server/design-service.js';
const api=await Module();api.setup();

const ball=(name,center,radii,op='add',blend=0,rotate=[0,0,0])=>({name,shape:'ellipsoid',op,center,radii,rotate,points:[],blend});
const tube=(name,points,blend=3)=>({name,shape:'tube',op:'add',center:[0,0,0],radii:[0,0,0],rotate:[0,0,0],points,blend});
// Dragoncito enroscado sobre una piedra, armado a mano como lo devolvería el modelo.
const spiral=Array.from({length:15},(_,i)=>{const a=i/14*Math.PI*1.7,r=26-i*.9;return [Math.cos(a)*r,Math.sin(a)*r,18+i*.2,9-i*.1];});
const tail=Array.from({length:13},(_,i)=>{const a=-i/12*Math.PI*1.4,r=24-i*1.2;return [Math.cos(a)*r,Math.sin(a)*r,16-i*.3,7.5-i*.5];});
const dragon={parts:[
 ball('piedra',[0,0,8],[34,30,12],'add',0,[0,0,15]),tube('cuerpo',spiral,4),tube('cola',tail,4),
 tube('cuello',[[-22,12,22,7],[-18,2,34,5.5],[-12,-6,42,5]],4),ball('cabeza',[-10,-10,46],[7,9,6.5],'add',3,[0,0,10]),
 ball('hocico',[-7,-19,44],[4.5,6,4],'add',3,[-10,0,10]),tube('cuerno',[[-14,-6,51,2.2],[-17,0,57,1.2]],1.5),
 ball('ala',[8,10,32],[16,9,2],'add',3,[20,-30,30]),ball('ojo',[-14,-15,48],[1.4,1.4,1.4],'carve',.6)]};
const reply=obj=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(obj)}]}]})});
const sculptReply={sculpt:dragon,finish:{texture:'scales',smooth:.6,depth_mm:.8,scale_mm:5},description:'Un dragoncito enroscado sobre una piedra, de 9 cm.',assumptions:['Una sola pieza.'],caveats:[]};

test('la figura se valida como datos: recorta valores fuera de rango y rechaza figuras sin volumen',()=>{
 const v=validateSculpt({parts:[ball('a',[0,0,9999],[0,5,500]),{...tube('b',[[0,0,0,0],[1,1,1,1]]),blend:99}],target:[0,0,90]});
 assert.equal(v.parts[0].center[2],400);assert.equal(v.parts[0].radii[0],.2);assert.equal(v.parts[0].radii[2],150);
 assert.equal(v.parts[1].points[0][3],.2);assert.equal(v.parts[1].blend,20);assert.deepEqual(v.target,[0,0,90]);
 assert.throws(()=>validateSculpt({parts:[]}),/partes/);
 assert.throws(()=>validateSculpt({parts:[ball('ojo',[0,0,0],[1,1,1],'carve')]}),/volumen/);
 assert.throws(()=>validateSculpt({parts:[tube('x',[[0,0,0,1]])]}),/tubo/);
 assert.throws(()=>validateSculpt({parts:[{shape:'cube'}]}),/forma/);
 assert.equal(validateSculpt({parts:[ball('a',[0,0,0],[1,1,1])],target:[0,0,999]}).target,undefined);
});

test('la distancia es positiva adentro, negativa afuera y la resta talla huecos',()=>{
 const {sdf}=sculptSdf({parts:[ball('a',[0,0,0],[10,10,10]),ball('hueco',[0,0,10],[3,3,3],'carve',0)]});
 assert.ok(Math.abs(sdf([0,0,0])-7)<.01,"el centro queda a 7 mm del hueco tallado");assert.ok(sdf([20,0,0])<0);assert.ok(Math.abs(sdf([10,0,0]))<.01);
 assert.ok(sdf([0,0,9])<0,'el hueco tallado queda afuera del sólido');
 const smooth=sculptSdf({parts:[ball('a',[-6,0,0],[5,5,5]),ball('b',[6,0,0],[5,5,5],'add',4)]}).sdf,hard=sculptSdf({parts:[ball('a',[-6,0,0],[5,5,5]),ball('b',[6,0,0],[5,5,5])]}).sdf;
 assert.ok(smooth([0,0,0])>hard([0,0,0]),'la unión suave rellena el cuello entre las dos piezas');
 assert.equal(scaleFor([50,40,100],[0,0,90]),.9);assert.equal(scaleFor([50,40,100],[100,0,90]),.9);assert.equal(scaleFor([50,40,100],null),.8);
});

test('el dragoncito sale como un solo sólido cerrado, con base plana y a la medida pedida',()=>{
 const out=buildSculpt(api,{...dragon,parts:[...dragon.parts,ball('suelta',[200,0,40],[5,5,5])],target:[0,0,90]},{name:'Dragoncito',resolution:90});
 assert.ok(Math.abs(out.size[2]-90)<.01);assert.ok(out.volume>1000);
 assert.match(out.notes[0],/suelta/);assert.ok(out.loose.some(l=>l.name==='suelta'&&l.share>0),'dice qué pieza quedó suelta');
 const zs=out.vertices.filter((_,i)=>i%3===2);assert.ok(Math.abs(Math.min(...zs))<1e-4);
 const mesh={numProp:3,positions:Float32Array.from(out.vertices),triangles:Uint32Array.from(out.triangles)};
 assert.equal(countParts(mesh),1);
 const r=reviewPrint(mesh,out.volume);assert.ok(r.contactArea>300,'apoya con un área amplia');assert.ok(!r.issues.some(i=>i.kind==='contact'));
 // Un tubo fino como un pelo se engrosa a lo imprimible.
 const thin=buildSculpt(api,{parts:[ball('cuerpo',[0,0,20],[20,20,20]),tube('bigote',[[15,0,25,.2],[40,0,25,.2]],0)],target:[0,0,40]},{resolution:70});
 assert.ok(thin.size[0]-thin.size[1]>15,'el bigote quedó pegado y con volumen');
});

test('la figura entra al historial de versiones, se vuelve a armar igual y lleva su acabado',()=>{
 const result={...sculptReply,sculpt:{...dragon,target:[0,0,90]},finish:{texture:'scales',smooth:.6,depth:.8,scale:5},created:new Date().toISOString()};
 const revision=revisionFromResult(result,'dragoncito'),archive=appendForgeRevision(null,revision);
 assert.ok(isSculpt(archive));assert.equal(revision.scad,undefined);
 const mesh=buildSculpt(api,revision.sculpt,{resolution:80});
 const checked=prepareForgeProposal(api,{...defaults,project:'Dragoncito'},{mesh},archive);
 assert.equal(checked.inverted,false);assert.ok(Math.abs(checked.built.dimensions[2]-90)<.5);
 assert.equal(checked.candidate.freeDesign.nodes.at(-1).type,'finish');assert.equal(checked.candidate.freeDesign.nodes.at(-1).texture,'scales');
 assert.throws(()=>validateForgeArchive({...archive,revisions:[{...revision,sculpt:{parts:[]}}]}),/partes/);
 assert.throws(()=>validateForgeArchive({...archive,revisions:[{...revision,sculpt:undefined}]}),/OpenSCAD/);
});

test('el escultor pide la figura a OpenAI con la clave solo en el encabezado y valida la respuesta',async()=>{
 let url,sent,headers;const fetcher=async(u,init)=>{url=u;headers=init.headers;sent=JSON.parse(init.body);return reply(sculptReply);};
 const image='data:image/png;base64,iVBORw0KGgo=';
 const r=await generateSculpt({prompt:'dragoncito enroscado sobre una piedra',expectedSize:[0,0,90],imageDataUrl:image,history:[{role:'user',content:'hola'}]},{OPENAI_API_KEY:'test-key'},fetcher);
 assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(headers.Authorization,'Bearer test-key');assert.ok(!JSON.stringify(sent).includes('test-key'));
 assert.equal(sent.store,false);assert.equal(sent.model,'gpt-6.1-sol');assert.equal(sent.text.format.name,'alfred_figura');assert.equal(sent.text.format.strict,true);
 const content=sent.input.at(-1).content;assert.equal(content[1].image_url,image);assert.equal(JSON.parse(content[0].text).medidasPedidas.alto,90);
 assert.equal(r.sculpt.parts.length,dragon.parts.length);assert.equal(r.finish.texture,'scales');assert.equal(r.finish.depth,.8);
 // Mismo camino desde el servicio que usan la app local y Vercel.
 assert.equal((await designService({action:'sculpt',prompt:'gato'},{OPENAI_API_KEY:'k'},async()=>reply(sculptReply))).sculpt.parts.length,dragon.parts.length);
});

test('el escultor explica los errores sin gastar la API cuando el pedido es inválido',async()=>{
 const never=()=>{throw Error('no debía llamar');};
 await assert.rejects(generateSculpt({prompt:'gato'},{},never),/clave/);
 assert.throws(()=>validateSculptRequest({prompt:''}),/pedido/);
 assert.throws(()=>validateSculptRequest({prompt:'gato',expectedSize:[0,0,900]}),/Medidas/);
 assert.throws(()=>validateSculptRequest({prompt:'gato',imageDataUrl:'https://example.com/a.png'}),/imagen/);
 assert.throws(()=>validateSculptRequest({prompt:'gato',previous:{parts:[]}}),/partes/);
 await assert.rejects(generateSculpt({prompt:'gato'},{OPENAI_API_KEY:'k'},async()=>reply({...sculptReply,sculpt:{parts:[]}})),/figura inválida/);
 await assert.rejects(generateSculpt({prompt:'gato'},{OPENAI_API_KEY:'k'},async()=>({ok:false,status:429,json:async()=>({})})),/límite/);
 await assert.rejects(generateSculpt({prompt:'gato'},{OPENAI_API_KEY:'k'},async()=>{throw Error('red');}),/contactar/);
});

test('el asistente manda las figuras orgánicas al escultor y conserva ese camino al editarlas',async()=>{
 const r={route:'sculpt',canApply:true,forgePrompt:''};assert.equal(routeOf(r,'un dragón'),'sculpt');assert.equal(r.canApply,false);assert.equal(r.forgePrompt,'un dragón');
 let sent;const answer={route:'sculpt',forgePrompt:'Dragoncito enroscado sobre una piedra, 90 mm de alto.',designSource:'current',generation:null,imageReading:'',imageDifferences:'',proportionCheck:'',message:'Te armo un dragoncito de 9 cm.',canApply:false,expectedSize:[0,0,90],params:{}};
 const result=await proposeDesign({prompt:'dragoncito enroscado sobre una piedra, 9 cm',currentEngine:'sculpt'},'k',async(_,init)=>{sent=JSON.parse(init.body);return reply(answer);});
 assert.equal(result.route,'sculpt');assert.deepEqual(result.expectedSize,[0,0,90]);assert.match(result.forgePrompt,/piedra/);
 assert.equal(JSON.parse(sent.input.at(-1).content[0].text).origenPiezaActual,'sculpt');
 assert.ok(sent.text.format.schema.properties.route.enum.includes('sculpt'));assert.match(sent.instructions,/'sculpt': figuras orgánicas/);
});

const paint=(spec,colors)=>({...spec,parts:spec.parts.map(p=>({...p,color:colors[p.name]??''}))});
test('los colores de la figura se reducen a los 4 carretes del AMS y la primera pieza es la base',()=>{
 const p=sculptPalette(validateSculpt(paint(dragon,{piedra:'#777777',cuerpo:'#2E8B57',cola:'#2e8b57',cuello:'#2e8b57',cabeza:'#2e8b57',hocico:'#f0e0a0',cuerno:'#fffff0',ala:'#ff0000',ojo:'#000000'})));
 assert.equal(p.base,'#777777');assert.equal(p.colors.length,4);assert.ok(p.merged);
 assert.equal(p.colorOf.at(-1),'','lo que se talla no lleva color');assert.equal(p.colorOf[1],'#2e8b57');
 assert.equal(p.colorOf[6],p.colorOf[5],'el hueso y el crema se unieron por parecidos');
 assert.equal(sculptPalette(validateSculpt(dragon)),null);
});
test('el dragoncito en colores se separa en partes por color, con el acabado, y exporta un 3MF multicolor',()=>{
 const spec=paint({...dragon,target:[0,0,90]},{piedra:'#808080',cuerpo:'#2e8b57',cola:'#2e8b57',cuello:'#2e8b57',cabeza:'#2e8b57',hocico:'#2e8b57',cuerno:'#f5f0dc',ala:'#2e8b57'});
 const mesh=buildSculpt(api,spec,{resolution:80}),sculpt={...spec,placement:mesh.placement};
 const revision=revisionFromResult({...sculptReply,sculpt,finish:{texture:'scales',smooth:.6,depth:.8,scale:5},created:new Date().toISOString()},'dragoncito');
 const checked=prepareForgeProposal(api,{...defaults,project:'Dragoncito'},{mesh},appendForgeRevision(null,revision));
 assert.equal(checked.candidate.baseColor,'#808080');
 const parts=checked.built.parts;assert.deepEqual(parts.map(x=>x.color).sort(),['#2e8b57','#808080','#f5f0dc']);
 const z=m=>{let lo=Infinity,hi=-Infinity;for(let i=2;i<m.positions.length;i+=m.numProp){lo=Math.min(lo,m.positions[i]);hi=Math.max(hi,m.positions[i]);}return [lo,hi];};
 const stone=parts.find(x=>x.color==='#808080'),body=parts.find(x=>x.color==='#2e8b57'),horn=parts.find(x=>x.color==='#f5f0dc');
 assert.ok(z(stone.mesh)[1]<z(body.mesh)[1],'la piedra queda abajo y el dragón arriba');assert.ok(z(horn.mesh)[0]>70,'los cuernos están en la cabeza');
 assert.ok(Math.abs(z(stone.mesh)[0])<.01,'la base plana es de la piedra');
 // Volver a armar la misma versión usa las zonas guardadas y da las mismas partes.
 assert.equal(buildModel(api,checked.candidate).parts.length,3);
 assert.ok(threeMfBytes(checked.built).length>1000);
});
test('el escultor recibe varias vistas del mismo sujeto, cada una con su nombre',async()=>{
 let sent;const fetcher=async(u,init)=>{sent=JSON.parse(init.body);return reply(sculptReply);};
 const a='data:image/png;base64,iVBORw0KGgo=',b='data:image/jpeg;base64,b3Rybw==';
 await generateSculpt({prompt:'mi perro',imageDataUrls:[a,b],imageNames:['frente.png','perfil.jpg']},{OPENAI_API_KEY:'k'},fetcher);
 const content=sent.input.at(-1).content;
 assert.deepEqual(content.filter(c=>c.type==='input_image').map(c=>c.image_url),[a,b]);assert.equal(content[3].text,'Imagen 2 de 2: perfil.jpg');
 assert.throws(()=>validateSculptRequest({prompt:'gato',imageDataUrls:Array(7).fill(a)}),/hasta 6/);
});
