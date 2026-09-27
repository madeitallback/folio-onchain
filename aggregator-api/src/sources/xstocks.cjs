const config = require("../config.cjs");
const { json, fault } = require("../http.cjs");
const { isAddress } = require("./solana.cjs");

const MAX_PAGES = 20;

function normalize(nodes) {
  return nodes.flatMap((a) => {
    const d = (a.deployments || []).find((x) => x.network === "Solana");
    if (!d || !isAddress(d.address) || !a.symbol) return [];
    return [
      {
        issuer_id: "xstocks",
        mint_address: d.address,
        token_symbol: a.symbol,
        underlying_ticker: (
          a.underlyingSymbol ||
          a.underlying?.symbol ||
          a.symbol.replace(/x$/, "")
        ).toUpperCase(),
        name: String(a.name || a.symbol).replace(/\s*xStock$/i, "").trim(),
        isin: a.underlyingIsin || a.underlying?.isin || null,
        trading_halted: !!(a.isTradingHalted || a.trading?.isTradingHalted),
        logo_url: a.logo || null,
        source_url: config.xstocksUrl,
      },
    ];
  });
}

async function fetchXStocks() {
  const nodes = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const d = await json(
      `${config.xstocksUrl}?network=Solana&pageSize=100&page=${page}`,
    );
    if (!Array.isArray(d.nodes))
      throw fault("xStocks returned an unexpected catalog.", 502, "upstream_error");
    nodes.push(...d.nodes);
    if (!d.page?.hasNextPage) return normalize(nodes);
  }
  throw fault("xStocks catalog has more pages than expected.", 502, "upstream_error");
}

module.exports = { fetchXStocks, normalize };
