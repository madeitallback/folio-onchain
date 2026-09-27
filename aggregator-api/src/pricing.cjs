// Pure money math. Token amounts are converted to displayed tokens with the
// Token-2022 multiplier so a token compares 1:1 with a share of the underlying.

const round = (x, dp = 4) =>
  Number.isFinite(x) ? Math.round(x * 10 ** dp) / 10 ** dp : null;

const uiAmount = (raw, decimals, multiplier = 1) =>
  (Number(raw) / 10 ** decimals) * multiplier;

// Cost of a buy relative to a fair price. The underlying stock price is the
// reference when known, so every version of one stock is measured the same way.
function buyCost({ usdIn, outRaw, decimals, multiplier, usdPrice, underlyingPrice }) {
  const tokens = uiAmount(outRaw, decimals, multiplier);
  const effective = usdIn / tokens;
  const reference = underlyingPrice || usdPrice;
  return {
    tokens_out: round(tokens, 9),
    effective_price_usd: round(effective, 6),
    reference: underlyingPrice ? "underlying" : "token",
    est_cost_usd: round(usdIn - tokens * reference, 4),
    est_cost_pct: round((effective / reference - 1) * 100),
    impact_pct: usdPrice ? round((effective / usdPrice - 1) * 100) : null,
  };
}

// Loss when selling versus the token's own market price.
function exitImpact({ inRaw, decimals, multiplier, usdPrice, usdOut }) {
  const tokens = uiAmount(inRaw, decimals, multiplier);
  return {
    tokens_in: round(tokens, 9),
    usd_out: round(usdOut, 4),
    exit_impact_pct: round((1 - usdOut / (tokens * usdPrice)) * 100),
  };
}

// Atomic token amount worth `usd`, from the price of one raw (unmultiplied) token.
function rawForUsd(usd, rawTokenPrice, decimals) {
  const raw = Math.floor((usd / rawTokenPrice) * 10 ** decimals);
  return raw > 0 ? BigInt(raw).toString() : null;
}

module.exports = { round, uiAmount, buyCost, exitImpact, rawForUsd };
