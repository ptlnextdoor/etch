// "Make it": everything a fab needs, checked. A white card in the stage's right corner (the inspector's big sibling,
// a bottom sheet on phones) with the board's size and numbers, every check Etch ran on it ticking in, a rough
// bare-board price with its working shown, and the files: Download fab files (the KiCad project, Gerbers, drill and
// BOM from /etch/export.zip, once /etch/export says the checks pass), Copy BOM, the KiCad project, the 3D model.
// An Etch build (live-*) gets all of it from GET /etch/stats and GET /etch/export, run together when the sheet opens;
// the results tick in 90 ms apart in list order (the pace is the only thing made up). A library board (gh:) has no
// stats: its size and parts come from meta.json and parts.json, its checks are one muted line, the primary button
// takes the KiCad project from GitHub at the pinned commit, and the price is worked out here with views.py's numbers.
// With ?mock=1 (no engine) the demo build's numbers stand in for any board, the way api.view does. A new board, one
// still building, or a .glb opened from a file has no sheet: the top-bar button is disabled and says why.
//
//   const sheet = createMakeSheet(stage, { api, board, viewer, download(path, name), toast(text), change(text),
//     mini: (hostEl, pcb2d) => void | null, glbHref: () => url | null });
//   sheet.bind(buttonEl)   the top-bar button: click or M toggles; its 7px dot and title say how the checks went
//   sheet.refresh()        the board changed (loaded, rebuilt, building, opened from a file): repaint, reload if open
//   sheet.open() / close() / toggle(), sheet.isOpen
import { h } from "../common.js";
import { ic } from "./icons.js";
import { spring, reducedMotion, clamp } from "../ui/spring.js";
import { squish } from "../ui/goo.js";
import { taskRow, icon, stagger, plainError } from "../ui/trace.js";

const OPEN = { stiffness: 300, damping: 24 }, OPEN_PHONE = { stiffness: 260, damping: 26 };
const FIRST_TICK = 260, TICK = 90;
const PHONE = matchMedia("(max-width: 768px)");
// the numbers grid, two pairs to a row (one on phones)
const NUMS = [["parts", "Parts"], ["nets", "Nets"], ["smd", "Surface-mount"], ["tht", "Through-hole"], ["pads", "Pads"], ["vias", "Vias"], ["tracks", "Tracks"], ["track_mm", "Track length"], ["holes", "Holes"]];
// what a check's value counts, by check id
const UNITS = { erc: ["error", "errors"], drc: ["violation", "violations"], unconnected: ["left", "left"], parity: ["mismatch", "mismatches"] };

const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const usd = (v) => "$" + (+v || 0).toFixed(2);
const mm1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const fmtNum = (v) => { const a = Math.abs(v); return a >= 100 ? String(Math.round(v)) : a >= 10 ? v.toFixed(1).replace(/\.0$/, "") : v.toFixed(2).replace(/\.?0+$/, ""); };
const byRef = (a, b) => String(a).localeCompare(String(b), "en", { numeric: true });
const typing = () => { const a = document.activeElement; return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable); };

// views.py estimate(): a flat price for five boards up to 100 × 100 mm, then by area; four layers cost about four times two
export function estimate(w, hh, layers = 2, qty = 5) {
  const area = Math.max(0, w * hh) / 100, two = layers <= 2;
  const boards = ((two ? 2 : 8) + Math.max(0, area - 100) * (two ? 0.035 : 0.12)) * Math.max(1, qty) / 5;
  return { qty, boards_usd: Math.round(boards * 100) / 100, each_usd: Math.round((boards / Math.max(1, qty)) * 100) / 100, area_cm2: Math.round(area * 10) / 10 };
}
// a check's detail line from its value: "0 errors", "none missing", "Your check · measured 6"
function detailOf(c) {
  const v = c.value, num = typeof v === "number" && isFinite(v) ? v : null;
  let d;
  if (c.ok == null) d = "Couldn't measure";
  else if (c.ok === false && typeof v === "string") {
    // a tool's own message: its plain first line, or a plain sentence when that says nothing ("ngspice")
    const p = plainError(v.replace(/^[\w.-]+:\s+/, ""));
    d = p.length > 16 && !/^error\b/i.test(p) ? p : "Stopped on an error";
  }
  else if (c.id === "models" && num != null) d = num ? `${num} missing` : "none missing";
  else if (UNITS[c.id] && num != null) d = `${num} ${UNITS[c.id][num === 1 ? 0 : 1]}`;
  else if (c.id === "sim") d = v == null || v === "ok" ? "" : String(v);
  else if (num != null) d = c.id === "bench" ? `Measured ${fmtNum(num)}` : String(num);
  else d = v == null ? "" : String(v);
  if (c.id === "bench" && c.by && c.by !== "agent") d = d ? `Your check · ${lc(d)}` : "Your check";
  return d;
}
// one BOM line per value + footprint, refs in board order (C2 before C10)
function bomLines(parts) {
  const g = new Map();
  for (const [k, p] of Object.entries(parts || {})) {
    const ref = String(p?.ref || k);
    if (!ref || ref.startsWith("#")) continue;
    const value = String(p?.value || ""), fp = String(p?.footprint || ""), key = value + "\u0000" + fp;
    if (!g.has(key)) g.set(key, { value, fp, refs: [] });
    g.get(key).refs.push(ref);
  }
  const cell = (s) => String(s).replace(/[\t\r\n]+/g, " ");
  return [...g.values()].map((x) => ({ ...x, refs: x.refs.sort(byRef) })).sort((a, b) => byRef(a.refs[0], b.refs[0]))
    .map((x) => [x.refs.length, x.refs.join(", "), x.value, x.fp].map(cell).join("\t"));
}

export function createMakeSheet(stage, { api, board, viewer = null, download, toast = () => {}, change, mini = null, glbHref = null } = {}) {
  // ---------- the card ----------
  const titleEl = h("h2", { class: "mk-t", id: "mkT", tabindex: "-1" }, "Make it");
  const closeB = h("button", { type: "button", class: "ib mk-x lq-btn", "aria-label": "Close", title: "Close (Esc)", html: ic("close") });
  const grab = h("div", { class: "sheet-grab", "aria-hidden": "true" });
  const head = h("header", { class: "mk-head" }, h("div", { class: "mk-ht" }, titleEl, h("p", { class: "mk-sub" }, "Everything a fab needs, checked.")), closeB);
  const body = h("div", { class: "mk-body" });
  const foot = h("footer", { class: "mk-foot" });
  const root = h("div", { class: "mk", id: "mk", role: "dialog", "aria-modal": "false", "aria-labelledby": "mkT", hidden: true }, grab, head, body, foot);
  stage.append(root);
  squish(closeB);
  closeB.addEventListener("click", () => close());
  grab.addEventListener("click", () => close());
  // keys pressed in the sheet stay in the sheet (Backspace here must not delete the selected parts); Esc closes it
  root.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey) return;
    e.stopPropagation();
    if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); close(); }
    else if (e.key.toLowerCase() === "m" && !e.altKey && !typing() && !e.repeat) { e.preventDefault(); close(); }
  });

  let btn = null, isOpen = false, gen = 0, hideT = 0, sig = "";
  // what the sheet knows about the board now: { id, stats, exp, statsErr, expErr }; last keeps the previous result so
  // a reopen has its rows at once (they still tick in)
  let data = { id: board.id }, last = { id: null }, pcb = { id: null, p: null };
  let loading = false, busy = false, ticked = false;
  let ui = null; // this render's parts

  // ---------- what kind of board this is ----------
  function blockReason() {
    if (board.kind === "new" && !board.building) return "Describe your board first.";
    if (board.building) return "Etch is still building this board.";
    if (board.local) return "A board opened from a file has no fab files.";
    if (!board.id) return "Describe your board first.";
    return "";
  }
  // an Etch build (or, with no engine, the demo build standing in for any board)
  const engine = () => !!board.live || (api?.status?.mock === true && !board.local && board.kind !== "new");
  const sigOf = () => [board.id, board.kind, !!board.live, !!board.local, !!board.building].join("|");

  // ---------- the top-bar button ----------
  function failing() {
    const s = data.stats;
    if (!s) return 0;
    const bad = (s.checks || []).filter((c) => c.ok === false).length;
    return bad + (data.exp && data.exp.ok === false && !bad ? 1 : 0);
  }
  function paintButton() {
    if (!btn) return;
    const why = blockReason();
    let st = "none", title = engine() ? "Not checked yet" : "Not checked by Etch";
    if (why) { st = "off"; title = why; }
    else if (loading) { st = "loading"; title = "Checking…"; }
    else if (data.stats && !data.statsErr) {
      const f = failing();
      st = f || data.stats.passed === false ? "fail" : "pass";
      title = f ? `${plural(f, "check")} failing` : data.stats.passed === false ? "The build didn't pass its checks" : "All checks pass";
    }
    btn.dataset.mk = st;
    btn.title = title;
    if (why) btn.setAttribute("aria-disabled", "true"); else btn.removeAttribute("aria-disabled");
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  // ---------- render: the three sections and the footer for the board as it is now ----------
  function section(cls, ...kids) {
    const s = h("section", { class: "mk-sec lq-in " + cls }, ...kids);
    stagger(s);
    return s;
  }
  function render() {
    const eng = engine();
    // this board: the mini plan (Etch builds only), the size, the numbers
    const dim = h("div", { class: "mk-dim" }), dsub = h("div", { class: "mk-dsub" });
    const miniEl = mini && eng ? h("div", { class: "mk-mini", "aria-hidden": "true" }) : null;
    const nums = h("dl", { class: "in-rows mk-nums" }), dd = {};
    for (const [k, label] of NUMS) { dd[k] = h("dd", {}); nums.append(h("dt", {}, label), dd[k]); }
    const sBoard = section("mk-board", h("h3", { class: "nb-sl" }, "This board"), h("div", { class: "mk-size" }, miniEl, h("div", { class: "mk-dimw" }, dim, dsub)), nums);
    // checks: the pill alone is live for screen readers, not every row
    const pill = h("span", { class: "ag-bn-pill mk-pill", "aria-live": "polite", hidden: !eng });
    const list = h("div", { class: "ag-tasks mk-checks", role: "list", "aria-label": "Checks" });
    const built = h("p", { class: "mk-built", hidden: true });
    const sChecks = section("mk-chk", h("div", { class: "mk-sh" }, h("h3", { class: "nb-sl" }, "Checks"), pill), list, built);
    // the rough estimate, with its working
    const formula = h("p", { class: "mk-f" }), total = h("div", { class: "mk-tot" }), each = h("div", { class: "mk-each" });
    const sQuote = section("mk-quote", h("div", { class: "ag-card-k" }, "Rough estimate"), formula, total, each,
      h("p", { class: "mk-fn" }, "Bare boards at a prototype fab, before parts and shipping. Real quotes vary by fab."));
    body.replaceChildren(sBoard, sChecks, sQuote);
    body.scrollTop = 0;
    ui = { eng, dim, dsub, miniEl, dd, springs: {}, pill, list, built, formula, total, each, sQuote, rows: [], extra: null };
    renderFoot(eng);
  }

  // ---------- footer: the files ----------
  function renderFoot(eng) {
    const m = board.meta || {};
    let primary;
    if (eng) {
      primary = h("button", { type: "button", class: "btn dark mk-dl lq-btn" });
      primary.addEventListener("click", () => getFab(false));
    } else {
      // a library board: its KiCad project on GitHub, at the commit Etch read
      const dir = m.pcb_path ? "/" + m.pcb_path.split("/").slice(0, -1).join("/") : "";
      const href = m.url ? m.url + (m.commit ? `/tree/${m.commit}${dir}` : "") : "";
      primary = h(href ? "a" : "button", href ? { class: "btn dark mk-dl lq-btn", href, target: "_blank", rel: "noopener" } : { type: "button", class: "btn dark mk-dl", "aria-disabled": "true", title: "This board has no link to its KiCad project." },
        h("span", { html: ic("external", 16) }), h("span", {}, "Get the KiCad project"));
      if (href) primary.title = m.commit ? `On GitHub at ${m.commit.slice(0, 7)}` : "On GitHub";
    }
    const bomB = h("button", { type: "button", class: "btn mk-sb lq-btn", html: `${ic("copy", 16)}<span>Copy BOM</span>` });
    bomB.addEventListener("click", copyBom);
    const kiB = eng ? h("button", { type: "button", class: "btn mk-sb lq-btn", html: `${ic("external", 16)}<span>KiCad project</span>` }) : null;
    kiB?.addEventListener("click", () => getFab(true));
    const two = h("div", { class: "mk-two" + (kiB ? "" : " one") }, bomB, kiB);
    // the small links: the 3D model, the source on GitHub
    const links = [];
    const glb = !board.live && glbHref ? glbHref() : null;
    if (board.live) {
      const b = h("button", { type: "button" }, "3D model (.glb)");
      b.addEventListener("click", () => download?.(`/etch/glb?id=${encodeURIComponent(board.id)}`, `${board.id}.glb`));
      links.push(b);
    } else if (glb) links.push(h("a", { href: glb, download: (m.slug || String(board.id).replace(/[^\w.-]+/g, "-")) + ".glb" }, "3D model (.glb)"));
    if (m.url) links.push(h("a", { href: m.url, target: "_blank", rel: "noopener" }, "On GitHub"));
    const row = h("div", { class: "mk-links", hidden: !links.length });
    links.forEach((a, i) => { if (i) row.append(h("span", { class: "mk-sep", "aria-hidden": "true" }, "·")); row.append(a); });
    foot.replaceChildren(primary, two, row);
    for (const b of [primary, bomB, kiB]) if (b && b.classList.contains("lq-btn")) squish(b);
    Object.assign(ui, { primary, bomB, kiB });
    if (!Object.keys(board.parts || {}).length) { bomB.setAttribute("aria-disabled", "true"); bomB.title = "This board has no parts list yet."; }
    paintPrimary();
  }
  // the fab zip waits for /etch/export: "Checking…", then ready, or "Fix the checks to download"
  function paintPrimary() {
    if (!ui?.eng || !ui.primary) return;
    const x = data.exp, b = ui.primary;
    let label = "Download fab files", lead = ic("download", 16), why = "";
    if (busy) { label = "Downloading…"; lead = '<span class="ag-spin" aria-hidden="true"></span>'; why = "Downloading the fab files"; }
    else if (data.expErr || data.statsErr) why = "Couldn't run the checks. Try again above.";
    else if (!x) { label = "Checking…"; lead = '<span class="ag-spin" aria-hidden="true"></span>'; why = "Etch is checking the fab files"; }
    else if (x.ok === false) { label = "Fix the checks to download"; lead = ""; why = plainError((x.reasons || [])[0] || "A check failed"); }
    b.innerHTML = `${lead}<span>${label}</span>`;
    b.title = why || "The KiCad project, Gerbers, drill files and BOM in one zip";
    const off = !!why;
    for (const el of [b, ui.kiB]) if (el) { if (off) el.setAttribute("aria-disabled", "true"); else el.removeAttribute("aria-disabled"); }
    if (ui.kiB) ui.kiB.title = off ? why : "The same zip; open its .kicad_pro in KiCad";
    b.setAttribute("aria-busy", busy ? "true" : "false");
  }
  async function getFab(kicad) {
    const b = kicad ? ui?.kiB : ui?.primary;
    if (!b || busy || b.getAttribute("aria-disabled") === "true") return;
    busy = true; paintPrimary();
    // said first: if the download fails, its own message replaces this one
    if (kicad) toast("Unzip it and open the .kicad_pro in KiCad 10");
    try { await download?.(`/etch/export.zip?id=${encodeURIComponent(board.id)}`, `${String(board.id).replace(/[^\w.-]+/g, "-")}-fab.zip`); }
    finally { busy = false; paintPrimary(); }
  }
  async function copyBom() {
    if (ui?.bomB?.getAttribute("aria-disabled") === "true") { toast("This board has no parts list yet."); return; }
    const lines = bomLines(board.parts);
    const tsv = ["Qty\tRefs\tValue\tFootprint", ...lines].join("\n") + "\n";
    try { await navigator.clipboard.writeText(tsv); toast(`BOM copied · ${plural(lines.length, "line")}`); }
    catch (e) { toast("Couldn't copy. The browser blocked the clipboard."); }
  }

  // ---------- the numbers ----------
  function setNum(k, v) {
    const dd = ui?.dd[k];
    if (!dd) return;
    const s0 = ui.springs[k];
    if (v == null || v === "" || !isFinite(+v)) { s0?.stop(); dd.textContent = "—"; return; }
    v = +v;
    const fmt = k === "track_mm" ? (v >= 1000 ? (x) => `${(x / 1000).toFixed(2)} m` : (x) => `${x.toFixed(1)} mm`) : (x) => Math.round(x).toLocaleString();
    // counts up on open with the taskRow spring
    const s = s0 || (ui.springs[k] = spring(0, { preset: "critical", precision: 0.4, onUpdate: (x) => { dd.textContent = s.fmt(x); } }));
    s.fmt = fmt;
    dd.textContent = fmt(s.value);
    s.set(v);
  }
  function waitNums() { for (const [k] of NUMS) ui.dd[k].replaceChildren(h("i", { class: "ag-bn-sk" })); }
  function paintSize(w, hh, layers, sides) {
    ui.dim.textContent = w > 0 && hh > 0 ? `${mm1(w)} × ${mm1(hh)} mm` : "—";
    const bits = [];
    if (layers) bits.push(plural(+layers, "layer"));
    if (sides) { const F = sides.F || 0, B = sides.B || 0; bits.push(B ? `${F} on top, ${B} on the bottom` : `${plural(F, "part")} on top`); }
    ui.dsub.textContent = bits.join(" · ");
  }
  function paintQuote(q, layers) {
    if (!q || !(q.area_cm2 > 0)) { ui.sQuote.hidden = true; return; }
    ui.sQuote.hidden = false;
    const n = q.qty || 5, two = (layers || 2) <= 2;
    const lay = two ? (layers === 1 ? "1 or 2 layers" : "2 layers") : `${layers} layers`;
    const over = q.area_cm2 > 100 ? ` + $${two ? "0.035" : "0.12"} per cm² over 100 cm²` : "";
    ui.formula.textContent = `Flat ${usd(two ? 2 : 8)} for ${n} boards up to 100 × 100 mm (${lay})${over}. This board is ${(+q.area_cm2).toFixed(1)} cm².`;
    ui.total.textContent = `About ${usd(q.boards_usd)}`;
    ui.each.textContent = `for ${n} boards · about ${usd(q.each_usd)} each`;
  }

  // ---------- the checks ----------
  function setPill(text, tone = "") {
    const p = ui.pill;
    p.hidden = !text;
    if (p.textContent === text) return;
    p.textContent = text;
    if (tone) p.dataset.tone = tone; else delete p.dataset.tone;
    p.classList.remove("ag-in"); void p.offsetWidth; p.classList.add("ag-in");
  }
  const sameChecks = (a, b) => !!a && !!b && a.length === b.length && a.every((c, i) => c.id === b[i].id && c.label === b[i].label);
  function mountRows(checks) {
    ui.list.replaceChildren();
    ui.rows = checks.map((c) => { const r = taskRow({ title: c.label || c.id || "Check", status: "running" }); stagger(r.el); ui.list.append(r.el); return { c, r }; });
    ui.extra = null;
  }
  function fixButton(r, label) {
    const b = h("button", { type: "button", class: "ag-follow lq-btn mk-fix" }, "Ask Etch to fix it");
    squish(b);
    b.addEventListener("click", () => { close(); change?.(`fix the failing check: ${label}`); });
    r.el.querySelector(".ag-task-txt").append(b);
  }
  function settleRow({ c, r }) {
    const st = c.ok === true ? "done" : c.ok === false ? "failed" : "neutral";
    r.update({ status: st, detail: detailOf(c) });
    if (st === "failed" && typeof c.value === "string") r.el.title = c.value; // the raw message, one hover away
    if (st === "neutral") r.el.querySelector(".ag-task-ic").replaceChildren(icon("step"));
    if (st === "failed") fixButton(r, c.label || c.id);
  }
  // one red row in place of (or after) the checks, with Try again
  function errorRow(e) {
    if (ui.extra === "error") return;
    const msg = e?.status === 404 ? "Etch can't find this build's files." : plainError(e?.message || String(e || "")) || "Something went wrong.";
    const r = taskRow({ title: "Couldn't run the checks.", detail: msg, status: "failed" });
    const b = h("button", { type: "button", class: "ag-follow lq-btn mk-fix" }, "Try again");
    squish(b);
    b.addEventListener("click", () => load());
    r.el.querySelector(".ag-task-txt").append(b);
    stagger(r.el);
    ui.list.append(r.el);
    ui.extra = "error";
  }
  // the results tick in, 90 ms apart in list order, then the pill, the button and the download say how it went
  function tickRows(g) {
    ticked = false;
    if (!ui.rows.length) { ticked = true; after(g); return; }
    ui.rows.forEach((x, i) => setTimeout(() => {
      if (g !== gen) return;
      settleRow(x);
      if (i === ui.rows.length - 1) { ticked = true; after(g); }
    }, FIRST_TICK + i * TICK));
  }
  function after(g) {
    if (g !== gen || !ui) return;
    const s = data.stats;
    if (data.statsErr || data.expErr) errorRow(data.statsErr || data.expErr);
    // /etch/export checked the fab files again and they failed, though every row above passed: say so as its own row
    if (s && ticked && data.exp && data.exp.ok === false && !s.checks?.some((c) => c.ok === false) && !ui.extra) {
      const r = taskRow({ title: "The fab files, checked again", detail: plainError((data.exp.reasons || [])[0] || "A check failed"), status: "failed" });
      fixButton(r, "the fab files");
      stagger(r.el); ui.list.append(r.el); ui.extra = "export";
    }
    if (s && ticked) {
      const judged = (s.checks || []).filter((c) => c.ok === true || c.ok === false), f = failing();
      setPill(f ? `${f} failing` : judged.length ? `${judged.length} of ${judged.length} pass` : "Not measured", f ? "fail" : judged.length ? "pass" : "");
    } else if (data.statsErr) setPill("");
    loading = !(data.statsErr || (ticked && (data.exp || data.expErr)));
    paintButton(); paintPrimary();
  }
  function showStats(s, g) {
    paintSize(+s.w, +s.h, +s.layers || null, s.sides);
    for (const [k] of NUMS) setNum(k, s[k]);
    paintQuote(s.quote || (s.w > 0 && s.h > 0 ? estimate(+s.w, +s.h, +s.layers || 2) : null), +s.layers || 2);
    const checks = Array.isArray(s.checks) ? s.checks : [];
    if (!ui.rows.length || ui.extra || !sameChecks(ui.rows.map((x) => x.c), checks)) mountRows(checks);
    else ui.rows.forEach((x, i) => { x.c = checks[i]; });
    if (!checks.length) {
      const r = taskRow({ title: "No checks were recorded for this build.", status: "neutral" });
      r.el.querySelector(".ag-task-ic").replaceChildren(icon("step"));
      ui.list.append(r.el);
    }
    const sec = +s.built_s, tries = +s.tries;
    const t = sec > 0 ? (sec < 60 ? `${sec.toFixed(1)} s` : `${Math.floor(sec / 60)} min ${Math.floor(sec % 60)} s`) : "";
    const tr = tries === 1 ? "first try" : tries > 1 ? `${tries} tries` : "";
    ui.built.textContent = t ? `Built in ${t}${tr ? ", " + tr : ""}` : tr ? (tries === 1 ? "Built on the first try" : `Built in ${tries} tries`) : "";
    ui.built.hidden = !ui.built.textContent;
    tickRows(g);
  }

  // ---------- load: the board's numbers, checks and fab check ----------
  function load() {
    const g = ++gen, id = board.id;
    if (!ui) render();
    if (!ui.eng) { library(); return; }
    data = { id };
    loading = true; busy = false; ticked = false;
    setPill("Checking");
    // the last result for this board puts its rows up at once; they still tick in from the fresh one
    if (last.id === id && last.stats) {
      const s = last.stats;
      paintSize(+s.w, +s.h, +s.layers || null, s.sides);
      for (const [k] of NUMS) setNum(k, s[k]);
      paintQuote(s.quote || (s.w > 0 && s.h > 0 ? estimate(+s.w, +s.h, +s.layers || 2) : null), +s.layers || 2);
      mountRows(Array.isArray(s.checks) ? s.checks : []);
    } else {
      waitNums();
      ui.dim.replaceChildren(h("i", { class: "ag-bn-sk mk-sk" }));
      ui.dsub.textContent = "";
      ui.sQuote.hidden = true;
      ui.list.replaceChildren(taskRow({ title: "Running the checks", status: "running" }).el);
      ui.rows = []; ui.extra = null;
    }
    paintButton(); paintPrimary();
    paintMini(g);
    Promise.resolve().then(() => api.view("stats", id)).then((s) => {
      if (g !== gen) return;
      data.stats = s; last = { id, stats: s };
      showStats(s, g);
    }, (e) => {
      if (g !== gen) return;
      data.statsErr = e;
      ui.list.replaceChildren(); ui.rows = []; ui.extra = null;
      for (const [k] of NUMS) setNum(k, null);
      if (ui.dim.querySelector(".ag-bn-sk")) paintSize(0, 0);
      pcb.p?.then((d) => { if (g === gen && d?.w > 0 && d?.h > 0) paintSize(+d.w, +d.h, d.copper?.length || null, null); }, () => {});
      after(g);
    });
    Promise.resolve().then(() => api.exportCheck(id)).then((x) => {
      if (g !== gen) return;
      data.exp = x || { ok: false, reasons: ["No answer"] };
      after(g);
    }, (e) => {
      if (g !== gen) return;
      data.expErr = e;
      if (ticked || data.statsErr) after(g); else paintPrimary();
    });
  }
  // a library board: what its own files say, and one muted line where the checks would be
  function library() {
    const m = board.meta || {}, parts = Object.values(board.parts || {});
    let size = Array.isArray(m.size_mm) ? m.size_mm : null;
    if (!size && viewer?.boardRect) { const r = viewer.boardRect(); if (r && isFinite(r.x1 - r.x0)) size = [r.x1 - r.x0, r.y1 - r.y0]; }
    const layers = +m.layers || null;
    const side = (p) => String(p?.side || "").toLowerCase();
    const sides = parts.length && parts.some((p) => p?.side) ? { F: parts.filter((p) => /^(top|f)/.test(side(p))).length, B: parts.filter((p) => /^(bottom|b)/.test(side(p))).length } : null;
    paintSize(size ? +size[0] : 0, size ? +size[1] : 0, layers, sides);
    for (const [k] of NUMS) setNum(k, k === "parts" && parts.length ? parts.length : null);
    paintQuote(size ? estimate(+size[0], +size[1], layers || 2) : null, layers || 2);
    const r = taskRow({ title: "Etch didn't build this board, so it hasn't checked it.", detail: "Ask Etch to change it and every check runs on the new version.", status: "neutral" });
    r.el.querySelector(".ag-task-ic").replaceChildren(icon("step"));
    ui.list.replaceChildren(r.el);
    ui.rows = []; ui.extra = null;
    setPill("");
    data = { id: board.id }; loading = false;
    paintButton();
  }
  // the 112 × 76 mini plan (main.js's renderer), from GET /etch/pcb2d; no plan, no slot
  function paintMini(g) {
    const slot = ui.miniEl;
    if (!slot) return;
    const id = board.id;
    if (pcb.id !== id) pcb = { id, p: Promise.resolve().then(() => api.view("pcb2d", id)) };
    pcb.p.then((d) => {
      if (g !== gen || !slot.isConnected) return;
      mini(slot, d);
      slot.classList.add("in");
      // no numbers came back: the board's own outline still says how big it is
      if (data.statsErr && d?.w > 0 && d?.h > 0) paintSize(+d.w, +d.h, d.copper?.length || null, null);
    }).catch(() => { if (pcb.id === id) pcb = { id: null, p: null }; slot.remove(); });
  }

  // ---------- open / close: one spring both ways ----------
  const sp = spring(0, { preset: OPEN, precision: 0.001, onUpdate: draw, onRest: () => { if (!isOpen && sp.value <= 0.001) root.hidden = true; } });
  function draw(v) {
    if (root.classList.contains("rm")) return;
    if (PHONE.matches) { root.style.transform = `translateY(${(Math.max(0, 1 - v) * 100).toFixed(2)}%)`; root.style.opacity = ""; }
    else { root.style.transform = `translateX(${((1 - v) * 32).toFixed(2)}px)`; root.style.opacity = clamp(v).toFixed(3); }
  }
  function open() {
    if (isOpen) return sheet;
    const why = blockReason();
    if (why) { toast(why); return sheet; }
    isOpen = true;
    clearTimeout(hideT);
    sig = sigOf();
    render();
    root.hidden = false;
    document.body.classList.add("mk-on");
    if (reducedMotion()) {
      // reduced motion: a .18s fade, nothing travels
      root.classList.add("rm"); root.style.transform = ""; root.style.opacity = "0";
      void root.offsetWidth; root.style.opacity = "1";
    } else {
      root.classList.remove("rm");
      draw(sp.value);
      sp.config(PHONE.matches ? OPEN_PHONE : OPEN).set(1);
    }
    titleEl.focus({ preventScroll: true });
    load();
    paintButton();
    return sheet;
  }
  function close() {
    if (!isOpen) return sheet;
    isOpen = false;
    gen++; // results still on their way are dropped
    loading = false;
    document.body.classList.remove("mk-on");
    const had = root.contains(document.activeElement) || document.activeElement === document.body;
    if (root.classList.contains("rm") || reducedMotion()) {
      root.classList.add("rm"); root.style.opacity = "0";
      hideT = setTimeout(() => { if (!isOpen) root.hidden = true; }, 180);
    } else sp.config(PHONE.matches ? OPEN_PHONE : OPEN).set(0);
    if (had && btn) btn.focus({ preventScroll: true });
    // a fab check that never answered leaves the dot at "not checked" rather than pulsing on
    if (!data.stats && !data.statsErr) data = { id: board.id };
    paintButton();
    return sheet;
  }
  const toggle = () => (isOpen ? close() : open());

  // ---------- M toggles the sheet when no text field has the keys ----------
  function onKey(e) {
    if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey || typing()) return;
    if (e.key.toLowerCase() !== "m" || blockReason()) return;
    e.preventDefault();
    toggle();
  }

  const sheet = {
    el: root,
    get isOpen() { return isOpen; },
    open, close, toggle,
    bind(b) {
      if (!b || btn === b) return sheet;
      btn = b;
      b.classList.add("mk-b");
      if (!b.querySelector(".mk-dot")) b.prepend(h("span", { class: "mk-dot", "aria-hidden": "true" }));
      b.setAttribute("aria-haspopup", "dialog");
      b.setAttribute("aria-controls", "mk");
      b.addEventListener("click", () => { const why = blockReason(); if (why) { toast(why); return; } toggle(); });
      addEventListener("keydown", onKey);
      paintButton();
      return sheet;
    },
    refresh() {
      if (data.id !== board.id) { data = { id: board.id }; loading = false; }
      const now = sigOf();
      if (isOpen && blockReason()) close();
      else if (isOpen && now !== sig) { sig = now; render(); load(); }
      paintButton();
      return sheet;
    },
  };
  return sheet;
}
