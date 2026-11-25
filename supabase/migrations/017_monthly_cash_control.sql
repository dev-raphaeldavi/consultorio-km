begin;

create table public.monthly_cash_balances (
 id uuid primary key default gen_random_uuid(),
 period date not null unique check(period=date_trunc('month',period)::date),
 opening_balance_cents bigint not null default 0 check(abs(opening_balance_cents)<100000000000),
 note text not null default '' check(length(note)<=500),
 updated_by uuid not null references public.profiles(id) default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

alter table public.monthly_cash_balances enable row level security;
revoke all on public.monthly_cash_balances from anon,authenticated;
grant select on public.monthly_cash_balances to authenticated;

create policy monthly_cash_admin_read on public.monthly_cash_balances
for select to authenticated using(is_admin());

create function public.set_monthly_opening_balance(p_period date,p_amount bigint,p_note text default '') returns uuid
language plpgsql security definer set search_path=public as $$
declare target_period date; result_id uuid;
begin
 if not is_admin() then raise exception 'Somente a administradora pode alterar o caixa'; end if;
 target_period:=date_trunc('month',p_period)::date;
 if p_amount is null or abs(p_amount)>=100000000000 then raise exception 'Valor de caixa inválido'; end if;
 if length(coalesce(p_note,''))>500 then raise exception 'Observação muito longa'; end if;
 insert into monthly_cash_balances(period,opening_balance_cents,note,updated_by)
 values(target_period,p_amount,trim(coalesce(p_note,'')),auth.uid())
 on conflict(period) do update set
  opening_balance_cents=excluded.opening_balance_cents,
  note=excluded.note,
  updated_by=auth.uid(),
  updated_at=now()
 returning id into result_id;
 return result_id;
end $$;

create trigger audit_monthly_cash after insert or update on public.monthly_cash_balances
for each row execute function public.audit_change();

revoke all on function public.set_monthly_opening_balance(date,bigint,text) from public,anon;
grant execute on function public.set_monthly_opening_balance(date,bigint,text) to authenticated;

commit;
