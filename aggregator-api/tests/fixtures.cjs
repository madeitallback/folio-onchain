// Deterministic fake upstreams: xStocks, Ondo CSV, Solana RPC, Jupiter.
const T22 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const MINT = {
  SPYx: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
  TSLAx: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
  SPYon: "k18WJUULWheRkSpSquYGdNNmtuE2Vbw1hpuUi92ondo",
  HOOD: "HooDYv5RewLRiMLnEVq3VJqdqxhuE6c5eYvqejMC3e9A",
  SPYbp: "SPYBo66VJPFjh1pXMb9Le53kDYWTK1zzYVDeVRWtsbi",
  OPENAI: "PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF",
  FAKE: "FakeSpyx111111111111111111111111111111111111",
};

const XNODES = [
  {
    name: "SP500 xStock",
    symbol: "SPYx",
    underlyingSymbol: "SPY",
    underlyingIsin: "US78462F1030",
    logo: "https://example.com/spyx.png",
    isTradingHalted: false,
    deployments: [
      { network: "Ethereum", address: "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48" },
      { network: "Solana", address: MINT.SPYx },
    ],
  },
  {
    name: "Tesla xStock",
    symbol: "TSLAx",
    underlyingSymbol: "TSLA",
    isTradingHalted: true,
    deployments: [{ network: "Solana", address: MINT.TSLAx }],
  },
];

const ONDO_CSV = [
  "Name,Symbol,Solana Deployed Address,Link to image (png),Stock Name,Stock Ticker,Type,ISIN,Description",
  'Ondo U.S. Dollar Token,USDon,ZPFtoCe7WWqG4N3ZFRccS8T9SMBeHsd1Vmgv2i7ondo,,Ondo U.S. Dollar Token,-,Currency,,"A dollar, token"',
  `SPDR S&P 500 ETF (Ondo Tokenized),SPYon,${MINT.SPYon},https://example.com/spyon.png,SPDR S&P 500 ETF,SPY,ETF,US78462F1030,"SPYon tracks SPY, reinvesting ""dividends"""`,
  "",
].join("\r\n");

const BACKPACK_ASSETS = [
  { symbol: "HOOD.US", displayName: "Robinhood Markets, Inc.", tokens: [{ blockchain: "Solana", contractAddress: MINT.HOOD }] },
  { symbol: "SPY.US", displayName: "SPDR S&P 500 ETF Trust", tokens: [{ blockchain: "Solana", contractAddress: MINT.SPYbp }] },
  { symbol: "AIZ.US", displayName: "Assurant", tokens: [{ blockchain: "Solana", contractAddress: null }] },
  { symbol: "BTC", displayName: "Bitcoin", tokens: [{ blockchain: "Solana", contractAddress: "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij" }] },
];
const BACKPACK_SECURITIES = [
  { asset: "HOOD.US", cusip: "770700102", name: "Robinhood Markets, Inc." },
  { asset: "SPY.US", cusip: "78462F103", name: "SPDR S&P 500 ETF Trust" },
  { asset: "AIZ.US", cusip: "04621X108", name: "Assurant" },
];

// PreStocks embeds its products as escaped JSON inside the page.
const PRESTOCKS_HTML =
  '<html><script>self.__next_f.push([1,"{\\"symbol\\":\\"OPENAI\\",\\"name\\":\\"OpenAI\\",\\"route\\":\\"openai\\",' +
  '\\"splMint\\":\\"' + MINT.OPENAI + '\\",\\"lastRoundPrice\\":687.69}"])</script></html>';

const scaled = (multiplier) => ({
  extension: "scaledUiAmountConfig",
  state: {
    multiplier: "1",
    newMultiplier: String(multiplier),
    newMultiplierEffectiveTimestamp: 1700000000, // in the past
  },
});

const mintAccount = (decimals, extensions, supply = "100000000000") => ({
  owner: T22,
  data: {
    program: "spl-token-2022",
    parsed: {
      type: "mint",
      info: {
        decimals,
        supply,
        mintAuthority: "Auth111111111111111111111111111111111111111",
        freezeAuthority: "Frz1111111111111111111111111111111111111111",
        isInitialized: true,
        extensions,
      },
    },
  },
});

// HOOD has no account on purpose: it must fail the on-chain check.
const ACCOUNTS = {
  [MINT.SPYx]: mintAccount(8, [
    scaled(1.005),
    { extension: "pausableConfig", state: { authority: "x", paused: false } },
  ]),
  [MINT.TSLAx]: mintAccount(8, [scaled(1)]),
  [MINT.SPYon]: mintAccount(9, [scaled(1.01)]),
  [MINT.SPYbp]: mintAccount(6, []),
  [MINT.OPENAI]: mintAccount(9, [
    {
      extension: "transferFeeConfig",
      state: { olderTransferFee: { transferFeeBasisPoints: 100 }, newerTransferFee: { transferFeeBasisPoints: 300 } },
    },
  ]),
  [MINT.FAKE]: mintAccount(6, [
    { extension: "tokenMetadata", state: { name: "SP500 xStock", symbol: "SPYx", uri: "" } },
  ]),
};

// usdPrice is per displayed token; prescaled = usdPrice * multiplier.
const MARKET = {
  [MINT.SPYx]: { usdPrice: 770, multiplier: 1.005, decimals: 8, buySlip: 0.001, sellSlip: 0.002, mcap: 70e6, volume: 8e6 },
  [MINT.SPYon]: { usdPrice: 772, multiplier: 1.01, decimals: 9, buySlip: 0.0005, sellSlip: 0.001, mcap: 1e6, volume: 700 },
  // Quotable but not priced by Jupiter: ranked with the stock price borrowed from its siblings.
  [MINT.SPYbp]: { unpriced: true, usdPrice: 771.35, multiplier: 1, decimals: 6, buySlip: 0.003, sellSlip: 0.003 },
  [MINT.TSLAx]: { usdPrice: 250, multiplier: 1, decimals: 8, buySlip: 0.001, sellSlip: 0.001, mcap: 5e6, volume: 1e5 },
};
const UNDERLYING = 771.35;

const reply = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => (typeof body === "string" ? JSON.parse(body) : body),
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});

function defaultOrder(u) {
  const input = u.searchParams.get("inputMint");
  const output = u.searchParams.get("outputMint");
  const amount = Number(u.searchParams.get("amount"));
  if (input === USDC) {
    const m = MARKET[output];
    if (!m) return reply({ error: "Quote not available from market maker" });
    const raw = Math.floor(((amount / 1e6) / (m.usdPrice * m.multiplier * (1 + m.buySlip))) * 10 ** m.decimals);
    return reply({ inAmount: String(amount), outAmount: String(raw), feeBps: 10, router: "metis", swapType: "aggregator", routePlan: [{ swapInfo: { label: "Raydium CLMM" } }] });
  }
  const m = MARKET[input];
  const usdOut = (amount / 10 ** m.decimals) * m.multiplier * m.usdPrice * (1 - m.sellSlip);
  return reply({ inAmount: String(amount), outAmount: String(Math.floor(usdOut * 1e6)), feeBps: 10, router: "jupiterz", swapType: "rfq", routePlan: [{ swapInfo: { label: "JupiterZ" } }] });
}

function fakeUpstream({ order = defaultOrder } = {}) {
  const calls = [];
  const fetch = async (url, opts = {}) => {
    url = String(url);
    calls.push(url);
    const u = new URL(url);
    if (u.host === "api.xstocks.fi") return reply({ nodes: XNODES, page: { hasNextPage: false } });
    if (u.host.includes("dropbox")) return reply(ONDO_CSV);
    if (u.pathname === "/api/v1/assets") return reply(BACKPACK_ASSETS);
    if (u.pathname === "/api/v1/securities") return reply(BACKPACK_SECURITIES);
    if (u.host === "prestocks.com") return reply(PRESTOCKS_HTML);
    if (u.host === "api.mainnet-beta.solana.com") {
      const body = JSON.parse(opts.body);
      return reply({
        jsonrpc: "2.0",
        id: 1,
        result: { context: { slot: 1 }, value: body.params[0].map((m) => ACCOUNTS[m] || null) },
      });
    }
    if (u.pathname === "/price/v3") {
      const ids = u.searchParams.get("ids").split(",");
      return reply(
        Object.fromEntries(
          ids
            .filter((id) => MARKET[id] && !MARKET[id].unpriced)
            .map((id) => {
              const m = MARKET[id];
              return [
                id,
                {
                  usdPrice: m.usdPrice,
                  liquidity: 1e6,
                  decimals: m.decimals,
                  priceChange24h: 0.1,
                  stockData: id === MINT.TSLAx ? undefined : { price: UNDERLYING },
                  scaledUiConfig: { multiplier: m.multiplier, usdPricePrescaled: m.usdPrice * m.multiplier },
                },
              ];
            }),
        ),
      );
    }
    if (u.pathname === "/tokens/v2/search") {
      const ids = u.searchParams.get("query").split(",");
      return reply(
        ids
          .filter((id) => MARKET[id] && !MARKET[id].unpriced)
          .map((id) => ({
            id,
            symbol: "?",
            mcap: MARKET[id].mcap,
            holderCount: 10,
            isVerified: true,
            stats24h: { buyVolume: MARKET[id].volume / 2, sellVolume: MARKET[id].volume / 2 },
          })),
      );
    }
    if (u.pathname === "/swap/v2/order") return order(u);
    throw new Error("Unexpected upstream call: " + url);
  };
  return { fetch, calls };
}

module.exports = { MINT, UNDERLYING, MARKET, ACCOUNTS, XNODES, ONDO_CSV, BACKPACK_ASSETS, BACKPACK_SECURITIES, PRESTOCKS_HTML, fakeUpstream, defaultOrder, reply };
