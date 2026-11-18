// STM32 "Blue Pill" (STM32F103C8T6 minimum system board) — 53.34 × 22.86 mm, blue solder mask, tinned pads.
// Orientation: micro-USB on the left, SWD header on the right. With the chip seen from above its pins are
// numbered counter-clockwise, so the row G·G·3.3·R·B11…VB is the TOP row and B12…5V·G·3.3 is the BOTTOM row.
import { Board } from '../core/board.js';
import { Builder, M, textMat, rrShape } from '../core/builder.js';
import { qfp, sot23, led, crystalCyl, button, header, headerPinPositions, jumper, passives } from '../core/parts-ic.js';
import { usbMicro } from '../core/parts-conn.js';

const W = 53.34, H = 22.86, CY = H / 2;
const HX = (i) => 2.54 + 2.54 * i, YT = 19.05, YB = 3.81;
const FT = ' · 5 V tolerant';

// [silk label, tooltip name, function, kind] — listed from the USB end
const TOP_ROW = [
  ['G', 'GND', 'ground', 'gnd'],
  ['G', 'GND', 'ground', 'gnd'],
  ['3.3', '3V3', '3.3 V power — output of the on-board regulator', 'pwr'],
  ['R', 'NRST', 'reset — pull to ground to restart the chip', 'ctl'],
  ['B11', 'PB11', 'I2C2 SDA · USART3 RX' + FT, 'com'],
  ['B10', 'PB10', 'I2C2 SCL · USART3 TX' + FT, 'com'],
  ['B1', 'PB1', 'analog input ADC9 · PWM (TIM3 CH4) · 3.3 V only', 'ana'],
  ['B0', 'PB0', 'analog input ADC8 · PWM (TIM3 CH3) · 3.3 V only', 'ana'],
  ['A7', 'PA7', 'analog input ADC7 · SPI1 MOSI · PWM (TIM3 CH2) · 3.3 V only', 'ana'],
  ['A6', 'PA6', 'analog input ADC6 · SPI1 MISO · PWM (TIM3 CH1) · 3.3 V only', 'ana'],
  ['A5', 'PA5', 'analog input ADC5 · SPI1 SCK · 3.3 V only', 'ana'],
  ['A4', 'PA4', 'analog input ADC4 · SPI1 NSS (chip select) · 3.3 V only', 'ana'],
  ['A3', 'PA3', 'analog input ADC3 · USART2 RX · PWM (TIM2 CH4) · 3.3 V only', 'ana'],
  ['A2', 'PA2', 'analog input ADC2 · USART2 TX · PWM (TIM2 CH3) · 3.3 V only', 'ana'],
  ['A1', 'PA1', 'analog input ADC1 · PWM (TIM2 CH2) · 3.3 V only', 'ana'],
  ['A0', 'PA0', 'analog input ADC0 · PWM (TIM2 CH1) · wake-up pin · 3.3 V only', 'ana'],
  ['C15', 'PC15', '32.768 kHz clock crystal (OSC32 OUT) · weak pin, 3 mA max', 'dig'],
  ['C14', 'PC14', '32.768 kHz clock crystal (OSC32 IN) · weak pin, 3 mA max', 'dig'],
  ['C13', 'PC13', 'on-board LED (lights when LOW) · weak pin, 3 mA max', 'dig'],
  ['VB', 'VBAT', 'backup battery input for the real-time clock (1.8–3.6 V)', 'pwr'],
];
const BOTTOM_ROW = [
  ['B12', 'PB12', 'SPI2 NSS (chip select)' + FT, 'com'],
  ['B13', 'PB13', 'SPI2 SCK' + FT, 'com'],
  ['B14', 'PB14', 'SPI2 MISO' + FT, 'com'],
  ['B15', 'PB15', 'SPI2 MOSI' + FT, 'com'],
  ['A8', 'PA8', 'PWM (TIM1 CH1) · clock output MCO' + FT, 'dig'],
  ['A9', 'PA9', 'USART1 TX (serial upload) · PWM (TIM1 CH2)' + FT, 'com'],
  ['A10', 'PA10', 'USART1 RX (serial upload) · PWM (TIM1 CH3)' + FT, 'com'],
  ['A11', 'PA11', 'USB D− · CAN RX · PWM (TIM1 CH4)' + FT, 'com'],
  ['A12', 'PA12', 'USB D+ · CAN TX' + FT, 'com'],
  ['A15', 'PA15', 'digital I/O (JTAG TDI after reset)' + FT, 'dig'],
  ['B3', 'PB3', 'digital I/O (JTAG TDO / SWO after reset)' + FT, 'dig'],
  ['B4', 'PB4', 'digital I/O (JTAG NJTRST after reset)' + FT, 'dig'],
  ['B5', 'PB5', 'digital I/O · 3.3 V only', 'dig'],
  ['B6', 'PB6', 'I2C1 SCL · PWM (TIM4 CH1)' + FT, 'com'],
  ['B7', 'PB7', 'I2C1 SDA · PWM (TIM4 CH2)' + FT, 'com'],
  ['B8', 'PB8', 'PWM (TIM4 CH3) · CAN RX (remap)' + FT, 'dig'],
  ['B9', 'PB9', 'PWM (TIM4 CH4) · CAN TX (remap)' + FT, 'dig'],
  ['5V', '5V', '5 V from USB — or 5 V power input (never both at once)', 'pwr'],
  ['G', 'GND', 'ground', 'gnd'],
  ['3.3', '3V3', '3.3 V power — output of the on-board regulator', 'pwr'],
];
const SWD = [
  ['3V3', '3V3', '3.3 V reference for the ST-Link programmer', 'pwr'],
  ['DIO', 'SWDIO', 'PA13 · debug data line (SWD)', 'ctl'],
  ['DCLK', 'SWCLK', 'PA14 · debug clock line (SWD)', 'ctl'],
  ['GND', 'GND', 'ground', 'gnd'],
];

/** 8 MHz crystal in a low-profile HC-49S SMD can. The library version is 14.4 mm long with its pads and does not fit
 *  between the two pin rows, so this one has its leads tucked under the ends (12.7 mm overall), like the real part. */
function crystal8M(b, x, y, rot) {
  const Lc = 10.5, Wc = 4.5, base = 0.8, h = 3.3, bv = 0.3, L = b.local(x, y, rot);
  for (const s of [-1, 1]) { const [px, py] = L(s * 5.75, 0); b.pad(px, py, 1.2, 2.0, { rot, finish: 'tin' }); }
  const B = new Builder(), stadium = (l, w) => rrShape(l, w, w / 2);
  B.rbox(Lc + 0.6, Wc + 0.5, base, 0.12, M.blackMatte, 0, 0, 0.03);
  for (const s of [-1, 1]) {
    B.box(0.9, 1.5, 0.22, M.tin, s * (Lc / 2 + 0.55), 0, 0.03);
    B.box(1.1, 1.85, 0.07, M.solder, s * 5.78, 0, 0);
  }
  B.extrude(stadium(Lc + 0.4 - 0.16, Wc + 0.4 - 0.16), 0.4, M.steel, 0, 0, base, 0, { bevel: 0.08, seg: 20 });
  B.extrude(stadium(Lc - 2 * bv, Wc - 2 * bv), h - 0.3, M.steel, 0, 0, base + 0.3, 0, { bevel: bv, seg: 20 });
  B.plane(5.6, 1.9, textMat({ w: 448, h: 152, bg: null, fg: '#5f6266', lines: [{ t: '8.000', size: 104, y: 0.52 }], roughness: 0.45, metalness: 0.5 }), 0, 0, base + h + 0.008);
  return b.place(B.build('crystal8M'), x, y, rot);
}

export default {
  id: 'bluepill',
  name: 'STM32 Blue Pill',
  maker: 'Generic (STM32F103C8T6 board)',
  year: 2014,
  tagline: '32-bit power for pocket money',
  level: 'Intermediate',
  accent: '#1a52ad',
  summary: 'A tiny blue board built around the STM32F103C8T6 — a 32-bit ARM Cortex-M3 microcontroller running at 72 MHz. It is several times faster than a classic Arduino, has lots of timers and communication ports, and costs about as much as a chocolate bar. A great second board once you have outgrown the Uno or Nano.',
  specs: [
    ['Microcontroller', 'STM32F103C8T6 (ARM Cortex-M3, 32-bit)'],
    ['Clock speed', '72 MHz (8 MHz crystal × 9)'],
    ['Flash memory', '64 KB'],
    ['RAM', '20 KB'],
    ['Logic level', '3.3 V (many pins tolerate 5 V inputs)'],
    ['I/O pins on the headers', '32'],
    ['Analog inputs', '10 channels, 12-bit ADC'],
    ['PWM outputs', '15'],
    ['Interfaces', '3 × USART, 2 × SPI, 2 × I2C, CAN, USB 2.0 full speed'],
    ['Power', '5 V from micro-USB or the 5V pin; 3.3 V regulator on board'],
    ['Programming', 'ST-Link over SWD, or USB-UART adapter via the serial bootloader'],
    ['Size', '53.3 × 22.9 mm'],
  ],
  compare: { mcu: 'STM32F103C8T6', clock: '72 MHz', flash: '64 KB', ram: '20 KB', gpio: '32', analog: '10 (12-bit)', wireless: '—', logic: '3.3 V', price: '≈ $2–3' },
  highlights: [
    '32-bit ARM core at 72 MHz — plenty of speed for motor control, filters and fast sensors',
    'Hardware-rich: 15 PWM channels, 12-bit ADC, three serial ports, CAN bus and native USB',
    'Fits a breadboard and leaves room for wires',
    'Real debugger support: step through code and watch variables with a cheap ST-Link',
  ],
  cautions: [
    'It is a 3.3 V board. Pins PA0–PA7, PB0, PB1, PB5 and PC13–PC15 are NOT 5 V tolerant — 5 V on them can kill the chip.',
    'Do not connect USB and an external supply on the 5V pin at the same time: there is no protection diode between them.',
    'The small 3.3 V regulator is only meant for light loads (roughly 100–300 mA depending on the clone). Power servos and motors from a separate supply, never from the board.',
    'PC13, PC14 and PC15 are weak pins (about 3 mA). The on-board LED on PC13 is inverted: LOW turns it on.',
    'After uploading through the serial bootloader, move the BOOT0 jumper back to 0 — otherwise your program will not start after reset.',
  ],
  uses: [
    'Line-follower or balancing robot with fast PID control loops',
    'Reading quadrature encoders with hardware timers',
    'CAN-bus node for a bigger robot (with an external transceiver)',
    'Custom USB device: gamepad, keyboard or sensor dongle',
    'Multi-servo and multi-motor controller using the 15 PWM channels',
  ],
  parts: {
    mcu: { name: 'Microcontroller STM32F103C8T6', text: 'The brain of the board: a 32-bit ARM Cortex-M3 in a 48-pin LQFP package, mounted as a diamond. It runs your program at up to 72 MHz and contains the flash memory, RAM, timers, ADC and all the communication ports.' },
    usb: { name: 'Micro-USB connector', text: 'Powers the board with 5 V and connects the chip’s own USB port (pins PA11 and PA12) to a computer. Out of the box it is mostly a power socket — a fresh Blue Pill has no USB bootloader, so first programs are usually uploaded another way.' },
    boot: { name: 'BOOT0 / BOOT1 jumpers', text: 'Two yellow jumpers choose what the chip does after reset. Both at 0 — it runs your program from flash. BOOT0 at 1 — it starts the factory serial bootloader so you can upload code through PA9/PA10 with a USB-UART adapter.' },
    reset: { name: 'RESET button', text: 'Briefly pulls the NRST line to ground and restarts the microcontroller. Press it after moving a BOOT jumper, or whenever your program gets stuck.' },
    crystal: { name: '8 MHz crystal', text: 'The metal can is a quartz crystal — an accurate 8 MHz time base. Inside the chip a PLL multiplies it by nine to get the full 72 MHz, and USB only works reliably with this crystal.' },
    crystal32k: { name: '32.768 kHz clock crystal', text: 'A tiny cylinder — the same kind of crystal a wrist-watch uses. It drives the real-time clock on pins PC14 and PC15, so the board can keep the time of day, even from a backup battery on VB.' },
    swd: { name: 'SWD programming header', text: 'Four right-angle pins: 3V3, SWDIO, SWCLK and GND. Plug an ST-Link programmer here to upload code and to debug it live — pause the program, step line by line and inspect variables.' },
    hdr_top: { name: 'Upper pin row (analog side)', text: 'Twenty pins: ground, 3.3 V, reset, then port B and port A pins including all ten analog inputs (A0–A7, B0, B1), and at the far end PC13–PC15 and VB. Most pins on this row are 3.3 V only.' },
    hdr_bottom: { name: 'Lower pin row (digital side)', text: 'Twenty pins: PB12–PB15 (SPI2), PA8–PA12 (serial port 1, USB, CAN), PA15, PB3–PB9 (I2C1, timer 4 PWM), then 5V, G and 3.3. Nearly all of them tolerate 5 V signals — handy for older 5 V sensors.' },
    led_pwr: { name: 'Power LED (PWR)', text: 'Lights up red whenever the board has 3.3 V. If it is dark, check the cable and the power supply before anything else.' },
    led_pc13: { name: 'User LED on PC13', text: 'The LED you blink in your first program. It is wired between 3.3 V and pin PC13, so it works “upside down”: writing LOW turns it on and HIGH turns it off.' },
    reg3v3: { name: '3.3 V voltage regulator', text: 'A small five-legged chip on the underside. It turns the 5 V from USB into the 3.3 V the microcontroller needs. It is meant for light loads only, so it is not a power source for motors or servos.' },
    passives: { name: 'Resistors and capacitors', text: 'The small “rice grains” around the chip. Capacitors smooth the supply voltage right at the chip’s power pins and help the crystals start; resistors limit LED current, hold the BOOT and reset lines at a known level and match the USB data lines.' },
  },
  partOrder: ['mcu', 'usb', 'boot', 'reset', 'crystal', 'crystal32k', 'swd', 'hdr_top', 'hdr_bottom', 'led_pc13', 'led_pwr', 'reg3v3', 'passives'],
  pinNotes: [
    { title: 'Power', text: '5V is connected straight to the USB socket; 3.3 is the regulator output. The chip itself runs on 3.3 V. Feed the board through USB or the 5V pin — not both — and keep the load on 3.3 small.' },
    { title: '5 V tolerance', text: 'Most port B pins and PA8–PA15 accept 5 V signals as inputs. The analog-capable pins PA0–PA7, PB0, PB1, plus PB5 and PC13–PC15, do not: use a voltage divider or level shifter there.' },
    { title: 'Analog and PWM', text: 'Ten 12-bit analog inputs (0–3.3 V → 0–4095) sit on A0–A7, B0 and B1. Fifteen pins can output PWM from four hardware timers — enough for several motors and servos at once.' },
    { title: 'Communication', text: 'Serial 1 is on A9 (TX) and A10 (RX) — also used by the bootloader. I2C1 is on B6 (SCL) and B7 (SDA), SPI1 on A5/A6/A7, SPI2 on B13/B14/B15, USB on A11/A12.' },
    { title: 'Programming pins', text: 'The four pins on the end are the SWD port for an ST-Link. A13 and A14 are reserved for it, which is why they are not on the side rows. R is the reset line.' },
  ],
  code: {
    title: 'First sketch: blink the PC13 LED',
    lang: 'cpp',
    src: `// Arduino IDE with the "STM32 boards" core (STM32duino).
// The on-board LED is wired between 3.3 V and pin PC13,
// so it is inverted: LOW = on, HIGH = off.

void setup() {
  pinMode(PC13, OUTPUT);       // PC13 becomes an output
}

void loop() {
  digitalWrite(PC13, LOW);     // LED on
  delay(200);                  // wait 0.2 s
  digitalWrite(PC13, HIGH);    // LED off
  delay(800);                  // wait 0.8 s
}`,
  },
  quiz: [
    { q: 'Find the microcontroller — the brain of the board', part: 'mcu', hint: 'The black square chip turned 45°, like a diamond' },
    { q: 'Which part do you move to start the serial bootloader?', part: 'boot', hint: 'Two bright yellow caps on a block of six pins' },
    { q: 'Where do you plug in an ST-Link programmer?', part: 'swd', hint: 'Four pins sticking out sideways from the short edge' },
    { q: 'Find the crystal that sets the 8 MHz clock', part: 'crystal', hint: 'A shiny oval metal can next to the chip' },
    { q: 'Which LED does the blink sketch control?', part: 'led_pc13', hint: 'It is labelled PC13 — and it is not the one that is always on' },
    { q: 'Find the part that restarts your program', part: 'reset', hint: 'The only push-button on the board' },
  ],
  facts: [
    'The nickname comes from the film The Matrix: the STM32duino community named this blue board the “Blue Pill”, and its red and black cousins the “Red Pill” and “Black Pill”.',
    'The chip is sold as having 64 KB of flash, but on many boards the upper half of a 128 KB memory turns out to be there and usable — an unofficial bonus.',
    'Many Blue Pills were built with the wrong USB pull-up resistor (10 kΩ instead of 1.5 kΩ). On some computers USB then refuses to work until the resistor is swapped.',
  ],

  build(opts = {}) {
    const b = new Board({ w: W, h: H, t: 1.6, r: 0.9, theme: 'blue', finish: 'tin', quality: opts.quality ?? 1 });
    const bt = { side: 'bottom' };

    // ───────── helpers ─────────
    /** Intermediate point of a 45° elbow a → c (diagonal first, or straight first). */
    const elbow = (a, c, diagFirst) => {
      const dx = c[0] - a[0], dy = c[1] - a[1], m = Math.min(Math.abs(dx), Math.abs(dy)), sx = Math.sign(dx), sy = Math.sign(dy);
      return diagFirst ? [a[0] + sx * m, a[1] + sy * m] : [c[0] - sx * m, c[1] - sy * m];
    };
    /** Trace through points, each leg bent at 45°. modes: one char per leg, 'd' = diagonal first, 's' = straight first. */
    const wire = (pts, modes = '', o = {}) => {
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i++) out.push(elbow(pts[i - 1], pts[i], (modes[i - 1] || 'd') === 'd'), pts[i]);
      b.trace(out, { w: o.w ?? 0.2, side: o.side ?? 'top' });
    };
    const T = (pts, w = 0.2) => b.trace(pts, { w });
    const TB = (pts, w = 0.2) => b.trace(pts, { w, side: 'bottom' });

    // ───────── microcontroller (LQFP-48 as a diamond) ─────────
    // rot 135 puts pins 1–12 on the upper-right edge, 13–24 upper-left, 25–36 lower-left, 37–48 lower-right.
    const CX = 32.5, Lm = b.local(CX, CY, 135);
    const mp = (k, d) => { const s = Math.floor((k - 1) / 12), u = ((k - 1) % 12 - 5.5) * 0.5; const p = [[u, -d], [d, u], [-u, d], [-d, -u]][s]; return Lm(p[0], p[1]); };
    const tip = (k) => mp(k, 4.82), out = (k, l) => mp(k, 4.875 + l);
    b.tag(qfp(b, { x: CX, y: CY, rot: 135, body: 7, pins: 12, pitch: 0.5, h: 1.4, lead: 1.0, text: ['STM32F103', 'C8T6', 'GQ22J 93', 'CHN 618'] }), 'mcu');

    // ───────── pin rows ─────────
    b.tag(header(b, { x: HX(9.5), y: YT, nx: 20, type: 'maleDown', pin1: false }), 'hdr_top');
    b.tag(header(b, { x: HX(9.5), y: YB, nx: 20, type: 'maleDown', pin1: false }), 'hdr_bottom');
    for (let i = 0; i < 20; i++) {
      const t = TOP_ROW[i], q = BOTTOM_ROW[i];
      b.pin(HX(i), YT, t[1], t[2], t[3]); b.pin(HX(i), YB, q[1], q[2], q[3]);
      for (const side of ['top', 'bottom']) {       // underside text is turned 180° so it reads upright when the board is flipped over its long edge
        const o = { size: 0.84, side, rot: side === 'bottom' ? 180 : 0 };
        b.text(t[0], HX(i), 21.38, o); b.text(q[0], HX(i), 1.48, o);
      }
    }

    // ───────── SWD right-angle header on the short edge ─────────
    const SX = 51.6;
    b.tag(header(b, { x: SX, y: CY, rot: 90, nx: 4, type: 'maleRA' }), 'swd');
    // the library's right-angle housing is open underneath — close it so the underside view shows solid plastic
    b.tag(b.place(new Builder().box(2.36, 10.0, 0.08, M.black, 0, 0, 0.03).build('swd-base'), SX + 2.75, CY), 'swd');
    SWD.forEach((s, i) => {
      const y = CY + (i - 1.5) * 2.54;
      b.pin(SX, y, s[1], s[2], s[3]);
      b.text(s[0], 49.0, y, { size: 0.75 });
    });

    // ───────── USB, BOOT jumpers, RESET, crystals ─────────
    b.tag(usbMicro(b, { x: -1.3, y: CY }), 'usb');

    const BX = 10.7, bootHdr = { x: BX, y: CY, nx: 3, ny: 2, type: 'male' };
    b.tag(header(b, bootHdr), 'boot');
    b.tag(jumper(b, { x: BX - 1.27, y: CY + 1.27, color: 'yellow' }), 'boot');
    b.tag(jumper(b, { x: BX - 1.27, y: CY - 1.27, color: 'yellow' }), 'boot');
    headerPinPositions(bootHdr).forEach(([px, py], i) => {
      const n = i < 3 ? 'BOOT0' : 'BOOT1', c = i % 3;
      if (c === 0) b.pin(px, py, 'GND', `position 0 for the ${n} jumper`, 'gnd');
      else if (c === 2) b.pin(px, py, '3V3', `position 1 for the ${n} jumper`, 'pwr');
      else b.pin(px, py, n, i < 3 ? 'boot mode select: 0 = run your program, 1 = serial bootloader' : 'boot mode select (also pin PB2) — normally left at 0', 'ctl');
    });
    b.text('BOOT1', BX, 14.72, { size: 0.75 }); b.text('BOOT0', BX, 7.88, { size: 0.75 });

    b.tag(button(b, { x: 17.9, y: CY, type: 'smd', cap: 'white' }), 'reset');
    b.text('RESET', 17.9, 14.1, { size: 0.75 });

    const XX = 23.2;
    b.tag(crystal8M(b, XX, CY, 90), 'crystal');

    const QX = 44.4, QY = 15.6;                       // 32.768 kHz can; its leads go to (39.9, 15.05 / 16.15)
    b.tag(crystalCyl(b, { x: QX, y: QY }), 'crystal32k');
    b.text('Y1', 45.6, 17.35, { size: 0.6 });

    // ───────── LEDs ─────────
    b.tag(led(b, { x: 45.3, y: 12.6, size: '0603', color: '#2fe06a' }), 'led_pc13');
    b.tag(led(b, { x: 45.3, y: 9.6, size: '0603', color: '#ff2a1a', on: true }), 'led_pwr');
    b.text('PC13', 45.3, 13.72, { size: 0.7 }); b.text('PWR', 45.3, 8.42, { size: 0.7 });

    // ───────── small parts, top ─────────
    const small = [
      ['res', 42.3, 12.6, 0, { text: '511' }], ['res', 42.3, 9.6, 0, { text: '511' }],          // LED resistors
      ['cap', 39.8, 10.5, 90],                                                                    // decoupling at VDD/VSS
      ['res', 11.0, 16.2, 0, { text: '104' }], ['res', 13.9, 16.2, 0, { text: '104' }],          // BOOT 100 k
      ['res', 10.4, 6.75, 0, { text: '220' }], ['res', 10.4, 5.55, 0, { text: '220' }],          // USB series resistors
      ['cap', 20.0, 17.2, 0, { color: 'brown' }], ['cap', 20.0, 5.7, 0, { color: 'brown' }],    // 8 MHz load caps
      ['res', 17.6, 8.6, 0, { text: '103' }],                                                     // reset pull-up
      ['cap', 6.3, 14.6, 90],                                                                     // USB 5 V
      ['cap', 43.4, 7.0, 0], ['cap', 46.4, 7.0, 0], ['cap', 49.2, 17.0, 0, { color: 'brown' }],
      // underside
      ['cap', 42.3, 7.4, 90, { size: '0805', side: 'bottom' }], ['cap', 48.4, 7.4, 90, { size: '0805', side: 'bottom' }],
      ['cap', 34.3, 13.4, 90, { side: 'bottom' }], ['cap', 36.4, 13.4, 90, { side: 'bottom' }], ['cap', 35.6, 8.3, 0, { side: 'bottom' }],
      ['cap', 37.3, 15.7, 90, { side: 'bottom', color: 'brown' }], ['cap', 38.6, 15.7, 90, { side: 'bottom', color: 'brown' }],
    ];
    b.tag(passives(b, small), 'passives');
    b.text('R1', 42.3, 11.1, { size: 0.55 }); b.text('R2', 42.3, 8.5, { size: 0.55 });

    // ───────── 3.3 V regulator (underside) ─────────
    b.tag(sot23(b, { x: 45.4, y: 7.4, n: 5, side: 'bottom', text: '4B2X' }), 'reg3v3');

    // ═════════ TOP COPPER ═════════
    // analog pins straight to the upper row
    wire([tip(12), [HX(13), YT]], 'd');
    wire([tip(11), [HX(14) - 1.15, 17.9], [HX(14), YT]], 'dd');
    wire([tip(10), [HX(15) - 1.6, 17.45], [HX(15), YT]], 'dd');
    wire([tip(13), [HX(12), YT]], 'd');
    wire([tip(14), [HX(11), YT]], 's');
    wire([tip(15), [HX(10), YT]], 'd');
    wire([tip(16), [HX(9), YT]], 's');
    // port B to the lower row
    wire([tip(42), out(42, 0.35), [HX(13), YB]], 'ds');
    wire([tip(43), [HX(14), YB]], 'd');
    wire([tip(45), [HX(15), YB]], 'd');
    wire([tip(46), [HX(16), YB]], 's');
    // PA15, PB3, PB4 duck under the lower corner of the chip
    { const o38 = out(38, 0.3), o39 = out(39, 0.3), o40 = out(40, 0.3);
      T([tip(38), o38, [o38[0], 5.9], [o38[0] - 0.25, 5.65], [HX(9) + 1.84, 5.65], [HX(9), YB]]);
      T([tip(39), o39, [o39[0], 5.68], [o39[0] - 0.38, 5.3], [HX(10) + 1.49, 5.3], [HX(10), YB]]);
      T([tip(40), o40, [o40[0], 5.45], [o40[0] - 0.5, 4.95], [HX(11) + 1.14, 4.95], [HX(11), YB]]); }
    // USB D− / D+ : under the crystal, past the button, through 22 Ω resistors to the connector
    { const a = out(32, 0.4), c = out(33, 0.4);
      T([tip(32), a, [12.6, a[1]], [12.6 - (a[1] - 6.75), 6.75], [11.13, 6.75]]);
      T([tip(33), c, [13.4, c[1]], [13.4 - (c[1] - 5.55), 5.55], [11.13, 5.55]]);
      T([[9.67, 6.75], [6.6, 6.75], [6.6, 10.83], [6.0, 11.43], [5.0, 11.43]]);
      T([[9.67, 5.55], [7.1, 5.55], [6.1, 6.55], [6.1, 10.4], [5.72, 10.78], [5.0, 10.78]]); }
    // 32.768 kHz crystal and PC13 LED
    wire([tip(4), [QX - 4.5, QY + 0.55]], 's');
    wire([tip(3), [QX - 4.5, QY - 0.55]], 's');
    { const p = tip(2); T([p, [40.88, p[1]], [41.57, 12.6]]); b.via(40.2, p[1]); }
    T([[43.03, 12.6], [44.57, 12.6]]); T([[46.03, 12.6], [46.9, 12.6]], 0.3); b.via(46.9, 12.6);
    T([[40.9, 9.6], [41.57, 9.6]], 0.3); b.via(40.9, 9.6);
    T([[43.03, 9.6], [44.57, 9.6]]); T([[46.03, 9.6], [46.9, 9.6]], 0.3); b.via(46.9, 9.6);
    // VBAT, VDD / VSS next to the chip
    { const p = tip(1); T([p, [p[0] + 0.5, p[1] - 0.5], [39.1, p[1] - 0.5]]); b.via(39.1, p[1] - 0.5); }
    wire([tip(48), [39.8, 11.23]], 'd', { w: 0.28 });
    wire([tip(47), [39.8, 9.77]], 's', { w: 0.28 });
    // reset: button → via (NRST from the chip arrives on the underside) → R pin
    T([[20.25, 11.9], [20.5, 12.4], [20.5, 14.0], [17.2, 17.3], [HX(3) + 1.75, 17.3], [HX(3), YT]]);
    b.via(20.5, 13.0);
    T([[15.55, 11.0], [15.55, 9.7]], 0.3); b.via(15.55, 9.7);
    T([[18.33, 8.6], [19.3, 8.6], [20.25, 9.55], [20.25, 10.9]]);               // pull-up to the NRST pad
    T([[16.87, 8.6], [16.3, 8.6]], 0.3); b.via(16.2, 8.6);
    // BOOT block: ground column to the G pin, 3.3 V column to a via, 100 k resistors
    T([[8.16, CY - 1.27], [8.16, 15.3], [HX(1), 18.38], [HX(1), YT]], 0.4);
    T([[13.24, CY - 1.27], [13.24, CY + 1.27], [14.3, 14.3], [14.9, 14.9]], 0.35); b.via(14.9, 14.9);
    T([[10.27, 16.2], [9.6, 16.2]]); b.via(9.5, 16.2); T([[11.73, 16.2], [13.17, 16.2]]); T([[14.63, 16.2], [15.4, 16.2]]); b.via(15.5, 16.2);
    // 8 MHz crystal: load capacitors beside the pads
    T([[20.73, 17.2], [22.4, 17.2]]); T([[20.73, 5.7], [22.4, 5.7]]);
    T([[19.27, 17.2], [18.7, 17.2]], 0.3); T([[19.27, 5.7], [18.6, 5.7]], 0.3); b.via(18.5, 5.7);
    // USB 5 V → capacitor → via
    T([[5.0, 12.73], [5.9, 12.73], [6.3, 13.13], [6.3, 13.87]], 0.35);
    T([[6.3, 15.33], [5.4, 15.33]], 0.35); b.via(5.3, 15.33);
    // 3.3 V: corner pin → SWD pin
    T([[HX(19), YB], [HX(19), 6.0], [SX, 6.8], [SX, 7.62]], 0.45);
    T([[42.67, 7.0], [44.13, 7.0]], 0.3); T([[45.67, 7.0], [47.13, 7.0]], 0.3); T([[47.13, 7.0], [48.0, 7.0]], 0.3); b.via(48.1, 7.0);
    T([[48.47, 17.0], [47.7, 17.0]], 0.3); b.via(47.6, 17.0);
    for (const [vx, vy] of [[3.4, 17.7], [6.9, 17.9], [3.3, 5.2], [49.6, 5.3]]) b.via(vx, vy);

    // ═════════ BOTTOM COPPER ═════════
    // Two fans start from vias hidden under the chip and run to the left half of both pin rows.
    const corner = CX - 4.95;
    const UL = (s, d) => [corner + 0.7071 * (s + d), CY + 0.7071 * (s - d)];
    const LL = (s, d) => [corner + 0.7071 * (s + d), CY - 0.7071 * (s - d)];
    const sd = (i) => [1.4 + 0.5 * i, i % 2 ? 1.1 : 0.35];
    // upper fan: OSC_IN, NRST, BOOT1, PB11, PB10, PB1, PB0, PA7
    [[12.4, [XX, 12.4]], [13.0, [20.5, 13.0]], [14.0, [12.0, 14.0], [BX, CY + 1.27]],
      [15.7, 4], [16.1, 5], [16.5, 6], [16.9, 7], [17.3, 8]].forEach(([lane, a, c], i) => {
      const v = UL(...sd(i)); b.via(v[0], v[1]);
      const pts = [v, [v[0] - (lane - v[1]), lane]];
      if (typeof a === 'number') pts.push([HX(a) + (YT - lane), lane], [HX(a), YT]); else { pts.push(a); if (c) pts.push(c); }
      TB(pts);
    });
    // lower fan: OSC_OUT, PB12…PB15, PA8…PA12
    [[10.4, [XX, 10.4]], [9.0, 0], [8.6, 1], [8.2, 2], [7.8, 3], [7.4, 4], [7.0, 5], [6.6, 6], [6.2, 7], [5.8, 8]].forEach(([lane, a], i) => {
      const v = LL(...sd(i)); b.via(v[0], v[1]);
      const pts = [v, [v[0] - (v[1] - lane), lane]];
      if (typeof a === 'number') pts.push([HX(a) + (lane - YB), lane], [HX(a), YB]); else pts.push(a);
      TB(pts);
    });
    b.via(XX, 12.4); b.via(XX, 10.4);
    { const v = LL(6.4, 0.35); b.via(v[0], v[1]); TB([v, [v[0], YB + (HX(12) - v[0])], [HX(12), YB]]); }         // PB5
    b.via(28.2, CY); TB([[28.2, CY], [BX + 1.27, CY], [BX, CY - 1.27]]);                                           // BOOT0
    // SWD
    b.via(34.6, 10.16); TB([[34.6, 10.16], [SX, 10.16]]);
    b.via(35.2, 10.9); TB([[35.2, 10.9], [SX - 1.8, 10.9], [SX, 12.7]]);
    // VBAT, PC13, PC14, PC15 to the far end of the upper row
    { const yv = tip(1)[1] - 0.5, yc = tip(2)[1];
      wire([[39.1, yv], [HX(19), YT]], 's', bt);
      wire([[40.2, yc], [HX(18), YT]], 's', bt);
      wire([[QX - 4.5, QY - 0.55], [HX(17), YT]], 's', bt);
      wire([[QX - 4.5, QY + 0.55], [HX(16), YT]], 's', bt); }
    // power around the regulator (seen from the top: IN pins on the lower y row)
    TB([[HX(17), YB], [HX(17), 4.93], [44.45, 6.2], [42.3, 6.2]], 0.5);
    TB([[46.35, 6.2], [48.4, 6.2], [48.4, 6.5], [50.48, 6.5], [SX, 7.62]], 0.5);
    TB([[HX(19), YB], [HX(19), 6.82]], 0.5);
    TB([[45.4, 8.6], [45.4, 9.3]], 0.35); TB([[42.3, 8.3], [42.3, 9.0]], 0.35); b.via(42.3, 9.1, bt); TB([[48.4, 8.3], [49.2, 9.1]], 0.35); b.via(49.3, 9.2, bt);
    TB([[44.45, 8.6], [44.45, 9.2], [43.6, 9.2]], 0.3);
    // underside silkscreen
    const bs = (str, x, y, size, o = {}) => b.text(str, x, y, { size, side: 'bottom', rot: 180, ...o });
    bs('BLUE', 4.3, 12.3, 1.3, { weight: 700 }); bs('PILL', 4.3, 14.3, 1.3, { weight: 700 });
    bs('STM32F103C8T6', 47.1, 11.75, 0.62);
    bs('U2', 47.4, 9.5, 0.5); bs('C8', 40.7, 7.4, 0.55); bs('C9', 50.0, 8.3, 0.55); bs('C5', 35.6, 7.2, 0.5); bs('C6', 34.3, 15.0, 0.5); bs('C7', 36.4, 15.0, 0.5);

    // top title
    b.text('STM32F103C8T6', 46.3, 5.32, { size: 0.72 });
    return b.finish();
  },
};
