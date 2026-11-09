// Project library with versions and thumbnails, stored in IndexedDB (room for imported pieces, unlike localStorage).
// Old saves from the first library are moved in once.
const dbName='alfred-labs',store='versions',legacyKey='taller-vero-projects-v1';
let dbPromise=null;
function open(){
 if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(dbName,1);req.onupgradeneeded=()=>{const os=req.result.createObjectStore(store,{keyPath:'id'});os.createIndex('project','projectId');};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
 return dbPromise;
}
function tx(mode,fn){return open().then(db=>new Promise((resolve,reject)=>{const t=db.transaction(store,mode),os=t.objectStore(store);let out;Promise.resolve(fn(os,v=>{out=v;})).catch(reject);t.oncomplete=()=>resolve(out);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('Operación cancelada.'));}));}
const all=()=>tx('readonly',(os,set)=>{const r=os.getAll();r.onsuccess=()=>set(r.result);});

export async function migrateLegacy(){
 let legacy=[];try{legacy=JSON.parse(localStorage.getItem(legacyKey)||'[]');}catch{}
 if(!legacy.length)return 0;
 await tx('readwrite',os=>{for(const item of legacy)os.put({id:item.id,projectId:item.id,date:item.date,name:item.params?.project||'Diseño',params:item.params,thumb:null,note:'Guardado anterior'});});
 try{localStorage.removeItem(legacyKey);}catch{}
 return legacy.length;
}
export function saveVersion(version){return tx('readwrite',os=>{os.put(version);});}
// Las versiones automáticas se acumulan rápido (cada pieza de Alfred guarda una); se conservan las más nuevas.
export async function pruneProject(projectId,keep=40){
 const old=(await all()).filter(v=>v.projectId===projectId).sort((a,b)=>b.date.localeCompare(a.date)).slice(keep);
 if(old.length)await tx('readwrite',os=>{for(const v of old)os.delete(v.id);});
 return old.length;
}
export async function listProjects(){
 const versions=(await all()).sort((a,b)=>b.date.localeCompare(a.date)),projects=new Map();
 for(const v of versions){if(!projects.has(v.projectId))projects.set(v.projectId,{projectId:v.projectId,name:v.name,latest:v,versions:[]});projects.get(v.projectId).versions.push(v);}
 return [...projects.values()];
}
export function deleteProject(projectId){return tx('readwrite',os=>{const r=os.index('project').openCursor(IDBKeyRange.only(projectId));r.onsuccess=()=>{const c=r.result;if(c){c.delete();c.continue();}};});}
export async function countProjects(){return (await listProjects()).length;}
