// Offline Bambu Studio CLI verification. Does not contact or start a printer.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {unzipSync,strFromU8} from 'fflate';
const root=path.resolve(import.meta.dirname,'..'),studio=process.env.BAMBU_STUDIO_DIR||path.join(root,'.tools/bambu-studio/portable');
const input=path.resolve(process.argv[2]||'artifacts/premium-20261116/mejorado'),output=path.join(input,'laminado');
const profiles=path.join(studio,'resources/profiles/BBL');await fs.mkdir(output,{recursive:true});
async function resolve(kind,name,seen=[]){
 if(seen.includes(name))throw Error('Ciclo de perfiles');
 const data=JSON.parse((await fs.readFile(path.join(profiles,kind,name+'.json'),'utf8')).replace(/^\uFEFF/,''));
 const result=data.inherits?await resolve(kind,data.inherits,[...seen,name]):{};
 for(const include of data.include||[])Object.assign(result,await resolve(kind,include,[...seen,name]));
 Object.assign(result,data);delete result.inherits;delete result.include;return result;
}
for(const [kind,name] of [['machine','Bambu Lab A2L 0.4 nozzle'],['process','0.16mm High Quality @BBL A2L'],['filament','Bambu PLA Basic @BBL A2L 0.4 nozzle']]){
 const config=await resolve(kind,name);
 if(kind==='machine')config.printer_settings_id=name;
 if(kind==='process')Object.assign(config,{print_settings_id:name,wall_loops:'4',bottom_shell_layers:'5',top_shell_layers:'5',enable_support:'0',brim_type:'no_brim',wall_generator:'arachne'});
 if(kind==='filament')config.filament_settings_id=[name];
 await fs.writeFile(path.join(output,kind+'.json'),JSON.stringify(config,null,2));
}
const report=[];
for(const file of (await fs.readdir(input)).filter(f=>f.endsWith('.3mf'))){
 const name=file.slice(0,-4),dir=path.join(output,name);await fs.mkdir(dir,{recursive:true});
 const args=['--load-settings',path.join(output,'machine.json')+';'+path.join(output,'process.json'),'--load-filaments',path.join(output,'filament.json'),'--curr-bed-type','Textured PEI Plate','--arrange','1','--slice','0','--debug','2','--outputdir',dir,'--export-3mf',name+'.gcode.3mf',path.join(input,file)];
 const log=await fs.open(path.join(dir,'cli.log'),'w');
 const code=await new Promise((resolve,reject)=>{const child=spawn(path.join(studio,process.platform==='win32'?'bambu-studio.exe':'bambu-studio'),args,{cwd:dir,windowsHide:true,stdio:['ignore',log.fd,log.fd]});const timer=setTimeout(()=>child.kill(),180000);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',c=>{clearTimeout(timer);resolve(c);});});await log.close();
 const result=JSON.parse(await fs.readFile(path.join(dir,'result.json'),'utf8').catch(()=>'{"error_string":"No result"}'));
 const sliced=path.join(dir,name+'.gcode.3mf'),archive=await fs.readFile(sliced).then(b=>unzipSync(b),()=>null);
 const plate=archive&&Object.keys(archive).find(k=>/\.gcode$/.test(k));
 const gcode=plate?strFromU8(archive[plate]):'';
 const entry={name,exitCode:code,returnCode:result.return_code,error:result.error_string,gcodeBytes:plate?archive[plate].length:0,layers:(gcode.match(/; CHANGE_LAYER/g)||[]).length,slicerPassed:code===0&&result.return_code===0&&gcode.length>1000,physicalVerified:false,profile:'Bambu Lab A2L 0.4 nozzle / 0.16mm High Quality / Bambu PLA Basic',supports:false,brim:false};
 report.push(entry);console.log(JSON.stringify(entry));await fs.writeFile(path.join(output,'reporte.json'),JSON.stringify(report,null,2));
}
if(!report.length||report.some(r=>!r.slicerPassed))process.exitCode=1;
