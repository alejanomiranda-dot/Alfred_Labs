import {Vector2} from 'three';
// Studio outputs: a product photo of the piece (for a catalog or social media) and a printable quote.
const escapeHtml=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));

// Renders the current view at high resolution over a soft studio background, without grid or measuring aids.
export function captureView({renderer,scene,camera,hide=[]},width,height,background){
 const prev=renderer.getSize(new Vector2()),prevRatio=renderer.getPixelRatio(),prevW=prev.x,prevH=prev.y,prevAspect=camera.aspect;
 const hidden=hide.filter(o=>o&&o.visible);hidden.forEach(o=>{o.visible=false;});
 try{
  renderer.setPixelRatio(1);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.render(scene,camera);
  const out=document.createElement('canvas');out.width=width;out.height=height;const ctx=out.getContext('2d');
  if(background){const g=ctx.createRadialGradient(width/2,height*.45,height*.1,width/2,height*.55,height*.9);g.addColorStop(0,background[0]);g.addColorStop(1,background[1]);ctx.fillStyle=g;ctx.fillRect(0,0,width,height);}
  ctx.drawImage(renderer.domElement,0,0,width,height);return out;
 }finally{hidden.forEach(o=>{o.visible=true;});renderer.setPixelRatio(prevRatio);renderer.setSize(prevW,prevH,false);camera.aspect=prevAspect;camera.updateProjectionMatrix();renderer.render(scene,camera);}
}
export function productPhoto(view,{title,subtitle}){
 const canvas=captureView(view,2000,1500,['#ffffff','#dfe5ec']),ctx=canvas.getContext('2d');
 ctx.fillStyle='#1d2a38';ctx.font='600 54px system-ui,sans-serif';ctx.fillText(title,80,1380);
 if(subtitle){ctx.fillStyle='#5b6b7c';ctx.font='32px system-ui,sans-serif';ctx.fillText(subtitle,82,1430);}
 return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
}
export function thumbnail(view){return captureView(view,320,240,['#16222f','#0b131c']).toDataURL('image/jpeg',.8);}

export function quoteHtml(q){
 const row=(label,value)=>`<tr><td>${escapeHtml(label)}</td><td class="n">${escapeHtml(value)}</td></tr>`;
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Presupuesto · ${escapeHtml(q.project)}</title><style>
 @page{size:A4;margin:18mm}body{font:14px/1.5 system-ui,sans-serif;color:#1d2a38;margin:0}header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1d2a38;padding-bottom:10px;margin-bottom:18px}h1{font-size:26px;margin:0}small{color:#5b6b7c}
 .hero{display:grid;grid-template-columns:1.1fr 1fr;gap:20px;align-items:start}.hero img{width:100%;border-radius:10px;border:1px solid #dfe5ec}table{width:100%;border-collapse:collapse}td{padding:7px 4px;border-bottom:1px solid #e6ebf0}td.n{text-align:right;white-space:nowrap}.total td{font-weight:700;font-size:17px;border-bottom:none;border-top:2px solid #1d2a38}.swatch{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-1px;border:1px solid #0002}footer{margin-top:28px;color:#5b6b7c;font-size:12px}
 </style></head><body><header><div><h1>Presupuesto</h1><small>${escapeHtml(q.business||'Taller de impresión 3D')}</small></div><small>${escapeHtml(q.date)}</small></header>
 <div class="hero"><img src="${q.image}" alt="Vista de la pieza"><div><h2 style="margin:0 0 8px">${escapeHtml(q.project)}</h2><table>${row('Medidas',q.size)}${row('Material estimado',q.grams)}${row('Tiempo de impresión',q.time)}${row('Colores',String(q.colors.length))}</table><p>${q.colors.map(c=>`<span class="swatch" style="background:${escapeHtml(c)}"></span>`).join('')}</p></div></div>
 <h3>Detalle</h3><table>${row('Material',q.material)}${q.machine?row('Uso de la impresora',q.machine):''}${q.extra?row('Terminación, armado o envío',q.extra):''}${row('Diseño y trabajo',q.work)}<tr class="total"><td>Total</td><td class="n">${escapeHtml(q.total)}</td></tr></table>
 <footer>Valores estimados a partir del diseño digital; pueden variar levemente según el laminado final. Presupuesto válido por 15 días.</footer></body></html>`;
}
export function printHtml(html){
 const frame=document.createElement('iframe');frame.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0';document.body.append(frame);
 frame.srcdoc=html;frame.onload=()=>{frame.contentWindow.focus();frame.contentWindow.print();setTimeout(()=>frame.remove(),60000);};
}
