"use client";

import { type ReactNode, useEffect } from "react";
import { pct } from "@/lib/format";

export function Card({ title, sub, right, children, className = "" }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {sub && <div className="mt-0.5 text-xs text-ink-3">{sub}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, subClass = "text-ink-3" }: { label: string; value: ReactNode; sub?: ReactNode; subClass?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5">
      <div className="text-xs text-ink-2">{label}</div>
      <div className="num mt-1 truncate text-xl font-semibold text-ink">{value}</div>
      {sub != null && <div className={`num mt-0.5 truncate text-xs ${subClass}`}>{sub}</div>}
    </div>
  );
}

type ButtonVariant = "primary" | "ghost" | "danger";
export function Button({ variant = "primary", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const v = {
    primary: "bg-ink text-surface active:opacity-80",
    ghost: "border border-line bg-surface text-ink active:bg-background",
    danger: "bg-live text-white active:opacity-80",
  }[variant];
  return (
    <button
      {...p}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${v} ${className}`}
    />
  );
}

// 16px text prevents iOS Safari from zooming the page when an input is focused.
export const inputCls =
  "h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-base text-ink outline-none focus:border-ink-3";

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 text-xs font-medium text-ink-2 ${className}`}>
      {label}
      {children}
    </label>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border border-bad/40 bg-bad/5 px-3 py-2.5 text-sm text-bad">
      ⚠ {children}
    </div>
  );
}

export function Chip({ active, onClick, children, className = "" }: { active: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition ${
        active ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink-2 active:bg-background"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-background p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-9 flex-1 rounded-lg text-sm font-medium transition ${value === o.value ? "bg-surface text-ink shadow-sm" : "text-ink-2"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet modal — the mobile-native way to confirm an action. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
      <button aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-t-3xl border border-line bg-surface px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <h3 className="mb-3 text-lg font-semibold text-ink">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function SignalBadge({ position, prob }: { position: number; prob?: number | null }) {
  const long = position > 0;
  return (
    <span className={`num inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ${long ? "bg-good/10 text-good" : "bg-ink-3/10 text-ink-2"}`}>
      {long ? `▲ Long${position < 1 ? ` ${pct(position, 0)}` : ""}` : "■ Flat"}
      {prob != null && Number.isFinite(prob) && <span className="font-normal opacity-80">· {pct(prob, 0)}</span>}
    </span>
  );
}

export const KIND_LABEL: Record<string, string> = {
  baseline: "Baseline",
  trend: "Trend",
  "mean-reversion": "Mean reversion",
  ml: "Machine learning",
};

export const KIND_SHORT: Record<string, string> = { baseline: "Baseline", trend: "Trend", "mean-reversion": "Reversion", ml: "ML" };
