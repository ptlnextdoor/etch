// Parts library: ICs, passives, crystals, buttons, pin headers.
// Every part is `fn(b, { x, y, rot = 0, side = 'top', ...opts })`: it paints its footprint on the board `b`,
// builds the 3D geometry with a Builder (local coords: footprint centre at the origin, h = 0 → board surface),
// places it and returns the placed group (so the board author can `b.tag(...)` it). See PARTS-IC.md.
import * as THREE from 'three';
import { Builder, M, textMat, ledMat, colorMat, glowSprite, rrShape, DEG } from './builder.js';

// ───────────────────────── small helpers ─────────────────────────
const arr2 = (v) => (Array.isArray(v) ? v : [v, v]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const toLines = (t) => (t == null || t === '' || t === false ? [] : [].concat(t).map(String));
const row = (n, pitch) => Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * pitch);
const LASER = '#a3a19b';            // laser marking on black epoxy
const Z0 = 0.03;                    // solder-paste gap between SMD parts and the board
const NAMED = { black: M.black, white: M.white, red: M.red, yellow: M.yellow, blue: M.blue, green: M.green, grey: M.grey, beige: M.beige };
const plasticMat = (c) => NAMED[c] || colorMat(c, 0.45);
/** Flat-colour decal material (has polygon offset → safe to lay 0.01 mm above a surface). */
const decal = (color, rough = 0.6, metal = 0) => textMat({ w: 4, h: 4, bg: color, fg: color, lines: [], roughness: rough, metalness: metal });
const DIMPLE = () => decal('#0c0d0e', 0.25);
const PLATE = () => colorMat('#b4b7ba', 0.36, 1);   // stamped steel covers of switches

/** Triangle soup authored in board-like coords [x, y, h] (CCW seen from outside). */
class Tris {
  constructor() { this.p = []; }
  tri(a, b, c) { this.p.push(a[0], a[2], -a[1], b[0], b[2], -b[1], c[0], c[2], -c[1]); return this; }
  quad(a, b, c, d) { return this.tri(a, b, c).tri(a, c, d); }
  geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.computeVertexNormals(); return g; }
}

/** Rectangle with 45° corner chamfers c, shrunk by `inset`; 8 points CCW (top view). */
function ring8(sx, sy, c, inset = 0) {
  const hx = sx / 2 - inset, hy = sy / 2 - inset;
  c = Math.max(0.004, Math.min(c, hx * 0.95, hy * 0.95));
  return [[hx - c, -hy], [hx, -hy + c], [hx, hy - c], [hx - c, hy], [-hx + c, hy], [-hx, hy - c], [-hx, -hy + c], [-hx + c, -hy]];
}
/** Prism with a vertical profile [[inset, h], ...] (bottom → top) over a chamfered rectangle. Flat-shaded, cheap. */
function prismGeo(sx, sy, c, prof, { top = true, bottom = false } = {}) {
  const T = new Tris();
  const rings = prof.map(([i, h]) => ring8(sx, sy, c, i).map((p) => [p[0], p[1], h]));
  for (let k = 0; k < rings.length - 1; k++) {
    const a = rings[k], bb = rings[k + 1];
    for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; T.quad(a[i], a[j], bb[j], bb[i]); }
  }
  if (top) { const r = rings[rings.length - 1]; for (let i = 1; i < 7; i++) T.tri(r[0], r[i], r[i + 1]); }
  if (bottom) { const r = rings[0]; for (let i = 1; i < 7; i++) T.tri(r[0], r[i + 1], r[i]); }
  return T.geo();
}
/** Profile of a transfer-moulded package: drafted lower half, parting line, drafted upper half, rounded top edge. */
function moldProf(h, { draft = 0.1, r = 0.06, split = 0.5 } = {}) {
  const P = [[draft * 0.9, 0]];
  if (draft > 0) P.push([0, h * split - 0.02], [0, h * split + 0.02]);
  P.push([draft, h - r]);
  for (const a of [30, 60, 90]) P.push([draft + r * (1 - Math.cos(a * DEG)), h - r * (1 - Math.sin(a * DEG))]);
  return P;
}
const moldInset = ({ draft = 0.1, r = 0.06 } = {}) => draft + r;
/** Cheap box with softened edges (≈ 90 triangles) for tiny parts where RoundedBox would be wasteful. */
function cbox(B, sx, sy, sh, r, mat, x = 0, y = 0, h0 = 0, rz = 0) {
  r = Math.min(r, sx / 2 - 1e-3, sy / 2 - 1e-3, sh / 2 - 1e-3);
  const P = [[r * 0.6, 0], [0, r * 0.6], [0, sh - r], [r * 0.134, sh - r * 0.5], [r * 0.5, sh - r * 0.134], [r, sh]];
  return B.geo(prismGeo(sx, sy, r, P), mat, x, y, h0, rz);
}
/** Extrude a closed profile [[d, h], ...] (d = outward distance, h = height) to `width`. Place with B.geo(g, mat, x, y, 0, outwardAngle). */
function profGeo(pts, width) {
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -width / 2);
  return g;
}
/** Gull-wing lead: shoulder at height hs leaving the body at d = 0, bend, slope, bend, foot ending at d = L. */
function gullGeo(w, t, hs, L, { foot = L * 0.5, sh = L * 0.2, n = 3, back = 0.12, lift = Z0 } = {}) {
  const hf = t / 2 + lift;
  const P = [[-back, hs], [sh, hs], [L - foot, hf], [L, hf]];
  const cl = [P[0]];
  for (let k = 1; k <= 2; k++) {
    const A = P[k - 1], C = P[k + 1], Q = P[k];
    const la = Math.hypot(A[0] - Q[0], A[1] - Q[1]), lc = Math.hypot(C[0] - Q[0], C[1] - Q[1]);
    const q = Math.min(la * (k === 1 ? 0.6 : 0.45), lc * 0.45, t * 2.2);
    const a = [Q[0] + (A[0] - Q[0]) / la * q, Q[1] + (A[1] - Q[1]) / la * q];
    const c = [Q[0] + (C[0] - Q[0]) / lc * q, Q[1] + (C[1] - Q[1]) / lc * q];
    for (let i = 0; i <= n; i++) {
      const s = i / n, u = 1 - s;
      cl.push([u * u * a[0] + 2 * u * s * Q[0] + s * s * c[0], u * u * a[1] + 2 * u * s * Q[1] + s * s * c[1]]);
    }
  }
  cl.push(P[3]);
  const up = [], dn = [];
  for (let i = 0; i < cl.length; i++) {
    const p0 = cl[Math.max(0, i - 1)], p1 = cl[Math.min(cl.length - 1, i + 1)];
    const tx = p1[0] - p0[0], ty = p1[1] - p0[1], l = Math.hypot(tx, ty) || 1;
    const nx = -ty / l * t / 2, ny = tx / l * t / 2;
    up.push([cl[i][0] + nx, cl[i][1] + ny]); dn.push([cl[i][0] - nx, cl[i][1] - ny]);
  }
  return profGeo(up.concat(dn.reverse()), w);
}
/** Concave solder fillet wedge: from the pad edge (d = len) up a terminal face (d = 0) to height hgt. */
function filletGeo(w, len, hgt) {
  const pts = [[0, 0], [len, 0]];
  for (let i = 1; i <= 4; i++) { const s = i / 4, u = 1 - s; pts.push([u * u * len + 2 * u * s * len * 0.12, 2 * u * s * hgt * 0.12 + s * s * hgt]); }
  return profGeo(pts, w);
}
/** Row of identical leads + their pads. offs = positions along the edge; rz = outward direction (0, 90, 180, 270). */
function leadRow(B, F, g, offs, edge, rz, padW, padL, dc, mat = M.tin) {
  const c = Math.round(Math.cos(rz * DEG)), s = Math.round(Math.sin(rz * DEG));
  for (const u of offs) {
    const x = c * edge - s * u, y = s * edge + c * u;
    if (g) B.geo(g.clone(), mat, x, y, 0, rz);
    if (padL) F.pad(x + c * dc, y + s * dc, c ? padL : padW, c ? padW : padL);
  }
}
function disc(B, r, mat, x, y, h, seg = 20) {
  const g = new THREE.CircleGeometry(r, seg); g.rotateX(-Math.PI / 2);
  return B.geo(g, mat, x, y, h);
}
/** Text plane (laser marking / print). Lines share one font size and never get squeezed. */
function label(B, text, w, h, x, y, hh, rz = 0, { fg = LASER, rough = 0.55, metal = 0, weight = 500 } = {}) {
  const ls = toLines(text); if (!ls.length || w <= 0 || h <= 0) return;
  const k = clamp(600 / Math.max(w, h), 36, 160), W = Math.max(16, Math.round(w * k)), H = Math.max(16, Math.round(h * k));
  const n = ls.length, lh = H / (n + 0.35), maxLen = Math.max(...ls.map((s) => s.length), 1);
  const size = Math.round(Math.min(lh * 0.76, 0.94 * W / (maxLen * 0.62)));
  const lines = ls.map((t, i) => ({ t, size, weight, y: (i + 0.5 + 0.175) / (n + 0.35) }));
  B.plane(w, h, textMat({ w: W, h: H, bg: null, fg, lines, roughness: rough, metalness: metal }), x, y, hh, rz);
}
/** Marking of a black IC: pin-1 dimple in the bottom-left corner + text. (sx, sy) = size of the flat top. */
function icMark(B, sx, sy, top, text, dot, opt) {
  const m = Math.min(sx, sy);
  if (dot) { const r = clamp(m * 0.055, 0.11, 0.45), off = r + clamp(m * 0.07, 0.1, 0.55); disc(B, r, DIMPLE(), -sx / 2 + off, -sy / 2 + off, top + 0.006); }
  label(B, text, sx * 0.86, sy * (dot ? 0.56 : 0.8), 0, dot ? sy * 0.08 : 0, top + 0.008, 0, opt);
}
/** Geometry of a square pin (chamfered edges catch highlights) running from 0 up to len, with optional pointed ends. */
function pinGeo(s, len, tipUp = true, tipDown = true) {
  const tl = s * 0.45, ti = s * 0.2, P = [];
  if (tipDown) P.push([ti, 0], [0, tl]); else P.push([0, 0]);
  if (tipUp) P.push([0, len - tl], [ti, len]); else P.push([0, len]);
  return prismGeo(s, s, s * 0.14, P, { top: true, bottom: true });
}
/** Square pin (header pin) from h0 to h1 with optional pointed ends. */
function sqpin(B, s, h0, h1, mat, x, y, { tipUp = true, tipDown = true } = {}) {
  B.geo(pinGeo(s, h1 - h0, tipUp, tipDown), mat, x, y, h0);
}

// ───────────────────────── placement / batching ─────────────────────────
let _batch = null;
class SubBuilder extends Builder {
  constructor(parent, m) { super(); this.byMat = parent.byMat; this.extras = parent.extras; this.m = m; }
  geo(geometry, mat, x, y, h, rz) {
    super.geo(geometry, mat, x, y, h, rz);
    const list = this.byMat.get(mat); list[list.length - 1].applyMatrix4(this.m);
    return this;
  }
  add(obj) { obj.position.applyMatrix4(this.m); return super.add(obj); }
}
function make(b, o, name, fn) {
  const x = o.x ?? 0, y = o.y ?? 0, rot = o.rot ?? 0, side = o.side ?? 'top';
  const L = b.local(x, y, rot, side);
  const F = {
    L, rot, side, t: b.t, b,
    pad: (lx, ly, w, h, opt = {}) => { const [px, py] = L(lx, ly); b.pad(px, py, w, h, { rot, side, finish: 'tin', ...opt }); },
    th: (lx, ly, opt = {}) => { const [px, py] = L(lx, ly); b.th(px, py, opt); },
    dot: (lx, ly, r = 0.2) => { const [px, py] = L(lx, ly); b.circle(px, py, r, { fill: true, side }); },
  };
  if (_batch) { fn(_batch.sub(b, x, y, rot, side), F); return null; }
  const B = new Builder(); fn(B, F);
  return b.place(B.build(name), x, y, rot, side);
}

// ───────────────────────── solder ─────────────────────────
/**
 * Concave solder cone (lathe) added to Builder `B` at (x, y), base at height h0.
 * flip: true → hangs downwards (for the bottom of the board: h0 = −t).  r = base radius, hgt = height, rp = radius at the pin.
 */
export function solderJoint(B, x, y, h0 = 0, { r = 0.8, hgt = 0.6, flip = false, rp = 0.3, seg = 14 } = {}) {
  const n = 5, pts = [];
  for (let i = 0; i <= n; i++) { const s = i / n; pts.push([rp + (r - rp) * (1 - s) ** 2.4, hgt * s]); }
  if (flip) { pts.reverse(); pts.forEach((p) => { p[1] = -p[1]; }); }   // keep the profile running bottom → top
  return B.lathe(pts, M.solder, x, y, h0, seg);
}

// ───────────────────────── ICs ─────────────────────────
/** TQFP / LQFP. body = widest body size (mm), pins = per side, lead = lead length outside the body. Pin 1 = leftmost pin of the −y side. */
export function qfp(b, o = {}) {
  const { body = 7, pins = 8, pitch = 0.8, h = 1.0, lead = 1.0, text = ['ATMEGA328P', 'AU 2035'], dot = true, standoff = 0.1, silk = true } = o;
  const [bx, by] = arr2(body), [nx, ny] = arr2(pins);
  const lw = o.leadW ?? (pitch >= 0.8 ? 0.37 : pitch >= 0.65 ? 0.3 : pitch >= 0.5 ? 0.22 : 0.18), lt = 0.15;
  return make(b, o, 'qfp', (B, F) => {
    const mp = { draft: clamp(h * 0.1, 0.07, 0.14), r: 0.06 };
    B.geo(prismGeo(bx, by, clamp(Math.min(bx, by) * 0.035, 0.15, 0.5), moldProf(h, mp)), M.epoxy, 0, 0, standoff);
    const foot = Math.min(0.6, lead * 0.55), g = gullGeo(lw, lt, standoff + h * 0.5, lead, { foot, n: nx + ny > 40 ? 2 : 3 });
    const padW = Math.min(lw + 0.1, pitch - 0.2), padL = foot + 0.55, dc = lead - foot / 2 + 0.1;
    leadRow(B, F, g, row(nx, pitch), by / 2, 270, padW, padL, dc);
    leadRow(B, F, g, row(ny, pitch), bx / 2, 0, padW, padL, dc);
    leadRow(B, F, g, row(nx, pitch), by / 2, 90, padW, padL, dc);
    leadRow(B, F, g, row(ny, pitch), bx / 2, 180, padW, padL, dc);
    g.dispose();
    const ins = moldInset(mp);
    icMark(B, bx - 2 * ins, by - 2 * ins, standoff + h, text, dot);
    if (silk) F.dot(-bx / 2 - lead * 0.55, -by / 2 - lead - 0.55, 0.22);
  });
}

/** SOIC / SSOP / TSSOP / MSOP. Body long axis = x, leads on ±y. Pin 1 = leftmost pin of the −y side. */
export function soic(b, o = {}) {
  const { n = 8, pitch = 1.27, bodyW = 3.9, h = 1.5, span = 6.0, text = [], dot = true, silk = true } = o;
  const per = Math.round(n / 2), bodyL = o.bodyL ?? (per - 1) * pitch + (pitch >= 1 ? 1.05 : 0.5);
  const lead = (span - bodyW) / 2, lw = o.leadW ?? (pitch >= 1.2 ? 0.42 : pitch >= 0.65 ? 0.28 : 0.2), lt = pitch >= 1 ? 0.2 : 0.14;
  const so = h > 1.3 ? 0.15 : 0.08, bh = h - so;
  return make(b, o, 'soic', (B, F) => {
    const mp = { draft: clamp(bh * 0.09, 0.05, 0.13), r: 0.05 };
    B.geo(prismGeo(bodyL, bodyW, 0.1, moldProf(bh, mp)), M.epoxy, 0, 0, so);
    const foot = Math.min(0.65, lead * 0.6), g = gullGeo(lw, lt, so + bh * 0.48, lead, { foot });
    const padW = Math.min(lw + 0.14, pitch - 0.2), padL = foot + 0.6, dc = lead - foot / 2 + 0.1;
    leadRow(B, F, g, row(per, pitch), bodyW / 2, 270, padW, padL, dc);
    leadRow(B, F, g, row(per, pitch), bodyW / 2, 90, padW, padL, dc);
    g.dispose();
    const ins = moldInset(mp);
    icMark(B, bodyL - 2 * ins, bodyW - 2 * ins, h, text, dot);
    if (silk) F.dot(-bodyL / 2 - 0.45, -bodyW / 2 - lead * 0.6, 0.2);
  });
}

/** QFN / DFN-like leadless package: side terminals visible around the perimeter. Pin 1 = leftmost pin of the −y side. */
export function qfn(b, o = {}) {
  const { size = 5, pins = 7, pitch = 0.5, h = 0.85, text = [], dot = true, silk = true } = o;
  const [sx, sy] = arr2(size), [nx, ny] = arr2(pins), tw = o.termW ?? pitch * 0.5;
  return make(b, o, 'qfn', (B, F) => {
    B.geo(prismGeo(sx, sy, 0.03, [[0, 0], [0, h - 0.045], [0.015, h - 0.015], [0.045, h]]), M.epoxy, 0, 0, Z0);
    const th = Math.min(0.2, h * 0.3);
    for (const [n, edge, rz] of [[nx, sy / 2, 270], [ny, sx / 2, 0], [nx, sy / 2, 90], [ny, sx / 2, 180]]) {
      const c = Math.round(Math.cos(rz * DEG)), s = Math.round(Math.sin(rz * DEG));
      for (const u of row(n, pitch)) {
        const x = c * edge - s * u, y = s * edge + c * u;
        B.box(c ? 0.1 : tw, c ? tw : 0.1, th, M.tin, x - c * 0.035, y - s * 0.035, Z0 - 0.01);
        F.pad(x - c * 0.1, y - s * 0.1, c ? 0.8 : tw + 0.05, c ? tw + 0.05 : 0.8);
        B.geo(filletGeo(tw, 0.22, th * 0.8), M.solder, x + c * 0.01, y + s * 0.01, 0, rz);
      }
    }
    icMark(B, sx - 0.1, sy - 0.1, Z0 + h, text, dot);
    if (silk) F.dot(-sx / 2 - 0.5, -sy / 2 - 0.5, 0.2);
  });
}

/** DIP, optionally in a socket. Body long axis = x, rows at y = ±width/2, pin 1 = leftmost pin of the −y row, key notch at −x. */
export function dip(b, o = {}) {
  const { n = 28, text = ['ATMEGA328P-PU'], socket = true, width = 7.62, pitch: p = 2.54, dot = false } = o;
  const per = Math.round(n / 2), len = per * p, xs = row(per, p);
  const bodyL = o.bodyL ?? len - 0.8, bodyW = width - 1.1, bodyH = width > 10 ? 3.8 : 3.3;
  return make(b, o, 'dip', (B, F) => {
    const t = F.t, sH = 4.3, seat = socket ? sH + 0.04 : 0, bot = seat + 0.55, top = bot + bodyH;
    xs.forEach((x, i) => { F.th(x, -width / 2, { d: 1.6, hole: 0.8, square: i === 0 }); F.th(x, width / 2, { d: 1.6, hole: 0.8 }); });
    if (socket) {
      const bv = 0.12, rw = 2.5;
      for (const s of [-1, 1]) {
        const sh = rrShape(len - 2 * bv, rw - 2 * bv, 0.05);
        for (const x of xs) { const hp = new THREE.Path(); hp.moveTo(x - 0.75, -0.6); hp.lineTo(x - 0.75, 0.6); hp.lineTo(x + 0.75, 0.6); hp.lineTo(x + 0.75, -0.6); hp.closePath(); sh.holes.push(hp); }
        B.extrude(sh, sH - 0.9, M.black, 0, s * width / 2, 0.9, 0, { bevel: bv });
        B.box(len - 0.1, rw - 0.1, 0.95, M.black, 0, s * width / 2, 0);
        B.plane(len - 0.5, 1.3, M.cavity, 0, s * width / 2, 0.97);
        for (const x of xs) {
          for (const e of [-1, 1]) B.box(1.0, 0.1, sH - 1.55, M.tin, x, s * width / 2 + e * 0.37, 1.0);
          B.box(0.5, 0.25, t + 1.5, M.tin, x, s * width / 2, -t - 1.5);
          solderJoint(B, x, s * width / 2, -t, { r: 0.75, hgt: 0.6, flip: true, rp: 0.26, seg: 12 });
        }
      }
      for (const x of [-(len / 2 - 0.8), 0, len / 2 - 0.8]) B.box(1.5, width - rw + 0.3, 1.9, M.black, x, 0, 0.15);
    }
    // body: lower half + upper half with the key notch (the seam between the two bevelled halves reads as the parting line)
    const bv = 0.16, hx = bodyL / 2 - bv, hy = bodyW / 2 - bv, nr = Math.min(1.1, bodyW * 0.15);
    B.extrude(rrShape(2 * hx, 2 * hy, 0.2), bodyH * 0.5 + 0.08, M.epoxy, 0, 0, bot, 0, { bevel: bv });
    const up = new THREE.Shape();
    up.moveTo(-hx, -hy); up.lineTo(hx, -hy); up.lineTo(hx, hy); up.lineTo(-hx, hy); up.lineTo(-hx, nr);
    up.absarc(-hx, 0, nr, Math.PI / 2, -Math.PI / 2, true); up.lineTo(-hx, -hy);
    B.extrude(up, bodyH * 0.5 + 0.08, M.epoxy, 0, 0, bot + bodyH * 0.5 - 0.08, 0, { bevel: bv });
    // leads
    const hc = bot + bodyH * 0.5 - 0.13, yb = bodyW / 2 - 0.2, yo = width / 2 + 0.125, tip = socket ? 2.9 : t + 1.5;
    for (const s of [-1, 1]) for (const x of xs) {
      B.box(1.4, yo - yb, 0.25, M.tin, x, s * (yb + yo) / 2, hc);
      B.box(1.4, 0.25, hc + 0.25 - seat, M.tin, x, s * width / 2, seat);
      B.box(0.5, 0.25, tip, M.tin, x, s * width / 2, seat - tip);
      if (!socket) solderJoint(B, x, s * width / 2, -t, { r: 0.75, hgt: 0.6, flip: true, rp: 0.26, seg: 12 });
    }
    if (dot) disc(B, 0.45, DIMPLE(), -bodyL / 2 + 2.2, -bodyW / 2 + 1.3, top + 0.006);
    label(B, text, Math.min(bodyL - 5, bodyL * 0.8), bodyW * 0.56, 0.6, 0, top + 0.008);
  });
}

/** SOT-223 (AMS1117 etc.): 3 leads on −y, wide tab on +y. Body 6.5 × 3.5 × 1.6. */
export function sot223(b, o = {}) {
  const { text = ['AMS1117', '3.3'] } = o;
  return make(b, o, 'sot223', (B, F) => {
    const bx = 6.5, by = 3.5, h = 1.6, so = 0.06, L = 1.75, mp = { draft: 0.12, r: 0.06 };
    B.geo(prismGeo(bx, by, 0.12, moldProf(h - so, mp)), M.epoxy, 0, 0, so);
    const g = gullGeo(0.7, 0.27, so + 0.78, L, { foot: 0.95 }), gt = gullGeo(3.0, 0.27, so + 0.78, L, { foot: 0.95 });
    leadRow(B, F, g, [-2.3, 0, 2.3], by / 2, 270, 1.0, 1.9, L - 0.45);
    leadRow(B, F, gt, [0], by / 2, 90, 3.3, 1.9, L - 0.45);
    g.dispose(); gt.dispose();
    const ins = moldInset(mp);
    icMark(B, bx - 2 * ins, by - 2 * ins, h, text, false);
  });
}

/** SOT-23 family. n = 3 (2 leads on −y, 1 on +y), 5 (3 + 2) or 6 (3 + 3). */
export function sot23(b, o = {}) {
  const { n = 3, text = [] } = o;
  return make(b, o, 'sot23', (B, F) => {
    const bx = 2.9, by = n === 3 ? 1.3 : 1.6, h = n === 3 ? 1.0 : 1.15, so = 0.06, span = n === 3 ? 2.4 : 2.8, L = (span - by) / 2;
    const mp = { draft: 0.07, r: 0.04 };
    B.geo(prismGeo(bx, by, 0.06, moldProf(h - so, mp)), M.epoxy, 0, 0, so);
    const g = gullGeo(0.4, 0.13, so + (h - so) * 0.45, L, { foot: L * 0.6 });
    const lo = n === 3 ? [-0.95, 0.95] : [-0.95, 0, 0.95], hi = n === 3 ? [0] : n === 5 ? [-0.95, 0.95] : [-0.95, 0, 0.95];
    leadRow(B, F, g, lo, by / 2, 270, 0.6, 0.9, L - 0.2);
    leadRow(B, F, g, hi, by / 2, 90, 0.6, 0.9, L - 0.2);
    g.dispose();
    const ins = moldInset(mp);
    icMark(B, bx - 2 * ins, by - 2 * ins, h, text, false);
  });
}

/** BGA. lid: true → SoC with a laminate substrate and a metal lid (engraved text); false → black moulded BGA (memory). */
export function bga(b, o = {}) {
  const { size = 15, h = 1.2, lid = true, text = [], substrate = '#1f6b3a', balls = true, pitch = 0.8, dot = true } = o;
  const [sx, sy] = arr2(size);
  return make(b, o, 'bga', (B, F) => {
    const so = clamp(pitch * 0.4, 0.2, 0.4), st = lid ? Math.min(0.45, (h - so) * 0.45) : Math.min(0.25, (h - so) * 0.3), top = Math.max(h, so + st + 0.2);
    B.geo(prismGeo(sx, sy, 0.05, [[0, 0], [0, st - 0.03], [0.03, st]]), colorMat(lid ? substrate : (o.substrate ?? '#18251d'), 0.42), 0, 0, so);
    if (lid) {
      const [lx, ly] = arr2(o.lidSize ?? [sx - Math.max(1.2, sx * 0.1), sy - Math.max(1.2, sy * 0.1)]);
      const lm = colorMat('#c6c9cb', 0.36, 1);
      B.rbox(lx, ly, top - so - st, clamp((top - so - st) * 0.4, 0.1, 0.3), lm, 0, 0, so + st);
      if (dot) disc(B, clamp(lx * 0.03, 0.2, 0.5), decal('#7d8083', 0.5, 0.8), -lx / 2 + lx * 0.07 + 0.3, -ly / 2 + ly * 0.07 + 0.3, top + 0.006);
      label(B, text, lx * 0.8, ly * 0.6, 0, ly * 0.04, top + 0.008, 0, { fg: '#4d5054', rough: 0.5, metal: 0.55 });
    } else {
      const m = 0.12;
      B.geo(prismGeo(sx - 2 * m, sy - 2 * m, 0.04, [[0, 0], [0, top - so - st - 0.05], [0.02, top - so - st - 0.015], [0.05, top - so - st]]), M.epoxy, 0, 0, so + st);
      icMark(B, sx - 2 * m - 0.1, sy - 2 * m - 0.1, top, text, dot);
    }
    if (balls) {
      const r = pitch * 0.3, nxb = Math.floor((sx - 2 * r - 0.4) / pitch) + 1, nyb = Math.floor((sy - 2 * r - 0.4) / pitch) + 1;
      const X = row(nxb, pitch), Y = row(nyb, pitch);
      const ball = (x, y) => B.cyl(r, so + 0.02, M.solder, x, y, 0, { seg: 8, rTop: r * 0.8 });
      for (const x of X) { ball(x, Y[0]); ball(x, Y[nyb - 1]); }
      for (let j = 1; j < nyb - 1; j++) { ball(X[0], Y[j]); ball(X[nxb - 1], Y[j]); }
    }
  });
}

// ───────────────────────── chip passives ─────────────────────────
//            L     W     Hres  term  Hcap
const CHIP = {
  '0201': [0.6, 0.3, 0.23, 0.15, 0.3],
  '0402': [1.0, 0.5, 0.35, 0.22, 0.5],
  '0603': [1.6, 0.8, 0.45, 0.3, 0.8],
  '0805': [2.0, 1.25, 0.5, 0.4, 0.95],
  '1206': [3.2, 1.6, 0.55, 0.5, 1.15],
  '1210': [3.2, 2.5, 0.55, 0.5, 1.6],
  '1812': [4.5, 3.2, 0.9, 0.65, 1.6],
  '2010': [5.0, 2.5, 0.55, 0.6, 1.6],
  '2512': [6.3, 3.2, 0.6, 0.65, 1.8],
};
const chipSize = (s) => CHIP[s] || CHIP['0603'];
/** Pads + end caps + solder fillets shared by all two-terminal chips. Length along x. */
function chipEnds(B, F, L, W, H, term, { termMat = M.tin, r = 0.05, fillet = true } = {}) {
  const ext = clamp(L * 0.16, 0.16, 0.45), padL = term + ext + 0.1, padW = W + clamp(W * 0.12, 0.06, 0.25);
  for (const s of [-1, 1]) {
    F.pad(s * (L / 2 + ext - padL / 2), 0, padL, padW);
    cbox(B, term, W + 0.04, H + 0.03, r, termMat, s * (L / 2 - term / 2 + 0.01), 0, Z0 - 0.01);
    if (fillet) B.geo(filletGeo(W * 0.88, ext * 0.9, H * 0.62), M.solder, s * (L / 2 + 0.005), 0, 0, s > 0 ? 0 : 180);
  }
}

/** Thick-film chip resistor: white ceramic, black top with the value code, metal end caps. */
export function res(b, o = {}) {
  const { size = '0603', text = '103' } = o, [L, W, H, term] = chipSize(size);
  return make(b, o, 'res', (B, F) => {
    B.box(L - 0.04, W, H - 0.03, M.ceramic, 0, 0, Z0);
    B.box(L - 2 * term + 0.06, W - 0.06, 0.035, M.resTop, 0, 0, Z0 + H - 0.035);
    chipEnds(B, F, L, W, H, term);
    if (L >= 1.5) label(B, text, (L - 2 * term) * 0.9, W * 0.74, 0, 0, Z0 + H + 0.006, 0, { fg: '#e4e4de', rough: 0.5 });
  });
}

/** MLCC. color: 'tan' | 'brown' | 'grey' | hex. */
export function cap(b, o = {}) {
  const { size = '0603', color = 'tan' } = o, [L, W, , term, Hc] = chipSize(size), H = o.h ?? Hc;
  const mat = color === 'tan' ? M.capTan : color === 'brown' ? M.capBrown : color === 'grey' ? colorMat('#8f8b84', 0.55) : colorMat(color, 0.55);
  return make(b, o, 'cap', (B, F) => {
    const r = Math.min(0.09, H * 0.18);
    cbox(B, L - 0.06, W, H, r, mat, 0, 0, Z0);
    chipEnds(B, F, L, W, H, term, { r: r + 0.01 });
  });
}

/** Ferrite bead (chip): dark grey body, metal end caps. */
export function ferrite(b, o = {}) {
  const { size = '0603' } = o, [L, W, , term, Hc] = chipSize(size), H = o.h ?? Math.min(Hc, W);
  return make(b, o, 'ferrite', (B, F) => {
    cbox(B, L - 0.06, W, H, 0.06, M.ferrite, 0, 0, Z0);
    chipEnds(B, F, L, W, H, term, { r: 0.07 });
  });
}

/** Resettable PTC fuse (polyfuse): greenish body, pale-gold terminals. */
export function polyfuse(b, o = {}) {
  const { size = '1812', text = '' } = o, [L, W, H, term] = chipSize(size);
  return make(b, o, 'polyfuse', (B, F) => {
    cbox(B, L - 0.06, W, H, 0.07, colorMat('#3c6b3e', 0.5), 0, 0, Z0);
    chipEnds(B, F, L, W, H, term + 0.15, { termMat: colorMat('#d8c88e', 0.32, 1), r: 0.08 });
    label(B, text, (L - 2 * term - 0.5) * 0.9, W * 0.5, 0, 0, Z0 + H + 0.006, 0, { fg: '#cfd6b4' });
  });
}

/** Chip resistor array (convex terminals on ±y). n resistors, pitch 0.8 (0603 × n) — body n·0.8 × 1.6. */
export function resArray(b, o = {}) {
  const { n = 4, pitch = 0.8, text = '103' } = o;
  return make(b, o, 'resArray', (B, F) => {
    const L = n * pitch, W = 1.6, H = 0.5, tw = pitch * 0.55;
    B.box(L, W - 0.04, H - 0.03, M.ceramic, 0, 0, Z0);
    B.box(L - 0.06, W - 0.62, 0.035, M.resTop, 0, 0, Z0 + H - 0.035);
    for (const x of row(n, pitch)) for (const s of [-1, 1]) {
      cbox(B, tw, 0.32, H + 0.03, 0.04, M.tin, x, s * (W / 2 - 0.15), Z0 - 0.01);
      F.pad(x, s * (W / 2 + 0.05), tw + 0.06, 0.8);
      B.geo(filletGeo(tw * 0.9, 0.3, H * 0.6), M.solder, x, s * (W / 2 + 0.005), 0, s > 0 ? 90 : 270);
    }
    label(B, text, L * 0.7, (W - 0.62) * 0.85, 0, 0, Z0 + H + 0.006, 0, { fg: '#e4e4de' });
  });
}

const TANT = { A: [3.2, 1.6, 1.6, 1.2], B: [3.5, 2.8, 1.9, 2.2], C: [6.0, 3.2, 2.5, 2.2], D: [7.3, 4.3, 2.8, 2.4] };
/** Moulded tantalum capacitor. Polarity bar (+) at the −x end. */
export function tantalum(b, o = {}) {
  const { size = 'A', text = '' } = o, [L, W, H, tw] = TANT[size] || TANT.A;
  return make(b, o, 'tantalum', (B, F) => {
    const mp = { draft: clamp(H * 0.06, 0.08, 0.16), r: 0.07, split: 0.42 }, ins = moldInset(mp);
    B.geo(prismGeo(L, W, 0.1, moldProf(H, mp)), M.tantalum, 0, 0, Z0);
    const padL = L * 0.22 + 0.9;
    for (const s of [-1, 1]) {
      B.box(0.14, tw, H * 0.5, M.tin, s * (L / 2 + 0.02), 0, Z0 - 0.01);
      F.pad(s * (L / 2 + 0.45 - padL / 2), 0, padL, tw + 0.3);
      B.geo(filletGeo(tw * 0.9, 0.4, H * 0.3), M.solder, s * (L / 2 + 0.08), 0, 0, s > 0 ? 0 : 180);
    }
    const tx = L - 2 * ins, ty = W - 2 * ins, bw = tx * 0.16;
    B.plane(bw, ty, decal('#8a4b12', 0.55), -tx / 2 + bw / 2, 0, Z0 + H + 0.006);
    label(B, text, (tx - bw) * 0.88, ty * 0.8, bw / 2, 0, Z0 + H + 0.008, 0, { fg: '#7a430f' });
  });
}

const DIODE = { sma: [4.3, 2.6, 2.2, 5.1, 1.45], smb: [4.3, 3.6, 2.3, 5.4, 2.0], sod123: [2.7, 1.6, 1.1, 3.7, 0.6], sod323: [1.7, 1.3, 0.95, 2.5, 0.32] };
/** Diode. Cathode bar at the −x end. pkg: 'sma' | 'smb' (J-leads) | 'sod123' | 'sod323' (flat gull leads). */
export function diode(b, o = {}) {
  const { pkg = 'sma', text = '' } = o, [L, W, H, span, lw] = DIODE[pkg] || DIODE.sma, jl = pkg === 'sma' || pkg === 'smb';
  return make(b, o, 'diode', (B, F) => {
    const so = jl ? Z0 : 0.05, bh = H - so, mp = { draft: clamp(bh * 0.07, 0.05, 0.15), r: 0.05, split: jl ? 0.45 : 0.5 }, ins = moldInset(mp);
    B.geo(prismGeo(L, W, 0.08, moldProf(bh, mp)), M.epoxy, 0, 0, so);
    const ext = (span - L) / 2;
    if (jl) {
      const padL = 2.0;
      for (const s of [-1, 1]) {
        B.box(0.16, lw, H * 0.5, M.tin, s * (L / 2 + 0.03), 0, Z0 - 0.01);
        F.pad(s * (L / 2 + 0.55 - padL / 2), 0, padL, lw + 0.35);
        B.geo(filletGeo(lw * 0.9, 0.42, H * 0.28), M.solder, s * (L / 2 + 0.1), 0, 0, s > 0 ? 0 : 180);
      }
    } else {
      const g = gullGeo(lw, 0.12, so + bh * 0.5, ext, { foot: ext * 0.62 });
      leadRow(B, F, g, [0], L / 2, 0, lw + 0.25, ext + 0.45, ext * 0.55);
      leadRow(B, F, g, [0], L / 2, 180, lw + 0.25, ext + 0.45, ext * 0.55);
      g.dispose();
    }
    const tx = L - 2 * ins, ty = W - 2 * ins, bw = tx * 0.14;
    B.plane(bw, ty, decal('#c9c9c3', 0.6), -tx / 2 + bw * 0.5 + tx * 0.05, 0, H + 0.006);
    label(B, text, (tx - bw * 1.6) * 0.86, ty * 0.7, bw * 0.8, 0, H + 0.008);
  });
}

/** Shielded SMD power inductor: dark ferrite block with rounded corners. size = side (mm) or [sx, sy]. */
export function inductor(b, o = {}) {
  const { size = 4, h = 2, text = '4R7' } = o, [sx, sy] = arr2(size);
  return make(b, o, 'inductor', (B, F) => {
    const bv = Math.min(0.14, h * 0.15);
    B.extrude(rrShape(sx - 2 * bv, sy - 2 * bv, Math.min(sx, sy) * 0.14), h, M.ferrite, 0, 0, Z0, 0, { bevel: bv });
    const tl = sx * 0.2 + 0.25, tw = sy * 0.62;
    for (const s of [-1, 1]) {
      B.box(tl, tw, Math.min(0.5, h * 0.3), M.tin, s * (sx / 2 - tl / 2 + 0.06), 0, Z0 - 0.015);
      F.pad(s * (sx / 2 - tl / 2 + 0.3), 0, tl + 0.5, tw + 0.3);
      B.geo(filletGeo(tw * 0.9, 0.3, Math.min(0.4, h * 0.25)), M.solder, s * (sx / 2 + 0.06), 0, 0, s > 0 ? 0 : 180);
    }
    label(B, text, sx * 0.62, sy * 0.36, 0, 0, Z0 + h + 0.008, 0, { fg: '#c4c4be' });
  });
}

const LEDS = { '0402': [1.0, 0.5, 0.4, 0.2], '0603': [1.6, 0.8, 0.6, 0.3], '0805': [2.0, 1.25, 0.8, 0.38], '1206': [3.2, 1.6, 1.1, 0.5] };
/** Chip LED: white base, metal end terminals, translucent lens. on: true → glowing lens + glow sprite. Cathode at −x. */
export function led(b, o = {}) {
  const { size = '0603', color = '#00d05a', on = false } = o, [L, W, H, term] = LEDS[size] || LEDS['0603'];
  return make(b, o, 'led', (B, F) => {
    const bh = H * 0.36;
    B.box(L - 0.04, W, bh, M.white, 0, 0, Z0);
    chipEnds(B, F, L, W, bh, term, { r: 0.03 });
    const ll = L - 2 * term + 0.12, lh = H - bh;
    B.rbox(ll, W * 0.94, lh + 0.05, Math.min(lh * 0.42, W * 0.25), ledMat(color, on), 0, 0, Z0 + bh - 0.05);
    // the sprite is depth-tested: keep its centre well above the lens so the whole lens stays behind the billboard plane
    // (the image is shifted part of the way back down via the sprite's own anchor, so the glow still sits on the LED)
    if (on) { const s = glowSprite(color, L * 3.6); s.position.set(0, Z0 + H + L * 0.6, 0); s.center.set(0.5, 0.5 + 0.25 / 3.6); B.add(s); }
  });
}

// ───────────────────────── crystals ─────────────────────────
/** HC-49/S crystal (11.05 × 4.65 mm stadium can). smd: false → 2 through-hole leads (pitch 4.88) on an insulator; true → on a plastic base with end leads. */
export function crystalHC49(b, o = {}) {
  const { text = '16.000', smd = false, h = 3.5 } = o;
  return make(b, o, 'crystalHC49', (B, F) => {
    const Lc = 11.05, Wc = 4.65, t = F.t, bv = 0.32, engr = { fg: '#5f6266', rough: 0.45, metal: 0.5 };
    const stadium = (l, w) => rrShape(l, w, w / 2);
    const base = smd ? 0.85 : 0.22;
    if (smd) {
      B.rbox(Lc + 0.75, Wc + 0.35, base, 0.12, M.blackMatte, 0, 0, Z0);
      for (const s of [-1, 1]) {
        B.box(1.1, 1.5, 0.2, M.tin, s * (Lc / 2 + 0.75), 0, Z0);
        F.pad(s * (Lc / 2 + 0.7), 0, 2.2, 2.0);
        B.geo(filletGeo(1.3, 0.35, 0.2), M.solder, s * (Lc / 2 + 1.3), 0, 0, s > 0 ? 0 : 180);
      }
    } else {
      B.extrude(stadium(Lc + 1.0, Wc + 1.0), base, colorMat('#d9d5c7', 0.65), 0, 0, 0.01);
      for (const s of [-1, 1]) {
        F.th(s * 2.44, 0, { d: 1.5, hole: 0.7 });
        B.cyl(0.22, t + 1.5 + 0.3, M.tin, s * 2.44, 0, -t - 1.5, { seg: 10 });
        solderJoint(B, s * 2.44, 0, -t, { r: 0.7, hgt: 0.6, flip: true, rp: 0.24 });
      }
    }
    B.extrude(stadium(Lc + 0.55 - 0.16, Wc + 0.55 - 0.16), 0.4, M.steel, 0, 0, base, 0, { bevel: 0.08, seg: 20 });
    B.extrude(stadium(Lc - 2 * bv, Wc - 2 * bv), h - 0.3, M.steel, 0, 0, base + 0.3, 0, { bevel: bv, seg: 20 });
    label(B, text, Lc - 3.6, Wc - 1.9, 0, 0, base + h + 0.008, 0, engr);
  });
}

/** 4-pad ceramic SMD crystal (3225, 2520, 5032…): ceramic base + metal lid. */
export function crystalSMD(b, o = {}) {
  const { size = [3.2, 2.5], h = 0.8, text = '' } = o, [sx, sy] = arr2(size);
  return make(b, o, 'crystalSMD', (B, F) => {
    const bh = h * 0.62;
    cbox(B, sx, sy, bh, 0.05, colorMat('#a79a82', 0.7), 0, 0, Z0);
    const lx = sx - 0.36, ly = sy - 0.36;
    B.rbox(lx, ly, h - bh + 0.1, 0.07, colorMat('#d2ccba', 0.3, 1), 0, 0, Z0 + bh - 0.1);
    const pw = sx * 0.38, ph = sy * 0.36;
    for (const sxn of [-1, 1]) for (const syn of [-1, 1]) {
      F.pad(sxn * (sx / 2 - pw / 2 + 0.2), syn * (sy / 2 - ph / 2 + 0.12), pw, ph);
      B.box(0.06, ph * 0.7, bh * 0.7, M.gold, sxn * (sx / 2 + 0.005), syn * (sy / 2 - ph / 2), Z0);
    }
    label(B, text, lx * 0.84, ly * 0.62, 0, 0, Z0 + h + 0.008, 0, { fg: '#57534a', rough: 0.45, metal: 0.5 });
  });
}

/** 32.768 kHz "watch" cylinder crystal lying on the board along x; two leads leave the −x end into through-holes. Origin = can centre. */
export function crystalCyl(b, o = {}) {
  const { len = 6, d = 2 } = o;
  return make(b, o, 'crystalCyl', (B, F) => {
    const r = d / 2, t = F.t, hc = r + 0.03;
    const prof = [[r * 0.35, 0], [r * 0.9, 0.02], [r * 0.9, 0.3], [r * 1.0, 0.36], [r, len - r * 0.4], [r * 0.92, len - r * 0.14], [r * 0.7, len - r * 0.03], [0, len]];
    const g = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(Math.max(p[0], 1e-4), p[1])), 28);
    g.rotateZ(-Math.PI / 2);
    B.geo(g, M.steel, -len / 2, 0, hc);
    B.cyl(r * 0.36, 0.1, colorMat('#2c2f33', 0.4), -len / 2 - 0.03, 0, hc, { axis: 'x', seg: 12 });
    const lx = -len / 2 - 1.5, ly = Math.max(0.55, r * 0.55);
    for (const s of [-1, 1]) {
      F.th(lx, s * ly, { d: 1.0, hole: 0.45 });
      const q = new THREE.CylinderGeometry(0.1, 0.1, Math.hypot(1.5, ly - r * 0.28), 6);
      q.rotateZ(Math.PI / 2);
      B.geo(q, M.tin, -len / 2 - 0.75, s * (ly + r * 0.28) / 2, hc, s * Math.atan2(-(ly - r * 0.28), 1.5) / DEG);
      B.cyl(0.1, hc + t + 1.1, M.tin, lx, s * ly, -t - 1.1, { seg: 6 });
      B.sphere(0.1, M.tin, lx, s * ly, hc, { seg: 6 });
      solderJoint(B, lx, s * ly, 0, { r: 0.45, hgt: 0.32, rp: 0.12, seg: 10 });
      solderJoint(B, lx, s * ly, -t, { r: 0.45, hgt: 0.4, rp: 0.12, seg: 10, flip: true });
    }
  });
}

/** 3-terminal SMD ceramic resonator (Murata CSTCE, as on the Arduino Uno R3): 3.2 × 1.3 × 0.9. */
export function resonator(b, o = {}) {
  const { size = [3.2, 1.3], h = 0.9, text = '' } = o, [sx, sy] = arr2(size);
  return make(b, o, 'resonator', (B, F) => {
    const bh = h * 0.42;
    B.box(sx, sy, bh, M.ceramic, 0, 0, Z0);
    B.rbox(sx - 0.14, sy - 0.14, h - bh + 0.08, 0.08, colorMat('#bfc2c4', 0.34, 1), 0, 0, Z0 + bh - 0.08);
    for (const x of [-sx * 0.375, 0, sx * 0.375]) {
      B.box(0.4, sy + 0.05, bh + 0.02, M.tin, x, 0, Z0 - 0.01);
      F.pad(x, 0, 0.45, sy + 0.7);
      for (const s of [-1, 1]) B.geo(filletGeo(0.36, 0.28, bh * 0.8), M.solder, x, s * (sy / 2 + 0.02), 0, s > 0 ? 90 : 270);
    }
    label(B, text, sx * 0.7, sy * 0.6, 0, 0, Z0 + h + 0.008, 0, { fg: '#4c4f52', metal: 0.5 });
  });
}

/** SMD aluminium electrolytic capacitor. Terminals along x: + at +x (chamfered base corners), − at −x (black mark). */
export function capElec(b, o = {}) {
  const { d = 6.3, h = 5.4, text = ['47', '25V'] } = o;
  return make(b, o, 'capElec', (B, F) => {
    const bs = d + 0.3, bh = clamp(d * 0.14, 0.6, 1.3), bv = 0.08, hf = bs / 2 - bv, c = bs * 0.2, r = d / 2;
    const s = new THREE.Shape();
    [[-hf, -hf], [hf - c, -hf], [hf, -hf + c], [hf, hf - c], [hf - c, hf], [-hf, hf]].forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
    B.extrude(s, bh, M.blackMatte, 0, 0, Z0, 0, { bevel: bv });
    const H = h - bh + 0.06, gr = clamp(h * 0.16, 0.5, 1.2), gd = clamp(d * 0.035, 0.15, 0.35), tr = clamp(d * 0.05, 0.2, 0.45);
    const P = [[r - 0.12, 0], [r, 0.1], [r, gr - gd * 1.3], [r - gd * 0.6, gr - gd * 0.6], [r - gd, gr], [r - gd * 0.6, gr + gd * 0.6], [r, gr + gd * 1.3], [r, H - tr]];
    for (const a of [22.5, 45, 67.5, 90]) P.push([r - tr * (1 - Math.cos(a * DEG)), H - tr * (1 - Math.sin(a * DEG))]);
    P.push([r - tr - 0.25, H - 0.03], [0, H - 0.03]);
    B.lathe(P, M.alu, 0, 0, Z0 + bh - 0.06, 40);
    const top = Z0 + bh - 0.06 + H - 0.03, R = r - tr - 0.02, a0 = Math.acos(-0.38);
    const seg = new THREE.Shape(); seg.moveTo(R * Math.cos(a0), R * Math.sin(a0)); seg.absarc(0, 0, R, a0, 2 * Math.PI - a0, false); seg.closePath();
    const sg = new THREE.ShapeGeometry(seg, 24); sg.rotateX(-Math.PI / 2);
    B.geo(sg, decal('#17181a', 0.5), 0, 0, top + 0.006);
    label(B, text, R * 1.5, R * 1.05, R * 0.31, 0, top + 0.008, 90, { fg: '#1d1e20', rough: 0.5 });
    const pw = clamp(d * 0.2, 0.9, 1.9), padL = d * 0.42 + 0.9, out = bs / 2 + 0.85;
    for (const sg2 of [-1, 1]) {
      B.box(1.1, pw * 0.6, 0.2, M.tin, sg2 * (bs / 2 + 0.25), 0, Z0);
      F.pad(sg2 * (out - padL / 2), 0, padL, pw);
      B.geo(filletGeo(pw * 0.5, 0.3, 0.2), M.solder, sg2 * (bs / 2 + 0.8), 0, 0, sg2 > 0 ? 0 : 180);
    }
  });
}

// ───────────────────────── buttons ─────────────────────────
/**
 * Tactile switch. type: 'tact6' (6 × 6 mm, 4 gull-wing leads on ±x; th: true → through-hole legs),
 * 'smd' (4.2 × 3.2 mm two-pad reset button), 'side' (right-angle, actuator points to −y).  cap: actuator colour.
 */
export function button(b, o = {}) {
  const { type = 'tact6', cap: capC = 'black', th = false } = o, capM = plasticMat(capC);
  return make(b, o, 'button-' + type, (B, F) => {
    if (type === 'tact6') {
      const H = o.h ?? 5.0, t = F.t;
      B.rbox(6.0, 6.0, 3.15, 0.2, M.black, 0, 0, 0.1);
      B.extrude(rrShape(5.84, 5.84, 0.3), 0.3, PLATE(), 0, 0, 3.2, 0, { bevel: 0.06 });
      for (const s of [-1, 1]) B.box(2.4, 0.12, 1.7, PLATE(), 0, s * 3.0, 1.75);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) B.cyl(0.42, 0.07, M.blackMatte, sx * 2.05, sy * 2.05, 3.49, { seg: 14 });
      B.lathe([[2.0, 0], [2.0, 0.1], [1.85, 0.16], [1.7, 0.16]], M.black, 0, 0, 3.5, 28);
      B.lathe([[1.72, 0], [1.72, H - 3.5 - 0.22], [1.66, H - 3.5 - 0.08], [1.5, H - 3.5], [0, H - 3.5]], capM, 0, 0, 3.5, 28);
      if (th) {
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          const x = sx * 3.25, y = sy * 2.25;
          F.th(x, y, { d: 1.8, hole: 1.0 });
          B.box(0.3, 0.7, 1.3 + t + 1.4, M.tin, x, y, -t - 1.4);
          B.box(0.4, 0.7, 0.3, M.tin, sx * 3.1, y, 1.0);
          solderJoint(B, x, y, -t, { r: 0.85, hgt: 0.65, flip: true });
          solderJoint(B, x, y, 0, { r: 0.8, hgt: 0.5, rp: 0.36 });
        }
      } else {
        const g = gullGeo(0.7, 0.3, 1.0, 1.5, { foot: 0.8 });
        leadRow(B, F, g, [-2.25, 2.25], 3.0, 0, 1.2, 1.7, 1.2);
        leadRow(B, F, g, [-2.25, 2.25], 3.0, 180, 1.2, 1.7, 1.2);
        g.dispose();
      }
    } else if (type === 'smd') {
      const L = 4.2, W = 3.2, H = o.h ?? 2.5;
      cbox(B, L, W, 1.0, 0.08, M.black, 0, 0, Z0);
      B.extrude(rrShape(L - 0.1 - 0.1, W - 0.1, 0.25), 0.36, PLATE(), 0, 0, Z0 + 0.98, 0, { bevel: 0.05 });
      for (const s of [-1, 1]) B.box(1.5, 0.1, 0.95, PLATE(), 0, s * (W / 2 + 0.01), Z0 + 0.3);
      B.lathe([[1.15, 0], [1.15, 0.08], [1.0, 0.13]], M.black, 0, 0, Z0 + 1.34, 24);
      const ah = H - 1.34;
      B.lathe([[0.9, 0], [0.9, ah - 0.15], [0.84, ah - 0.04], [0.72, ah], [0, ah]], capM, 0, 0, Z0 + 1.34, 24);
      for (const s of [-1, 1]) {
        B.box(0.7, 1.5, 0.2, M.tin, s * (L / 2 + 0.2), 0, Z0);
        F.pad(s * (L / 2 + 0.25), 0, 1.3, 1.9);
        B.geo(filletGeo(1.3, 0.3, 0.2), M.solder, s * (L / 2 + 0.55), 0, 0, s > 0 ? 0 : 180);
      }
    } else {   // side-actuated
      const L = 4.6, W = 3.0, H = 1.8;
      cbox(B, L - 0.1, W - 0.1, H - 0.2, 0.06, M.black, 0, 0, Z0);
      B.rbox(L, W, 0.9, 0.08, PLATE(), 0, 0.05, Z0 + H - 0.9);
      B.box(L + 0.04, 0.5, H - 0.25, PLATE(), 0, W / 2 - 0.25, Z0);
      cbox(B, 2.0, 1.3, 1.0, 0.12, capM, 0, -W / 2 - 0.45, Z0 + 0.35);
      for (const s of [-1, 1]) {
        B.box(0.6, 1.0, 0.2, M.tin, s * (L / 2 + 0.2), 0.4, Z0);
        F.pad(s * (L / 2 + 0.3), 0.4, 1.3, 1.5);
        B.geo(filletGeo(0.9, 0.3, 0.2), M.solder, s * (L / 2 + 0.5), 0.4, 0, s > 0 ? 0 : 180);
      }
    }
  });
}

// ───────────────────────── pin headers ─────────────────────────
/** Board coordinates of header pins: row 0 (the −y row) left → right, then row 1… (order: 'zigzag' → column by column: 1-2, 3-4…). */
export function headerPinPositions({ x = 0, y = 0, rot = 0, nx = 1, ny = 1, pitch = 2.54, side = 'top', order = 'rows' } = {}) {
  const c = Math.cos(rot * DEG), s = Math.sin(rot * DEG), f = side === 'bottom' ? -1 : 1, out = [];
  const at = (i, j) => { const lx = (i - (nx - 1) / 2) * pitch, ly = (j - (ny - 1) / 2) * pitch; return [x + lx * c - f * ly * s, y + lx * s + f * ly * c]; };
  if (order === 'zigzag') for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) out.push(at(i, j));
  else for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) out.push(at(i, j));
  return out;
}

/**
 * Pin header, (x, y) = centre of the pin field, rows along local x.
 * type: 'female' (socket strip, 8.5 mm) | 'male' (pins up) | 'maleDown' (plastic under the board, pins down — "board on legs")
 *       | 'maleRA' (right-angle, pins point to −y).
 */
export function header(b, o = {}) {
  const { nx = 8, ny = 1, type = 'female', pitch: p = 2.54, color = 'black', pin1 = true, tail = 1.8 } = o;
  const plastic = plasticMat(color), W = nx * p, D = ny * p, xs = row(nx, p), ys = row(ny, p);
  const metal = (o.plating ?? (type === 'female' ? 'tin' : 'gold')) === 'gold' ? M.gold : M.tin;
  return make(b, o, 'header-' + type, (B, F) => {
    const t = F.t, s = 0.64;
    ys.forEach((py, j) => xs.forEach((px, i) => F.th(px, py, { d: 1.75, hole: 1.0, square: pin1 && i === 0 && j === 0 })));
    const each = (fn) => ys.forEach((py, j) => xs.forEach((px, i) => fn(px, py, i, j)));
    if (type === 'female') {
      const H = o.h ?? 8.5, c = 0.16, ch = 0.22, Wb = W - 0.06, Db = D - 0.06, a = 0.84, ai = 0.56, fd = 0.6, D2 = Math.min(3.4, H - 0.6);
      B.geo(prismGeo(Wb, Db, ch, [[0.1, 0], [0, 0.12], [0, H - c], [c * 0.35, H - c * 0.3], [c, H]], { top: false }), plastic);
      const sh = new THREE.Shape();
      ring8(Wb, Db, ch, c).forEach((q, i) => (i ? sh.lineTo(q[0], q[1]) : sh.moveTo(q[0], q[1])));
      const sq = (px, py, hw, hh) => [[px - hw, py - hw, hh], [px + hw, py - hw, hh], [px + hw, py + hw, hh], [px - hw, py + hw, hh]];
      const T = new Tris(), Tc = new Tris();
      each((px, py) => {
        const hp = new THREE.Path(); hp.moveTo(px - a, py - a); hp.lineTo(px - a, py + a); hp.lineTo(px + a, py + a); hp.lineTo(px + a, py - a); hp.closePath(); sh.holes.push(hp);
        const A = sq(px, py, a, H), Q = sq(px, py, ai, H - fd), C = sq(px, py, ai, H - D2);
        for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; T.quad(A[i], A[j], Q[j], Q[i]); Tc.quad(Q[i], Q[j], C[j], C[i]); }
        for (const e of [-1, 1]) B.box(0.17, 0.72, D2 - fd - 0.2, metal, px + e * 0.36, py, H - D2);
        sqpin(B, s, -t - tail, 0.3, metal, px, py, { tipUp: false });
        solderJoint(B, px, py, -t, { r: 0.85, hgt: Math.min(0.75, tail * 0.55), flip: true, rp: 0.36, seg: 12 });
      });
      const tg = new THREE.ShapeGeometry(sh); tg.rotateX(-Math.PI / 2);
      B.geo(tg, plastic, 0, 0, H);
      B.geo(T.geo(), plastic); B.geo(Tc.geo(), M.cavity);
      B.plane(Wb - 0.5, Db - 0.5, M.cavity, 0, 0, H - D2 + 0.005);
    } else {
      const ph = o.h ?? 2.54, up = 6.1, cellProf = [[0.12, 0], [0, 0.14], [0, ph - 0.14], [0.12, ph]];
      if (type === 'male') {
        for (const px of xs) B.geo(prismGeo(p - 0.03, D - 0.06, 0.42, cellProf), plastic, px, 0, 0);
        each((px, py) => {
          sqpin(B, s, -t - tail, ph + up, metal, px, py);
          solderJoint(B, px, py, -t, { r: 0.85, hgt: Math.min(0.75, tail * 0.55), flip: true, rp: 0.36, seg: 12 });
        });
      } else if (type === 'maleDown') {
        const stub = o.stub ?? 1.3;
        for (const px of xs) B.geo(prismGeo(p - 0.03, D - 0.06, 0.42, cellProf, { bottom: true }), plastic, px, 0, -t - ph);
        each((px, py) => {
          sqpin(B, s, -t - ph - up, stub, metal, px, py);
          solderJoint(B, px, py, 0, { r: 0.85, hgt: Math.min(0.8, stub * 0.6), rp: 0.37, seg: 12 });
        });
      } else {   // maleRA
        const y0 = ys[0], yb = y0 - 1.5 - 1.25, yEnd = y0 - 1.5 - 2.5 - up;
        for (const px of xs) B.geo(prismGeo(p - 0.03, 2.5, 0.3, [[0.1, 0], [0, 0.12], [0, D - 0.12], [0.1, D]]), plastic, px, yb, 0.02);
        each((px, py, i, j) => {
          const hj = p / 2 + j * p;
          sqpin(B, s, -t - tail, hj + s / 2, metal, px, py, { tipUp: false });
          const g = pinGeo(s, py + s / 2 - yEnd, true, false); g.rotateX(Math.PI / 2);
          B.geo(g, metal, px, py + s / 2, hj);
          solderJoint(B, px, py, -t, { r: 0.85, hgt: Math.min(0.75, tail * 0.55), flip: true, rp: 0.36, seg: 12 });
        });
      }
    }
  });
}

/** Jumper cap (shunt) for two header pins. (x, y) = midpoint between the two pins, long axis along local x. h0 = height of its bottom (top of header plastic). */
export function jumper(b, o = {}) {
  const { color = 'yellow', h0 = 2.56, h = 6.4 } = o;
  return make(b, o, 'jumper', (B) => {
    const pm = plasticMat(color);
    B.rbox(5.04, 2.5, 1.5, 0.18, pm, 0, 0, h0);
    B.rbox(4.84, 2.3, h - 1.0, 0.2, pm, 0, 0, h0 + 1.0);
    for (const s of [-1, 1]) {
      B.plane(0.9, 0.5, decal('#060606', 0.9), s * 1.27, 0, h0 + h + 0.006);
      B.plane(0.5, 0.12, decal('#b9bcbd', 0.3, 1), s * 1.27, 0.19, h0 + h + 0.008);
    }
  });
}

/** Bare round test pad. */
export function testpad(b, o = {}) {
  const { d = 1.5 } = o;
  return make(b, o, 'testpad', (B, F) => {
    F.pad(0, 0, d, d, { shape: 'round', finish: o.finish ?? F.b.finish });
    B.lathe([[d * 0.46, 0], [d * 0.4, 0.035], [0, 0.05]], (o.finish ?? F.b.finish) === 'tin' ? M.solder : M.gold, 0, 0, 0.005, 16);
  });
}

/** Fiducial mark: 1 mm metal dot inside a mask-free, copper-free window. */
export function fiducial(b, o = {}) {
  const { d = 1.0, clear = 2.6 } = o;
  return make(b, o, 'fiducial', (B, F) => {
    const [px, py] = F.L(0, 0);
    F.b.keepout(px, py, clear, clear, { side: F.side, rot: F.rot });
    F.pad(0, 0, d, d, { shape: 'round', finish: o.finish ?? F.b.finish });
    B.cyl(d * 0.47, 0.02, (o.finish ?? F.b.finish) === 'tin' ? M.tin : M.gold, 0, 0, 0.004, { seg: 16 });
  });
}

// ───────────────────────── bulk placement ─────────────────────────
const KIND = {
  res, cap, led, ferrite, polyfuse, resArray, tantalum, diode, inductor, capElec, crystalSMD, crystalHC49, crystalCyl, resonator,
  button, sot23, sot223, soic, qfn, qfp, bga, dip, header, testpad, fiducial, jumper,
};
/**
 * Place many small parts at once: list = [[kind, x, y, rot?, opts?], ...]  (kind = name of any part function above).
 * By default everything is merged into ONE group (few draw calls) which is returned — tag it as a whole.
 * { merge: false } → separate groups, returns an array (same order as the list).
 */
export function passives(b, list, { merge = true, name = 'passives' } = {}) {
  const call = ([kind, x, y, rot = 0, opts = {}]) => {
    const fn = KIND[kind]; if (!fn) throw new Error(`passives(): unknown part "${kind}"`);
    return fn(b, { ...opts, x, y, rot });
  };
  if (!merge) return list.map(call);
  const root = new Builder(), prev = _batch;
  _batch = {
    sub(bd, x, y, rot, side) {
      const m = new THREE.Matrix4().makeTranslation(x - bd.w / 2, side === 'bottom' ? -bd.t : 0, -(y - bd.h / 2));
      m.multiply(new THREE.Matrix4().makeRotationY(rot * DEG));
      if (side === 'bottom') m.multiply(new THREE.Matrix4().makeRotationX(Math.PI));
      return new SubBuilder(root, m);
    },
  };
  try { list.forEach(call); } finally { _batch = prev; }
  return b.place(root.build(name), b.w / 2, b.h / 2, 0, 'top');
}
