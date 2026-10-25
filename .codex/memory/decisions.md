# Decisões

## 2026-10-25 — Folha oficial sem alterar recebimentos

- Importação da folha é somente leitura remota e começa em comparação. Fonte oficial requer escolha explícita e só substitui estimativas Kodland de períodos validados; não altera receita manual nem pagamentos recebidos.
- Identidade vem do SSO; importação é atômica por UID e vinculada ao professor. Não persistir payload bruto, credenciais ou dados bancários. Backup 4.0 inclui folha, manifestos e preferência de fonte; restauração aceita versões anteriores.

## 2026-10-21 — Operação manual como padrão

- A integração Kodland é opt-in por tutor e permanece oculta quando desativada.
- O financeiro manual é calculado por ocorrência, nunca por matrícula ou presença.
- A sequência pedagógica é materializada em `manual_occurrences`; códigos de aula
  são derivados da posição real no módulo, sem assumir quatro aulas por módulo.
- Backup atual é 3.0, com compatibilidade de importação para 1.0 e 2.0.
