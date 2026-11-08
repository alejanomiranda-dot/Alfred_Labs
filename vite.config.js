import {defineConfig,loadEnv} from 'vite';
import {forgePlugin} from './server/forge-plugin.js';
import {proposeDesign} from './server/assistant.js';
export default defineConfig(({mode})=>{const env=loadEnv(mode,process.cwd(),'');let busy=false,last=0;return {plugins:[forgePlugin(env),{name:'local-design-assistant',configureServer(server){server.middlewares.use('/api/assistant',async(req,res)=>{
 const send=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
 if(req.method!=='POST')return send(405,{error:'Método no permitido.'});
 const host=req.headers.host,origin=req.headers.origin;if(!host||!/^127\.0\.0\.1:\d+$/.test(host)||!origin||origin!=='http://'+host)return send(403,{error:'Solicitud no autorizada.'});
 if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'Se requiere JSON.'});
 if(busy||Date.now()-last<2000)return send(429,{error:'Esperá a que termine la solicitud anterior.'});
 const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
 busy=true;last=Date.now();try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1200000)throw Object.assign(Error('Pedido demasiado grande.'),{status:413});}const result=await proposeDesign(JSON.parse(raw),env.OPENAI_API_KEY,fetch,{signal:controller.signal});send(200,result);}catch(error){send(error.status||500,{error:error.name==='TimeoutError'?'La solicitud tardó demasiado. Intentá nuevamente.':error.status?error.message:'No se pudo procesar la solicitud.'});}finally{busy=false;}
 });}}]};});
