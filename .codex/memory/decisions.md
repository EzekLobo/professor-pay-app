# Decisões

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
