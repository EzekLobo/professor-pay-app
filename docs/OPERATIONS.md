# Operação do AulaPay Web

## Inicialização local

1. Copie `.env.example` para `.env` e substitua `JWT_SECRET_KEY`.
2. Execute `docker compose up --build`.
3. Verifique `http://localhost:8000/health`, `http://localhost:8000/ready` e `http://localhost:3000`.

A API executa `alembic upgrade head` antes de iniciar. Em produção com mais de
uma réplica, execute a migração como etapa única de release para evitar corrida.

## Variáveis

Sem `DATABASE_URL`, a API usa `apps/api/data/aulapay.sqlite3`, resolvido a partir
do código Python e não do diretório atual. Esse arquivo é ignorado pelo Git.
`DATABASE_URL` continua disponível para um caminho SQLite absoluto ou outro
banco compatível. `JWT_SECRET_KEY` deve ser longo, aleatório e diferente em cada
ambiente. `CORS_ORIGINS` deve conter somente origens HTTPS autorizadas.
`NEXT_PUBLIC_API_URL` é público e aponta para a URL versionada da API. Nunca
publique `.env`, o arquivo SQLite ou valores de exemplo em produção. Defina
`APP_ENV=production` para cookies seguros e cadastro fechado por padrão.

## Migrações

No diretório `apps/api`, execute `uv run alembic upgrade head`. Gere revisão
somente após revisar o SQL: `uv run alembic revision --autogenerate -m
"descricao"`. Não execute downgrade em produção sem backup restaurável e plano
de reversão.

## Backup e restauração SQLite

Antes de copiar o banco, pare a API para obter uma cópia consistente. Copie o
arquivo `apps/api/data/aulapay.sqlite3` para um local seguro fora do repositório.
Se for indispensável fazer uma cópia com a API em execução e o modo WAL estiver
ativo, copie juntos os três arquivos: `aulapay.sqlite3`, `aulapay.sqlite3-wal` e
`aulapay.sqlite3-shm`. Não restaure arquivos parciais.

Para restaurar, pare a API, faça uma cópia do banco atual e substitua o conjunto
de arquivos pelo backup consistente. Em seguida, execute `uv run alembic upgrade
head` em `apps/api` antes de iniciar a API. Teste restaurações em ambiente
isolado. Em produção, defina backup externo, retenção e alerta de falha. O guia
[PYTHONANYWHERE.md](PYTHONANYWHERE.md) detalha a hospedagem e os comandos.

## Checks e diagnóstico

`/health` confirma o processo; `/ready` também testa o banco e retorna 503 se
indisponível. Os logs da API são JSON e incluem apenas ID da requisição, método,
caminho, status e duração. Corpos, query strings, cookies, tokens e senhas não
são registrados.

Execute `npm run quality`, `npm run web:e2e` e `docker compose config --quiet`.
E2E requer Chromium: `npx playwright install chromium`; em Linux CI use `npx
playwright install --with-deps chromium`.

## Limites de deploy

O repositório não provisiona domínio, TLS, segredos, monitoramento externo ou
backup automatizado. Configure esses itens no provedor e rode smoke tests em
staging. SQLite é indicado para uso de baixa concorrência com um único processo;
não o sirva por uma rota estática, diretório público ou download.
