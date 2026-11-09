import {validateForgeArchive,maxForgeVersions} from '../shared/forge-schema.js';
import {defaults,validate,buildModel} from './model.js';
import {readMeshFile} from './mesh-import.js';
import {prepareImport} from './solid-program.js';
export function base64Bytes(encoded){
 if(typeof encoded!=='string'||encoded.length>17*1024*1024||!encoded.length||!/^[A-Za-z0-9+/]+=*$/.test(encoded))throw Error('Archivo de Forge inválido o demasiado grande.');
 return Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
}
export function revisionFromResult(result,prompt,id=crypto.randomUUID()){
 return {id,prompt,scad:result.scad,description:result.description,assumptions:result.assumptions,caveats:result.caveats,created:result.created};
}
// Validate and build BEFORE the caller can replace anything in the editor.
export function prepareForgeProposal(api,current,result,archive){
 const forge=validateForgeArchive(archive),revision=forge.revisions.find(r=>r.id===forge.selected);
 const read=readMeshFile('Alfred Forge.stl',base64Bytes(result.files?.stl)),prepared=prepareImport(api,read);
 if(prepared.size.some(v=>v<=0||v>300))throw Error('La pieza debe tener volumen y medir como máximo 300 mm por eje. Pedí una versión más pequeña.');
 const candidate=validate({...defaults,project:current.forge||current.keepProject?current.project:revision.prompt.slice(0,60),baseColor:current.baseColor,detailColor:current.detailColor,kind:'free',importedMesh:prepared.mesh,freeDesign:{version:1,nodes:[{type:'imported',position:[0,0,0],rotation:[0,0,0]}]},forge});
 const built=buildModel(api,candidate);
 return {candidate,built,revision,simplified:prepared.tolerance>0,inverted:prepared.inverted};
}
export function appendForgeRevision(archive,revision){
 return validateForgeArchive({version:1,selected:revision.id,revisions:[...(archive?.revisions||[]),revision].slice(-maxForgeVersions)});
}
