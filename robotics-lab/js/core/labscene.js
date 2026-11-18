// Lab environment for the hero viewer: a tidy maker's workbench around the board.
// Wooden bench top, ESD mat, a still life of tools, a softly blurred wall and room.
// Everything is procedural (canvas textures + Builder geometry). Units: millimetres, y up, z towards the viewer.
// The board rests on y = 0 (= top of the mat) and is centred on the origin.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Builder, rrShape } from './builder.js';

const DEG = Math.PI / 180;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const MAT_T = 2.2, MAT_W = 560, MAT_D = 360, MAT_Z = 5;            // mat: top at y = 0, desk top at y = -MAT_T
const MAT_X1 = MAT_W / 2, MAT_Z0 = MAT_Z - MAT_D / 2, MAT_Z1 = MAT_Z + MAT_D / 2;
const DESK_W = 1700, DESK_Z0 = -300, DESK_Z1 = 330, DESK_T = 38, WOOD_TILE = 640;
const WALL_Z = DESK_Z0, WALL_W = 3000, WALL_H = 1650;
const ROOM = { x: 1500, z1: 2200, y0: -760, y1: WALL_H - MAT_T };
const FOG_COLOR = 0xeee7da;

// ───────────────────────── small utilities ─────────────────────────
const rng = (s) => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// willReadFrequently keeps these canvases on the CPU: they are only painted once and uploaded, and must not eat GPU memory next to the 4k shadow map
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d', { willReadFrequently: true }); return c; };
const rr = (g, x, y, w, h, r) => { g.beginPath(); if (g.roundRect && r > 0) g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); else g.rect(x, y, w, h); };
const disc = (g, x, y, r, fill) => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };

/** Gaussian-ish blur of a canvas (edges are extended, so nothing fades to transparent). Works without ctx.filter too. */
function blur(src, px) {
  const pad = Math.ceil(px * 3), W = src.width, H = src.height;
  const big = mk(W + pad * 2, H + pad * 2), g = big.getContext('2d');
  g.drawImage(src, pad, pad);
  g.drawImage(src, 0, 0, 1, H, 0, pad, pad, H); g.drawImage(src, W - 1, 0, 1, H, W + pad, pad, pad, H);
  g.drawImage(big, 0, pad, big.width, 1, 0, 0, big.width, pad); g.drawImage(big, 0, pad + H - 1, big.width, 1, 0, pad + H, big.width, pad);
  const out = mk(W, H), o = out.getContext('2d');
  if (typeof o.filter === 'string') { o.filter = `blur(${px}px)`; o.drawImage(big, -pad, -pad); o.filter = 'none'; return out; }
  let cur = big; const steps = Math.max(1, Math.round(Math.log2(px)));          // fallback: halve a few times, then scale back up
  for (let i = 0; i < steps; i++) { const n = mk(Math.max(2, cur.width >> 1), Math.max(2, cur.height >> 1)); n.getContext('2d').drawImage(cur, 0, 0, n.width, n.height); cur = n; }
  for (let i = 0; i < steps; i++) { const n = mk(Math.min(big.width, cur.width * 2), Math.min(big.height, cur.height * 2)); const ng = n.getContext('2d'); ng.imageSmoothingQuality = 'high'; ng.drawImage(cur, 0, 0, n.width, n.height); cur = n; }
  o.drawImage(cur, 0, 0, cur.width, cur.height, -pad, -pad, big.width, big.height);
  return out;
}
const shrink = (c, w) => { const n = mk(w, Math.round(c.height * w / c.width)), g = n.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, n.width, n.height); return n; };
function canvasTex(c, { srgb = true, repeat = false, aniso = 1, mips = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (!mips) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  return t;
}

// ───────────────────────── palette: one material for any colour / roughness ─────────────────────────
// Every prop is painted by pointing its UVs at a 1-px swatch, so a whole cluster of props is two draw calls
// (dielectrics + metals) however many colours it uses.
function makePalette() {
  const N = 32, cc = mk(N, N), rc = mk(N, N), cg = cc.getContext('2d'), rg = rc.getContext('2d');
  rg.fillStyle = '#00ff00'; rg.fillRect(0, 0, N, N);
  const col = canvasTex(cc, { mips: false }), rgh = canvasTex(rc, { srgb: false, mips: false });
  col.magFilter = rgh.magFilter = col.minFilter = rgh.minFilter = THREE.NearestFilter;
  const plain = new THREE.MeshStandardMaterial({ map: col, roughnessMap: rgh, roughness: 1, metalness: 0 });
  const metal = new THREE.MeshStandardMaterial({ map: col, roughnessMap: rgh, roughness: 1, metalness: 1 });
  metal.color.setScalar(1.7);            // same trick as builder.js: the studio env is dimmed for diffuse surfaces, metals need the boost
  const cache = new Map(); let n = 0;
  const sw = (color, rough = 0.5, metalness = 0) => {
    const key = color + '|' + rough + '|' + metalness;
    if (!cache.has(key)) {
      const i = n % N, j = (n / N) | 0; n++;
      cg.fillStyle = color; cg.fillRect(i, j, 1, 1);
      rg.fillStyle = `rgb(0,${Math.round(rough * 255)},0)`; rg.fillRect(i, j, 1, 1);
      col.needsUpdate = rgh.needsUpdate = true;
      cache.set(key, { u: (i + 0.5) / N, v: 1 - (j + 0.5) / N, mat: metalness > 0.5 ? metal : plain });
    }
    return cache.get(key);
  };
  return { sw, plain, metal, dispose() { col.dispose(); rgh.dispose(); plain.dispose(); metal.dispose(); } };
}

// ───────────────────────── Kit: Builder + transform stack, authored in THREE coords (y up) ─────────────────────────
class Kit {
  constructor() { this.B = new Builder(); this.M = new THREE.Matrix4(); this.st = []; }
  /** Enter a local frame: translate, then rotate ry (heading, CCW from above), rx, rz — all in degrees. */
  push(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
    this.st.push(this.M.clone());
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx * DEG, ry * DEG, rz * DEG, 'YXZ'));
    this.M.multiply(new THREE.Matrix4().compose(V(x, y, z), q, V(1, 1, 1)));
    return this;
  }
  pop() { this.M.copy(this.st.pop()); return this; }
  /** A local point expressed in the kit's root frame. */
  pt(x, y, z) { return V(x, y, z).applyMatrix4(this.M); }
  /** Add a geometry painted with a palette swatch. */
  g(geo, sw) {
    const uv = geo.attributes.uv;
    if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, sw.u, sw.v);
    else geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2).map((_, i) => (i & 1 ? sw.v : sw.u)), 2));
    geo.applyMatrix4(this.M); this.B.geo(geo, sw.mat); return this;
  }
  /** Add a geometry that keeps its own UVs, with its own material. */
  tex(geo, mat) { geo.applyMatrix4(this.M); this.B.geo(geo, mat); return this; }
  box(sx, sy, sz, sw, x = 0, y = 0, z = 0) { return this.g(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), sw); }
  rbox(sx, sy, sz, r, sw, x = 0, y = 0, z = 0, seg = 2) {
    r = Math.min(r, sx / 2 - 1e-3, sy / 2 - 1e-3, sz / 2 - 1e-3);
    return this.g(new RoundedBoxGeometry(sx, sy, sz, seg, r).translate(x, y, z), sw);
  }
  cyl(r, len, sw, x = 0, y = 0, z = 0, { axis = 'y', rTop, seg = 24, open = false } = {}) {
    const g = new THREE.CylinderGeometry(rTop ?? r, r, len, seg, 1, open);
    if (axis === 'x') g.rotateZ(-Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
    return this.g(g.translate(x, y, z), sw);
  }
  /** Solid of revolution; pts = [[radius, t], …] ordered axis-bottom → outwards → up → back to the axis. axis 'y' | 'x' | 'z' (t runs along +axis). */
  lathe(pts, sw, x = 0, y = 0, z = 0, { axis = 'y', seg = 24 } = {}) {
    const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(Math.max(p[0], 1e-3), p[1])), seg);
    if (axis === 'x') g.rotateZ(-Math.PI / 2); else if (axis === 'z') g.rotateX(Math.PI / 2);
    return this.g(g.translate(x, y, z), sw);
  }
  sphere(r, sw, x = 0, y = 0, z = 0, { sx = 1, sy = 1, sz = 1, seg = 16 } = {}) {
    const g = new THREE.SphereGeometry(r, seg, Math.max(8, seg >> 1)); g.scale(sx, sy, sz);
    return this.g(g.translate(x, y, z), sw);
  }
  /** Round wire / cable through the given points (Vector3, in the current frame). */
  tube(pts, r, sw, { seg, rad = 8, caps = true, closed = false } = {}) {
    const curve = new THREE.CatmullRomCurve3(pts, closed, 'centripetal');
    const n = seg ?? Math.min(480, Math.max(8, Math.round(curve.getLength() / (r * 2.4))));
    this.g(new THREE.TubeGeometry(curve, n, r, rad, closed), sw);
    if (caps && !closed) { const a = pts[0], b = pts[pts.length - 1]; this.sphere(r, sw, a.x, a.y, a.z, { seg: 8 }); this.sphere(r, sw, b.x, b.y, b.z, { seg: 8 }); }
    return this;
  }
  curveTube(curve, n, r, sw, rad = 6) { return this.g(new THREE.TubeGeometry(curve, n, r, rad, false), sw); }
  /** Extrude a THREE.Shape drawn in plan (shape x → x, shape y → −z) upwards from y. */
  ext(shape, depth, sw, x = 0, y = 0, z = 0, { bevel = 0, seg = 10 } = {}) {
    const g = new THREE.ExtrudeGeometry(shape, bevel
      ? { depth: depth - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: seg }
      : { depth, bevelEnabled: false, curveSegments: seg });
    if (bevel) g.translate(0, 0, bevel);
    g.rotateX(-Math.PI / 2);
    return this.g(g.translate(x, y, z), sw);
  }
  /** Flat, upward-facing textured quad sx × sz centred at (x, y, z); rect = [u0, v0, u1, v1] inside the texture. */
  decal(sx, sz, mat, rect, x = 0, y = 0, z = 0) {
    const g = new THREE.PlaneGeometry(sx, sz); g.rotateX(-Math.PI / 2); remapUV(g, rect);
    return this.tex(g.translate(x, y, z), mat);
  }
  build(name, { cast = true } = {}) {
    const grp = this.B.build(name);
    if (!cast) grp.traverse(o => { if (o.isMesh) o.castShadow = false; });
    return grp;
  }
}
function remapUV(g, [u0, v0, u1, v1]) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0)); return g; }
/** Region of a canvas (px, y down) → [u0, v0, u1, v1]. */
const region = (c, x, y, w, h) => [x / c.width, 1 - (y + h) / c.height, (x + w) / c.width, 1 - y / c.height];

class Helix extends THREE.Curve {
  constructor(len, turns, radius) { super(); this.len = len; this.turns = turns; this.radius = radius; }
  getPoint(t, target = new THREE.Vector3()) { const a = t * this.turns * Math.PI * 2, r = this.radius(t); return target.set(r * Math.cos(a), t * this.len, r * Math.sin(a)); }
}

// ───────────────────────── procedural textures ─────────────────────────
/** Light beech butcher-block bench top; tiles seamlessly (stave joints sit on the tile borders). */
function woodCanvas() {
  const S = 2048, c = mk(S, S), g = c.getContext('2d'), R = rng(11);
  const rows = 12, rh = S / rows;
  const stave = (x0, y0, w, h, seed) => {
    const r = rng(seed);
    g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
    const hue = 33 + r() * 5, sat = 36 + r() * 9, lig = 72.5 + (r() - 0.5) * 7;
    g.fillStyle = `hsl(${hue} ${sat}% ${lig}%)`; g.fillRect(x0, y0, w, h);
    for (let i = 0; i < 7; i++) {                                   // broad, soft growth bands
      const yy = y0 + r() * h, bh = 6 + r() * h * 0.3;
      const gr = g.createLinearGradient(0, yy, 0, yy + bh);
      const a = 0.04 + r() * 0.07, dark = r() < 0.7;
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, dark ? `rgba(120,78,36,${a})` : `rgba(255,244,222,${a * 1.4})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x0, yy, w, bh);
    }
    for (let i = 0; i < 70; i++) {                                  // long wavy grain lines
      const yy = y0 + r() * h, amp = 0.6 + r() * 3.2, wl = 260 + r() * 700, ph = r() * 6.28, sl = (r() - 0.5) * 0.012;
      g.strokeStyle = `rgba(${105 + r() * 40 | 0},${68 + r() * 26 | 0},${30 + r() * 20 | 0},${0.035 + r() * 0.085})`; g.lineWidth = 0.7 + r() * 1.5;
      g.beginPath();
      for (let x = x0 - 8; x <= x0 + w + 8; x += 28) { const y = yy + amp * Math.sin(x / wl * 6.28 + ph) + sl * (x - x0); if (x === x0 - 8) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    }
    const flecks = (w * h) / 520;                                    // short pores, typical for beech
    for (let i = 0; i < flecks; i++) {
      g.fillStyle = `rgba(104,66,30,${0.07 + r() * 0.13})`;
      g.fillRect(x0 + r() * w, y0 + r() * h, 3 + r() * 9, 0.8 + r() * 0.6);
    }
    g.fillStyle = 'rgba(86,54,24,0.34)'; g.fillRect(x0, y0, 1.6, h); g.fillRect(x0, y0, w, 1.4);          // glue joints
    g.fillStyle = 'rgba(255,246,228,0.16)'; g.fillRect(x0 + 1.6, y0, 1.4, h); g.fillRect(x0, y0 + 1.4, w, 1.2);
    g.restore();
  };
  for (let r = 0; r < rows; r++) {
    const start = Math.floor(R() * 800); let x = start, k = 0;
    while (x < start + S) {
      let L = 480 + R() * 700; if (start + S - (x + L) < 340) L = start + S - x;
      const seed = r * 977 + k * 131 + 7;
      stave(x, r * rh, L, rh, seed); if (x + L > S) stave(x - S, r * rh, L, rh, seed);
      x += L; k++;
    }
  }
  // sparse wear: hairline scratches and a few dull spots
  for (let i = 0; i < 26; i++) {
    const x = R() * S, y = R() * S, a = R() * 6.28, l = 40 + R() * 220;
    g.strokeStyle = `rgba(255,250,240,${0.05 + R() * 0.07})`; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.35); g.stroke();
  }
  return c;
}

/** One 100 × 100 mm cell of the mat print (10 mm grid, heavier 50 mm lines); repeats across the mat. */
function matCanvas() {
  const S = 1024, c = mk(S, S), g = c.getContext('2d'), R = rng(3), k = S / 100;
  g.fillStyle = '#6c7b8a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {                                   // fine matte speckle
    const d = R() < 0.5; g.fillStyle = d ? `rgba(40,52,64,${0.03 + R() * 0.05})` : `rgba(255,255,255,${0.03 + R() * 0.05})`;
    g.fillRect(R() * S, R() * S, 1 + R() * 1.6, 1 + R() * 1.6);
  }
  for (let i = 0; i <= 10; i++) {
    const major = i % 5 === 0, p = i * 10 * k, w = major ? 2.2 : 1.3;
    g.fillStyle = major ? 'rgba(232,240,246,0.36)' : 'rgba(232,240,246,0.17)';
    g.fillRect(p - w / 2, 0, w, S); g.fillRect(0, p - w / 2, S, w);
  }
  g.fillStyle = 'rgba(232,240,246,0.2)';                            // 5 mm ticks on the heavy lines
  for (let i = 0; i < 20; i++) for (const base of [0, 50]) {
    const p = (i * 5 + 2.5) * k - 0.6, b = base * k, wrap = base === 0 ? [b, S] : [b];
    for (const q of wrap) { g.fillRect(p, q - 6, 1.3, 12); g.fillRect(q - 6, p, 12, 1.3); }
  }
  return c;
}

/** White print on the mat: a caption and a 100 mm scale (transparent background). */
function printCanvas() {
  const c = mk(1280, 256), g = c.getContext('2d');
  g.fillStyle = '#f2f6f8'; g.fillRect(0, 0, 8, 8);                  // solid swatch for the frame lines
  g.font = '700 46px "Arial Narrow", Arial, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText('ESD-SAFE WORK MAT', 20, 54);
  g.font = '500 30px "Arial Narrow", Arial, sans-serif';
  g.fillText('560 × 360 mm  ·  GRID 10 mm  ·  10⁶–10⁹ Ω', 420, 56);
  g.lineWidth = 3; g.strokeStyle = '#f2f6f8'; rr(g, 4, 14, 1272, 82, 10); g.stroke();
  // scale: 100 mm at 10 px / mm, starting at x = 40, baseline y = 236
  const x0 = 40, yb = 236;
  for (let mm = 0; mm <= 100; mm++) { const h = mm % 10 === 0 ? 46 : mm % 5 === 0 ? 32 : 20; g.fillRect(x0 + mm * 10 - 1.5, yb - h, 3, h); }
  g.fillRect(x0 - 1.5, yb - 2, 1003, 3);
  g.font = '600 34px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center';
  for (let cm = 0; cm <= 10; cm++) g.fillText(String(cm * 10), x0 + cm * 100, yb - 70);
  g.textAlign = 'left'; g.fillText('mm', x0 + 1030, yb - 70);
  return c;
}

/** Faint, non-repeating wear on the mat: cloudy patches, rubbed spots, a few scuffs and a soft light falloff (transparent overlay). */
function wearCanvas() {
  const W = 560, H = 360, c = mk(W, H), g = c.getContext('2d'), R = rng(17);
  for (let i = 0; i < 70; i++) {
    const x = R() * W, y = R() * H, r = 26 + R() * 110, light = R() < 0.55, a = 0.02 + R() * 0.045;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, light ? `rgba(236,242,248,${a})` : `rgba(30,38,48,${a})`); gr.addColorStop(1, light ? 'rgba(236,242,248,0)' : 'rgba(30,38,48,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // a soft pool of light around the board, falling off towards the edges of the mat
  { const cx = W * 0.47, cy = H * 0.46, gr = g.createRadialGradient(cx, cy, 30, cx, cy, 340);
    gr.addColorStop(0, 'rgba(238,244,250,0.075)'); gr.addColorStop(0.3, 'rgba(238,244,250,0.02)'); gr.addColorStop(0.5, 'rgba(22,28,36,0.03)'); gr.addColorStop(1, 'rgba(22,28,36,0.2)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const x = R() * W, y = R() * H, a = R() * 6.28, l = 8 + R() * 46, bend = (R() - 0.5) * 18;
    g.strokeStyle = `rgba(240,246,250,${0.05 + R() * 0.08})`; g.lineWidth = 0.5 + R() * 1.2;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l / 2 - Math.sin(a) * bend, y + Math.sin(a) * l / 2 + Math.cos(a) * bend, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  return blur(c, 1.2);
}

/** Soft contact-shadow sprites: left half = round blob, right half = linear fade (dark at the top). */
function aoCanvas() {
  const c = mk(256, 128), g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  r.addColorStop(0, 'rgba(30,20,10,0.75)'); r.addColorStop(0.45, 'rgba(30,20,10,0.5)'); r.addColorStop(0.8, 'rgba(30,20,10,0.12)'); r.addColorStop(1, 'rgba(30,20,10,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const l = g.createLinearGradient(0, 2, 0, 126);
  l.addColorStop(0, 'rgba(40,28,14,0.62)'); l.addColorStop(0.35, 'rgba(40,28,14,0.28)'); l.addColorStop(1, 'rgba(40,28,14,0)');
  g.fillStyle = l; g.fillRect(132, 2, 120, 124);
  return c;
}

function seg7(g, x, y, w, h, ch, color, ghost) {
  const t = w * 0.17, hh = h / 2, on = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g' }[ch] || '';
  const segs = { a: [t, 0, w - 2 * t, t], g: [t, hh - t / 2, w - 2 * t, t], d: [t, h - t, w - 2 * t, t], f: [0, t * 0.6, t, hh - t * 1.1], b: [w - t, t * 0.6, t, hh - t * 1.1], e: [0, hh + t * 0.5, t, hh - t * 1.1], c: [w - t, hh + t * 0.5, t, hh - t * 1.1] };
  g.save(); g.transform(1, 0, -0.09, 1, x + h * 0.09, y);
  for (const k of Object.keys(segs)) {
    const lit = on.includes(k); if (!lit && !ghost) continue;
    g.fillStyle = lit ? color : ghost; const s = segs[k]; rr(g, s[0], s[1], s[2], s[3], t * 0.35); g.fill();
  }
  g.restore();
}

/** Atlas with the sharp, in-focus artwork: breadboard top, multimeter face, solder-spool label. */
function decalCanvas() {
  const c = mk(2048, 1100), g = c.getContext('2d');
  g.fillStyle = '#f1f0eb'; g.fillRect(0, 0, c.width, c.height);
  const R = rng(21);
  // ── breadboard top: 82 × 54.5 mm at 12.4 px/mm → 1017 × 676 px at (0, 0)
  { const k = 12.4, W = 82 * k, H = 54.5 * k;
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#f4f3ee'); gr.addColorStop(1, '#eceae4'); g.fillStyle = gr; g.fillRect(0, 0, W + 6, H + 6);
    const hole = (x, y) => { const s = 1.12 * k; g.fillStyle = 'rgba(180,176,166,0.9)'; rr(g, x * k - s / 2 - 1.5, y * k - s / 2 - 1.5, s + 3, s + 3, 2.5); g.fill(); g.fillStyle = '#26272a'; rr(g, x * k - s / 2, y * k - s / 2, s, s, 1.5); g.fill(); g.fillStyle = 'rgba(150,152,150,0.55)'; g.fillRect(x * k - s * 0.18, y * k - s * 0.3, s * 0.36, s * 0.6); };
    const colX = (i) => 4.17 + i * 2.54;
    const rowsA = [12.2, 14.74, 17.28, 19.82, 22.36], rowsB = [32.14, 34.68, 37.22, 39.76, 42.3];
    for (let i = 0; i < 30; i++) for (const y of [...rowsA, ...rowsB]) hole(colX(i), y);
    for (let i = 0; i < 25; i++) { const x = colX(i + 2 + Math.floor(i / 5)) - 1.27 * 0; for (const y of [3.7, 6.24, 48.26, 50.8]) hole(x, y); }
    // centre trench
    const ty = 27.25 * k, th = 3.1 * k, tg = g.createLinearGradient(0, ty - th / 2, 0, ty + th / 2);
    tg.addColorStop(0, '#9c9a93'); tg.addColorStop(0.18, '#c9c7c0'); tg.addColorStop(0.8, '#dddbd4'); tg.addColorStop(1, '#f6f5f0');
    g.fillStyle = tg; g.fillRect(0, ty - th / 2, W + 6, th);
    // rail lines + legends
    const line = (y, col) => { g.fillStyle = col; g.fillRect(3.2 * k, y * k - 2, W - 6.4 * k, 4); };
    line(1.9, '#c8493c'); line(8.0, '#3d6fb4'); line(46.5, '#c8493c'); line(52.6, '#3d6fb4');
    g.fillStyle = '#8f8d86'; g.font = `600 ${1.5 * k}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 30; i += 5) { const n = String(i === 0 ? 1 : i); g.fillText(n, colX(i === 0 ? 0 : i - 1) * k, 10.1 * k); g.fillText(n, colX(i === 0 ? 0 : i - 1) * k, 44.5 * k); }
    'abcde'.split('').forEach((ch, i) => { g.fillText(ch, 1.9 * k, rowsA[4 - i] * k); g.fillText(ch, W - 1.9 * k, rowsA[4 - i] * k); });
    'fghij'.split('').forEach((ch, i) => { g.fillText(ch, 1.9 * k, rowsB[4 - i] * k); g.fillText(ch, W - 1.9 * k, rowsB[4 - i] * k); });
    g.fillStyle = '#c8493c'; g.fillText('+', 1.8 * k, 3.7 * k); g.fillText('+', 1.8 * k, 48.26 * k); g.fillStyle = '#3d6fb4'; g.fillText('–', 1.8 * k, 6.24 * k); g.fillText('–', 1.8 * k, 50.8 * k);
  }
  // ── multimeter face: 68 × 130 mm at 7.8 px/mm → 530 × 1014 px at (1040, 0)
  { const k = 7.8, ox = 1040, oy = 0, W = 68 * k, H = 130 * k;
    g.save(); g.translate(ox, oy);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#303338'); bg.addColorStop(1, '#27292d'); g.fillStyle = bg; g.fillRect(-6, -6, W + 12, H + 12);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(255,255,255,${R() * 0.035})`; g.fillRect(R() * W, R() * H, 1.4, 1.4); }
    // LCD
    const lx = 7 * k, ly = 8 * k, lw = 54 * k, lh = 27 * k;
    g.fillStyle = '#0e0f11'; rr(g, lx - 10, ly - 10, lw + 20, lh + 20, 10); g.fill();
    const lg = g.createLinearGradient(0, ly, 0, ly + lh); lg.addColorStop(0, '#9ea894'); lg.addColorStop(0.2, '#b4bda8'); lg.addColorStop(1, '#bcc5af');
    g.fillStyle = lg; rr(g, lx, ly, lw, lh, 4); g.fill();
    const ink = 'rgba(22,27,20,0.92)', gh = 'rgba(22,27,20,0.07)';
    const dw = 8.2 * k, dh = 15.5 * k, dy = ly + 6.2 * k; let dx = lx + 6.5 * k;
    for (const ch of ['1', '2', '.', '0', '6']) {
      if (ch === '.') { g.fillStyle = ink; g.fillRect(dx - 1.0 * k, dy + dh - 1.5 * k, 1.5 * k, 1.5 * k); continue; }
      seg7(g, dx, dy, dw, dh, ch, ink, gh); dx += dw + 2.3 * k;
    }
    g.fillStyle = ink; g.font = `700 ${4.2 * k}px Arial, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText('V', lx + lw - 6.2 * k, dy + dh);
    g.font = `700 ${2.3 * k}px Arial, sans-serif`; g.fillText('DC', lx + 1.6 * k, ly + 4.2 * k); g.fillText('AUTO', lx + 8 * k, ly + 4.2 * k);
    // brand line
    g.fillStyle = '#c9ccd0'; g.font = `700 ${3.1 * k}px Arial, sans-serif`; g.textAlign = 'left'; g.fillText('DT-830D', 7 * k, 41.4 * k);
    g.fillStyle = '#8d9197'; g.font = `600 ${1.9 * k}px Arial, sans-serif`; g.textAlign = 'right'; g.fillText('DIGITAL MULTIMETER', 30 * k, 47.6 * k);
    // dial legend
    const cx = 34 * k, cy = 80.5 * k, labels = ['OFF', '600', '200', '20', '2', '200m', '200µ', '2m', '20m', '200m', '10A', 'hFE', '►|', '200', '2k', '20k', '200k', '2M', '200', '600'];
    const groupCol = (i) => (i === 0 ? '#f0efe9' : i <= 5 ? '#f0efe9' : i <= 10 ? '#e2a23a' : i <= 12 ? '#9fc3e6' : i <= 17 ? '#f0efe9' : '#e2695a');
    g.strokeStyle = '#17181a'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 22.6 * k, 0, 6.2832); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    labels.forEach((t, i) => {
      const a = -Math.PI / 2 + i / labels.length * Math.PI * 2, col = groupCol(i);
      g.fillStyle = col; g.fillRect(-0.5, -0.5, 0, 0);
      g.save(); g.translate(cx + Math.cos(a) * 24.2 * k, cy + Math.sin(a) * 24.2 * k); g.rotate(a); g.fillRect(-0.4 * k, -0.22 * k, 1.5 * k, 0.44 * k); g.restore();
      g.font = `700 ${(t.length > 3 ? 1.75 : 2.05) * k}px "Arial Narrow", Arial, sans-serif`;
      g.fillText(t, cx + Math.cos(a) * 29.2 * k, cy + Math.sin(a) * 28.4 * k);
    });
    g.font = `700 ${2.6 * k}px Arial, sans-serif`;
    g.fillStyle = '#f0efe9'; g.fillText('V⎓', 60.5 * k, 55 * k); g.fillStyle = '#e2a23a'; g.fillText('A⎓', 62 * k, 104 * k);
    g.fillStyle = '#f0efe9'; g.fillText('Ω', 6 * k, 104 * k); g.fillStyle = '#e2695a'; g.fillText('V~', 7.5 * k, 55 * k);
    // jack legends
    const jy = 116 * k; g.font = `700 ${2.2 * k}px Arial, sans-serif`;
    [['10A', 13, '#e2695a'], ['COM', 34, '#f0efe9'], ['VΩmA', 55, '#e2695a']].forEach(([t, x, col]) => {
      g.fillStyle = col; g.fillText(t, x * k, jy - 8.6 * k);
      g.strokeStyle = col; g.lineWidth = 2.2; g.beginPath(); g.arc(x * k, jy, 6.6 * k, 0, 6.2832); g.stroke();
    });
    g.fillStyle = '#8d9197'; g.font = `600 ${1.55 * k}px Arial, sans-serif`; g.fillText('CAT II 600 V   MAX 10 A', 34 * k, 127 * k);
    g.restore();
  }
  // ── solder spool label: Ø 55 mm at 8.7 px/mm → 480 × 480 px at (1580, 0)
  { const ox = 1580, oy = 0, S = 480, cx = ox + S / 2, cy = oy + S / 2;
    g.fillStyle = '#e9e7e0'; g.fillRect(ox - 4, oy - 4, S + 8, S + 8);
    disc(g, cx, cy, S / 2 - 22, '#f3efe4');
    g.strokeStyle = '#3d566f'; g.lineWidth = 26; g.beginPath(); g.arc(cx, cy, S / 2 - 46, Math.PI * 0.08, Math.PI * 0.92); g.stroke();
    g.strokeStyle = '#b5503c'; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, S / 2 - 72, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
    g.fillStyle = '#2b3138'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 50px "Arial Narrow", Arial, sans-serif'; g.fillText('Sn60 / Pb40', cx, cy - 122);
    g.font = '700 30px "Arial Narrow", Arial, sans-serif'; g.fillText('ROSIN CORE SOLDER', cx, cy - 78);
    g.font = '600 26px "Arial Narrow", Arial, sans-serif'; g.fillText('Ø 0.8 mm', cx - 118, cy + 6); g.fillText('100 g', cx + 124, cy + 6);
    g.fillStyle = '#f3efe4'; g.font = '700 22px "Arial Narrow", Arial, sans-serif';
    g.fillText('FLUX 2.2 %', cx, cy + 176);
  }
  return c;
}

/** The back wall, painted as an elevation (pegboard, shelf, instruments on the bench) and then defocused. */
function wallCanvas() {
  const W = 2048, k = W / WALL_W, H = Math.round(WALL_H * k), c = mk(W, H), g = c.getContext('2d'), R = rng(5);
  const X = (mm) => (mm + WALL_W / 2) * k, Y = (mm) => H - mm * k, S = (mm) => mm * k;
  const box = (x, y, w, h, fill, r = 0) => { g.fillStyle = fill; rr(g, X(x), Y(y + h), S(w), S(h), S(r)); g.fill(); };   // x, y = bottom-left (mm above the bench)
  const dot = (x, y, r, fill) => disc(g, X(x), Y(y), S(r), fill);
  const shade = (x, y, w, h, a = 0.16) => box(x - 14, y, w + 40, h + 10, `rgba(74,56,34,${a})`, 14);
  // wall paint: daylight from the left, warmer towards the lamp on the right
  const base = g.createLinearGradient(0, 0, W, 0);
  base.addColorStop(0, '#f4f2ec'); base.addColorStop(0.42, '#eeeae0'); base.addColorStop(0.75, '#ebe3d3'); base.addColorStop(1, '#e4d9c5');
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  const vg = g.createLinearGradient(0, 0, 0, H); vg.addColorStop(0, 'rgba(255,255,255,0.10)'); vg.addColorStop(0.7, 'rgba(255,255,255,0)'); vg.addColorStop(1, 'rgba(96,74,44,0.12)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  // pegboard
  shade(-1050, 322, 2100, 600, 0.1);
  box(-1050, 330, 2100, 600, '#e7dfce', 8);
  g.fillStyle = 'rgba(126,108,84,0.42)';
  for (let x = -1030; x <= 1030; x += 25) for (let y = 350; y <= 912; y += 25) { g.beginPath(); g.arc(X(x), Y(y), S(2.7), 0, 6.2832); g.fill(); }
  // tools on the pegboard (muted colours)
  const muted = ['#b5604c', '#c9a650', '#56789f', '#6d7278', '#b5604c', '#c9a650', '#56789f'];
  muted.forEach((col, i) => { const x = -900 + i * 46; shade(x, 610, 24, 88, 0.12); box(x + 8, 500, 7, 112, '#b9bdc0'); box(x, 610, 24, 88, col, 8); });
  for (let i = 0; i < 3; i++) { const x = -470 + i * 82; g.strokeStyle = muted[(i + 2) % 3]; g.lineWidth = S(13); g.lineCap = 'round'; g.beginPath(); g.moveTo(X(x - 4), Y(690)); g.lineTo(X(x - 22), Y(560)); g.moveTo(X(x + 4), Y(690)); g.lineTo(X(x + 22), Y(560)); g.stroke(); box(x - 13, 690, 26, 62, '#a9adb1', 6); }
  ['#b5604c', '#33363a', '#c9a650', '#56789f'].forEach((col, i) => { const x = -110 + i * 128; dot(x + 6, 632, 50, 'rgba(74,56,34,0.14)'); dot(x, 640, 48, col); dot(x, 640, 19, '#e9e2d2'); });
  box(450, 430, 28, 430, '#c2c6ca', 3); box(520, 520, 150, 200, '#f6f4ee', 4); box(532, 640, 126, 8, '#c9c4b6'); box(532, 610, 96, 8, '#c9c4b6'); box(532, 580, 116, 8, '#c9c4b6');
  dot(770, 700, 42, '#d9d2c0'); dot(770, 700, 24, '#e7dfce'); dot(870, 700, 34, '#8fa0ad'); dot(870, 700, 20, '#e7dfce');
  for (let i = 0; i < 12; i++) { const x = -960 + i * 160; shade(x, 362, 126, 66, 0.1); box(x, 362, 126, 66, ['#8fa3b5', '#c9a650', '#b5604c', '#8fa3b5'][i % 4], 6); box(x + 8, 404, 110, 18, 'rgba(255,255,255,0.22)', 4); }
  // shelf with boxes
  box(-1260, 968, 2520, 14, 'rgba(74,56,34,0.22)', 4); box(-1260, 982, 2520, 32, '#cdb38c', 3);
  { let x = -1220; const cols = ['#dccdaa', '#f0ece2', '#b9c3c9', '#cdbb9c', '#93a5b4', '#e6dcc8', '#c9b7a2'];
    while (x < 1180) { const w = 110 + R() * 170, h = 110 + R() * 190; box(x, 1014, w, h, cols[(R() * cols.length) | 0], 5); if (R() < 0.6) box(x + w * 0.2, 1014 + h * 0.4, w * 0.6, h * 0.2, 'rgba(255,255,255,0.35)', 3); x += w + 16 + R() * 60; } }
  // power strip on the wall
  box(-330, 236, 470, 40, '#f5f4ef', 8); for (let i = 0; i < 5; i++) dot(-280 + i * 86, 256, 13, '#dad8d0');
  // on the bench: parts cabinet (pale, left), oscilloscope (centre-right), bench supply, bottles
  shade(-640, 0, 300, 236, 0.14);
  box(-640, 0, 300, 236, '#e3e5e4', 8);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) { box(-630 + i * 71, 8 + j * 45, 65, 39, '#cdd7dc', 4); box(-612 + i * 71, 22 + j * 45, 29, 9, '#eef1f1', 3); }
  shade(-24, 0, 344, 180, 0.2);
  box(-24, 0, 344, 180, '#d5d6d3', 12); box(-10, 26, 196, 142, '#22262a', 8); box(-2, 34, 180, 126, '#0c2028', 4);
  g.strokeStyle = 'rgba(120,170,180,0.22)'; g.lineWidth = 1; for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(X(-2 + i * 22.5), Y(34)); g.lineTo(X(-2 + i * 22.5), Y(160)); g.stroke(); } for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(X(-2), Y(34 + i * 21)); g.lineTo(X(178), Y(34 + i * 21)); g.stroke(); }
  const trace = (col, amp, per, ph, y0, lw) => { g.strokeStyle = col; g.lineWidth = S(lw); g.lineJoin = 'round'; g.shadowColor = col; g.shadowBlur = 14; g.beginPath(); for (let x = 0; x <= 176; x += 2) { const y = y0 + amp * Math.sin(x / per * 6.2832 + ph); if (!x) g.moveTo(X(x), Y(y)); else g.lineTo(X(x), Y(y)); } g.stroke(); g.stroke(); g.shadowBlur = 0; };
  trace('#ffe36a', 34, 58, 0.4, 112, 5); trace('#63e6f2', 16, 29, 1.4, 66, 4);
  [[228, 132], [282, 132], [228, 84], [282, 84]].forEach(([x, y]) => { dot(x + 2, y - 3, 19, 'rgba(60,60,60,0.25)'); dot(x, y, 17, '#8c9094'); dot(x, y, 9, '#a7abaf'); });
  for (let i = 0; i < 4; i++) box(206 + i * 26, 40, 18, 12, ['#9aa0a6', '#9aa0a6', '#e2a23a', '#7fb3e0'][i], 3);
  dot(30, 14, 8, '#b9bdc1'); dot(100, 14, 8, '#b9bdc1');
  shade(376, 0, 226, 158, 0.2);
  box(376, 0, 226, 158, '#e9e6dd', 10); box(388, 70, 202, 76, '#17191c', 6);
  g.textBaseline = 'middle'; g.textAlign = 'center'; g.font = `700 ${S(46)}px "Courier New", monospace`;
  g.shadowBlur = 16; g.shadowColor = '#ff5a48'; g.fillStyle = '#ff6a58'; g.fillText('12.0', X(438), Y(108)); g.fillText('12.0', X(438), Y(108));
  g.shadowColor = '#ffc04a'; g.fillStyle = '#ffc95e'; g.fillText('0.35', X(540), Y(108)); g.fillText('0.35', X(540), Y(108)); g.shadowBlur = 0;
  dot(412, 38, 15, '#878b90'); dot(456, 38, 15, '#878b90'); dot(512, 30, 11, '#c2463a'); dot(542, 30, 11, '#2a2b2d'); dot(572, 30, 11, '#5f9a6a');
  shade(660, 0, 50, 128, 0.14); box(660, 0, 50, 112, '#eef2f3', 10); box(672, 112, 26, 18, '#56789f', 4);
  shade(724, 0, 44, 96, 0.14); box(724, 0, 44, 86, '#d9c8a4', 9); box(735, 86, 22, 14, '#3c3e42', 3);
  // light: window glow from the left, warm lamp pool on the right, contact shade along the bench
  const wl = g.createLinearGradient(0, 0, X(-250), 0); wl.addColorStop(0, 'rgba(255,255,255,0.34)'); wl.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = wl; g.fillRect(0, 0, W, H);
  const lp = g.createRadialGradient(X(360), Y(210), 0, X(360), Y(210), S(620)); lp.addColorStop(0, 'rgba(255,214,150,0.30)'); lp.addColorStop(1, 'rgba(255,214,150,0)'); g.fillStyle = lp; g.fillRect(0, 0, W, H);
  const out = blur(c, 3.0), o = out.getContext('2d');
  const ao = o.createLinearGradient(0, H - S(46), 0, H); ao.addColorStop(0, 'rgba(84,62,36,0)'); ao.addColorStop(1, 'rgba(84,62,36,0.34)'); o.fillStyle = ao; o.fillRect(0, H - S(46), W, S(46));
  return out;
}

/** Six 512-px tiles of the rest of the room, heavily blurred: left wall (window), far wall, right wall, floor, ceiling, wall under the bench. */
function roomCanvas() {
  const T = 512, atlas = mk(T * 3, T * 2), ag = atlas.getContext('2d'), R = rng(9);
  const tile = (i, j, paint, px) => { const c = mk(T, T), g = c.getContext('2d'); paint(g); ag.drawImage(px ? blur(c, px) : c, i * T, j * T); };
  const hY = (mm) => T * (1 - (mm - ROOM.y0) / (ROOM.y1 - ROOM.y0));           // height (mm) → canvas y on a wall tile
  const wallBase = (g, a, b) => { const gr = g.createLinearGradient(0, 0, 0, T); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, T, T); g.fillStyle = 'rgba(120,100,76,0.35)'; g.fillRect(0, hY(-760 + 90), T, T); };
  // left wall: u 0 = front of the room (z = z1) … 1 = back wall
  tile(0, 0, (g) => {
    wallBase(g, '#f1eee6', '#e3ddd0');
    const zU = (z) => T * (ROOM.z1 - z) / (ROOM.z1 - WALL_Z);
    const x0 = zU(1050), x1 = zU(-80), y0 = hY(1320), y1 = hY(150);
    const halo = g.createRadialGradient((x0 + x1) / 2, (y0 + y1) / 2, 40, (x0 + x1) / 2, (y0 + y1) / 2, 330); halo.addColorStop(0, 'rgba(255,255,255,0.75)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = halo; g.fillRect(0, 0, T, T);
    const sky = g.createLinearGradient(0, y0, 0, y1); sky.addColorStop(0, '#ffffff'); sky.addColorStop(0.6, '#f6faff'); sky.addColorStop(1, '#e7efe9');
    g.fillStyle = sky; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = '#ece9e1'; g.fillRect((x0 + x1) / 2 - 3, y0, 6, y1 - y0); g.fillRect(x0, (y0 + y1) / 2 - 2, x1 - x0, 5);
    g.strokeStyle = '#f3f1ea'; g.lineWidth = 8; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = '#ddd7ca'; g.fillRect(x0 - 8, y1, x1 - x0 + 16, 9);
  }, 5);
  // far wall (behind the default camera): u 0 = x +1500 … 1 = x −1500. Calm on the +x side.
  tile(1, 0, (g) => {
    wallBase(g, '#ece6da', '#ddd5c6');
    const xU = (x) => T * (ROOM.x - x) / (2 * ROOM.x);
    g.fillStyle = '#d6cfc0'; g.fillRect(xU(1400), hY(-120), xU(380) - xU(1400), hY(-760) - hY(-120));
    g.fillStyle = '#c7b596'; g.fillRect(xU(1420), hY(-110), xU(360) - xU(1420), 7);
    g.fillStyle = '#eeeae1'; g.fillRect(xU(1150), hY(900), xU(500) - xU(1150), hY(320) - hY(900));
    g.fillStyle = '#c4b69d'; g.fillRect(xU(-380), hY(1000), xU(-1250) - xU(-380), hY(-760) - hY(1000));
    for (let j = 0; j < 6; j++) { let x = -400; while (x > -1230) { const w = 60 + R() * 150; g.fillStyle = ['#d9cdb2', '#93a5b4', '#eee9dd', '#b9886c', '#cbb89a', '#7f8a94'][(R() * 6) | 0]; g.fillRect(xU(x), hY(-640 + j * 270 + 190), xU(x - w) - xU(x), hY(0) - hY(150 + R() * 40)); x -= w + 14; } }
    g.fillStyle = '#c9b696'; g.fillRect(xU(260), hY(-20), xU(-300) - xU(260), 9); g.fillStyle = '#b9ae9c'; g.fillRect(xU(240), hY(-30), xU(-280) - xU(240), hY(-760) - hY(-30));
    g.fillStyle = '#2f353c'; g.fillRect(xU(120), hY(340), xU(-200) - xU(120), hY(20) - hY(340)); g.fillStyle = '#a9cbe6'; g.fillRect(xU(104), hY(324), xU(-184) - xU(104), hY(44) - hY(324));
    const lamp = g.createRadialGradient(xU(-60), hY(620), 0, xU(-60), hY(620), 90); lamp.addColorStop(0, 'rgba(255,226,170,0.9)'); lamp.addColorStop(1, 'rgba(255,226,170,0)'); g.fillStyle = lamp; g.fillRect(0, 0, T, T);
    g.fillStyle = '#d2c9b9'; g.fillRect(xU(-1290), hY(1300), 44, hY(-760) - hY(1300));
  }, 6);
  // right wall: u 0 = back wall … 1 = front of the room
  tile(2, 0, (g) => {
    wallBase(g, '#ece3d2', '#dccfb9');
    const zU = (z) => T * (z - WALL_Z) / (ROOM.z1 - WALL_Z);
    g.fillStyle = '#d5c8b1'; g.fillRect(zU(-250), hY(-90), zU(1700) - zU(-250), hY(-760) - hY(-90)); g.fillStyle = '#bfa680'; g.fillRect(zU(-260), hY(-80), zU(1720) - zU(-260), 8);
    for (let i = 0; i < 7; i++) { const z = -200 + i * 250 + R() * 60, w = 90 + R() * 110, h = 90 + R() * 200; g.fillStyle = ['#e9e3d6', '#93a5b4', '#cbb28c', '#b9886c', '#dcd3c0'][(R() * 5) | 0]; g.fillRect(zU(z), hY(-80 + h), zU(z + w) - zU(z), hY(0) - hY(h)); }
    g.fillStyle = '#c9b594'; g.fillRect(zU(-200), hY(760), zU(1500) - zU(-200), 8);
    for (let i = 0; i < 9; i++) { const z = -160 + i * 180 + R() * 40, w = 70 + R() * 90, h = 100 + R() * 160; g.fillStyle = ['#e9e3d6', '#8fa0ad', '#cbb28c', '#d9c9a8', '#a5846a'][(R() * 5) | 0]; g.fillRect(zU(z), hY(768 + h), zU(z + w) - zU(z), hY(0) - hY(h)); }
    const lamp = g.createRadialGradient(zU(480), hY(210), 0, zU(480), hY(210), 120); lamp.addColorStop(0, 'rgba(255,220,160,0.85)'); lamp.addColorStop(1, 'rgba(255,220,160,0)'); g.fillStyle = lamp; g.fillRect(0, 0, T, T);
  }, 6);
  // floor: canvas top = back wall, x left → right
  tile(0, 1, (g) => {
    g.fillStyle = '#b9a98f'; g.fillRect(0, 0, T, T);
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,240,214' : '90,66,40'},${0.05 + R() * 0.07})`; g.fillRect(0, i * 20, T, 18); }
    g.fillStyle = 'rgba(255,244,222,0.6)'; g.beginPath(); g.moveTo(0, 60); g.lineTo(250, 110); g.lineTo(215, 300); g.lineTo(0, 290); g.fill();
    const sh = g.createLinearGradient(0, 0, 0, 150); sh.addColorStop(0, 'rgba(50,36,22,0.5)'); sh.addColorStop(1, 'rgba(50,36,22,0)'); g.fillStyle = sh; g.fillRect(60, 0, 390, 150);
  }, 9);
  // ceiling
  tile(1, 1, (g) => { g.fillStyle = '#f3efe6'; g.fillRect(0, 0, T, T); g.fillStyle = '#ffffff'; g.fillRect(120, 150, 110, 60); g.fillRect(300, 150, 110, 60); g.fillRect(120, 330, 110, 60); g.fillRect(300, 330, 110, 60); }, 12);
  // wall below the bench top (in the bench's shade)
  tile(2, 1, (g) => { const gr = g.createLinearGradient(0, 0, 0, T); gr.addColorStop(0, '#9f9482'); gr.addColorStop(0.3, '#b7ad9b'); gr.addColorStop(1, '#c9c0af'); g.fillStyle = gr; g.fillRect(0, 0, T, T); }, 0);
  return atlas;
}

// ───────────────────────── static geometry ─────────────────────────
function deskGeometry() {
  const top = -MAT_T, r = 5, P = [];                         // profile points [z, y, nz, ny], back → front → down → under
  P.push([DESK_Z0, top, 0, 1], [DESK_Z1 - r, top, 0, 1]);
  for (let i = 1; i <= 6; i++) { const a = i / 6 * Math.PI / 2; P.push([DESK_Z1 - r + r * Math.sin(a), top - r + r * Math.cos(a), Math.sin(a), Math.cos(a)]); }
  P.push([DESK_Z1, top - DESK_T, 0, 1e-6 + 0], [DESK_Z1, top - DESK_T, 0, -1], [DESK_Z1 - 160, top - DESK_T, 0, -1]);
  P[P.length - 3][2] = 1; P[P.length - 3][3] = 0;
  const pos = [], nor = [], uv = [], idx = []; let s = 0;
  P.forEach((p, i) => {
    if (i) s += Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]);
    for (const x of [-DESK_W / 2, DESK_W / 2]) { pos.push(x, p[1], p[0]); nor.push(0, p[3], p[2]); uv.push(x / WOOD_TILE, -s / WOOD_TILE); }
    if (i) { const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1; idx.push(a, c, b, b, c, d); }
  });
  for (const sx of [-1, 1]) {                                 // end grain caps
    const x = sx * DESK_W / 2, n = pos.length / 3;
    for (const [z, y] of [[DESK_Z0, top], [DESK_Z1 - r, top], [DESK_Z1 - r, top - DESK_T], [DESK_Z0, top - DESK_T]]) { pos.push(x, y, z); nor.push(sx, 0, 0); uv.push(z / WOOD_TILE, y / WOOD_TILE); }
    if (sx > 0) idx.push(n, n + 1, n + 2, n, n + 2, n + 3); else idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); return g;
}

function roomGeometry() {
  const T = 512, AW = T * 3, AH = T * 2, list = [];
  const face = (i, j, w, h, place) => {
    const g = new THREE.PlaneGeometry(w, h);
    remapUV(g, [(i * T + 4) / AW, 1 - ((j + 1) * T - 4) / AH, ((i + 1) * T - 4) / AW, 1 - (j * T + 4) / AH]);
    place(g); list.push(g.toNonIndexed());
  };
  const { x, z1, y0, y1 } = ROOM, depth = z1 - WALL_Z, zc = (z1 + WALL_Z) / 2, hgt = y1 - y0, yc = (y1 + y0) / 2;
  face(0, 0, depth, hgt, (g) => g.rotateY(Math.PI / 2).translate(-x, yc, zc));
  face(1, 0, 2 * x, hgt, (g) => g.rotateY(Math.PI).translate(0, yc, z1));
  face(2, 0, depth, hgt, (g) => g.rotateY(-Math.PI / 2).translate(x, yc, zc));
  face(0, 1, 2 * x, depth, (g) => g.rotateX(-Math.PI / 2).translate(0, y0, zc));
  face(1, 1, 2 * x, depth, (g) => g.rotateX(Math.PI / 2).translate(0, y1, zc));
  face(2, 1, 2 * x, -MAT_T - y0, (g) => g.translate(0, (y0 - MAT_T) / 2, WALL_Z));
  const pos = [], uv = [];
  for (const g of list) { pos.push(...g.attributes.position.array); uv.push(...g.attributes.uv.array); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

// ───────────────────────── props ─────────────────────────
function resistor(k, sw, x, z, ry, bands, lead = 20, body = '#d6bd8a') {
  k.push(x, 1.25, z, ry);
  k.lathe([[0.02, -3.15], [0.9, -3.05], [1.22, -2.5], [1.25, -1.8], [1.02, -1.25], [1.0, 1.25], [1.25, 1.8], [1.22, 2.5], [0.9, 3.05], [0.02, 3.15]], sw(body, 0.45), 0, 0, 0, { axis: 'x', seg: 14 });
  bands.forEach((c, i) => k.cyl([1.27, 1.04, 1.04, 1.27][i] ?? 1.04, 0.55, sw(c, 0.4), [-2.1, -0.75, 0.25, 2.1][i], 0, 0, { axis: 'x', seg: 14, open: true }));
  const tin = sw('#cfd2d2', 0.3, 1);
  k.cyl(0.28, lead, tin, -3.1 - lead / 2, 0, 0, { axis: 'x', seg: 8 }); k.cyl(0.28, lead, tin, 3.1 + lead / 2, 0, 0, { axis: 'x', seg: 8 });
  k.pop();
}
function ledLoose(k, sw, x, z, ry, color) {
  k.push(x, 2.95, z, ry, 0, 5);
  k.lathe([[0.02, 0], [2.9, 0], [2.9, 1.0], [2.5, 1.05], [2.5, 6.1], [2.2, 7.4], [1.4, 8.3], [0.02, 8.6]], sw(color, 0.16), 0, 0, 0, { axis: 'x', seg: 18 });
  const tin = sw('#cfd2d2', 0.3, 1);
  k.cyl(0.26, 25, tin, -12.5, 0, 1.27, { axis: 'x', seg: 8 }); k.cyl(0.26, 22, tin, -11, 0, -1.27, { axis: 'x', seg: 8 });
  k.pop();
}

/** Solder spool lying on its flange + a curl of solder wire. Origin = spool centre on the mat. */
function buildBack(sw, decalMat, DEC) {
  const k = new Kit();
  const plastic = sw('#dcdcd6', 0.36), solder = sw('#e4e6e7', 0.24, 1);
  k.lathe([[8, 0.3], [8.4, 0], [27.1, 0], [27.5, 0.4], [27.5, 1.9], [27.1, 2.3], [11.4, 2.3], [11, 2.7], [11, 29.7], [11.4, 30.1], [27.1, 30.1], [27.5, 30.5], [27.5, 32.0], [27.1, 32.4], [8.4, 32.4], [8, 32.1], [8, 0.3]], plastic, 0, 0, 0, { seg: 48 });
  const wind = []; for (let i = 0; i <= 54; i++) wind.push([i % 2 ? 21.5 : 20.75, 2.4 + i * 0.51]);
  k.lathe(wind, solder, 0, 0, 0, { seg: 40 });
  { const g = new THREE.RingGeometry(9.2, 26.4, 48); g.rotateX(-Math.PI / 2); remapUV(g, DEC.spool); k.tex(g.translate(0, 32.46, 0), decalMat); }
  k.cyl(7.9, 0.4, sw('#101112', 0.9), 0, 0.6, 0, { seg: 20 });
  k.tube([V(20.6, 12, -9), V(21.6, 11.6, 0), V(23, 9.6, 10), V(25.5, 5.6, 20), V(29, 1.6, 29), V(34, 0.45, 37), V(41, 0.42, 44), V(48.5, 0.5, 47.5), V(55, 1.6, 46.5), V(59, 4.4, 42.5), V(59.5, 7.4, 37.5), V(57, 9.6, 33.5)], 0.42, solder, { rad: 6 });
  return k.build('lab-solder');
}

/** Digital multimeter with its two probes. Origin: left edge of the group (nearest the board); everything sits at x ≥ 6. */
function buildRight(sw, decalMat, DEC) {
  const k = new Kit();
  const bumper = sw('#b3944c', 0.78), face = sw('#2a2c30', 0.5), knob = sw('#3a3d42', 0.42), blk = sw('#1a1b1d', 0.55), red = sw('#993328', 0.52), tip = sw('#d9dcde', 0.16, 1);
  const leads = [];
  k.push(98, 0, -52, -14);
  k.rbox(80, 36, 142, 8.5, bumper, 0, 18, 0, 4);
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) k.rbox(2.2, 20, 7, 1, bumper, sx * 40.2, 18, -30 + i * 15);       // grip ribs
  k.rbox(70.5, 3, 132.5, 1.3, face, 0, 35.72, 0, 2);                                   // face plate, top at 37.22
  k.decal(68, 130, decalMat, DEC.meter, 0, 37.27, 0);
  k.lathe([[0.02, 0], [21.2, 0], [21.2, 2.6], [19.8, 4.4], [0.02, 4.4]], knob, 0, 37.2, 15.5, { seg: 44 });
  k.push(0, 41.6, 15.5, -54);
  k.rbox(8.4, 5, 40, 1.8, sw('#45484e', 0.4), 0, 2.2, 0, 3); k.box(1.5, 0.3, 12, sw('#f0efe9', 0.5), 0, 4.76, -13);
  k.pop();
  for (const [jx, col, plugged] of [[-21, red, false], [0, blk, true], [21, red, true]]) {
    k.cyl(5.3, 2.4, col, jx, 38.4, 51.5, { seg: 24 });
    if (!plugged) { k.cyl(2.5, 0.3, sw('#060606', 0.9), jx, 39.72, 51.5, { seg: 16 }); k.cyl(1.0, 0.5, sw('#b9a05a', 0.3, 1), jx, 39.7, 51.5, { seg: 10 }); continue; }
    k.cyl(3.9, 13.5, col, jx, 46, 51.5, { seg: 20 }); k.sphere(3.9, col, jx, 52.7, 51.5, { sy: 0.55, seg: 14 });
    k.cyl(3.3, 14, col, jx, 49, 58.5, { axis: 'z', seg: 16 });
    k.lathe([[0.02, 0], [3.3, 0], [3.3, 1.2], [2.8, 1.6], [2.8, 4], [2.4, 4.4], [2.4, 7], [2.0, 7.4], [2.0, 10.5], [0.02, 10.6]], col, jx, 49, 65.4, { axis: 'z', seg: 14 });
    leads.push({ col, a: [k.pt(jx, 49, 74), k.pt(jx, 48.4, 80), k.pt(jx + 0.6, 40, 87.5), k.pt(jx + 1.4, 22, 91.5), k.pt(jx + 2.4, 7, 95), k.pt(jx + 3.4, 1.9, 101)] });
  }
  for (const sx of [-1, 1]) k.rbox(9, 1.6, 4.6, 0.7, sw(sx < 0 ? '#c9a23f' : '#55585d', 0.5), sx * 7 + 19, 37.9, -17);   // HOLD / light buttons
  k.pop();
  // probes lie alongside the meter, tips pointing away from the viewer
  const probe = (col, x, z, ry) => {
    k.push(x, 2.7, z, ry, -3.9);
    k.lathe([[0.02, 0], [2.3, 0], [3.2, 2.4], [4.3, 9], [4.7, 30], [4.6, 52], [6.4, 54], [6.4, 56.4], [4.3, 58], [3.7, 74], [2.4, 78.5], [2.3, 81], [0.02, 81]], col, 0, 0, 0, { axis: 'z', seg: 20 });
    for (let i = 0; i < 5; i++) k.lathe([[4.6, 0], [4.95, 0.45], [4.95, 1.35], [4.6, 1.8]], col, 0, 0, 14 + i * 4.2, { axis: 'z', seg: 20 });
    k.lathe([[0.02, 0], [1.0, 0], [1.0, 15], [0.5, 18.5], [0.08, 20]], tip, 0, 0, 80.6, { axis: 'z', seg: 12 });
    const rear = k.pt(0, 0, -0.5), rear2 = k.pt(0, -0.25, -10);
    k.pop(); return [rear2, rear];
  };
  const pB = probe(blk, 27, 6, 178.5), pR = probe(red, 12, 9, 181.5);
  const y = 1.75;
  k.tube([...leads[0].a, V(62, y, 51), V(47, y, 48.5), V(35.5, y, 39), V(29.5, y, 26), ...pB], 1.7, blk, { rad: 7 });
  k.tube([...leads[1].a, V(84, y, 60.5), V(60, y, 62), V(38, y, 56), V(21, y, 42), V(13.6, y, 27), ...pR], 1.7, red, { rad: 7 });
  return k.build('lab-meter');
}

/** Half-size breadboard with jumpers and a precision screwdriver. Origin: middle of the board's front edge; everything at z ≥ 24. */
function buildFront(sw, decalMat, DEC) {
  const k = new Kit();
  const chrome = sw('#dcdfe1', 0.15, 1), tin = sw('#cfd2d2', 0.3, 1);
  // precision screwdriver, lying in front of the breadboard
  { k.push(118, 5.5, 114, 183, 0, -2.05);
    k.lathe([[0.02, 0], [3.3, 0], [4.3, 1], [4.3, 7.2], [3.5, 8.2], [0.02, 8.2]], sw('#202124', 0.5), 0, 0, 0, { axis: 'x', seg: 24 });
    const prof = [[0.02, 8.4], [3.4, 8.4], [5.3, 10.2]];
    for (let i = 0; i < 9; i++) { const t = 12.5 + i * 4.6; prof.push([5.5, t], [5.5, t + 2.6], [4.9, t + 3.1], [4.9, t + 4.1]); }
    prof.push([5.4, 54.5], [5.4, 60], [3.6, 67], [2.6, 71], [2.6, 73.5], [0.02, 73.5]);
    k.lathe(prof, sw('#b9bdc1', 0.4, 1), 0, 0, 0, { axis: 'x', seg: 28 });
    k.lathe([[0.02, 73], [1.5, 73], [1.5, 134], [1.2, 137.5], [0.35, 141.6], [0.02, 142]], chrome, 0, 0, 0, { axis: 'x', seg: 14 });
    k.pop(); }
  // breadboard
  { k.push(66, 0, 72, 6);
    const body = sw('#eeede8', 0.5);
    k.rbox(82, 8.5, 54.5, 1.1, body, 0, 4.25, 0, 2);
    k.decal(81.2, 53.7, decalMat, DEC.bread, 0, 8.53, 0);
    const hx = (i) => -41 + 4.17 + i * 2.54, hz = (y) => -27.25 + y;
    const rowsA = [12.2, 14.74, 17.28, 19.82, 22.36], rowsB = [32.14, 34.68, 37.22, 39.76, 42.3];
    const jumper = (col, a, b, h, off = 0) => {
      const c = sw(col, 0.55), A = V(hx(a[0]), 8.5, hz(a[1])), B = V(hx(b[0]), 8.5, hz(b[1])), m = A.clone().lerp(B, 0.5);
      k.tube([A.clone().setY(13), A.clone().setY(16.5).lerp(m.clone().setY(16.5), 0.05), A.clone().lerp(B, 0.28).setY(8.5 + h * 0.86).add(V(0, 0, off)), m.clone().setY(8.5 + h).add(V(0, 0, off * 1.5)), A.clone().lerp(B, 0.72).setY(8.5 + h * 0.86).add(V(0, 0, off)), B.clone().setY(16.5).lerp(m.clone().setY(16.5), 0.05), B.clone().setY(13)], 0.75, c, { rad: 6 });
      for (const p of [A, B]) { k.cyl(1.15, 6.5, sw('#1c1d1f', 0.6), p.x, 11.6, p.z, { seg: 10 }); k.cyl(0.32, 1.2, tin, p.x, 8.9, p.z, { seg: 6 }); }
    };
    jumper('#c9a23f', [3, rowsA[1]], [12, 3.7], 17, -3);
    jumper('#b5503c', [22, rowsB[2]], [27, 48.26], 13, 2);
    jumper('#e7e5de', [8, rowsA[3]], [17, rowsB[1]], 21, 0);
    jumper('#56789f', [14, rowsA[0]], [25, rowsA[2]], 15, -4);
    // an LED and a resistor plugged in
    const lx = hx(19), lz = hz(rowsB[0]);
    k.lathe([[0.02, 0], [2.9, 0], [2.9, 1.0], [2.5, 1.05], [2.5, 6.1], [2.2, 7.4], [1.4, 8.3], [0.02, 8.6]], sw('#d8452f', 0.16), lx + 1.27, 12.5, lz, { seg: 18 });
    k.cyl(0.26, 4.2, tin, lx, 10.5, lz, { seg: 6 }); k.cyl(0.26, 4.2, tin, lx + 2.54, 10.5, lz, { seg: 6 });
    { const a = V(hx(21), 8.6, hz(rowsB[0])), b = V(hx(21), 8.6, hz(rowsA[2]));
      k.tube([a, a.clone().setY(11.4), a.clone().setY(12.4).lerp(b.clone().setY(12.4), 0.12), b.clone().setY(12.4).lerp(a.clone().setY(12.4), 0.12), b.clone().setY(11.4), b], 0.28, tin, { rad: 6, caps: false });
      const mz = (a.z + b.z) / 2;
      k.lathe([[0.02, -3.15], [0.9, -3.05], [1.22, -2.5], [1.25, -1.8], [1.02, -1.25], [1.0, 1.25], [1.25, 1.8], [1.22, 2.5], [0.9, 3.05], [0.02, 3.15]], sw('#d6bd8a', 0.45), a.x, 12.4, mz, { axis: 'z', seg: 14 });
      ['#a8412f', '#a8412f', '#6b4a2b', '#c9a23f'].forEach((c, i) => k.cyl([1.27, 1.04, 1.04, 1.27][i], 0.55, sw(c, 0.4), a.x, 12.4, mz + [-2.1, -0.75, 0.25, 2.1][i], { axis: 'z', seg: 14, open: true })); }
    // one jumper trails off the breadboard towards the board
    const s = k.pt(hx(1), 8.5, hz(rowsA[0]));
    k.pop();
    const c = sw('#e7e5de', 0.55);
    k.tube([s.clone().setY(13), s.clone().add(V(-0.6, 10, -1.2)), s.clone().add(V(-3.6, 10.6, -8)), V(s.x - 7.5, 12.2, 44.5), V(s.x - 10.5, 3.4, 38.6), V(s.x - 13.4, 1.0, 35.6), V(s.x - 16, 0.9, 33.4)], 0.75, c, { rad: 6 });
    k.cyl(1.15, 6.5, sw('#1c1d1f', 0.6), s.x, 11.6, s.z, { seg: 10 });
    k.push(s.x - 16, 1.2, 33.4, -38); k.rbox(8, 2.4, 2.4, 0.4, sw('#1c1d1f', 0.6), -3, 0, 0); k.cyl(0.32, 7, tin, -10, 0, 0, { axis: 'x', seg: 6 }); k.pop(); }
  return k.build('lab-front');
}

/** USB-C cable (plug towards the board, loose coil, cable running off the front of the bench), fine tweezers and a few loose parts. Origin = plug tip. */
function buildLeft(sw, zEdge) {
  const k = new Kit();
  const shell = sw('#cfd2d4', 0.24, 1), mold = sw('#d9d7d0', 0.45), cable = sw('#d2d0c9', 0.52);
  k.rbox(6.8, 2.56, 8.34, 1.15, shell, -3.4, 3.25, 0, 3);
  k.box(0.2, 1.3, 6.9, sw('#0b0b0c', 0.8), -0.06, 3.25, 0);
  k.rbox(19, 6.2, 11.4, 2.2, mold, -16, 3.25, 0, 3);
  k.push(-25.3, 3.25, 0, 180);
  k.lathe([[0.02, 0], [3.2, 0], [3.2, 1.6], [2.7, 2.0], [2.7, 4.2], [3.0, 4.6], [3.0, 6.2], [2.6, 6.6], [2.6, 8.8], [2.85, 9.2], [2.85, 10.8], [2.4, 11.2], [2.2, 15], [0.02, 15]], mold, 0, 0, 0, { axis: 'x', seg: 16 });
  k.pop();
  const r = 1.6, pts = [V(-39, 3.25, 0), V(-50, 2.6, 0.2), V(-63, 1.8, 1.5), V(-80, r, 3.6), V(-97, r, 5.6)];
  const cx = -118, cz = 40, a0 = -78, a1 = -900, mz1 = MAT_Z1 - 6;
  for (let i = 1; i <= 46; i++) { const t = i / 46, a = a0 + (a1 - a0) * t, rad = 35.5 - 10.5 * t; pts.push(V(cx + rad * Math.cos(a * DEG), r, cz + rad * Math.sin(a * DEG))); }
  // the inner end climbs over the turns and leaves towards the front edge of the bench
  pts.push(V(cx - 24.6, r + 1.2, cz + 9), V(cx - 24.4, r + 3.6, cz + 17), V(cx - 24.6, r + 3.9, cz + 25), V(cx - 25.6, r + 2.4, cz + 33), V(cx - 27, r, cz + 42),
    V(cx - 28, r, cz + 70), V(cx - 24, r, cz + 104), V(cx - 14, r, mz1 - 16), V(cx - 8, r - 0.6, mz1 - 4), V(cx - 4, r - MAT_T, mz1 + 8), V(cx + 6, r - MAT_T, mz1 + 60),
    V(cx + 10, r - MAT_T, zEdge - 16), V(cx + 10.5, r - MAT_T - 1.5, zEdge - 2), V(cx + 10.5, -MAT_T - 9, zEdge + 3.4), V(cx + 10.5, -MAT_T - 60, zEdge + 4.2), V(cx + 10, -MAT_T - 240, zEdge + 5));
  k.tube(pts, r, cable, { rad: 8, seg: 420 });
  const steel = sw('#c9cdd0', 0.26, 1);
  // tweezers: two tapered blades welded at the back, lying on one blade
  { const L = 118, hw = (x) => (x < 4 ? 2.2 + 2.4 * Math.sqrt(x / 4) : x < 48 ? 4.6 : x < 98 ? 4.6 - 3.2 * (x - 48) / 50 : 1.4 - 1.12 * (x - 98) / 20);
    const s = new THREE.Shape(), xs = [0, 0.6, 1.6, 4, 12, 48, 60, 74, 88, 98, 108, L];
    xs.forEach((x, i) => (i ? s.lineTo(x, hw(x)) : s.moveTo(x, hw(x)))); [...xs].reverse().forEach((x) => s.lineTo(x, -hw(x))); s.closePath();
    const coat = new THREE.Shape(), cs = [0, 0.6, 1.6, 4, 12, 48, 66], esd = sw('#232427', 0.72);          // black ESD coating on the grip
    cs.forEach((x, i) => (i ? coat.lineTo(x, hw(x) + 0.14) : coat.moveTo(x, hw(x) + 0.14))); [...cs].reverse().forEach((x) => coat.lineTo(x, -hw(x) - 0.14)); coat.closePath();
    k.push(-70, 0, 133, 57.1);
    k.ext(s, 1.0, steel, 0, 0.02, 0, { bevel: 0.22 }); k.ext(coat, 1.3, esd, 0, 0, 0, { bevel: 0.25 });
    k.push(0, 1.32, 0, 0, 0, 4.2); k.ext(s, 1.0, steel, 0, 0.02, 0, { bevel: 0.22 }); k.ext(coat, 1.3, esd, 0, -0.13, 0, { bevel: 0.25 }); k.pop();
    k.rbox(13, 2.9, 8.9, 0.6, esd, 6.5, 1.5, 0);
    k.pop(); }
  // loose parts behind the plug
  resistor(k, sw, -34, -24, 22, ['#6b4a2b', '#1c1d1f', '#b5503c', '#c9a23f']);
  resistor(k, sw, -55, -41, -38, ['#c9a23f', '#7b4aa0', '#6b4a2b', '#c9a23f'], 20, '#8fb7cf');
  ledLoose(k, sw, -14, -37, 196, '#d8452f');
  ledLoose(k, sw, -76, -19, 68, '#e0a23a');
  return k.build('lab-usb');
}

/** Soldering-iron stand + iron + station at the back right and the desk lamp. They never move. Origin on the DESK top (y = 0 here). */
function buildFar(sw, aoMat) {
  const k = new Kit();
  const cast = sw('#232427', 0.7), steel = sw('#c3c7ca', 0.3, 1), chrome = sw('#dfe2e4', 0.14, 1), dull = sw('#a9adb0', 0.45, 1), grip = sw('#2f3236', 0.78), orange = sw('#c9732f', 0.55), brass = sw('#d8ac4a', 0.34, 1);
  const R = rng(31);
  // ── soldering stand with the iron resting in its spring
  k.push(206, 0, -238, 28);
  k.rbox(72, 11, 110, 3.2, cast, 0, 5.5, 0, 3);
  for (const [fx, fz] of [[-28, -46], [28, -46], [-28, 46], [28, 46]]) k.cyl(4.5, 1.2, sw('#101011', 0.9), fx, 0.4, fz, { seg: 12 });
  // brass-wool tip cleaner in a cup
  k.lathe([[0.02, 0], [21, 0], [24.5, 3], [25.5, 14], [24, 24], [19.5, 29], [17.5, 29.4], [17.3, 28.4], [21.4, 23.4], [22.6, 14], [21.6, 5.4], [18, 3.2], [0.02, 3.2]], sw('#3a3c40', 0.4, 1), 0, 11, 28, { seg: 36 });
  k.sphere(19, brass, 0, 26, 28, { sy: 0.62, seg: 18 });
  for (let i = 0; i < 20; i++) {
    const g = new THREE.TorusGeometry(6 + R() * 8, 0.55, 5, 26);
    g.rotateX(R() * 3.14).rotateY(R() * 3.14).translate((R() - 0.5) * 16, 33 + R() * 6, 28 + (R() - 0.5) * 16);
    k.g(g, brass);
  }
  // bracket + spring holder
  k.rbox(18, 3, 3, 0.8, dull, 0, 12.5, -40); k.push(0, 12, -41.5, 0, -14); k.rbox(15, 26, 2.4, 0.8, dull, 0, 12, 0); k.pop();
  k.tube([V(-17, 11, 6), V(-13, 34, 14), V(-9.5, 50.5, 20.5), V(0, 53.6, 21.6), V(9.5, 50.5, 20.5), V(13, 34, 14), V(17, 11, 6)], 1.3, dull, { rad: 6, caps: false });
  k.push(0, 21, -39, 0, 58);                                                            // local +y runs up the iron's axis
  k.curveTube(new Helix(88, 15, (t) => (t < 0.8 ? 6.3 + t * 0.9 : 7.02 + Math.pow((t - 0.8) / 0.2, 1.6) * 5.6)), 15 * 22, 0.95, steel, 6);
  k.lathe([[0.02, 4], [0.5, 4], [2.6, 20], [2.9, 22], [2.9, 24], [3.2, 24.4], [3.2, 62], [5.2, 63], [5.2, 72.5], [0.02, 72.5]], chrome, 0, 0, 0, { seg: 16 });
  k.lathe([[0.02, 72], [5.6, 72], [7.8, 74.5], [8.3, 79]], grip, 0, 0, 0, { seg: 24 });
  k.lathe([[8.3, 79], [12.4, 80.4], [12.6, 83.4], [9.4, 85.2]], orange, 0, 0, 0, { seg: 28 });
  k.lathe([[9.4, 85.2], [9.9, 96], [10.7, 126], [10.3, 150], [8.7, 172], [6.3, 180.5], [4.7, 183], [4.7, 186], [4.2, 186.4], [4.2, 189.6], [4.6, 190], [4.6, 193], [4.0, 193.4], [4.0, 197], [4.3, 197.4], [4.3, 200], [3.2, 203.5], [0.02, 203.5]], grip, 0, 0, 0, { seg: 28 });
  const cb = [k.pt(0, 200, 0), k.pt(0, 214, 0.4), k.pt(0, 226, 5), k.pt(1, 232, 16)];
  k.pop();
  cb.push(k.pt(10, 96, 190), k.pt(21, 52, 197), k.pt(34, 14, 194), k.pt(46, 2.0, 182));
  k.pop();
  // ── soldering station the iron is plugged into
  k.push(326, 0, -252, -6);
  k.rbox(98, 80, 112, 5, sw('#4d5258', 0.55), 0, 41, 0, 3);
  for (const [fx, fz] of [[-38, -44], [38, -44], [-38, 44], [38, 44]]) k.cyl(6, 2, sw('#101011', 0.9), fx, 0.6, fz, { seg: 12 });
  k.rbox(90, 70, 2, 0.8, sw('#d9d6cd', 0.5), 0, 41, 56.2);
  k.cyl(13, 9, sw('#2a2c30', 0.45), 22, 44, 61, { axis: 'z', seg: 28 }); k.box(1.6, 9, 0.5, sw('#f0efe9', 0.5), 22, 49.5, 65.6);
  k.rbox(30, 15, 1.2, 0.5, sw('#16181b', 0.3), -22, 54, 57.4); k.rbox(11, 16, 3, 0.8, sw('#b5503c', 0.4), -30, 26, 57.6);
  k.cyl(6.5, 5, sw('#17181a', 0.5), -6, 22, 59, { axis: 'z', seg: 18 });
  const sock = k.pt(-6, 22, 66);
  k.pop();
  cb.push(V(sock.x + 34, 1.9, sock.z + 78), V(sock.x + 26, 1.9, sock.z + 52), V(sock.x + 10, 4, sock.z + 27), V(sock.x + 2, 17, sock.z + 9), sock);
  k.tube(cb, 2.0, sw('#26282b', 0.7), { rad: 8, seg: 150 });
  // ── desk lamp reaching in from the back-right corner
  const white = sw('#eceae4', 0.38), joint = sw('#b9bdc1', 0.35, 1);
  k.lathe([[0.02, 0], [56, 0], [58, 2], [58, 6], [53, 10.5], [16, 15], [13, 18], [13, 26], [0.02, 26]], white, 480, 0, -236, { seg: 48 });
  const seg = (a, b, r) => { const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), 16); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize())); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); k.g(g, white); };
  const A = V(480, 24, -236), E = V(505, 268, -222), Hd = V(322, 352, -166);
  seg(A, E, 5.2); seg(E, Hd, 5.2);
  k.sphere(9.5, joint, E.x, E.y, E.z, { seg: 16 }); k.sphere(8.5, joint, Hd.x, Hd.y, Hd.z, { seg: 16 }); k.sphere(8, joint, A.x, A.y + 2, A.z, { seg: 14 });
  k.push(Hd.x - 14, Hd.y - 4, Hd.z + 6, 0, 8, -10);
  k.lathe([[0.02, -8], [15, -8], [47, -57], [49.5, -60], [51, -59.4], [49, -52], [17.5, -3.5], [10, 0], [0.02, 0]], white, 0, 0, 0, { seg: 40 });
  const lampHead = k.pt(0, -50, 0);
  k.pop();
  const blob = [0.01, 0.02, 0.49, 0.98];
  k.push(206, 0.08, -238, 28); k.decal(120, 158, aoMat, blob, 2, 0, 3); k.pop();
  k.push(326, 0.08, -252, -6); k.decal(150, 164, aoMat, blob, 3, 0, 4); k.pop();
  k.decal(176, 176, aoMat, blob, 482, 0.08, -234);
  const boxes = [[165, 0, -300, 300, 140, -105], [272, 0, -312, 380, 84, -190], [424, 0, -294, 536, 28, -178], [272, 285, -200, 348, 362, -112]];
  return { group: k.build('lab-far', { cast: false }), lampHead, boxes };
}

// ───────────────────────── scene assembly ─────────────────────────
export function buildLabScene(viewer) {
  const scene = viewer.scene, renderer = viewer.renderer;
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const pal = makePalette(), sw = pal.sw;
  const group = new THREE.Group(); group.name = 'lab-environment';
  const bench = new THREE.Group(); bench.name = 'lab-bench';        // hidden when the camera dips below the board
  group.add(bench);

  // room + wall (unlit, pre-blurred)
  const roomMat = new THREE.MeshBasicMaterial({ map: canvasTex(roomCanvas(), { mips: false }), fog: false });
  const room = new THREE.Mesh(roomGeometry(), roomMat); room.name = 'lab-room';
  const wallMat = new THREE.MeshBasicMaterial({ map: canvasTex(shrink(wallCanvas(), 1536), { mips: false }) });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(WALL_W, WALL_H), wallMat); wall.position.set(0, WALL_H / 2 - MAT_T, WALL_Z + 0.5); wall.name = 'lab-wall';
  group.add(room, wall);
  // Software GL (SwiftShader / llvmpipe — e.g. headless screenshots) can start the colour pass before the shadow-map pass has landed,
  // which silently drops every shadow on big canvases. The room is drawn first each frame, so finishing there closes the race.
  { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|software|basic render/i.test(name)) { room.renderOrder = -1000; room.onBeforeRender = () => gl.finish(); } }

  // bench top
  const woodTex = canvasTex(woodCanvas(), { repeat: true, aniso });
  const deskMat = new THREE.MeshStandardMaterial({ map: woodTex, bumpMap: woodTex, bumpScale: 1.4, roughness: 0.52, envMap: scene.environment, envMapIntensity: 0.46 });
  const desk = new THREE.Mesh(deskGeometry(), deskMat); desk.receiveShadow = true; desk.name = 'lab-desk';
  // mat
  const matTex = canvasTex(matCanvas(), { repeat: true, aniso });
  const matMat = new THREE.MeshStandardMaterial({ map: matTex, bumpMap: matTex, bumpScale: 0.35, roughness: 0.88, envMap: scene.environment, envMapIntensity: 0.44 });
  const matGeo = new THREE.ShapeGeometry(rrShape(MAT_W - 0.9, MAT_D - 0.9, 15.5), 10);
  { const p = matGeo.attributes.position, uv = matGeo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 100, (p.getY(i) - MAT_Z) / 100); }
  matGeo.rotateX(-Math.PI / 2); matGeo.translate(0, 0, MAT_Z);
  const mat = new THREE.Mesh(matGeo, matMat); mat.receiveShadow = true; mat.name = 'lab-mat';
  const printMat = new THREE.MeshStandardMaterial({ map: canvasTex(printCanvas(), { aniso }), transparent: true, opacity: 0.6, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  printMat.userData.noShadow = true;
  const aoMat = new THREE.MeshBasicMaterial({ map: canvasTex(aoCanvas(), { mips: false }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  aoMat.userData.noShadow = true;
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.62, 1.18) });
  glowMat.userData.noShadow = true;
  { const k = new Kit(), pc = { width: 1280, height: 256 };
    k.ext(rrShape(MAT_W, MAT_D, 16), MAT_T - 0.1, sw('#5f6d7b', 0.85), 0, -MAT_T, MAT_Z, { bevel: 0.4 });
    k.decal(164, 12.3, printMat, region(pc, 0, 8, 1280, 96), -MAT_X1 + 100, 0.04, MAT_Z1 - 15);
    k.decal(118, 11.6, printMat, region(pc, 0, 126, 1180, 116), MAT_X1 - 78, 0.04, MAT_Z1 - 14.5);
    const white = region(pc, 1, 1, 6, 6), in0 = 7.5;
    k.decal(MAT_W - 2 * in0 - 24, 0.5, printMat, white, 0, 0.04, MAT_Z0 + in0); k.decal(0.5, MAT_D - 2 * in0 - 24, printMat, white, -MAT_X1 + in0, 0.04, MAT_Z); k.decal(0.5, MAT_D - 2 * in0 - 24, printMat, white, MAT_X1 - in0, 0.04, MAT_Z);
    // soft occlusion where the bench meets the wall
    const fade = [0.52, 0.03, 0.98, 0.97];
    k.push(0, -MAT_T + 0.06, 0);
    k.decal(DESK_W, 74, aoMat, fade, 0, 0, DESK_Z0 + 37);
    k.pop();
    k.push(0, -MAT_T, 0);
    // ── bench legs
    const legCol = sw('#d8d6d0', 0.5);
    for (const sx of [-1, 1]) { k.rbox(46, 716, 46, 4, legCol, sx * 800, -DESK_T - 358, 286); k.rbox(46, 716, 46, 4, legCol, sx * 800, -DESK_T - 358, -262); }
    k.rbox(1560, 60, 24, 3, legCol, 0, -DESK_T - 30, 280);
      k.pop();
    const flat = k.build('lab-flat', { cast: false }); bench.add(flat); }
  const wearGeo = new THREE.ShapeGeometry(rrShape(MAT_W - 0.9, MAT_D - 0.9, 15.5), 10);
  { const p = wearGeo.attributes.position, uv = wearGeo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / MAT_W + 0.5, p.getY(i) / MAT_D + 0.5); }
  const wear = new THREE.Mesh(wearGeo.rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: canvasTex(wearCanvas(), { mips: false }), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  wear.position.set(0, 0.02, MAT_Z); wear.name = 'lab-mat-wear';
  bench.add(desk, mat, wear);

  const far = buildFar(sw, aoMat); far.group.position.y = -MAT_T; bench.add(far.group);
  { const d = new THREE.Mesh(new THREE.CircleGeometry(45, 40).rotateX(Math.PI / 2), glowMat); d.position.copy(far.lampHead); d.rotation.set(8 * DEG, 0, -10 * DEG); d.name = 'lab-lamp-glow'; far.group.add(d); }

  // sharp artwork
  const decC = decalCanvas();
  const decalMat = new THREE.MeshStandardMaterial({ map: canvasTex(decC, { aniso }), roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  decalMat.userData.noShadow = true;
  const DEC = { bread: region(decC, 0.4 * 12.4, 0.4 * 12.4, 81.2 * 12.4, 53.7 * 12.4), meter: region(decC, 1040, 0, 68 * 7.8, 130 * 7.8), spool: region(decC, 1580, 0, 480, 480) };
  const back = buildBack(sw, decalMat, DEC), right = buildRight(sw, decalMat, DEC), front = buildFront(sw, decalMat, DEC);
  const left = buildLeft(sw, DESK_Z1 - 6);                            // its z never changes, so the cable always reaches the bench edge
  bench.add(back, right, front, left);

  // lights: warm desk lamp pool at the back right, cool window fill from the left (no extra shadow maps)
  const lamp = new THREE.SpotLight(0xffc98d, 1, 0, 0.62, 1, 2); lamp.castShadow = false;
  lamp.position.copy(far.lampHead).add(V(0, -MAT_T, 0)); lamp.target.position.set(far.lampHead.x - 26, 0, far.lampHead.z + 34);
  const LAMP_I = 0.95 * far.lampHead.y * far.lampHead.y;
  const win = new THREE.DirectionalLight(0xdfeaff, 1); win.castShadow = false; win.position.set(-600, 260, 180);
  const WIN_I = 0.3;
  group.add(lamp, lamp.target, win, win.target);
  const fog = new THREE.Fog(FOG_COLOR, 1e5, 2e5);

  scene.add(group);

  // ───── state ─────
  let visible = true, mode = 'showcase', below = false, lastD = -1;
  let cur = { w: 68.6, h: 53.3 };
  // Props that would sit between the camera and the board (low orbits, side views) step out of the way.
  // boxes: [x0, y0, z0, x1, y1, z1] in the group's own frame; `on` = wanted by the current mode.
  const props = [
    { g: back, on: true, boxes: [[-29, 0, -29, 29, 34, 29]] },
    { g: right, on: true, boxes: [[40, 0, -133, 155, 55, 30]] },
    { g: front, on: true, boxes: [[22, 0, 41, 111, 9.5, 104], [27, 9, 45, 107, 40, 100]] },
    { g: left, on: true, boxes: [] },
    { g: far.group, on: true, boxes: far.boxes },
  ];
  const targets = [V(0, 6, 0), V(0, 3, 0), V(0, 3, 0), V(0, 3, 0), V(0, 3, 0)], lastCam = V(1e9, 0, 0);
  const hits = (p, q, b, o, m) => {                                  // segment p→q against box b (offset o, grown by m)
    let t0 = 0, t1 = 1;
    for (let a = 0; a < 3; a++) {
      const p0 = p.getComponent(a), d = q.getComponent(a) - p0, lo = b[a] + o.getComponent(a) - m, hi = b[a + 3] + o.getComponent(a) + m;
      if (Math.abs(d) < 1e-9) { if (p0 < lo || p0 > hi) return false; continue; }
      const ta = (lo - p0) / d, tb = (hi - p0) / d;
      t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb)); if (t0 > t1) return false;
    }
    return true;
  };
  function updateProps(force) {
    const cam = viewer.camera.position;
    if (!force && cam.distanceToSquared(lastCam) < 0.04) return;
    lastCam.copy(cam);
    for (const p of props) {
      const o = p.g.position;
      const blocked = p.on && p.boxes.some((b) => hits(cam, cam, b, o, 14) || targets.some((t) => hits(cam, t, b, o, 0)));
      const vis = p.on && !blocked;
      if (p.g.visible !== vis) { p.g.visible = vis; viewer.dirty = true; }
    }
  }

  function layout() {
    const hw = cur.w / 2 + 7, hd = cur.h / 2 + 7, asm = mode === 'assembly';
    const cx1 = asm ? cur.w / 2 + 120 : hw, cz0 = asm ? -(cur.h / 2 + 40) : -hd;
    back.position.set(Math.min(hw * 0.3 + 18, 60), 0, Math.max(cz0 - (asm ? 34 : 46) - 27.5, MAT_Z0 + 36));
    if (asm) right.position.set(Math.max(cx1 + 30, MAT_X1 + 14), -MAT_T, 70);
    else right.position.set(hw + 22, 0, hd - 26);
    front.position.set(0, 0, hd); left.position.set(-(hw + 22), 0, 6);
    props[2].on = props[3].on = !asm;
    targets[1].set(-cur.w * 0.42, 3, 0); targets[2].set(cur.w * 0.42, 3, 0); targets[3].set(0, 3, -cur.h * 0.42); targets[4].set(0, 3, cur.h * 0.42);
    updateProps(true);
  }
  function fitLights() {
    const R = viewer.radius || 44, k = viewer.key, hw = cur.w / 2, hd = cur.h / 2;
    const S = Math.max(hw, hd) + 200, D = S * 3;
    k.position.set(-1.5, 2.4, -1.35).normalize().multiplyScalar(D); k.target.position.set(0, 0, 0);
    const c = k.shadow.camera; c.left = c.bottom = -S; c.right = c.top = S; c.near = D - S * 2.3; c.far = D + S * 2.3; c.updateProjectionMatrix();
    k.shadow.bias = -0.0004 * (7.5 * R) / (c.far - c.near) * 1.6;
    k.shadow.normalBias = Math.min(0.3, 0.06 * S / (1.5 * R));
    viewer.camera.far = Math.max(R * 60, 6500); viewer.camera.updateProjectionMatrix();
  }
  function restoreLights() {                                         // exactly what Viewer._fitLights() sets up
    const R = viewer.radius || 44, k = viewer.key;
    k.position.set(-R * 1.5, R * 2.4, -R * 1.35); k.target.position.set(0, 0, 0);
    const c = k.shadow.camera; c.left = c.bottom = -R * 1.5; c.right = c.top = R * 1.5; c.near = R * 0.5; c.far = R * 8; c.updateProjectionMatrix();
    k.shadow.bias = -0.0004; k.shadow.normalBias = 0.06;
    viewer.camera.far = R * 60; viewer.camera.updateProjectionMatrix();
  }
  function updateFog(force) {
    const d = viewer.camera.position.distanceTo(viewer.controls.target);
    if (!force && Math.abs(d - lastD) < 0.5) return;
    lastD = d; fog.near = d + (viewer.radius || 44) * 1.2; fog.far = fog.near + 1700; viewer.dirty = true;
  }
  function apply() {
    group.visible = visible;
    if (visible) {
      viewer.ground.visible = false; scene.fog = fog; lamp.intensity = LAMP_I; win.intensity = WIN_I;
      fitLights(); updateFog(true);
      below = viewer.camera.position.y < 0; bench.visible = !below;
    } else {
      viewer.ground.visible = true; scene.fog = null; scene.background = null;
      restoreLights();
    }
    viewer.dirty = true;
  }
  viewer.on('tick', () => {
    if (!visible) return;
    const b = viewer.camera.position.y < 0;
    if (b !== below) { below = b; bench.visible = !b; viewer.dirty = true; }
    if (!b) updateProps(false);
    updateFog(false);
  });

  layout(); apply();
  return {
    group,
    setBoard(built) { if (built && built.w) cur = { w: built.w, h: built.h }; layout(); if (visible) apply(); },
    setVisible(v) { visible = !!v; apply(); },
    setMode(m) { mode = m === 'assembly' ? 'assembly' : 'showcase'; layout(); viewer.dirty = true; },
    stats() { let tris = 0, meshes = 0; group.traverse(o => { if (o.isMesh) { meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return { tris, meshes }; },
  };
}
