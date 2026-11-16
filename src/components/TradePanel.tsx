"use client";

import { useEffect, useMemo, useState } from "react";
import type { Mode } from "@/lib/alpaca";
import type { TradeRunRow, TradeSettings } from "@/lib/db";
import { usd } from "@/lib/format";
import { Button, Card, Chip, ErrorNote, Field, inputCls, KIND_LABEL, Sheet, SignalBadge } from "./ui";

interface StrategyInfo { id: string; name: string; kind: string; description: string }
interface PlanRow {
  algo: string; name: string; position: number; prob?: number;
  held: number; pending: number; target: number; delta: number; side: "buy" | "sell" | null;
}
interface TradeResponse {
  mode: Mode; symbol: string; price: number; asOf: string; plan: PlanRow[]; executed: boolean;
  results: { algo: string; ok: boolean; orderId?: string; status?: string; error?: string }[];
}

const GROUPS = ["trend", "mean-reversion", "ml", "baseline"];

export default function TradePanel({ mode, onExecuted }: { mode: Mode; onExecuted: () => void }) {
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [symbol, setSymbol] = useState("SPY");
  const [budget, setBudget] = useState(1000);
  const [runs, setRuns] = useState<TradeRunRow[]>([]);
  // Responses and confirmations are tied to the exact settings they were computed for.
  const [resp, setResp] = useState<(TradeResponse & { sig: string }) | null>(null);
  const [confirmSig, setConfirmSig] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState<"preview" | "execute" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sig = useMemo(() => JSON.stringify([mode, symbol, budget, [...selected].sort()]), [mode, symbol, budget, selected]);
  const current = resp?.sig === sig ? resp : null;
  const confirming = confirmSig === sig && !!current;

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/api/strategies").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/settings").then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/runs?mode=${mode}`).then((r) => (r.ok ? r.json() : [])),
    ]).then(([s, saved, r]: [StrategyInfo[], TradeSettings | null, TradeRunRow[]]) => {
      if (!alive) return;
      setStrategies(s);
      setRuns(r);
      if (saved?.algo_ids?.length) {
        setSelected(new Set(saved.algo_ids));
        setSymbol(saved.symbol);
        setBudget(saved.budget_per_algo);
      } else {
        setSelected(new Set(s.filter((x) => x.id !== "buy-hold").map((x) => x.id)));
      }
    });
    return () => { alive = false; };
  }, [mode]);

  async function call(execute: boolean) {
    setBusy(execute ? "execute" : "preview");
    setError(null);
    const sentSig = sig;
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, symbol, budgetPerAlgo: budget, algoIds: [...selected], execute, confirmLive: confirmText }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setResp({ ...j, sig: sentSig });
      if (execute) {
        setConfirmSig(null);
        setConfirmText("");
        onExecuted();
        fetch(`/api/runs?mode=${mode}`).then(async (r) => r.ok && setRuns(await r.json()));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const toggle = (ids: string[], on: boolean) =>
    setSelected((sel) => {
      const n = new Set(sel);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });

  const orders = current?.plan.filter((p) => p.side) ?? [];
  const live = mode === "live";
  const canPlace = !!current && !current.executed && orders.length > 0;
  const net = current ? orders.reduce((s, o) => s + o.delta * current.price, 0) : 0;

  return (
    <div className="flex flex-col gap-4">
      <Card title="Order settings">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Symbol">
            <input className={`${inputCls} uppercase`} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
          </Field>
          <Field label="Budget per algorithm">
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3">$</span>
              <input type="number" inputMode="decimal" min={1} className={`${inputCls} pl-6`} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
            </div>
          </Field>
        </div>
        <p className="mt-3 text-xs text-ink-3">
          Up to <span className="num font-semibold text-ink">{usd(budget * selected.size, 0)}</span> across {selected.size} algorithms. Each one holds
          ⌊budget × signal ÷ price⌋ shares in its own sleeve. Orders are tagged per algorithm so the Account tab shows each one&apos;s trades and P&amp;L.
        </p>
      </Card>

      <Card title="Algorithms" sub={`${selected.size} of ${strategies.length} selected`}>
        <div className="flex flex-col gap-4">
          {GROUPS.map((g) => {
            const items = strategies.filter((s) => s.kind === g);
            if (!items.length) return null;
            const allOn = items.every((s) => selected.has(s.id));
            return (
              <div key={g}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-wide text-ink-2 uppercase">{KIND_LABEL[g]}</span>
                  <button className="text-xs font-semibold text-paper" onClick={() => toggle(items.map((s) => s.id), !allOn)}>
                    {allOn ? "None" : "All"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {items.map((s) => (
                    <Chip key={s.id} active={selected.has(s.id)} onClick={() => toggle([s.id], !selected.has(s.id))}>
                      {s.name}
                    </Chip>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {error && <ErrorNote>{error}</ErrorNote>}

      {current && (
        <Card
          title={current.executed ? "Orders submitted" : "Preview"}
          sub={`${current.symbol} ${usd(current.price)} · close ${current.asOf}${current.executed ? "" : ` · ${orders.length} order${orders.length === 1 ? "" : "s"} to place`}`}
        >
          <ul className="-mx-1 divide-y divide-line/70">
            {current.plan.map((p) => {
              const r = current.results.find((x) => x.algo === p.algo);
              return (
                <li key={p.algo} className="flex items-center gap-3 px-1 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{p.name}</div>
                    <div className="num mt-0.5 flex items-center gap-2 text-xs text-ink-3">
                      <SignalBadge position={p.position} prob={p.prob} />
                      <span>{p.held}{p.pending ? ` (+${p.pending})` : ""} → {p.target} sh</span>
                    </div>
                  </div>
                  <div className="num text-right text-sm font-semibold">
                    {p.side ? (
                      <span className={p.side === "buy" ? "text-good" : "text-bad"}>{p.side === "buy" ? "Buy" : "Sell"} {Math.abs(p.delta)}</span>
                    ) : (
                      <span className="text-ink-3">Hold</span>
                    )}
                    {r && <div className={`text-xs font-normal ${r.ok ? "text-good" : "text-bad"}`}>{r.ok ? `✓ ${r.status}` : "✕ failed"}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
          {current.results.filter((r) => !r.ok).map((r) => (
            <div key={r.algo} className="mt-2"><ErrorNote>{r.algo}: {r.error}</ErrorNote></div>
          ))}
          {!current.executed && orders.length === 0 && <p className="mt-2 text-sm text-ink-2">Every sleeve is already at its target. Nothing to trade.</p>}
        </Card>
      )}

      <Card title="Recent runs" sub={`${live ? "Live" : "Paper"} account`}>
        {runs.length ? (
          <ul className="-mx-1 divide-y divide-line/70">
            {runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-1 py-2.5 text-sm">
                <div>
                  <div className="font-medium text-ink">{r.symbol} · {r.orders_placed} order{r.orders_placed === 1 ? "" : "s"}</div>
                  <div className="text-xs text-ink-3">{new Date(r.created_at).toLocaleString()} · {usd(r.budget_per_algo, 0)}/algo</div>
                </div>
                <div className="num text-right text-xs text-ink-2">
                  {r.plan.filter((p) => p.side === "buy").length} buy · {r.plan.filter((p) => p.side === "sell").length} sell
                  {r.results.some((x) => !x.ok) && <div className="text-bad">{r.results.filter((x) => !x.ok).length} failed</div>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">No runs yet. Runs you execute are saved to Supabase.</p>
        )}
      </Card>

      {/* Spacer so the sticky action bar never covers content. */}
      <div className="h-16" />
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+3.5rem)] z-20 border-t border-line bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl gap-2 px-4 py-2.5">
          <Button variant="ghost" className="flex-1" onClick={() => call(false)} disabled={!!busy || selected.size === 0 || !symbol}>
            {busy === "preview" ? "Computing…" : current && !current.executed ? "Refresh" : "Preview"}
          </Button>
          <Button variant={live ? "danger" : "primary"} className="flex-[1.4]" onClick={() => setConfirmSig(sig)} disabled={!!busy || !canPlace}>
            {canPlace ? `Place ${orders.length} ${live ? "live" : "paper"} order${orders.length === 1 ? "" : "s"}` : "Place orders"}
          </Button>
        </div>
      </div>

      <Sheet open={confirming} onClose={() => { setConfirmSig(null); setConfirmText(""); }} title={live ? "Place LIVE orders?" : "Place paper orders?"}>
        {current && (
          <div className="flex flex-col gap-4">
            <div className={`rounded-xl px-3 py-2.5 text-sm ${live ? "bg-live/10 text-live" : "bg-paper/10 text-paper"}`}>
              {live ? "Real money. These orders go to your live Alpaca account." : "Simulated money on your Alpaca paper account."}
            </div>
            <dl className="num grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-ink-2">Orders</dt><dd className="text-right font-semibold text-ink">{orders.length} market · {current.symbol}</dd>
              <dt className="text-ink-2">Buys / sells</dt>
              <dd className="text-right font-semibold text-ink">
                {orders.filter((o) => o.side === "buy").reduce((s, o) => s + o.delta, 0)} / {orders.filter((o) => o.side === "sell").reduce((s, o) => s - o.delta, 0)} sh
              </dd>
              <dt className="text-ink-2">Estimated net</dt><dd className="text-right font-semibold text-ink">{usd(net, 0)} at ~{usd(current.price)}</dd>
            </dl>
            <p className="text-xs text-ink-3">Market orders fill at the next available price. If the market is closed they queue for the next open.</p>
            {live && (
              <Field label="Type LIVE to confirm">
                <input className={inputCls} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoCapitalize="characters" autoCorrect="off" />
              </Field>
            )}
            <Button variant={live ? "danger" : "primary"} className="w-full" onClick={() => call(true)} disabled={!!busy || (live && confirmText !== "LIVE")}>
              {busy === "execute" ? "Submitting…" : `Confirm ${orders.length} order${orders.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
