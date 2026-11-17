// Deck entry point: reveal.js for navigation, demos started lazily the first
// time their slide is shown (so plots get their real size).
import ecosystem from './demos/ecosystem.js';
import caseStudy from './demos/case.js';
import sampling from './demos/sampling.js';
import sfincs from './demos/sfincs.js';
import surrogate from './demos/surrogate.js';
import emulator from './demos/emulator.js';
import floodClimate from './demos/floodclimate.js';

const DEMOS = { ...ecosystem, ...caseStudy, ...sampling, ...sfincs, ...surrogate, ...emulator, ...floodClimate };

function start(el) {
  if (!el._demo) {
    const factory = DEMOS[el.dataset.demo];
    if (!factory) { console.warn('unknown demo', el.dataset.demo); return; }
    el._demo = Promise.resolve()
      .then(() => factory(el))
      .catch(err => {
        console.error(err);
        el.innerHTML = `<div class="callout warn small">This demo could not load (${err.message}). Serve the folder over http: <code>python -m http.server --directory slides</code></div>`;
        return {};
      });
  }
  return el._demo;
}

function show(section) {
  if (!section) return;
  section.querySelectorAll('[data-demo]').forEach(el => start(el).then(d => d?.show?.()));
}
function hide(section) {
  if (!section) return;
  section.querySelectorAll('[data-demo]').forEach(el => el._demo?.then(d => d?.hide?.()));
}

const deck = Reveal;
const OPTIONS = {
  hash: true,
  disableLayout: true,
  center: false,
  transition: 'fade',
  transitionSpeed: 'fast',
  backgroundTransition: 'none',
  controls: true,
  controlsTutorial: false,
  progress: true,
  slideNumber: 'c/t',
  pdfSeparateFragments: false,
  scrollActivationWidth: null,
  width: 1600,
  height: 900,
  margin: 0,
  plugins: [RevealNotes],
};

deck.initialize(OPTIONS).then(() => {
  show(deck.getCurrentSlide());
  // warm up the next slide's demo in the background
  const warm = () => { const n = deck.getSlides()[deck.getState().indexh + 1]; n?.querySelectorAll('[data-demo]').forEach(start); };
  setTimeout(warm, 400);
  deck.on('slidechanged', e => { hide(e.previousSlide); show(e.currentSlide); setTimeout(warm, 400); });
  deck.on('fragmentshown', e => e.fragment.closest('section')?.querySelectorAll('[data-demo]').forEach(el => el._demo?.then(d => d?.fragment?.(+e.fragment.dataset.fragmentIndex, true))));
  const footer = document.querySelector('.deck-footer');
  const syncFooter = () => footer.classList.toggle('on-dark', deck.getCurrentSlide().classList.contains('divider'));
  syncFooter();
  deck.on('slidechanged', syncFooter);
  if (new URLSearchParams(location.search).has('print-pdf')) {
    deck.getSlides().forEach(s => s.querySelectorAll('[data-demo]').forEach(el => start(el).then(d => d?.show?.())));
  }
});

window.deck = deck;
