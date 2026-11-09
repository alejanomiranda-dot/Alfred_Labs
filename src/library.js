// Project library with versions and thumbnails, stored in IndexedDB (room for imported pieces, unlike localStorage).
// Old saves from the first library are moved in once.
// With a signed-in Google account each version also lives in the person's Google Drive (src/cloud.js).
// Fields that sync adds: owner (Google account id that saved or downloaded it), cloud (already uploaded),
// driveId (its Drive file) and params:null when only the list data came down and the project is fetched on open.
const dbName='alfred-labs',store='versions',legacyKey='taller-vero-projects-v1';
let dbPromise=null;
function open(){
 if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(dbName,1);req.onupgradeneeded=()=>{const os=req.result.createObjectStore(store,{keyPath:'id'});os.createIndex('project','projectId');};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
 return dbPromise;
}
function tx(mode,fn){return open().then(db=>new Promise((resolve,reject)=>{const t=db.transaction(store,mode),os=t.objectStore(store);let out;Promise.resolve(fn(os,v=>{out=v;})).catch(reject);t.oncomplete=()=>resolve(out);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('Operación cancelada.'));}));}
export const allVersions=()=>tx('readonly',(os,set)=>{const r=os.getAll();r.onsuccess=()=>set(r.result);});

export async function migrateLegacy(){
 let legacy=[];try{legacy=JSON.parse(localStorage.getItem(legacyKey)||'[]');}catch{}
 if(!legacy.length)return 0;
 await tx('readwrite',os=>{for(const item of legacy)os.put({id:item.id,projectId:item.id,date:item.date,name:item.params?.project||'Diseño',params:item.params,thumb:null,note:'Guardado anterior'});});
 try{localStorage.removeItem(legacyKey);}catch{}
 return legacy.length;
}
export function saveVersion(version){return tx('readwrite',os=>{os.put(version);});}
export function saveVersions(versions){return versions.length?tx('readwrite',os=>{for(const v of versions)os.put(v);}):Promise.resolve();}
// Marca una versión como subida sin resucitarla si mientras tanto se borró.
export function markUploaded(id,owner,driveId){return tx('readwrite',os=>{const r=os.get(id);r.onsuccess=()=>{if(r.result)os.put({...r.result,owner,driveId,cloud:true});};});}
export function deleteVersions(ids){return ids.length?tx('readwrite',os=>{for(const id of ids)os.delete(id);}):Promise.resolve();}
// Las versiones automáticas se acumulan rápido (cada pieza de Alfred guarda una); se conservan las más nuevas.
// Devuelve las versiones borradas para que también se borren de la nube.
export async function pruneProject(projectId,keep=40){
 const old=(await allVersions()).filter(v=>v.projectId===projectId).sort((a,b)=>b.date.localeCompare(a.date)).slice(keep);
 await deleteVersions(old.map(v=>v.id));
 return old;
}
export async function listProjects(){
 const versions=(await allVersions()).sort((a,b)=>b.date.localeCompare(a.date)),projects=new Map();
 for(const v of versions){if(!projects.has(v.projectId))projects.set(v.projectId,{projectId:v.projectId,name:v.name,latest:v,versions:[]});projects.get(v.projectId).versions.push(v);}
 return [...projects.values()];
}
export async function deleteProject(projectId){
 const gone=(await allVersions()).filter(v=>v.projectId===projectId);
 await deleteVersions(gone.map(v=>v.id));
 return gone;
}
export async function countProjects(){return (await listProjects()).length;}
