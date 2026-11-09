import {buildKeychain,validateKeychain,keychainUrl} from './keychain.js';
import {validateForgeArchive} from '../shared/forge-schema.js';
import {validateGeneration} from './generation-spec.js';
import QRCode from 'qrcode';
import {validateProgram,buildSolidProgram,withImport} from './solid-program.js';
import {maxStoredTriangles} from './mesh-import.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import sansData from 'three/examples/fonts/helvetiker_bold.typeface.json' with { type: 'json' };
import serifData from 'three/examples/fonts/gentilis_bold.typeface.json' with { type: 'json' };
// Templates prefer a bold sans: its strokes stay printable at small sizes. It lacks accents and Ñ,
// so a piece whose texts need them uses Gentilis throughout instead of altering the name.
const sansFont = new FontLoader().parse(sansData), serifFont = new FontLoader().parse(serifData);
const covers=(f,texts)=>texts.every(t=>[...String(t||'').normalize('NFC')].every(c=>c===' '||f.data.glyphs[c]));
export function templateFont(p){const texts=p.kind==='tag'?[p.name,p.phone]:p.kind==='logo'?[p.caption]:[];return covers(sansFont,texts)?sansFont:serifFont;}
export const defaults = {version:3,kind:'tag',project:'Chapita de Mora',name:'MORA',phone:'11 2345 6789',qrText:'https://example.com',caption:'HECHO CON AMOR',shape:'round',width:45,height:32,thickness:2.4,relief:0.8,hole:4,baseColor:'#e9a08c',detailColor:'#fff8e9',backDecoration:'none',backStyle:'engraved',backDepth:.6,logoPolygons:null,freeDesign:null,importedMesh:null,sourceInfo:null,printRotation:[0,0,0],forge:null,keychain:null};
const limits={width:[25,100],height:[25,100],thickness:[1.6,6],relief:[.4,2],hole:[2,6],backDepth:[.2,1.2]};
export function validate(raw){
  const p={};
  for(const k of Object.keys(defaults))p[k]=raw[k]??defaults[k];
  if(!['tag','qr','logo','free','keychain'].includes(p.kind)||!['circle','round','oval','bone'].includes(p.shape))throw Error('Tipo de diseño o forma inválidos.');
  if(p.importedMesh!==null){const m=p.importedMesh;if(!m||typeof m.name!=='string'||m.name.length>120||!Array.isArray(m.vertices)||!Array.isArray(m.triangles)||m.vertices.length%3||m.triangles.length%3||!m.triangles.length||m.triangles.length>maxStoredTriangles*3)throw Error('La pieza importada es inválida o demasiado compleja.');if(!m.vertices.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1000))throw Error('La pieza importada tiene coordenadas inválidas.');const count=m.vertices.length/3;if(!m.triangles.every(v=>Number.isInteger(v)&&v>=0&&v<count))throw Error('La pieza importada tiene triángulos inválidos.');}
  if(p.freeDesign!==null)validateProgram(withImport(p.freeDesign,p));
  p.forge=validateForgeArchive(p.forge);
  if(p.kind!=='free'||!p.freeDesign?.nodes.some(n=>n.type==='imported'))p.importedMesh=null;
  p.sourceInfo=p.importedMesh&&p.sourceInfo?validateGeneration(p.sourceInfo):null;
  if(p.kind!=='free')p.forge=null;
  if(!Array.isArray(p.printRotation)||p.printRotation.length!==3||!p.printRotation.every(v=>[-180,-90,0,90,180].includes(v)))throw Error('Orientación de impresión inválida.');
  if(p.kind!=='free')p.printRotation=[0,0,0];
  if(p.kind==='free'&&!p.freeDesign)throw Error('Describí la pieza libre al asistente para generar su geometría.');
  if(!['none','bone'].includes(p.backDecoration)||!['engraved','raised'].includes(p.backStyle))throw Error('Decoración del dorso inválida.');
  for(const [key,[min,max]] of Object.entries(limits)){p[key]=p.kind==='free'?defaults[key]:Number(p[key]);if(!Number.isFinite(p[key])||p[key]<min||p[key]>max)throw Error(`Revisá ${key}: debe estar entre ${min} y ${max} mm.`);}
  // Legacy "round" projects are rounded rectangles. A circle has one diameter.
  if(p.kind!=='free'&&p.shape==='circle')p.height=p.width;
  for(const [key,max] of Object.entries({project:60,name:20,phone:24,qrText:180,caption:20})){if(typeof p[key]!=='string'||p[key].length>max)throw Error(`El campo ${key} es demasiado largo.`);}
  if(p.kind==='keychain'){p.keychain=validateKeychain(p.keychain);p.qrText=keychainUrl(p.qrText);}
  if(p.kind==='qr'&&!p.qrText.trim())throw Error('Agregá el texto o enlace del QR.');
  if(p.kind==='tag'&&!p.name.trim())throw Error('Agregá el nombre de la mascota.');
  for(const key of ['baseColor','detailColor'])if(!/^#[a-f0-9]{6}$/i.test(p[key]))throw Error('Color inválido.');
  if(p.logoPolygons!==null){if(!Array.isArray(p.logoPolygons)||p.logoPolygons.length>500)throw Error('Logo demasiado complejo.');let n=0;for(const poly of p.logoPolygons){if(!Array.isArray(poly)||poly.length<3)throw Error('Contorno inválido.');for(const pt of poly){if(!Array.isArray(pt)||pt.length!==2||!pt.every(v=>Number.isFinite(v)&&Math.abs(v)<1e7))throw Error('Punto de logo inválido.');n++;}}if(n>20000)throw Error('Logo demasiado complejo.');}
  return p;
}
function shapePolygons(shapes){return shapes.flatMap(s=>{const points=s.extractPoints(8);return [points.shape,...points.holes].map(poly=>poly.map(v=>[v.x,v.y]));});}
export function qrMatrix(text){return QRCode.create(text,{errorCorrectionLevel:'M'}).modules;}
export function buildModel(api,raw){
 const p=validate(raw),{CrossSection:C,Manifold:M}=api,owned=[];
 if(p.kind==='free')return buildSolidProgram(api,p.freeDesign,p);
 if(p.kind==='keychain')return buildKeychain(api,p);
 const own=x=>(owned.push(x),x);
 try{
  const w=p.width,h=p.height,t=p.thickness,r=p.relief;
  const contour=[];
  if(p.shape==='oval'||p.shape==='circle'){for(let i=0;i<128;i++){const a=2*Math.PI*i/128;contour.push([Math.cos(a)*w/2,Math.sin(a)*h/2]);}}
  else{const cr=Math.min(5,w/5,h/5);for(const [cx,cy,start] of [[w/2-cr,h/2-cr,0],[-w/2+cr,h/2-cr,90],[-w/2+cr,-h/2+cr,180],[w/2-cr,-h/2+cr,270]])for(let i=0;i<=16;i++){const a=(start+i*90/16)*Math.PI/180;contour.push([cx+cr*Math.cos(a),cy+cr*Math.sin(a)]);}}
  let outline;
  if(p.shape==='bone'){const pieces=[own(C.square([20,5.2],true))];for(const x of [-10,10])for(const y of [-2.8,2.8])pieces.push(own(own(C.circle(3.4,48)).translate([x,y])));outline=own(own(C.union(pieces)).scale([w/26.8,h/12.4]));}
  else outline=own(new C([contour],'EvenOdd'));
  const holePosition=p.shape==='bone'?[-w*10/26.8,h*2.8/12.4]:[0,h/2-p.hole/2-2.5];
  const hole=own(own(C.circle(p.hole/2,48)).translate(holePosition));
  const holeInside=own(hole.intersect(outline));if(hole.area()-holeInside.area()>.01)throw Error('El agujero no cabe en esta forma. Reducí su diámetro o aumentá la base.');
  const base2=own(outline.subtract(hole));
  let base=own(base2.extrude(t));
  const details=[],warnings=[],font=templateFont(p);let qr=null;
  function fit(polys,maxW,maxH,cx,cy,flip=false){
   if(!polys.length)return;
   const pts=polys.flat();const xs=pts.map(v=>v[0]),ys=pts.map(v=>v[1]);
   const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
   if(xmax-xmin<1e-6||ymax-ymin<1e-6)return;
   const s=Math.min(maxW/(xmax-xmin),maxH/(ymax-ymin));
   const transformed=polys.map(poly=>poly.map(([x,y])=>[(x-(xmin+xmax)/2)*s+cx,(y-(ymin+ymax)/2)*s*(flip?-1:1)+cy]));
   const cross=own(new C(transformed,'EvenOdd'));
   details.push(cross);
   if(maxH<2.8)warnings.push('Hay detalles pequeños: revisá el ancho de línea y el laminado.');
  }
  function text(value,maxW,maxH,y){
   const clean=value.normalize('NFC').trim();
   const unsupported=[...clean].filter(c=>c!==' '&&!font.data.glyphs[c]);
   if(unsupported.length)throw Error(`La tipografía no incluye: ${[...new Set(unsupported)].join(' ')}. Usá otros caracteres.`);
   if(clean)fit(shapePolygons(font.generateShapes(clean,10)),maxW,maxH,0,y);
   if(clean.length>14)warnings.push('Texto largo: verificá que las letras pequeñas se impriman con claridad.');
  }
  if(p.kind==='tag'){
   text(p.name,w*(p.shape==='bone'?.48:.72),h*(p.shape==='bone'?.15:.23),h*(p.shape==='bone'?.065:-.005));
   text(p.phone,w*(p.shape==='bone'?.48:.72),Math.min(3.1,h*(p.shape==='bone'?.075:.105)),-h*(p.shape==='bone'?.12:.25));
  }else if(p.kind==='qr'){
   const matrix=qrMatrix(p.qrText);const size=Math.min(w*(['oval','circle'].includes(p.shape)?.62:1)-8,h-16);
   const module=size/(matrix.size+8);const polys=[];
   for(let row=0;row<matrix.size;row++)for(let col=0;col<matrix.size;col++)if(matrix.get(row,col)){
    const x=(col+4)*module-size/2,y=size/2-(row+5)*module-3;
    polys.push([[x,y],[x+module,y],[x+module,y+module],[x,y+module]]);
   }
   details.push(own(new C(polys,'NonZero')));qr={matrix,size,module,quietZone:4};
   warnings.push(`QR: módulo de ${module.toFixed(2)} mm. Probá su lectura después de imprimir.`);
   if(module<.8)warnings.push('QR muy fino como punto de partida con boquilla de 0,4 mm. Aumentá la base o acortá el enlace.');
   const lum=hex=>{const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};
   if(lum(p.baseColor)<lum(p.detailColor))warnings.push('Para el QR se recomienda base clara y módulos oscuros.');
   if((Math.max(lum(p.baseColor),lum(p.detailColor))+.05)/(Math.min(lum(p.baseColor),lum(p.detailColor))+.05)<4.5)warnings.push('Los colores tienen poco contraste para leer el QR.');
  }else{
   const star=Array.from({length:10},(_,i)=>{const a=Math.PI/2+i*Math.PI/5,rad=i%2?4.5:10;return [Math.cos(a)*rad,Math.sin(a)*rad];});
   fit(p.logoPolygons||[star],w*.60,h*.36,0,-h*.015,Boolean(p.logoPolygons));
   text(p.caption,w*.67,Math.min(2.8,h*.10),-h*.30);
   if(!p.logoPolygons)warnings.push('Se muestra un símbolo de ejemplo. Importá tu logo SVG para reemplazarlo.');
  }
  const detail2=own(C.union(details));
  // Clip only as a safety check; never silently export a cut-off inscription.
  const inside=own(detail2.intersect(base2));
  if(detail2.area()-inside.area()>.01)throw Error('El contenido invade el borde o el agujero. Aumentá la base o cambiá su forma.');
  let detail=own(own(detail2.extrude(r)).translate([0,0,t]));
  let backArea=0;
  if(p.backDecoration==='bone'){
   const pieces=[own(C.square([20,5.2],true))];
   for(const x of [-10,10])for(const y of [-2.8,2.8])pieces.push(own(own(C.circle(3.4,48)).translate([x,y])));
   const bone=own(C.union(pieces));
   const scale=Math.min(w*.60/26.8,h*.30/12.4);
   const back=own(own(bone.scale([scale,scale])).translate([0,-h*.05]));
   const insideBack=own(back.intersect(base2));
   if(back.area()-insideBack.area()>.01)throw Error('El huesito invade el borde o el agujero. Aumentá la base.');
   backArea=back.area();
   if(p.backStyle==='engraved'){
    base=own(base.subtract(own(back.extrude(p.backDepth))));
   }else{
    base=own(base.translate([0,0,p.backDepth]));
    detail=own(M.union([own(detail.translate([0,0,p.backDepth])),own(back.extrude(p.backDepth))]));
    warnings.push('Hay relieve en ambas caras. Revisá la orientación y los soportes en Bambu Studio antes de imprimir.');
   }
  }
  const combined=own(M.union([base,detail]));
  if(combined.status()!=='NoError'||combined.isEmpty())throw Error('No se pudo cerrar la geometría. Revisá el diseño.');
  const mesh=x=>{const m=x.getMesh();return {numProp:m.numProp,positions:new Float32Array(m.vertProperties),triangles:new Uint32Array(m.triVerts)};};
  return {params:p,base:mesh(base),detail:mesh(detail),combined:mesh(combined),volume:combined.volume(),backArea,totalHeight:t+r+(p.backDecoration==='bone'&&p.backStyle==='raised'?p.backDepth:0),warnings:[...new Set(warnings)],qr};
 }finally{for(const x of owned.reverse())x.delete();}
}
