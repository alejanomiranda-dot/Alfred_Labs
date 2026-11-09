// Tema claro u oscuro: sigue al sistema salvo que la persona elija uno.
const key='alfred-theme',order=['auto','light','dark'],names={auto:'automático',light:'claro',dark:'oscuro'};

function stored(){try{const v=localStorage.getItem(key);return v==='light'||v==='dark'?v:'auto';}catch{return 'auto';}}
function store(value){try{if(value==='auto')localStorage.removeItem(key);else localStorage.setItem(key,value);}catch{}}

export function isDark(){
 const chosen=document.documentElement.dataset.theme;
 if(chosen)return chosen==='dark';
 return matchMedia('(prefers-color-scheme: dark)').matches;
}

export function setupTheme(button,onChange){
 let mode=stored();
 const apply=()=>{
  if(mode==='auto')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=mode;
  const label='Tema: '+names[mode];button.setAttribute('aria-label',label);button.title=label;onChange(isDark());
 };
 button.addEventListener('click',()=>{mode=order[(order.indexOf(mode)+1)%order.length];store(mode);apply();});
 matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(mode==='auto')apply();});
 apply();
}

export function cssColor(name){return getComputedStyle(document.documentElement).getPropertyValue(name).trim()||'#888888';}
