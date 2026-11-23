begin;
alter table public.budget_items drop constraint budget_items_tooth_check;
alter table public.budget_items add constraint budget_items_tooth_check check(tooth is null or (tooth/10 between 1 and 4 and tooth%10 between 1 and 8) or (tooth/10 between 5 and 8 and tooth%10 between 1 and 5));
commit;
