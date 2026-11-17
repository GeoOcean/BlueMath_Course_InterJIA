// Small DOM helpers for the demos' controls.

export function h(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) e.append(c);
  return e;
}

/** Range slider with a label and a live value. Releases focus on pointerup so
 *  the arrow keys go back to the slides. */
export function slider({ label, min, max, step = 1, value, fmt = v => v, cls = '', onInput }) {
  const b = h('b', {}, fmt(value));
  const input = h('input', { type: 'range', min, max, step, value });
  const wrap = h('div', { class: `ctl ${cls}`, 'data-prevent-swipe': '' }, h('label', {}, h('span', { html: label }), b), input);
  const update = () => { const v = +input.value; b.textContent = fmt(v); onInput?.(v); };
  input.addEventListener('input', update);
  input.addEventListener('pointerup', () => input.blur());
  input.addEventListener('change', () => input.blur());
  wrap.input = input;
  wrap.set = v => { input.value = v; b.textContent = fmt(+input.value); };
  wrap.value = () => +input.value;
  return wrap;
}

/** Group of toggle buttons; onPick(key) when one is clicked. */
export function buttons(items, { value, onPick, cls = '' } = {}) {
  const wrap = h('div', { class: `btns ${cls}`, 'data-prevent-swipe': '' });
  const els = items.map(([key, text]) => {
    const b = h('button', { class: 'btn', type: 'button' }, text);
    b.addEventListener('click', () => { set(key); onPick?.(key); b.blur(); });
    b.dataset.key = key;
    wrap.append(b);
    return b;
  });
  function set(key) { els.forEach(b => b.classList.toggle('on', b.dataset.key === String(key))); }
  if (value != null) set(value);
  wrap.set = set;
  return wrap;
}

export function button(text, onClick, cls = '') {
  const b = h('button', { class: `btn ${cls}`, type: 'button', 'data-prevent-swipe': '' }, text);
  b.addEventListener('click', () => { onClick(); b.blur(); });
  return b;
}

export const fmt = {
  n: (d = 0) => v => Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }),
};

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
