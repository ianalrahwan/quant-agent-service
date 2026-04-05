# Quant Agent Service

## Workflow

- For non-trivial work, use the superpowers plugin workflow (brainstorming, planning, execution)
- Do NOT write code immediately for new features — brainstorm and plan first
- Ask clarifying questions before proceeding
- Track tasks and show progress to the user
- Verify after each task (run tests, check imports, etc.)
- Run `/simplify` before committing

## Project Architecture

- This is the goal end state. We are still working on a front end to iterate with that shows a terminal like 2000s Bloomberg

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
- UV for dependency management
- LangGraph for node-based context management
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
