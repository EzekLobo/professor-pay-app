# NexusClass

O aplicativo Expo existente permanece na raiz durante a migração. A versão web
fica em `frontend` (Next.js) e usa Firebase Authentication + Cloud Firestore
diretamente no navegador; a publicação recomendada é na Vercel. A API em
`backend` (FastAPI) e o SQLite em `backend/data/aulapay.sqlite3` ficam como
legado para exportar/migrar dados, não como dependência do frontend em produção.
Consulte [docs/FIREBASE.md](docs/FIREBASE.md) para configurar o projeto.

## Requisitos

- Docker Desktop com Docker Compose v2 (opcional)
- Node.js 24+ e npm 11+ para execução fora de containers
- Python 3.12 a 3.14 e [uv](https://docs.astral.sh/uv/) para execução local da API

## Início rápido local

1. Copie o exemplo de variáveis: `Copy-Item .env.example .env.local`
2. Preencha as variáveis `NEXT_PUBLIC_FIREBASE_*` com a configuração Web do
   Firebase.
3. Inicie o frontend: `npm run web:dev` e abra http://localhost:3000.

O backend legado ainda pode ser executado separadamente para migração e
exportação, mas não é necessário para abrir as telas web.

Para encerrar, use `docker compose down`. O banco persiste no arquivo
`backend/data/aulapay.sqlite3`; `docker compose down -v` não o remove. Não
versione, exponha como arquivo estático ou apague esse banco sem um backup.

## Execução sem Docker

Frontend:

```powershell
npm install
npm run web:dev
```

API:

```powershell
Set-Location backend
uv sync --all-groups
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

Para uma API local, copie `backend/.env.example` para `backend/.env`. Não é
necessário instalar ou iniciar um servidor de banco: Alembic cria o schema no
arquivo SQLite padrão. `DATABASE_URL` continua disponível como override, por
exemplo para um caminho SQLite absoluto ou PostgreSQL.

## Verificações

```powershell
docker compose config --quiet
npm run web:lint
npm run web:typecheck
Set-Location backend; uv run --isolated pytest
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
