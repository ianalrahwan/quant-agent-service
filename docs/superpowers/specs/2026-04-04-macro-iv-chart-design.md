# Macro Overlay & IV Percentile Chart — Design Spec

## Problem

The ticker detail page shows individual vol metrics (skew, term structure, kurtosis, vol surface) but lacks a time series view that lets you:
- See how the ticker's IV percentile has moved over time (spot IV crushes and rises)
- Compare the ticker's price action against macro/geopolitical proxies (Hormuz crisis commodities, defense, China, SPY)
- Project IV forward based on the options chain
- Visually correlate macro events with vol regime changes

## Solution

A dual-axis multi-line time series chart added to the ticker detail page. Pure SVG, no new dependencies.

## Data Architecture

### New API route: `GET /api/macro`

Fetches 1-year daily historical prices for a fixed basket of macro symbols:

| Symbol | Rationale |
|--------|-----------|
| USO | Crude oil — direct Hormuz exposure |
| UNG | Natural gas — downstream energy |
| GLD | Gold — flight to safety |
| ITA | iShares US Aerospace & Defense ETF |
| FXI | iShares China Large-Cap ETF |
| SPY | US equity benchmark |

- Calls `getHistoricalPrices()` for each symbol (reuses existing yahoo.ts)
- Caches with 1-hour TTL (macro data doesn't change fast)
- Returns `Record<string, HistoricalBar[]>`

### New utility: `lib/math/iv-percentile-series.ts`

Computes a rolling IV percentile time series from historical prices:

```typescript
function computeIVPercentileSeries(
  history: HistoricalBar[]
): Array<{ date: string; percentile: number }>
```

- For each trading day, computes 30-day trailing realized vol
- Ranks that day's vol against the trailing 252-day distribution
- Returns percentile (0-100) for each day that has enough history (first ~252 days will be sparse)

### Forward projection

- Uses ATM IV at each expiration from the existing options chain data (up to 7 dates)
- Converts each expiration's ATM IV into a percentile using the same 252-day historical distribution
- Plots as dots extending right from the TODAY marker

### VIX historical

- Fetches 1-year historical data for `^VIX` via `getHistoricalPrices("^VIX")`
- Added to the macro API route response

## Chart Component: `src/components/detail/MacroIVChart.tsx`

### Layout

- Full-width panel in the ticker detail page
- Dual y-axis:
  - **Left axis**: % change from 1 year ago (all price lines normalized to same scale)
  - **Right axis**: IV Percentile (0-100) and VIX level
- **X-axis**: 1 year of trading days + forward projection zone

### Visual hierarchy

Two tiers of lines:

**Hero lines (3px stroke + glow effect):**
- Ticker price line — `#fb8b1e` (orange)
- IV Percentile line — `#ffffff` (white)

**Background lines (1px stroke, 35% opacity):**
- SPY — `#4af6c3` (green)
- USO — `#ff433d` (red)
- UNG — `#0068ff` (blue)
- GLD — `#ff9900` (amber)
- ITA — `#cc66ff` (purple)
- FXI — `#66cccc` (teal)
- VIX — `#ff433d` (red, dashed)

### Features

- **Legend** at top: hero lines get bordered/highlighted labels, macro lines are small and dimmed
- **TODAY marker**: vertical dashed line separating historical from projection
- **Forward projection zone**: subtle shaded area right of TODAY with white dots at each expiration date, connected by dashed line
- **Hover crosshair**: vertical line that follows mouse, tooltip shows all values at that date
- **Grid**: subtle horizontal lines at major tick marks on both axes

### Glow effect

Hero lines rendered twice: once at 6-7px width with low opacity (0.1-0.15) as glow, then at 3px width at full opacity on top.

## Integration

### Detail page changes: `src/app/ticker/[symbol]/page.tsx`

- Add SWR fetch for `/api/macro` and `/api/historical/^VIX`
- New layout: left sidebar (signals) stays, right side becomes 3 rows instead of 2:
  - **Top row (taller)**: MacroIVChart (full width of right side)
  - **Middle row**: Term Structure | IV Skew
  - **Bottom row**: Kurtosis | Vol Surface

### New files

| File | Purpose |
|------|---------|
| `src/app/api/macro/route.ts` | API route fetching macro basket historical data |
| `src/lib/math/iv-percentile-series.ts` | Rolling IV percentile time series computation |
| `src/components/detail/MacroIVChart.tsx` | The chart component |

### Modified files

| File | Change |
|------|--------|
| `src/app/ticker/[symbol]/page.tsx` | Add macro data fetch, add chart panel, adjust grid layout |

## Price normalization

All price lines (ticker + macro basket) normalized to % change from their first data point:

```
pctChange[i] = (price[i] - price[0]) / price[0] * 100
```

This makes all lines comparable on the left y-axis regardless of absolute price levels.

## Error handling

- If macro API fails, chart renders with only the ticker line + IV percentile (graceful degradation)
- Individual macro symbols that fail are omitted silently
- Forward projection only renders if options chain data is available
- Empty/insufficient historical data shows "Need more history" message

## Performance

- Macro data cached 1 hour server-side (in-memory TTL cache)
- SWR client-side caching with `revalidateOnFocus: false`
- SVG rendering is lightweight — no canvas or WebGL needed for ~8 lines x ~252 points
