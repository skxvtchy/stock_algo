import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import SetupScreen from "@/components/SetupScreen";
import { allowedEmails, getAuth } from "@/lib/auth";
import { isTab } from "@/lib/tabs";

// With Cache Components, the static shell (fallback) is prerendered and the
// cookie/auth-dependent app streams in per request.
export default function Home() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <App />
    </Suspense>
  );
}

async function App() {
  const jar = await cookies();
  const auth = await getAuth();
  if (auth.kind === "anonymous") redirect("/login");
  if (auth.kind === "unconfigured") return <SetupScreen />;

  const mode = jar.get("tradingMode")?.value === "live" ? "live" : "paper";
  const savedTab = jar.get("tab")?.value;
  const tab = isTab(savedTab) ? savedTab : "backtest";

  let notice: string | null = null;
  if (auth.kind === "user" && !auth.allowed) {
    notice = allowedEmails().length
      ? `${auth.email} isn't in ALLOWED_EMAILS, so trading and account views are disabled. Backtests still work.`
      : `Add ALLOWED_EMAILS=${auth.email} to .env.local to enable trading and account views.`;
  }

  return (
    <AppShell
      initialMode={mode}
      initialTab={tab}
      email={auth.kind === "user" ? auth.email : null}
      devBypass={auth.kind === "dev-bypass"}
      notice={notice}
    />
  );
}

function ShellSkeleton() {
  return (
    <div className="min-h-dvh">
      <div className="h-[calc(env(safe-area-inset-top)+3.5rem)] border-b border-line bg-surface" />
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-4">
        <div className="h-28 animate-pulse rounded-2xl bg-surface" />
        <div className="h-60 animate-pulse rounded-2xl bg-surface" />
      </div>
      <div className="fixed inset-x-0 bottom-0 h-[calc(env(safe-area-inset-bottom)+3.5rem)] border-t border-line bg-surface" />
    </div>
  );
}
