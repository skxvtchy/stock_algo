import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { AutoRunConfigError, runAutoTrades, supabaseStore } from "@/lib/autorun";
import { getAdminClient } from "@/lib/supabase/admin";

// Called by Supabase Cron (pg_net) every few minutes on weekday afternoons.
// Auth: "Authorization: Bearer <CRON_SECRET>". The proxy lets /api/cron/* through without a session.
export const maxDuration = 60;

function authorized(req: Request, secret: string) {
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

async function handle(req: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (!authorized(req, secret)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminClient();
  if (!db) return Response.json({ error: "SUPABASE_SECRET_KEY (and NEXT_PUBLIC_SUPABASE_URL) must be set" }, { status: 503 });
  try {
    return Response.json(await runAutoTrades({ store: supabaseStore(db) }));
  } catch (e) {
    console.error("[auto-run]", e);
    return Response.json({ error: (e as Error).message }, { status: e instanceof AutoRunConfigError ? 503 : 500 });
  }
}

export const GET = handle;
export const POST = handle;
