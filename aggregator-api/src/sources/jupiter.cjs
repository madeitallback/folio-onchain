const config = require("../config.cjs");
const { request, json, fault, limiter, chunk, wait } = require("../http.cjs");

const headers = () => (config.jupiterKey ? { "x-api-key": config.jupiterKey } : {});
// The keyless quote endpoint rate-limits hard: one at a time, about a second apart.
const quoteSlot = limiter(config.jupiterKey ? 4 : 1);
const KEYLESS_SPACING_MS = 1100;
let lastOrderAt = 0;
async function pace() {
  if (config.jupiterKey) return;
  const gap = lastOrderAt + KEYLESS_SPACING_MS - Date.now();
  if (gap > 0) await wait(gap);
  lastOrderAt = Date.now();
}
const num = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

// Map<mint, price info>. usd_price is per displayed (multiplied) token.
async function prices(mints) {
  const out = new Map();
  for (const group of chunk([...new Set(mints)], 50)) {
    const d = await json(`${config.jupiterDataBase}/price/v3?ids=${group.join(",")}`, {
      headers: headers(),
      busyRetries: 2,
    });
    for (const [mint, p] of Object.entries(d || {})) {
      if (!p || !(num(p.usdPrice) > 0)) continue;
      out.set(mint, {
        usd_price: num(p.usdPrice),
        raw_token_price_usd: num(p.scaledUiConfig?.usdPricePrescaled),
        underlying_price: num(p.stockData?.price),
        underlying_price_updated_at: p.stockData?.updatedAt || null,
        price_change_24h_pct: num(p.priceChange24h),
        liquidity_usd: num(p.liquidity),
        decimals: num(p.decimals),
      });
    }
  }
  return out;
}

// Map<mint, token stats>: market cap, 24h volume, verified flag.
async function tokenStats(mints) {
  const out = new Map();
  for (const group of chunk([...new Set(mints)], 50)) {
    const d = await json(
      `${config.jupiterDataBase}/tokens/v2/search?query=${group.join(",")}`,
      { headers: headers(), busyRetries: 2 },
    );
    for (const t of Array.isArray(d) ? d : []) {
      if (!t?.id) continue;
      const s = t.stats24h || {};
      const volume = (num(s.buyVolume) || 0) + (num(s.sellVolume) || 0);
      out.set(t.id, {
        symbol: t.symbol || null,
        name: t.name || null,
        onchain_mcap_usd: num(t.mcap),
        volume_24h_usd: s.buyVolume === undefined && s.sellVolume === undefined ? null : volume,
        holders: num(t.holderCount),
        jupiter_verified: !!t.isVerified,
        tags: Array.isArray(t.tags) ? t.tags : [],
      });
    }
  }
  return out;
}

const BUSY_RETRIES = 3;
// The gateway sometimes signals a rate limit as HTTP 400 with {"code":429} in the body.
const isBusy = (res, d) => res.status === 429 || d?.code === 429 || /too many requests/i.test(d?.message || "");

// Quotes waiting or running; background work backs off while users wait.
let pendingOrders = 0;
const pending = () => pendingOrders;

// One Jupiter order quote. `amount` is in atomic units of inputMint.
function order(args, { background = false } = {}) {
  if (background) return runOrder(args);
  pendingOrders++;
  return runOrder(args).finally(() => pendingOrders--);
}
function runOrder({ inputMint, outputMint, amount }) {
  return quoteSlot(async () => {
    const url =
      config.jupiterOrderUrl + "?" + new URLSearchParams({ inputMint, outputMint, amount });
    let res;
    let d;
    for (let attempt = 0; ; attempt++) {
      await pace();
      res = await request(url, { headers: headers(), okStatuses: [400, 404, 429] });
      try {
        d = await res.json();
      } catch {
        throw fault("Jupiter returned an invalid quote.", 502, "upstream_error");
      }
      if (!isBusy(res, d)) break;
      if (attempt >= BUSY_RETRIES)
        throw fault("Jupiter rate limit reached. Retry shortly.", 503, "upstream_busy");
      await wait(1000 * (attempt + 1));
    }
    const outAmount = d?.outAmount && /^\d+$/.test(d.outAmount) ? BigInt(d.outAmount) : 0n;
    // Busy responses were retried above. Anything else without an amount means
    // this token can't be bought right now ("Failed to get quotes", "No route",
    // market maker declined…); Jupiter's wording varies, so don't parse it.
    if (outAmount <= 0n)
      return { status: "no_route", reason: d?.errorMessage || d?.error || "No route" };
    return {
      status: "quoted",
      in_amount: String(d.inAmount || amount),
      out_amount: outAmount.toString(),
      fee_bps: num(d.feeBps),
      router: d.router || null,
      swap_type: d.swapType || null,
      venues: [...new Set((d.routePlan || []).map((r) => r.swapInfo?.label).filter(Boolean))],
      jupiter_price_impact_pct: num(d.priceImpactPct),
    };
  });
}

module.exports = { prices, tokenStats, order, pending };
