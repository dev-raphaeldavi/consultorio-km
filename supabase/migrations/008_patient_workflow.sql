begin;
alter table public.patients add column registration jsonb not null default '{}', add column attendance text not null default 'registered' check(attendance in ('registered','waiting','attending','finished')), add column attendance_at timestamptz;
alter table public.profiles add column avatar_path text;
create function public.save_patient_registration(p_id uuid,p_name text,p_phone text,p_registration jsonb) returns uuid language plpgsql security definer set search_path=public as $$
begin
 if not is_active() then raise exception 'Acesso negado'; end if;
 if jsonb_typeof(p_registration)<>'object' or octet_length(p_registration::text)>40000 then raise exception 'Cadastro inválido'; end if;
 if p_id is null then insert into patients(full_name,phone,registration) values(p_name,p_phone,p_registration) returning id into p_id;
 else if not can_read_patient(p_id) then raise exception 'Acesso negado'; end if; update patients set full_name=p_name,phone=p_phone,registration=p_registration where id=p_id; end if;
 perform append_clinical_entry(p_id,'identification',p_registration||jsonb_build_object('full_name',p_name,'phone',p_phone),gen_random_uuid());
 return p_id;
end $$;
create function public.set_patient_attendance(p_id uuid,p_status text) returns void language plpgsql security definer set search_path=public as $$
declare prior text;
begin
 if not can_read_patient(p_id) then raise exception 'Acesso negado'; end if;
 select attendance into prior from patients where id=p_id for update;
 if not ((p_status='waiting' and prior in ('registered','finished')) or (p_status='attending' and prior='waiting') or (p_status='finished' and prior='attending')) then raise exception 'Etapa inválida. Atualize a ficha.'; end if;
 update patients set attendance=p_status,attendance_at=now() where id=p_id;
 perform append_clinical_entry(p_id,'evolution',jsonb_build_object('date',current_date,'procedure',case p_status when 'waiting' then 'Chegada / aguardando atendimento' when 'attending' then 'Início do atendimento' else 'Encerramento do atendimento' end),gen_random_uuid());
end $$;
create function public.set_profile_avatar(p_path text) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_active() or p_path is null or p_path not like auth.uid()::text||'/%' then raise exception 'Acesso negado'; end if;
 update profiles set avatar_path=p_path where id=auth.uid();
end $$;
revoke all on function public.save_patient_registration(uuid,text,text,jsonb),public.set_patient_attendance(uuid,text),public.set_profile_avatar(text) from public,anon;
grant execute on function public.save_patient_registration(uuid,text,text,jsonb),public.set_patient_attendance(uuid,text),public.set_profile_avatar(text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('profile-photos','profile-photos',false,2097152,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy profile_photo_read on storage.objects for select to authenticated using(bucket_id='profile-photos' and public.is_active() and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
create policy profile_photo_add on storage.objects for insert to authenticated with check(bucket_id='profile-photos' and public.is_active() and (storage.foldername(name))[1]=auth.uid()::text);
commit;
