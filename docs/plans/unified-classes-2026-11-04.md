# União de Turmas e Acompanhamento — 04/11/2026

## Escopo e aceite
Usar a estrutura existente de Acompanhamento sob destino único Turmas, com abas Atividades, Presença e Alunos. Reutilizar ClassesContent na aba Alunos preservando cadastro/edição/turmas/Kodland/manuais. Navegação principal tem apenas Turmas; antigos atalhos /corrections continuam compatíveis, incluindo notificações/foco e demo. Preservar sincronização por entrada de atividades e não dispará-la ao trocar abas. Interface responsiva320/390/1440 e acessibilidade de abas.

## Tarefas
- [x] U01: compor elementos existentes e ajustar rotas/navegação/atalhos/demo. Dependência: nenhuma. Aceite: tipos/lint e regressões de navegação/fluxos passam.
- [x] U02: atualizar testes E2E afetados e conferir fluxos Alunos/Atividades/Presença em telas pequenas e desktop. Dependência: U01. Aceite: E2E afetados passam sem remover cobertura.
- [x] U03: verificação integrada, novidade e memória operacional. Dependência: U02. Aceite: qualidade web/build e documentação com limites reais.

## Execução
Árvore já contém implementação/correções anteriores não commitadas; preservar tudo. Sem commit/deploy/conta real nesta tarefa.

- U01 implementada: destino/classes usa CorrectionsContent; ClassesContent reaproveitado na aba Alunos. /corrections preserva query no redirecionamento; demo normaliza alias. Pendências/notificações/guia/navegação atualizados. Explicit tab prevalece sobre preferência armazenada. Retorno de Alunos relê dados persistidos sem novo runActivitiesSync. TypeScript e23 testes focados passaram pelo implementador; U02 em validação.

- U02 verificada:24 E2E aprovados nos arquivos unified-classes, demo-manual, pending-activities e ui-quality. Root inspecionou screenshots desktop1440 e mobile320; corrigiu-se texto colado das abas em320 (13px/padding4px no breakpoint420, toque45px). Os4 testes unified foram repetidos com geometria de rótulos/margens e passaram. Fonte congelada; quality:web em execução.

- U03 concluída: root executou npm.cmd run quality:web com exit0 (lint, TypeScript,437 testes/62 arquivos e build24 páginas). Novidade2026110401 adicionada; docs operacionais/memória atualizados. Sem commit/deploy. Escopo limitado à web, sem alterações Expo, API Kodland ou persistência de domínio.
