// Visor 3D: escena, cámara, dibujo de la pieza, simulación al trasluz y herramientas de medición.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createViewerTools} from '../viewer-tools.js';
import {cssColor} from './theme.js';

export function meshGeometry(m){
 const g=new THREE.BufferGeometry(),xyz=[];
 for(let i=0;i<m.positions.length;i+=m.numProp)xyz.push(m.positions[i],m.positions[i+1],m.positions[i+2]);
 g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));g.setIndex(new THREE.BufferAttribute(m.triangles,1));g.computeVertexNormals();return g;
}

// Simulación óptica al trasluz (Ley de Beer-Lambert): las zonas más finas transmiten luz cálida brillante
// y las zonas más gruesas atenúan la luz formando las sombras de la fotografía.
function applyBacklightColors(g,mode,dims){
 const pos=g.getAttribute('position'),count=pos.count,vals=new Float32Array(count),colors=new Float32Array(count*3);
 const cx=0,cy=0,cz=(dims?.[2]||80)*.46;
 let lo=Infinity,hi=-Infinity;
 for(let i=0;i<count;i++){
  const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
  const v=mode==='lithophane_sphere'?Math.hypot(x-cx,y-cy,z-cz):mode==='lithophane_cylinder'?Math.hypot(x,y):mode==='lithophane_arc'?-y:z;
  vals[i]=v;if(v<lo)lo=v;if(v>hi)hi=v;
 }
 const span=Math.max(.5,hi-lo);
 for(let i=0;i<count;i++){
  const d=Math.max(0,Math.min(1,(vals[i]-lo)/span));
  const trans=Math.exp(-2.4*d);
  colors[i*3]=.22+.78*trans;
  colors[i*3+1]=.13+.82*Math.pow(trans,1.08);
  colors[i*3+2]=.07+.76*Math.pow(trans,1.22);
 }
 g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
}

export function createViewer(host){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,4000);camera.up.set(0,0,1);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.append(renderer.domElement);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=2;controls.maxDistance=3000;controls.maxPolarAngle=Math.PI*.85;
 let dirty=true;const markDirty=()=>{dirty=true;};controls.addEventListener('change',markDirty);

 const hemi=new THREE.HemisphereLight(0xf2f7ff,0x2a3445,2.3);scene.add(hemi);
 const key=new THREE.DirectionalLight(0xffffff,3.2);key.position.set(-40,-30,90);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-120,right:120,top:120,bottom:-120});key.shadow.normalBias=.08;scene.add(key);
 const rim=new THREE.DirectionalLight(0xcfe6ff,1.6);rim.position.set(40,60,40);scene.add(rim);
 const under=new THREE.DirectionalLight(0xe6f0ff,1.4);under.position.set(-30,-40,-60);scene.add(under);
 const innerLight=new THREE.PointLight(0xffcf78,0,280,1.1);scene.add(innerLight);

 let grid=null;
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.ShadowMaterial({opacity:.1}));floor.position.z=-.2;floor.receiveShadow=true;scene.add(floor);
 function paintGrid(){
  if(grid){scene.remove(grid);grid.geometry.dispose();grid.material.dispose();}
  grid=new THREE.GridHelper(300,60,new THREE.Color(cssColor('--grid-major')),new THREE.Color(cssColor('--grid-minor')));
  grid.rotation.x=Math.PI/2;grid.position.z=-.3;scene.add(grid);markDirty();
 }
 paintGrid();

 const group=new THREE.Group();scene.add(group);
 const tools=createViewerTools({host,scene,camera,renderer,group,markDirty,meshGeometry});
 let current=null,lastParts=[],lastSmooth=false,view='perspective',backlit=false;

 function syncLighting(){
  const dims=current?.dimensions||[80,80,80],mode=current?.params?.sourceInfo?.mode||'';
  hemi.intensity=backlit?.42:2.3;
  key.intensity=backlit?.38:3.2;
  rim.intensity=backlit?.25:1.6;
  under.intensity=backlit?.18:1.4;
  innerLight.intensity=backlit?5.2:0;
  innerLight.position.set(0,mode==='lithophane'||mode==='lithophane_arc'?18:0,(current?.totalHeight||dims[2]||80)*.46);
 }

 function frame(model=current){
  const dims=model?.dimensions||[50,50,10];
  const half=Math.min(camera.fov*Math.PI/360,Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect));
  const distance=Math.max(30,Math.hypot(...dims)/2/Math.sin(half)*1.15);
  const front=view==='front',back=view==='back';
  camera.up.set(0,front||back?1:0,front||back?0:1);
  camera.position.copy(new THREE.Vector3(front||back?0:.62,front||back?0:-.95,back?-1:1.05).normalize().multiplyScalar(distance));
  controls.target.set(0,0,(model?.totalHeight||dims[2]||0)/2);camera.position.add(controls.target);
  grid.visible=!back;controls.update();markDirty();
 }
 const resize=()=>{const {width,height}=host.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();frame();};
 new ResizeObserver(resize).observe(host);
 renderer.setAnimationLoop(()=>{controls.update();if(dirty||controls.autoRotate){renderer.render(scene,camera);tools.beforeRender();dirty=false;}});

 return {
  draw(model,parts,{keepView=false,smooth=false}={}){
   while(group.children.length){const m=group.children[0];group.remove(m);m.geometry.dispose();m.material.dispose();}
   current=model;lastParts=parts||[];lastSmooth=smooth;
   syncLighting();
   const mode=model?.params?.sourceInfo?.mode||'';
   for(const {mesh,color} of lastParts){
    if(!mesh?.triangles.length)continue;
    const g=meshGeometry(mesh);
    if(backlit&&mode.startsWith('lithophane'))applyBacklightColors(g,mode,model?.dimensions);
    const mat=backlit&&mode.startsWith('lithophane')
     ?new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,emissive:0xffb85c,emissiveIntensity:.42,roughness:.32,metalness:.02,flatShading:!smooth})
     :new THREE.MeshStandardMaterial({color,roughness:.45,metalness:.08,flatShading:!smooth});
    const m=new THREE.Mesh(g,mat);m.castShadow=true;m.receiveShadow=true;group.add(m);
   }
   tools.afterDraw();if(!keepView)frame(model);markDirty();
  },
  clear(){this.draw(null,[]);},
  setView(next){view=next;frame();},
  get view(){return view;},
  setBacklight(next){backlit=!!next;if(current)this.draw(current,lastParts,{keepView:true,smooth:lastSmooth});else{syncLighting();markDirty();}},
  get backlit(){return backlit;},
  frame:()=>frame(),
  repaint:paintGrid,
  // Vistas para la revisión visual, sin mover la cámara de la persona.
  snapshots(size=512){
   if(!current)return [];
   const saved={position:camera.position.clone(),up:camera.up.clone(),target:controls.target.clone(),grid:grid.visible,aspect:camera.aspect};
   const dims=current.dimensions,center=new THREE.Vector3(0,0,(current.totalHeight||dims[2])/2),images=[];
   const out=document.createElement('canvas');out.width=out.height=size;const ctx=out.getContext('2d');
   const {width,height}=renderer.domElement;const side=Math.min(width,height);
   camera.aspect=width/height;camera.updateProjectionMatrix();
   const half=Math.min(camera.fov*Math.PI/360,Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect)),distance=Math.max(30,Math.hypot(...dims)/2/Math.sin(half)*1.1);
   grid.visible=false;tools.overlay.visible=false;
   for(const dir of [[.62,-.95,.75],[0,-1,.18],[1,0,.18]]){
    camera.up.set(0,0,1);camera.position.copy(new THREE.Vector3(...dir).normalize().multiplyScalar(distance)).add(center);camera.lookAt(center);
    renderer.render(scene,camera);
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size,size);ctx.drawImage(renderer.domElement,(width-side)/2,(height-side)/2,side,side,0,0,size,size);
    images.push(out.toDataURL('image/jpeg',.82));
   }
   camera.position.copy(saved.position);camera.up.copy(saved.up);controls.target.copy(saved.target);grid.visible=saved.grid;tools.overlay.visible=true;controls.update();markDirty();
   return images;
  },
  tools,
  capture:()=>({renderer,scene,camera,hide:[grid,tools.overlay]})
 };
}
