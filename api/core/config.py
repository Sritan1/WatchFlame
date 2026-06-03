"""Central, security-relevant configuration.

Single source of truth for the knobs that matter at the trust boundary:
allowed CORS origins, the runtime environment, the required upstream secrets,
and the rate-limit budget. Per-service cache TTLs stay where they are (they are
not security-sensitive) — this module deliberately does NOT try to absorb every
`os.getenv` in the codebase, only the ones that gate the public surface.

`get_settings()` is lazy + cached so it reads the environment AFTER `main.py`
has called `load_dotenv()`. Field names map case-insensitively to env vars
(e.g. `allowed_origins` <- `ALLOWED_ORIGINS`).
"""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore", case_sensitive=False)

    # dev | prod — drives fail-fast checks and HSTS. Anything other than a
    # production marker is treated as development (permissive).
    environment: str = "dev"

    # Comma-separated allowlist, e.g. "https://app.vercel.app,http://localhost:3000".
    # "*" is allowed in dev only; rejected at startup in prod.
    allowed_origins: str = "*"

    # Upstream secrets. Optional here so a dev box missing a key can still boot
    # (the owning service raises lazily when actually called); `startup_problems`
    # enforces the required ones in prod.
    nasa_firms_api_key: str | None = None
    openweathermap_api_key: str | None = None
    cdse_client_id: str | None = None
    cdse_client_secret: str | None = None

    # Rate-limit budget (slowapi limit strings). Tiered so the endpoints that
    # fan out to paid / quota-limited upstreams are capped tighter than the
    # cheap cached ones.
    rate_limit_enabled: bool = True
    rate_limit_default: str = "60/minute"      # global per-IP fallback
    rate_limit_expensive: str = "20/minute"    # /risk /trajectory /weather /geocode /shelters
    rate_limit_cheap: str = "120/minute"       # /fires /healthz

    # Hard cap on request body size (bytes) — guards POST /risk against
    # oversized payloads. 16 KiB is ~100x the largest legitimate body.
    max_request_bytes: int = 16_384

    @property
    def is_prod(self) -> bool:
        return self.environment.strip().lower() in {"prod", "production"}

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in (self.allowed_origins or "").split(",") if o.strip()]

    @property
    def cors_origins(self) -> list[str]:
        """What to hand the CORS middleware. Empty allowlist falls back to '*'
        in dev; prod never reaches here with a wildcard (startup refuses it)."""
        return self.origins_list or ["*"]

    def startup_problems(self) -> list[str]:
        """Fatal misconfigurations for the current environment (empty = OK).
        Enforced at app startup so a misconfigured prod deploy fails loudly
        instead of silently serving an open or keyless surface."""
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
