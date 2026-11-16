// All indicators return arrays aligned with the input; warm-up values are NaN.
// Value at index t only uses data up to and including t (no look-ahead).

export function sma(x: number[], n: number): number[] {
  const out = new Array(x.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    sum += x[i];
    if (i >= n) sum -= x[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function ema(x: number[], n: number): number[] {
  const out = new Array(x.length).fill(NaN);
  const a = 2 / (n + 1);
  let prev = NaN;
  for (let i = 0; i < x.length; i++) {
    if (i === n - 1) {
      let s = 0;
      for (let j = 0; j < n; j++) s += x[j];
      prev = s / n;
      out[i] = prev;
    } else if (i >= n) {
      prev = a * x[i] + (1 - a) * prev;
      out[i] = prev;
    }
  }
  return out;
}

export function stdev(x: number[], n: number): number[] {
  const out = new Array(x.length).fill(NaN);
  for (let i = n - 1; i < x.length; i++) {
    let s = 0, s2 = 0;
    for (let j = i - n + 1; j <= i; j++) {
      s += x[j];
      s2 += x[j] * x[j];
    }
    const m = s / n;
    out[i] = Math.sqrt(Math.max(0, s2 / n - m * m));
  }
  return out;
}

/** Wilder's RSI. */
export function rsi(x: number[], n = 14): number[] {
  const out = new Array(x.length).fill(NaN);
  let gain = 0, loss = 0;
  for (let i = 1; i < x.length; i++) {
    const d = x[i] - x[i - 1];
    const g = Math.max(d, 0), l = Math.max(-d, 0);
    if (i <= n) {
      gain += g / n;
      loss += l / n;
    } else {
      gain = (gain * (n - 1) + g) / n;
      loss = (loss * (n - 1) + l) / n;
    }
    if (i >= n) out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function pctChange(x: number[], n = 1): number[] {
  return x.map((v, i) => (i >= n ? v / x[i - n] - 1 : NaN));
}

export function rollingMax(x: number[], n: number): number[] {
  return x.map((_, i) => (i >= n - 1 ? Math.max(...x.slice(i - n + 1, i + 1)) : NaN));
}

export function rollingMin(x: number[], n: number): number[] {
  return x.map((_, i) => (i >= n - 1 ? Math.min(...x.slice(i - n + 1, i + 1)) : NaN));
}

export function macd(x: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(x, fast), s = ema(x, slow);
  const line = x.map((_, i) => f[i] - s[i]);
  const firstValid = line.findIndex((v) => !Number.isNaN(v));
  const sig = new Array(x.length).fill(NaN);
  if (firstValid >= 0) {
    const e = ema(line.slice(firstValid), signal);
    e.forEach((v, j) => (sig[firstValid + j] = v));
  }
  return { line, signal: sig, hist: line.map((v, i) => v - sig[i]) };
}
