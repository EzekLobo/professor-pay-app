# Correções da revisão — 30/10/2026

Fonte: `docs/reviews/2026-10-30-revisao-completa.md`. Usuário autorizou corrigir todos os achados R01–R08. Alterações anteriores na árvore são preservadas; não criar commit misturando trabalho anterior sem base isolada.

## Contrato financeiro confirmado

O commit `26cd759` (30/09/2026, `feat: aplica ciclo mensal de pagamentos`) altera explicitamente src/calculations.ts: período mensal MM/AAAA e pagamento dia15 do mês seguinte. R08 corrigirá expectativas/fixtures antigas, sem voltar à regra quinzenal e sem alterar a política de recebimentos existentes.

## Tarefas

| ID | Escopo | Dependência | Aceite |
|---|---|---|---|
| C01 | R01/R06: capturar UID nas operações financeiras/cadastrais assíncronas, guardas pós-await e antes de gravações; distinguir atrasado de recebido. | Nenhuma | Troca A→B/logout cancela sem gravar em B; atrasado editável e recebido bloqueado; regressões permanentes. |
| C02 | R02: preservar links válidos para mesma ocorrência e permitir nova busca coerente após invalidação/remarcação. | C01 (mesmo api.ts) | Atualização manual conserva chamada/gravação da mesma ocorrência; horário diferente não herda link nem finalização; gravação ausente com metadata antigo pode se recuperar. |
| C03 | R03/R04/R05: evento de preferências por UID, invalidação de fonte/histórico, reler skipped e marco inicial na ativação real. | C02 + contrato evento | Desligar impede novas consultas sem navegação; conclusão externa deixa de gerar claims; integração ligada tardiamente limita carga inicial a7dias; pendências rastreadas preservadas. |
| C04 | R07/R08: separar testes/TypeScript por projeto e alinhar suíte Expo ao ciclo mensal confirmado. | Nenhuma; arquivos disjuntos C01–C03 | npm test e typecheck raiz validam só nativo, web próprios comandos; todos65 testes nativos verdes com asserts fortes de cálculo/preservação; E2E isolado Playwright. |
| C05 | Verificação conjunta, documentação, memória, revisão das regressões e relatório atualizado. | C01–C04 | Suites nativa/web/backend, lint/typecheck/build e E2E relevantes; relatório diferencia correção local de validação em conta real. |

C01/C02 executadas sequencialmente por um editor de api.ts. C04 pode avançar em paralelo: package.json, tsconfig, configuração Vitest raiz e testes em src são disjuntos e não dependem da API web. C03 começa após estabilizar o contrato de preferências e alterações da API. Orquestrador verifica resultados antes de concluir cada etapa.

## Estado

- C01/C02 concluídas e verificadas.
- C03 concluída e verificada.
- C04 concluída e verificada.
- C05: quality completo passou;53 E2E em andamento.

Não incluir deploy, iniciar aula, enviar mensagens ou alterar contas reais. Novas regressões usam dados sintéticos. Regras de autorização/permissão em produção e execução em aparelho continuam verificações externas distintas.

### Divisão de C03 para execução segura

C03a (R04/R05) pode avançar independentemente de C01/C02, em runtime/state/coordinator/tests: não consome mudanças da API nem do helper de preferências e não toca api.ts. C03b (R03 e integração do contrato de preferências, recuperação de links) aguarda a aceitação de C01/C02. Essa divisão mantém dependências sequenciais e permite adiantar apenas os arquivos e comportamentos independentes.

## Execução C04 — verificada

- Configuração Vitest raiz limita src/**/*.test.ts; TypeScript inclui App/index/src/config nativos e exclui frontend. Sem excluir o código Expo de produção nem alterar sua regra financeira.
- Expectativas e fixtures mensais atualizadas em calculations/classEditing; verificações de preservação de recebidos, edição/desativação mantidas.
- Scripts test:all, quality:native/web e typecheck explícitos; wrappers web encaminham flags com separador final.
- Orquestrador repetiu `npm.cmd test`: 65/65 testes em11 arquivos passam; `npm.cmd run typecheck` passa. Agente confirmou `web:e2e -- --list --workers=1` listando53 cenários. Suite web aguarda edição de api.ts estabilizar antes da verificação conjunta.
- C03a/R04/R05 em execução independente nos arquivos runtime/state/coordinator/policy, sem editar API ou contrato de preferências.

## Execução C01/C02 — API, contas e links

- C01: `forAccount(uid, work)` vincula awaits ao UID da operação e verifica a identidade antes/depois; os mutadores financeiros/cadastrais usam referências com UID explícito. Confirmação A→B/logout falha antes de gravar, e o pagamento válido permanece na conta original. Guardas de recebimento usam `paymentWasReceived`, incluindo edição/cancelamento de aulas e atualização/desativação de turmas; OVERDUE sem recebimento não congela a competência.
- O contrato das assinaturas públicas foi mantido. A proteção compara o UID ativo; não pretende detectar um ciclo completo A→B→A ocorrido inteiramente entre duas verificações, caso o mesmo UID já esteja novamente ativo.
- C02: `mergeSyncedKodlandLesson` e novo `mergeSyncedKodlandExtraLesson` preservam gravação/call_* apenas para a mesma fonte/identidade, turma/aluno/booking conhecidos, data e horários. Remarcação/fonte diferente invalida links e `final_checked_at` automático da extra; a decisão financeira humana DONE/ACCOUNTED continua protegida pelo domínio existente.
- Contrato C03b: `tutor-preference-events.ts` exporta `publishTutorPreferencesChanged({uid,kodland_enabled})` e `subscribeTutorPreferencesChanged(uid, listener(change))`. O evento só é publicado depois do save confirmado, sem credenciais, localmente e entre abas via storage. O runtime/controller deve suspender ou invalidar ao recebê-lo.
- Regressões permanentes: `api-account-isolation.test.ts`, `api-occurrence-links.test.ts` e `tutor-preference-events.test.ts`: 26 testes passaram, incluindo persistência manual de extra que já possuía gravação/final check. Suíte afetada ampliada: 64 testes em sete arquivos passaram. Diff check sem erros. Typecheck/lint final sendo conferidos pelo orquestrador.

## Execução C01/C02 — verificação de regressões

- API bound por UID em operações assíncronas, referências explícitas e guardas antes/depois de leituras/escritas. Recebidos efetivos bloqueiam alterações; OVERDUE permanece editável também em fluxos de turmas/cancelamento.
- Novo helper de preferências publica evento local/entre abas após salvar, carregando somente UID e toggle. Contrato disponível a C03b.
- Merges regular/extra preservam links e conferência final somente na mesma ocorrência; fonte/data/horário alterados descartam estado anterior.
- Orquestrador repetiu26 testes permanentes de isolamento/links/eventos: passaram. Web TypeScript global passou após estabilização da API. Testes de recuperação de URL com metadata concluída seguem em C03b.

## Execução C03a — verificada

- Leitura force atravessa caches; skipped relê estado autoritativo, sem claims indefinidos para recurso encerrado remotamente. Invalidação por revisão é direcionada.
- activation_at representa ativação com integração habilitada e dados importados; campo legado não ancora a janela. Estados anteriores e pendências rastreadas além7dias preservados por trackedStates() carregado uma vez.
- Root repetiu28 testes runtime/state/coordinator, e agente repetiu os11 de política (39 afetados). Typecheck global passou.
- C03b em execução após interfaces liberadas: toggle imediato e recuperação de links apagados com metadata antiga.

## Execução C03b — concluída, validação conjunta em andamento

- Preferências são assinadas por UID no controller; desligar suspende novos jobs e timers imediatamente, incluindo payroll já enfileirado. Reconectar acesso não ignora uma integração desligada. Leituras iniciadas antes do evento não reativam; leitura autoritativa posterior pode retomar.
- Políticas de chamada/gravação usam o dado persistido da ocorrência: marcador concluído sem URL não bloqueia recuperação. Registros antigos já rastreados são recuperáveis, sem consultar histórico antigo não rastreado; intervalos de30min/5min e janela da chamada preservados.
- 43 testes focados passaram (9 novas regressões), typecheck/lint/diff check passaram pelo agente. C05 executa quality completo e depois os53 E2E.
- C01/C02 fonte congelada inclui guardas também no carregamento do dashboard/materialização/backfill. Root repetiu27 regressões de API/links/eventos com sucesso, incluindo o caso adicional de side effect durante leitura.
- Novidade web2026103001 adicionada, sem alteração de app.json/APK ou regra financeira de produção do Expo.

## C05 — resultado do comando agregado

`npm.cmd run quality` terminou com exit0: raizTypeScript+65 testes nativos, web lint+TypeScript+437 testes em62 arquivos+build de produção24 páginas, backend Ruff+33 testes. As45 deprecações das dependências Python não causam falha e permanecem fora do escopo funcional. E2E completo iniciado depois do build com `npm.cmd run web:e2e -- --workers=1`, encaminhamento correto confirmado nos logs.

C05 navegador: na suite serial completa, o caso demo-manual390 voltou a falhar na checagem intermitente de rolagem já registrada na revisão. Demais casos continuam; investigação restrita à pré-condição/auto-scroll do teste foi iniciada, sem alteração de código funcional. Não marcar C05 concluída antes de resolver/verificar esse caso.

## C05 — navegador concluído

A execução completa teve 49 aprovados, duas falhas e dois casos não executados. Os dois arquivos afetados foram corrigidos e seus cinco cenários passaram em execução serial; os dois cenários demo foram repetidos com a asserção adicional de que a página não rola verticalmente. Resultado combinado: os 53 cenários únicos passaram, sem exclusão de casos.

A preparação Vite da fixture ganhou orçamento de 90s somente no beforeAll, mantendo 30s nas interações. A falha móvel revelou defeito real: listener wheel passivo não cancelava rolagem vertical, que interrompia o movimento da grade. ManualAttendanceGrid e AttendanceTimeline agora registram listener nativo passive:false com cleanup e liberam rolagem da página no limite horizontal. O teste usa wheel real, espera estabilidade do foco inicial e verifica deslocamento horizontal sem deslocamento vertical. Diagnósticos temporários removidos.

C05 concluída: após o delta final das grades, npm.cmd run quality:web passou novamente (lint, TypeScript,437 testes/62 arquivos e build24 páginas). C01–C05 encerradas localmente. Sem publicação ou sincronização em conta real.
