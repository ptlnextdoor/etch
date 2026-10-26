// Pan and zoom for an SVG drawn in millimetres, on one spring, written to the viewBox each frame so strokes and text
// stay crisp. The same engine as the "How Etch works" diagram (stack-help.js): wheel zooms about the pointer
// (ctrl / trackpad pinch is finer), a drag pans once it has moved 5 px and flings on a quick release, two pointers
// pinch, a double click fits. k is px per mm, kept between 0.6× and 12× the fit.
//
//   const pz = createPanZoom(svg, { onChange(k), onInput() });
//   pz.fit(boxMm, { pad: { l, t, r, b }, jump });   pz.zoomAt(px, py, factor);   pz.panBy(dx, dy);
//   pz.center([x, y]);   pz.toScreen([x, y]) -> [px, py];   pz.toWorld([px, py]) -> [x, y];   pz.k;   pz.destroy()
import { spring, clamp, lerp, reducedMotion } from "../ui/spring.js";

export function createPanZoom(svg, { onChange, onInput, minK = 0, maxK = Infinity } = {}) {
  let vw = 0, vh = 0, fitK = 1, lastBox = null, lastPad = null, alive = true, settleT = 0;
  const view = spring({ x: 0, y: 0, k: 1 }, {
    preset: { stiffness: 240, damping: 30 }, precision: 0.05,
    onUpdate: (v) => {
      if (!vw || !vh) return;
      svg.setAttribute("viewBox", `${-v.x / v.k} ${-v.y / v.k} ${vw / v.k} ${vh / v.k}`);
      svg.classList.add("moving");
      clearTimeout(settleT); settleT = setTimeout(() => svg.classList.remove("moving"), 90);
      onChange?.(v.k, v);
    },
  });
  const size = () => { const r = svg.getBoundingClientRect(); vw = r.width; vh = r.height; };
  const kRange = (k) => clamp(k, Math.max(minK, fitK * 0.6), Math.min(maxK, Math.max(60, fitK * 12)));

  function fit(box = lastBox, { pad = lastPad || { l: 64, t: 32, r: 32, b: 96 }, jump = false } = {}) {
    size();
    if (!box || !vw || !vh) return;
    lastBox = box; lastPad = pad;
    const bw = Math.max(0.1, box[2] - box[0]), bh = Math.max(0.1, box[3] - box[1]);
    const aw = Math.max(40, vw - pad.l - pad.r), ah = Math.max(40, vh - pad.t - pad.b);
    fitK = Math.min(aw / bw, ah / bh);
    const to = { k: fitK, x: pad.l + (aw - bw * fitK) / 2 - box[0] * fitK, y: pad.t + (ah - bh * fitK) / 2 - box[1] * fitK };
    if (jump || reducedMotion()) view.jump(to); else view.set(to, { preset: { stiffness: 240, damping: 30 } });
  }
  function zoomAt(cx, cy, factor, jump = false) {
    const t = jump ? view.value : view.target;
    const k = kRange(t.k * factor), f = k / t.k;
    const to = { k, x: cx - (cx - t.x) * f, y: cy - (cy - t.y) * f };
    if (jump) view.jump(to); else view.set(to);
  }
  const panBy = (dx, dy) => { const t = view.target; view.set({ x: t.x + dx, y: t.y + dy, k: t.k }); };
  function center([x, y], k = view.target.k) {
    size();
    view.set({ k, x: vw / 2 - x * k, y: vh / 2 - y * k });
  }
  const toScreen = ([x, y]) => { const v = view.value; return [v.x + x * v.k, v.y + y * v.k]; };
  const toWorld = ([px, py]) => { const v = view.value; return [(px - v.x) / v.k, (py - v.y) / v.k]; };
  const local = (e) => { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  // ---- input ----
  const onWheel = (e) => {
    e.preventDefault(); onInput?.();
    const [x, y] = local(e);
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(x, y, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018)));
  };
  const ptrs = new Map();
  let drag = null, moved = false, vel = { x: 0, y: 0 }, lastT = 0, pinch = null;
  const down = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest(".pv-ui, .fv-msg, button, a")) return;
    onInput?.();
    ptrs.set(e.pointerId, local(e));
    moved = false;
    if (ptrs.size === 1) { const v = view.value; drag = { sx: e.clientX, sy: e.clientY, x: v.x, y: v.y, id: e.pointerId }; vel = { x: 0, y: 0 }; lastT = performance.now(); }
    else if (ptrs.size === 2) { const [a, b] = Array.from(ptrs.values()); pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1 }; drag = null; }
  };
  const move = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId), cur = local(e);
    ptrs.set(e.pointerId, cur);
    if (pinch && ptrs.size === 2) {
      const [a, b] = Array.from(ptrs.values());
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
      zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch.d, true);
      pinch.d = d; moved = true;
      return;
    }
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    if (!moved) { moved = true; svg.classList.add("dragging"); try { svg.setPointerCapture(e.pointerId); } catch (err) { /* already gone */ } }
    const now = performance.now(), dt = Math.max(1, now - lastT);
    vel = { x: lerp(vel.x, ((cur[0] - prev[0]) / dt) * 1000, 0.4), y: lerp(vel.y, ((cur[1] - prev[1]) / dt) * 1000, 0.4) };
    lastT = now;
    view.jump({ x: drag.x + dx, y: drag.y + dy, k: view.value.k });
  };
  const up = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (drag && drag.id === e.pointerId) {
      if (moved && performance.now() - lastT < 80 && !reducedMotion()) { const v = view.value; view.set({ x: v.x + vel.x * 0.16, y: v.y + vel.y * 0.16, k: v.k }, { preset: { stiffness: 120, damping: 22 } }); }
      drag = null;
    }
    svg.classList.remove("dragging");
  };
  const dbl = (e) => { if (!e.target.closest(".pv-ui, button, a")) { onInput?.(); fit(); } };
  svg.addEventListener("wheel", onWheel, { passive: false });
  svg.addEventListener("pointerdown", down);
  svg.addEventListener("pointermove", move);
  svg.addEventListener("pointerup", up);
  svg.addEventListener("pointercancel", up);
  svg.addEventListener("dblclick", dbl);
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => { if (alive && lastBox && svg.isConnected) fit(lastBox, { pad: lastPad, jump: true }); }) : null;
  ro?.observe(svg);

  return {
    fit, zoomAt, panBy, center, toScreen, toWorld,
    get k() { return view.value.k; },
    get fitK() { return fitK; },
    get moved() { return moved; },  // true during and right after a drag, so a click on release does not select
    zoom(factor) { size(); zoomAt(vw / 2, vh / 2, factor); },
    destroy() {
      alive = false; ro?.disconnect(); view.stop();
      svg.removeEventListener("wheel", onWheel); svg.removeEventListener("pointerdown", down); svg.removeEventListener("pointermove", move);
      svg.removeEventListener("pointerup", up); svg.removeEventListener("pointercancel", up); svg.removeEventListener("dblclick", dbl);
    },
  };
}
