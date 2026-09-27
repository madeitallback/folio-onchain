# Handoff: Solana stock-token aggregator

Context for a coding agent (Claude Code) joining this project. Read this whole file and `solana-stock-tokens.json` before touching code.

## 0. Your first session: do this in order

1. Read this file and skim `solana-stock-tokens.json` (issuers, tokens, enums).
2. **Explore the frontend repo** (built by the partner). Report back before writing anything:
   - Framework, routing, and which pages/components exist.
   - What data each page expects, and in what shape (mock JSON? hard-coded arrays? fetch calls to a URL?).
   - Any API client, env vars, or base URLs it already assumes.
   - What's clearly unfinished or stubbed.
3. **Compare that against the API contract in section 6.** List the mismatches (field names, missing endpoints, pages with no data source yet).
4. **Propose a backend plan** (stack, folder layout, first 3 endpoints) and **wait for approval** before scaffolding. José owns the backend; the frontend belongs to his partner, so don't edit frontend files unless asked. Suggest changes to them instead.

Ask when something is ambiguous. The two founders have discussed a lot of ideas with different AI sessions, so what's in the repo may not match this doc. **This doc is the source of truth for intent. [STATUS.md](STATUS.md) is the source of truth for what is and isn't built; keep it updated.**

## 1. What we're building

Tokenized stocks and ETFs (real shares held by an issuer, represented as tokens you hold in your own wallet) are spread across several issuers, each with its own tickers, addresses, liquidity, dividend mechanics and legal protections. Copycat meme tokens use the same names. Nobody merges them.

**The product:** search a stock or ETF, see every real on-chain version of it in one place, and know which one to buy.

- Search by ticker or company name. Filter stocks / ETFs / pre-IPO. Sort by market cap, volume and cost.
- **Grouped by underlying**: "SPY → 5 real versions", ranked by what a buy of *your* size actually costs, and how easily you could sell later.
- Per version: issuer, chain, verified contract address, price impact, dividend handling, issuer protection explained in plain language.
- Fake detector: paste a mint address, get "official SPYx" or "not an official mint".
- **Later (not MVP):** DCA investment plans. Pie-chart allocations (e.g. 50% S&P 500 / 30% X / 20% Y), paid in USDC, on a schedule (daily / every N days / weekly / day N of month), executed non-custodially.

**Scope now:** Solana only. Other chains (Ethereum, BNB, Robinhood Chain) come later via one execution adapter per chain; design for that but don't build it.

**Principles**
- Never hold user funds. Swaps and plans are signed by the user's wallet.
- 0% platform fee for v0.
- Contract addresses never come from typing or copy-paste: only from an issuer's official source, then verified on-chain.
- The frontend only talks to our API. Upstream sources, keys and rate limits stay server-side.
- Plain language for end users: we explain the mess, we don't pass it through.

## 2. Reference material

- **Live prototype** (static HTML, the whole finder in one page): https://claude.ai/artifact/GEsVXdW5GbuPsi8vo92EWW. It shows the intended data, columns, filters, and the issuer/dividend explanations.
- **Seed data:** `solana-stock-tokens.json`. 265 Solana tokens plus 4 issuer profiles, snapshot of 26 Sep 2026. Use it to build and test the API. It is **not** live data (see section 5).
- **Design mockups** (dark UI: plan builder with historic-return chart, version comparison, review, portfolio) exist on a private design canvas owned by José. Ask him for screenshots if you need them.

## 3. Domain primer (things that will bite you)

**Issuers on Solana**

| Issuer | Suffix | Dividends | Liquidity model | Protection |
|---|---|---|---|---|
| xStocks (Backed) | `x` (SPYx), mints start with `Xs` | Extra tokens (balance grows) | AMM pools, 24/7. Deep on only ~12 names | Separate legal company, audited; terms allow backing to not always be the actual share |
| Ondo | `on` (SPYon) | Each token represents more shares over time | RFQ (quoted just-in-time), 24/5; wider off-hours | Strongest: bankruptcy-remote, 1:1 + buffer, daily attestations, security agent |
| Backpack Securities | none (SPCX) | Extra tokens | Pools launched via Sunrise | US broker-dealer, real shares, redeemable; non-US self-custody access unconfirmed |
| PreStocks | none (OPENAI) | None, no rights | Meteora/Manifest pools | Weak: SPV exposure to private companies, disputed |

**Gotchas**
- **Token-2022 display multipliers.** xStocks and PreStocks use a scaled UI amount. The raw on-chain balance doesn't change when dividends are paid; the display multiplier does. Always apply the multiplier to balances and prices. Read it from the mint on-chain (Jupiter's Price API also returns it).
- **Ondo price drift.** An Ondo token's price drifts above the stock over time because each token accrues shares. Comparing SPYon to SPY without the multiplier makes it look like a premium.
- **Plain tickers are ambiguous.** Backpack and PreStocks use bare tickers, which copycats also use. Match on mint address, never on symbol.
- **A token existing isn't the same as it being tradable.** Hundreds of xStocks mints have no pool. Always show liquidity or price impact at the user's size.
- **Dividends are net of up to 30% US withholding.** Every issuer reinvests them; nobody pays cash on Solana.
- **PreStocks:** 1% transfer fee on every transfer, a pause switch, and it's excluded from Jupiter DCA (transfer-fee tokens are rejected).
- **Issuers can freeze.** Self-custody protects against an exchange failing, not against the issuer.

**`dividend_mode` enum:** `REBASE_BALANCE`, `ACCRUE_PER_TOKEN`, `NO_PAYOUT`, `NO_RIGHTS`, `UNVERIFIED` (descriptions in the JSON).

## 4. Data sources (backend connectors)

One connector per source, each normalizing into our model. Verify every URL against current docs before relying on it; the ones marked ⚠ weren't confirmed.

| Source | What we take | Notes |
|---|---|---|
| **xStocks public API** `https://api.xstocks.fi/api/v2/public/assets` (paginated, `pageSize` ≤ 100; filters `network`, `underlyingType`, `listingCountry`) | Full catalog, per-chain deployments (mint addresses), ISIN, trading status | Public, no key |
| **Ondo** token list: CSV linked from https://docs.ondo.finance/addresses | Every Ondo token address, per chain | Solana program `XzTT4XB8m7sLD2xi6snefSasaswsKCxx5Tifjondogm`. Mint/redeem API needs a whitelisted, KYC'd wallet, so we only read |
| **Jupiter** (`lite-api.jup.ag` / `api.jup.ag`: Price v3, Swap v1 quote) ⚠ check current paths | Executable prices, quotes at $1k / $10k / user size, verified-token flags, Stocks screener as a coverage checklist | Quote-based depth replaces our static `price_impact_pct`. Integrator fee docs: Swap API allows any bps (fee not supported in Token-2022, so take it in USDC); Ultra requires ≥50 bps |
| **Solana RPC** | Read each mint: owner program, decimals, freeze authority, extensions (transfer fee, scaled UI, pause) | This is the "verified" check |
| **PreStocks API** ⚠ | Marks, multipliers, conversion deadlines | Public projects already consume it; find the endpoint |
| **Backpack / Sunrise** ⚠ | Backpack token list and mints | No public API confirmed |
| **Price history** (Yahoo / Polygon / similar) ⚠ | Underlying stock history for the "5-year return" and plan backtest chart | The mockup chart uses sample data until this exists |

**Refresh cadence (suggested):** catalogs every 6h · prices every 1–5 min · depth quotes every 15 min for liquid names · mint verification on first sight, then daily · multipliers daily and after corporate actions.

## 5. Seed data: `solana-stock-tokens.json`

```jsonc
{
  "schema_version": 1, "snapshot_date": "2026-09-26", "chain": "solana",
  "enums": { "type": [...], "dividend_mode": {...}, "protection_level": [...] },
  "issuers": [{ "id": "ondo", "name": "Ondo", "legal_form": "...", "protection_summary": "...",
                "protection_level": "strongest", "dividend_mode": "ACCRUE_PER_TOKEN",
                "liquidity_model": "...", "trading_hours": "...", "address_source": "...", ... }],
  "tokens": [{ "id": "x-SPY", "underlying_ticker": "SPY", "name": "SPDR S&P 500 ETF",
               "token_symbol": "SPYx", "issuer_id": "xstocks", "chain": "solana", "type": "etf",
               "mint_address": "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", "mint_verified": true,
               "onchain_mcap_usd": 67500000, "volume_24h_usd": 16500000,
               "price_impact_pct": { "usd_1k": 0, "usd_10k": 0.14 },
               "dividend_mode": "REBASE_BALANCE", "pays_dividends": true, "liquidity": "Yes · deep" }]
}
```

- 265 tokens: Ondo 99, xStocks 89, Backpack 64, PreStocks 13.
- **Only 25 mints are filled** (xStocks, read on-chain 11 Sep 2026). Fill the rest from each issuer's `address_source`. Never hand-enter them.
- Market cap and volume are a 25–26 Sep snapshot; price impact is from Jupiter quotes (11 Sep). Not used by the API, which reads them live from Jupiter.
- Which companies pay dividends (`NO_PAYOUT`) is a mid-2026 snapshot. Source it from a dividends feed in production.
- Coverage: the top ~100 by market cap per issuer, not full catalogs. The connectors in section 4 give full coverage.

## 6. Proposed API contract (v1, draft: align it with what the frontend expects)

```
GET  /v1/search?q=spy&type=etf|stock|pre_ipo&issuer=ondo,xstocks&sort=mcap|volume|cost&limit=
     → [{ underlying_ticker, name, type, versions_count, best_version: TokenSummary }]

GET  /v1/underlyings/:ticker?size_usd=100
     → { underlying_ticker, name, type, pays_dividends,
         versions: [TokenSummary + { est_cost_usd, est_cost_pct, exit_impact_10k_pct, rank, why }] }
         // ranked for the given round size: cost first, then exit liquidity, then issuer protection

GET  /v1/tokens/:mint        → Token (full detail, incl. issuer ref, multiplier, extensions, freeze authority)
GET  /v1/issuers             → Issuer[]
GET  /v1/issuers/:id         → Issuer
GET  /v1/verify/:mint        → { official: bool, token?: TokenSummary, reason }   // fake detector
GET  /v1/quote?mint=&side=buy|sell&usd=  → proxied Jupiter quote + price impact (cached briefly)
```

Field names should match the seed JSON, so the frontend can build against fixtures now and switch to the API later.

**Ranking (v1):** `score = est_cost_pct(size) + 0.25 * exit_impact_10k_pct + protection_penalty` (strongest 0, caveat +0.05, unconfirmed +0.10, weak excluded unless asked). Hide tokens with no route. Keep the formula in one tunable function.

## 7. Later: DCA plans (don't build yet; keep the model compatible)

- **Plan** = amount per round in USDC + schedule + slices `[{ underlying, chosen_token_mint, pct }]`.
- **Execution:** Jupiter DCA orders, one per slice. Funds sit in a vault tied to the user's wallet (Privy-managed); output goes straight to the wallet. Constraints: ≥ $10 per round **per slice**, ≥ 2 rounds, max 10 active orders per wallet, interval in seconds (60s–1y). Tokens with transfer-fee or transfer-hook extensions are rejected. Test SPYx and SPYon early, and whether Ondo's RFQ is reachable from DCA routes.
- True calendar schedules ("1st of month") need our own scheduler with session keys (smart wallets). That's a v2 decision.
- The UI validates the $10 slice minimum before signing.

## 8. Open questions for the founders

1. What stack is the frontend (and so the backend: same language / monorepo)?
2. Where does the API run, and is there a database yet?
3. Is the page Solana-only at launch? (Assumed yes.)
4. Swap button in v1: link out to Jupiter, or an embedded swap through our API?
5. Price-history provider for the return charts.
6. Project name. "Stonk Screener" was dropped; no name yet.

## 9. Out of scope for the agent

A project token (launch, fees, buybacks) was discussed and is **parked**. Don't design for it unless asked. Nothing in this project should hold user funds or custody keys.
