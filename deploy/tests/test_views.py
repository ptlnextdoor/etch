"""deploy/views.py: the 2D board, the schematic, the numbers and the clarify questions, on the blinky fixture run
(deploy/tests/fixtures/blinky: a KiCad 10 board and schematic the way the engine writes them). No KiCad needed.

python3 -m unittest deploy/tests/test_views.py
"""

from __future__ import annotations

import http.client
import json
import shutil
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import etch_public
import views

FIX = Path(__file__).resolve().parent / "fixtures" / "blinky"
RUN = "live-1700000000000"


class Fixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="etch-views-"))
        shutil.copytree(FIX, cls.tmp / RUN)
        cls.old_out = views.OUT
        views.OUT = cls.tmp

    @classmethod
    def tearDownClass(cls):
        views.OUT = cls.old_out
        shutil.rmtree(cls.tmp, ignore_errors=True)


class Board(Fixture):
    def test_box_and_outline_come_from_edge_cuts(self):
        b = views.pcb2d(RUN)
        self.assertEqual(b["box"], [100.0, 100.0, 130.0, 120.0])
        self.assertEqual((b["w"], b["h"]), (30.0, 20.0))
        self.assertEqual(b["copper"], ["F.Cu", "B.Cu"])
        self.assertEqual(len(b["outline"]), 1)
        self.assertEqual(b["outline"][0]["pts"][:4], [100.0, 100.0, 130.0, 100.0])

    def test_footprints_are_placed_rotated_and_sided(self):
        parts = {p["ref"]: p for p in views.pcb2d(RUN)["parts"]}
        self.assertEqual(set(parts), {"U1", "R1", "D1", "J1", "H1"})
        r1 = parts["R1"]
        self.assertEqual(r1["rot"], 90.0)
        # a 90° footprint puts pad 1 (at -0.825, 0) below the centre on screen: KiCad turns anticlockwise, y down
        pads = {p["num"]: p for p in r1["pads"]}
        self.assertEqual(pads["1"]["at"], [120.0, 104.825])
        self.assertEqual(pads["1"]["net"], "VBUS")
        self.assertEqual(pads["2"]["net"], "LED_A")
        self.assertEqual(pads["1"]["shape"], "roundrect")
        self.assertEqual(pads["1"]["rr"], 0.25)
        self.assertEqual(parts["D1"]["side"], "B")
        self.assertEqual(parts["D1"]["pads"][0]["side"], "B")
        j1 = {p["num"]: p for p in parts["J1"]["pads"]}
        self.assertEqual(j1["1"]["side"], "*")
        self.assertEqual(j1["1"]["drill"], [1.0])
        self.assertFalse(parts["J1"]["smd"])
        self.assertTrue(parts["U1"]["smd"])

    def test_part_box_is_the_courtyard(self):
        u1 = next(p for p in views.pcb2d(RUN)["parts"] if p["ref"] == "U1")
        self.assertEqual(u1["box"], [106.9, 104.3, 113.1, 111.7])
        kinds = {ln["kind"] for ln in u1["lines"]}
        self.assertEqual(kinds, {"silk", "crtyd", "fab"})
        self.assertEqual([t["text"] for t in u1["texts"]], ["U1"])  # the Fab value is not silk

    def test_holes_are_not_parts(self):
        h1 = next(p for p in views.pcb2d(RUN)["parts"] if p["ref"] == "H1")
        self.assertFalse(h1["part"])
        self.assertEqual(h1["texts"], [])  # its reference is hidden
        self.assertEqual(h1["pads"][0]["kind"], "np_thru_hole")

    def test_copper_tracks_vias_and_fills(self):
        b = views.pcb2d(RUN)
        self.assertEqual(len(b["tracks"]), 8)  # 7 segments + 1 arc
        arc = next(t for t in b["tracks"] if len(t["pts"]) > 4)
        self.assertEqual(arc["net"], "BAT")
        self.assertEqual(len(arc["pts"]), 22)  # 11 sampled points
        self.assertEqual([t["side"] for t in b["tracks"]].count("B"), 1)
        self.assertEqual(b["vias"], [{"at": [120.0, 108.0], "size": 0.6, "drill": 0.3, "net": "LED_A"}])
        self.assertEqual([(z["net"], len(z["polys"])) for z in b["zones"]], [("GND", 1), ("GND", 2)])
        self.assertEqual(b["zones"][0]["polys"][0]["side"], "B")
        self.assertEqual(b["nets"], ["BAT", "GND", "LED_A", "VBUS"])

    def test_silk_text_and_lines(self):
        silk = views.pcb2d(RUN)["silk"]
        self.assertEqual(silk[0]["text"], "ETCH NIGHT LIGHT")
        self.assertEqual(silk[0]["size"], 1.2)
        self.assertEqual(silk[1]["pts"], [101.0, 116.5, 129.0, 116.5])

    def test_cached_and_rebuilt_when_the_board_changes(self):
        views.pcb2d(RUN)
        cache = self.tmp / RUN / "view" / "pcb2d.json"
        self.assertTrue(cache.is_file())
        self.assertIsNotNone(views.cached_only(RUN, "pcb2d.json"))
        pcb = self.tmp / RUN / "blinky.kicad_pcb"
        text = pcb.read_text().replace('(gr_text "ETCH NIGHT LIGHT"', '(gr_text "ETCH LAMP"')
        time.sleep(0.02)
        pcb.write_text(text)
        now = time.time() + 5
        import os

        os.utime(pcb, (now, now))
        self.assertEqual(views.pcb2d(RUN)["silk"][0]["text"], "ETCH LAMP")
        pcb.write_text(text.replace('(gr_text "ETCH LAMP"', '(gr_text "ETCH NIGHT LIGHT"'))
        os.utime(pcb, (now + 5, now + 5))
        self.assertEqual(views.pcb2d(RUN)["silk"][0]["text"], "ETCH NIGHT LIGHT")

    def test_old_kicad_5_files_parse_too(self):
        text = """(kicad_pcb (version 20171130) (host pcbnew 5.0.1)
  (net 0 "") (net 1 GND)
  (module Resistor_SMD:R_0603 (layer F.Cu) (at 10 10 180)
    (fp_text reference R9 (at 0 -1.5) (layer F.SilkS) (effects (font (size 1 1) (thickness 0.15))))
    (fp_text value 1k (at 0 1.5) (layer F.Fab) (effects (font (size 1 1) (thickness 0.15))))
    (fp_line (start -1 -0.5) (end 1 -0.5) (layer F.SilkS) (width 0.12))
    (pad 1 smd rect (at -0.8 0) (size 0.8 0.9) (layers F.Cu F.Paste F.Mask) (net 1 GND))
    (pad 2 smd rect (at 0.8 0) (size 0.8 0.9) (layers F.Cu F.Paste F.Mask)))
  (gr_line (start 0 0) (end 20 0) (angle 90) (layer Edge.Cuts) (width 0.15))
  (gr_line (start 20 0) (end 20 20) (angle 90) (layer Edge.Cuts) (width 0.15))
  (segment (start 1 1) (end 5 1) (width 0.25) (layer F.Cu) (net 1)))"""
        b = views.parse_pcb(text)
        self.assertEqual(b["box"], [0.0, 0.0, 20.0, 20.0])
        r9 = b["parts"][0]
        self.assertEqual(r9["ref"], "R9")
        self.assertEqual(r9["pads"][0]["at"], [10.8, 10.0])  # rotated 180°
        self.assertEqual(r9["pads"][0]["net"], "GND")
        self.assertEqual(b["tracks"][0]["net"], "GND")


class Schematic(Fixture):
    def test_symbols_land_where_the_engine_put_their_pins(self):
        s = views.sheet(RUN)
        syms = {x["ref"]: x for x in s["symbols"]}
        self.assertEqual(set(syms), {"U1", "R1", "D1", "J1", "#FLG01"})
        u1 = syms["U1"]
        pins = {p["num"]: p for p in u1["pins"]}
        # library (-12.7, 7.62) with y up, instance at (63.5, 63.5): the tip sits at (50.8, 55.88) on the sheet
        self.assertEqual(pins["1"]["tip"], [50.8, 55.88])
        self.assertEqual(pins["1"]["end"], [55.88, 55.88])  # 5.08 toward the body
        self.assertEqual(pins["8"]["tip"], [76.2, 55.88])
        self.assertEqual(u1["box"], [50.8, 53.34, 76.2, 73.66])
        self.assertEqual(u1["graphics"][0]["kind"], "poly")
        self.assertEqual(u1["graphics"][0]["fill"], "background")
        self.assertEqual([t["text"] for t in u1["texts"]], ["U1", "TP4056"])
        self.assertTrue(syms["#FLG01"]["power"])
        self.assertEqual([t["kind"] for t in syms["#FLG01"]["texts"]], ["value"])  # the #ref stays hidden

    def test_rotation_and_mirror(self):
        syms = {x["ref"]: x for x in views.sheet(RUN)["symbols"]}
        d1 = syms["D1"]  # rotated 90: pin K (-3.81, 0) goes to the bottom of the instance
        pins = {p["num"]: p for p in d1["pins"]}
        self.assertEqual(pins["1"]["tip"], [101.6, 74.93])
        self.assertEqual(pins["2"]["tip"], [101.6, 67.31])
        j1 = syms["J1"]  # mirror y: pins that point left now point right
        self.assertEqual({p["num"]: p["tip"] for p in j1["pins"]}, {"1": [144.78, 63.5], "2": [144.78, 66.04]})

    def test_pins_get_their_nets_from_the_board_then_the_sheet(self):
        s = views.sheet(RUN)
        syms = {x["ref"]: x for x in s["symbols"]}
        self.assertEqual({p["num"]: p["net"] for p in syms["R1"]["pins"]}, {"1": "VBUS", "2": "LED_A"})
        self.assertEqual({p["num"]: p["net"] for p in syms["D1"]["pins"]}, {"1": "GND", "2": "LED_A"})
        # the PWR_FLAG is on no pad: its net comes from the label at its pin, on the sheet
        self.assertEqual(syms["#FLG01"]["pins"][0]["net"], "VBUS")
        self.assertEqual(s["nets"]["LED_A"], ["R1", "D1"])
        self.assertEqual(s["nets"]["GND"], ["U1", "D1", "J1"])
        self.assertEqual(len(s["labels"]), 9)
        self.assertEqual(s["wires"], [{"net": "LED_A", "pts": [101.6, 59.69, 101.6, 67.31]}])
        self.assertEqual({lb["text"] for lb in s["labels"]}, {lb["net"] for lb in s["labels"]})
        self.assertEqual(s["junctions"], [[101.6, 63.5]])
        self.assertEqual(len(s["no_connects"]), 2)

    def test_sheet_alone_names_nets_through_wires(self):
        text = (FIX / "blinky.kicad_sch").read_text()
        s = views.parse_sch(text)  # no board nets
        r1 = next(x for x in s["symbols"] if x["ref"] == "R1")
        d1 = next(x for x in s["symbols"] if x["ref"] == "D1")
        # R1 pin 2 and D1 pin 2 are joined by a wire with a local label on it
        self.assertEqual(next(p["net"] for p in r1["pins"] if p["num"] == "2"), "LED_A")
        self.assertEqual(next(p["net"] for p in d1["pins"] if p["num"] == "2"), "LED_A")
        self.assertEqual(next(p["net"] for p in r1["pins"] if p["num"] == "1"), "VBUS")

    def test_crop_frames_the_drawing_not_the_sheet(self):
        s = views.sheet(RUN)
        self.assertEqual(s["paper"], [297, 210])
        x0, _y0, x1, _y1 = s["box"]
        self.assertLess(x0, 38.1)  # the PWR_FLAG at the top left is inside
        self.assertGreater(x1, 144.78 + 3)  # the BAT label on the right is inside, with room for its text
        self.assertLess(x1 - x0, 297)


class Stats(Fixture):
    def test_numbers(self):
        s = views.stats(RUN)
        self.assertEqual((s["w"], s["h"], s["layers"]), (30.0, 20.0, 2))
        self.assertEqual((s["parts"], s["smd"], s["tht"]), (4, 3, 1))  # H1 is a hole, not a part
        self.assertEqual(s["sides"], {"F": 3, "B": 1})
        self.assertEqual((s["pads"], s["holes"], s["vias"], s["tracks"], s["nets"]), (15, 1, 1, 8, 4))
        self.assertAlmostEqual(s["track_mm"], 39.0, places=0)
        self.assertEqual(s["title"], "USB-C night light")
        self.assertEqual(s["built_s"], 13.9)
        self.assertTrue(s["passed"])

    def test_checks_come_from_the_report(self):
        checks = views.stats(RUN)["checks"]
        ids = [c["id"] for c in checks]
        self.assertEqual(ids[:6], ["erc", "drc", "unconnected", "parity", "models", "sim"])
        self.assertTrue(all(c["ok"] for c in checks[:6]))
        bench = [c for c in checks if c["id"] == "bench"]
        # the DRC benchmark repeats the core check, so it is not listed twice; the unmeasurable one is neither pass nor fail
        self.assertEqual([c["label"][:8] for c in bench], ["D1 draws", "supply c", "OLED und"])
        self.assertEqual([c["ok"] for c in bench], [True, True, None])
        self.assertEqual(bench[1]["by"], "code")

    def test_gates_when_there_is_no_report(self):
        s = views.compute_stats(views.pcb2d(RUN), {}, {}, {"ok": True}, views._gates(self.tmp / RUN))
        self.assertEqual(s["checks"], [{"id": "gate", "label": "DRC passed", "ok": True, "value": 0}])
        self.assertTrue(s["passed"])

    def test_estimate_is_flat_then_by_area(self):
        self.assertEqual(views.estimate(30, 20, 2)["boards_usd"], 2.0)
        self.assertEqual(views.estimate(100, 100, 2)["boards_usd"], 2.0)
        self.assertGreater(views.estimate(150, 100, 2)["boards_usd"], 2.0)
        self.assertGreater(views.estimate(30, 20, 4)["boards_usd"], views.estimate(30, 20, 2)["boards_usd"])
        self.assertEqual(views.estimate(30, 20, 2, qty=10)["boards_usd"], 4.0)

    def test_run_ids_are_checked(self):
        for bad in ("../etc", "live-1/../../x", "", "gh:foo/bar", "live-9999999999999", None, 7):
            self.assertIsNone(views.stats(bad))
            self.assertIsNone(views.sheet(bad))
            self.assertIsNone(views.pcb2d(bad))
            self.assertIsNone(views.cached_only(bad, "stats.json"))


class Clarify(unittest.TestCase):
    def test_asks_only_what_the_text_leaves_open(self):
        qs = views.clarify("a night light", "hobbyist")["questions"]
        self.assertEqual([q["id"] for q in qs], ["power", "size", "debug"])
        for q in qs:
            self.assertEqual(sum(o["recommended"] for o in q["options"]), 1)
            self.assertTrue(q["why"])
        self.assertEqual(views.clarify("a USB-C powered tiny night light", "hobbyist")["questions"][0]["id"], "debug")

    def test_levels_change_how_much_is_asked(self):
        text = "a plant sensor that logs to my phone"
        self.assertEqual([q["id"] for q in views.clarify(text, "beginner")["questions"]], ["power", "size"])
        self.assertEqual([q["id"] for q in views.clarify(text, "hobbyist")["questions"]], ["power", "size", "brain"])
        self.assertEqual([q["id"] for q in views.clarify(text, "expert")["questions"]], ["power"])
        self.assertEqual(views.clarify(text, "wizard")["level"], "hobbyist")

    def test_brain_recommendation_follows_connectivity(self):
        brain = next(
            q
            for q in views.clarify("a plant sensor that logs to my phone", "hobbyist")["questions"]
            if q["id"] == "brain"
        )
        self.assertEqual(next(o["label"] for o in brain["options"] if o["recommended"]), "Yes, an ESP32")
        brain = next(
            q for q in views.clarify("a kitchen timer with a display", "hobbyist")["questions"] if q["id"] == "brain"
        )
        self.assertEqual(
            next(o["label"] for o in brain["options"] if o["recommended"]), "Yes, a small one without radio"
        )
        self.assertNotIn("brain", [q["id"] for q in views.clarify("an ESP32 plant sensor", "hobbyist")["questions"]])

    def test_fold_keeps_the_text_under_the_cap(self):
        self.assertEqual(
            views.fold("a night light.", ["powered over USB-C", "", "keep the board as small as possible"]),
            "a night light, powered over USB-C, keep the board as small as possible",
        )
        self.assertEqual(
            views.fold("a night light, powered over USB-C", ["powered over USB-C"]), "a night light, powered over USB-C"
        )  # already said
        long = "x" * 390
        self.assertEqual(views.fold(long, ["powered over USB-C"]), long)  # would not fit: left as typed


class Routes(Fixture):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.srv = etch_public.ThreadingHTTPServer(("127.0.0.1", 0), etch_public.H)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        super().tearDownClass()

    def call(self, method, path, body=None):
        c = http.client.HTTPConnection("127.0.0.1", self.srv.server_address[1], timeout=30)
        c.request(
            method,
            path,
            body=json.dumps(body) if body is not None else None,
            headers={"Content-Type": "application/json"} if body is not None else {},
        )
        r = c.getresponse()
        data = json.loads(r.read())
        c.close()
        return r.status, data

    def test_views_routes(self):
        for path, key in (("/etch/pcb2d", "parts"), ("/etch/schematic", "symbols"), ("/etch/stats", "checks")):
            status, d = self.call("GET", f"{path}?id={RUN}")
            self.assertEqual(status, 200, path)
            self.assertTrue(d["ok"])
            self.assertIn(key, d)
            status, d = self.call("GET", f"{path}?id=live-1")
            self.assertEqual((status, d["error"]), (404, "not found"), path)
            status, _ = self.call("GET", f"{path}?id=../etc")
            self.assertEqual(status, 404)

    def test_clarify_route(self):
        status, d = self.call("POST", "/etch/clarify", {"text": "a night light", "level": "beginner"})
        self.assertEqual(status, 200)
        self.assertEqual([q["id"] for q in d["questions"]], ["power", "size"])
        status, d = self.call("POST", "/etch/clarify", {"text": "   "})
        self.assertEqual((status, d["error"]), (400, "Tell me what your board should do."))
        status, _ = self.call("POST", "/etch/clarify", [1, 2])
        self.assertEqual(status, 400)


if __name__ == "__main__":
    unittest.main()
