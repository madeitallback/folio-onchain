"use client";
import { useEffect, useRef, useState } from "react";
import { market } from "../lib/api";
export function Logo({ token }) {
  const sources = [...new Set([token.logo, ...(token.logos || [])])].filter(
    (url) => typeof url === "string" && url.startsWith("https://"),
  );
  return (
    <LogoImage
      key={token.id + sources.join("|")}
      ticker={token.ticker}
      sources={sources}
    />
  );
}
function LogoImage({ ticker, sources }) {
  const [index, setIndex] = useState(0);
  return (
    <span
      className="logo"
      title={
        index >= sources.length ? ticker + " · logo unavailable" : undefined
      }
    >
      {ticker.slice(0, 4)}
      {sources[index] && (
        <img
          key={sources[index]}
          src={sources[index]}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setIndex((current) => current + 1)}
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
