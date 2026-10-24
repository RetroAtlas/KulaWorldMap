"""Unit tests for the ball, its moves and its roll: python3 -m unittest discover -s tools/tests"""

import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_disc import EXE_BASE  # noqa: E402
from kula_motion_code import Code  # noqa: E402
from kula_motion_roll import STATES, body, moves, roll  # noqa: E402
from motion_fixture import GAME  # noqa: E402


class Moves(unittest.TestCase):
    STATES = [0x8002f8e4, 0x8003007c, 0x8002fce0, 0x8002f930, 0x80030228, 0x80030228, 0x80030228, 0x8002ff18,
              0x8002fa38]

    def states(self, words=STATES):
        """An executable whose ball dispatches its states through these words."""
        at, _, count = STATES
        blob = bytearray(at - EXE_BASE + 4 * count)
        for i, w in enumerate(words):
            struct.pack_into("<I", blob, at - EXE_BASE + 4 * i, w & 0x0FFFFFFF)
        return Code(bytes(blob))

    def test_the_moves_hold_together_at_the_middle_the_wall_and_the_edge(self):
        moves(self.states(), GAME)

    def test_a_state_sent_elsewhere_stops_the_reading(self):
        words = list(self.STATES)
        words[3], words[8] = words[8], words[3]
        with self.assertRaises(SystemExit):
            moves(self.states(words), GAME)

    def test_a_wall_that_does_not_take_the_ball_touching_it_stops_the_reading(self):
        for change in ({"move.touch": 400}, {"move.climb": 412}, {"ball.rest": 90}):
            with self.assertRaises(SystemExit):
                moves(self.states(), {**GAME, **change})

    def test_a_middle_not_half_a_block_in_or_an_edge_not_at_the_far_side_stops_the_reading(self):
        for change in ({"move.stop": 255}, {"move.middle.last": 256}, {"move.middle.past": 257}, {"move.wrap": 500}):
            with self.assertRaises(SystemExit):
                moves(self.states(), {**GAME, **change})

    def test_another_kind_than_ice_another_edge_or_other_strides_stop_the_reading(self):
        for change in ({"move.ice.slide": 1}, {"move.lattice": 34}, {"move.cells.up": 24}, {"move.cells.on": 8}):
            with self.assertRaises(SystemExit):
                moves(self.states(), {**GAME, **change})


class Roll(unittest.TestCase):
    def test_the_roll_ships_one_top_speed_and_an_arc_that_ends_a_radius_off_the_new_face(self):
        r = roll(GAME)
        self.assertEqual(r["rolling"], {"gain": 6, "top": 33, "middle": 256, "wrap": 512, "climb": 413, "touch": 412,
                                     "resume": 100, "recentre": 8, "repeat": 6, "over": [101, 427]})
        self.assertEqual(r["wrap"]["arc"], [[38, 8], [32, 22], [22, 32], [8, 39]])
        self.assertEqual(sum(n for n, _ in r["wrap"]["arc"]), r["rolling"]["resume"])
        self.assertEqual(sum(h for _, h in r["wrap"]["arc"]), r["rolling"]["resume"] + 1)
        self.assertEqual((r["quarter"], r["climb"]), ({"frames": 19, "step": 53, "clamp": 10}, {"frames": 16, "step": -64}))
        self.assertEqual(r["fall"]["lost"], [-2, 36])
        self.assertEqual((r["fall"]["wall"], r["fall"]["behind"], r["fall"]["hold"]), (409, 103, [411, 102]))
        self.assertEqual((r["spin"], r["squash"]["least"], r["look"]["far"]), (-5, 20, 650))

    def test_a_top_speed_taken_otherwise_at_a_landing_stops_the_reading(self):
        for change in ({"land.speed": 30}, {"land.short.speed": 30}, {"roll.top.gate": 34}, {"fall.spin.top": 32}):
            with self.assertRaises(SystemExit):
                roll({**GAME, **change})

    def test_a_ramp_that_does_not_come_to_a_quarter_turn_stops_the_reading(self):
        for change in ({"wrap.frames": 12}, {"wrap.step": 79}, {"climb.step": -60}, {"turn.frames": 18},
                       {"turn.step.right": -52}):
            with self.assertRaises(SystemExit):
                roll({**GAME, **change})

    def test_an_arc_that_does_not_end_off_the_new_face_stops_the_reading(self):
        for change in ({"arc.4.normal": 9}, {"wrap.resume": 90}, {"land.off": 90}, {"land.under": 90}):
            with self.assertRaises(SystemExit):
                roll({**GAME, **change})

    def test_a_pad_bit_shared_doubled_or_a_turn_not_opposite_stops_the_reading(self):
        for change in ({"pad.r1": 16}, {"pad.r2": 3}, {"pad.turn.right": 1}):
            with self.assertRaises(SystemExit):
                roll({**GAME, **change})

    def test_a_gate_not_one_past_its_value_stops_the_reading(self):
        for change in ({"fall.top.gate": -66}, {"turn.clamp.gate": 10}, {"look.to.gate": 32}, {"fall.wall": 408},
                       {"squash.hop.rise": 180}, {"spin.rest": -4}):
            with self.assertRaises(SystemExit):
                roll({**GAME, **change})


class Body(unittest.TestCase):
    def test_the_body_turns_a_quarter_over_the_arc_in_steps_of_a_sixteenth(self):
        self.assertEqual(body(GAME), -256)
        self.assertEqual(body(GAME) * 4, -1024)

    def test_a_mark_not_the_one_the_draw_tests_for_or_shared_stops_the_reading(self):
        for change in ({"body.mark.right": 4}, {"body.test.wall": 3}, {"body.mark.wrap": 0, "body.test.wrap": 0},
                       {"body.mark.left": 3, "body.test.left": 3}):
            with self.assertRaises(SystemExit):
                body({**GAME, **change})

    def test_a_turn_that_is_not_a_quarter_or_another_fixed_point_stops_the_reading(self):
        for change in ({"body.wrap": -200}, {"body.right": -1000}, {"body.left": -1024}, {"body.wall": 1024},
                       {"body.one": 4000}, {"body.one.landing": 1}):
            with self.assertRaises(SystemExit):
                body({**GAME, **change})


if __name__ == "__main__":
    unittest.main()
