// The surrogate of notebook 02 in JavaScript: RBF (gaussian kernel + linear
// term, min-max normalisation) -> 8 PCs -> inverse PCA -> water level on the
// 100 m grid -> depth on the 20 m DEM. scripts/export_data.py checks the same
// maths against bluemath-tk (rbf.predict, pca.inverse_transform and
// hydromt-sfincs downscaling) before exporting the coefficients.

export class Surrogate {
  constructor(sur, basis, nCells) {
    this.vars = sur.variables;
    this.scale = this.vars.map(v => sur.inputScale[v]);
    this.nTrain = sur.train.length / 3;
    this.train = Float64Array.from(sur.train);
    this.pcs = sur.pcs.map(p => ({ sigma2: p.sigma * p.sigma, c: Float64Array.from(p.coeff), lo: p.scale[0], span: p.scale[1] - p.scale[0] }));
    this.nPc = this.pcs.length;
    this.nCells = nCells;
    this.mean = basis.subarray(0, nCells);
    this.eofs = Array.from({ length: this.nPc }, (_, k) => basis.subarray((k + 1) * nCells, (k + 2) * nCells));
  }

  normalise(x) {
    return x.map((v, j) => (v - this.scale[j][0]) / (this.scale[j][1] - this.scale[j][0]));
  }

  /** Physical [TWL, Q, precip] -> PCs. */
  predict(x) {
    const xn = this.normalise(x), n = this.nTrain, r2 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < 3; j++) { const d = xn[j] - this.train[i * 3 + j]; s += d * d; }
      r2[i] = s;
    }
    return this.pcs.map(p => {
      let y = p.c[n];
      for (let i = 0; i < n; i++) y += p.c[i] * Math.exp(-0.5 * r2[i] / p.sigma2);
      for (let j = 0; j < 3; j++) y += p.c[n + 1 + j] * xn[j];
      return y * p.span + p.lo;
    });
  }

  /** PCs -> water level of the active cells (first k PCs only if k given). */
  level(pcs, out = new Float32Array(this.nCells), k = this.nPc) {
    out.set(this.mean);
    for (let p = 0; p < k; p++) {
      const w = pcs[p], e = this.eofs[p];
      for (let c = 0; c < this.nCells; c++) out[c] += w * e[c];
    }
    return out;
  }
}

/** Water depth on the DEM: max(level[cell] - DEM, 0); NaN outside the model. */
export function depthOnDem(level, dem, cell, out = new Float32Array(dem.length), nodata = 65535) {
  for (let p = 0; p < dem.length; p++) {
    const c = cell[p];
    if (c === nodata) { out[p] = NaN; continue; }
    const z = dem[p];
    out[p] = Number.isNaN(z) ? 0 : Math.max(level[c] - z, 0);
  }
  return out;
}

/** Flooded land area [km²] (DEM > 0 and depth > hmin), 20 m pixels. */
export function floodedLand(depth, dem, hmin = 0.1, px = 20) {
  let n = 0;
  for (let p = 0; p < dem.length; p++) if (dem[p] > 0 && depth[p] > hmin) n++;
  return n * px * px / 1e6;
}
