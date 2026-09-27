// Dividend withholding happens at the issuer, not the holder: the issuer's
// company owns the real shares, receives the dividend net of US tax (based on
// the issuer's jurisdiction), and reinvests what's left. The holder's own
// country doesn't change what is withheld.
const WITHHOLDING = {
  ondo: {
    rate_pct: 30,
    confirmed: true,
    withheld_from: "Ondo Global Markets (British Virgin Islands)",
    source: "https://docs.ondo.finance/ondo-stocks/fees-and-taxes",
  },
  xstocks: {
    rate_pct: 30,
    confirmed: false, // xStocks says "net of applicable taxes" without a rate
    withheld_from: "Backed Assets (JE) Ltd (Jersey)",
    source: "https://docs.xstocks.fi/docs/frequently-asked-questions",
  },
};

function dividendInfo(t) {
  const w = WITHHOLDING[t.issuer_id] || null;
  const base = {
    mode: t.dividend_mode,
    pays_dividends: t.pays_dividends,
    withholding_pct: null,
    withholding_confirmed: false,
    withheld_from: null,
    reinvested_per_dollar: null,
    source: null,
  };
  if (t.dividend_mode === "NO_RIGHTS")
    return { ...base, explanation: "This token gives you no right to dividends." };
  if (t.pays_dividends === false)
    return { ...base, explanation: "This company doesn't pay a dividend right now." };
  if (t.pays_dividends === null)
    return { ...base, explanation: "Whether this company pays a dividend isn't confirmed yet." };
  if (!w)
    return {
      ...base,
      explanation:
        "Dividends are reinvested for you, but how much US tax is taken first hasn't been confirmed for this issuer.",
    };
  const kept = (100 - w.rate_pct) / 100;
  return {
    ...base,
    withholding_pct: w.rate_pct,
    withholding_confirmed: w.confirmed,
    withheld_from: w.withheld_from,
    reinvested_per_dollar: kept,
    source: w.source,
    explanation:
      `Dividends are reinvested for you automatically. ${w.withheld_from} holds the real shares, ` +
      `so US tax takes ${w.rate_pct}% before reinvesting: of a $1 dividend, about $${kept.toFixed(2)} ` +
      `goes back into your position. Where you live doesn't change this.` +
      (w.confirmed ? "" : " (Rate not stated by the issuer; 30% is the US default for its jurisdiction.)"),
  };
}

module.exports = { dividendInfo, WITHHOLDING };
