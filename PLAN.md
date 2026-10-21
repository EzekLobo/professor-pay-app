# Plano de Implementação — AulaPay Web

## Refatoração operacional (execução atual)

Objetivo: aproximar a web da experiência do aplicativo móvel, centralizando
extrato financeiro, agenda pedagógica, materiais, deveres, correções e contato
de responsáveis. A integração externa permanece somente leitura; commits usam
mensagens neutras e não citam o fornecedor externo.

- [x] R1 — Restaurar a base e o dashboard financeiro
  - Escopo: corrigir a referência quebrada na central pedagógica e transformar
    os cards de pagamento em extrato modal navegável por competência.
  - Aceitação: typecheck, testes e build passam; último/próximo pagamento abrem
    extrato com aulas, valores e navegação anterior/próximo.
  - Depende de: F4.
- [x] R2 — Agenda, aulas e materiais
  - Escopo: adicionar tipos, sincronização de agenda/aulas e fallback para abrir
    a aula externa quando não houver link de material.
  - Aceitação: aula anterior/próxima aparecem no resumo e detalhes mostram links
    de slides, roteiro, dever ou atalho externo.
  - Depende de: R1.
- [x] R3 — Turmas, alunos e responsáveis
  - Escopo: refatorar detalhes de turma, contatos locais de responsáveis,
    WhatsApp com mensagem editável e remoção de dados financeiros de alunos.
  - Aceitação: contato pode ser editado, mensagem é revisável e o WhatsApp abre
    com número normalizado; typecheck/build passam.
  - Depende de: R2.
- [x] R4 — Correções, dados e navegação
  - Escopo: integrar materiais/deveres à fila de correções, incluir novos dados
    no backup/importação e simplificar o shell das telas.
  - Aceitação: filtros, estados vazios, backup e importação cobrem os novos
    registros sem quebrar fluxos existentes.
  - Depende de: R3.
- [x] R5 — Verificação visual e entrega
  - Escopo: validar cada rota no navegador em desktop e viewport móvel, corrigir
    incoerências visuais e executar suíte final.
  - Aceitação: testes, lint, typecheck, build e smoke test navegável passam;
    commits e sincronização usam mensagens neutras.
  - Depende de: R4.

### Handoff R1

- Mudou: a central pedagógica deixou de depender de um vínculo financeiro
  inexistente; o resumo ganhou extrato modal para os pagamentos em destaque e
  relevantes, com normais/extras, aulas individuais e navegação entre períodos.
- Verificado: `npm.cmd run typecheck`, `npm.cmd run test` (10 testes) e
  `npm.cmd run build` passam.
- Próximo: adicionar agenda/materiais sem reintroduzir dados financeiros de
  alunos.

### Handoff R2

- Mudou: a sincronização passou a consultar agenda e aulas em modo leitura,
  normalizando datas, horários, títulos e links de slides, roteiro e atividade
  em uma coleção local; o resumo mostra a próxima aula e até três anteriores.
- Verificado: `npm.cmd run typecheck`, `npm.cmd run test` (10 testes),
  `npm.cmd run build` e `git diff --check` passam.
- Fallback: quando não houver link direto, a ação abre a aula/turma externa.

### Handoff R3

- Mudou: a central pedagógica agora trabalha só com dados de turma/aluno,
  preserva campos locais durante a sincronização e permite cadastrar nome,
  parentesco, telefone e observação do responsável.
- Mudou também: o contato abre uma mensagem editável antes do WhatsApp; números
  locais, com código do país e prefixo `00` são normalizados e números vazios
  não geram links.
- Verificado: `npm.cmd run typecheck`, `npm.cmd run test` (13 testes),
  `npm.cmd run build` e `git diff --check` passam.

### Handoff R4

- Mudou: a fila de correções agora oferece os materiais da aula; backups e
  importações preservam grupos, alunos, aulas pedagógicas e correções; a
  sincronização lê os contatos do responsável no perfil individual do aluno,
  sem persistir o payload bruto ou campos sensíveis.
- Verificado: `npm.cmd run typecheck`, `npm.cmd run test` (17 testes),
  `npm.cmd run lint`, `npm.cmd run build` e `git diff --check` passam.

### Handoff R5

- Mudou: a navegação foi centralizada no topo, sem barra lateral; o modal do
  aluno usa duas colunas no desktop e empilha no celular, com contatos do
  responsável somente para leitura e observação local editável.
- Verificado: validação visual publicada no navegador e suíte completa local;
  a rolagem fica restrita ao modal em telas pequenas.

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

## Reorganização de diretórios web

> A versão web será exposta diretamente na raiz por `frontend/` e `backend/`.
> O aplicativo Expo legado continua temporariamente na raiz para não interromper
> seus comandos e seus dados locais.

- [x] **Tarefa R1 — Mover aplicações para frontend e backend**
  - Escopo: mover `apps/web` para `frontend` e `apps/api` para `backend` com
    histórico Git, preservando os conteúdos e o banco SQLite ignorado.
  - Aceitação: as duas novas pastas existem na raiz, `apps/` deixa de conter as
    aplicações e não há arquivo de dados SQLite versionado.
  - Depende de: nenhuma.

- [x] **Tarefa R2 — Atualizar caminhos, scripts e automação**
  - Escopo: trocar todas as referências de `apps/web` e `apps/api` em manifests,
    Docker, CI, documentação e configurações de ferramenta.
  - Aceitação: scripts raiz, Compose e CI apontam somente para `frontend` e
    `backend`; não há referências funcionais antigas.
  - Depende de: R1.

- [x] **Tarefa R3 — Validar a estrutura reorganizada**
  - Escopo: executar testes, lint, tipos, builds e uma auditoria de caminhos;
    ajustar qualquer referência que tenha ficado quebrada.
  - Aceitação: backend, frontend, E2E e `docker compose config` passam, e a
    documentação explica a separação entre web e Expo legado.
  - Depende de: R2.

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

### Reorganização R1 — Mover aplicações

- Mudou: `apps/web` foi movido para `frontend/` e `apps/api` para `backend/` por
  renomes Git; o Expo legado foi preservado na raiz e `backend/data/.gitkeep`
  continua garantindo a pasta de dados.
- Verificado: 83 arquivos foram detectados como renomes e nenhum arquivo
  `*.sqlite3` está versionado.
- Para as próximas tarefas: atualize todos os caminhos de ferramentas e ignore
  `backend/.venv`, `frontend/.next`, `frontend/next-env.d.ts` e artefatos E2E.

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

## Migração para Vercel + Firebase

Objetivo: executar a aplicação web no Next.js hospedado na Vercel, usando
Firebase Authentication e Cloud Firestore diretamente no frontend. O FastAPI
permanece no repositório apenas como apoio para exportação/migração até a
validação final; não será usado pelo frontend em produção.

### Tarefa F1 — Fundação Firebase no frontend

- [x] Instalar o SDK web `firebase` e configurar variáveis `NEXT_PUBLIC_FIREBASE_*`.
- [x] Criar cliente Firebase isolado, provedor de autenticação e sincronização
      segura do usuário autenticado.
- [x] Migrar login, cadastro, logout e guarda de rotas para Firebase Auth,
      mantendo os contratos visuais atuais.
- Verificado: typecheck, Vitest (8 testes) e build web passam. O lint ficou
  pendente por uma instalação local incompleta do pacote `eslint/config`, sem
  relação com o código Firebase; deve ser repetido após reinstalar dependências.
- Nenhuma credencial de serviço ou chave privada foi adicionada ao repositório.

Handoff F1 → F2: `frontend/src/lib/firebase.ts` centraliza a inicialização e
`frontend/src/lib/firebase-auth.ts` expõe as operações de Auth. A camada de
dados pode usar `getFirebaseDb()` e manter o tipo `User` de `lib/api.ts` durante
a transição.

### Tarefa F2 — Repositórios Firestore e fluxos de negócio

- [x] Substituir o cliente REST por repositórios Firestore para perfil, turmas,
      aulas, pagamentos, dashboard, importação, exportação e reset.
- [x] Portar as regras financeiras puras do backend para o frontend e manter os
      formatos existentes das páginas para reduzir regressões.
- [x] Usar subcoleções por usuário (`users/{uid}/...`) e operações em lote para
      importações e exclusões.
- Verificado: typecheck, Vitest (8 testes) e build web passam; o cliente não
  monta mais URLs REST nem depende de `NEXT_PUBLIC_API_URL` em runtime.
- Observação: a validação contra um projeto Firebase real depende das variáveis
  do console e será feita na etapa F4.

Handoff F2 → F3: `frontend/src/lib/api.ts` contém a fachada compatível com as
telas e grava em `users/{uid}/classes`, `lessons` e `payments`. A etapa seguinte
deve publicar as regras Firestore, documentar índices/variáveis e tratar o
backend Python como legado de migração.

### Tarefa F3 — Segurança, migração e operação

- [x] Adicionar `firestore.rules`, índices necessários e testes/emulador quando
      disponíveis, restringindo cada documento ao próprio `request.auth.uid`.
- [x] Documentar a configuração do Firebase, variáveis da Vercel e procedimento
      de migração do SQLite legado sem versionar service account.
- [x] Marcar o FastAPI como legado/migração e remover sua dependência do caminho
      de execução web.
- Verificado: regras e configuração foram revisadas, documentação reproduzível
  em `docs/FIREBASE.md` e `git diff --check` passa. A publicação das regras no
  projeto Firebase é uma ação manual do operador.

Handoff F3 → F4: configure as variáveis Web no Vercel e publique `firestore.rules`
no projeto Firebase. Depois execute a suíte web e valide login, criação de
turma, geração de aulas, confirmação de pagamento e backup em ambiente real.

### Tarefa F4 — Cutover e validação final

- [x] Executar a suíte web disponível (Vitest, typecheck, build) e validar que o
      frontend não monta chamadas HTTP para o backend.
- [x] Auditar variáveis, regras e caminhos de deploy da Vercel; registrar
      pendências que dependam de configuração manual no console Firebase.
- [x] Atualizar este plano e a documentação com o estado da migração.
- Pendente manual: cadastrar as variáveis `NEXT_PUBLIC_FIREBASE_*`, habilitar
  E-mail/senha no Firebase, publicar `firestore.rules` e executar um smoke test
  autenticado. O lint local não pôde ser repetido porque a instalação atual de
  `eslint` está incompleta (`eslint/config` ausente); reinstale as dependências
  antes do próximo release.
- Estado: implementação do código concluída; o backend Python está fora do
  caminho web, mas permanece como ferramenta de migração até a conferência dos
  dados no projeto Firebase.

### R6 - Centralizacao de turmas e acompanhamento pedagogico

- Concluido: a tela pedagogica duplicada saiu da navegacao; a rota antiga
  redireciona para Turmas.
- Concluido: cada turma abre em acordeao com alunos, progresso, contato do
  responsavel, WhatsApp, perfil, aula anterior/proxima e materiais.
- Concluido: o estilo de barra lateral responsiva foi restaurado, mantendo o
  titulo centralizado no cabecalho.
- Verificado: typecheck, lint, testes, build e diff check passam; o deploy
  final foi publicado e o acordeao, modal de sincronizacao e redirecionamento
  da rota antiga foram conferidos no navegador.

### R7 - Materiais no contexto da aula

- Concluido: a sincronizacao passou a identificar o curso de cada turma e
  consultar o catalogo de aulas, materiais e tarefas de casa associado a cada
  aula agendada.
- Concluido: apresentacao, roteiro e atividade de casa agora preenchem os
  links exibidos nos cards de aula anterior e proxima; a URL da aula aponta
  para o detalhe correto do curso quando o catalogo estiver disponivel.
- Concluido: endpoints e comportamento foram registrados em
  `docs/kodland-endpoints.md`, com teste unitario de uma aula realista.
- Verificado: typecheck, testes, lint, build e `git diff --check` passam; o
  commit `3c251a4` foi sincronizado com `master` e o deploy de producao ficou
  `Ready` no Vercel.
- Pendente operacional: executar uma nova sincronizacao autenticada para
  substituir o snapshot antigo e gravar os links no Firestore.

### R8 - Importação segura de cursos sob demanda

- [x] R8.1 — Contrato e importador seguro
  - Escopo: criar um endpoint autenticado para importar um curso por ID a partir
    da fonte oficial, com catálogo permitido, validação estrita, limite de
    requisições concorrentes e sem persistir credenciais.
  - Aceitação: requisições sem autenticação, curso inválido ou URL fora da lista
    permitida falham; a resposta contém apenas aulas e links HTTPS permitidos.
  - Depende de: R7.
- [x] R8.2 — Persistência isolada e cliente
  - Escopo: salvar cursos importados e suas aulas apenas no namespace Firebase
    do usuário atual, preservando turmas/aulas sincronizadas existentes.
  - Aceitação: importar o mesmo curso atualiza somente registros da própria
    origem; dados de turmas não são removidos; typecheck e testes passam.
  - Depende de: R8.1.
- [x] R8.3 — Seleção e acompanhamento na tela de Aulas
  - Escopo: adicionar modal “Importar curso” com catálogo Roblox, Scratch,
    Python e outro ID validado; mostrar progresso, resultado e atualização.
  - Aceitação: usuário escolhe um curso, informa credenciais somente no envio e
    visualiza as aulas/materiais importados por curso.
  - Depende de: R8.2.
- [x] R8.4 — Verificação, publicação e validação visual
  - Escopo: executar suíte completa, revisar a segurança no diff, publicar e
    validar a interface no navegador sem usar credenciais do usuário.
  - Aceitação: typecheck, testes, lint e build passam; deploy fica pronto; o
    modal e os estados de importação aparecem corretamente.
  - Depende de: R8.3.

### R9 - Modal contextual de turma na grade

- [x] Alternar o modal de uma turma entre as abas Aula e Alunos.
  - Escopo: manter os materiais e links da aula na primeira aba e mostrar, na segunda, apenas alunos ativos da turma em ranking pelos pontos do progresso sincronizado.
  - Aceitacao: o seletor nao aparece para disponibilidade; alunos inativos/removidos nao entram no ranking; empates sao ordenados alfabeticamente.

### R10 - Sincronização operacional de aulas extras

- [x] R10.1 — Consolidar agenda, conclusão e reagendamento de extras
  - Escopo: conciliar os dados da agenda do professor e da agenda do aluno sem
    permitir que uma ocorrência agendada sobrescreva a confirmação de conclusão.
    Uma gravação disponível será uma evidência complementar de conclusão quando
    o fornecedor não retornar um estado explícito.
  - Aceitação: uma extra aprovada continua não financeira; uma extra concluída
    entra como concluída; um reagendamento altera data/hora da grade e preserva
    o estado financeiro correto; testes unitários cobrem a mesclagem.
  - Depende de: R9.
- [x] R10.2 — Atualizar a grade pela sincronização autenticada
  - Escopo: fazer o botão da grade acionar a sincronização existente usando a
    credencial efêmera já fornecida pelo usuário e recarregar resumo, extras e
    disponibilidade ao concluir.
  - Aceitação: o botão informa progresso/erro, não persiste credenciais e uma
    sincronização bem-sucedida reflete os dados locais atualizados sem perder a
    semana selecionada.
  - Depende de: R10.1.
- [x] R10.3 — Comunicar estados de extras e validar a entrega
  - Escopo: exibir na grade o estado operacional da aula extra e cobrir a regra
    financeira e a ação de atualização com testes de interface/dados.
  - Aceitação: estados concluída, reagendada e pendente são distinguíveis; aulas
    não concluídas não entram no extrato; typecheck, testes, lint e build passam.
  - Depende de: R10.2.

#### Handoff R10.1

- Mudou: extras são conciliadas por aluno e identificador externo. A agenda do
  professor atualiza data e horário, enquanto uma confirmação explícita de
  conclusão prevalece; gravação somente confirma a aula quando não há estado
  explícito.
- Verificado: teste unitário da sincronização (7 testes), typecheck e diff check
  passam.
- Próximo: expor uma atualização autenticada da grade sem reter credenciais e
  comunicar o estado operacional das extras.

#### Handoff R10.2

- Mudou: “Atualizar grade” abre um modal com credenciais efêmeras, aciona a
  sincronização e recarrega resumo, extras e disponibilidade, preservando a
  semana já selecionada e comunicando sucesso ou erro.
- Verificado: typecheck, teste financeiro unitário e diff check passam.
- Próximo: distinguir visualmente extras concluídas, reagendadas e pendentes e
  finalizar a validação de regras financeiras.

#### Handoff R10.3

- Mudou: a grade diferencia extras concluídas, reagendadas, agendadas e
  pendentes. O status exibido é derivado de forma conservadora: conclusão
  explícita tem precedência e aprovação não é tratada como aula dada.
- Verificado: typecheck, Vitest (53 testes), lint, build e diff check passam.
- Operação: a atualização da grade exige credenciais no modal a cada execução;
  elas não são persistidas.

#### Handoff R9

- Mudou: o modal aberto por uma aula da grade ganhou o seletor Aula/Alunos. A segunda opcao lista apenas os alunos ativos da turma selecionada, em ordem decrescente de pontos, com desempate alfabetico e destaque para as tres primeiras posicoes.
- Preservado: disponibilidade continua com seu modal proprio, sem o seletor; materiais, links e o fallback de escolha de aula permanecem na opcao Aula.
- Verificado: `npm.cmd run typecheck`, Vitest (41 testes), `npm.cmd run lint`, `npm.cmd run build`, `git diff --check` e Playwright/Chromium (2 testes de rota privada) passam localmente.
- Pendente operacional: uma sessao Firebase autenticada e necessaria para a conferencia visual do ranking com os dados reais apos a proxima sincronizacao.

#### Handoff R8.1

- Mudou: `POST /api/courses/import` autentica o usuário, aceita apenas curso
  permitido e credenciais efêmeras, limita 80 aulas e quatro consultas de
  materiais simultâneas. Links retornados usam HTTPS e hosts permitidos.
- Catálogo: Roblox (1192) e Scratch (1183) são confirmados; Python depende do
  ID oficial em `COURSE_IMPORT_CATALOG`, sem usar valor inventado.
- Verificado: typecheck, lint, `course-import.test.ts` (5 testes) e diff check.

#### Handoff R8.2

- Mudou: `courseImportApi` persiste cursos em `imported_courses` e aulas em
  `imported_course_lessons`, sempre abaixo do usuário autenticado.
- Reimportação substitui somente itens `source: course_import` do curso alvo;
  `kodland_lessons` e os dados sincronizados não são alterados.
- Verificado: typecheck, suíte Vitest (32 testes) e diff check.

#### Handoff R8.3

- Mudou: a tela Aulas ganhou modal de importação com Roblox e Scratch, campos
  temporários de credenciais, feedback de progresso/erro e cursos importados em
  acordeão com os materiais disponíveis.
- Segurança: Python aparece desabilitado até um ID oficial ser configurado; não
  há campo de URL livre ou ID arbitrário no cliente.
- Verificado: typecheck, suíte Vitest (32 testes), lint, build e diff check.

#### Handoff R8.4

- Verificado: typecheck, suíte Vitest (32 testes), lint, build e diff check
  completos passam. O endpoint de importação integra a rota de produção sem
  depender de URL livre ou de persistência de credenciais.
- Publicação e validação visual: conferir modal e estados na tela Aulas após o
  deploy; a importação efetiva requer credenciais próprias do usuário no envio.

### R11 - Tutorial guiado "Como usar"

- [x] R11.1 - Infraestrutura reutilizável do tutorial
  - Escopo: criar estado client-side, overlay acessível, roteiros versionados e persistência por usuário em `users/{uid}/tutorials/{roteiroId}`.
  - Aceitação: o roteiro abre manualmente e automaticamente uma vez por versão; fechar, pular e concluir registram o progresso; Escape, Tab e restauração de foco funcionam.
- [x] R11.2 - Roteiros e alvos das rotas privadas
  - Escopo: integrar o botão global "Como usar" e roteiros essenciais em Resumo, Pagamentos, Turmas, Aulas, Correções e Dados.
  - Aceitação: cada rota possui introdução, 3 a 5 orientações e conclusão; elementos indisponíveis são ignorados sem interromper o guia.
  - Depende de: R11.1.
- [x] R11.3 - Testes e verificação da entrega
  - Escopo: cobrir definições, progresso e transições; executar as validações de frontend.
  - Aceitação: typecheck, lint, Vitest, build e diff check passam; o roteiro manual é verificável no navegador.
  - Depende de: R11.2.

#### Handoff R11

- Mudou: as seis rotas privadas têm o botão global “Como usar” e roteiros essenciais versionados, com spotlight, navegação por teclado e retorno de foco ao acionador.
- Persistência: o progresso é isolado em `users/{uid}/tutorials/{roteiroId}`; fechar, pular ou concluir registra a versão, enquanto sair da rota não marca o roteiro como visto.
- Verificado: Vitest (64 testes), typecheck, lint, build e diff check passam. A conferência visual completa ainda exige uma sessão Firebase autenticada.

### R12 - NexusClass como produto e portfólio

> Estado: em execução. A solicitação explícita de implementação foi recebida em 09/10/2026.

- [ ] R12.1 - Landing e demonstração pública isolada
  - Escopo: substituir `/` por landing com acesso a `/demo`; criar navegação pública completa com dados fictícios, CRUD local no navegador e restauração da base inicial.
  - Segurança: a demo não usa Firebase, dados reais, links Kodland, importação, sincronização, backup ou rotas `/api/*`.
  - Aceitação: visitante sem autenticação navega e altera apenas sua cópia local; restaurar remove as alterações; nenhuma chamada Firebase ou Kodland ocorre.

- [ ] R12.2 - Cadastro manual de professores autorizados
  - Escopo: criar Alunos e ampliar Turmas para cadastro manual de alunos, turmas, recorrência, duração e valor/hora; gerar aulas futuras e manter dados sincronizados separados.
  - Modelo: `users/{uid}/students/{studentId}`; turmas manuais usam `source: "manual"` e `student_ids`; o valor é por turma e uma turma pode ter vários alunos.
  - Aceitação: CRUD de alunos e turmas funciona; alteração de recorrência recalcula apenas aulas ainda não recebidas; dados Kodland não são sobrescritos.
  - Depende de: R12.1 para o contrato comum de dados e componentes de apresentação.

- [ ] R12.3 - Segurança, documentação e validação
  - Escopo: manter criação de contas exclusivamente no Firebase Console; atualizar landing, login e documentação; cobrir adaptadores, agenda, demo e rotas públicas/privadas.
  - Aceitação: regras Firestore continuam isolando `users/{uid}`; demo permanece local e somente sintética; Vitest, typecheck, lint, build e Playwright passam.
  - Depende de: R12.1 e R12.2.

#### Execução R12

- [x] R12.1a - Contrato de dados e adaptador local da demo
  - Escopo: definir o contrato comum para alunos, turmas, aulas, pagamentos e indicadores; criar cenário fictício versionado e adaptador `localStorage`, sem dependência de Firebase, rotas API ou Kodland.
  - Aceitação: o adaptador executa CRUD, preserva alterações no navegador, restaura o cenário inicial e é coberto por Vitest.
  - Depende de: nenhuma.

- [ ] R12.1b - Landing e experiência pública de demonstração
  - Escopo: substituir a raiz por landing pública e criar `/demo` com shell próprio, aviso persistente, navegação e CRUD local dos dados sintéticos; áreas externas aparecem somente como conteúdo visual seguro.
  - Aceitação: visitante sem autenticação usa a demo sem chamadas a Firebase, Kodland ou `/api`; CTA, restauração e navegação são verificáveis em Playwright.
  - Depende de: R12.1a.

- [ ] R12.2a - Cadastro privado de alunos e adaptador Firestore
  - Escopo: implementar o adaptador privado para `users/{uid}/students`, CRUD com desativação e a rota privada Alunos, preservando a compatibilidade das coleções atuais.
  - Aceitação: alunos ativos/inativos, edição, pesquisa e contagem de vínculos funcionam para usuário autenticado; testes cobrem o contrato compartilhado.
  - Depende de: R12.1a.

- [ ] R12.2b - Turmas manuais, agenda e competências financeiras
  - Escopo: criar/editar/desativar turmas manuais separadas das sincronizadas, associar alunos e gerar ou recalcular somente aulas futuras ainda não recebidas.
  - Aceitação: valor permanece por turma; vínculos não sobrescrevem dados Kodland; alterações preservam competências recebidas, verificadas por testes.
  - Depende de: R12.2a.

- [ ] R12.3a - Reforço de bloqueios, documentação e validação final
  - Escopo: revisar os caminhos demo/privado, bloquear ações externas no modo público, atualizar login e documentação operacional, e executar as suítes finais.
  - Aceitação: regras Firestore seguem isoladas, nenhuma criação pública de conta existe, e Vitest, typecheck, lint, build e Playwright passam.
  - Depende de: R12.1b e R12.2b.

#### Handoff R12.1a

- Mudou: `TeachingDataAdapter` estabelece o contrato assíncrono comum para alunos, turmas, aulas, pagamentos e indicadores. `LocalDemoDataAdapter` usa somente `localStorage`, possui cenário fictício versionado e restauração explícita, sem importar Firebase, Kodland ou módulos de API.
- Verificado: Vitest (79 testes), typecheck e `git diff --check` passam. A importação em SSR é segura e usa cópia efêmera quando o navegador não disponibiliza armazenamento.
- Próximo: R12.1b deve consumir o adaptador por seus métodos assíncronos e manter qualquer interface de demo fora do shell, do Firebase e das rotas privadas.

#### Decisões R12

- Contas privadas continuam sob autorização manual do administrador no Firebase Console; não haverá auto cadastro, convite ou painel de aprovação nesta fase.
- A demo é pública e interativa, mas usa somente `localStorage` por navegador; as alterações não são compartilhadas nem enviadas ao servidor.
- A demo permite CRUD manual de alunos, turmas, agenda e pagamentos fictícios; recursos externos aparecem somente como demonstração visual.

### R13 - Confiabilidade da sincronização Kodland

> Estado: planejado. Origem: falha sem detalhe ao sincronizar uma segunda conta.

#### Diagnóstico confirmado

- A mensagem genérica pode vir de resposta não JSON, falha de rede, leitura ou
  gravação no Firestore e até do recarregamento da tela: o `catch` atual cobre
  todas essas etapas. O ponto exato ainda exige diagnóstico.
- A rota `POST /api/kodland/sync` reúne turmas, alunos, agendas, extras,
  correções, aulas e enriquecimento de materiais no mesmo ciclo. Ela contém
  diversos blocos concorrentes e não declara `maxDuration`.
- A hipótese principal é expiração ou interrupção da função em produção para
  contas com volume maior. Deve ser confirmada pelos logs da Vercel antes de
  atribuir a causa a credenciais ou à Kodland.
- A coleta de perfis e agendas por aluno e de correções por aula também cresce
  com o volume. Um `getOptional` que falha retorna `null`, mas algumas flags de
  disponibilidade comparam com `undefined`; isso pode apagar dados anteriores.

- [x] R13.1 - Diagnóstico observável e seguro
  - Escopo: adicionar um identificador de sincronização; registrar no servidor
    etapa, duração, quantidade de turmas/alunos/aulas e falha sanitizada;
    preservar o código HTTP e o `content-type` no cliente quando a resposta
    não for JSON.
  - Interface: substituir o aviso genérico por uma mensagem acionável (ex.:
    sessão expirada, indisponibilidade temporária, limite excedido), sem expor
    senha, token, resposta bruta ou dados de alunos.
  - Operação: consultar os logs Vercel pelo identificador e horário da falha
    antes de alterar limites de produção.
  - Aceitação: uma falha simulada de rede, HTML/504 e 4xx/5xx mostra uma causa
    distinguível para a pessoa e dados suficientes para suporte.

- [x] R13.2 - Separar sincronização essencial de enriquecimento pesado
  - Escopo: manter no caminho inicial somente autenticação Kodland, turmas,
    alunos, grade, agenda e dados financeiros indispensáveis; transferir a
    coleta extensa de materiais, tarefas, detalhes de catálogo, perfis e
    correções para carga sob demanda ou uma atualização explícita. Corrigir as
    flags de disponibilidade para preservar dados antigos quando a fonte falhar.
  - Identidade: manter no documento o ID original da aula Kodland além do ID
    composto turma+aula usado no Firestore; uma consulta sob demanda não pode
    usar o ID composto como parâmetro da API externa.
  - Preservação: dados já sincronizados continuam disponíveis se o
    enriquecimento posterior falhar; nenhuma coleção de outro usuário é
    sobrescrita.
  - Aceitação: uma conta com muitas turmas conclui a sincronização essencial
    sem precisar aguardar os materiais de todas as aulas; a tela Aulas informa
    quando um material ainda precisa ser carregado.
  - Depende de: R13.1 para medir o ganho e identificar a etapa crítica.

- [x] R13.3 - Limites, retomada e tempo de execução
  - Escopo: aplicar concorrência limitada por etapa, timeout explícito para
    chamadas Kodland, repetição curta apenas para falhas transitórias e
    cancelamento limpo ao exceder o orçamento de tempo.
  - Infraestrutura: declarar `maxDuration` na rota Next.js somente após
    confirmar plano e limite efetivo da Vercel; usar um valor compatível com o
    plano, documentado junto ao motivo. Aumentar o limite não substitui R13.2.
  - Aceitação: 429/5xx temporário pode ser retomado sem duplicar dados; timeout
    retorna mensagem compreensível e não deixa uma sincronização parcial
    marcada como concluída.
  - Depende de: R13.1 e R13.2.

- [x] R13.4 - Cobertura e validação de volume
  - Escopo: testes de parse de respostas não JSON, erros HTTP, lotes grandes,
    concorrência e isolamento por usuário; teste integrado controlado contra
    uma conta autorizada com volume maior.
  - Aceitação: typecheck, lint, Vitest, build e verificações de isolamento
    passam; logs da Vercel comprovam duração e conclusão do cenário de volume.
  - Depende de: R13.1, R13.2 e R13.3.

#### Handoff R13.1

- `POST /api/kodland/sync` inclui `x-sync-id`, código seguro e logs de etapa,
  duração e contagens, sem credenciais, tokens ou dados pessoais.
- O cliente distingue HTML/JSON inválido, falha de rede, HTTP e leitura ou
  gravação no Firestore. Salvar credenciais no navegador é opcional e não
  transforma uma sincronização concluída em falha.
- Rechecado pelo orquestrador: 19 testes focados, typecheck, lint e diff check
  passam. O diagnóstico por logs de produção permanece pendente porque o
  projeto não está vinculado localmente ao CLI Vercel e o navegador conectado
  não pôde abrir o painel.

#### Handoff R13.2–R13.4

- A sincronização essencial importa turmas, alunos, agenda, disponibilidade e
  identificação das aulas. Materiais, contatos de responsáveis e correções são
  atualizações explícitas e não ampliam o caminho inicial.
- Cada aula mantém `source_lesson_id`, distinto do ID composto Firestore. O
  modal consulta materiais somente para a aula aberta e preserva os links já
  carregados se a nova consulta falhar.
- As chamadas à Kodland têm timeout por requisição, uma repetição curta somente
  para falhas transitórias e concorrência limitada. A rota encerra com erro
  rastreável ao atingir o orçamento de tempo.
- A gravação usa o UID capturado no início, marca `running`/`complete`/`failed`
  em `sync_status/kodland`, grava dados novos antes de excluir obsoletos e não
  remove agenda ou disponibilidade quando a respectiva origem está indisponível.
- Validação local concluída: typecheck, lint, 75 testes Vitest, build e diff
  check. A prova operacional com uma conta maior e os logs da Vercel seguem
  pendentes de acesso autorizado; `maxDuration` não foi declarado porque o
  limite efetivo do projeto Vercel não foi confirmado.

### R14 - Calendário de feriados e regra financeira automática

> Estado: em execução. Feriados nacionais são derivados no cliente por data em
> `America/Sao_Paulo`; feriados personalizados são privados por usuário. A
> agenda Kodland não será alterada: o calendário afeta a identificação visual e
> a previsão financeira das competências ainda não recebidas.

- [x] R14.1 - Domínio de feriados e resolução financeira
  - Escopo: criar o catálogo de feriados nacionais e a persistência de feriados
    personalizados; resolver o status financeiro efetivo por aula sem gravar
    automaticamente sobre os dados sincronizados.
  - Regra: uma exceção explícita da aula (`BILLABLE`, `HOLIDAY`,
    `SUBSTITUTION` ou `CANCELED`) prevalece sobre o calendário. Status vazio
    significa ausência de exceção. Competências recebidas não são recalculadas.
  - Aceitação: testes cobrem feriados fixos e móveis, fuso de São Paulo,
    isolamento por usuário, `BILLABLE` em feriado e preservação de competência
    recebida.
  - Depende de: nenhuma.

- [x] R14.2 - Calendário e sinalização da grade
  - Escopo: adicionar o botão de calendário ao cabeçalho e um modal mensal que
    mostra nacionais e personalizados, permite cadastrar/remover somente os
    personalizados e sinaliza feriados na grade semanal.
  - Aceitação: o botão é acessível; nacionais são somente leitura;
    personalizados podem ser criados/removidos; uma aula afetada permanece na
    grade com o rótulo Feriado.
  - Depende de: R14.1.

- [x] R14.3 - Extrato, documentação e validação final
  - Escopo: integrar o status derivado ao resumo e a Pagamentos, migrar o
    seletor "Contabilizar" para `BILLABLE`, documentar o modelo Firestore e
    executar as validações completas.
  - Aceitação: aulas em feriado não entram em competências abertas; uma
    reposição explicitamente contabilizável entra no total; competências
    recebidas seguem imutáveis; typecheck, lint, Vitest, build e diff check
    passam.
  - Depende de: R14.1, R14.2.

#### Handoff R14

##### R14.1

- Mudou: `frontend/src/lib/holidays.ts` gera o calendário nacional e resolve o
  status financeiro sem regravar dados da Kodland. `holidaysApi` persiste apenas
  feriados personalizados sob o usuário autenticado.
- Verificado: `npm.cmd test -- holidays`, `npm.cmd run typecheck` e
  `git diff --check` passam.
- Para a próxima tarefa: a interface deve consumir `holidaysApi` e a propriedade
  `DashboardLesson.holiday`; `BILLABLE` é a exceção explícita para contabilizar
  uma aula que coincida com feriado.

##### R14.2

- Mudou: o cabeçalho ganhou o atalho acessível Feriados e o modal mensal para
  visualizar nacionais, cadastrar/remover personalizados. A grade destaca o
  dia e as ocorrências afetadas sem alterar a agenda sincronizada.
- Verificado: typecheck, teste focado de feriados e diff check passam; lint
  focado dos arquivos alterados passa.
- Para a próxima tarefa: integrar o seletor financeiro ao estado explícito
  `BILLABLE` e conferir o cálculo do extrato com o status derivado.

##### R14.3

- Mudou: o extrato usa `BILLABLE` para contabilizar explicitamente uma aula em
  feriado e mantém “Usar calendário” para remover a exceção. A documentação
  descreve a subcoleção privada de feriados.
- Verificado: typecheck, testes de API, build e diff check passam. O lint
  completo permanece bloqueado por mudança local não relacionada em
  `frontend/src/app/demo/page.tsx`, que acessa `ref.current` durante render.

### R15 - Turmas próprias e financeiro configurável

> Solicitação de 15/10/2026. Contas continuam criadas pelo administrador. O
> mesmo usuário pode ter turmas próprias e turmas Kodland. A demonstração usa
> somente dados fictícios locais. Alterações de tarifa/agenda afetam apenas
> encontros futuros; pagamentos recebidos guardam extrato fechado.

- [x] R15.1 - Domínio de recorrência, tarifas e pagamentos
  - Escopo: modelar horários semanais múltiplos, ocorrências estáveis por
    turma/horário/data, tarifa padrão e exceção por turma com vigência temporal,
    dia de recebimento por turma no mês seguinte (1–31, ajustado ao último dia)
    e snapshot de pagamentos recebidos. Preservar dados legados: R$ 30/h da
    Kodland até configuração, tarifas de turmas locais existentes e datas de
    pagamento já registradas. Não gravar infinitas aulas futuras.
  - Aceitação: testes puros cobrem recorrência sem duplicação, centavos por
    aula, horários em São Paulo, mudança de tarifa apenas futura, vencimento
    em meses curtos, mistura de fontes, feriados e recebidos imutáveis;
    typecheck passa.
  - Depende de: nenhuma.

- [x] R15.2 - Persistência privada, turmas e alunos manuais
  - Escopo: CRUD Firestore de alunos/turmas próprios, vários horários,
    valor padrão ou específico, dia de recebimento e exceções por ocorrência;
    adaptar Turmas e o resumo para exibir ambas as origens, mantendo os IDs
    Kodland estáveis e a sincronização isolada. Conta manual não exige senha
    Kodland. Edições de agenda/tarifa só valem para encontros futuros.
  - Aceitação: cadastro, edição e desativação sobrevivem a reload;
    grade, contagens e extrato exibem manual + Kodland; sincronização não
    sobrescreve o manual; testes focados e typecheck passam.
  - Depende de: R15.1.

- [x] R15.3 - Aulas, atividades e correções próprias
  - Escopo: cadastrar para turmas próprias conteúdos, roteiros, links, tarefas,
    entrega em texto/link, feedback e status pendente/concluído; mostrar nas
    telas Aulas e Correções com ações locais e sem links obrigatórios Kodland.
    Sem upload ou hospedagem de arquivos.
  - Aceitação: professor sem Kodland administra aula e corrige atividade;
    turma mista preserva ações da Kodland; filtros/contagens e testes passam.
  - Depende de: R15.2.

- [x] R15.4a - Backup e migração de pagamentos legados
  - Escopo: exportar/importar/restaurar todos os novos registros e snapshots;
    aceitar backups v1, migrar no primeiro acesso sem duplicar aulas locais
    antigas e congelar os recibos legados pelo valor então exibido. Usar lotes
    de escrita para evitar o limite Firestore e preservar importação idempotente.
  - Aceitação: testes cobrem restauração antiga/nova, reset e recibo legado
    congelado; typecheck, lint e diff check passam.
  - Depende de: R15.1, R15.2 e R15.3.

- [x] R15.4b - Demonstração, documentação e verificação final
  - Escopo: integrar cadastro e gestão manual à demo local com a mesma
    interface e cálculo da área privada; atualizar tutoriais, docs e estado
    do projeto; conferir navegação/estado visual nas duas dimensões.
  - Aceitação: demo sem chamadas Firebase/Kodland, testes, lint, typecheck,
    build e smoke navegável passam; todos os caminhos manuais são utilizáveis.
  - Depende de: R15.4a.

#### Handoff R15

> Registrar aqui uma entrada curta por tarefa após verificação e commit.

##### R15.1

- Mudou: `teaching-finance.ts` gera ocorrências por horário com ID estável,
  resolve tarifas com vigência local, calcula centavos por aula e vencimentos
  configuráveis; `api.ts` integra o domínio ao dashboard e grava snapshots para
  novos recebimentos.
- Verificado pelo orquestrador: 43 testes focados, typecheck e diff check passam.
- Próximo: R15.2 deve persistir `schedule_slots`, `rate_history`,
  `payment_day` e o padrão por conta; mudanças no mesmo dia gravam
  `effective_from_local` usando `saoPauloLocalTimestamp()`. Recibos anteriores
  continuam sem snapshot até R15.4.

##### R15.2

- Mudou: coleções privadas `manual_students`, `manual_classes`,
  `teaching_settings` e `kodland_class_settings`; Turmas cadastra alunos,
  horários, tarifas e vencimento. Resumo/grade/competências somam fontes
  manuais e sincronizadas sem gravar escolhas locais nos registros Kodland.
- Verificado pelo orquestrador: 46 testes focados, typecheck, lint, build e
  diff check passam. UI autenticada Firestore ainda precisa smoke visual.
- Próximo: R15.3 deve incluir atividades/correções manuais nas métricas e usar
  os IDs de ocorrência estáveis para vincular conteúdo, preservando eventos
  de histórico e não exigindo `correction_url`.

##### R15.3

- Mudou: coleções privadas `manual_lesson_content` e `manual_activities`;
  Aulas próprias cadastra conteúdo, roteiro, links e atividades por aluno;
  Correções mostra entregas próprias e conclui com feedback; Resumo agrega
  pendências manuais e Kodland.
- Verificado pelo orquestrador: 40 testes focados, typecheck, lint, build e
  diff check passam.
- Próximo: R15.4 inclui esses registros em backup e demonstração e faz
  migração/backfill de recibos legados. Smoke visual autenticado ainda pendente.

##### R15.4a

- Mudou: backup v2 inclui turmas, alunos, aulas, atividades, ajustes e recibos;
  importação aceita v1/v2 em lotes idempotentes. Recibos legados recebidos
  ganham snapshot no primeiro acesso sem alterar os que já estavam fechados.
- Verificado pelo orquestrador: 42 testes focados, typecheck, lint, build e
  diff check passam.
- Próximo: R15.4b integra a mesma gestão manual à demonstração local e fecha
  documentação e verificação geral.

##### R15.4b

- Mudou: a demonstração reutiliza as telas privadas de Turmas, Aulas e
  Correções com adaptador local, guarda cadastros, atividades e extratos
  fictícios no navegador e preserva esses registros após a virada do dia.
  README, tutorial e estado do projeto foram atualizados.
- Verificado pelo orquestrador: 125 testes unitários, typecheck, lint, build,
  diff check e smoke Chromium do fluxo visitante passam; o smoke confirmou
  ausência de chamadas a Firestore/Kodland. Smoke autenticado em Firestore
  não foi executado sem conta de teste.
- Próximo: validar a área privada com conta de teste antes de publicar.

### R16 - Grupos de turmas e tela unificada

> Solicitação de 16/10/2026. A tela terá somente os blocos “Turmas Kodland”
> (virtual, alimentado pela sincronização) e “Turmas pessoais” (organizadas
> em grupos criados pelo professor). Novas turmas pessoais exigem grupo;
> turmas pessoais antigas sem grupo ficam visíveis em “Sem grupo” até serem
> movidas. Tarifa e dia de recebimento ficam na configuração de cada turma.

- [x] R16.1 - Domínio, persistência e compatibilidade de grupos pessoais
  - Escopo: criar `manual_class_groups`; adicionar `group_id` opcional aos
    registros pessoais legados e obrigatório para os novos; CRUD com proteção
    contra exclusão de grupo que ainda tenha turmas; expor os métodos nos
    adaptadores privado e de demonstração. Incluir grupos em backup, importação
    e reset, aceitando backups v1/v2 sem grupos. “Turmas Kodland” continua um
    agrupamento virtual, sem novo registro persistido.
  - Aceitação: testes cobrem criação/renomeação/ordem/desativação, bloqueio de
    exclusão com turma, turma legada sem grupo, backup antigo/novo e cálculo
    financeiro inalterado; typecheck passa.
  - Depende de: R15.4b.

- [x] R16.2 - Fluxo de cadastro e interface de turmas agrupadas
  - Escopo: substituir os painéis atuais por “Turmas Kodland” e “Turmas
    pessoais”; incorporar a configuração de tarifa/dia de recebimento em cada
    turma Kodland; renderizar grupos pessoais como acordeões e “Sem grupo” para
    legado. Remover o painel “Suas turmas”, o painel separado de valores Kodland
    e o botão principal de aluno. O modal de nova turma permite selecionar/criar
    grupo e cadastrar aluno sem sair dele; edição permite mover turma.
  - Aceitação: não há configurações duplicadas; novas turmas exigem grupo;
    ações funcionam no desktop e no celular sem corte; Kodland sincronizada não
    altera grupos pessoais; testes de componentes e typecheck passam.
  - Depende de: R16.1.

- [x] R16.3 - Demonstração, tutorial, documentação e verificação final
  - Escopo: espelhar grupos pessoais no estado local da demo, criar cenário
    fictício com grupo pessoal, persistir/restaurar grupos no navegador e
    atualizar tutorial, README e memória do projeto. Cobrir o fluxo navegável
    de criar grupo + turma + aluno sem chamadas Firebase/Kodland.
  - Aceitação: demo continua isolada, backup preserva grupos, suíte completa,
    lint, typecheck, build, diff check e smoke Chromium passam.
  - Depende de: R16.2.

#### Handoff R16

> Registrar uma entrada curta por tarefa após verificação e commit.

##### R16.1

- Mudou: `manual_class_groups` é privado por conta; novas turmas exigem
  `group_id`, enquanto registros legados sem esse campo continuam válidos.
  Adaptadores privado/demo, backup, importação e reset preservam grupos;
  a exclusão é recusada quando o grupo ainda contém turma.
- Verificado pelo orquestrador: 13 testes focados, typecheck e diff check
  passam. O cálculo financeiro continua independente de grupo.
- Próximo: R16.2 deve fornecer seleção/criação de grupo antes de salvar uma
  nova turma e apresentar registros sem `group_id` no acordeão “Sem grupo”.

##### R16.2

- Mudou: a página separa “Turmas Kodland” e “Turmas pessoais”; a configuração
  de tarifa/dia está na turma Kodland, e grupos pessoais/“Sem grupo” organizam
  as demais. O modal cria ou seleciona grupo, cadastra aluno no contexto da
  turma e permite mover turmas. Valor padrão e gestão de alunos/grupos ficaram
  em ações secundárias.
- Verificado pelo orquestrador: 14 testes focados, typecheck, lint, diff check
  e fluxo Chromium visitante passam. Inspeção visual em 1440px e 390px passou
  após empilhar o cabeçalho da Kodland em celular; o modal rola internamente.
- Próximo: R16.3 deve atualizar o cenário/documentação da demo e executar a
  verificação completa de backup, build e fluxo visitante.

##### R16.3

- Mudou: a demo inicia com o grupo “Turmas autônomas”, uma turma e uma aluna
  fictícias; grupos criados pelo visitante persistem juntos com turmas/alunos.
  README e memória documentam a separação entre Kodland virtual e grupos
  pessoais.
- Verificado pelo orquestrador: 128 testes unitários, typecheck, lint, build,
  diff check e o fluxo Chromium visitante passam. O e2e confirma que o fluxo
  não chama Firebase nem Kodland.
- Próximo: validar a área privada com uma conta de teste antes de publicar.

### R17 - Contexto em grafo para o Codex

> Objetivo: reduzir a exploração repetida do repositório em tarefas da IA, sem
> alterar o código entregue ao usuário, o comportamento da aplicação ou o
> processo de deploy. O índice é local, regenerável e ignorado pelo Git.

- [x] R17.1 - Gerador e consulta do grafo de dependências
  - Escopo: adicionar uma ferramenta de desenvolvimento reproduzível para
    extrair os imports TypeScript/TSX do frontend, salvar o índice fora do
    versionamento e consultar dependências, dependentes e arquivos pelo nome.
  - Aceitação: um comando gera o índice para `frontend/src`; consultas por
    `corrections-page.tsx` mostram relações diretas; cache e artefatos gerados
    não aparecem em `git status`.
  - Depende de: nenhuma.

- [x] R17.2 - Integração ao fluxo de trabalho do Codex
  - Escopo: documentar comandos curtos e adicionar uma orientação local para
    usar o grafo apenas em investigações transversais; manter `rg` como busca
    textual e evitar qualquer consulta obrigatória em edições simples.
  - Aceitação: a documentação explica quando gerar/consultar o mapa, seus
    limites e exemplos; as instruções não mudam a aplicação em produção.
  - Depende de: R17.1.

- [x] R17.3 - Verificação e handoff
  - Escopo: executar a geração e consultas representativas, validar o
    versionamento limpo dos artefatos e registrar o fluxo/limites na memória
    operacional do projeto.
  - Aceitação: os comandos retornam resultado útil, `git check-ignore` cobre o
    cache e as validações web existentes continuam verdes.
  - Depende de: R17.1, R17.2.

#### Handoff R17

> Registrar uma entrada curta por tarefa após verificação e commit.

##### R17.1

- Mudou: `dependency-cruiser` foi adicionado apenas como dependência de
  desenvolvimento. Os scripts `codex:graph:generate` e `codex:graph` geram
  um índice local de `frontend/src` e consultam dependências/dependentes por
  arquivo; o cache fica em `.codex/graph/`, fora do Git.
- Verificado pelo orquestrador: geração do índice, consulta de
  `corrections-page`, `git check-ignore` do cache, `node --check` e diff check
  passam.
- Próximo: R17.2 deve documentar o uso pontual do grafo para investigações
  transversais, preservando `rg` para busca textual.

##### R17.2

- Mudou: `README.md` documenta geração, consulta, exemplos e limites do índice;
  `AGENTS.md` orienta o Codex a usá-lo somente para análise de impacto ou
  investigações transversais, sem substituir `rg` em buscas simples.
- Verificado pelo orquestrador: ajuda, geração, consulta de
  `corrections-page`, referências locais da documentação e diff check passam.
- Próximo: R17.3 deve conferir o cache ignorado e executar a validação web
  existente antes de registrar o handoff final.

##### R17.3

- Verificado pelo orquestrador: geração do índice; consultas pelo componente
  `corrections-page` e pela rota `src/app/corrections/page.tsx`; cache coberto
  por `git check-ignore`; typecheck, lint, build e diff check passam.
- Mudou: a memória operacional registra o comando, o local do cache e o limite
  do índice para que consultas futuras não confundam imports estáticos com
  fluxos dinâmicos ou regras de negócio.
- Entrega: o grafo permanece uma ferramenta local de contexto do Codex, sem
  participação no bundle, no runtime ou no deploy da aplicação.

### R18 - Atividades em lista e grade compacta

> Solicitação de 21/10/2026. A aba Atividades de Acompanhamento mantém a lista
> atual como padrão e ganha a visualização Compacto, espelhando a estrutura de
> turma, aluno e rolagem da Presença. A mudança é visual: não altera as fontes
> de atividades, a sincronização ou a ação de correção. Como a demonstração
> reutiliza o mesmo componente, os dois modos devem funcionar nos dois fluxos.

- [x] R18.1 - Modelo e grade compacta de atividades
  - Escopo: derivar, por turma, linhas de alunos e colunas únicas de aula/tarefa
    para pendências Kodland e manuais; renderizar blocos compactos acionáveis,
    mantendo a ação atual de corrigir e células vazias quando não houver entrega.
  - Aceitação: uma turma exibe grade horizontal com aluno fixo e colunas de
    atividade; Kodland abre a correção e a demonstração mantém o modal simulado;
    atividades manuais continuam abrindo sua correção local.
  - Depende de: nenhuma.

- [x] R18.2 - Seletor, responsividade e lista preservada
  - Escopo: adicionar o seletor Lista/Compacto somente na aba Atividades;
    preservar a lista, filtros e agrupamentos atuais e aplicar à grade compacta
    o padrão responsivo, acessível e rolável da Presença.
  - Aceitação: Lista inicia selecionada e mantém o comportamento atual;
    Compacto organiza por turma, mantém busca e cabe em desktop/celular sem
    rolagem horizontal da página.
  - Depende de: R18.1.

- [ ] R18.3 - Testes, demonstração e verificação final
  - Escopo: cobrir as transformações e os dois modos de exibição, validar o
    fluxo visitante e registrar o resultado operacional.
  - Aceitação: testes relevantes, typecheck, lint, build, diff check e smoke
    da demonstração passam; nenhuma ação da demo chama Firebase ou Kodland.
  - Depende de: R18.1, R18.2.

#### Handoff R18

> Registrar uma entrada curta por tarefa após verificação e commit.

##### R18.1

- Mudou: `compactActivitiesModel` normaliza pendências Kodland e manuais por
  turma, aluno e atividade. `CompactActivitiesGrid` usa aluno fixo, colunas
  roláveis, células vazias e preserva as ações de correção real, demo e manual.
- Verificado pelo orquestrador: typecheck, lint focado e diff check passam.
- Próximo: R18.2 deve conectar o seletor Lista/Compacto sem modificar a lista
  existente, e usar o modelo para a visualização compacta.

##### R18.2

- Mudou: Atividades ganhou o seletor acessível Lista/Compacto. Lista inicia
  selecionada e mantém o agrupamento atual; Compacto usa a matriz por turma e
  recebe os mesmos resultados já filtrados pela busca.
- Verificado pelo orquestrador: typecheck, lint focado e diff check passam.
- Próximo: R18.3 deve cobrir a normalização/ações e verificar o fluxo visitante
  nos dois formatos antes da validação completa.
