// Live challenges: uses the existing server key and consumes API credit. No printing or sending to a printer.
import fs from 'node:fs/promises';
import Module from 'manifold-3d';
import {proposeDesign} from '../server/assistant.js';
import {runForge} from '../server/forge.js';
import {defaults} from '../src/model.js';
import {prepareForgeProposal,appendForgeRevision,revisionFromResult} from '../src/forge-project.js';
import {reviewForge} from '../src/forge-review.js';
import {manufacturingOf} from '../shared/manufacturing.js';
import {handoffZip} from '../src/handoff.js';
import {stlBytes,threeMfBytes} from '../src/export.js';

export const challenges=[
 {id:'bisagra',parts:2,size:[60,30,0],prompt:'Diseñá una bisagra funcional print-in-place abierta de 60 mm de ancho X por 30 mm de profundidad Y, con dos hojas horizontales apoyadas en la cama, eje horizontal cautivo integrado y holgura de 0,4 mm ENTRE SUPERFICIES en XY y Z. PLA, boquilla 0,4. Sin tornillos externos ni soportes atrapados. Debe abrir y cerrar, con chaflanes y topes resistentes. Elegí medidas restantes. Prepará un prototipo exigente para evaluar calidad comercial, sin afirmar validación física.'},
 {id:'cadena',parts:5,size:[0,0,0],prompt:'Diseñá una cadena articulada print-in-place de exactamente 5 eslabones cautivos interconectados. Deben moverse entre sí, sin pegarse y sin base común. Todos apoyados en z=0, paredes de 2 mm, holgura mínima 0,4 mm ENTRE SUPERFICIES, sin soportes atrapados. Elegí un largo total entre 100 y 150 mm. PLA, boquilla 0,4 mm. Cuidá la apariencia, chaflanes y resistencia de los pivotes.'},
 {id:'engranajes',parts:3,size:[0,0,0],prompt:'Diseñá dos engranajes funcionales que engranen entre sí, uno de 12 y otro de 24 dientes, con ejes cautivos sobre UNA base común (base y ejes forman un cuerpo; cada rueda es un cuerpo móvil: exactamente 3 cuerpos). Print-in-place, módulo 2 mm, perfil involuta de 20 grados, holgura mínima 0,4 mm ENTRE superficies de ruedas y ejes/base y juego entre flancos sin interferencias. Todos los cuerpos deben apoyar en la cama sin soportes atrapados; podés resolver la base como marco alrededor de las ruedas y ejes con retén autosustentado. PLA boquilla 0,4, paredes de 2 mm y chaflanes. Si hay conflicto geométrico, resolvelo sin eliminar la función.'},
 {id:'caja',parts:2,size:[0,0,0],prompt:'Diseñá una caja premium con tapa deslizante de encastre: caja exterior 80 x 50 x 30 mm, paredes de 2 mm y guías de cola de milano a 45 grados para la tapa. Tapa impresa al lado con cara plana en la cama, 0,4 mm ENTRE superficies de encastre, chaflanes de entrada y uñero; exactamente 2 cuerpos, ensamblaje posterior. Sin soportes. PLA, boquilla 0,4. Mantené la caja de 80 x 50 x 30 y elegí la disposición de impresión de la tapa.'}
];
const dir=process.env.EVAL_DIR||'artifacts/premium-20261116/mejorado',selected=process.argv.slice(2),cases=selected.length?challenges.filter(c=>selected.includes(c.id)):challenges;
await fs.mkdir(dir,{recursive:true});
const api=await Module();api.setup();const report=[];
for(const task of cases){
 const start=Date.now(),entry={id:task.id,prompt:task.prompt,physicalVerified:false,motionVerified:false,slicerVerified:false};
 try{
  const route=await proposeDesign({prompt:task.prompt,params:defaults,currentEngine:'none'},process.env.OPENAI_API_KEY);
  entry.route=route.route;await fs.writeFile(`${dir}/${task.id}-route.json`,JSON.stringify(route,null,2));
  if(route.route!=='forge')throw Error('Camino incorrecto: '+route.route+' '+route.message);
  // Preserve the user's complete challenge even if the router summarizes away a constraint.
  const prompt=task.prompt;
  let result=await runForge({action:'generate',prompt}),archive=appendForgeRevision(null,revisionFromResult(result,prompt));
  let checked=prepareForgeProposal(api,defaults,result,archive),review=reviewForge(checked,task.size);
  entry.attempts=[{spec:manufacturingOf(checked.candidate),problems:review.problems}];
  await fs.writeFile(`${dir}/${task.id}-initial.json`,JSON.stringify(result,null,2));
  if(review.problems.length){
   const fixed=await runForge({action:'generate',prompt:'Corregí este mecanismo: '+review.problems.join('; ').slice(0,1500)+'. Conservá su función, número de cuerpos y holgura original. No unas cuerpos móviles. Devolvé el programa completo.',previous:result.scad,previousManufacturing:result.manufacturing,previousFinish:result.finish});
   const next=appendForgeRevision(archive,revisionFromResult(fixed,prompt+' · corregida')),candidate=prepareForgeProposal(api,defaults,fixed,next),again=reviewForge(candidate,task.size);
   entry.attempts.push({spec:manufacturingOf(candidate.candidate),problems:again.problems});
   if(again.score<review.score){result=fixed;archive=next;checked=candidate;review=again;}
  }
  const m=checked.built,spec=manufacturingOf(checked.candidate),r=review.review;
  Object.assign(entry,{spec,dimensions:m.dimensions,parts:r.mechanism?.parts,measuredMinGap:r.mechanism?.minGap,problems:review.problems,issues:r.issues,triangles:m.combined.triangles.length/3,expectedParts:task.parts,digitalPassed:spec.mode!=='single'&&spec.expectedParts===task.parts&&r.mechanism?.parts===task.parts&&!review.problems.length});
  for(const [ext,bytes] of Object.entries({scad:result.scad,json:JSON.stringify(checked.candidate,null,2),stl:stlBytes(m.combined),'3mf':threeMfBytes(m),zip:handoffZip(m,task.id)}))await fs.writeFile(`${dir}/${task.id}.${ext}`,bytes);
 }catch(e){entry.error=e.message;entry.digitalPassed=false;}
 entry.seconds=Math.round((Date.now()-start)/1000);report.push(entry);console.log(JSON.stringify(entry));
 await fs.writeFile(dir+'/reporte.json',JSON.stringify(report,null,2));
}
if(report.some(r=>!r.digitalPassed))process.exitCode=1;
