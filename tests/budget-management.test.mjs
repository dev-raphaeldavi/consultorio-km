import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('admin controla orçamentos e somente admin edita e exclui',async()=>{
 const db=new PGlite(),admin='10000000-0000-0000-0000-000000000001',pro='10000000-0000-0000-0000-000000000002',other='10000000-0000-0000-0000-000000000003';
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;");
 for(const name of ['001_initial','002_financial_approvals','004_odontogram_surfaces','005_primary_teeth','006_clinical_records','009_budget_findings','011_budget_management','012_admin_control','013_admin_budget_edit'])await db.exec(await readFile('supabase/migrations/'+name+'.sql','utf8'));
 await db.exec(`insert into auth.users values('${admin}'),('${pro}'),('${other}');insert into profiles(id,full_name,role) values('${admin}','Admin','admin'),('${pro}','Pro','professional'),('${other}','Outro','professional');`);
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows,actor=async id=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await actor(admin);const service=(await q("insert into services(name,amount_cents) values('Restauração',10000) returning id"))[0].id;
 await actor(pro);const patient=(await q("insert into patients(full_name) values('Paciente') returning id"))[0].id,finding=(await q("select append_clinical_entry($1,'odontogram',$2::jsonb,gen_random_uuid()) id",[patient,JSON.stringify({tooth:'16',surface:'M',findings:'Cárie'})]))[0].id,items=JSON.stringify([{service_id:service,tooth:16,tooth_surface:'M',clinical_entry_id:finding}]);
 const budget=(await q('select save_budget($1,$2::jsonb,1,current_date,60,40,null) id',[patient,items]))[0].id;
 await actor(admin);await q('select update_budget($1,$2::jsonb,2,current_date,55,45,null)',[budget,items]);assert.equal(Number((await q('select installment_count from budgets where id=$1',[budget]))[0].installment_count),2);
 await actor(other);await assert.rejects(q('select update_budget($1,$2::jsonb,1,current_date,50,50,null)',[budget,items]));
 await actor(pro);await q("select advance_budget($1,'approved')",[budget]);await assert.rejects(q('select update_budget($1,$2::jsonb,1,current_date,50,50,null)',[budget,items]));await assert.rejects(q("select manage_budget($1,'reopen')",[budget]));
 await actor(admin);await q("select manage_budget($1,'reopen')",[budget]);assert.equal((await q('select status from budgets where id=$1',[budget]))[0].status,'draft');await q('select update_budget($1,$2::jsonb,1,current_date,70,30,$3)',[budget,items,other]);assert.equal((await q('select professional_id from budgets where id=$1',[budget]))[0].professional_id,other);
 await q("select advance_budget($1,'approved')",[budget]);
 await q("select record_payment($1,5000,'pix',current_date,gen_random_uuid())",[budget]);
 await q('select update_budget($1,$2::jsonb,1,current_date,65,35,null)',[budget,items]);assert.equal(Number((await q('select sum(amount_cents) total from installments where budget_id=$1',[budget]))[0].total),10000);
 await actor(other);await assert.rejects(q("select manage_budget($1,'cancel')",[budget]));await assert.rejects(q('select admin_clinical($1,null,null)',[patient]));
 await actor(admin);await q("select manage_budget($1,'cancel')",[budget]);
 assert.equal(Number((await q('select count(*) n from payments where voided_at is null'))[0].n),0);
 await q('select admin_clinical($1,null,null)',[patient]);assert.ok((await q('select deleted_at from clinical_entries where id=$1',[finding]))[0].deleted_at);assert.equal((await q('select status from budgets where id=$1',[budget]))[0].status,'cancelled');
 await db.close();
});
