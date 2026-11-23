-- Execute depois de criar os cinco usuários em Authentication > Users.
begin;
insert into public.profiles(id,email,full_name,role,active,must_change_password)
select id,email,
  case email
    when 'kamila@consultoriokm.com.br' then 'Dra. Kamila Marinho'
    when 'milena.ferreira@consultoriokm.com.br' then 'Dra. Milena Ferreira'
    when 'andrelino.arcanjo@consultoriokm.com.br' then 'Dr. Andrelino Arcanjo'
    when 'joao.ricardo@consultoriokm.com.br' then 'Dr. João Ricardo'
    when 'fabricia.leonara@consultoriokm.com.br' then 'Dra. Fabrícia Leonara'
  end,
  case when email='kamila@consultoriokm.com.br' then 'admin' else 'professional' end,
  true,true
from auth.users
where email in (
  'kamila@consultoriokm.com.br','milena.ferreira@consultoriokm.com.br',
  'andrelino.arcanjo@consultoriokm.com.br','joao.ricardo@consultoriokm.com.br',
  'fabricia.leonara@consultoriokm.com.br'
)
on conflict(id) do update set email=excluded.email,full_name=excluded.full_name,role=excluded.role,active=true,must_change_password=true;
commit;
