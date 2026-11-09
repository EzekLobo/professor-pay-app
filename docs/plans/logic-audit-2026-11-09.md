# Revisão de lógica — 09/11/2026

Escopo: aplicação web, cache e atualização de alunos, notificações e pagamentos.
A revisão combina leitura dos fluxos com reprodução em testes; não conclui que
não existam outros defeitos fora dos cenários verificados.

## Problemas confirmados e corrigidos

1. **Falha de dados próprios retida por seis horas (alta).** Em modo de cache
   ativo, uma consulta manual com falha virava `null` e permanecia no cache por
   todo o prazo de sucesso. Agora a falha invalida somente sua própria entrada,
   não autoriza limpar alertas sem cobertura e permite tentar novamente. A mudança de cobertura também provoca reconciliação, mesmo quando a lista de novas pendências continua vazia.
   Regressão em `student-notification-source.test.ts`.
2. **Atualização de notificações perdida ao mudar a fonte (alta).** Se a fonte
   mudasse durante uma leitura pendente, a nova execução entrava na fila, mas a
   conclusão antiga não esvaziava essa fila por causa da geração diferente.
   Agora a fila é retomada pela fonte atual enquanto o provider está montado;
   respostas antigas não podem preencher o cache, e desmontagem não agenda
   trabalho tardio. Revisões de metadados também impedem reconciliar fonte lida
   com configuração anterior. Testes do ciclo de vida em
   `student-notifications-races.test.tsx`.
3. **Extrato cancelado ou reaberto por respostas atrasadas (alta).** Eventos de
   atualização invalidavam uma abertura ainda pendente mesmo sem extrato
   visível. Leituras após uma alteração também podiam reabrir o extrato fechado
   ou substituir uma nova seleção. `StatementRequests` separa intenção do usuário
   de atualização em segundo plano; abrir, falhar, fechar e mudar de seleção
   têm regressões próprias. A falha ao abrir outra competência preserva a
   possibilidade de atualizar a competência que já estava visível.
4. **Cache reativava a integração desativada (alta).** Turmas, cursos, resumo e
   fonte de alertas presumiam `kodland_enabled=true` pela existência do cache.
   Agora uma preferência explícita é respeitada. Cache continua disponível
   durante indisponibilidade do serviço de preferências, mas não como alternativa
   a conta recusada. Alertas anteriores da integração podem ser desativados sem
   apagar o histórico. Testes verificam a fonte, o helper e as telas de atividades
   e cursos com cache ativo e preferência falsa.
5. **Gravação concluída tratada como falha da ação (alta).** Se a confirmação ou
   outra alteração persistisse e a releitura seguinte falhasse, a promessa da
   ação rejeitava e a confirmação continuava disponível para repetição. A falha
   de consulta agora é separada da gravação; a ação termina com sucesso e o
   extrato obsoleto é fechado, sem reabrir seleção mais recente. O usuário pode
   consultar novamente. Testes de navegador em390 e1440px verificam uma única
   confirmação e encerramento do modal após falha da releitura.

## Limites da verificação

- Testes usam fontes controladas e a demonstração; não foram enviados WhatsApps,
  alterados pagamentos de conta real ou acessados dados privados de alunos.
- As mudanças não alteram fórmulas financeiras, códigos de entrega ou créditos.
- Prazos de leitura não prometem cancelar gravações em andamento.
- Passaram687 testes unitários, lint, tipos, build e29 cenários Chromium
  (12 diagnósticos e17 regressões). Após push, conferir a versão correspondente
  e as telas na Vercel.
