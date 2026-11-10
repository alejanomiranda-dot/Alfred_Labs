// The person's own preferences: costs for quotes and a personal style the guide uses by default.
const key='alfred-ajustes-v1';
export const settingDefaults={pricePerKg:25000,currency:'$',hourly:0,extra:0,margin:100,business:'',baseColor:'#e9a08c',detailColor:'#fff8e9',font:'gentilis',styleNotes:'',fitClearance:.2};
export function loadSettings(){try{return {...settingDefaults,...JSON.parse(localStorage.getItem(key)||'{}')};}catch{return {...settingDefaults};}}
export function saveSettings(s){try{localStorage.setItem(key,JSON.stringify(s));return true;}catch{return false;}}
export function money(v,s){return s.currency+' '+Math.round(v).toLocaleString('es-AR');}

// Aprende medidas recurrentes de objetos cotidianos mencionados por la persona (celular, LED, imanes) para futuros diseños.
const memoryPatterns=[
 {tag:'celular',re:/\b(?:mi\s+)?(?:celular|tel[eé]fono|iphone|samsung)[^.\n]{0,45}?(\d{2,3}(?:[.,]\d+)?\s*(?:x|×|por)\s*\d{2,3}(?:[.,]\d+)?(?:\s*(?:x|×|por)\s*\d{1,2}(?:[.,]\d+)?)?\s*mm|\d{2,3}(?:[.,]\d+)?\s*mm\s+de\s+ancho)/i},
 {tag:'luz LED',re:/\b(?:luz|lucecita|led|portal[aá]mparas)[^.\n]{0,35}?(\d{1,2}(?:[.,]\d+)?\s*mm)/i},
 {tag:'imán',re:/\b(?:im[aá]n|imanes|neodimio)[^.\n]{0,30}?(\d{1,2}(?:[.,]\d+)?\s*(?:x|×|por)\s*\d{1,2}(?:[.,]\d+)?\s*mm|\d{1,2}(?:[.,]\d+)?\s*mm)/i}
];
export function rememberFromPrompt(settings,prompt){
 if(!settings||typeof prompt!=='string')return false;
 const existing=String(settings.styleNotes||'').split(/\s*·\s*/).filter(Boolean);
 let changed=false;
 for(const {tag,re} of memoryPatterns){
  const m=prompt.match(re);if(!m)continue;
  const entry=`${tag}: ${m[1].trim()}`;
  const idx=existing.findIndex(e=>e.toLowerCase().startsWith(tag.toLowerCase()+':'));
  if(idx>=0){if(existing[idx]!==entry){existing[idx]=entry;changed=true;}}
  else{existing.push(entry);changed=true;}
 }
 if(changed){settings.styleNotes=existing.join(' · ').slice(0,400);saveSettings(settings);}
 return changed;
}
