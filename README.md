# Folio

A dependency-free tokenized-stock discovery and personal basket builder with live public data and an embedded Jupiter swap interface.

## Run

Node.js 20 or newer: `npm start`, then open http://localhost:3000. Internet access is required. The server binds only to 127.0.0.1. Run `npm run check` and `npm test` for validation. Opening index.html directly does not support the API.

## Working features

- Live issuer catalogs grouped by underlying ticker, network/issuer filters, verified token addresses, source links and watchlists.
- Separate token identities for every issuer/network combination. No silent substitutions between different securities products.
- DEX pool prices, liquidity, volume, daily changes, and up to 90 daily historical closes.
- Custom baskets, cent-preserving allocation, investment amounts and locally saved/exportable plans.
- Live indicative USDC quotes for Solana. An official Jupiter modal prefills the selected verified output token and per-slice amount. The user connects a wallet and approves each trade themselves. No keys or signing requests pass through the Folio server.
- Other networks provide market or contract links, not integrated execution.
- Dark responsive interface; explicit loading, missing-market and provider-error states.

## Sources and limits

| Data | Source | Cache |
| --- | --- | --- |
| xStocks deployments | https://api.xstocks.fi/api/v2/public/assets | 15 minutes |
| Ondo deployments | https://github.com/ondoprotocol/ondo-global-markets-token-list | 15 minutes |
| Pool observations | https://docs.dexscreener.com/api/reference | 60 seconds |
| Daily token pool history | https://www.geckoterminal.com/dex-api | 5 minutes |
| Indicative quotes | https://dev.jup.ag/docs/swap | uncached, paced |
| Embedded swap | https://dev.jup.ag/docs/tool-kits/plugin | loaded on request |

Coverage depends on the public issuer feeds. A deployment count is not a count of liquid markets. Some networks or issuers are missing. Contract matching establishes catalog provenance, not an independent audit or endorsement. Prices are on-chain token pool observations, not licensed stock-exchange prices or guaranteed executable offers. Pool history is not underlying-stock total return or a basket backtest. Missing data stays missing; no synthetic prices or returns are inserted.

Jupiter quotes can become stale immediately. The widget requotes and handles the user's transaction approval separately. No live transaction was executed during development. Token display multipliers may differ from raw units. There is no Folio platform fee or referral fee configured; provider fees, slippage and network costs still apply. The top-bar wallet connector reads a public address; the Jupiter widget manages its own wallet session.

Optional `JUPITER_API_KEY` is read only by the server for the quote API. Never put it in client JavaScript. Public provider limits may change; failures are shown in the interface.

## Scope

This is a local MVP, not a launched brokerage or a registered ETF. A basket is a personal plan. Automatic recurring purchases, pooled ownership, atomic multi-asset execution, bridging, portfolio balance tracking and a production eligibility/onboarding system are not implemented. Issuer and venue restrictions still apply. Each trade is independent and may fail; no all-or-nothing basket guarantee exists.

Plans and watchlists are browser-local, with no cloud account or backend persistence. Do not clear browser storage without exporting wanted plans. Personal content from the supplied design conversation is not included.

For public deployment, first implement durable provider quotas/cache, operational monitoring, deployment security controls, jurisdiction-aware eligibility and transaction lifecycle tracking. Verify provider terms and have the execution integration reviewed. The current server is deliberately local-only.

## Vercel deployment

Production: https://folio-onchain.vercel.app

`npm run build` copies only browser assets into `dist`. The four `api/*.js` functions reuse the local server handler for catalog, market, history and quote requests. Vercel functions have a 60-second limit; caches are per warm instance and cold catalog requests can be slower. Run `vercel deploy --prod --scope vv13-1672` from this linked workspace to publish updates. `.env*` and `.vercel` are excluded from source control; environment files are excluded from deployment uploads.

Browser-local saved plans from localhost do not automatically appear on the production domain. Export any wanted local plans before switching devices or clearing storage.
