// Framework-independent API. `handle("/v1/search?q=spy")` → { status, body }.
// The standalone server and the Next.js backend can both call it.
const config = require("./config.cjs");
const { cache } = require("./cache.cjs");
const { fault } = require("./http.cjs");
const seed = require("./sources/seed.cjs");
const jupiter = require("./sources/jupiter.cjs");
const { isAddress, readMints, multiplierNow } = require("./sources/solana.cjs");
const { catalog } = require("./catalog.cjs");
const { marketSnapshot, borrowedMarket } = require("./market.cjs");
const { buyCost, exitImpact, rawForUsd } = require("./pricing.cjs");
const ranking = require("./ranking.cjs");
const { dividendInfo } = require("./dividends.cjs");

const TYPES = seed.enums.type;
const ISSUER_IDS = seed.issuers.map((i) => i.id);
const issuerById = (id) => seed.issuers.find((i) => i.id === id) || null;

// ---------- params ----------

function list(q, name, allowed) {
  const raw = q.get(name);
  if (!raw) return null;
  const values = raw.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
  const bad = values.find((v) => !allowed.includes(v));
  if (bad) throw fault(`Unknown ${name} "${bad}". Use: ${allowed.join(", ")}.`, 400, "bad_request");
  return values;
}
function bool(q, name) {
  const v = q.get(name);
  return v === "1" || v === "true";
}
function int(q, name, def, min, max) {
  const raw = q.get(name);
  if (raw === null || raw === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max)
    throw fault(`${name} must be a whole number from ${min} to ${max}.`, 400, "bad_request");
  return n;
}
function usd(q, name, def) {
  const raw = q.get(name);
  if ((raw === null || raw === "") && def !== undefined) return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < config.limits.minUsd || n > config.limits.maxUsd)
    throw fault(`${name} must be between ${config.limits.minUsd} and ${config.limits.maxUsd} USD.`, 400, "bad_request");
  return Math.round(n * 100) / 100;
}
function one(q, name, allowed, def) {
  const v = (q.get(name) || def || "").toLowerCase();
  if (!allowed.includes(v)) throw fault(`${name} must be one of: ${allowed.join(", ")}.`, 400, "bad_request");
  return v;
}
function mintParam(value) {
  if (!isAddress(value)) throw fault("That is not a valid Solana address.", 400, "bad_request");
  return value;
}

// ---------- shapes ----------

function summary(t, m) {
  return {
    id: t.id,
    underlying_ticker: t.underlying_ticker,
    name: t.name,
    token_symbol: t.token_symbol,
    issuer_id: t.issuer_id,
    chain: t.chain,
    type: t.type,
    mint_address: t.mint_address,
    mint_verified: t.mint_verified,
    trading_halted: t.trading_halted,
    dividend_mode: t.dividend_mode,
    pays_dividends: t.pays_dividends,
    logo_url: t.logo_url,
    usd_price: m?.usd_price ?? null,
    underlying_price: m?.underlying_price ?? null,
    premium_pct: m?.premium_pct ?? null,
    onchain_mcap_usd: m?.onchain_mcap_usd ?? null,
    volume_24h_usd: m?.volume_24h_usd ?? null,
    liquidity_usd: m?.liquidity_usd ?? null,
    jupiter_verified: m?.jupiter_verified ?? null,
    ...(t.mint_verified ? {} : { unconfirmed_reason: t.verification.reason }),
  };
}

async function loadMarket(cat, { required = false } = {}) {
  try {
    return await marketSnapshot(cat);
  } catch (error) {
    if (required) throw error;
    return { byMint: new Map(), as_of: null, partial: true };
  }
}

const sum = (values) => {
  const nums = values.filter((v) => Number.isFinite(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
};

// ---------- quotes ----------

async function quoteBuy(t, m, amountUsd) {
  const q = await cache.get(`quote:buy:${t.mint_address}:${amountUsd}`, config.ttl.quote, () =>
    jupiter.order({
      inputMint: config.usdcMint,
      outputMint: t.mint_address,
      amount: String(Math.round(amountUsd * 1e6)),
    }),
  );
  if (q.status !== "quoted") return q;
  return {
    ...q,
    cost: buyCost({
      usdIn: amountUsd,
      outRaw: q.out_amount,
      decimals: t.onchain.decimals,
      multiplier: multiplierNow(t.onchain),
      usdPrice: m.usd_price,
      underlyingPrice: m.underlying_price,
    }),
  };
}

async function quoteSell(t, m, amountUsd, ttl = config.ttl.quote) {
  const raw = m.raw_token_price_usd
    ? rawForUsd(amountUsd, m.raw_token_price_usd, t.onchain.decimals)
    : null;
  if (!raw) return { status: "no_route", reason: "No price to size the sale." };
  const q = await cache.get(`quote:sell:${t.mint_address}:${amountUsd}:${ttl}`, ttl, () =>
    jupiter.order({ inputMint: t.mint_address, outputMint: config.usdcMint, amount: raw }),
  );
  if (q.status !== "quoted") return q;
  return {
    ...q,
    exit: exitImpact({
      inRaw: raw,
      decimals: t.onchain.decimals,
      multiplier: multiplierNow(t.onchain),
      usdPrice: m.usd_price,
      usdOut: Number(q.out_amount) / 1e6,
    }),
  };
}

function tradeBlocker(t, m) {
  if (!t.mint_verified) return t.verification.reason;
  if (t.trading_halted) return "The issuer reports trading is halted.";
  if (t.onchain?.extensions?.paused) return "The issuer has paused transfers of this token.";
  if (!m?.usd_price) return "No market price right now.";
  return null;
}

// ---------- routes ----------

async function health() {
  return {
    status: "ok",
    rpc: process.env.SOLANA_RPC_URL ? "configured" : "public-fallback",
    rpc_failover: config.rpcUrls.length > 1,
    jupiter_key: !!config.jupiterKey,
    seed_snapshot: seed.snapshotDate,
    as_of: new Date().toISOString(),
  };
}

async function search(q) {
  const text = (q.get("q") || "").trim();
  if (text.length > 100) throw fault("q is too long.", 400, "bad_request");
  const types = list(q, "type", TYPES);
  const issuers = list(q, "issuer", ISSUER_IDS);
  const sort = one(q, "sort", ["mcap", "volume", "cost", "name"], "mcap");
  const limit = int(q, "limit", 20, 1, 100);
  const offset = int(q, "offset", 0, 0, 100000);
  const includeUnconfirmed = bool(q, "include_unconfirmed");

  const cat = await catalog();
  const mkt = await loadMarket(cat);
  const needle = text.toLowerCase();
  const upper = text.toUpperCase();

  const groups = [];
  for (const [ticker, all] of cat.byTicker) {
    const versions = all.filter(
      (t) =>
        (includeUnconfirmed || t.mint_verified) &&
        (!issuers || issuers.includes(t.issuer_id)) &&
        (!types || types.includes(t.type)),
    );
    if (!versions.length) continue;
    let relevance = 0;
    if (text) {
      if (isAddress(text)) {
        if (!versions.some((t) => t.mint_address === text)) continue;
      } else if (ticker === upper) relevance = 0;
      else if (ticker.startsWith(upper)) relevance = 1;
      else if (
        versions.some(
          (t) => t.name.toLowerCase().includes(needle) || t.token_symbol.toLowerCase().includes(needle),
        )
      )
        relevance = 2;
      else continue;
    }
    const verified = versions.filter((t) => t.mint_verified);
    // Mid prices mislead for RFQ tokens (Ondo), so without quotes we pick the
    // most adopted version, not the "cheapest".
    const mcapOf = (t) => mkt.byMint.get(t.mint_address)?.onchain_mcap_usd ?? -1;
    const best =
      [...verified].sort((a, b) => mcapOf(b) - mcapOf(a))[0] || versions[0];
    const lead = verified[0] || versions[0];
    groups.push({
      relevance,
      underlying_ticker: ticker,
      name: lead.name,
      type: lead.type,
      isin: verified.find((t) => t.isin)?.isin || null,
      versions_count: versions.length,
      verified_versions_count: verified.length,
      issuers: [...new Set(versions.map((t) => t.issuer_id))],
      onchain_mcap_usd: sum(verified.map((t) => mkt.byMint.get(t.mint_address)?.onchain_mcap_usd)),
      volume_24h_usd: sum(verified.map((t) => mkt.byMint.get(t.mint_address)?.volume_24h_usd)),
      best_version: summary(best, mkt.byMint.get(best.mint_address)),
    });
  }

  const desc = (k) => (a, b) => (b[k] ?? -Infinity) - (a[k] ?? -Infinity);
  const order = {
    mcap: desc("onchain_mcap_usd"),
    volume: desc("volume_24h_usd"),
    cost: (a, b) => (a.best_version.premium_pct ?? Infinity) - (b.best_version.premium_pct ?? Infinity),
    name: (a, b) => a.underlying_ticker.localeCompare(b.underlying_ticker),
  }[sort];
  groups.sort(
    (a, b) => a.relevance - b.relevance || order(a, b) || a.underlying_ticker.localeCompare(b.underlying_ticker),
  );

  return {
    results: groups.slice(offset, offset + limit).map(({ relevance, ...g }) => g),
    total: groups.length,
    offset,
    limit,
    sort,
    best_version_basis:
      "Largest on-chain market cap. sort=cost uses that version's mid price versus the stock. For a real cost ranking at your size, use /v1/underlyings/:ticker.",
    catalog_as_of: cat.as_of,
    market_as_of: mkt.as_of,
  };
}

async function listTokens(q) {
  const types = list(q, "type", TYPES);
  const issuers = list(q, "issuer", ISSUER_IDS);
  const includeUnconfirmed = bool(q, "include_unconfirmed");
  const cat = await catalog();
  const mkt = await loadMarket(cat);
  const tokens = cat.tokens
    .filter(
      (t) =>
        (includeUnconfirmed || t.mint_verified) &&
        (!issuers || issuers.includes(t.issuer_id)) &&
        (!types || types.includes(t.type)),
    )
    .map((t) => summary(t, mkt.byMint.get(t.mint_address)));
  return {
    tokens,
    count: tokens.length,
    sources: cat.sources,
    catalog_as_of: cat.as_of,
    market_as_of: mkt.as_of,
  };
}

async function tokenDetail(_q, mint) {
  mintParam(mint);
  const cat = await catalog();
  const t = cat.byMint.get(mint);
  if (!t)
    throw fault("Not an official mint in our catalog. Check it with /v1/verify/:mint.", 404, "not_found");
  const mkt = await loadMarket(cat);
  const m = mkt.byMint.get(mint) || null;
  return {
    ...summary(t, m),
    isin: t.isin,
    cusip: t.cusip,
    dividends: dividendInfo(t),
    verification: t.verification,
    multiplier: t.onchain ? multiplierNow(t.onchain) : null,
    onchain: t.onchain,
    market: m,
    issuer: issuerById(t.issuer_id),
    catalog_as_of: cat.as_of,
    market_as_of: mkt.as_of,
  };
}

async function underlying(q, rawTicker) {
  const ticker = decodeURIComponent(rawTicker).toUpperCase();
  const size = usd(q, "size_usd", 100);
  const includeWeak = bool(q, "include_weak");
  const cat = await catalog();
  const versions = cat.byTicker.get(ticker);
  if (!versions) throw fault(`No tokenized version of ${ticker} found.`, 404, "not_found");
  const mkt = await loadMarket(cat, { required: true });
  const underlyingPrice = versions
    .map((t) => mkt.byMint.get(t.mint_address)?.underlying_price)
    .find((p) => Number.isFinite(p));

  const candidates = [];
  const notRanked = [];
  await Promise.all(
    versions.map(async (t) => {
      const m =
        mkt.byMint.get(t.mint_address) ||
        (t.mint_verified ? borrowedMarket(t, underlyingPrice) : null);
      const issuer = issuerById(t.issuer_id);
      const base = { ...summary(t, m), dividends: dividendInfo(t) };
      let reason = tradeBlocker(t, m);
      if (!reason && issuer?.protection_level === "weak" && !includeWeak)
        reason = "Weak issuer protection. Excluded unless include_weak=true.";
      if (reason) return notRanked.push({ ...base, reason });
      try {
        const buy = await quoteBuy(t, m, size);
        if (buy.status !== "quoted")
          return notRanked.push({ ...base, reason: `No route for a $${size} buy right now.` });
        // A failed request drops the version (retry); only a real "no route" is penalized.
        const exit = await quoteSell(t, m, config.limits.exitProbeUsd, config.ttl.depth);
        candidates.push({
          ...base,
          issuer_name: issuer?.name || t.issuer_id,
          protection_level: issuer?.protection_level || null,
          est_cost_usd: buy.cost.est_cost_usd,
          est_cost_pct: buy.cost.est_cost_pct,
          reference: buy.cost.reference,
          price_impact_pct: m.price_source === "jupiter" ? buy.cost.impact_pct : null,
          price_source: m.price_source,
          exit_impact_10k_pct: exit.status === "quoted" ? exit.exit.exit_impact_pct : null,
          quote: {
            tokens_out: buy.cost.tokens_out,
            effective_price_usd: buy.cost.effective_price_usd,
            router: buy.router,
            swap_type: buy.swap_type,
            venues: buy.venues,
            fee_bps: buy.fee_bps,
          },
        });
      } catch (error) {
        if (!error.status) throw error;
        notRanked.push({ ...base, reason: "Quote unavailable right now. Retry shortly." });
      }
    }),
  );

  const lead = versions.find((t) => t.mint_verified) || versions[0];
  return {
    underlying_ticker: ticker,
    name: lead.name,
    type: lead.type,
    isin: versions.find((t) => t.isin)?.isin || null,
    pays_dividends: versions.find((t) => t.pays_dividends !== null)?.pays_dividends ?? null,
    size_usd: size,
    underlying_price: underlyingPrice ?? null,
    versions: ranking.rank(candidates, { size_usd: size, ticker }),
    not_ranked: notRanked.sort((a, b) => a.issuer_id.localeCompare(b.issuer_id)),
    ranking: ranking.describe(),
    market_as_of: mkt.as_of,
    as_of: new Date().toISOString(),
  };
}

async function issuers() {
  const cat = await catalog();
  return { issuers: seed.issuers.map((i) => withLive(i, cat)), catalog_as_of: cat.as_of };
}

async function issuer(_q, id) {
  const i = issuerById(id);
  if (!i) throw fault(`Unknown issuer "${id}".`, 404, "not_found");
  const cat = await catalog();
  return { ...withLive(i, cat), catalog_as_of: cat.as_of };
}

function withLive(i, cat) {
  const mine = cat.tokens.filter((t) => t.issuer_id === i.id);
  const source = cat.sources.find((s) => s.issuer_id === i.id) || null;
  return {
    ...i,
    live: {
      verified_tokens: mine.filter((t) => t.mint_verified).length,
      unconfirmed_tokens: mine.filter((t) => !t.mint_verified).length,
      address_source: source ? { name: source.name, status: source.status } : null,
    },
  };
}

async function verify(_q, mint) {
  mintParam(mint);
  const cat = await catalog();
  const t = cat.byMint.get(mint);
  if (t) {
    const mkt = await loadMarket(cat);
    return {
      mint,
      official: t.mint_verified,
      token: summary(t, mkt.byMint.get(mint)),
      reason: t.verification.reason,
    };
  }
  const probe = await cache.get("verify:" + mint, config.ttl.verify, async () => {
    const [oc, st] = await Promise.allSettled([readMints([mint]), jupiter.tokenStats([mint])]);
    return {
      onchain: oc.status === "fulfilled" ? oc.value.get(mint) : null,
      stats: st.status === "fulfilled" ? st.value.get(mint) || null : null,
    };
  });
  const symbol = probe.onchain?.metadata?.symbol || probe.stats?.symbol || null;
  const name = probe.onchain?.metadata?.name || probe.stats?.name || null;
  const lookalikes = symbol ? findLookalikes(cat, symbol) : [];
  let reason;
  if (probe.onchain && !probe.onchain.exists) reason = "No account exists at this address. It is not an official mint.";
  else if (probe.onchain && !probe.onchain.is_mint) reason = "This address is not a token mint.";
  else if (lookalikes.length)
    reason = `Not an official mint. It calls itself "${symbol}", but the official ${lookalikes
      .map((l) => `${l.token_symbol} mint is ${l.mint_address}`)
      .join("; the official ")}.`;
  else reason = "Not an official mint. It is not in any issuer's official list.";
  return {
    mint,
    official: false,
    symbol,
    name,
    lookalike_of: lookalikes.map((l) => summary(l, null)),
    reason,
    onchain_checked: !!probe.onchain,
  };
}

function findLookalikes(cat, symbol) {
  const s = symbol.trim().toUpperCase();
  const bare = s.length > 3 ? s.replace(/(X|ON)$/, "") : s;
  return cat.tokens.filter(
    (t) =>
      t.mint_verified &&
      (t.token_symbol.toUpperCase() === s || t.underlying_ticker === s || t.underlying_ticker === bare),
  );
}

async function quote(q) {
  const mint = mintParam(q.get("mint"));
  const side = one(q, "side", ["buy", "sell"], "buy");
  const amount = usd(q, "usd");
  const cat = await catalog();
  const t = cat.byMint.get(mint);
  if (!t) throw fault("Not an official mint. Quotes are only given for catalog tokens.", 400, "not_official");
  const mkt = await loadMarket(cat, { required: true });
  const m = mkt.byMint.get(mint);
  const blocker = tradeBlocker(t, m);
  if (blocker) throw fault(blocker, 400, "not_tradable");
  const r = side === "buy" ? await quoteBuy(t, m, amount) : await quoteSell(t, m, amount);
  const base = {
    mint,
    token_symbol: t.token_symbol,
    issuer_id: t.issuer_id,
    side,
    usd: amount,
    status: r.status,
    as_of: new Date().toISOString(),
  };
  if (r.status !== "quoted") return { ...base, reason: r.reason };
  return {
    ...base,
    ...(side === "buy" ? r.cost : r.exit),
    in_amount: r.in_amount,
    out_amount: r.out_amount,
    router: r.router,
    swap_type: r.swap_type,
    venues: r.venues,
    fee_bps: r.fee_bps,
    notice: "Indicative. Jupiter re-quotes before the wallet signs.",
  };
}

const ROUTES = [
  [/^\/v1\/health$/, health],
  [/^\/v1\/search$/, search],
  [/^\/v1\/tokens$/, listTokens],
  [/^\/v1\/tokens\/([^/]+)$/, tokenDetail],
  [/^\/v1\/underlyings\/([^/]+)$/, underlying],
  [/^\/v1\/issuers$/, issuers],
  [/^\/v1\/issuers\/([^/]+)$/, issuer],
  [/^\/v1\/verify\/([^/]+)$/, verify],
  [/^\/v1\/quote$/, quote],
];

async function handle(pathWithQuery) {
  try {
    const url = new URL(pathWithQuery, "http://aggregator.local");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    for (const [pattern, fn] of ROUTES) {
      const match = path.match(pattern);
      if (match) return { status: 200, body: await fn(url.searchParams, ...match.slice(1)) };
    }
    throw fault("Not found.", 404, "not_found");
  } catch (error) {
    const status = error.status || 500;
    return {
      status,
      body: {
        error: {
          code: error.code || "internal_error",
          message: error.status ? error.message : "Something went wrong.",
        },
      },
      ...(error.status ? {} : { cause: error }),
    };
  }
}

module.exports = { handle };
