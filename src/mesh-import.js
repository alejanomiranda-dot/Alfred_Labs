// Reads STL (binary or text) and 3MF files into one indexed mesh in millimeters.
// The piece is moved so it is centered in X/Y and rests on z=0; its shape and size are not changed.
import {unzipSync,strFromU8} from 'fflate';
export const maxImportTriangles=600000,maxStoredTriangles=150000;
const unitScale={micron:.001,millimeter:1,centimeter:10,inch:25.4,foot:304.8,meter:1000};

function stlSoup(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const count=bytes.length>=84?view.getUint32(80,true):0;
 if(bytes.length>=84&&84+count*50===bytes.length){
  const soup=new Float32Array(count*9);
  for(let i=0;i<count;i++)for(let j=0;j<9;j++)soup[i*9+j]=view.getFloat32(84+i*50+12+j*4,true);
  return soup;
 }
 const text=new TextDecoder().decode(bytes);
 if(!/^\s*solid/i.test(text))throw Error('El archivo STL no tiene un formato reconocible.');
 const values=[];for(const m of text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/gi))values.push(+m[1],+m[2],+m[3]);
 if(!values.length||values.length%9)throw Error('El archivo STL no contiene triángulos válidos.');
 return Float32Array.from(values);
}

const attr=(tag,name)=>{const m=tag.match(new RegExp('\\s'+name+'="([^"]*)"'));return m?m[1]:null;};
function matrix(text){if(!text)return null;const v=text.trim().split(/\s+/).map(Number);return v.length===12&&v.every(Number.isFinite)?v:null;}
function apply(t,[x,y,z]){return t?[x*t[0]+y*t[3]+z*t[6]+t[9],x*t[1]+y*t[4]+z*t[7]+t[10],x*t[2]+y*t[5]+z*t[8]+t[11]]:[x,y,z];}
function compose(a,b){// apply a, then b
 if(!a)return b;if(!b)return a;const r=[];for(let i=0;i<3;i++)for(let j=0;j<3;j++)r[i*3+j]=a[i*3]*b[j]+a[i*3+1]*b[3+j]+a[i*3+2]*b[6+j];
 const t=apply(b,[a[9],a[10],a[11]]);return [...r,...t];
}
function threeMfSoup(bytes){
 let files;try{files=unzipSync(bytes);}catch{throw Error('El archivo 3MF está dañado o no es un 3MF.');}
 const models=Object.keys(files).filter(k=>/\.model$/i.test(k));if(!models.length)throw Error('El 3MF no contiene ningún modelo.');
 const objects=new Map();let scale=1;
 for(const path of models){
  const xml=strFromU8(files[path]),unit=attr(xml.match(/<model\b[^>]*>/)?.[0]||'','unit');if(path.toLowerCase()==='3d/3dmodel.model'&&unit)scale=unitScale[unit]??1;
  for(const m of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)){
   const id=attr(' '+m[1],'id'),body=m[2],key=path+'#'+id;
   if(/<mesh\b/.test(body)){
    const vertices=[...body.matchAll(/<vertex\b([^>]*)\/?>/g)].map(v=>['x','y','z'].map(k=>Number(attr(v[1],k))));
    const triangles=[...body.matchAll(/<triangle\b([^>]*)\/?>/g)].map(t=>['v1','v2','v3'].map(k=>Number(attr(t[1],k))));
    objects.set(key,{vertices,triangles});
   }else{
    const components=[...body.matchAll(/<component\b([^>]*)\/?>/g)].map(c=>{const ref=attr(c[1],'p:path')||attr(c[1],'path');return {key:(ref?ref.replace(/^\//,''):path)+'#'+attr(c[1],'objectid'),transform:matrix(attr(c[1],'transform'))};});
    objects.set(key,{components});
   }
  }
 }
 const main=models.find(p=>p.toLowerCase()==='3d/3dmodel.model')||models[0],mainXml=strFromU8(files[main]);
 const items=[...mainXml.matchAll(/<item\b([^>]*)\/?>/g)].map(i=>({key:main+'#'+attr(i[1],'objectid'),transform:matrix(attr(i[1],'transform'))}));
 const roots=items.length?items:[...objects.keys()].map(key=>({key,transform:null}));
 const soup=[];let parts=0;
 const walk=(key,transform,depth)=>{
  const o=objects.get(key)||objects.get([...objects.keys()].find(k=>k.endsWith('#'+key.split('#')[1])&&k.toLowerCase()===key.toLowerCase()));
  if(!o||depth>8)return;
  if(o.components){for(const c of o.components)walk(c.key,compose(c.transform,transform),depth+1);return;}
  parts++;for(const t of o.triangles)for(const i of t){const v=o.vertices[i];if(!v)throw Error('El 3MF tiene triángulos que apuntan a vértices inexistentes.');soup.push(...apply(transform,v));}
 };
 for(const r of roots)walk(r.key,r.transform,0);
 if(!soup.length)throw Error('El 3MF no contiene triángulos.');
 return {soup:Float32Array.from(soup,v=>v*scale),parts};
}

// Merges repeated corners so the triangles share vertices, drops collapsed triangles,
// and moves the piece to the center of the table resting on z=0.
export function indexSoup(soup){
 const n=soup.length/9;if(!n)throw Error('El archivo no contiene triángulos.');if(n>maxImportTriangles)throw Error(`El archivo tiene ${n} triángulos; el máximo es ${maxImportTriangles}. Simplificalo antes de importarlo.`);
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<soup.length;i++){const v=soup[i];if(!Number.isFinite(v))throw Error('El archivo contiene coordenadas inválidas.');min[i%3]=Math.min(min[i%3],v);max[i%3]=Math.max(max[i%3],v);}
 const offset=[(min[0]+max[0])/2,(min[1]+max[1])/2,min[2]],ids=new Map(),vertices=[],triangles=[];
 const id=i=>{const p=[0,1,2].map(k=>Math.round((soup[i+k]-offset[k])*1e4)/1e4),key=p.join(',');let v=ids.get(key);if(v===undefined){v=vertices.length/3;ids.set(key,v);vertices.push(...p);}return v;};
 for(let t=0;t<n;t++){const a=id(t*9),b=id(t*9+3),c=id(t*9+6);if(a!==b&&b!==c&&a!==c)triangles.push(a,b,c);}
 if(!triangles.length)throw Error('El archivo no contiene triángulos válidos.');
 return {vertices,triangles,size:max.map((v,i)=>Math.round((v-min[i])*100)/100)};
}

export function readMeshFile(name,bytes){
 const lower=name.toLowerCase();let soup,parts=1;
 if(lower.endsWith('.stl'))soup=stlSoup(bytes);
 else if(lower.endsWith('.3mf'))({soup,parts}=threeMfSoup(bytes));
 else throw Error('Usá un archivo STL o 3MF.');
 const mesh=indexSoup(soup);
 return {name:name.replace(/\.(stl|3mf)$/i,'').slice(0,80),vertices:mesh.vertices,triangles:mesh.triangles,size:mesh.size,parts};
}
