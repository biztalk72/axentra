import os
from datetime import datetime, timezone
from sqlalchemy import create_engine, String, Integer, Float, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

def now():
    return datetime.now(timezone.utc).isoformat()

DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./axentra.db')
engine = create_engine(DATABASE_URL, connect_args={'check_same_thread': False} if DATABASE_URL.startswith('sqlite') else {}, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = 'users'
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(String(500))

class LoginSession(Base):
    __tablename__ = 'login_sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    expires_at: Mapped[str] = mapped_column(String(50))

class Asset(Base):
    __tablename__ = 'assets'
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    kind: Mapped[str] = mapped_column(String(50))
    line: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(30), default='running')
    cycle_time: Mapped[float] = mapped_column(Float)
    temperature: Mapped[float] = mapped_column(Float, default=45)
    vibration: Mapped[float] = mapped_column(Float, default=1)
    produced: Mapped[int] = mapped_column(Integer, default=0)
    rejected: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[str] = mapped_column(String(50), default=now)

class Telemetry(Base):
    __tablename__ = 'telemetry'
    __table_args__ = (UniqueConstraint('source', 'event_id'),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[str] = mapped_column(String(100))
    source: Mapped[str] = mapped_column(String(50))
    asset_id: Mapped[str] = mapped_column(ForeignKey('assets.id'), index=True)
    temperature: Mapped[float] = mapped_column(Float)
    vibration: Mapped[float] = mapped_column(Float)
    good: Mapped[int] = mapped_column(Integer)
    rejected: Mapped[int] = mapped_column(Integer)
    timestamp: Mapped[str] = mapped_column(String(50), index=True)

class Resource(Base):
    __tablename__ = 'resources'
    id: Mapped[str] = mapped_column(String(60), primary_key=True)
    category: Mapped[str] = mapped_column(String(30), index=True)
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(40))
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[str] = mapped_column(String(50), default=now)

class Audit(Base):
    __tablename__ = 'audit_logs'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor: Mapped[str] = mapped_column(String(200))
    action: Mapped[str] = mapped_column(String(100))
    target: Mapped[str] = mapped_column(String(100))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[str] = mapped_column(String(50), default=now)

def get_db():
    with SessionLocal() as db:
        yield db
