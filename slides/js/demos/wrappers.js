// The bluemath-tk wrapper, live: template -> 100 SFINCS case folders -> run
// with a launcher -> one xarray Dataset. Case colours come from the real MDA days.
import { json } from '../lib/data.js';
import { h, reduceMotion } from '../lib/ui.js';

const N = 100;
const LAUNCHERS = {
  serial: { workers: 4, note: 'the sfincs executable in the image · 4 cores in Codespaces' },
  docker: { workers: 4, note: 'one deltares/sfincs-cpu container per case' },
  apptainer: { workers: 25, note: 'a cluster node: sfincs.sif on many cores' },
};
const CODE = {
  1: 'sfincs_wrapper = SfincsModelWrapper(templates_dir, metamodel_parameters, fixed_parameters, output_dir)',
  2: 'sfincs_wrapper.build_template_case()   # grid, mask and subgrid, once',
  3: 'sfincs_wrapper.build_cases()           # one folder per MDA day',
  4: l => `sfincs_wrapper.run_cases_with_progress(launcher="${l}", num_workers=${LAUNCHERS[l].workers})`,
  5: 'water_levels = water_level_cases(cases_dir="cases", n_cases=100)',
  6: 'water_levels.zs   # one array with the 100 flood maps -> PCA',
};
const BUTTON = { 1: 'build_template_case() ▶', 2: 'build_cases() ▶', 3: 'run_cases() ▶', 4: 'collect ▶', 5: 'Replay ↺' };
const BUSY = { 1: 'building…', 2: 'building…', 3: 'running…', 4: 'collecting…' };

async function wrapperRun(el) {
  const mda = (await json('sampling')).mda;
  const vars = ['TWL', 'Q', 'precip_acum'];
  const lim = vars.map(v => [Math.min(...mda[v]), Math.max(...mda[v])]);
  // strongest driver of each case, in normalised units
  const driver = Array.from({ length: N }, (_, i) => {
    const z = vars.map((v, k) => (mda[v][i] - lim[k][0]) / (lim[k][1] - lim[k][0]));
    return ['sea', 'river', 'rain'][z.indexOf(Math.max(...z))];
  });

  const step = (n, t) => h('li', { 'data-step': n }, t);
  const pills = [step(1, 'template'), step(2, 'cases'), step(3, 'run'), step(4, 'collect')];
  const btn = h('button', { class: 'btn on wa-btn', type: 'button' });
  const resetBtn = h('button', { class: 'btn ghost', type: 'button', title: 'Start again', 'aria-label': 'Start again' }, '↺');

  const file = (name, what) => h('li', {}, h('span', { class: 'mono' }, name), h('em', {}, what));
  const tplFiles = h('ul', { class: 'wa-files' },
    file('sfincs.ind', 'grid'), file('sfincs.msk', 'active cells'), file('sfincs_subgrid.nc', 'subgrid'));
  const perCase = h('div', { class: 'wa-percase' },
    h('div', { class: 'wa-sub' }, 'per case · 100 MDA days'),
    h('div', {}, h('b', { class: 'sea' }, 'TWL'), ' → ', h('span', { class: 'mono' }, 'sfincs.bzs')),
    h('div', {}, h('b', { class: 'river' }, 'Q'), ' → ', h('span', { class: 'mono' }, 'sfincs.dis')),
    h('div', {}, h('b', { class: 'rain' }, 'rain'), ' → ', h('span', { class: 'mono' }, 'sfincs.precip')));
  const tplPanel = h('div', { class: 'wa-panel wa-tpl' }, h('div', { class: 'wa-head' }, 'templates/'), tplFiles, perCase);

  const count = h('span', { class: 'wa-count' }, 'empty');
  const grid = h('div', { class: 'wa-grid' });
  const tiles = Array.from({ length: N }, (_, i) => {
    const t = h('div', { class: `wa-tile d-${driver[i]}`, title: `cases/${String(i).padStart(4, '0')}` }, String(i).padStart(4, '0'));
    grid.append(t);
    return t;
  });
  const chips = Object.keys(LAUNCHERS).map(k => h('button', { class: 'wa-chip', type: 'button', 'data-l': k }, k));
  const note = h('span', { class: 'wa-note' });
  const bar = h('span');
  const pct = h('span', { class: 'mono' });
  const legend = h('div', { class: 'wa-legend' }, 'colour = strongest driver of the day: ',
    h('b', { class: 'sea' }, 'sea'), ' · ', h('b', { class: 'river' }, 'river'), ' · ', h('b', { class: 'rain' }, 'rain'));
  const casesPanel = h('div', { class: 'wa-panel wa-cases' },
    h('div', { class: 'wa-head' }, 'cases/', count), grid,
    h('div', { class: 'wa-run' },
      h('div', { class: 'wa-launchers' }, h('span', { class: 'wa-sub' }, 'launcher'), ...chips, note),
      h('div', { class: 'wa-progress' }, h('div', { class: 'wa-bar' }, bar), pct)),
    legend);

  const doc = h('div', { class: 'wa-doc' }, h('span', {}, '.nc'));
  const ncName = h('div', { class: 'mono wa-nc-name' }, 'water_levels');
  const ncSize = h('div', { class: 'wa-nc-size' }, 'waiting…');
  const repr = h('pre', { class: 'wa-repr' },
    h('span', { class: 'hl' }, '<xarray.Dataset>'), '\nDimensions:\n  case_num: 100\n  y: 175   x: 127\nData variables:\n  zs (case_num, y, x)\n  ', h('span', { class: 'hl' }, 'max. water level [m]'));
  const outPanel = h('div', { class: 'wa-panel wa-out' }, h('div', { class: 'wa-head' }, 'one dataset'),
    h('div', { class: 'wa-nc' }, doc, ncName, ncSize), repr);

  const codeEl = h('code');
  const root = h('div', { class: 'wa', 'data-prevent-swipe': '' },
    h('div', { class: 'wa-top' }, h('ol', { class: 'wa-steps' }, pills), h('div', { class: 'btns' }, btn, resetBtn)),
    h('div', { class: 'wa-stage' }, tplPanel, h('div', { class: 'wa-arrow' }, '→'), casesPanel, h('div', { class: 'wa-arrow' }, '→'), outPanel),
    h('div', { class: 'wa-code' }, h('span', { class: 'wa-prompt' }, '>>>'), codeEl, h('span', { class: 'wa-caret' })));
  el.append(root);

  let state = 1, busy = false, launcher = 'serial', timers = [], typer = null;
  const reduce = reduceMotion();
  const later = (fn, ms) => timers.push(setTimeout(fn, reduce ? 0 : ms));

  function type(text) {
    clearInterval(typer);
    if (reduce) { codeEl.textContent = text; return; }
    let i = 0; codeEl.textContent = '';
    typer = setInterval(() => { i += 2; codeEl.textContent = text.slice(0, i); if (i >= text.length) clearInterval(typer); }, 14);
  }
  function render() {
    pills.forEach((p, i) => { p.classList.toggle('done', i + 1 < state); p.classList.toggle('current', i + 1 === state); });
    btn.textContent = busy ? BUSY[state] : BUTTON[state];
    btn.disabled = busy;
    chips.forEach(c => { c.classList.toggle('on', c.dataset.l === launcher); c.disabled = busy || state > 3; });
    note.textContent = LAUNCHERS[launcher].note;
  }
  const progress = f => { bar.style.width = `${f * 100}%`; pct.textContent = `${Math.round(f * N)}/${N} finished`; };
  const finish = next => { busy = false; state = next; render(); };

  function buildTemplate() {
    busy = true; render(); type(CODE[2]);
    [...tplFiles.children].forEach((li, i) => later(() => li.classList.add('built'), 300 + i * 350));
    later(() => { perCase.classList.add('built'); finish(2); }, 1400);
  }
  function buildCases() {
    busy = true; render(); type(CODE[3]);
    tiles.forEach((t, i) => later(() => { t.classList.add('built'); count.textContent = `${i + 1} cases`; }, 200 + i * 22));
    later(() => finish(3), 400 + N * 22);
  }
  function run() {
    busy = true; render(); type(CODE[4](launcher));
    root.classList.add('running');
    const queue = [...tiles], workers = LAUNCHERS[launcher].workers;
    let active = 0, done = 0;
    const pump = () => {
      while (active < workers && queue.length) {
        const t = queue.shift(); active++;
        t.classList.add('running');
        later(() => {
          t.classList.replace('running', 'done'); active--; done++;
          progress(done / N);
          if (done === N) { root.classList.remove('running'); legend.classList.add('show'); finish(4); type(CODE[5]); }
          else pump();
        }, 240 * (0.6 + 0.8 * Math.random()));
      }
    };
    pump();
  }
  function collect() {
    busy = true; render(); type(CODE[5]);
    const r0 = doc.getBoundingClientRect(), tx = r0.left + r0.width / 2, ty = r0.top + r0.height / 2;
    tiles.forEach((t, i) => {
      const r = t.getBoundingClientRect();
      t.style.transitionDelay = reduce ? '0ms' : `${i * 12}ms`;
      t.classList.add('flying');
      t.style.transform = `translate(${tx - r.left - r.width / 2}px, ${ty - r.top - r.height / 2}px) scale(.2)`;
    });
    const total = N * 12 + 650;
    later(() => doc.parentElement.classList.add('filling'), total * 0.4);
    later(() => {
      doc.parentElement.classList.replace('filling', 'filled');
      ncSize.textContent = '100 maps · 175 × 127 cells';
      repr.classList.add('show'); count.textContent = 'collected';
      type(CODE[6]); finish(5);
    }, total);
  }
  function reset() {
    timers.forEach(clearTimeout); timers = []; clearInterval(typer);
    root.classList.add('instant'); root.classList.remove('running');
    [...tplFiles.children, perCase].forEach(e => e.classList.remove('built'));
    tiles.forEach(t => { t.classList.remove('built', 'running', 'done', 'flying'); t.style.transform = ''; t.style.transitionDelay = ''; });
    doc.parentElement.classList.remove('filled', 'filling');
    repr.classList.remove('show'); legend.classList.remove('show');
    ncSize.textContent = 'waiting…'; count.textContent = 'empty';
    progress(0);
    void root.offsetWidth;
    root.classList.remove('instant');
    busy = false; state = 1;
    codeEl.textContent = CODE[1];
    render();
  }

  btn.addEventListener('click', () => {
    btn.blur();
    if (busy) return;
    ({ 1: buildTemplate, 2: buildCases, 3: run, 4: collect, 5: reset })[state]();
  });
  resetBtn.addEventListener('click', () => { resetBtn.blur(); reset(); });
  chips.forEach(c => c.addEventListener('click', () => {
    c.blur();
    if (busy || state > 3) return;
    launcher = c.dataset.l; render();
    if (state === 3) type(CODE[4](launcher));
  }));

  reset();
  return { hide: reset };
}

export default { 'wrapper-run': wrapperRun };
