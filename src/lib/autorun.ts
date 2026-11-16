// Daily auto-run: once per trading day, a few minutes before the close, rebalance each enabled
// user's algorithm sleeves on the PAPER account. A scheduler (Supabase Cron) calls this every
// few minutes; this module decides whether it's time, and claims the day so it never runs twice.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getClock, isConfigured, type Mode } from "./alpaca";
import { allowedEmails } from "./allowlist";
import type { AutoConfig, AutoStatus } from "./db";
import { buildPlan, cleanAlgoIds, executePlan, type OrderResult, type TradePlan, validateOrderInput } from "./trading";

/** Automation never touches the live account. */
const MODE: Mode = "paper";

export interface AutoRunStore {
  listEnabled(): Promise<AutoConfig[]>;
  userEmail(userId: string): Promise<string | null>;
  /** Atomically mark `day` as claimed. Returns false if this user's run for `day` was already claimed. */
  claim(userId: string, day: string, at: string): Promise<boolean>;
  setStatus(userId: string, patch: Partial<Pick<AutoConfig, "last_status" | "last_message" | "last_run_on">>): Promise<void>;
  recordRun(userId: string, plan: TradePlan, results: OrderResult[]): Promise<void>;
}

export interface AutoRunResult {
  userId: string;
  status: AutoStatus | "waiting" | "already-ran" | "dry-run";
  message: string;
  plan?: TradePlan;
}

export interface AutoRunSummary {
  at: string;
  tradingDay: string;
  marketOpen: boolean;
  minutesToClose: number | null;
  results: AutoRunResult[];
  note?: string;
}

/** Missing keys or setup, as opposed to a failed run. */
export class AutoRunConfigError extends Error {}

/** Calendar date in New York, which is what "trading day" means for US equities. */
export function nyDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function describePlan(p: TradePlan, results?: OrderResult[]): string {
  const orders = p.plan.filter((r) => r.side);
  if (!orders.length) return `No changes needed (${p.symbol} ${p.price.toFixed(2)})`;
  if (!results) return `${orders.length} order(s) to place: ${orders.map((o) => `${o.name} ${o.side} ${Math.abs(o.delta)}`).join(", ")}`;
  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  return `${ok} order(s) placed${failed ? `, ${failed} failed: ${results.filter((r) => !r.ok).map((r) => `${r.algo}: ${r.error}`).join("; ")}` : ""}`;
}

export async function runAutoTrades(opts: { store: AutoRunStore; dryRun?: boolean }): Promise<AutoRunSummary> {
  const { store, dryRun = false } = opts;
  if (!isConfigured(MODE)) throw new AutoRunConfigError("Alpaca paper keys are not set (ALPACA_PAPER_KEY_ID / ALPACA_PAPER_SECRET_KEY)");

  const clock = await getClock(MODE);
  const now = new Date(clock.timestamp);
  const minutesToClose = clock.is_open ? (new Date(clock.next_close).getTime() - now.getTime()) / 60_000 : null;
  const summary: AutoRunSummary = {
    at: now.toISOString(),
    tradingDay: nyDate(now),
    marketOpen: clock.is_open,
    minutesToClose: minutesToClose == null ? null : Math.round(minutesToClose * 10) / 10,
    results: [],
  };
  if (!clock.is_open && !dryRun) return { ...summary, note: "Market is closed" };

  const allow = allowedEmails();
  for (const cfg of await store.listEnabled()) {
    const userId = cfg.user_id;
    const push = (status: AutoRunResult["status"], message: string, plan?: TradePlan) => summary.results.push({ userId, status, message, plan });

    if (!dryRun) {
      if (cfg.last_run_on === summary.tradingDay) { push("already-ran", "Already ran today"); continue; }
      // Run once we're inside the window; ignore the final half-minute to avoid racing the close.
      if (minutesToClose == null || minutesToClose > cfg.minutes_before_close || minutesToClose < 0.5) {
        push("waiting", `Runs ${cfg.minutes_before_close} min before the close (${Math.round(minutesToClose ?? 0)} min to go)`);
        continue;
      }
    }

    const email = await store.userEmail(userId);
    if (!email || !allow.includes(email)) {
      const message = `${email ?? "This user"} is not in ALLOWED_EMAILS`;
      if (!dryRun) await store.setStatus(userId, { last_status: "skipped", last_message: message });
      push("skipped", message);
      continue;
    }
    const ids = cleanAlgoIds(cfg.algo_ids);
    const invalid = validateOrderInput(cfg.symbol, Number(cfg.budget_per_algo), ids);
    if (invalid) {
      if (!dryRun) await store.setStatus(userId, { last_status: "skipped", last_message: invalid });
      push("skipped", invalid);
      continue;
    }

    if (dryRun) {
      const plan = await buildPlan(MODE, cfg.symbol, Number(cfg.budget_per_algo), ids);
      push("dry-run", describePlan(plan), plan);
      continue;
    }

    if (!(await store.claim(userId, summary.tradingDay, summary.at))) { push("already-ran", "Another trigger already claimed today"); continue; }

    let plan: TradePlan;
    try {
      plan = await buildPlan(MODE, cfg.symbol, Number(cfg.budget_per_algo), ids);
    } catch (e) {
      // Nothing was ordered, so release the claim and let the next trigger in the window retry.
      const message = `Could not compute signals: ${(e as Error).message}`;
      await store.setStatus(userId, { last_run_on: cfg.last_run_on, last_status: "error", last_message: message });
      push("error", message);
      continue;
    }

    const results = await executePlan(plan);
    const ok = results.filter((r) => r.ok).length;
    const status: AutoStatus = results.length === ok ? "ok" : ok > 0 ? "partial" : "error";
    const message = describePlan(plan, results);
    await store.recordRun(userId, plan, results);
    await store.setStatus(userId, { last_status: status, last_message: message });
    push(status, message, plan);
  }
  return summary;
}

/** Supabase-backed store (service-role client: reads every user's config, writes their runs). */
export function supabaseStore(db: SupabaseClient): AutoRunStore {
  const fail = (where: string, message: string) => new Error(`Supabase ${where}: ${message}`);
  return {
    async listEnabled() {
      const { data, error } = await db.from("auto_trade_configs").select("*").eq("enabled", true);
      if (error) throw fail("listEnabled", error.message);
      return (data ?? []).map((r) => ({ ...r, budget_per_algo: Number(r.budget_per_algo) }));
    },
    async userEmail(userId) {
      const { data, error } = await db.auth.admin.getUserById(userId);
      if (error) return null;
      return data.user?.email?.toLowerCase() ?? null;
    },
    async claim(userId, day, at) {
      // Conditional update = compare-and-set, so overlapping triggers can't both run.
      const { data, error } = await db
        .from("auto_trade_configs")
        .update({ last_run_on: day, last_run_at: at, last_status: "running", last_message: null })
        .eq("user_id", userId)
        .eq("enabled", true)
        .or(`last_run_on.is.null,last_run_on.lt.${day}`)
        .select("user_id");
      if (error) throw fail("claim", error.message);
      return (data?.length ?? 0) > 0;
    },
    async setStatus(userId, patch) {
      const { error } = await db.from("auto_trade_configs").update(patch).eq("user_id", userId);
      if (error) console.warn(`[auto-run] setStatus: ${error.message}`);
    },
    async recordRun(userId, plan, results) {
      const { error } = await db.from("trade_runs").insert({
        user_id: userId, // explicit: the service role has no auth.uid()
        source: "auto",
        mode: plan.mode,
        symbol: plan.symbol,
        price: plan.price,
        as_of: plan.asOf,
        budget_per_algo: plan.budget,
        orders_placed: results.filter((r) => r.ok).length,
        plan: plan.plan,
        results,
      });
      if (error) console.warn(`[auto-run] recordRun: ${error.message}`);
    },
  };
}
