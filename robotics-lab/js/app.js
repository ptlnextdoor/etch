// Robotics Lab — site UI: 3D board stage, lab mount point, lesson, "find the part" quiz, comparison table.
import { Viewer } from './core/viewer.js';
import { BOARDS as RAW_BOARDS } from './boards/index.js';

const BOARDS = (Array.isArray(RAW_BOARDS) ? RAW_BOARDS : []).filter((d) => d && d.id);
const SITE = 'Robotics Lab';

// ───────────────────────── utilities ─────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const icon = (name, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const list = (v) => (Array.isArray(v) ? v.filter((x) => x != null && x !== '') : []);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Announces what the visitor does. A separate module (js/track.js) may listen; nothing here talks to the network. */
function track(detail) { try { window.dispatchEvent(new CustomEvent('site:track', { detail })); } catch { /* never let analytics break the UI */ } }
const boardId = () => (state.def && state.def.id) || '';
const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
const mqNarrow = window.matchMedia('(max-width: 860px)');
const motion = () => !mqReduce.matches;          // may camera moves be animated?
const params = new URLSearchParams(location.search);
const flag = (name) => { const v = params.get(name); return v == null ? null : !/^(0|false|off|no)$/i.test(v); };

const PAPER = [241, 234, 220];
function parseHex(hex) {
  let h = String(hex || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.replace(/./g, '$&$&');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
const relLum = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const la = relLum(a), lb = relLum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
const rgbStr = (rgb, a) => (a == null ? `rgb(${rgb.map(Math.round).join(',')})` : `rgba(${rgb.map(Math.round).join(',')},${a})`);
const safeColor = (hex) => { const c = parseHex(hex); return c ? rgbStr(c) : '#0d7d8a'; };
/** Accent for text and hairlines: darken the board colour until it reads well on the cream background. */
function accentInk(rgb) { let c = rgb.slice(), n = 0; while (contrast(c, PAPER) < 4.6 && n++ < 24) c = c.map((v) => v * 0.9); return c; }

const KIND = {
  pwr: 'power', gnd: 'ground', dig: 'digital', ana: 'analog', com: 'bus', ctl: 'control', nc: 'not connected',
};
const KIND_LEGEND = [
  ['pwr', 'Power'], ['gnd', 'Ground'], ['dig', 'Digital'], ['ana', 'Analog'],
  ['com', 'Buses: UART, I²C, SPI'], ['ctl', 'Control: RESET, EN, BOOT'], ['nc', 'Not connected'],
];
const LEVELS = { beginner: 1, intermediate: 2, advanced: 3 };
const COMPARE_COLS = [
  ['mcu', 'MCU'], ['clock', 'Clock'], ['flash', 'Flash'], ['ram', 'RAM'], ['gpio', 'GPIO'],
  ['analog', 'Analog in'], ['wireless', 'Wireless'], ['logic', 'Logic'], ['price', 'Price'],
];
const KEY_NUMBERS = [
  ['clock', 'Clock'], ['flash', 'Flash'], ['ram', 'RAM'], ['gpio', 'GPIO pins'], ['logic', 'Logic level'], ['price', 'Price'],
];
const VIEW_NAMES = ['iso', 'top', 'bottom', 'front', 'back', 'left', 'right'];

// ───────────────────────── DOM ─────────────────────────
const el = {
  top: $('#top'), stage: $('#sec-stage'), view: $('#view'), viewer: $('#viewer'), markers: $('#markers'), tip: $('#tip'),
  loader: $('#loader'), error: $('#scene-error'), zoomhint: $('#zoomhint'), toast: $('#toast'),
  info: $('#info'), head: $('#head'), meta: $('#head-meta'), count: $('#head-count'), name: $('#head-name'),
  tagline: $('#head-tagline'), level: $('#head-level'),
  partcard: $('#partcard'), legend: $('#legend'), quiz: $('#quizpanel'),
  dock: $('#dock'), toolbar: $('#toolbar'), rail: $('#rail'), railList: $('#rail-list'),
  lessonTitle: $('#lesson-title'), lesson: $('#lesson-body'),
  quizStart: $('#quiz-start'), quizStartLabel: $('#quiz-start-label'), quizInfo: $('#quiz-info'),
  asmStart: $('#asm-start'), asmStartLabel: $('#asm-start-label'), asmInfo: $('#asm-info'),
  compare: $('#compare-table'),
  btnRotate: $('#btn-rotate'), btnLabels: $('#btn-labels'), btnQuiz: $('#btn-quiz'),
  btnAsm: $('#btn-asm'), btnAsmLabel: $('#btn-asm-label'),
  lab: $('#lab'), labRoot: $('#lab-root'), labNote: $('#lab-note'),
};

// ───────────────────────── state ─────────────────────────
const state = {
  index: -1, def: null,          // active board
  ready: null,                   // the def actually loaded in the viewer
  part: null,                    // selected part
  labels: flag('labels') ?? false,
  rotate: flag('rotate') ?? !mqReduce.matches,
  view: 'iso',
  quiz: null,                    // { qs, i, score, tries, hinted, locked, done, results[], fb, timer, focused }
  assembling: false,             // assembly mode owns the stage (js/core/assembly.js)
  booted: false,
};
let viewer = null;
let markers = [];                // [{ id, el, vis }]
const thumbs = new Map();        // id → dataURL | false
const readStore = (key) => { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; } };
const writeStore = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode — fine */ } };
const best = readStore('boards.quiz.best');          // id → { score, total }
const bestTime = readStore('boards.asm.best');       // id → seconds

// ───────────────────────── board data ─────────────────────────
function partOrder(def) {
  const parts = (def && def.parts) || {};
  const out = [];
  for (const id of list(def && def.partOrder)) if (parts[id] && !out.includes(id)) out.push(id);
  for (const id of Object.keys(parts)) if (!out.includes(id)) out.push(id);
  return out;
}
const partName = (def, id) => (def && def.parts && def.parts[id] && def.parts[id].name) || String(id);
const quizTargets = (q) => [].concat(q && q.part != null ? q.part : []).map(String);
const quizIndex = (def, q) => list(def && def.quiz).indexOf(q);   // position in the board's own question list, not in the shuffled run
function quizQuestions(def) {
  const parts = (def && def.parts) || {};
  return list(def && def.quiz).filter((q) => q && q.q && quizTargets(q).some((id) => parts[id]));
}
const metaLine = (def) => [def.maker, def.year].filter((v) => v != null && v !== '').join(' · ');

// ───────────────────────── accent and stage heading ─────────────────────────
function applyAccent(def) {
  const rgb = parseHex(def.accent) || [13, 125, 138];
  const root = document.documentElement.style;
  root.setProperty('--accent', rgbStr(rgb));
  root.setProperty('--accent-ink', rgbStr(accentInk(rgb)));
  root.setProperty('--accent-soft', rgbStr(accentInk(rgb), 0.11));
}

const pad2 = (n) => String(n).padStart(2, '0');
function renderHead(def) {
  if (el.count) el.count.textContent = BOARDS.length > 1 ? `${pad2(state.index + 1)} / ${pad2(BOARDS.length)}` : '';
  el.meta.textContent = metaLine(def) || ' ';
  el.name.textContent = def.name || def.id;
  el.tagline.textContent = def.tagline || '';
  el.tagline.hidden = !def.tagline;
  if (def.level) {
    const n = LEVELS[String(def.level).toLowerCase()] || 0;
    el.level.innerHTML = `<span class="level__bars" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span><span>${esc(def.level)}</span>`;
    el.level.hidden = false;
  } else el.level.hidden = true;
  el.head.classList.remove('is-swap'); void el.head.offsetWidth; el.head.classList.add('is-swap');
  document.title = `${def.name || def.id} — ${SITE}`;
}

// ───────────────────────── board rail ─────────────────────────
function renderRail() {
  el.railList.innerHTML = BOARDS.map((d) => `
    <li class="rail__item">
      <button type="button" class="rcard" data-board="${esc(d.id)}" aria-current="false" title="${esc([d.name, d.tagline].filter(Boolean).join(' — '))}" style="--card-accent:${safeColor(d.accent)}">
        <span class="rcard__thumb is-skel" data-thumb="${esc(d.id)}"></span>
        <span class="rcard__name">${esc(d.name || d.id)}</span>
      </button>
    </li>`).join('');
  for (const [id, url] of thumbs) paintThumb(id, url);
}
/** Fills every thumbnail slot of a board (rail card, comparison row) once its picture is ready. */
function paintThumb(id, url) {
  for (const box of $$('[data-thumb]')) {
    if (box.dataset.thumb !== id) continue;
    box.classList.remove('is-skel');
    box.innerHTML = url ? `<img src="${esc(url)}" alt="" decoding="async" draggable="false">` : icon('board');
  }
}
function updateRail(scrollBehavior = 'smooth') {
  const id = state.def && state.def.id;
  let active = null;
  for (const card of $$('.rcard', el.railList)) {
    const on = card.dataset.board === id;
    card.setAttribute('aria-current', on ? 'true' : 'false');
    if (on) active = card;
  }
  if (active && el.rail.scrollWidth > el.rail.clientWidth + 2) {
    const left = active.offsetLeft - (el.rail.clientWidth - active.offsetWidth) / 2;
    el.rail.scrollTo({ left, behavior: mqReduce.matches ? 'auto' : scrollBehavior });
  }
}

// ───────────────────────── lesson ─────────────────────────
const block = (title, note, body, cls = '') => `
  <section class="block ${cls}">
    <div class="block__side"><h3>${title}</h3>${note ? `<p>${note}</p>` : ''}</div>
    <div class="block__main">${body}</div>
  </section>`;

function renderLesson(def) {
  el.lessonTitle.textContent = def.name ? `${def.name}: what you need to know` : 'Meet the board';
  const out = [];

  const cmp = def.compare || {};
  const tiles = KEY_NUMBERS.filter(([k]) => cmp[k] != null && cmp[k] !== '' && cmp[k] !== '—');
  const keyNumbers = tiles.length
    ? `<dl class="tiles">${tiles.map(([k, t]) => `<div class="tile"><dt>${esc(t)}</dt><dd>${esc(cmp[k])}</dd></div>`).join('')}</dl>` : '';
  if (def.summary || keyNumbers) {
    out.push(block('In short', esc(metaLine(def)), `${def.summary ? `<p class="summary">${esc(def.summary)}</p>` : ''}${keyNumbers}`));
  }

  const specs = list(def.specs).filter((r) => Array.isArray(r) && r.length >= 2);
  if (specs.length) {
    out.push(block('Specs', 'The full data sheet in plain words.',
      `<dl class="specs">${specs.map(([k, v]) => `<div class="specs__row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`));
  }

  const order = partOrder(def);
  if (order.length) {
    out.push(block('What’s on the board', `${order.length} parts, numbered like the labels on the 3D model. Click one and the camera flies to it.`,
      `<ol class="parts">${order.map((id, i) => `
        <li><button type="button" class="part" data-part="${esc(id)}" data-from="lesson">
          <span class="chip">${i + 1}</span>
          <span class="part__body"><span class="part__name">${esc(partName(def, id))}</span>${def.parts[id].text ? `<span class="part__text">${esc(def.parts[id].text)}</span>` : ''}</span>
          <span class="part__go" aria-hidden="true">${icon('up')}</span>
        </button></li>`).join('')}</ol>`));
  }

  const good = list(def.highlights), bad = list(def.cautions);
  if (good.length || bad.length) {
    out.push(block('Strengths and pitfalls', 'Why people love this board — and where beginners usually slip.',
      `<div class="duo">
        ${good.length ? `<div><h4>Strengths</h4><ul class="ticks ticks--good">${good.map((t) => `<li>${icon('check')}${esc(t)}</li>`).join('')}</ul></div>` : ''}
        ${bad.length ? `<div><h4>Watch out</h4><ul class="ticks ticks--warn">${bad.map((t) => `<li>${icon('warn')}${esc(t)}</li>`).join('')}</ul></div>` : ''}
      </div>`));
  }

  const notes = list(def.pinNotes).filter((n) => n && (n.title || n.text));
  out.push(block('Pins', 'The contacts where sensors, motors and power connect.',
    `${notes.length ? `<div class="notes">${notes.map((n) => `<div class="note">${n.title ? `<h4>${esc(n.title)}</h4>` : ''}${n.text ? `<p>${esc(n.text)}</p>` : ''}</div>`).join('')}</div>` : ''}
     <div class="pinbox"><p class="pinhint">${icon('cursor')}<span>Hover over any pin on the 3D board to see its name and function.</span></p>
     <ul class="kinds" aria-label="Tooltip colours by pin type">${KIND_LEGEND.map(([k, t]) => `<li><span class="dot" data-kind="${k}"></span>${esc(t)}</li>`).join('')}</ul></div>`));

  if (def.code && def.code.src) {
    const lang = String(def.code.lang || '');
    const langName = /^(micropython|upy)/i.test(lang) ? 'MicroPython' : /^py/i.test(lang) ? 'Python' : /^(cpp|c\+\+|c|ino|arduino)$/i.test(lang) ? 'Arduino C++' : lang;
    out.push(block('First code', 'Copy it, upload it to the board and check that everything works.',
      `<figure class="code">
        <figcaption class="code__bar">
          <span class="code__title">${esc(def.code.title || 'First program')}</span>
          ${langName ? `<span class="code__lang">${esc(langName)}</span>` : ''}
          <button type="button" class="code__copy" data-action="copy-code">${icon('copy')}<span>Copy</span></button>
        </figcaption>
        <pre tabindex="0" aria-label="Source code"><code>${highlightCode(String(def.code.src), lang)}</code></pre>
      </figure>`));
  }

  const uses = list(def.uses);
  if (uses.length) out.push(block('Where it shines', 'Project ideas this board suits best.', `<ol class="uses">${uses.map((t) => `<li><span>${esc(t)}</span></li>`).join('')}</ol>`));

  const facts = list(def.facts);
  if (facts.length) out.push(block('Facts', '', `<div class="facts">${facts.map((t) => `<p class="fact">${esc(t)}</p>`).join('')}</div>`));

  el.lesson.innerHTML = out.join('');
}

// ── tiny syntax highlighter: comments, strings, numbers, keywords, function calls ──
const words = (s) => new Set(s.trim().split(/\s+/));
const KW_CPP = words(`void int long short char bool boolean byte word float double unsigned signed const static volatile extern inline
  if else for while do switch case default break continue return goto struct class enum union typedef public private protected
  new delete sizeof true false nullptr NULL auto namespace using template typename this String
  uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t size_t`);
const KW_PY = words(`def class import from as if elif else for while in not and or return pass break continue True False None
  try except finally with lambda global nonlocal yield raise del is async await assert`);
const CONSTS = words('HIGH LOW INPUT OUTPUT INPUT_PULLUP INPUT_PULLDOWN LED_BUILTIN A0 A1 A2 A3 A4 A5 A6 A7');
const NUM = String.raw`\b(?:0[xX][\da-fA-F]+|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?[uUlLfF]*)\b`;
const RE_CPP = new RegExp(String.raw`(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(${NUM})|(#[ \t]*[A-Za-z_]\w*|[A-Za-z_]\w*)`, 'g');
const RE_PY = new RegExp(String.raw`(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(${NUM})|([A-Za-z_]\w*)`, 'g');

function highlightCode(src, lang) {
  const py = /^(py|python|micropython|circuitpython)/i.test(lang || '');
  const re = py ? RE_PY : RE_CPP, kw = py ? KW_PY : KW_CPP;
  // multi-line tokens are split per line so every line can be wrapped safely afterwards
  const wrap = (cls, s) => s.split('\n').map((p) => (p ? `<span class="t-${cls}">${esc(p)}</span>` : '')).join('\n');
  src = src.replace(/\r\n?/g, '\n').replace(/\t/g, '  ').replace(/^\n+|\s+$/g, '');
  let out = '', last = 0, m;
  re.lastIndex = 0;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index));
    const tok = m[0];
    if (m[1] !== undefined) out += wrap('com', tok);
    else if (m[2] !== undefined) out += wrap('str', tok);
    else if (m[3] !== undefined) out += wrap('num', tok);
    else if (tok[0] === '#') out += wrap('pre', tok);
    else if (kw.has(tok)) out += wrap('kw', tok);
    else if (!py && CONSTS.has(tok)) out += wrap('num', tok);
    else if (/^[ \t]*\($/.test(src.slice(re.lastIndex).match(/^[ \t]*.?/)[0])) out += wrap('fn', tok);
    else out += esc(tok);
    last = re.lastIndex;
  }
  out += esc(src.slice(last));
  return out.split('\n').map((l) => `<span class="ln">${l}</span>`).join('');
}

async function copyCode(btn) {
  const src = state.def && state.def.code && state.def.code.src;
  if (!src) return;
  track({ k: 'code', b: boardId() });
  let ok = false;
  try { await navigator.clipboard.writeText(String(src)); ok = true; } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = String(src); ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
    } catch { ok = false; }
  }
  btn.innerHTML = ok ? `${icon('check')}<span>Copied</span>` : `${icon('x')}<span>Couldn’t copy — select it manually</span>`;
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.innerHTML = `${icon('copy')}<span>Copy</span>`; }, 1800);
}

// ───────────────────────── comparison ─────────────────────────
function renderCompare() {
  if (!BOARDS.length) { el.compare.innerHTML = ''; return; }
  el.compare.innerHTML = `
    <thead><tr><th scope="col">Board</th>${COMPARE_COLS.map(([, t]) => `<th scope="col">${esc(t)}</th>`).join('')}</tr></thead>
    <tbody>${BOARDS.map((d) => {
      const c = d.compare || {};
      return `<tr data-board="${esc(d.id)}" data-from="compare">
        <th scope="row"><button type="button" class="rowbtn" data-board="${esc(d.id)}" data-from="compare">
          <span class="rowbtn__thumb is-skel" data-thumb="${esc(d.id)}"></span>
          <span class="rowbtn__text"><b>${esc(d.name || d.id)}</b>${d.maker ? `<span>${esc(d.maker)}</span>` : ''}</span>
        </button></th>
        ${COMPARE_COLS.map(([k]) => `<td${k === 'mcu' || k === 'wireless' || k === 'analog' ? ' class="is-wide"' : ''}>${esc(c[k] != null && c[k] !== '' ? c[k] : '—')}</td>`).join('')}
      </tr>`;
    }).join('')}</tbody>`;
  for (const [id, url] of thumbs) paintThumb(id, url);
}
function updateCompare() {
  const id = state.def && state.def.id;
  for (const tr of $$('tbody tr', el.compare)) {
    const on = tr.dataset.board === id;
    tr.classList.toggle('is-active', on);
    const btn = $('.rowbtn', tr);
    if (btn) { if (on) btn.setAttribute('aria-current', 'true'); else btn.removeAttribute('aria-current'); }
  }
}

// ───────────────────────── practice section: quiz + assembly cards ─────────────────────────
const clock = (sec) => { sec = Math.max(0, Math.round(Number(sec) || 0)); return `${Math.floor(sec / 60)}:${pad2(sec % 60)}`; };
function renderQuizInfo() {
  const def = state.def; if (!def) return;
  const name = def.name || def.id;
  const n = quizQuestions(def).length;
  el.quizStart.disabled = !n || !viewer;
  el.btnQuiz.disabled = !n || !viewer;
  el.quizStartLabel.textContent = n ? `Start the quiz · ${name}` : 'Quiz not ready yet';
  if (!viewer) el.quizInfo.textContent = 'The quiz needs the 3D model, and it could not start in this browser.';
  else if (!n) el.quizInfo.textContent = 'No questions written for this board yet — pick another one.';
  else {
    const b = best[def.id];
    el.quizInfo.innerHTML = `${n} ${n === 1 ? 'question' : 'questions'}${b && b.total ? ` · best score <b>${Number(b.score) || 0} of ${Number(b.total) || 0}</b>` : ''}`;
  }

  if (el.asmStart) {
    const parts = partOrder(def).length;
    el.asmStart.disabled = !viewer; el.btnAsm.disabled = !viewer;
    el.asmStartLabel.textContent = `Assemble · ${name}`;
    const t = Number(bestTime[def.id]);
    el.asmInfo.innerHTML = !viewer ? 'Assembly needs the 3D model, and it could not start in this browser.'
      : `${parts ? `${parts} labelled parts` : 'Every part of the board'}${t > 0 ? ` · best time <b>${clock(t)}</b>` : ''}`;
  }
}

// ───────────────────────── panels over the stage ─────────────────────────
function renderPartCard() {
  const def = state.def, id = state.part;
  if (!def || !id || !def.parts || !def.parts[id]) { el.partcard.innerHTML = ''; return; }
  const order = partOrder(def), i = order.indexOf(id), p = def.parts[id];
  const many = order.length > 1;
  el.partcard.innerHTML = `
    <div class="panel__top">
      <span class="kicker">Part</span>
      <span class="panel__count">${i >= 0 ? `${String(i + 1).padStart(2, '0')} / ${String(order.length).padStart(2, '0')}` : ''}</span>
      <button type="button" class="iconbtn" data-action="part-close" aria-label="Close the part card">${icon('x')}</button>
    </div>
    <h3 class="partcard__name">${esc(p.name || id)}</h3>
    ${p.text ? `<p class="partcard__text">${esc(p.text)}</p>` : ''}
    <div class="partcard__nav">
      <button type="button" class="iconbtn iconbtn--line" data-action="part-prev" aria-label="Previous part" ${many ? '' : 'disabled'}>${icon('left')}</button>
      <button type="button" class="iconbtn iconbtn--line" data-action="part-next" aria-label="Next part" ${many ? '' : 'disabled'}>${icon('right')}</button>
      <span class="hint">Drag to rotate,<br>pinch to zoom</span>
    </div>`;
}

function renderLegend() {
  const def = state.def; if (!def) { el.legend.innerHTML = ''; return; }
  const order = partOrder(def);
  el.legend.innerHTML = `
    <div class="panel__top">
      <span class="kicker">Labels · ${order.length} parts</span>
      <button type="button" class="iconbtn" data-action="toggle-labels" aria-label="Hide labels">${icon('x')}</button>
    </div>
    <ol class="legend__list">${order.map((id, i) => `
      <li><button type="button" class="legend__item" data-part="${esc(id)}" data-from="legend"><span class="chip chip--sm">${i + 1}</span><span>${esc(partName(def, id))}</span></button></li>`).join('')}</ol>`;
}

function renderQuiz() {
  const qz = state.quiz, def = state.def;
  if (!qz || !def) { el.quiz.innerHTML = ''; return; }
  const total = qz.qs.length;
  const progress = `<div class="quiz__progress" aria-hidden="true">${qz.qs.map((_, i) => `<i class="${qz.results[i] ? 'is-' + qz.results[i] : (i === qz.i && !qz.done ? 'is-cur' : '')}"></i>`).join('')}</div>`;
  const close = `<button type="button" class="iconbtn" data-action="quiz-exit" aria-label="End the quiz">${icon('x')}</button>`;

  if (qz.done) {
    const ratio = total ? qz.score / total : 0;
    const verdict = ratio === 1 ? 'Flawless — you know this board by sight.'
      : ratio >= 0.6 ? 'Nice work. One more round and you’ll get them all.'
      : 'Take another look at “What’s on the board” and try again — the parts stick quickly.';
    el.quiz.innerHTML = `
      <div class="panel__top"><span class="kicker">Result · ${esc(def.name || def.id)}</span>${close}</div>
      <p class="quiz__big" role="status">${qz.score}<span>of ${total}</span></p>
      <p class="quiz__verdict">${verdict}</p>
      ${progress.replace('quiz__progress"', 'quiz__progress" style="margin:16px 0 0"')}
      <p class="quiz__legend"><span><i style="background:var(--ok)"></i>first try</span><span><i style="background:#c9a14a"></i>took a few tries</span><span><i style="background:var(--bad)"></i>skipped</span></p>
      <div class="quiz__foot">
        <button type="button" class="btn btn--sm" data-action="quiz-restart">Play again</button>
        <button type="button" class="btn btn--sm btn--ghost" data-action="quiz-to-lesson">Back to the lesson</button>
      </div>`;
    return;
  }

  const q = qz.qs[qz.i];
  const last = qz.i === total - 1;
  const fb = qz.fb ? `<p class="quiz__fb ${qz.fb.ok ? 'is-ok' : 'is-bad'}">${icon(qz.fb.ok ? 'check' : 'x')}<span>${esc(qz.fb.text)}</span></p>` : '';
  const hint = qz.hinted && !qz.locked ? `<p class="quiz__hint">${icon('bulb')}<span>${esc(q.hint || 'No hint for this one — look closely at the markings on the board.')}</span></p>` : '';
  const idle = !qz.fb && !qz.hinted ? '<p class="quiz__idle">Click the part on the 3D model.</p>' : '';
  const buttons = qz.locked
    ? `<button type="button" class="btn btn--sm" data-action="quiz-next">${last ? 'See the result' : 'Next'}${icon('right')}</button>`
    : `<button type="button" class="btn btn--sm btn--ghost" data-action="quiz-hint" ${qz.hinted ? 'disabled' : ''}>${icon('bulb')}Hint</button>
       <button type="button" class="btn btn--sm btn--ghost" data-action="quiz-skip">Skip</button>`;
  el.quiz.innerHTML = `
    <div class="panel__top">
      <span class="kicker">Find the part</span>
      <span class="panel__count">Question ${qz.i + 1} of ${total}</span>
      ${close}
    </div>
    ${progress}
    <p class="quiz__q">${esc(q.q)}</p>
    <div role="status" aria-live="polite">${fb}${hint}${idle}</div>
    <div class="quiz__foot">${buttons}<span class="quiz__score">Score: <b>${qz.score}</b></span></div>`;
}

/** Brings panels, buttons and markers in line with the current state. */
function syncUI() {
  const asmOn = state.assembling;
  const inQuiz = !!state.quiz && !asmOn, hasPart = !!state.part && !inQuiz && !asmOn;
  const labelsOn = state.labels && !inQuiz && !asmOn;
  const legendOn = labelsOn && !hasPart;
  el.partcard.hidden = !hasPart;
  el.quiz.hidden = !inQuiz;
  el.legend.hidden = !legendOn;
  el.markers.hidden = !labelsOn;
  el.stage.classList.toggle('has-sheet', hasPart || inQuiz);                 // phones: the sub-panel is a bottom sheet over the dock
  el.stage.classList.toggle('is-compact', hasPart || inQuiz || legendOn);    // desktop: the title block shrinks to make room below it
  el.stage.classList.toggle('has-part', hasPart);
  el.stage.classList.toggle('is-quiz', inQuiz);
  el.stage.classList.toggle('is-asm', asmOn);
  if (el.top) el.top.classList.toggle('is-asm', asmOn);
  el.btnAsm.setAttribute('aria-pressed', String(asmOn));
  el.btnAsmLabel.textContent = asmOn ? 'Exit assembly' : 'Assemble it';

  el.btnRotate.setAttribute('aria-pressed', String(state.rotate));
  el.btnLabels.setAttribute('aria-pressed', String(state.labels));
  el.btnLabels.disabled = inQuiz;
  el.btnQuiz.setAttribute('aria-pressed', String(inQuiz));
  for (const b of $$('[data-view]', el.toolbar)) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));

  for (const b of $$('.part', el.lesson)) b.classList.toggle('is-active', hasPart && b.dataset.part === state.part);
  for (const m of markers) m.el.classList.toggle('is-active', hasPart && m.id === state.part);

  if (viewer) viewer.autoRotate = state.rotate && !inQuiz && !state.part && !asmOn;
  if (labelsOn) updateMarkers();
  if (!labelsOn || inQuiz) hideTip();
}

// ───────────────────────── callout markers ─────────────────────────
function buildMarkers() {
  const def = state.def;
  markers = [];
  if (!def) { el.markers.innerHTML = ''; return; }
  const have = viewer && state.ready === def ? new Set(viewer.partIds()) : null;
  const order = partOrder(def);
  el.markers.innerHTML = order.map((id, i) => (have && !have.has(id) ? '' : `
    <div class="marker is-off" data-marker="${esc(id)}">
      <button type="button" class="marker__btn" data-part="${esc(id)}" data-from="marker" aria-label="${esc(`${i + 1}. ${partName(def, id)}`)}">${i + 1}</button>
      <span class="marker__name" aria-hidden="true">${esc(partName(def, id))}</span>
    </div>`)).join('');
  markers = $$('.marker', el.markers).map((n) => ({ id: n.dataset.marker, el: n, vis: null }));
  for (const b of $$('.legend__item', el.legend)) { b.classList.remove('is-far'); b.title = ''; }
}
function updateMarkers() {
  if (!viewer || !state.labels || state.quiz || state.assembling || state.ready !== state.def) return;
  for (const m of markers) {
    let p = null;
    try { p = viewer.project(m.id); } catch { p = null; }
    const vis = !!(p && p.visible && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (vis) m.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
    if (vis !== m.vis) {
      m.vis = vis; m.el.classList.toggle('is-off', !vis);
      const row = legendRow(m.id);
      if (row) { row.classList.toggle('is-far', !vis); row.title = vis ? '' : 'Not visible from this side — turn the board over'; }
    }
  }
}
const legendRow = (id) => $$('.legend__item', el.legend).find((b) => b.dataset.part === id) || null;
function hotPart(id, named = false) {
  for (const m of markers) { const on = !!id && m.id === id; m.el.classList.toggle('is-hot', on); m.el.classList.toggle('is-named', on && named); }
  for (const b of $$('.legend__item', el.legend)) b.classList.toggle('is-hot', !!id && b.dataset.part === id);
}

// ───────────────────────── tooltip ─────────────────────────
let tipKey = '';
function hideTip() { tipKey = ''; el.tip.classList.remove('is-on'); el.tip.setAttribute('aria-hidden', 'true'); }
function showTip(key, html, x, y) {
  if (key !== tipKey) { tipKey = key; el.tip.innerHTML = html; }
  const W = el.view.clientWidth, H = el.view.clientHeight, w = el.tip.offsetWidth, h = el.tip.offsetHeight;
  let tx = x + 16, ty = y + 18;
  if (tx + w > W - 8) tx = x - w - 14;
  if (ty + h > H - 8) ty = y - h - 14;
  tx = Math.max(8, Math.min(tx, W - w - 8)); ty = Math.max(8, Math.min(ty, H - h - 8));
  el.tip.style.transform = `translate3d(${Math.round(tx)}px, ${Math.round(ty)}px, 0)`;
  el.tip.classList.add('is-on'); el.tip.setAttribute('aria-hidden', 'false');
}
function onHover(e) {
  const def = state.def;
  if (!e || !def || state.ready !== def || state.assembling) { hideTip(); hotPart(null); return; }
  if (e.type === 'pin' && e.pin) {
    const p = e.pin, kind = KIND[p.kind] ? p.kind : 'nc';
    const owner = !state.quiz && e.id && def.parts && def.parts[e.id] ? def.parts[e.id].name : '';
    showTip(`pin:${p.name}:${p.fn}:${e.id || ''}`,
      `<div class="tip__pin"><span class="dot" data-kind="${kind}"></span><b>${esc(p.name)}</b><span class="tip__kind">${esc(KIND[kind])}</span></div>
       ${p.fn ? `<div class="tip__fn">${esc(p.fn)}</div>` : ''}${owner ? `<div class="tip__more">${esc(owner)}</div>` : ''}`, e.x, e.y);
    hotPart(null);
    return;
  }
  if (e.type === 'part' && e.id && def.parts && def.parts[e.id] && !state.quiz) {
    showTip(`part:${e.id}`, `<div>${esc(def.parts[e.id].name || e.id)}</div>${state.part === e.id ? '' : '<div class="tip__more">click for details</div>'}`, e.x, e.y);
    hotPart(e.id);
    return;
  }
  hideTip(); hotPart(null);
}

// ───────────────────────── part selection ─────────────────────────
const boardReady = () => !!viewer && state.ready === state.def;
function scrollToStage() { el.stage.scrollIntoView({ behavior: mqReduce.matches ? 'auto' : 'smooth', block: 'start' }); }

function selectPart(id, { scroll = false, focusCard = false } = {}) {
  const def = state.def;
  if (!def || !def.parts || !def.parts[id]) return;
  stopAssembly();
  if (state.quiz) exitQuiz();
  if (state.part !== id) track({ k: 'part', b: def.id, p: id });
  state.part = id;
  renderPartCard(); syncUI(); hideTip();
  if (boardReady()) viewer.focus(id, motion());
  if (scroll) scrollToStage();
  if (focusCard) el.partcard.focus({ preventScroll: true });
}
function closePart({ refocus = true } = {}) {
  if (!state.part) return;
  state.part = null;
  renderPartCard(); syncUI();
  if (refocus && boardReady()) viewer.focus(null, motion());
}
function stepPart(dir) {
  const order = partOrder(state.def); if (!order.length) return;
  const i = order.indexOf(state.part);
  const next = order[((i < 0 ? (dir > 0 ? -1 : 0) : i) + dir + order.length) % order.length];
  selectPart(next);
  const btn = $(`[data-action="${dir > 0 ? 'part-next' : 'part-prev'}"]`, el.partcard);
  if (btn) btn.focus({ preventScroll: true });
}

// ───────────────────────── quiz ─────────────────────────
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function startQuiz({ scroll = true } = {}) {
  const def = state.def; if (!def || !boardReady()) return;
  const qs = quizQuestions(def); if (!qs.length) return;
  stopAssembly();
  if (state.quiz) clearTimeout(state.quiz.timer);
  const hadPart = !!state.part;
  state.part = null; renderPartCard();
  state.quiz = { qs: shuffle(qs), i: 0, score: 0, tries: 0, hinted: false, locked: false, done: false, results: [], fb: null, timer: 0, focused: false };
  renderQuiz(); syncUI();
  if (boardReady()) { viewer.highlight(null); if (hadPart) viewer.focus(null, motion()); }
  if (scroll) scrollToStage();
  el.quiz.focus({ preventScroll: true });
}
function exitQuiz() {
  const qz = state.quiz; if (!qz) return;
  clearTimeout(qz.timer);
  state.quiz = null;
  renderQuiz(); syncUI();
  if (boardReady()) { if (qz.focused) viewer.focus(null, motion()); else viewer.highlight(null); }
}
function quizAnswer(id) {
  const qz = state.quiz, def = state.def;
  if (!qz || qz.done || qz.locked) return;
  const q = qz.qs[qz.i];
  if (quizTargets(q).includes(id)) {
    const clean = qz.tries === 0 && !qz.hinted;
    if (qz.tries === 0) track({ k: 'quiz', b: def.id, i: quizIndex(def, q), ok: true });
    if (clean) qz.score++;
    qz.results[qz.i] = clean ? 'ok' : 'late';
    qz.locked = true;
    qz.fb = { ok: true, text: `Correct — ${partName(def, id)}.` };
    if (boardReady()) viewer.highlight(id);
    renderQuiz();
    qz.timer = setTimeout(nextQuestion, 2200);
  } else {
    if (qz.tries === 0) track({ k: 'quiz', b: def.id, i: quizIndex(def, q), ok: false });
    qz.tries++;
    qz.fb = { ok: false, text: def.parts && def.parts[id] ? `Not quite — that’s “${partName(def, id)}”. Try again.` : 'Not quite. Try again.' };
    renderQuiz();
  }
}

function quizHint() { const qz = state.quiz; if (!qz || qz.done || qz.locked) return; qz.hinted = true; renderQuiz(); focusQuizButton('quiz-skip'); }
function quizSkip() {
  const qz = state.quiz, def = state.def; if (!qz || qz.done || qz.locked) return;
  const q = qz.qs[qz.i], id = quizTargets(q).find((t) => def.parts && def.parts[t]);
  if (qz.tries === 0) track({ k: 'quiz', b: def.id, i: quizIndex(def, q), ok: false });   // skipped without a single try
  qz.results[qz.i] = 'skip'; qz.locked = true;
  qz.fb = { ok: false, text: `Answer: ${partName(def, id)}. It’s highlighted on the board.` };
  if (boardReady() && id) { viewer.focus(id, motion()); qz.focused = true; }
  renderQuiz(); focusQuizButton('quiz-next');
}
function nextQuestion() {
  const qz = state.quiz; if (!qz || qz.done) return;
  clearTimeout(qz.timer);
  if (!qz.locked) return;
  if (boardReady()) { if (qz.focused) viewer.focus(null, motion()); else viewer.highlight(null); }
  qz.focused = false; qz.locked = false; qz.fb = null; qz.hinted = false; qz.tries = 0;
  qz.i++;
  if (qz.i >= qz.qs.length) {
    qz.done = true;
    track({ k: 'quizdone', b: state.def.id, i: qz.score });
    const id = state.def.id, prev = best[id];
    if (!prev || prev.total !== qz.qs.length || qz.score > prev.score) {
      best[id] = { score: qz.score, total: qz.qs.length };
      writeStore('boards.quiz.best', best);
    }
    renderQuizInfo();
  }
  const hadFocus = el.quiz.contains(document.activeElement);
  renderQuiz();
  if (hadFocus) focusQuizButton(qz.done ? 'quiz-restart' : null);
}
function focusQuizButton(action) {
  const t = action ? $(`[data-action="${action}"]`, el.quiz) : null;
  (t || el.quiz).focus({ preventScroll: true });
}

// ───────────────────────── viewer ─────────────────────────
let chain = Promise.resolve();
const enqueue = (fn) => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };
function setLoading(on) { el.loader.classList.toggle('is-on', !!on); }
function sceneError(msg) {
  el.error.hidden = !msg;
  el.error.textContent = msg || '';
  el.viewer.style.visibility = msg ? 'hidden' : '';
  el.stage.classList.toggle('no-3d', !!msg);
  if (msg) setLoading(false);
}

if (/Mac|iPhone|iPad/.test(navigator.platform || '')) { const k = $('kbd', el.zoomhint); if (k) k.textContent = '⌘'; }
let wheelHints = 0, wheelHintAt = 0, wheelHintTimer = 0;
function wheelHint() {
  const now = Date.now();
  if (el.zoomhint.classList.contains('is-on')) { clearTimeout(wheelHintTimer); wheelHintTimer = setTimeout(() => el.zoomhint.classList.remove('is-on'), 1400); return; }
  if (wheelHints >= 3 || now - wheelHintAt < 6000) return;
  wheelHints++; wheelHintAt = now;
  el.zoomhint.classList.add('is-on');
  wheelHintTimer = setTimeout(() => el.zoomhint.classList.remove('is-on'), 1800);
}

/** On tall, narrow screens the fitted camera distance is larger than the viewer's default zoom-out limit
 *  (OrbitControls would clamp it and crop the board), so widen the limit to whatever the current frame needs. */
function relaxZoomLimit() {
  const c = viewer && viewer.controls;
  if (!c || !viewer.radius || typeof viewer._fitDistance !== 'function') return;
  const need = viewer._fitDistance(viewer.radius) * 1.35;
  if (Number.isFinite(need) && c.maxDistance < need) c.maxDistance = need;
}

let frameKey = '';
/** Tell the viewer how much room the overlays take so the board is fitted into the free area. */
function applyFrame() {
  el.stage.style.setProperty('--dock-h', `${el.dock.offsetHeight}px`);
  if (!viewer || typeof viewer.setFrame !== 'function') return;
  const W = el.view.clientWidth, H = el.view.clientHeight;
  const box = el.view.getBoundingClientRect();
  const headerH = el.top ? el.top.offsetHeight : 56;
  if (state.assembling) return;                          // the assembly frames the scene around its own panel and restores ours on stop
  let f;
  {
    const bottom = Math.max(0, Math.round(H - (el.dock.getBoundingClientRect().top - box.top) + 8));
    if (mqNarrow.matches) f = { top: Math.round(el.head.getBoundingClientRect().bottom - box.top + 8), right: Math.round(W * 0.05), bottom, left: Math.round(W * 0.05) };   // small boards overhang their nominal outline (USB, pins)
    else f = { top: headerH + 8, right: 16, bottom, left: Math.round(Math.min(el.info.getBoundingClientRect().right - box.left + 12, W * 0.42)) };
  }
  const key = JSON.stringify(f);
  if (key === frameKey) return;
  frameKey = key;
  if (viewer.frame) { Object.assign(viewer.frame, f); relaxZoomLimit(); }   // limit first, so the fit below is not clamped
  viewer.setFrame(f);
  if (state.part && boardReady() && !state.quiz && !state.assembling) viewer.focus(state.part, false);
}

function loadBoard(def) {
  if (!viewer) return;
  setLoading(true);
  enqueue(async () => {
    if (def !== state.def) return;                     // another board was chosen while this one waited in the queue
    try {
      await viewer.show(def);
    } catch (err) {
      console.error(`[${SITE}] failed to build board "${def.id}"`, err);
      if (def === state.def) { state.ready = null; buildMarkers(); sceneError(`Couldn’t build the 3D model of ${def.name || def.id}. The lesson below still works — or pick another board.`); }
      if (!state.booted) { state.booted = true; buildThumbs(); }   // the other boards still need their thumbnails
      return;
    }
    state.ready = def;
    if (def !== state.def) return;                     // the next queued task will show the right one
    sceneError(null); setLoading(false);
    onBoardReady(def);
  });
}

function onBoardReady(def) {
  if (viewer.viewName && viewer.viewName !== state.view) {
    if (!VIEW_NAMES.includes(state.view)) state.view = 'iso';
    viewer.setView(state.view, false);
  }
  frameKey = '';                                         // a new board resets the viewer's zoom limits — fit it again
  applyFrame();
  buildMarkers();
  if (state.part) viewer.focus(state.part, state.booted && motion());
  syncUI();
  if (!state.booted) {
    state.booted = true;
    bootParams();
    buildThumbs();
  }
}

async function buildThumbs() {
  if (!viewer || typeof viewer.thumbnail !== 'function') { for (const d of BOARDS) { thumbs.set(d.id, false); paintThumb(d.id, false); } return; }
  // active board first, then the rest in order — one at a time, with pauses, so the page never freezes
  const order = [state.def, ...BOARDS.filter((d) => d !== state.def)].filter(Boolean);
  for (const def of order) {
    if (thumbs.has(def.id)) continue;
    await wait(120);
    let url = false;
    try { url = (await enqueue(() => viewer.thumbnail(def, { w: 360, h: 248, view: 'iso' }))) || false; }
    catch (err) { console.warn(`[${SITE}] thumbnail for "${def.id}" failed`, err); }
    thumbs.set(def.id, url); paintThumb(def.id, url);
    relaxZoomLimit();                                    // rendering a thumbnail re-fits the viewer's limits to the shown board
  }
}

function initViewer() {
  try {
    viewer = new Viewer(el.viewer);
  } catch (err) {
    console.error(`[${SITE}] 3D failed to start`, err);
    viewer = null;
    sceneError('Couldn’t start 3D — WebGL seems to be disabled in this browser. The lesson and the comparison table below work without the model.');
    el.toolbar.hidden = true;
    for (const d of BOARDS) { thumbs.set(d.id, false); paintThumb(d.id, false); }
    return;
  }
  viewer.on('loading', (on) => setLoading(on));
  viewer.on('hover', onHover);
  viewer.on('frame', updateMarkers);
  viewer.on('select', (e) => {
    if (!boardReady() || state.assembling) return;
    if (state.quiz) { if (e && e.id) quizAnswer(e.id); return; }
    if (e && e.id && state.def.parts && state.def.parts[e.id]) selectPart(e.id);
    else if (!e) closePart();
  });

  // manual orbiting clears the pressed view button
  let down = null;
  el.viewer.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  el.viewer.addEventListener('pointermove', (e) => {
    if (!down) return;
    if (e.pointerType === 'mouse' && !e.buttons) { down = null; return; }
    if (state.view && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) { state.view = null; syncUI(); }
  });
  window.addEventListener('pointerup', () => { down = null; });
  // The stage fills the whole first screen, so a plain wheel scrolls the page,
  // and zooming takes a trackpad pinch or the wheel with Ctrl/⌘ held (like on maps).
  el.viewer.addEventListener('wheel', (e) => {
    hideTip();
    if (e.ctrlKey || e.metaKey) return;
    e.stopPropagation();
    wheelHint();
  }, { capture: true, passive: true });

  if ('ResizeObserver' in window) new ResizeObserver(() => { applyFrame(); updateMarkers(); }).observe(el.view);
  else window.addEventListener('resize', () => { applyFrame(); updateMarkers(); });
}

// ───────────────────────── switching boards ─────────────────────────
function showBoard(index, { hash = true, scroll = false } = {}) {
  if (!BOARDS.length) return;
  index = ((index % BOARDS.length) + BOARDS.length) % BOARDS.length;
  if (index === state.index) { if (scroll) scrollToStage(); return; }
  stopAssembly();
  if (state.quiz) exitQuiz();
  state.part = null;
  state.index = index;
  const def = state.def = BOARDS[index];
  if (state.booted) state.view = 'iso';

  applyAccent(def);
  renderHead(def);
  renderLesson(def);
  renderPartCard(); renderLegend(); renderQuizInfo();
  markers = []; el.markers.innerHTML = '';
  hideTip();
  updateRail(); updateCompare(); syncUI();
  if (hash) setHash(def.id);
  loadBoard(def);
  if (scroll) scrollToStage();
}
const stepBoard = (dir) => showBoard(state.index + dir);

function setHash(id) {
  const h = '#' + encodeURIComponent(id);
  if (location.hash === h) return;
  try { history.replaceState(null, '', h); } catch { location.hash = h; }
}
const indexFromHash = () => { let id = location.hash.slice(1); try { id = decodeURIComponent(id); } catch { /* keep as is */ } return BOARDS.findIndex((b) => b.id === id); };

/** URL parameters applied once the first board is on the bench: ?view=top, ?part=<id>, ?quiz=1, ?assemble=1
 *  (?board=<id>, ?labels=1, ?rotate=0 and ?go=<section> are read at start-up). */
function bootParams() {
  const view = params.get('view');
  if (view && VIEW_NAMES.includes(view)) { state.view = view; viewer.setView(view, false); }
  const part = params.get('part');
  if (flag('assemble')) startAssembly();
  else if (flag('quiz')) startQuiz({ scroll: false });
  else if (part && state.def.parts && state.def.parts[part]) { selectPart(part); viewer.focus(part, false); }
  syncUI();
}

// ───────────────────────── events ─────────────────────────
function onClick(e) {
  const t = e.target instanceof Element ? e.target : null; if (!t) return;
  if (t.closest('#lab-root')) return;                    // the lab handles its own clicks

  const scrollLink = t.closest('a[data-scroll]');
  if (scrollLink) {
    const target = document.getElementById((scrollLink.getAttribute('href') || '').slice(1));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: mqReduce.matches ? 'auto' : 'smooth', block: 'start' }); }
    return;
  }

  const viewBtn = t.closest('[data-view]');
  if (viewBtn && viewer) {
    if (state.assembling) return;
    if (state.part) closePart({ refocus: false });
    state.view = viewBtn.dataset.view;
    track({ k: 'view', b: boardId(), l: state.view });
    if (boardReady()) viewer.setView(state.view, motion());
    syncUI();
    return;
  }

  const act = t.closest('[data-action]');
  if (act) {
    if (act.disabled) return;
    switch (act.dataset.action) {
      case 'toggle-rotate': state.rotate = !state.rotate; syncUI(); track({ k: 'view', b: boardId(), l: 'rotate' }); break;
      case 'toggle-labels': state.labels = !state.labels; syncUI(); track({ k: 'view', b: boardId(), l: 'labels' }); if (!state.labels && act.closest('#legend')) el.btnLabels.focus({ preventScroll: true }); break;
      case 'quiz-toggle': if (state.quiz) exitQuiz(); else startQuiz({ scroll: false }); break;
      case 'quiz-start': startQuiz({ scroll: true }); break;
      case 'quiz-restart': startQuiz({ scroll: false }); break;
      case 'quiz-exit': exitQuiz(); el.btnQuiz.focus({ preventScroll: true }); break;
      case 'quiz-to-lesson': exitQuiz(); $('#lesson').scrollIntoView({ behavior: mqReduce.matches ? 'auto' : 'smooth', block: 'start' }); break;
      case 'quiz-hint': quizHint(); break;
      case 'quiz-skip': quizSkip(); break;
      case 'quiz-next': nextQuestion(); break;
      case 'part-prev': stepPart(-1); break;
      case 'part-next': stepPart(1); break;
      case 'part-close': closePart(); break;
      case 'copy-code': copyCode(act); break;
      case 'open-lab': openInLab(); break;
      case 'asm-toggle': if (state.assembling) stopAssembly(); else startAssembly(); break;
      case 'asm-start': startAssembly({ scroll: true }); break;
    }
    return;
  }

  const partBtn = t.closest('[data-part]');
  if (partBtn) {
    const from = partBtn.dataset.from;
    if (from !== 'lesson' && state.part === partBtn.dataset.part) { closePart(); return; }
    selectPart(partBtn.dataset.part, { scroll: from === 'lesson', focusCard: from === 'lesson' });
    return;
  }

  const boardBtn = t.closest('[data-board]');
  if (boardBtn) {
    const i = BOARDS.findIndex((b) => b.id === boardBtn.dataset.board);
    if (i >= 0) showBoard(i, { scroll: boardBtn.dataset.from === 'compare' });
  }
}

function onKey(e) {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const t = e.target instanceof Element ? e.target : null;
  if (t && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], pre, .table-wrap, #lab-root')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (BOARDS.length < 2 || state.assembling) return;
    // arrows flip boards only while the stage is the section on screen (or holds the focus) — the lab may use them too
    const inStage = t && t.closest('#sec-stage');
    if (!inStage && currentSection && currentSection !== 'sec-stage') return;
    const inRail = t && t.closest('#rail');
    e.preventDefault();
    stepBoard(e.key === 'ArrowRight' ? 1 : -1);
    if (inRail) { const card = $('.rcard[aria-current="true"]', el.railList); if (card) card.focus({ preventScroll: true }); }
  } else if (e.key === 'Escape') {
    if (state.assembling) return;                        // the assembly handles its own keys
    if (state.quiz) exitQuiz(); else if (state.part) closePart();
  }
}

function initLegendHover() {
  const over = (e) => {
    const b = e.target instanceof Element ? e.target.closest('.legend__item, .marker__btn') : null;
    if (!b || state.part || state.quiz) return;
    hotPart(b.dataset.part, true);
    if (boardReady()) viewer.highlight(b.dataset.part);
  };
  const out = (e) => {
    const b = e.target instanceof Element ? e.target.closest('.legend__item, .marker__btn') : null;
    if (!b || state.part || state.quiz) return;
    hotPart(null);
    if (boardReady()) viewer.highlight(null);
  };
  for (const host of [el.legend, el.markers]) {
    host.addEventListener('pointerover', over); host.addEventListener('pointerout', out);
    host.addEventListener('focusin', over); host.addEventListener('focusout', out);
  }
}

let currentSection = '';          // id of the section crossing the middle of the viewport (set by the scroll spy)
function initSpy() {
  const links = $$('[data-spy]');
  if (!('IntersectionObserver' in window) || !links.length) return;
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      currentSection = en.target.id;
      for (const a of links) a.classList.toggle('is-active', a.dataset.spy === en.target.id);
    }
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
  for (const a of links) { const s = document.getElementById(a.dataset.spy); if (s) io.observe(s); }
}

// ───────────────────────── toast ─────────────────────────
let toastTimer = 0;
function toast(msg, ms = 2800) {
  if (!el.toast) return;
  el.toast.textContent = msg;
  el.toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-on'), ms);
}

// ───────────────────────── assembly mode (js/core/assembly.js, loaded on demand) ─────────────────────────
let asm = null, asmModule = null, asmBusy = false;
let asmRun = null;                 // { b, soldered, done } while an assembly run is on

/** The assembly draws its own panel inside the viewer, so everything of ours steps aside while it runs. */
function setAssembling(on) {
  on = !!on;
  if (state.assembling === on) return;
  state.assembling = on;
  if (!on && asmRun) { if (!asmRun.done) track({ k: 'asm', b: asmRun.b, l: 'exit', i: asmRun.soldered }); asmRun = null; }
  hideTip(); hotPart(null);
  syncUI();
  if (!on) applyFrame();                                 // only acts if the layout changed meanwhile (the assembly restores our frame itself)
}

async function startAssembly({ scroll = false } = {}) {
  const def = state.def;
  if (scroll) scrollToStage();
  if (!def || !boardReady() || state.assembling || asmBusy) return;
  asmBusy = true;
  try {
    if (!asmModule) {
      try { asmModule = await import('./core/assembly.js'); }
      catch (err) {
        console.info(`[${SITE}] assembly module is not available yet`, err && err.message ? err.message : err);
        toast('Assembly mode is coming soon.');
        return;
      }
    }
    if (def !== state.def || !boardReady()) return;      // the board changed while the module was loading
    if (!asm) {
      asm = new asmModule.Assembly(viewer);
      asm.on('start', () => setAssembling(true));
      asm.on('stop', () => setAssembling(false));
      asm.on('progress', (e) => { if (asmRun && e) asmRun.soldered = Number(e.soldered) || 0; });
      asm.on('done', (e) => {
        const id = state.def && state.def.id, sec = Number(e && e.seconds);
        if (asmRun && !asmRun.done) { asmRun.done = true; track({ k: 'asm', b: asmRun.b, l: 'done', i: Math.round(sec) || 0 }); }
        if (id && sec > 0 && !(bestTime[id] > 0 && bestTime[id] <= sec)) { bestTime[id] = Math.round(sec); writeStore('boards.asm.best', bestTime); }
        renderQuizInfo();
      });
    }
    if (state.quiz) exitQuiz();
    if (state.part) closePart({ refocus: false });
    if (!VIEW_NAMES.includes(state.view)) state.view = 'iso';
    setAssembling(true);                                 // clear the stage first, then let the assembly take it over
    await asm.start(def);
    if (!asm.active) setAssembling(false);
    else { asmRun = { b: def.id, soldered: 0, done: false }; track({ k: 'asm', b: def.id, l: 'start' }); }
  } catch (err) {
    console.error(`[${SITE}] assembly failed to start`, err);
    try { if (asm && asm.active) asm.stop(); } catch { /* ignore */ }
    setAssembling(false);
    toast('Assembly mode could not start for this board.');
  } finally {
    asmBusy = false;
  }
}

function stopAssembly() {
  if (asm && asm.active) { try { asm.stop(); } catch (err) { console.error(`[${SITE}] assembly failed to stop`, err); } }
  if (state.assembling) setAssembling(false);            // in case the module did not emit 'stop'
}

// ───────────────────────── header over the hero ─────────────────────────
function initHeader() {
  if (!el.top || !el.stage) return;
  const update = () => el.top.classList.toggle('is-solid', window.scrollY > el.stage.offsetHeight - el.top.offsetHeight - 6);
  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
}

// ───────────────────────── lab (3D workbench, a separate module) ─────────────────────────
let labState = 'loading';          // 'loading' → 'ready' (initLab has been called) | 'missing' (module failed to load)
let labQueued = null;
const sendToLab = (id) => window.dispatchEvent(new CustomEvent('lab:add-board', { detail: { id } }));

/** "Open on the workbench": scroll to the workbench and ask the lab module to place the active board on it. */
function openInLab() {
  track({ k: 'lab', l: 'open' });
  const id = state.def && state.def.id;
  stopAssembly();
  if (el.lab) el.lab.scrollIntoView({ behavior: mqReduce.matches ? 'auto' : 'smooth', block: 'start' });
  if (!id) return;
  if (labState === 'loading') labQueued = id;            // module still loading — deliver as soon as it is mounted
  else sendToLab(id);
}

/** Mounts js/lab/lab.js into #lab-root. The module may not exist yet — the rest of the site must not care. */
function initLab() {
  const root = el.labRoot;
  if (!root) return;
  import('./lab/lab.js')
    .then((m) => { const mounted = m.initLab(root, { boards: BOARDS }); labState = 'ready'; return mounted; })
    .then(() => {
      if (el.labNote) el.labNote.hidden = true;
      if (labQueued) { const id = labQueued; labQueued = null; sendToLab(id); }
    })
    .catch((err) => {                                    // lab not ready
      if (labState === 'loading') labState = 'missing';
      labQueued = null;
      console.info(`[${SITE}] lab module is not available yet`, err && err.message ? err.message : err);
      if (el.labNote && !root.childElementCount) el.labNote.hidden = false;
    });
}

// ───────────────────────── start-up ─────────────────────────
function init() {
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  initSpy();
  initHeader();

  if (!BOARDS.length) {
    setLoading(false);
    el.toolbar.hidden = true; el.rail.hidden = true;
    sceneError('No boards loaded yet. Refresh the page in a moment.');
    el.lesson.innerHTML = '<p class="muted">Lessons will appear together with the boards.</p>';
    el.quizStart.disabled = true;
    initLab();
    return;
  }

  renderRail();
  renderCompare();
  initViewer();
  initLegendHover();

  let start = indexFromHash();
  if (start < 0) start = BOARDS.findIndex((b) => b.id === params.get('board'));
  showBoard(start < 0 ? 0 : start);
  updateRail('auto');
  const go = params.get('go');                           // debug: ?go=lab|lesson|quiz|compare — jump straight to a section
  if (go) { const sec = document.getElementById('sec-' + go) || document.getElementById(go); if (sec) sec.scrollIntoView({ behavior: 'auto', block: 'start' }); }

  window.addEventListener('hashchange', () => { const i = indexFromHash(); if (i >= 0 && i !== state.index) showBoard(i, { hash: false }); });
  const onReduce = () => { if (mqReduce.matches && state.rotate) { state.rotate = false; syncUI(); } };
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', onReduce);
  const onNarrow = () => { applyFrame(); };
  if (mqNarrow.addEventListener) mqNarrow.addEventListener('change', onNarrow);

  initLab();
}

init();
