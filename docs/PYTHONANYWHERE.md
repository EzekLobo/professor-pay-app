# Publicação da API no PythonAnywhere

Este guia publica somente a API FastAPI. O suporte ASGI do PythonAnywhere é
beta/experimental; confirme os limites do seu plano antes de usar em produção.
SQLite é apropriado aqui para baixa concorrência e **um processo da API**. Não
use múltiplos workers nem disponibilize `apps/api/data` por uma rota estática.

## 1. Preparar código e ambiente

Em um Bash console do PythonAnywhere, substitua `SEU_USUARIO` e ajuste o nome do
repositório se necessário:

```bash
cd /home/SEU_USUARIO
git clone URL_DO_REPOSITORIO AulaPay
cd AulaPay
python3.12 -m venv /home/SEU_USUARIO/.virtualenvs/aulapay
source /home/SEU_USUARIO/.virtualenvs/aulapay/bin/activate
python -m pip install --upgrade pip
python -m pip install uv
cd /home/SEU_USUARIO/AulaPay/apps/api
uv sync --frozen --no-dev
```

Se `uv` não estiver disponível ou não puder criar o ambiente no plano, ative o
venv e instale pelo fallback:

```bash
python -m pip install .
```

Atualizações futuras usam `git pull`, depois `uv sync --frozen --no-dev` (ou
`python -m pip install .` no fallback). Não faça `git clean` sem antes salvar o
banco, pois ele contém dados locais ignorados pelo Git.

## 2. Configurar ambiente e banco

Crie `apps/api/.env`, que não é versionado:

```dotenv
APP_ENV=production
JWT_SECRET_KEY=gere-um-segredo-longo-e-aleatorio
ACCESS_TOKEN_EXPIRE_MINUTES=480
CORS_ORIGINS=https://SEU_USUARIO.pythonanywhere.com,https://seu-frontend.example
# Deixe DATABASE_URL ausente para usar:
# /home/SEU_USUARIO/AulaPay/apps/api/data/aulapay.sqlite3
# Ou use um caminho absoluto fora do checkout:
# DATABASE_URL=sqlite+pysqlite:////home/SEU_USUARIO/aulapay-data/aulapay.sqlite3
```

Para gerar um segredo, execute `python -c "import secrets; print(secrets.token_urlsafe(48))"` e não o envie ao Git. Crie o schema:

```bash
cd /home/SEU_USUARIO/AulaPay/apps/api
source /home/SEU_USUARIO/.virtualenvs/aulapay/bin/activate
alembic upgrade head
```

O banco padrão fica em `apps/api/data/aulapay.sqlite3`, ignorado pelo Git. Para
mais isolamento, prefira o `DATABASE_URL` com caminho absoluto fora do checkout;
garanta que o diretório exista e seja gravável pela sua conta.

## 3. Criar o site ASGI

Na página de conta do PythonAnywhere, gere primeiro o API token necessário para
o comando `pa`. No Bash console:

```bash
source /home/SEU_USUARIO/.virtualenvs/aulapay/bin/activate
python -m pip install --upgrade pythonanywhere
pa website create --domain SEU_USUARIO.pythonanywhere.com --command '/home/SEU_USUARIO/.virtualenvs/aulapay/bin/uvicorn --app-dir /home/SEU_USUARIO/AulaPay/apps/api --uds ${DOMAIN_SOCKET} app.main:app'
```

O valor de `DOMAIN_SOCKET` é fornecido pelo PythonAnywhere: mantenha `${DOMAIN_SOCKET}`
literal entre aspas simples no comando. O `--app-dir` é absoluto para que a API
e o SQLite não dependam do diretório de trabalho. Acompanhe os logs exibidos por
`pa website get --domain SEU_USUARIO.pythonanywhere.com` e valide
`https://SEU_USUARIO.pythonanywhere.com/health`.

Após alteração de código, migração ou variáveis, execute:

```bash
cd /home/SEU_USUARIO/AulaPay/apps/api
source /home/SEU_USUARIO/.virtualenvs/aulapay/bin/activate
alembic upgrade head
pa website reload --domain SEU_USUARIO.pythonanywhere.com
```

Não há deploy automatizado configurado por este repositório; execute esses
passos conscientemente após validar a mudança.

## 4. Conectar o frontend

Ao construir/publicar o Next.js, defina a variável pública:

```dotenv
NEXT_PUBLIC_API_URL=https://SEU_USUARIO.pythonanywhere.com/api/v1
```

Inclua a origem exata do frontend em `CORS_ORIGINS` na API, usando HTTPS em
produção. Se frontend e API estiverem em domínios diferentes, valide no navegador
o fluxo de login e os cookies antes de liberar usuários; configurações de cookie
e domínio exigem que ambos os lados usem HTTPS.

## 5. Backup e restauração

O modo seguro é interromper o processo do site para que a API não escreva durante
a cópia. Guarde o backup fora do repositório e com permissões privadas:

```bash
cp /home/SEU_USUARIO/AulaPay/apps/api/data/aulapay.sqlite3 /home/SEU_USUARIO/backups/aulapay-AAAA-MM-DD.sqlite3
```

Para uma cópia online quando SQLite estiver em WAL, copie o conjunto consistente
`aulapay.sqlite3`, `aulapay.sqlite3-wal` e `aulapay.sqlite3-shm` junto, sem
misturar arquivos de instantes diferentes. Para restaurar, desabilite ou pare o
site, faça uma cópia de segurança do banco atual, substitua o arquivo (e os
companheiros WAL/SHM quando fizerem parte do backup), rode `alembic upgrade head`
e recarregue o site. Sempre teste uma restauração em um diretório isolado antes
de sobrescrever dados reais.

SQLite não oferece a mesma capacidade de escrita concorrente de um banco servidor.
Se o uso crescer para várias gravações simultâneas, múltiplos processos ou alta
disponibilidade, migre usando o override `DATABASE_URL` para PostgreSQL.
