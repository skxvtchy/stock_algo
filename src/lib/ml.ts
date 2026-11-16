// Small, dependency-free binary classifiers. Each predicts P(next day is up).

export interface Classifier {
  fit(X: number[][], y: number[]): void;
  predict(x: number[]): number; // probability of class 1
}

/** Seeded PRNG so results are reproducible run to run. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

/** Z-score scaler fitted on training data only. */
class Scaler {
  mu: number[] = [];
  sd: number[] = [];
  fit(X: number[][]) {
    const d = X[0].length, n = X.length;
    this.mu = new Array(d).fill(0);
    this.sd = new Array(d).fill(0);
    for (const r of X) r.forEach((v, j) => (this.mu[j] += v / n));
    for (const r of X) r.forEach((v, j) => (this.sd[j] += (v - this.mu[j]) ** 2 / n));
    this.sd = this.sd.map((s) => Math.sqrt(s) || 1);
    return this;
  }
  t(x: number[]) {
    return x.map((v, j) => (v - this.mu[j]) / this.sd[j]);
  }
}

// ---------------------------------------------------------------- Logistic regression

export class LogisticRegression implements Classifier {
  private w: number[] = [];
  private b = 0;
  private s = new Scaler();
  constructor(private l2 = 0.01, private epochs = 300, private lr = 0.1) {}

  fit(X: number[][], y: number[]) {
    this.s.fit(X);
    const Z = X.map((r) => this.s.t(r));
    const n = Z.length, d = Z[0].length;
    this.w = new Array(d).fill(0);
    this.b = 0;
    for (let e = 0; e < this.epochs; e++) {
      const gw = new Array(d).fill(0);
      let gb = 0;
      for (let i = 0; i < n; i++) {
        let z = this.b;
        for (let j = 0; j < d; j++) z += this.w[j] * Z[i][j];
        const err = sigmoid(z) - y[i];
        for (let j = 0; j < d; j++) gw[j] += err * Z[i][j];
        gb += err;
      }
      for (let j = 0; j < d; j++) this.w[j] -= this.lr * (gw[j] / n + this.l2 * this.w[j]);
      this.b -= (this.lr * gb) / n;
    }
  }

  predict(x: number[]) {
    const z = this.s.t(x).reduce((acc, v, j) => acc + v * this.w[j], this.b);
    return sigmoid(z);
  }
}

// ---------------------------------------------------------------- k-nearest neighbours

export class KNN implements Classifier {
  private Z: number[][] = [];
  private y: number[] = [];
  private s = new Scaler();
  constructor(private k = 25) {}

  fit(X: number[][], y: number[]) {
    this.s.fit(X);
    this.Z = X.map((r) => this.s.t(r));
    this.y = y;
  }

  predict(x: number[]) {
    const q = this.s.t(x);
    const dist = this.Z.map((r, i) => {
      let d = 0;
      for (let j = 0; j < r.length; j++) d += (r[j] - q[j]) ** 2;
      return [d, this.y[i]] as const;
    });
    dist.sort((a, b) => a[0] - b[0]);
    const k = Math.min(this.k, dist.length);
    let up = 0;
    for (let i = 0; i < k; i++) up += dist[i][1];
    return up / k;
  }
}

// ---------------------------------------------------------------- Gaussian naive Bayes

export class GaussianNB implements Classifier {
  private prior = [0.5, 0.5];
  private mu: number[][] = [[], []];
  private va: number[][] = [[], []];

  fit(X: number[][], y: number[]) {
    const d = X[0].length;
    for (const c of [0, 1]) {
      const rows = X.filter((_, i) => y[i] === c);
      const n = Math.max(rows.length, 1);
      this.prior[c] = rows.length / X.length || 0.5;
      this.mu[c] = new Array(d).fill(0);
      this.va[c] = new Array(d).fill(0);
      for (const r of rows) r.forEach((v, j) => (this.mu[c][j] += v / n));
      for (const r of rows) r.forEach((v, j) => (this.va[c][j] += (v - this.mu[c][j]) ** 2 / n));
      this.va[c] = this.va[c].map((v) => v + 1e-9);
    }
  }

  predict(x: number[]) {
    const ll = [0, 1].map((c) => {
      let s = Math.log(this.prior[c] || 1e-9);
      x.forEach((v, j) => {
        s += -0.5 * Math.log(2 * Math.PI * this.va[c][j]) - (v - this.mu[c][j]) ** 2 / (2 * this.va[c][j]);
      });
      return s;
    });
    return sigmoid(ll[1] - ll[0]);
  }
}

// ---------------------------------------------------------------- Histogram regression tree
// Shared by decision tree, random forest and gradient boosting. Features are pre-binned
// into quantile buckets so split search is O(rows × features) per node.

const N_BINS = 32;

class Binner {
  edges: number[][] = [];
  fit(X: number[][]) {
    const d = X[0].length;
    this.edges = [];
    for (let j = 0; j < d; j++) {
      const col = X.map((r) => r[j]).sort((a, b) => a - b);
      const e: number[] = [];
      for (let b = 1; b < N_BINS; b++) e.push(col[Math.floor((b / N_BINS) * (col.length - 1))]);
      this.edges.push(e);
    }
    return this;
  }
  bin(x: number[]): Uint8Array {
    const out = new Uint8Array(x.length);
    x.forEach((v, j) => {
      const e = this.edges[j];
      let lo = 0, hi = e.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (v > e[mid]) lo = mid + 1;
        else hi = mid;
      }
      out[j] = lo;
    });
    return out;
  }
}

type Node = { leaf: number } | { f: number; bin: number; l: Node; r: Node };

interface TreeOpts {
  maxDepth: number;
  minLeaf: number;
  featureFrac: number; // fraction of features considered at each split
  rand: () => number;
  /** Leaf value from the rows that land in it (default: mean of targets). */
  leafValue?: (rows: number[]) => number;
}

function buildTree(B: Uint8Array[], t: number[], rows: number[], depth: number, o: TreeOpts): Node {
  const mean = () => rows.reduce((s, i) => s + t[i], 0) / rows.length;
  const leaf = (): Node => ({ leaf: o.leafValue ? o.leafValue(rows) : mean() });
  if (depth >= o.maxDepth || rows.length < 2 * o.minLeaf) return leaf();

  const d = B[0].length;
  const feats: number[] = [];
  for (let j = 0; j < d; j++) if (o.rand() < o.featureFrac) feats.push(j);
  if (feats.length === 0) feats.push(Math.floor(o.rand() * d));

  let totS = 0;
  for (const i of rows) totS += t[i];
  const totN = rows.length;
  let best = { gain: 1e-12, f: -1, bin: -1 };
  const cnt = new Float64Array(N_BINS), sum = new Float64Array(N_BINS);

  for (const f of feats) {
    cnt.fill(0);
    sum.fill(0);
    for (const i of rows) {
      cnt[B[i][f]]++;
      sum[B[i][f]] += t[i];
    }
    let ln = 0, ls = 0;
    for (let b = 0; b < N_BINS - 1; b++) {
      ln += cnt[b];
      ls += sum[b];
      const rn = totN - ln;
      if (ln < o.minLeaf || rn < o.minLeaf) continue;
      const rs = totS - ls;
      // Reduction in squared error = between-group variance.
      const gain = (ls * ls) / ln + (rs * rs) / rn - (totS * totS) / totN;
      if (gain > best.gain) best = { gain, f, bin: b };
    }
  }
  if (best.f < 0) return leaf();
  const L: number[] = [], R: number[] = [];
  for (const i of rows) (B[i][best.f] <= best.bin ? L : R).push(i);
  return {
    f: best.f,
    bin: best.bin,
    l: buildTree(B, t, L, depth + 1, o),
    r: buildTree(B, t, R, depth + 1, o),
  };
}

function evalTree(n: Node, xb: Uint8Array): number {
  while (!("leaf" in n)) n = xb[n.f] <= n.bin ? n.l : n.r;
  return n.leaf;
}

export class DecisionTree implements Classifier {
  private root: Node = { leaf: 0.5 };
  private binner = new Binner();
  constructor(private maxDepth = 4, private minLeaf = 40) {}

  fit(X: number[][], y: number[]) {
    this.binner.fit(X);
    const B = X.map((r) => this.binner.bin(r));
    const rows = y.map((_, i) => i);
    this.root = buildTree(B, y, rows, 0, {
      maxDepth: this.maxDepth, minLeaf: this.minLeaf, featureFrac: 1, rand: Math.random,
    });
  }

  predict(x: number[]) {
    return evalTree(this.root, this.binner.bin(x));
  }
}

export class RandomForest implements Classifier {
  private trees: Node[] = [];
  private binner = new Binner();
  constructor(private nTrees = 60, private maxDepth = 5, private minLeaf = 20, private seed = 7) {}

  fit(X: number[][], y: number[]) {
    const rand = mulberry32(this.seed);
    this.binner.fit(X);
    const B = X.map((r) => this.binner.bin(r));
    const n = X.length;
    const featureFrac = Math.sqrt(X[0].length) / X[0].length;
    this.trees = [];
    for (let k = 0; k < this.nTrees; k++) {
      const rows = Array.from({ length: n }, () => Math.floor(rand() * n)); // bootstrap
      this.trees.push(buildTree(B, y, rows, 0, { maxDepth: this.maxDepth, minLeaf: this.minLeaf, featureFrac, rand }));
    }
  }

  predict(x: number[]) {
    const xb = this.binner.bin(x);
    return this.trees.reduce((s, t) => s + evalTree(t, xb), 0) / this.trees.length;
  }
}

/** Gradient boosted trees with logistic loss (Newton leaf values), LightGBM-style. */
export class GradientBoosting implements Classifier {
  private trees: Node[] = [];
  private base = 0;
  private binner = new Binner();
  constructor(
    private nRounds = 80, private lr = 0.05, private maxDepth = 3,
    private minLeaf = 30, private subsample = 0.8, private seed = 11,
  ) {}

  fit(X: number[][], y: number[]) {
    const rand = mulberry32(this.seed);
    this.binner.fit(X);
    const B = X.map((r) => this.binner.bin(r));
    const n = X.length;
    const p0 = Math.min(0.99, Math.max(0.01, y.reduce((a, b) => a + b, 0) / n));
    this.base = Math.log(p0 / (1 - p0));
    const F = new Float64Array(n).fill(this.base);
    const P = new Float64Array(n);
    this.trees = [];
    for (let m = 0; m < this.nRounds; m++) {
      const grad: number[] = new Array(n);
      for (let i = 0; i < n; i++) {
        P[i] = sigmoid(F[i]);
        grad[i] = y[i] - P[i];
      }
      const rows: number[] = [];
      for (let i = 0; i < n; i++) if (rand() < this.subsample) rows.push(i);
      const tree = buildTree(B, grad, rows, 0, {
        maxDepth: this.maxDepth, minLeaf: this.minLeaf, featureFrac: 0.8, rand,
        leafValue: (rs) => {
          let g = 0, h = 0;
          for (const i of rs) {
            g += grad[i];
            h += P[i] * (1 - P[i]);
          }
          return g / (h + 1e-6);
        },
      });
      this.trees.push(tree);
      for (let i = 0; i < n; i++) F[i] += this.lr * evalTree(tree, B[i]);
    }
  }

  predict(x: number[]) {
    const xb = this.binner.bin(x);
    return sigmoid(this.trees.reduce((s, t) => s + this.lr * evalTree(t, xb), this.base));
  }
}
