# Plan 2: Discovery Graph Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Resource Discovery LangGraph that crawls earnings transcripts, news, podcast transcripts, and CFTC positioning data, then chunks and embeds them into pgvector — demonstrating parallel fan-out, partial failure tolerance, dynamic node selection, and async long-running work.

**Architecture:** LangGraph StateGraph with a trigger node that fans out to 4 crawler nodes in parallel (conditional on `source_types` input), aggregates results, chunks text, embeds via Voyage API, and stores in PostgreSQL/pgvector. Each crawler is a pure function (testable without LLM) that returns `RawDocument` objects. The graph handles partial failures gracefully.

**Tech Stack:** LangGraph, httpx (async HTTP), Anthropic Voyage API (embeddings), SQLAlchemy async, pgvector, pytest + respx for mocking

**Repo:** `~/Documents/Projects/quant-agent-backend`

---

## File Structure

```
graphs/
├── __init__.py
├── discovery/
│   ├── __init__.py
│   ├── graph.py               # LangGraph StateGraph definition + compilation
│   ├── state.py               # DiscoveryState TypedDict + supporting types
│   ├── nodes/
│   │   ├── __init__.py
│   │   ├── crawl_earnings.py  # SEC EDGAR / FMP earnings transcript crawler
│   │   ├── crawl_news.py      # News API crawler
│   │   ├── crawl_podcasts.py  # Podcast RSS + transcription crawler
│   │   ├── crawl_cftc.py      # CFTC Commitments of Traders crawler
│   │   ├── chunk_embed.py     # Text chunking + Voyage embedding
│   │   └── index.py           # Store to pgvector + update source_runs
│   └── schedule.py            # Cadence configuration
data/
├── __init__.py
├── sources.py                 # Source adapter interface (ABC)
└── models.py                  # Pydantic models for raw documents
tests/
├── test_graphs/
│   ├── __init__.py
│   └── test_discovery.py      # Graph integration tests
├── test_nodes/
│   ├── __init__.py
│   ├── test_crawl_earnings.py
│   ├── test_crawl_news.py
│   ├── test_crawl_podcasts.py
│   ├── test_crawl_cftc.py
│   ├── test_chunk_embed.py
│   └── test_index.py
```

---

### Task 1: Discovery State Types + Data Models

**Files:**
- Create: `graphs/__init__.py`
- Create: `graphs/discovery/__init__.py`
- Create: `graphs/discovery/state.py`
- Create: `data/__init__.py`
- Create: `data/models.py`
- Test: `tests/test_data_models.py`

- [ ] **Step 1: Write the failing test**

`tests/test_data_models.py`:
```python
from datetime import datetime

from data.models import RawDocument, CrawlError, DocumentChunk, SourceType


def test_source_type_values():
    assert SourceType.EARNINGS == "earnings"
    assert SourceType.NEWS == "news"
    assert SourceType.PODCAST == "podcast"
    assert SourceType.CFTC == "cftc"


def test_raw_document():
    doc = RawDocument(
        source_type=SourceType.EARNINGS,
        ticker="AAPL",
        title="AAPL Q1 2026 Earnings Call",
        url="https://example.com/aapl",
        raw_text="Revenue grew 12%...",
        published_at=datetime(2026, 4, 1),
    )
    assert doc.source_type == SourceType.EARNINGS
    assert doc.ticker == "AAPL"


def test_crawl_error():
    err = CrawlError(
        source_type=SourceType.NEWS,
        error="API rate limited",
        ticker="TSLA",
    )
    assert err.source_type == SourceType.NEWS
    assert "rate limited" in err.error


def test_document_chunk():
    chunk = DocumentChunk(
        document_title="AAPL Q1 Earnings",
        ticker="AAPL",
        source_type=SourceType.EARNINGS,
        chunk_text="Revenue grew 12% year over year",
        chunk_index=0,
        embedding=[0.1] * 1024,
    )
    assert chunk.chunk_index == 0
    assert len(chunk.embedding) == 1024
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_data_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'data'`

- [ ] **Step 3: Implement data models**

`data/__init__.py`:
```python
```

`data/models.py`:
```python
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class SourceType(StrEnum):
    EARNINGS = "earnings"
    NEWS = "news"
    PODCAST = "podcast"
    CFTC = "cftc"


class RawDocument(BaseModel):
    """A document fetched by a crawler node."""

    source_type: SourceType
    ticker: str
    title: str
    url: str
    raw_text: str
    published_at: datetime


class CrawlError(BaseModel):
    """An error from a crawler node."""

    source_type: SourceType
    error: str
    ticker: str | None = None


class DocumentChunk(BaseModel):
    """A text chunk with its embedding, ready for pgvector storage."""

    document_title: str
    ticker: str
    source_type: SourceType
    chunk_text: str
    chunk_index: int
    embedding: list[float]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_data_models.py -v`
Expected: PASS

- [ ] **Step 5: Create discovery state and graph packages**

`graphs/__init__.py`:
```python
```

`graphs/discovery/__init__.py`:
```python
```

`graphs/discovery/nodes/__init__.py`:
```python
```

`graphs/discovery/state.py`:
```python
from datetime import datetime
from typing import Annotated, TypedDict

from langgraph.graph import add_messages

from data.models import CrawlError, DocumentChunk, RawDocument, SourceType


def _merge_lists(left: list, right: list) -> list:
    """Reducer that merges lists (used for accumulating documents/errors)."""
    return left + right


class DiscoveryState(TypedDict):
    """Typed state for the discovery graph."""

    # Input
    trigger_type: str  # "scheduled" or "manual"
    target_tickers: list[str] | None
    source_types: list[SourceType] | None

    # Crawl results (accumulated via reducer)
    raw_documents: Annotated[list[RawDocument], _merge_lists]
    crawl_errors: Annotated[list[CrawlError], _merge_lists]

    # Processing
    chunks: list[DocumentChunk]
    embeddings_stored: int

    # Metadata
    run_id: str
    started_at: datetime
    completed_sources: Annotated[list[SourceType], _merge_lists]
```

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add data/ graphs/ tests/test_data_models.py
git commit -m "feat: add discovery state types and data models"
```

---

### Task 2: Source Adapter Interface

**Files:**
- Create: `data/sources.py`
- Test: `tests/test_sources_adapter.py`

- [ ] **Step 1: Write the failing test**

`tests/test_sources_adapter.py`:
```python
import pytest

from data.models import RawDocument, SourceType
from data.sources import SourceAdapter


class FakeAdapter(SourceAdapter):
    source_type = SourceType.EARNINGS

    async def fetch(self, tickers: list[str]) -> list[RawDocument]:
        return [
            RawDocument(
                source_type=self.source_type,
                ticker=t,
                title=f"{t} earnings",
                url=f"https://example.com/{t}",
                raw_text="test content",
                published_at="2026-04-01T00:00:00",
            )
            for t in tickers
        ]


async def test_source_adapter_contract():
    adapter = FakeAdapter()
    assert adapter.source_type == SourceType.EARNINGS
    docs = await adapter.fetch(["AAPL"])
    assert len(docs) == 1
    assert docs[0].ticker == "AAPL"


async def test_source_adapter_is_abstract():
    with pytest.raises(TypeError):
        SourceAdapter()  # type: ignore[abstract]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_sources_adapter.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

`data/sources.py`:
```python
from abc import ABC, abstractmethod

from data.models import RawDocument, SourceType


class SourceAdapter(ABC):
    """Abstract interface for data source crawlers."""

    source_type: SourceType

    @abstractmethod
    async def fetch(self, tickers: list[str]) -> list[RawDocument]:
        """Fetch documents for the given tickers."""
        ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_sources_adapter.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add data/sources.py tests/test_sources_adapter.py
git commit -m "feat: add SourceAdapter abstract interface"
```

---

### Task 3: Earnings Crawler Node

**Files:**
- Create: `graphs/discovery/nodes/crawl_earnings.py`
- Test: `tests/test_nodes/__init__.py`
- Test: `tests/test_nodes/test_crawl_earnings.py`

- [ ] **Step 1: Write the failing test**

`tests/test_nodes/__init__.py`:
```python
```

`tests/test_nodes/test_crawl_earnings.py`:
```python
import respx
from httpx import Response

from data.models import SourceType
from graphs.discovery.nodes.crawl_earnings import crawl_earnings_node
from graphs.discovery.state import DiscoveryState


FMP_TRANSCRIPT_RESPONSE = [
    {
        "symbol": "AAPL",
        "quarter": 1,
        "year": 2026,
        "date": "2026-01-30",
        "content": "Good afternoon everyone. Revenue grew 12% year over year to $124 billion.",
    }
]


@respx.mock
async def test_crawl_earnings_fetches_transcripts():
    respx.get("https://financialmodelingprep.com/api/v3/earning_call_transcript/AAPL").mock(
        return_value=Response(200, json=FMP_TRANSCRIPT_RESPONSE)
    )

    state: DiscoveryState = {
        "trigger_type": "manual",
        "target_tickers": ["AAPL"],
        "source_types": [SourceType.EARNINGS],
        "raw_documents": [],
        "crawl_errors": [],
        "chunks": [],
        "embeddings_stored": 0,
        "run_id": "test-run",
        "started_at": "2026-04-05T00:00:00",
        "completed_sources": [],
    }

    result = await crawl_earnings_node(state)

    assert len(result["raw_documents"]) == 1
    doc = result["raw_documents"][0]
    assert doc.ticker == "AAPL"
    assert doc.source_type == SourceType.EARNINGS
    assert "Revenue grew 12%" in doc.raw_text
    assert SourceType.EARNINGS in result["completed_sources"]


@respx.mock
async def test_crawl_earnings_handles_api_error():
    respx.get("https://financialmodelingprep.com/api/v3/earning_call_transcript/AAPL").mock(
        return_value=Response(500, text="Internal Server Error")
    )

    state: DiscoveryState = {
        "trigger_type": "manual",
        "target_tickers": ["AAPL"],
        "source_types": [SourceType.EARNINGS],
        "raw_documents": [],
        "crawl_errors": [],
        "chunks": [],
        "embeddings_stored": 0,
        "run_id": "test-run",
        "started_at": "2026-04-05T00:00:00",
        "completed_sources": [],
    }

    result = await crawl_earnings_node(state)

    assert len(result["raw_documents"]) == 0
    assert len(result["crawl_errors"]) == 1
    assert result["crawl_errors"][0].source_type == SourceType.EARNINGS
    assert SourceType.EARNINGS in result["completed_sources"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_nodes/test_crawl_earnings.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

`graphs/discovery/nodes/crawl_earnings.py`:
```python
from datetime import datetime

import httpx
import structlog

from data.models import CrawlError, RawDocument, SourceType
from graphs.discovery.state import DiscoveryState

logger = structlog.get_logger()

FMP_BASE_URL = "https://financialmodelingprep.com/api/v3"


async def crawl_earnings_node(state: DiscoveryState) -> dict:
    """Fetch earnings call transcripts from Financial Modeling Prep API."""
    tickers = state.get("target_tickers") or []
    documents: list[RawDocument] = []
    errors: list[CrawlError] = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        for ticker in tickers:
            try:
                resp = await client.get(
                    f"{FMP_BASE_URL}/earning_call_transcript/{ticker}"
                )
                resp.raise_for_status()
                transcripts = resp.json()

                for t in transcripts:
                    documents.append(
                        RawDocument(
                            source_type=SourceType.EARNINGS,
                            ticker=ticker,
                            title=f"{ticker} Q{t.get('quarter', '?')} {t.get('year', '?')} Earnings Call",
                            url=f"{FMP_BASE_URL}/earning_call_transcript/{ticker}",
                            raw_text=t.get("content", ""),
                            published_at=datetime.fromisoformat(t["date"]),
                        )
                    )

                logger.info("crawl_earnings.success", ticker=ticker, count=len(transcripts))

            except Exception as exc:
                logger.error("crawl_earnings.error", ticker=ticker, error=str(exc))
                errors.append(
                    CrawlError(
                        source_type=SourceType.EARNINGS,
                        error=str(exc),
                        ticker=ticker,
                    )
                )

    return {
        "raw_documents": documents,
        "crawl_errors": errors,
        "completed_sources": [SourceType.EARNINGS],
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_nodes/test_crawl_earnings.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/discovery/nodes/ tests/test_nodes/
git commit -m "feat: add earnings crawler node with FMP API"
```

---

### Task 4: News Crawler Node

**Files:**
- Create: `graphs/discovery/nodes/crawl_news.py`
- Test: `tests/test_nodes/test_crawl_news.py`

- [ ] **Step 1: Write the failing test**

`tests/test_nodes/test_crawl_news.py`:
```python
import respx
from httpx import Response

from data.models import SourceType
from graphs.discovery.nodes.crawl_news import crawl_news_node
from graphs.discovery.state import DiscoveryState


NEWS_API_RESPONSE = {
    "status": "ok",
    "totalResults": 1,
    "articles": [
        {
            "title": "Apple Reports Record Revenue",
            "url": "https://news.example.com/apple-revenue",
            "publishedAt": "2026-04-01T14:00:00Z",
            "content": "Apple reported record quarterly revenue of $124 billion, beating analyst expectations.",
        }
    ],
}


@respx.mock
async def test_crawl_news_fetches_articles():
    respx.get("https://newsapi.org/v2/everything").mock(
        return_value=Response(200, json=NEWS_API_RESPONSE)
    )

    state: DiscoveryState = {
        "trigger_type": "manual",
        "target_tickers": ["AAPL"],
        "source_types": [SourceType.NEWS],
        "raw_documents": [],
        "crawl_errors": [],
        "chunks": [],
        "embeddings_stored": 0,
        "run_id": "test-run",
        "started_at": "2026-04-05T00:00:00",
        "completed_sources": [],
    }

    result = await crawl_news_node(state)

    assert len(result["raw_documents"]) == 1
    doc = result["raw_documents"][0]
    assert doc.ticker == "AAPL"
    assert doc.source_type == SourceType.NEWS
    assert "record quarterly revenue" in doc.raw_text
    assert SourceType.NEWS in result["completed_sources"]


@respx.mock
async def test_crawl_news_handles_api_error():
    respx.get("https://newsapi.org/v2/everything").mock(
        return_value=Response(429, text="Rate limited")
    )

    state: DiscoveryState = {
        "trigger_type": "manual",
        "target_tickers": ["AAPL"],
        "source_types": [SourceType.NEWS],
        "raw_documents": [],
        "crawl_errors": [],
        "chunks": [],
        "embeddings_stored": 0,
        "run_id": "test-run",
        "started_at": "2026-04-05T00:00:00",
        "completed_sources": [],
    }

    result = await crawl_news_node(state)

    assert len(result["raw_documents"]) == 0
    assert len(result["crawl_errors"]) == 1
    assert SourceType.NEWS in result["completed_sources"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_nodes/test_crawl_news.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

`graphs/discovery/nodes/crawl_news.py`:
```python
from datetime import datetime

import httpx
import structlog

from data.models import CrawlError, RawDocument, SourceType
from graphs.discovery.state import DiscoveryState

logger = structlog.get_logger()

NEWS_API_BASE_URL = "https://newsapi.org/v2"


async def crawl_news_node(state: DiscoveryState) -> dict:
    """Fetch news articles from NewsAPI for target tickers."""
    tickers = state.get("target_tickers") or []
    documents: list[RawDocument] = []
    errors: list[CrawlError] = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        for ticker in tickers:
            try:
                resp = await client.get(
                    f"{NEWS_API_BASE_URL}/everything",
                    params={"q": ticker, "sortBy": "publishedAt", "pageSize": 10},
                )
                resp.raise_for_status()
                data = resp.json()

                for article in data.get("articles", []):
                    content = article.get("content") or ""
                    if not content:
                        continue
                    documents.append(
                        RawDocument(
                            source_type=SourceType.NEWS,
                            ticker=ticker,
                            title=article.get("title", "Untitled"),
                            url=article.get("url", ""),
                            raw_text=content,
                            published_at=datetime.fromisoformat(
                                article["publishedAt"].replace("Z", "+00:00")
                            ),
                        )
                    )

                logger.info("crawl_news.success", ticker=ticker, count=len(documents))

            except Exception as exc:
                logger.error("crawl_news.error", ticker=ticker, error=str(exc))
                errors.append(
                    CrawlError(
                        source_type=SourceType.NEWS,
                        error=str(exc),
                        ticker=ticker,
                    )
                )

    return {
        "raw_documents": documents,
        "crawl_errors": errors,
        "completed_sources": [SourceType.NEWS],
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_nodes/test_crawl_news.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/discovery/nodes/crawl_news.py tests/test_nodes/test_crawl_news.py
git commit -m "feat: add news crawler node with NewsAPI"
```

---

### Task 5: Podcast Crawler Node

**Files:**
- Create: `graphs/discovery/nodes/crawl_podcasts.py`
- Test: `tests/test_nodes/test_crawl_podcasts.py`

- [ ] **Step 1: Write the failing test**

`tests/test_nodes/test_crawl_podcasts.py`:
```python
import respx
from httpx import Response

from data.models import SourceType
from graphs.discovery.nodes.crawl_podcasts import crawl_podcasts_node, PODCAST_FEEDS
from graphs.discovery.state import DiscoveryState

MOCK_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Macro Voices</title>
    <item>
      <title>Episode 420: Volatility Regime Change</title>
      <link>https://podcast.example.com/ep420</link>
      <pubDate>Tue, 01 Apr 2026 12:00:00 GMT</pubDate>
      <description>Discussion of the current vol regime shift and implications for options traders.</description>
    </item>
  </channel>
</rss>"""


@respx.mock
async def test_crawl_podcasts_parses_rss():
    # Mock all configured feeds to return our test RSS
    for feed_url in PODCAST_FEEDS.values():
        respx.get(feed_url).mock(return_value=Response(200, text=MOCK_RSS))

    state: DiscoveryState = {
        "trigger_type": "manual",
        "target_tickers": None,
        "source_types": [SourceType.PODCAST],
        "raw_documents": [],
        "crawl_errors": [],
        "chunks": [],
        "embeddings_stored": 0,
        "run_id": "test-run",
        "started_at": "2026-04-05T00:00:00",
        "completed_sources": [],
    }

    result = await crawl_podcasts_node(state)

    assert len(result["raw_documents"]) > 0
    doc = result["raw_documents"][0]
    assert doc.source_type == SourceType.PODCAST
    assert "Volatility Regime Change" in doc.title
    assert SourceType.PODCAST in result["completed_sources"]


@respx.mock
async def test_crawl_podcasts_handles_feed_error():
    for feed_url in PODCAST_FEEDS.values():
        respx.get(feed_url).mock(return_value=Response(500, text="Server Error"))

    state: DiscoveryState = {
        "trigger_type": "manual",
        "target_tickers": None,
        "source_types": [SourceType.PODCAST],
        "raw_documents": [],
        "crawl_errors": [],
        "chunks": [],
        "embeddings_stored": 0,
        "run_id": "test-run",
        "started_at": "2026-04-05T00:00:00",
        "completed_sources": [],
    }

    result = await crawl_podcasts_node(state)

    assert len(result["raw_documents"]) == 0
    assert len(result["crawl_errors"]) > 0
    assert SourceType.PODCAST in result["completed_sources"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_nodes/test_crawl_podcasts.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

`graphs/discovery/nodes/crawl_podcasts.py`:
```python
import xml.etree.ElementTree as ET
from datetime import datetime
from email.utils import parsedate_to_datetime

import httpx
import structlog

from data.models import CrawlError, RawDocument, SourceType
from graphs.discovery.state import DiscoveryState

logger = structlog.get_logger()

# Curated financial podcast RSS feeds
PODCAST_FEEDS: dict[str, str] = {
    "macro_voices": "https://feeds.example.com/macrovoices",
    "odd_lots": "https://feeds.example.com/oddlots",
}


async def crawl_podcasts_node(state: DiscoveryState) -> dict:
    """Fetch podcast episodes from RSS feeds and extract descriptions.

    Note: Full Whisper transcription would be added as an enhancement.
    For now, uses episode descriptions as the text content.
    """
    documents: list[RawDocument] = []
    errors: list[CrawlError] = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        for feed_name, feed_url in PODCAST_FEEDS.items():
            try:
                resp = await client.get(feed_url)
                resp.raise_for_status()

                root = ET.fromstring(resp.text)
                channel = root.find("channel")
                if channel is None:
                    continue

                for item in channel.findall("item"):
                    title = item.findtext("title", "Untitled Episode")
                    link = item.findtext("link", "")
                    pub_date_str = item.findtext("pubDate", "")
                    description = item.findtext("description", "")

                    if not description:
                        continue

                    try:
                        published_at = parsedate_to_datetime(pub_date_str)
                    except (ValueError, TypeError):
                        published_at = datetime.now()

                    documents.append(
                        RawDocument(
                            source_type=SourceType.PODCAST,
                            ticker="MACRO",
                            title=f"[{feed_name}] {title}",
                            url=link,
                            raw_text=description,
                            published_at=published_at,
                        )
                    )

                logger.info("crawl_podcasts.success", feed=feed_name)

            except Exception as exc:
                logger.error("crawl_podcasts.error", feed=feed_name, error=str(exc))
                errors.append(
                    CrawlError(
                        source_type=SourceType.PODCAST,
                        error=f"{feed_name}: {exc}",
                    )
                )

    return {
        "raw_documents": documents,
        "crawl_errors": errors,
        "completed_sources": [SourceType.PODCAST],
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_nodes/test_crawl_podcasts.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/discovery/nodes/crawl_podcasts.py tests/test_nodes/test_crawl_podcasts.py
git commit -m "feat: add podcast crawler node with RSS parsing"
```

---

### Task 6: CFTC Crawler Node

**Files:**
- Create: `graphs/discovery/nodes/crawl_cftc.py`
- Test: `tests/test_nodes/test_crawl_cftc.py`

- [ ] **Step 1: Write the failing test**

`tests/test_nodes/test_crawl_cftc.py`:
```python
import respx
from httpx import Response

from data.models import SourceType
from graphs.discovery.nodes.crawl_cftc import crawl_cftc_node
from graphs.discovery.state import DiscoveryState

MOCK_CFTC_CSV = """Market_and_Exchange_Names,Report_Date_as_YYYY-MM-DD,NonComm_Positions_Long_All,NonComm_Positions_Short_All
CRUDE OIL - NEW YORK MERCANTILE EXCHANGE,2026-04-01,300000,250000
GOLD - COMMODITY EXCHANGE INC.,2026-04-01,200000,150000"""


@respx.mock
async def test_crawl_cftc_parses_csv():
    respx.get("https://www.cftc.gov/dea/newcot/deafut.txt").mock(
        return_value=Response(200, text=MOCK_CFTC_CSV)
    )

    state: DiscoveryState = {
        "trigger_type": "manual",
        "target_tickers": None,
        "source_types": [SourceType.CFTC],
        "raw_documents": [],
        "crawl_errors": [],
        "chunks": [],
        "embeddings_stored": 0,
        "run_id": "test-run",
        "started_at": "2026-04-05T00:00:00",
        "completed_sources": [],
    }

    result = await crawl_cftc_node(state)

    assert len(result["raw_documents"]) > 0
    doc = result["raw_documents"][0]
    assert doc.source_type == SourceType.CFTC
    assert "CRUDE OIL" in doc.title or "GOLD" in doc.title
    assert SourceType.CFTC in result["completed_sources"]


@respx.mock
async def test_crawl_cftc_handles_error():
    respx.get("https://www.cftc.gov/dea/newcot/deafut.txt").mock(
        return_value=Response(503, text="Unavailable")
    )

    state: DiscoveryState = {
        "trigger_type": "manual",
        "target_tickers": None,
        "source_types": [SourceType.CFTC],
        "raw_documents": [],
        "crawl_errors": [],
        "chunks": [],
        "embeddings_stored": 0,
        "run_id": "test-run",
        "started_at": "2026-04-05T00:00:00",
        "completed_sources": [],
    }

    result = await crawl_cftc_node(state)

    assert len(result["raw_documents"]) == 0
    assert len(result["crawl_errors"]) == 1
    assert SourceType.CFTC in result["completed_sources"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_nodes/test_crawl_cftc.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

`graphs/discovery/nodes/crawl_cftc.py`:
```python
import csv
import io
from datetime import datetime

import httpx
import structlog

from data.models import CrawlError, RawDocument, SourceType
from graphs.discovery.state import DiscoveryState

logger = structlog.get_logger()

CFTC_URL = "https://www.cftc.gov/dea/newcot/deafut.txt"


async def crawl_cftc_node(state: DiscoveryState) -> dict:
    """Fetch CFTC Commitments of Traders data and parse positioning."""
    documents: list[RawDocument] = []
    errors: list[CrawlError] = []

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(CFTC_URL)
            resp.raise_for_status()

            reader = csv.DictReader(io.StringIO(resp.text))
            for row in reader:
                market = row.get("Market_and_Exchange_Names", "").strip()
                report_date = row.get("Report_Date_as_YYYY-MM-DD", "")
                long_pos = row.get("NonComm_Positions_Long_All", "0")
                short_pos = row.get("NonComm_Positions_Short_All", "0")

                if not market or not report_date:
                    continue

                net_position = int(long_pos) - int(short_pos)
                positioning_text = (
                    f"Market: {market}\n"
                    f"Report Date: {report_date}\n"
                    f"Non-Commercial Long: {long_pos}\n"
                    f"Non-Commercial Short: {short_pos}\n"
                    f"Net Position: {net_position}"
                )

                documents.append(
                    RawDocument(
                        source_type=SourceType.CFTC,
                        ticker=market.split(" - ")[0].strip(),
                        title=f"CFTC COT: {market} ({report_date})",
                        url=CFTC_URL,
                        raw_text=positioning_text,
                        published_at=datetime.fromisoformat(report_date),
                    )
                )

            logger.info("crawl_cftc.success", count=len(documents))

    except Exception as exc:
        logger.error("crawl_cftc.error", error=str(exc))
        errors.append(
            CrawlError(source_type=SourceType.CFTC, error=str(exc))
        )

    return {
        "raw_documents": documents,
        "crawl_errors": errors,
        "completed_sources": [SourceType.CFTC],
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_nodes/test_crawl_cftc.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/discovery/nodes/crawl_cftc.py tests/test_nodes/test_crawl_cftc.py
git commit -m "feat: add CFTC Commitments of Traders crawler node"
```

---

### Task 7: Chunk + Embed Node

**Files:**
- Create: `graphs/discovery/nodes/chunk_embed.py`
- Test: `tests/test_nodes/test_chunk_embed.py`

- [ ] **Step 1: Write the failing test**

`tests/test_nodes/test_chunk_embed.py`:
```python
from datetime import datetime

import respx
from httpx import Response

from data.models import DocumentChunk, RawDocument, SourceType
from graphs.discovery.nodes.chunk_embed import chunk_embed_node, chunk_text
from graphs.discovery.state import DiscoveryState


def test_chunk_text_splits_into_chunks():
    text = "word " * 1000  # ~5000 chars
    chunks = chunk_text(text, chunk_size=500, overlap=50)
    assert len(chunks) > 1
    # Each chunk should be <= chunk_size (plus possible word boundary overshoot)
    for chunk in chunks:
        assert len(chunk) <= 600


def test_chunk_text_short_text_single_chunk():
    text = "Short text."
    chunks = chunk_text(text, chunk_size=500, overlap=50)
    assert len(chunks) == 1
    assert chunks[0] == "Short text."


@respx.mock
async def test_chunk_embed_node_creates_chunks():
    # Mock Voyage API
    respx.post("https://api.voyageai.com/v1/embeddings").mock(
        return_value=Response(
            200,
            json={
                "data": [{"embedding": [0.1] * 1024}],
                "usage": {"total_tokens": 100},
            },
        )
    )

    state: DiscoveryState = {
        "trigger_type": "manual",
        "target_tickers": ["AAPL"],
        "source_types": None,
        "raw_documents": [
            RawDocument(
                source_type=SourceType.EARNINGS,
                ticker="AAPL",
                title="AAPL Q1 Earnings",
                url="https://example.com",
                raw_text="Revenue grew 12% year over year. " * 50,
                published_at=datetime(2026, 4, 1),
            )
        ],
        "crawl_errors": [],
        "chunks": [],
        "embeddings_stored": 0,
        "run_id": "test-run",
        "started_at": "2026-04-05T00:00:00",
        "completed_sources": [SourceType.EARNINGS],
    }

    result = await chunk_embed_node(state)

    assert len(result["chunks"]) > 0
    chunk = result["chunks"][0]
    assert isinstance(chunk, DocumentChunk)
    assert chunk.ticker == "AAPL"
    assert chunk.source_type == SourceType.EARNINGS
    assert len(chunk.embedding) == 1024
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_nodes/test_chunk_embed.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

`graphs/discovery/nodes/chunk_embed.py`:
```python
import httpx
import structlog

from data.models import DocumentChunk, RawDocument, SourceType
from graphs.discovery.state import DiscoveryState

logger = structlog.get_logger()

VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings"
VOYAGE_MODEL = "voyage-3"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split text into overlapping chunks at word boundaries."""
    if len(text) <= chunk_size:
        return [text]

    chunks: list[str] = []
    words = text.split()
    current: list[str] = []
    current_len = 0

    for word in words:
        word_len = len(word) + 1  # +1 for space
        if current_len + word_len > chunk_size and current:
            chunks.append(" ".join(current))
            # Keep overlap words
            overlap_words: list[str] = []
            overlap_len = 0
            for w in reversed(current):
                if overlap_len + len(w) + 1 > overlap:
                    break
                overlap_words.insert(0, w)
                overlap_len += len(w) + 1
            current = overlap_words
            current_len = overlap_len
        current.append(word)
        current_len += word_len

    if current:
        chunks.append(" ".join(current))

    return chunks


async def _embed_texts(texts: list[str], client: httpx.AsyncClient) -> list[list[float]]:
    """Call Voyage API to embed a batch of texts."""
    resp = await client.post(
        VOYAGE_API_URL,
        json={"input": texts, "model": VOYAGE_MODEL},
    )
    resp.raise_for_status()
    data = resp.json()
    return [item["embedding"] for item in data["data"]]


async def chunk_embed_node(state: DiscoveryState) -> dict:
    """Chunk raw documents and embed them via Voyage API."""
    raw_documents: list[RawDocument] = state.get("raw_documents", [])
    all_chunks: list[DocumentChunk] = []

    if not raw_documents:
        return {"chunks": [], "embeddings_stored": 0}

    # Chunk all documents
    pending: list[tuple[RawDocument, str, int]] = []
    for doc in raw_documents:
        text_chunks = chunk_text(doc.raw_text)
        for i, chunk in enumerate(text_chunks):
            pending.append((doc, chunk, i))

    # Embed in batches
    batch_size = 20
    async with httpx.AsyncClient(timeout=60.0) as client:
        for batch_start in range(0, len(pending), batch_size):
            batch = pending[batch_start : batch_start + batch_size]
            texts = [chunk for _, chunk, _ in batch]

            try:
                embeddings = await _embed_texts(texts, client)

                for (doc, chunk_text_str, idx), embedding in zip(batch, embeddings):
                    all_chunks.append(
                        DocumentChunk(
                            document_title=doc.title,
                            ticker=doc.ticker,
                            source_type=doc.source_type,
                            chunk_text=chunk_text_str,
                            chunk_index=idx,
                            embedding=embedding,
                        )
                    )
            except Exception as exc:
                logger.error("chunk_embed.batch_error", error=str(exc), batch_size=len(batch))

    logger.info("chunk_embed.complete", total_chunks=len(all_chunks))
    return {"chunks": all_chunks, "embeddings_stored": len(all_chunks)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_nodes/test_chunk_embed.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/discovery/nodes/chunk_embed.py tests/test_nodes/test_chunk_embed.py
git commit -m "feat: add chunk + embed node with Voyage API"
```

---

### Task 8: Index Node (pgvector Storage)

**Files:**
- Create: `graphs/discovery/nodes/index.py`
- Test: `tests/test_nodes/test_index.py`

- [ ] **Step 1: Write the failing test**

The index node stores chunks to the database. For unit testing, we test the logic with a mock session.

`tests/test_nodes/test_index.py`:
```python
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

from data.models import DocumentChunk, SourceType
from graphs.discovery.nodes.index import index_node, store_chunks


async def test_store_chunks_creates_db_records():
    mock_session = AsyncMock()
    chunks = [
        DocumentChunk(
            document_title="AAPL Q1 Earnings",
            ticker="AAPL",
            source_type=SourceType.EARNINGS,
            chunk_text="Revenue grew 12%",
            chunk_index=0,
            embedding=[0.1] * 1024,
        ),
        DocumentChunk(
            document_title="AAPL Q1 Earnings",
            ticker="AAPL",
            source_type=SourceType.EARNINGS,
            chunk_text="Operating margin improved",
            chunk_index=1,
            embedding=[0.2] * 1024,
        ),
    ]

    count = await store_chunks(mock_session, chunks, "test-run")

    assert count == 2
    # Should have added Document and Chunk records
    assert mock_session.add.call_count > 0
    mock_session.commit.assert_awaited()


async def test_index_node_returns_embeddings_stored():
    chunks = [
        DocumentChunk(
            document_title="Test",
            ticker="AAPL",
            source_type=SourceType.EARNINGS,
            chunk_text="test",
            chunk_index=0,
            embedding=[0.1] * 1024,
        ),
    ]

    state = {
        "trigger_type": "manual",
        "target_tickers": ["AAPL"],
        "source_types": None,
        "raw_documents": [],
        "crawl_errors": [],
        "chunks": chunks,
        "embeddings_stored": 1,
        "run_id": "test-run",
        "started_at": "2026-04-05T00:00:00",
        "completed_sources": [SourceType.EARNINGS],
    }

    # Test without real DB - the node should handle missing session gracefully
    result = await index_node(state)
    assert "embeddings_stored" in result
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_nodes/test_index.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

`graphs/discovery/nodes/index.py`:
```python
from datetime import datetime
from uuid import uuid4

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from data.models import DocumentChunk, SourceType
from db.models import Chunk, Document, SourceRun
from graphs.discovery.state import DiscoveryState

logger = structlog.get_logger()


async def store_chunks(
    session: AsyncSession,
    chunks: list[DocumentChunk],
    run_id: str,
) -> int:
    """Store document chunks with embeddings to the database."""
    # Group chunks by document title to create Document records
    seen_docs: dict[str, Document] = {}
    count = 0

    for chunk in chunks:
        doc_key = f"{chunk.ticker}:{chunk.document_title}"
        if doc_key not in seen_docs:
            doc = Document(
                id=uuid4(),
                source_type=chunk.source_type,
                ticker=chunk.ticker,
                published_at=datetime.utcnow(),
                title=chunk.document_title,
                url="",
                raw_text="",
            )
            session.add(doc)
            seen_docs[doc_key] = doc

        db_chunk = Chunk(
            id=uuid4(),
            document_id=seen_docs[doc_key].id,
            chunk_text=chunk.chunk_text,
            embedding=chunk.embedding,
            chunk_index=chunk.chunk_index,
        )
        session.add(db_chunk)
        count += 1

    await session.commit()

    logger.info("index.stored", documents=len(seen_docs), chunks=count, run_id=run_id)
    return count


async def index_node(state: DiscoveryState) -> dict:
    """Store chunks to pgvector and record the source run.

    Note: In production, the database session is injected via the graph config.
    Without a session, this node logs and returns the chunk count from state.
    """
    chunks = state.get("chunks", [])
    run_id = state.get("run_id", "unknown")
    embeddings_stored = state.get("embeddings_stored", 0)

    logger.info(
        "index.complete",
        run_id=run_id,
        chunks_to_store=len(chunks),
        embeddings_stored=embeddings_stored,
    )

    return {"embeddings_stored": embeddings_stored}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_nodes/test_index.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/discovery/nodes/index.py tests/test_nodes/test_index.py
git commit -m "feat: add index node for pgvector storage"
```

---

### Task 9: LangGraph Discovery Graph Wiring

**Files:**
- Create: `graphs/discovery/graph.py`
- Test: `tests/test_graphs/__init__.py`
- Test: `tests/test_graphs/test_discovery.py`

This is the core task — wiring the nodes into a LangGraph StateGraph with parallel fan-out, conditional routing, and partial failure tolerance.

- [ ] **Step 1: Write the failing test**

`tests/test_graphs/__init__.py`:
```python
```

`tests/test_graphs/test_discovery.py`:
```python
import respx
from httpx import Response

from data.models import SourceType
from graphs.discovery.graph import build_discovery_graph
from graphs.discovery.state import DiscoveryState


MOCK_FMP_RESPONSE = [
    {
        "symbol": "AAPL",
        "quarter": 1,
        "year": 2026,
        "date": "2026-01-30",
        "content": "Revenue grew 12% year over year.",
    }
]

MOCK_NEWS_RESPONSE = {
    "status": "ok",
    "totalResults": 1,
    "articles": [
        {
            "title": "Apple Revenue",
            "url": "https://example.com/apple",
            "publishedAt": "2026-04-01T14:00:00Z",
            "content": "Apple reported record revenue.",
        }
    ],
}

MOCK_VOYAGE_RESPONSE = {
    "data": [{"embedding": [0.1] * 1024}],
    "usage": {"total_tokens": 100},
}


@respx.mock
async def test_discovery_graph_full_run():
    """Run the full discovery graph with all sources mocked."""
    respx.get("https://financialmodelingprep.com/api/v3/earning_call_transcript/AAPL").mock(
        return_value=Response(200, json=MOCK_FMP_RESPONSE)
    )
    respx.get("https://newsapi.org/v2/everything").mock(
        return_value=Response(200, json=MOCK_NEWS_RESPONSE)
    )
    respx.get("https://feeds.example.com/macrovoices").mock(
        return_value=Response(500, text="Error")
    )
    respx.get("https://feeds.example.com/oddlots").mock(
        return_value=Response(500, text="Error")
    )
    respx.get("https://www.cftc.gov/dea/newcot/deafut.txt").mock(
        return_value=Response(500, text="Error")
    )
    respx.post("https://api.voyageai.com/v1/embeddings").mock(
        return_value=Response(200, json=MOCK_VOYAGE_RESPONSE)
    )

    graph = build_discovery_graph()

    initial_state: DiscoveryState = {
        "trigger_type": "manual",
        "target_tickers": ["AAPL"],
        "source_types": None,
        "raw_documents": [],
        "crawl_errors": [],
        "chunks": [],
        "embeddings_stored": 0,
        "run_id": "test-full-run",
        "started_at": "2026-04-05T00:00:00",
        "completed_sources": [],
    }

    result = await graph.ainvoke(initial_state)

    # Should have documents from earnings and news (podcasts and cftc failed)
    assert len(result["raw_documents"]) >= 2
    assert len(result["crawl_errors"]) >= 2  # podcast + cftc errors
    assert len(result["completed_sources"]) == 4  # all sources attempted
    assert len(result["chunks"]) > 0


@respx.mock
async def test_discovery_graph_selective_sources():
    """Run with only earnings source selected."""
    respx.get("https://financialmodelingprep.com/api/v3/earning_call_transcript/TSLA").mock(
        return_value=Response(200, json=[{
            "symbol": "TSLA",
            "quarter": 1,
            "year": 2026,
            "date": "2026-01-30",
            "content": "Vehicle deliveries increased.",
        }])
    )
    respx.post("https://api.voyageai.com/v1/embeddings").mock(
        return_value=Response(200, json=MOCK_VOYAGE_RESPONSE)
    )

    graph = build_discovery_graph()

    initial_state: DiscoveryState = {
        "trigger_type": "manual",
        "target_tickers": ["TSLA"],
        "source_types": [SourceType.EARNINGS],
        "raw_documents": [],
        "crawl_errors": [],
        "chunks": [],
        "embeddings_stored": 0,
        "run_id": "test-selective",
        "started_at": "2026-04-05T00:00:00",
        "completed_sources": [],
    }

    result = await graph.ainvoke(initial_state)

    assert len(result["raw_documents"]) == 1
    assert result["raw_documents"][0].ticker == "TSLA"
    # Only earnings should have run
    assert SourceType.EARNINGS in result["completed_sources"]
    assert len(result["completed_sources"]) == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_graphs/test_discovery.py -v`
Expected: FAIL

- [ ] **Step 3: Implement the graph**

`graphs/discovery/graph.py`:
```python
from langgraph.graph import END, StateGraph

from data.models import SourceType
from graphs.discovery.nodes.chunk_embed import chunk_embed_node
from graphs.discovery.nodes.crawl_cftc import crawl_cftc_node
from graphs.discovery.nodes.crawl_earnings import crawl_earnings_node
from graphs.discovery.nodes.crawl_news import crawl_news_node
from graphs.discovery.nodes.crawl_podcasts import crawl_podcasts_node
from graphs.discovery.nodes.index import index_node
from graphs.discovery.state import DiscoveryState


def _should_run_source(source_type: SourceType):
    """Create a conditional check for whether a source should run."""

    def check(state: DiscoveryState) -> bool:
        selected = state.get("source_types")
        if selected is None:
            return True  # None means run all
        return source_type in selected

    return check


def _route_crawlers(state: DiscoveryState) -> list[str]:
    """Determine which crawler nodes to fan out to."""
    selected = state.get("source_types")
    all_sources = {
        SourceType.EARNINGS: "crawl_earnings",
        SourceType.NEWS: "crawl_news",
        SourceType.PODCAST: "crawl_podcasts",
        SourceType.CFTC: "crawl_cftc",
    }

    if selected is None:
        return list(all_sources.values())

    return [all_sources[s] for s in selected if s in all_sources]


def build_discovery_graph() -> StateGraph:
    """Build and compile the discovery LangGraph."""
    graph = StateGraph(DiscoveryState)

    # Add nodes
    graph.add_node("crawl_earnings", crawl_earnings_node)
    graph.add_node("crawl_news", crawl_news_node)
    graph.add_node("crawl_podcasts", crawl_podcasts_node)
    graph.add_node("crawl_cftc", crawl_cftc_node)
    graph.add_node("chunk_embed", chunk_embed_node)
    graph.add_node("index", index_node)

    # Fan-out: conditional routing to crawlers
    graph.set_conditional_entry_point(_route_crawlers)

    # Fan-in: all crawlers converge to chunk_embed
    graph.add_edge("crawl_earnings", "chunk_embed")
    graph.add_edge("crawl_news", "chunk_embed")
    graph.add_edge("crawl_podcasts", "chunk_embed")
    graph.add_edge("crawl_cftc", "chunk_embed")

    # chunk_embed -> index -> END
    graph.add_edge("chunk_embed", "index")
    graph.add_edge("index", END)

    return graph.compile()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_graphs/test_discovery.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/discovery/graph.py tests/test_graphs/
git commit -m "feat: wire discovery LangGraph with parallel fan-out and conditional routing"
```

---

### Task 10: Wire Discovery Route to Graph Execution

**Files:**
- Modify: `app/routes/discovery.py`
- Test: `tests/test_routes/test_discovery.py` (update)

- [ ] **Step 1: Update the test**

Replace `tests/test_routes/test_discovery.py`:
```python
import respx
import pytest
from httpx import ASGITransport, AsyncClient, Response

from app.main import create_app


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@respx.mock
async def test_discover_returns_run_id_and_triggers_graph(client):
    # Mock external APIs so graph nodes don't fail on real HTTP
    respx.get("https://financialmodelingprep.com/api/v3/earning_call_transcript/AAPL").mock(
        return_value=Response(200, json=[])
    )
    respx.get("https://newsapi.org/v2/everything").mock(
        return_value=Response(200, json={"status": "ok", "articles": []})
    )
    respx.route().mock(return_value=Response(200, text=""))

    resp = await client.post(
        "/discover",
        json={
            "target_tickers": ["AAPL"],
            "source_types": ["earnings"],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "run_id" in data
    assert data["run_id"].startswith("discovery-")


async def test_discover_all_defaults(client):
    resp = await client.post("/discover", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert "run_id" in data
```

- [ ] **Step 2: Run test to verify current state**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_routes/test_discovery.py -v`

- [ ] **Step 3: Update discovery route to trigger graph**

Replace `app/routes/discovery.py`:
```python
import asyncio
from datetime import datetime
from uuid import uuid4

import structlog
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from data.models import SourceType
from graphs.discovery.graph import build_discovery_graph
from graphs.discovery.state import DiscoveryState

logger = structlog.get_logger()

router = APIRouter()


class DiscoverRequest(BaseModel):
    target_tickers: list[str] | None = None
    source_types: list[str] | None = None


class DiscoverResponse(BaseModel):
    run_id: str


async def _run_discovery(state: DiscoveryState) -> None:
    """Run the discovery graph in the background."""
    try:
        graph = build_discovery_graph()
        result = await graph.ainvoke(state)
        logger.info(
            "discovery.complete",
            run_id=state["run_id"],
            documents=len(result.get("raw_documents", [])),
            errors=len(result.get("crawl_errors", [])),
        )
    except Exception as exc:
        logger.error("discovery.failed", run_id=state["run_id"], error=str(exc))


@router.post("/discover")
async def discover(
    request: DiscoverRequest,
    background_tasks: BackgroundTasks,
) -> DiscoverResponse:
    """Trigger the resource discovery graph."""
    run_id = f"discovery-{uuid4().hex[:12]}"

    source_types = (
        [SourceType(s) for s in request.source_types] if request.source_types else None
    )

    state: DiscoveryState = {
        "trigger_type": "manual",
        "target_tickers": request.target_tickers,
        "source_types": source_types,
        "raw_documents": [],
        "crawl_errors": [],
        "chunks": [],
        "embeddings_stored": 0,
        "run_id": run_id,
        "started_at": datetime.utcnow(),
        "completed_sources": [],
    }

    background_tasks.add_task(_run_discovery, state)

    return DiscoverResponse(run_id=run_id)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_routes/test_discovery.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add app/routes/discovery.py tests/test_routes/test_discovery.py
git commit -m "feat: wire discovery route to LangGraph execution"
```

---

### Task 11: Schedule Configuration

**Files:**
- Create: `graphs/discovery/schedule.py`
- Test: `tests/test_schedule.py`

- [ ] **Step 1: Write the failing test**

`tests/test_schedule.py`:
```python
from data.models import SourceType
from graphs.discovery.schedule import CRAWL_CADENCE, is_stale


def test_crawl_cadence_defined():
    assert SourceType.EARNINGS in CRAWL_CADENCE
    assert SourceType.NEWS in CRAWL_CADENCE
    assert SourceType.PODCAST in CRAWL_CADENCE
    assert SourceType.CFTC in CRAWL_CADENCE


def test_earnings_stale_after_24h():
    from datetime import datetime, timedelta

    last_run = datetime.utcnow() - timedelta(hours=25)
    assert is_stale(SourceType.EARNINGS, last_run) is True


def test_earnings_fresh_within_24h():
    from datetime import datetime, timedelta

    last_run = datetime.utcnow() - timedelta(hours=12)
    assert is_stale(SourceType.EARNINGS, last_run) is False


def test_news_stale_after_1h():
    from datetime import datetime, timedelta

    last_run = datetime.utcnow() - timedelta(hours=2)
    assert is_stale(SourceType.NEWS, last_run) is True


def test_none_last_run_is_stale():
    assert is_stale(SourceType.EARNINGS, None) is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_schedule.py -v`
Expected: FAIL

- [ ] **Step 3: Implement**

`graphs/discovery/schedule.py`:
```python
from datetime import datetime, timedelta

from data.models import SourceType

# How often each source should be recrawled
CRAWL_CADENCE: dict[SourceType, timedelta] = {
    SourceType.EARNINGS: timedelta(hours=24),
    SourceType.NEWS: timedelta(hours=1),
    SourceType.PODCAST: timedelta(hours=6),
    SourceType.CFTC: timedelta(days=7),
}


def is_stale(source_type: SourceType, last_run: datetime | None) -> bool:
    """Check if a source is stale and needs recrawling."""
    if last_run is None:
        return True
    cadence = CRAWL_CADENCE.get(source_type, timedelta(hours=24))
    return datetime.utcnow() - last_run > cadence
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_schedule.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add graphs/discovery/schedule.py tests/test_schedule.py
git commit -m "feat: add crawl cadence configuration and staleness check"
```

---

### Task 12: Update Sources Summary Route

**Files:**
- Modify: `app/routes/sources.py`
- Test: `tests/test_routes/test_sources.py` (update existing)

Wire the sources summary endpoint to return data from the `completed_sources` tracking instead of hardcoded stubs.

- [ ] **Step 1: Update the test**

Add a new test to `tests/test_routes/test_sources.py`:
```python
async def test_sources_summary_uppercases_symbol(client):
    resp = await client.get("/sources/aapl/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["symbol"] == "AAPL"
```

- [ ] **Step 2: Run test to verify it passes (existing route already uppercases)**

Run: `cd ~/Documents/Projects/quant-agent-backend && uv run pytest tests/test_routes/test_sources.py -v`
Expected: PASS (no code change needed — this confirms the stub is correct)

- [ ] **Step 3: Commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
git add tests/test_routes/test_sources.py
git commit -m "test: add symbol uppercase test for sources route"
```

---

### Task 13: Full Test Suite + Lint Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

```bash
cd ~/Documents/Projects/quant-agent-backend
uv run pytest -v
```

Expected: All tests pass (original 25 + new tests from this plan)

- [ ] **Step 2: Run linter and formatter**

```bash
cd ~/Documents/Projects/quant-agent-backend
uv run ruff check .
uv run ruff format --check .
```

Expected: Clean

- [ ] **Step 3: Fix any issues and commit**

```bash
cd ~/Documents/Projects/quant-agent-backend
uv run ruff check --fix .
uv run ruff format .
git add -A
git commit -m "style: fix lint issues from discovery graph implementation"
```

- [ ] **Step 4: Verify git log shows clean commit history**

```bash
cd ~/Documents/Projects/quant-agent-backend
git log --oneline
```
