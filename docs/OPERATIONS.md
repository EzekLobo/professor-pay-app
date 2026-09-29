# Operacao do AulaPay Web

## Inicializacao local

1. Copie `.env.example` para `.env` e substitua `POSTGRES_PASSWORD` e `JWT_SECRET_KEY`.
2. Execute `docker compose up --build`.
3. Verifique `http://localhost:8000/health`, `http://localhost:8000/ready` e `http://localhost:3000`.

A API executa `alembic upgrade head` antes de iniciar. Em producao com mais de uma replica, execute a migracao como etapa unica de release para evitar corrida.

## Variaveis

`POSTGRES_DB`, `POSTGRES_USER` e `POSTGRES_PASSWORD` configuram o banco. `DATABASE_URL` e usada pela API. `JWT_SECRET_KEY` deve ser longo, aleatorio e diferente em cada ambiente. `CORS_ORIGINS` deve conter somente origens HTTPS autorizadas. `NEXT_PUBLIC_API_URL` e publico e aponta para a URL versionada da API. Nunca publique `.env` nem use valores de exemplo em producao. Defina `APP_ENV=production` para cookies seguros e cadastro fechado por padrao.

## Migracoes

No diretorio `apps/api`, execute `uv run alembic upgrade head`. Gere revisao somente apos revisar o SQL: `uv run alembic revision --autogenerate -m "descricao"`. Nao execute downgrade em producao sem backup restauravel e plano de reversao.

## Backup e restauracao PostgreSQL

Com Compose em execucao: `docker compose exec -T db pg_dump -U aulapay -d aulapay -Fc > aulapay.backup`.

Para restaurar, pare API e web, crie banco vazio e execute: `Get-Content -Encoding Byte aulapay.backup | docker compose exec -T db pg_restore -U aulapay -d aulapay --clean --if-exists`.

Teste restauracoes em ambiente isolado. Em producao, use backup automatizado do provedor, retencao definida e alerta de falha.

## Checks e diagnostico

`/health` confirma o processo; `/ready` tambem testa o banco e retorna 503 se indisponivel. Os logs da API sao JSON e incluem apenas ID da requisicao, metodo, caminho, status e duracao. Corpos, query strings, cookies, tokens e senhas nao sao registrados.

Execute `npm run quality`, `npm run web:e2e` e `docker compose config`. E2E requer Chromium: `npx playwright install chromium`; em Linux CI use `npx playwright install --with-deps chromium`.

## Limites de deploy

O repositorio fornece containers e CI, mas nao provisiona dominio, TLS, PostgreSQL gerenciado, segredos, monitoramento externo ou backup automatizado. Configure esses itens no provedor e rode smoke tests em staging. Nao exponha PostgreSQL publicamente.
