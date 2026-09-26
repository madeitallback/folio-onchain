const { fetchX, cached, validAddress } = require("./market-data.cjs");
const seed = require("./data/solana-seed.json");
const ONDO_CSV =
  "https://www.dropbox.com/scl/fi/qjfxyg748mx0dwi6up86d/EXTERNAL-Ondo-GM-Tokens-Ondo-GM-Tokens.csv?dl=1&rlkey=n3no1w78wrah3umsl0nr9s77i";
const issuers = [
  {
    id: "xstocks",
    name: "xStocks",
    url: "https://xstocks.fi/",
    description: "Tokenized stocks and ETFs from Backed.",
  },
  {
    id: "ondo",
    name: "Ondo",
    url: "https://docs.ondo.finance/addresses",
    description: "Tokenized stocks and ETFs from Ondo Global Markets.",
  },
  {
    id: "backpack",
    name: "Backpack",
    url: "https://learn.backpack.exchange/blog/tokenized-robinhood-hood",
    description: "Tokenized equities from Backpack Securities.",
  },
  {
    id: "prestocks",
    name: "PreStocks",
    url: "https://prestocks.com",
    description:
      "Private-company exposure. Discovery only until addresses are confirmed.",
  },
];
function parseCSV(text) {
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if (c === "\n" && !quoted) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const headers = rows.shift() || [];
  return rows
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] || ""])));
}
function normalizeCSV(text) {
  return parseCSV(text)
    .filter(
      (r) =>
        r.Symbol !== "USDon" &&
        validAddress("solana", r["Solana Deployed Address"]),
    )
    .map((r) => ({
      id: "ondo:solana:" + r["Solana Deployed Address"],
      ticker: r["Stock Ticker"] || r.Symbol.replace(/on$/, ""),
      symbol: r.Symbol,
      name: r["Stock Name"] || r.Name.replace(" (Ondo Tokenized)", ""),
      issuer: "Ondo",
      issuerId: "ondo",
      chain: "solana",
      address: r["Solana Deployed Address"],
      logo: r["Link to image (png)"],
      source: "https://docs.ondo.finance/addresses",
      kind: /ETF/i.test(r.Type + " " + r["Type Detail"]) ? "ETF" : "Stock",
      verified: true,
      halted: false,
    }));
}
async function ondo() {
  const r = await fetch(ONDO_CSV, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw Error("Ondo catalog unavailable");
  const result = normalizeCSV(await r.text());
  if (!result.length) throw Error("Ondo returned no Solana assets");
  return result;
}
const backpack = [
  {
    id: "backpack:solana:HooDYv5RewLRiMLnEVq3VJqdqxhuE6c5eYvqejMC3e9A",
    ticker: "HOOD",
    symbol: "HOOD",
    name: "Robinhood Markets",
    issuer: "Backpack",
    issuerId: "backpack",
    chain: "solana",
    address: "HooDYv5RewLRiMLnEVq3VJqdqxhuE6c5eYvqejMC3e9A",
    source: issuers[2].url,
    kind: "Stock",
    verified: true,
    halted: false,
  },
];
function mergeCatalog(live) {
  const verified = live.map((t) => {
    const id = t.issuerId || "xstocks";
    const match = seed.tokens.find(
      (s) => s.issuerId === id && s.ticker === t.ticker,
    );
    return {
      ...t,
      issuerId: id,
      verified: true,
      kind: match?.kind || t.kind,
      name: match?.name || t.name,
    };
  });
  const keys = new Set(verified.map((t) => t.issuerId + ":" + t.ticker));
  const pending = seed.tokens
    .filter((t) => !keys.has(t.issuerId + ":" + t.ticker))
    .map((t) => ({
      id: "pending:" + t.issuerId + ":" + t.ticker,
      ticker: t.ticker,
      name: t.name,
      symbol: t.symbol,
      issuerId: t.issuerId,
      issuer: issuers.find((i) => i.id === t.issuerId)?.name || t.issuerId,
      kind: t.kind,
      chain: "solana",
      address: null,
      verified: false,
      source: issuers.find((i) => i.id === t.issuerId)?.url,
    }));
  return [...verified, ...pending];
}
async function catalog() {
  return cached("solana-catalog-v3", 900000, async () => {
    const r = await Promise.allSettled([
      fetchX().then((ts) => ts.filter((t) => t.chain === "solana")),
      ondo(),
    ]);
    const live = r.flatMap((x) => (x.status === "fulfilled" ? x.value : []));
    return {
      tokens: mergeCatalog([...live, ...backpack]),
      issuers,
      sources: r.map((x, i) => ({
        name: i ? "Ondo" : "xStocks",
        status: x.status === "fulfilled" ? "available" : "unavailable",
      })),
      asOf: new Date().toISOString(),
      seedDate: seed.snapshotDate,
    };
  });
}
module.exports = { catalog, parseCSV, normalizeCSV, mergeCatalog };
