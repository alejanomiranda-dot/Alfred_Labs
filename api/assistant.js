import {proposeDesign} from '../server/assistant.js';
export const config={maxDuration:60};
let active=0;
export default async function handler(req,res){
 const send=(status,data)=>res.status(status).json(data);
 res.setHeader('Cache-Control','no-store');
 if(req.method==='GET')return send(200,{enabled:Boolean(process.env.OPENAI_API_KEY),provider:'OpenAI'});
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return send(405,{error:'Método no permitido.'});}
 // Vercel Authentication protects every deployment, including production.
 // Do not expose this endpoint if Deployment Protection is disabled.
 if(!process.env.VERCEL)return send(503,{error:'Este endpoint requiere el entorno protegido de Vercel.'});
 const origin=req.headers.origin,host=req.headers['x-forwarded-host']||req.headers.host;
 if(!origin||origin!=='https://'+host)return send(403,{error:'Solicitud de otro origen no permitida.'});
 if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'Se requiere JSON.'});
 if(active>=2)return send(429,{error:'El asistente está ocupado. Intentá en unos segundos.'});
 active++;
 try{const body=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!body||JSON.stringify(body).length>12000)return send(413,{error:'Pedido demasiado grande.'});return send(200,await proposeDesign(body,process.env.OPENAI_API_KEY));}
 catch(error){return send(error.status||500,{error:error.name==='TimeoutError'?'La solicitud tardó demasiado. Intentá nuevamente.':error.status?error.message:'No se pudo preparar una propuesta.'});}
 finally{active--;}
}
