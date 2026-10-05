# Estado atual

- A sincronização pedagógica importa grupos, alunos, revisões e aulas no Firestore.
- Materiais de aula são enriquecidos pelo catálogo do curso: apresentação e roteiro vêm de `materials?lesson=...`; atividade de casa vem de `tasks/get_tasks_list?lesson=...&is_hw=true`.
- A tela `/classes` mantém turmas em acordeão e mostra links da aula anterior e próxima quando o snapshot contém os URLs.
- O resumo mostra a agenda semanal com início e término; há navegação entre semanas. As extras consultam o cronograma canônico do professor (`get_teacher_extra_lessons_timetable`) para a semana anterior, atual e duas seguintes, inclusive eventos ISO com `start` e `end`, sem efetuar escrita na Kodland.
- Validação local executada: `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run lint` e `npm.cmd run build` em `frontend`.
- O payload real das extras usa `extra_lesson_id`, `student_full_name`, `start_time` e `end_time` em UTC; o importador converte os horários para São Paulo. Os eventos visuais `start/end/title` eram uma transformação da interface, não o contrato da API.
- Próximo passo operacional: publicar e sincronizar novamente; validar a grade de quarta-feira para Lucas Martin e Rafael Coppola. O usuário autorizou acionar a sincronização com os campos preenchidos no navegador.
