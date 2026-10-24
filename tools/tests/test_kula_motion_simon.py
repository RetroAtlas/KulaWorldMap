"""Unit tests for the Simon rooms: python3 -m unittest discover -s tools/tests"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_motion_simon import simon  # noqa: E402
from motion_fixture import GAME  # noqa: E402


class Simon(unittest.TestCase):
    def test_the_simon_rooms_ship_their_latch_their_gates_their_bits_their_sequence_their_points_and_their_players(self):
        s = simon(GAME)
        self.assertEqual(s, {"latch": 5, "idle": [3, 6], "bits": {"right": 1, "left": 2, "forward": 4, "jump": 8},
                             "store": 1024, "empty": -1, "first": 1, "verdict": {"done": 1, "wrong": 2}, "grow": 2,
                             "points": 5, "players": 2, "starter": 1, "over": -1})
        # a tap of Up on the third frame at rest fires on the seventh, past the turn's gate
        self.assertGreaterEqual(s["idle"][0] + s["latch"] - 1, s["idle"][1])
        # the first round asks two moves and every round two more, so the sequence is full in the 512th
        self.assertEqual((s["store"] - (GAME["simon.first"] + 1)) // s["grow"] + 1, 512)
        self.assertEqual(s["points"] + 1, GAME["simon.points.gate"])

    def test_a_simon_word_shared_or_gated_otherwise_stops_the_reading(self):
        for change in ({"simon.mode": 2}, {"simon.next.mode": 0}, {"simon.menu.start": 2}, {"simon.verdict.wrong": 3},
                       {"simon.verdict.stands": 1}, {"simon.rest": 0}, {"simon.rest.flag": 2}, {"simon.pad.up": 32},
                       {"simon.menu.cross": 16}, {"simon.turn.right": 1}, {"simon.empty": 1}, {"simon.latch.set": 2},
                       {"simon.first": 2}, {"simon.starter.flip": 2}, {"simon.bit.left": 4}, {"simon.bit.jump": 16},
                       {"simon.index.half": 2, "simon.index.half.store": 2}, {"simon.index.half.store": 2},
                       {"simon.fill.step": -4}, {"simon.fill.down": -2}, {"simon.fill": 0}, {"simon.empty.again": 0},
                       {"simon.fill.from": 0x800d8780}, {"simon.store": 0x800d7f80}, {"simon.store.last": 1022},
                       {"simon.idle.turn": 8}, {"simon.latch": 3}, {"simon.points.gate.other": 5},
                       {"simon.menu.gate": 7}, {"simon.players.shift": 2}, {"simon.pass.shift": 2},
                       {"simon.points.last": 2}, {"simon.next.worlds": 9}, {"simon.next.levels": 14},
                       {"simon.menu.over": 0}, {"simon.wait": 20}, {"gp": 0x800a2f3c}):
            with self.assertRaises(SystemExit):
                simon({**GAME, **change})


if __name__ == "__main__":
    unittest.main()
