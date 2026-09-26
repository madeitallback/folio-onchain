const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
test("Jupiter reuses the selected wallet, tracks signatures and never confirms from callback alone", async () => {
  const source = fs.readFileSync(
    require("node:path").join(__dirname, "../../frontend/lib/jupiter.js"),
    "utf8",
  );
  const { openSwap } = await import(
    "data:text/javascript;base64," + Buffer.from(source).toString("base64")
  );
  let config,
    signCalls = 0;
  global.window = {
    Jupiter: {
      init: (c) => {
        config = c;
      },
      close: () => {},
    },
  };
  const provider = {
    publicKey: { toString: () => "test-wallet" },
    signTransaction: async (tx) => {
      signCalls++;
      return tx;
    },
  };
  const token = {
    id: "token",
    ticker: "TEST",
    address: "mint",
    chain: "solana",
    verified: true,
  };
  const events = [];
  await openSwap(token, 10, {
    provider,
    wallet: "test-wallet",
    onEvent: (e) => events.push(e),
  });
  assert.equal(config.enableWalletPassthrough, true);
  assert.equal(
    config.passthroughWalletContextState.publicKey,
    provider.publicKey,
  );
  assert.equal(config.formProps.initialAmount, "10000000");
  assert.equal(signCalls, 0);
  assert.equal(
    config.passthroughWalletContextState.wallet.adapter.signTransaction,
    config.passthroughWalletContextState.signTransaction,
  );
  await config.passthroughWalletContextState.signTransaction({
    signatures: [new Uint8Array(64).fill(1)],
  });
  assert.equal(signCalls, 1);
  assert.deepEqual(
    events.map((e) => e.status),
    ["awaiting_wallet", "signed"],
  );
  assert.ok(events[1].signature);
  config.onSuccess({ txid: events[1].signature });
  assert.equal(events.at(-1).status, "pending");
  await openSwap(token, 0, {
    provider,
    wallet: "test-wallet",
    side: "sell",
    raw: "9007199254740993",
  });
  assert.equal(config.formProps.initialInputMint, "mint");
  assert.equal(
    config.formProps.initialOutputMint,
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  );
  assert.equal(config.formProps.initialAmount, "9007199254740993");
  await assert.rejects(
    openSwap(token, 10, { provider, wallet: "wrong-wallet" }),
  );
  assert.equal(signCalls, 1);
  delete global.window;
});
