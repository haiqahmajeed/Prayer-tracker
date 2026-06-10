import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# Fail fast at startup if the env var is missing, not on first request
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is not set")

engine = create_engine(DATABASE_URL)

# autocommit=False: every write is inside an implicit transaction; you must call db.commit() explicitly
# autoflush=False: SQLAlchemy won't push pending changes to the DB before a query — behaviour is explicit
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency — yields one DB session per request, always closes it when done."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
