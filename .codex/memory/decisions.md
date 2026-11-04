# Decisões

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