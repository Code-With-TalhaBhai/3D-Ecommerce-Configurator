from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import get_settings


def _to_asyncpg_url(url: str) -> str:
    """Adapt the Prisma-authored DATABASE_URL for asyncpg.

    DATABASE_URL is written for Prisma's pgbouncer transaction-pooling mode
    (`pgbouncer=true&connection_limit=1`) — asyncpg doesn't recognize those
    query params, and pgbouncer's transaction mode can't hold asyncpg's
    server-side prepared statements across queries anyway, so both are
    stripped/disabled here rather than passed through.
    """
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    query.pop("pgbouncer", None)
    query.pop("connection_limit", None)
    return urlunsplit(("postgresql+asyncpg", parts.netloc, parts.path, urlencode(query), parts.fragment))


settings = get_settings()

engine = create_async_engine(
    _to_asyncpg_url(settings.database_url),
    poolclass=NullPool,
    connect_args={"statement_cache_size": 0},
)

async_session = async_sessionmaker(engine, expire_on_commit=False)
