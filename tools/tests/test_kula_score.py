"""Unit tests for the score tool: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_score import (OBJECTS, RELEASE_FILES, BLOCK_POINTS, HOURGLASS, compared, curated, hourglass_points,  # noqa: E402
                        level_points, levels_of, plays_bonus, points_of, tallied)

SKINS = json.loads(OBJECTS.read_text())["skins"]
HIDES = SKINS["hides"]
FIRST = 5
INVISIBLE = 3
SETTINGS = 9
KEY = SKINS["keys"]["type"]


def record(x, y, z, kind, on=()):
    return {"x": x, "y": y, "z": z, "kind": kind, "on": [{"type": t} for t in on]}


def level(cells, records, pack="/HIRO/HIRO.PAK"):
    return {"pack": pack, "cells": cells, "records": records}


def cube(side):
    cells = []
    for x in range(10, 10 + side):
        for y in range(10, 10 + side):
            for z in range(10, 10 + side):
                cells += [x, y, z, 0]
    return cells


class TheTally(unittest.TestCase):
    def test_a_cell_is_the_kind_of_the_record_its_value_names(self):
        # the settings record shares the invisible block's cell, and the cell names the block
        lv = level([10, 10, 17, FIRST, 11, 10, 17, 0],
                   [record(10, 10, 17, INVISIBLE), record(10, 10, 17, SETTINGS)])
        self.assertEqual(tallied(lv, FIRST, HIDES), 1)
        lv["records"].reverse()
        lv["cells"][3] = FIRST + 1
        self.assertEqual(tallied(lv, FIRST, HIDES), 1)

    def test_the_game_counts_the_blocks_it_builds(self):
        self.assertEqual(tallied(level(cube(3), []), FIRST, HIDES), 26)
        self.assertEqual(tallied(level([0, 10, 17, 0, 10, 33, 17, 0, 10, 10, 17, 0], []), FIRST, HIDES), 1)
        platform = {"x": 10, "y": 10, "z": 17, "kind": 5, "f": [2, 1, 10, 10, 17, 10, 14, 17], "on": []}
        self.assertEqual(tallied(level([10, 10, 17, FIRST, 12, 12, 17, 0], [platform]), FIRST, HIDES), 1)


class TheLaser(unittest.TestCase):
    def test_a_beams_empty_end_is_a_plain_block_and_a_lasers_own_cell_hides_as_one(self):
        ring = [(12, 10, 17), (11, 9, 17), (11, 11, 17), (11, 10, 16), (11, 10, 18)]
        cells = [10, 10, 17, FIRST, 11, 10, 17, 0]
        for c in ring:
            cells += [*c, 0]
        laser = {"x": 10, "y": 10, "z": 17, "kind": 8, "type": 2, "f": [2, 1, 10, 10, 17, 10, 14, 17, -1, -1, -1],
                 "colour": 0, "on": []}
        lv = level(cells, [laser])
        self.assertTrue(plays_bonus(lv, SKINS))
        self.assertEqual(tallied(lv, FIRST, HIDES), 6)
        self.assertEqual(level_points(lv, {}, {}, FIRST, SKINS), 300)


class ThePoints(unittest.TestCase):
    def test_a_plain_kind_earns_nothing_and_a_level_with_no_key_counts_its_blocks(self):
        kinds = {2: 1000, 6: 50}
        types = {37: lambda o: 250}
        lv = level([10, 10, 17, FIRST, 11, 10, 17, FIRST + 1],
                   [record(10, 10, 17, 2), record(11, 10, 17, 6, on=[37, 37])])
        self.assertTrue(plays_bonus(lv, SKINS))
        self.assertEqual(level_points(lv, kinds, types, FIRST, SKINS), 50 + 500 + 2 * BLOCK_POINTS)
        lv["records"][0]["on"].append({"type": KEY})
        self.assertFalse(plays_bonus(lv, SKINS))
        self.assertEqual(level_points(lv, kinds, types, FIRST, SKINS), 550)
        simon = level(cube(1), [], pack=SKINS["copycat"])
        self.assertFalse(plays_bonus(simon, SKINS))


class TheRelease(unittest.TestCase):
    def test_the_hourglass_scores_the_most_each_release_s_rules_allow(self):
        rules = {r: json.loads(p.read_text())["rules"]["hourglass"] for r, p in RELEASE_FILES.items()}
        self.assertEqual([hourglass_points(rules[r]) for r in ("us", "eu", "jp")], [1190, 990, 0])
        self.assertEqual(hourglass_points({"from": 5999, "second": None, "points": None}), 0)
        kinds, types = points_of({"kinds": {}, "types": {str(HOURGLASS): {"points": 1190}}}, 990)
        self.assertEqual(types[HOURGLASS]({"type": HOURGLASS}), 990)

    def test_a_release_s_levels_are_the_base_s_with_its_own_slots_in_their_place(self):
        base = [{"pack": "/HIRO/HIRO.PAK", "index": i} for i in range(3)]
        own = {"pack": "/HIRO/HIRO.PAK", "index": 1, "release": "eu"}
        self.assertEqual(levels_of(base, {"/HIRO/HIRO.PAK#1": own}), [base[0], own, base[2]])
        self.assertEqual(levels_of(base, {}), base)

    def test_a_curated_score_is_compared_only_where_it_is_meant_for_the_release(self):
        ann = {"kinds": {}, "types": {str(HOURGLASS): {"points": 1190}, str(KEY): {"points": 1000}},
               "levels": {"/HIRO/HIRO.PAK#0": {"score": 900},
                          "/HIRO/HIRO.PAK#1": {"score": 1000, "releases": {"eu": {"score": 800}}},
                          "/HIRO/HIRO.PAK#2": {"releases": {"jp": {"note": "The same level."}}}}}
        self.assertEqual(curated(ann, "us"), {"/HIRO/HIRO.PAK#0": 900, "/HIRO/HIRO.PAK#1": 1000})
        self.assertEqual(curated(ann, "eu"), {"/HIRO/HIRO.PAK#1": 800})
        self.assertEqual(curated(ann, "jp"), {})
        levels = [{**level([10, 10, 17, FIRST], [record(10, 10, 17, 0, on=[HOURGLASS, KEY])]), "index": i}
                  for i in range(3)]
        for release, hourglass, scores in (("us", 1190, [900, 1000, None]), ("eu", 990, [None, 800, None]),
                                           ("jp", 0, [None, None, None])):
            with self.subTest(release):
                rows = compared(levels, ann, hourglass, release, FIRST, SKINS)
                self.assertEqual([l["index"] for l, _, _ in rows], [0, 1, 2])
                self.assertEqual([(total, score) for _, total, score in rows],
                                 [(1000 + hourglass, score) for score in scores])


if __name__ == "__main__":
    unittest.main()
