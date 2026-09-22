"""Unit tests for the level parser: python3 -m unittest discover -s tools/tests

Stdlib only, and nothing here needs a disc image: every level is built to
order, which is the only way to exercise the readings the game never produces.
"""

import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_level import (  # noqa: E402
    CELLS,
    EMPTY,
    FACES,
    FIELDS,
    FIRST_RECORD,
    HEAD,
    LASER_KIND,
    NOWHERE,
    PAYLOAD_KINDS,
    SIDE,
    TRAILER_KIND,
    UNPLACED_KIND,
    WORDS,
    Level,
)


def slot(typ=0, *fields, kind=-1, v=-1):
    """One face of a block, or a payload slot: kind, type, fields, pad, value, pad."""
    f = list(fields) + [-1] * (FIELDS - len(fields))
    return [kind, typ] + f + [-1, v, -1]


def block(cell, kind=0, faces=None, second=None):
    """A 256-byte record standing on cell. faces maps a face to its slot."""
    slots = [slot() for _ in range(FACES)]
    for j, s in (faces or {}).items():
        slots[j] = s
    if second is not None:
        slots[1] = second
    slots[0][0] = kind
    words = [w for s in slots for w in s]
    words += [-1] * (WORDS - 3 - len(words))
    return struct.pack(f"<{WORDS}h", *words, *cell)


def level(cells, records, trailer=None, header=None):
    """cells is {(x, y, z): value}; records is a list of 256-byte blocks."""
    grid = [EMPTY] * CELLS
    for (x, y, z), v in cells.items():
        grid[(x * SIDE + y) * SIDE + z] = v
    blob = struct.pack(f"<{CELLS}H", *grid)
    blob += struct.pack("<iH", len(cells) if header is None else header, len(records))
    blob += b"".join(records)
    if trailer is None:
        trailer = block(NOWHERE, kind=TRAILER_KIND, faces={0: slot(20, 13, 17, -5, 0, 99)})
    return blob + trailer


COIN = slot(37, 0, 2, 1, 0, 48, -1, 0, 386, 1, v=-100)
KEY = slot(31, 0, 0, 1, 0, -1, -1, 0, 386, 1, v=-100)


class Reads(unittest.TestCase):
    def test_a_record_ends_with_its_cell(self):
        L = Level(level({(1, 2, 3): FIRST_RECORD}, [block((1, 2, 3), faces={0: COIN})]))
        self.assertEqual(len(L.records), 1)
        r = L.records[0]
        self.assertEqual((r.cell, r.kind), ((1, 2, 3), 0))
        self.assertEqual([(o.face, o.type, o.v) for o in r.objects], [(0, 37, -100)])
        self.assertEqual(r.objects[0].f, [0, 2, 1, 0, 48, -1, 0, 386, 1, -1, -1])

    def test_the_first_record_shares_its_stretch_with_the_header(self):
        """The header takes the six bytes where a cell would be, so the first
        record's slots are not padding and are read like any other's."""
        L = Level(level({(1, 2, 3): FIRST_RECORD, (4, 5, 6): FIRST_RECORD + 1},
                        [block((1, 2, 3), faces={0: KEY}), block((4, 5, 6), faces={0: COIN})],
                        header=-20))
        self.assertEqual((L.header, L.count), (-20, 2))
        self.assertEqual([(r.cell, r.objects[0].type) for r in L.records],
                         [((1, 2, 3), 31), ((4, 5, 6), 37)])
        self.assertEqual(L.verify(), [])

    def test_a_slot_is_an_object_where_its_type_is_set(self):
        """A bare top face is not an empty block: the object can be on any of the six."""
        L = Level(level({(1, 2, 3): FIRST_RECORD, (4, 5, 6): FIRST_RECORD + 1},
                        [block((1, 2, 3), faces={3: KEY}), block((4, 5, 6))]))
        self.assertEqual([(o.face, o.type) for o in L.records[0].objects], [(3, 31)])
        self.assertEqual(L.records[1].objects, [])
        self.assertEqual(L.records[1].as_dict(), {"x": 4, "y": 5, "z": 6, "kind": 0, "on": []})

    def test_a_block_carries_one_object_a_face(self):
        L = Level(level({(1, 2, 3): FIRST_RECORD},
                        [block((1, 2, 3), kind=3, faces={0: COIN, 5: slot(36, 0, 0, 1, 1, v=-17)})]))
        r = L.records[0]
        self.assertEqual(r.kind, 3)
        self.assertEqual([(o.face, o.type, o.v) for o in r.objects], [(0, 37, -100), (5, 36, -17)])
        self.assertEqual([o["face"] for o in r.as_dict()["on"]], [0, 5])

    def test_a_laser_names_its_ends_and_reads_its_colour_out_of_its_second_slot(self):
        beam = slot(1, 1, 1, 1, 2, 3, 9, 2, 3)
        tail = slot(1, -1, -1, 5, -1, 3)
        L = Level(level({(1, 2, 3): FIRST_RECORD},
                        [block((1, 2, 3), kind=LASER_KIND, faces={0: beam, 2: slot(7)}, second=tail)]))
        r = L.records[0]
        self.assertEqual((r.type, r.span, r.colour), (1, ((1, 2, 3), (9, 2, 3)), 3))
        self.assertEqual(r.objects, [])
        d = r.as_dict()
        self.assertEqual((d["type"], d["colour"], d["f"][:2]), (1, 3, [1, 1]))
        self.assertNotIn("colour", Level(level({(1, 2, 3): FIRST_RECORD},
                                               [block((1, 2, 3), faces={0: COIN})])).records[0].as_dict())

    def test_what_stands_on_a_kind_the_game_never_walks_is_not_in_play(self):
        for kind in (PAYLOAD_KINDS | {UNPLACED_KIND}):
            L = Level(level({}, [block((1, 2, 3), kind=kind, faces={5: COIN})]))
            self.assertEqual(L.records[0].objects, [])

    def test_the_trailer_is_not_a_record_and_stands_nowhere(self):
        L = Level(level({(1, 2, 3): FIRST_RECORD}, [block((1, 2, 3), faces={0: COIN})]))
        self.assertEqual(L.trailer.kind, TRAILER_KIND)
        self.assertEqual(L.trailer.cell, NOWHERE)
        self.assertEqual((L.trailer.type, L.trailer.f[:5]), (20, [13, 17, -5, 0, 99]))
        self.assertEqual(len(L.records), 1)

    def test_a_level_with_only_a_trailer_has_no_records(self):
        L = Level(level({}, []))
        self.assertEqual(L.records, [])
        self.assertEqual(L.verify(), [])

    def test_the_lattice_index_is_the_one_the_game_walks(self):
        L = Level(level({(0, 0, 1): 0, (0, 1, 0): 1, (1, 0, 0): 2}, []))
        self.assertEqual(sorted(L.cells), [(0, 0, 1, 0), (0, 1, 0, 1), (1, 0, 0, 2)])
        self.assertEqual(L.extent(), ((0, 1), (0, 1), (0, 1)))

    def test_a_short_or_mis_sized_blob_is_refused(self):
        with self.assertRaises(ValueError):
            Level(b"\xff" * 32)
        with self.assertRaises(ValueError):
            Level(level({}, [])[:-1])


class Verifies(unittest.TestCase):
    def test_a_cell_naming_a_record_that_stands_elsewhere(self):
        L = Level(level({(1, 2, 3): FIRST_RECORD}, [block((4, 5, 6), faces={0: COIN})]))
        self.assertIn("names record 0, which stands at 4,5,6", L.verify()[0])

    def test_a_cell_naming_a_record_that_is_not_there(self):
        L = Level(level({(1, 2, 3): FIRST_RECORD + 9}, [block((1, 2, 3), faces={0: COIN})]))
        self.assertIn("names record 9 of 1", L.verify()[0])

    def test_a_beam_whose_block_is_at_neither_end(self):
        beam = slot(1, 1, 1, 4, 2, 3, 9, 2, 3)
        L = Level(level({(1, 2, 3): FIRST_RECORD}, [block((1, 2, 3), kind=LASER_KIND, faces={0: beam})]))
        self.assertIn("spans (4, 2, 3) to (9, 2, 3) but stands at (1, 2, 3)", L.verify()[0])

    def test_a_trailer_of_the_wrong_kind(self):
        L = Level(level({}, [], trailer=block(NOWHERE, faces={0: COIN})))
        self.assertIn("the trailer is kind 0", L.verify()[0])

    def test_a_trailer_that_claims_a_cell(self):
        blob = bytearray(level({}, []))
        struct.pack_into("<3h", blob, len(blob) - HEAD, 9, 9, 9)
        self.assertIn("the trailer claims a cell at 9,9,9", Level(bytes(blob)).verify()[0])

    def test_the_trailer_kind_among_the_records(self):
        L = Level(level({(1, 2, 3): FIRST_RECORD}, [block((1, 2, 3), kind=TRAILER_KIND)]))
        self.assertIn(f"kind {TRAILER_KIND} among the records, at [0]", L.verify()[0])


if __name__ == "__main__":
    unittest.main()
