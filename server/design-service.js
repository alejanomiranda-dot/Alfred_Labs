import {proposeDesign} from './assistant.js';
import {generateVisual} from './visual-generation.js';

export async function designService(body,env,fetcher=fetch,{signal}={}){
 if(body.action==='generateVisual')return generateVisual(body,env.OPENAI_API_KEY,fetcher,{signal,model:env.OPENAI_IMAGE_MODEL||'gpt-image-1.5'});
 if(body.action&&body.action!=='chat')throw Object.assign(Error('Acción de diseño inválida.'),{status:400});
 return proposeDesign(body,env.OPENAI_API_KEY,fetcher,{signal});
}
