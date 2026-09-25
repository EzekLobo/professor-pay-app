FROM python:3.14-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

FROM base AS dependencies
COPY pyproject.toml uv.lock ./
RUN pip install --no-cache-dir uv==0.11.28 && uv sync --frozen --no-dev

FROM dependencies AS development
RUN uv sync --frozen
COPY . .
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM dependencies AS production
COPY . .
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
