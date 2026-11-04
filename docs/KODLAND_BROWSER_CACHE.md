# Sincronização Kodland no navegador

O armazenamento é definido exclusivamente em **Administração → Sincronização**, para todos os usuários. O padrão é **Navegador**. O usuário apenas sincroniza normalmente: não existe checkbox de armazenamento, banner persistente ou aviso técnico de sucesso sobre onde os dados foram salvos. É necessário estar autenticado na aplicação e informar o acesso Kodland.

A política global fica em `app_settings/kodland_sync`, acessada pelo endpoint autenticado `/api/kodland/policy`. Apenas administradores podem alterá-la (PUT). Cliente e servidor reutilizam a configuração por 60 segundos cada: propagação de até dois minutos com o serviço disponível. Na indisponibilidade, o cliente mantém a última política válida por UID; sem histórico, usa Navegador. Nenhuma escrita de configuração ocorre durante consulta. Erros de autenticação não viram fallback bem-sucedido.

## O que fica disponível

- Turmas, alunos, cronograma, grade, extras, presença, fila de correções e progresso de atividades recuperáveis da Kodland.
- Resumo com agenda, Turmas, Aulas e Acompanhamento leem essa cópia local. As seções de dados próprios não são consideradas vazias nem conciliadas com essa fonte parcial.
- Materiais são carregados sob demanda pelo backend autorizado; somente metadados e links ficam no cache. Slides, vídeos e páginas externas não são baixados para uso offline.
- A lista individual e os alertas Kodland usam a cópia sincronizada. As regras confirmadas e o histórico conhecido têm uma cópia auxiliar; alertas derivados são calculados e guardados no navegador sem exigir escrita Firestore. Dados próprios ou grupos sem cobertura preservam seus casos anteriores. Configurações novas e confirmação de contato continuam exigindo sucesso no Firebase.

Os dados ficam no IndexedDB `nexusclass-kodland-v1`, store `accounts`, chave UID. Não são gravados senha Kodland nem token Firebase nessa cópia. O mecanismo separado de salvar credenciais permanece opcional. A confirmação ocorre somente após `transaction.oncomplete`; falha/aborto preserva a versão anterior. A conta é conferida antes da requisição, antes do commit e depois da confirmação. A cópia de outro UID não é usada pelas consultas da aplicação.

A atualização local usa uma fila/Web Lock independente da gravação Firebase: uma escrita remota sem confirmação não bloqueia a atualização local manual. Backend e autenticação continuam obrigatórios para consultar a Kodland; não há bypass de autorização ou de bloqueio de conta.

## Limites desta etapa

- Login continua em Firebase Authentication. Login por nick pode depender da resolução do nome no backend; o modo local não substitui a autenticação.
- Configurações, administração, pagamentos oficiais, confirmações financeiras, notas e tarefas próprias continuam no Firebase. Não são inventados valores financeiros quando esses dados estão indisponíveis.
- A carga local completa não importa folha oficial nem baixa antecipadamente todos os materiais. Não transforma falta de dados em falta do aluno ou atividade não entregue.
- A política administrativa é aplicada automaticamente nas próximas sincronizações. A cópia confirmada continua disponível após recarregar. As sincronizações Kodland seguintes e seus controles de cadência usam o navegador. Uma rotina automática previamente pausada por gravação/quota pode exigir recarregar a página; atualização manual local independe dessa fila.
- Isso não torna a aplicação inteira offline nem garante abertura da aplicação sem rede. IndexedDB pode ser limpo pelo usuário/navegador. Dados Kodland podem ser consultados novamente quando houver conexão.
- A central pode consultar regras, histórico e dados próprios com espera limitada, mantendo as informações conhecidas na indisponibilidade. Telemetria e outros recursos próprios ainda podem indicar falhas do Firebase; não condicionam a confirmação do snapshot Kodland local.
- O backup existente exporta a base remota, sem tratar o cache como dados próprios. Importação remota bem-sucedida desativa a cópia local; redefinição bem-sucedida limpa a cópia. Falhas de importação/gravação não apagam o cache anterior.

## Retomar Firebase

O administrador seleciona **Firebase** e salva. Na próxima sincronização total, a aplicação retoma a base remota quando o serviço estiver disponível. A operação compara a resposta Kodland com a base **remota**, sem confundir dados locais atualizados com documentos já gravados. A cópia local só deixa de ser a fonte ativa após a conclusão dos dados principais e acompanhamento. Atualizações parciais confirmadas no Firebase também renovam uma cópia local ainda ativa, sem repetir a consulta Kodland. Quando a política ativa Navegador pela primeira vez, uma atualização parcial inicializa o cronograma e hidrata a presença uma vez por turma; não repete a consulta de presença na cadência de atividades. Não há envio diário em segundo plano nem migração automática dos dados próprios.

Validação: testes de fluxo com Firestore e fila remota deliberadamente indisponíveis; IndexedDB real em Chromium com recarga, isolamento de contas e aborto; regressões de escrita incremental e retorno explícito ao Firebase. Uso real da quota e implantação Vercel exigem confirmação no serviço.
