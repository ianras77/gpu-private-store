from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from models import RevisionHistory


async def record_revision(
    db: AsyncSession,
    *,
    object_table: str,
    object_id: UUID,
    action: str,
    actor: str = "system",
    snapshot: dict | None = None,
) -> None:
    rev = RevisionHistory(
        object_table=object_table,
        object_id=object_id,
        action=action,
        actor=actor,
        snapshot=snapshot or {},
    )
    db.add(rev)
    await db.commit()
