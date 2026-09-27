# Aggregator API

Finds every official on-chain version of a stock or ETF on Solana and ranks them by what a buy of your size actually costs. Read-only: it never holds funds or signs anything.

- Intent: [docs/HANDOFF.md](docs/HANDOFF.md)
- What's built and what isn't: [docs/STATUS.md](docs/STATUS.md)
- Seed research data: [docs/solana-stock-tokens.json](docs/solana-stock-tokens.json)

## Run

Node 24, no dependencies.

```sh
cd aggregator-api
npm start      # http://localhost:3003/v1
npm test       # offline, uses fake upstreams
```

Environment (all optional, server-side only):

| Variable | Why |
|---|---|
| `JUPITER_API_KEY` | Strongly recommended. Without it, quotes are paced about 1 per second and rankings are slow. |
| `SOLANA_RPC_URL` | Dedicated RPC. Defaults to the public mainnet endpoint. |
| `SOLANA_RPC_FALLBACK_URL` | Second RPC for failover. |
| `ONDO_CSV_URL` | Override the Ondo token list URL if the one linked from their docs moves. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Shared cache in Upstash Redis (Vercel KV's `KV_REST_API_URL`/`KV_REST_API_TOKEN` also work). Recommended in production. |
| `AGGREGATOR_CACHE_DIR` | Where the file cache lives when Redis isn't set. Defaults to the OS temp folder. |
| `AGGREGATOR_CACHE=off` | Memory only (tests use this). |
| `AGGREGATOR_PORT` | Default 3003. |

## Using it from the backend

`src/service.cjs` has no HTTP dependency, so the Next.js backend can call it in-process (one Vercel deployment):

```js
const { handle } = require("../../aggregator-api/src/service.cjs");
const { status, body } = await handle("/v1/underlyings/SPY?size_usd=250");
```

Or run it as its own service and call it over HTTP.

## Endpoints

All `GET`, JSON. Errors are `{ "error": { "code", "message" } }` with a 4xx/5xx status.

| Route | Returns |
|---|---|
| `/v1/search?q=&type=stock,etf,pre_ipo&issuer=ondo,xstocks&sort=mcap\|volume\|cost\|name&limit=&offset=&include_unconfirmed=` | Underlyings with `versions_count`, summed market cap and volume, and a `best_version` (largest on-chain market cap) |
| `/v1/underlyings/:ticker?size_usd=100&include_weak=` | Every version ranked for that buy size, each with `est_cost_pct`, `exit_impact_10k_pct`, `score`, `rank` and `why`. Versions that can't be ranked are listed in `not_ranked` with a `reason` |
| `/v1/tokens?issuer=&type=&include_unconfirmed=` | All tokens (summaries) plus source status |
| `/v1/tokens/:mint` | Full detail: on-chain mint data (multiplier, extensions, freeze authority), market data, issuer profile |
| `/v1/issuers`, `/v1/issuers/:id` | Issuer profiles in plain language, plus live token counts |
| `/v1/verify/:mint` | Fake detector: `official`, a `reason`, and `lookalike_of` when a token copies an official symbol |
| `/v1/quote?mint=&side=buy\|sell&usd=` | One Jupiter quote with cost or exit impact in USD terms |
| `/v1/route/:mint?usd=100` | Is there a buy route right now: `route`, `no_route` or `blocked`, with `checked_at`. Remembered 30 min (served up to 24h old while refreshing). The app's Buy now tab uses it |
| `/v1/health` | Liveness, configuration and which cache store is active |

## How the numbers work

- **Prices are per displayed token.** xStocks and Ondo both use a Token-2022 display multiplier on Solana. Jupiter prices already include it, and quotes are converted with the on-chain multiplier, so one displayed token compares 1:1 with one share.
- **`est_cost_pct`** is the effective price of a real Jupiter quote at your size, compared with the underlying stock price (from Jupiter). Every version of a stock is measured against the same reference. Negative means you pay less than the stock price. Off-hours, the stock price is the last close.
- **`exit_impact_10k_pct`** is a real $10k sell quote compared with the token's own market price. It measures liquidity. It's refreshed every 15 minutes.
- **Ranking:** `score = est_cost_pct + 0.25 × max(0, exit_impact_10k_pct) + protection_penalty`. Lower is better. The protection penalty is our own rating of each issuer. All weights live in `src/ranking.cjs`.
- **Verified** means the address comes from the issuer's official source *and* the on-chain account is a real token mint. The seed file's addresses are never used.

## Layout

```text
src/
  service.cjs     routes and response shapes
  server.cjs      standalone HTTP server
  catalog.cjs     merges issuer sources + on-chain checks + seed metadata
  market.cjs      price, market cap, volume snapshot (Jupiter)
  pricing.cjs     cost and exit math
  ranking.cjs     the ranking formula and its weights
  cache.cjs, http.cjs, config.cjs
  dividends.cjs   dividend + withholding explanation per issuer
  sources/        one connector per upstream: xstocks, ondo, backpack, prestocks, solana, jupiter, seed
tests/            node:test, fake upstreams in fixtures.cjs
docs/             handoff, status table, seed data
```

## Caching

Two levels: memory per process, plus a shared store (Upstash Redis when configured, otherwise gzipped files on disk) for the expensive keys, so restarts and new server instances start warm.

| Key | Fresh for | Served stale up to | Store |
|---|---|---|---|
| Catalog (mints, on-chain checks, seed metadata) | 6h | 7 days | shared |
| Price universe (which mints have a market) | 6h | 7 days | shared |
| Market snapshot (prices, mcap, volume) | 5 min | 1h | shared |
| Route checks | 30 min | 24h | shared |
| Quotes at a size, $10k exit probe | 30s, 15 min | — | memory |

A stale value answers immediately while one refresh runs in the background; a lock in the store stops several instances refreshing the same key at once. If a refresh fails, the last good value keeps being served. Only a completely empty cache pays the full build (~15–25s), once.
