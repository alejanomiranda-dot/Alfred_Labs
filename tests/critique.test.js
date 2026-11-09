import {test} from 'node:test';
import assert from 'node:assert/strict';
import {critiqueDesign,validateCritique} from '../server/critique.js';
const image='data:image/jpeg;base64,/9j/AA==';
test('la revisión visual envía las vistas y normaliza la nota',async()=>{
 let sent;const fetcher=async(_,init)=>{sent=JSON.parse(init.body);return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({recognizable:true,score:14,fixes:'x'.repeat(900),verdict:'Se reconoce el búho'})}]}]})};};
 const r=await critiqueDesign({subject:'Un búho de 60 mm',images:[image,image,image]},{OPENAI_API_KEY:'test-key'},fetcher);
 assert.equal(r.score,10);assert.equal(r.fixes.length,800);assert.equal(sent.input[0].content.filter(c=>c.type==='input_image').length,3);assert.equal(sent.store,false);assert.equal(sent.model,'gpt-6.1-sol');
});
test('la revisión visual rechaza vistas inválidas sin llamar a la API',async()=>{
 assert.throws(()=>validateCritique({subject:'x',images:[]}),/vistas/);
 assert.throws(()=>validateCritique({subject:'x',images:['https://example.com/a.png']}),/Vista/);
 await assert.rejects(critiqueDesign({subject:'x',images:[image]},{},()=>{throw Error('no');}),/clave/);
});
