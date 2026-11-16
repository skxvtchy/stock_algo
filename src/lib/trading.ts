// Turn algorithm signals into orders. Shared by the Trade tab (/api/trade) and the daily auto-run.
import { algoBook, getAllOrders, type Mode, ORDER_PREFIX, submitMarketOrder } from "./alpaca";
import { currentSignals } from "./backtest";
import { fetchBars } from "./data";
import { STRATEGIES } from "./strategies";

const HISTORY_START = "2012-01-01";

export interface PlanRow {
  algo: string;
  name: string;
  position: number; // target exposure 0..1 from the algorithm
  prob?: number; // ML only: P(up)
  held: number; // filled shares in this algo's sleeve
  pending: number; // signed shares in its open orders
  target: number;
  delta: number;
  side: "buy" | "sell" | null;
}

export interface TradePlan {
  mode: Mode;
  symbol: string;
  budget: number;
  price: number;
  asOf: string; // date of the price bar used
  plan: PlanRow[];
}

export interface OrderResult {
  algo: string;
  ok: boolean;
  orderId?: string;
  status?: string;
  error?: string;
}

/** Bad user input (as opposed to a broker or network failure). */
export class TradeInputError extends Error {}

export function cleanAlgoIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const known = new Set(STRATEGIES.map((s) => s.id));
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && known.has(id)))];
}

export function validateOrderInput(symbol: string, budget: number, ids: string[]): string | null {
  if (!/^[A-Z.]{1,10}$/.test(symbol)) return "Invalid symbol";
  if (!(budget > 0 && budget <= 1_000_000)) return "Budget must be between $1 and $1,000,000";
  if (ids.length === 0) return "Select at least one algorithm";
  return null;
}

/**
 * Rebalance each algorithm's sleeve in `symbol` to its current signal:
 *   target shares = floor(budget × position / price)
 *   order         = target − (filled shares held by that algo + its open orders)
 */
export async function buildPlan(mode: Mode, symbol: string, budget: number, ids: string[]): Promise<TradePlan> {
  const [bars, orders] = await Promise.all([fetchBars(symbol, HISTORY_START, { fresh: true }), getAllOrders(mode)]);
  if (bars.length < 800) throw new TradeInputError(`Not enough price history for ${symbol}`);
  const price = bars[bars.length - 1].close;
  const book = algoBook(orders).filter((h) => h.symbol === symbol);

  const plan = currentSignals(bars, ids).map((s): PlanRow => {
    const h = book.find((b) => b.algo === s.id);
    const held = h?.qty ?? 0;
    const pending = h?.pendingQty ?? 0;
    const target = Math.floor((budget * s.position) / price);
    const delta = target - held - pending;
    return {
      algo: s.id, name: s.name, position: s.position, prob: s.prob,
      held, pending, target, delta,
      side: delta > 0 ? "buy" : delta < 0 ? "sell" : null,
    };
  });
  return { mode, symbol, budget, price, asOf: bars[bars.length - 1].date, plan };
}

/** Submit one tagged market order per algorithm that needs to trade. Never throws per order. */
export async function executePlan(p: TradePlan): Promise<OrderResult[]> {
  const results: OrderResult[] = [];
  for (const row of p.plan) {
    if (!row.side) continue;
    try {
      const o = await submitMarketOrder(p.mode, {
        symbol: p.symbol,
        qty: Math.abs(row.delta),
        side: row.side,
        clientOrderId: `${ORDER_PREFIX}${row.algo}:${p.symbol}:${Date.now()}`,
      });
      results.push({ algo: row.algo, ok: true, orderId: o.id, status: o.status });
    } catch (e) {
      results.push({ algo: row.algo, ok: false, error: (e as Error).message });
    }
  }
  return results;
}
