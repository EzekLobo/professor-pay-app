# Plano de Implementação — AulaPay Web

> Fonte de verdade da migração do AulaPay de Expo/SQLite local para Next.js +
> FastAPI + PostgreSQL. Cada tarefa é executada, verificada e commitada antes da
> próxima. Decisões assumidas: aplicação multiusuário, cadastro aberto somente
> em desenvolvimento, autenticação por cookie HttpOnly, Docker Compose para
> desenvolvimento. Deploy externo não será realizado sem provedor e credenciais.

## Tarefas

- [x] **Tarefa 1 — Fundação do monorepo e ambiente local**
  - Escopo: criar `apps/web`, `apps/api`, configuração raiz, Docker Compose, exemplos de ambiente, documentação de execução e health checks.
  - Aceitação: `docker compose config` é válido; frontend e API têm manifests reproduzíveis; `README.md` descreve a inicialização local.
  - Depende de: nenhuma.

- [x] **Tarefa 2 — Banco, modelos e migrações**
  - Escopo: implementar SQLAlchemy/Alembic e as tabelas de usuário, turma, aula e confirmação de pagamento, com UUID, valores em centavos e isolamento por usuário.
  - Aceitação: uma migração inicial cria o schema em PostgreSQL e SQLite de teste; testes de modelo e integridade passam.
  - Depende de: 1.

- [x] **Tarefa 3 — Autenticação e segurança da API**
  - Escopo: implementar registro, login, logout, sessão em cookie HttpOnly, usuário atual, autorização por `user_id`, CORS e tratamento de erros.
  - Aceitação: testes comprovam que senhas são hasheadas, sessão protege endpoints e usuários não acessam dados de terceiros.
  - Depende de: 2.

- [x] **Tarefa 4 — Domínio financeiro e regras de paridade**
  - Escopo: portar cálculos de datas, quinzenas, valores, geração de aulas, edição protegida e desativação de turma para Python.
  - Aceitação: testes `pytest` equivalentes aos testes atuais passam, incluindo períodos recebidos preservados e valores sem `float`.
  - Depende de: 2.

- [x] **Tarefa 5 — API de turmas, aulas e dashboard**
  - Escopo: criar endpoints autenticados de turmas, aulas extras, cancelamentos, dashboard e filtros; documentar OpenAPI.
  - Aceitação: testes de integração exercitam CRUD, filtros, cancelamentos, transações e isolamento por usuário; `/docs` mostra os endpoints.
  - Depende de: 3, 4.

- [x] **Tarefa 6 — API de pagamentos, backup e reset**
  - Escopo: expor listagem/detalhe de pagamentos, confirmação e estorno idempotentes, exportação JSON e reset protegido.
  - Aceitação: totais e status são corretos; confirmação duplicada não duplica registros; reset afeta apenas o dono.
  - Depende de: 5.

- [x] **Tarefa 7 — Importação de dados do Expo**
  - Escopo: criar formato JSON versionado, endpoint idempotente com prévia/relatório e exportador não destrutivo no app Expo conforme SDK 56.
  - Aceitação: um fixture de exportação importa turmas, aulas e confirmações uma única vez; arquivo inválido falha sem gravação parcial.
  - Depende de: 6.

- [x] **Tarefa 8 — Base visual e autenticação Next.js**
  - Escopo: inicializar Next.js App Router, tokens visuais, componentes básicos, shell responsivo, cliente de API e telas de login/cadastro/logout.
  - Aceitação: `npm run lint`, `npm run typecheck` e `npm run build` passam; rotas privadas redirecionam usuários não autenticados.
  - Depende de: 1, 3.

- [x] **Tarefa 9 — Dashboard web**
  - Escopo: implementar a página de resumo com cards, progresso, últimos/próximos pagamentos, estados de loading/erro/vazio e locale pt-BR.
  - Aceitação: a página consome `/dashboard`, é responsiva e tem testes de componente para os estados principais.
  - Depende de: 5, 8.

- [x] **Tarefa 10 — Turmas e aulas no frontend**
  - Escopo: implementar listagem, formulários, edição/desativação de turmas, histórico, filtros, aulas extras e cancelamento.
  - Aceitação: fluxos mutam a API, atualizam o dashboard e apresentam erros de validação; build e testes passam.
  - Depende de: 5, 8, 9.

- [x] **Tarefa 11 — Pagamentos, importação e dados no frontend**
  - Escopo: criar páginas de pagamentos, detalhe/confirmação/estorno, importação, exportação e reset com confirmações seguras.
  - Aceitação: os fluxos críticos são funcionais no navegador e não permitem duplicação acidental de ações.
  - Depende de: 6, 7, 10.

- [x] **Tarefa 12 — Qualidade, E2E e entrega operacional**
  - Escopo: configurar CI, cobertura, Playwright, Dockerfiles de produção, logs, guia de backup/restauração e validação completa.
  - Aceitação: testes backend/frontend/E2E e builds passam; Compose sobe os serviços; documentação de operação existe.
  - Depende de: 7, 11.

## Migração SQLite para PythonAnywhere

> Decisão: o banco fica em `apps/api/data/aulapay.sqlite3`, no diretório do
> projeto, mas é ignorado pelo Git. Assim o arquivo persiste no servidor e não
> vaza dados reais no repositório. Alembic cria o schema no primeiro deploy.

- [x] **Tarefa S1 — Configuração e persistência SQLite**
  - Escopo: mudar a configuração padrão da API para SQLite por caminho absoluto,
    criar a pasta de dados versionável sem o banco e adaptar o engine para SQLite.
  - Aceitação: a API sobe sem PostgreSQL usando um banco arquivo configurável;
    o arquivo não é rastreado pelo Git e os testes continuam isolados.
  - Depende de: nenhuma.

- [x] **Tarefa S2 — Migrações e testes SQLite de produção**
  - Escopo: garantir que as migrações Alembic e constraints funcionem no banco
    arquivo, incluindo criação inicial, reinicialização e readiness.
  - Aceitação: uma base vazia recebe `alembic upgrade head`, `/ready` responde e
    a suíte de API passa com SQLite.
  - Depende de: S1.

- [x] **Tarefa S3 — Empacotamento e guia PythonAnywhere**
  - Escopo: remover PostgreSQL do fluxo local padrão, atualizar Compose/variáveis,
    README e operação com instalação, migração, comando ASGI e backup SQLite.
  - Aceitação: documentação permite publicar a API no PythonAnywhere e manter o
    arquivo de banco fora do versionamento; frontend e CI seguem válidos.
  - Depende de: S2.

## Log de handoff

> Cada tarefa concluída registra arquivos, verificações e interfaces para a
> próxima tarefa. O commit é feito pelo orquestrador após verificação independente.

### SQLite S1 — Configuração e persistência

- Mudou: SQLite em `apps/api/data/aulapay.sqlite3` tornou-se o padrão por
  caminho absoluto; engine recebe pragmas de integridade/concor­rência e o
  diretório de dados é mantido sem versionar os arquivos reais.
- Verificado: `uv run --isolated pytest` (31 testes), Ruff, diff check e
  `git check-ignore` do banco passam.
- Para as próximas tarefas: `DATABASE_URL` continua sendo override para SQLite
  ou PostgreSQL; S2 deve validar as migrações e readiness no arquivo real.

### SQLite S2 — Migrações e testes de produção

- Mudou: Alembic cria diretórios do SQLite e aplica pragmas de integridade nas
  conexões de migração; testes cobrem arquivo, constraints, downgrade/upgrade e
  readiness após migração.
- Verificado: `uv run --isolated pytest` (32 testes), Ruff e diff check passam;
  uma migração explícita em arquivo temporário aninhado foi validada pelo executor.
- Para as próximas tarefas: S3 deve remover PostgreSQL do fluxo operacional
  padrão e documentar o deploy ASGI no PythonAnywhere.

### SQLite S3 — Empacotamento e guia PythonAnywhere

- Mudou: Compose e variáveis padrão não requerem PostgreSQL; documentação local,
  operacional e de PythonAnywhere descreve SQLite, ASGI, migrações, backups e
  limites de concorrência.
- Verificado: API (`pytest`, 32 testes; Ruff), web (lint, typecheck, 8 testes),
  `docker compose config --quiet` e diff check passam.
- Para operação: siga `docs/PYTHONANYWHERE.md`; a API ASGI do PythonAnywhere é
  experimental e SQLite deve operar com um único processo e baixa concorrência.

### Tarefa 1 — Fundação do monorepo e ambiente local

- Mudou: foram criados os scaffolds `apps/web` (Next.js 16) e `apps/api`
  (FastAPI), além de Dockerfiles, Compose, exemplos de ambiente, scripts de
  workspace e documentação de execução.
- Verificado: `npm.cmd run web:typecheck`, `npm.cmd run web:lint`,
  `npm.cmd run web:build` e `uv run pytest` passam. O Compose foi validado pelo
  executor com um `.env` temporário; a validação sem arquivo falha por design,
  pois o serviço de API exige que o usuário copie `.env.example` para `.env`.
- Para as próximas tarefas: a API fica em `apps/api/app`, usa Python 3.12+ e
  possui um endpoint `GET /health`; o frontend fica em `apps/web`. Docker Desktop
  não estava executando neste ambiente, portanto imagens não foram construídas.

### Tarefa 2 — Banco, modelos e migrações

- Mudou: SQLAlchemy/Alembic, sessão de banco, modelos `User`, `ClassRecord`,
  `Lesson` e `PaymentConfirmation`, primeira migração e testes de integridade.
- Verificado: `uv run pytest` (6 testes), `uv run ruff check .` e
  `uv run alembic upgrade head --sql` passam; teste automatizado aplica a
  migração em SQLite.
- Para as próximas tarefas: use `app.db.session.get_db` e os modelos em
  `app.models`; dinheiro é `*_cents`, duração é `duration_minutes`, e todas as
  consultas de domínio devem filtrar por `user_id`.

### Tarefa 3 — Autenticação e segurança da API

- Mudou: rotas de registro/login/logout/usuário atual, JWT em cookie HttpOnly,
  hash bcrypt, dependências de usuário atual e propriedade, CORS e handlers de
  erro; foram adicionados testes de sessão e isolamento.
- Verificado: `uv run pytest` (11 testes) e `uv run ruff check .` passam.
- Para as próximas tarefas: proteja novas rotas com `CurrentUser`, use
  `get_owned_or_404` para recursos por ID e mantenha o prefixo `/api/v1`.

### Tarefa 4 — Domínio financeiro e regras de paridade

- Mudou: domínio puro para datas/quinzenas, dinheiro em centavos, geração de
  aulas, dashboard, filtros, edição e desativação, acompanhado por testes
  determinísticos de paridade.
- Verificado: `uv run pytest` (19 testes) e `uv run ruff check .` passam.
- Para as próximas tarefas: serviços podem usar `ClassData`, `LessonData`,
  `build_dashboard`, `lessons_for_class_update` e `deactivate_class_lessons`;
  o domínio não depende de FastAPI nem de sessão SQLAlchemy.

### Tarefa 5 — API de turmas, aulas e dashboard

- Mudou: endpoints autenticados de turmas, aulas extras, cancelamentos, filtros,
  paginação e dashboard; schemas Pydantic e serviço de adaptação entre ORM e
  domínio, com testes de integração.
- Verificado: `uv run pytest` (24 testes), `uv run ruff check .`,
  `git diff --check` e inspeção do OpenAPI passam.
- Para as próximas tarefas: os recursos financeiros estão em
  `app.api.financial` e `app.services.financial`; pagamentos, exportação e reset
  ainda precisam ser adicionados sem alterar a semântica do dashboard.

### Tarefa 6 — API de pagamentos, backup e reset

- Mudou: listagem/detalhe de pagamentos, confirmação e estorno idempotentes,
  exportação JSON isolada por usuário e reset transacional protegido por frase e
  senha; novos schemas e testes de integração foram incluídos.
- Verificado: `uv run pytest` (26 testes), `uv run ruff check .`,
  `git diff --check` e checagem dos endpoints OpenAPI passam.
- Para as próximas tarefas: a exportação `/api/v1/data/export` é a referência
  do formato web; a importação Expo deve ter versão explícita, prévia e
  idempotência sem expor hashes nem sessões.

### Tarefa 7 — Importação de dados do Expo

- Mudou: contrato `AulaPayExport` v1, exportador Expo somente-leitura, prévia e
  importação autenticada/idempotente, registro de importações, migração, fixture
  e testes de integração.
- Verificado: `uv run pytest` (28 testes), `uv run ruff check .`, geração SQL
  Alembic, `npm.cmd test` (30 testes) e `git diff --check` passam. Os aliases do
  contrato foram ajustados para eliminar os avisos Pydantic específicos.
- Para as próximas tarefas: o frontend deve enviar o JSON de `AulaPayExport` aos
  endpoints `/api/v1/data/import/preview` e `/api/v1/data/import`; o exportador
  móvel está em `src/storage.ts` como `exportAulaPayData`.

### Tarefa 8 — Base visual e autenticação Next.js

- Mudou: tokens e shell responsivo AulaPay, componentes básicos, cliente com
  cookies incluídos, login, cadastro, logout, `AuthGuard` e placeholders de
  rotas privadas; testes do cliente de API foram incluídos.
- Verificado: testes web (2), lint, typecheck, build e `git diff --check`
  passam.
- Para as próximas tarefas: páginas internas já usam `AuthGuard` + `Shell`; o
  cliente `apps/web/src/lib/api.ts` deve concentrar os novos contratos de API.

### Tarefa 9 — Dashboard web

- Mudou: dashboard responsivo conectado à API, cards de resumo e futuro,
  pagamentos, progresso, estados de loading/erro/vazio e formatação pt-BR;
  testes de componente foram adicionados.
- Verificado: testes web (6), lint, typecheck, build e `git diff --check`
  passam.
- Para as próximas tarefas: após mutações de turmas/aulas/pagamentos, as telas
  podem recarregar o dashboard; os tipos financeiros ficam em `lib/api.ts`.

### Tarefa 10 — Turmas e aulas no frontend

- Mudou: páginas funcionais de turmas e aulas, cadastro/edição/desativação,
  filtros, extras e cancelamento, além de contratos API e conversão segura de
  BRL para centavos com testes.
- Verificado: testes web (8), lint, typecheck, build e `git diff --check`
  passam.
- Para as próximas tarefas: `api.ts` contém os clientes de turmas/aulas e
  `finance.ts` centraliza formatação e conversão monetária; pagamentos e dados
  continuam isolados para a tarefa seguinte.

### Tarefa 11 — Pagamentos, importação e dados no frontend

- Mudou: página de pagamentos com detalhe/confirmação/estorno protegidos e página
  de dados com download, preview/importação JSON e reset reforçado; navegação e
  contratos de API foram ampliados.
- Verificado: testes web (8), lint, typecheck, build e `git diff --check`
  passam.
- Para as próximas tarefas: todos os fluxos de negócio já possuem UI; a etapa
  final deve focar em automação, E2E, operação e verificação integrada.

### Tarefa 12 — Qualidade, E2E e entrega operacional

- Mudou: CI GitHub Actions, cobertura Vitest, Playwright, readiness e logs JSON
  seguros na API, scripts de qualidade, Dockerfiles/Compose e documentação de
  operação, backup e restauração.
- Verificado: API (`pytest`, 28 testes; Ruff), web (Vitest, 8 testes; lint,
  typecheck e build) e Playwright (1 E2E) passam. A configuração Compose é
  válida; a construção de imagens não faz parte da validação atual por decisão
  do usuário.
- Para operação: consulte `docs/OPERATIONS.md`, copie `.env.example` para
  `.env` e configure segredos/infraestrutura antes de uma publicação externa.
