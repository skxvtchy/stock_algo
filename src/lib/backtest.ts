import type { Bar } from "./data";
import { type RunContext, STRATEGIES, type Strategy } from "./strategies";

export interface Metrics {
  totalReturn: number;
  cagr: number;
  sharpe: number;
  maxDrawdown: number;
  volatility: number;
  exposure: number; // average fraction of capital invested
  trades: number; // number of position changes
  winRate: number; // share of invested days that were profitable
  accuracy?: number; // ML: directional hit rate of predictions
}

export interface StrategyResult {
  id: string;
  name: string;
  kind: Strategy["kind"];
  description: string;
  equity: number[]; // growth of $1, aligned with `dates`
  metrics: Metrics;
  signal: { position: number; prob?: number }; // position for the next session
}

export interface BacktestResult {
  ticker: string;
  dates: string[];
  lastClose: number;
  results: StrategyResult[];
}

export const DEFAULT_CTX = (n: number): RunContext => {
  // ML needs ~200 bars for features plus 2 years of training data before evaluation.
  const evalStart = Math.min(Math.max(200 + 504, Math.floor(n * 0.3)), n - 2);
  return { evalStart, retrainEvery: 63, minTrain: 504 };
};

/**
 * pos[t] is decided at the close of t and earns the return from t to t+1.
 * Transaction cost (in basis points) is charged on every change in position.
 */
function simulate(bars: Bar[], pos: number[], start: number, costBps: number, prob?: number[]) {
  const c = bars.map((b) => b.close);
  const equity = [1];
  const daily: number[] = [];
  let trades = 0, wins = 0, invested = 0, exposure = 0, hits = 0, preds = 0;
  let prev = 0;
  for (let t = start; t < bars.length - 1; t++) {
    const p = pos[t];
    const ret = c[t + 1] / c[t] - 1;
    const turnover = Math.abs(p - prev);
    if (turnover > 1e-9) trades++;
    const r = p * ret - turnover * (costBps / 1e4);
    daily.push(r);
    equity.push(equity[equity.length - 1] * (1 + r));
    exposure += p;
    if (p > 0) {
      invested++;
      if (ret > 0) wins++;
    }
    if (prob && Number.isFinite(prob[t])) {
      preds++;
      if ((prob[t] > 0.5) === (ret > 0)) hits++;
    }
    prev = p;
  }
  const n = daily.length;
  const mean = daily.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(daily.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  let peak = 1, mdd = 0;
  for (const e of equity) {
    peak = Math.max(peak, e);
    mdd = Math.min(mdd, e / peak - 1);
  }
  const total = equity[equity.length - 1] - 1;
  const metrics: Metrics = {
    totalReturn: total,
    cagr: Math.pow(1 + total, 252 / n) - 1,
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(252) : 0,
    maxDrawdown: mdd,
    volatility: sd * Math.sqrt(252),
    exposure: exposure / n,
    trades,
    winRate: invested ? wins / invested : 0,
    ...(prob ? { accuracy: preds ? hits / preds : 0 } : {}),
  };
  return { equity, metrics };
}

export function runBacktest(ticker: string, bars: Bar[], costBps = 5, ids?: string[]): BacktestResult {
  const ctx = DEFAULT_CTX(bars.length);
  const strategies = ids ? STRATEGIES.filter((s) => ids.includes(s.id)) : STRATEGIES;
  const last = bars.length - 1;
  const results = strategies.map((s) => {
    const out = s.run(bars, ctx);
    const { equity, metrics } = simulate(bars, out.pos, ctx.evalStart, costBps, out.prob);
    return {
      id: s.id,
      name: s.name,
      kind: s.kind,
      description: s.description,
      equity: equity.map((e) => Math.round(e * 1e4) / 1e4),
      metrics,
      signal: { position: out.pos[last], prob: out.prob?.[last] },
    };
  });
  return {
    ticker,
    dates: bars.slice(ctx.evalStart).map((b) => b.date),
    lastClose: bars[last].close,
    results,
  };
}

/** Today's target position (0..1) for each strategy — used for live/paper trading. */
export function currentSignals(bars: Bar[], ids: string[]) {
  // Only the last bar matters, so evaluate ML over a short recent window to save time.
  const n = bars.length;
  const ctx: RunContext = { evalStart: Math.max(n - 5, 0), retrainEvery: 1000, minTrain: 504 };
  return STRATEGIES.filter((s) => ids.includes(s.id)).map((s) => {
    const out = s.run(bars, ctx);
    return { id: s.id, name: s.name, position: out.pos[n - 1], prob: out.prob?.[n - 1] };
  });
}
