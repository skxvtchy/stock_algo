import type { Bar } from "./data";
import { buildFeatures } from "./features";
import { ema, macd, pctChange, rollingMax, rollingMin, rsi, sma, stdev } from "./indicators";
import {
  type Classifier, DecisionTree, GaussianNB, GradientBoosting, KNN, LogisticRegression, RandomForest,
} from "./ml";

/**
 * A strategy turns price history into a position for each day: pos[t] ∈ [0, 1] is the
 * fraction of capital held long from the close of day t to the close of day t+1.
 * It may only use information available at the close of day t.
 */
export interface StrategyOutput {
  pos: number[];
  prob?: number[]; // ML only: predicted P(up) per day (NaN when no prediction)
}

export interface Strategy {
  id: string;
  name: string;
  kind: "baseline" | "trend" | "mean-reversion" | "ml";
  description: string;
  run(bars: Bar[], ctx: RunContext): StrategyOutput;
}

export interface RunContext {
  /** First bar index of the out-of-sample evaluation window. */
  evalStart: number;
  /** ML walk-forward settings. */
  retrainEvery: number;
  minTrain: number;
}

const closes = (b: Bar[]) => b.map((x) => x.close);
const finite = Number.isFinite;

/** Hold a position from an "enter" condition until an "exit" condition fires. */
function latch(n: number, enter: (t: number) => boolean, exit: (t: number) => boolean): number[] {
  const pos = new Array(n).fill(0);
  let s = 0;
  for (let t = 0; t < n; t++) {
    if (s === 0 && enter(t)) s = 1;
    else if (s === 1 && exit(t)) s = 0;
    pos[t] = s;
  }
  return pos;
}

// ---------------------------------------------------------------- rule-based

const buyHold: Strategy = {
  id: "buy-hold", name: "Buy & Hold", kind: "baseline",
  description: "Always fully invested. The benchmark every algorithm should beat.",
  run: (b) => ({ pos: b.map(() => 1) }),
};

const smaCross: Strategy = {
  id: "sma-cross", name: "SMA Crossover 50/200", kind: "trend",
  description: "Long when the 50-day SMA is above the 200-day SMA (golden cross).",
  run: (b) => {
    const c = closes(b), f = sma(c, 50), s = sma(c, 200);
    return { pos: c.map((_, t) => (finite(s[t]) && f[t] > s[t] ? 1 : 0)) };
  },
};

const emaCross: Strategy = {
  id: "ema-cross", name: "EMA Crossover 12/26", kind: "trend",
  description: "Long when the 12-day EMA is above the 26-day EMA. Faster than the SMA cross.",
  run: (b) => {
    const c = closes(b), f = ema(c, 12), s = ema(c, 26);
    return { pos: c.map((_, t) => (finite(s[t]) && f[t] > s[t] ? 1 : 0)) };
  },
};

const macdStrat: Strategy = {
  id: "macd", name: "MACD Signal", kind: "trend",
  description: "Long when the MACD line is above its 9-day signal line.",
  run: (b) => {
    const m = macd(closes(b));
    return { pos: m.hist.map((h) => (finite(h) && h > 0 ? 1 : 0)) };
  },
};

const momentum: Strategy = {
  id: "momentum", name: "Time-Series Momentum", kind: "trend",
  description: "Long when the trailing 3-month (63-day) return is positive.",
  run: (b) => {
    const r = pctChange(closes(b), 63);
    return { pos: r.map((x) => (finite(x) && x > 0 ? 1 : 0)) };
  },
};

const donchian: Strategy = {
  id: "donchian", name: "Donchian Breakout 20/10", kind: "trend",
  description: "Buy on a new 20-day high, sell on a new 10-day low (turtle-style breakout).",
  run: (b) => {
    const c = closes(b);
    const hi = rollingMax(c, 20), lo = rollingMin(c, 10);
    return { pos: latch(c.length, (t) => t > 0 && c[t] >= hi[t - 1], (t) => t > 0 && c[t] <= lo[t - 1]) };
  },
};

const volTarget: Strategy = {
  id: "vol-target", name: "Trend + Volatility Targeting", kind: "trend",
  description: "Price above its 100-day SMA, sized to target 15% annualised volatility (max 100%).",
  run: (b) => {
    const c = closes(b), m = sma(c, 100);
    const r = pctChange(c, 1).map((x) => (finite(x) ? x : 0));
    const vol = stdev(r, 20).map((s) => s * Math.sqrt(252));
    return {
      pos: c.map((p, t) => (finite(m[t]) && p > m[t] && vol[t] > 0 ? Math.min(1, 0.15 / vol[t]) : 0)),
    };
  },
};

const rsiRev: Strategy = {
  id: "rsi-reversion", name: "RSI Mean Reversion", kind: "mean-reversion",
  description: "Buy when 14-day RSI drops below 30 (oversold), sell when it rises above 55.",
  run: (b) => {
    const r = rsi(closes(b), 14);
    return { pos: latch(r.length, (t) => r[t] < 30, (t) => r[t] > 55) };
  },
};

const rsi2: Strategy = {
  id: "rsi2", name: "RSI(2) Pullback", kind: "mean-reversion",
  description: "In an uptrend (above 200-day SMA), buy when 2-day RSI < 10, exit when > 70.",
  run: (b) => {
    const c = closes(b), r = rsi(c, 2), s = sma(c, 200);
    return { pos: latch(c.length, (t) => finite(s[t]) && c[t] > s[t] && r[t] < 10, (t) => r[t] > 70 || c[t] < s[t]) };
  },
};

const bollinger: Strategy = {
  id: "bollinger", name: "Bollinger Band Reversion", kind: "mean-reversion",
  description: "Buy on a close below the lower band (20d, 2σ), sell at the middle band.",
  run: (b) => {
    const c = closes(b), m = sma(c, 20), sd = stdev(c, 20);
    return { pos: latch(c.length, (t) => finite(sd[t]) && c[t] < m[t] - 2 * sd[t], (t) => c[t] > m[t]) };
  },
};

// ---------------------------------------------------------------- ML (walk-forward)

/**
 * Expanding-window walk-forward: retrain every `retrainEvery` days on all labelled rows
 * strictly before the current day, then predict each day until the next retrain.
 * The label for row i needs close[i+1], so on day t we can only train on rows i < t.
 */
const memo = new WeakMap<Bar[], Map<string, StrategyOutput>>();

/** Cache ML runs per (bars, ctx, model) so the ensemble reuses the individual models' output. */
function cachedWalkForward(id: string, bars: Bar[], ctx: RunContext, make: () => Classifier): StrategyOutput {
  let m = memo.get(bars);
  if (!m) memo.set(bars, (m = new Map()));
  const key = `${id}|${ctx.evalStart}|${ctx.retrainEvery}|${ctx.minTrain}`;
  let out = m.get(key);
  if (!out) m.set(key, (out = walkForward(bars, ctx, make)));
  return out;
}

const featureMemo = new WeakMap<Bar[], ReturnType<typeof buildFeatures>>();

function walkForward(bars: Bar[], ctx: RunContext, make: () => Classifier, threshold = 0.5): StrategyOutput {
  let fs = featureMemo.get(bars);
  if (!fs) featureMemo.set(bars, (fs = buildFeatures(bars)));
  const { X, y, valid } = fs;
  const n = bars.length;
  const prob = new Array(n).fill(NaN);
  const pos = new Array(n).fill(0);
  const firstValid = valid.indexOf(true);
  if (firstValid < 0) return { pos, prob };

  let model: Classifier | null = null;
  let sinceTrain = Infinity;
  for (let t = Math.max(ctx.evalStart, firstValid + ctx.minTrain); t < n; t++) {
    if (sinceTrain >= ctx.retrainEvery) {
      const tx: number[][] = [], ty: number[] = [];
      for (let i = firstValid; i < t; i++) if (valid[i] && finite(y[i])) { tx.push(X[i]); ty.push(y[i]); }
      if (tx.length >= ctx.minTrain) {
        model = make();
        model.fit(tx, ty);
        sinceTrain = 0;
      }
    }
    sinceTrain++;
    if (model && valid[t]) {
      prob[t] = model.predict(X[t]);
      pos[t] = prob[t] > threshold ? 1 : 0;
    }
  }
  return { pos, prob };
}

const mlStrategies: Strategy[] = [
  {
    id: "ml-logreg", name: "Logistic Regression", kind: "ml",
    description: "L2-regularised logistic regression on 15 technical features.",
    run: (b, ctx) => cachedWalkForward("ml-logreg", b, ctx, () => new LogisticRegression()),
  },
  {
    id: "ml-knn", name: "k-Nearest Neighbours", kind: "ml",
    description: "Votes of the 25 most similar historical days (standardised features).",
    run: (b, ctx) => cachedWalkForward("ml-knn", b, ctx, () => new KNN(25)),
  },
  {
    id: "ml-nb", name: "Gaussian Naive Bayes", kind: "ml",
    description: "Probabilistic classifier assuming independent Gaussian features.",
    run: (b, ctx) => cachedWalkForward("ml-nb", b, ctx, () => new GaussianNB()),
  },
  {
    id: "ml-tree", name: "Decision Tree", kind: "ml",
    description: "Single depth-4 CART tree. Interpretable but high variance.",
    run: (b, ctx) => cachedWalkForward("ml-tree", b, ctx, () => new DecisionTree(4, 40)),
  },
  {
    id: "ml-rf", name: "Random Forest", kind: "ml",
    description: "60 bootstrapped depth-5 trees with random feature subsets.",
    run: (b, ctx) => cachedWalkForward("ml-rf", b, ctx, () => new RandomForest(60, 5, 20)),
  },
  {
    id: "ml-gbm", name: "Gradient Boosting", kind: "ml",
    description: "LightGBM-style boosted trees (80 rounds, depth 3, logistic loss).",
    run: (b, ctx) => cachedWalkForward("ml-gbm", b, ctx, () => new GradientBoosting()),
  },
];

const mlEnsemble: Strategy = {
  id: "ml-ensemble", name: "ML Ensemble (avg)", kind: "ml",
  description: "Averages the probabilities of all six ML models; long when the average > 50%.",
  run: (b, ctx) => {
    const outs = mlStrategies.map((s) => s.run(b, ctx).prob!);
    const prob = b.map((_, t) => {
      const ps = outs.map((o) => o[t]).filter(finite);
      return ps.length === outs.length ? ps.reduce((a, c) => a + c, 0) / ps.length : NaN;
    });
    return { prob, pos: prob.map((p) => (finite(p) && p > 0.5 ? 1 : 0)) };
  },
};

export const STRATEGIES: Strategy[] = [
  buyHold, smaCross, emaCross, macdStrat, momentum, donchian, volTarget,
  rsiRev, rsi2, bollinger,
  ...mlStrategies, mlEnsemble,
];
