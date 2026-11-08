import {Sandbox} from '@vercel/sandbox';
import fs from 'node:fs/promises';
import {validateForgeRequest,generateForgeSource} from './forge.js';
import {forgeSnapshotId} from './forge-sandbox-config.js';
const worker=()=>fs.readFile(new URL('./forge-worker.mjs',import.meta.url));
const fail=(message,status=503,code='sandbox_unavailable')=>Object.assign(Error(message),{status,code});
export function remoteForgeStatus(env=process.env){
 const enabled=env.VERCEL_ENV==='preview'||env.FORGE_REMOTE_ENABLED==='true';
 return {local:false,remote:true,enabled,compiler:enabled,ai:enabled&&!!env.OPENAI_API_KEY,needsCode:false,sample:true,maxSecondsPerFormat:60};
}
export async function runRemoteForge(raw,{env=process.env,signal,createSandbox=options=>Sandbox.create(options),fetcher}={}){
 const body=validateForgeRequest(raw);
 if(!remoteForgeStatus(env).enabled)throw fail('Forge en línea está habilitado en la versión de prueba.',503,'remote_disabled');
 const snapshotId=env.FORGE_SANDBOX_SNAPSHOT_ID||forgeSnapshotId;
 if(!snapshotId)throw fail('Falta preparar el compilador aislado.');
 let sandbox;
 try{
  sandbox=await createSandbox({source:{type:'snapshot',snapshotId},persistent:false,networkPolicy:'deny-all',resources:{vcpus:1},timeout:230000,env:{},signal});
  // Stop on disconnect independently of the command promise. Never pass the canceled signal to cleanup.
  const stop=()=>{sandbox.stop().catch(()=>{});};signal?.addEventListener('abort',stop,{once:true});
  try{
   signal?.throwIfAborted();
   const check=await sandbox.runCommand('/usr/bin/openscad',['--version'],{signal,timeoutMs:5000});
   if(check.exitCode!==0)throw fail('El compilador aislado no está disponible.');
   let result;
   if(body.action==='example')result={scad:await fs.readFile(new URL('../experiments/alfred-forge/examples/arbol-vero-ale.scad',import.meta.url),'utf8'),description:'Árbol con VERO, ALE y corazón · 78 × 78 × 140 mm.',assumptions:['Monocolor; muestra compilada en una máquina aislada, sin API de IA.'],caveats:['Revisar el laminado en Bambu Studio.']};
   else if(body.action==='compile')result={scad:body.scad,description:'Versión recompilada en línea.',assumptions:[],caveats:[]};
   else result=await generateForgeSource(body,env,{signal,fetcher});
   await sandbox.mkDir('/vercel/sandbox/forge',{signal});
   await sandbox.writeFiles([{path:'/vercel/sandbox/forge/piece.scad',content:Buffer.from(result.scad)},{path:'/vercel/sandbox/forge/worker.mjs',content:await worker()}],{signal});
   await sandbox.runCommand('node',['/vercel/sandbox/forge/worker.mjs'],{signal,timeoutMs:125000});
   const report=await sandbox.readFileToBuffer({path:'/vercel/sandbox/forge/result.json'},{signal});
   if(!report||report.length>4096)throw fail('La compilación no devolvió un resultado válido.',422,'compile_failed');
   const data=JSON.parse(report.toString());
   if(!data.ok)throw fail(data.error||'No se pudo construir la pieza.',422,data.code||'compile_failed');
   const files={};
   for(const ext of ['stl','3mf']){
    if(!Number.isInteger(data.files?.[ext])||data.files[ext]<100||data.files[ext]>=1024*1024)throw fail('La pieza tiene demasiados detalles para la prueba en línea.',422,'compile_size');
    const bytes=await sandbox.readFileToBuffer({path:'/vercel/sandbox/forge/piece.'+ext},{signal});
    if(!bytes||bytes.length!==data.files[ext])throw fail('El archivo compilado está incompleto.',422,'compile_failed');
    files[ext]=bytes.toString('base64');
   }
   return {...result,files,created:new Date().toISOString(),remote:true};
  }finally{signal?.removeEventListener('abort',stop);}
 }catch(e){
  if(signal?.aborted)throw fail('Generación detenida. Tu pieza se conservó.',499,'canceled');
  if(e.status)throw e;
  throw fail('No se pudo completar la compilación aislada. Intentá de nuevo o usá la versión local.');
 }finally{if(sandbox)await sandbox.stop();}
}
