const base = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const ChartIcon = (p: { className?: string }) => (
  <svg {...base} {...p} aria-hidden><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 6-6" /></svg>
);
export const BoltIcon = (p: { className?: string }) => (
  <svg {...base} {...p} aria-hidden><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></svg>
);
export const WalletIcon = (p: { className?: string }) => (
  <svg {...base} {...p} aria-hidden><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18" /><circle cx="16.5" cy="15" r="1.2" fill="currentColor" stroke="none" /></svg>
);
export const RefreshIcon = (p: { className?: string }) => (
  <svg {...base} {...p} aria-hidden><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
);
export const UserIcon = (p: { className?: string }) => (
  <svg {...base} {...p} aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
);
