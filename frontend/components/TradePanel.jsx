"use client";
import { useEffect, useState } from "react";
import { api, money, compact } from "../lib/api";
import { openSwap } from "../lib/jupiter";
import { Identity, Modal, useMarket } from "./Shared";
export default function TradePanel({
  group,
  onClose,
  onAdd,
  onTrade,
  initialAmount = 100,
  balance,
}) {
  const [id, setId] = useState(
    group.tokens.find((t) => t.verified)?.id || group.tokens[0].id,
  );
  const token = group.tokens.find((t) => t.id === id) || group.tokens[0];
  const [amount, setAmount] = useState(initialAmount),
    [quote, setQuote] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [history, setHistory] = useState(null);
  const m = useMarket(token);
  useEffect(() => {
    setQuote(null);
    setError("");
  }, [amount, id]);
  useEffect(() => {
    const ctrl = new AbortController();
    setHistory(null);
    if (token.verified)
      api("history", { id: token.id }, ctrl.signal)
        .then(setHistory)
        .catch((e) => {
          if (e.name !== "AbortError") setHistory({ points: [] });
        });
    return () => ctrl.abort();
  }, [token.id]);
  const invalid = !Number.isFinite(amount) || amount < 1 || amount > 1000000;
  async function preview() {
    setBusy(true);
    setError("");
    try {
      const q = await api("quote", { id, amount });
      setQuote(q);
      if (q.status !== "quoted") setError(q.message || "No route available.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function trade() {
    setBusy(true);
    setError("");
    try {
      await openSwap(token, amount, onTrade);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <Modal title={group.ticker + " · " + group.name} onClose={onClose} wide>
      <div className="trade-grid">
        <div className="trade-information">
          <Identity token={token} />
          <div className="big-price">
            {money(m.price)}{" "}
            <span className={m.change24h >= 0 ? "up" : "down"}>
              {Number.isFinite(m.change24h)
                ? `${m.change24h >= 0 ? "+" : ""}${m.change24h.toFixed(2)}% today`
                : ""}
            </span>
          </div>
          <Chart history={history} verified={token.verified} />
          <div className="detail-stats">
            <span>
              Pool liquidity<strong>{compact(m.liquidity)}</strong>
            </span>
            <span>
              24h volume<strong>{compact(m.volume24h)}</strong>
            </span>
          </div>
          <p className="caption">
            Token pool price, not a stock-exchange quote.{" "}
            {m.asOf
              ? "Checked " + new Date(m.asOf).toLocaleTimeString()
              : m.error || ""}
          </p>
          <h3>Choose a provider</h3>
          <div className="versions">
            {group.tokens.map((t) => (
              <button
                key={t.id}
                className={"version " + (t.id === id ? "selected" : "")}
                onClick={() => setId(t.id)}
                disabled={busy}
              >
                <span>
                  <strong>{t.issuer}</strong>
                  <small>{t.symbol}</small>
                </span>
                <span>
                  {t.verified ? "Address confirmed" : "Not ready to trade"}{" "}
                  {t.id === id ? "✓" : ""}
                </span>
              </button>
            ))}
          </div>
          <details>
            <summary>Token details & sources</summary>
            <p>
              {token.verified
                ? "Address matched to the issuer’s published information."
                : "Listed from the supplied research file. This address has not been confirmed; buying is disabled."}
            </p>
            {token.address && (
              <a
                className="contract"
                href={"https://solscan.io/token/" + token.address}
                target="_blank"
                rel="noreferrer"
              >
                {token.address} ↗
              </a>
            )}
            <a href={token.source} target="_blank" rel="noreferrer">
              Provider information ↗
            </a>
            <p>
              Rights, dividends and eligibility depend on the provider’s product
              terms.
            </p>
          </details>
        </div>
        <aside className="buy-box">
          <span className="eyebrow">BUY ON SOLANA</span>
          <h3>Your next investment</h3>
          <label htmlFor="trade-amount">You pay</label>
          <div className="amount-input">
            <input
              id="trade-amount"
              type="number"
              min="1"
              max="1000000"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              disabled={busy}
            />
            <span>USDC</span>
          </div>
          <div className="presets">
            {[100, 500, 1000].map((v) => (
              <button key={v} onClick={() => setAmount(v)} disabled={busy}>
                ${v.toLocaleString()}
              </button>
            ))}
          </div>
          {balance && (
            <p className="caption">Wallet: {balance.usdc.toFixed(2)} USDC</p>
          )}
          <p>
            Pay with USDC from your wallet. Receive {token.symbol} in the wallet
            you connect to Jupiter.
          </p>
          {!token.verified ? (
            <div className="notice">
              This listing is for discovery. Buying opens once its address is
              confirmed.
            </div>
          ) : token.halted ? (
            <div className="notice error">
              The issuer reports trading halted.
            </div>
          ) : (
            <>
              <button
                className="secondary full"
                disabled={invalid || busy}
                onClick={preview}
              >
                {busy ? "Loading…" : "Preview quote"}
              </button>
              {quote?.status === "quoted" && (
                <div className="quote">
                  <span>
                    Route<strong>{quote.router || "Jupiter"}</strong>
                  </span>
                  <span>
                    Provider fee
                    <strong>
                      {quote.feeBps == null
                        ? "At checkout"
                        : quote.feeBps / 100 + "%"}
                    </strong>
                  </span>
                  <small>
                    Indicative · {new Date(quote.asOf).toLocaleTimeString()}.
                    Jupiter refreshes the final price.
                  </small>
                </div>
              )}
              <button
                className="primary full"
                disabled={invalid || busy}
                onClick={trade}
              >
                Buy with Jupiter ↗
              </button>
              <a
                className="external"
                href={"https://jup.ag/swap/USDC-" + token.address}
                target="_blank"
                rel="noreferrer"
              >
                Open Jupiter separately ↗
              </a>
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button
            className="text-button full"
            disabled={!token.verified || token.halted}
            onClick={() => onAdd(token)}
          >
            ＋ Add to portfolio instead
          </button>
          <p className="caption">
            You review and approve the swap in your wallet. Network and provider
            fees apply. Availability depends on your region.
          </p>
        </aside>
      </div>
    </Modal>
  );
}
function Chart({ history, verified }) {
  if (!verified)
    return (
      <div className="chart-placeholder">
        Live data requires a confirmed token address.
      </div>
    );
  if (!history)
    return <div className="chart-placeholder">Loading price history…</div>;
  const points = history.points || [];
  if (points.length < 2)
    return (
      <div className="chart-placeholder">
        No price history available for this pool.
      </div>
    );
  const min = Math.min(...points.map((p) => p.value)),
    max = Math.max(...points.map((p) => p.value)),
    range = max - min || 1;
  const line = points
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${(i / (points.length - 1)) * 600},${145 - ((p.value - min) / range) * 125}`,
    )
    .join(" ");
  return (
    <div className="price-chart">
      <svg
        viewBox="0 0 600 160"
        role="img"
        aria-label="Daily token pool price history"
      >
        <path d={line + " L600,160 L0,160Z"} fill="#eff6e4" />
        <path d={line} fill="none" stroke="#709648" strokeWidth="2.5" />
        {points.map((p, i) => (
          <circle
            key={p.time}
            cx={(i / (points.length - 1)) * 600}
            cy={145 - ((p.value - min) / range) * 125}
            r="4"
            fill="transparent"
          >
            <title>
              {new Date(p.time).toLocaleDateString()}: {money(p.value)}
            </title>
          </circle>
        ))}
      </svg>
      <div>
        <span>{new Date(points[0].time).toLocaleDateString()}</span>
        <span>{points.length} daily closes</span>
        <span>{new Date(points.at(-1).time).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
