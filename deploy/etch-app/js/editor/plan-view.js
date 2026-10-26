// The 2D board: the board flat, drawn from the engine's own .kicad_pcb (GET /etch/pcb2d, deploy/views.py) as one SVG
// over the 3D stage. Mask, pours and tracks seen through it, gold pads with their nets, vias, silkscreen and every
// footprint's courtyard, in millimetres from the board's top-left corner (the frame the inspector uses). Top or
// bottom, layers on and off, zoom and pan on a spring (pan-zoom.js), hover and selection shared with the 3D view,
// and a lit net: click a pad, track or via and every piece of copper on that net lights up.
//
//   const plan = createPlanView(stage, { api, board, viewer, onPick(ref, { shift }), onHover(ref), onNet(net, info),
//                                        tag(html | null), onBack(), announce(text) });
//   await plan.show(runId)         draws the board (the first time with the draw-in, like the start screen's backdrop)
//   plan.hide();  plan.select(refs);  plan.hover(ref);  plan.setNet(name | null);  plan.flip("F" | "B");  plan.fit()
//   plan.layer(name, on);  plan.setLook({ mask, silk, finish });  plan.setDim(refs: Set)   (hidden or isolated parts)
//   drawBoard(svg, data, { mini: true })   the same renderer, small, for the Make it sheet
import { createPanZoom } from "./pan-zoom.js";
import { spring, reducedMotion } from "../ui/spring.js";
import { pixelLoader } from "../ui/trace.js";
import { ic } from "./icons.js";

const NS = "http://www.w3.org/2000/svg";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
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
const pts = (arr, ox, oy) => { let s = ""; for (let i = 0; i < arr.length; i += 2) s += `${i ? " " : ""}${(arr[i] - ox).toFixed(3)},${(arr[i + 1] - oy).toFixed(3)}`; return s; };
const netClass = (n) => "n-" + String(n).replace(/[^a-zA-Z0-9_-]/g, (c) => "_" + c.charCodeAt(0).toString(16));
const sideClass = (s) => (s === "*" ? "s-both" : "s-" + s);
// a pad shape as an SVG node, in board mm (KiCad turns anticlockwise on screen, SVG clockwise)
function padNode(p, ox, oy, cls) {
  const [x, y] = [p.at[0] - ox, p.at[1] - oy], [w, h] = p.size;
  const rot = p.rot ? ` transform="rotate(${-p.rot} ${x} ${y})"` : "";
  const a = `class="${cls}" data-ref="${esc(p.ref)}" data-pad="${esc(p.num)}" data-net="${esc(p.net)}"`;
  if (p.shape === "circle" || (p.shape === "oval" && Math.abs(w - h) < 1e-6)) return `<circle ${a} cx="${x}" cy="${y}" r="${w / 2}"/>`;
  const r = p.shape === "oval" ? Math.min(w, h) / 2 : p.shape === "roundrect" ? Math.min(w, h) * (p.rr ?? 0.25) : 0;
  return `<rect ${a} x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${r}"${rot}/>`;
}
function drillNode(p, ox, oy) {
  if (!p.drill) return "";
  const [x, y] = [p.at[0] - ox, p.at[1] - oy], d = p.drill[0], d2 = p.drill[1] || d;
  if (Math.abs(d - d2) < 1e-6) return `<circle class="drill" cx="${x}" cy="${y}" r="${d / 2}"/>`;
  return `<rect class="drill" x="${x - d / 2}" y="${y - d2 / 2}" width="${d}" height="${d2}" rx="${Math.min(d, d2) / 2}"${p.rot ? ` transform="rotate(${-p.rot} ${x} ${y})"` : ""}/>`;
}

/** Draw the board into `svg` (emptied first). Returns { w, h, byNet: Map<net, Element[]>, byRef: Map<ref, Element> }.
 *  Coordinates are shifted so the board's top-left corner is (0, 0). */
export function drawBoard(svg, data, { mini = false } = {}) {
  const [ox, oy] = [data.box[0], data.box[1]], w = data.w, h = data.h;
  svg.textContent = "";
  svg.dataset.mini = mini ? "1" : "";
  const byNet = new Map(), byRef = new Map();
  const outline = data.outline?.length ? data.outline.map((g) => `M${pts(g.pts, ox, oy).replace(/ /g, " L")}`).join(" ") : `M0,0 L${w},0 L${w},${h} L0,${h} Z`;
  const html = [];
  // the mm grid, under everything (hidden at low zoom by .lod-grid)
  if (!mini) html.push(`<defs><pattern id="pv-g1" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" class="g1"/></pattern><pattern id="pv-g10" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" class="g10"/></pattern><clipPath id="pv-clip"><path d="${outline}"/></clipPath></defs>`,
    `<g class="pv-grid"><rect x="-2000" y="-2000" width="4000" height="4000" fill="url(#pv-g1)" class="grid-1"/><rect x="-2000" y="-2000" width="4000" height="4000" fill="url(#pv-g10)" class="grid-10"/></g>`);
  else html.push(`<defs><clipPath id="pv-clip-mini"><path d="${outline}"/></clipPath></defs>`);
  // the board: the mask over FR4, a darker lip inside the edge so it reads as a slab; a mirrored group holds every
  // layer so flipping is one transform about the board's centre
  html.push(`<g class="pv-flip"><path class="board" d="${outline}"/>`);
  const clip = mini ? "url(#pv-clip-mini)" : "url(#pv-clip)";
  html.push(`<g class="pv-layers" clip-path="${clip}">`);
  // copper pours per side
  for (const side of ["B", "F"]) {
    html.push(`<g class="zones ${sideClass(side)}">`);
    for (const z of data.zones || []) for (const poly of z.polys) if (poly.side === side) html.push(`<polygon class="zone ${netClass(z.net)}" data-net="${esc(z.net)}" points="${pts(poly.pts, ox, oy)}"/>`);
    html.push("</g>");
    html.push(`<g class="tracks ${sideClass(side)}">`);
    for (const t of data.tracks || []) if (t.side === side) html.push(`<polyline class="track ${netClass(t.net)}" data-net="${esc(t.net)}" stroke-width="${t.w}" points="${pts(t.pts, ox, oy)}" pathLength="1"/>`);
    html.push("</g>");
  }
  // footprints: courtyard box, part outline lines, pads; one hit box each
  html.push(`<g class="fps">`);
  for (const p of data.parts || []) {
    const b = p.box, bw = b[2] - b[0], bh = b[3] - b[1];
    html.push(`<g class="fp ${sideClass(p.side)}${p.part ? "" : " not-part"}${p.smd ? " smd" : " tht"}" data-ref="${esc(p.ref)}" style="transform-origin:${(b[0] + b[2]) / 2 - ox}px ${(b[1] + b[3]) / 2 - oy}px">`);
    // the hit box goes first, so pads (later in the group) win the click
    html.push(`<rect class="hit" x="${b[0] - ox}" y="${b[1] - oy}" width="${bw}" height="${bh}"/>`);
    html.push(`<rect class="court" x="${b[0] - ox}" y="${b[1] - oy}" width="${bw}" height="${bh}"/>`);
    for (const ln of p.lines || []) if (ln.kind !== "silk") html.push(`<polyline class="line ${ln.kind}" stroke-width="${ln.w}" points="${pts(ln.pts, ox, oy)}"/>`);
    for (const pad of p.pads || []) html.push(padNode({ ...pad, ref: p.ref }, ox, oy, `pad ${sideClass(pad.side)} ${netClass(pad.net)}${pad.net ? "" : " no-net"}`));
    for (const pad of p.pads || []) html.push(drillNode(pad, ox, oy));
    for (const ln of p.lines || []) if (ln.kind === "silk") html.push(`<polyline class="line silk ${sideClass(ln.side)}" stroke-width="${ln.w}" points="${pts(ln.pts, ox, oy)}"/>`);
    for (const t of p.texts || []) html.push(`<text class="ref ${sideClass(t.side)}" x="${t.at[0] - ox}" y="${t.at[1] - oy}" font-size="${t.size}" transform="rotate(${-(t.rot || 0)} ${t.at[0] - ox} ${t.at[1] - oy})${t.side === "B" ? ` translate(${2 * (t.at[0] - ox)} 0) scale(-1 1)` : ""}">${esc(t.text)}</text>`);
    html.push("</g>");
  }
  html.push("</g>");
  // vias: a ring and the stage showing through the drill
  html.push(`<g class="vias">`);
  for (const v of data.vias || []) html.push(`<g class="via ${netClass(v.net)}" data-net="${esc(v.net)}"><circle class="ring" cx="${v.at[0] - ox}" cy="${v.at[1] - oy}" r="${v.size / 2}"/><circle class="drill" cx="${v.at[0] - ox}" cy="${v.at[1] - oy}" r="${v.drill / 2}"/></g>`);
  html.push("</g>");
  // board-level silkscreen
  html.push(`<g class="silk-g">`);
  for (const s of data.silk || []) {
    if (s.text) html.push(`<text class="silk-t ${sideClass(s.side)}" x="${s.at[0] - ox}" y="${s.at[1] - oy}" font-size="${s.size}" transform="rotate(${-(s.rot || 0)} ${s.at[0] - ox} ${s.at[1] - oy})">${esc(s.text)}</text>`);
    else html.push(`<polyline class="line silk ${sideClass(s.side)}" stroke-width="${s.w}" points="${pts(s.pts, ox, oy)}"/>`);
  }
  html.push("</g>");
  html.push("</g>"); // layers
  // the edge, over everything, and the selection / hover overlays
  html.push(`<path class="edge" d="${outline}" pathLength="1"/>`);
  html.push(`<g class="ov"></g>`);
  html.push("</g>"); // flip
  svg.innerHTML = html.join("");
  for (const e of svg.querySelectorAll("[data-net]")) { const n = e.dataset.net; if (n) { if (!byNet.has(n)) byNet.set(n, []); byNet.get(n).push(e); } }
  for (const e of svg.querySelectorAll(".fp")) byRef.set(e.dataset.ref, e);
  // draw-in order: tracks by net from the board's centre out, footprints 22 ms apart
  const cx = w / 2, cy = h / 2;
  const nets = [...byNet.entries()].map(([n, els]) => { const t = els.find((e) => e.classList.contains("track")); const q = t ? t.points?.[0] : null; return [n, q ? Math.hypot(q.x - cx, q.y - cy) : 1e9]; }).sort((a, b) => a[1] - b[1]);
  nets.forEach(([n], i) => { for (const e of byNet.get(n)) if (e.classList.contains("track")) e.style.setProperty("--d", `${380 + i * 18}ms`); });
  let i = 0;
  for (const fp of byRef.values()) fp.style.setProperty("--d", `${420 + Math.min(i++, 19) * 22}ms`);
  return { w, h, byNet, byRef };
}

export function createPlanView(stage, { api, board, viewer, onPick, onHover, onNet, tag, onBack, announce } = {}) {
  const root = el("div", "pv-host", { hidden: true });
  const svg = sv("svg", { class: "pv", role: "img", "data-side": "F", "data-mask": "green", "data-silk": "white", "data-finish": "ENIG" });
  const ui = el("div", "pv-ui", { "aria-hidden": "true" });
  const dimW = el("span", "pv-dim w so-dim-h"), dimH = el("span", "pv-dim h so-dim-h"), sideL = el("span", "pv-side");
  const scale = el("div", "pv-scale", {}, el("span", "pv-scale-l"), el("i"));
  ui.append(dimW, dimH, sideL, scale);
  const msg = el("div", "fv-msg", { hidden: true });
  root.append(svg, ui, msg);
  stage.append(root);
  const pz = createPanZoom(svg, { onChange: paintUi, onInput: skipDraw });
  let data = null, geo = null, run = null, side = "F", sel = new Set(), hov = null, net = null, dim = new Set(), gen = 0, loader = null;
  const layers = { fcu: true, bcu: false, zones: true, pads: true, vias: true, silk: true, lines: false, labels: true };
  const flipS = spring(1, { preset: "smooth", precision: 0.002, onUpdate: (v) => paintFlip(v) });

  const padFor = () => (matchMedia("(max-width: 768px)").matches ? { l: 16, t: 16, r: 16, b: 84 } : { l: 64, t: 32, r: 32, b: 96 });
  function paintFlip(sx) {
    const g = svg.querySelector(".pv-flip"); if (!g || !geo) return;
    g.setAttribute("transform", `translate(${geo.w / 2} 0) scale(${sx} 1) translate(${-geo.w / 2} 0)`);
    const facing = sx >= 0 ? "F" : "B";
    if (svg.dataset.side !== facing) { svg.dataset.side = facing; paintLayers(); }
  }
  // l-fcu / l-bcu: the far side's copper is drawn only when its layer is on; the side you face is always drawn
  function paintLayers() { for (const [k, on] of Object.entries(layers)) svg.classList.toggle("l-" + k, !!on); }
  function paintUi(k = pz.k) {
    if (!geo) return;
    svg.classList.toggle("lod-grid", k < 4);
    svg.classList.toggle("lod-text", k * 1 < 6);
    svg.classList.toggle("lod-dim", k > pz.fitK * 3);
    const [x0, y0] = pz.toScreen([0, 0]), [x1, y1] = pz.toScreen([geo.w, geo.h]);
    dimW.textContent = `${fmt(geo.w)} mm`; dimH.textContent = `${fmt(geo.h)} mm`;
    dimW.style.transform = `translate(${(x0 + x1) / 2}px, ${y0 - 12}px) translate(-50%, -100%)`;
    dimH.style.transform = `translate(${x0 - 12}px, ${(y0 + y1) / 2}px) translate(-100%, -50%) rotate(-90deg)`;
    sideL.style.transform = `translate(${Math.min(x0, x1)}px, ${y0 - 30}px)`;
    // scale bar: 60–120 px, snapped to a round number of mm
    const steps = [0.5, 1, 2, 5, 10, 20, 50, 100];
    const mm = steps.find((s) => s * k >= 60) || 100;
    scale.lastElementChild.style.width = `${mm * k}px`;
    scale.firstElementChild.textContent = `${mm} mm`;
  }
  function skipDraw() { svg.classList.remove("draw"); }

  // ---- states ----
  function showMsg(title, text, { retry = false } = {}) {
    msg.hidden = false; msg.textContent = "";
    const acts = el("div", "fv-acts");
    if (retry) acts.append(el("button", "btn lq-btn", { type: "button", onclick: null }, "Try again"));
    const back = el("button", "btn lq-btn", { type: "button" }, "Back to 3D");
    back.addEventListener("click", () => onBack?.());
    acts.append(back);
    if (retry) acts.firstChild.addEventListener("click", () => { if (run) show(run, { again: true }); });
    msg.append(el("b", "", {}, title), el("p", "", {}, text), acts);
  }
  function loading(on) {
    if (on) {
      if (!loader) { loader = pixelLoader({ label: "Reading the board file", timer: false }); }
      msg.hidden = false; msg.textContent = "";
      const sz = board?.meta?.size_mm || board?.meta?.board?.size_mm || [60, 40];
      const ghost = sv("svg", { class: "fv-ghost", viewBox: `0 0 ${sz[0]} ${sz[1]}` }, sv("rect", { x: 0.5, y: 0.5, width: sz[0] - 1, height: sz[1] - 1, rx: 2, class: "sbd-outline" }));
      msg.append(ghost, loader.start("Reading the board file").el);
    } else { loader?.stop(); if (!msg.querySelector("b")) msg.hidden = true; }
  }

  // ---- data ----
  async function show(id, { again = false } = {}) {
    root.hidden = false;
    const g = ++gen;
    if (data && run === id && !again) { requestAnimationFrame(() => pz.fit([0, 0, geo.w, geo.h], { pad: padFor(), jump: true })); paintUi(); return data; }
    run = id; data = null; geo = null;
    svg.textContent = ""; ui.hidden = true;
    loading(true);
    try {
      const d = await api.view("pcb2d", id);
      if (g !== gen) return null;
      loading(false); msg.hidden = true;
      data = d; geo = drawBoard(svg, d);
      ui.hidden = false;
      svg.setAttribute("aria-label", `Flat view of ${board?.title || board?.meta?.title || "the board"}, ${fmt(geo.w)} by ${fmt(geo.h)} mm, ${side === "F" ? "top" : "bottom"} side`);
      paintLayers(); flipS.jump(side === "F" ? 1 : -1);
      pz.fit([0, 0, geo.w, geo.h], { pad: padFor(), jump: true });
      paintUi();
      applySel(); applyNet(); applyDim();
      if (!reducedMotion()) { svg.classList.add("draw"); setTimeout(() => svg.classList.remove("draw"), 1400); }
      announce?.(`Flat board, ${(d.parts || []).filter((p) => p.part).length} parts, ${(d.nets || []).length} nets`);
      return d;
    } catch (e) {
      if (g !== gen) return null;
      loading(false);
      if (e.status === 404) showMsg("No flat view for this board yet", "Etch draws this view from its own KiCad files, so it shows on boards Etch builds.");
      else showMsg("Couldn't draw this board flat.", "Try again in a moment.", { retry: true });
      return null;
    }
  }
  function hide() { gen++; root.hidden = true; tag?.(null); }

  // ---- selection, hover, nets, dimming ----
  function applySel() {
    const ov = svg.querySelector(".ov"); if (!ov || !geo) return;
    ov.textContent = "";
    for (const fp of svg.querySelectorAll(".fp.on")) fp.classList.remove("on");
    for (const r of sel) {
      const fp = geo.byRef.get(r); if (!fp) continue;
      fp.classList.add("on");
      const c = fp.querySelector(".court");
      ov.append(sv("rect", { class: "so-foot", x: c.getAttribute("x"), y: c.getAttribute("y"), width: c.getAttribute("width"), height: c.getAttribute("height"), rx: 0.4 }));
    }
  }
  function applyHover() {
    for (const fp of svg.querySelectorAll(".fp.hov")) fp.classList.remove("hov");
    if (hov && geo) geo.byRef.get(hov)?.classList.add("hov");
  }
  function applyNet() {
    svg.classList.toggle("has-net", !!net);
    for (const e of svg.querySelectorAll(".lit")) e.classList.remove("lit");
    if (net && geo) for (const e of geo.byNet.get(net) || []) e.classList.add("lit");
  }
  function applyDim() {
    for (const fp of svg.querySelectorAll(".fp.dim")) fp.classList.remove("dim");
    if (geo) for (const r of dim) geo.byRef.get(r)?.classList.add("dim");
  }
  function netInfo(name) {
    if (!data || !name) return null;
    const parts = [], padsN = (data.parts || []).reduce((n, p) => n + p.pads.filter((q) => q.net === name && (parts.push(p.ref), true)).length, 0);
    let len = 0;
    for (const t of data.tracks || []) if (t.net === name) for (let i = 0; i < t.pts.length - 2; i += 2) len += Math.hypot(t.pts[i + 2] - t.pts[i], t.pts[i + 3] - t.pts[i + 1]);
    return { name, pads: padsN, vias: (data.vias || []).filter((v) => v.net === name).length, track_mm: Math.round(len * 10) / 10, parts: [...new Set(parts)] };
  }
  function ping(x, y) {
    const ov = svg.querySelector(".ov"); if (!ov || reducedMotion()) return;
    const c = sv("circle", { class: "pv-ping", cx: x, cy: y, r: 0.2 });
    ov.append(c); setTimeout(() => c.remove(), 700);
  }

  // ---- pointer: hover tag, clicks ----
  const hitOf = (e) => e.target.closest?.(".pad, .via, .track, .fp, .board, .zone");
  svg.addEventListener("pointermove", (e) => {
    if (!data || e.pointerType === "touch") return;
    const t = hitOf(e), ref = t?.closest(".fp")?.dataset.ref || null;
    let html = null;
    if (t?.classList.contains("pad")) { const p = board?.parts?.[ref]; html = `<b>${esc(ref)}</b> pin ${esc(t.dataset.pad)}${t.dataset.net ? ` · ${esc(t.dataset.net)}` : ""}${p?.value ? ` · ${esc(p.value)}` : ""}`; }
    else if (t?.classList.contains("track")) html = `${esc(t.dataset.net || "no net")} · ${esc(t.getAttribute("stroke-width"))} mm`;
    else if (t?.closest(".via")) { const v = t.closest(".via"); html = `Via · ${esc(v.dataset.net || "no net")} · ${esc(v.querySelector(".drill").getAttribute("r") * 2)} mm drill`; }
    else if (t?.classList.contains("zone")) html = `${esc(t.dataset.net)} pour`;
    else if (ref) { const p = board?.parts?.[ref]; html = `<b>${esc(ref)}</b>${p?.value ? ` ${esc(p.value)}` : ""}`; }
    const nextHov = ref && geo?.byRef.get(ref) && !geo.byRef.get(ref).classList.contains("not-part") ? ref : null;
    if (nextHov !== hov) { hov = nextHov; applyHover(); onHover?.(hov); }
    tag?.(html);
  });
  svg.addEventListener("pointerleave", () => { if (hov) { hov = null; applyHover(); onHover?.(null); } tag?.(null); });
  svg.addEventListener("click", (e) => {
    if (!data || pz.moved) return;
    const t = hitOf(e);
    const fp = t?.closest(".fp"), ref = fp && !fp.classList.contains("not-part") ? fp.dataset.ref : null;
    const cop = t?.classList.contains("pad") ? t : t?.classList.contains("track") ? t : t?.closest(".via") || (t?.classList.contains("zone") ? t : null);
    if (cop) {
      const n = cop.dataset.net || "";
      if (ref) onPick?.(ref, { shift: e.shiftKey || e.metaKey || e.ctrlKey });
      if (n) { setNet(n); const b = cop.getBBox(); ping(b.x + b.width / 2, b.y + b.height / 2); onNet?.(n, netInfo(n)); announce?.(`Net ${n} lit, ${netInfo(n).pads} pads`); }
      return;
    }
    if (ref) { onPick?.(ref, { shift: e.shiftKey || e.metaKey || e.ctrlKey }); return; }
    // empty board or stage: the net first, then the selection
    if (net) { setNet(null); onNet?.(null, null); return; }
    onPick?.(null, {});
  });

  function setNet(n) { net = n || null; applyNet(); }
  function flip(to) {
    side = to || (side === "F" ? "B" : "F");
    skipDraw();
    if (reducedMotion()) flipS.jump(side === "F" ? 1 : -1); else flipS.set(side === "F" ? 1 : -1);
    sideL.textContent = side === "B" ? "Bottom side, mirrored" : "";
    announce?.(side === "B" ? "Bottom side" : "Top side");
    if (geo) svg.setAttribute("aria-label", svg.getAttribute("aria-label").replace(/(top|bottom) side$/, `${side === "F" ? "top" : "bottom"} side`));
  }
  function centerOn(ref) {
    const fp = geo?.byRef.get(ref); if (!fp) return;
    const c = fp.querySelector(".court"), x = +c.getAttribute("x") + c.getAttribute("width") / 2, y = +c.getAttribute("y") + c.getAttribute("height") / 2;
    const [px, py] = pz.toScreen([x, y]), r = svg.getBoundingClientRect();
    if (px < 40 || py < 40 || px > r.width - 40 || py > r.height - 40) pz.center([x, y]);
  }
  svg.setAttribute("tabindex", "-1");

  return {
    el: root, svg, show, hide, flip, setNet, netInfo,
    get open() { return !root.hidden; },
    get data() { return data; },
    get side() { return side; },
    get net() { return net; },
    select(refs) { sel = new Set(refs || []); applySel(); if (sel.size === 1 && !root.hidden) centerOn([...sel][0]); },
    hover(ref) { hov = ref || null; applyHover(); },
    setDim(refs) { dim = new Set(refs || []); applyDim(); },
    fit() { if (geo) pz.fit([0, 0, geo.w, geo.h], { pad: padFor() }); },
    zoom(f) { pz.zoom(f); },
    pan(dx, dy) { pz.panBy(dx, dy); },
    layer(name, on) { if (name in layers) { layers[name] = !!on; paintLayers(); } },
    get layers() { return { ...layers }; },
    setLook({ mask, silk, finish } = {}) {
      if (mask) { svg.dataset.mask = mask.name || mask; if (mask.color != null) svg.style.setProperty("--mask-hex", "#" + mask.color.toString(16).padStart(6, "0")); }
      if (silk) svg.dataset.silk = silk;
      if (finish) svg.dataset.finish = finish;
    },
    destroy() { pz.destroy(); flipS.stop(); root.remove(); },
  };
}

// an 18px icon button, the editor's own (.ib)
export const iconBtn = (name, label, f, cls = "ib") => { const b = el("button", cls + " lq-btn", { type: "button", title: label, "aria-label": label }); b.innerHTML = ic(name); b.addEventListener("click", f); return b; };
