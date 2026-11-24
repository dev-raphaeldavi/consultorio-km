begin;
create table public.clinical_entries(
 id uuid primary key default gen_random_uuid(),
 patient_id uuid not null references public.patients(id),
 section text not null check(section in ('identification','anamnesis','exam','odontogram','diagnosis','plan','evolution','exams','consents','documents')),
 body jsonb not null check(jsonb_typeof(body)='object' and octet_length(body::text)<=150000),
 author_id uuid not null default auth.uid() references public.profiles(id),
 author_name text not null default '',
 created_at timestamptz not null default now()
);
create index clinical_patient_date on public.clinical_entries(patient_id,created_at);
alter table public.clinical_entries enable row level security;
revoke all on public.clinical_entries from anon,authenticated;
grant select on public.clinical_entries to authenticated;
create policy clinical_read on public.clinical_entries for select to authenticated using(public.can_read_patient(patient_id));
create function public.append_clinical_entry(p_patient uuid,p_section text,p_body jsonb,p_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare existing clinical_entries;
begin
 if not can_read_patient(p_patient) then raise exception 'Paciente não autorizado'; end if;
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
revoke all on function public.append_clinical_entry(uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.append_clinical_entry(uuid,text,jsonb,uuid) to authenticated;
create trigger audit_clinical after insert on public.clinical_entries for each row execute function public.audit_change();
commit;

