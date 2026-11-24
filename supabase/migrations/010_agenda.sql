begin;
create table public.appointments (
 id uuid primary key default gen_random_uuid(),
 professional_id uuid not null references public.profiles(id),
 title text not null check(length(title) between 1 and 120),
 starts_at timestamptz not null,
 ends_at timestamptz not null check(ends_at>starts_at),
 status text not null default 'Agendado' check(status in ('Agendado','Confirmado','Atendido','Faltou','Cancelado')),
 google_event_id text,
 google_calendar_id text,
 created_at timestamptz not null default now()
);
create index appointments_professional_date on public.appointments(professional_id,starts_at);
alter table public.appointments enable row level security;
revoke all on public.appointments from anon,authenticated;
grant select,insert,update on public.appointments to authenticated;
create policy appointments_access on public.appointments for all to authenticated using(is_active() and (is_admin() or professional_id=auth.uid())) with check(is_active() and (is_admin() or professional_id=auth.uid()));
create trigger audit_appointments after insert or update on public.appointments for each row execute function public.audit_change();
commit;
