| 6.1 | Fill the missing mints from issuer sources | API | ✅ | 🟡 | ➖ | xStocks 1,124, Ondo 450, Backpack 1,157, PreStocks 9. Seed entries the issuers no longer list stay `unconfirmed` with a reason || 3.7 | PreStocks: transfer fee, pause switch, excluded from Jupiter DCA | API | ✅ | ❌ | ❌ | Read from each mint: `transfer_fee_bps`, `pausable`, `dca_compatible`. Fees are 1–3%, not 1% (F10) || 3.6 | Explain dividends are net of up to 30% US withholding | Both | ✅ | ❌ | ❌ | `dividends.explanation` in plain language. Ondo 30% confirmed by Ondo; xStocks 30% inferred (Jersey issuer; xStocks says only "net of applicable taxes"); Backpack unconfirmed. See F12 || 2.3 | Addresses only from official issuer sources | API | ✅ | 🟡 | ➖ | xStocks API, Ondo list, Backpack public API, PreStocks' own products page || 1.17 | Per version: dividend handling (`dividend_mode`) | Both | ✅ | 🟡 | ❌ | `dividends` object in `/v1/underlyings` and `/v1/tokens/:mint`. Payer list is still the seed snapshot (6.3). See F1 for Ondo |# Status: intent vs. what exists

**This table is the source of truth for what is and isn't built.** [HANDOFF.md](HANDOFF.md) says what we intend; this file says where each intent stands. Update the row when something changes.

- **Aggregator API**: `aggregator-api/` (José). See [../README.md](../README.md).
- **Backend**: the existing `backend/` service, served by the Next.js app under `/api/*`.
- **Frontend**: the existing `frontend/` Next.js app.
- **Owner**: who should build it. `API` = aggregator API, `App` = the existing app (partner), `Both`.

Legend: ✅ done · 🟡 partial · ❌ missing · ➖ not applicable · ⏸ later (not MVP)

Backend and frontend checked against commit `3331fe5`. Aggregator column updated 2026-09-27. The aggregator isn't wired into the backend yet, so nothing in the app uses it.

## 1. Product features (MVP)

| # | Intent | Owner | Aggregator API | Backend | Frontend | Notes |
|---|---|---|---|---|---|---|
| 1.1 | Search by ticker or company name | Both | ✅ | ✅ | ✅ | `/v1/search?q=`. Exact ticker matches first |
| 1.2 | Search by pasting a mint address | Both | ✅ | ✅ | ✅ | |
| 1.3 | Filter by type: stock / ETF / pre-IPO | Both | ✅ | ✅ | ✅ | |
| 1.4 | Filter by issuer | Both | ✅ | ✅ | ✅ | |
| 1.5 | Sort by market cap | API | ✅ | ❌ | ❌ | Live on-chain market cap from Jupiter, summed per underlying |
| 1.6 | Sort by 24h volume | API | ✅ | ❌ | ❌ | Jupiter 24h buy+sell volume. Understates Ondo (RFQ fills) |
| 1.7 | Sort by cost (for your size) | API | 🟡 | ❌ | ❌ | Search sorts by the leading version's mid price vs the stock. A real size-based cost needs quotes, which only `/v1/underlyings` does |
| 1.8 | Group versions by underlying ("SPY → 5 versions") | Both | ✅ | 🟡 | 🟡 | Grouped by ticker; ISIN is exposed. See finding F7 |
| 1.9 | Hide versions with no route | Both | 🟡 | ✅ | ✅ | `/v1/underlyings` moves no-route versions to `not_ranked`. Search doesn't check routes |
| 1.10 | Rank versions by cost at the user's buy size | API | ✅ | ❌ | ❌ | Real Jupiter quote at `size_usd`, measured against the stock price |
| 1.11 | Exit liquidity per version (sell impact at $10k) | API | ✅ | ❌ | ❌ | Real $10k sell quote, cached 15 min |
| 1.12 | Issuer protection penalty in the ranking | API | ✅ | ❌ | ❌ | Our rating: strongest 0, caveat 0.05, unconfirmed 0.10, weak excluded unless `include_weak=true` |
| 1.13 | "Why this one" explanation per ranked version | API | ✅ | ❌ | ❌ | Plain-language `why` per version |
| 1.14 | Ranking formula in one tunable function | API | ✅ | ❌ | ➖ | `src/ranking.cjs`. Exit is floored at 0 (finding F3) |
| 1.15 | Per version: issuer, chain, contract address | Both | ✅ | ✅ | ✅ | |
| 1.16 | Per version: price impact at the user's size | Both | ✅ | 🟡 | ❌ | `price_impact_pct` (vs token mid) plus `est_cost_pct` (vs stock) |
| 1.17 | Per version: dividend handling (`dividend_mode`) | Both | 🟡 | 🟡 | ❌ | From the seed snapshot. Tokens not in the seed get `UNVERIFIED`. See finding F1 for Ondo |
| 1.18 | Per issuer: protection explained in plain language | Both | ✅ | ❌ | ❌ | `/v1/issuers` serves the full seed profiles plus live counts |
| 1.19 | Fake detector: paste mint → "official SPYx" / "not an official mint" | API | ✅ | 🟡 | 🟡 | `/v1/verify/:mint`. Flags lookalikes that copy an official symbol |
| 1.20 | Swap (buy) from the page | App | ➖ | ✅ | ✅ | Embedded Jupiter plugin with the user's own wallet |

## 2. Principles

| # | Intent | Owner | Aggregator API | Backend | Frontend | Notes |
|---|---|---|---|---|---|---|
| 2.1 | Never hold user funds; the user signs everything | Both | ✅ | ✅ | ✅ | Aggregator is read-only |
| 2.2 | 0% platform fee | Both | ➖ | ✅ | ✅ | Jupiter's own 10 bps fee is included in `est_cost_pct` |
| 2.3 | Addresses only from official issuer sources | API | 🟡 | 🟡 | ➖ | xStocks API ✅, Ondo list ✅, Backpack 1 of 64, PreStocks 0 of 13 |
| 2.4 | …then verified on-chain | API | ✅ | ❌ | ➖ | Every mint read via RPC; must be a real SPL/Token-2022 mint |
| 2.5 | Frontend talks only to our API | App | ➖ | ➖ | 🟡 | Jupiter plugin script loads straight from `plugin.jup.ag` |
| 2.6 | Upstream keys and rate limits stay server-side | Both | ✅ | ✅ | ✅ | |
| 2.7 | Plain language for end users | Both | 🟡 | ➖ | 🟡 | `why` and `reason` fields are plain; the rest is data |

## 3. Domain gotchas

| # | Intent | Owner | Aggregator API | Backend | Frontend | Notes |
|---|---|---|---|---|---|---|
| 3.1 | Apply the Token-2022 display multiplier to **balances** | App | ✅ | 🟡 | 🟡 | Aggregator exposes the current multiplier per mint; balances are app side |
| 3.2 | Apply the display multiplier to **prices** | API | ✅ | ❌ | ❌ | Jupiter prices are per displayed token; quotes are converted with the on-chain multiplier |
| 3.3 | Normalize Ondo accrual so SPYon doesn't look like a premium | API | ✅ | ❌ | ❌ | Handled the same way as xStocks (finding F1) |
| 3.4 | Match on mint, never on symbol | Both | ✅ | ✅ | ✅ | |
| 3.5 | A token existing ≠ tradable; show liquidity/impact at the user's size | Both | ✅ | 🟡 | 🟡 | `/v1/underlyings` quotes at the user's size |
| 3.6 | Explain dividends are net of up to 30% US withholding | Both | ❌ | ❌ | ❌ | Not in any response yet |
| 3.7 | PreStocks: 1% transfer fee, pause switch, excluded from Jupiter DCA | API | 🟡 | ❌ | ❌ | Transfer fee, pause and `dca_compatible` are read for every mint, but no PreStocks mints are confirmed yet |
| 3.8 | Issuers can freeze | Both | ✅ | 🟡 | ✅ | Mint freeze authority, pausable/paused, permanent delegate exposed |

## 4. Data sources (connectors)

| # | Source | Owner | Aggregator API | Backend | Frontend | Notes |
|---|---|---|---|---|---|---|
| 4.1 | xStocks catalog | API | ✅ | ✅ | ➖ | 1,124 Solana mints, with ISIN |
| 4.2 | Ondo token list (CSV) | API | ✅ | ✅ | ➖ | 450 Solana mints. URL overridable with `ONDO_CSV_URL` |
| 4.3 | Solana RPC mint read | API | ✅ | ❌ | ➖ | Owner program, decimals, supply, authorities, extensions |
| 4.4 | Jupiter quotes | API | ✅ | ✅ | ➖ | `api.jup.ag/swap/v2/order`, includes RFQ |
| 4.5 | Depth quotes at fixed sizes | API | 🟡 | ❌ | ➖ | $10k exit probe + the user's size. No fixed $1k probe |
| 4.6 | Jupiter Price API / verified flags / Stocks screener | API | 🟡 | ❌ | ➖ | Price v3 ✅ (with stock price + multiplier), Tokens v2 ✅ (mcap, volume, verified). Screener ❌ |
| 4.7 | PreStocks address list | API | ✅ | ❌ | ➖ | No API. Read from `prestocks.com/products`, which embeds each product's `splMint`. Breaks if they redesign the page (the connector then reports the source unavailable) |
| 4.8 | Backpack token list | API | ✅ | 🟡 | ➖ | Public `api.backpack.exchange/api/v1/assets` (Solana mints) joined with `/api/v1/securities` (CUSIPs): 1,157 mints |
| 4.9 | Underlying stock price history | API | ❌ | ❌ | ❌ | Backend has token pool history only |
| 4.10 | DEX Screener | — | ➖ | ✅ | ✅ | Not used by the aggregator |
| 4.11 | Refresh cadence | API | 🟡 | 🟡 | ➖ | In-memory TTLs (catalog 6h, market 5 min, depth 15 min). No scheduler or shared cache; a cold start takes ~15–20s |

## 5. API contract (handoff §6)

| # | Endpoint | Aggregator API | Closest thing in backend | Notes |
|---|---|---|---|---|
| 5.1 | `GET /v1/search` | ✅ | 🟡 `/api/browse` | |
| 5.2 | `GET /v1/underlyings/:ticker?size_usd=` | ✅ | ❌ | |
| 5.3 | `GET /v1/tokens/:mint` | ✅ | 🟡 `/api/catalog` | |
| 5.4 | `GET /v1/issuers`, `/v1/issuers/:id` | ✅ | 🟡 in `/api/catalog` | |
| 5.5 | `GET /v1/verify/:mint` | ✅ | ❌ | |
| 5.6 | `GET /v1/quote?mint=&side=&usd=` | ✅ | ✅ `/api/quote` | Sell size is given in USD too |
| 5.7 | `GET /v1/tokens` (not in handoff) | ✅ | 🟡 `/api/catalog` | Full list, for the backend to consume |
| 5.8 | Backend consumes the aggregator | ❌ | ❌ | Not wired. Call `handle()` in-process or over HTTP |

## 6. Seed data

| # | Intent | Owner | Aggregator API | Backend | Frontend | Notes |
|---|---|---|---|---|---|---|
| 6.1 | Fill the missing mints from issuer sources | API | 🟡 | 🟡 | ➖ | xStocks and Ondo full. Backpack 63 and PreStocks 13 still unconfirmed, returned with `unconfirmed_reason` |
| 6.2 | Seed mcap / volume / impact as fixtures | API | ➖ | ❌ | ❌ | Replaced by live data. Tests use their own fixtures |
| 6.3 | Dividend payers from a live dividends feed | API | ❌ | ❌ | ➖ | Still the mid-2026 seed snapshot |

## 7. Later (not MVP)

| # | Intent | Owner | Aggregator API | Backend | Frontend | Notes |
|---|---|---|---|---|---|---|
| 7.1 | Pie-chart plans, paid in USDC | Both | ⏸ | ❌ | 🟡 | UI saves mixes in the browser |
| 7.2 | Schedules | Both | ⏸ | ❌ | 🟡 | Preference only |
| 7.3 | Execution via Jupiter DCA, one order per slice | Both | ⏸ | ❌ | ❌ | `dca_compatible` is already computed per mint |
| 7.4 | Enforce ≥ $10 per slice per round | App | ⏸ | ➖ | 🟡 | UI enforces $10 on the total, not per slice |
| 7.5 | Other chains via per-chain adapters | API | ⏸ | 🟡 | ➖ | |
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
| 8.8 | Rate limiting, caching, request dedupe | ✅ | ➖ |
| 8.9 | 90-day token price chart | ✅ | ✅ |

## 9. Findings from live data (2026-09-27)

Things the live sources showed that the handoff didn't expect. Decide on each.

| # | Finding | Impact |
|---|---|---|
| F1 | **Ondo on Solana also uses the Token-2022 display multiplier** (SPYon ≈ 1.0095), like xStocks. With it applied, SPYon's price matches SPY. | The seed's `ACCRUE_PER_TOKEN` for Ondo may be wrong on Solana. Decide whether to relabel it `REBASE_BALANCE` |
| F2 | **Ondo trades through Jupiter RFQ (JupiterZ), not pools.** SPYon shows $9k pool liquidity and $700 of 24h volume, but fills a $10k sale at about the stock price. | Liquidity and volume figures badly understate Ondo. Only real quotes measure it, which is what the ranking uses |
| F3 | **Jupiter's mid price for RFQ tokens is stale**, so a sale can look like a gain against it (QQQon: −0.75%). | Ranking floors exit impact at 0; the raw value is still returned |
| F4 | **Jupiter returns the underlying stock price** in its price API. | Costs are measured against the real stock |
| F5 | **Weekends:** AMM pools (xStocks) trade below Friday's close, while RFQ (Ondo) quotes at the close. | xStocks looks cheaper to buy and costs more to sell on weekends. That's real, not a bug |
| F6 | **Keyless Jupiter quotes are limited to about 1 per second.** | Rankings take 5–12s without `JUPITER_API_KEY`. Set it in production |
| F7 | **Same company, different tickers:** Backpack `SPCX` and PreStocks `SPACEX` are both SpaceX. | They aren't grouped together. Needs an alias map or ISIN matching |
| F8 | **xStocks lists 1,124 Solana mints**, but only ~560 tokens across all issuers have a Jupiter price. | Most listed mints have no market. Search shows verified mints; ranking hides no-route ones |
| F9 | **Cold start builds the whole catalog in ~20–25s** (xStocks pages, Ondo CSV, Backpack API, PreStocks page, ~28 RPC calls, a price scan of ~2,700 mints). | On Vercel serverless every cold instance pays this. Needs a shared cache or a scheduled refresh |
| F10 | **PreStocks transfer fees are 1–3%**, not a flat 1% (OpenAI's mint: 3%, xAI: 1%). | Read live from each mint. Quoted costs for PreStocks are 7%+ at $100 |
| F11 | **xAI (PreStocks) expired on 12 Sep 2026** ("swap into SPACEX … or it will expire worthless"), yet it still trades on-chain at ~$81 with $180 liquidity. | Not detected automatically. PreStocks is excluded from ranking by default anyway (weak protection) |
| F12 | **Withholding happens at the issuer, not the holder.** The issuer's company owns the real shares and receives dividends as a foreign entity (Ondo: BVI, xStocks: Jersey), so US tax takes 30% before reinvesting. The holder's country doesn't change it. | Explained per version in `dividends`. Backpack's treatment is unconfirmed |
| F13 | **Backpack lists 1,157 Solana mints but Jupiter prices only ~63.** Most can still be quoted: the API borrows the stock price from sibling versions to size and measure them (`price_source: "underlying"`). | Backpack versions often rank last on thin liquidity (NVDA: 3.9% to buy $500) |

## 10. Open questions (handoff §8)

| # | Question | Answer so far |
|---|---|---|
| 10.1 | Stack | Node 24, npm workspaces. Next.js 16 frontend, plain CommonJS backend and aggregator |
| 10.2 | Where the API runs, database? | Vercel. No database; caches are in memory |
| 10.3 | Solana-only at launch? | Yes |
| 10.4 | Swap: link out or embedded? | Embedded Jupiter plugin |
| 10.5 | Price-history provider | Open |
| 10.6 | Project name | The repo calls it "Folio" |
