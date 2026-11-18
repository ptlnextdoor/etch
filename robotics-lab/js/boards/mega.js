// Arduino Mega 2560 R3 — 101.6 × 53.34 mm, ATmega2560 (TQFP-100) + ATmega16U2 (USB bridge).
import { Board } from '../core/board.js';
import { qfp, qfn, soic, sot223, sot23, polyfuse, led, crystalHC49, resonator, capElec, button, header, passives } from '../core/parts-ic.js';
import { usbB, barrelJack } from '../core/parts-conn.js';

const P = 2.54;
const TY = 50.8, BY = 2.54;            // header rows: top and bottom
const RX1 = 93.98, RX2 = 96.52;        // columns of the double-row DIGITAL header
const MX = 53, MY = 26.5, MD = 8.3;    // ATmega2560: centre and distance to the outer end of its pads
const UX = 22, UY = 37.2;              // ATmega16U2 centre

/** Outer end of the pad in slot n (1…100) of the TQFP-100 footprint (25 per side: left top→bottom, bottom left→right, right bottom→top, top right→left). */
const mpin = (n, d = MD) => {
  const s = Math.floor((n - 1) / 25), o = 6 - 0.5 * ((n - 1) % 25);
  return s === 0 ? [MX - d, MY + o] : s === 1 ? [MX - o, MY - d] : s === 2 ? [MX + d, MY - o] : [MX + o, MY + d];
};
/** Orthogonal polyline → corners cut at 45° (the way real boards are routed). */
const cham = (pts, c = 0.7) => {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], a = pts[i - 1], n = pts[i + 1];
    const la = Math.hypot(p[0] - a[0], p[1] - a[1]), ln = Math.hypot(n[0] - p[0], n[1] - p[1]);
    const k = Math.min(c, la / 2, ln / 2);
    if (k < 0.04) { out.push(p); continue; }
    out.push([p[0] + (a[0] - p[0]) / la * k, p[1] + (a[1] - p[1]) / la * k], [p[0] + (n[0] - p[0]) / ln * k, p[1] + (n[1] - p[1]) / ln * k]);
  }
  out.push(pts[pts.length - 1]);
  return out;
};

// ───────── header pins: [silkscreen label, name, function, kind] ─────────
const IO = 'digital input/output';
const HDR_PWM_A = [
  ['SCL', 'SCL', 'I²C clock line (same signal as pin 21)', 'com'],
  ['SDA', 'SDA', 'I²C data line (same signal as pin 20)', 'com'],
  ['AREF', 'AREF', 'reference voltage for the analog inputs', 'ctl'],
  ['GND', 'GND', 'ground', 'gnd'],
  ['13', 'D13', 'PWM · built-in LED "L"', 'dig'],
  ['12', 'D12', 'PWM', 'dig'], ['11', 'D11', 'PWM', 'dig'], ['10', 'D10', 'PWM', 'dig'], ['9', 'D9', 'PWM', 'dig'], ['8', 'D8', 'PWM', 'dig'],
];
const HDR_PWM_B = [
  ['7', 'D7', 'PWM', 'dig'], ['6', 'D6', 'PWM', 'dig'], ['5', 'D5', 'PWM', 'dig'], ['4', 'D4', 'PWM', 'dig'],
  ['3', 'D3', 'PWM · external interrupt 1', 'dig'], ['2', 'D2', 'PWM · external interrupt 0', 'dig'],
  ['TX0 1', 'D1 / TX0', 'UART0 transmit — the same port that goes to USB', 'com'],
  ['RX0 0', 'D0 / RX0', 'UART0 receive — the same port that goes to USB', 'com'],
];
const HDR_COMM = [
  ['TX3 14', 'D14 / TX3', 'UART3 transmit (Serial3)', 'com'], ['RX3 15', 'D15 / RX3', 'UART3 receive (Serial3)', 'com'],
  ['TX2 16', 'D16 / TX2', 'UART2 transmit (Serial2)', 'com'], ['RX2 17', 'D17 / RX2', 'UART2 receive (Serial2)', 'com'],
  ['TX1 18', 'D18 / TX1', 'UART1 transmit (Serial1) · external interrupt 5', 'com'], ['RX1 19', 'D19 / RX1', 'UART1 receive (Serial1) · external interrupt 4', 'com'],
  ['SDA 20', 'D20 / SDA', 'I²C data · external interrupt 3', 'com'], ['SCL 21', 'D21 / SCL', 'I²C clock · external interrupt 2', 'com'],
];
const HDR_POWER = [
  ['', 'NC', 'not connected', 'nc'],
  ['IOREF', 'IOREF', 'logic voltage of the board (5 V) — tells shields which signal level to use', 'pwr'],
  ['RESET', 'RESET', 'reset: pull to ground to restart the program', 'ctl'],
  ['3.3V', '3.3V', '3.3 V power output, 50 mA max', 'pwr'],
  ['5V', '5V', '5 V power — regulator output (or input for an already regulated 5 V)', 'pwr'],
  ['GND', 'GND', 'ground', 'gnd'], ['GND', 'GND', 'ground', 'gnd'],
  ['VIN', 'Vin', 'external power input 7–12 V (same as the barrel jack)', 'pwr'],
];
const SPECIAL = { 44: 'PWM', 45: 'PWM', 46: 'PWM', 50: 'SPI MISO', 51: 'SPI MOSI', 52: 'SPI SCK', 53: 'SPI SS (chip select)' };

export default {
  id: 'mega',
  name: 'Arduino Mega 2560 R3', maker: 'Arduino', year: 2010,
  tagline: 'When the Uno runs out of pins',
  level: 'Intermediate',
  accent: '#0d7d8a',
  summary: 'The big brother of the Arduino Uno: the same simple language and the same shields, but more than three times the pins and eight times the memory. ' +
    'Reach for a Mega when a robot needs lots of motors, sensors and displays at once — a walking robot, a robotic arm or a 3D printer.',
  specs: [
    ['Microcontroller', 'ATmega2560 (8-bit AVR)'],
    ['Clock speed', '16 MHz'],
    ['Flash memory', '256 KB (8 KB used by the bootloader)'],
    ['RAM / EEPROM', '8 KB / 4 KB'],
    ['Digital pins', '54, of which 15 with PWM'],
    ['Analog inputs', '16 (10-bit ADC)'],
    ['Serial interfaces', '4 hardware UARTs, I²C, SPI'],
    ['Logic voltage', '5 V'],
    ['Current per pin', '20 mA (absolute maximum 40 mA)'],
    ['Power', 'USB 5 V or 7–12 V via barrel jack / Vin'],
    ['USB', 'USB-B connector, ATmega16U2 bridge'],
    ['Size and weight', '101.6 × 53.3 mm, 37 g'],
  ],
  compare: { mcu: 'ATmega2560', clock: '16 MHz', flash: '256 KB', ram: '8 KB', gpio: '54', analog: '16', wireless: '—', logic: '5 V', price: '≈ $45' },
  highlights: [
    '70 pins: 54 digital and 16 analog — enough for a big robot',
    'Four hardware UARTs: GPS, Bluetooth and debugging at the same time, no SoftwareSerial needed',
    'Compatible with Arduino Uno shields and sketches',
    '5 V logic works directly with most classroom sensors and modules',
  ],
  cautions: [
    'A pin supplies no more than 20 mA: power motors and servos from a separate supply through a driver, with the grounds connected together.',
    '3.3 V modules (ESP8266, nRF24L01, many sensors) must not be wired straight to the 5 V pins — use a level shifter.',
    'SPI and I²C are not where they are on the Uno: SPI is on pins 50–53, I²C on 20 and 21. Old shields that expect pins 11–13 and A4/A5 may not work.',
    'Feed 7–12 V into the barrel jack. Above that the regulator runs hot; below that the board gets less than 5 V.',
  ],
  uses: [
    'Hexapod robot: 18 servos through a driver, sensors on the remaining pins',
    'Robotic arm with joysticks, limit switches and a display',
    'The brain of a 3D printer or CNC machine (a RAMPS board plugs on top as a shield)',
    'A large weather station or smart greenhouse with dozens of sensors',
    'LED matrices and panels that need lots of pins',
  ],
  parts: {
    mcu: { name: 'ATmega2560 microcontroller', text: 'The main chip — the "brain" of the board, in a square package with 100 leads. It stores your program (256 KB), runs it at 16 million steps per second and controls every pin.' },
    usbchip: { name: 'ATmega16U2 USB bridge', text: 'A small second microcontroller that works as a translator. The computer speaks USB, while the ATmega2560 only understands a serial port (UART) — the 16U2 converts between the two so you can upload sketches and use the Serial Monitor.' },
    usb: { name: 'USB-B connector', text: 'The cable from your computer plugs in here — the same kind printers use. It carries your program to the board, data to the Serial Monitor, and 5 V power.' },
    jack: { name: 'Barrel jack, 5.5 × 2.1 mm', text: 'Input for a 7–12 V power adapter or battery pack, centre-positive. You need it when the robot has to run without a computer.' },
    reg5v: { name: '5 V regulator (NCP1117)', text: 'Turns the 7–12 V from the barrel jack into a steady 5 V for the whole board. The extra voltage is burned off as heat, so it gets noticeably warm at 12 V under heavy load.' },
    crystal: { name: '16 MHz crystal and resonator', text: 'The shiny metal can is the board\'s metronome: it sets the exact rhythm the USB chip needs to talk to the computer. A tiny ceramic resonator next to the ATmega2560 does the same job for the main chip.' },
    reset: { name: 'RESET button', text: 'Restarts the program from the very beginning — like rebooting a computer. The program itself is not erased.' },
    hdr_pwm: { name: 'Pins 0–13 (PWM) plus SCL, SDA, AREF, GND', text: 'Digital pins laid out exactly as on the Arduino Uno. Pins 2–13 support PWM — smoothly dimming an LED or changing motor speed. Pins 0 and 1 are shared with the USB connection.' },
    hdr_comm: { name: 'Pins 14–21 (COMMUNICATION)', text: 'Three extra serial ports (Serial1, Serial2, Serial3) and the I²C bus on pins 20 (SDA) and 21 (SCL). This is where GPS, Bluetooth, displays and smart sensors connect.' },
    hdr_digital: { name: 'Double-row header 22–53 (DIGITAL)', text: 'Another 32 digital pins — the main difference between the Mega and the Uno. The top pair of contacts is 5 V, the bottom pair is GND. Pins 44–46 support PWM, and 50–53 are the SPI bus.' },
    hdr_power: { name: 'POWER header', text: 'Power for your sensors comes from here: 5 V, 3.3 V and ground (GND). Vin is wired straight to the barrel jack, RESET restarts the board, IOREF tells shields the logic voltage.' },
    hdr_analog: { name: 'Analog inputs A0–A15', text: '16 inputs that measure a voltage from 0 to 5 V and turn it into a number from 0 to 1023. Use them for potentiometers, light, distance and line sensors.' },
    icsp: { name: 'ICSP headers', text: 'Six pins for a programmer: the chip can be flashed directly through them, without USB. The header next to the ATmega2560 also carries the SPI bus, which many shields use. The second one near the USB connector belongs to the ATmega16U2.' },
    led_l: { name: 'LED "L" (pin 13)', text: 'The built-in LED wired to pin 13. It is where everyone starts with Arduino: the first program, Blink, flashes this LED — no wiring needed.' },
    led_txrx: { name: 'TX and RX LEDs', text: 'They flicker when the board transmits (TX) or receives (RX) data over USB. If they blink while a sketch is uploading, the link to the computer is working.' },
    led_on: { name: 'ON LED', text: 'Lit whenever the board has 5 V power. If it goes dark, check the cable, the power supply and look for a short circuit.' },
  },
  partOrder: ['mcu', 'usbchip', 'usb', 'jack', 'reg5v', 'crystal', 'reset', 'hdr_pwm', 'hdr_comm', 'hdr_digital', 'hdr_power', 'hdr_analog', 'icsp', 'led_l', 'led_txrx', 'led_on'],
  pinNotes: [
    { title: 'Power', text: '5V and 3.3V are outputs for sensors (no more than 50 mA from 3.3V). GND is the common "minus". Vin carries whatever voltage arrives at the barrel jack. The double-row header has two more 5 V contacts at the top and two GND contacts at the bottom.' },
    { title: 'Digital pins and PWM', text: 'Pins 0–53 work as inputs or outputs with 0 V and 5 V levels. PWM (analogWrite) is available on pins 2–13 and 44–46. External interrupts are on 2, 3, 18, 19, 20 and 21.' },
    { title: 'Analog inputs', text: 'A0–A15 measure 0–5 V with 10-bit resolution (0–1023). They can also be used as ordinary digital pins 54–69.' },
    { title: 'Serial ports', text: 'Serial (pins 0, 1) is tied to USB — keep those pins free if you use the Serial Monitor. Serial1 is on 19 (RX) and 18 (TX), Serial2 on 17 and 16, Serial3 on 15 and 14.' },
    { title: 'I²C and SPI', text: 'I²C: 20 (SDA) and 21 (SCL), duplicated next to AREF. SPI: 50 (MISO), 51 (MOSI), 52 (SCK), 53 (SS) and on the ICSP header — not on 10–13 as on the Uno.' },
  ],
  code: {
    title: 'Blink the LED and listen to a second serial port', lang: 'cpp',
    src: `// The Mega has four hardware serial ports: Serial (USB), Serial1, Serial2, Serial3.
// We blink the built-in LED "L" and forward everything a module sends
// on Serial1 (for example a Bluetooth HC-05 or a GPS) to the Serial Monitor.
// Module wiring: its TX -> pin 19 (RX1), its RX -> pin 18 (TX1), GND -> GND.

const int LED = 13;            // built-in LED "L"
unsigned long lastBlink = 0;   // time of the last blink
bool ledOn = false;

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(9600);          // link to the computer over USB
  Serial1.begin(9600);         // link to the module on pins 18 and 19
  Serial.println("Mega is ready!");
}

void loop() {
  // Blink without delay() so no incoming data is missed
  if (millis() - lastBlink >= 500) {
    lastBlink = millis();
    ledOn = !ledOn;
    digitalWrite(LED, ledOn);
  }
  // Module -> computer
  if (Serial1.available()) Serial.write(Serial1.read());
  // Computer -> module
  if (Serial.available()) Serial1.write(Serial.read());
}`,
  },
  quiz: [
    { q: 'Find the microcontroller — the "brain" of the board', part: 'mcu', hint: 'The biggest black square chip, in the middle' },
    { q: 'Where does the cable from the computer plug in?', part: 'usb', hint: 'The large metal connector on the left edge' },
    { q: 'Where is the double-row header with pins 22–53?', part: 'hdr_digital', hint: 'The long two-row socket on the right end of the board' },
    { q: 'Which contacts take a sensor with an analog output?', part: 'hdr_analog', hint: 'Bottom edge, labelled A0…A15' },
    { q: 'Find the Serial1–Serial3 ports and the I²C bus', part: 'hdr_comm', hint: 'Top edge on the right, marked COMMUNICATION' },
    { q: 'Which button restarts the program?', part: 'reset', hint: 'The only push button on the board, near the top edge' },
  ],
  facts: [
    'Thousands of home-built RepRap 3D printers ran on an Arduino Mega with a RAMPS shield — this board helped make desktop 3D printing mainstream.',
    'The ATmega2560 has one hundred leads and 86 of them can be inputs/outputs, but only 70 are brought out to the headers.',
    'Analog inputs A0–A15 double as digital pins 54–69: digitalWrite(A0, HIGH) works.',
  ],

  build(opts = {}) {
    const b = new Board({
      w: 101.6, h: 53.34, theme: 'teal', finish: 'tin', quality: opts.quality ?? 1,
      outline: [[0, 0], [0, 53.34], [96.52, 53.34], [99.06, 50.8], [99.06, 40.386], [101.6, 37.846], [101.6, 5.08], [99.06, 2.54], [99.06, 0]],
      holes: [[13.97, 2.54], [15.24, 50.8], [66.04, 7.62], [66.04, 35.56], [90.17, 50.8], [96.52, 2.54]].map(([x, y]) => ({ x, y, d: 3.2 })),
    });
    const T = (pts, w = 0.2, side = 'top', c = 0.7) => b.trace(cham(pts, c), { w, side });
    const TB = (pts, w = 0.2, c = 0.7) => T(pts, w, 'bottom', c);
    const R = (pts, w = 0.2) => b.trace(pts, { w });               // raw polyline (already has its 45° segments)
    const via = (x, y, d = 0.5) => b.via(x, y, { d });
    const lbl = (s, x, y, o = {}) => b.text(s, x, y, { size: 0.72, ...o });

    // ───────── headers: sockets, pins, labels ─────────
    const rows = [
      { id: 'hdr_pwm', x0: 18.796, y: TY, def: HDR_PWM_A },
      { id: 'hdr_pwm', x0: 45.72, y: TY, def: HDR_PWM_B },
      { id: 'hdr_comm', x0: 68.58, y: TY, def: HDR_COMM },
      { id: 'hdr_power', x0: 27.94, y: BY, def: HDR_POWER },
      { id: 'hdr_analog', x0: 50.8, y: BY, def: Array.from({ length: 8 }, (_, i) => ['A' + i, 'A' + i, `analog input (10-bit ADC), also digital pin ${54 + i}`, 'ana']) },
      { id: 'hdr_analog', x0: 73.66, y: BY, def: Array.from({ length: 8 }, (_, i) => ['A' + (i + 8), 'A' + (i + 8), `analog input (10-bit ADC), also digital pin ${62 + i}`, 'ana']) },
    ];
    for (const r of rows) {
      const n = r.def.length;
      b.tag(header(b, { x: r.x0 + P * (n - 1) / 2, y: r.y, nx: n, type: 'female', pin1: false }), r.id);
      r.def.forEach(([name, pinName, fn, kind], i) => {
        const x = r.x0 + P * i;
        b.pin(x, r.y, pinName, fn, kind);
        if (!name) return;
        const small = /[A-Z]{3}/.test(name);
        if (r.y === TY) b.text(name, x, TY - 1.5, { size: small ? 0.78 : 0.95, rot: 90, align: 'right' });
        else b.text(name, x, BY + 1.5, { size: r.id === 'hdr_power' ? 0.8 : 0.9, rot: 90, align: 'left' });
      });
    }
    // double-row header 22–53: i = 0 (bottom, GND) … 17 (top, 5V)
    b.tag(header(b, { x: (RX1 + RX2) / 2, y: 26.67, rot: 90, nx: 18, ny: 2, type: 'female', pin1: false }), 'hdr_digital');
    const dig = (n) => [n % 2 ? RX2 : RX1, 45.72 - P * Math.floor((n - 22) / 2)];
    for (let i = 0; i < 18; i++) for (let c = 0; c < 2; c++) {
      const x = c ? RX2 : RX1, y = 5.08 + P * i;
      if (i === 0) b.pin(x, y, 'GND', 'ground', 'gnd');
      else if (i === 17) b.pin(x, y, '5V', '5 V power output', 'pwr');
      else {
        const n = 22 + (16 - i) * 2 + c;
        b.pin(x, y, 'D' + n, SPECIAL[n] ? `${IO} · ${SPECIAL[n]}` : IO, n >= 50 ? 'com' : 'dig');
        b.text(String(n), c ? 98.42 : 91.95, y, { size: c ? 0.72 : 0.9 });
      }
    }
    b.text('5V', 91.9, 48.26, { size: 0.9 }); b.text('GND', 99.3, 5.25, { size: 0.72 });
    b.text('DIGITAL', 89.6, 26.67, { size: 1.15, rot: 90, weight: 700 });
    // group captions
    b.line([[27.8, 47.95], [27.8, 47.6], [59.6, 47.6], [59.6, 47.95]], { w: 0.14 });
    b.text('PWM', 44.2, 46.7, { size: 1.0, weight: 700 });
    b.line([[67.4, 45.35], [87.5, 45.35]], { w: 0.14 });
    b.text('COMMUNICATION', 77.47, 44.3, { size: 1.05, weight: 700 });
    b.line([[29.3, 8.0], [46.9, 8.0]], { w: 0.14 });
    b.text('POWER', 38.1, 9.0, { size: 1.05, weight: 700 });
    b.line([[49.6, 6.5], [63.6, 6.5]], { w: 0.14 }); b.line([[68.6, 6.5], [92.6, 6.5]], { w: 0.14 });
    b.text('ANALOG IN', 78.5, 7.55, { size: 1.05, weight: 700 });
    // board name
    b.text('ARDUINO', 77.3, 35.75, { size: 1.35, weight: 700 });
    b.text('MEGA', 77.3, 32.2, { size: 3.0, weight: 800 });
    b.text('2560', 77.3, 28.2, { size: 3.0, weight: 800 });
    b.text('MADE IN ITALY', 74.5, 18.2, { size: 0.9, weight: 700 });

    // ───────── big parts ─────────
    b.tag(usbB(b, { x: -6.2, y: 38.1 }), 'usb');
    b.tag(barrelJack(b, { x: -1.8, y: 7.6 }), 'jack');
    b.tag(qfp(b, { x: MX, y: MY, body: 14, pins: 25, pitch: 0.5, text: ['ATMEGA2560', '16AU 1126'] }), 'mcu');
    b.tag(qfn(b, { x: UX, y: UY, size: 5, pins: 8, pitch: 0.5, text: ['MEGA16U2', 'MU 1205'] }), 'usbchip');
    b.tag(crystalHC49(b, { x: 30.2, y: 44.2, text: '16.000' }), 'crystal');
    b.tag(resonator(b, { x: 48.6, y: 14.3, text: '16.0' }), 'crystal');
    b.tag(button(b, { x: 55.5, y: 44.3, type: 'tact6', cap: 'red' }), 'reset');
    b.tag(sot223(b, { x: 6.6, y: 22.8, text: ['NCP1117', 'ST50T3G'] }), 'reg5v');
    // ICSP headers: ATmega2560 (next to the MCU) and ATmega16U2 (next to USB)
    b.tag(header(b, { x: 66.67, y: 29.14, rot: 90, nx: 3, ny: 2, type: 'male', pin1: false }), 'icsp');
    b.tag(header(b, { x: 19.0, y: 45.0, nx: 3, ny: 2, type: 'male', pin1: false }), 'icsp');
    [[65.4, 31.68, 'MISO', 'ICSP: SPI MISO (same as pin 50)', 'com'], [67.94, 31.68, '5V', 'ICSP: 5 V power', 'pwr'],
      [65.4, 29.14, 'SCK', 'ICSP: SPI clock (same as pin 52)', 'com'], [67.94, 29.14, 'MOSI', 'ICSP: SPI MOSI (same as pin 51)', 'com'],
      [65.4, 26.6, 'RESET', 'ICSP: reset of the ATmega2560', 'ctl'], [67.94, 26.6, 'GND', 'ICSP: ground', 'gnd']].forEach((p) => b.pin(...p));
    lbl('ICSP', 66.67, 24.55, { size: 0.8 }); lbl('ICSP', 13.9, 45.0, { rot: 90, size: 0.8 });
    lbl('RESET', 55.5, 40.25, { size: 0.85 });
    // LEDs
    b.tag(led(b, { x: 34.0, y: 39.6, size: '0805', color: '#ffd21f' }), 'led_txrx');
    b.tag(led(b, { x: 34.0, y: 37.3, size: '0805', color: '#ffd21f' }), 'led_txrx');
    b.tag(led(b, { x: 34.0, y: 35.0, size: '0805', color: '#ff9d00' }), 'led_l');
    b.tag(led(b, { x: 66.04, y: 46.75, rot: 90, size: '0805', color: '#22d65c', on: true }), 'led_on');
    lbl('TX', 35.7, 39.6, { align: 'left', size: 0.8 }); lbl('RX', 35.7, 37.3, { align: 'left', size: 0.8 }); lbl('L', 35.7, 35.0, { align: 'left', size: 0.8 });
    lbl('ON', 66.04, 48.85, { size: 0.75 });
    // power section
    capElec(b, { x: 18.4, y: 9.6, rot: 90, d: 6.3, h: 5.4, text: ['47', '25V'] });
    capElec(b, { x: 25.3, y: 9.6, rot: 90, d: 6.3, h: 5.4, text: ['47', '25V'] });
    polyfuse(b, { x: 13.6, y: 28.3, rot: 90, size: '1812', text: '501' });
    sot23(b, { x: 15.6, y: 22.6, rot: 180, n: 3, text: '340' });                                           // T1 — USB / jack auto-select MOSFET
    soic(b, { x: 20.8, y: 26.6, n: 8, pitch: 0.65, bodyW: 3.0, bodyL: 3.0, span: 4.9, h: 1.1, text: ['V358'] }); // LMV358
    sot23(b, { x: 27.2, y: 19.0, n: 5, text: 'LAAB' });                                                    // LP2985 3.3 V
    passives(b, [
      ['diode', 6.4, 15.6, 0, { pkg: 'sma', text: 'M7' }],
      ['res', 13.9, 38.9, 0, { text: '220' }], ['res', 13.9, 37.45, 0, { text: '220' }],
      ['cap', 11.9, 41.3, 0, { color: 'grey' }], ['cap', 11.9, 35.3, 0, { color: 'grey' }],
      ['cap', 17.0, 34.9, 0], ['cap', 22.0, 32.9, 0], ['cap', 23.9, 26.6, 90], ['cap', 17.6, 31.2, 0, { size: '0805', color: 'brown' }],
      ['resArray', 29.0, 37.3, 90, { text: '102' }], ['resArray', 31.0, 31.0, 0, { text: '102' }], ['resArray', 33.6, 25.4, 90, { text: '103' }],
      ['cap', 28.6, 25.6, 90], ['cap', 30.4, 25.6, 90], ['res', 29.5, 22.4, 0, { text: '103' }], ['cap', 33.6, 21.4, 0],
      ['cap', 24.3, 19.0, 90], ['cap', 30.1, 19.0, 90], ['cap', 33.4, 17.4, 0, { size: '0805', color: 'brown' }],
      ['res', 23.0, 22.3, 0, { text: '103' }], ['res', 26.6, 22.3, 0, { text: '103' }],
      ['cap', 42.2, 37.0, 90], ['cap', 44.2, 37.0, 90], ['cap', 47.6, 38.9, 90], ['cap', 49.6, 38.9, 90], ['res', 43.2, 40.9, 0, { text: '103' }],
      ['cap', 43.4, 15.3, 0], ['cap', 43.4, 13.5, 0], ['res', 40.3, 14.4, 90, { text: '105' }], ['cap', 37.6, 13.4, 90], ['diode', 40.6, 11.2, 0, { pkg: 'sod123' }],
      ['res', 66.04, 43.75, 90, { text: '102' }],
      ['cap', 60.3, 17.9, 90], ['cap', 64.0, 18.3, 0], ['cap', 60.5, 37.0, 90],
      ['cap', 58.0, 9.6, 0], ['res', 61.2, 9.6, 0, { text: '103' }],
    ]);
    [['PC1', 18.4, 4.75], ['PC2', 24.6, 4.75], ['D1', 6.4, 13.45], ['F1', 16.25, 26.6, 90], ['T1', 17.9, 21.4], ['IC2', 1.75, 22.8, 90], ['U3', 19.4, 30.25],
      ['IC3', 27.2, 16.6], ['RN1', 31.0, 33.0], ['RN2', 35.7, 25.4, 90], ['RN4', 29.0, 34.9], ['Z1', 11.9, 42.5], ['Z2', 11.9, 34.1],
      ['C3', 22.0, 31.8], ['R1', 29.5, 21.2], ['C7', 43.2, 39.0], ['Y2', 45.9, 13.9], ['C12', 59.0, 8.4], ['D3', 40.6, 9.95],
    ].forEach(([s, x, y, rot = 0]) => lbl(s, x, y, { rot }));

    // ───────── top layer: ATmega2560 fan-out ─────────
    // PWM pins D6…D13 → top headers (around the crystal)
    {
      const net = [[15, 48.26], [16, 45.72], [17, 41.656], [18, 39.116], [23, 36.576], [24, 34.036], [25, 31.496], [26, 28.956]];
      const xv = [40.6, 40.1, 39.6, 39.116, 38.6, 38.1, 37.6, 37.1], yt = [43.3, 44.3, 45.3, 46.4, 48.95, 48.45, 47.95, 47.45];
      net.forEach(([pin, X], k) => {
        const s = mpin(pin);
        const pts = pin === 26 ? [s, [s[0], 17.4], [xv[k], 17.4]] : [s, [xv[k], s[1]]];
        pts.push([xv[k], yt[k]], [X, yt[k]], [X, TY - 0.8]);
        T(pts);
      });
    }
    // bring a trace to pin n of the DIGITAL header: even pins straight in, odd pins between the pads of the inner column
    const toDig = (n, from, xd) => {
      const [x, y] = dig(n), odd = n % 2, yt = odd ? y - 1.27 : y, y0 = from[from.length - 1][1];
      const pts = [...from, [xd, y0], [xd + Math.abs(yt - y0), yt]];
      if (odd) pts.push([94.9, yt], [96.1, y], [x - 0.8, y]); else pts.push([x - 0.8, y]);
      R(pts);
    };
    // right side of the MCU, lower half: D41, D40, D37…D30 (under the ICSP header, then fanning up)
    [41, 40, 37, 36, 35, 34, 33, 32, 31, 30].forEach((n, i) => toDig(n, [mpin(51 + i)], 82 + 0.3 * (9 - i)));
    // right side, upper part: D29…D25 and D24…D22 (from the top side) — around the mounting hole
    [29, 28, 27, 26, 25, 24, 23, 22].forEach((n, j) => {
      const s = j < 5 ? mpin(71 + j) : mpin(76 + j - 5), yh = 37.7 + 0.45 * j;
      const from = j < 5 ? cham([s, [63.8 - 0.45 * j, s[1]], [63.8 - 0.45 * j, yh], [70, yh]], 0.6) : cham([s, [s[0], yh], [70, yh]], 0.6);
      toDig(n, from, 87.4 - 0.25 * j);
    });
    // bottom side of the MCU: D42…D49 → DIGITAL header
    [42, 43, 44, 45, 46, 47, 48, 49].forEach((n, m) => {
      const s = mpin(42 - m), yh = 15.8 - 0.5 * m;
      toDig(n, cham([s, [s[0], yh], [62, yh]], 0.6), 84.4 + 0.3 * m);
    });
    // resonator
    R([mpin(33), [50.5, 16.9], [49.8, 16.2], [49.8, 15.2]]);
    T([mpin(34), [51.0, 12.6], [47.4, 12.6], [47.4, 13.4]], 0.2, 'top', 0.4);

    // ───────── vias around the ATmega2560 (signals leave for the bottom layer) ─────────
    const fan = (n, far, len = [0.75, 1.65]) => { const p = mpin(n), q = mpin(n, MD + len[far ? 1 : 0]); R([p, q]); via(q[0], q[1]); return q; };
    const vL = {}, vT = {};
    [1, 2, 3, 5, 6, 7, 10, 11, 12, 13].forEach((n, i) => { vL[n] = fan(n, i % 2); });
    [19, 20, 21, 22].forEach((n, i) => { vL[n] = fan(n, i % 2); });
    for (let n = 82; n <= 97; n++) vT[n] = fan(n, n % 2);
    [79, 80, 98, 99, 100].forEach((n) => { vT[n] = fan(n, n % 2); });
    [[62, 1], [63, 0], [64, 1], [70, 0]].forEach(([n, far]) => fan(n, far, [0.9, 1.7]));
    [43, 44, 45, 46, 50].forEach((n, i) => fan(n, i % 2));
    R([mpin(30), [49.0, 17.5], [48.1, 16.8]]); via(48.1, 16.8);
    R([[63.0, 26.0], [63.6, 26.6], [64.7, 26.6]]);                  // RESET → ICSP

    // ───────── top layer: USB bridge, LEDs, power ─────────
    const u = (side, i) => {   // outer end of pad i (0…7) of the 16U2: side 'l' | 'r' (bottom → top), 't' | 'b' (left → right)
      const o = (i - 3.5) * 0.5, d = 2.75;
      return side === 'l' ? [UX - d, UY + o] : side === 'r' ? [UX + d, UY + o] : side === 't' ? [UX + o, UY + d] : [UX + o, UY - d];
    };
    R([[8.1, 39.35], [10.9, 39.35], [11.35, 38.9], [13.0, 38.9]]); R([[8.1, 36.85], [10.9, 36.85], [11.5, 37.45], [13.0, 37.45]]);   // D+ / D−
    R([[14.8, 38.9], [17.4, 38.9], [18.35, 37.95], u('l', 5)]); R([[14.8, 37.45], u('l', 4)]);
    R([u('t', 7), [23.75, 40.4], [24.2, 40.85], [29.3, 40.85], [32.64, 44.19]]);     // crystal
    R([u('t', 6), [23.25, 40.9], [24.2, 41.85], [25.4, 41.85], [27.75, 44.2]]);
    R([u('t', 1), [20.75, 40.9], [19.0, 42.65], [19.0, 43.0]]);                       // 16U2 ICSP
    R([u('t', 3), [21.75, 41.6], [21.54, 41.81], [21.54, 43.0]]);
    R([u('t', 0), [20.25, 40.5], [17.3, 43.45], [16.9, 43.6]]);
    b.route(u('r', 5), [27.9, 38.5]); b.route(u('r', 4), [27.9, 37.7]);               // TX / RX LEDs through the resistor array
    b.route([30.1, 38.5], [32.9, 39.6]); b.route([30.1, 37.7], [32.9, 37.3]); b.route([30.1, 36.1], [32.9, 35.0]);
    R([[21.775, 29.3], [21.775, 30.2], [22.9, 31.3], [25.2, 31.3], [26.0, 32.1], [26.0, 35.2], [26.9, 36.1], [27.9, 36.1]]);   // LMV358 → LED L
    R([[16.7, 23.6], [18.0, 23.6], [18.6, 23.0], [19.825, 23.0], [19.825, 23.9]]);                                           // LMV358 → gate of T1
    // power: jack → D1 → regulator → 5 V, USB → fuse → T1
    R([[12.2, 9.6], [13.0, 10.4], [13.0, 14.4], [11.8, 15.6], [9.0, 15.6]], 0.8);
    R([[13.0, 12.3], [18.0, 12.3]], 0.7);
    T([[3.8, 15.6], [2.0, 15.6], [2.0, 17.7], [4.3, 17.7], [4.3, 19.0]], 0.6); b.via(2.0, 16.7, { d: 0.8 });
    R([[6.6, 19.0], [6.6, 17.8]], 0.5); b.via(6.6, 17.7, { d: 0.7 });
    R([[8.9, 19.0], [8.9, 18.2], [10.4, 18.2]], 0.5); b.via(10.4, 18.2, { d: 0.7 });
    R([[8.2, 25.4], [10.4, 25.4], [11.6, 24.2], [11.6, 21.6], [12.8, 20.4], [15.6, 20.4]], 0.6);
    R([[15.6, 21.6], [15.6, 20.4], [17.2, 20.4], [20.0, 17.6], [20.0, 15.2], [24.3, 15.2], [25.3, 14.2], [25.3, 13.5]], 0.6); b.via(20.0, 15.2, { d: 0.8 });
    R([[9.0, 33.4], [11.2, 33.4], [12.7, 31.9], [12.7, 30.8]], 0.5);
    R([[13.4, 25.8], [13.4, 24.4], [14.2, 23.6], [14.65, 23.6]], 0.45);
    R([[26.25, 17.6], [26.25, 16.2], [25.25, 15.2]], 0.4);
    R([[28.15, 17.6], [28.15, 16.4], [29.6, 14.95], [29.6, 14.0]], 0.4); b.via(29.6, 14.0, { d: 0.7 });
    b.via(31.4, 12.4, { d: 0.6 });

    // ───────── bottom layer ─────────
    // analog inputs: A0…A6 as a diagonal fan, A7…A15 around the mounting hole
    for (let i = 0; i < 16; i++) {
      const v = vT[97 - i], X = (i < 8 ? 50.8 : 73.66) + P * (i % 8);
      if (i < 7) { const c = 66.04 + 0.75 * i; b.trace([v, [v[0], c - v[0]], [X, c - X], [X, BY + 0.8]], { w: 0.2, side: 'bottom' }); }
      else { const yh = 19.2 + 0.5 * (i - 7); TB([v, [v[0], yh], [X, yh], [X, BY + 0.8]]); }
    }
    // D0…D5: from the via pocket left of the MCU — up and right to the header
    [1, 2, 3, 5, 6, 7].forEach((n, r) => {
      const v = vL[n], xc = 42.2 - 0.45 * r, yh = 41.6 + 0.5 * r, X = 63.5 - P * r;
      TB([v, [xc, v[1]], [xc, yh], [X, yh], [X, TY - 0.8]], 0.2, 0.6);
    });
    // COMMUNICATION: from the header to a row of vias
    for (let j = 0; j < 8; j++) {
      const X = 68.58 + P * j, yh = 47.7 - 0.5 * j, vx = 65.0 + 0.9 * j, vy = j % 2 ? 42.1 : 41.4;
      TB([[X, TY - 0.8], [X, yh], [vx, yh], [vx, vy]], 0.2, 0.6); via(vx, vy);
    }
    // power: Vin, 5V, 3.3V, RESET — wide traces from the left part of the board to the POWER header
    TB([[2.0, 16.7], [45.72, 16.7], [45.72, BY + 0.8]], 0.7, 1.2);
    TB([[20.0, 15.2], [38.1, 15.2], [38.1, BY + 0.8]], 0.7, 1.2);
    TB([[29.6, 14.0], [35.56, 14.0], [35.56, BY + 0.8]], 0.45, 1.0);
    TB([[31.4, 12.4], [33.02, 12.4], [33.02, BY + 0.8]], 0.25, 0.6);
    b.trace([[RX1, 48.26], [RX2, 48.26]], { w: 0.9, side: 'bottom' });
    b.trace([[RX1, 5.08], [RX2, 5.08]], { w: 0.9, side: 'bottom' });
    // bottom silkscreen
    // SPI: pins 50–52 → ICSP header (squeezed between the A15 trace and the DIGITAL header, then under the ICSP pads)
    TB([[RX1 - 0.8, 7.62], [92.0, 7.62], [92.0, 24.0], [63.85, 24.0], [63.85, 31.68], [64.6, 31.68]], 0.2, 0.5);
    TB([[RX1 - 0.8, 10.16], [92.38, 10.16], [92.38, 24.4], [64.2, 24.4], [64.2, 29.14], [64.6, 29.14]], 0.2, 0.5);
    b.trace([[RX2 - 0.8, 10.16], [96.1, 10.16], [94.9, 11.43], [93.3, 11.43], [92.76, 11.97], [92.76, 24.3], [92.26, 24.8], [69.9, 24.8], [69.4, 25.3], [69.4, 28.6], [68.9, 29.14], [68.7, 29.14]], { w: 0.2, side: 'bottom' });
    // bottom silkscreen (the board is flipped top-to-bottom when you look at its underside, hence rot 180)
    const bt = (str, x, y, size, weight = 700) => b.text(str, x, y, { size, weight, rot: 180, side: 'bottom' });
    bt('ARDUINO', 24, 22.6, 2.6); bt('MEGA 2560', 24, 27.9, 3.6, 800); bt('REV 3', 24, 32.4, 1.6);
    bt('MADE IN ITALY', 79, 29.6, 1.5); bt('ATmega2560 · 16 MHz · 5 V', 79, 32.4, 1.0, 600);
    bt('POWER', 38.1, 6.6, 1.0); bt('ANALOG IN', 79.0, 6.6, 1.0); bt('PWM', 41.0, 46.9, 1.0); bt('COMMUNICATION', 77.47, 46.9, 1.0); bt('DIGITAL', 89.6, 38.0, 1.0);

    return b.finish();
  },
};
