# Consultório KM — primeira versão

Landing page da Dra. Kamila Marinho e portal de gestão odontológica, com demonstração funcional e integração preparada para Supabase.

## Abrir e desenvolver

Requer Node.js 22+ e pnpm. Na pasta deste projeto:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Abra `http://127.0.0.1:4173`. Para testes: `pnpm test`.

O código de interface está em `src/`; HTML, CSS e imagens em `dist/`. O build empacota o JavaScript em `dist/app.js`. A aplicação é estática, com serviços remotos de autenticação e dados no Supabase. Não precisa de servidor Node em produção.

## O que está implementado

- Landing page responsiva com foto extraída da proposta, conteúdo institucional, Instagram, WhatsApp e localização fornecidos pelo cliente.
- Área de acesso por e-mail e senha, recuperação e definição de senha, com redirecionamento pelo perfil validado no banco.
- Rotas `#/gestao/...` e `#/profissional/...`.
- Demonstração separada do acesso real: todos os exemplos são fictícios, persistidos apenas no navegador. Não é um mecanismo de autenticação nem um banco de produção.
- Cadastro de pacientes; proprietária pode liberar um paciente para outro profissional.
- Catálogo de serviços e valores; cadastro pela administradora.
- Odontograma FDI permanente para escolher o dente de cada item do orçamento.
- Orçamentos com múltiplos procedimentos e 1 a 24 parcelas; preço validado no banco.
- Aprovação, registro de serviço realizado, cancelamento de orçamento ainda não executado e sem recebimentos ativos.
- Recebimentos parciais por Pix, cartão, dinheiro e transferência, vinculados ao orçamento e alocados nas parcelas mais antigas.
- Financeiro consolidado para administradora, visão individual para profissional, filtros por mês/profissional, despesas, saldo, parcelas abertas e estornos com motivo.
- Plano de tratamento e relatório financeiro via impressão / “Salvar como PDF” do navegador; exportação CSV.
- Histórico de ações. Recebimentos não são excluídos: estornos preservam o registro.
- Código de Edge Function para a administradora convidar profissionais. Nenhum convite real foi enviado durante o desenvolvimento.

## Regras financeiras adotadas

Valores são armazenados em centavos inteiros. Orçamento em rascunho não entra no saldo a receber. Aprovação gera parcelas. Recebimento é caixa efetivo e independe da conclusão do serviço, permitindo adiantamentos. “Realizado” indica conclusão do orçamento inteiro nesta versão. O pagamento é alocado por ordem de parcela; a data do pagamento determina o mês de caixa. A receber soma todos os saldos aprovados/realizados, enquanto a lista de parcelas usa o mês de vencimento selecionado. Estornos reabrem o saldo e retiram o lançamento dos recebimentos confirmados.

Não há divisão automática de repasses, comissões, taxas de cartão ou receitas retidas pelo parceiro. A regra comercial entre consultório e profissional precisa ser definida antes de acrescentar essa apuração. Registros não movimentam contas bancárias nem cobram cartões.

## Supabase

Siga `SUPABASE.md`. A migração cria as tabelas, políticas RLS, funções transacionais e auditoria. Nenhum projeto, banco, usuário ou senha real foi criado. Não existe senha padrão.

## Validação desta entrega

16 testes passaram com PostgreSQL embarcado (PGlite) e testes de domínio. Cobrem a migração, controle de acesso, profissionais isolados, bloqueio de autoelevação de perfil, catálogo protegido, transições, parcelamento exato, limite de saldo, idempotência do recebimento, estorno, bloqueio de perfil inativo e visitante anônimo.

O fluxo de demonstração também foi exercitado no navegador: orçamento com dente 21, aprovação, execução, recebimento parcial e consolidação na visão administrativa. Login, entrega de e-mails, links de convite/recuperação e operação multiusuário simultânea ainda precisam ser validados no projeto Supabase real. Os testes embarcados não substituem essa homologação.

## Próximas etapas do escopo da proposta

Esta é a primeira implementação do núcleo solicitado. Agenda, perfil específico de recepção, prontuário/anamnese e anexos, odontograma clínico com condições e faces, edição/versionamento de orçamentos, conclusão por item, repasses, inadimplência com notificações e geração de PDF automática no servidor ficam para evolução. A impressão atual lista dentes e procedimentos; não é um prontuário completo.

Antes da operação real: validar catálogo/preços, regras de acesso, texto institucional, política de retenção e privacidade, backup e restauração, recuperação de conta e teste com contas separadas. A publicação inicial em Sites é privada para revisão; liberar acesso público à landing page é uma configuração separada, preservando o login do portal.

## Referências

- Proposta_Comercial_Dra_Kamila_Marinho.pdf fornecida pelo cliente: escopo, foto, marca e CRO-PE 16029. A proposta foi tratada como referência, não como autorização de contratação ou pagamento.
- Instagram: https://www.instagram.com/consultoriokm/ — leitura automática indisponível; nenhuma alegação foi atribuída a posts não consultados.
- WhatsApp e endereço: fornecidos pelo cliente nesta conversa.
- Supabase Auth: https://supabase.com/docs/guides/auth
- RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Convites: https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail

