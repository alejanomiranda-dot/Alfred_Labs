import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {forgePlugin} from '../server/forge-plugin.js';
test('endpoint local: muestra sin OpenSCAD, validación HTTP y rechazo de otros orígenes/hosts',async()=>{
 let middleware;forgePlugin({OPENSCAD_BIN:'/missing-openscad',OPENAI_API_KEY:'private-test'}).configureServer({middlewares:{use:fn=>{middleware=fn;}}});
 const server=http.createServer((req,res)=>middleware(req,res,()=>{res.statusCode=404;res.end();}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port,url=origin+'/api/forge';
 const post=(body,headers={})=>fetch(url,{method:'POST',headers:{origin,'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
 try{
  const status=await (await fetch(url)).json();assert.equal(status.compiler,false);assert.equal(status.ai,true);assert.ok(!JSON.stringify(status).includes('private-test'));
  assert.equal((await post({action:'example'},{origin:'https://evil.test'})).status,403);
  const wrongHost=await new Promise((resolve,reject)=>{const req=http.request(url,{method:'POST',headers:{Host:'evil.test',Origin:origin,'Content-Type':'application/json'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end(JSON.stringify({action:'example'}));});
  assert.equal(wrongHost,403);
  assert.equal((await post({action:'example'},{'x-forwarded-for':'1.2.3.4'})).status,403);
  assert.equal((await post({action:'example'},{'Content-Type':'text/plain'})).status,415);
  assert.equal((await post('{broken')).status,400);
  assert.equal((await post({action:'unknown'})).status,400);
  assert.equal((await post({action:'compile',scad:'bad'})).status,400);
  assert.equal((await post('x'.repeat(100001))).status,413);
  assert.equal((await fetch(url,{method:'DELETE'})).status,405);
  const response=await post({action:'example'});assert.equal(response.status,200);const data=await response.json();assert.equal(data.precompiled,true);assert.ok(data.files.stl.length>1000);assert.ok(data.caveats.some(s=>s.includes('precompilada')));
  assert.equal((await fetch(origin+'/api/forge-other')).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
