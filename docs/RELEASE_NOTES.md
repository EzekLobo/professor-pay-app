# Novidades da aplicação

As novidades aparecem como uma entrada **Novidades da aplicação** no sino de notificações.
Não existe botão próprio no cabeçalho nem abertura automática ao entrar. Quando há versões
não lidas, essa entrada soma uma pendência ao contador do sino, mesmo com alertas de alunos
desativados. Após a leitura, pode ser consultada em Histórico.

Tocar na entrada fecha a lista suspensa e abre o modal **Novidades do NexusClass**, com as
melhorias em ordem decrescente e seus atalhos. Entendi, X, Escape, clique no fundo ou um
atalho fecham o modal e confirmam a leitura. O foco retorna ao sino. A demonstração usa o
mesmo fluxo com progresso local, sem acessar contas reais.

## Publicar uma novidade

1. Adicione uma entrada em `frontend/src/lib/release-notes.ts` no mesmo commit
   da funcionalidade pronta para uso.
2. Use uma `version` inteira única, maior que todas as publicadas. A convenção
   atual é `AAAAMMDDNN`, permitindo várias entradas no mesmo dia. Não altere
   versões antigas para disparar avisos de novo.
3. Preencha `date` como `AAAA-MM-DD`, um título e uma descrição curtos em
   português e um atalho interno (`href` e `action`) para o recurso.
4. Descreva apenas o comportamento entregue ao usuário. Não anuncie propostas,
   integrações ainda não verificadas, informações privadas ou funções de
   administração em um catálogo destinado a todas as contas.
5. Execute os testes de `release-notes` e verifique o sino e o modal no celular.

Os IDs, e não o relógio do dispositivo, determinam o que é novo. O catálogo é
ordenado da versão mais recente para a mais antiga.

## Leitura por usuário

`release-notes-store.ts` usa `users/{uid}/ui_state/release_notes`, com
`seen_version` e `seen_at`, sob as regras existentes de acesso da própria conta.
A transação preserva o maior marcador: uma aba antiga não desfaz uma leitura
mais recente. O cliente confere o UID antes de acessar esse documento.

Há uma cópia em localStorage separada por conta e uma cópia em memória para
esta sessão. Sem rede, a confirmação é mantida no navegador; na próxima
consulta, o progresso local é reconciliado com o Firestore. Uma consulta remota
que demora mais de dois segundos usa a cópia local para não bloquear a aplicação.
Sincronização entre dispositivos depende da conexão com o Firestore.

Nenhuma alteração de regras ou variável de ambiente é necessária. O marcador
não é um registro de auditoria nem uma medida de tempo de uso. Acrescentar
entradas é parte da entrega de funcionalidades, sem precisar editar cada conta.

## Validação

- Testes unitários: catálogo, filtro de versões, progresso por conta, rede
  indisponível, timeout e persistência monotônica.
- `frontend/e2e/release-notes.spec.ts`: consulta, fechamento, confirmação,
  persistência local e atalhos na demo em 1440, 390 e 320 px, sem chamadas
  privadas.
- A abertura depende de clique; fechar e reabrir via Histórico preserva a leitura e o foco.
