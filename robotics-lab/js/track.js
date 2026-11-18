// Anonymous usage tracker for Robotics Lab. No imports, no cookies, no personal data.
//
// What leaves the browser: a random visitor id (localStorage `bd.v`), a random per-tab session id,
// the referring page (without its query string), browser language, viewport width, time spent with
// the tab visible, and a list of small events such as { k: 'part', b: 'uno', p: 'mcu', t: 5300 }.
// Batches go to POST /api/track every ~15 s, when 40 events are waiting, and when the tab is hidden
// or closed.
//
// Other modules report what happens either way:
//   window.dispatchEvent(new CustomEvent('site:track', { detail: { k: 'part', b: 'uno', p: 'mcu' } }))
//   import { track } from './track.js';  track({ k: 'run', l: 'blink' })
// detail = { k, b?, l?, p?, i?, ok?, on? }; the kinds the server keeps are listed in api/track.js.
//
// Recorded here without any help: the board on screen (URL hash / ?board=, default 'uno', and every
// later change of the hash) and `section` events the first time #lab, #lesson, #quiz and #compare
// (or #sec-lesson, #sec-quiz, #sec-compare) scroll into view.
//
// Off on localhost / 127.0.0.1 / file: and in the owner's browser (the dashboard sets `bd.owner`),
// unless localStorage['bd.debug'] === '1'. Nothing in this file is allowed to throw.

const ENDPOINT = '/api/track';
const BOARDS = ['uno', 'nano', 'mega', 'esp32', 'nodemcu', 'pico', 'bluepill', 'rpi4'];
const SECTIONS = ['lab', 'lesson', 'quiz', 'compare'];
const FLUSH_MS = 15000;      // regular flush
const FLUSH_AT = 40;         // flush as soon as this many events wait
const MAX_EVENTS = 3000;     // per page load, so a runaway loop can't flood the API
const SESSION_GAP = 30 * 60 * 1000;   // a tab idle for longer starts a new visit

let impl = null;
let flushImpl = null;

/** Queue one event. Safe to call anywhere, any time; does nothing when tracking is off. */
export function track(detail) { try { if (impl) impl(detail); } catch { /* analytics never breaks the page */ } }
/** Send whatever is queued right now. */
export function flush() { try { if (flushImpl) flushImpl(); } catch { /* same */ } }

try { start(); } catch { impl = null; flushImpl = null; }

function start() {
  const W = typeof window !== 'undefined' ? window : null;
  const D = typeof document !== 'undefined' ? document : null;
  if (!W || !D || !W.location) return;
  const loc = W.location;
  const nav = W.navigator || (typeof navigator !== 'undefined' ? navigator : {});

  const store = (name) => { try { return W[name] || null; } catch { return null; } };
  const LS = store('localStorage'), SS = store('sessionStorage');
  const get = (st, k) => { try { return st ? st.getItem(k) : null; } catch { return null; } };
  const set = (st, k, v) => { try { if (st) st.setItem(k, v); } catch { /* private mode */ } };

  const debug = get(LS, 'bd.debug') === '1';
  const local = loc.protocol === 'file:' || !/^https?:$/.test(loc.protocol || '') || /^(localhost|.*\.localhost|127\.0\.0\.1|\[::1\])?$/.test(loc.hostname || '');
  const owner = get(LS, 'bd.owner') === '1';
  if (!debug && (local || owner)) return;          // off: no listeners, no timers, no network

  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const now = () => Date.now();

  // visitor: random, lives in localStorage. session: random, one per tab (survives reloads).
  let vid = get(LS, 'bd.v');
  if (!vid) { vid = rid(); set(LS, 'bd.v', vid); }
  let sid = rid(), t0 = now(), first = true, baseDur = 0;
  try {
    const old = JSON.parse(get(SS, 'bd.s') || 'null');
    if (old && typeof old.s === 'string' && now() - (+old.at || 0) < SESSION_GAP) {
      sid = old.s; t0 = +old.t0 || t0; first = !old.n; baseDur = +old.dur || 0;
    }
  } catch { /* start a new session */ }

  // time on site = time with the tab visible
  const visible = () => D.visibilityState !== 'hidden';
  let since = visible() ? now() : 0;
  const dur = () => Math.round(baseDur + (since ? now() - since : 0));
  const save = () => set(SS, 'bd.s', JSON.stringify({ s: sid, t0, n: first ? 0 : 1, dur: dur(), at: now() }));

  let ref = '';
  try { if (D.referrer) { const u = new URL(D.referrer); ref = (u.origin + u.pathname).slice(0, 200); } } catch { ref = ''; }

  const q = [];
  let total = 0, sentDur = 0;

  const send = (body) => {
    let ok = false;
    try { ok = !!(nav.sendBeacon && nav.sendBeacon(ENDPOINT, body)); } catch { ok = false; }
    if (ok) return;
    try {
      const f = W.fetch || (typeof fetch === 'function' ? fetch : null);
      if (!f) return;
      const p = f(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain;charset=UTF-8' } });
      if (p && p.catch) p.catch(() => {});
    } catch { /* offline */ }
  };

  const doFlush = () => {
    if (!q.length) return;
    const d = dur();
    const body = JSON.stringify({
      v: vid, s: sid, t0, first, ref, lang: String(nav.language || '').slice(0, 12),
      w: Math.round(+W.innerWidth || 0), dur: d, ev: q.splice(0, 400),
    });
    first = false; sentDur = d; save();
    if (debug) { try { console.debug('[track] flush', JSON.parse(body)); } catch { /* no console */ } }
    send(body);
  };
  flushImpl = doFlush;

  const text = (v, n) => String(v).slice(0, n);
  let lastBoard = null, booted = false;

  const push = (d) => {
    if (!d || typeof d !== 'object' || typeof d.k !== 'string' || !d.k) return;
    if (total >= MAX_EVENTS) return;
    const e = { k: text(d.k, 16), t: Math.max(0, now() - t0) };
    if (d.b != null && d.b !== '') e.b = text(d.b, 16);
    if (d.l != null && d.l !== '') e.l = text(d.l, 40);
    if (d.p != null && d.p !== '') e.p = text(d.p, 24);
    if (d.i != null && Number.isFinite(+d.i)) e.i = Math.round(+d.i * 100) / 100;
    if (d.ok != null) e.ok = !!d.ok;
    if (d.on != null) e.on = !!d.on;
    if (e.k === 'board') {
      if (!e.b || e.b === lastBoard) return;      // same board again is not a switch
      lastBoard = e.b;
    }
    total++; q.push(e);
    if (debug) { try { console.debug('[track]', e); } catch { /* no console */ } }
    if (q.length >= FLUSH_AT) doFlush();
  };

  // ---- the board on screen -------------------------------------------------------------------
  const known = (id) => (BOARDS.indexOf(id) >= 0 ? id : null);
  const hashBoard = () => { let h = String(loc.hash || '').replace(/^#/, ''); try { h = decodeURIComponent(h); } catch { /* keep */ } return known(h); };
  const queryBoard = () => { try { return known(new URLSearchParams(loc.search || '').get('board') || ''); } catch { return null; } };
  // The first board is recorded a moment after load, so the app has had time to settle the URL.
  const boot = () => {
    if (booted) return;
    booted = true;
    if (lastBoard == null) push({ k: 'board', b: hashBoard() || queryBoard() || 'uno' });
  };
  const watchBoard = () => { if (!booted) return; const b = hashBoard(); if (b && b !== lastBoard) push({ k: 'board', b }); };

  impl = (d) => {
    if (d && d.k === 'board') booted = true; else { boot(); watchBoard(); }
    push(d);
  };

  const on = (target, type, fn) => { try { target.addEventListener(type, (ev) => { try { fn(ev); } catch { /* never throw */ } }); } catch { /* no events here */ } };
  const timer = (fn, ms, repeat) => { try { return (repeat ? setInterval : setTimeout)(() => { try { fn(); } catch { /* never throw */ } }, ms); } catch { return 0; } };

  on(W, 'site:track', (ev) => impl(ev && ev.detail));
  on(W, 'hashchange', () => { boot(); watchBoard(); });
  on(W, 'popstate', () => { boot(); watchBoard(); });
  timer(boot, 1500, false);
  timer(watchBoard, 1000, true);     // the app may change the hash with history.replaceState, which fires no event

  // ---- page sections ---------------------------------------------------------------------------
  const watchSections = () => {
    const IO = W.IntersectionObserver || (typeof IntersectionObserver !== 'undefined' ? IntersectionObserver : null);
    if (!IO || !D.getElementById) return;
    const names = new Map();
    const io = new IO((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting || !names.has(en.target)) continue;
        impl({ k: 'section', l: names.get(en.target) });
        names.delete(en.target);
        try { io.unobserve(en.target); } catch { /* fine */ }
      }
    }, { rootMargin: '0px 0px -25% 0px', threshold: 0 });
    for (const name of SECTIONS) {
      const el = D.getElementById(name) || D.getElementById('sec-' + name);
      if (el) { names.set(el, name); io.observe(el); }
    }
  };
  if (D.readyState === 'loading') on(D, 'DOMContentLoaded', watchSections); else watchSections();

  // ---- sending -----------------------------------------------------------------------------------
  const leave = () => {
    boot();
    // nothing new to report, but the visit got longer: a ping keeps the recorded duration honest
    if (!q.length && !first && dur() - sentDur >= 10000) push({ k: 'ping' });
    doFlush();
    save();
  };
  on(D, 'visibilitychange', () => {
    if (visible()) { if (!since) since = now(); return; }
    leave();
    if (since) { baseDur += now() - since; since = 0; }
  });
  on(W, 'pagehide', leave);
  timer(doFlush, FLUSH_MS, true);
  save();
}
