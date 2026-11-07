// Direct editing of a free design: every operation shows its own measures, so small adjustments
// (a wall, a height, a text, a color) do not need the guide. Each change is built and checked before it is applied.
const labels={imported:'Pieza importada',box:'Bloque',open_box:'Caja abierta',cylinder:'Cilindro / cono',open_cylinder:'Recipiente redondo',revolve:'Pieza por perfil',sphere:'Esfera',extrude:'Contorno extruido',text:'Texto o ícono en volumen',engrave_text:'Grabado',emboss_text:'Relieve',union:'Unión',subtract:'Sustracción / hueco',intersect:'Intersección'};
const faceNames={top:'Arriba',bottom:'Abajo',front:'Frente',back:'Atrás',left:'Izquierda',right:'Derecha',around:'Alrededor (curvo)'};
const iconNames={'':'— (texto)',heart:'Corazón',paw:'Huellita',star:'Estrella',leaf:'Hoja',flower:'Flor',bone:'Hueso',house:'Casa',moon:'Luna'};
const fontLabels={'':'Preferida',gentilis:'Clásica',helvetiker:'Moderna',optimer:'Elegante'};
const fieldsOf={
 box:['size'],open_box:['size','wallThickness','floorThickness'],cylinder:['radius','radiusTop','height'],open_cylinder:['radius','radiusTop','height','wallThickness','floorThickness'],
 revolve:['points','wallThickness','floorThickness'],sphere:['radius'],extrude:['height'],text:['icon','text','font','fontSize','height'],
 engrave_text:['icon','text','font','fontSize','height','face','offset'],emboss_text:['icon','text','font','fontSize','height','face','offset']
};
const names={size:'Medidas X · Y · Z',wallThickness:'Pared',floorThickness:'Fondo',radius:'Radio inferior',radiusTop:'Radio superior',height:'Alto',points:'Perfil (radio, altura; …)',text:'Texto',font:'Tipografía',fontSize:'Tamaño',icon:'Ícono',face:'Cara',offset:'Corrimiento (→, ↑)',position:'Posición X · Y · Z',rotation:'Giro X · Y · Z (°)',color:'Color propio'};
const el=(tag,props={},...children)=>{const e=Object.assign(document.createElement(tag),props);e.append(...children);return e;};
const num=(value,step=.1)=>el('input',{type:'number',step,value:String(value??0)});

export function renderOpEditor(host,program,onChange){
 host.replaceChildren();
 program.nodes.forEach((n,i)=>{
  const card=el('details',{className:'op-card',open:program.nodes.length<=3||i===program.nodes.length-1});
  const summary=el('summary',{},el('b',{},`${i+1}. ${labels[n.type]||n.type}`),el('small',{},n.inputs?.length?' usa '+n.inputs.map(k=>k+1).join(', '):''));
  const body=el('div',{className:'op-body'}),error=el('p',{className:'op-error',hidden:true});card.append(summary,body,error);
  const commit=(mutate)=>{const next=structuredClone(program);mutate(next.nodes[i]);const problem=onChange(next);error.hidden=!problem;error.textContent=problem||'';};
  const row=(key,input)=>body.append(el('label',{className:'op-field'},names[key],input));
  for(const key of [...(fieldsOf[n.type]||[]),'color','position','rotation']){
   if(key==='color'&&['union','subtract','intersect','imported'].includes(n.type)&&!n.color)continue;
   if(['size','position','rotation','offset'].includes(key)){const len=key==='offset'?2:3,box=el('span',{className:'op-vec'}),inputs=Array.from({length:len},(_,k)=>{const x=num((n[key]||[])[k],key==='rotation'?15:.5);x.onchange=()=>commit(m=>{m[key]=inputs.map(v=>Number(v.value)||0);});return x;});box.append(...inputs);row(key,box);continue;}
   if(key==='points'){const t=el('input',{type:'text',value:(n.points||[]).map(p=>p.join(', ')).join('; ')});t.onchange=()=>commit(m=>{m.points=t.value.split(';').map(p=>p.split(',').map(Number)).filter(p=>p.length===2&&p.every(Number.isFinite));});row(key,t);continue;}
   if(key==='text'){if(n.icon)continue;const t=el('input',{type:'text',maxLength:60,value:n.text||''});t.onchange=()=>commit(m=>{m.text=t.value;});row(key,t);continue;}
   if(key==='icon'||key==='font'||key==='face'){const opts=key==='icon'?iconNames:key==='font'?fontLabels:faceNames;if(key==='font'&&n.icon)continue;const sel=el('select',{},...Object.entries(opts).map(([v,l])=>el('option',{value:v,textContent:l,selected:(n[key]||'')===v})));sel.onchange=()=>commit(m=>{m[key]=sel.value;if(key==='icon'&&!sel.value&&!m.text)m.text='TEXTO';});row(key,sel);continue;}
   if(key==='color'){const wrap=el('span',{className:'op-color'}),on=el('input',{type:'checkbox',checked:Boolean(n.color)}),pick=el('input',{type:'color',value:n.color||'#ffffff',disabled:!n.color});on.onchange=()=>commit(m=>{m.color=on.checked?pick.value:'';});pick.onchange=()=>commit(m=>{m.color=pick.value;});wrap.append(on,pick);row(key,wrap);continue;}
   const x=num(n[key],key==='fontSize'?1:.1);x.onchange=()=>commit(m=>{m[key]=Number(x.value);});row(key,x);
  }
  host.append(card);
 });
}
