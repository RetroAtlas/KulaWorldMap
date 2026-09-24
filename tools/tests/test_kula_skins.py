"""Unit tests for the skins reader: python3 -m unittest discover -s tools/tests

Nothing here needs the disc: routines are assembled to order for the machine
that runs the face routines, and the sets are cut from a model table made up
to the header's shape.
"""

import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_disc import EXE_BASE  # noqa: E402
from kula_motion import Code  # noqa: E402
from kula_skins import (BLOCK, HEADER, Machine, header, sets)  # noqa: E402

R = {"zero": 0, "at": 1, "v0": 2, "v1": 3, "a0": 4, "a1": 5, "a2": 6, "a3": 7,
     "t0": 8, "t1": 9, "sp": 29, "ra": 31}
AT = EXE_BASE + 0x800


def code(*words):
    blob = bytearray(0x800) + b"".join(struct.pack("<I", w) for w in words)
    return Code(bytes(blob))


def lui(rt, imm):
    return (0x0F << 26) | (R[rt] << 16) | (imm & 0xFFFF)


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


def addu(rd, rs, rt):
    return (R[rs] << 21) | (R[rt] << 16) | (R[rd] << 11) | 0x21


def or_(rd, rs, rt):
    return (R[rs] << 21) | (R[rt] << 16) | (R[rd] << 11) | 0x25


def beq(rs, rt, at, target):
    return (4 << 26) | (R[rs] << 21) | (R[rt] << 16) | (((target - at - 4) >> 2) & 0xFFFF)


def j(target):
    return (2 << 26) | ((target >> 2) & 0x3FFFFFF)


def jr(rs):
    return (R[rs] << 21) | 8


class Addresses(unittest.TestCase):
    def test_an_address_is_a_lui_and_the_addiu_or_load_after_it(self):
        c = code(lui("v0", 0x0007), addiu("v0", "v0", 12072), lui("a3", 0x0007), lw("a3", "a3", 20864))
        self.assertEqual(c.address(AT, AT + 4), 0x80072F28)
        self.assertEqual(c.address(AT + 8, AT + 12), 0x80075180)

    def test_anything_else_there_stops_the_reading(self):
        c = code(addiu("v0", "v0", 12072), lui("v0", 0x0007))
        with self.assertRaises(SystemExit):
            c.address(AT, AT + 4)


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


def fake_header(shade, turn, groups):
    blob = bytearray(400)
    struct.pack_into("<6I", blob, HEADER["shade"], *shade)
    struct.pack_into("<I", blob, HEADER["turn"], turn)
    struct.pack_into("<5I", blob, HEADER["groups"], *groups)
    return bytes(blob)


READINGS = {"clock.alias": 29, "clock.type": 8, "invisible": 6, "crumbling": 4, "laser": 5}


def fake_models(groups):
    """A model table of the header's shape, two sets sharing the first group's
    size, each model naming its own index."""
    return [[i] for i in range(sum(groups) + groups[0])]


class Sets(unittest.TestCase):
    def test_the_header_carries_a_shade_per_face_the_turn_and_the_groups(self):
        h = header(fake_header([1, 1, 2, 0, 1, 1], 2, [7, 4, 50, 1, 50]))
        self.assertEqual(h, {"shade": [1, 1, 2, 0, 1, 1], "turn": 2, "groups": [7, 4, 50, 1, 50]})

    def test_a_set_is_its_specials_then_its_stones_then_a_model_a_type(self):
        groups = [7, 4, 50, 1, 50]
        s = sets(fake_models(groups), groups, READINGS)
        arcade, bonus = s["arcade"], s["bonus"]
        self.assertEqual(arcade["stone"], [[7], [8], [9], [10]])
        self.assertEqual(arcade["types"]["1"], [12])
        self.assertEqual(arcade["types"]["49"], [60])
        self.assertEqual(arcade["kinds"], {"1": [12], "2": [13], "3": [6], "4": [15], "6": [4], "7": [7]})
        self.assertEqual(arcade["laser"], [5])
        self.assertEqual(arcade["platform"], [[0], [1], [2], [3]])
        self.assertEqual(bonus["stone"], [[68]])
        self.assertEqual(bonus["types"]["1"], [70])
        self.assertEqual(bonus["kinds"]["3"], [67])
        self.assertEqual(bonus["kinds"]["7"], [68])

    def test_the_clocks_alias_draws_the_clocks_model(self):
        groups = [7, 4, 50, 1, 50]
        s = sets(fake_models(groups), groups, READINGS)
        self.assertEqual(s["arcade"]["types"]["29"], s["arcade"]["types"]["8"])
        self.assertEqual(s["bonus"]["types"]["29"], [69 + 8])

    def test_a_set_short_of_a_model_a_type_stops_the_reading(self):
        groups = [7, 4, 49, 1, 50]
        with self.assertRaises(SystemExit):
            sets(fake_models(groups), groups, READINGS)


if __name__ == "__main__":
    unittest.main()
