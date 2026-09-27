// Research snapshot. Used for issuer profiles, names, types and dividend facts.
// Never used for addresses, prices or volumes.
const seed = require("../../docs/solana-stock-tokens.json");

const key = (issuerId, ticker) => issuerId + ":" + String(ticker).toUpperCase();
const byIssuerTicker = new Map(
  seed.tokens.map((t) => [key(t.issuer_id, t.underlying_ticker), t]),
);

module.exports = {
  snapshotDate: seed.snapshot_date,
  enums: seed.enums,
  issuers: seed.issuers,
  tokens: seed.tokens,
  find: (issuerId, ticker) => byIssuerTicker.get(key(issuerId, ticker)) || null,
};
