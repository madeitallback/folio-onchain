const env = process.env;
const MINUTE = 60000;

module.exports = {
  port: Number(env.AGGREGATOR_PORT || 3003),
  rpcUrls: [
    env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    env.SOLANA_RPC_FALLBACK_URL,
  ].filter(Boolean),
  jupiterKey: env.JUPITER_API_KEY || null,
  // Price and token data are free on lite-api; a key moves them to the paid host.
  jupiterDataBase: env.JUPITER_API_KEY
    ? "https://api.jup.ag"
    : "https://lite-api.jup.ag",
  jupiterOrderUrl: "https://api.jup.ag/swap/v2/order",
  xstocksUrl: "https://api.xstocks.fi/api/v2/public/assets",
  // The CSV linked from https://docs.ondo.finance/addresses
  ondoCsvUrl:
    env.ONDO_CSV_URL ||
    "https://www.dropbox.com/scl/fi/qjfxyg748mx0dwi6up86d/EXTERNAL-Ondo-GM-Tokens-Ondo-GM-Tokens.csv?dl=1&rlkey=n3no1w78wrah3umsl0nr9s77i",
  usdcMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  warm: env.AGGREGATOR_WARM !== "off",
  ttl: {
    catalog: 6 * 60 * MINUTE,
    market: 5 * MINUTE,
    quote: 30000,
    depth: 15 * MINUTE, // the fixed $10k exit probe
    // How long the shared store may serve an old value while a refresh runs
    // (or while every upstream is down).
    catalogStale: 7 * 24 * 60 * MINUTE,
    marketStale: 60 * MINUTE,
    route: 30 * MINUTE, // "is there a buy route" check
    routeStale: 24 * 60 * MINUTE,
    verify: 10 * MINUTE,
  },
  limits: {
    minUsd: 1,
    maxUsd: 1000000,
    exitProbeUsd: 10000,
    warmRoutes: 150, // most liquid assets whose $100 route is kept checked
    warmVersions: 50, // of those, how many also get every other version checked
  },
};
