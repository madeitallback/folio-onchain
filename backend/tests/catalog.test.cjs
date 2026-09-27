const test = require("node:test");
const assert = require("node:assert/strict");
const { toCatalog } = require("../catalog.cjs");
const { sumUSDC, USDC } = require("../wallet.cjs");

const agg = (extra) => ({
  underlying_ticker: "SPY",
  name: "SPDR S&P 500 ETF",
  token_symbol: "SPYx",
  issuer_id: "xstocks",
  type: "etf",
  mint_address: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
  mint_verified: true,
  address_source: "https://api.xstocks.fi/api/v2/public/assets",
  trading_halted: false,
  logo_url: "https://example.com/spyx.png",
  usd_price: 770,
  ...extra,
});
const tokensBody = (tokens, extra = {}) => ({
  tokens,
  sources: [
    { name: "xStocks public API", status: "ok" },
    { name: "Ondo token list", status: "unavailable" },
  ],
  catalog_as_of: "2026-09-27T00:00:00.000Z",
  market_as_of: "2026-09-27T00:00:00.000Z",
  ...extra,
});
const issuersBody = {
  issuers: [
    { id: "xstocks", name: "xStocks", sources: ["https://docs.xstocks.fi/docs"], protection_summary: "Separate company." },
    { id: "ondo", name: "Ondo", sources: [], protection_summary: "Strongest." },
    { id: "backpack", name: "Backpack", sources: [], protection_summary: "Broker-dealer." },
  ],
};

test("aggregator tokens map to the shape the frontend reads", () => {
  const c = toCatalog(tokensBody([agg()]), issuersBody, "2026-09-26");
  const [t] = c.tokens;
  assert.equal(t.id, "xstocks:solana:XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W");
  assert.equal(t.ticker, "SPY");
  assert.equal(t.symbol, "SPYx");
  assert.equal(t.issuer, "xStocks");
  assert.equal(t.issuerId, "xstocks");
  assert.equal(t.kind, "ETF");
  assert.equal(t.verified, true);
  assert.equal(t.address, "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W");
  assert.equal(t.source, "https://api.xstocks.fi/api/v2/public/assets");
  assert.deepEqual(t.logos, ["https://example.com/spyx.png"]);
  assert.deepEqual(c.sources.map((s) => s.status), ["available", "unavailable"]);
  assert.equal(c.seedDate, "2026-09-26");
  assert.equal(c.issuers[0].url, "https://docs.xstocks.fi/docs");
});

test("unconfirmed entries never carry an address or authorize trading", () => {
  const c = toCatalog(
    tokensBody([agg({ issuer_id: "backpack", mint_verified: false, mint_address: null, usd_price: null, type: "pre_ipo" })]),
    issuersBody,
  );
  const [t] = c.tokens;
  assert.equal(t.id, "pending:backpack:SPY");
  assert.equal(t.verified, false);
  assert.equal(t.address, null);
  assert.equal(t.kind, "Pre-IPO");
});

test("verified tokens with no market for any version are left out", () => {
  const tokens = [
    agg(),
    agg({ issuer_id: "backpack", token_symbol: "SPY", mint_address: "SPYBo66VJPFjh1pXMb9Le53kDYWTK1zzYVDeVRWtsbi", usd_price: null }),
    agg({ underlying_ticker: "AIZ", token_symbol: "AIZ", issuer_id: "backpack", mint_address: "AiZ1111111111111111111111111111111111111111", usd_price: null }),
  ];
  const kept = toCatalog(tokensBody(tokens), issuersBody).tokens.map((t) => t.symbol);
  assert.deepEqual(kept, ["SPYx", "SPY"]); // Backpack SPY stays: its sibling SPYx has a price
  // Without market data nothing is hidden.
  const all = toCatalog(tokensBody(tokens, { market_as_of: null }), issuersBody).tokens;
  assert.equal(all.length, 3);
});

test("USDC balance sums exact atomic amounts and rejects unrelated mints or decimals", () => {
  const account = (mint, amount, decimals = 6) => ({
    account: {
      data: { parsed: { info: { mint, tokenAmount: { amount, decimals } } } },
    },
  });
  assert.equal(
    sumUSDC([
      account(USDC, "1000001"),
      account(USDC, "999999"),
      account("OTHER", "999999999"),
      account(USDC, "9999", 9),
    ]),
    2000000n,
  );
});
