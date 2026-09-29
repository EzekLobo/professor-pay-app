# AulaPay

O aplicativo Expo existente permanece na raiz durante a migração. A versão web
fica em `apps/web` (Next.js) e a API em `apps/api` (FastAPI). Por padrão, a API
usa o SQLite em `apps/api/data/aulapay.sqlite3`; esse arquivo local é ignorado
pelo Git e pode ser copiado para hospedagens simples, como PythonAnywhere.

## Requisitos

- Docker Desktop com Docker Compose v2 (opcional)
- Node.js 24+ e npm 11+ para execução fora de containers
- Python 3.12 a 3.14 e [uv](https://docs.astral.sh/uv/) para execução local da API

## Início rápido local

1. Copie o exemplo de variáveis: `Copy-Item .env.example .env`
2. Troque `JWT_SECRET_KEY` por um segredo longo e aleatório.
3. Inicie com Docker: `docker compose up --build`
4. Abra o frontend em http://localhost:3000, a API em http://localhost:8000/health
   e a documentação em http://localhost:8000/docs.

Para encerrar, use `docker compose down`. O banco persiste no arquivo
`apps/api/data/aulapay.sqlite3`; `docker compose down -v` não o remove. Não
versione, exponha como arquivo estático ou apague esse banco sem um backup.

## Execução sem Docker

Frontend:

```powershell
npm install
npm run web:dev
```

API:

```powershell
Set-Location apps/api
uv sync --all-groups
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

Para uma API local, copie `apps/api/.env.example` para `apps/api/.env`. Não é
necessário instalar ou iniciar um servidor de banco: Alembic cria o schema no
arquivo SQLite padrão. `DATABASE_URL` continua disponível como override, por
exemplo para um caminho SQLite absoluto ou PostgreSQL.

## Verificações

```powershell
docker compose config --quiet
npm run web:lint
npm run web:typecheck
Set-Location apps/api; uv run --isolated pytest
```

O aplicativo Expo atual continua usando os comandos existentes: `npm start` e
`npm test`.

## Operação e qualidade

`/health` confirma que a API está em execução e `/ready` também verifica o
banco SQLite. Execute todas as validações locais com `npm run quality`. O E2E
usa Chromium do Playwright: instale-o com `npx playwright install chromium` e
rode `npm run web:e2e`. Consulte [docs/OPERATIONS.md](docs/OPERATIONS.md) para
migrações, backup, restauração e limites do deploy. Para PythonAnywhere, siga
[docs/PYTHONANYWHERE.md](docs/PYTHONANYWHERE.md).
