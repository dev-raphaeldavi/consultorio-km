import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {sections} from './clinical.js';
import {dentitions} from './odontogram.js';
import {createFullRecordPDF} from './record-pdf.js';
export async function createRecordPDF(options){
 const {patient,entries,data}=options,asset=options.asset|| (async p=>new Uint8Array(await (await fetch(p)).arrayBuffer()));
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),logo=await pdf.embedJpg(await asset('/assets/marca.jpg'));
 const ink=rgb(.2,.3,.35),accent=rgb(.65,.43,.29);let page,y;
 const clean=s=>Array.from(String(s||'—')).map(c=>{if(c==='\n')return c;try{font.encodeText(c);return c;}catch{return '?';}}).join('');
 const draw=(s,x,yy,size=9,b=false)=>page.drawText(clean(s),{x,y:yy,size,font:b?bold:font,color:ink});
 const wrap=(s,width,size=9)=>{let out=[],line='';for(const c of clean(s)){if(c==='\n'||font.widthOfTextAtSize(line+c,size)>width){out.push(line);line=c==='\n'?'':c;}else line+=c;}out.push(line);return out;};
 const block=(label,value,height)=>{draw(label,40,y,10,true);y-=14;const lines=wrap(value,515);const count=Math.max(1,Math.floor((height-20)/11));for(const t of lines.slice(0,count)) {draw(t,40,y);y-=11;}if(lines.length>count)draw('Continua no histórico integral anexado.',40,y,8);y-=16;};
 const start=n=>{page=pdf.addPage([595,842]);page.drawImage(logo,{x:40,y:769,width:100,height:100*logo.height/logo.width});draw('PRONTUÁRIO · RESUMO CLÍNICO',230,794,12,true);draw(patient.full_name,230,777,10);draw('Consultório Kamila Marinho · '+n+'/2',40,30,8);draw('Histórico integral e documentos no arquivo PDF anexo.',40,43,8);y=740;};
 const content=key=>{const cfg=sections.find(s=>s[0]===key),rows=entries.filter(e=>e.section===key),selected=['anamnesis','exam','diagnosis','plan'].includes(key)?rows.slice(-1):rows;return selected.map(e=>new Date(e.created_at).toLocaleDateString('pt-BR')+' · '+e.author_name+'\n'+cfg[2].filter(([k])=>e.body[k]).map(([k,l])=>l+': '+e.body[k]).join(' · ')).join('\n')||'Não registrado.';};
 start(1);
 const identity={...patient.registration,...entries.filter(e=>e.section==='identification').at(-1)?.body,full_name:patient.full_name,phone:patient.phone};
 const fields=sections[0][2].filter(([k])=>identity[k]);let rowHeight=0;
 fields.forEach(([k,label],i)=>{const col=i%3;if(col===0&&i){y-=rowHeight+12;rowHeight=0;}const x=40+col*174;draw(label,x,y,8,true);const lines=wrap(identity[k],160,9).slice(0,2);lines.forEach((t,j)=>draw(t,x,y-12-j*11));rowHeight=Math.max(rowHeight,12+lines.length*11);});y-=rowHeight+22;
 const available=Math.max(100,y-75);for(const key of ['anamnesis','exam','diagnosis'])block(sections.find(s=>s[0]===key)[1],content(key),available/3);
 start(2);const findings=entries.filter(e=>e.section==='odontogram'),last=findings.at(-1);if(last){const mode=last.body.dentition||(Number(last.body.tooth)>=51?'primary':'permanent'),img=await pdf.embedPng(await asset('/assets/odontogram-'+mode+'.png'));draw('Odontograma '+(mode==='primary'?'decíduo':'permanente'),40,y,11,true);y-=12;const h=img.height/img.width*360;page.drawImage(img,{x:115,y:y-h,width:360,height:h});const chart=dentitions[mode],scale=360/chart.width;page.drawRectangle({x:115,y:y-h,width:360,height:h-chart.height*scale,color:rgb(1,1,1)});for(const e of findings){const tooth=Number(e.body.tooth),upper=chart.upper.includes(tooth),idx=(upper?chart.upper:chart.lower).indexOf(tooth);if(idx<0)continue;const surface=e.body.surface||'all',cx=chart.centers[idx],fy=upper?chart.upperFace:chart.lowerFace;let x=cx-19,top=upper?chart.upperTop:chart.lowerTop,w=38,hh=(upper?chart.upperBottom:chart.lowerBottom)-top;if(surface!=='all'){top=fy-7;x=cx-7;w=14;hh=14;const inner=upper?'P':'L',mesialRight=[1,4,5,8].includes(Math.floor(tooth/10));if(surface==='V'||surface===inner){x=cx-18;w=36;hh=12;top=fy+((upper?surface==='V':surface===inner)?-19:7);}if(surface==='M'||surface==='D'){x=cx+((surface==='M')===mesialRight?7:-19);top=fy-18;w=12;hh=36;}}page.drawRectangle({x:115+x*scale,y:y-(top+hh)*scale,width:w*scale,height:hh*scale,color:accent,opacity:.35});}y-=chart.height*scale+10;}
 block('Achados por dente e face',content('odontogram'),95);
 const ids=data.budgets.filter(b=>b.patient_id===patient.id&&b.status!=='cancelled').map(b=>b.id),items=data.budget_items.filter(i=>ids.includes(i.budget_id)).map(i=>i.service_name+' · '+(i.tooth||'Geral')+' · '+(i.tooth_surface||'')).join('; ');
 const remaining=y-70;block('Plano de tratamento',content('plan')+'\n'+items,remaining*.34);block('Evolução clínica',content('evolution'),remaining*.33);block('Exames, consentimentos e documentos',['exams','consents','documents'].map(k=>content(k)).join('\n'),remaining*.33);
 await pdf.attach(await createFullRecordPDF(options),'historico-integral.pdf',{mimeType:'application/pdf',description:'Todos os registros, versões e documentos sem cortes.'});
 return pdf.save();
}
