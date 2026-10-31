# Notificações de acompanhamento

## Ativar e configurar

Abra **Configurações > Notificações**. Ative o recurso, escolha a data inicial de acompanhamento e use **Ver prévia** antes de salvar. As notificações começam desativadas para que o professor decida quais aulas anteriores deseja acompanhar.

- **Faltas:** alerta somente para ausência explícita sem justificativa, após o fim da aula e a tolerância configurada.
- **Atividades de aula:** escolha Não alertar, Nenhuma entregue ou Mais de N sem entregar. Com N=2, o alerta começa em 3 pendências.
- **Dever de casa:** habilitação independente; desligue os alertas de aula para acompanhar somente deveres de casa. Considere desativar faltas também se quiser exclusivamente atividades.
- **Prazos:** atividades de aula aguardam o encerramento e eventual prazo explícito. Casa precisa de prazo explícito ou de uma política de dias após a aula, cujo vencimento ocorre às 23:59 no fuso configurado. A tolerância é aplicada antes da cobrança.
- **Mensagens:** o modelo de atividades fica nessa seção; faltas reutilizam Configurações > Mensagens.

Nas atividades próprias, defina Aula ou Casa, prazo, obrigatoriedade e dispensa ao cadastrar/editar a atividade. O campo de prazo manual informa que usa o horário do dispositivo. Registros antigos sem tipo ficam como Desconhecido até classificação explícita.

## Atualização automática da Kodland

Com integração ativa, turmas já importadas e acesso salvo em Configurações > Dados e backup,
a aplicação usa estas políticas:

| Informação | Atualização automática |
| --- | --- |
| Turmas, alunos e grade | Uma vez por dia civil em America/Sao_Paulo; a carga diária compartilha os dados de agenda/cronograma, sem folha oficial. |
| Link disponível da próxima aula | Consulta leve dos metadados de turmas na janela dos 15 minutos anteriores ao início; não baixa novamente atividades, presença ou materiais. |
| Presença | Por ocorrência datada da turma, 30 minutos após o término. Se incompleta, uma segunda tentativa a partir de uma hora após o término, mantendo pelo menos 30 minutos entre tentativas. |
| Atividades/progresso | A cada seis horas por turma, independente da tela aberta; sem consultar presença ou cronograma. |
| Pagamentos | Permanecem manuais nesta etapa, inclusive na sincronização total solicitada pelo usuário; não foi ativada rotina mensal ou de cinco dias antes do pagamento. |
| Contatos detalhados e materiais | Sob demanda/manual, sem nova rotina periódica. |

Presença para após confirmação conhecida de todos os alunos ativos da ocorrência ou duas tentativas,
incluindo falhas de transporte. UNKNOWN não significa falta. Consulta atrasada pode recuperar a aula
por até 24 horas após seu término; após esse prazo, usar atualização manual. Aulas canceladas,
turmas arquivadas e ocorrências sem horários confiáveis não geram consulta pós-aula. Aula que
atravessa meia-noite usa o término no dia seguinte. As tentativas ficam no documento por usuário
`sync_status/automatic`, com retenção de sete dias e limite de 400 registros anteriores. A carga
diária e a consulta pré-aula também limitam falhas a duas tentativas no seu respectivo período.

Funciona com a aplicação aberta, aba visível e conexão disponível; retoma ao voltar à aba ou à
rede. A primeira tentativa ocorre após 30 s; o tick de 30 s e a avaliação local de um minuto não
significam consulta Kodland/Firebase nesses intervalos. Contexto e fontes de notificações são
reaproveitados em memória por até seis horas, invalidados por alterações relevantes. Uma sinalização local de sucesso invalida também o contexto das outras abas da mesma conta, quando o armazenamento do navegador está disponível. Ler um alerta
não invalida toda a fonte pedagógica. Não existe job com a aplicação fechada nem novo suporte
offline persistente nesta etapa. É necessária uma importação inicial para conhecer agenda e materiais.

A consulta automática de acompanhamento usa `followup_scope:activities` ou `attendance`,
`refresh_schedule:false` e uma única turma autorizada. Uma consulta de presença não altera o
horário de conclusão das atividades. A sincronização total manual também reaproveita o cronograma
já importado, sem reconsultá-lo em cada turma de acompanhamento.

A automática só executa se conseguir o lock imediatamente (`ifAvailable`): não entra na fila manual. Abrir o modal de sincronização pausa novas atualizações automáticas nessa aba; a carga completa reserva prioridade durante todas as etapas, também entre abas com Web Locks. Ocupação da fila mostra Pausada, sem contar como falha nem marcar turma como atualizada. Uma escrita que já começou termina antes de liberar o lock; não é interrompida à força.

Operações manuais/automáticas são serializadas por UID e por Web Locks entre abas
compatíveis. Sem Web Locks, a coordenação é local à sessão. A última conclusão por turma
fica em `sync_status/corrections`; as marcações globais e por turma impedem recalcular
alertas sobre gravações incompletas. Falhas mantêm os dados/casos anteriores e usam
novas tentativas com espera progressiva de 2 a 30 minutos. Sincronização completa continua manual.

Só após gravar presença/progresso e concluir os marcadores é emitido o evento que
atualiza o sino e a tela Acompanhamento. Dados entregues/presenças regularizadas saem
das pendências sem apagar o histórico ou presumir que houve contato.

## Mensagem de atividades

O modelo fica em Configurações > Notificações, com atalho em Mensagens. Botões inserem
as variáveis no cursor; há prévia fictícia e restauração do padrão. Salvar notificações
salva o modelo. Variáveis desconhecidas são apontadas antes de salvar sem bloquear a
edição de modelos legados. Resolver um alerta usa esse modelo; no WhatsApp da lista,
ele só é usado quando existe um alerta de atividade não entregue para aquele aluno.
Uma entrega esperando correção não é tratada automaticamente como não entregue.

## Lista suspensa do sino

O sino abre uma lista suspensa abaixo do cabeçalho, sem modal ou bloqueio da página.
Os casos mais recentes aparecem primeiro, com filtros de motivo, Pendentes e Histórico.
A lista rola internamente e se adapta ao celular. O sino, X, Escape ou clique fora
fecham a lista; Escape devolve o foco ao sino. A engrenagem abre as configurações.
Fechar a lista não confirma contato nem resolve pendências.

## Resolver um alerta

1. Abra o sino no cabeçalho e selecione **Resolver** no caso desejado.
2. Acompanhamento abre o aluno, a turma e a aula do caso. Revise a ocorrência, as atividades faltantes e a mensagem.
3. Cadastre ou edite o contato do responsável, se necessário. O telefone do aluno não é usado como substituto automático.
4. Use **Abrir WhatsApp** e revise/envie a mensagem no aplicativo. Também é possível realizar o contato por outro meio.
5. Clique em **Confirmar contato realizado** somente após o contato. Abrir WhatsApp não comprova envio nem confirma o caso.

O contador representa casos ativos que exigem contato, e não apenas notificações não lidas. Um contato confirmado sai da fila e permanece no Histórico. A atividade continua pendente até entrega/dispensa ou outra regularização registrada na fonte. Uma nova aula ou novas atividades vencidas formam outro caso/revisão acionável. A mesma revisão não reaparece apenas por sincronizar novamente.

Se os dados forem regularizados, a condição deixa de estar ativa, preservando o histórico. Se a consulta falhar ou a sincronização estiver incompleta, os alertas anteriores são preservados com indicação de erro. Consulte os dados atuais antes de agir sobre um histórico antigo.

## Cobertura e limites

- A central é interna à aplicação web. Reavalia ao carregar, focar a janela, voltar à rede, alterar dados e a cada minuto na aba visível usando a fonte já carregada. A leitura remota periódica ocorre em seis horas; só reconcilia alterações na avaliação local. Eventos de alteração e atualização manual renovam o necessário. Não envia push e não executa cobranças com o aplicativo fechado.
- Turmas próprias usam atribuições e estados de entrega explícitos. Entrega aguardando correção não conta como não entregue. Alunos inativos, aulas canceladas, tarefas dispensadas/opcionais e dados desconhecidos não viram cobranças automáticas.
- A sincronização de Acompanhamento preserva o progresso externo em `kodland_task_progress`. Classifica Aula/Casa somente quando o ID da tarefa corresponde aos links de materiais da aula. Estados não documentados ou classificação desconhecida ficam fora da cobrança; a regra Nenhuma entregue aguarda classificação completa.
- Não há prazo individual importado da plataforma externa. Para dever de casa dessa origem, defina a política de dias após a aula. Presenças sem horário final confiável ficam fora dos alertas de falta.
- A cobertura externa foi verificada com contratos/documentação e fixtures locais; não houve operação em conta real nessa implementação (acesso externo bloqueado com HTTP 403 no ambiente). Os avisos da central indicam dados insuficientes. Faça uma nova sincronização de Acompanhamento para popular o progresso; uma fila de correções antiga não substitui esse inventário.
- Conta autenticada usa Firestore e requer rede para confirmar contato. O estado é isolado por UID; a demonstração usa armazenamento local separado. Não há nova promessa de funcionamento offline entre recargas.

## Dados e manutenção

Preferências: `users/{uid}/notification_settings/default`. Histórico: `users/{uid}/notification_cases/{id}`. Os casos possuem chave por fonte/turma/aluno/ocorrência/categoria, revisão do conjunto de atividades e confirmação de contato independente da leitura.

Reconciliação transacional preserva confirmações concorrentes e impede que uma leitura anterior sobrescreva uma reconciliação mais recente. Um marcador técnico `_last_reconciled_at` no documento de preferências é atualizado uma vez por leitura; somente casos alterados são gravados. Esse marcador não é dado pedagógico e é descartado na validação de backup, sendo recriado após restauração. Backup/importação/reset incluem preferências, casos e progresso, mantendo a compatibilidade com backups anteriores sem essas coleções. O acesso segue as regras existentes de dados do próprio UID; nenhuma regra foi publicada nesta entrega.

Código principal: `student-notification-rules.ts` (motor puro), `student-notification-source.ts` (fontes/cache), `student-notification-store.ts` (persistência) e `student-notifications.tsx` (interface). O evento `nexusclass:notifications-changed` invalida o cache e atualiza a central após alterações relevantes.


## Lista de não entregas na mensagem

O modal de WhatsApp em Atividades e a resolução de alertas de atividades oferecem **Listar atividades não feitas**. Ao ativar, a prévia começa no módulo da última aula realizada do aluno naquela turma; o usuário pode escolher um módulo ou todos. Sem código de módulo confiável, a interface informa a ausência de identificação em vez de adivinhar. A consulta reutiliza a fonte sincronizada e o cache por UID, mesmo com alertas desativados, sem consultar a Kodland diretamente nem enviar mensagem automaticamente.

Somente obrigações explicitamente `missing`, obrigatórias e não dispensadas, de aulas já realizadas, entram na lista. Entregues, desconhecidas, outros alunos/turmas, aulas canceladas e futuras ficam fora. A fila de correções não demonstra falta de entrega. Ausência de registros não comprova conclusão de todas as atividades. Os módulos dependem dos códigos presentes nas aulas sincronizadas; o padrão usa a última aula encerrada, não um indicador independente de progresso da plataforma.

**Inserir lista na mensagem** preserva o texto editado e substitui a lista anteriormente inserida enquanto esse bloco não tiver sido alterado manualmente. O WhatsApp continua exigindo abertura e envio pelo usuário. O filtro não grava preferências nem registra dados dos alunos em logs.


O código do módulo também é resolvido pelo catálogo (`module_number`/posição da aula), mesmo que o título não contenha MxLy. O botão ao lado do seletor reconsulta os dados sincronizados sem cache, mantendo o escopo da conta. Se o filtro não tiver itens, a interface explica o estado e oferece todos os módulos quando houver pendências em outro módulo; Inserir aparece apenas com uma lista real. Sem registros, é necessário atualizar Acompanhamento, não interpretar a ausência como conclusão. O modal limita sua altura ao viewport e rola internamente para manter todas as ações alcançáveis no mobile.
