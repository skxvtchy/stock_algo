import type { Bar } from "./data";
import { ema, macd, pctChange, rsi, sma, stdev } from "./indicators";

export const FEATURE_NAMES = [
  "ret_1d", "ret_2d", "ret_5d", "ret_10d", "ret_20d",
  "px_vs_sma10", "px_vs_sma20", "px_vs_sma50", "px_vs_sma200",
  "rsi_14", "vol_20d", "macd_hist", "bb_pctb", "volume_z20", "range_hl",
];

export interface FeatureSet {
  X: number[][]; // X[t] — features known at close of day t
  y: number[]; // y[t] = 1 if close[t+1] > close[t], NaN for the last bar
  valid: boolean[]; // true when every feature at t is finite
}

/** Build the ML feature matrix. Row t uses only information up to the close of day t. */
export function buildFeatures(bars: Bar[]): FeatureSet {
  const c = bars.map((b) => b.close);
  const v = bars.map((b) => b.volume);
  const r1 = pctChange(c, 1);
  const cols: number[][] = [];

  for (const n of [1, 2, 5, 10, 20]) cols.push(pctChange(c, n));
  for (const n of [10, 20, 50, 200]) {
    const m = sma(c, n);
    cols.push(c.map((p, i) => p / m[i] - 1));
  }
  cols.push(rsi(c, 14).map((x) => x / 100));
  cols.push(stdev(r1.map((x) => (Number.isNaN(x) ? 0 : x)), 20));
  const m = macd(c);
  cols.push(m.hist.map((h, i) => h / c[i]));
  const mid = sma(c, 20), sd = stdev(c, 20);
  cols.push(c.map((p, i) => (sd[i] > 0 ? (p - (mid[i] - 2 * sd[i])) / (4 * sd[i]) : NaN)));
  const vm = sma(v, 20), vs = stdev(v, 20);
  cols.push(v.map((x, i) => (vs[i] > 0 ? (x - vm[i]) / vs[i] : 0)));
  const hl = bars.map((b) => (b.high - b.low) / b.close);
  const hlAvg = ema(hl, 20);
  cols.push(hl.map((x, i) => x / hlAvg[i] - 1));

  const X: number[][] = [];
  const valid: boolean[] = [];
  for (let t = 0; t < bars.length; t++) {
    const row = cols.map((col) => col[t]);
    X.push(row);
    valid.push(row.every(Number.isFinite));
  }
  const y = c.map((p, t) => (t + 1 < c.length ? (c[t + 1] > p ? 1 : 0) : NaN));
  return { X, y, valid };
}
