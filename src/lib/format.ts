export const pct = (x: number | null | undefined, d = 1) =>
  x == null || !Number.isFinite(x) ? "—" : `${(x * 100).toFixed(d)}%`;
export const usd = (x: number | string | null | undefined, d = 2) => {
  const n = Number(x);
  return x == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
};
export const signed = (x: number, f: (n: number) => string) => (x > 0 ? "+" : "") + f(x);
export const tone = (x: number) => (x > 0 ? "text-good" : x < 0 ? "text-bad" : "text-ink-2");
