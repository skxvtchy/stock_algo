"use client";

import { useEffect, useState } from "react";
import type { Mode } from "@/lib/alpaca";
import type { AutoConfig } from "@/lib/db";
import { usd } from "@/lib/format";
import { Card, ErrorNote } from "./ui";

interface AutoState {
  supported: boolean;
  config: AutoConfig | null;
  scheduler: { cronSecret: boolean; serviceKey: boolean };
}

const MINUTES = [5, 10, 15, 20, 30, 45, 60];

const STATUS: Record<string, { icon: string; cls: string }> = {
  ok: { icon: "✓", cls: "text-good" },
  partial: { icon: "⚠", cls: "text-bad" },
  error: { icon: "✕", cls: "text-bad" },
  skipped: { icon: "–", cls: "text-ink-2" },
  running: { icon: "…", cls: "text-ink-2" },
};

function Switch({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-8 w-[52px] shrink-0 rounded-full transition disabled:opacity-40 ${on ? "bg-paper" : "bg-line"}`}
    >
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "left-[24px]" : "left-1"}`} />
    </button>
  );
}

/** Daily paper auto-run: on/off, timing, which settings it uses, and the last result. */
export default function AutoRunCard({ mode, symbol, budget, algoIds }: { mode: Mode; symbol: string; budget: number; algoIds: string[] }) {
  const [state, setState] = useState<AutoState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/autorun");
        const j = await r.json().catch(() => ({ error: `Auto-run settings unavailable (HTTP ${r.status})` }));
        if (!alive) return;
        if (r.ok) setState(j);
        else setError(j.error ?? "Could not load auto-run settings");
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (mode === "live") {
    return (
      <Card title="Daily auto-run" sub="Paper account only">
        <p className="text-sm text-ink-2">Auto-run only ever trades your paper account. Switch to Paper to set it up.</p>
      </Card>
    );
  }

  const cfg = state?.config ?? null;
  const sameAlgos = !!cfg && [...cfg.algo_ids].sort().join() === [...algoIds].sort().join();
  const differs = !!cfg && (cfg.symbol !== symbol || cfg.budget_per_algo !== budget || !sameAlgos);
  const ready = !!state && state.scheduler.cronSecret && state.scheduler.serviceKey;

  async function save(change: { enabled?: boolean; minutes?: number; useCurrent?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      const useCurrent = change.useCurrent || !cfg;
      const res = await fetch("/api/autorun", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: change.enabled ?? cfg?.enabled ?? false,
          minutes_before_close: change.minutes ?? cfg?.minutes_before_close ?? 15,
          symbol: useCurrent ? symbol : cfg!.symbol,
          budget_per_algo: useCurrent ? budget : cfg!.budget_per_algo,
          algo_ids: useCurrent ? algoIds : cfg!.algo_ids,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setState((s) => (s ? { ...s, config: j.config, scheduler: j.scheduler } : s));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const last = cfg?.last_status ? STATUS[cfg.last_status] : null;

  return (
    <Card
      title="Daily auto-run"
      sub="Paper account · every trading day"
      right={
        <Switch
          label="Run automatically every trading day"
          on={!!cfg?.enabled}
          disabled={busy || !state?.supported || (!cfg && algoIds.length === 0)}
          onChange={(v) => save({ enabled: v })}
        />
      }
    >
      {!state && !error && <div className="h-10 animate-pulse rounded-xl bg-background" />}

      {state && !state.supported && (
        <p className="text-sm text-ink-2">Auto-run needs Supabase, which stores your schedule. Add your Supabase keys to turn it on.</p>
      )}

      {state?.supported && !cfg && (
        <p className="text-sm text-ink-2">
          Turn on to run the algorithms selected above on your paper account every trading day, a few minutes before the close, even when the app is closed.
        </p>
      )}

      {cfg && (
        <div className="flex flex-col gap-3 text-sm">
          <div className="num text-ink">
            <span className="font-semibold">{cfg.symbol}</span> · {usd(cfg.budget_per_algo, 0)} × {cfg.algo_ids.length} algorithm{cfg.algo_ids.length === 1 ? "" : "s"}
          </div>
          <label className="flex items-center gap-2 text-ink-2">
            Runs
            <select
              className="h-9 rounded-lg border border-line bg-surface px-2 text-base text-ink"
              value={cfg.minutes_before_close}
              disabled={busy}
              onChange={(e) => save({ minutes: Number(e.target.value) })}
            >
              {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            min before the close
          </label>
          {differs && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-background px-3 py-2 text-xs text-ink-2">
              <span>Your settings above differ from the auto-run&apos;s.</span>
              <button className="shrink-0 font-semibold text-paper" disabled={busy || algoIds.length === 0} onClick={() => save({ useCurrent: true })}>
                Use these
              </button>
            </div>
          )}
          <div className="text-xs text-ink-3">
            {cfg.last_run_at ? (
              <>
                Last run {new Date(cfg.last_run_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                {last && <span className={`ml-1 font-semibold ${last.cls}`}>{last.icon} {cfg.last_status}</span>}
                {cfg.last_message && <div className="mt-0.5 text-ink-2">{cfg.last_message}</div>}
              </>
            ) : (
              "Hasn't run yet."
            )}
          </div>
        </div>
      )}

      {state?.supported && !ready && (
        <p className="mt-3 rounded-xl bg-background px-3 py-2 text-xs text-ink-2">
          ⚠ Scheduler not connected yet. Set <code>CRON_SECRET</code> and <code>SUPABASE_SECRET_KEY</code>, deploy, then run{" "}
          <code>supabase/schedule_auto_run.sql</code> (see README → Daily auto-run).
        </p>
      )}
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </Card>
  );
}
