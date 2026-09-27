const config = require("../config.cjs");
const { request, fault } = require("../http.cjs");
const { isAddress } = require("./solana.cjs");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
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
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const headers = (rows.shift() || []).map((h) => h.trim());
  return rows
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] || "").trim()])));
}

function normalize(rows) {
  return rows.flatMap((r) => {
    const mint = r["Solana Deployed Address"];
    const ticker = r["Stock Ticker"];
    if (!isAddress(mint) || !ticker || ticker === "-" || !/^(Stock|ETF)$/i.test(r.Type))
      return [];
    return [
      {
        issuer_id: "ondo",
        mint_address: mint,
        token_symbol: r.Symbol,
        underlying_ticker: ticker.toUpperCase(),
        name: r["Stock Name"] || r.Name.replace(/\s*\(Ondo Tokenized\)$/i, ""),
        isin: r.ISIN || null,
        type: /ETF/i.test(r.Type) ? "etf" : "stock",
        trading_halted: false,
        logo_url: r["Link to image (png)"] || null,
        source_url: "https://docs.ondo.finance/addresses",
      },
    ];
  });
}

async function fetchOndo() {
  const res = await request(config.ondoCsvUrl);
  const tokens = normalize(parseCsv(await res.text()));
  if (!tokens.length)
    throw fault("Ondo token list had no Solana assets.", 502, "upstream_error");
  return tokens;
}

module.exports = { fetchOndo, parseCsv, normalize };
