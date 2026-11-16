"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { Button, ErrorNote, Field, inputCls, Segmented } from "./ui";

export default function LoginForm({ initialError }: { initialError: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = getBrowserClient();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/");
          router.refresh();
        } else {
          setInfo("Check your email for a confirmation link, then come back and sign in.");
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="mb-8 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/192" alt="" width={56} height={56} className="mx-auto mb-4 rounded-2xl" />
        <h1 className="text-2xl font-bold tracking-tight text-ink">Stock Algo Lab</h1>
        <p className="mt-1 text-sm text-ink-2">Backtest and paper-trade 17 algorithms</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Segmented
          value={mode}
          onChange={(m) => { setMode(m); setError(null); setInfo(null); }}
          options={[{ value: "signin", label: "Sign in" }, { value: "signup", label: "Create account" }]}
        />
        <Field label="Email">
          <input type="email" required autoComplete="email" inputMode="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input type="password" required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        {info && <div className="rounded-xl bg-paper/10 px-3 py-2.5 text-sm text-paper">{info}</div>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </Button>
        {mode === "signup" && (
          <p className="text-center text-xs text-ink-3">Only emails listed in ALLOWED_EMAILS can use the Alpaca trading features.</p>
        )}
      </form>
    </main>
  );
}
