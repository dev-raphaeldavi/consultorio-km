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
declare b budgets; it jsonb; s services; total bigint:=0; tooth_n int; surface_n text; target_professional uuid; paid bigint; remaining bigint; ins record; part bigint;
begin
  select * into b from budgets where id=p_id for update;
  if not found then raise exception 'Orçamento não encontrado'; end if;
  if b.status='cancelled' then raise exception 'Orçamento excluído'; end if;
  if not is_active() or (not is_admin() and (b.professional_id<>auth.uid() or b.status<>'draft')) then raise exception 'Acesso negado'; end if;
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
  if b.status<>'draft' then
    select coalesce(sum(p.amount_cents),0) into paid from payments p join installments i on i.id=p.installment_id where i.budget_id=p_id and p.voided_at is null;
    if total<paid then raise exception 'Total menor que o recebido. Estorne a diferença antes de editar'; end if;
    if p_count<>b.installment_count then raise exception 'Mantenha o parcelamento existente neste orçamento fechado'; end if;
    remaining:=total-paid;
    for ins in select i.id,i.number,coalesce(sum(p.amount_cents) filter(where p.voided_at is null),0) received from installments i left join payments p on p.installment_id=i.id where i.budget_id=p_id group by i.id order by i.number loop
      part:=remaining/p_count+case when ins.number<=remaining%p_count then 1 else 0 end;
      if ins.received+part<=0 then raise exception 'Parcela sem valor. Ajuste os recebimentos antes de reduzir o total'; end if;
      update installments set amount_cents=ins.received+part,due_date=(p_due+(ins.number-1)*interval '1 month')::date where id=ins.id;
    end loop;
  end if;
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

create or replace function public.can_read_patient(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$select is_active() and exists(select 1 from patients where id=p_id)$$;
commit;
