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
export async function openSwap(token, amount, onSuccess) {
  if (
    !token.verified ||
    token.halted ||
    token.chain !== "solana" ||
    !Number.isFinite(amount) ||
    amount < 1 ||
    amount > 1000000
  )
    throw Error("Select a confirmed Solana token and a valid amount.");
  await load();
  window.Jupiter.init({
    displayMode: "modal",
    autoConnect: false,
    branding: { name: "Folio" },
    formProps: {
      swapMode: "ExactIn",
      initialAmount: String(Math.round(amount * 1e6)),
      initialInputMint: USDC,
      initialOutputMint: token.address,
      fixedMint: token.address,
      fixedAmount: true,
    },
    onSuccess,
  });
}
