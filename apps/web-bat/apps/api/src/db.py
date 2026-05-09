from collections.abc import AsyncGenerator, Awaitable, Callable
from typing import TypeVar

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from config import settings

_T = TypeVar("_T")

engine_kwargs: dict[str, object] = {"pool_pre_ping": True}
if not settings.database_url.startswith("sqlite"):
    engine_kwargs.update(
        pool_size=max(5, int(settings.database_pool_size)),
        max_overflow=max(0, int(settings.database_max_overflow)),
    )

engine = create_async_engine(settings.database_url, **engine_kwargs)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def run_with_new_session(callback: Callable[[AsyncSession], Awaitable[_T]]) -> _T:
    async with SessionLocal() as session:
        return await callback(session)
