// Notebook 03: weather types, Gaussian copulas and the emulated climate.
import { json, dailyDates } from '../lib/data.js';
import { plot, onResize } from '../lib/plot.js';
import { C, divColor, plotlyDiverging, DWT_COLORS } from '../lib/colors.js';
import { h, slider, buttons, button } from '../lib/ui.js';
import { rng, normCdf, spearman, quantile } from '../lib/stats.js';

/* ---------- weather type maps (canvas) ---------- */
function drawPattern(canvas, w, k, vmax) {
  const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const nlat = w.lat.length, nlon = w.lon.length, pat = w.patterns[k];
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = x / (W - 1) * (nlon - 1), gy = y / (H - 1) * (nlat - 1);
      const i0 = Math.min(nlon - 2, Math.floor(gx)), j0 = Math.min(nlat - 2, Math.floor(gy)), fx = gx - i0, fy = gy - j0;
      const v = (pat[j0 * nlon + i0] * (1 - fx) + pat[j0 * nlon + i0 + 1] * fx) * (1 - fy) + (pat[(j0 + 1) * nlon + i0] * (1 - fx) + pat[(j0 + 1) * nlon + i0 + 1] * fx) * fy;
      const [r, g, b] = divColor(Math.max(-1, Math.min(1, v / vmax)));
      const p = 4 * (y * W + x);
      img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = b; img.data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const lon0 = w.lon[0], lon1 = w.lon[nlon - 1], lat0 = w.lat[0], lat1 = w.lat[nlat - 1];
  const X = lon => (lon - lon0) / (lon1 - lon0) * W, Y = lat => (lat - lat0) / (lat1 - lat0) * H;
  ctx.strokeStyle = 'rgba(11,34,51,.75)'; ctx.lineWidth = Math.max(0.8, W / 140);
  for (const line of w.coast) {
    ctx.beginPath();
    for (let i = 0; i < line.length; i += 2) { const px = X(line[i]), py = Y(line[i + 1]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke();
  }
  ctx.fillStyle = '#C2185B';
  ctx.beginPath(); ctx.arc(X(w.site[0]), Y(w.site[1]), Math.max(2, W / 45), 0, 2 * Math.PI); ctx.fill();
}

async function dwt(el) {
  const [w, hist] = await Promise.all([json('weather'), json('history')]);
  const n = w.patterns.length;
  const vmax = 14;
  const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '.35em', height: '100%', aspectRatio: '1', maxWidth: '100%' }, 'data-prevent-swipe': '' });
  const big = h('canvas', { width: 360, height: 360, style: { width: '100%', borderRadius: '.4em', aspectRatio: '1' } });
  const info = h('div', { class: 'stack tight' });
  const barDiv = h('div', { class: 'plot', style: { height: '9em' } });
  el.append(h('div', { class: 'cols', style: { height: '100%', gridTemplateColumns: 'auto 1fr' } },
    grid,
    h('div', { class: 'cols c2', style: { alignContent: 'start' } },
      h('div', { class: 'stack tight' }, big, h('div', { class: 'colorbar' }, h('div', {}, 'Sea level pressure anomaly [hPa]'), h('div', { class: 'bar', style: { background: 'linear-gradient(90deg,#2A4D9B,#8FB2DD,#F7F7F2,#EBA58A,#B2343A)' } }), h('div', { class: 'ticks' }, h('span', {}, `−${vmax}`), h('span', {}, '0'), h('span', {}, `+${vmax}`)))),
      h('div', { class: 'stack' }, info, barDiv))));
  const mean = a => { const v = a.filter(x => x != null); return v.reduce((s, x) => s + x, 0) / v.length; };
  const overall = { precip: mean(hist.precip), ss: mean(hist.surge.map((s, i) => s + hist.setup[i])), q: mean(hist.Q) };
  const cells = [];
  for (let k = 0; k < n; k++) {
    const c = h('canvas', { width: 84, height: 84, style: { width: '100%', height: '100%', borderRadius: '.25em', display: 'block' } });
    drawPattern(c, w, k, vmax);
    const cellEl = h('div', { style: { position: 'relative', cursor: 'pointer', outline: '2px solid transparent', borderRadius: '.3em', transition: 'outline-color .2s' } }, c,
      h('span', { style: { position: 'absolute', left: '.25em', top: '.1em', fontFamily: 'var(--font-mono)', fontSize: '.5em', fontWeight: 600, color: '#0B2233', textShadow: '0 0 3px white' } }, `${k + 1}`),
      h('span', { style: { position: 'absolute', right: '.25em', bottom: '.1em', fontFamily: 'var(--font-mono)', fontSize: '.42em', color: '#0B2233', textShadow: '0 0 3px white' } }, `${(100 * w.freq[k]).toFixed(1)}%`));
    cellEl.addEventListener('click', () => select(k));
    grid.append(cellEl); cells.push(cellEl);
  }
  let cur = 0;
  function select(k) {
    cur = k;
    cells.forEach((c, i) => { c.style.outlineColor = i === k ? 'var(--accent)' : 'transparent'; });
    drawPattern(big, w, k, vmax);
    const [cnt, pr, ss, q] = w.stats[k];
    info.innerHTML = `<h3>Weather type ${k + 1}</h3><p class="small muted">${(100 * w.freq[k]).toFixed(1)}% of the days 1979–2018 · ${cnt} days with local data (2008–2018)</p>`;
    const rel = [pr / overall.precip, ss / overall.ss, q / overall.q];
    plot(barDiv, [{ x: ['Rain', 'Surge + setup', 'Q'], y: rel, type: 'bar', marker: { color: [C.rain, C.sea, C.river] }, text: [`${pr.toFixed(1)} mm`, `${ss.toFixed(2)} m`, `${q.toFixed(0)} m³/s`], textposition: 'outside', cliponaxis: false, hovertemplate: '%{x}: %{y:.2f} × the average day<extra></extra>' }],
      { yaxis: { title: '× average day', range: [0, Math.max(2.2, ...rel) * 1.15] }, shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 1, y1: 1, line: { color: C.muted, dash: 'dot' } }], margin: { t: 14, b: 26 } });
  }
  // the type with the most rain, as a good first example
  select(w.stats.reduce((b, s, i) => (s[1] > w.stats[b][1] ? i : b), 0));
  onResize(barDiv, () => select(cur));
  return {};
}

/* ---------- Gaussian copula, step by step ---------- */
function copula(el) {
  const n = 1200, r = rng(4);
  const a = Array.from({ length: n }, () => r.normal()), b = Array.from({ length: n }, () => r.normal());
  const div = h('div', { class: 'plot' });
  const rho = slider({ label: 'Correlation ρ (in the normal space)', min: -0.95, max: 0.95, step: 0.05, value: 0.7, fmt: v => v.toFixed(2), onInput: render });
  const out = h('div', { class: 'readout' });
  el.append(h('div', { class: 'stack', style: { height: '100%' } }, h('div', { class: 'grow' }, div), h('div', { class: 'row', style: { gap: '2em' } }, h('div', { style: { flex: 1 } }, rho), out)));
  // marginals: rain ~ exponential (mean 8 mm), surge ~ Gumbel(0.25, 0.1)
  const rain = u => -8 * Math.log(1 - u), surge = u => 0.25 - 0.1 * Math.log(-Math.log(u));
  function render() {
    const p = rho.value(), s = Math.sqrt(1 - p * p);
    const z1 = a, z2 = a.map((v, i) => p * v + s * b[i]);
    const u1 = z1.map(normCdf), u2 = z2.map(normCdf);
    const x1 = u1.map(rain), x2 = u2.map(surge);
    const m = (x, y, ax, col) => ({ x, y, type: 'scattergl', mode: 'markers', marker: { size: 3.5, color: col, opacity: 0.55 }, xaxis: `x${ax}`, yaxis: `y${ax}`, hoverinfo: 'skip' });
    plot(div, [m(z1, z2, '', C.indigo), m(u1, u2, 2, C.accent2), m(x1, x2, 3, C.rain)], {
      grid: { rows: 1, columns: 3, pattern: 'independent', xgap: 0.14 },
      xaxis: { title: 'z₁', range: [-3.5, 3.5] }, yaxis: { title: 'z₂', range: [-3.5, 3.5] },
      xaxis2: { title: 'u₁ = Φ(z₁)', range: [0, 1] }, yaxis2: { title: 'u₂ = Φ(z₂)', range: [0, 1] },
      xaxis3: { title: 'Rain = F⁻¹(u₁) [mm]', range: [0, 45] }, yaxis3: { title: 'Surge = G⁻¹(u₂) [m]', range: [-0.1, 0.85] },
      annotations: [['1 · correlated normals', ''], ['2 · normal CDF → uniforms', 2], ['3 · inverse CDFs → any marginal', 3]].map(([t, ax]) => ({ text: `<b>${t}</b>`, xref: `x${ax} domain`, yref: `y${ax} domain`, x: 0, y: 1.08, xanchor: 'left', showarrow: false, font: { size: 13 } })),
      margin: { t: 34 },
    });
    out.innerHTML = `Spearman ρ: normals <b>${spearman(z1, z2).toFixed(2)}</b> · uniforms <b>${spearman(u1, u2).toFixed(2)}</b> · physical <b>${spearman(x1, x2).toFixed(2)}</b>`;
  }
  render(); onResize(div, render);
  return {};
}

/* ---------- one copula per weather type, simulated in the browser ---------- */
function cholesky3(R) {
  const L = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j <= i; j++) {
      let s = R[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-9)) : s / L[j][j];
    }
  }
  return L;
}

async function rhoDemo(el) {
  const [w, hist] = await Promise.all([json('weather'), json('history')]);
  const n = w.rho.length;
  const heat = h('div', { class: 'plot' }), sc = h('div', { class: 'plot' });
  const info = h('div', { class: 'readout' });
  let cur = 0, showSim = false;
  const simBtns = buttons([['obs', 'Observed days'], ['sim', '+ simulate 500 days']], { value: 'obs', onPick: k => { showSim = k === 'sim'; drawScatter(); } });
  el.append(h('div', { class: 'stack', style: { height: '100%' } },
    h('div', { style: { height: '34%' } }, heat),
    h('div', { class: 'cols c-6-4 grow' }, sc, h('div', { class: 'stack', style: { justifyContent: 'center' } }, simBtns, info,
      h('p', { class: 'tiny muted' }, 'The simulation uses the copula correlations of this type and its observed values as marginals (empirical quantiles), like notebook 03 with ECDF kernels.')))));
  const ss = hist.surge.map((s, i) => s + hist.setup[i]);
  const renderHeat = () => plot(heat, [{
    z: [0, 1, 2].map(j => w.rho.map(r => r[j])), x: w.rho.map((_, i) => i + 1), y: ['rain – surge', 'rain – Q', 'surge – Q'],
    type: 'heatmap', colorscale: plotlyDiverging, zmin: -1, zmax: 1, xgap: 2, ygap: 2,
    colorbar: { thickness: 10, len: 1, title: { text: 'ρ', side: 'right' } }, hovertemplate: 'type %{x} · %{y}: ρ = %{z:.2f}<extra></extra>',
  }], { xaxis: { title: 'Weather type (click one)', dtick: 1, showgrid: false }, yaxis: { showgrid: false }, margin: { t: 4, b: 34, l: 90 }, shapes: [{ type: 'rect', xref: 'x', yref: 'paper', x0: cur + 0.5, x1: cur + 1.5, y0: 0, y1: 1, line: { color: C.ink, width: 2.5 } }] });
  function drawScatter() {
    const k = cur + 1, rows = hist.dwt.map((d, i) => (d === k && hist.precip[i] != null && hist.Q[i] != null ? i : -1)).filter(i => i >= 0);
    const obs = { p: rows.map(i => hist.precip[i]), s: rows.map(i => ss[i]), q: rows.map(i => hist.Q[i]) };
    const traces = [{ x: obs.p, y: obs.q, type: 'scatter', mode: 'markers', marker: { size: 6, color: C.hist, opacity: 0.7 }, name: `observed (${rows.length} days)`, hovertemplate: 'rain %{x:.1f} mm · Q %{y:.0f} m³/s<extra></extra>' }];
    const [rps, rpq, rsq] = w.rho[cur];
    if (showSim && rows.length > 5 && [rps, rpq, rsq].every(v => v != null)) {
      const L = cholesky3([[1, rps, rpq], [rps, 1, rsq], [rpq, rsq, 1]]), r = rng(100 + cur), sorted = Object.fromEntries(Object.entries(obs).map(([k2, v]) => [k2, [...v].sort((x, y) => x - y)]));
      const sim = { p: [], q: [] };
      for (let i = 0; i < 500; i++) {
        const e = [r.normal(), r.normal(), r.normal()];
        const z = L.map(row => row[0] * e[0] + row[1] * e[1] + row[2] * e[2]);
        sim.p.push(quantile(sorted.p, normCdf(z[0]))); sim.q.push(quantile(sorted.q, normCdf(z[2])));
      }
      traces.unshift({ x: sim.p, y: sim.q, type: 'scattergl', mode: 'markers', marker: { size: 4, color: C.sim, opacity: 0.35 }, name: 'simulated', hoverinfo: 'skip' });
    }
    plot(sc, traces, { xaxis: { title: 'Rain [mm/day]', rangemode: 'tozero' }, yaxis: { title: 'Q [m³/s]', rangemode: 'tozero' }, showlegend: true, legend: { x: 0.98, xanchor: 'right', y: 0.98 }, margin: { t: 8 } });
    info.innerHTML = `Weather type <b>${k}</b>: ρ rain–surge <b>${rps?.toFixed(2) ?? '–'}</b> · rain–Q <b>${rpq?.toFixed(2) ?? '–'}</b> · surge–Q <b>${rsq?.toFixed(2) ?? '–'}</b>`;
  }
  const select = k => { cur = k; renderHeat(); drawScatter(); };
  renderHeat();
  heat.on('plotly_click', e => select(e.points[0].x - 1));
  select(w.rho.reduce((b, r, i) => ((r[1] ?? -1) > (w.rho[b][1] ?? -1) ? i : b), 0));
  onResize(sc, () => { renderHeat(); drawScatter(); });
  return {};
}

/* ---------- emulated series + validation ---------- */
async function emulated(el) {
  const w = await json('weather');
  const top = h('div', { class: 'plot' }), qq = h('div', { class: 'plot' });
  el.append(h('div', { class: 'stack', style: { height: '100%', gap: '.3em' } }, h('div', { style: { height: '58%' } }, top), h('div', { class: 'grow' }, qq)));
  const x = dailyDates(w.window.start, w.window.dwt.length);
  const nT = w.patterns.length, cs = [];
  DWT_COLORS.slice(0, nT).forEach((c, i) => { cs.push([i / nT, c], [(i + 1) / nT, c]); });
  const render = () => {
    plot(top, [
      { x, y: w.window.precip, type: 'bar', marker: { color: C.rain }, hovertemplate: '%{x}: %{y:.1f} mm<extra></extra>' },
      { x, y: w.window.ss, type: 'scatter', mode: 'lines', line: { color: C.sea, width: 1 }, yaxis: 'y2', hovertemplate: '%{x}: %{y:.2f} m<extra></extra>' },
      { x, y: w.window.q, type: 'scatter', mode: 'lines', line: { color: C.river, width: 1 }, yaxis: 'y3', hovertemplate: '%{x}: %{y:.0f} m³/s<extra></extra>' },
      { x, y: ['DWT'], z: [w.window.dwt], type: 'heatmap', colorscale: cs, zmin: 0.5, zmax: nT + 0.5, showscale: false, yaxis: 'y4', hovertemplate: '%{x}: type %{z}<extra></extra>' },
    ], {
      yaxis: { title: 'Rain', domain: [0.7, 1] }, yaxis2: { title: 'Surge', domain: [0.4, 0.66] }, yaxis3: { title: 'Q', domain: [0.1, 0.36] }, yaxis4: { domain: [0, 0.07], showticklabels: false },
      xaxis: { type: 'date', anchor: 'y4' }, bargap: 0, margin: { t: 6, b: 22 }, dragmode: 'zoom', hovermode: 'x',
      annotations: [{ xref: 'paper', yref: 'paper', x: 1, y: 1.02, xanchor: 'right', yanchor: 'bottom', showarrow: false, text: `simulation 1 of ${w.nSims}, ${x[0].slice(0, 4)}–${x[x.length - 1].slice(0, 4)} · drag to zoom`, font: { size: 11, color: C.muted } }],
    }, { doubleClick: 'reset' });
    const vars = [['precip', 'Rain [mm/day]', C.rain], ['ss', 'Surge + setup [m]', C.sea], ['q', 'Q [m³/s]', C.river]];
    const traces = [];
    vars.forEach(([v, , col], j) => {
      const o = w.qq[v].obs, lim = [Math.min(0, o[0]), o[o.length - 1] * 1.05];
      traces.push({ x: lim, y: lim, type: 'scatter', mode: 'lines', line: { color: C.muted, dash: 'dot', width: 1 }, xaxis: `x${j + 1}`, yaxis: `y${j + 1}`, hoverinfo: 'skip' });
      w.qq[v].sim.forEach((s, k) => traces.push({ x: o, y: s, type: 'scatter', mode: 'markers', marker: { size: 4, color: col, opacity: 0.5 + 0.2 * k }, xaxis: `x${j + 1}`, yaxis: `y${j + 1}`, hovertemplate: `sim ${k + 1}: obs %{x:.2f} · sim %{y:.2f}<extra></extra>` }));
    });
    plot(qq, traces, {
      grid: { rows: 1, columns: 3, pattern: 'independent', xgap: 0.1 },
      xaxis: { title: 'observed rain quantiles' }, yaxis: { title: 'simulated' }, xaxis2: { title: 'observed surge + setup' }, xaxis3: { title: 'observed Q' },
      margin: { t: 6, b: 34 },
    });
  };
  render(); onResize(top, render);
  return {};
}

export default { dwt, copula, rho: rhoDemo, emulated };
