from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


# Keep the default database next to the deployable API.  Resolving this from
# this module instead of the process working directory makes the same setting
# work from a Windows checkout and from a PythonAnywhere WSGI/ASGI process.
API_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SQLITE_PATH = API_ROOT / "data" / "aulapay.sqlite3"
DEFAULT_DATABASE_URL = f"sqlite+pysqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"


class Settings(BaseSettings):
    app_name: str = "AulaPay API"
    app_env: str = "development"
    database_url: str = DEFAULT_DATABASE_URL
    cors_origins: str = "http://localhost:3000"
    jwt_secret_key: str = "development-only-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 8
    registration_enabled: bool | None = None

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_registration_enabled(self) -> bool:
        """Keep self-service signup limited to local development by default."""
        if self.registration_enabled is not None:
            return self.registration_enabled
        return self.app_env == "development"

    @property
    def cookie_secure(self) -> bool:
        return self.app_env != "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
