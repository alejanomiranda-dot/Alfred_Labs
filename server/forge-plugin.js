import {forgeStatus,runForge} from './forge.js';
export function forgePlugin(env){
 let busy=false;
 return {name:'local-alfred-forge',configureServer(server){
  // Development-only middleware: configurePreviewServer deliberately absent.
  server.middlewares.use(async(req,res,next)=>{
   if(req.url?.split('?')[0]!=='/api/forge')return next();
   const send=(status,data)=>{if(res.destroyed)return;res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data));};
   const host=req.headers.host,address=req.socket.remoteAddress;
   if(process.env.VERCEL||process.env.VERCEL_ENV||!['127.0.0.1','::ffff:127.0.0.1','::1'].includes(address)||!/^127\.0\.0\.1:\d+$/.test(host||'')||req.headers['x-forwarded-for']||req.headers['forwarded'])return send(403,{error:'Forge está disponible solo en http://127.0.0.1 de tu computadora.'});
   if(req.method==='GET'){
    if(req.headers.origin&&req.headers.origin!=='http://'+host)return send(403,{error:'Origen no autorizado.'});
    try{return send(200,await forgeStatus(env));}catch{return send(403,{error:'Forge no está habilitado en este entorno.'});}
   }
   if(req.method!=='POST')return send(405,{error:'Método no permitido.'});
   if(req.headers.origin!=='http://'+host)return send(403,{error:'Origen no autorizado.'});
   if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'Se requiere JSON.'});
   if(busy)return send(429,{error:'Forge ya está trabajando. Esperá o detené la generación anterior.'});
   if(Number(req.headers['content-length'])>100000)return send(413,{error:'Pedido demasiado grande.'});
   busy=true;const controller=new AbortController();
   res.on('close',()=>{if(!res.writableEnded)controller.abort();});
   const timer=setTimeout(()=>controller.abort(),340000);
   try{
    let bytes=0;const chunks=[];
    for await(const chunk of req){bytes+=chunk.length;if(bytes>100000)throw Object.assign(Error('Pedido demasiado grande.'),{status:413});chunks.push(chunk);}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(Error('JSON inválido.'),{status:400});}
    send(200,await runForge(body,{env,signal:controller.signal}));
   }catch(e){send(e.status||500,{error:e.status?e.message:e.name==='AbortError'?'Generación detenida.':'No se pudo completar Forge. Revisá el pedido y OpenSCAD.',code:e.code||'forge_error'});}
   finally{clearTimeout(timer);busy=false;}
  });
 }};
}
