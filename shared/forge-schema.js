// Shared, data-only validation; importing a project never executes its source.
export const maxSourceLength=60000, maxForgeVersions=8;
export function validateSource(source){
 if(typeof source!=='string'||source.trim().length<30||source.length>maxSourceLength)throw Error('Código OpenSCAD inválido: debe tener entre 30 y 60.000 caracteres.');
 const stripped=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
 if(/\b(?:include|use|import|surface)\s*(?:\(|<)/i.test(stripped)||/\b(?:https?|file):\/\//i.test(stripped))throw Error('El programa usa referencias externas no permitidas.');
 // Convenience check only. This is NOT a security sandbox.
 return source;
}
// Organic finish chosen for a revision: smoothing (0..1) and a surface texture with its depth and size in mm.
export const forgeTextures=['none','craters','rock','wood','scales','fur'];
export function validateFinish(f){
 const inRange=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
 if(!f||typeof f!=='object'||!forgeTextures.includes(f.texture)||!inRange(f.smooth,0,1)||!inRange(f.depth,0,3)||!inRange(f.scale,1,60))throw Error('Acabado de Forge inválido.');
 return {texture:f.texture,smooth:f.smooth,depth:f.depth,scale:f.scale};
}
// The model answers in its own units and ranges; anything out of range is clamped instead of failing the piece.
export function finishFromModel(raw){
 if(!raw||typeof raw!=='object'||!forgeTextures.includes(raw.texture))return {texture:'none',smooth:0,depth:0,scale:8};
 const clamp=(v,min,max,fallback)=>typeof v==='number'&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):fallback;
 return {texture:raw.texture,smooth:clamp(raw.smooth,0,1,.6),depth:raw.texture==='none'?0:clamp(raw.depth_mm,0,3,.6),scale:clamp(raw.scale_mm,1,60,8)};
}
export function validateForgeArchive(raw){
 if(raw===null||raw===undefined)return null;
 if(!raw||raw.version!==1||!Array.isArray(raw.revisions)||!raw.revisions.length||raw.revisions.length>maxForgeVersions||typeof raw.selected!=='string')throw Error('Historial de Forge inválido.');
 const revisions=raw.revisions.map(r=>{
  if(!r||typeof r.id!=='string'||r.id.length>80||typeof r.prompt!=='string'||r.prompt.length>2000||typeof r.description!=='string'||r.description.length>2000||typeof r.created!=='string'||!Number.isFinite(Date.parse(r.created)))throw Error('Versión de Forge inválida.');
  const lists={};for(const k of ['assumptions','caveats']){if(!Array.isArray(r[k])||r[k].length>20||!r[k].every(s=>typeof s==='string'&&s.length<=1000))throw Error('Notas de Forge inválidas.');lists[k]=r[k].slice();}
  return {id:r.id,prompt:r.prompt,description:r.description,created:r.created,scad:validateSource(r.scad),...lists,...(r.finish?{finish:validateFinish(r.finish)}:{})};
 });
 if(new Set(revisions.map(r=>r.id)).size!==revisions.length||!revisions.some(r=>r.id===raw.selected))throw Error('Versión seleccionada de Forge inválida.');
 return {version:1,selected:raw.selected,revisions};
}
