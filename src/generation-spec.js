export const generationSchema={anyOf:[{type:'null'},{type:'object',additionalProperties:false,properties:{mode:{type:'string',enum:['relief']},subject:{type:'string'},width:{type:'number'},height:{type:'number'},baseThickness:{type:'number'},depth:{type:'number'}},required:['mode','subject','width','height','baseThickness','depth']}]};
export function validateGeneration(raw){
 if(!raw||raw.mode!=='relief'||typeof raw.subject!=='string'||!raw.subject.trim()||raw.subject.length>1600)throw Object.assign(Error('Describí el motivo que querés crear (hasta 1600 caracteres).'),{status:400});
 const out={mode:raw.mode,subject:raw.subject.trim()};
 for(const [key,min,max] of [['width',10,250],['height',10,250],['baseThickness',1.2,8],['depth',.4,15]]){if(typeof raw[key]!=='number'||!Number.isFinite(raw[key])||raw[key]<min||raw[key]>max)throw Object.assign(Error('Revisá las medidas de generación: '+key+'.'),{status:400});out[key]=raw[key];}
 return out;
}
