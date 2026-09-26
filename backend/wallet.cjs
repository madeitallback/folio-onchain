const { validAddress } = require("./market-data.cjs");
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
function sumUSDC(accounts) {
  return accounts.reduce((sum, a) => {
    const info = a?.account?.data?.parsed?.info;
    if (info?.mint !== USDC || info.tokenAmount?.decimals !== 6) return sum;
    return sum + BigInt(info.tokenAmount.amount);
  }, 0n);
}
async function balance(address) {
  if (!validAddress("solana", address)) {
    const error = Error("Invalid Solana wallet address.");
    error.status = 400;
    throw error;
  }
  const r = await fetch(
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          address,
          { mint: USDC },
          { encoding: "jsonParsed", commitment: "confirmed" },
        ],
      }),
      signal: AbortSignal.timeout(12000),
    },
  );
  const d = await r.json();
  if (!r.ok || d.error || !Array.isArray(d.result?.value))
    throw Error(
      "USDC balance unavailable. Try refreshing; your funds remain in your wallet.",
    );
  const raw = sumUSDC(d.result.value);
  return {
    address,
    usdc: Number(raw) / 1e6,
    raw: raw.toString(),
    asOf: new Date().toISOString(),
    network: "solana",
    slot: d.result.context.slot,
  };
}
module.exports = { balance, sumUSDC, USDC };
