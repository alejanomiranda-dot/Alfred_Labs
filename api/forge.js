import {remoteForgeStatus,runRemoteForge} from '../server/forge-remote.js';
export const config={maxDuration:300};
export function createForgeHandler({env=process.env,run=runRemoteForge,now=Date.now}={}){
 let active=0;const usage=new Map();
 const bucket=(map,key,time)=>{if(map.size>1000)for(const [ip,list] of map)if(!list.some(t=>time-t<3600000))map.delete(ip);const list=(map.get(key)||[]).filter(t=>time-t<3600000);map.set(key,list);return list;};
 return async function handler(req,res){
  const send=(status,data)=>res.status(status).json(data);
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const status=remoteForgeStatus(env);
  if(req.method==='GET')return send(200,status);
  if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return send(405,{error:'Método no permitido.'});}
  if(!env.VERCEL||!status.enabled)return send(503,{error:'Forge en línea todavía no está habilitado.'});
  const host=req.headers['x-forwarded-host']||req.headers.host;
  if(!host||req.headers.origin!=='https://'+host)return send(403,{error:'Solicitud de otro origen no permitida.'});
  const ip=String(req.headers['x-real-ip']||'unknown'),time=now();
  if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')return send(415,{error:'Se requiere JSON.'});
  let body;try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return send(400,{error:'JSON inválido.'});}
  if(!body||Buffer.byteLength(JSON.stringify(body))>100000)return send(413,{error:'Pedido demasiado grande.'});
  const used=bucket(usage,ip,time);
  if(used.length>=20)return send(429,{error:'Se alcanzó el límite de 20 pedidos por hora. Probá más tarde.'});
  if(active>=1)return send(429,{error:'Forge está ocupado. Intentá en unos segundos.'});
  used.push(time);active++;const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),290000);res.on?.('close',()=>{if(!res.writableEnded)controller.abort();});
  try{return send(200,await run(body,{env,signal:controller.signal}));}
  catch(e){return send(e.status||500,{error:e.status?e.message:'No se pudo completar la propuesta.',code:e.code||'forge_error'});}
  finally{clearTimeout(timer);active--;}
 };
}
export default createForgeHandler();
