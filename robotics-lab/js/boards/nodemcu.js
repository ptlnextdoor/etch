// NodeMCU v2 (DevKit 1.0, "Amica") — ESP8266 in an ESP-12E module, CP2102 USB bridge.
// Board 48.3 × 25.8 mm, antenna on the left, Micro-USB on the right. Board coords: x → right, y → up, mm.
import { Board } from '../core/board.js';
import { Builder, M, ledMat, glowSprite } from '../core/builder.js';
import { qfn, sot223, diode, led, button, header, passives } from '../core/parts-ic.js';
import { usbMicro, rfModule } from '../core/parts-conn.js';

const W = 48.3, H = 25.8, P = 2.54, X0 = 6.6, YB = 1.47, YT = 24.33;
const hx = (i) => X0 + P * i;

// ESP-12E module: 24 × 16 mm, antenna at the left board edge
const MX = 0.3, ML = 24, MW = 16, MCX = MX + ML / 2, MCY = H / 2;
const mpx = (k) => MCX - 3.5 + 2 * k;               // 8 castellated pads along each long side, 2 mm pitch
const mey = (k) => MCY + (k - 2.5) * 2;             // 6 pads on the end
const TIP_T = MCY + MW / 2 + 1.1, TIP_B = MCY - MW / 2 - 1.1;   // outer ends of the carrier pads (22.0 / 3.8)

const MODULE_TEXT = [{ t: 'ESP8266MOD', size: 1.25 }, { t: 'AI-THINKER', size: 0.9 }, { t: 'ISM 2.4GHz', size: 0.8 }, { t: 'PA +25dBm', size: 0.8 }, { t: '802.11b/g/n', size: 0.8 }, { t: 'MODEL: ESP-12E', size: 0.55, y: -6.3 }];

// a touch more contrast between copper pour and bare laminate than the stock "black" theme: traces read under the mask
const THEME = { pour: '#25282c', base: '#0d0f11', trace: '#343a41', silk: '#f0f0ea', edge: '#6b675a' };

// [silk label, tooltip name, function, kind]
const TOP_PINS = [
  ['D0', 'D0 · GPIO16', 'digital I/O; deep-sleep wake-up (wire it to RST). No PWM, I²C or interrupts', 'dig'],
  ['D1', 'D1 · GPIO5', 'digital I/O, PWM · SCL (I²C clock)', 'dig'],
  ['D2', 'D2 · GPIO4', 'digital I/O, PWM · SDA (I²C data)', 'dig'],
  ['D3', 'D3 · GPIO0', 'strapping pin: must be HIGH at power-up (the FLASH button pulls it to ground). Pulled up to 3.3 V', 'ctl'],
  ['D4', 'D4 · GPIO2', 'built-in blue LED (lit when LOW) · strapping pin: must be HIGH at power-up', 'dig'],
  ['3V3', '3V3', '3.3 V power output from the regulator', 'pwr'],
  ['GND', 'GND', 'ground', 'gnd'],
  ['D5', 'D5 · GPIO14', 'digital I/O, PWM · SCK (SPI clock)', 'dig'],
  ['D6', 'D6 · GPIO12', 'digital I/O, PWM · MISO (SPI)', 'dig'],
  ['D7', 'D7 · GPIO13', 'digital I/O, PWM · MOSI (SPI)', 'dig'],
  ['D8', 'D8 · GPIO15', 'SPI CS · strapping pin: must be LOW at power-up (pulled down to ground)', 'ctl'],
  ['RX', 'RX · GPIO3', 'UART0 receive — used by USB for uploading and Serial', 'com'],
  ['TX', 'TX · GPIO1', 'UART0 transmit — used by USB for uploading and Serial', 'com'],
  ['GND', 'GND', 'ground', 'gnd'],
  ['3V3', '3V3', '3.3 V power output from the regulator', 'pwr'],
];
const BOT_PINS = [
  ['A0', 'A0 · ADC0', 'the only analog input: 0–3.3 V (through the on-board divider), 10-bit — reads 0…1023', 'ana'],
  ['RSV', 'RSV', 'reserved — do not connect', 'nc'],
  ['RSV', 'RSV', 'reserved — do not connect', 'nc'],
  ['SD3', 'SD3 · GPIO10', 'flash-memory line — best left unused', 'nc'],
  ['SD2', 'SD2 · GPIO9', 'flash-memory line — best left unused', 'nc'],
  ['SD1', 'SD1 · GPIO8', 'used by the on-board flash memory — do not use', 'nc'],
  ['CMD', 'CMD · GPIO11', 'used by the on-board flash memory — do not use', 'nc'],
  ['SD0', 'SD0 · GPIO7', 'used by the on-board flash memory — do not use', 'nc'],
  ['CLK', 'CLK · GPIO6', 'used by the on-board flash memory — do not use', 'nc'],
  ['GND', 'GND', 'ground', 'gnd'],
  ['3V3', '3V3', '3.3 V power output from the regulator', 'pwr'],
  ['EN', 'EN', 'chip enable: pulled up to 3.3 V; pull it to ground and the ESP8266 switches off', 'ctl'],
  ['RST', 'RST', 'reset: short it to GND briefly to restart the program (same as the RST button)', 'ctl'],
  ['GND', 'GND', 'ground', 'gnd'],
  ['Vin', 'Vin', '5 V power input (up to ~10 V) to the regulator; about 4.7 V appears here when powered from USB', 'pwr'],
];

export default {
  id: 'nodemcu',
  name: 'NodeMCU (ESP8266)', maker: 'NodeMCU / Amica', year: 2015,
  tagline: 'Wi-Fi for a few dollars',
  level: 'Intermediate',
  accent: '#2b2f36',
  summary: 'A tiny Wi-Fi board built around the ESP8266 chip: it plugs into a breadboard, is programmed over USB from the Arduino IDE and gets online all by itself. ' +
    'It is the classic starting point for smart-home gadgets, phone-controlled robots and sensors that send their readings to the internet.',
  specs: [
    ['Microcontroller', 'ESP8266EX (ESP-12E module)'],
    ['Core', 'Tensilica L106, 32-bit, single core'],
    ['Clock speed', '80 MHz (up to 160 MHz)'],
    ['Flash memory', '4 MB (separate chip inside the module)'],
    ['RAM', '≈80 KB, about 50 KB free for your program'],
    ['Wireless', 'Wi-Fi 802.11 b/g/n, 2.4 GHz; no Bluetooth'],
    ['Logic level', '3.3 V (inputs are not 5 V tolerant)'],
    ['Digital pins', '11 (D0–D8, RX, TX), PWM on D1–D8'],
    ['Analog inputs', '1 (A0, 0–3.3 V, 10-bit)'],
    ['Interfaces', 'UART, I²C, SPI'],
    ['USB', 'Micro-USB, CP2102 bridge'],
    ['Power', 'USB 5 V or Vin 5–10 V; AMS1117-3.3 regulator'],
    ['Size', '48 × 26 mm'],
  ],
  compare: { mcu: 'ESP8266EX', clock: '80 MHz', flash: '4 MB', ram: '≈80 KB', gpio: '11', analog: '1', wireless: 'Wi-Fi', logic: '3.3 V', price: '≈ $3' },
  highlights: [
    'Wi-Fi right on the board: web server, MQTT, control from a phone — no extra modules needed',
    'Programmed from the Arduino IDE (or in MicroPython) — familiar sketches and libraries just work',
    'One-click upload over USB: the auto-reset circuit puts the chip into bootloader mode for you',
    'Fast 32-bit processor and 4 MB of flash — many times more than an Arduino Uno',
  ],
  cautions: [
    '3.3 V logic: a 5 V signal from an Arduino or a sensor (e.g. the Echo pin of an HC-SR04) can destroy an input — use a voltage divider or a level shifter',
    'There is only one analog input, and A0 must never see more than 3.3 V',
    'D3, D4 and D8 are strapping pins: if a sensor or button holds them at the wrong level at power-up, the board will not start',
    'A pin can supply only about 12 mA: power motors, servos and relays from a separate supply and connect the grounds together',
    'Pins SD0–SD3, CMD and CLK belong to the flash memory — leave them alone',
  ],
  uses: [
    'Wi-Fi rover: drive the motors from your phone through a web page',
    'Weather station: temperature and humidity sensor posting to a website or a chat bot',
    'Smart plug or light: a relay switched over Wi-Fi and on a schedule',
    'Robot remote and telemetry: sensor readings shown live on a phone screen',
    'Teamed with an Arduino: NodeMCU handles the network, the second board drives the motors',
  ],
  parts: {
    module: { name: 'ESP-12E module (ESP8266EX)', text: 'Under the metal shield sit the ESP8266EX microcontroller itself, a 4 MB flash memory chip and a 26 MHz crystal. It is the brain and the radio in one package: it runs your program and keeps the Wi-Fi link alive. The shield protects the radio from interference.' },
    antenna: { name: 'Wi-Fi antenna', text: 'The golden zig-zag trace at the edge of the module is a printed 2.4 GHz antenna. There is no copper on the board underneath it, and metal or wires nearby noticeably weaken the Wi-Fi signal. Inside a robot, mount the board with the antenna facing outwards.' },
    led: { name: 'Built-in LED (D4)', text: 'The blue LED on the module is wired to pin D4 (GPIO2) "backwards": it lights up when the pin is LOW and goes dark when it is HIGH. Handy for a first program and for status signals such as "connected to Wi-Fi". It also flickers by itself while a sketch is uploading.' },
    led_d0: { name: 'Second LED (D0)', text: 'A second blue LED on the board itself, connected to pin D0 (GPIO16). Like the first one it is active-low: write LOW to switch it on. Two independent LEDs are useful for showing two states at once without any extra wiring.' },
    usb: { name: 'Micro-USB connector', text: 'Brings in 5 V power and links the board to your computer for uploading sketches and for the serial monitor. You need a cable with data wires — a "charge-only" cable will power the board, but the computer will not see it.' },
    usbchip: { name: 'CP2102 USB-to-UART bridge', text: 'The ESP8266 cannot speak USB, so a translator sits between the connector and the module: it turns USB into a serial port (UART). On the computer the board shows up as a COM port; you may need to install the CP210x driver.' },
    reg3v3: { name: 'AMS1117-3.3 voltage regulator', text: 'Steps the 5 V from USB or the Vin pin down to the 3.3 V the ESP8266 runs on. The extra voltage is turned into heat, so do not feed Vin with more than 9–10 V. Small sensors can be powered from the 3V3 pin.' },
    diode: { name: 'Protection diode', text: 'A Schottky diode between the USB connector and the Vin line. It stops current from an external supply on Vin flowing back into your computer\'s USB port. Because of it Vin shows slightly less than 5 V when the board is powered from USB.' },
    btn_rst: { name: 'RST button (reset)', text: 'Restarts your program from the very beginning — just like switching the board off and on again. The program stored in flash is not erased. Useful when a sketch hangs or you want to see the start-up messages again.' },
    btn_flash: { name: 'FLASH button', text: 'Pulls GPIO0 (D3) to ground. Hold it during a reset and the chip enters firmware-upload mode. The auto-reset circuit normally does this for you, but the button saves the day when an upload refuses to start. In your own program you can read it as an ordinary button on D3.' },
    autoreset: { name: 'Auto-upload circuit', text: 'Two transistors that let the CP2102 bridge "press" RST and FLASH by itself using its DTR and RTS signals. Thanks to them you never have to time button presses by hand — just click Upload in the Arduino IDE.' },
    divider: { name: 'A0 voltage divider', text: 'The ADC inside the ESP8266 only measures 0–1 V. Two resistors (220 kΩ and 100 kΩ) divide the voltage by about three, so the A0 pin of the board accepts 0–3.3 V. A bare ESP-12E module has no such divider.' },
    hdr_top: { name: 'Header D0–D8, RX, TX', text: 'The main digital pins. The D0…D8 labels are board numbers; in chip documentation the same pins are called GPIO (for example D1 = GPIO5). This row also carries I²C (D1, D2), SPI (D5–D8) and the RX/TX serial port.' },
    hdr_bottom: { name: 'Header A0, power, service pins', text: 'Analog input A0, power (Vin, 3V3, GND) and the EN and RST pins. The six pins in the middle (SD0–SD3, CMD, CLK) are wired to the on-board flash memory and must not be used in projects.' },
  },
  partOrder: ['module', 'antenna', 'led', 'usb', 'usbchip', 'reg3v3', 'diode', 'btn_rst', 'btn_flash', 'autoreset', 'divider', 'led_d0', 'hdr_top', 'hdr_bottom'],
  pinNotes: [
    { title: 'Power', text: 'Power the board from USB or feed 5 V into Vin. 3V3 is the regulator output for sensors (a couple of hundred mA in total, shared with the chip itself, which draws bursts of up to 300 mA while transmitting). All GND pins are connected together.' },
    { title: 'D numbers vs GPIO', text: 'The board says D0–D8 but programs often use GPIO numbers: D0=16, D1=5, D2=4, D3=0, D4=2, D5=14, D6=12, D7=13, D8=15. In the Arduino IDE you can simply write D1, D2 — the constants are already defined.' },
    { title: 'Safe pins', text: 'Feel free to use D1, D2, D5, D6 and D7 — they have no special roles. D3, D4 and D8 affect how the chip boots, D0 has no PWM or interrupts, and RX/TX are busy talking to the computer.' },
    { title: 'Analog input', text: 'A0 is the only one on the board: 0–3.3 V, values from 0 to 1023. If you need several analog sensors, add an external I²C ADC (such as the ADS1115) or a multiplexer.' },
    { title: 'Buses', text: 'I²C: D1 (SCL) and D2 (SDA) — displays, gyroscopes, sensors. SPI: D5 (SCK), D6 (MISO), D7 (MOSI), D8 (CS). PWM for motors and LEDs works on D1–D8, 10-bit by default (0…1023).' },
  ],
  code: {
    title: 'First sketch: blink and join Wi-Fi', lang: 'cpp',
    src: `#include <ESP8266WiFi.h>

const char* ssid = "MyWiFi";        // your network name
const char* pass = "12345678";      // its password

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);     // blue LED on D4 (GPIO2)
  Serial.begin(115200);
  WiFi.begin(ssid, pass);           // start connecting

  while (WiFi.status() != WL_CONNECTED) {
    // no network yet — blink fast
    digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));
    delay(200);
  }
  Serial.print("My IP address: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  digitalWrite(LED_BUILTIN, LOW);   // LOW turns the LED ON (it is inverted)
  delay(100);
  digitalWrite(LED_BUILTIN, HIGH);  // HIGH turns it off
  delay(1900);                      // one short flash every 2 seconds
}`,
  },
  quiz: [
    { q: 'Find the module with the ESP8266 microcontroller — the "brain" of the board', part: 'module', hint: 'It hides under the shiny metal shield' },
    { q: 'Where is the Wi-Fi antenna?', part: 'antenna', hint: 'A golden zig-zag right at the edge of the board' },
    { q: 'Which chip translates USB into a serial port?', part: 'usbchip', hint: 'A small black square with no legs between the module and the USB connector' },
    { q: 'Which button do you hold when an upload will not start?', part: 'btn_flash', hint: 'One of the two buttons beside the USB connector — the one labelled FLASH' },
    { q: 'Find the regulator that makes 3.3 V out of 5 V', part: 'reg3v3', hint: 'A package with three legs on one side and a wide tab on the other' },
    { q: 'Which part lets you feed up to 3.3 V into A0?', part: 'divider', hint: 'A pair of tiny resistors right next to the module' },
  ],
  facts: [
    'The ESP8266 appeared in 2014 as a cheap "Wi-Fi adapter" for other microcontrollers — only later did hobbyists discover that it makes a great main processor on its own.',
    'The name NodeMCU comes from a firmware based on the Lua language; today these boards are mostly programmed from the Arduino IDE or in MicroPython.',
    'In deep sleep the ESP8266 chip itself draws only about 20 µA, so a bare module can run a battery-powered sensor for months. On this dev board the USB bridge and the regulator add a few milliamps on top.',
  ],

  build(opts = {}) {
    const b = new Board({
      w: W, h: H, t: 1.6, r: 1.3, theme: THEME, finish: 'gold', quality: opts.quality ?? 1,
      holes: [{ x: 2.2, y: 2.2, d: 3 }, { x: W - 2.2, y: 2.2, d: 3 }, { x: 2.2, y: H - 2.2, d: 3 }, { x: W - 2.2, y: H - 2.2, d: 3 }],
    });
    const bot = { side: 'bottom', w: 0.25 };

    // ───────── pin headers (legs down), pins, labels ─────────
    for (const [list, y, dir, id] of [[BOT_PINS, YB, 1, 'hdr_bottom'], [TOP_PINS, YT, -1, 'hdr_top']]) {
      b.tag(header(b, { x: hx(7), y, nx: 15, type: 'maleDown', pin1: false }), id);
      list.forEach(([label, name, fn, kind], i) => {
        b.pin(hx(i), y, name, fn, kind);
        b.text(label, hx(i), y + dir * 1.47, { size: 0.68, weight: 700 });
        b.text(label, hx(i), y + dir * 2.05, { size: 0.76, weight: 700, side: 'bottom', rot: 180 });
      });
    }

    // ───────── ESP-12E module, its antenna and LED ─────────
    b.tag(rfModule(b, { x: MCX, y: MCY, type: 'esp12', led: false, text: MODULE_TEXT }), 'module');
    b.keepout(3.35, MCY, 7.7, 16.4, { side: 'bottom' });
    {
      // gold meander laid exactly over the module's antenna so that it can be picked separately
      const A = new Builder(), xa = -11.25, xb = -7.4, xs = -4.9, y0 = -6.9, dy = 13.8 / 7, pts = [[xs, y0], [xa, y0]];
      for (let i = 1; i <= 7; i++) { const yy = y0 + i * dy, near = i % 2 === 1; pts.push([near ? xa : xb, yy], [near ? xb : xa, yy]); }
      const seg = (p, q) => A.box(Math.hypot(q[0] - p[0], q[1] - p[1]) + 0.64, 0.64, 0.022, M.gold, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 0.9, Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI);
      for (let i = 0; i + 1 < pts.length; i++) seg(pts[i], pts[i + 1]);
      seg([xs, y0 + dy], [xb, y0 + dy]);
      b.tag(b.place(A.build('antenna'), MCX, MCY), 'antenna');
    }
    {
      // blue LED on the module (GPIO2), lit
      const L = new Builder(), mt = 0.86;
      L.box(1.6, 0.8, 0.3, M.ceramic, 0, 0, mt);
      for (const s of [-1, 1]) L.box(0.3, 0.82, 0.32, M.tin, s * 0.72, 0, mt);
      L.rbox(0.92, 0.62, 0.28, 0.09, ledMat('#2f7bff', true), 0, 0, mt + 0.27);
      const gl = glowSprite('#2f7bff', 5.2); gl.position.set(0, mt + 0.55 + 0.9, 0); gl.center.set(0.5, 0.56); L.add(gl);
      b.tag(b.place(L.build('led'), MCX - 6.05, MCY - 5.92), 'led');   // between the antenna feed line and its stub
    }

    // ───────── connectors, ICs, buttons ─────────
    b.tag(usbMicro(b, { x: W + 1.3, y: MCY, rot: 180 }), 'usb');
    const CPX = 35.8, CPY = 14.3;
    b.tag(qfn(b, { x: CPX, y: CPY, size: 5, pins: 7, pitch: 0.5, text: ['SILABS', 'CP2102', 'DCL00X', '1614+'] }), 'usbchip');
    b.tag(sot223(b, { x: 30.0, y: 7.6, rot: 90, text: ['AMS1117', '3.3 1543'] }), 'reg3v3');
    b.tag(diode(b, { x: 37.6, y: 8.6, pkg: 'sod123', text: 'B2' }), 'diode');
    b.tag(button(b, { type: 'smd', x: 44.6, y: 5.75 }), 'btn_rst');
    b.tag(button(b, { type: 'smd', x: 44.6, y: 20.05 }), 'btn_flash');
    b.tag(led(b, { x: 39.6, y: 18.6, rot: 90, size: '0603', color: '#2f7bff' }), 'led_d0');

    // auto-upload circuit: two transistors + base / pull-up resistors
    const QX = 27.6, RX = 30.4, Q1Y = 15.05, Q2Y = 18.35;
    b.tag(passives(b, [
      ['sot23', QX, Q1Y, 90, { text: 'J3Y' }], ['sot23', QX, Q2Y, 90, { text: 'J3Y' }],
      ['res', RX, Q1Y - 0.95, 0, { text: '123' }], ['res', RX, Q1Y + 0.95, 0, { text: '123' }],
      ['res', RX, Q2Y - 0.95, 0, { text: '123' }], ['res', RX, Q2Y + 0.95, 0, { text: '123' }],
    ], { name: 'autoreset' }), 'autoreset');
    // A0 divider 220k / 100k
    b.tag(passives(b, [['res', 27.0, 20.85, 0, { text: '224' }], ['res', 29.4, 20.85, 0, { text: '104' }]], { name: 'divider' }), 'divider');
    // the rest of the small parts
    passives(b, [
      ['res', 34.3, 18.6, 90, { text: '471' }], ['res', 35.55, 18.6, 90, { text: '123' }], ['res', 36.8, 18.6, 90, { text: '471' }], ['res', 38.05, 18.6, 90, { text: '123' }],
      ['res', 39.6, 20.75, 90, { text: '471' }],
      ['cap', 40.8, 19.2, 90], ['cap', 40.8, 6.6, 90],
      ['cap', 40.5, 15.8, 90], ['cap', 41.8, 15.8, 90],
      ['cap', 37.2, 10.45, 0, { size: '0805' }], ['cap', 35.0, 5.3, 90],
      ['cap', 27.1, 10.25, 0],
      ['res', 31.0, 11.55, 0, { text: '123' }],
    ]);

    // ───────── top-layer traces ─────────
    // GPIO5, GPIO4, GPIO0, GPIO2 → D1…D4: staggered bus between the module pads and the header
    const lv = { 2: 0.7, 3: 0.42, 4: 0.14 }, y0 = TIP_T + 0.2;
    for (let k = 2; k <= 5; k++) {
      const px = mpx(k), tx = hx(k - 1), hl = (px - tx) - (YT - y0);
      if (hl <= 0) b.trace([[px, TIP_T - 0.1], [px, YT - (px - tx)], [tx, YT]]);
      else b.trace([[px, TIP_T - 0.1], [px, y0], [px - lv[k], y0 + lv[k]], [px - lv[k] - hl, y0 + lv[k]], [tx, YT]]);
    }
    b.trace([[mpx(6), TIP_T - 0.1], [mpx(6), 22.1], [mpx(6) + 0.3, 22.4], [hx(10) - (YT - 22.4), 22.4], [hx(10), YT]]);   // GPIO15 → D8
    b.via(mpx(0), TIP_T + 0.35); b.via(mpx(1), TIP_T + 0.35);                                                          // TXD, RXD → bottom layer
    // 3.3 V: regulator tab → module VCC and the 3V3 pin
    b.trace([[mpx(7), TIP_B + 0.1], [mpx(7) + 0.35, 3.45], [hx(10) - 1.98, 3.45], [hx(10), YB]], { w: 0.5 });
    b.trace([[26.9, 6.3], [26.9, 3.45]], { w: 0.6 });
    b.trace([[hx(0), YB], [hx(0), 3.0], [7.4, 3.8], [7.4, 5.2]]);                                                      // A0 → under the module
    b.trace([[26.27, 20.85], [24.5, 20.85]]); b.trace([[27.73, 20.85], [28.67, 20.85]]);                               // divider
    b.trace([[30.13, 20.85], [31.1, 20.85]]); b.via(31.1, 20.85);
    // Vin → diode cathode → regulator input; USB VBUS → diode anode
    b.trace([[hx(14), YB], [hx(14), 2.5], [38.0, 6.66], [36.0, 6.66], [36.0, 8.4]], { w: 0.5 });
    b.trace([[35.97, 8.6], [35.0, 8.6], [33.7, 9.9]], { w: 0.5 });
    b.trace([[42.75, 11.6], [42.2, 11.6], [39.225, 8.625]], { w: 0.4 });
    // USB D−/D+ → CP2102
    const cpR = CPX + 2.5, cpL = CPX - 2.5, cpT = CPY + 2.5;
    b.trace([[42.75, 12.25], [41.2, 12.25], [40.65, 12.8], [cpR, 12.8]], { w: 0.2 });
    b.trace([[42.75, 12.9], [41.4, 12.9], [41.0, 13.3], [cpR, 13.3]], { w: 0.2 });
    b.trace([[cpR, 14.8], [40.23, 14.8], [40.5, 15.07]]); b.trace([[cpR, 14.3], [41.5, 14.3], [41.8, 14.6], [41.8, 15.07]]);
    // CP2102 TXD/RXD: from the bottom-layer vias, and through series resistors to the RX / TX pins
    b.via(32.35, 12.3); b.via(32.35, 13.3);
    b.trace([[32.35, 12.3], [32.85, 12.8], [cpL, 12.8]], { w: 0.2 }); b.trace([[32.35, 13.3], [cpL, 13.3]], { w: 0.2 });
    b.trace([[34.3, cpT], [34.3, 17.9]], { w: 0.2 }); b.trace([[36.8, cpT], [36.8, 17.9]], { w: 0.2 });
    b.trace([[34.3, 19.33], [34.3, 21.9], [hx(11), 22.14], [hx(11), YT]]);
    b.trace([[36.8, 19.33], [36.8, 21.9], [hx(12), 22.18], [hx(12), YT]]);
    b.trace([[35.55, 19.33], [35.55, 20.4]]); b.via(35.55, 20.4);
    b.trace([[38.05, 19.33], [38.05, 20.4]]); b.via(38.05, 20.4);
    b.trace([[39.6, 19.33], [39.6, 20.02]]);
    // DTR / RTS → resistors → transistors
    b.trace([[RX + 0.73, Q1Y - 0.95], [31.9, Q1Y - 0.95], [32.6, 14.8], [cpL, 14.8]], { w: 0.2 });
    b.trace([[RX + 0.73, Q1Y + 0.95], [32.4, Q1Y + 0.95], [32.6, 15.8], [cpL, 15.8]], { w: 0.2 });
    for (const qy of [Q1Y, Q2Y]) for (const s of [-1, 1]) b.trace([[QX + 1.0, qy + s * 0.95], [RX - 0.73, qy + s * 0.95]]);
    for (const s of [-1, 1]) { b.trace([[RX + 0.73, Q2Y + s * 0.95], [31.9, Q2Y + s * 0.95]]); b.via(31.9, Q2Y + s * 0.95); }
    // buttons: debounce caps, RST via, EN stub
    b.trace([[42.0, 20.05], [40.9, 19.93]]); b.trace([[42.0, 5.75], [41.3, 5.87], [40.9, 5.87]]);
    b.via(41.0, 4.5); b.trace([[41.0, 4.5], [41.9, 5.4]]);
    b.trace([[hx(11), YB], [hx(11), 3.8]]); b.via(hx(11), 3.8);
    // ground stitching
    for (const [vx, vy] of [[33.3, 3.9], [38.4, 3.9], [25.9, 21.9], [32.6, 21.3], [41.2, 16.95], [39.3, 16.95], [43.9, 8.6], [43.9, 17.3], [31.2, 9.6], [29.2, 9.9], [30.6, 5.6]]) b.via(vx, vy);

    // ───────── vias under the module and bottom-layer traces ─────────
    // flash-memory lines: module end pads → SD3…CLK
    for (let k = 0; k < 6; k++) {
      const vx = 23.4 - 0.9 * k, vy = mey(k), tx = hx(8 - k), yb = 3.7;
      b.trace([[MCX + ML / 2 - 0.9, vy], [vx, vy]]);                                 // hidden under the module
      b.via(vx, vy);
      b.trace([[vx, vy], [vx, yb + Math.abs(tx - vx)], [tx, yb], [tx, YB]], bot);
    }
    // GPIO14/12/13 → D5…D7
    [[21.6, 19.3], [22.5, 18.6], [23.4, 17.9]].forEach(([vx, vy], j) => {
      const tx = hx(7 + j);
      b.via(vx, vy);
      b.trace([[vx, vy], [tx, vy + (tx - vx)], [tx, YT]], bot);
    });
    // GPIO16 → D0
    b.via(14.8, 6.6);
    b.trace([[14.8, 6.6], [14.8, 13.0], [hx(0), 21.2], [hx(0), YT]], bot);
    // TXD / RXD → CP2102
    b.trace([[mpx(0), TIP_T + 0.35], [10.25, 20.9], [17.6, 20.9], [26.2, 12.3], [32.35, 12.3]], bot);
    b.trace([[mpx(1), TIP_T + 0.35], [11.65, 21.5], [17.8, 21.5], [26.0, 13.3], [32.35, 13.3]], bot);
    // 3.3 V rail, RST, misc
    b.trace([[hx(14), YT], [hx(14), 22.4], [40.5, 20.74], [40.5, 9.97], [hx(10), YB]], { side: 'bottom', w: 0.6 });
    b.trace([[hx(12), YB], [hx(12), 2.9], [38.68, 4.5], [41.0, 4.5]], bot);
    b.trace([[31.9, Q2Y + 0.95], [33.0, 20.4], [35.55, 20.4]], bot);
    b.trace([[31.9, Q2Y - 0.95], [33.6, 17.4], [35.05, 18.85], [36.5, 18.85], [38.05, 20.4]], bot);
    b.trace([[31.1, 20.85], [29.0, 20.85], [26.5, 18.35], [26.5, 15.2]], bot); b.via(26.5, 15.2, { side: 'bottom' });

    // ───────── top silkscreen ─────────
    b.text('NodeMCU', 29.0, 12.75, { size: 0.95, weight: 700 });
    b.text('V2', 41.7, 9.2, { size: 0.85, weight: 700 });
    b.text('RST', 44.0, 8.3, { size: 0.72, weight: 700 });
    b.text('FLASH', 43.7, 17.55, { size: 0.72, weight: 700 });
    b.text('U2', 30.0, 11.55 - 1.2, { size: 0.5 });
    b.text('U1', 34.1, 10.85, { size: 0.5 });
    b.text('Q1', 26.2, 14.0, { size: 0.45 }); b.text('Q2', 26.2, 17.0, { size: 0.45 });
    b.text('C1', 39.15, 10.6, { size: 0.45 });
    b.text('D1', 37.6, 7.35, { size: 0.5 });
    b.text('LED', 39.6, 17.25, { size: 0.45 });
    b.rect(44.6, 5.75, 6.4, 3.6, { lw: 0.1 }); b.rect(44.6, 20.05, 6.4, 3.6, { lw: 0.1 });

    // ───────── bottom silkscreen (the viewer flips the board around x, so horizontal text uses rot 180) ─────────
    const bs = { side: 'bottom', rot: 180 };
    b.text('NodeMCU', 33.0, 7.4, { size: 2.0, weight: 700, ...bs });
    b.text('V2 · ESP-12E', 33.0, 10.3, { size: 1.0, weight: 700, ...bs });
    b.text('Wi-Fi 802.11 b/g/n · 2.4 GHz', 33.0, 12.3, { size: 0.7, ...bs });
    b.line([[26.6, 13.7], [39.4, 13.7]], { w: 0.12, side: 'bottom' });
    b.text('Use 9600bps baud rate', 33.0, 15.2, { size: 0.72, ...bs });
    b.text('Install CP2102 driver', 33.0, 16.7, { size: 0.72, ...bs });
    b.text('Logic 3.3 V · Vin 5-10 V', 33.0, 18.2, { size: 0.72, ...bs });
    b.rect(3.35, MCY, 6.9, 15.6, { lw: 0.12, side: 'bottom' });
    b.text('ANT', 3.4, MCY, { size: 0.9, rot: 90, side: 'bottom' });

    return b.finish();
  },
};
