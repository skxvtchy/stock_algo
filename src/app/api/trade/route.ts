import { isConfigured, liveTradingEnabled, type Mode } from "@/lib/alpaca";
import { guard } from "@/lib/auth";
import { recordRun, saveSettings } from "@/lib/db";
import { buildPlan, cleanAlgoIds, executePlan, type OrderResult, TradeInputError, validateOrderInput } from "@/lib/trading";

interface TradeRequest {
  mode: Mode;
  symbol: string;
  budgetPerAlgo: number; // dollars allocated to each algorithm's sleeve
  algoIds: string[];
  execute: boolean; // false = preview only
  confirmLive?: string; // must equal "LIVE" to execute in live mode
}

export async function POST(req: Request) {
  const body = (await req.json()) as TradeRequest;
  const mode: Mode = body.mode === "live" ? "live" : "paper";
  const symbol = String(body.symbol || "").toUpperCase().trim();
  const budget = Number(body.budgetPerAlgo);
  const ids = cleanAlgoIds(body.algoIds);

  const invalid = validateOrderInput(symbol, budget, ids);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });
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
    const plan = await buildPlan(mode, symbol, budget, ids);
    await saveSettings(g.db, userId, { symbol, budget_per_algo: budget, algo_ids: ids });

    let results: OrderResult[] = [];
    if (body.execute) {
      results = await executePlan(plan);
      await recordRun(g.db, {
        source: "manual", mode, symbol, price: plan.price, as_of: plan.asOf, budget_per_algo: budget,
        orders_placed: results.filter((r) => r.ok).length, plan: plan.plan, results,
      });
    }
    return Response.json({ mode, symbol, price: plan.price, asOf: plan.asOf, plan: plan.plan, executed: body.execute, results });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: e instanceof TradeInputError ? 400 : 500 });
  }
}
