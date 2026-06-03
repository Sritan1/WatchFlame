from contextlib import asynccontextmanager
import logging
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

# Always load api/.env regardless of CWD or how uvicorn is launched.
load_dotenv(Path(__file__).parent / ".env")

from .core.config import get_settings  # noqa: E402  (must come after load_dotenv)
from .core.logging_setup import configure_logging  # noqa: E402
from .core.rate_limit import limiter  # noqa: E402
from .routes import (  # noqa: E402
    disasters,
    fires,
    geocode,
    incidents,
    risk,
    shelters,
    trajectory,
    weather,
)

configure_logging()
logger = logging.getLogger("wildfire")
settings = get_settings()


# The limiter is keyed by client IP. Behind Railway's load balancer the real
# client IP arrives in X-Forwarded-For; uvicorn runs with --proxy-headers (see
# Procfile) so request.client.host is rewritten to it. The global default
# applies to every route via SlowAPIMiddleware; expensive routes override it
# with a tighter @limiter.limit decorator, and /healthz is exempt.
def _rate_limit_exceeded(request: Request, exc: RateLimitExceeded) -> Response:
    return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Slow down."})


# ── Middleware ────────────────────────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds defensive response headers to every response. HSTS is only sent in
    production (sending it from http://localhost would pin the dev origin to
    HTTPS in the browser)."""

    def __init__(self, app, is_prod: bool):
        super().__init__(app)
        self._is_prod = is_prod

    async def dispatch(self, request: Request, call_next):
        resp = await call_next(request)
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "no-referrer"
        resp.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
        # This is a JSON API; nothing should ever be framed or scripted from it.
        resp.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        if self._is_prod:
            resp.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return resp


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Rejects oversized request bodies before they're parsed. The only body
    endpoint is POST /risk, whose largest legitimate payload is a few hundred
    bytes; the cap is set well above that in config."""

    def __init__(self, app, max_bytes: int):
        super().__init__(app)
        self._max = max_bytes

    async def dispatch(self, request: Request, call_next):
        if request.method in ("POST", "PUT", "PATCH"):
            cl = request.headers.get("content-length")
            if cl is not None:
                try:
                    if int(cl) > self._max:
                        return JSONResponse(
                            status_code=413, content={"detail": "Request body too large."}
                        )
                except ValueError:
                    return JSONResponse(
                        status_code=400, content={"detail": "Invalid Content-Length."}
                    )
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast on a misconfigured production deploy (wildcard CORS, missing
    # required secrets) rather than silently serving an open/keyless surface.
    problems = settings.startup_problems()
    if problems:
        msg = "Insecure configuration:\n  - " + "\n  - ".join(problems)
        logger.error(msg)
        raise RuntimeError(msg)
    yield


app = FastAPI(
    title="Wildfire API",
    version="0.4.0",
    description=(
        "Backend for Ember Watch: live fire detections, regionally-calibrated "
        "fire-weather risk (V4), weather, shelters, and disaster advisories."
    ),
    lifespan=lifespan,
)

# Wire the rate limiter.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded)

# Middleware is applied bottom-up (last added = outermost). CORS is added last
# so its headers wrap every response, including error and 429 responses.
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_request_bytes)
app.add_middleware(SecurityHeadersMiddleware, is_prod=settings.is_prod)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


# ── Global exception handler ──────────────────────────────────────────────────
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Log the real error server-side; return a generic body so stack traces,
    file paths, and upstream details never reach the client."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})


@app.get("/healthz")
@limiter.exempt
async def healthz():
    return {"ok": True}


app.include_router(fires.router)
app.include_router(risk.router)
app.include_router(weather.router)
app.include_router(geocode.router)
app.include_router(shelters.router)
app.include_router(incidents.router)
app.include_router(disasters.router)
app.include_router(trajectory.router)
