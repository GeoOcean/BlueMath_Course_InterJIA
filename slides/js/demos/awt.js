// Notebook 03, before the copulas: annual weather types and the two ALR models.
import { json, dailyDates } from '../lib/data.js';
import { plot, onResize } from '../lib/plot.js';
import { C, plotlyDiverging, DWT_COLORS } from '../lib/colors.js';
import { h, buttons } from '../lib/ui.js';

// Same AWT colours as the last figure of notebook 03
const AWT_COLORS = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#D55E00'];
const BLUES = [[0, '#F7FBFF'], [0.25, '#C6DBEF'], [0.5, '#6BAED6'], [0.75, '#2171B5'], [1, '#08306B']];

/** Discrete colorscale for integer labels 1..n. */
function discrete(colors) {
  const n = colors.length, cs = [];
  colors.forEach((c, i) => { cs.push([i / n, c], [(i + 1) / n, c]); });
  return cs;
}
const awtLegend = n => AWT_COLORS.slice(0, n).map((c, i) => ({ x: [null], y: [null], type: 'scatter', mode: 'markers', marker: { symbol: 'square', size: 12, color: c }, name: `AWT ${i + 1}`, showlegend: true, hoverinfo: 'skip' }));
const dwtIds = n => Array.from({ length: n }, (_, i) => i + 1);

function demoShell(el, items, onPick) {
  const div = h('div', { class: 'plot' });
  const steps = buttons(items, { value: items[0][0], onPick });
  el.append(h('div', { class: 'stack', style: { height: '100%' } }, steps, h('div', { class: 'grow' }, div)));
  return div;
}

/* ---------- annual weather types: from DWT probabilities per year ---------- */
async function awt(el) {
  const e = await json('emulator');
  const a = e.annual, K = e.nDwt, NA = e.nAwt, ids = dwtIds(K);
  let step = 'probs';
  const div = demoShell(el, [['probs', '1 · DWT probabilities per year'], ['awt', '2 · PCA + KMA → 5 AWTs'], ['cent', '3 · What each AWT means']], k => { step = k; render(); });
  const counts = Array.from({ length: NA }, (_, i) => a.awt.filter(v => v === i + 1).length);
  const order = a.years.map((_, i) => i).sort((i, j) => a.awt[i] - a.awt[j] || a.years[i] - a.years[j]);
  function render() {
    const pct = a.probs.map(r => r.map(v => 100 * v));
    if (step === 'probs') {
      plot(div, [{
        z: pct, x: ids, y: a.years.map(String), type: 'heatmap', colorscale: BLUES, zmin: 0, xgap: 1, ygap: 1,
        colorbar: { thickness: 10, title: { text: '% of days', side: 'right' } }, hovertemplate: '%{y} · DWT %{x}: %{z:.1f}% of the days<extra></extra>',
      }], { xaxis: { title: 'Daily weather type', dtick: 1, showgrid: false }, yaxis: { type: 'category', autorange: 'reversed', showgrid: false, dtick: 3 }, margin: { t: 6 } });
      return;
    }
    if (step === 'awt') {
      const y = order.map(i => String(a.years[i]));
      const bounds = [];
      for (let r = 1; r < order.length; r++) if (a.awt[order[r]] !== a.awt[order[r - 1]]) bounds.push(r - 0.5);
      const tr = [
        { z: order.map(i => [a.awt[i]]), x: ['AWT'], y, type: 'heatmap', colorscale: discrete(AWT_COLORS.slice(0, NA)), zmin: 0.5, zmax: NA + 0.5, showscale: false, xaxis: 'x', yaxis: 'y', hovertemplate: '%{y}: AWT %{z}<extra></extra>' },
        { z: order.map(i => pct[i]), x: ids, y, type: 'heatmap', colorscale: BLUES, zmin: 0, xgap: 1, showscale: false, xaxis: 'x2', yaxis: 'y', hovertemplate: '%{y} · DWT %{x}: %{z:.1f}%<extra></extra>' },
      ];
      for (let k = 1; k <= NA; k++) {
        const idx = a.years.map((_, i) => i).filter(i => a.awt[i] === k);
        tr.push({ x: idx.map(i => a.pcs[i][0]), y: idx.map(i => a.pcs[i][1]), text: idx.map(i => a.years[i]), type: 'scatter', mode: 'markers', marker: { size: 10, color: AWT_COLORS[k - 1], line: { color: 'white', width: 1 } }, name: `AWT ${k} (${counts[k - 1]} years)`, showlegend: true, xaxis: 'x3', yaxis: 'y3', hovertemplate: '%{text} · AWT ' + k + '<extra></extra>' });
      }
      plot(div, tr, {
        xaxis: { domain: [0, 0.04], showticklabels: false, showgrid: false }, xaxis2: { domain: [0.05, 0.52], title: 'Daily weather type', dtick: 2, showgrid: false },
        yaxis: { type: 'category', autorange: 'reversed', showgrid: false, dtick: 3 },
        xaxis3: { domain: [0.62, 1], title: `PC1 (${(100 * a.evr[0]).toFixed(0)}%)`, zeroline: false }, yaxis3: { anchor: 'x3', title: `PC2 (${(100 * a.evr[1]).toFixed(0)}%)`, zeroline: false },
        shapes: bounds.map(b => ({ type: 'line', xref: 'x2 domain', yref: 'y', x0: -0.1, x1: 1, y0: b, y1: b, line: { color: C.ink, width: 1.5 } })),
        showlegend: true, legend: { x: 1, xanchor: 'right', y: 1, yanchor: 'top' }, margin: { t: 6 },
      });
      return;
    }
    // AWT centroids, as anomalies of the mean annual probability
    const z = a.centroids.map(r => r.map((v, j) => 100 * (v - a.ref[j])));
    const vmax = Math.max(...z.flat().map(Math.abs));
    const y = counts.map((n, i) => `AWT ${i + 1} · ${n} yr`);
    plot(div, [
      { z: y.map((_, i) => [i + 1]), x: [''], y, type: 'heatmap', colorscale: discrete(AWT_COLORS.slice(0, NA)), zmin: 0.5, zmax: NA + 0.5, showscale: false, xaxis: 'x', hoverinfo: 'skip' },
      { z, x: ids, y, type: 'heatmap', colorscale: plotlyDiverging, zmin: -vmax, zmax: vmax, xgap: 2, ygap: 2, xaxis: 'x2', colorbar: { thickness: 10, title: { text: 'Δ % of days', side: 'right' } }, hovertemplate: '%{y} · DWT %{x}: %{z:+.1f} points vs the average year<extra></extra>' },
    ], {
      xaxis: { domain: [0, 0.03], showticklabels: false, showgrid: false }, xaxis2: { domain: [0.04, 1], title: 'Daily weather type', dtick: 1, showgrid: false },
      yaxis: { type: 'category', autorange: 'reversed', showgrid: false }, margin: { t: 6 },
    });
  }
  render(); onResize(div, render);
  return {};
}

/* ---------- ALR of the AWTs: year-to-year sequence and its PCs ---------- */
function transProbs(seqs, n) {
  const T = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const s of seqs) for (let i = 1; i < s.length; i++) T[s[i - 1] - 1][s[i] - 1]++;
  return T.map(r => { const t = r.reduce((x, y) => x + y, 0); return r.map(v => (t ? v / t : 0)); });
}

async function awtAlr(el) {
  const e = await json('emulator');
  const a = e.annual, s = e.awtSim, NA = e.nAwt;
  let step = 'seq';
  const div = demoShell(el, [['seq', '1 · Simulated sequences'], ['trans', '2 · Year-to-year transitions'], ['pcs', '3 · Populate the PCs']], k => { step = k; render(); });
  const labels = dwtIds(NA);
  const counts = labels.map(k => a.awt.filter(v => v === k).length);
  function render() {
    if (step === 'seq') {
      const y0 = Math.min(a.years[0], s.years[0]), y1 = Math.max(a.years.at(-1), s.years.at(-1));
      const x = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i);
      const row = (yrs, seq) => x.map(yy => { const i = yrs.indexOf(yy); return i < 0 ? null : seq[i]; });
      const names = ['Historical', ...s.seqs.map((_, i) => `Simulation ${i + 1}`)];
      plot(div, [{
        z: [row(a.years, a.awt), ...s.seqs.map(q => row(s.years, q))], x, y: names, type: 'heatmap', colorscale: discrete(AWT_COLORS.slice(0, NA)), zmin: 0.5, zmax: NA + 0.5, xgap: 1, ygap: 6, showscale: false,
        hovertemplate: '%{y} · %{x}: AWT %{z}<extra></extra>',
      }, ...awtLegend(NA)], {
        xaxis: { title: 'Year', showgrid: false }, yaxis: { autorange: 'reversed', showgrid: false },
        showlegend: true, legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: 1.02, yanchor: 'bottom' }, margin: { t: 30 },
      });
      return;
    }
    if (step === 'trans') {
      const Ph = transProbs([a.awt], NA), Ps = transProbs(s.seqs, NA);
      const hm = (P, ax, show) => ({
        z: P, x: labels, y: labels, type: 'heatmap', colorscale: BLUES, zmin: 0, zmax: 0.6, xgap: 2, ygap: 2, xaxis: `x${ax}`, yaxis: `y${ax}`, showscale: show,
        colorbar: { thickness: 10, title: { text: 'P', side: 'right' } }, text: P.map(r => r.map(v => v.toFixed(2))), texttemplate: '%{text}', textfont: { size: 11 },
        hovertemplate: 'AWT %{y} → AWT %{x}: %{z:.2f}<extra></extra>',
      });
      plot(div, [hm(Ph, '', false), hm(Ps, 2, true)], {
        grid: { rows: 1, columns: 2, pattern: 'independent', xgap: 0.25 },
        xaxis: { title: 'AWT next year', dtick: 1, showgrid: false }, yaxis: { title: 'AWT this year', dtick: 1, autorange: 'reversed', showgrid: false },
        xaxis2: { title: 'AWT next year', dtick: 1, showgrid: false }, yaxis2: { title: 'AWT this year', dtick: 1, autorange: 'reversed', showgrid: false },
        annotations: [[`<b>Historical</b> · ${a.awt.length - 1} transitions`, ''], [`<b>Simulated</b> · ${s.seqs.length} × ${s.years.length - 1} transitions`, 2]].map(([t, ax]) => ({ text: t, xref: `x${ax} domain`, yref: `y${ax} domain`, x: 0, y: 1.02, xanchor: 'left', yanchor: 'bottom', showarrow: false, font: { size: 13 } })),
        margin: { t: 30 },
      });
      return;
    }
    // PC1 vs PC2: left only the observed years, right the copula samples of each AWT over them
    const tr = [];
    const allX = [...a.pcs.map(p => p[0]), ...e.awtPop.pcs.flat().map(p => p[0])], allY = [...a.pcs.map(p => p[1]), ...e.awtPop.pcs.flat().map(p => p[1])];
    const pad = (v, f = 0.05) => { const lo = Math.min(...v), hi = Math.max(...v), d = (hi - lo) * f; return [lo - d, hi + d]; };
    const xr = pad(allX), yr = pad(allY);
    for (let k = 1; k <= NA; k++) {
      const sim = e.awtPop.pcs[k - 1], hi = a.years.map((_, i) => i).filter(i => a.awt[i] === k);
      tr.push({ x: sim.map(p => p[0]), y: sim.map(p => p[1]), type: 'scattergl', mode: 'markers', marker: { size: 4, color: AWT_COLORS[k - 1], opacity: 0.35 }, xaxis: 'x2', yaxis: 'y2', showlegend: false, hoverinfo: 'skip' });
      for (const ax of ['', 2]) {
        tr.push({ x: hi.map(i => a.pcs[i][0]), y: hi.map(i => a.pcs[i][1]), text: hi.map(i => a.years[i]), type: 'scatter', mode: 'markers', marker: { size: 11, color: AWT_COLORS[k - 1], line: { color: C.ink, width: 1.2 } }, xaxis: `x${ax}`, yaxis: `y${ax}`, name: `AWT ${k} (${counts[k - 1]} years)`, showlegend: ax === '', hovertemplate: '%{text} · AWT ' + k + '<extra></extra>' });
      }
    }
    plot(div, tr, {
      grid: { rows: 1, columns: 2, pattern: 'independent', xgap: 0.1 },
      xaxis: { title: 'PC1', zeroline: false, range: xr }, yaxis: { title: 'PC2', zeroline: false, range: yr },
      xaxis2: { title: 'PC1', zeroline: false, range: xr }, yaxis2: { title: 'PC2', zeroline: false, range: yr },
      showlegend: true, legend: { orientation: 'h', x: 0.5, xanchor: 'center', y: 1.1, yanchor: 'bottom' }, margin: { t: 56 },
      annotations: [[`<b>Before</b> · ${a.years.length} observed years`, ''], [`<b>Populated</b> · + ${e.awtPop.n} copula samples per AWT`, 2]].map(([t, ax]) => ({ text: t, xref: `x${ax} domain`, yref: `y${ax} domain`, x: 0, y: 1.01, xanchor: 'left', yanchor: 'bottom', showarrow: false, font: { size: 13 } })),
    });
  }
  render(); onResize(div, render);
  return {};
}

/* ---------- ALR of the DWTs: validation of the simulated days ---------- */
async function dwtAlr(el) {
  const e = await json('emulator');
  const d = e.dwtAlr, K = e.nDwt, ids = dwtIds(K);
  let step = 'terms';
  const div = demoShell(el, [['terms', '1 · ALR and its covariates'], ['cal', '2 · Calendar'], ['season', '3 · Seasonality']], k => { step = k; render(); });
  const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  function render() {
    if (step === 'terms') {
      // what the model sees every day: seasonality, the PCs of the year's AWT and yesterday's DWT
      const inp = d.inputs, x = dailyDates(inp.start, inp.dwt.length), a = e.annual;
      const yrs = [...new Set(x.map(t => +t.slice(0, 4)))];
      const tr = [];
      const sCol = [C.accent, C.accent2, C.indigo, C.lavender];
      Object.entries(inp.season).forEach(([n, v], i) => tr.push({ x, y: v, type: 'scatter', mode: 'lines', line: { color: sCol[i], width: 1.6, dash: i > 1 ? 'dot' : 'solid' }, name: n, legendgroup: 'season', yaxis: 'y', hovertemplate: `${n}: %{y:.2f}<extra></extra>` }));
      const pCol = [C.navy, C.sand, C.rain];
      Object.entries(inp.pcs).forEach(([n, v], i) => tr.push({ x, y: v, type: 'scatter', mode: 'lines', line: { color: pCol[i], width: 2.2, shape: 'hv' }, name: n, yaxis: 'y2', hovertemplate: `${n}: %{y:.2f}<extra></extra>` }));
      const strip = (z, ax, label) => ({ x, y: [label], z: [z], type: 'heatmap', colorscale: discrete(DWT_COLORS.slice(0, K)), zmin: 0.5, zmax: K + 0.5, showscale: false, yaxis: ax, showlegend: false, hovertemplate: `%{x} · ${label}: %{z}<extra></extra>` });
      tr.push(strip([null, ...inp.dwt.slice(0, -1)], 'y3', 'DWT t−1'), strip(inp.dwt, 'y4', 'DWT t'));
      const shapes = yrs.map(y => { const k = a.awt[a.years.indexOf(y)]; return { type: 'rect', xref: 'x', yref: 'y2 domain', x0: `${y}-01-01`, x1: `${y + 1}-01-01`, y0: 0, y1: 1, fillcolor: AWT_COLORS[k - 1], opacity: 0.14, line: { width: 0 }, layer: 'below' }; });
      const ann = yrs.map(y => ({ xref: 'x', yref: 'y2 domain', x: `${y}-07-01`, y: 1, yanchor: 'bottom', showarrow: false, text: `AWT ${a.awt[a.years.indexOf(y)]}`, font: { size: 11, color: AWT_COLORS[a.awt[a.years.indexOf(y)] - 1] } }));
      const head = [['<b>Seasonality</b> · harmonics of the day of the year', 'y'], ['<b>Covariates</b> · PCs of the year (simulated by the annual ALR)', 'y2'], ['<b>Markov</b> · yesterday\'s DWT  →  <b>output</b> · DWT today', 'y3']]
        .map(([t, ax]) => ({ xref: 'paper', yref: `${ax} domain`, x: 0, y: ax === 'y2' ? 1.13 : 1.02, xanchor: 'left', yanchor: 'bottom', showarrow: false, text: t, font: { size: 12 } }));
      plot(div, tr, {
        xaxis: { type: 'date', anchor: 'y4', showgrid: false },
        yaxis: { domain: [0.7, 0.96], range: [-1.15, 1.15], zeroline: false }, yaxis2: { domain: [0.25, 0.58], zeroline: true, title: 'normalised' },
        yaxis3: { domain: [0.1, 0.16], showgrid: false }, yaxis4: { domain: [0, 0.06], showgrid: false },
        shapes, annotations: [...head, ...ann], showlegend: true, legend: { orientation: 'h', x: 1, xanchor: 'right', y: 1, yanchor: 'bottom' },
        hovermode: 'x', margin: { t: 26 },
      });
      return;
    }
    if (step === 'cal') {
      const doy = Array.from({ length: 366 }, (_, i) => i + 1);
      const cal = (c, ax) => ({
        z: c.z.map(r => r.map(v => v || null)), x: doy, y: c.years.map(String), type: 'heatmap', colorscale: discrete(DWT_COLORS.slice(0, K)), zmin: 0.5, zmax: K + 0.5, showscale: false,
        xaxis: `x${ax}`, yaxis: `y${ax}`, hovertemplate: '%{y} · day %{x}: DWT %{z}<extra></extra>',
      });
      const ticks = { tickvals: [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335], ticktext: months, showgrid: false };
      const sh = d.calendar.sim.years;
      plot(div, [cal(d.calendar.hist, ''), cal(d.calendar.sim, 2)], {
        grid: { rows: 1, columns: 2, pattern: 'independent', xgap: 0.16 },
        xaxis: ticks, xaxis2: ticks, yaxis: { type: 'category', autorange: 'reversed', dtick: 5, showgrid: false }, yaxis2: { type: 'category', autorange: 'reversed', dtick: 5, showgrid: false },
        annotations: [[`<b>Historical</b> ${d.calendar.hist.years[0]}–${d.calendar.hist.years.at(-1)}`, ''], [`<b>Simulated</b> ${sh[0]}–${sh.at(-1)} (simulation 1)`, 2]].map(([t, ax]) => ({ text: t, xref: `x${ax} domain`, yref: `y${ax} domain`, x: 0, y: 1.01, xanchor: 'left', yanchor: 'bottom', showarrow: false, font: { size: 13 } })),
        margin: { t: 26 },
      });
      return;
    }
    if (step === 'season') {
      const tr = [];
      for (const [src, ax] of [['hist', ''], ['sim', 2]]) {
        ids.forEach((k, j) => tr.push({ x: months.map((m, i) => `${i + 1}`), y: d.monthly[src].map(r => 100 * r[j]), type: 'bar', marker: { color: DWT_COLORS[j], line: { width: 0 } }, xaxis: `x${ax}`, yaxis: `y${ax}`, name: `DWT ${k}`, hovertemplate: `DWT ${k} · month %{x}: %{y:.1f}%<extra></extra>` }));
      }
      const mt = { tickvals: months.map((_, i) => `${i + 1}`), ticktext: months, showgrid: false };
      plot(div, tr, {
        grid: { rows: 1, columns: 2, pattern: 'independent', xgap: 0.08 }, barmode: 'stack', bargap: 0.08,
        xaxis: mt, xaxis2: mt, yaxis: { title: '% of the days', range: [0, 100] }, yaxis2: { range: [0, 100] },
        annotations: [['<b>Historical</b>', ''], [`<b>Simulated</b> · ${d.nSims} × ${d.simYears[1] - d.simYears[0]} years`, 2]].map(([t, ax]) => ({ text: t, xref: `x${ax} domain`, yref: `y${ax} domain`, x: 0, y: 1.01, xanchor: 'left', yanchor: 'bottom', showarrow: false, font: { size: 13 } })),
        margin: { t: 26 },
      });
      return;
    }
  }
  render(); onResize(div, render);
  return {};
}

export default { awt, 'awt-alr': awtAlr, 'dwt-alr': dwtAlr };
