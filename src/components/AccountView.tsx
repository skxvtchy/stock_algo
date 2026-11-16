"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AlgoHolding, AlpacaAccount, AlpacaOrder, AlpacaPosition, Mode, PortfolioHistory } from "@/lib/alpaca";
import type { TradeRunRow } from "@/lib/db";
import { pct, signed, tone, usd } from "@/lib/format";
import { RefreshIcon } from "./icons";
import { Card, ErrorNote, Segmented, Stat } from "./ui";

interface AccountResponse {
  mode: Mode;
  configured: boolean;
  liveTradingEnabled: boolean;
  error?: string;
  account?: AlpacaAccount;
  positions?: AlpacaPosition[];
  orders?: (AlpacaOrder & { algo: string | null })[];
  book?: (AlgoHolding & { price: number; marketValue: number; unrealizedPL: number })[];
  history?: PortfolioHistory;
}

type View = "algos" | "positions" | "orders" | "runs";
const REFRESH_MS = 15_000;

export default function AccountView({ mode, refreshKey }: { mode: Mode; refreshKey: number }) {
  const [data, setData] = useState<AccountResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<TradeRunRow[]>([]);
  const [view, setView] = useState<View>("algos");
  const [algoFilter, setAlgoFilter] = useState("all");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [tick, setTick] = useState(0); // manual refresh

  // Poll the account every 15s while this tab is open (the component remounts per mode).
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/account?mode=${mode}`);
        const j = await res.json();
        if (!alive) return;
        if (!res.ok && j.configured === undefined) {
          setFetchError(j.error ?? `Request failed (${res.status})`);
        } else {
          setData(j);
          setFetchError(null);
        }
        setUpdated(new Date());
      } catch (e) {
        if (alive) setFetchError((e as Error).message);
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(id); };
  }, [mode, refreshKey, tick]);

  useEffect(() => {
    let alive = true;
    fetch("/api/strategies").then(async (r) => {
      if (alive && r.ok) setNames(Object.fromEntries((await r.json()).map((s: { id: string; name: string }) => [s.id, s.name])));
    });
    fetch(`/api/runs?mode=${mode}`).then(async (r) => { if (alive && r.ok) setRuns(await r.json()); });
    return () => { alive = false; };
  }, [mode, refreshKey]);

  const history = useMemo(() => {
    const h = data?.history;
    if (!h?.timestamp) return [];
    return h.timestamp
      .map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), equity: h.equity[i] }))
      .filter((r) => r.equity != null && r.equity > 0);
  }, [data]);

  const nameOf = (id: string | null) => (id ? names[id] ?? id : "Manual");

  if (fetchError && !data) return <ErrorNote>{fetchError}</ErrorNote>;
  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-[86px] animate-pulse rounded-2xl bg-surface" />)}</div>
        <div className="h-56 animate-pulse rounded-2xl bg-surface" />
      </div>
    );
  }

  if (!data.configured) {
    const P = mode.toUpperCase();
    return (
      <Card title={`Connect your ${mode} Alpaca account`}>
        <ol className="list-decimal space-y-2.5 pl-5 text-sm text-ink-2">
          <li>Sign in at alpaca.markets and open your <b className="text-ink">{mode === "paper" ? "Paper" : "Live"}</b> account.</li>
          <li>Generate API keys (Home → API Keys).</li>
          <li>
            Add them to <code className="rounded bg-background px-1">.env.local</code>:
            <pre className="mt-2 overflow-x-auto rounded-xl bg-background p-3 text-xs text-ink">{`ALPACA_${P}_KEY_ID=...\nALPACA_${P}_SECRET_KEY=...${mode === "live" ? "\n# Only to allow real-money orders:\n# ALPACA_LIVE_TRADING_ENABLED=true" : ""}`}</pre>
          </li>
          <li>Restart the dev server.</li>
        </ol>
      </Card>
    );
  }

  if (data.error) return <ErrorNote>{data.error}</ErrorNote>;
  const a = data.account!;
  const dayPL = Number(a.equity) - Number(a.last_equity);
  const book = [...(data.book ?? [])].sort((x, y) => y.unrealizedPL + y.realizedPL - (x.unrealizedPL + x.realizedPL));
  const algoPL = book.reduce((s, h) => s + h.unrealizedPL + h.realizedPL, 0);
  const algos = [...new Set((data.orders ?? []).map((o) => o.algo).filter(Boolean))] as string[];
  const orders = (data.orders ?? []).filter((o) => algoFilter === "all" || (algoFilter === "manual" ? !o.algo : o.algo === algoFilter));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-ink-3">
        <span className="truncate">
          ••{a.account_number.slice(-4)} · {a.status.toLowerCase()}
          {mode === "live" && !data.liveTradingEnabled && " · view only"}
        </span>
        <button onClick={() => setTick((t) => t + 1)} className="flex h-8 items-center gap-1.5 rounded-full px-2 text-ink-2 active:bg-surface" aria-label="Refresh">
          <RefreshIcon className="h-3.5 w-3.5" />
          {updated ? updated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }) : ""}
        </button>
      </div>
      {fetchError && <ErrorNote>{fetchError}</ErrorNote>}

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Equity" value={usd(a.equity, 0)} sub={`${signed(dayPL, (n) => usd(n, 0))} (${pct(dayPL / Number(a.last_equity), 2)}) today`} subClass={tone(dayPL)} />
        <Stat label="Algo P&L" value={signed(algoPL, (n) => usd(n, 0))} sub={`${book.filter((h) => h.qty > 0).length} sleeves holding`} />
        <Stat label="Cash" value={usd(a.cash, 0)} />
        <Stat label="Buying power" value={usd(a.buying_power, 0)} />
      </div>

      {history.length > 1 && (
        <Card title="Equity" sub="Last 3 months">
          <div className="-ml-2 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={40} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={false} width={52} domain={["auto", "auto"]} tickFormatter={(v: number) => (v >= 1e4 ? `$${Math.round(v / 1e3)}k` : usd(v, 0))} />
                <Tooltip
                  contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: "var(--text-secondary)" }}
                  itemStyle={{ color: "var(--text-primary)" }}
                  formatter={(v) => [usd(Number(v)), "Equity"]}
                />
                <Area dataKey="equity" stroke="var(--series-1)" strokeWidth={2} fill="url(#eqFill)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Segmented<View>
        value={view}
        onChange={setView}
        options={[
          { value: "algos", label: "Algos" },
          { value: "positions", label: "Positions" },
          { value: "orders", label: "Orders" },
          { value: "runs", label: "Runs" },
        ]}
      />

      {view === "algos" && (
        book.length ? (
          <ul className="flex flex-col gap-2.5">
            {book.map((h) => {
              const pl = h.unrealizedPL + h.realizedPL;
              return (
                <li key={`${h.algo}|${h.symbol}`}>
                  <button onClick={() => { setAlgoFilter(h.algo); setView("orders"); }} className="w-full rounded-2xl border border-line bg-surface p-3.5 text-left active:scale-[0.99]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-ink">{nameOf(h.algo)}</div>
                        <div className="text-xs text-ink-3">{h.symbol} · {h.orders} order{h.orders === 1 ? "" : "s"}{h.pendingQty ? ` · ${signed(h.pendingQty, String)} pending` : ""}</div>
                      </div>
                      <div className={`num text-right text-base font-semibold ${tone(pl)}`}>{signed(pl, (n) => usd(n))}</div>
                    </div>
                    <dl className="num mt-2.5 grid grid-cols-3 gap-1 text-xs">
                      <div><dt className="text-ink-3">Shares</dt><dd className="mt-0.5 text-sm font-semibold text-ink">{h.qty}</dd></div>
                      <div><dt className="text-ink-3">Avg cost</dt><dd className="mt-0.5 text-sm font-semibold text-ink">{h.qty ? usd(h.avgCost) : "—"}</dd></div>
                      <div><dt className="text-ink-3">Value</dt><dd className="mt-0.5 text-sm font-semibold text-ink">{usd(h.marketValue, 0)}</dd></div>
                    </dl>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <Card><p className="text-sm text-ink-2">No algorithm trades yet. Open the Trade tab, preview, and place your first {mode} orders.</p></Card>
        )
      )}

      {view === "positions" && (
        <Card>
          {data.positions?.length ? (
            <ul className="-mx-1 divide-y divide-line/70">
              {data.positions.map((p) => (
                <li key={p.symbol} className="flex items-center justify-between px-1 py-2.5">
                  <div>
                    <div className="font-semibold text-ink">{p.symbol}</div>
                    <div className="num text-xs text-ink-3">{p.qty} sh · avg {usd(p.avg_entry_price)}</div>
                  </div>
                  <div className="num text-right">
                    <div className="text-sm font-semibold text-ink">{usd(p.market_value, 0)}</div>
                    <div className={`text-xs ${tone(Number(p.unrealized_pl))}`}>{signed(Number(p.unrealized_pl), (n) => usd(n))} · {pct(Number(p.unrealized_plpc), 2)}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-2">No open positions.</p>}
        </Card>
      )}

      {view === "orders" && (
        <Card
          right={
            <select className="h-8 max-w-44 rounded-lg border border-line bg-surface px-2 text-sm text-ink" value={algoFilter} onChange={(e) => setAlgoFilter(e.target.value)}>
              <option value="all">All orders</option>
              {algos.map((x) => <option key={x} value={x}>{nameOf(x)}</option>)}
              <option value="manual">Manual</option>
            </select>
          }
          title={`${orders.length} order${orders.length === 1 ? "" : "s"}`}
        >
          {orders.length ? (
            <ul className="-mx-1 divide-y divide-line/70">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-1 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">
                      <span className={o.side === "buy" ? "text-good" : "text-bad"}>{o.side === "buy" ? "Buy" : "Sell"}</span>{" "}
                      <span className="num text-ink">{o.qty} {o.symbol}</span>
                    </div>
                    <div className="truncate text-xs text-ink-3">{nameOf(o.algo)} · {new Date(o.submitted_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                  </div>
                  <div className="num shrink-0 text-right text-xs">
                    <div className="text-sm font-medium text-ink">{o.filled_avg_price ? usd(o.filled_avg_price) : "—"}</div>
                    <div className="text-ink-3">{o.status.replace(/_/g, " ")}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-2">No orders.</p>}
        </Card>
      )}

      {view === "runs" && (
        <Card title="Runs from this app" sub="Saved in Supabase">
          {runs.length ? (
            <ul className="-mx-1 divide-y divide-line/70">
              {runs.map((r) => (
                <li key={r.id} className="px-1 py-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-ink">
                      {r.symbol} · {r.orders_placed} order{r.orders_placed === 1 ? "" : "s"}
                      {r.source === "auto" && <span className="ml-1.5 rounded bg-paper/10 px-1.5 py-0.5 text-[11px] font-semibold text-paper">Auto</span>}
                    </span>
                    <span className="num text-xs text-ink-3">{new Date(r.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.plan.filter((p) => p.side).map((p) => (
                      <span key={p.algo} className={`num rounded-md px-1.5 py-0.5 text-[11px] font-medium ${p.side === "buy" ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>
                        {p.name}: {p.side === "buy" ? "+" : ""}{p.delta}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-2">No runs yet.</p>}
        </Card>
      )}
    </div>
  );
}
