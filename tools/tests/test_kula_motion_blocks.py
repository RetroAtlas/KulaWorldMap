"""Unit tests for the blocks under the ball and what it stands on: python3 -m unittest discover -s tools/tests"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_motion_blocks import blocks, standing  # noqa: E402
from motion_fixture import GAME  # noqa: E402


class Blocks(unittest.TestCase):
    def test_the_blocks_under_the_ball_ship_the_cold_the_edge_rule_and_the_ride_by_kind(self):
        b = blocks(GAME)
        self.assertEqual(b[2], {"chill": 150, "cold": {"gain": 40, "over": 500, "back": 400, "wane": 10}})
        self.assertEqual(b[6], {"size": 512, "shrink": 26, "edge": {"hold": 301, "back": 401, "push": 40}})
        self.assertEqual(b[5], {"ride": {"bias": 512, "rumble": 70, "body": {"off": 100, "ends": 256},
                                         "end": {"tolerance": 100}}})
        self.assertEqual(set(b), {2, 5, 6})

    def test_a_block_read_from_another_kind_or_held_otherwise_stops_the_reading(self):
        for change in ({"ice.kind": 1}, {"arrow.type": 27}, {"ride.kind": 6}, {"crumble.code.input": 95},
                       {"cold.back": 500}, {"cold.wane": 10}, {"crumble.size": 256}, {"crumble.breaking": 2},
                       {"crumble.broken.seen": 3}, {"crumble.edge.hold": 256}, {"crumble.edge.back": 301},
                       {"ride.bias.travel": 512}, {"ride.body.off": 100}, {"ride.beam": -1}, {"ride.face.x.back": 1},
                       {"ride.face.z": 0}, {"ride.along.x.back": 2}, {"ride.along.y.from": -1}, {"ride.along.z.back": 4},
                       {"ride.along.face.x.back": 2}, {"ride.along.face.y.span": 3}, {"ride.along.face.z.back": 0},
                       {"ride.along.yes": 0}, {"ride.body.axis.z": 0}, {"ride.body.count.less": 0},
                       {"ride.body.block": 256}, {"ride.body.ends": 128}, {"ride.body.ends.back": 256},
                       {"ride.end.kind": 6}, {"ride.end.kind.under": 8}, {"ride.end.bias": 256}, {"ride.end.block": 1024},
                       {"ride.end.tolerance": 90}, {"ride.end.low": 256}, {"ride.end.high": 456}):
            with self.assertRaises(SystemExit):
                blocks({**GAME, **change})


class Standing(unittest.TestCase):
    def test_the_ball_stands_on_each_kind_as_its_own_number_or_one_past_the_types(self):
        self.assertEqual(standing(GAME), {1: 1, 2: 2, 3: 93, 4: 4, 5: 95, 6: 96, 7: 97})

    def test_a_word_read_from_another_kind_or_style_or_a_cell_taken_otherwise_stops_the_reading(self):
        for change in ({"standing.kind.5": 6}, {"standing.style.3": 2}, {"standing.style.word.3": 92},
                       {"standing.word.6": 95}, {"standing.word.5": 50}, {"standing.nothing": 0},
                       {"standing.none": 0}, {"standing.centre": 255}, {"standing.shift": 8}, {"standing.first": 4}):
            with self.assertRaises(SystemExit):
                standing({**GAME, **change})


if __name__ == "__main__":
    unittest.main()
