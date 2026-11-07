// Measuring on a photo: first two clicks on something of known length (a card, a ruler), then each pair of clicks
// gives a real measure in mm. Only reliable when the reference and the piece are at the same distance from the camera.
export const references={card:{label:'Tarjeta de crédito o DNI (lado largo, 85,6 mm)',mm:85.6},cardShort:{label:'Tarjeta (lado corto, 54 mm)',mm:53.98},custom:{label:'Otra medida conocida (regla, objeto)',mm:null}};

export function openPhotoMeasure(imageUrl,onDone){
 const dialog=document.createElement('dialog');dialog.className='measure-dialog';
 dialog.innerHTML=`<div class="panel-title"><h2>Medir en la foto</h2><button type="button" class="subtle" data-close>Cerrar ✕</button></div>
 <p class="hint" data-step>1 · Elegí la referencia y marcá sus dos extremos en la foto.</p>
 <div class="measure-ref"><select data-ref>${Object.entries(references).map(([k,r])=>`<option value="${k}">${r.label}</option>`).join('')}</select><label>mm <input type="number" data-mm min="1" step="0.1" value="85.6"></label></div>
 <div class="measure-stage"><canvas data-canvas></canvas></div>
 <ol data-list class="measure-list"></ol>
 <p class="hint">La foto tiene que estar tomada de frente, con la referencia apoyada junto a la pieza y a la misma distancia de la cámara. Las medidas son aproximadas (±5 %): para encastres, confirmalas con calibre.</p>
 <div class="measure-actions"><button type="button" class="subtle" data-undo>Borrar último punto</button><button type="button" class="primary" data-done disabled>Agregar las medidas al pedido</button></div>`;
 document.body.append(dialog);
 const $=sel=>dialog.querySelector(sel),canvas=$('[data-canvas]'),ctx=canvas.getContext('2d'),img=new Image();
 let points=[],scale=null;const measures=[];
 const draw=()=>{ctx.drawImage(img,0,0,canvas.width,canvas.height);const r=Math.max(3,canvas.width/250);
  points.forEach((p,i)=>{const isRef=!scale&&i<2||scale&&i<2;ctx.fillStyle=i<2?'#ffc857':'#93f5ce';ctx.beginPath();ctx.arc(p[0],p[1],r,0,Math.PI*2);ctx.fill();if(i%2===1){const a=points[i-1];ctx.strokeStyle=i<2?'#ffc857':'#93f5ce';ctx.lineWidth=r/1.5;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...p);ctx.stroke();if(i>=2&&scale){ctx.font=`bold ${r*5}px system-ui`;ctx.fillStyle='#fff';ctx.strokeStyle='#000';ctx.lineWidth=r;const t=measures[(i-3)/2]?.mm.toFixed(1)+' mm';ctx.strokeText(t,(a[0]+p[0])/2+r*2,(a[1]+p[1])/2);ctx.fillText(t,(a[0]+p[0])/2+r*2,(a[1]+p[1])/2);}}if(isRef&&i===1){}});};
 const list=()=>{$('[data-list]').replaceChildren(...measures.map((m,k)=>{const li=document.createElement('li'),name=document.createElement('input');name.value=m.name;name.placeholder='¿Qué medida es? (ej. diámetro de la base)';name.oninput=()=>{m.name=name.value;};li.append(name,' = '+m.mm.toFixed(1).replace('.',',')+' mm');return li;}));$('[data-done]').disabled=!measures.length;};
 const step=()=>{$('[data-step]').textContent=!scale?(points.length<2?'1 · Marcá los dos extremos de la referencia.':'Ingresá su medida en mm y seguí.'):'2 · Marcá pares de puntos sobre la pieza: cada par es una medida.';};
 const recompute=()=>{const mm=Number($('[data-mm]').value);scale=points.length>=2&&mm>0?mm/Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1]):null;measures.length=0;if(scale)for(let i=2;i+1<points.length;i+=2)measures.push({name:'',mm:Math.hypot(points[i+1][0]-points[i][0],points[i+1][1]-points[i][1])*scale});list();step();draw();};
 $('[data-ref]').onchange=()=>{const r=references[$('[data-ref]').value];if(r.mm)$('[data-mm]').value=r.mm;else $('[data-mm]').focus();recompute();};
 $('[data-mm]').oninput=recompute;
 canvas.onclick=e=>{const b=canvas.getBoundingClientRect();points.push([(e.clientX-b.left)*canvas.width/b.width,(e.clientY-b.top)*canvas.height/b.height]);const names=measures.map(m=>m.name);recompute();measures.forEach((m,k)=>{if(names[k])m.name=names[k];});list();};
 $('[data-undo]').onclick=()=>{points.pop();recompute();};
 $('[data-close]').onclick=()=>dialog.close();
 $('[data-done]').onclick=()=>{const ref=$('[data-mm]').value;onDone('Medidas tomadas sobre la foto (aproximadas, con una referencia de '+String(ref).replace('.',',')+' mm): '+measures.map((m,k)=>(m.name||'medida '+(k+1))+' = '+m.mm.toFixed(1).replace('.',',')+' mm').join('; ')+'.');dialog.close();};
 dialog.addEventListener('close',()=>dialog.remove());
 img.onload=()=>{canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;draw();step();};img.src=imageUrl;
 dialog.showModal();
}
