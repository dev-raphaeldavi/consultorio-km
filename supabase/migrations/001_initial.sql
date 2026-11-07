-- Consultório KM. Executar uma vez em um projeto Supabase novo.
begin;
create table public.profiles (
 id uuid primary key references auth.users(id), full_name text not null,
 role text not null check(role in ('admin','professional')), active boolean not null default true,
 created_at timestamptz not null default now()
);
create function public.is_admin() returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from profiles where id=auth.uid() and role='admin' and active) $$;
create function public.is_active() returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from profiles where id=auth.uid() and active) $$;
create table public.patients (
 id uuid primary key default gen_random_uuid(), full_name text not null check(length(trim(full_name))>1),
 phone text not null default '', created_by uuid not null references profiles(id) default auth.uid(),
 created_at timestamptz not null default now()
);
create table public.patient_access (
 patient_id uuid references patients(id), professional_id uuid references profiles(id),
 primary key(patient_id,professional_id)
);
create function public.can_read_patient(p_id uuid) returns boolean language sql stable security definer set search_path=public
as $$ select is_active() and (is_admin() or exists(select 1 from patients where id=p_id and created_by=auth.uid()) or exists(select 1 from patient_access where patient_id=p_id and professional_id=auth.uid())) $$;
create table public.services (
 id uuid primary key default gen_random_uuid(), name text not null, amount_cents bigint not null check(amount_cents>0 and amount_cents<100000000), active boolean not null default true
);
create table public.budgets (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references patients(id),
 professional_id uuid not null references profiles(id), status text not null default 'draft' check(status in ('draft','approved','performed','cancelled')),
 total_cents bigint not null check(total_cents>0), installment_count int not null check(installment_count between 1 and 24),
 first_due date not null, created_at timestamptz not null default now(), performed_at timestamptz
);
create table public.budget_items (
 id uuid primary key default gen_random_uuid(), budget_id uuid not null references budgets(id),
 service_id uuid not null references services(id), service_name text not null,
 tooth int check(tooth is null or (tooth/10 between 1 and 4 and tooth%10 between 1 and 8)), amount_cents bigint not null check(amount_cents>0)
);
create table public.installments (
 id uuid primary key default gen_random_uuid(), budget_id uuid not null references budgets(id),
 number int not null, due_date date not null, amount_cents bigint not null check(amount_cents>0), unique(budget_id,number)
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), installment_id uuid not null references installments(id),
 amount_cents bigint not null check(amount_cents>0), method text not null check(method in ('pix','cash','card','transfer')),
 paid_on date not null default current_date, recorded_by uuid not null references profiles(id),
 request_id uuid not null, created_at timestamptz not null default now(), voided_at timestamptz, void_reason text,
 unique(request_id,installment_id)
);
create table public.expenses (
 id uuid primary key default gen_random_uuid(), description text not null check(length(trim(description))>1),
 amount_cents bigint not null check(amount_cents>0), paid_on date not null, created_by uuid not null references profiles(id) default auth.uid(), created_at timestamptz not null default now()
);
create table public.audit_logs (
 id bigint generated always as identity primary key, actor_id uuid references profiles(id), action text not null,
 entity text not null, record_id text not null, created_at timestamptz not null default now()
);
create function public.can_read_budget(b_id uuid) returns boolean language sql stable security definer set search_path=public
as $$ select is_active() and exists(select 1 from budgets where id=b_id and (is_admin() or professional_id=auth.uid())) $$;
create function public.audit_change() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into audit_logs(actor_id,action,entity,record_id) values(auth.uid(),TG_OP,TG_TABLE_NAME,new.id::text); return new; end $$;
do $$ declare t text; begin
 foreach t in array array['profiles','patients','services','budgets','payments','expenses'] loop
 execute format('create trigger audit_changes after insert or update on public.%I for each row execute function public.audit_change()',t);
 end loop;
 foreach t in array array['profiles','patients','patient_access','services','budgets','budget_items','installments','payments','expenses','audit_logs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy profiles_read on profiles for select to authenticated using(is_active() and (id=auth.uid() or is_admin()));
create policy patients_read on patients for select to authenticated using(is_active() and (created_by=auth.uid() or can_read_patient(id)));
create policy patients_add on patients for insert to authenticated with check(is_active() and created_by=auth.uid());
create policy patients_edit on patients for update to authenticated using(can_read_patient(id)) with check(can_read_patient(id));
grant insert(full_name,phone), update(full_name,phone) on patients to authenticated;
create policy access_read on patient_access for select to authenticated using(is_active() and (professional_id=auth.uid() or is_admin()));
create policy access_manage on patient_access for all to authenticated using(is_admin()) with check(is_admin());
grant insert,delete on patient_access to authenticated;
create policy services_read on services for select to authenticated using(is_active());
create policy services_manage on services for all to authenticated using(is_admin()) with check(is_admin());
grant insert(name,amount_cents),update(name,amount_cents,active) on services to authenticated;
create policy budgets_read on budgets for select to authenticated using(can_read_budget(id));
create policy items_read on budget_items for select to authenticated using(can_read_budget(budget_id));
create policy installments_read on installments for select to authenticated using(can_read_budget(budget_id));
create policy payments_read on payments for select to authenticated using(exists(select 1 from installments where id=installment_id and can_read_budget(budget_id)));
create policy expenses_read on expenses for select to authenticated using(is_admin());
create policy expenses_add on expenses for insert to authenticated with check(is_admin() and created_by=auth.uid());
grant insert(description,amount_cents,paid_on) on expenses to authenticated;
create policy audit_read on audit_logs for select to authenticated using(is_active() and (is_admin() or actor_id=auth.uid()));

-- Valores são buscados do catálogo no servidor; o navegador não define preços.
create function public.save_budget(p_patient uuid,p_items jsonb,p_count int,p_due date) returns uuid
language plpgsql security definer set search_path=public as $$
declare b uuid; it jsonb; s services; total bigint:=0; tooth_n int;
begin
 if not can_read_patient(p_patient) then raise exception 'Paciente não autorizado'; end if;
 if p_count is null or p_count not between 1 and 24 or p_due is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Orçamento inválido'; end if;
 for it in select * from jsonb_array_elements(p_items) loop
 select * into s from services where id=(it->>'service_id')::uuid and active;
 if not found then raise exception 'Serviço indisponível'; end if;
 total:=total+s.amount_cents;
 end loop;
 if total<p_count then raise exception 'Valor insuficiente para parcelas'; end if;
 insert into budgets(patient_id,professional_id,total_cents,installment_count,first_due) values(p_patient,auth.uid(),total,p_count,p_due) returning id into b;
 for it in select * from jsonb_array_elements(p_items) loop
 select * into s from services where id=(it->>'service_id')::uuid;
 tooth_n:=nullif(it->>'tooth','')::int;
 insert into budget_items(budget_id,service_id,service_name,tooth,amount_cents) values(b,s.id,s.name,tooth_n,s.amount_cents);
 end loop;
 return b;
end $$;
create function public.advance_budget(p_id uuid,p_status text) returns void language plpgsql security definer set search_path=public as $$
declare b budgets; n int;
begin
 if not can_read_budget(p_id) then raise exception 'Acesso negado'; end if;
 select * into b from budgets where id=p_id for update;
 if p_status='approved' and b.status='draft' then
 for n in 1..b.installment_count loop
 insert into installments(budget_id,number,due_date,amount_cents) values(b.id,n,(b.first_due+(n-1)*interval '1 month')::date,b.total_cents/b.installment_count+case when n<=b.total_cents%b.installment_count then 1 else 0 end);
 end loop;
 elsif p_status='performed' and b.status='approved' then null;
 elsif p_status='cancelled' and b.status in ('draft','approved') then
 if exists(select 1 from payments p join installments i on i.id=p.installment_id where i.budget_id=b.id and p.voided_at is null) then raise exception 'Estorne os recebimentos antes de cancelar'; end if;
 else raise exception 'Transição de situação inválida'; end if;
 update budgets set status=p_status,performed_at=case when p_status='performed' then now() else performed_at end where id=p_id;
end $$;
-- Lock por orçamento impede recebimentos simultâneos acima do saldo.
create function public.record_payment(p_budget uuid,p_amount bigint,p_method text,p_date date,p_request uuid) returns void
language plpgsql security definer set search_path=public as $$
declare b budgets; due bigint; remaining bigint:=p_amount; i record; portion bigint;
begin
 if not can_read_budget(p_budget) then raise exception 'Acesso negado'; end if;
 select * into b from budgets where id=p_budget for update;
 if exists(select 1 from payments where request_id=p_request) then return; end if;
 if p_request is null or p_amount is null or p_amount<=0 or p_date is null or p_date>current_date or p_method not in ('pix','cash','card','transfer') or p_method is null or b.status not in ('approved','performed') then raise exception 'Recebimento inválido'; end if;
 select b.total_cents-coalesce(sum(p.amount_cents),0) into due from payments p join installments ins on ins.id=p.installment_id where ins.budget_id=b.id and p.voided_at is null;
 if p_amount>due then raise exception 'Valor maior que o saldo a receber'; end if;
 for i in select ins.*,ins.amount_cents-coalesce((select sum(p.amount_cents) from payments p where p.installment_id=ins.id and p.voided_at is null),0) balance from installments ins where ins.budget_id=b.id order by ins.number loop
 portion:=least(remaining,i.balance);
 if portion>0 then insert into payments(installment_id,amount_cents,method,paid_on,recorded_by,request_id) values(i.id,portion,p_method,p_date,auth.uid(),p_request); remaining:=remaining-portion; end if;
 exit when remaining=0;
 end loop;
end $$;
create function public.void_payment(p_id uuid,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare bid uuid;
begin
 if not is_admin() then raise exception 'Acesso negado'; end if;
 if p_reason is null or length(trim(p_reason))<5 then raise exception 'Informe o motivo do estorno'; end if;
 select i.budget_id into bid from payments p join installments i on i.id=p.installment_id where p.id=p_id;
 perform 1 from budgets where id=bid for update;
 update payments set voided_at=now(),void_reason=p_reason where id=p_id and voided_at is null;
 if not found then raise exception 'Recebimento não encontrado ou já estornado'; end if;
end $$;
create index budgets_professional on budgets(professional_id);
create index budgets_patient on budgets(patient_id);
create index patient_access_professional on patient_access(professional_id);
create index installments_budget on installments(budget_id);
create index payments_installment on payments(installment_id);
create index budget_items_budget on budget_items(budget_id);
revoke all on function public.is_admin(),public.is_active(),public.can_read_patient(uuid),public.can_read_budget(uuid),public.audit_change(),public.save_budget(uuid,jsonb,int,date),public.advance_budget(uuid,text),public.record_payment(uuid,bigint,text,date,uuid),public.void_payment(uuid,text) from public,anon;
grant execute on function public.is_admin(),public.is_active(),public.can_read_patient(uuid),public.can_read_budget(uuid),public.save_budget(uuid,jsonb,int,date),public.advance_budget(uuid,text),public.record_payment(uuid,bigint,text,date,uuid),public.void_payment(uuid,text) to authenticated;
commit;
