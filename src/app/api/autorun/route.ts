import { guard } from "@/lib/auth";
import { getAutoConfig, saveAutoConfig } from "@/lib/db";
import { cleanAlgoIds, validateOrderInput } from "@/lib/trading";

const schedulerStatus = () => ({
  cronSecret: Boolean(process.env.CRON_SECRET),
  serviceKey: Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
});

/** The signed-in user's auto-run settings and last result. */
export async function GET() {
  const g = await guard("user");
  if (!g.ok) return g.res;
  return Response.json({
    supported: g.auth.kind === "user",
    config: await getAutoConfig(g.db),
    scheduler: schedulerStatus(),
  });
}

export async function PUT(req: Request) {
  const g = await guard("trader");
  if (!g.ok) return g.res;
  if (g.auth.kind !== "user") {
    return Response.json({ error: "Auto-run needs Supabase, which stores your schedule. Add your Supabase keys first." }, { status: 400 });
  }
  const body = await req.json();
  const symbol = String(body.symbol || "").toUpperCase().trim();
  const budget = Number(body.budget_per_algo);
  const ids = cleanAlgoIds(body.algo_ids);
  const invalid = validateOrderInput(symbol, budget, ids);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });
  const minutes = Math.round(Number(body.minutes_before_close));
  if (!(minutes >= 5 && minutes <= 60)) return Response.json({ error: "Run time must be 5–60 minutes before the close" }, { status: 400 });

  try {
    const config = await saveAutoConfig(g.auth.db, g.auth.userId, {
      enabled: Boolean(body.enabled), symbol, budget_per_algo: budget, algo_ids: ids, minutes_before_close: minutes,
    });
    return Response.json({ config, scheduler: schedulerStatus() });
  } catch (e) {
    return Response.json({ error: `Could not save: ${(e as Error).message}` }, { status: 500 });
  }
}
