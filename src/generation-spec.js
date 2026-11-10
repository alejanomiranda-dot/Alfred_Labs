export const generationModes=['relief','lithophane','lithophane_sphere','lithophane_arc','lithophane_cylinder','cutter'];
export const generationSchema={anyOf:[{type:'null'},{type:'object',additionalProperties:false,properties:{
 mode:{type:'string',enum:generationModes},
 subject:{type:'string'},
 width:{type:'number'},
 height:{type:'number'},
 baseThickness:{type:'number'},
 depth:{type:'number'},
 hole:{type:'number'},
 palette:{type:'array',items:{type:'string'},maxItems:4},
 redraw:{type:'boolean'}
},required:['mode','subject','width','height','baseThickness','depth','hole','palette','redraw']}]};

function num(v,min,max,label){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(label+' fuera de rango.');return Math.round(v*10)/10;}
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const colorDist=(a,b)=>Math.hypot(...rgb(a).map((v,i)=>v-rgb(b)[i]));
export function validateGeneration(raw){
 if(!raw||typeof raw!=='object')throw Error('Faltan los datos de generación visual.');
 const mode=generationModes.includes(raw.mode)?raw.mode:null;
 if(!mode)throw Error('Modo de generación no disponible.');
 if(typeof raw.subject!=='string'||raw.subject.trim().length<3||raw.subject.length>600)throw Error('Describí el motivo a generar.');
 const isLitho=mode.startsWith('lithophane');
 const isCutter=mode==='cutter';
 const width=num(raw.width,20,220,'Ancho');
 const height=mode==='lithophane_sphere'?width:num(raw.height,20,220,'Alto');
 const baseThickness=num(raw.baseThickness,isLitho?.8:1.2,10,'Base');
 const depth=num(raw.depth,.4,isCutter?24:12,'Relieve');
 const maxHole=Math.max(8,Math.round(width*.65*10)/10);
 const hole=mode==='lithophane_sphere'||mode==='lithophane_cylinder'
  ?num(typeof raw.hole==='number'&&raw.hole>0?raw.hole:(mode==='lithophane_cylinder'?Math.min(38,Math.max(12,Math.round(width*.4))):8),4,Math.min(80,maxHole),'Abertura inferior')
  :typeof raw.hole==='number'&&Number.isFinite(raw.hole)&&raw.hole>=0&&raw.hole<=80?Math.round(raw.hole*10)/10:0;
 if(raw.palette!==undefined&&(!Array.isArray(raw.palette)||raw.palette.length>4||raw.palette.some(c=>typeof c!=='string'||!/^#[0-9a-f]{6}$/i.test(c))))throw Error('Paleta de colores inválida.');
 const clean=(raw.palette||[]).map(c=>c.toLowerCase()),dedup=[];
 for(const c of clean)if(!dedup.some((d,i)=>i>0&&colorDist(c,d)<32))dedup.push(c);
 const palette=isLitho||isCutter?[]:dedup.length>=2?dedup:[];
 return {mode,subject:raw.subject.trim(),width,height,baseThickness,depth,hole,palette,redraw:isLitho||isCutter?false:!!raw.redraw};
}
