// Notebook 01, part 2: subgrid, SFINCS results and PCA.
import { json, bin, cmToM, surrogate } from '../lib/data.js';
import { createMap } from '../lib/map.js';
import { depthOnDem, floodedLand } from '../lib/surrogate.js';
import { plot, onResize } from '../lib/plot.js';
import { C, divColor, DIV_STOPS } from '../lib/colors.js';
import { h, slider, buttons, button } from '../lib/ui.js';
import { rng } from '../lib/stats.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.append(e);
  return e;
};

/* ---------- subgrid: coarse cell vs subgrid pixels ---------- */
function subgrid(el) {
  // three 100 m cells, 8 subgrid pixels each (12.5 m), elevations in m
  const z = [-1.6, -1.9, -1.4, -0.6, 0.2, 0.7, 0.9, 1.0, 1.1, 1.3, 1.5, 2.3, 3.0, 2.4, 1.6, 1.3, 1.0, 0.9, 1.1, 1.6, 2.2, 2.9, 3.4, 3.8];
  const nc = 3, np = 8, W = 600, Hh = 190, zmin = -2.5, zmax = 4.2;
  const X = i => (i / (nc * np)) * W, Y = v => Hh - ((v - zmin) / (zmax - zmin)) * Hh;
  const means = [0, 1, 2].map(c => z.slice(c * np, (c + 1) * np).reduce((a, b) => a + b, 0) / np);
  const svg = svgEl('svg', { viewBox: `-50 -24 ${W + 70} ${2 * Hh + 80}`, style: 'width:100%;height:100%' });
  const lvl = slider({ label: 'Water level', min: -1.5, max: 3.8, step: 0.05, value: 1.2, cls: 'sea', fmt: v => `${v.toFixed(2)} m`, onInput: draw });
  el.append(h('div', { class: 'stack', style: { height: '100%' } }, h('div', { class: 'grow' }, svg), lvl));
  function panel(y0, title, sub) {
    const g = svgEl('g', { transform: `translate(0 ${y0})` }, svg);
    svgEl('text', { x: 0, y: -8, 'font-size': 15, 'font-weight': 700, fill: C.ink, 'font-family': 'Bricolage Grotesque, sans-serif' }, g).textContent = title;
    svgEl('text', { x: W, y: -8, 'font-size': 12, fill: C.muted, 'text-anchor': 'end', 'font-family': 'IBM Plex Mono' }, g).textContent = sub;
    return g;
  }
  function draw() {
    const L = lvl.value();
    svg.innerHTML = '';
    // top: coarse model, one bed level per cell
    const g1 = panel(0, 'Without subgrid: one bed level per 100 m cell', 'wet or dry');
    for (let c = 0; c < nc; c++) {
      const x0 = X(c * np), x1 = X((c + 1) * np), m = means[c];
      if (L > m) svgEl('rect', { x: x0, y: Y(L), width: x1 - x0, height: Y(m) - Y(L), fill: '#6FB3E0', opacity: 0.75 }, g1);
      svgEl('rect', { x: x0, y: Y(m), width: x1 - x0, height: Hh - Y(m), fill: '#D8CDB5', stroke: '#9C8E72' }, g1);
      svgEl('text', { x: (x0 + x1) / 2, y: Hh + 18, 'text-anchor': 'middle', 'font-size': 13, 'font-family': 'IBM Plex Mono', fill: L > m ? C.accent : C.muted }, g1).textContent = L > m ? 'wet 100%' : 'dry';
    }
    // bottom: subgrid
    const g2 = panel(Hh + 62, 'With subgrid: the 20 m terrain inside each cell', 'partially wet');
    let path = `M0 ${Y(z[0])}`;
    z.forEach((v, i) => { path += ` L${X(i)} ${Y(v)} L${X(i + 1)} ${Y(v)}`; });
    path += ` L${W} ${Hh} L0 ${Hh} Z`;
    for (let i = 0; i < z.length; i++) if (L > z[i]) svgEl('rect', { x: X(i), y: Y(L), width: X(i + 1) - X(i), height: Y(z[i]) - Y(L), fill: '#6FB3E0', opacity: 0.75 }, g2);
    svgEl('path', { d: path, fill: '#D8CDB5', stroke: '#9C8E72' }, g2);
    for (let c = 0; c < nc; c++) {
      const wet = z.slice(c * np, (c + 1) * np).filter(v => L > v).length / np;
      svgEl('text', { x: (X(c * np) + X((c + 1) * np)) / 2, y: Hh + 18, 'text-anchor': 'middle', 'font-size': 13, 'font-family': 'IBM Plex Mono', fill: wet ? C.accent : C.muted }, g2).textContent = wet ? `wet ${Math.round(wet * 100)}%` : 'dry';
    }
    for (const g of [g1, g2]) {
      for (let c = 1; c < nc; c++) svgEl('line', { x1: X(c * np), x2: X(c * np), y1: 0, y2: Hh, stroke: C.ink, 'stroke-dasharray': '4 4', opacity: 0.5 }, g);
      svgEl('line', { x1: -6, x2: W, y1: Y(L), y2: Y(L), stroke: C.sea, 'stroke-width': 1.5, 'stroke-dasharray': '2 3' }, g);
      svgEl('text', { x: -10, y: Y(L) + 4, 'text-anchor': 'end', 'font-size': 12, fill: C.sea, 'font-family': 'IBM Plex Mono' }, g).textContent = `${L.toFixed(1)} m`;
    }
  }
  draw();
  return {};
}

/* ---------- SFINCS results of six situations ---------- */
async function sfincsCases(el) {
  const [dom, casesCm] = await Promise.all([json('domain'), bin('sfincs_cases_cm', Int16Array)]);
  const n = dom.grid.nCells, zs = cmToM(casesCm);
  const left = h('div', { class: 'controls-panel', style: { alignContent: 'center' } });
  const mapBox = h('div', { class: 'fill' });
  el.append(h('div', { class: 'cols c-35-65', style: { height: '100%' } }, left, mapBox));
  const map = await createMap(mapBox, { colorbar: 'depth' });
  map.defaultMarkers();
  const { dem, cell } = map.fd;
  const depth = new Float32Array(dem.length);
  const bars = h('div', { class: 'stack tight' });
  const area = h('div', { class: 'stat-row' });
  const max = { TWL: 2.95, Q: 1160, precip_acum: 121 };
  const lab = { TWL: ['TWL', 'm', 'sea', 2], Q: ['Q', 'm³/s', 'river', 0], precip_acum: ['Rain', 'mm', 'rain', 0] };
  function pick(i) {
    const c = dom.cases[i];
    depthOnDem(zs.subarray(i * n, (i + 1) * n), dem, cell, depth);
    map.set(depth);
    bars.innerHTML = '';
    for (const v of ['TWL', 'Q', 'precip_acum']) {
      const [name, unit, cls, d] = lab[v];
      bars.append(h('div', { class: 'ctl' },
        h('label', {}, h('span', { class: cls, html: `<b class="${cls}">${name}</b>` }), h('b', {}, `${c[v].toFixed(d)} ${unit}`)),
        h('div', { style: { height: '.55em', background: 'var(--bg-2)', borderRadius: '.3em', overflow: 'hidden' } },
          h('div', { style: { width: `${100 * c[v] / max[v]}%`, height: '100%', background: `var(--${cls})` } }))));
    }
    area.innerHTML = `<div class="s"><span class="v">${floodedLand(depth, dem).toFixed(1)} km²</span><span class="k">land flooded &gt; 10 cm</span></div><div class="s"><span class="v">#${c.case}</span><span class="k">MDA case</span></div>`;
  }
  const btns = buttons(dom.cases.map((c, i) => [i, c.name]), { value: 5, onPick: k => pick(+k) });
  left.append(h('h3', {}, 'Situation'), btns, bars, area, map.colorbar,
    h('p', { class: 'tiny muted' }, 'SFINCS maximum water level, downscaled to the 20 m DEM: depth = max(level − terrain, 0). Hover the map.'));
  pick(5);
  return {};
}

/* ---------- PCA in 2D ---------- */
function pcaToy(el) {
  const r = rng(21), n = 160, S = 400;
  const pts = Array.from({ length: n }, () => { const a = r.normal(), b = r.normal(); return [a * 0.95, 0.8 * a + 0.32 * b]; });
  const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  const c = pts.map(([x, y]) => [x - mx, y - my]);
  const sxx = c.reduce((s, p) => s + p[0] * p[0], 0) / n, syy = c.reduce((s, p) => s + p[1] * p[1], 0) / n, sxy = c.reduce((s, p) => s + p[0] * p[1], 0) / n;
  const total = sxx + syy, pc1 = 0.5 * Math.atan2(2 * sxy, sxx - syy) * 180 / Math.PI;
  const svg = svgEl('svg', { viewBox: `-10 -10 ${S + 20} ${S + 20}`, style: 'width:100%;height:100%' });
  const ang = slider({ label: 'Axis angle', min: -90, max: 90, step: 1, value: -45, fmt: v => `${v}°`, onInput: draw });
  const bar = h('div', { style: { height: '.8em', background: 'var(--bg-2)', borderRadius: '.4em', overflow: 'hidden' } }, h('div', { style: { height: '100%', background: 'var(--accent)', width: '0%', transition: 'width .1s' } }));
  const out = h('div', { class: 'readout' });
  el.append(h('div', { class: 'cols c-6-4', style: { height: '100%' } },
    svg, h('div', { class: 'controls-panel', style: { alignContent: 'center' } }, ang, h('div', { class: 'small' }, 'Variance captured by this axis'), bar, out,
      h('div', { class: 'btns' }, button('Snap to PC1', () => { ang.set(Math.round(pc1)); draw(); }), button('PC2', () => { ang.set(Math.round(pc1 > 0 ? pc1 - 90 : pc1 + 90)); draw(); })))));
  const sc = 72, P = ([x, y]) => [S / 2 + x * sc, S / 2 - y * sc];
  function draw() {
    const t = ang.value() * Math.PI / 180, u = [Math.cos(t), Math.sin(t)];
    const proj = c.map(p => p[0] * u[0] + p[1] * u[1]);
    const v = proj.reduce((s, x) => s + x * x, 0) / n;
    svg.innerHTML = '';
    svgEl('rect', { x: 0, y: 0, width: S, height: S, fill: '#fff', stroke: C.line }, svg);
    const [a0, a1] = [P([-u[0] * 4, -u[1] * 4]), P([u[0] * 4, u[1] * 4])];
    c.forEach((p, i) => {
      const q = [proj[i] * u[0], proj[i] * u[1]], [x0, y0] = P(p), [x1, y1] = P(q);
      svgEl('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: C.lavender, 'stroke-width': 1 }, svg);
    });
    svgEl('line', { x1: a0[0], y1: a0[1], x2: a1[0], y2: a1[1], stroke: C.hist, 'stroke-width': 3 }, svg);
    c.forEach(p => { const [x, y] = P(p); svgEl('circle', { cx: x, cy: y, r: 4, fill: C.accent, opacity: 0.8 }, svg); });
    c.forEach((p, i) => { const [x, y] = P([proj[i] * u[0], proj[i] * u[1]]); svgEl('circle', { cx: x, cy: y, r: 2.5, fill: C.hist }, svg); });
    bar.firstChild.style.width = `${100 * v / total}%`;
    out.innerHTML = `variance along the axis: <b>${(100 * v / total).toFixed(1)}%</b><br>PC1 at ${pc1.toFixed(0)}° captures ${(100 * (total / 2 + Math.hypot((sxx - syy) / 2, sxy)) / total).toFixed(1)}%`;
  }
  draw();
  return {};
}

/* ---------- PCA of the flood maps ---------- */
async function pcaMaps(el) {
  const [sur, dom, sj, casesCm] = await Promise.all([surrogate(), json('domain'), json('surrogate'), bin('sfincs_cases_cm', Int16Array)]);
  const n = dom.grid.nCells, zs = cmToM(casesCm);
  const left = h('div', { class: 'stack', style: { height: '100%' } });
  const right = h('div', { class: 'stack', style: { height: '100%' } });
  el.append(h('div', { class: 'cols', style: { height: '100%', gridTemplateColumns: '42fr 58fr' } }, left, right));
  // EOF maps
  const eofRow = h('div', { class: 'cols c3 grow' });
  const varPlot = h('div', { class: 'plot', style: { height: '32%' } });
  left.append(h('h3', {}, 'The first three EOFs (spatial patterns)'), eofRow, varPlot);
  for (let k = 0; k < 3; k++) {
    const box = h('div', { class: 'fill' });
    eofRow.append(box);
    const e = sur.eofs[k];
    let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(e[i]));
    const mp = await createMap(box, { title: `EOF${k + 1} · ${(100 * sj.explained[k]).toFixed(1)}%`, hoverFmt: v => `EOF ${v.toFixed(3)}` });
    const vals = new Float32Array(mp.fd.dem.length);
    for (let p = 0; p < vals.length; p++) { const c = mp.fd.cell[p]; vals[p] = c === 65535 ? NaN : e[c]; }
    mp.set(vals, { color: v => divColor(v / m), alpha: () => 0.85 });
  }
  const renderVar = () => {
    const ev = sj.explained, cum = ev.map((_, i) => ev.slice(0, i + 1).reduce((a, b) => a + b, 0));
    plot(varPlot, [
      { x: ev.map((_, i) => `PC${i + 1}`), y: ev.map(v => 100 * v), type: 'bar', marker: { color: C.indigo }, hovertemplate: '%{x}: %{y:.2f}%<extra></extra>' },
      { x: ev.map((_, i) => `PC${i + 1}`), y: cum.map(v => 100 * v), type: 'scatter', mode: 'lines+markers', line: { color: C.hist }, yaxis: 'y2', hovertemplate: 'cumulative %{y:.2f}%<extra></extra>' },
    ], { yaxis: { title: '% variance', range: [0, 100] }, yaxis2: { overlaying: 'y', side: 'right', range: [90, 100.5], title: 'cumulative', showgrid: false }, margin: { t: 6, b: 24, r: 46 } });
  };
  renderVar(); onResize(varPlot, renderVar);
  // reconstruction
  const maps = h('div', { class: 'cols c2 grow' });
  const mA = h('div', { class: 'fill' }), mB = h('div', { class: 'fill' });
  maps.append(mA, mB);
  const out = h('div', { class: 'readout' });
  let ci = 5;
  const kS = slider({ label: 'Principal components used', min: 0, max: 8, value: 1, onInput: draw });
  const cb = buttons(dom.cases.map((c, i) => [i, c.name]), { value: 5, onPick: k => { ci = +k; draw(); } });
  right.append(h('h3', {}, 'Rebuild a SFINCS case from k numbers'), cb, maps, h('div', { class: 'row' }, h('div', { style: { flex: 1 } }, kS), out));
  const [A, B] = await Promise.all([createMap(mA, { title: 'SFINCS' }), createMap(mB, { title: 'PCA' })]);
  const { dem, cell } = A.fd;
  const dA = new Float32Array(dem.length), dB = new Float32Array(dem.length), lvl = new Float32Array(n);
  function draw() {
    const k = kS.value(), pcs = sj.pcsCases.slice(dom.cases[ci].case * 8, dom.cases[ci].case * 8 + 8);
    depthOnDem(zs.subarray(ci * n, (ci + 1) * n), dem, cell, dA);
    depthOnDem(sur.level(pcs, lvl, k), dem, cell, dB);
    A.set(dA); B.el.querySelector('.map-title').textContent = k ? `PCA · ${k} PC${k > 1 ? 's' : ''}` : 'PCA · mean only';
    B.set(dB);
    let s = 0, m = 0;
    for (let p = 0; p < dem.length; p++) if (!Number.isNaN(dA[p])) { s += (dA[p] - dB[p]) ** 2; m++; }
    out.innerHTML = `depth RMSE <b>${Math.sqrt(s / m).toFixed(3)} m</b>`;
  }
  draw();
  return {};
}

export default { subgrid, 'sfincs-cases': sfincsCases, 'pca-toy': pcaToy, 'pca-maps': pcaMaps };
