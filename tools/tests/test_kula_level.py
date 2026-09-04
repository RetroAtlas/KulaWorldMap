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
    RECORD,
    SIDE,
    START_KIND,
    Level,
)


def entity(x, y, z, kind, typ, *fields):
    words = [x, y, z, kind, typ] + list(fields)
    words += [-1] * (16 - len(words))
    return struct.pack("<16h", *words)


def record(head, tail=b"\xff" * (RECORD - GROUP)):
    return head + tail


def level(cells, records, header=None, flag=0):
    """cells is {(x, y, z): value}; records is a list of 256-byte records."""
    grid = [EMPTY] * CELLS
    for (x, y, z), v in cells.items():
        grid[(x * SIDE + y) * SIDE + z] = v
    blob = struct.pack(f"<{CELLS}H", *grid)
    blob += struct.pack("<iHH", len(cells) if header is None else header, len(records), flag)
    blob += b"\xff" * (RECORD - 8)
    return blob + b"".join(records) + b"\xff" * 6


START = record(entity(9, 9, 9, START_KIND, 8, 8, 8, 0, 0, 99))


class Reads(unittest.TestCase):
    def test_a_record_holds_one_entity(self):
        L = Level(level({(1, 2, 3): FIRST_RECORD}, [record(entity(1, 2, 3, 0, 37)), START]))
        self.assertEqual(len(L.records), 2)
        self.assertEqual((L.records[0].x, L.records[0].y, L.records[0].z), (1, 2, 3))
        self.assertEqual(L.records[0].kind, 0)
        self.assertEqual(len(L.records[0].f), 11)

    def test_the_start_is_the_last_record_and_not_an_object(self):
        L = Level(level({(1, 2, 3): FIRST_RECORD}, [record(entity(1, 2, 3, 0, 37)), START]))
        self.assertEqual(L.start.kind, START_KIND)
        self.assertEqual([e.kind for e in L.objects], [0])
        self.assertEqual(L.verify(), [])

    def test_a_level_with_only_a_start_has_no_objects(self):
        L = Level(level({}, [START]))
        self.assertEqual(L.objects, [])
        self.assertEqual(L.verify(), [])

    def test_the_lattice_index_is_the_one_the_game_walks(self):
        L = Level(level({(0, 0, 1): 0, (0, 1, 0): 1, (1, 0, 0): 2}, [START]))
        self.assertEqual(sorted(L.cells), [(0, 0, 1, 0), (0, 1, 0, 1), (1, 0, 0, 2)])
        self.assertEqual(L.extent(), ((0, 1), (0, 1), (0, 1)))

    def test_a_short_or_mis_sized_blob_is_refused(self):
        with self.assertRaises(ValueError):
            Level(b"\xff" * 32)
        with self.assertRaises(ValueError):
            Level(level({}, [START])[:-1])


class Verifies(unittest.TestCase):
    def test_a_cell_naming_a_record_that_sits_elsewhere(self):
        L = Level(level({(1, 2, 3): FIRST_RECORD}, [record(entity(4, 5, 6, 0, 37)), START]))
        self.assertIn("names record 0, which sits at 4,5,6", L.verify()[0])

    def test_a_cell_naming_a_record_that_is_not_there(self):
        L = Level(level({(1, 2, 3): FIRST_RECORD + 9}, [record(entity(1, 2, 3, 0, 37)), START]))
        self.assertIn("names record 9 of 2", L.verify()[0])

    def test_a_group_that_reads_as_a_position(self):
        """The reading the parser must not fall back into. Bytes 32 on are not
        entities, and a range test cannot say so: the game zeroes them on 51
        records, which puts a lattice-shaped (0, 0, 0) in every group."""
        tail = bytearray(b"\xff" * (RECORD - GROUP))
        struct.pack_into("<3h", tail, 0, 7, 7, 7)
        L = Level(level({(1, 2, 3): FIRST_RECORD},
                        [record(entity(1, 2, 3, 0, 37), bytes(tail)), START]))
        self.assertIn("group 1 reads as a position at 7,_,7", L.verify()[0])

    def test_a_zeroed_tail_passes(self):
        L = Level(level({(1, 2, 3): FIRST_RECORD},
                        [record(entity(1, 2, 3, 0, 37), bytes(RECORD - GROUP)), START]))
        self.assertEqual(L.verify(), [])

    def test_a_start_that_is_not_the_last_record(self):
        L = Level(level({}, [START, record(entity(1, 2, 3, 0, 37))]))
        self.assertIn("start records at [0]", L.verify()[0])

    def test_a_level_with_no_start(self):
        L = Level(level({(1, 2, 3): FIRST_RECORD}, [record(entity(1, 2, 3, 0, 37))]))
        self.assertIsNone(L.start)
        self.assertIn("start records at []", L.verify()[0])


if __name__ == "__main__":
    unittest.main()
