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
    FIRST_RECORD,
    GROUP,
    GROUPS,
    HEAD,
    NOWHERE,
    RECORD,
    SIDE,
    START_KIND,
    Level,
)

TAIL = b"\xff" * (GROUP * GROUPS)


def payload(kind, typ, *fields, tail=TAIL):
    """The 250 bytes of an entity that precede its position."""
    words = [kind, typ] + list(fields)
    words += [-1] * (13 - len(words))
    return struct.pack("<13h", *words) + tail


def level(cells, entities, trailer=None, header=None, flag=0):
    """cells is {(x, y, z): value}; entities is a list of (position, payload)."""
    grid = [EMPTY] * CELLS
    for (x, y, z), v in cells.items():
        grid[(x * SIDE + y) * SIDE + z] = v
    blob = struct.pack(f"<{CELLS}H", *grid)
    blob += struct.pack("<hhH", len(cells) if header is None else header, flag, len(entities))
    for pos, pay in entities:
        blob += pay + struct.pack("<3h", *pos)
    blob += payload(START_KIND, 8, 8, 8, 0, 0, 99) if trailer is None else trailer
    return blob + b"\xff" * HEAD


COIN = payload(0, 37)


class Reads(unittest.TestCase):
    def test_an_entity_ends_with_its_position(self):
        L = Level(level({(1, 2, 3): FIRST_RECORD}, [((1, 2, 3), COIN)]))
        self.assertEqual(len(L.objects), 1)
        self.assertEqual(L.objects[0].cell, (1, 2, 3))
        self.assertEqual((L.objects[0].kind, L.objects[0].type), (0, 37))
        self.assertEqual(len(L.objects[0].f), 11)
        self.assertEqual(len(L.objects[0].groups), GROUPS)

    def test_the_first_entity_shares_its_slot_with_the_header(self):
        """The header takes the six bytes where a position would be, so the
        first payload is not padding and is read like any other."""
        L = Level(level({(1, 2, 3): FIRST_RECORD, (4, 5, 6): FIRST_RECORD + 1},
                        [((1, 2, 3), payload(0, 31)), ((4, 5, 6), COIN)], header=20, flag=-1))
        self.assertEqual((L.header, L.flag, L.count), (20, -1, 2))
        self.assertEqual([(e.cell, e.type) for e in L.objects], [((1, 2, 3), 31), ((4, 5, 6), 37)])
        self.assertEqual(L.verify(), [])

    def test_the_trailer_is_not_an_object_and_stands_nowhere(self):
        L = Level(level({(1, 2, 3): FIRST_RECORD}, [((1, 2, 3), COIN)]))
        self.assertEqual(L.trailer.kind, START_KIND)
        self.assertEqual(L.trailer.cell, NOWHERE)
        self.assertEqual(L.trailer.f[:5], [8, 8, 0, 0, 99])
        self.assertEqual([e.kind for e in L.objects], [0])

    def test_a_level_with_only_a_trailer_has_no_objects(self):
        L = Level(level({}, []))
        self.assertEqual(L.objects, [])
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
    def test_a_cell_naming_an_entity_that_stands_elsewhere(self):
        L = Level(level({(1, 2, 3): FIRST_RECORD}, [((4, 5, 6), COIN)]))
        self.assertIn("names entity 0, which stands at 4,5,6", L.verify()[0])

    def test_a_cell_naming_an_entity_that_is_not_there(self):
        L = Level(level({(1, 2, 3): FIRST_RECORD + 9}, [((1, 2, 3), COIN)]))
        self.assertIn("names entity 9 of 1", L.verify()[0])

    def test_a_group_that_reads_as_a_position(self):
        """The reading the parser must not fall back into. The groups are not
        entities, and a range test cannot say so: the game zeroes them on 51
        entities, which puts a lattice-shaped (0, 0, 0) in every group."""
        tail = bytearray(TAIL)
        struct.pack_into("<3h", tail, 0, 7, 7, 7)
        L = Level(level({(1, 2, 3): FIRST_RECORD}, [((1, 2, 3), payload(0, 37, tail=bytes(tail)))]))
        self.assertIn("entity 0 group 1 reads as a position at 7,_,7", L.verify()[0])

    def test_a_zeroed_tail_passes(self):
        L = Level(level({(1, 2, 3): FIRST_RECORD},
                        [((1, 2, 3), payload(0, 37, tail=bytes(GROUP * GROUPS)))]))
        self.assertEqual(L.verify(), [])

    def test_a_trailer_of_the_wrong_kind(self):
        L = Level(level({}, [], trailer=COIN))
        self.assertIn("the trailer is kind 0", L.verify()[0])

    def test_a_trailer_that_claims_a_cell(self):
        blob = bytearray(level({}, []))
        struct.pack_into("<3h", blob, len(blob) - HEAD, 9, 9, 9)
        self.assertIn("the trailer claims a position at 9,9,9", Level(bytes(blob)).verify()[0])

    def test_the_start_kind_among_the_objects(self):
        L = Level(level({(1, 2, 3): FIRST_RECORD}, [((1, 2, 3), payload(START_KIND, 0))]))
        self.assertIn(f"kind {START_KIND} among the entities, at [0]", L.verify()[0])


if __name__ == "__main__":
    unittest.main()
