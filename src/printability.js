// Print review for an FDM printer (0.4 mm nozzle, 0.2 mm layers): overhangs that need support,
// walls too thin to print, bed contact, best orientation and material/time/cost estimates.
// All numbers are approximations meant to warn early; the slicer has the final word.
import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';

export const printDefaults={minWall:.8,overhangDeg:45,layer:.2,density:1.24,infill:.15,shell:.84,flow:12,layerSeconds:4,warmupSeconds:300};

function triangles(mesh){
 const {positions:p,triangles:t,numProp:n}=mesh,count=t.length/3,out=new Float32Array(count*9);
 for(let i=0;i<count;i++)for(let k=0;k<3;k++){const v=t[i*3+k]*n;out[i*9+k*3]=p[v];out[i*9+k*3+1]=p[v+1];out[i*9+k*3+2]=p[v+2];}
 return out;
}
function rotateSoup(soup,[rx,ry,rz]){
 if(!rx&&!ry&&!rz)return soup;const m=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx*Math.PI/180,ry*Math.PI/180,rz*Math.PI/180,'ZYX')),v=new THREE.Vector3(),out=new Float32Array(soup.length);
 for(let i=0;i<soup.length;i+=3){v.set(soup[i],soup[i+1],soup[i+2]).applyMatrix4(m);out[i]=v.x;out[i+1]=v.y;out[i+2]=v.z;}
 return out;
}
// Per-triangle normal, area and centroid height, plus the overhang / bed-contact areas.
function surfaceStats(soup,opts){
 const count=soup.length/9,limit=-Math.cos((90-opts.overhangDeg)*Math.PI/180);
 let minZ=Infinity,maxZ=-Infinity;for(let i=2;i<soup.length;i+=3){minZ=Math.min(minZ,soup[i]);maxZ=Math.max(maxZ,soup[i]);}
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();
 let area=0,overhang=0,contact=0,supportVolume=0;const flagged=[];
 for(let i=0;i<count;i++){
  a.fromArray(soup,i*9);b.fromArray(soup,i*9+3);c.fromArray(soup,i*9+6);n.subVectors(b,a).cross(c.clone().sub(a));const ar=n.length()/2;if(!ar)continue;n.normalize();area+=ar;
  const z=(a.z+b.z+c.z)/3,onBed=Math.max(a.z,b.z,c.z)-minZ<.05;
  if(onBed&&n.z<-.99)contact+=ar;
  else if(n.z<limit&&z-minZ>opts.layer){overhang+=ar;supportVolume+=ar*Math.abs(n.z)*(z-minZ)*.15;flagged.push(i);}
 }
 return {area,overhang,contact,supportVolume,flagged,height:maxZ-minZ};
}
const orientations=[[0,0,0],[180,0,0],[90,0,0],[-90,0,0],[0,90,0],[0,-90,0]];

// Partes que no se tocan entre sí: se imprimirían sueltas. Une vértices por posición (malla indexada o no).
// Componentes conectados de la malla, de mayor a menor superficie, con su caja envolvente.
// La superficie de un hueco cerrado (caras hacia adentro, volumen negativo) no es una parte suelta:
// se suma a la parte más chica que la contiene, así quitar partes nunca rellena un hueco.
export function partsOf(mesh){
 const p=mesh.positions,k=mesh.numProp,t=mesh.triangles,ids=new Map(),index=new Int32Array(p.length/k);
 for(let v=0;v<index.length;v++){const key=Math.round(p[v*k]*1e3)+','+Math.round(p[v*k+1]*1e3)+','+Math.round(p[v*k+2]*1e3);let id=ids.get(key);if(id===undefined){id=ids.size;ids.set(key,id);}index[v]=id;}
 const parent=new Int32Array(ids.size).map((_,i)=>i),find=x=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;};
 for(let i=0;i<t.length;i+=3){const a=find(index[t[i]]),b=find(index[t[i+1]]),c=find(index[t[i+2]]);parent[b]=a;parent[find(c)]=a;}
 const groups=new Map(),at=i=>[p[t[i]*k],p[t[i]*k+1],p[t[i]*k+2]];
 for(let i=0;i<t.length;i+=3){
  const root=find(index[t[i]]);let g=groups.get(root);if(!g){g={triangles:[],area:0,volume:0,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};groups.set(root,g);}
  const A=at(i),B=at(i+1),C=at(i+2),u=[B[0]-A[0],B[1]-A[1],B[2]-A[2]],w=[C[0]-A[0],C[1]-A[1],C[2]-A[2]];
  g.area+=Math.hypot(u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0])/2;g.triangles.push(i/3);
  g.volume+=(A[0]*(B[1]*C[2]-B[2]*C[1])+A[1]*(B[2]*C[0]-B[0]*C[2])+A[2]*(B[0]*C[1]-B[1]*C[0]))/6;
  for(const P of [A,B,C])for(let j=0;j<3;j++){g.min[j]=Math.min(g.min[j],P[j]);g.max[j]=Math.max(g.max[j],P[j]);}
 }
 const all=[...groups.values()],solids=all.filter(g=>g.volume>=0),holes=all.filter(g=>g.volume<0);
 // Una malla entera al revés no tiene partes «sólidas»: se cuenta tal cual.
 if(!solids.length)return all.sort((x,y)=>y.area-x.area);
 const inside=(h,g)=>[0,1,2].every(j=>g.min[j]<=h.min[j]+1e-6&&h.max[j]<=g.max[j]+1e-6);
 for(const h of holes){
  const owner=solids.filter(g=>inside(h,g)).sort((x,y)=>x.volume-y.volume)[0];
  if(!owner){solids.push(h);continue;}
  owner.triangles.push(...h.triangles);owner.area+=h.area;owner.volume+=h.volume;
 }
 return solids.sort((x,y)=>y.area-x.area);
}
// Malla con solo los triángulos de las partes elegidas (para quitar detalles sueltos diminutos).
export function keepParts(mesh,parts){const tri=[];for(const g of parts)for(const i of g.triangles)tri.push(mesh.triangles[i*3],mesh.triangles[i*3+1],mesh.triangles[i*3+2]);return {...mesh,triangles:new Uint32Array(tri)};}
export const countParts=mesh=>partsOf(mesh).length;
export function reviewPrint(mesh,volume,options={}){
 const opts={...printDefaults,...options},soup=triangles(mesh),stats=surfaceStats(soup,opts);
 // Thin walls: from each sampled face, a ray goes inward; the distance to the opposite surface is the local thickness.
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(soup,3));
 const bvh=new MeshBVH(geometry),ray=new THREE.Ray(),count=soup.length/9,step=Math.max(1,Math.floor(count/6000)),thin=[],thinHits=[];let thinArea=0,minWall=Infinity;
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();
 for(let i=0;i<count;i+=step){
  a.fromArray(soup,i*9);b.fromArray(soup,i*9+3);c.fromArray(soup,i*9+6);n.subVectors(b,a).cross(c.clone().sub(a));const ar=n.length()/2;if(ar<1e-6)continue;n.normalize();
  ray.origin.copy(a).add(b).add(c).multiplyScalar(1/3).addScaledVector(n,-1e-3);ray.direction.copy(n).negate();
  const hit=bvh.raycastFirst(ray,THREE.DoubleSide);if(!hit||hit.distance<.1)continue;// shorter hits are touching bodies (base + relief), not walls
  if(hit.face&&hit.face.normal.dot(ray.direction)<=0)continue;// hit a surface facing us: not the opposite wall
  minWall=Math.min(minWall,hit.distance);if(hit.distance<opts.minWall){thin.push(i);thinArea+=ar*step;thinHits.push(hit.distance);}
 }
 // Best orientation: least support area, with enough surface touching the bed.
 const ranking=orientations.map(rotation=>{const s=rotation===orientations[0]?stats:surfaceStats(rotateSoup(soup,rotation),opts);return {rotation,overhang:s.overhang,contact:s.contact,score:s.overhang-Math.min(s.contact,400)*.5+(s.contact<20?500:0)};}).sort((x,y)=>x.score-y.score);
 const best=ranking[0],current=ranking.find(r=>r.rotation===orientations[0]);
 const suggestion=best.rotation!==orientations[0]&&best.overhang<current.overhang*.6-10?best:null;
 // Material and time. A mesh with its faces reversed has negative volume; the material never is.
 volume=Math.abs(Number(volume)||0);
 const shell=Math.min(volume,stats.area*opts.shell),material=shell+Math.max(0,volume-shell)*opts.infill+stats.supportVolume;
 const grams=material/1000*opts.density,layers=Math.ceil(stats.height/opts.layer),seconds=material/opts.flow+layers*opts.layerSeconds+opts.warmupSeconds;
 const issues=[];
 const parts=countParts(mesh);if(parts>1)issues.push({kind:'parts',text:`Tiene ${parts} partes que no se tocan: se imprimirían sueltas.`});
 if(stats.overhang>20)issues.push({kind:'overhang',text:`Voladizos de ${Math.round(stats.overhang)} mm² con más de ${opts.overhangDeg}°: van a necesitar soportes.`});
 // Tips of letters and sharp corners are always thin at the very end: only warn when a real area is affected.
 const typical=thinHits.sort((x,y)=>x-y)[Math.floor(thinHits.length/2)];
 if(thinArea>Math.max(4,stats.area*.03))issues.push({kind:'thin',text:`Unos ${Math.round(thinArea)} mm² tienen paredes de ~${typical.toFixed(2).replace('.',',')} mm, por debajo de ${String(opts.minWall).replace('.',',')} mm: pueden no imprimirse o quedar frágiles (en naranja al marcar en la pieza).`});
 if(stats.contact<Math.min(60,stats.area*.02))issues.push({kind:'contact',text:`Apoya solo ${Math.round(stats.contact)} mm² en la cama: conviene usar borde (brim) o reorientar.`});
 return {grams,seconds,layers,material,supportVolume:stats.supportVolume,overhangArea:stats.overhang,contactArea:stats.contact,minWall:Number.isFinite(minWall)?minWall:null,thinArea,issues,suggestion,
  highlight:{overhang:subset(soup,stats.flagged),thin:subset(soup,thin)}};
}
function subset(soup,ids){const positions=new Float32Array(ids.length*9),tri=new Uint32Array(ids.length*3);ids.forEach((id,k)=>{positions.set(soup.subarray(id*9,id*9+9),k*9);tri.set([k*3,k*3+1,k*3+2],k*3);});return {numProp:3,positions,triangles:tri};}

export function costOf(review,settings){
 const hours=review.seconds/3600,material=review.grams/1000*settings.pricePerKg,machine=hours*settings.hourly,cost=material+machine+settings.extra,price=cost*(1+settings.margin/100);
 return {hours,material,machine,cost,price};
}
export function durationText(seconds){const m=Math.round(seconds/60);return m<60?`${m} min`:`${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')} min`;}
// Combines the orientation already applied with a suggested one (engine order: X, then Y, then Z), in 90° steps.
export function composeRotation(current,extra){
 const toM=r=>new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...r.map(v=>v*Math.PI/180),'ZYX'));
 const e=new THREE.Euler().setFromRotationMatrix(toM(extra).multiply(toM(current)),'ZYX');
 return [e.x,e.y,e.z].map(v=>{let d=Math.round(v*180/Math.PI/90)*90;if(d===-180)d=180;return d===0?0:d;});
}
