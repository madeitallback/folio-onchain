const { request, fault } = require("../http.cjs");
const { isAddress } = require("./solana.cjs");

// PreStocks has no public API. Its own products page embeds each product with
// its mint (`splMint`), so we read it from there.
const PRODUCTS_URL = "https://prestocks.com/products";
const PRODUCT = /"symbol":"([A-Z0-9]+)","name":"([^"]+)"[^{}]*?"splMint":"([1-9A-HJ-NP-Za-km-z]{32,44})"/g;

function normalize(html) {
  const text = html.replace(/\\"/g, '"');
  const seen = new Map();
  for (const [, symbol, name, mint] of text.matchAll(PRODUCT)) {
    if (!isAddress(mint) || seen.has(mint)) continue;
    seen.set(mint, {
      issuer_id: "prestocks",
      mint_address: mint,
      token_symbol: symbol,
      underlying_ticker: symbol,
      name,
      type: "pre_ipo",
      isin: null,
      trading_halted: false,
      logo_url: null,
      source_url: PRODUCTS_URL,
    });
  }
  return [...seen.values()];
}

async function fetchPreStocks() {
  const res = await request(PRODUCTS_URL);
  const tokens = normalize(await res.text());
  if (!tokens.length) throw fault("PreStocks products page had no mints (page layout changed?).", 502, "upstream_error");
  return tokens;
}

module.exports = { fetchPreStocks, normalize };
