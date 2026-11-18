// Board: a printed circuit board with procedurally painted copper / solder-mask / silkscreen textures,
// plus placement of 3D parts, pickable part tags and hoverable pins.
// Board coordinates: origin = bottom-left corner in top view, x → right, y → up, millimetres.
import * as THREE from 'three';
import { DEG } from './builder.js';

export const THEMES = {
  teal:  { pour: '#0d7d8a', base: '#085863', trace: '#1391a0', silk: '#f3f3ec', edge: '#9fae9a' },
  blue:  { pour: '#1a52ad', base: '#113a84', trace: '#2565c4', silk: '#f3f3ec', edge: '#9aa6b5' },
  navy:  { pour: '#14306b', base: '#0c204d', trace: '#1c3f86', silk: '#f3f3ec', edge: '#8f98a8' },
  green: { pour: '#1d8a43', base: '#11652e', trace: '#27a052', silk: '#f3f3ec', edge: '#b4ad84' },
  black: { pour: '#23262a', base: '#0f1113', trace: '#2e3237', silk: '#eeeeea', edge: '#6b675a' },
  red:   { pour: '#b0261f', base: '#7f1712', trace: '#c8352c', silk: '#f3f3ec', edge: '#b7a78c' },
};
const FINISH = { gold: ['#dcb65e', 150, 0.3], tin: ['#cdd0d1', 150, 0.27] };
const tri = (color, bump, rough, metal) => [color, `rgb(${bump},${bump},${bump})`, `rgb(0,${Math.round(rough * 255)},${Math.round(metal * 255)})`];

const mkLayer = () => ({ keep: [], traces: [], vias: [], pads: [], holes: [], silk: [] });

export class Board {
  /**
   * @param {object} o
   *  w, h      board size (mm);  t thickness (1.6);  r corner radius
   *  outline   optional [[x,y],...] polygon (board coords) instead of the rounded rectangle
   *  holes     [{x, y, d, ring}] real mounting holes (ring = outer diameter of plated ring, optional)
   *  theme     key of THEMES or a theme object;  finish 'gold' | 'tin' (pad plating)
   *  quality   1 = full textures, 0.5 = thumbnails
   */
  constructor(o) {
    const { finish = 'gold', ...rest } = o;
    Object.assign(this, { t: 1.6, r: 0, holes: [], quality: 1 }, rest);
    this.plating = finish;
    this.theme = typeof o.theme === 'object' ? o.theme : THEMES[o.theme || 'green'];
    this.layers = { top: mkLayer(), bottom: mkLayer() };
    this.root = new THREE.Group(); this.root.name = 'board';
    this.parts = {}; this.pins = [];
    for (const hl of this.holes) {
      if (hl.ring) for (const s of ['top', 'bottom']) this.layers[s].pads.push({ x: hl.x, y: hl.y, w: hl.ring, h: hl.ring, rot: 0, shape: 'round', fin: this.plating });
    }
  }

  // ───────── copper / mask / silk painting (all coordinates in board mm) ─────────
  /** SMD pad (exposed metal). shape: 'rect' | 'round' | 'oval'. */
  pad(x, y, w, h, { rot = 0, side = 'top', shape = 'rect', finish } = {}) {
    this.layers[side].pads.push({ x, y, w, h, rot, shape, fin: finish || this.plating }); return this;
  }
  /** Plated through-hole (ring on both sides + drilled hole). */
  th(x, y, { d = 1.75, hole = 0.95, square = false, finish } = {}) {
    for (const s of ['top', 'bottom']) {
      this.layers[s].pads.push({ x, y, w: d, h: d, rot: 0, shape: square ? 'rect' : 'round', fin: finish || this.plating });
      this.layers[s].holes.push({ x, y, d: hole });
    }
    return this;
  }
  /** Unplated drilled hole painted on the texture (no real geometry hole). */
  drill(x, y, d, side) { for (const s of side ? [side] : ['top', 'bottom']) this.layers[s].holes.push({ x, y, d }); return this; }
  /** Via (small plated hole, tented). */
  via(x, y, { side, d = 0.6 } = {}) { for (const s of side ? [side] : ['top', 'bottom']) this.layers[s].vias.push({ x, y, d }); return this; }
  /** Copper trace through points [[x,y],...]. */
  trace(pts, { w = 0.25, side = 'top' } = {}) { this.layers[side].traces.push({ pts, w }); return this; }
  /** Auto-routed trace a→b using 45° bends. bias 0..1 = where the diagonal sits; via: add a via at the end. */
  route(a, b, { w = 0.25, side = 'top', bias = 0.5, via = false } = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1], ax = Math.abs(dx), ay = Math.abs(dy), sx = Math.sign(dx), sy = Math.sign(dy);
    const pts = [a];
    if (ax > ay) { const st = (ax - ay) * bias; pts.push([a[0] + sx * st, a[1]], [a[0] + sx * (st + ay), b[1]]); }
    else { const st = (ay - ax) * bias; pts.push([a[0], a[1] + sy * st], [b[0], a[1] + sy * (st + ax)]); }
    pts.push(b);
    this.trace(pts, { w, side });
    if (via) this.via(b[0], b[1]);
    return this;
  }
  /** Route many pairs: listA[i] → listB[i]. */
  bus(listA, listB, opts = {}) { listA.forEach((a, i) => listB[i] && this.route(a, listB[i], { ...opts, bias: opts.bias ?? (0.25 + 0.5 * i / Math.max(1, listA.length - 1)) })); return this; }
  /** Area without copper pour (darker mask), e.g. under antennas. */
  keepout(x, y, w, h, { side = 'top', rot = 0 } = {}) { this.layers[side].keep.push({ x, y, w, h, rot }); return this; }
  /** Silkscreen text centred at (x, y). size = cap height in mm. rot degrees CCW. */
  text(str, x, y, { size = 1, rot = 0, side = 'top', align = 'center', weight = 600, font, color } = {}) {
    this.layers[side].silk.push({ k: 'text', str: String(str), x, y, size, rot, align, weight, font, color }); return this;
  }
  /** Silkscreen polyline. */
  line(pts, { w = 0.15, side = 'top', color, closed = false } = {}) { this.layers[side].silk.push({ k: 'line', pts, w, color, closed }); return this; }
  /** Silkscreen rectangle outline (or filled) centred at (x, y). */
  rect(x, y, w, h, { rot = 0, lw = 0.15, side = 'top', fill = false, color, r = 0 } = {}) { this.layers[side].silk.push({ k: 'rect', x, y, w, h, rot, lw, fill, color, r }); return this; }
  /** Silkscreen circle. */
  circle(x, y, r, { lw = 0.15, side = 'top', fill = false, color } = {}) { this.layers[side].silk.push({ k: 'circle', x, y, r, lw, fill, color }); return this; }

  // ───────── parts ─────────
  /** Transform from a part's local footprint coords (lx right, ly up) to board coords. */
  local(x, y, rot = 0, side = 'top') {
    const c = Math.cos(rot * DEG), s = Math.sin(rot * DEG), f = side === 'bottom' ? -1 : 1;
    return (lx, ly) => [x + lx * c - f * ly * s, y + lx * s + f * ly * c];
  }
  /** Put a built part (THREE.Group from Builder.build()) on the board. Returns the placed wrapper group. */
  place(obj, x, y, rot = 0, side = 'top') {
    const g = new THREE.Group();
    g.position.set(x - this.w / 2, side === 'bottom' ? -this.t : 0, -(y - this.h / 2));
    g.rotation.y = rot * DEG;
    if (side === 'bottom') obj.rotation.x = Math.PI;
    g.add(obj); g.name = obj.name; g.userData.place = { x, y, rot, side };
    this.root.add(g); return g;
  }
  /** Make a placed part pickable under a part id (several objects may share one id). */
  tag(obj, id) { obj.userData.partId = id; (this.parts[id] ||= { id, objects: [] }).objects.push(obj); return obj; }
  /** Register a hoverable pin (shown in the tooltip). kind: 'pwr' | 'gnd' | 'dig' | 'ana' | 'com' | 'ctl' | 'nc'. */
  pin(x, y, name, fn = '', kind = 'dig') { this.pins.push({ x, y, name, fn, kind }); return this; }

  // ───────── build ─────────
  _shape() {
    const { w, h, r } = this, s = new THREE.Shape();
    if (this.outline) {
      this.outline.forEach((p, i) => i ? s.lineTo(p[0] - w / 2, p[1] - h / 2) : s.moveTo(p[0] - w / 2, p[1] - h / 2));
      s.closePath();
    } else {
      const x = -w / 2, y = -h / 2, q = Math.max(r, 0.01);
      s.moveTo(x + q, y); s.lineTo(x + w - q, y); s.absarc(x + w - q, y + q, q, -Math.PI / 2, 0);
      s.lineTo(x + w, y + h - q); s.absarc(x + w - q, y + h - q, q, 0, Math.PI / 2);
      s.lineTo(x + q, y + h); s.absarc(x + q, y + h - q, q, Math.PI / 2, Math.PI);
      s.lineTo(x, y + q); s.absarc(x + q, y + q, q, Math.PI, Math.PI * 1.5);
    }
    for (const hl of this.holes) { const p = new THREE.Path(); p.absarc(hl.x - w / 2, hl.y - h / 2, hl.d / 2, 0, Math.PI * 2, true); s.holes.push(p); }
    return s;
  }

  _paint(side) {
    const L = this.layers[side], th = this.theme, q = this.quality, bottom = side === 'bottom';
    const big = Math.max(this.w, this.h);
    const s = Math.min((bottom ? 24 : 40) * q, (bottom ? 2048 : 3584) * q / big);
    const W = Math.ceil(this.w * s), H = Math.ceil(this.h * s);
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(2, w); c.height = Math.max(2, h); return c; };
    const cv = [mk(W, H), mk(W >> 1, H >> 1), mk(W >> 1, H >> 1)];
    const cx = cv.map((c) => { const g = c.getContext('2d'); const k = c.width / this.w; g.setTransform(k, 0, 0, -k, 0, c.height); g.lineJoin = 'round'; g.lineCap = 'round'; return g; });
    const each = (st, fn) => cx.forEach((g, i) => { g.fillStyle = g.strokeStyle = st[i]; fn(g, i); });
    const POUR = tri(th.pour, 112, 0.36, 0), BASE = tri(th.base, 88, 0.4, 0), TRACE = tri(th.trace, 128, 0.34, 0),
      HOLE = tri('#0d0906', 0, 0.9, 0), SILK = tri(th.silk, 152, 0.78, 0), OPEN = tri(th.base, 70, 0.5, 0);

    each(POUR, g => g.fillRect(0, 0, this.w, this.h));
    // mottled solder mask
    { const n = mk(96, 96), ng = n.getContext('2d'); const id = ng.createImageData(96, 96);
      for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 16; }
      ng.putImageData(id, 0, 0); const g = cx[0]; g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      if (g.createPattern) { g.fillStyle = g.createPattern(n, 'repeat'); g.fillRect(0, 0, W, H); } g.restore(); }
    for (const k of L.keep) each(BASE, g => { g.save(); g.translate(k.x, k.y); g.rotate(k.rot * DEG); g.fillRect(-k.w / 2, -k.h / 2, k.w, k.h); g.restore(); });
    const stroke = (g, pts, w) => { g.lineWidth = w; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); };
    for (const t of L.traces) each(BASE, g => stroke(g, t.pts, t.w + 0.44));
    for (const v of L.vias) each(BASE, g => { g.beginPath(); g.arc(v.x, v.y, v.d / 2 + 0.2, 0, 7); g.fill(); });
    for (const t of L.traces) each(TRACE, g => stroke(g, t.pts, t.w));
    for (const v of L.vias) { each(TRACE, g => { g.beginPath(); g.arc(v.x, v.y, v.d / 2, 0, 7); g.fill(); }); each(BASE, g => { g.beginPath(); g.arc(v.x, v.y, v.d * 0.22, 0, 7); g.fill(); }); }
    const padPath = (g, p, grow) => {
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot * DEG); g.beginPath();
      const w = p.w + grow, h = p.h + grow;
      if (p.shape === 'round') g.arc(0, 0, w / 2, 0, 7);
      else if (p.shape === 'oval') { const r = Math.min(w, h) / 2; if (g.roundRect) g.roundRect(-w / 2, -h / 2, w, h, r); else g.rect(-w / 2, -h / 2, w, h); }
      else { const r = Math.min(w, h) * 0.12; if (g.roundRect) g.roundRect(-w / 2, -h / 2, w, h, r); else g.rect(-w / 2, -h / 2, w, h); }
      g.fill(); g.restore();
    };
    for (const p of L.pads) each(OPEN, g => padPath(g, p, 0.16));
    for (const p of L.pads) { const f = FINISH[p.fin] || FINISH.gold; each(tri(f[0], f[1], f[2], 1), g => padPath(g, p, 0)); }
    // subtle sheen variation on pads (colour only)
    for (const hl of L.holes) each(HOLE, g => { g.beginPath(); g.arc(hl.x, hl.y, hl.d / 2, 0, 7); g.fill(); });
    for (const o of L.silk) {
      const st = o.color ? tri(o.color, 152, 0.78, 0) : SILK;
      each(st, g => {
        g.save();
        if (o.k === 'text') {
          g.translate(o.x, o.y); g.rotate(o.rot * DEG); g.scale(bottom ? -1 / 16 : 1 / 16, -1 / 16);
          g.font = `${o.weight} ${o.size * 16 * 1.38}px ${o.font || '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif'}`;
          g.textAlign = o.align; g.textBaseline = 'middle'; g.fillText(o.str, 0, o.size * 16 * 0.06);
        } else if (o.k === 'line') {
          g.lineWidth = o.w; g.beginPath(); o.pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); if (o.closed) g.closePath(); g.stroke();
        } else if (o.k === 'rect') {
          g.translate(o.x, o.y); g.rotate(o.rot * DEG); g.lineWidth = o.lw; g.beginPath();
          if (o.r && g.roundRect) g.roundRect(-o.w / 2, -o.h / 2, o.w, o.h, o.r); else g.rect(-o.w / 2, -o.h / 2, o.w, o.h);
          o.fill ? g.fill() : g.stroke();
        } else if (o.k === 'circle') {
          g.lineWidth = o.lw; g.beginPath(); g.arc(o.x, o.y, o.r, 0, 7); o.fill ? g.fill() : g.stroke();
        }
        g.restore();
      });
    }
    const tex = cv.map((c, i) => { const t = new THREE.CanvasTexture(c); if (!i) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16; return t; });
    return new THREE.MeshPhysicalMaterial({
      map: tex[0], bumpMap: tex[1], bumpScale: 2.2, roughnessMap: tex[2], metalnessMap: tex[2], roughness: 1, metalness: 1,
      clearcoat: 0.25, clearcoatRoughness: 0.35, side: bottom ? THREE.BackSide : THREE.FrontSide,
    });
  }

  /** Paint textures, build the PCB mesh, compute part bounds. Call once, last. */
  finish() {
    const { w, h, t } = this, shape = this._shape();
    const face = new THREE.ShapeGeometry(shape, 24); face.rotateX(-Math.PI / 2);
    const pos = face.attributes.position, uv = face.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (-pos.getZ(i) + h / 2) / h);
    face.computeVertexNormals();
    const top = new THREE.Mesh(face, this._paint('top')); top.receiveShadow = true; top.name = 'pcb-top';
    const bot = new THREE.Mesh(face, this._paint('bottom')); bot.position.y = -t; bot.receiveShadow = true; bot.name = 'pcb-bottom';
    const body = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 24 });
    body.rotateX(-Math.PI / 2); body.translate(0, -t, 0);
    const edgeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.theme.edge).lerp(new THREE.Color(this.theme.pour), 0.45), roughness: 0.6 });
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    const edge = new THREE.Mesh(body, [hidden, edgeMat]); edge.castShadow = true; edge.receiveShadow = true; edge.name = 'pcb-edge';
    const pcb = new THREE.Group(); pcb.name = 'pcb'; pcb.userData.isPCB = true; pcb.add(top, bot, edge);
    this.root.add(pcb);
    this.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    for (const p of Object.values(this.parts)) {
      const bx = new THREE.Box3();
      for (const o of p.objects) bx.union(new THREE.Box3().setFromObject(o));
      p.box = bx.applyMatrix4(inv); p.center = bx.getCenter(new THREE.Vector3());
    }
    const root = this.root;
    return {
      group: root, parts: this.parts, pins: this.pins, w, h, t,
      dispose() {
        root.traverse(o => {
          if (o.isMesh) { o.geometry.dispose(); }
        });
        for (const m of [top.material, bot.material]) { m.map.dispose(); m.bumpMap.dispose(); m.roughnessMap.dispose(); m.dispose(); }
        edgeMat.dispose();
      },
    };
  }
}
