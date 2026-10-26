# Novidades da aplicação

Ao entrar na conta, o aplicativo apresenta as novidades que ainda não foram
vistas. Na primeira visita ao recurso, apresenta o catálogo recente. Sem
novidades, nenhum modal é aberto. Fechar pelo X, Escape, fundo, Entendi ou
seguir um atalho confirma a leitura da lista apresentada.

O botão **Novidades** no cabeçalho permite rever o catálogo completo. No
celular, aparece como um ícone com o mesmo nome acessível. A abertura automática
aguarda outros modais e guias; a demonstração oferece apenas consulta manual,
sem usar contas reais.

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
5. Execute os testes de `release-notes` e verifique o modal no celular.

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
- A abertura automática autenticada é exercitada em desenvolvimento com o mesmo
  componente e um adaptador de progresso simulado; não exige alterar contas reais.
