// A few quick questions before a design build. When the person sends what a new board should do, Etch asks what the
// text leaves open (power, size, a microcontroller, debugging aids: views.py clarify(), rules only), one card at a
// time in the dock, with its own pick already chosen and a one-line reason under each question. Their answers fold
// into the request (views.py fold(), ported here), and that text is what gets built. No questions, an error, or no
// reply within 1.5 s: the request is built exactly as typed and nothing extra shows. Skip on any card ends the
// questions and keeps the answers so far (Skip on the first sends the text as typed). Nothing advances on a timer.
//
//   const text = await clarifyFlow({ text, level: getLevel(), api, dock, onProgress })   -> the text to build, or
//                                    null when a newer message cancelled it (that message becomes the request)
//   prefetchClarify({ text, level, api })   fire the request early (the moment the person presses Build, so the
//                                    questions are usually back before the start screen has melted into the dock)
//   cancelClarify()                  a new message while a card waits: settle the cards as skipped, drop late answers
//   LEVELS, getLevel(), setLevel(v)  how much Etch asks: beginner (2 questions at most), hobbyist (3), expert (1);
//                                    kept in localStorage "etch-xp"
//   fold(text, adds, cap = 400)      the request with the chosen fragments appended, under the backend's text cap
export const LEVELS = ["beginner", "hobbyist", "expert"];
const KEY = "etch-xp", WAIT_MS = 1500, GAP_MS = 120, LOADER_MS = 250, SETTLE_MS = 600;

export function getLevel() {
  try { const v = localStorage.getItem(KEY); return LEVELS.includes(v) ? v : "hobbyist"; } catch (e) { return "hobbyist"; }
}
export function setLevel(v) {
  if (!LEVELS.includes(v)) return getLevel();
  try { localStorage.setItem(KEY, v); } catch (e) { /* not kept: the default comes back next time */ }
  return v;
}

// views.py fold(): strip the trailing ".", then ", " + each fragment the text doesn't already say, stopping before the
// cap. The typed text itself is never cut.
export function fold(text, adds, cap = 400) {
  let t = String(text || "").replace(/\s+/g, " ").trim().replace(/\.+$/, "");
  for (const x of adds || []) {
    const a = String(x || "").trim();
    if (!a || t.toLowerCase().includes(a.toLowerCase())) continue;
    const next = t ? `${t}, ${a}` : a;
    if (next.length > cap) break;
    t = next;
  }
  return t;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keyOf = (text, level) => `${level}\n${String(text || "").replace(/\s+/g, " ").trim()}`;
let early = null;   // { key, at, p } from prefetchClarify
let active = 0;     // bumped by every flow and by cancelClarify: an older flow sees it and stops
let live = null;    // { dock, id } of the card waiting now

export function prefetchClarify({ text, level = getLevel(), api }) {
  if (!api?.clarify || !String(text || "").trim()) return;
  const key = keyOf(text, level);
  if (early?.key === key) return;
  early = { key, at: performance.now(), p: Promise.resolve().then(() => api.clarify(text, level)).catch(() => null) };
}

export function cancelClarify() {
  active++;
  if (live) { live.dock?.cancelAsk?.(live.id); live = null; }
}
export const isClarifying = () => !!live;

export async function clarifyFlow({ text, level = getLevel(), api, dock, onProgress } = {}) {
  cancelClarify();
  const me = active, alive = () => me === active;
  const typed = String(text || "");
  if (!typed.trim() || !api?.clarify || !dock?.ask) return typed;
  // the request: the early one when it was for this text, else now; either way at most 1.5 s from when it went out
  const key = keyOf(typed, level);
  const req = early?.key === key ? early : { at: performance.now(), p: Promise.resolve().then(() => api.clarify(typed, level)).catch(() => null) };
  early = null;
  dock.setState?.("heard");
  const loaderT = setTimeout(() => { if (alive()) dock.loader?.(true, "Reading your idea"); }, LOADER_MS);
  const res = await Promise.race([req.p, sleep(Math.max(0, WAIT_MS - (performance.now() - req.at))).then(() => null)]);
  clearTimeout(loaderT);
  dock.loader?.(false);
  if (!alive()) return null;
  const qs = (res && Array.isArray(res.questions) ? res.questions : []).filter((q) => q && q.question && Array.isArray(q.options) && q.options.length);
  if (!qs.length) return typed;

  // the person just pressed Build, so the dock may open for the questions (it goes back to a pill afterwards)
  const n = qs.length;
  dock.expand?.(true, { force: true });
  dock.setStatus?.(`${n} quick question${n === 1 ? "" : "s"}`);
  const adds = [];
  let answered = 0;
  for (let i = 0; i < n; i++) {
    if (i) await sleep(GAP_MS);
    if (!alive()) return null;
    const q = qs[i];
    const options = q.options.map((o) => ({ value: o.label, label: o.label, detail: o.detail || "", recommended: !!o.recommended }));
    const rec = options.find((o) => o.recommended);
    const id = `clarify:${me}:${q.id || i}`;
    live = { dock, id };
    const ans = await dock.ask({
      id, question: q.question, options, multi: false, why: q.why || "",
      picked: rec ? [rec.value] : [], kicker: `Quick question · ${i + 1} of ${n}`, goLabel: i === n - 1 ? "Build it" : "Continue", focus: true,
    }).catch(() => null);
    if (live?.id === id) live = null;
    if (!alive()) return null;
    const label = Array.isArray(ans) ? ans[0] : ans && typeof ans === "object" ? ans.label ?? ans.value : ans;
    if (label == null) break; // Skip: no more questions, the answers so far stand
    const opt = q.options.find((o) => o.label === label);
    if (opt?.add) adds.push(opt.add);
    answered++;
    dock.emote?.("nod");
    onProgress?.({ index: i, total: n, id: q.id, answer: label, text: fold(typed, adds) });
  }
  dock.setStatus?.("");
  // a beat after the last card the dock drains back into its pill, so the stage's build loader shows
  setTimeout(() => { if (alive()) dock.expand?.(false); }, SETTLE_MS);
  return answered ? fold(typed, adds) : typed;
}
