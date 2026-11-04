# Sincronização automática por escopo

A integração automática usa as credenciais Kodland salvas em **Configurações > Dados e backup**. A integração precisa estar habilitada. Dados de turmas e alunos já importados aparecem enquanto as consultas operacionais são feitas em segundo plano.

## Política

| Informação | Gatilho e encerramento |
|---|---|
| Turmas e cadastro dos alunos | Atualização manual. A automação não reimporta perfis ou responsáveis. |
| Disponibilidade e materiais | Sem atualização automática. Materiais mantêm a ação sob demanda. |
| Novas aulas extras | Ao entrar na Agenda, descobrir apenas novidades da semana atual, de segunda a domingo. |
| Situação de extra conhecida | Não reconferir as ministradas nem as futuras conhecidas. Após passar o dia de uma extra ainda não ministrada, conferir uma vez o relatório. Uma resposta válida encerra a conferência, mesmo negativa. Erro ou estado desconhecido mantém a pendência. |
| Presença | Uma conferência da ocorrência da turma, uma hora após o fim da aula. Estado ainda não marcado permanece desconhecido; atualização posterior pode ser manual. |
| Atividades e correções | A cada entrada em Turmas, incluindo atualização dos pontos do ranking. Filtros e abas internas não iniciam outra consulta. |
| Ranking | Atualizar junto às correções. Falha de pontuação pode ser retomada separadamente. |
| Gravações | Buscar após o fim da aula. Se indisponível, tentar novamente nos próximos acessos à Agenda, com intervalo mínimo de 30 minutos. Link encontrado encerra a busca. |
| Chamada | Buscar 15 minutos antes da aula. Se ausente, tentar a cada cinco minutos enquanto a Agenda estiver ativa, até o fim da ocorrência. |
| Pagamentos | Na primeira entrada diária em Pagamentos, entre cinco dias antes e o dia previsto, inclusive. Uma consulta bem-sucedida por competência e dia. |
| Extratos, totais e gráficos | Recarregar os dados persistidos quando os pagamentos mudarem, sem consultar a Kodland novamente por consumidor. |
| Notificações | Conferir após atualizar presença ou atividades e nas mudanças de configuração/dados próprios. Prazos locais continuam sendo avaliados sem releitura remota a cada minuto. |

A carga inicial de presença e gravações considera os últimos sete dias. As pendências já rastreadas continuam após essa janela. Extras pendentes já importadas podem pertencer à semana anterior e continuam elegíveis para sua conferência final. A conferência final de uma extra é independente da procura de sua gravação.

## Grade e chamada

O ícone de vídeo indica que existe uma chamada válida para aquela ocorrência. Dois cliques ou toques consecutivos na aula abrem a página da chamada sem abrir o modal de detalhes. Um clique simples mantém os detalhes; o ícone e o link **Abrir chamada** são alternativas diretas e acessíveis.

O link é validado pela aula, data e horários. A origem é a sessão utilizada pelo cronograma oficial da Kodland, não o link de materiais ou da gravação. Aula cancelada, remarcada, sessão divergente ou janela encerrada não devem oferecer a chamada antiga. Nenhuma reunião é iniciada automaticamente.

## Execução e falhas

- O agendador funciona com a aplicação aberta. Quando ela estiver fechada, os prazos vencidos serão considerados na retomada; não existe tarefa de servidor que guarde a senha do professor.
- Horários usam o fuso configurado nas notificações; o padrão é `America/Sao_Paulo`.
- Consultas automáticas são pausadas sem conexão, com a página oculta ou após falha de autenticação. Corrigir e salvar as credenciais permite retomar.
- A fila é compartilhada por conta, com prioridade para chamadas iminentes. Estado persistido, transação de posse e coordenação entre abas reduzem duplicação. Ações manuais usam a mesma coordenação.
- Falhas mantêm os dados salvos. Uma resposta incompleta não conta como conferência final nem como atualização diária concluída.
- Atualizações entre abas transportam somente identidade da conta, domínios e revisões; não transportam senha ou URL de chamada.
- Atualizações completas e manuais mantêm seus escopos próprios. A exclusão de cadastro, disponibilidade e materiais refere-se aos gatilhos automáticos.

## Dados e manutenção

Políticas e coordenador: `frontend/src/lib/sync-policy.ts`, `sync-state.ts`, `sync-coordinator.ts` e `sync-events.ts`. Runtime autenticado: `auto-sync-runtime.ts` e `components/auto-sync-controller.tsx`. Pagamentos: `auto-sync-payroll.ts`. Contratos operacionais: `kodland-scoped-sync.ts` e `app/api/kodland/sync/route.ts`.

Metadados privados ficam em `users/{uid}/sync_status/auto_*`. O reset inclui essa coleção. Backups não transportam os campos temporários de chamada; restauração invalida links antigos e preserva a conferência final das extras. O cofre de credenciais continua separado do backup.

O contrato de chamada foi confirmado nos arquivos públicos oficiais da Kodland. Testes usam fixtures, sem iniciar aula real. A validação autenticada com uma conta Kodland e o emulador de regras Firestore continuam separados dos testes locais; não presumir que foram executados.

Plano e evidências por etapa: [scoped-auto-sync-implementation.md](plans/scoped-auto-sync-implementation.md).

## Estabilização de 30/10/2026

- Salvar o toggle Kodland atualiza o agendador imediatamente na conta correspondente, inclusive entre abas. Desligar impede novas consultas automáticas e trabalhos de folha que aguardavam a fila. Operações manuais explícitas mantêm seu funcionamento.
- A primeira janela de sete dias usa `activation_at`, criado somente após a integração estar habilitada e haver dados importados. O marco legado anterior à ativação não expande essa janela; pendências já rastreadas continuam preservadas.
- Uma conferência encerrada por outro executor é relida de forma autoritativa para parar novas tentativas de controle. Revisões invalidam o recurso afetado, sem polling de todas as coleções.
- Atualizar manualmente a mesma ocorrência preserva chamada e gravação. Remarcar ou mudar a fonte invalida links antigos. Se um link tiver sido perdido no comportamento anterior, seu marcador concluído não impede recuperação; gravações antigas precisam já estar rastreadas, evitando varredura de histórico não importado.
- Operações financeiras/cadastrais assíncronas e o carregamento com backfill ficam vinculados ao UID que iniciou a operação. Pagamento atrasado sem recebimento confirmado não congela a competência; recebido mantém a proteção existente.

Correções e critérios de regressão: [review-fixes-2026-10-30.md](plans/review-fixes-2026-10-30.md).
