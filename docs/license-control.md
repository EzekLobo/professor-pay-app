# Controle remoto via planilha

Esta versao permite bloquear, liberar e notificar o AulaPay usando uma planilha publicada como CSV somente leitura.

## Como criar

1. Abra `docs/license-control-template.csv`.
2. Importe o CSV no Google Sheets.
3. Publique a planilha como CSV.
4. Copie a URL publicada.
5. Cole a URL na constante `remoteLicenseCsvUrl` em `src/remoteLicense.ts` antes de gerar o APK.

Nao coloque credenciais de edicao da planilha dentro do app. A planilha publicada deve ser apenas para leitura.

## Colunas

```csv
appId,active,blocked,minVersion,maxVersion,blockedVersions,allowedModels,blockedModels,message,notification,updatedAt
aulapay,true,false,1.8.0,,,,,Aplicativo bloqueado. Entre em contato.,,2026-06-09
```

- `appId`: use `aulapay`.
- `active`: use `false` para bloquear geral.
- `blocked`: use `true` para bloquear imediatamente.
- `minVersion`: bloqueia versoes abaixo desse valor.
- `maxVersion`: opcional; bloqueia versoes acima desse valor.
- `blockedVersions`: versoes especificas bloqueadas. Use aspas se listar mais de uma, por exemplo `"1.8.0,1.8.1"`.
- `allowedModels`: opcional; se preenchido, so libera modelos listados.
- `blockedModels`: bloqueia modelos especificos. Use aspas se listar mais de um.
- `message`: texto exibido somente quando o app estiver bloqueado.
- `notification`: aviso opcional exibido uma vez quando o app estiver liberado.
- `updatedAt`: data informativa da ultima alteracao da regra.

## Exemplos

Liberado:

```csv
aulapay,true,false,1.8.0,,,,,Aplicativo bloqueado. Entre em contato.,,2026-06-09
```

Bloqueado:

```csv
aulapay,true,true,1.8.0,,,,,Aplicativo bloqueado. Entre em contato.,,2026-06-09
```

Versao especifica bloqueada:

```csv
aulapay,true,false,1.8.0,,"1.8.0,1.8.1",,,Versao bloqueada. Entre em contato.,,2026-06-09
```

Modelo bloqueado:

```csv
aulapay,true,false,1.8.0,,,,Samsung Galaxy A13,Aplicativo bloqueado neste aparelho.,,2026-06-09
```

Notificacao sem bloquear:

```csv
aulapay,true,false,1.8.0,,,,,Aplicativo bloqueado. Entre em contato.,Nova versao disponivel em breve.,2026-06-09
```

## Comportamento no app

- O app nao mostra tela de verificacao.
- A consulta acontece silenciosamente ao abrir.
- Se houver bloqueio salvo em cache, o app abre bloqueado.
- Se a internet falhar, usa o ultimo status salvo.
- Se nunca houve status salvo, libera por padrao para evitar travar uma primeira instalacao sem conexao.
- A notificacao aparece uma vez por texto. Se voce alterar o texto na planilha, ela aparece novamente.
