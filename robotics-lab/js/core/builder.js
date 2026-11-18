// Geometry builder + shared materials.
// All authoring coordinates are "board-like": x → right, y → up (top view), h → height above the board.
// Internally mapped to THREE: (x, h, -y). Units: millimetres.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DEG = Math.PI / 180;
const _m = new THREE.Matrix4();
const KEEP = ['position', 'normal', 'uv'];

export class Builder {
  constructor() { this.byMat = new Map(); this.extras = []; }

  /** Add a raw THREE geometry (authored Y-up) at board-like position (x, y, h), rotated rz degrees CCW (top view). */
  geo(geometry, mat, x = 0, y = 0, h = 0, rz = 0) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry;
    for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (rz) g.applyMatrix4(_m.makeRotationY(rz * DEG));
    g.applyMatrix4(_m.makeTranslation(x, h, -y));
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(g);
    return this;
  }
  /** Box sx (along x) × sy (along y) × sh (height); (x, y) = centre, h0 = height of its bottom face. */
  box(sx, sy, sh, mat, x = 0, y = 0, h0 = 0, rz = 0) {
    return this.geo(new THREE.BoxGeometry(sx, sh, sy), mat, x, y, h0 + sh / 2, rz);
  }
  /** Box with rounded edges of radius r — use for anything that should catch highlights. */
  rbox(sx, sy, sh, r, mat, x = 0, y = 0, h0 = 0, rz = 0) {
    r = Math.min(r, sx / 2 - 1e-3, sy / 2 - 1e-3, sh / 2 - 1e-3);
    return this.geo(new RoundedBoxGeometry(sx, sh, sy, 3, r), mat, x, y, h0 + sh / 2, rz);
  }
  /** Cylinder. axis 'z' = vertical: (x, y) centre, h0 = bottom. axis 'x' | 'y' = horizontal: (x, y, h0) is the CENTRE, sh = length. */
  cyl(r, sh, mat, x = 0, y = 0, h0 = 0, { seg = 28, rTop, axis = 'z', open = false } = {}) {
    const g = new THREE.CylinderGeometry(rTop ?? r, r, sh, seg, 1, open);
    if (axis === 'x') { g.rotateZ(Math.PI / 2); return this.geo(g, mat, x, y, h0); }
    if (axis === 'y') { g.rotateX(Math.PI / 2); return this.geo(g, mat, x, y, h0); }
    return this.geo(g, mat, x, y, h0 + sh / 2);
  }
  /** Horizontal plane facing up at height h (texture upright towards +y). */
  plane(sx, sy, mat, x = 0, y = 0, h = 0, rz = 0) {
    const g = new THREE.PlaneGeometry(sx, sy); g.rotateX(-Math.PI / 2);
    return this.geo(g, mat, x, y, h, rz);
  }
  /** Vertical plane sx wide × sh tall centred at (x, y, h), facing direction `facing` degrees (0 = +x, 90 = +y, 180 = −x, 270 = −y). */
  vplane(sx, sh, mat, x = 0, y = 0, h = 0, facing = 0) {
    const g = new THREE.PlaneGeometry(sx, sh);
    return this.geo(g, mat, x, y, h, facing + 90);
  }
  /** Extrude a THREE.Shape drawn in board (x, y) upwards by sh starting at height h0. opts.bevel = bevel size (mm). */
  extrude(shape, sh, mat, x = 0, y = 0, h0 = 0, rz = 0, { bevel = 0, seg = 16 } = {}) {
    const g = new THREE.ExtrudeGeometry(shape, bevel
      ? { depth: sh - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: seg }
      : { depth: sh, bevelEnabled: false, curveSegments: seg });
    if (bevel) g.translate(0, 0, bevel);
    g.rotateX(-Math.PI / 2);
    return this.geo(g, mat, x, y, h0, rz);
  }
  /** Solid of revolution around the vertical axis. pts = [[radius, height], ...] from bottom to top. */
  lathe(pts, mat, x = 0, y = 0, h0 = 0, seg = 24) {
    const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(Math.max(p[0], 1e-4), p[1])), seg);
    return this.geo(g, mat, x, y, h0);
  }
  /** Sphere (or squashed sphere) centred at (x, y, h). */
  sphere(r, mat, x = 0, y = 0, h = 0, { sy = 1, seg = 20 } = {}) {
    const g = new THREE.SphereGeometry(r, seg, Math.max(8, seg >> 1)); if (sy !== 1) g.scale(1, sy, 1);
    return this.geo(g, mat, x, y, h);
  }
  /** Attach an arbitrary Object3D (authored in THREE coords, Y up) — e.g. a Sprite. */
  add(obj) { this.extras.push(obj); return this; }

  /** Merge everything per material and return a THREE.Group. */
  build(name = 'part') {
    const grp = new THREE.Group(); grp.name = name;
    for (const [mat, list] of this.byMat) {
      const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (list.length > 1) list.forEach(x => x.dispose());
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = !mat.userData.noShadow; mesh.receiveShadow = true;
      grp.add(mesh);
    }
    this.extras.forEach(o => grp.add(o));
    return grp;
  }
}

/** Rounded-rectangle THREE.Shape centred on the origin. */
export function rrShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return s;
}

// ───────────────────────── materials ─────────────────────────
const S = (o) => new THREE.MeshStandardMaterial(o);
export const M = {
  // IC / component bodies
  epoxy: S({ color: 0x1a1b1d, roughness: 0.58 }),           // moulded IC package
  epoxyGloss: S({ color: 0x141516, roughness: 0.35 }),
  ceramic: S({ color: 0xe6e2d8, roughness: 0.7 }),          // resistor substrate, white ceramic
  capTan: S({ color: 0xb49a76, roughness: 0.55 }),          // MLCC body
  capBrown: S({ color: 0x8a6a4a, roughness: 0.55 }),
  resTop: S({ color: 0x131313, roughness: 0.5 }),           // resistor top coat
  tantalum: S({ color: 0xd8a11e, roughness: 0.5 }),
  ferrite: S({ color: 0x3b3d40, roughness: 0.75 }),         // inductors
  // metals
  tin: S({ color: 0xd3d5d5, roughness: 0.3, metalness: 1 }),     // IC leads, pads
  solder: S({ color: 0xdadddd, roughness: 0.18, metalness: 1 }), // solder fillets
  gold: S({ color: 0xe2b757, roughness: 0.26, metalness: 1 }),   // pins, contacts
  steel: S({ color: 0xc6c9cc, roughness: 0.24, metalness: 1 }),  // connector shells, crystal cans
  steelDull: S({ color: 0xaeb1b4, roughness: 0.42, metalness: 1 }), // RF shields
  alu: S({ color: 0xe1e3e4, roughness: 0.33, metalness: 1 }),    // electrolytic cans
  copper: S({ color: 0xc77b45, roughness: 0.35, metalness: 1 }),
  // plastics
  black: S({ color: 0x0f1011, roughness: 0.4 }),            // glossy connector plastic / headers
  blackMatte: S({ color: 0x171819, roughness: 0.8 }),
  cavity: S({ color: 0x040404, roughness: 0.95 }),          // inside of connector openings
  white: S({ color: 0xedebe5, roughness: 0.5 }),
  beige: S({ color: 0xd9cfb8, roughness: 0.55 }),
  grey: S({ color: 0x8b8e91, roughness: 0.6 }),
  blue: S({ color: 0x1565c8, roughness: 0.45 }),            // USB 3 tongue
  yellow: S({ color: 0xf0c21a, roughness: 0.45 }),          // jumpers
  red: S({ color: 0xc8261c, roughness: 0.45 }),
  green: S({ color: 0x1f8f46, roughness: 0.45 }),
  brown: S({ color: 0x4a3626, roughness: 0.6 }),            // FPC latch
};
M.cavity.userData.noShadow = false;
// The studio environment is dimmed for diffuse surfaces (environmentIntensity 0.5); boost metal reflectance so metal still reads as bright metal.
for (const k of ['tin', 'solder', 'gold', 'steel', 'steelDull', 'alu', 'copper']) M[k].color.multiplyScalar(k === 'steelDull' ? 1.45 : 1.75);

const _cache = new Map();
/** LED lens material. on=true → glows. Cached. */
export function ledMat(color = '#ff3b30', on = false) {
  const k = 'led|' + color + on;
  if (!_cache.has(k)) {
    const c = new THREE.Color(color);
    _cache.set(k, new THREE.MeshStandardMaterial({
      color: on ? c : c.clone().lerp(new THREE.Color('#f4f1e6'), 0.55), roughness: 0.25,
      emissive: c, emissiveIntensity: on ? 2.2 : 0.0, transparent: true, opacity: on ? 0.96 : 0.9,
    }));
  }
  return _cache.get(k);
}
/** Any flat-colour standard material, cached by parameters. */
export function colorMat(color, roughness = 0.5, metalness = 0) {
  const k = `c|${color}|${roughness}|${metalness}`;
  if (!_cache.has(k)) _cache.set(k, S({ color: new THREE.Color(color), roughness, metalness }));
  return _cache.get(k);
}

/**
 * Canvas texture with text lines / custom drawing. Cached by key.
 * opts: { w, h (px), bg (css | null = transparent), fg, lines: [str | {t, size, y, x, align, weight, color}], font, draw(ctx, w, h) }
 */
export function textTex(opts) {
  const { w = 256, h = 256, bg = '#1a1b1d', fg = '#9a9da0', lines = [], font = '"Arial Narrow", "Roboto Condensed", Arial, sans-serif', draw } = opts;
  const key = 'tx|' + JSON.stringify([w, h, bg, fg, lines, font]) + (draw ? draw.toString() : '');
  if (_cache.has(key)) return _cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  if (draw) draw(g, w, h);
  const n = lines.length; let autoY = 0;
  lines.forEach((ln, i) => {
    const o = typeof ln === 'string' ? { t: ln } : ln;
    const size = o.size ?? Math.min(h / (n + 0.6), w / 5.2);
    g.font = `${o.weight ?? 600} ${size}px ${font}`;
    g.fillStyle = o.color ?? fg; g.textAlign = o.align ?? 'center'; g.textBaseline = 'middle';
    const y = o.y != null ? o.y * h : (h * (i + 0.5 + (0.3)) / (n + 0.6)); autoY = y;
    const x = o.x != null ? o.x * w : (g.textAlign === 'center' ? w / 2 : g.textAlign === 'left' ? w * 0.08 : w * 0.92);
    let tw = g.measureText(o.t).width, maxW = w * 0.9;
    if (tw > maxW) { g.save(); g.translate(x, y); g.scale(maxW / tw, 1); g.fillText(o.t, 0, 0); g.restore(); }
    else g.fillText(o.t, x, y);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  _cache.set(key, t); return t;
}
/** Material with a text texture. opts as textTex + { roughness, metalness, transparent }. Cached. */
export function textMat(opts) {
  const key = 'tm|' + JSON.stringify([opts.w, opts.h, opts.bg, opts.fg, opts.lines, opts.font, opts.roughness, opts.metalness]) + (opts.draw ? opts.draw.toString() : '');
  if (_cache.has(key)) return _cache.get(key);
  const transparent = opts.bg === null;
  const m = new THREE.MeshStandardMaterial({
    map: textTex(opts), roughness: opts.roughness ?? 0.6, metalness: opts.metalness ?? 0,
    transparent, alphaTest: transparent ? 0.04 : 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  if (transparent) m.userData.noShadow = true;
  _cache.set(key, m); return m;
}

/** Soft additive glow sprite (for lit LEDs). size in mm. Position it yourself: sprite.position.set(x, h, -y). */
export function glowSprite(color = '#ff3b30', size = 4) {
  const k = 'glow|' + color;
  if (!_cache.has(k)) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.18, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    _cache.set(k, new THREE.SpriteMaterial({ map: t, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
  }
  const s = new THREE.Sprite(_cache.get(k)); s.scale.set(size, size, 1); s.userData.glow = true; return s;
}
