# Alvo: otimização e consistência da aplicação

Revisão de 09/11/2026, continuidade da atualização seletiva de 08/11.
Objetivo: reduzir consultas dispensáveis, impedir espera infinita e preservar a
interface durante atualizações, sem alterar saldos ou remover dados existentes.

## Melhorias implementadas

| Área | Problema identificado | Correção e critério de aceite |
| --- | --- | --- |
| Catálogo de cursos | Abertura da tela consultava a Kodland novamente. | Cache persistido por conta, válido por 24h; chamadas simultâneas compartilham uma requisição. Atualização explícita ignora a validade. Falha preserva catálogo anterior. |
| Configurações | Abrir Conta/Mensagens buscava disponibilidade/turmas e executava ensureOccurrences para cada turma ativa. | Preferências e tarifa são carregadas primeiro; Disponibilidade consulta os horários, turmas e ocorrências existentes somente quando aberta. Horários recorrentes são projetados localmente, respeitando encontros cancelados/reagendados. Navegação não gera gravações de ocorrências; voltar à seção reutiliza o resultado. |
| Cache de leitura | Validade contada antes de a resposta chegar; consulta lenta podia duplicar e uma promessa travada podia permanecer reutilizada. | Validade começa na conclusão; solicitações em voo são compartilhadas e leituras sem resposta expiram em 20s. Falha permite nova tentativa; mantém isolamento de conta e invalidação entre abas. |
| Turmas e cursos | Preflight e algumas leituras podiam ficar sem resposta; resultados antigos podiam sobrepor uma carga posterior. | Snapshot de leitura com prazo de 15s, gerações para descartar respostas antigas, tratamento de erro e nova tentativa. Falha de preferências não desativa silenciosamente a integração. |
| Pagamentos | Recarga em segundo plano escondia toda a tela; extratos abertos rapidamente podiam responder fora de ordem. | Carregamento integral apenas na primeira leitura; cache exibido nas recargas. Leituras de lista/extrato limitadas a 15s; última solicitação de extrato prevalece e fechar invalida respostas pendentes. Confirmações financeiras continuam aguardando gravação real. |
| Notificações | Eventos de pagamentos invalidavam dados de alunos; fila concorrente simulava alteração de histórico e forçava metadados. | Ignora domínios não relacionados; agrupa eventos em uma nova execução direta, preserva a intenção de atualização forçada e não inventa alteração de histórico. |
| Resumo financeiro | Reconsulta de turmas/ocorrências/cursos/tarifas para cada turma própria, após já carregar esses dados. | Reaproveita o snapshot e lê cursos uma vez; mantém o mesmo planejador e persiste somente ocorrências alteradas em lotes compartilhados. Segunda leitura sem mudanças não grava ocorrências. |
| Gráficos e formatação | Tooltips recalculavam agrupamentos mensais e construíam formatadores Intl repetidamente. | Agregação memoizada por pagamentos/ano e formatadores reutilizados para datas/moeda/meses/percentuais, preservando resultados. |
| Integração Kodland | Paginação de turmas sem limite podia repetir páginas indefinidamente. | Detecta página repetida e limita a 100 páginas; retorna erro em vez de publicar lista parcial ou substituir dados salvos. |

## Validação

- Testes unitários de cache lento, expiração, erro, troca de conta, catálogo diário,
  atualização forçada, paginação repetida e cálculos existentes.
- Testes Chromium de configuração sob demanda, timeout/recuperação financeira,
  preservação do conteúdo, resposta de extrato fora de ordem e eventos de notificações.
- Regressão de cursos, configurações, notificações, carrossel e navegação mobile.
- Lint, tipos, suíte unitária, build e conferência da publicação no navegador.

Verificados:674 testes unitários, lint/tipos/build e10 cenários Chromium de diagnóstico, além da regressão desktop/mobile. O toque nativo390px apresentou intermitência na execução agregada e passou nos7 cenários isolados; manter monitoramento. A publicação é conferida após o push.

Sem porcentagem de ganho estimada: não há perfil de tráfego real ou telemetria de
latência da conta autenticada nesta sessão. O ganho verificável é a eliminação de
requisições e gravações específicas acima. Não foram alterados Firebase Auth,
regras de autorização, conteúdo financeiro nem persistência remota de dados próprios.

A revisão diária de atividades e as janelas por domínio da entrega anterior
continuam válidas. Não há feed global comprovado de alterações da Kodland;
cache não significa informação ao vivo sem uma nova consulta. Material pesado
offline e migração de banco não fazem parte desta otimização.
