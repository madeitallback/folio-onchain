// Version ranking. Every tunable lives here.
//   score = est_cost_pct + EXIT_WEIGHT * exit_impact_10k_pct + protection penalty
// Lower is better. The protection penalty is our own judgment of each issuer,
// not fetched data.

const EXIT_WEIGHT = 0.25;
const EXIT_NO_ROUTE_PCT = 10; // treated as a 10% exit loss when a $10k sell has no route
const PROTECTION_PENALTY = {
  strongest: 0,
  protected_with_caveat: 0.05,
  strong_unconfirmed_access: 0.1,
  weak: 0.5, // only ranked when explicitly asked for
};
const PROTECTION_LABEL = {
  strongest: "strongest issuer protection",
  protected_with_caveat: "protected, with a caveat on what backs it",
  strong_unconfirmed_access: "strong protection, but self-custody access is unconfirmed",
  weak: "weak protection",
};

const pct = (x) => Math.abs(x).toFixed(2) + "%";

// Exit impact is measured against the token's own mid price, which is stale for
// RFQ tokens, so a sale can look like a gain. Liquidity can't help you; floor it at 0.
function score({ est_cost_pct, exit_impact_10k_pct, protection_level }) {
  const exit = Math.max(0, exit_impact_10k_pct ?? EXIT_NO_ROUTE_PCT);
  return est_cost_pct + EXIT_WEIGHT * exit + (PROTECTION_PENALTY[protection_level] ?? 0.1);
}

function why(v, rank, { size_usd, ticker }) {
  const parts = [];
  if (rank === 1) parts.push("Best overall for this size.");
  const vs = v.reference === "underlying" ? `the ${ticker} stock price` : "its market price";
  const size = "$" + size_usd.toLocaleString("en-US");
  parts.push(
    v.est_cost_pct <= 0
      ? `A ${size} buy comes in ${pct(v.est_cost_pct)} under ${vs}.`
      : `A ${size} buy costs ${pct(v.est_cost_pct)} over ${vs}.`,
  );
  const exit = v.exit_impact_10k_pct;
  parts.push(
    exit === null
      ? "Selling $10k later has no route right now."
      : exit <= 0
        ? `Selling $10k later loses nothing to thin liquidity.`
        : `Selling $10k later loses about ${pct(exit)} to thin liquidity.`,
  );
  parts.push(`${v.issuer_name}: ${PROTECTION_LABEL[v.protection_level] || "protection unrated"}.`);
  return parts.join(" ");
}

// candidates: objects with est_cost_pct, exit_impact_10k_pct, protection_level, issuer_name.
function rank(candidates, context) {
  return candidates
    .map((v) => ({ ...v, score: Math.round(score(v) * 10000) / 10000 }))
    .sort(
      (a, b) =>
        a.score - b.score ||
        Math.max(0, a.exit_impact_10k_pct ?? EXIT_NO_ROUTE_PCT) -
          Math.max(0, b.exit_impact_10k_pct ?? EXIT_NO_ROUTE_PCT) ||
        (PROTECTION_PENALTY[a.protection_level] ?? 1) - (PROTECTION_PENALTY[b.protection_level] ?? 1),
    )
    .map((v, i) => ({ ...v, rank: i + 1, why: why(v, i + 1, context) }));
}

const describe = () => ({
  formula:
    "score = est_cost_pct + 0.25 * max(0, exit_impact_10k_pct) + protection_penalty (lower is better)",
  exit_weight: EXIT_WEIGHT,
  exit_no_route_pct: EXIT_NO_ROUTE_PCT,
  protection_penalty: PROTECTION_PENALTY,
  est_cost_reference:
    "Underlying stock price when Jupiter provides it, otherwise the token's own price. Off-hours the stock price is the last close.",
});

module.exports = { rank, score, describe, EXIT_WEIGHT, PROTECTION_PENALTY };
