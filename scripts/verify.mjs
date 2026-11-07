import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
function run(args){const r=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
run(['--test',...fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.js')).map(f=>'tests/'+f)]);
run(['node_modules/vite/bin/vite.js','build']);
const keyFile=path.join(root,'.env.local');let key='';
if(fs.existsSync(keyFile)){const match=fs.readFileSync(keyFile,'utf8').match(/^\s*OPENAI_API_KEY\s*=\s*(.+)$/m);key=match?.[1]?.trim().replace(/^["']|["']$/g,'')||'';}
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
for(const file of files(path.join(root,'dist'))){if(/(?:^|[\\/])\.env(?:\.|$)|recipient-private-key/i.test(file))throw Error('Se detectó un archivo privado en la salida pública.');const bytes=fs.readFileSync(file);if(key.length>25&&bytes.includes(Buffer.from(key)))throw Error('Se detectó una credencial en la salida pública. No publicar.');}
const git=spawnSync('git',['check-ignore','.env.local'],{cwd:root,encoding:'utf8'});if(git.status!==0)throw Error('.env.local debe estar ignorado antes de publicar.');
console.log('VERIFICACIÓN COMPLETA: pruebas, compilación y salida pública sin la clave local.');
