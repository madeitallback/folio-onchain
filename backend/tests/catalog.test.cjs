const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCSV, normalizeCSV, mergeCatalog } = require("../catalog.cjs");
const { sumUSDC, USDC } = require("../wallet.cjs");
test("issuer CSV supports quoted commas, escaped quotes and multiline descriptions", () => {
  const rows = parseCSV(
    'Name,Symbol,Description\r\n"Company, Inc.",ABCon,"First line\nSecond ""quoted"" line"\r\n',
  );
  assert.equal(rows[0].Name, "Company, Inc.");
  assert.equal(rows[0].Description, 'First line\nSecond "quoted" line');
});
test("Ondo Solana list excludes currency and missing or invalid mint addresses", () => {
  const address = "HooDYv5RewLRiMLnEVq3VJqdqxhuE6c5eYvqejMC3e9A";
  const csv = `Symbol,Solana Deployed Address,Stock Ticker,Type,Stock Name\nUSDon,${address},-,Currency,Cash\nSPYon,${address},SPY,ETF,SP500\nFAKEon,0x123,FAKE,Stock,Fake\n`;
  const tokens = normalizeCSV(csv);
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].ticker, "SPY");
  assert.equal(tokens[0].kind, "ETF");
  assert.equal(tokens[0].verified, true);
});
test("research entries never authorize an unverified mint or copy snapshot financial metrics", () => {
  const tokens = mergeCatalog([]);
  assert.ok(tokens.length > 0);
  assert.ok(tokens.every((t) => !t.verified && t.address === null));
  assert.ok(
    tokens.every((t) => t.price === undefined && t.volume24h === undefined),
  );
});
test("confirmed issuer listing supersedes research identity without duplicates", () => {
  const live = {
    id: "live",
    ticker: "NVDA",
    name: "Nvidia xStock",
    issuerId: "xstocks",
    address: "mint",
    kind: "Stock",
  };
  const tokens = mergeCatalog([live]).filter(
    (t) => t.ticker === "NVDA" && t.issuerId === "xstocks",
  );
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].address, "mint");
  assert.equal(tokens[0].verified, true);
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
