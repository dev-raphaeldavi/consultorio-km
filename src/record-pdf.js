import {drawChartMarks} from './pdf-chart-marks.js';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {sections} from './clinical.js';
import './patient-workflow.js';
import {dentitions} from './odontogram.js';
import {findingsOf} from './findings.js';
export {createRecordPDF} from './compact-record.js';
export async function createFullRecordPDF({patient,entries,data,demo=false,getFile,asset=async p=>new Uint8Array(await (await fetch(p)).arrayBuffer())}){
 const pdf=await PDFDocument.create();pdf.setTitle('Prontuário odontológico - '+patient.full_name);pdf.setAuthor('CONSULTÓRIO KAMILA MARINHO');
 const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),serif=await pdf.embedFont(StandardFonts.TimesRoman);
 const ink=rgb(.12,.22,.28),muted=rgb(.30,.37,.40),accent=rgb(.73,.52,.38),line=rgb(.88,.89,.88);
 const logo=await pdf.embedJpg(await asset('/assets/marca.jpg'));
 let page,y,pages=[];const clean=s=>Array.from(String(s??'')).map(c=>{try{regular.encodeText(c);return c;}catch{return '?';}}).join('');
 const text=(s,x,yy,size=10,font=regular,color=ink)=>page.drawText(clean(s),{x,y:yy,size,font,color});
 const newPage=()=>{page=pdf.addPage([595.28,841.89]);pages.push(page);text('CONSULTÓRIO',42,800,11,bold);text('KAMILA MARINHO',42,779,16,bold);text('PRONTUÁRIO ODONTOLÓGICO',280,790,10,bold);text(patient.full_name.slice(0,46),280,772,10);page.drawLine({start:{x:42,y:742},end:{x:553,y:742},thickness:1,color:accent});y=718;};
 const ensure=h=>{if(y-h<65)newPage();};
 const paragraph=(value,size=10,font=regular,color=ink)=>{
  const width=505;for(const raw of clean(value||'Não informado.').split('\n')){
   let current='';for(const word of raw.split(/\s+/)){let candidate=current?current+' '+word:word;if(font.widthOfTextAtSize(candidate,size)>width&&current){ensure(size+6);text(current,45,y,size,font,color);y-=size+6;current='';}
    if(font.widthOfTextAtSize(word,size)>width){for(const c of word){if(font.widthOfTextAtSize(current+c,size)>width){ensure(size+6);text(current,45,y,size,font,color);y-=size+6;current='';}current+=c;}}
    else current=current?current+' '+word:word;
   }ensure(size+6);text(current,45,y,size,font,color);y-=size+6;
  }y-=5;
 };
 const heading=s=>{ensure(64);y-=12;page.drawRectangle({x:42,y:y-8,width:511,height:29,color:rgb(.97,.94,.91)});text(s,51,y+1,13,bold);y-=31;};
 const field=(label,value)=>{ensure(42);paragraph(label,9,bold,accent);paragraph(value);};
 const record=e=>{paragraph(new Date(e.created_at).toLocaleString('pt-BR')+' | '+e.author_name,9,bold,muted);const cfg=sections.find(s=>s[0]===e.section);for(const [key,label] of cfg[2])if(e.body[key])field(label,e.body[key]);if(e.body.revision_note)field('Observação / correção',e.body.revision_note);if(e.body.file)field('Documento vinculado',e.body.file.name);};
 newPage();paragraph('Cuidado registrado, história preservada.',24,serif);paragraph(demo?'DEMONSTRAÇÃO - DADOS FICTÍCIOS':'Cópia do prontuário do paciente',11,bold,accent);field('Paciente',patient.full_name);field('Telefone',patient.phone);field('Identificador',patient.id);paragraph('Emitido em '+new Date().toLocaleString('pt-BR')+'. Registros disponíveis para o acesso que emitiu esta cópia.',9,regular,muted);
 for(const [key,label,fields] of sections){
  heading(label);const rows=entries.filter(e=>e.section===key);
  if(['identification','anamnesis','exam','diagnosis','plan'].includes(key)){if(rows.length)record(rows.at(-1));else paragraph('Ainda não registrado.');}
  else {if(rows.length)for(const e of rows)record(e);else paragraph('Ainda não registrado.');}
  if(key==='odontogram'){
   const activeRows=findingsOf(entries);for(const mode of (activeRows.length?[activeRows.at(-1).body.dentition||(Number(activeRows.at(-1).body.tooth)>=51?'primary':'permanent')]:[])){newPage();heading(mode==='permanent'?'Odontograma permanente':'Odontograma decíduo');const img=await pdf.embedPng(await asset('/assets/odontogram-'+mode+'.png'));const h=img.height/img.width*505;const top=y,chart=dentitions[mode],scale=505/chart.width,visibleHeight=chart.height*scale;page.drawImage(img,{x:45,y:top-h,width:505,height:h});page.drawRectangle({x:45,y:top-h-1,width:505,height:h-visibleHeight+1,color:rgb(1,1,1)});drawChartMarks(page,chart,activeRows,45,top,scale);y-=visibleHeight+18;paragraph('Achados clínicos e faces estão descritos nos registros do odontograma. Procedimentos orçados são apresentados no plano de tratamento.',9,regular,muted);}
  }
  if(key==='plan'){
   const budgets=data.budgets.filter(b=>b.patient_id===patient.id);if(budgets.length){heading('Procedimentos dos orçamentos');for(const b of budgets){paragraph('Orçamento '+b.id.slice(0,8)+' | '+({draft:'Orçado',approved:'Fechado',performed:'Realizado',cancelled:'Cancelado'}[b.status]||b.status),10,bold);for(const item of data.budget_items.filter(i=>i.budget_id===b.id))paragraph(item.service_name+' | '+(item.tooth?'Dente '+item.tooth:'Geral')+' | Face: '+(item.tooth_surface||'não informada'));}}
  }
 }
 heading('Histórico de versões');paragraph('Os registros anteriores permanecem preservados. A data abaixo corresponde à inclusão no sistema.',9,regular,muted);
 for(const [key,label] of sections){const rows=entries.filter(e=>e.section===key);if(['identification','anamnesis','exam','diagnosis','plan'].includes(key)&&rows.length>1){heading(label+' - versões anteriores');for(const e of rows.slice(0,-1))record(e);}}
 for(const e of entries)paragraph(new Date(e.created_at).toLocaleString('pt-BR')+' | '+sections.find(s=>s[0]===e.section)[1]+' | '+e.author_name+' | '+e.id,8,regular,muted);
 for(const e of entries.filter(e=>e.body.file)){
  const file=e.body.file,blob=await getFile(file),bytes=new Uint8Array(await blob.arrayBuffer());
  await pdf.attach(bytes,e.id+'-'+file.name,{mimeType:file.type,description:file.name});
  newPage();heading('Anexo: '+sections.find(s=>s[0]===e.section)[1]);paragraph(file.name,12,bold);paragraph(new Date(e.created_at).toLocaleString('pt-BR')+' | '+e.author_name,9);
  if(file.type.startsWith('image/')){const img=file.type==='image/png'?await pdf.embedPng(bytes):await pdf.embedJpg(bytes),scale=Math.min(505/img.width,(y-90)/img.height);page.drawImage(img,{x:45,y:y-img.height*scale,width:img.width*scale,height:img.height*scale});}
  else {paragraph('Original incluído como arquivo anexo neste PDF. As páginas a seguir reproduzem o documento.');let source;try{source=await PDFDocument.load(bytes);}catch{throw Error('O anexo '+file.name+' está protegido ou inválido. Gere uma cópia PDF sem senha para incluí-lo.');}for(const p of await pdf.copyPages(source,source.getPageIndices()))pdf.addPage(p);}
 }
 const all=pdf.getPages();for(const p of pages){const n=all.indexOf(p)+1;p.drawLine({start:{x:42,y:51},end:{x:553,y:51},thickness:.5,color:line});p.drawText('CONSULTÓRIO KAMILA MARINHO | Dra. Kamila Marinho | CRO-PE 16029',{x:42,y:37,size:8,font:regular,color:muted});p.drawText('Av. Inocêncio Lima, 515 - Sala 201 - Custódia/PE',{x:42,y:25,size:8,font:regular,color:muted});p.drawText(n+' / '+all.length,{x:515,y:32,size:9,font:regular,color:muted});}
 return pdf.save();
}

