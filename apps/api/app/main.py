from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.addresses import router as addresses_router
from app.api.v1.admin import router as admin_router
from app.api.v1.auctions import router as auctions_router
from app.api.v1.auth import router as auth_router
from app.api.v1.catalog import router as catalog_router
from app.api.v1.checkout import router as checkout_router
from app.api.v1.health import router as health_router
from app.api.v1.messages import router as messages_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.offers import router as offers_router
from app.api.v1.offers import seller_router as seller_offers_router
from app.api.v1.orders import router as orders_router
from app.api.v1.profile import router as profile_router
from app.api.v1.reports import router as reports_router
from app.api.v1.reviews import router as reviews_router
from app.api.v1.support import router as support_router
from app.api.v1.ws import router as ws_router
from app.auctions.scheduler import scheduler as auction_scheduler
from app.core.config import get_settings
from app.core.security_http import install_security


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the in-process auction auto-close loop with the app."""

    auction_scheduler.start()
    yield
    auction_scheduler.stop()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    openapi_url="/api/v1/openapi.json" if settings.docs_enabled_effective else None,
    docs_url="/docs" if settings.docs_enabled_effective else None,
    redoc_url=None,
    lifespan=lifespan,
)

install_security(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

app.include_router(auth_router, prefix="/api/v1")
app.include_router(auctions_router, prefix="/api/v1")
app.include_router(catalog_router, prefix="/api/v1")
app.include_router(offers_router, prefix="/api/v1")
app.include_router(seller_offers_router, prefix="/api/v1")
app.include_router(addresses_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(checkout_router, prefix="/api/v1")
app.include_router(orders_router, prefix="/api/v1")
app.include_router(profile_router, prefix="/api/v1")
app.include_router(reviews_router, prefix="/api/v1")
app.include_router(notifications_router, prefix="/api/v1")
app.include_router(messages_router, prefix="/api/v1")
app.include_router(reports_router, prefix="/api/v1")
app.include_router(support_router, prefix="/api/v1")
app.include_router(ws_router)
app.include_router(health_router, prefix="/api/v1")
