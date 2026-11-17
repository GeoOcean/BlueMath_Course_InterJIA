// Palette and colormaps shared by the plots and the canvas maps.

export const C = {
  ink: '#0B2233', muted: '#4B6274', line: '#CCD9E5', grid: '#E2EAF2', bg: '#F3F7FB',
  accent: '#2F6DB5', accent2: '#087DA6', navy: '#0B1F3A',
  sea: '#2F6DB5', river: '#C47A45', rain: '#2A9D8F',
  indigo: '#5B6BB8', mint: '#B8EBDF', lavender: '#A3ACD8', sand: '#CC8B5E', sun: '#F0D88A',
  hist: '#D1495B', sim: '#1B2F7A',
};
export const VAR = {
  TWL: { color: C.sea, label: 'TWL', unit: 'm', long: 'Total water level' },
  Q: { color: C.river, label: 'Q', unit: 'm³/s', long: 'River discharge' },
  precip_acum: { color: C.rain, label: 'Rain', unit: 'mm/day', long: 'Daily rainfall' },
};

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

/** Piecewise-linear colormap from [stop, '#hex'] pairs. Returns f(v) -> [r,g,b]. */
export function ramp(stops) {
  const s = stops.map(([v, c]) => [v, hex(c)]);
  return v => {
    if (!(v > s[0][0])) return s[0][1];
    for (let i = 1; i < s.length; i++) {
      if (v <= s[i][0]) {
        const [v0, c0] = s[i - 1], [v1, c1] = s[i], t = (v - v0) / (v1 - v0);
        return [c0[0] + t * (c1[0] - c0[0]), c0[1] + t * (c1[1] - c0[1]), c0[2] + t * (c1[2] - c0[2])];
      }
    }
    return s[s.length - 1][1];
  };
}
export const rampCss = (stops, vmin, vmax) =>
  `linear-gradient(90deg, ${stops.map(([v, c]) => `${c} ${(100 * (v - vmin) / (vmax - vmin)).toFixed(1)}%`).join(', ')})`;

/** Water depth [m]: light cyan -> deep indigo. */
export const DEPTH_STOPS = [[0, '#D6F3F4'], [0.3, '#8FD3E0'], [1, '#3E9BD0'], [2, '#2F5FB0'], [3, '#2A2F86'], [4, '#140F4A']];
export const depthColor = ramp(DEPTH_STOPS);
/** Diverging blue-white-red (EOFs, anomalies, correlations) on [-1, 1]. */
export const DIV_STOPS = [[-1, '#2A4D9B'], [-0.5, '#8FB2DD'], [0, '#F7F7F2'], [0.5, '#EBA58A'], [1, '#B2343A']];
export const divColor = ramp(DIV_STOPS);
export const plotlyDiverging = DIV_STOPS.map(([v, c]) => [(v + 1) / 2, c]);
/** Terrain tint for the base map. */
export const terrainColor = ramp([[-20, '#B9CCDD'], [-0.5, '#D3E0EA'], [0, '#E9E4D2'], [5, '#E3E2C8'], [20, '#CBD5B5'], [60, '#AFBE98'], [150, '#9C9A80'], [400, '#8E8676']]);
/** Weather types: 25 distinguishable colours (cycled). */
export const DWT_COLORS = ['#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c', '#98df8a', '#d62728', '#ff9896', '#9467bd', '#c5b0d5',
  '#8c564b', '#c49c94', '#e377c2', '#f7b6d2', '#7f7f7f', '#c7c7c7', '#bcbd22', '#dbdb8d', '#17becf', '#9edae5',
  '#393b79', '#637939', '#8c6d31', '#843c39', '#7b4173'];
