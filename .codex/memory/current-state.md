# Estado atual

- O cabecalho nao exibe mais “Painel pessoal” nem saudacao duplicada: titulo da pagina fica centralizado e o perfil compacto permanece no canto direito.
- O modal de materiais nao repete o identificador da aula no topo. Todos os modais usam icone de fechar acessivel; na aba Alunos, “Abrir na plataforma” fica centralizado ao final.
- O modal de uma turma na grade alterna entre Aula e Alunos. A aba Alunos mostra apenas alunos ativos daquela turma, ordenados pelos pontos atuais do resumo de progresso sincronizado.
- As duas opcoes desse modal usam a mesma altura e rolagem interna. Aula oferece “Abrir na plataforma”; Alunos oferece o atalho direto para a turma e seus alunos na plataforma.
- R9 foi validada localmente com typecheck, 41 testes Vitest, lint, build e os dois smoke tests Chromium das rotas privadas. A verificacao visual com dados reais ainda exige uma sessao Firebase autenticada apos sincronizacao.
- Em `/lessons`, as aulas sincronizadas e os cursos importados agora sao exibidos em secoes por modulo; a ordem do catalogo e preservada dentro de cada modulo e aulas sem identificacao de modulo ficam no final.
- Em `/payments`, cada competencia mensal abre um modal de extrato com totais, separacao entre aulas normais e extras e todos os lancamentos que compoem o valor; confirmacao e estorno permanecem no mesmo modal.
- Em `/payments`, as competencias mensais usam carrossel lateral: o proximo pagamento inicia centralizado, os vizinhos ficam nas laterais e as setas movem o foco. O cartao central abre o extrato; valor e status ficam na mesma linha.
- Em `/payments`, o carrossel tambem aceita arraste horizontal. Cada cartao mostra mes/data de vencimento, status, valor, numero de aulas e atalho centralizado para o extrato; `Ver completo` alterna para a lista de todas as competencias.
- O carrossel de pagamentos tambem responde ao scroll do mouse e anima o deslocamento dos cartoes; o titulo acima dele acompanha o mes da competencia central.
- O extrato permite classificar aulas normais como contabilizaveis, substituicao, feriado ou cancelada. A classificacao e preservada por aula sincronizada ou por previsao recorrente e recalcula a competencia; pagamentos recebidos ficam protegidos contra essas alteracoes.
- Na grade do resumo, blocos de disponibilidade voltaram a abrir um modal compacto com o intervalo cadastrado; o modal de materiais continua restrito a aulas/turmas.
- Na grade semanal, disponibilidade e deduplicada por dia/intervalo e removida dos trechos ocupados por aulas ou extras; periodos livres restantes continuam visiveis.
- Em `/lessons`, turmas do mesmo `course_id` compartilham um unico cartao e as aulas sao deduplicadas pelo indice global; o modal combina os materiais presentes. O catalogo de importacao e consultado no servidor e nao expoe os IDs dos cursos.

- A sincronização pedagógica materializa todas as aulas do catálogo de cada curso por turma e salva tarefas em sala, lições de casa, slides e roteiros; as consultas de detalhes são limitadas globalmente a duas simultâneas.

- A persistência identifica cada aula pelo par turma+aula, preserva materiais já obtidos quando uma consulta pontual falha e não substitui horários disponíveis ou extras se a origem não estiver acessível.

- A agenda (extras e disponibilidade) é sincronizada antes da importação detalhada dos materiais do curso para impedir que consultas extensas interfiram na grade semanal.

- Em `/lessons`, cada aula abre um modal sob demanda com tarefas em sala, lição de casa, slides e roteiro; a lista mantém apenas identificação e o atalho “Ver materiais”.

- A grade usa o índice global (posição 1-based no catálogo do curso) separado do número local da aula dentro do módulo; assim, uma ocorrência M7L28 associa à 28ª aula do curso, cujo título pedagógico pode ser M7.L4.

- O modal de materiais é compartilhado entre a grade e `/lessons`. A sincronização numera o catálogo em ordem global, extrai o índice dos eventos de cronograma e preserva o código local MxLy no título; a grade associa por índice global, ID ou título e usa data/horário como apoio. O seletor fica como contingência somente quando o cronograma não traz vínculo.

- O resumo permite abrir os blocos azuis de turma em um modal com turma, módulo, aula e atalhos para slides, roteiro, atividade e aula. A tela `/lessons` lista as aulas sincronizadas agrupadas por curso e turma.

- A sincronização pedagógica importa grupos, alunos, revisões e aulas no Firestore.
- Materiais de aula são enriquecidos pelo catálogo do curso: apresentação e roteiro vêm de `materials?lesson=...`; atividade de casa vem de `tasks/get_tasks_list?lesson=...&is_hw=true`.
- A tela `/classes` mantém turmas em acordeão e mostra links da aula anterior e próxima quando o snapshot contém os URLs.
- O resumo mostra a agenda semanal com início e término; há navegação entre semanas. As extras consultam o cronograma canônico do professor (`get_teacher_extra_lessons_timetable`) para a semana anterior, atual e duas seguintes, inclusive eventos ISO com `start` e `end`, sem efetuar escrita na Kodland.
- Validação local executada: `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run lint` e `npm.cmd run build` em `frontend`.
- O payload real das extras usa `extra_lesson_id`, `student_full_name`, `start_time` e `end_time` em UTC; o importador converte os horários para São Paulo. Os eventos visuais `start/end/title` eram uma transformação da interface, não o contrato da API.
- Próximo passo operacional: publicar e sincronizar novamente; validar a grade de quarta-feira para Lucas Martin e Rafael Coppola. O usuário autorizou acionar a sincronização com os campos preenchidos no navegador.
