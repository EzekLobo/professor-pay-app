# Plano de implementação: notificações de acompanhamento

Data: 28/10/2026. Estado: revisado; fundação N1 implementada e validada pelo subagente. Interface e validação integrada pendentes no checklist oficial de PLAN.md.

## Revisão e handoff da fundação N1

Confirmado por documentação local: `docs/kodland-endpoints.md` registra `TASK_NOT_SUBMITTED`, `TASK_CHECKED`, `TASK_NOT_GRADED`, `TASK_SUBMITTED` e `TASK_SUBMITTED_LATE` no progresso. A sincronização agora preserva somente IDs/título/estado do progresso em `kodland_task_progress`, sem copiar payloads ou credenciais. Apenas `NOT_SUBMITTED` é falta de entrega explícita; `NOT_GRADED` permanece desconhecido. Classificação Aula/Casa é feita somente por ID de tarefa encontrado nos links de `classroom_tasks`/`homework_url`; sem associação confiável, não classificar. Prazos não são inventados: casa externa exige política configurada pelo professor. Isso amplia a cobertura prevista inicialmente sem confundir a fila de correções com atribuições.

O endpoint rejeita respostas estruturalmente incompletas de progresso. O loader confere `sync_status` antes/depois da leitura e rejeita sincronização incompleta/troca de conta; o chamador deve preservar casos existentes em erro, sem chamar reconcile com lista vazia. Cache por UID dura 30 segundos; recalcular o motor com relógio atualizado permite vencer prazos sem novas leituras.

APIs para a interface N2:

- `student-notification-rules.ts`: `defaultNotificationSettings(today?)`, `validateNotificationSettings`, `evaluateStudentNotifications(lessons, obligations, settings, now)`, `needsNotificationContact(case)`, `notificationTarget(notification, demo?)`, `notificationMessage(notification, template)`. Configuração inicial vem desativada para evitar importação silenciosa de alertas históricos.
- `student-notification-source.ts`: `loadStudentNotificationSource(uid, settings, force?)`, `demoStudentNotificationSource(snapshot, settings)`, `clearStudentNotificationSourceCache()`. Resultado `{ lessons, obligations, warnings, loaded_at }`. Mensagens de cobertura devem ficar visíveis. `loaded_at` é o horário da avaliação/leitura, não uma garantia de sincronização externa recente.
- `student-notification-store.ts`: `createStudentNotificationStore(uid)` ou `createDemoStudentNotificationStore()`; métodos `settings`, `saveSettings`, `cases`, `reconcile(items, timestamp)`, `markRead(id, revision)`, `confirmContact(id, revision)`. IDs/revisões vêm do motor. Confirmação usa transação remota e rejeita revisão alterada; não remover da fila antes do retorno bem-sucedido.
- `subscribeStudentNotifications(listener)` / `notifyStudentNotificationsChanged()` avisam mudanças relevantes. Ao atualizar dados, invalidar a origem antes de recalcular. Demo persiste separadamente em localStorage e não chama serviços privados.
- `ManualActivity`: campos opcionais `kind: classroom|homework|unknown`, `due_at: ISO com Z/offset ou null`, `required`, `exempt`. Legado permanece unknown. Formulários da N2 devem permitir classificação/prazo e usar `notificationLocalInstant(data,hora,fuso)` para converter valores civis; não gravar datetime-local sem offset.

Novas coleções integram backup 4.0 como extensões opcionais compatíveis e reset. Permissões atuais do proprietário já abrangem essas subcoleções; nenhuma regra foi alterada ou publicada. Os testes verificam isolamento de UID e roundtrip do backup; teste com emulador/conta real ainda não realizado.

Validação N1: 68 testes passam nos arquivos student-notification-rules, student-notification-store, student-notification-source, demo-manual-adapter, backup-migration e rota sync; typecheck e lint passam. Comando focado: `npm run test --workspace=@aulapay/web -- src/lib/student-notification-rules.test.ts src/lib/student-notification-store.test.ts src/lib/student-notification-source.test.ts src/lib/demo-manual-adapter.test.ts src/lib/backup-migration.test.ts src/app/api/kodland/sync/route.test.ts`.

## Objetivo e escopo

Adicionar um sino no topo do NexusClass com alertas de faltas e atividades não entregues. Cada alerta deve explicar o motivo, identificar aluno/turma/aula e abrir o ponto exato de Acompanhamento para o professor agir e preparar uma mensagem ao responsável.

A primeira entrega será uma central interna da aplicação web, incluindo demonstração e turmas manuais/Kodland quando houver dados suficientes. Push do navegador, envio automático e execução com aplicativo fechado ficam para outra etapa. Alertas externos exigem infraestrutura própria, distinta da central interna.

## Evidências do repositório

- Confirmado: `frontend/src/components/shell.tsx` possui `ShellFrame` e ações no cabeçalho, local apropriado ao sino.
- Confirmado: `corrections-page.tsx` reúne Presença e Atividades e já prepara mensagem editável de ausência com abertura do WhatsApp.
- Confirmado: `KodlandStudent` e `ManualStudent` possuem campos de responsável/telefone; esses campos podem estar vazios.
- Confirmado: `KodlandReview` representa a fila de correções e não oferece, nesse contrato, inventário completo de tarefas esperadas, tipo aula/casa ou prazo.
- Confirmado: `ManualActivity` possui status de atribuição/entrega/correção, mas não possui tipo aula/casa ou prazo. `pendingManualActivities` seleciona entregas com conteúdo aguardando correção.
- Consequência: não usar a fila atual de correções como lista de atividades não entregues. Uma entrega aguardando correção não é inadimplência do aluno.
- Pendente: validar cobertura e significado dos dados Kodland por aluno/atividade, inclusive prazo e distinção aula/casa. Materiais de aula e links de lição de casa não provam atribuição individual nem entrega.
- Lacuna documental: `AGENTS.md` referencia repo-map, checklists de agentes e skill professor-pay-ops que não estão nesta cópia. Consultado o estado atual disponível; recuperar essas referências antes de depender delas na execução.

## Regras configuráveis

Criar Configurações > Notificações, com ativação geral, faltas, regra de atividades de aula, dever de casa, prazo/tolerância e início do acompanhamento. Preferências por professor na V1.

| Opção | Condição para gerar alerta |
| --- | --- |
| Falta sem justificativa | Presença explicitamente ausente após término da aula; justificada, desconhecida ou não marcada não gera alerta. |
| Nenhuma atividade da aula entregue | Aula encerrada, pelo menos uma atividade de aula atribuída ao aluno e zero entregas válidas. |
| Mais de N atividades da aula sem entregar | Após encerramento/tolerância, quantidade pendente estritamente maior que N; N=2 significa 3 ou mais. |
| Dever de casa não entregue | Uma ou mais atividades de casa atribuídas, vencidas e sem entrega válida. |

Seleção proposta: regra de aula mutuamente exclusiva (desligada / nenhuma entregue / mais de N), com dever de casa independente. Desligar as regras de aula e ligar casa atende ao modo “somente dever de casa”. Faltas têm controle próprio. Validar N como inteiro não negativo.

Padrões propostos, editáveis e apresentados na primeira ativação: faltas ligadas; aula = nenhuma entregue; dever de casa ligado; tolerância zero para tarefas com prazo explícito. Para casa sem prazo, o professor precisa definir um prazo ou uma política explícita de dias após a aula; até lá, não gerar cobrança. Armazenar horário limite e fuso configurado. Permitir selecionar a data inicial para evitar centenas de alertas antigos ao ativar.

Contar apenas alunos ativos e atividades efetivamente atribuídas. Excluir aulas canceladas/futuras e atividades canceladas, dispensadas ou opcionais não exigidas. Tipo desconhecido, sincronização incompleta ou matrícula sem vínculo confiável devem produzir indicação de dados insuficientes, não acusação de não entrega. Uma ausência não dispensa tarefas automaticamente; respeitar dispensas registradas.

## Experiência do usuário

1. Sino no cabeçalho desktop/mobile, com contador de casos ativos que exigem ação; contador não representa apenas mensagens não lidas.
2. Painel com Pendentes e Histórico, filtros por motivo e acesso às configurações. Mostrar atualização mais recente e falhas de dados.
3. Cartão exemplo: “Ana · Turma Python · M2L3 — 3 atividades de aula não entregues”. Incluir data, motivo, quantidade e ação “Resolver”.
4. Resolver abre Acompanhamento na aba correta, expande a turma, encontra aluno/aula e destaca a pendência. Para atividades, abre detalhes com itens faltantes, prazo e ação de contato.
5. Mensagem editável para o responsável, com modelos separados para falta e atividade. Variáveis permitidas: responsável, aluno, turma, aula, data, lista de atividades e prazo. Reutilizar formatação/WhatsApp existentes.
6. Sem telefone do responsável: mostrar “Cadastrar contato” e abrir cadastro apropriado. Não substituir silenciosamente pelo telefone do aluno.
7. Abrir WhatsApp registra somente “mensagem preparada/WhatsApp aberto”. Exibir ação explícita “Confirmar contato realizado”; não afirmar envio ou entrega sem confirmação.

Botão do sino com título, nome acessível e alvo mínimo de 44px; painel operável por teclado, Escape e retorno do foco. Layout sem overflow em 320, 390 e 1440px. Reaproveitar componentes visuais e evitar conflitos com novidades e outros diálogos.

## Dados e arquitetura propostos

Separar condições pedagógicas de ações do professor:

- Contrato normalizado de obrigação por fonte/aluno/turma/ocorrência/atividade: IDs estáveis, tipo `classroom | homework | unknown`, atribuição, obrigatoriedade/dispensa, prazo, estado de entrega e qualidade/atualização da fonte.
- Motor puro `student-notification-rules.ts`: recebe snapshot completo, preferências e relógio explícito; devolve casos e respectivos motivos, sem efeitos de rede.
- Preferências em `users/{uid}/notification_settings/default`; histórico de ações em `users/{uid}/notification_cases/{caseId}`. Nomes propostos, a validar contra convenções e regras existentes.
- Chave estável de caso: fonte + turma + aluno + ocorrência + categoria (falta/aula/casa). Agregar tarefas por aluno/aula/categoria e manter lista de motivos, evitando duplicação quando sincroniza ou altera o limite.
- Estados independentes: leitura, condição pedagógica ativa/regularizada e contato pendente/confirmado. Contato confirmado tira o caso da fila de contato, mas preserva atividade pendente no acompanhamento e no histórico.
- Nova aula gera outro caso. Novas atividades vencidas no mesmo caso, após contato, geram nova revisão acionável; não repetir alerta pela mesma revisão. Registrar assinatura estável do conjunto de pendências para essa decisão.
- Entrega posterior/justificativa/dispensa regulariza a condição após atualização confiável. Falha ou resposta parcial não apaga alertas nem os marca como resolvidos. Mudança de regra retira casos inelegíveis da fila sem apagar histórico; reativação preserva contatos já confirmados para a mesma revisão.
- Proteger gravações concorrentes e isolamento por UID; salvar confirmação antes de retirar visualmente da fila, com erro e nova tentativa. Nenhuma garantia offline nova sem implementação/verificação específica.
- Camada compartilhada de carregamento/cache para cabeçalho e Acompanhamento, evitando carregar todas as coleções em cada mudança de rota. Recalcular ao carregar, sincronizar com sucesso, editar dados, salvar preferências e ultrapassar prazo enquanto a aplicação estiver aberta.
- Demo usa adaptadores locais e cenários determinísticos, sem chamadas privadas. Incluir novas coleções/campos em backup, restauração, validação e limpeza com compatibilidade de versões anteriores.

## Navegação contextual

Propor parâmetros internos em `/corrections`: aba, fonte, turma, aluno e ocorrência; atividade opcional. Usar IDs, sem nome/telefone no endereço. A tela valida o vínculo com a conta, aguarda carregamento, aplica filtros necessários e só então abre o detalhe. Suportar recarga, voltar e destino excluído/inacessível com orientação clara. Demo deve reproduzir o contexto usando seu roteamento existente.

## Etapas de execução e dependências

1. **Validar a fonte de dados.** Inspecionar sincronização Kodland com amostra autorizada e testes locais: inventário atribuído, status, classificação e prazo. Definir semântica dos status manuais existentes. Saída: contrato e matriz de cobertura. Bloqueia alertas de atividades das fontes sem cobertura; não bloqueia central e faltas.
2. **Completar os modelos.** Adicionar tipo/prazo/dispensa e atribuição ao fluxo manual; adaptar Kodland somente com evidência. Legados permanecem desconhecidos quando não for possível classificar com segurança. Atualizar adaptadores, demo e backup.
3. **Criar motor e persistência.** Implementar regras, deduplicação, revisões, histórico, preferências e isolamento. Validar dados parciais, vencimento e concorrência antes da interface.
4. **Criar destinos acionáveis.** Contexto em Acompanhamento, detalhes de não entrega e mensagem para responsáveis, reaproveitando ausência. Implementar cadastro de contato e confirmação explícita.
5. **Adicionar sino e configurações.** Painel, contador, histórico, estados vazios/erro/dados insuficientes, configurações e primeira ativação com prévia da quantidade de casos.
6. **Integrar e validar.** Autenticado/demo, responsividade, navegação, sincronização, permissões e backup. Publicação de regras, se necessária, é uma etapa verificável do lançamento.
7. **Documentar entrega.** Atualizar estado atual, manual de operação e novidades somente após funcionalidade validada; registrar limitações reais de cada fonte. Não alterar versão APK apenas por este plano web.

## Critérios de aceite e testes

- Motor: zero atividades atribuídas não gera alerta; zero entregas com tarefas de aula gera; duas pendências com N=2 não geram e três geram; somente casa ignora aula; entrega aguardando correção não conta como não entregue.
- Prazos: tarefa futura não alerta, tarefa vencida alerta, tolerância e fuso respeitados, casa sem prazo/política fica sem cobrança; prazo vencendo com aplicação aberta recalcula.
- Presença: ausente após a aula alerta; justificada/desconhecida/futura não; justificativa posterior regulariza.
- Qualidade: desconhecido não vira não entregue; sincronização parcial não encerra casos; aluno inativo e aula cancelada ficam fora.
- Persistência: sincronização repetida não duplica; leitura não resolve; contato confirmado persiste após recarga e entre dispositivos; novo item vencido reabre revisão sem repetir a anterior; duas contas nunca compartilham dados.
- Fluxo E2E: sino → caso → aluno/aula → mensagem editável → abrir WhatsApp → confirmar contato. Testar telefone ausente, destino removido, voltar/recarga, filtros e demo sem rede privada.
- Compatibilidade: backup antigo, exportação/importação nova, reset, falhas de gravação e regras em emulador. Verificações finais: lint, typecheck, testes unitários/E2E pertinentes e build; executar verificações backend apenas se houver mudanças nessa camada.

## Decisões propostas para iniciar

Central interna primeiro; regras globais por professor; atividades de aula e casa separadas; contato manual confirmado; nenhuma cobrança baseada apenas na fila de correções. A principal incerteza é a cobertura das entregas Kodland. Concluir essa investigação antes de estimar a implementação completa; se faltar cobertura, entregar faltas e dados manuais completos, identificando claramente a limitação da integração.


## Revisão da implementação — 28/10/2026

- Central, preferências, destinos e confirmação de contato implementados para conta e demonstração. Ativação começa desligada para o professor escolher a data inicial antes de gerar casos antigos.
- Progresso externo agora é preservado, usando os estados documentados e correspondência de IDs com materiais. Não houve validação com conta real; classificação desconhecida não gera cobrança. Casa externa depende da política de dias, pois não há prazo individual comprovado.
- Fonte de presença exige horário final confiável. Atividades próprias possuem tipo/prazo/obrigatoriedade/dispensa. A fila de correções não foi usada como inventário de não entregas.
- Revisão corrigiu prazo futuro de aula e reconciliação fora de ordem. Preview valida as mesmas configurações usadas ao salvar.
- Testes de conta autenticada são locais com Firestore simulado (isolamento UID, gravação, falha e confirmação); não houve login em conta real nem execução de emulador de regras. Testes de navegador exercitam o fluxo completo na demo sem chamadas privadas. Não afirmar verificação ponta a ponta em produção.
- Regras de acesso existentes foram mantidas. Nenhum push/deploy/publicação ocorreu. Push do navegador, mensagens automáticas e execução com aplicativo fechado continuam fora da entrega.
