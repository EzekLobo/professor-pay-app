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

Pelo painel, o administrador também pode cadastrar contas de acesso com nome,
e-mail e senha inicial. A conta é criada no Firebase Authentication e pode
entrar imediatamente; informe a senha inicial por um canal seguro. As contas
criadas não recebem privilégio administrativo: isso continua limitado aos
e-mails configurados em `ADMIN_EMAILS`.

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

As regras exigem que `request.auth.uid` seja igual ao `{uid}` da URL. O frontend
usa lotes para gerar aulas de uma turma, importar dados e resetar as três
coleções. As regras devem ser revisadas no Firebase Emulator Suite antes de uma
mudança de esquema.

As coleções `admin_access_sessions` e `admin_usage_daily` são gravadas apenas
pelas rotas de servidor com credenciais administrativas. Elas não exigem nem
recebem permissões adicionais nas regras do cliente.
