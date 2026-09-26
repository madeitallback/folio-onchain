# Solana beta readiness

Implemented
- Buy now pages verify a 100 USDC Jupiter quote for at least one confirmed, non-halted version of each displayed asset. Search and pagination check routes on demand; a full catalog sweep is deliberately not performed on every page load. A 100 USDC route does not guarantee liquidity for another amount.
- All listings keeps research/discovery entries separate. Addresses remain issuer-confirmed before quoting or trading.
- Buy and sell quote directions, exact integer token quantities, percentage-based sales and quote expiry. Jupiter refreshes its own final quote and displays actual fees before wallet approval.
- Existing Phantom, Backpack or Solflare injected wallet connection passes through to Jupiter. No signing on connect and no server-side custody, signing or broadcasting endpoint.
- My assets reads both SPL Token and Token-2022 accounts. Raw quantities stay as integer strings; scaled display balances are kept separately. Other assets outside the confirmed catalog are omitted.
- Local transaction journal is partitioned by wallet and bounded to 100 items. Signed/pending/confirmed/finalized/failed states. Server verifies wallet signer and token deltas before returning receipts. A callback alone is not proof of confirmation. Unknown status must not be treated as failed or retried automatically.
- In-flight request deduplication, bounded caches and quote queues, upstream timeouts/retry, rate-limited APIs, private wallet responses, structured Vercel logs without wallet addresses or query contents.
- Vercel WAF rule: 120 API requests per IP per 60 seconds. Counters are per region. Local application limits are per instance, not a replacement for the edge firewall.

Required server configuration in Vercel Project Settings > Environment Variables
SOLANA_RPC_URL: dedicated mainnet JSON-RPC endpoint, server only.
SOLANA_RPC_FALLBACK_URL: optional independent mainnet RPC for failover.
JUPITER_API_KEY: API key from Jupiter Portal, server only.
Redeploy after adding or changing these variables. Never prefix them with NEXT_PUBLIC_ or commit credentials. For local Next.js development use frontend/.env.local (ignored).

Public RPC and keyless Jupiter currently work for read-only checks but have no capacity guarantee. Provider quotas and Vercel plan suitability must be checked before a broad public launch. No paid service was purchased or provisioned.

Operations
GET /api/health is configuration/liveness information, not a claim that every upstream is healthy. Monitor api_error events and request latency in Vercel Runtime Logs; the response X-Request-Id links user reports to sanitized logs. Configure an external alert destination before public launch. No ongoing monitoring automation or alert destination has been created.

Manual acceptance with a real wallet (not completed by the agent)
1. Use a wallet and funds the owner explicitly chooses. Connect once; verify address, USDC and SOL against the wallet.
2. Choose a supported stock, quote a small owner-approved amount, and inspect Jupiter's final token addresses, price impact, fees and network. The owner signs if acceptable.
3. Confirm the journal reaches confirmed/finalized via RPC and the received token balance changes. Compare the receipt and explorer. Do not rely on a toast.
4. Sell a chosen portion using the same wallet; review and sign. Confirm USDC receipt, remaining stock quantity and network fee.
5. Exercise signing cancellation, disconnect/account change, expired quote, insufficient funds, no route and RPC outage. Never resubmit solely because status is unknown.
6. Reload with a pending transaction and reconnect the same wallet; verify status recovery from the saved signature.

Validation boundary
Live catalog, mainnet read-only balance reads and buy/sell quotes can be checked without spending. Synthetic adapter tests validate callback and precision behavior, not real wallet compatibility or settlement. A real-money buy -> receipt -> sell still needs the owner's explicit approvals. External Jupiter trades and cleared browser storage are outside the local activity journal. Cross-device history and RPC-backed account activity indexing are future work.

Sources
https://developers.jup.ag/docs/tool-kits/plugin/customization
https://solana.com/docs/references/spl-token-cli
https://solana.com/docs/rpc/http/getsignaturestatuses
https://solana.com/docs/rpc/http/gettransaction
