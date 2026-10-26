# Firebase no AulaPay

O frontend em `frontend/` usa Firebase Authentication e Cloud Firestore
diretamente no navegador. O Next.js continua sendo publicado na Vercel; o
Firebase Hosting não é necessário para o deploy da aplicação Next.

## Configuração no console

1. Abra o projeto Firebase e registre um app Web em **Configurações do projeto >
   Seus apps**.
2. Em **Authentication > Sign-in method**, habilite **E-mail/senha**.
3. Em **Firestore Database**, crie o banco em modo de produção e escolha a
   região desejada. Publique as regras deste repositório antes de liberar o
   tráfego (`firebase deploy --only firestore:rules,firestore:indexes`).
4. Copie os valores da configuração Web para as variáveis `NEXT_PUBLIC_FIREBASE_*`
   no ambiente da Vercel. A configuração Web é pública; nunca coloque uma
   service account, chave privada ou `GOOGLE_APPLICATION_CREDENTIALS` no Git.

## Desenvolvimento local

```powershell
Copy-Item .env.example .env.local
# preencha as sete variáveis NEXT_PUBLIC_FIREBASE_* com a configuração Web
npm install
npm run web:dev
```

Para publicar as regras, instale a CLI somente na máquina do operador, faça
`firebase login`, copie `.firebaserc.example` para `.firebaserc` e confirme o
projeto selecionado antes de executar o deploy. O arquivo `.firebaserc` local
não precisa ser commitado.

## Vercel

Crie ou importe um projeto Vercel com este repositório e defina
**Root Directory** como `frontend`. O Vercel detectará o framework Next.js e
usará os comandos padrão `npm run build` e `next start`; não configure um
diretório de saída manualmente. O `frontend/vercel.json` fixa o framework e o
`package.json` do frontend fixa Node.js 24.x, a mesma versão usada localmente.

Em **Project Settings > Environment Variables**, cadastre as variáveis Web
abaixo para **Preview** e **Production**, então faça um novo deploy:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` (opcional)

As variáveis `NEXT_PUBLIC_*` entram no bundle durante o build, portanto uma
alteração exige novo deploy. O frontend não precisa de `NEXT_PUBLIC_API_URL`
para os fluxos de produção; essa variável só existe para compatibilidade com a
API Python legada durante a migração.

## Administração e auditoria de acessos

O painel `/admin` acompanha sessões, último acesso, tempo ativo estimado e
visitas às áreas do app. Ele usa rotas de servidor e o Firebase Admin SDK: os
eventos não ficam expostos nas regras do Firestore usadas pelo navegador.

No ambiente **Production** e **Preview** da Vercel, configure as variáveis
privadas abaixo (sem o prefixo `NEXT_PUBLIC_`):

- `ADMIN_EMAILS`: e-mail, ou lista de e-mails separados por vírgula, de quem
  pode consultar o painel adicionalmente. O proprietário inicial
  `ezeklobo.dev@gmail.com` já possui o acesso administrativo no aplicativo.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: conteúdo JSON completo de uma chave de
  service account do mesmo projeto Firebase, em uma única linha.

Gere a chave em **Firebase Console > Configurações do projeto > Contas de
serviço**. Nunca a coloque no Git, em arquivos públicos ou em uma variável
`NEXT_PUBLIC_*`. Após cadastrar as variáveis, faça um novo deploy, entre com um
e-mail listado em `ADMIN_EMAILS` e abra `/admin`.

Pelo painel, o administrador também pode cadastrar e remover contas de acesso.
O cadastro usa nome, e-mail e senha inicial; a conta é criada no Firebase
Authentication e pode entrar imediatamente. Informe a senha inicial por um
canal seguro. A remoção revoga o login no Firebase Authentication e preserva o
histórico de auditoria; dados já gravados nas coleções do usuário não são
apagados automaticamente. A própria conta em uso e a conta administrativa
principal são protegidas contra remoção acidental. As contas criadas não
recebem privilégio administrativo: isso continua limitado aos e-mails
configurados em `ADMIN_EMAILS`.

## Migração do SQLite legado

O diretório `backend/` e o arquivo SQLite continuam disponíveis como fonte de
exportação. Faça um backup, execute a exportação autenticada da API legada e
importe o JSON em **Dados > Importar do aplicativo Expo** com uma conta Firebase
correspondente. Confira a prévia e valide turmas, aulas e confirmações antes de
desativar a API. Não copie o SQLite para a pasta pública do frontend.

## Estrutura e segurança

Cada conta usa somente as subcoleções abaixo:

- `users/{uid}/classes`
- `users/{uid}/lessons`
- `users/{uid}/payments`
- `users/{uid}/holidays`

As regras exigem que `request.auth.uid` seja igual ao `{uid}` da URL. O frontend
usa lotes para gerar aulas de uma turma, importar dados e resetar as três
coleções. As regras devem ser revisadas no Firebase Emulator Suite antes de uma
mudança de esquema.

## Calendário de feriados

O aplicativo deriva os feriados nacionais no próprio cliente. Apenas feriados
personalizados são gravados em `users/{uid}/holidays/{YYYY-MM-DD}`, com data,
nome e datas de auditoria. Uma aula em feriado deixa de compor somente uma
competência ainda aberta; pagamentos recebidos preservam o histórico financeiro.

As coleções `admin_access_sessions`, `admin_usage_daily` e `admin_page_visits` são gravadas apenas
pelas rotas de servidor com credenciais administrativas. Elas não exigem nem
recebem permissões adicionais nas regras do cliente.

## Nick de acesso nas Configurações

Em **Configurações > Conta > Acesso à conta**, cada usuário autenticado pode definir ou
alterar o próprio nick. São aceitos de 3 a 30 caracteres: letras sem acento,
números, ponto, hífen e sublinhado. A comparação não diferencia maiúsculas de
minúsculas. O login por e-mail e a recuperação de senha continuam disponíveis.

`GET/PATCH /api/account/username` identifica a conta pelo token Firebase, nunca
por um UID informado pelo cliente. O servidor usa uma transação Firestore para
reservar o nome em `login_usernames/{nick}`, atualizar
`login_accounts/{uid}` e liberar o nome anterior, somente se pertencer à mesma
conta. Nomes ocupados retornam 409 sem alterar o nick atual.

As coleções de índices são acessadas apenas pelo Admin SDK e permanecem
bloqueadas pelas regras atuais para leitura ou escrita direta do navegador.
O serviço usa a configuração de servidor já exigida pela administração
(`FIREBASE_SERVICE_ACCOUNT_JSON`); não requer novas variáveis nem novas regras.
Contas criadas anteriormente são reconhecidas pela claim `username`, sem
migração manual. Após uma troca, `login_accounts` é a fonte autoritativa; a
exclusão administrativa limpa os índices atual e legado sem afetar terceiros.
A demonstração não altera nicks nem chama essa API de conta real.
