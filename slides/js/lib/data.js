// Lazy, cached loaders for slides/data/ (written by scripts/export_data.py).
import { Surrogate } from './surrogate.js';

const cache = new Map();
const base = new URL('../../data/', import.meta.url);

function once(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

export const json = name => once(`json:${name}`, async () => {
  const r = await fetch(new URL(`${name}.json`, base));
  if (!r.ok) throw new Error(`data/${name}.json: ${r.status}`);
  return r.json();
});

export const bin = (name, Type) => once(`bin:${name}`, async () => {
  const r = await fetch(new URL(`${name}.bin`, base));
  if (!r.ok) throw new Error(`data/${name}.bin: ${r.status}`);
  return new Type(await r.arrayBuffer());
});

/** int16 centimetres -> Float32 metres (nodata -> NaN). */
export function cmToM(a, nodata = -32768) {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] === nodata ? NaN : a[i] / 100;
  return out;
}

/** Everything the flood maps need: DEM, DEM -> cell index, PCA basis. */
export const floodData = () => once('flood', async () => {
  const [domain, demCm, cell, basis] = await Promise.all([
    json('domain'), bin('dem_cm', Int16Array), bin('dem_cell', Uint16Array),
    bin('pca_basis', Float32Array),
  ]);
  const dem = cmToM(demCm, domain.dem.nodata);
  return { domain, dem, cell, basis, nCells: domain.grid.nCells };
});

/** The RBF + PCA surrogate of notebook 02. */
export const surrogate = () => once('surrogate', async () => {
  const [fd, sur] = await Promise.all([floodData(), json('surrogate')]);
  return new Surrogate(sur, fd.basis, fd.nCells);
});

/** Daily dates from an ISO start date. */
export function dailyDates(start, n) {
  const t0 = Date.parse(start + 'T00:00:00Z');
  return Array.from({ length: n }, (_, i) => new Date(t0 + i * 864e5).toISOString().slice(0, 10));
}
