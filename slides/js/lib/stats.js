// Small numerical toolbox for the demos (seeded random numbers, normal
// distribution, LHS, MDA, linear solver).

/** Seeded PRNG (mulberry32). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  next.normal = () => {
    if (spare != null) { const s = spare; spare = null; return s; }
    let u = 0, v = 0;
    while (u === 0) u = next();
    v = next();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  next.shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  return next;
}

/** Standard normal CDF (Abramowitz-Stegun 7.1.26 on erf, |err| < 1.5e-7). */
export function normCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return 0.5 * (1 + Math.sign(x) * y);
}

/** Latin Hypercube in [0,1]^d: one sample per stratum and dimension. */
export function lhs(n, d, rand) {
  const out = Array.from({ length: n }, () => new Array(d));
  for (let j = 0; j < d; j++) {
    const perm = rand.shuffle([...Array(n).keys()]);
    for (let i = 0; i < n; i++) out[i][j] = (perm[i] + rand()) / n;
  }
  return out;
}

/** Maximum Dissimilarity selection (max-min) on points already normalised.
 *  Returns the indices in selection order; the first is the point with the
 *  largest sum of coordinates (an extreme corner). */
export function mda(points, k) {
  const n = points.length, d = points[0].length;
  let first = 0, best = -Infinity;
  for (let i = 0; i < n; i++) { const s = points[i].reduce((a, b) => a + b, 0); if (s > best) { best = s; first = i; } }
  const sel = [first], minD = new Float64Array(n).fill(Infinity);
  for (let it = 1; it < Math.min(k, n); it++) {
    const last = points[sel[sel.length - 1]];
    let arg = -1, far = -1;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < d; j++) { const q = points[i][j] - last[j]; s += q * q; }
      if (s < minD[i]) minD[i] = s;
      if (minD[i] > far) { far = minD[i]; arg = i; }
    }
    sel.push(arg);
  }
  return sel;
}

/** Solve A x = b (Gaussian elimination with partial pivoting). A is n×n (array of rows). */
export function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const piv = M[c][c] || 1e-12;
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / piv;
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / (M[r][r] || 1e-12);
  }
  return x;
}

export const quantile = (sorted, p) => {
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};
export const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
export function corr(a, b) {
  const ma = mean(a), mb = mean(b);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return sab / Math.sqrt(saa * sbb);
}
export function ranks(a) {
  const idx = [...a.keys()].sort((i, j) => a[i] - a[j]), r = new Array(a.length);
  idx.forEach((k, i) => { r[k] = i; });
  return r;
}
export const spearman = (a, b) => corr(ranks(a), ranks(b));

/** Convex hull of 2D points (monotone chain), counter-clockwise, not closed. */
export function hull2d(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Facets of the convex hull of 3D points, as planes {n, d} with n·x <= d
 *  inside. Brute force over all triples: fine for ~100 points (done once). */
export function hull3d(pts, eps = 1e-9) {
  const m = pts.length, planes = [], seen = new Set();
  for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) for (let k = j + 1; k < m; k++) {
    const [a, b, c] = [pts[i], pts[j], pts[k]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n);
    if (len < 1e-12) continue;
    n = n.map(x => x / len);
    const d = n[0] * a[0] + n[1] * a[1] + n[2] * a[2];
    let pos = 0, neg = 0;
    for (const q of pts) {
      const s = n[0] * q[0] + n[1] * q[1] + n[2] * q[2] - d;
      if (s > eps) pos++; else if (s < -eps) neg++;
      if (pos && neg) break;
    }
    if (pos && neg) continue;
    const sg = pos ? -1 : 1, nn = n.map(x => sg * x), dd = sg * d;
    const key = [...nn, dd].map(x => x.toFixed(6)).join();
    if (!seen.has(key)) { seen.add(key); planes.push({ n: nn, d: dd }); }
  }
  return planes;
}

/** Largest distance outside the hull planes (<= 0 means inside). */
export function hullOutside(planes, x) {
  let worst = -Infinity;
  for (const { n, d } of planes) worst = Math.max(worst, n[0] * x[0] + n[1] * x[1] + n[2] * x[2] - d);
  return worst;
}
