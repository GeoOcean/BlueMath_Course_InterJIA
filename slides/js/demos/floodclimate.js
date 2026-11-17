// Notebook 04: tide + surge, return periods, return-period maps, drivers.
import { json, bin, cmToM } from '../lib/data.js';
import { createMap } from '../lib/map.js';
import { depthOnDem, floodedLand } from '../lib/surrogate.js';
import { plot, onResize } from '../lib/plot.js';
import { C, ramp, depthColor } from '../lib/colors.js';
import { h, slider, buttons } from '../lib/ui.js';
import { corr } from '../lib/stats.js';

/* ---------- TWL = tide + surge + setup, and the training range ---------- */
async function tide(el) {
  const [hist, fc] = await Promise.all([json('history'), json('floodclimate')]);
  const a = h('div', { class: 'plot' }), b = h('div', { class: 'plot' }), c = h('div', { class: 'plot' });
  el.append(h('div', { class: 'cols c3', style: { height: '100%' } },
    h('div', { class: 'stack' }, h('h3', {}, '1 · The sea level is a sum'), h('div', { class: 'grow' }, a)),
    h('div', { class: 'stack' }, h('h3', {}, '2 · Draw a random tide'), h('div', { class: 'grow' }, b), h('p', { class: 'tiny muted' }, 'Emulated day: TWL = (a random daily tide maximum of the record) + (emulated surge + setup).')),
    h('div', { class: 'stack' }, h('h3', {}, '3 · Stay inside the training range'), h('div', { class: 'grow' }, c), h('p', { class: 'tiny muted' }, 'Below the minimum: calm days, moved to the minimum. Above the maximum: clipped, so the rarest floods are underestimated.'))));
  const rebuilt = hist.tide.map((t, i) => t + hist.surge[i] + hist.setup[i]);
  const r = corr(hist.TWL, rebuilt);
  const render = () => {
    plot(a, [
      { x: [0, 3.2], y: [0, 3.2], type: 'scatter', mode: 'lines', line: { color: C.muted, dash: 'dot' }, hoverinfo: 'skip' },
      { x: hist.TWL, y: rebuilt, type: 'scattergl', mode: 'markers', marker: { size: 3.5, color: C.sea, opacity: 0.4 }, hoverinfo: 'skip' },
    ], { xaxis: { title: 'Observed TWL [m]', range: [0, 3.2] }, yaxis: { title: 'Tide + surge + setup [m]', range: [0, 3.2], scaleanchor: 'x' },
      annotations: [{ xref: 'paper', yref: 'paper', x: 0.04, y: 0.96, xanchor: 'left', showarrow: false, text: `r = ${r.toFixed(2)}`, font: { family: 'IBM Plex Mono', size: 14 } }], margin: { t: 6 } });
    plot(b, [{ x: fc.tideHist, type: 'histogram', marker: { color: C.lavender, line: { color: 'white', width: 1 } }, nbinsx: 30, hovertemplate: '%{x} m: %{y} days<extra></extra>' }],
      { xaxis: { title: 'Daily maximum astronomical tide [m]' }, yaxis: { title: 'days' }, margin: { t: 6 }, bargap: 0.02 });
    const vars = ['TWL', 'Q', 'precip_acum'], names = ['TWL', 'Q', 'Rain'];
    plot(c, [
      { y: names, x: vars.map(v => fc.outside[v].below), type: 'bar', orientation: 'h', name: 'below min', marker: { color: C.mint }, hovertemplate: '%{y}: %{x:.2f}% below<extra></extra>' },
      { y: names, x: vars.map(v => fc.outside[v].above), type: 'bar', orientation: 'h', name: 'above max', marker: { color: C.hist }, hovertemplate: '%{y}: %{x:.3f}% above<extra></extra>' },
    ], { barmode: 'stack', xaxis: { title: '% of the emulated days', range: [0, 50] }, showlegend: true, legend: { x: 0.98, xanchor: 'right', y: 0.02, yanchor: 'bottom' }, margin: { t: 6, l: 50 } });
  };
  render(); onResize(a, render);
  return {};
}

/* ---------- return periods ---------- */
const plotting = am => { const x = [...am].filter(v => v != null).sort((p, q) => p - q), n = x.length; return { x, T: x.map((_, i) => (n + 1) / (n - i)) }; };

async function returnPeriod(el) {
  const fc = await json('floodclimate');
  const div = h('div', { class: 'plot' });
  const out = h('div', { class: 'stack tight' });
  let pt = 0;
  const pts = buttons(fc.points.map((p, i) => [i, p]), { value: 0, onPick: k => { pt = +k; render(); } });
  const T = slider({ label: 'Return period <i>T</i>', min: 0, max: 2.4, step: 0.01, value: 2, fmt: v => `${Math.round(10 ** v)} years`, onInput: render });
  el.append(h('div', { class: 'cols c-7-3', style: { height: '100%' } }, div,
    h('div', { class: 'controls-panel', style: { alignContent: 'center' } }, pts, T, out,
      h('div', { class: 'card soft small' }, h('b', {}, 'Plotting position: '), 'sort the n annual maxima; the k-th largest has ', h('i', {}, 'T'), ' = (n + 1) / k years.'),
      h('p', { class: 'tiny muted' }, 'Water level from the surrogate at the two points (white circles on the maps).'))));
  function render() {
    const Ty = 10 ** T.value(), traces = [];
    const cols = ['#1B2F7A', '#3E63B8', '#7FA0DB'];
    const nS = Math.max(...fc.simOf) + 1, levels = [];
    for (let s = 0; s < nS; s++) {
      const { x, T: tr } = plotting(fc.amSim[pt].filter((_, i) => fc.simOf[i] === s));
      traces.push({ x: tr, y: x, type: 'scatter', mode: 'lines', line: { color: cols[s % 3], width: 2 }, name: `emulated ${s + 1} (100 yr)`, hovertemplate: 'T %{x:.0f} yr · %{y:.2f} m<extra></extra>' });
      let j = tr.findIndex(t => t >= Ty); if (j < 0) j = tr.length - 1;
      levels.push(x[j]);
    }
    const all = plotting(fc.amSim[pt]);
    let j = all.T.findIndex(t => t >= Ty); if (j < 0) j = all.T.length - 1;
    const lev = all.x[j];
    const hst = plotting(fc.amHist[pt]);
    traces.push({ x: hst.T, y: hst.x, type: 'scatter', mode: 'markers', marker: { size: 10, color: C.hist, line: { color: 'white', width: 1.5 } }, name: 'historical (10 yr)', hovertemplate: 'T %{x:.1f} yr · %{y:.2f} m<extra></extra>' });
    traces.push({ x: [Ty], y: [lev], type: 'scatter', mode: 'markers', marker: { size: 16, color: C.sun, line: { color: C.ink, width: 2 }, symbol: 'diamond' }, hoverinfo: 'skip', name: `${Math.round(Ty)}-year level` });
    const ymin = Math.min(...all.x) - 0.05;
    plot(div, traces, {
      xaxis: { type: 'log', title: 'Return period [years]', range: [0, Math.log10(320)] }, yaxis: { title: 'Annual max. water level [m]' },
      showlegend: true, legend: { x: 0.02, y: 0.98 },
      shapes: [{ type: 'line', x0: Ty, x1: Ty, y0: ymin, y1: lev, line: { color: C.ink, dash: 'dot', width: 1.5 } }, { type: 'line', xref: 'x', x0: 1, x1: Ty, y0: lev, y1: lev, line: { color: C.ink, dash: 'dot', width: 1.5 } }],
      margin: { t: 6 },
    });
    out.innerHTML = `<div class="stat-row"><div class="s"><span class="v">${lev.toFixed(2)} m</span><span class="k">${Math.round(Ty)}-year level (300 yr)</span></div></div><div class="readout">across the 3 simulations: ${Math.min(...levels).toFixed(2)} – ${Math.max(...levels).toFixed(2)} m</div>`;
  }
  render(); onResize(div, render);
  return {};
}

/* ---------- return-period maps ---------- */
async function floodT(el) {
  const [fc, dom, cm] = await Promise.all([json('floodclimate'), json('domain'), bin('flood_T_cm', Int16Array)]);
  const n = dom.grid.nCells, zs = cmToM(cm);
  const ctl = h('div', { class: 'controls-panel', style: { alignContent: 'center' } });
  const mapBox = h('div', { class: 'fill' });
  el.append(h('div', { class: 'cols c-35-65', style: { height: '100%' } }, ctl, mapBox));
  const map = await createMap(mapBox, { colorbar: 'depth' });
  map.defaultMarkers();
  const { dem, cell } = map.fd;
  const d = new Float32Array(dem.length), d10 = new Float32Array(dem.length), diff = new Float32Array(dem.length);
  depthOnDem(zs.subarray(2 * n, 3 * n), dem, cell, d10);
  let mode = 'depth';
  const diffColor = ramp([[0, '#FFF3E0'], [0.1, '#F7C99B'], [0.25, '#E8875B'], [0.5, '#B2343A']]);
  const Ts = slider({ label: 'Return period', min: 0, max: fc.T.length - 1, step: 1, value: 5, fmt: i => `${fc.T[i]} years`, onInput: draw });
  const modes = buttons([['depth', 'Water depth'], ['diff', 'Extra depth vs 10-year']], { value: 'depth', onPick: k => { mode = k; draw(); } });
  const out = h('div', { class: 'stat-row' });
  const cbDiff = h('div', { class: 'colorbar' }, h('div', {}, 'Extra depth vs the 10-year flood [m]'), h('div', { class: 'bar', style: { background: 'linear-gradient(90deg,#FFF3E0,#F7C99B,#E8875B,#B2343A)' } }), h('div', { class: 'ticks' }, h('span', {}, '0'), h('span', {}, '0.25'), h('span', {}, '0.5')));
  ctl.append(Ts, modes, out, map.colorbar, cbDiff, h('p', { class: 'tiny muted' }, 'Each cell: the quantile 1 − 1/T of its 303 emulated annual maxima of water level, then depth on the 20 m DEM.'));
  function draw() {
    const i = Ts.value();
    depthOnDem(zs.subarray(i * n, (i + 1) * n), dem, cell, d);
    map.colorbar.style.display = mode === 'depth' ? '' : 'none';
    cbDiff.style.display = mode === 'diff' ? '' : 'none';
    if (mode === 'depth') map.set(d, { color: depthColor, alpha: v => (v > 0.02 ? 0.9 : 0) });
    else {
      for (let p = 0; p < d.length; p++) diff[p] = Number.isNaN(d[p]) ? NaN : d[p] - d10[p];
      map.set(diff, { color: diffColor, alpha: v => (Math.abs(v) > 0.005 ? 0.9 : 0) });
    }
    out.innerHTML = `<div class="s"><span class="v">${floodedLand(d, dem).toFixed(1)} km²</span><span class="k">land flooded, ${fc.T[i]}-yr</span></div><div class="s"><span class="v">${floodedLand(d10, dem).toFixed(1)} km²</span><span class="k">10-yr</span></div>`;
  }
  draw();
  return {};
}

/* ---------- which driver makes the annual maximum ---------- */
async function drivers(el) {
  const fc = await json('floodclimate');
  const div = h('div', { class: 'plot' });
  el.append(div);
  const render = () => {
    const traces = [];
    fc.points.forEach((name, j) => {
      const ax = j ? '2' : '';
      traces.push({ x: fc.background.Q, y: fc.background.TWL, type: 'scattergl', mode: 'markers', marker: { size: 3, color: '#CBD5DF' }, xaxis: `x${ax}`, yaxis: `y${ax}`, hoverinfo: 'skip', name: 'emulated days' });
      const dv = fc.drivers[j];
      traces.push({ x: dv.Q, y: dv.TWL, type: 'scatter', mode: 'markers', xaxis: `x${ax}`, yaxis: `y${ax}`,
        marker: { size: 8, color: dv.precip_acum, colorscale: [[0, '#E5F4F1'], [0.5, '#5FBFB0'], [1, '#14594F']], cmin: 0, cmax: 120, line: { color: '#0B2233', width: 0.6 }, showscale: j === 1, colorbar: { title: { text: 'Rain [mm]', side: 'right' }, thickness: 10 } },
        customdata: dv.precip_acum, hovertemplate: 'Q %{x:.0f} m³/s · TWL %{y:.2f} m · rain %{customdata:.0f} mm<extra></extra>', name: 'annual maximum days' });
    });
    plot(div, traces, {
      grid: { rows: 1, columns: 2, pattern: 'independent', xgap: 0.1 },
      xaxis: { type: 'log', title: 'Q [m³/s]', range: [0.3, 3.1] }, yaxis: { title: 'TWL [m]', range: [0.2, 3.2] },
      xaxis2: { type: 'log', title: 'Q [m³/s]', range: [0.3, 3.1] }, yaxis2: { range: [0.2, 3.2] },
      annotations: fc.points.map((p, j) => ({ text: `<b>${p}</b>`, xref: `x${j ? 2 : ''} domain`, yref: `y${j ? 2 : ''} domain`, x: 0.02, y: 0.98, xanchor: 'left', showarrow: false, font: { size: 15 }, bgcolor: 'rgba(255,255,255,.8)' })),
      margin: { t: 6 },
    });
  };
  render(); onResize(div, render);
  return {};
}

export default { tide, 'return-period': returnPeriod, 'flood-T': floodT, drivers };
