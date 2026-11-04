# Visualizações de Alunos

- [x] T1 Dados e modelo: progresso por módulo com estados entregue/não entregue/desconhecido e correção pendente separada; aulas concluídas/total; perfil completo e faltas quando disponíveis. Não inferir entrega pela ausência na fila de correção. Aceite: testes de modelo e typecheck.
- [x] T2 Interface: filtros Completo, Correções pendentes e Alunos; favoritos preservados/migrados; remover olho; pendências mostram só turmas/alunos/atividades pendentes sem caixas vazias; Alunos mostra nome completo e pontos, saldo de créditos/aulas restantes vindo do perfil; percentual de aulas em todos os cabeçalhos. Aceite: testes afetados, lint, tipos e build.
- [x] T2B Créditos: fonte oficial GET balance/?id=student&lesson_type=DEFAULT_LESSON, registro balance do tipo correto. Campo optional lesson_credits_remaining number|null e updated_at, obtido só no sync explícito de perfis; sem tratar ausente como zero. Aceite: parser/rota/persistência testados. Arquivos disjuntos de T2 (api.ts, student-profile.ts, sync/route.ts e testes); tarefas independentes podem prosseguir em paralelo com contrato opcional definido.
- [x] T3 Revisar, registrar novidade/memória e publicar no GitHub/Vercel. Aceite: deploy do commit pronto. O menu de ações da turma foi convertido para dropdown no commit `083a899`; typecheck, lint, 23 testes unitários afetados, 3 E2E de modos em 320/390/1440 e build passaram. O deploy de produção foi publicado como `nexusclass-onzr4nz0b-ezeklobos-projects.vercel.app`, ficou READY e o alias `/classes` respondeu HTTP 200.

## Decisões
Completo usa progresso explícito sincronizado; desconhecido permanece sem informação. Percentual deriva de aulas ministradas e catálogo/cronograma conhecido, com rótulo claro e sem inventar total do curso. Usuário confirmou saldo = créditos/aulas pagas restantes, não faltas. Fonte verificada em perfil real e bundle público wallet-CsIGB6oF.js: fetchWalletBalance usa /balance/ com id e lesson_type=DEFAULT_LESSON, seleciona registro correspondente e exibe balance.

## Handoff T1
- `compactActivitiesModel` aceita `complete`, `taskProgress`, `attendance`, `manualOccurrences`. `complete:true` inclui estados explícitos delivered/missing/unknown e todos os estados manuais; `pendingOnly:true` prevalece e exclui progresso/atividades manuais já corrigidas ou sem entrega.
- Cell novo `source:"progress"` com `progress`; colunas têm `moduleLabel`; linhas têm `points`, `absenceCount`, `manualStudent`; turmas têm `completedLessons`, `totalLessons`, `completionPercent` (null sem denominador conhecido), `pendingCount`.
- Percentual usa aulas únicas sincronizadas não canceladas e flag explícita lesson_passed/status concluído; não presume duração do curso. UI deve rotular “das aulas sincronizadas”, não “do curso”. Manual usa ocorrências não canceladas/remarcadas e held.
- Loader lê taskProgress também no navegador e ocorrências no autenticado. Demo possui taskProgress sintético e passa ocorrências ao adaptador.
- T2 precisa passar `complete:true`, atividades manuais completas em vez de visibleOwn e reviews sem filtrar indevidamente estados; renderer provisório source progress não é ação de correção. Entregue não significa corrigido. Campos sem amostra de progresso não implicam não entregue; apresentar lacuna/cobertura.
- Sete testes da grade/modelo e typecheck passaram. Não houve commit/push em T1.

## Handoff T2B
Saldo global DEFAULT_LESSON lido em profiles via balance/. Campos opcionais lesson_credits_remaining/lesson_credits_updated_at preservados em syncs posteriores sem saldo, inclusive browser. Zero e negativo aceitos; ausente/inválido permanece não informado ou mantém último conhecido. 59 testes parser/persistência/rota e tipos passaram. Modo Alunos usará refresh explícito profiles, sem novo polling.

## Handoff T2 e validação final
Três modos com favoritas migradas, perfil manual/Kodland e refresh explícito profiles em Alunos; layout320/390/1440 validado, olho removido. Busca usa helper puro após unir progresso/reviews/atividades manuais, com filtros por turma/curso/aluno/email/atividade/aula/módulo. Lint sem warnings, tipos, build e testes afetados passaram (59 créditos+12 modelo/interface+11 novidades);9 cenários E2E únicos passaram, com3 dos modos repetidos após ajuste mobile. Screenshots student-roster e student-modes em test-results inspecionados.
