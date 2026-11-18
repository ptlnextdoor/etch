// Lab module: photoresistor (LDR) light-sensor board — 5 mm LDR, LM393 comparator, trimmer, power LED, 3-pin header.
import * as THREE from 'three';
import { Board } from '../../core/board.js';
import { Builder, M, colorMat, textMat, glowSprite } from '../../core/builder.js';
import { header, headerPinPositions, soic, passives, solderJoint } from '../../core/parts-ic.js';

const LDR_R = 2.55, LDR_T = 1.9, LDR_H0 = 4.6;       // disc radius, thickness, height of its underside above the board

/** Face of the photocell: tan ceramic, red-brown CdS serpentine between two comb electrodes, two lead rivets. */
function ldrFace() {
  return textMat({
    w: 256, h: 256, bg: '#d6c8a2', lines: [], roughness: 0.55,
    draw(g, w, h) {
      const c = w / 2, R = w / 2;
      g.fillStyle = '#cbbb92'; g.beginPath(); g.arc(c, c, R * 0.97, 0, 7); g.fill();
      g.save(); g.beginPath(); g.arc(c, c, R * 0.86, 0, 7); g.clip();
      g.fillStyle = '#c9bd9d'; g.fillRect(0, 0, w, h);                     // electrode film
      const n = 8, x0 = c - R * 0.6, x1 = c + R * 0.6, y0 = c - R * 0.7, dy = R * 1.4 / (n - 1);
      g.lineJoin = 'round'; g.lineCap = 'round';
      const path = () => { g.beginPath(); for (let i = 0; i < n; i++) { const y = y0 + i * dy, a = i % 2 ? x1 : x0, b = i % 2 ? x0 : x1; if (!i) g.moveTo(a, y); else g.lineTo(a, y); g.lineTo(b, y); } };
      g.strokeStyle = '#7d2f1a'; g.lineWidth = R * 0.115; path(); g.stroke();   // CdS track
      g.strokeStyle = '#b04a2a'; g.lineWidth = R * 0.06; path(); g.stroke();
      g.restore();
      g.fillStyle = '#9fa3a5';
      for (const s of [-1, 1]) { g.beginPath(); g.arc(c, c + s * R * 0.72, R * 0.085, 0, 7); g.fill(); }   // lead ends (top / bottom of the canvas = ±y)
    },
  });
}

/** 5 mm photoresistor standing on two legs, face up. Local origin = midpoint between the legs (legs at y = ±1.7). */
function photocell(b, x, y, own) {
  const B = new Builder(), t = b.t, body = colorMat('#c7b88f', 0.5);
  for (const s of [-1, 1]) {
    b.th(x, y + s * 1.7, { d: 1.7, hole: 0.8 });
    B.cyl(0.24, LDR_H0 + 0.3 + t + 1.3, M.tin, 0, s * 1.7, -t - 1.3, { seg: 12 });
    solderJoint(B, 0, s * 1.7, 0, { r: 0.75, hgt: 0.6, rp: 0.26, seg: 12 });
    solderJoint(B, 0, s * 1.7, -t, { r: 0.75, hgt: 0.6, rp: 0.26, flip: true, seg: 12 });
  }
  B.lathe([[0.01, 0], [LDR_R - 0.3, 0], [LDR_R - 0.06, 0.1], [LDR_R, 0.32], [LDR_R, LDR_T - 0.3], [LDR_R - 0.08, LDR_T - 0.08], [LDR_R - 0.3, LDR_T]], body, 0, 0, LDR_H0, 40);
  const face = new THREE.CircleGeometry(LDR_R - 0.28, 40); face.rotateX(-Math.PI / 2);
  B.geo(face, ldrFace(), 0, 0, LDR_H0 + LDR_T + 0.004);
  // clear epoxy coat: a shallow glossy dome (own material)
  const coat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, transparent: true, opacity: 0.2, depthWrite: false, specularIntensity: 1 });
  own.push(coat);
  B.lathe([[LDR_R - 0.02, LDR_T - 0.25], [LDR_R - 0.12, LDR_T + 0.08], [LDR_R - 0.5, LDR_T + 0.28], [LDR_R - 1.3, LDR_T + 0.4], [0.01, LDR_T + 0.44]], coat, 0, 0, LDR_H0, 40);
  const g = b.place(B.build('ldr'), x, y);
  g.traverse((o) => { if (o.isMesh && o.material === coat) { o.castShadow = false; o.renderOrder = 2; } });
  return g;
}

/** Blue single-turn trimmer (3362 style) with a slotted brass adjuster. */
function trimmer(b, x, y, rot = 0) {
  const B = new Builder(), S = 6.8, Hh = 4.9, so = 0.35, t = b.t, top = so + Hh;
  const blue = colorMat('#1f62cf', 0.36), brass = colorMat('#c9a04a', 0.3, 1);
  B.rbox(S, S, Hh, 0.4, blue, 0, 0, so);
  B.rbox(S - 1.6, S - 1.6, 0.3, 0.1, colorMat('#184fa8', 0.5), 0, 0, 0.08);                        // stand-off rim
  B.lathe([[2.05, 0], [2.0, 0.07], [1.72, 0.07], [1.66, -0.12]], colorMat('#17479a', 0.5), 0.25, 0.25, top, 32);   // collar round the adjuster
  B.cyl(1.62, 0.34, brass, 0.25, 0.25, top - 0.14, { seg: 32 });
  for (const r of [0, 90]) B.box(2.7, 0.5, 0.05, colorMat('#3b2a0c', 0.7), 0.25, 0.25, top + 0.2, r + 25);   // cross slot
  B.plane(2.2, 0.95, textMat({ w: 128, h: 56, bg: null, fg: '#eef2f8', lines: [{ t: '103', size: 46, weight: 700 }] }), -1.9, -2.6, top + 0.006);
  const P = b.local(x, y, rot);
  for (const [lx, ly] of [[-2.54, -2.3], [0, 2.3], [2.54, -2.3]]) {
    const [px, py] = P(lx, ly); b.th(px, py, { d: 1.7, hole: 0.8 });
    B.cyl(0.3, 1.2 + t + so, M.tin, lx, ly, -t - 1.2, { seg: 10 });
    solderJoint(B, lx, ly, -t, { r: 0.75, hgt: 0.6, rp: 0.32, flip: true, seg: 12 });
  }
  b.rect(x, y, S + 0.5, S + 0.5, { lw: 0.15, rot });
  return b.place(B.build('trimmer'), x, y, rot);
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
  id: 'ldr',
  name: 'Photoresistor (LDR) module',
  category: 'Sensors',
  blurb: 'Senses how bright the light is.',
  about: 'A photoresistor is a resistor whose resistance drops as more light falls on it; with a fixed resistor it forms a voltage divider, so the AO pin gives a voltage that follows the brightness. ' +
    'Wire VCC and GND to power and AO to an analog input. On a 3.3 V board power the module from 3.3 V so AO never exceeds what the pin can take.',
  plug: 'post',
  defaults: { value: 0.6 },
  interact: { slider: { key: 'value', min: 0, max: 1, unit: '', label: 'Light level' } },

  build(opts = {}) {
    const W = 33, H = 14, CY = H / 2;
    const b = new Board({ w: W, h: H, t: 1.6, r: 0.9, theme: 'blue', finish: 'tin', quality: opts.quality ?? 1, holes: [{ x: 26.4, y: CY, d: 3.0 }] });
    const own = [];

    // ── header (left edge) + labels ──
    const hp = { x: 2.2, y: CY, rot: 90, nx: 3, type: 'male' };
    header(b, hp);
    const pins = headerPinPositions(hp);                       // bottom → top
    const NAMES = ['AO', 'GND', 'VCC'], KIND = ['ana', 'gnd', 'pwr'];
    const FN = ['analog output: voltage that follows the light level', 'ground', 'power, 3.3 – 5 V'];
    pins.forEach(([px, py], i) => { b.pin(px, py, NAMES[i], FN[i], KIND[i]); b.text(NAMES[i], 4.15, py, { size: 0.82, align: 'left' }); });

    // ── parts ──
    const PX = 13.4, ICX = 20.9, LX = 30.3;
    trimmer(b, PX, CY);
    soic(b, { x: ICX, y: CY, rot: 90, n: 8, text: ['LM393', '2114'] });
    const pwr = powerLed(b, 8.0, 12.2, 0, '#ff3b30');
    passives(b, [
      ['res', 11.0, 12.5, 0, { text: '102' }],            // LED series resistor
      ['res', 8.0, 1.8, 0, { text: '103' }],              // divider resistor for the LDR
      ['res', 11.0, 1.5, 0, { text: '103' }],
      ['cap', ICX, 12.3, 0, { size: '0603' }],
      ['cap', ICX, 1.7, 0, { size: '0603', color: 'brown' }],
      ['res', 17.3, 12.5, 0, { text: '104' }],
    ]);
    b.text('PWR', 8.0, 10.75, { size: 0.55 });
    b.text('LDR', 26.4, 11.6, { size: 0.9, weight: 700 });
    b.circle(LX, CY, LDR_R + 0.35, { lw: 0.15 });
    photocell(b, LX, CY, own);

    // ── copper ──
    b.trace([pins[2], [3.6, 12.6], [7.2, 12.6]], { w: 0.4 });
    b.trace([[8.8, 12.2], [10.2, 12.5]], { w: 0.3 }); b.trace([[11.8, 12.5], [16.5, 12.5]], { w: 0.3 });
    b.trace([[18.1, 12.5], [20.1, 12.3]], { w: 0.3 });
    b.trace([pins[0], [3.6, 1.6], [7.2, 1.8]], { w: 0.3 });
    b.trace([[8.8, 1.8], [10.2, 1.5]], { w: 0.3 }); b.trace([[11.8, 1.5], [20.1, 1.7]], { w: 0.3 });
    b.trace([[21.7, 1.7], [24.0, 1.7], [28.6, 4.6], [LX, CY - 1.7]], { w: 0.35 });
    b.trace([[21.7, 12.3], [24.0, 12.3], [28.6, 9.4], [LX, CY + 1.7]], { w: 0.35 });
    b.trace([pins[1], [5.2, CY], [6.6, 8.6], [9.4, 8.6]], { w: 0.4 });
    b.via(9.4, 8.6); b.via(17.6, 2.9); b.via(24.3, 9.6); b.via(24.3, 4.4);

    b.text('LIGHT SENSOR', 15, 9.6, { size: 1.0, side: 'bottom', weight: 700 });
    b.text('LDR + LM393', 15, 7.6, { size: 0.8, side: 'bottom' });
    pins.forEach(([, py], i) => b.text(NAMES[i], 4.15, py, { size: 0.82, align: 'left', side: 'bottom' }));

    // ── run-time visuals: light falling on the cell ──
    const light = glowSprite('#ffe6a0', 1);
    light.material = light.material.clone(); light.material.opacity = 0; light.visible = false; light.raycast = () => {};
    light.position.set(0, LDR_H0 + LDR_T + 2.2, 0); light.renderOrder = 3;
    const lg = new THREE.Group(); lg.name = 'light'; lg.add(light);
    b.place(lg, LX, CY);

    const built = b.finish();
    built.actors = { pwr, light };
    const dispose = built.dispose;
    built.dispose = () => { dispose(); own.forEach((m) => m.dispose()); pwr.lens.dispose(); pwr.glow.material.dispose(); light.material.dispose(); };
    return built;
  },

  /** value 0…1 = how much light reaches the cell (soft warm halo over the LDR). Optional `on: true` lights the power LED. */
  apply(built, s) {
    const a = built.actors, v = Math.min(1, Math.max(0, Number(s.value) || 0));
    a.light.material.opacity = 0.5 * v; a.light.visible = v > 0.01;
    a.light.scale.setScalar(7 + 5 * v);
    const { lens, glow, on, off } = a.pwr, lit = !!s.on;
    lens.color.copy(lit ? on : off); lens.emissiveIntensity = lit ? 2.2 : 0; lens.opacity = lit ? 0.96 : 0.9;
    glow.visible = lit; glow.material.opacity = lit ? 0.55 : 0;
  },
};
