export async function api(route, params = {}, signal) {
  const response = await fetch(
    "/api/" + route + "?" + new URLSearchParams(params),
    {
      signal: signal || AbortSignal.timeout(55000),
      cache: ["holdings", "balance", "transaction"].includes(route)
        ? "no-store"
        : "default",
    },
  );
  const data = await response.json().catch(() => ({
    error:
      response.status === 429
        ? "Too many requests. Please wait a minute."
        : "Service unavailable. Please retry.",
  }));
  if (!response.ok)
    throw Error(data.error || "Connection unavailable. Try again.");
  return data;
}
const marketCache = new Map();
export function market(token) {
  if (!token?.verified) return Promise.resolve(null);
  const previous = marketCache.get(token.id);
  if (previous && Date.now() - previous.at < 60000) return previous.promise;
  const promise = api("market", { id: token.id }).catch((error) => {
    marketCache.delete(token.id);
    throw error;
  });
  marketCache.set(token.id, { at: Date.now(), promise });
  return promise;
}
export const money = (n) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: n < 1 ? 4 : 2,
      }).format(n)
    : "—";
export const compact = (n) =>
  Number.isFinite(n)
    ? "$" +
      new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(n)
    : "—";
export function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
