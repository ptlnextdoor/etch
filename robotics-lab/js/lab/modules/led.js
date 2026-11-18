// Lab module: single 5 mm through-hole LED on a small breakout (KY-style), series resistor on board.
import * as THREE from 'three';
import { Board } from '../../core/board.js';
import { Builder, M, colorMat, glowSprite } from '../../core/builder.js';
import { header, headerPinPositions, res, solderJoint } from '../../core/parts-ic.js';

const COLORS = {
  red:    { lens: '#da1a24', glow: '#ff2a1c' },
  green:  { lens: '#2cc44e', glow: '#30ff58' },
  yellow: { lens: '#f4c21c', glow: '#ffc21a' },
  blue:   { lens: '#3672f0', glow: '#3f7bff' },
  white:  { lens: '#eef1f2', glow: '#fff1d6', gain: 0.3, halo: 0.45 },   // white blows out quickly: hold it back so the lens keeps its shape
};
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

/**
 * Glow billboard that always sits `lift` mm in front of its anchor (towards the camera), so the lens it belongs to
 * never cuts through it, while anything nearer to the camera still hides it. Own material: apply() drives opacity.
 */
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

/** 5 mm (T-1¾) LED standing on its two legs; origin = centre between the legs, anode at −x, cathode (rim flat) at +x. */
function led5(lensMat, t, h0 = 0.9) {
  const B = new Builder();
  // epoxy lens: flange Ø5.9 × 1 with a flat on the cathode side, body Ø5, hemispherical dome — 8.6 mm tall
  const pr = [[0, 0], [2.86, 0], [2.95, 0.09], [2.95, 0.91], [2.87, 1.0], [2.57, 1.0], [2.5, 1.07], [2.5, 6.1]];
  for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI / 2; pr.push([2.5 * Math.cos(a), 6.1 + 2.5 * Math.sin(a)]); }
  const g = new THREE.LatheGeometry(pr.map((q) => new THREE.Vector2(Math.max(q[0], 1e-4), q[1])), 56);
  const P = g.attributes.position, N = g.attributes.normal, FLAT = 2.56;
  for (let i = 0; i < P.count; i++) {
    if (P.getX(i) > FLAT) { P.setX(i, FLAT); const y = P.getY(i); if (y > 0.05 && y < 0.95) N.setXYZ(i, 1, 0, 0); }
  }
  B.geo(g, lensMat, 0, 0, h0);
  // lead frame seen through the epoxy: anode post, cathode anvil with the reflector cup and the die
  const fm = colorMat('#c9ccce', 0.3, 1), zi = h0 + 0.3;
  B.box(0.5, 0.42, 4.0, fm, -1.27, 0, zi);
  B.box(1.0, 0.42, 1.5, fm, -1.52, 0, zi + 2.6);
  B.box(0.5, 0.42, 3.2, fm, 1.27, 0, zi);
  B.box(2.5, 0.42, 1.7, fm, 0.55, 0, zi + 2.9);
  B.lathe([[0.5, 0], [0.92, 0.55], [0.86, 0.6], [0.5, 0.12], [0, 0.12]], fm, 0, 0, zi + 4.6, 20);
  B.box(0.34, 0.34, 0.16, colorMat('#d9c56c', 0.4, 0.3), 0, 0, zi + 4.7);
  { const dx = -1.5, dh = -0.75, len = Math.hypot(dx, dh), w = new THREE.CylinderGeometry(0.03, 0.03, len, 6);
    w.rotateZ(Math.atan2(dx, -dh) + Math.PI); B.geo(w, M.gold, dx / 2, 0, zi + 4.86 + dh / 2 + 0.25); }
  // legs through the board + solder
  for (const x of [-1.27, 1.27]) {
    B.box(0.5, 0.5, zi + t + 1.2, M.tin, x, 0, -t - 1.2);
    solderJoint(B, x, 0, 0, { r: 0.72, hgt: 0.5, rp: 0.3 });
    solderJoint(B, x, 0, -t, { r: 0.8, hgt: 0.6, flip: true, rp: 0.3 });
  }
  return B.build('led-5mm');
}

export default {
  id: 'led',
  name: '5 mm LED module',
  category: 'Outputs',
  blurb: 'Lights up when its pin goes HIGH.',
  about: 'A single 5 mm LED with its 220 Ω current-limiting resistor already on the board, so it can go straight to a GPIO pin. '
    + 'Wire SIG to a digital (or PWM) pin and GND to ground; a PWM pin dims it. '
    + 'Never connect a bare LED without a resistor — it will draw too much current and can damage the pin.',
  plug: 'post',
  defaults: { on: false, level: 1 },
  interact: null,

  build(opts = {}) {
    const col = COLORS[opts.color] || COLORS.red;
    const b = new Board({ w: 15, h: 19, t: 1.6, r: 1.2, theme: 'black', finish: 'tin', quality: opts.quality ?? 1 });
    const LX = 7.5, LY = 14.0;

    // header + pins
    const hp = { x: 7.5, y: 4.5, nx: 2, type: 'male' };
    header(b, hp);
    const pins = headerPinPositions(hp);
    b.pin(pins[0][0], pins[0][1], 'SIG', 'signal — LED anode through the 220 Ω resistor', 'dig');
    b.pin(pins[1][0], pins[1][1], 'GND', 'ground — LED cathode', 'gnd');
    b.text('SIG', pins[0][0] - 0.75, 1.5, { size: 0.9 });
    b.text('GND', pins[1][0] + 0.75, 1.5, { size: 0.9 });

    // series resistor and copper
    res(b, { x: 3.6, y: 9.2, rot: 90, size: '0805', text: '221' });
    b.trace([pins[0], [pins[0][0], 6.3], [3.6, 7.4], [3.6, 8.2]], { w: 0.4 });
    b.trace([[3.6, 10.2], [3.6, 11.6], [LX - 1.27, LY - 1.2], [LX - 1.27, LY]], { w: 0.4 });
    b.trace([pins[1], [pins[1][0], LY]], { w: 0.5 });
    b.th(LX - 1.27, LY, { d: 1.6, hole: 0.8, square: true });
    b.th(LX + 1.27, LY, { d: 1.6, hole: 0.8 });

    // silkscreen
    { const pts = [], a0 = Math.acos(2.75 / 3.3);
      for (let i = 0; i <= 40; i++) { const a = a0 + (i / 40) * (2 * Math.PI - 2 * a0); pts.push([LX + 3.3 * Math.cos(a), LY + 3.3 * Math.sin(a)]); }
      b.line(pts, { w: 0.18, closed: true }); }
    b.text('+', LX - 4.4, LY + 1.5, { size: 1.0 });
    b.text('R1', 1.55, 9.2, { size: 0.7, rot: 90 });
    b.text('LED', 11.6, 9.9, { size: 1.15 });
    b.text('5 mm', 11.6, 8.3, { size: 0.65 });
    b.text('LED MODULE', 7.5, 9, { size: 1.0, side: 'bottom' });
    b.text('SIG', pins[0][0] - 2.2, 4.5, { size: 0.9, side: 'bottom' });
    b.text('GND', pins[1][0] + 2.2, 4.5, { size: 0.9, side: 'bottom' });

    // the LED itself: own lens material (apply() changes it)
    const lensMat = new THREE.MeshPhysicalMaterial({
      color: col.lens, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.06,
      transparent: true, opacity: 0.8, emissive: new THREE.Color(col.glow), emissiveIntensity: 0.1,
    });
    const H0 = 0.9;
    const lamp = b.place(led5(lensMat, b.t, H0), LX, LY);
    const glow = lensGlow(col.glow, 3.1);
    glow.position.set(0, H0 + 6.0, 0);
    lamp.add(glow);
    const pool = lightPool(b, LX, LY, 8, col.glow);

    const built = b.finish();
    built.actors = { lamp, lensMat, glow, pool, gain: col.gain ?? 1, halo: col.halo ?? 1 };
    const dispose = built.dispose.bind(built);
    built.dispose = () => { dispose(); lensMat.dispose(); glow.material.dispose(); pool.material.dispose(); };
    return built;
  },

  apply(built, s) {
    const a = built.actors, k = s.on ? clamp01(s.level ?? 1) : 0, lit = k > 0.004;
    a.lensMat.emissiveIntensity = 0.1 + 2.0 * a.gain * Math.pow(k, 0.8);
    a.lensMat.opacity = 0.8 + 0.17 * Math.min(1, k * 4);
    a.glow.visible = lit;
    a.glow.material.opacity = lit ? (0.22 + 0.36 * k) * a.halo : 0;
    a.glow.scale.setScalar(lit ? 7 + 11 * k : 0.001);
    a.pool.visible = lit;
    a.pool.material.opacity = 0.55 * k;
  },
};
