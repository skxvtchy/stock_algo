// Shown when Supabase isn't configured. On a deployment, this lists exactly which env vars are
// missing (names only, never values). NEXT_PUBLIC_* values are baked in when the app is built.
type Var = { name: string; set: boolean; group: "Required" | "Trading" | "Daily auto-run"; buildTime?: boolean };

// Evaluated per render so server-only vars reflect the running deployment.
const envStatus = (): Var[] => [
  { name: "NEXT_PUBLIC_SUPABASE_URL", set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL), group: "Required", buildTime: true },
  {
    name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    group: "Required",
    buildTime: true,
  },
  { name: "ALLOWED_EMAILS", set: Boolean(process.env.ALLOWED_EMAILS), group: "Trading" },
  { name: "ALPACA_PAPER_KEY_ID", set: Boolean(process.env.ALPACA_PAPER_KEY_ID), group: "Trading" },
  { name: "ALPACA_PAPER_SECRET_KEY", set: Boolean(process.env.ALPACA_PAPER_SECRET_KEY), group: "Trading" },
  { name: "SUPABASE_SECRET_KEY", set: Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY), group: "Daily auto-run" },
  { name: "CRON_SECRET", set: Boolean(process.env.CRON_SECRET), group: "Daily auto-run" },
];

export default function SetupScreen() {
  const VARS = envStatus();
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-5 px-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Finish setup</h1>
        <p className="mt-1 text-sm text-ink-2">This deployment needs a Supabase project before anyone can sign in.</p>
      </div>

      <ul className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-4 text-sm">
        {VARS.map((v, i) => (
          <li key={v.name}>
            {(i === 0 || VARS[i - 1].group !== v.group) && (
              <div className={`text-xs font-semibold tracking-wide text-ink-3 uppercase ${i ? "mt-3" : ""} mb-1`}>{v.group}</div>
            )}
            <div className="flex items-center justify-between gap-3">
              <code className="truncate text-ink">{v.name}</code>
              <span className={`shrink-0 text-xs font-semibold ${v.set ? "text-good" : "text-bad"}`}>{v.set ? "✓ set" : "✕ missing"}</span>
            </div>
          </li>
        ))}
      </ul>

      <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-2">
        <li>Create a project at supabase.com and run the SQL files in <code>supabase/migrations/</code>.</li>
        <li>Add the missing variables in Vercel → Project → Settings → Environment Variables, or run <code>npm run vercel:env</code> to copy them from <code>.env.local</code>.</li>
        <li>Redeploy. <code>NEXT_PUBLIC_*</code> values are baked in at build time, so they only take effect after a new build.</li>
      </ol>
    </main>
  );
}
