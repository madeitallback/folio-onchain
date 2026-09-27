const config = require("../config.cjs");
const { request, fault, chunk } = require("../http.cjs");

const PROGRAMS = {
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: "spl-token",
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: "spl-token-2022",
};

const isAddress = (s) =>
  typeof s === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

async function rpc(method, params) {
  let lastError;
  for (const url of config.rpcUrls) {
    try {
      const res = await request(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const d = await res.json();
      if (d.error || d.result === undefined) throw fault("Solana RPC error.", 502, "upstream_error");
      return d.result;
    } catch (error) {
      lastError = error;
    }
  }
  throw fault("Solana data is unavailable. Retry shortly.", 503, lastError?.code || "upstream_unavailable");
}

// The multiplier the chain applies right now (a scheduled one takes over at its timestamp).
function effectiveMultiplier(state, now = Date.now()) {
  if (!state) return 1;
  const at = Number(state.newMultiplierEffectiveTimestamp) * 1000;
  const value = Number(at && at <= now ? state.newMultiplier : state.multiplier);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function parseMint(account, now = Date.now()) {
  if (!account) return { exists: false, is_mint: false, reason: "No account exists at this address." };
  const program = PROGRAMS[account.owner];
  const parsed = account.data?.parsed;
  if (!program || parsed?.type !== "mint")
    return { exists: true, is_mint: false, reason: "This address is not a token mint." };
  const info = parsed.info;
  const ext = Object.fromEntries(
    (info.extensions || []).map((e) => [e.extension, e.state || {}]),
  );
  const fee = ext.transferFeeConfig;
  const transferFeeBps = fee
    ? Math.max(
        Number(fee.olderTransferFee?.transferFeeBasisPoints || 0),
        Number(fee.newerTransferFee?.transferFeeBasisPoints || 0),
      )
    : 0;
  const hookProgram = ext.transferHook?.programId || null;
  const meta = ext.tokenMetadata;
  return {
    exists: true,
    is_mint: true,
    token_program: program,
    decimals: info.decimals,
    supply_raw: info.supply,
    mint_authority: info.mintAuthority || null,
    freeze_authority: info.freezeAuthority || null,
    multiplier: effectiveMultiplier(ext.scaledUiAmountConfig, now),
    scaled_ui: ext.scaledUiAmountConfig
      ? {
          multiplier: ext.scaledUiAmountConfig.multiplier,
          newMultiplier: ext.scaledUiAmountConfig.newMultiplier,
          newMultiplierEffectiveTimestamp: ext.scaledUiAmountConfig.newMultiplierEffectiveTimestamp,
        }
      : null,
    extensions: {
      names: Object.keys(ext),
      scaled_ui_amount: !!ext.scaledUiAmountConfig,
      transfer_fee_bps: transferFeeBps,
      transfer_hook_program: hookProgram,
      pausable: !!ext.pausableConfig,
      paused: !!ext.pausableConfig?.paused,
      permanent_delegate: ext.permanentDelegate?.delegate || null,
    },
    metadata: meta ? { name: meta.name, symbol: meta.symbol, uri: meta.uri } : null,
    // Jupiter recurring orders reject transfer-fee and transfer-hook tokens.
    dca_compatible: transferFeeBps === 0 && !hookProgram,
  };
}

// Returns Map<mint, parsed mint>. One RPC call per 100 addresses.
async function readMints(mints) {
  const out = new Map();
  for (const group of chunk([...new Set(mints)], 100)) {
    const result = await rpc("getMultipleAccounts", [
      group,
      { encoding: "jsonParsed", commitment: "confirmed" },
    ]);
    group.forEach((mint, i) => out.set(mint, parseMint(result.value?.[i])));
  }
  return out;
}

// Multiplier for a parsed mint at the current time.
const multiplierNow = (onchain, now = Date.now()) =>
  onchain?.scaled_ui ? effectiveMultiplier(onchain.scaled_ui, now) : 1;

module.exports = { isAddress, rpc, readMints, parseMint, effectiveMultiplier, multiplierNow };
