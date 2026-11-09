// Maintainer-only setup. Authenticate via `vercel link` + development OIDC first.
// Never expose this installer as an HTTP endpoint or feed user source into it.
import {Sandbox} from '@vercel/sandbox';
import fs from 'node:fs/promises';
let sandbox;
try{
 const appimage=process.env.OPENSCAD_APPIMAGE||'OpenSCAD-2026.11.06-x86_64.AppImage';
 if(!/^OpenSCAD-[\d.]+-x86_64\.AppImage$/.test(appimage))throw Error('Nombre de AppImage inválido.');
 console.log('Creando una máquina temporal para preparar OpenSCAD…');
 const base=process.env.FORGE_BASE_SNAPSHOT_ID;
 if(base&&!/^snap_[a-zA-Z0-9]+$/.test(base))throw Error('Identificador de imagen base inválido.');
 sandbox=await Sandbox.create({...(base?{source:{type:'snapshot',snapshotId:base}}:{image:'vercel/sandbox/node:24'}),persistent:false,resources:{vcpus:1},timeout:600000,networkPolicy:'allow-all'});
 if(!base){
 console.log('Instalando dependencias por HTTPS e IPv4…');
 const install=await sandbox.runCommand({cmd:'bash',args:['-lc',`set -e; sed -i 's|http://|https://|g' /etc/apt/sources.list.d/ubuntu.sources; apt-get -o Acquire::ForceIPv4=true -o APT::Update::Error-Mode=any update -qq; DEBIAN_FRONTEND=noninteractive apt-get -o Acquire::ForceIPv4=true install -y -qq --no-install-recommends openscad fonts-liberation fontconfig`],sudo:true,timeoutMs:300000});
 if(install.exitCode!==0)throw Error('No se pudo instalar OpenSCAD en la imagen: '+((await install.stderr())+(await install.stdout())).slice(-2000));
 }
 // OpenSCAD reciente con motor Manifold (compila en segundos). Se verifica la suma publicada por openscad.org.
 console.log('Descargando y verificando '+appimage+'…');
 const download=await sandbox.runCommand('node',['--input-type=module','-e',`import fs from 'node:fs/promises';import {createHash} from 'node:crypto';const url='https://files.openscad.org/snapshots/${appimage}';const [image,sum]=await Promise.all([fetch(url,{signal:AbortSignal.timeout(120000)}),fetch(url+'.sha256',{signal:AbortSignal.timeout(30000)})]);if(!image.ok||!sum.ok)throw Error('No se pudo descargar la imagen o su suma oficial.');const bytes=Buffer.from(await image.arrayBuffer()),expected=(await sum.text()).trim().split(/\\s+/)[0];if(!/^[a-f0-9]{64}$/i.test(expected)||createHash('sha256').update(bytes).digest('hex')!==expected.toLowerCase())throw Error('La suma SHA-256 no coincide.');await fs.writeFile('/tmp/openscad.AppImage',bytes,{mode:0o755});`]);
 if(download.exitCode!==0)throw Error('Falló la descarga verificada: '+(await download.stderr()).slice(-600));
 const nightly=await sandbox.runCommand({cmd:'bash',args:['-lc','set -e; cd /tmp; ./openscad.AppImage --appimage-extract >/dev/null; rm -rf /opt/openscad; mv squashfs-root /opt/openscad; rm openscad.AppImage'],sudo:true,timeoutMs:300000});
 if(nightly.exitCode!==0)throw Error('No se pudo instalar OpenSCAD reciente: '+((await nightly.stderr())+(await nightly.stdout())).slice(-400));
 for(const bin of ['/opt/openscad/AppRun','/usr/bin/openscad']){const check=await sandbox.runCommand(bin,['--version']);if(check.exitCode!==0)throw Error('OpenSCAD no responde: '+bin);}
 const help=await sandbox.runCommand('/opt/openscad/AppRun',['--help']);if(!/manifold/i.test((await help.stdout())+(await help.stderr())))throw Error('El OpenSCAD instalado no tiene el motor Manifold.');
 await sandbox.updateNetworkPolicy('deny-all');
 console.log('Compilando la muestra con el worker real y sin acceso a la red…');
 await sandbox.mkDir('/vercel/sandbox/forge');
 await sandbox.writeFiles([
  {path:'/vercel/sandbox/forge/piece.scad',content:await fs.readFile(new URL('../experiments/alfred-forge/examples/arbol-vero-ale.scad',import.meta.url))},
  {path:'/vercel/sandbox/forge/worker.mjs',content:await fs.readFile(new URL('../server/forge-worker.mjs',import.meta.url))}
 ]);
 const smoke=await sandbox.runCommand('node',['/vercel/sandbox/forge/worker.mjs']);
 const report=JSON.parse((await sandbox.readFileToBuffer({path:'/vercel/sandbox/forge/result.json'}))?.toString()||'null');
 if(smoke.exitCode!==0||!report?.ok||!report.files?.stl||report.compiler?.backend!=='manifold')throw Error('Falló la compilación aislada con Manifold: '+JSON.stringify(report));
 console.log('Muestra compilada: '+report.files.stl+' bytes de STL. Guardando imagen…');
 await sandbox.runCommand('node',['-e',"require('node:fs').rmSync('/vercel/sandbox/forge',{recursive:true,force:true})"]);
 const snapshot=await sandbox.snapshot({expiration:30*24*3600*1000});
 console.log('Configurar FORGE_SANDBOX_SNAPSHOT_ID en Preview: '+snapshot.snapshotId);
 console.log('Renovar esta imagen antes de su fecha de expiración. No contiene datos ni credenciales.');
 sandbox=null; // snapshot() already stops the session.
}catch(e){console.error('No se pudo preparar la imagen de Forge. Motivo: '+String(e?.message||e).replace(/(token|bearer)[^\s]*/gi,'[oculto]').slice(0,2400));process.exitCode=1;}
finally{if(sandbox)await sandbox.stop();}
