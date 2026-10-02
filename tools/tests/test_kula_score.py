"""Unit tests for the score tool: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_score import BLOCK_POINTS, level_points, tallied  # noqa: E402

FIRST = 5
INVISIBLE = 3
SETTINGS = 9


def record(x, y, z, kind, on=()):
    return {"x": x, "y": y, "z": z, "kind": kind, "on": [{"type": t} for t in on]}


def level(index, cells, records):
    return {"index": index, "cells": cells, "records": records}


class TheTally(unittest.TestCase):
    def test_a_cell_is_the_kind_of_the_record_its_value_names(self):
        # the settings record shares the invisible block's cell, and the cell names the block
        lv = level(15, [10, 10, 17, FIRST, 11, 10, 17, 0],
                   [record(10, 10, 17, INVISIBLE), record(10, 10, 17, SETTINGS)])
        self.assertEqual(tallied(lv, FIRST), 1)
        lv["records"].reverse()
        lv["cells"][3] = FIRST + 1
        self.assertEqual(tallied(lv, FIRST), 1)


class ThePoints(unittest.TestCase):
    def test_a_plain_kind_earns_nothing_and_a_bonus_level_counts_its_blocks(self):
        kinds = {2: 1000, 6: 50}
        types = {37: lambda o: 250}
        lv = level(15, [10, 10, 17, 2, 11, 10, 17, FIRST],
                   [record(11, 10, 17, 6, on=[37, 37])])
        self.assertEqual(level_points(lv, kinds, types, FIRST), 50 + 500 + 2 * BLOCK_POINTS)
        lv["index"] = 0
        self.assertEqual(level_points(lv, kinds, types, FIRST), 550)


if __name__ == "__main__":
    unittest.main()
