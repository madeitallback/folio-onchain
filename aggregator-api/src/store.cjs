// Persistent cache store shared across restarts (and, with Redis, across
// server instances). Values are gzipped JSON: { value, savedAt }.
//   Redis: Upstash REST API (UPSTASH_REDIS_REST_URL/_TOKEN, or Vercel KV's
//          KV_REST_API_URL/_TOKEN). Plain HTTPS, no client library.
//   File:  one file per key under AGGREGATOR_CACHE_DIR (default: OS temp dir).
//   Off:   AGGREGATOR_CACHE=off (tests).
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const zlib = require("node:zlib");
const { request } = require("./http.cjs");

const encode = (entry) => zlib.gzipSync(JSON.stringify(entry)).toString("base64");
const decode = (text) => JSON.parse(zlib.gunzipSync(Buffer.from(text, "base64")).toString("utf8"));

function redisStore(url, token) {
  async function call(command) {
    const res = await request(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      retries: 0,
      timeoutMs: 5000,
    });
    const d = await res.json();
    if (d.error) throw new Error("Redis: " + d.error);
    return d.result;
  }
  return {
    kind: "redis",
    async read(key) {
      const text = await call(["GET", key]);
      return text ? decode(text) : null;
    },
    async write(key, entry, ttlSeconds) {
      await call(["SET", key, encode(entry), "EX", String(Math.ceil(ttlSeconds))]);
    },
    // Only one instance refreshes a key at a time.
    async lock(key, ttlSeconds) {
      return (await call(["SET", key + ":lock", "1", "NX", "EX", String(ttlSeconds)])) === "OK";
    },
    async unlock(key) {
      await call(["DEL", key + ":lock"]);
    },
  };
}

function fileStore(dir) {
  const file = (key) => path.join(dir, key.replace(/[^a-z0-9_.-]/gi, "_") + ".json.gz.b64");
  const held = new Set();
  return {
    kind: "file",
    async read(key) {
      try {
        const entry = decode(await fs.readFile(file(key), "utf8"));
        return entry.expiresAt > Date.now() ? entry : null;
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async write(key, entry, ttlSeconds) {
      await fs.mkdir(dir, { recursive: true });
      const target = file(key);
      const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, encode({ ...entry, expiresAt: Date.now() + ttlSeconds * 1000 }));
      await fs.rename(tmp, target);
    },
    async lock(key) {
      if (held.has(key)) return false;
      held.add(key);
      return true;
    },
    async unlock(key) {
      held.delete(key);
    },
  };
}

function createStore(env = process.env) {
  if (env.AGGREGATOR_CACHE === "off") return null;
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url && token) return redisStore(url.replace(/\/+$/, ""), token);
  return fileStore(env.AGGREGATOR_CACHE_DIR || path.join(os.tmpdir(), "folio-aggregator-cache"));
}

module.exports = { createStore, redisStore, fileStore, encode, decode };
