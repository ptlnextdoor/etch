"""The 2D board and the schematic of every library board, prerendered to static JSON next to its 3D model, so the
board editor's 2D and Schematic views work on Explore's boards with no backend.

  python3 library/flat_views.py                 every rendered board in library/manifest.json
  python3 library/flat_views.py --only <slug>   one board (repeatable)
  python3 library/flat_views.py --force         redo boards that already have their views

For each board: fetch its .kicad_pcb (and the .kicad_sch beside it, KiCad 6+) from GitHub at the commit pinned in the
manifest (cached in library/cache/flat/), read them with deploy/views.py (the same parser the backend uses for Etch's
own builds), and write world/boards/<slug>/pcb2d.json and schematic.json, plus meta.json `views`: the ones it has.
A schematic whose root sheet holds no parts (a hierarchical design) is left out rather than shown empty. Stdlib only.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "deploy"))
import views  # deploy/views.py: parse_pcb, parse_sch

WORLD = ROOT / "deploy" / "etch-app" / "world" / "boards"
CACHE = ROOT / "library" / "cache" / "flat"
MAX_BYTES = 8_000_000  # a view larger than this is too heavy for the page; the board keeps its 3D view only


def _dp(pts: list[tuple[float, float]], tol: float) -> list[tuple[float, float]]:
    """Douglas-Peucker: drop points within `tol` mm of the line through their neighbours."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (x0, y0), (x1, y1) = pts[a], pts[b]
        dx, dy = x1 - x0, y1 - y0
        n = (dx * dx + dy * dy) ** 0.5 or 1e-9
        far, at = 0.0, -1
        for i in range(a + 1, b):
            d = abs(dy * (pts[i][0] - x0) - dx * (pts[i][1] - y0)) / n
            if d > far:
                far, at = d, i
        if far > tol:
            keep[at] = True
            stack += [(a, at), (at, b)]
    return [q for q, k in zip(pts, keep) if k]


def _flat(arr: list[float], tol: float, nd: int = 2) -> list[float]:
    pts = _dp(list(zip(arr[0::2], arr[1::2])), tol)
    return [round(v, nd) for q in pts for v in q]


def compact(board: dict) -> dict:
    """Smaller files for the library: pour outlines simplified at 0.02 mm (a hair at the page's closest zoom), every
    coordinate at 10 µm, and the fab-layer drawings (never shown unless Part outlines is on) dropped."""
    for z in board["zones"]:
        for poly in z["polys"]:
            poly["pts"] = _flat(poly["pts"], 0.02)
    for t in board["tracks"]:
        t["pts"] = [round(v, 2) for v in t["pts"]]
    for p in board["parts"]:
        p["lines"] = [dict(ln, pts=_flat(ln["pts"], 0.01)) for ln in p["lines"] if ln["kind"] != "fab"]
        for pad in p["pads"]:
            pad["at"] = [round(v, 3) for v in pad["at"]]
    for s in board["silk"]:
        if "pts" in s:
            s["pts"] = _flat(s["pts"], 0.01)
    return board


def fetch(owner: str, repo: str, commit: str, path: str) -> str | None:
    key = CACHE / f"{owner}__{repo}__{commit[:12]}" / path.replace("/", "__")
    if key.is_file():
        return key.read_text(errors="replace") or None
    url = f"https://raw.githubusercontent.com/{owner}/{repo}/{commit}/{urllib.parse.quote(path)}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "etch-library"}), timeout=60) as r:
            text = r.read().decode("utf-8", errors="replace")
    except (OSError, ValueError):  # 404 (no schematic), network: the board just has no such view
        text = ""
    key.parent.mkdir(parents=True, exist_ok=True)
    key.write_text(text)
    return text or None


def one(b: dict, force: bool = False) -> tuple[str, list[str], str]:
    d = WORLD / b["slug"]
    meta_p = d / "meta.json"
    if not meta_p.is_file():
        return b["slug"], [], "no world folder"
    meta = json.loads(meta_p.read_text())
    if not force and "views" in meta:
        return b["slug"], meta["views"], "kept"
    have: list[str] = []
    note = ""
    pcb_text = fetch(b["owner"], b["repo"], b["commit"], b["pcb_path"])
    board = None
    if pcb_text:
        try:
            board = views.parse_pcb(pcb_text)
            data = json.dumps(compact(json.loads(json.dumps(board))), separators=(",", ":"))
            if len(data) <= MAX_BYTES and board["parts"]:
                (d / "pcb2d.json").write_text(data)
                have.append("pcb2d")
            else:
                note += f"pcb2d {len(data)} bytes, skipped; "
        except (ValueError, KeyError, IndexError, RecursionError) as e:
            note += f"pcb: {type(e).__name__}; "
    sch_text = fetch(b["owner"], b["repo"], b["commit"], b["pcb_path"].rsplit(".", 1)[0] + ".kicad_sch")
    if sch_text and sch_text.lstrip().startswith("(kicad_sch"):
        try:
            sheet = views.parse_sch(sch_text, views._pad_nets(board))
            parts = [s for s in sheet["symbols"] if not s["power"]]
            data = json.dumps(sheet, separators=(",", ":"))
            if len(parts) >= 2 and len(data) <= MAX_BYTES:
                (d / "schematic.json").write_text(data)
                have.append("schematic")
            else:
                note += f"schematic {len(parts)} parts on the root sheet, skipped; "
        except (ValueError, KeyError, IndexError, RecursionError) as e:
            note += f"sch: {type(e).__name__}; "
    for name in ("pcb2d", "schematic"):
        if name not in have:
            (d / f"{name}.json").unlink(missing_ok=True)
    meta["views"] = have
    meta_p.write_text(json.dumps(meta, indent=1, ensure_ascii=False) + "\n")
    return b["slug"], have, note.strip("; ")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", action="append", default=[])
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--jobs", type=int, default=8)
    a = ap.parse_args()
    m = json.loads((ROOT / "library" / "manifest.json").read_text())
    rows = m.get("boards") or next(v for v in m.values() if isinstance(v, list))
    rows = [b for b in rows if b.get("status") == "rendered" and (not a.only or b["slug"] in a.only)]
    counts = {"pcb2d": 0, "schematic": 0}
    with cf.ThreadPoolExecutor(a.jobs) as ex:
        for slug, have, note in ex.map(lambda b: one(b, a.force), rows):
            for h in have:
                counts[h] += 1
            print(f"{'+'.join(have) or '-':18} {slug}{'  (' + note + ')' if note else ''}")
    print(f"{len(rows)} boards: {counts['pcb2d']} with a 2D view, {counts['schematic']} with a schematic")


if __name__ == "__main__":
    main()
