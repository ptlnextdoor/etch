// The schematic: the sheet KiCad would draw for an Etch build (GET /etch/schematic, deploy/views.py), on a paper
// card over the stage. Symbols come already placed with their library graphics and pins, plus the net labels, wires,
// junctions and no-connects. Hover and selection follow the board's parts; click a pin, wire or label and its net
// lights across the sheet (and in the 2D and 3D views through onNet). Text is sized in millimetres so it zooms with
// the drawing, and hides when it would be too small to read.
//
//   const sch = createSchView(stage, { api, board, onPick(ref, { shift }), onHover(ref), onNet(net, info),
//                                      tag(html | null), onBack(), announce(text) });
//   await sch.show(runId);  sch.hide();  sch.select(refs);  sch.hover(ref);  sch.setNet(name | null);  sch.fit()
import { createPanZoom } from "./pan-zoom.js";
import { reducedMotion } from "../ui/spring.js";
import { pixelLoader } from "../ui/trace.js";

const NS = "http://www.w3.org/2000/svg";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const netClass = (n) => "n-" + String(n).replace(/[^a-zA-Z0-9_-]/g, (c) => "_" + c.charCodeAt(0).toString(16));
const pts = (arr) => { let s = ""; for (let i = 0; i < arr.length; i += 2) s += `${i ? " " : ""}${arr[i]},${arr[i + 1]}`; return s; };
function sv(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v === true ? "" : v);
  for (const k of kids) if (k != null) e.append(k);
  return e;
}
function el(tag, cls, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v === true ? "" : v);
  e.append(...kids.filter((k) => k != null));
  return e;
}
const MARGIN = 12.7; // paper around the drawing, mm

// a global label's flag: the point at the anchor, the text away from it, 2.54 mm tall, the way KiCad draws them
function labelNode(lb) {
  const n = Math.max(1, lb.text.length), hgt = 2.54, w = n * lb.size * 0.72 + 1.8, tip = 1.1;
  const flag = lb.kind === "global" || lb.kind === "hierarchical";
  const path = flag ? `M0 0 L${tip} ${-hgt / 2} H${tip + w} V${hgt / 2} H${tip} Z` : "";
  const g = sv("g", { class: `lbl ${lb.kind} ${netClass(lb.net || lb.text)}`, "data-net": lb.net || lb.text, transform: `translate(${lb.at[0]} ${lb.at[1]}) rotate(${-(lb.rot || 0)})` });
  if (flag) g.append(sv("path", { class: "flag", d: path }));
  const t = sv("text", { class: "lbl-t", x: flag ? tip + 0.9 : 0.6, y: flag ? 0 : -0.5, "font-size": lb.size, "dominant-baseline": flag ? "central" : "auto" }, lb.text);
  // a label pointing left (180) would read upside down: flip its text back
  if (((lb.rot || 0) % 360) === 180) t.setAttribute("transform", `rotate(180 ${flag ? tip + w / 2 + 0.9 : 0} 0) translate(${flag ? 0 : -1.2} 0)`);
  g.append(t);
  return g;
}

export function drawSheet(svg, data, { title = "", stats = "" } = {}) {
  svg.textContent = "";
  const [x0, y0, x1, y1] = data.box;
  const paper = [x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN];
  const byNet = new Map(), byRef = new Map();
  svg.append(sv("defs", {},
    sv("pattern", { id: "sv-g1", width: 2.54, height: 2.54, patternUnits: "userSpaceOnUse", x: paper[0], y: paper[1] }, sv("path", { d: "M2.54 0H0V2.54", class: "g1" })),
    sv("pattern", { id: "sv-g10", width: 25.4, height: 25.4, patternUnits: "userSpaceOnUse", x: paper[0], y: paper[1] }, sv("path", { d: "M25.4 0H0V25.4", class: "g10" }))));
  const pw = paper[2] - paper[0], ph = paper[3] - paper[1];
  svg.append(sv("rect", { class: "paper", x: paper[0], y: paper[1], width: pw, height: ph, rx: 2 }));
  svg.append(sv("rect", { class: "paper-grid grid-1", x: paper[0], y: paper[1], width: pw, height: ph, fill: "url(#sv-g1)" }));
  svg.append(sv("rect", { class: "paper-grid grid-10", x: paper[0], y: paper[1], width: pw, height: ph, fill: "url(#sv-g10)" }));
  // title strip, bottom-left of the paper
  if (title) {
    svg.append(sv("text", { class: "sv-title", x: paper[0] + 6, y: paper[3] - 6 - 3.2, "font-size": 3.5 }, title));
    svg.append(sv("text", { class: "sv-sub", x: paper[0] + 6, y: paper[3] - 6, "font-size": 2.4 }, stats));
  }
  const wires = sv("g", { class: "wires" });
  for (const w of data.wires || []) {
    const p = Array.isArray(w) ? w : w.pts, n = Array.isArray(w) ? "" : w.net || "";
    wires.append(sv("polyline", { class: `wire ${netClass(n)}`, "data-net": n, points: pts(p), pathLength: "1" }));
  }
  svg.append(wires);
  const syms = sv("g", { class: "syms" });
  let i = 0;
  for (const s of data.symbols || []) {
    const g = sv("g", { class: `sym${s.power ? " power" : ""}`, "data-ref": s.ref, tabindex: "-1", role: "button", "aria-label": `${s.ref}${s.value ? ", " + s.value : ""}`, style: `--d:${Math.min(i++, 19) * 22}ms` });
    for (const gr of s.graphics || []) {
      if (gr.kind === "poly") g.append(sv("polyline", { class: `body f-${gr.fill || "none"}`, points: pts(gr.pts) }));
      else if (gr.kind === "circle") g.append(sv("circle", { class: `body f-${gr.fill || "none"}`, cx: gr.at[0], cy: gr.at[1], r: gr.r }));
      else if (gr.kind === "text") g.append(sv("text", { class: "body-t", x: gr.at[0], y: gr.at[1], "font-size": gr.size || 1.27, transform: `rotate(${-(gr.rot || 0)} ${gr.at[0]} ${gr.at[1]})` }, gr.text));
    }
    for (const p of s.pins || []) {
      if (p.hide) continue;
      const dx = p.end[0] - p.tip[0], dy = p.end[1] - p.tip[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const pin = sv("g", { class: `pin ${netClass(p.net)}${p.net ? "" : " no-net"}`, "data-net": p.net || "", "data-pin": p.num, "data-name": p.name });
      pin.append(sv("line", { class: "pin-l", x1: p.tip[0], y1: p.tip[1], x2: p.end[0], y2: p.end[1] }));
      pin.append(sv("line", { class: "pin-hit", x1: p.tip[0], y1: p.tip[1], x2: p.end[0], y2: p.end[1] }));
      const vertical = Math.abs(uy) > Math.abs(ux);
      if (s.show_numbers !== false && p.num) {
        const mx = (p.tip[0] + p.end[0]) / 2, my = (p.tip[1] + p.end[1]) / 2;
        pin.append(sv("text", { class: "pin-n", x: vertical ? mx - 0.4 : mx, y: vertical ? my : my - 0.4, "font-size": 1, "text-anchor": vertical ? "end" : "middle", "dominant-baseline": vertical ? "central" : "auto", transform: vertical ? `rotate(-90 ${mx - 0.4} ${my})` : "" }, p.num));
      }
      if (s.show_names !== false && p.name && p.name !== "~") {
        const off = 0.8, nx = p.end[0] + ux * off, ny = p.end[1] + uy * off;
        const anchor = vertical ? (uy > 0 ? "end" : "start") : ux > 0 ? "start" : "end";
        pin.append(sv("text", { class: "pin-name", x: nx, y: ny, "font-size": 1.27, "text-anchor": anchor, "dominant-baseline": "central", transform: vertical ? `rotate(-90 ${nx} ${ny})` : "" }, p.name));
      }
      g.append(pin);
    }
    for (const t of s.texts || []) {
      const left = (t.just || []).includes("left"), right = (t.just || []).includes("right");
      g.append(sv("text", { class: `sym-t ${t.kind}`, x: t.at[0], y: t.at[1], "font-size": t.size || 1.27, "text-anchor": left ? "start" : right ? "end" : "middle", "dominant-baseline": "central", transform: t.rot ? `rotate(${-t.rot} ${t.at[0]} ${t.at[1]})` : "" }, t.text));
    }
    const b = s.box;
    g.append(sv("rect", { class: "hit", x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1] }));
    syms.append(g);
    if (!s.power) byRef.set(s.ref, g);
  }
  svg.append(syms);
  const lbls = sv("g", { class: "lbls" });
  for (const lb of data.labels || []) lbls.append(labelNode(lb));
  svg.append(lbls);
  const marks = sv("g", { class: "marks" });
  for (const j of data.junctions || []) marks.append(sv("circle", { class: "junction", cx: j[0], cy: j[1], r: 0.45 }));
  for (const n of data.no_connects || []) marks.append(sv("path", { class: "nc", d: `M${n[0] - 0.6} ${n[1] - 0.6} l1.2 1.2 M${n[0] + 0.6} ${n[1] - 0.6} l-1.2 1.2` }));
  svg.append(marks, sv("g", { class: "ov" }));
  for (const e of svg.querySelectorAll("[data-net]")) { const n = e.dataset.net; if (n) { if (!byNet.has(n)) byNet.set(n, []); byNet.get(n).push(e); } }
  return { paper, byNet, byRef };
}

export function createSchView(stage, { api, board, onPick, onHover, onNet, tag, onBack, announce } = {}) {
  const root = el("div", "schv-host", { hidden: true });
  const svg = sv("svg", { class: "schv", role: "img", tabindex: "-1" });
  const msg = el("div", "fv-msg", { hidden: true });
  root.append(svg, msg);
  stage.append(root);
  const pz = createPanZoom(svg, { onChange: lod, onInput: () => svg.classList.remove("draw") });
  let data = null, geo = null, run = null, sel = new Set(), hov = null, net = null, gen = 0, loader = null;
  const padFor = () => (matchMedia("(max-width: 768px)").matches ? { l: 16, t: 16, r: 16, b: 84 } : { l: 64, t: 32, r: 32, b: 96 });
  function lod(k) {
    svg.classList.toggle("lod-pins", k * 1.27 < 7);
    svg.classList.toggle("lod-text", k * 1.27 < 5);
    svg.classList.toggle("lod-grid", k * 2.54 < 5);
    const paper = svg.querySelector(".paper"); if (paper) paper.setAttribute("rx", 16 / k);
  }
  function showMsg(title, text, { retry = false } = {}) {
    msg.hidden = false; msg.textContent = "";
    const acts = el("div", "fv-acts");
    if (retry) { const b = el("button", "btn lq-btn", { type: "button" }, "Try again"); b.addEventListener("click", () => run && show(run, { again: true })); acts.append(b); }
    const back = el("button", "btn lq-btn", { type: "button" }, "Back to 3D"); back.addEventListener("click", () => onBack?.()); acts.append(back);
    msg.append(el("b", "", {}, title), el("p", "", {}, text), acts);
  }
  function loading(on) {
    if (on) {
      if (!loader) loader = pixelLoader({ label: "Reading the schematic", timer: false });
      msg.hidden = false; msg.textContent = "";
      msg.append(el("div", "fv-paper-sk"), loader.start("Reading the schematic").el);
    } else { loader?.stop(); if (!msg.querySelector("b")) msg.hidden = true; }
  }

  async function show(id, { again = false } = {}) {
    root.hidden = false;
    const g = ++gen;
    if (data && run === id && !again) { requestAnimationFrame(() => pz.fit(geo.paper, { pad: padFor(), jump: true })); return data; }
    run = id; data = null; geo = null; svg.textContent = "";
    loading(true);
    try {
      const d = await api.view("schematic", id);
      if (g !== gen) return null;
      loading(false); msg.hidden = true;
      data = d;
      const n = (d.symbols || []).filter((s) => !s.power).length, m = Object.keys(d.nets || {}).length;
      geo = drawSheet(svg, d, { title: board?.title || board?.meta?.title || "Board", stats: `Schematic · ${n} parts · ${m} nets` });
      svg.setAttribute("aria-label", `Schematic of ${board?.title || board?.meta?.title || "the board"}`);
      pz.fit(geo.paper, { pad: padFor(), jump: true });
      lod(pz.k);
      applySel(); applyNet();
      if (!reducedMotion()) { svg.classList.add("draw"); setTimeout(() => svg.classList.remove("draw"), 1400); }
      announce?.(`Schematic, ${n} parts, ${m} nets`);
      return d;
    } catch (e) {
      if (g !== gen) return null;
      loading(false);
      if (e.status === 404) showMsg("No schematic for this board yet", "Etch draws it from its own KiCad files, so it shows on boards Etch builds.");
      else showMsg("Couldn't draw the schematic.", "Try again in a moment.", { retry: true });
      return null;
    }
  }
  function hide() { gen++; root.hidden = true; tag?.(null); }

  function applySel() {
    const ov = svg.querySelector(".ov"); if (!ov) return;
    ov.textContent = "";
    for (const s of svg.querySelectorAll(".sym.on")) s.classList.remove("on");
    for (const r of sel) {
      const g = geo?.byRef.get(r); if (!g) continue;
      g.classList.add("on");
      const b = data.symbols.find((s) => s.ref === r)?.box; if (!b) continue;
      ov.append(sv("rect", { class: "so-foot", x: b[0] - 1, y: b[1] - 1, width: b[2] - b[0] + 2, height: b[3] - b[1] + 2, rx: 0.6 }));
    }
  }
  function applyHover() { for (const s of svg.querySelectorAll(".sym.hov")) s.classList.remove("hov"); if (hov) geo?.byRef.get(hov)?.classList.add("hov"); }
  function applyNet() {
    svg.classList.toggle("has-net", !!net);
    for (const e of svg.querySelectorAll(".lit")) e.classList.remove("lit");
    if (net && geo) for (const e of geo.byNet.get(net) || []) e.classList.add("lit");
  }
  function netInfo(name) {
    if (!data || !name) return null;
    let pins = 0;
    for (const s of data.symbols || []) for (const p of s.pins || []) if (p.net === name) pins++;
    return { name, pins, labels: (data.labels || []).filter((l) => (l.net || l.text) === name).length, parts: data.nets?.[name] || [] };
  }
  // frame the lit net: every label and pin on it, with room around
  function fitNet(name) {
    if (!geo) return;
    const els = geo.byNet.get(name) || []; if (!els.length) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const e of els) { const b = e.getBBox(); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); }
    const pad = padFor();
    pz.fit([x0 - 8, y0 - 8, x1 + 8, y1 + 8], { pad: { l: pad.l + 24, t: pad.t + 24, r: pad.r + 24, b: pad.b + 24 } });
  }
  function ping(x, y) {
    const ov = svg.querySelector(".ov"); if (!ov || reducedMotion()) return;
    const c = sv("circle", { class: "pv-ping", cx: x, cy: y, r: 0.2 }); ov.append(c); setTimeout(() => c.remove(), 700);
  }
  const hitOf = (e) => e.target.closest?.(".pin, .wire, .lbl, .sym");
  svg.addEventListener("pointermove", (e) => {
    if (!data || e.pointerType === "touch") return;
    const t = hitOf(e), sym = t?.closest(".sym"), ref = sym && !sym.classList.contains("power") ? sym.dataset.ref : null;
    let html = null;
    if (t?.classList.contains("pin")) html = `<b>${esc(ref || sym?.dataset.ref)}</b> pin ${esc(t.dataset.pin)}${t.dataset.name && t.dataset.name !== "~" ? ` · ${esc(t.dataset.name)}` : ""}${t.dataset.net ? ` · net ${esc(t.dataset.net)}` : ""}`;
    else if (t?.classList.contains("wire")) html = t.dataset.net ? `${esc(t.dataset.net)}` : "wire";
    else if (t?.classList.contains("lbl")) { const n = t.dataset.net; html = `${esc(n)} · ${netInfo(n)?.labels || 1} label${netInfo(n)?.labels === 1 ? "" : "s"}`; }
    else if (ref) { const p = board?.parts?.[ref]; const s = data.symbols.find((x) => x.ref === ref); html = `<b>${esc(ref)}</b>${(p?.value || s?.value) ? ` ${esc(p?.value || s?.value)}` : ""}`; }
    if (ref !== hov) { hov = ref; applyHover(); onHover?.(hov); }
    tag?.(html);
  });
  svg.addEventListener("pointerleave", () => { if (hov) { hov = null; applyHover(); onHover?.(null); } tag?.(null); });
  svg.addEventListener("click", (e) => {
    if (!data || pz.moved) return;
    const t = hitOf(e), sym = t?.closest(".sym"), ref = sym && !sym.classList.contains("power") ? sym.dataset.ref : null;
    const netEl = t?.classList.contains("pin") || t?.classList.contains("wire") || t?.classList.contains("lbl") ? t : null;
    if (netEl) {
      const n = netEl.dataset.net;
      if (ref && t.classList.contains("pin")) onPick?.(ref, { shift: e.shiftKey || e.metaKey || e.ctrlKey });
      if (n) { setNet(n); const b = netEl.getBBox(); ping(b.x + b.width / 2, b.y + b.height / 2); onNet?.(n, netInfo(n)); announce?.(`Net ${n} lit`); }
      return;
    }
    if (ref) { onPick?.(ref, { shift: e.shiftKey || e.metaKey || e.ctrlKey }); return; }
    if (net) { setNet(null); onNet?.(null, null); return; }
    onPick?.(null, {});
  });
  svg.addEventListener("keydown", (e) => {
    const sym = e.target.closest?.(".sym"); if (!sym) return;
    if (e.key === "Enter") { e.preventDefault(); onPick?.(sym.dataset.ref, {}); }
    else if (e.key === " ") { e.preventDefault(); const p = sym.querySelector(".pin[data-net]:not([data-net=''])"); if (p) { setNet(p.dataset.net); onNet?.(p.dataset.net, netInfo(p.dataset.net)); } }
  });
  function setNet(n) { net = n || null; applyNet(); }
  function centerOn(ref) {
    const b = data?.symbols.find((s) => s.ref === ref)?.box; if (!b) return;
    const [px, py] = pz.toScreen([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]), r = svg.getBoundingClientRect();
    if (px < 40 || py < 40 || px > r.width - 40 || py > r.height - 40) pz.center([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
  }
  return {
    el: root, svg, show, hide, setNet, netInfo, fitNet,
    get open() { return !root.hidden; },
    get data() { return data; },
    get net() { return net; },
    select(refs) { sel = new Set(refs || []); applySel(); if (sel.size === 1 && !root.hidden) centerOn([...sel][0]); },
    hover(ref) { hov = ref || null; applyHover(); },
    fit() { if (geo) pz.fit(geo.paper, { pad: padFor() }); },
    zoom(f) { pz.zoom(f); },
    pan(dx, dy) { pz.panBy(dx, dy); },
    destroy() { pz.destroy(); root.remove(); },
  };
}
