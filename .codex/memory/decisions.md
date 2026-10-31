# Decisões

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
