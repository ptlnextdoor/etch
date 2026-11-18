// Lofi background music, synthesised in the browser (Web Audio, no audio files): Dm9 – G13 – Cmaj9 – Am9 at 74 bpm,
// Rhodes-style chords, soft kick / snare / hats, bass, a sparse melody and vinyl crackle.
// Usage: import { toggleLofi, setLofi, isLofiOn } from './lofi.js'  ·  listens/dispatches window 'lofi:change' { on }.
// On pages with the site header it mounts its own "Lofi" button there.

const A = { ctx: null, on: false, timer: null, nextT: 0, step: 0, out: null, mus: null, noise: null, crackle: null, crk: null };
const KEY = 'rl.lofi';
const LOFI = { bpm: 74, chords: [[50, 53, 57, 60, 64], [43, 53, 59, 64], [48, 52, 55, 59, 62], [45, 55, 60, 64, 67]], bass: [38, 31, 36, 33], mel: [69, 72, 74, 76, 79, 81, 74, 72] };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function actx() {
  if (!A.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    const c = A.ctx = new AC();
    A.out = c.createDynamicsCompressor(); A.out.connect(c.destination);
    A.mus = c.createGain(); A.mus.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.3;
    A.mus.connect(lp); lp.connect(A.out);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    A.noise = buf;
    const cb = c.createBuffer(1, c.sampleRate * 3, c.sampleRate), cd = cb.getChannelData(0);
    for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.9 : 0) + (Math.random() * 2 - 1) * 0.012;
    A.crackle = cb;
  }
  if (A.ctx.state === 'suspended') A.ctx.resume();
  return A.ctx;
}
function env(g, t, a, peak, d, sus, rel, end) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.setTargetAtTime(sus, t + a, d); g.gain.setTargetAtTime(0, end, rel); }
function tone(freq, t, dur, type = 'sine', vol = 0.2, a = 0.005, rel = 0.08) {
  const c = A.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); o.connect(g); g.connect(A.mus);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.setTargetAtTime(0, t + dur, rel);
  o.start(t); o.stop(t + dur + rel * 6);
}
function noise(t, dur, type, freq, q, vol, a = 0.002, rel = 0.05) {
  const c = A.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
  s.buffer = A.noise; s.loop = true; fl.type = type; fl.frequency.value = freq; fl.Q.value = q;
  s.connect(fl); fl.connect(g); g.connect(A.mus);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.setTargetAtTime(0, t + dur, rel);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + rel * 6);
}
function rhodes(t, m, dur, vol) {
  const c = A.ctx, f0 = mtof(m), g = c.createGain(); g.connect(A.mus);
  for (const [mul, v, type] of [[1, 1, 'sine'], [2, 0.18, 'sine'], [3.01, 0.05, 'triangle']]) {
    const o = c.createOscillator(), og = c.createGain(); o.type = type; o.frequency.value = f0 * mul; o.detune.value = (Math.random() - 0.5) * 9;
    o.connect(og); og.gain.value = v; og.connect(g); o.start(t); o.stop(t + dur + 2.5);
  }
  env(g, t, 0.012, vol, 0.7, vol * 0.35, 0.45, t + dur);
}
function scheduleStep(t, k) {
  const c = A.ctx, beat = 60 / LOFI.bpm, bar = Math.floor(k / 16) % 4, s16 = k % 16, tt = t + ((s16 % 2) ? beat * 0.09 : 0);
  if (s16 === 0) LOFI.chords[bar].forEach((m, i) => rhodes(t + i * 0.018, m, beat * 3.6, 0.055));
  if (s16 === 10 && bar % 2 === 1) LOFI.chords[bar].slice(1).forEach((m, i) => rhodes(t + i * 0.02, m + 12 * (i > 2), beat * 1.2, 0.03));
  if (s16 === 0 || s16 === 7 || s16 === 10) tone(mtof(LOFI.bass[bar] + (s16 === 7 ? 7 : 0)), tt, beat * (s16 ? 0.6 : 1.4), 'sine', 0.16, 0.01, 0.12);
  if (s16 === 0 || s16 === 9 || (s16 === 11 && bar === 3)) {   // kick
    const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(A.mus);
    o.frequency.setValueAtTime(110, tt); o.frequency.exponentialRampToValueAtTime(42, tt + 0.18);
    g.gain.setValueAtTime(0.42, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.42); o.start(tt); o.stop(tt + 0.45);
  }
  if (s16 === 4 || s16 === 12) { noise(tt + 0.012, 0.06, 'bandpass', 1700, 0.8, 0.13, 0.002, 0.06); tone(185, tt + 0.012, 0.04, 'triangle', 0.05, 0.002, 0.04); }   // snare
  if (s16 % 2 === 0) noise(tt, 0.015, 'highpass', 7200, 0.5, s16 % 4 ? 0.028 : 0.04, 0.001, 0.02);                                                                  // hats
  if ((s16 === 6 || s16 === 14 || s16 === 3) && Math.random() < 0.42) {                                                                                                // melody
    const m = LOFI.mel[Math.floor(Math.random() * LOFI.mel.length)] - (bar === 1 ? 2 : 0);
    tone(mtof(m), tt, beat * 0.55, 'sine', 0.045, 0.02, 0.3); tone(mtof(m + 12), tt, beat * 0.3, 'sine', 0.008, 0.02, 0.2);
  }
}

export const isLofiOn = () => A.on;
export function setLofi(on, { remember = true, silent = false } = {}) {
  const c = actx(); if (!c) return false;
  A.on = !!on;
  A.mus.gain.cancelScheduledValues(c.currentTime); A.mus.gain.setTargetAtTime(on ? 0.8 : 0, c.currentTime, on ? 0.6 : 0.25);
  if (on && !A.timer) {
    A.nextT = c.currentTime + 0.1; A.step = 0;
    const cr = c.createBufferSource(), cg = c.createGain(), hf = c.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 3200; hf.Q.value = 0.4;
    cr.buffer = A.crackle; cr.loop = true; cr.connect(hf); hf.connect(cg); cg.gain.value = 0.5; cg.connect(A.mus); cr.start(); A.crk = cr;
    A.timer = setInterval(() => { const dt = 60 / LOFI.bpm / 4; while (A.nextT < A.ctx.currentTime + 0.2) { scheduleStep(A.nextT, A.step++); A.nextT += dt; } }, 40);
  }
  if (!on && A.timer) { const tm = A.timer, cr = A.crk; A.timer = null; A.crk = null; clearInterval(tm); setTimeout(() => { try { cr.stop(); } catch {} }, 1200); }
  if (remember) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {} }
  try { window.dispatchEvent(new CustomEvent('lofi:change', { detail: { on: A.on } })); } catch {}
  if (!silent) { try { window.dispatchEvent(new CustomEvent('site:track', { detail: { k: 'lofi', on: A.on } })); } catch {} }
  return A.on;
}
export const toggleLofi = () => setLofi(!A.on);

// keep quiet in a hidden tab
document.addEventListener('visibilitychange', () => {
  if (!A.ctx || !A.on) return;
  if (document.hidden) A.ctx.suspend(); else { A.ctx.resume(); A.nextT = Math.max(A.nextT, A.ctx.currentTime + 0.1); }
});

// header button (only on pages that have the site header)
function mount() {
  const nav = document.querySelector('header.top .nav'); if (!nav || nav.querySelector('.lofi-btn')) return;
  const st = document.createElement('style');
  st.textContent = `
.lofi-btn{display:inline-flex;align-items:center;gap:7px;font:inherit;font-size:13.5px;color:inherit;cursor:pointer;padding:6px 12px;border-radius:999px;border:1px solid rgba(29,27,22,.2);background:rgba(251,248,241,.72);backdrop-filter:blur(8px);transition:background .16s,border-color .16s,color .16s}
.lofi-btn:hover{border-color:rgba(29,27,22,.5)}
.lofi-btn[aria-pressed=true]{background:#1d1b16;color:#fbf8f1;border-color:#1d1b16}
.lofi-eq{display:inline-flex;align-items:flex-end;gap:2px;height:11px}
.lofi-eq i{display:block;width:2.5px;height:3px;border-radius:1px;background:currentColor;opacity:.55}
.lofi-btn[aria-pressed=true] .lofi-eq i{opacity:1;animation:lofi-eq .9s ease-in-out infinite}
.lofi-btn[aria-pressed=true] .lofi-eq i:nth-child(2){animation-delay:-.3s}.lofi-btn[aria-pressed=true] .lofi-eq i:nth-child(3){animation-delay:-.6s}
@keyframes lofi-eq{0%,100%{height:3px}50%{height:11px}}
@media (prefers-reduced-motion:reduce){.lofi-btn .lofi-eq i{animation:none!important}}
@media (max-width:560px){.lofi-btn span.lofi-t{display:none}.lofi-btn{padding:6px 9px}}`;
  document.head.appendChild(st);
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'lofi-btn'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', 'Lofi music'); b.title = 'Lofi music on / off';
  b.innerHTML = '<span class="lofi-t">Lofi</span><span class="lofi-eq" aria-hidden="true"><i></i><i></i><i></i></span>';
  b.addEventListener('click', () => toggleLofi());
  nav.appendChild(b);
  window.addEventListener('lofi:change', (e) => b.setAttribute('aria-pressed', String(!!e.detail.on)));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

// if the visitor left it on last time, start again on their first click or key press (browsers block autoplay)
try {
  if (localStorage.getItem(KEY) === '1') {
    const start = () => { window.removeEventListener('pointerdown', start, true); window.removeEventListener('keydown', start, true); if (!A.on) setLofi(true, { silent: true }); };
    window.addEventListener('pointerdown', start, true); window.addEventListener('keydown', start, true);
  }
} catch {}
