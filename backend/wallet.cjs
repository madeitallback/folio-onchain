const { validAddress } = require("./market-data.cjs");
const { cached, request, fault } = require("./infrastructure.cjs");
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const programs = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
];
function addressCheck(address) {
  if (!validAddress("solana", address))
    throw fault("Invalid Solana wallet address.", 400);
}
async function rpc(method, params) {
  const endpoints = [
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
    process.env.SOLANA_RPC_FALLBACK_URL,
  ].filter(Boolean);
  for (let i = 0; i < endpoints.length; i++) {
    try {
      const r = await request(endpoints[i], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const d = await r.json();
      if (d.error || d.result === undefined)
        throw fault("Solana data unavailable. Please retry.");
      return d.result;
    } catch (e) {
      if (i === endpoints.length - 1)
        throw fault(
          "Solana data unavailable. Your funds remain in your wallet.",
        );
    }
  }
}
function sumUSDC(accounts) {
  return accounts.reduce((sum, a) => {
    const info = a?.account?.data?.parsed?.info;
    return info?.mint === USDC && info.tokenAmount?.decimals === 6
      ? sum + BigInt(info.tokenAmount.amount)
      : sum;
  }, 0n);
}
function aggregate(accounts) {
  const map = new Map();
  for (const a of accounts) {
    const i = a?.account?.data?.parsed?.info,
      amt = i?.tokenAmount;
    if (
      !i?.mint ||
      !amt ||
      !/^\d+$/.test(amt.amount) ||
      BigInt(amt.amount) === 0n
    )
      continue;
    const old = map.get(i.mint) || {
      mint: i.mint,
      raw: "0",
      decimals: amt.decimals,
      display: 0,
      frozen: false,
    };
    old.raw = (BigInt(old.raw) + BigInt(amt.amount)).toString();
    old.display += Number(
      amt.uiAmountString ?? Number(amt.amount) / 10 ** amt.decimals,
    );
    old.frozen ||= i.state === "frozen";
    map.set(i.mint, old);
  }
  return [...map.values()];
}
async function holdings(address, c) {
  addressCheck(address);
  const data = await cached("holdings:" + address, 8000, async () => {
    const [sol, ...responses] = await Promise.all([
      rpc("getBalance", [address, { commitment: "confirmed" }]),
      ...programs.map((programId) =>
        rpc("getTokenAccountsByOwner", [
          address,
          { programId },
          { encoding: "jsonParsed", commitment: "confirmed" },
        ]),
      ),
    ]);
    if (responses.some((r) => !Array.isArray(r?.value)))
      throw fault("Token balances unavailable.");
    return {
      accounts: responses.flatMap((r) => r.value),
      sol: sol.value / 1e9,
      slot: Math.min(sol.context.slot, ...responses.map((r) => r.context.slot)),
      asOf: new Date().toISOString(),
    };
  });
  const all = aggregate(data.accounts),
    known = new Map(
      c.tokens.filter((t) => t.verified).map((t) => [t.address, t]),
    );
  return {
    address,
    network: "solana",
    usdc: Number(sumUSDC(data.accounts)) / 1e6,
    raw: sumUSDC(data.accounts).toString(),
    sol: data.sol,
    slot: data.slot,
    asOf: data.asOf,
    holdings: all
      .filter((h) => known.has(h.mint))
      .map((h) => ({ ...h, token: known.get(h.mint) })),
    notice:
      "Confirmed on-chain balances. Only recognized catalog tokens are listed; other wallet assets are omitted.",
  };
}
async function balance(address) {
  addressCheck(address);
  return cached("balance:" + address, 8000, async () => {
    const d = await rpc("getTokenAccountsByOwner", [
      address,
      { mint: USDC },
      { encoding: "jsonParsed", commitment: "confirmed" },
    ]);
    if (!Array.isArray(d.value)) throw fault("USDC balance unavailable.");
    const raw = sumUSDC(d.value);
    return {
      address,
      usdc: Number(raw) / 1e6,
      raw: raw.toString(),
      asOf: new Date().toISOString(),
      network: "solana",
      slot: d.context.slot,
    };
  });
}
function receipt(result, address) {
  const keys = result.transaction?.message?.accountKeys || [];
  if (
    !keys.some(
      (k) =>
        k.signer && (k.pubkey === address || k.pubkey?.toString() === address),
    )
  )
    throw fault("Transaction does not belong to this wallet.", 400);
  const pre = result.meta?.preTokenBalances || [],
    post = result.meta?.postTokenBalances || [],
    values = new Map();
  for (const [sign, items] of [
    [-1n, pre],
    [1n, post],
  ])
    for (const b of items) {
      if (b.owner !== address) continue;
      const v = values.get(b.mint) || {
        mint: b.mint,
        raw: 0n,
        decimals: b.uiTokenAmount.decimals,
      };
      v.raw += sign * BigInt(b.uiTokenAmount.amount);
      values.set(b.mint, v);
    }
  return {
    changes: [...values.values()]
      .filter((x) => x.raw !== 0n)
      .map((x) => ({ ...x, raw: x.raw.toString() })),
    feeLamports: result.meta?.fee,
    blockTime: result.blockTime,
  };
}
async function transaction(address, signature, expectedMint) {
  addressCheck(address);
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature || ""))
    throw fault("Invalid transaction signature.", 400);
  return cached(
    "tx:" + address + ":" + signature + ":" + (expectedMint || ""),
    4000,
    async () => {
      const statuses = await rpc("getSignatureStatuses", [
          [signature],
          { searchTransactionHistory: true },
        ]),
        s = statuses.value?.[0];
      if (!s)
        return {
          signature,
          status: "pending",
          message: "Not yet found on chain. This does not prove failure.",
        };
      if (!["confirmed", "finalized"].includes(s.confirmationStatus))
        return { signature, status: "pending" };
      const tx = await rpc("getTransaction", [
        signature,
        {
          encoding: "jsonParsed",
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        },
      ]);
      if (!tx)
        return {
          signature,
          status: "pending",
          message: "Waiting for transaction details.",
        };
      const detail = receipt(tx, address);
      if (
        !s.err &&
        !tx.meta?.err &&
        expectedMint &&
        !detail.changes.some((c) => c.mint === expectedMint)
      )
        throw fault(
          "Transaction confirmed, but the expected stock-token change was not found. Check the explorer before retrying.",
          409,
        );
      return {
        signature,
        status: s.err || tx.meta?.err ? "failed" : s.confirmationStatus,
        slot: s.slot,
        ...detail,
      };
    },
  );
}
module.exports = {
  balance,
  holdings,
  transaction,
  receipt,
  aggregate,
  sumUSDC,
  USDC,
  rpc,
};
