class Fault extends Error {
  constructor(message, status = 503, code = "upstream_unavailable") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fault = (message, status, code) => new Fault(message, status, code);

let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let fetchImpl =(...args) => globalThis.fetch(...args);
// Tests swap in a fake upstream and skip real waiting.
function setFetch(fn, { noWait = false } = {}) {
  fetchImpl = fn || ((...args) => globalThis.fetch(...args));
  sleep = noWait ? async () => {} : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(
  url,
  { method = "GET", headers = {}, body, timeoutMs = 12000, retries = 1, okStatuses = [], busyRetries = 0 } = {},
) {
  const host = new URL(url).host;
  for (let attempt = 0, busy = 0; ; attempt++) {
    let res;
    try {
      res = await fetchImpl(url, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      if (attempt < retries) continue;
      throw fault(`${host} is unreachable.`, 503, "upstream_unavailable");
    }
    if (res.ok || okStatuses.includes(res.status)) return res;
    if (res.status === 429) {
      if (busy < busyRetries) {
        await sleep(1000 * ++busy);
        attempt--;
        continue;
      }
      throw fault(`${host} rate limit reached. Retry shortly.`, 503, "upstream_busy");
    }
    if (res.status >= 500 && attempt < retries) continue;
    throw fault(`${host} returned ${res.status}.`, 502, "upstream_error");
  }
}

async function json(url, options) {
  const res = await request(url, options);
  try {
    return await res.json();
  } catch {
    throw fault(`${new URL(url).host} returned invalid JSON.`, 502, "upstream_error");
  }
}

// Runs at most `size` tasks at once; the rest wait in order.
function limiter(size) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= size || !queue.length) return;
    active++;
    const { task, resolve, reject } = queue.shift();
    task()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      next();
    });
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const wait = (ms) => sleep(ms);

module.exports = { Fault, fault, request, json, limiter, chunk, setFetch, wait };
