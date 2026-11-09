import {proposeDesign} from './assistant.js';
import {generateVisual} from './visual-generation.js';
import {critiqueDesign} from './critique.js';
import {generateSculpt} from './sculpt.js';

export async function designService(body,env,fetcher=fetch,{signal}={}){
 if(body.action==='generateVisual')return generateVisual(body,env.OPENAI_API_KEY,fetcher,{signal,model:env.OPENAI_IMAGE_MODEL||'gpt-image-1.5'});
 if(body.action==='sculpt')return generateSculpt(body,env,fetcher,{signal});
 if(body.action==='critique')return critiqueDesign(body,env,fetcher,{signal});
 if(body.action&&body.action!=='chat')throw Object.assign(Error('Acción de diseño inválida.'),{status:400});
 return proposeDesign(body,env.OPENAI_API_KEY,fetcher,{signal,model:env.OPENAI_MODEL||'gpt-5.5'});
}
