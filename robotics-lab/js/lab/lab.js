// The Lab: a 3D workbench where boards and modules are placed, wired pin-to-pin and run.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { studioEnv } from '../core/viewer.js';
import { glowSprite } from '../core/builder.js';

const MODULE_IDS = ['led', 'rgb', 'button', 'pot', 'buzzer', 'servo', 'motor', 'motor-driver', 'battery', 'ultrasonic', 'oled', 'dht11', 'ldr', 'level-shifter'];
const BOARD_LAB = {
  uno: { plug: 'socket', logic: 5, glow: '#ffb020' }, mega: { plug: 'socket', logic: 5, glow: '#ffb020' },
  rpi4: { plug: 'post', logic: 3.3, glow: '#30e060' },
  nano: { plug: 'bread', logic: 5, glow: '#ffb020' }, esp32: { plug: 'bread', logic: 3.3, glow: '#3b8cff' },
  nodemcu: { plug: 'bread', logic: 3.3, glow: '#3b8cff' }, pico: { plug: 'bread', logic: 3.3, glow: '#30e060', strips: true },
  bluepill: { plug: 'bread', logic: 3.3, glow: '#30e060' },
};
const LED_PART_IDS = ['led_l', 'led_d2', 'led_pc13', 'led_user', 'led', 'led_act', 'leds', 'led_builtin'];
const WIRE = { red: '#d3302b', black: '#1c1c1e', yellow: '#f1c21b', green: '#2e9e4f', blue: '#1f6fd6', orange: '#ee7a1c', white: '#ecebe6', purple: '#8a48b8' };
const SIGNAL_COLORS = ['yellow', 'green', 'blue', 'orange', 'white', 'purple'];
const PITCH = 2.54, BB_H = 8.5;
const emit = (detail) => { try { window.dispatchEvent(new CustomEvent('site:track', { detail })); } catch {} };   // anonymous usage events (js/track.js listens)
const THUMBS = new Map();   // type → data URL (shared by every Lab instance on the page)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = (s) => String(s).toUpperCase().replace(/3\.3 ?V?|3V3/g, '3V3').replace(/[\s~_.→←]/g, '');
const tokens = (s) => String(s).toUpperCase().replace(/3\.3 ?V?|3V3/g, '3V3').split(/[^A-Z0-9+\-]+/).filter(Boolean);
function nameMatches(pinName, want, kind) {
  const a = norm(pinName), b = norm(want);
  if (a === b || a === 'D' + b || a === 'GP' + b || a === 'GPIO' + b || a === 'P' + b) return true;
  if (b === 'GND' && kind === 'gnd' && (a === 'G' || a === 'AGND' || a === '-')) return true;
  const alias = { VIN: ['VIN'], '5V': ['5V', 'VBUS', 'VIN5V'], RST: ['RST', 'RESET', 'R'], TX: ['TX', 'TXD', 'TX0', 'TX1'], RX: ['RX', 'RXD', 'RX0', 'RX0'] };
  if (alias[b] && alias[b].includes(a)) return true;
  return tokens(pinName).includes(b);
}
function pinVolts(pin) {
  const n = norm(pin.name);
  if (pin.kind === 'gnd') return 0;
  if (/^(5V|VBUS|VIN|VSYS|USB|VCC5)/.test(n)) return 5;
  if (/3V3/.test(n)) return 3.3;
  if (n === '+') return 6;
  return null;
}

/** Bench mat texture (light anti-static mat with a 10 mm grid). */
function matTexture(w, h) {
  const s = 5, c = document.createElement('canvas'); c.width = w * s; c.height = h * s; const g = c.getContext('2d');
  g.fillStyle = '#5f7482'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '10,20,30'},${Math.random() * 0.05})`; g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2); }
  for (let x = 0; x <= w; x += 10) { g.fillStyle = x % 50 === 0 ? 'rgba(235,242,246,0.42)' : 'rgba(235,242,246,0.17)'; g.fillRect(x * s - 0.5, 0, x % 50 === 0 ? 1.6 : 1, c.height); }
  for (let y = 0; y <= h; y += 10) { g.fillStyle = y % 50 === 0 ? 'rgba(235,242,246,0.42)' : 'rgba(235,242,246,0.17)'; g.fillRect(0, y * s - 0.5, c.width, y % 50 === 0 ? 1.6 : 1); }
  g.fillStyle = 'rgba(235,242,246,0.6)'; g.font = `600 ${s * 3.2}px ui-monospace, Consolas, monospace`;
  for (let x = 50; x < w; x += 50) g.fillText(String(x / 10), x * s + 3, c.height - 6);
  g.font = `600 ${s * 4.2}px ui-monospace, Consolas, monospace`; g.fillText('ESD-SAFE WORK MAT · 1 SQUARE = 10 MM', 14, 5 * s);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

/** Procedural solderless breadboard sized to carry a pins-down board. Returns { group, yLo, yHi } in board coords. */
function makeBreadboard(built, strips) {
  const groups = new Map();
  for (const p of built.pins) { const k = Math.round(p.y * 10); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  const rows = [...groups.values()].sort((a, b) => b.length - a.length).slice(0, 2).sort((a, b) => a[0].y - b[0].y);
  if (rows.length < 2) return null;
  const yLo = rows[0][0].y, yHi = rows[1][0].y, xs = rows.flat().map(p => p.x), xMin = Math.min(...xs), xMax = Math.max(...xs);
  const out = 4, len = Math.max(xMax - xMin + PITCH * 3, built.w + 5), wid = (yHi - yLo) + 2 * (out * PITCH) + 5;
  const cx = (xMin + xMax) / 2, cy = (yLo + yHi) / 2;
  const s = 14, c = document.createElement('canvas'); c.width = Math.ceil(len * s); c.height = Math.ceil(wid * s); const g = c.getContext('2d');
  g.fillStyle = '#f0eee6'; g.fillRect(0, 0, c.width, c.height);
  const X = (x) => (x - (cx - len / 2)) * s, Y = (y) => c.height - (y - (cy - wid / 2)) * s;
  const mid = (yLo + yHi) / 2; g.fillStyle = '#d9d6cb'; g.fillRect(0, Y(mid) - 1.6 * s, c.width, 3.2 * s);
  g.fillStyle = '#c9c6ba'; g.fillRect(0, Y(mid) - 1.6 * s, c.width, 0.3 * s); g.fillRect(0, Y(mid) + 1.3 * s, c.width, 0.3 * s);
  const x0 = xMin - Math.floor((xMin - (cx - len / 2) - 2) / PITCH) * PITCH;
  const ys = []; for (let y = yLo - out * PITCH; y <= yHi + out * PITCH + 0.01; y += PITCH) if (Math.abs(y - mid) > 2.2) ys.push(y);
  for (let x = x0; x < cx + len / 2 - 1.5; x += PITCH) for (const y of ys) {
    g.fillStyle = '#bdb9ab'; g.fillRect(X(x) - 0.72 * s, Y(y) - 0.72 * s, 1.44 * s, 1.44 * s);
    g.fillStyle = '#34322c'; g.fillRect(X(x) - 0.5 * s, Y(y) - 0.5 * s, 1.0 * s, 1.0 * s);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(len, BB_H, wid, 2, 0.7), new THREE.MeshStandardMaterial({ color: 0xeeece4, roughness: 0.55 }));
  body.position.y = BB_H / 2; body.castShadow = body.receiveShadow = true;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(len - 1.2, wid - 1.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  top.rotation.x = -Math.PI / 2; top.position.y = BB_H + 0.02; top.receiveShadow = true;
  grp.add(body, top);
  if (strips) for (const y of [yLo, yHi]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(xMax - xMin + PITCH, 2.5, 2.5), new THREE.MeshStandardMaterial({ color: 0x101112, roughness: 0.45 }));
    m.position.set(0, BB_H + 1.25, -(y - cy)); m.castShadow = true; grp.add(m);
  }
  grp.position.set(cx - built.w / 2, 0, -(cy - built.h / 2));
  return { group: grp, yLo, yHi, dispose() { body.geometry.dispose(); body.material.dispose(); top.geometry.dispose(); top.material.dispose(); tex.dispose(); } };
}

class Lab {
  constructor(root, { boards = [] } = {}) {
    this.root = root; this.boardDefs = Object.fromEntries(boards.map(b => [b.id, b]));
    this.moduleDefs = {}; this.missions = []; this.items = []; this.wires = []; this.uid = 1;
    this.mode = 'free'; this.mission = null; this.running = false; this.drive = new Map(); this.serial = []; this.tab = 'steps'; this.sound = true;
    this._dom(); this._three();
    this._boot();
  }

  // ───────────────────────── DOM ─────────────────────────
  _dom() {
    if (!document.getElementById('lab-css')) { const l = document.createElement('link'); l.id = 'lab-css'; l.rel = 'stylesheet'; l.href = new URL('../../css/lab.css', import.meta.url).href; document.head.appendChild(l); }
    this.root.innerHTML = `
<div class="lab">
  <div class="lab-bar">
    <div class="lab-bar-l"><button class="lab-btn" data-lab="missions">Missions</button><span class="lab-title"></span></div>
    <div class="lab-bar-r">
      <button class="lab-btn lab-primary" data-lab="run">Run</button>
      <button class="lab-btn" data-lab="auto">Wire it for me</button>
      <button class="lab-btn" data-lab="unwire">Remove wires</button>
      <button class="lab-btn" data-lab="view">Top view</button>
      <button class="lab-btn" data-lab="sound" aria-pressed="true">Sound on</button>
      <button class="lab-btn" data-lab="lofi" aria-pressed="false">Lofi</button>
      <button class="lab-btn lab-full" data-lab="full" aria-pressed="false"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Full screen</span></button>
    </div>
  </div>
  <div class="lab-main">
    <aside class="lab-palette" aria-label="Parts"></aside>
    <div class="lab-stage">
      <div class="lab-canvas"></div>
      <div class="lab-hint"></div>
      <div class="lab-tip" hidden></div>
      <div class="lab-seltools" hidden></div>
      <div class="lab-controls" hidden></div>
      <div class="lab-loading">Setting up the bench…</div>
      <div class="lab-overlay" hidden></div>
    </div>
    <aside class="lab-side"></aside>
  </div>
</div>`;
    const q = (s) => this.root.querySelector(s);
    this.el = { title: q('.lab-title'), palette: q('.lab-palette'), stage: q('.lab-stage'), canvas: q('.lab-canvas'), hint: q('.lab-hint'), tip: q('.lab-tip'),
      sel: q('.lab-seltools'), controls: q('.lab-controls'), loading: q('.lab-loading'), overlay: q('.lab-overlay'), side: q('.lab-side'), run: q('[data-lab="run"]'), view: q('[data-lab="view"]'), sound: q('[data-lab="sound"]'), auto: q('[data-lab="auto"]') };
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lab]'); if (!b || !this.root.contains(b)) return;
      const a = b.dataset.lab, v = b.dataset.v;
      if (a === 'missions') this._showMissions();
      else if (a === 'run') this.running ? this.stop() : this.run();
      else if (a === 'auto') this.autoWire(true);
      else if (a === 'unwire') { this.stop(); [...this.wires].forEach(w => this.removeWire(w, true)); this._changed(); }
      else if (a === 'view') { this.topView = !this.topView; this.el.view.textContent = this.topView ? '3D view' : 'Top view'; this._frameAll(true); }
      else if (a === 'sound') { this.sound = !this.sound; b.textContent = this.sound ? 'Sound on' : 'Sound off'; b.setAttribute('aria-pressed', this.sound); if (!this.sound) this._silence(); }
      else if (a === 'full') this._toggleFull();
      else if (a === 'lofi') import('../lofi.js').then(m => m.toggleLofi()).catch(() => {});
      else if (a === 'add') this.addItem(v, {}, true);
      else if (a === 'mission') { this._hideOverlay(); this.loadMission(this.missions.find(m => m.id === v)); }
      else if (a === 'free') { this._hideOverlay(); this.freeBuild(); }
      else if (a === 'close-overlay') this._hideOverlay();
      else if (a === 'tab') { this.tab = v; this._renderSide(); }
      else if (a === 'step') this.autoWire(false);
      else if (a === 'next') { const i = this.missions.indexOf(this.mission); this.loadMission(this.missions[(i + 1) % this.missions.length]); }
      else if (a === 'rotate') this._rotateSel();
      else if (a === 'delete') this._deleteSel();
      else if (a === 'color') { if (this.selWire) { this.selWire.color = v; this._buildWire(this.selWire); this._selTools(); this.dirty = true; } }
      else if (a === 'drive') this._setDrive(v);
      else if (a === 'clear') { this.stop(); this.clearBench(); this._changed(); }
    });
    this.root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.ctl) { const it = this.items.find(i => i.id === Number(t.dataset.ctl)); if (it) { it.state[t.dataset.key] = Number(t.value); const o = t.parentElement.querySelector('output'); if (o) o.textContent = this._fmt(Number(t.value), t.dataset.unit); this._applyState(it); } }
      if (t.dataset.duty) { const d = this.drive.get(t.dataset.duty); if (d) { d.duty = Number(t.value); this.dirty = true; } }
    });
    window.addEventListener('lofi:change', (e) => { const lb = this.root.querySelector('[data-lab="lofi"]'); if (lb) { lb.setAttribute('aria-pressed', String(!!e.detail.on)); lb.classList.toggle('is-on', !!e.detail.on); } });
    const press = (e, down) => { const b = e.target.closest('[data-press]'); if (!b) return; const it = this.items.find(i => i.id === Number(b.dataset.press)); if (it) { it.state.pressed = down; b.classList.toggle('is-down', down); this._applyState(it); } };
    this.root.addEventListener('pointerdown', (e) => press(e, true));
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) this.root.addEventListener(ev, (e) => press(e, false), true);
  }
  /** Full-screen workbench: real Fullscreen API when allowed, otherwise a fixed full-window overlay. */
  _toggleFull(force) {
    const el = this.root, on = force ?? !el.classList.contains('lab-max');
    el.classList.toggle('lab-max', on); document.documentElement.classList.toggle('lab-noscroll', on);
    if (on) { try { const p = el.requestFullscreen?.(); p?.then(() => { this.fsApi = true; }).catch(() => {}); } catch {} this.focused = true; }
    else if (document.fullscreenElement === el) { try { document.exitFullscreen(); } catch {} }
    if (on) emit({ k: 'lab', l: 'full' });
    const b = this.root.querySelector('[data-lab="full"]'); if (b) { b.setAttribute('aria-pressed', on); b.querySelector('span').textContent = on ? 'Exit full screen' : 'Full screen'; }
    if (!this.fsBound) { this.fsBound = true; document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && this.fsApi) { this.fsApi = false; this._toggleFull(false); } }); }
    this._resize(); this._frameAll(false); requestAnimationFrame(() => { this._resize(); this._frameAll(false); });
  }
  _fmt(v, unit) { return (Math.abs(v) < 2 && unit === '' ? v.toFixed(2) : Math.round(v)) + (unit ? ' ' + unit : ''); }

  // ───────────────────────── three ─────────────────────────
  _three() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); r.setClearColor(0, 0);
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 0.95;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    Object.assign(r.domElement.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none', outline: 'none' });
    this.el.canvas.appendChild(r.domElement);
    const sc = this.scene = new THREE.Scene(); sc.environment = studioEnv(r); sc.environmentIntensity = 0.5;
    this.camera = new THREE.PerspectiveCamera(30, 1, 5, 6000);
    const key = this.key = new THREE.DirectionalLight(0xfff1dc, 2.9); key.castShadow = true;
    const ms = Math.min(4096, r.capabilities.maxTextureSize); key.shadow.mapSize.set(ms, ms); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.12;
    key.position.set(-330, 560, -300); const c = key.shadow.camera; c.left = -330; c.right = 330; c.top = 260; c.bottom = -260; c.near = 100; c.far = 1600; c.updateProjectionMatrix();
    sc.add(key, key.target);
    const fill = new THREE.DirectionalLight(0xdfe9ff, 0.45); fill.position.set(400, 300, 500); sc.add(fill, new THREE.HemisphereLight(0xfff6e6, 0xcdbfa6, 0.12));
    // bench
    const MW = this.matW = 460, MH = this.matH = 290;
    const mat = new THREE.Mesh(new RoundedBoxGeometry(MW, 2, MH, 2, 0.9), [0, 1, 2, 3, 4, 5].map(i => new THREE.MeshStandardMaterial(i === 2 ? { map: matTexture(MW, MH), roughness: 0.92 } : { color: 0x4c5e6a, roughness: 0.9 })));
    mat.position.y = -1; mat.receiveShadow = true; mat.castShadow = true; sc.add(mat); this.mat = mat;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.ShadowMaterial({ opacity: 0.26, color: 0x2a1d0c }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -2; ground.receiveShadow = true; sc.add(ground);
    this.itemLayer = new THREE.Group(); this.wireLayer = new THREE.Group(); this.fxLayer = new THREE.Group(); sc.add(this.itemLayer, this.wireLayer, this.fxLayer);
    // shared wire-end geometry
    this.geoHousing = new RoundedBoxGeometry(2.5, 14, 2.5, 2, 0.35); this.geoHousing.translate(0, 7, 0);
    this.geoFerrule = new THREE.CylinderGeometry(0.55, 0.55, 4, 12); this.geoFerrule.translate(0, 2, 0);
    this.matHousing = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.42 });
    this.matFerrule = new THREE.MeshStandardMaterial({ color: 0xd4d6d6, roughness: 0.3, metalness: 1 });
    this.wireMats = {};
    // markers
    this.ring = this._sprite(this._ringTex('#ff6a2b'), 7); this.ring.visible = false; this.fxLayer.add(this.ring);
    this.fromRing = this._sprite(this._ringTex('#1f6fd6'), 7); this.fromRing.visible = false; this.fxLayer.add(this.fromRing);
    this.targets = [0, 1].map(() => { const g = new THREE.Group(); const rg = this._sprite(this._ringTex('#ff6a2b'), 9); const lb = this._sprite(null, 1); lb.center.set(0.5, 0); g.add(rg, lb); g.userData = { rg, lb }; g.visible = false; this.fxLayer.add(g); return g; });
    this.selBox = new THREE.Box3Helper(new THREE.Box3(), 0xff6a2b); this.selBox.visible = false; this.fxLayer.add(this.selBox);
    this.rubber = new THREE.Group(); this.fxLayer.add(this.rubber);

    const dom = r.domElement;
    dom.addEventListener('pointerdown', (e) => this._down(e));
    dom.addEventListener('pointermove', (e) => this._move(e));
    dom.addEventListener('pointerup', (e) => this._up(e));
    dom.addEventListener('pointerleave', () => { this._tip(null); this.ring.visible = false; this.dirty = true; });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('wheel', (e) => { if (!(e.ctrlKey || e.metaKey || this.focused)) e.stopImmediatePropagation(); }, true);
    this.root.addEventListener('pointerdown', () => { this.focused = true; });
    document.addEventListener('pointerdown', (e) => { if (!this.root.contains(e.target)) this.focused = false; });
    window.addEventListener('keydown', (e) => {
      if (!this.focused || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
      if (e.key === 'Escape') { if (!this.from && !this.selItem && !this.selWire && this.el.overlay.hidden && this.root.classList.contains('lab-max') && !document.fullscreenElement) this._toggleFull(false); this._hideOverlay(); this._cancelWire(); this._select(null); }
      else if (e.key === 'f' || e.key === 'F') this._toggleFull();
      else if (e.key === 'Delete' || e.key === 'Backspace') { this._deleteSel(); e.preventDefault(); }
      else if (e.key === 'r' || e.key === 'R') this._rotateSel();
    });
    const ct = this.controls = new OrbitControls(this.camera, dom);
    ct.enableDamping = true; ct.dampingFactor = 0.1; ct.minPolarAngle = 0.02; ct.maxPolarAngle = 1.42; ct.minDistance = 60; ct.maxDistance = 1500; ct.screenSpacePanning = false;
    ct.addEventListener('change', () => { this.dirty = true; });
    this.ray = new THREE.Raycaster(); this.ptr = new THREE.Vector2();
    new ResizeObserver(() => this._resize()).observe(this.el.canvas); this._resize();
    this.camera.position.set(0, 330, 400); ct.target.set(0, 0, 10); ct.update();
    this.clock = performance.now();
    const loop = (now) => { requestAnimationFrame(loop); this._frame(now); }; requestAnimationFrame(loop);
  }
  _ringTex(color) {
    const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d');
    g.strokeStyle = color; g.lineWidth = 9; g.beginPath(); g.arc(48, 48, 34, 0, 7); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.beginPath(); g.arc(48, 48, 41, 0, 7); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  _labelTex(text) {
    this.labelCache ||= {}; if (this.labelCache[text]) return this.labelCache[text];
    const c = document.createElement('canvas'), g = c.getContext('2d'); g.font = '600 44px ui-monospace, Consolas, monospace';
    const w = Math.ceil(g.measureText(text).width) + 44; c.width = w; c.height = 84;
    g.font = '600 44px ui-monospace, Consolas, monospace'; g.fillStyle = '#ff6a2b'; g.beginPath(); g.roundRect(2, 2, w - 4, 64, 18); g.fill();
    g.beginPath(); g.moveTo(w / 2 - 12, 64); g.lineTo(w / 2, 82); g.lineTo(w / 2 + 12, 64); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, 36);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData = { aspect: w / 84 };
    return (this.labelCache[text] = t);
  }
  _sprite(tex, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
    s.scale.set(size, size, 1); s.renderOrder = 20; s.raycast = () => {}; return s;
  }
  _resize() {
    const w = Math.max(2, this.el.canvas.clientWidth), h = Math.max(2, this.el.canvas.clientHeight);
    this.W = w; this.H = h; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.dirty = true;
    if (this.itemLayer) this.renderer.render(this.scene, this.camera);   // no blank frame after a resize
  }

  // ───────────────────────── boot ─────────────────────────
  async _boot() {
    const mods = await Promise.allSettled(MODULE_IDS.map(id => import(`./modules/${id}.js`)));
    mods.forEach((m, i) => { if (m.status === 'fulfilled' && m.value.default) this.moduleDefs[MODULE_IDS[i]] = m.value.default; });
    try { this.missions = (await import('./missions.js')).MISSIONS || []; } catch { this.missions = []; }
    this.missions = this.missions.filter(m => m.parts.every(p => this._def(p.type)));
    this._renderPalette();
    this.el.loading.hidden = true;
    const q = new URLSearchParams(location.search), want = q.get('mission');
    const m = this.missions.find(x => x.id === want) || (want === 'free' ? null : this.missions[0]);
    if (m) this.loadMission(m); else this.freeBuild();
    if (q.get('add')) { for (const t of q.get('add').split(',')) this.addItem(t, {}); this._changed(); this._frameAll(false); }
    if (q.get('wire')) { for (const w of q.get('wire').split(',')) { const [a, b] = w.split('-'); const [ra, na] = this._split(a), [rb, nb] = this._split(b); this.addWire(this._findPins(ra, na)[0], this._findPins(rb, nb)[0]); } this._changed(); }
    if (q.get('top')) { this.topView = true; this._frameAll(false); }
    if (q.get('auto')) this.autoWire(true);
    if (q.get('run')) this.run();
    if (q.get('full')) this._toggleFull(true);
    if (q.get('bare')) { this.root.querySelector('.lab').classList.add('lab-bare'); requestAnimationFrame(() => { this._resize(); this._frameAll(false); }); }
    this._makeThumbs();
    window.addEventListener('lab:add-board', (e) => { if (e.detail?.id && this.boardDefs[e.detail.id]) { if (this.mode !== 'free') this.freeBuild(); this.addItem('board:' + e.detail.id, {}, true); } });
    this.ready = true;
  }
  _def(type) { const [k, id] = type.split(':'); return k === 'board' ? this.boardDefs[id] : this.moduleDefs[id]; }

  // ───────────────────────── palette thumbnails (real 3D renders) ─────────────────────────
  async _makeThumbs() {
    const list = [...Object.keys(this.boardDefs).map(id => 'board:' + id), ...Object.keys(this.moduleDefs).map(id => 'mod:' + id)];
    for (const type of list) {
      if (!THUMBS.has(type)) {
        await new Promise(r => (window.requestIdleCallback ? requestIdleCallback(r, { timeout: 400 }) : setTimeout(r, 60)));
        if (this.dragging || this.from || this.downAt) { await new Promise(r => setTimeout(r, 500)); }
        try { THUMBS.set(type, this._thumb(this._def(type))); } catch (e) { console.warn('lab: thumbnail failed', type, e); THUMBS.set(type, ''); }
      }
      this._paintThumb(type);
    }
  }
  _paintThumb(type) {
    const url = THUMBS.get(type), el = this.el.palette.querySelector(`[data-v="${type}"] i`);
    if (url && el) { el.style.backgroundImage = `url(${url})`; el.classList.add('has-img'); }
  }
  _thumb(def) {
    const W = 220, H = 160, built = def.build({ quality: 0.5 });
    try { def.apply?.(built, { ...(def.defaults || {}) }); } catch {}
    const g = built.group, bb = new THREE.Box3().setFromObject(g); g.position.y -= bb.min.y; bb.setFromObject(g);
    const hide = [this.itemLayer, this.wireLayer, this.fxLayer, this.mat].map(o => [o, o.visible]); hide.forEach(([o]) => (o.visible = false));
    this.scene.add(g);
    const cam = this.camera, save = { pos: cam.position.clone(), quat: cam.quaternion.clone(), aspect: cam.aspect, pr: this.renderer.getPixelRatio() };
    const c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3()), R = 0.5 * Math.hypot(s.x, s.z, s.y * 0.7);
    cam.aspect = W / H; cam.updateProjectionMatrix();
    const d = R / Math.sin(Math.atan(Math.tan(cam.fov * Math.PI / 360) * Math.min(1, W / H))) * 1.04;
    cam.position.copy(c).addScaledVector(new THREE.Vector3(-0.5, 0.66, 0.74).normalize(), d); cam.lookAt(c);
    this.renderer.setPixelRatio(1); this.renderer.setSize(W, H, false);
    this.renderer.render(this.scene, cam);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.scene.remove(g); try { built.dispose(); } catch {}
    hide.forEach(([o, v]) => (o.visible = v));
    cam.position.copy(save.pos); cam.quaternion.copy(save.quat); cam.aspect = save.aspect; cam.updateProjectionMatrix();
    this.renderer.setPixelRatio(save.pr); this.renderer.setSize(this.W, this.H, false);
    this.renderer.render(this.scene, cam); this.dirty = true;
    return url;
  }

  // ───────────────────────── items ─────────────────────────
  addItem(type, { ref, x, y, rot = 0, opts } = {}, user = false) {
    const def = this._def(type); if (!def) return null;
    const [kind, id] = type.split(':');
    let built; try { built = def.build({ quality: 1, ...(opts || {}) }); } catch (e) { console.error('lab: build failed', type, e); return null; }
    const lab = kind === 'board' ? (BOARD_LAB[id] || { plug: 'socket', logic: 5 }) : { plug: def.plug || 'post', logic: null };
    const holder = new THREE.Group(), g = built.group;
    const bb = new THREE.Box3().setFromObject(g);
    let topY = -bb.min.y, carrier = null;
    if (lab.plug === 'bread') { carrier = makeBreadboard(built, lab.strips); if (carrier) { holder.add(carrier.group); topY = BB_H + 2.54 + built.t; } }
    g.position.y = topY; holder.add(g);
    const item = { id: this.uid++, ref: ref || this._autoRef(id), type, kind, defId: id, def, built, holder, lab, carrier, topY, rot, x: 0, y: 0,
      state: { ...(def.defaults || {}) }, pins: [], name: def.name };
    const rowsY = carrier ? [carrier.yLo, carrier.yHi] : [];
    built.pins.forEach((p, i) => {
      let style = kind === 'board' ? lab.plug : (def.pinPlug?.[p.name] || def.plug || 'post');
      const pin = { item, i, key: item.id + ':' + i, name: p.name, fn: p.fn, kind: p.kind, lx: p.x - built.w / 2, lz: -(p.y - built.h / 2), by: p.y };
      if (style === 'bread') { const r = rowsY.findIndex(y => Math.abs(y - p.y) < 0.2); if (r < 0 || !carrier) style = 'post'; else pin.out = r === 0 ? -1 : 1; }
      pin.style = style;
      pin.baseY = style === 'socket' ? topY + 8.5 : style === 'post' ? topY + 2.6 : style === 'bread' ? BB_H : null;
      item.pins.push(pin);
    });
    holder.userData.item = item; this.itemLayer.add(holder);
    if (x == null) { const p = this._freeSpot(item); x = p.x; y = p.y; }
    this._place(item, x, y, rot);
    for (const pin of item.pins) if (pin.baseY == null) pin.baseY = this._surfaceY(item, pin);
    if (def.apply) try { def.apply(built, item.state); } catch (e) { console.warn(e); }
    this.items.push(item);
    if (user) { emit({ k: 'add', l: type }); this._select(item); this._changed(); this._frameAll(true); }
    return item;
  }
  _autoRef(id) { let n = 1, r = id; while (this.items.some(i => i.ref === r)) r = id + (++n); return r; }
  _size(item) { const bx = new THREE.Box3().setFromObject(item.holder); return bx; }
  _freeSpot(item) {
    const sz = new THREE.Box3().setFromObject(item.holder).getSize(new THREE.Vector3()), hw = sz.x / 2 + 8, hd = sz.z / 2 + 8;
    const boxes = this.items.map(i => new THREE.Box3().setFromObject(i.holder));
    for (let ring = 0; ring < 12; ring++) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = dx * ring * 34, y = dy * ring * 28;
      if (Math.abs(x) + hw > this.matW / 2 || Math.abs(y) + hd > this.matH / 2) continue;
      if (!boxes.some(b => b.max.x > x - hw && b.min.x < x + hw && -b.min.z > y - hd && -b.max.z < y + hd)) return { x, y };
    }
    return { x: 0, y: 0 };
  }
  _place(item, x, y, rot = item.rot) {
    const lim = (v, m) => Math.max(-m, Math.min(m, v));
    item.x = lim(x, this.matW / 2 - 12); item.y = lim(y, this.matH / 2 - 12); item.rot = rot;
    item.holder.position.set(item.x, 0, -item.y); item.holder.rotation.y = rot * Math.PI / 180; item.holder.updateMatrixWorld(true);
    for (const w of this.wires) if (w.a.item === item || w.b.item === item) this._buildWire(w);
    this.dirty = true;
  }
  _surfaceY(item, pin) {
    const o = new THREE.Vector3(pin.lx, 200, pin.lz).applyMatrix4(item.holder.matrixWorld);
    this.ray.set(o, new THREE.Vector3(0, -1, 0)); const h = this.ray.intersectObject(item.holder, true)[0];
    return h ? h.point.y : item.topY + 1;
  }
  removeItem(item) {
    [...this.wires].filter(w => w.a.item === item || w.b.item === item).forEach(w => this.removeWire(w, true));
    this.itemLayer.remove(item.holder); try { item.built.dispose(); item.carrier?.dispose(); } catch {}
    this.items.splice(this.items.indexOf(item), 1);
    if (this.selItem === item) this._select(null);
  }
  clearBench() { this._cancelWire(); [...this.items].forEach(i => this.removeItem(i)); this.drive.clear(); this.serial = []; }

  // ───────────────────────── wires ─────────────────────────
  _wireMat(color) { return (this.wireMats[color] ||= new THREE.MeshStandardMaterial({ color: new THREE.Color(WIRE[color] || color), roughness: 0.38 })); }
  /** Plug point and direction (world) for the k-th wire on a pin. */
  _plug(pin, k = 0) {
    const it = pin.item, m = it.holder.matrixWorld;
    if (pin.style === 'bread') {
      const p = new THREE.Vector3(pin.lx, pin.baseY + 0.2, pin.lz - pin.out * PITCH * (1 + Math.min(k, 2))).applyMatrix4(m);
      return { p, dir: new THREE.Vector3(0, 1, 0), len: 14 };
    }
    const p = new THREE.Vector3(pin.lx, pin.baseY, pin.lz).applyMatrix4(m), dir = new THREE.Vector3(0, 1, 0);
    if (k > 0) {
      const out = new THREE.Vector3(pin.lx, 0, pin.lz).normalize().transformDirection(m);
      const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), out);
      const a = 0.42 * Math.ceil(k / 2), d = k % 2 ? out : side;
      dir.set(0, Math.cos(a), 0).addScaledVector(d, Math.sin(a)).normalize();
    }
    return { p, dir, len: pin.style === 'pad' ? 4 : 14 };
  }
  addWire(a, b, color) {
    if (!a || !b || a === b || this.wires.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a))) return null;
    const count = (pin) => { const used = this.wires.filter(w => w.a === pin || w.b === pin).map(w => (w.a === pin ? w.ka : w.kb)); let k = 0; while (used.includes(k)) k++; return k; };
    if (!color) color = (a.kind === 'gnd' || b.kind === 'gnd') ? 'black' : (pinVolts(a) > 0 || pinVolts(b) > 0 || /^(VCC|HV|LV|12V)$/.test(norm(a.name)) && a.kind === 'pwr' || b.kind === 'pwr' && /^(VCC|HV|LV|12V|5V)$/.test(norm(b.name))) ? 'red' : SIGNAL_COLORS[this.wires.length % SIGNAL_COLORS.length];
    const w = { a, b, color, ka: count(a), kb: count(b), group: new THREE.Group() };
    w.group.userData.wire = w; this.wireLayer.add(w.group); this.wires.push(w); this._buildWire(w);
    return w;
  }
  _buildWire(w) {
    const g = w.group; for (const c of [...g.children]) { g.remove(c); if (c.userData.own) c.geometry.dispose(); }
    const A = this._plug(w.a, w.ka), B = this._plug(w.b, w.kb), up = new THREE.Vector3(0, 1, 0), ends = [];
    for (const [E, pin] of [[A, w.a], [B, w.b]]) {
      const m = new THREE.Mesh(pin.style === 'pad' ? this.geoFerrule : this.geoHousing, pin.style === 'pad' ? this.matFerrule : this.matHousing);
      m.position.copy(E.p); m.quaternion.setFromUnitVectors(up, E.dir); m.castShadow = true; g.add(m);
      ends.push(E.p.clone().addScaledVector(E.dir, E.len - 0.4));
    }
    const d = ends[0].distanceTo(ends[1]), L = Math.max(14, Math.min(60, d * 0.42));
    const c1 = ends[0].clone().addScaledVector(A.dir, L), c2 = ends[1].clone().addScaledVector(B.dir, L);
    const curve = new THREE.CubicBezierCurve3(ends[0], c1, c2, ends[1]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, Math.round(d / 4)), 0.7, 8, false), this._wireMat(w.color));
    tube.castShadow = true; tube.userData.own = true; g.add(tube);
    this.dirty = true;
  }
  removeWire(w, silent) {
    for (const c of w.group.children) if (c.userData.own) c.geometry.dispose();
    this.wireLayer.remove(w.group); this.wires.splice(this.wires.indexOf(w), 1);
    if (this.selWire === w) this._select(null);
    if (!silent) this._changed();
  }

  // ───────────────────────── nets & checks ─────────────────────────
  _nets() {
    const par = new Map(), find = (k) => { while (par.get(k) !== k) { par.set(k, par.get(par.get(k))); k = par.get(k); } return k; }, uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par.set(a, b); };
    for (const it of this.items) {
      const byName = {};
      for (const p of it.pins) { par.set(p.key, p.key); const k = p.kind === 'gnd' ? 'GND' : p.kind === 'pwr' ? 'P:' + norm(p.name) : null; if (k) { if (byName[k]) uni(byName[k], p.key); else byName[k] = p.key; } }
    }
    for (const w of this.wires) uni(w.a.key, w.b.key);
    this.netOf = (pin) => find(pin.key);
    const nets = new Map(); for (const it of this.items) for (const p of it.pins) { const n = find(p.key); if (!nets.has(n)) nets.set(n, []); nets.get(n).push(p); }
    this.nets = nets;
  }
  _findPins(ref, name) {
    const it = this.items.find(i => i.ref === ref); if (!it) return [];
    const exact = it.pins.filter(p => norm(p.name) === norm(name));   // prefer the pin that is literally called that
    return exact.length ? exact : it.pins.filter(p => nameMatches(p.name, name, p.kind));
  }
  _wireDone(spec) {
    const [ra, na] = this._split(spec.a), [rb, nb] = this._split(spec.b);
    const A = this._findPins(ra, na), B = this._findPins(rb, nb);
    return A.some(a => B.some(b => this.netOf(a) === this.netOf(b) && this._linked(a, b)));
  }
  _split(s) { const i = s.indexOf('.'); return [s.slice(0, i), s.slice(i + 1)]; }
  /** True when a and b are joined through at least one real wire (not only an internal rail). */
  _linked(a, b) { return a.item !== b.item ? true : this.wires.some(w => this.netOf(w.a) === this.netOf(a)); }
  _erc() {
    const out = [], label = (p) => `${p.item.name} ${p.name}`;
    const src = (p) => (p.item.kind === 'board' && (p.kind === 'pwr' || p.kind === 'gnd')) || (p.item.defId === 'battery');
    for (const pins of this.nets.values()) {
      if (pins.length < 2 || !this.wires.some(w => this.netOf(w.a) === this.netOf(pins[0]))) continue;
      const sources = pins.filter(src), volts = [...new Set(sources.map(pinVolts).filter(v => v != null))];
      if (volts.includes(0) && volts.some(v => v > 0)) { const hot = sources.find(p => pinVolts(p) > 0), g = sources.find(p => pinVolts(p) === 0); out.push({ sev: 'err', msg: `Short circuit: ${label(hot)} is wired straight to ${label(g)}.` }); continue; }
      const pos = volts.filter(v => v > 0);
      if (pos.length > 1) out.push({ sev: 'err', msg: `Two different supplies are joined (${pos.join(' V and ')} V): ${sources.filter(p => pinVolts(p) > 0).map(label).join(' + ')}.` });
      const gpio33 = pins.filter(p => p.item.kind === 'board' && p.item.lab.logic === 3.3 && !['pwr', 'gnd', 'nc'].includes(p.kind));
      if (gpio33.length) {
        if (pos.some(v => v >= 5)) out.push({ sev: 'err', msg: `${label(gpio33[0])} is a 3.3 V pin but this wire carries ${Math.max(...pos)} V. That can destroy the pin.` });
        const g5 = pins.find(p => p.item.kind === 'board' && p.item.lab.logic === 5 && !['pwr', 'gnd', 'nc'].includes(p.kind) && !/^RX/.test(norm(p.name).replace(/^D?\d+/, '')) && !/RX/.test(norm(p.name)));
        if (g5) out.push({ sev: 'warn', msg: `${label(g5)} outputs 5 V into ${label(gpio33[0])} (3.3 V logic). Put a level shifter in between.` });
      }
      const tx = pins.filter(p => /(^|[^A-Z])TXD?\d?$|^TXD?\d?/.test(norm(p.name)) && p.item.kind === 'board'), rx = pins.filter(p => /^RXD?\d?|RXD?\d?$/.test(norm(p.name)) && p.item.kind === 'board');
      if (tx.length > 1 && new Set(tx.map(p => p.item)).size > 1) out.push({ sev: 'warn', msg: `Two TX pins are tied together (${tx.map(label).join(' and ')}). TX must go to the other board's RX.` });
      if (rx.length > 1 && !tx.length && new Set(rx.map(p => p.item)).size > 1) out.push({ sev: 'warn', msg: `Two RX pins are tied together (${rx.map(label).join(' and ')}). Nobody is talking on this wire.` });
    }
    const boards = this.items.filter(i => i.kind === 'board');
    for (let i = 0; i < boards.length; i++) for (let j = i + 1; j < boards.length; j++) {
      const A = boards[i], B = boards[j];
      const sig = this.wires.some(w => { const ps = this.nets.get(this.netOf(w.a)); return ps.some(p => p.item === A && p.kind !== 'gnd') && ps.some(p => p.item === B && p.kind !== 'gnd'); });
      const ga = A.pins.find(p => p.kind === 'gnd'), gb = B.pins.find(p => p.kind === 'gnd');
      if (sig && ga && gb && this.netOf(ga) !== this.netOf(gb)) out.push({ sev: 'warn', msg: `${A.name} and ${B.name} share a signal but not a ground. Connect GND to GND so they agree on what 0 V is.` });
    }
    this.erc = out;
  }
  _changed() {
    this._nets(); this._erc();
    if (this.mission) { this.done = this.mission.wires.map(w => this._wireDone(w)); if (this.running && !this.done.every(Boolean)) this.stop(); if (!this.wiredSent && this.done.length && this.done.every(Boolean)) { this.wiredSent = true; emit({ k: 'mission', l: this.mission.id, i: 1 }); } }
    const bad = (this.erc || []).length; if (bad > (this.ercSeen || 0)) emit({ k: 'erc', l: this.erc.some(e => e.sev === 'err') ? 'err' : 'warn' }); this.ercSeen = bad;
    this._renderSide(); this._renderControls(); this._targets(); this._bar(); this.dirty = true;
  }

  // ───────────────────────── modes ─────────────────────────
  freeBuild() {
    this.stop(); this.clearBench(); this.mode = 'free'; this.mission = null; this.tab = 'steps';
    this.el.title.textContent = 'Free build'; emit({ k: 'lab', l: 'free' });
    this._changed(); this._frameAll(false); this._hint('Pick boards and parts on the left, then click a pin to start a wire.');
  }
  loadMission(m) {
    if (!m) return this.freeBuild();
    this.stop(); this.clearBench(); this.mode = 'mission'; this.mission = m; this.tab = 'steps'; this.wiredSent = false; emit({ k: 'mission', l: m.id, i: 0 });
    this.el.title.innerHTML = `<b>${esc(m.title)}</b> <span>${esc(m.level || '')}${m.minutes ? ' · ' + m.minutes + ' min' : ''}</span>`;
    for (const p of m.parts) this.addItem(p.type, p);
    this._changed(); this._frameAll(false); this._hint('Click a glowing pin, then the pin it should connect to.');
  }
  autoWire(all) {
    if (!this.mission) return;
    this._cancelWire();
    for (let i = 0; i < this.mission.wires.length; i++) {
      const s = this.mission.wires[i]; this._nets(); if (this._wireDone(s)) continue;
      const [ra, na] = this._split(s.a), [rb, nb] = this._split(s.b);
      const load = (p) => this.wires.filter(w => w.a === p || w.b === p).length;
      const A = this._findPins(ra, na).sort((x, y) => load(x) - load(y))[0], B = this._findPins(rb, nb).sort((x, y) => load(x) - load(y))[0];
      if (A && B) this.addWire(A, B, WIRE[s.color] ? s.color : undefined);
      if (!all) break;
    }
    this._changed();
  }
  _targets() {
    const t = this.targets; t.forEach(g => (g.visible = false));
    if (!this.mission || this.running) return;
    const i = this.done.findIndex(d => !d); this.stepIdx = i; if (i < 0) return;
    const s = this.mission.wires[i];
    [s.a, s.b].forEach((ref, k) => {
      const [r, n] = this._split(ref), pin = this._findPins(r, n)[0]; if (!pin) return;
      const P = this._plug(pin, 0), g = t[k]; g.position.copy(P.p).add(new THREE.Vector3(0, pin.style === 'socket' || pin.style === 'bread' ? 1 : 7, 0));
      const tex = this._labelTex(pin.name.length > 12 ? n : pin.name), lb = g.userData.lb; lb.material.map = tex; lb.material.needsUpdate = true;
      lb.userData.aspect = tex.userData.aspect; lb.position.set(0, 6, 0); g.visible = true; g.userData.pin = pin;
    });
  }

  // ───────────────────────── simulation ─────────────────────────
  run() {
    if (this.running) return;
    if (this.mission && !this.done.every(Boolean)) { this._hint(`Finish the wiring first: ${this.done.filter(d => !d).length} connection(s) to go.`, true); return; }
    this.running = true; this.simT = 0; this.serial = []; this._cancelWire(); this._select(null);
    emit({ k: 'run', l: this.mission ? this.mission.id : 'free' }); if (this.mission) emit({ k: 'mission', l: this.mission.id, i: 2 });
    if (this.mission) {
      const lab = this, timers = [], loops = [], by = (ref) => lab.items.find(i => i.ref === ref);
      const sim = this.sim = { timers, loops,
        set(ref, patch) { const it = by(ref); if (it) { Object.assign(it.state, patch); lab._applyState(it); } },
        get(ref) { return by(ref)?.state || {}; },
        every(ms, fn) { timers.push({ ms, fn, acc: 0, rep: true }); }, after(ms, fn) { timers.push({ ms, fn, acc: 0, rep: false }); },
        loop(fn) { loops.push(fn); }, log(ref, text) { lab._log(by(ref)?.name || ref, text); }, tone(ref, hz) { lab._tone(ref, hz); } };
      try { this.mission.run(sim); } catch (e) { console.error(e); this._log('lab', 'Script error: ' + e.message); }
      this.tab = 'serial';
      setTimeout(() => { if (this.running && this.mission) { this.success = true; emit({ k: 'mission', l: this.mission.id, i: 3 }); this._renderSide(); } }, 2500);
    }
    this._changed(); this._hint(this.mission?.watch || 'Running. Try the controls at the bottom left.');
  }
  stop() {
    if (!this.running) return;
    this.running = false; this.sim = null; this.success = false; this._silence();
    for (const it of this.items) { const keep = {}; for (const k of ['pressed', 'value', 'distance', 'temp', 'hum']) if (k in it.state) keep[k] = it.state[k]; it.state = { ...(it.def.defaults || {}), ...keep, pressed: false }; if (it.kind === 'board') it.state.led = false; this._applyState(it); }
    this._changed(); this._hint('Stopped.');
  }
  _applyState(it) {
    if (it.kind === 'board') this._boardLed(it, !!it.state.led);
    else { try { it.def.apply?.(it.built, it.state); } catch (e) { console.warn(e); } if (it.defId === 'buzzer') this._tone(it.ref, it.state.on ? (it.state.freq || 2000) : 0); }
    this.dirty = true;
  }
  _boardLed(it, on) {
    if (!it.glow) {
      const id = LED_PART_IDS.find(k => it.built.parts[k]); if (!id) return;
      const c = it.built.parts[id].center, s = glowSprite(it.lab.glow || '#ffb020', 9);
      s.material = s.material.clone(); s.material.opacity = 0.95; s.material.depthTest = false; s.position.set(c.x, c.y + 1.2, c.z); s.raycast = () => {}; it.built.group.add(s); it.glow = s;
    }
    it.glow.visible = on;
  }
  _log(who, text) { this.serial.push({ t: this.simT, who, text: String(text) }); if (this.serial.length > 160) this.serial.shift(); this.serialDirty = true; }
  _tone(ref, hz) {
    this.tones ||= {};
    if (!hz || !this.sound || !this.running) { const o = this.tones[ref]; if (o) { try { o.g.gain.setTargetAtTime(0, this.ac.currentTime, 0.01); o.osc.stop(this.ac.currentTime + 0.08); } catch {} delete this.tones[ref]; } return; }
    try {
      this.ac ||= new (window.AudioContext || window.webkitAudioContext)();
      let o = this.tones[ref];
      if (!o) { const osc = this.ac.createOscillator(), g = this.ac.createGain(); osc.type = 'square'; g.gain.value = 0; osc.connect(g).connect(this.ac.destination); osc.start(); g.gain.setTargetAtTime(0.035, this.ac.currentTime, 0.01); o = this.tones[ref] = { osc, g }; }
      o.osc.frequency.setTargetAtTime(hz, this.ac.currentTime, 0.005);
    } catch {}
  }
  _silence() { for (const k of Object.keys(this.tones || {})) { const o = this.tones[k]; try { o.g.gain.value = 0; o.osc.stop(); } catch {} delete this.tones[k]; } }
  _setDrive(mode) {
    const p = this.selPin; if (!p) return;
    if (mode === 'off') this.drive.delete(p.key); else this.drive.set(p.key, { mode, duty: this.drive.get(p.key)?.duty ?? 0.5 });
    this._renderSide(); this.dirty = true;
  }
  /** Free-build electrical model: propagate levels through nets and let modules react. */
  _freeTick(t) {
    const lv = new Map(), put = (pin, v) => { if (v == null) return; const n = this.netOf(pin), c = lv.get(n); if (c == null || (v === 0 ? false : v > c)) lv.set(n, v); if (v === 0 && c == null) lv.set(n, 0); };
    const pinOf = (it, name) => it.pins.find(q => norm(q.name) === norm(name)) || it.pins.find(q => nameMatches(q.name, name, q.kind));
    const get = (it, name) => { const p = pinOf(it, name); return p ? lv.get(this.netOf(p)) : undefined; };
    for (const it of this.items) {
      if (it.kind === 'board' || it.defId === 'battery') for (const p of it.pins) if (p.kind === 'pwr' || p.kind === 'gnd') put(p, pinVolts(p));
      if (it.kind === 'board') for (const p of it.pins) { const d = this.drive.get(p.key); if (d) { const V = it.lab.logic; put(p, d.mode === 'high' ? V : d.mode === 'low' ? 0 : d.mode === 'blink' ? (t % 1 < 0.5 ? V : 0) : V * d.duty); } }
    }
    for (let pass = 0; pass < 2; pass++) for (const it of this.items) {
      if (it.kind !== 'mod') continue;
      const vcc = get(it, 'VCC'), gnd = get(it, 'GND'), ok = vcc > 2 && gnd === 0, o = (n, v) => { const p = pinOf(it, n); if (p) put(p, v); };
      if (it.defId === 'button' && ok) o('OUT', it.state.pressed ? vcc : 0);
      if (it.defId === 'pot' && ok) o('OUT', vcc * (it.state.value ?? 0.5));
      if (it.defId === 'ldr' && ok) o('AO', vcc * (1 - (it.state.value ?? 0.5)));
      if (it.defId === 'level-shifter') for (let k = 1; k <= 4; k++) { const h = get(it, 'HV' + k), l = get(it, 'LV' + k), HV = get(it, 'HV'), LV = get(it, 'LV'); if (h != null && l == null && LV) o('LV' + k, h > 2 ? LV : 0); if (l != null && h == null && HV) o('HV' + k, l > 1.5 ? HV : 0); }
      if (it.defId === 'motor-driver') { const vm = get(it, '12V'); const on = vm > 4 && gnd === 0; if (it.state.on !== on) { it.state.on = on; this._applyState(it); } if (on) for (let k = 1; k <= 4; k++) { const en = get(it, k <= 2 ? 'ENA' : 'ENB'), i = get(it, 'IN' + k); if (en !== 0) o('OUT' + k, i > 1.5 ? vm * (en == null ? 1 : Math.min(1, en / 3.3)) : 0); } }
    }
    for (const it of this.items) {
      if (it.kind !== 'mod') continue;
      const gnd = get(it, 'GND'), s = it.state; let ch = false; const set = (k, v) => { if (s[k] !== v) { s[k] = v; ch = true; } };
      if (it.defId === 'led') { const v = get(it, 'SIG'); set('on', v > 1.2 && gnd === 0); set('level', Math.min(1, Math.round((v || 0) / 5 * 20) / 20 + 0.25)); }
      if (it.defId === 'rgb') for (const c of ['R', 'G', 'B']) { const v = get(it, c); set(c.toLowerCase(), v > 1.2 && gnd === 0 ? Math.min(1, v / 3.3) : 0); }
      if (it.defId === 'buzzer') { set('on', get(it, 'SIG') > 1.5 && gnd === 0); set('freq', 2000); }
      if (it.defId === 'servo') { const v = get(it, 'SIG'); if (get(it, '5V') > 4 && gnd === 0 && v != null) set('angle', Math.round(Math.min(1, v / 5) * 180)); }
      if (it.defId === 'motor') { const a = get(it, 'M+'), b = get(it, 'M-'); set('speed', a != null && b != null ? Math.max(-1, Math.min(1, (a - b) / 6)) : 0); }
      if (it.defId === 'oled') { const ok = get(it, 'VCC') > 2 && gnd === 0, bus = pinOf(it, 'SDA') && this.nets.get(this.netOf(pinOf(it, 'SDA'))).some(p => p.item.kind === 'board') && this.nets.get(this.netOf(pinOf(it, 'SCL'))).some(p => p.item.kind === 'board'); const lines = !ok ? [] : bus ? ['SSD1306 128x64', 'I2C addr 0x3C', 'bus: OK'] : ['SSD1306 128x64', 'no I2C bus yet']; if (JSON.stringify(s.lines) !== JSON.stringify(lines)) { s.lines = lines; ch = true; } }
      if (ch) this._applyState(it);
    }
  }

  // ───────────────────────── pointer ─────────────────────────
  _setPtr(e) { const b = this.renderer.domElement.getBoundingClientRect(); this.px = e.clientX - b.left; this.py = e.clientY - b.top; this.ptr.set(this.px / b.width * 2 - 1, -(this.py / b.height) * 2 + 1); this.ray.setFromCamera(this.ptr, this.camera); }
  _hit() {
    const hw = this.ray.intersectObject(this.wireLayer, true)[0], hi = this.ray.intersectObject(this.itemLayer, true)[0];
    const res = { point: null };
    if (hi && (!hw || hi.distance <= hw.distance + 1.5)) {
      let o = hi.object; while (o && !o.userData.item) o = o.parent; const item = o?.userData.item; if (!item) return res;
      res.item = item; res.point = hi.point;
      const lp = item.holder.worldToLocal(hi.point.clone()); let best = 1.75;
      for (const p of item.pins) {
        let d = Math.hypot(p.lx - lp.x, p.lz - lp.z);
        if (p.style === 'bread' && Math.abs(p.lx - lp.x) < 1.27) { const off = (p.lz - lp.z) * p.out; if (off > -1 && off < PITCH * 4.6) d = Math.min(d, 1); }
        if (d < best) { best = d; res.pin = p; }
      }
    } else if (hw) { let o = hw.object; while (o && !o.userData.wire) o = o.parent; res.wire = o?.userData.wire; res.point = hw.point; }
    return res;
  }
  _benchPoint(y = 0) { const t = (y - this.ray.ray.origin.y) / this.ray.ray.direction.y; return t > 0 ? this.ray.ray.origin.clone().addScaledVector(this.ray.ray.direction, t) : null; }
  _down(e) {
    if (e.button !== 0) return;
    this._setPtr(e); const h = this._hit(); this.downAt = { x: e.clientX, y: e.clientY, h, moved: false };
    if (h.pin || h.item || h.wire) this.controls.enabled = false;
    if (h.pin) { if (!this.from) { this._startWire(h.pin); this.downAt.started = true; } }
    else if (h.item) {
      const press = this.running && h.item.def.interact === 'press';
      if (press) { h.item.state.pressed = true; this._applyState(h.item); this.pressing = h.item; }
      else { this._select(h.item); const bp = this._benchPoint(0); if (bp) this.dragging = { item: h.item, dx: h.item.x - bp.x, dy: h.item.y + bp.z }; }
    }
    try { this.renderer.domElement.setPointerCapture(e.pointerId); } catch {}
  }
  _move(e) {
    this._setPtr(e);
    if (this.downAt && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 5) this.downAt.moved = true;
    if (this.dragging && this.downAt?.moved) { const bp = this._benchPoint(0); if (bp) { this._place(this.dragging.item, bp.x + this.dragging.dx, -bp.z + this.dragging.dy); this._selTools(); this._targets(); } return; }
    if (e.buttons && !this.from) return;
    const h = this._hit(); this.hover = h;
    if (h.pin) { const P = this._plug(h.pin, 0); this.ring.position.copy(P.p).add(new THREE.Vector3(0, h.pin.style === 'post' ? 7 : 1, 0)); this.ring.visible = true; this._tip(h.pin); }
    else { this.ring.visible = false; this._tip(h.item && !this.from ? { item: h.item } : null); }
    this.renderer.domElement.style.cursor = h.pin ? 'crosshair' : h.item ? (this.running && h.item.def.interact === 'press' ? 'pointer' : 'grab') : h.wire ? 'pointer' : '';
    if (this.from) this._rubber(h.pin);
    this.dirty = true;
  }
  _up(e) {
    this.controls.enabled = true; const d = this.downAt; this.downAt = null;
    try { this.renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
    if (this.pressing) { this.pressing.state.pressed = false; this._applyState(this.pressing); this.pressing = null; return; }
    if (this.dragging) { const moved = d?.moved; this.dragging = null; if (moved) { this._changed(); return; } }
    if (!d) return;
    this._setPtr(e); const h = this._hit();
    if (this.from) {
      if (h.pin && h.pin !== this.from) { const w = this.addWire(this.from, h.pin); this._cancelWire(); if (w) { emit({ k: 'wire', l: this.mission ? this.mission.id : 'free' }); this._changed(); this._hint('Connected. Click another pin to add the next wire.'); } }
      else if (h.pin === this.from && !d.started && !d.moved) this._cancelWire();
      else if (!h.pin && !d.moved && !d.started) this._cancelWire();
      else if (!h.pin && d.started && d.moved) this._cancelWire();
      return;
    }
    if (!d.moved) { if (h.wire) this._select(null, h.wire); else if (!h.item) this._select(null); }
  }
  _startWire(pin) { if (this.running) this.stop(); this.from = pin; this.selPin = pin; const P = this._plug(pin, 0); this.fromRing.position.copy(P.p).add(new THREE.Vector3(0, pin.style === 'post' ? 7 : 1, 0)); this.fromRing.visible = true; this._select(null); this.tabPin = true; this._renderSide(); this._hint(`${pin.item.name} · ${pin.name} selected. Click the pin to connect it to (Esc to cancel).`); }
  _cancelWire() { this.from = null; this.fromRing.visible = false; for (const c of [...this.rubber.children]) { this.rubber.remove(c); c.geometry.dispose(); } this.dirty = true; }
  _rubber(toPin) {
    for (const c of [...this.rubber.children]) { this.rubber.remove(c); c.geometry.dispose(); }
    const A = this._plug(this.from, 0), a = A.p.clone().addScaledVector(A.dir, A.len);
    let b; if (toPin) { const B = this._plug(toPin, 0); b = B.p.clone().addScaledVector(B.dir, B.len); } else { b = this._benchPoint(22) || a.clone(); }
    const L = Math.max(14, Math.min(60, a.distanceTo(b) * 0.42)), up = new THREE.Vector3(0, 1, 0);
    const curve = new THREE.CubicBezierCurve3(a, a.clone().addScaledVector(up, L), b.clone().addScaledVector(up, toPin ? L : L * 0.4), b);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.7, 6), (this.rubberMat ||= new THREE.MeshStandardMaterial({ color: 0xff6a2b, roughness: 0.4, transparent: true, opacity: 0.85 })));
    m.raycast = () => {}; this.rubber.add(m);
  }
  _select(item, wire = null) {
    this.selItem = item; this.selWire = wire; if (item || wire) { this.selPin = null; }
    this.selBox.visible = !!item; if (item) this.selBox.box.setFromObject(item.holder);
    for (const w of this.wires) w.group.children.forEach(c => { if (c.userData.own) c.scale.setScalar(1); });
    this._selTools(); this._renderSide(); this.dirty = true;
  }
  _selTools() {
    const el = this.el.sel, it = this.selItem, w = this.selWire;
    if (!it && !w) { el.hidden = true; return; }
    el.hidden = false;
    if (it) { this.selBox.box.setFromObject(it.holder); el.innerHTML = `<span>${esc(it.name)}</span><button data-lab="rotate" title="Rotate 90° (R)">Rotate</button><button data-lab="delete" title="Remove (Del)">Remove</button>`; }
    else el.innerHTML = `<span>Wire</span>${Object.keys(WIRE).map(c => `<button class="lab-sw${w.color === c ? ' on' : ''}" data-lab="color" data-v="${c}" style="--c:${WIRE[c]}" aria-label="${c}"></button>`).join('')}<button data-lab="delete">Remove</button>`;
  }
  _rotateSel() { const it = this.selItem; if (!it) return; this._place(it, it.x, it.y, (it.rot + 90) % 360); this._selTools(); this._changed(); }
  _deleteSel() { if (this.selWire) this.removeWire(this.selWire); else if (this.selItem) { this.removeItem(this.selItem); this._changed(); } }
  _tip(o) {
    const el = this.el.tip; if (!o) { el.hidden = true; return; }
    el.hidden = false; el.style.left = Math.min(this.W - 240, this.px + 16) + 'px'; el.style.top = this.py + 18 + 'px';
    el.innerHTML = o.item && !o.name ? `<b>${esc(o.item.name)}</b><i>drag to move · R rotates</i>` : `<b class="k-${o.kind}">${esc(o.name)}</b><span>${esc(o.fn || '')}</span><i>${esc(o.item.name)}</i>`;
  }
  _hint(text, warn) { this.el.hint.textContent = text; this.el.hint.classList.toggle('warn', !!warn); }
  _frameAll(animate) {
    const bx = new THREE.Box3(); this.items.forEach(i => bx.union(new THREE.Box3().setFromObject(i.holder)));
    if (bx.isEmpty()) bx.set(new THREE.Vector3(-200, 0, -125), new THREE.Vector3(200, 20, 125));
    const c = bx.getCenter(new THREE.Vector3()), s = bx.getSize(new THREE.Vector3()), R = Math.max(70, 0.5 * Math.hypot(s.x, s.z) + 18);
    const dir = this.topView ? new THREE.Vector3(0, 1, 0.03) : new THREE.Vector3(0, 0.74, 0.68); dir.normalize();
    const vf = this.camera.fov * Math.PI / 180, d = R / Math.sin(Math.atan(Math.tan(vf / 2) * Math.min(1, this.W / this.H))) * 0.9;
    const tgt = new THREE.Vector3(c.x, 4, c.z), pos = tgt.clone().addScaledVector(dir, d);
    if (!animate) { this.camera.position.copy(pos); this.controls.target.copy(tgt); this.controls.update(); this.dirty = true; return; }
    this.camAnim = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: tgt, s: performance.now() };
  }

  // ───────────────────────── panels ─────────────────────────
  _bar() {
    const ready = !this.mission || this.done.every(Boolean);
    this.el.run.textContent = this.running ? 'Stop' : 'Run'; this.el.run.classList.toggle('is-ready', ready && !this.running); this.el.run.classList.toggle('is-stop', this.running);
    this.el.auto.hidden = !this.mission || ready;
  }
  _renderPalette() {
    const cats = {}; for (const m of Object.values(this.moduleDefs)) (cats[m.category || 'Modules'] ||= []).push(m);
    const card = (type, name, sub, color) => `<button class="lab-part" data-lab="add" data-v="${type}"><i style="--c:${color}"></i><span><b>${esc(name)}</b><small>${esc(sub || '')}</small></span></button>`;
    const order = ['Outputs', 'Inputs', 'Sensors', 'Actuators', 'Power', 'Interface'];
    this.el.palette.innerHTML = `<h4>Boards</h4>${Object.values(this.boardDefs).map(b => card('board:' + b.id, b.name, (b.compare?.logic || '') + ' logic', b.accent || '#888')).join('')}` +
      Object.keys(cats).sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99).map(c => `<h4>${esc(c)}</h4>${cats[c].map(m => card('mod:' + m.id, m.name, m.blurb, '#b9ad94')).join('')}`).join('') +
      `<button class="lab-btn lab-clear" data-lab="clear">Clear the bench</button>`;
    for (const type of THUMBS.keys()) this._paintThumb(type);
  }
  _renderControls() {
    const rows = [];
    for (const it of this.items) {
      const ia = it.def.interact; if (!ia) continue;
      if (ia === 'press') rows.push(`<label><span>${esc(it.name)}</span><button class="lab-press" data-press="${it.id}">Hold to press</button></label>`);
      else { const sl = ia === 'knob' ? { key: 'value', min: 0, max: 1, unit: '', label: 'Knob' } : ia.slider; if (!sl) continue; const v = it.state[sl.key] ?? sl.min;
        rows.push(`<label><span>${esc(it.name)} · ${esc(sl.label)}</span><input type="range" min="${sl.min}" max="${sl.max}" step="${(sl.max - sl.min) / 200}" value="${v}" data-ctl="${it.id}" data-key="${sl.key}" data-unit="${esc(sl.unit || '')}"><output>${this._fmt(v, sl.unit || '')}</output></label>`); }
    }
    this.el.controls.hidden = !rows.length; this.el.controls.innerHTML = rows.length ? `<h5>Try it</h5>${rows.join('')}` : '';
  }
  _code(code) {
    const list = Array.isArray(code) ? code : code ? [code] : [];
    const hl = (src) => esc(src).replace(/(\/\/[^\n]*|#[^\n]*)/g, '<i>$1</i>').replace(/\b(void|int|float|const|if|else|for|while|return|def|import|from|True|False|HIGH|LOW|OUTPUT|INPUT|INPUT_PULLUP|long|unsigned|bool|char|byte|in|and|or|not|None|try|except)\b(?![^<]*<\/i>)/g, '<b>$1</b>');
    return list.map(c => `${c.title ? `<h6>${esc(c.title)}</h6>` : ''}<pre class="lab-code">${hl(c.src || '')}</pre>`).join('') || '<p class="lab-muted">No code for this one.</p>';
  }
  _renderSide() {
    const m = this.mission, el = this.el.side, tabs = m ? [['steps', 'Steps'], ['code', 'Code'], ['serial', 'Serial']] : [['steps', 'Bench'], ['serial', 'Serial']];
    if (!tabs.some(t => t[0] === this.tab)) this.tab = 'steps';
    let h = `<div class="lab-tabs">${tabs.map(t => `<button data-lab="tab" data-v="${t[0]}" class="${this.tab === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div><div class="lab-pane">`;
    const erc = (this.erc || []).map(e => `<p class="lab-erc ${e.sev}">${esc(e.msg)}</p>`).join('');
    const pin = this.selPin && this.items.includes(this.selPin.item) ? this.selPin : null;
    const pinCard = pin ? (() => { const d = this.drive.get(pin.key), gp = pin.item.kind === 'board' && !['pwr', 'gnd', 'nc'].includes(pin.kind);
      return `<div class="lab-pin"><b class="k-${pin.kind}">${esc(pin.name)}</b><span>${esc(pin.item.name)}</span><p>${esc(pin.fn || '')}</p>${gp && !m ? `<div class="lab-drive"><small>Drive this pin</small>${[['off', 'Off'], ['high', 'HIGH'], ['low', 'LOW'], ['blink', 'Blink'], ['pwm', 'PWM']].map(([k, t]) => `<button data-lab="drive" data-v="${k}" class="${(d?.mode || 'off') === k ? 'on' : ''}">${t}</button>`).join('')}${d?.mode === 'pwm' ? `<input type="range" min="0" max="1" step="0.01" value="${d.duty}" data-duty="${pin.key}">` : ''}</div>` : ''}</div>`; })() : '';
    if (this.tab === 'steps' && m) {
      const cur = this.done.findIndex(d => !d), all = cur < 0;
      h += `<p class="lab-goal">${esc(m.goal)}</p><p class="lab-intro">${esc(m.intro || '')}</p>${erc}<ol class="lab-steps">` + m.wires.map((w, i) => {
        const [ra, na] = this._split(w.a), [rb, nb] = this._split(w.b), A = this.items.find(x => x.ref === ra), B = this.items.find(x => x.ref === rb);
        return `<li class="${this.done[i] ? 'done' : i === cur ? 'cur' : ''}"><span class="dot" style="--c:${WIRE[w.color] || '#999'}"></span><div><b>${esc(A?.name || ra)} <em>${esc(na)}</em> → ${esc(B?.name || rb)} <em>${esc(nb)}</em></b>${i === cur || this.done[i] ? `<p>${esc(w.why || '')}</p>` : ''}${i === cur ? `<button class="lab-link" data-lab="step">Show me</button>` : ''}</div></li>`;
      }).join('') + `</ol>`;
      if (all) h += this.running ? (this.success ? `<div class="lab-success"><b>It works.</b><p>${esc(m.success || '')}</p>${m.watch ? `<p><em>Try:</em> ${esc(m.watch)}</p>` : ''}<button class="lab-btn lab-primary" data-lab="next">Next mission</button></div>` : `<p class="lab-muted">Running…</p>`) : `<div class="lab-ready"><b>Wiring complete.</b><p>Press Run to power it up.</p><button class="lab-btn lab-primary" data-lab="run">Run</button></div>`;
      if (m.learn?.length) h += `<h6>What you learn</h6><ul class="lab-learn">${m.learn.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
      h += pinCard;
    } else if (this.tab === 'steps') {
      h += `<p class="lab-goal">Free build</p><p class="lab-intro">Add any boards and parts, wire pin to pin, then press Run. Click a board pin to drive it HIGH, LOW, blinking or PWM and watch what is connected react.</p>${erc || (this.wires.length ? '<p class="lab-erc ok">No electrical problems found.</p>' : '')}${pinCard}`;
      const it = this.selItem; if (it) h += `<div class="lab-pin"><b>${esc(it.name)}</b><p>${esc(it.def.about || it.def.summary || it.def.blurb || '')}</p></div>`;
      h += `<p class="lab-muted">${this.items.length} item(s) · ${this.wires.length} wire(s)</p><button class="lab-btn" data-lab="missions">Browse missions</button>`;
    } else if (this.tab === 'code') h += this._code(m?.code);
    else h += `<div class="lab-serial">${this.serial.length ? this.serial.map(l => `<div><i>${l.t.toFixed(1)}s</i><b>${esc(l.who)}</b><span>${esc(l.text)}</span></div>`).join('') : `<p class="lab-muted">${this.running ? 'Waiting for output…' : 'Press Run to see what the boards print.'}</p>`}</div>`;
    el.innerHTML = h + '</div>';
    if (this.tab === 'serial') { const s = el.querySelector('.lab-serial'); if (s) s.scrollTop = s.scrollHeight; }
  }
  _showMissions() {
    const o = this.el.overlay; o.hidden = false;
    const names = (m) => m.parts.filter(p => p.type.startsWith('board:')).map(p => this._def(p.type).name).join(' + ');
    o.innerHTML = `<div class="lab-sheet"><header><h3>Missions</h3><button class="lab-btn" data-lab="close-overlay">Close</button></header><div class="lab-grid">` +
      this.missions.map((m, i) => `<button class="lab-card${m === this.mission ? ' on' : ''}" data-lab="mission" data-v="${m.id}"><small>${String(i + 1).padStart(2, '0')} · ${esc(m.level || '')}${m.minutes ? ' · ' + m.minutes + ' min' : ''}</small><b>${esc(m.title)}</b><span>${esc(m.goal)}</span><em>${esc(names(m))}</em></button>`).join('') +
      `<button class="lab-card lab-free" data-lab="free"><small>Sandbox</small><b>Free build</b><span>An empty bench. Any boards, any parts, your own wiring.</span><em>All 8 boards</em></button></div></div>`;
  }
  _hideOverlay() { this.el.overlay.hidden = true; }

  // ───────────────────────── frame ─────────────────────────
  _frame(now) {
    const dt = Math.min(0.1, (now - this.clock) / 1000); this.clock = now;
    if (this.camAnim) { const a = this.camAnim, k = Math.min(1, (now - a.s) / 700), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; this.camera.position.lerpVectors(a.p0, a.p1, e); this.controls.target.lerpVectors(a.t0, a.t1, e); this.camera.lookAt(this.controls.target); if (k >= 1) this.camAnim = null; this.dirty = true; }
    else this.controls.update();
    if (this.running) {
      this.simT += dt;
      if (this.sim) {
        for (const t of [...this.sim.timers]) { t.acc += dt * 1000; let n = 0; while (t.acc >= t.ms && n++ < 4) { t.acc -= t.ms; try { t.fn(); } catch (e) { console.error(e); } if (!t.rep) { this.sim?.timers.splice(this.sim.timers.indexOf(t), 1); break; } } if (!this.sim) break; }
        if (this.sim) for (const f of this.sim.loops) { try { f(dt, this.simT); } catch (e) { console.error(e); } }
      } else this._freeTick(this.simT);
      for (const it of this.items) if (it.def.tick) { try { it.def.tick(it.built, it.state, dt); } catch {} }
      if (this.serialDirty && this.tab === 'serial') { this.serialDirty = false; this._renderSide(); }
      this.dirty = true;
    }
    const vis = this.targets.some(g => g.visible);
    if (vis) { const s = 1 + 0.18 * Math.sin(now / 190); for (const g of this.targets) if (g.visible) { g.userData.rg.scale.set(9 * s, 9 * s, 1); const lb = g.userData.lb, d = this.camera.position.distanceTo(g.position) * 0.03; lb.scale.set(d * (lb.userData.aspect || 2), d, 1); lb.position.y = 3 + d * 0.3; } this.dirty = true; }
    const d2 = this.camera.position.distanceTo(this.controls.target) * 0.012; this.ring.scale.set(d2, d2, 1); this.fromRing.scale.set(d2, d2, 1);
    if (!this.dirty) return; this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    if (this.selItem || this.selWire) { const p = this.selItem ? new THREE.Vector3(this.selItem.x, 30, -this.selItem.y) : this.selWire.group.children[2]?.geometry.boundingSphere?.center.clone() || new THREE.Vector3(); p.project(this.camera); this.el.sel.style.left = (p.x * 0.5 + 0.5) * this.W + 'px'; this.el.sel.style.top = Math.max(8, (-p.y * 0.5 + 0.5) * this.H - 46) + 'px'; }
  }
}

export function initLab(root, opts = {}) {
  if (root.__lab) return root.__lab;
  const start = () => (root.__lab = window.__lab = new Lab(root, opts));
  if (new URLSearchParams(location.search).get('mission') || !('IntersectionObserver' in window)) return start();
  root.innerHTML = '<div class="lab-loading" style="position:static;padding:48px;text-align:center">The lab bench sets itself up when you scroll here…</div>';
  const io = new IntersectionObserver((es) => { if (es.some(e => e.isIntersecting)) { io.disconnect(); start(); } }, { rootMargin: '300px' });
  io.observe(root);
  return null;
}
