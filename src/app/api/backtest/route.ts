import { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { runBacktest } from "@/lib/backtest";
import { fetchBars } from "@/lib/data";
import { saveBacktest } from "@/lib/db";

export async function GET(req: NextRequest) {
  const g = await guard("user");
  if (!g.ok) return g.res;

  const p = req.nextUrl.searchParams;
  const ticker = (p.get("ticker") || "SPY").toUpperCase().trim();
  const start = p.get("start") || "2012-01-01";
  const cost = Math.max(0, Math.min(500, Number(p.get("cost") ?? 5) || 0));
  if (!/^[A-Z0-9.\-^=]{1,15}$/.test(ticker)) return Response.json({ error: "Invalid ticker" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return Response.json({ error: "Invalid start date" }, { status: 400 });

  try {
    const bars = await fetchBars(ticker, start);
    if (bars.length < 800) {
      return Response.json(
        { error: `Only ${bars.length} trading days for ${ticker}; need ~800+ (pick an earlier start date).` },
        { status: 400 },
      );
    }
    const result = runBacktest(ticker, bars, cost);
    await saveBacktest(g.db, result, start, cost);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: `Failed to load ${ticker}: ${(e as Error).message}` }, { status: 500 });
  }
}
