# AulaPay

O aplicativo Expo existente permanece na raiz durante a migração. A versão web
fica em `apps/web` (Next.js) e a API em `apps/api` (FastAPI). O PostgreSQL é
executado localmente pelo Docker Compose.

## Requisitos

- Docker Desktop com Docker Compose v2
- Node.js 24+ e npm 11+ para execução fora de containers
- Python 3.12 a 3.14 e [uv](https://docs.astral.sh/uv/) para execução local da API

## Início rápido com Docker

1. Copie o exemplo de variáveis: `Copy-Item .env.example .env`
2. Troque `POSTGRES_PASSWORD` no `.env` por uma senha local segura.
3. Inicie: `docker compose up --build`
4. Abra o frontend em http://localhost:3000, a API em http://localhost:8000/health
   e a documentação em http://localhost:8000/docs.

Para encerrar, use `docker compose down`. Os dados do Postgres ficam no volume
`postgres_data`. Para remover também os dados locais, use `docker compose down -v`.

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
uv run uvicorn app.main:app --reload --port 8000
```

Para uma API local, copie `apps/api/.env.example` para `apps/api/.env` e tenha
um PostgreSQL disponível. Nesta fundação, o endpoint `/health` é de liveness e
não acessa o banco; a verificação de readiness será adicionada junto aos modelos.

## Verificações

```powershell
docker compose config
npm run web:lint
npm run web:typecheck
Set-Location apps/api; uv run pytest
```

O aplicativo Expo atual continua usando os comandos existentes: `npm start` e
`npm test`.

## Operacao e qualidade

`/health` confirma que a API esta em execucao e `/ready` tambem verifica a
conexao com PostgreSQL. Execute todas as validacoes locais com `npm run quality`.
O E2E usa Chromium do Playwright: instale-o com `npx playwright install chromium`
e rode `npm run web:e2e`. Consulte [docs/OPERATIONS.md](docs/OPERATIONS.md) para
migracoes, backup, restauracao e limites do deploy.
