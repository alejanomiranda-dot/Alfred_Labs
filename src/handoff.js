import {zipSync,strToU8} from 'fflate';
import {threeMfBytes} from './export.js';

export function safeName(value){return (value||'diseno').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,60)||'diseno';}
export function revisionName(project,date=new Date(),suffix=crypto.randomUUID().slice(0,6)){
 const pad=n=>String(n).padStart(2,'0');
 return `${safeName(project)}-${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${suffix}`;
}
export function printGuide(params,dimensions){return `TALLER DE VERO — ${params.project}

ARCHIVOS
• .3mf: geometría para Bambu Studio${params.kind==='keychain'?', con base clara, logo multicolor y QR del dorso como partes':params.kind==='free'?(params.importedColors?', relieve con la placa y cada color como partes separadas':', diseño libre'):', con base y relieve como partes'}.
• .json: diseño editable; abrir desde Taller de Vero con «Abrir proyecto».
Este 3MF no está laminado y no contiene el perfil de tu impresora.

ABRIR EN BAMBU STUDIO
1. Guardá el archivo .3mf en tu carpeta de trabajos. Si recibiste un ZIP, extraelo primero.
2. Abrí Bambu Studio. Usá Archivo > Importar > Importar 3MF/STL… (Ctrl+I) y elegí el .3mf. También podés arrastrarlo a la ventana.
3. Si pregunta cómo importar, conservá base y relieve como partes del mismo objeto, en su posición original. Si no aparecen separadas, revisá la lista de objetos antes de continuar.
4. Elegí el perfil exacto de tu Bambu Lab A2L, la boquilla y los materiales instalados.
5. Asigná los filamentos a las partes de base y de colores del diseño. Los colores del diseño son referencias visuales; no asignan automáticamente los carretes del AMS.
6. Laminá la placa y revisá tamaño, letras, agujero, capas y cambios de color.
7. Seleccioná tu impresora y enviá el trabajo desde Bambu Studio. Guardá allí el proyecto preparado para conservar el laminado y la configuración.

DATOS DEL DISEÑO
${params.kind==='free'?'Diseño libre · dimensiones XYZ: '+dimensions?.map(v=>v.toFixed(2)).join(' × ')+' mm · '+params.freeDesign.nodes.length+' operaciones':'Ancho: '+params.width+' mm · Alto: '+params.height+' mm\nBase: '+params.thickness+' mm · Relieve: '+params.relief+' mm · Agujero: '+params.hole+' mm'}
Color base: ${params.baseColor} · Color relieve: ${params.detailColor}
Dorso: ${params.backDecoration==='bone'?'Huesito ('+(params.backStyle==='raised'?'relieve':'grabado')+', '+params.backDepth+' mm)':'Sin decoración'}
Si hay relieve en ambas caras, comprobar orientación y soportes. El grabado del dorso no sobresale de la base.

${params.kind==='keychain'?'LLAVERO DE DOS CARAS\nFrente: logo original adaptado a hasta 3 colores sólidos. Los degradados se simplifican.\nDorso: QR al ras, con una profundidad de color de 0,6 mm sobre base clara.\nDestino exacto: '+params.qrText+'\nImprimir con el QR apoyado en la cama y conservar todas las partes como un único objeto.\n\n':''}PRIMERA MUESTRA
La geometría cerrada no garantiza calidad de impresión ni resistencia. Imprimí y medí una muestra. Si lleva QR, verificá el destino y escaneá la pieza física antes de entregarla.
`;
}
export function handoffFiles(model,stem){return {
 [`${stem}.3mf`]:threeMfBytes(model),
 [`${stem}.json`]:strToU8(JSON.stringify(model.params,null,2)),
 'COMO-IMPRIMIR.txt':strToU8(printGuide(model.params,model.dimensions))
};}
export function handoffZip(model,stem){return zipSync(handoffFiles(model,stem));}
export async function writeFolder(directory,files){
 // Unique revision subfolders prevent replacement of earlier work.
 const names=Object.keys(files),written=[];
 for(const name of names){if(/[\\/]/.test(name)||name==='.'||name==='..')throw Error('Nombre de archivo inválido.');}
 for(const name of names){const handle=await directory.getFileHandle(name,{create:true});const stream=await handle.createWritable();try{await stream.write(files[name]);await stream.close();written.push(name);}catch(error){try{await stream.abort();}catch{}error.writtenFiles=written;throw error;}}
 return written;
}
export async function saveAsFile(browser,data,name,extension){
 if(typeof browser.showSaveFilePicker!=='function')return {method:'download'};
 let handle;
 try{handle=await browser.showSaveFilePicker({id:'taller-vero-export',suggestedName:name,types:[{description:extension==='3mf'?'Pieza 3D para Bambu Studio':'Paquete de diseño',accept:{'application/octet-stream':['.'+extension]}}]});}
 catch(error){if(error.name==='AbortError')return {method:'cancelled'};if(['SecurityError','NotSupportedError','NotAllowedError'].includes(error.name))return {method:'download'};throw error;}
 const stream=await handle.createWritable();try{await stream.write(data);await stream.close();}catch(error){try{await stream.abort();}catch{}throw error;}
 return {method:'picker',name:handle.name};
}
