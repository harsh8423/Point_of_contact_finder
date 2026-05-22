from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv

# Load .env before anything else reads os.getenv()
# On Render/production, real env vars override .env values (dotenv default)
load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from database import init_db
from routers import scrape, poc, qualify, export, settings
from routers import auth, admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="POC Finder API", version="1.0.0", lifespan=lifespan)


# ── Global 422 handler: flatten Pydantic errors into a human-readable string ──
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    # Pick the first error's message and clean it up
    if errors:
        first = errors[0]
        msg = first.get("msg", "Validation error")
        # Strip Pydantic's "Value error, " prefix
        if msg.lower().startswith("value error, "):
            msg = msg[13:]
    else:
        msg = "Invalid request data"
    return JSONResponse(status_code=422, content={"detail": msg})

# Allow localhost + any deployed Vercel frontend URL
_extra_origin = os.environ.get("FRONTEND_URL", "").rstrip("/")
_origins = ["http://localhost:3000","https://point-of-contact-finder.vercel.app"]
if _extra_origin:
    _origins.append(_extra_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(scrape.router, prefix="/api")
app.include_router(poc.router, prefix="/api")
app.include_router(qualify.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(settings.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
