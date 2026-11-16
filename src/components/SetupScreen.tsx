export default function SetupScreen() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-5 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-ink">Finish setup</h1>
      <p className="text-sm text-ink-2">This deployment needs a Supabase project before anyone can sign in.</p>
      <ol className="list-decimal space-y-2.5 pl-5 text-sm text-ink-2">
        <li>Create a project at supabase.com.</li>
        <li>In the SQL editor, run <code className="rounded bg-surface px-1">supabase/migrations/20261115000000_init.sql</code>.</li>
        <li>
          Copy the project URL and publishable key (Project Settings → API) into your environment:
          <pre className="mt-2 overflow-x-auto rounded-xl bg-surface p-3 text-xs text-ink">{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...\nALLOWED_EMAILS=you@example.com`}</pre>
        </li>
        <li>Rebuild and restart the app.</li>
      </ol>
    </main>
  );
}
