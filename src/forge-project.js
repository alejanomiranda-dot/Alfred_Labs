import {validateForgeArchive,validateFinish,maxForgeVersions} from '../shared/forge-schema.js';
import {hasFinish} from './finish.js';
import {defaults,validate,buildModel} from './model.js';
import {readMeshFile} from './mesh-import.js';
import {prepareImport} from './solid-program.js';
export function base64Bytes(encoded){
 if(typeof encoded!=='string'||encoded.length>17*1024*1024||!encoded.length||!/^[A-Za-z0-9+/]+=*$/.test(encoded))throw Error('Archivo de Forge inválido o demasiado grande.');
 return Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
}
export function revisionFromResult(result,prompt,id=crypto.randomUUID()){
 return {id,prompt,scad:result.scad,description:result.description,assumptions:result.assumptions,caveats:result.caveats,created:result.created,...(result.finish?{finish:validateFinish(result.finish)}:{})};
}
// The generated piece plus, when it has one, its organic finish as a final operation the panel can change.
export function forgeProgram(finish){
 const imported={type:'imported',position:[0,0,0],rotation:[0,0,0]};
 if(!hasFinish(finish))return {version:1,nodes:[imported]};
 return {version:1,nodes:[imported,{type:'finish',inputs:[0],position:[0,0,0],rotation:[0,0,0],texture:finish.texture,smooth:finish.smooth,depth:finish.depth,scale:finish.scale,seed:1}]};
}
// Same piece with another finish: replaces (or removes) the final finish operation.
export function withFinish(program,finish){
 const nodes=program.nodes.at(-1)?.type==='finish'?program.nodes.slice(0,-1):program.nodes.slice();
 if(hasFinish(finish))nodes.push({type:'finish',inputs:[nodes.length-1],position:[0,0,0],rotation:[0,0,0],texture:finish.texture,smooth:finish.smooth,depth:finish.texture==='none'?0:finish.depth,scale:finish.scale,seed:1});
 return {...program,nodes};
}
export const finishOf=program=>{const n=program?.nodes?.find(x=>x.type==='finish');return n?{texture:n.texture,smooth:n.smooth,depth:n.depth,scale:n.scale}:{texture:'none',smooth:0,depth:0,scale:8};};
// Validate and build BEFORE the caller can replace anything in the editor.
export function prepareForgeProposal(api,current,result,archive){
 const forge=validateForgeArchive(archive),revision=forge.revisions.find(r=>r.id===forge.selected);
 const read=readMeshFile('Alfred Forge.stl',base64Bytes(result.files?.stl)),prepared=prepareImport(api,read);
 if(prepared.size.some(v=>v<=0||v>300))throw Error('La pieza debe tener volumen y medir como máximo 300 mm por eje. Pedí una versión más pequeña.');
 const candidate=validate({...defaults,project:current.forge||current.keepProject?current.project:revision.prompt.slice(0,60),baseColor:current.baseColor,detailColor:current.detailColor,kind:'free',importedMesh:prepared.mesh,freeDesign:forgeProgram(revision.finish),forge});
 const built=buildModel(api,candidate);
 return {candidate,built,revision,simplified:prepared.tolerance>0,inverted:prepared.inverted};
}
export function appendForgeRevision(archive,revision){
 return validateForgeArchive({version:1,selected:revision.id,revisions:[...(archive?.revisions||[]),revision].slice(-maxForgeVersions)});
}
