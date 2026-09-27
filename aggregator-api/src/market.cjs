const config = require("./config.cjs");
const { cache } = require("./cache.cjs");
const { fault } = require("./http.cjs");
const jupiter = require("./sources/jupiter.cjs");
const { round } = require("./pricing.cjs");
const { multiplierNow } = require("./sources/solana.cjs");

function combine(token, price, stats) {
  if (!price && !stats) return null;
  const usd = price?.usd_price ?? null;
  // Pre-IPO companies have no public stock price; Jupiter's figure there is a private mark.
  const underlying = token.type === "pre_ipo" ? null : (price?.underlying_price ?? null);
  return {
    usd_price: usd,
    underlying_price: underlying,
    premium_pct: usd && underlying ? round((usd / underlying - 1) * 100) : null,
    raw_token_price_usd:
      price?.raw_token_price_usd ?? (usd ? usd * multiplierNow(token.onchain) : null),
    liquidity_usd: price?.liquidity_usd ?? null,
    onchain_mcap_usd: stats?.onchain_mcap_usd ?? null,
    volume_24h_usd: stats?.volume_24h_usd ?? null,
    price_change_24h_pct: price?.price_change_24h_pct ?? null,
    holders: stats?.holders ?? null,
    jupiter_verified: stats ? stats.jupiter_verified : null,
    price_source: usd ? "jupiter" : null,
  };
}

// Most listed mints have no market. Scan them all once per catalog period and
// only refresh the ones that had a price in between.
function pricedUniverse(cat) {
  return cache.get("market:universe", config.ttl.catalog, async () => {
    const mints = cat.tokens.filter((t) => t.mint_verified).map((t) => t.mint_address);
    const prices = await jupiter.prices(mints);
    return { mints: [...prices.keys()], prices, at: Date.now() };
  });
}

// Market snapshot for every priced verified token. Map<mint, market>.
function marketSnapshot(cat) {
  return cache.get("market", config.ttl.market, async () => {
    let prices;
    try {
      const universe = await pricedUniverse(cat);
      prices =
        Date.now() - universe.at < config.ttl.market
          ? universe.prices
          : await jupiter.prices(universe.mints);
    } catch {
      throw fault("Market data is unavailable. Retry shortly.", 503);
    }
    const s = await Promise.allSettled([jupiter.tokenStats([...prices.keys()])]).then((r) => r[0]);
    const stats = s.status === "fulfilled" ? s.value : new Map();
    const byMint = new Map();
    for (const t of cat.tokens) {
      if (!t.mint_verified) continue;
      const m = combine(t, prices.get(t.mint_address), stats.get(t.mint_address));
      if (m) byMint.set(t.mint_address, m);
    }
    return { byMint, as_of: new Date().toISOString(), partial: s.status === "rejected" };
  });
}

// For a version Jupiter doesn't price, use the stock price its sibling versions
// report. One displayed token tracks one share, so it's a fair sizing price.
function borrowedMarket(token, stockPrice) {
  if (!stockPrice || token.type === "pre_ipo" || !token.onchain) return null;
  return {
    usd_price: stockPrice,
    underlying_price: stockPrice,
    premium_pct: null,
    raw_token_price_usd: stockPrice * multiplierNow(token.onchain),
    liquidity_usd: null,
    onchain_mcap_usd: null,
    volume_24h_usd: null,
    price_change_24h_pct: null,
    holders: null,
    jupiter_verified: null,
    price_source: "underlying",
  };
}

module.exports = { marketSnapshot, combine, borrowedMarket };
