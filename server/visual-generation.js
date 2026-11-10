import {generationModes,validateGeneration} from '../src/generation-spec.js';
export function validImage(value){return typeof value==='string'&&value.length<=850000&&/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(value);}
export const maxImages=6;
// Imágenes de un pedido: una sola (imageDataUrl) o varias (imageDataUrls), cada una validada y con un tope total.
export function imagesOf(body,message='La referencia debe ser una imagen PNG o JPG válida y reducida.'){
 const many=body.imageDataUrls!==undefined&&body.imageDataUrls!==null;
 const list=many?body.imageDataUrls:body.imageDataUrl?[body.imageDataUrl]:[];
 if(many&&!Array.isArray(list))throw Object.assign(Error(message),{status:400});
 if(list.length>maxImages)throw Object.assign(Error('Podés adjuntar hasta '+maxImages+' imágenes por pedido.'),{status:400});
 if(!list.every(validImage))throw Object.assign(Error(message),{status:400});
 if(list.reduce((sum,image)=>sum+image.length,0)>3200000)throw Object.assign(Error('Las imágenes adjuntas pesan demasiado juntas. Probá con menos o más chicas.'),{status:413});
 return list;
}
// Nombres de archivo para que la IA distinga cada imagen («imagen 2: costado.jpg»).
export function imageNamesOf(body,count){
 const names=Array.isArray(body.imageNames)?body.imageNames:[];
 return Array.from({length:count},(_,i)=>typeof names[i]==='string'&&names[i].trim()?names[i].trim().slice(0,80):'imagen '+(i+1));
}
// Contenido para la IA: con una imagen va sola; con varias, cada una precedida de su número y nombre.
export function imageContent(images,names){
 if(images.length===1)return [{type:'input_image',image_url:images[0],detail:'high'}];
 return images.flatMap((image_url,i)=>[{type:'input_text',text:'Imagen '+(i+1)+' de '+images.length+': '+names[i]},{type:'input_image',image_url,detail:'high'}]);
}
export async function generateVisual(body,key,fetcher=fetch,{signal,model=process.env.OPENAI_IMAGE_MODEL||'gpt-image-1.5'}={}){
 const spec=validateGeneration(body.spec);
 if(!generationModes.includes(spec.mode))throw Object.assign(Error('Este pedido requiere el motor de esculturas 3D.'),{status:400});
 if(!key)throw Object.assign(Error('Falta configurar la generación visual en el servidor.'),{status:503});
 const images=imagesOf(body,'Adjuntá una referencia PNG o JPG válida.');
 const names=['plate/background','first motif color','second motif color','third motif color'];
 // Con colores se pide una ilustración plana: cada zona de color se vuelve una parte para su filamento.
 const prompt=spec.palette.length?'Create a FLAT-COLOR EMBLEM ILLUSTRATION for multicolor 3D printing (each color becomes a separate filament). Subject: '+spec.subject+'. Use ONLY these exact solid colors, no other colors and no in-between shades: '+spec.palette.map((c,i)=>c+' ('+names[i]+')').join(', ')+'. The background must be pure flat '+spec.palette[0]+' all the way to every edge. Frontal, flat, vector style: no gradients, no shading, no shadows, no highlights, no texture, no anti-aliased halos, no outline thinner than 2% of the image width. Center the complete subject with 6% padding, no cropping, no frame or border. Aspect ratio of the final plaque: '+spec.width+':'+spec.height+'. Large legible shapes and lettering; small details merged into bigger shapes. If there is a reference, preserve its silhouette, lettering, layout and the placement of each color (with several references, they show the same subject or the elements to combine: use all of them); do not replace it with a generic emblem. If the reference is a PHOTO of a person or a pet, draw a recognizable flat-color portrait of THAT same person or pet (head and shoulders): keep the face shape, hairstyle and hairline, beard and mustache shape, eyebrows, eyes, nose, glasses, ears and expression, posterized into the given colors with clear dark shapes for the features, like a stencil portrait.':
  'Create a grayscale BAS-RELIEF HEIGHT MAP for 3D printing, not a photograph of a sculpture. Subject: '+spec.subject+'. Frontal orthographic composition, no perspective, no cast shadows, no lighting gradients across a flat surface. Black is the lowest/background plane, white is the highest raised detail, gray is intermediate depth. Center the complete subject with 6% black padding, no cropping. No frame, no border, no rectangle, no plaque outline and no vignette: the background is pure flat black (#000000) all the way to every edge. Smooth, clean shapes with soft rounded edges; no noise, no texture, no fine hatching. Aspect ratio of the final plaque: '+spec.width+':'+spec.height+'. Large legible shapes and sturdy connected details suitable for a small FDM print. If there is a reference, preserve its silhouette, lettering, identity and proportions (with several references, use all of them); do not replace it with a generic emblem. This is a height map, not a normal map or colored illustration.';
 const common={model,prompt,size:'1024x1024',quality:'medium',output_format:'png',background:'opaque',n:1};
 let url='https://api.openai.com/v1/images/generations',payload=JSON.stringify(common),headers={Authorization:'Bearer '+key,'Content-Type':'application/json'};
 // Con referencias se usa la edición: una va como image; varias, como image[] (el modelo las combina).
 if(images.length){url='https://api.openai.com/v1/images/edits';const form=new FormData();for(const [k,v] of Object.entries(common))form.set(k,String(v));images.forEach((image,i)=>{const [prefix,b64]=image.split(','),png=prefix.includes('png');form.append(images.length>1?'image[]':'image',new Blob([Buffer.from(b64,'base64')],{type:png?'image/png':'image/jpeg'}),'reference-'+(i+1)+(png?'.png':'.jpg'));});payload=form;headers={Authorization:'Bearer '+key};}
 const response=await fetcher(url,{method:'POST',headers,body:payload,signal:AbortSignal.any([AbortSignal.timeout(150000),...(signal?[signal]:[])])});
 const data=await response.json();
 if(!response.ok){const message=response.status===403?'La cuenta de OpenAI todavía no tiene habilitada la generación de imágenes. Podés adjuntar una imagen y crear el relieve directamente.':data.error?.code==='insufficient_quota'?'La generación visual necesita créditos disponibles en OpenAI.':response.status===429?'La generación visual está ocupada. Intentá de nuevo en un momento.':'No se pudo generar la ilustración. Podés adjuntar una referencia o volver a intentar.';throw Object.assign(Error(message),{status:502});}
 const b64=data.data?.[0]?.b64_json;
 if(typeof b64!=='string'||b64.length>4000000||! /^[A-Za-z0-9+/]+=*$/.test(b64))throw Object.assign(Error('La generación visual no devolvió una imagen completa.'),{status:502});
 return {spec,imageDataUrl:'data:image/png;base64,'+b64,interpretation:!images.length};
}
