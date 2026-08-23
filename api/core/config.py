"""Security-relevant config. CORS origins, environment, upstream secrets, the
rate-limit budget.

get_settings() is lazy and cached so it reads the environment after main.py calls
load_dotenv(). Field names map to env vars case-insensitively.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", case_sensitive=False)

    # Drives the fail-fast checks and HSTS. Anything that isn't a production marker
    # counts as dev, which is the permissive path.
    environment: str = "dev"

    # Comma-separated allowlist. "*" is a dev-only convenience and prod refuses to
    # start with it.
    allowed_origins: str = "*"

    # Optional so a dev box missing a key still boots. startup_problems enforces
    # them in prod.
    nasa_firms_api_key: str | None = None
    openweathermap_api_key: str | None = None
    cdse_client_id: str | None = None
    cdse_client_secret: str | None = None

    # slowapi limit strings. Routes hitting quota-limited upstreams are capped
    # tighter than the default.
    rate_limit_enabled: bool = True
    # The fallback every undecorated route gets, /fires included.
    rate_limit_default: str = "60/minute"
    # /risk /trajectory /weather /geocode /shelters /ignition
    rate_limit_expensive: str = "20/minute"

    # How many reverse proxies sit in front of us (Railway is 1). The rate-limit key
    # reads that many entries from the RIGHT of X-Forwarded-For, so a client can't
    # spoof past the cap. Set 0 to key on the direct peer.
    rate_limit_trusted_proxies: int = 1

    # Body-size cap in bytes for POST /risk. 16 KiB is about 100x anything real.
    max_request_bytes: int = 16_384

    @property
    def is_prod(self) -> bool:
        return self.environment.strip().lower() in {"prod", "production"}

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in (self.allowed_origins or "").split(",") if o.strip()]

    @property
    def cors_origins(self) -> list[str]:
        """What to hand the CORS middleware. Empty means '*' in dev. Prod never gets
        here with a wildcard, startup refuses to boot first."""
        return self.origins_list or ["*"]

    def startup_problems(self) -> list[str]:
        """Anything fatal about the current config. A bad prod deploy should die
        loudly rather than serve an open or keyless API."""
        problems: list[str] = []
        if self.is_prod:
            if not self.origins_list or "*" in self.origins_list:
                problems.append(
                    "ALLOWED_ORIGINS must be an explicit allowlist (no '*') when ENVIRONMENT=prod"
                )
            if not self.nasa_firms_api_key:
                problems.append("NASA_FIRMS_API_KEY is required when ENVIRONMENT=prod")
            if not self.openweathermap_api_key:
                problems.append("OPENWEATHERMAP_API_KEY is required when ENVIRONMENT=prod")
        return problems


@lru_cache
def get_settings() -> Settings:
    return Settings()
