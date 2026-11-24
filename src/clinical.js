import {uuid,today} from './domain.js';
import {findingsOf,markFindings} from './findings.js';
import {referenceChart} from './odontogram.js';
export const sections=[
 ['identification','Identificação',[['birth','Data de nascimento','date'],['document','CPF / documento'],['address','Endereço'],['email','E-mail'],['guardian','Responsável e vínculo'],['emergency','Contato de emergência']]],
 ['anamnesis','Anamnese',[['complaint','Queixa principal'],['history','História da queixa e tratamentos anteriores'],['allergies','Alergias'],['medicines','Medicamentos em uso'],['conditions','Doenças, cirurgias e acompanhamento médico'],['bleeding','Sangramentos e reações à anestesia'],['pregnancy','Gestação / amamentação'],['habits','Hábitos, higiene e outras observações']]],
 ['exam','Exame clínico',[['extraoral','Exame extraoral'],['intraoral','Exame intraoral / mucosas'],['periodontal','Avaliação periodontal'],['occlusion','Oclusão / ATM'],['vitals','Sinais vitais e demais achados']]],
 ['odontogram','Odontograma',[['tooth','Dente FDI (opcional)'],['surface','Face(s)'],['findings','Achados e condições observadas']]],
 ['diagnosis','Diagnóstico',[['diagnosis','Diagnóstico / hipótese diagnóstica'],['code','Código (opcional)'],['basis','Fundamentação e exames relacionados']]],
 ['plan','Plano de tratamento',[['objectives','Objetivos'],['steps','Procedimentos, sequência e dentes'],['alternatives','Alternativas discutidas'],['instructions','Orientações e acompanhamento']]],
 ['evolution','Evolução clínica',[['date','Data do atendimento','date'],['procedure','Procedimento e dentes envolvidos'],['findings','Evolução e intercorrências'],['materials','Materiais / anestésicos'],['instructions','Orientações e próximo retorno']]],
 ['exams','Exames e imagens',[['date','Data do exame','date'],['description','Descrição / tipo do exame'],['findings','Laudo / interpretação registrada']]],
 ['consents','Consentimentos',[['title','Procedimento / termo'],['status','Situação: pendente, assinado ou recusado'],['date','Data','date'],['signer','Paciente / responsável signatário'],['notes','Informações prestadas e observações']]],
 ['documents','Documentação complementar',[['title','Título / tipo do documento'],['date','Data','date'],['notes','Observações']]]
];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>new Date(s).toLocaleString('pt-BR');
export function recordsList(data){return '<div class="page-title"><div><h1>Prontuários dos pacientes</h1><p>Identificação, registros clínicos, documentos e histórico.</p></div></div><label>Buscar paciente<input id="record-search" placeholder="Nome do paciente" oninput="this.closest(\'.dashboard\').querySelectorAll(\'[data-record-name]\').forEach(row=>row.hidden=!row.dataset.recordName.includes(this.value.toLocaleLowerCase(\'pt-BR\')))"></label><section class="panel">'+data.patients.map(p=>'<div class="list-row" data-record-name="'+escape(p.full_name.toLocaleLowerCase('pt-BR'))+'"><div><strong>'+escape(p.full_name)+'</strong><small>'+escape(p.phone)+'</small></div><button class="button outline" data-action="clinical-open" data-id="'+p.id+'">Abrir prontuário</button></div>').join('')+(data.patients.length?'':'<p class="empty">Cadastre um paciente para iniciar o prontuário.</p>')+'</section>';}
export function installClinical({api,getData,dialog,toast,refresh}){
 let selection={};let mode='permanent';let patient,entries=[],section='identification',pendingFile=null,requestId=null;
 const modal=document.querySelector('#modal');
 modal.addEventListener('click',e=>{if(!modal.classList.contains('clinical-modal'))return;const b=e.target.closest('[data-action="tooth"],[data-action="tooth-face"]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();const t=b.dataset.tooth,face=b.dataset.surface||'all';selection[t]??=[];if(selection[t].includes(face))selection[t]=selection[t].filter(f=>f!==face);else {selection[t]=selection[t].filter(f=>f!=='all');if(face==='all')selection[t]=[];selection[t].push(face);}if(!selection[t].length)delete selection[t];modal.querySelector('[name="tooth"]').value=Object.keys(selection).join(', ');modal.querySelector('[name="surface"]').value=Object.entries(selection).map(([t,f])=>t+': '+f.join(', ')).join(' | ');markFindings(modal,findingsOf(entries),selection);},true);
 const render=()=>{
  const config=sections.find(s=>s[0]===section),history=entries.filter(e=>e.section===section),append=['evolution','odontogram','exams','consents','documents'].includes(section),latest=history.at(-1)?.body||{};
  dialog('Prontuário do paciente','<div class="clinical-heading"><div><h3>'+escape(patient.full_name)+'</h3><p>'+escape(patient.phone||'Telefone não informado')+'</p></div><button type="button" class="button primary" data-clinical="pdf">Baixar prontuário PDF</button></div><nav class="clinical-tabs">'+sections.map(([id,title])=>'<button type="button" data-clinical="section" data-section="'+id+'" aria-pressed="'+(section===id)+'">'+title+'</button>').join('')+'<button type="button" data-clinical="history">Histórico completo</button></nav><div id="clinical-work"><h3>'+config[1]+'</h3>'+(section==='odontogram'?'<div class="clinical-chart">'+'<button type="button" data-clinical="mode" data-mode="permanent">Permanentes</button><button type="button" data-clinical="mode" data-mode="primary">Decíduos</button>'+referenceChart(mode)+'</div><p class="note">Registre abaixo os achados por dente e face. Procedimentos dos orçamentos aparecem no PDF como planejamento.</p>':'')+'<form id="clinical-form"><div class="clinical-fields">'+config[2].map(([key,label,type])=>'<label>'+label+(type?'<input name="'+key+'" type="'+type+'" value="'+escape(append?(type==='date'?today():''):(latest[key]||''))+'">':'<textarea name="'+key+'" rows="3" maxlength="12000">'+escape(append?'':latest[key]||'')+'</textarea>')+'</label>').join('')+'</div><label>Observação desta versão / motivo da correção<textarea name="revision_note" rows="2" maxlength="2000"></textarea></label>'+(['exams','consents','documents'].includes(section)?'<label>Anexar PDF, JPG ou PNG (até 10 MB)<input id="clinical-upload" type="file" accept="application/pdf,image/jpeg,image/png"></label>':'')+'<p class="form-error" role="alert"></p><div class="form-actions"><button class="button primary">Salvar registro no histórico</button></div></form><h3 class="clinical-history-title">Registros anteriores nesta seção</h3>'+historyHtml(history)+'</div>',true);
  modal.classList.add('clinical-modal');modal.scrollTop=0;pendingFile=null;requestId=uuid();if(section==='odontogram'){selection={};modal.querySelector('[name="tooth"]').readOnly=true;modal.querySelector('[name="surface"]').readOnly=true;markFindings(modal,findingsOf(entries));}
  const f=modal.querySelector('#clinical-form');f.onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{
   const body=Object.fromEntries(new FormData(f));if(!config[2].some(([k,,t])=>t!=='date'&&body[k]?.trim()))throw Error('Preencha ao menos um campo clínico antes de salvar.');
   if(section!=='odontogram'&&body.tooth&&!/^(?:[1-4][1-8]|[5-8][1-5])$/.test(body.tooth.trim()))throw Error('Informe um número FDI válido.');
   const upload=modal.querySelector('#clinical-upload')?.files[0];if(upload&&!pendingFile)pendingFile=await api.uploadClinical(patient.id,upload);if(pendingFile)body.file=pendingFile;
   if(section==='odontogram'){if(!Object.keys(selection).length||!body.findings.trim())throw Error('Selecione dentes e faces e descreva o achado.');for(const [tooth,faces] of Object.entries(selection))await api.saveClinical(patient.id,section,{...body,tooth,surface:faces.join(','),dentition:Number(tooth)>=51?'primary':'permanent'},requestId.slice(0,-2)+tooth);}else await api.saveClinical(patient.id,section,body,requestId);entries=await api.clinicalEntries(patient.id);const savedOdontogram=section==='odontogram';if(savedOdontogram)section='identification';render();toast(savedOdontogram?'Odontograma salvo. Você continua dentro do prontuário.':'Registro preservado no histórico do paciente.');
  }catch(err){f.querySelector('.form-error').textContent=err.message;}finally{button.disabled=false;}};
  modal.querySelector('#clinical-upload')?.addEventListener('change',()=>{pendingFile=null;requestId=uuid();});
 };
 const historyHtml=rows=>rows.length?rows.slice().reverse().map(e=>'<article class="clinical-entry"><header><strong>'+escape(sections.find(s=>s[0]===e.section)?.[1])+'</strong><span>'+date(e.created_at)+' · '+escape(e.author_name)+'</span></header>'+Object.entries(e.body).filter(([k,v])=>k!=='file'&&v).map(([k,v])=>'<p><strong>'+escape(sections.find(s=>s[0]===e.section)?.[2].find(f=>f[0]===k)?.[1]||(k==='revision_note'?'Observação da versão':k))+'</strong><br>'+escape(v).replace(/\n/g,'<br>')+'</p>').join('')+(e.body.file?'<button type="button" class="button outline" data-clinical="file" data-id="'+e.id+'">Abrir '+escape(e.body.file.name)+'</button>':'')+'</article>').join(''):'<p class="note">Nenhum registro nesta seção.</p>';
 document.addEventListener('click',async e=>{
  const open=e.target.closest('[data-action="clinical-open"]'),b=e.target.closest('[data-clinical]');
  if(!open&&!b)return;e.preventDefault();e.stopImmediatePropagation();
  if((open||b).disabled)return;(open||b).disabled=true;
  try{
   if(open){patient=getData().patients.find(p=>p.id===open.dataset.id);section=open.dataset.section||'identification';entries=await api.clinicalEntries(patient.id);render();return;}
   if(b.dataset.clinical==='mode'){mode=b.dataset.mode;const chart=modal.querySelector('.clinical-chart');chart.querySelector('.reference-scroll').outerHTML=referenceChart(mode);markFindings(modal,findingsOf(entries),selection);return;}if(b.dataset.clinical==='section'){section=b.dataset.section;render();}
   if(b.dataset.clinical==='history'){modal.querySelector('#clinical-work').innerHTML='<h3>Histórico completo do paciente</h3>'+historyHtml(entries);}
   if(b.dataset.clinical==='file'){const file=entries.find(e=>e.id===b.dataset.id).body.file;const blob=await api.clinicalFile(file);download(blob,file.name);}
   if(b.dataset.clinical==='pdf'){
    b.textContent='Preparando PDF…';entries=await api.clinicalEntries(patient.id);
    const {createRecordPDF}=await import('./record-pdf.js');
    const bytes=await createRecordPDF({patient,entries,data:getData(),demo:api.current().demo,getFile:api.clinicalFile});
    download(new Blob([bytes],{type:'application/pdf'}),'Prontuario-'+patient.full_name.replace(/[^a-zA-Z0-9À-ÿ -]/g,'').replace(/ /g,'-')+'.pdf');b.textContent='Baixar prontuário PDF';
   }
  }catch(err){toast(err.message);if(b?.dataset.clinical==='pdf')b.textContent='Baixar prontuário PDF';}finally{(open||b).disabled=false;}
 },true);
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}

