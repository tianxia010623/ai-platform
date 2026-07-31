from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import auth, avatars, chat, feedback, mastery
from core.config import settings
from core.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
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


@app.get("/api/health")
async def health():
    return {"status": "ok"}
