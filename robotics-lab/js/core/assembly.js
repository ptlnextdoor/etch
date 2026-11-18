// Assembly mode: the board is taken apart into a kit laid out on a tray; the learner picks every part,
// drops it on its footprint and solders it with an iron (press and hold).
//
//   const asm = new Assembly(viewer);
//   asm.on('progress', ({ placed, soldered, total }) => {}).on('done', ({ seconds }) => {});
//   asm.start(def);   …   asm.stop();
//
// Parts never change parents (riders excepted, see KITS[..].ride): they are animated in world space and put back
// exactly on stop(). Everything created here lives in one `fx` group and is disposed on stop().
import * as THREE from 'three';
import { Builder, M, colorMat, glowSprite, rrShape } from './builder.js';

// ───────────────────────── per-board kit tables ─────────────────────────
// skip  — tags (or 'tag:objectName') that are not loose components: they stay soldered on the board
// ride  — tags (or 'tag:objectName') that are glued to another piece and travel with it
// names — nicer labels for tags that hold several different objects (index = position in built.parts[id].objects)
// order — suggested soldering order: low parts first, tall connectors and headers last (how real kits are built)
// power — the LED that lights up when the finished board is powered
// Bottom-side parts are always left on the board. Tags missing from `order` are appended, lowest first.
const KITS = {
  uno: {
    order: ['usbchip', 'reg5v', 'led_on', 'led_l', 'led_txrx', 'crystal', 'reset', 'caps', 'mcu', 'icsp', 'hdr_power', 'hdr_analog', 'hdr_digital', 'usb', 'jack'],
    names: { hdr_digital: ['Digital header, pins 8–13', 'Digital header, pins 0–7'] },
    power: 'led_on',
  },
  nano: {
    order: ['mcu', 'crystal', 'leds_serial', 'led_pwr', 'led_l', 'reset', 'usb', 'icsp', 'hdr_top', 'hdr_bottom'],
    power: 'led_pwr',
  },
  mega: {
    order: ['mcu', 'usbchip', 'crystal', 'reg5v', 'led_on', 'led_l', 'led_txrx', 'reset', 'icsp', 'hdr_power', 'hdr_analog', 'hdr_pwm', 'hdr_comm', 'hdr_digital', 'usb', 'jack'],
    names: {
      crystal: ['16 MHz crystal', '16 MHz ceramic resonator'],
      hdr_pwm: ['PWM header, pins 8–13', 'PWM header, pins 0–7'],
      hdr_analog: ['Analog header A0–A7', 'Analog header A8–A15'],
      icsp: ['ICSP header (ATmega2560)', 'ICSP header (ATmega16U2)'],
    },
    power: 'led_on',
  },
  esp32: {
    ride: { antenna: 'module' },                       // the antenna is a printed overlay on the module
    order: ['usbchip', 'autoreset', 'diode', 'led_pwr', 'led_d2', 'tant', 'reg3v3', 'btn_en', 'btn_boot', 'usb', 'module', 'hdr_top', 'hdr_bottom'],
    power: 'led_pwr',
  },
  nodemcu: {
    skip: ['autoreset', 'divider'],                    // groups of loose resistors / transistors
    ride: { antenna: 'module', led: 'module' },        // printed antenna + the LED that sits on the module
    order: ['usbchip', 'diode', 'led_d0', 'reg3v3', 'btn_rst', 'btn_flash', 'usb', 'module', 'hdr_top', 'hdr_bottom'],
    power: 'led',
  },
  pico: {
    skip: ['pads_gpio', 'debug', 'testpads'],          // bare gold pads — part of the PCB itself
    order: ['mcu', 'flash', 'crystal', 'reg', 'coil', 'diode', 'led', 'bootsel', 'usb'],
    power: 'led',
  },
  bluepill: {
    skip: ['passives'],                                // the scattered 0603 resistors and capacitors
    ride: { 'swd:swd-base': 'swd', 'boot:jumper': 'boot' },
    order: ['mcu', 'led_pc13', 'led_pwr', 'crystal32k', 'reset', 'usb', 'crystal', 'swd', 'boot', 'hdr_top', 'hdr_bottom'],
    power: 'led_pwr',
  },
  rpi4: {
    skip: ['pmic:inductor'],                           // the four power inductors stay with the other small passives
    order: ['soc', 'ram', 'usbctrl', 'ethphy', 'pmic', 'wifi', 'leds', 'usbc', 'hdmi', 'audio', 'csi', 'dsi', 'poe', 'gpio', 'ethernet', 'usb2', 'usb3'],
    names: { hdmi: ['Micro-HDMI port HDMI0', 'Micro-HDMI port HDMI1'], leds: ['PWR LED (red)', 'ACT LED (green)'] },
    power: 'leds',
  },
};

// ───────────────────────── tuning ─────────────────────────
const ORANGE = 0xff6a2b;
const HOLD = 1.0;        // seconds of iron contact for one part
const PROUD = 0.5;       // a tacked part sits this far above the board (mm)
const CLEAR = 9;         // clearance of a carried part above the board (mm)
const TOL = 3.2;         // drop tolerance around a footprint (mm)
const TRAY_GAP = 15;     // bench between the board and the tray (mm)
const SLOT_PAD = 5, SLOT_MIN = 8;
const FOAM = 4.5;        // the foam pad under the PCB is this much larger than the board on every side (mm)
const CAM_DIR = new THREE.Vector3(-0.24, 1.0, 0.8).normalize();     // higher 3/4 view over board + tray
const ISO_DIR = new THREE.Vector3(-0.5, 0.62, 0.78).normalize();     // the viewer's own 3/4 view (finish beat)

const UP = new THREE.Vector3(0, 1, 0), XAX = new THREE.Vector3(1, 0, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _bx = new THREE.Box3();
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** AABB of the visible meshes below `objs`, expressed in the local frame of `ref` (sprites are ignored). */
function localBox(objs, ref, out = new THREE.Box3()) {
  out.makeEmpty();
  const inv = new THREE.Matrix4().copy(ref.matrixWorld).invert();
  const walk = (o) => {
    if (!o.visible) return;
    if (o.isMesh && o.geometry) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      _m.multiplyMatrices(inv, o.matrixWorld); _bx.copy(o.geometry.boundingBox).applyMatrix4(_m); out.union(_bx);
    }
    for (const c of o.children) walk(c);
  };
  objs.forEach(walk);
  return out;
}
/** World AABB of a local box under a pose. */
function poseBox(lbox, pos, quat, out) {
  out.makeEmpty();
  for (let i = 0; i < 8; i++) {
    _c.set(i & 1 ? lbox.max.x : lbox.min.x, i & 2 ? lbox.max.y : lbox.min.y, i & 4 ? lbox.max.z : lbox.min.z).applyQuaternion(quat).add(pos);
    out.expandByPoint(_c);
  }
  return out;
}
/** First sentence of a description (does not stop at "e.g." or "3.3 V"). */
function firstSentence(text = '') {
  const m = /[.!?…](?=\s+[A-Z“"'(]|\s*$)/.exec(text.length > 24 ? text.slice(24) : text);
  return m ? text.slice(0, (text.length > 24 ? 24 : 0) + m.index + 1) : text;
}
function ensureCss() {
  let link = document.querySelector('link[data-asm-css]');
  if (!link) {
    link = document.createElement('link'); link.rel = 'stylesheet'; link.dataset.asmCss = '1';
    link.href = new URL('../../css/assembly.css', import.meta.url).href;
    document.head.appendChild(link);
  }
  return link;
}

/** Rounded footprint marker lying on a surface: translucent slab + outline. */
class Marker {
  constructor(slab, line) {
    const mat = (opacity) => new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.slabOp = slab; this.lineOp = line;
    this.slab = new THREE.Mesh(new THREE.BufferGeometry(), mat(slab));
    this.line = new THREE.Mesh(new THREE.BufferGeometry(), mat(line));
    this.group = new THREE.Group(); this.group.add(this.slab, this.line); this.group.visible = false; this.group.renderOrder = 4;
    this.w = this.d = -1;
  }
  size(w, d, lw = 0.45) {
    if (Math.abs(w - this.w) < 1e-3 && Math.abs(d - this.d) < 1e-3) return;
    this.w = w; this.d = d;
    const r = Math.min(1.4, w * 0.3, d * 0.3);
    const flat = (shape) => { const g = new THREE.ShapeGeometry(shape, 8); g.rotateX(-Math.PI / 2); return g; };
    const ring = rrShape(w + 2 * lw, d + 2 * lw, r + lw); ring.holes.push(rrShape(w, d, r));
    this.slab.geometry.dispose(); this.line.geometry.dispose();
    this.slab.geometry = flat(rrShape(w, d, r)); this.line.geometry = flat(ring);
  }
  fade(k) { this.slab.material.opacity = this.slabOp * k; this.line.material.opacity = this.lineOp * (0.45 + 0.55 * k); }
  dispose() { for (const m of [this.slab, this.line]) { m.geometry.dispose(); m.material.dispose(); } }
}

/** Soldering iron, tip at the origin, body along +Y (millimetres, real proportions of a slim pencil iron). */
function buildIron(tipMat) {
  const B = new Builder();
  const heat = colorMat('#86786c', 0.42, 1), cork = colorMat('#c39a67', 0.92), blue = colorMat('#2261c4', 0.42), rubber = colorMat('#1a1b1d', 0.75);
  B.lathe([[0.2, 0], [0.55, 1.4], [1.25, 8], [1.7, 11.5], [1.7, 15], [0.01, 15]], tipMat);                    // conical chisel tip
  B.lathe([[0.01, 15], [2.15, 15], [2.15, 25], [0.01, 25]], heat);                                             // heat-tinted end of the barrel
  B.lathe([[0.01, 25], [2.15, 25], [2.15, 40], [0.01, 40]], M.steel);                                          // heater barrel
  B.lathe([[0.01, 38.5], [3.3, 38.5], [3.3, 43], [0.01, 43]], M.steelDull, 0, 0, 0, 6);                        // hex retaining nut
  B.lathe([[0.01, 43], [4.2, 43], [7.0, 46.4], [7.3, 48.2], [6.5, 50], [0.01, 50]], M.black);                  // finger guard
  B.lathe([[0.01, 50], [6.0, 50], [6.5, 52.5], [6.6, 74], [6.3, 76], [0.01, 76]], cork);                       // cork grip
  B.lathe([[0.01, 76], [6.35, 76], [6.75, 79.5], [6.3, 106], [5.1, 115], [3.5, 119.5], [0.01, 120]], blue);    // blue handle
  B.lathe([[0.01, 119.5], [3.1, 119.5], [2.7, 126], [2.1, 133], [0.01, 133.2]], rubber);                       // strain relief
  const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 131, 0), new THREE.Vector3(0, 141, 0), new THREE.Vector3(2.5, 151, -1.5), new THREE.Vector3(9, 159, -5), new THREE.Vector3(19, 164, -10), new THREE.Vector3(31, 165, -15)]);
  const iron = B.build('soldering-iron');
  const lead = new THREE.Mesh(new THREE.TubeGeometry(cable, 24, 1.45, 8, false), rubber);                      // cable stub (no shadow: it ends in mid-air)
  lead.castShadow = false; iron.add(lead);
  for (const m of iron.children) if (!m.material.metalness) m.castShadow = false;                               // only the metal front end drops a shadow on the board
  return iron;
}

function softTex(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 64; draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Assembly {
  constructor(viewer, opts = {}) {
    this.viewer = viewer; this.opts = opts; this.handlers = {}; this._active = false;
    for (const k of ['_tick', '_down', '_move', '_up', '_leave', '_key', '_menu', '_click', '_camStart']) this[k] = this[k].bind(this);
  }
  get active() { return this._active; }
  on(name, fn) { (this.handlers[name] ||= []).push(fn); return this; }
  _emit(name, e) { (this.handlers[name] || []).forEach((f) => { try { f(e); } catch (err) { console.error(err); } }); }

  // ───────────────────────── lifecycle ─────────────────────────
  /** Take the current board apart. opts.instant skips the take-apart animation, opts.challenge starts in challenge mode. */
  start(def, opts = {}) {
    const v = this.viewer;
    if (this._active) this.stop();
    if (!v.board) throw new Error('Assembly.start: show a board in the viewer first');
    def = def || v.def || {};
    this.def = def; this.built = v.board; this.root = v.board.group;
    const dom = this.dom = v.renderer.domElement, c = v.controls, sc = v.key.shadow.camera;
    this.saved = {
      locked: v.locked, autoRotate: v.autoRotate, frame: { ...v.frame }, enabled: c.enabled, maxPolar: c.maxPolarAngle, maxDist: c.maxDistance,
      cursor: dom.style.cursor, elPos: v.el.style.position, shadow: [sc.left, sc.right, sc.top, sc.bottom, sc.far], children: this.root.children.slice(),
    };
    v.locked = true; v.autoRotate = false; v.focusId = null;
    v.highlight?.(null); v._setHover?.(null); if (v.hoverBox) v.hoverBox.visible = false;
    if (getComputedStyle(v.el).position === 'static') v.el.style.position = 'relative';
    c.maxPolarAngle = Math.PI * 0.47;

    this.phase = 'intro'; this.challenge = !!opts.challenge; this.carried = null; this.hold = null; this.gesture = null; this.ptrId = null;
    this.hoverPiece = null; this.lastPiece = null; this.flashPiece = null; this.flashUntil = 0; this.fake = null;
    this.timers = []; this.clock = 0; this.t0 = 0; this.timing = false; this.seconds = 0; this.shownSec = -1;
    this.hints = 0; this.misses = 0; this.camTouched = false; this.glowK = -1; this.anyTacked = false;
    this.ndc = new THREE.Vector2(); this.ptrPx = { x: 0, y: 0 }; this.ptrIn = false; this.rayOk = this.bpOk = false;
    this.ray = new THREE.Raycaster(); this.bp = new THREE.Vector3(); this.gp = new THREE.Vector3();
    this.ironPos = new THREE.Vector3(); this.smokeAcc = 0; this.glintAcc = 0;

    this._collect();
    this._buildFx();
    this._buildUi();
    this._active = true;
    this._measure();
    this._layout(true);
    this._fitShadows();

    dom.addEventListener('pointerdown', this._down, true);       // capture: runs before OrbitControls' own handler
    dom.addEventListener('pointermove', this._move);
    dom.addEventListener('pointerup', this._up);
    dom.addEventListener('pointercancel', this._up);
    dom.addEventListener('pointerleave', this._leave);
    dom.addEventListener('contextmenu', this._menu, true);
    window.addEventListener('keydown', this._key);
    c.addEventListener('start', this._camStart);
    v.on('tick', this._tick);
    this.ro = new ResizeObserver(() => this._resized()); this.ro.observe(v.el); this.ro.observe(this.ui.panel);
    const link = ensureCss();
    if (!link.sheet) link.addEventListener('load', this._cssLoaded = () => this._resized(true), { once: true });

    v.env?.setMode?.('assembly');
    this._flyCamera(opts.instant ? 0 : 1200);
    this._takeApart(!!opts.instant);
    this._refresh();
    this._emit('start', { total: this.pieces.length });
    v.dirty = true;
    return this;
  }

  /** Leave assembly mode and put the board back exactly as it was. Safe to call at any time. */
  stop() {
    if (!this._active) return;
    this._active = false;
    const v = this.viewer, s = this.saved, dom = this.dom, c = v.controls;
    dom.removeEventListener('pointerdown', this._down, true);
    dom.removeEventListener('pointermove', this._move);
    dom.removeEventListener('pointerup', this._up);
    dom.removeEventListener('pointercancel', this._up);
    dom.removeEventListener('pointerleave', this._leave);
    dom.removeEventListener('contextmenu', this._menu, true);
    window.removeEventListener('keydown', this._key);
    c.removeEventListener('start', this._camStart);
    const th = v.handlers?.tick, ti = th ? th.indexOf(this._tick) : -1; if (ti >= 0) th.splice(ti, 1);
    this.ro?.disconnect(); this.ro = null;
    if (this._cssLoaded) document.querySelector('link[data-asm-css]')?.removeEventListener('load', this._cssLoaded);
    if (this.ptrId != null) { try { dom.releasePointerCapture(this.ptrId); } catch {} }
    clearTimeout(this.toastTimer);

    // parts: original materials, parents, order and transforms
    for (const ph of this.phys) {
      this._ghost(ph, false);
      for (const r of ph.riders) { r.parent.attach(r.obj); r.obj.position.copy(r.pos); r.obj.quaternion.copy(r.quat); r.obj.scale.copy(r.scale); }
      ph.obj.position.copy(ph.origPos); ph.obj.quaternion.copy(ph.origQuat); ph.obj.scale.copy(ph.origScale);
    }
    const rank = new Map(s.children.map((o, i) => [o, i]));
    this.root.children.sort((a, b) => (rank.get(a) ?? 1e6) - (rank.get(b) ?? 1e6));
    for (const g of this.glows) { g.s.visible = g.visible; g.s.scale.copy(g.scale); }
    for (const m of this.ghosts.values()) m.dispose();
    this.ghosts.clear();
    this.root.updateMatrixWorld(true);

    // everything this mode created
    v.scene.remove(this.fx);
    this.fx.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.own.forEach((x) => x.dispose());
    this.foot.dispose(); this.nextMark.dispose();
    this.ui.root.remove();

    // viewer state
    const same = v.board === this.built;                         // false → the board was swapped: the viewer has already refitted lights / limits
    v.locked = s.locked; v.autoRotate = s.autoRotate; c.enabled = s.enabled; c.maxPolarAngle = s.maxPolar;
    dom.style.cursor = s.cursor; v.el.style.position = s.elPos;
    if (same) { c.maxDistance = s.maxDist; const sc = v.key.shadow.camera; [sc.left, sc.right, sc.top, sc.bottom, sc.far] = s.shadow; sc.updateProjectionMatrix(); }
    Object.assign(v.frame, s.frame); v._applyFrame?.();
    v.env?.setMode?.('showcase');
    if (same && v._viewPose) v._goto(v._viewPose(v.viewName), 700);
    v.dirty = true;
    this.pieces = []; this.phys = []; this.carried = null; this.hold = null; this.timers = [];
    this._emit('stop');
  }

  /** Put every part back on the tray and start again. */
  restart() {
    if (!this._active) return;
    this._drop(); this.timers.length = 0; this.hold = null; this.fake = null;
    for (const p of this.pieces) { p.state = 'tray'; this._ghost(p.ph, false); }
    for (const g of this.glows) g.s.visible = false;
    this.powerGlow.visible = false; this.glowK = -1; this.trayG.visible = true; if (this.foam) this.foam.visible = true;
    this.ui.done.hidden = true; this.ui.root.classList.remove('asm-finished');
    this.timing = false; this.seconds = 0; this.shownSec = -1; this.hints = 0; this.misses = 0; this.lastPiece = null; this.flashPiece = null; this.camTouched = false;
    this.iron.visible = false; this._ring(null);
    for (const s of this.smoke) { s.life = 0; s.s.visible = false; }
    this.phase = 'intro'; this._measure();
    this._flyCamera(900);
    this._takeApart(false);
    this._refresh();
  }

  setChallenge(on) { this.challenge = !!on; this.flashUntil = 0; if (this._active) { this._refresh(); this.viewer.dirty = true; } }

  // ───────────────────────── kit ─────────────────────────
  _collect() {
    const { built, root, def } = this, kit = KITS[def.id] || {};
    root.updateMatrixWorld(true);
    this.topY = root.getWorldPosition(_a).y;                     // PCB top surface (board-local y = 0)
    this.boardX = _a.x; this.boardZ = _a.z;
    this.boardBox = localBox([root], this.viewer.scene);          // assembled board, world space (plus the foam pad under it)
    const bb = this.boardBox, hw = built.w / 2 + FOAM, hh = built.h / 2 + FOAM;
    bb.min.x = Math.min(bb.min.x, this.boardX - hw); bb.max.x = Math.max(bb.max.x, this.boardX + hw);
    bb.min.z = Math.min(bb.min.z, this.boardZ - hh); bb.max.z = Math.max(bb.max.z, this.boardZ + hh);
    const skip = new Set(kit.skip || []), ride = kit.ride || {}, names = kit.names || {}, order = kit.order || [];
    const list = [], riders = [];
    for (const id of Object.keys(built.parts)) {
      built.parts[id].objects.forEach((obj, i) => {
        if (!obj || !obj.parent || obj.userData.place?.side === 'bottom') return;
        const key = id + ':' + (obj.name || '');
        if (skip.has(id) || skip.has(key)) return;
        const to = ride[key] || ride[id];
        if (to) riders.push({ obj, to }); else list.push({ id, i, obj });
      });
    }
    this.phys = list.map(({ id, i, obj }) => {
      const ph = {
        id, i, obj, riders: [], lbox: localBox([obj], obj), origPos: obj.position.clone(), origQuat: obj.quaternion.clone(), origScale: obj.scale.clone(),
        pos: obj.getWorldPosition(new THREE.Vector3()), quat: obj.getWorldQuaternion(new THREE.Quaternion()), queue: [], wbox: new THREE.Box3(),
        tray: { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), x: 0, z: 0, w: 0, d: 0 }, ghost: false,
      };
      return ph;
    });
    for (const r of riders) {
      const host = this.phys.find((ph) => ph.id === r.to); if (!host) continue;
      host.lbox.union(localBox([r.obj], host.obj));
      host.riders.push({ obj: r.obj, parent: r.obj.parent, pos: r.obj.position.clone(), quat: r.obj.quaternion.clone(), scale: r.obj.scale.clone() });
      host.obj.attach(r.obj);
    }
    const count = {}; for (const ph of this.phys) count[ph.id] = (count[ph.id] || 0) + 1;
    const seen = {};
    const rank = (ph) => { const k = order.indexOf(ph.id); return k < 0 ? 1000 + ph.lbox.max.y : k; };
    this.pieces = this.phys.slice().sort((a, b) => rank(a) - rank(b) || a.i - b.i).map((ph) => {
      const info = def.parts?.[ph.id] || {}, base = info.name || ph.id, n = (seen[ph.id] = (seen[ph.id] || 0) + 1);
      const label = names[ph.id]?.[ph.i] || (count[ph.id] > 1 ? `${base} (${n} of ${count[ph.id]})` : base);
      const sz = ph.lbox.getSize(_a), ctr = ph.lbox.getCenter(_b);
      const off = new THREE.Vector3(ctr.x, 0, ctr.z).applyQuaternion(ph.quat);
      const ax = _c.copy(XAX).applyQuaternion(ph.quat);
      const mats = []; ph.obj.traverse((o) => { if (o.isMesh) mats.push(o.material.uuid); });
      const home = {
        pos: ph.pos.clone(), quat: ph.quat.clone(), off, hx: sz.x / 2, hz: sz.z / 2, yaw: Math.atan2(-ax.z, ax.x),
        c: new THREE.Vector3(ph.pos.x + off.x, this.topY, ph.pos.z + off.z),
      };
      const piece = { id: ph.id, label, text: firstSentence(info.text), home, ph, state: 'tray', row: null, shake: 0,
        grp: [ph.id, ph.obj.name, sz.x.toFixed(2), sz.y.toFixed(2), sz.z.toFixed(2), mats.join()].join('|') };
      ph.piece = piece;
      return piece;
    });
    // the board is unpowered while it is in pieces: every LED glow goes dark
    this.glows = [];
    root.traverse((o) => { if (o.isSprite && o.userData.glow) { this.glows.push({ s: o, visible: o.visible, scale: o.scale.clone() }); o.visible = false; } });
    this.ghosts = new Map();
  }

  _swap(a, b) { const t = a.ph; a.ph = b.ph; b.ph = t; a.ph.piece = a; b.ph.piece = b; }
  _next() { return this.pieces.find((p) => p.state === 'tray') || null; }
  _apply(ph) {
    const o = ph.obj;
    o.position.copy(ph.pos); if (o.parent) o.parent.worldToLocal(o.position);
    o.quaternion.copy(ph.quat);                                  // the board group and its holder are never rotated
  }
  _rest(ph) { ph.queue.length = 0; this._apply(ph); poseBox(ph.lbox, ph.pos, ph.quat, ph.wbox); }
  /** Semi-transparent look for the carried part (materials are shared and cached, so swap in clones). */
  _ghost(ph, on) {
    if (ph.ghost === on) return; ph.ghost = on;
    ph.obj.traverse((o) => {
      if (!o.isMesh) return;
      if (on) {
        o.userData.asmMat = o.material;
        let g = this.ghosts.get(o.material);
        if (!g) { g = o.material.clone(); g.transparent = true; g.opacity = (o.material.opacity ?? 1) * 0.8; g.depthWrite = true; this.ghosts.set(o.material, g); }
        o.material = g;
      } else if (o.userData.asmMat) { o.material = o.userData.asmMat; delete o.userData.asmMat; }
    });
  }
  _tween(ph, pos, quat, o = {}) {
    ph.queue.push({ pos, quat, dur: o.dur ?? 0.5, wait: o.wait ?? 0, arc: o.arc ?? 0, ease: o.ease || easeIO, done: o.done, on: false, t: 0, p0: new THREE.Vector3(), q0: new THREE.Quaternion() });
  }
  _stepTween(ph, dt) {
    const a = ph.queue[0];
    if (!a.on) { a.wait -= dt; if (a.wait > 0) return; a.on = true; a.p0.copy(ph.pos); a.q0.copy(ph.quat); }
    a.t += dt;
    const k = Math.min(1, a.t / a.dur), e = a.ease(k);
    ph.pos.lerpVectors(a.p0, a.pos, e); ph.pos.y += a.arc * Math.sin(Math.PI * k);
    ph.quat.slerpQuaternions(a.q0, a.quat, Math.min(1, Math.max(0, e)));
    this._apply(ph);
    if (k >= 1) { ph.queue.shift(); poseBox(ph.lbox, ph.pos, ph.quat, ph.wbox); a.done?.(); }
  }
  _after(sec, fn) { this.timers.push({ at: this.clock + sec, fn }); }

  // ───────────────────────── tray layout + camera ─────────────────────────
  _measure() {
    const v = this.viewer, er = v.el.getBoundingClientRect(), pr = this.ui.panel.getBoundingClientRect();
    this.compact = er.width < 820;
    this.ui.root.classList.toggle('asm-compact', this.compact);
    const f = this.compact
      ? { top: 0, left: 0, right: 0, bottom: clamp(Math.round(er.bottom - pr.top), 0, er.height * 0.6) }
      : { top: 0, left: 0, bottom: 0, right: clamp(Math.round(er.right - pr.left), 0, er.width * 0.6) };
    this.ui.root.style.setProperty('--asm-r', f.right + 'px'); this.ui.root.style.setProperty('--asm-b', f.bottom + 'px');
    if (this.phase === 'done') f.bottom = Math.min(er.height * 0.62, f.bottom + (this.ui.done.offsetHeight || 150) + 40);   // keep the board clear of the finish card
    Object.assign(v.frame, f); v._applyFrame?.(); v.dirty = true;
    this.aspect = Math.max(60, v.W - f.left - f.right) / Math.max(60, v.H - f.top - f.bottom);
  }
  _resized(force) {
    if (!this._active) return;
    const v = this.viewer, was = this.compact, a0 = this.aspect, r0 = v.frame.right, b0 = v.frame.bottom;
    this._measure();
    if (this.phase === 'done') { if (Math.abs(r0 - v.frame.right) + Math.abs(b0 - v.frame.bottom) > 10) v._goto(this._pose(this.boardBox, ISO_DIR), 350); return; }
    if (force || was !== this.compact || Math.abs(a0 - this.aspect) > 0.25) {
      this._layout(false);
      if (!this.camTouched) this._flyCamera(this.clock < 1.2 ? 0 : 500);
    }
  }
  /** Rows of slots in front of the board, tallest parts nearest the board, never overlapping. */
  _layout(first) {
    const bb = this.boardBox, bw = bb.max.x - bb.min.x, bd = bb.max.z - bb.min.z;
    for (const ph of this.phys) {
      const sz = ph.lbox.getSize(_a), t = ph.tray;
      t.quat.identity();
      if (sz.z > sz.x + 1e-3) t.quat.setFromAxisAngle(UP, Math.PI / 2);                         // long side along the row
      if (-ph.lbox.min.y > 2 * ph.lbox.max.y) t.quat.premultiply(_q.setFromAxisAngle(XAX, Math.PI));   // pins-down strips lie on their plastic, pins up
      poseBox(ph.lbox, _a.set(0, 0, 0), t.quat, _bx);
      t.w = _bx.max.x - _bx.min.x; t.d = _bx.max.z - _bx.min.z; t.h = _bx.max.y - _bx.min.y;
      t.ox = (_bx.max.x + _bx.min.x) / 2; t.oz = (_bx.max.z + _bx.min.z) / 2; t.oy = _bx.min.y;
      t.sw = Math.max(t.w + SLOT_PAD, SLOT_MIN); t.sd = Math.max(t.d + SLOT_PAD, SLOT_MIN);
    }
    // big → small: tall parts first (they end up in the back rows, where they cannot hide anything), then by footprint
    const tier = (ph) => (ph.tray.h > 9 ? 3 : ph.tray.h > 3 ? 2 : ph.tray.h > 1.2 ? 1 : 0);
    const sorted = this.phys.slice().sort((a, b) => tier(b) - tier(a) || Math.round(b.tray.d) - Math.round(a.tray.d) || b.tray.w * b.tray.d - a.tray.w * a.tray.d || a.i - b.i);
    const pack = (maxW) => {
      const rows = []; let row = null;
      for (const ph of sorted) {
        if (!row || row.w + ph.tray.sw > maxW) rows.push(row = { w: 0, d: 0, items: [] });
        row.items.push(ph); row.w += ph.tray.sw; row.d = Math.max(row.d, ph.tray.sd);
      }
      return { rows, w: Math.max(...rows.map((r) => r.w)), d: rows.reduce((s, r) => s + r.d, 0) };
    };
    const widest = Math.max(...sorted.map((ph) => ph.tray.sw), 20);
    let best = null, bestS = Infinity;
    for (let w = Math.max(widest, bw * 0.7); w <= Math.max(widest, bw * 2.6); w += 2) {
      const p = pack(w + 0.01), S = Math.max(Math.max(bw, p.w + 10) / this.aspect, (bd + TRAY_GAP + p.d + 10) * 0.82) + p.rows.length * 0.02;
      if (S < bestS - 1e-6) { bestS = S; best = p; }
    }
    const cx = (bb.min.x + bb.max.x) / 2, z0 = bb.max.z + TRAY_GAP;
    let z = z0, maxH = 0;
    for (const row of best.rows) {
      let x = cx - row.w / 2;
      for (const ph of row.items) {
        const t = ph.tray; t.x = x + t.sw / 2; t.z = z + row.d / 2;
        t.pos.set(t.x - t.ox, 0.06 - t.oy, t.z - t.oz);
        maxH = Math.max(maxH, t.h); x += t.sw;
      }
      z += row.d;
    }
    const m = 5;
    this.trayBox = new THREE.Box3(new THREE.Vector3(cx - best.w / 2 - m, 0, z0 - m), new THREE.Vector3(cx + best.w / 2 + m, maxH, z + m));
    this.allBox = this.boardBox.clone().union(this.trayBox);
    this._buildTray();
    if (!first) for (const ph of this.phys) if (ph.piece.state === 'tray' && !ph.queue.length) { ph.pos.copy(ph.tray.pos); ph.quat.copy(ph.tray.quat); this._rest(ph); }
    this.viewer.dirty = true;
  }
  _buildTray() {
    const g = this.trayG, tb = this.trayBox, w = tb.max.x - tb.min.x, d = tb.max.z - tb.min.z;
    for (const o of g.children.slice()) { g.remove(o); o.geometry.dispose(); }
    const flat = new THREE.ShapeGeometry(rrShape(w, d, 5), 10); flat.rotateX(-Math.PI / 2);
    const mat = new THREE.Mesh(flat, this.trayMat); mat.receiveShadow = true; mat.position.y = 0.04;
    const lip = rrShape(w + 2.4, d + 2.4, 6.2); lip.holes.push(rrShape(w, d, 5));
    const lg = new THREE.ExtrudeGeometry(lip, { depth: 1.5, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3, bevelSegments: 2, curveSegments: 10 }); lg.rotateX(-Math.PI / 2);
    const rim = new THREE.Mesh(lg, this.rimMat); rim.castShadow = rim.receiveShadow = true; rim.position.y = 0.3;
    g.add(mat, rim);
    g.position.set((tb.min.x + tb.max.x) / 2, 0, (tb.min.z + tb.max.z) / 2);
  }
  /** Camera pose that frames a world box (board + tray by default) inside the free part of the canvas. */
  _pose(bx = this.allBox, dir = CAM_DIR) {
    const v = this.viewer, f = v.frame, cam = v.camera;
    const target = new THREE.Vector3((bx.min.x + bx.max.x) / 2, 1, (bx.min.z + bx.max.z) / 2);
    const fw = Math.max(60, v.W - f.left - f.right), fh = Math.max(60, v.H - f.top - f.bottom);
    const tanV = Math.tan(cam.fov * Math.PI / 360), lx = tanV * (v.W / v.H) * (fw / v.W) * 0.93, ly = tanV * (fh / v.H) * 0.9;
    const fwd = _a.copy(dir).negate(), right = _b.crossVectors(fwd, UP).normalize(), up = _c.crossVectors(right, fwd);
    const fits = (dist) => {
      for (let i = 0; i < 8; i++) {
        _t.set(i & 1 ? bx.max.x : bx.min.x, i & 2 ? bx.max.y : bx.min.y, i & 4 ? bx.max.z : bx.min.z).sub(target).addScaledVector(dir, -dist);
        const zc = _t.dot(fwd); if (zc <= 1 || Math.abs(_t.dot(right)) > zc * lx || Math.abs(_t.dot(up)) > zc * ly) return false;
      }
      return true;
    };
    let lo = 10, hi = 6000;
    for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    return { target, pos: target.clone().addScaledVector(dir, hi) };
  }
  _flyCamera(ms) {
    const v = this.viewer, pose = this._pose();
    this.maxDist = v.controls.maxDistance = Math.max(this.saved.maxDist, pose.pos.distanceTo(pose.target) * 1.8);
    v._goto(pose, ms);
  }
  _fitShadows() {
    const v = this.viewer, sc = v.key.shadow.camera, bx = this.allBox;
    const e = Math.max(Math.hypot(bx.min.x, bx.max.z), Math.hypot(bx.max.x, bx.max.z), Math.hypot(bx.min.x, bx.min.z), Math.hypot(bx.max.x, bx.min.z)) * 1.12;
    this.shadowE = e;
    if (e > sc.right) { sc.left = sc.bottom = -e; sc.right = sc.top = e; sc.far = Math.max(sc.far, e * 6); sc.updateProjectionMatrix(); }
  }

  // ───────────────────────── take-apart ─────────────────────────
  _takeApart(instant) {
    this.phase = 'intro'; this.timing = false;
    const moving = this.phys.filter((ph) => ph.pos.distanceToSquared(ph.tray.pos) > 1e-4 || ph.queue.length);
    const begin = () => { if (!this._active) return; this.phase = 'play'; this.timing = true; this.t0 = performance.now(); this._refresh(); this._progress(); };
    if (instant || !moving.length) {
      for (const ph of this.phys) { ph.pos.copy(ph.tray.pos); ph.quat.copy(ph.tray.quat); this._rest(ph); }
      begin(); return;
    }
    const n = moving.length, ls = Math.min(0.05, 0.8 / n), gs = Math.min(0.07, 1.1 / n), T1 = n * ls + 0.55 + 0.3;
    const byX = moving.slice().sort((a, b) => a.pos.x - b.pos.x || a.pos.z - b.pos.z);
    const slot = new Map(this.phys.slice().sort((a, b) => a.tray.z - b.tray.z || a.tray.x - b.tray.x).map((ph, j) => [ph, j]));
    let last = 0;
    const order = moving.slice().sort((a, b) => slot.get(a) - slot.get(b));
    byX.forEach((ph, i) => {
      ph.queue.length = 0;
      const up = ph.pos.clone(); up.y = Math.max(up.y, this.topY) + 11 + Math.min(6, ph.tray.h * 0.3);
      this._tween(ph, up, ph.quat.clone(), { wait: i * ls, dur: 0.55, ease: easeOut });
      const k = order.indexOf(ph), wait = T1 - (i * ls + 0.55) + k * gs;
      this._tween(ph, ph.tray.pos, ph.tray.quat, { wait, dur: 0.95, arc: 14 });
      last = Math.max(last, T1 + k * gs + 0.95);
    });
    this._after(last + 0.15, begin);
  }

  // ───────────────────────── 3D helpers ─────────────────────────
  _buildFx() {
    const v = this.viewer, fx = this.fx = new THREE.Group(); fx.name = 'assembly-fx';
    const own = this.own = [];
    const keep = (x) => { own.push(x); return x; };
    this.trayG = new THREE.Group(); this.trayG.name = 'parts-tray'; fx.add(this.trayG);
    this.trayMat = keep(new THREE.MeshStandardMaterial({ color: 0xdcdad3, roughness: 0.95 }));
    this.rimMat = keep(new THREE.MeshStandardMaterial({ color: 0xc9c5ba, roughness: 0.8 }));

    // anti-static foam under the PCB: once the headers are gone the bare board would otherwise hang in the air
    const gapY = this.topY - (this.built.t || 1.6);
    this.foam = null;
    if (gapY > 0.6) {
      const fg = new THREE.ExtrudeGeometry(rrShape(this.built.w + 2 * FOAM, this.built.h + 2 * FOAM, 3.5), { depth: gapY - 0.42, bevelEnabled: true, bevelSize: 0.2, bevelThickness: 0.2, bevelSegments: 2, curveSegments: 8 });
      fg.rotateX(-Math.PI / 2);
      const foam = this.foam = new THREE.Mesh(fg, keep(new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 1 })));
      foam.name = 'work-foam'; foam.position.set(this.boardX, 0.2, this.boardZ); foam.castShadow = foam.receiveShadow = true; fx.add(foam);
    }

    this.foot = new Marker(0.3, 1); this.nextMark = new Marker(0.12, 0.85); fx.add(this.foot.group, this.nextMark.group);
    const basic = (opacity) => keep(new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity, depthWrite: false, toneMapped: false }));
    const hov = new THREE.PlaneGeometry(1, 1); hov.rotateX(-Math.PI / 2);
    this.hoverMark = new THREE.Mesh(hov, basic(0.16)); this.hoverMark.visible = false; this.hoverMark.renderOrder = 3; fx.add(this.hoverMark);
    const lg = new THREE.CylinderGeometry(0.16, 0.16, 1, 8); lg.translate(0, 0.5, 0);
    this.guide = new THREE.Mesh(lg, basic(0.5)); this.guide.visible = false; fx.add(this.guide);
    const rg = new THREE.RingGeometry(1.0, 1.45, 28); rg.rotateX(-Math.PI / 2);
    this.land = new THREE.Mesh(rg, basic(0.85)); this.land.visible = false; this.land.renderOrder = 4; fx.add(this.land);

    // soldering iron
    const tipMat = keep(new THREE.MeshStandardMaterial({ color: 0xd9d4c8, roughness: 0.26, metalness: 1, emissive: 0xff4a12, emissiveIntensity: 0.3 }));
    const iron = this.iron = new THREE.Group(); iron.name = 'iron';
    const body = buildIron(tipMat); iron.add(body);
    this.ironScale = clamp((v.radius || 45) / 62, 0.5, 0.86); iron.scale.setScalar(this.ironScale);
    const hot = glowSprite('#ff7a2b', 9); hot.position.set(0, 5, 0); iron.add(hot);
    iron.visible = false; fx.add(iron);

    // smoke + glints (pooled sprites)
    const smokeTex = keep(softTex((g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(250,250,252,0.92)'); gr.addColorStop(0.32, 'rgba(226,231,240,0.6)'); gr.addColorStop(0.68, 'rgba(150,160,180,0.26)'); gr.addColorStop(1, 'rgba(140,150,172,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }));
    this.smoke = Array.from({ length: 16 }, () => {
      const s = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0, depthWrite: false })));
      s.visible = false; s.renderOrder = 6; fx.add(s);
      return { s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 3 };
    });
    const glintTex = keep(softTex((g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.16, 'rgba(255,236,190,0.85)'); gr.addColorStop(0.5, 'rgba(255,170,80,0.18)'); gr.addColorStop(1, 'rgba(255,150,60,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(4, 32); g.lineTo(60, 32); g.moveTo(32, 4); g.lineTo(32, 60); g.stroke();
    }));
    this.glints = Array.from({ length: 8 }, () => {
      const s = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glintTex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })));
      s.visible = false; s.renderOrder = 7; fx.add(s);
      return { s, life: 0, max: 0.2, size: 2 };
    });

    // power-on glow at the board's power LED
    const kit = KITS[this.def.id] || {};
    const led = this.pieces.find((p) => p.id === kit.power) || this.pieces.find((p) => p.id.startsWith('led') && this.glows.some((g) => this._under(g.s, p.ph.obj)))
      || this.pieces.find((p) => p.id.startsWith('led'));
    let src = led && this.glows.find((g) => this._under(g.s, led.ph.obj));
    const pg = this.powerGlow = src ? new THREE.Sprite(src.s.material) : glowSprite('#3ee07a', 6);
    this.powerSize = src ? src.scale.x * 1.9 : 7;
    if (led) { pg.position.copy(led.home.c); pg.position.y += led.ph.lbox.max.y + 1.2; } else pg.position.set(this.boardX, this.topY + 2, this.boardZ);
    pg.visible = false; pg.renderOrder = 8; fx.add(pg);

    this.planeTop = new THREE.Plane(UP, -this.topY); this.planeGround = new THREE.Plane(UP, 0);
    v.scene.add(fx);
  }
  _under(o, root) { for (let p = o; p; p = p.parent) if (p === root) return true; return false; }

  _inFoot(h, p, tol) {
    const dx = p.x - h.c.x, dz = p.z - h.c.z, cs = Math.cos(h.yaw), sn = Math.sin(h.yaw);
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    return Math.abs(lx) <= h.hx + tol && Math.abs(lz) <= h.hz + tol ? Math.hypot(lx, lz) : Infinity;
  }
  /** Closest point of a footprint outline to p (world), written to out. */
  _edge(h, p, out) {
    const dx = p.x - h.c.x, dz = p.z - h.c.z, cs = Math.cos(h.yaw), sn = Math.sin(h.yaw);
    let lx = clamp(dx * cs - dz * sn, -h.hx, h.hx), lz = clamp(dx * sn + dz * cs, -h.hz, h.hz);
    const ex = h.hx - Math.abs(lx), ez = h.hz - Math.abs(lz);
    if (ex > 0 && ez > 0) { if (ex < ez) lx = Math.sign(lx || 1) * h.hx; else lz = Math.sign(lz || 1) * h.hz; }
    return out.set(h.c.x + lx * cs + lz * sn, h.c.y, h.c.z - lx * sn + lz * cs);
  }
  /** Point on the footprint outline, u in 0..1 around the perimeter. */
  _perim(h, u, out) {
    const P = 4 * (h.hx + h.hz); let s = ((u % 1) + 1) % 1 * P, lx, lz;
    if (s < 2 * h.hx) { lx = -h.hx + s; lz = -h.hz; }
    else if ((s -= 2 * h.hx) < 2 * h.hz) { lx = h.hx; lz = -h.hz + s; }
    else if ((s -= 2 * h.hz) < 2 * h.hx) { lx = h.hx - s; lz = h.hz; }
    else { s -= 2 * h.hx; lx = -h.hx; lz = h.hz - s; }
    const cs = Math.cos(h.yaw), sn = Math.sin(h.yaw);
    return out.set(h.c.x + lx * cs + lz * sn, h.c.y, h.c.z - lx * sn + lz * cs);
  }
  _onBoard(p, m = 0) {
    const b = this.built;
    return Math.abs(p.x - this.boardX) <= b.w / 2 + m && Math.abs(p.z - this.boardZ) <= b.h / 2 + m;
  }
  _onTray(p, m = 0) { const t = this.trayBox; return p.x >= t.min.x - m && p.x <= t.max.x + m && p.z >= t.min.z - m && p.z <= t.max.z + m; }
  _trayHit() {
    if (!this.rayOk) return null;
    let best = null, bd = Infinity;
    for (const p of this.pieces) {
      if (p.state !== 'tray') continue;
      _bx.copy(p.ph.wbox).expandByScalar(1.2);
      const hit = this.ray.ray.intersectBox(_bx, _t);
      if (hit) { const d = hit.distanceToSquared(this.ray.ray.origin); if (d < bd) { bd = d; best = p; } }
    }
    if (best || !this.gpOk) return best;
    for (const p of this.pieces) {
      const t = p.ph.tray;
      if (p.state === 'tray' && !p.ph.queue.length && Math.abs(this.gp.x - t.x) <= t.sw / 2 && Math.abs(this.gp.z - t.z) <= t.sd / 2) return p;
    }
    return null;
  }
  _tackedHit() {
    let best = null, bd = Infinity;
    if (this.rayOk) for (const p of this.pieces) {
      if (p.state !== 'tacked') continue;
      _bx.copy(p.ph.wbox).expandByScalar(1.4);
      const hit = this.ray.ray.intersectBox(_bx, _t);
      if (hit) { const d = hit.distanceToSquared(this.ray.ray.origin); if (d < bd) { bd = d; best = p; } }
    }
    if (best || !this.bpOk) return best;
    for (const p of this.pieces) if (p.state === 'tacked') { const d = this._inFoot(p.home, this.bp, 2.4); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  // ───────────────────────── pointer ─────────────────────────
  _setPtr(e) {
    const r = this.dom.getBoundingClientRect();
    this.ptrPx.x = e.clientX - r.left; this.ptrPx.y = e.clientY - r.top;
    this.ndc.set((this.ptrPx.x / r.width) * 2 - 1, -(this.ptrPx.y / r.height) * 2 + 1);
    this.ptrIn = true;
  }
  _cast() {
    if (this.fake) { this.bp.copy(this.fake); this.bpOk = true; this.rayOk = this.gpOk = false; return; }
    this.rayOk = this.bpOk = this.gpOk = false;
    if (!this.ptrIn) return;
    this.ray.setFromCamera(this.ndc, this.viewer.camera);
    const r = this.ray.ray; this.rayOk = true;
    this.bpOk = !!r.intersectPlane(this.planeTop, this.bp) && this.bp.distanceToSquared(r.origin) < 4e7;
    this.gpOk = !!r.intersectPlane(this.planeGround, this.gp) && this.gp.distanceToSquared(r.origin) < 4e7;
  }
  _down(e) {
    if (!this._active || this.phase !== 'play' || e.button !== 0 || this.ptrId != null) return;
    this.fake = null;
    this._setPtr(e); this._cast();
    let g = null;
    if (this.carried) g = { type: 'drop' };
    else {
      const tp = this._trayHit();
      if (tp) { this._pick(tp); g = { type: 'pick' }; }
      else { const sp = this._tackedHit(); if (sp) { g = { type: 'hold' }; this.hold = { piece: sp, t: 0 }; } }
    }
    if (!g) return;                                              // empty space: OrbitControls orbit as usual
    g.x = e.clientX; g.y = e.clientY; this.gesture = g; this.ptrId = e.pointerId;
    this.viewer.controls.enabled = false;                         // our drag / hold must not orbit
    try { this.dom.setPointerCapture(e.pointerId); } catch {}
    this.viewer.dirty = true;
  }
  _move(e) {
    if (!this._active) return;
    if (this.ptrId != null && e.pointerId !== this.ptrId) return;
    this.fake = null;
    this._setPtr(e);
    if (this.carried || this.hold || this.iron.visible || this.anyTacked) this.viewer.dirty = true;
  }
  _up(e) {
    if (!this._active || this.ptrId == null || e.pointerId !== this.ptrId) return;
    const g = this.gesture; this.gesture = null; this.ptrId = null;
    try { this.dom.releasePointerCapture(e.pointerId); } catch {}
    this.viewer.controls.enabled = true;
    if (e.type === 'pointercancel') { this.hold = null; this._ring(null); return; }
    this._setPtr(e); this._cast();
    if (g.type === 'drop') this._tryDrop(false);
    else if (g.type === 'pick') { if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 24) this._tryDrop(true); }
    else if (g.type === 'hold') { this.hold = null; this._ring(null); }
    if (e.pointerType !== 'mouse') this.ptrIn = false;            // touch: no hover after the finger lifts
    this.viewer.dirty = true;
  }
  _leave() { if (this.ptrId == null) { this.ptrIn = false; if (this._active) this.viewer.dirty = true; } }
  _menu(e) { if (this.carried) { e.preventDefault(); e.stopPropagation(); this._return(this.carried); } }
  _key(e) {
    if (!this._active || e.defaultPrevented) return;
    if (e.key === 'Escape' && this.carried) { this._return(this.carried); e.preventDefault(); }
  }
  _camStart() { this.camTouched = true; }

  // ───────────────────────── pick / place / solder ─────────────────────────
  _pick(piece) {
    if (this.phase !== 'play' || piece.state !== 'tray') return false;
    if (this.carried) this._return(this.carried);
    piece.ph.queue.length = 0;
    this._ghost(piece.ph, true);
    piece.state = 'carried'; piece.shake = 0; this.carried = this.lastPiece = piece;
    this.hold = null; this.flashUntil = 0; this._setHover(null);
    this._refresh();
    return true;
  }
  /** Carried part goes back to its tray slot. */
  _return(piece) {
    if (this.carried === piece) this.carried = null;
    this._ghost(piece.ph, false);
    piece.state = 'tray';
    piece.ph.queue.length = 0;
    this._tween(piece.ph, piece.ph.tray.pos, piece.ph.tray.quat, { dur: 0.42, arc: 5 });
    this.guide.visible = this.land.visible = false;
    this._refresh();
  }
  _drop() { if (this.carried) { const p = this.carried; this.carried = null; this._ghost(p.ph, false); p.state = 'tray'; this.guide.visible = this.land.visible = false; } }
  _tryDrop(dragged) {
    const c = this.carried; if (!c) return;
    if (!this.bpOk) return;
    const p = this.bp;
    let target = null, best = Infinity;
    for (const q of this.pieces) {
      if (q !== c && !(q.grp === c.grp && q.state === 'tray')) continue;       // identical siblings are interchangeable
      const d = this._inFoot(q.home, p, TOL); if (d < best) { best = d; target = q; }
    }
    if (!target && c.snap) target = c;
    if (target) {
      if (target !== c) { this._swap(c, target); c.state = 'tray'; target.state = 'carried'; this.carried = this.lastPiece = target; }
      this._place(target); return;
    }
    if (this.gpOk && this._onTray(this.gp, 3) && !this._onBoard(p, 2)) { this._return(c); return; }
    if (!this._onBoard(p, 8)) { if (!dragged) this._toast('Carry it over the board and click its footprint.'); return; }
    let other = null; best = Infinity;
    for (const q of this.pieces) if (q !== c && q.state === 'tray') { const d = this._inFoot(q.home, p, 0.8); if (d < best) { best = d; other = q; } }
    this.misses++; c.shake = 0.4;
    this._toast(other ? `Not there — that spot is for the ${other.label}.` : this.challenge ? `Not there — the ${c.label} goes somewhere else. Try Hint.` : 'Not quite — aim for the pulsing outline.', true);
  }
  _place(piece) {
    const ph = piece.ph, h = piece.home;
    this.carried = null; this._ghost(ph, false);
    piece.state = 'flying'; ph.queue.length = 0;
    this.guide.visible = this.land.visible = false;
    this._tween(ph, _a.copy(h.pos).setY(h.pos.y + PROUD).clone(), h.quat, { dur: 0.3, ease: easeBack, done: () => { if (piece.state !== 'flying') return; piece.state = 'tacked'; this._refresh(); this._progress(); } });
    this._refresh();
  }
  _soldered(piece) {
    const ph = piece.ph, h = piece.home;
    piece.state = 'soldered'; this.lastPiece = piece; ph.queue.length = 0;
    this._tween(ph, h.pos, h.quat, { dur: 0.16, ease: easeOut });
    for (let i = 0; i < 6; i++) { this._perim(h, (i + Math.random() * 0.6) / 6, _t); this._glint(_t.x, _t.y + 0.3, _t.z, 2.2 + Math.random() * 1.6, 0.4 + Math.random() * 0.2); }
    this._refresh(); this._progress();
    if (this.pieces.every((p) => p.state === 'soldered')) this._after(0.45, () => this._finish(false));
  }
  /** "Auto-place next": fly the carried / next part to its footprint and solder it. */
  auto() {
    if (!this._active || this.phase !== 'play') return;
    let p = this.carried;
    if (p) { this.carried = null; this._ghost(p.ph, false); this.guide.visible = this.land.visible = false; }
    else p = this.pieces.find((q) => q.state === 'tacked') || this._next();
    if (!p) return;
    this.lastPiece = p;
    const solder = () => {
      if (p.state !== 'tacked' && p.state !== 'flying') return;
      p.state = 'soldering';
      for (let i = 0; i < 4; i++) { this._perim(p.home, Math.random(), _t); this._puff(_t.x, _t.y + 0.5, _t.z); }
      this._after(0.32, () => { if (p.state === 'soldering') this._soldered(p); });
      this._refresh();
    };
    if (p.state === 'tacked') { solder(); return; }
    p.state = 'flying'; p.ph.queue.length = 0;
    this._tween(p.ph, _a.copy(p.home.pos).setY(p.home.pos.y + PROUD).clone(), p.home.quat, { dur: 0.6, arc: 14, done: solder });
    this._refresh(); this._progress();
  }
  hint() {
    if (!this._active || this.phase !== 'play') return;
    const p = this.carried || this.pieces.find((q) => q.state === 'tacked') || this._next(); if (!p) return;
    this.hints++; this.flashPiece = p; this.flashUntil = performance.now() + 2400;
    if (!this.carried && p.state === 'tray') { this.lastPiece = p; this._refresh(); }
    this.viewer.dirty = true;
  }
  /** Instantly finish the first n parts of the suggested order (test hook / "skip ahead"). */
  complete(n = Infinity) {
    if (!this._active) return;
    if (this.phase === 'intro') { this.timers.length = 0; for (const ph of this.phys) { ph.pos.copy(ph.tray.pos); ph.quat.copy(ph.tray.quat); this._rest(ph); } this.phase = 'play'; this.timing = true; this.t0 = performance.now(); }
    this._drop();
    let k = 0;
    for (const p of this.pieces) {
      if (k++ >= n) break;
      p.state = 'soldered'; this._ghost(p.ph, false); p.ph.pos.copy(p.home.pos); p.ph.quat.copy(p.home.quat); this._rest(p.ph); this.lastPiece = p;
    }
    this._refresh(); this._progress();
    if (this.pieces.every((p) => p.state === 'soldered')) this._finish(true);
    this.viewer.dirty = true;
  }
  _finish(instant) {
    if (!this._active || this.phase === 'done') return;
    const v = this.viewer;
    this.phase = 'done'; this.timing = false; this.seconds = Math.max(0, Math.round((performance.now() - this.t0) / 1000));
    this.hold = null; this._ring(null); this.iron.visible = false; this.trayG.visible = false; if (this.foam) this.foam.visible = false; this._setHover(null);
    this.ui.timer.textContent = mmss(this.seconds);
    this._refresh(); this._measure();
    const card = () => {
      if (!this._active || this.phase !== 'done') return;
      const u = this.ui;
      u.doneTitle.textContent = `Board assembled · ${mmss(this.seconds)}`;
      const n = this.pieces.length, bits = [`${n} part${n === 1 ? '' : 's'} placed and soldered`];
      if (this.hints) bits.push(`${this.hints} hint${this.hints === 1 ? '' : 's'}`);
      if (this.misses) bits.push(`${this.misses} misplaced drop${this.misses === 1 ? '' : 's'}`);
      u.doneText.textContent = bits.join(' · ') + '. Power is on — the LED is lit.';
      u.done.hidden = false; u.root.classList.add('asm-finished'); this._resized();
      this._emit('done', { seconds: this.seconds, hints: this.hints, misses: this.misses });
    };
    const power = () => { if (!this._active || this.phase !== 'done') return; for (const g of this.glows) g.s.visible = g.visible; this.powerGlow.visible = true; this.glowK = instant ? 1 : 0; };
    v._goto(this._pose(this.boardBox, ISO_DIR), instant ? 0 : 1500);
    if (instant) { power(); card(); } else { this._after(0.7, power); this._after(1.5, card); }
    v.dirty = true;
  }
  _progress() {
    let placed = 0, soldered = 0;
    for (const p of this.pieces) { if (p.state === 'soldered') { soldered++; placed++; } else if (p.state === 'tacked' || p.state === 'soldering') placed++; }
    this._emit('progress', { placed, soldered, total: this.pieces.length });
  }

  // ───────────────────────── per-frame ─────────────────────────
  _tick({ now, dt }) {
    if (!this._active) return;
    const v = this.viewer;
    if (v.board !== this.built) { this.stop(); return; }           // the board was swapped under us
    let dirty = false;
    this.clock += dt;
    if (v.key.shadow.camera.right < this.shadowE - 1e-3) this._fitShadows();        // the viewer refitted its lights (e.g. after a thumbnail)
    if (v.controls.maxDistance < this.maxDist) v.controls.maxDistance = this.maxDist;
    for (let i = 0; i < this.timers.length; i++) if (this.timers[i].at <= this.clock) { const t = this.timers.splice(i--, 1)[0]; t.fn(); if (!this._active) return; }
    for (const ph of this.phys) if (ph.queue.length) { this._stepTween(ph, dt); dirty = true; }
    this._cast();
    if (this.phase === 'play') {
      if (this.carried) { this._follow(dt); dirty = true; }
      else this._hover();
      if (this._iron(dt, now)) dirty = true;
    }
    if (this._marks(now)) dirty = true;
    if (this._particles(dt)) dirty = true;
    if (this.glowK >= 0) dirty = this._glow(dt, now) || dirty;
    if (this.timing) { const s = Math.floor((performance.now() - this.t0) / 1000); if (s !== this.shownSec) { this.shownSec = s; this.ui.timer.textContent = mmss(s); } }
    const cur = this.carried ? 'grabbing' : this.iron.visible ? 'none' : this.hoverPiece ? 'pointer' : 'grab';
    if (cur !== this.cursor) { this.cursor = cur; this.dom.style.cursor = cur; }
    if (dirty) v.dirty = true;
  }
  _follow(dt) {
    const c = this.carried, ph = c.ph, h = c.home;
    c.snap = false;
    if (this.bpOk) {
      c.snap = !this.challenge && this._inFoot(h, this.bp, TOL) < Infinity;
      if (c.snap) _t.copy(h.pos).setY(h.pos.y + Math.max(3, 1.5 - ph.lbox.min.y));
      else _t.set(this.bp.x - h.off.x, this.topY + CLEAR - ph.lbox.min.y, this.bp.z - h.off.z);
    } else _t.copy(ph.tray.pos).setY(ph.tray.pos.y + 14);
    if (c.shake > 0) { c.shake = Math.max(0, c.shake - dt); _t.x += Math.sin(c.shake * 46) * 2.2 * c.shake; }
    ph.pos.lerp(_t, 1 - Math.exp(-dt * 15));
    ph.quat.slerp(this.bpOk ? h.quat : ph.tray.quat, 1 - Math.exp(-dt * 11));
    this._apply(ph);
    // vertical guide line down to the surface below the part
    const show = this.bpOk;
    this.guide.visible = this.land.visible = show;
    if (show) {
      _a.copy(h.off).add(ph.pos);
      const surf = this._onBoard(_a, 0) ? this.topY : 0, y0 = ph.pos.y + ph.lbox.min.y;
      this.guide.position.set(_a.x, surf, _a.z); this.guide.scale.set(1, Math.max(0.01, y0 - surf), 1);
      this.land.position.set(_a.x, surf + 0.12, _a.z);
    }
  }
  _setHover(p) {
    if (p === this.hoverPiece) return;
    this.hoverPiece?.row?.classList.remove('is-hover');
    this.hoverPiece = p;
    const tip = this.ui.tip;
    if (p) {
      const t = p.ph.tray;
      this.hoverMark.visible = true; this.hoverMark.position.set(t.x, 0.1, t.z); this.hoverMark.scale.set(t.sw - 1, 1, t.sd - 1);
      p.row?.classList.add('is-hover');
      tip.textContent = p.label; tip.classList.add('is-on');
    } else { this.hoverMark.visible = false; tip.classList.remove('is-on'); }
    this.viewer.dirty = true;
  }
  _hover() {
    this._setHover(this.gesture ? null : this._trayHit());
    if (this.hoverPiece) this.ui.tip.style.transform = `translate(${Math.round(this.ptrPx.x + 14)}px, ${Math.round(this.ptrPx.y + 16)}px)`;
  }
  _iron(dt, now) {
    const iron = this.iron, h = this.hold;
    const show = !this.carried && this.bpOk && !this.hoverPiece && (h ? true : this.anyTacked && this._onBoard(this.bp, 10));
    if (!show) { if (iron.visible) { iron.visible = false; this._ring(null); return true; } return false; }
    const over = this._tackedHit();
    if (h) {
      if (over !== h.piece) { h.piece = over; h.t = 0; }
      if (over && !h.frozen) h.t += dt;
    }
    const touching = !!(h && over);
    if (over) this._edge(over.home, this.bp, _t).setY(this.topY + (touching ? 0.2 : 1.1)); else _t.copy(this.bp).setY(this.topY + 2.6);
    if (!iron.visible) { iron.visible = true; this.ironPos.copy(_t); } else this.ironPos.lerp(_t, 1 - Math.exp(-dt * 24));
    // lean towards the viewer's right hand
    const cam = this.viewer.camera;
    _a.setFromMatrixColumn(cam.matrixWorld, 0).setY(0); if (_a.lengthSq() < 1e-6) _a.set(1, 0, 0); _a.normalize();
    _b.setFromMatrixColumn(cam.matrixWorld, 2).setY(0); if (_b.lengthSq() < 1e-6) _b.set(0, 0, 1); _b.normalize();
    _c.set(0, 0.86, 0).addScaledVector(_a, 0.4).addScaledVector(_b, 0.36).normalize();
    iron.quaternion.setFromUnitVectors(UP, _c);
    iron.position.copy(this.ironPos);
    if (touching) {
      iron.position.x += Math.sin(now * 0.05) * 0.06; iron.position.z += Math.cos(now * 0.043) * 0.06;
      this.smokeAcc += dt; this.glintAcc += dt;
      if (this.smokeAcc > 0.085) { this.smokeAcc = 0; this._puff(this.ironPos.x, this.ironPos.y + 0.6, this.ironPos.z); }
      if (this.glintAcc > 0.11) { this.glintAcc = 0; this._glint(this.ironPos.x + (Math.random() - 0.5) * 1.6, this.ironPos.y + 0.2, this.ironPos.z + (Math.random() - 0.5) * 1.6, 1.4 + Math.random() * 1.4, 0.16 + Math.random() * 0.1); }
      this._ring(over, Math.min(1, h.t / HOLD));
      if (h.t >= HOLD) { h.piece = null; h.t = 0; this._ring(null); this._soldered(over); }
    } else this._ring(null);
    return true;
  }
  _ring(piece, frac = 0) {
    const r = this.ui.ring;
    if (!piece) { if (this.ringOn) { this.ringOn = false; r.classList.remove('is-on'); } return; }
    const v = this.viewer;
    _a.copy(piece.home.c); _a.y += piece.ph.lbox.max.y + 1.5; _a.project(v.camera);
    const x = (_a.x * 0.5 + 0.5) * v.W, y = (-_a.y * 0.5 + 0.5) * v.H;
    r.style.transform = `translate(${Math.round(x)}px, ${Math.round(Math.max(40, y - 34))}px)`;
    this.ui.ringFg.style.strokeDashoffset = String(138.23 * (1 - frac));
    if (!this.ringOn) { this.ringOn = true; r.classList.add('is-on'); }
  }
  _marks(now) {
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.0068), flash = now < this.flashUntil;
    let fp = null, np = null;
    if (this.phase === 'play') {
      if (this.carried) { if (!this.challenge || flash) fp = this.carried; }
      else {
        if (flash && this.flashPiece && (this.flashPiece.state === 'tray' || this.flashPiece.state === 'tacked')) fp = this.flashPiece;
        const n = this._next();
        if (n && !n.ph.queue.length && (flash ? this.flashPiece === n : !this.anyTacked && !this.challenge)) np = n;
      }
    }
    const f = this.foot, was = f.group.visible || this.nextMark.group.visible;
    f.group.visible = !!fp;
    if (fp) {
      const h = fp.home;
      f.size(h.hx * 2 + 0.8, h.hz * 2 + 0.8); f.group.position.set(h.c.x, this.topY + 0.07, h.c.z); f.group.rotation.y = h.yaw;
      f.fade(flash ? 0.35 + 0.65 * Math.abs(Math.sin(now * 0.012)) : 0.3 + 0.7 * pulse);
    }
    const nm = this.nextMark; nm.group.visible = !!np;
    if (np) {
      const t = np.ph.tray;
      nm.size(t.sw - 1.2, t.sd - 1.2, 0.4); nm.group.position.set(t.x, 0.11, t.z);
      nm.fade(flash ? 0.4 + 0.6 * Math.abs(Math.sin(now * 0.012)) : 0.8);
    }
    return !!fp || (np && flash) || (was && !fp && !np) || was !== (!!fp || !!np);
  }
  _puff(x, y, z) {
    for (const s of this.smoke) if (s.life <= 0) {
      s.life = s.max = 1.0 + Math.random() * 0.8; s.size = 2.6 + Math.random() * 1.8;
      s.vx = (Math.random() - 0.5) * 3; s.vz = (Math.random() - 0.5) * 3; s.vy = 13 + Math.random() * 9;
      s.s.position.set(x, y, z); s.s.visible = true; s.s.material.rotation = Math.random() * 6.28; return;
    }
  }
  _glint(x, y, z, size, life) {
    for (const g of this.glints) if (g.life <= 0) { g.life = g.max = life; g.size = size; g.s.position.set(x, y, z); g.s.visible = true; return; }
  }
  _particles(dt) {
    let alive = false;
    for (const s of this.smoke) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.s.visible = false; alive = true; continue; }
      const k = 1 - s.life / s.max, p = s.s.position;
      s.vx += (Math.random() - 0.5) * dt * 10; s.vy *= 1 - dt * 0.5;
      p.x += s.vx * dt; p.y += s.vy * dt; p.z += s.vz * dt;
      const sz = s.size * (0.6 + 2.6 * k); s.s.scale.set(sz, sz, 1);
      s.s.material.opacity = 0.8 * Math.min(1, k * 7) * (1 - k);
      alive = true;
    }
    for (const g of this.glints) {
      if (g.life <= 0) continue;
      g.life -= dt;
      if (g.life <= 0) { g.s.visible = false; alive = true; continue; }
      const k = 1 - g.life / g.max, a = Math.sin(Math.PI * k), sz = g.size * (0.5 + a);
      g.s.scale.set(sz, sz, 1); g.s.material.opacity = a; alive = true;
    }
    return alive;
  }
  _glow(dt, now) {
    this.glowK = Math.min(1, this.glowK + dt / 0.9);
    const k = this.glowK, e = k < 1 ? easeBack(k) : 1;
    for (const g of this.glows) g.s.scale.copy(g.scale).multiplyScalar(Math.max(0.01, e));
    const sz = this.powerSize * (k < 1 ? 0.3 + 1.5 * Math.sin(Math.PI * Math.min(1, k * 0.8)) : 1);
    this.powerGlow.scale.set(sz, sz, 1);
    if (k >= 1) { this.glowK = -1; this.powerGlow.scale.set(this.powerSize, this.powerSize, 1); }
    return true;
  }

  // ───────────────────────── overlay UI ─────────────────────────
  _buildUi() {
    const root = document.createElement('div'); root.className = 'asm-root';
    root.innerHTML = `
<aside class="asm-panel" aria-label="Assembly mode">
  <header class="asm-head">
    <div class="asm-head-t"><span class="asm-eyebrow">Assembly kit</span><h2 class="asm-title"></h2></div>
    <button type="button" class="asm-x" data-act="exit" aria-label="Exit assembly mode" title="Exit"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
  </header>
  <div class="asm-prog">
    <div class="asm-bar" role="progressbar" aria-valuemin="0"><b></b><i></i></div>
    <div class="asm-prog-row"><span class="asm-count"></span><span class="asm-timer" title="Elapsed time">0:00</span></div>
  </div>
  <div class="asm-step"><span class="asm-eyebrow asm-step-n"></span><p class="asm-instr" aria-live="polite"></p></div>
  <div class="asm-about" hidden><span class="asm-eyebrow">What this part does</span><h3></h3><p></p></div>
  <div class="asm-list-wrap"><span class="asm-eyebrow asm-list-h">Kit parts · low parts first</span><ul class="asm-list"></ul></div>
  <div class="asm-actions">
    <button type="button" class="asm-btn" data-act="hint"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M8 1.6a4.4 4.4 0 0 0-2.6 7.9c.5.4.8.9.8 1.5h3.6c0-.6.3-1.1.8-1.5A4.4 4.4 0 0 0 8 1.6zM6.4 13h3.2M7 14.6h2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>Hint</button>
    <button type="button" class="asm-btn asm-btn-main" data-act="auto">Auto-place next</button>
    <button type="button" class="asm-btn asm-toggle" data-act="challenge" aria-pressed="false" title="Hide the pulsing footprint: you have to know where each part goes"><span class="asm-switch" aria-hidden="true"></span>Challenge <em>off</em></button>
    <button type="button" class="asm-btn" data-act="restart">Start over</button>
    <button type="button" class="asm-btn" data-act="exit">Exit</button>
  </div>
  <p class="asm-note">Small SMD parts come pre-soldered, like a real kit.</p>
</aside>
<div class="asm-toast" role="status"></div>
<div class="asm-tip"></div>
<div class="asm-ring" aria-hidden="true"><svg viewBox="0 0 56 56" width="56" height="56"><circle class="asm-ring-bg" cx="28" cy="28" r="22"/><circle class="asm-ring-fg" cx="28" cy="28" r="22" transform="rotate(-90 28 28)"/></svg></div>
<div class="asm-done" hidden role="dialog" aria-label="Board assembled">
  <span class="asm-eyebrow">Power on</span><h3></h3><p></p>
  <div class="asm-done-btns"><button type="button" class="asm-btn asm-btn-main" data-act="restart">Start over</button><button type="button" class="asm-btn" data-act="exit">Exit</button></div>
</div>`;
    const $ = (s) => root.querySelector(s);
    const ui = this.ui = {
      root, panel: $('.asm-panel'), title: $('.asm-title'), bar: $('.asm-bar'), barPlaced: $('.asm-bar b'), barDone: $('.asm-bar i'), count: $('.asm-count'), timer: $('.asm-timer'),
      stepN: $('.asm-step-n'), instr: $('.asm-instr'), about: $('.asm-about'), aboutH: $('.asm-about h3'), aboutP: $('.asm-about p'), list: $('.asm-list'),
      toast: $('.asm-toast'), tip: $('.asm-tip'), ring: $('.asm-ring'), ringFg: $('.asm-ring-fg'), done: $('.asm-done'), doneTitle: $('.asm-done h3'), doneText: $('.asm-done p'),
      challenge: $('[data-act="challenge"]'), hintBtn: $('[data-act="hint"]'), autoBtn: $('[data-act="auto"]'),
    };
    ui.title.textContent = this.def.name || this.def.id || 'Board';
    for (const p of this.pieces) {
      const li = document.createElement('li'); li.className = 'asm-row'; li.tabIndex = 0; li.setAttribute('role', 'button');
      const dot = document.createElement('span'); dot.className = 'asm-dot';
      const name = document.createElement('span'); name.className = 'asm-name'; name.textContent = p.label;
      const st = document.createElement('span'); st.className = 'asm-st';
      li.append(dot, name, st); li._piece = p; p.row = li; p.rowSt = st; ui.list.appendChild(li);
    }
    root.addEventListener('click', this._click);
    root.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('asm-row')) { e.preventDefault(); this._rowClick(e.target._piece); } });
    this.viewer.el.appendChild(root);
  }
  _click(e) {
    const btn = e.target.closest('[data-act]');
    if (btn) {
      const a = btn.dataset.act;
      if (a === 'hint') this.hint();
      else if (a === 'auto') this.auto();
      else if (a === 'challenge') this.setChallenge(!this.challenge);
      else if (a === 'restart') this.restart();
      else if (a === 'exit') this.stop();
      return;
    }
    const row = e.target.closest('.asm-row');
    if (row && row._piece) this._rowClick(row._piece);
  }
  _rowClick(p) {
    if (this.phase !== 'play') return;
    if (p.state === 'tray') { this.ptrIn = false; this._pick(p); }
    else if (p.state === 'carried') this._return(p);
    else {
      this.lastPiece = p; this.flashPiece = p; this.flashUntil = p.state === 'tacked' ? performance.now() + 1800 : 0;
      if (p.state === 'tacked') this._toast('It is only tacked in place — hold the iron on it to solder.');
      this._refresh();
    }
    this.viewer.dirty = true;
  }
  _toast(msg, warn = false) {
    const t = this.ui.toast;
    t.textContent = msg; t.classList.toggle('is-warn', warn); t.classList.remove('is-on'); void t.offsetWidth; t.classList.add('is-on');
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => t.classList.remove('is-on'), 3200);
  }
  _say(el, before, strong, after = '') {
    el.textContent = before;
    if (strong) { const b = document.createElement('strong'); b.textContent = strong; el.append(b, after); }
  }
  /** Sync the panel with the model (called on state changes only, never per frame). */
  _refresh() {
    if (!this.ui) return;
    const ui = this.ui, total = this.pieces.length;
    let placed = 0, soldered = 0, tacked = null;
    for (const p of this.pieces) {
      if (p.state === 'soldered') { soldered++; placed++; } else if (p.state === 'tacked' || p.state === 'soldering') { placed++; if (!tacked && p.state === 'tacked') tacked = p; }
    }
    this.anyTacked = !!tacked;
    const next = this._next(), c = this.carried;
    ui.barDone.style.width = (total ? (soldered / total) * 100 : 0) + '%'; ui.barPlaced.style.width = (total ? (placed / total) * 100 : 0) + '%';
    ui.bar.setAttribute('aria-valuemax', total); ui.bar.setAttribute('aria-valuenow', soldered);
    ui.count.replaceChildren(); { const b = document.createElement('b'); b.textContent = soldered; ui.count.append(b, ` / ${total} soldered`); }
    const LAB = { tray: 'tray', carried: 'in hand', flying: 'placing', tacked: 'tacked', soldering: 'soldering', soldered: 'soldered' };
    for (const p of this.pieces) {
      const cls = 'asm-row is-' + (p.state === 'flying' || p.state === 'soldering' ? 'tacked' : p.state) + (p === next && !c && this.phase === 'play' ? ' is-next' : '') + (p === this.hoverPiece ? ' is-hover' : '');
      if (p.row.className !== cls) p.row.className = cls;
      if (p.rowSt.textContent !== LAB[p.state]) p.rowSt.textContent = LAB[p.state];
    }
    const focusRow = (c || tacked || next)?.row;
    if (focusRow && focusRow !== this.focusRow && ui.list.scrollTo) {
      this.focusRow = focusRow;
      if (this.compact) ui.list.scrollTo({ left: focusRow.offsetLeft - 12, behavior: 'smooth' });
      else ui.list.scrollTo({ top: focusRow.offsetTop - ui.list.clientHeight / 2 + focusRow.offsetHeight / 2, behavior: 'smooth' });
    }
    // instruction line
    ui.stepN.textContent = this.phase === 'done' ? 'Finished' : this.phase === 'intro' ? 'Unpacking' : `Step ${Math.min(total, soldered + 1)} of ${total}`;
    if (this.phase === 'intro') this._say(ui.instr, 'Taking the board apart… every part goes to the tray.');
    else if (this.phase === 'done') this._say(ui.instr, 'Every part is soldered. Powering the board on.');
    else if (c) this.challenge ? this._say(ui.instr, 'Where does the ', c.label, ' go? Click its place on the board.') : this._say(ui.instr, 'Place the ', c.label, ' on its pulsing footprint.');
    else if (tacked) this._say(ui.instr, 'Now hold the iron on the ', tacked.label, ' to solder it.');
    else if (next) this._say(ui.instr, 'Pick the ', next.label, ' from the tray.');
    else this._say(ui.instr, 'Finishing the last joint…');
    // what this part does
    const a = c || this.lastPiece;
    ui.about.hidden = !a || !a.text;
    if (a && a.text) { ui.aboutH.textContent = a.label; ui.aboutP.textContent = a.text; }
    ui.challenge.setAttribute('aria-pressed', String(this.challenge)); ui.challenge.querySelector('em').textContent = this.challenge ? 'on' : 'off';
    const playing = this.phase === 'play';
    ui.hintBtn.disabled = ui.autoBtn.disabled = !playing || (!c && !tacked && !next);
    ui.root.classList.toggle('asm-carrying', !!c);
  }

  // ───────────────────────── test hooks ─────────────────────────
  /** Run the simulation forward without waiting for animation frames (tests / screenshots). */
  advance(sec, step = 1 / 60) {
    let now = performance.now();
    for (let t = 0; t < sec && this._active; t += step) { now += step * 1000; this._tick({ now, dt: step }); }
    this.viewer.dirty = true;
  }
  /** Client coordinates of a piece (index in the suggested order) in its tray slot or on its footprint. */
  screenOf(index, where = 'tray') {
    const p = this.pieces[index], v = this.viewer, r = this.dom.getBoundingClientRect();
    if (where === 'tray') _a.set(p.ph.tray.x, p.ph.tray.h * 0.5, p.ph.tray.z); else _a.copy(p.home.c);
    v.camera.updateMatrixWorld(); _a.project(v.camera);
    return { x: r.left + (_a.x * 0.5 + 0.5) * r.width, y: r.top + (-_a.y * 0.5 + 0.5) * r.height };
  }
  /** Frozen "carrying the next part" pose for screenshots. */
  debugCarry() {
    const p = this._next(); if (!p || this.phase !== 'play') return;
    this._pick(p);
    this.fake = new THREE.Vector3(p.home.c.x + p.home.hx + 9, this.topY, p.home.c.z + p.home.hz + 7);
    if (!this._onBoard(this.fake, -4)) this.fake.set(p.home.c.x - p.home.hx - 9, this.topY, p.home.c.z - p.home.hz - 7);
  }
  /** Frozen "soldering the next part" pose for screenshots. */
  debugSolder(frac = 0.62) {
    const p = this.pieces.find((q) => q.state === 'tacked') || this._next(); if (!p || this.phase !== 'play') return;
    this._drop();
    if (p.state === 'tray') { p.state = 'tacked'; p.ph.pos.copy(p.home.pos).setY(p.home.pos.y + PROUD); p.ph.quat.copy(p.home.quat); this._rest(p.ph); }
    this.lastPiece = p; this._refresh(); this._progress();
    this._perim(p.home, 0.42, _t);
    this.fake = _t.clone();
    this.hold = { piece: p, t: frac * HOLD, frozen: true };
  }
}
