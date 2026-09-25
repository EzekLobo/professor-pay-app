from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AulaPay API"
    app_env: str = "development"
    database_url: str = "postgresql+psycopg://aulapay:aulapay@localhost:5432/aulapay"
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
