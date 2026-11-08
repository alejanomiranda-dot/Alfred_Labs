import {validateGeneration} from '../src/generation-spec.js';
export function validImage(value){return typeof value==='string'&&value.length<=850000&&/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(value);}
export async function generateVisual(body,key,fetcher=fetch,{signal,model=process.env.OPENAI_IMAGE_MODEL||'gpt-image-1.5'}={}){
 const spec=validateGeneration(body.spec);
 if(spec.mode!=='relief')throw Object.assign(Error('Este pedido requiere el motor de esculturas 3D.'),{status:400});
 if(!key)throw Object.assign(Error('Falta configurar la generación visual en el servidor.'),{status:503});
 if(body.imageDataUrl&&!validImage(body.imageDataUrl))throw Object.assign(Error('Adjuntá una referencia PNG o JPG válida.'),{status:400});
 const prompt='Create a grayscale BAS-RELIEF HEIGHT MAP for 3D printing, not a photograph of a sculpture. Subject: '+spec.subject+'. Frontal orthographic composition, no perspective, no cast shadows, no lighting gradients across a flat surface. Black is the lowest/background plane, white is the highest raised detail, gray is intermediate depth. Center the complete subject with 6% black padding, no cropping. Aspect ratio of the final plaque: '+spec.width+':'+spec.height+'. Large legible shapes and sturdy connected details suitable for a small FDM print. If there is a reference, preserve its silhouette, lettering, identity and proportions; do not replace it with a generic emblem. This is a height map, not a normal map or colored illustration.';
 const common={model,prompt,size:'1024x1024',quality:'medium',output_format:'png',background:'opaque',n:1};
 let url='https://api.openai.com/v1/images/generations',payload=JSON.stringify(common),headers={Authorization:'Bearer '+key,'Content-Type':'application/json'};
 if(body.imageDataUrl){url='https://api.openai.com/v1/images/edits';const [prefix,b64]=body.imageDataUrl.split(','),form=new FormData();for(const [k,v] of Object.entries(common))form.set(k,String(v));form.set('image',new Blob([Buffer.from(b64,'base64')],{type:prefix.includes('png')?'image/png':'image/jpeg'}),'reference.'+(prefix.includes('png')?'png':'jpg'));payload=form;headers={Authorization:'Bearer '+key};}
 const response=await fetcher(url,{method:'POST',headers,body:payload,signal:AbortSignal.any([AbortSignal.timeout(150000),...(signal?[signal]:[])])});
 const data=await response.json();
 if(!response.ok){const message=response.status===403?'La cuenta de OpenAI todavía no tiene habilitada la generación de imágenes. Podés adjuntar una imagen y crear el relieve directamente.':data.error?.code==='insufficient_quota'?'La generación visual necesita créditos disponibles en OpenAI.':response.status===429?'La generación visual está ocupada. Intentá de nuevo en un momento.':'No se pudo generar la ilustración. Podés adjuntar una referencia o volver a intentar.';throw Object.assign(Error(message),{status:502});}
 const b64=data.data?.[0]?.b64_json;
 if(typeof b64!=='string'||b64.length>4000000||! /^[A-Za-z0-9+/]+=*$/.test(b64))throw Object.assign(Error('La generación visual no devolvió una imagen completa.'),{status:502});
 return {spec,imageDataUrl:'data:image/png;base64,'+b64,interpretation:!body.imageDataUrl};
}
