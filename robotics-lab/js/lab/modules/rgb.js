// Lab module: 5 mm RGB LED (common cathode, diffused lens, 4 legs) with three series resistors (KY-016 style).
import * as THREE from 'three';
import { Board } from '../../core/board.js';
import { Builder, M, colorMat, glowSprite } from '../../core/builder.js';
import { header, headerPinPositions, res, solderJoint } from '../../core/parts-ic.js';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
// what each die really emits (linear RGB) — a pure (0, 0, 1) blue would look far too dark
const DIE = { r: [1.0, 0.05, 0.02], g: [0.06, 1.0, 0.14], b: [0.05, 0.22, 1.0] };
const _c = new THREE.Color(), WHITE = new THREE.Color('#f3f4f2');

/** Glow billboard kept `lift` mm in front of its anchor (towards the camera) so the lens never cuts through it. Own material. */
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

/** Soft additive light pool painted on the PCB around (cx, cy), clipped to the board rectangle. */
function lightPool(b, cx, cy, R, color) {
  const g = new THREE.PlaneGeometry(b.w - 0.8, b.h - 0.8); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + (pos.getX(i) + b.w / 2 - cx) / (2 * R), 0.5 + (-pos.getZ(i) + b.h / 2 - cy) / (2 * R));
  const mat = new THREE.MeshBasicMaterial({
    map: glowSprite(color, 1).material.map, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const m = new THREE.Mesh(g, mat); m.name = 'light-pool'; m.position.y = 0.02; m.visible = false; m.raycast = () => {};
  b.root.add(m);
  return m;
}

const LEGS = [-1.905, -0.635, 0.635, 1.905];   // R, common cathode, G, B (1.27 mm pitch)

/** 5 mm RGB LED; origin = centre of the leg row, legs along x, rim flat at +x. */
function rgbLed(lensMat, t, h0 = 0.9) {
  const B = new Builder();
  const pr = [[0, 0], [2.86, 0], [2.95, 0.09], [2.95, 0.91], [2.87, 1.0], [2.57, 1.0], [2.5, 1.07], [2.5, 6.1]];
  for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI / 2; pr.push([2.5 * Math.cos(a), 6.1 + 2.5 * Math.sin(a)]); }
  const g = new THREE.LatheGeometry(pr.map((q) => new THREE.Vector2(Math.max(q[0], 1e-4), q[1])), 56);
  const P = g.attributes.position, N = g.attributes.normal, FLAT = 2.56;
  for (let i = 0; i < P.count; i++) {
    if (P.getX(i) > FLAT) { P.setX(i, FLAT); const y = P.getY(i); if (y > 0.05 && y < 0.95) N.setXYZ(i, 1, 0, 0); }
  }
  B.geo(g, lensMat, 0, 0, h0);
  // lead frame: three anode posts and the cathode anvil carrying the cup with three dice
  const fm = colorMat('#c9ccce', 0.3, 1), zi = h0 + 0.3;
  LEGS.forEach((x, i) => {
    B.box(0.42, 0.4, i === 1 ? 3.4 : 3.9, fm, x, 0, zi);
    if (i !== 1) B.box(0.62, 0.4, 0.9, fm, x + (i === 0 ? 0.1 : -0.02), 0, zi + 3.3);
  });
  B.box(1.5, 0.4, 1.5, fm, -0.1, 0.42, zi + 3.2);
  B.lathe([[0.55, 0], [1.0, 0.5], [0.94, 0.55], [0.55, 0.12], [0, 0.12]], fm, 0, 0.42, zi + 4.7, 20);
  const die = colorMat('#d9c56c', 0.4, 0.3);
  for (const [dx, dy] of [[-0.3, 0.3], [0.3, 0.3], [0, 0.72]]) B.box(0.24, 0.24, 0.14, die, dx, dy, zi + 4.8);
  for (const x of LEGS) {
    B.box(0.45, 0.45, zi + t + 1.2, M.tin, x, 0, -t - 1.2);
    solderJoint(B, x, 0, 0, { r: 0.5, hgt: 0.45, rp: 0.26, seg: 12 });
    solderJoint(B, x, 0, -t, { r: 0.55, hgt: 0.55, flip: true, rp: 0.26, seg: 12 });
  }
  return B.build('rgb-led-5mm');
}

export default {
  id: 'rgb',
  name: 'RGB LED module',
  category: 'Outputs',
  blurb: 'Three LEDs in one lens: mixes any colour.',
  about: 'A common-cathode RGB LED: red, green and blue dice share one diffused 5 mm lens and one ground leg. '
    + 'Wire R, G and B to three PWM pins and GND to ground, then mix colours by changing each duty cycle. '
    + 'The 150 Ω resistors are already on the board — a bare RGB LED needs one on every colour leg.',
  plug: 'post',
  defaults: { r: 0, g: 0, b: 0 },
  interact: null,

  build(opts = {}) {
    const b = new Board({ w: 15, h: 20, t: 1.6, r: 1.2, theme: 'red', finish: 'tin', quality: opts.quality ?? 1 });
    const LX = 7.5, LY = 15.4;

    const hp = { x: 7.5, y: 4.5, nx: 4, type: 'male' };
    header(b, hp);
    const pins = headerPinPositions(hp);
    b.pin(pins[0][0], pins[0][1], 'R', 'red anode (150 Ω on board) — PWM', 'dig');
    b.pin(pins[1][0], pins[1][1], 'G', 'green anode (150 Ω on board) — PWM', 'dig');
    b.pin(pins[2][0], pins[2][1], 'B', 'blue anode (150 Ω on board) — PWM', 'dig');
    b.pin(pins[3][0], pins[3][1], 'GND', 'common cathode — ground', 'gnd');
    ['R', 'G', 'B'].forEach((s, i) => b.text(s, pins[i][0], 1.5, { size: 1.0 }));
    b.text('GND', pins[3][0] + 0.45, 1.5, { size: 0.9 });

    // three series resistors, one per colour
    const legX = LEGS.map((x) => LX + x), RY = 8.7;
    [0, 1, 2].forEach((i) => {
      res(b, { x: pins[i][0], y: RY, rot: 90, size: '0603', text: '151' });
      b.trace([pins[i], [pins[i][0], RY - 0.8]], { w: 0.35 });
    });
    b.trace([[pins[0][0], RY + 0.8], [pins[0][0], 11.6], [legX[0], 11.6 + (legX[0] - pins[0][0])], [legX[0], LY]], { w: 0.3 });
    b.trace([[pins[1][0], RY + 0.8], [pins[1][0], 10.4], [legX[2], 10.4 + (legX[2] - pins[1][0])], [legX[2], LY]], { w: 0.3 });
    b.trace([[pins[2][0], RY + 0.8], [pins[2][0], 10.6], [legX[3], 10.6 + (legX[3] - pins[2][0])], [legX[3], LY]], { w: 0.3 });
    // the cathode returns to GND on the back of the board
    b.trace([[legX[1], LY], [legX[1], 13.2], [pins[3][0], 13.2 - (pins[3][0] - legX[1])], pins[3]], { w: 0.5, side: 'bottom' });
    legX.forEach((x, i) => b.th(x, LY, { d: 1.0, hole: 0.58, square: i === 1 }));

    // silkscreen
    { const pts = [], a0 = Math.acos(2.75 / 3.3);
      for (let i = 0; i <= 40; i++) { const a = a0 + (i / 40) * (2 * Math.PI - 2 * a0); pts.push([LX + 3.3 * Math.cos(a), LY + 3.3 * Math.sin(a)]); }
      b.line(pts, { w: 0.18, closed: true }); }
    b.text('RGB', 12.3, 9.6, { size: 1.15 });
    b.text('LED', 12.3, 7.9, { size: 0.8 });
    b.text('R1', 1.75, RY, { size: 0.62 });
    b.text('RGB LED · COMMON CATHODE', 7.5, 10.2, { size: 0.62, side: 'bottom' });
    ['R', 'G', 'B', 'GND'].forEach((s, i) => b.text(s, pins[i][0] + (i === 3 ? 0.3 : 0), 1.6, { size: 0.85, side: 'bottom' }));

    // the LED: own lens material, colour is set in apply()
    const lensMat = new THREE.MeshPhysicalMaterial({
      color: WHITE.clone(), roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08,
      transparent: true, opacity: 0.84, emissive: new THREE.Color(0, 0, 0), emissiveIntensity: 0,
    });
    const H0 = 0.9;
    const lamp = b.place(rgbLed(lensMat, b.t, H0), LX, LY);
    const glow = lensGlow('#ffffff', 3.1);
    glow.position.set(0, H0 + 6.0, 0);
    lamp.add(glow);
    const pool = lightPool(b, LX, LY, 7.5, '#ffffff');

    const built = b.finish();
    built.actors = { lamp, lensMat, glow, pool };
    const dispose = built.dispose.bind(built);
    built.dispose = () => { dispose(); lensMat.dispose(); glow.material.dispose(); pool.material.dispose(); };
    return built;
  },

  apply(built, s) {
    const a = built.actors, r = clamp01(s.r), g = clamp01(s.g), bl = clamp01(s.b);
    const k = Math.max(r, g, bl), lit = k > 0.004;
    // additive mix of the three dice, normalised to a hue; k carries the brightness
    let cr = r * DIE.r[0] + g * DIE.g[0] + bl * DIE.b[0], cg = r * DIE.r[1] + g * DIE.g[1] + bl * DIE.b[1], cb = r * DIE.r[2] + g * DIE.g[2] + bl * DIE.b[2];
    const m = Math.max(cr, cg, cb, 1e-6); cr /= m; cg /= m; cb /= m;
    const w = lit ? Math.min(cr, cg, cb) : 0;      // how white the mix is: white light blows out quickly, so hold it back
    // keep the hue saturated after tone mapping: push the weaker channels down a little
    _c.setRGB(lit ? Math.pow(cr, 1.5) : 0, lit ? Math.pow(cg, 1.5) : 0, lit ? Math.pow(cb, 1.5) : 0);
    a.lensMat.emissive.copy(_c);
    a.lensMat.emissiveIntensity = lit ? (0.12 + 1.3 * Math.pow(k, 0.8)) * (1 - 0.74 * w) : 0;
    a.lensMat.color.copy(WHITE); if (lit) a.lensMat.color.lerp(_c, 0.85 * Math.min(1, k * 4));
    a.lensMat.opacity = 0.84 + 0.13 * Math.min(1, k * 4);
    a.glow.visible = lit;
    a.glow.material.color.copy(lit ? _c : WHITE);
    a.glow.material.opacity = lit ? (0.2 + 0.3 * k) * (1 - 0.7 * w) : 0;
    a.glow.scale.setScalar(lit ? 7 + 10 * k : 0.001);
    a.pool.visible = lit;
    a.pool.material.color.copy(lit ? _c : WHITE);
    a.pool.material.opacity = 0.4 * k;
  },
};
