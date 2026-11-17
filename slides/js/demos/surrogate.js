// Notebook 02: RBF in 1D, the live surrogate and the k-fold validation.
import { json, surrogate as loadSurrogate } from '../lib/data.js';
import { createMap } from '../lib/map.js';
import { depthOnDem, floodedLand } from '../lib/surrogate.js';
import { plot, onResize } from '../lib/plot.js';
import { C } from '../lib/colors.js';
import { h, slider, buttons, button, reduceMotion } from '../lib/ui.js';
import { solve, hull2d, hull3d, hullOutside } from '../lib/stats.js';

/* ---------- RBF in 1D ---------- */
function rbf1d(el) {
  const truth = x => 0.6 * Math.sin(2 * Math.PI * x * 1.3) + 0.8 * x;
  const init = [0.03, 0.18, 0.31, 0.47, 0.62, 0.79, 0.95];
  let xs = [...init];
  const xg = Array.from({ length: 301 }, (_, i) => i / 300);
  const div = h('div', { class: 'plot', style: { cursor: 'crosshair' } });
  const sig = slider({ label: 'σ (reach of each bump)', min: 0.02, max: 0.5, step: 0.01, value: 0.12, fmt: v => v.toFixed(2), onInput: render });
  let showBumps = true;
  const tog = buttons([['on', 'Show the bumps'], ['off', 'Hide them']], { value: 'on', onPick: k => { showBumps = k === 'on'; render(); } });
  el.append(h('div', { class: 'stack', style: { height: '100%' } }, h('div', { class: 'grow' }, div),
    h('div', { class: 'row' }, h('div', { style: { flex: 1 } }, sig), tog, button('Reset points', () => { xs = [...init]; render(); }))));
  const K = (r, s) => Math.exp(-0.5 * r * r / (s * s));
  function fit(s) {
    const n = xs.length, ys = xs.map(truth);
    const A = Array.from({ length: n + 2 }, () => new Array(n + 2).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) A[i][j] = K(xs[i] - xs[j], s);
      A[i][n] = 1; A[i][n + 1] = xs[i]; A[n][i] = 1; A[n + 1][i] = xs[i];
    }
    return solve(A, [...ys, 0, 0]);
  }
  function render() {
    const s = sig.value(), w = fit(s), n = xs.length;
    const trend = x => w[n] + w[n + 1] * x;
    const f = x => trend(x) + xs.reduce((acc, xi, i) => acc + w[i] * K(x - xi, s), 0);
    const traces = [
      { x: xg, y: xg.map(truth), type: 'scatter', mode: 'lines', line: { color: '#9FB3C8', dash: 'dash', width: 2 }, name: 'true function', hoverinfo: 'skip' },
    ];
    if (showBumps) xs.forEach((xi, i) => traces.push({ x: xg, y: xg.map(x => trend(x) + w[i] * K(x - xi, s)), type: 'scatter', mode: 'lines', line: { color: C.lavender, width: 1.3 }, hoverinfo: 'skip' }));
    if (showBumps) traces.push({ x: xg, y: xg.map(trend), type: 'scatter', mode: 'lines', line: { color: C.sand, width: 1.5, dash: 'dot' }, name: 'linear trend', hoverinfo: 'skip' });
    traces.push({ x: xg, y: xg.map(f), type: 'scatter', mode: 'lines', line: { color: C.accent, width: 3.5 }, name: 'RBF', hovertemplate: 'x %{x:.2f} · f %{y:.2f}<extra></extra>' });
    traces.push({ x: xs, y: xs.map(truth), type: 'scatter', mode: 'markers', marker: { size: 12, color: C.hist, line: { color: 'white', width: 2 } }, name: 'training', hovertemplate: 'training point<extra></extra>' });
    plot(div, traces, { xaxis: { range: [0, 1], title: 'input x (normalised)' }, yaxis: { range: [-1, 1.8], title: 'output' }, margin: { t: 10 } });
  }
  div.addEventListener('click', e => {
    const xa = div._fullLayout?.xaxis; if (!xa) return;
    const x = xa.p2l(e.clientX - div.getBoundingClientRect().left - xa._offset);
    if (x > 0 && x < 1 && !xs.some(v => Math.abs(v - x) < 0.01)) { xs.push(x); render(); }
  });
  render(); onResize(div, render);
  return {};
}

/* ---------- live surrogate ---------- */
async function surrogateLive(el) {
  const [sur, sj] = await Promise.all([loadSurrogate(), json('surrogate')]);
  const ctl = h('div', { class: 'controls-panel', style: { alignContent: 'start' } });
  const mapBox = h('div', { class: 'fill', style: { position: 'relative' } });
  const side = h('div', { class: 'stack', style: { height: '100%' } });
  el.append(h('div', { class: 'cols', style: { height: '100%', gridTemplateColumns: '27fr 33fr 40fr' } }, ctl, mapBox, side));
  const map = await createMap(mapBox, { colorbar: 'depth' });
  map.defaultMarkers();
  const { dem, cell, domain } = map.fd;
  const lvl = new Float32Array(sur.nCells), depth = new Float32Array(dem.length);
  const sc = sj.inputScale;
  const twl = slider({ label: '<b class="sea">TWL</b>', min: sc.TWL[0], max: sc.TWL[1], step: 0.01, value: 2.5, cls: 'sea', fmt: v => `${v.toFixed(2)} m`, onInput: update });
  const q = slider({ label: '<b class="river">Q</b>', min: Math.ceil(sc.Q[0]), max: Math.floor(sc.Q[1]), step: 1, value: 50, cls: 'river', fmt: v => `${v} m³/s`, onInput: update });
  const p = slider({ label: '<b class="rain">Rain</b>', min: Math.ceil(sc.precip_acum[0]), max: Math.floor(sc.precip_acum[1]), step: 1, value: 10, cls: 'rain', fmt: v => `${v} mm`, onInput: update });
  // all inside the hull of the 100 cases, except the last one
  const presets = { calm: [0.8, 40, 8], sea: [2.8, 60, 15], river: [1.0, 1000, 80], rain: [1.0, 250, 85], all: [2.9, 1100, 110], out: [0.5, 1150, 5] };
  const pb = buttons([['calm', 'Calm'], ['sea', 'Storm surge'], ['river', 'River flood'], ['rain', 'Heavy rain'], ['all', 'Everything'], ['out', 'Big river, no rain']], {
    onPick: k => { const [a, b, c] = presets[k]; twl.set(a); q.set(b); p.set(c); update(true); },
  });
  const stats = h('div', { class: 'stat-row' });
  const ptx = h('div', { class: 'readout' });
  ctl.append(twl, q, p, h('div', { class: 'small muted' }, 'Presets'), pb, stats, ptx, map.colorbar);
  const pl1 = h('div', { class: 'plot' }), pl2 = h('div', { class: 'plot' });
  side.append(h('div', { class: 'small muted' }, 'Where is your day among the 100 SFINCS runs? The line is their convex hull.'), h('div', { class: 'grow' }, pl1), h('div', { class: 'grow' }, pl2));
  const tr = sj.trainPhysical, T = i => tr[3 * i], Qi = i => tr[3 * i + 1], Pi = i => tr[3 * i + 2];
  const idx = [...Array(tr.length / 3).keys()];
  // Extrapolation check: is the day inside the convex hull of the 100 SFINCS
  // cases (in the normalised 3D input space)? The plots show 2D projections.
  const norm = x => x.map((v, j) => (v - [sc.TWL, sc.Q, sc.precip_acum][j][0]) / ([sc.TWL, sc.Q, sc.precip_acum][j][1] - [sc.TWL, sc.Q, sc.precip_acum][j][0]));
  const planes = hull3d(idx.map(i => norm([T(i), Qi(i), Pi(i)])));
  const closed = pts => { const hl = hull2d(pts); return { x: [...hl.map(p => p[0]), hl[0][0]], y: [...hl.map(p => p[1]), hl[0][1]] }; };
  const h1 = closed(idx.map(i => [Qi(i), T(i)])), h2 = closed(idx.map(i => [Qi(i), Pi(i)]));
  const RED = '#D1495B';
  const alert = h('div', { class: 'extrap-alert', html: '<b>⚠ Extrapolating</b>this combination of TWL, Q and rain is outside the 100 SFINCS cases: the map is not reliable' });
  mapBox.append(alert);
  function side2(x) {
    const out = hullOutside(planes, norm(x)) > 1e-6;
    alert.classList.toggle('on', out);
    const common = { type: 'scatter', mode: 'markers', hoverinfo: 'skip' };
    const hullTr = hh => ({ ...hh, type: 'scatter', mode: 'lines', fill: 'toself', fillcolor: out ? 'rgba(209,73,91,.07)' : 'rgba(47,109,181,.04)', line: { color: out ? RED : '#9FB3C8', width: out ? 2.5 : 1.2, dash: out ? 'solid' : 'dot' }, hoverinfo: 'skip' });
    const star = (xx, yy) => ({ ...common, x: [xx], y: [yy], marker: { size: 16, color: out ? RED : C.hist, symbol: 'star', line: { color: 'white', width: 1.5 } } });
    const msg = out ? [{ xref: 'paper', yref: 'paper', x: 0.98, y: 0.98, xanchor: 'right', yanchor: 'top', showarrow: false, text: '<b>extrapolation</b>', font: { size: 12, color: RED }, bgcolor: 'rgba(255,255,255,.85)' }] : [];
    plot(pl1, [hullTr(h1),
      { ...common, x: idx.map(Qi), y: idx.map(T), marker: { size: 6, color: '#9FB3C8' } },
      star(x[1], x[0]),
    ], { xaxis: { title: 'Q [m³/s]', range: [0, 1200] }, yaxis: { title: 'TWL [m]', range: [0.2, 3.1] }, margin: { t: 6, b: 30 }, annotations: msg });
    plot(pl2, [hullTr(h2),
      { ...common, x: idx.map(Qi), y: idx.map(Pi), marker: { size: 6, color: '#9FB3C8' } },
      star(x[1], x[2]),
    ], { xaxis: { title: 'Q [m³/s]', range: [0, 1200] }, yaxis: { title: 'Rain [mm]', range: [0, 125] }, margin: { t: 6, b: 30 }, annotations: msg });
  }
  let pending = false, lastSide = 0;
  function update(force) {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const x = [twl.value(), q.value(), p.value()];
      const t0 = performance.now();
      sur.level(sur.predict(x), lvl);
      depthOnDem(lvl, dem, cell, depth);
      const ms = performance.now() - t0;
      map.set(depth);
      stats.innerHTML = `<div class="s"><span class="v">${floodedLand(depth, dem).toFixed(1)} km²</span><span class="k">land flooded</span></div><div class="s"><span class="v">${ms < 1 ? '<1' : ms.toFixed(0)} ms</span><span class="k">RBF + PCA + DEM</span></div>`;
      ptx.innerHTML = Object.entries(domain.points).map(([k, v]) => `${k}: level <b>${lvl[v.cell].toFixed(2)} m</b>`).join('<br>');
      if (force === true || performance.now() - lastSide > 120) { side2(x); lastSide = performance.now(); }
      else setTimeout(() => side2([twl.value(), q.value(), p.value()]), 130);
    });
  }
  update(true);
  onResize(pl1, () => update(true));
  return {};
}

/* ---------- k-fold ---------- */
async function kfold(el) {
  const k = await json('kfold');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 300 330');
  svg.style.cssText = 'width:100%;height:100%';
  const cap = h('div', { class: 'readout', style: { textAlign: 'center' } });
  const div = h('div', { class: 'plot' });
  el.append(h('div', { class: 'cols c-35-65', style: { height: '100%' } },
    h('div', { class: 'stack', style: { height: '100%' } }, h('h3', {}, '5 folds of 20 cases'), h('div', { class: 'grow' }, svg), cap),
    h('div', { class: 'stack', style: { height: '100%' } }, h('h3', {}, 'Error on cases the RBF never saw'), h('div', { class: 'grow' }, div))));
  const cols = ['#5B6BB8', '#2A9D8F', '#C47A45', '#D1495B', '#8E6CBE'];
  const dots = k.folds.map((f, i) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', 30 + (i % 10) * 27); c.setAttribute('cy', 30 + Math.floor(i / 10) * 27); c.setAttribute('r', 10);
    c.setAttribute('fill', cols[f]); c.style.transition = 'opacity .3s, r .3s';
    svg.append(c);
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', 30 + (i % 10) * 27); t.setAttribute('y', 33.5 + Math.floor(i / 10) * 27); t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', 8); t.setAttribute('fill', 'white'); t.setAttribute('font-family', 'IBM Plex Mono'); t.textContent = i;
    svg.append(t);
    return c;
  });
  let fold = -1, timer = null;
  function step() {
    fold = (fold + 1) % 6;
    dots.forEach((c, i) => {
      const test = k.folds[i] === fold;
      c.style.opacity = fold === 5 || test ? 1 : 0.22;
      c.setAttribute('r', test ? 12 : 10);
    });
    cap.innerHTML = fold === 5 ? 'every case is predicted once, by a model that did not use it' : `fold ${fold + 1}: fit on the other 80, <b>predict these 20</b>`;
  }
  const render = () => plot(div, [
    { x: [...k.nTrain, ...[...k.nTrain].reverse()], y: [...k.p95, ...[...k.p05].reverse()], type: 'scatter', fill: 'toself', fillcolor: 'rgba(47,109,181,.15)', line: { width: 0 }, hoverinfo: 'skip', name: '5–95%' },
    { x: k.nTrain, y: k.mean, type: 'scatter', mode: 'lines+markers', line: { color: C.accent, width: 3 }, marker: { size: 9 }, hovertemplate: 'N = %{x}: mean RMSE %{y:.3f} m<extra></extra>', name: 'mean' },
  ], {
    xaxis: { title: 'Number of SFINCS runs used to train (first N of the MDA)', dtick: 10 }, yaxis: { title: 'Water depth RMSE [m]', rangemode: 'tozero' },
    showlegend: true, legend: { x: 0.98, xanchor: 'right', y: 0.98 },
    annotations: [{ x: 10, y: k.mean[0], text: '10 runs: the corners only', ax: 60, ay: -10, font: { size: 12 }, arrowcolor: C.muted },
      { x: 40, y: k.mean[3], text: 'little gain after ~30–40 runs', ax: 30, ay: -60, font: { size: 12 }, arrowcolor: C.muted }],
  });
  render(); onResize(div, render);
  step();
  return {
    show() { clearInterval(timer); if (!reduceMotion()) timer = setInterval(step, 1500); },
    hide() { clearInterval(timer); },
  };
}

export default { 'rbf-1d': rbf1d, 'surrogate-live': surrogateLive, kfold };
