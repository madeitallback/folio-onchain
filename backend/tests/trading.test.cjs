const test = require("node:test"),
  assert = require("node:assert/strict");
const { atomic, browse } = require("../trading.cjs");
const { aggregate, receipt, USDC } = require("../wallet.cjs");
const { cached, limit } = require("../infrastructure.cjs");
test("amount conversion never rounds atomic units or accepts scientific notation", () => {
  assert.equal(atomic("10.000001", 6), "10000001");
  assert.equal(atomic("9007199254.740993", 6), "9007199254740993");
  for (const value of ["1e3", "-1", "0", "1.0000001", "NaN"])
    assert.throws(() => atomic(value, 6));
});
const token = (ticker, extra = {}) => ({
  id: ticker,
  ticker,
  name: ticker,
  kind: "Stock",
  issuerId: "xstocks",
  address: "mint" + ticker,
  verified: true,
  ...extra,
});
test("buyable catalog excludes unconfirmed, halted and unroutable tokens; keeps cursor", async () => {
  const c = {
    tokens: [
      token("A", { verified: false }),
      token("B", { halted: true }),
      token("C"),
      token("D"),
      token("E"),
    ],
  };
  const seen = [];
  const q = async (t) => {
    seen.push(t.id);
    return {
      status: t.ticker === "C" ? "no-route" : "quoted",
      asOf: "2026-01-01",
    };
  };
  const r = await browse(
    c,
    new URLSearchParams({ limit: "1", sort: "name" }),
    q,
  );
  assert.deepEqual(seen, ["C", "D"]);
  assert.equal(r.groups[0].ticker, "D");
  assert.equal(r.nextCursor, 2);
  assert.equal(r.groups[0].routeCheckedAt, "2026-01-01");
});
test("quote outage never turns into a false no-liquidity result or skips affected asset", async () => {
  const r = await browse(
    { tokens: [token("A")] },
    new URLSearchParams(),
    async () => {
      throw Object.assign(Error("busy"), { status: 429 });
    },
  );
  assert.equal(r.interrupted, true);
  assert.equal(r.nextCursor, 0);
  assert.equal(r.groups.length, 0);
});
test("wallet aggregates exact raw balances separately from scaled display amounts", () => {
  const a = (amount, ui, state = "initialized") => ({
    account: {
      data: {
        parsed: {
          info: {
            mint: "mint",
            state,
            tokenAmount: { amount, decimals: 6, uiAmountString: ui },
          },
        },
      },
    },
  });
  const [h] = aggregate([
    a("9007199254740993", "9999"),
    a("1", "0.1", "frozen"),
  ]);
  assert.equal(h.raw, "9007199254740994");
  assert.equal(h.display, 9999.1);
  assert.equal(h.frozen, true);
});
test("confirmed receipt excludes other owners and rejects unrelated wallet", () => {
  const b = (owner, mint, amount) => ({
    owner,
    mint,
    uiTokenAmount: { amount, decimals: 6 },
  });
  const tx = {
    transaction: {
      message: { accountKeys: [{ pubkey: "owner", signer: true }] },
    },
    meta: {
      fee: 5000,
      preTokenBalances: [
        b("owner", USDC, "10000000"),
        b("other", "stock", "5000000"),
      ],
      postTokenBalances: [
        b("owner", USDC, "0"),
        b("owner", "stock", "500000"),
        b("other", "stock", "5000000"),
      ],
    },
    blockTime: 1,
  };
  const r = receipt(tx, "owner");
  assert.deepEqual(
    r.changes.map((x) => x.raw),
    ["-10000000", "500000"],
  );
  assert.throws(() => receipt(tx, "other"));
});
test("concurrent data reads share one request and rejected reads do not poison cache", async () => {
  let calls = 0;
  const fn = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 10));
    return 7;
  };
  assert.deepEqual(
    await Promise.all([
      cached("test-dedupe", 100, fn),
      cached("test-dedupe", 100, fn),
    ]),
    [7, 7],
  );
  assert.equal(calls, 1);
  await assert.rejects(
    cached("test-reject", 100, async () => {
      throw Error("down");
    }),
  );
  assert.equal(await cached("test-reject", 100, async () => 9), 9);
});
test("rate limiter rejects excess requests", () => {
  limit("test-rate", 1);
  assert.throws(
    () => limit("test-rate", 1),
    (e) => e.status === 429,
  );
});

test("RPC status remains pending until a receipt is available and checks expected asset", async () => {
  const { transaction } = require("../wallet.cjs");
  const oldFetch = global.fetch;
  const address = "11111111111111111111111111111111";
  try {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({ result: { value: [null] } }),
    });
    assert.equal(
      (await transaction(address, "1".repeat(64), "stock")).status,
      "pending",
    );
    global.fetch = async (url, options) => {
      const { method } = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          result:
            method === "getSignatureStatuses"
              ? {
                  value: [
                    { confirmationStatus: "finalized", err: null, slot: 1 },
                  ],
                }
              : {
                  transaction: {
                    message: {
                      accountKeys: [{ pubkey: address, signer: true }],
                    },
                  },
                  meta: {
                    err: null,
                    fee: 5000,
                    preTokenBalances: [],
                    postTokenBalances: [
                      {
                        owner: address,
                        mint: "stock",
                        uiTokenAmount: { amount: "10", decimals: 6 },
                      },
                    ],
                  },
                },
        }),
      };
    };
    const result = await transaction(address, "2".repeat(64), "stock");
    assert.equal(result.status, "finalized");
    assert.equal(result.changes[0].raw, "10");
    await assert.rejects(
      transaction(address, "3".repeat(64), "different-stock"),
      (e) => e.status === 409,
    );
  } finally {
    global.fetch = oldFetch;
  }
});
