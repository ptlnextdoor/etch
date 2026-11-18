// Lab module: yellow "TT" gear motor with its 65 mm wheel pushed on the output shaft.
// The wheel stands on the bench; the gearbox hangs on the axle and leans back until the motor end touches the bench
// (that is how a loose motor + wheel really rests). No PCB: the Board is only an invisible carrier for the pins.
import * as THREE from 'three';
import { Board } from '../../core/board.js';
import { Builder, M, colorMat, textMat, rrShape } from '../../core/builder.js';

const W = 96, H = 62, T = 1.0;        // module footprint; T = thickness of the hidden carrier (bench = −T)
const R = 32.5;                       // tyre radius = axle height above the bench
const AX = 35, WY = 46;               // axle x, wheel centre plane y (board coords)
const D = 25;                         // wheel centre plane → gearbox centre plane
const GY = WY - D;                    // gearbox centre plane y
const HT = 9.4, HV = 11.25;           // gearbox half thickness (along the axle), half height
const L1 = 25, CAN0 = 29.5, CAN1 = 50, CAP1 = 52.5, TAB_U = 55.6, TAB_W = 5.5;   // TAB_U = centre of the solder tabs
const SPIN = 3 * Math.PI * 2;         // rad/s at speed = 1

const decal = (color, rough = 0.6, metal = 0) => textMat({ w: 4, h: 4, bg: color, fg: color, lines: [], roughness: rough, metalness: metal });
let _yel;
/** Kit-yellow ABS (shared, never mutated); a little self-colour keeps it yellow on the faces turned away from the key light. */
const YEL = () => (_yel ||= new THREE.MeshStandardMaterial({ color: '#ffc91a', roughness: 0.4, emissive: new THREE.Color('#f0a800'), emissiveIntensity: 0.2 }));
const RUBBER = () => colorMat('#151515', 0.88);

/** Extruded slab spanning three-z ∈ [z0, z0 + thick] (i.e. along the axle), shape drawn in (u, v). */
function zslab(B, shape, mat, z0, thick, bevel, seg = 28) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: seg });
  g.translate(0, 0, z0 + bevel);
  return B.geo(g, mat);
}
/** Extrusion along u (three x) from u0 to u1 of a shape drawn in (w, v). */
function xslab(B, shape, mat, u0, u1, bevel, seg = 28) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: u1 - u0 - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: seg });
  g.translate(0, 0, bevel); g.rotateY(Math.PI / 2);
  return B.geo(g, mat, u0, 0, 0);
}
/** Circle of radius r with two flats at ±f (motor can / D-shaft cross-section). */
function flatCircle(r, f) {
  const s = new THREE.Shape(), a = Math.acos(f / r);
  s.moveTo(f, -r * Math.sin(a)); s.lineTo(f, r * Math.sin(a));
  s.absarc(0, 0, r, a, Math.PI - a, false);
  s.lineTo(-f, -r * Math.sin(a));
  s.absarc(0, 0, r, Math.PI + a, 2 * Math.PI - a, false);
  return s;
}

/** Gearbox + DC motor. Origin on the axle, x = u (towards the motor), builder y = along the axle (+ = wheel side), h = v. */
function gearmotor() {
  const B = new Builder(), yel = YEL(), strap = colorMat('#eceae0', 0.5), brass = colorMat('#c9a04a', 0.32, 1);
  const bv = 0.55;
  // two housing halves (the bevels meet in the parting line)
  const s = new THREE.Shape(), hv = HV - bv, x1 = L1 - bv, rc = 2.2;
  s.moveTo(0, -hv); s.lineTo(x1 - rc, -hv); s.absarc(x1 - rc, -hv + rc, rc, -Math.PI / 2, 0, false);
  s.lineTo(x1, hv - rc); s.absarc(x1 - rc, hv - rc, rc, 0, Math.PI / 2, false);
  s.lineTo(0, hv); s.absarc(0, 0, hv, Math.PI / 2, Math.PI * 1.5, false);
  for (const sv of [-1, 1]) { const p = new THREE.Path(); p.absarc(19.2, sv * 8.1, 1.55 + bv, 0, Math.PI * 2, true); s.holes.push(p); }
  zslab(B, s, yel, -HT, HT, bv); zslab(B, s, yel, 0, HT, bv);
  // front mounting tongue
  { const t = new THREE.Shape(), tb = 0.3;
    t.moveTo(-9.5, -3.6 + tb); t.lineTo(-13.4, -3.6 + tb); t.absarc(-13.4, 0, 3.6 - tb, -Math.PI / 2, -Math.PI * 1.5, true); t.lineTo(-9.5, 3.6 - tb); t.closePath();
    const p = new THREE.Path(); p.absarc(-13.6, 0, 1.5 + tb, 0, Math.PI * 2, true); t.holes.push(p);
    zslab(B, t, yel, -1.6, 3.2, tb); }
  // bosses on both faces: output shaft bearing, gear axles, locating nubs
  B.cyl(5.4, 2 * HT + 1.8, yel, 0, 0, 0, { axis: 'y', seg: 40 });
  B.cyl(3.4, 2 * HT + 3.0, yel, 0, 0, 0, { axis: 'y', seg: 32 });
  B.cyl(3.0, 2 * HT + 1.0, yel, 10.6, 0, -2.6, { axis: 'y', seg: 28 });
  B.cyl(2.3, 2 * HT + 1.0, yel, 17.6, 0, 2.2, { axis: 'y', seg: 24 });
  B.cyl(1.9, 2 * HT + 2.6, yel, 11.2, 0, 5.6, { axis: 'y', seg: 20 });
  // case screws (front face) with their recesses
  for (const [u, v] of [[6.6, -7.6], [22.2, -3.4]]) {
    B.cyl(1.75, 0.5, M.steel, u, -HT - 0.1, v, { axis: 'y', seg: 18 });
    B.vplane(2.4, 0.42, decal('#1b1c1f', 0.5), u, -HT - 0.36, v, 270);
    B.vplane(0.42, 2.4, decal('#1b1c1f', 0.5), u, -HT - 0.362, v, 270);
  }
  // motor saddle with the two strap hooks
  B.rbox(CAN0 + 2.5 - L1 + 1, 16.4, 21.2, 1.2, yel, (L1 - 1 + CAN0 + 2.5) / 2, 0, -10.6);
  for (const sv of [-1, 1]) B.rbox(3.0, 8.4, 1.5, 0.4, yel, CAN0 - 1.6, 0, sv * 11.0 - 0.75);
  // motor can (Ø20 with two flats), end bell, bearing, shaft stub
  xslab(B, flatCircle(10 - 0.6, 7.7 - 0.6), M.steel, CAN0, CAN1, 0.6, 40);
  for (const sw of [-1, 1]) {
    B.vplane(4.2, 1.5, decal('#0b0b0c', 0.8), CAN1 - 5.2, sw * 7.72, 4.2, sw < 0 ? 270 : 90);
    B.vplane(4.2, 1.5, decal('#0b0b0c', 0.8), CAN1 - 5.2, sw * 7.72, -4.2, sw < 0 ? 270 : 90);
  }
  xslab(B, flatCircle(9.3 - 0.4, 7.1 - 0.4), colorMat('#26272a', 0.55), CAN1 - 0.3, CAP1, 0.4, 36);
  B.cyl(3.1, 1.5, colorMat('#b98f3e', 0.35, 1), CAP1 + 0.6, 0, 0, { axis: 'x', seg: 24 });
  B.cyl(1.0, 0.8, M.steel, CAP1 + 1.6, 0, 0, { axis: 'x', seg: 12 });
  // red dot next to the "+" terminal
  B.cyl(0.75, 0.1, colorMat('#d3261c', 0.5), CAP1 + 0.02, -TAB_W, 3.2, { axis: 'x', seg: 14 });
  // solder tabs
  const tab = rrShape(7.0, 3.0, 0.9); { const p = new THREE.Path(); p.absarc(-0.3, 0, 0.65, 0, Math.PI * 2, true); tab.holes.push(p); }   // wire hole; the tip stays solid (pin spot)
  for (const sw of [-1, 1]) B.extrude(tab, 0.4, brass, TAB_U, sw * TAB_W, -0.2, 0, { seg: 10 });
  // white nylon strap that clips the motor to the gearbox
  const sx0 = CAN0 - 3.0, sx1 = CAP1 + 2.3, sv = 10.25;
  for (const q of [-1, 1]) {
    B.rbox(sx1 - sx0, 5.6, 0.9, 0.3, strap, (sx0 + sx1) / 2, 0, q * sv - 0.45);
    B.rbox(2.4, 9.6, 1.5, 0.4, strap, sx0 + 0.6, 0, q * (sv + 0.25) - 0.75);
    B.cyl(0.95, 5.6, strap, sx1 - 0.5, 0, q * (sv - 0.5), { axis: 'y', seg: 14 });
  }
  B.rbox(0.9, 5.6, 2 * sv - 1.0, 0.3, strap, sx1 - 0.0, 0, -sv + 0.5);
  return B.build('tt-gearmotor');
}

/** Wheel + output shaft, authored with the axle vertical (h = along the axle, + = towards the gearbox). */
function wheel() {
  const B = new Builder(), yel = YEL(), rub = RUBBER();
  // tyre carcass
  B.lathe([[25.2, -13], [27.0, -13], [27.3, -13.3], [28.7, -13.3], [29.0, -13], [29.6, -13], [30.6, -12.6], [31.2, -11.7], [31.45, -10.2],
    [31.45, 10.2], [31.2, 11.7], [30.6, 12.6], [29.6, 13], [29.0, 13], [28.7, 13.3], [27.3, 13.3], [27.0, 13], [25.2, 13]], rub, 0, 0, 0, 72);
  // tread: two staggered rows of lugs
  const N = 30;
  for (let i = 0; i < N; i++) for (const row of [0, 1]) {
    const a = ((i + row * 0.5) / N) * Math.PI * 2, r = R - 0.83;
    B.rbox(1.5, 4.3, 11.6, 0.4, rub, r * Math.cos(a), r * Math.sin(a), row ? 0.7 : -12.3, (a * 180) / Math.PI);
  }
  // rim
  B.lathe([[23.3, -13.7], [26.3, -13.7], [26.6, -13.4], [26.6, -12.9], [25.4, -12.6], [25.4, 12.6], [26.6, 12.9], [26.6, 13.4], [26.3, 13.7], [23.3, 13.7],
    [23.0, 13.4], [23.0, -13.4], [23.3, -13.7]], yel, 0, 0, 0, 72);
  // web: three wide spokes, each with a slot
  const bv = 0.35, web = new THREE.Shape(); web.absarc(0, 0, 23.5 - bv, 0, Math.PI * 2, false);
  const r1 = 9.0 - bv, r2 = 20.6 + bv, hw = 5.6 - bv;
  for (let k = 0; k < 3; k++) {
    const c = (k * 120 + 60) * Math.PI / 180, A1 = Math.PI / 3 - Math.asin(hw / r1), A2 = Math.PI / 3 - Math.asin(hw / r2);
    const p = new THREE.Path();
    p.absarc(0, 0, r2, c - A2, c + A2, false); p.absarc(0, 0, r1, c + A1, c - A1, true); p.closePath();
    web.holes.push(p);
    const s = (k * 120) * Math.PI / 180, cs = Math.cos(s), sn = Math.sin(s), q = new THREE.Path(), sr = 1.5 + bv;
    q.absarc(11.5 * cs, 11.5 * sn, sr, s + Math.PI / 2, s + Math.PI * 1.5, false);
    q.absarc(18.2 * cs, 18.2 * sn, sr, s - Math.PI / 2, s + Math.PI / 2, false); q.closePath();
    web.holes.push(q);
  }
  B.extrude(web, 3.4, yel, 0, 0, -9.4, 0, { bevel: bv, seg: 40 });
  // hub boss + stiffening ribs on the gearbox side
  B.lathe([[5.2, -10.4], [5.9, -10.0], [6.3, -9.4], [6.3, 9.8], [5.9, 10.4], [3.4, 10.4]], yel, 0, 0, 0, 36);
  for (let k = 0; k < 6; k++) { const a = (k * 60 + 30) * Math.PI / 180; B.box(4.6, 1.2, 6.5, yel, 8.2 * Math.cos(a), 8.2 * Math.sin(a), -6.2, k * 60 + 30); }
  B.cyl(5.2, 0.3, yel, 0, 0, -10.6, { seg: 30 });
  B.cyl(1.7, 0.2, M.cavity, 0, 0, -10.75, { seg: 16 });
  // output shaft (double-D) running through the gearbox
  B.extrude(flatCircle(2.7 - 0.25, 1.85 - 0.25), 36.6, colorMat('#f1efe7', 0.45), 0, 0, 7.0, 0, { bevel: 0.25, seg: 20 });
  B.cyl(0.9, 0.3, M.cavity, 0, 0, 43.4, { seg: 12 });
  return B.build('tt-wheel');
}

/** Lean angle at which the lowest point of the (un-rotated) gear motor `obj` touches the bench, i.e. sits R below the axle. */
function leanAngle(obj) {
  const pts = [];
  obj.traverse((o) => { if (o.isMesh) { const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) pts.push(p.getX(i), p.getY(i)); } });
  const low = (th) => { const s = Math.sin(th), c = Math.cos(th); let m = Infinity; for (let i = 0; i < pts.length; i += 2) { const y = -pts[i] * s + pts[i + 1] * c; if (y < m) m = y; } return m; };
  let a = 0, b = 0.9;
  for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (low(m) > -R) a = m; else b = m; }
  return a;
}

export default {
  id: 'motor',
  name: 'TT gear motor + wheel',
  category: 'Actuators',
  blurb: 'Geared DC motor that drives a wheel.',
  about: 'The yellow "TT" motor found in almost every robot-car kit: a small 3–6 V DC motor with a 1:48 plastic gearbox and a 65 mm wheel. '
    + 'The polarity on its two tabs sets the direction and the voltage sets the speed. '
    + 'Never wire it straight to a GPIO pin — it needs far more current than a pin can give, so drive it through an H-bridge such as the L298N.',
  plug: 'pad',
  pinPlug: {},
  defaults: { speed: 0 },
  interact: null,

  build(opts = {}) {
    const b = new Board({
      w: W, h: H, t: T, theme: 'black', quality: (opts.quality ?? 1) * 0.1,
      outline: [[AX - 1, WY - 1], [AX + 1, WY - 1], [AX + 1, WY + 1], [AX - 1, WY + 1]],
    });
    // Rotations are baked into the geometry (not left on the groups) so that bounding boxes stay exact —
    // the lab rests a module on the lowest point of its Box3.
    const bake = (obj, m) => { obj.traverse((o) => { if (o.isMesh) o.geometry.applyMatrix4(m); }); return obj; };

    // gearbox + motor, hanging on the axle and leaning on its motor end
    const gm = gearmotor(), th = leanAngle(gm);
    bake(gm, new THREE.Matrix4().makeRotationZ(-th));
    gm.position.y = R - T;
    b.place(gm, AX, GY);

    // wheel: its group sits on the axle and turns about it (local z)
    const spin = bake(wheel(), new THREE.Matrix4().makeRotationX(Math.PI / 2));
    spin.position.y = R - T;
    b.place(spin, AX, WY);

    const px = AX + (TAB_U + 2.0) * Math.cos(th);
    b.pin(px, GY - TAB_W, 'M+', 'motor terminal (red dot) — positive here spins the wheel forwards', 'dig');
    b.pin(px, GY + TAB_W, 'M-', 'motor terminal — swap the polarity to reverse', 'dig');

    const built = b.finish();
    const pcb = built.group.getObjectByName('pcb'); if (pcb) pcb.visible = false;   // carrier only: nothing to see
    built.actors = { wheel: spin };
    const dispose = built.dispose.bind(built);
    built.dispose = () => { dispose(); };
    return built;
  },

  apply(built, s) { /* speed is integrated in tick(); nothing static to show */ },

  tick(built, s, dt) {
    const v = Math.max(-1, Math.min(1, Number(s.speed) || 0));
    if (v) built.actors.wheel.rotation.z = (built.actors.wheel.rotation.z - v * SPIN * dt) % (Math.PI * 2);
  },
};
