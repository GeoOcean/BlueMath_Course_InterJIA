// Title map and the BlueMath ecosystem (ported from extra/bluemath-standalone.html).
import { surrogate } from '../lib/data.js';
import { createMap } from '../lib/map.js';
import { depthOnDem } from '../lib/surrogate.js';
import { h, sleep, reduceMotion } from '../lib/ui.js';

/* ---------- title: a tide breathing through the estuary ---------- */
async function titleMap(el) {
  const [map, sur] = await Promise.all([createMap(el, { hover: false, points: false }), surrogate()]);
  const { dem, cell } = map.fd;
  const level = new Float32Array(sur.nCells), depth = new Float32Array(dem.length);
  let raf = null, t0 = 0;
  const frame = t => {
    const s = (Math.sin((t - t0) / 1800) + 1) / 2;            // 0..1, ~11 s period
    sur.level(sur.predict([0.6 + 2.2 * s, 80 + 700 * s * s, 10 + 40 * s]), level);
    map.set(depthOnDem(level, dem, cell, depth));
    raf = requestAnimationFrame(frame);
  };
  const still = () => { sur.level(sur.predict([2.6, 600, 40]), level); map.set(depthOnDem(level, dem, cell, depth)); };
  still();
  return {
    show() { if (reduceMotion()) return; cancelAnimationFrame(raf); t0 = performance.now() + 1800 * Math.PI * 1.5; raf = requestAnimationFrame(frame); },
    hide() { cancelAnimationFrame(raf); },
  };
}

/* ---------- hero: bricks build up ---------- */
function bricksHero(el) {
  const stage = h('div', { class: 'stage', 'aria-label': 'Toolkit bricks, methods built on them and a climate service on top' }, h('div', { class: 'brick plate' }));
  const cap = h('div', { class: 'stage-caption' });
  el.append(stage, cap);
  const L0 = 1.5, CW = 9.4, ROWS = [{ b: 4, h: 13 }, { b: 17, h: 14 }, { b: 31, h: 15 }];
  const tk = [['SWASH', 'model'], ['RBF', 'stats'], ['MDA', 'stats'], ['LHS', 'stats'], ['GP', 'stats'], ['SFINCS', 'model'], ['Super-Point', 'domain'], ['SWAN', 'model']];
  const ms = [['HySwash', 0, 3], ['HyFlood', 3, 3], ['BinWaves', 6, 2]];
  const place = (node, row, col, span) => {
    const r = ROWS[row];
    Object.assign(node.style, { left: `${L0 + col * CW + 0.15}%`, width: `${span * CW - 0.3}%`, bottom: `${r.b}%`, height: `${r.h}%`, zIndex: (row + 1) * 20 + col });
  };
  const studs = b => { b.append(h('i', { class: 'studs' })); return b; };
  const heroTk = tk.map(([n, k], i) => { const b = studs(h('div', { class: `brick k-${k}` }, h('span', {}, n))); place(b, 0, i, 1); stage.append(b); return b; });
  const heroM = ms.map(([n, c, s]) => { const b = studs(h('div', { class: 'brick k-method' }, h('span', {}, n))); place(b, 1, c, s); b.dataset.c = c; b.dataset.s = s; stage.append(b); return b; });
  const heroS = studs(h('div', { class: 'brick k-service' }, h('span', {}, 'Coastal flood forecast'))); place(heroS, 2, 0, 8); stage.append(heroS);
  stage.querySelector('.plate').append(h('i', { class: 'studs' }));
  const labels = ['Toolkit', 'Methods', 'Climate services'].map((t, i) => {
    const l = h('div', { class: 'row-label' }, t);
    l.style.setProperty('--kc', ['var(--k-stats)', 'var(--k-method)', 'var(--k-service)'][i]);
    l.style.bottom = `${ROWS[i].b}%`; l.style.height = `${ROWS[i].h}%`; stage.append(l); return l;
  });
  const ghost = h('div', { class: 'ghost bob' }, '+ your method');
  Object.assign(ghost.style, { left: `${L0 + 5 * CW + 0.3}%`, width: `${3 * CW - 0.6}%`, bottom: '62%', height: '13%' });
  stage.append(ghost);
  const all = [...heroTk, ...heroM, heroS, ...labels, ghost];
  const LAND = hgt => [
    { transform: `translateY(${-hgt}px)`, opacity: 0 },
    { transform: 'translateY(0) scale(1, 1)', opacity: 1, offset: 0.62 },
    { transform: 'translateY(0) scale(1.04, .88)', offset: 0.74 },
    { transform: 'translateY(-4px) scale(.99, 1.02)', offset: 0.87 },
    { transform: 'translateY(0) scale(1, 1)' },
  ];
  const drop = (n, delay = 0) => { n.style.opacity = 1; return n.animate(LAND(stage.clientHeight * 0.55), { duration: 700, delay, easing: 'cubic-bezier(.35,.7,.4,1)', fill: 'backwards' }).finished; };
  const flash = nodes => nodes.forEach(n => n.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.35)' }, { filter: 'brightness(1)' }], { duration: 500 }));
  const fadeIn = n => { n.style.opacity = 1; return n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 }).finished; };
  let runId = 0;
  async function run() {
    const id = ++runId, alive = () => id === runId;
    if (reduceMotion()) { all.forEach(n => { n.style.opacity = 1; }); cap.innerHTML = '<b>Climate service</b> built on methods, built on toolkit pieces'; return; }
    while (alive()) {
      all.forEach(n => { n.getAnimations().forEach(a => a.cancel()); n.style.opacity = 0; });
      cap.innerHTML = '<b>Toolkit</b> · single, tested pieces';
      await sleep(300); if (!alive()) return;
      await Promise.all(heroTk.map((b, i) => drop(b, i * 150))); if (!alive()) return;
      await fadeIn(labels[0]); await sleep(500); if (!alive()) return;
      cap.innerHTML = '<b>Methods</b> · pieces snapped together';
      for (const m of heroM) {
        await drop(m); if (!alive()) return;
        flash(heroTk.slice(+m.dataset.c, +m.dataset.c + +m.dataset.s));
        await sleep(220);
      }
      await fadeIn(labels[1]); await sleep(500); if (!alive()) return;
      cap.innerHTML = '<b>Climate service</b> · methods stacked into a tool people use';
      await drop(heroS); if (!alive()) return;
      flash([...heroM, ...heroTk]);
      await fadeIn(labels[2]); await sleep(700); if (!alive()) return;
      cap.innerHTML = '<b>Open</b> · there is room for your piece';
      await fadeIn(ghost);
      await sleep(5200); if (!alive()) return;
      await Promise.all(all.map(n => n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, fill: 'forwards' }).finished));
      await sleep(250);
    }
  }
  return { show: run, hide() { runId++; } };
}

/* ---------- stats count-up ---------- */
function countUp(el) {
  const nums = [...el.querySelectorAll('[data-count]')];
  return {
    show() {
      if (reduceMotion()) return;
      nums.forEach(n => {
        const to = +n.dataset.count, pre = n.dataset.prefix || '', t0 = performance.now(), d = 1300;
        const tick = t => { const p = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - p, 3); n.textContent = `${pre}${Math.round(to * e)}%`; if (p < 1) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
    },
  };
}

/* ---------- explorer: toolkit -> methods -> services ---------- */
const TK = [
  ['Data handling', 'data', [['dl', 'Data downloaders'], ['tide', 'Tide gauge decomposition'], ['mesh', 'Unstructured mesh generator']]],
  ['Statistics & machine learning', 'stats', [['pca', 'PCA'], ['kmeans', 'KMeans'], ['kmed', 'KMedoids'], ['som', 'SOM'], ['mda', 'MDA'], ['lhs', 'LHS'], ['rbf', 'RBF'], ['gp', 'Gaussian processes'], ['ae', 'Autoencoders'], ['cop', 'Gaussian copulas'], ['alr', 'ALR'], ['ext', 'Non-stationary extremes'], ['dist', 'Distribution fit'], ['tail', 'Upper tail correction']]],
  ['Numerical model wrappers', 'model', [['swan', 'SWAN'], ['swash', 'SWASH'], ['xbeach', 'XBeach'], ['sfincs', 'SFINCS'], ['delft', 'Delft3D'], ['snap', 'SnapWave'], ['schism', 'SCHISM'], ['riskscape', 'RiskScape']]],
  ['Coastal domain tools', 'domain', [['sp', 'Super-Point'], ['part', 'Spectral partitioning'], ['corr', 'Spectral wave correction'], ['wes', 'Wave energy source']]],
];
const M = {
  hyswash: { n: 'HySwash', ref: 'Ricondo et al., 2024', d: 'Hybrid model of wave transformation, setup and runup, trained on SWASH simulations.', tk: ['lhs', 'mda', 'pca', 'swash', 'rbf'] },
  binwaves: { n: 'BinWaves', ref: 'Cagigal et al., 2024', d: 'Additive hybrid model that rebuilds nearshore wave spectra from pre-computed spectral bins.', tk: ['swan', 'sp', 'part'] },
  shytc: { n: 'SHyTCWaves', ref: 'van Vloten et al., 2024', d: 'Hybrid model of the waves generated by tropical cyclones.', tk: ['mda', 'swan', 'rbf'] },
  hybeat: { n: 'HyBeat', ref: 'Zornoza et al., 2024', d: 'Hybrid model of nearshore waves and runup, built on XBeach simulations.', tk: ['lhs', 'mda', 'pca', 'xbeach', 'rbf'] },
  hyflood: { n: 'HyFlood', ref: 'Surrogate model · today', d: 'Surrogate model of compound coastal flooding, trained on SFINCS simulations.', tk: ['lhs', 'mda', 'pca', 'sfincs', 'gp'] },
  muscle: { n: 'MUSCLE', ref: 'Climate emulator · today', d: 'MUltiScale CLimate Emulator: simulates thousands of years of plausible weather and waves.', tk: ['pca', 'kmeans', 'alr', 'cop', 'ext', 'dist'] },
  greensurge: { n: 'GreenSurge', ref: 'Pérez-Díaz et al., 2024', d: 'High-resolution storm surge modelling on unstructured meshes.', tk: ['dl', 'mesh', 'delft'] },
};
const S = {
  tc: { n: 'TC forecast system', ref: 'Climate service', d: 'Forecasts waves, runup and flooding for a tropical cyclone and its uncertainty cone.', m: ['shytc', 'binwaves', 'hybeat', 'hyflood'], tk: ['dl'] },
  wave: { n: 'Wave hindcast & forecast', ref: 'Climate service', d: 'Brings global wave hindcasts and forecasts down to the coast.', m: ['binwaves', 'hybeat'], tk: ['dl', 'corr'] },
  risk: { n: 'Probabilistic flood risk', ref: 'Climate service · today', d: 'Runs synthetic climates through flood models and turns them into impact metrics.', m: ['muscle', 'hyflood'], tk: ['riskscape'] },
};

function explorer(el) {
  const wires = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  wires.setAttribute('class', 'wires');
  const colTk = h('div', { class: 'xcol' }, h('div', { class: 'xcol-head' }, h('span', { class: 'sw k-data' }), h('h3', {}, 'Toolkit'), h('small', {}, 'single pieces')));
  const picksM = h('div', { class: 'picks' }), picksS = h('div', { class: 'picks' });
  const colM = h('div', { class: 'xcol' }, h('div', { class: 'xcol-head' }, h('span', { class: 'sw k-method' }), h('h3', {}, 'Methods'), h('small', {}, 'pieces combined')), picksM);
  const colS = h('div', { class: 'xcol' }, h('div', { class: 'xcol-head' }, h('span', { class: 'sw k-service' }), h('h3', {}, 'Climate services'), h('small', {}, 'methods stacked')), picksS);
  const ex = h('div', { class: 'explorer', 'data-prevent-swipe': '' }, wires, colTk, colM, colS);
  const readout = h('div', { class: 'x-readout' });
  colS.append(readout);
  el.append(ex);
  const chip = {};
  for (const [name, k, items] of TK) {
    const c = h('div', { class: 'chips' });
    for (const [id, n] of items) { chip[id] = h('div', { class: `brick chip k-${k}` }, n, h('i', { class: 'studs' })); c.append(chip[id]); }
    colTk.append(h('div', { class: 'group' }, h('div', { class: 'group-name' }, name), c));
  }
  const pickEls = {};
  let auto = null;
  const mk = (box, id, o, k) => {
    const b = h('button', { class: `brick pick k-${k}`, type: 'button' }, h('b', {}, o.n), h('small', {}, o.d.split(/[.:,]/)[0]), h('i', { class: 'studs' }));
    b.addEventListener('click', () => { clearInterval(auto); auto = null; select(id); b.blur(); });
    pickEls[id] = b; box.append(b);
  };
  Object.entries(M).forEach(([id, o]) => mk(picksM, id, o, 'method'));
  Object.entries(S).forEach(([id, o]) => mk(picksS, id, o, 'service'));
  let current = 'risk';
  function link(a, b) {
    const base = ex.getBoundingClientRect(), r1 = a.getBoundingClientRect(), r2 = b.getBoundingClientRect();
    let d;
    if (r2.left >= r1.right - 4) {
      const x1 = r1.right - base.left, y1 = r1.top + r1.height / 2 - base.top, x2 = r2.left - base.left, y2 = r2.top + r2.height / 2 - base.top, mx = (x1 + x2) / 2;
      d = `M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
    } else {
      const x1 = r1.left + r1.width / 2 - base.left, y1 = r1.bottom - base.top, x2 = r2.left + r2.width / 2 - base.left, y2 = r2.top - base.top, my = (y1 + y2) / 2;
      d = `M${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
    }
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d); wires.append(p); return p;
  }
  function select(id, animate = true) {
    current = id;
    const isS = id in S, o = isS ? S[id] : M[id], mIds = isS ? o.m : [id];
    const tkIds = new Set([...(isS ? o.tk : []), ...mIds.flatMap(m => M[m].tk)]);
    Object.entries(chip).forEach(([k, c]) => { c.classList.toggle('on', tkIds.has(k)); c.classList.toggle('dim', !tkIds.has(k)); });
    Object.entries(pickEls).forEach(([k, p]) => { const on = k === id || mIds.includes(k); p.classList.toggle('on', on); p.classList.toggle('dim', !on); });
    wires.innerHTML = '';
    const paths = [];
    mIds.forEach(m => M[m].tk.forEach(t => paths.push([0, link(chip[t], pickEls[m])])));
    if (isS) { o.tk.forEach(t => paths.push([1, link(chip[t], pickEls[id])])); mIds.forEach(m => paths.push([1, link(pickEls[m], pickEls[id])])); }
    if (animate && !reduceMotion()) paths.forEach(([st, p], i) => {
      const len = p.getTotalLength(); p.style.strokeDasharray = len;
      p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 650, delay: st * 450 + (i % 6) * 40, easing: 'ease-out', fill: 'backwards' });
    });
    readout.innerHTML = `<div><h3>${o.n}</h3><div class="ref">${o.ref}</div></div><p>${o.d}</p><div class="count"><b>${tkIds.size}</b>toolkit pieces${isS ? `<br><b style="margin-top:4px">${mIds.length}</b>methods` : ''}</div>`;
  }
  const cycle = ['risk', 'hyflood', 'muscle', 'hyswash', 'binwaves', 'tc', 'shytc', 'wave', 'hybeat', 'greensurge'];
  let ci = 0;
  return {
    show() {
      requestAnimationFrame(() => select(current));
      if (!auto && !reduceMotion()) auto = setInterval(() => { ci = (ci + 1) % cycle.length; select(cycle[ci]); }, 4200);
    },
    hide() { clearInterval(auto); auto = null; },
  };
}

export default { 'title-map': titleMap, 'bricks-hero': bricksHero, 'count-up': countUp, explorer };
