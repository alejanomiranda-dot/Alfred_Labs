// Acabado orgánico: suaviza la malla facetada que sale de OpenSCAD y le da una textura de superficie
// (cráteres, roca, madera, escamas, pelaje) sin perder lo que la hace imprimible: la malla sigue cerrada,
// la base plana queda intacta, las aristas vivas (aberturas, encastres, el borde de la base) no se deforman,
// ninguna pared baja de finishMinWall y la pieza conserva sus medidas.
import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';

export const finishTextures=['none','craters','rock','wood','scales','fur'];
export const finishLabels={none:'Liso',craters:'Cráteres',rock:'Roca',wood:'Madera',scales:'Escamas',fur:'Pelaje'};
// Profundidad y tamaño típicos de cada textura, en mm.
const typical={none:[0,8],craters:[1.2,12],rock:[.6,6],wood:[.4,8],scales:[.5,4],fur:[.5,3]};
export const finishMinWall=1.2;
const triangleBudget=150000,triangleLimit=190000;

export function defaultFinish(texture='none',smooth=.7){const [depth,scale]=typical[texture]||typical.none;return {texture,smooth,depth,scale,seed:1};}
export const hasFinish=f=>!!f&&(f.smooth>0||(f.texture!=='none'&&f.depth>0));

// ---- Ruido determinístico (mismo seed, misma pieza) ----
function hash(x,y,z,seed){let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^Math.imul(z|0,1274126177)^Math.imul(seed|0,-1640531535);h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h>>>0)/4294967296;}
const fade=t=>t*t*t*(t*(t*6-15)+10),lerp=(a,b,t)=>a+(b-a)*t;
function noise(x,y,z,seed){
 const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),u=fade(x-xi),v=fade(y-yi),w=fade(z-zi),h=(a,b,c)=>hash(xi+a,yi+b,zi+c,seed);
 return lerp(lerp(lerp(h(0,0,0),h(1,0,0),u),lerp(h(0,1,0),h(1,1,0),u),v),lerp(lerp(h(0,0,1),h(1,0,1),u),lerp(h(0,1,1),h(1,1,1),u),v),w)*2-1;
}
function fbm(x,y,z,seed,octaves=4){let a=.5,f=1,sum=0,norm=0;for(let i=0;i<octaves;i++){sum+=a*noise(x*f,y*f,z*f,seed+i*31);norm+=a;a*=.5;f*=2.03;}return sum/norm;}
// Distancia al punto más cercano (F1) y al segundo (F2) de una grilla con puntos desplazados al azar.
function cells(x,y,z,seed){
 const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z);let f1=9,f2=9;
 for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(let c=-1;c<=1;c++){
  const X=xi+a,Y=yi+b,Z=zi+c,dx=X+hash(X,Y,Z,seed)-x,dy=Y+hash(X,Y,Z,seed+1)-y,dz=Z+hash(X,Y,Z,seed+2)-z,d=Math.sqrt(dx*dx+dy*dy+dz*dz);
  if(d<f1){f2=f1;f1=d;}else if(d<f2)f2=d;
 }
 return [f1,f2];
}
function random(seed){let a=seed>>>0||1;return ()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const smoothstep=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};

// Altura de la textura (mm, positiva hacia afuera) en cada punto de la superficie.
function heightField(finish,pos,eligible,area){
 const {texture,depth:D,scale:S,seed}=finish;
 if(texture==='craters'){
  // Cráteres de verdad: cuenco con borde levantado; muchos chicos y pocos grandes, encimados como en la Luna.
  const rnd=random(seed*7919+13),count=Math.max(4,Math.min(160,Math.round(.55*area/(Math.PI*S*S)))),craters=[];
  for(let k=0;k<count*20&&craters.length<count&&eligible.length;k++){
   const v=eligible[Math.floor(rnd()*eligible.length)],R=S*(.28+1.25*rnd()**3);
   craters.push({x:pos[v*3],y:pos[v*3+1],z:pos[v*3+2],R,d:D*(.45+.55*Math.min(1,R/S))});
  }
  // Segunda capa: muchos cráteres chicos y poco profundos que cubren las zonas lisas, como en la Luna real.
  const small=Math.min(320,Math.round(.35*area/(Math.PI*(.22*S)**2)));
  for(let k=0;k<small&&eligible.length;k++){
   const v=eligible[Math.floor(rnd()*eligible.length)],R=S*(.1+.18*rnd());
   craters.push({x:pos[v*3],y:pos[v*3+1],z:pos[v*3+2],R,d:D*(.25+.2*rnd())});
  }
  // Grilla: cada punto revisa solo los cráteres de su celda y las vecinas (un cráter influye hasta 1,85 radios).
  const g=Math.max(...craters.map(c=>c.R),1)*1.85,grid=new Map(),cellOf=(x,y,z)=>Math.floor(x/g)+','+Math.floor(y/g)+','+Math.floor(z/g);
  for(const c of craters){const k=cellOf(c.x,c.y,c.z);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(c);}
  const near=(x,y,z)=>{const out=[],X=Math.floor(x/g),Y=Math.floor(y/g),Z=Math.floor(z/g);for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(let c=-1;c<=1;c++){const l=grid.get((X+a)+','+(Y+b)+','+(Z+c));if(l)out.push(...l);}return out;};
  return (x,y,z)=>{
   let bowl=0,rim=0;
   for(const c of near(x,y,z)){
    const dx=x-c.x,dy=y-c.y,dz=z-c.z,q=(dx*dx+dy*dy+dz*dz)/(c.R*c.R);if(q>3.4)continue;
    const r=Math.sqrt(q);if(r<1)bowl=Math.min(bowl,-c.d*(1-q));
    rim+=.24*c.d*Math.exp(-(((r-1.05)/.22)**2));
   }
   return Math.max(-D,Math.min(.4*D,bowl+rim))+.1*D*fbm(x*2/S,y*2/S,z*2/S,seed+5,3);
  };
 }
 // Roca y pelaje se tallan hacia adentro (0 a -D): la pieza no crece y sus medidas se mantienen.
 if(texture==='rock')return (x,y,z)=>{const n=fbm(x/S,y/S,z/S,seed,5),ridge=1-2*Math.abs(fbm(x/(2*S),y/(2*S),z/(2*S),seed+9,3));return D*(Math.max(-1,Math.min(1,.9*n+.35*ridge))-1)/2;};
 if(texture==='wood')return (x,y,z)=>{const v=(x*.8+y*.6)/(S*.18)+2.5*fbm(x/S,y/S,z/(4*S),seed,3),g=.5+.5*Math.sin(2*Math.PI*v);return -D*g*g*g;};
 if(texture==='scales')return (x,y,z)=>{const [f1,f2]=cells(x/S,y/S,z/S*1.4,seed);return -D*(1-smoothstep(0,.18,f2-f1))+.25*D*(1-Math.min(1,f1*1.2));};
 if(texture==='fur')return (x,y,z)=>D*(fbm(x/(.12*S),y/(.12*S),z/(.9*S),seed,3)-1)/2;
 return ()=>0;
}

// Fracción de rayos que salen de la pieza desde cada vértice.
// Ocho direcciones inclinadas 55° alrededor de la normal; si salen menos de un tercio, el punto está encerrado
// (adentro de una lámpara, los rayos que se escapan por la abertura de abajo no alcanzan).
const tilts=Array.from({length:8},(_,k)=>{const a=k*Math.PI/4,s=Math.sin(55*Math.PI/180);return [Math.cos(a)*s,Math.sin(a)*s,Math.cos(55*Math.PI/180)];});
function enclosure(bvh,pos,vn,nv,open,weight){
 const sky=new Float32Array(nv).fill(1),ray=new THREE.Ray(),d=new THREE.Vector3(),t=new THREE.Vector3(),b=new THREE.Vector3(),n=new THREE.Vector3();
 // Vértices vecinos (celda de 3 mm) que miran hacia el mismo lado ven lo mismo: se calcula una vez por celda y
 // orientación. Las dos caras de una pared fina caen en la misma celda pero con orientaciones opuestas.
 const cache=new Map(),cell=3;
 for(let v=0;v<nv;v++){
  // También sin choque de frente: desde el techo de una lámpara, el rayo normal sale justo por la abertura.
  if(!(weight[v]>1e-3))continue;
  const key=Math.floor(pos[v*3]/cell)+','+Math.floor(pos[v*3+1]/cell)+','+Math.floor(pos[v*3+2]/cell)+','+Math.round(vn[v*3]*2)+','+Math.round(vn[v*3+1]*2)+','+Math.round(vn[v*3+2]*2);
  const known=cache.get(key);if(known!==undefined){sky[v]=known;continue;}
  n.set(vn[v*3],vn[v*3+1],vn[v*3+2]);t.set(Math.abs(n.x)<.9?1:0,Math.abs(n.x)<.9?0:1,0).cross(n).normalize();b.crossVectors(n,t);
  let free=0,blocked=0;
  for(const [x,y,z] of tilts){
   d.copy(t).multiplyScalar(x).addScaledVector(b,y).addScaledVector(n,z);ray.origin.set(pos[v*3],pos[v*3+1],pos[v*3+2]).addScaledVector(d,1e-3);ray.direction.copy(d);
   if(bvh.raycastFirst(ray,THREE.DoubleSide))blocked++;else free++;
   if(free>=5||blocked>=6)break;// ya se sabe: a la vista (≥ 5/8) o encerrado (≤ 2/8)
  }
  sky[v]=free>=5?1:free/tilts.length;cache.set(key,sky[v]);
 }
 return sky;
}

// Desplaza cada vértice sobre su normal. Protege la base, las aristas vivas y el espesor de las paredes.
function displace(api,manifold,finish,minZ){
 const raw=manifold.getMesh(),np=raw.numProp,P=raw.vertProperties,T=raw.triVerts,nv=P.length/np,nt=T.length/3;
 const pos=new Float32Array(nv*3);for(let v=0;v<nv;v++){pos[v*3]=P[v*np];pos[v*3+1]=P[v*np+1];pos[v*3+2]=P[v*np+2];}
 const vn=new Float32Array(nv*3),fn=new Float32Array(nt*3);let area=0;
 for(let t=0;t<nt;t++){
  const a=T[t*3]*3,b=T[t*3+1]*3,c=T[t*3+2]*3,ux=pos[b]-pos[a],uy=pos[b+1]-pos[a+1],uz=pos[b+2]-pos[a+2],wx=pos[c]-pos[a],wy=pos[c+1]-pos[a+1],wz=pos[c+2]-pos[a+2];
  const nx=uy*wz-uz*wy,ny=uz*wx-ux*wz,nz=ux*wy-uy*wx,len=Math.hypot(nx,ny,nz)||1;area+=len/2;
  fn[t*3]=nx/len;fn[t*3+1]=ny/len;fn[t*3+2]=nz/len;
  for(const k of [a,b,c]){vn[k]+=nx;vn[k+1]+=ny;vn[k+2]+=nz;}
 }
 for(let v=0;v<nv;v++){const len=Math.hypot(vn[v*3],vn[v*3+1],vn[v*3+2])||1;vn[v*3]/=len;vn[v*3+1]/=len;vn[v*3+2]/=len;}
 // Aristas vivas: si las caras alrededor de un vértice apuntan muy distinto, ese vértice no se mueve.
 const minDot=new Float32Array(nv).fill(1);
 for(let t=0;t<nt;t++)for(let j=0;j<3;j++){const v=T[t*3+j],d=fn[t*3]*vn[v*3]+fn[t*3+1]*vn[v*3+1]+fn[t*3+2]*vn[v*3+2];if(d<minDot[v])minDot[v]=d;}
 let weight=new Float32Array(nv);
 for(let v=0;v<nv;v++)weight[v]=smoothstep(Math.cos(40*Math.PI/180),Math.cos(18*Math.PI/180),minDot[v])*smoothstep(.2,2,pos[v*3+2]-minZ);
 // Ensancha la protección (erosión) y suaviza la transición (dos promedios), para que no queden escalones.
 const pass=mode=>{const acc=new Float32Array(nv),cnt=new Float32Array(nv),out=new Float32Array(nv);if(mode==='min')out.set(weight);
  for(let t=0;t<nt;t++){const a=T[t*3],b=T[t*3+1],c=T[t*3+2];
   if(mode==='min'){const m=Math.min(weight[a],weight[b],weight[c]);if(m<out[a])out[a]=m;if(m<out[b])out[b]=m;if(m<out[c])out[c]=m;}
   else{const s=weight[a]+weight[b]+weight[c];acc[a]+=s;acc[b]+=s;acc[c]+=s;cnt[a]+=3;cnt[b]+=3;cnt[c]+=3;}}
  if(mode!=='min')for(let v=0;v<nv;v++)out[v]=cnt[v]?acc[v]/cnt[v]:weight[v];weight=out;};
 pass('min');pass('avg');pass('avg');
 // Espesor: el rayo hacia adentro mide la pared; hacia afuera, la distancia a otra superficie (un hueco, una pata vecina).
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(pos,3));geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(T),1));
 const bvh=new MeshBVH(geometry),ray=new THREE.Ray(),origin=new THREE.Vector3(),dir=new THREE.Vector3(),out=new Float32Array(nv*3);
 const reach=(v,sign)=>{dir.set(vn[v*3]*sign,vn[v*3+1]*sign,vn[v*3+2]*sign);origin.set(pos[v*3],pos[v*3+1],pos[v*3+2]).addScaledVector(dir,1e-3);ray.set(origin,dir);const hit=bvh.raycastFirst(ray,THREE.DoubleSide);return hit?hit.distance:Infinity;};
 // Agujeros, ranuras y el interior de recipientes: mirando hacia afuera hay otra pared cerca. Ahí no se talla
 // nada, así los encastres conservan su medida.
 const open=new Float32Array(nv).fill(Infinity);
 for(let v=0;v<nv;v++)if(weight[v]>1e-3){open[v]=reach(v,1);weight[v]*=smoothstep(30,50,open[v]);}
 // Superficies encerradas (el interior de una luna lámpara, de una maceta honda): aunque la pared de enfrente
 // esté lejos, casi ningún rayo inclinado sale de la pieza. No se ven, así que no se tallan.
 const sky=enclosure(bvh,pos,vn,nv,open,weight);
 for(let v=0;v<nv;v++)if(sky[v]<1)weight[v]*=smoothstep(.3,.6,sky[v]);
 const eligible=[];for(let v=0;v<nv;v++)if(weight[v]>.8)eligible.push(v);
 const field=heightField(finish,pos,eligible,area);
 for(let v=0;v<nv;v++){
  let h=weight[v]>1e-3?field(pos[v*3],pos[v*3+1],pos[v*3+2])*weight[v]:0;
  // Cada lado de una pared puede ceder como mucho la mitad de lo que le sobra, así ninguna baja del mínimo.
  if(h<-.01)h=Math.max(h,-Math.max(0,(reach(v,-1)-finishMinWall)/2));
  // Frente a otra pared (un hueco, la cavidad de una lámpara) solo se talla hacia adentro: nada se achica.
  else if(h>.01&&Number.isFinite(open[v]))h=0;
  out[v*3]=pos[v*3]+vn[v*3]*h;out[v*3+1]=pos[v*3+1]+vn[v*3+1]*h;out[v*3+2]=pos[v*3+2]+vn[v*3+2]*h;
 }
 geometry.dispose();
 const mesh=new api.Mesh({numProp:3,vertProperties:out,triVerts:new Uint32Array(T)});
 return new api.Manifold(mesh);
}

// Devuelve un Manifold nuevo (el que llama lo libera) o null si el acabado no cambia nada.
export function applyFinish(api,solid,finish){
 if(!hasFinish(finish))return null;
 const temp=[],keep=x=>(temp.push(x),x);let result=null;
 try{
  const box=solid.boundingBox(),area=solid.surfaceArea(),depth=finish.texture==='none'?0:finish.depth;
  // Suavizado: las aristas de menos de minSharpAngle se redondean; la base cortada (90°) y las aberturas siguen vivas.
  const shaped=finish.smooth>0?keep(solid.smoothOut(20+55*finish.smooth,0)):solid;
  let length=Math.max(.35,Math.sqrt(4*area/triangleBudget)),fine=null;
  for(let k=0;k<6;k++){fine=keep(shaped.refineToLength(length));if(fine.numTri()<=triangleLimit)break;length*=1.35;}
  if(fine.numTri()>triangleLimit)return null;
  let out=fine;
  if(depth>0){out=keep(displace(api,fine,{...finish,depth},box.min[2]));if(out.status()!=='NoError'||out.isEmpty())out=fine;}
  // La base sigue plana y a la misma altura. No se reescala: achicaría agujeros y encastres. Las medidas
  // cambian décimas (solo sobresalen los bordes de los cráteres y las escamas, hasta un 40 % de la profundidad).
  out=keep(out.trimByPlane([0,0,1],box.min[2]));
  if(out.status()!=='NoError'||out.isEmpty())return null;
  result=out;return out;
 }finally{for(const x of temp)if(x!==result)x.delete();}
}
