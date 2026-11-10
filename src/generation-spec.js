// palette: vacío = relieve de un solo filamento. Con colores, palette[0] es la placa (el fondo de la imagen)
// y el resto son los colores del motivo; en total hasta 4, uno por carrete del AMS.
// redraw: la imagen adjunta es una foto (persona, mascota, paisaje) y se redibujar en colores planos;
// sin redraw, una imagen adjunta (logo, dibujo) se convierte tal cual.
// mode: 'relief' (placa en relieve, monocroma o multicolor), 'lithophane' (placa de litofanía: zonas oscuras más
// gruesas y claras más finas, blanco natural) o 'lithophane_sphere' (bola navideña / esfera hueca en litofanía con
// aro superior integrado y abertura circular inferior hole en mm para una luz LED).
export const generationModes=['relief','lithophane','lithophane_sphere'];
export const generationSchema={anyOf:[{type:'null'},{type:'object',additionalProperties:false,properties:{mode:{type:'string',enum:generationModes},subject:{type:'string'},width:{type:'number'},height:{type:'number'},baseThickness:{type:'number'},depth:{type:'number'},hole:{type:'number'},palette:{type:'array',items:{type:'string'}},redraw:{type:'boolean'}},required:['mode','subject','width','height','baseThickness','depth','hole','palette','redraw']}]};
export function validateGeneration(raw){
 if(!raw||!generationModes.includes(raw.mode)||typeof raw.subject!=='string'||!raw.subject.trim()||raw.subject.length>1600)throw Object.assign(Error('Describí el motivo que querés crear (hasta 1600 caracteres).'),{status:400});
 const out={mode:raw.mode,subject:raw.subject.trim()},litho=out.mode!=='relief';
 for(const [key,min,max] of [['width',10,250],['height',10,250],['baseThickness',litho?.8:1.2,8],['depth',.4,15]]){if(typeof raw[key]!=='number'||!Number.isFinite(raw[key])||raw[key]<min||raw[key]>max)throw Object.assign(Error('Revisá las medidas de generación: '+key+'.'),{status:400});out[key]=raw[key];}
 if(out.mode==='lithophane_sphere'){
  out.height=out.width;
  const hole=raw.hole===undefined||raw.hole===null||raw.hole===0?8:raw.hole;
  if(typeof hole!=='number'||!Number.isFinite(hole)||hole<0||hole>Math.min(60,out.width*.55))throw Object.assign(Error('Revisá las medidas de generación: hole.'),{status:400});
  out.hole=Math.round(Math.max(4,hole)*10)/10;
 }else if(raw.hole!==undefined&&raw.hole!==null&&raw.hole!==0){
  if(typeof raw.hole!=='number'||!Number.isFinite(raw.hole)||raw.hole<0||raw.hole>60)throw Object.assign(Error('Revisá las medidas de generación: hole.'),{status:400});
 }
 const palette=litho?[]:(raw.palette??[]);
 if(!Array.isArray(palette)||palette.length>4||!palette.every(c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)))throw Object.assign(Error('Los colores del relieve tienen que ser hasta 4 colores #RRGGBB.'),{status:400});
 // Colores casi iguales (dos negros, por ejemplo) gastarían un carrete del AMS sin que se note: se unen.
 const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)),unique=[];
 for(const color of palette.map(c=>c.toLowerCase()))if(!unique.some(u=>Math.hypot(...rgb(u).map((v,i)=>v-rgb(color)[i]))<48))unique.push(color);
 // Un solo color no separa nada: es el relieve monocromo de siempre.
 out.palette=unique.length>=2?unique:[];
 out.redraw=litho?false:raw.redraw===true;
 return out;
}
