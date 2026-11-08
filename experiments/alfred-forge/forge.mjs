#!/usr/bin/env node
// Uses exactly the same local compiler and Responses client as the UI.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadEnv} from 'vite';
import {runForge} from '../../server/forge.js';
const dir=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(dir,'../..');
const env={...loadEnv('development',root,''),...loadEnv('development',dir,''),...process.env};
const argv=process.argv.slice(2),example=argv.includes('--example'),prompt=argv.filter(a=>a!=='--example').join(' ').trim();
if(!example&&!prompt){console.error('Uso: npm run forge:example  o  node experiments/alfred-forge/forge.mjs "Una pieza…"');process.exitCode=1;}
else try{
 const result=await runForge(example?{action:'example'}:{action:'generate',prompt},{env});
 const slug=(example?'arbol-vero-ale':prompt.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').slice(0,42)+'-'+Date.now());
 const output=path.join(dir,'output');await fs.mkdir(output,{recursive:true});
 for(const ext of ['stl','3mf'])await fs.writeFile(path.join(output,slug+'.'+ext),Buffer.from(result.files[ext],'base64'));
 await fs.writeFile(path.join(output,slug+'.scad'),result.scad);
 const {files,...manifest}=result;await fs.writeFile(path.join(output,slug+'.json'),JSON.stringify({...manifest,prompt:example?'Muestra sin IA':prompt},null,2));
 console.log('Listo: '+path.join(output,slug)+'.scad / .stl / .3mf / .json');if(result.precompiled)console.log('Se usó la muestra precompilada. Instalá OpenSCAD para crear piezas nuevas.');
}catch(e){console.error('Forge: '+e.message);process.exitCode=1;}
