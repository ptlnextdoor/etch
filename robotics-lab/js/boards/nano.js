// Arduino Nano 3.x — a breadboard-friendly ATmega328P board "on legs".
import { Board } from '../core/board.js';
import { qfp, soic, sot223, tantalum, diode, led, resonator, resArray, button, header, passives } from '../core/parts-ic.js';
import { usbMini } from '../core/parts-conn.js';

const W = 43.18, H = 17.78, P = 2.54;
const HX = (i) => 3.81 + P * i;              // x of header pin i = 0…14 (counted from the USB end)
const Y_BOT = 1.27, Y_TOP = 16.51;           // header rows
const MCU = { x: 21.59, y: 8.89, rot: 135 }; // TQFP-32 turned 45° (pin 1 at the right-hand corner)

// top row, from the USB end to the far end
const TOP_PINS = [
  ['D12', 'digital I/O · SPI MISO', 'dig'],
  ['D11', 'digital I/O · PWM · SPI MOSI', 'dig'],
  ['D10', 'digital I/O · PWM · SPI SS', 'dig'],
  ['D9', 'digital I/O · PWM', 'dig'],
  ['D8', 'digital I/O', 'dig'],
  ['D7', 'digital I/O', 'dig'],
  ['D6', 'digital I/O · PWM', 'dig'],
  ['D5', 'digital I/O · PWM', 'dig'],
  ['D4', 'digital I/O', 'dig'],
  ['D3', 'digital I/O · PWM · external interrupt INT1', 'dig'],
  ['D2', 'digital I/O · external interrupt INT0', 'dig'],
  ['GND', 'ground', 'gnd'],
  ['RST', 'reset: pull to GND to restart the sketch', 'ctl'],
  ['RX0', 'D0 · UART receive (busy while talking over USB)', 'com'],
  ['TX1', 'D1 · UART transmit (busy while talking over USB)', 'com'],
];
// bottom row, from the USB end to the far end
const BOT_PINS = [
  ['D13', 'digital I/O · SPI SCK · built-in LED "L"', 'dig'],
  ['3V3', '3.3 V power output, 50 mA max', 'pwr'],
  ['REF', 'AREF — reference voltage for the analog inputs', 'ctl'],
  ['A0', 'analog input (also digital D14)', 'ana'],
  ['A1', 'analog input (also digital D15)', 'ana'],
  ['A2', 'analog input (also digital D16)', 'ana'],
  ['A3', 'analog input (also digital D17)', 'ana'],
  ['A4', 'analog input · I²C SDA', 'ana'],
  ['A5', 'analog input · I²C SCL', 'ana'],
  ['A6', 'analog input only (cannot be a digital pin)', 'ana'],
  ['A7', 'analog input only (cannot be a digital pin)', 'ana'],
  ['5V', '5 V power output (or regulated 5 V input)', 'pwr'],
  ['RST', 'reset: pull to GND to restart the sketch', 'ctl'],
  ['GND', 'ground', 'gnd'],
  ['VIN', 'power input 7–12 V (feeds the 5 V regulator)', 'pwr'],
];
const ICSP_PINS = [
  [39.37, 11.43, 'MISO', 'ICSP · SPI MISO (same signal as D12)', 'com'], [41.91, 11.43, '5V', 'ICSP · 5 V power', 'pwr'],
  [39.37, 8.89, 'SCK', 'ICSP · SPI SCK (same signal as D13)', 'com'], [41.91, 8.89, 'MOSI', 'ICSP · SPI MOSI (same signal as D11)', 'com'],
  [39.37, 6.35, 'RST', 'ICSP · microcontroller reset', 'ctl'], [41.91, 6.35, 'GND', 'ICSP · ground', 'gnd'],
];

export default {
  id: 'nano',
  name: 'Arduino Nano', maker: 'Arduino', year: 2008,
  tagline: 'An Uno the size of a thumb',
  level: 'Beginner',
  accent: '#1a52ad',
  summary: 'The Arduino Nano packs the same brain as the Arduino Uno onto a board the size of a USB stick. Its legs plug straight into a breadboard, which makes it a favourite for small robots, remote controls and wearables. You program it over USB from the Arduino IDE.',
  specs: [
    ['Microcontroller', 'ATmega328P (8-bit AVR)'],
    ['Clock speed', '16 MHz'],
    ['Flash memory', '32 KB (2 KB used by the bootloader)'],
    ['RAM', '2 KB'],
    ['EEPROM', '1 KB'],
    ['Digital pins', '14 (D0–D13), 6 with PWM'],
    ['Analog inputs', '8 (A0–A7), 10-bit'],
    ['Logic level', '5 V'],
    ['Power', 'USB 5 V or VIN 7–12 V'],
    ['Current per pin', '20 mA recommended (40 mA absolute max)'],
    ['USB', 'Mini-B, FT232RL bridge (CH340 on clones)'],
    ['Size', '43.2 × 17.8 mm, about 7 g'],
  ],
  compare: { mcu: 'ATmega328P', clock: '16 MHz', flash: '32 KB', ram: '2 KB', gpio: '22', analog: '8', wireless: '—', logic: '5 V', price: '≈ $4–25' },
  highlights: [
    'Plugs straight into a breadboard — no extra wiring needed',
    'Runs the same sketches and libraries as the Uno',
    'Two more analog inputs than the Uno (A6 and A7)',
    'Small and light enough to fit inside any robot',
  ],
  cautions: [
    '5 V logic: connect 3.3 V sensors and modules through a level shifter, or you can burn them out.',
    'Never power motors or servos from the board\'s 5V pin — give them their own supply and join the grounds (GND).',
    'One pin can supply only about 20 mA: an LED always needs a resistor, a motor always needs a driver.',
    'A6 and A7 are analog inputs only — pinMode and digitalWrite do nothing on them. The 3V3 pin gives just 50 mA.',
  ],
  uses: [
    'The brain of a small two-motor robot with a motor driver',
    'A line-following robot with reflectance sensors',
    'A handheld remote with a joystick and an nRF24L01 radio',
    'A weather station with I²C sensors and a tiny display',
    'Driving the servos of a small robot arm',
  ],
  parts: {
    mcu: { name: 'ATmega328P microcontroller', text: 'The main chip and the brain of the board — the same one as in the Arduino Uno, but in a flat 32-pin package. It holds the processor, the memory for your program and everything that drives the pins. On the Nano it sits turned like a diamond, which makes the traces easier to route.' },
    usb: { name: 'Mini-USB connector', text: 'Brings in 5 V power from the computer and uploads your sketches. It needs a Mini-B cable — do not confuse it with the newer Micro-USB.' },
    usbchip: { name: 'FT232RL USB-to-serial bridge', text: 'A translator chip on the underside: it turns USB into the serial port the microcontroller understands. It also supplies the 3.3 V for the 3V3 pin. Cheap clones use a CH340 instead, which needs its own driver.' },
    reg5v: { name: '5 V regulator', text: 'Steps the voltage on VIN (7–12 V) down to a steady 5 V. It gets hot under load, so do not run power-hungry parts from it.' },
    crystal: { name: '16 MHz resonator', text: 'Sets the heartbeat of the microcontroller: 16 million ticks per second. The accuracy of delay(), millis() and the serial speed all depend on it.' },
    reset: { name: 'RESET button', text: 'Restarts your program from the beginning, as if the board had been unplugged and plugged back in. The sketch itself is not erased.' },
    hdr_top: { name: 'Header D12…TX1', text: 'The upper row of legs: digital pins D2–D12, ground, reset and the serial port RX0/TX1. The PWM pins (D3, D5, D6, D9, D10, D11) can fade an LED or set a motor speed smoothly.' },
    hdr_bottom: { name: 'Header D13…VIN', text: 'The lower row of legs: analog inputs A0–A7, pin D13 and all the power pins — 3V3, 5V, GND and VIN. Potentiometers and sensors with a smoothly changing signal go to the analog inputs.' },
    icsp: { name: 'ICSP header', text: 'Six pins for a hardware programmer: it can burn the bootloader or flash the chip directly, without USB. The same pins carry the SPI bus (MISO, MOSI, SCK).' },
    led_l: { name: 'LED "L"', text: 'The built-in LED wired to pin D13. This is where everyone starts: the first Blink sketch flashes exactly this LED, with no wiring at all.' },
    led_pwr: { name: 'Power LED (PWR)', text: 'Lit whenever the board has 5 V power. If it stays dark, check the cable and the power source.' },
    leds_serial: { name: 'TX and RX LEDs', text: 'Flicker when the board sends (TX) and receives (RX) data over USB. They blink rapidly during an upload — a sign that the link is alive.' },
    diode: { name: 'Schottky diode', text: 'Lets current flow from USB into the board in one direction only. Thanks to it you can connect USB and external power at the same time without pushing current back into the computer.' },
    caps: { name: 'Tantalum capacitors', text: 'Small energy reservoirs next to the regulator. They smooth out voltage dips so the microcontroller does not reset from electrical noise.' },
  },
  partOrder: ['mcu', 'usb', 'hdr_top', 'hdr_bottom', 'reset', 'led_l', 'led_pwr', 'leds_serial', 'crystal', 'icsp', 'usbchip', 'reg5v', 'diode', 'caps'],
  pinNotes: [
    { title: 'Power', text: 'Over USB the board gets 5 V. Without a computer, feed 7–12 V into VIN or a regulated 5 V into the 5V pin. 3V3 is a weak 3.3 V output (50 mA max), GND is the common ground.' },
    { title: 'Digital pins', text: 'D0–D13 work as inputs and outputs with 0 V and 5 V levels. PWM (analogWrite) is available on D3, D5, D6, D9, D10 and D11. D0 and D1 talk to the computer — best leave them alone.' },
    { title: 'Analog inputs', text: 'A0–A7 measure a voltage from 0 to 5 V and return a number from 0 to 1023. A0–A5 can also be used as ordinary digital pins; A6 and A7 are analog inputs only.' },
    { title: 'I²C and SPI buses', text: 'I²C: A4 is SDA, A5 is SCL (displays, gyros, sensors). SPI: D11 is MOSI, D12 is MISO, D13 is SCK, D10 is SS (radio modules, SD cards).' },
    { title: 'Interrupts and reset', text: 'D2 and D3 can react to a signal instantly (attachInterrupt) — handy for wheel encoders. RST restarts the board when it is connected to GND.' },
  ],
  code: {
    title: 'First sketch: blink the "L" LED',
    lang: 'cpp',
    src: `// Board: Arduino Nano, processor: ATmega328P.
// If a clone refuses to upload, pick "ATmega328P (Old Bootloader)".

const int LED = LED_BUILTIN;   // the built-in "L" LED on pin D13

void setup() {
  pinMode(LED, OUTPUT);        // make D13 an output
  Serial.begin(9600);          // open the USB link to the computer
}

void loop() {
  digitalWrite(LED, HIGH);     // LED on
  Serial.println("On");        // message for the Serial Monitor
  delay(500);                  // wait half a second

  digitalWrite(LED, LOW);      // LED off
  Serial.println("Off");
  delay(500);
}`,
  },
  quiz: [
    { q: 'Find the microcontroller — the brain of the board', part: 'mcu', hint: 'A black square turned like a diamond in the middle of the board' },
    { q: 'Where does the cable from the computer plug in?', part: 'usb', hint: 'The metal connector at the end of the board' },
    { q: 'Which LED does the Blink sketch flash?', part: 'led_l', hint: 'It is labelled "L" and wired to D13' },
    { q: 'What restarts your program?', part: 'reset', hint: 'A small button between the microcontroller and the LEDs' },
    { q: 'Where is the chip that translates USB for the microcontroller?', part: 'usbchip', hint: 'Flip the board: the long chip in the middle of the underside' },
    { q: 'Find the regulator that makes 5 V from the VIN voltage', part: 'reg5v', hint: 'On the underside: a package with three legs and one wide tab' },
  ],
  facts: [
    'The Arduino Nano appeared in 2008. It was designed by Gravitech so the board could plug into a breadboard like an ordinary chip.',
    'The Nano has two more analog inputs than the Uno: the flat ATmega328P package has pins A6 and A7 that the big through-hole chip lacks.',
    'The board weighs about 7 grams — less than a single AAA battery.',
  ],

  build(opts = {}) {
    const b = new Board({
      w: W, h: H, t: 1.6, r: 0.5, theme: 'blue', finish: 'tin', quality: opts.quality ?? 1,
      holes: [{ x: 1.27, y: 1.27, d: 1.8 }, { x: W - 1.27, y: 1.27, d: 1.8 }, { x: 1.27, y: H - 1.27, d: 1.8 }, { x: W - 1.27, y: H - 1.27, d: 1.8 }],
    });
    const Lm = b.local(MCU.x, MCU.y, MCU.rot);
    // pad tip of MCU pin n (1…32, counter-clockwise, pin 1 = leftmost pin of the local −y side); d = distance from the body centre
    const mp = (n, d = 4.8) => {
      const s = Math.floor((n - 1) / 8), o = ((n - 1) % 8 - 3.5) * 0.8;
      const p = [[o, -d], [d, o], [-o, d], [-d, -o]][s];
      return Lm(p[0], p[1]);
    };
    // frame of the MCU's upper-right edge: u = outwards, t = along the edge towards the right-hand corner
    const uv = (u, t) => [MCU.x + (u + t) / Math.SQRT2, MCU.y + (u - t) / Math.SQRT2];
    const T = (pts, w = 0.2) => b.trace(pts, { w });
    const TB = (pts, w = 0.2) => b.trace(pts, { w, side: 'bottom' });
    // areas occupied by footprints on the underside: vias falling there are painted on the top side only
    const BOT_ZONES = [[14.2, 4.3, 25.0, 13.5], [15.5, 3.1, 28.9, 4.5], [24.9, 8.6, 27.8, 12.2], [29.2, 5.4, 37.6, 12.4],
      [32.3, 3.0, 36.9, 5.0], [32.3, 12.8, 36.9, 14.7], [25.4, 5.4, 26.6, 7.9], [10.1, 12.6, 14.7, 14.6], [11.4, 11.0, 13.8, 12.2]];
    const via = (x, y, topOnly = false) => {
      const blocked = topOnly || BOT_ZONES.some((z) => x > z[0] && x < z[2] && y > z[1] && y < z[3]);
      b.via(x, y, blocked ? { side: 'top' } : {});
    };
    const bvia = (x, y) => b.via(x, y, { side: 'bottom' });

    // ═════════ top side: main parts ═════════
    b.tag(usbMini(b, { x: -1.5, y: H / 2 }), 'usb');

    b.tag(header(b, { x: W / 2, y: Y_TOP, nx: 15, type: 'maleDown', rot: 180 }), 'hdr_top');      // square pad = pin 1 (TX1)
    b.tag(header(b, { x: W / 2, y: Y_BOT, nx: 15, type: 'maleDown', pin1: false }), 'hdr_bottom');
    b.tag(header(b, { x: 40.64, y: H / 2, nx: 3, ny: 2, type: 'male', rot: 270 }), 'icsp');
    for (let i = 0; i < 15; i++) {
      const x = HX(i), [tn, tf, tk] = TOP_PINS[i], [bn, bf, bk] = BOT_PINS[i], size = i === 1 ? 0.47 : 0.66;   // D11 / 3V3 are squeezed by the USB shell tabs
      b.pin(x, Y_TOP, tn, tf, tk); b.pin(x, Y_BOT, bn, bf, bk);
      b.text(tn, x, Y_TOP - 0.96, { size, rot: 90, align: 'right' });
      b.text(bn, x, Y_BOT + 0.96, { size, rot: 90, align: 'left' });
    }
    ICSP_PINS.forEach(([x, y, n, f, k]) => b.pin(x, y, n, f, k));

    b.tag(qfp(b, { ...MCU, body: 7, pins: 8, pitch: 0.8, text: ['ATMEGA328P', 'AU 1924'], silk: false }), 'mcu');
    b.circle(27.8, 8.89, 0.17, { fill: true });
    { const [x, y] = uv(6.3, 0); b.tag(resonator(b, { x, y, rot: 315, text: '16.0' }), 'crystal'); }
    b.tag(button(b, { x: 30.8, y: H / 2, rot: 90, type: 'smd', cap: 'white' }), 'reset');

    const LX = 34.4, LY = [11.75, 9.85, 7.95, 6.05];
    b.tag(led(b, { x: LX, y: LY[0], color: '#ffb400' }), 'leds_serial');
    b.tag(led(b, { x: LX, y: LY[1], color: '#ffb400' }), 'leds_serial');
    b.tag(led(b, { x: LX, y: LY[2], color: '#00d05a', on: true }), 'led_pwr');
    b.tag(led(b, { x: LX, y: LY[3], color: '#ff7a1a' }), 'led_l');
    ['TX', 'RX', 'PWR', 'L'].forEach((s, i) => b.text(s, 36.15, LY[i], { size: 0.52, align: 'left' }));

    passives(b, [
      ['cap', 12.9, 8.75, 90], ['res', 14.4, 8.8, 90, { text: '102' }], ['cap', 35.1, 4.85, 0], ['cap', 15.45, 8.89, 90, { size: '0402' }],
    ]);

    // ── silkscreen, top ──
    b.text('ARDUINO NANO', 11.45, H / 2, { size: 0.76, rot: 90, weight: 700 });
    b.text('V3.0', 35.3, 13.1, { size: 0.72, weight: 700 });
    b.text('RST', 30.8, 12.8, { size: 0.62 });
    b.text('ICSP', 40.64, 4.35, { size: 0.72 });
    b.text('1', 40.7, 14.45, { size: 0.72 });

    // ── traces, top ──
    // upper-left edge of the MCU (pins 9…16 = D5…D12): fan-out through the gaps between the pin labels
    { const t = mp(9); T([t, [20.32, t[1] + 0.14], [20.32, 15.24], [HX(7), Y_TOP]]); }
    for (let j = 1; j <= 4; j++) {
      const t = mp(9 + j), gx = HX(7 - j) - 1.27;
      T([t, [gx + 0.6, t[1]], [gx, t[1] + 0.6], [gx, 15.24], [gx + 1.27, Y_TOP]]);
    }
    { const t = mp(14); T([t, [8.6, t[1]], [8.0, t[1] + 0.6], [8.0, 15.62], [HX(2), Y_TOP]]); }          // D10
    { const t = mp(15); T([t, [16.04, t[1]]]); via(16.04, t[1]); }                                       // D11 → underside
    { const t = mp(16); T([t, [14.8, t[1]]]); via(14.8, t[1]); }                                         // D12 → underside
    // lower-left edge (pins 17…24 = D13, AVCC, A6, AREF, GND, A7, A0, A1)
    { const t = mp(17); T([t, [15.47, t[1]]]); via(15.47, t[1]); }
    { const t = mp(18); T([t, [14.64, t[1]], [14.4, t[1] + 0.24], [14.4, 7.9]]); via(14.64, t[1]); }     // AVCC filter
    { const t = mp(19); T([t, [16.6, t[1]]]); via(16.6, t[1]); }
    { const t = mp(20); T([t, [12.1, t[1]], [10.16, t[1] - 1.94], [10.16, 2.54], [HX(2), Y_BOT]]); T([[12.9, t[1]], [12.9, 7.9]]); }   // AREF + its capacitor
    { const t = mp(21); T([t, [17.73, t[1]]]); via(17.73, t[1]); }
    { const t = mp(22); T([t, [16.9, t[1]]]); via(16.9, t[1]); }
    { const t = mp(23); T([t, [13.3, t[1]], [12.7, t[1] - 0.6], [12.7, 2.54], [HX(3), Y_BOT]]); }        // A0
    { const t = mp(24); T([t, [20.32, 3.2], [20.32, 2.85]]); via(20.32, 2.85); }                         // A1 → underside
    T([[12.9, 9.6], [12.9, 10.55]]); via(12.9, 10.55);
    // lower-right edge (pins 25…32 = A2, A3, A4, A5, RESET, RX, TX, D2)
    { const t = mp(25); T([t, [22.86, 3.2], [22.86, 2.85]]); via(22.86, 2.85); }
    { const t = mp(26); T([t, [23.95, 3.75]]); via(23.95, 3.75); }
    { const t = mp(27); T([t, [24.75, 4.05]]); via(24.75, 4.05); }
    { const t = mp(28); T([t, [25.4, t[1] - (25.4 - t[0])], [25.4, 2.54], [HX(8), Y_BOT]]); }            // A5
    { const t = mp(29); T([t, [t[0] + 1.24, 4.54], [32.4, 4.54], [33.02, 3.92], [33.02, 2.54], [HX(12), Y_BOT]]); T([[30.8, 4.54], [30.8, 6.3]]); }  // RESET → pin and button
    { const t = mp(30); T([t, [28.0, t[1]]]); via(28.0, t[1]); }                                         // RX → underside
    { const t = mp(31); T([t, [27.15, t[1]]]); via(27.15, t[1]); }                                       // TX → underside
    { const t = mp(32); T([t, [28.2, t[1]], [28.62, t[1] + 0.42], [28.62, 15.92], [HX(10), Y_TOP]]); }   // D2
    // upper-right edge (pins 1…8 = D3, D4, power, XTAL1, XTAL2)
    { const t = mp(1); T([t, [t[0] + 0.29, t[1] + 0.29], [27.95, t[1] + 0.29], [28.25, t[1] + 0.59], [28.25, 14.93], [HX(9), Y_TOP]]); }  // D3
    { const t = mp(2); T([t, [t[0] + 0.53, t[1] + 0.53], [27.45, t[1] + 0.53]]); via(27.45, t[1] + 0.53); }                               // D4 → underside
    T([uv(4.8, -2.0), uv(5.6, -2.0), uv(5.6, -1.3)]);                                                    // XTAL1 → resonator
    T([mp(8), [22.86, 15.05]]); via(22.86, 15.05, true);                                                 // XTAL2
    // USB: VBUS and GND wide, data pair to vias
    T([[9.5, 10.49], [10.2, 10.49]], 0.4); via(10.2, 10.49);
    T([[9.5, 9.69], [10.6, 9.69]]); via(10.6, 9.69);
    T([[9.5, 8.89], [10.2, 8.89]]); via(10.2, 8.89);
    T([[9.5, 7.29], [10.2, 7.29]], 0.4); via(10.2, 7.29);
    // LEDs: vias on the left, common rail on the right
    for (const y of LY) { T([[32.85, y], [33.7, y]]); via(32.85, y); T([[35.1, y], [35.8, y]], 0.25); }
    T([[35.8, LY[0]], [35.8, 5.0]], 0.25);

    // ═════════ underside ═════════
    b.tag(soic(b, { x: 19.6, y: H / 2, side: 'bottom', n: 28, pitch: 0.65, bodyW: 5.3, bodyL: 10.2, span: 7.8, h: 1.9, text: ['FTDI', 'FT232RL', '1936-C'] }), 'usbchip');
    b.tag(sot223(b, { x: 33.4, y: H / 2, rot: 270, side: 'bottom', text: ['AMS1117', '5.0'] }), 'reg5v');
    b.tag(diode(b, { x: 12.4, y: 13.6, side: 'bottom', pkg: 'sod123', text: 'B2' }), 'diode');
    b.tag(tantalum(b, { x: 34.6, y: 4.0, side: 'bottom', size: 'A', text: '106' }), 'caps');
    b.tag(tantalum(b, { x: 34.6, y: 13.75, side: 'bottom', size: 'A', text: '106' }), 'caps');
    resArray(b, { x: 26.3, y: 10.4, rot: 90, side: 'bottom', text: '102' });
    const S = { side: 'bottom' };
    passives(b, [
      ['cap', 16.9, 3.75, 0, S], ['cap', 23.3, 3.75, 0, S], ['cap', 27.6, 3.75, 0, S], ['cap', 26.0, 6.7, 90, S],
      ['cap', 12.6, 11.6, 0, S], ['res', 28.9, 12.6, 0, { ...S, text: '102' }], ['cap', 7.6, 7.29, 0, S],
    ]);

    // ── traces, underside ──
    TB([[10.2, 10.49], [10.2, 13.02], [10.78, 13.6]], 0.5);                                              // VBUS → diode
    TB([[14.03, 13.6], [14.83, 14.4], [29.55, 14.4], [30.35, 13.6], [30.35, 10.3]], 0.5);                // diode → 5 V rail → regulator tab
    TB([[33.3, 13.75], [30.5, 13.75]], 0.5);
    TB([[36.1, 13.75], [37.3, 13.75]], 0.4); bvia(37.4, 13.75);
    TB([[30.35, 7.6], [30.35, 3.67], [31.75, 2.27], [31.75, Y_BOT]], 0.6);                               // 5 V → pin
    TB([[39.37, Y_BOT], [38.0, 2.64], [38.0, 5.79], [37.2, 6.59], [36.45, 6.59]], 0.6);                  // VIN → regulator
    TB([[36.1, 4.0], [38.0, 4.0]], 0.4);
    TB([[33.2, 4.0], [32.2, 4.0]], 0.4); bvia(32.1, 4.0);
    TB([[36.45, 11.19], [37.3, 11.19], [37.8, 11.69]], 0.5); bvia(37.8, 11.7);
    TB([[10.6, 9.69], [11.0, 9.29], [14.6, 9.29]]); TB([[10.2, 8.89], [14.6, 8.89]]);                    // USB D−/D+ → FT232RL
    TB([[12.9, 10.55], [13.33, 10.98], [13.33, 11.4]]);
    TB([[10.2, 7.29], [8.3, 7.29]], 0.4); TB([[6.9, 7.29], [6.0, 7.29]], 0.4); bvia(5.9, 7.29);
    TB([[27.15, 6.91], [27.15, 9.0]]); TB([[28.0, 6.35], [28.0, 9.55], [27.55, 10.0], [27.3, 10.0]]);    // TX/RX → 1 k series resistors
    TB([[25.3, 9.2], [24.6, 9.2]]); TB([[25.3, 10.0], [24.6, 10.0]]);
    TB([[27.3, 11.6], [28.2, 11.6]]); bvia(28.3, 11.6);
    for (const x of [16.025, 17.975, 19.925, 21.875, 23.825]) { TB([[x, 13.0], [x, 13.6]]); bvia(x, 13.6); }
    for (const [x, y] of [[18.625, 3.95], [19.925, 3.6], [21.225, 3.95]]) { TB([[x, 4.9], [x, y]]); bvia(x, y); }
    TB([[20.32, 2.85], [20.32, 2.3]]); TB([[22.86, 2.85], [22.86, 2.3]]);

    // ── silkscreen, underside ──
    // rot 180: reads upright when the board is flipped over its long axis (USB stays on the left)
    const BS = (str, x, y, size, weight = 600) => b.text(str, x, y, { size, weight, rot: 180, side: 'bottom' });
    BS('ARDUINO NANO', 9.0, 4.2, 0.85, 700);
    BS('V3.0', 9.0, 5.75, 0.85, 700);
    BS('U2', 13.4, 6.9, 0.6);
    BS('D1', 8.9, 13.6, 0.6);
    BS('U3', 33.4, 12.57, 0.55);
    BS('RP2', 26.3, 12.65, 0.55);
    BS('C8', 31.7, 5.0, 0.5);
    BS('C9', 31.7, 12.75, 0.5);

    return b.finish();
  },
};
