"""Write the editor's demo data for ?mock=1 (deploy/etch-app/fixtures/views/*.json) from the blinky fixture run,
through deploy/views.py, so the page's 2D board, schematic and Make it sheet work without a backend and the e2e
tests have something to look at.

  python3 deploy/tests/fixtures/make_mock_views.py
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent))
import views

RUN = "live-1700000000000"
OUT = HERE.parent.parent / "etch-app" / "fixtures" / "views"


def main() -> None:
    tmp = Path(tempfile.mkdtemp(prefix="etch-mock-views-"))
    shutil.copytree(HERE / "blinky", tmp / RUN)
    views.OUT = tmp
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in (("pcb2d", views.pcb2d), ("schematic", views.sheet), ("stats", views.stats)):
        (OUT / f"{name}.json").write_text(json.dumps(fn(RUN), separators=(",", ":")) + "\n")
    (OUT / "clarify.json").write_text(json.dumps(views.clarify("a night light", "hobbyist"), indent=1) + "\n")
    shutil.rmtree(tmp, ignore_errors=True)
    print("wrote", sorted(p.name for p in OUT.iterdir()))


if __name__ == "__main__":
    main()
