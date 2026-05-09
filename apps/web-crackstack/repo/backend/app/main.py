from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db.migrate import run_migrations
from app.routes.agent import router as agent_router
from app.routes.datasets import router as datasets_router
from app.routes.previews import router as previews_router
from app.routes.templates import router as templates_router
from app.routes.transforms import router as transforms_router
from app.routes.users import router as users_router
from app.routes.workstreams import router as workstreams_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if os.getenv("CRACKSTACK_AUTO_MIGRATE_ON_STARTUP") == "1":
        run_migrations()
    yield


app = FastAPI(title="Crackstack API", lifespan=lifespan)
app.include_router(agent_router)
app.include_router(datasets_router)
app.include_router(templates_router)
app.include_router(transforms_router)
app.include_router(previews_router)
app.include_router(users_router)
app.include_router(workstreams_router)


@app.get("/health")
@app.get("/healthz")
def health() -> dict:
    return {"status": "ok"}
