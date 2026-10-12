import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import auth, avatars, chat, feedback, mastery, prompt_variants
from core.config import settings
from core.database import init_db
from services import rag_service

logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    rag_service.warmup_in_background()
    yield


app = FastAPI(title="AI Avatar Chat Platform", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(avatars.router)
app.include_router(chat.router)
app.include_router(mastery.router)
app.include_router(feedback.router)
app.include_router(prompt_variants.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "file_search": rag_service.model_status()}
