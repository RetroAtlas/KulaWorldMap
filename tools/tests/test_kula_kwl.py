"""Unit tests for the level writer: python3 -m unittest discover -s tools/tests

Only the last class needs the disc, and it is skipped without $KULA_DISC.
"""

import json
import os
import re
import struct
import subprocess
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_disc import EXE, open_disc  # noqa: E402
from kula_kwl import (  # noqa: E402
    BONUS_UNDRAWN_KINDS,
    BONUS_UNDRAWN_TYPES,
    COUNTERS,
    DATA,
    CAPS,
    CAPTIVATORS,
    DIGESTS,
    DISC_MAX,
    DROPPED,
    FORMAT,
    INNER,
    LENGTH_CAP,
    MOVING_SPIKES,
    NUMBERED,
    PLAIN_ONLY,
    UNTRACED,
    HOSTILE,
    OBJECTS,
    PLAYED,
    RESIDUALS,
    REWIRED,
    VECTORS,
    canonical,
    circuit_members,
    check,
    compare,
    counts,
    describe,
    executable,
    deflate_vectors,
    digests,
    hostile,
    plays_as,
    project_of,
    project_of_level,
    read_kwl,
    read_project,
    render_digests,
    stripped,
    render_hostile,
    residuals,
    slot_figures,
    trio_failures,
    render_vectors,
    template,
    validate,
)
from kula_level import (  # noqa: E402
    BLOCK_KINDS,
    FIRST_RECORD,
    GRID_BYTES,
    LASER_KIND,
    NOWHERE,
    OWN,
    PLATFORM_KIND,
    SIDE,
    SWITCH,
    TELEPORTER,
    TRAILER_KIND,
    UNPLACED_KIND,
    Level,
)
from test_kula_level import block, level, slot  # noqa: E402

TOOL = Path(__file__).resolve().parents[1] / "kula_kwl.py"
EDITOR_DOC = Path(__file__).resolve().parents[2] / "docs" / "editor.md"
FORMAT_DOC = Path(__file__).resolve().parents[2] / "docs" / "level-format.md"
HIDES = json.loads(OBJECTS.read_text())["skins"]["hides"]
START, EXIT, KEY, COIN, GEM = 30, 7, 31, 37, 36
WORLD = "HIRO"


def obj(typ, f2=0, f3=0, f4=1):
    """An object as the reader needs it: type, facing, variant and state, the rest unset."""
    return slot(typ, f2, f3, f4, -1, -1, -1, 0)


def trailer(cell, time):
    return block(NOWHERE, kind=TRAILER_KIND, faces={0: slot(cell[0], cell[1], cell[2], 0, 0, time)})


def playground():
    """A level with one of everything the format carries, its records in lattice order."""
    cells, records = {}, []

    def put(cell, **kw):
        cells[cell] = FIRST_RECORD + len(records)
        records.append(block(cell, **kw))

    put((10, 10, 17), faces={0: obj(START, 3, 0, 0), 1: obj(COIN, 0, 2), 5: obj(KEY)})
    put((10, 12, 17), kind=6, faces={0: slot(1, 5120, 6144, 8704)})
    put((10, 14, 17), kind=7, faces={0: slot(0, 2)})
    put((12, 10, 17), faces={0: obj(SWITCH, 0, 1, 2), 2: obj(TELEPORTER, 4, 1, 2)})
    put((12, 14, 17), faces={0: obj(TELEPORTER, 2, 1, 2), 1: obj(53, 4, 0, 0), 3: obj(56, 0, 2, 0)})
    cells[(13, 10, 17)] = 2
    cells[(13, 12, 17)] = 3
    put((14, 10, 17), kind=PLATFORM_KIND, faces={0: slot(2, 2, 1, 14, 10, 17, 14, 13, 17)},
        second=slot(2, 30, -1, FIRST_RECORD + 5, kind=0))
    put((16, 10, 17), kind=LASER_KIND, faces={0: slot(1, 1, 0, 16, 10, 17, 20, 10, 17)},
        second=slot(1, -1, -1, FIRST_RECORD + 6, -1, 1, -1))
    records.append(block((0, 0, 0), kind=UNPLACED_KIND, faces={0: slot(1, 1)}))
    return level(cells, records, trailer=trailer((10, 10, 17), 45))


PLAYGROUND = {
    "format": FORMAT, "version": 1, "title": "", "author": "", "notes": "", "world": WORLD,
    "time": 45, "hidden": True, "invisibleFromAfar": True, "circuits": {"1": "off"},
    "blocks": [
        {"cell": [10, 10, 17], "kind": 0, "faces": {"0": {"type": START, "facing": 3},
                                                      "1": {"type": COIN, "variant": 2},
                                                      "5": {"type": KEY}}},
        {"cell": [10, 12, 17], "kind": 6},
        {"cell": [10, 14, 17], "kind": 7, "phase": 2},
        {"cell": [12, 10, 17], "kind": 0, "faces": {"0": {"type": SWITCH, "variant": 1},
                                                      "2": {"type": TELEPORTER, "facing": 4, "variant": 1}}},
        {"cell": [12, 14, 17], "kind": 0, "faces": {"0": {"type": TELEPORTER, "facing": 2, "variant": 1},
                                                      "1": {"type": 53, "facing": 4},
                                                      "3": {"type": 56, "variant": 2}}},
        {"cell": [13, 10, 17], "kind": 2},
        {"cell": [13, 12, 17], "kind": 3},
        {"cell": [14, 10, 17], "kind": PLATFORM_KIND, "far": [14, 13, 17], "length": 2, "speed": 30},
        {"cell": [16, 10, 17], "kind": LASER_KIND, "far": [20, 10, 17], "colour": 1},
    ],
}


def project(blocks, **more):
    out = {"format": FORMAT, "version": 1, "title": "t", "author": "", "notes": "", "world": WORLD,
           "time": 99, "hidden": False, "invisibleFromAfar": False, "circuits": {}, "blocks": blocks}
    out.update(more)
    return out


def plain(cell, kind=0, **faces):
    b = {"cell": list(cell), "kind": kind}
    if faces:
        b["faces"] = {f[1:]: o for f, o in faces.items()}
    return b


def start(facing=3):
    return {"type": START, "facing": facing}


def words(blob, k):
    return struct.unpack_from("<128h", blob, GRID_BYTES + 6 + 256 * k)


def texts(findings, level=None):
    return [text for lvl, text, _ in findings if level is None or lvl == level]


class RoundTrips(unittest.TestCase):
    def test_a_level_read_from_its_bytes_is_written_back_to_bytes_that_read_the_same(self):
        p = project_of_level(Level(playground()), world=WORLD)
        self.assertEqual(p, PLAYGROUND)
        out = canonical(p)
        C = Level(out)
        self.assertEqual(C.verify(), [])
        self.assertEqual(project_of_level(C, world=WORLD), p)
        self.assertEqual((C.header, C.count), (9, 8))
        self.assertEqual(C.records[-1].kind, UNPLACED_KIND)
        self.assertEqual(words(out, 7)[:4], (UNPLACED_KIND, 1, 1, 0))
        self.assertEqual(C.records[-1].cell, (0, 0, 0))
        self.assertEqual(words(out, 8)[:7], (TRAILER_KIND, 10, 10, 17, 0, 0, 45))
        self.assertEqual(out[-6:], b"\xff" * 6)
        self.assertEqual((C.records[4].slots[1][2], C.records[4].slots[3][2]), (4, 0))
        self.assertEqual(texts(validate(p, HIDES), "error"), [])

    def test_the_writer_derives_what_the_file_never_stores(self):
        out = canonical(PLAYGROUND)
        C = Level(out)
        self.assertEqual([C.records[0].slots[j][5] for j in (0, 1, 5)], [-1, 0, 1])
        self.assertEqual((C.records[3].slots[0][4], C.records[6].f[1]), (2, 0))
        self.assertEqual(list(C.records[6].slots[0][1:4]), [1, 1, 0])
        self.assertEqual(list(C.records[5].slots[0][1:10]), [2, 2, 1, 14, 10, 17, 14, 13, 17])
        self.assertEqual(list(C.records[5].slots[1][:5]), [0, 2, 30, -1, FIRST_RECORD + 5])
        self.assertEqual(words(out, 5)[119:125], (14 * 512, 10 * 512, 17 * 512, 256, 256, 256))
        self.assertEqual(list(C.records[1].slots[0][:5]), [6, 1, 10 * 512, 12 * 512, 17 * 512])
        self.assertEqual(list(C.records[2].slots[0][:3]), [7, 0, 2])
        self.assertEqual(list(C.records[3].slots[1]), [-1, 0, -1, -1, 0, -1, -1, -1, 0] + [-1] * 7)
        self.assertEqual(list(C.records[1].slots[1]), [-1] * 16)
        self.assertEqual(list(C.records[5].slots[2]), [-1] * 16)

    def test_the_settings_record_goes_only_where_a_flag_is_set_and_faces_keys_may_be_numbers(self):
        p = project(PLAYGROUND["blocks"], circuits={"1": "off"})
        C = Level(canonical(p))
        self.assertEqual(C.count, 7)
        self.assertNotIn(UNPLACED_KIND, [r.kind for r in C.records])
        numbered = json.loads(json.dumps(p))
        for b in numbered["blocks"]:
            if "faces" in b:
                b["faces"] = {int(f): o for f, o in b["faces"].items()}
        self.assertEqual(canonical(numbered), canonical(p))
        spelled = json.loads(json.dumps(p))
        for b in spelled["blocks"]:
            if "faces" in b:
                b["faces"] = {f"0{f}": o for f, o in b["faces"].items()}
        self.assertEqual(canonical(spelled), canonical(p))

    def test_every_shipped_level_is_a_fixed_point_and_verifies(self):
        for l in json.loads(DATA.read_text())["levels"]:
            p = project_of(l)
            C = Level(canonical(p), l["name"])
            self.assertEqual(C.verify(), [], l["name"])
            again = project_of_level(C, world=l["theme"], shown=l.get("shown"), pack=l["pack"], index=l["index"])
            self.assertEqual(again, p, l["name"])

    def test_a_template_is_named_by_its_pack_and_index(self):
        data = json.loads(DATA.read_text())
        p = template(data, "/HIRO/HIRO.PAK#0")
        self.assertEqual((p["from"], p["title"], p["world"]), ("/HIRO/HIRO.PAK#0", "LEVEL 1", "HIRO"))
        self.assertEqual(template(data, "hiro#0"), p)
        with self.assertRaises(KeyError):
            template(data, "/HIRO/HIRO.PAK#99")

    def test_the_bytes_are_undefined_for_what_the_lattice_cannot_hold(self):
        with self.assertRaises(ValueError):
            canonical(project([plain((34, 5, 5), t0=start())]))
        with self.assertRaises(ValueError):
            canonical(project([plain((5, 5, 5), t0=start()), plain((5, 5, 5))]))
        with self.assertRaises(ValueError):
            canonical(project([plain((5, 5, 5), t0=start()),
                               {"cell": [6, 6, 6], "kind": LASER_KIND, "far": [8, 8, 6], "colour": 0}]))

    def test_the_writer_names_what_it_cannot_write(self):
        cases = [
            ([plain((5, 5, 5), t0=start()), {"cell": [6, 6, 6], "kind": LASER_KIND, "colour": 0}],
             "the span at 6,6,6 needs a far end"),
            ([plain((5, 5, 5), t0=start()), {"cell": [6, 6, 6], "kind": LASER_KIND, "far": [6, 9], "colour": 0}],
             "the span at 6,6,6 needs a far end"),
            ([plain((5, 5, 5), t0=start()), {"cell": [6, 6, 6], "kind": LASER_KIND, "far": [6, 6, 34], "colour": 0}],
             "the far end 6,6,34 of the span at 6,6,6 is outside the lattice"),
            ([plain((5, 5, 5), t0=start()), {"cell": [6, 6, 6], "kind": PLATFORM_KIND, "far": [6, -1, 6]}],
             "the far end 6,-1,6 of the span at 6,6,6 is outside the lattice"),
            ([plain((5, 5, 5), t0=start(), t7={"type": COIN, "variant": 0})], "face 7 is not one of the six"),
            ([plain((5, 5, 5), t0=start(), t5={"type": COIN, "variant": 0}, t05={"type": KEY})],
             "face 5 of the block at 5,5,5 is named twice"),
            ([plain((5, 5, 5), t0=start()), {"cell": [6, 6, 6], "kind": LASER_KIND, "far": [6, 9, 6], "colour": 7}],
             "colour 7 is not one of the four"),
            ([plain((5, 5, 5), t0=start(), t1={"type": TELEPORTER, "facing": 1, "variant": 4})],
             "colour 4 is not one of the four"),
            ([plain((5, 5, 5), t0=start()), plain((6, 6, 6), kind=9)], "kind 9 is not a kind of block"),
            ([plain((5, 5, 5), t0=start()), plain((6, 6, 6), kind=-1)], "kind -1 is not a kind of block"),
            ([plain((5, 5, 5), t0=start()), plain((6, 6, 6), kind=True)], "kind True is not a kind of block"),
            ([plain((5, 5), t0=start())], "cell 5,5 is outside the lattice"),
            ([plain((5, 5, 5), t0=start()), {"cell": [6, 6, 6], "kind": 0, "faces": {"top": {"type": COIN, "variant": 0}}}],
             'face "top" is not one of the six'),
            ([plain((5, 5, 5), t0=start()), {"cell": [6, 6, 6], "kind": 0, "faces": {" 5": {"type": COIN, "variant": 0}}}],
             'face " 5" is not one of the six'),
            ([plain((5, 5, 5), t0=start()), {"cell": [6, 6, 6], "kind": 0, "faces": {"+5": {"type": COIN, "variant": 0}}}],
             'face "+5" is not one of the six'),
        ]
        for blocks, text in cases:
            with self.assertRaises(ValueError) as caught:
                canonical(project(blocks))
            self.assertIn(text, str(caught.exception))
        with self.assertRaises(ValueError) as caught:
            canonical(project([plain((5, 5, 5), t0=start())], time=100000))
        self.assertIn("a time of 100000", str(caught.exception))
        with self.assertRaises(ValueError) as caught:
            canonical(project([plain((5, 5, 5), t0=start(), t1={"type": COIN, "variant": 70000})]))
        self.assertIn("the block at 5,5,5", str(caught.exception))
        # a key that stands nothing is no face at all, whatever it is called
        bare = project([plain((5, 5, 5), t0=start()), {"cell": [6, 6, 6], "kind": 0, "faces": {"top": {"type": 0}, "x": None}}])
        self.assertEqual(canonical(bare), canonical(project([plain((5, 5, 5), t0=start()), plain((6, 6, 6))])))


class Links(unittest.TestCase):
    """A colour's members sorted by record and face: each names the one before it
    as the next on the list, every switch starts at the last, and the teleporters
    send the ball round a ring, each to the one before it."""
    def setUp(self):
        self.blob = canonical(project([
            plain((10, 10, 17), t0={"type": SWITCH, "variant": 2}, t3={"type": TELEPORTER, "facing": 1, "variant": 2}),
            plain((10, 12, 17), t0={"type": TELEPORTER, "facing": 1, "variant": 2}),
            {"cell": [12, 10, 17], "kind": LASER_KIND, "far": [12, 10, 13], "colour": 2},
            plain((14, 10, 17), t0={"type": SWITCH, "variant": 2}, t5={"type": TELEPORTER, "facing": 2, "variant": 2}),
            plain((16, 10, 17), t0=start()),
        ]))
        self.L = Level(self.blob)

    def test_the_lists_and_the_ring(self):
        L = self.L
        self.assertEqual(L.verify(), [])

        def nxt(k, f):
            return L.records[k].slots[f][6]

        def to(k, f):
            return L.records[k].slots[f][7]

        self.assertEqual([nxt(0, 0), nxt(0, 3), nxt(1, 0), L.records[2].slots[1][7], nxt(3, 0), nxt(3, 5)],
                         [-1, 0, 3, 16, 38, 48])
        self.assertEqual((to(0, 0), to(3, 0)), (53, 53))
        self.assertEqual((to(0, 3), to(1, 0), to(3, 5)), (53, 3, 16))
        self.assertEqual(L.circuit(0, 0), [(3, 5), (3, 0), (2, OWN), (1, 0), (0, 3), (0, 0)])
        self.assertEqual(L.circuit(3, 0), L.circuit(0, 0))

    def test_a_lone_teleporter_names_itself_and_a_colour_without_a_switch_starts_on(self):
        L = Level(canonical(project([plain((10, 10, 17), t0=start(), t2={"type": TELEPORTER, "facing": 1, "variant": 3})])))
        self.assertEqual(L.records[0].slots[2][7], 2)
        self.assertEqual(L.records[0].slots[2][4], 1)
        self.assertEqual(L.verify(), [])


class Numbers(unittest.TestCase):
    def test_pickups_are_numbered_in_record_then_face_order_and_nothing_else_is(self):
        L = Level(canonical(project([
            plain((10, 10, 17), t0=start(), t2={"type": GEM, "variant": 1}, t5={"type": KEY}),
            plain((10, 12, 17), t1={"type": EXIT}, t3={"type": COIN, "variant": 0}),
            plain((12, 10, 17), t0={"type": 46}),
        ])))
        f5 = [(k, o.face, o.f[3]) for k, r in enumerate(L.records) for o in r.objects]
        self.assertEqual(f5, [(0, 0, -1), (0, 2, 0), (0, 5, 1), (1, 1, -1), (1, 3, 2), (2, 0, 3)])


class Reads(unittest.TestCase):
    def test_a_trailerless_file_gets_the_default_time(self):
        p, report = read_kwl(playground()[:-256], world=WORLD)
        self.assertEqual(p["time"], 99)
        self.assertEqual(p["blocks"], PLAYGROUND["blocks"])
        self.assertTrue(any("no trailer" in line for line in report), report)

    def test_a_reversed_laser_pair_reads_lower_end_first(self):
        beam = slot(4, 1, 1, 20, 10, 17, 16, 10, 17)
        blob = level({(16, 10, 17): FIRST_RECORD},
                     [block((16, 10, 17), kind=LASER_KIND, faces={0: beam}, second=slot(1, -1, -1, 5, -1, 0, -1))])
        p, _ = read_kwl(blob)
        self.assertEqual(p["blocks"], [{"cell": [16, 10, 17], "kind": LASER_KIND, "far": [20, 10, 17], "colour": 0}])
        self.assertEqual(list(Level(canonical(p)).records[0].slots[0][1:10]), [1, 1, 1, 16, 10, 17, 20, 10, 17])

    def test_a_span_whose_block_is_at_neither_end_is_moved_onto_its_cell(self):
        beam = slot(1, 1, 1, 20, 10, 17, 24, 10, 17)
        blob = level({(16, 10, 17): FIRST_RECORD},
                     [block((16, 10, 17), kind=LASER_KIND, faces={0: beam}, second=slot(1, -1, -1, 5, -1, 0, -1))])
        p, report = read_kwl(blob)
        self.assertEqual(p["blocks"][0]["far"], [24, 10, 17])
        self.assertTrue(any("lower end is now its cell" in line for line in report), report)

    def test_a_span_off_its_blocks_line_is_laid_along_its_axis_through_the_block_or_dropped_where_it_has_none(self):
        def read(a, b, cell=(16, 10, 17)):
            blob = level({cell: FIRST_RECORD},
                         [block(cell, kind=LASER_KIND, faces={0: slot(1, 1, 1, *a, *b)},
                                second=slot(1, -1, -1, 5, -1, 0, -1))])
            p, report = read_kwl(blob)
            self.assertEqual(Level(canonical(p)).verify(), [])
            return [x["far"] for x in p["blocks"]], report

        self.assertEqual(read((20, 12, 17), (24, 12, 17)), ([[24, 10, 17]], [
            "record 0 spans 20,12,17 to 24,12,17 and stands at 16,10,17, off their line; it now spans 16,10,17 to 24,10,17"]))
        self.assertEqual(read((10, 12, 17), (16, 12, 17)), ([[10, 10, 17]], [
            "record 0 spans 10,12,17 to 16,12,17 and stands at 16,10,17, off their line; it now spans 16,10,17 to 10,10,17"]))
        self.assertEqual(read((20, 12, 17), (24, 14, 17)), ([], [
            "record 0 spans 20,12,17 to 24,14,17, along no one axis; it is dropped and its cell left empty"]))
        self.assertEqual(read((16, 10, 17), (20, 14, 17)), ([], [
            "record 0 spans 16,10,17 to 20,14,17, along no one axis; it is dropped and its cell left empty"]))
        self.assertEqual(read((20, 12, 17), (20, 12, 17)), ([], [
            "record 0 spans nothing: both of its ends are 20,12,17, away from its cell 16,10,17; "
            "it is dropped and its cell left empty"]))
        self.assertEqual(read((20, 12, 17), (24, 12, 40)), ([], [
            "record 0 spans 20,12,17 to 24,12,40, along no one axis; it is dropped and its cell left empty"]))
        # an end the lattice has no cell for drops the record in one line, off the line or on it
        self.assertEqual(read((20, 12, 17), (40, 12, 17)), ([], [
            "record 0 spans to 40,10,17, outside the lattice; it is dropped and its cell left empty"]))
        self.assertEqual(read((20, 10, 17), (40, 10, 17)), ([], [
            "record 0 spans to 40,10,17, outside the lattice; it is dropped and its cell left empty"]))

    def test_a_span_to_nowhere_or_to_its_own_cell_is_dropped(self):
        def laser(far):
            return block((16, 10, 17), kind=LASER_KIND, faces={0: slot(1, 1, 1, 16, 10, 17, *far)},
                         second=slot(1, -1, -1, 5, -1, 0, -1))

        for far, text in (((16, 10, 17), "record 1 spans nothing: both of its ends are its own cell 16,10,17"),
                          ((16, 10, 34), "record 1 spans to 16,10,34, outside the lattice"),
                          ((16, 10, -5), "record 1 spans to 16,10,-5, outside the lattice"),
                          ((16, 10, 32767), "record 1 spans to 16,10,32767, outside the lattice")):
            blob = level({(5, 5, 5): FIRST_RECORD, (16, 10, 17): FIRST_RECORD + 1},
                         [block((5, 5, 5), faces={0: obj(START, 3, 0, 0)}), laser(far)])
            p, report = read_kwl(blob)
            self.assertEqual([b["cell"] for b in p["blocks"]], [[5, 5, 5]], far)
            self.assertTrue(any(line.startswith(text) and line.endswith("it is dropped and its cell left empty")
                                for line in report), report)
            self.assertEqual(Level(canonical(p)).verify(), [])

    def test_a_facing_of_0_on_a_type_that_needs_one_is_read_as_1_the_way_the_game_heads(self):
        blob = level({(1, 2, 3): FIRST_RECORD},
                     [block((1, 2, 3), faces={0: obj(START, 0, 0, 0), 2: obj(TELEPORTER, 0, 1, 1), 3: obj(53, 0, 0, 0)})])
        p, report = read_kwl(blob)
        self.assertEqual(p["blocks"][0]["faces"], {"0": {"type": START, "facing": 1},
                                                   "2": {"type": TELEPORTER, "facing": 1, "variant": 1},
                                                   "3": {"type": 53}})
        self.assertEqual(report, [
            "type 30 on face 0 of the block at 1,2,3 has a facing of 0, which the game heads as 1; it is 1",
            "type 5 on face 2 of the block at 1,2,3 has a facing of 0, which the game heads as 1; it is 1",
            REWIRED,
        ])
        self.assertEqual(Level(canonical(p)).verify(), [])

    def test_a_colour_or_a_variant_outside_its_range_is_read_as_0_as_the_project_reader_reads_one(self):
        blob = level({(1, 2, 3): FIRST_RECORD, (5, 2, 3): FIRST_RECORD + 1},
                     [block((1, 2, 3), faces={0: obj(START, 3, 0, 0), 1: obj(SWITCH, 0, 9, 2), 2: obj(COIN, 0, 3),
                                              3: obj(56, 0, -1, 0)}),
                      block((5, 2, 3), kind=LASER_KIND, faces={0: slot(2, 2, 1, 5, 2, 3, 5, 6, 3)},
                            second=slot(1, -1, -1, FIRST_RECORD + 1, -1, 7, -1))])
        p, report = read_kwl(blob)
        self.assertEqual(p["blocks"][0]["faces"], {"0": start(), "1": {"type": SWITCH, "variant": 0},
                                                   "2": {"type": COIN, "variant": 0}, "3": {"type": 56, "variant": 0}})
        self.assertEqual(p["blocks"][1], {"cell": [5, 2, 3], "kind": LASER_KIND, "far": [5, 6, 3], "colour": 0})
        self.assertEqual(p["circuits"], {"0": "off"})
        self.assertEqual(report[:4], [
            "type 9 on face 1 of the block at 1,2,3 has a variant of 9, which is not one of the 4; it is 0",
            "type 37 on face 2 of the block at 1,2,3 has a variant of 3, which is not one of the 3; it is 0",
            "type 56 on face 3 of the block at 1,2,3 has a variant of -1, which is not one of the 4; it is 0",
            "the laser at 5,2,3 has a colour of 7, which is not one of the 4; it is 0",
        ])
        self.assertEqual(Level(canonical(p)).verify(), [])

    def test_the_lattice_decides_where_a_record_stands(self):
        blob = level({(1, 2, 3): FIRST_RECORD}, [block((4, 5, 6), faces={0: obj(START, 3, 0, 0)})])
        p, report = read_kwl(blob)
        self.assertEqual(p["blocks"][0]["cell"], [1, 2, 3])
        self.assertTrue(any("the lattice puts it at 1,2,3" in line for line in report), report)
        self.assertEqual(Level(canonical(p)).verify(), [])

    def test_a_record_no_cell_names_is_dropped_and_a_cell_naming_nothing_is_emptied(self):
        blob = level({(1, 2, 3): FIRST_RECORD, (7, 7, 7): FIRST_RECORD + 5},
                     [block((1, 2, 3), faces={0: obj(START, 3, 0, 0)}), block((4, 5, 6), faces={0: obj(COIN, 0, 1)})])
        p, report = read_kwl(blob)
        self.assertEqual([b["cell"] for b in p["blocks"]], [[1, 2, 3]])
        self.assertTrue(any("record 1 of kind 0 at 4,5,6 is named by no cell" in line for line in report), report)
        self.assertTrue(any("cell 7,7,7 names record 5, which is not a block" in line for line in report), report)

    def test_an_unwired_teleporter_is_wired_on_the_way_out(self):
        blob = level({(1, 2, 3): FIRST_RECORD, (1, 4, 3): FIRST_RECORD + 1},
                     [block((1, 2, 3), faces={0: obj(START, 3, 0, 0), 2: obj(TELEPORTER, 1, 3, 1)}),
                      block((1, 4, 3), faces={0: obj(TELEPORTER, 1, 3, 1)})])
        self.assertTrue(Level(blob).verify())
        p, report = read_kwl(blob)
        self.assertEqual(report, [REWIRED])
        C = Level(canonical(p))
        self.assertEqual(C.verify(), [])
        self.assertEqual((C.records[0].slots[2][7], C.records[1].slots[0][7]), (16, 2))
        self.assertEqual(read_kwl(canonical(p))[1], [])
        for l in json.loads(DATA.read_text())["levels"]:
            if l["theme"] == "HIRO":
                self.assertEqual(read_kwl(canonical(project_of(l)))[1], [], l["name"])
        # a next word nothing walks, on a colour with no switch, is no difference in play
        unwalked = bytearray(canonical(p))
        struct.pack_into("<h", unwalked, GRID_BYTES + 6 + 256 + 2 * 6, -1)
        self.assertEqual(read_kwl(bytes(unwalked))[1], [])

    def test_a_count_one_too_high_is_read_from_the_length(self):
        blob = bytearray(playground())
        struct.pack_into("<H", blob, GRID_BYTES + 4, 9)
        with self.assertRaises(ValueError):
            Level(bytes(blob))
        p, report = read_kwl(bytes(blob), world=WORLD)
        self.assertEqual(p, PLAYGROUND)
        self.assertIn("the header counts 9 records and the file holds 8", report)

    def test_several_settings_records_give_the_flags_of_all_of_them_wherever_they_stand(self):
        blob = level({(1, 2, 3): FIRST_RECORD, (1, 4, 3): FIRST_RECORD + 2},
                     [block((1, 2, 3), faces={0: obj(START, 3, 0, 0)}),
                      block((0, 0, 0), kind=UNPLACED_KIND, faces={0: slot(1)}),
                      block((1, 4, 3), faces={0: obj(COIN, 0, 1)}),
                      block((0, 0, 0), kind=UNPLACED_KIND, faces={0: slot(0, 1)})])
        p, report = read_kwl(blob)
        self.assertEqual((p["hidden"], p["invisibleFromAfar"]), (True, True))
        self.assertIn("2 settings records; the flags of all of them are taken", report)
        C = Level(canonical(p))
        self.assertEqual([r.kind for r in C.records].count(UNPLACED_KIND), 1)
        self.assertEqual(C.records[-1].kind, UNPLACED_KIND)

    def test_a_cell_naming_a_record_another_cell_already_names_is_left_empty_and_a_bare_record_folds(self):
        blob = level({(1, 2, 3): FIRST_RECORD, (1, 4, 3): FIRST_RECORD, (1, 6, 3): FIRST_RECORD + 1},
                     [block((1, 2, 3), faces={0: obj(START, 3, 0, 0)}), block((1, 6, 3), kind=2)])
        p, report = read_kwl(blob)
        self.assertEqual(p["blocks"], [{"cell": [1, 2, 3], "kind": 0, "faces": {"0": start()}}, {"cell": [1, 6, 3], "kind": 2}])
        self.assertIn("cell 1,4,3 names record 0, which cell 1,2,3 already names; the cell is left empty", report)
        self.assertIn("folded 1 records carrying nothing into plain blocks", report)

    def test_a_platforms_length_and_speed_and_a_vanishing_blocks_phase_are_kept_and_reported(self):
        blob = level({(1, 2, 3): FIRST_RECORD, (5, 2, 3): FIRST_RECORD + 1, (9, 2, 3): FIRST_RECORD + 2},
                     [block((1, 2, 3), faces={0: obj(START, 3, 0, 0)}),
                      block((5, 2, 3), kind=PLATFORM_KIND, faces={0: slot(2, 2, 1, 5, 2, 3, 5, 6, 3)},
                            second=slot(4, 20, -1, FIRST_RECORD + 1, kind=0)),
                      block((9, 2, 3), kind=7, faces={0: slot(0, 4)})])
        p, report = read_kwl(blob)
        self.assertEqual(p["blocks"][1], {"cell": [5, 2, 3], "kind": PLATFORM_KIND, "far": [5, 6, 3], "length": 4, "speed": 20})
        self.assertEqual(p["blocks"][2], {"cell": [9, 2, 3], "kind": 7, "phase": 4})
        self.assertIn("the platform at 5,2,3 is 4 blocks long", report)
        self.assertIn("the platform at 5,2,3 runs at 20", report)
        self.assertIn("the vanishing block at 9,2,3 has phase 4, which dims at once", report)

    def test_a_platforms_length_that_runs_past_the_edge_is_cut_to_what_fits_and_the_writer_refuses_one_past_the_lattice(self):
        def platform(length):
            return level({(1, 2, 3): FIRST_RECORD, (5, 2, 3): FIRST_RECORD + 1},
                         [block((1, 2, 3), faces={0: obj(START, 3, 0, 0)}),
                          block((5, 2, 3), kind=PLATFORM_KIND, faces={0: slot(2, 2, 1, 5, 2, 3, 5, 6, 3)},
                                second=slot(length, 30, -1, FIRST_RECORD + 1, kind=0))])

        # the run's upper end is 6, so 27 blocks reach the last cell the game builds and 28 the lattice's last
        for length, held in ((32767, 27), (29, 27), (28, 27), (0, 1), (-32768, 1)):
            p, report = read_kwl(platform(length))
            self.assertEqual(p["blocks"][1]["length"], held, length)
            why = "is less than one block" if length < 1 else "runs past the edge"
            self.assertEqual(report, [f"the platform at 5,2,3 is {length} blocks long, which {why}; it is {held}"])
            self.assertEqual(Level(canonical(p)).verify(), [])
            p["blocks"][1]["length"] = length
            if length == 28:
                canonical(p)
                continue
            with self.assertRaises(ValueError) as caught:
                canonical(p)
            self.assertEqual(str(caught.exception),
                             f"the platform at 5,2,3 is {length} blocks long, which the lattice cannot hold")
        p, report = read_kwl(platform(27))
        self.assertEqual((p["blocks"][1]["length"], report), (27, ["the platform at 5,2,3 is 27 blocks long"]))

    def test_a_switch_whose_list_loops_back_on_itself_reads_and_is_rewired_on_the_way_out(self):
        cycle = (1, 2, 3)
        blob = level({cycle: FIRST_RECORD},
                     [block(cycle, faces={0: obj(START, 3, 0, 0), 2: slot(SWITCH, 0, 1, 1, -1, 2, 2, 0),
                                          3: slot(TELEPORTER, 1, 1, 1, -1, 3, 3, 0)})])
        self.assertEqual(Level(blob).circuit(0, 2), [(0, 2)])
        p, report = read_kwl(blob)
        self.assertEqual(sorted(p["blocks"][0]["faces"]), ["0", "2", "3"])
        self.assertIn(REWIRED, report)
        C = Level(canonical(p))
        self.assertEqual(C.verify(), [])
        self.assertEqual(C.circuit(0, 2), [(0, 3), (0, 2)])

    def test_records_out_of_lattice_order_are_reported_where_the_order_decides_play(self):
        cells = {(5, 5, 5): FIRST_RECORD, (3, 3, 3): FIRST_RECORD + 1}
        two_starts = [block((5, 5, 5), faces={0: obj(START, 3, 0, 0)}), block((3, 3, 3), faces={0: obj(START, 1, 0, 0)})]
        p, report = read_kwl(level(cells, two_starts))
        self.assertTrue(any("not in lattice order" in line for line in report), report)
        self.assertEqual([b["cell"] for b in p["blocks"]], [[3, 3, 3], [5, 5, 5]])
        one_start = [block((5, 5, 5), faces={0: obj(START, 3, 0, 0)}), block((3, 3, 3), faces={0: obj(COIN, 0, 1)})]
        _, report = read_kwl(level(cells, one_start))
        self.assertFalse(any("lattice order" in line for line in report), report)
        captive = [block((5, 5, 5), faces={0: obj(START, 3, 0, 0)}), block((3, 3, 3), faces={0: obj(53, 0, 0, 0)})]
        _, report = read_kwl(level(cells, captive))
        self.assertTrue(any("not in lattice order" in line for line in report), report)

    def test_what_stands_on_the_kinds_the_game_never_walks_is_counted_and_left_out(self):
        blob = level({(1, 2, 3): FIRST_RECORD, (1, 4, 3): FIRST_RECORD + 1},
                     [block((1, 2, 3), faces={0: obj(START, 3, 0, 0)}),
                      block((1, 4, 3), kind=6, faces={0: slot(1, 512, 2048, 1536), 2: obj(COIN, 0, 1), 5: obj(KEY)})])
        p, report = read_kwl(blob)
        self.assertEqual(p["blocks"][1], {"cell": [1, 4, 3], "kind": 6})
        self.assertIn("left out 2 objects standing on records the game never walks", report)
        flagged = level({(1, 2, 3): FIRST_RECORD},
                        [block((1, 2, 3), faces={0: obj(START, 3, 0, 0)}),
                         block((0, 0, 0), kind=UNPLACED_KIND, faces={0: slot(1), 2: obj(COIN, 0, 1)})])
        p, report = read_kwl(flagged)
        self.assertEqual((p["hidden"], p["invisibleFromAfar"]), (True, False))
        self.assertIn("left out 1 objects standing on records the game never walks", report)

    def test_only_a_length_that_is_not_a_level_is_refused(self):
        with self.assertRaises(ValueError):
            read_kwl(playground()[:-1])
        with self.assertRaises(ValueError):
            read_kwl(b"\xff" * 100)
        p, report = read_kwl(playground()[:GRID_BYTES + 6])
        self.assertEqual([b["kind"] for b in p["blocks"]], [2, 3])
        self.assertEqual(p["time"], 99)
        self.assertEqual(sum("is not a block" in line for line in report), 3)
        self.assertIn("4 more lines like the one above", report)

    def test_lines_of_one_shape_are_kept_to_three_and_the_rest_counted_in_place(self):
        cells = {(x, y, 17): FIRST_RECORD + 1 for x in range(1, 33) for y in range(1, 33)}
        cells[(5, 5, 5)] = FIRST_RECORD
        cells[(1, 1, 1)] = FIRST_RECORD + 1
        p, report = read_kwl(level(cells, [block((5, 5, 5), faces={0: obj(START, 3, 0, 0)})]))
        self.assertEqual([b["cell"] for b in p["blocks"]], [[5, 5, 5]])
        self.assertEqual(report, [
            "cell 1,1,1 names record 1, which is not a block; the cell is left empty",
            "cell 1,1,17 names record 1, which is not a block; the cell is left empty",
            "cell 1,2,17 names record 1, which is not a block; the cell is left empty",
            "1022 more lines like the one above",
        ])


class ReadsProjects(unittest.TestCase):
    def test_the_reader_refuses_another_formats_file_and_nothing_else(self):
        for raw in ({"format": "orbit", "blocks": []}, {"version": 1, "blocks": []}, [], "text", None):
            with self.assertRaises(ValueError):
                read_project(raw)
        p, report = read_project({"format": FORMAT})
        self.assertEqual(report, ["no blocks"])
        self.assertEqual(p, {"format": FORMAT, "version": 1, "title": "", "author": "", "notes": "", "world": "",
                             "time": 99, "hidden": False, "invisibleFromAfar": False, "circuits": {}, "blocks": []})

    def test_the_reader_takes_what_it_knows_of_a_newer_file_fills_the_defaults_and_drops_what_cannot_be_a_block(self):
        coin = {"type": COIN, "variant": 0}
        p, report = read_project({
            "format": FORMAT, "version": 7, "world": "HAZE", "weather": "rain", "time": "soon", "hidden": "yes",
            "circuits": {"1": "off", "2": "on", "7": "off", "3": "maybe"},
            "blocks": [
                {"cell": [5, 5, 5], "kind": 0, "faces": {"0": {"type": START, "facing": 3, "colour": 9}, "top": coin,
                                                          "2": {"kind": 1}}, "mood": 2},
                {"cell": [5, 5], "kind": 0},
                {"cell": [6, 5, 5]},
                "a block",
                {"cell": [7, 5, 5], "kind": PLATFORM_KIND, "far": [7, 9, 5]},
                {"cell": [9, 5, 5], "kind": LASER_KIND, "far": [9, 9, 5]},
                {"cell": [11, 5, 5], "kind": 7},
                {"cell": [5, 5, 5], "kind": 2},
                {"cell": [40, 5, 5], "kind": 0},
            ],
        })
        self.assertEqual(p["version"], 1)
        self.assertNotIn("weather", p)
        self.assertEqual([p["title"], p["author"], p["notes"], p["world"], p["time"], p["hidden"], p["invisibleFromAfar"]],
                         ["", "", "", "HAZE", 99, False, False])
        self.assertEqual(p["circuits"], {"1": "off"})
        self.assertEqual(p["blocks"], [
            {"cell": [5, 5, 5], "kind": 0, "faces": {"0": {"type": START, "facing": 3}}},
            {"cell": [7, 5, 5], "kind": PLATFORM_KIND, "far": [7, 9, 5], "length": 2, "speed": 30},
            {"cell": [9, 5, 5], "kind": LASER_KIND, "far": [9, 9, 5], "colour": 0},
            {"cell": [11, 5, 5], "kind": 7, "phase": 0},
        ])
        self.assertEqual(report, [
            "written as version 7 of the format, newer than this reader's 1; what it knows is read",
            'a time of "soon" is not a whole number; it is 99',
            "hidden is neither true nor false; it is taken as false",
            "colour 3 is neither on nor off; it starts on",
            "colour 7 is not one of the four; it is left out",
            "block 0 at 5,5,5 face 2 holds nothing that could stand on a face; it is left out",
            'block 0 at 5,5,5 names a face "top", which is not one of the six; it is left out',
            "block 1 has no cell of three whole numbers and a kind; it is left out",
            "block 2 has no cell of three whole numbers and a kind; it is left out",
            "block 3 has no cell of three whole numbers and a kind; it is left out",
            "block 7 at 5,5,5 stands on the cell of block 0; it is left out",
            "block 8 at 40,5,5 stands outside the lattice; it is left out",
        ])
        self.assertEqual(texts(validate(p, HIDES), "error"), [])
        canonical(p)

    def test_the_reader_leaves_out_what_the_writer_has_no_bytes_for_and_holds_a_word_to_the_files_range(self):
        coin = {"type": COIN, "variant": 0}
        p, report = read_project({
            "format": FORMAT, "world": WORLD, "time": -70000,
            "blocks": [
                {"cell": [5, 5, 5], "kind": 12},
                {"cell": [5, 5, 5], "kind": 0, "faces": {"0": {"type": START, "facing": 70000}, "1": {"type": 70000},
                                                          "2": {"type": KEY, "variant": -70000}}},
                {"cell": [5, 5, 5], "kind": 2},
                {"cell": [6, 5, 5], "kind": UNPLACED_KIND},
                {"cell": [7, 5, 5], "kind": -1},
                {"cell": [8, 5, 5], "kind": LASER_KIND, "far": [10, 7, 5], "colour": 0},
                {"cell": [9, 5, 5], "kind": PLATFORM_KIND, "far": [9, 9, 5], "length": 2, "speed": -70000},
                {"cell": [11, 5, 5], "kind": 7, "phase": 70000},
                {"cell": [0, 34, 5], "kind": 0},
                {"cell": [12, 5, 5], "kind": 0, "faces": {"0": coin}},
                {"cell": [12, 5, 5], "kind": 0, "faces": {"0": {"type": KEY}}},
            ],
        })
        self.assertEqual(p["blocks"], [
            {"cell": [5, 5, 5], "kind": 0, "faces": {"0": {"type": START, "facing": 32767}, "1": {"type": 32767},
                                                      "2": {"type": KEY, "variant": -32768}}},
            {"cell": [9, 5, 5], "kind": PLATFORM_KIND, "far": [9, 9, 5], "length": 2, "speed": -32768},
            {"cell": [11, 5, 5], "kind": 7, "phase": 32767},
            {"cell": [12, 5, 5], "kind": 0, "faces": {"0": coin}},
        ])
        self.assertEqual(p["time"], -32768)
        self.assertEqual(report, [
            "a time of -70000 is outside the file's range; it is -32768",
            "block 0 at 5,5,5 has a kind of 12, which is not a kind of block; it is left out",
            "block 1 at 5,5,5 face 0 has a facing of 70000, outside the file's range; it is 32767",
            "block 1 at 5,5,5 face 1 has a type of 70000, outside the file's range; it is 32767",
            "block 1 at 5,5,5 face 2 has a variant of -70000, outside the file's range; it is -32768",
            "block 2 at 5,5,5 stands on the cell of block 1; it is left out",
            "block 3 at 6,5,5 has a kind of 9, which is not a kind of block; it is left out",
            "block 4 at 7,5,5 has a kind of -1, which is not a kind of block; it is left out",
            "block 5 at 8,5,5 spans to 10,7,5 along no one axis; it is left out",
            "block 6 at 9,5,5 has a speed of -70000, outside the file's range; it is -32768",
            "block 7 at 11,5,5 has a phase of 70000, outside the file's range; it is 32767",
            "block 8 at 0,34,5 stands outside the lattice; it is left out",
            "block 10 at 12,5,5 stands on the cell of block 9; it is left out",
        ])
        # what is kept writes, and the checks name what the game would make of it
        canonical(p)
        errors = texts(validate(p, HIDES), "error")
        for text in ("a facing of 1 to 4 is needed", "type 32767 is nothing the game plays", "a phase of 32767",
                     "a time of -32768 seconds"):
            self.assertIn(text, errors)
        self.assertIn("a platform running at -32768", texts(validate(p, HIDES), "warning"))
        # the one project the reader hands on that the writer refuses: records enough to outrun a link word
        crowd = [plain((1 + i % 32, 1 + i // 32 % 32, 1 + i // 1024), t0=coin) for i in range(2049)]
        max(crowd, key=lambda b: tuple(b["cell"]))["faces"]["1"] = {"type": SWITCH, "variant": 0}
        q, lines = read_project(project(crowd))
        self.assertEqual(lines, [])
        self.assertIn("2049 records, over the 123 the game has room for", texts(validate(q, HIDES), "error"))
        with self.assertRaises(ValueError) as caught:
            canonical(q)
        self.assertEqual(str(caught.exception), "a word of the block at 32,32,2 is outside the file's range")

    def test_a_whole_number_is_whole_however_json_spells_it(self):
        p, report = read_project({"format": FORMAT, "world": WORLD, "time": 45.0,
                                  "blocks": [{"cell": [5.0, 5, 5], "kind": 0.0, "faces": {"0": {"type": 30.0, "facing": 3.0}}}]})
        self.assertEqual(report, [])
        self.assertEqual(p["time"], 45)
        self.assertEqual(p["blocks"], [{"cell": [5, 5, 5], "kind": 0, "faces": {"0": {"type": START, "facing": 3}}}])
        self.assertTrue(all(isinstance(v, int) for v in (p["time"], *p["blocks"][0]["cell"], p["blocks"][0]["kind"])))
        p, report = read_project({"format": FORMAT, "world": WORLD,
                                  "blocks": [{"cell": [5, 5, 5], "kind": 0, "faces": {"0": start(), "1": {"type": 1e308}}}]})
        self.assertEqual(report, ["block 0 at 5,5,5 face 1 holds nothing that could stand on a face; it is left out"])
        self.assertEqual(p["blocks"], [{"cell": [5, 5, 5], "kind": 0, "faces": {"0": start()}}])

    def test_a_platforms_length_that_runs_past_the_edge_is_cut_on_the_way_in_to_a_run_the_checks_hold_inside_it(self):
        p, report = read_project(project([
            plain((5, 5, 5), t0=start()),
            {"cell": [10, 28, 17], "kind": PLATFORM_KIND, "far": [10, 30, 17], "length": 32767, "speed": 30},
            {"cell": [12, 10, 17], "kind": PLATFORM_KIND, "far": [12, 14, 17], "length": 0, "speed": 30},
            {"cell": [14, 10, 17], "kind": PLATFORM_KIND, "far": [14, 14, 17], "length": 19, "speed": 30},
            {"cell": [16, 31, 17], "kind": PLATFORM_KIND, "far": [16, 33, 17], "length": 2, "speed": 30},
            {"cell": [18, 33, 17], "kind": PLATFORM_KIND, "far": [18, 20, 17], "length": 2, "speed": 30}]))
        self.assertEqual([b["length"] for b in p["blocks"] if b["kind"] == PLATFORM_KIND], [3, 1, 19, 1, 1])
        self.assertEqual(report, [
            "block 1 at 10,28,17 has a length of 32767, which runs past the edge; it is 3",
            "block 2 at 12,10,17 has a length of 0, which is less than one block; it is 1",
            "block 4 at 16,31,17 has a length of 2, which runs past the edge; it is 1",
            "block 5 at 18,33,17 has a length of 2, which runs past the edge; it is 1",
        ])
        # the run's edge error stays only where the cell itself is past the edge
        self.assertEqual(texts(validate(p, HIDES), "error"), [
            "the game builds nothing past the edge",
            "a platform 19 blocks long, more than the 7 the game's grid holds",
            "the far end is past the edge",
            "the platform's run reaches past the edge",
        ])
        case = next(c for c in json.loads(HOSTILE.read_text())["cases"]
                    if c["name"] == "two hundred platforms of length 32767")
        q, lines = read_project(case["input"])
        platforms = [b for b in q["blocks"] if b["kind"] == PLATFORM_KIND]
        self.assertEqual(len(platforms), 200)
        self.assertEqual([b["length"] for b in platforms], [SIDE - 1 - max(b["cell"][1], b["far"][1]) for b in platforms])
        self.assertEqual(len(lines), 4)
        self.assertNotIn("the platform's run reaches past the edge", texts(validate(q, HIDES), "error"))
        self.assertEqual(Level(canonical(q)).verify(), [])

    def test_a_title_an_author_notes_a_world_a_target_or_a_source_past_their_most_are_cut_to_it_counted_in_characters(self):
        title = "a" * 78 + "\U0001F600" * 3
        p, report = read_project(project([plain((5, 5, 5), t0=start())], title=title, author="b" * 2000,
                                         notes="c" * 2001, world="HIRO" + "w" * 1997, into="/HIRO/HIRO.PAK#1" + "x" * 2000,
                                         **{"from": "/HIRO/HIRO.PAK#3" + "y" * 1984}))
        self.assertEqual(p["title"], "a" * 78 + "\U0001F600" * 2)
        self.assertEqual((len(p["title"]), len(p["author"]), len(p["notes"])), (80, 2000, 2000))
        self.assertEqual(p["world"], "HIRO" + "w" * 1996)
        self.assertEqual(p["into"], "/HIRO/HIRO.PAK#1" + "x" * 1984)
        self.assertEqual(p["from"], "/HIRO/HIRO.PAK#3" + "y" * 1984)
        self.assertEqual(report, [
            "title is 81 characters long, more than the 80 kept; it is cut to 80",
            "notes is 2001 characters long, more than the 2000 kept; it is cut to 2000",
            "world is 2001 characters long, more than the 2000 kept; it is cut to 2000",
            "into is 2016 characters long, more than the 2000 kept; it is cut to 2000",
        ])

    def test_a_whole_number_past_2_53_is_no_whole_number_and_is_reported_as_the_page_parsed_it(self):
        p, report = read_project(json.loads(f'''{{"format": "{FORMAT}", "world": "{WORLD}", "time": 9007199254740993, "blocks": [
            {{"cell": [5, 5, 5], "kind": 0, "faces": {{"0": {{"type": 30, "facing": 3}}}}}},
            {{"cell": [7, 5, 5], "kind": 5, "far": [7, 9, 5], "length": 1e400, "speed": 1e16}},
            {{"cell": [9, 5, 5], "kind": 7, "phase": 1152921504606846976}}
        ]}}'''))
        self.assertEqual(p["time"], 99)
        self.assertEqual(p["blocks"][1:], [
            {"cell": [7, 5, 5], "kind": PLATFORM_KIND, "far": [7, 9, 5], "length": 2, "speed": 30},
            {"cell": [9, 5, 5], "kind": 7, "phase": 0},
        ])
        self.assertEqual(report, [
            "a time of 9007199254740992 is not a whole number; it is 99",
            "block 1 at 7,5,5 has a length of null, which is not a whole number; it is 2",
            "block 1 at 7,5,5 has a speed of 10000000000000000, which is not a whole number; it is 30",
            "block 2 at 9,5,5 has a phase of 1152921504606847000, which is not a whole number; it is 0",
        ])

    def test_the_reader_keeps_three_lines_of_a_shape_and_counts_the_rest_where_they_fall(self):
        coin = {"type": COIN, "variant": 0}
        p, report = read_project({
            "format": FORMAT, "world": WORLD, "time": "x",
            "blocks": [{"cell": [5 + i, 5, 5], "kind": 7, "phase": "x"} for i in range(5)]
            + [{"cell": [5, 9, 5], "kind": 0, "faces": {"0": start(), "6": coin, "7": coin, "8": coin, "9": coin}}],
        })
        self.assertEqual(len(p["blocks"]), 6)
        self.assertEqual(report, [
            'a time of "x" is not a whole number; it is 99',
            'block 0 at 5,5,5 has a phase of "x", which is not a whole number; it is 0',
            'block 1 at 6,5,5 has a phase of "x", which is not a whole number; it is 0',
            'block 2 at 7,5,5 has a phase of "x", which is not a whole number; it is 0',
            "2 more lines like the one above",
            'block 5 at 5,9,5 names a face "6", which is not one of the six; it is left out',
            'block 5 at 5,9,5 names a face "7", which is not one of the six; it is left out',
            'block 5 at 5,9,5 names a face "8", which is not one of the six; it is left out',
            "1 more line like the one above",
        ])

    def test_a_face_key_is_read_by_its_number_and_a_second_spelling_of_one_face_is_left_out(self):
        coin = {"type": COIN, "variant": 0}
        p, report = read_project({"format": FORMAT, "world": WORLD,
                                  "blocks": [{"cell": [5, 5, 5], "kind": 0, "faces": {"05": coin, "5": {"type": KEY}, "00": start()}}]})
        self.assertEqual(p["blocks"][0]["faces"], {"0": start(), "5": {"type": KEY}})
        self.assertEqual(report, ['block 0 at 5,5,5 names face 5 again as "05"; it is left out'])
        self.assertEqual(texts(validate(p, HIDES), "error"), [])


class Validates(unittest.TestCase):
    def errors(self, blocks, **more):
        return texts(validate(project(blocks, **more), HIDES), "error")

    def warnings(self, blocks, **more):
        return texts(validate(project(blocks, **more), HIDES), "warning")

    def test_without_the_skins_table_the_checks_run_every_rule_but_the_face_count_and_say_so(self):
        blocks = [plain((5, 5, 5), t0={"type": COIN, "variant": 0}), plain((40, 5, 5))]
        n = counts(project(blocks), None)
        self.assertEqual((n["faces"], n["blocks"], n["cells"], n["objects"]), (None, None, 2, 1))
        found = validate(project(blocks), None)
        self.assertEqual(texts(found, "error"), ["the game builds nothing past the edge", "no start"])
        self.assertIn("the face count could not be read, so the faces and the blocks are not counted", texts(found, "warning"))
        h10 = next(l for l in json.loads(DATA.read_text())["levels"] if l["name"] == "HIDDEN 10")
        self.assertEqual(texts(validate(project_of(h10), None), "error"), [])
        self.assertFalse(any("could not be read" in w for w in texts(validate(project_of(h10), HIDES), "warning")))

    def test_a_level_needs_one_start_and_says_which_of_several_the_game_takes(self):
        self.assertIn("no start", self.errors([plain((5, 5, 5), t0={"type": COIN, "variant": 0})]))
        several = [plain((5, 5, 5), t0=start()), plain((7, 5, 5), t2=start(1), t5=start(2))]
        self.assertEqual(self.errors(several), [])
        self.assertIn("3 starts; the game takes the one on face 5 of the block at 7,5,5", self.warnings(several))
        unordered = [plain((7, 5, 5), t5=start(2), t2=start(1)), plain((5, 5, 5), t0=start())]
        self.assertIn("3 starts; the game takes the one on face 5 of the block at 7,5,5", self.warnings(unordered))

    def test_a_device_works_on_a_plain_block_only(self):
        blocks = [plain((5, 5, 5), t0=start()), plain((7, 5, 5), kind=2, t0={"type": TELEPORTER, "facing": 1, "variant": 0})]
        self.assertIn("a device works on a plain block only", self.errors(blocks))
        blocks[1]["kind"] = 0
        self.assertEqual(self.errors(blocks), [])
        hidden = [plain((5, 5, 5), t0=start()), plain((7, 5, 5), kind=2, t0={"type": 26})]
        self.assertEqual(self.errors(hidden), [])
        self.assertIn("the game has not been seen to take a hidden exit on a block that is not plain", self.warnings(hidden))
        hidden[1]["kind"] = 0
        self.assertFalse(any("hidden exit" in w for w in self.warnings(hidden)))

    def test_the_game_builds_nothing_past_the_edge(self):
        for cell in ((0, 5, 5), (5, 33, 5)):
            self.assertIn("the game builds nothing past the edge", self.errors([plain((5, 5, 5), t0=start()), plain(cell)]))
        self.assertEqual(self.errors([plain((1, 32, 1), t0=start())]), [])

    def test_a_platform_runs_over_empty_cells(self):
        rail = {"cell": [10, 10, 17], "kind": PLATFORM_KIND, "far": [10, 14, 17], "length": 3, "speed": 30}
        self.assertEqual(self.errors([plain((5, 5, 5), t0=start()), rail]), [])
        for cell in ((10, 12, 17), (10, 14, 17), (10, 16, 17)):
            self.assertEqual(self.errors([plain((5, 5, 5), t0=start()), rail, plain(cell)]),
                             [f"the platform's run crosses the block at {cell[0]},{cell[1]},{cell[2]}"])
        self.assertEqual(self.errors([plain((5, 5, 5), t0=start()), rail, plain((10, 17, 17))]), [])
        edge = {"cell": [30, 10, 17], "kind": PLATFORM_KIND, "far": [31, 10, 17], "length": 2, "speed": 30}
        self.assertEqual(self.errors([plain((5, 5, 5), t0=start()), edge]), [])
        for over in (dict(edge, far=[32, 10, 17]), dict(edge, length=3)):
            self.assertEqual(self.errors([plain((5, 5, 5), t0=start()), over]), ["the platform's run reaches past the edge"])
        self.assertIn("a platform 30000 blocks long, which the lattice cannot hold",
                      self.errors([plain((5, 5, 5), t0=start()), dict(edge, length=30000)]))

    def test_every_length_the_writer_refuses_is_an_error_of_its_own_text_whatever_else_the_platform_has(self):
        def rail(upper, length, far=None):
            return [plain((5, 5, 5), t0=start()),
                    {"cell": [10, upper - 1, 17], "kind": PLATFORM_KIND, "far": [10, upper if far is None else far, 17],
                     "length": length, "speed": 30}]

        def held(length):
            return f"a platform {length} blocks long, which the lattice cannot hold"

        for upper in (30, 31, 32, 33):
            for length in range(1, 6):
                blocks = rail(upper, length)
                refused = length > SIDE - upper
                self.assertEqual(held(length) in self.errors(blocks), refused, (upper, length))
                if refused:
                    with self.assertRaises(ValueError):
                        canonical(project(blocks))
                else:
                    canonical(project(blocks))
        # a run that ends on cell 33 is past the edge and the writer still has bytes for it
        self.assertEqual(self.errors(rail(31, 3)), ["the platform's run reaches past the edge"])
        self.assertEqual(self.errors(rail(31, 4)), [held(4)])
        # a far end on the lattice's last cell says so, and hides nothing of the length
        self.assertEqual(self.errors(rail(33, 1)), ["the far end is past the edge"])
        self.assertEqual(self.errors(rail(33, 2)), [held(2)])
        # a far end off the lattice is the far end's error, not the length's
        self.assertEqual(self.errors(rail(31, 2, far=40)), ["the far end is past the edge"])

    def test_a_beam_ends_on_nothing_a_plain_block_or_another_laser_and_crosses_nothing(self):
        beam = {"cell": [10, 10, 17], "kind": LASER_KIND, "far": [14, 10, 17], "colour": 0}
        base = [plain((5, 5, 5), t0=start()), beam]
        self.assertEqual(self.errors(base), [])
        self.assertEqual(self.errors(base + [plain((14, 10, 17))]), [])
        self.assertEqual(self.errors(base + [{"cell": [14, 10, 17], "kind": LASER_KIND, "far": [14, 14, 17], "colour": 1}]), [])
        self.assertIn("a beam ends on an empty cell, a plain block or another laser's block",
                      self.errors(base + [plain((14, 10, 17), kind=2)]))
        self.assertIn("the beam crosses the block at 12,10,17", self.errors(base + [plain((12, 10, 17))]))
        self.assertEqual(self.errors(base + [plain((14, 10, 17), t0={"type": COIN, "variant": 0})]), [])
        self.assertTrue(any(w.startswith("the beam's end makes a bare plain block")
                            for w in self.warnings(base + [plain((14, 10, 17), t0={"type": COIN, "variant": 0})])))

    def test_the_cells_the_loaders_fill_are_checked_against_each_other(self):
        base = plain((5, 5, 5), t0=start())
        beam = {"cell": [10, 10, 17], "kind": LASER_KIND, "far": [10, 16, 17], "colour": 0}
        across = {"cell": [8, 13, 17], "kind": LASER_KIND, "far": [12, 13, 17], "colour": 1}
        self.assertEqual(self.errors([base, beam, across]), [])
        self.assertEqual([w for w in self.warnings([base, beam, across]) if "crosses the beam" in w],
                         ["the beam crosses the beam from 10,10,17; where two cross, the lit one fills the cell",
                          "the beam crosses the beam from 8,13,17; where two cross, the lit one fills the cell"])
        into = {"cell": [8, 13, 17], "kind": LASER_KIND, "far": [10, 13, 17], "colour": 1}
        self.assertEqual(self.errors([base, beam, into]), ["the beam ends in the beam from 10,10,17"])
        rail = {"cell": [8, 13, 17], "kind": PLATFORM_KIND, "far": [12, 13, 17], "length": 2, "speed": 30}
        self.assertEqual(self.errors([base, beam, rail]),
                         ["the platform's run crosses the beam from 10,10,17", "the beam crosses the platform's run from 8,13,17"])
        over_end = {"cell": [8, 16, 17], "kind": PLATFORM_KIND, "far": [12, 16, 17], "length": 2, "speed": 30}
        self.assertEqual(self.errors([base, beam, over_end]), ["the platform's run crosses the end of the beam from 10,10,17"])
        clear = {"cell": [8, 18, 17], "kind": PLATFORM_KIND, "far": [12, 18, 17], "length": 2, "speed": 30}
        self.assertEqual(self.errors([base, beam, clear]), [])

    def test_a_span_lies_along_one_axis_inside_the_edge(self):
        for far, text in (([10, 10, 17], "the far end is the block's own cell"),
                          ([12, 12, 17], "the far end is not along one axis from the block"),
                          ([10, 33, 17], "the far end is past the edge"),
                          ([10, 32767, 17], "the far end is past the edge")):
            beam = {"cell": [10, 10, 17], "kind": LASER_KIND, "far": far, "colour": 0}
            self.assertIn(text, self.errors([plain((5, 5, 5), t0=start()), beam]))
        # the walk over a span's cells never leaves the lattice, however far the end lies
        far = [{"cell": [1 + i % 32, 1 + i // 32, 5], "kind": LASER_KIND, "far": [1 + i % 32, 1 + i // 32, 32767],
                "colour": 0} for i in range(200)]
        errors = self.errors([plain((5, 5, 5), t0=start())] + far)
        self.assertEqual(errors.count("the far end is past the edge"), 200)
        long = {"cell": [10, 10, 17], "kind": PLATFORM_KIND, "far": [10, 12, 17], "length": 32000, "speed": 30}
        self.assertIn("a platform 32000 blocks long, which the lattice cannot hold", self.errors([plain((5, 5, 5), t0=start()), long]))

    def test_a_keyless_level_with_a_laser_counts_the_blocks_the_loader_makes(self):
        ring = [(12, 10, 17), (11, 9, 17), (11, 11, 17), (11, 10, 16), (11, 10, 18)]
        blocks = [{"cell": [10, 10, 17], "kind": LASER_KIND, "far": [10, 14, 17], "colour": 0}, plain((11, 10, 17))]
        blocks += [plain(c) for c in ring]
        self.assertEqual(counts(project(blocks), HIDES)["blocks"], 6)

    def test_the_record_cap(self):
        blocks = [plain((1 + i % 32, 1 + i // 32, 5), t0={"type": COIN, "variant": 0}) for i in range(123)]
        blocks[0]["faces"]["0"] = start()
        self.assertEqual(self.errors(blocks), [])
        blocks.append(plain((1, 10, 5), t0={"type": COIN, "variant": 0}))
        self.assertIn("124 records, over the 123 the game has room for", self.errors(blocks))

    def test_the_block_cap(self):
        blocks = [plain((x, y, 17)) for x in range(1, 17) for y in range(1, 17)]
        blocks[0]["faces"] = {"0": start()}
        n = counts(project(blocks), HIDES)
        self.assertEqual((n["blocks"], n["faces"]), (256, 576))
        self.assertEqual(self.errors(blocks), [])
        self.assertIn("256 blocks, more than any level on the disc", self.warnings(blocks))
        blocks.append(plain((17, 1, 17)))
        self.assertIn("257 blocks, over the 256 the game has room for", self.errors(blocks))

    def test_a_document_that_bypassed_the_reader_is_checked_alike_on_both_sides(self):
        findings = validate({
            "format": FORMAT, "world": None, "into": {"pack": 1}, "time": True, "circuits": {},
            "blocks": [
                {"cell": [5, 5, 5], "kind": 0, "faces": {"0": {"type": START, "facing": True},
                                                          "1": {"type": COIN, "variant": True}}},
                {"cell": [6, 5, 5], "kind": True},
                {"cell": [7, 5, 5], "kind": 7, "phase": True},
                {"cell": [8, 5, 5], "kind": LASER_KIND, "far": [8, 5, 50], "colour": False},
                {"cell": [10, 5, 5], "kind": PLATFORM_KIND, "far": [10, 9, 5], "length": False, "speed": True},
            ],
        }, HIDES)
        self.assertEqual([describe(f) for f in findings], [
            "error: the world '' is not one of the disc's ten",
            "error: the target '{\"pack\":1}' is not a slot of a world or a finals pack",
            "error: a time of true seconds, outside the file's range",
            "error at 5,5,5 face 0: a facing of 1 to 4 is needed",
            "error at 5,5,5 face 1: a variant of true",
            "error at 6,5,5: kind true is not a kind of block",
            "error at 7,5,5: a phase of true",
            "error at 8,5,5: a colour of false",
            "error at 8,5,5: the far end is past the edge",
            "error at 10,5,5: a length of false, outside the file's range",
            "warning at 5,5,5 face 1: looks into the block at 6,5,5",
            "warning: with no key the game draws the bonus artwork, which has no picture for the moving platform",
        ])
        # JSON spelled otherwise than the readers spell it: whole numbers with a point, null where a
        # key is missing, a list for a table, a boolean or text for a number
        spelled = json.loads('''{
  "format": "kula-world-level", "world": "HIRO", "time": false, "hidden": [], "circuits": ["off"],
  "blocks": [
    {"cell": [5.0, 5, 5], "kind": 0.0, "faces": {"0": {"type": 30.0, "facing": 3.0}, "1": {"type": 37.0, "variant": 1.0}}},
    {"cell": [6, 5, 5], "kind": null},
    {"cell": [7, 5, 5], "kind": 7, "phase": 0.0},
    {"cell": [8, 5, 5], "kind": 8, "far": null, "colour": 0},
    {"cell": [9, 5, 5], "kind": 8, "far": {}, "colour": 0},
    {"cell": [10, 5, 5], "kind": 8, "far": [10, 9, 5], "colour": null},
    {"cell": [12, 5, 5], "kind": 0, "faces": [{"type": 30, "facing": 3}]},
    {"cell": [10, 10, 17], "kind": 5, "far": [10, 12, 17], "length": "2", "speed": 30.0},
    {"cell": [8, 13, 17], "kind": 8, "far": [12, 13, 17], "colour": 1},
    {"cell": [14, 5, 5], "kind": 5, "far": [14, 9, 5], "length": 2.0, "speed": 30, "faces": 5}
  ]
}''')
        self.assertEqual([describe(f) for f in validate(spelled, HIDES)], [
            "error: a time of false seconds, outside the file's range",
            "error at 6,5,5: kind null is not a kind of block",
            "error at 8,5,5: a span needs a far end",
            "error at 8,13,17: the beam crosses the platform's run from 10,10,17",
            "error at 9,5,5: the far end is not along one axis from the block",
            "error at 10,5,5: a colour of none",
            "error at 10,10,17: a length of 2, outside the file's range",
            "warning at 5,5,5 face 1: looks into the block at 6,5,5",
            "warning: 2 starts; the game takes the one on face 0 of the block at 12,5,5",
            "warning: the yellow circuit starts off and has no switch to turn it on",
        ])
        self.assertEqual(counts(spelled, HIDES), {"records": 10, "cells": 10, "faces": 75, "blocks": 5, "objects": 1, "platforms": 2, "lasers": 4, "vanishing": 1, "crumbling": 0, "captivators": 0, "keys": 0, "lights": 0, "spikes": 0})
        self.assertEqual(plays_as(spelled), "Plays as a hidden bonus level, with the glass ball on half-seen blocks: it has no key, so every block scores 50 the first time the ball rolls onto it, the level ends once every block has been rolled, and an exit stands open from the start.")

    def test_the_targets_slot_is_a_run_of_ascii_digits_and_the_world_and_the_target_are_quoted_as_written(self):
        def into(text):
            return self.errors([plain((5, 5, 5), t0=start())], into=text)

        self.assertEqual(into("/HIRO/HIRO.PAK#3"), [])
        for text in ("/HIRO/HIRO.PAK#٣", "/HIRO/HIRO.PAK#²", "/HIRO/HIRO.PAK#3 "):
            self.assertEqual(into(text), [f"the target '{text}' is not a slot of a world or a finals pack"])
        self.assertEqual(self.errors([plain((5, 5, 5), t0=start())], world="it's"),
                         ["the world 'it's' is not one of the disc's ten"])

    def test_the_face_cap_with_the_level_that_sits_under_it(self):
        data = json.loads(DATA.read_text())
        h10 = next(l for l in data["levels"] if l["name"] == "HIDDEN 10")
        p = project_of(h10)
        self.assertEqual(counts(p, HIDES)["faces"], 766)
        self.assertEqual(texts(validate(p, HIDES), "error"), [])
        free = [h10["min"][0] - 2, h10["min"][1], h10["min"][2]]
        self.assertTrue(all(c in range(1, 33) for c in free))
        p["blocks"].append({"cell": free, "kind": 0})
        self.assertEqual(counts(p, HIDES)["faces"], 772)
        self.assertIn("772 faces, over the 768 the game has room for", texts(validate(p, HIDES), "error"))

    def test_the_object_cap_counts_what_the_loader_numbers(self):
        coin = {"type": COIN, "variant": 0}
        six = {f"t{j}": coin for j in range(6)}
        blocks = [plain((5, 5, 5), t0=start())]
        blocks += [plain((1 + i % 32, 20 + i // 32, 5), **six) for i in range(42)]
        blocks.append(plain((20, 25, 5), t0=coin, t1=coin, t2=coin))
        self.assertEqual(counts(project(blocks), HIDES)["objects"], 255)
        self.assertEqual(self.errors(blocks), [])
        self.assertIn("255 objects the loader numbers, more than any level on the disc", self.warnings(blocks))
        blocks.append(plain((22, 25, 5), t0=coin))
        self.assertIn("256 objects the loader numbers, over the 255 the game has room for", self.errors(blocks))

    def test_the_platform_vanishing_crumbling_and_captivator_caps(self):
        def with_start(more):
            return [plain((5, 5, 5), t0=start())] + more

        def rail(i):
            return {"cell": [1 + 2 * i, 10, 5], "kind": PLATFORM_KIND, "far": [1 + 2 * i, 12, 5], "length": 2, "speed": 30}

        rails = [rail(i) for i in range(8)]
        self.assertEqual(self.errors(with_start(rails)), [])
        self.assertIn("8 platforms, more than any level on the disc", self.warnings(with_start(rails)))
        self.assertIn("9 platforms, over the 8 the game has room for", self.errors(with_start(rails + [rail(8)])))

        vanishing = [{"cell": [1 + i % 32, 20 + 2 * (i // 32), 5], "kind": 7, "phase": 0} for i in range(64)]
        n = counts(project(with_start(vanishing)), HIDES)
        self.assertEqual((n["vanishing"], n["records"], n["blocks"]), (64, 65, 65))
        self.assertEqual(self.errors(with_start(vanishing)), [])
        self.assertIn("64 vanishing blocks, more than any level on the disc", self.warnings(with_start(vanishing)))
        self.assertFalse(any("vanishing, more" in w for w in self.warnings(with_start(vanishing[:14]))))
        self.assertIn("15 vanishing blocks, more than any level on the disc", self.warnings(with_start(vanishing[:15])))
        self.assertIn("65 vanishing blocks, over the 64 the game has room for",
                      self.errors(with_start(vanishing + [{"cell": [1, 24, 5], "kind": 7, "phase": 0}])))

        crumbling = [{"cell": [1 + i % 32, 20 + 2 * (i // 32), 5], "kind": 6} for i in range(64)]
        self.assertEqual(self.errors(with_start(crumbling)), [])
        self.assertFalse(any("crumbling, more" in w for w in self.warnings(with_start(crumbling[:33]))))
        self.assertIn("34 crumbling blocks, more than any level on the disc", self.warnings(with_start(crumbling[:34])))
        self.assertIn("65 crumbling blocks, over the 64 the game has room for",
                      self.errors(with_start(crumbling + [{"cell": [1, 24, 5], "kind": 6}])))

        wandering = {"type": 53}
        captive = [plain((1 + 2 * i, 20, 5), **{f"t{j}": wandering for j in range(6)}) for i in range(5)]
        captive.append(plain((12, 20, 5), t0=wandering, t1=wandering))
        self.assertEqual(counts(project(with_start(captive)), HIDES)["captivators"], 32)
        self.assertEqual(self.errors(with_start(captive)), [])
        self.assertIn("32 captivators, more than any level on the disc", self.warnings(with_start(captive)))
        captive[5]["faces"]["2"] = wandering
        self.assertIn("33 captivators, over the 32 the game has room for", self.errors(with_start(captive)))

    def test_the_light_and_the_moving_spikes_caps(self):
        def switch(colour):
            return {"type": SWITCH, "variant": colour}

        blocks = [plain((5, 5, 5), t0=start())]
        blocks += [plain((1 + 2 * i, 20, 5), **{f"t{j}": switch(j % 4) for j in range(6)}) for i in range(5)]
        blocks.append(plain((12, 20, 5), t0=switch(0), t1=switch(1)))
        self.assertEqual(counts(project(blocks), HIDES)["lights"], 32)
        self.assertEqual(self.errors(blocks), [])
        self.assertIn("32 devices that cast a light, more than any level on the disc", self.warnings(blocks))
        blocks[6]["faces"]["2"] = switch(2)
        self.assertIn("33 devices that cast a light, over the 32 the game has room for", self.errors(blocks))

        spiked = {f"t{j}": {"type": 11, "variant": 0} for j in range(6)}
        spikes = [plain((5, 5, 5), t0=start())]
        spikes += [plain((1 + 2 * i, 20, 5), **spiked) for i in range(10)]
        spikes.append(plain((22, 20, 5), **{f"t{j}": {"type": 11, "variant": 0} for j in range(4)}))
        self.assertEqual(counts(project(spikes), HIDES)["spikes"], 64)
        self.assertEqual(self.errors(spikes), [])
        self.assertIn("64 moving spikes, more than any level on the disc", self.warnings(spikes))
        self.assertFalse(any("moving spikes, more" in w for w in self.warnings(spikes[:4])))
        self.assertIn("24 moving spikes, more than any level on the disc", self.warnings(spikes[:5]))
        spikes[11]["faces"]["4"] = {"type": 11, "variant": 0}
        self.assertIn("65 moving spikes, over the 64 the game has room for", self.errors(spikes))

    def test_a_platform_longer_than_the_rides_grid(self):
        def rail(length):
            return [plain((5, 5, 5), t0=start()),
                    {"cell": [10, 10, 17], "kind": PLATFORM_KIND, "far": [10, 14, 17], "length": length, "speed": 30}]

        self.assertEqual(self.errors(rail(7)), [])
        self.assertIn("a platform 7 blocks long", self.warnings(rail(7)))
        self.assertEqual(self.errors(rail(8)), ["a platform 8 blocks long, more than the 7 the game's grid holds"])
        self.assertFalse(any("blocks long" in w for w in self.warnings(rail(8))))

    def test_a_platform_shorter_than_one_block(self):
        def rail(length):
            return [plain((5, 5, 5), t0=start()),
                    {"cell": [10, 10, 17], "kind": PLATFORM_KIND, "far": [10, 14, 17], "length": length, "speed": 30}]

        self.assertEqual(self.errors(rail(0)), ["a platform 0 blocks long, which is less than one block"])
        self.assertEqual(self.errors(rail(-3)), ["a platform -3 blocks long, which is less than one block"])
        self.assertFalse(any("blocks long" in w for w in self.warnings(rail(0))))

    def test_the_disc_maxima_are_the_most_any_shipped_level_counts(self):
        most = dict.fromkeys(COUNTERS, 0)
        for l in json.loads(DATA.read_text())["levels"]:
            n = counts(project_of(l), HIDES)
            for what in COUNTERS:
                most[what] = max(most[what], n[what])
        self.assertEqual(DISC_MAX, most)

    def test_what_the_format_takes_and_what_it_warns_about(self):
        blocks = [plain((5, 5, 5), t0=start(), t1={"type": 3}, t2={"type": COIN, "variant": 7},
                        t3={"type": START}, t4={"type": 42}, t5={"type": 46})]
        errors = self.errors(blocks)
        self.assertIn("type 3 is nothing the game plays", errors)
        self.assertIn("a variant of 7", errors)
        self.assertIn("a facing of 1 to 4 is needed", errors)
        turned = [plain((5, 5, 5), t0=start(), t1={"type": 53, "facing": 7}, t2={"type": 56})]
        self.assertEqual(self.errors(turned), ["a facing of 1 to 4, or none"])
        warnings = self.warnings(blocks)
        self.assertIn("the star is untested in play", warnings)
        self.assertIn("the game shows the player's next fruit, whichever is placed", warnings)
        self.assertIn("a time of 0 seconds", self.errors([plain((5, 5, 5), t0=start())], time=0))
        self.assertIn("a time of 120 seconds, above the 99 the game's levels keep to",
                      self.warnings([plain((5, 5, 5), t0=start())], time=120))
        self.assertIn("a time of 40000 seconds, outside the file's range",
                      self.errors([plain((5, 5, 5), t0=start())], time=40000))
        wide = {"cell": [10, 10, 17], "kind": PLATFORM_KIND, "far": [10, 14, 17], "length": 2, "speed": 65566}
        self.assertIn("a speed of 65566, outside the file's range", self.errors([plain((5, 5, 5), t0=start()), wide]))
        self.assertIn("a length of 40000, outside the file's range",
                      self.errors([plain((5, 5, 5), t0=start()), dict(wide, length=40000, speed=30)]))
        self.assertIn("the world 'MOON' is not one of the disc's ten", self.errors([plain((5, 5, 5), t0=start())], world="MOON"))
        for into, ok in (("/HIRO/HIRO.PAK#0", True), ("/HELL/HELLFI.PAK#1", True), ("/HELL/HELLFI.PAK#2", False),
                         ("/HIRO/COPYCAT.PAK#0", False), ("HIRO#0", False)):
            self.assertEqual(any("is not a slot of" in e for e in self.errors([plain((5, 5, 5), t0=start())], into=into)),
                             not ok, into)
        self.assertIn("nothing stands on a platform's, laser's, crumbling or vanishing block's faces",
                      self.errors([plain((5, 5, 5), t0=start()), {"cell": [7, 5, 5], "kind": 6, "faces": {"0": {"type": COIN}}}]))
        self.assertIn("face 5 is named twice",
                      self.errors([plain((5, 5, 5), t0=start(), t5={"type": COIN, "variant": 0}, t05={"type": KEY})]))
        self.assertIn("a phase of 4 dims at once", self.warnings([plain((5, 5, 5), t0=start()), {"cell": [7, 5, 5], "kind": 7, "phase": 4}]))
        self.assertIn("a phase of 9", self.errors([plain((5, 5, 5), t0=start()), {"cell": [7, 5, 5], "kind": 7, "phase": 9}]))
        stray = [plain((5, 5, 5), t0=start()), {"cell": [7, 5, 5], "kind": 0, "faces": {"top": {"type": COIN, "variant": 0}}}]
        self.assertIn('face "top" is not one of the six', self.errors(stray))

    def test_an_object_looks_into_an_empty_cell(self):
        blocks = [plain((5, 5, 5), t0=start(), t1={"type": COIN, "variant": 0}, t2={"type": KEY}, t3={"type": GEM, "variant": 0}),
                  plain((6, 5, 5)), {"cell": [5, 6, 5], "kind": 6}, {"cell": [5, 4, 4], "kind": 7, "phase": 0},
                  {"cell": [5, 4, 5], "kind": 7, "phase": 0},
                  {"cell": [5, 8, 7], "kind": LASER_KIND, "far": [5, 8, 3], "colour": 0}, plain((6, 8, 5), t4={"type": COIN, "variant": 0})]
        warnings = self.warnings(blocks)
        self.assertIn("looks into the block at 6,5,5", warnings)
        self.assertIn("looks into a crumbling block", warnings)
        self.assertIn("looks into a vanishing block", warnings)
        self.assertIn("looks into a beam", warnings)

    def test_a_bad_colour_or_variant_is_a_finding_and_leaves_the_circuits_pass_alone(self):
        blocks = [plain((5, 5, 5), t0=start(), t1={"type": TELEPORTER, "facing": 1, "variant": 7},
                        t2={"type": SWITCH, "variant": -1}, t3={"type": COIN, "variant": "gold"}),
                  {"cell": [9, 9, 9], "kind": LASER_KIND, "far": [9, 12, 9], "colour": 7},
                  {"cell": [9, 9, 12], "kind": LASER_KIND, "far": [9, 12, 12]}]
        findings = validate(project(blocks, circuits={"7": "off"}), HIDES)
        errors = texts(findings, "error")
        for text in ("a variant of 7", "a variant of -1", "a variant of gold", "a colour of 7", "a colour of none"):
            self.assertIn(text, errors)
        self.assertFalse(any(" 7 " in w or " -1 " in w for w in texts(findings, "warning")))
        self.assertEqual(counts(project(blocks), HIDES)["lasers"], 2)

    def test_a_circuits_members_are_counted_on_the_faces_the_game_walks_by_colour(self):
        blocks = [plain((5, 5, 5), t0=start(), t1={"type": SWITCH, "variant": 2},
                        t2={"type": TELEPORTER, "facing": 1, "variant": 2}, t3={"type": SWITCH}),
                  {"cell": [7, 5, 5], "kind": PLATFORM_KIND, "far": [7, 9, 5], "length": 2, "speed": 30,
                   "faces": {"0": {"type": SWITCH, "variant": 2}}},
                  {"cell": [9, 5, 5], "kind": LASER_KIND, "far": [9, 9, 5], "colour": 2},
                  {"cell": [11, 5, 5], "kind": LASER_KIND, "far": [11, 9, 5]},
                  plain((13, 5, 5), t0={"type": TELEPORTER, "facing": 1, "variant": 7}, t1={"type": SWITCH, "variant": -1})]
        self.assertEqual(circuit_members(project(blocks)), [
            {"switches": 1, "teleporters": 0, "lasers": 1},
            {"switches": 0, "teleporters": 0, "lasers": 0},
            {"switches": 1, "teleporters": 1, "lasers": 1},
            {"switches": 0, "teleporters": 0, "lasers": 0},
        ])

    def test_the_circuits_warnings(self):
        blocks = [plain((5, 5, 5), t0=start(), t1={"type": TELEPORTER, "facing": 1, "variant": 0}, t2={"type": SWITCH, "variant": 1}),
                  {"cell": [9, 9, 9], "kind": LASER_KIND, "far": [9, 12, 9], "colour": 2}]
        warnings = self.warnings(blocks, circuits={"2": "off"})
        self.assertIn("the green circuit starts off and has no switch to turn it on", warnings)
        self.assertIn("the one yellow teleporter leads to itself", warnings)
        self.assertIn("the blue switches have nothing to switch", warnings)
        with mock.patch("kula_kwl._names", return_value={"kinds": {}, "types": {}}):
            self.assertIn("the 2 circuit starts off and has no switch to turn it on", self.warnings(blocks, circuits={"2": "off"}))
        self.assertIn("a key and no exit", self.warnings([plain((5, 5, 5), t0=start(), t1={"type": KEY})]))
        self.assertNotIn("a key and no exit", self.warnings([plain((5, 5, 5), t0=start(), t1={"type": KEY}, t2={"type": EXIT})]))
        self.assertNotIn("a key and no exit", self.warnings([plain((5, 5, 5), t0=start(), t1={"type": KEY}, t2={"type": 26})]))

    def test_a_keyless_level_is_warned_of_what_the_bonus_artwork_has_no_picture_for(self):
        bonus = json.loads(OBJECTS.read_text())["skins"]["sets"]["bonus"]

        def placeholder(models):
            return all(m == [8] for m in models)

        self.assertEqual(list(BONUS_UNDRAWN_KINDS),
                         [int(k) for k, m in bonus["kinds"].items() if placeholder([m])] + ([5] if placeholder(bonus["platform"]) else []))
        self.assertEqual(list(BONUS_UNDRAWN_TYPES),
                         [int(t) for t, m in bonus["types"].items() if int(t) in PLAYED and placeholder([m])])
        blocks = [plain((5, 5, 5), t0=start(), t1={"type": 8}, t2={"type": 46}, t3={"type": 43}, t4={"type": EXIT}),
                  plain((7, 5, 5), kind=1), plain((9, 5, 5), kind=2),
                  {"cell": [11, 5, 5], "kind": PLATFORM_KIND, "far": [11, 8, 5], "length": 2, "speed": 30}]
        self.assertIn("with no key the game draws the bonus artwork, which has no picture for the clock, the fruit, the exit, "
                      "the fire block, the ice block or the moving platform", self.warnings(blocks))
        self.assertIn("with no key the game draws the bonus artwork, which has no picture for the fire",
                      self.warnings([plain((5, 5, 5), t0=start(), t1={"type": 1})]))
        self.assertFalse(any("bonus artwork" in w for w in self.warnings(blocks, hidden=True)))
        blocks[0]["faces"]["5"] = {"type": KEY}
        self.assertFalse(any("bonus artwork" in w for w in self.warnings(blocks)))
        self.assertFalse(any("bonus artwork" in w for w in self.warnings([plain((5, 5, 5), t0=start(), t1={"type": COIN, "variant": 0})])))
        for l in json.loads(DATA.read_text())["levels"]:
            self.assertFalse(any("bonus artwork" in w for w in texts(validate(project_of(l), HIDES), "warning")), l["name"])

    def test_how_a_level_plays(self):
        keyed = project([plain((5, 5, 5), t0=start(), t1={"type": KEY})])
        self.assertEqual(plays_as(keyed), "Plays as an arcade level.")
        keyless = project([plain((5, 5, 5), t0=start())])
        self.assertTrue(plays_as(keyless).startswith("Plays as a bonus level: it has no key, so every block scores 50"))
        self.assertEqual(plays_as(project(keyed["blocks"], hidden=True)),
                         "Plays as a hidden level, with the glass ball on half-seen blocks.")
        self.assertTrue(plays_as(project(keyless["blocks"], hidden=True)).startswith("Plays as a hidden bonus level"))

    def test_every_shipped_level_validates_with_no_error(self):
        for l in json.loads(DATA.read_text())["levels"]:
            self.assertEqual(texts(validate(project_of(l), HIDES), "error"), [], l["name"])


class TheCli(unittest.TestCase):
    def run_tool(self, *args):
        return subprocess.run([sys.executable, TOOL, *map(str, args)], capture_output=True, text=True)

    def test_a_project_file_is_read_as_the_page_reads_one_and_its_report_printed(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            raw = project([{"cell": [5, 5, 5], "kind": 0, "faces": {"0": start(), "1": {"type": 0}}},
                           {"cell": [7, 5, 5], "kind": LASER_KIND, "far": [7, 9, 5], "colour": 7},
                           {"cell": [9, 5, 5], "kind": LASER_KIND, "far": [9, 5, 5], "colour": 0}], time="99")
            (scratch / "odd.kula.json").write_text(json.dumps(raw))
            done = self.run_tool("--from-json", scratch / "odd.kula.json", "--kwl", scratch / "odd.kwl")
            self.assertEqual(done.returncode, 0, done.stderr)
            self.assertEqual(done.stderr.splitlines()[:4], [
                'a time of "99" is not a whole number; it is 99',
                "block 0 at 5,5,5 face 1 has a type of 0, which is nothing standing there; it is left out",
                "block 1 at 7,5,5 has a colour of 7, which is not one of the 4; it is 0",
                "block 2 at 9,5,5 has its far end on its own cell; it is left out",
            ])
            p, _ = read_project(raw)
            self.assertEqual((scratch / "odd.kwl").read_bytes(), canonical(p))

    def test_what_the_writer_and_the_reader_refuse_is_a_sentence_and_not_a_traceback(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            crowd = [plain((1 + i % 32, 1 + i // 32 % 32, 1 + i // 1024), t0={"type": COIN, "variant": 0}) for i in range(2049)]
            max(crowd, key=lambda b: tuple(b["cell"]))["faces"]["1"] = {"type": SWITCH, "variant": 0}
            (scratch / "bad.kula.json").write_text(json.dumps(project(crowd)))
            done = self.run_tool("--from-json", scratch / "bad.kula.json", "--kwl", scratch / "bad.kwl")
            self.assertEqual(done.returncode, 1, done.stderr)
            self.assertIn("a word of the block at 32,32,2 is outside the file's range", done.stderr)
            self.assertNotIn("Traceback", done.stderr)
            self.assertFalse((scratch / "bad.kwl").exists())
            (scratch / "other.json").write_text('{"format": "orbit"}')
            done = self.run_tool("--from-json", scratch / "other.json", "--kwl", scratch / "other.kwl")
            self.assertEqual(done.returncode, 1, done.stderr)
            self.assertIn(f"is not a {FORMAT} file", done.stderr)
            (scratch / "broken.json").write_text("{")
            done = self.run_tool("--from-json", scratch / "broken.json", "--kwl", scratch / "broken.kwl")
            self.assertEqual(done.returncode, 1, done.stderr)
            self.assertIn("is not JSON", done.stderr)
            self.assertNotIn("Traceback", done.stderr)
            (scratch / "short.kwl").write_bytes(playground()[:-1])
            done = self.run_tool("--from-kwl", scratch / "short.kwl", "--json")
            self.assertEqual(done.returncode, 1, done.stderr)
            self.assertIn("is not a level", done.stderr)
            self.assertNotIn("Traceback", done.stderr)
            done = self.run_tool("--template", "/HIRO/HIRO.PAK#²")
            self.assertEqual(done.returncode, 1, done.stderr)
            self.assertIn("no shipped level is", done.stderr)
            self.assertNotIn("Traceback", done.stderr)


class Digests(unittest.TestCase):
    def test_every_level_has_the_fixtures_digests_and_the_flag_reproduces_it(self):
        want = json.loads(DIGESTS.read_text())
        recorded = want.pop("zlib")
        got = digests(json.loads(DATA.read_text()))
        running = got.pop("zlib")
        self.assertEqual(set(got), set(want))
        for key, entry in want.items():
            self.assertEqual(got[key]["kwl"], entry["kwl"], f"{key}: the level file differs from the fixture's")
            for what in ("deflate", "deflate9", "size"):
                self.assertEqual(got[key][what], entry[what],
                                 f"{key}: {what} differs; the fixture was written with zlib {recorded} and this is zlib {running}")
        if recorded == running:
            self.assertEqual(render_digests(digests(json.loads(DATA.read_text()))), DIGESTS.read_text())

    def test_the_hostile_documents_read_and_write_as_the_fixture_says(self):
        fixture = json.loads(HOSTILE.read_text())
        self.assertGreaterEqual(len(fixture["cases"]), 30)
        self.assertEqual(len({c["name"] for c in fixture["cases"]}), len(fixture["cases"]))
        self.assertEqual(render_hostile(hostile(fixture)), HOSTILE.read_text())
        refused = [c for c in fixture["cases"] if "refusal" in c]
        self.assertTrue(refused and all(c["refusal"] == f"not a {FORMAT} file" for c in refused))

    def test_the_deflate_vectors_are_what_zlib_writes_for_their_inputs(self):
        fixture = json.loads(VECTORS.read_text())
        self.assertEqual(render_vectors(fixture), VECTORS.read_text())
        self.assertEqual(deflate_vectors(fixture)["vectors"], fixture["vectors"])


class TheCompare(unittest.TestCase):
    def test_a_record_dropped_whole_is_a_failure_and_not_a_count(self):
        L = Level(canonical(project_of_level(Level(playground()), world=WORLD)))
        p = project_of_level(L, world=WORLD)
        self.assertEqual(compare(L, Level(canonical(p))), [])
        gone = dict(p, blocks=[b for b in p["blocks"] if b["cell"] != [12, 14, 17]] + [{"cell": [12, 14, 17], "kind": 0}])
        self.assertIn("the records differ by cell and kind", compare(L, Level(canonical(gone))))
        self.assertIn("the blocks differ", compare(L, Level(canonical(dict(p, blocks=p["blocks"][1:])))))
        phased = json.loads(json.dumps(p))
        next(b for b in phased["blocks"] if b["kind"] == 7)["phase"] = 3
        self.assertIn("the phase at (10, 14, 17) differs", compare(L, Level(canonical(phased))))
        self.assertEqual(residuals(Counter(RESIDUALS), Counter(DROPPED)), [])
        self.assertEqual(residuals(Counter(RESIDUALS) + Counter({"kind 7 slot 0 f3": 2}), Counter(DROPPED)),
                         ["2 x kind 7 slot 0 f3, where the table lists 0"])

    def test_the_per_type_constants_are_held_to_the_mode_of_the_discs_objects(self):
        self.assertEqual(trio_failures({31: Counter({(386, 1, -100): 70, (0, 0, 0): 2})}), [])
        self.assertEqual(trio_failures({31: Counter({(386, 1, -100): 2, (0, 0, 0): 3})}),
                         ["type 31 carries (0, 0, 0) on 3 of 5 objects, where the writer holds (386, 1, -100)"])
        self.assertEqual(trio_failures({53: Counter({(-1, -1, -1): 4})}), [])

    def test_the_stripping_names_what_the_rebuild_leaves_out(self):
        kept, gone = stripped(Level(playground()))
        self.assertEqual((len(kept), dict(gone)), (8, {}))
        flagless = level({(5, 5, 5): FIRST_RECORD, (6, 5, 5): FIRST_RECORD + 1},
                         [block((5, 5, 5), faces={0: obj(START, 3, 0, 0)}), block((6, 5, 5)),
                          block((0, 0, 0), kind=UNPLACED_KIND)])
        kept, gone = stripped(Level(flagless))
        self.assertEqual(len(kept), 1)
        self.assertEqual(dict(gone), {"settings records with no flag set": 1, "records carrying nothing": 1})


@unittest.skipUnless(os.environ.get("KULA_DISC"), "needs the disc")
class TheDisc(unittest.TestCase):
    def test_the_caps_and_the_loader_figures_are_the_executables_own(self):
        from kula_motion import Code
        with open_disc() as disc:
            r = executable(Code(disc.read_file(EXE)))
        for what in ("records", "faces", "lights", "spikes", "captivators", "crumbling", "vanishing", "objects"):
            self.assertEqual(CAPS[what], r[what], what)
        self.assertEqual(set(CAPS) - set(r), set(UNTRACED))
        self.assertEqual(LENGTH_CAP, r["platform.length"])
        self.assertEqual(MOVING_SPIKES, r["spikes.type"])
        self.assertEqual(PLAIN_ONLY - {MOVING_SPIKES}, r["glow.types"])
        self.assertEqual((KEY, BLOCK_KINDS), (r["key.type"], r["block.kinds"]))
        self.assertEqual((r["numbered.from"], r["numbered.from"] + r["numbered.count"]), (min(NUMBERED), max(NUMBERED) + 1))
        self.assertEqual(INNER, range(r["inner.from"], r["inner.below"]))
        self.assertEqual(min(CAPTIVATORS), r["captivators.from"])

    def test_the_documents_slot_figures_are_the_discs(self):
        with open_disc() as disc:
            f = slot_figures(disc)
        doc = EDITOR_DOC.read_text()
        bare = re.search(r"the form the disc holds on ([\d,]+) of its empty faces", doc)
        self.assertEqual(int(bare.group(1).replace(",", "")), f["bare"])
        unset = re.search(r"(\d+) to (\d+) of its (\d+) platforms, (\d+) to (\d+) of its (\d+) crumbling blocks, "
                          r"(\d+) to (\d+) of its (\d+) vanishing blocks and (\d+) to (\d+) of its (\d+) lasers by slot", doc)
        self.assertEqual([int(g) for g in unset.groups()],
                         [*f["unset"][PLATFORM_KIND], *f["unset"][6], *f["unset"][7], *f["unset"][LASER_KIND]])
        numbered = re.search(r"numbers its pickups as the writer does on all (\d+) levels that number them", doc)
        self.assertEqual((int(numbered.group(1)), f["ordered"]), (f["numbered"], f["numbered"]))
        self.assertEqual(f["repeats"], ["BONUS 16", "FINAL 11", "FINAL 13", "LECEL 94", "LEVEL 134"])
        fmt = FORMAT_DOC.read_text()
        runs = re.search(r"runs 0 to n-1 with no repeats on (\d+) of the (\d+) levels that have any\. "
                         r"The (\w+) with a repeat are ((?:[A-Z]+ \d+, )*[A-Z]+ \d+ and [A-Z]+ \d+),", fmt)
        self.assertEqual((int(runs.group(1)), int(runs.group(2))), (f["numbered"] - len(f["repeats"]), f["numbered"]))
        self.assertEqual(runs.group(3), "five")
        self.assertEqual(sorted(runs.group(4).replace(" and ", ", ").split(", ")), f["repeats"])

    def test_every_level_rebuilt_plays_as_the_disc_and_differs_in_the_words_listed_alone(self):
        with open_disc() as disc:
            failures, classes, dropped = check(disc, out=lambda *_: None)
        self.assertEqual(failures, [])
        self.assertEqual(dict(classes), RESIDUALS)
        self.assertEqual(dict(dropped), DROPPED)
        self.assertEqual(residuals(classes, dropped), [])


if __name__ == "__main__":
    unittest.main()
