// Lab module: SG90 micro servo standing on the bench (output shaft up) with its 3-wire ribbon plugged into a tiny
// 3-pin breakout that carries the wire-able posts GND / 5V / SIG.
// Everything except the breakout PCB is authored in "bench" coordinates: h = 0 is the bench surface.
import * as THREE from 'three';
import { Board } from '../../core/board.js';
import { Builder, M, colorMat, textMat } from '../../core/builder.js';
import { header, headerPinPositions } from '../../core/parts-ic.js';

const W = 88, H = 36;                 // footprint of the whole module (mm)
const T = 1.2, TAIL = 0.45;           // breakout PCB thickness, length of the pin stubs it stands on
const BENCH = -(T + TAIL);            // bench level in board heights (board top = 0)
const SX = 71, SY = 18;               // centre of the servo case (board coords)
const BL = 22.5, BW = 12.2;           // case length × width
const CASE_H = 22.7;                  // top of the case
const SHAFT = -5.15;                  // output shaft offset from the case centre (along x)
const PX = 6.2, PY = 9, RAX = 10.5;   // posts x, connector centre y, right-angle header x
const WIRES = ['#5b3519', '#c4211b', '#ef8418'];   // brown, red, orange (same order as the posts: GND, 5V, SIG)

const decal = (color, rough = 0.6, metal = 0) => textMat({ w: 4, h: 4, bg: color, fg: color, lines: [], roughness: rough, metalness: metal });

let _shell;
/** Translucent blue polycarbonate of the SG90 case (shared, never mutated). */
const shellMat = () => (_shell ||= new THREE.MeshPhysicalMaterial({
  color: '#1859d6', roughness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.18,
  transparent: true, opacity: 0.8, emissive: new THREE.Color('#0a2f8a'), emissiveIntensity: 0.25,
}));

function rrPoly(x0, y0, x1, y1, r, n = 5) {
  const pts = [], arc = (cx, cy, a0) => { for (let i = 0; i <= n; i++) { const a = (a0 + 90 * i / n) * Math.PI / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  arc(x1 - r, y0 + r, -90); arc(x1 - r, y1 - r, 0); arc(x0 + r, y1 - r, 90); arc(x0 + r, y0 + r, 180);
  return pts;
}

/** Mounting ear: root at x = 0, pointing +x; screw hole with the slit that opens to the outer end. */
function earShape(len, wid, bv) {
  const s = new THREE.Shape(), hw = wid / 2 - bv, x1 = len - bv, r = 1.3, hx = len - 2.35, hr = 1.05 + bv, sl = 0.42 + bv;
  const a = Math.asin(sl / hr);
  s.moveTo(bv, -hw); s.lineTo(x1 - r, -hw); s.absarc(x1 - r, -hw + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x1, -sl); s.lineTo(hx + hr * Math.cos(a), -sl);
  s.absarc(hx, 0, hr, -a, a, true);
  s.lineTo(x1, sl); s.lineTo(x1, hw - r); s.absarc(x1 - r, hw - r, r, 0, Math.PI / 2, false);
  s.lineTo(bv, hw); s.closePath();
  return s;
}

/** Single-arm horn outline: hub circle at the origin, tapering arm along +x, row of holes. */
function hornShape(bv) {
  const s = new THREE.Shape(), r0 = 3.35 - bv, rt = 1.85 - bv, L = 17.8, ph = Math.acos((r0 - rt) / L);
  s.moveTo(r0 * Math.cos(-ph), r0 * Math.sin(-ph));
  s.lineTo(L + rt * Math.cos(-ph), rt * Math.sin(-ph));
  s.absarc(L, 0, rt, -ph, ph, false);
  s.lineTo(r0 * Math.cos(ph), r0 * Math.sin(ph));
  s.absarc(0, 0, r0, ph, 2 * Math.PI - ph, false);
  for (let i = 0; i < 7; i++) { const p = new THREE.Path(); p.absarc(5.4 + i * 2.0, 0, 0.5 + bv, 0, Math.PI * 2, true); s.holes.push(p); }
  return s;
}

/** Flat ribbon of parallel wires following a centre path [[x, y, h], …] (board-like coords). */
function ribbon(B, path, colors, pitch, r) {
  const c = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(p[0], p[2], -p[1])), false, 'centripetal');
  const N = 72, ctr = c.getSpacedPoints(N), tan = new THREE.Vector3();
  colors.forEach((col, k) => {
    const off = (k - (colors.length - 1) / 2) * pitch;
    const pts = ctr.map((p, i) => {
      c.getTangentAt(i / N, tan);
      const l = Math.hypot(tan.x, tan.z) || 1;
      return new THREE.Vector3(p.x + (tan.z / l) * off, p.y, p.z - (tan.x / l) * off);
    });
    B.geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N * 2, r, 10, false), colorMat(col, 0.42));
  });
}

/** The servo case (origin = centre of its footprint, h = 0 → bench). */
function servoCase() {
  const B = new Builder(), blue = shellMat(), white = colorMat('#eceae2', 0.5);
  // what shows through the translucent shell: control PCB, coreless motor, feedback pot, the white gear train
  B.box(19, 9.6, 0.8, colorMat('#1c7a3c', 0.6), 0.3, 0, 1.3);
  B.box(4, 5, 1.0, M.epoxy, 3, 0.5, 2.1);
  B.cyl(4.0, 11.5, M.steel, 5.9, 0, 4.6, { seg: 28 });
  B.cyl(1.0, 2.2, M.gold, 5.9, 0, 16.1, { seg: 12 });
  B.cyl(3.7, 6.4, colorMat('#2b2d31', 0.6), SHAFT, 0, 8.6, { seg: 24 });
  B.cyl(1.2, 5.5, M.steel, SHAFT, 0, 15, { seg: 12 });
  B.cyl(4.7, 1.3, white, SHAFT, 0, 20.4, { seg: 30 });
  B.cyl(3.9, 1.2, white, SHAFT + 6.7, 0, 19.2, { seg: 26 });
  B.cyl(1.5, 2.6, white, SHAFT + 6.7, 0, 19.8, { seg: 16 });
  B.cyl(3.3, 1.2, white, 6.4, 1.2, 20.9, { seg: 24 });
  B.cyl(0.5, 4.2, M.steel, SHAFT + 6.7, 0, 18.9, { seg: 8 });

  // case: bottom cover, middle section, gear cover (the rounded edges leave the two seam grooves)
  B.rbox(BL, BW, 4.1, 0.5, blue, 0, 0, 0);
  B.rbox(BL, BW, 14.4, 0.5, blue, 0, 0, 4.1);
  B.rbox(BL, BW, CASE_H - 18.5, 0.6, blue, 0, 0, 18.5);
  // mounting ears
  const ear = earShape(4.9, BW, 0.25);
  B.extrude(ear, 2.5, blue, BL / 2, 0, 16.0, 0, { bevel: 0.25, seg: 20 });
  B.extrude(ear, 2.5, blue, -BL / 2, 0, 16.0, 180, { bevel: 0.25, seg: 20 });
  // stepped top: output-shaft tower and the idler-gear boss next to it
  B.lathe([[5.9, 0], [5.9, 3.55], [5.76, 3.84], [5.46, 4.0], [3.5, 4.0], [3.5, 4.5], [3.25, 4.7], [2.5, 4.7]], blue, SHAFT, 0, CASE_H, 48);
  B.lathe([[2.8, 0], [2.8, 3.6], [2.66, 3.88], [2.4, 4.0], [0, 4.0]], blue, SHAFT + 6.75, 0, CASE_H, 32);
  // cable exit notch in the bottom cover
  B.rbox(0.9, 4.6, 2.4, 0.2, M.blackMatte, -BL / 2 + 0.25, 0, 1.0);

  // stickers on both long sides
  const lab = textMat({
    w: 420, h: 280, bg: '#f3f2ec', fg: '#12327e', roughness: 0.38,
    lines: [{ t: 'MICRO SERVO', size: 44, y: 0.17, color: '#ffffff', weight: 700 }, { t: 'SG90', size: 132, y: 0.6, weight: 800 }, { t: '9 g', size: 40, y: 0.89, weight: 600 }],
    draw: (g, w, h) => { g.fillStyle = '#1a4db8'; g.fillRect(0, 0, w, h * 0.33); g.fillStyle = '#d6352b'; g.fillRect(0, h * 0.33, w, h * 0.035); },
  });
  B.vplane(13.5, 9, lab, 1.6, -BW / 2 - 0.02, 10.6, 270);
  B.vplane(13.5, 9, lab, -1.6, BW / 2 + 0.02, 10.6, 90);
  return B.build('sg90-case');
}

/** Output shaft + single-arm horn (origin on the shaft axis, arm along +x, h = 0 → bench). */
function servoHorn() {
  const B = new Builder(), white = colorMat('#f4f2ea', 0.4), top = CASE_H + 4.7;
  // splined shaft
  B.cyl(2.4, 3.3, colorMat('#e9e6dc', 0.5), 0, 0, top - 0.6, { seg: 21 });
  for (let i = 0; i < 21; i++) { const a = (i / 21) * Math.PI * 2; B.box(0.3, 0.34, 3.2, white, 2.42 * Math.cos(a), 2.42 * Math.sin(a), top - 0.55, (a * 180) / Math.PI); }
  // hub with the screw recess, arm
  const h0 = top + 0.9;
  B.lathe([[3.55, 0], [3.55, 3.7], [3.3, 4.0], [2.15, 4.0], [2.15, 2.9], [0, 2.9]], white, 0, 0, h0, 40);
  B.extrude(hornShape(0.2), 1.5, white, 0, 0, h0 + 2.3, 0, { bevel: 0.2, seg: 20 });
  // retaining screw
  B.lathe([[1.75, 0], [1.75, 0.3], [1.45, 0.62], [0.9, 0.78], [0, 0.8]], M.steel, 0, 0, h0 + 2.9, 24);
  const slot = decal('#16171a', 0.5);
  B.plane(2.0, 0.34, slot, 0, 0, h0 + 3.71, 20); B.plane(2.0, 0.34, slot, 0, 0, h0 + 3.712, 110);
  return B.build('sg90-horn');
}

/** Ribbon cable + its black 3-way Dupont housing plugged on the right-angle pins (board coords, h = 0 → bench). */
function servoCable() {
  const B = new Builder(), hz = T + TAIL + 1.27, x0 = RAX + 4.15, len = 14, blk = colorMat('#121314', 0.38);
  for (let i = 0; i < 3; i++) {
    const y = PY + (i - 1) * 2.54;
    B.rbox(len, 2.5, 2.5, 0.28, blk, x0 + len / 2, y, hz - 1.25);
    B.plane(2.7, 1.25, decal('#050505', 0.9), x0 + 3.6, y, hz + 1.256);                // crimp window
    B.plane(1.5, 0.7, decal('#b9bcbd', 0.3, 1), x0 + 3.9, y, hz + 1.258);
    B.cyl(0.62, 0.4, colorMat(WIRES[i], 0.42), x0 + len + 0.1, y, hz, { axis: 'x', seg: 12 });
  }
  const xe = x0 + len, bx = SX - BL / 2;
  ribbon(B, [
    [xe - 1.5, PY, hz], [xe + 2.0, PY, hz], [xe + 6, PY + 0.4, 1.3], [xe + 10, PY + 1.6, 0.62], [xe + 16, PY + 4.6, 0.6],
    [bx - 9.5, SY - 2.2, 0.6], [bx - 5, SY - 0.3, 0.75], [bx - 1.6, SY, 1.75], [bx + 1.2, SY, 2.2],
  ], WIRES, 1.24, 0.6);
  return B.build('sg90-cable');
}

export default {
  id: 'servo',
  name: 'SG90 micro servo',
  category: 'Actuators',
  blurb: 'Turns its arm to an exact angle.',
  about: 'A hobby micro servo: a small DC motor, a gearbox and a position sensor in one case. '
    + 'Brown goes to GND, red to 5 V and orange (SIG) to a PWM pin — the pulse width, roughly 0.5–2.4 ms every 20 ms, sets the arm angle from 0° to 180°. '
    + 'It can pull several hundred milliamps when it moves or stalls, so power more than one servo from a separate 5 V supply, never from a GPIO pin.',
  plug: 'post',
  pinPlug: {},
  defaults: { angle: 90 },
  interact: null,

  build(opts = {}) {
    const b = new Board({
      w: W, h: H, t: T, theme: 'black', finish: 'gold', quality: (opts.quality ?? 1) * 0.65,
      outline: rrPoly(0.8, PY - 5.7, RAX + 4.1, PY + 5.7, 1.0),
    });

    // breakout: three posts, right-angle header the servo lead plugs onto
    const hp = { x: PX, y: PY, rot: 90, nx: 3, type: 'male', tail: TAIL };
    header(b, hp);
    header(b, { x: RAX, y: PY, rot: 90, nx: 3, type: 'maleRA', tail: TAIL, pin1: false });
    const pins = headerPinPositions(hp);
    const NAMES = [['GND', 'ground — brown wire', 'gnd'], ['5V', 'servo power, 4.8–6 V — red wire', 'pwr'], ['SIG', 'PWM control signal — orange wire', 'dig']];
    pins.forEach(([px, py], i) => {
      b.pin(px, py, ...NAMES[i]);
      b.text(NAMES[i][0], 2.75, py, { size: 1.05 });
      b.trace([[px, py], [RAX, py]], { w: 0.55 });
      b.trace([[px, py], [RAX, py]], { w: 0.55, side: 'bottom' });
    });
    b.text('SG90 SERVO', 7.6, PY, { size: 0.9, side: 'bottom', rot: 90 });

    const lift = (g) => { g.children[0].position.y = BENCH; return g; };
    lift(b.place(servoCable(), 0, 0));
    lift(b.place(servoCase(), SX, SY));
    const horn = servoHorn();
    lift(b.place(horn, SX + SHAFT, SY));

    const built = b.finish();
    built.actors = { horn };
    const dispose = built.dispose.bind(built);
    built.dispose = () => { dispose(); };
    return built;
  },

  apply(built, s) {
    const a = Math.max(0, Math.min(180, Number(s.angle ?? 90)));
    built.actors.horn.rotation.y = THREE.MathUtils.degToRad(a - 90);
  },

  tick() {},
};
