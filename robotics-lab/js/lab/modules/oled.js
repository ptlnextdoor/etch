// Lab module: 0.96" SSD1306 I²C OLED display (128 × 64, yellow / blue two-colour panel) on a 27.3 × 27.8 mm board.
import * as THREE from 'three';
import { Board } from '../../core/board.js';
import { Builder, colorMat, textMat, textTex } from '../../core/builder.js';
import { header, headerPinPositions, passives } from '../../core/parts-ic.js';

// ── classic 5 × 7 LCD font, ASCII 32…126 + '°' (5 column bytes per glyph, bit 0 = top row) ──
const FONT_HEX =
  '000000000000005f00000007000700147f147f14242a7f2a12231308646236495522500005030000001c2241000041221c00082a1c2a0808083e0808' +
  '00503000000808080808006060000020100804023e5149453e00427f400042615149462141454b311814127f1027454545393c4a4949300171090503' +
  '3649494936064949291e003636000000563600000008142241141414141441221408000201510906324979413e7e1111117e7f494949363e41414122' +
  '7f4141221c7f494949417f090901013e414151327f0808087f00417f41002040413f017f081422417f404040407f0204027f7f0408107f3e4141413e' +
  '7f090909063e4151215e7f09192946464949493101017f01013f4040403f1f2040201f7f2018207f63140814630304780403615149454300007f4141' +
  '020408102041417f000004020102044040404040000102040020545454787f484444383844444420384444487f3854545418087e090102081454543c' +
  '7f0804047800447d40002040443d00007f10284400417f40007c041804787c0804047838444444387c14141408081414187c7c080404084854545420' +
  '043f4440203c4040207c1c2040201c3c4030403c44281028440c5050503c4464544c44000836410000007f0000004136080008040810080006090906';
const FONT = new Uint8Array(FONT_HEX.length / 2).map((_, i) => parseInt(FONT_HEX.substr(i * 2, 2), 16));
const glyph = (ch) => { const c = ch === '°' ? 95 : ch.charCodeAt(0) - 32; return c >= 0 && c < 96 ? c : 31; };   // unknown → '?'

const SW = 128, SH = 64, PX = 5;                 // logical pixels, canvas pixels per logical pixel
const YELLOW = [255, 222, 40], BLUE = [64, 178, 255], BAND = 16;   // top 16 rows are yellow on the two-colour panel

/** Rasterise text lines into a 128 × 64 bitmap, then paint it as glowing OLED pixels. Returns true if anything is lit. */
function drawScreen(g, lines) {
  g.fillStyle = '#000'; g.fillRect(0, 0, SW * PX, SH * PX);
  const rows = (Array.isArray(lines) ? lines : lines == null ? [] : [lines]).slice(0, 6).map((v) => String(v ?? ''));
  if (!rows.length) return false;
  const n = rows.length, maxLen = Math.max(...rows.map((r) => r.length));
  // text size like Adafruit GFX setTextSize(sx, sy): 12 × 16 cells when they fit, tall 6 × 16 for up to 4 lines, else the standard 6 × 8
  const sx = n <= 4 && maxLen <= 10 ? 2 : 1, sy = n <= 4 ? 2 : 1;
  const bmp = new Uint8Array(SW * SH);
  let any = false;
  rows.forEach((row, i) => {
    const y0 = sy === 2 ? i * 16 + 1 : i === 0 ? 4 : Math.round(17 + (i - 1) * (SH - 8 - 17) / (n - 2));
    [...row].slice(0, Math.floor(SW / (6 * sx))).forEach((ch, k) => {
      const gi = glyph(ch) * 5, x0 = k * 6 * sx + (sx === 2 ? 4 : 1);
      for (let c = 0; c < 5; c++) for (let r = 0; r < 7; r++) {
        if (!((FONT[gi + c] >> r) & 1)) continue;
        for (let dx = 0; dx < sx; dx++) for (let dy = 0; dy < sy; dy++) {
          const x = x0 + c * sx + dx, y = y0 + r * sy + dy;
          if (x < SW && y < SH) { bmp[y * SW + x] = 1; any = true; }
        }
      }
    });
  });
  const css = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  for (const pass of [0, 1]) {                    // 0: soft halo around lit pixels, 1: the crisp pixels with a hairline gap
    for (let y = 0; y < SH; y++) {
      g.fillStyle = css(y < BAND ? YELLOW : BLUE, pass ? 1 : 0.09);
      for (let x = 0; x < SW; x++) {
        if (!bmp[y * SW + x]) continue;
        if (pass) g.fillRect(x * PX, y * PX, PX - 1, PX - 1); else g.fillRect(x * PX - 4, y * PX - 4, PX + 7, PX + 7);
      }
    }
  }
  return any;
}

// panel geometry (board mm)
const W = 27.3, H = 27.8, GX = W / 2, G_W = 26.7, G_Y0 = 4.0, G_Y1 = 23.3, CAP_Y0 = 8.0;
const AA_W = 21.7, AA_H = 10.9, AA_Y = G_Y1 - 2.1 - AA_H / 2;
const H_FOAM = 0.4, H_GLASS = 0.7, TOP = H_FOAM + 2 * H_GLASS;

/** Folded flex tail: bonded on the glass ledge, loops over the edge and back under the panel. */
function flexGeo(width) {
  const th = 0.14, hy = H_FOAM + H_GLASS + th / 2 + 0.01, lo = 0.12, R = (hy - lo) / 2, yb = G_Y0 - 1.35;
  const pts = [[5.5, hy], [yb, hy]];
  for (let i = 1; i < 10; i++) { const a = Math.PI / 2 + (i / 10) * Math.PI; pts.push([yb + Math.cos(a) * R, lo + R + Math.sin(a) * R]); }
  pts.push([yb, lo], [7.0, lo]);
  const side = (s) => pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)], dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [p[0] - s * dy / l * th / 2, p[1] + s * dx / l * th / 2];
  });
  const sh = new THREE.Shape();
  [...side(1), ...side(-1).reverse()].forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
  const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false });
  g.rotateY(Math.PI / 2); g.translate(-width / 2, 0, 0);      // profile (y, h) → THREE (…, h, −y), extruded along x
  return { g, top: hy + th / 2, yb };
}

export default {
  id: 'oled',
  name: 'OLED display 0.96" (SSD1306)',
  category: 'Outputs',
  blurb: 'Tiny 128 × 64 pixel I²C screen.',
  about: 'A 0.96-inch OLED panel driven by an SSD1306 chip: every one of its 128 × 64 pixels makes its own light, so text is razor-sharp and black is truly black. ' +
    'It talks I²C, so it needs only four wires: VCC, GND, SCL (clock) and SDA (data), usually at address 0x3C. Power it from 3.3 V on 3.3 V boards so the I²C lines stay at a safe level.',
  plug: 'post',
  defaults: { lines: [] },
  interact: null,

  build(opts = {}) {
    const b = new Board({
      w: W, h: H, t: 1.2, r: 1.2, theme: 'blue', quality: opts.quality ?? 1,
      holes: [[2.1, 2.1], [W - 2.1, 2.1], [2.1, H - 2.1], [W - 2.1, H - 2.1]].map(([x, y]) => ({ x, y, d: 2.2, ring: 3.1 })),
    });

    // ── header (top edge) + labels ──
    const hp = { x: GX, y: H - 1.6, nx: 4, type: 'male' };
    header(b, hp);
    const NAMES = ['GND', 'VCC', 'SCL', 'SDA'];
    const FN = ['ground', 'power, 3.3 – 5 V', 'I²C clock', 'I²C data'], KIND = ['gnd', 'pwr', 'com', 'com'];
    headerPinPositions(hp).forEach(([px, py], i) => {
      b.pin(px, py, NAMES[i], FN[i], KIND[i]);
      b.text(NAMES[i], px, G_Y1 + 0.78, { size: 0.78 });
    });
    b.line([[0.9, G_Y0 - 0.25], [0.9 + 2.2, G_Y0 - 0.25]], { w: 0.12 }); b.line([[W - 0.9, G_Y0 - 0.25], [W - 3.1, G_Y0 - 0.25]], { w: 0.12 });

    // ── the display panel ──
    const B = new Builder();
    // black glass: own physical materials with reduced specular, so the panel stays black under the studio soft boxes
    const own = [];
    const glassy = (o) => { const m = new THREE.MeshPhysicalMaterial({ roughness: 0.09, metalness: 0, specularIntensity: 0.42, ...o }); own.push(m); return m; };
    const decal = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    const glass = glassy({ color: 0x050608 }), foam = colorMat('#e9e7df', 0.9);
    const Y = (y) => y - H / 2;                                                              // board y → panel-local y (panel placed at board centre)
    B.rbox(G_W - 1.0, 12.5, H_FOAM, 0.1, foam, 0, Y(16.6), 0.005);                           // double-sided foam tape under the glass
    B.rbox(G_W, G_Y1 - G_Y0, H_GLASS, 0.14, glass, 0, Y((G_Y0 + G_Y1) / 2), H_FOAM);         // lower glass (with the contact ledge)
    B.rbox(G_W, G_Y1 - CAP_Y0, H_GLASS, 0.14, glass, 0, Y((CAP_Y0 + G_Y1) / 2), H_FOAM + H_GLASS);   // cover glass
    // what you see through the cover glass: the dark active matrix and the hair-thin tracks that run round it
    const capW = G_W - 0.3, capH = G_Y1 - CAP_Y0 - 0.3;
    const art = glassy({ ...decal, map: textTex({
      w: 1024, h: 592, bg: '#040506', lines: [],
      draw(g, w, h) {
        const k = w / 26.4, ax = (26.4 - 21.7) / 2 * k, ay = (2.1 - 0.15) * k, aw = 21.7 * k, ah = 10.9 * k;
        g.fillStyle = '#0b0d10'; g.fillRect(ax - 0.35 * k, ay - 0.35 * k, aw + 0.7 * k, ah + 0.7 * k);
        g.fillStyle = '#07090c'; g.fillRect(ax, ay, aw, ah);
        g.lineWidth = 1;
        for (let i = 0; i < 12; i++) {                                   // row lines hugging both sides, column lines fanning below
          g.strokeStyle = 'rgba(150,158,168,0.12)';
          const o = (0.45 + i * 0.125) * k;
          for (const s of [-1, 1]) {
            const x = w / 2 + s * (w / 2 - o), yTop = ay + (i + 0.5) * (ah / 12.5);
            g.beginPath(); g.moveTo(w / 2 + s * (aw / 2 + 0.36 * k), yTop); g.lineTo(x, yTop); g.lineTo(x, h); g.stroke();
          }
        }
        g.strokeStyle = 'rgba(150,158,168,0.09)';
        for (let i = 0; i <= 40; i++) { const x = ax + aw * i / 40; g.beginPath(); g.moveTo(x, ay + ah + 0.36 * k); g.lineTo(w / 2 + (x - w / 2) * 0.62, h); g.stroke(); }
      },
    }) });
    B.plane(capW, capH, art, 0, Y((CAP_Y0 + G_Y1) / 2), TOP + 0.004);
    // contact ledge: driver chip bonded on the glass + fan-out to the flex
    const ledge = glassy({ ...decal, map: textTex({
      w: 1024, h: 148, bg: '#050607', lines: [],
      draw(g, w, h) {
        g.lineWidth = 1; g.strokeStyle = 'rgba(160,166,174,0.2)';
        for (let i = 0; i <= 40; i++) { const t = i / 40 - 0.5; g.beginPath(); g.moveTo(w / 2 + t * w * 0.51, 0); g.lineTo(w / 2 + t * w * 0.27, h * 0.36); g.stroke(); }
        for (let i = 0; i <= 30; i++) { const t = i / 30 - 0.5; g.beginPath(); g.moveTo(w / 2 + t * w * 0.26, h * 0.62); g.lineTo(w / 2 + t * w * 0.42, h); g.stroke(); }
        for (const s of [-1, 1]) for (let i = 0; i < 12; i++) {
          const x = w / 2 + s * (w / 2 - (0.45 + i * 0.125) * (w / 26.4));
          g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h * 0.12 + i * 2); g.lineTo(w / 2 + s * w * 0.14, h * 0.45 + i * 1.2); g.stroke();
        }
      },
    }) });
    B.plane(capW, CAP_Y0 - G_Y0 - 0.2, ledge, 0, Y((G_Y0 + CAP_Y0) / 2), H_FOAM + H_GLASS + 0.004);
    B.rbox(7.2, 0.95, 0.24, 0.05, colorMat('#5d6166', 0.28, 0.55), 0, Y(6.75), H_FOAM + H_GLASS + 0.004);   // SSD1306 die (chip-on-glass)
    // flex tail
    const FW = 12, fx = flexGeo(FW);
    B.geo(fx.g, colorMat('#a8651f', 0.42), 0, Y(0), 0);
    const flexArt = textMat({
      w: 512, h: 128, bg: '#b3712a', lines: [], roughness: 0.38,
      draw(g, w, h) {
        g.fillStyle = '#c98f47';
        for (let i = 0; i < 30; i++) g.fillRect(w * 0.06 + i * (w * 0.88 / 30), 0, w * 0.88 / 30 * 0.52, h);
        g.fillStyle = 'rgba(70,40,10,0.35)'; g.fillRect(0, h * 0.5, w, h * 0.06);
      },
    });
    B.plane(FW - 0.3, 5.3 - fx.yb, flexArt, 0, Y((5.3 + fx.yb) / 2), fx.top + 0.004);
    b.place(B.build('panel'), GX, H / 2);

    // ── the live screen: own canvas + own material ──
    const canvas = document.createElement('canvas'); canvas.width = SW * PX; canvas.height = SH * PX;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
    const screenMat = glassy({
      color: 0x06080b, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 1.35,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    });
    const SB = new Builder();
    SB.plane(AA_W, AA_H, screenMat, 0, 0, TOP + 0.012);
    const screenGrp = b.place(SB.build('screen'), GX, AA_Y);
    const screen = screenGrp.getObjectByProperty('isMesh', true);
    if (screen) screen.castShadow = false;

    // ── back side: the regulator and I²C pull-ups live here on the real module ──
    passives(b, [
      ['sot23', 20.5, 21.2, 0, { side: 'bottom', text: '662K' }],
      ['cap', 16.6, 21.2, 90, { side: 'bottom', size: '0603' }], ['cap', 24.0, 21.2, 90, { side: 'bottom', size: '0603' }],
      ['res', 6.2, 21.6, 0, { side: 'bottom', text: '472' }], ['res', 6.2, 19.8, 0, { side: 'bottom', text: '472' }],
      ['res', 10.2, 21.6, 0, { side: 'bottom', text: '0' }],
      ['cap', 6.0, 14.6, 0, { side: 'bottom', size: '0603' }], ['cap', 6.0, 12.8, 0, { side: 'bottom', size: '0603' }],
      ['cap', 6.0, 11.0, 0, { side: 'bottom', size: '0603' }], ['cap', 21.3, 14.6, 0, { side: 'bottom', size: '0603' }],
      ['res', 21.3, 12.8, 0, { side: 'bottom', text: '914' }], ['cap', 21.3, 11.0, 0, { side: 'bottom', size: '0603', color: 'brown' }],
    ]);
    b.text('IIC ADDRESS SELECT', GX, 17.6, { size: 0.75, side: 'bottom' });
    b.text('0x78      0x7A', GX, 16.3, { size: 0.75, side: 'bottom' });
    NAMES.forEach((s, i) => b.text(s, GX + (i - 1.5) * 2.54, H - 4.2, { size: 0.75, side: 'bottom' }));
    for (let i = 0; i < 30; i++) b.pad(GX + (i - 14.5) * 0.39, 6.1, 0.22, 2.0, { side: 'bottom' });   // where the flex is soldered
    b.rect(GX, 6.1, 12.6, 2.9, { side: 'bottom', lw: 0.12 });

    drawScreen(ctx, []);
    const built = b.finish();
    built.actors = { screen, canvas, ctx, texture, material: screenMat, key: '' };
    const dispose = built.dispose;
    built.dispose = () => { dispose(); texture.dispose(); own.forEach((m) => m.dispose()); };
    return built;
  },

  apply(built, s) {
    const a = built.actors, lines = Array.isArray(s.lines) ? s.lines : s.lines == null ? [] : [s.lines];
    const key = lines.length + '\u0001' + lines.join('\u0001');
    if (key === a.key) return;                    // nothing changed → keep the texture as is
    a.key = key;
    drawScreen(a.ctx, lines);
    a.texture.needsUpdate = true;
  },
};
