# Pre-Computed Scanner Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the scanner page load instantly by pre-computing scanner scores on the backend every 5 minutes and serving them via a GET endpoint, instead of making ~288 Yahoo Finance calls on every page load.

**Architecture:** Backend scheduler already runs `run_scan()` every 5 min — extend it to upsert all 36 ticker scores into a `scanner_results` Postgres table. New `GET /scanner` endpoint returns pre-computed scores. Frontend rewrites its scanner API route to proxy the backend, adds a batch quote route for live prices (~1 Yahoo call), and merges scores + quotes on the page.

**Tech Stack:** Python/SQLAlchemy/Alembic (backend), TypeScript/Next.js/SWR (frontend)

---

### Task 1: Backend — DB model, migration, and repository

**Files:**
- Modify: `/Users/ianrahwan/Documents/Projects/quant-agent-backend/db/models.py`
- Create: `/Users/ianrahwan/Documents/Projects/quant-agent-backend/alembic/versions/` (auto-generated)
- Create: `/Users/ianrahwan/Documents/Projects/quant-agent-backend/data/scanner_repo.py`

- [ ] **Step 1: Add ScannerResult model to db/models.py**

Add at the end of the file, after the `CachedAnalysis` class:

```python
class ScannerResult(Base):
    """Pre-computed scanner scores for instant page load."""

    __tablename__ = "scanner_results"

    symbol: Mapped[str] = mapped_column(String(10), primary_key=True)
    scores: Mapped[dict] = mapped_column(JSON, nullable=False)
    composite: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
```

- [ ] **Step 2: Generate Alembic migration**

Run: `cd /Users/ianrahwan/Documents/Projects/quant-agent-backend && uv run alembic revision -m "add scanner_results table" --autogenerate`

Then verify the generated migration file looks correct (should create `scanner_results` table with 4 columns + index on `created_at`). If autogenerate doesn't add the index, manually add:

```python
op.create_index("ix_scanner_results_created_at", "scanner_results", ["created_at"])
```

- [ ] **Step 3: Create data/scanner_repo.py**

```python
"""Repository for pre-computed scanner results."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import ScannerResult


async def upsert_scanner_result(
    session: AsyncSession,
    symbol: str,
    scores: dict,
    composite: float,
) -> None:
    """INSERT ... ON CONFLICT (symbol) DO UPDATE SET all columns."""
    stmt = insert(ScannerResult).values(
        symbol=symbol,
        scores=scores,
        composite=composite,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["symbol"],
        set_={
            "scores": stmt.excluded.scores,
            "composite": stmt.excluded.composite,
            "created_at": datetime.now(UTC),
        },
    )
    await session.execute(stmt)
    await session.commit()


async def get_all_scanner_results(
    session: AsyncSession,
) -> list[ScannerResult]:
    """SELECT all scanner results ordered by composite score DESC."""
    result = await session.execute(
        select(ScannerResult).order_by(ScannerResult.composite.desc())
    )
    return list(result.scalars().all())


async def delete_stale_scanner_results(
    session: AsyncSession,
    max_age_seconds: int = 600,
) -> None:
    """DELETE rows where created_at < now() - max_age_seconds."""
    cutoff = datetime.now(UTC) - timedelta(seconds=max_age_seconds)
    await session.execute(
        delete(ScannerResult).where(ScannerResult.created_at < cutoff)
    )
    await session.commit()
```

- [ ] **Step 4: Lint and run tests**

Run: `cd /Users/ianrahwan/Documents/Projects/quant-agent-backend && uv run ruff check --fix . && uv run ruff format . && uv run pytest tests/ -v`
Expected: All tests pass, no lint errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/ianrahwan/Documents/Projects/quant-agent-backend
git add db/models.py data/scanner_repo.py alembic/versions/
git commit -m "feat: add ScannerResult model, migration, and repository

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Backend — GET /scanner endpoint and route registration

**Files:**
- Create: `/Users/ianrahwan/Documents/Projects/quant-agent-backend/app/routes/scanner.py`
- Modify: `/Users/ianrahwan/Documents/Projects/quant-agent-backend/app/main.py`

- [ ] **Step 1: Create app/routes/scanner.py**

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_session
from data.scanner_repo import get_all_scanner_results

router = APIRouter()


@router.get("/scanner")
async def get_scanner(session: AsyncSession = Depends(get_session)):
    results = await get_all_scanner_results(session)
    return [
        {
            "symbol": r.symbol,
            "scores": r.scores,
            "composite": r.composite,
            "created_at": r.created_at.isoformat(),
        }
        for r in results
    ]
```

- [ ] **Step 2: Register the route in app/main.py**

Add to the imports (alongside the existing route imports on line 12):

```python
from app.routes import analysis, cached, discovery, health, scanner, sources, stream
```

Add to `create_app()` (after `app.include_router(cached.router)` on line 69):

```python
    app.include_router(scanner.router)
```

- [ ] **Step 3: Lint and run tests**

Run: `cd /Users/ianrahwan/Documents/Projects/quant-agent-backend && uv run ruff check --fix . && uv run ruff format . && uv run pytest tests/ -v`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/ianrahwan/Documents/Projects/quant-agent-backend
git add app/routes/scanner.py app/main.py
git commit -m "feat: add GET /scanner endpoint for pre-computed results

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Backend — Update scheduler to store all scan results

**Files:**
- Modify: `/Users/ianrahwan/Documents/Projects/quant-agent-backend/app/scheduler.py`

- [ ] **Step 1: Update scheduler to upsert all scanner results**

Add imports at the top of `app/scheduler.py`:

```python
from data.scanner_repo import delete_stale_scanner_results, upsert_scanner_result
```

In the `analysis_refresh_loop` function, after `tickers = await run_scan()` and the scan_complete log, add scanner result storage for ALL tickers (before the top-10 analysis loop):

```python
            # Store all scanner scores to DB for instant frontend loading
            async with session_factory() as session:
                for symbol, signals in tickers:
                    scores = signals.model_dump() if hasattr(signals, "model_dump") else signals
                    await upsert_scanner_result(
                        session=session,
                        symbol=symbol,
                        scores=scores,
                        composite=scores.get("composite", 0),
                    )
                await delete_stale_scanner_results(session, max_age_seconds=600)
            logger.info("scheduler.scanner_results_stored", count=len(tickers))
```

This goes between the `logger.info("scheduler.scan_complete", ...)` line and the `for symbol, signals in tickers[:10]:` line.

- [ ] **Step 2: Lint and run tests**

Run: `cd /Users/ianrahwan/Documents/Projects/quant-agent-backend && uv run ruff check --fix . && uv run ruff format . && uv run pytest tests/ -v`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/ianrahwan/Documents/Projects/quant-agent-backend
git add app/scheduler.py
git commit -m "feat: store all scanner results to DB in scheduler loop

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Frontend — Batch quote route and scanner proxy rewrite

**Files:**
- Create: `/Users/ianrahwan/Documents/Projects/quant-agent-service/src/app/api/quotes/route.ts`
- Modify: `/Users/ianrahwan/Documents/Projects/quant-agent-service/src/app/api/scanner/route.ts`

- [ ] **Step 1: Create the batch quote API route**

Create `src/app/api/quotes/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getQuotes } from "@/lib/yahoo";

export async function GET(request: NextRequest) {
  const symbolsParam = request.nextUrl.searchParams.get("symbols");
  if (!symbolsParam) {
    return NextResponse.json({}, { status: 400 });
  }

  const symbols = symbolsParam.split(",").map((s) => s.trim()).filter(Boolean);
  const quotes = await getQuotes(symbols);

  const result: Record<string, { price: number; change: number; changePct: number; name: string }> = {};
  for (const [sym, q] of quotes) {
    result[sym] = {
      price: q.price,
      change: q.change,
      changePct: q.changePct,
      name: q.name,
    };
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" },
  });
}
```

- [ ] **Step 2: Rewrite the scanner API route to proxy the backend**

Replace the entire content of `src/app/api/scanner/route.ts`:

```typescript
import { NextResponse } from "next/server";

const BACKEND_URL =
  process.env.AGENT_BACKEND_URL ||
  process.env.NEXT_PUBLIC_AGENT_BACKEND_URL ||
  "http://localhost:8000";

export async function GET() {
  try {
    const resp = await fetch(`${BACKEND_URL}/scanner`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 120 },
    });

    if (!resp.ok) {
      return NextResponse.json([], {
        headers: { "Cache-Control": "s-maxage=10" },
      });
    }

    const data = await resp.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=60" },
    });
  } catch {
    return NextResponse.json([], {
      headers: { "Cache-Control": "s-maxage=10" },
    });
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/ianrahwan/Documents/Projects/quant-agent-service && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/ianrahwan/Documents/Projects/quant-agent-service
git add src/app/api/quotes/route.ts src/app/api/scanner/route.ts
git commit -m "feat: add batch quote route and rewrite scanner to proxy backend

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Frontend — Update page.tsx to merge scores + quotes

**Files:**
- Modify: `/Users/ianrahwan/Documents/Projects/quant-agent-service/src/app/page.tsx`

- [ ] **Step 1: Update the scanner page to use two SWR calls**

The page currently has one SWR call to `/api/scanner` that returns full `ScanResult[]`. We change it to:

1. `useSWR("/api/scanner")` — returns pre-computed `{ symbol, scores, composite, created_at }[]` from the backend
2. `useSWR("/api/quotes?symbols=...")` — returns `Record<string, { price, change, changePct, name }>` from Yahoo

Then merge them into `ScanResult[]`.

Replace the existing SWR call and results processing (around lines 36-49) with:

```typescript
  // Backend scanner scores (pre-computed, instant)
  interface BackendScannerResult {
    symbol: string;
    scores: {
      iv_percentile: number;
      skew_kurtosis: number;
      dealer_gamma: number;
      term_structure: number;
      vanna: number;
      charm: number;
      composite: number;
    };
    composite: number;
    created_at: string;
  }

  const { data: scanScores, isLoading: scoresLoading } = useSWR<BackendScannerResult[]>(
    "/api/scanner",
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 120_000 }
  );

  // Build symbols list for batch quote
  const symbolsList = useMemo(
    () => (scanScores ?? []).map((r) => r.symbol).join(","),
    [scanScores]
  );

  const { data: quotes } = useSWR<Record<string, { price: number; change: number; changePct: number; name: string }>>(
    symbolsList ? `/api/quotes?symbols=${symbolsList}` : null,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 60_000 }
  );

  const isLoading = scoresLoading;
```

Then add the import for `signalFromScore` and `SCANNER_UNIVERSE`:

```typescript
import { signalFromScore } from "@/lib/types";
import { SCANNER_UNIVERSE } from "@/lib/scanner/universe";
```

Replace the `results` derivation (was `const results = scanResults ?? [];`) with a `useMemo` that merges scores + quotes:

```typescript
  const results: ScanResult[] = useMemo(() => {
    if (!scanScores) return [];

    return scanScores.map((r) => {
      const q = quotes?.[r.symbol];
      const entry = SCANNER_UNIVERSE.find((u) => u.symbol === r.symbol);

      function criterion(score: number): CriterionResult {
        return {
          score,
          rawValue: score,
          label: score >= 0.75 ? "Elevated" : score >= 0.5 ? "Moderate" : score >= 0.25 ? "Low" : "Flat",
          signal: signalFromScore(score),
        };
      }

      return {
        symbol: r.symbol,
        name: q?.name ?? entry?.name ?? r.symbol,
        lastPrice: q?.price ?? 0,
        change: q?.change ?? 0,
        changePct: q?.changePct ?? 0,
        compositeScore: r.composite,
        criteria: {
          ivPercentile: criterion(r.scores.iv_percentile),
          skewKurtosis: criterion(r.scores.skew_kurtosis),
          dealerGamma: criterion(r.scores.dealer_gamma),
          termStructure: criterion(r.scores.term_structure),
          vanna: criterion(r.scores.vanna),
          charm: criterion(r.scores.charm),
        },
        timestamp: new Date(r.created_at).getTime(),
      };
    });
  }, [scanScores, quotes]);
```

Also add `CriterionResult` to the type imports from `@/lib/types`:

```typescript
import type { ScanResult, VixTermStructure, CriterionResult } from "@/lib/types";
```

Remove the old `mutate` from the SWR destructuring (it's no longer needed since we're not triggering manual rescans). If `mutate` is used elsewhere in the file (e.g., in the FunctionBar for a rescan button), keep it.

- [ ] **Step 2: Verify TypeScript compiles and build succeeds**

Run: `cd /Users/ianrahwan/Documents/Projects/quant-agent-service && npx tsc --noEmit && npm run build`
Expected: No type errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /Users/ianrahwan/Documents/Projects/quant-agent-service
git add src/app/page.tsx
git commit -m "feat: merge pre-computed scanner scores with batch quotes for instant load

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
