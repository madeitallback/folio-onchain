const test = require("node:test");
const assert = require("node:assert/strict");
const { validate, splitCents } = require("../../frontend/lib/allocation.cjs");
const {
  normalizeX,
  normalizeOndo,
  selectPairs,
  validAddress,
} = require("../market-data.cjs");
const sol = "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W";
const evm = "0xFeDC5f4a6c38211c1338aa411018DFAf26612c08";
test("basket allocation preserves every cent across fractional weights", () => {
  const amounts = splitCents(10, [33.33, 33.33, 33.34]);
  assert.equal(
    amounts.reduce((s, n) => s + Math.round(n * 100), 0),
    1000,
  );
  assert.deepEqual(amounts, [3.33, 3.33, 3.34]);
});
test("invalid financial inputs cannot proceed to review", () => {
  for (const amount of [NaN, Infinity, -10, 0, 1000001])
    assert.ok(validate(amount, [{ weight: 100 }]));
  assert.ok(validate(500, [{ weight: 60 }, { weight: 20 }]));
  assert.ok(validate(500, [{ weight: -10 }, { weight: 110 }]));
  assert.ok(validate(10, [{ weight: 0.1 }, { weight: 99.9 }]));
  assert.equal(
    validate(500, [{ weight: 60 }, { weight: 25 }, { weight: 15 }]),
    "",
  );
});
test("catalog separates deployments of the same underlying asset", () => {
  const ts = normalizeX([
    {
      name: "SP500 xStock",
      symbol: "SPYx",
      underlyingSymbol: "SPY",
      deployments: [
        { network: "Solana", address: sol },
        { network: "Ethereum", address: evm },
        { network: "Unknown", address: sol },
      ],
    },
  ]);
  assert.equal(ts.length, 2);
  assert.notEqual(ts[0].id, ts[1].id);
  assert.ok(ts.every((t) => t.ticker === "SPY"));
  assert.equal(ts[0].decimals, null);
});
test("Ondo catalog excludes stablecoins, portfolios, and invalid deployments", () => {
  const tokens = [
    {
      symbol: "SPYon",
      name: "SPDR ETF (Ondo Tokenized)",
      chainId: 1,
      address: evm,
      tags: ["ondo"],
      decimals: 18,
    },
    { symbol: "USDon", chainId: 1, address: evm, tags: ["ondo"] },
    { symbol: "PORT", chainId: 1, address: evm, tags: ["oip"] },
  ];
  const actual = normalizeOndo(tokens);
  assert.equal(actual.length, 1);
  assert.equal(actual[0].ticker, "SPY");
  assert.equal(actual[0].name, "SPDR ETF");
});
test("pool matching rejects spoofed ticker and quote-side prices", () => {
  const t = { chain: "solana", address: sol };
  const pairs = [
    {
      chainId: "solana",
      baseToken: { address: "FAKE" },
      quoteToken: { address: sol },
      priceUsd: "1",
      liquidity: { usd: 9999999 },
    },
    {
      chainId: "solana",
      baseToken: { address: sol },
      priceUsd: "773",
      liquidity: { usd: 100 },
    },
    {
      chainId: "solana",
      baseToken: { address: sol },
      priceUsd: "774",
      liquidity: { usd: 1000 },
    },
    { chainId: "ethereum", baseToken: { address: sol }, priceUsd: "800" },
  ];
  const selected = selectPairs(pairs, t);
  assert.equal(selected.length, 2);
  assert.equal(selected[0].priceUsd, "774");
});
test("Solana address case is preserved and EVM comparison is case insensitive", () => {
  assert.ok(validAddress("solana", sol));
  assert.ok(validAddress("ethereum", evm));
  assert.equal(validAddress("ethereum", "javascript:alert(1)"), false);
  assert.equal(
    selectPairs(
      [
        {
          chainId: "ethereum",
          baseToken: { address: evm.toLowerCase() },
          priceUsd: "1",
        },
      ],
      { chain: "ethereum", address: evm },
    ).length,
    1,
  );
  assert.equal(
    selectPairs(
      [
        {
          chainId: "solana",
          baseToken: { address: sol.toLowerCase() },
          priceUsd: "1",
        },
      ],
      { chain: "solana", address: sol },
    ).length,
    0,
  );
});
