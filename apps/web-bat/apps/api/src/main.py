from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routes import admin, analysis, editorial, health, homepage, social, sources, themes, trends, voice_memory

app = FastAPI(
    title=f"{settings.app_name} API",
    version="0.1.0",
    description="Editorial orchestration API for BlondesAgainstTrump satirical commentary system.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_prefix = "/api/v1"
app.include_router(health.router, prefix=api_prefix)
app.include_router(sources.router, prefix=api_prefix)
app.include_router(themes.router, prefix=api_prefix)
app.include_router(trends.router, prefix=api_prefix)
app.include_router(analysis.router, prefix=api_prefix)
app.include_router(editorial.router, prefix=api_prefix)
app.include_router(homepage.router, prefix=api_prefix)
app.include_router(social.router, prefix=api_prefix)
app.include_router(voice_memory.router, prefix=api_prefix)
app.include_router(admin.router, prefix=api_prefix)


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "service": settings.app_name,
        "message": "Satirical editorial orchestration API",
        "disclosure": "This system is for satire/commentary grounded in linked sources.",
    }
