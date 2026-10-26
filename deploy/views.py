"""The 2D views of a finished build, its numbers, and the questions Etch asks before it builds.

Everything here is read straight out of the run's own KiCad files with the engine's s-expression reader
(engine/etchlib/sexpr.py). No kicad-cli: the page draws the geometry itself, so parts and nets stay clickable,
and the module runs anywhere Python runs (tests, the Linux container, a Mac without KiCad open).

  pcb2d(run)      -> view/pcb2d.json      the board flat: outline, copper tracks and fills, pads with their nets,
                                          vias, silkscreen, each footprint's box and refdes, in board millimetres
  sheet(run)      -> view/schematic.json  the schematic: every symbol's library graphics and pins (already placed on
                                          the sheet), net labels, wires, and which net each pin is on
  stats(run)      -> view/stats.json      the numbers of the board (size, layers, parts, pads, vias, track length,
                                          nets), every check it passed or failed, and a rough bare-board estimate
  clarify(text, level)                    one to three questions with Etch's recommended answer picked, from rules
                                          (no model call), for the start screen before a design build

Only `live-*` runs with a design.json are served; anything else is None (the route answers 404). Results are cached
next to board.glb and rebuilt when the board or schematic file changes.
"""

from __future__ import annotations

import itertools
import json
import math
import os
import re
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "engine"))
from etchlib import sexpr

OUT = Path(os.environ.get("ETCH_OUT", str(ROOT / "engine" / "out")))
RUN_RE = re.compile(r"^live-\d{6,20}$")
# mounting holes, fiducials, test points and logos are footprints, not parts anyone buys
NOT_A_PART = re.compile(r"^(H|MH|FID|TP|LOGO|G\*{0,2})\d*$")
PARSE_LOCK = (
    threading.RLock()
)  # one parse at a time (a big board is a few hundred ms of CPU); sheet and stats nest pcb2d


# ---------------------------------------------------------------- files and cache
def run_dir(run: str) -> Path | None:
    if not isinstance(run, str) or not RUN_RE.match(run):
        return None
    d = OUT / run
    if not (d / "design.json").is_file():
        return None
    return d


def _board_file(d: Path, suffix: str) -> Path | None:
    for p in sorted(d.glob(f"*{suffix}")):
        if not p.name.startswith("_"):
            return p
    return None


def _cached(d: Path, name: str, sources: list[Path], build) -> dict | None:
    """view/<name> when it is at least as new as every source file, else build() and keep it."""
    srcs = [s for s in sources if s is not None and s.is_file()]
    if not srcs:
        return None
    p = d / "view" / name
    try:
        newest = max(s.stat().st_mtime for s in srcs)
        if p.stat().st_mtime >= newest:
            return json.loads(p.read_text())
    except (OSError, ValueError):
        pass
    with PARSE_LOCK:
        res = build()
    if res is None:
        return None
    try:
        (d / "view").mkdir(exist_ok=True)
        tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps(res, separators=(",", ":")))
        tmp.replace(p)
    except OSError:
        pass
    return res


def cached_only(run: str, name: str) -> dict | None:
    """The cached view if it exists (no parsing), for gallery rows and other hot paths."""
    d = run_dir(run)
    if d is None:
        return None
    try:
        return json.loads((d / "view" / name).read_text())
    except (OSError, ValueError):
        return None


# ---------------------------------------------------------------- s-expression helpers
def _f(x, default=0.0) -> float:
    try:
        return float(x)
    except (TypeError, ValueError):
        return default


def _r(x: float, nd: int = 3) -> float:
    v = round(float(x), nd)
    return 0.0 if v == 0 else v


def _node(n, head):
    return sexpr.find(n, head) if isinstance(n, list) else None


def _nodes(n, head):
    return sexpr.find_all(n, head) if isinstance(n, list) else []


def _at(n) -> tuple[float, float, float]:
    a = _node(n, "at")
    if not a:
        return 0.0, 0.0, 0.0
    return _f(a[1]), _f(a[2]), _f(a[3]) if len(a) > 3 else 0.0


def _xy(n) -> tuple[float, float]:
    return (_f(n[1]), _f(n[2])) if n and len(n) > 2 else (0.0, 0.0)


def _pts(n) -> list[tuple[float, float]]:
    p = _node(n, "pts")
    return [_xy(xy) for xy in _nodes(p, "xy")] if p else []


def _layer(n) -> str:
    lay = _node(n, "layer")
    if lay:
        return str(lay[1])
    lays = _node(n, "layers")
    return str(lays[1]) if lays and len(lays) > 1 else ""


def _layers(n) -> list[str]:
    lays = _node(n, "layers")
    return [str(x) for x in lays[1:]] if lays else []


def _hidden(n) -> bool:
    """`(hide yes)` on a property, or inside its effects; the old `hide` bare token too."""
    for scope in (n, _node(n, "effects") or []):
        for c in scope[1:] if isinstance(scope, list) else []:
            if c == "hide" or (isinstance(c, list) and c and c[0] == "hide" and (len(c) == 1 or str(c[1]) != "no")):
                return True
    return False


def _font_size(n, default=1.0) -> float:
    eff = _node(n, "effects")
    font = _node(eff, "font") if eff else None
    size = _node(font, "size") if font else None
    return _f(size[1], default) if size else default


def _rot(x: float, y: float, deg: float) -> tuple[float, float]:
    """Rotate a board-relative point by a footprint angle (KiCad: positive turns anticlockwise on screen, y down)."""
    if not deg:
        return x, y
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return x * c + y * s, -x * s + y * c


def _side(layer: str) -> str:
    if layer.startswith("B."):
        return "B"
    if layer.startswith("F."):
        return "F"
    return "*"


def _kind(layer: str) -> str | None:
    if layer.endswith((".SilkS", ".Silkscreen")):
        return "silk"
    if layer.endswith((".CrtYd", ".Courtyard")):
        return "crtyd"
    if layer.endswith(".Fab"):
        return "fab"
    return None


def _arc_points(p0, p1, p2, n: int = 10) -> list[tuple[float, float]]:
    """A KiCad arc given as start, mid, end, sampled into a polyline."""
    (x0, y0), (x1, y1), (x2, y2) = p0, p1, p2
    d = 2 * (x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1))
    if abs(d) < 1e-9:
        return [p0, p2]
    ux = ((x0**2 + y0**2) * (y1 - y2) + (x1**2 + y1**2) * (y2 - y0) + (x2**2 + y2**2) * (y0 - y1)) / d
    uy = ((x0**2 + y0**2) * (x2 - x1) + (x1**2 + y1**2) * (x0 - x2) + (x2**2 + y2**2) * (x1 - x0)) / d
    r = math.hypot(x0 - ux, y0 - uy)
    a0, a1, a2 = (math.atan2(y - uy, x - ux) for x, y in (p0, p1, p2))

    # sweep from a0 through a1 to a2
    def norm(a):
        while a < 0:
            a += 2 * math.pi
        return a

    sweep = norm(a2 - a0)
    if norm(a1 - a0) > sweep:
        sweep -= 2 * math.pi
    out = []
    for i in range(n + 1):
        a = a0 + sweep * i / n
        out.append((ux + r * math.cos(a), uy + r * math.sin(a)))
    return out


# ---------------------------------------------------------------- the board, flat
def _graphic(n, fx=0.0, fy=0.0, frot=0.0) -> dict | None:
    """One gr_*/fp_* drawing item as a polyline in board coordinates (closed shapes repeat their first point)."""
    head = str(n[0])
    kind = head.split("_", 1)[-1]
    pts: list[tuple[float, float]] = []
    if kind == "line":
        pts = [_xy(_node(n, "start")), _xy(_node(n, "end"))]
    elif kind == "rect":
        (x0, y0), (x1, y1) = _xy(_node(n, "start")), _xy(_node(n, "end"))
        pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]
    elif kind == "arc":
        if _node(n, "mid"):
            pts = _arc_points(_xy(_node(n, "start")), _xy(_node(n, "mid")), _xy(_node(n, "end")))
        else:  # old format: start is the centre, end a point on the arc, angle the sweep
            cx, cy = _xy(_node(n, "start"))
            ex, ey = _xy(_node(n, "end"))
            ang = _node(n, "angle")
            sweep = math.radians(_f(ang[1]) if ang else 90)
            r = math.hypot(ex - cx, ey - cy)
            a0 = math.atan2(ey - cy, ex - cx)
            pts = [(cx + r * math.cos(a0 + sweep * i / 10), cy + r * math.sin(a0 + sweep * i / 10)) for i in range(11)]
    elif kind == "circle":
        cx, cy = _xy(_node(n, "center"))
        ex, ey = _xy(_node(n, "end"))
        r = math.hypot(ex - cx, ey - cy)
        pts = [(cx + r * math.cos(2 * math.pi * i / 24), cy + r * math.sin(2 * math.pi * i / 24)) for i in range(25)]
    elif kind == "poly":
        pts = _pts(n)
        if pts:
            pts = pts + [pts[0]]
    if len(pts) < 2:
        return None
    w = _node(n, "width")
    if not w:
        st = _node(n, "stroke")
        w = _node(st, "width") if st else None
    width = _f(w[1], 0.12) if w else 0.12
    out = []
    for x, y in pts:
        rx, ry = _rot(x, y, frot)
        out.append((_r(fx + rx), _r(fy + ry)))
    return {"layer": _layer(n), "w": _r(width), "pts": [v for xy in out for v in xy]}


def _pad(n, fx, fy, frot, nets: dict[int, str]) -> dict:
    num = str(n[1])
    kind, shape = str(n[2]), str(n[3])
    px, py, prot = _at(n)
    rx, ry = _rot(px, py, frot)
    size = _node(n, "size")
    sw, sh = (_f(size[1]), _f(size[2])) if size else (1.0, 1.0)
    net = _node(n, "net")
    net_name = ""
    if net:
        net_name = str(net[2]) if len(net) > 2 else nets.get(int(_f(net[1])), "")
    lays = _layers(n)
    side = (
        "*"
        if any(x in ("*.Cu",) for x in lays) or kind in ("thru_hole", "np_thru_hole")
        else ("B" if "B.Cu" in lays else "F")
    )
    pad = {
        "num": num,
        "kind": kind,
        "shape": shape,
        "at": [_r(fx + rx), _r(fy + ry)],
        "size": [_r(sw), _r(sh)],
        "rot": _r(prot % 360, 1),
        "side": side,
        "net": net_name,
    }
    drill = _node(n, "drill")
    if drill:
        vals = [_f(x) for x in drill[1:] if not isinstance(x, list) and re.match(r"^-?[\d.]+$", str(x))]
        if vals:
            pad["drill"] = [_r(v) for v in vals[:2]]
    if shape == "roundrect":
        rr = _node(n, "roundrect_rratio")
        pad["rr"] = _r(_f(rr[1], 0.25), 3) if rr else 0.25
    return pad


def _footprint(n, nets: dict[int, str]) -> dict | None:
    name = str(n[1]) if len(n) > 1 and not isinstance(n[1], list) else ""
    fx, fy, frot = _at(n)
    layer = _layer(n)
    side = "B" if layer.startswith("B.") else "F"
    ref, value = "", ""
    texts: list[dict] = []
    for p in _nodes(n, "property"):
        if len(p) > 2 and not isinstance(p[2], list):
            key, val = str(p[1]), str(p[2])
            if key == "Reference":
                ref = val
            elif key == "Value":
                value = val
            if key in ("Reference", "Value") and not _hidden(p) and _kind(_layer(p)) == "silk":
                tx, ty, trot = _at(p)
                rx, ry = _rot(tx, ty, frot)
                texts.append(
                    {
                        "text": val,
                        "at": [_r(fx + rx), _r(fy + ry)],
                        "rot": _r(trot % 360, 1),
                        "size": _r(_font_size(p)),
                        "side": _side(_layer(p)),
                    }
                )
    for t in _nodes(n, "fp_text"):  # KiCad 5/6 files
        if len(t) > 2:
            kind, val = str(t[1]), str(t[2])
            if kind == "reference":
                ref = ref or val
            elif kind == "value":
                value = value or val
            if (
                kind in ("reference", "value", "user")
                and not _hidden(t)
                and _kind(_layer(t)) == "silk"
                and val not in ("%R", "%V")
            ):
                tx, ty, trot = _at(t)
                rx, ry = _rot(tx, ty, frot)
                texts.append(
                    {
                        "text": val,
                        "at": [_r(fx + rx), _r(fy + ry)],
                        "rot": _r(trot % 360, 1),
                        "size": _r(_font_size(t)),
                        "side": _side(_layer(t)),
                    }
                )
    if not ref:
        return None
    attr = _node(n, "attr")
    smd = bool(attr and "smd" in [str(x) for x in attr[1:]])
    lines = []
    for g in n:
        if isinstance(g, list) and g and str(g[0]) in ("fp_line", "fp_rect", "fp_arc", "fp_circle", "fp_poly"):
            k = _kind(_layer(g))
            if k:
                item = _graphic(g, fx, fy, frot)
                if item:
                    item["kind"] = k
                    item["side"] = _side(item.pop("layer"))
                    lines.append(item)
    pads = [_pad(p, fx, fy, frot, nets) for p in _nodes(n, "pad")]
    # the part's box: its courtyard, else its fab outline, else the pads with a margin
    xs: list[float] = []
    ys: list[float] = []
    for pref in ("crtyd", "fab", "silk"):
        for ln in lines:
            if ln["kind"] == pref:
                xs += ln["pts"][0::2]
                ys += ln["pts"][1::2]
        if xs:
            break
    if not xs:
        for p in pads:
            hw, hh = p["size"][0] / 2, p["size"][1] / 2
            if p["rot"] % 180 >= 45:
                hw, hh = hh, hw
            xs += [p["at"][0] - hw - 0.25, p["at"][0] + hw + 0.25]
            ys += [p["at"][1] - hh - 0.25, p["at"][1] + hh + 0.25]
    box = (
        [_r(min(xs)), _r(min(ys)), _r(max(xs)), _r(max(ys))] if xs else [_r(fx - 1), _r(fy - 1), _r(fx + 1), _r(fy + 1)]
    )
    return {
        "ref": ref,
        "value": value,
        "footprint": name,
        "side": side,
        "at": [_r(fx), _r(fy)],
        "rot": _r(frot % 360, 1),
        "smd": smd,
        "part": not NOT_A_PART.match(ref),
        "box": box,
        "lines": lines,
        "pads": pads,
        "texts": texts,
    }


def parse_pcb(text: str) -> dict:
    """pcb2d's data from a .kicad_pcb's text (KiCad 5 to 10 files)."""
    doc = sexpr.parse(text)
    nets: dict[int, str] = {}
    for n in _nodes(doc, "net"):
        if len(n) > 2:
            nets[int(_f(n[1]))] = str(n[2])
    copper = []
    lays = _node(doc, "layers")
    for lay in lays[1:] if lays else []:
        if (
            isinstance(lay, list)
            and len(lay) > 2
            and str(lay[1]).endswith(".Cu")
            and str(lay[2]) in ("signal", "power", "mixed", "jumper")
        ):
            copper.append(str(lay[1]))
    parts, outline, silk, tracks, vias, zones = [], [], [], [], [], []
    for n in doc:
        if not isinstance(n, list) or not n:
            continue
        head = str(n[0])
        if head in ("footprint", "module"):
            fp = _footprint(n, nets)
            if fp:
                parts.append(fp)
        elif head in ("gr_line", "gr_rect", "gr_arc", "gr_circle", "gr_poly"):
            g = _graphic(n)
            if not g:
                continue
            if g["layer"] == "Edge.Cuts":
                g.pop("layer")
                outline.append(g)
            elif _kind(g["layer"]) == "silk":
                g["side"] = _side(g.pop("layer"))
                silk.append(g)
        elif head == "gr_text" and len(n) > 1 and _kind(_layer(n)) == "silk":
            tx, ty, trot = _at(n)
            silk.append(
                {
                    "text": str(n[1]),
                    "at": [_r(tx), _r(ty)],
                    "rot": _r(trot % 360, 1),
                    "size": _r(_font_size(n)),
                    "side": _side(_layer(n)),
                }
            )
        elif head == "segment":
            (x0, y0), (x1, y1) = _xy(_node(n, "start")), _xy(_node(n, "end"))
            w = _node(n, "width")
            net = _node(n, "net")
            tracks.append(
                {
                    "side": _side(_layer(n)),
                    "w": _r(_f(w[1], 0.2) if w else 0.2),
                    "net": nets.get(int(_f(net[1])), "") if net else "",
                    "pts": [_r(x0), _r(y0), _r(x1), _r(y1)],
                }
            )
        elif head == "arc" and _node(n, "mid"):
            pts = _arc_points(_xy(_node(n, "start")), _xy(_node(n, "mid")), _xy(_node(n, "end")))
            w = _node(n, "width")
            net = _node(n, "net")
            tracks.append(
                {
                    "side": _side(_layer(n)),
                    "w": _r(_f(w[1], 0.2) if w else 0.2),
                    "net": nets.get(int(_f(net[1])), "") if net else "",
                    "pts": [_r(v) for xy in pts for v in xy],
                }
            )
        elif head == "via":
            vx, vy, _ = _at(n)
            size, drill, net = _node(n, "size"), _node(n, "drill"), _node(n, "net")
            vias.append(
                {
                    "at": [_r(vx), _r(vy)],
                    "size": _r(_f(size[1], 0.6) if size else 0.6),
                    "drill": _r(_f(drill[1], 0.3) if drill else 0.3),
                    "net": nets.get(int(_f(net[1])), "") if net else "",
                }
            )
        elif head == "zone":
            net = _node(n, "net_name")
            name = str(net[1]) if net else ""
            polys = []
            for fp in _nodes(n, "filled_polygon"):
                pts = _pts(fp)
                if len(pts) >= 3:
                    polys.append({"side": _side(_layer(fp) or _layer(n)), "pts": [_r(v) for xy in pts for v in xy]})
            if polys:
                zones.append({"net": name, "polys": polys})
    # the board's box: the edge cuts, else everything that is on it
    xs: list[float] = []
    ys: list[float] = []
    for g in outline:
        xs += g["pts"][0::2]
        ys += g["pts"][1::2]
    if not xs:
        for p in parts:
            xs += [p["box"][0], p["box"][2]]
            ys += [p["box"][1], p["box"][3]]
        for t in tracks:
            xs += t["pts"][0::2]
            ys += t["pts"][1::2]
    box = [_r(min(xs)), _r(min(ys)), _r(max(xs)), _r(max(ys))] if xs else [0, 0, 10, 10]
    net_names = sorted({nm for nm in nets.values() if nm})
    return {
        "ok": True,
        "units": "mm",
        "box": box,
        "w": _r(box[2] - box[0], 2),
        "h": _r(box[3] - box[1], 2),
        "copper": copper or ["F.Cu", "B.Cu"],
        "outline": outline,
        "parts": parts,
        "tracks": tracks,
        "vias": vias,
        "zones": zones,
        "silk": silk,
        "nets": net_names,
    }


def pcb2d(run: str) -> dict | None:
    d = run_dir(run)
    if d is None:
        return None
    pcb = _board_file(d, ".kicad_pcb")
    if pcb is None:
        return None
    return _cached(d, "pcb2d.json", [pcb], lambda: parse_pcb(pcb.read_text()))


# ---------------------------------------------------------------- the schematic
def _lib_symbols(doc) -> dict[str, list]:
    libs = _node(doc, "lib_symbols")
    out = {}
    for s in _nodes(libs, "symbol") if libs else []:
        out[str(s[1])] = s
    return out


def _sym_graphics(lib: dict[str, list], lib_id: str, unit: int, depth: int = 0) -> tuple[list[dict], list[dict], dict]:
    """The drawing items and pins of one unit (plus the shared unit 0) of a library symbol, in library
    coordinates (y up). Derived symbols (`extends`) draw their parent."""
    node = lib.get(lib_id)
    if node is None or depth > 4:
        return [], [], {}
    ext = _node(node, "extends")
    if ext:
        parent = str(ext[1])
        if ":" not in parent and ":" in lib_id:
            parent = lib_id.split(":", 1)[0] + ":" + parent
        g, p, meta = _sym_graphics(lib, parent, unit, depth + 1)
        return g, p, meta
    meta = {
        "pin_numbers": not _hidden(_node(node, "pin_numbers") or []),
        "pin_names": not _hidden(_node(node, "pin_names") or []),
        "name_offset": 0.508,
    }
    pn = _node(node, "pin_names")
    off = _node(pn, "offset") if pn else None
    if off:
        meta["name_offset"] = _f(off[1], 0.508)
    graphics: list[dict] = []
    pins: list[dict] = []
    for sub in _nodes(node, "symbol"):
        tail = str(sub[1]).rsplit("_", 2)
        try:
            u, style = int(tail[-2]), int(tail[-1])
        except (ValueError, IndexError):
            u, style = 1, 1
        if style != 1 or u not in (0, unit):
            continue
        for g in sub:
            if not isinstance(g, list) or not g:
                continue
            head = str(g[0])
            fill = _node(g, "fill")
            ftype = str(_node(fill, "type")[1]) if fill and _node(fill, "type") else "none"
            if head == "rectangle":
                (x0, y0), (x1, y1) = _xy(_node(g, "start")), _xy(_node(g, "end"))
                graphics.append(
                    {
                        "kind": "poly",
                        "fill": ftype,
                        "pts": [_r(x0), _r(y0), _r(x1), _r(y0), _r(x1), _r(y1), _r(x0), _r(y1), _r(x0), _r(y0)],
                    }
                )
            elif head == "polyline":
                pts = _pts(g)
                if len(pts) >= 2:
                    graphics.append({"kind": "poly", "fill": ftype, "pts": [_r(v) for xy in pts for v in xy]})
            elif head == "circle":
                cx, cy = _xy(_node(g, "center"))
                rad = _node(g, "radius")
                graphics.append(
                    {"kind": "circle", "fill": ftype, "at": [_r(cx), _r(cy)], "r": _r(_f(rad[1], 1) if rad else 1)}
                )
            elif head == "arc":
                pts = _arc_points(_xy(_node(g, "start")), _xy(_node(g, "mid")), _xy(_node(g, "end")))
                graphics.append({"kind": "poly", "fill": "none", "pts": [_r(v) for xy in pts for v in xy]})
            elif head == "text" and len(g) > 1:
                tx, ty, trot = _at(g)
                graphics.append(
                    {
                        "kind": "text",
                        "text": str(g[1]),
                        "at": [_r(tx), _r(ty)],
                        "rot": _r(trot, 1),
                        "size": _r(_font_size(g, 1.27)),
                    }
                )
            elif head == "pin":
                px, py, pang = _at(g)
                ln = _node(g, "length")
                name_n, num_n = _node(g, "name"), _node(g, "number")
                pins.append(
                    {
                        "num": str(num_n[1]) if num_n else "",
                        "name": str(name_n[1]) if name_n else "",
                        "etype": str(g[1]) if len(g) > 1 and not isinstance(g[1], list) else "",
                        "at": [_r(px), _r(py)],
                        "angle": _r(pang % 360, 1),
                        "len": _r(_f(ln[1], 2.54) if ln else 2.54),
                        "hide": any(c == "hide" for c in g[1:4]) or _hidden(g),
                    }
                )
    return graphics, pins, meta


def _place(x: float, y: float, X: float, Y: float, rot: float, mirror: str) -> tuple[float, float]:
    """A library point (y up) onto the sheet (y down) through the instance's rotation and mirror."""
    a = math.radians(rot)
    c, s = math.cos(a), math.sin(a)
    rx, ry = x * c - y * s, x * s + y * c
    if mirror == "x":
        ry = -ry
    elif mirror == "y":
        rx = -rx
    return X + rx, Y - ry


def parse_sch(text: str, pad_nets: dict[tuple[str, str], str] | None = None) -> dict:
    """sheet's data from a .kicad_sch's text. `pad_nets` ({(ref, pin): net} from the board) names the pins' nets
    when it is given; otherwise the labels and wires on the sheet do."""
    doc = sexpr.parse(text)
    lib = _lib_symbols(doc)
    paper = _node(doc, "paper")
    size = {"A4": [297, 210], "A3": [420, 297], "A5": [210, 148], "USLetter": [279.4, 215.9]}.get(
        str(paper[1]) if paper else "A4", [297, 210]
    )
    symbols, labels, wires, junctions, ncs = [], [], [], [], []
    # connectivity: union-find over sheet points (pin tips, label anchors, wire ends)
    parent: dict[tuple[float, float], tuple[float, float]] = {}

    def key(x: float, y: float) -> tuple[float, float]:
        return (round(x, 2), round(y, 2))

    def find(k):
        parent.setdefault(k, k)
        while parent[k] != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    pin_points: list[tuple[tuple[float, float], dict]] = []
    label_points: list[tuple[tuple[float, float], str]] = []
    for n in doc:
        if not isinstance(n, list) or not n:
            continue
        head = str(n[0])
        if head == "symbol":
            lid = _node(n, "lib_id")
            lib_id = str(lid[1]) if lid else ""
            X, Y, rot = _at(n)
            mir = _node(n, "mirror")
            mirror = str(mir[1]) if mir else ""
            un = _node(n, "unit")
            unit = int(_f(un[1], 1)) if un else 1
            ref = value = ""
            texts = []
            for p in _nodes(n, "property"):
                if len(p) > 2 and not isinstance(p[2], list):
                    k, v = str(p[1]), str(p[2])
                    if k == "Reference":
                        ref = v
                    elif k == "Value":
                        value = v
                    if (
                        k in ("Reference", "Value")
                        and v
                        and not _hidden(p)
                        and not (k == "Reference" and v.startswith("#"))
                    ):
                        tx, ty, trot = _at(p)
                        just = _node(_node(p, "effects") or [], "justify")
                        texts.append(
                            {
                                "kind": k.lower(),
                                "text": v,
                                "at": [_r(tx), _r(ty)],
                                "rot": _r(trot % 360, 1),
                                "size": _r(_font_size(p, 1.27)),
                                "just": [str(j) for j in just[1:]] if just else [],
                            }
                        )
            graphics, pins, meta = _sym_graphics(lib, lib_id, unit)
            placed_g = []
            xs: list[float] = []
            ys: list[float] = []
            for g in graphics:
                if g["kind"] == "poly":
                    pts = [_place(g["pts"][i], g["pts"][i + 1], X, Y, rot, mirror) for i in range(0, len(g["pts"]), 2)]
                    placed_g.append({"kind": "poly", "fill": g["fill"], "pts": [_r(v) for xy in pts for v in xy]})
                    xs += [p[0] for p in pts]
                    ys += [p[1] for p in pts]
                elif g["kind"] == "circle":
                    cx, cy = _place(g["at"][0], g["at"][1], X, Y, rot, mirror)
                    placed_g.append({"kind": "circle", "fill": g["fill"], "at": [_r(cx), _r(cy)], "r": g["r"]})
                    xs += [cx - g["r"], cx + g["r"]]
                    ys += [cy - g["r"], cy + g["r"]]
                elif g["kind"] == "text":
                    tx, ty = _place(g["at"][0], g["at"][1], X, Y, rot, mirror)
                    placed_g.append(
                        {"kind": "text", "text": g["text"], "at": [_r(tx), _r(ty)], "rot": g["rot"], "size": g["size"]}
                    )
            placed_p = []
            for p in pins:
                tipx, tipy = _place(p["at"][0], p["at"][1], X, Y, rot, mirror)
                # the pin runs from its tip toward the body, along its angle (library frame, y up)
                a = math.radians(p["angle"])
                ex, ey = _place(
                    p["at"][0] + p["len"] * math.cos(a), p["at"][1] + p["len"] * math.sin(a), X, Y, rot, mirror
                )
                pp = {
                    "num": p["num"],
                    "name": p["name"],
                    "etype": p["etype"],
                    "tip": [_r(tipx), _r(tipy)],
                    "end": [_r(ex), _r(ey)],
                    "hide": p["hide"],
                    "net": "",
                }
                if pad_nets and (ref, p["num"]) in pad_nets:
                    pp["net"] = pad_nets[(ref, p["num"])]
                placed_p.append(pp)
                pin_points.append((key(tipx, tipy), pp))
                xs += [tipx, ex]
                ys += [tipy, ey]
            if not xs:
                xs, ys = [X - 2.54, X + 2.54], [Y - 2.54, Y + 2.54]
            symbols.append(
                {
                    "ref": ref,
                    "value": value,
                    "lib_id": lib_id,
                    "unit": unit,
                    "power": ref.startswith("#") or lib_id.startswith("power:"),
                    "at": [_r(X), _r(Y)],
                    "rot": _r(rot % 360, 1),
                    "mirror": mirror,
                    "box": [_r(min(xs)), _r(min(ys)), _r(max(xs)), _r(max(ys))],
                    "show_numbers": meta.get("pin_numbers", True),
                    "show_names": meta.get("pin_names", True),
                    "graphics": placed_g,
                    "pins": placed_p,
                    "texts": texts,
                }
            )
        elif head in ("global_label", "label", "hierarchical_label", "netclass_flag") and len(n) > 1:
            lx, ly, lrot = _at(n)
            shape = _node(n, "shape")
            labels.append(
                {
                    "text": str(n[1]),
                    "kind": head.split("_")[0] if head != "netclass_flag" else "flag",
                    "shape": str(shape[1]) if shape else "",
                    "at": [_r(lx), _r(ly)],
                    "rot": _r(lrot % 360, 1),
                    "size": _r(_font_size(n, 1.27)),
                }
            )
            label_points.append((key(lx, ly), str(n[1])))
        elif head in ("wire", "bus"):
            pts = _pts(n)
            if len(pts) >= 2:
                wires.append([_r(v) for xy in pts for v in xy])
                for a, b in itertools.pairwise(pts):
                    union(key(*a), key(*b))
        elif head == "junction":
            jx, jy, _ = _at(n)
            junctions.append([_r(jx), _r(jy)])
        elif head == "no_connect":
            nx, ny, _ = _at(n)
            ncs.append([_r(nx), _r(ny)])
    # a label, a junction or a pin tip that sits on the middle of a wire is on that wire too
    segs = [((w[i], w[i + 1]), (w[i + 2], w[i + 3])) for w in wires for i in range(0, len(w) - 2, 2)]

    def on_wire(x: float, y: float) -> None:
        for a, b in segs:
            if (
                min(a[0], b[0]) - 0.01 <= x <= max(a[0], b[0]) + 0.01
                and min(a[1], b[1]) - 0.01 <= y <= max(a[1], b[1]) + 0.01
            ):
                cross = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])
                if abs(cross) <= 0.02 * max(1.0, math.hypot(b[0] - a[0], b[1] - a[1])):
                    union(key(x, y), key(*a))

    for k, _ in label_points:
        on_wire(*k)
    for k, _ in pin_points:
        on_wire(*k)
    for jx, jy in junctions:
        on_wire(jx, jy)
    # name every pin's net from the sheet when the board did not
    net_of_point: dict[tuple[float, float], str] = {}
    for k, name in label_points:
        net_of_point[find(k)] = name
    for k, pp in pin_points:
        if not pp["net"]:
            pp["net"] = net_of_point.get(find(k), "")
        elif net_of_point.get(find(k)) is None:
            net_of_point[find(k)] = pp["net"]  # a board net names the sheet points it touches
    # every wire and label carries its net too, so the page can light a net from either
    wires = [{"net": net_of_point.get(find(key(w[0], w[1])), ""), "pts": w} for w in wires]
    for lb in labels:
        lb["net"] = net_of_point.get(find(key(lb["at"][0], lb["at"][1])), lb["text"])
    nets: dict[str, list[str]] = {}
    for s in symbols:
        for p in s["pins"]:
            if p["net"] and s["ref"] and not s["power"]:
                nets.setdefault(p["net"], [])
                if s["ref"] not in nets[p["net"]]:
                    nets[p["net"]].append(s["ref"])
    # the drawing's own extent: symbols, their visible text, labels and wires, with a margin
    xs = []
    ys = []
    for s in symbols:
        xs += [s["box"][0], s["box"][2]]
        ys += [s["box"][1], s["box"][3]]
        for t in s["texts"]:
            half = len(t["text"]) * t["size"] * 0.6
            xs += [t["at"][0] - half, t["at"][0] + half]
            ys += [t["at"][1] - t["size"], t["at"][1] + t["size"]]
    for lb in labels:
        ln = len(lb["text"]) * lb["size"] * 0.75 + 2.5
        dx, dy = {0: (ln, 0), 90: (0, -ln), 180: (-ln, 0), 270: (0, ln)}.get(int(lb["rot"]) % 360, (ln, 0))
        xs += [lb["at"][0], lb["at"][0] + dx]
        ys += [lb["at"][1] - 1.6, lb["at"][1] + dy + 1.6]
    for w in wires:
        xs += w["pts"][0::2]
        ys += w["pts"][1::2]
    m = 6.0
    box = [_r(min(xs) - m), _r(min(ys) - m), _r(max(xs) + m), _r(max(ys) + m)] if xs else [0, 0, size[0], size[1]]
    return {
        "ok": True,
        "units": "mm",
        "paper": size,
        "box": box,
        "symbols": symbols,
        "labels": labels,
        "wires": wires,
        "junctions": junctions,
        "no_connects": ncs,
        "nets": nets,
    }


def _pad_nets(board: dict | None) -> dict[tuple[str, str], str]:
    out = {}
    for p in (board or {}).get("parts", []):
        for pad in p.get("pads", []):
            if pad.get("net"):
                out[(p["ref"], pad["num"])] = pad["net"]
    return out


def sheet(run: str) -> dict | None:
    d = run_dir(run)
    if d is None:
        return None
    sch = _board_file(d, ".kicad_sch")
    if sch is None:
        return None
    pcb = _board_file(d, ".kicad_pcb")

    def build():
        board = pcb2d(run) if pcb else None
        return parse_sch(sch.read_text(), _pad_nets(board))

    return _cached(d, "schematic.json", [sch, pcb], build)


# ---------------------------------------------------------------- the numbers
def _json(p: Path) -> dict:
    try:
        return json.loads(p.read_text())
    except (OSError, ValueError):
        return {}


def _gates(d: Path) -> list[dict]:
    """The gate events of the build's last try, from run.jsonl (for runs without a report.json)."""
    cur: list[dict] = []
    try:
        lines = (d / "run.jsonl").read_text().splitlines()
    except OSError:
        return []
    for line in lines:
        try:
            e = json.loads(line)
        except ValueError:
            continue
        if e.get("agent") != "assembly":
            continue
        if e.get("type") == "iteration" and e.get("phase") == "place-route-check":
            cur = []
        elif e.get("type") == "gate" and e.get("gate"):
            cur.append({"id": "gate", "label": str(e["gate"])[:90], "ok": bool(e.get("ok")), "value": e.get("value")})
    return cur


def estimate(w: float, h: float, layers: int, qty: int = 5) -> dict:
    """A rough bare-board price the way prototype fabs quote it: a flat price for five boards up to 100 x 100 mm,
    then by area; four layers cost about four times two. Parts, assembly and shipping are not in it."""
    area = max(0.0, w * h) / 100.0  # cm²
    base = 2.0 if layers <= 2 else 8.0
    per_cm2 = 0.035 if layers <= 2 else 0.12
    boards = base + max(0.0, area - 100.0) * per_cm2
    boards *= max(1, qty) / 5.0
    return {
        "qty": qty,
        "boards_usd": round(boards, 2),
        "each_usd": round(boards / max(1, qty), 2),
        "area_cm2": round(area, 1),
        "note": "bare boards at a prototype fab, before parts and shipping",
    }


def compute_stats(board: dict, report: dict, design: dict, result: dict, gates: list[dict]) -> dict:
    parts = [p for p in board.get("parts", []) if p.get("part")]
    pads = sum(len(p.get("pads", [])) for p in parts)
    holes = sum(
        1 for p in board.get("parts", []) if not p.get("part") and any(pad.get("drill") for pad in p.get("pads", []))
    )
    track_mm = 0.0
    for t in board.get("tracks", []):
        pts = t["pts"]
        for i in range(0, len(pts) - 2, 2):
            track_mm += math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1])
    nets = {pad["net"] for p in parts for pad in p.get("pads", []) if pad.get("net")}
    checks: list[dict] = []
    ch = report.get("checks") or {}
    if ch:
        erc, drc, nl, models, sim = (ch.get(k) or {} for k in ("erc", "drc", "netlist", "models", "sim"))
        checks.append(
            {"id": "erc", "label": "Schematic rules (ERC)", "ok": erc.get("errors", 1) == 0, "value": erc.get("errors")}
        )
        checks.append(
            {
                "id": "drc",
                "label": "Board rules (DRC)",
                "ok": drc.get("violations", 1) == 0,
                "value": drc.get("violations"),
            }
        )
        checks.append(
            {
                "id": "unconnected",
                "label": "Every net routed",
                "ok": drc.get("unconnected", 1) == 0,
                "value": drc.get("unconnected"),
            }
        )
        parity = (drc.get("parity") or 0) + (nl.get("mismatches") or 0)
        checks.append({"id": "parity", "label": "Schematic matches the board", "ok": parity == 0, "value": parity})
        if models:
            checks.append(
                {
                    "id": "models",
                    "label": "A 3D model on every part",
                    "ok": models.get("missing", 1) == 0,
                    "value": models.get("missing"),
                }
            )
        if sim:
            if sim.get("simulated") is False:
                checks.append(
                    {"id": "sim", "label": "Simulation", "ok": None, "value": sim.get("note", "not simulated")}
                )
            else:
                checks.append(
                    {
                        "id": "sim",
                        "label": "ngspice simulation ran",
                        "ok": bool(sim.get("ok")),
                        "value": sim.get("error") or ("ok" if sim.get("ok") else None),
                    }
                )
        dup = {"drc_violations", "erc_errors", "unconnected", "parity"}
        for b in report.get("benchmarks") or []:
            if isinstance(b, dict) and b.get("text") and b.get("check") not in dup:
                ok = b.get("pass")
                checks.append(
                    {
                        "id": "bench",
                        "label": str(b["text"])[:90],
                        "ok": None if ok is None else bool(ok),
                        "value": b.get("value"),
                        "by": b.get("by", "agent"),
                    }
                )
    elif gates:
        checks = gates
    decided = [c for c in checks if c["ok"] is not None]
    passed = bool(decided) and all(c["ok"] for c in decided)
    if not decided and result.get("ok") is not None:
        passed = bool(result.get("ok"))
    w, h = board.get("w", 0), board.get("h", 0)
    layers = len(board.get("copper") or []) or 2
    timings = result.get("timings") or {}
    return {
        "ok": True,
        "title": design.get("title") or result.get("ask") or "",
        "w": w,
        "h": h,
        "layers": layers,
        "parts": len(parts),
        "smd": sum(1 for p in parts if p.get("smd")),
        "tht": sum(1 for p in parts if not p.get("smd")),
        "sides": {
            "F": sum(1 for p in parts if p.get("side") == "F"),
            "B": sum(1 for p in parts if p.get("side") == "B"),
        },
        "pads": pads,
        "holes": holes,
        "vias": len(board.get("vias", [])),
        "tracks": len(board.get("tracks", [])),
        "track_mm": round(track_mm, 1),
        "nets": len(nets),
        "checks": checks,
        "passed": passed,
        "built_s": timings.get("total_s") or report.get("total_s"),
        "tries": result.get("iterations"),
        "quote": estimate(w, h, layers),
    }


def stats(run: str) -> dict | None:
    d = run_dir(run)
    if d is None:
        return None
    pcb = _board_file(d, ".kicad_pcb")
    if pcb is None:
        return None
    srcs = [pcb, d / "report.json", d / "live_result.json", d / "run.jsonl"]

    def build():
        board = pcb2d(run)
        if not board:
            return None
        return compute_stats(
            board, _json(d / "report.json"), _json(d / "design.json"), _json(d / "live_result.json"), _gates(d)
        )

    return _cached(d, "stats.json", srcs, build)


def warm(runs: list[str]) -> None:
    """Build the stats of these runs in the background (the gallery reads only what is cached)."""
    todo = [r for r in runs if run_dir(r) is not None and cached_only(r, "stats.json") is None]
    if not todo:
        return

    def go():
        for r in todo:
            try:
                stats(r)
            except (OSError, ValueError, RecursionError):
                pass

    threading.Thread(target=go, daemon=True).start()


# ---------------------------------------------------------------- the questions before a build
LEVELS = ("beginner", "hobbyist", "expert")
MAX_Q = {"beginner": 2, "hobbyist": 3, "expert": 1}

POWER = re.compile(
    r"\b(usb|battery|batteries|coin\s*cell|cr2032|lipo|li-?ion|18650|\d+(\.\d+)?\s*v\b|mains|barrel|solar|aa|aaa|powered|power\s+from|wall|charger|poe)\b",
    re.IGNORECASE,
)
SIZE = re.compile(
    r"\b(small|tiny|compact|large|big|mm|cm|inch|inches|wearable|keychain|credit\s*card|business\s*card|fit\s+in|as\s+small|pocket)\b",
    re.IGNORECASE,
)
BRAIN = re.compile(
    r"\b(esp32|esp8266|pico|rp2040|arduino|atmega|stm32|nrf52|samd|microcontroller|mcu|wi-?fi|bluetooth|ble)\b",
    re.IGNORECASE,
)
WANTS_BRAIN = re.compile(
    r"\b(sensor|sense|measure|read|log|display|oled|screen|lcd|control|servo|motor|keypad|macro|keyboard|clock|timer|wireless|app|phone|data|monitor|station|game|midi|robot)\b",
    re.IGNORECASE,
)
CONNECTED = re.compile(
    r"\b(wi-?fi|bluetooth|ble|app|phone|internet|cloud|online|mqtt|remote|wireless|station)\b", re.IGNORECASE
)
DEBUG = re.compile(
    r"\b(status\s+led|test\s*points?|debug|reset\s+button|programming\s+header|swd|jtag)\b", re.IGNORECASE
)


def clarify(text: str, level: str = "hobbyist") -> dict:
    """Up to three questions about what the description leaves open, each with Etch's recommended answer picked.
    Rules only, deterministic; the page folds the chosen `add` fragments into the request."""
    level = level if level in LEVELS else "hobbyist"
    t = text or ""
    qs: list[dict] = []
    if not POWER.search(t):
        qs.append(
            {
                "id": "power",
                "question": "How should it get power?",
                "why": "Every board needs a supply; the right one decides the connector, the regulator and the size.",
                "options": [
                    {
                        "label": "USB-C",
                        "detail": "5 V from any phone charger or laptop",
                        "add": "powered over USB-C",
                        "recommended": True,
                    },
                    {
                        "label": "A coin cell",
                        "detail": "Tiny; good for a blinker or a sensor that sleeps",
                        "add": "powered by a CR2032 coin cell",
                    },
                    {
                        "label": "A rechargeable LiPo",
                        "detail": "Portable, charges over USB",
                        "add": "powered by a LiPo battery with USB charging",
                    },
                    {"label": "Whatever fits best", "detail": "Etch picks", "add": ""},
                ],
            }
        )
    if not SIZE.search(t):
        qs.append(
            {
                "id": "size",
                "question": "How big can it be?",
                "why": "A tighter board costs less and fits more places, a roomier one is easier to solder and label.",
                "options": [
                    {
                        "label": "As small as possible",
                        "detail": "Parts packed tight, both sides if it helps",
                        "add": "keep the board as small as possible",
                        "recommended": True,
                    },
                    {
                        "label": "Comfortable",
                        "detail": "Room for labels and fingers",
                        "add": "leave room between parts for labels",
                    },
                    {"label": "Doesn't matter", "detail": "", "add": ""},
                ],
            }
        )
    if not BRAIN.search(t) and WANTS_BRAIN.search(t):
        connected = bool(CONNECTED.search(t))
        qs.append(
            {
                "id": "brain",
                "question": "Does it need a microcontroller?",
                "why": "Sensing, timing and displays usually want one; radio decides which.",
                "options": [
                    {
                        "label": "Yes, an ESP32",
                        "detail": "Wi-Fi and Bluetooth built in",
                        "add": "built around an ESP32 module",
                        "recommended": connected,
                    },
                    {
                        "label": "Yes, a small one without radio",
                        "detail": "Cheaper, lower power",
                        "add": "built around a small microcontroller without radio",
                        "recommended": not connected,
                    },
                    {
                        "label": "No, simple parts only",
                        "detail": "Timers, transistors, no code",
                        "add": "no microcontroller, discrete parts only",
                    },
                ],
            }
        )
    if level != "beginner" and not DEBUG.search(t):
        qs.append(
            {
                "id": "debug",
                "question": "Anything on the board to help you debug it?",
                "why": "A status LED and test points cost nothing on a prototype and save an evening.",
                "options": [
                    {
                        "label": "A status LED",
                        "detail": "One LED on a free pin",
                        "add": "with a status LED",
                        "recommended": True,
                    },
                    {"label": "Test points", "detail": "On the main nets", "add": "with test points on the main nets"},
                    {"label": "Nothing extra", "detail": "", "add": ""},
                ],
            }
        )
    qs = qs[: MAX_Q[level]]
    for q in qs:
        if not any(o.get("recommended") for o in q["options"]):
            q["options"][0]["recommended"] = True
        for o in q["options"]:
            o.setdefault("recommended", False)
    return {"ok": True, "level": level, "questions": qs}


def fold(text: str, adds: list[str], cap: int = 400) -> str:
    """The request text with the chosen fragments folded in, under the backend's text cap."""
    t = re.sub(r"\s+", " ", text or "").strip().rstrip(".")
    for a in adds:
        a = (a or "").strip()
        if not a or a.lower() in t.lower():
            continue
        nxt = f"{t}, {a}"
        if len(nxt) > cap:
            break
        t = nxt
    return t[:cap]


if __name__ == "__main__":  # python3 deploy/views.py live-… : print the numbers of one build
    for r in sys.argv[1:]:
        s = stats(r) or {}
        print(json.dumps({k: v for k, v in s.items() if k != "checks"}, indent=1))
        for c in s.get("checks", []):
            print(" ", "ok " if c["ok"] else ("-- " if c["ok"] is None else "BAD"), c["label"], c.get("value", ""))
