// Guided intake for a spare part: a drawing shows what to measure with the caliper, and the answers become a
// complete, unambiguous request for the guide (including the fit clearance).
const drawing=`<svg viewBox="0 0 380 176" class="caliper-drawing" role="img" aria-label="Qué medir: exterior, interior, alto y pared">
<defs><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="currentColor"/></marker></defs>
<g fill="none" stroke="#7bc5ff" stroke-width="2"><path d="M60 40h120v100H60z"/><path d="M75 40v100M165 40v100" stroke-dasharray="4 4" stroke="#4a6a88"/></g>
<rect x="60" y="40" width="15" height="100" fill="#7bc5ff33"/><rect x="165" y="40" width="15" height="100" fill="#7bc5ff33"/>
<g stroke="#93f5ce" stroke-width="1.6" color="#93f5ce"><path d="M60 22h120" marker-start="url(#arr)" marker-end="url(#arr)"/><path d="M75 156h90" marker-start="url(#arr)" marker-end="url(#arr)"/><path d="M196 40v100" marker-start="url(#arr)" marker-end="url(#arr)"/><path d="M60 92h15" marker-start="url(#arr)" marker-end="url(#arr)"/></g>
<g fill="#dce8f5" font-size="11" font-family="system-ui"><text x="98" y="16">A · exterior</text><text x="92" y="168">B · interior</text><text x="204" y="94">C · alto</text><text x="8" y="82">D · pared</text></g>
<text x="262" y="46" fill="#93a8bd" font-size="10" font-family="system-ui"><tspan x="262" dy="0">Corte de la pieza.</tspan><tspan x="262" dy="15">Con calibre: A con</tspan><tspan x="262" dy="15">las mordazas de</tspan><tspan x="262" dy="15">afuera, B con las</tspan><tspan x="262" dy="15">de adentro y C con</tspan><tspan x="262" dy="15">la varilla del fondo.</tspan></text></svg>`;

export function openSparePart(settings,onSubmit){
 const dialog=document.createElement('dialog');dialog.className='spare-dialog';
 dialog.innerHTML=`<form method="dialog"><div class="panel-title"><h2>Repuesto a medida</h2><button value="cancel" class="subtle">Cerrar ✕</button></div>
 <p class="hint">Contame qué pieza necesitás reemplazar. Con calibre, medí lo que corresponda; dejá vacío lo que no aplique.</p>${drawing}
 <label>¿Qué pieza es?<input name="what" required maxlength="120" placeholder="Tapa del frasco de especias, perilla del horno…"></label>
 <label>¿Dónde va y cómo encaja?<select name="fit"><option value="entra dentro de otra pieza">Entra dentro de otra pieza</option><option value="otra pieza entra dentro de esta">Otra pieza entra dentro de esta</option><option value="se enrosca">Se enrosca</option><option value="se atornilla o lleva tornillos">Se atornilla</option><option value="apoya o se pega, sin encastre">Apoya o se pega, sin encastre</option></select></label>
 <div class="fields"><label>A · exterior (mm)<input name="outer" type="number" min="0" step="0.05"></label><label>B · interior (mm)<input name="inner" type="number" min="0" step="0.05"></label></div>
 <div class="fields"><label>C · alto o largo (mm)<input name="height" type="number" min="0" step="0.05"></label><label>D · pared (mm)<input name="wall" type="number" min="0" step="0.05"></label></div>
 <label>Otras medidas o detalles (agujeros, roscas, pestañas)<textarea name="notes" rows="2" maxlength="600"></textarea></label>
 <label>Holgura de encastre (mm)<input name="clearance" type="number" min="0" max="1" step="0.05" value="${settings.fitClearance}"></label>
 <p class="hint">Holgura: juego que se suma para que entre sin forzar. 0,2 mm suele ir bien en la A2L; si queda flojo, bajala; si no entra, subila. Antes de imprimir el repuesto entero, usá «Prueba de encaje» en Fabricación.</p>
 <button value="ok" class="primary full">Empezar con la guía</button></form>`;
 document.body.append(dialog);
 dialog.addEventListener('close',()=>{
  if(dialog.returnValue==='ok'){const d=Object.fromEntries(new FormData(dialog.querySelector('form')));const mm=(k,l)=>d[k]?`${l}: ${String(d[k]).replace('.',',')} mm`:'';
   const lines=[mm('outer','A, medida exterior (diámetro o ancho)'),mm('inner','B, medida interior'),mm('height','C, alto o largo'),mm('wall','D, espesor de pared')].filter(Boolean);
   onSubmit(`Necesito un repuesto: ${d.what}. Encaje: ${d.fit}. Medidas tomadas con calibre — ${lines.join('; ')||'sin medidas cargadas'}.${d.notes?' Detalles: '+d.notes+'.':''} Aplicá una holgura de ${String(d.clearance||0).replace('.',',')} mm en las superficies que encajan con otra pieza (explicame dónde la sumaste). Si falta alguna medida esencial, preguntame antes de proponer.`);}
  dialog.remove();});
 dialog.showModal();
}
