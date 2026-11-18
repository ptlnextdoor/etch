// Lab module: L298N dual H-bridge motor driver (the classic red 43 × 43 mm board with the tall black heatsink).
import * as THREE from 'three';
import { Board } from '../../core/board.js';
import { Builder, M, colorMat, textMat, glowSprite } from '../../core/builder.js';
import { header, headerPinPositions, jumper, capElec, diode, res, cap, solderJoint } from '../../core/parts-ic.js';

const S = 43;                                   // board side
const LED_ON = '#ff2a1c', LED_OFF = '#e9b6ae';
const decal = (color, rough = 0.6, metal = 0) => textMat({ w: 4, h: 4, bg: color, fg: color, lines: [], roughness: rough, metalness: metal });

/** Prism: closed profile [[y, h], …] extruded along x to `width` (centred on x = 0). */
function prismX(B, prof, width, mat, bevel = 0.1) {
  const s = new THREE.Shape();
  prof.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(s, { depth: width - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });
  g.translate(0, 0, -width / 2 + bevel); g.rotateY(Math.PI / 2);
  return B.geo(g, mat);
}

/**
 * Blue PCB screw terminal block (KF301 style, 5.08 mm pitch). Origin = centre of the pin row, wire entries face local −y.
 * Returns { group, screws: [[bx, by], …] } — board coordinates of the screw heads (left → right in local x).
 */
function screwTerminal(b, { x, y, rot = 0, n = 2 }) {
  const B = new Builder(), blue = colorMat('#1b62cf', 0.36), P = 5.08, Wd = n * P - 0.06, t = b.t, bv = 0.15;
  const xs = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * P), L = b.local(x, y, rot);
  const clampM = colorMat('#b9bcbf', 0.38, 1), dark = decal('#060606', 0.9);
  // rear block + top deck with the screw wells
  B.rbox(Wd, 4.3, 8.4, 0.25, blue, 0, 1.65, 0);
  const deck = new THREE.Shape();
  deck.moveTo(-Wd / 2 + bv, -1.9 + bv); deck.lineTo(Wd / 2 - bv, -1.9 + bv); deck.lineTo(Wd / 2 - bv, 3.8 - bv); deck.lineTo(-Wd / 2 + bv, 3.8 - bv); deck.closePath();
  for (const px of xs) { const p = new THREE.Path(); p.absarc(px, 0.95, 1.95 + bv, 0, Math.PI * 2, true); deck.holes.push(p); }
  B.extrude(deck, 1.8, blue, 0, 0, 8.2, 0, { bevel: bv, seg: 24 });
  // sloped shoulder above the wire entries, floor, partitions
  prismX(B, [[-3.8, 5.25], [-0.4, 5.25], [-0.4, 9.95], [-1.85, 9.95], [-3.8, 6.9]], Wd, blue, 0.12);
  B.box(Wd, 3.5, 1.15, blue, 0, -2.05, 0);
  for (let k = 0; k <= n; k++) {
    const edge = k === 0 || k === n, w = edge ? 0.62 : 1.14, cx = -Wd / 2 + (k * Wd) / n + (k === 0 ? w / 2 : k === n ? -w / 2 : 0);
    B.box(w, 3.5, 4.2, blue, cx, -2.05, 1.1);
  }
  xs.forEach((px, i) => {
    // wire entry: dark cavity, steel cage clamp with its opening
    B.vplane(4.3, 4.2, M.cavity, px, -0.52, 3.2, 270);
    B.box(3.5, 2.5, 3.4, clampM, px, -1.95, 1.45);
    B.vplane(2.5, 2.3, dark, px, -3.21, 3.0, 270);
    B.box(2.5, 0.3, 0.5, clampM, px, -3.35, 1.45);
    // screw in its well
    B.cyl(1.95, 0.1, M.cavity, px, 0.95, 8.22, { seg: 20 });
    B.lathe([[1.8, 0], [1.8, 0.75], [1.62, 0.95], [0, 0.95]], M.steel, px, 0.95, 8.25, 24);
    B.plane(3.2, 0.42, dark, px, 0.95, 9.21, [24, 78, -37, 51][(i + n) % 4]);
    // solder pin
    const [bx, by] = L(px, 0);
    b.th(bx, by, { d: 2.5, hole: 1.3 });
    B.cyl(0.5, t + 2.0, M.tin, px, 0, -t - 1.9, { seg: 10 });
    solderJoint(B, px, 0, -t, { r: 1.1, hgt: 1.0, flip: true, rp: 0.5 });
  });
  return { group: b.place(B.build('screw-terminal'), x, y, rot), screws: xs.map((px) => L(px, 0.95)) };
}

/** Finned black-anodised heatsink. Origin = centre of the flat face that touches the chip (that face looks towards −y). */
function heatsink(b, x, y) {
  const B = new Builder(), Wd = 20.6, Dp = 15.4, Ht = 25, base = 2.7, nf = 7, ft = 1.3, gap = (Wd - nf * ft) / (nf - 1);
  const s = new THREE.Shape(); s.moveTo(-Wd / 2, 0); s.lineTo(Wd / 2, 0);
  for (let i = nf - 1; i >= 0; i--) {
    const x1 = -Wd / 2 + i * (ft + gap) + ft, x0 = x1 - ft;
    s.lineTo(x1, Dp); s.lineTo(x0, Dp);
    if (i > 0) { s.lineTo(x0, base); s.lineTo(x0 - gap, base); }
  }
  s.closePath();
  B.extrude(s, Ht, colorMat('#1b1c1f', 0.4, 0.55), 0, 0.12, 0.35, 0, { bevel: 0.12 });
  return b.place(B.build('heatsink'), x, y);
}

/** L298N in its Multiwatt-15 package standing upright. Origin = centre of the back of the metal tab (touching the heatsink). */
function l298(b, x, y) {
  const B = new Builder(), t = b.t, tabM = colorMat('#c4c7ca', 0.34, 1), bodyH0 = 3.8;
  B.rbox(19.6, 1.5, 17.4, 0.2, tabM, 0, -0.75, bodyH0);
  B.rbox(19.6, 4.7, 10.6, 0.35, M.epoxy, 0, -3.85, bodyH0);
  for (const sx of [-1, 1]) B.cyl(1.0, 4.74, M.epoxyGloss, sx * 9.8, -3.85, bodyH0 + 8.4, { axis: 'y', seg: 14 });   // moulding notches
  // mounting screw through the tab into the heatsink
  B.cyl(2.75, 0.5, M.steel, 0, -1.75, bodyH0 + 13.9, { axis: 'y', seg: 24 });
  B.cyl(2.3, 1.3, M.steel, 0, -2.4, bodyH0 + 13.9, { axis: 'y', seg: 24 });
  const slot = decal('#1a1b1e', 0.5);
  B.vplane(2.9, 0.5, slot, 0, -3.06, bodyH0 + 13.9, 270); B.vplane(0.5, 2.9, slot, 0, -3.062, bodyH0 + 13.9, 270);
  // marking
  B.vplane(16, 7, textMat({ w: 640, h: 280, bg: null, fg: '#a9a7a0', roughness: 0.55,
    lines: [{ t: 'L298N', size: 118, y: 0.36, weight: 600 }, { t: 'GK0PV VW CHN 135', size: 50, y: 0.8, weight: 500 }] }), 0, -6.21, bodyH0 + 5.2, 270);
  // 15 staggered leads: odd pins bend forward (front row), even pins go straight down (rear row)
  const L = b.local(x, y, 0), yF = -8.0, yR = -4.0;
  for (let i = 1; i <= 15; i++) {
    const px = (i - 8) * 1.27, front = i % 2 === 1, py = front ? yF : yR;
    const [bx, by] = L(px, py); b.th(bx, by, { d: 1.7, hole: 0.9, square: i === 1 });
    if (front) {
      B.box(0.6, 0.38, t + 1.3 + 2.4, M.tin, px, yF, -t - 1.3);
      B.box(0.6, 3.6, 0.38, M.tin, px, (yF + yR) / 2 + 0.3, 2.05);
      B.box(0.6, 0.38, bodyH0 - 2.0, M.tin, px, yR + 0.9, 2.1);
    } else B.box(0.6, 0.38, t + 1.3 + bodyH0 + 0.2, M.tin, px, yR, -t - 1.3);
    solderJoint(B, px, py, 0, { r: 0.72, hgt: 0.5, rp: 0.3, seg: 10 });
    solderJoint(B, px, py, -t, { r: 0.8, hgt: 0.65, flip: true, rp: 0.3, seg: 10 });
  }
  return b.place(B.build('l298n'), x, y);
}

/** 78M05 regulator in D-PAK (TO-252): leads towards local −y, heat tab towards +y. */
function dpak(b, { x, y, rot = 0, text = ['78M05'] }) {
  const B = new Builder(), L = b.local(x, y, rot);
  const pad = (lx, ly, w, h) => { const [bx, by] = L(lx, ly); b.pad(bx, by, w, h, { rot, finish: 'tin' }); };
  pad(0, 1.5, 6.4, 6.4);
  B.box(5.4, 1.3, 0.55, M.tin, 0, 3.9, 0.03);
  B.rbox(6.5, 6.1, 2.3, 0.22, M.epoxy, 0, 0.3, 0.04);
  for (const sx of [-2.28, 2.28]) {
    pad(sx, -4.75, 1.3, 2.4);
    B.box(0.8, 0.9, 0.45, M.tin, sx, -3.15, 0.95);
    B.box(0.8, 0.45, 1.2, M.tin, sx, -3.75, 0.2);
    B.box(0.8, 1.5, 0.3, M.tin, sx, -4.55, 0.03);
    B.box(0.9, 0.5, 0.25, M.solder, sx, -5.45, 0.02);
  }
  B.box(0.8, 0.6, 0.45, M.tin, 0, -3.0, 0.95);
  B.plane(5.6, 3.4, textMat({ w: 280, h: 170, bg: null, fg: '#a3a19b', lines: text }), 0, 0.3, 2.35);
  return b.place(B.build('dpak'), x, y, rot);
}

/** 0805 power LED with its own lens material and glow (driven by apply). Long axis along local x. */
function powerLed(b, { x, y, rot = 0 }) {
  const B = new Builder(), Lc = b.local(x, y, rot);
  const lens = new THREE.MeshStandardMaterial({ color: LED_OFF, roughness: 0.25, emissive: new THREE.Color(LED_ON), emissiveIntensity: 0, transparent: true, opacity: 0.92 });
  for (const sx of [-1, 1]) {
    const [bx, by] = Lc(sx * 1.05, 0); b.pad(bx, by, 1.0, 1.45, { rot, finish: 'tin' });
    B.box(0.42, 1.27, 0.5, M.tin, sx * 0.8, 0, 0.03);
    B.box(0.3, 1.0, 0.22, M.solder, sx * 1.12, 0, 0.02);
  }
  B.box(1.96, 1.25, 0.32, M.white, 0, 0, 0.03);
  B.rbox(1.3, 1.16, 0.56, 0.2, lens, 0, 0, 0.3);
  const glow = glowSprite(LED_ON, 7.5);
  glow.material = glow.material.clone(); glow.material.opacity = 0; glow.visible = false; glow.raycast = () => {};
  glow.position.set(0, 2.2, 0); glow.center.set(0.5, 0.5 + 1.3 / 7.5);
  B.add(glow);
  return { group: b.place(B.build('power-led'), x, y, rot), lens, glow };
}

export default {
  id: 'motor-driver',
  name: 'L298N motor driver',
  category: 'Actuators',
  blurb: 'H-bridge: lets a board drive two motors.',
  about: 'A dual H-bridge: small logic signals on IN1–IN4 switch the motor supply onto OUT1–OUT4, so each motor can run forwards or backwards, and PWM on ENA / ENB sets its speed. '
    + 'Feed the motor supply (up to 12 V here) into 12V and GND, and always join GND with the controller ground. '
    + 'The chip drops about 2 V and gets hot — hence the heatsink — and a motor must never be powered from a GPIO pin directly.',
  plug: 'post',
  pinPlug: { '12V': 'pad', GND: 'pad', '5V': 'pad', OUT1: 'pad', OUT2: 'pad', OUT3: 'pad', OUT4: 'pad' },
  defaults: { on: false },
  interact: null,

  build(opts = {}) {
    const HO = 3.2;
    const b = new Board({
      w: S, h: S, t: 1.6, r: 1.6, theme: 'red', finish: 'tin', quality: opts.quality ?? 1,
      holes: [[HO, HO], [S - HO, HO], [HO, S - HO], [S - HO, S - HO]].map(([x, y]) => ({ x, y, d: 3.0, ring: 4.6 })),
    });

    // ── screw terminals ──
    const tPwr = screwTerminal(b, { x: 13.4, y: 4.3, rot: 0, n: 3 });
    const tL = screwTerminal(b, { x: 4.3, y: 21, rot: 270, n: 2 });
    const tR = screwTerminal(b, { x: S - 4.3, y: 21, rot: 90, n: 2 });
    const PWR = [['12V', 'motor supply input, 5–12 V (up to 35 V with the 5V-EN jumper removed)', 'pwr', '+12V'], ['GND', 'ground — shared with the controller', 'gnd', 'GND'],
      ['5V', '5 V from the on-board 78M05 regulator (output) — or logic supply input when the jumper is off', 'pwr', '+5V']];
    tPwr.screws.forEach(([sx, sy], i) => { b.pin(sx, sy, PWR[i][0], PWR[i][1], PWR[i][2]); b.text(PWR[i][3], sx, 9.05, { size: 0.85 }); });
    b.pin(...tL.screws[0], 'OUT1', 'motor A terminal 1', 'dig'); b.pin(...tL.screws[1], 'OUT2', 'motor A terminal 2', 'dig');
    b.pin(...tR.screws[1], 'OUT3', 'motor B terminal 1', 'dig'); b.pin(...tR.screws[0], 'OUT4', 'motor B terminal 2', 'dig');
    b.text('OUT1', 9.45, tL.screws[0][1], { size: 0.85, rot: 90 }); b.text('OUT2', 9.45, tL.screws[1][1], { size: 0.85, rot: 90 });
    b.text('OUT3', S - 9.45, tR.screws[1][1], { size: 0.85, rot: 270 }); b.text('OUT4', S - 9.45, tR.screws[0][1], { size: 0.85, rot: 270 });

    // ── control header ──
    const hp = { x: 29.9, y: 3.0, nx: 6, type: 'male', pin1: false };
    header(b, hp);
    const CTL = [['ENA', 'enable / PWM speed of motor A (HIGH = on)', 'ctl'], ['IN1', 'direction input 1 of motor A', 'dig'], ['IN2', 'direction input 2 of motor A', 'dig'],
      ['IN3', 'direction input 1 of motor B', 'dig'], ['IN4', 'direction input 2 of motor B', 'dig'], ['ENB', 'enable / PWM speed of motor B (HIGH = on)', 'ctl']];
    headerPinPositions(hp).forEach(([px, py], i) => { b.pin(px, py, ...CTL[i]); b.text(CTL[i][0], px, 5.55, { size: 0.72 }); });

    // ── L298N + heatsink ──
    const HSY = 26.6;
    heatsink(b, S / 2, HSY);
    l298(b, S / 2, HSY);
    b.rect(S / 2, HSY - 4.2, 21.2, 9.6, { lw: 0.15 });

    // ── flyback diodes: 4 + 4 ──
    [28.6, 31.5, 34.4, 37.3].forEach((dy, i) => {
      diode(b, { x: 8.0, y: dy, rot: i % 2 ? 180 : 0, pkg: 'sma', text: 'M7' });
      diode(b, { x: S - 8.0, y: dy, rot: i % 2 ? 0 : 180, pkg: 'sma', text: 'M7' });
    });
    for (const dx of [5.75, 10.25, S - 5.75, S - 10.25]) b.trace([[dx, 28.6], [dx, 37.3]], { w: 0.9 });
    b.trace([[5.75, 28.6], [5.2, 26.6], [5.2, 23.54]], { w: 0.9 }); b.trace([[S - 5.75, 28.6], [S - 5.2, 26.6], [S - 5.2, 23.54]], { w: 0.9 });
    b.trace([[10.25, 28.6], [11.4, 26.4], [11.4, 22.6], [12.61, 22.6]], { w: 0.7 }); b.trace([[S - 10.25, 28.6], [S - 11.4, 26.4], [S - 11.4, 22.6], [S - 12.61, 22.6]], { w: 0.7 });

    // ── regulator, bulk capacitors, jumper, small parts ──
    capElec(b, { x: 11.0, y: 13.6, d: 6.3, h: 7.7, text: ['220', '35V'] });
    capElec(b, { x: 33.4, y: 12.6, d: 6.3, h: 7.7, rot: 180, text: ['220', '35V'] });
    dpak(b, { x: 25.2, y: 13.1, text: ['78M05', 'CJ 2B'] });
    cap(b, { x: 18.6, y: 14.0, rot: 90, size: '0805', color: 'tan' });
    const jp = { x: 3.4, y: 11.6, rot: 90, nx: 2, type: 'male', pin1: false };
    header(b, jp); jumper(b, { x: jp.x, y: jp.y, rot: 90, color: 'black' });
    b.text('5V', 3.4, 7.9, { size: 0.7 }); b.text('EN', 3.4, 6.9, { size: 0.7 });
    res(b, { x: 40.2, y: 7.8, rot: 90, size: '0805', text: '102' });
    const led = powerLed(b, { x: 40.2, y: 11.3, rot: 90 });
    b.text('PWR', 40.2, 13.7, { size: 0.7 });
    b.trace([[40.2, 8.8], [40.2, 10.2]], { w: 0.4 });
    b.trace([[13.4, 5.2], [13.4, 9.9], [15.15, 11.6], [15.15, 13.6]], { w: 0.9 });
    b.trace([[18.48, 5.2], [18.48, 7.4], [22.92, 7.4], [22.92, 8.3]], { w: 0.7 });
    b.trace([[27.48, 8.3], [27.48, 7.0], [38.6, 7.0], [40.2, 6.6]], { w: 0.4 });

    // short fan-out stubs with vias (the rest of the routing runs on the bottom side)
    headerPinPositions(hp).forEach(([px, py]) => { b.trace([[px, py], [px, 6.55]], { w: 0.3 }); b.via(px, 6.55); });
    for (const cx of [17.69, 20.23, 30.39]) { b.trace([[cx, HSY - 8.0], [cx, 17.0]], { w: 0.35 }); b.via(cx, 17.0); }
    b.trace([[15.15, HSY - 8.0], [15.15, 17.6], [16.4, 16.4], [16.4, 14.0], [15.15, 13.6]], { w: 0.6 });
    b.trace([[6.85, 13.6], [5.6, 13.6], [4.6, 12.87], [3.4, 12.87]], { w: 0.6 });
    b.trace([[29.25, 12.6], [28.6, 12.6], [28.45, 13.6]], { w: 0.6 });
    for (const [vx, vy] of [[19.9, 9.9], [20.9, 11.2], [29.6, 17.2], [36.3, 8.4], [14.2, 18.0], [38.4, 15.0]]) b.via(vx, vy);

    // ── silkscreen ──
    b.text('L298N', 40.3, 31.6, { size: 1.35, rot: 90, weight: 700 });
    b.text('MOTOR DRIVER', 2.55, 31.8, { size: 0.82, rot: 90 });
    b.text('C1', 11.0, 18.0, { size: 0.6 }); b.text('U2', 29.3, 16.4, { size: 0.6 }); b.text('R1', 38.4, 7.8, { size: 0.55, rot: 90 });

    // ── bottom side: copper + legend ──
    const chipF = Array.from({ length: 8 }, (_, i) => [S / 2 + (2 * i + 1 - 8) * 1.27, HSY - 8.0]);
    const hdr = headerPinPositions(hp);
    b.bus(hdr, [chipF[4], chipF[2], chipF[3], chipF[5], chipF[6], chipF[7]].sort((p, q) => p[0] - q[0]), { w: 0.35, side: 'bottom' });
    b.trace([[8.32, 5.2], [8.32, 12], [3.4, 12.87]], { w: 1.2, side: 'bottom' });
    b.trace([[8.32, 12], [8.32, 16.5], [12.61, 18.6]], { w: 1.2, side: 'bottom' });
    b.trace([[13.4, 5.2], [13.4, 10.5], [18, 14], [21.5, 18.6]], { w: 1.2, side: 'bottom' });
    for (const sgn of [-1, 1]) {
      const X = (v) => S / 2 + sgn * v;
      b.trace([[X(16.3), 23.54], [X(12.2), 23.54], [X(10.4), 22.6], [X(7.62), 22.6]], { w: 1.1, side: 'bottom' });
      b.trace([[X(16.3), 18.46], [X(11.5), 18.46], [X(8.89), 18.6]], { w: 1.1, side: 'bottom' });
    }
    b.text('L298N', S / 2, 33, { size: 2.6, side: 'bottom', weight: 700 });
    b.text('DUAL H-BRIDGE MOTOR DRIVER', S / 2, 29.6, { size: 1.0, side: 'bottom' });
    b.text('OUT1  OUT2', 9.6, 21, { size: 0.9, side: 'bottom', rot: 90 }); b.text('OUT3  OUT4', S - 9.6, 21, { size: 0.9, side: 'bottom', rot: 270 });
    b.text('+12V  GND  +5V', 13.4, 9.6, { size: 0.9, side: 'bottom' });
    b.text('ENA IN1 IN2 IN3 IN4 ENB', 29.9, 6.2, { size: 0.72, side: 'bottom' });

    const built = b.finish();
    built.actors = { lens: led.lens, glow: led.glow };
    const dispose = built.dispose.bind(built);
    built.dispose = () => { dispose(); led.lens.dispose(); led.glow.material.dispose(); };
    return built;
  },

  apply(built, s) {
    const a = built.actors, on = !!s.on;
    a.lens.color.set(on ? LED_ON : LED_OFF);
    a.lens.emissiveIntensity = on ? 2.4 : 0;
    a.glow.visible = on;
    a.glow.material.opacity = on ? 0.6 : 0;
  },

  tick() {},
};
