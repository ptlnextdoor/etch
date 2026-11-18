// Raspberry Pi 4 Model B — 85 × 56 mm single-board computer.
// Orientation: 40-pin GPIO header along the TOP edge, USB / Ethernet on the right, USB-C / micro-HDMI / audio along the BOTTOM edge.
import { Board } from '../core/board.js';
import { qfn, soic, bga, led, inductor, crystalSMD, header, passives } from '../core/parts-ic.js';
import { usbC, usbA, rj45, microHdmi, audioJack, fpc, microSD, shieldCan } from '../core/parts-conn.js';

// ───────────────────────── GPIO header (J8) ─────────────────────────
const P = 2.54, GX0 = 8.37, GY_ODD = 51.23, GY_EVEN = 53.77;
const DIO = '3.3 V digital input/output';
// index = pin number − 1 → [name, function, kind]
const GPIO = [
  ['3V3', '3.3 V power output for sensors', 'pwr'],
  ['5V', '5 V power, straight from the USB-C supply', 'pwr'],
  ['GPIO2', 'SDA · I²C data (1.8 kΩ pull-up on board)', 'com'],
  ['5V', '5 V power, straight from the USB-C supply', 'pwr'],
  ['GPIO3', 'SCL · I²C clock (1.8 kΩ pull-up on board)', 'com'],
  ['GND', 'ground', 'gnd'],
  ['GPIO4', DIO + ' · default 1-Wire bus', 'dig'],
  ['GPIO14', 'TXD · UART transmit', 'com'],
  ['GND', 'ground', 'gnd'],
  ['GPIO15', 'RXD · UART receive (3.3 V only!)', 'com'],
  ['GPIO17', DIO, 'dig'],
  ['GPIO18', DIO + ' · hardware PWM0', 'dig'],
  ['GPIO27', DIO, 'dig'],
  ['GND', 'ground', 'gnd'],
  ['GPIO22', DIO, 'dig'],
  ['GPIO23', DIO, 'dig'],
  ['3V3', '3.3 V power output for sensors', 'pwr'],
  ['GPIO24', DIO, 'dig'],
  ['GPIO10', 'MOSI · SPI data from the Pi to the device', 'com'],
  ['GND', 'ground', 'gnd'],
  ['GPIO9', 'MISO · SPI data from the device to the Pi', 'com'],
  ['GPIO25', DIO, 'dig'],
  ['GPIO11', 'SCLK · SPI clock', 'com'],
  ['GPIO8', 'CE0 · SPI chip select 0', 'com'],
  ['GND', 'ground', 'gnd'],
  ['GPIO7', 'CE1 · SPI chip select 1', 'com'],
  ['ID_SD', 'GPIO0 · I²C data for the HAT ID EEPROM — leave free', 'ctl'],
  ['ID_SC', 'GPIO1 · I²C clock for the HAT ID EEPROM — leave free', 'ctl'],
  ['GPIO5', DIO, 'dig'],
  ['GND', 'ground', 'gnd'],
  ['GPIO6', DIO, 'dig'],
  ['GPIO12', DIO + ' · hardware PWM0', 'dig'],
  ['GPIO13', DIO + ' · hardware PWM1', 'dig'],
  ['GND', 'ground', 'gnd'],
  ['GPIO19', DIO + ' · hardware PWM1', 'dig'],
  ['GPIO16', DIO, 'dig'],
  ['GPIO26', DIO, 'dig'],
  ['GPIO20', DIO, 'dig'],
  ['GND', 'ground', 'gnd'],
  ['GPIO21', DIO, 'dig'],
];
const pinXY = (n) => [GX0 + P * ((n - 1) >> 1), n % 2 ? GY_ODD : GY_EVEN];
const isSignal = (n) => !['pwr', 'gnd'].includes(GPIO[n - 1][2]);

// ───────────────────────── small geometry helpers ─────────────────────────
const mulberry = (seed) => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/** Offset a polyline by d (to the left of the travel direction) with mitred corners. */
function offsetPath(pts, d) {
  return pts.map((p, i) => {
    const a = pts[i - 1], c = pts[i + 1];
    let n1, n2;
    if (a) { const dx = p[0] - a[0], dy = p[1] - a[1], l = Math.hypot(dx, dy) || 1; n1 = [-dy / l, dx / l]; }
    if (c) { const dx = c[0] - p[0], dy = c[1] - p[1], l = Math.hypot(dx, dy) || 1; n2 = [-dy / l, dx / l]; }
    n1 ||= n2; n2 ||= n1;
    const k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k];
  });
}
/** Several parallel traces following one centre line; offs = list of offsets (mm). */
function ribbon(b, pts, offs, o = {}) { for (const d of offs) b.trace(offsetPath(pts, d), { w: 0.15, ...o }); }
/** Offsets for n differential pairs: pair pitch pp, gap inside the pair g. */
const pairs = (n, pp = 0.85, g = 0.34) => Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * pp).flatMap(c => [c - g / 2, c + g / 2]);

/**
 * Non-crossing fan-out: every item {s, t, end} leaves the row y0 at x = s, runs on its own level to x = t and finishes with `end` points.
 * Items must be sorted by s (and by t). Left-going traces take levels lo, lo+d… from the leftmost; right-going — from the rightmost.
 */
function fan(b, items, y0, lo, d, o = {}) {
  const L = items.filter(i => i.t < i.s), R = items.filter(i => i.t >= i.s).reverse();
  for (const grp of [L, R]) grp.forEach((it, i) => {
    const lv = lo + d * i, dir = Math.sign(it.t - it.s) || 1, c = Math.min(0.45, Math.abs(it.t - it.s) / 2);
    b.trace([[it.s, y0], [it.s, lv - c], [it.s + dir * c, lv], [it.t - dir * c, lv], [it.t, lv + c], ...it.end], { w: 0.2, ...o });
  });
}
const segDist = (x, y, a, c) => {
  const dx = c[0] - a[0], dy = c[1] - a[1], l2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
};
const CHIP = { '0201': [0.6, 0.3], '0402': [1.0, 0.5], '0603': [1.6, 0.8], '0805': [2.0, 1.25], '1206': [3.2, 1.6] };
const PREFIX = { res: 'R', cap: 'C', ferrite: 'FB', sot23: 'Q', tantalum: 'C', diode: 'D' };

export default {
  id: 'rpi4',
  name: 'Raspberry Pi 4 Model B', maker: 'Raspberry Pi', year: 2019,
  tagline: 'A real computer, credit-card sized',
  level: 'Intermediate',
  accent: '#1d8a43',
  summary: 'The Raspberry Pi 4 is not a microcontroller but a complete Linux computer: plug in a monitor, a keyboard and a network cable and it works like a desktop PC. ' +
    'In robotics it is the high-level brain — it processes camera video, runs neural networks and ROS, and talks to motors and sensors through its 40 GPIO pins.',
  specs: [
    ['Processor', 'Broadcom BCM2711, 4 × Cortex-A72, 64-bit'],
    ['Clock speed', '1.5 GHz (1.8 GHz with newer firmware)'],
    ['RAM', '1, 2, 4 or 8 GB LPDDR4'],
    ['Storage', 'microSD card (can also boot from a USB drive)'],
    ['Wi-Fi & Bluetooth', '802.11ac 2.4 / 5 GHz, Bluetooth 5.0'],
    ['Wired network', 'Gigabit Ethernet'],
    ['USB', '2 × USB 3.0 and 2 × USB 2.0'],
    ['Video', '2 × micro-HDMI, up to 4K'],
    ['GPIO', '40-pin header, 3.3 V logic'],
    ['Camera & display', 'CSI and DSI ribbon connectors'],
    ['Power', '5 V, 3 A over USB-C'],
    ['Size', '85 × 56 mm'],
  ],
  compare: { mcu: 'BCM2711, 4 × Cortex-A72', clock: '1.5 GHz', flash: 'microSD', ram: '1–8 GB', gpio: '26', analog: 'none', wireless: 'Wi-Fi 5 + BT 5.0', logic: '3.3 V', price: '≈ $35–75' },
  highlights: [
    'Full Linux: Python, OpenCV, ROS and neural networks run right on the board',
    'Camera port, Wi-Fi, Ethernet and four USB ports are built in — nothing extra to buy',
    '40-pin GPIO header with I²C, SPI, UART and PWM for sensors and motor drivers',
    'A huge community: tutorials and libraries for almost any project',
  ],
  cautions: [
    'GPIO pins are 3.3 V only. Feeding 5 V into an input destroys the processor — there is no protection',
    'There are no analog inputs: a potentiometer or analog sensor needs an external ADC (for example the MCP3008)',
    'Use a 5 V 3 A power supply. A weak phone charger causes freezes and corrupts files on the card',
    'No more than 16 mA from a single GPIO pin. Power motors and servos from a separate supply through a driver',
    'Do not pull the plug without shutting down first — you can damage the system on the microSD card',
  ],
  uses: [
    'Computer-vision robot: a camera plus OpenCV finds a line, a ball or a face',
    'On-board ROS computer that commands an Arduino driving the motors',
    'Wi-Fi controlled rover that streams video to a web browser',
    'Voice assistant or smart weather station with a web dashboard',
    'Server for a 3D printer or a smart home',
  ],
  parts: {
    soc: { name: 'Broadcom BCM2711 processor', text: 'The main chip under the metal lid: four 64-bit Cortex-A72 cores and a graphics core in one package. It runs Linux and all of your programs. It gets noticeably warm under load, which is why people often stick a heatsink on it.' },
    ram: { name: 'LPDDR4 memory', text: 'The black chip next to the processor is the working memory of the computer: 1, 2, 4 or 8 GB depending on the board version. The more of it, the more programs and browser tabs can stay open at once.' },
    gpio: { name: '40-pin GPIO header', text: 'The main connector for robotics: 26 programmable pins plus 3.3 V, 5 V and ground. Sensors, motor drivers and add-on boards (HATs) plug in here. Every signal is 3.3 V — never feed 5 V into an input.' },
    usbc: { name: 'USB-C power input', text: 'This is where the board gets its 5 V. It needs a 3 A supply because the processor, USB devices and a camera together draw a lot of current. In normal use this port carries power only, not data.' },
    hdmi: { name: 'Two micro-HDMI ports', text: 'Video outputs: you can drive two monitors at once at up to 4K. The connectors are the small kind, so you need a micro-HDMI to HDMI cable. With a single monitor, use HDMI0 — the one closer to USB-C.' },
    usb3: { name: 'USB 3.0 ports (blue)', text: 'Two fast ports with blue inserts — up to 5 Gbit/s. Plug in SSD drives, cameras and flash drives here. The system runs much faster from an SSD than from a memory card.' },
    usb2: { name: 'USB 2.0 ports', text: 'Two ordinary ports for a keyboard, mouse, webcam or an Arduino. USB is a handy way to link the Raspberry Pi to a microcontroller that drives the motors.' },
    ethernet: { name: 'Ethernet jack (RJ45)', text: 'Wired networking at up to 1 Gbit/s. More reliable than Wi-Fi when you stream video from a robot or log in over SSH. Two LEDs in the jack show link and activity.' },
    audio: { name: '3.5 mm audio / video jack', text: 'A four-pole socket: stereo sound for headphones or speakers plus an analog video signal for old TVs. Handy when your robot needs to talk or play sounds.' },
    csi: { name: 'CSI camera connector', text: 'The official Raspberry Pi camera plugs in here with a flat ribbon cable. It is the fastest way to give a robot eyes, because frames go straight into the processor. Lift the latch before sliding the ribbon in, then press it back down.' },
    dsi: { name: 'DSI display connector', text: 'A ribbon connector for the Raspberry Pi touchscreen. The screen works without an HDMI cable and does not use up a USB port — great for a control panel or a robot face.' },
    wifi: { name: 'Wi-Fi and Bluetooth module', text: 'The radio hides under this metal can: dual-band Wi-Fi (2.4 and 5 GHz) and Bluetooth 5.0. The can shields the radio from interference. The antenna is the shaped cut-out in the copper at the board edge — do not cover it with metal.' },
    usbctrl: { name: 'VL805 USB controller', text: 'This chip turns one fast PCI Express lane from the processor into four USB ports. Thanks to it, USB and Ethernet no longer share one channel as they did on older models.' },
    ethphy: { name: 'BCM54213PE Ethernet chip', text: 'Converts digital data from the processor into electrical signals for the network cable, and back again. It works at up to 1 Gbit/s.' },
    pmic: { name: 'MxL7704 power controller', text: 'Turns the incoming 5 V into several lower voltages: 3.3 V, 1.8 V, 1.1 V and the core supply of the processor. The grey cubes around it are the inductors of the switching converters; they smooth the current.' },
    sd: { name: 'microSD card slot', text: 'It sits on the bottom side of the board. The memory card works as the hard drive: it holds Linux and all your files. Without a card (or a bootable USB drive) the board will not start.' },
    poe: { name: 'PoE pins', text: 'Four pins that bring out the power lines of the network cable. With a PoE HAT add-on the Raspberry Pi is powered directly over Ethernet. There can be up to 57 V here — do not connect anything else to these pins.' },
    leds: { name: 'PWR and ACT LEDs', text: 'The red PWR LED is on when the supply voltage is good. The green ACT LED blinks when the memory card is being accessed. If the red one flickers or goes out, your power supply is too weak.' },
  },
  partOrder: ['soc', 'ram', 'gpio', 'usbc', 'sd', 'hdmi', 'usb3', 'usb2', 'ethernet', 'wifi', 'csi', 'dsi', 'audio', 'pmic', 'usbctrl', 'ethphy', 'poe', 'leds'],
  pinNotes: [
    { title: 'Power', text: 'Pins 2 and 4 are 5 V straight from the power supply; pins 1 and 17 are 3.3 V for sensors. Ground (GND) is on pins 6, 9, 14, 20, 25, 30, 34 and 39. Never power motors from these pins — use a separate supply.' },
    { title: '3.3 V only', text: 'Every GPIO works at 3.3 V. Connect a sensor with a 5 V output (for example the HC-SR04) through a two-resistor divider or a level shifter.' },
    { title: 'GPIO numbers vs pin numbers', text: 'Each contact has two numbers: the physical one (1–40, in order) and the GPIO number you use in code. For example, pin 11 is GPIO17. Pin 1 is in the row closer to the middle of the board, at the left end; it has a square pad.' },
    { title: 'I²C, SPI and UART buses', text: 'I²C: GPIO2 (SDA) and GPIO3 (SCL). SPI: GPIO10, GPIO9, GPIO11 with chip selects GPIO8 / GPIO7. UART: GPIO14 (TXD) and GPIO15 (RXD). Enable a bus in raspi-config before you use it.' },
    { title: 'PWM for servos', text: 'Hardware PWM is available on GPIO12, GPIO13, GPIO18 and GPIO19. On all other pins PWM is done in software — fine for an LED, but a servo may jitter.' },
  ],
  code: {
    title: 'First program: an LED and a button in Python',
    lang: 'python',
    src: `# Run it with: python3 blink.py
# The gpiozero library comes preinstalled with Raspberry Pi OS
from gpiozero import LED, Button
from time import sleep

led = LED(17)        # LED: GPIO17 (pin 11) -> 330 ohm resistor -> GND (pin 9)
button = Button(27)  # button between GPIO27 (pin 13) and GND (pin 14)

while True:
    if button.is_pressed:   # button held down: stay on
        led.on()
        sleep(0.05)
    else:                   # otherwise blink once a second
        led.on()
        sleep(0.5)
        led.off()
        sleep(0.5)
`,
  },
  quiz: [
    { q: 'Find the processor — the brain of the computer', part: 'soc', hint: 'A square chip with a shiny metal lid near the middle' },
    { q: 'Where do sensors and motor drivers plug in?', part: 'gpio', hint: 'Two rows of 20 pins along the long edge' },
    { q: 'Which connector powers the board?', part: 'usbc', hint: 'A small oval socket near the corner, next to the HDMI ports' },
    { q: 'Where are the fast USB 3.0 ports?', part: 'usb3', hint: 'The stacked socket with blue inserts' },
    { q: 'Where does the camera ribbon cable go?', part: 'csi', hint: 'A narrow connector between an HDMI port and the headphone jack' },
    { q: 'Where is the Wi-Fi hiding?', part: 'wifi', hint: 'Under the metal can next to the GPIO header' },
  ],
  facts: [
    'The Raspberry Pi 4 is roughly 40 times faster than the very first model from 2012, yet the starting price is the same $35.',
    'The Wi-Fi antenna is not a component at all — it is a specially shaped cut-out in the copper layer of the board itself.',
    'Raspberry Pi boards are built at the Sony factory in Wales, and tens of millions of them have been sold.',
  ],

  build(opts = {}) {
    const b = new Board({
      w: 85, h: 56, r: 3, theme: 'green', finish: 'gold', quality: opts.quality ?? 1,
      holes: [{ x: 3.5, y: 3.5, d: 2.7, ring: 6 }, { x: 61.5, y: 3.5, d: 2.7, ring: 6 }, { x: 3.5, y: 52.5, d: 2.7, ring: 6 }, { x: 61.5, y: 52.5, d: 2.7, ring: 6 }],
    });
    const rnd = mulberry(4);

    // ══════════════════ bookkeeping: occupied areas, labels, free-spot search ══════════════════
    /** Occupied rectangles [x0, y0, x1, y1, side?] — bodies and labels where random vias / test points / designators must not land. */
    const occ = [];
    const keep = (x, y, w, h, side) => occ.push([x - w / 2, y - h / 2, x + w / 2, y + h / 2, side]);
    /** Silkscreen text that also reserves its area. */
    const T = (str, x, y, o = {}) => {
      const size = o.size ?? 1, len = String(str).length * size * (o.weight >= 700 ? 0.7 : 0.62) + 0.4, hh = size * 1.3;
      const rot = Math.abs(o.rot || 0) % 180 === 90;
      keep(x, y, rot ? hh : len, rot ? len : hh, o.side || 'top');
      b.text(str, x, y, o);
    };
    /** Bottom-side text: the viewer shows the bottom flipped top-to-bottom, so it is rotated 180° to read upright there. */
    const TB = (str, x, y, o = {}) => T(str, x, y, { rot: 180, side: 'bottom', ...o });
    // pads and trace segments bucketed on a coarse grid (rebuilt when their number changes) — keeps the free-spot search fast
    const CELL = 4, buckets = {}, NONE = [];
    const near = (s, x, y) => {
      const L = b.layers[s]; let g = buckets[s];
      if (!g || g.np !== L.pads.length || g.nt !== L.traces.length) {
        g = buckets[s] = { np: L.pads.length, nt: L.traces.length, pads: new Map(), segs: new Map() };
        const put = (m, x0, y0, x1, y1, v) => {
          for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++) {
            const k = (i + 10) * 100 + j + 10; let a = m.get(k); if (!a) m.set(k, a = []); a.push(v);
          }
        };
        for (const p of L.pads) { const hw = Math.max(p.w, p.h) / 2 + 1.5; put(g.pads, p.x - hw, p.y - hw, p.x + hw, p.y + hw, p); }
        for (const t of L.traces) for (let i = 1; i < t.pts.length; i++) {
          const a = t.pts[i - 1], c = t.pts[i], m = t.w / 2 + 1.5;
          put(g.segs, Math.min(a[0], c[0]) - m, Math.min(a[1], c[1]) - m, Math.max(a[0], c[0]) + m, Math.max(a[1], c[1]) + m, [a, c, t.w / 2]);
        }
      }
      const k = (Math.floor(x / CELL) + 10) * 100 + Math.floor(y / CELL) + 10;
      return [g.pads.get(k) || NONE, g.segs.get(k) || NONE];
    };
    const isFree = (x, y, r, sides = ['top', 'bottom']) => {
      if (x < 1 + r || y < 1 + r || x > b.w - 1 - r || y > b.h - 1 - r) return false;
      for (const o of occ) if ((!o[4] || sides.includes(o[4])) && x > o[0] - r && x < o[2] + r && y > o[1] - r && y < o[3] + r) return false;
      for (const s of sides) {
        const L = b.layers[s], [pads, segs] = near(s, x, y);
        for (const p of pads) { const hw = Math.max(p.w, p.h) / 2 + r; if (Math.abs(x - p.x) < hw && Math.abs(y - p.y) < hw) return false; }
        for (const v of L.vias) if (Math.hypot(x - v.x, y - v.y) < v.d / 2 + r + 0.3) return false;
        for (const k of L.keep) if (Math.abs(x - k.x) < k.w / 2 + r && Math.abs(y - k.y) < k.h / 2 + r) return false;
        for (const sg of segs) if (segDist(x, y, sg[0], sg[1]) < sg[2] + r) return false;
        for (const o of L.silk) if (o.k === 'line') for (let i = 1; i < o.pts.length; i++) if (segDist(x, y, o.pts[i - 1], o.pts[i]) < r + 0.1) return false;
      }
      return true;
    };
    const rectFree = (x, y, w, h, side) => {
      const nx = Math.ceil(w / 0.3), ny = Math.ceil(h / 0.3);
      for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) if (!isFree(x - w / 2 + w * i / nx, y - h / 2 + h * j / ny, 0.1, [side])) return false;
      return true;
    };
    /** Scatter up to n vias inside a rectangle wherever both sides are free. */
    const sprinkle = (x0, y0, x1, y1, n) => {
      for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
        const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
        if (isFree(x, y, 0.62)) { b.via(x, y); i++; }
      }
    };
    /** Queue a small part for passives(); remembers its footprint for designators. Chip size defaults to 0402. */
    const lists = { top: [], bottom: [] }, placed = [];
    const pv = (kind, x, y, rot = 0, o = {}) => {
      const side = o.side || 'top', chip = kind !== 'sot23' && kind !== 'tantalum';
      const size = o.size || '0402';
      const [l, w] = kind === 'sot23' ? [2.5, 2.9] : kind === 'tantalum' ? [4.1, 2.9] : CHIP[size];
      const q = Math.abs(rot) % 180 === 90, a = l / 2 + (chip ? 0.36 : 0.2), c = w / 2 + 0.14;
      const hw = q ? c : a, hh = q ? a : c;
      lists[side].push([kind, x, y, rot, chip ? { ...o, size } : o]);
      placed.push({ kind, x, y, hw, hh, side });
      keep(x, y, 2 * hw, 2 * hh, side);
    };
    const row = (kind, xs, y, rot, o) => xs.forEach(x => pv(kind, x, y, rot, o));
    const col = (kind, x, ys, rot, o) => ys.forEach(y => pv(kind, x, y, rot, o));

    // ══════════════════ connectors ══════════════════
    b.tag(rj45(b, { x: 88, y: 45.75, rot: 180 }), 'ethernet'); keep(77.5, 45.75, 21.4, 19);
    b.tag(usbA(b, { x: 88, y: 27, rot: 180, usb3: true }), 'usb3'); keep(79.25, 27, 17.9, 16.6);
    b.tag(usbA(b, { x: 88, y: 9, rot: 180 }), 'usb2'); keep(79.25, 9, 17.9, 16.6);
    b.tag(usbC(b, { x: 11.2, y: -1.2, rot: 90 }), 'usbc'); keep(11.2, 3.2, 9.8, 8.8);
    b.tag(microHdmi(b, { x: 26, y: -1.2, rot: 90 }), 'hdmi'); keep(26, 3.2, 8.6, 8.8);
    b.tag(microHdmi(b, { x: 39.5, y: -1.2, rot: 90 }), 'hdmi'); keep(39.5, 3.2, 8.6, 8.8);
    b.tag(audioJack(b, { x: 54, y: -2.5, rot: 90 }), 'audio'); keep(54, 4.8, 6.6, 13);
    const CSI = { x: 46.3, y: 12.2 }, DSI = { x: 4, y: 28 };
    b.tag(fpc(b, { x: CSI.x, y: CSI.y, rot: 180 }), 'csi'); keep(CSI.x, CSI.y, 3.4, 23);
    b.tag(fpc(b, { x: DSI.x, y: DSI.y }), 'dsi'); keep(DSI.x, DSI.y, 3.4, 23);
    b.tag(microSD(b, { x: 1.1, y: 28, side: 'bottom' }), 'sd'); keep(7.2, 28, 15, 15, 'bottom');

    // GPIO header J8 (2 × 20) — the library draws the plated holes; hover pins are registered here
    b.tag(header(b, { x: GX0 + P * 9.5, y: 52.5, nx: 20, ny: 2, type: 'male' }), 'gpio');
    keep(GX0 + P * 9.5, 52.5, 20 * P + 0.5, 2 * P + 0.5);
    for (let n = 1; n <= 40; n++) { const [x, y] = pinXY(n), [name, fn, kind] = GPIO[n - 1]; b.pin(x, y, name, `pin ${n} · ${fn}`, kind); }
    b.rect(GX0 + P * 9.5, 52.5, 20 * P + 0.3, 2 * P + 0.3, { lw: 0.15, side: 'bottom' });
    T('1', GX0 - 2.05, GY_ODD, { size: 0.8 }); T('2', GX0 - 2.05, GY_EVEN, { size: 0.8 });
    T('39', GX0 + P * 19 + 2.25, GY_ODD, { size: 0.8 }); T('40', GX0 + P * 19 + 2.25, GY_EVEN, { size: 0.8 });
    TB('1', GX0 - 2.05, GY_ODD, { size: 0.8 }); TB('40', GX0 + P * 19 + 2.25, GY_EVEN, { size: 0.8 });

    // PoE header J14 (2 × 2)
    const POE = { x: 58.9, y: 39.6 };
    b.tag(header(b, { x: POE.x, y: POE.y, nx: 2, ny: 2, type: 'male', pin1: false }), 'poe');
    keep(POE.x, POE.y, 2 * P + 0.5, 2 * P + 0.5);
    [['TR01', -1, 1], ['TR00', 1, 1], ['TR03', -1, -1], ['TR02', 1, -1]].forEach(([nm, i, j]) =>
      b.pin(POE.x + i * P / 2, POE.y + j * P / 2, nm, 'Ethernet transformer centre tap · PoE power, up to 57 V — for the PoE HAT only', 'pwr'));
    T('PoE', 63.0, 40.45, { size: 0.9 }); T('J14', 63.0, 39.0, { size: 0.7 });

    // J2: unpopulated pads RUN / GLOBAL_EN
    const J2 = { x: 17.94, y: 33.0 };
    [['GLOBAL_EN', 'short to GND to switch the whole board off', 'ctl'], ['GND', 'ground', 'gnd'], ['RUN', 'short to GND to reset the processor (reset button)', 'ctl']].forEach(([nm, fn, kind], i) => {
      const x = J2.x + (i - 1) * P;
      b.th(x, J2.y, { d: 1.6, hole: 0.9, square: i === 0 });
      b.pin(x, J2.y, nm, fn, kind);
    });
    b.rect(J2.x, J2.y, 3 * P, P - 0.3, { lw: 0.12 }); keep(J2.x, J2.y, 3 * P + 0.3, P);
    T('J2', J2.x - 5.0, J2.y, { size: 0.7 }); T('GLOBAL_EN', J2.x - 3.2, J2.y - 1.75, { size: 0.55 }); T('RUN', J2.x + P, J2.y - 1.75, { size: 0.55 });

    // ══════════════════ main chips ══════════════════
    const SOC = { x: 29.5, y: 32.5, s: 15 }, RAM = { x: 44, y: 34, w: 10, h: 14 }, VL = { x: 58, y: 30, s: 8 }, PHY = { x: 55.2, y: 45.3, s: 6 }, PM = { x: 12.5, y: 13 };
    b.tag(bga(b, { x: SOC.x, y: SOC.y, size: 15, h: 2.0, text: ['BROADCOM', 'BCM2711ZPKFSB06C0T', 'TA2105 P21'] }), 'soc'); keep(SOC.x, SOC.y, 15.5, 15.5);
    b.tag(bga(b, { x: RAM.x, y: RAM.y, rot: 90, size: [14, 10], h: 1.1, lid: false, text: ['SAMSUNG 928', 'K4F6E3S4HM-MGCJ', 'G2M197QC'] }), 'ram'); keep(RAM.x, RAM.y, 10.5, 14.5);
    b.tag(qfn(b, { x: VL.x, y: VL.y, size: 8, pins: 17, pitch: 0.4, text: ['VLI', 'VL805-Q6', '1924 QFN68'] }), 'usbctrl'); keep(VL.x, VL.y, 9, 9, 'top');
    b.tag(qfn(b, { x: PHY.x, y: PHY.y, size: 6, pins: 12, pitch: 0.4, text: ['BROADCOM', 'BCM54213PE', 'KMLG'] }), 'ethphy'); keep(PHY.x, PHY.y, 7, 7, 'top');
    b.tag(qfn(b, { x: PM.x, y: PM.y, size: 5, pins: 8, pitch: 0.5, text: ['MXL7704', 'R3 1921'] }), 'pmic'); keep(PM.x, PM.y, 6, 6, 'top');
    // buck inductors of the PMIC
    const LS = [[19.0, 11.2, 0], [19.0, 15.4, 0], [12.5, 19.4, 90], [7.4, 12.6, 90]];
    LS.forEach(([x, y, rot], i) => {
      b.tag(inductor(b, { x, y, rot, size: 3, h: 1.5, text: i < 2 ? '1R0' : '2R2' }), 'pmic');
      keep(x, y, rot ? 3.2 : 4.3, rot ? 4.3 : 3.2, 'top');
    });
    T('L1', 19.0, 13.3, { size: 0.5 }); T('L2', 19.0, 17.55, { size: 0.5 }); T('L3', 12.5, 22.1, { size: 0.5 }); T('L4', 7.4, 15.35, { size: 0.5 });
    T('U3', 15.95, 9.5, { size: 0.5 });
    // Wi-Fi / Bluetooth radio under its shield
    b.tag(shieldCan(b, { x: 12, y: 40.5, w: 11.5, l: 9.5, h: 1.9, text: [{ t: 'CYW43455', size: 1.0 }, { t: 'Wi-Fi 2.4 / 5 GHz  ·  BT 5.0', size: 0.6 }] }), 'wifi');
    keep(12, 40.5, 12.6, 10.6, 'top');
    // boot EEPROM, VL805 firmware flash, crystals
    soic(b, { x: 33.2, y: 10.7, n: 8, text: ['25X40CL', '1923'] }); keep(33.2, 10.7, 5.3, 6.4, 'top');
    qfn(b, { x: 61, y: 21.6, size: [3, 2], pins: [4, 0], pitch: 0.5, h: 0.6, text: ['25Q40'] }); keep(61, 21.6, 3.4, 3.2, 'top');
    crystalSMD(b, { x: 19.8, y: 28.2, rot: 90, size: [2.5, 2.0], text: '54.0' }); keep(19.8, 28.2, 2.3, 2.9, 'top');
    crystalSMD(b, { x: 52.6, y: 39.4, size: [3.2, 2.5], text: '25.000' }); keep(52.6, 39.4, 3.6, 2.9, 'top');
    T('X1', 17.75, 28.2, { size: 0.5 }); T('X2', 52.6, 37.55, { size: 0.5 });
    T('U2', 50.25, 28.55, { size: 0.5 }); T('U4', 62.95, 36.35, { size: 0.5 }); T('U5', 59.65, 48.15, { size: 0.5 }); T('U1', 23.0, 24.35, { size: 0.5 });
    // HDMI ESD protection arrays sitting right on the differential pairs
    for (const [x, y] of [[25.1, 9.5], [27.1, 11.7], [38.4, 9.5], [40.4, 11.7]]) { qfn(b, { x, y, size: [2.5, 1.0], pins: [5, 0], pitch: 0.5, h: 0.55, dot: false, silk: false }); keep(x, y, 2.7, 1.9, 'top'); }
    // status LEDs
    b.tag(led(b, { x: 1.5, y: 8.3, rot: 90, size: '0603', color: '#ff2a1c', on: true }), 'leds');
    b.tag(led(b, { x: 1.5, y: 11.5, rot: 90, size: '0603', color: '#27d64f' }), 'leds');
    keep(1.5, 8.3, 1.2, 2.4, 'top'); keep(1.5, 11.5, 1.2, 2.4, 'top');

    // ══════════════════ small parts, top side ══════════════════
    // PMIC surroundings
    pv('cap', 22.0, 11.2, 90, { size: '0805' }); pv('cap', 22.0, 15.4, 90, { size: '0805' });
    pv('cap', 23.4, 11.2, 90, { size: '0603' }); pv('cap', 23.4, 15.4, 90, { size: '0603' });
    pv('cap', 16.2, 19.4, 90, { size: '0805' }); pv('cap', 8.9, 19.4, 90, { size: '0805' }); pv('cap', 7.4, 9.0, 0, { size: '0805' });
    row('cap', [9.9, 10.9, 14.1, 15.1], 16.75, 90); row('cap', [10.2, 11.2, 13.8, 14.8], 9.45, 90);
    pv('res', 17.4, 2.6); pv('res', 17.4, 4.0); pv('cap', 19.6, 3.3, 90, { size: '0603' });
    pv('res', 3.4, 8.3, 90); pv('res', 3.4, 11.5, 90);
    pv('cap', 16.6, 22.6, 0, { size: '0603' }); pv('cap', 19.0, 22.6, 0, { size: '0603', color: 'brown' }); pv('res', 16.4, 24.4); pv('res', 18.0, 24.4); pv('cap', 20.6, 24.6, 90);
    pv('cap', 8.4, 16.4); pv('res', 9.6, 23.6, 90);
    // around the SoC
    col('cap', 21.0, [34.9, 35.9, 36.9, 37.9, 38.9, 39.9], 0); col('cap', 19.4, [35.2, 37.9, 39.3], 0); pv('res', 19.4, 36.5);
    pv('cap', 19.8, 26.2); pv('cap', 19.8, 30.25);
    row('cap', [22.6, 23.8, 25.0, 26.2, 27.4, 28.6], 41.3, 90);
    pv('res', 19.6, 43.7); pv('res', 21.4, 43.7); pv('cap', 24.2, 43.7, 0, { size: '0603' }); pv('cap', 26.8, 43.7, 0, { size: '0603', color: 'brown' }); pv('cap', 28.8, 43.5, 90);
    pv('cap', 19.6, 41.6, 90, { size: '0603' }); pv('cap', 21.2, 41.5, 90);
    col('cap', 23.1, [23.2, 22.2, 21.2], 0); pv('res', 23.1, 19.6); pv('res', 23.1, 18.6);
    col('cap', 29.7, [24.2, 23.2, 22.2], 0); col('res', 29.7, [20.6, 19.6], 0); pv('sot23', 29.7, 16.9, 90, { n: 3, text: 'A1s' }); pv('cap', 29.7, 14.2, 0, { size: '0603' });
    row('res', [37.2, 38.8, 40.4], 23.6, 90); pv('cap', 38.4, 21.6, 0, { size: '0603' }); pv('cap', 40.6, 21.6); pv('sot23', 40.0, 18.9, 0, { n: 5, text: 'S5B' });
    // right of the RAM, around the USB controller
    col('cap', 51.0, [29.8, 30.8, 31.8, 32.8, 33.8, 34.8, 35.8, 36.8], 0); col('cap', 52.6, [29.8, 30.8, 32.8, 33.8, 35.8], 0); col('res', 52.6, [31.8, 34.8, 36.8], 0);
    row('cap', [54.4, 55.6, 56.8, 58.0, 59.2, 60.4, 61.6], 35.45, 90); row('cap', [55.0, 56.2, 59.8, 61.0, 62.2], 24.75, 90);
    pv('cap', 64.6, 34.6, 0, { size: '0603' }); pv('cap', 67.2, 34.6, 0, { size: '0603' }); pv('cap', 69.4, 34.6);
    pv('tantalum', 66.5, 23.6, 0, { size: 'B', text: ['107', '6V'] }); pv('cap', 69.7, 23.6, 90, { size: '0603' });
    pv('sot23', 65.6, 19.4, 0, { n: 6, text: 'AP22' }); pv('cap', 68.6, 19.4, 0, { size: '0603' }); pv('res', 63.2, 18.4, 90);
    pv('cap', 66.6, 8.3, 90, { size: '0603' }); pv('cap', 68.4, 8.3, 90, { size: '0603' }); pv('res', 67.6, 12.5, 90); pv('res', 69.0, 12.5, 90); pv('cap', 68.2, 14.9, 0, { size: '0805' });
    pv('cap', 66.4, 3.4, 90, { size: '0805' }); pv('cap', 68.6, 3.4, 90, { size: '0805' }); pv('res', 70.4, 3.2, 90);
    // audio / camera corner
    pv('cap', 52.0, 16.6, 0, { size: '0603' }); pv('cap', 55.2, 16.6, 0, { size: '0603' }); row('res', [51.2, 52.6, 54.0, 55.4], 18.5, 90);
    pv('sot23', 51.9, 21.6, 0, { n: 6, text: 'T7' }); pv('sot23', 55.3, 21.6, 0, { n: 5, text: 'L4' });
    // Ethernet PHY
    col('cap', 50.4, [43.2, 44.8, 46.4, 48.0], 90); pv('cap', 55.3, 38.6, 90); pv('cap', 55.3, 40.3, 90);
    col('res', 65.5, [41.6, 39.9, 38.2], 0, { size: '0603', text: '750' });
    // radio / display corner
    row('cap', [8.2, 9.6, 11.0], 34.1, 90); pv('res', 8.2, 31.6, 90); pv('res', 9.4, 31.6, 90);
    passives(b, lists.top, { name: 'passives-top' });

    // ══════════════════ small parts, bottom side ══════════════════
    const bt = { side: 'bottom' };
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      if ((i * 7 + j * 3) % 11 === 0) continue;
      const big = (i + j) % 5 === 0;
      pv('cap', 24.3 + 2.1 * i, 27.0 + 2.3 * j, (i + j) % 2 ? 90 : 0, { ...bt, size: big ? '0603' : '0402', color: big ? 'brown' : 'tan' });
    }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) if ((i + 2 * j) % 7) pv('cap', 40.7 + 2.2 * i, 29.2 + 2.5 * j, i % 2 ? 0 : 90, bt);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== 1 || j !== 1) pv('cap', 55.8 + 2.2 * i, 27.8 + 2.2 * j, (i + j) % 2 ? 90 : 0, bt);
    pv('cap', 9.0, 15.2, 0, { ...bt, size: '0805' }); pv('cap', 12.0, 15.2, 0, { ...bt, size: '0805' }); pv('cap', 15.0, 15.4, 0, { ...bt, size: '0805' });
    pv('cap', 9.0, 17.6, 0, { ...bt, size: '0603' }); pv('cap', 11.6, 17.6, 0, { ...bt, size: '0603' }); pv('res', 14.0, 17.6, 0, bt); pv('res', 15.6, 17.6, 0, bt);
    pv('cap', 18.4, 37.4, 90, bt); pv('cap', 19.8, 37.4, 90, bt); pv('res', 21.2, 37.4, 90, bt);
    pv('cap', 62.5, 43.4, 0, { ...bt, size: '0603' }); pv('cap', 62.5, 45.2, 0, { ...bt, size: '0603' }); pv('res', 62.5, 47.0, 0, bt);
    pv('cap', 50.6, 26.6, 0, bt); pv('cap', 52.4, 26.6, 0, bt); pv('cap', 51.4, 31.0, 90, bt); pv('cap', 51.4, 34.0, 90, bt); pv('res', 52.8, 37.2, 0, bt);
    passives(b, lists.bottom, { name: 'passives-bottom' });

    // ══════════════════ Wi-Fi antenna: trapezoid cut in the copper near the top-left corner ══════════════════
    {
      const x0 = 0.75, x1 = 5.25, yb = 40.75, yt = 48.95, tap = 2.3, N = 36;                // wide side on the board edge
      for (let i = 0; i < N; i++) {
        const f = (i + 0.5) / N, x = x0 + (x1 - x0) * f, hh = (yt - yb) - 2 * tap * f;
        for (const side of ['top', 'bottom']) b.keepout(x, (yb + yt) / 2, (x1 - x0) / N + 0.02, hh, { side });
      }
      const poly = [[x0, yb], [x1, yb + tap], [x1, yt - tap], [x0, yt]];
      b.trace([...poly, poly[0]], { w: 0.2 }); b.trace([...poly, poly[0]], { w: 0.2, side: 'bottom' });
      b.trace([[x1, 45.4], [3.3, 45.4], [3.3, 42.9], [2.1, 42.9], [2.1, 46.9]], { w: 0.3 });     // radiating element
      b.trace([[6.3, 44.2], [5.6, 44.2], [5.25, 44.55], [5.25, 45.4]], { w: 0.3 });                // feed from the radio module
      occ.push([x0 - 0.3, yb - 0.3, x1 + 0.3, yt + 0.3]);
    }

    // ══════════════════ top-side traces ══════════════════
    // SoC → GPIO (right half of the odd row); the rest of the header is routed on the bottom layer
    const topPins = [19, 21, 23, 27, 29, 31, 33];
    fan(b, topPins.map((n, j) => ({ s: 30 + 0.8 * j, t: pinXY(n)[0], end: [pinXY(n)] })), SOC.y + 6.5, 42.5, 0.55);
    // SoC ↔ LPDDR4: short dense bus between the two packages
    for (let i = 0; i < 24; i++) if (i % 8 !== 7) b.trace([[SOC.x + 6.8, 28.2 + i * 0.42], [RAM.x - 4.6, 28.2 + i * 0.42]], { w: 0.14 });
    // HDMI0 / HDMI1: four differential pairs each (TMDS)
    ribbon(b, [[26.1, 26], [26.1, 7.3]], pairs(4, 1.0));
    ribbon(b, [[33.2, 26], [33.2, 20.2], [39.4, 14], [39.4, 7.3]], pairs(4, 1.0));
    // PCI Express: SoC → VL805 (runs below the RAM)
    ribbon(b, [[36.4, 25.75], [50.6, 25.75], [52.2, 27.35], [54.2, 27.35]], pairs(3, 0.72, 0.3));
    // VL805 → USB 3.0 stack (SuperSpeed pairs + USB 2.0 pairs), VL805 → USB 2.0 stack
    ribbon(b, [[61.8, 30], [71.6, 30]], pairs(6, 1.0));
    ribbon(b, [[58, 26.2], [58, 18.2], [65.6, 10.6], [71.6, 10.6]], pairs(2, 1.0));
    // Ethernet PHY → RJ45 (four pairs)
    ribbon(b, [[58, 44.9], [68, 44.9]], pairs(4, 0.95));
    // power: USB-C → PMIC → inductors → output capacitors
    b.trace([[11.6, 7.4], [12.5, 8.3], [12.5, 10.4]], { w: 0.6 });
    b.trace([[15.1, 12.2], [16.1, 11.2], [17.6, 11.2]], { w: 0.5 }); b.trace([[20.4, 11.2], [23.4, 11.2]], { w: 0.6 });
    b.trace([[15.1, 14.4], [16.1, 15.4], [17.6, 15.4]], { w: 0.5 }); b.trace([[20.4, 15.4], [23.4, 15.4]], { w: 0.6 });
    b.trace([[12.5, 15.6], [12.5, 18.0]], { w: 0.5 }); b.trace([[12.5, 20.8], [13.6, 21.4], [15.4, 21.4], [16.2, 20.6]], { w: 0.5 });
    b.trace([[9.9, 13.6], [9.3, 14.0], [7.4, 14.0]], { w: 0.5 }); b.trace([[7.4, 11.2], [7.4, 9.0]], { w: 0.5 });
    // crystals, LEDs, display stubs
    b.trace([[20.6, 27.6], [22.4, 27.6]], { w: 0.2 }); b.trace([[20.6, 28.8], [22.4, 28.8]], { w: 0.2 });
    for (const y of [8.3, 11.5]) b.trace([[1.5, y + 0.9], [2.0, y + 1.45], [2.9, y + 1.45], [3.4, y + 0.95], [3.4, y + 0.5]], { w: 0.2 });
    for (const y of [30, 32]) { b.trace([[6.6, y], [7.6, y]], { w: 0.15 }); b.via(7.75, y, { d: 0.5 }); }

    // ══════════════════ bottom-side traces ══════════════════
    {
      // GPIO: everything that is not routed on top goes from a via row above the SoC to the header on the bottom layer
      const items = [];
      for (let n = 1; n <= 40; n++) if (isSignal(n) && !topPins.includes(n)) {
        const [x, y] = pinXY(n);
        items.push(n % 2 ? { t: x, end: [[x, y]] } : { t: x + P / 2, end: [[x + P / 2, 52.5], [x, y]] });
      }
      items.sort((a, c) => a.t - c.t);
      items.forEach((it, i) => { it.s = 22.4 + 0.7 * i; b.via(it.s, 41.4, { side: 'bottom' }); });
      fan(b, items, 41.4, 42.6, 0.6, { side: 'bottom', w: 0.2 });
      // microSD: eight lines from the socket towards the SoC
      const SL = b.local(1.1, 28, 0, 'bottom');
      for (let i = 0; i < 8; i++) {
        const [px, py] = SL(12.75, (i - 3.5) * 1.1 - 0.3), ry = 28.3 + (py - 28.3) * 0.41, ex = 18.4 + 0.6 * (py > 28.3 ? 7 - i : i) * 0.5 + (i % 2) * 0.5;
        b.route([px, py], [16.8, ry], { w: 0.2, side: 'bottom' });
        b.trace([[16.8, ry], [ex, ry]], { w: 0.2, side: 'bottom' });
        b.via(ex, ry, { side: 'bottom', d: 0.5 });
      }
      // 5 V rail: wide trace from the USB-C corner to the USB sockets
      b.trace([[13.2, 8.2], [18.6, 13.6], [69.5, 13.6], [70.6, 12.5], [72, 12.5]], { w: 1.0, side: 'bottom' });
      b.trace([[66.4, 13.6], [66.4, 29.4], [67.5, 30.5], [72, 30.5]], { w: 1.0, side: 'bottom' });
      b.via(13.2, 8.2, { side: 'bottom', d: 0.9 });
    }

    // ══════════════════ silkscreen ══════════════════
    T('Raspberry Pi 4 Model B', 17.6, 48.45, { size: 1.25, weight: 700 });
    T('© Raspberry Pi 2018', 14.6, 46.6, { size: 0.85 });
    T('GPIO', 62.3, 48.25, { size: 1.0, weight: 700 }); T('J8', 65.35, 48.25, { size: 0.75 });
    T('POWER IN', 19.2, 7.9, { size: 0.8 });
    T('HDMI0', 29.5, 10.6, { size: 0.85, rot: 90 }); T('HDMI1', 42.3, 10.8, { size: 0.85, rot: 90 });
    T('CAMERA', 42.45, 19.6, { size: 0.9, rot: 90 }); T('DISPLAY', 8.3, 26.9, { size: 0.9, rot: 90 });
    T('A/V', 54, 14.65, { size: 0.9 });
    T('PWR', 4.7, 7.25, { size: 0.6 }); T('ACT', 3.4, 13.75, { size: 0.6 });
    // package corner marks
    const corner = (x, y, sx, sy) => b.line([[x - sx * 1.2, y], [x, y], [x, y - sy * 1.2]], { w: 0.15 });
    corner(SOC.x - 7.85, SOC.y + 7.85, -1, 1); corner(SOC.x + 7.85, SOC.y + 7.85, 1, 1);
    corner(RAM.x - 5.35, RAM.y + 7.35, -1, 1); corner(RAM.x + 5.35, RAM.y + 7.35, 1, 1);
    b.circle(SOC.x - 8.1, SOC.y - 8.1, 0.25, { fill: true });

    // bottom side
    TB('Raspberry Pi 4 Model B', 52, 17.2, { size: 1.5, weight: 700 });
    TB('© Raspberry Pi 2018', 52, 19.7, { size: 1.0 });
    TB('Made in the UK', 52, 21.8, { size: 0.9 });
    TB('FCC ID: 2ABCB-RPI4B', 32.6, 8.4, { size: 0.8 });
    TB('IC: 20953-RPI4B', 32.6, 10.0, { size: 0.8 });
    b.rect(25.5, 19.6, 7, 4.4, { fill: true, side: 'bottom', r: 0.3 }); keep(25.5, 19.6, 7.6, 5, 'bottom');   // blank label for the serial sticker
    b.rect(7.2, 28, 13.6, 13.6, { lw: 0.15, side: 'bottom', r: 0.4 });

    // designators next to the small parts (only where there is room, like on a real board)
    const cnt = {};
    for (const p of placed) {
      if (p.side !== 'top') continue;
      const pre = PREFIX[p.kind] || 'C', str = pre + (cnt[pre] = (cnt[pre] || 0) + 1), lw = str.length * 0.31 + 0.3, lh = 0.66;
      for (const [dx, dy] of [[0, p.hh + 0.5], [0, -p.hh - 0.5], [p.hw + lw / 2 + 0.15, 0], [-p.hw - lw / 2 - 0.15, 0]]) {
        if (rectFree(p.x + dx, p.y + dy, lw, lh, 'top')) { b.text(str, p.x + dx, p.y + dy, { size: 0.5 }); keep(p.x + dx, p.y + dy, lw + 0.2, lh + 0.1, 'top'); break; }
      }
    }

    // ══════════════════ test points (bottom) ══════════════════
    let tp = 0;
    const testPoints = (x0, y0, x1, y1, n) => {
      for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
        const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
        if (!isFree(x, y, 1.1, ['bottom'])) continue;
        const lab = rectFree(x, y + 1.4, 1.5, 0.7, 'bottom');
        b.pad(x, y, 1.2, 1.2, { shape: 'round', side: 'bottom' }); keep(x, y, 1.9, 1.9, 'bottom'); i++; tp++;
        if (lab) TB('TP' + tp, x, y + 1.4, { size: 0.5 });
      }
    };
    testPoints(16, 2.5, 50, 12, 9); testPoints(16, 15, 40, 25.5, 7); testPoints(40, 23, 66, 28, 4); testPoints(60, 33, 66, 41, 3);
    testPoints(2, 36, 22, 41, 4); testPoints(37, 40, 66, 49, 4); testPoints(2, 8, 20, 20, 3);

    // ══════════════════ vias ══════════════════
    sprinkle(18.2, 25, 21.8, 40, 12); sprinkle(18.5, 40.4, 29.4, 45.6, 12);
    sprinkle(21.8, 14, 24.2, 24.8, 6); sprinkle(28.2, 13, 31.2, 24.8, 5);
    sprinkle(49.4, 27, 53.6, 41.5, 10); sprinkle(35.5, 14.5, 43.2, 24.4, 8);
    sprinkle(59, 17, 70, 26.5, 12); sprinkle(62.4, 33.4, 66.8, 42.6, 8); sprinkle(58.6, 46.8, 66.6, 49.4, 4);
    sprinkle(5.8, 7.2, 24, 25, 26); sprinkle(6.8, 22, 21.6, 35.2, 18);
    sprinkle(49.6, 13.6, 57, 24.4, 8); sprinkle(64.6, 1.4, 70.4, 17, 8);
    sprinkle(1.2, 1.2, 70, 49.6, 40);

    return b.finish();
  },
};
