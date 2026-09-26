const memo = new Map();
const buckets = new Map();
function fault(message, status = 503) {
  return Object.assign(new Error(message), { status });
}
async function cached(key, ttl, fn) {
  const old = memo.get(key);
  if (old?.pending) return old.pending;
  if (old && Date.now() - old.time < ttl) return old.value;
  if (memo.size > 2500) {
    for (const [k, v] of memo) {
      if (!v.pending) {
        memo.delete(k);
        if (memo.size < 2000) break;
      }
    }
  }
  const pending = Promise.resolve()
    .then(fn)
    .then((value) => {
      memo.set(key, { time: Date.now(), value });
      return value;
    })
    .catch((e) => {
      memo.delete(key);
      throw e;
    });
  memo.set(key, { pending });
  return pending;
}
async function request(url, { acceptStatuses = [], ...options } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(10000),
      });
      if ((r.status === 429 || r.status >= 500) && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      if (!r.ok && !acceptStatuses.includes(r.status))
        throw fault(
          r.status === 429
            ? "Provider is busy. Please retry shortly."
            : "Provider unavailable. Please retry shortly.",
          r.status === 429 ? 429 : 503,
        );
      return r;
    } catch (e) {
      if (attempt === 1 || e.status)
        throw e.status
          ? e
          : fault("Provider connection timed out. Please retry shortly.");
    }
  }
}
function limit(key, count = 100, period = 60000) {
  const now = Date.now();
  if (buckets.size > 10000) {
    for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
    if (buckets.size > 10000) throw fault("Service busy. Retry shortly.", 429);
  }
  let b = buckets.get(key);
  if (!b || now >= b.reset) {
    b = { used: 0, reset: now + period };
    buckets.set(key, b);
  }
  if (++b.used > count)
    throw fault("Too many requests. Please wait a minute.", 429);
}
let queue = Promise.resolve(),
  waiting = 0;
function quoteSlot(fn) {
  if (waiting >= 16) throw fault("Quote service busy. Retry shortly.", 429);
  waiting++;
  const job = queue.then(async () => {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      await new Promise((r) =>
        setTimeout(
          r,
          Math.max(
            0,
            (process.env.JUPITER_API_KEY ? 250 : 1100) - (Date.now() - start),
          ),
        ),
      );
    }
  });
  queue = job
    .catch(() => {})
    .finally(() => {
      waiting--;
    });
  return job;
}
module.exports = { cached, request, fault, limit, quoteSlot };
