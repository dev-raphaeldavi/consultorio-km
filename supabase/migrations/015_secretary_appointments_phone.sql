begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check(role in ('admin','professional','secretary'));

create or replace function public.is_secretary() returns boolean
language sql stable security definer set search_path=public
as $$select exists(select 1 from profiles where id=auth.uid() and role='secretary' and active)$$;

create or replace function public.is_clinician() returns boolean
language sql stable security definer set search_path=public
as $$select exists(select 1 from profiles where id=auth.uid() and role in ('admin','professional') and active)$$;

alter table public.appointments add column if not exists contact_phone text not null default '';

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using(is_active() and (id=auth.uid() or is_admin() or (is_secretary() and active)));

drop policy if exists appointments_access on public.appointments;
create policy appointments_access on public.appointments for all to authenticated
using(is_active() and (is_admin() or is_secretary() or professional_id=auth.uid()))
with check(is_active() and (is_admin() or is_secretary() or professional_id=auth.uid()));

create or replace function public.can_read_budget(b_id uuid) returns boolean
language sql stable security definer set search_path=public
as $$select is_clinician() and exists(select 1 from budgets where id=b_id and (is_admin() or professional_id=auth.uid()))$$;

drop policy if exists clinical_read on public.clinical_entries;
create policy clinical_read on public.clinical_entries for select to authenticated
using(public.is_clinician() and public.can_read_patient(patient_id));

create or replace function public.append_clinical_entry(p_patient uuid,p_section text,p_body jsonb,p_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare existing clinical_entries; actor_role text;
begin
 select role into actor_role from profiles where id=auth.uid() and active;
 if not can_read_patient(p_patient) or actor_role not in ('admin','professional','secretary') or (actor_role='secretary' and p_section<>'identification') then raise exception 'Paciente não autorizado'; end if;
 select * into existing from clinical_entries where id=p_id;
 if found then
  if existing.patient_id<>p_patient or existing.author_id<>auth.uid() or existing.section<>p_section or existing.body<>p_body then raise exception 'Identificador já utilizado'; end if;
  return existing.id;
 end if;
 if p_body ? 'file' and (p_body->'file'->>'path') not like p_patient::text||'/'||auth.uid()::text||'/%' then raise exception 'Anexo inválido'; end if;
 insert into clinical_entries(id,patient_id,section,body,author_id,author_name)
 select p_id,p_patient,p_section,p_body,id,full_name from profiles where id=auth.uid() and active;
 return p_id;
end $$;

create or replace function public.guard_budget_role() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if not is_clinician() then raise exception 'Acesso negado'; end if;
 return new;
end $$;
drop trigger if exists guard_budget_role on public.budgets;
create trigger guard_budget_role before insert on public.budgets for each row execute function public.guard_budget_role();

drop policy if exists clinical_files_read on storage.objects;
drop policy if exists clinical_files_insert on storage.objects;
create policy clinical_files_read on storage.objects for select to authenticated
using(bucket_id='clinical-documents' and public.is_clinician() and public.can_read_patient(case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then ((storage.foldername(name))[1])::uuid else null end));
create policy clinical_files_insert on storage.objects for insert to authenticated
with check(bucket_id='clinical-documents' and public.is_clinician() and (storage.foldername(name))[2]=auth.uid()::text and public.can_read_patient(case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then ((storage.foldername(name))[1])::uuid else null end));

drop function if exists public.update_profile_admin(uuid,text,boolean);
create function public.update_profile_admin(p_id uuid,p_full_name text,p_active boolean,p_role text) returns void
language plpgsql security definer set search_path=public as $$
declare current_role text;
begin
 if not is_admin() then raise exception 'Acesso negado'; end if;
 select role into current_role from profiles where id=p_id;
 if current_role is null then raise exception 'Perfil não encontrado'; end if;
 if p_full_name is null or length(trim(p_full_name))<2 or length(p_full_name)>120 or p_active is null then raise exception 'Dados inválidos'; end if;
 if p_id=auth.uid() and (not p_active or p_role<>'admin') then raise exception 'A administradora não pode alterar o próprio perfil administrativo'; end if;
 if current_role<>'admin' and p_role not in ('professional','secretary') then raise exception 'Perfil inválido'; end if;
 update profiles set full_name=trim(p_full_name),active=p_active,role=case when current_role='admin' then 'admin' else p_role end where id=p_id;
end $$;

revoke all on function public.is_secretary(),public.is_clinician(),public.guard_budget_role(),public.update_profile_admin(uuid,text,boolean,text) from public,anon;
grant execute on function public.is_secretary(),public.is_clinician(),public.update_profile_admin(uuid,text,boolean,text) to authenticated;

commit;
