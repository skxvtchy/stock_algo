import type { SupabaseClient } from "@supabase/supabase-js";
import { allowedEmails } from "./allowlist";
import { devAuthBypass, supabaseConfigured } from "./supabase/config";
import { createClient } from "./supabase/server";

export type AuthState =
  | { kind: "user"; userId: string; email: string; allowed: boolean; db: SupabaseClient }
  | { kind: "dev-bypass" }
  | { kind: "anonymous" }
  | { kind: "unconfigured" };

export { allowedEmails };

export async function getAuth(): Promise<AuthState> {
  if (!supabaseConfigured) return devAuthBypass ? { kind: "dev-bypass" } : { kind: "unconfigured" };
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return { kind: "anonymous" };
  const email = String(claims.email ?? "").toLowerCase();
  return { kind: "user", userId: claims.sub, email, allowed: allowedEmails().includes(email), db };
}

/**
 * - "user": any signed-in user (backtests, history)
 * - "trader": signed-in user listed in ALLOWED_EMAILS (Alpaca account + paper orders)
 * - "live-trader": same as trader, but never allowed through the dev bypass
 */
export type Level = "user" | "trader" | "live-trader";

export async function guard(level: Level): Promise<{ ok: true; auth: AuthState; db: SupabaseClient | null } | { ok: false; res: Response }> {
  const auth = await getAuth();
  const deny = (status: number, error: string) => ({ ok: false as const, res: Response.json({ error }, { status }) });

  switch (auth.kind) {
    case "unconfigured":
      return deny(503, "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (.env.local locally, Vercel env vars when deployed), then rebuild.");
    case "anonymous":
      return deny(401, "Not signed in");
    case "dev-bypass":
      if (level === "live-trader") return deny(403, "Live orders require Supabase login. Configure Supabase in .env.local first.");
      return { ok: true, auth, db: null };
    case "user":
      if (level !== "user") {
        if (allowedEmails().length === 0) return deny(403, `Set ALLOWED_EMAILS=${auth.email} in .env.local to enable Alpaca features for your account.`);
        if (!auth.allowed) return deny(403, `${auth.email} is not in ALLOWED_EMAILS.`);
      }
      return { ok: true, auth, db: auth.db };
  }
}
