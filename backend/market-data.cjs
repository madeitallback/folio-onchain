const { cached, request } = require("./infrastructure.cjs");
async function json(url, headers = {}) {
  return (await request(url, { headers })).json();
}
function validAddress(chain, address) {
  return (
    typeof address === "string" &&
    (chain === "solana"
      ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
      : /^0x[0-9a-fA-F]{40}$/.test(address))
  );
}
function selectPairs(pairs, t) {
  const match = (a, b) =>
    t.chain === "solana" ? a === b : a?.toLowerCase() === b?.toLowerCase();
  return (Array.isArray(pairs) ? pairs : [])
    .filter(
      (p) =>
        p.chainId === t.chain &&
        match(p.baseToken?.address, t.address) &&
        Number(p.priceUsd) > 0,
    )
    .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
}
async function market(t) {
  return cached("market:" + t.id, 60000, async () => {
    const pairs = selectPairs(
      await json(
        `https://api.dexscreener.com/token-pairs/v1/${t.chain}/${t.address}`,
      ),
      t,
    );
    const p = pairs[0];
    return {
      id: t.id,
      asOf: new Date().toISOString(),
      source: "DEX Screener",
      status: p ? "available" : "no-market",
      price: p ? Number(p.priceUsd) : null,
      change24h: p?.priceChange?.h24 ?? null,
      liquidity: p?.liquidity?.usd ?? null,
      volume24h: p?.volume?.h24 ?? null,
      pair: p?.pairAddress ?? null,
      venue: p?.dexId ?? null,
      url: p ? `https://dexscreener.com/${t.chain}/${p.pairAddress}` : null,
      poolCount: pairs.length,
      notice:
        "Latest retrieved pool price, not a stock-exchange quote or executable offer. Low activity can make prices stale. Pool metrics are for the selected pool only.",
    };
  });
}
async function history(t) {
  return cached("history:" + t.id, 5 * 60000, async () => {
    const m = await market(t);
    if (!m.pair)
      return { points: [], reason: "No indexed pool with price history." };
    const chain = {
      ethereum: "eth",
      arbitrum: "arbitrum",
      bsc: "bsc",
      solana: "solana",
      base: "base",
      optimism: "optimism",
      polygon: "polygon_pos",
    }[t.chain];
    if (!chain)
      return {
        points: [],
        reason: "History provider does not support this network.",
      };
    const d = await json(
      `https://api.geckoterminal.com/api/v2/networks/${chain}/pools/${m.pair}/ohlcv/day?aggregate=1&limit=90&currency=usd&token=${t.address}`,
    );
    const points = (d.data?.attributes?.ohlcv_list || [])
      .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[4]) && p[4] > 0)
      .map((p) => ({ time: p[0] * 1000, value: p[4] }))
      .sort((a, b) => a.time - b.time);
    return {
      points,
      asOf: new Date().toISOString(),
      source: "GeckoTerminal",
      label: "Daily pool closes · USD · up to 90 days",
      notice:
        "Token price history only. Not an underlying-stock total return or a portfolio backtest.",
    };
  });
}
async function quote(t, amount) {
  return require("./trading.cjs").quote(t, {
    amount: String(amount),
    side: "buy",
  });
}
module.exports = {
  market,
  history,
  quote,
  selectPairs,
  validAddress,
  json,
  cached,
};
