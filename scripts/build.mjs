import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
let env = {};
try { env = Object.fromEntries(readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const p=l.indexOf('=');return [l.slice(0,p).trim(),l.slice(p+1).trim().replace(/^['"]|['"]$/g,'')]})); } catch {}
const publicKey=process.env.VITE_SUPABASE_ANON_KEY||env.VITE_SUPABASE_ANON_KEY||'';
if(publicKey.startsWith('sb_secret_'))throw Error('Use somente a chave pública do Supabase no frontend.');
if(publicKey.split('.').length===3){let claim;try{claim=JSON.parse(Buffer.from(publicKey.split('.')[1],'base64url').toString());}catch{throw Error('Chave pública inválida.');}if(claim.role!=='anon')throw Error('Somente JWT anon é permitido no frontend.');}
await build({entryPoints:['src/app.js'],bundle:true,format:'esm',outfile:'dist/app.js',minify:true,define:{'__SUPABASE_URL__':JSON.stringify(process.env.VITE_SUPABASE_URL||env.VITE_SUPABASE_URL||''),'__SUPABASE_KEY__':JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY||env.VITE_SUPABASE_ANON_KEY||'')}});
console.log('Build concluído. Supabase: '+(env.VITE_SUPABASE_URL||process.env.VITE_SUPABASE_URL?'configurado':'demonstração'));
