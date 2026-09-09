from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.db.session import engine


router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict[str, str]:
    """Report API readiness after confirming the database is reachable."""

    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is unavailable",
        ) from error

    settings = get_settings()
    return {"status": "ok", "environment": settings.environment}
