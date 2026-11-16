import {partsOf,reviewPrint} from './printability.js';
import {manufacturingOf,isMechanism} from '../shared/manufacturing.js';
// Same manufacturing review in the editor and the repeatable challenge runner.
export function reviewForge({built,inverted,candidate},expected){
 const spec=manufacturingOf(candidate),mechanism=isMechanism(spec),pieces=partsOf(built.combined),problems=[],axes=['ancho','profundidad','alto'];
 if(inverted)problems.push('salió con las caras hacia adentro: corregí la orientación de las caras sin tapar aberturas');
 const review=reviewPrint(built.combined,built.volume,{manufacturing:spec,minWall:spec.minWall});
 if(mechanism)problems.push(...review.issues.filter(i=>['parts','clearance','contact','thin'].includes(i.kind)).map(i=>i.text));
 else {
  if(pieces.length>1)problems.push('tiene '+pieces.length+' partes que no se tocan: metelas al menos 1,5 mm dentro de la parte vecina para que todo sea un solo sólido continuo');
  if(review.issues.some(i=>i.kind==='contact'))problems.push('apoya muy poco en la cama: cortá una base plana amplia en z=0');
 }
 const off=(expected||[]).map((want,i)=>want>0&&Math.abs(built.dimensions[i]-want)>Math.max(.5,want*.01)?axes[i]+' '+want+' mm':'').filter(Boolean);
 if(off.length)problems.push('debe medir '+off.join(', ')+(mechanism?': ajustá los parámetros externos conservando la holgura y pared absolutas, SIN escalar el mecanismo':': ajustá sus dimensiones conservando la forma'));
 return {problems,score:problems.length,review};
}
