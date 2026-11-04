# Revisão da aplicação — 30/10/2026

## Encerramento das correções — 30/10/2026

Os achados R01–R08 abaixo foram corrigidos e cobertos por regressões locais. O texto original da revisão permanece como histórico da reprodução; suas referências de linha correspondem à versão revisada antes das correções. Implementação e critérios em `docs/plans/review-fixes-2026-10-30.md`.

- R01/R06: referências por UID e guardas assíncronas; somente recebimentos efetivos bloqueiam alterações financeiras.
- R02: links preservados por ocorrência e recuperação permitida quando falta URL persistida.
- R03: preferência interrompe novos trabalhos automáticos, inclusive enfileirados, sem leitura antiga reativar a integração.
- R04/R05: revalidação autoritativa do estado remoto, ativação real e preservação de pendências já rastreadas.
- R07/R08: runners/configurações separados; testes nativos alinhados ao ciclo mensal já entregue no commit `26cd759`.
- Validação final também encontrou e corrigiu rolagem da grade: listener nativo não passivo evita rolagem vertical concorrente; libera a página no limite horizontal.

Validação agregada: 65 testes nativos, 437 web e 33 backend, TypeScript, lint e build aprovados. Validação final do navegador registrada no plano. Conta Kodland autenticada, regras publicadas/emulador Firestore e dispositivo Expo permanecem pendentes; não há alegação de validação em produção.

## Conclusão original da revisão

A versão web compila e seus fluxos cobertos pelos testes funcionam, mas **a revisão não aprova a aplicação como inteiramente correta**. Foram encontrados seis defeitos funcionais reproduzidos com dados sintéticos e duas lacunas de validação do projeto. A prioridade é impedir confirmação de pagamento na conta errada durante uma troca de sessão.

Escopo: árvore de trabalho atual, incluindo a sincronização por escopo, Agenda/chamadas, presença, atividades/ranking, notificações, financeiro, backup, tarefas, cadastros, configurações, autenticação, aplicativo Expo e backend Python legado. Alterações anteriores foram preservadas. Esta entrega é uma revisão; não contém correções funcionais nem publicação.

**Confiança:** Confirmado = leitura de código e/ou teste observado; Pendente = requer evidência adicional. P1 = corrigir antes de considerar a entrega pronta; P2 = corrigir no próximo ciclo de estabilização. A ordem abaixo considera consequência e frequência provável, não apenas quantidade de testes.

## Achados

### R01 — P1 — Confirmação de pagamento pode escrever na conta que entrou depois

**Confirmado por reprodução sintética.** Em `frontend/src/lib/api.ts:2531–2548`, `paymentsApi.confirm` captura o UID inicial, aguarda `paymentDetail` e grava usando `ref("payments")`, que resolve novamente o usuário atual (`api.ts:616`). Não há comparação entre o UID inicial e o atual antes da gravação.

Cenário: conta A inicia confirmação; durante o carregamento, a sessão passa para B; a confirmação termina. O teste observou a escrita em `users/B/payments/2026-11-15`, com o snapshot obtido pela operação de A. As regras do Firestore não corrigem esse erro: B pode escrever em seu próprio caminho.

Consequência: isolamento de contas e integridade financeira podem ser violados nessa corrida. Não foi operada nenhuma conta real.

Correção recomendada: referências vinculadas ao UID capturado e guardas de identidade após cada leitura assíncrona e imediatamente antes de persistir. Revisar também os demais mutadores financeiros/cadastrais que usam referências implícitas após `await`. Aceite: A → B ou logout durante confirmação deve cancelar a operação sem gravar em B.

### R02 — P2 — Atualização manual pode eliminar chamada/gravação já encontrada

**Confirmado por duas reproduções.** `mergeSyncedKodlandLesson` (`api.ts:455–486`) não preserva os campos de chamada nem faz fallback da gravação já salva. A substituição de extras (`api.ts:3091–3099`) grava o objeto recebido sem mesclar `recording_url` anterior. As decisões de gravação/chamada encerram o trabalho quando `history.completed` está marcado (`sync-policy.ts:112–126`).

Cenários observados: sincronizar a grade manualmente removeu a gravação de uma extra; mesclar uma aula removeu o link de chamada e trocou a gravação anterior por vazio. O marcador concluído continuou impedindo a busca automática correspondente.

Consequência: o ícone de chamada ou a gravação pode desaparecer após uma atualização manual e não voltar automaticamente naquela ocorrência.

Correção recomendada: preservar links somente quando a identidade e os horários da ocorrência forem os mesmos. Ao invalidar dados, invalidar de modo coerente o marcador que impede nova busca. Aceite: atualização da mesma aula conserva links válidos; remarcação remove links da ocorrência antiga e permite consultar a nova.

### R03 — P2 — Desligar a Kodland não interrompe imediatamente o agendador em memória

**Confirmado por reprodução e leitura do caminho de configuração.** `tutorPreferencesApi.save` (`api.ts:2311–2330`) persiste a preferência sem emitir evento para o runtime. Este mantém o snapshot, e `resume()` apenas inicia `tick()` sem invalidar a fonte (`auto-sync-runtime.ts:82–104`). O controller não assina mudanças de preferências.

Cenário observado: carregar com integração ligada, alterar a fonte para desligada, atingir fim +1h e retomar por foco. Houve consulta de presença com o snapshot antigo e nenhuma releitura da preferência. Navegar para outra rota pode atualizar o snapshot, mas isso não é imediato nem garantido enquanto a pessoa permanece na tela.

Correção recomendada: evento de preferências por UID que invalide a fonte e suspenda novos trabalhos ao desligar a integração, sem acrescentar polling. Aceite: salvar o toggle desligado impede a próxima consulta agendada sem exigir navegação ou recarga.

### R04 — P2 — Estado concluído em outro dispositivo pode gerar consultas de controle indefinidas

**Confirmado por reprodução com dois executores e store compartilhado.** O runtime guarda histórico sem prazo em `auto-sync-runtime.ts:103–106`. Se `enqueue` retorna `skipped`, o executor apenas adia a próxima tentativa (`:141–147`); não atualiza esse histórico. A elegibilidade autoritativa na transação impede repetir a consulta Kodland, mas o runtime continua acreditando que está pendente.

Cenário observado: outro executor possui a conferência; o runtime local armazena o estado pendente e recebe `skipped`; o outro executor conclui; o local volta a tentar a cada minuto. O diagnóstico registrou três tentativas de claim mesmo após a conclusão remota, sem trabalho de dados a executar. Eventos de presença também não estão entre os domínios que invalidam a fonte do runtime (`:262`), e invalidar somente a fonte não limpa o histórico.

Consequência: leituras/transações Firestore desnecessárias enquanto a aplicação estiver ativa, contrariando o objetivo de sincronização leve.

Correção recomendada: revalidar/invalidar histórico após `skipped` e por revisões externas, distinguindo fila ocupada de trabalho já encerrado. Aceite: depois da confirmação remota, o executor local deixa de agendar a mesma conferência.

### R05 — P2 — Janela inicial de sete dias pode começar antes da ativação da integração

**Confirmado por reprodução.** `load()` inicializa o marco durável em paralelo ao carregamento das preferências (`auto-sync-runtime.ts:97`), antes de verificar `enabled`. `withinInitialWindow` usa esse marco fixo (`sync-policy.ts:93–95`).

Cenário observado: marco criado em 01/09, primeira carga da integração em 30/10 e aula importada de 20/09. A presença dessa aula antiga foi consultada, embora esteja fora dos últimos sete dias da ativação. A situação pode ocorrer quando a conta usa o app por um período antes de ligar/importar a Kodland.

Consequência: uma primeira sincronização pode consultar muito mais histórico de presença/gravações do que o combinado.

Correção recomendada: criar o marco quando a integração realmente se torna elegível e separar carga inicial de pendências já rastreadas. Aceite: primeira ativação em 30/10 considera 23/10 em diante, preservando pendências previamente registradas quando houver.

### R06 — P2 — Pagamento atrasado é tratado como recebido ao editar lançamentos

**Confirmado por reprodução.** `paymentsApi.setStatus(...,"OVERDUE")` cria um documento de pagamento não recebido (`api.ts:2560–2570`). `updateLessonFinancialStatus` bloqueia a edição se existir qualquer documento daquela data (`:2578–2587`), sem conferir `status` ou `received_at`.

Cenário observado: documento `OVERDUE`, `received_at` vazio; a alteração de uma aula retornou HTTP lógico 409 como se a competência estivesse recebida.

Correção recomendada: bloquear somente competências efetivamente recebidas, usando o mesmo predicado `paymentWasReceived` adotado nos demais cálculos. Aceite: atrasado permanece editável; recebido exige estorno antes de alteração.

### R07 — P2 — Validação da raiz mistura os projetos e produz falhas artificiais

**Confirmado por execução.** `package.json:35` define `test` como `vitest run` sem delimitar o aplicativo Expo. Ao executar `npm.cmd test`, foram coletados testes web sem o alias/configuração do frontend e arquivos Playwright como se fossem Vitest. Houve 48 arquivos com falha, incluindo erros de importação e de runner; esse número não representa 48 defeitos da aplicação.

O `tsconfig.json` da raiz também não exclui o frontend. `tsc --noEmit` terminou com exit 2 e relatório de 699 linhas, começando por aliases `@/components` não resolvidos. O frontend isolado passou na checagem de tipos.

Correção recomendada: configuração de testes e TypeScript por projeto, comandos agregadores explícitos e E2E executado apenas pelo Playwright. Aceite: o comando da raiz valida o escopo que anuncia e não coleta testes de outro runner.

### R08 — P2 — Contrato financeiro do Expo e seus testes divergem

**Confirmado quanto à divergência; pendente qual regra de negócio deve prevalecer no nativo.** Executando somente `src`, 65 testes foram coletados: 54 passaram e 11 falharam, concentrados em `calculations.test.ts` e `classEditing.test.ts`.

`src/calculations.ts:103–105` calcula sempre pagamento no dia 15 do mês seguinte. Já os testes em `src/calculations.test.ts:121–134` esperam divisão quinzenal, com dia 1 para a primeira quinzena. As expectativas de edição/desativação de turma também usam as datas antigas e falham na preservação de recebidos.

Isso não prova sozinho que a regra mensal está errada; prova que a suíte nativa não acompanha um contrato único validado. É necessário confirmar o contrato financeiro vigente do Expo e ajustar teste ou implementação conforme essa decisão. Não gerar APK alegando validação integral enquanto houver essa divergência.

## Verificações executadas

| Área | Resultado observado |
|---|---|
| Web — unitários | 394 testes em 57 arquivos passaram. |
| Web — lint | Passou. |
| Web — TypeScript | Passou. |
| Web — build de produção | Passou, incluindo as 24 páginas. |
| Web — navegador | 53 cenários únicos validados: 51 passaram na primeira execução; 2 falharam e passaram isolados com um worker, sem mudança de código. |
| Diagnósticos adicionais | 7 casos reproduziram os seis defeitos funcionais R01–R06, com dados sintéticos. |
| Backend Python legado | 33 testes e Ruff passaram; warnings de depreciação das dependências não foram contados como defeitos funcionais. |
| Expo — domínio isolado | 65 testes: 54 passaram e 11 falharam. |
| Raiz — Vitest agregado | Falhou por escopo/configuração e divergências nativas; não usar como total funcional. |
| Raiz — TypeScript | Falhou; coleta frontend com configuração Expo, inclusive aliases não resolvidos. |

A execução de navegador cobriu login de visitante/redirecionamento privado, navegação, demo de cadastros/cursos, agenda/chamadas, presença e atividades, notificações e contato, pagamentos/extrato/gráficos, configurações, backup na interface, tarefas/listas/arquivo, novidades e layout em tamanhos móveis e desktop.

Os dois cenários repetidos foram: rolagem de presença no fluxo demo móvel e tooltip de gráfico por teclado/mouse. O segundo falhou ao criar a página no navegador. Ambos passaram isoladamente; a revisão registra instabilidade de execução e não os apresenta como defeitos funcionais confirmados. Foram observados avisos de hidratação em logs do modo de desenvolvimento, sem falha de produto isolada atribuída a eles nesta revisão.

Comandos principais:

```powershell
npm.cmd run web:test
npm.cmd run web:lint
npm.cmd run web:typecheck
npm.cmd run web:build
npm.cmd run test:e2e --workspace=@aulapay/web -- --workers=1
npm.cmd run api:test
npm.cmd run api:lint
node node_modules/vitest/vitest.mjs run --dir src
node node_modules/typescript/bin/tsc --noEmit --pretty false
```

Observação: a execução ampla de E2E acabou usando três workers pelo encaminhamento de argumentos no script da raiz; a repetição dos dois cenários usou o comando direto do workspace com um worker. A configuração desse encaminhamento é outra razão para preferir os comandos diretos indicados acima.

## Limites da revisão

- Não houve login ou alteração de dados em contas reais, deploy, envio de mensagens ou início de reunião.
- Firebase autenticado e integração Kodland foram exercitados por mocks/fixtures e leitura de código; disponibilidade real, permissões e formato completo dos retornos da conta não estão aprovados por estes resultados.
- Regras Firestore foram lidas, mas não executadas em emulador nem comparadas com regras atualmente publicadas.
- O aplicativo Expo foi revisado estaticamente e pelo domínio; não foi executado em aparelho/emulador nem gerado novo APK.
- Testes não garantem cobertura de toda combinação de dados, concorrência ou volume. Em especial, a suíte verde atual não cobria os cenários R01–R06, que foram reproduzidos separadamente.
- Os arquivos temporários de diagnóstico foram removidos depois da execução. Nenhum código funcional foi modificado para fazer os checks passarem.

## Ordem recomendada de correção

1. R01: proteger identidade e referências nas operações financeiras/cadastrais assíncronas.
2. R02 e R06: estabilizar preservação dos links e a distinção entre atrasado e recebido.
3. R03–R05: estabilizar invalidação do runtime, estado entre dispositivos e carga inicial.
4. R07–R08: separar as ferramentas dos projetos e reconciliar o contrato/testes do Expo.
5. Reexecutar os casos de diagnóstico como testes de regressão e validar a integração com uma conta autorizada e o emulador Firestore antes de aprovar o uso real da sincronização.
