begin;
alter table public.budget_items add column clinical_entry_id uuid references public.clinical_entries(id);
alter table public.budget_items drop constraint budget_items_tooth_surface_check;
alter table public.budget_items add constraint budget_items_tooth_surface_check check(tooth_surface is null or tooth_surface ~ '^(all|[VPLMDOI](,[VPLMDOI])*)$');
create or replace function public.save_budget(
  p_patient uuid,
  p_items jsonb,
  p_count int,
  p_due date,
  p_professional_percent numeric,
  p_clinic_percent numeric,
  p_professional uuid default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare b uuid; it jsonb; s services; total bigint:=0; tooth_n int; surface_n text; target_professional uuid;
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
    tooth_n:=nullif(it->>'tooth','')::int;
    surface_n:=nullif(it->>'tooth_surface','');
    if not exists(select 1 from clinical_entries e where e.id=(it->>'clinical_entry_id')::uuid and e.patient_id=p_patient and e.section='odontogram' and (e.body->>'tooth')::int=tooth_n and e.body->>'surface'=surface_n) then raise exception 'Achado inválido'; end if;
    if tooth_n is null and surface_n is not null then raise exception 'Face exige um dente'; end if;
    if surface_n is not null and surface_n !~ '^(all|[VPLMDOI](,[VPLMDOI])*)$' then raise exception 'Face dentária inválida'; end if;
    total:=total+s.amount_cents;
  end loop;
  if total<p_count then raise exception 'Valor insuficiente para parcelas'; end if;
  insert into budgets(patient_id,professional_id,total_cents,installment_count,first_due,professional_percent,clinic_percent)
  values(p_patient,target_professional,total,p_count,p_due,p_professional_percent,p_clinic_percent) returning id into b;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into s from services where id=(it->>'service_id')::uuid;
    tooth_n:=nullif(it->>'tooth','')::int;
    surface_n:=nullif(it->>'tooth_surface','');
    insert into budget_items(budget_id,service_id,service_name,tooth,tooth_surface,amount_cents,clinical_entry_id)
    values(b,s.id,s.name,tooth_n,surface_n,s.amount_cents,(it->>'clinical_entry_id')::uuid);
  end loop;
  return b;
end $$;

revoke all on function public.save_budget(uuid,jsonb,int,date,numeric,numeric,uuid) from public,anon;
grant execute on function public.save_budget(uuid,jsonb,int,date,numeric,numeric,uuid) to authenticated;

commit;
