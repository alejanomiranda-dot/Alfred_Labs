import {proposeDesign} from '../server/assistant.js';
export const config={maxDuration:60};
// Usage limits remain in place; the app does not require an access code.
let active=0;
const usage=new Map(),hour=3600e3,maxRequests=120;
function count(map,key,now){const list=(map.get(key)||[]).filter(t=>now-t<hour);map.set(key,list);return list;}
export default async function handler(req,res){
 const send=(status,data)=>res.status(status).json(data);
 res.setHeader('Cache-Control','no-store');
 if(req.method==='GET')return send(200,{enabled:Boolean(process.env.OPENAI_API_KEY),needsCode:false,provider:'OpenAI'});
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return send(405,{error:'Método no permitido.'});}
 if(!process.env.VERCEL)return send(503,{error:'Este endpoint requiere el entorno de Vercel.'});
 const origin=req.headers.origin,host=req.headers['x-forwarded-host']||req.headers.host;
 if(!origin||origin!=='https://'+host)return send(403,{error:'Solicitud de otro origen no permitida.'});
 const ip=String(req.headers['x-real-ip']||req.headers['x-forwarded-for']||'').split(',')[0].trim()||'desconocido',now=Date.now();
 if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'Se requiere JSON.'});
 if(count(usage,ip,now).length>=maxRequests)return send(429,{error:'Se alcanzó el límite de pedidos de esta hora. Probá más tarde.'});
 if(active>=2)return send(429,{error:'El asistente está ocupado. Intentá en unos segundos.'});
 usage.get(ip).push(now);active++;
 const controller=new AbortController();res.on?.('close',()=>{if(!res.writableEnded)controller.abort();});
 try{const body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!body||JSON.stringify(body).length>1200000)return send(413,{error:'Pedido demasiado grande.'});return send(200,await proposeDesign(body,process.env.OPENAI_API_KEY,fetch,{signal:controller.signal}));}
 catch(error){return send(error.status||500,{error:error.name==='TimeoutError'?'La solicitud tardó demasiado. Intentá nuevamente.':error.status?error.message:'No se pudo preparar una propuesta.'});}
 finally{active--;}
}
