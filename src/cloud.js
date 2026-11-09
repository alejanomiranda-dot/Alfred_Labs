// Cuenta de Google y «Mis diseños» en tu propio Google Drive, para verlos desde cualquier computadora.
// Usa la carpeta oculta de la app en Drive (appDataFolder): solo Alfred la ve, no aparece entre tus archivos
// y no hay servidor ni base de datos propios, así que no tiene costo. La biblioteca local (src/library.js)
// sigue siendo donde se trabaja: anda sin conexión y sin cuenta.
// Cada versión son dos archivos: v-<id>.json.gz (el proyecto; nombre, fecha y nota van en appProperties)
// y t-<id>.jpg (la miniatura). Lo que falta en este navegador baja con su ficha y miniatura; el proyecto
// completo, recién al abrirlo.
// El permiso de Google dura una hora. Renovarlo abre la ventana de Google y el navegador solo lo permite
// después de un clic, por eso se renueva al abrir «Mis diseños» o un diseño; mientras tanto lo nuevo
// queda guardado acá y sube en la próxima sincronización.
// Sin VITE_GOOGLE_CLIENT_ID el botón «Entrar» no aparece y Alfred guarda solo en este navegador.
import {gzipSync,gunzipSync,strToU8,strFromU8} from 'fflate';
import {allVersions,saveVersion,saveVersions,deleteVersions,markUploaded} from './library.js';

const clientId=import.meta.env.VITE_GOOGLE_CLIENT_ID;
const driveScope='https://www.googleapis.com/auth/drive.appdata',scope='openid email profile '+driveScope;
const files='https://www.googleapis.com/drive/v3/files',uploads='https://www.googleapis.com/upload/drive/v3/files';
const accountKey='alfred-google-account',pendingKey='alfred-cloud-pending-deletes';
export const cloudConfigured=Boolean(clientId);

let account=readAccount(),queue=Promise.resolve(),gisPromise=null;
const listeners=new Set();
const emit=()=>{const u=currentUser();for(const fn of listeners)fn(u);};
const chunks=(list,n)=>Array.from({length:Math.ceil(list.length/n)},(_,i)=>list.slice(i*n,i*n+n));
// Las operaciones con Drive van de a una, así una subida y un borrado de la misma versión no se cruzan.
const serial=fn=>{const run=queue.then(fn,fn);queue=run.catch(()=>{});return run;};
const versionName=id=>'v-'+id+'.json.gz',thumbName=id=>'t-'+id+'.jpg';

function readAccount(){try{const a=JSON.parse(localStorage.getItem(accountKey)||'null');return a&&typeof a.id==='string'?a:null;}catch{return null;}}
function setAccount(next){account=next;try{if(next)localStorage.setItem(accountKey,JSON.stringify(next));else localStorage.removeItem(accountKey);}catch{}}

export const currentUser=()=>account?{id:account.id,email:account.email,name:account.name,given:account.given}:null;
export function onAccountChange(fn){listeners.add(fn);return ()=>listeners.delete(fn);}
export function accountName(u=currentUser()){return String(u?.name||u?.email||'').trim();}

function gis(){
 gisPromise??=new Promise((resolve,reject)=>{
  if(window.google?.accounts?.oauth2)return resolve(window.google.accounts.oauth2);
  const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;
  s.onload=()=>window.google?.accounts?.oauth2?resolve(window.google.accounts.oauth2):reject(Error('No se pudo cargar el acceso de Google.'));
  s.onerror=()=>{gisPromise=null;s.remove();reject(Error('No se pudo cargar el acceso de Google. Revisá la conexión.'));};
  document.head.append(s);
 });
 return gisPromise;
}
// Se carga de antemano: la ventana de Google tiene que abrirse enseguida después del clic o el navegador la bloquea.
export function preloadGoogle(){if(cloudConfigured)gis().catch(()=>{});}

async function requestToken(prompt){
 const oauth=await gis();
 return new Promise((resolve,reject)=>{
  const failed={popup_closed:'Cerraste la ventana de Google antes de terminar.',popup_failed_to_open:'El navegador bloqueó la ventana de Google. Permití las ventanas emergentes para este sitio.'};
  oauth.initTokenClient({client_id:clientId,scope,prompt,...(account?.email?{login_hint:account.email}:{}),
   callback:r=>{
    if(r.error)return reject(Error(r.error_description||'Google no dio permiso ('+r.error+').'));
    if(!oauth.hasGrantedAllScopes(r,driveScope))return reject(Error('Alfred necesita permiso para guardar en tu Google Drive. Volvé a entrar y dejá marcada esa opción.'));
    resolve(r);
   },
   error_callback:e=>reject(Error(failed[e?.type]||'No se pudo conectar con Google.'))}).requestAccessToken();
 });
}
async function profile(token){
 const res=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+token}});
 const info=res.ok?await res.json():null;
 if(!info?.sub)throw Error('No se pudo leer tu cuenta de Google.');
 return info;
}
const validToken=()=>account?.token&&account.expires-60000>Date.now()?account.token:null;

// Pide o renueva el permiso de Google. Solo con interactive (dentro de un clic) puede abrir la ventana.
async function ensureToken(interactive){
 const valid=validToken();if(valid)return valid;
 if(!interactive||!account)return null;
 const r=await requestToken('');
 const info=await profile(r.access_token);
 if(info.sub!==account.id)throw Error('Elegiste otra cuenta de Google. Para cambiar de cuenta, cerrá la sesión desde tu nombre arriba.');
 setAccount({...account,token:r.access_token,expires:Date.now()+r.expires_in*1000});
 return account.token;
}

export async function signIn(){
 const r=await requestToken('select_account'),info=await profile(r.access_token);
 const previous=account?.id;
 setAccount({id:info.sub,email:info.email||'',name:info.name||'',given:info.given_name||'',token:r.access_token,expires:Date.now()+r.expires_in*1000});
 if(previous!==info.sub)emit();
 return currentUser();
}

// Cierra la sesión solo en esta computadora y saca de este navegador los diseños que ya están en tu Drive.
export async function signOut(){
 const uid=account?.id;
 await queue;
 setAccount(null);emit();
 if(uid)await deleteVersions((await allVersions()).filter(v=>v.owner===uid&&v.cloud).map(v=>v.id));
}

async function drive(url,init={}){
 const token=validToken();
 if(!token)throw Object.assign(Error('Hace falta reconectar con Google: abrí «Mis diseños».'),{needsToken:true});
 const res=await fetch(url,{...init,headers:{...init.headers,Authorization:'Bearer '+token}});
 if(res.status===401){setAccount({...account,token:null,expires:0});throw Object.assign(Error('El permiso de Google venció: abrí «Mis diseños» para reconectar.'),{needsToken:true});}
 if(!res.ok&&!(init.method==='DELETE'&&res.status===404)){
  let detail='';try{detail=(await res.json()).error?.message||'';}catch{}
  throw Error('Google Drive respondió '+res.status+(detail?': '+detail:'')+'.');
 }
 return res;
}
async function listFiles(q){
 const out=[];let pageToken='';
 do{
  const params=new URLSearchParams({spaces:'appDataFolder',pageSize:'1000',fields:'nextPageToken,files(id,name,appProperties)'});
  if(q)params.set('q',q);if(pageToken)params.set('pageToken',pageToken);
  const data=await (await drive(files+'?'+params)).json();
  out.push(...data.files);pageToken=data.nextPageToken||'';
 }while(pageToken);
 return out;
}
const quote=s=>"'"+String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'";
const byNames=names=>listFiles(names.map(n=>'name = '+quote(n)).join(' or '));

// Drive limita cada propiedad a 124 bytes entre nombre y valor.
function fit(text,bytes){let s=String(text??'');const enc=new TextEncoder();while(enc.encode(s).length>bytes)s=s.slice(0,-1);return s;}
async function put(name,mimeType,body,appProperties){
 const [existing]=await byNames([name]);
 const meta=existing?{appProperties}:{name,mimeType,parents:['appDataFolder'],appProperties};
 const boundary='alfred-'+crypto.randomUUID();
 const payload=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: '+mimeType+'\r\n\r\n',body,'\r\n--'+boundary+'--\r\n']);
 const res=await drive((existing?uploads+'/'+existing.id:uploads)+'?uploadType=multipart&fields=id',{method:existing?'PATCH':'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body:payload});
 return (await res.json()).id;
}
function dataUrlBytes(url){const bin=atob(url.slice(url.indexOf(',')+1)),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
const blobDataUrl=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});

async function upload(uid,v){
 // Primero la miniatura: el archivo del proyecto es el que hace que la versión exista en las otras computadoras.
 if(typeof v.thumb==='string'&&v.thumb.startsWith('data:image/jpeg;base64,'))await put(thumbName(v.id),'image/jpeg',dataUrlBytes(v.thumb));
 const driveId=await put(versionName(v.id),'application/gzip',gzipSync(strToU8(JSON.stringify(v.params))),{projectId:fit(v.projectId,110),date:fit(v.date,110),name:fit(v.name||'Diseño',120),note:fit(v.note||'',120)});
 await markUploaded(v.id,uid,driveId);
}
async function removeRemote(ids){
 for(const part of chunks(ids,20)){
  const found=await byNames(part.flatMap(id=>[versionName(id),thumbName(id)]));
  // Primero el proyecto y después la miniatura, por la misma razón que al subir.
  found.sort((a,b)=>(a.name.startsWith('v-')?0:1)-(b.name.startsWith('v-')?0:1));
  for(const f of found)await drive(files+'/'+f.id,{method:'DELETE'});
 }
}

// Borrados hechos sin conexión o con la sesión cerrada: se aplican en tu Drive la próxima vez.
function pending(){try{const list=JSON.parse(localStorage.getItem(pendingKey)||'[]');return Array.isArray(list)?list:[];}catch{return [];}}
function setPending(list){try{if(list.length)localStorage.setItem(pendingKey,JSON.stringify(list));else localStorage.removeItem(pendingKey);}catch{}}

// Trae lo que falta, sube lo que no está en Drive y borra acá lo que se borró en otra computadora.
// Devuelve needsToken cuando hace falta un clic para renovar el permiso de Google.
export async function syncLibrary({interactive=false}={}){
 const none={pulled:0,pushed:0,removed:0};
 if(!account)return none;
 if(!(await ensureToken(interactive)))return {...none,needsToken:true};
 return serial(async()=>{
  const uid=account?.id;if(!uid)return none;
  const waiting=pending(),mine=waiting.filter(p=>p.owner===uid);
  if(mine.length){await removeRemote(mine.map(p=>p.id));setPending(pending().filter(p=>p.owner!==uid));}
  const remote=await listFiles(''),thumbs=new Map(),rows=[];
  for(const f of remote){
   if(f.name.startsWith('t-')&&f.name.endsWith('.jpg'))thumbs.set(f.name.slice(2,-4),f.id);
   else if(f.name.startsWith('v-')&&f.name.endsWith('.json.gz')){
    const id=f.name.slice(2,-8),p=f.appProperties||{},date=new Date(p.date);
    rows.push({id,driveId:f.id,projectId:p.projectId||id,date:Number.isNaN(+date)?new Date(0).toISOString():date.toISOString(),name:p.name||'Diseño',note:p.note||''});
   }
  }
  const local=await allVersions(),localIds=new Set(local.map(v=>v.id)),remoteIds=new Set(rows.map(r=>r.id));
  const missing=rows.filter(r=>!localIds.has(r.id)).sort((a,b)=>b.date.localeCompare(a.date));
  // Solo hace falta la miniatura de la versión más nueva de cada proyecto, que es la que muestra la lista.
  const newest=new Map();for(const r of missing)if(!newest.has(r.projectId))newest.set(r.projectId,r.id);
  const images=new Map();
  for(const id of newest.values()){
   const fileId=thumbs.get(id);if(!fileId)continue;
   try{images.set(id,await blobDataUrl(await (await drive(files+'/'+fileId+'?alt=media')).blob()));}catch(e){if(e.needsToken)throw e;}
  }
  await saveVersions(missing.map(r=>({...r,thumb:images.get(r.id)||null,params:null,owner:uid,cloud:true})));
  const gone=local.filter(v=>v.owner===uid&&v.cloud&&!remoteIds.has(v.id));
  await deleteVersions(gone.map(v=>v.id));
  const toUpload=local.filter(v=>!v.cloud&&v.params&&(!v.owner||v.owner===uid)).sort((a,b)=>a.date.localeCompare(b.date));
  for(const v of toUpload)await upload(uid,v);
  return {pulled:missing.length,pushed:toUpload.length,removed:gone.length};
 });
}

// Sube una versión recién guardada. Sin permiso vigente o si falla, sube en la próxima sincronización.
export function pushVersion(v){return serial(async()=>{
 const uid=account?.id;
 if(!uid||!validToken()||!v.params||(v.owner&&v.owner!==uid))return false;
 await upload(uid,v);return true;
});}

export function removeFromCloud(versions){return serial(async()=>{
 const uid=account?.id,online=Boolean(uid&&validToken());
 const now=online?versions.filter(v=>!v.owner||v.owner===uid).map(v=>v.id):[];
 const later=versions.filter(v=>v.cloud&&v.owner&&!now.includes(v.id)).map(v=>({id:v.id,owner:v.owner}));
 if(now.length){try{await removeRemote(now);}catch{later.push(...versions.filter(v=>v.cloud&&now.includes(v.id)).map(v=>({id:v.id,owner:v.owner||uid})));}}
 if(later.length)setPending([...pending(),...later]);
});}

// Devuelve el proyecto completo de una versión; si solo bajó su ficha, lo descarga de tu Drive.
// Se llama desde un clic, así que puede renovar el permiso de Google.
export async function versionParams(v){
 if(v.params)return v.params;
 if(!account)throw Error('Este diseño está en tu Google Drive. Entrá con Google para abrirlo.');
 if(v.owner&&v.owner!==account.id)throw Error('Este diseño es de otra cuenta de Google.');
 await ensureToken(true);
 const driveId=v.driveId||(await byNames([versionName(v.id)]))[0]?.id;
 if(!driveId)throw Error('Este diseño ya no está en tu Google Drive.');
 let params;
 try{params=JSON.parse(strFromU8(gunzipSync(new Uint8Array(await (await drive(files+'/'+driveId+'?alt=media')).arrayBuffer()))));}
 catch(e){throw e.needsToken?e:Error('No se pudo descargar el diseño de tu Google Drive. Revisá la conexión.');}
 await saveVersion({...v,driveId,params});
 return params;
}
