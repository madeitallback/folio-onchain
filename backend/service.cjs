const { catalog, call } = require("./catalog.cjs");
const data = require("./market-data.cjs");
const wallet = require("./wallet.cjs");
const trading = require("./trading.cjs");
const { fault, cached } = require("./infrastructure.cjs");
// Buy now reads route checks the aggregator already has, so the list never
// waits on Jupiter. Unchecked tokens are queued there and show as "unchecked".
const ROUTE_STATUS = { route: "quoted", no_route: "no-route", unknown: "unchecked" };
async function routeProbe(t) {
  const r = await call("/v1/route/" + t.address + "?usd=100&cached_only=1");
  return { status: ROUTE_STATUS[r.status] || "no-route", asOf: r.checked_at || null };
}
async function handle(path, q) {
  if (path === "health")
    return {
      status: "ok",
      rpc: process.env.SOLANA_RPC_URL ? "configured" : "public-fallback",
      rpcFailover: !!process.env.SOLANA_RPC_FALLBACK_URL,
      jupiterKey: !!process.env.JUPITER_API_KEY,
      asOf: new Date().toISOString(),
    };
  // The aggregator API, served under /api/v1/* (search, underlyings, verify…).
  if (path.startsWith("v1/")) return call("/" + path + "?" + q.toString());
  if (path === "catalog") return catalog();
  if (path === "balance") return wallet.balance(q.get("address"));
  if (path === "transaction") {
    const c = await catalog();
    const t = c.tokens.find((t) => t.id === q.get("id") && t.verified);
    if (!t) throw fault("Unknown transaction asset.", 400);
    return wallet.transaction(q.get("address"), q.get("signature"), t.address);
  }
  if (!["holdings", "browse", "market", "history", "quote"].includes(path))
    throw fault("Not found", 404);
  const c = await catalog();
  if (path === "holdings") return wallet.holdings(q.get("address"), c);
  if (path === "browse")
    return cached("browse:" + q.toString(), 15000, () =>
      trading.browse(c, q, routeProbe),
    );
  const t = c.tokens.find((t) => t.id === q.get("id"));
  if (!t?.verified || !t.address)
    throw fault(
      "This token address is not confirmed. Trading is unavailable.",
      400,
    );
  if (path === "quote")
    return trading.quote(t, {
      amount: q.get("amount") || "100",
      side: q.get("side") || "buy",
      raw: q.get("raw"),
    });
  return data[path](t);
}
module.exports = { handle };
