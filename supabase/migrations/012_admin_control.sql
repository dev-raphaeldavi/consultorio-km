begin;
create function public.guard_admin_changes() returns trigger language plpgsql set search_path=public as $$
begin
 if not is_admin() and (TG_TABLE_NAME='clinical_entries' or (TG_TABLE_NAME='budgets' and new.status='cancelled')) then raise exception 'Somente Kamila pode alterar ou excluir registros'; end if;
 return new;
end $$;
create trigger guard_budget_cancel before update on public.budgets for each row execute function public.guard_admin_changes();
alter table public.clinical_entries add column deleted_at timestamptz;
create trigger audit_clinical_changes after update on public.clinical_entries for each row execute function public.audit_change();
create function public.admin_clinical(p_patient uuid,p_entry uuid default null,p_body jsonb default null) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_admin() or not is_active() then raise exception 'Somente Kamila pode alterar ou excluir registros'; end if;
 if p_body is null then
  update clinical_entries set deleted_at=now() where patient_id=p_patient and (p_entry is null or id=p_entry) and deleted_at is null;
 else
  if p_entry is null then raise exception 'Selecione um registro'; end if;
  update clinical_entries set body=p_body where patient_id=p_patient and id=p_entry and deleted_at is null;
 end if;
end $$;
create or replace function public.manage_budget(p_id uuid,p_action text) returns void language plpgsql security definer set search_path=public as $$
declare b budgets;
begin
 if not is_admin() or not is_active() then raise exception 'Somente Kamila pode excluir ou reabrir orçamentos'; end if;
 select * into b from budgets where id=p_id for update;
 if not found then raise exception 'Orçamento não encontrado'; end if;
 if p_action='cancel' then
  update payments set voided_at=now(),void_reason='Orçamento excluído pela administradora' where installment_id in(select id from installments where budget_id=p_id) and voided_at is null;
  update budgets set status='cancelled',accounting_status='rejected',review_note='Excluído pela administradora; recebimentos anulados no sistema' where id=p_id;
 elsif p_action='reopen' then
  if b.status not in ('approved','performed') then raise exception 'Orçamento não pode ser reaberto'; end if;
  if exists(select 1 from payments p join installments i on i.id=p.installment_id where i.budget_id=p_id) then raise exception 'Este orçamento possui recebimentos. Exclua para desfazer o financeiro e crie o orçamento corrigido'; end if;
  delete from installments where budget_id=p_id;
  update budgets set status='draft',accounting_status='pending',submitted_at=null,reviewed_at=null,reviewed_by=null,review_note=null,performed_at=null where id=p_id;
 else raise exception 'Ação inválida'; end if;
end $$;
revoke all on function public.admin_clinical(uuid,uuid,jsonb) from public,anon;
grant execute on function public.admin_clinical(uuid,uuid,jsonb) to authenticated;
commit;
