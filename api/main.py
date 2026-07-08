from contextlib import asynccontextmanager
import logging
import math
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
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
    ignition,
    incidents,
    risk,
    shelters,
    trajectory,
    weather,
)

configure_logging()
logger = logging.getLogger("wildfire")
settings = get_settings()


# The limiter is keyed by client IP (see core/rate_limit.client_ip, which reads
# the entry the trusted proxy appended to X-Forwarded-For rather than the
# client-controlled leftmost one). The global default applies to every route via
# SlowAPIMiddleware; expensive routes override it with a tighter @limiter.limit
# decorator, and /healthz is exempt.
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


def _replay_receive(buffered: dict, real_receive):
    """A receive() that yields one pre-buffered ASGI message, then defers to the
    real channel (so the downstream app still sees http.disconnect etc.)."""
    sent = False

    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return buffered
        return await real_receive()

    return receive


class BodySizeLimitMiddleware:
    """Reject oversized request bodies before they're buffered/parsed.

    Pure-ASGI (not BaseHTTPMiddleware) so it can cap a STREAMED body that omits
    Content-Length (chunked Transfer-Encoding): it honors the header when present,
    then counts bytes as they arrive and aborts with 413 the moment the running
    total exceeds the cap. The only body endpoint is POST /risk (a few hundred
    bytes), so pre-buffering up to the cap is cheap. Added inside the CORS layer,
    so the 413 still carries CORS + security headers."""

    def __init__(self, app, max_bytes: int):
        self.app = app
        self._max = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") not in ("POST", "PUT", "PATCH"):
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        cl = headers.get(b"content-length")
        if cl is not None:
            try:
                if int(cl) > self._max:
                    await self._reject(scope, receive, send, 413, "Request body too large.")
                    return
            except ValueError:
                await self._reject(scope, receive, send, 400, "Invalid Content-Length.")
                return

        # Buffer the body, enforcing the cap even without a Content-Length.
        body = b""
        while True:
            message = await receive()
            if message["type"] != "http.request":
                await self.app(scope, _replay_receive(message, receive), send)
                return
            body += message.get("body", b"")
            if len(body) > self._max:
                await self._reject(scope, receive, send, 413, "Request body too large.")
                return
            if not message.get("more_body", False):
                break

        replayed = {"type": "http.request", "body": body, "more_body": False}
        await self.app(scope, _replay_receive(replayed, receive), send)

    async def _reject(self, scope, receive, send, status: int, detail: str) -> None:
        await JSONResponse(status_code=status, content={"detail": detail})(scope, receive, send)


class ExceptionHandlingMiddleware(BaseHTTPMiddleware):
    """Convert an unhandled route exception into the generic 500 HERE, inside the
    CORS + security-header layer, so the error response still carries
    Access-Control-Allow-Origin. Starlette's outermost ServerErrorMiddleware runs
    OUTSIDE CORS, so a 500 raised there reaches the browser with no CORS header
    and is reported as a CORS error, masking the real failure."""

    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception:
            logger.exception("Unhandled error on %s %s", request.method, request.url.path)
            return JSONResponse(status_code=500, content={"detail": "Internal server error."})


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
# ExceptionHandlingMiddleware is added FIRST (innermost) so it catches route
# exceptions and turns them into a 500 response that then flows back out through
# the security-header + CORS layers (a raw 500 from Starlette's outermost error
# middleware would escape CORS — see the class docstring).
app.add_middleware(ExceptionHandlingMiddleware)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_request_bytes)
app.add_middleware(SecurityHeadersMiddleware, is_prod=settings.is_prod)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    # Per-request source-health (see core/source_health.py). Must be exposed
    # explicitly or the browser hides it from cross-origin JS.
    expose_headers=["X-Source-Health"],
)


# ── Global exception handler ──────────────────────────────────────────────────
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Log the real error server-side; return a generic body so stack traces,
    file paths, and upstream details never reach the client."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})


def _json_safe(obj):
    """Replace non-finite floats (NaN/Infinity) with their string form so a body
    can be serialized. json.dumps rejects them outright (→ 500)."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else str(obj)
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    return obj


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Return a clean 422 for invalid input. The default handler echoes the
    submitted `input` back, and a non-finite float there (e.g. temperature=NaN)
    makes the JSON render raise → an unhelpful 500. Sanitize it first."""
    return JSONResponse(status_code=422, content={"detail": _json_safe(jsonable_encoder(exc.errors()))})


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
app.include_router(ignition.router)
