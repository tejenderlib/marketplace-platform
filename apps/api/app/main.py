from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.addresses import router as addresses_router
from app.api.v1.admin import router as admin_router
from app.api.v1.auctions import router as auctions_router
from app.api.v1.auth import router as auth_router
from app.api.v1.catalog import router as catalog_router
from app.api.v1.checkout import router as checkout_router
from app.api.v1.health import router as health_router
from app.api.v1.offers import router as offers_router
from app.api.v1.offers import seller_router as seller_offers_router
from app.api.v1.orders import router as orders_router
from app.core.config import get_settings


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    openapi_url="/api/v1/openapi.json",
    docs_url="/docs",
    redoc_url=None,
)

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
app.include_router(health_router, prefix="/api/v1")
