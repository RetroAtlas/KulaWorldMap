"""Unit tests for the things on a block and the laser: python3 -m unittest discover -s tools/tests"""

import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_disc import EXE_BASE  # noqa: E402
from kula_motion_code import Code  # noqa: E402
from kula_motion_things import SPINS, SPUN_AT, laser, spin_orders  # noqa: E402
from motion_fixture import GAME, jal  # noqa: E402


class Laser(unittest.TestCase):
    def test_a_circuit_is_its_level_shifted_into_one_channel_or_two(self):
        beam = laser(GAME)
        self.assertEqual(beam["colours"], [[8, 8, 0], [0, 0, 8], [0, 8, 0], [8, 0, 0]])
        self.assertEqual((beam["reach"], beam["nozzle"], beam["width"]), (256, 90, 14))

    def test_a_shift_past_its_channel_stops_the_reading(self):
        with self.assertRaises(SystemExit):
            laser({**GAME, "laser.colour.2": 14})

    def test_a_stretch_short_of_its_faces_stops_the_reading(self):
        with self.assertRaises(SystemExit):
            laser({**GAME, "laser.reach": 200, "laser.reach.back": -200})

    def test_a_blend_that_does_not_add_stops_the_reading(self):
        with self.assertRaises(SystemExit):
            laser({**GAME, "laser.mode": 0})


class Spins(unittest.TestCase):
    def code(self, routine):
        """An executable whose every type's draw builds its spin with `routine`."""
        end = max(SPUN_AT.values()) + 4
        blob = bytearray(end - EXE_BASE)
        for at in SPUN_AT.values():
            struct.pack_into("<I", blob, at - EXE_BASE, jal(routine))
        return Code(bytes(blob))

    def test_a_type_turns_in_the_order_the_routine_its_draw_calls_composes(self):
        for routine, order in SPINS.items():
            self.assertEqual(set(spin_orders(self.code(routine)).values()), {order})

    def test_a_routine_the_reading_does_not_know_stops_it(self):
        with self.assertRaises(SystemExit):
            spin_orders(self.code(0x80060f58))


if __name__ == "__main__":
    unittest.main()
