begin;

create or replace function public.update_budget(
  p_id uuid,
  p_items jsonb,
  p_count int,
  p_due date,
  p_professional_percent numeric,
  p_clinic_percent numeric,
  p_professional uuid default null
) returns void
language plpgsql security definer set search_path=public as $$
declare b budgets; it jsonb; s services; total bigint:=0; tooth_n int; surface_n text; target_professional uuid;
begin
  select * into b from budgets where id=p_id for update;
  if not found then raise exception 'Orçamento não encontrado'; end if;
  if b.status<>'draft' then raise exception 'Reabra o orçamento antes de editar'; end if;
  if not is_admin() and b.professional_id<>auth.uid() then raise exception 'Acesso negado'; end if;
  target_professional:=case when is_admin() then coalesce(p_professional,b.professional_id) else b.professional_id end;
  if not exists(select 1 from profiles where id=target_professional and active) then raise exception 'Profissional inválido'; end if;
  if p_professional_percent is null or p_clinic_percent is null or p_professional_percent<0 or p_clinic_percent<0 or p_professional_percent+p_clinic_percent<>100 then raise exception 'As porcentagens devem somar 100%%'; end if;
  if p_count is null or p_count not between 1 and 24 or p_due is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Orçamento inválido'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into s from services where id=(it->>'service_id')::uuid and active;
    if not found then raise exception 'Serviço indisponível'; end if;
    tooth_n:=nullif(it->>'tooth','')::int;
    surface_n:=nullif(it->>'tooth_surface','');
    if not exists(select 1 from clinical_entries e where e.id=(it->>'clinical_entry_id')::uuid and e.patient_id=b.patient_id and e.section='odontogram' and (e.body->>'tooth')::int=tooth_n and e.body->>'surface'=surface_n) then raise exception 'Achado inválido'; end if;
    total:=total+s.amount_cents;
  end loop;
  if total<p_count then raise exception 'Valor insuficiente para parcelas'; end if;
  delete from budget_items where budget_id=p_id;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into s from services where id=(it->>'service_id')::uuid;
    insert into budget_items(budget_id,service_id,service_name,tooth,tooth_surface,amount_cents,clinical_entry_id)
    values(p_id,s.id,s.name,nullif(it->>'tooth','')::int,nullif(it->>'tooth_surface',''),s.amount_cents,(it->>'clinical_entry_id')::uuid);
  end loop;
  update budgets set professional_id=target_professional,total_cents=total,installment_count=p_count,first_due=p_due,
    professional_percent=p_professional_percent,clinic_percent=p_clinic_percent,accounting_status='pending',reviewed_at=null,reviewed_by=null,review_note=null
  where id=p_id;
end $$;

create or replace function public.manage_budget(p_id uuid,p_action text) returns void
language plpgsql security definer set search_path=public as $$
declare b budgets;
begin
  select * into b from budgets where id=p_id for update;
  if not found then raise exception 'Orçamento não encontrado'; end if;
  if p_action='reopen' then
    if not is_admin() then raise exception 'Somente a administradora pode reabrir'; end if;
    if b.status not in ('approved','performed') then raise exception 'Orçamento não pode ser reaberto'; end if;
    if exists(select 1 from payments p join installments i on i.id=p.installment_id where i.budget_id=p_id) then raise exception 'Orçamento com recebimento registrado não pode ser reaberto'; end if;
    delete from installments where budget_id=p_id;
    update budgets set status='draft',accounting_status='pending',submitted_at=null,reviewed_at=null,reviewed_by=null,review_note=null,performed_at=null where id=p_id;
  elsif p_action='cancel' then
    if not is_admin() and (b.professional_id<>auth.uid() or b.status<>'draft') then raise exception 'Acesso negado'; end if;
    if exists(select 1 from payments p join installments i on i.id=p.installment_id where i.budget_id=p_id and p.voided_at is null) then raise exception 'Estorne os recebimentos antes de excluir'; end if;
    update budgets set status='cancelled',accounting_status='rejected',review_note='Excluído do fluxo operacional' where id=p_id;
  else raise exception 'Ação inválida';
  end if;
end $$;

revoke all on function public.update_budget(uuid,jsonb,int,date,numeric,numeric,uuid),public.manage_budget(uuid,text) from public,anon;
grant execute on function public.update_budget(uuid,jsonb,int,date,numeric,numeric,uuid),public.manage_budget(uuid,text) to authenticated;
commit;
