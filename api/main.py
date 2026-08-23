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

# Absolute path, so it loads no matter where uvicorn was started from.
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


def _rate_limit_exceeded(request: Request, exc: RateLimitExceeded) -> Response:
    return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Slow down."})


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Defensive headers on every response. HSTS only in production. From localhost
    it would pin the dev origin to HTTPS in the browser."""

    def __init__(self, app, is_prod: bool):
        super().__init__(app)
        self._is_prod = is_prod

    async def dispatch(self, request: Request, call_next):
        resp = await call_next(request)
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "no-referrer"
        resp.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
        # A JSON API has no business being framed or running scripts.
        resp.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        if self._is_prod:
            resp.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return resp


def _replay_receive(buffered: dict, real_receive):
    """Replay one already-read message, then hand back the real channel so the app
    downstream still sees things like http.disconnect."""
    sent = False

    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return buffered
        return await real_receive()

    return receive


class BodySizeLimitMiddleware:
    """Turn away oversized bodies before anything parses them.

    Raw ASGI so it can cap a streamed body with no Content-Length, counting bytes as
    they arrive. Sits inside CORS so the 413 still carries the right headers.
    """

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

        # Count as we read, in case there was no Content-Length.
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
    """Turn an unhandled route error into a 500 inside the CORS layer, so the response
    still carries Access-Control-Allow-Origin. Starlette's own error middleware sits
    outside CORS, so its 500 reaches the browser bare and reads as a CORS error.
    """

    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception:
            logger.exception("Unhandled error on %s %s", request.method, request.url.path)
            return JSONResponse(status_code=500, content={"detail": "Internal server error."})


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Refuse to boot a misconfigured production deploy. See startup_problems.
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
        "Backend for WatchFlame: live fire detections, regionally-calibrated "
        "fire-weather risk, weather, shelters, and disaster advisories."
    ),
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded)

# Order reads backwards, so the last one added ends up outermost. CORS goes last so
# its headers wrap everything, errors and 429s included, and exception handling
# goes first so its 500 travels back out through CORS on the way to the browser.
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
    # Without this the browser hides the feed-health header from cross-origin JS.
    expose_headers=["X-Source-Health"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Log what really happened and return something bland, so stack traces, file
    paths and upstream details never reach the client."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})


def _json_safe(obj):
    """Turn NaN and infinity into strings. json.dumps refuses them, which 500s."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else str(obj)
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    return obj


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """A clean 422 for bad input. The default handler echoes the submitted value
    back, so a NaN temperature makes the render raise and returns a useless 500."""
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
