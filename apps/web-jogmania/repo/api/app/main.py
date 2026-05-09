from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.settings import get_settings
from app.s3_client import ensure_bucket
from app.routers import health, auth, runs, quests, loot, exports, users, courses

settings = get_settings()

app = FastAPI(title="Jogmania API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(courses.router)
app.include_router(runs.router)
app.include_router(quests.router)
app.include_router(loot.router)
app.include_router(exports.router)


@app.on_event("startup")
def on_startup():
    ensure_bucket()
