import {
  algoBook, getOrders, isConfigured, liveTradingEnabled, type Mode, ORDER_PREFIX, submitMarketOrder,
} from "@/lib/alpaca";
import { guard } from "@/lib/auth";
import { currentSignals } from "@/lib/backtest";
import { fetchBars } from "@/lib/data";
import { recordRun, saveSettings } from "@/lib/db";
import { STRATEGIES } from "@/lib/strategies";

interface TradeRequest {
  mode: Mode;
  symbol: string;
  budgetPerAlgo: number; // dollars allocated to each algorithm's sleeve
  algoIds: string[];
  execute: boolean; // false = preview only
  confirmLive?: string; // must equal "LIVE" to execute in live mode
}

/**
 * Rebalance each selected algorithm's sleeve in `symbol` to its current signal:
 *   target shares = floor(budget × position / price)
 *   order = target − (filled shares held by that algo + its open orders)
 * Each algo gets its own tagged order so trades stay attributable.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as TradeRequest;
  const mode: Mode = body.mode === "live" ? "live" : "paper";
  const symbol = String(body.symbol || "").toUpperCase().trim();
  const budget = Number(body.budgetPerAlgo);
  const ids = (body.algoIds || []).filter((id) => STRATEGIES.some((s) => s.id === id));

  if (!/^[A-Z.]{1,10}$/.test(symbol)) return Response.json({ error: "Invalid symbol" }, { status: 400 });
  if (!(budget > 0 && budget <= 1_000_000)) return Response.json({ error: "Budget must be between $1 and $1,000,000" }, { status: 400 });
  if (ids.length === 0) return Response.json({ error: "Select at least one algorithm" }, { status: 400 });
  // Live orders need a real, allowlisted Supabase login; previews and paper orders need "trader".
  const g = await guard(body.execute && mode === "live" ? "live-trader" : "trader");
  if (!g.ok) return g.res;
  const userId = g.auth.kind === "user" ? g.auth.userId : null;

  if (!isConfigured(mode)) {
    const P = mode.toUpperCase();
    return Response.json(
      { error: `Alpaca ${mode} keys aren't set. Add ALPACA_${P}_KEY_ID and ALPACA_${P}_SECRET_KEY to .env.local and restart.` },
      { status: 400 },
    );
  }

  if (body.execute && mode === "live") {
    if (!liveTradingEnabled()) {
      return Response.json({ error: "Live trading is disabled. Set ALPACA_LIVE_TRADING_ENABLED=true in .env.local to allow it." }, { status: 403 });
    }
    if (body.confirmLive !== "LIVE") {
      return Response.json({ error: "Live orders require typing LIVE to confirm." }, { status: 400 });
    }
  }

  try {
    const [bars, orders] = await Promise.all([fetchBars(symbol, "2012-01-01"), getOrders(mode)]);
    if (bars.length < 800) return Response.json({ error: `Not enough history for ${symbol}` }, { status: 400 });
    const price = bars[bars.length - 1].close;
    const signals = currentSignals(bars, ids);
    const book = algoBook(orders).filter((h) => h.symbol === symbol);

    const plan = signals.map((s) => {
      const h = book.find((b) => b.algo === s.id);
      const held = h?.qty ?? 0;
      const pending = h?.pendingQty ?? 0;
      const target = Math.floor((budget * s.position) / price);
      const delta = target - held - pending;
      return {
        algo: s.id, name: s.name, position: s.position, prob: s.prob,
        held, pending, target, delta,
        side: delta > 0 ? ("buy" as const) : delta < 0 ? ("sell" as const) : null,
      };
    });

    await saveSettings(g.db, userId, { symbol, budget_per_algo: budget, algo_ids: ids });

    const results: { algo: string; ok: boolean; orderId?: string; status?: string; error?: string }[] = [];
    if (body.execute) {
      for (const p of plan) {
        if (!p.side) continue;
        try {
          const o = await submitMarketOrder(mode, {
            symbol, qty: Math.abs(p.delta), side: p.side,
            clientOrderId: `${ORDER_PREFIX}${p.algo}:${symbol}:${Date.now()}`,
          });
          results.push({ algo: p.algo, ok: true, orderId: o.id, status: o.status });
        } catch (e) {
          results.push({ algo: p.algo, ok: false, error: (e as Error).message });
        }
      }
    }
    if (body.execute) {
      await recordRun(g.db, {
        mode, symbol, price, as_of: bars[bars.length - 1].date, budget_per_algo: budget,
        orders_placed: results.filter((r) => r.ok).length, plan, results,
      });
    }
    return Response.json({ mode, symbol, price, asOf: bars[bars.length - 1].date, plan, executed: body.execute, results });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
