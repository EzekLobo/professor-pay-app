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

- [ ] **Tarefa 4 — Domínio financeiro e regras de paridade**
  - Escopo: portar cálculos de datas, quinzenas, valores, geração de aulas, edição protegida e desativação de turma para Python.
  - Aceitação: testes `pytest` equivalentes aos testes atuais passam, incluindo períodos recebidos preservados e valores sem `float`.
  - Depende de: 2.

- [ ] **Tarefa 5 — API de turmas, aulas e dashboard**
  - Escopo: criar endpoints autenticados de turmas, aulas extras, cancelamentos, dashboard e filtros; documentar OpenAPI.
  - Aceitação: testes de integração exercitam CRUD, filtros, cancelamentos, transações e isolamento por usuário; `/docs` mostra os endpoints.
  - Depende de: 3, 4.

- [ ] **Tarefa 6 — API de pagamentos, backup e reset**
  - Escopo: expor listagem/detalhe de pagamentos, confirmação e estorno idempotentes, exportação JSON e reset protegido.
  - Aceitação: totais e status são corretos; confirmação duplicada não duplica registros; reset afeta apenas o dono.
  - Depende de: 5.

- [ ] **Tarefa 7 — Importação de dados do Expo**
  - Escopo: criar formato JSON versionado, endpoint idempotente com prévia/relatório e exportador não destrutivo no app Expo conforme SDK 56.
  - Aceitação: um fixture de exportação importa turmas, aulas e confirmações uma única vez; arquivo inválido falha sem gravação parcial.
  - Depende de: 6.

- [ ] **Tarefa 8 — Base visual e autenticação Next.js**
  - Escopo: inicializar Next.js App Router, tokens visuais, componentes básicos, shell responsivo, cliente de API e telas de login/cadastro/logout.
  - Aceitação: `npm run lint`, `npm run typecheck` e `npm run build` passam; rotas privadas redirecionam usuários não autenticados.
  - Depende de: 1, 3.

- [ ] **Tarefa 9 — Dashboard web**
  - Escopo: implementar a página de resumo com cards, progresso, últimos/próximos pagamentos, estados de loading/erro/vazio e locale pt-BR.
  - Aceitação: a página consome `/dashboard`, é responsiva e tem testes de componente para os estados principais.
  - Depende de: 5, 8.

- [ ] **Tarefa 10 — Turmas e aulas no frontend**
  - Escopo: implementar listagem, formulários, edição/desativação de turmas, histórico, filtros, aulas extras e cancelamento.
  - Aceitação: fluxos mutam a API, atualizam o dashboard e apresentam erros de validação; build e testes passam.
  - Depende de: 5, 8, 9.

- [ ] **Tarefa 11 — Pagamentos, importação e dados no frontend**
  - Escopo: criar páginas de pagamentos, detalhe/confirmação/estorno, importação, exportação e reset com confirmações seguras.
  - Aceitação: os fluxos críticos são funcionais no navegador e não permitem duplicação acidental de ações.
  - Depende de: 6, 7, 10.

- [ ] **Tarefa 12 — Qualidade, E2E e entrega operacional**
  - Escopo: configurar CI, cobertura, Playwright, Dockerfiles de produção, logs, guia de backup/restauração e validação completa.
  - Aceitação: testes backend/frontend/E2E e builds passam; Compose sobe os serviços; documentação de operação existe.
  - Depende de: 7, 11.

## Log de handoff

> Cada tarefa concluída registra arquivos, verificações e interfaces para a
> próxima tarefa. O commit é feito pelo orquestrador após verificação independente.

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
