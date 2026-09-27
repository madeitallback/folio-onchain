// Two-level cache. Memory with in-flight dedupe for everything; keys marked
// `persist` are also kept in the shared store (Redis or disk) and served
// stale-while-revalidate: an old value answers immediately while one refresh
// runs in the background. A failed refresh keeps the last good value.
const { createStore } = require("./store.cjs");

function createCache({ max = 5000, store = createStore(), log = console } = {}) {
  const memory = new Map();
  const inflight = new Map();
  const reading = new Map();

  function remember(key, value, freshUntil) {
    memory.delete(key);
    memory.set(key, { value, freshUntil });
    while (memory.size > max) memory.delete(memory.keys().next().value);
  }

  function readStore(key, persist) {
    if (!reading.has(key))
      reading.set(
        key,
        store
          .read(key)
          .then((entry) =>
            entry ? { value: persist.revive ? persist.revive(entry.value) : entry.value, savedAt: entry.savedAt } : null,
          )
          .catch((error) => {
            log.warn?.(`cache: store read failed for ${key}: ${error.message}`);
            return null;
          })
          .finally(() => reading.delete(key)),
      );
    return reading.get(key);
  }

  function refresh(key, ttlMs, load, persist, stale) {
    if (inflight.has(key)) return inflight.get(key);
    const promise = (async () => {
      let locked = false;
      if (persist && store) {
        locked = await store.lock(key, 120).catch(() => true);
        // Another instance is refreshing: keep serving what we have.
        if (!locked && stale) return stale.value;
      }
      try {
        const value = await load();
        const savedAt = Date.now();
        remember(key, value, savedAt + ttlMs);
        if (persist && store)
          await store
            .write(key, { value: persist.dehydrate ? persist.dehydrate(value) : value, savedAt }, persist.staleMs / 1000)
            .catch((error) => log.warn?.(`cache: store write failed for ${key}: ${error.message}`));
        return value;
      } catch (error) {
        if (stale) return stale.value;
        throw error;
      } finally {
        if (locked && store) await store.unlock(key).catch(() => {});
        inflight.delete(key);
      }
    })();
    inflight.set(key, promise);
    return promise;
  }

  function background(key, ttlMs, load, persist, stale) {
    refresh(key, ttlMs, load, persist, stale).catch((error) =>
      log.warn?.(`cache: background refresh failed for ${key}: ${error.message}`),
    );
    return stale.value;
  }

  // persist: { staleMs, dehydrate?, revive? } keeps the key in the shared store.
  async function get(key, ttlMs, load, { persist } = {}) {
    const hit = memory.get(key);
    if (hit && hit.freshUntil > Date.now()) return hit.value;
    if (!persist || !store) return refresh(key, ttlMs, load, null, hit);
    if (hit) return background(key, ttlMs, load, persist, hit);
    const saved = await readStore(key, persist);
    if (!saved) return refresh(key, ttlMs, load, persist, null);
    remember(key, saved.value, saved.savedAt + ttlMs);
    if (Date.now() - saved.savedAt < ttlMs) return saved.value;
    return background(key, ttlMs, load, persist, saved);
  }

  // Whatever is cached for a key (any age), without loading it.
  async function peek(key) {
    const hit = memory.get(key);
    if (hit) return hit.value;
    if (!store) return null;
    const saved = await readStore(key, {});
    return saved ? saved.value : null;
  }

  function clear() {
    memory.clear();
    inflight.clear();
    reading.clear();
  }

  return { get, peek, clear, store };
}

module.exports = { cache: createCache(), createCache };
