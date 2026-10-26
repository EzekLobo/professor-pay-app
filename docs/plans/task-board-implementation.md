# Plano de implementação: Tarefas do NexusClass

Data: 26/10/2026. Estado: proposta de implementação; nenhuma funcionalidade deste plano foi implementada.

## 1. Recomendação

Criar **Tarefas**, uma área pessoal para organizar ações, pendências e problemas do professor. Adotar o modelo visual de quadro, listas e cartões associado ao Trello, com uma interface mais compacta e coerente com o NexusClass.

Exemplos: preparar uma aula, falar com um responsável, resolver um link de gravação, conferir uma divergência no pagamento ou acompanhar um problema de acesso. Cada cartão registra uma ação e seu resultado esperado. As atividades dos alunos continuam em Acompanhamento; dados financeiros e da Kodland continuam nas suas fontes atuais.

Primeira entrega: um quadro pessoal com quatro listas fixas — **A fazer**, **Em andamento**, **Aguardando** e **Concluído**. Não começar por um clone completo do Trello.

## 2. Pesquisa, evidências e limites

A revisão do repositório confirmou:

- Next.js 16, React 19 e TypeScript no frontend; Firebase Authentication e Firestore para contas e dados.
- Adaptadores de produção/demo já usados nas operações manuais. A nova funcionalidade deve seguir essa separação, com domínio e repositório próprios.
- `ShellFrame`, `Shell`, `routes.ts` e `/demo` centralizam a navegação. A barra inferior já tem sete destinos; adicionar um oitavo ícone não é uma solução aceitável para 320 px.
- `Modal` é reutilizável e o catálogo `release-notes.ts` já anuncia funcionalidades novas por conta.
- Backups usam esquema 4.0, lista explícita de coleções e fluxo de limpeza. Novas coleções precisam entrar em exportação, validação, importação e exclusão.
- `getFirestore()` é usado sem configuração explícita de cache persistente IndexedDB. Não se pode prometer funcionamento offline entre recargas apenas por usar Firestore.
- As regras atuais autorizam subcoleções diretas de `users/{uid}` para o proprietário. Não existe colaboração entre contas.
- Não há biblioteca de drag-and-drop instalada nem infraestrutura confirmada para lembretes agendados em segundo plano.

A tentativa de consultar Trello, suporte da Atlassian e W3C recebeu **403 do proxy antes do HTTPS**. Portanto, não houve leitura dessas páginas nesta revisão nem validação de limites ou recursos atuais dos planos comerciais do Trello. As referências abaixo são fontes oficiais para a próxima validação, não páginas alegadamente consultadas:

| Referência | O que validar antes de implementar |
| --- | --- |
| [Guia do Trello](https://trello.com/guide) | Modelo de quadros/listas/cartões, interação e terminologia |
| [Suporte do Trello](https://support.atlassian.com/trello/) | Checklists, datas, arquivamento, filtros e movimentação |
| [WCAG 2.2 — movimentos de arrastar](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) | Alternativa de ação simples para movimentações |
| [Padrões WAI-ARIA](https://www.w3.org/WAI/ARIA/apg/patterns/) | Diálogos, menus e navegação pelo teclado |
| [Firestore offline](https://firebase.google.com/docs/firestore/manage-data/enable-offline) | Cache persistente, múltiplas abas, fallback e pendências de sincronização |
| [Transações e lotes Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions) | Operações offline, concorrência e limites de escrita |
| [Regras do Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions) | Propriedade, integridade de vínculos e validação estrutural |

Para concluir a pesquisa externa: liberar acesso a essas fontes, registrar as páginas efetivamente lidas e confirmar a versão/compatibilidade da biblioteca de arraste escolhida. Essa pendência não impede definir o produto e a arquitetura, mas impede chamar o levantamento de pesquisa web completa.

## 3. Inspiração no Trello e adaptação ao produto

| Conceito | Proposta para o NexusClass | Prioridade |
| --- | --- | --- |
| Quadro | Um quadro pessoal inicial: Minhas tarefas | V1 |
| Listas | Quatro etapas fixas; indicador de quantidade | V1 |
| Cartões | Título, descrição, tipo, prioridade, prazo e checklist | V1 |
| Movimentação | Menu Mover para e arraste, com resultado equivalente | V1 |
| Etiquetas | Categorias simples: Aula, Aluno, Financeiro, Técnico, Outros | V1 |
| Detalhamento | Modal compacto; campos secundários recolhidos | V1 |
| Datas | Prazo opcional e filtros Hoje/Atrasadas; sem push | V1 |
| Arquivo | Arquivar/restaurar para manter o quadro limpo | V1 |
| Integrações | Vínculos internos e criação contextual, sem escrita na Kodland | V2 |
| Múltiplos quadros/listas personalizadas | Somente depois de validar a utilização | V2/V3 |
| Compartilhamento, comentários e responsáveis | Exigem outro modelo de autorização | Posterior |
| Automações, anexos e notificações externas | Dependem de infraestrutura e custo adicionais | Posterior |

Não copiar a identidade visual, os planos comerciais ou toda a complexidade do Trello.

## 4. Escopo da primeira versão

### Cartões e regras de uso

- Criar rapidamente com título e lista; tipo padrão Tarefa e prioridade Normal.
- Tipos: **Tarefa** e **Problema**. Usam o mesmo fluxo; Problema ganha campo opcional de resolução, sem exigir um formulário maior ao criar.
- Prioridades: Baixa, Normal, Alta e Urgente. Cores sempre acompanhadas de texto/ícone acessível.
- Descrição em texto simples; links HTTP(S) validados, sem HTML arbitrário.
- Prazo opcional como data civil `YYYY-MM-DD`, interpretada em America/Sao_Paulo. Sem horários na V1.
- Checklist opcional: adicionar, editar, ordenar, marcar e remover itens. Progresso aparece como 2/5 no cartão.
- Mover entre listas e reordenar dentro da lista. Aguardando permite uma observação curta sobre a dependência.
- Concluir define `completed_at`; reabrir limpa esse campo. Urgência e atraso deixam de aparecer em concluídos/arquivados.
- Concluir com checklist pendente exige confirmação explícita; não marcar itens como feitos silenciosamente. Não exigir checklist para concluir.
- Arquivar é reversível e não significa concluir. Excluir definitivamente fica no arquivo, com confirmação.
- Duplicar gera novo ID, limpa conclusão e reinicia o checklist; deixa visível a opção de manter ou remover o prazo.
- Busca inicial por prefixo do título, sem diferenciar maiúsculas/minúsculas. Não prometer busca textual aproximada.
- Filtros por tipo, categoria, prioridade, prazo e lista; ação Limpar filtros e estado vazio contextual.

### Definição de atraso

`due_date < hoje em São Paulo`, cartão aberto e não arquivado. Prazo hoje significa vence hoje, não atrasado. Alterar o relógio local não pode reordenar cartões. Validar limites de meia-noite e mudança de mês.

### Fora da V1

Colaboração, convites, tarefas recorrentes, calendário completo, anexos, comentários em tempo real, chat, e-mail, push, SLA, IA para priorização, integração com a API do Trello e alterações automáticas em sistemas da Kodland.

## 5. Interface e jornadas

### Desktop

Barra superior enxuta: título do quadro, busca, Filtros e **+ Nova tarefa**. Abaixo, quatro listas. Cartões mostram título e apenas os indicadores preenchidos: prioridade, prazo, checklist e vínculo. Descrição e dados de resolução ficam no modal. Não acrescentar uma faixa de KPIs repetindo as quantidades das listas.

O modal contém título, descrição, checklist e uma linha compacta de prazo/prioridade. Mover, duplicar e arquivar ficam em ações secundárias. Não expor exclusão destrutiva como botão de destaque em cada cartão.

### Celular

Mostrar uma lista por vez, com seletor de etapa e contadores; oferecer visualização de lista vertical. Evitar quatro colunas comprimidas e rolagem horizontal da página. Mover para funciona por toque sem exigir arraste. Ao testar drag touch, distinguir intenção de arrastar de rolar a tela; se houver conflito, manter o menu como interação principal.

O modal respeita a viewport, safe area e teclado virtual. Salvar/fechar continuam alcançáveis. Áreas de toque com alvo de aproximadamente 44 px quando viável, nomes acessíveis e foco visível.

### Navegação

Proposta: rota privada `/tasks`, item **Tarefas** na navegação desktop. Para o celular, manter Resumo, Pagamentos, Turmas e Aulas e acrescentar **Mais**, que abre Acompanhamento, Tarefas, Configurações e Dados e backup. Essa alteração deve ser validada por protótipo; não reduzir textos para acomodar oito ícones. Acrescentar um atalho discreto no Resumo para Tarefas, sem outro painel financeiro.

Nomes distintos: Tarefas pessoais em `/tasks`; atividades de alunos permanecem em Acompanhamento.

### Jornadas mínimas

1. Criar “Preparar aula de Python”, adicionar três passos, definir amanhã e mover para Em andamento.
2. Registrar “Aluno não abre a plataforma”, priorizar, mover para Aguardando e registrar resolução ao concluir.
3. Reabrir uma tarefa concluída; o prazo volta a participar das regras de atraso.
4. Arquivar e restaurar um cartão sem perder descrição/checklist.
5. Criar ou editar sem rede; ver pendência de sincronização e confirmar preservação após recarga e reconexão.

## 6. Arquitetura proposta

Manter o domínio fora do `api.ts`, que já concentra muitas responsabilidades:

- `src/lib/task-board.ts`: tipos, validação, ordenação, atraso, conclusão e duplicação.
- `src/lib/task-board-store.ts`: contrato do repositório e implementação Firestore, limitada ao UID autenticado.
- `src/lib/demo-task-board-store.ts`: implementação local para a demonstração.
- `src/components/tasks-page.tsx`: composição e estados da página.
- `src/components/task-board.tsx`, `task-card.tsx`, `task-editor.tsx` e `task-filters.tsx`: interface reutilizável.
- `src/app/tasks/page.tsx`: AuthGuard + Shell + página.
- Adaptador injetável em componentes; demo sem Firebase/Kodland e com persistência própria validada.

Antes de adicionar dependência de drag-and-drop, testar uma versão mantida do dnd-kit contra React 19, Next 16, teclado, touch, Strict Mode e SSR. Registrar versão e resultado do spike; não presumir compatibilidade. A ação Mover para deve funcionar independentemente da biblioteca.

## 7. Modelo de dados

Usar subcoleções diretas da conta para manter coerência com isolamento e backup:

| Coleção | Campos principais |
| --- | --- |
| `users/{uid}/task_boards/{id}` | `title`, `created_at`, `updated_at`, `archived_at`, `schema_version` |
| `users/{uid}/task_columns/{id}` | `board_id`, `title`, `role` (todo/doing/waiting/done), `position`, `archived_at` |
| `users/{uid}/task_cards/{id}` | `board_id`, `column_id`, `title`, `title_search`, `description`, `kind`, `priority`, `category`, `due_date`, `position`, `completed_at`, `archived_at`, `resolution`, `checklist`, `source`, timestamps |

A lista tem papel semântico próprio; conclusão não depende do título exibido. Se listas personalizadas chegarem depois, devem manter esse papel ou definir transições equivalentes.

Checklist embutido na V1, com IDs estáveis por item, texto, concluído e posição. Limites iniciais propostos: título 160 caracteres, descrição 10 mil, resolução 2 mil, 50 itens de checklist com até 300 caracteres cada. Validar no domínio e nas regras; confirmar tamanho total dos documentos.

`source` é opcional: `{ type, entity_id, class_id? }`, apenas IDs internos permitidos e sem credenciais ou payloads remotos. Timestamps de sincronização vêm do servidor; datas de prazo permanecem datas civis.

Criar quadro e quatro listas em um lote idempotente, com IDs determinísticos por conta, para que duas abas não criem dois quadros iniciais.

### Ordenação e concorrência

- Posições com intervalos permitem inserir entre vizinhos; desempate determinístico pelo ID.
- Mover atualiza somente lista, posição e campos de conclusão necessários do cartão. Não regravar o documento inteiro e sobrescrever descrição por acidente.
- Rebalancear posições quando o intervalo se esgotar, em operação online e com limite de lote controlado.
- Atualização otimista com retorno ao estado anterior quando houver recusa definitiva; preservar rascunho em falha de rede.
- Duas alterações no mesmo campo seguem a política de última escrita aceita; alterações em campos distintos usam patches. Essa política precisa ser testada e documentada, sem prometer merge sem perdas.
- Transações não são o caminho para alterações offline. Escritas/lotes, idempotência e pendências devem ser especificados separadamente.

## 8. Offline, sincronização e privacidade

O requisito é uso pessoal com ou sem integração Kodland. Nenhuma chamada à Kodland para criar ou mover tarefas.

1. Fazer spike de cache IndexedDB persistente na inicialização central do Firestore; validar suporte da versão instalada e múltiplas abas.
2. Tratar indisponibilidade de IndexedDB sem quebrar login, finanças ou outros fluxos.
3. Exibir estados discretos: alterações pendentes, sincronizado e falha que exige ação. Não anunciar sincronização concluída antes da confirmação remota.
4. Provar persistência após fechar/reabrir a aplicação offline. Se o cache do SDK não cumprir o contrato nos navegadores alvo, implementar um outbox IndexedDB específico, evitando duas filas concorrentes.
5. Isolar dados e estado em memória por UID. Limpar a apresentação imediatamente ao sair/trocar conta; nunca exibir cartões da conta anterior.
6. Avaliar cache persistente de dados pessoais em aparelhos compartilhados e a política de limpeza no logout. A limpeza global do cache pode afetar outros módulos e precisa de teste próprio.

Regras Firestore: restringir ao proprietário, validar campos/tipos/limites e referências ao quadro/lista da mesma conta. **A regra genérica atual permite qualquer subcoleção do proprietário; adicionar regras mais estritas não revoga essa permissão sobreposta.** Excluir as novas coleções desse caminho genérico antes de introduzir validações específicas, com testes de regressão para os demais módulos.

Testar regras no emulador: visitante, usuário de outra conta, referência cruzada, campos desconhecidos e payload grande. Não colocar anexos ou dados sensíveis de alunos nos cartões por padrão.

## 9. Consultas, custos e desempenho

Consultar o quadro ativo, listas e páginas de cartões abertos; arquivo separado e paginado. Definir índices compostos para board/lista/arquivo/posição e para combinações de filtros realmente oferecidas.

Filtros devem abranger o quadro inteiro pela consulta/índice; não filtrar apenas a página carregada e apresentar resultado como completo. Busca de prefixo usa campo normalizado e consulta dedicada; busca textual completa fica para outra etapa.

Limitar listeners ao quadro visível e removê-los ao sair/trocar conta. Contadores não devem representar só itens carregados como se fossem totais. Validar estratégia de contagem antes do desenho definitivo, incluindo comportamento offline.

Cenários de teste: 50, 200 e 1.000 cartões, arquivo longo e checklist no limite. Meta provisória: abertura utilizável em até 2 segundos em cenário de teste documentado com 200 cartões, confirmação visual de ações locais em até 100 ms e sem travamentos perceptíveis ao mover. Medir antes de fixar compromissos de produção; considerar virtualização se necessário.

## 10. Integrações depois do núcleo

**V2 — contexto do professor:** vincular cartões a turma, aluno, aula ou pagamento; abrir origem pelo modal; criar tarefa a partir de uma tela existente com campos mínimos pré-preenchidos.

Para correções, oferecer criar tarefa vinculada, não duplicar automaticamente todas as pendências. A conclusão da tarefa não corrige uma atividade na Kodland, não confirma pagamento e não resolve automaticamente a origem. Se a origem desaparecer ou a integração for desativada, preservar o cartão com indicação de vínculo indisponível.

Para criação contextual idempotente, usar chave de origem por conta e ação explícita para criar uma segunda tarefa. Não transformar sincronizações repetidas em cartões duplicados.

**V3 — produtividade:** múltiplos quadros, listas personalizadas, recorrência e lembretes. Recorrência exige regras de fuso, idempotência e edição de série. Notificação fora da aplicação exige backend agendado e, se push, service worker/permissão e gestão de assinaturas. Nenhuma dessas estruturas deve ser presumida existente.

## 11. Backup, demo e lançamento

- Definir nova versão do backup — recomendação 5.0 — com as três coleções. Importar backups 1–4 como quadro vazio, sem erro por campos ausentes.
- Exportar abertos e arquivados; validar todos os IDs e referências antes de gravar. Importação inválida não apaga o quadro atual.
- Preservar IDs na restauração; tratar duplicação/reimportação com política explícita, sem duplicar tarefas silenciosamente.
- Atualizar preview da importação, limpeza de dados e reset da demo. Coordenar importação com escritas offline pendentes para não sobrescrever ações não sincronizadas.
- Criar cenário fictício com tarefas e problemas em diferentes etapas, prazo vencido, checklist e arquivo; demo não chama serviços privados.
- Liberar por flag inicialmente, validar internamente e depois para um pequeno grupo. A flag controla descoberta; autorização continua nas regras.
- Publicar entrada em Novidades apenas quando disponível ao público correspondente. Catálogo atual é global: não anunciar uma função restrita ao piloto antes da liberação geral ou sem suporte a público-alvo.

## 12. Sequência de implementação e esforço

Estimativa preliminar para uma pessoa familiarizada com o código, em dias úteis de trabalho concentrado; não é promessa de calendário. Reavaliar depois do spike offline/arraste.

| Etapa | Entrega verificável | Dependências | Estimativa |
| --- | --- | --- | --- |
| 0. Validação e protótipo | Pesquisa externa concluída, fluxo desktop/mobile, navegação, spike offline e arraste | Acesso às fontes; revisão do protótipo | 2–3 dias |
| 1. Domínio e persistência | Modelos, validação, regras, criação idempotente, adaptadores, demo, política de conflitos | Etapa 0 | 3–4 dias |
| 2. Quadro utilizável | CRUD, listas fixas, modal, checklist, prazos, prioridade, Mover para, arquivo | Etapa 1 | 3–4 dias |
| 3. Interação e descoberta | Arraste, teclado, mobile, busca/filtros/índices e paginação coerente | Etapa 2 | 2–3 dias |
| 4. Integridade e entrega | Backup, reset, offline real, troca de contas, testes, piloto e Novidades | Etapas anteriores | 3–4 dias |
| Reserva de integração | Ajustes de IndexedDB, SDK, touch e regressões | Conforme achados | 2–4 dias |

**V1: aproximadamente 15–22 dias úteis, incluindo reserva.** V2 contextual: mais 4–7 dias após validar fontes e ações. V3 requer planejamento separado; colaboração não está incluída nessas estimativas.

Dependência crítica: provar persistência offline e acessibilidade do arraste antes de comprometer toda a interface com uma biblioteca.

## 13. Critérios de aceite e testes

- Criar, editar, mover, concluir/reabrir, duplicar, arquivar/restaurar e excluir sem perder checklist ou descrição.
- Todas as movimentações funcionam por toque/teclado sem arrastar; anunciar resultado da movimentação com região acessível e restaurar foco.
- Prazo hoje/atrasado correto em São Paulo; concluídos não aparecem como atrasados.
- Recarregar preserva quadro; rede interrompida não perde a ação; reconexão confirma sincronização sem duplicar cartões.
- Duas abas e dois dispositivos respeitam a política de conflitos; não ressuscitar exclusões por gravação de um documento antigo inteiro.
- Troca de conta não mostra nem grava dados na conta errada. Testes de regras impedem acesso cruzado.
- Backup novo restaura; backup antigo é aceito; arquivo malformado não modifica dados.
- Funciona em 320, 390, 768 e 1440 px, com zoom, teclado virtual e leitor de tela em cenário documentado.
- Busca/filtros não omitem resultados por considerar somente a primeira página.
- Vínculos futuros não provocam ações financeiras ou alterações na Kodland.

Executar Vitest para domínio/adaptadores; emulador Firebase para regras; Playwright para jornadas desktop/mobile/offline/múltiplas abas; lint, typecheck e build. Acrescentar regressões de navegação, backup, demo e troca de conta existentes. Medir leitura/escrita e latência no piloto, sem registrar conteúdo privado dos cartões.

## 14. Decisões a fechar no início

Adotar como padrões: uma conta/um quadro, listas fixas, sem colaboração, prioridades simples, prazo por dia e sem notificações externas. Validar no protótipo a navegação móvel Mais e o tamanho do modal. Confirmar política de cache em dispositivo compartilhado, ordenação/concorrência e biblioteca de arraste no spike.

A implementação pode começar pela etapa 0 sem redesenhar pagamentos ou atividades pedagógicas. A V1 só está concluída quando persistência, acessibilidade, backup e demo estiverem entregues junto da interface.
