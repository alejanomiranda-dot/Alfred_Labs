import QRCode from 'qrcode';
import {readKeychainLogo,keychainUrl,keychainLogoPreview} from './keychain.js';

export const isTwoSidedKeychain=prompt=>/llaver|chapita|tarjeta|frente|dorso|atr[aá]s/i.test(prompt)&&/\bqr\b|c[oó]digo/i.test(prompt)&&/logo|marca/i.test(prompt);

export function createKeychainDesigner({onCreate,onError}){
 const dialog=document.createElement('dialog');dialog.id='keychainDialog';dialog.className='keychain-dialog';dialog.setAttribute('aria-labelledby','keychainHeading');
 dialog.innerHTML=`<form id="keychainForm"><div class="keychain-heading"><div><p class="eyebrow">UNA PIEZA · DOS CARAS</p><h2 id="keychainHeading">Tu logo adelante. Tu QR atrás.</h2></div><button type="button" class="subtle" id="closeKeychain" aria-label="Cerrar llavero">✕</button></div><p class="keychain-intro">Cargá tu logo y el enlace. Alfred arma el llavero con el archivo original, sin generar otra imagen.</p><div class="keychain-inputs"><label class="keychain-upload">1. Logo del frente<input id="keychainLogo" type="file" accept="image/png,image/jpeg"><span id="keychainLogoName">PNG transparente o JPG sobre fondo blanco</span></label><label>2. ¿A dónde lleva el QR?<input id="keychainLink" type="url" placeholder="https://tuweb.com" required maxlength="180" autocomplete="url"><span class="hint">Un enlace corto permite un QR más fácil de imprimir y leer.</span></label></div><div class="keychain-faces"><figure><div class="keychain-face"><img id="keychainFront" alt="Logo del frente adaptado para impresión" hidden><span id="keychainFrontEmpty">Tu logo</span></div><figcaption>Frente · logo original</figcaption></figure><figure><div class="keychain-face"><img id="keychainBack" alt="QR del dorso" hidden><span id="keychainBackEmpty">Tu QR</span></div><figcaption>Dorso · QR al ras</figcaption></figure></div><p id="keychainPalette" class="hint">Base clara y hasta 3 colores para el logo y el QR. Se simplifican los degradados.</p><details class="keychain-size"><summary>Tamaño recomendado: 50 × 60 mm · cambiar</summary><div class="fields"><label>Ancho · mm<input id="keychainWidth" type="number" min="45" max="100" step="1" value="50" required></label><label>Alto · mm<input id="keychainHeight" type="number" min="50" max="100" step="1" value="60" required></label></div><p class="hint">Base de 3,2 mm, relieve de 0,6 mm y agujero de 4 mm. El QR queda plano contra la cama de impresión.</p></details><p id="keychainStatus" role="status" aria-live="polite">Subí el logo para empezar.</p><div class="keychain-footer"><button id="createKeychain" type="submit" class="primary full" disabled>Crear vista previa 3D</button><p class="hint">Revisá las dos caras antes de guardar el 3MF. No consume IA.</p></div></form>`;
 document.body.append(dialog);const $=id=>dialog.querySelector('#'+id);let logo=null,busy=false,serial=0;
 function available(){const enabled=!busy&&!!logo&&!!$('keychainLink').value.trim();$('createKeychain').disabled=!enabled;$('keychainLogo').disabled=busy;}
 async function load(source,name){
  const task=++serial;busy=true;logo=null;available();$('keychainStatus').textContent='Preparando los colores y contornos del logo…';
  try{
   if(source instanceof File&&(!['image/png','image/jpeg'].includes(source.type)||source.size>10e6))throw Error('Elegí un PNG o JPG de hasta 10 MB.');
   const result=await readKeychainLogo(source,name);if(task!==serial)return;logo=result.config;$('keychainFront').src=result.preview;$('keychainFront').hidden=false;$('keychainFrontEmpty').hidden=true;$('keychainLogoName').textContent=name;
   $('keychainPalette').textContent='Logo adaptado a '+logo.layers.length+' colores sólidos + base clara. Conserva los contornos del archivo; los degradados se simplifican.';
   $('keychainStatus').textContent='Logo listo. Revisá el enlace del QR y creá la vista previa.';
  }catch(error){if(task===serial){$('keychainStatus').textContent=error.message;$('keychainFront').hidden=true;$('keychainFrontEmpty').hidden=false;}}
  finally{if(task===serial){busy=false;available();}}
 }
 async function qrPreview(){
  const value=$('keychainLink').value.trim();available();if(!value){$('keychainBack').hidden=true;$('keychainBackEmpty').hidden=false;return;}
  try{const url=keychainUrl(value),data=await QRCode.toDataURL(url,{errorCorrectionLevel:'M',margin:4,width:240,color:{dark:'#30213d',light:'#ffffff'}});if(value!==$('keychainLink').value.trim())return;$('keychainBack').src=data;$('keychainBack').hidden=false;$('keychainBackEmpty').hidden=true;}catch{$('keychainBack').hidden=true;$('keychainBackEmpty').hidden=false;}
 }
 $('keychainLogo').onchange=()=>{const file=$('keychainLogo').files[0];if(file)load(file,file.name);};$('keychainLink').oninput=qrPreview;
 $('closeKeychain').onclick=()=>dialog.close();
 $('keychainForm').onsubmit=async event=>{
  event.preventDefault();if(busy||!logo)return;busy=true;available();$('keychainStatus').textContent='Construyendo las dos caras y comprobando la pieza…';
  try{
   const qrText=keychainUrl($('keychainLink').value);await new Promise(resolve=>setTimeout(resolve,30));
   onCreate({keychain:logo,qrText,width:Number($('keychainWidth').value),height:Number($('keychainHeight').value)});dialog.close();
  }catch(error){$('keychainStatus').textContent=error.message;onError?.(error.message);}finally{busy=false;available();}
 };
 return {async open({imageDataUrl,name='Logo adjunto',url,keychain,width,height}={}){if(!dialog.open)dialog.showModal();if(width)$('keychainWidth').value=width;if(height)$('keychainHeight').value=height;if(url){$('keychainLink').value=url;qrPreview();}if(imageDataUrl)await load(imageDataUrl,name);else{if(keychain){logo=keychain;$('keychainFront').src=keychainLogoPreview(logo);$('keychainFront').hidden=false;$('keychainFrontEmpty').hidden=true;$('keychainLogoName').textContent=logo.name;$('keychainStatus').textContent='Logo recuperado del proyecto. Podés cambiar el enlace sin volver a cargarlo.';}available();}}};
}
