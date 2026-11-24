import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('prontuário: histórico imutável, autoria, isolamento e idempotência',async()=>{
 const db=new PGlite(),admin='10000000-0000-0000-0000-000000000001',pro='10000000-0000-0000-0000-000000000002',other='10000000-0000-0000-0000-000000000003';
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;");
 for(const f of ['001_initial','006_clinical_records'])await db.exec(await readFile('supabase/migrations/'+f+'.sql','utf8'));
 await db.exec("insert into auth.users values('"+admin+"'),('"+pro+"'),('"+other+"');insert into profiles(id,full_name,role) values('"+admin+"','Admin','admin'),('"+pro+"','Profissional','professional'),('"+other+"','Outro','professional');");
 const q=async(s,p=[])=> (await db.query(s,p)).rows;
 const actor=async id=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await actor(pro);const pat=(await q("insert into patients(full_name) values('Paciente teste') returning id"))[0].id;
 const id='20000000-0000-0000-0000-000000000001',body={diagnosis:'Registro original'};
 const save=(id2=id,b=body)=>q("select append_clinical_entry($1,'diagnosis',$2::jsonb,$3)",[pat,JSON.stringify(b),id2]);
 await save();await save();assert.equal((await q('select * from clinical_entries')).length,1);assert.equal((await q('select * from clinical_entries'))[0].author_name,'Profissional');
 await assert.rejects(save(id,{diagnosis:'Sobrescrever'}));await assert.rejects(q("update clinical_entries set body='{}'"));await assert.rejects(q('delete from clinical_entries'));
 await actor(other);assert.equal((await q('select * from clinical_entries')).length,0);await assert.rejects(save('20000000-0000-0000-0000-000000000002'));
 await actor(admin);await save('20000000-0000-0000-0000-000000000002',{diagnosis:'Correção',revision_note:'Reavaliado'});assert.equal((await q('select * from clinical_entries')).length,2);assert.equal((await q("select * from audit_logs where entity='clinical_entries'")).length,2);
 await db.exec('reset role;set role anon');await assert.rejects(q('select * from clinical_entries'));await db.close();
});

