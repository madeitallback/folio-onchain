# Folio

Stocks and ETFs, all in one place. A Solana-first discovery app with issuer comparisons, live token-market data, wallet USDC balances and Jupiter swaps.

Live: https://folio-onchain.vercel.app
Repository: https://github.com/madeitallback/folio-onchain

## Development

Requires Node.js 24.

```sh
npm ci
npm run dev
npm test
npm run build
```

Next.js runs at http://localhost:3000. For a different port: `npm run dev --workspace @folio/frontend -- --port 3001`.

## Repository layout

```text
/frontend
  /app            Next.js pages, styles, thin API adapter
  /components     Explore table, trade panel, portfolio, wallet UI
  /lib            Browser API client, allocation math, Jupiter integration
/backend
  catalog.cjs     Official Solana catalogs and discovery metadata
  market-data.cjs Prices, history and indicative quotes
  wallet.cjs      Wallet holdings and verified transaction receipts
  trading.cjs     Live routes, buy/sell quotes and amount validation
  infrastructure.cjs Bounded caches, retries and request limits
  service.cjs     Framework-independent API handlers
  server.cjs      Optional standalone local API server
  /data           Sanitized reference catalog
  /tests          Adapter and allocation tests
/docs
  architecture.md API contract and collaboration boundaries
```

Frontend and backend can be edited separately. Next.js exposes the backend through `/api/*`; `npm start --workspace @folio/backend` runs the same service independently on port 3002. See [architecture.md](docs/architecture.md).

## Product

- Explore is the default page. A viewport-sized, paginated table replaces the long page of cards. Its page size adapts to available height.
- Search by ticker, company or mint; filter by provider, instrument type and buyable/all listings; save a watchlist.
- Open an asset to choose its provider, see live price/liquidity/history, preview a quote, and open an official Jupiter swap with token and USDC amount prefilled.
- Connect Phantom, Backpack or Solflare to read the wallet's actual Solana USDC balance. Errors never become invented zero balances.
- Portfolio building is secondary. Save/export mixes locally and buy each slice separately. Recurring schedules are preferences, not active orders.

## Sources and boundaries

xStocks uses its public API. Ondo uses the official token CSV linked from https://docs.ondo.finance/addresses, including Solana deployments. Backpack HOOD is confirmed against its [issuer announcement](https://learn.backpack.exchange/blog/tokenized-robinhood-hood). Other Backpack and PreStocks research listings remain visible with buying disabled until their addresses are confirmed.

The supplied JSON enriches names, instrument categories and discovery listings. Its historical volumes, valuations, risk rankings and legal/tax claims are not live data. A snapshot's `mint_verified` flag does not authorize trading. Current issuer records or documented primary-source addresses do.

DEX Screener supplies token pool observations; GeckoTerminal supplies daily pool history. They are not stock-exchange quotes or total-return backtests. The table uses the first confirmed provider's indexed pool, not an assertion of the best available price. The provider chooser shows each selected version's own data. Missing data stays missing.

Folio does not custody funds or create deposit accounts. Jupiter receives the existing wallet connection from Folio and manages the final quote and signing flow. The user approves each transaction. No live transaction was submitted in development. Folio configures no referral fee; provider/network fees still apply. Region and issuer restrictions remain applicable.

## Configuration

Production server-only environment variables (configure in Vercel, or `frontend/.env.local` locally):

- `SOLANA_RPC_URL`: dedicated mainnet Solana RPC; defaults to the public mainnet endpoint, which may throttle requests.
- `SOLANA_RPC_FALLBACK_URL`: optional independent RPC for failover.
- `JUPITER_API_KEY`: dedicated Jupiter quote API key.

Do not expose either through `NEXT_PUBLIC_*` or commit credentials. Data caches are per warm server instance; persistent accounts, a durable shared cache, automatic investments and atomic basket execution are not implemented.

## Deployment

The existing Vercel project uses root directory `frontend` and the Next.js framework preset. The repository-root lockfile manages both workspaces; output tracing includes the backend. Deploy from the repository root using the existing local link:

```sh
vercel deploy --prod --scope vv13-1672
```

GitHub operations must use only `madeitallback`, with the project-isolated GitHub CLI configuration described in `AGENTS.md`. Other projects' global account settings are untouched. Browser-local plans from localhost are separate from plans saved on the production origin.

## Solana beta

Buy now checks a 100 USDC Jupiter route before listing an asset. My assets reads actual token balances and supports percentage-based sales. Transaction activity is browser-local and verified through RPC; confirmation is never inferred solely from a Jupiter callback. See [production-readiness.md](docs/production-readiness.md) for configuration, operations and the owner-approved real-money acceptance test still outstanding. The deferred multi-chain idea is saved in [robinhood-roadmap.txt](docs/robinhood-roadmap.txt).
