// Reproducible offline checks for expert-reviewed challenge fixtures. No OpenAI call.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import Module from 'manifold-3d';
import {runForge} from '../server/forge.js';
import {defaults} from '../src/model.js';
import {prepareForgeProposal,appendForgeRevision,revisionFromResult} from '../src/forge-project.js';
import {reviewForge} from '../src/forge-review.js';
import {sampleMotion} from '../src/mechanism-motion.js';
import {stlBytes,threeMfBytes} from '../src/export.js';
import {handoffZip} from '../src/handoff.js';
const fixtures=path.resolve('experiments/alfred-forge/challenges'),output=path.resolve(process.env.PREMIUM_OUTPUT||'artifacts/premium-verification');await fs.mkdir(output,{recursive:true});
const manifest=JSON.parse(await fs.readFile(path.join(fixtures,'manifest.json'),'utf8')),api=await Module();api.setup();const report=[];
for(const fixture of manifest){
 const scad=await fs.readFile(path.join(fixtures,fixture.id+'.scad'),'utf8'),result=await runForge({action:'compile',scad});
 Object.assign(result,{manufacturing:fixture.manufacturing,description:fixture.description,caveats:['Prototipo: falta validar una muestra física.']});
 const checked=prepareForgeProposal(api,defaults,result,appendForgeRevision(null,revisionFromResult(result,fixture.description))),review=reviewForge(checked,fixture.size);
 const motion=(fixture.motion||[]).map(s=>sampleMotion(api,checked.built.combined,s));
 const entry={id:fixture.id,sourceSha256:createHash('sha256').update(scad).digest('hex'),dimensions:checked.built.dimensions,parts:review.review.mechanism.parts,minGap:review.review.mechanism.minGap,problems:review.problems,motion,digitalPassed:!review.problems.length&&motion.every(m=>m.passed),physicalVerified:false};
 report.push(entry);
 for(const [ext,data] of Object.entries({json:JSON.stringify(checked.candidate,null,2),stl:stlBytes(checked.built.combined),'3mf':threeMfBytes(checked.built),zip:handoffZip(checked.built,fixture.id)}))await fs.writeFile(path.join(output,fixture.id+'.'+ext),data);
 console.log(JSON.stringify({...entry,motion:motion.map(m=>({name:m.name,passed:m.passed,maxCollisionMm3:m.maxCollisionMm3,samples:m.samples.length}))}));
 await fs.writeFile(path.join(output,'reporte.json'),JSON.stringify(report,null,2));
}
if(report.some(r=>!r.digitalPassed))process.exitCode=1;
