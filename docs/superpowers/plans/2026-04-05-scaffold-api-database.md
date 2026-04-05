# Plan 1: Project Scaffold + Database + API Skeleton

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a deployable `quant-agent-backend` repo with FastAPI, PostgreSQL/pgvector, Redis, SSE infrastructure, and all API route stubs — ready to receive LangGraph graphs in Plans 2-4.

**Architecture:** FastAPI async app with SQLAlchemy async ORM + pgvector for the document/embedding store, Redis for SSE pub-sub and job coordination, and a docker-compose for local dev. Routes are stubs that return correct shapes but don't run real graph logic yet.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0 (async), pgvector, Redis (via redis-py), Pydantic v2, structlog, UV, Docker, pytest + pytest-asyncio + httpx

**New repo location:** `~/Documents/Projects/quant-agent-backend`

---

## File Structure

```
quant-agent-backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app factory, middleware, lifespan
│   ├── config.py             # Pydantic Settings from env
│   ├── dependencies.py       # DI: db session, redis, SSE bus
│   ├── logging.py            # structlog config
│   └── routes/
│       ├── __init__.py
│       ├── health.py         # GET /health
│       ├── analysis.py       # POST /analyze/{symbol}
│       ├── stream.py         # GET /stream/{job_id}, POST /stream/{job_id}/resume
│       ├── discovery.py      # POST /discover
│       └── sources.py        # GET /sources/{symbol}/summary
├── db/
│   ├── __init__.py
│   ├── models.py             # SQLAlchemy models: documents, chunks, source_runs, jobs
│   └── session.py            # async engine + session factory
├── sse/
│   ├── __init__.py
│   └── bus.py                # Redis pub-sub wrapper for SSE events
├── models/
│   ├── __init__.py
│   ├── common.py             # Shared Pydantic: ScannerSignals, JobStatus
│   └── events.py             # SSE event Pydantic models
├── tests/
│   ├── __init__.py
│   ├── test_routes/
│   │   ├── __init__.py
│   │   ├── test_health.py
│   │   ├── test_analysis.py
│   │   ├── test_stream.py
│   │   ├── test_discovery.py
│   │   └── test_sources.py
│   └── test_sse/
│       ├── __init__.py
│       └── test_bus.py
├── alembic/
│   ├── env.py
│   └── versions/
├── alembic.ini
├── Dockerfile
├── docker-compose.yml
├── pyproject.toml
├── .github/
│   └── workflows/
│       └── ci.yml
└── CLAUDE.md
```

---

### Task 1: Repository Initialization

**Files:**
- Create: `pyproject.toml`
- Create: `CLAUDE.md`
- Create: `.gitignore`
- Create: `.python-version`

- [ ] **Step 1: Create the repo directory and initialize git**

```bash
mkdir -p ~/Documents/Projects/quant-agent-backend
cd ~/Documents/Projects/quant-agent-backend
git init
```

- [ ] **Step 2: Create .python-version**

```
3.12
```

- [ ] **Step 3: Create .gitignore**

```gitignore
__pycache__/
*.py[cod]
*.egg-info/
dist/
.venv/
.env
.mypy_cache/
.pytest_cache/
.ruff_cache/
*.db
```

- [ ] **Step 4: Create pyproject.toml**

```toml
[project]
name = "quant-agent-backend"
version = "0.1.0"
description = "LangGraph agent backend for quantitative volatility analysis"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.34.0",
    "pydantic>=2.10.0",
    "pydantic-settings>=2.7.0",
    "sqlalchemy[asyncio]>=2.0.36",
    "asyncpg>=0.30.0",
    "pgvector>=0.3.6",
    "redis>=5.2.0",
    "httpx>=0.28.0",
    "structlog>=24.4.0",
    "anthropic>=0.42.0",
    "langgraph>=0.3.0",
    "alembic>=1.14.0",
]

[dependency-groups]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.25.0",
    "httpx>=0.28.0",
    "respx>=0.22.0",
    "ruff>=0.8.0",
]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.ruff]
target-version = "py312"
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "N", "UP"]
```

- [ ] **Step 5: Create CLAUDE.md**

```markdown
# Quant Agent Backend

## Project

LangGraph agent backend for quantitative volatility analysis. Separate repo from the Next.js frontend (quant-agent-service).

## Code Standards

- Python 3.12+, type hints everywhere, Pydantic v2 for all I/O
- UV for dependency management
- Async by default (FastAPI + httpx + asyncio)
- No print statements — use structlog
- Tests: pytest + pytest-asyncio + httpx
- Separate pure computation from LLM interpretation

## Commands

- `uv run pytest` — run tests
- `uv run ruff check .` — lint
- `uv run ruff format .` — format
- `uv run uvicorn app.main:app --reload` — dev server
- `docker compose up` — full local stack (postgres, redis, app)

## Workflow

- TDD: write failing test → implement → verify pass → commit
- Run /simplify before committing
```

- [ ] **Step 6: Install dependencies with UV**

```bash
cd ~/Documents/Projects/quant-agent-backend
uv sync
```

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "chore: initialize repo with pyproject.toml and UV"
```

---

### Task 2: structlog Configuration

**Files:**
- Create: `app/__init__.py`
- Create: `app/logging.py`
- Test: `tests/test_logging.py`

- [ ] **Step 1: Create app package**

`app/__init__.py`:
```python
```

`tests/__init__.py`:
```python
```

- [ ] **Step 2: Write the failing test**

`tests/test_logging.py`:
```python
import structlog

from app.logging import setup_logging


def test_setup_logging_configures_structlog():
    setup_logging()
    logger = structlog.get_logger("test")
    # Should not raise — logger is configured and callable
    assert logger is not None


def test_setup_logging_json_in_production():
    setup_logging(json_logs=True)
    config = structlog.get_config()
    processor_names = [p.__name__ if hasattr(p, "__name__") else str(p) for p in config["processors"]]
    # JSON renderer should be in the chain
    assert any("JSON" in name or "json" in name.lower() for name in processor_names)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_logging.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.logging'`

- [ ] **Step 4: Implement**

`app/logging.py`:
```python
import structlog


def setup_logging(json_logs: bool = False) -> None:
    """Configure structlog for the application."""
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if json_logs:
        shared_processors.append(structlog.processors.JSONRenderer())
    else:
        shared_processors.append(structlog.dev.ConsoleRenderer())

    structlog.configure(
        processors=shared_processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_logging.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add app/__init__.py app/logging.py tests/__init__.py tests/test_logging.py
git commit -m "feat: add structlog configuration"
```

---

### Task 3: Pydantic Settings Configuration

**Files:**
- Create: `app/config.py`
- Test: `tests/test_config.py`

- [ ] **Step 1: Write the failing test**

`tests/test_config.py`:
```python
from app.config import Settings


def test_settings_defaults():
    settings = Settings(
        database_url="postgresql+asyncpg://user:pass@localhost:5432/test",
        redis_url="redis://localhost:6379/0",
    )
    assert settings.app_name == "quant-agent-backend"
    assert settings.debug is False
    assert settings.cors_origins == ["http://localhost:3000"]
    assert settings.anthropic_api_key is None


def test_settings_from_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@db:5432/prod")
    monkeypatch.setenv("REDIS_URL", "redis://redis:6379/0")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-123")
    monkeypatch.setenv("CORS_ORIGINS", '["https://my-app.vercel.app"]')
    monkeypatch.setenv("DEBUG", "true")

    settings = Settings()
    assert settings.database_url == "postgresql+asyncpg://u:p@db:5432/prod"
    assert settings.redis_url == "redis://redis:6379/0"
    assert settings.anthropic_api_key == "sk-test-123"
    assert settings.cors_origins == ["https://my-app.vercel.app"]
    assert settings.debug is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.config'`

- [ ] **Step 3: Implement**

`app/config.py`:
```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    app_name: str = "quant-agent-backend"
    debug: bool = False

    # Database
    database_url: str

    # Redis
    redis_url: str

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]

    # Anthropic
    anthropic_api_key: str | None = None

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_config.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add app/config.py tests/test_config.py
git commit -m "feat: add Pydantic settings configuration"
```

---

### Task 4: Database Models + Session Factory

**Files:**
- Create: `db/__init__.py`
- Create: `db/models.py`
- Create: `db/session.py`
- Test: `tests/test_db_models.py`

- [ ] **Step 1: Write the failing test**

`tests/test_db_models.py`:
```python
from datetime import datetime
from uuid import uuid4

from db.models import Document, Chunk, SourceRun, Job


def test_document_model_fields():
    doc = Document(
        id=uuid4(),
        source_type="earnings",
        ticker="AAPL",
        published_at=datetime(2026, 4, 1),
        title="AAPL Q1 2026 Earnings Call",
        url="https://example.com/aapl-q1",
        raw_text="Revenue grew 12% year over year...",
    )
    assert doc.source_type == "earnings"
    assert doc.ticker == "AAPL"
    assert doc.title == "AAPL Q1 2026 Earnings Call"


def test_chunk_model_fields():
    doc_id = uuid4()
    chunk = Chunk(
        id=uuid4(),
        document_id=doc_id,
        chunk_text="Revenue grew 12% year over year",
        embedding=[0.1] * 1024,
        chunk_index=0,
    )
    assert chunk.document_id == doc_id
    assert chunk.chunk_index == 0
    assert len(chunk.embedding) == 1024


def test_source_run_model_fields():
    run = SourceRun(
        id=uuid4(),
        run_id="discovery-run-001",
        source_type="news",
        status="completed",
        documents_found=5,
        errors=None,
        completed_at=datetime(2026, 4, 5, 12, 0, 0),
    )
    assert run.status == "completed"
    assert run.documents_found == 5


def test_job_model_fields():
    job = Job(
        id=uuid4(),
        job_id="job-abc-123",
        symbol="TSLA",
        status="running",
        created_at=datetime(2026, 4, 5, 12, 0, 0),
    )
    assert job.symbol == "TSLA"
    assert job.status == "running"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_db_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'db'`

- [ ] **Step 3: Implement models**

`db/__init__.py`:
```python
```

`db/models.py`:
```python
from datetime import datetime
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import String, Text, DateTime, Integer
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    source_type: Mapped[str] = mapped_column(String(50))
    ticker: Mapped[str] = mapped_column(String(10), index=True)
    published_at: Mapped[datetime] = mapped_column(DateTime)
    title: Mapped[str] = mapped_column(String(500))
    url: Mapped[str] = mapped_column(String(2000))
    raw_text: Mapped[str] = mapped_column(Text)


class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(index=True)
    chunk_text: Mapped[str] = mapped_column(Text)
    embedding = mapped_column(Vector(1024))
    chunk_index: Mapped[int] = mapped_column(Integer)


class SourceRun(Base):
    __tablename__ = "source_runs"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    run_id: Mapped[str] = mapped_column(String(100), index=True)
    source_type: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20))
    documents_found: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    job_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    symbol: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_db_models.py -v`
Expected: PASS

- [ ] **Step 5: Implement session factory**

`db/session.py`:
```python
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


def create_session_factory(database_url: str) -> async_sessionmaker[AsyncSession]:
    """Create an async session factory for the given database URL."""
    engine = create_async_engine(database_url, echo=False)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session(
    factory: async_sessionmaker[AsyncSession],
) -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session."""
    async with factory() as session:
        yield session
```

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add db/ tests/test_db_models.py
git commit -m "feat: add SQLAlchemy models and async session factory"
```

---

### Task 5: Alembic Migration Setup

**Files:**
- Create: `alembic.ini`
- Create: `alembic/env.py`
- Create: `alembic/versions/` (directory)

- [ ] **Step 1: Initialize alembic**

```bash
cd ~/Documents/Projects/quant-agent-backend
uv run alembic init alembic
```

- [ ] **Step 2: Replace alembic/env.py with async version**

`alembic/env.py`:
```python
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from db.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = create_async_engine(
        config.get_main_option("sqlalchemy.url"),
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

- [ ] **Step 3: Update alembic.ini sqlalchemy.url**

In `alembic.ini`, set:
```ini
sqlalchemy.url = postgresql+asyncpg://postgres:postgres@localhost:5432/quant_agent
```

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add alembic.ini alembic/
git commit -m "feat: add Alembic async migration setup"
```

---

### Task 6: Shared Pydantic Models + SSE Event Types

**Files:**
- Create: `models/__init__.py`
- Create: `models/common.py`
- Create: `models/events.py`
- Test: `tests/test_models.py`

- [ ] **Step 1: Write the failing test**

`tests/test_models.py`:
```python
import json

from models.common import ScannerSignals, JobResponse, JobStatus
from models.events import SSEEvent, PhaseEvent, CheckpointEvent, StreamEvent, DoneEvent


def test_scanner_signals():
    signals = ScannerSignals(
        iv_percentile=0.85,
        skew_kurtosis=0.6,
        dealer_gamma=-0.3,
        term_structure=0.9,
        vanna=0.7,
        charm=0.4,
        composite=0.72,
    )
    assert signals.composite == 0.72


def test_job_response():
    resp = JobResponse(job_id="job-123")
    assert resp.job_id == "job-123"


def test_job_status():
    status = JobStatus(job_id="job-123", status="running", symbol="AAPL")
    assert status.status == "running"


def test_phase_event_serializes():
    event = PhaseEvent(phase="vol_surface", status="complete", data={"regime": "backwardation"})
    sse = event.to_sse()
    assert sse.event == "phase"
    payload = json.loads(sse.data)
    assert payload["phase"] == "vol_surface"
    assert payload["data"]["regime"] == "backwardation"


def test_checkpoint_event_serializes():
    event = CheckpointEvent(checkpoint="vol_surface_review", message="Continue?")
    sse = event.to_sse()
    assert sse.event == "checkpoint"
    payload = json.loads(sse.data)
    assert payload["checkpoint"] == "vol_surface_review"


def test_stream_event_serializes():
    event = StreamEvent(phase="synthesis", token="The")
    sse = event.to_sse()
    assert sse.event == "stream"
    payload = json.loads(sse.data)
    assert payload["token"] == "The"


def test_done_event_serializes():
    event = DoneEvent(job_id="job-123", total_time=47.2)
    sse = event.to_sse()
    assert sse.event == "done"
    payload = json.loads(sse.data)
    assert payload["total_time"] == 47.2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'models'`

- [ ] **Step 3: Implement common models**

`models/__init__.py`:
```python
```

`models/common.py`:
```python
from pydantic import BaseModel


class ScannerSignals(BaseModel):
    """Scanner scores passed from the frontend."""

    iv_percentile: float
    skew_kurtosis: float
    dealer_gamma: float
    term_structure: float
    vanna: float
    charm: float
    composite: float


class JobResponse(BaseModel):
    """Returned when a job is created."""

    job_id: str


class JobStatus(BaseModel):
    """Current status of a job."""

    job_id: str
    status: str
    symbol: str
```

- [ ] **Step 4: Implement SSE event models**

`models/events.py`:
```python
import json
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel


@dataclass
class SSEMessage:
    """Raw SSE message ready to send over the wire."""

    event: str
    data: str


class PhaseEvent(BaseModel):
    """A graph node started or completed."""

    phase: str
    status: str
    data: dict[str, Any] | None = None

    def to_sse(self) -> SSEMessage:
        return SSEMessage(event="phase", data=self.model_dump_json())


class CheckpointEvent(BaseModel):
    """Graph paused at a human-in-the-loop checkpoint."""

    checkpoint: str
    message: str

    def to_sse(self) -> SSEMessage:
        return SSEMessage(event="checkpoint", data=self.model_dump_json())


class StreamEvent(BaseModel):
    """Token-by-token LLM streaming output."""

    phase: str
    token: str

    def to_sse(self) -> SSEMessage:
        return SSEMessage(event="stream", data=self.model_dump_json())


class DoneEvent(BaseModel):
    """Workflow completed."""

    job_id: str
    total_time: float

    def to_sse(self) -> SSEMessage:
        return SSEMessage(event="done", data=self.model_dump_json())


class ErrorEvent(BaseModel):
    """Node or graph-level error."""

    phase: str | None = None
    error: str

    def to_sse(self) -> SSEMessage:
        return SSEMessage(event="error", data=self.model_dump_json())
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_models.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add models/ tests/test_models.py
git commit -m "feat: add Pydantic models for API and SSE events"
```

---

### Task 7: Redis SSE Bus

**Files:**
- Create: `sse/__init__.py`
- Create: `sse/bus.py`
- Test: `tests/test_sse/__init__.py`
- Test: `tests/test_sse/test_bus.py`

- [ ] **Step 1: Write the failing test**

The SSE bus wraps Redis pub-sub. For unit tests we use a fake that implements the same interface — no real Redis needed.

`tests/test_sse/__init__.py`:
```python
```

`tests/test_sse/test_bus.py`:
```python
import asyncio
import pytest

from models.events import PhaseEvent, DoneEvent
from sse.bus import SSEBus, InMemorySSEBus


@pytest.fixture
def bus() -> InMemorySSEBus:
    return InMemorySSEBus()


async def test_publish_and_subscribe(bus: InMemorySSEBus):
    job_id = "job-123"
    received: list = []

    async def collect():
        async for msg in bus.subscribe(job_id):
            received.append(msg)
            if msg.event == "done":
                break

    task = asyncio.create_task(collect())

    # Small delay to let subscriber start
    await asyncio.sleep(0.01)

    event1 = PhaseEvent(phase="vol_surface", status="complete")
    event2 = DoneEvent(job_id=job_id, total_time=1.5)
    await bus.publish(job_id, event1.to_sse())
    await bus.publish(job_id, event2.to_sse())

    await asyncio.wait_for(task, timeout=2.0)

    assert len(received) == 2
    assert received[0].event == "phase"
    assert received[1].event == "done"


async def test_subscribe_only_receives_own_job(bus: InMemorySSEBus):
    received: list = []

    async def collect():
        async for msg in bus.subscribe("job-A"):
            received.append(msg)
            if msg.event == "done":
                break

    task = asyncio.create_task(collect())
    await asyncio.sleep(0.01)

    # Publish to different job — should not be received
    await bus.publish("job-B", PhaseEvent(phase="x", status="complete").to_sse())

    # Publish to our job
    await bus.publish("job-A", DoneEvent(job_id="job-A", total_time=1.0).to_sse())

    await asyncio.wait_for(task, timeout=2.0)

    assert len(received) == 1
    assert received[0].event == "done"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_sse/test_bus.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sse'`

- [ ] **Step 3: Implement SSE bus**

`sse/__init__.py`:
```python
```

`sse/bus.py`:
```python
import asyncio
import json
from abc import ABC, abstractmethod
from collections import defaultdict
from collections.abc import AsyncGenerator

import redis.asyncio as redis

from models.events import SSEMessage


class SSEBus(ABC):
    """Abstract interface for SSE event pub-sub."""

    @abstractmethod
    async def publish(self, job_id: str, message: SSEMessage) -> None: ...

    @abstractmethod
    async def subscribe(self, job_id: str) -> AsyncGenerator[SSEMessage, None]: ...


class RedisSSEBus(SSEBus):
    """Redis-backed SSE pub-sub for production."""

    def __init__(self, redis_client: redis.Redis) -> None:
        self._redis = redis_client

    def _channel(self, job_id: str) -> str:
        return f"sse:{job_id}"

    async def publish(self, job_id: str, message: SSEMessage) -> None:
        payload = json.dumps({"event": message.event, "data": message.data})
        await self._redis.publish(self._channel(job_id), payload)

    async def subscribe(self, job_id: str) -> AsyncGenerator[SSEMessage, None]:
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(self._channel(job_id))
        try:
            async for raw in pubsub.listen():
                if raw["type"] != "message":
                    continue
                parsed = json.loads(raw["data"])
                yield SSEMessage(event=parsed["event"], data=parsed["data"])
        finally:
            await pubsub.unsubscribe(self._channel(job_id))


class InMemorySSEBus(SSEBus):
    """In-memory SSE bus for testing. No Redis dependency."""

    def __init__(self) -> None:
        self._queues: dict[str, list[asyncio.Queue[SSEMessage]]] = defaultdict(list)

    async def publish(self, job_id: str, message: SSEMessage) -> None:
        for queue in self._queues[job_id]:
            await queue.put(message)

    async def subscribe(self, job_id: str) -> AsyncGenerator[SSEMessage, None]:
        queue: asyncio.Queue[SSEMessage] = asyncio.Queue()
        self._queues[job_id].append(queue)
        try:
            while True:
                msg = await queue.get()
                yield msg
        finally:
            self._queues[job_id].remove(queue)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_sse/test_bus.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add sse/ tests/test_sse/
git commit -m "feat: add SSE bus with Redis and in-memory implementations"
```

---

### Task 8: FastAPI App + Health Route

**Files:**
- Create: `app/main.py`
- Create: `app/dependencies.py`
- Create: `app/routes/__init__.py`
- Create: `app/routes/health.py`
- Create: `tests/test_routes/__init__.py`
- Test: `tests/test_routes/test_health.py`

- [ ] **Step 1: Write the failing test**

`tests/test_routes/__init__.py`:
```python
```

`tests/test_routes/test_health.py`:
```python
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_health_returns_ok(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_routes/test_health.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.main'` or `ImportError`

- [ ] **Step 3: Implement health route**

`app/routes/__init__.py`:
```python
```

`app/routes/health.py`:
```python
from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}
```

- [ ] **Step 4: Implement app factory and dependencies**

`app/dependencies.py`:
```python
from app.config import Settings

_settings: Settings | None = None


def get_settings() -> Settings:
    """Return cached settings instance."""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def override_settings(settings: Settings) -> None:
    """Override settings for testing."""
    global _settings
    _settings = settings
```

`app/main.py`:
```python
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.logging import setup_logging
from app.routes import health


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    setup_logging()
    yield


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="Quant Agent Backend",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)

    return app


app = create_app()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_routes/test_health.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add app/main.py app/dependencies.py app/routes/ tests/test_routes/
git commit -m "feat: add FastAPI app factory and health endpoint"
```

---

### Task 9: Analysis Route (Stub)

**Files:**
- Create: `app/routes/analysis.py`
- Modify: `app/main.py` — add router include
- Test: `tests/test_routes/test_analysis.py`

- [ ] **Step 1: Write the failing test**

`tests/test_routes/test_analysis.py`:
```python
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_analyze_returns_job_id(client):
    resp = await client.post(
        "/analyze/AAPL",
        json={
            "scanner_signals": {
                "iv_percentile": 0.85,
                "skew_kurtosis": 0.6,
                "dealer_gamma": -0.3,
                "term_structure": 0.9,
                "vanna": 0.7,
                "charm": 0.4,
                "composite": 0.72,
            },
            "auto_run": False,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "job_id" in data
    assert isinstance(data["job_id"], str)
    assert len(data["job_id"]) > 0


async def test_analyze_auto_run_default_false(client):
    resp = await client.post(
        "/analyze/TSLA",
        json={
            "scanner_signals": {
                "iv_percentile": 0.5,
                "skew_kurtosis": 0.5,
                "dealer_gamma": 0.0,
                "term_structure": 0.5,
                "vanna": 0.5,
                "charm": 0.5,
                "composite": 0.5,
            },
        },
    )
    assert resp.status_code == 200
    assert "job_id" in resp.json()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_routes/test_analysis.py -v`
Expected: FAIL — 404 (route not registered)

- [ ] **Step 3: Implement analysis route**

`app/routes/analysis.py`:
```python
from uuid import uuid4

from fastapi import APIRouter
from pydantic import BaseModel

from models.common import ScannerSignals, JobResponse

router = APIRouter()


class AnalyzeRequest(BaseModel):
    scanner_signals: ScannerSignals
    auto_run: bool = False


@router.post("/analyze/{symbol}")
async def analyze(symbol: str, request: AnalyzeRequest) -> JobResponse:
    """Kick off the orchestrator graph for a symbol.

    Stub: creates a job ID but does not run the graph yet.
    Graph execution will be wired in Plan 3/4.
    """
    job_id = f"job-{uuid4().hex[:12]}"
    return JobResponse(job_id=job_id)
```

- [ ] **Step 4: Register router in app/main.py**

Add to `app/main.py` imports and router registration:

```python
from app.routes import health, analysis
```

```python
    app.include_router(analysis.router)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_routes/test_analysis.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add app/routes/analysis.py app/main.py tests/test_routes/test_analysis.py
git commit -m "feat: add analysis route stub (POST /analyze/{symbol})"
```

---

### Task 10: Stream Route (SSE Endpoint + Resume)

**Files:**
- Create: `app/routes/stream.py`
- Modify: `app/main.py` — add router include
- Test: `tests/test_routes/test_stream.py`

- [ ] **Step 1: Write the failing test**

`tests/test_routes/test_stream.py`:
```python
import asyncio
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app
from models.events import PhaseEvent, DoneEvent
from sse.bus import InMemorySSEBus


@pytest.fixture
def bus():
    return InMemorySSEBus()


@pytest.fixture
def app(bus):
    application = create_app()
    # Override the SSE bus dependency
    application.state.sse_bus = bus
    return application


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_stream_receives_sse_events(client, bus):
    job_id = "job-test-001"

    async def publish_events():
        await asyncio.sleep(0.05)
        await bus.publish(job_id, PhaseEvent(phase="vol_surface", status="complete").to_sse())
        await bus.publish(job_id, DoneEvent(job_id=job_id, total_time=1.0).to_sse())

    asyncio.create_task(publish_events())

    resp = await client.get(f"/stream/{job_id}", timeout=5.0)
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]

    # Parse SSE lines
    lines = resp.text.strip().split("\n")
    events = [l for l in lines if l.startswith("event:")]
    assert len(events) >= 2
    assert "event: phase" in events[0]
    assert "event: done" in events[1]


async def test_resume_checkpoint(client):
    job_id = "job-test-002"
    resp = await client.post(
        f"/stream/{job_id}/resume",
        json={"checkpoint": "vol_surface_review", "user_input": {"proceed": True}},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "resumed"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_routes/test_stream.py -v`
Expected: FAIL — 404 (route not registered)

- [ ] **Step 3: Implement stream route**

`app/routes/stream.py`:
```python
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from sse.bus import SSEBus

router = APIRouter()


class ResumeRequest(BaseModel):
    checkpoint: str
    user_input: dict[str, Any] | None = None


def _get_bus(request: Request) -> SSEBus:
    return request.app.state.sse_bus


@router.get("/stream/{job_id}")
async def stream(job_id: str, request: Request) -> StreamingResponse:
    """SSE endpoint that streams graph events for a job."""
    bus = _get_bus(request)

    async def event_generator():
        async for msg in bus.subscribe(job_id):
            yield f"event: {msg.event}\ndata: {msg.data}\n\n"
            if msg.event == "done" or msg.event == "error":
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/stream/{job_id}/resume")
async def resume(job_id: str, request_body: ResumeRequest) -> dict:
    """Resume a graph from a checkpoint.

    Stub: acknowledges the resume but does not trigger graph execution yet.
    Will be wired to LangGraph checkpoint resume in Plan 3/4.
    """
    return {
        "status": "resumed",
        "job_id": job_id,
        "checkpoint": request_body.checkpoint,
    }
```

- [ ] **Step 4: Register router and set default bus in app/main.py**

Update `app/main.py`:

Import additions:
```python
from app.routes import health, analysis, stream
from sse.bus import InMemorySSEBus
```

In `lifespan`, before `yield`:
```python
    app.state.sse_bus = InMemorySSEBus()
```

Router registration:
```python
    app.include_router(stream.router)
```

Full updated `app/main.py`:
```python
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.logging import setup_logging
from app.routes import analysis, health, stream
from sse.bus import InMemorySSEBus


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    setup_logging()
    app.state.sse_bus = InMemorySSEBus()
    yield


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="Quant Agent Backend",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(analysis.router)
    app.include_router(stream.router)

    return app


app = create_app()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_routes/test_stream.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add app/routes/stream.py app/main.py tests/test_routes/test_stream.py
git commit -m "feat: add SSE stream and resume endpoints"
```

---

### Task 11: Discovery Route (Stub)

**Files:**
- Create: `app/routes/discovery.py`
- Modify: `app/main.py` — add router include
- Test: `tests/test_routes/test_discovery.py`

- [ ] **Step 1: Write the failing test**

`tests/test_routes/test_discovery.py`:
```python
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_discover_returns_run_id(client):
    resp = await client.post(
        "/discover",
        json={
            "target_tickers": ["AAPL", "TSLA"],
            "source_types": ["earnings", "news"],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "run_id" in data


async def test_discover_all_defaults(client):
    resp = await client.post("/discover", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert "run_id" in data
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_routes/test_discovery.py -v`
Expected: FAIL — 404

- [ ] **Step 3: Implement discovery route**

`app/routes/discovery.py`:
```python
from uuid import uuid4

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class DiscoverRequest(BaseModel):
    target_tickers: list[str] | None = None
    source_types: list[str] | None = None


class DiscoverResponse(BaseModel):
    run_id: str


@router.post("/discover")
async def discover(request: DiscoverRequest) -> DiscoverResponse:
    """Manually trigger the resource discovery graph.

    Stub: creates a run ID but does not execute the graph yet.
    Will be wired in Plan 2.
    """
    run_id = f"discovery-{uuid4().hex[:12]}"
    return DiscoverResponse(run_id=run_id)
```

- [ ] **Step 4: Register router in app/main.py**

Add import and include:
```python
from app.routes import analysis, discovery, health, stream
```
```python
    app.include_router(discovery.router)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_routes/test_discovery.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add app/routes/discovery.py app/main.py tests/test_routes/test_discovery.py
git commit -m "feat: add discovery route stub (POST /discover)"
```

---

### Task 12: Sources Summary Route (Stub)

**Files:**
- Create: `app/routes/sources.py`
- Modify: `app/main.py` — add router include
- Test: `tests/test_routes/test_sources.py`

- [ ] **Step 1: Write the failing test**

`tests/test_routes/test_sources.py`:
```python
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import create_app


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_sources_summary_returns_shape(client):
    resp = await client.get("/sources/AAPL/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "AAPL"
    assert "sources" in data
    assert isinstance(data["sources"], dict)
    # Each source type should have last_updated and count
    for source_type in ["earnings", "news", "podcast", "cftc"]:
        assert source_type in data["sources"]
        assert "last_updated" in data["sources"][source_type]
        assert "count" in data["sources"][source_type]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_routes/test_sources.py -v`
Expected: FAIL — 404

- [ ] **Step 3: Implement sources route**

`app/routes/sources.py`:
```python
from typing import Any

from fastapi import APIRouter

router = APIRouter()


@router.get("/sources/{symbol}/summary")
async def sources_summary(symbol: str) -> dict[str, Any]:
    """Return indexed source summary for a ticker.

    Stub: returns empty source data. Will query the database
    once the discovery graph populates it (Plan 2).
    """
    return {
        "symbol": symbol.upper(),
        "sources": {
            "earnings": {"last_updated": None, "count": 0},
            "news": {"last_updated": None, "count": 0},
            "podcast": {"last_updated": None, "count": 0},
            "cftc": {"last_updated": None, "count": 0},
        },
    }
```

- [ ] **Step 4: Register router in app/main.py**

Add import and include:
```python
from app.routes import analysis, discovery, health, sources, stream
```
```python
    app.include_router(sources.router)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_routes/test_sources.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add app/routes/sources.py app/main.py tests/test_routes/test_sources.py
git commit -m "feat: add sources summary route stub (GET /sources/{symbol}/summary)"
```

---

### Task 13: Docker + docker-compose

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.env.example`

- [ ] **Step 1: Create Dockerfile**

`Dockerfile`:
```dockerfile
FROM python:3.12-slim AS base

WORKDIR /app

# Install UV
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy dependency files
COPY pyproject.toml uv.lock* ./

# Install dependencies
RUN uv sync --frozen --no-dev

# Copy application code
COPY app/ app/
COPY db/ db/
COPY models/ models/
COPY sse/ sse/
COPY alembic/ alembic/
COPY alembic.ini .

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Create docker-compose.yml**

`docker-compose.yml`:
```yaml
services:
  app:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/quant_agent
      - REDIS_URL=redis://redis:6379/0
      - DEBUG=true
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./app:/app/app
      - ./db:/app/db
      - ./models:/app/models
      - ./sse:/app/sse
    command: uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: quant_agent
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

- [ ] **Step 3: Create .env.example**

`.env.example`:
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/quant_agent
REDIS_URL=redis://localhost:6379/0
ANTHROPIC_API_KEY=sk-ant-your-key-here
CORS_ORIGINS=["http://localhost:3000"]
DEBUG=true
```

- [ ] **Step 4: Verify docker-compose config parses**

```bash
cd ~/Documents/Projects/quant-agent-backend
docker compose config --quiet
```

Expected: exits 0, no errors

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add Dockerfile docker-compose.yml .env.example
git commit -m "feat: add Dockerfile and docker-compose for local dev"
```

---

### Task 14: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: quant_agent_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v4

      - name: Set up Python
        run: uv python install 3.12

      - name: Install dependencies
        run: uv sync

      - name: Lint
        run: uv run ruff check .

      - name: Type check format
        run: uv run ruff format --check .

      - name: Run tests
        env:
          DATABASE_URL: postgresql+asyncpg://postgres:postgres@localhost:5432/quant_agent_test
          REDIS_URL: redis://localhost:6379/0
        run: uv run pytest -v
```

- [ ] **Step 2: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
mkdir -p .github/workflows
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow with postgres and redis"
```

---

### Task 15: Full Test Suite Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

```bash
cd ~/Documents/Projects/quant-agent-backend
uv run pytest -v
```

Expected: All tests pass:
```
tests/test_logging.py::test_setup_logging_configures_structlog PASSED
tests/test_logging.py::test_setup_logging_json_in_production PASSED
tests/test_config.py::test_settings_defaults PASSED
tests/test_config.py::test_settings_from_env PASSED
tests/test_db_models.py::test_document_model_fields PASSED
tests/test_db_models.py::test_chunk_model_fields PASSED
tests/test_db_models.py::test_source_run_model_fields PASSED
tests/test_db_models.py::test_job_model_fields PASSED
tests/test_models.py::test_scanner_signals PASSED
tests/test_models.py::test_job_response PASSED
tests/test_models.py::test_job_status PASSED
tests/test_models.py::test_phase_event_serializes PASSED
tests/test_models.py::test_checkpoint_event_serializes PASSED
tests/test_models.py::test_stream_event_serializes PASSED
tests/test_models.py::test_done_event_serializes PASSED
tests/test_sse/test_bus.py::test_publish_and_subscribe PASSED
tests/test_sse/test_bus.py::test_subscribe_only_receives_own_job PASSED
tests/test_routes/test_health.py::test_health_returns_ok PASSED
tests/test_routes/test_analysis.py::test_analyze_returns_job_id PASSED
tests/test_routes/test_analysis.py::test_analyze_auto_run_default_false PASSED
tests/test_routes/test_stream.py::test_stream_receives_sse_events PASSED
tests/test_routes/test_stream.py::test_resume_checkpoint PASSED
tests/test_routes/test_discovery.py::test_discover_returns_run_id PASSED
tests/test_routes/test_discovery.py::test_discover_all_defaults PASSED
tests/test_routes/test_sources.py::test_sources_summary_returns_shape PASSED
```

- [ ] **Step 2: Run linter**

```bash
cd ~/Documents/Projects/quant-agent-backend
uv run ruff check .
uv run ruff format --check .
```

Expected: Clean

- [ ] **Step 3: Verify dev server starts**

```bash
cd ~/Documents/Projects/quant-agent-backend
timeout 5 uv run uvicorn app.main:app --port 8000 || true
```

Expected: Server starts, shows "Uvicorn running on http://0.0.0.0:8000", then exits after timeout.

- [ ] **Step 4: Commit any lint fixes if needed, then tag**

```bash
cd ~/Documents/Projects/quant-agent-backend
git tag v0.1.0-scaffold
```
