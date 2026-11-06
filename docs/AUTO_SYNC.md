# Sincronização automática por escopo

## Regras ativas

O menu Cursos (/lessons) consulta o catálogo atribuído ao professor na entrada e por Atualizar cursos, sem polling. A lista vem de `teachers/{id}/get_teachers_courses`, não apenas de turmas ativas; cada ID mantém seu próprio catálogo completo paginado. O cache auxiliar por conta em IndexedDB não cria grupos nem aulas financeiras. Materiais de cursos sem turma exigem novamente autorização no catálogo do professor e pertença da aula ao curso, antes de buscar recursos.

No progresso de atividades, `TASK_NOT_GRADED` é preservado como `not_graded` e exibido como **Atividade sem avaliação**, separado de informação ausente. Esse estado não comprova entrega, correção nem pendência. Logs de sincronização contam `ungradedTaskCount` e `unknownTaskCount` sem registrar dados dos alunos. Códigos desconhecidos continuam sem classificação até identificação da fonte; registros antigos precisam de nova consulta de progresso para recuperar o estado correto.

A rotina autenticada é `use-kodland-auto-sync.ts`, com decisões em `kodland-auto-sync.ts` e `kodland-sync-policy.ts`. Funciona com a aplicação aberta, aba visível, conexão ativa e integração Kodland habilitada. As páginas consultam ao entrar, retomar o foco/conexão ou acionar a atualização. Não há polling de página por minuto nem consulta periódica de atividades a cada seis horas. Cada resposta persistida recarrega a grade imediatamente; leituras concorrentes são serializadas e respostas antigas não substituem uma leitura mais recente. A sincronização manual tem prioridade; solicitações bloqueadas por ela retomam após o evento de conclusão. Falhas preservam os dados e aguardam nova solicitação. O heartbeat de 30 segundos fica restrito às tarefas temporais de ocorrências/chamadas descritas abaixo.

Entradas na aba Alunos consultam atividades/ranking por turma; entradas em Presença consultam presença por turma, sem aguardar uma hora após a aula nem depender do marcador da ocorrência. Entradas no Resumo usam o modo `schedule` para atualizar a grade completa. O Meu quadro relê tarefas/listas ao abrir e recuperar conexão/foco, preservando a fila local offline e sem intervalo de recarga.

As regras abaixo continuam aplicáveis ao acompanhamento de ocorrências em segundo plano. Para as áreas visíveis, prevalecem as consultas de entrada/ação e a aplicação imediata das respostas descritas acima.

Atividades e Presença executam `profiles` na entrada para carregar o contato `parent_phone` do responsável e créditos `DEFAULT_LESSON`; atividades consultam também `classroom` para atualizar metadados de próxima aula. Saldos são aplicados pelo identificador Kodland em cada matrícula existente, preservando ID local e turma. Os modos Completo/Pendências exibem créditos junto ao aluno, e o nome abre o modal de perfil e contatos. A carteira usa GET /api/v1/balance/ (a v2 não oferece esse endpoint). Falha HTTP é exibida na tela, em vez de encerrar perfis como atualizados sem saldo. Carteira ausente ou não reconhecida continua desconhecida; nunca vira zero.

| Informação | Gatilho e encerramento |
|---|---|
| Cadastro de turmas/alunos | Não é reimportado automaticamente. A sincronização manual continua disponível. |
| Atividades e ranking | Consultar na entrada/retomada/ação e refletir cada resposta persistida. Sem intervalo de recarga da página ou polling de seis horas. |
| Aulas extras | Ao entrar na Agenda, descobrir apenas IDs novos da semana atual (segunda a domingo); nova consulta na mesma semana é limitada a uma por5min. Extra pendente recente é conferida uma vez depois do dia da aula; resposta válida, mesmo negativa, grava `final_checked_at` e encerra. A carga inicial considera7dias; pendências mais antigas já rastreadas continuam. Erro/resultado desconhecido pode tentar novamente após30min, no máximo2tentativas. |
| Presença | Uma consulta por ocorrência, uma hora após o fim. Confirmação exige estado conhecido para cada aluno. Se a aplicação estava fechada, recupera pendências por até24horas. Erros não geram repetição automática para aquela ocorrência. |
| Gravações | Após o fim da aula, verificar ao entrar na Agenda. Se não houver link, tentar novamente em outro acesso após pelo menos30min. A carga inicial considera os últimos7dias; pendências já acompanhadas continuam. Link persistido encerra consultas. |
| Link de chamada | Consultar a partir de15min antes do início e repetir a cada5min até o fim da ocorrência. O ícone na Agenda indica link disponível; dois cliques/toques abrem a chamada. A consulta exige mesma ocorrência, turma e horário. |
| Pagamentos | Ao entrar em Pagamentos, consultar uma vez ao dia na janela D−5 até D, inclusive. Competências recebidas são ignoradas. |
| Extratos/notificações | Mudanças de pagamento invalidam os dados derivados. Presença e atividades notificam o acompanhamento para reler somente fontes alteradas; prazos locais usam o estado já salvo. |
| Disponibilidade e materiais | Sem atualização automática. Materiais permanecem sob demanda. |

O modo automático não roda uma importação geral de turmas, alunos, disponibilidade ou materiais. Atualização completa permanece uma ação manual explícita. Os escopos automáticos usam consultas e gravações direcionadas por turma ou ocorrência; o modo de armazenamento configurado pelo administrador (Navegador/Firebase) é respeitado.

## Retomada e integridade

- O estado guarda tentativas por identificador de ocorrência; senha e link de chamada não são armazenados no controle do agendador.
- Alternar ou desligar a integração invalida trabalhos pendentes. A operação manual pausa a automática e mantém prioridade até concluir as gravações.
- Horários usam `America/Sao_Paulo`. A mudança de data, horário, turma ou origem cria outra ocorrência e não reutiliza links antigos.
- Falha ou resposta incompleta preserva os dados anteriores. Uma extra somente é encerrada com relatório conhecido; presença só é confirmada quando todos os alunos têm estado reconhecido.
- Para escopo Navegador, resultados de extras, presença, gravações e chamada são persistidos no cache local sem depender de gravação Firestore.
- A rotina depende da aplicação aberta para executar. Reabrir a Agenda permite retomar buscas de extras e gravações pendentes.

## Arquivos e validação

Política ativa: `frontend/src/lib/kodland-sync-policy.ts`; execução: `frontend/src/components/use-kodland-auto-sync.ts` e `frontend/src/lib/kodland-auto-sync.ts`; chamadas por escopo: `frontend/src/lib/kodland-scoped-sync.ts` e `frontend/src/app/api/kodland/sync/route.ts`. Os antigos `auto-sync-runtime` e `auto-sync-controller` continuam no repositório como contratos/testes, mas não são montados junto ao agendador ativo.

Cobertura de políticas, prioridade, cache Navegador e persistência por escopo: `kodland-sync-policy.test.ts`, `use-kodland-auto-sync.test.ts`, `kodland-browser-sync.test.ts` e `kodland-scoped-sync.test.ts`. Testes locais não substituem verificação autenticada na Kodland ou validação em dispositivo.
