process.env.AGGREGATOR_CACHE = "off"; // each test controls its own upstream
process.env.AGGREGATOR_WARM = "off";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseMint, effectiveMultiplier } = require("../src/sources/solana.cjs");
const ondo = require("../src/sources/ondo.cjs");
const xstocks = require("../src/sources/xstocks.cjs");
const { buyCost, exitImpact, rawForUsd } = require("../src/pricing.cjs");
const ranking = require("../src/ranking.cjs");
const backpack = require("../src/sources/backpack.cjs");
const prestocks = require("../src/sources/prestocks.cjs");
const { dividendInfo } = require("../src/dividends.cjs");
const { MINT, XNODES, ONDO_CSV, ACCOUNTS, BACKPACK_ASSETS, BACKPACK_SECURITIES, PRESTOCKS_HTML } = require("./fixtures.cjs");

const close = (a, b, tol = 0.001) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);

test("xStocks: keeps the Solana deployment only", () => {
  const [spy, tsla] = xstocks.normalize(XNODES);
  assert.equal(spy.mint_address, MINT.SPYx);
  assert.equal(spy.underlying_ticker, "SPY");
  assert.equal(spy.name, "SP500");
  assert.equal(spy.isin, "US78462F1030");
  assert.equal(tsla.trading_halted, true);
});

test("Ondo CSV: quoted commas, CRLF, currency rows dropped", () => {
  const rows = ondo.parseCsv(ONDO_CSV);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].Description, 'SPYon tracks SPY, reinvesting "dividends"');
  const tokens = ondo.normalize(rows);
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].token_symbol, "SPYon");
  assert.equal(tokens[0].type, "etf");
});

test("mint parsing: extensions, fees and DCA compatibility", () => {
  const spy = parseMint(ACCOUNTS[MINT.SPYx]);
  assert.equal(spy.is_mint, true);
  assert.equal(spy.token_program, "spl-token-2022");
  assert.equal(spy.multiplier, 1.005);
  assert.equal(spy.extensions.pausable, true);
  assert.equal(spy.extensions.paused, false);
  assert.equal(spy.dca_compatible, true);

  const feeToken = parseMint({
    ...ACCOUNTS[MINT.SPYx],
    data: {
      parsed: {
        type: "mint",
        info: {
          decimals: 6,
          supply: "1",
          extensions: [
            {
              extension: "transferFeeConfig",
              state: {
                olderTransferFee: { transferFeeBasisPoints: 0 },
                newerTransferFee: { transferFeeBasisPoints: 100 },
              },
            },
          ],
        },
      },
    },
  });
  assert.equal(feeToken.extensions.transfer_fee_bps, 100);
  assert.equal(feeToken.dca_compatible, false);

  assert.equal(parseMint(null).exists, false);
  assert.equal(parseMint({ owner: "11111111111111111111111111111111", data: {} }).is_mint, false);
});

test("scaled multiplier switches at its scheduled time", () => {
  const state = { multiplier: "1.00", newMultiplier: "1.02", newMultiplierEffectiveTimestamp: 2000 };
  assert.equal(effectiveMultiplier(state, 1999 * 1000), 1);
  assert.equal(effectiveMultiplier(state, 2000 * 1000), 1.02);
  assert.equal(effectiveMultiplier(null), 1);
});

test("buy cost is measured against the underlying, with the multiplier applied", () => {
  // 1.29 displayed tokens for $1000 at a $771.35 stock price.
  const raw = String(Math.round((1.29 / 1.005) * 1e8));
  const c = buyCost({ usdIn: 1000, outRaw: raw, decimals: 8, multiplier: 1.005, usdPrice: 770, underlyingPrice: 771.35 });
  close(c.tokens_out, 1.29, 1e-6);
  close(c.est_cost_pct, (1000 / 1.29 / 771.35 - 1) * 100);
  close(c.impact_pct, (1000 / 1.29 / 770 - 1) * 100);
  assert.equal(c.reference, "underlying");
  assert.equal(buyCost({ usdIn: 10, outRaw: "100000000", decimals: 8, usdPrice: 10 }).reference, "token");
});

test("exit impact and sizing", () => {
  const raw = rawForUsd(10000, 773.85, 8);
  assert.equal(raw, String(Math.floor((10000 / 773.85) * 1e8)));
  const e = exitImpact({ inRaw: raw, decimals: 8, multiplier: 1.005, usdPrice: 770, usdOut: 9980 });
  close(e.exit_impact_pct, 0.2, 0.01);
  assert.equal(rawForUsd(0.000001, 1e9, 0), null);
});

test("ranking: cost first, exit weighted, protection penalty, no-route penalty", () => {
  const ranked = ranking.rank(
    [
      { token_symbol: "A", issuer_name: "A", est_cost_pct: 0.1, exit_impact_10k_pct: 0.1, protection_level: "strongest", reference: "underlying" },
      { token_symbol: "B", issuer_name: "B", est_cost_pct: 0.05, exit_impact_10k_pct: 0.1, protection_level: "protected_with_caveat", reference: "underlying" },
      { token_symbol: "C", issuer_name: "C", est_cost_pct: -1, exit_impact_10k_pct: null, protection_level: "strongest", reference: "underlying" },
    ],
    { size_usd: 100, ticker: "SPY" },
  );
  // A: 0.125, B: 0.125 → tie on score and exit, A wins on protection. C: -1 + 2.5 = 1.5.
  assert.deepEqual(ranked.map((v) => v.token_symbol), ["A", "B", "C"]);
  assert.equal(ranked[0].rank, 1);
  assert.match(ranked[0].why, /^Best overall/);
  assert.match(ranked[2].why, /no route/);
});

test("ranking: a negative exit impact (stale RFQ mid) earns no bonus", () => {
  const base = { issuer_name: "X", protection_level: "strongest", reference: "underlying" };
  const ranked = ranking.rank(
    [
      { ...base, token_symbol: "RFQ", est_cost_pct: 0.03, exit_impact_10k_pct: -0.75 },
      { ...base, token_symbol: "AMM", est_cost_pct: -0.1, exit_impact_10k_pct: 0.1 },
    ],
    { size_usd: 2000, ticker: "QQQ" },
  );
  assert.deepEqual(ranked.map((v) => v.token_symbol), ["AMM", "RFQ"]);
  assert.equal(ranked[1].score, 0.03);
  assert.equal(ranked[1].exit_impact_10k_pct, -0.75); // raw value still reported
});

test("Backpack: .US securities with a Solana mint only", () => {
  const tokens = backpack.normalize(BACKPACK_ASSETS, BACKPACK_SECURITIES);
  assert.deepEqual(tokens.map((t) => t.underlying_ticker), ["HOOD", "SPY"]);
  assert.equal(tokens[0].cusip, "770700102");
  assert.equal(tokens[0].mint_address, MINT.HOOD);
});

test("PreStocks: mints read from the products page", () => {
  const [t] = prestocks.normalize(PRESTOCKS_HTML);
  assert.equal(t.mint_address, MINT.OPENAI);
  assert.equal(t.type, "pre_ipo");
  assert.deepEqual(prestocks.normalize("<html>redesigned</html>"), []);
});

test("dividends: withholding happens at the issuer", () => {
  const base = { dividend_mode: "REBASE_BALANCE", pays_dividends: true };
  const ondo = dividendInfo({ ...base, issuer_id: "ondo" });
  assert.equal(ondo.withholding_pct, 30);
  assert.equal(ondo.withholding_confirmed, true);
  assert.equal(ondo.reinvested_per_dollar, 0.7);
  assert.equal(dividendInfo({ ...base, issuer_id: "xstocks" }).withholding_confirmed, false);
  assert.match(dividendInfo({ ...base, issuer_id: "backpack" }).explanation, /hasn't been confirmed/);
  assert.equal(dividendInfo({ ...base, pays_dividends: false, issuer_id: "ondo" }).withholding_pct, null);
  assert.match(dividendInfo({ dividend_mode: "NO_RIGHTS", pays_dividends: false, issuer_id: "prestocks" }).explanation, /no right/);
});
