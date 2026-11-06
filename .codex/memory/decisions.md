# Decisões

## 2026-11-06 — Atualização por página visível

- A pedido do usuário, tarefas/atividades, presença e grade do Resumo consultam a fonte na entrada, retomada do foco/conexão e por minuto visível; respostas persistidas atualizam as telas pelos eventos existentes. Esta regra prevalece sobre a espera de seis horas para atividades e a espera por ocorrência de presença enquanto essas áreas estiverem abertas.
- O scheduler mantém prioridade manual e serialização, pendência de navegação durante requisição e proteção de UID/integração. Atualização periódica por consulta não representa um canal push da plataforma externa.

## 2026-11-06 — Identidade de cursos Kodland legados

- O agrupamento de cursos usa `course_id` quando disponível. Quando o registro legado não informa esse identificador, usa `external_id` da turma em vez de normalizar apenas o nome; assim cursos Roblox com materiais específicos não sobrescrevem nem desaparecem no catálogo.

## 2026-11-04 — Limite de dados pessoais do aluno

- Registros de alunos persistidos no app devem conter apenas nome normalizado (nome e sobrenome), telefone e saldo de aulas, junto dos identificadores/status/progresso necessários à operação. E-mail, nome/contato de responsável, perfil e notas ficam fora do limite de armazenamento.
- A sanitização é aplicada na entrada da sincronização, nas gravações Firestore/cache, nos adaptadores manuais/demo e em backup/importação. Leituras de registros legados executam uma migração destrutiva apenas desses campos privados, com `set` por documento para não preservar chaves antigas.

## 2026-11-04 — Um scheduler com consultas por ocorrência

- A rotina ativa não faz importação automática geral de turmas/alunos nem atualiza disponibilidade/materiais. Atividades/ranking rodam ao entrar em Turmas; extras novas são descobertas ao entrar na Agenda; presença é conferida uma vez em +1h; gravações são buscadas após a aula ao acessar Agenda; links de chamada são tentados de T−15min a cada5min até o fim.
- Extras não ministradas recebem conferência final no dia seguinte; relatório conhecido (inclusive negativo) encerra com `final_checked_at`. Erro/desconhecido permanece pendente e limitado a retries.
- Uma única rotina ativa é requisito: não montar `AutoSyncController` junto ao `useKodlandAutoSync`. Escopos em cache Navegador persistem localmente e são limitados ao UID, grupo e ocorrência confirmados.
- A escolha de `ubuntu-24.04` para o job Playwright evita a incompatibilidade de Chromium do Ubuntu26.04 com Playwright1.57; confirmar no Actions após push.
- E2E financeiro do demo não deve assumir mês fixo nem que existe competência anterior. Calcular o próximo vencimento no fuso de São Paulo e navegar pela direção habilitada do carrossel.

## 2026-11-04 — Turmas reúne o acompanhamento pedagógico

- Preferência do usuário: destino único Turmas, usando a estrutura anterior de Acompanhamento com abas Atividades, Presença e Alunos. Reaproveitar os elementos e ações de cadastro existentes em ClassesContent na aba Alunos.
- /classes é canônico; /corrections mantém compatibilidade por redirecionamento com parâmetros. Estado visual legado continua legível. Voltar de Alunos relê dados persistidos sem repetir a sincronização de atividades por troca de aba.


## 2026-10-30 — Estado de sincronização e contrato financeiro

- Metadados concluídos não substituem a URL persistida da ocorrência; preservar links somente quando identidade/data/horário continuam iguais e recuperar ausentes respeitando a política temporal.
- Ativação automática depende de integração habilitada com dados importados. Marcador legado não amplia bootstrap; pendências já rastreadas sobrevivem à janela inicial. Revalidar estado autoritativo após trabalho descartado por outro executor.
- Contrato nativo mensal e vencimento no dia 15 seguinte confirmados no commit 26cd759; corrigir testes antigos, sem regressão para quinzenas.
- Grades que convertem wheel em rolagem horizontal precisam de listener nativo passive:false com cleanup; o React passivo foi reproduzido no Chromium. Permitir rolagem vertical nos limites.


## 2026-10-28 — Notificações exigem atribuição e estado explícitos

- Não inferir não entrega da fila de correções. Usar progresso por aluno/atividade e classificação comprovada por IDs; legado/desconhecido não vira cobrança. Prazo de casa sem fonte precisa de política escolhida pelo professor.
- Leitura, contato confirmado e regularização pedagógica são independentes. Abrir WhatsApp não confirma envio. Reconciliação transacional usa um marcador global por professor para rejeitar leituras antigas, gravando apenas casos alterados; não regravar histórico inteiro a cada polling.

## 2026-10-25 — Contingência apenas para histórico anterior à folha

- Meses anteriores à primeira competência oficial disponível podem usar previsão local, sinalizada no extrato. A partir da primeira folha (mesmo incompleta), manter somente a fonte oficial, sem preencher lacunas ou futuro. Não duplicar cobranças nem alterar recebimentos confirmados.

## 2026-10-25 — Projeção oficial automática para Kodland

- A pedido do usuário, folha/projeção Kodland é a única fonte financeira para turmas sincronizadas. Removidos painel de comparação, alternância e sincronização de folha separada. Atualização entra em Sincronizar tudo.
- Não preencher períodos sem dados oficiais com cálculo local. Preservar turmas manuais e snapshots recebidos. A comparação anterior fica restrita à migração interna de recebimentos legados.

## 2026-10-25 — Folha oficial sem alterar recebimentos

- Importação da folha é somente leitura remota e começa em comparação. Fonte oficial requer escolha explícita e só substitui estimativas Kodland de períodos validados; não altera receita manual nem pagamentos recebidos.
- Identidade vem do SSO; importação é atômica por UID e vinculada ao professor. Não persistir payload bruto, credenciais ou dados bancários. Backup 4.0 inclui folha, manifestos e preferência de fonte; restauração aceita versões anteriores.

## 2026-10-21 — Operação manual como padrão

- A integração Kodland é opt-in por tutor e permanece oculta quando desativada.
- O financeiro manual é calculado por ocorrência, nunca por matrícula ou presença.
- A sequência pedagógica é materializada em `manual_occurrences`; códigos de aula
  são derivados da posição real no módulo, sem assumir quatro aulas por módulo.
- Backup atual é 3.0, com compatibilidade de importação para 1.0 e 2.0.

## 29/10/2026 — Sincronização por escopo e ocorrência

Confirmado por implementação/testes locais: web usa fila por UID com lease em sync_status/auto_* e políticas por ocorrência/fuso. Escopos automáticos não reutilizam schedule/corrections legados porque eles acoplam cadastro, disponibilidade, cronograma e presença. Manuais e importação usam a mesma fila sem envelope aninhado em syncAll. Eventos após persistência renovam derivados e notificações; prazos locais usam fonte em cache. Detalhes/regras: docs/AUTO_SYNC.md e docs/plans/scoped-auto-sync-implementation.md. Contrato de sala obtido do JS público Kodland; conta real e emulador permanecem pendentes.

## Histórico incorporado de origin/master (até 61c827a)

## 2026-10-28 — Notificações exigem atribuição e estado explícitos

- Não inferir não entrega da fila de correções. Usar progresso por aluno/atividade e classificação comprovada por IDs; legado/desconhecido não vira cobrança. Prazo de casa sem fonte precisa de política escolhida pelo professor.
- Leitura, contato confirmado e regularização pedagógica são independentes. Abrir WhatsApp não confirma envio. Reconciliação transacional usa um marcador global por professor para rejeitar leituras antigas, gravando apenas casos alterados; não regravar histórico inteiro a cada polling.

## 2026-10-25 — Contingência apenas para histórico anterior à folha

- Meses anteriores à primeira competência oficial disponível podem usar previsão local, sinalizada no extrato. A partir da primeira folha (mesmo incompleta), manter somente a fonte oficial, sem preencher lacunas ou futuro. Não duplicar cobranças nem alterar recebimentos confirmados.

## 2026-10-25 — Projeção oficial automática para Kodland

- A pedido do usuário, folha/projeção Kodland é a única fonte financeira para turmas sincronizadas. Removidos painel de comparação, alternância e sincronização de folha separada. Atualização entra em Sincronizar tudo.
- Não preencher períodos sem dados oficiais com cálculo local. Preservar turmas manuais e snapshots recebidos. A comparação anterior fica restrita à migração interna de recebimentos legados.

## 2026-10-25 — Folha oficial sem alterar recebimentos

- Importação da folha é somente leitura remota e começa em comparação. Fonte oficial requer escolha explícita e só substitui estimativas Kodland de períodos validados; não altera receita manual nem pagamentos recebidos.
- Identidade vem do SSO; importação é atômica por UID e vinculada ao professor. Não persistir payload bruto, credenciais ou dados bancários. Backup 4.0 inclui folha, manifestos e preferência de fonte; restauração aceita versões anteriores.

## 2026-10-21 — Operação manual como padrão

- A integração Kodland é opt-in por tutor e permanece oculta quando desativada.
- O financeiro manual é calculado por ocorrência, nunca por matrícula ou presença.
- A sequência pedagógica é materializada em `manual_occurrences`; códigos de aula
  são derivados da posição real no módulo, sem assumir quatro aulas por módulo.
- Backup atual é 3.0, com compatibilidade de importação para 1.0 e 2.0.


## 31/10/2026 — Diagnóstico operacional sem conteúdo livre

Logs operacionais ficam em coleção global acessível apenas pelo servidor/Admin SDK,
com UID verificado e consulta exclusiva do administrador. O contrato é fechado a
códigos, estados, contagens e UUIDs: não adicionar raw Error.message/stack, payloads,
contatos, credenciais ou parâmetros de URL. Eventos do navegador são observações
best effort, não confirmação independente de ações pedagógicas ou envio de WhatsApp.


## Espera de sincronização não libera gravações em andamento (31/10/2026)

Timeout de interface encerra a espera e bloqueia próximas etapas, mas não deve soltar a fila de uma gravação Firestore já enviada. Locks acompanham a execução bruta, não a Promise devolvida ao usuário por prazo. A aquisição pode expirar/cancelar sem executar tardiamente; batches aguardam todos os workers antes de liberar o lock. Consultas/token/corpo HTTP têm limite próprio e referências técnicas, sem repetir automaticamente uma carga após prazo excedido.


## Transporte Firestore móvel e coleções sem created_at (31/10/2026)

Firestore do browser passa a long-polling forçado com respostas15s para evitar WebChannel retido por proxies; usa mais requisições em troca de previsibilidade. Não aplicar opções de navegador no runtime Node. A troca só vale ao inicializar uma nova página. Leituras de progresso/snapshots de sincronização usam allRows, pois orderBy(created_at) exclui documentos em que o campo não existe (como kodland_task_progress). Ordenação visual deve ocorrer depois da leitura quando o campo não faz parte do contrato persistido.


## Automática cede sem enfileirar (31/10/2026)

Automática só pode adquirir locks imediatamente. Operação manual ganha prioridade por intenção em todo o fluxo, usando gate distinto do write lock para não provocar aquisição recursiva; uma escrita automática já em andamento precisa terminar. Pausa por ocupação é estado normal, sem backoff de falha ou timestamp de conclusão. Sem Web Locks, coordenação é limitada à aba/sessão.


## Diferenças antes dos commits Kodland (31/10/2026)

Comparar conteúdo antes de gerar escritas, com timestamps técnicos fora da igualdade; criação ausente é preenchida uma vez e campos locais continuam sendo mesclados antes da comparação. Sincronização principal/seguimento usa100docs por lote e1worker com confirmações reais. Um WriteBatch é de uso único: recriar para uma repetição transitória, nunca chamar commit novamente no mesmo objeto. Não tentar marker de falha adicional quando o banco já recusou por quota/permissão/conexão; manter estado sem confirmação e preservar guardas/locks.

## 31/10/2026 — Sincronização orientada à ocorrência antes da migração local

- Adiar IndexedDB conforme usuário; aplicar cadências na arquitetura existente. Presença deve seguir fim real de cada aula (+30min, retry>=+60min/30min entre tentativas, máximo2), não ciclo de6h. Progresso de atividades segue6h/turma, cadastros/grade diária e metadados de link pré-aula. Pagamentos continuam manuais nesta etapa.
- Separar consultas e marcadores de atividades/presença: atualizar presença não adia a atualização de atividades. Cache de sessão reduz leituras periódicas Firebase; reavaliação de alertas pelo relógio é local, sem transação se nada mudou. Login/admin/config/coleções persistidas não migrados.

## 31/10/2026 — Cache persistente de recuperação com escolha explícita

- Entregar modo opt-in IndexedDB para dados recuperáveis Kodland durante indisponibilidade Firestore; manter autenticação e dados próprios remotos. A cópia local pode ser a fonte sem participar da fila de gravação Firebase. Nenhum dado próprio é movido ou conciliado como vazio.
- Snapshot por UID confirmado atomicamente; modo e controles locais persistidos. Operações de backup/restauração/reset continuam lendo base remota, nunca uma sobreposição de cache. Retorno a Firebase é uma nova consulta autorizada/confirmada, não upload cego de overlays locais.
- Não usar fonte parcial Kodland de mensagem para reconciliar alertas globais. Não sinalizar carga local inicial completa sem cobrir presença e atividades das turmas ativas.

## 01/11/2026 — Política global de armazenamento somente administrativa

- Remover escolha e avisos técnicos de armazenamento para usuários finais. Administração determina Navegador/Firebase globalmente; padrão Navegador mantém operação durante quota indisponível sem exigir escrita para ativação.
- Política em documento global protegido, endpoint autenticado e alteração exclusiva administrativa. Última configuração válida por UID mantém comportamento em indisponibilidade; sem histórico usar navegador. Leituras não criam documentos; confirmações administrativas só após persistência.

## 01/11/2026 — Barra deslizante e caixa única de notificações

- Substituir Mais móvel por navegação horizontal nativa com todas as áreas operacionais. Configurações fica no cabeçalho; Administração apenas dentro de Configurações, com permissões existentes.
- Novidades passam a ser entrada agregada no sino, com modal somente por clique e consulta posterior no Histórico. Não abrir automaticamente ou exibir ícone separado. Manter cursor porUID e separar leitura de novidades de confirmação de contato com responsáveis.

## 03/11/2026 — Alertas derivados independentes de commits do Firestore

- Calcular alertas Kodland confirmados no cache usando a última configuração conhecida, sem habilitar regras desconhecidas. Reconciliação deve declarar cobertura por fonte/turma/categoria para preservar casos de grupos ou fontes indisponíveis.
- Guardar shadow de configurações/histórico auxiliares, mas exigir confirmação remota para salvar novas regras e confirmar contato. Leitura local não equivale a contato ou envio de mensagem.
- Faltas e atividades de aula Kodi referem-se à última ocorrência encerrada. Classificar a última aula automaticamente e conservar unknown quando faltarem estado/inventário/horário confiáveis.
