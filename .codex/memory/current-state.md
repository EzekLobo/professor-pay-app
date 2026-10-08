# Estado atual

- O cabecalho nao exibe mais “Painel pessoal” nem saudacao duplicada: titulo da pagina fica centralizado e o perfil compacto permanece no canto direito.
- Grade, Correcoes e Turmas usam o mesmo fluxo de sincronizacao: o e-mail e lembrado no navegador; apos sucesso, o app solicita ao gerenciador seguro do navegador que memorize as credenciais; em falha, a senha permanece no formulario para nova tentativa. O snapshot e escrito em lotes de ate 400 operacoes para nao exceder o limite do Firestore. A Kodland retorna 403 para credenciais recusadas, tratado como erro de usuario/senha invalida.
- As aulas extras na grade distinguem conclusao, reagendamento, agendamento e pendencia; apenas conclusao confirmada por status ou gravacao compoe o extrato.
- Os indicadores de Turmas, Alunos e Correcoes pendentes no resumo usam formato compacto em linha para priorizar a grade semanal.
- Em `/classes`, a tela exibe somente as turmas sincronizadas da Kodland; o acordeao mostra o nome da turma e a quantidade de alunos ativos. A lista exibe somente alunos ativos, ordenados pela pontuacao de atividades, com posicao e pontos. Os dados de progresso, responsavel e atalhos de contato/perfil ficam no modal individual acionado pelo aluno.
- Em `/corrections`, o filtro Turmas lista todas as pendencias agrupadas por turma; Alunos e Aulas preservam a turma como primeiro nivel e subdividem internamente por aluno ou por aula.
- Em `/corrections`, cada turma agora e uma secao visual propria, com contador de pendencias; os cartoes separam aluno/status, aula, atividade e acoes compactas para manter a leitura uniforme.
- Em `/corrections`, as turmas iniciam recolhidas. O atalho Corrigir usa o link individual `learn.kodland.org/.../task/{tarefa}/check/{aluno}` quando a Kodland nao entrega um URL especifico no snapshot.
- Em `/corrections`, o botao “Atualizar correcoes” pede a senha temporaria, usa o e-mail lembrado no navegador, sincroniza o snapshot pedagogico e recarrega as pendencias.
- O modal de materiais nao repete o identificador da aula no topo. Todos os modais usam icone de fechar acessivel; na aba Alunos, “Abrir na plataforma” fica centralizado ao final.
- O modal de cada aula tem o icone de anotacao: ele abre uma folha privada por aula para salvar observacoes e resumos do roteiro no namespace Firebase do professor.
- O modal de uma turma na grade alterna entre Aula e Alunos. A aba Alunos mostra apenas alunos ativos daquela turma, ordenados pelos pontos atuais do resumo de progresso sincronizado.
- No modal da grade, os controles laranja Anterior e Próxima trocam os materiais para a aula adjacente da mesma turma. Quando a aula exibida diverge da programada para a semana, um aviso aparece logo abaixo do título do modal.
- As duas opcoes desse modal usam a mesma altura e rolagem interna. Aula oferece “Abrir na plataforma”; Alunos oferece o atalho direto para a turma e seus alunos na plataforma.
- R9 foi validada localmente com typecheck, 41 testes Vitest, lint, build e os dois smoke tests Chromium das rotas privadas. A verificacao visual com dados reais ainda exige uma sessao Firebase autenticada apos sincronizacao.
- Em `/lessons`, as aulas sincronizadas e os cursos importados agora sao exibidos em secoes por modulo; a ordem do catalogo e preservada dentro de cada modulo e aulas sem identificacao de modulo ficam no final.
- Em `/lessons`, o historico financeiro manual, seus filtros e o cadastro manual de aula extra foram removidos; a tela concentra cursos e materiais sincronizados/importados.
- Em `/payments`, cada competencia mensal abre um modal de extrato com totais, separacao entre aulas normais e extras e todos os lancamentos que compoem o valor; confirmacao e estorno permanecem no mesmo modal.
- No resumo, os destaques de pagamento anterior/proximo foram substituidos pelo carrossel de competencias mensais; ele centraliza a proxima competencia, permite navegar por setas, arraste e rolagem, e nao exibe a acao “Ver completo”.
- O carrossel de competencias no resumo tem um icone de visibilidade no canto superior direito; ele oculta ou reexibe os dados financeiros durante a sessao.
- Em `/payments`, as competencias mensais usam carrossel lateral: o proximo pagamento inicia centralizado, os vizinhos ficam nas laterais e as setas movem o foco. O cartao central abre o extrato; valor e status ficam na mesma linha.
- Em `/payments`, os cards separados de pagamento anterior/proximo foram removidos; o carrossel e a unica visao de navegacao por competencias.
- Em `/payments`, o carrossel tambem aceita arraste horizontal. Cada cartao mostra mes/data de vencimento, status, valor, numero de aulas e atalho centralizado para o extrato; `Ver completo` alterna para a lista de todas as competencias.
- O carrossel de pagamentos tambem responde ao scroll do mouse e anima o deslocamento dos cartoes; o titulo acima dele acompanha o mes da competencia central.
- O extrato permite classificar aulas normais como contabilizaveis, substituicao, feriado ou cancelada. A classificacao e preservada por aula sincronizada ou por previsao recorrente e recalcula a competencia; pagamentos recebidos ficam protegidos contra essas alteracoes.
- Os destaques Anterior e Proximo no resumo abrem o mesmo extrato gerenciavel de `/payments`: ele permite alterar o status financeiro e adicionar aula extra ao mes da competencia, atualizando o total apos salvar.
- Os cartoes do carrossel nao iniciam mais o gesto de arraste ao receber um clique; assim, `Abrir extrato` abre o modal de forma confiavel, enquanto setas, scroll e a area livre do carrossel permanecem para navegacao.
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
