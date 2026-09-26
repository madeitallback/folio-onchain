"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, read, save } from "../lib/api";
import allocation from "../lib/allocation.cjs";
import { Identity, MarketCells, Modal } from "./Shared";
import TradePanel from "./TradePanel";
import Portfolio from "./Portfolio";
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
    [onlyReady, setOnlyReady] = useState(false),
    [sort, setSort] = useState("popular"),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(7);
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
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCatalog(await api("catalog"));
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
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
    if (!tableArea.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setPageSize(
        Math.max(
          3,
          Math.min(15, Math.floor((entry.contentRect.height - 48) / 78)),
        ),
      ),
    );
    observer.observe(tableArea.current);
    return () => observer.disconnect();
  }, [view]);
  useEffect(
    () => setPage(1),
    [query, issuer, kind, onlyReady, view, pageSize, sort],
  );
  const tokens = catalog?.tokens || [];
  const groups = useMemo(() => {
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
      .sort((a, b) =>
        sort === "name"
          ? a.ticker.localeCompare(b.ticker)
          : (priority.indexOf(a.ticker) + 1 || 999) -
              (priority.indexOf(b.ticker) + 1 || 999) ||
            a.ticker.localeCompare(b.ticker),
      );
  }, [catalog, query, issuer, kind, onlyReady, stars, view, sort]);
  const pages = Math.max(1, Math.ceil(groups.length / pageSize)),
    activePage = Math.min(page, pages),
    visible = groups.slice((activePage - 1) * pageSize, activePage * pageSize);
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
      const b = await api("balance", { address });
      if (gen === walletGeneration.current) setBalance(b);
    } catch (e) {
      if (gen === walletGeneration.current) setBalanceError(e.message);
    } finally {
      if (gen === walletGeneration.current) setBalanceLoading(false);
    }
  }, []);
  function resetWallet() {
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
  function buy(token, amount) {
    setSelected({
      group: { ticker: token.ticker, name: token.name, tokens: [token] },
      amount,
    });
  }
  const tableView = view !== "portfolio";
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
            ["portfolio", "◫", "My portfolio"],
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
                  : "My portfolio"}
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
                ) : (
                  <>
                    Your portfolio. <em>Your way.</em>
                  </>
                )}
              </h1>
              <p>
                {view === "portfolio"
                  ? "Build a mix from the stocks you discover."
                  : "Find tokenized stocks and ETFs. Choose one. Make it yours."}
              </p>
            </div>
            <button className="refresh" disabled={loading} onClick={load}>
              ↻ <span>{loading ? "Loading…" : "Refresh"}</span>
            </button>
          </section>
          {error && (
            <div className="notice error" role="alert">
              {error} <button onClick={load}>Retry</button>
            </div>
          )}
          {catalog?.sources.some((s) => s.status !== "available") && (
            <div className="notice">
              Some providers are temporarily unavailable.{" "}
              <button onClick={load}>Retry</button>
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
                    : `${groups.length.toLocaleString()} assets`}
                  <span className="desktop-note"> · Solana</span>
                </div>
                <label className="ready-filter">
                  <input
                    type="checkbox"
                    checked={onlyReady}
                    onChange={(e) => setOnlyReady(e.target.checked)}
                  />
                  Confirmed only
                </label>
                <select
                  aria-label="Sort assets"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="popular">Featured first</option>
                  <option value="name">Ticker A–Z</option>
                </select>
              </div>
              <div className="table-container" ref={tableArea}>
                <table>
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Providers</th>
                      <th className="number">Price</th>
                      <th className="number">24h</th>
                      <th className="number liquidity">Liquidity</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((g) => {
                      const token =
                        g.tokens.find((t) => t.verified) || g.tokens[0];
                      return (
                        <tr key={g.ticker}>
                          <td>
                            <button
                              className="asset-button"
                              onClick={() => setSelected({ group: g })}
                            >
                              <Identity token={{ ...token, name: g.name }} />
                            </button>
                          </td>
                          <td>
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
                              ].map((name) => (
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
                          <MarketCells token={token} revision={revision} />
                          <td>
                            <div className="row-actions">
                              <button
                                className="buy-button"
                                onClick={() => setSelected({ group: g })}
                              >
                                {g.tokens.some((t) => t.verified)
                                  ? "Buy"
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
                        : "No matching assets. Try another search or provider."}
                  </div>
                )}
              </div>
              <div className="pagination">
                <span>
                  {groups.length
                    ? `${(activePage - 1) * pageSize + 1}–${Math.min(activePage * pageSize, groups.length)} of ${groups.length}`
                    : "0 assets"}
                </span>
                <div>
                  <button
                    aria-label="Previous page"
                    disabled={activePage === 1}
                    onClick={() => setPage(activePage - 1)}
                  >
                    ←
                  </button>
                  <span>
                    Page {activePage} of {pages}
                  </span>
                  <button
                    aria-label="Next page"
                    disabled={activePage === pages}
                    onClick={() => setPage(activePage + 1)}
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
          key={selected.group.ticker}
          group={selected.group}
          initialAmount={selected.amount || 100}
          balance={balance}
          onClose={() => setSelected(null)}
          onAdd={add}
          onTrade={() => {
            notify("Jupiter reported a completed swap. Check your wallet.");
            refreshBalance(wallet);
          }}
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
              Folio does not hold deposits. Jupiter asks you to connect and
              approve each trade separately. You also need SOL for network fees.
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
              Unconfirmed listings stay visible with buying disabled. They are
              not claims of current availability. No prices, volumes or safety
              ratings are copied from the research snapshot.
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
