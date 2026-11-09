// Maintainer-only setup. Authenticate via `vercel link` + development OIDC first.
// Never expose this installer as an HTTP endpoint or feed user source into it.
import {Sandbox} from '@vercel/sandbox';
let sandbox;
try{
 sandbox=await Sandbox.create({image:'vercel/sandbox/node:24',persistent:false,resources:{vcpus:1},timeout:600000,networkPolicy:'allow-all'});
 const install=await sandbox.runCommand({cmd:'bash',args:['-lc','apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends openscad fonts-liberation fontconfig'],sudo:true,timeoutMs:300000});
 if(install.exitCode!==0)throw Error('No se pudo instalar OpenSCAD en la imagen: '+((await install.stderr())+(await install.stdout())).slice(-400));
 // OpenSCAD reciente con motor Manifold (compila en segundos). Se verifica la suma publicada por openscad.org.
 const appimage=process.env.OPENSCAD_APPIMAGE||'OpenSCAD-2026.11.06-x86_64.AppImage';
 const nightly=await sandbox.runCommand({cmd:'bash',args:['-lc',`set -e; cd /tmp; curl -fsSLo openscad.AppImage https://files.openscad.org/snapshots/${appimage}; curl -fsSL https://files.openscad.org/snapshots/${appimage}.sha256 | awk '{print $1"  openscad.AppImage"}' | sha256sum -c -; chmod +x openscad.AppImage; ./openscad.AppImage --appimage-extract >/dev/null; rm -rf /opt/openscad; mv squashfs-root /opt/openscad; rm openscad.AppImage`],sudo:true,timeoutMs:300000});
 if(nightly.exitCode!==0)throw Error('No se pudo instalar OpenSCAD reciente: '+((await nightly.stderr())+(await nightly.stdout())).slice(-400));
 for(const bin of ['/opt/openscad/AppRun','/usr/bin/openscad']){const check=await sandbox.runCommand(bin,['--version']);if(check.exitCode!==0)throw Error('OpenSCAD no responde: '+bin);}
 const help=await sandbox.runCommand('/opt/openscad/AppRun',['--help']);if(!/manifold/i.test((await help.stdout())+(await help.stderr())))throw Error('El OpenSCAD instalado no tiene el motor Manifold.');
 await sandbox.updateNetworkPolicy('deny-all');
 const snapshot=await sandbox.snapshot({expiration:30*24*3600*1000});
 console.log('Configurar FORGE_SANDBOX_SNAPSHOT_ID en Preview: '+snapshot.snapshotId);
 console.log('Renovar esta imagen antes de su fecha de expiración. No contiene datos ni credenciales.');
 sandbox=null; // snapshot() already stops the session.
}catch(e){console.error('No se pudo preparar la imagen de Forge. Verificá la autenticación y los permisos de Sandbox. Motivo: '+String(e?.message||e).replace(/(token|bearer)[^\s]*/gi,'[oculto]').slice(0,300));process.exitCode=1;}
finally{if(sandbox)await sandbox.stop();}
