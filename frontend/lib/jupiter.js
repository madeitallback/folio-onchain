let loading;
export const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
async function load() {
  if (window.Jupiter?.init) return;
  if (!loading)
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://plugin.jup.ag/plugin-v1.js";
      script.async = true;
      const fail = () => {
        clearTimeout(timer);
        script.remove();
        loading = null;
        reject(Error("Jupiter could not load. Try the external link."));
      };
      const timer = setTimeout(fail, 25000);
      script.onerror = fail;
      script.onload = () => {
        if (!window.Jupiter?.init) return fail();
        clearTimeout(timer);
        resolve();
      };
      document.head.append(script);
    });
  return loading;
}
function signatureOf(tx) {
  const bytes = tx.signatures?.[0]?.signature || tx.signatures?.[0];
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length !== 64 ||
    !bytes.some((b) => b !== 0)
  )
    return null;
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n,
    result = "";
  for (const byte of bytes) n = n * 256n + BigInt(byte);
  while (n > 0n) {
    result = alphabet[Number(n % 58n)] + result;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    result = "1" + result;
  }
  return result;
}
export async function openSwap(
  token,
  amount,
  { provider, wallet, side = "buy", raw, onEvent, onConnect } = {},
) {
  if (!token.verified || token.halted || token.chain !== "solana")
    throw Error("Select an available Solana token.");
  if (
    !provider?.publicKey ||
    provider.publicKey.toString() !== wallet ||
    !provider.signTransaction
  )
    throw Error("Connect your Solana wallet before trading.");
  if (
    side === "buy" &&
    (!Number.isFinite(amount) || amount < 1 || amount > 1000000)
  )
    throw Error("Enter a valid USDC amount.");
  if (side === "sell" && !/^[1-9]\d*$/.test(String(raw)))
    throw Error("Choose a valid token amount.");
  await load();
  const attempt = {
    id: crypto.randomUUID(),
    wallet,
    tokenId: token.id,
    ticker: token.ticker,
    side,
    createdAt: new Date().toISOString(),
  };
  let current = attempt,
    signature = null;
  const emit = (data) => {
    current = { ...current, ...data };
    onEvent?.(current);
  };
  const checkWallet = () => {
    if (provider.publicKey?.toString() !== wallet)
      throw Error("Wallet changed. Reopen the trade.");
  };
  const sign = async (tx) => {
    if (
      current.status &&
      !["review", "awaiting_wallet"].includes(current.status)
    ) {
      current = {
        ...attempt,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      signature = null;
    }
    checkWallet();
    emit({ status: "awaiting_wallet" });
    try {
      const signed = await provider.signTransaction(tx);
      checkWallet();
      signature = signatureOf(signed);
      emit({ status: "signed", signature });
      return signed;
    } catch (e) {
      emit({
        status: "cancelled",
        message:
          "Wallet signing was cancelled or failed. No submission confirmed.",
      });
      throw e;
    }
  };
  const context = {
    publicKey: provider.publicKey,
    connected: true,
    connecting: false,
    disconnecting: false,
    autoConnect: false,
    wallets: [],
    wallet: { adapter: provider, readyState: "Installed" },
    select: () => {},
    connect: async () => checkWallet(),
    disconnect: async () => {
      window.Jupiter.close();
      await provider.disconnect();
    },
    signTransaction: sign,
    signAllTransactions: async (txs) => {
      const signed = [];
      for (const tx of txs) signed.push(await sign(tx));
      return signed;
    },
    sendTransaction: async (tx, connection, options) => {
      const signed = await sign(tx);
      const txid = await connection.sendRawTransaction(
        signed.serialize(),
        options,
      );
      signature = txid;
      emit({ status: "pending", signature: txid });
      return txid;
    },
  };
  context.wallet.adapter = {
    name: provider.isPhantom
      ? "Phantom"
      : provider.isSolflare
        ? "Solflare"
        : "Connected wallet",
    icon: "/icon.svg",
    publicKey: provider.publicKey,
    connected: true,
    connecting: false,
    supportedTransactionVersions: new Set(["legacy", 0]),
    signTransaction: sign,
    signAllTransactions: context.signAllTransactions,
    sendTransaction: context.sendTransaction,
    connect: context.connect,
    disconnect: context.disconnect,
    on: provider.on?.bind(provider),
    off: provider.off?.bind(provider),
  };
  if (provider.signMessage)
    context.signMessage = provider.signMessage.bind(provider);
  window.Jupiter.init({
    displayMode: "modal",
    autoConnect: false,
    enableWalletPassthrough: true,
    passthroughWalletContextState: context,
    onRequestConnectWallet: () => {
      window.Jupiter.close();
      onConnect?.();
    },
    branding: { name: "Folio" },
    formProps: {
      swapMode: "ExactIn",
      initialAmount:
        side === "sell" ? String(raw) : String(Math.round(amount * 1e6)),
      initialInputMint: side === "sell" ? token.address : USDC,
      initialOutputMint: side === "sell" ? USDC : token.address,
      fixedMint: token.address,
      fixedAmount: true,
    },
    onSuccess: ({ txid }) => {
      signature = txid;
      emit({
        status: "pending",
        signature: txid,
        message: "Checking on-chain confirmation…",
      });
    },
    onSwapError: () => {
      if (current.status === "cancelled" && !signature) return;
      emit({
        status: signature ? "pending" : "unresolved",
        signature,
        message: signature
          ? "Jupiter reported an issue. Checking the chain before marking a failure."
          : "Swap could not be confirmed. Check wallet activity before retrying.",
      });
    },
  });
}
