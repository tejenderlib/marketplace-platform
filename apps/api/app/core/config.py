from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


def find_env_file() -> Path | None:
    """Find the repository .env when running tools from nested API paths."""

    for directory in Path(__file__).resolve().parents:
        if (directory / "compose.yaml").is_file():
            env_file = directory / ".env"
            return env_file if env_file.is_file() else None
    return None


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        # Compose injects variables into containers. Local commands can be run
        # from the repository root or any nested backend directory.
        env_file=find_env_file(),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Marketplace Platform API"
    environment: str = "development"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str
    postgres_user: str
    postgres_password: SecretStr = Field(min_length=1)

    jwt_secret: SecretStr = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = Field(default=15, gt=0)
    jwt_refresh_token_expire_days: int = Field(default=30, gt=0)
    auction_checkout_window_hours: int = Field(default=48, gt=0)

    @property
    def database_url(self) -> str:
        """Build a safely encoded SQLAlchemy URL from independent settings."""

        from sqlalchemy import URL

        url = URL.create(
            drivername="postgresql+psycopg",
            username=self.postgres_user,
            password=self.postgres_password.get_secret_value(),
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        )
        return url.render_as_string(hide_password=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()
