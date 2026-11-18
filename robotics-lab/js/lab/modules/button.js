// Lab module: 12 × 12 mm tactile push-button with a round coloured cap, 10 kΩ pull-down on the board.
import { Board } from '../../core/board.js';
import { Builder, M, colorMat, rrShape } from '../../core/builder.js';
import { header, headerPinPositions, res, solderJoint } from '../../core/parts-ic.js';

const CAPS = { red: '#d4222b', blue: '#1f5fd1', yellow: '#f1c019', green: '#1f9d4c', white: '#ecebe5', black: '#17181a' };
const TRAVEL = 0.6;   // mm the cap goes down when pressed

/** Fixed part of the switch: moulded base, stamped steel cover, four legs through the board. Origin = switch centre. */
function tactBody(t) {
  const B = new Builder(), steel = colorMat('#b4b7ba', 0.36, 1);
  B.rbox(12.0, 12.0, 3.35, 0.3, M.black, 0, 0, 0.2);
  B.extrude(rrShape(11.7, 11.7, 0.7), 0.32, steel, 0, 0, 3.5, 0, { bevel: 0.07 });
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) B.cyl(0.75, 0.09, M.blackMatte, sx * 4.55, sy * 4.55, 3.8, { seg: 18 });
  for (const s of [-1, 1]) B.box(3.2, 0.14, 2.0, steel, 0, s * 6.0, 1.75);           // cover clips folded down the sides
  B.lathe([[4.1, 0], [4.1, 0.14], [3.9, 0.24], [3.5, 0.24]], M.black, 0, 0, 3.8, 36);  // collar around the plunger
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const x = sx * 6.25, y = sy * 2.5;
    B.box(0.3, 1.0, 1.35 + t + 1.3, M.tin, x, y, -t - 1.3);
    B.box(0.55, 1.0, 0.3, M.tin, sx * 6.1, y, 1.05);
    solderJoint(B, x, y, 0, { r: 0.9, hgt: 0.55, rp: 0.42 });
    solderJoint(B, x, y, -t, { r: 0.95, hgt: 0.7, flip: true, rp: 0.4 });
  }
  return B.build('tact-12mm');
}

/** Moving part: plunger with its square stem and the round snap-on cap. Origin = switch centre, h = 0 on the board. */
function tactCap(color) {
  const B = new Builder(), cap = colorMat(color, 0.3);
  B.cyl(3.35, 1.9, M.black, 0, 0, 2.8, { seg: 32 });
  B.rbox(3.8, 3.8, 2.9, 0.25, M.black, 0, 0, 4.6);
  const h0 = 5.7;
  B.lathe([[1.9, 0.0], [5.5, 0.0], [5.75, 0.22], [5.75, 1.5], [5.62, 1.72], [5.42, 1.84], [5.3, 2.05],
    [5.18, 5.1], [5.05, 5.48], [4.7, 5.72], [4.2, 5.8], [2.6, 5.68], [0, 5.62]], cap, 0, 0, h0, 48);
  B.cyl(1.95, 0.9, M.cavity, 0, 0, h0 - 0.02, { seg: 20 });
  return B.build('tact-cap');
}

export default {
  id: 'button',
  name: 'Push-button module',
  category: 'Inputs',
  blurb: 'Press it: OUT goes HIGH.',
  about: 'A 12 mm tactile switch with a snap-on cap and a 10 kΩ pull-down resistor on the board. '
    + 'Wire VCC to the logic supply of your board, GND to ground and OUT to a digital input: it reads LOW until you press, then HIGH. '
    + 'Without a pull-down (or pull-up) resistor an input pin "floats" and reads random values.',
  plug: 'post',
  defaults: { pressed: false },
  interact: 'press',

  build(opts = {}) {
    const b = new Board({ w: 20, h: 27, t: 1.6, r: 1.4, theme: 'blue', finish: 'tin', quality: opts.quality ?? 1 });
    const SX = 10, SY = 17.4;

    const hp = { x: 10, y: 4.5, nx: 3, type: 'male' };
    header(b, hp);
    const pins = headerPinPositions(hp);
    b.pin(pins[0][0], pins[0][1], 'VCC', 'supply: 3.3 V or 5 V (the logic level of your board)', 'pwr');
    b.pin(pins[1][0], pins[1][1], 'OUT', 'digital output: HIGH while pressed, LOW otherwise', 'dig');
    b.pin(pins[2][0], pins[2][1], 'GND', 'ground', 'gnd');
    const lx = [pins[0][0] - 1.0, pins[1][0], pins[2][0] + 1.0];
    ['VCC', 'OUT', 'GND'].forEach((s, i) => b.text(s, lx[i], 1.5, { size: 0.9 }));
    b.line([[lx[0], 2.35], [pins[0][0] - 0.75, 3.2]], { w: 0.14 });
    b.line([[lx[2], 2.35], [pins[2][0] + 0.75, 3.2]], { w: 0.14 });

    // switch footprint: legs at ±6.25 × ±2.5 — the two legs of one row are joined inside the switch
    const legs = [[-6.25, -2.5], [6.25, -2.5], [-6.25, 2.5], [6.25, 2.5]].map(([x, y]) => [SX + x, SY + y]);
    legs.forEach(([x, y]) => b.th(x, y, { d: 2.1, hole: 1.2 }));
    // VCC → upper row (runs under the switch), lower row → OUT, OUT → 10 kΩ → GND
    b.trace([pins[0], [pins[0][0], 6.6], [5.6, 8.5], [5.6, SY + 0.9], [legs[2][0] + 0.9, SY + 2.5], legs[2]], { w: 0.45 });
    b.trace([legs[2], legs[3]], { w: 0.45 });
    b.trace([pins[1], [pins[1][0], 9.6], [14.6, 9.6], [legs[1][0], 11.25], legs[1]], { w: 0.4 });
    b.trace([legs[0], legs[1]], { w: 0.4, side: 'bottom' });
    res(b, { x: 11.75, y: 7.7, size: '0603', text: '103' });
    b.trace([[10, 7.7], [11.0, 7.7]], { w: 0.35 });
    b.trace([[12.5, 7.7], [pins[2][0], 7.2], pins[2]], { w: 0.35 });

    // silkscreen
    b.rect(SX, SY, 12.7, 12.7, { lw: 0.18, r: 0.8 });
    b.text('S1', 2.2, SY + 5.2, { size: 0.75 });
    b.text('R1', 14.3, 7.7, { size: 0.7 });
    b.text('BUTTON', SX, 25.2, { size: 1.15 });
    b.text('PUSH BUTTON · 10K PULL-DOWN', 10, 14, { size: 0.7, side: 'bottom' });
    ['VCC', 'OUT', 'GND'].forEach((s, i) => b.text(s, lx[i], 1.6, { size: 0.85, side: 'bottom' }));

    b.place(tactBody(b.t), SX, SY);
    const cap = tactCap(CAPS[opts.color] || (typeof opts.color === 'string' && opts.color[0] === '#' ? opts.color : CAPS.red));
    b.place(cap, SX, SY);

    const built = b.finish();
    built.actors = { cap };
    return built;
  },

  apply(built, s) {
    built.actors.cap.position.y = s.pressed ? -TRAVEL : 0;
  },
};
