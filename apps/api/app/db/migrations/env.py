from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import get_settings
from app.db.base import Base

# Import domain models so autogenerate / `alembic check` see full metadata.
import app.admin.models  # noqa: F401
import app.catalog.models  # noqa: F401
import app.identity.models  # noqa: F401
import app.messaging.models  # noqa: F401
import app.notifications.models  # noqa: F401
import app.orders.models  # noqa: F401
import app.reports.models  # noqa: F401
import app.reviews.models  # noqa: F401
import app.support.models  # noqa: F401
import app.trading.models  # noqa: F401


config = context.config
config.set_main_option("sqlalchemy.url", get_settings().database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Future model modules will be imported here before migration autogeneration.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
