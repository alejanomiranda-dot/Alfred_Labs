import {timingSafeEqual,createHash} from 'node:crypto';
import {designService} from '../server/design-service.js';
export const config={maxDuration:180};
// The site is public: only people with the access code (ASSISTANT_ACCESS_CODE) can spend the OpenAI key.
// Without that variable the assistant stays closed. Limits are per server instance; the OpenAI monthly cap is the hard stop.
let active=0;
const failures=new Map(),usage=new Map(),hour=3600e3,maxFailures=10,maxRequests=120;
const digest=v=>createHash('sha256').update(String(v)).digest();
export function validCode(given,expected){return typeof given==='string'&&typeof expected==='string'&&expected.length>=8&&timingSafeEqual(digest(given),digest(expected));}
function count(map,key,now){const list=(map.get(key)||[]).filter(t=>now-t<hour);map.set(key,list);return list;}
export default async function handler(req,res){
 const send=(status,data)=>res.status(status).json(data);
 res.setHeader('Cache-Control','no-store');
 const code=process.env.ASSISTANT_ACCESS_CODE;
 if(req.method==='GET')return send(200,{enabled:Boolean(process.env.OPENAI_API_KEY&&code),needsCode:true,provider:'OpenAI'});
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return send(405,{error:'Método no permitido.'});}
 if(!process.env.VERCEL)return send(503,{error:'Este endpoint requiere el entorno de Vercel.'});
 if(!code||code.length<8)return send(503,{error:'El código de acceso del asistente no está configurado en el servidor.'});
 const origin=req.headers.origin,host=req.headers['x-forwarded-host']||req.headers.host;
 if(!origin||origin!=='https://'+host)return send(403,{error:'Solicitud de otro origen no permitida.'});
 const ip=String(req.headers['x-real-ip']||req.headers['x-forwarded-for']||'').split(',')[0].trim()||'desconocido',now=Date.now();
 if(count(failures,ip,now).length>=maxFailures)return send(429,{error:'Demasiados intentos con un código incorrecto. Esperá una hora.'});
 if(!validCode(req.headers['x-access-code'],code)){failures.get(ip).push(now);return send(401,{error:'El código de acceso no es correcto.',needsCode:true});}
 if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'Se requiere JSON.'});
 if(count(usage,ip,now).length>=maxRequests)return send(429,{error:'Se alcanzó el límite de pedidos de esta hora. Probá más tarde.'});
 if(active>=2)return send(429,{error:'El asistente está ocupado. Intentá en unos segundos.'});
 usage.get(ip).push(now);active++;
 const controller=new AbortController();res.on?.('close',()=>{if(!res.writableEnded)controller.abort();});
 try{const body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!body||JSON.stringify(body).length>1200000)return send(413,{error:'Pedido demasiado grande.'});return send(200,await designService(body,process.env,fetch,{signal:controller.signal}));}
 catch(error){return send(error.status||500,{error:error.name==='TimeoutError'?'La solicitud tardó demasiado. Intentá nuevamente.':error.status?error.message:'No se pudo preparar una propuesta.'});}
 finally{active--;}
}
