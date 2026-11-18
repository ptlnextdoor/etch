// Lab module: 10 kΩ single-turn rotary potentiometer (RV09-style: blue body, steel frame) with a knurled pointer knob.
import * as THREE from 'three';
import { Board } from '../../core/board.js';
import { Builder, M, colorMat, rrShape } from '../../core/builder.js';
import { header, headerPinPositions, solderJoint } from '../../core/parts-ic.js';

const SWEEP = 270;                                   // degrees of travel: −135° … +135°
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

/** Fixed part: blue moulded body, steel frame with two mounting lugs, three terminals at the front (−y). Origin = shaft axis. */
function potBody(t) {
  const B = new Builder(), blue = colorMat('#1d63c4', 0.42), steel = colorMat('#c2c5c8', 0.3, 1);
  B.rbox(9.6, 9.8, 4.75, 0.35, blue, 0, 0, 0.25);
  B.rbox(7.4, 1.3, 2.2, 0.2, blue, 0, -5.2, 0.25);                       // terminal block at the front
  B.extrude(rrShape(9.8, 9.9, 0.6), 0.5, steel, 0, 0, 4.95, 0, { bevel: 0.1 });
  for (const s of [-1, 1]) {
    B.box(0.4, 4.6, 5.0, steel, s * 4.95, 0, 0.35);                      // frame straps down both sides
    B.box(0.4, 1.7, t + 1.5 + 0.6, steel, s * 4.95, 0, -t - 1.5);        // mounting lugs through the board
    solderJoint(B, s * 4.95, 0, -t, { r: 1.25, hgt: 0.8, flip: true, rp: 0.75 });
  }
  B.lathe([[3.75, 0], [3.75, 0.5], [3.55, 0.75], [3.4, 0.75], [3.4, 1.35], [3.25, 1.5], [2.9, 1.5]], steel, 0, 0, 5.45, 40);   // bushing
  for (const x of [-2.5, 0, 2.5]) {
    B.box(0.9, 0.3, 1.5 + t + 1.4, M.tin, x, -6.5, -t - 1.4);
    B.box(0.9, 1.0, 0.3, M.tin, x, -6.15, 1.2);
    solderJoint(B, x, -6.5, 0, { r: 0.85, hgt: 0.55, rp: 0.5 });
    solderJoint(B, x, -6.5, -t, { r: 0.9, hgt: 0.7, flip: true, rp: 0.48 });
  }
  return B.build('pot-body');
}

/** Rotating part: shaft + knurled knob with a white pointer line pointing to local +y. Origin = shaft axis. */
function potKnob() {
  const B = new Builder(), dark = colorMat('#26282b', 0.46), white = colorMat('#f5f4ee', 0.5);
  B.cyl(2.95, 1.3, colorMat('#d9d6cc', 0.5), 0, 0, 6.6, { seg: 32 });            // plastic shaft showing under the knob
  const N = 28, R = 3.9, s = new THREE.Shape();
  for (let i = 0; i < N * 2; i++) {
    const a = (i / (N * 2)) * Math.PI * 2, r = i % 2 ? R - 0.26 : R;
    i ? s.lineTo(r * Math.sin(a), r * Math.cos(a)) : s.moveTo(r * Math.sin(a), r * Math.cos(a));
  }
  s.closePath();
  const h0 = 7.5, kh = 7.2;
  B.extrude(s, kh, dark, 0, 0, h0, 0, { bevel: 0.3 });
  B.lathe([[R + 0.14, 0], [R + 0.14, 0.9], [R, 1.05]], dark, 0, 0, h0, 48);            // smooth skirt under the knurl
  B.cyl(3.2, 0.1, colorMat('#1b1c1e', 0.35), 0, 0, h0 + kh - 0.02, { seg: 40 }); // recessed top disc
  // pointer: a white line across the top to the rim, continuing down the side
  B.box(0.95, 3.5, 0.09, white, 0, 2.1, h0 + kh + 0.03);
  B.box(0.95, 0.16, kh - 1.6, white, 0, R + 0.02, h0 + 1.3);
  return B.build('pot-knob');
}

export default {
  id: 'pot',
  name: 'Potentiometer module (10 kΩ)',
  category: 'Inputs',
  blurb: 'A knob that outputs 0 V … VCC.',
  about: 'A 10 kΩ rotary potentiometer wired as a voltage divider: the wiper (OUT) slides between GND and VCC as you turn the knob. '
    + 'Wire VCC and GND to the supply and OUT to an analog input, then read 0…1023 with analogRead(). '
    + 'Power it from the logic voltage of your board — 5 V on OUT can damage a 3.3 V analog pin.',
  plug: 'post',
  defaults: { value: 0.5 },
  interact: 'knob',

  build(opts = {}) {
    const b = new Board({ w: 20, h: 28.5, t: 1.6, r: 1.4, theme: 'black', finish: 'tin', quality: opts.quality ?? 1 });
    const PX = 10, PY = 17.3;

    // header: clockwise rotation moves the wiper towards the right-hand terminal, so VCC sits on the right
    const hp = { x: 10, y: 4.5, nx: 3, type: 'male' };
    header(b, hp);
    const pins = headerPinPositions(hp);
    b.pin(pins[0][0], pins[0][1], 'GND', 'ground — low end of the resistive track', 'gnd');
    b.pin(pins[1][0], pins[1][1], 'OUT', 'wiper: analog voltage 0 V … VCC', 'ana');
    b.pin(pins[2][0], pins[2][1], 'VCC', 'supply: 3.3 V or 5 V — high end of the track', 'pwr');
    const lx = [pins[0][0] - 1.0, pins[1][0], pins[2][0] + 1.0];
    ['GND', 'OUT', 'VCC'].forEach((s, i) => b.text(s, lx[i], 1.5, { size: 0.9 }));
    b.line([[lx[0], 2.35], [pins[0][0] - 0.75, 3.2]], { w: 0.14 });
    b.line([[lx[2], 2.35], [pins[2][0] + 0.75, 3.2]], { w: 0.14 });

    // footprint
    const term = [-2.5, 0, 2.5].map((x) => [PX + x, PY - 6.5]);
    term.forEach(([x, y], i) => { b.th(x, y, { d: 1.9, hole: 1.1, square: i === 0 }); b.trace([pins[i], [pins[i][0], 7.2], [x, 8.0], [x, y]], { w: 0.45 }); });
    for (const s of [-1, 1]) b.th(PX + s * 4.95, PY, { d: 2.9, hole: 1.9 });

    // silkscreen: dial scale −135° … +135° with a tick every 10 %
    const R0 = 8.3, dir = (deg) => [Math.sin(deg * Math.PI / 180), Math.cos(deg * Math.PI / 180)];
    { const arc = [];
      for (let i = 0; i <= 54; i++) { const [sx, sy] = dir(-135 + i * 5); arc.push([PX + R0 * sx, PY + R0 * sy]); }
      b.line(arc, { w: 0.16 }); }
    for (let i = 0; i <= 10; i++) {
      const [sx, sy] = dir(-135 + i * 27), big = i % 5 === 0, r1 = R0 + (big ? 1.0 : 0.6);
      b.line([[PX + R0 * sx, PY + R0 * sy], [PX + r1 * sx, PY + r1 * sy]], { w: big ? 0.26 : 0.16 });
    }
    b.text('MIN', 2.6, 9.5, { size: 0.7 });
    b.text('MAX', 17.4, 9.5, { size: 0.7 });
    b.text('10K', 2.3, 27.0, { size: 0.85 });
    b.text('POT', 17.6, 27.0, { size: 0.85 });
    b.text('POTENTIOMETER 10K', 10, 22.5, { size: 0.8, side: 'bottom' });
    ['GND', 'OUT', 'VCC'].forEach((s, i) => b.text(s, lx[i], 1.6, { size: 0.85, side: 'bottom' }));

    b.place(potBody(b.t), PX, PY);
    const knob = potKnob();
    b.place(knob, PX, PY);

    const built = b.finish();
    built.actors = { knob };
    return built;
  },

  apply(built, s) {
    // clockwise (seen from above) as the value grows; 0.5 → pointer straight "up" (away from the header)
    built.actors.knob.rotation.y = -THREE.MathUtils.degToRad((clamp01(s.value ?? 0.5) - 0.5) * SWEEP);
  },
};
