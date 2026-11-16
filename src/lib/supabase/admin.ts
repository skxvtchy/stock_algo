import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for trusted server jobs (the daily auto-run). It bypasses row-level
 * security, so only use it from route handlers and scripts, never from client code.
 * Env is read at call time so scripts can load .env.local first.
 */
export function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
