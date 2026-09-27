// In-memory TTL cache with in-flight dedupe. On a failed refresh it serves the
// last good value instead of erroring.
function createCache({ max = 5000 } = {}) {
  const store = new Map();
  const inflight = new Map();

  function get(key, ttlMs, load) {
    const hit = store.get(key);
    if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value);
    if (inflight.has(key)) return inflight.get(key);
    const promise = (async () => {
      try {
        const value = await load();
        store.delete(key);
        store.set(key, { value, expires: Date.now() + ttlMs });
        while (store.size > max) store.delete(store.keys().next().value);
        return value;
      } catch (error) {
        if (hit) return hit.value;
        throw error;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, promise);
    return promise;
  }

  function clear() {
    store.clear();
    inflight.clear();
  }

  return { get, clear };
}

module.exports = { cache: createCache(), createCache };
