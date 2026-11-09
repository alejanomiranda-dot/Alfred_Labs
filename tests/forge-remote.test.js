import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runRemoteForge,remoteForgeStatus} from '../server/forge-remote.js';
import {createForgeHandler} from '../api/forge.js';
const scad='$fn=24; difference(){cube([30,20,10]);translate([10,10,-1])cylinder(h=12,d=4);}';
const env={VERCEL:'1',VERCEL_ENV:'preview',ASSISTANT_ACCESS_CODE:'local-test-code',OPENAI_API_KEY:'private-test',FORGE_SANDBOX_SNAPSHOT_ID:'snap-test'};
function fakeSandbox({bad=false,oversize=false}={}){
 const calls=[],bytes=Buffer.alloc(200,1);let stops=0;
 return {calls,get stops(){return stops;},stop:async()=>{stops++;},mkDir:async(...args)=>calls.push(['mkdir',...args]),writeFiles:async(...args)=>calls.push(['write',...args]),runCommand:async(...args)=>{calls.push(['run',...args]);return {exitCode:0};},readFileToBuffer:async({path})=>path.endsWith('.json')?Buffer.from(JSON.stringify(bad?{ok:false,code:'compile_failed',error:'No se pudo compilar.'}:{ok:true,files:{stl:oversize?2000000:bytes.length,'3mf':bytes.length}})):bytes};
}
test('remoto: VM efímera sin red ni secretos; solo la VM ejecuta OpenSCAD y siempre se detiene',async()=>{
 const sandbox=fakeSandbox();let options;
 const read=sandbox.readFileToBuffer;sandbox.readFileToBuffer=async options=>options.path.endsWith('.json')?Buffer.from(JSON.stringify({ok:true,files:{stl:200},compiler:{backend:'manifold'}})):read(options);
 const result=await runRemoteForge({action:'compile',scad},{env,createSandbox:async o=>{options=o;return sandbox;}});
 assert.deepEqual(result.compiler,{backend:'manifold'});
 assert.equal(options.networkPolicy,'deny-all');assert.equal(options.persistent,false);assert.equal(options.resources.vcpus,1);assert.deepEqual(options.env,{});assert.equal(options.source.snapshotId,'snap-test');assert.equal(sandbox.stops,1);
 assert.equal(JSON.stringify(options).includes('private-test'),false);assert.equal(result.remote,true);assert.ok(result.files.stl);
 const writes=sandbox.calls.find(c=>c[0]==='write')[1];assert.equal(writes[0].content.toString(),scad);assert.ok(writes[1].path.endsWith('worker.mjs'));
 assert.ok(sandbox.calls.some(c=>c[0]==='run'&&c[1]==='node'&&c[2][0].endsWith('worker.mjs')));
});
test('remoto: error de compilación, archivo excesivo y error de proveedor limpian la VM',async()=>{
 for(const config of [{bad:true},{oversize:true}]){const s=fakeSandbox(config);await assert.rejects(()=>runRemoteForge({action:'compile',scad},{env,createSandbox:async()=>s}));assert.equal(s.stops,1);}
 const s=fakeSandbox();await assert.rejects(()=>runRemoteForge({action:'generate',prompt:'Pieza'},{env,createSandbox:async()=>s,fetcher:async()=>({ok:false,status:401,json:async()=>({error:{message:'private-test'}})})}),e=>!e.message.includes('private-test'));
 assert.equal(s.stops,1);
});
test('remoto: abortar detiene la VM y no aplica resultados; producción cerrada por defecto',async()=>{
 assert.equal(remoteForgeStatus({...env,VERCEL_ENV:'production'}).enabled,false);
 await assert.rejects(()=>runRemoteForge({action:'compile',scad},{env:{...env,VERCEL_ENV:'production'}}),e=>e.code==='remote_disabled');
 const ac=new AbortController(),s=fakeSandbox();s.runCommand=async()=>{ac.abort();ac.signal.throwIfAborted();};
 await assert.rejects(()=>runRemoteForge({action:'compile',scad},{env,signal:ac.signal,createSandbox:async()=>s}),e=>e.code==='canceled');assert.ok(s.stops>=1);
});
async function call(handler,{method='POST',headers={},body={action:'compile',scad}}={}){
 let status,data;const res={setHeader(){},status(v){status=v;return this;},json(v){data=v;return this;}};
 await handler({method,headers:{host:'preview.test',origin:'https://preview.test','content-type':'application/json','x-real-ip':'1.1.1.1',...headers},body},res);return {status,data};
}
test('API remota: sin código; origen/JSON y cuota se comprueban antes de crear una VM o gastar API',async()=>{
 let runs=0;const handler=createForgeHandler({env,run:async()=>{runs++;return {ok:true};}});
 const status=await call(handler,{method:'GET'});assert.equal(status.data.remote,true);assert.equal(JSON.stringify(status.data).includes('private-test'),false);
 assert.equal(status.data.needsCode,false);
 assert.equal((await call(handler,{headers:{origin:'https://evil.test'}})).status,403);
 assert.equal((await call(handler,{headers:{'content-type':'text/plain'}})).status,415);
 assert.equal((await call(handler,{body:'{bad'})).status,400);
 assert.equal((await call(handler,{body:{action:'compile',scad:'x'.repeat(100001)}})).status,413);
 assert.equal(runs,0);
 for(let i=0;i<20;i++)assert.equal((await call(handler)).status,200);
 assert.equal((await call(handler)).status,429);assert.equal(runs,20);
});
