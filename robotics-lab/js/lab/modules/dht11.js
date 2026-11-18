// Lab module: DHT11 temperature / humidity sensor on a 3-pin breakout (pull-up resistor + power LED).
import * as THREE from 'three';
import { Board } from '../../core/board.js';
import { Builder, M, colorMat, glowSprite } from '../../core/builder.js';
import { header, headerPinPositions, res, solderJoint } from '../../core/parts-ic.js';

const BW = 12, BL = 15.5, BH = 5.5;          // sensor body: width (x) × length (y) × height

/** Rounded-rectangle outline as explicit points (no duplicated start / end point → clean bevels on extruded holes). */
function rrPts(w, h, r, cx = 0, cy = 0, n = 4) {
  const pts = [], q = Math.PI / 2;
  const corners = [[cx + w / 2 - r, cy - h / 2 + r, -q], [cx + w / 2 - r, cy + h / 2 - r, 0], [cx - w / 2 + r, cy + h / 2 - r, q], [cx - w / 2 + r, cy - h / 2 + r, 2 * q]];
  for (const [x, y, a0] of corners) for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * q; pts.push(new THREE.Vector2(x + Math.cos(a) * r, y + Math.sin(a) * r)); }
  return pts;
}

/** The blue DHT11 housing with its grid of vent slots, lying on its back; 4 legs leave the lower end and drop into the board. */
function sensor(b, x, y) {
  const B = new Builder(), t = b.t, so = 0.3;
  const blue = colorMat('#3791e0', 0.46), blueBack = colorMat('#2f82cf', 0.55);
  // back cover (slightly smaller → a fine seam line all round, like the real two-piece shell)
  B.rbox(BW - 0.3, BL - 0.3, 1.5, 0.3, blueBack, 0, 0, so);
  // front shell: one extrusion with the vent slots going right through; a dark floor sits a little below the face
  const bv = 0.22, shell = new THREE.Shape(rrPts(BW - 2 * bv, BL - 2 * bv, 0.75, 0, 0, 7));
  const cols = 4, rows = 6, hw = 1.75, hh = 1.45, px = 2.45, py = 2.12, oy = 0.1;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const cx = (i - (cols - 1) / 2) * px, cy = (j - (rows - 1) / 2) * py + oy;
    shell.holes.push(new THREE.Path(rrPts(hw + 2 * bv, hh + 2 * bv, 0.3 + bv, cx, cy, 4)));
  }
  B.extrude(shell, BH - 1.4, blue, 0, 0, so + 1.4, 0, { bevel: bv, seg: 5 });
  B.plane(BW - 1.6, BL - 1.6, colorMat('#0b1826', 0.85), 0, 0, so + BH - 1.25);                 // shadowy interior
  B.rbox(5.0, 6.0, 0.4, 0.1, colorMat('#4d6072', 0.7), -1.0, 1.2, so + BH - 1.6);                // the sensing element, barely glimpsed through the slots
  // legs: out of the lower end, then down through the board
  const ly = -BL / 2 - 1.75;
  for (let i = 0; i < 4; i++) {
    const lx = (i - 1.5) * 2.54;
    b.th(x + lx, y + ly, { d: 1.6, hole: 0.8, square: i === 0 });
    B.box(0.5, 2.0, 0.26, M.tin, lx, -BL / 2 - 0.85, so + 0.75);
    B.cyl(0.13, 0.5, M.tin, lx, ly, so + 0.88, { axis: 'x', seg: 10 });                          // rounded knee
    B.box(0.5, 0.26, so + 0.88 + t + 1.0, M.tin, lx, ly, -t - 1.0);
    solderJoint(B, lx, ly, 0, { r: 0.72, hgt: 0.55, rp: 0.3, seg: 12 });
    solderJoint(B, lx, ly, -t, { r: 0.72, hgt: 0.55, rp: 0.3, flip: true, seg: 12 });
  }
  return b.place(B.build('dht11'), x, y);
}

/** 0603 chip LED with its OWN lens material + glow sprite so it can be switched at run time. */
function powerLed(b, x, y, rot, color) {
  const B = new Builder(), L = 1.6, Wd = 0.8, Hh = 0.6, bh = 0.22, c = new THREE.Color(color);
  const off = c.clone().lerp(new THREE.Color('#f4f1e6'), 0.55);
  const lens = new THREE.MeshStandardMaterial({ color: off.clone(), roughness: 0.25, emissive: c, emissiveIntensity: 0, transparent: true, opacity: 0.9 });
  B.box(L - 0.04, Wd, bh, M.white, 0, 0, 0.02);
  for (const s of [-1, 1]) B.rbox(0.32, Wd + 0.04, bh + 0.06, 0.03, M.tin, s * (L / 2 - 0.15), 0, 0.01);
  B.rbox(L - 0.52, Wd * 0.94, Hh - bh + 0.05, 0.14, lens, 0, 0, bh - 0.03);
  const glow = glowSprite(color, L * 3.6);
  glow.material = glow.material.clone(); glow.material.opacity = 0; glow.visible = false; glow.raycast = () => {};
  glow.position.set(0, Hh + L * 0.6, 0); glow.center.set(0.5, 0.5 + 0.25 / 3.6);
  B.add(glow);
  const P = b.local(x, y, rot);
  for (const s of [-1, 1]) { const [px, py] = P(s * 0.8, 0); b.pad(px, py, 0.8, 0.95, { rot, finish: 'tin' }); }
  b.place(B.build('led'), x, y, rot);
  return { lens, glow, on: c, off };
}

export default {
  id: 'dht11',
  name: 'DHT11 temperature & humidity sensor',
  category: 'Sensors',
  blurb: 'Reads air temperature and humidity.',
  about: 'Inside the blue grille sit a humidity-sensing film and a thermistor with a tiny chip that sends both readings as 40 bits over a single DATA wire. ' +
    'Wire VCC to 3.3 – 5 V, GND to ground and DATA to any digital pin (the pull-up resistor is already on the board). It is slow and coarse: read it no more than once a second and expect ±2 °C, ±5 % RH.',
  plug: 'post',
  defaults: { temp: 24, hum: 45 },
  interact: { slider: { key: 'temp', min: 0, max: 50, unit: '°C', label: 'Air temperature' } },

  build(opts = {}) {
    const W = 14.5, H = 31, CX = W / 2;
    const b = new Board({ w: W, h: H, t: 1.6, r: 0.9, theme: 'black', finish: 'tin', quality: opts.quality ?? 1, holes: [{ x: CX, y: 9.3, d: 3.0 }] });

    // ── header + labels ──
    const hp = { x: CX, y: 2.3, nx: 3, type: 'male' };
    header(b, hp);
    const pins = headerPinPositions(hp);
    const NAMES = ['VCC', 'DATA', 'GND'], KIND = ['pwr', 'dig', 'gnd'];
    const FN = ['power, 3.3 – 5 V', 'single-wire data: temperature + humidity, one reading per second at most', 'ground'];
    pins.forEach(([px, py], i) => { b.pin(px, py, NAMES[i], FN[i], KIND[i]); b.text(NAMES[i], px + (i - 1) * 0.35, 5.0, { size: 0.72 }); });

    // ── sensor ──
    const SY = 22.35, legY = SY - BL / 2 - 1.75, legX = [0, 1, 2, 3].map((i) => CX + (i - 1.5) * 2.54);
    b.rect(CX, SY, BW + 0.7, BL + 0.7, { lw: 0.15, r: 0.9 });
    sensor(b, CX, SY);

    // ── passives ──
    const RX = 2.5, LX = W - 2.5;
    res(b, { x: RX, y: 9.9, rot: 90, text: '103' });                    // 10 k pull-up on DATA
    res(b, { x: LX, y: 7.6, rot: 90, text: '102' });                    // LED series resistor
    const pwr = powerLed(b, LX, 10.9, 90, '#ff3b30');
    b.text('R1', RX, 7.9, { size: 0.55 }); b.text('PWR', LX - 1.25, 10.9, { size: 0.5, rot: 90 });

    // ── copper ──
    b.trace([[legX[0], legY], [1.1, legY - 1.5], [1.1, 5.4], [2.7, 3.8], pins[0]], { w: 0.45 });
    b.trace([[legX[1], legY], [4.55, legY - 1.45], [4.55, 6.9], [pins[1][0], 4.2], pins[1]], { w: 0.3 });
    b.trace([[legX[3], legY], [W - 1.1, legY - 1.5], [W - 1.1, 5.4], [W - 2.7, 3.8], pins[2]], { w: 0.45 });
    b.trace([[1.1, 10.7], [RX, 10.7]], { w: 0.3 }); b.trace([[RX, 9.1], [4.55, 9.1]], { w: 0.3 });
    b.trace([[LX, 11.7], [LX, 12.3], [W - 1.1, 12.3]], { w: 0.3 }); b.trace([[LX, 10.1], [LX, 8.4]], { w: 0.3 });
    b.trace([[LX, 6.8], [LX, 6.2], [9.6, 6.2], [9.6, 11.2], [4.9, 11.2], [3.4, 12.0], [legX[0], legY]], { w: 0.25, side: 'bottom' });
    b.via(LX, 6.2);

    b.text('DHT11', CX, 22, { size: 1.6, side: 'bottom', weight: 700 });
    b.text('TEMP + HUMIDITY', CX, 19.6, { size: 0.8, side: 'bottom' });
    NAMES.forEach((s, i) => b.text(s, pins[i][0] + (i - 1) * 0.35, 5.0, { size: 0.72, side: 'bottom' }));

    const built = b.finish();
    built.actors = { pwr };
    const dispose = built.dispose;
    built.dispose = () => { dispose(); pwr.lens.dispose(); pwr.glow.material.dispose(); };
    return built;
  },

  /** The sensor has nothing that moves; `on: true` (optional) lights the red power LED. temp / hum are read by the mission. */
  apply(built, s) {
    const { lens, glow, on, off } = built.actors.pwr, lit = !!s.on;
    lens.color.copy(lit ? on : off); lens.emissiveIntensity = lit ? 2.2 : 0; lens.opacity = lit ? 0.96 : 0.9;
    glow.visible = lit; glow.material.opacity = lit ? 0.55 : 0;
  },
};
