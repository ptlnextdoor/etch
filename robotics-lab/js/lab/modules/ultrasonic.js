// Lab module: HC-SR04 ultrasonic distance sensor (45 × 20 mm), lying flat with both transducers facing up.
import * as THREE from 'three';
import { Board } from '../../core/board.js';
import { Builder, M, colorMat, textMat } from '../../core/builder.js';
import { header, headerPinPositions, crystalHC49, soic, passives, solderJoint } from '../../core/parts-ic.js';

const CAN_R = 8, CAN_H = 12, MESH_R = 6.55, MESH_H = CAN_H - 1.0;

/** Woven wire grille seen through the mouth of a transducer (dark, with a faint hint of the cone behind it). */
function meshMat() {
  return textMat({
    w: 512, h: 512, bg: '#0b0b0c', lines: [], roughness: 0.42, metalness: 0.55,
    draw(g, w, h) {
      const c = w / 2, gr = g.createRadialGradient(c, c, 0, c, c, c);
      gr.addColorStop(0, '#2c2d2f'); gr.addColorStop(0.3, '#1b1c1d'); gr.addColorStop(0.34, '#101011'); gr.addColorStop(1, '#070708');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const n = 30, st = w / n;
      g.lineCap = 'butt';
      for (let i = 0; i <= n; i++) {           // wires: darker underside first, then the bright crown of each wire
        const p = i * st;
        g.strokeStyle = 'rgba(40,42,44,0.95)'; g.lineWidth = st * 0.5;
        g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.moveTo(0, p); g.lineTo(w, p); g.stroke();
      }
      for (let i = 0; i <= n; i++) {
        const p = i * st;
        g.strokeStyle = 'rgba(132,136,140,0.9)'; g.lineWidth = st * 0.2;
        g.beginPath(); g.moveTo(p, 0); g.lineTo(p, h); g.moveTo(0, p); g.lineTo(w, p); g.stroke();
      }
      g.fillStyle = 'rgba(190,194,198,0.55)';   // glints where the wires cross
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) g.fillRect(i * st - st * 0.1, j * st - st * 0.1, st * 0.2, st * 0.2);
    },
  });
}

/** One 16 mm aluminium transducer can with the rolled rim and the grille recessed inside it. Origin = can axis on the board. */
function transducer(b, x, y) {
  const B = new Builder(), R = CAN_R, H = CAN_H, t = b.t;
  const alu = colorMat('#e9eaeb', 0.34, 0.82), aluIn = colorMat('#8d9093', 0.5, 1);
  B.cyl(R - 0.25, 0.3, M.blackMatte, 0, 0, 0.01, { seg: 48 });                       // insulating base washer
  B.lathe([
    [R - 0.35, 0.25], [R - 0.08, 0.34], [R, 0.6], [R, 1.25], [R - 0.14, 1.38], [R - 0.14, 1.52], [R, 1.66],   // crimp groove near the base
    [R, H - 0.75], [R - 0.06, H - 0.42], [R - 0.2, H - 0.17], [R - 0.42, H - 0.04], [R - 0.7, H],             // rolled rim
    [R - 0.98, H - 0.05], [R - 1.18, H - 0.2], [R - 1.3, H - 0.45], [R - 1.34, H - 0.75],
  ], alu, 0, 0, 0, 64);
  B.lathe([[R - 1.34, H - 0.75], [R - 1.36, MESH_H + 0.12], [MESH_R, MESH_H + 0.02]], aluIn, 0, 0, 0, 64);    // shaded inner wall
  const disc = new THREE.CircleGeometry(MESH_R + 0.05, 64); disc.rotateX(-Math.PI / 2);
  B.geo(disc, meshMat(), 0, 0, MESH_H);
  B.lathe([[MESH_R - 0.45, MESH_H + 0.03], [MESH_R - 0.2, MESH_H + 0.16], [MESH_R + 0.08, MESH_H + 0.2], [MESH_R + 0.1, MESH_H + 0.03]], aluIn, 0, 0, 0, 64); // grille retaining ring
  for (const s of [-1, 1]) {                                                         // the two leads, soldered underneath
    b.th(x, y + s * 5, { d: 2.2, hole: 1.0 });
    B.cyl(0.4, 1.5, M.tin, 0, s * 5, -t - 1.3, { seg: 10 });
    solderJoint(B, 0, s * 5, -t, { r: 1.0, hgt: 0.75, flip: true, rp: 0.42 });
  }
  b.circle(x, y, R + 0.45, { lw: 0.18 });
  return b.place(B.build('transducer'), x, y);
}

/** Expanding "sound wave" rings above a can (own materials — driven from tick; they hide themselves when tick stops being called). */
function pingRings(b, x, y, color, live, n = 3) {
  const grp = new THREE.Group(); grp.name = 'ping';
  const geo = new THREE.RingGeometry(0.9, 1, 56); geo.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < n; i++) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = CAN_H - 0.4; m.visible = false; m.castShadow = false; m.receiveShadow = false; m.raycast = () => {};
    m.onBeforeRender = () => { if (performance.now() - live.stamp > 450) { mat.opacity = 0; m.visible = false; } };
    grp.add(m); rings.push(m);
  }
  b.place(grp, x, y);
  return { rings, geo };
}

export default {
  id: 'ultrasonic',
  name: 'HC-SR04 ultrasonic sensor',
  category: 'Sensors',
  blurb: 'Measures distance with sound echoes.',
  about: 'One "eye" (T) sends a short burst of 40 kHz sound, the other (R) listens for the echo; the Echo pin stays HIGH for as long as the sound was travelling, so distance = time × 0.034 / 2 cm. ' +
    'Wire VCC to 5 V, GND to ground, Trig to a digital output and Echo to a digital input. Echo is a 5 V signal — on a 3.3 V board (ESP32, Pico, Raspberry Pi) put a level shifter or a voltage divider in between.',
  plug: 'post',
  defaults: { distance: 60 },
  interact: { slider: { key: 'distance', min: 2, max: 200, unit: 'cm', label: 'Distance to object' } },

  build(opts = {}) {
    const W = 45, H = 20;
    const b = new Board({
      w: W, h: H, t: 1.6, r: 1.0, theme: 'blue', finish: 'tin', quality: opts.quality ?? 1,
      holes: [[1.5, 1.5], [W - 1.5, 1.5], [1.5, H - 1.5], [W - 1.5, H - 1.5]].map(([x, y]) => ({ x, y, d: 1.8 })),
    });
    const TX = 9.5, RX = W - 9.5, CY = 10;

    // ── header + labels ──
    const hp = { x: W / 2, y: 2.3, nx: 4, type: 'male' };
    header(b, hp);
    const pins = headerPinPositions(hp);
    const NAMES = ['VCC', 'Trig', 'Echo', 'GND'], SILK = ['Vcc', 'Trig', 'Echo', 'Gnd'];
    const FN = ['power, 5 V', 'trigger input: a 10 µs HIGH pulse starts a measurement', 'echo output: HIGH for as long as the sound travelled (5 V logic)', 'ground'];
    const KIND = ['pwr', 'dig', 'dig', 'gnd'];
    pins.forEach(([px, py], i) => {
      b.pin(px, py, NAMES[i], FN[i], KIND[i]);
      b.text(SILK[i], px, 5.0, { size: 0.68 });
    });

    // ── silkscreen ──
    b.text('HC-SR04', W / 2, 8.6, { size: 1.5, weight: 700 });
    b.text('T', 4.2, 1.75, { size: 1.55, weight: 700 });
    b.text('R', W - 4.2, 1.75, { size: 1.55, weight: 700 });
    b.line([[W / 2 - 4.6, 6.6], [W / 2 + 4.6, 6.6]], { w: 0.15 });

    // ── copper: a few visible tracks between header, crystal and the transducers ──
    const cx0 = W / 2 - 2.44, cx1 = W / 2 + 2.44, cyX = 15.9;
    b.trace([pins[0], [pins[0][0] - 1.6, 4.2], [pins[0][0] - 1.6, 11.2], [cx0 - 2.6, 12.6]], { w: 0.5 });
    b.trace([pins[3], [pins[3][0] + 1.6, 4.2], [pins[3][0] + 1.6, 11.2], [cx1 + 2.6, 12.6]], { w: 0.5 });
    b.trace([[cx0, cyX], [cx0, 12.3], [cx0 + 0.9, 11.4]], { w: 0.3 }); b.via(cx0 + 0.9, 11.4);
    b.trace([[cx1, cyX], [cx1, 12.3], [cx1 - 0.9, 11.4]], { w: 0.3 }); b.via(cx1 - 0.9, 11.4);
    b.via(pins[1][0], 6.2); b.via(pins[2][0], 6.2);
    b.via(W / 2 - 6.3, 18.6); b.via(W / 2 + 6.3, 18.6);

    // ── parts ──
    crystalHC49(b, { x: W / 2, y: cyX, text: '4.000' });
    transducer(b, TX, CY);
    transducer(b, RX, CY);

    // the electronics live on the back of the real board
    soic(b, { x: W / 2, y: 11.2, side: 'bottom', rot: 180, n: 14, text: ['LM324', '2114'] });
    soic(b, { x: 9.6, y: 10, side: 'bottom', rot: 180, n: 16, text: ['MAX232', 'CSE 2103'] });
    soic(b, { x: W - 9.3, y: 10.2, side: 'bottom', rot: 180, n: 14, text: ['EM78P153', 'S 2052'] });
    passives(b, [
      ['res', 16.6, 16.4, 0, { side: 'bottom', text: '103' }], ['res', 16.6, 14.6, 0, { side: 'bottom', text: '472' }],
      ['cap', 28.6, 16.4, 0, { side: 'bottom' }], ['cap', 28.6, 14.6, 0, { side: 'bottom' }],
      ['res', 16.2, 5.2, 90, { side: 'bottom', text: '102' }], ['cap', 29.0, 5.2, 90, { side: 'bottom', color: 'brown' }],
      ['sot23', 30.4, 9.8, 90, { side: 'bottom', text: 'J3Y' }], ['res', 3.2, 6.5, 90, { side: 'bottom', text: '104' }],
      ['cap', 3.2, 13.5, 90, { side: 'bottom' }], ['cap', W - 3.0, 13.5, 90, { side: 'bottom' }],
    ]);
    b.text('HC-SR04', W / 2, 17.6, { size: 1.3, side: 'bottom', weight: 700 });
    SILK.forEach((s, i) => b.text(s, pins[i][0], 5.0, { size: 0.62, side: 'bottom' }));

    // ── run-time "ping" visual ──
    const live = { stamp: -1e9 };
    const tx = pingRings(b, TX, CY, '#2a9df4', live), rx = pingRings(b, RX, CY, '#35c98a', live);

    const built = b.finish();
    built.actors = { tx: tx.rings, rx: rx.rings, live, clock: 0, distance: 60 };
    const dispose = built.dispose;
    built.dispose = () => {
      dispose();
      for (const m of [...tx.rings, ...rx.rings]) m.material.dispose();
    };
    return built;
  },

  apply(built, s) {
    built.actors.distance = Math.min(400, Math.max(2, Number(s.distance) || 2));
  },

  /** While the lab runs: sound rings leave the transmitter (T) and, a moment later, the echo falls back into the receiver (R). */
  tick(built, s, dt) {
    const a = built.actors;
    a.clock = (a.clock + dt) % 3600; a.live.stamp = performance.now();
    const d = a.distance, period = 0.9, delay = 0.12 + 0.5 * Math.min(1, d / 200);   // farther object → later, weaker echo
    const echo = 0.9 - 0.55 * Math.min(1, d / 200);
    const top = CAN_H - 0.4;
    a.tx.forEach((m, i) => {
      const ph = ((a.clock / period + i / a.tx.length) % 1 + 1) % 1;
      m.visible = true; m.scale.setScalar(2.2 + 5.2 * ph); m.position.y = top + 1 + 9 * ph;
      m.material.opacity = 0.75 * Math.min(1, ph * 7) * (1 - ph) ** 1.4;
    });
    a.rx.forEach((m, i) => {
      const ph = (((a.clock - delay) / period + i / a.rx.length) % 1 + 1) % 1, q = 1 - ph;   // q: 1 = far above, 0 = at the grille
      m.visible = true; m.scale.setScalar(2.2 + 5.2 * q); m.position.y = top + 1 + 9 * q;
      m.material.opacity = echo * Math.min(1, ph * 5) * Math.min(1, q * 5) * 0.8;
    });
  },
};
