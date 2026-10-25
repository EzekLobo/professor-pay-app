# Estado atual

## Dados e backup — 25/10/2026

- `DataContent` usa `.data-page`: sincronização na largura inteira, Backup completo e Planilhas lado a lado em desktop e empilhados até 1050px, sem painel esticado para preencher a altura. Campos de arquivo compactos, instruções CSV em details, exclusão isolada e fechada no fim.
- Planilhas também funciona na demo com `csvAdapter` local explícito, sem Firebase/Kodland. Exportação CSV bloqueia duplicação e exibe falhas. `e2e/data-layout.spec.ts` cobre 320/390/1440px, ordem dos cards, ausência de overflow e CSV inválido sem gravação.

## Projeção Kodland automática — 25/10/2026

- Removido o painel de comparação e a escolha de fonte em Pagamentos. `kodlandPayrollApi.get()` usa sempre a folha oficial, inclusive para preferências antigas; `syncAll` atualiza a folha junto com o restante. Demonstração segue a mesma regra.
- Histórico inicial: meses anteriores à primeira competência retornada pela Kodland usam cálculo local, identificado no extrato como “Kodland · previsão local”. A data de corte considera também folhas incompletas: não preencher lacunas posteriores nem meses futuros. Sem nenhuma folha não há data de corte conhecida, logo não gerar previsões Kodland. Meses oficiais completos continuam autoritativos; turmas manuais e recebimentos confirmados são preservados.

## Extrato responsivo — 25/10/2026

- Modais de extrato no Resumo e Pagamentos usam `payment-statement-modal`: largura de até 960px, altura limitada à viewport e uma rolagem no próprio modal (sem lista com scrollbar aninhada). Visual compacto: fonte em etiqueta simples, sem comparação/textos de apoio redundantes no extrato (comparação permanece no painel da folha), datas dd/MM com data completa no tooltip; oculta “Normal”/“Contabilizada” repetidos e extras zeradas. Mantém situações excepcionais e quantidade remunerada separada de registros sem cobrança.
- Estados contabilizado/previsto possuem cores próprias; extra criado pelo tutor é explicitamente manual em períodos oficiais. Cobertura de layout em `e2e/statement-layout.spec.ts` verifica 390/1440px, limites do modal, cards e acesso à confirmação sem executá-la.

## Folha oficial Kodland — 25/10/2026

- Extratos oficiais preservam `payroll_status`, `payroll_flags` e `payroll_kind` por linha, inclusive eventos sem cobrança e competências de valor zero. Labels distinguem falta do tutor, ausência de alunos, duração insuficiente, falta de gravação e transferência; não deduzir cancelamento por valor zero. `b0d85d3`: 207 testes, lint, typecheck, build e E2E da folha passam.
- Conferência do backup atual exportado pela própria UI: 82 registros nas seis folhas (73 calculated, 6 reassigned, 3 projected), cinco flags short_duration; nenhuma falta/cancelamento explícito nesta resposta. Não prometer que a API retorna eventos que ela não enviou.

- Correção `62ce5e0`: flags de rollout do roster não são autorização para consultar períodos do próprio tutor. Removido o 403 local inventado; a API de períodos autenticada decide o acesso, com teacher do SSO e validação do dono de cada detalhe. Recusa 403 real continua bloqueada e tem teste de regressão.
- Verificação real no navegador após publicação: seis competências importadas (05–10/2026). Outubro: R$345 contabilizados + R$120 previstos = R$465; setembro aprovado R$405. Alternância para oficial atualizou gráfico e extrato (12 aulas, 11 normais + 1 extra) sem confirmar recebimento. Typecheck, lint, build, 205 testes unitários e 2 E2E da folha passam.

- `kodland-payroll.ts` normaliza a API v2 `tutor_payroll_periods/`; acesso GET com teacher do SSO e período pertencente à lista autenticada. Não há aprovação ou transação financeira remota.
- `kodlandPayrollApi` importa ano atual/anterior atomicamente por UID, com vínculo de professor e proteção contra troca de conta. Coleções: `kodland_payroll_periods`, `kodland_payroll_sync`, `kodland_payroll_settings`. Backup 4.0 continua aceitando 1/2/3.
- Fonte oficial automática para Kodland (substitui o antigo opt-in/comparação). Períodos indisponíveis ou incompatíveis não recebem estimativas locais. Turmas manuais e snapshots recebidos são preservados. Aprovação não significa recebimento.
- Demonstração tem folha fictícia e alternância persistente sem serviços privados. Verificar com lint, typecheck, Vitest (204 testes), build e `playwright test e2e/payroll.spec.ts` (desktop/celular). Suíte E2E completa: 20/21; falha preexistente de wheel na presença manual em 390px permanece fora da integração.
- Histórico: `8ba618b` gerava 403 local indevido ao avaliar flags de roster. Corrigido e importação real validada por `62ce5e0`; não reintroduzir essa checagem como autorização da folha.



## Levantamento do painel de métricas Kodland

- Investigação de 23/10: proxy do ambiente devolve 403 antes do HTTPS para bo/backoffice/sso/www Kodland, inclusive fora do sandbox. Não foi possível inspecionar o painel ao vivo; o usuário foi consultado sobre o link/menu.
- docs/kodland-metrics-review.md separa indicadores derivados das fontes existentes de possíveis métricas oficiais ainda não confirmadas. O mapa anterior de endpoints não identifica o painel de métricas. Credenciais existentes estão no cofre do navegador, sem sessão autenticada disponível aqui.
- Não inventar endpoints ou métricas: correções sincronizadas incluem apenas pendências, sem base para taxa geral de entrega ou tempo de correção; frequência depende de cobertura e denominador; retenção precisa de histórico. Nenhum novo painel ou importação foi implementado neste levantamento.


## Administração simplificada e bloqueio temporário

- A tela prioriza usuários, busca por nome/e-mail e último acesso, com ações compactas e layout em cartões no celular. Removidos o segundo título, os KPIs grandes e o ranking global de funcionalidades.
- Atividade abre um Modal individual com tempo, sessões, funcionalidades mais acessadas (visitas registradas daquela pessoa no período) e histórico de páginas. Cadastro e remoção mantêm confirmação/validação.
- PATCH /api/admin/users aceita {userId, disabled}, atualiza disabled no Firebase Auth e revoga refresh tokens ao bloquear. Protege a própria conta e o proprietário. Analytics inclui disabled, não conta bloqueados como online e exclui contas apagadas da lista sem apagar auditoria.
- authenticatedUser usa verifyIdToken(token, true). Sessões abertas forçam atualização do token ao entrar, a cada 60s em primeiro plano e ao retornar à aba; erros de conta bloqueada/token inválido encerram a sessão, falhas de rede preservam uso offline. O bloqueio não remove dados locais já baixados; tokens antigos em acesso direto ao Firestore podem durar até a expiração (regras atuais verificam somente uid).
- Corrigidas requisições duplicadas ao trocar o período; solicitações anteriores são canceladas. Alterações em frontend/src/app/admin/page.tsx, APIs admin, firebase-auth/server-auth e estilos admin de globals.css.
- Validação: 189 testes unitários, typecheck, lint, build e 17 cenários Playwright de autenticação/interface. Fixture local com Firebase/API simulados conferiu busca, ranking individual, cadastro, remoção e bloqueio/desbloqueio em 1440/390/320px; não executou operações em contas reais.

## Pagamentos compactos e tooltips

- Controles de ano/tipo/indicador/detalhes ficam lado a lado no cabeçalho.
  Barras têm 140 px no desktop e 120 px no celular. Em telas de 1250 px ou
  mais, gráfico e competências ficam em duas colunas; Ver completo expande.
- Tooltips em portal mostram valores nas barras, pontos das linhas e fatias
  da rosca. Barras, meses da linha e legenda da rosca também mostram os
  dados ao receber foco; Escape e saída do mouse escondem o tooltip.
- Navegação do carrossel em layout compacto atualiza diretamente a competência
  sem depender de animationend quando animações estão desativadas.
- Verificado: 15 cenários de interface passaram, incluindo hover/foco,
  troca de competências e layout lateral que cabe na tela de 1440x800.

## Gráfico visual sem informações repetidas

- Removidos do painel do gráfico os KPIs que repetiam o resumo de pagamentos,
  números sobre as barras, contagens sob os meses e texto explicativo longo.
- Barras usam escala lateral e linhas de referência. Linhas mantêm apenas
  meses; rosca mostra proporções por categoria sem repetir os valores.
- Valores exatos, aulas, extras, média e percentuais ficam no Modal anual ou
  mensal; seleção de ano/tipo/indicador permanece disponível.
- Verificado: 174 testes unitários e 13 cenários de interface passam.

## Métricas e visualizações de pagamentos

- Gráfico permite barras, linhas de evolução e rosca de composição do ano,
  alternando valores e quantidades de aulas regulares/extras. O ano filtra
  gráficos e indicadores: recebido, a receber, atraso e percentual recebido.
- Contagens mensais usam lesson_count/normal_count/extra_count. Valores e
  aulas continuam agrupados pela data de recebimento, incluindo previsões.
- Ver detalhes abre Modal anual; barras e botões de mês da linha abrem Modal
  mensal. Incluem contagens, valor extras, média por aula e tabela por status.
- Verificado: 174 testes unitários e 13 cenários de interface passaram,
  cobrindo alternância de gráfico/indicador, ano e modais em desktop/mobile.

## Gráfico na tela de pagamentos

- PaymentHistoryChart fica após os totais, com 12 meses e filtro de ano.
  Usa payment_date e soma por RECEIVED/OVERDUE/demais estados, em centavos,
  sem novas dependências. Detalhes exatos ficam em tabela expansível.
- No celular, os 12 meses cabem no painel; totais abreviados aparecem no
  desktop e os valores completos continuam nos rótulos acessíveis/tabela.
- 173 testes unitários e 11 E2E de interface passaram, incluindo gráfico,
  filtro de ano e confirmação/estorno.

## Sincronização com master — 23/10/2026

- Integradas as atualizações remotas de configurações, operação manual,
  preferências, nick e organização de Acompanhamento. Preservadas duplicação,
  arquivamento, ordenação e bloqueios de exclusão dos cursos vinculados.
- Mantidos catálogo único, ícone de criar curso, validação de URL e modais
  de confirmação. Configurações e Dados e backup ficam junto à saída.
- Validação: 171 testes unitários, lint e 14 cenários E2E Chromium passaram;
  a jornada móvel testa rolagem nos dois sentidos quando já está no limite.

## Catálogo único de cursos

- Por solicitação do usuário, Aulas não exibe mais o painel separado de
  Aulas próprias. Cursos próprios e sincronizados permanecem no catálogo
  Cursos, com criação/edição/exclusão dos próprios preservadas. Dados
  pedagógicos existentes não foram apagados. Testes de interface acompanham
  o catálogo unificado em desktop e mobile.

## Navegação de configuração no rodapé

- ShellFrame agrupa Dados e backup e rotas com rótulo Configurações no fim
  da navegação, imediatamente acima da saída. No mobile preserva a grade.
- Configurações foi integrada do remoto durante a sincronização e aparece
  junto de Dados e backup no rodapé. A grade móvel comporta os sete links.
- Verificado no navegador: posição junto à saída em 1440 px e acesso móvel
  em 390 px. Tipos e lint passam.

## Correções da revisão de interface

- Cursos validam links http(s) dos slides antes de salvar, tanto na interface
  da demo/conta quanto em manualCoursesApi. Erros permanecem no editor.
- Conteúdo de aula ocupa a largura inteira. Sem ocorrência, a opção de
  escopo por encontro fica desabilitada; toda a turma mostra contexto sem data.
- ConfirmDialog reutiliza Modal, concentra cancelamento, estado pendente e
  erros; é usado para estrutura/exclusão de cursos, recebimento/estorno,
  importação de backup e exclusão dos dados privados. Não usa window.confirm.
- Verificado: 160 testes unitários, 15 E2E Chromium, lint e tipos passam.
  E2E cobre validação de URL, preservação ao cancelar substituição, contexto
  e largura do conteúdo, confirmação/estorno na demo móvel. Importação/reset
  privados seguem sem validação com credenciais Firebase reais.

## Aulas próprias compactas

- A seção mantém filtros de turma/data/horário, ações de adicionar e abas
  Conteúdos/Atividades com contagem. Conteúdos e entregas ficam em linhas
  expansíveis; formulários só aparecem no Modal compartilhado ao adicionar
  ou editar. Roteiro/materiais são opcionais e recolhidos no editor.
- Abas suportam setas/Home/End e foco por teclado. Sem encontro, adicionar
  conteúdo começa no escopo de toda a turma; atividades exigem encontro/aluno.
- Testes de navegador acompanham abertura dos editores, cancelamento,
  persistência e correção em desktop/mobile; a tela inicial não monta textareas.

## Consistência da interface

- Revisão visual das seis áreas da demo em 1440/390/320 px e login móvel.
  Filtros de Acompanhamento agora empilham sem sobreposição no celular.
- Button não combina estilo primário com ghost/danger; Input preserva a
  classe base ao receber classes locais. Textareas herdam tipografia, têm
  foco visível e redimensionamento vertical; controles usam esquema escuro.
- Aulas próprias têm títulos em linha inteira, cartões de conteúdo verticais,
  carregamento explícito, indicação de gravação e cancelamento da edição.
  Cursos usam ação destrutiva distinta e limpam erros ao abrir os diálogos.
- Turmas próprias mostram “Turma ativa/inativa” e plural correto de alunos.
- Verificado: 160 testes unitários e 12 E2E Chromium passam; a regressão
  cobre filtros sem sobreposição em 320/390 px, tipografia, botões secundários
  e cancelamento de edição. Não houve validação visual com Firebase real.

## Fluxo de aulas próprias e manutenção de cursos

- Aulas monta `ManualLessonsSection` com o adaptador privado ou local da demo.
  Turma/data/horário permitem registrar conteúdo e entregas; atividades
  pendentes seguem para Acompanhamento e recebem feedback/conclusão.
- Trocar turma, data ou horário limpa a edição para não mover registros
  acidentalmente entre encontros.
- Cursos próprios têm edição preservando ID/criação e exclusão confirmada;
  `manualCoursesApi.remove` usa a coleção da conta autenticada.
- O campo de backup tem nome acessível. README documenta o uso sem Kodland.
- Verificado: 160 testes web, lint, tipos e 8 E2E Chromium passam, incluindo
  criação/entrega/correção, persistência e manutenção de cursos em 1280/390 px.
  E2E usa a configuração externa do ambiente com Chromium instalado.
- Firebase real e build nativo Expo continuam sem validação nesta entrega;
  testes privados de cursos usam Firestore simulado.

- Preferência operacional do usuário: após concluir e validar alterações, criar
  commit e sincronizar a branch atual com o remoto automaticamente.

## Revisão corretiva — 22/10/2026

- A importação CSV valida todas as linhas na prévia e novamente antes de gravar.
  Horários exportados da mesma turma são reunidos ao reimportar.
- Ocorrências registram `curriculum_mode`: substituições não consomem a fila
  automática e aulas puladas a consomem intencionalmente; o editor expõe ambas.
- O dashboard amplia o horizonte das turmas ativas antes das projeções, gravando
  apenas ocorrências novas ou alteradas.
- Kodland fica oculta em Acompanhamento quando desativada. A disponibilidade usa
  ocorrências futuras e ignora canceladas/remarcadas.
- Verificação: lint, typecheck, 167 testes Vitest e build passam.
- Migração de preferências: contas antigas sem documento `preferences`, mas com
  `kodland_groups` já persistidos, recebem a integração Kodland ativa. Uma
  escolha explícita de desativação continua prevalecendo. Isso preserva
  atividades, presença e o botão de sincronização após a atualização.
- Acompanhamento usa agora uma navegação própria acima do painel: Atividades e
  Presença aparecem como abas compactas, sem subtítulos, e a aba ativa fica
  conectada visualmente ao conteúdo. O painel não repete o título da aba;
  filtros e busca ocupam diretamente sua primeira linha. A barra identifica
  explicitamente `Visualização`, `Agrupar por` e `Mostrar`, evitando seletores
  sem contexto. Em desktop, essas ferramentas ocupam o espaço livre à direita
  das abas, separadas visual e semanticamente da navegação; em telas menores,
  descem para uma linha própria. Cabeçalhos de turmas seguem o
  mesmo cartão. Validado no navegador em desktop e no Playwright responsivo.
- As preferências de Acompanhamento são persistidas no navegador por usuário:
  aba Atividades/Presença, Lista/Compacto, agrupamento e filtro de presença.
  A busca não é persistida para não ocultar resultados ao retornar à página.

## Operação web independente — 21/10/2026

- A operação manual ganhou preferências persistentes, cursos próprios, ocorrências
  de aula, presença e disponibilidade. A integração Kodland nasce desativada e
  só aparece nas telas Turmas, Aulas e Dados após ativação em Configurações.
- Cursos próprios têm CRUD, duplicação, arquivamento, módulos com quantidades
  diferentes de aulas e códigos derivados da estrutura real (`M7L1`). Ao salvar
  uma turma vinculada, as ocorrências são materializadas até o fim da turma ou
  por doze meses; cancelamento/remarcação não consome a sequência do curso.
- Atividades próprias seguem `atribuída → entregue → corrigida`, podem ser
  destinadas a todos ou a alunos selecionados e só entram nas pendências após
  uma entrega. Turmas com histórico financeiro/pedagógico não podem ser
  excluídas definitivamente: devem ser arquivadas.
- Acompanhamento abre em Atividades e Presença inclui grades das turmas próprias,
  inicialmente fechadas, com alunos ativos, datas reais no cabeçalho, código na
  célula, foco na última aula e registro dos quatro estados. Falta sem justificativa
  oferece somente o ícone do WhatsApp e mensagem editável com primeiro nome.
- O financeiro usa `manual_occurrences`: planejada/realizada é cobrada uma vez,
  cancelada/remarcada não é cobrada e snapshots recebidos continuam imutáveis.
  Quantidade ou presença de alunos não multiplica o valor.
- A tela Configurações reúne duração, pagamento, tarifa, mensagem, opt-in Kodland
  e disponibilidade; os horários livres exibidos já descontam aulas recorrentes.
- Dados e backup exporta/importa o esquema 3.0 com preferências, cursos,
  ocorrências, presença e disponibilidade, preservando leitura dos backups 1.0 e
  2.0. CSV de alunos e turmas tem prévia, validação antes de gravar, matrículas por
  e-mail e neutralização de fórmulas na exportação.
- A demo restaura todas as novas entidades apenas no navegador e não consulta
  Firebase/Kodland. CI dispara na branch `master`; seletor JSON tem nome acessível.
- Verificação local: typecheck, lint, 162 testes Vitest, cobertura, build e smoke
  Chromium. O smoke específico da jornada manual também passa sem requisições
  externas; executar `npm.cmd run web:e2e` para a suíte completa após mudanças.

- O Shell passou a manter uma área de página com altura mínima igual à janela.
  Resumo, Pagamentos, Turmas, Aulas, Acompanhamento, Dados e Administração
  marcam seu painel principal para ocupar o espaço restante quando há pouco
  conteúdo, sem limitar páginas que precisem crescer e rolar.

- Os links de Slides e Roteiro no modal compartilhado de materiais exibem
  ícones de download, preservando a abertura segura do recurso em nova aba.
- Ao abrir uma turma em Acompanhamento > Presença, a grade centraliza a última
  aula já ocorrida no horário de São Paulo. A roda do mouse navega
  horizontalmente para consultar aulas anteriores e próximas; nas
  extremidades, a rolagem vertical normal da página continua disponível.
- A mensagem de falta do WhatsApp usa blocos separados, código de aula no
  formato `M7.L4`, destaque compatível com WhatsApp para a gravação e o link
  isolado em sua própria linha. Os emojis 👋 e 🎥 reforçam a saudação e a
  gravação sem carregar o texto. A saudação usa somente o primeiro nome do
  aluno; o professor ainda pode editar antes do envio.

## Cronograma Kodland como fonte de verdade

- Confirmado diretamente na Kodland em 20/10/2026: `schedule_view` usa
  `timetable_time` para a ocorrência real. Na turma `PRM_BRA1919_SEG-19`, a
  aula global 30 (`M8.L2`) está em `2026-10-19T22:00:00Z` (19h em São Paulo).
  As gravações ficam em uma fonte separada do Backoffice,
  `zoom_recording/get_videos_by_student_group_id/{groupId}`, e devem ser
  anexadas pelo `lesson_id`, priorizando `s3_url` e depois `download_url`.

- Confirmado: nas turmas sincronizadas, datas, quantidade de aulas, horários
  e link de gravação devem ser determinados exclusivamente pelo cronograma da
  Kodland. A lista de presença apenas vincula o status de cada aluno à
  ocorrência já definida no cronograma.
- O parser da agenda preserva todas as listas de ocorrências devolvidas pela
  Kodland; não pode escolher uma lista curta (`items`) e ignorar `schedule`,
  que contém o cronograma completo.
- Quando a lista geral da turma divergir do calendário (por exemplo, após uma
  aula pulada), o calendário deve prevalecer no merge para data, horário e
  gravação da ocorrência.
- A agenda por turma deve percorrer as páginas de ocorrências: a resposta
  padrão da Kodland limita a lista a 30 aulas, embora o cronograma oficial da
  turma possa conter todas as 40 aulas do curso. Se a Kodland ignorar a página
  seguinte e repetir o mesmo conteúdo, a coleta para imediatamente.
- Algumas respostas colocam a primeira lista em `results` e o cronograma
  completo em `data.schedule`. O parser deve coletar listas conhecidas em
  todos os níveis relevantes, sem retornar ao encontrar a primeira delas.
- Como a forma do payload da Kodland varia, toda lista aninhada é candidata a
  cronograma; somente registros com data, número de aula ou código `Mx.Ly`
  são aceitos. Isso evita importar materiais e metadados como se fossem aulas.
- Confirmado: a rota de sincronização não pode reduzir a resposta da agenda ao
  primeiro `items`/`results`; em grupos como `PRM_BRA1919_SEG-19`, essa lista
  tem só 30 ocorrências, enquanto `data.schedule` contém o calendário oficial
  completo (incluindo M8.L2 em 19/10). Ela usa `kodlandLessonEntries` antes de
  paginar para preservar todas as ocorrências aninhadas.

## Dados e backup

- A tela prioriza três ações: sincronização completa em um cartão compacto,
  backup/restauração no mesmo painel e área de exclusão recolhida em “Opções
  avançadas”. Em telas pequenas, exportação e restauração ficam empilhadas.

## R15 — Turmas próprias e demo local

- A organização de turmas pessoais concentra busca e ações no cabeçalho para
  criar grupo e criar turma. Cada grupo é um quadro independente, como o de
  Turmas Kodland, e mostra configuração e lixeira; grupos com turmas mantêm a
  lixeira desabilitada para evitar exclusão em cascata. A lixeira da turma pede
  confirmação e remove também conteúdos e atividades próprias vinculadas,
  tanto no Firestore quanto na demonstração local.
- O cabeçalho de turmas pessoais fica antes das turmas Kodland e oferece busca
  por grupo, turma ou aluno, além de atalhos compactos para criação. A tarifa é
  configurada por turma; o modal da turma também controla se ela está ativa,
  sem apagar seu histórico ao desativar ou reativar.
- Turmas próprias/alunos ficam em coleções privadas Firestore; horários
  recorrentes múltiplos, tarifas com vigência, dia de recebimento por turma,
  conteúdo e atividades manuais compartilham o cálculo financeiro do Resumo.
- A tela de Turmas separa o agrupamento virtual **Turmas Kodland** (somente
  sincronização) de **Turmas pessoais**, organizadas por `manual_class_groups`.
  Cada turma concentra horários, alunos, tarifa e dia de recebimento; turmas
  pessoais legadas sem `group_id` ficam em “Sem grupo” até serem movidas.
- Turmas Kodland exibem o resumo financeiro diretamente nas linhas; a tarifa e
  o dia de recebimento de cada grupo são configurados pelo ícone de ajustes no
  cabeçalho, que abre a seleção dos grupos sem repetir o botão em cada linha.
- Cada turma Kodland também tem lixeira com confirmação. A exclusão é uma
  ocultação local persistente por `external_id`, evitando que a turma reapareça
  ao recarregar ou sincronizar no mesmo navegador sem apagar o histórico da
  plataforma.
- O modal de configuração financeira dos grupos Kodland usa formulário em duas
  colunas no desktop, rótulos com espaçamento consistente e ação alinhada; em
  telas estreitas, os campos voltam para uma coluna.
- As ações de cada turma Kodland ficam em um menu de três pontos com edição de
  nome e exclusão confirmada. O nome personalizado é persistido localmente por
  `external_id`, assim como a ocultação da turma.
- Os grupos pessoais seguem o mesmo padrão visual das Turmas Kodland: painel
  independente, linhas de turma com curso/status, horários, alunos e menu de
  ações. Somente Kodland mantém o botão de sincronização no cabeçalho.
- A configuração compartilhada das turmas Kodland também permite alterar o
  nome exibido do grupo. O rótulo e os nomes personalizados são persistidos no
  navegador; o botão de confirmação permanece apenas como “Salvar”.
- `/demo` usa os mesmos componentes de Turmas, Aulas e Correções com adaptador
  local em `demo-manual-adapter.ts`; o estado fictício persiste em
  `nexusclass.demo.v2` e é filtrado em `demo-storage.ts`. O seed inclui o
  grupo pessoal fictício “Turmas autônomas” e sua turma; grupos, alunos e
  turmas criados pelo visitante persistem e são restaurados juntos. Nenhuma
  ação manual da demo deve chamar Firebase ou Kodland.
- O backup privado v2 inclui registros manuais e aceita v1. Recebidos guardam
  snapshot; o backfill de recibos legados ocorre no primeiro acesso. A demo
  também congela pagamentos recebidos localmente.
- Verificação: 125 testes unitários, typecheck, lint, build e smoke Chromium
  da demo passaram; o smoke monitorou ausência de chamadas Firestore/Kodland.
  Smoke autenticado de Firestore ainda depende de uma conta de teste.

## Demonstração fiel para visitantes

Direção atual: entrada `/` abre login com botão “Entrar como visitante”.
Visitante e conta privada compartilham UI e cálculo de domínio; somente
persistência e permissões variam. Próximas tarefas independentes: entrada
(page/AuthForm/demo navigation) e cálculo financeiro compartilhado
(api/demo-snapshot/testes). Verificação final depende de ambas.

Dependências: adaptadores de conteúdo (Resumo/Pagamentos/Turmas/Aulas),
ShellFrame puro e conteúdo Correções/Dados são extrações independentes em
arquivos disjuntos. A integração `/demo` depende dessas três entregas;
validação e publicação dependem da integração. Critério: mesmas estruturas
e estilos privados, sem autenticação, telemetria ou chamadas de APIs na demo.

- [x] Reutilizar grade/resumo e financeiro reais com adaptadores locais, sem
  chamadas Firebase/Kodland; preservar comportamento privado padrão.
- [x] Substituir demo de CRUD manual por menu e telas reais (Resumo, Pagamentos,
  Turmas, Aulas, Correções, Dados e backup), com dados fictícios e ações locais.
  Remover Alunos separado; preservar identidade visual e modais.
- [x] Validar build/lint/testes e navegação na demo publicada; documentar o que
  é simulado, atualizar screenshot/README e sincronizar ao concluir.

- Confirmado: `/demo` usa ShellFrame e os conteúdos reais de todas as páginas,
  extraídos em `components/*-page.tsx`; wrappers privados preservam AuthGuard.
  `api.calculateDashboard` é o cálculo puro compartilhado com a conta privada.
  Não manter uma segunda implementação de regras financeiras na demo.
- Persistência visitante: `nexusclass.demo.v2` e notas `nexusclass.demo.note.*`.
  Restauração aceita somente ações permitidas, mantendo identidades/links do
  seed fictício; não monta AuthGuard, telemetria ou integrações privadas.
  Sincronização e materiais externos são simulados; arquivos pessoais e
  administração são indisponíveis. Entrada privada continua protegida.
- Confirmado localmente: build, typecheck e 105 testes; navegador verificou
  entrada visitante sem credenciais, filtros/correção, persistência após reload,
  reset, modais sem credenciais e recálculo financeiro. Screenshot sintético
  em `docs/images/nexusclass-demo.png`. Vercel `a0d2ced` publicado com sucesso;
  teste no domínio público confirmou login → Entrar como visitante → grade
  sem credenciais. Código entregue em `fbee0e4` + correção `a0d2ced`.
- Vercel `fbee0e4` falhou em TS7006 nos handlers opcionais de `Link` em
  ShellFrame e KodlandSummary, embora o build local tenha passado. Tipar
  eventos como `MouseEvent<HTMLAnchorElement>` explicitamente e verificar
  o build remoto, não inferir publicação pelo teste local.
- Causa da diferença confirmada: instalação local TypeScript 7.0.2 diverge do
  manifest 6.0.3. Para reproduzir Vercel, executar `npx --package=typescript@6.0.3
  tsc --noEmit -p <frontend/tsconfig.json>` fora do projeto (dentro dele o npx
  seleciona o binário local). Nenhuma dependência/versionamento foi alterado.

- O modal de log administrativo limita altura ao viewport e rola a tabela
  internamente, com cabeçalho das colunas fixo. Ao corrigir modais longos,
  considerar a regra global tardia `.modal-dialog { overflow: visible; }`:
  usar seletor específico e `min-height: 0` no conteúdo flex rolável.

## Correções — abertura externa restaurada

- A pedido do usuário, “Corrigir” voltou a abrir o link individual da Kodland
  em uma nova aba. Modal, navegação incorporada e seus estilos foram removidos.
  A atualização de correções continua usando as credenciais salvas.

- Teste real de login automático em 14/10 (Lucas, tarefa 110876): SSO com
  credenciais locais retornou sessão; middleware Learn aceita `token` e
  `refresh_token`, mas o iframe exibiu “Não é possível acessar a página”,
  inclusive após “Tentar novamente”. O plugin público `user-store` inicializa
  perfil/roles pelos cookies antes do middleware de tokens da URL; o iframe
  não recebeu a sessão da aba autenticada. A tentativa `bbbe4b2` foi retirada
  após falhar no teste. Não adicionar login por tokens como solução validada;
  é necessário suporte da Kodland ao bootstrap do perfil no contexto incorporado.


- O cabeçalho da grade exibe a última atualização bem-sucedida em horário de
  São Paulo. O instante é persistido por usuário em `sync_status/schedule`
  após sincronizações `schedule` ou `essential`; correções e falhas preservam
  a data anterior. Contas sem esse registro exibem “não registrada”.

- Teste real de 14/10 reproduziu Rafael (07/10, 20h) pendente após atualização,
  embora a Kodland exibisse relatório concluído. O código público do modal
  confirmou a fonte: `extra_lesson_reports/by_extra_lesson/{extra_lesson_id}/`
  e campo `outcome: completed`; consultar `extra_lesson_requests/{id}/` não
  verifica esse relatório. A sincronização passou a consultar o endpoint de
  relatório usando o ID da aula, separado do UUID da solicitação.
  Validado em produção após o deploy `a684618`: Atualizar grade promoveu Rafael
  de pendente para realizada sem intervenção manual; competência de novembro
  aumentou de R$ 495 para R$ 525. Typecheck, lint e 36 testes específicos passaram.

- A reconciliação de aulas extras também identifica a mesma ocorrência quando
  a Kodland troca o ID entre a agenda e a confirmação do aluno: prioriza o
  `request_id` e usa aluno + data + horário como contingência. Assim, uma
  extra marcada manualmente como pendente volta a ser promovida para realizada
  quando a plataforma a confirma.

- O atalho **Feriados** no cabeçalho abre um calendário mensal com feriados
  nacionais derivados localmente e feriados personalizados por usuário. Dias
  nacionais são somente leitura; o usuário pode criar ou remover seus próprios
  dias. Em competências abertas, aulas em feriado ficam fora da previsão sem
  alterar a agenda Kodland. A exceção `BILLABLE` permite contabilizar uma
  reposição; competências recebidas preservam o histórico.

- A sincronização completa em **Dados e backup** agora também carrega os
  materiais das aulas pendentes (slides, roteiros, tarefas em sala e lição de
  casa). A carga é dividida automaticamente em lotes de quatro aulas, com no
  máximo duas consultas detalhadas simultâneas, sem escrita na Kodland. Aulas
  cujo material já está `ready` ou `empty` são preservadas e não voltam a ser
  consultadas em sincronizações futuras.

- A sincronização completa da Kodland foi centralizada em **Dados e backup**.
  Resumo oferece apenas atualização leve da grade, Turmas atualiza turmas ou
  responsáveis e Correções atualiza somente pendências. A carga completa ainda
  é repartida: dados essenciais primeiro e correções por turma depois.

- O usuário pode optar por salvar as credenciais da Kodland neste navegador.
  O app cifra os dados com AES-GCM e os guarda em IndexedDB com chave WebCrypto
  não exportável, recuperando-os antes do gerenciador nativo de senhas. A senha
  não é enviada para Firestore, não fica em `localStorage` e não requer variável
  extra na Vercel; o aviso de sucesso confirma quando o navegador concluiu a
  gravação local.

- Para extras, um `completed: false` antigo da Kodland não anula mais evidência posterior no mesmo evento: status de realização, flag positiva ou gravação marcam a aula como realizada; cancelamento e reagendamento preservam a pendência.

- A reconciliação de extras só remove registros antigos quando todas as fontes necessárias responderam; falhas parciais preservam extras e a decisão manual de pendência. Cancelamentos e reagendamentos prevalecem sobre flags de conclusão obsoletas, e uma extra do dia atual só é contabilizada após seu horário final.

- A conciliação de extras atualiza uma pendência quando a agenda do aluno confirma a mesma ocorrência. Além do ID estável, ela usa aluno + data + horário apenas como contingência para IDs diferentes entre a grade e o perfil; reconhece campos de conclusão e status como `Conducted`, sem concluir aulas futuras pela data.

- A sincronização completa agora é uma ação única na grade: salva primeiro turmas, alunos, agenda e aulas e depois atualiza correções em lotes de uma turma, sem pedir novamente as credenciais. A atualização de grade é leve e específica. Para extras, a agenda do professor seleciona os alunos a consultar; extras pendentes sem decisão manual também são revisadas, evitando consultar todos os perfis.

- O cabeçalho exibe o atalho `Administração` exclusivamente para `ezeklobo.dev@gmail.com`, que também é o administrador proprietário inicial validado no servidor; `ADMIN_EMAILS` pode adicionar outros administradores. O painel `/admin` ocupa toda a largura disponível, lista contas Firebase (inclusive sem acesso registrado), mostra apenas o botão para abrir o modal de cadastro e permite remover contas comuns após confirmação. As rotas protegidas criam e removem a conta via Firebase Admin, sem expor credenciais no navegador; a própria conta em uso e a conta proprietária são bloqueadas contra remoção acidental, e a remoção preserva os registros de auditoria.

- O painel `/admin` monitora acessos do app web via rotas servidor autenticadas (`/api/audit` e `/api/admin/analytics`): registra sessões, último pulso ativo e visitas de página em coleções administrativas que não são expostas ao navegador. O acesso é restrito por `ADMIN_EMAILS` e exige `FIREBASE_SERVICE_ACCOUNT_JSON` no ambiente de servidor; consulte `docs/FIREBASE.md` antes de publicar.

- Administração também oferece um log por usuário: cada visita de página registra entrada, última atividade e tempo ativo em `admin_page_visits`; o modal “Ver log” apresenta essas ocorrências no período selecionado. O tempo considera apenas a página em primeiro plano e é aproximado pelos pulsos periódicos.

- A navegação web tem uma única fonte de verdade em `frontend/src/lib/routes.ts`: o rótulo do menu também alimenta o título do topo. A antiga divergência de Resumo/Sua rotina e Dados/Seus dados foi removida; a área de dados está nomeada `Dados e backup`.

- O NexusClass possui um tutorial “Como usar” em Resumo, Pagamentos, Turmas, Aulas, Correções e Dados. A abertura é exclusivamente manual pelo botão do cabeçalho, inclusive em primeiro acesso ou após atualizar versões. O assistente inicial também deixou de ser montado no Shell para evitar outro guia automático. O progresso dos roteiros abertos manualmente continua salvo por usuário no Firestore.
- Atualizar Turmas executa `essential` e depois `profiles`, antes de recarregar os alunos. A etapa de perfis consulta o backoffice e grava contatos do aluno e do responsável, preservando valores anteriores quando a resposta omite campos. O parser mantém os contatos aninhados do responsável separados dos contatos do aluno.
- Incidente de isolamento de credenciais: o cofre Kodland anteriormente tinha uma entrada global por navegador. Agora grava/lê `kodland:{firebaseUid}`, ignora o registro legado global e não usa fallback automático do gerenciador de senhas. Dados e backup deixou de recuperar o username global de localStorage. AuthGuard limpa/remonta a tela ao trocar de usuário; sync rejeita respostas de outra sessão e syncAll verifica a conta entre etapas. Credenciais antigas precisam ser informadas novamente em cada conta. Dados já importados incorretamente não foram apagados.
- Referência de produção `53098be3-0a76-41e3-856d-9b367a088110`: logs Vercel confirmam login bem-sucedido e 3 turmas; a falha real era `material_denied` antes do catálogo, ao solicitar uma turma antiga fora da conta Kodland atual. `syncAll` limita materiais aos `group_ids` ativos retornados por `essential`. Erros `material_not_authorized` agora distinguem permissão de material de credenciais inválidas; teste de regressão cobre registros remanescentes de outra conta sem consultá-los ou apagá-los.
- O cabecalho nao exibe mais “Painel pessoal” nem saudacao duplicada: titulo da pagina fica centralizado e o perfil compacto permanece no canto direito.
- Grade, Correcoes e Turmas usam o mesmo fluxo de sincronizacao: o e-mail e lembrado no navegador; apos sucesso, o app guarda usuario e senha em um cofre AES-GCM local no IndexedDB e oferece tambem ao gerenciador de senhas nativo. Ao reabrir qualquer modal, recupera automaticamente a credencial local. A senha nunca e salva no localStorage nem no Firebase; em falha, ela permanece no formulario para nova tentativa. O snapshot e escrito em lotes de ate 400 operacoes para nao exceder o limite do Firestore. A Kodland retorna 403 para credenciais recusadas, tratado como erro de usuario/senha invalida.
- As aulas extras na grade distinguem apenas pendente e realizada; uma aula futura sempre permanece pendente ate sua data, mesmo que a API a marque prematuramente como concluida. Uma aula realizada (por status, gravacao ou confirmacao manual) compoe o extrato e usa borda roxa, distinta do azul das aulas de turma. O card extra abre um modal para o professor marcar Pendente ou Realizada; essa decisao manual e preservada nas proximas sincronizacoes.
- Os indicadores de Turmas, Alunos e Correcoes pendentes no resumo usam formato compacto em linha para priorizar a grade semanal.
- Em desktop, o resumo reduz os espacamentos verticais e a altura do carrossel para manter grade e competencias na mesma tela quando houver espaco suficiente; telas menores preservam a rolagem normal.
- Em `/classes`, a tela exibe somente as turmas sincronizadas da Kodland; o acordeao mostra o nome da turma e a quantidade de alunos ativos. Considera-se ativo somente o aluno com status `Admitted`/`Admitido`; expulsos, trancados, desligados e estados desconhecidos ficam fora da contagem e do ranking. A lista e ordenada pela pontuacao de atividades, com posicao e pontos. Os dados de progresso, responsavel e atalhos de contato/perfil ficam no modal individual acionado pelo aluno.
- Em `/corrections`, o filtro Turmas lista todas as pendencias agrupadas por turma; Alunos e Aulas preservam a turma como primeiro nivel e subdividem internamente por aluno ou por aula.
- Em `/corrections`, cada turma agora e uma secao visual propria, com contador de pendencias; os cartoes separam aluno/status, aula, atividade e acoes compactas para manter a leitura uniforme.
- Em `/corrections`, as turmas iniciam recolhidas. O atalho Corrigir usa o link individual `learn.kodland.org/.../task/{tarefa}/check/{aluno}` quando a Kodland nao entrega um URL especifico no snapshot.
- Em `/corrections`, o botao “Atualizar correcoes” pede a senha temporaria, usa o e-mail lembrado no navegador, sincroniza o snapshot pedagogico e recarrega as pendencias.
- O modal de materiais nao repete o identificador da aula no topo. Todos os modais usam icone de fechar acessivel; na aba Alunos, “Abrir na plataforma” fica centralizado ao final.
- O modal de cada aula tem o icone de anotacao: ele abre uma folha privada por aula para salvar observacoes e resumos do roteiro no namespace Firebase do professor.
- O modal de uma turma na grade alterna entre Aula e Alunos. A aba Alunos mostra apenas alunos ativos daquela turma, ordenados pelos pontos atuais do resumo de progresso sincronizado.
- No modal da grade, as setas, o acesso aos alunos e o indicador Hoje, Passada ou Proxima ficam em uma unica faixa. Na tela de alunos, o indicador central vira um atalho para voltar ao conteudo da aula. Quando a aula exibida diverge da programada para a semana, o titulo principal fica laranja e o centro da faixa exibe “Voltar para a aula atual”, sem aviso adicional.
- As duas opcoes desse modal usam a mesma altura e rolagem interna. Aula oferece “Abrir na plataforma”; Alunos oferece o atalho direto para a turma e seus alunos na plataforma.
- R9 foi validada localmente com typecheck, 41 testes Vitest, lint, build e os dois smoke tests Chromium das rotas privadas. A verificacao visual com dados reais ainda exige uma sessao Firebase autenticada apos sincronizacao.
- Em `/lessons`, as aulas sincronizadas e os cursos importados agora sao exibidos em secoes por modulo; a ordem do catalogo e preservada dentro de cada modulo e aulas sem identificacao de modulo ficam no final.
- Em `/lessons`, o historico financeiro manual, seus filtros e o cadastro manual de aula extra foram removidos; a tela concentra cursos e materiais sincronizados/importados.
- Em `/payments`, cada competencia mensal abre um modal de extrato com totais, separacao entre aulas normais e extras e todos os lancamentos que compoem o valor; confirmacao e estorno permanecem no mesmo modal.
- No resumo, os destaques de pagamento anterior/proximo foram substituidos pelo carrossel de competencias mensais; ele centraliza a proxima competencia, permite navegar por setas, arraste e rolagem, e nao exibe a acao “Ver completo”.
- O carrossel de competencias no resumo tem um icone de visibilidade no canto superior direito; ele oculta ou reexibe os dados financeiros e preserva essa preferencia no navegador.
- Em `/payments`, as competencias mensais usam carrossel lateral: o proximo pagamento inicia centralizado, os vizinhos ficam nas laterais e as setas movem o foco. O cartao central abre o extrato; valor e status ficam na mesma linha.
- Nas competencias mensais do resumo e de `/payments`, as etiquetas Previsto, Vence hoje e Em atraso abrem as opcoes para marcar o pagamento como Pago ou Em atraso. A escolha e persistida no documento financeiro do professor; na ausencia de escolha manual, o status continua sendo calculado pela data de vencimento.
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
- Na grade semanal, o dia atual recebe borda azul e o indicador “Hoje” no cabeçalho para facilitar a orientação visual.
- Validação local executada: `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run lint` e `npm.cmd run build` em `frontend`.
- O payload real das extras usa `extra_lesson_id`, `student_full_name`, `start_time` e `end_time` em UTC; o importador converte os horários para São Paulo. Os eventos visuais `start/end/title` eram uma transformação da interface, não o contrato da API.
- Próximo passo operacional: publicar e sincronizar novamente; validar a grade de quarta-feira para Lucas Martin e Rafael Coppola. O usuário autorizou acionar a sincronização com os campos preenchidos no navegador.

- O guia "Como funciona?" de Resumo e Pagamentos foi atualizado para a versão 3: explicações curtas acompanhadas de tópicos objetivos, inspirados no padrão consultivo do SGPI. A etapa da lista completa agora explica corretamente que ela já está aberta e que o botão alterna para o carrossel.
- O destaque das competências usa o carrossel como foco visual, evitando que a moldura termine antes dos cartões. Os modais de aula e extrato passaram a oferecer uma seção expansível “Como usar”, com orientações pontuadas.

- R13 mantém as atualizações específicas leves: Correções continua com ação própria e responsáveis podem ser atualizados explicitamente em Turmas. Já a ação **Sincronizar tudo** em Dados e backup complementa a carga com os materiais pendentes, em lotes seguros; o modal sob demanda permanece como contingência para uma aula que tenha falhado.
- Cada aula salva o `source_lesson_id` original da Kodland além do ID Firestore composto. Materiais e status financeiro existentes são preservados em uma sincronização leve e uma falha posterior não remove links já carregados.
- A rota limita a concorrência, aplica timeout por chamada, repete somente erros transitórios e devolve uma referência rastreável ao exceder o orçamento. A gravação mantém um marcador `sync_status/kodland` por usuário e só marca conclusão após os lotes; os dados novos são gravados antes das exclusões seguras.
- R13 foi validada localmente com typecheck, lint, 75 testes Vitest, build e diff check. A validação operacional em uma conta Kodland maior e a confirmação dos limites Vercel permanecem pendentes de acesso autorizado; por isso não há `maxDuration` fixado no código.
- A persistência da sincronização deduplica grupos, alunos, aulas, extras, disponibilidade e correções pelo ID do documento antes de montar cada lote Firestore; isso evita que um mesmo documento apareça duas vezes no batch. O commit tem uma repetição segura para falhas transitórias e o erro exibido agora diferencia permissão, indisponibilidade e incompatibilidade dos dados sem expor conteúdo sensível.
- Antes de cada escrita Kodland, campos `undefined` são removidos recursivamente do payload. Isso protege contas cujo retorno não contém algum campo opcional, pois o Firestore rejeita `undefined` como argumento inválido.
- Quando os materiais de uma aula ainda não foram carregados, o modal apresenta as credenciais em um painel próprio de coluna única e usa a classe visual padrão de campos (`input`); isso evita o layout em duas colunas e o fundo branco dos controles nativos.
- Em Turmas, cada acordeão mostra o nome/identificador da turma, a quantidade de alunos ativos e uma segunda linha com o curso associado, facilitando distinguir turmas semelhantes.
- Os grupos pessoais agora usam o mesmo padrão visual dos cartões Kodland, com menu de três pontos para editar/excluir turma; o grupo Kodland mantém sincronização, configuração financeira compartilhada e ganhou lixeira no cabeçalho com confirmação para ocultar suas turmas localmente.
- Em Aulas, o catálogo agora reúne cursos Kodland e cursos manuais em uma única seção. O botão Criar novo curso gera módulos e aulas e permite cadastrar, por aula, atividades, roteiro, slides e lição de casa; dados manuais persistem no modo visitante e no Firestore autenticado.
- Em Correções, a ação de atualização usa apenas o ícone de sincronização, com tooltip, aria-label e animação durante o carregamento para manter o cabeçalho compacto.
- Os cartões de grupos pessoais seguem o cabeçalho Kodland: título em 1,1rem, resumo de turmas/alunos alinhado à direita e menu de turma com z-index elevado para sobrepor os cartões vizinhos.
- Os ícones de atualização agora têm largura/altura fixas de 42px e não encolhem em layouts flexíveis ou telas estreitas, mantendo o padrão visual da tela Turmas.
- O painel de turmas pessoais não exibe mais o convite para cadastrar a primeira turma quando já existem turmas Kodland sincronizadas; durante o carregamento da Kodland o convite também não pisca na tela.
- Avisos de sucesso/status (`.notice`) agora são toasts temporários fixos no canto inferior direito, com animação e responsividade, sem deslocar os painéis. O aviso equivalente da demonstração usa o mesmo padrão; erros de validação continuam inline junto ao formulário.
- A antiga tela Correções foi renomeada para Acompanhamento. Ela abre por padrão na aba Atividades; Presença mantém o filtro inicial Alunos que faltaram, oferece abas Todos/Presentes, prepara uma mensagem editável antes de abrir o WhatsApp e continua acessível pelo seletor do cabeçalho. A sincronização tenta os endpoints de presença da Kodland por aliases (`attendance`, `attendance_history`, `students_attendance`) e salva a coleção `kodland_attendance`; os nomes exatos do endpoint precisam ser confirmados com uma resposta real da conta Kodland.
- A presença aceita respostas planas e agrupadas por aluno (`students`, `attendance_data`, `student_attendance` etc.). Estados `UNEXCUSED`, `UNJUSTIFIED`, `NOT_PRESENT`, `NOT_ATTENDED` e flags booleanas de ausência são normalizados como `ABSENT`; estados com justificativa explícita continuam `EXCUSED`, para que o filtro padrão mostre faltas não justificadas da Kodland.
- Confirmado no navegador: a grade oficial da Kodland obtém a presença em `student_groups/{groupId}/get_students_main_data`, dentro de `progress_info[].lessons_data[].attendance_status`; os códigos são `0=ausente`, `1=justificado`, `2=presente` e `9=não marcado`. A sincronização usa essa fonte como fallback/principal e, após o deploy `52da515`, a tela Acompanhamento exibiu 73 registros reais, incluindo faltas e links de aviso/gravação.
- Em Acompanhamento > Presença, as turmas iniciam recolhidas e mostram somente alunos ativos. Cada turma usa uma grade compacta com a data da aula no cabeçalho compartilhado e o código local (por exemplo, `M7L3`) dentro de cada bloco colorido. O código local vem exclusivamente da aula correspondente no catálogo/cronograma sincronizado, sem supor uma quantidade fixa de aulas por módulo; quando não há associação confiável, a interface mostra `Aula` em vez de inventar o índice. Quando a presença não traz data, a interface a recupera dessa mesma aula no calendário. Todas as linhas se movem juntas em uma única rolagem horizontal, e mudanças de módulo recebem separação lateral. O filtro padrão seleciona alunos com falta sem esconder as demais aulas; cor, legenda e hover comunicam a situação. Cada bloco vermelho abre um modal com mensagem editável sobre aquela aula e inclui o link direto da gravação quando disponível, usando a plataforma Kodland como alternativa.
- O cabeçalho principal separa o título da página do bloco de ações em colunas proporcionais, evitando sobreposição com Feriados, Administração, Como usar e perfil. Entre 721 e 900 px ele organiza título e ações em duas linhas; em telas menores aproveita a largura liberada pelo menu inferior. Validado com lint, typecheck e `git diff --check`.
- O cabeçalho interno de Acompanhamento reúne resumo, abas Presença/Atividades, busca e atualização em uma única barra. A busca ocupa o espaço restante no desktop e quebra como uma linha completa em larguras intermediárias; o botão de atualização permanece quadrado também no celular.
- As datas de Acompanhamento > Presença usam primeiro a aula correspondente no cronograma e, somente sem uma ocorrência datada, recorrem ao registro de presença. Quando a Kodland omite a data, a interface usa a ocorrência datada mais próxima, a próxima aula ou o início da turma como âncora semanal e desloca pelo `course_index` global real; não presume quantidade fixa de aulas por módulo. A demonstração fornece os grupos ao mesmo resolvedor. Verificado no Chromium: cada cabeçalho exibiu `dd/mm` e nenhum mostrou “Sem data”.
- O cofre local de credenciais recebe usuário e senha diretamente após uma sincronização bem-sucedida. Antes, os campos já estavam `disabled` e por isso eram omitidos pelo `FormData`, impedindo qualquer gravação; durante a sincronização agora ficam somente leitura. O cofre continua em IndexedDB com AES-GCM e chave não exportável, sem senha em `localStorage` ou Firebase.
- A grade de presença usa o `lesson_id` numérico da Kodland somente para localizar o `course_index` global correspondente no catálogo e calcula o número local pela posição real da aula dentro do módulo (por exemplo, índices globais 25–28 do módulo 7 → `M7L1`–`M7L4`). Um código `MxLy` vindo da presença só é contingência quando não há associação com o catálogo; na sincronização, a posição dentro de `lessons_data` prevalece, sem assumir quatro aulas por módulo.
- Em Acompanhamento > Presença, o cronograma é a fonte canônica da ocorrência: a grade cria suas colunas a partir de todas as aulas datadas da agenda, com data, horário e gravação do calendário, incluindo encontros futuros. A lista de presença só fornece o status de cada aluno. A sincronização de Acompanhamento atualiza também o cronograma da turma e anexa cada registro à aula correspondente antes de salvar; datas ou gravações vindas da presença são apenas contingência.
- Na junção entre presença e cronograma, um título genérico `Aula` do calendário
  não pode apagar o código `Mx.Ly` obtido de `progress_info[].lessons_data`.
  A grade vincula essa amostra à coluna agendada por ID/índice global: a data e
  o horário continuam vindo do cronograma, enquanto módulo e aula local vêm da
  estrutura real do curso, sem presumir quantidade fixa por módulo.
- Confirmado diretamente nas três turmas reais em 21/10/2026: o cronograma
  alterna o `M` latino (U+004D) e o `М` cirílico (U+041C) nos títulos das
  aulas. O parser aceita ambos e normaliza a exibição para `M7L4`; sem isso,
  títulos como `М10.L4` eram exibidos como `Aula`, sobretudo em aulas futuras.
- A revisão responsiva de 21/10/2026 mantém as seis áreas visíveis na barra
  inferior em 390 px, com rótulos móveis compactos, suporte à safe area e sem
  rolagem horizontal da página. A navegação expõe `aria-current`, oferece o
  atalho “Pular para o conteúdo” e respeita `prefers-reduced-motion`; botões de
  menu de turma têm área de toque maior e o seletor de backup possui rótulo.
- O login oferece recuperação de senha por e-mail com resposta que não revela
  se a conta existe. A tela também diferencia e-mail inválido, excesso de
  tentativas e falha de rede.
- A persistência da sincronização combina operações compatíveis, usa índices
  em memória para localizar alunos/aulas anteriores e envia até três lotes
  Firestore independentes em paralelo, preservando o limite de 400 operações e
  a repetição única em falha. Validação atual: typecheck, lint, 157 testes
  Vitest, build e 7 testes Chromium, inclusive auditoria em 1440x900 e 390x844.

- Para investigações transversais em `frontend/src`, execute `npm run codex:graph:generate` na raiz e consulte com `npm run codex:graph -- <arquivo-ou-caminho>`; o índice local fica em `.codex/graph/` e é ignorado pelo Git. Ele cobre apenas imports estáticos TypeScript/TSX: confirme impacto no código e mantenha `rg` para texto, fluxos dinâmicos, Firebase, APIs e regras de negócio.

- Acompanhamento > Atividades mantém Lista como padrão e oferece Compacto, uma grade por turma com aluno fixo e colunas de aula/atividade. O modelo puro cobre pendências Kodland e próprias, inclusive células vazias de alunos ativos; o smoke Chromium da demo alterna os dois modos e confirma que o fluxo visitante não faz chamadas Firebase/Kodland. Validação em 21/10/2026: typecheck, lint, 158 testes Vitest, build, smoke Playwright e `git diff --check` passam.
- Em Acompanhamento > Atividades, tanto a grade compacta quanto a lista resolvem o índice global da atividade contra o catálogo real da turma e exibem o código local, como `M7L1`, em vez de `Aula 28`. A resolução prioriza IDs e `course_index` e calcula a posição dentro do módulo sem assumir uma quantidade fixa de aulas.
- Na grade compacta de Atividades, passar o mouse ou focar o botão de correção exibe imediatamente um tooltip próprio contendo somente o nome da atividade. O nome do aluno permanece no `aria-label` para preservar o contexto acessível, mas não aparece no tooltip visual.
- Configurações foi reorganizada em seções visuais para padrões das aulas, integração, mensagem de ausência e disponibilidade. Campos numéricos ficaram compactos e ganharam unidades, variáveis da mensagem aparecem como tokens, a Kodland usa um toggle descritivo e a disponibilidade ocupa a largura completa com rótulos explícitos para dia/início/fim. O layout foi conferido na demonstração local em desktop.
- A barra “Salvar configurações” fica no final da página, depois da disponibilidade semanal, e continua enviando o formulário de preferências pelo atributo `form`.
- O administrador cadastra cada nova conta com um nick único de 3 a 30 caracteres. O login aceita nick ou e-mail e resolve o nick por um índice de servidor não acessível pelas regras do cliente. A redefinição de senha permanece disponível e solicita o e-mail, pois o Firebase envia o link para esse endereço. Remover uma conta também remove seu índice de nick.

- Pagamentos mantém altura estável ao alternar barras/linhas/rosca, com controles laterais e tooltips preservados. Competências mensais voltou para baixo dos gráficos, com carrossel completo. Em desktop largo há um gráfico complementar ao lado (composição anual ou evolução mensal); no celular ele fica oculto. Cartões de resumo compactados para altura mínima de 92px. Validação: typecheck, lint e 15 cenários Chromium de interface, incluindo estabilidade da altura e navegação de competências.
