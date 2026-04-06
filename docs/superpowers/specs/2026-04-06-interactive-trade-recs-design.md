# Interactive Trade Recommendation Cards

## Goal

Make trade recommendation cards clickable with an inline-expand detail view showing an interactive payoff chart calculated from live options chain data, real pricing, and a date slider for P&L at different points before expiry.

## Interaction Model

Trade rec cards expand inline when clicked. The collapsed card shows what it shows today: strategy name, direction badge, legs summary. Clicking expands a detail section below the summary. Click again to collapse. Only one card expanded at a time — expanding one collapses any other.

## Expanded Detail Content

Three sections stacked vertically inside the expanded area:

### Pricing Row

For each leg, show actual bid/ask/mid from the options chain data, matched by strike + expiry + type (put/call). Below the legs:

- **Net debit/credit** — sum of mid prices across legs (buys negative, sells positive)
- **Max loss** — calculated from the structure
- **Max profit** — calculated from the structure
- **Breakeven(s)** — strike(s) where P&L crosses zero at expiry

All calculated from real chain prices. If a leg's contract isn't found in the chain (stale data, missing strike), fall back to Claude's estimated greeks with an "estimated" indicator.

### Payoff Chart

Line chart showing P&L across a range of underlying prices. Uses the same charting library as other charts in the app (Recharts).

- **X-axis**: underlying price (range: spot ± 15%)
- **Y-axis**: P&L in dollars
- **Current spot**: vertical reference line
- **Date slider**: scrub from "now" to expiry. At each date, recalculate theoretical option prices using Black-Scholes with the chain's IV, then compute net P&L. At expiry, the curve is the classic kinked payoff diagram.
- **Zero line**: horizontal line at P&L = 0

### Rationale

Full `rationale` and `risk_reward` text from the trade recommendation, displayed with more room than the current cramped card layout.

## Data Flow

No backend changes. All data already available on the page:

- `chain` (from useSWR `/api/options/{symbol}`) — strikes, bids, asks, IVs, expiries
- `quote.price` — current spot price for reference line
- `state.tradeRecs` — strategy, legs, greeks, rationale, risk_reward

### Leg Matching

For each leg in a trade recommendation, find the matching contract in the chain:
1. Match expiry date to the closest chain expiry
2. Match strike price
3. Match type (call/put)
4. Read bid/ask/mid from the matched contract

If no match found, display "EST" badge and use Claude's estimated greeks.

### Black-Scholes Pricing

Pure frontend function for the date slider. Inputs: strike, IV (from chain), spot price, days-to-expiry, option type, risk-free rate (hardcode 5%). Outputs: theoretical option price at any point in time. Used to interpolate P&L between now and expiry.

## File Structure

### New Files

- `src/components/detail/TradeRecDetail.tsx` — expanded detail view (pricing row + rationale)
- `src/components/detail/PayoffChart.tsx` — interactive Recharts payoff chart with date slider
- `src/lib/black-scholes.ts` — Black-Scholes pricing function for theoretical P&L calculation

### Modified Files

- `src/components/detail/TradeRecCards.tsx` — add click-to-expand, pass chain data through, accordion behavior (one open at a time)
- `src/components/detail/AgentPanel.tsx` — pass `chain` and `spotPrice` props down to TradeRecCards

## What We're NOT Building

- No trade execution or order placement
- No position sizing or portfolio-level analysis
- No backend changes
- No persistence of expanded/collapsed state
- No custom chart interactions beyond the date slider
