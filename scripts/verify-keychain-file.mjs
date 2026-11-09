// Inspect the meshes and underside colors in the file actually downloaded from Alfred.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import {unzipSync,strFromU8} from 'fflate';
import {qrFromExport} from './keychain-qr-check.mjs';
import {countParts,reviewPrint} from '../src/printability.js';
import {validate} from '../src/model.js';

const [file,expected,reportFile]=process.argv.slice(2);
if(!file||!expected)throw Error('Uso: node scripts/verify-keychain-file.mjs archivo.3mf URL_ESPERADA [reporte.json]');
const bytes=await fs.readFile(file),files=unzipSync(bytes),xml=strFromU8(files['3D/3dmodel.model']);
const params=validate(JSON.parse(strFromU8(files['Metadata/taller-de-vero.json'])));
assert.equal(params.kind,'keychain');assert.equal(params.qrText,expected);
assert.match(xml,/unit="millimeter"/);
const decoded=qrFromExport(bytes,Math.min(params.width-8,params.height-18));
assert.equal(decoded,expected,'El QR debe leerse desde los triángulos exportados del dorso');
const api=await Module();api.setup();const solids=[];
try{
 for(const object of xml.matchAll(/<object [^>]*><mesh><vertices>(.*?)<\/vertices><triangles>(.*?)<\/triangles><\/mesh><\/object>/gs)){
  const positions=Float32Array.from([...object[1].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].flatMap(m=>m.slice(1).map(Number)));
  const triangles=Uint32Array.from([...object[2].matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)].flatMap(m=>m.slice(1).map(Number)));
  const solid=new api.Manifold(new api.Mesh({numProp:3,vertProperties:positions,triVerts:triangles}));
  assert.equal(solid.status(),'NoError','Cada color debe ser un sólido cerrado');solids.push(solid);
 }
 // Parts can be more than colors (the logo text is its own part); filaments are what the AMS limits.
 const filaments=new Set([...xml.matchAll(/displaycolor="(#[A-Fa-f\d]{6})FF"/g)].map(m=>m[1].toUpperCase()));
 assert.ok(solids.length>=2);assert.ok(filaments.size>=2&&filaments.size<=4,'Hasta 4 filamentos para el AMS');
 const union=api.Manifold.union(solids);
 try{
  assert.equal(union.status(),'NoError');assert.ok(Math.abs(solids.reduce((sum,s)=>sum+s.volume(),0)-union.volume())<.01,'Colores sin solapamiento');
  const raw=union.getMesh(),mesh={numProp:raw.numProp,positions:raw.vertProperties,triangles:raw.triVerts};
  assert.equal(countParts(mesh),1,'Los colores forman una única pieza física');
  const bbox=union.boundingBox(),dimensions=bbox.max.map((v,i)=>Math.round((v-bbox.min[i])*100)/100);
  assert.deepEqual(dimensions,[params.width,params.height,Math.round((params.thickness+params.relief)*100)/100]);
  const review=reviewPrint(mesh,union.volume());assert.equal(review.issues.filter(i=>i.kind!=='ok').length,0,'La revisión geométrica no debe detectar problemas');
  const report={file:path.resolve(file),qrDecodedFromExportedTriangles:decoded,dimensionsMm:dimensions,colors:filaments.size,parts:solids.length,watertight:true,overlapMm3:solids.reduce((sum,s)=>sum+s.volume(),0)-union.volume(),physicalPieces:1,triangles:mesh.triangles.length/3,volumeMm3:union.volume(),logo:params.keychain.name,reviewIssues:review.issues,physicalPrintVerified:false,slicerVerified:false};
  if(reportFile)await fs.writeFile(reportFile,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{union.delete();}
}finally{solids.forEach(s=>s.delete());}
