// The person's own preferences: costs for quotes and a personal style the guide uses by default.
const key='alfred-ajustes-v1';
export const settingDefaults={pricePerKg:25000,currency:'$',hourly:0,extra:0,margin:100,business:'',baseColor:'#e9a08c',detailColor:'#fff8e9',font:'gentilis',styleNotes:'',fitClearance:.2};
export function loadSettings(){try{return {...settingDefaults,...JSON.parse(localStorage.getItem(key)||'{}')};}catch{return {...settingDefaults};}}
export function saveSettings(s){try{localStorage.setItem(key,JSON.stringify(s));return true;}catch{return false;}}
export function money(v,s){return s.currency+' '+Math.round(v).toLocaleString('es-AR');}
