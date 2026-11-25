begin;

alter table public.profiles
  add column if not exists business_model text not null default 'percentage',
  add column if not exists room_rent_cents bigint not null default 0;
alter table public.profiles drop constraint if exists profiles_business_model_check;
alter table public.profiles add constraint profiles_business_model_check check(business_model in ('percentage','room_rental'));
alter table public.profiles drop constraint if exists profiles_room_rent_check;
alter table public.profiles add constraint profiles_room_rent_check check(room_rent_cents>=0 and room_rent_cents<100000000);

create table if not exists public.room_rentals(
 id uuid primary key default gen_random_uuid(),
 professional_id uuid not null references public.profiles(id),
 amount_cents bigint not null check(amount_cents>0 and amount_cents<100000000),
 due_date date not null,
 note text not null default '' check(length(note)<=500),
 status text not null default 'pending' check(status in ('pending','paid','cancelled')),
 created_by uuid not null references public.profiles(id) default auth.uid(),
 created_at timestamptz not null default now()
);
create table if not exists public.room_rental_payments(
 id uuid primary key default gen_random_uuid(),
 rental_id uuid not null references public.room_rentals(id),
 amount_cents bigint not null check(amount_cents>0),
 method text not null check(method in ('pix','cash','card','transfer')),
 paid_on date not null default current_date,
 recorded_by uuid not null references public.profiles(id) default auth.uid(),
 request_id uuid not null unique,
 created_at timestamptz not null default now(),
 voided_at timestamptz,
 void_reason text
);
create index if not exists room_rentals_professional_date on public.room_rentals(professional_id,due_date);
create index if not exists room_rental_payments_rental on public.room_rental_payments(rental_id);

alter table public.room_rentals enable row level security;
alter table public.room_rental_payments enable row level security;
revoke all on public.room_rentals,public.room_rental_payments from anon,authenticated;
grant select on public.room_rentals,public.room_rental_payments to authenticated;
create policy room_rentals_read on public.room_rentals for select to authenticated
using(is_active() and (is_admin() or professional_id=auth.uid()));
create policy room_rental_payments_read on public.room_rental_payments for select to authenticated
using(is_active() and exists(select 1 from room_rentals r where r.id=rental_id and (is_admin() or r.professional_id=auth.uid())));

create or replace function public.apply_professional_business_model() returns trigger
language plpgsql security definer set search_path=public as $$
declare target_role text; target_model text;
begin
 select role,business_model into target_role,target_model from profiles where id=new.professional_id and active;
 if target_role is null or target_role not in ('admin','professional') then raise exception 'Profissional inválido'; end if;
 if target_model='room_rental' then
  new.professional_percent:=100;
  new.clinic_percent:=0;
 end if;
 return new;
end $$;
drop trigger if exists apply_professional_business_model on public.budgets;
create trigger apply_professional_business_model before insert or update of professional_id,professional_percent,clinic_percent on public.budgets
for each row execute function public.apply_professional_business_model();

create function public.create_room_rental(p_professional uuid,p_amount bigint,p_due date,p_note text default '') returns uuid
language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
 if not is_admin() then raise exception 'Somente a administradora pode lançar aluguel'; end if;
 if p_amount is null or p_amount<=0 or p_due is null or length(coalesce(p_note,''))>500 then raise exception 'Dados inválidos'; end if;
 if not exists(select 1 from profiles where id=p_professional and active and role='professional' and business_model='room_rental') then raise exception 'Profissional não está marcado como sala alugada'; end if;
 insert into room_rentals(professional_id,amount_cents,due_date,note) values(p_professional,p_amount,p_due,coalesce(trim(p_note),'')) returning id into result;
 return result;
end $$;

create function public.record_room_rental_payment(p_rental uuid,p_amount bigint,p_method text,p_date date,p_request uuid) returns void
language plpgsql security definer set search_path=public as $$
declare rental room_rentals; received bigint;
begin
 select * into rental from room_rentals where id=p_rental for update;
 if not found or not is_active() or (not is_admin() and rental.professional_id<>auth.uid()) then raise exception 'Acesso negado'; end if;
 if exists(select 1 from room_rental_payments where request_id=p_request) then return; end if;
 select coalesce(sum(amount_cents),0) into received from room_rental_payments where rental_id=p_rental and voided_at is null;
 if rental.status='cancelled' or p_amount is null or p_amount<=0 or p_amount>rental.amount_cents-received or p_method not in ('pix','cash','card','transfer') or p_date is null or p_date>current_date or p_request is null then raise exception 'Recebimento inválido'; end if;
 insert into room_rental_payments(rental_id,amount_cents,method,paid_on,recorded_by,request_id) values(p_rental,p_amount,p_method,p_date,auth.uid(),p_request);
 if received+p_amount=rental.amount_cents then update room_rentals set status='paid' where id=p_rental; end if;
end $$;

create function public.manage_room_rental(p_id uuid,p_action text,p_reason text default null) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_admin() then raise exception 'Acesso negado'; end if;
 if p_action='cancel' then
  if exists(select 1 from room_rental_payments where rental_id=p_id and voided_at is null) then raise exception 'Estorne recebimentos antes de cancelar'; end if;
  update room_rentals set status='cancelled' where id=p_id and status='pending';
 elsif p_action='void' then
  update room_rental_payments set voided_at=now(),void_reason=coalesce(nullif(trim(p_reason),''),'Estorno pela administradora') where id=p_id and voided_at is null;
  update room_rentals set status='pending' where id=(select rental_id from room_rental_payments where id=p_id);
 else raise exception 'Ação inválida'; end if;
end $$;

drop function if exists public.update_profile_admin(uuid,text,boolean,text);
create function public.update_profile_admin(p_id uuid,p_full_name text,p_active boolean,p_role text,p_business_model text,p_room_rent_cents bigint) returns void
language plpgsql security definer set search_path=public as $$
declare current_role text;
begin
 if not is_admin() then raise exception 'Acesso negado'; end if;
 select role into current_role from profiles where id=p_id;
 if current_role is null then raise exception 'Perfil não encontrado'; end if;
 if p_full_name is null or length(trim(p_full_name))<2 or length(p_full_name)>120 or p_active is null then raise exception 'Dados inválidos'; end if;
 if p_id=auth.uid() and (not p_active or p_role<>'admin') then raise exception 'A administradora não pode alterar o próprio perfil administrativo'; end if;
 if current_role<>'admin' and p_role not in ('professional','secretary') then raise exception 'Perfil inválido'; end if;
 if p_business_model not in ('percentage','room_rental') or p_room_rent_cents is null or p_room_rent_cents<0 then raise exception 'Modelo financeiro inválido'; end if;
 update profiles set full_name=trim(p_full_name),active=p_active,role=case when current_role='admin' then 'admin' else p_role end,
 business_model=case when p_role='professional' then p_business_model else 'percentage' end,
 room_rent_cents=case when p_role='professional' and p_business_model='room_rental' then p_room_rent_cents else 0 end
 where id=p_id;
end $$;

create trigger audit_room_rentals after insert or update on public.room_rentals for each row execute function public.audit_change();
create trigger audit_room_rental_payments after insert or update on public.room_rental_payments for each row execute function public.audit_change();

revoke all on function public.apply_professional_business_model(),public.create_room_rental(uuid,bigint,date,text),public.record_room_rental_payment(uuid,bigint,text,date,uuid),public.manage_room_rental(uuid,text,text),public.update_profile_admin(uuid,text,boolean,text,text,bigint) from public,anon;
grant execute on function public.create_room_rental(uuid,bigint,date,text),public.record_room_rental_payment(uuid,bigint,text,date,uuid),public.manage_room_rental(uuid,text,text),public.update_profile_admin(uuid,text,boolean,text,text,bigint) to authenticated;

commit;
