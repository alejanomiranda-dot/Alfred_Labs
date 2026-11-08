import {loadEnv} from 'vite';
import {forgeStatus} from '../server/forge.js';
const env={...loadEnv('development',process.cwd(),''),...process.env};
console.log('Alfred Forge — diagnóstico local (sin mostrar secretos)');
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||(major===22&&minor<12)){console.error('Instalá Node.js 22.12 o posterior.');process.exitCode=1;}
try{const status=await forgeStatus(env);
 console.log('Node.js: '+process.versions.node);
 console.log('OpenSCAD: '+(status.compiler?'listo':'no encontrado; la muestra precompilada sigue disponible'));
 console.log('OpenAI: '+(status.ai?'clave configurada (sin probar conexión ni saldo)':'sin clave; muestra y recompilación sin IA disponibles'));
 console.log('Límites del compilador: tiempo y salida'+(status.osLimits?', también CPU/RAM/tamaño por prlimit si está disponible':'; CPU/RAM no aisladas en este sistema'));
 console.log('Abrí http://127.0.0.1:5173 después de npm run dev.');
}catch(e){console.error(e.message);process.exitCode=1;}
