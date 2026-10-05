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
