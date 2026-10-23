# Revisão de métricas da Kodland

Revisão: 23/10/2026. Escopo: dados do próprio professor e de suas turmas.

## Resultado da investigação

Não foi possível verificar o painel de métricas ao vivo: as requisições para
`bo.kodland.org`, `backoffice.kodland.org`, `sso.production.kodland.org` e
`www.kodland.org` receberam `403` do proxy antes de estabelecer a conexão HTTPS.
Isso não é uma resposta de autenticação da Kodland.

O repositório contém um mapa anterior de endpoints, extraído de JavaScript
público e de HAR autenticado: [kodland-endpoints.md](kodland-endpoints.md).
Esse material não identifica um endpoint específico do painel de métricas.
Não foram descobertos nem validados novos endpoints nesta revisão.

A integração web atual autentica no SSO e consulta backoffice v2. As credenciais
salvas pelo aplicativo ficam no cofre IndexedDB do navegador do usuário; elas
não estão disponíveis nesta sessão de desenvolvimento.

## Indicadores viáveis com as fontes atuais

| Prioridade | Indicador | Fonte existente | Limite e regra necessária |
| --- | --- | --- | --- |
| Alta | Presenças, faltas e atrasos por mês, turma e aluno | `KodlandAttendance`, originada da grade de presença e endpoints de presença | Considerar aulas realizadas com data válida; separar `EXCUSED` e `UNKNOWN`. Definir o denominador e exibir a cobertura antes de chamar o resultado de taxa de frequência. |
| Alta | Alunos com faltas consecutivas | Presença vinculada ao cronograma canônico da turma | Exibir alerta verificável, sem atribuir risco de evasão como fato. Registros desconhecidos não contam como falta. |
| Alta | Correções pendentes por turma e aluno | `get_group_progress/`, importado como `KodlandReview` | A importação retém apenas `TASK_SUBMITTED` e `TASK_SUBMITTED_LATE` de aulas passadas. Permite contar pendências atuais; não permite medir taxa geral de entrega, total corrigido ou tempo médio de correção. |
| Alta | Aulas extras previstas, realizadas e contabilizadas | `KodlandExtraLesson`, cronograma e confirmação de relatório da extra | Separar conclusão confirmada pela Kodland de marcação manual. Respeitar sinais de sincronização incompleta. |
| Média | Progresso do curso por aluno | `get_students_main_data`, `progress_summary` e catálogo de aulas | Validar o significado de atual/total. Progresso no curso não deve ser apresentado como nota ou domínio do conteúdo. |
| Média | Carga de aulas e disponibilidade do professor | Cronograma e disponibilidade já sincronizados | Distinguir tempo planejado, aulas realizadas e horário disponível. Não assumir que um horário livre pode ser preenchido automaticamente. |
| Média | Relação entre volume de aulas e receita | Aulas sincronizadas e cálculo financeiro local | Identificar valores calculados pelo aplicativo e confirmações locais de recebimento; não tratá-los como comprovante de pagamento da Kodland. |

## Métricas oficiais que exigem localizar o painel

Avaliação do professor, satisfação/NPS, retenção, renovação e indicadores
institucionais são possibilidades a investigar, não funcionalidades confirmadas
na Kodland por esta revisão. Não há base para reproduzir fórmulas ou prometer
acesso a esses números com os dados atualmente persistidos.

Para espelhar o painel oficial é necessário obter o endereço/menu e acesso de
leitura ao painel, observar as requisições que ele próprio faz e confirmar:

- quais indicadores a conta do professor pode consultar;
- endpoint, método, paginação, filtros, período e fuso horário;
- definição, numerador e denominador de cada indicador;
- metas e comparação com período anterior, caso realmente existam;
- comportamento para ausência de dados e permissões insuficientes.

Não registrar senhas, tokens, cookies ou respostas completas com dados pessoais.
Não adicionar endpoints por adivinhação.

## Proposta de interface

Uma seção **Desempenho** em Acompanhamento, com período e turma em uma barra
compacta. No desktop, frequência mensal e pendências por turma podem aparecer
lado a lado. Detalhes de alunos ficam em modal; no celular, os gráficos ocupam
uma coluna. Cada resultado informa a origem, o período, a última atualização e
se a sincronização está completa. Falta de dados aparece como indisponível,
sem virar zero.

Indicadores oficiais, quando identificados, devem ficar distinguíveis dos
indicadores calculados no aplicativo. Histórico comparativo exige snapshots:
a importação atual sobrescreve pendências, portanto não fornece retrospectiva
confiável de correções resolvidas.

## Próximo passo

Localizar o painel real a partir do link/menu fornecido pelo usuário e liberar
os domínios necessários na rede do ambiente. Depois de validar as respostas,
implementar um adaptador de leitura com fixtures sintéticas, persistência por
professor/período e testes de filtros, dados incompletos e isolamento de contas.
Nenhuma alteração de interface ou integração de métricas foi publicada nesta
revisão; este documento registra o levantamento e o bloqueio encontrado.
