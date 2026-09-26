"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, read, save } from "./api";
export default function useActivity(wallet, onConfirmed) {
  const [items, setItems] = useState([]),
    [error, setError] = useState("");
  const current = useRef(wallet);
  current.current = wallet;
  const persist = useCallback((address, update) => {
    const key = "folio-activity-v1:" + address;
    const old = read(key, []);
    const next = update(Array.isArray(old) ? old : []).slice(0, 100);
    save(key, next);
    if (current.current === address) setItems(next);
  }, []);
  useEffect(() => {
    setError("");
    const stored = wallet ? read("folio-activity-v1:" + wallet, []) : [];
    setItems(
      Array.isArray(stored)
        ? stored.filter((t) => t.wallet === wallet && typeof t.id === "string")
        : [],
    );
  }, [wallet]);
  const record = useCallback(
    (event) => {
      persist(event.wallet, (old) => [
        event,
        ...old.filter((t) => t.id !== event.id),
      ]);
    },
    [persist],
  );
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (!wallet || busy.current) return;
    busy.current = true;
    try {
      const pending = items
        .filter(
          (t) =>
            t.signature &&
            ["pending", "signed", "confirmed"].includes(t.status),
        )
        .sort((a, b) => (a.checkedAt || "").localeCompare(b.checkedAt || ""))
        .slice(0, 4);
      for (const t of pending) {
        const result = await api("transaction", {
          address: wallet,
          signature: t.signature,
          id: t.tokenId,
        });
        if (current.current !== wallet) return;
        persist(wallet, (old) =>
          old.map((x) =>
            x.id === t.id
              ? {
                  ...x,
                  ...result,
                  message: result.message || "",
                  checkedAt: new Date().toISOString(),
                }
              : x,
          ),
        );
        if (
          ["confirmed", "finalized"].includes(result.status) &&
          !["confirmed", "finalized"].includes(t.status)
        )
          onConfirmed(wallet);
      }
      setError("");
    } catch (e) {
      if (current.current === wallet) setError(e.message);
    } finally {
      busy.current = false;
    }
  }, [wallet, items, persist, onConfirmed]);
  useEffect(() => {
    if (
      !items.some(
        (t) =>
          t.signature && ["pending", "signed", "confirmed"].includes(t.status),
      )
    )
      return;
    const timer = setInterval(refresh, 8000);
    return () => clearInterval(timer);
  }, [refresh, items]);
  return { items, error, record, refresh };
}
