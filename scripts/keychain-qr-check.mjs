import jsQR from 'jsqr';
import {unzipSync,strFromU8} from 'fflate';
// Read the geometry that was actually exported, rather than regenerating a QR from metadata.
export function qrFromExport(bytes,size){
 const xml=strFromU8(unzipSync(bytes)['3D/3dmodel.model']),resolution=320,rgba=new Uint8ClampedArray(resolution*resolution*4).fill(255);
 const materials=[...xml.matchAll(/<base name="[^"]*" displaycolor="#([A-Fa-f\d]{6})FF"\/>/g)].map(m=>m[1]);
 for(const object of xml.matchAll(/<object [^>]*pindex="(\d+)"[^>]*><mesh><vertices>(.*?)<\/vertices><triangles>(.*?)<\/triangles><\/mesh><\/object>/gs)){
  const rgb=[0,2,4].map(i=>parseInt(materials[Number(object[1])].slice(i,i+2),16));
  const vertices=[...object[2].matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)].map(m=>m.slice(1).map(Number));
  for(const match of object[3].matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)){
   const tri=match.slice(1).map(i=>vertices[Number(i)]);if(!tri.every(v=>Math.abs(v[2])<1e-5))continue;
   const points=tri.map(([x,y])=>[(-x+size/2)/size*resolution,(size/2-y-3)/size*resolution]);
   const edge=(a,b,x,y)=>(x-a[0])*(b[1]-a[1])-(y-a[1])*(b[0]-a[0]);
   const minX=Math.max(0,Math.floor(Math.min(...points.map(p=>p[0])))),maxX=Math.min(resolution-1,Math.ceil(Math.max(...points.map(p=>p[0])))),minY=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1])))),maxY=Math.min(resolution-1,Math.ceil(Math.max(...points.map(p=>p[1]))));
   for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const e=points.map((p,i)=>edge(p,points[(i+1)%3],x+.5,y+.5));if(e.every(v=>v>=-1e-6)||e.every(v=>v<=1e-6)){const k=(y*resolution+x)*4;rgba.set([...rgb,255],k);}}
  }
 }
 return jsQR(rgba,resolution,resolution,{inversionAttempts:'dontInvert'})?.data;
}

