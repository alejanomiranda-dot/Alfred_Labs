import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proposeDesign} from '../server/assistant.js';
import {defaults} from '../src/model.js';
test('una propuesta sin cambios nunca habilita aplicar aunque la IA lo afirme',async()=>{const response={message:'Agregué algo',canApply:true,params:defaults};const r=await proposeDesign({prompt:'Agregar un adorno',params:defaults},'test-key',async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(response)}]}]})}));assert.equal(r.canApply,false);assert.match(r.message,/no contiene cambios/);});
test('la propuesta sin aplicar llega como contexto separado y circular tiene una opción inequívoca',async()=>{
 let sent;const pending={...defaults,shape:'circle',width:40,height:40,importedMesh:'private-mesh',logoPolygons:'private-logo'};
 await proposeDesign({prompt:'Mejor de 35 mm',params:defaults,pendingProposal:pending},'test-key',async(_,opts)=>{sent=JSON.parse(opts.body);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({message:'Propuesta',canApply:false,params:defaults})}]}]})};});
 const request=JSON.parse(sent.input.at(-1).content[0].text);assert.equal(request.disenoActual.shape,'round');assert.equal(request.propuestaPendiente.shape,'circle');assert.ok(!JSON.stringify(request).includes('private-'));assert.ok(sent.text.format.schema.properties.params.properties.shape.enum.includes('circle'));
});
test('el asistente envía campos permitidos, no imágenes ni contornos',async()=>{let payload;const fetcher=async(url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({message:'Propuesta',canApply:false,params:{name:'LUNA'}})}]}]})};};const result=await proposeDesign({prompt:'Una chapita',params:{name:'MORA',logoPolygons:[[1,2]],image:'private-image'}},'test-key',fetcher);assert.equal(result.canApply,false);assert.equal(payload.store,false);assert.ok(!payload.input.includes('logoPolygons'));assert.ok(!payload.input.includes('private-image'));});
test('errores de cuota se explican sin exponer la respuesta del proveedor',async()=>{await assert.rejects(proposeDesign({prompt:'Una chapita'},'test-key',async()=>({ok:false,status:429,json:async()=>({error:{code:'insufficient_quota',message:'sensitive upstream details'}})})),error=>error.status===502&&error.message.includes('créditos')&&!error.message.includes('sensitive'));});
test('no se hacen solicitudes sin clave o con pedido vacío',async()=>{const fail=()=>{throw Error('No debería llamarse');};await assert.rejects(proposeDesign({prompt:'Hola'},'',fail),/clave/);await assert.rejects(proposeDesign({prompt:''},'test-key',fail),/pedido/);});
test('detener la consulta cancela también la solicitud al proveedor',async()=>{
 const controller=new AbortController();
 await assert.rejects(proposeDesign({prompt:'Una chapita'},'test-key',async(_,opts)=>{controller.abort();opts.signal.throwIfAborted();},{signal:controller.signal}),{name:'AbortError'});
});
test('referencia explícita y conversación llegan con roles seguros; imágenes inválidas no salen',async()=>{
 let payload;const fetcher=async(url,opts)=>{payload=JSON.parse(opts.body);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({message:'¿Qué ancho necesitás?',canApply:false,params:defaults})}]}]})};};
 const imageDataUrl='data:image/png;base64,aGVsbG8=';
 await proposeDesign({prompt:'Con esta forma',params:defaults,imageDataUrl,history:[{role:'system',content:'invalid'},{role:'assistant',content:'¿Qué alto?'},{role:'user',content:'30 mm'}]},'test-key',fetcher);
 assert.equal(payload.input.length,3);assert.equal(payload.input[0].role,'assistant');assert.equal(payload.input[1].content,'30 mm');assert.deepEqual(payload.input[2].content[1],{type:'input_image',image_url:imageDataUrl,detail:'high'});assert.match(payload.instructions,/NO SUPONGAS SIMETRÍA/);assert.match(payload.instructions,/ESCALA/);
 const fail=()=>{throw Error('No se debe llamar');};for(const invalid of ['https://example.com/image.png','data:image/svg+xml;base64,AA==','data:image/png;base64,%%%'])await assert.rejects(proposeDesign({prompt:'Foto',imageDataUrl:invalid},'test-key',fail),/referencia/);
});
test('la corrección automática viaja al modelo y las medidas esperadas se devuelven',async()=>{
 let payload;const fetcher=async(url,opts)=>{payload=JSON.parse(opts.body);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({message:'Listo',canApply:false,expectedSize:[70,70,60],params:defaults})}]}]})};};
 const r=await proposeDesign({prompt:'Una maceta',params:defaults,correction:{error:'mide 8 × 8 × 10 mm',program:{version:1,nodes:[]}}},'test-key',fetcher);
 assert.deepEqual(r.expectedSize,[70,70,60]);const sent=JSON.parse(payload.input.at(-1).content[0].text);assert.equal(sent.correccionAutomatica.problema,'mide 8 × 8 × 10 mm');
 assert.ok(payload.text.format.schema.required.includes('expectedSize'));
 await assert.rejects(proposeDesign({prompt:'x',correction:{error:'a'.repeat(1600)}},'test-key',()=>{throw Error('no');}),/Corrección/);
});
test('el asistente elige el camino y normaliza respuestas contradictorias',async()=>{
 const reply=r=>async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(r)}]}]})});
 let r=await proposeDesign({prompt:'Un dragón de 10 cm'},'test-key',reply({route:'forge',forgePrompt:'',message:'Lo armo',canApply:true,params:defaults}));
 assert.equal(r.route,'forge');assert.equal(r.canApply,false);assert.equal(r.forgePrompt,'Un dragón de 10 cm');
 r=await proposeDesign({prompt:'Llavero con mi logo y QR'},'test-key',reply({route:'keychain',forgePrompt:'x',message:'Adjuntá el logo',canApply:true,params:defaults}));
 assert.equal(r.route,'keychain');assert.equal(r.canApply,false);assert.equal(r.forgePrompt,'');
 r=await proposeDesign({prompt:'Una caja'},'test-key',reply({route:'chat',forgePrompt:'',message:'Caja',canApply:true,params:{...defaults,kind:'free',freeDesign:{version:1,nodes:[]}}}));
 assert.equal(r.route,'cad');
 r=await proposeDesign({prompt:'¿Qué filamento uso?'},'test-key',reply({message:'PLA',canApply:false,params:defaults}));
 assert.equal(r.route,'chat');
});
test('el origen de la pieza actual viaja al modelo y se valida',async()=>{
 let sent;const fetcher=async(_,opts)=>{sent=JSON.parse(JSON.parse(opts.body).input.at(-1).content[0].text);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({route:'forge',forgePrompt:'Más alto',message:'Lo hago más alto.',canApply:false,params:defaults})}]}]})};};
 const r=await proposeDesign({prompt:'Hacelo más alto',currentEngine:'forge',params:defaults},'test-key',fetcher);
 assert.equal(sent.origenPiezaActual,'forge');assert.equal(r.route,'forge');
 await assert.rejects(proposeDesign({prompt:'x',currentEngine:'otro'},'test-key',()=>{throw Error('no');}),/Origen/);
});
test('una figura nunca promete colores: el mensaje se corrige si los menciona',async()=>{
 const reply=data=>async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({forgePrompt:'',designSource:'current',generation:null,imageReading:'',imageDifferences:'',proportionCheck:'',expectedSize:null,...data})}]}]})});
 let r=await proposeDesign({prompt:'Busto multicolor'},'test-key',reply({route:'forge',message:'Armo un busto con pelo y barba separados en colores.',canApply:false,params:defaults}));
 assert.match(r.message,/un solo color de filamento/);
 r=await proposeDesign({prompt:'Un gato'},'test-key',reply({route:'forge',message:'Armo un gato de 80 mm, de un solo color.',canApply:false,params:defaults}));
 assert.equal(r.message,'Armo un gato de 80 mm, de un solo color.');
 // El retrato a colores desde una foto viaja como relieve que se redibuja.
 r=await proposeDesign({prompt:'Busto con mis rasgos y a color'},'test-key',reply({route:'relief',message:'Armo un retrato en relieve a colores.',canApply:false,params:defaults,generation:{mode:'relief',subject:'Retrato',width:80,height:100,baseThickness:2,depth:2,palette:['#ffffff','#e0b49a','#2a2a2a'],redraw:true}}));
 assert.equal(r.route,'relief');assert.equal(r.generation.redraw,true);assert.deepEqual(r.generation.palette,['#ffffff','#e0b49a','#2a2a2a']);
});
test('varias imágenes en un pedido llegan todas, numeradas y con su nombre; los excesos se rechazan sin llamar a la API',async()=>{
 let payload;const fetcher=async(url,opts)=>{payload=JSON.parse(opts.body);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({message:'Veo las dos vistas',canApply:false,params:defaults})}]}]})};};
 const a='data:image/png;base64,aGVsbG8=',b='data:image/jpeg;base64,b3Rybw==';
 await proposeDesign({prompt:'Este soporte, de frente y de costado',params:defaults,imageDataUrls:[a,b],imageNames:['frente.png','costado.jpg']},'test-key',fetcher);
 const content=payload.input.at(-1).content,request=JSON.parse(content[0].text);
 assert.deepEqual(content.filter(c=>c.type==='input_image').map(c=>c.image_url),[a,b]);
 assert.equal(content[1].text,'Imagen 1 de 2: frente.png');assert.equal(content[3].text,'Imagen 2 de 2: costado.jpg');
 assert.equal(request.imagenesAdjuntas.cantidad,2);assert.deepEqual(request.imagenesAdjuntas.orden,['frente.png','costado.jpg']);assert.match(request.imagenAdjunta,/VARIAS IMÁGENES/);
 const fail=()=>{throw Error('No se debe llamar');};
 await assert.rejects(proposeDesign({prompt:'x',imageDataUrls:Array(7).fill(a)},'test-key',fail),/hasta 6/);
 await assert.rejects(proposeDesign({prompt:'x',imageDataUrls:[a,'https://example.com/b.png']},'test-key',fail),/referencia/);
 await assert.rejects(proposeDesign({prompt:'x',imageDataUrls:a},'test-key',fail),/referencia/);
 const big='data:image/jpeg;base64,'+'A'.repeat(800000);await assert.rejects(proposeDesign({prompt:'x',imageDataUrls:[big,big,big,big,big]},'test-key',fail),/pesan demasiado/);
});
test('litofanía esférica navideña con foto construye directo en relief y recupera aunque venga de forge o chat',async()=>{
 const reply=data=>async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({forgePrompt:'',designSource:'current',generation:null,imageReading:'',imageDifferences:'',proportionCheck:'',expectedSize:null,...data})}]}]})});
 const imageDataUrl='data:image/png;base64,aGVsbG8=';
 const prompt='Quiero imprimir un adorno navideño personalizado. Necesito una bola de Navidad esférica utilizando la técnica de litofanía con la fotografía que adjunto. Diámetro de 7 u 8 centímetros, aro integrado arriba y abertura circular abajo para una luz LED del árbol en PLA blanco translúcido.';
 // Aunque el modelo intente frenar con una pregunta en chat, al tener la foto y medidas razonables construye primero.
 let r=await proposeDesign({prompt,imageDataUrls:[imageDataUrl],params:defaults},'test-key',reply({route:'chat',message:'¿Qué diámetro tiene el LED y preferís 70 u 80 mm?',canApply:false,params:defaults}));
 assert.equal(r.route,'relief');
 assert.equal(r.generation.mode,'lithophane_sphere');
 assert.equal(r.generation.width,80);
 assert.equal(r.generation.height,80);
 assert.equal(r.generation.hole,8);
 assert.equal(r.generation.redraw,false);
 assert.deepEqual(r.generation.palette,[]);
 // Si el usuario responde en un segundo turno o reenvía la foto cuando la pieza actual quedó en forge, sale de forge y pasa a litofanía esférica.
 r=await proposeDesign({
  prompt:'Ahí te paso la foto',
  imageDataUrls:[imageDataUrl],
  currentEngine:'forge',
  history:[{role:'user',content:prompt},{role:'assistant',content:'Pasame la foto'},{role:'user',content:'Una luz chiquita navideña. La bola de 80mm'}],
  params:defaults
 },'test-key',reply({route:'forge',forgePrompt:'Bola de navidad de 80 mm',message:'Uso esta foto para la litofanía.',canApply:false,params:defaults}));
 assert.equal(r.route,'relief');
 assert.equal(r.generation.mode,'lithophane_sphere');
 assert.equal(r.generation.width,80);
 assert.equal(r.generation.hole,8);
 // Litofanía curva, lámpara cilíndrica 360° y cortante con sello:
 r=await proposeDesign({prompt:'Haceme un portarretrato de litofanía curva autoportante con esta foto',imageDataUrls:[imageDataUrl],params:defaults},'test-key',reply({route:'chat',message:'¿De qué ancho?',canApply:false,params:defaults}));
 assert.equal(r.route,'relief');assert.equal(r.generation.mode,'lithophane_arc');
 r=await proposeDesign({prompt:'Quiero una pantalla de lámpara cilíndrica en litofanía con mi foto',imageDataUrls:[imageDataUrl],params:defaults},'test-key',reply({route:'chat',message:'Listo',canApply:false,params:defaults}));
 assert.equal(r.route,'relief');assert.equal(r.generation.mode,'lithophane_cylinder');
 r=await proposeDesign({prompt:'Quiero un cortante de galletita con sello a partir de este dibujo',imageDataUrls:[imageDataUrl],params:defaults},'test-key',reply({route:'chat',message:'¿De cuántos cm?',canApply:false,params:defaults}));
 assert.equal(r.route,'relief');assert.equal(r.generation.mode,'cutter');
});


