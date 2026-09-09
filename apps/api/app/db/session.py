from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings


settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db_session():
    """Yield a transaction session for a future request dependency."""

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
