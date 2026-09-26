"use client";
import { useEffect, useRef, useState } from "react";
import { market, money, compact } from "../lib/api";
export function Logo({ token }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="logo">
      {token.ticker.slice(0, 4)}
      {!failed && token.logo?.startsWith("https://") && (
        <img
          src={token.logo}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
export function Identity({ token }) {
  return (
    <span className="identity">
      <Logo key={token.id} token={token} />
      <span>
        <strong>{token.ticker}</strong>
        <small>{token.name}</small>
      </span>
    </span>
  );
}
export function useMarket(token, revision = 0) {
  const [state, setState] = useState({});
  useEffect(() => {
    let active = true;
    setState({ loading: !!token?.verified });
    if (token?.verified)
      market(token)
        .then((data) => active && setState(data || {}))
        .catch((e) => active && setState({ error: e.message }));
    return () => {
      active = false;
    };
  }, [token?.id, revision]);
  return state;
}
export function MarketCells({ token, revision }) {
  const m = useMarket(token, revision);
  return (
    <>
      <td className="number">
        {m.loading ? (
          <span className="skeleton" />
        ) : (
          <span title={m.error || m.notice}>{money(m.price)}</span>
        )}
      </td>
      <td className={"number " + (m.change24h >= 0 ? "up" : "down")}>
        {Number.isFinite(m.change24h)
          ? `${m.change24h >= 0 ? "+" : ""}${m.change24h.toFixed(2)}%`
          : "—"}
      </td>
      <td className="number liquidity">{compact(m.liquidity)}</td>
    </>
  );
}
export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
