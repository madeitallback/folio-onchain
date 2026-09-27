# Status: intent vs. what exists

**This table is the source of truth for what is and isn't built.** [HANDOFF.md](HANDOFF.md) says what we intend; this file says where each intent stands. Update the row when something changes.

- **Aggregator API**: `aggregator-api/` (José). See [../README.md](../README.md).
- **Backend**: `backend/`, served by the Next.js app under `/api/*`. It now takes its catalog from the aggregator and serves the aggregator's endpoints at `/api/v1/*`.
- **Frontend**: `frontend/`, the Next.js app.
- **Owner**: who should build it. `API` = aggregator API, `App` = frontend/backend (partner), `Both`.

Legend: ✅ done · 🟡 partial · ❌ missing · ➖ not applicable · ⏸ later (not MVP)

Updated 2026-09-27, after wiring the aggregator into the backend and redesigning the Explore table. **Section 10 lists every change made to app code**; start there if you're reviewing.

## 1. Product features (MVP)

| # | Intent | Owner | Aggregator API | Backend | Frontend | Notes |
|---|---|---|---|---|---|---|
| 1.1 | Search by ticker or company name | Both | ✅ | ✅ | ✅ | |
| 1.2 | Search by pasting a mint address | Both | ✅ | ✅ | ✅ | |
| 1.3 | Filter by type: stock / ETF / pre-IPO | Both | ✅ | ✅ | ✅ | |
| 1.4 | Filter by issuer | Both | ✅ | ✅ | ✅ | All four issuers in the dropdown |
| 1.5 | Sort by market cap | API | ✅ | ✅ | ✅ | On-chain market cap from Jupiter, summed across versions |
| 1.6 | Sort by 24h volume | API | ✅ | ✅ | ✅ | Jupiter 24h volume. Understates Ondo (RFQ fills, F2) |
| 1.7 | Sort by cost | API | 🟡 | ❌ | ❌ | Table shows the $100 cost but can't sort by it yet. `/v1/search?sort=cost` uses mid price only |
| 1.8 | Group versions by underlying ("SPY → 3 versions") | Both | ✅ | ✅ | ✅ | Grouped by ticker; ISIN exposed. Same company under different tickers isn't merged (F7) |
| 1.9 | Hide versions with no route | Both | ✅ | ✅ | ✅ | Buy now hides confirmed no-route assets. Not-yet-checked ones are listed and checked in the background |
| 1.10 | Rank versions by cost at the user's buy size | API | ✅ | ✅ | ❌ | `/api/v1/underlyings/:ticker?size_usd=`. No UI yet: best fit is the trade panel's provider chooser |
| 1.11 | Exit liquidity per version (sell impact at $10k) | API | ✅ | ✅ | ❌ | In the ranking response; not shown in UI |
| 1.12 | Issuer protection penalty in the ranking | API | ✅ | ✅ | ❌ | Our rating: strongest 0, caveat 0.05, unconfirmed 0.10, weak excluded unless `include_weak=true` |
| 1.13 | "Why this one" per ranked version | API | ✅ | ✅ | ❌ | Plain-language `why` field |
| 1.14 | Ranking formula in one tunable function | API | ✅ | ➖ | ➖ | `aggregator-api/src/ranking.cjs`. Exit floored at 0 (F3) |
| 1.15 | Per version: issuer, chain, contract address | Both | ✅ | ✅ | ✅ | |
| 1.16 | Per version: price impact / cost at a size | Both | ✅ | ✅ | 🟡 | Table: "$100 buy" = cheapest $100 buy across versions vs the stock (impact + fees + premium), with the issuer. Trade panel still shows only the provider fee |
| 1.17 | Per version: dividend handling | Both | ✅ | ✅ | ❌ | `dividends` object (mode, withholding, plain explanation) in `/api/v1/underlyings` and `/api/v1/tokens/:mint`. Payer list is still the seed snapshot (6.3) |
| 1.18 | Per issuer: protection in plain language | Both | ✅ | ✅ | 🟡 | `/api/v1/issuers`; `/api/catalog` issuer `description` is now the protection summary. Not shown next to each version yet |
| 1.19 | Fake detector: paste mint → official or not | API | ✅ | ✅ | 🟡 | `/api/v1/verify/:mint` flags lookalikes. UI search finds official mints but shows no verdict for fakes |
| 1.20 | Buy from the page | App | ➖ | ✅ | ✅ | Jupiter plugin, user's own wallet. **No real-money buy has been tested yet** (see 11) |
| 1.21 | Dense market table | App | ✅ | ✅ | ✅ | Type, versions, price + premium vs stock, stock price, 24h, market cap, volume, $100 buy. 25/50/100 rows (default 50) |

## 2. Principles

| # | Intent | Owner | Aggregator API | Backend | Frontend | Notes |
|---|---|---|---|---|---|---|
| 2.1 | Never hold user funds; the user signs everything | Both | ✅ | ✅ | ✅ | Aggregator is read-only |
| 2.2 | 0% platform fee | Both | ➖ | ✅ | ✅ | Jupiter's own 10 bps fee is included in cost figures |
| 2.3 | Addresses only from official issuer sources | API | ✅ | ✅ | ➖ | xStocks API, Ondo list, Backpack public API, PreStocks products page. Backend no longer has its own address sources |
| 2.4 | …then verified on-chain | API | ✅ | ✅ | ➖ | Every mint read via RPC; must be a real SPL/Token-2022 mint |
| 2.5 | Frontend talks only to our API | App | ➖ | ➖ | 🟡 | Jupiter plugin script loads from `plugin.jup.ag` |
| 2.6 | Upstream keys and rate limits stay server-side | Both | ✅ | ✅ | ✅ | |
| 2.7 | Plain language for end users | Both | 🟡 | ➖ | 🟡 | `why`, `reason`, `dividends.explanation` are plain; the rest is data |

## 3. Domain gotchas

| # | Intent | Owner | Aggregator API | Backend | Frontend | Notes |
|---|---|---|---|---|---|---|
| 3.1 | Token-2022 display multiplier on **balances** | App | ✅ | 🟡 | 🟡 | Aggregator exposes the current multiplier per mint; holdings use the RPC's scaled amount |
| 3.2 | Display multiplier on **prices** | API | ✅ | ✅ | ✅ | Prices are per displayed token, 1:1 with a share |
| 3.3 | Ondo accrual must not look like a premium | API | ✅ | ✅ | ✅ | Same mechanism as xStocks on Solana (F1). Table's premium column is vs the stock |
| 3.4 | Match on mint, never on symbol | Both | ✅ | ✅ | ✅ | |
| 3.5 | Existing ≠ tradable; show cost at a size | Both | ✅ | ✅ | ✅ | $100 route checks; confirmed no-route assets hidden from Buy now |
| 3.6 | Dividends are net of up to 30% US withholding | Both | ✅ | ✅ | ❌ | Ondo 30% confirmed by Ondo; xStocks 30% inferred (Jersey issuer); Backpack unconfirmed (F12). Not shown in UI |
| 3.7 | PreStocks: transfer fee, pause switch, no Jupiter DCA | API | ✅ | ➖ | ❌ | Read from each mint (`transfer_fee_bps`, `pausable`, `dca_compatible`). Fees are 1–3% (F10) |
| 3.8 | Issuers can freeze | Both | ✅ | 🟡 | ✅ | Freeze authority, pause state and permanent delegate exposed per mint; UI disables selling frozen balances |

## 4. Data sources and caching

| # | Source | Owner | Aggregator API | Backend | Frontend | Notes |
|---|---|---|---|---|---|---|
| 4.1 | xStocks catalog | API | ✅ | ✅ | ➖ | 1,124 Solana mints, with ISIN. Backend gets it via the aggregator |
| 4.2 | Ondo token list (CSV) | API | ✅ | ✅ | ➖ | 450 Solana mints. URL overridable with `ONDO_CSV_URL` |
| 4.3 | Backpack token list | API | ✅ | ✅ | ➖ | Public `api.backpack.exchange` assets + securities (CUSIPs): 1,157 mints |
| 4.4 | PreStocks address list | API | ✅ | ✅ | ➖ | No API: read from `prestocks.com/products` (embeds each `splMint`). Breaks if they redesign; the source then reports unavailable |
| 4.5 | Solana RPC mint read | API | ✅ | ✅ | ➖ | Owner program, decimals, supply, authorities, extensions |
| 4.6 | Jupiter price + token stats | API | ✅ | ✅ | ➖ | Price v3 (with stock price + multiplier), Tokens v2 (mcap, volume, verified flag) |
| 4.7 | Jupiter quotes | API | ✅ | ✅ | ➖ | Aggregator: route checks, rankings. Backend: trade panel quotes |
| 4.8 | Route checks ($100 buy) | API | ✅ | ✅ | ✅ | Background queue keeps the ~150 most liquid assets checked (all versions for the top 50), steps aside for user quotes. Buy now and the table read cached results only |
| 4.9 | Underlying stock price history | API | ❌ | ❌ | ❌ | Chart shows token pool history (GeckoTerminal) |
| 4.10 | DEX Screener | App | ➖ | ✅ | ✅ | Still used by the trade panel (price, chart pool). Table no longer uses it |
| 4.11 | Shared cache | API | ✅ | 🟡 | ➖ | Upstash Redis if configured, else disk. Catalog 6h, market 5 min, route checks 30 min, all stale-while-revalidate. Restarts start warm. Backend's own caches are still in memory |

## 5. API endpoints

All aggregator endpoints are also served by the app at `/api/v1/*`.

| # | Endpoint | Aggregator API | Notes |
|---|---|---|---|
| 5.1 | `GET /v1/search` | ✅ | Grouped underlyings, sort mcap/volume/cost/name |
| 5.2 | `GET /v1/underlyings/:ticker?size_usd=` | ✅ | Ranked versions for a size |
| 5.3 | `GET /v1/tokens`, `/v1/tokens/:mint` | ✅ | Full list; full detail per mint |
| 5.4 | `GET /v1/issuers`, `/v1/issuers/:id` | ✅ | Issuer profiles + live counts |
| 5.5 | `GET /v1/verify/:mint` | ✅ | Fake detector |
| 5.6 | `GET /v1/quote?mint=&side=&usd=` | ✅ | One quote, sell size in USD too |
| 5.7 | `GET /v1/route/:mint?usd=100[&cached_only=1]` | ✅ | Route check with $100 cost. `cached_only` never waits on Jupiter; unknown ones get queued |
| 5.8 | `GET /v1/routes?mints=a,b,…` | ✅ | Cached route checks for up to 200 mints (the app sends 40 per call to stay under its URL limit) |
| 5.9 | `GET /v1/health` | ✅ | Includes which cache store is active |

## 6. Seed data

| # | Intent | Owner | Aggregator API | Backend | Frontend | Notes |
|---|---|---|---|---|---|---|
| 6.1 | Fill the missing mints from issuer sources | API | ✅ | ✅ | ➖ | All four issuers from official sources. Seed entries the issuers no longer list stay unconfirmed with a reason |
| 6.2 | Seed mcap / volume / impact as fixtures | API | ➖ | ➖ | ➖ | Replaced by live data |
| 6.3 | Dividend payers from a live feed | API | ❌ | ❌ | ➖ | Still the mid-2026 seed snapshot |

## 7. Later (not MVP)

| # | Intent | Owner | Aggregator API | Backend | Frontend | Notes |
|---|---|---|---|---|---|---|
| 7.1 | Pie-chart plans, paid in USDC | Both | ⏸ | ❌ | 🟡 | UI saves mixes in the browser |
| 7.2 | Schedules | Both | ⏸ | ❌ | 🟡 | Preference only |
| 7.3 | Execution via Jupiter DCA, one order per slice | Both | ⏸ | ❌ | ❌ | `dca_compatible` already computed per mint |
| 7.4 | Enforce ≥ $10 per slice per round | App | ⏸ | ➖ | 🟡 | UI enforces $10 on the total, not per slice |
| 7.5 | Other chains via per-chain adapters | API | ⏸ | ➖ | ➖ | |
| 7.6 | True calendar schedules | Both | ⏸ | ❌ | ❌ | v2 decision |

## 8. In the app but not in the handoff

| # | Feature | Backend | Frontend |
|---|---|---|---|
| 8.1 | Wallet connect (Phantom, Backpack, Solflare) | ➖ | ✅ |
| 8.2 | USDC balance for a wallet | ✅ | ✅ |
| 8.3 | Holdings: SPL + Token-2022 balances | ✅ | ✅ |
| 8.4 | Sell flow (25/50/75/100% back to USDC) | ✅ | ✅ |
| 8.5 | Transaction tracking checked on-chain | ✅ | ✅ |
| 8.6 | Watchlist (browser-local) | ➖ | ✅ |
| 8.7 | Logos across providers | ✅ | ✅ |
| 8.8 | Rate limiting, request dedupe | ✅ | ➖ |
| 8.9 | 90-day token price chart | ✅ | ✅ |

## 9. Findings from live data

Things the live sources showed that the handoff didn't expect.

| # | Finding | Impact |
|---|---|---|
| F1 | **Ondo on Solana also uses the Token-2022 display multiplier** (SPYon ≈ 1.0095), like xStocks. | The seed's `ACCRUE_PER_TOKEN` for Ondo may be wrong on Solana. **Decide** whether to relabel it `REBASE_BALANCE` |
| F2 | **Ondo trades through Jupiter RFQ, not pools.** SPYon shows $9k pool liquidity but fills a $10k sale at about the stock price. | Pool liquidity and volume understate Ondo. Only real quotes measure it, which is why the table shows $100 cost, not liquidity |
| F3 | **Jupiter's mid price for RFQ tokens is stale**, so a sale can look like a gain against it. | Ranking floors exit impact at 0 |
| F4 | **Jupiter's price API includes the underlying stock price.** | All costs are measured against the real stock; no CoinGecko needed |
| F5 | **Weekends:** xStocks pools trade below Friday's close; Ondo RFQ quotes at the close. | xStocks looks cheaper to buy (and costs more to sell) on weekends. Real, not a bug |
| F6 | **Keyless Jupiter allows about 1 quote per second.** | Background route checks and rankings are paced. Set `JUPITER_API_KEY` in production |
| F7 | **Same company, different tickers:** Backpack `SPCX` and PreStocks `SPACEX`. | Not grouped together. Needs an alias map or ISIN matching |
| F8 | **Most listed mints have no market.** ~2,700 verified mints, ~630 with a Jupiter price. | The app only lists verified tokens that have a market (or a sibling version with one) |
| F9 | **Building the catalog from scratch takes ~15–25s.** | Solved by the shared cache: restarts start warm (~0.02s). An empty cache pays it once |
| F10 | **PreStocks transfer fees are 1–3%**, not a flat 1% (OpenAI's mint: 3%). | Read live from each mint |
| F11 | **xAI (PreStocks) expired on 12 Sep 2026**, yet still trades on-chain. | Not detected automatically; PreStocks is excluded from ranking by default (weak protection) |
| F12 | **Dividend withholding happens at the issuer, not the holder.** The issuer's company owns the shares (Ondo: BVI, xStocks: Jersey), so US tax takes 30% before reinvesting, wherever the holder lives. | Explained per version in `dividends`. Backpack's treatment unconfirmed |
| F13 | **Backpack lists 1,157 mints but Jupiter prices only ~63.** | The aggregator borrows the stock price from sibling versions so they can still be quoted and ranked |
| F14 | **Jupiter's "no route" wording varies** ("Failed to get quotes", "Quote not available from market maker"…). | Any rejected quote that isn't a rate limit is treated as "no route", not an outage |

## 10. Changes made to app code (for review)

To wire the aggregator in and fix the Explore table. Frontend token ids and the `/api/catalog` shape are unchanged, so saved plans and watchlists still resolve.

| File | Change |
|---|---|
| `backend/catalog.cjs` | Rewritten as an adapter over the aggregator (`/v1/tokens`, `/v1/issuers`). Keeps the old token shape and adds market fields: `price`, `stockPrice`, `premium`, `change24h`, `liquidity`, `volume24h`, `mcap`. Leaves out verified tokens with no market anywhere |
| `backend/service.cjs` | Serves `/api/v1/*` from the aggregator. Buy now route checks go through the aggregator (`cached_only`) instead of calling Jupiter directly |
| `backend/trading.cjs` | Buy now: page size up to 100; sorts `mcap` and `volume`; default order is featured, then most liquid (was alphabetical, which listed mostly untradable names); probes the most liquid version first; lists not-yet-checked tokens that have a market; answers within a 20s budget |
| `backend/market-data.cjs` | Removed the old xStocks/Ondo catalog fetchers (now in the aggregator). Market, history and quote code unchanged |
| `backend/data/solana-seed.json` | Removed; the aggregator's `docs/solana-stock-tokens.json` is the only seed |
| `backend/tests/*` | Catalog tests rewritten for the adapter; tests for the removed fetchers dropped |
| `frontend/components/Workspace.jsx` | Explore table: new columns (1.21), page size picker (25/50/100, remembered), rows stay on screen while the next page loads, "$100 buy" filled from `/api/v1/routes`, version chips in a fixed issuer order. **Bug fix:** page size used to follow the table's height, so the Retry notice resized it, refetched, cleared the notice and looped forever |
| `frontend/components/Shared.jsx` | Removed `MarketCells` (the table no longer fetches DEX Screener per row) |
| `frontend/app/globals.css` | Scoped `.market-table` styles (36px rows, column widths, responsive hiding) |

## 11. Before production

| # | Item | Status |
|---|---|---|
| 11.1 | Deploy | Nothing above is deployed. folio-onchain.vercel.app still runs the old catalog |
| 11.2 | Shared cache on Vercel | Add Upstash Redis (`UPSTASH_REDIS_REST_URL` / `_TOKEN`, or the Vercel KV integration). Without it every serverless instance rebuilds its own cache |
| 11.3 | Background route checks on Vercel | Serverless instances freeze between requests, so the background queue only runs while requests are in flight. Options: Vercel cron (daily only on Hobby), or run the aggregator as its own always-on service and point the backend at it |
| 11.4 | `JUPITER_API_KEY` | Needed for speed and to avoid rate limits (F6) |
| 11.5 | `SOLANA_RPC_URL` | Dedicated RPC; the public one throttles |
| 11.6 | Real-money acceptance test | Small buy → receipt → sell with a wallet the owner chooses. Not done yet (see `docs/production-readiness.md`) |

## 12. Open questions

| # | Question | Answer so far |
|---|---|---|
| 12.1 | Stack | Node 24, npm workspaces. Next.js 16 frontend, CommonJS backend and aggregator |
| 12.2 | Where does the API run? | Inside the same Vercel deployment as the app (in-process). Could move to its own always-on service (11.3) |
| 12.3 | Solana-only at launch? | Yes |
| 12.4 | Swap: link out or embedded? | Embedded Jupiter plugin |
| 12.5 | Price-history provider | Open |
| 12.6 | Project name | The repo calls it "Folio" |
| 12.7 | Relabel Ondo's dividend mode (F1)? | Open |
