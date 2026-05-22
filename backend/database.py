from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, DeclarativeBase
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Production: set DATABASE_URL env var to your Neon/PostgreSQL connection string
#   e.g. postgresql+asyncpg://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
# Development: falls back to local SQLite
_raw_url = os.environ.get("DATABASE_URL", "")
if _raw_url:
    # Render sometimes gives postgres:// — fix to postgresql+asyncpg://
    DATABASE_URL = _raw_url.replace("postgres://", "postgresql+asyncpg://", 1)
    if not DATABASE_URL.startswith("postgresql+asyncpg"):
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
else:
    DATABASE_URL = f"sqlite+aiosqlite:///{os.path.join(BASE_DIR, 'poc_finder.db')}"

_is_sqlite = DATABASE_URL.startswith("sqlite")

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    # SQLite needs check_same_thread=False; PostgreSQL doesn't support it
    **({} if not _is_sqlite else {"connect_args": {"check_same_thread": False}}),
)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    from models import Lead, Contact, Qualification, Settings, User, DailyUsage  # noqa
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Bootstrap JWT secret — persist it so tokens survive server restarts
    import secrets as _secrets
    import auth_utils
    async with AsyncSessionLocal() as session:
        from sqlalchemy import select
        from models import Settings
        res = await session.execute(select(Settings).where(Settings.key == "JWT_SECRET"))
        row = res.scalar_one_or_none()
        if row:
            auth_utils.set_secret(row.value)
        else:
            new_secret = _secrets.token_hex(32)
            session.add(Settings(key="JWT_SECRET", value=new_secret))
            await session.commit()
            auth_utils.set_secret(new_secret)
