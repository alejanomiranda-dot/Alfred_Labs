import {validate,buildModel} from './model.js';

export const shapeNames={circle:'Redonda · círculo',round:'Rectángulo redondeado',oval:'Ovalada',bone:'Hueso'};
const labels={project:'Proyecto',name:'Nombre',phone:'Identificación',qrText:'Texto del QR',caption:'Texto',width:'Ancho',height:'Alto',thickness:'Espesor de base',relief:'Relieve',hole:'Agujero',baseColor:'Color de base',detailColor:'Color del detalle',backDepth:'Profundidad del dorso'};
const sizeText=v=>v.map(x=>Number(x.toFixed(1)).toLocaleString('es-AR')).join(' × ')+' mm';

// Verify the actual solid before offering Apply, rather than trusting the reply.
export function checkProposal(api,base,result,pending=null){
 const source=result.designSource==='pending'&&pending?pending:base;
 const candidate=validate({...base,...source,...result.params}),built=buildModel(api,candidate);
 if(candidate.kind==='free'&&result.expectedSize){
  const got=built.dimensions,want=result.expectedSize;
  if(got.some((v,i)=>want[i]>0&&Math.abs(v-want[i])>Math.max(1,want[i]*.03)))throw Error('La pieza construida mide '+sizeText(got)+' pero se esperaba '+sizeText(want)+'. Ubicación real de cada operación (mm, antes de centrar): '+built.operationBounds.map(o=>o.index+' '+o.type+' X '+o.min[0].toFixed(1)+'..'+o.max[0].toFixed(1)+' Y '+o.min[1].toFixed(1)+'..'+o.max[1].toFixed(1)+' Z '+o.min[2].toFixed(1)+'..'+o.max[2].toFixed(1)).join('; ')+'.');
 }
 if(JSON.stringify(candidate)===JSON.stringify(base))throw Error('La propuesta no contiene cambios en la pieza.');
 return {candidate,built};
}

export function proposalChanges(base,candidate){
 const changes=[];
 for(const key of Object.keys(candidate)){
  if(JSON.stringify(candidate[key])===JSON.stringify(base[key]))continue;
  if(key==='shape')changes.push('Forma: '+shapeNames[candidate.shape]);
  else if(key==='kind')changes.push('Diseño: '+({tag:'Chapita',qr:'Llavero QR',logo:'Llavero con logo',free:'Pieza a medida'}[candidate.kind]));
  else if(key==='importedMesh')changes.push(candidate.sourceInfo?'Nueva geometría del relieve':'Nueva geometría de la pieza importada');
  else if(key==='sourceInfo'&&candidate.sourceInfo)changes.push('Relieve: base de '+candidate.sourceInfo.baseThickness+' mm y profundidad de '+candidate.sourceInfo.depth+' mm');
  else if(key==='freeDesign')changes.push('Nueva geometría de la pieza');
  else if(key==='hook')changes.push('Enganche: '+(candidate.hook==='ring'?'argolla arriba':'agujero en la placa'));
  else if(key==='backDecoration')changes.push('Dorso: '+(candidate[key]==='bone'?'Huesito':'Sin decoración'));
  else if(key==='backStyle')changes.push('Dorso: '+(candidate[key]==='raised'?'Relieve':'Grabado'));
  else if(labels[key])changes.push(labels[key]+': '+base[key]+' → '+candidate[key]+(typeof candidate[key]==='number'?' mm':''));
 }
 return changes;
}

export function pendingContext(current,proposal,base){
 // A manual edit invalidates an outstanding proposal, including while a request runs.
 if(!proposal||JSON.stringify(current)!==base)return undefined;
 const {importedMesh,logoPolygons,forge,...safe}=proposal;
 return safe;
}
