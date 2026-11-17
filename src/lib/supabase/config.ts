// NEXT_PUBLIC_* values are inlined at build time, so reference them literally.
/** Base project URL. Tolerates a pasted REST endpoint (…supabase.co/rest/v1/) or trailing slash. */
export const normalizeSupabaseUrl = (u: string | undefined) => (u || "").trim().replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/+$/, "");
export const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);

/**
 * With no Supabase project configured, `npm run dev` still works (auth off) so you can
 * try the backtester. Production builds refuse to run unauthenticated, and live orders
 * always require a real Supabase login.
 */
export const devAuthBypass = !supabaseConfigured && process.env.NODE_ENV === "development";
