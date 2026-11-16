// Sampled rigid-body collision checks. Fixtures supply reviewed axes and body indices;
// this does not infer a joint, prove retention, or replace a physical movement test.
export function sampleMotion(api,mesh,scenario){
 const raw=new api.Mesh({numProp:3,vertProperties:Float32Array.from(mesh.positions.filter((_,i)=>i%mesh.numProp<3)),triVerts:Uint32Array.from(mesh.triangles)});raw.merge();
 const solid=new api.Manifold(raw),bodies=solid.decompose().sort((a,b)=>{const A=a.boundingBox(),B=b.boundingBox();for(let i=0;i<3;i++){const d=A.min[i]-B.min[i];if(Math.abs(d)>1e-4)return d;}return 0;});
 const samples=[];
 try{
  const positions=scenario.positions||scenario.angles;
  if(!Array.isArray(positions)||!positions.length||positions.length>100||!Array.isArray(scenario.groups)||!scenario.groups.length)throw Error('Falta una trayectoria de movimiento acotada.');
  const used=new Set();
  for(const group of scenario.groups){
   if(!['x','y','z'].includes(group.axis)||!Array.isArray(group.pivot)||group.pivot.length!==3||!group.pivot.every(Number.isFinite)||!Number.isFinite(group.ratio)||!Array.isArray(group.bodies)||!group.bodies.length||group.offset&&(!Array.isArray(group.offset)||group.offset.length!==3||!group.offset.every(Number.isFinite)))throw Error('Eje de movimiento inválido.');
   for(const i of group.bodies){if(!Number.isInteger(i)||i<0||i>=bodies.length||used.has(i))throw Error('Cuerpo móvil inválido o repetido.');used.add(i);}
  }
  for(const angle of positions){
   if(!Number.isFinite(angle))throw Error('Ángulo inválido.');
   const moved=[...bodies],owned=[];
   try{
    for(const group of scenario.groups)for(const i of group.bodies){
     if(group.motion==='linear'){const shift=[...(group.offset||[0,0,0])];shift[['x','y','z'].indexOf(group.axis)]+=angle*group.ratio;const c=bodies[i].translate(shift);owned.push(c);moved[i]=c;continue;}
     const a=bodies[i].translate(group.pivot.map(v=>-v)),rotation=[0,0,0];rotation[['x','y','z'].indexOf(group.axis)]=angle*group.ratio;
     const b=a.rotate(rotation),c=b.translate(group.pivot);owned.push(a,b,c);moved[i]=c;
    }
    let collisionMm3=0;
    for(let i=0;i<moved.length;i++)for(let j=i+1;j<moved.length;j++){
     if(!used.has(i)&&!used.has(j))continue;
     const intersection=moved[i].intersect(moved[j]);try{collisionMm3+=Math.abs(intersection.volume());}finally{intersection.delete();}
    }
    samples.push({position:angle,collisionMm3});
   }finally{for(const item of owned.reverse())item.delete();}
  }
  return {name:scenario.name,samples,passed:samples.every(s=>s.collisionMm3<.001),maxCollisionMm3:Math.max(...samples.map(s=>s.collisionMm3)),physicalVerified:false};
 }finally{for(const body of bodies)body.delete();solid.delete();}
}
