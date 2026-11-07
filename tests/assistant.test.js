import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proposeDesign} from '../server/assistant.js';
import {defaults} from '../src/model.js';
test('una propuesta sin cambios nunca habilita aplicar aunque la IA lo afirme',async()=>{const response={message:'Agregué algo',canApply:true,params:defaults};const r=await proposeDesign({prompt:'Agregar un adorno',params:defaults},'test-key',async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(response)}]}]})}));assert.equal(r.canApply,false);assert.match(r.message,/no contiene cambios/);});
test('el asistente envía campos permitidos, no imágenes ni contornos',async()=>{let payload;const fetcher=async(url,options)=>{payload=JSON.parse(options.body);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({message:'Propuesta',canApply:false,params:{name:'LUNA'}})}]}]})};};const result=await proposeDesign({prompt:'Una chapita',params:{name:'MORA',logoPolygons:[[1,2]],image:'private-image'}},'test-key',fetcher);assert.equal(result.canApply,false);assert.equal(payload.store,false);assert.ok(!payload.input.includes('logoPolygons'));assert.ok(!payload.input.includes('private-image'));});
test('errores de cuota se explican sin exponer la respuesta del proveedor',async()=>{await assert.rejects(proposeDesign({prompt:'Una chapita'},'test-key',async()=>({ok:false,status:429,json:async()=>({error:{code:'insufficient_quota',message:'sensitive upstream details'}})})),error=>error.status===502&&error.message.includes('créditos')&&!error.message.includes('sensitive'));});
test('no se hacen solicitudes sin clave o con pedido vacío',async()=>{const fail=()=>{throw Error('No debería llamarse');};await assert.rejects(proposeDesign({prompt:'Hola'},'',fail),/clave/);await assert.rejects(proposeDesign({prompt:''},'test-key',fail),/pedido/);});
test('referencia explícita y conversación llegan con roles seguros; imágenes inválidas no salen',async()=>{
 let payload;const fetcher=async(url,opts)=>{payload=JSON.parse(opts.body);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({message:'¿Qué ancho necesitás?',canApply:false,params:defaults})}]}]})};};
 const imageDataUrl='data:image/png;base64,aGVsbG8=';
 await proposeDesign({prompt:'Con esta forma',params:defaults,imageDataUrl,history:[{role:'system',content:'invalid'},{role:'assistant',content:'¿Qué alto?'},{role:'user',content:'30 mm'}]},'test-key',fetcher);
 assert.equal(payload.input.length,3);assert.equal(payload.input[0].role,'assistant');assert.equal(payload.input[1].content,'30 mm');assert.deepEqual(payload.input[2].content[1],{type:'input_image',image_url:imageDataUrl,detail:'auto'});
 const fail=()=>{throw Error('No se debe llamar');};for(const invalid of ['https://example.com/image.png','data:image/svg+xml;base64,AA==','data:image/png;base64,%%%'])await assert.rejects(proposeDesign({prompt:'Foto',imageDataUrl:invalid},'test-key',fail),/referencia/);
});
test('la corrección automática viaja al modelo y las medidas esperadas se devuelven',async()=>{
 let payload;const fetcher=async(url,opts)=>{payload=JSON.parse(opts.body);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({message:'Listo',canApply:false,expectedSize:[70,70,60],params:defaults})}]}]})};};
 const r=await proposeDesign({prompt:'Una maceta',params:defaults,correction:{error:'mide 8 × 8 × 10 mm',program:{version:1,nodes:[]}}},'test-key',fetcher);
 assert.deepEqual(r.expectedSize,[70,70,60]);const sent=JSON.parse(payload.input.at(-1).content[0].text);assert.equal(sent.correccionAutomatica.problema,'mide 8 × 8 × 10 mm');
 assert.ok(payload.text.format.schema.required.includes('expectedSize'));
 await assert.rejects(proposeDesign({prompt:'x',correction:{error:'a'.repeat(1600)}},'test-key',()=>{throw Error('no');}),/Corrección/);
});
