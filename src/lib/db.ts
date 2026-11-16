// Persistence in Supabase. Every helper is a no-op when `db` is null (dev mode without Supabase).
// Row-level security restricts each user to their own rows; user_id defaults to auth.uid().
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BacktestResult } from "./backtest";
import type { Mode } from "./alpaca";

export interface TradeSettings {
  symbol: string;
  budget_per_algo: number;
  algo_ids: string[];
}

export interface TradeRunRow {
  id: string;
  source: "manual" | "auto";
  mode: Mode;
  symbol: string;
  price: number;
  as_of: string;
  budget_per_algo: number;
  orders_placed: number;
  plan: { algo: string; name: string; side: "buy" | "sell" | null; delta: number }[];
  results: { algo: string; ok: boolean; error?: string }[];
  created_at: string;
}

export interface BacktestRow {
  id: string;
  ticker: string;
  start_date: string;
  cost_bps: number;
  period_start: string;
  period_end: string;
  created_at: string;
  summary: { id: string; name: string; kind: string; metrics: { sharpe: number; totalReturn: number } }[];
}

function warn(where: string, error: { message: string } | null) {
  if (error) console.warn(`[supabase] ${where}: ${error.message}`);
}

export async function getSettings(db: SupabaseClient | null): Promise<TradeSettings | null> {
  if (!db) return null;
  const { data, error } = await db.from("trade_settings").select("symbol, budget_per_algo, algo_ids").maybeSingle();
  warn("getSettings", error);
  return data ? { ...data, budget_per_algo: Number(data.budget_per_algo) } : null;
}

export async function saveSettings(db: SupabaseClient | null, userId: string | null, s: TradeSettings) {
  if (!db || !userId) return;
  const { error } = await db.from("trade_settings").upsert({ user_id: userId, ...s, updated_at: new Date().toISOString() });
  warn("saveSettings", error);
}

export async function recordRun(db: SupabaseClient | null, run: Omit<TradeRunRow, "id" | "created_at">) {
  if (!db) return;
  const { error } = await db.from("trade_runs").insert(run);
  warn("recordRun", error);
}

export async function listRuns(db: SupabaseClient | null, mode: Mode, limit = 20): Promise<TradeRunRow[]> {
  if (!db) return [];
  const { data, error } = await db
    .from("trade_runs").select("*").eq("mode", mode).order("created_at", { ascending: false }).limit(limit);
  warn("listRuns", error);
  return (data as TradeRunRow[]) ?? [];
}

export async function saveBacktest(db: SupabaseClient | null, bt: BacktestResult, start: string, costBps: number) {
  if (!db) return;
  const { error } = await db.from("backtests").insert({
    ticker: bt.ticker,
    start_date: start,
    cost_bps: costBps,
    period_start: bt.dates[0],
    period_end: bt.dates[bt.dates.length - 1],
    summary: bt.results.map(({ id, name, kind, metrics, signal }) => ({ id, name, kind, metrics, signal })),
  });
  warn("saveBacktest", error);
}

export async function listBacktests(db: SupabaseClient | null, limit = 10): Promise<BacktestRow[]> {
  if (!db) return [];
  const { data, error } = await db
    .from("backtests")
    .select("id, ticker, start_date, cost_bps, period_start, period_end, created_at, summary")
    .order("created_at", { ascending: false })
    .limit(limit);
  warn("listBacktests", error);
  return (data as BacktestRow[]) ?? [];
}

// ---------------------------------------------------------------- daily auto-run (paper only)

export type AutoStatus = "running" | "ok" | "partial" | "error" | "skipped";

export interface AutoConfig {
  user_id: string;
  enabled: boolean;
  symbol: string;
  budget_per_algo: number;
  algo_ids: string[];
  minutes_before_close: number;
  last_run_on: string | null; // trading day (New York date) of the last claimed run
  last_run_at: string | null;
  last_status: AutoStatus | null;
  last_message: string | null;
}

export type AutoConfigInput = Pick<AutoConfig, "enabled" | "symbol" | "budget_per_algo" | "algo_ids" | "minutes_before_close">;

export async function getAutoConfig(db: SupabaseClient | null): Promise<AutoConfig | null> {
  if (!db) return null;
  const { data, error } = await db.from("auto_trade_configs").select("*").maybeSingle();
  warn("getAutoConfig", error);
  return data ? { ...data, budget_per_algo: Number(data.budget_per_algo) } : null;
}

export async function saveAutoConfig(db: SupabaseClient, userId: string, cfg: AutoConfigInput): Promise<AutoConfig> {
  const { data, error } = await db
    .from("auto_trade_configs")
    .upsert({ user_id: userId, ...cfg, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return { ...data, budget_per_algo: Number(data.budget_per_algo) };
}
