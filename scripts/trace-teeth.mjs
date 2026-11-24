import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dentitions} from '../src/odontogram.js';
const require=createRequire(import.meta.url),UPNG=createRequire(require.resolve('pdf-lib'))('@pdf-lib/upng').default;
const paths={};
for(const [mode,chart] of Object.entries(dentitions)){
 const bytes=await readFile('dist/assets/odontogram-'+mode+'.png');
 const png=UPNG.decode(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),pixels=new Uint8Array(UPNG.toRGBA8(png)[0]),ratio=png.width/chart.width;
 for(const [row,teeth] of [['upper',chart.upper],['lower',chart.lower]])for(const [i,tooth] of teeth.entries()){
  let path='';const left=Math.floor((chart.centers[i]-22)*ratio),right=Math.ceil((chart.centers[i]+22)*ratio),top=Math.floor((chart[row+'Top']-2)*ratio),bottom=Math.ceil((chart[row+'Bottom']+2)*ratio);
  const marked=(x,y)=>{const p=(y*png.width+x)*4;return pixels[p+3]>0&&Math.min(pixels[p],pixels[p+1],pixels[p+2])<242;};
  for(let y=top;y<bottom;y++)for(let x=left;x<right;){if(!marked(x,y)){x++;continue;}const start=x;while(x<right&&marked(x,y))x++;const a=start/ratio,b=y/ratio,w=(x-start)/ratio,h=1/ratio;path+=`M${a.toFixed(2)} ${b.toFixed(2)}h${w.toFixed(2)}v${h.toFixed(2)}h-${w.toFixed(2)}z`;}
  paths[tooth]=path;
 }
}
await writeFile('src/tooth-contours.json',JSON.stringify(paths));
console.log('Contornos extraídos para '+Object.keys(paths).length+' dentes.');
