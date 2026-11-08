// Maintainer-only setup. Authenticate via `vercel link` + development OIDC first.
// Never expose this installer as an HTTP endpoint or feed user source into it.
import {Sandbox} from '@vercel/sandbox';
let sandbox;
try{
 sandbox=await Sandbox.create({image:'vercel/sandbox/node:24',persistent:false,resources:{vcpus:1},timeout:600000,networkPolicy:'allow-all'});
 const install=await sandbox.runCommand({cmd:'bash',args:['-lc','apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends openscad fonts-liberation fontconfig'],sudo:true,timeoutMs:300000});
 if(install.exitCode!==0)throw Error('No se pudo instalar OpenSCAD en la imagen.');
 const check=await sandbox.runCommand('/usr/bin/openscad',['--version']);if(check.exitCode!==0)throw Error('OpenSCAD no responde.');
 await sandbox.updateNetworkPolicy('deny-all');
 const snapshot=await sandbox.snapshot({expiration:30*24*3600*1000});
 console.log('Configurar FORGE_SANDBOX_SNAPSHOT_ID en Preview: '+snapshot.snapshotId);
 console.log('Renovar esta imagen antes de su fecha de expiración. No contiene datos ni credenciales.');
 sandbox=null; // snapshot() already stops the session.
}catch(e){console.error('No se pudo preparar la imagen de Forge. Verificá la autenticación y los permisos de Sandbox.');process.exitCode=1;}
finally{if(sandbox)await sandbox.stop();}
