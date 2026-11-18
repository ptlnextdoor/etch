// Connectors and RF modules (procedural, photoreal-ish). See PARTS-CONN.md.
//
// Every part: name(b, { x, y, rot = 0, side = 'top', ...opts }) → placed THREE.Group (not tagged).
// CONNECTOR ORIENTATION: local origin = centre of the connector's mouth (front plane) projected on the board,
// the opening looks towards local −x, the body extends to +x.  rot = 0 → faces left, 180 → right, 90 → down (−y), 270 → up (+y).
// Inside this file: x = depth (0 = mouth), y = lateral, h = height above the board.
import * as THREE from 'three';
import { Builder, M, textMat, textTex, ledMat, colorMat, DEG } from './builder.js';

// ───────────────────────── shared materials ─────────────────────────
const SEAM = colorMat('#2c2e31', 0.6, 0.6);        // gaps / slits in sheet metal
const STEEL2 = colorMat('#b3b6b9', 0.3, 1);        // slightly darker steel (inner springs, second shells)
const BACKWALL = colorMat('#7d7a72', 0.85);        // plastic seen deep inside a cavity
const CREAM = colorMat('#e8e3d2', 0.5);            // JST / FPC natural nylon
const CARD = colorMat('#17181b', 0.5);             // microSD card
const MODPCB = colorMat('#1d1e20', 0.7);           // edge of a black module PCB
const MODTRACE = colorMat('#2f3338', 0.38);        // mask-covered copper on a black module
const LIP = colorMat('#5c5f62', 0.5, 1);              // inner side of a flared lip (kept darker: it faces the sky)
const GOLD_DARK = colorMat('#8a6a2c', 0.4, 1);     // inside of a castellated half-hole

// ───────────────────────── 2D polygon helpers (points = [u, v]) ─────────────────────────
const dedupe = (pts) => {
  const out = [];
  for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) out.push(p); }
  const a = out[0], z = out[out.length - 1];
  if (out.length > 1 && Math.hypot(a[0] - z[0], a[1] - z[1]) < 1e-6) out.pop();
  return out;
};
/** Rounded rectangle polygon (CCW) w × h centred at (cu, cv). */
function rr(w, h, r, cu = 0, cv = 0, seg = 3) {
  const pts = [], hw = w / 2, hh = h / 2; r = Math.min(r, hw, hh);
  const corner = (x, y, a0) => { for (let i = 0; i <= seg; i++) { const a = a0 + (i / seg) * Math.PI / 2; pts.push([cu + x + r * Math.cos(a), cv + y + r * Math.sin(a)]); } };
  corner(hw - r, -hh + r, -Math.PI / 2); corner(hw - r, hh - r, 0); corner(-hw + r, hh - r, Math.PI / 2); corner(-hw + r, -hh + r, Math.PI);
  return dedupe(pts);
}
const stadium = (w, h, cu = 0, cv = 0, seg = 8) => rr(w, h, h / 2, cu, cv, seg);
const circle = (r, cu = 0, cv = 0, seg = 28) => Array.from({ length: seg }, (_, i) => [cu + r * Math.cos(i / seg * Math.PI * 2), cv + r * Math.sin(i / seg * Math.PI * 2)]);
/** Offset a polygon: d > 0 shrinks, d < 0 grows (mitred corners, keeps the vertex count). */
function inset(pts, d) {
  const n = pts.length; let A = 0;
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; A += p[0] * q[1] - q[0] * p[1]; }
  const s = A > 0 ? 1 : -1, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    let ax = p1[0] - p0[0], ay = p1[1] - p0[1]; const la = Math.hypot(ax, ay) || 1; ax /= la; ay /= la;
    let bx = p2[0] - p1[0], by = p2[1] - p1[1]; const lb = Math.hypot(bx, by) || 1; bx /= lb; by /= lb;
    const n1x = -ay * s, n1y = ax * s, n2x = -by * s, n2y = bx * s, k = Math.max(0.2, 1 + n1x * n2x + n1y * n2y);
    out.push([p1[0] + d * (n1x + n2x) / k, p1[1] + d * (n1y + n2y) / k]);
  }
  return out;
}
const path = (pts, s) => { pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]))); s.closePath(); return s; };
const poly = (pts) => path(pts, new THREE.Shape());
const ring = (outer, ...holes) => { const s = poly(outer); for (const hl of holes) s.holes.push(path(hl, new THREE.Path())); return s; };

// ───────────────────────── 3D helpers ─────────────────────────
/** Extrude a shape drawn in the (y, h) plane along +x from x0 to x0 + depth. Bevel keeps the outer size (edges are rounded inwards). */
function xExtrude(B, shape, depth, mat, x0 = 0, { bevel = 0, seg = 10 } = {}) {
  const g = new THREE.ExtrudeGeometry(shape, bevel
    ? { depth: depth - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelOffset: -bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: seg }
    : { depth, bevelEnabled: false, curveSegments: seg });
  if (bevel) g.translate(0, 0, bevel);
  g.rotateY(Math.PI / 2);                       // (u, v, z) → x = z, h = v, y = u
  return B.geo(g, mat, x0, 0, 0);
}
/** Extrude a plan-view polygon [[x, y], ...] upwards (rounded edges, outer size kept). */
function zExtrude(B, shape, sh, mat, h0, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shape, bevel
    ? { depth: sh - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelOffset: -bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 8 }
    : { depth: sh, bevelEnabled: false, curveSegments: 8 });
  if (bevel) g.translate(0, 0, bevel);
  g.rotateX(-Math.PI / 2);
  return B.geo(g, mat, 0, 0, h0);
}
/**
 * Quad strip between two closed polylines given in the (y, h) plane at depths xA and xB.
 * face: 'out' (normals away from the axis) | 'in' | 'front' (normals to −x) | 'back'.
 */
function loft(B, ptsA, xA, ptsB, xB, mat, face = 'out') {
  const n = ptsA.length, pos = [];
  let cy = 0, ch = 0; for (const p of ptsA) { cy += p[0]; ch += p[1]; } cy /= n; ch /= n;
  const V = (p, x) => [x, p[1], -p[0]];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = V(ptsA[i], xA), b = V(ptsA[j], xA), c = V(ptsB[j], xB), d = V(ptsB[i], xB);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mh = (a[1] + b[1] + c[1] + d[1]) / 4 - ch, mz = (a[2] + b[2] + c[2] + d[2]) / 4 + cy;
    const score = face === 'front' ? -nx : face === 'back' ? nx : (face === 'in' ? -1 : 1) * (ny * mh + nz * mz);
    if (score >= 0) pos.push(...a, ...b, ...c, ...a, ...c, ...d); else pos.push(...a, ...c, ...b, ...a, ...d, ...c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return B.geo(g, mat, 0, 0, 0);
}
/** Dark inside of a connector: thin liner along the mouth outline from x0 to x0 + depth plus a back wall. */
function hollow(B, mouth, x0, depth, backMat = M.cavity, wallMat = M.cavity) {
  xExtrude(B, ring(inset(mouth, -0.03), inset(mouth, 0.05)), depth, wallMat, x0);
  xExtrude(B, poly(inset(mouth, -0.03)), 0.06, backMat, x0 + depth - 0.06);
}
/** Box centred at (x, y, h) and tilted around the lateral axis: tilt > 0 lifts the +x end. */
function tbox(B, sx, sy, sh, mat, x, y, h, tilt) {
  const g = new THREE.BoxGeometry(sx, sh, sy); g.rotateZ(tilt * DEG);
  return B.geo(g, mat, x, y, h);
}
/** Solid of revolution around the x axis. pts = [[radius, x], ...]; walk outer walls towards +x for outward normals. */
function xLathe(B, pts, mat, x, y, h, seg = 28) {
  const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(Math.max(p[0], 1e-4), p[1])), seg);
  g.rotateZ(-Math.PI / 2);
  return B.geo(g, mat, x, y, h);
}
/** Solder cone around a through-hole pin. dir = +1 on the part side (h = 0), −1 under the board. */
function fillet(B, x, y, h, r, hh, dir) {
  if (dir > 0) B.lathe([[r, 0], [r * 0.6, hh * 0.4], [r * 0.28, hh]], M.solder, x, y, h, 12);
  else B.lathe([[r * 0.28, -hh], [r * 0.6, -hh * 0.4], [r, 0]], M.solder, x, y, h, 12);
}
/** Sheet-metal leg soldered through the board: sx × sy cross-section, `top` mm above the board, `below` mm under it. */
function leg(B, b, x, y, { sx = 1, sy = 0.3, top = 1.5, below = 0.9, r = 1.0, mat = M.steel, topFillet = true } = {}) {
  B.box(sx, sy, top + b.t + below, mat, x, y, -b.t - below);
  if (topFillet) fillet(B, x, y, 0, r, 0.5, 1);
  fillet(B, x, y, -b.t, r, 0.6, -1);
}
/** Signal pin end sticking out under the board with its solder cone. */
function pinStub(B, b, x, y, { d = 0.6, below = 0.8, r = 0.75, mat = M.tin } = {}) {
  B.box(d, d, b.t + below, mat, x, y, -b.t - below);
  fillet(B, x, y, -b.t, r, 0.5, -1);
}
/** SMD foot: flat tab on a solder bed. */
function smdFoot(B, x, y, sx, sy, mat = M.steel, th = 0.22) {
  B.box(sx + 0.3, sy + 0.3, 0.09, M.solder, x, y, 0.0);
  B.box(sx, sy, th, mat, x, y, 0.05);
}
/** Spring finger punched in a horizontal sheet at height h: dark U-slit + slightly lifted tongue. dir = side of the free end (±1 along x). */
function fingerTop(B, x, y, h, len, wid, dir = -1, mat = M.steel) {
  B.box(len + 0.22, wid + 0.34, 0.03, SEAM, x + dir * 0.11, y, h - 0.022);
  tbox(B, len, wid, 0.1, mat, x, y, h + 0.02, dir * 1.6);
}
/** Spring finger punched in a side wall (plane y = yFace, outward direction sgn = ±1). */
function fingerSide(B, x, yFace, sgn, hc, len, hgt, dir = -1, mat = M.steel) {
  B.box(len + 0.22, 0.03, hgt + 0.34, SEAM, x + dir * 0.11, yFace + sgn * -0.007, hc - hgt / 2 - 0.17);
  B.box(len, 0.1, hgt, mat, x, yFace + sgn * 0.03, hc - hgt / 2, -sgn * dir * 1.6);
}
/** Thin dark line on a horizontal surface through plan points [[x, y], ...]. */
function seamTop(B, pts, h, w = 0.08, mat = SEAM) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], L = Math.hypot(x2 - x1, y2 - y1);
    B.box(L + w, w, 0.02, mat, (x1 + x2) / 2, (y1 + y2) / 2, h - 0.012, Math.atan2(y2 - y1, x2 - x1) / DEG);
  }
}
/** Footprint painter bound to a part placement (local → board coordinates). */
function foot(b, x, y, rot, side) {
  const L = b.local(x, y, rot, side);
  return {
    L,
    pad(lx, ly, w, h, o = {}) { const [px, py] = L(lx, ly); b.pad(px, py, w, h, { rot, side, ...o }); },
    th(lx, ly, o) { const [px, py] = L(lx, ly); b.th(px, py, o); },
    /** Plated slot w (along local x) × h (along local y). */
    slot(lx, ly, w, h, ringW = 0.9) {
      const [px, py] = L(lx, ly);
      for (const s of ['top', 'bottom']) b.pad(px, py, w + ringW * 2, h + ringW * 2, { rot, side: s, shape: 'oval' });
      const long = Math.max(w, h), short = Math.min(w, h), n = Math.max(1, Math.ceil((long - short) / (short * 0.45)) + 1);
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * (long - short);
        const [qx, qy] = L(lx + (w >= h ? t : 0), ly + (w >= h ? 0 : t)); b.drill(qx, qy, short);
      }
    },
    drill(lx, ly, d) { const [px, py] = L(lx, ly); b.drill(px, py, d); },
    rect(lx, ly, w, h, o = {}) { const [px, py] = L(lx, ly); b.rect(px, py, w, h, { rot, side, ...o }); },
    line(pts, o = {}) { b.line(pts.map(p => L(p[0], p[1])), { side, ...o }); },
    keepout(lx, ly, w, h) { const [px, py] = L(lx, ly); b.keepout(px, py, w, h, { side, rot }); },
  };
}
const TONGUE = { white: M.white, black: M.black, blue: M.blue, beige: M.beige };

// ───────────────────────── canvas helpers (drawing in millimetres) ─────────────────────────
const FONT = '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';
/** Text in a context that is set up in mm with y pointing up. size = cap height (mm). */
function mmText(g, str, x, y, size, { align = 'center', weight = 600, color, maxW } = {}) {
  g.save(); g.translate(x, y); g.scale(1 / 16, -1 / 16);
  g.font = `${weight} ${size * 16 * 1.38}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle';
  if (color) g.fillStyle = color;
  const tw = g.measureText(str).width / 16;
  if (maxW && tw > maxW) g.scale(maxW / tw, 1);
  g.fillText(str, 0, size * 16 * 0.06); g.restore();
}
/**
 * Material painted in mm (origin = centre, x right, y up). key must identify everything paint() depends on. Cached.
 * Unlike textMat it has no polygon offset, so thin metal geometry may lie right on top of the painted surface.
 */
const _mm = new Map();
function mmMat(key, wmm, hmm, ppm, paint, { bg = '#1a1b1d', roughness = 0.5, metalness = 0 } = {}) {
  if (_mm.has(key)) return _mm.get(key);
  const map = textTex({
    w: Math.round(wmm * ppm), h: Math.round(hmm * ppm), bg, lines: [{ t: '', k: key }],
    draw: (g, W, H) => { g.save(); g.translate(W / 2, H / 2); g.scale(W / wmm, -H / hmm); g.lineJoin = 'round'; g.lineCap = 'round'; paint(g); g.restore(); },
  });
  const m = new THREE.MeshStandardMaterial({ map, roughness, metalness });
  _mm.set(key, m); return m;
}
/**
 * Top of a stamped shield can: brushed metal with laser-engraved text.
 * lines: [str | { t, size (mm cap height), y (mm from centre), x, align, weight }];  dots: row of small holes along the rim.
 */
function canMat(wmm, lmm, lines = [], { dots = false, key = '', ink = '#585b5f' } = {}) {
  const id = 'can|' + JSON.stringify([wmm, lmm, lines, dots, key, ink]);
  return mmMat(id, wmm, lmm, 40, (g) => {
    // faint brushing
    for (let i = 0; i < 90; i++) {
      const yy = (Math.random() - 0.5) * lmm, x0 = (Math.random() - 0.5) * wmm, len = wmm * (0.2 + Math.random() * 0.6);
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.045)'; g.lineWidth = 0.04 + Math.random() * 0.05;
      g.beginPath(); g.moveTo(x0, yy); g.lineTo(x0 + len, yy); g.stroke();
    }
    if (dots) {
      g.fillStyle = '#17181a';
      const m = 0.75, nx = Math.max(2, Math.round((wmm - 2 * m) / 1.5)), ny = Math.max(2, Math.round((lmm - 2 * m) / 1.5));
      const dot = (x, y) => { g.beginPath(); g.arc(x, y, 0.24, 0, 7); g.fill(); };
      for (let i = 0; i <= nx; i++) { const x = -wmm / 2 + m + i * (wmm - 2 * m) / nx; dot(x, lmm / 2 - m); dot(x, -lmm / 2 + m); }
      for (let i = 1; i < ny; i++) { const y = -lmm / 2 + m + i * (lmm - 2 * m) / ny; dot(wmm / 2 - m, y); dot(-wmm / 2 + m, y); }
    }
    g.fillStyle = ink;
    const L = lines.map(l => (typeof l === 'string' ? { t: l } : l)), auto = L.filter(l => l.y == null);
    const base = Math.min(lmm * (dots ? 0.42 : 0.5) / Math.max(1, auto.length) / 1.5, wmm / 7.5);
    let total = 0; auto.forEach((l, i) => { l._s = l.size ?? (i === 0 ? base * 1.15 : base * 0.8); total += l._s * 1.75; });
    let yy = total / 2;
    for (const l of L) {
      const s = l._s ?? l.size ?? base;
      let ly = l.y; if (ly == null) { ly = yy - s * 0.875; yy -= s * 1.75; }
      mmText(g, l.t, l.x ?? 0, ly, s, { align: l.align ?? 'center', weight: l.weight ?? 600, maxW: wmm * (dots ? 0.7 : 0.86) });
    }
  }, { bg: '#aeb1b4', roughness: 0.42, metalness: 1 });
}

// ───────────────────────── sizes ─────────────────────────
/** Overall size of a connector: w = width (across, local y), d = depth (local x, from the mouth), h = height above the board. */
export function connectorSize(name, o = {}) {
  switch (name) {
    case 'usbB': return { w: 12.0, d: 16.4, h: 10.8 };
    case 'usbMini': return { w: 7.7, d: 9.3, h: 3.9 };
    case 'usbMicro': return { w: 7.5, d: 5.6, h: 2.5 };
    case 'usbC': return { w: 8.94, d: 7.3, h: 3.2 };
    case 'usbA': return (o.stack ?? 2) === 2 ? { w: 13.2, d: 17.5, h: 15.6 } : { w: 13.2, d: 14.0, h: 7.0 };
    case 'rj45': return { w: 16.0, d: 21.0, h: 13.5 };
    case 'microHdmi': return { w: 6.5, d: 7.5, h: 2.9 };
    case 'audioJack': return { w: 6.0, d: 14.5, h: 5.0 };          // d includes the 2.5 mm barrel
    case 'barrelJack': return { w: 9.0, d: 14.0, h: 11.0 };
    case 'fpc': { const n = o.n ?? 15, p = o.pitch ?? 1.0; return { w: (n - 1) * p + 8, d: o.d ?? 2.8, h: o.h ?? 5.5 }; }
    case 'microSD': return { w: 12.0, d: 11.5, h: 1.5 };            // card sticks 3.6 mm out of the mouth
    case 'rfModule': return (o.type ?? 'esp32-wroom') === 'esp12' ? { w: 16.0, d: 24.0, h: 3.05 } : { w: 18.0, d: 25.5, h: 3.15 };
    case 'shieldCan': return { w: o.l ?? 10, d: o.w ?? 12, h: o.h ?? 1.8 };
    case 'chipAntenna': return { w: o.w ?? 1.6, d: o.len ?? 3.2, h: o.h ?? 1.1 };
    case 'slideSwitch': return { w: 2.7, d: 6.7, h: 1.4 };          // + lever 1.5 mm towards local −y
    case 'jstPH': { const n = o.n ?? 2; return { w: 2 * (n - 1) + 5.9, d: 6.0, h: 4.8 }; }
    default: return null;
  }
}

// ═════════════════════════ USB-B (full size, through-hole) ═════════════════════════
export function usbB(b, { x = 0, y = 0, rot = 0, side = 'top' } = {}) {
  const f = foot(b, x, y, rot, side), B = new Builder();
  const W = 12, H = 10.8, D = 16.4, T = 0.35, hc = 5.4;
  const outer = rr(W, H, 0.75, 0, H / 2, 3);
  const mouth = [[-4.22, 1.5], [4.22, 1.5], [4.22, 7.6], [2.6, 9.28], [-2.6, 9.28], [-4.22, 7.6]];
  // footprint: 4 signal pins + 2 shield legs
  const pins = [[14.3, 1.25], [14.3, -1.25], [12.3, -1.25], [12.3, 1.25]];
  for (const [px, py] of pins) f.th(px, py, { d: 1.7, hole: 0.92 });
  for (const s of [-1, 1]) f.th(9.6, s * 6.02, { d: 3.6, hole: 2.3 });
  // shell: front plate with the plug-shaped opening + sleeve + back plate
  xExtrude(B, ring(outer, mouth), 0.5, M.steel, 0, { bevel: 0.13 });
  xExtrude(B, ring(outer, inset(outer, T)), D - 0.3, M.steel, 0.3, { bevel: 0.1 });
  B.rbox(0.35, W - 0.5, H - 0.5, 0.12, M.steel, D - 0.2, 0, 0.25);
  hollow(B, mouth, 0.5, 10.4, BACKWALL);
  // white tongue block with 2 + 2 contacts
  B.rbox(9.0, 5.6, 3.1, 0.3, M.white, 1.6 + 4.5, 0, hc - 1.55);
  for (const s of [-1, 1]) {
    B.box(6.4, 1.0, 0.08, M.gold, 2.2 + 3.2, s * 1.3, hc + 1.55);
    B.box(6.4, 1.0, 0.08, M.gold, 2.2 + 3.2, s * 1.3, hc - 1.55 - 0.08);
    B.box(0.1, 1.0, 0.5, M.gold, 2.15, s * 1.3, hc + 1.1);       // contact tips wrapping the front edge
    B.box(0.1, 1.0, 0.5, M.gold, 2.15, s * 1.3, hc - 1.6);
  }
  // sheet-metal details: spring fingers on top and both sides, rear fold seam
  for (const s of [-1, 1]) {
    fingerTop(B, 5.2, s * 2.7, H, 5.0, 1.7, -1);
    fingerSide(B, 5.0, s * W / 2, s, hc + 0.6, 5.0, 2.6, -1);
    B.box(0.06, 0.03, H - 1.6, SEAM, D - 2.4, s * (W / 2 + 0.002), 0.8);          // rear flap seams on the sides
  }
  seamTop(B, [[D - 2.4, -W / 2 + 0.7], [D - 2.4, W / 2 - 0.7]], H + 0.005);
  seamTop(B, [[D - 2.4, -1.6], [D - 1.5, -1.6], [D - 1.5, 1.6], [D - 2.4, 1.6]], H + 0.005);
  // shield legs (bulge out of the side walls) + pin ends under the board
  for (const s of [-1, 1]) {
    B.box(2.2, 0.5, 0.35, M.steel, 9.6, s * (W / 2 + 0.05), 1.6);
    leg(B, b, 9.6, s * (W / 2 + 0.12), { sx: 2.0, sy: 0.35, top: 1.8, below: 1.1, r: 1.5 });
  }
  for (const [px, py] of pins) pinStub(B, b, px, py, { d: 0.64, r: 0.8 });
  return b.place(B.build('usbB'), x, y, rot, side);
}

// ═════════════════════════ USB Mini-B (SMD) ═════════════════════════
export function usbMini(b, { x = 0, y = 0, rot = 0, side = 'top' } = {}) {
  const f = foot(b, x, y, rot, side), B = new Builder();
  const D = 9.3, T = 0.3;
  const mouth = [[-2.7, 0.35], [2.7, 0.35], [3.5, 1.45], [3.5, 3.55], [-3.5, 3.55], [-3.5, 1.45]];
  const outer = inset(mouth, -T), top = 3.55 + T, half = 3.5 + T;
  // footprint
  for (let i = 0; i < 5; i++) f.pad(D + 0.75, (i - 2) * 0.8, 2.3, 0.5);
  for (const s of [-1, 1]) { f.pad(2.6, s * 4.45, 2.3, 2.0); f.pad(8.0, s * 4.45, 2.3, 2.0); }
  f.drill(5.2, 2.2, 0.9); f.drill(5.2, -2.2, 0.9);
  // shell
  xExtrude(B, ring(outer, mouth), D, M.steel, 0, { bevel: 0.09 });
  hollow(B, mouth, 0.45, 6.2);
  B.rbox(5.6, 4.6, 0.75, 0.14, M.black, 0.9 + 2.8, 0, 1.75);                     // tongue
  for (let i = 0; i < 5; i++) B.box(4.2, 0.42, 0.06, M.gold, 1.3 + 2.1, (i - 2) * 0.8, 2.5);
  // latch windows + punched tabs on top, seam at the rear
  for (const s of [-1, 1]) {
    B.box(1.15, 1.5, 0.03, M.cavity, 3.0, s * 1.95, top - 0.02);
    B.box(1.0, 0.03, 1.1, SEAM, 6.2, s * (half + 0.002), 1.8);
  }
  seamTop(B, [[D - 1.9, -half + 0.4], [D - 1.9, half - 0.4]], top + 0.004, 0.07);
  // rear plastic + 5 leads
  B.box(1.5, 6.5, 3.0, M.black, D - 0.55, 0, 0.3);
  for (let i = 0; i < 5; i++) { B.box(1.5, 0.36, 0.18, M.tin, D + 0.75, (i - 2) * 0.8, 0.05); B.box(1.7, 0.5, 0.07, M.solder, D + 0.8, (i - 2) * 0.8, 0); }
  // 4 shell tabs
  for (const s of [-1, 1]) for (const tx of [2.6, 8.0]) {
    B.box(1.7, 0.3, 1.5, M.steel, tx, s * (half + 0.12), 0.1);
    smdFoot(B, tx, s * (half + 0.62), 1.7, 1.1);
  }
  return b.place(B.build('usbMini'), x, y, rot, side);
}

// ═════════════════════════ USB Micro-B (SMD, flared mouth) ═════════════════════════
export function usbMicro(b, { x = 0, y = 0, rot = 0, side = 'top' } = {}) {
  const f = foot(b, x, y, rot, side), B = new Builder();
  const D = 5.6, T = 0.25, FL = 0.6, FO = 0.36;
  const mouth = [[-2.75, 0.3], [2.75, 0.3], [3.45, 0.95], [3.45, 2.15], [-3.45, 2.15], [-3.45, 0.95]];
  const outer = inset(mouth, -T), top = 2.15 + T, half = 3.45 + T;
  const flare = (pts) => inset(pts, -FO).map(p => [p[0], Math.max(p[1], -0.1)]);      // the lip barely dips below the board plane
  // footprint
  for (let i = 0; i < 5; i++) f.pad(D + 0.55, (i - 2) * 0.65, 1.5, 0.4);
  for (const s of [-1, 1]) { f.pad(3.0, s * 4.25, 1.9, 1.7); f.pad(4.6, s * 1.6, 1.6, 1.6); }
  // shell tube + flared lip
  xExtrude(B, ring(outer, mouth), D - FL + 0.05, M.steel, FL - 0.05, { bevel: 0.06 });
  loft(B, outer, FL, flare(outer), 0, M.steel, 'out');
  loft(B, mouth, FL, flare(mouth), 0, LIP, 'in');
  loft(B, flare(mouth), 0, flare(outer), 0, M.steel, 'front');
  hollow(B, mouth, FL, 4.3);
  B.rbox(3.7, 3.6, 0.55, 0.1, M.black, 0.75 + 1.85, 0, 0.95);                    // tongue
  for (let i = 0; i < 5; i++) B.box(2.8, 0.3, 0.05, M.gold, 1.0 + 1.4, (i - 2) * 0.65, 1.5);
  // top: two latch holes + stamped line
  for (const s of [-1, 1]) B.box(0.75, 1.05, 0.03, M.cavity, 2.0, s * 2.2, top - 0.02);
  seamTop(B, [[D - 1.2, -half + 0.3], [D - 1.2, half - 0.3]], top + 0.004, 0.06);
  // rear plastic + 5 fine leads
  B.box(0.9, 6.2, 1.9, M.black, D - 0.25, 0, 0.25);
  for (let i = 0; i < 5; i++) { B.box(1.3, 0.26, 0.12, M.tin, D + 0.5, (i - 2) * 0.65, 0.04); B.box(1.5, 0.4, 0.06, M.solder, D + 0.55, (i - 2) * 0.65, 0); }
  // side wings
  for (const s of [-1, 1]) {
    B.box(1.5, 0.25, 1.3, M.steel, 3.0, s * (half + 0.1), 0.1);
    smdFoot(B, 3.0, s * (half + 0.55), 1.5, 0.9);
  }
  return b.place(B.build('usbMicro'), x, y, rot, side);
}

// ═════════════════════════ USB-C (mid-mount style, 4 through-hole legs) ═════════════════════════
export function usbC(b, { x = 0, y = 0, rot = 0, side = 'top' } = {}) {
  const f = foot(b, x, y, rot, side), B = new Builder();
  const W = 8.94, H = 3.16, D = 7.3, hc = H / 2 + 0.02;
  const outer = stadium(W, H, 0, hc, 8), mouth = stadium(8.34, 2.56, 0, hc, 8);
  // footprint
  for (let i = 0; i < 12; i++) f.pad(D + 0.85, (i - 5.5) * 0.5, 1.2, 0.28);
  for (const s of [-1, 1]) { f.slot(2.7, s * 4.32, 1.5, 0.6, 0.45); f.slot(6.3, s * 4.32, 1.1, 0.6, 0.45); }
  // shell (seamless drawn tube) + outer bracket shell over the rear part
  xExtrude(B, ring(outer, mouth), D, M.steel, 0, { bevel: 0.11 });
  xExtrude(B, ring(inset(outer, -0.17), inset(outer, 0.03)), D - 1.5, M.steel, 1.5, { bevel: 0.06 });
  hollow(B, mouth, 0.5, 5.7);
  // tongue with 12 + 12 contacts
  B.rbox(4.8, 6.7, 0.7, 0.18, M.black, 0.85 + 2.4, 0, hc - 0.35);
  for (let i = 0; i < 12; i++) {
    const cy = (i - 5.5) * 0.5;
    B.box(3.5, 0.24, 0.04, M.gold, 1.35 + 1.75, cy, hc + 0.35);
    B.box(3.5, 0.24, 0.04, M.gold, 1.35 + 1.75, cy, hc - 0.39);
  }
  // rear plastic + leads
  B.box(1.3, 7.7, 2.5, M.black, D - 0.05, 0, 0.3);
  for (let i = 0; i < 12; i++) B.box(0.9, 0.22, 0.1, M.tin, D + 0.9, (i - 5.5) * 0.5, 0.03);
  B.box(1.2, 6.2, 0.05, M.solder, D + 0.9, 0, 0);
  // legs
  for (const s of [-1, 1]) for (const [lx, lw] of [[2.7, 1.3], [6.3, 1.0]]) {
    B.box(lw, 0.5, 0.25, M.steel, lx, s * 4.2, hc - 0.3);
    leg(B, b, lx, s * 4.32, { sx: lw, sy: 0.25, top: hc, below: 0.7, r: 0.75 });
  }
  seamTop(B, [[1.5, 0], [D, 0]], H + 0.17 + 0.02, 0.05);
  return b.place(B.build('usbC'), x, y, rot, side);
}

// ═════════════════════════ USB-A (single or stacked double) ═════════════════════════
export function usbA(b, { x = 0, y = 0, rot = 0, side = 'top', stack = 2, usb3 = false, tongue } = {}) {
  const f = foot(b, x, y, rot, side), B = new Builder();
  const two = stack === 2, W = 13.2, D = two ? 17.5 : 14.0, H = two ? 15.6 : 7.0, T = 0.3, OW = 12.3, OH = 4.9;
  const ports = two ? [1.9, 9.8] : [1.05];                    // bottom edge of each opening
  const outer = rr(W, H, 0.55, 0, H / 2, 3);
  const mouths = ports.map(h0 => rr(OW, OH, 0.4, 0, h0 + OH / 2, 2));
  const tMat = TONGUE[tongue] ?? (usb3 ? M.blue : M.black);
  // footprint
  const rows = two ? [D - 1.5, D - 4.1] : [D - 1.5];
  const cols = [-3.5, -1.0, 1.0, 3.5];
  for (const rx of rows) for (const cy of cols) f.th(rx, cy, { d: 1.6, hole: 0.92 });
  if (usb3) for (const rx of rows) for (const cy of [-4.75, -2.25, 0, 2.25, 4.75]) f.th(rx - 1.3, cy, { d: 1.2, hole: 0.65 });
  const legsX = [6.2, D - 3.2];
  for (const s of [-1, 1]) for (const lx of legsX) f.th(lx, s * 6.6, { d: 3.2, hole: 1.9 });
  // shell
  xExtrude(B, ring(outer, ...mouths), 0.4, M.steel, 0, { bevel: 0.1 });
  xExtrude(B, ring(outer, inset(outer, T)), D - 0.25, M.steel, 0.25, { bevel: 0.1 });
  B.rbox(0.3, W - 0.5, H - 0.5, 0.1, M.steel, D - 0.17, 0, 0.25);
  ports.forEach((h0, k) => {
    const hTop = h0 + OH;
    hollow(B, mouths[k], 0.4, 10.6);
    // tongue (upper half of the opening, contacts face down)
    const tt = 1.85, th0 = hTop - 0.72 - tt;
    B.rbox(8.8, 10.7, tt, 0.25, tMat, 0.95 + 4.4, 0, th0);
    for (const cy of cols) {
      B.box(6.6, 1.0, 0.07, M.gold, 1.9 + 3.3, cy, th0 - 0.07);
      B.box(0.08, 1.0, 0.45, M.gold, 0.93, cy, th0 + 0.02);
    }
    if (usb3) for (let i = 0; i < 5; i++) B.box(1.3, 0.7, 0.09, M.gold, 1.75, (i - 2) * 2.0, th0 - 0.09);
    // spring fingers of the shell seen inside the mouth
    for (const s of [-1, 1]) {
      tbox(B, 3.4, 1.7, 0.14, STEEL2, 2.3, s * 3.3, hTop - 0.12, 3);
      tbox(B, 3.4, 1.7, 0.14, STEEL2, 2.3, s * 3.3, h0 + 0.12, -3);
      fingerSide(B, 5.6, s * W / 2, s, h0 + OH / 2, 5.2, 2.0, -1);
    }
  });
  // top fingers, punched windows in the divider, rear seams
  for (const s of [-1, 1]) {
    fingerTop(B, 5.6, s * 3.3, H, 5.2, 2.0, -1);
    if (two) B.box(0.03, 2.3, 0.85, M.cavity, -0.003, s * 3.4, (ports[0] + OH + ports[1]) / 2 - 0.42);
    B.box(0.06, 0.03, H - 1.4, SEAM, D - 3.0, s * (W / 2 + 0.002), 0.7);
  }
  seamTop(B, [[D - 3.0, -W / 2 + 0.6], [D - 3.0, W / 2 - 0.6]], H + 0.005);
  seamTop(B, [[D - 3.0, -2.2], [D - 1.9, -1.6], [D - 1.9, 1.6], [D - 3.0, 2.2]], H + 0.005);
  // flanged lip around the mouth (top + both sides)
  B.rbox(0.3, W - 2.6, 0.75, 0.1, M.steel, 0.15, 0, H - 0.1);
  for (const s of [-1, 1]) B.rbox(0.3, 0.75, H - 3.2, 0.1, M.steel, 0.15, s * (W / 2 + 0.28), 1.6);
  // legs + pin ends
  for (const s of [-1, 1]) for (const lx of legsX) leg(B, b, lx, s * (W / 2 + 0.05), { sx: 2.0, sy: 0.3, top: 2.2, below: 1.0, r: 1.35 });
  for (const rx of rows) for (const cy of cols) pinStub(B, b, rx, cy);
  return b.place(B.build('usbA'), x, y, rot, side);
}

// ═════════════════════════ RJ45 (shielded, tab-down, LEDs in the top corners) ═════════════════════════
export function rj45(b, { x = 0, y = 0, rot = 0, side = 'top', leds = true, lit = false } = {}) {
  const f = foot(b, x, y, rot, side), B = new Builder();
  const W = 16, D = 21, H = 13.5, T = 0.3, oTop = 9.8;
  const outer = rr(W, H, 0.5, 0, H / 2, 3);
  const open = [[-1.7, 1.2], [1.7, 1.2], [1.7, 2.1], [3.2, 2.1], [3.2, 3.3], [5.85, 3.3], [5.85, oTop], [-5.85, oTop], [-5.85, 3.3], [-3.2, 3.3], [-3.2, 2.1], [-1.7, 2.1]];
  const ledY = 5.9, ledH = 11.75, ledWin = (s) => rr(2.6, 1.7, 0.2, s * ledY, ledH, 2);
  // footprint
  for (let i = 0; i < 8; i++) f.th(i % 2 ? D - 4.2 : D - 1.7, (i - 3.5) * 1.27, { d: 1.5, hole: 0.9 });
  for (const s of [-1, 1]) { f.th(10.2, s * 7.9, { d: 3.0, hole: 1.7 }); f.drill(6.4, s * 5.7, 3.2); f.th(D - 1.7, s * 6.6, { d: 1.5, hole: 0.9 }); f.th(D - 4.2, s * 6.6, { d: 1.5, hole: 0.9 }); }
  // steel shell: front plate (opening a little larger than the plastic one), sleeve, back
  const plateHoles = [inset(open, -0.45)];
  if (leds) plateHoles.push(inset(ledWin(-1), -0.15), inset(ledWin(1), -0.15));
  xExtrude(B, ring(outer, ...plateHoles), 0.32, M.steel, 0, { bevel: 0.09 });
  xExtrude(B, ring(outer, inset(outer, T)), D - 0.2, M.steel, 0.2, { bevel: 0.1 });
  B.rbox(0.3, W - 0.5, H - 0.5, 0.1, M.steel, D - 0.17, 0, 0.25);
  // black plastic housing behind the plate
  xExtrude(B, ring(inset(outer, T), open), 13.6, M.black, 0.16, { bevel: 0.06 });
  hollow(B, open, 1.6, 12.2);
  // 8 gold contacts sloping down from the top of the cavity + their comb
  B.box(2.2, 8.6, 0.5, M.black, 2.4, 0, oTop - 0.55);
  for (let i = 0; i < 8; i++) tbox(B, 7.4, 0.42, 0.24, M.gold, 5.4, (i - 3.5) * 1.02, oTop - 1.55, -17);
  // LED light pipes
  if (leds) [['#ffb800', -1], ['#2fd24a', 1]].forEach(([c, s]) => {
    xExtrude(B, poly(ledWin(s)), 0.5, ledMat(c, lit), 0.02, { bevel: 0.05 });
  });
  // spring lips: two on top, one on each side, rear seams
  for (const s of [-1, 1]) {
    B.box(3.4, 3.6, 0.03, SEAM, 2.75, s * 3.9, H - 0.02);
    tbox(B, 3.1, 3.2, 0.14, M.steel, 2.75, s * 3.9, H + 0.22, -8);
    B.box(3.4, 0.03, 3.6, SEAM, 3.0, s * (W / 2 + 0.003), 5.0);
    B.box(3.1, 0.14, 3.2, M.steel, 3.0, s * (W / 2 + 0.2), 5.2, s * 7);
    B.box(0.06, 0.03, H - 1.4, SEAM, D - 3.2, s * (W / 2 + 0.002), 0.7);
    fingerSide(B, 12.0, s * W / 2, s, 7.0, 4.0, 2.4, 1);
  }
  seamTop(B, [[D - 3.2, -W / 2 + 0.6], [D - 3.2, W / 2 - 0.6]], H + 0.005);
  seamTop(B, [[8.5, -W / 2 + 0.6], [8.5, W / 2 - 0.6]], H + 0.005, 0.06);
  fingerTop(B, 13.5, 0, H, 4.0, 3.0, 1);
  // shield legs + pin ends
  for (const s of [-1, 1]) leg(B, b, 10.2, s * (W / 2 - 0.1), { sx: 1.6, sy: 0.3, top: 1.5, below: 1.0, r: 1.3, topFillet: false });
  for (let i = 0; i < 8; i++) pinStub(B, b, i % 2 ? D - 4.2 : D - 1.7, (i - 3.5) * 1.27);
  return b.place(B.build('rj45'), x, y, rot, side);
}

// ═════════════════════════ micro-HDMI (type D) ═════════════════════════
export function microHdmi(b, { x = 0, y = 0, rot = 0, side = 'top' } = {}) {
  const f = foot(b, x, y, rot, side), B = new Builder();
  const D = 7.5, T = 0.3;
  const mouth = [[-2.3, 0.3], [2.3, 0.3], [2.95, 1.0], [2.95, 2.6], [-2.95, 2.6], [-2.95, 1.0]];
  const outer = inset(mouth, -T), top = 2.6 + T, half = 2.95 + T;
  // footprint
  for (let i = 0; i < 19; i++) f.pad(D + 0.6, (i - 9) * 0.4, 1.2, 0.23);
  for (const s of [-1, 1]) { f.slot(2.5, s * 3.5, 1.3, 0.6, 0.4); f.slot(6.2, s * 3.5, 1.0, 0.6, 0.4); }
  // shell with a small lip
  xExtrude(B, ring(outer, mouth), D, M.steel, 0, { bevel: 0.09 });
  loft(B, outer, 0.45, inset(outer, -0.12), 0.08, M.steel, 'out');
  hollow(B, mouth, 0.45, 5.6);
  B.rbox(4.6, 4.7, 0.5, 0.1, M.black, 0.8 + 2.3, 0, 1.25);
  for (let i = 0; i < 10; i++) B.box(3.4, 0.2, 0.04, M.gold, 1.2 + 1.7, (i - 4.5) * 0.4, 1.75);
  for (let i = 0; i < 9; i++) B.box(3.4, 0.2, 0.04, M.gold, 1.2 + 1.7, (i - 4) * 0.4, 1.21);
  // top details
  for (const s of [-1, 1]) B.box(0.8, 1.0, 0.03, M.cavity, 2.2, s * 1.7, top - 0.02);
  seamTop(B, [[D - 1.6, -half + 0.3], [D - 1.6, half - 0.3]], top + 0.004, 0.06);
  seamTop(B, [[3.6, 0], [D - 1.6, 0]], top + 0.004, 0.05);
  // rear plastic + leads
  B.box(1.1, 6.2, 2.3, M.black, D - 0.2, 0, 0.3);
  for (let i = 0; i < 19; i++) B.box(0.8, 0.18, 0.1, M.tin, D + 0.6, (i - 9) * 0.4, 0.03);
  B.box(1.0, 7.5, 0.05, M.solder, D + 0.6, 0, 0);
  for (const s of [-1, 1]) for (const [lx, lw] of [[2.5, 1.1], [6.2, 0.9]]) leg(B, b, lx, s * (half + 0.12), { sx: lw, sy: 0.25, top: 1.6, below: 0.7, r: 0.7 });
  return b.place(B.build('microHdmi'), x, y, rot, side);
}

// ═════════════════════════ 3.5 mm audio jack ═════════════════════════
export function audioJack(b, { x = 0, y = 0, rot = 0, side = 'top', metal = false } = {}) {
  const f = foot(b, x, y, rot, side), B = new Builder();
  const BL = 2.5, L = 12, W = 6, H = 5, hc = 2.5, R = 2.5, r = 1.8, bm = metal ? M.steel : M.black;
  // footprint
  for (const [px, py] of [[BL + 2.0, -3.4], [BL + 5.2, 3.4], [BL + 8.4, -3.4], [BL + 10.6, 3.4]]) f.pad(px, py, 1.4, 2.0);
  f.pad(BL + L + 0.5, 0, 1.8, 1.5);
  f.drill(BL + 3.0, 0, 1.2); f.drill(BL + 9.0, 0, 1.2);
  // barrel (bushing with a chamfered hole)
  xLathe(B, [[r, BL + 0.6], [r, 0.22], [r + 0.2, 0], [R - 0.2, 0], [R, 0.2], [R, BL + 0.4]], bm, 0, 0, hc, 32);
  xLathe(B, [[r - 0.02, 7.5], [r - 0.02, 0.5]], M.cavity, 0, 0, hc, 24);
  B.cyl(r, 0.05, M.cavity, 7.5, 0, hc, { axis: 'x', seg: 24 });
  xLathe(B, [[r - 0.03, 3.5], [r - 0.16, 3.4], [r - 0.16, 3.0], [r - 0.03, 2.9]], STEEL2, 0, 0, hc, 24);   // sleeve contact glimpse
  // body
  B.rbox(L, W, H, 0.3, M.black, BL + L / 2, 0, 0);
  B.rbox(0.9, W + 0.3, H + 0.1, 0.15, M.black, BL + 0.5, 0, 0);                 // front collar
  B.box(6.5, 3.4, 0.03, M.blackMatte, BL + 5.4, 0, H - 0.015);                    // top recess panel
  B.box(1.6, 1.0, 0.03, SEAM, BL + 10.2, 0, H - 0.012);
  for (const s of [-1, 1]) B.box(7.0, 0.03, 1.5, M.blackMatte, BL + 6, s * (W / 2 + 0.003), 1.8);
  // leads
  for (const [px, py] of [[BL + 2.0, -3.4], [BL + 5.2, 3.4], [BL + 8.4, -3.4], [BL + 10.6, 3.4]]) {
    B.box(0.9, 1.0, 0.22, M.tin, px, py * 0.97, 0.05); B.box(1.1, 1.4, 0.08, M.solder, px, py, 0);
  }
  B.box(1.0, 1.0, 0.22, M.tin, BL + L + 0.35, 0, 0.05); B.box(1.4, 1.2, 0.08, M.solder, BL + L + 0.4, 0, 0);
  return b.place(B.build('audioJack'), x, y, rot, side);
}

// ═════════════════════════ DC barrel jack 5.5 / 2.1 mm ═════════════════════════
export function barrelJack(b, { x = 0, y = 0, rot = 0, side = 'top' } = {}) {
  const f = foot(b, x, y, rot, side), B = new Builder();
  const W = 9, H = 11, hc = 6.5, RH = 3.15, FD = 3.5, BE = 13.3;
  // footprint: three plated slots (rear = centre pin, middle = sleeve, side = switch)
  f.slot(13.6, 0, 1.0, 3.2, 1.0); f.slot(7.6, 0, 1.0, 2.8, 1.0); f.slot(10.6, -4.7, 2.8, 1.0, 1.0);
  // front block with the round opening
  const hole = circle(RH, 0, hc, 32);
  xExtrude(B, ring(rr(W, H, 0.5, 0, H / 2, 3), hole), FD, M.black, 0, { bevel: 0.16 });
  hollow(B, hole, 0.4, 9.4);
  // body behind it (chamfered top), slot with the spring visible on top
  const body = [[-4.3, 0], [4.3, 0], [4.3, 8.3], [2.7, 10.4], [-2.7, 10.4], [-4.3, 8.3]];
  xExtrude(B, poly(body), BE - FD + 0.2, M.black, FD - 0.2, { bevel: 0.2 });
  B.box(5.0, 1.7, 0.04, M.cavity, 8.6, 0, 10.4 - 0.02);
  B.box(4.4, 1.0, 0.04, M.steel, 8.6, 0, 10.4 - 0.005);
  for (const s of [-1, 1]) B.box(6.0, 0.03, 2.2, M.blackMatte, 8.4, s * 4.303, 3.4);
  // centre pin with a rounded tip, sleeve spring
  B.cyl(1.0, 8.6, M.steel, 1.9 + 4.3, 0, hc, { axis: 'x', seg: 20 });
  B.sphere(1.0, M.steel, 1.9, 0, hc, { seg: 16 });
  tbox(B, 6.0, 1.9, 0.2, STEEL2, 3.8, 0, hc - RH + 0.42, -4);
  // terminals
  B.cyl(1.25, 0.3, M.steel, BE + 0.1, 0, hc, { axis: 'x', seg: 20 });             // riveted end of the centre pin
  B.box(0.35, 3.0, hc - 1.0, M.steel, BE + 0.22, 0, 1.2);
  leg(B, b, 13.6, 0, { sx: 0.4, sy: 2.9, top: 1.6, below: 1.3, r: 1.5 });
  leg(B, b, 7.6, 0, { sx: 0.4, sy: 2.5, top: 0.2, below: 1.3, r: 1.4, topFillet: false });
  B.box(2.6, 0.35, 3.6, M.steel, 10.6, -4.5, 0.6);
  leg(B, b, 10.6, -4.7, { sx: 2.5, sy: 0.4, top: 1.2, below: 1.3, r: 1.4 });
  return b.place(B.build('barrelJack'), x, y, rot, side);
}

// ═════════════════════════ vertical FFC / FPC connector (camera / display) ═════════════════════════
/** Origin = centre of the housing; the long axis runs along local y. */
export function fpc(b, { x = 0, y = 0, rot = 0, side = 'top', n = 15, pitch = 1.0, h = 5.5, d = 2.8, color = 'white', latch = 'brown' } = {}) {
  const f = foot(b, x, y, rot, side), B = new Builder();
  const len = (n - 1) * pitch + 8, barH = Math.min(1.4, h * 0.45), bodyH = h - barH, earH = Math.min(3.0, h - 0.3);
  const bm = color === 'beige' ? M.beige : color === 'black' ? M.black : CREAM, lm = latch === 'black' ? M.black : latch === 'white' ? M.white : M.brown;
  const py = (i) => (i - (n - 1) / 2) * pitch;
  // footprint: legs alternate between both sides + two hold-down pads
  for (let i = 0; i < n; i++) f.pad((i % 2 ? 1 : -1) * (d / 2 + 0.75), py(i), 1.6, Math.min(0.6, pitch * 0.6));
  for (const s of [-1, 1]) f.pad(0, s * (len / 2 + 0.1), d + 0.4, 1.6);
  // housing
  B.rbox(d, len - 1.0, bodyH, 0.15, bm, 0, 0, 0);
  B.box(d - 0.5, len - 1.6, 0.6, bm, 0, 0, bodyH - 0.1);
  // latch: bar on top with the cable slot + two ears gripping the ends
  B.rbox(d + 0.3, len, barH, 0.2, lm, 0, 0, h - barH);
  for (const s of [-1, 1]) {
    B.rbox(d + 0.5, 1.5, earH, 0.2, lm, 0, s * (len / 2 - 0.55), h - earH);
    B.box(d * 0.5, 1.4, 0.3, M.tin, 0, s * (len / 2 + 0.05), 0.02);
  }
  const slotL = (n - 1) * pitch + 2.4, sx = d * 0.12;
  B.box(0.55, slotL, 0.04, M.cavity, sx, 0, h - 0.025);
  for (let i = 0; i < n; i++) B.box(0.16, Math.min(0.45, pitch * 0.45), 0.03, M.tin, sx + 0.2, py(i), h - 0.008);
  // legs
  for (let i = 0; i < n; i++) {
    const s = i % 2 ? 1 : -1;
    B.box(1.0, Math.min(0.36, pitch * 0.36), 0.16, M.tin, s * (d / 2 + 0.45), py(i), 0.04);
    B.box(1.2, Math.min(0.55, pitch * 0.55), 0.06, M.solder, s * (d / 2 + 0.6), py(i), 0);
  }
  return b.place(B.build('fpc'), x, y, rot, side);
}

// ═════════════════════════ microSD holder ═════════════════════════
export function microSD(b, { x = 0, y = 0, rot = 0, side = 'top', card = true } = {}) {
  const f = foot(b, x, y, rot, side), B = new Builder();
  const W = 12, D = 11.5, H = 1.5;
  // footprint
  for (const s of [-1, 1]) for (const fx of [1.5, 9.4]) f.pad(fx, s * 6.35, 1.8, 1.3);
  for (let i = 0; i < 8; i++) f.pad(D + 0.55, (i - 3.5) * 1.1 - 0.3, 1.4, 0.65);
  // steel lid with a finger notch and two windows; walls, feet
  const lid = [[0, -W / 2], [0, -3.2], [1.7, -2.3], [1.7, 2.3], [0, 3.2], [0, W / 2], [D, W / 2], [D, -W / 2]];
  const win = (cx, cy, w, l) => rr(w, l, 0.25, cx, cy, 2);
  zExtrude(B, ring(lid, win(6.4, 3.3, 1.0, 3.4), win(6.4, -3.3, 1.0, 3.4), win(9.6, 0, 0.9, 5.0)), 0.18, M.steel, H - 0.18, 0.05);
  for (const s of [-1, 1]) {
    B.box(D, 0.2, H - 0.1, M.steel, D / 2, s * (W / 2 - 0.1), 0);
    for (const fx of [1.5, 9.4]) smdFoot(B, fx, s * (W / 2 + 0.45), 1.4, 0.8);
    B.rbox(4.6, 0.7, 0.1, 0.04, M.steel, 3.4, s * 4.4, H - 0.04);                 // stiffening ribs
  }
  B.box(0.2, W, H - 0.1, M.steel, D - 0.1, 0, 0);
  B.box(D - 0.4, W - 0.4, 0.3, M.blackMatte, D / 2, 0, 0);                         // plastic base
  for (let i = 0; i < 8; i++) { B.box(1.0, 0.4, 0.14, M.tin, D + 0.45, (i - 3.5) * 1.1 - 0.3, 0.04); B.box(1.2, 0.6, 0.06, M.solder, D + 0.5, (i - 3.5) * 1.1 - 0.3, 0); }
  if (card) {
    const x0 = -3.6;                                                               // outer end of the card
    zExtrude(B, rrShapeAt(15, 11, 0.8, x0 + 7.5, 0), 0.72, CARD, 0.42, 0.08);
    B.rbox(0.9, 9.2, 0.32, 0.12, CARD, x0 + 0.95, 0, 1.08);                        // grip ridge
    B.plane(8.4, 2.6, textMat({ w: 336, h: 104, bg: null, fg: '#b9bdc2', lines: [{ t: 'micro  32GB', size: 50, y: 0.5 }], roughness: 0.6 }), x0 + 2.9, 0, 1.145, 90);
  }
  return b.place(B.build('microSD'), x, y, rot, side);
}
const rrShapeAt = (w, h, r, cx, cy) => poly(rr(w, h, r, cx, cy, 4));

// ═════════════════════════ RF modules on their own little PCB ═════════════════════════
const MODULES = {
  'esp32-wroom': {
    len: 25.5, wid: 18, ant: 6.3, can: { len: 17.6, wid: 15.8, h: 2.3, x0: -6.25 },
    sideN: 14, endN: 10, pitch: 1.27, sideLast: 11.25, pad: 0.9, exposed: false,
    text: ['ESP-WROOM-32', { t: 'WiFi · BT · BLE', size: 0.95 }, { t: 'FCC ID: 2AC7Z-ESPWROOM32', size: 0.62, y: -4.6 }, { t: 'R 211-161007     CE 1313', size: 0.62, y: -6.0 }, { t: 'ESPRESSIF', size: 0.8, y: 6.2, weight: 700 }],
  },
  esp12: {
    len: 24, wid: 16, ant: 6.9, can: { len: 15, wid: 12, h: 2.2, x0: -4.9 },
    sideN: 8, endN: 6, pitch: 2.0, sideLast: 10.5, pad: 1.0, exposed: true,
    text: [{ t: 'ESP8266MOD', size: 1.25 }, { t: 'AI-THINKER', size: 0.9 }, { t: 'ISM 2.4GHz', size: 0.8 }, { t: 'PA +25dBm', size: 0.8 }, { t: '802.11b/g/n', size: 0.8 }, { t: 'FCC ID: 2AHMR-ESP12F', size: 0.55, y: -6.3 }],
  },
};
/** Antenna polyline in module coordinates (antenna end at −x). */
function meander(m) {
  const xa = -m.len / 2 + 0.75, xb = -m.len / 2 + m.ant - (m.exposed ? 2.3 : 2.1), xs = -m.len / 2 + m.ant + 0.2;
  const y0 = -m.wid / 2 + 1.1, steps = m.exposed ? 7 : 8, dy = (m.wid - 2.2) / steps;
  const pts = [[xs, y0], [xa, y0]];
  for (let i = 1; i <= steps; i++) {
    const yy = y0 + i * dy, near = i % 2 === 1;
    pts.push([near ? xa : xb, yy], [near ? xb : xa, yy]);
  }
  return { main: pts, stub: [[xs, y0 + dy], [xb, y0 + dy]] };
}
/**
 * Radio module soldered on the board by castellated edges. Origin = centre of the module, antenna towards local −x.
 * type: 'esp32-wroom' (18 × 25.5) | 'esp12' (16 × 24).  text: override the engraving lines.  led: blue LED on esp12.
 */
export function rfModule(b, { x = 0, y = 0, rot = 0, side = 'top', type = 'esp32-wroom', text, keepout = true, led = true } = {}) {
  const m = MODULES[type] || MODULES['esp32-wroom'];
  const f = foot(b, x, y, rot, side), B = new Builder();
  const { len, wid, can } = m, T = 0.8, G = 0.06, top = G + T;
  const sideX = Array.from({ length: m.sideN }, (_, i) => m.sideLast - (m.sideN - 1 - i) * m.pitch);
  const endY = Array.from({ length: m.endN }, (_, i) => (i - (m.endN - 1) / 2) * m.pitch);
  // footprint on the carrier board
  for (const px of sideX) for (const s of [-1, 1]) f.pad(px, s * (wid / 2 + 0.1), m.pad, 2.0);
  for (const py of endY) f.pad(len / 2 + 0.1, py, 2.0, m.pad);
  if (keepout) f.keepout(-len / 2 + m.ant / 2 - 0.4, 0, m.ant + 0.8, wid + 1.2);
  // module PCB with its painted top
  const mn = meander(m);
  const pcb = mmMat('mod|' + type, len, wid, 40, (g) => {
    const xz = -len / 2 + m.ant;                       // end of the antenna zone
    g.fillStyle = '#191b1e'; g.fillRect(-len / 2, -wid / 2, len, wid);
    g.fillStyle = '#131416'; g.fillRect(-len / 2, -wid / 2, m.ant, wid);       // no copper under the antenna
    // mottled mask
    for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.06)'; g.fillRect((Math.random() - 0.5) * len, (Math.random() - 0.5) * wid, 0.25, 0.25); }
    // antenna trace under the mask (the metal one is real geometry on top of it)
    g.strokeStyle = m.exposed ? '#0d0e0f' : '#272a2e'; g.lineWidth = m.exposed ? 0.95 : 0.6;
    for (const line of [mn.main, mn.stub]) { g.beginPath(); line.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); }
    // ground stitching vias and a few traces around the can
    g.fillStyle = '#2b2e33';
    for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(xz + 0.45, -wid / 2 + 1.2 + i * (wid - 2.4) / 13, 0.16, 0, 7); g.fill(); }
    g.strokeStyle = '#24272b'; g.lineWidth = 0.18;
    for (const s of [-1, 1]) for (const px of sideX) { g.beginPath(); g.moveTo(px, s * (wid / 2 - 0.8)); g.lineTo(px, s * (can.wid / 2 + 0.1)); g.stroke(); }
    // silkscreen: pin-1 dot and a tiny outline tick marks
    g.fillStyle = '#d8d8d2'; g.beginPath(); g.arc(sideX[0] - m.pitch * 0.75, wid / 2 - 0.55, 0.22, 0, 7); g.fill();
  }, { bg: '#191b1e', roughness: 0.45 });
  B.box(len, wid, T - 0.03, MODPCB, 0, 0, G);
  B.plane(len, wid, pcb, 0, 0, top);
  // antenna: exposed gold (ESP-12) or mask-covered copper (WROOM)
  const aw = m.exposed ? 0.6 : 0.5, am = m.exposed ? M.gold : MODTRACE;
  for (const line of [mn.main, mn.stub]) seamTop(B, line, top + 0.035, aw, am);
  // castellated pads: gold top land + gold edge plating with a darker half-hole + solder bead on the carrier pad
  const cast = (cx, cy, alongX, sgn) => {
    const p = m.pad, land = type === 'esp12' ? 1.2 : 0.85;
    if (alongX) {
      B.box(p, land, 0.03, M.gold, cx, cy - sgn * land / 2, top + 0.002);
      B.box(p, 0.06, T, M.gold, cx, cy + sgn * 0.03, G);
      B.box(p * 0.5, 0.06, T, GOLD_DARK, cx, cy + sgn * 0.05, G);
      B.cyl(0.34, p * 0.9, M.solder, cx, cy + sgn * 0.3, 0.14, { axis: 'x', seg: 8 });
    } else {
      B.box(land, p, 0.03, M.gold, cx - sgn * land / 2, cy, top + 0.002);
      B.box(0.06, p, T, M.gold, cx + sgn * 0.03, cy, G);
      B.box(0.06, p * 0.5, T, GOLD_DARK, cx + sgn * 0.05, cy, G);
      B.cyl(0.34, p * 0.9, M.solder, cx + sgn * 0.3, cy, 0.14, { axis: 'y', seg: 8 });
    }
  };
  for (const px of sideX) for (const s of [-1, 1]) cast(px, s * wid / 2, true, s);
  for (const py of endY) cast(len / 2, py, false, 1);
  // shield can with engraving (text reads with the antenna up)
  const cx = can.x0 + can.len / 2;
  B.rbox(can.len, can.wid, can.h, 0.28, M.steelDull, cx, 0, top);
  B.box(can.len + 0.25, can.wid + 0.25, 0.22, STEEL2, cx, 0, top);                  // soldered rim
  B.plane(can.wid - 0.7, can.len - 0.7, canMat(can.wid - 0.7, can.len - 0.7, text ?? m.text, { key: type }), cx, 0, top + can.h + 0.02, 90);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) B.box(1.1, 0.03, 0.3, SEAM, can.x0 + can.len * (i + 0.5) / 4, s * (can.wid / 2 + 0.003), top + 0.22);
  // small parts next to the can
  if (type === 'esp12') {
    const lx = can.x0 - 0.75, ly = -wid / 2 + 2.6;
    if (led) { B.box(0.8, 1.6, 0.3, M.ceramic, lx, ly, top); B.box(0.6, 0.9, 0.22, ledMat('#2f7bff', false), lx, ly, top + 0.3); for (const s of [-1, 1]) B.box(0.82, 0.3, 0.32, M.tin, lx, ly + s * 0.72, top); }
    B.box(0.5, 1.0, 0.35, M.resTop, lx, ly + 2.6, top); for (const s of [-1, 1]) B.box(0.52, 0.22, 0.36, M.tin, lx, ly + 2.6 + s * 0.42, top);
    B.box(0.5, 1.0, 0.5, M.capTan, lx, wid / 2 - 2.4, top); for (const s of [-1, 1]) B.box(0.52, 0.22, 0.51, M.tin, lx, wid / 2 - 2.4 + s * 0.42, top);
  } else {
    B.box(0.5, 1.0, 0.5, M.capTan, can.x0 - 0.2 + can.len + 0.75, 5.2, top);
  }
  return b.place(B.build('rfModule'), x, y, rot, side);
}

// ═════════════════════════ stand-alone RF shield can ═════════════════════════
/** Origin = centre. w along local x, l along local y. text: engraving lines (upright towards local +y). holes: row of small holes along the rim. */
export function shieldCan(b, { x = 0, y = 0, rot = 0, side = 'top', w = 12, l = 10, h = 1.8, text = [], holes = true } = {}) {
  const f = foot(b, x, y, rot, side), B = new Builder();
  // footprint: dashed solder frame
  const nx = Math.max(2, Math.round(w / 2.6)), ny = Math.max(2, Math.round(l / 2.6));
  for (let i = 0; i < nx; i++) for (const s of [-1, 1]) f.pad(-w / 2 + (i + 0.5) * w / nx, s * l / 2, w / nx - 0.7, 0.8);
  for (let i = 0; i < ny; i++) for (const s of [-1, 1]) f.pad(s * w / 2, -l / 2 + (i + 0.5) * l / ny, 0.8, l / ny - 0.7);
  // fence + lid
  B.box(w + 0.1, l + 0.1, Math.min(0.5, h * 0.4), STEEL2, 0, 0, 0.02);
  B.rbox(w, l, h - 0.25, 0.25, M.steelDull, 0, 0, 0.27);
  B.plane(w - 0.6, l - 0.6, canMat(w - 0.6, l - 0.6, text, { dots: holes }), 0, 0, h + 0.045);
  // snap slits of the lid along the sides
  const sh = Math.min(0.35, h * 0.2), hz = 0.27 + (h - 0.25) * 0.42;
  for (let i = 0; i < nx; i++) for (const s of [-1, 1]) B.box(Math.min(1.2, w / nx * 0.5), 0.03, sh, SEAM, -w / 2 + (i + 0.5) * w / nx, s * (l / 2 + 0.003), hz);
  for (let i = 0; i < ny; i++) for (const s of [-1, 1]) B.box(0.03, Math.min(1.2, l / ny * 0.5), sh, SEAM, s * (w / 2 + 0.003), -l / 2 + (i + 0.5) * l / ny, hz);
  return b.place(B.build('shieldCan'), x, y, rot, side);
}

// ═════════════════════════ ceramic chip antenna ═════════════════════════
/** Origin = centre, long axis along local x. keepout: clear the copper around it. */
export function chipAntenna(b, { x = 0, y = 0, rot = 0, side = 'top', len = 3.2, w = 1.6, h = 1.1, keepout = true } = {}) {
  const f = foot(b, x, y, rot, side), B = new Builder();
  if (keepout) f.keepout(0, 0, len + 3.0, w + 3.6);
  for (const s of [-1, 1]) f.pad(s * (len / 2 - 0.15), 0, 0.9, w + 0.3);
  B.rbox(len - 0.5, w, h, 0.1, M.ceramic, 0, 0, 0.06);
  for (const s of [-1, 1]) { B.rbox(0.55, w + 0.05, h + 0.05, 0.1, M.tin, s * (len / 2 - 0.27), 0, 0.04); B.box(0.8, w + 0.3, 0.08, M.solder, s * (len / 2 - 0.15), 0, 0); }
  // printed radiator pattern + feed mark
  const n = Math.max(2, Math.round((len - 1.6) / 0.5));
  for (let i = 0; i < n; i++) B.box(0.14, w * 0.62, 0.02, STEEL2, -((n - 1) / 2 - i) * 0.5, (i % 2 ? 1 : -1) * w * 0.08, h + 0.05);
  B.box(0.3, 0.3, 0.02, colorMat('#b5392c', 0.5), -len / 2 + 0.85, w / 2 - 0.3, h + 0.05);
  return b.place(B.build('chipAntenna'), x, y, rot, side);
}

// ═════════════════════════ miniature side-actuated slide switch (MSK-12C02 style) ═════════════════════════
/** Origin = centre, body 6.7 (local x) × 2.7 (local y) × 1.4; the lever sticks out towards local −y. pos: 0 | 1 = lever position. */
export function slideSwitch(b, { x = 0, y = 0, rot = 0, side = 'top', pos = 0 } = {}) {
  const f = foot(b, x, y, rot, side), B = new Builder();
  const pinsX = [-2.25, 0.75, 2.25];
  for (const px of pinsX) f.pad(px, 1.95, 0.7, 1.5);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) f.pad(sx * 3.7, sy * 0.85, 1.0, 0.9);
  B.box(6.5, 2.5, 0.25, M.black, 0, 0, 0);
  B.rbox(6.7, 2.7, 1.2, 0.12, M.steel, 0, 0, 0.2);
  B.box(4.4, 0.06, 0.7, M.cavity, 0, -1.33, 0.45);
  B.rbox(1.3, 1.9, 0.62, 0.12, M.black, pos ? 0.75 : -0.75, -1.35 - 0.6, 0.49);
  for (const px of pinsX) { B.box(0.45, 1.0, 0.16, M.tin, px, 1.75, 0.04); B.box(0.6, 1.2, 0.06, M.solder, px, 1.9, 0); }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) { B.box(0.5, 0.6, 0.5, M.steel, sx * 3.5, sy * 0.85, 0.05); B.box(0.9, 0.8, 0.06, M.solder, sx * 3.65, sy * 0.85, 0); }
  for (const s of [-1, 1]) B.cyl(0.28, 0.03, SEAM, s * 2.3, 0.35, 1.4 - 0.02, { seg: 14 });
  seamTop(B, [[-1.2, 0.35], [1.2, 0.35]], 1.4 + 0.004, 0.07);
  return b.place(B.build('slideSwitch'), x, y, rot, side);
}

// ═════════════════════════ JST-PH side-entry header (2 mm pitch) ═════════════════════════
export function jstPH(b, { x = 0, y = 0, rot = 0, side = 'top', n = 2 } = {}) {
  const f = foot(b, x, y, rot, side), B = new Builder();
  const W = 2 * (n - 1) + 5.9, D = 6.0, H = 4.8, oh = H - 1.75, hc = 0.75 + oh / 2;
  const py = (i) => (i - (n - 1) / 2) * 2;
  const DARK = colorMat('#bdb8a6', 0.7);
  for (let i = 0; i < n; i++) f.pad(D + 1.0, py(i), 2.6, 1.0);
  for (const s of [-1, 1]) f.pad(3.3, s * (W / 2 + 0.8), 3.4, 1.6);
  const outer = rr(W, H, 0.3, 0, H / 2, 2), open = rr(W - 1.3, oh, 0.15, 0, hc, 1);
  xExtrude(B, ring(outer, open), D, CREAM, 0, { bevel: 0.1 });
  xExtrude(B, poly(inset(open, -0.03)), 0.06, DARK, D - 1.2);
  B.box(0.6, W - 0.4, H - 0.4, CREAM, D - 0.4, 0, 0.2);
  // key slots in the top wall + friction-lock windows
  for (const s of [-1, 1]) {
    B.box(3.0, 0.8, 0.04, DARK, 1.5, s * (W / 2 - 1.5), H - 0.02);
    B.box(1.2, 0.03, 1.0, DARK, 1.6, s * (W / 2 + 0.003), 2.4);
  }
  // pins
  for (let i = 0; i < n; i++) {
    B.box(4.0, 0.5, 0.5, M.tin, D - 1.2 - 2.0, py(i), hc - 0.25);
    B.box(2.0, 0.6, 0.2, M.tin, D + 0.9, py(i), 0.05); B.box(0.3, 0.6, hc, M.tin, D + 0.05, py(i), 0.05);
    B.box(2.3, 0.9, 0.07, M.solder, D + 1.0, py(i), 0);
  }
  // side solder tabs
  for (const s of [-1, 1]) {
    B.box(2.8, 0.25, 2.2, M.tin, 3.3, s * (W / 2 + 0.12), 0.05);
    smdFoot(B, 3.3, s * (W / 2 + 0.7), 2.8, 1.0, M.tin);
  }
  return b.place(B.build('jstPH'), x, y, rot, side);
}
