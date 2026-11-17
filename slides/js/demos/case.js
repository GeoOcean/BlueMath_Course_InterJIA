// The case study: site map, ten years of drivers, their dependence.
import { json, dailyDates } from '../lib/data.js';
import { createMap } from '../lib/map.js';
import { plot, onResize } from '../lib/plot.js';
import { C } from '../lib/colors.js';
import { h, buttons } from '../lib/ui.js';
import { spearman } from '../lib/stats.js';

/** Small location map of Iberia with the site (coastline from weather.json). */
export async function insetMap() {
  const w = await json('weather');
  const [lo0, lo1, la0, la1] = [-10.5, 4.5, 35.5, 44.5];
  const W = 150, H = 110, sx = W / (lo1 - lo0), sy = H / (la1 - la0);
  const xy = (lon, lat) => [(lon - lo0) * sx, (la1 - lat) * sy];
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `<rect width="${W}" height="${H}" rx="6" fill="#EAF1F8" stroke="#CCD9E5"/>`;
  for (const line of w.coast) {
    let d = '';
    for (let i = 0; i < line.length; i += 2) { const [x, y] = xy(line[i], line[i + 1]); d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#7E93A8'); p.setAttribute('stroke-width', '0.9');
    svg.append(p);
  }
  const [x, y] = xy(...w.site);
  svg.innerHTML += `<circle cx="${x}" cy="${y}" r="5.5" fill="#C2185B" stroke="white" stroke-width="1.5"/>
    <text x="${x + 8}" y="${y + 13}" font-size="10" font-family="IBM Plex Sans" font-weight="600" fill="#0B2233">Santoña</text>
    <text x="${W - 6}" y="${H - 7}" font-size="8" text-anchor="end" font-family="IBM Plex Mono" fill="#4B6274">Bay of Biscay · Spain</text>`;
  return svg;
}

async function siteMap(el) {
  const map = await createMap(el, { points: true });
  map.defaultMarkers();
  map.marker(463527, 4809480, { color: '#C2185B', shape: 'circle', size: 7 });
  const inset = await insetMap();
  inset.style.cssText = 'position:absolute;right:-1em;top:0;width:34%;filter:drop-shadow(0 2px 4px rgb(11 34 51/.2))';
  map.el.append(inset);
  const legend = h('div', { class: 'caption', style: { position: 'absolute', left: '.5em', bottom: '.4em', background: 'rgb(255 255 255/.85)', padding: '.2em .5em', borderRadius: '.3em' } },
    '- - domain  ', h('span', { style: { color: '#C2185B' } }, '━ mouth'));
  map.el.append(legend);
  return {};
}

async function historyTs(el) {
  const d = await json('history');
  const x = dailyDates(d.start, d.TWL.length);
  const div = h('div', { class: 'plot' });
  el.append(div);
  const render = () => plot(div, [
    { x, y: d.TWL, type: 'scatter', mode: 'lines', line: { color: C.sea, width: 1 }, name: 'TWL', hovertemplate: '%{x}<br>TWL %{y:.2f} m<extra></extra>' },
    { x, y: d.Q, type: 'scatter', mode: 'lines', line: { color: C.river, width: 1 }, yaxis: 'y2', name: 'Q', hovertemplate: '%{x}<br>Q %{y:.0f} m³/s<extra></extra>' },
    { x, y: d.precip, type: 'bar', marker: { color: C.rain }, yaxis: 'y3', name: 'Rain', hovertemplate: '%{x}<br>rain %{y:.1f} mm<extra></extra>' },
  ], {
    grid: { rows: 3, columns: 1, pattern: 'coupled', roworder: 'top to bottom', ygap: 0.12 },
    yaxis: { title: 'TWL [m]', domain: [0.7, 1] }, yaxis2: { title: 'Q [m³/s]', domain: [0.36, 0.64] }, yaxis3: { title: 'Rain [mm]', domain: [0, 0.3] },
    xaxis: { type: 'date' }, dragmode: 'zoom', hovermode: 'x unified', bargap: 0,
    margin: { b: 30 },
  }, { doubleClick: 'reset' });
  render(); onResize(div, render);
  return {};
}

async function historyScatter(el) {
  const d = await json('history');
  const v = { TWL: d.TWL, Q: d.Q, precip: d.precip };
  const lab = { TWL: 'TWL [m]', Q: 'Q [m³/s]', precip: 'Rain [mm/day]' };
  const pairs = [['Q', 'TWL', 'precip'], ['precip', 'TWL', 'Q'], ['precip', 'Q', 'TWL']];
  const div = h('div', { class: 'plot', style: { height: 'calc(100% - 2.2em)' } });
  let colorBy = 'none';
  const ctl = buttons([['none', 'One colour'], ['third', 'Colour by the third driver']], { value: 'none', onPick: k => { colorBy = k; render(); } });
  el.append(h('div', { class: 'stack', style: { height: '100%' } }, ctl, div));
  const ccol = { TWL: C.sea, Q: C.river, precip: C.rain };
  function render() {
    const traces = pairs.map(([a, b, c], i) => ({
      x: v[a], y: v[b], type: 'scattergl', mode: 'markers', xaxis: `x${i + 1}`, yaxis: `y${i + 1}`,
      marker: colorBy === 'none'
        ? { size: 4, color: C.accent, opacity: 0.35 }
        : { size: 5, color: v[c], colorscale: [[0, '#E9EEF3'], [0.3, '#B7C7D9'], [1, ccol[c]]], cmin: 0, cmax: Math.max(...v[c]) * 0.6, opacity: 0.8 },
      hovertemplate: `${lab[a]} %{x}<br>${lab[b]} %{y}<extra></extra>`,
    }));
    const ann = pairs.map(([a, b], i) => ({ xref: `x${i + 1} domain`, yref: `y${i + 1} domain`, x: 0.97, y: 0.97, xanchor: 'right', showarrow: false, text: `Spearman ρ = ${spearman(v[a], v[b]).toFixed(2)}`, font: { family: 'IBM Plex Mono', color: C.muted }, bgcolor: 'rgba(255,255,255,.8)' }));
    plot(div, traces, {
      grid: { rows: 1, columns: 3, pattern: 'independent', xgap: 0.12 },
      xaxis: { title: lab.Q }, yaxis: { title: lab.TWL }, xaxis2: { title: lab.precip }, yaxis2: { title: lab.TWL }, xaxis3: { title: lab.precip }, yaxis3: { title: lab.Q },
      annotations: ann, hovermode: 'closest',
    });
  }
  render(); onResize(div, render);
  return {};
}

export default { 'site-map': siteMap, 'history-ts': historyTs, 'history-scatter': historyScatter };
