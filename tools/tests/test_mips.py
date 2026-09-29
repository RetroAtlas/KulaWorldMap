"""Unit tests for the disassembler: python3 -m unittest discover -s tools/tests

Nothing here needs the disc: each word is one the executable holds.
"""

import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_disc import EXE_BASE  # noqa: E402
from kula_motion import Code  # noqa: E402
from mips import Machine, decode  # noqa: E402

R = {"zero": 0, "at": 1, "v0": 2, "v1": 3, "a0": 4, "a1": 5, "a2": 6, "a3": 7,
     "t0": 8, "t1": 9, "sp": 29, "ra": 31}
AT = EXE_BASE + 0x800
BLOCK = 512


def code(*words):
    blob = bytearray(0x800) + b"".join(struct.pack("<I", w) for w in words)
    return Code(bytes(blob))


def addiu(rt, rs, imm):
    return (9 << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def lw(rt, rs, imm):
    return (0x23 << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def sw(rt, rs, imm):
    return (0x2B << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def sb(rt, rs, imm):
    return (0x28 << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def sll(rd, rt, sa):
    return (R[rt] << 16) | (R[rd] << 11) | (sa << 6)


def or_(rd, rs, rt):
    return (R[rs] << 21) | (R[rt] << 16) | (R[rd] << 11) | 0x25


def beq(rs, rt, at, target):
    return (4 << 26) | (R[rs] << 21) | (R[rt] << 16) | (((target - at - 4) >> 2) & 0xFFFF)


def j(target):
    return (2 << 26) | ((target >> 2) & 0x3FFFFFF)


def jr(rs):
    return (R[rs] << 21) | 8


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


class TheMachine(unittest.TestCase):
    def test_a_routine_runs_to_its_return_with_its_delay_slots(self):
        # Stores the turn at byte 6, packs x and y into a word at 32 by the
        # turn, and returns with a store in the delay slot of the jump home.
        c = code(
            lw("v1", "sp", 20),          # the turn
            sb("v1", "a0", 6),
            beq("v1", "zero", AT + 8, AT + 24),
            sll("v0", "a3", 16),         # y << 16, in the delay slot either way
            addiu("a2", "a2", 512),      # turned: x + size
            j(AT + 28),
            or_("v0", "v0", "a2"),
            or_("v0", "v0", "a2"),       # not turned: x
            jr("ra"),
            sw("v0", "a0", 32),
        )
        m = Machine(c)
        mem = m.run(AT, [0x80191000, BLOCK, 1000, 2000], [3000, 0])
        self.assertEqual(mem[0x80191006], 0)
        self.assertEqual(struct.unpack("<HH", bytes(mem[0x80191020 + i] for i in range(4))), (1000, 2000))
        mem = m.run(AT, [0x80191000, BLOCK, 1000, 2000], [3000, 1])
        self.assertEqual(mem[0x80191006], 1)
        self.assertEqual(struct.unpack("<HH", bytes(mem[0x80191020 + i] for i in range(4))), (1512, 2000))

    def test_an_instruction_a_face_routine_should_not_hold_stops_it(self):
        c = code((0x1A << 26))          # a divide
        with self.assertRaises(SystemExit):
            Machine(c).run(AT, [0, 0, 0, 0], [0, 0])


if __name__ == "__main__":
    unittest.main()
