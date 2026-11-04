# Plano de implementação — sincronização automática por escopo

Data: 29/10/2026. Versão documental: 3. Estado: implementação local concluída e validada.

## Execução e decisões confirmadas — 29/10/2026

- Usuário autorizou implementar e confirmou D02–D06: semana segunda–domingo; extra conferida no dia seguinte; presença uma vez em fim +1h; pagamentos D−5 até D; gravações nos acessos à Agenda com intervalo mínimo de 30min; link ausente a cada 5min até o fim. Carga inicial de presença/gravações: últimos 7 dias. Essas regras deixam de ser propostas nesta execução.
- Progresso: T01–T08 concluídas e verificadas localmente; validação autenticada em conta real não executada. Confirmação pública adicional do contrato de chamada registrada em T01.
- Baseline: 295 testes unitários web passaram antes da alteração. Geração de grafo impedida pela restrição de escrita em `.codex/graph`; índice existente consultado para `dashboard-page`.

## Objetivo e fontes

Reduzir consultas à Kodland, atualizar cada área no momento necessário e permitir iniciar a chamada pela grade de horários. Fonte das regras confirmadas: instruções do usuário nesta conversa. As escolhas técnicas abaixo são propostas, não funcionalidades entregues.

Escopo inicial: aplicação web em `frontend/`, incluindo uso em navegador móvel e demonstração isolada. O aplicativo Expo da raiz tem implementação distinta; portar o comportamento para ele exige etapa própria, sem presumir que mudanças no frontend o atualizem. Antes de qualquer código Expo/React Native, consultar `.codex/rules/expo-v56.md` e https://docs.expo.dev/versions/v56.0.0/.

## Evidências do repositório

- `frontend/src/lib/api.ts`: modos `essential`, `schedule`, `corrections` e `profiles`, persistência da integração e operações de folha de pagamento.
- `frontend/src/app/api/kodland/sync/route.ts`: `corrections` reúne atividades, presença e aulas. `schedule` passa pela busca de alunos, extras e disponibilidade. Reutilizar esses modos sem separação manteria consultas excluídas pelo usuário.
- `frontend/src/components/dashboard-page.tsx`: grade semanal e interação com aulas; `lesson-material-modal.tsx`: modal existente.
- `frontend/src/components/corrections-page.tsx`: atualização de Acompanhamento.
- `frontend/src/lib/student-ranking.ts`: classificação usa pontos de `progress_summary`. Reordenar um cadastro antigo não atualiza os pontos; é necessário atualizar a fonte mínima do ranking junto às correções.
- `frontend/src/components/student-notifications.tsx`: reconciliação com intervalo de 60 segundos, foco e eventos. Avaliar substituição por eventos de dados e prazos locais, preservando vencimentos sem novos dados externos.
- `frontend/src/components/payments-page.tsx`, `dashboard-content.tsx` e `frontend/src/lib/api.ts`: pontos de integração de pagamentos, extratos e resumos.
- A rota já consulta gravações, mas o campo autoritativo para iniciar a chamada ainda não foi confirmado. Link de material, de gravação ou de próxima aula não deve ser tratado como link de início por semelhança.

## Regras funcionais

### R01 — Cadastros, disponibilidade e materiais

**Confirmado pelo usuário:** turmas e informações cadastrais dos alunos não têm atualização automática. Disponibilidade e materiais também ficam fora dela.

**Proposto:** manter ações manuais e carregamento de material sob demanda já existente. Atualizações automáticas podem usar IDs locais para consultar dados operacionais, sem substituir cadastro, responsáveis, disponibilidade ou materiais. Pontuação de ranking é dado operacional, separado dos campos cadastrais.

### R02 — Aulas extras

**Confirmado pelo usuário:** descobrir novas aulas extras da semana atual. Aula já ministrada não é consultada novamente. Aula futura já conhecida e não ministrada não recebe nova conferência individual. Depois de passar o dia, uma aula ainda não ministrada é conferida uma única vez na Kodland; após resposta válida, encerrar sua atualização automática, inclusive quando permanecer não ministrada.

**Proposto:** descobrir novidades ao entrar na Agenda, consultando apenas a janela semanal. Uma listagem pode repetir itens conhecidos; filtrar por ID antes de buscar detalhes ou gravar alterações. Não prometer que é possível detectar novidades sem uma consulta de listagem. Conferir pendências já importadas independentemente da semana: uma aula de domingo continua elegível na segunda-feira.

Usar estados `pending`, `checking`, `confirmed_taught`, `confirmed_not_taught` e `retry_pending`, com `final_checked_at` somente após resposta válida e persistida. Timeout, resposta incompleta, acesso negado ou estado desconhecido não significam “não ministrada”. Marcar ministrada encerra a conferência automática. Consulta manual continua possível.

**Proposta de fronteira temporal:** “passou do dia” significa início do dia seguinte no fuso da agenda, e não apenas fim da aula. Semana de segunda a domingo. Esses detalhes ficam explicitados para confirmação em D02.

### R03 — Presença

**Confirmado pelo usuário:** consultar a turma uma hora após o horário de fim da aula.

**Proposto:** uma conferência automática por ocorrência, elegível em `end_at + 1 hora`. Se o app estiver fechado, executar na retomada após o prazo. Buscar apenas turma e ocorrência necessárias; compartilhar uma consulta se várias pendências da mesma turma puderem ser satisfeitas por ela. Não consultar presença a cada entrada em Atividades.

Sucesso exige resposta válida, não apenas HTTP bem-sucedido. Presença ainda não marcada permanece explicitamente desconhecida e não gera falta. A política de uma única conferência bem-sucedida, mesmo se ainda não marcada, é proposta em D03. Falhas técnicas permanecem pendentes.

### R04 — Atividades, correções e ranking

**Confirmado pelo usuário:** atualizar atividades a cada entrada na página de Acompanhamento. Ranking dos alunos deve ser atualizado sempre que as correções forem atualizadas.

**Proposto:** disparar ao entrar na rota; trocar filtros, renderizar ou trocar abas internas não representa nova entrada. Compartilhar trabalho já em andamento; entrada posterior a uma conclusão inicia outra atualização. Consultar turmas ativas importadas, sem reimportar cadastros. Buscar pontuação mínima e recalcular ranking usando a regra existente. Publicar os novos pontos para Turmas e Agenda, sem exigir recarga.

Falha na pontuação não invalida correções já salvas: sinalizar ranking pendente e permitir retomada dessa etapa. Não anunciar atualização integral se só uma parte concluiu.

### R05 — Pagamentos, extrato e resumos

**Confirmado pelo usuário:** uma atualização diária quando faltarem cinco dias para o pagamento. Qualquer mudança nos pagamentos deve refletir em extrato e área de pagamentos.

**Proposto a partir da política discutida:** janela inclusiva de D−5 até D, primeira entrada em Pagamentos naquele dia, usando a data prevista vigente e o fuso configurado. Fora da janela, atualização manual. Dias perdidos não geram uma consulta por dia atrasado. Definir a data diária por conta e período, sem misturar competências com datas diferentes.

Após importação ou alteração manual persistida, invalidar/recalcular extrato, resumos, gráficos e valores da Agenda que dependam desses dados. Não fazer nova consulta externa para cada consumidor. Preservar a proteção existente para pagamentos marcados como recebidos. Falha não consome a atualização diária. Janela final e gatilho de acesso são propostas em D04.

### R06 — Notificações

**Confirmado pelo usuário:** após atualizar presença ou atividades, conferir os dados novos e criar/atualizar notificações quando necessário.

**Proposto:** emitir evento somente após persistir os dados, invalidar o cache de origem e reconciliar as turmas afetadas. Não duplicar casos, nem perder estados de leitura e contato. Se a reconciliação falhar, manter revisão pendente para retomada sem repetir a importação externa. Ausência de mudança pode dispensar escrita, mas a checagem deve ocorrer após atualização bem-sucedida.

Manter avaliação local nos vencimentos de atividades e nas mudanças de configuração, mesmo sem consulta Kodland: remover o intervalo indiscriminadamente faria alertas por prazo deixarem de surgir. Não enviar mensagens automaticamente.

### R07 — Gravação

**Confirmado pelo usuário:** verificar a gravação após a aula.

**Proposto conforme discussão:** elegibilidade após `end_at`; buscar apenas ocorrências concluídas sem link. Se a gravação ainda não existir, manter pendente e tentar nos próximos acessos à Agenda, espaçando tentativas em 30 minutos por ocorrência. Link encontrado encerra a busca automática. Aula cancelada, resposta desconhecida ou falha não deve produzir link inventado nem apagar link salvo.

Cadência e limite de idade de pendências antigas ficam em D05. Conferência de gravação não reabre conferência final de status de uma aula extra: são estados independentes.

### R08 — Link da chamada na grade

**Confirmado pelo usuário:** atualizar a grade 15 minutos antes da aula, buscar no cronograma o link para iniciar a chamada, mostrar um ícone quando disponível e abrir a página da chamada com dois cliques/toques consecutivos na aula, em vez de abrir o modal.

**Proposto:** trabalho por ocorrência em `start_at − 15 minutos`, incluindo aulas extras quando a fonte fornecer chamada. Com a grade aberta, agendar o próximo instante relevante; ao entrar ou retomar dentro da janela e durante a aula, recuperar a consulta vencida. Não abrir chamadas automaticamente.

1. Consultar somente cronograma/evento necessário. Persistir URL retornada para aquela ocorrência, horário da busca e identidade da fonte. Não reutilizar link de outra data da turma.
2. Mostrar ícone reconhecível de vídeo com rótulo acessível “Chamada disponível”, título e área acionável mínima de 44px. Oferecer “Abrir chamada” no modal como alternativa por teclado e gesto simples no celular.
3. Clique/toque simples continua abrindo detalhes. Adiar a abertura apenas durante a janela de detecção do segundo toque; proposta inicial: 300 ms, a ajustar em teste móvel. Dois toques devem abrir exatamente uma página, sem modal intermediário. Ação no ícone não propaga para o cartão.
4. Sem URL válida, manter os detalhes acessíveis e informar indisponibilidade; não navegar para vazio. Bloqueio de nova aba deve oferecer link acionável. Navegação deve partir diretamente do gesto do usuário, sem aguardar busca assíncrona.
5. Não chamar automaticamente APIs que iniciem a reunião: abrir a página de início fornecida pela Kodland é o efeito solicitado. Não testar iniciando uma aula real.
6. Validar protocolo e origem a partir dos provedores reais confirmados; rejeitar URLs executáveis. URL de anfitrião pode conter segredo: excluir de logs, telemetria e exemplos públicos. Expirar/inutilizar na troca de ocorrência ou remarcação; não copiar para exportações sem decisão explícita.

**Pendente D01:** confirmar na Kodland a ação, fonte, URL, disponibilidade temporal e validade. Não inventar endpoint ou confundir URL de participante com URL de início do professor. Se a fonte não disponibilizar o link aos 15 minutos, sinalizar indisponível e aplicar a política de recuperação proposta em D06.

## Arquitetura proposta

Manter a arquitetura atual do frontend e a rota autenticada da integração. Introduzir um coordenador compartilhado de sincronização, políticas puras de elegibilidade temporal e executores por escopo. Evitar um intervalo global que execute sincronização completa.

Fluxo lógico proposto:

```text
Entrada na página / retomada / marco temporal / ação manual
  → política por conta, escopo e ocorrência
  → fila compartilhada e autorização do recurso
  → consulta mínima à Kodland
  → validação e persistência dos campos daquele escopo
  → revisão de dados confirmada
  → ranking / extratos / notificações / atualização da interface
```

O diagrama textual representa sequência lógica, sem afirmar uma transação remota global. Registrar a revisão e a pendência dos derivados de forma recuperável; só reconhecer o sucesso após persistência. Uma falha em derivado deve permitir retomá-lo isoladamente.

### Contratos e módulos

- Políticas puras propostas: `frontend/src/lib/sync-policy.ts`, cálculo de janelas e chaves de ocorrência com relógio injetável.
- Coordenador proposto: `frontend/src/lib/sync-coordinator.ts`, deduplicação, fila, retomada e prioridades.
- Estado proposto: `frontend/src/lib/sync-state.ts`, persistência isolada por UID e adaptador demo sem integração real.
- Eventos propostos: `frontend/src/lib/sync-events.ts`, revisões de correções, presença, pontos, pagamentos e agenda.
- Integrar grade em `dashboard-page.tsx`, Acompanhamento em `corrections-page.tsx`, consumidores financeiros e provider de notificações. Usar o shell para um único coordenador por sessão, sem timers independentes por cartão.
- Separar contratos lógicos de `activities`, `attendance`, `ranking`, `extras_discovery`, `extra_final_check`, `recordings`, `call_link` e `payroll`. Nomes são propostos; não são endpoints existentes.
- Manter compatibilidade com ações manuais existentes. Contratos novos devem declarar campos, janela, IDs cobertos e completude; campo omitido significa “não consultado”, nunca “apagar coleção”.
- API revalida UID e vínculo do professor com turma, aula e período em cada execução. IDs do cliente apenas restringem escopo; não concedem autorização.

### Estado e consistência

Persistir por conta/escopo/recurso: chave da ocorrência externa, `scheduled_start_at`, `scheduled_end_at`, fuso, `last_attempt_at`, `last_success_at`, `next_due_at`, estado, revisão da fonte, revisão reconciliada, erro sanitizado e versão da política. Estados adicionais: `final_checked_at` para extra, `attendance_checked_at`, estado da gravação e estado do link da chamada.

Proposta: metadados duráveis privados da conta e cache local; determinar a coleção concreta após revisar regras existentes. Se for usado um lease entre dispositivos, aquisição deve ser atômica, ter expiração e token de posse; cliente desatualizado não pode concluir uma execução cuja posse perdeu. Deduplicação em memória não garante execução única entre dispositivos.

Fuso vem da agenda/configuração, sem usar implicitamente o relógio local da máquina. Instantes em UTC e chaves de dia calculadas no fuso de negócio. Cancelar tarefas de aulas canceladas. Remarcação altera a identidade temporal/revisão e invalida timers, link e marca de presença referentes ao horário anterior. Respostas antigas não podem sobrescrever a ocorrência remarcada.

Falha parcial preserva campos salvos, status financeiros, materiais, contatos e links válidos. Não executar exclusão global a partir de resposta parcial. Atualização manual usa a mesma fila; pode ignorar elegibilidade, mas mantém autorização, isolamento e limites.

### Leveza e operação

- Proposta: uma sincronização externa por conta em execução, com chamadas internas limitadas pelo controle existente. Prioridade: link iminente, operações manuais, entrada em Atividades e depois pendências vencidas.
- Deduplicar aba/sessão e coordenar abas; validar mecanismo entre dispositivos na etapa T02. Definir timeout/orçamento por escopo antes de processar lotes grandes.
- Desconectado, aba oculta ou credenciais indisponíveis: não disparar novas consultas; registrar pendência. Login expirado não entra em repetição contínua; pedir reconexão na área de integração.
- Repetir falhas transitórias com espera crescente e respeitar limites da fonte. Sem consulta contínua para resposta de gravação/link ainda indisponível.
- Com app fechado, tarefas temporais rodam na retomada. Esta proposta não promete execução pontual em segundo plano nem inclui servidor agendado com senha do professor.
- Exibir estado discreto por área: última atualização, em andamento, pendente ou falha. Manter dados atuais utilizáveis.
- Medir quantidade/duração de chamadas e itens alterados por escopo, sem credenciais, URLs de anfitrião ou informações de alunos nos logs. Comparar cenários iguais antes/depois; meta de redução depende da linha de base.

## Etapas de implementação e aceite

| ID | Entrega | Dependências | Aceite verificável |
|---|---|---|---|
| T01 | Confirmar contrato Kodland e produzir fixtures sanitizadas | Acesso à plataforma | Identificar chamada do professor, evento/ocorrência, origem dos pontos e consultas mínimas; registrar o que foi observado sem iniciar aula real. |
| T02 | Políticas temporais, estado e coordenador | Regras e decisões D02–D06 aplicáveis | Relógio controlado cobre fronteiras; recarga preserva conclusões; abas não duplicam; falha não marca sucesso; troca de conta cancela e isola trabalhos. |
| T03 | Separar API/persistência por escopo | T01 para contratos afetados; T02 | Atividades não consulta presença, disponibilidade ou perfis; presença não consulta correções; resposta parcial não apaga dados fora do escopo. |
| T04 | Extras e gravações | T02–T03 | Extra ministrada não é reconferida; futura conhecida não busca detalhe; pendência da semana anterior é conferida; gravação encontrada encerra buscas. |
| T05 | Presença, atividades, ranking e notificações | T02–T03 | Presença elegível em fim + 1h; entrada em página atualiza atividades e pontos; notificações reconciliam após gravação sem duplicar contato/leitura. |
| T06 | Pagamentos e consumidores derivados | T02–T03; D04 | Uma consulta bem-sucedida por dia/período na janela; mudança manual/remota atualiza extrato e resumo, sem nova consulta por consumidor. |
| T07 | Grade, link e gesto duplo | T01–T03; D01/D06 | Em início − 15min busca ocorrência correta; ícone aparece só com URL válida; dois cliques/toques abrem uma chamada sem modal; alternativa acessível funciona. |
| T08 | Integração, documentação e entrega | T04–T07 | Checks afetados passam; demo não acessa Kodland; docs, estado atual e novidade representam somente comportamento validado. |

### Cenários obrigatórios de teste

1. T02/R08: relógio em 16 e 15 minutos antes do início; abrir a grade a 10 minutos; dormir/retomar; remarcação e cancelamento; duas aulas simultâneas com chaves distintas.
2. T04/R02: domingo → segunda, extra nova, futura conhecida, ministrada, confirmação negativa definitiva, consulta incompleta e falha com retry. Conferência de gravação continua independente do status final.
3. T05/R03: fim + 59min não consulta; fim + 60min consulta; múltiplas entradas não repetem sucesso; estado não marcado não vira ausência.
4. T05/R04: entrar, sair e retornar consulta novamente; rerender/filtro não consulta; duplo disparo em execução compartilha trabalho; pontos mudam ranking sem alterar cadastro.
5. T06/R05: D−6 não consulta, D−5 consulta, segunda entrada no mesmo dia não, dia seguinte sim; datas em virada do mês/ano e fusos; falha permite nova tentativa; competência recebida mantém proteção.
6. T05/R06: dados novos, nenhuma mudança, regularização, estado desconhecido e falha de reconciliação; prazo local vence sem nova importação e continua gerando alerta conforme configuração.
7. T07/R08: clique simples, duplo, toque móvel, teclado, ícone, URL ausente/inválida/expirada, bloqueio de pop-up e ausência de modal intermediário. Conferir em 320/390/1440px.
8. T03/T08: requisições reais substituídas por fixtures nos testes; comprovar ausência de chamadas a cadastro, materiais e disponibilidade nas rotinas automáticas. Troca de conta não vaza resultados.

Validação planejada: testes unitários das políticas/coordenador e persistência, testes da rota por escopo, E2E das jornadas e inspeção visual do gesto/ícone. Usar `npm.cmd run web:typecheck`, `web:lint`, `web:test`, `web:build` e `web:e2e` conforme scripts vigentes; revisar configuração do Playwright antes de executar. Nenhum desses testes é declarado executado por este documento.

## Decisões localizadas e próximos passos

| ID | Estado e responsável | Proposta / questão | Impacto |
|---|---|---|---|
| D01 | Pendente de evidência; implementação | Verificar cronograma na Kodland, link de início do professor, origem e expiração; identificar pontos do ranking. | Bloqueia integração real correspondente em T01/T07; mocks e políticas podem avançar. |
| D02 | Proposto; produto | Semana segunda–domingo; extra só recebe conferência final a partir do dia seguinte no fuso configurado. Descoberta de novas extras ao entrar na Agenda. | Fechar fronteiras de R02 antes de T04. |
| D03 | Proposto; produto | Uma única conferência válida de presença em fim + 1h; “não marcado” permanece desconhecido e passa a depender de atualização manual. | Se desejada espera por marcação, definir cadência e encerramento antes de T05. |
| D04 | Proposto; produto | Pagamentos na primeira entrada em Pagamentos de cada dia, de D−5 até D inclusive. | Definir se pagamento pendente após D continua automático; não pressupor extensão da janela. |
| D05 | Proposto; produto | Gravação em fim da aula e próximos acessos, intervalo mínimo de 30min. Não executar varredura de todo histórico na migração. | Definir horizonte histórico e eventual prazo de encerramento antes de ativação ampla de T04. |
| D06 | Proposto; produto/integração | Se link não vier aos −15min, tentar novamente ao retomar/acessar, no máximo a cada 5min até o fim da aula; manter ação manual. | Depende de D01; evitar consulta infinita para aula encerrada. |

As regras expressas pelo usuário estão consolidadas; D02–D06 detalham escolhas que ainda não foram explicitamente confirmadas. Não transformar as sugestões anteriores do assistente em decisões do usuário. Não bloquear escrita do plano por essas lacunas; confirmar apenas a parte necessária antes de implementar o comportamento dependente.

## Migração, entrega e reversão

Habilitar automação por escopo progressivamente. Metadados ausentes não significam “já conferido”, nem autorizam varrer o histórico inteiro: considerar extras pendentes importadas e uma janela inicial explícita de presença/gravação a definir em T02/D05. Preservar dados existentes. Conferir inclusão/reset dos novos metadados no backup; descartar URLs temporárias de anfitrião ao restaurar e buscá-las novamente na ocorrência elegível.

Reversão desliga os gatilhos automáticos e mantém consulta manual e dados salvos. Não executar deploy, iniciar reunião, enviar mensagens ou alterar contas reais como parte da elaboração deste plano. Na entrega funcional, adicionar versão crescente em `frontend/src/lib/release-notes.ts` conforme `docs/RELEASE_NOTES.md` e atualizar `.codex/memory/current-state.md`; não anunciar agora uma funcionalidade ainda planejada.

## Verificação inicial do plano (histórico)

Confirmados por leitura: acoplamento dos modos de sincronização, dependências da grade, fonte local do ranking e gatilhos atuais de notificações. Grafo local gerado e consultado para `dashboard-page`. O arquivo `repo-map.md`, as checklists de `.codex/agents/` e a skill local referenciados pelo AGENTS.md não estavam nos caminhos indicados nesta sessão.

Tentativa de consulta da plataforma: host de acesso ao navegador indisponível; leitura da janela Chrome também falhou por estar minimizada. Nenhum contrato de chamada foi confirmado pela plataforma. Registrar validação real em T01, sem alegar observação do link.

Revisão documental: coerência de gatilhos, dependências, falhas, isolamento, fronteiras temporais e separação entre confirmação/proposta. Sem alteração de código de aplicação ou execução de testes funcionais nesta etapa.

## Execução T01 — contratos locais e públicos verificados em 29/10/2026

**Confirmado por código e documentação local, sem nova consulta autenticada à Kodland:**

- Ranking: `studentsFromPayload` em `frontend/src/app/api/kodland/sync/route.ts` soma `progress_info[].module_current_grade` e `module_max_grade` do `GET student_groups/{groupId}/get_students_main_data/`; gera `progress_summary` como `atual/total`. `student-ranking.ts` usa o numerador para ordenar alunos ativos. Para T03, devolver apenas patches `{ id, external_id, external_class_id, progress_summary }` e persistir somente pontuação nos alunos já importados. Não chamar detalhe de perfil para atualizar pontos. Se o progresso vier ausente/inválido, declarar pontuação indisponível e preservar o valor anterior, sem converter ausência em zero.
- Presença mínima: o mesmo `get_students_main_data` fornece `progress_info[].lessons_data[].attendance_status`, com códigos `0=ABSENT`, `1=EXCUSED`, `2=PRESENT`, `9=UNKNOWN`; `attendanceFromStudentsPayload` já normaliza. Para consulta agendada, usar essa fonte conhecida diretamente e restringir os patches aos `lesson_id` pendentes, vinculando-os ao cronograma local já salvo; evitar as quatro tentativas de aliases de `attendanceForGroup` e não executar `lessonsForGroup` (que também busca catálogo e gravações). Se a ocorrência pedida não estiver representada na resposta, não marcar sua conferência como concluída.
- Extras novas: o contrato já usado é `GET teachers/{teacherId}/get_teacher_extra_lessons_timetable/?date=YYYY-MM-DD`. O código informa que `date` restringe a semana; `extrasFromTeacherAgenda` normaliza `start`/`end`, aluno e IDs. Para descoberta automática, consultar apenas uma data na semana atual, eliminar IDs conhecidos antes de detalhar e não chamar `teacher_timetables` (disponibilidade). O modo manual atual consulta semanas adjacentes; isso não é necessário ao escopo automático.
- Conferência final de extra: `GET extra_lesson_reports/by_extra_lesson/{extraLessonId}/` já existe em `extraLessonReportWasCompleted`; o ID é da extra e não o UUID da solicitação. O teste `extra lesson reconciliation` cobre `outcome: completed` e `outcome: cancelled`. Para T03/T04, separar resultado válido negativo de resposta sem `outcome` reconhecido: a função atual retorna `false` inclusive para objeto vazio, o que não basta para encerrar a conferência automática. `null` é falha na consulta. Restringir ao ID da extra pendente, sem listar todas as agendas dos alunos.
- Gravações por turma: `GET https://zoom-service.kodland.org/api/zoom_recording/get_videos_by_student_group_id/{groupId}` já é usado; `recordingsFromPayload` associa por `lesson_id`, com prioridade `s3_url`, `download_url`, `zoom_play_cloud_link`. Buscar só turmas com ocorrências elegíveis e gravar somente links correspondentes, preservando os existentes. O serviço exige a chave pública de integração já presente na rota; não é credencial do professor.
- Gravações de extra: `GET https://zoom-service.kodland.org/api/zoom_recording/get_videos_by_booking_id/{bookingId}` já é usado; `recordingAvailableForBooking` retorna apenas disponibilidade (`boolean | null`). Para fornecer URL na Agenda, estender o parser do mesmo payload com fixture sanitizada e manter o ID do booking; não confundir mera disponibilidade com um link reproduzível.
- Cronograma: `GET student_groups/{groupId}/schedule_view/` e `timetable_time` são fontes existentes de ocorrência. O parser atual `kodland-lessons.ts` lê `lesson_url`, `lesson_link`, `view_url`, `external_url`, `external_link`, `link` e `href` como link genérico; o enriquecimento pode substituí-lo pela página do curso. Nenhum desses campos está confirmado como ação de início de chamada.

**D01 — contrato público confirmado; comportamento de conta real ainda não testado:** após as tentativas iniciais sem acesso ao navegador e sem retorno útil do HTML, o agente principal obteve e inspecionou os bundles públicos oficiais [zoomConference-B14TZ8qu.js](https://bo.kodland.org/assets/zoomConference-B14TZ8qu.js), [index-BkfYZVws.js](https://bo.kodland.org/assets/index-BkfYZVws.js) e a configuração pública `runtimeConfig.js`. Evidência de código público não equivale a observar uma reunião disponível na conta do professor.

- Turmas: o helper exportado `f` (`g`) faz `GET ${VITE_ZOOM_SERVICE_API}api/zoom_conference/get_nearest_by_group_id/${groupId}` com a chave pública de integração já usada pela rota; resposta 404 equivale a `null`. A configuração pública define `VITE_ZOOM_SERVICE_API` como `https://zoom-service.kodland.org/`.
- Resposta de sessão: `lesson_id`, `session_id`, `session_start_time` e `session_end_time`. O helper `g`/`S` exige o mesmo `lesson_id` da ocorrência e horário atual entre início −60 minutos e fim. A página do professor consulta o endpoint ao selecionar `scheduleItem.group_id` e usa `start_time` do item como `timetable_time`; só disponibiliza a ação no estado `active`. Para o produto, manter o gatilho solicitado de início −15 minutos, mesmo que o provedor permita uma janela maior.
- URL da chamada: o helper `b`/`$` compõe `VITE_PLATFORM_URL + locale + 'class-room?sessionId=' + session_id` usando `URLSearchParams`; a configuração confirma base `https://learn.kodland.org/`. Usar a construção observada e o locale vigente, sem interpretar `external_url` como chamada.
- Extras: o cronograma expõe `classroom_session_id` e `is_classroom_url_visible`. O helper `h`/`k` só retorna `active` quando a flag está habilitada e o fim da ocorrência ainda não passou; a URL usa a mesma rota `class-room` com `sessionId`. Não reutilizar sessão de extra diferente.
- T03/T07 devem validar correspondência de `lesson_id`, ocorrência e horários antes de disponibilizar o link: o endpoint retorna a sessão mais próxima, que pode pertencer à próxima aula. Não persistir a URL em outro evento. Ausência, conflito de IDs ou janela inválida mantém a chamada indisponível.
- O GET apenas consulta a sessão; abrir a URL ocorre por gesto do usuário. A investigação não iniciou chamada, não autenticou conta e não confirmou disponibilidade ou duração de sessão real.

**Critérios de T03 recomendados:** todos os escopos retornam IDs autorizados, campos consultados e sinal de completude por recurso; patch parcial não significa substituição global. A autorização deve continuar consultando o vínculo do professor e não confiar em cadastro enviado pelo cliente. Uma resposta HTTP 200 incompleta não conclui presença, status final, ranking ou link.

T01 está concluída para o levantamento local de ranking, extras e gravações e para o contrato público da chamada. A integração pode implementar esse contrato com fixtures sanitizadas; validação autenticada na conta real continua pendente e deve ser descrita como tal. Nenhuma reunião foi iniciada, conta alterada ou código da aplicação modificado por esta investigação.

## Execução T02 — políticas e coordenação

Implementado em `frontend/src/lib/sync-policy.ts`, `sync-state.ts`, `sync-coordinator.ts` e `sync-events.ts`. Sem alterações de API ou UI nesta etapa.

- Políticas puras usam fuso explícito validado, com fallback `America/Sao_Paulo`. `calendarDay`, `weekBounds`, `zonedInstant`, `occurrenceTimes` e `occurrenceKey` resolvem datas sem depender do fuso do computador. Nova data/horário invalida a chave da ocorrência. Dados sem horário válido não geram prazo inventado.
- Decisões: `attendanceDecision`, `extraFinalCheckDecision`, `recordingDecision`, `callLinkDecision`, `payrollDecision`; `isNewExtraThisWeek` filtra descoberta e `withinInitialWindow` limita bootstrap a 7 dias. Recebem relógio e histórico, sem consultar plataforma.
- `getSyncCoordinator(uid).enqueue(job)` compartilha promises por chave, serializa escopos e prioriza chamada. `job` contém `key`, `scope`, `resourceId`, `isDue(state, now)` e `run(context)`. `run` devolve `{ value, completed?, nextDueAt?, revision?, domains? }`; `completed:false` significa consulta válida com dado ainda pendente. Eventos são publicados somente após conclusão persistida.
- O executor deve respeitar `context.signal`, executar `assertCurrent()` após operações assíncronas e `await assertLease()` imediatamente antes de cada etapa de persistência. Esses guards impedem resposta tardia de gravar após troca de conta, timeout ou perda de lease. `initialisedAt()` fornece marco durável do bootstrap. `read(identity)` fornece histórico para montar candidatos.
- Metadados em `users/{uid}/sync_status/auto_entry_*`, inicialização em `auto_config` e lease global em `auto_lock`, sob regras privadas existentes. Transações verificam token e expiração na renovação/conclusão; holder vencido não conclui lease de outro executor. Web Locks acrescenta coordenação entre abas e transação mantém controle entre dispositivos. Lease depende do relógio do cliente; não equivale a processamento com app fechado.
- Leituras de metadados têm cache em memória por UID de até 60s; claim sempre lê estado transacional atual. Próximo runtime deve manter um snapshot de candidatos e agendar o próximo prazo, evitando ler todos os documentos a cada tick/cartão. `createMemorySyncStateStore()` permite testes/demo sem Firebase. Metadados/eventos não guardam credenciais ou URLs.
- Falhas preservam último sucesso e armazenam apenas código sanitizado, com espera crescente de 15s até 5min. Chamador deve respeitar `next_due_at` e tratar `auth_required` pedindo reconexão, sem repetição de login em loop.

Validação executada: 22 testes de políticas/coordenador passaram; `npm.cmd run web:typecheck`, lint dos seis arquivos e `git diff --check` passaram. Cobertura: fronteiras semana/dia/fuso, remarcação, prazos, bootstrap, deduplicação, serialização, sucesso persistido após recarga, resultado pendente, falha, lease entre executores, conta alterada e resposta tardia após timeout. Firestore real/emulador não executado nesta etapa.

### Ordem de execução restante

T03 está em implementação de contratos e persistência. A parte T07a (controle isolado do gesto de clique/toque e validação de link, sem integrar a grade) pode avançar em paralelo: usa somente props e testes locais, não depende de APIs novas e toca arquivos diferentes. T04–T07b integrarão runtime e telas depois de T03 e T07a verificados. T08 fecha backup, documentação e validação conjunta.

## Execução T07a — gesto isolado

Componente `schedule-entry-action.tsx` e helper `schedule-call.ts` implementados, sem integração à grade ainda. Botão de detalhes e link de vídeo são irmãos; clique/toque duplo abre uma chamada e suprime modal intermediário, teclado mantém detalhes imediatos. URL oficial, ocorrência e janela temporal são validadas. 22 testes próprios passaram, repetidos pelo orquestrador. Integração T07b e validação no navegador permanecem pendentes.

## Execução T03 — API e persistência por escopo

Implementados `kodlandApi.syncScope(username, password, request, context?)` e os contratos em `frontend/src/lib/kodland-scoped-sync.ts`. `request` contém `scope`, `group_ids?`, `occurrence?`, `week_date?`, `known_extra_ids?`, `time_zone?`. Ocorrência: `kind`, ID local, `group_id`, `source_lesson_id`, `lesson_date`, `start_time`, `end_time`, `booking_id?`, `external_student_id?`. Retorno: `complete`, `updated`, `domains`, e campos específicos (`ranking_complete`, `recording_url`, `call_url`, `final_completed`). O runtime deve devolver `domains` ao coordenador; quando há `context`, a API não publica evento antes do sucesso dos metadados.

- A rota aceita `mode: scoped` e separa atividades/pontos, presença, descoberta semanal de extras, conferência final, gravações e link de chamada. Somente consulta recursos necessários; não busca perfis, catálogo de materiais ou disponibilidade nesses escopos. Atividades ainda consulta a lista de aulas realizadas e o progresso de cada uma, porque esse é o contrato existente de correções.
- Autorização: deriva o professor do token Kodland, confere turmas na lista autorizada e extras no cronograma do próprio professor. Para ocorrência, lê somente o documento `users/{uid}/kodland_lessons|kodland_extra_lessons/{id}` via Firestore REST com o ID token Firebase do usuário. Datas/IDs do cliente não substituem a ocorrência salva. Uso de ID token e regras privadas confirmado em https://firebase.google.com/docs/firestore/use-rest-api. Nenhum novo requisito de credencial Admin.
- Persistência por patches; ranking altera apenas `progress_summary` de alunos já importados, nunca cria aluno nem troca contato. Presença altera apenas registros da aula solicitada. Gravação não apaga link salvo. Extras novas usam inserção transacional sem sobrescrever conhecidas. Conferência final aceita somente outcomes documentados `completed` e `cancelled`; objeto vazio/estado desconhecido falha e não conclui.
- Transações revalidam ocorrência e estado manual antes de aplicar chamada, gravação e relatório final. `DONE`/`ACCOUNTED` concorrente é preservado. Callback de lease e conta é verificado antes de gravar e nos retries de transação; respostas após remarcação são rejeitadas.
- Chamada regular usa endpoint público confirmado, aula e início exatos, sessão ainda válida e fim da sessão suficiente para cobrir a aula. Extras usam `classroom_session_id` e flag de visibilidade. URL permitida: sala de `https://learn.kodland.org/pt/class-room?sessionId=...`; não se usa `external_url`. A janela de produto é −15 minutos até fim. Testes não iniciam reuniões.
- `kodlandPayrollApi.syncForPaymentDate(username, password, paymentDate, context?)` importa somente a competência do mês anterior ao pagamento. A rota consulta lista autorizada e um único detalhe; índice mantém outros períodos. Professor vinculado é revalidado em transação. Período incompleto não consome sucesso diário. As confirmações financeiras recebidas continuam separadas.
- Correções manuais antigas também passam a atualizar pontos e publicar evento; seu acoplamento legado com presença/cronograma permanece por compatibilidade. O runtime/ação nova deve usar `syncScope` para a atualização leve.

Handoff T04–T08: campos efêmeros de chamada em aulas e extras: `call_url`, `call_occurrence_key`, `call_checked_at`, `call_expires_at`; excluir do backup e invalidar na remarcação/restauração. Extra tem `final_checked_at` durável e `recording_url`. Resultado `complete:false` de gravação/chamada é consulta válida ainda pendente; presença incompleta também permanece pendente. `ranking_complete:false` preserva pontuação anterior; runtime deve registrar/mostrar a pendência. As ações manuais legadas (`sync`, `syncAll`, folha completa) ainda precisam compartilhar fila externa sem deadlock; o coordenador foi integrado somente por contrato de contexto nesta etapa.

Custo por ocorrência: autenticação, lista de turmas, uma leitura do documento salvo e consulta da fonte do escopo; extras incluem cronograma semanal para autorização. Há oportunidade de agrupar ocorrências de mesma turma em uma consulta; não foi criado batch novo nesta etapa.

Validação T03: 18 testes novos de rota/persistência passaram, cobrindo chamadas proibidas ausentes, autorização, ocorrência autoritativa, ranking incompleto, extra negativa/desconhecida, descoberta de novas extras, link correto, gravação pendente, troca de conta, lease e mudança manual concorrente. Também passaram os 54 testes afetados existentes, typecheck, lint dos seis arquivos alterados/criados e `git diff --check`. Firestore real/emulador e conta real Kodland ainda não executados.
Extensão T03 para retomada parcial: `scope: ranking` consulta somente `get_students_main_data`, atualiza apenas pontos e publica domínio `ranking`. Não consulta aulas/correções nem remove reviews/progresso existentes. Permite retomar falha de pontuação separadamente. Incluídos dois testes adicionais para essa garantia; total dos novos testes T03: 20.
## Execução T06 — pagamentos e consumidores financeiros

- `auto-sync-payroll.ts` executa atualização somente na entrada de Pagamentos, de D−5 até D inclusive, pelo fuso já carregado no provider. Chave durável por competência evita repetir consulta quando há datas de pagamento diferentes no mesmo mês. Sucesso permite outra consulta no dia seguinte; falha mantém o dia pendente. Períodos recebidos ficam fora da atualização automática.
- Sem candidatos elegíveis ou em demo, o helper retorna antes de resolver Firebase, preferências ou credenciais. A integração desativada impede trabalho externo. Erro de autenticação/permissão suspende novas tentativas na sessão; `resetAutomaticPayrollAuthentication(uid)` permite retomada após reconexão explícita. T08 deve ligá-lo ao evento de credenciais salvas. O coordenador é resolvido a cada job para funcionar na sequência conta A → B → A.
- `payments-page.tsx` mantém o conteúdo durante a atualização, escuta eventos financeiros por UID e recarrega lista e extrato aberto a partir dos dados persistidos, sem nova chamada Kodland. Foco da competência é preservado. O adapter de demonstração não entra nesses caminhos.
- `api.ts` publica eventos depois de persistir confirmação/estorno/status de pagamento, alteração financeira de aula, criação/cancelamento de extra, status de extra Kodland, tarifa e configuração financeira Kodland e importação manual da folha. Consumidores da Agenda devem assinar `subscribeSyncDataChanged(uid, ...)` para domínio `payments` e recarregar apenas dados locais/remotos já persistidos; T07b faz essa ligação.
- Verificado: 9 testes de política/integração de folha automática (incluindo D−6/D−5/D/D+1, recarga, falha, fuso, duplicação de competência, bloqueio de autenticação e troca de contas), mais 20 testes de API afetados, typecheck, lint dos arquivos e diff check. Conta real não foi consultada nesta etapa.

## Execução T04 — runtime autenticado

Implementados `auto-sync-runtime.ts`, `auto-sync-controller.tsx` e montagem no Shell autenticado. Um timer por conta e snapshot em memória, com descarte de candidatos encerrados/futuros antes de ler metadados remotos. Pausa offline/oculto/autenticação inválida, retomada e intervalos por escopo. Presença fim +1h, extras pendentes inclusive de semana anterior, descoberta na entrada da Agenda, gravações nos acessos elegíveis e chamadas em −15min/retry5min. Ranking parcial retoma por escopo separado. Interface T05: `runActivitiesSync(uid,{manual?})`; runtime expõe invalidate/resume/reconnect/status. Dez testes runtime e nove de pagamentos foram repetidos pelo orquestrador e passaram; typecheck também passou. Reconexão por credenciais e integração Acompanhamento/notificações seguem em T05/T08a.

### Dependências finais

T07b integra somente grade/Turmas e harness de interface. T05 integra Acompanhamento/notificações/controller. T08a fecha backup, coordenação manual e evento de credenciais em API/helpers. Essas partes usam contratos verificados, tocam arquivos disjuntos e avançam em paralelo; a aceitação final T08b depende de todas concluídas. Validação autenticada em conta real continua pendente, sem bloquear fixtures e testes locais.

## Fechamento da implementação — T05, T07b e T08

- T05: Acompanhamento usa `runActivitiesSync` ao entrar e na ação manual; filtros e abas não iniciam importação. Eventos atualizam dados persistidos. Notificações reagem a presença/atividades e a próximos prazos usando fonte em cache, com retomada em falha; removida a varredura remota a cada minuto. Provider e cache isolados por UID. Credenciais corrigidas e sucesso manual liberam a pausa de autenticação.
- T07b: grade com ícone de vídeo de 44px, gesto duplo e alternativa Abrir chamada nos detalhes. Ocorrência, cancelamento, horário e fuso validam disponibilidade. Agenda e ranking em Turmas reagem aos eventos. Harness de teste usa componente e CSS reais, sem rota de teste no produto e sem alterar o armazenamento demo.
- T08: ações manuais de sincronização, folha, materiais e importação compartilham a fila; `syncAll` não mantém envelope aninhado. Eventos atravessam abas por storage, sem credenciais/URLs e sem eco. Backup descarta campos temporários de chamada; importação invalida valores antigos e preserva conferência final de extras e gravações. Reset limpa `sync_status`; não entra no envelope porque removeria seu próprio lease, mas guards rejeitam gravação de executores que perderam a posse.
- Operação: `docs/AUTO_SYNC.md`. Novidade web `2026102901`, sem mudança da versão Expo/APK. Código não foi publicado nem executado em conta real.

### Verificação final executada pelo orquestrador

- `npm.cmd run web:test`: 57 arquivos e **394 testes passaram**.
- `npm.cmd run web:lint`: passou.
- `npm.cmd run web:build`: passou, incluindo TypeScript e geração das 24 páginas.
- Playwright: 17 cenários únicos de pagamentos, pendências, novidades, notificações, modal de sincronização e grade em 320/390/1440px validados. Na execução junto ao build, três atingiram timeout; repetidos com um worker após o build, os três passaram sem mudança de código. Os demais 14 passaram na primeira execução.
- Capturas da grade inspecionadas com o ícone dentro do viewport, sem overflow da página. Gestos duplos, teclado, extras, cancelamento, remarcação e expiração cobertos por testes próprios e harness.
- `git diff --check` sem erros. Geração do grafo concluída com permissão restrita à saída local após a falha inicial de escrita.

**Limites confirmados:** conta Kodland autenticada e emulador Firestore não foram testados. O contrato de chamada foi confirmado no JavaScript público oficial e coberto por fixtures. Automação depende de aplicação aberta; prazos vencidos são recuperados na retomada. Ainda há uma consulta por ocorrência para presença/gravações; agrupamento por turma é oportunidade posterior, sem executar sincronização completa como fallback.