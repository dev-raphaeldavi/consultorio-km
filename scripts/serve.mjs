import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('dist');
http.createServer(async(req,res)=>{try{let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=resolve(root,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}const content=await readFile(file);res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png'})[extname(file)]||'application/octet-stream'}).end(content);}catch{res.writeHead(404).end('Não encontrado');}}).listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
