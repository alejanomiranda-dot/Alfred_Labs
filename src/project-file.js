import {unzipSync,strFromU8} from 'fflate';

export function projectFromBytes(name,bytes){
 if(bytes.length>40e6)throw Error('El proyecto es demasiado grande.');
 let text;
 if(/\.3mf$/i.test(name)){
  const metadata=unzipSync(bytes,{filter:file=>file.name==='Metadata/taller-de-vero.json'&&file.originalSize<=40e6})['Metadata/taller-de-vero.json'];
  if(!metadata)throw Error('Este 3MF no conserva un proyecto de Alfred. Abrilo desde «Desde un archivo 3D».');
  text=strFromU8(metadata);
 }else text=new TextDecoder().decode(bytes);
 try{return JSON.parse(text);}catch{throw Error('El archivo no contiene un proyecto válido de Alfred.');}
}
