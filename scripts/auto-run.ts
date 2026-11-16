// Run the daily paper auto-run once, outside the web app (local cron, CI, or testing).
//   npm run auto-run              # trades only if inside the window and not yet run today
//   npm run auto-run -- --dry-run # show what each schedule would trade right now; places nothing
import "./load-env";
import { runAutoTrades, supabaseStore } from "../src/lib/autorun";
import { getAdminClient } from "../src/lib/supabase/admin";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const db = getAdminClient();
  if (!db) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");

  const s = await runAutoTrades({ store: supabaseStore(db), dryRun });
  console.log(`${dryRun ? "[dry run] " : ""}${s.tradingDay} · market ${s.marketOpen ? `open, ${s.minutesToClose} min to close` : "closed"}${s.note ? ` · ${s.note}` : ""}`);
  if (!s.results.length && !s.note) console.log("No enabled auto-run schedules.");
  for (const r of s.results) {
    console.log(`- ${r.userId.slice(0, 8)} [${r.status}] ${r.message}`);
    if (dryRun && r.plan) {
      for (const p of r.plan.plan) {
        console.log(`    ${p.name.padEnd(30)} ${p.position > 0 ? "LONG" : "flat"}  held ${p.held} → target ${p.target}${p.side ? `  ${p.side.toUpperCase()} ${Math.abs(p.delta)}` : ""}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(`auto-run failed: ${(e as Error).message}`);
  process.exit(1);
});
