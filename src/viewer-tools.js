// Professional viewport tools: proposal preview ("ghost"), ruler, automatic dimensions,
// section plane and printability highlights. Everything is drawn in its own layer above the piece.
import * as THREE from 'three';

const fmt=v=>(Math.round(v*10)/10).toLocaleString('es-AR',{maximumFractionDigits:1});

export function createViewerTools({host,scene,camera,renderer,group,markDirty,meshGeometry}){
 renderer.localClippingEnabled=true;
 const layer=new THREE.Group(),ghost=new THREE.Group(),marks=new THREE.Group(),dims=new THREE.Group(),heat=new THREE.Group();
 layer.add(ghost,marks,dims,heat);scene.add(layer);
 const labels=document.createElement('div');labels.className='viewport-labels';host.append(labels);
 const state={ruler:false,dims:false,section:null,ghostMode:'both',points:[],labels:[]};
 const plane=new THREE.Plane(new THREE.Vector3(0,0,-1),0);
 const dispose=g=>{for(const c of [...g.children]){g.remove(c);c.traverse?.(o=>{o.geometry?.dispose();o.material?.dispose?.();});}};
 const activeGroup=()=>ghost.children.length&&state.ghostMode!=='current'?ghost:group;
 const bounds=()=>new THREE.Box3().setFromObject(activeGroup());
 const sizeOf=()=>{const b=bounds();return b.isEmpty()?50:b.getSize(new THREE.Vector3()).length();};

 function label(text,position,kind='dim'){const el=document.createElement('span');el.className='viewport-label '+kind;el.textContent=text;labels.append(el);state.labels.push({el,position:position.clone()});}
 function clearLabels(filter){state.labels=state.labels.filter(l=>{if(!filter||filter(l)){l.el.remove();return false;}return true;});}
 function placeLabels(){const r=renderer.domElement.getBoundingClientRect();for(const l of state.labels){const p=l.position.clone().project(camera);const hidden=p.z>1||p.z<-1;l.el.style.display=hidden?'none':'';l.el.style.transform=`translate(${(p.x+1)/2*r.width}px,${(1-p.y)/2*r.height}px) translate(-50%,-50%)`;}}
 const line=(a,b,color=0x93f5ce)=>new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),new THREE.LineBasicMaterial({color,depthTest:false,transparent:true}));

 // ---- automatic dimensions
 function drawDims(){dispose(dims);clearLabels(l=>l.el.classList.contains('dim'));if(!state.dims)return;const b=bounds();if(b.isEmpty())return;
  const {min,max}=b,off=sizeOf()*.06,c=0x7bc5ff;
  const x0=new THREE.Vector3(min.x,min.y-off,min.z),x1=new THREE.Vector3(max.x,min.y-off,min.z);
  const y0=new THREE.Vector3(max.x+off,min.y,min.z),y1=new THREE.Vector3(max.x+off,max.y,min.z);
  const z0=new THREE.Vector3(max.x+off,min.y-off,min.z),z1=new THREE.Vector3(max.x+off,min.y-off,max.z);
  for(const [a,b2,text] of [[x0,x1,fmt(max.x-min.x)+' mm'],[y0,y1,fmt(max.y-min.y)+' mm'],[z0,z1,fmt(max.z-min.z)+' mm']]){const l=line(a,b2,c);l.renderOrder=5;dims.add(l);label(text,a.clone().add(b2).multiplyScalar(.5),'dim');}
 }

 // ---- ruler: two clicks on the piece measure the straight distance
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
 function pick(event){const r=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(activeGroup().children.filter(m=>m.isMesh),false).find(h=>!state.section||plane.distanceToPoint(h.point)>=-1e-6);return hit?.point;}
 function drawRuler(){dispose(marks);clearLabels(l=>l.el.classList.contains('ruler'));const r=sizeOf()*.008+.15;
  for(const p of state.points){const dot=new THREE.Mesh(new THREE.SphereGeometry(r,16,12),new THREE.MeshBasicMaterial({color:0xffc857,depthTest:false}));dot.position.copy(p);dot.renderOrder=6;marks.add(dot);}
  if(state.points.length===2){const [a,b]=state.points,l=line(a,b,0xffc857);l.renderOrder=6;marks.add(l);const d=a.distanceTo(b),dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y),dz=Math.abs(a.z-b.z);label(fmt(d)+' mm  ·  X '+fmt(dx)+'  Y '+fmt(dy)+'  Z '+fmt(dz),a.clone().add(b).multiplyScalar(.5),'ruler');}
  markDirty();}
 renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
 renderer.domElement.addEventListener('pointerup',e=>{if(!state.ruler||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>4)return;const p=pick(e);if(!p)return;if(state.points.length>=2)state.points=[];state.points.push(p);drawRuler();});

 // ---- section plane
 function applySection(){const planes=state.section?[plane]:[];for(const m of [...group.children,...ghost.children])if(m.material){m.material.clippingPlanes=planes;m.material.side=state.section?THREE.DoubleSide:THREE.FrontSide;m.material.needsUpdate=true;}
  if(state.section){const b=bounds();if(!b.isEmpty()){const axis=state.section.axis,normal=new THREE.Vector3(...['x','y','z'].map(a=>a===axis?-1:0)),at=b.min[axis]+(b.max[axis]-b.min[axis])*state.section.amount;plane.set(normal,at);}}
  markDirty();}

 // ---- proposal preview
 function setGhost(model,colors){state.points=[];drawRuler();dispose(ghost);if(!model)return applyGhostMode();
  for(const part of colors){if(!part.mesh.triangles.length)continue;const m=new THREE.Mesh(meshGeometry(part.mesh),new THREE.MeshStandardMaterial({color:part.color,transparent:true,opacity:.55,roughness:.5,emissive:0x1f6f55,emissiveIntensity:.35,depthWrite:false,flatShading:true}));m.renderOrder=2;ghost.add(m);}
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(meshGeometry(colors[0].mesh),25),new THREE.LineBasicMaterial({color:0x93f5ce,transparent:true,opacity:.9}));ghost.add(edges);
  applyGhostMode();applySection();}
 function applyGhostMode(){const has=ghost.children.length>0;ghost.visible=has&&state.ghostMode!=='current';group.visible=!has||state.ghostMode!=='proposal';for(const m of group.children)if(m.material){m.material.transparent=has&&state.ghostMode==='both';m.material.opacity=has&&state.ghostMode==='both'?.35:1;}heat.visible=!has||state.ghostMode==='current';drawDims();markDirty();}

 // ---- printability heat map
 function setHeat(meshes){dispose(heat);for(const {mesh,color} of meshes||[]){if(!mesh.triangles.length)continue;const m=new THREE.Mesh(meshGeometry(mesh),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.75,depthTest:true,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,side:THREE.DoubleSide}));m.renderOrder=3;heat.add(m);}markDirty();}

 return {
  overlay:layer,
  beforeRender:placeLabels,
  afterDraw(){drawDims();if(state.points.length){state.points=[];drawRuler();}applySection();applyGhostMode();},
  setRuler(on){state.ruler=on;state.points=[];drawRuler();renderer.domElement.style.cursor=on?'crosshair':'';},
  setDims(on){state.dims=on;drawDims();markDirty();},
  setSection(section){state.section=section;applySection();},
  setGhost,
  setGhostMode(mode){state.ghostMode=mode;state.points=[];drawRuler();applyGhostMode();applySection();},
  setHeat,
  hasGhost:()=>ghost.children.length>0
 };
}
