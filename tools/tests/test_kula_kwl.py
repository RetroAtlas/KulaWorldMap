"""Unit tests for the level writer: python3 -m unittest discover -s tools/tests

Only the last class needs the disc, and it is skipped without $KULA_DISC.
"""

import json
import os
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_disc import open_disc  # noqa: E402
from kula_kwl import (  # noqa: E402
    DATA,
    DIGESTS,
    FORMAT,
    OBJECTS,
    canonical,
    check,
    counts,
    digests,
    plays_as,
    project_of,
    project_of_level,
    read_kwl,
    render_digests,
    template,
    validate,
)
from kula_level import (  # noqa: E402
    FIRST_RECORD,
    GRID_BYTES,
    LASER_KIND,
    NOWHERE,
    OWN,
    PLATFORM_KIND,
    SWITCH,
    TELEPORTER,
    TRAILER_KIND,
    UNPLACED_KIND,
    Level,
)
from test_kula_level import block, level, slot  # noqa: E402

TOOL = Path(__file__).resolve().parents[1] / "kula_kwl.py"
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
            again = project_of_level(C, world=l["theme"])
            again["from"], again["title"] = p["from"], p["title"]
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
             "the span at (6, 6, 6) needs a far end"),
            ([plain((5, 5, 5), t0=start(), t7={"type": COIN, "variant": 0})], "face 7 is not one of the six"),
            ([plain((5, 5, 5), t0=start(), t5={"type": COIN, "variant": 0}, t05={"type": KEY})],
             "face 5 of the block at (5, 5, 5) is named twice"),
            ([plain((5, 5, 5), t0=start()), {"cell": [6, 6, 6], "kind": LASER_KIND, "far": [6, 9, 6], "colour": 7}],
             "colour 7 is not one of the four"),
            ([plain((5, 5, 5), t0=start(), t1={"type": TELEPORTER, "facing": 1, "variant": 4})],
             "colour 4 is not one of the four"),
            ([plain((5, 5, 5), t0=start()), plain((6, 6, 6), kind=9)], "kind 9 is not a kind of block"),
            ([plain((5, 5, 5), t0=start()), plain((6, 6, 6), kind=-1)], "kind -1 is not a kind of block"),
            ([plain((5, 5), t0=start())], "cell (5, 5) is outside the lattice"),
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
        self.assertIn("the block at (5, 5, 5)", str(caught.exception))


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

    def test_the_lattice_decides_where_a_record_stands(self):
        blob = level({(1, 2, 3): FIRST_RECORD}, [block((4, 5, 6), faces={0: obj(START, 3, 0, 0)})])
        p, report = read_kwl(blob)
        self.assertEqual(p["blocks"][0]["cell"], [1, 2, 3])
        self.assertTrue(any("the lattice puts it at (1, 2, 3)" in line for line in report), report)
        self.assertEqual(Level(canonical(p)).verify(), [])

    def test_a_record_no_cell_names_is_dropped_and_a_cell_naming_nothing_is_emptied(self):
        blob = level({(1, 2, 3): FIRST_RECORD, (7, 7, 7): FIRST_RECORD + 5},
                     [block((1, 2, 3), faces={0: obj(START, 3, 0, 0)}), block((4, 5, 6), faces={0: obj(COIN, 0, 1)})])
        p, report = read_kwl(blob)
        self.assertEqual([b["cell"] for b in p["blocks"]], [[1, 2, 3]])
        self.assertTrue(any("record 1 of kind 0 at (4, 5, 6) is named by no cell" in line for line in report), report)
        self.assertTrue(any("cell (7, 7, 7) names record 5, which is not a block" in line for line in report), report)

    def test_an_unwired_teleporter_is_wired_on_the_way_out(self):
        blob = level({(1, 2, 3): FIRST_RECORD, (1, 4, 3): FIRST_RECORD + 1},
                     [block((1, 2, 3), faces={0: obj(START, 3, 0, 0), 2: obj(TELEPORTER, 1, 3, 1)}),
                      block((1, 4, 3), faces={0: obj(TELEPORTER, 1, 3, 1)})])
        self.assertTrue(Level(blob).verify())
        p, _ = read_kwl(blob)
        C = Level(canonical(p))
        self.assertEqual(C.verify(), [])
        self.assertEqual((C.records[0].slots[2][7], C.records[1].slots[0][7]), (16, 2))

    def test_a_count_one_too_high_is_read_from_the_length(self):
        blob = bytearray(playground())
        struct.pack_into("<H", blob, GRID_BYTES + 4, 9)
        with self.assertRaises(ValueError):
            Level(bytes(blob))
        p, report = read_kwl(bytes(blob), world=WORLD)
        self.assertEqual(p, PLAYGROUND)
        self.assertIn("the header counts 9 records and the file holds 8", report)

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
        self.assertEqual(sum("is not a block" in line for line in report), 7)


class Validates(unittest.TestCase):
    def errors(self, blocks, **more):
        return texts(validate(project(blocks, **more), HIDES), "error")

    def warnings(self, blocks, **more):
        return texts(validate(project(blocks, **more), HIDES), "warning")

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

    def test_a_span_lies_along_one_axis_inside_the_edge(self):
        for far, text in (([10, 10, 17], "the far end is the block's own cell"),
                          ([12, 12, 17], "the far end is not along one axis from the block"),
                          ([10, 33, 17], "the far end is past the edge")):
            beam = {"cell": [10, 10, 17], "kind": LASER_KIND, "far": far, "colour": 0}
            self.assertIn(text, self.errors([plain((5, 5, 5), t0=start()), beam]))

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

    def test_the_other_counters_and_their_caps(self):
        blocks = [plain((5, 5, 5), t0=start())]
        blocks += [{"cell": [1 + i, 20, 5], "kind": 7, "phase": 0} for i in range(32)]
        blocks += [{"cell": [1 + i, 22, 5], "kind": 7, "phase": 0} for i in range(32)]
        n = counts(project(blocks), HIDES)
        self.assertEqual((n["vanishing"], n["records"], n["blocks"]), (64, 65, 65))
        self.assertEqual(self.errors(blocks), [])
        blocks.append({"cell": [1, 24, 5], "kind": 7, "phase": 0})
        self.assertIn("65 vanishing, over the 64 the game has room for", self.errors(blocks))

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
        for text in ("a variant of 7", "a variant of -1", "a variant of gold", "a colour of 7", "a colour of None"):
            self.assertIn(text, errors)
        self.assertFalse(any("colour 7" in w or "colour -1" in w for w in texts(findings, "warning")))
        self.assertEqual(counts(project(blocks), HIDES)["lasers"], 2)

    def test_the_circuits_warnings(self):
        blocks = [plain((5, 5, 5), t0=start(), t1={"type": TELEPORTER, "facing": 1, "variant": 0}, t2={"type": SWITCH, "variant": 1}),
                  {"cell": [9, 9, 9], "kind": LASER_KIND, "far": [9, 12, 9], "colour": 2}]
        warnings = self.warnings(blocks, circuits={"2": "off"})
        self.assertIn("colour 2 starts off and has no switch to turn it on", warnings)
        self.assertIn("the one teleporter of colour 0 leads to itself", warnings)
        self.assertIn("the switches of colour 1 have nothing to switch", warnings)
        self.assertIn("a key and no exit", self.warnings([plain((5, 5, 5), t0=start(), t1={"type": KEY})]))

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

    def test_what_the_writer_and_the_reader_refuse_is_a_sentence_and_not_a_traceback(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "bad.kula.json").write_text(json.dumps(project([plain((5, 5, 5), t0=start()), plain((5, 5, 5))])))
            done = self.run_tool("--from-json", scratch / "bad.kula.json", "--kwl", scratch / "bad.kwl")
            self.assertEqual(done.returncode, 1, done.stderr)
            self.assertIn("two blocks on cell", done.stderr)
            self.assertNotIn("Traceback", done.stderr)
            self.assertFalse((scratch / "bad.kwl").exists())
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
    def test_the_fixture_is_what_the_data_gives(self):
        self.assertEqual(render_digests(digests(json.loads(DATA.read_text()))), DIGESTS.read_text())


# The words the rebuild writes differently outside the unread mask, each one a
# leftover the game never reads or a heading the format does not carry.
RESIDUALS = {
    # the clock's f2, which the loader never turns
    "kind 0..4 object type 8 f2": 27,
    # an editor's leftovers in the unused slots of five platforms
    "kind 5 slot 2 type": 4,
    "kind 5 slot 3 type": 4,
    "kind 5 slot 4 type": 4,
    "kind 5 slot 5 type": 4,
    "kind 5 slot 2 f4": 1,
    # a deleted object's constants on three lasers
    "kind 8 slot 0 f10": 3,
    "kind 8 slot 0 f14": 3,
    # a platform's position words on two blocks that were once platforms
    **{f"kind 2 record word {w}": 1 for w in range(119, 125)},
    **{f"kind 6 record word {w}": 1 for w in range(119, 125)},
    # a slot's kind word, the scratch the game writes before it reads
    "kind 0..4 object type 35 kind word": 1,
    # LEVEL 125's two yellow teleporters, the one chain the disc left unlinked
    "kind 0..4 object type 5 f6": 1,
}


@unittest.skipUnless(os.environ.get("KULA_DISC"), "needs the disc")
class TheDisc(unittest.TestCase):
    def test_every_level_rebuilt_plays_as_the_disc_and_differs_in_the_words_listed_alone(self):
        with open_disc() as disc:
            failures, classes = check(disc, out=lambda *_: None)
        self.assertEqual(failures, [])
        self.assertEqual(dict(classes), RESIDUALS)


if __name__ == "__main__":
    unittest.main()
