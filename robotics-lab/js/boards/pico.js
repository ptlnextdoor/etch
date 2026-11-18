// Raspberry Pi Pico (RP2040) — bare board without headers: gold pads with castellated half-holes along both long edges.
import * as THREE from 'three';
import { Board } from '../core/board.js';
import { Builder, M, colorMat } from '../core/builder.js';
import { qfn, led, diode, inductor, crystalSMD, button, passives } from '../core/parts-ic.js';
import { usbMicro } from '../core/parts-conn.js';

// ───────── board geometry ─────────
const W = 51, H = 21, T = 1.0;
const PITCH = 2.54, X0 = 1.37, EDGE = 1.61;      // first contact, and distance of the hole row from the board edge
const RC = 0.5, RH = 0.5;                         // radius of the edge half-hole and of the through hole
const PAD_W = 1.6, PAD_L = 3.2;                   // gold pad: width and length measured from the edge
const DBG_Y = [7.96, 10.5, 13.04];                // SWCLK, GND, SWDIO on the right end
const MOUNT = [[2, 4.8], [2, 16.2], [49, 4.8], [49, 16.2]];
const px = (i) => X0 + PITCH * i;
const THEME = { pour: '#16793a', base: '#0c5727', trace: '#1e8d48', silk: '#f3f3ec', edge: '#b4ad84' };   // the Pico's deeper green
const GOLD = colorMat('#e8c56e', 0.36, 0.82);                                                                 // pale ENIG gold

// [name, function, kind, bottom-side label]
const ROW_BOTTOM = [ // pins 1…20, counted from the USB end
  ['GP0', 'pin 1 · digital I/O · UART0 TX · I2C0 SDA · PWM 0A', 'dig'],
  ['GP1', 'pin 2 · digital I/O · UART0 RX · I2C0 SCL · PWM 0B', 'dig'],
  ['GND', 'pin 3 · ground', 'gnd'],
  ['GP2', 'pin 4 · digital I/O · SPI0 SCK · I2C1 SDA · PWM 1A', 'dig'],
  ['GP3', 'pin 5 · digital I/O · SPI0 TX · I2C1 SCL · PWM 1B', 'dig'],
  ['GP4', 'pin 6 · digital I/O · UART1 TX · I2C0 SDA · PWM 2A', 'dig'],
  ['GP5', 'pin 7 · digital I/O · UART1 RX · I2C0 SCL · PWM 2B', 'dig'],
  ['GND', 'pin 8 · ground', 'gnd'],
  ['GP6', 'pin 9 · digital I/O · SPI0 SCK · I2C1 SDA · PWM 3A', 'dig'],
  ['GP7', 'pin 10 · digital I/O · SPI0 TX · I2C1 SCL · PWM 3B', 'dig'],
  ['GP8', 'pin 11 · digital I/O · UART1 TX · I2C0 SDA · PWM 4A', 'dig'],
  ['GP9', 'pin 12 · digital I/O · UART1 RX · I2C0 SCL · PWM 4B', 'dig'],
  ['GND', 'pin 13 · ground', 'gnd'],
  ['GP10', 'pin 14 · digital I/O · SPI1 SCK · I2C1 SDA · PWM 5A', 'dig'],
  ['GP11', 'pin 15 · digital I/O · SPI1 TX · I2C1 SCL · PWM 5B', 'dig'],
  ['GP12', 'pin 16 · digital I/O · SPI1 RX · I2C0 SDA · PWM 6A', 'dig'],
  ['GP13', 'pin 17 · digital I/O · SPI1 CSn · I2C0 SCL · PWM 6B', 'dig'],
  ['GND', 'pin 18 · ground', 'gnd'],
  ['GP14', 'pin 19 · digital I/O · SPI1 SCK · I2C1 SDA · PWM 7A', 'dig'],
  ['GP15', 'pin 20 · digital I/O · SPI1 TX · I2C1 SCL · PWM 7B', 'dig'],
];
const ROW_TOP = [ // pins 40…21, counted from the USB end
  ['VBUS', 'pin 40 · 5 V straight from the USB connector (output; only present with a cable plugged in)', 'pwr'],
  ['VSYS', 'pin 39 · main power input of the board: 1.8–5.5 V (batteries, Li-ion cell)', 'pwr'],
  ['GND', 'pin 38 · ground', 'gnd'],
  ['3V3_EN', 'pin 37 · regulator enable: pull it to GND and the 3.3 V rail switches off', 'ctl'],
  ['3V3(OUT)', 'pin 36 · 3.3 V power output for sensors (up to ≈300 mA)', 'pwr'],
  ['ADC_VREF', 'pin 35 · ADC reference voltage (normally 3.3 V through a filter)', 'ana'],
  ['GP28', 'pin 34 · analog input ADC2 or digital I/O · PWM 6A', 'ana', 'GP28_A2'],
  ['AGND', 'pin 33 · quiet ground for analog measurements', 'gnd'],
  ['GP27', 'pin 32 · analog input ADC1 or digital I/O · I2C1 SCL · PWM 5B', 'ana', 'GP27_A1'],
  ['GP26', 'pin 31 · analog input ADC0 or digital I/O · I2C1 SDA · PWM 5A', 'ana', 'GP26_A0'],
  ['RUN', 'pin 30 · reset: short it to GND briefly and the program restarts', 'ctl'],
  ['GP22', 'pin 29 · digital I/O · PWM 3A', 'dig'],
  ['GND', 'pin 28 · ground', 'gnd'],
  ['GP21', 'pin 27 · digital I/O · I2C0 SCL · PWM 2B', 'dig'],
  ['GP20', 'pin 26 · digital I/O · I2C0 SDA · PWM 2A', 'dig'],
  ['GP19', 'pin 25 · digital I/O · SPI0 TX · I2C1 SCL · PWM 1B', 'dig'],
  ['GP18', 'pin 24 · digital I/O · SPI0 SCK · I2C1 SDA · PWM 1A', 'dig'],
  ['GND', 'pin 23 · ground', 'gnd'],
  ['GP17', 'pin 22 · digital I/O · SPI0 CSn · UART0 RX · PWM 0B', 'dig'],
  ['GP16', 'pin 21 · digital I/O · SPI0 RX · UART0 TX · PWM 0A', 'dig'],
];
const ROW_DEBUG = [
  ['SWCLK', 'SWD debug: clock (goes to a debugger such as the Debug Probe)', 'ctl'],
  ['GND', 'ground for the debugger', 'gnd'],
  ['SWDIO', 'SWD debug: data line', 'ctl'],
];

/** Board outline with a semicircular castellation notch at every contact. */
function outline() {
  const pts = [], r = 0.4, N = 10, P = Math.PI;
  const arc = (cx, cy, rad, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]); } };
  arc(r, r, r, P, 1.5 * P, 4);
  for (let i = 0; i < 20; i++) arc(px(i), 0, RC, P, 0, N);
  arc(W - r, r, r, 1.5 * P, 2 * P, 4);
  for (const y of DBG_Y) arc(W, y, RC, 1.5 * P, 0.5 * P, N);
  arc(W - r, H - r, r, 0, 0.5 * P, 4);
  for (let i = 19; i >= 0; i--) arc(px(i), H, RC, 0, -P, N);
  arc(r, H - r, r, 0.5 * P, P, 4);
  return pts;
}

/** Gold contact pad: origin = centre of the half-hole on the board edge, +y points into the board. */
function padShape(square) {
  const s = new THREE.Shape(), hw = PAD_W / 2, L = PAD_L, c = 0.14;
  s.moveTo(-hw, 0); s.lineTo(-RC, 0); s.absarc(0, 0, RC, Math.PI, 0, true); s.lineTo(hw, 0);
  if (square) {
    s.lineTo(hw, L - c); s.absarc(hw - c, L - c, c, 0, Math.PI / 2, false);
    s.lineTo(-hw + c, L); s.absarc(-hw + c, L - c, c, Math.PI / 2, Math.PI, false);
  } else {
    s.lineTo(hw, L - hw); s.absarc(0, L - hw, hw, 0, Math.PI, false);
  }
  s.lineTo(-hw, 0);
  const h = new THREE.Path(); h.absarc(0, EDGE, RH, 0, Math.PI * 2, true); s.holes.push(h);
  return s;
}

/** Inner wall of a plated hole (normals face the axis). Arc a0…a1 in board coordinates. */
function innerTube(r, h0, h1, a0 = 0, a1 = Math.PI * 2, seg = 20) {
  const pos = [], nor = [], uv = [];
  const p = (t, y) => [r * Math.cos(t), y, -r * Math.sin(t)], n = (t) => [-Math.cos(t), 0, Math.sin(t)];
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + (a1 - a0) * i / seg, t1 = a0 + (a1 - a0) * (i + 1) / seg;
    const A = p(t0, h0), B2 = p(t1, h0), C = p(t1, h1), D = p(t0, h1), n0 = n(t0), n1 = n(t1);
    pos.push(...A, ...C, ...B2, ...A, ...D, ...C);
    nor.push(...n0, ...n1, ...n1, ...n0, ...n0, ...n1);
    uv.push(0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export default {
  id: 'pico',
  name: 'Raspberry Pi Pico', maker: 'Raspberry Pi', year: 2021,
  tagline: 'Two cores for four dollars',
  level: 'Beginner',
  accent: '#1d8a43',
  summary: 'A tiny, very cheap board built around the RP2040 — the first microcontroller chip Raspberry Pi designed in-house. You program it in MicroPython or C/C++: plug it into USB and it shows up like an ordinary flash drive. A great pick for learning and for building small robots.',
  specs: [
    ['Microcontroller', 'RP2040, dual-core Arm Cortex-M0+'],
    ['Clock speed', 'up to 133 MHz'],
    ['Flash memory', '2 MB (separate QSPI chip)'],
    ['RAM', '264 KB'],
    ['GPIO pins', '26 (GP0–GP22, GP26–GP28)'],
    ['Analog inputs', '3 × 12-bit ADC + temperature sensor'],
    ['PWM', '16 channels'],
    ['Interfaces', '2 × UART, 2 × SPI, 2 × I2C, USB 1.1, PIO'],
    ['Logic level', '3.3 V (not 5 V tolerant!)'],
    ['Power', '5 V over USB or 1.8–5.5 V on VSYS'],
    ['Size', '51 × 21 mm, 1 mm thick PCB'],
    ['Languages', 'MicroPython, C/C++, Arduino'],
  ],
  compare: { mcu: 'RP2040', clock: '133 MHz', flash: '2 MB', ram: '264 KB', gpio: '26', analog: '3 (12-bit)', wireless: '—', logic: '3.3 V', price: '≈ $4' },
  highlights: [
    'Very low price for two cores and 264 KB of RAM',
    'No programmer needed: hold BOOTSEL, plug in USB and drag a .uf2 file onto the drive',
    'MicroPython out of the box: write code and see the result straight away',
    'PIO blocks: build your own precise protocols for addressable LEDs, encoders and servos',
  ],
  cautions: [
    '3.3 V logic. A 5 V signal (from an Arduino Uno or an HC-SR04 sensor, for example) can burn an input — use a voltage divider or a level shifter.',
    'A single pin supplies only a few milliamps (4 mA by default, 12 mA at most). Power motors, servos and LED strips separately and switch them through a driver or a transistor.',
    'Draw no more than ≈300 mA from 3V3(OUT). Do not feed VSYS while USB is plugged in unless you add a protection diode.',
    'Headers are not soldered and there is no reset button: you will need a soldering iron and, if you want one, your own button between RUN and GND.',
  ],
  uses: [
    'Line-following robot: two motors through a driver and sensors on the analog inputs GP26–GP28',
    'Remote control or macro keypad: the Pico can pretend to be a USB keyboard or gamepad',
    'Driving a strip of addressable LEDs with PIO',
    'Weather station with an I2C sensor and a small display',
    'Servo controller for a robot arm or a walking robot (16 PWM channels)',
  ],
  parts: {
    mcu: { name: 'RP2040 microcontroller', text: 'The brain of the board: two Cortex-M0+ cores running at up to 133 MHz with 264 KB of RAM. It runs your program and controls every pin from GP0 to GP28. It has no program memory inside — that is why a separate flash chip sits next to it.' },
    flash: { name: 'W25Q16JV flash memory, 2 MB', text: 'This is where the firmware and your MicroPython files live — they survive a power-off. The RP2040 reads the program from here over a fast QSPI bus. 2 MB is enough for the Python interpreter and hundreds of your scripts.' },
    usb: { name: 'Micro-USB connector', text: 'It brings in 5 V power and connects the board to a computer for uploading programs and printing text to a console. The RP2040 speaks USB by itself, so there is no separate USB-to-serial chip here.' },
    bootsel: { name: 'BOOTSEL button', text: 'Hold it down while plugging in the USB cable and the Pico appears on your computer as a drive called RPI-RP2. Drop a .uf2 file onto it and the new firmware is written automatically. This always works, even if your program has crashed.' },
    led: { name: 'LED (GP25)', text: 'The only LED on the board, and it is green. It is wired to pin GP25 and controlled by your program — everyone starts with it: "blink the LED". The Pico has no separate power indicator.' },
    crystal: { name: '12 MHz crystal', text: 'Sets the precise heartbeat of the microcontroller. From these 12 MHz the chip multiplies up to 125–133 MHz for the cores and exactly 48 MHz for USB. Without an accurate clock USB simply would not work.' },
    reg: { name: 'RT6150 regulator (3.3 V)', text: 'A switching converter that turns anything from 1.8 to 5.5 V on VSYS into a steady 3.3 V. It can step the voltage both down and up, so the Pico runs from USB, from two AA batteries or from a lithium cell.' },
    coil: { name: 'Regulator inductor', text: 'A coil that works as the switching regulator\'s partner. It stores energy and hands it out in small portions, so the voltage is converted with almost no heat and very little loss.' },
    diode: { name: 'Schottky diode (VBUS → VSYS)', text: 'Lets current flow from USB (VBUS) to the board supply (VSYS) but not backwards. Thanks to it, a battery connected to VSYS cannot push current into your computer through the USB cable.' },
    pads_gpio: { name: 'Contact pads (40 pins)', text: 'Twenty gold contacts along each long side: 26 GPIO pins plus power and ground. Solder pin headers into the holes for a breadboard, or use the half-holes on the edge to solder the Pico flat onto another board like a component.' },
    debug: { name: 'SWD debug pads', text: 'Three contacts on the end: SWCLK, GND and SWDIO. A debugger connects here to step through a C/C++ program and look inside the chip\'s memory. Beginners do not need them — you can flash over USB.' },
    testpads: { name: 'Test points TP1–TP6', text: 'Round gold pads on the underside. At the factory, spring probes press against them to test the board. They carry ground, the USB data lines, the LED signal and the BOOTSEL button.' },
  },
  partOrder: ['mcu', 'flash', 'usb', 'bootsel', 'led', 'crystal', 'reg', 'coil', 'diode', 'pads_gpio', 'debug', 'testpads'],
  pinNotes: [
    { title: 'Power', text: 'VBUS is 5 V from USB. VSYS is the main power input (1.8–5.5 V): connect batteries here. 3V3(OUT) gives a ready 3.3 V for sensors. Ground (GND) pads are the square ones — there are eight of them.' },
    { title: 'Digital pins', text: 'GP0–GP22 and GP26–GP28 are 3.3 V inputs and outputs. Any of them can output PWM and trigger an interrupt. UART, I2C and SPI can be assigned to several different groups of pins.' },
    { title: 'Analog inputs', text: 'GP26, GP27 and GP28 are ADC inputs (ADC0–ADC2): they measure a voltage from 0 to 3.3 V with 12-bit resolution. ADC_VREF and AGND are the reference and ground for precise measurements.' },
    { title: 'Special pins', text: 'RUN is reset (short it to GND). 3V3_EN switches the regulator off. GP25 is not brought out to a pad — the on-board LED sits on it.' },
    { title: 'Numbering', text: 'On the top only pins 1, 2 and 39 are marked — all the names are printed on the underside. Pin 1 (GP0) is to the left of the USB connector when you hold the board with the connector pointing up.' },
  ],
  code: {
    title: 'First program: blink the LED (MicroPython)', lang: 'python',
    src: `from machine import Pin   # access to the pins
import time               # delays

led = Pin(25, Pin.OUT)    # on-board LED on GP25, set as an output

while True:               # repeat forever
    led.toggle()          # flip it: on <-> off
    time.sleep(0.5)       # wait half a second
`,
  },
  quiz: [
    { q: 'Find the RP2040 microcontroller — the brain of the board', part: 'mcu', hint: 'The largest square black chip' },
    { q: 'Which button do you hold to load new firmware?', part: 'bootsel', hint: 'The only button on the board, with a white plunger' },
    { q: 'Where is your program stored when the power is off?', part: 'flash', hint: 'A small black chip between the button and the RP2040' },
    { q: 'Find the LED controlled by pin GP25', part: 'led', hint: 'A tiny part next to the USB connector, labelled "LED"' },
    { q: 'Which part sets the precise 12 MHz clock?', part: 'crystal', hint: 'A small rectangle with a metal lid next to the RP2040' },
    { q: 'Where does an SWD debugger connect?', part: 'debug', hint: 'Three gold contacts on the end opposite the USB connector' },
  ],
  facts: [
    'The name RP2040 is a code: RP for Raspberry Pi, 2 for two cores, 0 for the Cortex-M0+ core type, 4 for the amount of RAM and 0 for no built-in flash memory.',
    'The Pico launched in January 2021 for 4 dollars — cheaper than a cup of coffee. The board itself is marked "© 2020".',
    'Edges with half-holes are called castellations — they look like the battlements on top of a castle wall.',
  ],

  build(opts = {}) {
    const holes = MOUNT.map(([x, y]) => ({ x, y, d: 2.1 }));
    for (let i = 0; i < 20; i++) holes.push({ x: px(i), y: EDGE, d: RH * 2 }, { x: px(i), y: H - EDGE, d: RH * 2 });
    for (const y of DBG_Y) holes.push({ x: W - EDGE, y, d: RH * 2 });
    const b = new Board({ w: W, h: H, t: T, theme: THEME, finish: 'gold', outline: outline(), holes, quality: opts.quality ?? 1 });

    // ───────── contacts: pads, holes, castellations, pins ─────────
    const padsB = new Builder(), dbgB = new Builder();
    const shRound = padShape(false), shSquare = padShape(true);
    /** x, y = centre of the half-hole on the edge; rz = rotation that makes the pad's +y point into the board. */
    const edgePad = (B, x, y, rz, square) => {
      const L = b.local(x, y, rz);
      for (const side of ['top', 'bottom']) {
        if (square) { const [cx, cy] = L(0, PAD_L / 2 - 0.1); b.pad(cx, cy, PAD_W, PAD_L + 0.2, { rot: rz, side }); }
        else {
          const [cx, cy] = L(0, 0.8); b.pad(cx, cy, PAD_W, 1.8, { rot: rz, side });
          const [ox, oy] = L(0, 1.9); b.pad(ox, oy, PAD_W, 2.6, { rot: rz, side, shape: 'oval' });
        }
      }
      const sh = square ? shSquare : shRound;
      B.extrude(sh, 0.03, GOLD, x, y, 0, rz);
      B.extrude(sh, 0.03, GOLD, x, y, -T - 0.03, rz);
      const [hx, hy] = L(0, EDGE);
      B.geo(innerTube(RH - 0.025, -T - 0.03, 0.03), GOLD, hx, hy, 0);
      B.geo(innerTube(RC - 0.025, -T - 0.03, 0.03, 0, Math.PI, 12), GOLD, x, y, 0, rz);
    };
    ROW_BOTTOM.forEach(([name, fn, kind], i) => { edgePad(padsB, px(i), 0, 0, name === 'GND'); b.pin(px(i), EDGE, name, fn, kind); });
    ROW_TOP.forEach(([name, fn, kind], i) => { edgePad(padsB, px(i), H, 180, name === 'GND' || name === 'AGND'); b.pin(px(i), H - EDGE, name, fn, kind); });
    ROW_DEBUG.forEach(([name, fn, kind], i) => { edgePad(dbgB, W, DBG_Y[i], 90, name === 'GND'); b.pin(W - EDGE, DBG_Y[i], name, fn, kind); });
    b.tag(b.place(padsB.build('pads'), 0, 0), 'pads_gpio');
    b.tag(b.place(dbgB.build('debug'), 0, 0), 'debug');

    // ───────── traces, top ─────────
    const tr = (pts, w = 0.15, side = 'top') => b.trace(pts, { w, side });
    // bottom side of the chip → bottom row (GP6…GP11)
    tr([[31.2, 6.7], [31.2, 6.3], [30.8, 5.9], [23.99, 5.9], [21.69, 3.6], [21.69, 2.6]]);
    tr([[31.6, 6.7], [31.6, 5.9], [31.2, 5.5], [26.13, 5.5], [24.23, 3.6], [24.23, 2.6]]);
    tr([[32.4, 6.7], [32.4, 5.5], [32.0, 5.1], [28.27, 5.1], [26.77, 3.6], [26.77, 2.6]]);
    tr([[32.8, 6.7], [32.8, 5.1], [32.4, 4.7], [30.41, 4.7], [29.31, 3.6], [29.31, 2.6]]);
    tr([[33.2, 6.7], [33.2, 4.79], [34.39, 3.6], [34.39, 2.6]]);
    tr([[33.6, 6.7], [33.6, 6.3], [34.0, 5.9], [34.63, 5.9], [36.93, 3.6], [36.93, 2.6]]);
    // right side of the chip → GP12…GP15, crystal, SWD, GP16, GP17
    tr([[34.8, 7.9], [35.3, 7.9], [39.47, 3.73], [39.47, 2.6]]);
    tr([[34.8, 8.3], [35.55, 8.3], [38.85, 5.0], [40.61, 5.0], [42.01, 3.6], [42.01, 2.6]]);
    tr([[34.8, 8.7], [35.8, 8.7], [39.1, 5.4], [45.29, 5.4], [47.09, 3.6], [47.09, 2.6]]);
    tr([[34.8, 9.1], [36.05, 9.1], [38.65, 6.5], [49.9, 6.5], [50.35, 6.05], [50.35, 2.8]]);
    tr([[34.8, 9.9], [36.4, 9.9], [37.6, 8.7], [38.2, 8.5]]);                                   // XIN
    tr([[34.8, 10.3], [36.9, 10.3], [37.6, 11.0], [40.6, 11.0], [40.6, 10.5]]);                 // XOUT
    tr([[41.0, 8.4], [41.6, 8.45]], 0.2); tr([[41.0, 10.2], [41.6, 10.15]], 0.2);               // load capacitors
    tr([[34.8, 11.5], [46.5, 11.5], [47.3, 10.7], [47.3, 8.5], [47.84, 7.96], [48.5, 7.96]]);   // SWCLK
    tr([[34.8, 11.9], [45.9, 11.9], [47.04, 13.04], [48.5, 13.04]]);                            // SWDIO
    tr([[34.8, 12.7], [35.7, 12.7], [36.6, 13.6], [44.5, 13.6], [45.4, 14.5], [49.9, 14.5], [50.35, 14.95], [50.35, 18.2]]);
    tr([[34.8, 13.1], [35.3, 13.1], [36.2, 14.0], [43.69, 14.0], [47.09, 17.4], [47.09, 18.4]]);
    // top side of the chip → top row
    tr([[33.6, 14.3], [33.6, 14.4], [34.0, 14.8], [39.41, 14.8], [42.01, 17.4], [42.01, 18.4]]);
    tr([[33.2, 14.3], [33.2, 14.8], [33.6, 15.2], [37.27, 15.2], [39.47, 17.4], [39.47, 18.4]]);
    tr([[32.8, 14.3], [32.8, 15.2], [33.2, 15.6], [35.13, 15.6], [36.93, 17.4], [36.93, 18.4]]);
    tr([[32.4, 14.3], [32.4, 15.6], [32.8, 16.0], [32.99, 16.0], [34.39, 17.4], [34.39, 18.4]]);
    tr([[31.6, 14.3], [31.6, 15.6], [31.2, 16.0], [30.71, 16.0], [29.31, 17.4], [29.31, 18.4]]);
    tr([[30.0, 14.3], [30.0, 15.2], [29.6, 15.6], [26.03, 15.6], [24.23, 17.4], [24.23, 18.4]]);
    tr([[29.6, 14.3], [29.6, 14.8], [29.2, 15.2], [23.89, 15.2], [21.69, 17.4], [21.69, 18.4]]);
    tr([[29.2, 14.3], [29.2, 14.4], [28.8, 14.8], [19.21, 14.8], [16.61, 17.4], [16.61, 18.4]]);
    // left side of the chip → QSPI flash
    tr([[27.2, 7.9], [18.65, 7.9], [18.25, 8.3], [18.25, 9.3]]);
    tr([[27.2, 8.3], [19.15, 8.3], [18.75, 8.7], [18.75, 9.3]]);
    tr([[27.2, 8.7], [19.45, 8.7], [19.25, 8.9], [19.25, 9.3]]);
    tr([[27.2, 9.1], [21.8, 9.1], [21.4, 9.5], [21.4, 11.8], [21.0, 12.2], [20.05, 12.2], [19.75, 11.9], [19.75, 11.7]]);
    tr([[27.2, 9.5], [22.2, 9.5], [21.8, 9.9], [21.8, 12.2], [21.4, 12.6], [19.65, 12.6], [19.25, 12.2], [19.25, 11.7]]);
    tr([[27.2, 9.9], [22.6, 9.9], [22.2, 10.3], [22.2, 12.6], [21.8, 13.0], [19.15, 13.0], [18.75, 12.6], [18.75, 11.7]]);
    // USB D+ / D−: chip → 27 Ω resistors → over the flash → between the button and the regulator → connector
    tr([[27.2, 11.5], [26.6, 11.5], [26.3, 11.2], [26.0, 11.2]]);
    tr([[27.2, 11.9], [26.4, 11.9], [26.3, 12.0], [26.0, 12.0]]);
    tr([[25.0, 11.2], [24.6, 11.2], [22.4, 13.4], [17.3, 13.4], [16.9, 13.0], [16.9, 11.3], [16.5, 10.9], [6.8, 10.9], [6.4, 10.5], [5.4, 10.5]]);
    tr([[25.0, 12.0], [24.6, 12.0], [22.8, 13.8], [17.1, 13.8], [16.5, 13.2], [16.5, 11.7], [16.1, 11.3], [6.6, 11.3], [6.45, 11.15], [5.4, 11.15]]);
    // GP0: via next to the LED → pin 1 pad (squeezing past the mounting hole)
    b.via(5.3, 3.9);
    tr([[5.3, 3.9], [4.9, 3.5], [2.0, 3.5], [1.6, 3.1], [1.37, 2.6]]);
    // power: VBUS → diode → VSYS, regulator, 3V3
    tr([[5.5, 11.8], [6.4, 12.7], [7.0, 12.7], [7.65, 13.35], [7.65, 15.5]], 0.4); b.via(6.0, 12.3);
    tr([[4.3, 15.6], [4.3, 16.9], [3.91, 17.4], [3.91, 18.3]], 0.4);
    tr([[4.2, 15.4], [3.6, 14.8]], 0.3); b.via(3.6, 14.7);
    b.via(7.1, 9.8); tr([[7.1, 9.8], [7.6, 8.4]], 0.4); tr([[7.6, 8.3], [8.5, 8.3], [8.9, 8.2]], 0.3);
    tr([[14.7, 7.2], [14.7, 9.9]], 0.4); tr([[13.7, 8.7], [14.6, 8.7]], 0.4); b.via(14.7, 9.95);
    // LED
    tr([[5.7, 5.0], [6.9, 5.0]], 0.2); tr([[8.1, 5.0], [8.4, 4.4]], 0.2); b.via(8.4, 4.25);
    // ADC_VREF filter
    tr([[14.7, 16.6], [14.07, 17.3], [14.07, 18.3]], 0.2);

    for (const [x, y] of [[43.3, 16.0], [20.4, 16.4]]) b.via(x, y);     // ground stitching

    // ───────── traces, bottom ─────────
    const bt = (pts, w = 0.15) => tr(pts, w, 'bottom');
    // GP1, GP0, GP25 (LED), GP2…GP5: fan out from vias under the chip as a bundle, then drop to the pads
    // through the gaps between the silkscreen labels and enter each pad from the side
    const bundle = [
      [4.85, [[4.85, 3.5], [4.3, 2.95], [3.91, 2.6]]],          // GP1
      [5.3, [[5.3, 3.9]]],                                       // GP0 → via → top layer
      [7.72, [[7.72, 4.93], [8.4, 4.25]]],                       // GP25 → via → LED resistor
      ...[3, 4, 5, 6].map((i) => [px(i) + 1.27, [[px(i) + 1.27, 3.5], [px(i) + 0.5, 2.73], [px(i), 2.6]]]),   // GP2…GP5
    ];
    bundle.forEach(([gx, tail], j) => {
      const vx = 28.0 + 0.6 * j, vy = 9.9 + (j % 2) * 0.6, ly = 9.3 - 0.4 * j;
      b.via(vx, vy);
      bt([[vx, vy], [vx, ly + 0.4], [vx - 0.4, ly], [gx + (ly - 6.6), ly], [gx, 6.6], ...tail]);
    });
    // RUN
    b.via(33.4, 13.2);
    bt([[33.4, 13.2], [28.8, 17.8], [27.3, 17.8], [26.77, 18.3]]);
    // VBUS around the mounting hole
    bt([[6.0, 12.3], [5.9, 12.2], [1.3, 12.2], [0.55, 12.95], [0.55, 17.9], [0.9, 18.3], [1.37, 18.6]], 0.3);
    // VSYS → regulator input, 3V3 → pin 36
    bt([[3.6, 14.7], [4.3, 14.0], [6.4, 14.0], [7.1, 13.3], [7.1, 9.8]], 0.4);
    bt([[14.7, 9.95], [12.8, 11.85], [12.8, 16.9], [11.9, 17.8], [11.53, 18.2]], 0.5);

    // ───────── parts ─────────
    b.tag(usbMicro(b, { x: -1.3, y: H / 2 }), 'usb');
    b.tag(qfn(b, { x: 31, y: 10.5, size: 7, pins: 14, pitch: 0.4, text: ['RP2-B2', '20/34', 'P64M15.00'], silk: false }), 'mcu');
    b.tag(qfn(b, { x: 19, y: 10.5, size: [3, 2], pins: [4, 0], pitch: 0.5, h: 0.6, text: ['Q16JV'], silk: false }), 'flash');
    b.tag(button(b, { x: 12.2, y: 13.5, type: 'smd', cap: 'white' }), 'bootsel');
    b.tag(led(b, { x: 4.7, y: 5.0, size: '0603', color: '#19e05a', on: true }), 'led');
    b.tag(crystalSMD(b, { x: 39.4, y: 9.3, size: [3.2, 2.5], h: 0.8, text: 'A12.0' }), 'crystal');
    b.tag(qfn(b, { x: 9.9, y: 6.6, size: 3, pins: [5, 0], pitch: 0.5, h: 0.75, text: ['6150', 'B 0K'], silk: false }), 'reg');
    b.tag(inductor(b, { x: 13.4, y: 6.6, size: [2.5, 2.0], h: 1.0, text: '2R2' }), 'coil');
    b.tag(diode(b, { x: 6.0, y: 15.6, pkg: 'sod123', text: 'B2' }), 'diode');
    const C4 = { size: '0402' }, C6 = { size: '0603' };
    passives(b, [
      ['cap', 26.3, 13.2, 0, C4], ['cap', 26.3, 6.9, 0, C4], ['cap', 24.9, 6.9, 0, C4],      // RP2040 decoupling
      ['res', 25.5, 11.2, 0, C4], ['res', 25.5, 12.0, 0, C4],                                   // USB 27 Ω
      ['cap', 42.1, 8.45, 0, C4], ['cap', 42.1, 10.15, 0, C4],                                  // crystal load
      ['cap', 7.6, 7.4, 90, C6], ['cap', 12.9, 8.7, 0, C6], ['cap', 13.4, 4.5, 0, C6],         // regulator in / out
      ['res', 9.2, 9.1, 0, C4], ['res', 10.7, 9.1, 0, C4],
      ['res', 7.5, 5.0, 0, C4],                                                                 // LED resistor
      ['sot23', 17.3, 5.7, 0, { n: 3 }], ['res', 19.5, 5.1, 0, C4], ['res', 19.5, 6.1, 0, C4], // VSYS/3 divider switch
      ['cap', 15.3, 16.6, 0, C4], ['res', 10.9, 16.3, 0, C4], ['cap', 8.95, 16.9, 0, C4],
      ['cap', 44.4, 16.9, 0, C4], ['cap', 36.6, 5.3, 315, C4], ['cap', 21.3, 6.9, 0, C4],
      ['cap', 27.7, 16.6, 0, C4], ['cap', 23.3, 6.9, 0, C4], ['cap', 24.6, 10.45, 0, C4],
      ['cap', 16.2, 8.9, 0, C4], ['res', 16.2, 7.9, 0, C4],
    ]);

    // ───────── test points (bottom) ─────────
    const TP = [['TP1', 5.6, 9.3, 5.6, 10.45], ['TP2', 3.0, 10.3, 3.0, 11.42], ['TP3', 3.0, 8.3, 3.0, 7.15],
      ['TP4', 10.3, 10.65, 8.55, 10.65], ['TP5', 16.0, 10.65, 17.85, 10.65], ['TP6', 21.0, 10.65, 22.85, 10.65]];
    const tpB = new Builder();
    for (const [name, x, y, lx, ly] of TP) {
      b.pad(x, y, 1.5, 1.5, { shape: 'round', side: 'bottom' });
      tpB.cyl(0.75, 0.03, GOLD, x, y, -T - 0.03, { seg: 24 });
      b.text(name, lx, ly, { size: 0.62, side: 'bottom', rot: 180 });
    }
    b.tag(b.place(tpB.build('testpads'), 0, 0), 'testpads');

    // ───────── silkscreen, top ─────────
    b.text('1', 0.5, 4.8, { size: 0.7, rot: 90 });
    b.text('2', px(1), 4.2, { size: 0.75, rot: 90 });
    b.text('39', 3.5, 17.2, { size: 0.68, rot: 90 });
    b.text('LED', 5.25, 6.9, { size: 0.75, rot: 90 });
    b.text('USB', 5.05, 13.6, { size: 0.75, rot: 90 });
    b.text('BOOTSEL', 15.8, 13.5, { size: 0.75, rot: 90 });
    b.text('Raspberry Pi Pico', 43.6, 9.0, { size: 0.82, rot: 90, weight: 700 });
    b.text('© 2020', 44.95, 9.0, { size: 0.75, rot: 90 });
    b.text('DEBUG', 46.35, 10.5, { size: 0.72, rot: 90 });

    // ───────── silkscreen, bottom ─────────
    // corner labels dodge the mounting holes: past the hole at the USB end, squeezed along the board edge at the debug end
    const lab = (name, i, y, align) => {
      if (i === 19) b.text(name, 50.55, y, { size: 0.68, rot: 90, side: 'bottom', align });
      else b.text(name, px(i), i ? y : y + (align === 'right' ? 2.75 : -2.75), { size: 0.82, rot: 90, side: 'bottom', align });
    };
    ROW_BOTTOM.forEach(([name], i) => lab(name, i, PAD_L + 0.45, 'right'));
    ROW_TOP.forEach(([name, , , label], i) => lab(label || name, i, H - PAD_L - 0.45, 'left'));
    ROW_DEBUG.forEach(([name], i) => b.text(name, W - PAD_L - 0.45, DBG_Y[i], { size: 0.8, side: 'bottom', rot: 180, align: 'right' }));
    b.text('Raspberry Pi Pico', 39.5, 11.75, { size: 1.0, side: 'bottom', rot: 180, weight: 700 });
    b.text('© 2020', 39.5, 9.6, { size: 0.9, side: 'bottom', rot: 180 });

    return b.finish();
  },
};
