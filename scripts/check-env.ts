// Check .env.local (or the current environment): formats, plus read-only calls proving each
// key works. Never prints secret values.   npm run check-env   (add -- --offline to skip calls)
import "./load-env";

type Row = { name: string; ok: boolean | null; note: string };
const rows: Row[] = [];
const env = (k: string) => (process.env[k] ?? "").trim();
const add = (name: string, ok: boolean | null, note: string) => rows.push({ name, ok, note });
const offline = process.argv.includes("--offline");

async function get(url: string, headers: Record<string, string>) {
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    return { status: r.status, body: await r.text() };
  } catch (e) {
    return { status: 0, body: (e as Error).message };
  }
}

async function main() {
  // ---- Supabase
  const url = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/+$/, "");
  const pub = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const secret = env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
  const isKey = (k: string, prefix: string) => k.startsWith(prefix) || /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(k);

  add("NEXT_PUBLIC_SUPABASE_URL", url ? /^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/.test(url) : false, url ? "format https://<project-ref>.supabase.co" : "missing");
  if (pub.startsWith("sb_secret_")) add("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", false, "DANGER: this is your SECRET key. It would be shipped to browsers");
  else add("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", pub ? isKey(pub, "sb_publishable_") : false, pub ? "sb_publishable_… (or legacy anon JWT)" : "missing");
  add("SUPABASE_SECRET_KEY", secret ? isKey(secret, "sb_secret_") && secret !== pub : null, secret ? (secret === pub ? "same as publishable key: use the SECRET key" : "sb_secret_… (or legacy service_role JWT)") : "missing (needed for daily auto-run)");

  if (!offline && url && pub) {
    const r = await get(`${url.replace(/\/$/, "")}/auth/v1/settings`, { apikey: pub });
    add("  Supabase auth reachable", r.status === 200, r.status === 200 ? "URL + publishable key accepted" : `HTTP ${r.status}`);
  }
  if (!offline && url && secret) {
    for (const table of ["trade_settings", "trade_runs", "backtests", "auto_trade_configs"]) {
      const r = await get(`${url.replace(/\/$/, "")}/rest/v1/${table}?select=*&limit=1`, { apikey: secret, Authorization: `Bearer ${secret}` });
      const missing = r.status === 404 || /does not exist|PGRST205|schema cache/i.test(r.body);
      add(`  table ${table}`, r.status === 200, r.status === 200 ? "exists" : missing ? "missing: run the SQL in supabase/migrations/" : `HTTP ${r.status}`);
    }
  }

  // ---- Access + scheduler
  const emails = env("ALLOWED_EMAILS").split(",").map((e) => e.trim()).filter(Boolean);
  add("ALLOWED_EMAILS", emails.length > 0 && emails.every((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)), emails.length ? `${emails.length} email(s)` : "missing");
  const cron = env("CRON_SECRET");
  add("CRON_SECRET", cron ? cron.length >= 32 : null, cron ? (cron.length >= 32 ? "set" : "too short (use openssl rand -hex 32)") : "missing (needed for daily auto-run)");

  // ---- Alpaca
  for (const mode of ["PAPER", "LIVE"] as const) {
    const id = env(`ALPACA_${mode}_KEY_ID`);
    const sk = env(`ALPACA_${mode}_SECRET_KEY`);
    const required = mode === "PAPER";
    if (!id && !sk) { add(`ALPACA_${mode}_KEY_ID / SECRET`, required ? false : null, required ? "missing" : "not set (optional)"); continue; }
    const prefix = mode === "PAPER" ? "PK" : "AK";
    add(`ALPACA_${mode}_KEY_ID`, id.startsWith(prefix), id.startsWith(prefix) ? `starts with ${prefix}` : `${mode.toLowerCase()} key IDs start with ${prefix}: is this the right account?`);
    add(`ALPACA_${mode}_SECRET_KEY`, sk.length >= 30, sk ? "set" : "missing");
    if (!offline && id && sk) {
      const host = mode === "PAPER" ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets";
      const r = await get(`${host}/v2/account`, { "APCA-API-KEY-ID": id, "APCA-API-SECRET-KEY": sk });
      let note = `HTTP ${r.status}`;
      if (r.status === 200) { try { note = `keys work · account ${JSON.parse(r.body).status}`; } catch { note = "keys work"; } }
      add(`  Alpaca ${mode.toLowerCase()} account`, r.status === 200, note);
    }
  }
  add("ALPACA_LIVE_TRADING_ENABLED", null, env("ALPACA_LIVE_TRADING_ENABLED") === "true" ? "true: live orders allowed (with login + typed LIVE)" : "off (live account is view-only)");

  const icon = (ok: boolean | null) => (ok === true ? "✓" : ok === false ? "✕" : "·");
  for (const r of rows) console.log(`${icon(r.ok)} ${r.name.padEnd(38)} ${r.note}`);
  const failed = rows.filter((r) => r.ok === false).length;
  console.log(failed ? `\n${failed} problem(s) to fix.` : "\nAll set.");
  process.exit(failed ? 1 : 0);
}

main();
