"use client";
import { Identity, useMarket } from "./Shared";
import { money } from "../lib/api";
export default function Holdings({
  wallet,
  balance,
  loading,
  error,
  onConnect,
  onRefresh,
  onSell,
  activity,
}) {
  return (
    <div className="portfolio-scroll">
      <div className="holdings-header">
        <div>
          <h2>Your assets</h2>
          <p>Balances read from your Solana wallet.</p>
        </div>
        <button
          className="secondary"
          onClick={onRefresh}
          disabled={!wallet || loading}
        >
          ↻ Refresh balances
        </button>
      </div>
      {!wallet ? (
        <div className="card empty">
          <h3>Your wallet, your investments.</h3>
          <p>Connect once to see your assets and trade with the same wallet.</p>
          <button className="primary" onClick={onConnect}>
            Connect wallet
          </button>
        </div>
      ) : (
        <>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {loading && <p role="status">Checking your wallet…</p>}
          {balance && (
            <>
              <div className="wallet-summary">
                <div className="card">
                  <small>Available to spend</small>
                  <h2>
                    {money(balance.usdc)} <small>USDC</small>
                  </h2>
                </div>
                <div className="card">
                  <small>Network fee balance</small>
                  <h2>
                    {balance.sol?.toFixed(5)} <small>SOL</small>
                  </h2>
                </div>
                <div className="card">
                  <small>Last checked</small>
                  <p>{new Date(balance.asOf).toLocaleTimeString()}</p>
                  <small>Refresh before trading</small>
                </div>
              </div>
              <section className="card holdings-list">
                {balance.holdings?.length ? (
                  balance.holdings.map((h) => (
                    <Holding key={h.mint} holding={h} onSell={onSell} />
                  ))
                ) : (
                  <div className="empty">
                    <h3>No supported stock tokens found.</h3>
                    <p>
                      After a confirmed purchase, refresh to see your tokens
                      here.
                    </p>
                  </div>
                )}
                <p className="caption">
                  Only supported catalog tokens are shown. Balances include
                  Token-2022 display adjustments. Pool values are estimates.
                </p>
              </section>
            </>
          )}
          <section className="card activity">
            <div className="holdings-header">
              <div>
                <h2>Transaction activity</h2>
                <p>Folio trades saved on this browser, for this wallet.</p>
              </div>
              <button className="secondary" onClick={activity.refresh}>
                Check status
              </button>
            </div>
            {activity.error && (
              <p className="notice error">
                Status unavailable: {activity.error} Do not assume failure or
                submit again.
              </p>
            )}
            {!activity.items.length ? (
              <p>No Folio transactions recorded yet.</p>
            ) : (
              activity.items.map((t) => (
                <article className="activity-row" key={t.id}>
                  <div>
                    <strong>Swap · {t.ticker}</strong>
                    <small>{new Date(t.createdAt).toLocaleString()}</small>
                  </div>
                  <div>
                    <strong
                      className={
                        ["confirmed", "finalized"].includes(t.status)
                          ? "up"
                          : t.status === "failed"
                            ? "down"
                            : ""
                      }
                    >
                      {{
                        awaiting_wallet: "Approve in wallet",
                        signed: "Signed · awaiting network",
                        pending: "Awaiting confirmation",
                        confirmed: "Confirmed",
                        finalized: "Finalized",
                        failed: "Failed on chain",
                        cancelled: "Signing cancelled",
                        unresolved: "Status unknown",
                      }[t.status] || t.status}
                    </strong>
                    {t.signature && (
                      <a
                        href={"https://solscan.io/tx/" + t.signature}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View transaction ↗
                      </a>
                    )}
                    {t.message && <small>{t.message}</small>}
                    {Number.isFinite(t.feeLamports) && (
                      <small>
                        Network fee: {(t.feeLamports / 1e9).toFixed(6)} SOL
                      </small>
                    )}
                    {t.changes?.map((c) => (
                      <small key={c.mint}>
                        {BigInt(c.raw) > 0n ? "+" : ""}
                        {(Number(c.raw) / 10 ** c.decimals).toLocaleString(
                          undefined,
                          { maximumFractionDigits: 9 },
                        )}{" "}
                        unscaled tokens · {c.mint.slice(0, 4)}…
                        {c.mint.slice(-4)}
                      </small>
                    ))}
                  </div>
                </article>
              ))
            )}
            <p className="caption">
              Confirmed receipts show wallet token changes. Trades made
              elsewhere are not included in this browser history. An unknown
              status is not a failed transaction.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
function Holding({ holding: h, onSell }) {
  const m = useMarket(h.token);
  return (
    <div className="holding-row">
      <Identity token={h.token} />
      <div>
        <strong>
          {h.display.toLocaleString(undefined, { maximumFractionDigits: 8 })}{" "}
          {h.token.symbol}
        </strong>
        <small>
          {m.status === "available"
            ? money(h.display * m.price)
            : "Value unavailable"}
        </small>
      </div>
      <button
        className="secondary"
        disabled={h.frozen || h.token.halted}
        onClick={() => onSell(h)}
      >
        {h.frozen ? "Frozen" : "Sell for USDC"}
      </button>
    </div>
  );
}
