// Measuring on a photo: either two clicks on a known length (a card edge, a ruler), or four clicks on the four
// corners of a standard card/DNI (85.6 × 53.98 mm) to rectify perspective inclination via 2D homography.
export const references={
 card:{label:'Tarjeta de crédito o DNI (lado largo, 85,6 mm)',mm:85.6},
 cardPerspective:{label:'Tarjeta completa · 4 esquinas (85,6 × 54 mm · corrige inclinación)',mm:85.6,heightMm:53.98,corners:4},
 cardShort:{label:'Tarjeta (lado corto, 54 mm)',mm:53.98},
 custom:{label:'Otra medida conocida (regla, objeto)',mm:null}
};

// Ordena 4 puntos arbitrarios alrededor de su centro y asigna el lado más largo a 85,6 mm y el corto a 53,98 mm.
export function orderQuadCorners(pts,longMm=85.6,shortMm=53.98){
 if(!Array.isArray(pts)||pts.length!==4)return null;
 const cx=pts.reduce((s,p)=>s+p[0],0)/4,cy=pts.reduce((s,p)=>s+p[1],0)/4;
 const sorted=[...pts].sort((a,b)=>Math.atan2(a[1]-cy,a[0]-cx)-Math.atan2(b[1]-cy,b[0]-cx));
 const d01=Math.hypot(sorted[1][0]-sorted[0][0],sorted[1][1]-sorted[0][1]);
 const d12=Math.hypot(sorted[2][0]-sorted[1][0],sorted[2][1]-sorted[1][1]);
 const [w,h]=d01>=d12?[longMm,shortMm]:[shortMm,longMm];
 return {src:sorted,dst:[[0,0],[w,0],[w,h],[0,h]]};
}

// Homografía 2D exacta entre 4 puntos en píxeles y 4 puntos en milímetros reales.
export function solveHomography(src,dst){
 const A=[],b=[];
 for(let i=0;i<4;i++){
  const [x,y]=src[i],[u,v]=dst[i];
  A.push([x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]);
  b.push(u,v);
 }
 const n=8;
 for(let col=0;col<n;col++){
  let pivot=col;for(let row=col+1;row<n;row++)if(Math.abs(A[row][col])>Math.abs(A[pivot][col]))pivot=row;
  if(Math.abs(A[pivot][col])<1e-10)return null;
  [A[col],A[pivot]]=[A[pivot],A[col]];[b[col],b[pivot]]=[b[pivot],b[col]];
  const div=A[col][col];for(let j=col;j<n;j++)A[col][j]/=div;b[col]/=div;
  for(let row=0;row<n;row++)if(row!==col){
   const f=A[row][col];if(!f)continue;
   for(let j=col;j<n;j++)A[row][j]-=f*A[col][j];b[row]-=f*b[col];
  }
 }
 return [...b,1];
}

export function applyHomography(H,[x,y]){
 const w=H[6]*x+H[7]*y+H[8];if(Math.abs(w)<1e-9)return [0,0];
 return [(H[0]*x+H[1]*y+H[2])/w,(H[3]*x+H[4]*y+H[5])/w];
}

export function openPhotoMeasure(imageUrl,onDone){
 const dialog=document.createElement('dialog');dialog.className='measure-dialog';
 dialog.innerHTML=`<div class="panel-title"><h2>Medir en la foto</h2><button type="button" class="subtle" data-close>Cerrar ✕</button></div>
 <p class="hint" data-step>1 · Elegí la referencia y marcá sus dos extremos en la foto.</p>
 <div class="measure-ref"><select data-ref>${Object.entries(references).map(([k,r])=>`<option value="${k}">${r.label}</option>`).join('')}</select><label>mm <input type="number" data-mm min="1" step="0.1" value="85.6"></label></div>
 <div class="measure-stage"><canvas data-canvas></canvas></div>
 <ol data-list class="measure-list"></ol>
 <p class="hint">La referencia tiene que estar apoyada en el mismo plano que la pieza. Con «4 esquinas» se corrige la inclinación de la foto automáticamente.</p>
 <div class="measure-actions"><button type="button" class="subtle" data-undo>Borrar último punto</button><button type="button" class="primary" data-done disabled>Agregar las medidas al pedido</button></div>`;
 document.body.append(dialog);
 const $=sel=>dialog.querySelector(sel),canvas=$('[data-canvas]'),ctx=canvas.getContext('2d'),img=new Image();
 let points=[],scale=null,homography=null;const measures=[];
 const refCount=()=>references[$('[data-ref]').value]?.corners||2;
 const draw=()=>{
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const r=Math.max(3,canvas.width/250),rc=refCount();
  if(rc===4&&points.length>=2){
   ctx.strokeStyle='#ffc857';ctx.lineWidth=r/1.5;ctx.beginPath();
   const quad=points.slice(0,Math.min(4,points.length));
   ctx.moveTo(...quad[0]);for(let i=1;i<quad.length;i++)ctx.lineTo(...quad[i]);
   if(quad.length===4)ctx.closePath();ctx.stroke();
  }
  points.forEach((p,i)=>{
   ctx.fillStyle=i<rc?'#ffc857':'#93f5ce';ctx.beginPath();ctx.arc(p[0],p[1],r,0,Math.PI*2);ctx.fill();
   if((rc===2&&i===1)||(i>=rc&&(i-rc)%2===1)){
    const a=points[i-1];ctx.strokeStyle=i<rc?'#ffc857':'#93f5ce';ctx.lineWidth=r/1.5;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...p);ctx.stroke();
    if(i>=rc&&(scale||homography)){
     ctx.font=`bold ${r*5}px system-ui`;ctx.fillStyle='#fff';ctx.strokeStyle='#000';ctx.lineWidth=r;
     const idx=(i-rc-1)/2,t=measures[idx]?.mm.toFixed(1)+' mm';
     ctx.strokeText(t,(a[0]+p[0])/2+r*2,(a[1]+p[1])/2);ctx.fillText(t,(a[0]+p[0])/2+r*2,(a[1]+p[1])/2);
    }
   }
  });
 };
 const list=()=>{$('[data-list]').replaceChildren(...measures.map(m=>{const li=document.createElement('li'),name=document.createElement('input');name.value=m.name;name.placeholder='¿Qué medida es? (ej. diámetro de la base)';name.oninput=()=>{m.name=name.value;};li.append(name,' = '+m.mm.toFixed(1).replace('.',',')+' mm');return li;}));$('[data-done]').disabled=!measures.length;};
 const step=()=>{
  const rc=refCount(),ready=rc===4?!!homography:!!scale;
  $('[data-step]').textContent=!ready?(rc===4?`1 · Marcá las 4 esquinas de la tarjeta (${points.length}/4).`:points.length<2?'1 · Marcá los dos extremos de la referencia.':'Ingresá su medida en mm y seguí.'):'2 · Marcá pares de puntos sobre la pieza: cada par es una medida.';
 };
 const recompute=()=>{
  const rc=refCount(),mm=Number($('[data-mm]').value);scale=null;homography=null;measures.length=0;
  if(rc===4&&points.length>=4){
   const ordered=orderQuadCorners(points.slice(0,4),mm||85.6,references.cardPerspective.heightMm);
   homography=ordered?solveHomography(ordered.src,ordered.dst):null;
   if(homography)for(let i=4;i+1<points.length;i+=2){const A=applyHomography(homography,points[i]),B=applyHomography(homography,points[i+1]);measures.push({name:'',mm:Math.hypot(B[0]-A[0],B[1]-A[1])});}
  }else if(rc===2){
   scale=points.length>=2&&mm>0?mm/Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1]):null;
   if(scale)for(let i=2;i+1<points.length;i+=2)measures.push({name:'',mm:Math.hypot(points[i+1][0]-points[i][0],points[i+1][1]-points[i][1])*scale});
  }
  list();step();draw();
 };
 $('[data-ref]').onchange=()=>{const r=references[$('[data-ref]').value];points=[];if(r.mm)$('[data-mm]').value=r.mm;else $('[data-mm]').focus();recompute();};
 $('[data-mm]').oninput=recompute;
 canvas.onclick=e=>{const b=canvas.getBoundingClientRect();points.push([(e.clientX-b.left)*canvas.width/b.width,(e.clientY-b.top)*canvas.height/b.height]);const names=measures.map(m=>m.name);recompute();measures.forEach((m,k)=>{if(names[k])m.name=names[k];});list();};
 $('[data-undo]').onclick=()=>{points.pop();recompute();};
 $('[data-close]').onclick=()=>dialog.close();
 $('[data-done]').onclick=()=>{const ref=$('[data-mm]').value,mode=refCount()===4?'con corrección de perspectiva por 4 esquinas':'con una referencia de '+String(ref).replace('.',',')+' mm';onDone('Medidas tomadas sobre la foto ('+mode+'): '+measures.map((m,k)=>(m.name||'medida '+(k+1))+' = '+m.mm.toFixed(1).replace('.',',')+' mm').join('; ')+'.');dialog.close();};
 dialog.addEventListener('close',()=>dialog.remove());
 img.onload=()=>{canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;draw();step();};img.src=imageUrl;
 dialog.showModal();
}
