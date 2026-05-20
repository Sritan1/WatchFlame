from contextlib import asynccontextmanager
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Always load api/.env regardless of CWD or how uvicorn is launched.
load_dotenv(Path(__file__).parent / ".env")

from .routes import (  # noqa: E402  (must come after load_dotenv)
    disasters,
    fires,
    geocode,
    incidents,
    risk,
    shelters,
    weather,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="Wildfire API",
    version="0.2.0",
    description=(
        "Backend for the wildfire mobile app: fires, risk scoring, weather. "
        "Risk algorithm V2 (multiplicative VPD-based fire weather index)."
    ),
    lifespan=lifespan,
)

origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz():
    return {"ok": True}


app.include_router(fires.router)
app.include_router(risk.router)
app.include_router(weather.router)
app.include_router(geocode.router)
app.include_router(shelters.router)
app.include_router(incidents.router)
app.include_router(disasters.router)
