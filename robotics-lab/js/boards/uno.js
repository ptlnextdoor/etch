// Arduino Uno R3 — 68.58 × 53.34 mm, USB on the left. Board coordinates: origin = bottom-left corner, mm.
import { Board } from '../core/board.js';
import { qfn, dip, sot223, led, crystalHC49, resonator, capElec, button, header, passives } from '../core/parts-ic.js';
import { usbB, barrelJack } from '../core/parts-conn.js';

const P = 2.54;
const TOP_Y = 50.8, BOT_Y = 2.54;                        // female header rows
const DIP_X0 = 30.48, DIP_YB = 11.43, DIP_YT = 19.05;    // ATmega328P-PU: 14 pins per row, rows 7.62 mm apart
const dipX = (i) => DIP_X0 + i * P;

// x of the first contact, y, part id, contacts: [silkscreen label, pin name, function, kind]
const HEADERS = [
  { x0: 18.796, y: TOP_Y, id: 'hdr_digital', pins: [
    ['', 'SCL', 'I²C clock line (same line as A5)', 'com'],
    ['', 'SDA', 'I²C data line (same line as A4)', 'com'],
    ['AREF', 'AREF', 'reference voltage for the analog inputs', 'ctl'],
    ['GND', 'GND', 'ground', 'gnd'],
    ['13', 'D13', 'digital I/O · SPI SCK · built-in LED "L"', 'dig'],
    ['12', 'D12', 'digital I/O · SPI MISO', 'dig'],
    ['~11', 'D11', 'PWM · SPI MOSI', 'dig'],
    ['~10', 'D10', 'PWM · SPI SS', 'dig'],
    ['~9', 'D9', 'PWM', 'dig'],
    ['8', 'D8', 'digital I/O', 'dig'],
  ] },
  { x0: 45.72, y: TOP_Y, id: 'hdr_digital', pins: [
    ['7', 'D7', 'digital I/O', 'dig'],
    ['~6', 'D6', 'PWM', 'dig'],
    ['~5', 'D5', 'PWM', 'dig'],
    ['4', 'D4', 'digital I/O', 'dig'],
    ['~3', 'D3', 'PWM · external interrupt INT1', 'dig'],
    ['2', 'D2', 'digital I/O · external interrupt INT0', 'dig'],
    ['TX→1', 'D1 / TX', 'UART transmit (busy while talking to the computer)', 'com'],
    ['RX←0', 'D0 / RX', 'UART receive (busy while talking to the computer)', 'com'],
  ] },
  { x0: 27.94, y: BOT_Y, id: 'hdr_power', pins: [
    ['', 'NC', 'not connected (reserved)', 'nc'],
    ['IOREF', 'IOREF', 'logic voltage of the board (5 V) — tells shields what level to use', 'pwr'],
    ['RESET', 'RESET', 'reset: connect to GND to restart the program', 'ctl'],
    ['3.3V', '3.3V', '3.3 V power output, 50 mA max', 'pwr'],
    ['5V', '5V', '5 V power output for sensors and modules', 'pwr'],
    ['GND', 'GND', 'ground', 'gnd'],
    ['GND', 'GND', 'ground', 'gnd'],
    ['Vin', 'Vin', 'power input 7–12 V (wired to the barrel jack)', 'pwr'],
  ] },
  { x0: 50.8, y: BOT_Y, id: 'hdr_analog', pins: [
    ['A0', 'A0', 'analog input (also digital D14)', 'ana'],
    ['A1', 'A1', 'analog input (also digital D15)', 'ana'],
    ['A2', 'A2', 'analog input (also digital D16)', 'ana'],
    ['A3', 'A3', 'analog input (also digital D17)', 'ana'],
    ['A4', 'A4', 'analog input · I²C SDA', 'ana'],
    ['A5', 'A5', 'analog input · I²C SCL', 'ana'],
  ] },
];

export default {
  id: 'uno',
  name: 'Arduino Uno R3', maker: 'Arduino', year: 2010,
  tagline: 'Where almost everyone starts',
  level: 'Beginner',
  accent: '#0d7d8a',
  summary: 'The best-known learning board in the world. A simple, tough 8-bit ATmega328P microcontroller, forgiving 5 V logic and sockets that take jumper wires without soldering. Thousands of tutorials are written for it, and hundreds of add-on boards — "shields" — plug straight on top.',
  specs: [
    ['Microcontroller', 'ATmega328P (8-bit AVR)'],
    ['Clock speed', '16 MHz'],
    ['Flash memory', '32 KB (0.5 KB used by the bootloader)'],
    ['RAM / EEPROM', '2 KB / 1 KB'],
    ['Digital pins', '14, of which 6 with PWM'],
    ['Analog inputs', '6 (10-bit ADC)'],
    ['Logic voltage', '5 V'],
    ['Power', 'USB 5 V, or 7–12 V via the jack / Vin'],
    ['Current per pin', '20 mA (absolute maximum 40 mA)'],
    ['Interfaces', 'UART, I²C, SPI'],
    ['Computer link', 'USB-B through an ATmega16U2 bridge'],
    ['Size', '68.6 × 53.4 mm, 25 g'],
  ],
  compare: { mcu: 'ATmega328P', clock: '16 MHz', flash: '32 KB', ram: '2 KB', gpio: '14 + 6', analog: '6 × 10-bit', wireless: '—', logic: '5 V', price: '≈ $25' },
  highlights: [
    'Forgiving: 5 V logic and sturdy pins survive a lot of beginner mistakes',
    'Huge community — every question already has an answer and a ready example',
    'Hundreds of shields: motor drivers, relays and displays stack on top with no wiring',
    'The microcontroller sits in a socket — a burnt chip can simply be swapped',
  ],
  cautions: [
    'No more than 20 mA from one pin: LEDs always need a resistor; motors and relays only through a driver or a transistor',
    'Do not power servos and motors from the board\'s 5V pin — give them their own supply and join the grounds (GND)',
    '3.3 V sensors and modules must not be wired straight to the 5 V signal pins — use a level shifter',
    'Pins 0 and 1 are shared with the USB link: while something is connected to them a sketch may fail to upload',
  ],
  uses: [
    'A first two-motor robot with a motor-driver shield',
    'An obstacle-avoiding robot with an ultrasonic distance sensor',
    'A line-following robot',
    'A robot arm on hobby servos',
    'A weather station with a display and sensors',
  ],
  parts: {
    mcu: { name: 'ATmega328P microcontroller', text: 'The brain of the board: a tiny computer in a single chip. It stores your program (the sketch), runs it at 16 million clock ticks per second and controls every pin. It sits in a socket, so it can be pulled out and replaced.' },
    usbchip: { name: 'ATmega16U2 USB bridge', text: 'The interpreter between the computer and the main microcontroller: it turns USB into a simple serial port (UART). Sketches are uploaded through it, and it carries the text you see in the Serial Monitor.' },
    usb: { name: 'USB-B connector', text: 'The cable from the computer plugs in here (the square "printer" USB). Through it the board gets 5 V power, receives your program and talks to the computer.' },
    jack: { name: 'Power jack, 7–12 V', text: 'A 5.5 × 2.1 mm barrel jack for a wall adapter or a battery pack, centre pin positive. Use it when the robot drives around without a USB cable. Do not go above 12 V — the regulator will overheat.' },
    reg5v: { name: '5 V regulator (NCP1117)', text: 'Turns the 7–12 V from the power jack into a steady 5 V for the whole board. The extra voltage is burnt off as heat, so it gets warm under load — that is normal, but it cannot feed motors.' },
    caps: { name: 'Electrolytic capacitors, 47 µF', text: 'Small energy reservoirs before and after the regulator. They smooth out voltage dips so the microcontroller does not reset when something nearby switches on suddenly.' },
    crystal: { name: '16 MHz crystal', text: 'A precise metronome in a metal can: it sets the pace for the USB bridge. The main microcontroller has its own 16 MHz resonator — a tiny ceramic one next to the socket. They are what delay(), millis() and serial speeds rely on.' },
    reset: { name: 'RESET button', text: 'Restarts the program from the very beginning, like rebooting a computer. The sketch itself is not erased.' },
    hdr_digital: { name: 'Digital pins 0–13', text: 'Each pin can be an input (a button, a sensor) or an output (an LED, a signal to a motor driver). Pins marked "~" (3, 5, 6, 9, 10, 11) can do PWM — smoothly dimming LEDs and setting motor speed. On the left end are GND, AREF and the I²C lines SDA and SCL.' },
    hdr_power: { name: 'POWER header', text: 'This is where sensors and modules get their power: 5V, 3.3V and GND (ground). Vin is the 7–12 V input wired to the power jack. RESET lets you restart the board with an external button.' },
    hdr_analog: { name: 'Analog inputs A0–A5', text: 'They measure a voltage from 0 to 5 V and turn it into a number from 0 to 1023. Potentiometers, light and line sensors and joysticks go here. A4 and A5 double as the I²C bus (SDA and SCL).' },
    icsp: { name: 'ICSP header', text: 'Six pins for programming the microcontroller directly with an external programmer — for example, to burn the bootloader into a fresh chip. It also carries the SPI bus (MISO, MOSI, SCK), which some shields use.' },
    led_l: { name: 'LED "L" (pin 13)', text: 'A built-in LED wired to pin 13. Almost every first sketch starts with it: you can blink it without connecting a single part.' },
    led_txrx: { name: 'TX and RX LEDs', text: 'They flash when the board sends (TX) and receives (RX) data over USB. If they flicker quickly during an upload, the link to the computer is working.' },
    led_on: { name: 'ON LED', text: 'Glows green whenever the board has power. If it is dark, check the cable, the batteries and whether 5V is shorted to GND.' },
  },
  partOrder: ['mcu', 'usb', 'usbchip', 'jack', 'reg5v', 'caps', 'hdr_digital', 'hdr_power', 'hdr_analog', 'led_l', 'led_txrx', 'led_on', 'reset', 'crystal', 'icsp'],
  pinNotes: [
    { title: 'Power', text: '5V and 3.3V are outputs for sensors and modules; GND is the common ground that every device in the circuit shares. Vin is the 7–12 V input. The 3.3V pin can supply no more than 50 mA.' },
    { title: 'Digital pins and PWM', text: 'Pins 0–13 work as inputs and outputs with 0 V and 5 V levels. The "~" next to 3, 5, 6, 9, 10 and 11 means PWM: analogWrite() smoothly controls brightness and speed.' },
    { title: 'Analog inputs', text: 'A0–A5 read a 0–5 V voltage with analogRead() and return a number from 0 to 1023. If you run out of digital pins, they also work as ordinary digital pins (D14–D19).' },
    { title: 'Buses', text: 'UART — pins 0 (RX) and 1 (TX), shared with the USB link to the computer. I²C — SDA and SCL (the same lines as A4 and A5). SPI — pins 10–13 and the ICSP header.' },
    { title: 'Interrupts', text: 'Pins 2 and 3 can react to a signal instantly, even when the program is busy with something else — attachInterrupt(). Handy for wheel encoders on a robot.' },
  ],
  code: { title: 'First sketch: blink the built-in LED', lang: 'cpp', src: `// LED "L" is already on the board and wired to pin 13.
// LED_BUILTIN is the ready-made name for that pin.

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);     // pin 13 works as an output
  Serial.begin(9600);               // open the USB link to the computer
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);  // 5 V on the pin — the LED is on
  Serial.println("on");             // shows up in the Serial Monitor
  delay(500);                       // wait half a second

  digitalWrite(LED_BUILTIN, LOW);   // 0 V — the LED is off
  Serial.println("off");
  delay(500);
}` },
  quiz: [
    { q: 'Find the microcontroller — the brain of the board', part: 'mcu', hint: 'The long black chip with two rows of legs, sitting in a socket' },
    { q: 'Where does the cable from the computer plug in?', part: 'usb', hint: 'The big metal connector on the left edge' },
    { q: 'Where do you connect a wall adapter or batteries when the robot runs without a cable?', part: 'jack', hint: 'The black round socket in the corner of the board' },
    { q: 'Which button restarts the program?', part: 'reset', hint: 'The only button — in the corner next to the USB connector' },
    { q: 'Where is the LED you can blink without a single wire?', part: 'led_l', hint: 'It is labelled "L" and wired to pin 13' },
    { q: 'Which pins would you use for a potentiometer or a light sensor?', part: 'hdr_analog', hint: 'The header labelled A0–A5' },
  ],
  facts: [
    '"Uno" is Italian for "one": the board was named to mark the release of the Arduino 1.0 software.',
    'Arduino was created in the Italian town of Ivrea and named after the bar where its founders used to meet. The bar, in turn, is named after Arduin of Ivrea, a king who ruled about a thousand years ago.',
    'The board\'s design files are open to everyone — which is why there are so many compatible boards and clones.',
  ],

  build(opts = {}) {
    const b = new Board({
      w: 68.58, h: 53.34, t: 1.6, theme: 'teal', finish: 'tin', quality: opts.quality ?? 1,
      outline: [[0, 0], [66.04, 0], [66.04, 2.54], [68.58, 5.08], [68.58, 37.846], [66.04, 40.386], [66.04, 51.816], [64.516, 53.34], [0, 53.34]],
      holes: [{ x: 13.97, y: 2.54, d: 3.2 }, { x: 66.04, y: 7.62, d: 3.2 }, { x: 66.04, y: 35.56, d: 3.2 }, { x: 15.24, y: 50.8, d: 3.2 }],
    });
    const BOT = { side: 'bottom' };
    const T = (pts, w = 0.25) => b.trace(pts, { w });
    const TB = (pts, w = 0.25) => b.trace(pts, { w, side: 'bottom' });

    // ───────── female headers: 3D, silkscreen labels, pins ─────────
    for (const H of HEADERS) {
      const top = H.y > 20, n = H.pins.length;
      b.tag(header(b, { x: H.x0 + (n - 1) * P / 2, y: H.y, nx: n, type: 'female', pin1: false }), H.id);
      H.pins.forEach(([label, name, fn, kind], i) => {
        const x = H.x0 + i * P;
        b.pin(x, H.y, name, fn, kind);
        if (label) b.text(label, x, top ? H.y - 1.95 : H.y + 1.95, { size: top ? 0.86 : 0.8, rot: 90, align: top ? 'right' : 'left' });
      });
    }
    const bracket = (x1, x2, y, dy) => b.line([[x1, y + dy], [x1, y], [x2, y], [x2, y + dy]], { w: 0.18 });
    bracket(27.6, 64.5, 45.35, 0.6);
    b.text('DIGITAL (PWM~)', 50.6, 44.2, { size: 1.15, weight: 700 });
    b.text('MADE IN ITALY', 38.0, 44.15, { size: 0.8 });
    bracket(29.4, 46.8, 8.4, -0.55); b.text('POWER', 38.1, 9.3, { size: 0.9, weight: 700 });
    bracket(49.9, 64.4, 8.4, -0.55); b.text('ANALOG IN', 57.15, 9.3, { size: 0.9, weight: 700 });

    // ───────── main parts ─────────
    b.tag(dip(b, { x: 46.99, y: 15.24, rot: 180, n: 28, text: ['ATMEGA328P-PU', '1626'] }), 'mcu');   // pin 1 = top right
    b.tag(usbB(b, { x: -6.2, y: 38.1 }), 'usb');
    b.tag(barrelJack(b, { x: -1.8, y: 7.62 }), 'jack');
    b.tag(qfn(b, { x: 22, y: 37, size: 5, pins: 8, pitch: 0.5, text: ['MEGA16U2', 'MU'] }), 'usbchip');
    b.tag(crystalHC49(b, { x: 14, y: 27.4, text: '16.000' }), 'crystal');
    b.tag(sot223(b, { x: 9.5, y: 19.6, text: ['NCP1117', 'ST50G'] }), 'reg5v');
    b.tag(capElec(b, { x: 17.3, y: 7.8, rot: 90, d: 6.3, h: 5.4, text: ['47', '25V'] }), 'caps');
    b.tag(capElec(b, { x: 24.0, y: 7.8, rot: 90, d: 6.3, h: 5.4, text: ['47', '25V'] }), 'caps');
    b.tag(button(b, { x: 5.9, y: 49.6, type: 'tact6', cap: 'black' }), 'reset');
    b.tag(header(b, { x: 64.91, y: 27.94, rot: 270, nx: 3, ny: 2, type: 'male' }), 'icsp');            // pin 1 (MISO) = top left
    [[63.64, 30.48, 'ICSP MISO', 'SPI data from the chip (same line as D12)', 'com'], [66.18, 30.48, 'ICSP 5V', '5 V power', 'pwr'],
      [63.64, 27.94, 'ICSP SCK', 'SPI clock (same line as D13)', 'com'], [66.18, 27.94, 'ICSP MOSI', 'SPI data to the chip (same line as D11)', 'com'],
      [63.64, 25.4, 'ICSP RESET', 'reset line of the microcontroller', 'ctl'], [66.18, 25.4, 'ICSP GND', 'ground', 'gnd']].forEach((p) => b.pin(...p));
    header(b, { x: 19.05, y: 46.355, nx: 3, ny: 2, type: 'male' });                                    // ICSP2 (ATmega16U2)
    resonator(b, { x: 38.6, y: 22.8 });
    b.tag(led(b, { x: 29.9, y: 42.6, size: '0805', color: '#ffb400' }), 'led_l');
    b.tag(led(b, { x: 29.9, y: 38.5, size: '0805', color: '#ffb400' }), 'led_txrx');
    b.tag(led(b, { x: 29.9, y: 36.0, size: '0805', color: '#ffb400' }), 'led_txrx');
    b.tag(led(b, { x: 58.5, y: 36.5, size: '0805', color: '#19e05a', on: true }), 'led_on');

    passives(b, [
      ['polyfuse', 13.0, 45.6, 90, { size: '1812', text: '501' }],                 // F1
      ['resArray', 15.3, 38.1, 90, { text: '220' }],                               // RN3 — USB series resistors
      ['cap', 11.9, 35.3, 90, { color: 'grey' }], ['cap', 11.9, 40.85, 90, { color: 'grey' }],   // Z1, Z2 varistors
      ['ferrite', 12.6, 33.0, 0, { size: '0805' }],                                // L1
      ['cap', 15.0, 32.8, 90], ['cap', 21.8, 30.5, 0], ['cap', 17.6, 34.2, 0],     // crystal load caps, decoupling
      ['resArray', 26.5, 37.6, 90, { text: '102' }],                               // RN2 — LED resistors
      ['resArray', 28.2, 32.6, 0, { text: '102' }],                                // RN4 — TX/RX series resistors
      ['res', 27.0, 42.6, 0, { text: '102' }],
      ['resArray', 26.2, 21.6, 0, { text: '103' }],                                // RN1
      ['diode', 18.6, 13.6, 180, { pkg: 'sma', text: 'M7' }],                      // D1
      ['sot23', 16.0, 19.6, 0, { n: 3, text: '340' }],                             // T1 FDN340P
      ['sot23', 21.0, 20.6, 0, { n: 5 }],                                          // U2 LP2985-33
      ['soic', 24.9, 26.9, 0, { n: 8, pitch: 0.65, bodyW: 3.0, bodyL: 3.0, span: 4.9, h: 1.1, text: ['358'] }],   // U5 LMV358
      ['cap', 13.6, 19.3, 90], ['cap', 4.3, 19.8, 90, { size: '0805' }], ['cap', 20.9, 24.6, 0, { size: '0805' }],
      ['cap', 47.0, 22.3, 0], ['cap', 50.6, 22.3, 0], ['cap', 24.9, 40.9, 0], ['cap', 5.6, 14.4, 0],
      ['res', 34.6, 22.8, 90, { text: '105' }],
      ['res', 61.4, 36.5, 0, { text: '102' }],
    ]);

    // ───────── bottom side: buses from the microcontroller to the headers ─────────
    const k45 = 0.6;
    // D9…D13 wrap around the left end of the chip
    [[dipX(0), 39.116], [dipX(1), 36.576], [dipX(2), 34.036], [dipX(3), 31.496], [dipX(4), 28.956]].forEach(([px, hx], k) => {
      const yk = 9.95 - 0.65 * k, xk = 28.6 - 0.65 * k, turn = 36.5 + 1.89 * k;
      TB([[px, DIP_YB], [px, yk + k45], [px - k45, yk], [xk + k45, yk], [xk, yk + k45], [xk, turn], [hx, turn + hx - xk], [hx, TOP_Y]]);
    });
    TB([[dipX(0), DIP_YT], [dipX(0), 35.84], [41.656, 47.016], [41.656, TOP_Y]]);                                     // D8
    TB([[45.72, DIP_YB], [45.72, 6.7 + k45], [45.72 - k45, 6.7], [25.35 + k45, 6.7], [25.35, 6.7 + k45], [25.35, 46.9], [23.876, 48.374], [23.876, TOP_Y]]);   // AREF
    // SDA (A4), SCL (A5) — thread between the ICSP2 pins
    TB([[60.96, DIP_YB], [60.96, 6.05 + k45], [60.96 - k45, 6.05], [24.7 + k45, 6.05], [24.7, 6.05 + k45], [24.7, 39.4], [20.32, 43.78], [20.32, 48.8], [21.336, 49.816], [21.336, TOP_Y]]);
    TB([[63.5, DIP_YB], [63.5, 5.4 + k45], [63.5 - k45, 5.4], [24.05 + k45, 5.4], [24.05, 5.4 + k45], [24.05, 37.5], [17.78, 43.77], [17.78, 48.8], [18.796, 49.816], [18.796, TOP_Y]]);
    for (let i = 0; i < 5; i++) { const px = 60.96 - i * P; TB([[px, DIP_YT], [px, 33], [px + P, 33 + P], [px + P, TOP_Y]]); }       // D0…D4
    for (let i = 0; i < 3; i++) { const px = 38.1 - i * P, t = 24.5 - 1.27 * i; TB([[px, DIP_YT], [px, t], [px + 12.7, t + 12.7], [px + 12.7, TOP_Y]]); }   // D5…D7
    TB([[45.72, BOT_Y], [45.72, 3.7], [45.17, 4.25], [23.1, 4.25], [22.5, 4.85], [22.5, 13.4]], 0.7);               // Vin
    TB([[30.48, BOT_Y], [30.48, 1.45], [31.08, 0.85], [37.5, 0.85], [38.1, 1.45], [38.1, BOT_Y]], 0.35);            // IOREF = 5V
    TB([[34.29, 14.0], [62.2, 14.0], [63.5, 15.3], [63.5, 24.4], [63.64, 25.4]]);                                   // RESET → pin 1, ICSP
    TB([[36.83, 16.3], [29.7, 16.3]], 0.4);                                                                         // 3.3V
    TB([[17.6, 16.9], [17.9, 17.2], [17.9, 41.0], [13.0, 45.9], [13.0, 49.1]], 0.5);                                // USB 5 V: F1 → T1

    // ───────── top side: analog inputs and power header ─────────
    for (let i = 0; i < 6; i++) { const x = 50.8 + i * P; T([[x, DIP_YB], [x, 10.2], [x - 1.27, 8.93], [x - 1.27, 5.0], [x, 3.73], [x, BOT_Y]], 0.28); }
    T([[38.1, BOT_Y], [38.1, 3.73], [39.37, 5.0], [39.37, 7.62], [43.18, DIP_YB]], 0.5);          // 5V → AVCC
    T([[43.18, DIP_YB], [43.18, 13.97], [48.26, DIP_YT]], 0.5);                                   // AVCC → VCC (under the chip)
    T([[35.56, BOT_Y], [35.56, 3.73], [36.83, 5.0], [36.83, 16.3]], 0.4); b.via(36.83, 16.3, { d: 0.8 });
    T([[33.02, BOT_Y], [33.02, 3.73], [34.29, 5.0], [34.29, 14.0]]); b.via(34.29, 14.0);
    b.via(29.7, 16.3, { d: 0.8 });
    T([[29.7, 16.3], [24.6, 16.3], [22.9, 18.0], [22.9, 22.6], [22.3, 23.2], [20.65, 23.2], [20.05, 22.6], [20.05, 21.8]], 0.4);   // 3.3V ← U2

    // ───────── top side: power section ─────────
    T([[11.8, 7.62], [11.8, 12.6], [12.8, 13.6], [16.9, 13.6]], 0.8);                             // jack → D1
    T([[20.3, 13.6], [22.5, 13.4]], 0.8); b.via(22.5, 13.4, { d: 1.0 });                          // D1 → Vin
    T([[22.5, 13.4], [24.0, 11.9], [24.0, 10.5]], 0.6);                                           // Vin → PC2
    T([[20.3, 14.2], [20.3, 15.6], [12.8, 15.6], [11.8, 16.4]], 0.6);                             // Vin → regulator IN
    T([[9.5, 22.65], [17.2, 22.65], [18.6, 21.25], [18.6, 19.4], [20.05, 19.4]], 0.6);            // regulator OUT → 5V rail → U2
    T([[16.0, 20.6], [16.0, 22.65]], 0.4);
    T([[15.05, 18.6], [15.05, 17.5], [14.6, 17.05]]); b.via(14.6, 17.0);
    T([[16.95, 18.6], [16.95, 17.6], [17.6, 16.95]]); b.via(17.6, 16.9);
    T([[17.3, 11.7], [15.6, 11.7]], 0.5); b.via(15.2, 11.7, { d: 0.8 });

    // ───────── top side: USB bridge ─────────
    T([[8.1, 36.85], [14.45, 36.9]]); T([[11.9, 36.03], [11.9, 36.85]]);                           // D−, Z1
    T([[8.1, 39.35], [14.45, 39.3]]); T([[11.9, 40.12], [11.9, 39.35]]);                           // D+, Z2
    T([[16.15, 36.9], [18.0, 36.9], [18.15, 36.75], [19.6, 36.75]]);
    T([[16.15, 39.3], [17.2, 39.3], [18.75, 37.75], [19.6, 37.75]]);
    T([[6.1, 39.35], [6.1, 41.0], [7.6, 42.5], [11.5, 42.5], [12.5, 43.5], [13.0, 43.6]], 0.6);   // VBUS → F1
    b.via(13.0, 49.1, { d: 0.8 }); T([[13.0, 47.6], [13.0, 49.1]], 0.6);
    T([[16.44, 27.4], [18.9, 27.4], [20.75, 29.25], [20.75, 34.6]], 0.22);                        // crystal
    T([[11.56, 27.4], [11.56, 30.9], [12.4, 31.74], [18.6, 31.74], [20.25, 33.39], [20.25, 34.6]], 0.22);
    T([[22.75, 34.6], [22.75, 33.2]], 0.2); b.via(22.75, 33.2);
    T([[21.75, 34.6], [21.75, 32.4]], 0.2); b.via(21.75, 32.4);
    T([[21.25, 39.4], [21.25, 41.0], [21.59, 41.34], [21.59, 45.085]], 0.22);                     // → ICSP2
    T([[20.75, 39.4], [20.75, 41.2], [19.05, 42.9], [19.05, 45.085]], 0.22);
    T([[20.25, 39.4], [20.25, 40.6], [16.51, 44.34], [16.51, 45.085]], 0.22);
    // TX / RX LEDs through RN2
    T([[24.4, 36.25], [25.2, 36.25], [25.35, 36.4], [25.65, 36.4]], 0.2);
    T([[24.4, 37.2], [25.65, 37.2]], 0.2);
    T([[27.35, 36.4], [27.9, 36.4], [28.3, 36.0], [28.98, 36.0]], 0.2);
    T([[27.35, 37.2], [27.8, 37.2], [28.25, 37.65], [28.25, 38.15], [28.6, 38.5], [28.98, 38.5]], 0.2);
    T([[30.82, 38.5], [30.82, 36.0]], 0.3);
    // LED "L"
    T([[27.73, 42.6], [28.98, 42.6]]); T([[26.27, 42.6], [23.7, 42.6], [23.3, 43.0]]); b.via(23.3, 43.0);
    // UART: 16U2 → RN4 → D0 / D1
    T([[24.4, 35.25], [25.6, 35.25], [27.0, 33.85], [27.0, 33.45]], 0.2);
    T([[24.4, 35.75], [25.9, 35.75], [27.8, 33.85], [27.8, 33.45]], 0.2);
    T([[27.0, 31.75], [27.0, 27.7], [28.5, 26.2], [57.84, 26.2], [60.96, 23.08], [60.96, DIP_YT]], 0.22);
    T([[27.8, 31.75], [27.8, 27.6], [29.9, 25.5], [56.0, 25.5], [58.42, 23.08], [58.42, DIP_YT]], 0.22);

    // ───────── top side: around the microcontroller ─────────
    T([[40.64, DIP_YT], [40.64, 20.9], [39.8, 21.74], [39.8, 22.3]], 0.22);                       // resonator
    T([[43.18, DIP_YT], [43.18, 23.7], [42.4, 24.48], [38.2, 24.48], [37.4, 23.7], [37.4, 23.3]], 0.22);
    T([[63.64, 30.48], [59.69, 30.48]]); b.via(59.69, 30.48);                                     // ICSP: MISO
    T([[63.64, 27.94], [59.69, 27.94]]); b.via(59.69, 27.94);                                     //       SCK
    T([[66.18, 27.94], [64.91, 29.21], [57.15, 29.21]]); b.via(57.15, 29.21);                     //       MOSI
    T([[66.18, 30.48], [64.91, 31.75], [64.91, 32.3], [63.6, 33.6], [63.6, 35.6], [62.9, 36.3], [62.13, 36.5]], 0.3); b.via(64.91, 32.3, { d: 0.8 });
    T([[59.42, 36.5], [60.67, 36.5]]);
    b.pad(54.3, 22.5, 0.9, 1.3); b.pad(55.5, 22.5, 0.9, 1.3); T([[54.3, 22.5], [55.5, 22.5]]);    // RESET-EN solder jumper

    // ───────── silkscreen ─────────
    b.text('ARDUINO', 44.6, 39.6, { size: 2.5, weight: 700 });
    b.text('UNO', 44.6, 32.6, { size: 6.2, weight: 800 });
    const s = (str, x, y, o = {}) => b.text(str, x, y, { size: 0.75, ...o });
    b.text('L', 32.6, 42.6, { size: 0.95, weight: 700 });
    b.text('TX', 32.9, 38.5, { size: 0.95, weight: 700 });
    b.text('RX', 32.9, 36.0, { size: 0.95, weight: 700 });
    b.text('ON', 58.5, 38.3, { size: 0.95, weight: 700 });
    b.text('RESET', 7.9, 45.7, { size: 0.9, weight: 700 });
    b.text('ICSP', 64.9, 22.9, { size: 0.9, weight: 700 });
    b.text('ICSP2', 11.75, 50.75, { size: 0.8, weight: 700, rot: 90 });
    b.text('RESET-EN', 54.9, 21.25, { size: 0.62 });
    b.circle(62.3, 31.9, 0.25, { fill: true });                                                    // ICSP pin 1 mark
    s('Y1', 21.6, 27.6); s('D1', 22.7, 15.1); s('T1', 14.2, 20.9); s('U1', 5.2, 23.0); s('U2', 21.0, 18.2);
    s('U3', 18.0, 40.4); s('U5', 24.9, 30.4); s('RN1', 26.2, 19.6); s('RN3', 15.3, 35.6);
    s('RN4', 30.9, 32.6); s('ZU4', 31.4, 21.4); s('C5', 47.0, 23.5); s('C6', 50.6, 23.5); s('R2', 33.2, 22.8, { rot: 90 });
    s('+', 19.35, 11.85, { size: 1.0 }); s('+', 27.6, 11.8, { size: 1.0 });

    // ───────── bottom side: silkscreen ─────────
    b.text('ARDUINO UNO R3', 9.0, 23.6, { size: 1.4, weight: 700, rot: 180, ...BOT });
    b.text('MADE IN ITALY', 9.0, 21.2, { size: 1.0, rot: 180, ...BOT });
    b.text('ATmega328P · 16 MHz · 5 V', 9.0, 19.4, { size: 0.8, rot: 180, ...BOT });
    b.text('SCL', 18.796, 52.6, { size: 0.7, rot: 180, ...BOT });
    b.text('SDA', 21.336, 52.6, { size: 0.7, rot: 180, ...BOT });

    return b.finish();
  },
};
