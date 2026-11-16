import { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import {
  algoBook, algoOf, getAccount, getHistory, getOrders, getPositions, isConfigured, liveTradingEnabled, type Mode,
} from "@/lib/alpaca";

export async function GET(req: NextRequest) {
  const g = await guard("trader");
  if (!g.ok) return g.res;
  const mode: Mode = req.nextUrl.searchParams.get("mode") === "live" ? "live" : "paper";
  const base = { mode, configured: isConfigured(mode), liveTradingEnabled: liveTradingEnabled() };
  if (!base.configured) return Response.json(base);

  try {
    const [account, positions, orders, history] = await Promise.all([
      getAccount(mode), getPositions(mode), getOrders(mode), getHistory(mode),
    ]);
    const price = new Map(positions.map((p) => [p.symbol, Number(p.current_price)]));
    const book = algoBook(orders).map((h) => {
      const px = price.get(h.symbol) ?? h.avgCost;
      return { ...h, price: px, marketValue: h.qty * px, unrealizedPL: (px - h.avgCost) * h.qty };
    });
    return Response.json({
      ...base,
      account,
      positions,
      orders: orders.slice(0, 200).map((o) => ({ ...o, algo: algoOf(o) })),
      book,
      history,
    });
  } catch (e) {
    return Response.json({ ...base, error: (e as Error).message }, { status: 502 });
  }
}
