// Trusted runner copied into a fresh, credential-free microVM. Never run in a Vercel Function.
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
const directory='/vercel/sandbox/forge';
// 3 MB de STL (unos 60.000 triángulos): en base64 son 4 MB y la respuesta entra en el límite de 4,5 MB de Vercel.
// Con 1 MB un busto o una figura con pelo quedaba al borde y fallaba sin explicación.
const maxBytes=3*1024*1024;
// Con OpenSCAD 2024 o posterior se usa el motor Manifold (segundos en vez de minutos).
// En la VM, access() puede devolver EACCES aunque el ejecutable se pueda iniciar.
// stat() comprueba que la imagen esté presente sin degradar silenciosamente al compilador viejo.
const openscad=await fs.stat('/opt/openscad/AppRun').then(()=>'/opt/openscad/AppRun',()=>'/usr/bin/openscad');
const backend=await new Promise(resolve=>{const c=spawn(openscad,['--help'],{stdio:['ignore','pipe','pipe'],env:{PATH:'/usr/bin:/bin',QT_QPA_PLATFORM:'offscreen'}});let t='';c.stdout.on('data',b=>t+=b);c.stderr.on('data',b=>t+=b);c.on('error',()=>resolve([]));c.on('close',()=>resolve(/manifold/i.test(t)?['--backend=manifold']:[]));});
// Solo las líneas de error de OpenSCAD (sin rutas), para que el generador pueda corregir la fuente.
const errorLines=text=>text.split(/\r?\n/).filter(l=>/error|warning: .*(undefined|unknown)|parser/i.test(l)).map(l=>l.replace(/\/vercel\/sandbox\/forge\//g,'').trim()).slice(-4).join(' | ').slice(0,600);
function compile(ext){
 return new Promise((resolve,reject)=>{
  const args=['--as=1610612736','--cpu=50','--fsize='+maxBytes,'--',openscad,...backend,...(ext==='stl'?['--export-format','binstl']:[]),'-o',directory+'/piece.'+ext,directory+'/piece.scad'];
  const child=spawn('/usr/bin/prlimit',args,{cwd:directory,detached:true,stdio:['ignore','pipe','pipe'],env:{PATH:'/usr/bin:/bin',HOME:directory,QT_QPA_PLATFORM:'offscreen',LANG:'C.UTF-8'}});
  let bytes=0,text='',failure=null;
  const stop=(code,message)=>{failure||={code,message};try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}};
  const timer=setTimeout(()=>stop('compile_timeout','La pieza superó el tiempo de compilación. Probá una versión más simple.'),60000);
  const read=b=>{bytes+=b.length;text=(text+b.toString()).slice(-16000);if(bytes>128*1024)stop('compile_output_limit','La pieza produjo demasiados mensajes. Simplificá el pedido.');};
  child.stdout.on('data',read);child.stderr.on('data',read);
  child.on('error',()=>{failure={code:'compiler_unavailable',message:'No se pudo iniciar el compilador aislado.'};});
  child.on('close',(code,signal)=>{
   clearTimeout(timer);if(failure)return reject(failure);
   // prlimit corta con SIGXFSZ cuando el STL supera el tamaño, y con SIGXCPU/SIGKILL por tiempo o memoria.
   if(signal==='SIGXFSZ'||code===153)return reject({code:'compile_size',message:'La pieza tiene demasiado detalle para el compilador en línea.'});
   if(signal||code>128)return reject({code:'compile_limit',message:'La pieza superó el tiempo o la memoria del compilador en línea.'});
   if(code!==0)return reject({code:'compile_failed',message:'OpenSCAD no pudo construir la pieza.',detail:errorLines(text)});
   resolve();
  });
 });
}
try{
 const source=await fs.readFile(directory+'/piece.scad','utf8');
 if(source.length<30||source.length>60000)throw {code:'invalid_source',message:'Fuente inválida.'};
 const files={};
 for(const ext of ['stl']){await compile(ext);const stat=await fs.stat(directory+'/piece.'+ext);if(stat.size<100||stat.size>=maxBytes)throw {code:'compile_size',message:'La pieza tiene demasiado detalle para el compilador en línea.'};files[ext]=stat.size;}
 await fs.writeFile(directory+'/result.json',JSON.stringify({ok:true,files,compiler:{backend:backend.length?'manifold':'cgal'}}));
}catch(e){await fs.writeFile(directory+'/result.json',JSON.stringify({ok:false,code:e.code||'compile_failed',error:e.message||'No se pudo compilar la pieza.',detail:e.detail||''}));process.exitCode=1;}
