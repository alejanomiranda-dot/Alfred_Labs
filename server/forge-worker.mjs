// Trusted runner copied into a fresh, credential-free microVM. Never run in a Vercel Function.
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
const directory='/vercel/sandbox/forge';
const maxBytes=1024*1024;
// Con OpenSCAD 2024 o posterior se usa el motor Manifold (segundos en vez de minutos).
// En la VM, access() puede devolver EACCES aunque el ejecutable se pueda iniciar.
// stat() comprueba que la imagen esté presente sin degradar silenciosamente al compilador viejo.
const openscad=await fs.stat('/opt/openscad/AppRun').then(()=>'/opt/openscad/AppRun',()=>'/usr/bin/openscad');
const backend=await new Promise(resolve=>{const c=spawn(openscad,['--help'],{stdio:['ignore','pipe','pipe'],env:{PATH:'/usr/bin:/bin',QT_QPA_PLATFORM:'offscreen'}});let t='';c.stdout.on('data',b=>t+=b);c.stderr.on('data',b=>t+=b);c.on('error',()=>resolve([]));c.on('close',()=>resolve(/manifold/i.test(t)?['--backend=manifold']:[]));});
function compile(ext){
 return new Promise((resolve,reject)=>{
  const args=['--as=1610612736','--cpu=50','--fsize='+maxBytes,'--',openscad,...backend,...(ext==='stl'?['--export-format','binstl']:[]),'-o',directory+'/piece.'+ext,directory+'/piece.scad'];
  const child=spawn('/usr/bin/prlimit',args,{cwd:directory,detached:true,stdio:['ignore','pipe','pipe'],env:{PATH:'/usr/bin:/bin',HOME:directory,QT_QPA_PLATFORM:'offscreen',LANG:'C.UTF-8'}});
  let bytes=0,failure=null;
  const stop=(code,message)=>{failure||={code,message};try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}};
  const timer=setTimeout(()=>stop('compile_timeout','La pieza superó el tiempo de compilación. Probá una versión más simple.'),60000);
  const read=b=>{bytes+=b.length;if(bytes>128*1024)stop('compile_output_limit','La pieza produjo demasiados mensajes. Simplificá el pedido.');};
  child.stdout.on('data',read);child.stderr.on('data',read);
  child.on('error',()=>{failure={code:'compiler_unavailable',message:'No se pudo iniciar el compilador aislado.'};});
  child.on('close',code=>{clearTimeout(timer);if(failure)return reject(failure);if(code!==0)return reject({code:'compile_failed',message:'OpenSCAD no pudo construir la pieza o alcanzó un límite. Probá simplificar el pedido.'});resolve();});
 });
}
try{
 const source=await fs.readFile(directory+'/piece.scad','utf8');
 if(source.length<30||source.length>60000)throw {code:'invalid_source',message:'Fuente inválida.'};
 const files={};
 for(const ext of ['stl']){await compile(ext);const stat=await fs.stat(directory+'/piece.'+ext);if(stat.size<100||stat.size>=maxBytes)throw {code:'compile_size',message:'La pieza supera el tamaño permitido para la prueba en línea. Pedí menos detalle.'};files[ext]=stat.size;}
 await fs.writeFile(directory+'/result.json',JSON.stringify({ok:true,files,compiler:{backend:backend.length?'manifold':'cgal'}}));
}catch(e){await fs.writeFile(directory+'/result.json',JSON.stringify({ok:false,code:e.code||'compile_failed',error:e.message||'No se pudo compilar la pieza.'}));process.exitCode=1;}
