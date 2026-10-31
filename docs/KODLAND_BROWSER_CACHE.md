# Sincronização Kodland no navegador

Quando o Firestore estiver sem quota, abrir **Configurações → Dados e backup → Sincronizar tudo** e marcar **Salvar somente neste navegador (sem Firebase)**. O botão também fica disponível quando não é possível ler as preferências de integração. É necessário estar autenticado na aplicação e informar o acesso Kodland.

## O que fica disponível

- Turmas, alunos, cronograma, grade, extras, presença, fila de correções e progresso de atividades recuperáveis da Kodland.
- Resumo com agenda, Turmas, Aulas e Acompanhamento leem essa cópia local. As seções de dados próprios não são consideradas vazias nem conciliadas com essa fonte parcial.
- Materiais são carregados sob demanda pelo backend autorizado; somente metadados e links ficam no cache. Slides, vídeos e páginas externas não são baixados para uso offline.
- A lista individual de atividades para mensagem pode usar a cópia Kodland. Alertas globais continuam exigindo configurações e histórico próprios do Firebase: não usar a fonte parcial para desativar cobranças próprias.

Os dados ficam no IndexedDB `nexusclass-kodland-v1`, store `accounts`, chave UID. Não são gravados senha Kodland nem token Firebase nessa cópia. O mecanismo separado de salvar credenciais permanece opcional. A confirmação ocorre somente após `transaction.oncomplete`; falha/aborto preserva a versão anterior. A conta é conferida antes da requisição, antes do commit e depois da confirmação. A cópia de outro UID não é usada pelas consultas da aplicação.

A atualização local usa uma fila/Web Lock independente da gravação Firebase: uma escrita remota sem confirmação não bloqueia a atualização local manual. Backend e autenticação continuam obrigatórios para consultar a Kodland; não há bypass de autorização ou de bloqueio de conta.

## Limites desta etapa

- Login continua em Firebase Authentication. Login por nick pode depender da resolução do nome no backend; o modo local não substitui a autenticação.
- Configurações, administração, pagamentos oficiais, confirmações financeiras, notas e tarefas próprias continuam no Firebase. Não são inventados valores financeiros quando esses dados estão indisponíveis.
- A carga local completa não importa folha oficial nem baixa antecipadamente todos os materiais. Não transforma falta de dados em falta do aluno ou atividade não entregue.
- O modo selecionado continua ativo após recarregar. As sincronizações Kodland seguintes e seus controles de cadência usam o navegador. Uma rotina automática previamente pausada por gravação/quota pode exigir recarregar a página; atualização manual local independe dessa fila.
- Isso não torna a aplicação inteira offline nem garante abertura da aplicação sem rede. IndexedDB pode ser limpo pelo usuário/navegador. Dados Kodland podem ser consultados novamente quando houver conexão.
- A central de notificações, telemetria e outros recursos próprios ainda podem tentar acessar Firebase e indicar indisponibilidade; não condicionam a confirmação do snapshot Kodland local.
- O backup existente exporta a base remota, sem tratar o cache como dados próprios. Importação remota bem-sucedida desativa a cópia local; redefinição bem-sucedida limpa a cópia. Falhas de importação/gravação não apagam o cache anterior.

## Retomar Firebase

Desmarcar **Salvar somente neste navegador** e concluir uma sincronização total quando o serviço estiver disponível. A operação compara a resposta Kodland com a base **remota**, sem confundir dados locais atualizados com documentos já gravados. A cópia local só deixa de ser a fonte ativa após a conclusão dos dados principais e acompanhamento. Não há envio diário em segundo plano nem migração automática dos dados próprios.

Validação: testes de fluxo com Firestore e fila remota deliberadamente indisponíveis; IndexedDB real em Chromium com recarga, isolamento de contas e aborto; regressões de escrita incremental e retorno explícito ao Firebase. Uso real da quota e implantação Vercel exigem confirmação no serviço.
