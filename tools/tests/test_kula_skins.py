"""Unit tests for the skins reader: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_disc import EXE_BASE  # noqa: E402
from kula_motion_code import Code  # noqa: E402
from kula_skins import (CHECKS, HEADER, IMMEDIATES, header, hiding, lights, marked, sets)  # noqa: E402

R = {"zero": 0, "at": 1, "v0": 2, "v1": 3, "a0": 4, "a1": 5, "a2": 6, "a3": 7,
     "t0": 8, "t1": 9, "t2": 10, "t3": 11, "t6": 14, "s0": 16, "s1": 17, "s2": 18, "s3": 19, "sp": 29, "ra": 31}
AT = EXE_BASE + 0x800


def code(*words):
    blob = bytearray(0x800) + b"".join(struct.pack("<I", w) for w in words)
    return Code(bytes(blob))


def code_at(words):
    """A blob holding each word at its own address, zero everywhere else."""
    blob = bytearray(max(words) + 4 - EXE_BASE)
    for addr, word in words.items():
        struct.pack_into("<I", blob, addr - EXE_BASE, word)
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


def lbu(rt, rs, imm):
    return (0x24 << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def andi(rt, rs, imm):
    return (0x0C << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def ori(rt, rs, imm):
    return (0x0D << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def slti(rt, rs, imm):
    return (0x0A << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def sll(rd, rt, sa):
    return (R[rt] << 16) | (R[rd] << 11) | (sa << 6)


def addu(rd, rs, rt):
    return (R[rs] << 21) | (R[rt] << 16) | (R[rd] << 11) | 0x21


def or_(rd, rs, rt):
    return (R[rs] << 21) | (R[rt] << 16) | (R[rd] << 11) | 0x25


def and_(rd, rs, rt):
    return (R[rs] << 21) | (R[rt] << 16) | (R[rd] << 11) | 0x24


def subu(rd, rs, rt):
    return (R[rs] << 21) | (R[rt] << 16) | (R[rd] << 11) | 0x23


def mult(rs, rt):
    return (R[rs] << 21) | (R[rt] << 16) | 0x18


def sra(rd, rt, sa):
    return (R[rt] << 16) | (R[rd] << 11) | (sa << 6) | 3


def beq(rs, rt, at, target):
    return (4 << 26) | (R[rs] << 21) | (R[rt] << 16) | (((target - at - 4) >> 2) & 0xFFFF)


def bne(rs, rt, at, target):
    return (5 << 26) | (R[rs] << 21) | (R[rt] << 16) | (((target - at - 4) >> 2) & 0xFFFF)


def jal(target):
    return (3 << 26) | ((target >> 2) & 0x3FFFFFF)


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


class Lights(unittest.TestCase):
    def test_a_light_is_three_words_a_shade_from_either_set_the_draw_names(self):
        blob = bytearray(400)
        hiro = [[2867, 2457, 2457], [3686, 3276, 3276], [4915, 4505, 4505]]
        for k, triple in enumerate(hiro):
            struct.pack_into("<3i", blob, 24 + 12 * k, *triple)
            struct.pack_into("<3i", blob, 156 + 12 * k, 4096, 4096, 4096)
        got = lights(bytes(blob), {"light.arcade": 24, "light.bonus": 156})
        self.assertEqual(got, {"arcade": hiro, "bonus": [[4096] * 3] * 3})


class Hiding(unittest.TestCase):
    GAME = {"path.crumbling": -6, "path.vanishing": -7, "path.invisible": 3,
            "hide.below": 2, "hide.also.a": 2, "hide.also.b": 4, "hide.while": 6,
            "invisible.below": 2, "invisible.from": -2, "invisible.span": 2, "invisible.also": 4,
            "crumbling.below": 2, "crumbling.a": 2, "crumbling.b": 4, "crumbling.c": 6}

    def test_a_face_is_hidden_by_the_kinds_its_own_path_tests(self):
        h = hiding(self.GAME)
        self.assertEqual(h["other"], [0, 1, 2, 4, 6])
        self.assertEqual(h["kinds"], {"3": [0, 1, 2, 3, 4], "6": [0, 1, 2, 4, 6], "7": []})

    def test_a_face_built_unseen_behind_a_crumbling_block_is_given_apart(self):
        h = hiding(self.GAME)
        self.assertEqual(h["unseen"], [6])
        self.assertTrue(set(h["unseen"]) <= set(h["other"]))

    def test_an_invisible_block_hides_nothing_but_another_invisible_blocks_face(self):
        h = hiding(self.GAME)
        self.assertNotIn(3, h["other"])
        self.assertIn(3, h["kinds"]["3"])


def check(addr):
    return next(text for at, text, _ in CHECKS if at == addr)


# The fade's three numbers in their instructions, and the instructions the
# checks on a marked face's repaint, the animator's tables, the fade, the
# loader's pair and the two chains it goes to read, each at its own address.
FADE = {0x8002ded8: addiu("v1", "v1", 128), 0x8002dedc: slti("v0", "v1", 4096), 0x8002df3c: addiu("a3", "v0", 160)}
REPAINT = {
    0x8002de04: lbu("v0", "v1", 48), 0x8002de0c: beq("v0", "a1", 0x8002de0c, 0x8002dea4), 0x8002de1c: sb("a1", "v1", 48),
    0x8002de20: lw("a2", "v0", 0), 0x8002de2c: sll("v0", "a1", 1), 0x8002de30: lbu("v1", "a2", 2),
    0x8002de34: andi("v0", "v0", 6), 0x8002de38: andi("v1", "v1", 249), 0x8002de3c: or_("v1", "v1", "v0"),
    0x8002de48: sb("v1", "a2", 2), 0x8002de54: bne("v0", "t0", 0x8002de54, 0x8002dea4), 0x8002de80: slti("v0", "v1", 32),
    0x8002de94: sw("v0", "a1", 0), 0x8002de98: sw("a1", "v0", 0), 0x8002de9c: sw("a2", "v0", 4), 0x8002dea0: sw("zero", "v0", 8),
    0x8004f460: lui("at", 1), 0x8004f464: and_("s2", "s1", "at"), 0x8004f468: bne("s2", "zero", 0x8004f468, 0x8004f484),
    0x8004f478: lbu("s2", "s2", 0), 0x8004f48c: lbu("s2", "s2", 0), 0x8004f494: sb("s2", "t6", 3),
    0x8004f498: lui("at", 6), 0x8004f49c: and_("s2", "s1", "at"), 0x8004f4a0: beq("s2", "zero", 0x8004f4a0, 0x8004f4c0),
    0x8004f4a4: lui("s3", 2), 0x8004f4a8: beq("s2", "s3", 0x8004f4a8, 0x8004f4d4), 0x8004f4ac: lui("s3", 4),
    0x8004f4b0: beq("s2", "s3", 0x8004f4b0, 0x8004f4e8),
    **{at: sw("s2", "t6", 12) for at in (0x8004f4d0, 0x8004f4e4, 0x8004f4f8, 0x8004f50c)},
    **{at: jal(0x8004f3b8) for at in (0x8002a41c, 0x8002a42c, 0x8002a450, 0x8002a460)}, 0x8002a468: jal(0x8002deac),
    0x8002dec8: beq("a0", "t3", 0x8002dec8, 0x8002df68), 0x8002dee0: bne("v0", "zero", 0x8002dee0, 0x8002def4),
    0x8002dee8: sw("t3", "a0", 0), 0x8002def0: sw("t3", "t1", 0), 0x8002def8: sw("v1", "t0", 4), 0x8002defc: lw("a2", "a0", 12),
    0x8002df08: addiu("v0", "a3", -160), 0x8002df0c: mult("v0", "v1"), 0x8002df38: sra("v0", "a3", 12),
    0x8002df64: sw("a2", "a0", 12), 0x8002df70: slti("v0", "t2", 32),
    0x80027000: lw("v1", "v1", 13324), 0x8002701c: subu("v1", "v1", "v0"), 0x80027020: sll("v0", "a3", 1),
    0x80027024: mult("v1", "v0"), 0x80027064: sw("v0", "sp", 24), 0x8002702c: sll("v1", "v1", 1),
    0x80027030: addiu("v1", "v1", 1), 0x80027034: mult("v1", "a3"), 0x80027078: sw("v0", "sp", 28),
    0x80027880: lui("v0", 0x0080), 0x80027884: ori("v0", "v0", 32896), 0x800278b0: sw("v0", "sp", 36),
    0x80027608: lui("v0", 0x00a0), 0x8002760c: ori("v0", "v0", 41120), 0x80027638: sw("v0", "sp", 36),
    0x80028e64: lw("v0", "s0", 6), 0x80028e6c: sw("v0", "s1", 0),
    0x8002de28: beq("a2", "t0", 0x8002de28, 0x8002dea4), 0x8002de78: sll("v0", "v1", 4), 0x8002de88: addiu("a0", "a0", 16),
    0x80027040: addu("a2", "zero", "zero"), 0x8002704c: sw("zero", "sp", 16), 0x800270dc: subu("a2", "a2", "v0"),
    0x800270e0: sw("v0", "sp", 16), 0x800270f8: sw("v0", "sp", 24), 0x8002710c: sw("v0", "sp", 28),
    0x800274e8: addiu("a0", "a0", 4444), 0x80027704: slti("v0", "s1", 20), 0x80027708: bne("v0", "zero", 0x80027708, 0x80027788),
    0x800277b0: addiu("a0", "a0", 4444), 0x8002800c: addiu("a0", "a0", 4444),
}


class Marked(unittest.TestCase):
    def test_the_fade_ships_its_step_its_full_count_and_its_grey_read_from_their_instructions(self):
        c = code_at(FADE)
        r = {key: c.immediate(addr, pattern) for _, key, _, addr, pattern in IMMEDIATES if key.startswith("marked.")}
        self.assertEqual(marked(r), {"step": 128, "full": 4096, "grey": 160})

    def test_a_full_count_not_whole_steps_or_a_grey_past_a_channel_stops_the_reading(self):
        for r in ({"marked.step": 100, "marked.full": 4096, "marked.grey": 160},
                  {"marked.step": 128, "marked.full": 4096, "marked.grey": 256}):
            with self.assertRaises(SystemExit):
                marked(r)

    def test_the_checks_on_the_repaint_the_animator_the_fade_and_the_pair_read_their_instructions(self):
        c = code_at(REPAINT)
        for addr in REPAINT:
            self.assertIsNone(c.immediate(addr, check(addr)), hex(addr))

    def test_another_mask_bit_slot_or_chain_there_stops_the_reading(self):
        c = code_at({**REPAINT, 0x8002de38: andi("v1", "v1", 251), 0x8004f4a4: lui("s3", 3),
                     0x80027078: sw("v0", "sp", 32), 0x800277b0: addiu("a0", "a0", 26460)})
        for addr in (0x8002de38, 0x8004f4a4, 0x80027078, 0x800277b0):
            with self.assertRaises(SystemExit):
                c.immediate(addr, check(addr))


if __name__ == "__main__":
    unittest.main()
