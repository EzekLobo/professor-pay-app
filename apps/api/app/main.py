import logging
import time
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.auth import router as auth_router
from app.api.financial import router as financial_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)
app.include_router(auth_router)
app.include_router(financial_router)

logger = logging.getLogger(__name__)


class JsonRequestFormatter(logging.Formatter):
    """Emit request metadata without serializing request bodies or credentials."""

    def format(self, record: logging.LogRecord) -> str:
        request_id = getattr(record, "request_id", "-")
        method = getattr(record, "method", "-")
        path = getattr(record, "path", "-")
        status_code = getattr(record, "status_code", "-")
        duration_ms = getattr(record, "duration_ms", "-")
        return (
            f'{{"level":"{record.levelname}","event":"{record.getMessage()}",'
            f'"request_id":"{request_id}","method":"{method}",'
            f'"path":"{path}","status_code":{status_code},"duration_ms":{duration_ms}}}'
        )


def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonRequestFormatter())
    api_logger = logging.getLogger("aulapay.api")
    api_logger.handlers = [handler]
    api_logger.setLevel(logging.INFO)
    api_logger.propagate = False


configure_logging()
request_logger = logging.getLogger("aulapay.api")


@app.middleware("http")
async def log_request(request: Request, call_next):
    """Log only method, path, status and duration; never headers, query or body."""
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    started = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        request_logger.info(
            "request_completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": status_code,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
            },
        )


@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    # Pydantic's validation context may include a ValueError instance, which the
    # standard JSON encoder cannot serialize.
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(exc.errors())})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, _exc: Exception) -> JSONResponse:
    logger.exception("Unhandled API error for %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    """Liveness endpoint that does not require a database connection."""
    return {"status": "ok", "environment": settings.app_env}


@app.get("/ready", tags=["health"])
async def readiness_check() -> dict[str, str]:
    """Readiness endpoint used by orchestration after migrations have completed."""
    from app.db.session import SessionLocal

    try:
        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
    except Exception as exc:
        logger.warning("Database readiness check failed: %s", type(exc).__name__)
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return {"status": "ready"}
