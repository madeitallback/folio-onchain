const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createCache } = require("../src/cache.cjs");
const { fileStore, redisStore, encode, decode } = require("../src/store.cjs");
const http = require("../src/http.cjs");

const quiet = { warn() {} };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "agg-cache-test-"));
const later = () => new Promise((r) => setImmediate(r));

test("a cold start answers from the store without calling upstream", async () => {
  const dir = tmp();
  const first = createCache({ store: fileStore(dir), log: quiet });
  let calls = 0;
  const load = async () => ({ n: ++calls });
  assert.deepEqual(await first.get("k", 60000, load, { persist: { staleMs: 3600000 } }), { n: 1 });

  const restarted = createCache({ store: fileStore(dir), log: quiet });
  assert.deepEqual(await restarted.get("k", 60000, load, { persist: { staleMs: 3600000 } }), { n: 1 });
  assert.equal(calls, 1);
});

test("a stale value answers immediately while one refresh runs", async () => {
  const dir = tmp();
  let calls = 0;
  const load = async () => ({ n: ++calls });
  const opts = { persist: { staleMs: 3600000 } };
  await createCache({ store: fileStore(dir), log: quiet }).get("k", 1, load, opts);
  await new Promise((r) => setTimeout(r, 5)); // now older than its 1ms ttl

  const c = createCache({ store: fileStore(dir), log: quiet });
  const [a, b] = await Promise.all([c.get("k", 1, load, opts), c.get("k", 1, load, opts)]);
  assert.deepEqual(a, { n: 1 }); // stale answer, no waiting
  assert.deepEqual(b, { n: 1 });
  await later();
  await later();
  assert.equal(calls, 2); // exactly one background refresh
});

test("a failed refresh keeps serving the last good value", async () => {
  const c = createCache({ store: fileStore(tmp()), log: quiet });
  const opts = { persist: { staleMs: 3600000 } };
  await c.get("k", 1, async () => "good", opts);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await c.get("k", 1, async () => { throw new Error("down"); }, opts), "good");
  await later();
  assert.equal(await c.get("k", 1, async () => { throw new Error("down"); }, opts), "good");
});

test("dehydrate/revive round-trip Maps through the store", async () => {
  const dir = tmp();
  const opts = {
    persist: {
      staleMs: 3600000,
      dehydrate: (v) => ({ m: [...v.m] }),
      revive: (p) => ({ m: new Map(p.m) }),
    },
  };
  await createCache({ store: fileStore(dir), log: quiet }).get("k", 60000, async () => ({ m: new Map([["a", 1]]) }), opts);
  const v = await createCache({ store: fileStore(dir), log: quiet }).get("k", 60000, async () => null, opts);
  assert.equal(v.m.get("a"), 1);
});

test("expired store entries are ignored", async () => {
  const s = fileStore(tmp());
  await s.write("k", { value: 1, savedAt: Date.now() }, 0);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await s.read("k"), null);
});

test("keys without persist stay in memory only", async () => {
  const dir = tmp();
  await createCache({ store: fileStore(dir), log: quiet }).get("q", 60000, async () => 1);
  assert.deepEqual(fs.existsSync(dir) ? fs.readdirSync(dir) : [], []);
});

test("Redis store speaks the Upstash REST protocol", async () => {
  const db = new Map();
  const sent = [];
  http.setFetch(async (url, opts) => {
    const cmd = JSON.parse(opts.body);
    sent.push({ url, auth: opts.headers.Authorization, cmd: cmd[0] });
    let result = null;
    if (cmd[0] === "GET") result = db.get(cmd[1]) ?? null;
    if (cmd[0] === "SET") {
      if (cmd.includes("NX") && db.has(cmd[1])) result = null;
      else {
        db.set(cmd[1], cmd[2]);
        result = "OK";
      }
    }
    if (cmd[0] === "DEL") result = db.delete(cmd[1]) ? 1 : 0;
    return { ok: true, status: 200, json: async () => ({ result }) };
  });
  try {
    const r = redisStore("https://example.upstash.io", "secret");
    await r.write("k", { value: { a: 1 }, savedAt: 5 }, 60);
    assert.deepEqual(await r.read("k"), { value: { a: 1 }, savedAt: 5 });
    assert.equal(await r.lock("k", 10), true);
    assert.equal(await r.lock("k", 10), false); // second instance can't refresh
    await r.unlock("k");
    assert.equal(await r.lock("k", 10), true);
    assert.equal(sent[0].auth, "Bearer secret");
    assert.equal(sent[0].url, "https://example.upstash.io");
  } finally {
    http.setFetch(null);
  }
});

test("encoding is gzip and round-trips", () => {
  const big = { tokens: Array.from({ length: 2000 }, (_, i) => ({ mint: "Xs" + i, name: "Token " + i })) };
  const text = encode(big);
  assert.ok(text.length < JSON.stringify(big).length / 3);
  assert.deepEqual(decode(text), big);
});
