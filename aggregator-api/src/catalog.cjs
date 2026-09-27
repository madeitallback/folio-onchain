const config = require("./config.cjs");
const { cache } = require("./cache.cjs");
const { fault } = require("./http.cjs");
const seed = require("./sources/seed.cjs");
const { fetchXStocks } = require("./sources/xstocks.cjs");
const { fetchOndo } = require("./sources/ondo.cjs");
const { fetchBackpack } = require("./sources/backpack.cjs");
const { fetchPreStocks } = require("./sources/prestocks.cjs");
const { readMints } = require("./sources/solana.cjs");

// One entry per official address source. `complete` = the issuer's full list.
const SOURCES = [
  { issuer_id: "xstocks", name: "xStocks public API", complete: true, load: fetchXStocks },
  { issuer_id: "ondo", name: "Ondo token list", complete: true, load: fetchOndo },
  { issuer_id: "backpack", name: "Backpack public API", complete: true, load: fetchBackpack },
  { issuer_id: "prestocks", name: "PreStocks products page", complete: true, load: fetchPreStocks },
];

const ETF_NAME = /\bETF\b|iShares|Vanguard|SPDR|Invesco|ProShares|WisdomTree|Global X/i;
const issuerName = (id) => seed.issuers.find((i) => i.id === id)?.name || id;

function buildToken(listed, onchain) {
  const s = seed.find(listed.issuer_id, listed.underlying_ticker);
  const ok = onchain?.is_mint === true;
  return {
    id: `${listed.issuer_id}:${listed.mint_address}`,
    underlying_ticker: listed.underlying_ticker,
    name: s?.name || listed.name,
    token_symbol: listed.token_symbol,
    issuer_id: listed.issuer_id,
    chain: "solana",
    type: s?.type || listed.type || (ETF_NAME.test(listed.name) ? "etf" : "stock"),
    mint_address: listed.mint_address,
    mint_verified: ok,
    isin: listed.isin,
    cusip: listed.cusip || null,
    trading_halted: listed.trading_halted,
    logo_url: listed.logo_url,
    dividend_mode: s?.dividend_mode || "UNVERIFIED",
    pays_dividends: s ? s.pays_dividends : null,
    verification: {
      issuer_source: listed.source_url,
      onchain_ok: ok,
      reason: ok
        ? `Listed by ${issuerName(listed.issuer_id)} and confirmed on-chain as a ${onchain.token_program} mint.`
        : `Listed by ${issuerName(listed.issuer_id)}, but the on-chain check failed: ${onchain?.reason || "no data"}`,
    },
    onchain: ok ? onchain : null,
  };
}

function unconfirmedReason(issuerId, source) {
  if (source?.status === "unavailable")
    return `${source.name} is unavailable right now, so this address can't be confirmed.`;
  if (source?.complete) return `Not in ${issuerName(issuerId)}'s current official Solana list.`;
  if (source) return `${issuerName(issuerId)} hasn't published this address in a source we read yet.`;
  return `No official ${issuerName(issuerId)} address source is connected yet.`;
}

function unconfirmedToken(s, source) {
  return {
    id: `pending:${s.issuer_id}:${s.underlying_ticker.toUpperCase()}`,
    underlying_ticker: s.underlying_ticker.toUpperCase(),
    name: s.name,
    token_symbol: s.token_symbol,
    issuer_id: s.issuer_id,
    chain: "solana",
    type: s.type,
    mint_address: null,
    mint_verified: false,
    isin: null,
    cusip: null,
    trading_halted: false,
    logo_url: null,
    dividend_mode: s.dividend_mode,
    pays_dividends: s.pays_dividends,
    verification: {
      issuer_source: null,
      onchain_ok: false,
      reason: unconfirmedReason(s.issuer_id, source),
    },
    onchain: null,
  };
}

function indexCatalog(tokens, sources) {
  const byMint = new Map();
  const byTicker = new Map();
  for (const t of tokens) {
    if (t.mint_address) byMint.set(t.mint_address, t);
    if (!byTicker.has(t.underlying_ticker)) byTicker.set(t.underlying_ticker, []);
    byTicker.get(t.underlying_ticker).push(t);
  }
  return { tokens, byMint, byTicker, sources, as_of: new Date().toISOString() };
}

async function buildCatalog() {
  const results = await Promise.allSettled(SOURCES.map((s) => s.load()));
  const sources = SOURCES.map((s, i) => ({
    issuer_id: s.issuer_id,
    name: s.name,
    complete: s.complete,
    status: results[i].status === "fulfilled" ? "ok" : "unavailable",
    count: results[i].status === "fulfilled" ? results[i].value.length : 0,
    error: results[i].status === "rejected" ? results[i].reason.message : null,
  }));
  const listed = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (!listed.length) throw fault("Issuer catalogs are unavailable. Retry shortly.", 503);

  // Throws on RPC failure so a cached catalog is kept rather than one with nothing verified.
  const onchain = await readMints(listed.map((l) => l.mint_address));
  const tokens = listed.map((l) => buildToken(l, onchain.get(l.mint_address)));

  const listedKeys = new Set(tokens.map((t) => t.issuer_id + ":" + t.underlying_ticker));
  for (const s of seed.tokens) {
    if (listedKeys.has(s.issuer_id + ":" + s.underlying_ticker.toUpperCase())) continue;
    tokens.push(unconfirmedToken(s, sources.find((x) => x.issuer_id === s.issuer_id)));
  }
  return indexCatalog(tokens, sources);
}

const catalog = () => cache.get("catalog", config.ttl.catalog, buildCatalog);

module.exports = { catalog, buildToken, unconfirmedToken, indexCatalog };
