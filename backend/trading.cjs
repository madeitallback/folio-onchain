const { cached, request, fault, quoteSlot } = require("./infrastructure.cjs");
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
function atomic(value, decimals) {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 18 ||
    !/^\d+(\.\d+)?$/.test(String(value))
  )
    throw fault("Invalid amount.", 400);
  const [whole, fraction = ""] = String(value).split(".");
  if (fraction.length > decimals)
    throw fault("Amount has too many decimal places.", 400);
  const raw =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0");
  if (raw <= 0n || raw > 18446744073709551615n)
    throw fault("Amount is out of range.", 400);
  return raw.toString();
}
async function quote(
  t,
  { amount = "100", side = "buy", raw, probe = false } = {},
) {
  if (!t.verified || t.halted || t.chain !== "solana")
    throw fault("This token is not available to trade.", 400);
  if (!["buy", "sell"].includes(side))
    throw fault("Invalid trade direction.", 400);
  const units = side === "buy" ? atomic(amount, 6) : String(raw || "");
  if (!/^[1-9]\d{0,19}$/.test(units) || BigInt(units) > 18446744073709551615n)
    throw fault("Invalid token amount.", 400);
  if (
    side === "buy" &&
    (BigInt(units) < 1000000n || BigInt(units) > 1000000000000n)
  )
    throw fault("Enter 1–1,000,000 USDC.", 400);
  return cached(
    "quote:" + t.address + ":" + side + ":" + units + (probe ? ":probe" : ""),
    probe ? 60000 : 5000,
    () =>
      quoteSlot(async () => {
        const inputMint = side === "buy" ? USDC : t.address,
          outputMint = side === "buy" ? t.address : USDC;
        const url =
          "https://api.jup.ag/swap/v2/order?" +
          new URLSearchParams({ inputMint, outputMint, amount: units });
        const r = await request(url, {
          acceptStatuses: [400],
          headers: process.env.JUPITER_API_KEY
            ? { "x-api-key": process.env.JUPITER_API_KEY }
            : {},
        });
        const d = await r.json();
        const asOf = new Date().toISOString();
        if (!d.outAmount || BigInt(d.outAmount) <= 0n) {
          if (
            d.errorCode === 1 ||
            /route|liquidity|not tradable/i.test(
              d.errorMessage || d.error || "",
            )
          )
            return {
              status: "no-route",
              asOf,
              message: "No route is currently available for this amount.",
            };
          throw fault(
            "Quote provider did not return a valid quote. Retry shortly.",
          );
        }
        return {
          status: "quoted",
          inputMint,
          outputMint,
          inAmount: units,
          outAmount: String(d.outAmount),
          router: d.router || "Jupiter",
          feeBps: d.feeBps ?? null,
          priceImpact: d.priceImpact ?? d.priceImpactPct ?? null,
          asOf,
          expiresAt: new Date(Date.now() + 20000).toISOString(),
          message:
            "Indicative quote. Jupiter refreshes the final price before wallet approval.",
        };
      }),
  );
}
const priority = [
  "SPY",
  "NVDA",
  "AAPL",
  "MSFT",
  "QQQ",
  "GOOGL",
  "AMZN",
  "TSLA",
  "MCD",
  "HOOD",
];
async function browse(c, q, quoteFn = quote) {
  const search = (q.get("q") || "").trim().toLowerCase(),
    issuer = q.get("issuer"),
    kind = q.get("kind"),
    names = q.get("tickers");
  const count = Number(q.get("limit") || 5),
    offset = Number(q.get("cursor") || 0);
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 8 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 10000 ||
    search.length > 100
  )
    throw fault("Invalid catalog page.", 400);
  const map = new Map();
  for (const t of c.tokens) {
    if (
      !t.verified ||
      t.halted ||
      (issuer && t.issuerId !== issuer) ||
      (kind ? t.kind !== kind : t.kind === "Pre-IPO") ||
      (names !== null && !names.split(",").includes(t.ticker))
    )
      continue;
    if (
      search &&
      !(
        (t.ticker + " " + t.name).toLowerCase().includes(search) ||
        t.address === q.get("q")
      )
    )
      continue;
    if (!map.has(t.ticker))
      map.set(t.ticker, {
        ticker: t.ticker,
        name: t.name,
        kind: t.kind,
        tokens: [],
      });
    map.get(t.ticker).tokens.push(t);
  }
  const groups = [...map.values()].sort((a, b) =>
    q.get("sort") === "name"
      ? a.ticker.localeCompare(b.ticker)
      : (priority.indexOf(a.ticker) + 1 || 999) -
          (priority.indexOf(b.ticker) + 1 || 999) ||
        a.ticker.localeCompare(b.ticker),
  );
  const found = [];
  let cursor = offset,
    checks = 0,
    interrupted = false;
  while (cursor < groups.length && found.length < count && checks < 12) {
    const g = groups[cursor];
    let candidate = null;
    for (const t of g.tokens) {
      if (checks >= 12) break;
      checks++;
      try {
        const r = await quoteFn(t, { amount: "100", probe: true });
        if (r.status === "quoted") {
          candidate = { ...t, routeCheckedAt: r.asOf };
          break;
        }
      } catch (e) {
        if (e.status >= 500 || e.status === 429) {
          interrupted = true;
          break;
        }
        throw e;
      }
    }
    if (interrupted) break;
    cursor++;
    if (candidate)
      found.push({
        ...g,
        tokens: [candidate, ...g.tokens.filter((t) => t.id !== candidate.id)],
        routeCheckedAt: candidate.routeCheckedAt,
      });
  }
  return {
    groups: found,
    nextCursor: cursor < groups.length ? cursor : null,
    checked: checks,
    interrupted,
    asOf: new Date().toISOString(),
    probeUSDC: 100,
    notice: interrupted
      ? "Route checks are temporarily unavailable. Retry shortly."
      : "Routes checked for 100 USDC. Your final amount is quoted again.",
  };
}
module.exports = { quote, browse, atomic };
