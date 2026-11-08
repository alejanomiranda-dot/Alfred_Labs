import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/assistant.js';
const call=async({method='POST',headers={},body={prompt:'x'}}={})=>{let status,data;const res={setHeader(){},status(s){status=s;return this;},json(d){data=d;return this;}};await handler({method,headers:{host:'alfred.test',origin:'https://alfred.test','content-type':'application/json','x-real-ip':'1.1.1.1',...headers},body},res);return {status,data};};
test('guía sin código: estado y pedidos no dependen de ASSISTANT_ACCESS_CODE; origen se valida',async()=>{
 process.env.VERCEL='1';delete process.env.OPENAI_API_KEY;delete process.env.ASSISTANT_ACCESS_CODE;
 const status=await call({method:'GET'});assert.equal(status.data.needsCode,false);
 assert.equal((await call({headers:{origin:'https://otro.sitio'}})).status,403);
 assert.equal((await call({headers:{'content-type':'text/plain'}})).status,415);
 const result=await call();assert.equal(result.status,503);assert.match(result.data.error,/clave/);
 // A legacy server variable does not turn the code gate back on.
 process.env.ASSISTANT_ACCESS_CODE='legacy-value';
 assert.equal((await call({method:'GET'})).data.needsCode,false);
 assert.equal((await call()).status,503);
});
