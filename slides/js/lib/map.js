// Canvas maps on the 20 m DEM: shaded terrain + a coloured layer (water depth,
// EOFs...) + an SVG overlay for points and lines in UTM coordinates.
import { floodData } from './data.js';
import { terrainColor, depthColor, DEPTH_STOPS, rampCss } from './colors.js';
import { h } from './ui.js';

let baseCache = null;

/** Shaded relief of the DEM, lighter outside the SFINCS domain. */
async function baseImage() {
  if (baseCache) return baseCache;
  const fd = await floodData();
  const { w: W, h: H, dx } = fd.domain.dem, dem = fd.dem, cell = fd.cell;
  const img = new ImageData(W, H), d = img.data;
  const z = (x, y) => {
    const v = dem[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
    return Number.isNaN(v) ? 0 : v;
  };
  // light from the north-west, 45° high; relief exaggerated x3
  const az = 315 * Math.PI / 180, alt = 45 * Math.PI / 180, ex = 3;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x, v = dem[p];
      let r, g, b;
      if (Number.isNaN(v)) { r = 232; g = 238; b = 243; }
      else {
        const gx = ex * (z(x + 1, y) - z(x - 1, y)) / (2 * dx), gy = ex * (z(x, y + 1) - z(x, y - 1)) / (2 * dx);
        const slope = Math.atan(Math.hypot(gx, gy)), aspect = Math.atan2(gy, -gx);
        const hs = Math.cos(Math.PI / 2 - alt) * Math.cos(slope) + Math.sin(Math.PI / 2 - alt) * Math.sin(slope) * Math.cos(az - aspect);
        const shade = 0.55 + 0.6 * Math.max(0, hs);
        [r, g, b] = terrainColor(v).map(c => Math.min(255, c * shade));
      }
      if (cell[p] === 65535) { r = r * 0.55 + 255 * 0.45; g = g * 0.55 + 255 * 0.45; b = b * 0.55 + 255 * 0.45; }
      else {
        // domain edge: a dark dashed line
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => {
          const xx = x + ox, yy = y + oy;
          return xx < 0 || yy < 0 || xx >= W || yy >= H || cell[yy * W + xx] === 65535;
        });
        if (edge && ((x + y) >> 2) % 2 === 0) { r = 40; g = 55; b = 70; }
      }
      d[4 * p] = r; d[4 * p + 1] = g; d[4 * p + 2] = b; d[4 * p + 3] = 255;
    }
  }
  baseCache = { img, W, H, fd };
  return baseCache;
}

/**
 * Create a map inside `container`.
 * opts: title, colorbar ('depth' | {stops, vmin, vmax, label} | null),
 *       points (bool), hover (fn(p) -> extra text), alpha (fn(v) -> 0..1)
 */
export async function createMap(container, opts = {}) {
  const { img, W, H, fd } = await baseImage();
  const dom = fd.domain;
  const canvas = h('canvas', { width: W, height: H });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'overlay');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const tip = h('div', { class: 'tip' });
  const map = h('div', { class: 'map', 'data-prevent-swipe': '' }, canvas, svg, tip);
  map.style.setProperty('--ar', `${W} / ${H}`);
  if (opts.title) map.append(h('div', { class: 'map-title' }, opts.title));
  const wrap = h('div', { class: 'map-wrap' }, map);
  container.append(wrap);
  const ctx = canvas.getContext('2d');
  const frame = new ImageData(W, H);
  let layer = null, colorFn = opts.color ?? depthColor, alphaFn = opts.alpha ?? (v => (v > 0.02 ? 0.9 : 0));

  const toPx = (x, y) => [(x - dom.dem.x0) / dom.dem.dx + 0.5, (dom.dem.y0 - y) / dom.dem.dy + 0.5];
  const ns = (tag, attrs) => {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    svg.append(e); return e;
  };

  function draw() {
    const src = img.data, out = frame.data;
    out.set(src);
    if (layer) {
      for (let p = 0; p < layer.length; p++) {
        const v = layer[p];
        if (Number.isNaN(v)) continue;
        const a = alphaFn(v);
        if (a <= 0) continue;
        const [r, g, b] = colorFn(v);
        out[4 * p] = out[4 * p] * (1 - a) + r * a;
        out[4 * p + 1] = out[4 * p + 1] * (1 - a) + g * a;
        out[4 * p + 2] = out[4 * p + 2] * (1 - a) + b * a;
      }
    }
    ctx.putImageData(frame, 0, 0);
  }

  const api = {
    W, H, fd, el: map, wrap, toPx,
    /** values: Float32Array (W*H) on the DEM; color(v) -> [r, g, b] of a value */
    set(values, o = {}) {
      layer = values;
      if (o.color) colorFn = o.color;
      if (o.alpha) alphaFn = o.alpha;
      draw();
    },
    clear() { layer = null; draw(); },
    marker(x, y, { label, color = '#fff', shape = 'tri', size = 9, labelPos = 'right' } = {}) {
      const [px, py] = toPx(x, y);
      if (shape === 'tri') ns('path', { d: `M${px} ${py - size} L${px + size * 0.9} ${py + size * 0.6} L${px - size * 0.9} ${py + size * 0.6} Z`, fill: color, stroke: '#0B2233', 'stroke-width': 1.5 });
      else ns('circle', { cx: px, cy: py, r: size * 0.6, fill: color, stroke: '#0B2233', 'stroke-width': 1.5 });
      if (label) {
        const t = ns('text', { x: px + (labelPos === 'left' ? -size - 4 : size + 4), y: py + 4, 'font-size': 15, 'font-family': 'IBM Plex Sans, sans-serif', 'font-weight': 600, fill: '#0B2233', 'text-anchor': labelPos === 'left' ? 'end' : 'start', 'paint-order': 'stroke', stroke: 'rgba(255,255,255,.9)', 'stroke-width': 4 });
        t.textContent = label;
      }
    },
    line(coords, attrs = {}) {
      const d = coords.map(([x, y], i) => { const [px, py] = toPx(x, y); return `${i ? 'L' : 'M'}${px} ${py}`; }).join(' ');
      return ns('path', { d, fill: 'none', stroke: '#C2185B', 'stroke-width': 4, 'stroke-linecap': 'round', ...attrs });
    },
    text(x, y, str, attrs = {}) {
      const [px, py] = toPx(x, y);
      const t = ns('text', { x: px, y: py, 'font-size': 15, 'font-family': 'IBM Plex Sans, sans-serif', 'font-weight': 600, fill: '#0B2233', 'paint-order': 'stroke', stroke: 'rgba(255,255,255,.85)', 'stroke-width': 4, ...attrs });
      t.textContent = str;
      return t;
    },
    defaultMarkers() {
      api.line(dom.mouth, { stroke: '#C2185B', 'stroke-width': 5 });
      api.text(dom.mouth[1][0] + 150, dom.mouth[1][1] + 150, 'mouth', { fill: '#C2185B' });
      api.marker(dom.river[0], dom.river[1] + 250, { label: 'Asón', color: '#C47A45', shape: 'tri' });
      if (opts.points !== false) {
        for (const [name, p] of Object.entries(dom.points)) api.marker(p.x, p.y, { label: name, color: '#fff', shape: 'circle', size: 10, labelPos: name.startsWith('Western') ? 'right' : 'left' });
      }
    },
  };

  if (opts.colorbar) {
    const cb = opts.colorbar === 'depth' ? { stops: DEPTH_STOPS, vmin: 0, vmax: 4, label: 'Max. water depth [m]', ticks: [0, 1, 2, 3, 4] } : opts.colorbar;
    const bar = h('div', { class: 'colorbar', style: { width: '100%' } },
      h('div', {}, cb.label),
      h('div', { class: 'bar', style: { background: rampCss(cb.stops, cb.vmin, cb.vmax) } }),
      h('div', { class: 'ticks' }, ...(cb.ticks ?? [cb.vmin, cb.vmax]).map(t => h('span', {}, String(t)))));
    api.colorbar = bar;
  }

  if (opts.hover !== false) {
    map.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / r.width * W), y = Math.floor((e.clientY - r.top) / r.height * H);
      if (x < 0 || y < 0 || x >= W || y >= H) { tip.style.display = 'none'; return; }
      const p = y * W + x, z = fd.dem[p];
      let txt = Number.isNaN(z) ? 'no data' : `z = ${z.toFixed(1)} m`;
      if (layer && !Number.isNaN(layer[p]) && opts.hoverValue !== false) txt += ` · ${(opts.hoverFmt ?? (v => `depth ${v.toFixed(2)} m`))(layer[p])}`;
      tip.textContent = txt;
      tip.style.display = 'block';
      tip.style.left = `${(e.clientX - r.left)}px`;
      tip.style.top = `${(e.clientY - r.top)}px`;
    });
    map.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
  }

  draw();
  return api;
}
