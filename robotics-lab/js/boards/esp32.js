// ESP32 DevKit V1 (DOIT, 30 pins) with an ESP-WROOM-32 module.
// Board 51.5 × 28.3 mm, module antenna at the left edge, Micro-USB centred on the right edge.
import { Board } from '../core/board.js';
import { Builder, colorMat, DEG } from '../core/builder.js';
import { header, qfn, sot223, sot23, button, led, tantalum, diode, passives } from '../core/parts-ic.js';
import { rfModule, usbMicro } from '../core/parts-conn.js';

// ───────── board geometry ─────────
const W = 51.5, H = 28.3;
const HX = (i) => 7.4 + 2.54 * i;          // 15 pins per row
const YB = 1.45, YT = 26.85;               // bottom / top header rows (25.4 mm apart)
const MX0 = 0.2, MCY = H / 2;              // module 25.5 × 18 mm: left (antenna) edge and centre line
const MCX = MX0 + 12.75;                   // module centre
const MX1 = MX0 + 25.5;                    // module end facing the USB connector
const PX = (k) => MX0 + 7.49 + 1.27 * k;   // 14 castellated pads along each long side (k counted from the antenna)
const PY = (j) => MCY + (j - 4.5) * 1.27;  // 10 pads on the end (j counted from the bottom)

// Pin labels and functions, from the antenna towards the USB connector
const BOTTOM = [
  ['EN', 'chip enable / reset: pull to GND to restart the ESP32 (same as the EN button)', 'ctl'],
  ['VP', 'GPIO36 · input only · ADC1_CH0', 'ana'],
  ['VN', 'GPIO39 · input only · ADC1_CH3', 'ana'],
  ['D34', 'GPIO34 · input only (no pull-ups) · ADC1_CH6', 'ana'],
  ['D35', 'GPIO35 · input only (no pull-ups) · ADC1_CH7', 'ana'],
  ['D32', 'GPIO32 · digital I/O, PWM · ADC1_CH4 · touch T9', 'ana'],
  ['D33', 'GPIO33 · digital I/O, PWM · ADC1_CH5 · touch T8', 'ana'],
  ['D25', 'GPIO25 · digital I/O, PWM · DAC1 · ADC2_CH8', 'ana'],
  ['D26', 'GPIO26 · digital I/O, PWM · DAC2 · ADC2_CH9', 'ana'],
  ['D27', 'GPIO27 · digital I/O, PWM · ADC2_CH7 · touch T7', 'dig'],
  ['D14', 'GPIO14 · digital I/O, PWM · HSPI SCK · ADC2_CH6 · touch T6', 'dig'],
  ['D12', 'GPIO12 · strapping pin: must be LOW at boot · HSPI MISO · touch T5', 'dig'],
  ['D13', 'GPIO13 · digital I/O, PWM · HSPI MOSI · ADC2_CH4 · touch T4', 'dig'],
  ['GND', 'ground — common negative of the power supply', 'gnd'],
  ['VIN', 'power input, 5 V recommended · USB 5 V also appears here through a diode', 'pwr'],
];
const TOP = [
  ['D23', 'GPIO23 · digital I/O, PWM · VSPI MOSI', 'com'],
  ['D22', 'GPIO22 · digital I/O, PWM · I²C SCL (default)', 'com'],
  ['TX0', 'GPIO1 · UART0 TX — used by the USB link to the computer', 'com'],
  ['RX0', 'GPIO3 · UART0 RX — used by the USB link to the computer', 'com'],
  ['D21', 'GPIO21 · digital I/O, PWM · I²C SDA (default)', 'com'],
  ['D19', 'GPIO19 · digital I/O, PWM · VSPI MISO', 'com'],
  ['D18', 'GPIO18 · digital I/O, PWM · VSPI SCK', 'com'],
  ['D5', 'GPIO5 · digital I/O, PWM · VSPI SS · strapping pin', 'dig'],
  ['TX2', 'GPIO17 · digital I/O, PWM · UART2 TX', 'com'],
  ['RX2', 'GPIO16 · digital I/O, PWM · UART2 RX', 'com'],
  ['D4', 'GPIO4 · digital I/O, PWM · ADC2_CH0 · touch T0', 'dig'],
  ['D2', 'GPIO2 · on-board blue LED · strapping pin · ADC2_CH2 · touch T2', 'dig'],
  ['D15', 'GPIO15 · digital I/O, PWM · strapping pin · HSPI SS · ADC2_CH3 · touch T3', 'dig'],
  ['GND', 'ground — common negative of the power supply', 'gnd'],
  ['3V3', '3.3 V power output from the regulator (for sensors, not for motors)', 'pwr'],
];

// matte black solder mask of the DOIT board (a touch darker than the stock 'black' theme)
const BLACK = { pour: '#1b1d20', base: '#0b0c0e', trace: '#33373d', silk: '#eeeeea', edge: '#6b675a' };
// the viewer lights the underside only dimly, so the bottom mask is painted a little lighter to keep its traces readable
const BLACK_BOTTOM = { ...BLACK, pour: '#33373c', base: '#131517', trace: '#565c65' };

/** Polyline with every inner corner cut at 45°. */
function cham(pts, c = 0.45) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(x - px, y - py), l2 = Math.hypot(nx - x, ny - y);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const k = Math.min(c, l1 / 2, l2 / 2);
    out.push([x - (x - px) / l1 * k, y - (y - py) / l1 * k], [x + (nx - x) / l2 * k, y + (ny - y) / l2 * k]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export default {
  id: 'esp32',
  name: 'ESP32 DevKit V1', maker: 'DOIT · Espressif chip', year: 2016,
  tagline: 'Wi-Fi and Bluetooth for pocket money',
  level: 'Intermediate',
  accent: '#2b2f36',
  summary: 'A development board built around the ESP-WROOM-32 module: a dual-core processor, Wi-Fi and Bluetooth on a board the size of a finger. '
    + 'You can program it from the Arduino IDE or in MicroPython, and it costs about as much as a couple of sensors. Perfect when your robot needs to talk to a phone or the internet.',
  specs: [
    ['Module', 'ESP-WROOM-32 (ESP32-D0WDQ6 chip)'],
    ['Processor', '2 × Xtensa LX6 cores, up to 240 MHz'],
    ['RAM', '520 KB'],
    ['Flash memory', '4 MB'],
    ['Wi-Fi', '802.11 b/g/n, 2.4 GHz'],
    ['Bluetooth', '4.2 Classic + BLE'],
    ['Logic level', '3.3 V (inputs are not 5 V tolerant)'],
    ['Pins', '30, of which 25 are GPIO'],
    ['ADC', '12-bit, 15 inputs'],
    ['DAC', '2 × 8-bit (GPIO25, GPIO26)'],
    ['USB', 'Micro-USB, CP2102 bridge'],
    ['Size', '51.5 × 28.3 mm'],
  ],
  compare: { mcu: 'ESP32 (2 × LX6 cores)', clock: '240 MHz', flash: '4 MB', ram: '520 KB', gpio: '25', analog: '15 (12-bit) + 2 DAC', wireless: 'Wi-Fi + Bluetooth', logic: '3.3 V', price: '≈ $5' },
  highlights: [
    'Wi-Fi and Bluetooth are already on board — no extra modules needed',
    'Two 240 MHz cores and 520 KB of RAM: tens of times more powerful than an Arduino Uno',
    'PWM on almost any pin, 2 DACs, touch inputs, several UART, I²C and SPI buses',
    'Works with the Arduino IDE, MicroPython and ESP-IDF',
  ],
  cautions: [
    '3.3 V logic: feed a 5 V signal (for example the ECHO pin of an HC-SR04) only through a voltage divider or a level shifter — otherwise the pin will be damaged.',
    'GPIO34, 35, 36 (VP) and 39 (VN) are inputs only and have no internal pull-up or pull-down resistors.',
    'ADC2 inputs (D2, D4, D12–D15, D25–D27) cannot be read with analogRead while Wi-Fi is on. Use D32–D35, VP and VN for sensors.',
    'Strapping pins D2, D5, D12 and D15 affect start-up: if a sensor pulls D12 high at power-on, the board will not boot.',
    'Power motors and servos from a separate supply: a pin can only give about 20–40 mA, and the 3.3 V regulator is busy feeding the Wi-Fi radio.',
  ],
  uses: [
    'A robot driven from a smartphone over Bluetooth or Wi-Fi',
    'A rover with its own control web page: the board acts as an access point',
    'A weather station that sends data to the internet',
    'Smart home: relays, sensors and notifications on your phone',
    'A wireless remote for a robot using the ESP-NOW protocol',
  ],
  parts: {
    module: { name: 'ESP-WROOM-32 module', text: 'Under the metal shield sit the ESP32 chip (2 cores, Wi-Fi, Bluetooth), 4 MB of flash memory and a 40 MHz crystal. The shield protects the radio from interference. This is the brain and the radio station of the board in one.' },
    antenna: { name: 'PCB antenna', text: 'The zig-zag copper trace at the edge of the module is the 2.4 GHz antenna for Wi-Fi and Bluetooth. Keep metal and wires away from it, or the signal gets noticeably weaker.' },
    usb: { name: 'Micro-USB connector', text: 'Powers the board with 5 V and connects it to the computer for uploading programs and reading the serial monitor. You need a cable with data lines — a charge-only cable will not show the board.' },
    usbchip: { name: 'CP2102 USB-to-UART bridge', text: 'The ESP32 itself does not speak USB, so this chip converts USB into a serial port (pins TX0/RX0). If the computer does not see the board, you usually need to install the CP210x driver.' },
    reg3v3: { name: 'AMS1117-3.3 voltage regulator', text: 'Turns 5 V from USB or the VIN pin into the 3.3 V the ESP32 runs on. The extra voltage is burned off as heat, so it gets noticeably warm when powered from 9–12 V.' },
    btn_en: { name: 'EN button (reset)', text: 'Restarts the ESP32 — your program starts again from the beginning. The program stored in flash is not erased.' },
    btn_boot: { name: 'BOOT button', text: 'Connects GPIO0 to ground. Hold it during reset and the chip enters firmware download mode. Handy when the Arduino IDE hangs on "Connecting…" — hold BOOT for a couple of seconds.' },
    autoreset: { name: 'Auto-program transistors', text: 'Two tiny transistors driven by the DTR and RTS signals of the CP2102 "press" EN and BOOT for you in the right order. Thanks to them, uploads usually work without touching the buttons.' },
    led_pwr: { name: 'Red power LED', text: 'Lit whenever the board has power. If it is dark, check the cable and the power source.' },
    led_d2: { name: 'Blue LED on GPIO2', text: 'A built-in LED you can control from your program: digitalWrite(2, HIGH) turns it on. A great first experiment — nothing to wire up.' },
    tant: { name: 'Tantalum capacitor', text: 'An energy reserve next to the regulator. Wi-Fi draws current in short bursts of several hundred milliamps, and the capacitor smooths them out so the board does not reset.' },
    diode: { name: 'Schottky protection diode', text: 'Lets 5 V flow from USB to the board but blocks current going back into the computer when the board is powered through VIN. A small part that protects your USB port.' },
    hdr_top: { name: 'Pin header: D23 … 3V3', text: '15 pins: the I²C bus (D21, D22), SPI (D18, D19, D23, D5), two UARTs, the 3.3 V output and ground. The pins point down so the board plugs into a breadboard.' },
    hdr_bottom: { name: 'Pin header: EN … VIN', text: '15 pins: analog inputs (VP, VN, D32–D35), both DACs (D25, D26), touch pins, ground and the VIN power input.' },
  },
  partOrder: ['module', 'antenna', 'usb', 'usbchip', 'reg3v3', 'btn_en', 'btn_boot', 'autoreset', 'led_pwr', 'led_d2', 'tant', 'diode', 'hdr_top', 'hdr_bottom'],
  pinNotes: [
    { title: 'Power', text: 'VIN is the 5 V input (USB 5 V also comes out here). 3V3 is the regulator output for sensors. GND is ground — there are two. Do not feed power into 3V3 and USB at the same time.' },
    { title: 'Input-only pins', text: 'VP (GPIO36), VN (GPIO39), D34 and D35 can only read a signal and have no pull-ups. They are also the best analog inputs: they keep working while Wi-Fi is on.' },
    { title: 'Analog pins', text: '12-bit ADC: analogRead returns 0…4095. ADC1 (VP, VN, D32–D35) always works, ADC2 only without Wi-Fi. D25 and D26 are true analog outputs (DAC).' },
    { title: 'Default buses', text: 'I²C: SDA = D21, SCL = D22. SPI (VSPI): MOSI = D23, MISO = D19, SCK = D18, SS = D5. UART2: RX2 = GPIO16, TX2 = GPIO17. TX0/RX0 are used by USB.' },
    { title: 'Strapping pins', text: 'D2, D5, D12, D15 (and GPIO0 under the BOOT button) are sampled at power-on to choose the boot mode. You can use them, but external circuits must not pull them at start-up.' },
  ],
  code: {
    title: 'First sketch: blink the blue LED',
    lang: 'cpp',
    src: `// The built-in blue LED of the DevKit V1 is connected to GPIO2
const int LED = 2;

void setup() {
  Serial.begin(115200);        // serial monitor speed: 115200 baud
  pinMode(LED, OUTPUT);        // the pin works as an output
}

void loop() {
  digitalWrite(LED, HIGH);     // LED on (3.3 V on the pin)
  Serial.println("Hello from ESP32!");
  delay(500);                  // wait half a second
  digitalWrite(LED, LOW);      // LED off
  delay(500);
}`,
  },
  quiz: [
    { q: 'Find the module with the ESP32 chip — the brain of the board', part: 'module', hint: 'The big metal shield on the left' },
    { q: 'Where is the Wi-Fi and Bluetooth antenna?', part: 'antenna', hint: 'A zig-zag trace at the very edge of the board' },
    { q: 'Which chip converts USB into a serial port?', part: 'usbchip', hint: 'A small square chip without legs near the USB connector — CP2102' },
    { q: 'Find the regulator that makes 3.3 V out of 5 V', part: 'reg3v3', hint: 'A package with three leads and a wide tab' },
    { q: 'Which button do you hold when an upload will not start?', part: 'btn_boot', hint: 'Labelled BOOT, next to the USB connector' },
    { q: 'Where is the LED you can blink from your program?', part: 'led_d2', hint: 'The blue one, connected to GPIO2' },
  ],
  facts: [
    'The ESP32 radio handles both Wi-Fi and Bluetooth through the same antenna — the chip switches between them very quickly.',
    'In deep sleep the ESP32 chip itself draws only about 10 µA and wakes up on a timer. This board draws more, because the power LED and the regulator stay on.',
    'The chip has a built-in Hall sensor: it can feel a magnet held close to the metal shield.',
  ],

  build(opts = {}) {
    const hole = 3.0, ho = 2.3;
    const b = new Board({
      w: W, h: H, t: 1.6, r: 1.5, theme: BLACK, finish: 'gold', quality: opts.quality ?? 1,
      holes: [{ x: ho, y: ho, d: hole }, { x: ho, y: H - ho, d: hole }, { x: W - ho, y: ho, d: hole }, { x: W - ho, y: H - ho, d: hole }],
    });
    if (typeof b._paint === 'function') {
      const paint = b._paint.bind(b);
      b._paint = (side) => { b.theme = side === 'bottom' ? BLACK_BOTTOM : BLACK; try { return paint(side); } finally { b.theme = BLACK; } };
    }
    const T = (pts, w = 0.22, side = 'top', c = 0.45) => b.trace(cham(pts, c), { w, side });
    const BT = (pts, w = 0.22) => T(pts, w, 'bottom');

    // ── no copper under the antenna on the bottom side (the module paints the top keep-out itself) ──
    b.keepout(3.25, MCY, 6.5, 19.2, { side: 'bottom' });

    // ── headers: pins, labels ──
    for (const [list, y, s] of [[BOTTOM, YB, +1], [TOP, YT, -1]]) {
      list.forEach(([name, fn, kind], i) => {
        const x = HX(i);
        b.pin(x, y, name, fn, kind);
        // top: label between the header and the module, text across the row
        b.text(name, x, y + s * 1.0, { size: 0.64, rot: 90, align: s > 0 ? 'left' : 'right', weight: 700 });
        // bottom: label further from the edge, beyond the header plastic
        b.text(name, x, y + s * 1.75, { size: 0.82, rot: -90, align: s > 0 ? 'left' : 'right', weight: 700, side: 'bottom' });
      });
    }
    b.tag(header(b, { x: HX(7), y: YB, nx: 15, type: 'maleDown', pin1: false }), 'hdr_bottom');
    b.tag(header(b, { x: HX(7), y: YT, nx: 15, type: 'maleDown', pin1: false }), 'hdr_top');

    // ── module → headers fan-out on the bottom layer ──
    const fan = (y0, s, hx, sx, d, dv) => {
      const yl = (s > 0 ? 0 : H) + s * d, yv = (s > 0 ? 0 : H) + s * dv;
      BT([[hx, y0], [hx, yl], [sx, yl], [sx, yv]]);
      b.via(sx, yv);
    };
    for (let i = 0; i < 12; i++) {           // bottom row: EN … D12 ← module pads k = 2…13
      const d = i === 0 ? 3.5 : i < 3 ? 3.0 : 3.0 + 0.5 * (i - 3);
      fan(YB, +1, HX(i), PX(i + 2), d, Math.max(6.5, d + 1.0) + (i % 2) * 0.75);
    }
    for (let i = 0; i < 11; i++) {           // top row: D23 … D4 ← k = 1…5, 7…12 (k = 6 is NC)
      const d = i < 3 ? 3.0 : 3.0 + 0.5 * (i - 2);
      fan(YT, -1, HX(i), PX(i < 5 ? i + 1 : i + 2), d, Math.max(6.5, d + 1.0) + (i % 2) * 0.75);
    }
    // module end: IO13 → D13, IO2 → D2, IO15 → D15 (short stub on top, the rest on the bottom layer)
    const vD13 = [MX1 + 1.6, PY(1)], vD2 = [MX1 + 1.6, PY(9)], vD15 = [MX1 + 2.7, PY(8)];
    for (const v of [vD13, vD2, vD15]) b.trace([[MX1 + 0.6, v[1]], v], { w: 0.22 });
    fan(YB, +1, HX(12), vD13[0], 7.6, vD13[1]);
    fan(YT, -1, HX(11), vD2[0], 7.6, H - vD2[1]);
    fan(YT, -1, HX(12), vD15[0], 8.2, H - vD15[1]);

    // ── ESP-WROOM-32 module (antenna to the left) + separately pickable antenna overlay ──
    b.tag(rfModule(b, { x: MCX, y: MCY, rot: 0, type: 'esp32-wroom' }), 'module');
    {
      const A = new Builder(), top = 0.86, len = 25.5, wid = 18, ant = 6.3;
      const maskM = colorMat('#121315', 0.5), cuM = colorMat('#30343a', 0.36);
      A.box(ant - 0.06, wid - 0.06, 0.015, maskM, -len / 2 + ant / 2, 0, top + 0.052);
      const xa = -len / 2 + 0.75, xb = -len / 2 + ant - 2.1, xs = -len / 2 + ant + 0.2, y0 = -wid / 2 + 1.1, steps = 8, dy = (wid - 2.2) / steps;
      const pts = [[xs, y0], [xa, y0]];
      for (let i = 1; i <= steps; i++) { const yy = y0 + i * dy, near = i % 2 === 1; pts.push([near ? xa : xb, yy], [near ? xb : xa, yy]); }
      const seg = (p, q) => {
        const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
        A.box(L + 0.5, 0.5, 0.03, cuM, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, top + 0.067, Math.atan2(q[1] - p[1], q[0] - p[0]) / DEG);
      };
      for (let i = 0; i + 1 < pts.length; i++) seg(pts[i], pts[i + 1]);
      seg([xs, y0 + dy], [xb, y0 + dy]);
      b.tag(b.place(A.build('antenna'), MCX, MCY), 'antenna');
    }
    // silkscreen corner marks of the module footprint
    b.line([[MX1 - 0.7, MCY - 9.35], [MX1 + 0.3, MCY - 9.35], [MX1 + 0.3, MCY - 7.2]], { w: 0.15 });
    b.line([[MX1 - 0.7, MCY + 9.35], [MX1 + 0.3, MCY + 9.35], [MX1 + 0.3, MCY + 7.2]], { w: 0.15 });

    // ── Micro-USB (mouth 1.3 mm beyond the right edge) ──
    b.tag(usbMicro(b, { x: W + 1.3, y: MCY, rot: 180 }), 'usb');
    const UX = W + 1.3 - 6.9;                 // outer end of the USB lead pads (x ≈ 45.9)

    // ── buttons ──
    const BX = 47.7, BYE = 22.0, BYB = 6.3;
    b.tag(button(b, { x: BX, y: BYE, type: 'smd' }), 'btn_en');
    b.tag(button(b, { x: BX, y: BYB, type: 'smd' }), 'btn_boot');
    b.text('EN', 45.9, 24.75, { size: 0.9, weight: 700 });
    b.text('BOOT', 46.0, 3.55, { size: 0.9, weight: 700 });

    // ── CP2102 USB-UART bridge ──
    const CX = 35.2, CY = 13.6;
    b.tag(qfn(b, { x: CX, y: CY, size: 5, pins: 7, pitch: 0.5, text: ['SILABS', 'CP2102', 'DCL00X', '1709+'] }), 'usbchip');
    b.text('U2', 33.6, 10.15, { size: 0.55 });
    // USB data pair: chip pins 4/5 (bottom side) → connector leads
    T([[CX, CY - 2.7], [CX, 9.6], [44.1, 9.6], [44.1, MCY], [UX + 0.2, MCY]], 0.2);
    T([[CX + 0.5, CY - 2.7], [CX + 0.5, 10.1], [43.6, 10.1], [43.6, MCY + 0.65], [UX + 0.2, MCY + 0.65]], 0.2);
    // TXD / RXD → vias → bottom layer → module TX0 / RX0
    const vTXD = [31.2, CY - 0.5], vRXD = [30.3, CY + 0.6], vRTS = [31.9, CY + 1.9];
    b.trace([[CX - 2.7, CY - 0.5], vTXD], { w: 0.2 }); b.via(...vTXD);
    T([[CX - 2.7, CY], [CX - 3.1, CY], [CX - 3.7, CY + 0.6], vRXD], 0.2, 'top', 0); b.via(...vRXD);
    T([[CX - 2.7, CY + 0.5], [CX - 2.95, CY + 0.5], [vRTS[0], CY + 0.85], vRTS], 0.2, 'top', 0); b.via(...vRTS);
    BT([[PX(3), H - 6.5], [PX(3), 16.6], [vRXD[0], 16.6], vRXD]);          // ESP TX0 → CP2102 RXD
    BT([[PX(4), H - 7.25], [PX(4), 17.2], [vTXD[0], 17.2], vTXD]);         // ESP RX0 ← CP2102 TXD

    // ── auto-program transistors (DTR / RTS → EN / IO0) ──
    const Q1 = [32.6, 7.3], Q2 = [36.0, 7.3];
    b.tag(sot23(b, { x: Q1[0], y: Q1[1], n: 3, text: 'J3Y' }), 'autoreset');
    b.tag(sot23(b, { x: Q2[0], y: Q2[1], n: 3, text: 'J3Y' }), 'autoreset');
    b.text('Q1', Q1[0], 5.2, { size: 0.55 }); b.text('Q2', Q2[0], 5.2, { size: 0.55 });
    T([[CX - 2.7, CY - 1.5], [CX - 3.2, CY - 1.5], [30.9, 11.0], [30.9, 9.0], [30.5, 8.6], [30.5, 7.9]], 0.2, 'top', 0);   // DTR → R → Q1 base
    T([[30.5, 6.9], [30.5, 6.4], [31.5, 6.4]], 0.2, 'top', 0.3);
    T([[Q1[0], 8.5], [Q1[0], 9.4]], 0.2); b.via(Q1[0], 9.4);                                                              // Q1 collector → EN (bottom)
    T([[Q2[0], 8.5], [Q2[0] + 0.4, 8.9], [39.4, 8.9]], 0.2, 'top', 0); b.via(39.4, 8.9);                                  // Q2 collector → IO0
    T([[37.1, 6.3], [38.3, 6.3]], 0.2); T([[38.4, 7.4], [38.4, 8.05]], 0.2); b.via(38.4, 8.05);                           // Q2 base resistor
    // BOOT button → IO0 node, then along the bottom layer to the module
    T([[BX - 2.9, BYB], [40.4, BYB], [39.4, 7.3], [39.4, 8.9]], 0.25, 'top', 0);
    BT([[39.4, 8.9], [39.4, 10.5], [23.5, 10.5]]); b.via(23.5, 10.5);
    // EN button → via → bottom layer → module EN
    T([[BX - 2.9, BYE + 0.3], [44.3, BYE + 0.8], [44.3, 23.6]], 0.25, 'top', 0); b.via(44.3, 23.6);
    BT([[44.3, 23.6], [38.8, 23.6], [38.8, 11.1], [13.0, 11.1]]); b.via(13.0, 11.1);

    // ── power: USB VBUS → diode → 5 V → AMS1117 → 3V3 ──
    const RX = 39.7, RY = 19.8;
    b.tag(sot223(b, { x: RX, y: RY, rot: 270, text: ['AMS1117', '3.3 1719'] }), 'reg3v3');
    b.tag(diode(b, { x: 44.0, y: 16.9, pkg: 'sod123', text: 'S4' }), 'diode');
    b.tag(tantalum(b, { x: 32.4, y: 20.9, rot: 180, size: 'B', text: ['107', '10V'] }), 'tant');
    b.text('+', 35.15, 22.2, { size: 0.8 }); b.text('C1', 32.4, 23.05, { size: 0.55 });
    T([[UX + 0.4, MCY + 1.3], [45.6, MCY + 1.3], [45.6, 16.7]], 0.4, 'top', 0.3);                 // VBUS → diode anode
    T([[41.95, 17.1], [41.4, 17.4], [RX - 2.2, 17.4]], 0.5, 'top', 0);                           // 5 V → regulator IN (runs under the body)
    T([[42.1, 16.6], [41.4, 15.9]], 0.45); b.via(41.4, 15.9, { d: 0.7 });                        // 5 V → bottom layer → VIN pin
    BT([[41.4, 15.9], [41.4, 3.4], [HX(14), 1.84]], 0.6);
    T([[RX - 3.8, RY], [35.0, RY], [34.4, RY + 0.6]], 0.6, 'top', 0);                            // regulator OUT → tantalum (+)
    T([[RX + 2.35, RY + 1.2], [RX + 2.35, 25.6], [HX(14), 26.51]], 0.5, 'top', 0);               // tab (3.3 V) → 3V3 pin
    T([[RX - 3.5, RY - 0.3], [35.6, 19.1], [35.2, 18.7]], 0.4, 'top', 0); b.via(35.2, 18.7, { d: 0.7 });
    BT([[35.2, 18.7], [35.2, 11.75], [10.9, 11.75], [PX(1), 9.81], [PX(1), 8.0]], 0.45); b.via(PX(1), 8.0, { d: 0.7 });   // 3.3 V → module

    // ── LEDs ──
    b.tag(led(b, { x: 29.4, y: 6.6, rot: 90, size: '0603', color: '#ff2a1f', on: true }), 'led_pwr');
    b.tag(led(b, { x: 29.4, y: 21.6, rot: 90, size: '0603', color: '#2f7bff' }), 'led_d2');
    b.trace([[27.9, 7.33], [29.4, 7.33]], { w: 0.25 });
    T([[27.9, 5.8], [28.3, 5.2], [28.65, 5.2]], 0.25, 'top', 0); b.via(28.65, 5.2);
    b.trace([[27.9, 22.33], [29.4, 22.33]], { w: 0.25 });
    T([vD2, [vD2[0], 20.3], [27.8, 20.8]], 0.22, 'top', 0);

    // ── small parts ──
    passives(b, [
      ['res', 27.9, 6.6, 90, { text: '102' }],                 // red LED resistor
      ['res', 27.9, 21.6, 90, { text: '471' }],                // blue LED resistor
      ['res', 30.5, 7.4, 90, { size: '0402' }],                // Q1 base
      ['res', 38.4, 6.9, 90, { size: '0402' }],                // Q2 base
      ['cap', 28.6, 12.0, 90],                                 // module decoupling
      ['cap', 28.7, 15.6, 90, { size: '0805' }],
      ['res', 29.9, 12.0, 90, { size: '0402' }],
      ['cap', 33.4, 17.6, 0],                                  // CP2102 decoupling
      ['cap', 39.6, 15.4, 0],
      ['cap', 40.0, 11.2, 0],
      ['cap', 42.3, 11.2, 0, { size: '0402' }],
      ['cap', 46.4, 19.6, 0, { size: '0402' }],                // EN RC
      ['res', 46.4, 18.6, 0, { size: '0402' }],
      ['cap', 42.0, 7.9, 0],                                   // VBUS / 5 V decoupling
      ['res', 43.9, 7.9, 90, { size: '0402' }],
      ['cap', 45.3, 11.5, 90, { size: '0402' }],
    ]);
    b.text('ESP32', 40.8, 13.95, { size: 0.95, weight: 700 });
    b.text('DEVKIT V1', 40.8, 12.65, { size: 0.58, weight: 700 });

    // ── ground stitching vias ──
    for (const [x, y] of [[29.2, 9.3], [34.3, 5.0], [39.9, 5.0], [45.3, 9.9], [46.4, 9.0], [34.1, 23.0]]) b.via(x, y);

    // ── bottom side: board name ──
    b.text('ESP32 DEVKIT V1', 22.5, 14.9, { size: 2.0, weight: 700, side: 'bottom', rot: 180 });
    b.text('ESP-WROOM-32 · Wi-Fi + Bluetooth', 22.5, 12.75, { size: 0.8, side: 'bottom', rot: 180 });

    return b.finish();
  },
};
