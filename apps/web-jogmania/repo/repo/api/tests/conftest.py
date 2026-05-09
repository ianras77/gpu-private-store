import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.db import Base
from app.deps import get_db


@pytest.fixture(scope="session")
def db_engine():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture(scope="function")
def db_session(db_engine):
    Base.metadata.drop_all(bind=db_engine)
    Base.metadata.create_all(bind=db_engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope="function")
def client(db_engine, monkeypatch):
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db_engine)

    def override_get_db():
        session = SessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db

    # Disable rate limiting for tests
    from app.services import rate_limit as rate_limit_module
    from app.api.routes import auth as auth_routes
    monkeypatch.setattr(rate_limit_module, "rate_limit", lambda *args, **kwargs: True)
    monkeypatch.setattr(auth_routes, "rate_limit", lambda *args, **kwargs: True)

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
