# Tarefas pessoais

Acesse **Tarefas** no menu lateral ou **Mais > Tarefas** no celular. A página
privada `/tasks` começa com quatro listas: A fazer, Em andamento, Aguardando e
Concluído. Use **Listas** ou os três pontos no cabeçalho de uma lista para criar, renomear, reordenar, arquivar, restaurar ou excluir listas. A demonstração está em `/demo#tasks` e usa apenas dados fictícios.

Cartões podem ser tarefas ou problemas, com descrição, prioridade, categoria,
prazo e checklist. Problemas têm um campo opcional de resolução. A movimentação
funciona pelo seletor Mover para, pelos controles de ordem e por arraste no
desktop. O celular mostra uma etapa de cada vez. Busca e filtros consideram
todos os cartões carregados da conta, sem limitar a primeira página.

Concluir um cartão com itens pendentes pede confirmação. Reabrir limpa a data
de conclusão. Arquivar não apaga o cartão; o arquivo permite restaurar ou excluir
com confirmação. Também é possível excluir diretamente pelo editor, após confirmar. Duplicar cria outro ID, reinicia o checklist e limpa prazo e
conclusão, permitindo editar os novos valores antes de salvar.

## Persistência e conexão

Dados remotos ficam em `users/{uid}/task_cards`; a configuração do quadro fica em `users/{uid}/task_settings/lists`. A camada de domínio valida os
campos antes de gravar. O navegador mantém uma cópia e uma fila de operações em
localStorage, separadas por conta. Cada alteração é preservada localmente antes
de ser anunciada como salva. Se faltar espaço ou o navegador bloquear o
armazenamento, o formulário mantém o rascunho e informa o erro.

Alterações pendentes aparecem na interface e são reenviadas ao carregar o quadro,
ao voltar a conexão ou pelo botão Sincronizar. A fila só remove uma operação após
confirmação remota. Atualizações usam patches para preservar campos não alterados
e não recriam um documento apagado remotamente. Conflitos no mesmo campo seguem
a última escrita aceita; não há colaboração ou merge de texto.

Web Locks coordena operações locais e sincronização entre abas nos navegadores
que oferecem essa API. Sem Web Locks, a coordenação é apenas por sessão; evitar
editar a mesma conta em várias abas simultaneamente. Importação, exportação e
limpeza recusam operações com tarefas pendentes. Onde Web Locks existe, as
operações de backup e as gravações locais são serializadas.

A cópia local sobrevive a recargas, mas isso não transforma o aplicativo em PWA:
abrir uma página pela primeira vez sem rede ainda depende de carregar a aplicação.
Não limpar o armazenamento do navegador enquanto houver alterações pendentes.
O cache é privado por UID na interface, mas não é criptografado no dispositivo.

## Backup e demonstração

Backup 4.0 recebe `task_cards` e `task_settings` como coleções opcionais, com validação e contagem na
prévia. Backups antigos sem essa coleção continuam aceitos. Exportação e
restauração de tarefas têm teste de regressão. A limpeza da conta inclui a
coleção e invalida a cópia local após confirmação remota.

A demo usa `demo-task-board-store.ts`, namespace próprio e cenário inicial.
Não acessa Firebase ou Kodland; suas tarefas entram na exportação do cenário e
são restauradas ao reiniciar a demonstração.

## Regras e publicação

`firestore.rules` inclui validação específica de `task_cards`, com propriedade da
conta, campos permitidos, tipos, limites e identificadores de listas personalizadas. `task_settings` possui uma regra própria para a configuração das listas.
A coleção foi excluída da permissão genérica para que essa validação não seja
anulada por uma regra sobreposta. Os itens internos do checklist também são
validados pelo domínio; a regra limita a lista a 50 itens.

As novas regras foram revisadas no código, mas o emulador e o deploy de regras
não foram executados neste ambiente. Publicar no projeto Firebase correto com
o procedimento de `docs/FIREBASE.md` (`firebase deploy --only firestore:rules`).
Não confundir envio de commits ou deploy da Vercel com publicação de regras.

## Verificação

- Typecheck, lint e build passaram.
- 268 testes unitários passaram, incluindo domínio, fila offline, isolamento,
  bloqueio de operações destrutivas, conflito de atualização e backup de tarefas.
- 28 cenários Playwright passaram para listas, tarefas, navegação, backup e
  novidades. Após o ajuste final de layout, dez cenários de Listas/Tarefas/Backup
  foram repetidos e passaram.
- Jornadas de cartões verificadas em 1440, 390 e 320 px, sem operações em contas
  reais. Regras não foram validadas em emulador.

Não incluídos: múltiplos quadros, compartilhamento, recorrência, anexos,
notificações externas, vínculos automáticos com alunos ou alterações na Kodland.

## Listas personalizadas

Uma lista tem ID estável, nome, posição, função (aberta ou concluída) e estado de
arquivo. Renomear não muda IDs nem perde vínculos. A função de conclusão independe
do nome: várias listas podem concluir tarefas, ou uma lista chamada Concluído
pode ser configurada como aberta. A mudança de função ajusta as tarefas existentes;
checklists pendentes exigem confirmação antes de concluir.

Arquivar uma lista tira suas tarefas do quadro, mas mantém tudo acessível no
arquivo. Restaurar a lista traz de volta as tarefas que não foram arquivadas
individualmente. Para restaurar apenas uma tarefa de uma lista arquivada,
escolha uma lista ativa no campo Lista do editor e salve.

Ao excluir uma lista, a confirmação inclui todas as tarefas dela, inclusive
arquivadas. É obrigatório escolher uma lista ativa de destino ou confirmar a
exclusão definitiva das tarefas. Listas vazias podem ser excluídas diretamente
com confirmação. É permitido deixar o quadro sem listas; nesse caso, crie ou
restaure uma lista antes de cadastrar tarefas.

As mudanças são salvas juntas na cópia local e em uma única operação da fila,
impedindo uma exclusão parcial no cache. No servidor, as tarefas são atualizadas
ou excluídas primeiro e a configuração é gravada por último; não é uma transação
remota global. Falhas mantêm a operação pendente para nova tentativa. A demo
migra o antigo array de cartões para o formato com cartões e listas sem perder
os registros existentes. Listas ausentes em backups antigos são recuperadas
para não deixar tarefas invisíveis.

As novas regras continuam dependentes de publicação no projeto Firebase; não
foram publicadas nem verificadas em emulador nesta implementação.
