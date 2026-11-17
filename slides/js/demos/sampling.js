// Notebook 01, part 1: LHS, the convex hull filter, MDA and the SFINCS forcing.
import { json } from '../lib/data.js';
import { plot, onResize } from '../lib/plot.js';
import { C } from '../lib/colors.js';
import { h, slider, buttons, button, sleep } from '../lib/ui.js';
import { rng, lhs, mda } from '../lib/stats.js';

const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.append(e);
  return e;
}

/* ---------- random vs LHS ---------- */
function lhsDemo(el) {
  const S = 400;
  const panel = title => {
    const svg = svgEl('svg', { viewBox: `-30 -10 ${S + 40} ${S + 45}`, style: 'width:100%;height:100%' });
    const box = h('div', { class: 'stack tight', style: { height: '100%', alignItems: 'center' } }, h('h3', {}, title), h('div', { class: 'grow', style: { width: '100%' } }, svg));
    const stat = h('div', { class: 'readout' });
    box.append(stat);
    return { svg, box, stat };
  };
  const A = panel('Random'), B = panel('Latin Hypercube');
  let seed = 3;
  const N = slider({ label: 'Number of samples <i>N</i>', min: 4, max: 40, value: 10, onInput: draw });
  el.append(h('div', { class: 'stack', style: { height: '100%' } },
    h('div', { class: 'cols c2 grow' }, A.box, B.box),
    h('div', { class: 'row', style: { gap: '1.5em' } }, h('div', { style: { flex: 1 } }, N), button('New draw ↻', () => { seed++; draw(); }))));
  function render(p, pts, n, centre = false) {
    p.svg.innerHTML = '';
    svgEl('rect', { x: 0, y: 0, width: S, height: S, fill: '#fff', stroke: C.line }, p.svg);
    const rows = new Set(), cols = new Set(), cells = new Set();
    const cellOf = v => Math.min(n - 1, Math.floor(v * n));
    pts.forEach(([x, y]) => { cols.add(cellOf(x)); rows.add(cellOf(y)); cells.add(`${cellOf(x)},${cellOf(y)}`); });
    // the cells that hold a sample
    for (const c of cells) {
      const [i, j] = c.split(',').map(Number);
      svgEl('rect', { x: i * S / n, y: S - (j + 1) * S / n, width: S / n, height: S / n, fill: C.accent, opacity: 0.16 }, p.svg);
    }
    if (centre) pts = pts.map(([x, y]) => [(cellOf(x) + 0.5) / n, (cellOf(y) + 0.5) / n]);
    for (let i = 0; i < n; i++) {
      if (!cols.has(i)) svgEl('rect', { x: i * S / n, y: 0, width: S / n, height: S, fill: '#F5D9CF', opacity: 0.6 }, p.svg);
      if (!rows.has(i)) svgEl('rect', { x: 0, y: S - (i + 1) * S / n, width: S, height: S / n, fill: '#F5D9CF', opacity: 0.6 }, p.svg);
    }
    for (let i = 1; i < n; i++) {
      svgEl('line', { x1: i * S / n, x2: i * S / n, y1: 0, y2: S, stroke: C.line, 'stroke-width': 1 }, p.svg);
      svgEl('line', { y1: i * S / n, y2: i * S / n, x1: 0, x2: S, stroke: C.line, 'stroke-width': 1 }, p.svg);
    }
    const r = Math.max(3.5, Math.min(9, 0.28 * S / n));
    // centred samples can share a cell: draw one dot per cell with the count
    const count = new Map();
    pts.forEach(([x, y]) => { const k = `${x},${y}`; count.set(k, (count.get(k) || 0) + 1); });
    for (const [k, m] of count) {
      const [x, y] = k.split(',').map(Number);
      const rr = m > 1 ? r * 1.35 : r;
      svgEl('circle', { cx: x * S, cy: S - y * S, r: rr, fill: m > 1 ? C.hist : C.accent, stroke: 'white', 'stroke-width': 1.5 }, p.svg);
      if (m > 1) svgEl('text', { x: x * S, y: S - y * S + rr * 0.42, 'text-anchor': 'middle', 'font-size': rr * 1.2, 'font-weight': 700, fill: 'white', 'font-family': 'IBM Plex Mono' }, p.svg).textContent = m;
    }
    svgEl('text', { x: S / 2, y: S + 30, 'text-anchor': 'middle', 'font-size': 18, fill: C.muted, 'font-family': 'IBM Plex Sans' }, p.svg).textContent = 'variable 1';
    const t = svgEl('text', { x: -12, y: S / 2, 'text-anchor': 'middle', 'font-size': 18, fill: C.muted, 'font-family': 'IBM Plex Sans', transform: `rotate(-90 -12 ${S / 2})` }, p.svg);
    t.textContent = 'variable 2';
    const empty = 2 * n - rows.size - cols.size;
    const shared = pts.length - count.size;
    p.stat.innerHTML = `empty rows + columns: <b>${empty}</b>/${2 * n}` + (shared ? ` · doubled up: <b>${shared}</b>` : '');
  }
  function draw() {
    const n = N.value(), r = rng(seed);
    render(A, Array.from({ length: n }, () => [r(), r()]), n, true);
    render(B, lhs(n, 2, rng(seed + 100)), n, true);
  }
  draw();
  return {};
}

/* ---------- convex hull ---------- */
async function hullDemo(el) {
  const [s, hist] = await Promise.all([json('sampling'), json('history')]);
  const ref = el.closest('section').querySelector('[data-ref="hull-count"]');
  if (ref) ref.textContent = `${s.nRaw.toLocaleString('en-US')} → ${s.nInside.toLocaleString('en-US')}`;
  const div = h('div', { class: 'plot' });
  let step = 1;
  const steps = buttons([[1, '1 · LHS samples'], [2, '2 · + observed days'], [3, '3 · + convex hull'], [4, '4 · keep inside']], { value: 1, onPick: k => { step = +k; render(); } });
  el.append(h('div', { class: 'stack', style: { height: '100%' } }, steps, h('div', { class: 'grow' }, div)));
  const ins = s.inside, Q = s.lhs.Q, P = s.lhs.precip_acum;
  const pick = f => ({ x: Q.filter((_, i) => f(ins[i])), y: P.filter((_, i) => f(ins[i])) });
  const hx = [...s.hull.Q, s.hull.Q[0]], hy = [...s.hull.precip_acum, s.hull.precip_acum[0]];
  function render() {
    const tr = [];
    const inn = pick(v => v === 1), out = pick(v => v === 0);
    if (step < 4) tr.push({ ...pick(() => true), type: 'scattergl', mode: 'markers', marker: { size: 4, color: '#9FB3C8', opacity: 0.6 }, name: 'LHS', hoverinfo: 'skip' });
    else {
      tr.push({ ...out, type: 'scattergl', mode: 'markers', marker: { size: 4, color: '#D5DDE5', opacity: 0.5 }, name: 'discarded', hoverinfo: 'skip' });
      tr.push({ ...inn, type: 'scattergl', mode: 'markers', marker: { size: 4, color: C.accent, opacity: 0.7 }, name: 'kept', hoverinfo: 'skip' });
    }
    if (step >= 2) tr.push({ x: hist.Q, y: hist.precip, type: 'scattergl', mode: 'markers', marker: { size: 5, color: C.hist, opacity: 0.55 }, name: 'observed days', hoverinfo: 'skip' });
    if (step >= 3) tr.push({ x: hx, y: hy, type: 'scatter', mode: 'lines', line: { color: C.navy, width: 2.5 }, fill: step === 3 ? 'toself' : 'none', fillcolor: 'rgba(47,109,181,0.08)', name: 'convex hull', hoverinfo: 'skip' });
    plot(div, tr, {
      xaxis: { title: 'River discharge Q [m³/s]', range: [0, 1200] }, yaxis: { title: 'Rain [mm/day]', range: [0, 125] },
      showlegend: true, legend: { x: 0.99, xanchor: 'right', y: 0.99 },
      annotations: step >= 4 ? [{ xref: 'paper', yref: 'paper', x: 0.99, y: 0.6, xanchor: 'right', showarrow: false, align: 'right', text: `kept ${(100 * s.nInside / s.nRaw).toFixed(0)}% of the LHS samples`, font: { family: 'IBM Plex Mono', color: C.accent } }] : [],
    });
  }
  render(); onResize(div, render);
  return {};
}

/* ---------- MDA in 2D ---------- */
function mdaToy(el) {
  const S = 420, r = rng(11), n = 600;
  // a skewed, correlated cloud (like Q vs rain): dense centre, sparse extremes
  const raw = Array.from({ length: n }, () => { const a = r.normal(), b = r.normal(); return [Math.exp(0.55 * a), Math.exp(0.45 * (0.7 * a + 0.71 * b))]; });
  const mins = [0, 1].map(j => Math.min(...raw.map(p => p[j]))), maxs = [0, 1].map(j => Math.max(...raw.map(p => p[j])));
  const pts = raw.map(p => p.map((v, j) => (v - mins[j]) / (maxs[j] - mins[j])));
  const order = mda(pts, 60);
  const rnd = rng(5).shuffle([...Array(n).keys()]).slice(0, 60);
  let mode = 'mda', playing = false;
  const svg = svgEl('svg', { viewBox: `-10 -10 ${S + 20} ${S + 20}`, style: 'width:100%;height:100%' });
  const K = slider({ label: 'Selected points', min: 1, max: 40, value: 8, onInput: draw });
  const modeBtns = buttons([['mda', 'MDA'], ['random', 'Random']], { value: 'mda', onPick: k => { mode = k; draw(); } });
  const play = button('▶ Play', async () => {
    if (playing) { playing = false; return; }
    playing = true; play.textContent = '■ Stop';
    for (let k = 1; k <= 40 && playing; k++) { K.set(k); draw(); await sleep(k < 10 ? 650 : 220); }
    playing = false; play.textContent = '▶ Play';
  });
  el.append(h('div', { class: 'stack', style: { height: '100%' } },
    h('div', { class: 'grow' }, svg),
    h('div', { class: 'row' }, h('div', { style: { flex: 1 } }, K), modeBtns, play)));
  function draw() {
    const k = K.value(), sel = (mode === 'mda' ? order : rnd).slice(0, k);
    svg.innerHTML = '';
    svgEl('rect', { x: 0, y: 0, width: S, height: S, fill: '#fff', stroke: C.line }, svg);
    const g = svgEl('g', {}, svg);
    pts.forEach(([x, y]) => svgEl('circle', { cx: x * S, cy: S - y * S, r: 3, fill: '#9FB3C8', opacity: 0.6 }, g));
    if (mode === 'mda' && k > 1) {
      // distance of the last pick to its closest previous pick
      const last = pts[sel[k - 1]];
      let dmin = Infinity;
      for (const i of sel.slice(0, k - 1)) dmin = Math.min(dmin, Math.hypot(pts[i][0] - last[0], pts[i][1] - last[1]));
      svgEl('circle', { cx: last[0] * S, cy: S - last[1] * S, r: dmin * S, fill: 'rgba(47,109,181,.06)', stroke: C.accent, 'stroke-dasharray': '6 5', 'stroke-width': 1.5 }, svg);
    }
    sel.forEach((i, j) => {
      const [x, y] = pts[i], last = j === k - 1;
      svgEl('circle', { cx: x * S, cy: S - y * S, r: last ? 11 : 8, fill: last ? C.hist : C.navy, stroke: 'white', 'stroke-width': 2 }, svg);
      if (k <= 25) svgEl('text', { x: x * S, y: S - y * S + 4, 'text-anchor': 'middle', 'font-size': 10, fill: 'white', 'font-family': 'IBM Plex Mono', 'font-weight': 600 }, svg).textContent = j + 1;
    });
  }
  draw();
  return { hide() { playing = false; } };
}

/* ---------- the real 100 MDA cases in 3D ---------- */
async function mda3d(el) {
  const s = await json('sampling');
  const keep = s.inside.map((v, i) => (v ? i : -1)).filter(i => i >= 0).slice(0, 1800);
  const div = h('div', { class: 'plot' });
  let playing = false;
  const K = slider({ label: 'MDA cases shown', min: 1, max: 100, value: 100, onInput: render });
  const play = button('▶ Play', async () => {
    if (playing) { playing = false; return; }
    playing = true; play.textContent = '■ Stop';
    for (let k = 1; k <= 100 && playing; k++) { K.set(k); render(); await sleep(k < 12 ? 450 : 90); }
    playing = false; play.textContent = '▶ Play';
  });
  el.append(h('div', { class: 'stack', style: { height: '100%' } }, h('div', { class: 'grow' }, div), h('div', { class: 'row' }, h('div', { style: { flex: 1 } }, K), play)));
  let camera = { eye: { x: 1.6, y: -1.5, z: 0.9 } };
  function render() {
    const k = K.value(), idx = [...Array(k).keys()];
    plot(div, [
      { type: 'scatter3d', mode: 'markers', x: keep.map(i => s.lhs.Q[i]), y: keep.map(i => s.lhs.precip_acum[i]), z: keep.map(i => s.lhs.TWL[i]), marker: { size: 1.6, color: '#9FB3C8', opacity: 0.5 }, hoverinfo: 'skip', name: 'LHS (plausible)' },
      { type: 'scatter3d', mode: 'markers', x: idx.map(i => s.mda.Q[i]), y: idx.map(i => s.mda.precip_acum[i]), z: idx.map(i => s.mda.TWL[i]),
        marker: { size: idx.map(i => (i === k - 1 ? 12 : 7)), color: idx, colorscale: [[0, '#D1495B'], [0.5, '#E59A3B'], [1, '#F0D88A']], cmin: 0, cmax: 99, line: { color: '#0B2233', width: 1 }, opacity: 1 },
        text: idx.map(i => `case ${i}`), hovertemplate: '%{text}<br>Q %{x:.0f} m³/s<br>rain %{y:.0f} mm<br>TWL %{z:.2f} m<extra></extra>', name: 'MDA' },
    ], {
      margin: { l: 0, r: 0, t: 0, b: 0 },
      scene: {
        xaxis: { title: { text: 'Q [m³/s]' }, color: C.river, gridcolor: C.grid, backgroundcolor: 'rgba(0,0,0,0)' },
        yaxis: { title: { text: 'Rain [mm]' }, color: C.rain, gridcolor: C.grid },
        zaxis: { title: { text: 'TWL [m]' }, color: C.sea, gridcolor: C.grid },
        camera, aspectmode: 'cube',
      },
      uirevision: 'keep',
    });
  }
  render(); onResize(div, render);
  return { hide() { playing = false; } };
}

/* ---------- forcing of one day ---------- */
async function forcing(el) {
  const s = await json('sampling');
  const uh = s.uh, ntr = s.ntrMean, tp = 12;
  const hours = Array.from({ length: 145 }, (_, i) => i / 6);
  const interp = (x, xs, ys) => {
    if (x <= xs[0] || x >= xs[xs.length - 1]) return 0;
    let i = 1; while (xs[i] < x) i++;
    return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  };
  const div = h('div', { class: 'plot' });
  const twl = slider({ label: '<b class="sea">TWL</b> daily max', min: 0.34, max: 2.95, step: 0.01, value: 2.4, cls: 'sea', fmt: v => `${v.toFixed(2)} m`, onInput: render });
  const q = slider({ label: '<b class="river">Q</b> daily max', min: 2, max: 1160, step: 1, value: 650, cls: 'river', fmt: v => `${v} m³/s`, onInput: render });
  const p = slider({ label: '<b class="rain">Rain</b> daily total', min: 0, max: 121, step: 1, value: 40, cls: 'rain', fmt: v => `${v} mm`, onInput: render });
  const lag = slider({ label: 'River lag vs sea peak', min: -6, max: 6, step: 0.5, value: -3, fmt: v => `${v > 0 ? '+' : ''}${v} h`, onInput: render });
  const info = h('div', { class: 'readout' });
  el.append(h('div', { class: 'cols c-3-7', style: { height: '100%' } },
    h('div', { class: 'controls-panel', style: { alignContent: 'center' } }, twl, q, p, lag, info), div));
  function render() {
    const T = twl.value(), lo = 2 * ntr - T, L = lag.value(), peak = 12 + L, start = peak - tp;
    const sea = hours.map(t => lo + (T - lo) * (t <= 12 ? t / 12 : (24 - t) / 12));
    const riv = hours.map(t => q.value() * interp((t - start) / tp, uh.t, uh.q));
    const rain = hours.map(t => (t < 24 ? p.value() / 24 : 0));
    info.innerHTML = `TWL<sub>min</sub> = 2·${ntr.toFixed(2)} − ${T.toFixed(2)} = <b>${lo.toFixed(2)} m</b>${Math.abs(L) < 2 ? '<br><span style="color:#C47A45">the notebook draws |lag| between 2 and 6 h</span>' : ''}`;
    plot(div, [
      { x: hours, y: sea, type: 'scatter', mode: 'lines', line: { color: C.sea, width: 3 }, hovertemplate: '%{x:.1f} h · %{y:.2f} m<extra></extra>' },
      { x: hours, y: riv, type: 'scatter', mode: 'lines', line: { color: C.river, width: 3 }, fill: 'tozeroy', fillcolor: 'rgba(196,122,69,.12)', xaxis: 'x2', yaxis: 'y2', hovertemplate: '%{x:.1f} h · %{y:.0f} m³/s<extra></extra>' },
      { x: hours, y: rain, type: 'scatter', mode: 'lines', line: { color: C.rain, width: 3, shape: 'hv' }, fill: 'tozeroy', fillcolor: 'rgba(42,157,143,.15)', xaxis: 'x3', yaxis: 'y3', hovertemplate: '%{x:.1f} h · %{y:.2f} mm/h<extra></extra>' },
    ], {
      grid: { rows: 3, columns: 1, pattern: 'independent', roworder: 'top to bottom', ygap: 0.25 },
      xaxis: { range: [0, 24], dtick: 3, showticklabels: false }, xaxis2: { range: [0, 24], dtick: 3, showticklabels: false }, xaxis3: { range: [0, 24], dtick: 3, title: 'Hour of the simulated day' },
      yaxis: { title: 'Water level [m]', range: [-2.8, 3.2] }, yaxis2: { title: 'Q [m³/s]', range: [0, 1200] }, yaxis3: { title: 'mm/h', range: [0, 5.3] },
      shapes: [12, peak].map((x, i) => ({ type: 'line', xref: i ? 'x2' : 'x', yref: i ? 'y2 domain' : 'y domain', x0: x, x1: x, y0: 0, y1: 1, line: { color: i ? C.river : C.sea, dash: 'dot', width: 1.5 } })),
      hovermode: 'closest',
    });
  }
  render(); onResize(div, render);
  return {};
}

export default { lhs: lhsDemo, hull: hullDemo, 'mda-toy': mdaToy, 'mda-3d': mda3d, forcing };
