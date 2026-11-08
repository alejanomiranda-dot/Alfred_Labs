import {validateGeneration} from './generation-spec.js';

// A height field with a flat back and manifold sides. Every boundary vertex is
// shared by top, side and back; no open edges, floating pixels or zero thickness.
export function reliefMesh(rgba,columns,rows,raw,{invert=false}={}){
 const spec=validateGeneration(raw);
 if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<2||rows<2||columns>192||rows>192||rgba.length!==columns*rows*4)throw Error('Imagen de relieve inválida.');
 const vertices=[],triangles=[];
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
  const i=((rows-1-y)*columns+x)*4,alpha=rgba[i+3]/255;
  let light=(.2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2])/255;
  light=(invert?1-light:light)*alpha;
  vertices.push((x/(columns-1)-.5)*spec.width,(y/(rows-1)-.5)*spec.height,spec.baseThickness+light*spec.depth);
 }
 for(let y=0;y<rows-1;y++)for(let x=0;x<columns-1;x++){const a=y*columns+x,b=a+1,c=a+columns,d=c+1;triangles.push(a,b,d,a,d,c);}
 const edge=[];for(let x=0;x<columns;x++)edge.push(x);for(let y=1;y<rows;y++)edge.push(y*columns+columns-1);for(let x=columns-2;x>=0;x--)edge.push((rows-1)*columns+x);for(let y=rows-2;y>0;y--)edge.push(y*columns);
 const bottom=edge.map(top=>{const index=vertices.length/3;vertices.push(vertices[top*3],vertices[top*3+1],0);return index;});
 const center=vertices.length/3;vertices.push(0,0,0);
 edge.forEach((top,i)=>{const next=(i+1)%edge.length;triangles.push(top,bottom[i],bottom[next],top,bottom[next],edge[next],center,bottom[next],bottom[i]);});
 return {name:spec.subject.slice(0,100)+' · relieve',vertices,triangles};
}

export async function reliefFromImage(imageDataUrl,spec,{invert=false}={}){
 if(typeof imageDataUrl!=='string'||imageDataUrl.length>6000000||!/^data:image\/(png|jpeg|webp);base64,/.test(imageDataUrl))throw Error('La referencia del relieve no es una imagen válida.');
 const image=new Image();image.src=imageDataUrl;await image.decode();
 const max=160,ratio=spec.width/spec.height,columns=Math.max(16,Math.round(max*Math.min(1,ratio))),rows=Math.max(16,Math.round(max/Math.max(1,ratio)));
 const canvas=document.createElement('canvas');canvas.width=columns;canvas.height=rows;const context=canvas.getContext('2d',{willReadFrequently:true});
 context.clearRect(0,0,columns,rows);
 // Preserve the reference's proportions with padding, rather than stretching it.
 const scale=Math.min(spec.width/image.width,spec.height/image.height),w=image.width*scale/spec.width*columns,h=image.height*scale/spec.height*rows;
 context.drawImage(image,(columns-w)/2,(rows-h)/2,w,h);
 const pixels=context.getImageData(0,0,columns,rows);
 return reliefMesh(pixels.data,columns,rows,spec,{invert});
}

export function generatedParams(base,mesh,spec){
 return {...base,kind:'free',project:spec.subject.slice(0,60),importedMesh:mesh,freeDesign:{version:1,nodes:[{type:'imported',position:[0,0,0],rotation:[0,0,0]}]},printRotation:[0,0,0],sourceInfo:{...spec},forge:null};
}
