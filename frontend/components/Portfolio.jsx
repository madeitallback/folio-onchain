"use client";
import { useState } from "react";
import allocation from "../lib/allocation.cjs";
import { money, read, save } from "../lib/api";
import { Identity } from "./Shared";
export default function Portfolio({
  slices,
  setSlices,
  tokens,
  onBrowse,
  onBuy,
  notify,
}) {
  const [amount, setAmount] = useState(500),
    [name, setName] = useState("My portfolio"),
    [frequency, setFrequency] = useState("once"),
    [day, setDay] = useState(1),
    [plans, setPlans] = useState(() => {
      const saved = read("folio-plans-v2", []);
      return Array.isArray(saved)
        ? saved.filter(
            (p) =>
              typeof p?.id === "string" &&
              typeof p.name === "string" &&
              Number.isFinite(p.amount) &&
              Array.isArray(p.slices) &&
              p.slices.length <= 10 &&
              p.slices.every(
                (s) => typeof s?.id === "string" && Number.isFinite(s.weight),
              ),
          )
        : [];
    });
  const tokenMap = new Map(tokens.map((t) => [t.id, t]));
  const total = slices.reduce((n, s) => n + s.weight, 0),
    error =
      allocation.validate(amount, slices) ||
      (slices.some((s) => !tokenMap.get(s.id)?.verified)
        ? "A saved token is unavailable. Remove it or select another."
        : "") ||
      (["monthly", "interval"].includes(frequency) &&
      (!Number.isInteger(day) ||
        day < 1 ||
        day > (frequency === "monthly" ? 28 : 365))
        ? "Choose a valid whole-number schedule interval."
        : "");
  const amounts =
    total === 100
      ? allocation.splitCents(
          amount,
          slices.map((s) => s.weight),
        )
      : [];
  function equalize() {
    const weights = allocation.splitCents(
      100,
      slices.map(() => 100 / slices.length),
    );
    setSlices(slices.map((s, i) => ({ ...s, weight: weights[i] })));
  }
  function store() {
    if (error) return;
    const label =
      frequency === "once"
        ? "One time"
        : frequency === "monthly"
          ? "Monthly on day " + day
          : frequency === "interval"
            ? "Every " + day + " days"
            : frequency === "daily"
              ? "Every day"
              : "Every week";
    const p = {
      id: crypto.randomUUID(),
      name: name.trim() || "My portfolio",
      amount,
      slices,
      schedule: { frequency, interval: day, label },
      createdAt: new Date().toISOString(),
    };
    const next = [...(Array.isArray(plans) ? plans : []), p];
    setPlans(next);
    if (!save("folio-plans-v2", next))
      return notify("Could not save to browser storage.");
    notify("Portfolio saved. No automatic orders created.");
  }
  function load(p) {
    setName(p.name);
    setAmount(p.amount);
    setFrequency(p.schedule?.frequency || "once");
    setDay(p.schedule?.interval || 1);
    setSlices(p.slices);
  }
  function download(p) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(p, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "folio-portfolio.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="portfolio-scroll">
      <div className="portfolio-grid">
        <section className="card">
          <div className="card-heading">
            <input
              aria-label="Portfolio name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={70}
            />
            <button
              className="text-button"
              onClick={equalize}
              disabled={!slices.length}
            >
              Equal split
            </button>
          </div>
          <div className="allocation-meta">
            <span>{slices.length} assets</span>
            <span className={total === 100 ? "up" : "down"}>
              {Number(total.toFixed(2))}% allocated
            </span>
          </div>
          {!slices.length ? (
            <div className="empty">
              <h3>Start with a stock you like.</h3>
              <p>Add stocks from Explore to build your own mix.</p>
              <button className="primary" onClick={onBrowse}>
                Explore stocks →
              </button>
            </div>
          ) : (
            slices.map((s, i) => {
              const t = tokenMap.get(s.id);
              return (
                <div className="portfolio-row" key={s.id}>
                  {t ? (
                    <Identity token={t} />
                  ) : (
                    <strong>Unavailable token</strong>
                  )}
                  <label>
                    <input
                      aria-label={(t?.ticker || "Asset") + " allocation"}
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={s.weight}
                      onChange={(e) =>
                        setSlices(
                          slices.map((x) =>
                            x.id === s.id
                              ? { ...x, weight: Number(e.target.value) }
                              : x,
                          ),
                        )
                      }
                    />
                    %
                  </label>
                  <span>{money(amounts[i])}</span>
                  <button
                    className="icon-button"
                    aria-label={"Remove " + (t?.ticker || "asset")}
                    onClick={() =>
                      setSlices(slices.filter((x) => x.id !== s.id))
                    }
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
          <button className="secondary full" onClick={onBrowse}>
            ＋ Add a stock or ETF
          </button>
        </section>
        <section className="card">
          <span className="eyebrow">YOUR INVESTMENT</span>
          <h3>Make it your own</h3>
          <label htmlFor="portfolio-amount">Total amount</label>
          <div className="amount-input">
            <input
              id="portfolio-amount"
              type="number"
              min="10"
              max="1000000"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <span>USDC</span>
          </div>
          <label htmlFor="schedule">Schedule preference</label>
          <select
            id="schedule"
            value={frequency}
            onChange={(e) => {
              setFrequency(e.target.value);
              setDay(1);
            }}
          >
            <option value="once">One time</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="interval">Every N days</option>
          </select>
          {["monthly", "interval"].includes(frequency) && (
            <label>
              {frequency === "monthly" ? "Day of month" : "Every N days"}
              <input
                aria-label="Schedule interval"
                type="number"
                min="1"
                max={frequency === "monthly" ? 28 : 365}
                value={day}
                onChange={(e) =>
                  setDay(
                    Math.max(
                      1,
                      Math.min(
                        frequency === "monthly" ? 28 : 365,
                        Number(e.target.value),
                      ),
                    ),
                  )
                }
              />
            </label>
          )}
          <p className="caption">Planning only. No automatic purchases.</p>
          <button className="primary full" disabled={!!error} onClick={store}>
            Save portfolio
          </button>
          {error && slices.length > 0 && <p className="error">{error}</p>}
          {!error && (
            <div className="purchase-list">
              <h4>Buy your mix</h4>
              <p className="caption">
                Each stock is a separate wallet approval.
              </p>
              {slices.map((s, i) => (
                <button
                  key={s.id}
                  className="secondary full"
                  onClick={() => onBuy(tokenMap.get(s.id), amounts[i])}
                >
                  Buy {tokenMap.get(s.id)?.ticker}{" "}
                  <span>{money(amounts[i])}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className="saved-section">
        <h3>Saved portfolios</h3>
        {!plans.length ? (
          <p className="muted">Your saved mixes will appear here.</p>
        ) : (
          <div className="saved-grid">
            {plans.map((p) => (
              <article className="card" key={p.id}>
                <h3>{p.name}</h3>
                <p>
                  {money(p.amount)} · {p.schedule?.label || "One time"}
                </p>
                <p className="caption">
                  {p.slices.length} assets · Saved on this browser
                </p>
                <div className="button-row">
                  <button className="secondary" onClick={() => load(p)}>
                    Load
                  </button>
                  <button className="text-button" onClick={() => download(p)}>
                    Export
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      const next = plans.filter((x) => x.id !== p.id);
                      setPlans(next);
                      save("folio-plans-v2", next);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
