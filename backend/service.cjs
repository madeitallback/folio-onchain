const { catalog } = require("./catalog.cjs");
const data = require("./market-data.cjs");
const { balance } = require("./wallet.cjs");
async function handle(path, query) {
  if (path === "catalog") return catalog();
  if (path === "balance") return balance(query.get("address"));
  if (!["market", "history", "quote"].includes(path)) {
    const e = Error("Not found");
    e.status = 404;
    throw e;
  }
  const c = await catalog(),
    t = c.tokens.find((t) => t.id === query.get("id"));
  if (!t?.verified || !t.address) {
    const e = Error(
      "This token address is not confirmed. Trading is unavailable.",
    );
    e.status = 400;
    throw e;
  }
  if (path === "quote") {
    const amount = Number(query.get("amount"));
    if (!Number.isFinite(amount) || amount < 1 || amount > 1000000) {
      const e = Error("Enter 1–1,000,000 USDC.");
      e.status = 400;
      throw e;
    }
    return data.quote(t, amount);
  }
  return data[path](t);
}
module.exports = { handle };
