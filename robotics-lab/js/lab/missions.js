// Guided experiments for the Lab — see LAB.md §2 for the contract. Ordered easy → hard.
// Validate with: node tools/check-missions.mjs
//
// Conventions used below
//  · pin names are the exact `b.pin(...)` names of the boards / modules ("D1 / TX", "D5 · GPIO14", "3V3(OUT)" …)
//  · `code` is either { lang, src } or, for missions with two boards, [{ title, lang, src }, …]
//  · sketches are kept ~40 columns wide (the code pane is narrow), comments go on their own line
//  · `run(sim)` mirrors what the code would do: same pins, same numbers, same timing
//  · serial lines are short — the serial pane wraps after a few words

const code = String.raw;                                   // keeps "\n" inside sketches literal
const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Arduino's map(): integer maths, the division truncates
const map = (x, inLo, inHi, outLo, outHi) => Math.trunc(((x - inLo) * (outHi - outLo)) / (inHi - inLo)) + outLo;

export const MISSIONS = [

  // ─────────────────────────────────────────────── 1 ───────────────────────────────────────────────
  {
    id: 'blink',
    title: 'Hello, LED',
    level: 'Beginner',
    minutes: 3,
    goal: 'Make an LED blink with an Arduino Uno.',
    intro: 'Every maker starts right here — blinking an LED is the "Hello, world!" of electronics. '
      + 'We\'ll hook one LED up to an Arduino Uno and switch it on and off, on and off. Two wires and a few lines of code, and you\'ve built your first working circuit.',
    learn: [
      'A digital pin is a tiny switch: the sketch flips it between 0 V (LOW) and 5 V (HIGH)',
      'Current only flows in a closed loop — out of the pin, through the LED, back into GND',
      'An LED always needs a resistor to limit its current; this module has one on board',
      'delay(500) pauses the sketch for 500 milliseconds — half a second',
    ],
    parts: [
      { ref: 'uno', type: 'board:uno', x: -40, y: 0, rot: 0 },
      { ref: 'led', type: 'mod:led', opts: { color: 'red' }, x: 45, y: 25, rot: 0 },
    ],
    wires: [
      { a: 'uno.D13', b: 'led.SIG', color: 'yellow', why: 'D13 is the pin our sketch switches between 0 V and 5 V — it also drives the tiny "L" LED on the board.' },
      { a: 'uno.GND', b: 'led.GND', color: 'black', why: 'Current needs a way back to the board: no return path, no light.' },
    ],
    code: { lang: 'cpp', src: code`// Pin 13 also drives the little
// "L" LED on the board
const int LED_PIN = 13;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  // 5 V on the pin: LED on
  digitalWrite(LED_PIN, HIGH);
  Serial.println("D13 HIGH - LED on");
  delay(500);

  // 0 V on the pin: LED off
  digitalWrite(LED_PIN, LOW);
  Serial.println("D13 LOW - LED off");
  delay(500);
}` },
    run(sim) {
      let on = false;
      const flip = () => {
        on = !on;
        sim.set('led', { on, level: 1 });
        sim.set('uno', { led: on });
        sim.log('uno', on ? 'D13 HIGH - LED on' : 'D13 LOW - LED off');
      };
      flip();
      sim.every(500, flip);
    },
    success: 'The sketch sets D13 HIGH, waits half a second, sets it LOW and waits again, forever — and whenever the pin is HIGH, current flows through the LED and back to GND, so it lights up. '
      + 'The little "L" LED on the Uno copies it because it hangs on the very same pin.',
    watch: 'Spot the tiny "L" LED on the Uno blinking in step with yours, and follow the HIGH / LOW lines in the Serial tab.',
  },

  // ─────────────────────────────────────────────── 2 ───────────────────────────────────────────────
  {
    id: 'button-led',
    title: 'Push to light',
    level: 'Beginner',
    minutes: 4,
    goal: 'Hold a button and an Arduino Nano switches an LED on.',
    intro: 'Blinking was output only — now let\'s give the board a sense of touch. An Arduino Nano will keep asking a push button "are you pressed?" and switch an LED to match. '
      + 'Read a pin, decide, write a pin: that little loop is the heartbeat of every robot.',
    learn: [
      'digitalRead() tells the sketch whether a pin sees HIGH (5 V) or LOW (0 V)',
      'A button module needs three wires: power, ground and the signal that carries the answer',
      'Its pull-down resistor holds the signal at a clean LOW until you press — a loose input would read random values',
      'loop() repeats many thousands of times a second, so the LED seems to react instantly',
    ],
    parts: [
      { ref: 'nano', type: 'board:nano', x: 0, y: -30, rot: 0 },
      { ref: 'btn', type: 'mod:button', x: -50, y: 45, rot: 0 },
      { ref: 'led', type: 'mod:led', opts: { color: 'green' }, x: 50, y: 45, rot: 0 },
    ],
    wires: [
      { a: 'nano.5V', b: 'btn.VCC', color: 'red', why: 'The button module needs 5 V so it has a HIGH to pass along when you press it.' },
      { a: 'nano.GND', b: 'btn.GND', color: 'black', why: 'Ground is the 0 V reference: through the pull-down resistor it keeps OUT at LOW while the button is up.' },
      { a: 'btn.OUT', b: 'nano.D2', color: 'yellow', why: 'OUT carries the answer — 5 V while pressed, 0 V when released — and D2 listens to it.' },
      { a: 'nano.D9', b: 'led.SIG', color: 'green', why: 'D9 is the output the sketch drives to switch the LED.' },
      { a: 'nano.GND', b: 'led.GND', color: 'black', why: 'The LED\'s return path — the Nano has more than one GND pin, use whichever is free.' },
    ],
    code: { lang: 'cpp', src: code`const int BUTTON_PIN = 2;
const int LED_PIN = 9;
int lastState = LOW;

void setup() {
  pinMode(BUTTON_PIN, INPUT);
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Ready - press me");
}

void loop() {
  // HIGH while the button is held
  int state = digitalRead(BUTTON_PIN);
  // copy it straight to the LED
  digitalWrite(LED_PIN, state);

  // report only when it changes
  if (state != lastState) {
    lastState = state;
    if (state == HIGH) {
      Serial.println("pressed: LED on");
    } else {
      Serial.println("released: LED off");
    }
  }
}` },
    run(sim) {
      let last = false;
      sim.set('led', { on: false, level: 1 });
      sim.log('nano', 'Ready - press me');
      sim.loop(() => {
        const pressed = !!sim.get('btn').pressed;
        if (pressed === last) return;
        last = pressed;
        sim.set('led', { on: pressed, level: 1 });
        sim.log('nano', pressed ? 'pressed: LED on' : 'released: LED off');
      });
    },
    success: 'The Nano reads D2 over and over: while you hold the button, OUT is at 5 V, digitalRead() returns HIGH and the sketch copies that to D9 — LED on; let go and it all falls back to 0 V. '
      + 'Input → decision → output: you just built a complete control loop.',
    watch: 'Press and hold the button — click it on the bench or use "Hold to press" — then let go. The LED keeps up with every tap.',
  },

  // ─────────────────────────────────────────────── 3 ───────────────────────────────────────────────
  {
    id: 'dimmer',
    title: 'Knob dimmer',
    level: 'Beginner',
    minutes: 5,
    goal: 'Turn a knob to set how bright an LED glows.',
    intro: 'On and off is nice, but the world isn\'t black and white. A potentiometer — a knob — gives the Uno a smoothly changing voltage, '
      + 'and with a trick called PWM the Uno can make an LED glow at any brightness in between.',
    learn: [
      'analogRead() turns a voltage of 0–5 V into a number from 0 to 1023 (a 10-bit ADC)',
      'analogWrite() is PWM: the pin flicks on and off about 490 times a second, and the share of on-time sets the brightness',
      'map() rescales one range of numbers into another: 0–1023 becomes 0–255',
      'On an Uno only the pins marked "~" can do PWM: 3, 5, 6, 9, 10 and 11',
    ],
    parts: [
      { ref: 'uno', type: 'board:uno', x: -45, y: 0, rot: 0 },
      { ref: 'pot', type: 'mod:pot', x: 50, y: -35, rot: 0 },
      { ref: 'led', type: 'mod:led', opts: { color: 'blue' }, x: 50, y: 35, rot: 0 },
    ],
    wires: [
      { a: 'uno.5V', b: 'pot.VCC', color: 'red', why: 'One end of the knob\'s resistive track goes to 5 V…' },
      { a: 'uno.GND', b: 'pot.GND', color: 'black', why: '…and the other end to 0 V, so the wiper can pick any voltage in between.' },
      { a: 'pot.OUT', b: 'uno.A0', color: 'yellow', why: 'The wiper voltage goes to A0, an analog input that measures 0–5 V as a number from 0 to 1023.' },
      { a: 'uno.D9', b: 'led.SIG', color: 'green', why: 'Pin 9 has a "~" printed next to it: it can do PWM, switching so fast that the LED just looks dimmer.' },
      { a: 'uno.GND', b: 'led.GND', color: 'black', why: 'The LED\'s way back to ground — the Uno has three GND pins, any of them will do.' },
    ],
    code: { lang: 'cpp', src: code`const int KNOB_PIN = A0;
// "~9" on the board = PWM pin
const int LED_PIN = 9;
unsigned long lastPrint = 0;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  // knob: 0 ... 1023
  int knob = analogRead(KNOB_PIN);
  // brightness: 0 ... 255
  int pwm = map(knob, 0, 1023, 0, 255);
  analogWrite(LED_PIN, pwm);

  // print about 3 times a second
  if (millis() - lastPrint >= 300) {
    lastPrint = millis();
    Serial.print("knob ");
    Serial.print(knob);
    Serial.print(" -> PWM ");
    Serial.println(pwm);
  }
}` },
    run(sim) {
      let knob = 0, pwm = 0;
      const sample = () => {
        knob = Math.round(clamp(num(sim.get('pot').value, 0), 0, 1) * 1023);
        pwm = map(knob, 0, 1023, 0, 255);
        sim.set('led', { on: pwm > 0, level: pwm / 255 });
      };
      sample();
      sim.loop(sample);
      sim.every(300, () => sim.log('uno', `knob ${knob} -> PWM ${pwm}`));
    },
    success: 'The knob is a voltage divider: turning it slides A0 anywhere between 0 V and 5 V, and the Uno reads that as 0–1023. map() squeezes the number into 0–255 and analogWrite() turns it into PWM — '
      + 'the LED is really flashing about 490 times a second, far too fast to see, so your eye just sees "dimmer" or "brighter".',
    watch: 'Drag the Knob slider from one end to the other and watch both numbers in the Serial tab: knob 1023 is PWM 255.',
  },

  // ─────────────────────────────────────────────── 4 ───────────────────────────────────────────────
  {
    id: 'servo-knob',
    title: 'Servo follows the knob',
    level: 'Beginner',
    minutes: 5,
    goal: 'Steer a servo arm by turning a potentiometer.',
    intro: 'Robots need muscles, and the servo is the easiest one to boss around: tell it an angle and it goes there and holds. '
      + 'We\'ll reuse the knob from the dimmer — this time it steers a servo arm, exactly like a joystick steering a robot arm.',
    learn: [
      'A hobby servo has three wires: power (red), ground (brown) and one signal wire (orange)',
      'The signal is a pulse sent 50 times a second; its width — roughly 0.5 to 2.4 ms — tells the servo which angle to hold',
      'The Servo library does the timing for you: just write an angle from 0 to 180',
      'Motors are hungry: one micro servo is fine on USB power, anything bigger needs its own supply',
    ],
    parts: [
      { ref: 'uno', type: 'board:uno', x: -55, y: 0, rot: 0 },
      { ref: 'pot', type: 'mod:pot', x: 45, y: -45, rot: 0 },
      { ref: 'servo', type: 'mod:servo', x: 70, y: 40, rot: 0 },
    ],
    wires: [
      { a: 'uno.5V', b: 'servo.5V', color: 'red', why: 'The servo\'s motor and electronics run on 5 V (its red wire).' },
      { a: 'uno.GND', b: 'servo.GND', color: 'black', why: 'Ground for the servo (its brown wire) — power and signal both need it.' },
      { a: 'uno.D9', b: 'servo.SIG', color: 'orange', why: 'D9 sends the control pulses down the orange wire: the width of each pulse is the angle.' },
      { a: 'uno.5V', b: 'pot.VCC', color: 'red', why: '5 V for the knob\'s track — it shares the Uno\'s 5 V rail with the servo.' },
      { a: 'uno.GND', b: 'pot.GND', color: 'black', why: 'The other end of the track goes to ground.' },
      { a: 'pot.OUT', b: 'uno.A0', color: 'yellow', why: 'The wiper voltage tells the Uno where the knob is: 0–5 V reads as 0–1023 on A0.' },
    ],
    code: { lang: 'cpp', src: code`#include <Servo.h>

Servo arm;
const int KNOB_PIN = A0;
const int SERVO_PIN = 9;
unsigned long lastPrint = 0;

void setup() {
  // start sending pulses on pin 9
  arm.attach(SERVO_PIN);
  Serial.begin(9600);
}

void loop() {
  // knob: 0 ... 1023
  int knob = analogRead(KNOB_PIN);
  // angle: 0 ... 180 degrees
  int angle = map(knob, 0, 1023, 0, 180);
  arm.write(angle);

  if (millis() - lastPrint >= 300) {
    lastPrint = millis();
    Serial.print("knob ");
    Serial.print(knob);
    Serial.print(" -> angle ");
    Serial.println(angle);
  }
  // give the servo time to move
  delay(15);
}` },
    run(sim) {
      let knob = 0, target = 90;
      let angle = clamp(num(sim.get('servo').angle, 90), 0, 180);
      const sample = () => {
        knob = Math.round(clamp(num(sim.get('pot').value, 0), 0, 1) * 1023);
        target = map(knob, 0, 1023, 0, 180);
      };
      sample();
      sim.loop(sample);
      sim.every(20, () => {                              // an SG90 needs about 0.1 s for 60°: 12° per 20 ms
        if (angle === target) return;
        angle += clamp(target - angle, -12, 12);
        sim.set('servo', { angle });
      });
      sim.every(300, () => sim.log('uno', `knob ${knob} -> angle ${target}`));
    },
    success: 'The Uno reads the knob on A0, map() turns 0–1023 into 0–180 degrees, and the Servo library converts that angle into a pulse about 0.5–2.4 ms wide, repeated 50 times a second on D9. '
      + 'Inside the servo a tiny circuit compares the pulse with the arm\'s real position and drives the motor until they match.',
    watch: 'Drag the Knob slider and watch the arm follow. Flick it from end to end — the arm needs a moment to catch up, like a real servo.',
  },

  // ─────────────────────────────────────────────── 5 ───────────────────────────────────────────────
  {
    id: 'parking-sensor',
    title: 'Parking sensor',
    level: 'Intermediate',
    minutes: 6,
    goal: 'Beep faster and faster as an object gets closer.',
    intro: 'Ever heard a car beep while it backs into a parking spot? Let\'s build that. An HC-SR04 "sees" with ultrasound the way a bat does, '
      + 'and a buzzer turns the distance into beeps — the closer the obstacle, the more nervous the beeping.',
    learn: [
      'The HC-SR04 sends a 40 kHz "ping" and holds its Echo pin HIGH for as long as the sound was travelling',
      'Distance = echo time × speed of sound ÷ 2 (there and back) — about 58 microseconds per centimetre',
      'pulseIn() measures how long a pin stays HIGH, in microseconds',
      'tone() makes a passive buzzer sing at the frequency you choose',
    ],
    parts: [
      { ref: 'uno', type: 'board:uno', x: -50, y: -10, rot: 0 },
      { ref: 'sonar', type: 'mod:ultrasonic', x: 60, y: 40, rot: 0 },
      { ref: 'buzzer', type: 'mod:buzzer', x: 60, y: -40, rot: 0 },
    ],
    wires: [
      { a: 'uno.5V', b: 'sonar.VCC', color: 'red', why: 'The HC-SR04 is a 5 V part — it needs the full 5 V to shout loudly enough.' },
      { a: 'uno.GND', b: 'sonar.GND', color: 'black', why: 'Ground for the sensor: its signals are measured against it.' },
      { a: 'uno.D9', b: 'sonar.Trig', color: 'yellow', why: 'A 10-microsecond HIGH pulse on Trig tells the sensor to send a burst of ultrasound.' },
      { a: 'sonar.Echo', b: 'uno.D10', color: 'green', why: 'Echo goes HIGH for exactly as long as the sound was on its way — the Uno times it.' },
      { a: 'uno.D8', b: 'buzzer.SIG', color: 'blue', why: 'D8 drives the buzzer with a 2 kHz square wave made by tone().' },
      { a: 'uno.GND', b: 'buzzer.GND', color: 'black', why: 'The buzzer\'s return path to ground.' },
    ],
    code: { lang: 'cpp', src: code`const int TRIG_PIN = 9;
const int ECHO_PIN = 10;
const int BUZZER_PIN = 8;
unsigned long lastPrint = 0;

void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  Serial.begin(9600);
}

long readDistanceCm() {
  // a 10 microsecond "ping!"
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  // echo time in microseconds
  // (0 = nothing came back)
  long t = pulseIn(ECHO_PIN, HIGH, 30000);
  // sound needs ~58 us per cm,
  // there and back
  return t / 58;
}

void loop() {
  long cm = readDistanceCm();

  if (millis() - lastPrint >= 300) {
    lastPrint = millis();
    Serial.print("Distance: ");
    Serial.print(cm);
    Serial.println(" cm");
  }

  if (cm == 0 || cm > 100) {
    // nothing near: stay quiet
    noTone(BUZZER_PIN);
    delay(200);
  } else if (cm < 5) {
    // about to touch: solid tone
    tone(BUZZER_PIN, 2000);
    delay(100);
  } else {
    // closer = shorter pause
    int gap = map(cm, 5, 100, 40, 600);
    // a 60 ms beep at 2 kHz
    tone(BUZZER_PIN, 2000, 60);
    delay(60 + gap);
  }
}` },
    run(sim) {
      let cm = 0;
      const sound = (on) => { sim.set('buzzer', { on, freq: 2000 }); sim.tone('buzzer', on ? 2000 : 0); };
      const measure = () => {
        cm = Math.trunc(clamp(num(sim.get('sonar').distance, 0), 0, 500));
        if (cm === 0 || cm > 100) { sound(false); sim.after(200, measure); }
        else if (cm < 5) { sound(true); sim.after(100, measure); }
        else {
          const gap = map(cm, 5, 100, 40, 600);
          sound(true);
          sim.after(60, () => sound(false));
          sim.after(60 + gap, measure);
        }
      };
      sound(false);
      measure();
      sim.every(300, () => sim.log('uno', `Distance: ${cm} cm`));
    },
    success: 'The Uno pings, times the echo and divides by 58 to get centimetres — sound needs about 29 µs per centimetre, and it has to go there and back. '
      + 'map() then turns distance into the pause between beeps: 100 cm gives a lazy beep, 5 cm a frantic one, and under 5 cm the tone never stops.',
    watch: 'Drag "Distance to object" towards 2 cm and hear the beeps speed up. Past 100 cm the buzzer goes quiet.',
  },

  // ─────────────────────────────────────────────── 6 ───────────────────────────────────────────────
  {
    id: 'light-meter',
    title: 'Night light on 3.3 V',
    level: 'Intermediate',
    minutes: 6,
    goal: 'Measure light with an STM32 Blue Pill and switch a lamp on when it gets dark.',
    intro: 'Meet the Blue Pill: a tiny STM32 board that is much faster than an Uno and has a sharper analog "eye" — but it lives on 3.3 V, not 5 V. '
      + 'We\'ll measure light with a photoresistor and build a night light that switches itself on at dusk.',
    learn: [
      'The Blue Pill is a 3.3 V board: HIGH means 3.3 V, and its analog pins must never see more than that',
      'Its ADC is 12-bit: 0–3.3 V becomes 0–4095, four times finer than an Uno\'s 0–1023',
      'A photoresistor (LDR) changes resistance with light — on this module the AO voltage climbs as it gets darker',
      'Two thresholds instead of one (hysteresis) stop the lamp from flickering at dusk',
    ],
    parts: [
      { ref: 'pill', type: 'board:bluepill', x: -45, y: 0, rot: 0 },
      { ref: 'ldr', type: 'mod:ldr', x: 55, y: 40, rot: 0 },
      { ref: 'led', type: 'mod:led', opts: { color: 'yellow' }, x: 55, y: -40, rot: 0 },
    ],
    wires: [
      { a: 'pill.3V3', b: 'ldr.VCC', color: 'red', why: 'Feed the sensor from 3.3 V, not 5 V — then its output can never climb higher than the STM32\'s analog pin can take.' },
      { a: 'pill.GND', b: 'ldr.GND', color: 'black', why: 'Ground for the sensor, the reference its output voltage is measured against.' },
      { a: 'ldr.AO', b: 'pill.PA0', color: 'yellow', why: 'AO is the analog output; PA0 is ADC channel 0 of the STM32 (one of its "3.3 V only" pins).' },
      { a: 'pill.PB9', b: 'led.SIG', color: 'green', why: 'PB9 is a plain digital output: HIGH is 3.3 V, plenty for the LED module.' },
      { a: 'pill.GND', b: 'led.GND', color: 'black', why: 'The LED\'s return path — the Blue Pill has several GND pins.' },
    ],
    code: { lang: 'cpp', src: code`// STM32 "Blue Pill", Arduino IDE
// with the STM32 board package
const int LDR_PIN = PA0;
const int LED_PIN = PB9;
// darker = higher number
const int DARK = 2600;    // lamp on
const int BRIGHT = 2200;  // lamp off
bool lampOn = false;

void setup() {
  // use all 12 bits: 0 ... 4095
  analogReadResolution(12);
  pinMode(LED_PIN, OUTPUT);
  // on-board LED: LOW = on
  pinMode(PC13, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  int raw = analogRead(LDR_PIN);
  float volts = raw * 3.3 / 4095;

  // between the two thresholds
  // the lamp stays as it is
  if (raw > DARK) lampOn = true;
  if (raw < BRIGHT) lampOn = false;
  digitalWrite(LED_PIN, lampOn);
  digitalWrite(PC13, !lampOn);

  Serial.print("PA0 = ");
  Serial.print(raw);
  Serial.print(" (");
  Serial.print(volts, 2);
  Serial.print(" V) lamp ");
  Serial.println(lampOn ? "ON" : "off");
  delay(300);
}` },
    run(sim) {
      let lampOn = false;
      const sample = () => {
        const light = clamp(num(sim.get('ldr').value, 0.6), 0, 1);
        const raw = Math.round((1 - light) * 4095);      // LDR on the ground side of the divider: darker → higher AO
        const volts = raw * 3.3 / 4095;
        if (raw > 2600) lampOn = true;
        if (raw < 2200) lampOn = false;
        sim.set('led', { on: lampOn, level: 1 });
        sim.set('pill', { led: lampOn });
        sim.log('pill', `PA0 = ${raw} (${volts.toFixed(2)} V) lamp ${lampOn ? 'ON' : 'off'}`);
      };
      sample();
      sim.every(300, sample);
    },
    success: 'The LDR module hands PA0 a voltage between 0 and 3.3 V — the darker the room, the higher it climbs — and the 12-bit ADC slices it into 4096 steps of less than a millivolt each. '
      + 'Above 2600 the sketch switches the lamp on, below 2200 off, and in the gap between it changes nothing, so the lamp cannot flicker.',
    watch: 'Slide "Light level" down until the lamp comes on (PA0 above 2600), then back up: it only goes off again below 2200.',
  },

  // ─────────────────────────────────────────────── 7 ───────────────────────────────────────────────
  {
    id: 'uart-link',
    title: 'Two boards talking',
    level: 'Intermediate',
    minutes: 8,
    goal: 'Press a button on an Uno and light an LED on a Nano — over a serial link.',
    intro: 'One board is fun; two boards talking is where robotics really begins. Our Uno has a button, our Nano has an LED, and between them run just three wires. '
      + 'The Uno sends single bytes over UART — the same kind of serial link a board uses to chat with your computer — and the Nano answers back.',
    learn: [
      'UART is two one-way streets: each board talks on TX and listens on RX',
      'So the data wires cross: TX of one board goes to RX of the other — never TX to TX',
      'Both boards must share GND, otherwise "0 V" means something different to each of them',
      'There is no clock wire: both sides simply agree on the speed, here 9600 baud',
    ],
    parts: [
      { ref: 'uno', type: 'board:uno', x: -95, y: -25, rot: 0 },
      { ref: 'btn', type: 'mod:button', x: -95, y: 55, rot: 0 },
      { ref: 'nano', type: 'board:nano', x: 35, y: -25, rot: 0 },
      { ref: 'led', type: 'mod:led', opts: { color: 'green' }, x: 35, y: 50, rot: 0 },
    ],
    wires: [
      { a: 'uno.5V', b: 'btn.VCC', color: 'red', why: 'Power for the button module on the Uno side.' },
      { a: 'uno.GND', b: 'btn.GND', color: 'black', why: 'Ground for the button, so its OUT pin rests at a clean LOW.' },
      { a: 'btn.OUT', b: 'uno.D2', color: 'yellow', why: 'The Uno reads the button here: HIGH while pressed.' },
      { a: 'nano.D9', b: 'led.SIG', color: 'green', why: 'On the other side, the Nano drives the LED from D9.' },
      { a: 'nano.GND', b: 'led.GND', color: 'black', why: 'The LED\'s return path to the Nano.' },
      { a: 'uno.GND', b: 'nano.GND', color: 'black', why: 'The most forgotten wire in electronics: without a shared ground the Nano cannot tell what the Uno\'s voltages mean.' },
      { a: 'uno.D1 / TX', b: 'nano.RX0', color: 'orange', why: 'The Uno talks on TX and the Nano listens on RX — "talk" always goes to "listen".' },
      { a: 'nano.TX1', b: 'uno.D0 / RX', color: 'blue', why: 'And the other way round for the reply: Nano TX into Uno RX, so the two data wires cross.' },
    ],
    code: [
      { title: 'Uno — sender', lang: 'cpp', src: code`// UNO: sends '1' or '0' whenever
// the button changes
const int BUTTON_PIN = 2;
int lastState = LOW;

void setup() {
  pinMode(BUTTON_PIN, INPUT);
  pinMode(LED_BUILTIN, OUTPUT);
  // UART on D1 (TX) and D0 (RX)
  Serial.begin(9600);
}

void loop() {
  int state = digitalRead(BUTTON_PIN);
  if (state != lastState) {
    lastState = state;
    Serial.write(state ? '1' : '0');
    // skip the contact bounce
    delay(20);
  }

  // the Nano confirms: 'Y' or 'N'
  if (Serial.available()) {
    char reply = Serial.read();
    bool on = (reply == 'Y');
    digitalWrite(LED_BUILTIN, on);
  }
}` },
      { title: 'Nano — receiver', lang: 'cpp', src: code`// NANO: obeys the byte, then
// answers 'Y' or 'N'
const int LED_PIN = 9;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  // same speed as the Uno!
  Serial.begin(9600);
}

void loop() {
  if (Serial.available()) {
    char c = Serial.read();
    if (c == '1') {
      digitalWrite(LED_PIN, HIGH);
      Serial.write('Y');
    }
    if (c == '0') {
      digitalWrite(LED_PIN, LOW);
      Serial.write('N');
    }
  }
}` },
    ],
    run(sim) {
      let last = false;
      sim.set('led', { on: false, level: 1 });
      sim.set('uno', { led: false });
      sim.log('uno', 'UART ready, 9600 baud');
      sim.log('nano', 'UART ready, 9600 baud');
      sim.loop(() => {
        const pressed = !!sim.get('btn').pressed;
        if (pressed === last) return;
        last = pressed;
        const byte = pressed ? '1' : '0', reply = pressed ? 'Y' : 'N';
        sim.log('uno', `TX -> '${byte}' (button ${pressed ? 'down' : 'up'})`);
        sim.after(4, () => {                             // a byte takes about 1 ms at 9600 baud
          sim.set('led', { on: pressed, level: 1 });
          sim.log('nano', `RX <- '${byte}' LED ${pressed ? 'on' : 'off'}`);
          sim.log('nano', `TX -> '${reply}'`);
        });
        sim.after(8, () => {
          sim.set('uno', { led: pressed });
          sim.log('uno', `RX <- '${reply}' (LED is ${pressed ? 'on' : 'off'})`);
        });
      });
    },
    success: 'Each press makes the Uno push one byte out of TX; a millisecond later it arrives on the Nano\'s RX, the Nano switches its LED and answers \'Y\' or \'N\', which lights the Uno\'s own "L" LED as a receipt. '
      + 'It only works because the data wires cross and the grounds are joined — and on real boards, unplug D0/D1 while uploading, because USB uses the same two pins.',
    watch: 'Hold the button and read the Serial tab: the byte leaves the Uno as TX and shows up on the Nano as RX. The "L" LED on the Uno confirms the reply.',
  },

  // ─────────────────────────────────────────────── 8 ───────────────────────────────────────────────
  {
    id: 'level-shift',
    title: '5 V meets 3.3 V',
    level: 'Intermediate',
    minutes: 10,
    goal: 'Let a 5 V Uno command a 3.3 V ESP32 safely, through a level shifter.',
    intro: 'Here is a trap that has killed many an ESP32: the Uno speaks with 5 V signals, but an ESP32 pin is only built for 3.3 V. Wire them straight together and the ESP32 may not survive. '
      + 'The fix is a little translator board — a logic level shifter — sitting between them.',
    learn: [
      'An ESP32 pin must never see more than 3.3 V (3.6 V is the absolute limit) — a 5 V output can destroy it',
      'A level shifter translates each signal between the two voltages, in both directions',
      'It needs both supplies as references — 5 V on HV, 3.3 V on LV — plus one common ground',
      'Going up is less critical (an Uno already reads 3.3 V as HIGH), but shifting both ways is the clean habit',
    ],
    parts: [
      { ref: 'uno', type: 'board:uno', x: -115, y: 0, rot: 0 },
      { ref: 'shifter', type: 'mod:level-shifter', x: -20, y: 0, rot: 0 },
      { ref: 'esp', type: 'board:esp32', x: 80, y: -20, rot: 0 },
      { ref: 'led', type: 'mod:led', opts: { color: 'red' }, x: 80, y: 60, rot: 0 },
    ],
    wires: [
      { a: 'uno.5V', b: 'shifter.HV', color: 'red', why: 'HV is the reference for the high-voltage side: it tells the shifter that HIGH means 5 V over here.' },
      { a: 'esp.3V3', b: 'shifter.LV', color: 'red', why: 'LV is the reference for the low side — the ESP32\'s own 3.3 V, so signals on this side never go higher.' },
      { a: 'uno.GND', b: 'shifter.GND', color: 'black', why: 'Ground from the Uno…' },
      { a: 'esp.GND', b: 'shifter.GND', color: 'black', why: '…and ground from the ESP32: now all three boards agree on where 0 V is.' },
      { a: 'uno.D1 / TX', b: 'shifter.HV1', color: 'yellow', why: 'The Uno\'s 5 V TX signal goes into channel 1 on the high side.' },
      { a: 'shifter.LV1', b: 'esp.RX2', color: 'yellow', why: 'The same signal leaves LV1 at a safe 3.3 V and enters the ESP32\'s RX2 (GPIO16).' },
      { a: 'esp.TX2', b: 'shifter.LV2', color: 'green', why: 'The ESP32 answers on TX2 (GPIO17) into channel 2 on the low side.' },
      { a: 'shifter.HV2', b: 'uno.D0 / RX', color: 'green', why: 'Channel 2 lifts the reply to 5 V for the Uno\'s RX — and notice it again: TX goes to RX.' },
      { a: 'esp.D4', b: 'led.SIG', color: 'blue', why: 'GPIO4 switches the LED when a command arrives; 3.3 V is plenty for a red LED.' },
      { a: 'esp.GND', b: 'led.GND', color: 'black', why: 'The LED\'s return path — the ESP32 has a second GND pin for it.' },
    ],
    code: [
      { title: 'Uno — commander (5 V)', lang: 'cpp', src: code`// UNO: sends "ON" / "OFF" once a
// second as 5 V pulses on TX
bool lampOn = false;

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  // UART on D1 (TX) and D0 (RX)
  Serial.begin(9600);
}

void loop() {
  lampOn = !lampOn;
  Serial.println(lampOn ? "ON" : "OFF");

  // give the ESP32 time to answer
  delay(100);
  if (Serial.available()) {
    String r = Serial.readStringUntil('\n');
    r.trim();
    bool ok = (r == "OK ON");
    digitalWrite(LED_BUILTIN, ok);
  }
  delay(900);
}` },
      { title: 'ESP32 — listener (3.3 V)', lang: 'cpp', src: code`// ESP32: obeys, then answers "OK"
const int LED_PIN = 4;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  // USB serial monitor
  Serial.begin(115200);
  // UART2: RX2 = 16, TX2 = 17
  Serial2.begin(9600, SERIAL_8N1, 16, 17);
}

void loop() {
  if (Serial2.available()) {
    String c = Serial2.readStringUntil('\n');
    c.trim();
    if (c == "ON") {
      digitalWrite(LED_PIN, HIGH);
    }
    if (c == "OFF") {
      digitalWrite(LED_PIN, LOW);
    }
    // reply to the Uno
    Serial2.println("OK " + c);
    Serial.println("got " + c);
  }
}` },
    ],
    run(sim) {
      let lampOn = false;
      sim.set('led', { on: false, level: 1 });
      sim.set('uno', { led: false });
      sim.log('esp', 'Serial2 ready: RX2=16, TX2=17');
      const send = () => {
        lampOn = !lampOn;
        const on = lampOn, command = on ? 'ON' : 'OFF';
        sim.log('uno', `TX -> "${command}" at 5 V`);
        sim.after(8, () => {
          sim.set('led', { on, level: 1 });
          sim.log('esp', `RX2 <- "${command}" at 3.3 V, LED ${on ? 'on' : 'off'}`);
          sim.log('esp', `TX2 -> "OK ${command}"`);
        });
        sim.after(100, () => {
          sim.set('uno', { led: on });
          sim.log('uno', `RX <- "OK ${command}" at 5 V`);
        });
      };
      send();
      sim.every(1000, send);
    },
    success: 'The Uno\'s TX swings between 0 and 5 V, but what reaches the ESP32 is the same message at 0–3.3 V — the shifter\'s tiny transistors use the HV and LV pins as their yardsticks — and the reply comes back through channel 2 at 5 V. '
      + 'Same UART rules as before (TX to RX, shared ground), plus one new one: never feed a 5 V signal straight into a 3.3 V pin.',
    watch: 'Follow one command in the Serial tab: "ON" leaves the Uno at 5 V, reaches the ESP32 at 3.3 V, and "OK ON" comes back.',
  },

  // ─────────────────────────────────────────────── 9 ───────────────────────────────────────────────
  {
    id: 'i2c-display',
    title: 'Pico weather screen',
    level: 'Intermediate',
    minutes: 8,
    goal: 'Show live temperature and humidity on an OLED with a Raspberry Pi Pico.',
    intro: 'Time to give a project a face. A Raspberry Pi Pico running MicroPython reads a DHT11 climate sensor and prints the numbers on a tiny OLED screen. '
      + 'The screen talks I²C — a clever bus where two signal wires are enough for a whole chain of devices.',
    learn: [
      'I²C needs only two signal wires — SDA (data) and SCL (clock) — and every device on the bus has its own address',
      'The OLED answers at address 0x3C (60 in decimal); i2c.scan() lists everyone who is connected',
      'The Pico is a 3.3 V board: power the modules from 3V3(OUT) so their pull-up resistors never push 5 V into a pin',
      'A DHT11 is slow and coarse: one reading a second, whole degrees, about ±2 °C',
    ],
    parts: [
      { ref: 'pico', type: 'board:pico', x: 0, y: 40, rot: 0 },
      { ref: 'oled', type: 'mod:oled', x: -45, y: -40, rot: 0 },
      { ref: 'dht', type: 'mod:dht11', x: 45, y: -40, rot: 0 },
    ],
    wires: [
      { a: 'pico.3V3(OUT)', b: 'oled.VCC', color: 'red', why: 'The display runs on 3.3 V — and its pull-up resistors then hold SDA and SCL at 3.3 V, which is all a Pico pin tolerates.' },
      { a: 'pico.GND', b: 'oled.GND', color: 'black', why: 'Ground for the display; the Pico has GND pins all along both edges, pick any.' },
      { a: 'pico.GP4', b: 'oled.SDA', color: 'blue', why: 'SDA carries the data bits; GP4 is one of the pins that can be SDA of I²C bus 0.' },
      { a: 'pico.GP5', b: 'oled.SCL', color: 'yellow', why: 'SCL is the clock: the Pico ticks it so both sides know when to read each bit.' },
      { a: 'pico.3V3(OUT)', b: 'dht.VCC', color: 'red', why: 'The DHT11 is happy on 3.3 V too, so its data line stays at a level that is safe for the Pico.' },
      { a: 'pico.GND', b: 'dht.GND', color: 'black', why: 'Ground for the sensor.' },
      { a: 'dht.DATA', b: 'pico.GP15', color: 'green', why: 'One wire carries both temperature and humidity as a train of 40 carefully timed pulses.' },
    ],
    code: { lang: 'python', src: code`# Raspberry Pi Pico, MicroPython.
# Add the "ssd1306" package in
# Thonny before you run this.
from machine import Pin, I2C
from ssd1306 import SSD1306_I2C
import dht, time

# I2C bus 0: SDA = GP4, SCL = GP5
i2c = I2C(0, sda=Pin(4), scl=Pin(5))
# prints [60]: the OLED at 0x3C
print("I2C scan:", i2c.scan())

oled = SSD1306_I2C(128, 64, i2c)
# DHT11 data wire on GP15
sensor = dht.DHT11(Pin(15))
# on-board LED
led = Pin(25, Pin.OUT)

while True:
    led.on()
    sensor.measure()
    t = sensor.temperature()
    h = sensor.humidity()
    led.off()

    # draw into memory...
    oled.fill(0)
    oled.text("Pico weather", 0, 0)
    oled.text("Temp: %d C" % t, 0, 24)
    oled.text("Hum:  %d %%" % h, 0, 40)
    # ...then send it over I2C
    oled.show()

    print("T = %d C  H = %d %%" % (t, h))
    # DHT11: one reading a second
    time.sleep(1)` },
    run(sim) {
      sim.log('pico', 'I2C scan: [60]');
      const measure = () => {
        const s = sim.get('dht');
        const t = Math.round(num(s.temp, 24)), h = Math.round(num(s.hum, 45));
        sim.set('pico', { led: true });
        sim.after(60, () => sim.set('pico', { led: false }));
        sim.set('oled', { lines: ['Pico weather', '', `Temp: ${t} C`, `Hum:  ${h} %`] });
        sim.log('pico', `T = ${t} C  H = ${h} %`);
      };
      measure();
      sim.every(1000, measure);
    },
    success: 'Once a second the Pico asks the DHT11 for a reading over its single data wire, then redraws the screen: it paints the text into memory and oled.show() ships all 128 × 64 pixels down SDA while SCL keeps the beat. '
      + 'Because everything is powered from 3V3(OUT), no wire in this circuit ever carries more than 3.3 V.',
    watch: 'Move the "Air temperature" slider: the OLED catches up within a second — that small lag is the pace of the real sensor.',
  },

  // ─────────────────────────────────────────────── 10 ───────────────────────────────────────────────
  {
    id: 'wifi-node',
    title: 'Wi-Fi weather node',
    level: 'Advanced',
    minutes: 10,
    goal: 'Build an IoT node: a NodeMCU reads the climate, shows it as a colour and "posts" it over Wi-Fi.',
    intro: 'This is what the "Internet of Things" looks like up close: a NodeMCU with an ESP8266 Wi-Fi chip, one sensor and one RGB LED. It measures the room, shows the result as a colour — blue for cold, green for comfy, red for hot — and reports to a server. '
      + 'Our bench has no real network, so the Wi-Fi part is simulated.',
    learn: [
      'The ESP8266 has Wi-Fi built in — that is what turns a microcontroller into an IoT node',
      'It is a 3.3 V chip: sensors hang on the 3V3 pin, never on Vin (that one carries 5 V from USB)',
      'Not every pin is free: D3, D4 and D8 decide how the chip boots, so we use D2, D5, D6 and D7',
      'An IoT node repeats one loop forever: measure → show → send',
    ],
    parts: [
      { ref: 'node', type: 'board:nodemcu', x: 0, y: -35, rot: 0 },
      { ref: 'dht', type: 'mod:dht11', x: -55, y: 45, rot: 0 },
      { ref: 'rgb', type: 'mod:rgb', x: 55, y: 45, rot: 0 },
    ],
    wires: [
      { a: 'node.3V3', b: 'dht.VCC', color: 'red', why: 'Power the DHT11 from 3V3 so its data line can never rise above what the ESP8266 tolerates.' },
      { a: 'node.GND', b: 'dht.GND', color: 'black', why: 'Ground for the sensor.' },
      { a: 'dht.DATA', b: 'node.D2 · GPIO4', color: 'yellow', why: 'D2 (GPIO4) has no job during boot — a safe pin for a sensor.' },
      { a: 'node.D5 · GPIO14', b: 'rgb.R', color: 'orange', why: 'D5 switches the red chip inside the RGB LED.' },
      { a: 'node.D6 · GPIO12', b: 'rgb.G', color: 'green', why: 'D6 switches the green chip.' },
      { a: 'node.D7 · GPIO13', b: 'rgb.B', color: 'blue', why: 'D7 switches the blue chip — at 3.3 V the colours are a little dimmer than on a 5 V board, but easy to see.' },
      { a: 'node.GND', b: 'rgb.GND', color: 'black', why: 'All three colours share this one ground pin (a "common cathode" LED).' },
    ],
    code: { lang: 'cpp', src: code`// NodeMCU (ESP8266), Arduino IDE.
// Needs the "DHT sensor library".
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <DHT.h>

const char* WIFI_NAME = "RobotLab";
const char* WIFI_PASS = "your-password";
// the computer collecting the data
const char* SERVER = "192.168.1.10";

// DHT11 data wire on D2 (GPIO4)
DHT dht(D2, DHT11);
const int RED = D5;
const int GREEN = D6;
const int BLUE = D7;
int count = 0;

void color(bool r, bool g, bool b) {
  digitalWrite(RED, r);
  digitalWrite(GREEN, g);
  digitalWrite(BLUE, b);
}

void setup() {
  Serial.begin(115200);
  pinMode(RED, OUTPUT);
  pinMode(GREEN, OUTPUT);
  pinMode(BLUE, OUTPUT);
  // on-board LED: LOW = on
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, HIGH);
  dht.begin();

  Serial.println("Connecting...");
  WiFi.begin(WIFI_NAME, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
  Serial.print("Connected, IP ");
  Serial.println(WiFi.localIP());
}

void loop() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (isnan(t) || isnan(h)) {
    Serial.println("DHT11 not found");
    delay(2000);
    return;
  }

  // cold: blue, comfy: green, hot: red
  if (t < 18) color(0, 0, 1);
  else if (t <= 26) color(0, 1, 0);
  else color(1, 0, 0);

  Serial.printf("T = %.0f C  H = %.0f %%\n",
                t, h);

  // every third reading goes online
  count++;
  if (count % 3 == 0) {
    String body = "{\"temp\":";
    body += String(t, 0);
    body += ",\"hum\":";
    body += String(h, 0);
    body += "}";

    WiFiClient client;
    HTTPClient http;
    digitalWrite(LED_BUILTIN, LOW);
    http.begin(client, SERVER, 8000,
               "/readings");
    http.addHeader("Content-Type",
                   "application/json");
    int status = http.POST(body);
    http.end();
    digitalWrite(LED_BUILTIN, HIGH);

    Serial.print("POST ");
    Serial.print(body);
    Serial.print(" -> ");
    Serial.println(status);
  }
  // a DHT11 is slow: wait 2 s
  delay(2000);
}` },
    run(sim) {
      let count = 0;
      const color = (r, g, b) => sim.set('rgb', { r, g, b });
      const measure = () => {
        const s = sim.get('dht');
        const t = Math.round(num(s.temp, 24)), h = Math.round(num(s.hum, 45));
        if (t < 18) color(0, 0, 1);
        else if (t <= 26) color(0, 1, 0);
        else color(1, 0, 0);
        sim.log('node', `T = ${t} C  H = ${h} %`);
        count++;
        if (count % 3 === 0) {
          sim.set('node', { led: true });
          sim.after(250, () => {
            sim.set('node', { led: false });
            sim.log('node', `POST {"temp":${t},"hum":${h}} -> 200 (simulated)`);
          });
        }
      };
      color(0, 0, 0);
      sim.set('node', { led: false });
      sim.log('node', 'Wi-Fi is simulated on this bench');
      sim.log('node', 'Connecting...');
      sim.after(1500, () => {
        sim.log('node', 'Connected, IP 192.168.1.42 (simulated)');
        measure();
        sim.every(2000, measure);
      });
    },
    success: 'Every two seconds the NodeMCU reads the DHT11, picks a colour (below 18 °C blue, up to 26 °C green, above that red) and prints the numbers. Every third reading it packs them into a little JSON message and POSTs it to a server — '
      + 'here that part is only pretended, but on a real board the very same sketch would send real data across your Wi-Fi.',
    watch: 'Drag "Air temperature" below 18 °C and above 26 °C: the colour changes at the next reading, two seconds at most.',
  },

  // ─────────────────────────────────────────────── 11 ───────────────────────────────────────────────
  {
    id: 'robot-brain',
    title: 'Robot: brain and muscle',
    level: 'Advanced',
    minutes: 15,
    goal: 'A Raspberry Pi 4 sends drive commands to an Arduino Mega, which runs two motors through an L298N.',
    intro: 'This is how real robots are built. A Raspberry Pi is the brain: a full Linux computer that can plan a route or run a camera. An Arduino Mega is the muscle: it reacts in microseconds and never gets distracted. '
      + 'The Pi sends one-letter commands down a serial wire, and the Mega turns them into motor power through an L298N driver.',
    learn: [
      'Real robots split the work: a computer plans, a microcontroller controls the motors in real time',
      'A motor driver (an H-bridge) lets tiny logic signals switch big motor currents — and reverse them',
      'Motors get their own battery, but every ground is tied together so all signals share one 0 V',
      'A 3.3 V TX into a 5 V Arduino RX works fine; the 5 V TX must never go back into the Pi',
    ],
    parts: [
      { ref: 'mega', type: 'board:mega', x: -100, y: -50, rot: 0 },
      { ref: 'pi', type: 'board:rpi4', x: 40, y: -50, rot: 0 },
      { ref: 'battery', type: 'mod:battery', x: -145, y: 60, rot: 0 },
      { ref: 'driver', type: 'mod:motor-driver', x: -60, y: 60, rot: 0 },
      { ref: 'motorL', type: 'mod:motor', x: 25, y: 60, rot: 0 },
      { ref: 'motorR', type: 'mod:motor', x: 130, y: 60, rot: 0 },
    ],
    wires: [
      { a: 'battery.+', b: 'driver.12V', color: 'red', why: 'Motor power: the 6 V pack feeds the driver\'s motor-supply terminal (it is labelled 12V, but 6 V is fine for these small motors).' },
      { a: 'battery.-', b: 'driver.GND', color: 'black', why: 'Battery minus goes to the driver\'s ground terminal.' },
      { a: 'mega.GND', b: 'driver.GND', color: 'black', why: 'Common ground: without it the driver cannot tell the Mega\'s HIGH from its LOW.' },
      { a: 'mega.5V', b: 'driver.5V', color: 'red', why: 'Logic power for the L298N chip — 6 V is too little for the driver\'s own regulator, so we lend it the Mega\'s 5 V (on a real board, pull the 5V-EN jumper first).' },
      { a: 'mega.D10', b: 'driver.ENA', color: 'green', why: 'ENA is the throttle of motor A: PWM on pin 10 sets how fast it turns (remove the ENA jumper on a real board).' },
      { a: 'mega.D9', b: 'driver.IN1', color: 'yellow', why: 'IN1 and IN2 choose motor A\'s direction: HIGH/LOW spins one way…' },
      { a: 'mega.D8', b: 'driver.IN2', color: 'orange', why: '…LOW/HIGH spins the other way, and LOW/LOW lets it stop.' },
      { a: 'mega.D7', b: 'driver.IN3', color: 'blue', why: 'IN3 and IN4 do the same job for motor B.' },
      { a: 'mega.D6', b: 'driver.IN4', color: 'purple', why: 'The second direction pin of motor B.' },
      { a: 'mega.D5', b: 'driver.ENB', color: 'white', why: 'ENB is the PWM throttle of motor B — pin 5 is PWM-capable too.' },
      { a: 'driver.OUT1', b: 'motorL.M+', color: 'orange', why: 'OUT1 and OUT2 are the beefy outputs for motor A — here the left wheel.' },
      { a: 'driver.OUT2', b: 'motorL.M-', color: 'blue', why: 'The left motor\'s second lead: swap these two and the wheel turns the other way.' },
      { a: 'driver.OUT3', b: 'motorR.M+', color: 'orange', why: 'OUT3 and OUT4 power motor B — the right wheel.' },
      { a: 'driver.OUT4', b: 'motorR.M-', color: 'blue', why: 'The right motor\'s second lead.' },
      { a: 'pi.GND', b: 'mega.GND', color: 'black', why: 'Brain and muscle need the same 0 V reference before they can talk.' },
      { a: 'pi.GPIO14', b: 'mega.D19 / RX1', color: 'yellow', why: 'The Pi\'s TXD (GPIO14) feeds the Mega\'s RX1. One-way on purpose: 3.3 V is safe for a 5 V input, but the Mega\'s 5 V TX would damage the Pi.' },
    ],
    code: [
      { title: 'Raspberry Pi — brain (Python)', lang: 'python', src: code`# RASPBERRY PI 4: the brain.
# Enable the serial port first:
# raspi-config > Interface Options
import serial, time

# UART on GPIO14 (TXD), 9600 baud
link = serial.Serial("/dev/serial0",
                     9600)

ROUTE = [
    ("F", 2.0),  # forward
    ("L", 1.0),  # spin left
    ("F", 2.0),  # forward
    ("R", 1.0),  # spin right
    ("B", 2.0),  # back up
    ("S", 2.0),  # stop
]

while True:
    for cmd, seconds in ROUTE:
        # one byte down the wire
        link.write(cmd.encode())
        print("sent", cmd)
        time.sleep(seconds)` },
      { title: 'Arduino Mega — muscle (C++)', lang: 'cpp', src: code`// ARDUINO MEGA: the muscle.
// left motor: ENA (PWM), IN1, IN2
const int ENA = 10, IN1 = 9, IN2 = 8;
// right motor: IN3, IN4, ENB (PWM)
const int IN3 = 7, IN4 = 6, ENB = 5;

// speed: -255 ... 255
void motor(int en, int a, int b,
           int speed) {
  // direction
  digitalWrite(a, speed > 0);
  digitalWrite(b, speed < 0);
  // throttle
  analogWrite(en, abs(speed));
}

void drive(int left, int right) {
  motor(ENA, IN1, IN2, left);
  motor(ENB, IN3, IN4, right);
  Serial.print("L = ");
  Serial.print(left);
  Serial.print(" R = ");
  Serial.println(right);
}

void setup() {
  for (int p = 5; p <= 10; p++) {
    pinMode(p, OUTPUT);
  }
  // USB serial monitor
  Serial.begin(115200);
  // RX1 = pin 19: from the Pi
  Serial1.begin(9600);
  drive(0, 0);
}

void loop() {
  if (Serial1.available()) {
    char c = Serial1.read();
    Serial.print("got ");
    Serial.print(c);
    Serial.print(": ");
    if (c == 'F') drive(200, 200);
    if (c == 'B') drive(-160, -160);
    if (c == 'L') drive(-150, 150);
    if (c == 'R') drive(150, -150);
    if (c == 'S') drive(0, 0);
  }
}` },
    ],
    run(sim) {
      const ROUTE = [['F', 2.0], ['L', 1.0], ['F', 2.0], ['R', 1.0], ['B', 2.0], ['S', 2.0]];
      const MOVES = { F: [200, 200, 'forward'], B: [-160, -160, 'back up'], L: [-150, 150, 'spin left'], R: [150, -150, 'spin right'], S: [0, 0, 'stop'] };
      const drive = (left, right) => {
        sim.set('motorL', { speed: left / 255 });
        sim.set('motorR', { speed: right / 255 });
      };
      sim.set('driver', { on: true });
      drive(0, 0);
      sim.log('mega', 'L = 0 R = 0');
      let i = 0;
      const step = () => {
        const [command, seconds] = ROUTE[i];
        const [left, right, name] = MOVES[command];
        i = (i + 1) % ROUTE.length;
        sim.set('pi', { led: true });
        sim.after(120, () => sim.set('pi', { led: false }));
        sim.log('pi', `sent ${command} (${name})`);
        sim.after(5, () => {
          drive(left, right);
          sim.log('mega', `got ${command}: L = ${left} R = ${right}`);
        });
        sim.after(seconds * 1000, step);
      };
      sim.after(600, step);
    },
    success: 'The Pi sends one letter at a time; the Mega catches it on RX1 and sets six pins — IN1–IN4 choose each motor\'s direction, PWM on ENA / ENB sets the speed — and the L298N copies that pattern onto the motors with battery power. '
      + 'Same direction on both wheels drives straight, opposite directions spin the robot on the spot.',
    watch: 'Watch the wheels: forward, spin left, forward, spin right, back up, stop — then again. Match each "sent" line with a "got" line.',
  },
];
