import os

# torch, scikit-learn and OpenBLAS size their thread pools from the *host's* CPU
# count, which on a shared container is dozens of threads fighting over a
# fraction of a core. Must be set before numpy/torch are imported, so it stays at
# the very top of the module. Overridable per-environment.
for _var in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_var, "2")

import logging  # noqa: E402 — must follow the thread caps above
import threading  # noqa: E402
import time  # noqa: E402
from contextlib import asynccontextmanager  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

from app.config import settings  # noqa: E402
from app.core import face as face_core, voice as voice_core  # noqa: E402
from app.routers import resume, interview, face, voice, proctor  # noqa: E402

# uvicorn only attaches handlers to its own loggers, and Railway shows nothing
# else — so warmup timings have to go out under uvicorn's to be visible there.
log = logging.getLogger("uvicorn.error")


def _warm_models() -> None:
    """Load the face/voice models once at boot.

    Left lazy, the first candidate to record pays ~47s on a laptop and minutes
    on a small container — far past the backend's 35s timeout, which surfaces as
    a bogus "couldn't read your voice" 422. Runs on its own thread so uvicorn
    binds the port immediately and Railway's health check doesn't time out.
    """
    for name, warm in (("face", face_core.warmup), ("voice", voice_core.warmup)):
        started = time.time()
        try:
            ok = warm()
        except Exception:  # a failed warmup must never stop the service booting
            log.exception("%s warmup crashed", name)
            continue
        log.info("%s warmup %s in %.1fs", name, "ok" if ok else "skipped", time.time() - started)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    threading.Thread(target=_warm_models, name="model-warmup", daemon=True).start()
    yield


app = FastAPI(
    title="IntivraBot AI Service",
    description="Resume ATS parsing & matching (Phase 3). Face/voice/interview added later.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def require_service_key(request, call_next):
    """Reject /api calls that do not carry the shared service key.

    This service holds the Gemini and Groq keys and runs the face, voice and
    vision models. Deployed with a public domain and nothing but CORS in front
    of it, anyone could call it directly with curl — CORS is enforced by
    browsers, not by the server — and spend the quota or run the models for
    free. /health and / stay open so Railway's health check still works.

    No key configured means no check, so local development and a deployment
    that has not set the variable yet both keep working.
    """
    if settings.service_key and request.url.path.startswith("/api"):
        if request.headers.get("x-service-key") != settings.service_key:
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)


app.include_router(resume.router, prefix="/api", tags=["resume"])
app.include_router(interview.router, prefix="/api", tags=["interview"])
app.include_router(face.router, prefix="/api", tags=["face"])
app.include_router(voice.router, prefix="/api", tags=["voice"])
app.include_router(proctor.router, prefix="/api", tags=["proctor"])


@app.get("/health")
def health():
    return {"status": "ok", "service": "intivrabot-ai", "version": app.version}


@app.get("/")
def root():
    return {
        "service": "intivrabot-ai",
        "endpoints": [
            "/health",
            "/api/parse-resume",
            "/api/match",
            "/api/interview/question",
            "/api/interview/score",
            "/api/interview/summary",
        ],
    }
