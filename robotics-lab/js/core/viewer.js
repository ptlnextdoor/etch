// Viewer: studio scene, lighting, camera, hover / click picking for one board at a time.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const VIEWS = {
  iso: [-0.5, 0.62, 0.78], top: [0, 1, 0.0015], bottom: [0, -1, 0.0015],
  front: [0, 0.24, 1], back: [0, 0.24, -1], left: [-1, 0.24, 0], right: [1, 0.24, 0],
};
const HILITE = 0xff6a2b;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Soft-box photo studio rendered into a PMREM environment map (warm cream room + bright panels). */
export function studioEnv(renderer) {
  const sc = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 24, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.08, 1.04, 0.97), side: THREE.BackSide }));
  room.position.y = 8; sc.add(room);
  const panel = (w, h, x, y, z, k, tint = [1, 1, 1]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(tint[0] * k, tint[1] * k, tint[2] * k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m);
  };
  panel(16, 12, 0, 19, 2, 4.2, [1, 0.97, 0.92]);     // overhead soft box
  panel(10, 12, -16, 9, -11, 6.5, [1, 0.95, 0.88]);       // key (front-left)
  panel(6, 14, 17, 6, 8, 3.5, [0.9, 0.95, 1]);        // cool rim (right)
  panel(12, 3, 0, 5, -19, 2.5, [1, 1, 1]);             // back strip
  // dark cards: give polished metal something to contrast against
  const card = (w, h, x, y, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.1, 0.1), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m); };
  card(3, 16, 19, 6, 14); card(3, 16, -19, 6, 2); card(14, 2.5, 4, 3, 19); card(10, 2, -6, 12, -19);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.42, 0.4, 0.36) }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -3.9; sc.add(floor);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(sc, 0.03).texture;
  pm.dispose(); sc.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return tex;
}

export class Viewer {
  constructor(container, opts = {}) {
    this.el = container;
    this.handlers = {};
    this.autoRotate = false;
    this.viewName = 'iso';
    this.frame = { top: 0, right: 0, bottom: 0, left: 0 };
    this.locked = false;          // true → the viewer's own hover / click picking is off (a tool such as Assembly owns the pointer)
    this.env = null;              // optional lab environment (js/core/labscene.js)
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio || 2));
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 0.95;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    Object.assign(r.domElement.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none', outline: 'none' });
    container.appendChild(r.domElement);

    const scene = this.scene = new THREE.Scene();
    scene.environment = studioEnv(r);
    scene.environmentIntensity = 0.5;
    this.camera = new THREE.PerspectiveCamera(26, 1, 1, 5000);

    const key = this.key = new THREE.DirectionalLight(0xfff1dc, 2.9);
    key.castShadow = true;
    const ms = Math.min(4096, r.capabilities.maxTextureSize);
    key.shadow.mapSize.set(ms, ms); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.06; key.shadow.radius = 2.5;
    scene.add(key, key.target);
    const rim = this.rim = new THREE.DirectionalLight(0xdfe9ff, 0.45); scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xfff6e6, 0xcdbfa6, 0.12));

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.3, color: 0x2a1d0c }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; scene.add(this.ground);

    this.holder = new THREE.Group(); scene.add(this.holder);
    const mkBox = (fill, line) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: HILITE, transparent: true, opacity: fill, depthWrite: false }));
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: HILITE, transparent: true, opacity: line }));
      m.raycast = e.raycast = () => {}; g.add(m, e); g.visible = false; g.renderOrder = 5; return g;
    };
    this.hoverBox = mkBox(0.1, 0.75); this.selBox = mkBox(0.2, 1);

    const c = this.controls = new OrbitControls(this.camera, r.domElement);
    c.enableDamping = true; c.dampingFactor = 0.08; c.rotateSpeed = 0.8; c.zoomSpeed = 0.9; c.panSpeed = 0.8;
    c.minPolarAngle = 0.0015; c.maxPolarAngle = Math.PI - 0.0015;
    c.addEventListener('change', () => { this.dirty = true; });
    c.addEventListener('start', () => { this.dragging = true; this.anim = null; });
    c.addEventListener('end', () => { this.dragging = false; });

    this.ray = new THREE.Raycaster(); this.ptr = new THREE.Vector2(); this.ptrPx = { x: 0, y: 0 };
    const dom = r.domElement;
    dom.addEventListener('pointermove', (e) => { this._setPtr(e); this.pickDirty = true; });
    dom.addEventListener('pointerleave', () => { this.pickDirty = false; this._setHover(null); });
    dom.addEventListener('pointerdown', (e) => { this.down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    dom.addEventListener('pointerup', (e) => {
      if (!this.down) return;
      const d = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y); this.down = null;
      if (d > 6 || this.locked) return;
      this._setPtr(e); const hit = this._pick();
      this._emit('select', hit && hit.id ? { id: hit.id } : null);
    });
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container);
    this.resize();
    this._loop = this._loop.bind(this); requestAnimationFrame(this._loop);
    if (opts.environment !== false) import('./labscene.js').then((m) => { this.env = m.buildLabScene(this); if (this.board) this.env.setBoard?.(this.board, this); this.dirty = true; }).catch(() => {});
  }

  on(name, fn) { (this.handlers[name] ||= []).push(fn); return this; }
  _emit(name, e) { (this.handlers[name] || []).forEach(f => f(e)); }
  _setPtr(e) {
    const b = this.renderer.domElement.getBoundingClientRect();
    this.ptrPx = { x: e.clientX - b.left, y: e.clientY - b.top };
    this.ptr.set((this.ptrPx.x / b.width) * 2 - 1, -(this.ptrPx.y / b.height) * 2 + 1);
  }

  resize() {
    const w = Math.max(2, this.el.clientWidth), h = Math.max(2, this.el.clientHeight);
    this.W = w; this.H = h;
    this.renderer.setSize(w, h, false);
    this._applyFrame(); this.dirty = true;
  }
  /** Insets (px) covered by UI overlays; the board is centred and fitted in the remaining free area. */
  setFrame(f = {}) { Object.assign(this.frame, f); this._applyFrame(); if (this.board) this._goto(this._viewPose(this.viewName), 0); this.dirty = true; }
  _applyFrame() {
    const { W, H, frame: f, camera } = this;
    camera.aspect = W / H;
    const dx = (f.left - f.right) / 2, dy = (f.top - f.bottom) / 2;
    if (dx || dy) camera.setViewOffset(W, H, -dx, -dy, W, H); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  // ───────── board lifecycle ─────────
  async show(def) {
    this._emit('loading', true);
    await new Promise(r => setTimeout(r, 30));
    let built;
    try { built = def.build({ quality: 1 }); } catch (e) { this._emit('loading', false); throw e; }
    this._unload();
    this._mount(built);
    this.def = def;
    this.focusId = null; this._setHover(null); this.selBox.visible = false;
    this._goto(this._viewPose(this.viewName), 0);
    this.dirty = true;
    this._emit('loading', false);
    return built;
  }
  _mount(built) {
    this.board = built;
    const g = built.group;
    const bx = new THREE.Box3().setFromObject(g);
    g.position.y = -bx.min.y;                        // rest on the ground
    this.holder.add(g); g.add(this.hoverBox, this.selBox);
    g.updateMatrixWorld(true);
    const sz = bx.getSize(new THREE.Vector3());
    this.center = new THREE.Vector3(0, sz.y * 0.4, 0);
    this.radius = 0.5 * Math.hypot(built.w, built.h, sz.y * 0.6);
    this._fitLights();
    this.env?.setBoard?.(built, this);
  }
  _unload() {
    if (!this.board) return;
    this.board.group.remove(this.hoverBox, this.selBox);
    this.holder.remove(this.board.group); this.board.dispose(); this.board = null;
  }
  _fitLights() {
    const R = this.radius, k = this.key;
    k.position.set(-R * 1.5, R * 2.4, -R * 1.35); k.target.position.set(0, 0, 0);
    const c = k.shadow.camera; c.left = c.bottom = -R * 1.5; c.right = c.top = R * 1.5; c.near = R * 0.5; c.far = R * 8; c.updateProjectionMatrix();
    this.rim.position.set(R * 2, R * 1.4, R * 2.4);
    this.ground.scale.setScalar(R * 60);
    this.controls.minDistance = R * 0.35; this.controls.maxDistance = R * 9;
    this.camera.near = R * 0.05; this.camera.far = R * 60; this.camera.updateProjectionMatrix();
  }

  // ───────── camera ─────────
  _fitDistance(radius) {
    const f = this.frame, cam = this.camera;
    const fw = Math.max(60, this.W - f.left - f.right), fh = Math.max(60, this.H - f.top - f.bottom);
    const vf = cam.fov * Math.PI / 180, tanV = Math.tan(vf / 2), tanH = tanV * (this.W / this.H);
    const dV = radius / Math.sin(Math.atan(tanV * fh / this.H)), dH = radius / Math.sin(Math.atan(tanH * fw / this.W));
    return Math.max(dV, dH) * 1.02;
  }
  _viewPose(name) {
    const d = new THREE.Vector3(...(VIEWS[name] || VIEWS.iso)).normalize();
    const flat = name === 'top' || name === 'bottom';
    const R = flat ? 0.5 * Math.hypot(this.board.w, this.board.h) : this.radius;
    return { target: this.center.clone(), pos: this.center.clone().addScaledVector(d, this._fitDistance(R) * (flat ? 0.9 : 1)) };
  }
  _goto(pose, dur = 800) {
    if (!dur) { this.camera.position.copy(pose.pos); this.controls.target.copy(pose.target); this.controls.update(); this.anim = null; this.dirty = true; return; }
    const sph = (p, t) => new THREE.Spherical().setFromVector3(p.clone().sub(t));
    const a = sph(this.camera.position, this.controls.target), b = sph(pose.pos, pose.target);
    let dth = b.theta - a.theta; dth = ((dth + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    if (a.phi < 0.02 || a.phi > Math.PI - 0.02) { a.theta = b.theta; dth = 0; }
    if (b.phi < 0.02 || b.phi > Math.PI - 0.02) dth = 0;
    this.anim = { a, dth, b, t0: performance.now(), dur, ta: this.controls.target.clone(), tb: pose.target.clone() };
  }
  setView(name, animate = true) { this.viewName = name; this.focusId = null; if (this.board) this._goto(this._viewPose(name), animate ? 850 : 0); }
  /** Look at a point given in board coordinates (mm), zoom = magnification relative to the fitted view. */
  lookAtBoard(x, y, zoom = 2, animate = false) {
    const b = this.board; if (!b) return;
    const t = new THREE.Vector3(x - b.w / 2, b.group.position.y, -(y - b.h / 2));
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this._goto({ target: t, pos: t.clone().addScaledVector(dir, this._fitDistance(this.radius) / zoom) }, animate ? 800 : 0);
  }
  focus(id, animate = true) {
    this.focusId = id || null; this.highlight(id);
    if (!this.board) return;
    if (!id || !this.board.parts[id]) { this._goto(this._viewPose(this.viewName), animate ? 800 : 0); return; }
    const p = this.board.parts[id], g = this.board.group;
    const t = p.center.clone().applyMatrix4(g.matrixWorld);
    const size = p.box.getSize(new THREE.Vector3()).length();
    let dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const top = p.center.y > -this.board.t / 2;
    if (top && dir.y < 0.35) { dir.y = 0.6; dir.normalize(); }
    if (!top && dir.y > -0.35) { dir.set(dir.x, -0.75, dir.z).normalize(); }
    const dist = Math.max(this._fitDistance(Math.max(size * 1.15, this.radius * 0.34)), this.controls.minDistance * 1.2);
    this._goto({ target: t, pos: t.clone().addScaledVector(dir, dist) }, animate ? 900 : 0);
  }
  highlight(id) { this._setBox(this.selBox, id); this.dirty = true; }
  _setBox(box, id) {
    const p = id && this.board && this.board.parts[id];
    if (!p) { box.visible = false; return; }
    const s = p.box.getSize(new THREE.Vector3()).addScalar(0.5);
    box.position.copy(p.center); box.scale.copy(s); box.visible = true;
  }
  partIds() { return this.board ? Object.keys(this.board.parts) : []; }
  project(id) {
    const p = this.board && this.board.parts[id]; if (!p) return { x: 0, y: 0, visible: false };
    const g = this.board.group, top = p.center.y > -this.board.t / 2;
    const v = new THREE.Vector3(p.center.x, top ? p.box.max.y : p.box.min.y, p.center.z).applyMatrix4(g.matrixWorld);
    const camAbove = this.camera.position.y > g.position.y - this.board.t / 2;
    v.project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.W, y: (-v.y * 0.5 + 0.5) * this.H, visible: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && top === camAbove };
  }

  // ───────── picking ─────────
  _pick() {
    if (!this.board) return null;
    this.ray.setFromCamera(this.ptr, this.camera);
    const hits = this.ray.intersectObject(this.board.group, true);
    if (!hits.length) return null;
    const h = hits[0]; let o = h.object, id = null;
    while (o && o !== this.board.group) { if (o.userData.partId) { id = o.userData.partId; break; } o = o.parent; }
    const lp = this.board.group.worldToLocal(h.point.clone());
    const bx = lp.x + this.board.w / 2, by = -lp.z + this.board.h / 2;
    let pin = null, best = 1.35;
    for (const p of this.board.pins) { const d = Math.hypot(p.x - bx, p.y - by); if (d < best) { best = d; pin = p; } }
    return { id, pin };
  }
  _setHover(hit) {
    const key = hit ? (hit.pin ? 'pin:' + hit.pin.name + hit.pin.x + hit.pin.y : 'part:' + hit.id) : '';
    const moved = hit && (hit.pin || hit.id);
    if (key !== this.hoverKey) {
      this.hoverKey = key;
      this._setBox(this.hoverBox, hit && hit.id && hit.id !== this.focusId ? hit.id : null);
      this.renderer.domElement.style.cursor = hit && (hit.id || hit.pin) ? 'pointer' : 'grab';
      this.dirty = true;
    }
    if (!moved) { if (this.lastHover) { this.lastHover = null; this._emit('hover', null); } return; }
    const e = hit.pin ? { type: 'pin', pin: hit.pin, id: hit.id, x: this.ptrPx.x, y: this.ptrPx.y } : { type: 'part', id: hit.id, x: this.ptrPx.x, y: this.ptrPx.y };
    this.lastHover = e; this._emit('hover', e);
  }

  // ───────── loop ─────────
  _loop(now) {
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.1, (now - (this._last || now)) / 1000); this._last = now;
    this._emit('tick', { now, dt });
    if (this.anim) {
      const an = this.anim, k = ease(Math.min(1, (now - an.t0) / an.dur));
      const s = new THREE.Spherical(an.a.radius + (an.b.radius - an.a.radius) * k, an.a.phi + (an.b.phi - an.a.phi) * k, an.a.theta + an.dth * k);
      this.controls.target.lerpVectors(an.ta, an.tb, k);
      this.camera.position.setFromSpherical(s).add(this.controls.target);
      this.camera.lookAt(this.controls.target);
      if (k >= 1) this.anim = null;
      this.dirty = true;
    } else {
      this.controls.autoRotate = this.autoRotate && !this.dragging && !this.focusId; this.controls.autoRotateSpeed = 0.7;
      this.controls.update();
    }
    if (this.locked) this.pickDirty = false;
    if (this.pickDirty && !this.dragging && !this.anim) { this.pickDirty = false; const h = this._pick(); this._setHover(h && (h.id || h.pin) ? h : null); }
    if (this.dirty && this.board) {
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
      this._emit('frame');
    }
  }

  // ───────── thumbnails ─────────
  async thumbnail(def, { w = 640, h = 440, view = 'iso' } = {}) {
    await new Promise(r => setTimeout(r, 0));
    const built = def.build({ quality: 0.5 });
    const save = { board: this.board, center: this.center, radius: this.radius, W: this.W, H: this.H, frame: this.frame, pr: this.renderer.getPixelRatio(),
      pos: this.camera.position.clone(), tgt: this.controls.target.clone(), anim: this.anim };
    if (save.board) save.board.group.visible = false;
    this.board = null; this._mount(built);
    this.frame = { top: 0, right: 0, bottom: 0, left: 0 };
    this.renderer.setPixelRatio(1); this.W = w; this.H = h; this.renderer.setSize(w, h, false); this._applyFrame();
    const pose = this._viewPose(view); this.camera.position.copy(pose.pos); this.camera.lookAt(pose.target);
    this.hoverBox.visible = this.selBox.visible = false;
    const bg = this.scene.background; this.scene.background = null; this.env?.setVisible?.(false); this.ground.visible = true;
    this.renderer.render(this.scene, this.camera);
    this.scene.background = bg; this.env?.setVisible?.(true);
    const url = this.renderer.domElement.toDataURL('image/png');
    built.group.remove(this.hoverBox, this.selBox); this.holder.remove(built.group); built.dispose();
    this.board = save.board; this.center = save.center; this.radius = save.radius; this.frame = save.frame;
    this.renderer.setPixelRatio(save.pr); this.W = save.W; this.H = save.H; this.renderer.setSize(save.W, save.H, false); this._applyFrame();
    if (this.board) {
      this.board.group.visible = true; this.board.group.add(this.hoverBox, this.selBox); this._fitLights(); this.env?.setBoard?.(this.board, this);
      this.camera.position.copy(save.pos); this.controls.target.copy(save.tgt); this.camera.lookAt(save.tgt); this.anim = save.anim;
      this._setBox(this.selBox, this.focusId);
      this.renderer.render(this.scene, this.camera);
    }
    return url;
  }
}
