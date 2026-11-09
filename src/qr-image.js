// Decode the supplied pixels locally; a QR image never becomes a logo or an AI guess.
export async function readQrImage(source){
 const image=await createImageBitmap(source);
 try{
  const scale=Math.min(1024/image.width,1024/image.height,1),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const {default:jsQR}=await import('jsqr');
  return jsQR(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,{inversionAttempts:'attemptBoth'})?.data||null;
 }finally{image.close();}
}
