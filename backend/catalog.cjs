// The catalog comes from the aggregator API (aggregator-api/), called in
// process. This adapter keeps the shape the frontend already reads from
// /api/catalog; token ids keep their old format so saved plans still resolve.
const aggregator = require("../aggregator-api/src/service.cjs");
const { cached, fault } = require("./infrastructure.cjs");

const KIND = { stock: "Stock", etf: "ETF", pre_ipo: "Pre-IPO" };

async function call(path) {
  const { status, body } = await aggregator.handle(path);
  if (status !== 200)
    throw fault(body?.error?.message || "Catalog unavailable.", status >= 500 ? 503 : status);
  return body;
}

// Share logos across versions of the same asset.
function withLogos(tokens) {
  const images = new Map();
  for (const t of tokens) {
    if (typeof t.logo !== "string" || !t.logo.startsWith("https://")) continue;
    const key = t.kind + ":" + t.ticker;
    images.set(key, [...(images.get(key) || []), t.logo]);
  }
  return tokens.map((t) => {
    const logos = [...new Set([t.logo, ...(images.get(t.kind + ":" + t.ticker) || [])])].filter(
      (url) => typeof url === "string" && url.startsWith("https://"),
    );
    return { ...t, logo: logos[0] || null, logos };
  });
}

function toCatalog(tokensBody, issuersBody, seedDate) {
  const issuers = issuersBody.issuers.map((i) => ({
    id: i.id,
    name: i.name,
    url: i.sources?.[0] || null,
    description: i.protection_summary,
  }));
  const issuer = (id) => issuers.find((i) => i.id === id);
  // Most listed mints have no market at all. Keep a verified token only when it
  // or another version of the same asset has a price; otherwise it can't be traded.
  // Without market data, keep everything rather than hide the catalog.
  const priced = new Set(
    tokensBody.tokens.filter((t) => t.usd_price !== null).map((t) => t.underlying_ticker),
  );
  const keep = (t) => !t.mint_verified || !tokensBody.market_as_of || priced.has(t.underlying_ticker);
  const tokens = tokensBody.tokens.filter(keep).map((t) => ({
    id: t.mint_verified
      ? `${t.issuer_id}:solana:${t.mint_address}`
      : `pending:${t.issuer_id}:${t.underlying_ticker}`,
    ticker: t.underlying_ticker,
    symbol: t.token_symbol,
    name: t.name,
    issuer: issuer(t.issuer_id)?.name || t.issuer_id,
    issuerId: t.issuer_id,
    chain: "solana",
    address: t.mint_verified ? t.mint_address : null,
    logo: t.logo_url,
    source: t.address_source || issuer(t.issuer_id)?.url || null,
    kind: KIND[t.type] || "Stock",
    verified: t.mint_verified,
    halted: t.trading_halted,
    // Market snapshot from the aggregator (Jupiter), refreshed every few minutes.
    price: t.usd_price,
    stockPrice: t.underlying_price,
    premium: t.premium_pct,
    change24h: t.price_change_24h_pct ?? null,
    liquidity: t.liquidity_usd,
    volume24h: t.volume_24h_usd,
    mcap: t.onchain_mcap_usd,
  }));
  return {
    tokens: withLogos(tokens),
    issuers,
    sources: tokensBody.sources.map((s) => ({
      name: s.name,
      status: s.status === "ok" ? "available" : "unavailable",
    })),
    asOf: tokensBody.catalog_as_of,
    seedDate,
  };
}

async function catalog() {
  return cached("aggregator-catalog", 60000, async () => {
    const [tokens, issuers, health] = await Promise.all([
      call("/v1/tokens?include_unconfirmed=true"),
      call("/v1/issuers"),
      call("/v1/health"),
    ]);
    return toCatalog(tokens, issuers, health.seed_snapshot);
  });
}

module.exports = { catalog, toCatalog, call };
