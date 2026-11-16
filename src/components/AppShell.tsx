"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Mode } from "@/lib/alpaca";
import { getBrowserClient } from "@/lib/supabase/client";
import type { Tab } from "@/lib/tabs";
import AccountView from "./AccountView";
import BacktestLab from "./BacktestLab";
import { BoltIcon, ChartIcon, UserIcon, WalletIcon } from "./icons";
import TradePanel from "./TradePanel";
import { Button, Sheet } from "./ui";

const TABS: { id: Tab; label: string; Icon: typeof ChartIcon }[] = [
  { id: "backtest", label: "Backtest", Icon: ChartIcon },
  { id: "trade", label: "Trade", Icon: BoltIcon },
  { id: "account", label: "Account", Icon: WalletIcon },
];

const remember = (key: string, value: string) => {
  document.cookie = `${key}=${value}; path=/; max-age=31536000; samesite=lax`;
};

function ModeToggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex rounded-full border border-line bg-background p-0.5 text-[13px]" role="radiogroup" aria-label="Trading account">
      {(["paper", "live"] as const).map((m) => {
        const on = mode === m;
        return (
          <button
            key={m}
            role="radio"
            aria-checked={on}
            onClick={() => setMode(m)}
            className={`flex h-8 items-center gap-1.5 rounded-full px-3 font-semibold transition ${
              on ? (m === "live" ? "bg-live text-white" : "bg-paper text-white") : "text-ink-2"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-white" : m === "live" ? "bg-live" : "bg-paper"}`} />
            {m === "paper" ? "Paper" : "Live"}
          </button>
        );
      })}
    </div>
  );
}

export default function AppShell({ initialMode, initialTab, email, devBypass, notice }: {
  initialMode: Mode;
  initialTab: Tab;
  email: string | null;
  devBypass: boolean;
  notice: string | null;
}) {
  const router = useRouter();
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [mode, setModeState] = useState<Mode>(initialMode);
  const [refreshKey, setRefreshKey] = useState(0);
  const [menu, setMenu] = useState(false);

  const setTab = (t: Tab) => { setTabState(t); remember("tab", t); window.scrollTo({ top: 0 }); };
  const setMode = (m: Mode) => { setModeState(m); remember("tradingMode", m); };
  const showMode = tab !== "backtest";
  const title = TABS.find((t) => t.id === tab)!.label;

  async function signOut() {
    await getBrowserClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        {showMode && mode === "live" && (
          <div className="bg-live px-4 py-1 text-center text-[11px] font-semibold tracking-wide text-white">
            LIVE ACCOUNT · REAL MONEY
          </div>
        )}
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            {showMode && <ModeToggle mode={mode} setMode={setMode} />}
            {email && (
              <button onClick={() => setMenu(true)} aria-label="Account menu" className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-2">
                <UserIcon className="h-[18px] w-[18px]" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
        {devBypass && (
          <div className="mb-4 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink-2">
            🔓 Dev mode: Supabase isn&apos;t configured, so login and history are off. Live orders stay disabled.
          </div>
        )}
        {notice && <div className="mb-4 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink-2">ℹ️ {notice}</div>}
        {tab === "backtest" && <BacktestLab />}
        {tab === "trade" && <TradePanel key={mode} mode={mode} onExecuted={() => setRefreshKey((k) => k + 1)} />}
        {tab === "account" && <AccountView key={mode} mode={mode} refreshKey={refreshKey} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <div className="mx-auto grid max-w-2xl grid-cols-3">
          {TABS.map(({ id, label, Icon }) => {
            const on = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={on ? "page" : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition ${on ? "text-ink" : "text-ink-3"}`}
              >
                <Icon className={`h-6 w-6 ${on ? "stroke-[2.4]" : ""}`} />
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Signed in">
        <p className="mb-4 truncate text-sm text-ink-2">{email}</p>
        <Button variant="ghost" className="w-full" onClick={signOut}>Sign out</Button>
      </Sheet>
    </div>
  );
}
