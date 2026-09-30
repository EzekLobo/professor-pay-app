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

Em **Project Settings > Environment Variables**, cadastre as variáveis Web
para Preview e Production. Depois faça um novo deploy. O frontend não precisa
de `NEXT_PUBLIC_API_URL` para os fluxos de produção; essa variável só existe
para compatibilidade com a API Python legada durante a migração.

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
