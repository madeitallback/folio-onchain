# Working together

## Ownership boundaries

- `frontend/app`: Next.js routes and the global stylesheet.
- `frontend/components`: UI, market table, trade dialog, portfolio and wallet connection.
- `frontend/lib`: browser API client, Jupiter loading and allocation math.
- `backend/catalog.cjs`: Solana issuer adapters and provenance.
- `backend/market-data.cjs`: market observations, historical data, quote adapters.
- `backend/wallet.cjs`: read-only USDC balance lookup.
- `backend/service.cjs`: framework-independent API dispatch.
- `backend/data`: sanitized discovery metadata from the supplied JSON. Never a trading allowlist.
- `backend/tests`: deterministic adapter and money-calculation tests.

The frontend talks to `/api/*`; its single Next.js route adapter invokes the backend service. Backend work does not require changing React components. Frontend work does not require editing issuer adapters. One Vercel deployment serves both. `node backend/server.cjs` also runs the backend independently on port 3002 for API development.

## API contract

All routes use GET and return JSON. Errors use `{ "error": "message" }` with a non-2xx status.

| Route              | Parameters                                             | Result                                                   |
| ------------------ | ------------------------------------------------------ | -------------------------------------------------------- |
| `/api/catalog`     | none                                                   | tokens, issuers, source status, timestamps               |
| `/api/market`      | id                                                     | selected token pool price, 24h change, liquidity, volume |
| `/api/history`     | id                                                     | daily pool close observations                            |
| `/api/quote`       | id, side, amount (USDC buy) or raw (atomic token sell) | indicative Jupiter route and provider fee                |
| `/api/balance`     | address                                                | confirmed USDC balance for that Solana wallet            |
| `/api/browse`      | q, issuer, kind, sort, cursor, limit, tickers          | confirmed assets with a checked 100 USDC route           |
| `/api/holdings`    | address                                                | SOL, USDC and supported SPL/Token-2022 holdings          |
| `/api/transaction` | address, signature                                     | verified wallet receipt and chain status                 |
| `/api/health`      | none                                                   | liveness and provider configuration indicators           |

Only issuer-confirmed Solana mint addresses may reach market/history/quote providers. Research entries use `pending:` IDs and null addresses, even if the input file claimed verification. Seed prices, tax statements, rights and protection ratings are deliberately not promoted into live product claims.

## Wallet and trade boundaries

Folio does not hold funds, create deposit accounts, or store private keys. Wallet connection reveals a public address. The read-only balance endpoint sums accounts for the exact Solana USDC mint with six decimals. Missing RPC data is an error, never a zero balance.

The official Jupiter plugin reuses Folio’s connected wallet through its passthrough API. Each portfolio slice remains separate. My assets reads the wallet directly; it is not an internal balance ledger. Activity is stored per wallet in this browser. Signing and Jupiter success callbacks create pending records; the transaction endpoint verifies the signer and chain receipt before displaying confirmation. On confirmation, wallet holdings are refreshed. Unknown status is never automatically retried.

## Deployment and limits

Vercel project root: `frontend`, framework: Next.js. The npm workspace lockfile stays at repository root. Output tracing includes `backend`. API caches are per warm process; there is no shared durable cache, user database or account-based balance ledger. Provider throttling and public Solana RPC limits can affect availability. For higher traffic, provide a dedicated `SOLANA_RPC_URL` and add shared quotas/cache.

GitHub identity is repository-local and restricted to `madeitallback`. Follow the root `AGENTS.md`; never switch global accounts. Collaborators should work on branches and coordinate changes to API response shapes and shared configuration.

API rate limiting is enforced by the Vercel WAF (120 requests/IP/minute), with additional per-instance limits, bounded caches, deduplication and bounded quote queuing. Public data has short CDN caching; wallet and receipt responses are no-store. See production-readiness.md for remaining provider and alert configuration.
