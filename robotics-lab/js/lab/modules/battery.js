// Lab module: 4 × AA battery holder (6 V) — black tray, four cells in series, red / black leads soldered to a tiny terminal board.
// Tray, cells and leads are authored in "bench" coordinates (h = 0 → bench); only the terminal board is a real PCB.
import * as THREE from 'three';
import { Board } from '../../core/board.js';
import { Builder, M, colorMat, textMat } from '../../core/builder.js';

const W = 83, H = 64, T = 1.2;            // module footprint, terminal PCB thickness (bench = −T)
const TX = 30, TY = 32;                   // tray centre (board coords)
const TL = 58, TW = 62, WALL = 1.6;       // tray length (along the cells, x) × width (y), wall thickness
const PITCH = 14.7, CR = 7.25, CL = 50.5; // cell pitch, radius, overall length
const HC = WALL + 0.15 + CR;              // height of the cell axes
const XI = TL / 2 - WALL;                 // inner face of the end walls (|x|)
const TIP = XI - 0.9;                     // where the "+" nub sits (after the contact dimple)
const PADX = 72.5, PADY = [27.5, 36.5], HOLE_X = 74.5;
const BODY = '#1b3f9a', BAND = '#c79a3c';

function rrPoly(x0, y0, x1, y1, r, n = 5) {
  const pts = [], arc = (cx, cy, a0) => { for (let i = 0; i <= n; i++) { const a = (a0 + 90 * i / n) * Math.PI / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  arc(x1 - r, y0 + r, -90); arc(x1 - r, y1 - r, 0); arc(x0 + r, y1 - r, 90); arc(x0 + r, y0 + r, 180);
  return pts;
}

/** Printed shrink wrap of an AA cell. Canvas x runs around the cell, canvas y from the "+" end (top) to the "−" end. */
function wrapMat() {
  return textMat({
    w: 1024, h: 1024, bg: BODY, fg: '#ffffff', lines: [], roughness: 0.3, metalness: 0.25,
    draw: (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#2a55c0'); grad.addColorStop(1, '#14307c');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c79a3c'; g.fillRect(0, 0, w, 196);                    // gold band at the positive end
      g.fillStyle = '#f1efe6'; g.fillRect(0, 196, w, 12);
      g.fillStyle = '#0c1f55'; g.fillRect(0, h - 40, w, 40);
      g.fillStyle = '#f1efe6'; g.fillRect(0, h - 52, w, 8);
      for (const u of [0.8333, 0.3333]) {                                      // the same print on two opposite sides
        g.save(); g.translate(u * w, 600); g.rotate(-Math.PI / 2);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#ffffff'; g.font = '800 132px Arial, Helvetica, sans-serif';
        g.fillText('AA 1.5V', -10, -34);
        g.font = '600 42px Arial, Helvetica, sans-serif'; g.fillStyle = '#dbe4ff';
        g.fillText('ALKALINE BATTERY  ·  LR6', -10, 62);
        g.fillStyle = '#ffffff'; g.fillRect(-388, -46, 78, 20);              // "−"
        g.fillStyle = '#2c1f06'; g.fillRect(452, -44, 108, 22); g.fillRect(495, -87, 22, 108);   // "+" on the gold band
        g.restore();
      }
    },
  });
}

/** Solid of revolution about the x axis: pts = [[r, x], …] running from −x to +x. */
function latheX(B, pts, mat, cx, cy, hc, rz, seg = 40) {
  const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(Math.max(p[0], 1e-4), p[1])), seg);
  g.rotateZ(-Math.PI / 2);
  return B.geo(g, mat, cx, cy, hc, rz);
}

/** One AA cell lying along x. plusRight: "+" nub towards +x, otherwise turned round (print rolled so it still faces the viewer). */
function addCell(B, cy, plusRight) {
  const rz = plusRight ? 0 : 180, cx = (plusRight ? 1 : -1) * (TIP - CL / 2), steel = colorMat('#c9ccd0', 0.26, 1);
  const g = new THREE.CylinderGeometry(CR, CR, 46.6, 56, 1, true);
  g.rotateY(plusRight ? 0 : (-60 * Math.PI) / 180); g.rotateZ(-Math.PI / 2); g.translate(-0.65, 0, 0);
  B.geo(g, wrapMat(), cx, cy, HC, rz);
  latheX(B, [[0, -25.25], [6.2, -25.25], [6.5, -25.05]], steel, cx, cy, HC, rz);
  latheX(B, [[6.5, -25.05], [7.05, -24.62], [CR, -23.95]], colorMat('#0c1f55', 0.3, 0.25), cx, cy, HC, rz);
  latheX(B, [[CR, 22.65], [7.05, 23.3], [6.5, 23.75]], colorMat(BAND, 0.3, 0.25), cx, cy, HC, rz);
  latheX(B, [[6.5, 23.75], [5.6, 23.95], [2.95, 23.95], [2.75, 24.1], [2.75, 24.95], [2.45, 25.25], [0, 25.25]], steel, cx, cy, HC, rz);
}

class Helix extends THREE.Curve {
  constructor(len, r0, r1, turns) { super(); this.len = len; this.r0 = r0; this.r1 = r1; this.turns = turns; }
  getPoint(t, target = new THREE.Vector3()) {
    const a = t * this.turns * Math.PI * 2, r = this.r0 + (this.r1 - this.r0) * t;
    return target.set(this.len * t, r * Math.cos(a), r * Math.sin(a));
  }
}

/** Tray with contacts and cells; origin = tray centre, h = 0 → bench. */
function holder() {
  const B = new Builder(), pl = colorMat('#17181a', 0.42), steel = colorMat('#c6c9cc', 0.3, 1);
  B.rbox(TL, TW, WALL, 0.5, pl, 0, 0, 0);
  for (const s of [-1, 1]) {
    B.rbox(WALL, TW, 14.6, 0.45, pl, s * (TL / 2 - WALL / 2), 0, 0);                  // end walls
    B.rbox(TL, WALL, 9.6, 0.45, pl, 0, s * (TW / 2 - WALL / 2), 0);                   // side walls
    B.rbox(11, WALL, 12.4, 0.45, pl, s * (TL / 2 - 5.5), TW / 2 - WALL / 2, 0); B.rbox(11, WALL, 12.4, 0.45, pl, s * (TL / 2 - 5.5), -TW / 2 + WALL / 2, 0);
  }
  for (const k of [-1, 0, 1]) {                                                       // partitions between the cells
    B.box(TL - 2 * WALL, 0.8, 2.6, pl, 0, k * PITCH, WALL - 0.05);
    for (const s of [-1, 1]) B.rbox(10, 0.8, 4.9, 0.25, pl, s * (XI - 5), k * PITCH, WALL - 0.05);
  }
  const ys = [0, 1, 2, 3].map((i) => (i - 1.5) * PITCH);
  ys.forEach((cy, i) => {
    const plusRight = i % 2 === 0, sp = plusRight ? 1 : -1;                           // sp: side of the "+" contact
    addCell(B, cy, plusRight);
    // "+" contact: plate with a dimple
    B.box(0.4, 9, 9.4, steel, sp * (XI - 0.2), cy, HC - 4.7);
    B.sphere(1.3, steel, sp * (XI + 0.4), cy, HC, { seg: 16 });
    // "−" contact: plate + conical spring
    B.box(0.4, 9, 9.4, steel, -sp * (XI - 0.2), cy, HC - 4.7);
    const len = (XI - 0.4) - (CL - TIP);                                              // gap between the plate and the "−" face
    B.geo(new THREE.TubeGeometry(new Helix(Math.max(2.4, len), 4.7, 2.9, 3.4), 120, 0.4, 7), steel, -sp * (XI - 0.4), cy, HC, sp > 0 ? 0 : 180);
  });
  // series links: 0–1 and 2–3 on the left wall, 1–2 on the right wall
  B.box(0.35, PITCH, 4.2, steel, -(XI - 0.22), (ys[0] + ys[1]) / 2, HC - 2.1);
  B.box(0.35, PITCH, 4.2, steel, -(XI - 0.22), (ys[2] + ys[3]) / 2, HC - 2.1);
  B.box(0.35, PITCH, 4.2, steel, XI - 0.22, (ys[1] + ys[2]) / 2, HC - 2.1);
  // solder lugs of the two end contacts poking through the right wall
  for (const cy of [ys[0], ys[3]]) {
    B.cyl(1.7, 0.5, steel, TL / 2 + 0.15, cy, HC, { axis: 'x', seg: 18 });
    B.box(2.9, 3.4, 0.45, steel, TL / 2 + 1.45, cy, HC - 0.2);
    B.sphere(1.25, M.solder, TL / 2 + 1.9, cy, HC + 0.35, { sy: 0.62, seg: 14 });
  }
  return B.build('aa-holder');
}

/** Insulated lead along [[x, y, h], …] (board coords, h = 0 → bench) ending in a tinned tip + solder blob on its pad. */
function lead(B, path, color) {
  const c = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(p[0], p[2], -p[1])), false, 'centripetal');
  B.geo(new THREE.TubeGeometry(c, 90, 0.78, 10, false), colorMat(color, 0.4));
  const e = path[path.length - 1];
  B.cyl(0.42, 2.0, M.tin, e[0] + 0.9, e[1], e[2], { axis: 'x', seg: 10 });
  B.sphere(1.5, M.solder, e[0] + 1.3, e[1], T + 0.15, { sy: 0.55, seg: 16 });
}

export default {
  id: 'battery',
  name: '4 × AA battery holder',
  category: 'Power',
  blurb: 'Portable 6 V supply for motors.',
  about: 'Four 1.5 V AA cells in series give about 6 V — enough for small motors and servos, and it keeps their current spikes away from the controller. '
    + 'Red is plus, black is minus; always join the battery minus with the board GND so both share one reference. '
    + 'Never connect it backwards and never put 6 V on a 5 V or 3.3 V pin — feed the motor driver input or the board VIN instead.',
  plug: 'pad',
  pinPlug: {},
  defaults: {},
  interact: null,

  build(opts = {}) {
    const b = new Board({
      w: W, h: H, t: T, theme: 'green', finish: 'tin', quality: (opts.quality ?? 1) * 0.6,
      outline: rrPoly(66.5, 22, 81.5, 42, 1.3),
    });

    // terminal board: two big tinned pads with a wire hole each
    const NAMES = [['+', '6 V battery positive', 'pwr'], ['-', 'battery negative — connect to GND', 'gnd']];
    PADY.forEach((py, i) => {
      b.pad(PADX, py, 8.4, 5.6, { finish: 'tin' });
      b.th(HOLE_X, py, { d: 3.4, hole: 1.5, finish: 'tin' });
      b.pin(HOLE_X, py, ...NAMES[i]);
    });
    b.text('+', 79.1, PADY[0], { size: 2.6, weight: 700 });
    b.rect(79.1, PADY[1], 1.9, 0.42, { fill: true });
    b.text('6V', PADX, 32, { size: 1.5, weight: 700 });
    b.text('4 × AA', 74, 23.7, { size: 0.9 });
    b.text('BATTERY  6 V', 74, 32, { size: 1.3, side: 'bottom' });

    const lift = (g) => { g.children[0].position.y = -T; return g; };
    lift(b.place(holder(), TX, TY));

    // leads: red from the "+" lug of the first cell, black from the "−" lug of the last one
    const B = new Builder(), x0 = TX + TL / 2, y0 = TY - 1.5 * PITCH, hz = T + 0.8;
    const path = (m) => [[x0 + 2.2, y0, HC + 0.6], [x0 + 4.8, y0 + 0.5, HC - 0.4], [x0 + 6.9, y0 + 2.4, 5.0], [x0 + 7.4, y0 + 5.6, 1.4], [x0 + 6.6, y0 + 9.5, 0.8],
      [x0 + 5.2, y0 + 13.2, 0.8], [x0 + 5.0, y0 + 16.2, 0.9], [x0 + 6.4, PADY[0], 1.3], [x0 + 8.6, PADY[0], hz], [x0 + 10.3, PADY[0], hz]]
      .map(([x, y, h]) => [x, m ? H - y : y, h]);
    lead(B, path(false), '#c9201b');
    lead(B, path(true), '#151515');
    lift(b.place(B.build('battery-leads'), 0, 0));

    const built = b.finish();
    built.actors = {};
    const dispose = built.dispose.bind(built);
    built.dispose = () => { dispose(); };
    return built;
  },

  apply() {},
  tick() {},
};
