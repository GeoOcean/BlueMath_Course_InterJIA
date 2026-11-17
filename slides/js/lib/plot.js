// Plotly with the slide theme. Font sizes follow the slide (em-based), so
// the plots are re-laid out when the window changes size.
import { C } from './colors.js';

const em = el => parseFloat(getComputedStyle(el).fontSize) || 16;

export function theme(el) {
  const f = em(el);
  return {
    font: { family: '"IBM Plex Sans", system-ui, sans-serif', size: Math.round(f * 0.62), color: C.ink },
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { l: f * 3.2, r: f * 0.8, t: f * 0.8, b: f * 2.4 },
    hoverlabel: { font: { family: '"IBM Plex Mono", monospace', size: Math.round(f * 0.56), color: '#FFFFFF' }, bgcolor: C.navy, bordercolor: C.navy, align: 'left' },
    legend: { bgcolor: 'rgba(255,255,255,0.75)', font: { size: Math.round(f * 0.56) } },
    showlegend: false,
    dragmode: false,
  };
}

const AXIS = { gridcolor: C.grid, linecolor: C.line, zerolinecolor: C.line, ticks: '', automargin: true, title: { standoff: 6 } };

/** Merge user layout into the theme; every key starting with xaxis/yaxis gets the axis style. */
function merge(el, layout) {
  const t = theme(el), out = { ...t, ...layout };
  for (const k of Object.keys(out)) {
    if (/^[xy]axis\d*$/.test(k)) {
      out[k] = { ...AXIS, ...out[k], title: typeof out[k]?.title === 'string' ? { text: out[k].title, standoff: 6 } : { ...AXIS.title, ...out[k]?.title } };
    }
  }
  if (layout.margin) out.margin = { ...t.margin, ...layout.margin };
  if (layout.font) out.font = { ...t.font, ...layout.font };
  return out;
}

export const CONFIG = { displayModeBar: false, responsive: true, scrollZoom: false };

export function plot(el, data, layout = {}, config = {}) {
  return Plotly.react(el, data, merge(el, layout), { ...CONFIG, ...config });
}

/** Call fn when the element changes size (debounced). */
export function onResize(el, fn) {
  let t = null, w = 0, h = 0;
  const ro = new ResizeObserver(([e]) => {
    const { width, height } = e.contentRect;
    if (!width || !height || (Math.abs(width - w) < 1 && Math.abs(height - h) < 1)) return;
    w = width; h = height;
    clearTimeout(t); t = setTimeout(fn, 60);
  });
  ro.observe(el);
  return ro;
}

export const emOf = em;
