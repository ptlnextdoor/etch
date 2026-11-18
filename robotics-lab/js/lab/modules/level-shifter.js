// Lab module: 4-channel bi-directional logic level converter (the little red BSS138 board).
import { Board } from '../../core/board.js';
import { header, headerPinPositions, passives } from '../../core/parts-ic.js';

export default {
  id: 'level-shifter',
  name: 'Logic level converter (4-channel)',
  category: 'Interface',
  blurb: 'Lets 5 V and 3.3 V parts talk.',
  about: 'Four tiny BSS138 MOSFETs, each with two pull-up resistors, translate signals in both directions between a 5 V side (HV) and a 3.3 V side (LV). ' +
    'Feed HV with 5 V, LV with 3.3 V, join the grounds, then pass each signal through a matching pair such as HV1 ↔ LV1. It is meant for logic signals only — never use it to power anything.',
  plug: 'post',
  defaults: {},
  interact: null,

  build(opts = {}) {
    const W = 16.2, H = 16, CX = W / 2, CY = H / 2, ROW = 5.08;
    const b = new Board({ w: W, h: H, t: 1.6, r: 0.8, theme: 'red', quality: opts.quality ?? 1 });

    // ── two 6-pin headers along the long edges: HV (5 V) on top, LV (3.3 V) below ──
    const hvP = { x: CX, y: CY + ROW, nx: 6, type: 'male' }, lvP = { x: CX, y: CY - ROW, nx: 6, type: 'male' };
    header(b, hvP); header(b, lvP);
    const hv = headerPinPositions(hvP), lv = headerPinPositions(lvP);
    const HV = ['HV1', 'HV2', 'HV', 'GND', 'HV3', 'HV4'], LV = ['LV1', 'LV2', 'LV', 'GND', 'LV3', 'LV4'];
    const CH = [1, 2, 0, 0, 3, 4];
    hv.forEach(([px, py], i) => {
      const n = HV[i];
      b.pin(px, py, n, n === 'GND' ? 'ground (shared by both sides)' : n === 'HV' ? 'high-side supply, 5 V' : `channel ${CH[i]}, 5 V side ↔ LV${CH[i]}`, n === 'GND' ? 'gnd' : n === 'HV' ? 'pwr' : 'dig');
      b.text(n, px, py - 2.05, { size: 0.66 });
    });
    lv.forEach(([px, py], i) => {
      const n = LV[i];
      b.pin(px, py, n, n === 'GND' ? 'ground (shared by both sides)' : n === 'LV' ? 'low-side supply, 3.3 V' : `channel ${CH[i]}, 3.3 V side ↔ HV${CH[i]}`, n === 'GND' ? 'gnd' : n === 'LV' ? 'pwr' : 'dig');
      b.text(n, px, py + 2.05, { size: 0.66 });
    });

    // ── four BSS138 + eight 10 k pull-ups in the middle ──
    const list = [], pinIdx = [0, 1, 4, 5];
    const railHV = CY + 2.3, railLV = CY - 2.3;
    for (let k = 0; k < 4; k++) {
      const cx = CX + (k - 1.5) * 3.9 + 0.15, qx = cx - 0.55, rx = cx + 1.35, i = pinIdx[k];
      list.push(['sot23', qx, CY, 90, { text: 'J1' }], ['res', rx, CY + 1.05, 90, { text: '103' }], ['res', rx, CY - 1.05, 90, { text: '103' }]);
      // top side: only short stubs to vias, so the silkscreen stays readable; the long runs are on the back
      b.trace([[qx - 1.0, CY], [qx - 1.0, CY + 1.35]], { w: 0.25 }); b.via(qx - 1.0, CY + 1.35);          // drain → HVn
      b.trace([[qx + 1.0, CY - 0.95], [qx + 0.35, CY - 1.75]], { w: 0.25 }); b.via(qx + 0.35, CY - 1.75);  // source → LVn
      b.trace([[qx + 1.0, CY + 0.95], [rx - 0.45, CY + 0.25], [rx, CY + 0.25]], { w: 0.22 });
      b.trace([[rx, CY + 1.85], [rx, railHV]], { w: 0.22 }); b.via(rx, railHV);
      b.trace([[rx, CY - 1.85], [rx, railLV]], { w: 0.22 }); b.via(rx, railLV);
      b.trace([hv[i], [hv[i][0], CY + 3.2], [qx - 1.0, CY + 1.35]], { w: 0.28, side: 'bottom' });
      b.trace([lv[i], [lv[i][0], CY - 3.2], [qx + 0.35, CY - 1.75]], { w: 0.28, side: 'bottom' });
    }
    passives(b, list);
    b.trace([[1.2, railHV], [W - 0.9, railHV]], { w: 0.3, side: 'bottom' }); b.trace([[1.2, railLV], [W - 0.9, railLV]], { w: 0.3, side: 'bottom' });
    b.trace([hv[2], [hv[2][0], railHV]], { w: 0.4, side: 'bottom' }); b.trace([lv[2], [lv[2][0], railLV]], { w: 0.4, side: 'bottom' });
    b.trace([hv[3], lv[3]], { w: 0.7, side: 'bottom' });                                   // the two GND pins are one net

    // ── back side ──
    b.text('5V', 1.9, CY + 0.9, { size: 0.9, side: 'bottom', weight: 700 }); b.text('3.3V', 2.4, CY - 0.9, { size: 0.9, side: 'bottom', weight: 700 });
    b.text('LEVEL', W - 3.2, CY + 0.9, { size: 0.9, side: 'bottom', weight: 700 }); b.text('SHIFT', W - 3.2, CY - 0.9, { size: 0.9, side: 'bottom', weight: 700 });
    hv.forEach(([px, py], i) => b.text(HV[i], px, py - 2.05, { size: 0.66, side: 'bottom' }));
    lv.forEach(([px, py], i) => b.text(LV[i], px, py + 2.05, { size: 0.66, side: 'bottom' }));

    const built = b.finish();
    built.actors = {};
    return built;
  },

  apply() {},
};
