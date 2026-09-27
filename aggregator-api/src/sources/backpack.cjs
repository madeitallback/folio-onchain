const { json, fault } = require("../http.cjs");
const { isAddress } = require("./solana.cjs");

const ASSETS_URL = "https://api.backpack.exchange/api/v1/assets";
const SECURITIES_URL = "https://api.backpack.exchange/api/v1/securities";

// A Backpack Securities token is a ".US" asset that is also in the securities
// list (which carries the CUSIP) and has a Solana mint.
function normalize(assets, securities) {
  const bySymbol = new Map(securities.map((s) => [s.asset, s]));
  return assets.flatMap((a) => {
    const security = bySymbol.get(a.symbol);
    const sol = (a.tokens || []).find((t) => t.blockchain === "Solana" && isAddress(t.contractAddress));
    if (!/\.US$/.test(a.symbol) || !security || !sol) return [];
    const ticker = a.symbol.replace(/\.US$/, "");
    return [
      {
        issuer_id: "backpack",
        mint_address: sol.contractAddress,
        token_symbol: ticker,
        underlying_ticker: ticker.toUpperCase(),
        name: security.name || a.displayName,
        isin: null,
        cusip: security.cusip || null,
        trading_halted: false,
        logo_url: null,
        source_url: ASSETS_URL,
      },
    ];
  });
}

async function fetchBackpack() {
  const [assets, securities] = await Promise.all([json(ASSETS_URL), json(SECURITIES_URL)]);
  if (!Array.isArray(assets) || !Array.isArray(securities))
    throw fault("Backpack returned an unexpected asset list.", 502, "upstream_error");
  const tokens = normalize(assets, securities);
  if (!tokens.length) throw fault("Backpack listed no Solana securities.", 502, "upstream_error");
  return tokens;
}

module.exports = { fetchBackpack, normalize };
