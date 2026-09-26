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

| Route | Parameters | Result |
| --- | --- | --- |
| `/api/catalog` | none | tokens, issuers, source status, timestamps |
| `/api/market` | id | selected token pool price, 24h change, liquidity, volume |
| `/api/history` | id | daily pool close observations |
| `/api/quote` | id, amount (USDC) | indicative Jupiter route and provider fee |
| `/api/balance` | address | confirmed USDC balance for that Solana wallet |

Only issuer-confirmed Solana mint addresses may reach market/history/quote providers. Research entries use `pending:` IDs and null addresses, even if the input file claimed verification. Seed prices, tax statements, rights and protection ratings are deliberately not promoted into live product claims.

## Wallet and trade boundaries

Folio does not hold funds, create deposit accounts, or store private keys. Wallet connection reveals a public address. The read-only balance endpoint sums accounts for the exact Solana USDC mint with six decimals. Missing RPC data is an error, never a zero balance.

The official Jupiter plugin manages its own wallet connection and user-approved transaction. The top-bar wallet can differ from the wallet connected inside Jupiter; the trade panel explicitly identifies the receiving wallet as the one connected to Jupiter. Each portfolio slice is separate. No batch atomicity or recurring execution is implied. On success, the wallet balance is refreshed, but Folio does not fabricate a holdings ledger.

## Deployment and limits

Vercel project root: `frontend`, framework: Next.js. The npm workspace lockfile stays at repository root. Output tracing includes `backend`. API caches are per warm process; there is no shared durable cache, user database or account-based balance ledger. Provider throttling and public Solana RPC limits can affect availability. For higher traffic, provide a dedicated `SOLANA_RPC_URL` and add shared quotas/cache.

GitHub identity is repository-local and restricted to `madeitallback`. Follow the root `AGENTS.md`; never switch global accounts. Collaborators should work on branches and coordinate changes to API response shapes and shared configuration.
