-- Aprovação contábil independente da execução clínica.
begin;

alter table public.profiles
  add column if not exists email text,
  add column if not exists must_change_password boolean not null default false;
create unique index if not exists profiles_email_unique on public.profiles(lower(email)) where email is not null;

alter table public.budgets
  add column if not exists professional_percent numeric(5,2) not null default 50,
  add column if not exists clinic_percent numeric(5,2) not null default 50,
  add column if not exists accounting_status text not null default 'pending',
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists review_note text;

alter table public.budgets add constraint budgets_percentages_check check(
  professional_percent between 0 and 100 and
  clinic_percent between 0 and 100 and
  professional_percent + clinic_percent = 100
);
alter table public.budgets add constraint budgets_accounting_status_check
  check(accounting_status in ('pending','approved','rejected'));

revoke all on function public.save_budget(uuid,jsonb,int,date) from public,anon,authenticated;
create function public.save_budget(
  p_patient uuid,
  p_items jsonb,
  p_count int,
  p_due date,
  p_professional_percent numeric,
  p_clinic_percent numeric,
  p_professional uuid default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare b uuid; it jsonb; s services; total bigint:=0; tooth_n int; target_professional uuid;
begin
  if not can_read_patient(p_patient) then raise exception 'Paciente não autorizado'; end if;
  target_professional:=coalesce(p_professional,auth.uid());
  if target_professional<>auth.uid() and not is_admin() then raise exception 'Acesso negado'; end if;
  if not exists(select 1 from profiles where id=target_professional and active) then raise exception 'Profissional inválido'; end if;
  if p_professional_percent is null or p_clinic_percent is null or p_professional_percent<0 or p_clinic_percent<0 or p_professional_percent+p_clinic_percent<>100 then raise exception 'As porcentagens devem somar 100%%'; end if;
  if p_count is null or p_count not between 1 and 24 or p_due is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Orçamento inválido'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into s from services where id=(it->>'service_id')::uuid and active;
    if not found then raise exception 'Serviço indisponível'; end if;
    total:=total+s.amount_cents;
  end loop;
  if total<p_count then raise exception 'Valor insuficiente para parcelas'; end if;
  insert into budgets(patient_id,professional_id,total_cents,installment_count,first_due,professional_percent,clinic_percent)
  values(p_patient,target_professional,total,p_count,p_due,p_professional_percent,p_clinic_percent) returning id into b;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into s from services where id=(it->>'service_id')::uuid;
    tooth_n:=nullif(it->>'tooth','')::int;
    insert into budget_items(budget_id,service_id,service_name,tooth,amount_cents) values(b,s.id,s.name,tooth_n,s.amount_cents);
  end loop;
  return b;
end $$;

create or replace function public.advance_budget(p_id uuid,p_status text) returns void
language plpgsql security definer set search_path=public as $$
declare b budgets; n int;
begin
  if not can_read_budget(p_id) then raise exception 'Acesso negado'; end if;
  select * into b from budgets where id=p_id for update;
  if p_status='approved' and b.status='draft' then
    for n in 1..b.installment_count loop
      insert into installments(budget_id,number,due_date,amount_cents)
      values(b.id,n,(b.first_due+(n-1)*interval '1 month')::date,b.total_cents/b.installment_count+case when n<=b.total_cents%b.installment_count then 1 else 0 end);
    end loop;
    update budgets set status='approved',accounting_status='pending',submitted_at=now(),reviewed_at=null,reviewed_by=null,review_note=null where id=p_id;
    return;
  elsif p_status='performed' and b.status='approved' then
    update budgets set status='performed',performed_at=now() where id=p_id;
    return;
  elsif p_status='cancelled' and b.status in ('draft','approved') then
    if exists(select 1 from payments p join installments i on i.id=p.installment_id where i.budget_id=b.id and p.voided_at is null) then raise exception 'Estorne os recebimentos antes de cancelar'; end if;
    update budgets set status='cancelled' where id=p_id;
    return;
  end if;
  raise exception 'Transição de situação inválida';
end $$;

create function public.review_budget(p_id uuid,p_decision text,p_professional_percent numeric,p_clinic_percent numeric,p_note text default null) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'Acesso negado'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Decisão inválida'; end if;
  if p_professional_percent is null or p_clinic_percent is null or p_professional_percent<0 or p_clinic_percent<0 or p_professional_percent+p_clinic_percent<>100 then raise exception 'As porcentagens devem somar 100%%'; end if;
  update budgets set professional_percent=p_professional_percent,clinic_percent=p_clinic_percent,accounting_status=p_decision,reviewed_at=now(),reviewed_by=auth.uid(),review_note=nullif(trim(p_note),'')
  where id=p_id and status in ('approved','performed');
  if not found then raise exception 'Orçamento não encontrado ou ainda não fechado'; end if;
end $$;

create function public.update_profile_admin(p_id uuid,p_full_name text,p_active boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not is_admin() then raise exception 'Acesso negado'; end if;
  if p_full_name is null or length(trim(p_full_name))<2 or length(p_full_name)>120 or p_active is null then raise exception 'Dados inválidos'; end if;
  if p_id=auth.uid() and not p_active then raise exception 'A administradora não pode desativar o próprio acesso'; end if;
  update profiles set full_name=trim(p_full_name),active=p_active where id=p_id;
  if not found then raise exception 'Perfil não encontrado'; end if;
end $$;

create function public.complete_password_change() returns void
language plpgsql security definer set search_path=public as $$
begin
  update profiles set must_change_password=false where id=auth.uid() and active;
  if not found then raise exception 'Perfil não encontrado'; end if;
end $$;

drop policy if exists profiles_manage on public.profiles;
create policy profiles_manage on public.profiles for update to authenticated using(is_admin()) with check(is_admin());
grant update(full_name,active) on public.profiles to authenticated;

revoke all on function public.save_budget(uuid,jsonb,int,date,numeric,numeric,uuid),public.review_budget(uuid,text,numeric,numeric,text),public.update_profile_admin(uuid,text,boolean),public.complete_password_change() from public,anon;
grant execute on function public.save_budget(uuid,jsonb,int,date,numeric,numeric,uuid),public.review_budget(uuid,text,numeric,numeric,text),public.update_profile_admin(uuid,text,boolean),public.complete_password_change() to authenticated;

create index if not exists budgets_accounting_status on public.budgets(accounting_status,created_at);
commit;
