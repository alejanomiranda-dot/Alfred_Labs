// Visor 3D: escena, cámara, dibujo de la pieza y herramientas de medición.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createViewerTools} from '../viewer-tools.js';
import {cssColor} from './theme.js';

export function meshGeometry(m){
 const g=new THREE.BufferGeometry(),xyz=[];
 for(let i=0;i<m.positions.length;i+=m.numProp)xyz.push(m.positions[i],m.positions[i+1],m.positions[i+2]);
 g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));g.setIndex(new THREE.BufferAttribute(m.triangles,1));g.computeVertexNormals();return g;
}

export function createViewer(host){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,4000);camera.up.set(0,0,1);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.append(renderer.domElement);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=2;controls.maxDistance=3000;controls.maxPolarAngle=Math.PI*.85;
 let dirty=true;const markDirty=()=>{dirty=true;};controls.addEventListener('change',markDirty);

 scene.add(new THREE.HemisphereLight(0xf2f7ff,0x2a3445,2.3));
 const key=new THREE.DirectionalLight(0xffffff,3.2);key.position.set(-40,-30,90);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-120,right:120,top:120,bottom:-120});key.shadow.normalBias=.08;scene.add(key);
 const rim=new THREE.DirectionalLight(0xcfe6ff,1.6);rim.position.set(40,60,40);scene.add(rim);
 const under=new THREE.DirectionalLight(0xe6f0ff,1.4);under.position.set(-30,-40,-60);scene.add(under);

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
 let current=null,view='perspective';

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
  draw(model,parts,{keepView=false}={}){
   while(group.children.length){const m=group.children[0];group.remove(m);m.geometry.dispose();m.material.dispose();}
   current=model;
   for(const {mesh,color} of parts||[]){if(!mesh?.triangles.length)continue;const m=new THREE.Mesh(meshGeometry(mesh),new THREE.MeshStandardMaterial({color,roughness:.45,metalness:.08,flatShading:true}));m.castShadow=true;m.receiveShadow=true;group.add(m);}
   tools.afterDraw();if(!keepView)frame(model);markDirty();
  },
  clear(){this.draw(null,[]);},
  setView(next){view=next;frame();},
  get view(){return view;},
  frame:()=>frame(),
  repaint:paintGrid,
  tools,
  capture:()=>({renderer,scene,camera,hide:[grid,tools.overlay]})
 };
}
