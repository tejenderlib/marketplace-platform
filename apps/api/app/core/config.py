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

    # ---- Phase 8 hardening -------------------------------------------------
    # Payment simulation: the client may choose dummy success/failure outcomes
    # only when explicitly enabled. It defaults to enabled outside production
    # (local Docker/Vite development + smoke suites) and disabled otherwise;
    # with the gate closed the provider decision is server-side only.
    payments_allow_simulated_outcomes: bool | None = None

    # OpenAPI/docs exposure. Same production-default-off policy as payments:
    # local development keeps /docs and /api/v1/openapi.json available.
    docs_enabled: bool | None = None

    # Host-header validation. Empty list disables the check (local Docker
    # development binds many hosts); production should pin known hosts.
    allowed_hosts: list[str] = Field(default_factory=list)

    # Request-body ceiling (bytes) applied to every request.
    max_request_body_bytes: int = Field(default=1_048_576, gt=0)

    # Session control: maximum concurrently-ACTIVE refresh tokens per user;
    # the oldest tokens are revoked beyond the cap at login.
    max_active_refresh_tokens_per_user: int = Field(default=10, gt=0)

    # Anti-churn cap on bids per bidder per auction.
    max_bids_per_user_per_auction: int = Field(default=200, gt=0)

    @property
    def payments_simulate_enabled(self) -> bool:
        if self.payments_allow_simulated_outcomes is not None:
            return self.payments_allow_simulated_outcomes
        return self.environment != "production"

    @property
    def docs_enabled_effective(self) -> bool:
        if self.docs_enabled is not None:
            return self.docs_enabled
        return self.environment != "production"

    # Auth rate limiting (fixed windows, in-process counters). The login
    # per-account limit counts failed attempts only; successful logins
    # clear the counter. The register per-IP limit counts all attempts.
    auth_rate_limit_window_seconds: int = Field(default=60, gt=0)
    auth_login_rate_limit_per_ip: int = Field(default=20, gt=0)
    auth_login_rate_limit_per_account: int = Field(default=5, gt=0)
    auth_register_rate_limit_per_ip: int = Field(default=30, gt=0)

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
