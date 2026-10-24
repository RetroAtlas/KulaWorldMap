"""Unit tests for what harms the ball: python3 -m unittest discover -s tools/tests"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_motion_harms import harms  # noqa: E402
from motion_fixture import GAME  # noqa: E402


class Harms(unittest.TestCase):
    def test_the_harms_ship_by_kind_and_by_type_with_the_captivators_squared_reach(self):
        h = harms(GAME)
        self.assertEqual(h["kinds"][1]["heat"], {"burn": 40, "land": 600, "limit": 2000, "cool": 15,
                                                 "swell": 210, "shake": {"base": 40, "over": 25, "big": 126}})
        self.assertEqual(h["kinds"][4], {"melt": {"gain": 300, "top": 2000}})
        self.assertEqual(h["kinds"][8], {"harm": {"cell": -2, "heat": 1900}})
        self.assertEqual(h["types"][11], {"harm": {"flag": 1, "standing": 9}})
        self.assertEqual(h["types"][42], {"harm": {"form": 0}})
        for t in (50, 51, 52):
            self.assertEqual(h["types"][t], {"catch": {"square": 44999}})
        self.assertEqual(h["types"][56], {"catch": {"square": 44999, "stand": 200}})
        self.assertEqual(h["types"][53], {"catch": {"square": 16199}})
        self.assertEqual(h["types"][30], {"dying": {"flash": 1024}, "tint": {"own": 400, "other": 2000}})

    def test_a_harm_read_from_another_kind_type_or_limit_stops_the_reading(self):
        for change in ({"fire.kind": 2}, {"laser.cell": -1}, {"laser.lay": -1}, {"fire.limit.gate": 2000},
                       {"acid.top.gate": 2000}, {"spikes12.type": 11}, {"catch.type53": 52}, {"tint.full": -2048},
                       {"fire.landed": 2}, {"corkscrew.type": 52}, {"corkscrew.rise.y": 300}, {"corkscrew.rise.z": 0}):
            with self.assertRaises(SystemExit):
                harms({**GAME, **change})


if __name__ == "__main__":
    unittest.main()
