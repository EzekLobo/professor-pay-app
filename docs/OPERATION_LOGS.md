# Diagnóstico de operações

Em **Administração > Diagnóstico**, o administrador consulta o resultado das
operações, horário de recebimento/atualização no servidor, duração, versão do
aplicativo, código/tipo da falha e referência de correlação. A referência da
sincronização é o `x-sync-id` já usado nos logs técnicos da rota Kodland.

## Cobertura

- Sincronização Kodland manual, automática e completa: início, resultado e contagens.
  Correções pendentes, registros de entrega e presenças têm contagens separadas.
  Uma sincronização completa com aviso de folha de pagamento termina como Atenção.
- Pré-requisitos/falhas da rotina automática: acesso não salvo e turmas não importadas.
- Reavaliação dos alertas: falhas, recuperação, mudanças de contagens e amostra de
  funcionamento a cada dez minutos. Aguardar uma sincronização incompleta é um aviso.
- Configuração de alertas e confirmação explícita de contato. Abrir WhatsApp não é
  registrado como mensagem entregue ou contato confirmado.
- Salvar/excluir tarefas e editar listas localmente; envio à nuvem é uma operação
  separada, evitando anunciar gravação remota quando só há uma fila local.
- Erros JavaScript não tratados e falhas de renderização dentro da área de conteúdo.
  A falha de renderização oferece nova tentativa, mantendo a navegação disponível.
  Falhas repetidas de mesmo código/tipo/tela são amostradas uma vez por minuto;
  pré-requisitos automáticos, a cada quinze minutos. Os totais não são o número
  absoluto de exceções ocorridas.

A coleta inicia apenas dentro de uma sessão autenticada. A demonstração não envia
logs. Não captura operações anteriores à habilitação, cada solicitação HTTP,
erros internos não propagados ao cliente, nem atividades com o aplicativo fechado.
Não substitui o histórico pedagógico, a auditoria de acesso ou os logs do servidor.

## Privacidade e acesso

O contrato aceita somente operações, estados, códigos e tipos conhecidos, contagens
numéricas, duração limitada, versão, UUIDs e telas previamente permitidas. Não aceita
mensagens de erro livres, stack trace, parâmetros de URL, e-mail, telefone, aluno,
conteúdo de atividades/mensagens, senhas, tokens ou respostas da Kodland.

`POST /api/operation-logs` verifica o token Firebase, inclusive revogação, e usa
exclusivamente seu UID. Campos arbitrários e lotes inválidos são recusados. Lotes
contêm até vinte eventos e 24 KiB; há limite transacional de 120 eventos por minuto
por UID. O cliente agrupa início/conclusão rápidos pelo mesmo UUID. Resultados finais
não são sobrescritos por inícios atrasados ou duplicados.

`GET /api/admin/operation-logs` exige `assertAdministrator`, usa `no-store` e retorna
até 200 operações recentes em 1, 7 ou 30 dias. Filtros e totais são do recorte carregado,
com aviso quando existem registros anteriores. Exportar baixa apenas o recorte filtrado.
A versão e o tipo técnico auxiliam a localizar a regressão, sem expor o erro original.
Os eventos são relatos do cliente autenticado, não prova independente de execução.

## Infraestrutura e retenção

A gravação/leitura usa o Firebase Admin já requerido pela administração, com
`FIREBASE_SERVICE_ACCOUNT_JSON` ou Application Default Credentials. Os documentos
ficam nas coleções de servidor `operation_logs` e `operation_log_limits`.
As regras existentes não concedem acesso direto do navegador a essas coleções;
não é necessária uma nova regra ou índice composto para esta implementação.

Os documentos possuem `expiresAt`: trinta dias para logs e um dia para contadores.
Para exclusão física automática, habilite a política TTL desse campo nas duas
coleções no Firebase/Google Cloud. Sem essa configuração, o campo sozinho **não
apaga os documentos**. A consulta da aplicação permanece limitada a trinta dias.
Nenhuma política TTL foi publicada por este trabalho.

A fila do navegador guarda até sessenta operações somente em memória, preserva
conclusões ao navegar entre telas e descarta a fila ao trocar/sair da conta.
Falhas de entrega têm espera progressiva; fechamento da aplicação, falta de rede
ou indisponibilidade do backend podem perder registros. A ausência de um log não
confirma execução ou sucesso. Uma operação sem resultado após dez minutos aparece
como Sem conclusão, pois pode ter sido interrompida antes de enviar o resultado.
Falhar na coleta nunca deve alterar o resultado da operação principal. O painel
sinaliza a fila e as novas tentativas de envio do dispositivo atual; isso não
atesta a coleta dos outros dispositivos.

## Código e verificação

Contrato: `operation-log.ts`. Coleta: `operation-log-client.ts` e
`operation-telemetry.tsx`. Persistência: `operation-log-server.ts`. Interface:
`operation-logs-panel.tsx`.

Testes unitários cobrem privacidade, troca de UID, repetição, falha/reenvio, quota,
resultados fora de ordem e permissões. O projeto Playwright `diagnostic-ui` usa um
loader fictício e uma rota de desenvolvimento temporária removida após os testes.
Ele roda após o projeto principal para não invalidar suas páginas via Fast Refresh.
A rota temporária não integra o build nem concede acesso à administração real.
Persistência real e TTL exigem a infraestrutura Firebase configurada.
