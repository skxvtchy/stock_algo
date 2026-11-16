"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BacktestResult, Metrics, StrategyResult } from "@/lib/backtest";
import type { BacktestRow } from "@/lib/db";
import { pct, tone } from "@/lib/format";
import { Button, Card, Chip, ErrorNote, Field, inputCls, KIND_SHORT, SignalBadge } from "./ui";

const SLOTS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];
const MAX_COMPARE = SLOTS.length;
const BENCH = "buy-hold";

const SORTS: { key: keyof Metrics; label: string; dir: 1 | -1 }[] = [
  { key: "sharpe", label: "Sharpe", dir: -1 },
  { key: "totalReturn", label: "Return", dir: -1 },
  { key: "maxDrawdown", label: "Smallest drawdown", dir: -1 },
  { key: "accuracy", label: "Hit rate", dir: -1 },
];

export default function BacktestLab() {
  const [ticker, setTicker] = useState("SPY");
  const [start, setStart] = useState("2012-01-01");
  const [cost, setCost] = useState(5);
  const [kind, setKind] = useState("all");
  const [sortKey, setSortKey] = useState<keyof Metrics>("sharpe");
  const [data, setData] = useState<BacktestResult | null>(null);
  const [recent, setRecent] = useState<BacktestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A compared strategy keeps its colour slot for as long as it stays selected.
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null, null]);

  const loadRecent = useCallback(async () => {
    const res = await fetch("/api/backtests");
    if (res.ok) setRecent(await res.json());
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/backtests").then(async (r) => { if (alive && r.ok) setRecent(await r.json()); });
    return () => { alive = false; };
  }, []);

  async function run(t = ticker, s = start, c = cost) {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ ticker: t, start: s, cost: String(c) });
      const res = await fetch(`/api/backtest?${q}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setData(j);
      // Default comparison: best rule-based and best ML model by Sharpe, plus the ensemble.
      const best = (f: (r: StrategyResult) => boolean) =>
        [...j.results].filter(f).sort((a: StrategyResult, b: StrategyResult) => b.metrics.sharpe - a.metrics.sharpe)[0]?.id as string | undefined;
      const picks = [...new Set([best((r) => r.kind !== "ml" && r.id !== BENCH), best((r) => r.kind === "ml" && r.id !== "ml-ensemble"), "ml-ensemble"])];
      setSlots([0, 1, 2, 3].map((i) => picks[i] ?? null));
      loadRecent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    if (id === BENCH) return;
    setSlots((s) => {
      const i = s.indexOf(id);
      if (i >= 0) return s.map((x, k) => (k === i ? null : x));
      const free = s.indexOf(null);
      return free < 0 ? s : s.map((x, k) => (k === free ? id : x));
    });
  }

  const byId = useMemo(() => new Map(data?.results.map((r) => [r.id, r]) ?? []), [data]);
  const shown = useMemo(() => [BENCH, ...slots.filter((s): s is string => !!s)], [slots]);
  const full = slots.every(Boolean);

  const chartData = useMemo(() => {
    if (!data) return [];
    const step = Math.max(1, Math.floor(data.dates.length / 300)); // ~300 points is plenty on a phone
    const rows = [];
    for (let i = 0; i < data.dates.length; i += step) {
      const row: Record<string, number | string> = { date: data.dates[i] };
      for (const id of shown) {
        const eq = byId.get(id)?.equity[i];
        if (eq != null) row[id] = eq;
      }
      rows.push(row);
    }
    return rows;
  }, [data, shown, byId]);

  const rows = useMemo(() => {
    if (!data) return [];
    const val = (r: StrategyResult) => r.metrics[sortKey] ?? -Infinity;
    return data.results.filter((s) => kind === "all" || s.kind === kind).sort((a, b) => val(b) - val(a));
  }, [data, kind, sortKey]);

  const colorOf = (id: string) => (id === BENCH ? "var(--benchmark)" : SLOTS[slots.indexOf(id)]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); run(); }}>
          <div className="flex items-end gap-2">
            <Field label="Ticker" className="flex-1">
              <input
                className={`${inputCls} uppercase`}
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
              />
            </Field>
            <Button type="submit" disabled={loading || !ticker} className="shrink-0">
              {loading ? "Running…" : "Run"}
            </Button>
          </div>
          <details className="group">
            <summary className="cursor-pointer list-none text-sm font-medium text-ink-2">
              <span className="inline-block transition group-open:rotate-90">›</span> Options · from {start.slice(0, 4)}, {cost} bps cost
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="History from">
                <input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <Field label="Cost / trade (bps)">
                <input type="number" inputMode="decimal" min={0} className={inputCls} value={cost} onChange={(e) => setCost(Number(e.target.value))} />
              </Field>
            </div>
          </details>
          {recent.length > 0 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
              {[...new Map(recent.map((r) => [`${r.ticker}|${r.start_date}|${r.cost_bps}`, r])).values()].slice(0, 8).map((r) => (
                <Chip
                  key={r.id}
                  active={false}
                  onClick={() => { setTicker(r.ticker); setStart(r.start_date); setCost(Number(r.cost_bps)); run(r.ticker, r.start_date, Number(r.cost_bps)); }}
                >
                  ↺ {r.ticker}
                </Chip>
              ))}
            </div>
          )}
        </form>
      </Card>

      {loading && (
        <Card>
          <div className="flex items-center gap-3 text-sm text-ink-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
            Training 7 ML models walk-forward and backtesting 17 algorithms… (~5s)
          </div>
        </Card>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}

      {!data && !loading && !error && (
        <Card>
          <p className="text-sm text-ink-2">
            Run a backtest to compare <b className="text-ink">10 rule-based strategies</b> and <b className="text-ink">7 machine-learning models</b> on any
            stock or ETF. The ML models are trained walk-forward: they only ever predict days they haven&apos;t seen.
          </p>
        </Card>
      )}

      {data && (
        <>
          <Card title="Growth of $1" sub={`${data.ticker} · ${data.dates[0]} → ${data.dates[data.dates.length - 1]}`}>
            <div className="-ml-2 h-60">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--grid)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={40} tickFormatter={(d: string) => d.slice(0, 4)} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => `$${v.toFixed(v < 10 ? 1 : 0)}`} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, padding: "6px 10px" }}
                    labelStyle={{ color: "var(--text-secondary)", marginBottom: 2 }}
                    itemStyle={{ color: "var(--text-primary)", padding: 0 }}
                    formatter={(v, id) => [`$${Number(v).toFixed(2)}`, byId.get(String(id))?.name ?? id]}
                    itemSorter={(item) => -Number(item.value)}
                    cursor={{ stroke: "var(--text-muted)", strokeDasharray: "3 3" }}
                  />
                  <Line dataKey={BENCH} stroke="var(--benchmark)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                  {slots.map((id, k) =>
                    id ? <Line key={id} dataKey={id} stroke={SLOTS[k]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--surface-1)", strokeWidth: 2 }} isAnimationActive={false} /> : null,
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
              {shown.map((id) => (
                <li key={id} className="flex items-center gap-1.5">
                  <svg width="16" height="4" aria-hidden>
                    <line x1="0" y1="2" x2="16" y2="2" stroke={colorOf(id)} strokeWidth="3" strokeDasharray={id === BENCH ? "4 3" : undefined} strokeLinecap="round" />
                  </svg>
                  {byId.get(id)?.name}
                  <span className="num text-ink-3">{pct(byId.get(id)?.metrics.totalReturn, 0)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-3">Tap algorithms below to compare (up to {MAX_COMPARE}).</p>
          </Card>

          <div className="flex flex-col gap-2">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
              {["all", "trend", "mean-reversion", "ml"].map((k) => (
                <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                  {k === "all" ? `All ${data.results.length}` : KIND_SHORT[k]}
                </Chip>
              ))}
            </div>
            <label className="flex items-center gap-2 self-end text-xs text-ink-2">
              Sort by
              <select className="h-8 rounded-lg border border-line bg-surface px-2 text-sm text-ink" value={sortKey} onChange={(e) => setSortKey(e.target.value as keyof Metrics)}>
                {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          </div>

          <ul className="flex flex-col gap-2.5">
            {rows.map((r) => {
              const slot = slots.indexOf(r.id);
              const on = slot >= 0 || r.id === BENCH;
              const m = r.metrics;
              const disabled = !on && full;
              return (
                <li key={r.id}>
                  <button
                    onClick={() => toggle(r.id)}
                    aria-pressed={on}
                    className={`w-full rounded-2xl border bg-surface p-3.5 text-left transition active:scale-[0.99] ${disabled ? "opacity-70" : ""}`}
                    style={{ borderColor: slot >= 0 ? SLOTS[slot] : "var(--border)", boxShadow: slot >= 0 ? `inset 0 0 0 1px ${SLOTS[slot]}` : undefined }}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border"
                        style={{ background: on ? colorOf(r.id) : "transparent", borderColor: on ? "transparent" : "var(--text-muted)" }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold leading-snug text-ink">{r.name}</div>
                          <SignalBadge position={r.signal.position} prob={r.signal.prob} />
                        </div>
                        <div className="mt-0.5 line-clamp-1 text-xs text-ink-3">{KIND_SHORT[r.kind]} · {r.description}</div>
                        <dl className="num mt-2.5 grid grid-cols-4 gap-1 text-xs">
                          <Metric label="Return" value={pct(m.totalReturn, 0)} cls={tone(m.totalReturn)} />
                          <Metric label="Sharpe" value={m.sharpe.toFixed(2)} />
                          <Metric label="Max DD" value={pct(m.maxDrawdown, 0)} />
                          <Metric label={m.accuracy != null ? "Hit rate" : "Trades"} value={m.accuracy != null ? pct(m.accuracy) : String(m.trades)} />
                        </dl>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="px-1 text-xs leading-relaxed text-ink-3">
            &ldquo;Signal&rdquo; is each algorithm&apos;s position for the next session. Backtests use adjusted closes and a flat cost per trade; they ignore slippage and taxes.
            A 50–55% daily hit rate is typical for real ML models. Past performance doesn&apos;t predict future results.
          </p>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, cls = "text-ink" }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <dt className="text-ink-3">{label}</dt>
      <dd className={`mt-0.5 text-sm font-semibold ${cls}`}>{value}</dd>
    </div>
  );
}
