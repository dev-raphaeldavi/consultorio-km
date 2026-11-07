# Ativação do Supabase

O portal está pronto para receber a URL e a chave pública do seu projeto. A demonstração funciona sem essa configuração. Não use dados reais no modo de demonstração.

## 1. Criar o projeto

Crie sua conta e um projeto no Supabase. Guarde a senha do banco em seu gerenciador de senhas. Não é necessário enviar essa senha para conectar o frontend.

No SQL Editor, execute uma única vez o conteúdo integral de `supabase/migrations/001_initial.sql`, em um projeto novo. O script usa transação: em caso de erro, corrija antes de continuar. Não execute sobre um banco existente sem revisar conflitos e backup.

As tabelas são: profiles, patients, patient_access, services, budgets, budget_items, installments, payments, expenses e audit_logs. Todas têm RLS habilitada. O visitante não tem acesso. Operações de orçamento e recebimento ocorrem por funções que verificam a identidade e aplicam a transação no servidor.

## 2. Criar o primeiro acesso da Dra. Kamila

Em Authentication / Users, crie o usuário real da proprietária. Use uma senha forte e privada ou o fluxo de convite do painel. Copie o UUID desse usuário e execute no SQL Editor, substituindo o marcador:

```sql
insert into public.profiles (id, full_name, role, active)
values ('UUID-REAL-DO-USUARIO', 'Dra. Kamila Marinho', 'admin', true);
```

Não use o campo `user_metadata` para decidir quem é administradora. O papel vem exclusivamente da tabela `profiles`, que não pode ser editada por um usuário comum.

Desabilite o cadastro público em Auth. O portal trabalha com acessos liberados pela administração, não com inscrição aberta. Configure o envio de e-mails/SMTP para os endereços que receberão os convites.

## 3. Conectar a aplicação

Copie `.env.example` para `.env`, na raiz deste projeto, e preencha:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
```

Use a chave pública publishable ou anon. Ela é incorporada ao frontend por design; a proteção dos registros é feita pelas políticas RLS e pela sessão do usuário. Nunca use `service_role`, secret key ou senha do banco nesse arquivo.

Execute `pnpm build` e publique novamente o conteúdo de `dist/`. Sem rebuild, a versão anterior continuará em demonstração. Essas variáveis são lidas no build, não durante a navegação.

## 4. Configurar links de acesso

No painel Auth, configure Site URL com a origem real do site. Cadastre também a URL de redirecionamento `<ORIGEM>/?onboarding=1`. Para desenvolvimento local, permita `http://127.0.0.1:4173/?onboarding=1` separadamente. Links de convite/recuperação conduzem à tela de definição de senha.

A versão inicial do Sites é privada para o proprietário. Para usuários externos utilizarem o portal, o acesso da hospedagem precisará ser configurado para a audiência pretendida. Isso é separado do login Supabase.

## 5. Habilitar convites pela tela Equipe

Publique `supabase/functions/invite-professional/index.ts` como uma Supabase Edge Function chamada `invite-professional`. Mantenha a verificação JWT ativada, conforme `supabase/config.toml`.

Configure o secret `APP_ORIGIN` com a origem exata da aplicação, sem barra final, por exemplo `https://seu-dominio.com`. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` ficam exclusivamente no ambiente seguro da Edge Function. Nunca exponha a chave administrativa no site.

Com a CLI já autenticada e vinculada ao projeto:

```sh
supabase functions deploy invite-professional
supabase secrets set APP_ORIGIN=https://seu-dominio.com
```

A função valida a sessão, consulta o perfil ativo de administradora e cria apenas perfis `professional`. O e-mail é enviado somente ao confirmar “Enviar convite” na tela Equipe. Se o envio acontecer mas o cadastro do perfil falhar, a função informa a falha parcial; confira Auth e profiles antes de reenviar. O profissional permanece sem acesso até existir um perfil ativo.

Alternativa inicial sem Edge Function: crie o profissional no painel Auth e insira o perfil no SQL Editor:

```sql
insert into public.profiles (id, full_name, role, active)
values ('UUID-REAL-DO-PROFISSIONAL', 'Nome do profissional', 'professional', true);
```

## 6. Homologar com três contas

Use uma administradora e dois profissionais com dados de teste. Confira:

1. Cada profissional vê somente seus pacientes criados ou explicitamente liberados e seus próprios orçamentos/recebimentos.
2. Um profissional não consegue ler os orçamentos do outro, mesmo alterando a rota ou chamando a API.
3. A administradora vê os dados de ambos.
4. Aprovar orçamento gera parcelas exatas; registrar pagamento parcial atualiza o financeiro da proprietária após atualizar a tela.
5. Duplo clique/reenvio do mesmo pedido não duplica o recebimento; valores acima do saldo são recusados.
6. Estorno feito pela administradora reabre o saldo e mantém o histórico.
7. Convite e recuperação de senha chegam ao e-mail e abrem a tela correta.
8. Perfil inativado perde acesso. Para desativar, execute como administradora do banco:

```sql
update public.profiles set active = false
where id = 'UUID-REAL-DO-PROFISSIONAL';
```

Nunca exclua usuários vinculados a registros financeiros; mantenha o histórico e inative o perfil. Cadastro e valores de serviços ficam na interface da administradora. Nesta versão, alterar/inativar serviços já existentes e gerenciar suspensão de contas são operações administrativas no Supabase.

## Limites e operação

Os indicadores são calculados sobre os registros autorizados retornados pelo banco, com paginação para além de 1.000 linhas. A atualização ocorre ao abrir telas, registrar operações, voltar à janela ou clicar em Atualizar; não existe assinatura Realtime nesta versão. Para volumes maiores, migrar a agregação financeira para consultas server-side e paginação visual.

Os testes de banco executados localmente usam PostgreSQL embarcado com simulação de `auth.uid()`. A homologação do Supabase hospedado, SMTP, concorrência com múltiplas sessões, backup/restauração e controles operacionais é necessária antes de cadastrar pacientes reais.

Documentação oficial: [Auth](https://supabase.com/docs/guides/auth), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [segurança de Edge Functions](https://supabase.com/docs/guides/functions/auth).
