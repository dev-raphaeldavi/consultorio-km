import {createClient} from '@supabase/supabase-js';
import {demoData,uuid,advance,receive,review,cloneData} from './domain.js';
export const configured=Boolean(__SUPABASE_URL__&&__SUPABASE_KEY__);
export const supabase=configured?createClient(__SUPABASE_URL__,__SUPABASE_KEY__):null;
let demo=false,user=null,db=null;
const tables=['profiles','patients','patient_access','services','budgets','budget_items','installments','payments','expenses','audit_logs'];
const key='km-demo-v2';
const persist=()=>localStorage.setItem(key,JSON.stringify(db));
const audit=(entity,record,action='Registro atualizado')=>db.audit_logs.unshift({id:uuid(),actor_id:user.id,action,entity,record_id:record,created_at:new Date().toISOString()});
export const current=()=>({demo,user});
export async function demoLogin(role){demo=true;try{db=JSON.parse(localStorage.getItem(key))||demoData();}catch{db=demoData();}user=db.profiles.find(p=>p.role===role);sessionStorage.setItem('km-demo-role',role);persist();return user;}
export async function restore(){const role=sessionStorage.getItem('km-demo-role');if(role)return demoLogin(role);if(supabase){const {data}=await supabase.auth.getSession();if(data.session)return loadProfile(data.session.user.id);}return null;}
async function loadProfile(id){const {data,error}=await supabase.from('profiles').select('*').eq('id',id).eq('active',true).single();if(error||!data){await supabase.auth.signOut();throw Error('Seu acesso ainda não está liberado. Fale com a administração.');}user=data;demo=false;sessionStorage.removeItem('km-demo-role');if(data.must_change_password&&location.hash!=='#/definir-senha')setTimeout(()=>{location.hash='#/definir-senha'},0);return user;}
export async function login(email,password){if(!supabase)throw Error('O acesso real será ativado após conectar o Supabase. Use a demonstração abaixo.');const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw Error('Não foi possível entrar. Confira seu e-mail e sua senha.');return loadProfile(data.user.id);}
export async function logout(){if(!demo&&supabase){const {error}=await supabase.auth.signOut();if(error)throw error;}user=null;demo=false;db=null;sessionStorage.removeItem('km-demo-role');}
export async function load(){if(!user)throw Error('Entre para continuar.');if(demo){db=JSON.parse(localStorage.getItem(key));const d=cloneData(db);if(user.role==='admin')return d;d.profiles=d.profiles.filter(p=>p.id===user.id);d.patients=d.patients.filter(p=>p.created_by===user.id||d.patient_access.some(a=>a.patient_id===p.id&&a.professional_id===user.id));d.budgets=d.budgets.filter(b=>b.professional_id===user.id);const ids=d.budgets.map(b=>b.id);d.budget_items=d.budget_items.filter(i=>ids.includes(i.budget_id));d.installments=d.installments.filter(i=>ids.includes(i.budget_id));d.payments=d.payments.filter(p=>d.installments.some(i=>i.id===p.installment_id));d.expenses=[];d.audit_logs=d.audit_logs.filter(a=>a.actor_id===user.id);return d;}
const {data:p,error:e}=await supabase.from('profiles').select('*').eq('id',user.id).eq('active',true).single();if(e||!p){user=null;throw Error('Acesso encerrado pela administração.');}user=p;
const out={};await Promise.all(tables.map(async table=>{out[table]=[];let offset=0;while(true){const {data,error}=await supabase.from(table).select('*').order(table==='patient_access'?'patient_id':'id').range(offset,offset+999);if(error)throw Error('Falha ao carregar '+table+'. Verifique a conexão e as permissões.');out[table].push(...data);if(data.length<1000)break;offset+=1000;}}));return out;}
export async function insert(table,values){if(demo){if(['expenses','services'].includes(table)&&user.role!=='admin')throw Error('Acesso negado.');const row={id:uuid(),...values,created_by:user.id,created_at:new Date().toISOString()};db[table].push(row);audit(table,row.id);persist();return row;}const {data,error}=await supabase.from(table).insert(values).select().single();if(error)throw Error('Não foi possível salvar. Verifique os campos e sua permissão.');return data;}
export async function rpc(name,args={}){if(!demo){const {data,error}=await supabase.rpc(name,args);if(error){if(error.message.includes('budget_items_tooth_check')&&(args.p_items||[]).some(i=>i.tooth>=51))throw Error('O banco ainda precisa da atualização para dentes decíduos. O orçamento não foi salvo; seus itens continuam nesta tela.');throw Error(error.message);}return data;}
if((args.p_id&&['advance_budget','review_budget','update_profile_admin'].includes(name))||args.p_budget){const id=args.p_id||args.p_budget;const b=db.budgets.find(x=>x.id===id);if(name!=='update_profile_admin'&&(!b||user.role!=='admin'&&b.professional_id!==user.id))throw Error('Acesso negado.');}
if(name==='save_budget'){const total=args.p_items.reduce((s,i)=>s+db.services.find(x=>x.id===i.service_id).amount_cents,0),target=args.p_professional||user.id;if(target!==user.id&&user.role!=='admin')throw Error('Acesso negado.');if(Number(args.p_professional_percent)+Number(args.p_clinic_percent)!==100)throw Error('As porcentagens devem somar 100%.');const b={id:uuid(),patient_id:args.p_patient,professional_id:target,status:'draft',accounting_status:'pending',professional_percent:Number(args.p_professional_percent),clinic_percent:Number(args.p_clinic_percent),total_cents:total,installment_count:args.p_count,first_due:args.p_due,created_at:new Date().toISOString()};db.budgets.push(b);for(const i of args.p_items){const s=db.services.find(x=>x.id===i.service_id);db.budget_items.push({id:uuid(),budget_id:b.id,...i,service_name:s.name,amount_cents:s.amount_cents});}audit('budgets',b.id);persist();return b.id;}
if(name==='advance_budget')advance(db,args.p_id,args.p_status);
if(name==='review_budget'){if(user.role!=='admin')throw Error('Acesso negado.');review(db,args.p_id,args.p_decision,Number(args.p_professional_percent),Number(args.p_clinic_percent),user.id,args.p_note);}
if(name==='record_payment')receive(db,args.p_budget,args.p_amount,args.p_method,args.p_date,user.id,args.p_request);
if(name==='void_payment'){if(user.role!=='admin')throw Error('Acesso negado.');const p=db.payments.find(p=>p.id===args.p_id);p.voided_at=new Date().toISOString();p.void_reason=args.p_reason;}
if(name==='update_profile_admin'){if(user.role!=='admin')throw Error('Acesso negado.');const p=db.profiles.find(p=>p.id===args.p_id);if(!p)throw Error('Perfil não encontrado.');p.full_name=args.p_full_name;p.active=args.p_active;}
if(name==='complete_password_change'){user.must_change_password=false;const p=db.profiles.find(p=>p.id===user.id);if(p)p.must_change_password=false;}
audit(name,args.p_id||args.p_budget||user.id);persist();}
export async function grantPatient(patient,professional){if(user.role!=='admin')throw Error('Acesso negado.');if(demo){if(!db.patient_access.some(a=>a.patient_id===patient&&a.professional_id===professional))db.patient_access.push({patient_id:patient,professional_id:professional});persist();return;}const {error}=await supabase.from('patient_access').upsert({patient_id:patient,professional_id:professional},{onConflict:'patient_id,professional_id',ignoreDuplicates:true});if(error)throw Error('Não foi possível liberar o paciente.');}
export async function manageUser(action,user_id){if(demo){if(user.role!=='admin')throw Error('Acesso negado.');const p=db.profiles.find(p=>p.id===user_id);if(action==='reset_password'&&p){p.must_change_password=true;audit('profiles',p.id,'RESET_PASSWORD');persist();return {success:true};}throw Error('Operação inválida.');}const {data,error}=await supabase.functions.invoke('invite-professional',{body:{action,user_id}});if(error||data?.error)throw Error(data?.error||'Não foi possível atualizar o acesso.');return data;}
export async function invite(){throw Error('Cadastros são criados pela administração do Supabase.');}
export async function changePassword(password){if(password.length<8)throw Error('Use pelo menos 8 caracteres.');if(demo){await rpc('complete_password_change');return;}const {error}=await supabase.auth.updateUser({password});if(error)throw Error('Não foi possível alterar a senha.');await rpc('complete_password_change');}
export async function resetDemo(){db=demoData();persist();}

export async function clinicalEntries(patientId){
 if(demo)return (db.clinical_entries||[]).filter(e=>e.patient_id===patientId).sort((a,b)=>a.created_at.localeCompare(b.created_at));
 const rows=[];for(let start=0;;start+=500){const {data,error}=await supabase.from('clinical_entries').select('*').eq('patient_id',patientId).order('created_at').order('id').range(start,start+499);if(error)throw Error('Não foi possível carregar o prontuário. Confira a conexão e a ativação do módulo.');rows.push(...data);if(data.length<500)return rows;}
}
export async function saveClinical(patientId,section,body,id){
 if(demo){if(!db.patients.some(p=>p.id===patientId&&(user.role==='admin'||p.created_by===user.id||db.patient_access.some(a=>a.patient_id===patientId&&a.professional_id===user.id))))throw Error('Acesso negado.');db.clinical_entries??=[];if(db.clinical_entries.some(e=>e.id===id))return id;db.clinical_entries.push({id,patient_id:patientId,section,body,author_id:user.id,author_name:user.full_name,created_at:new Date().toISOString()});audit('clinical_entries',id,'Registro no prontuário');persist();return id;}
 return rpc('append_clinical_entry',{p_patient:patientId,p_section:section,p_body:body,p_id:id});
}
export async function uploadClinical(patientId,file){
 if(!['image/jpeg','image/png','application/pdf'].includes(file.type)||file.size>10485760)throw Error('Use PDF, JPG ou PNG de até 10 MB.');
 if(demo){if(file.size>1048576)throw Error('Na demonstração, use arquivos de até 1 MB.');const url=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});return {name:file.name,type:file.type,size:file.size,demo_url:url};}
 const path=patientId+'/'+user.id+'/'+uuid()+'.'+({'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'}[file.type]);
 const {error}=await supabase.storage.from('clinical-documents').upload(path,file,{contentType:file.type,upsert:false});
 if(error)throw Error('Não foi possível enviar o anexo. Tente novamente.');return {path,name:file.name,type:file.type,size:file.size};
}
export async function clinicalFile(file){
 if(demo&&file.demo_url)return (await fetch(file.demo_url)).blob();
 const {data,error}=await supabase.storage.from('clinical-documents').download(file.path);if(error)throw Error('Não foi possível abrir o anexo '+file.name);return data;
}

