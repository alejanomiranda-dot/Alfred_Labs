import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler,{validCode} from '../api/assistant.js';
const call=async({method='POST',headers={},body={prompt:'x'}}={})=>{let status,data;const res={setHeader(){},status(s){status=s;return this;},json(d){data=d;return this;}};await handler({method,headers:{host:'alfred.test',origin:'https://alfred.test','content-type':'application/json','x-real-ip':headers.ip||'1.1.1.1',...headers},body},res);return {status,data};};
test('sitio abierto: sin código correcto la guía no gasta la clave de OpenAI',async()=>{
 process.env.VERCEL='1';delete process.env.OPENAI_API_KEY;delete process.env.ASSISTANT_ACCESS_CODE;
 assert.equal((await call()).status,503);
 process.env.ASSISTANT_ACCESS_CODE='codigo-de-prueba';
 assert.deepEqual((await call({method:'GET'})).data.needsCode,true);
 assert.equal((await call()).status,401);
 assert.equal((await call({headers:{'x-access-code':'otro-codigo'}})).status,401);
 assert.equal((await call({headers:{'x-access-code':'codigo-de-prueba',origin:'https://otro.sitio'}})).status,403);
 const ok=await call({headers:{'x-access-code':'codigo-de-prueba'}});assert.equal(ok.status,503);assert.match(ok.data.error,/clave/);
 for(let i=0;i<10;i++)await call({headers:{ip:'9.9.9.9','x-access-code':'mal'}});
 assert.equal((await call({headers:{ip:'9.9.9.9','x-access-code':'codigo-de-prueba'}})).status,429);
 assert.equal(validCode('corto','corto'),false);
});
