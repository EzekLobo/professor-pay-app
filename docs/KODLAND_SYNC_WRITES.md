# Gravação incremental dos dados Kodland

A carga completa continua consultando os dados autorizados da Kodland. Turmas, alunos, aulas, extras e disponibilidade são comparados aos documentos salvos antes de gerar escritas. Presença, fila de correções e progresso de atividades também pulam documentos sem mudança, inclusive na rotina automática. Notas locais, ocultação, vínculo com turma própria, materiais e ajustes financeiros continuam seguindo as regras de preservação anteriores.

A comparação normaliza a ordem das chaves e ignora somente os horários técnicos de criação/atualização. Datas de criação já existentes são preservadas; uma data ausente é preenchida uma vez quando faz parte do documento. Campos removidos, listas e estados alterados continuam gerando uma atualização. As exclusões confirmadas mantêm os critérios anteriores de escopo e obsolescência.

As alterações desses fluxos usam lotes de até 100 documentos, com um lote em andamento. O progresso conta alterações confirmadas e registros sem mudança; não representa contagem de cobrança. Um retorno transitório permite uma repetição com um WriteBatch novo, pois um batch do SDK é de uso único. A conclusão nunca é anunciada antes da confirmação dos commits. Locks e guardas de cancelamento continuam protegendo escritas já enviadas.

Na automática por turma, os registros anteriores de presença, correções e progresso são consultados por `external_class_id`, sem varrer o histórico de todas as turmas. A consulta usa índice simples padrão, sem alteração de regras ou implantação de índice composto. A sincronização manual ampla mantém reconciliação completa dos grupos autorizados.

Marcadores de controle, horários de conclusão e o fluxo separado da folha oficial continuam tendo suas próprias gravações. Esta alteração não significa que uma sincronização completa custará zero operações Firebase.

## Quota e confirmações pendentes

O usuário informou plano gratuito Spark. O uso real do projeto não foi consultado nesta execução. Regravações repetidas podem consumir a quota diária; o fato de estar no Spark não prova que ela foi atingida. Conferir Firestore Database → Uso e os erros da referência antes de atribuir o bloqueio à quota.

Se o SDK devolver `resource-exhausted`, a interface informa limite de uso/capacidade com referência, sem repetir o lote ou aguardar outro marcador de falha no mesmo banco. Falhas de permissão/conexão também não aguardam esse marcador adicional. O estado remoto pode permanecer `running` como indicação conservadora de sincronização sem confirmação; isso não comprova uma operação ativa. Alertas continuam preservados até uma conclusão válida.

A redução de escritas evita desperdício futuro; não restaura quota já consumida e não cancela commits pendentes. SDK pode continuar aguardando/repetindo internamente sem devolver um erro de quota; nesse caso a interface só pode informar o último lote confirmado e a referência. Referência oficial de limites: https://firebase.google.com/docs/firestore/quotas.
