begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('clinical-documents','clinical-documents',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do nothing;
create policy clinical_files_read on storage.objects for select to authenticated using(bucket_id='clinical-documents' and public.can_read_patient(case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then ((storage.foldername(name))[1])::uuid else null end));
create policy clinical_files_insert on storage.objects for insert to authenticated with check(bucket_id='clinical-documents' and (storage.foldername(name))[2]=auth.uid()::text and public.can_read_patient(case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then ((storage.foldername(name))[1])::uuid else null end));
commit;

