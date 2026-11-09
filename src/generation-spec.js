// palette: vacío = relieve de un solo filamento. Con colores, palette[0] es la placa (el fondo de la imagen)
// y el resto son los colores del motivo; en total hasta 4, uno por carrete del AMS.
export const generationSchema={anyOf:[{type:'null'},{type:'object',additionalProperties:false,properties:{mode:{type:'string',enum:['relief']},subject:{type:'string'},width:{type:'number'},height:{type:'number'},baseThickness:{type:'number'},depth:{type:'number'},palette:{type:'array',items:{type:'string'}}},required:['mode','subject','width','height','baseThickness','depth','palette']}]};
export function validateGeneration(raw){
 if(!raw||raw.mode!=='relief'||typeof raw.subject!=='string'||!raw.subject.trim()||raw.subject.length>1600)throw Object.assign(Error('Describí el motivo que querés crear (hasta 1600 caracteres).'),{status:400});
 const out={mode:raw.mode,subject:raw.subject.trim()};
 for(const [key,min,max] of [['width',10,250],['height',10,250],['baseThickness',1.2,8],['depth',.4,15]]){if(typeof raw[key]!=='number'||!Number.isFinite(raw[key])||raw[key]<min||raw[key]>max)throw Object.assign(Error('Revisá las medidas de generación: '+key+'.'),{status:400});out[key]=raw[key];}
 const palette=raw.palette??[];
 if(!Array.isArray(palette)||palette.length>4||!palette.every(c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)))throw Object.assign(Error('Los colores del relieve tienen que ser hasta 4 colores #RRGGBB.'),{status:400});
 const unique=[...new Set(palette.map(c=>c.toLowerCase()))];
 // Un solo color no separa nada: es el relieve monocromo de siempre.
 out.palette=unique.length>=2?unique:[];
 return out;
}
