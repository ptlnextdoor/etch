// Lab module: piezo buzzer Ø12 × 9.5 mm on a small breakout with a driver transistor and an activity LED.
import * as THREE from 'three';
import { Board } from '../../core/board.js';
import { Builder, M, colorMat, textMat, glowSprite } from '../../core/builder.js';
import { header, headerPinPositions, res, sot23, solderJoint } from '../../core/parts-ic.js';

const LED_COLOR = '#3dff6e';
const RINGS = 3, R_IN = 1.5, R_OUT = 5.6;            // "sound ripples" on the top face, radii in mm

/** Glow billboard kept `lift` mm in front of its anchor (towards the camera). Own material: apply() drives opacity. */
function lensGlow(color, lift) {
  const s = glowSprite(color, 1);
  s.material = s.material.clone();
  s.material.opacity = 0; s.visible = false; s.scale.setScalar(0.001); s.raycast = () => {};
  const p = new THREE.Vector3(), c = new THREE.Vector3();
  s.onBeforeRender = (renderer, scene, camera) => {
    if (!s.parent) return;
    p.copy(s.position).applyMatrix4(s.parent.matrixWorld);
    c.setFromMatrixPosition(camera.matrixWorld).sub(p).normalize().multiplyScalar(lift).add(p);
    s.matrixWorld.setPosition(c);
  };
  return s;
}

/** Buzzer can: black moulded cylinder with the sound hole, two pins on a 7.6 mm pitch. Origin = centre. */
function buzzerCan(t) {
  const B = new Builder(), abs = colorMat('#141516', 0.44), H = 9.5, g = 0.3;
  B.lathe([[5.3, 0], [5.9, 0], [6.0, 0.1], [6.0, H - 0.75], [5.93, H - 0.4], [5.72, H - 0.14], [5.4, H - 0.03], [5.0, H],
    [1.42, H], [1.22, H - 0.08], [1.15, H - 0.25], [1.15, H - 2.6], [0, H - 2.6]], abs, 0, 0, g, 56);
  B.cyl(1.12, 0.03, M.cavity, 0, 0, g + H - 2.58, { seg: 24 });
  // moulded details on the top face: a shallow ring and the "+" over the positive pin
  B.lathe([[4.25, 0], [4.25, 0.05], [4.45, 0.05], [4.45, 0]], colorMat('#1d1e20', 0.34), 0, 0, g + H - 0.02, 56);
  B.plane(1.5, 1.5, textMat({ w: 64, h: 64, bg: null, fg: '#3a3c3f', lines: [{ t: '+', size: 62, weight: 700 }], roughness: 0.4 }), 3.1, 0, g + H + 0.012);
  for (const x of [-3.8, 3.8]) {
    B.cyl(0.32, g + t + 1.5, M.tin, x, 0, -t - 1.5, { seg: 12 });
    solderJoint(B, x, 0, -t, { r: 0.85, hgt: 0.65, flip: true, rp: 0.34 });
  }
  return B.build('buzzer');
}

/** 0603 chip LED with its own lens material (it lights up at run time). Long axis along x. */
function chipLed(lensMat) {
  const B = new Builder();
  B.box(1.56, 0.8, 0.22, M.white, 0, 0, 0.03);
  for (const s of [-1, 1]) B.box(0.32, 0.84, 0.26, M.tin, s * 0.65, 0, 0.02);
  B.rbox(1.0, 0.76, 0.42, 0.14, lensMat, 0, 0, 0.2);
  return B.build('activity-led');
}

/** Make the model show state `s` (LED, glow, ripple rings at the current phase). */
function show(built, s) {
  const a = built.actors, on = !!s.on && (s.freq ?? 1000) > 0;
  a.ledMat.emissiveIntensity = on ? 2.4 : 0;
  a.glow.visible = on;
  a.glow.material.opacity = on ? 0.5 : 0;
  a.glow.scale.setScalar(on ? 5.5 : 0.001);
  a.rings.forEach((r, i) => {
    const ph = (a.phase + i / RINGS) % 1, rad = R_IN + (R_OUT - R_IN) * ph;
    r.visible = on;
    r.scale.set(rad, 1, rad);
    r.material.opacity = on ? 0.42 * Math.sin(Math.PI * ph) ** 0.8 * (1 - 0.5 * ph) : 0;
  });
}

export default {
  id: 'buzzer',
  name: 'Piezo buzzer module',
  category: 'Outputs',
  blurb: 'Beeps and plays simple melodies.',
  about: 'A passive piezo buzzer: it makes a tone at whatever frequency you switch its pin, so tone(pin, 440) plays the note A. '
    + 'Wire SIG to a digital pin and GND to ground; the on-board transistor takes the load off the pin. '
    + 'It is loud for its size — keep melodies short, and remember that a passive buzzer stays silent on a steady HIGH.',
  plug: 'post',
  defaults: { on: false, freq: 1000 },
  interact: null,

  build(opts = {}) {
    const b = new Board({ w: 16, h: 27, t: 1.6, r: 1.3, theme: 'red', finish: 'tin', quality: opts.quality ?? 1 });
    const BX = 8, BY = 18.6;

    const hp = { x: 8, y: 4.5, nx: 2, type: 'male' };
    header(b, hp);
    const pins = headerPinPositions(hp);
    b.pin(pins[0][0], pins[0][1], 'SIG', 'signal — square wave from a digital pin (tone)', 'dig');
    b.pin(pins[1][0], pins[1][1], 'GND', 'ground', 'gnd');
    b.text('SIG', pins[0][0] - 0.75, 1.5, { size: 0.9 });
    b.text('GND', pins[1][0] + 0.75, 1.5, { size: 0.9 });

    // buzzer footprint
    const bp = [[BX - 3.8, BY], [BX + 3.8, BY]];
    bp.forEach(([x, y], i) => b.th(x, y, { d: 1.9, hole: 0.9, square: i === 1 }));
    b.circle(BX, BY, 6.35, { lw: 0.18 });
    b.text('+', BX + 6.2, BY + 5.0, { size: 1.1 });

    // driver: SIG → 1 kΩ → base; collector → buzzer (−); buzzer (+) and the activity LED hang on SIG
    const QX = 3.3, QY = 9.6;
    sot23(b, { x: QX, y: QY, n: 3, text: 'J3Y' });
    res(b, { x: pins[0][0], y: 8.3, rot: 90, size: '0603', text: '102' });
    b.trace([pins[0], [pins[0][0], 7.5]], { w: 0.35 });
    b.trace([[pins[0][0], 9.1], [pins[0][0], 9.9], [5.6, 9.9], [QX + 0.95, 8.6], [QX + 0.95, QY - 1.0]], { w: 0.3 });
    b.trace([[QX, QY + 1.0], [QX, 11.6], [bp[0][0], 12.5], bp[0]], { w: 0.4 });
    b.trace([[QX - 0.95, QY - 1.0], [QX - 0.95, 7.4]], { w: 0.4 }); b.via(QX - 0.95, 7.4);
    b.trace([[QX - 0.95, 7.4], [QX - 0.95, 6.4], [pins[1][0] - 1.9, 3.0], [pins[1][0] - 1.0, 3.0], pins[1]], { w: 0.5, side: 'bottom' });
    b.trace([[pins[0][0], 6.5], [12.7, 6.5], [12.7, 7.3]], { w: 0.3 });
    b.trace([[10.7, 6.5], [10.7, 12.0], [bp[1][0], 13.1], bp[1]], { w: 0.4 });
    res(b, { x: 12.7, y: 8.1, rot: 90, size: '0603', text: '471' });
    const LEDX = 12.7, LEDY = 11.0;
    b.pad(LEDX, LEDY - 0.8, 0.95, 0.9, { finish: 'tin' }); b.pad(LEDX, LEDY + 0.8, 0.95, 0.9, { finish: 'tin' });
    b.trace([[12.7, 8.9], [12.7, LEDY - 0.8]], { w: 0.3 });
    b.trace([[LEDX, LEDY + 0.8], [14.2, LEDY + 0.8], [14.2, 9.6]], { w: 0.3 }); b.via(14.2, 9.6);

    // silkscreen
    b.text('Q1', QX, 12.0, { size: 0.62 });
    b.text('R1', 8.6, 8.3, { size: 0.62 });
    b.text('D1', 14.4, 12.2, { size: 0.62 });
    b.text('BUZZER', 14.75, 4.4, { size: 0.8, rot: 90 });
    b.text('PIEZO BUZZER', 8, 13, { size: 0.8, side: 'bottom' });
    b.text('SIG', pins[0][0] - 2.3, 4.5, { size: 0.85, side: 'bottom' });
    b.text('GND', pins[1][0] + 2.3, 4.5, { size: 0.85, side: 'bottom' });

    const can = b.place(buzzerCan(b.t), BX, BY);

    // activity LED: own material + glow
    const ledMat = new THREE.MeshStandardMaterial({
      color: '#cfe8d2', roughness: 0.25, transparent: true, opacity: 0.9, emissive: new THREE.Color(LED_COLOR), emissiveIntensity: 0,
    });
    const led = b.place(chipLed(ledMat), LEDX, LEDY, 90);
    const glow = lensGlow(LED_COLOR, 0.9);
    glow.position.set(0, 0.45, 0);
    led.add(glow);

    // sound ripples: thin additive rings lying on the top face, animated in tick()
    const ringMat = [], rings = [];
    const rg = new THREE.RingGeometry(0.93, 1.0, 64); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < RINGS; i++) {
      const m = new THREE.MeshBasicMaterial({ color: '#fff0c8', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
      const r = new THREE.Mesh(i ? rg.clone() : rg, m); r.name = 'sound-ring'; r.position.y = 0.3 + 9.5 + 0.03 + i * 0.004; r.visible = false; r.raycast = () => {};
      can.add(r); rings.push(r); ringMat.push(m);
    }

    const built = b.finish();
    built.actors = { can, led, ledMat, glow, rings, phase: 0 };
    const dispose = built.dispose.bind(built);
    built.dispose = () => { dispose(); ledMat.dispose(); glow.material.dispose(); ringMat.forEach((m) => m.dispose()); };
    return built;
  },

  apply(built, s) { show(built, s); },

  tick(built, s, dt) {
    if (!s.on) return;
    // higher notes ripple a little faster
    const f = Math.max(50, Math.min(8000, Number(s.freq) || 1000));
    built.actors.phase = (built.actors.phase + dt * (0.7 + 0.35 * Math.log2(f / 220))) % 1;
    show(built, s);
  },
};
