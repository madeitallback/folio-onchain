"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, read, save, money, compact } from "../lib/api";
import allocation from "../lib/allocation.cjs";
import { Identity, Modal } from "./Shared";
import TradePanel from "./TradePanel";
import Portfolio from "./Portfolio";
import Holdings from "./Holdings";
import useActivity from "../lib/useActivity";
const priority = [
  "SPY",
  "NVDA",
  "AAPL",
  "MSFT",
  "QQQ",
  "GOOGL",
  "AMZN",
  "TSLA",
  "MCD",
  "HOOD",
];
const PAGE_SIZES = [25, 50, 100];
const ISSUER_ORDER = ["xStocks", "Ondo", "Backpack", "PreStocks"];
const issuerRank = (name) => (ISSUER_ORDER.indexOf(name) + 1 || 99);
// Row numbers for one asset, from the catalog's market snapshot.
function groupStats(g) {
  const live = g.tokens.filter((t) => t.verified);
  const total = (k) =>
    live.reduce((s, t) => (Number.isFinite(t[k]) ? (s ?? 0) + t[k] : s), null);
  const lead =
    live
      .filter((t) => Number.isFinite(t.price))
      .sort((a, b) => (b.liquidity ?? -1) - (a.liquidity ?? -1))[0] || null;
  return {
    lead,
    stockPrice: live.map((t) => t.stockPrice).find(Number.isFinite) ?? null,
    mcap: total("mcap"),
    volume: total("volume24h"),
    liquidity: total("liquidity"),
  };
}
const signed = (n, digits = 2) =>
  Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%` : "—";
export default function Workspace() {
  const [catalog, setCatalog] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const [view, setView] = useState("explore"),
    [collapsed, setCollapsed] = useState(false),
    [query, setQuery] = useState(""),
    [issuer, setIssuer] = useState(""),
    [kind, setKind] = useState(""),
    [onlyReady, setOnlyReady] = useState(true),
    [sort, setSort] = useState("popular"),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(50);
  const [buyPage, setBuyPage] = useState(null),
    [buyLoading, setBuyLoading] = useState(false),
    [buyError, setBuyError] = useState(""),
    [cursor, setCursor] = useState(0),
    [previousCursors, setPreviousCursors] = useState([]);
  const [stars, setStars] = useState([]),
    [slices, setSlices] = useState([]),
    [initialized, setInitialized] = useState(false),
    [selected, setSelected] = useState(null),
    [modal, setModal] = useState(""),
    [toast, setToast] = useState("");
  const [wallet, setWallet] = useState(null),
    [balance, setBalance] = useState(null),
    [balanceError, setBalanceError] = useState(""),
    [balanceLoading, setBalanceLoading] = useState(false),
    [connecting, setConnecting] = useState(false);
  const provider = useRef(null),
    walletGeneration = useRef(0),
    tableArea = useRef(null),
    toastTimer = useRef(null);
  const notify = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  }, []);
  // quiet: background refresh. No spinner, and a failure keeps the current data.
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setLoading(true);
      setError("");
    }
    try {
      setCatalog(await api("catalog"));
      setRevision((n) => n + 1);
      setError("");
    } catch (e) {
      if (!quiet) setError(e.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);
  // Prices stay current on their own; the server keeps its caches fresh.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load({ quiet: true });
    }, 60000);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => {
    load();
    const s = read("folio-watchlist-v2", []);
    setStars(Array.isArray(s) ? s.filter((x) => typeof x === "string") : []);
    const draft = read("folio-draft-v2", {});
    if (Array.isArray(draft.slices))
      setSlices(
        draft.slices
          .filter((x) => typeof x.id === "string" && Number.isFinite(x.weight))
          .slice(0, 10),
      );
    setInitialized(true);
    return () => clearTimeout(toastTimer.current);
  }, [load]);
  useEffect(() => {
    if (initialized) save("folio-draft-v2", { slices });
  }, [slices, initialized]);
  useEffect(() => {
    const size = read("folio-page-size", 50);
    if (PAGE_SIZES.includes(size)) setPageSize(size);
  }, []);
  useEffect(
    () => setPage(1),
    [query, issuer, kind, onlyReady, view, pageSize, sort],
  );
  const tokens = catalog?.tokens || [];
  const allGroups = useMemo(() => {
    const map = new Map();
    for (const t of catalog?.tokens || []) {
      if (
        (issuer && t.issuerId !== issuer) ||
        (kind && t.kind !== kind) ||
        (!kind && t.kind === "Pre-IPO") ||
        (onlyReady && !t.verified)
      )
        continue;
      let g = map.get(t.ticker);
      if (!g) {
        g = { ticker: t.ticker, name: t.name, kind: t.kind, tokens: [] };
        map.set(t.ticker, g);
      }
      g.tokens.push(t);
    }
    const q = query.trim().toLowerCase();
    return [...map.values()]
      .filter(
        (g) =>
          (view !== "watchlist" || stars.includes(g.ticker)) &&
          (!q ||
            `${g.ticker} ${g.name}`.toLowerCase().includes(q) ||
            g.tokens.some((t) => t.address === query.trim())),
      )
      .sort((a, b) => {
        if (sort === "name") return a.ticker.localeCompare(b.ticker);
        if (sort === "mcap" || sort === "volume")
          return (
            (groupStats(b)[sort] ?? -1) - (groupStats(a)[sort] ?? -1) ||
            a.ticker.localeCompare(b.ticker)
          );
        // Featured first, then the most liquid.
        return (
          (priority.indexOf(a.ticker) + 1 || 999) -
            (priority.indexOf(b.ticker) + 1 || 999) ||
          (groupStats(b).liquidity ?? -1) - (groupStats(a).liquidity ?? -1) ||
          a.ticker.localeCompare(b.ticker)
        );
      });
  }, [catalog, query, issuer, kind, onlyReady, stars, view, sort]);
  const groups = onlyReady ? buyPage?.groups || [] : allGroups;
  useEffect(() => {
    setCursor(0);
    setPreviousCursors([]);
    setBuyPage(null);
  }, [query, issuer, kind, view, sort, stars]);
  useEffect(() => {
    if (!onlyReady || !["explore", "watchlist"].includes(view)) return;
    const controller = new AbortController();
    setBuyLoading(true);
    setBuyError("");
    // Keep the current rows on screen until the next page arrives.
    const timer = setTimeout(
      () =>
        api(
          "browse",
          {
            q: query,
            issuer,
            kind,
            sort,
            cursor,
            limit: pageSize,
            ...(view === "watchlist" ? { tickers: stars.join(",") } : {}),
          },
          controller.signal,
        )
          .then((result) => {
            if (!controller.signal.aborted) setBuyPage(result);
          })
          .catch((e) => {
            if (e.name !== "AbortError") setBuyError(e.message);
          })
          .finally(() => {
            if (!controller.signal.aborted) setBuyLoading(false);
          }),
      300,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    onlyReady,
    view,
    query,
    issuer,
    kind,
    sort,
    cursor,
    pageSize,
    stars,
    revision,
  ]);
  const pages = Math.max(1, Math.ceil(groups.length / pageSize)),
    activePage = Math.min(page, pages),
    visible = onlyReady
      ? groups
      : groups.slice((activePage - 1) * pageSize, activePage * pageSize);
  const visibleMints = visible
    .flatMap((g) => g.tokens.filter((t) => t.verified && t.address).map((t) => t.address))
    .join(",");
  const [routeInfo, setRouteInfo] = useState({}),
    [routeTick, setRouteTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setRouteTick((n) => n + 1), 10000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const mints = visibleMints ? visibleMints.split(",") : [];
    if (!mints.length) return;
    const controller = new AbortController();
    (async () => {
      // 40 addresses per request keeps the URL under the API size limit.
      for (let i = 0; i < mints.length; i += 40) {
        const r = await api("v1/routes", { mints: mints.slice(i, i + 40).join(",") }, controller.signal);
        if (controller.signal.aborted) return;
        setRouteInfo((old) => ({ ...old, ...r.routes }));
      }
    })().catch(() => {});
    return () => controller.abort();
  }, [visibleMints, routeTick]);
  function bestBuy(g) {
    const checked = g.tokens.filter((t) => t.verified && routeInfo[t.address]);
    const best = checked
      .map((t) => ({ t, r: routeInfo[t.address] }))
      .filter((x) => x.r.status === "route" && Number.isFinite(x.r.est_cost_pct))
      .sort((a, b) => a.r.est_cost_pct - b.r.est_cost_pct)[0];
    return { best, checked: checked.length > 0 };
  }
  function star(ticker) {
    setStars((old) => {
      const next = old.includes(ticker)
        ? old.filter((x) => x !== ticker)
        : [...old, ticker];
      save("folio-watchlist-v2", next);
      return next;
    });
  }
  function add(token) {
    if (slices.some((s) => s.id === token.id))
      return notify("Already in your portfolio.");
    const other = slices.filter(
      (s) => tokens.find((t) => t.id === s.id)?.ticker !== token.ticker,
    );
    if (other.length >= 10) return notify("Choose up to 10 assets.");
    const next = [...other, { id: token.id, weight: 0 }],
      weights = allocation.splitCents(
        100,
        next.map(() => 100 / next.length),
      );
    setSlices(next.map((s, i) => ({ ...s, weight: weights[i] })));
    notify("Added to portfolio. Your mix is split equally.");
  }
  const refreshBalance = useCallback(async (address) => {
    if (!address) return;
    const gen = ++walletGeneration.current;
    setBalance(null);
    setBalanceError("");
    setBalanceLoading(true);
    try {
      const b = await api("holdings", { address });
      if (gen === walletGeneration.current) setBalance(b);
    } catch (e) {
      if (gen === walletGeneration.current) setBalanceError(e.message);
    } finally {
      if (gen === walletGeneration.current) setBalanceLoading(false);
    }
  }, []);
  function resetWallet() {
    window.Jupiter?.close();
    setSelected(null);
    walletGeneration.current++;
    setWallet(null);
    setBalance(null);
    setBalanceError("");
    setBalanceLoading(false);
  }
  useEffect(() => {
    if (!wallet || !provider.current) return;
    const p = provider.current;
    const disconnected = () => resetWallet();
    const changed = (key) => {
      const address = key?.toString();
      if (!address) return resetWallet();
      window.Jupiter?.close();
      setSelected(null);
      setWallet(address);
      refreshBalance(address);
    };
    p.on?.("disconnect", disconnected);
    p.on?.("accountChanged", changed);
    return () => {
      p.removeListener?.("disconnect", disconnected);
      p.removeListener?.("accountChanged", changed);
    };
  }, [wallet, refreshBalance]);
  async function connect(name) {
    const p =
      name === "Phantom"
        ? window.phantom?.solana
        : name === "Backpack"
          ? window.backpack?.solana || window.backpack
          : window.solflare;
    if (!p?.connect)
      return notify(`Install ${name} or use its browser to connect.`);
    setConnecting(true);
    try {
      const result = await p.connect();
      const address = (result?.publicKey || p.publicKey)?.toString();
      if (!address) throw Error("No wallet address returned.");
      provider.current = p;
      setWallet(address);
      setModal("");
      refreshBalance(address);
    } catch (e) {
      notify(e.message || "Wallet connection cancelled.");
    } finally {
      setConnecting(false);
    }
  }
  const activity = useActivity(wallet, refreshBalance);
  function sell(holding) {
    setSelected({
      group: {
        ticker: holding.token.ticker,
        name: holding.token.name,
        tokens: [holding.token],
      },
      side: "sell",
      holding,
    });
  }
  function buy(token, amount) {
    setSelected({
      group: { ticker: token.ticker, name: token.name, tokens: [token] },
      amount,
    });
  }
  const tableView = ["explore", "watchlist"].includes(view);
  return (
    <div className={"workspace " + (collapsed ? "collapsed" : "")}>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("explore");
          }}
        >
          <span className="brand-icon">f</span>
          <span className="brand-name">
            folio<span>.</span>
          </span>
        </a>
        <span className="nav-label">YOUR WORKSPACE</span>
        <nav>
          {[
            ["explore", "▦", "Explore"],
            ["watchlist", "☆", "Watchlist"],
            ["holdings", "◉", "My assets"],
            ["portfolio", "◫", "Portfolio builder"],
          ].map(([key, icon, label]) => (
            <button
              key={key}
              className={view === key ? "active" : ""}
              title={label}
              aria-label={label}
              onClick={() => setView(key)}
            >
              <span className="nav-icon">{icon}</span>
              <span className="nav-text">{label}</span>
              {key === "portfolio" && slices.length > 0 && (
                <b>{slices.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="solana-dot" />
          <span className="nav-text">Built for Solana</span>
          <button
            className="text-button nav-text"
            onClick={() => setModal("info")}
          >
            About the data ↗
          </button>
          <button
            className="collapse-button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? "→" : "←"}
            <span className="nav-text"> Collapse</span>
          </button>
        </div>
      </aside>
      <div className="app">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>
              {view === "explore"
                ? "Explore"
                : view === "watchlist"
                  ? "Watchlist"
                  : view === "holdings"
                    ? "My assets"
                    : "Portfolio builder"}
            </strong>
          </div>
          <div className="wallet-tools">
            <span className="network">
              <i /> Solana
            </span>
            {wallet && (
              <button
                className="balance-chip"
                onClick={() => setModal("wallet")}
              >
                {balanceLoading
                  ? "Loading USDC…"
                  : balance
                    ? balance.usdc.toFixed(2) + " USDC"
                    : "Balance unavailable"}
              </button>
            )}
            <button
              className="wallet-button"
              onClick={() => setModal("wallet")}
            >
              ◇{" "}
              {wallet
                ? wallet.slice(0, 4) + "…" + wallet.slice(-4)
                : "Connect wallet"}
            </button>
          </div>
        </header>
        <main>
          <section className="page-heading">
            <div>
              <h1>
                {view === "explore" ? (
                  <>
                    Stocks. ETFs. <em>All in one place.</em>
                  </>
                ) : view === "watchlist" ? (
                  <>
                    Your next <em>investment.</em>
                  </>
                ) : view === "holdings" ? (
                  <>
                    Your wallet. <em>Your assets.</em>
                  </>
                ) : (
                  <>
                    Your portfolio. <em>Your way.</em>
                  </>
                )}
              </h1>
              <p>
                {view === "holdings"
                  ? "Your holdings and transaction activity, in one place."
                  : view === "portfolio"
                    ? "Build a mix from the stocks you discover."
                    : "Find tokenized stocks and ETFs. Choose one. Make it yours."}
              </p>
            </div>
          </section>
          {error && (
            <div className="notice error" role="alert">
              {error} <button onClick={() => load()}>Retry</button>
            </div>
          )}
          {catalog?.sources.some((s) => s.status !== "available") && (
            <div className="notice">
              Some providers are temporarily unavailable.{" "}
              <button onClick={() => load()}>Retry</button>
            </div>
          )}
          {tableView ? (
            <section className="market-section">
              <div className="filters">
                <div className="search-field">
                  <span>⌕</span>
                  <input
                    aria-label="Search stocks"
                    placeholder="Search a stock or ETF…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                    >
                      ×
                    </button>
                  )}
                </div>
                <select
                  aria-label="Provider"
                  value={issuer}
                  onChange={(e) => setIssuer(e.target.value)}
                >
                  <option value="">All providers</option>
                  {catalog?.issuers.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Asset type"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="">Stocks & ETFs</option>
                  <option>Stock</option>
                  <option>ETF</option>
                  <option>Pre-IPO</option>
                </select>
              </div>
              <div className="table-toolbar">
                <div className="result-count">
                  {loading && !catalog
                    ? "Finding your next investment…"
                    : onlyReady
                      ? buyLoading
                        ? "Checking live routes…"
                        : `${groups.length} available on this page`
                      : `${groups.length.toLocaleString()} assets`}
                  <span className="desktop-note"> · Solana</span>
                </div>
                <div className="catalog-toggle" aria-label="Catalog view">
                  <button
                    className={onlyReady ? "active" : ""}
                    onClick={() => setOnlyReady(true)}
                  >
                    Buy now
                  </button>
                  <button
                    className={!onlyReady ? "active" : ""}
                    onClick={() => setOnlyReady(false)}
                  >
                    All listings
                  </button>
                </div>
                <select
                  aria-label="Sort assets"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="popular">Featured first</option>
                  <option value="mcap">Market cap</option>
                  <option value="volume">24h volume</option>
                  <option value="name">Ticker A–Z</option>
                </select>
                <select
                  aria-label="Rows per page"
                  value={pageSize}
                  onChange={(e) => {
                    const size = Number(e.target.value);
                    setPageSize(size);
                    save("folio-page-size", size);
                  }}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n} rows
                    </option>
                  ))}
                </select>
              </div>
              {onlyReady && (buyError || buyPage?.interrupted) && (
                <div className="notice error">
                  {buyError || buyPage.notice}{" "}
                  <button onClick={() => setRevision((n) => n + 1)}>
                    Retry
                  </button>
                </div>
              )}
              <div className="table-container" ref={tableArea}>
                <table className="market-table">
                  <thead>
                    <tr>
                      <th className="c-asset">Asset</th>
                      <th className="c-type opt">Type</th>
                      <th className="c-versions">Versions</th>
                      <th
                        className="number c-price"
                        title="Mid price of the most liquid version, and its premium over the stock"
                      >
                        Price
                      </th>
                      <th className="number c-stock opt" title="Underlying stock price">
                        Stock
                      </th>
                      <th className="number c-change">24h</th>
                      <th className="number c-mcap opt" title="On-chain market cap, all versions">
                        Mkt cap
                      </th>
                      <th className="number c-volume opt" title="24h trading volume, all versions">
                        Vol 24h
                      </th>
                      <th
                        className="number c-cost"
                        title="Cheapest $100 buy across versions, versus the stock price: price impact, fees and premium included. Negative means below the stock price."
                      >
                        $100 buy
                      </th>
                      <th className="c-actions">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((g) => {
                      const s = groupStats(g);
                      const token =
                        s.lead || g.tokens.find((t) => t.verified) || g.tokens[0];
                      return (
                        <tr key={g.ticker}>
                          <td className="c-asset">
                            <button
                              className="asset-button"
                              onClick={() => setSelected({ group: g })}
                            >
                              <Identity token={{ ...token, name: g.name }} />
                            </button>
                          </td>
                          <td className="c-type opt">{g.kind}</td>
                          <td className="c-versions">
                            <div className="provider-chips">
                              {[
                                ...new Set(
                                  g.tokens
                                    .filter(
                                      (t) =>
                                        !g.tokens.some((v) => v.verified) ||
                                        t.verified,
                                    )
                                    .map((t) => t.issuer),
                                ),
                              ]
                                .sort((x, y) => issuerRank(x) - issuerRank(y))
                                .map((name) => (
                                <span
                                  key={name}
                                  title={
                                    g.tokens.some(
                                      (t) => t.issuer === name && t.verified,
                                    )
                                      ? "Confirmed token listing"
                                      : "Discovery only · not confirmed"
                                  }
                                >
                                  {name}
                                  {!g.tokens.some(
                                    (t) => t.issuer === name && t.verified,
                                  ) && " · pending"}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="number c-price">
                            {money(s.lead?.price)}
                            {Number.isFinite(s.lead?.premium) && (
                              <small
                                className="cell-sub"
                                title="Versus the stock price. Off-hours the stock price is the last close."
                              >
                                {signed(s.lead.premium)} vs stock
                              </small>
                            )}
                          </td>
                          <td className="number c-stock opt">{money(s.stockPrice)}</td>
                          <td
                            className={
                              "number c-change " + (s.lead?.change24h >= 0 ? "up" : "down")
                            }
                          >
                            {signed(s.lead?.change24h)}
                          </td>
                          <td className="number c-mcap opt">{compact(s.mcap)}</td>
                          <td className="number c-volume opt">{compact(s.volume)}</td>
                          {(() => {
                            const { best, checked } = bestBuy(g);
                            return (
                              <td
                                className={
                                  "number c-cost " +
                                  (best ? (best.r.est_cost_pct <= 0.5 ? "up" : "down") : "")
                                }
                                title={
                                  best
                                    ? `${best.t.issuer} ${best.t.symbol} · checked ${new Date(best.r.checked_at).toLocaleTimeString()}`
                                    : undefined
                                }
                              >
                                {best ? (
                                  <>
                                    {signed(best.r.est_cost_pct)}
                                    <small className="cell-sub">{best.t.issuer}</small>
                                  </>
                                ) : checked ? (
                                  "No route"
                                ) : (
                                  "—"
                                )}
                              </td>
                            );
                          })()}
                          <td className="c-actions">
                            <div className="row-actions">
                              <button
                                className="buy-button"
                                onClick={() => setSelected({ group: g })}
                              >
                                {g.tokens.some((t) => t.verified)
                                  ? onlyReady
                                    ? "Buy"
                                    : "Check route"
                                  : "Details"}{" "}
                                ↗
                              </button>
                              <button
                                className={
                                  "star " +
                                  (stars.includes(g.ticker) ? "on" : "")
                                }
                                aria-label={
                                  (stars.includes(g.ticker)
                                    ? "Unwatch "
                                    : "Watch ") + g.ticker
                                }
                                onClick={() => star(g.ticker)}
                              >
                                {stars.includes(g.ticker) ? "★" : "☆"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!visible.length && (
                  <div className="empty">
                    {loading
                      ? "Loading provider catalogs…"
                      : view === "watchlist" && !stars.length
                        ? "Star a stock to keep it here."
                        : onlyReady
                          ? buyLoading
                            ? "Checking confirmed tokens for a live Jupiter route…"
                            : "No available routes on this page. Try the next page or All listings."
                          : "No matching assets. Try another search or provider."}
                  </div>
                )}
              </div>
              <div className="pagination">
                <span>
                  {onlyReady
                    ? "Routes checked for 100 USDC · Final amount requoted"
                    : groups.length
                      ? `${(activePage - 1) * pageSize + 1}–${Math.min(activePage * pageSize, groups.length)} of ${groups.length}`
                      : "0 assets"}
                </span>
                <div>
                  <button
                    aria-label="Previous page"
                    disabled={
                      onlyReady
                        ? !previousCursors.length || buyLoading
                        : activePage === 1
                    }
                    onClick={() => {
                      if (onlyReady) {
                        setCursor(previousCursors[previousCursors.length - 1]);
                        setPreviousCursors((old) => old.slice(0, -1));
                      } else setPage(activePage - 1);
                    }}
                  >
                    ←
                  </button>
                  <span>
                    Page {onlyReady ? previousCursors.length + 1 : activePage}
                    {!onlyReady && <> of {pages}</>}
                  </span>
                  <button
                    aria-label="Next page"
                    disabled={
                      onlyReady
                        ? buyLoading ||
                          buyPage?.nextCursor == null ||
                          buyPage.nextCursor === cursor
                        : activePage === pages
                    }
                    onClick={() => {
                      if (onlyReady) {
                        setPreviousCursors((old) => [...old, cursor]);
                        setCursor(buyPage.nextCursor);
                      } else setPage(activePage + 1);
                    }}
                  >
                    →
                  </button>
                </div>
              </div>
              <footer>
                <span>
                  <i /> {catalog ? "Catalog connected" : "Connecting"}
                  <span className="desktop-note">
                    {" "}
                    · Prices from token markets
                  </span>
                </span>
                <button onClick={() => setModal("info")}>
                  Sources & details ↗
                </button>
              </footer>
            </section>
          ) : view === "holdings" ? (
            <Holdings
              wallet={wallet}
              balance={balance}
              loading={balanceLoading}
              error={balanceError}
              onConnect={() => setModal("wallet")}
              onRefresh={() => refreshBalance(wallet)}
              onSell={sell}
              activity={activity}
            />
          ) : (
            <Portfolio
              slices={slices}
              setSlices={setSlices}
              tokens={tokens}
              onBrowse={() => setView("explore")}
              onBuy={buy}
              notify={notify}
            />
          )}
        </main>
      </div>
      {selected && (
        <TradePanel
          key={selected.group.ticker + (selected.side || "buy")}
          group={selected.group}
          initialAmount={selected.amount || 100}
          balance={balance}
          wallet={wallet}
          provider={provider.current}
          side={selected.side || "buy"}
          holding={selected.holding}
          onConnect={() => setModal("wallet")}
          onClose={() => setSelected(null)}
          onAdd={add}
          onTrade={activity.record}
        />
      )}
      {modal === "wallet" && (
        <Modal
          title={wallet ? "Your wallet" : "Connect your wallet"}
          onClose={() => setModal("")}
        >
          <div className="modal-content">
            {wallet ? (
              <>
                <p className="wallet-address">{wallet}</p>
                <div className="wallet-balance">
                  <small>USDC on Solana</small>
                  <strong>
                    {balanceLoading
                      ? "Loading…"
                      : balance
                        ? balance.usdc.toFixed(2)
                        : "Unavailable"}
                  </strong>
                </div>
                {balanceError && <p className="error">{balanceError}</p>}
                {balance && (
                  <p className="caption">
                    Checked {new Date(balance.asOf).toLocaleTimeString()}
                  </p>
                )}
                <div className="button-row">
                  <button
                    className="primary"
                    disabled={balanceLoading}
                    onClick={() => refreshBalance(wallet)}
                  >
                    Refresh balance
                  </button>
                  <button
                    className="secondary"
                    onClick={async () => {
                      try {
                        await provider.current?.disconnect();
                      } finally {
                        resetWallet();
                        setModal("");
                      }
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  Your money stays in your wallet. Connect to see your USDC
                  balance.
                </p>
                {["Phantom", "Backpack", "Solflare"].map((name) => (
                  <button
                    key={name}
                    className="wallet-option"
                    disabled={connecting}
                    onClick={() => connect(name)}
                  >
                    {name}
                    <span>→</span>
                  </button>
                ))}
              </>
            )}
            <p className="caption">
              Folio does not hold deposits. Your connected wallet is reused in
              Jupiter; you approve each trade there. Keep SOL available for
              network fees.
            </p>
          </div>
        </Modal>
      )}
      {modal === "info" && (
        <Modal
          title="Simple on the surface. Clear underneath."
          onClose={() => setModal("")}
        >
          <div className="modal-content">
            <h3>One place to explore</h3>
            <p>
              This version focuses on Solana. The catalog combines live xStocks
              and Ondo lists, a Backpack token confirmed against its
              announcement, and discovery entries from your supplied research
              file.
            </p>
            <p>
              Buy now shows confirmed tokens with a recently checked 100 USDC
              route. Unconfirmed listings are separate under All listings, with
              buying disabled. They are not claims of current availability. No
              prices, volumes or safety ratings are copied from the research
              snapshot.
            </p>
            <h3>Prices & trading</h3>
            <p>
              Displayed prices are observations from the most liquid indexed
              pool of the first confirmed version in the row, not best-price
              comparisons or stock-exchange quotes. Pick a provider to see its
              own token data. Missing data appears as a dash.
            </p>
            <p>
              Jupiter refreshes the executable quote. Token rights and access
              depend on issuer terms and your region. A portfolio is a saved
              personal mix, not an ETF or an automatic order.
            </p>
            <h3>Sources</h3>
            {catalog?.issuers.map((i) => (
              <p key={i.id}>
                <a href={i.url} target="_blank" rel="noreferrer">
                  {i.name} ↗
                </a>{" "}
                · {i.description}
              </p>
            ))}
            <p>
              <a
                href="https://dexscreener.com"
                target="_blank"
                rel="noreferrer"
              >
                DEX Screener
              </a>{" "}
              · market observations
              <br />
              <a
                href="https://www.geckoterminal.com"
                target="_blank"
                rel="noreferrer"
              >
                GeckoTerminal
              </a>{" "}
              · daily pool history
            </p>
            <p className="caption">
              Catalog checked{" "}
              {catalog ? new Date(catalog.asOf).toLocaleString() : "—"}.
              Research snapshot: {catalog?.seedDate}. Plans and watchlists are
              saved in this browser.
            </p>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
