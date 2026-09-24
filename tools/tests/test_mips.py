"""Unit tests for the disassembler: python3 -m unittest discover -s tools/tests

Nothing here needs the disc: each word is one the executable holds.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mips import decode  # noqa: E402


class Gte(unittest.TestCase):
    def test_a_command_is_named_by_its_low_six_bits(self):
        self.assertEqual(decode(0x4A180001, 0)[0], "rtps")
        self.assertEqual(decode(0x4A280030, 0)[0], "rtpt")

    def test_a_move_names_the_coprocessor_register(self):
        self.assertEqual(decode(0x480F6000, 0)[0], "mfc2 $t7, sxy0")
        self.assertEqual(decode(0x488B0800, 0)[0], "mtc2 $t3, vz0")
        self.assertEqual(decode(0x48C6E800, 0)[0], "ctc2 $a2, zsf3")

    def test_a_load_names_the_data_register_it_fills(self):
        self.assertEqual(decode(0xC900FFD0, 0)[0], "lwc2 vxy0, -48($t0)")


if __name__ == "__main__":
    unittest.main()
