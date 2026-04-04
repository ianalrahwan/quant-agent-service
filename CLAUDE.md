# Quant Agent Service

## Workflow Methodology

MANDATORY: Follow this workflow for ALL non-trivial work. Never skip phases.

### Phase 1: BRAINSTORM (before any code)
- When the user describes a feature or task, DO NOT write code immediately
- Enter Plan Mode (`/plan`) and produce a design document covering:
  - What problem this solves
  - Architecture: which files, which patterns, how data flows
  - Edge cases and failure modes
  - What we're NOT building (scope boundaries)
- Ask at least one clarifying question before proceeding
- Exit plan mode only after user approves the design

### Phase 2: PLAN (break into tasks)
- Create tasks using TaskCreate for every piece of work
- Each task should be completable in 2-5 minutes
- Tasks must include: exact file path, what to write, how to verify
- Set dependencies between tasks (don't start task 3 before task 2 is done)
- Show the full task list to the user before starting

### Phase 3: EXECUTE (one task at a time)
- Work through tasks sequentially
- Mark each task `in_progress` when starting, `completed` when done
- After completing each task, verify it works (run tests, check imports, etc.)
- If a task reveals something unexpected, STOP and discuss before continuing
- Never batch multiple tasks silently — the user should see progress

### Phase 4: TEST (verify everything)
- Write tests BEFORE or ALONGSIDE implementation (TDD when possible)
- Run all tests after each task completes
- If tests fail, fix before moving to next task
- Integration tests after all unit tests pass

### Phase 5: REVIEW (before committing)
- Run `/simplify` or equivalent review on all changed files
- Check for: security issues, type safety, error handling, unnecessary complexity
- Remove any code that was added "just in case"
- Verify the implementation matches the Phase 1 design

## Project Architecture

```
quant-agent-service/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── config.py            # Settings, env vars
│   ├── dependencies.py      # Dependency injection
│   └── routes/
│       ├── analysis.py      # POST /analyze, /analyze/stream
│       ├── agents.py        # GET /agents, GET /agents/{id}
│       └── health.py        # GET /health
├── agents/
│   ├── base.py              # BaseAgent ABC with typed I/O
│   ├── registry.py          # Agent registration + discovery
│   ├── vol_surface.py       # IV percentile, term structure, skew
│   ├── dealer_flows.py      # Karsan: autocorrelation, gamma regime, vanna
│   ├── distribution.py      # Taleb: kurtosis, leptokurtosis, fat tails
│   └── risk_manager.py      # Position sizing, correlation, drawdown
├── orchestrator/
│   ├── pipeline.py          # LangGraph DAG or async orchestration
│   ├── state.py             # Typed state passed between nodes
│   └── aggregator.py        # Signal aggregation + conflict resolution
├── data/
│   ├── market_data.py       # Async market data fetching
│   ├── cache.py             # Redis/in-memory cache layer
│   └── models.py            # Pydantic models for market data
├── models/
│   ├── request.py           # API request schemas
│   ├── response.py          # API response schemas with Greeks
│   └── signals.py           # Agent signal types
├── tests/
│   ├── conftest.py          # Fixtures, mock data
│   ├── test_agents/         # Unit tests per agent
│   ├── test_orchestrator/   # Pipeline integration tests
│   └── test_routes/         # API endpoint tests
├── pyproject.toml
├── Dockerfile
└── README.md
```

## Code Standards

- Python 3.12+, type hints everywhere, Pydantic v2 for all I/O
- Async by default (FastAPI + httpx + asyncio)
- No print statements — use structlog
- Tests: pytest + pytest-asyncio + httpx for API tests
- Every agent must have: typed input, typed output, deterministic computation + LLM synthesis
- Separate pure computation (testable, no LLM) from LLM interpretation (requires mocking)

## Domain Context

This service orchestrates quantitative volatility analysis agents for a hedge fund.
Key domain concepts the developer should understand:
- IV Percentile (not IV Rank) for vol cheapness
- Leptokurtosis and fat tails vs Black-Scholes assumptions
- Dealer gamma regimes (long gamma dampens, short gamma amplifies)
- Vanna (dDelta/dVol) and charm (dDelta/dTime) flows
- Vol term structure (contango vs backwardation)
- The difference between commodity vol and equity vol regimes
