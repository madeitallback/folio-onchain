const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("../src/http.cjs");
const { cache } = require("../src/cache.cjs");
const { handle } = require("../src/service.cjs");
const { MINT, fakeUpstream, defaultOrder, reply } = require("./fixtures.cjs");

function withUpstream(options) {
  cache.clear();
  const up = fakeUpstream(options);
  http.setFetch(up.fetch, { noWait: true });
  return up;
}
test.after(() => http.setFetch(null));

test("search groups versions by underlying", async () => {
  withUpstream();
  const r = await handle("/v1/search?q=spy");
  assert.equal(r.status, 200);
  const spy = r.body.results[0];
  assert.equal(spy.underlying_ticker, "SPY");
  assert.equal(spy.versions_count, 3);
  assert.deepEqual(spy.issuers.sort(), ["backpack", "ondo", "xstocks"]);
  assert.equal(spy.best_version.token_symbol, "SPYx"); // larger on-chain market cap
  assert.equal(spy.onchain_mcap_usd, 71e6);
  assert.equal(spy.volume_24h_usd, 8e6 + 700);

  // Seed-only PreStocks entries appear only when asked for.
  assert.equal((await handle("/v1/search?q=anthropic")).body.total, 0);
  const all = await handle("/v1/search?q=anthropic&include_unconfirmed=true");
  assert.equal(all.body.results[0].verified_versions_count, 0);
});

test("search finds a group by mint and validates params", async () => {
  withUpstream();
  const r = await handle(`/v1/search?q=${MINT.SPYon}`);
  assert.equal(r.body.results.length, 1);
  assert.equal(r.body.results[0].underlying_ticker, "SPY");
  assert.equal((await handle("/v1/search?sort=bogus")).status, 400);
  assert.equal((await handle("/v1/search?type=bond")).status, 400);
  assert.equal((await handle("/v1/search?limit=0")).status, 400);
});

test("underlyings ranks versions for the given size", async () => {
  withUpstream();
  const r = await handle("/v1/underlyings/spy?size_usd=1000");
  assert.equal(r.status, 200);
  assert.equal(r.body.underlying_price, 771.35);
  assert.deepEqual(r.body.versions.map((v) => [v.issuer_id, v.token_symbol]), [
    ["xstocks", "SPYx"],
    ["ondo", "SPYon"],
    ["backpack", "SPY"],
  ]);
  const [x, on, bp] = r.body.versions;
  // SPYx: 770 * 1.001 = 770.77 per displayed token vs 771.35
  assert.ok(Math.abs(x.est_cost_pct - (770.77 / 771.35 - 1) * 100) < 0.001);
  assert.ok(Math.abs(x.exit_impact_10k_pct - 0.2) < 0.01);
  assert.ok(Math.abs(on.est_cost_pct - ((772 * 1.0005) / 771.35 - 1) * 100) < 0.001);
  assert.ok(x.score < on.score);
  assert.equal(x.rank, 1);
  assert.equal(x.protection_level, "protected_with_caveat");
  // Backpack SPY has no Jupiter price: sized and measured with the stock price from its siblings.
  assert.equal(bp.price_source, "underlying");
  assert.ok(Math.abs(bp.est_cost_pct - 0.3) < 0.001);
  assert.equal(bp.price_impact_pct, null);
  assert.equal(x.price_source, "jupiter");
  assert.ok(x.dividends.explanation.includes("of a $1 dividend, about $0.70"));
});

test("underlyings: halted tokens and failed on-chain checks are not ranked", async () => {
  withUpstream();
  const tsla = await handle("/v1/underlyings/TSLA");
  assert.equal(tsla.body.versions.length, 0);
  assert.match(tsla.body.not_ranked.find((v) => v.token_symbol === "TSLAx").reason, /halted/);

  const hood = await handle("/v1/underlyings/HOOD");
  const v = hood.body.not_ranked.find((t) => t.issuer_id === "backpack");
  assert.equal(v.mint_verified, false);
  assert.match(v.reason, /on-chain check failed/);

  assert.equal((await handle("/v1/underlyings/NOPE")).status, 404);
  assert.equal((await handle("/v1/underlyings/SPY?size_usd=0")).status, 400);
});

test("rate-limited quotes are retried, and a persistent limit drops the version", async () => {
  let busy = 2;
  withUpstream({
    order: (u) => (busy-- > 0 ? reply({ code: 429, message: "[API Gateway] Too many requests" }, 400) : defaultOrder(u)),
  });
  const ok = await handle("/v1/underlyings/SPY");
  assert.equal(ok.body.versions.length, 3);

  withUpstream({ order: () => reply({ code: 429 }, 429) });
  const r = await handle("/v1/underlyings/SPY");
  assert.equal(r.status, 200);
  assert.equal(r.body.versions.length, 0);
  assert.ok(r.body.not_ranked.some((v) => /Retry shortly/.test(v.reason)));
});

test("no route is reported as not ranked", async () => {
  withUpstream({
    order: (u) =>
      u.searchParams.get("outputMint") === MINT.SPYon
        ? reply({ error: "Quote not available from market maker" })
        : defaultOrder(u),
  });
  const r = await handle("/v1/underlyings/SPY?size_usd=50");
  assert.deepEqual(r.body.versions.map((v) => v.token_symbol), ["SPYx", "SPY"]);
  assert.match(r.body.not_ranked.find((v) => v.token_symbol === "SPYon").reason, /No route for a \$50 buy/);
});

test("verify: official, lookalike, unknown, invalid", async () => {
  withUpstream();
  const official = await handle(`/v1/verify/${MINT.SPYx}`);
  assert.equal(official.body.official, true);
  assert.equal(official.body.token.token_symbol, "SPYx");

  const fake = await handle(`/v1/verify/${MINT.FAKE}`);
  assert.equal(fake.body.official, false);
  assert.equal(fake.body.symbol, "SPYx");
  assert.ok(fake.body.lookalike_of.some((t) => t.mint_address === MINT.SPYx));
  assert.match(fake.body.reason, new RegExp(`official SPYx mint is ${MINT.SPYx}`));

  const nothing = await handle("/v1/verify/Nothing1111111111111111111111111111111111111");
  assert.equal(nothing.body.official, false);
  assert.match(nothing.body.reason, /No account exists/);

  assert.equal((await handle("/v1/verify/not-a-mint")).status, 400);
});

test("tokens: detail, list and 404", async () => {
  withUpstream();
  const d = await handle(`/v1/tokens/${MINT.SPYx}`);
  assert.equal(d.status, 200);
  assert.equal(d.body.multiplier, 1.005);
  assert.equal(d.body.issuer.id, "xstocks");
  assert.equal(d.body.market.underlying_price, 771.35);
  assert.equal(d.body.dividend_mode, "REBASE_BALANCE"); // from the seed

  assert.equal((await handle(`/v1/tokens/${MINT.FAKE}`)).status, 404);

  const list = await handle("/v1/tokens?issuer=ondo");
  assert.deepEqual(list.body.tokens.map((t) => t.token_symbol), ["SPYon"]);
  const pre = await handle("/v1/tokens?issuer=prestocks&include_unconfirmed=true");
  const openai = pre.body.tokens.find((t) => t.token_symbol === "OPENAI");
  assert.equal(openai.mint_verified, true);
  assert.match(pre.body.tokens.find((t) => !t.mint_verified).unconfirmed_reason, /Not in PreStocks/);

  const od = await handle(`/v1/tokens/${MINT.OPENAI}`);
  assert.equal(od.body.onchain.extensions.transfer_fee_bps, 300);
  assert.equal(od.body.onchain.dca_compatible, false);
  assert.match(od.body.dividends.explanation, /no right to dividends/);

  const hood = await handle(`/v1/tokens?issuer=backpack`);
  assert.deepEqual(hood.body.tokens.map((t) => t.token_symbol), ["SPY"]); // HOOD fails on-chain, AIZ has no mint
});

test("quote: buy and sell in USD", async () => {
  withUpstream();
  const sell = await handle(`/v1/quote?mint=${MINT.SPYx}&side=sell&usd=500`);
  assert.equal(sell.body.status, "quoted");
  assert.ok(Math.abs(sell.body.exit_impact_pct - 0.2) < 0.01);
  const buy = await handle(`/v1/quote?mint=${MINT.SPYon}&side=buy&usd=100`);
  assert.equal(buy.body.reference, "underlying");
  assert.equal((await handle(`/v1/quote?mint=${MINT.FAKE}&usd=100`)).body.error.code, "not_official");
  assert.equal((await handle(`/v1/quote?mint=${MINT.TSLAx}&usd=100`)).body.error.code, "not_tradable");
  assert.equal((await handle(`/v1/quote?mint=${MINT.SPYx}&usd=5000000`)).status, 400);
});

test("issuers carry the research profile plus live counts", async () => {
  withUpstream();
  const r = await handle("/v1/issuers");
  assert.equal(r.body.issuers.length, 4);
  const ondo = await handle("/v1/issuers/ondo");
  assert.equal(ondo.body.protection_level, "strongest");
  assert.equal(ondo.body.live.verified_tokens, 1);
  assert.equal((await handle("/v1/issuers/nope")).status, 404);
});

test("unknown route and upstream outage", async () => {
  withUpstream();
  assert.equal((await handle("/v1/nope")).status, 404);
  cache.clear();
  http.setFetch(async () => {
    throw new Error("offline");
  }, { noWait: true });
  const r = await handle("/v1/search");
  assert.equal(r.status, 503);
  assert.equal(r.body.error.code, "upstream_unavailable");
});
