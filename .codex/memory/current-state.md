# Estado atual

- A sincronização pedagógica materializa todas as aulas do catálogo de cada curso por turma e salva tarefas em sala, lições de casa, slides e roteiros; as consultas de detalhes são limitadas globalmente a duas simultâneas.

- A persistência identifica cada aula pelo par turma+aula, preserva materiais já obtidos quando uma consulta pontual falha e não substitui horários disponíveis ou extras se a origem não estiver acessível.

- A agenda (extras e disponibilidade) é sincronizada antes da importação detalhada dos materiais do curso para impedir que consultas extensas interfiram na grade semanal.

- Em `/lessons`, cada aula abre um modal sob demanda com tarefas em sala, lição de casa, slides e roteiro; a lista mantém apenas identificação e o atalho “Ver materiais”.

- A grade usa o número da próxima aula da turma e payloads de cronograma aninhados para ligar o cartão recorrente ao material correto, em vez de mostrar um link genérico do curso.

- O modal de materiais é compartilhado entre a grade e `/lessons`. A sincronização guarda o número, título e URL da próxima aula; a grade associa pelo índice global, ID ou título e usa o horário/data da sessão como apoio. O seletor do catálogo fica como contingência somente quando o cronograma não traz vínculo.

- O resumo permite abrir os blocos azuis de turma em um modal com turma, módulo, aula e atalhos para slides, roteiro, atividade e aula. A tela `/lessons` lista as aulas sincronizadas agrupadas por curso e turma.

- A sincronização pedagógica importa grupos, alunos, revisões e aulas no Firestore.
- Materiais de aula são enriquecidos pelo catálogo do curso: apresentação e roteiro vêm de `materials?lesson=...`; atividade de casa vem de `tasks/get_tasks_list?lesson=...&is_hw=true`.
- A tela `/classes` mantém turmas em acordeão e mostra links da aula anterior e próxima quando o snapshot contém os URLs.
- O resumo mostra a agenda semanal com início e término; há navegação entre semanas. As extras consultam o cronograma canônico do professor (`get_teacher_extra_lessons_timetable`) para a semana anterior, atual e duas seguintes, inclusive eventos ISO com `start` e `end`, sem efetuar escrita na Kodland.
- Validação local executada: `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run lint` e `npm.cmd run build` em `frontend`.
- O payload real das extras usa `extra_lesson_id`, `student_full_name`, `start_time` e `end_time` em UTC; o importador converte os horários para São Paulo. Os eventos visuais `start/end/title` eram uma transformação da interface, não o contrato da API.
- Próximo passo operacional: publicar e sincronizar novamente; validar a grade de quarta-feira para Lucas Martin e Rafael Coppola. O usuário autorizou acionar a sincronização com os campos preenchidos no navegador.
