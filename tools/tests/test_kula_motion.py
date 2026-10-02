"""Unit tests for the motion reader: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_disc import EXE_BASE  # noqa: E402
from kula_motion import (  # noqa: E402
    GLOW_FACE, GLOW_MAKE, LIGHT_ROOT, PHASES, ROOT_ROWS, SHADOW_SQUARE, Code, glow_spill, laser, light, root_table,
    shadow_half, spike_cycle, table, vanish_cycle)

R = {"v0": 2, "v1": 3, "a0": 4, "a1": 5, "a2": 6, "a3": 7, "t0": 8, "s0": 16, "zero": 0, "sp": 29, "ra": 31}


def sll(rd, rt, sa):
    return (R[rt] << 16) | (R[rd] << 11) | (sa << 6)


def addu(rd, rs, rt):
    return (R[rs] << 21) | (R[rt] << 16) | (R[rd] << 11) | 0x21


def subu(rd, rs, rt):
    return (R[rs] << 21) | (R[rt] << 16) | (R[rd] << 11) | 0x23


def addiu(rt, rs, imm):
    return (9 << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def lh(rt, rs, imm):
    return (0x21 << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


AT = EXE_BASE + 0x800


def code(*words):
    blob = bytearray(0x800) + b"".join(struct.pack("<I", w) for w in words)
    return Code(bytes(blob))


# The numbers the executable holds, as the reader returns them.
GAME = {
    "spikes.phase.step": 35, "spikes.phase.down": 63, "spikes.phase.held": 96,
    "spikes.phase.retracting": 140, "spikes.phase.down.from": 63,
    "spikes.phase.held.from": 96, "spikes.phase.retracting.from": 140,
    "spikes.down": 63, "spikes.rise": 5, "spikes.rattle": 14, "spikes.hold": 14,
    "spikes.retract": 44, "spikes.harmless": 11,
    "vanish.phase.step": 56, "vanish.phase.absent": 2, "vanish.phase.absent.from": 91,
    "vanish.phase.solid.from": 196, "vanish.absent": 91, "vanish.in": 9, "vanish.settle": 5,
    "vanish.solid": 91, "vanish.dim": 9, "vanish.out": 19,
    "laser.reach": 256, "laser.reach.back": -256, "laser.nozzle": 90, "laser.nozzle.back": -90,
    "laser.width": 7, "laser.width.back": -7, "laser.colour.0a": 3, "laser.colour.0b": 11,
    "laser.colour.1": 19, "laser.colour.2": 11, "laser.colour.3": 3, "laser.step": 1,
    "laser.mode": 32, "laser.levels": [31, 27, 23, 19, 15, 11, 25, 11, 12, 4, 6],
    "shadow.sprite": 14, "shadow.sprites": 2, "shadow.half": 150,
    "shadow.drop.50": -200, "shadow.drop.51": -200, "shadow.drop.52": -200, "shadow.drop.53": -200,
    "shadow.strength.50": 128, "shadow.strength.51": 128, "shadow.strength.52": 128,
    "shadow.strength.53": 128, "shadow.sprite.51": 1, "shadow.strength.56": 128,
    "shadow.corkscrew.drop": 170, "shadow.corkscrew.fade": 48,
    "shadow.ball.top": 512, "shadow.ball.shift": 7, "shadow.ball.over": 412,
    "light.kind": 3, "light.near": 350, "light.far": 512, "light.full": 128, "light.full.fade": 128,
    "light.full.turned": 128, "light.scale": 0x4000, "light.bits": 23, "light.bits.high": 9,
    "light.turned.kind": 9, "light.turned.value": 1, "light.turned.near": 1280, "light.turned.far": 1792,
    "light.root": [[362, 150], [256, 106]],
}


def sw(rt, rs, imm):
    return (0x2B << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def jal(target):
    return (3 << 26) | ((target >> 2) & 0x3FFFFFF)


def beq(rs, rt, at, target):
    return (4 << 26) | (R[rs] << 21) | (R[rt] << 16) | (((target - at - 4) >> 2) & 0xFFFF)


def jr(rs):
    return (R[rs] << 21) | 8


def lui(rt, imm):
    return (0x0F << 26) | (R[rt] << 16) | (imm & 0xFFFF)


def ori(rt, rs, imm):
    return (0x0D << 26) | (R[rs] << 21) | (R[rt] << 16) | (imm & 0xFFFF)


def sra(rd, rt, sa):
    return (R[rt] << 16) | (R[rd] << 11) | (sa << 6) | 3


class Reads(unittest.TestCase):
    def test_a_divisor_is_read_back_from_its_reciprocal_and_shift(self):
        c = code(lui("a0", 0x6666), ori("a0", "a0", 0x6667), sra("v1", "a2", 4))
        self.assertEqual(c.divisor(AT, "lui $a0, {}", AT + 4, "ori $a0, $a0, {}", AT + 8, "sra $v1, $a2, {}"), 40)
        c = code(lui("a0", 0x38e3), ori("a0", "a0", 0x8e39), sra("v1", "a2", 1))
        self.assertEqual(c.divisor(AT, "lui $a0, {}", AT + 4, "ori $a0, $a0, {}", AT + 8, "sra $v1, $a2, {}"), 9)

    def test_an_immediate_is_read_from_the_instruction_it_lives_in(self):
        c = code(addiu("a0", "v1", -75))
        self.assertEqual(c.immediate(AT, "addiu $a0, $v1, {}"), -75)

    def test_another_instruction_there_stops_the_reading(self):
        c = code(addiu("a0", "v0", -75))
        with self.assertRaises(SystemExit):
            c.immediate(AT, "addiu $a0, $v1, {}")

    def test_a_multiplier_is_what_shifts_and_adds_do_to_a_register(self):
        c = code(sll("v1", "v0", 2), addu("v1", "v1", "v0"), sll("v1", "v1", 2))
        self.assertEqual(c.multiplier(AT, 3, "v0", "v1"), 20)
        c = code(sll("a0", "v1", 2), addu("a0", "a0", "v1"), sll("v1", "a0", 4),
                 subu("v1", "v1", "a0"), sll("v1", "v1", 3))
        self.assertEqual(c.multiplier(AT, 5, "v1", "v1"), 600)

    def test_a_register_the_run_never_derived_stops_the_reading(self):
        c = code(sll("v1", "v0", 2), addu("v1", "v1", "a0"), sll("v1", "v1", 1))
        with self.assertRaises(SystemExit):
            c.multiplier(AT, 3, "v0", "v1")
        c = code(sll("v1", "v0", 2), addu("v1", "v1", "zero"))
        self.assertEqual(c.multiplier(AT, 2, "v0", "v1"), 4)

    def test_a_load_in_the_run_is_fine_unless_the_product_reads_it(self):
        c = code(sll("v1", "v0", 1), addu("v1", "v1", "v0"), lh("v0", "a0", 8), sll("v1", "v1", 2))
        self.assertEqual(c.multiplier(AT, 4, "v0", "v1"), 12)
        c = code(sll("v1", "v0", 1), lh("v0", "a0", 8), addu("v1", "v1", "v0"))
        with self.assertRaises(SystemExit):
            c.multiplier(AT, 3, "v0", "v1")


class Shadow(unittest.TestCase):
    def square(self, corners):
        """An executable whose draws load these four corners."""
        lui_at, addiu_at = SHADOW_SQUARE
        at = 0x800a0040 - EXE_BASE
        blob = bytearray(at + 8 * len(corners))
        struct.pack_into("<I", blob, lui_at - EXE_BASE, lui("a0", 0x000a))
        struct.pack_into("<I", blob, addiu_at - EXE_BASE, addiu("a0", "a0", 0x40))
        for i, c in enumerate(corners):
            struct.pack_into("<4h", blob, at + 8 * i, *c)
        return Code(bytes(blob))

    def test_the_square_is_read_as_how_far_it_reaches_from_its_middle(self):
        c = self.square([(150, 0, 150, 0), (-150, 0, 150, 0), (150, 0, -150, 0), (-150, 0, -150, 0)])
        self.assertEqual(shadow_half(c), 150)

    def test_a_shape_that_is_not_a_flat_square_stops_the_reading(self):
        for corners in ([(150, 0, 150, 0), (-150, 0, 150, 0), (150, 0, -150, 0), (-150, 0, -140, 0)],
                        [(150, 0, 150, 0), (-150, 9, 150, 0), (150, 0, -150, 0), (-150, 0, -150, 0)]):
            with self.assertRaises(SystemExit):
                shadow_half(self.square(corners))


class Light(unittest.TestCase):
    def table(self, rows):
        """An executable whose light builds the address of these rows."""
        lui_at, addiu_at = LIGHT_ROOT
        at = 0x80070040 - EXE_BASE
        blob = bytearray(at + 16 * len(rows))
        struct.pack_into("<I", blob, lui_at - EXE_BASE, lui("a0", 0x0007))
        struct.pack_into("<I", blob, addiu_at - EXE_BASE, addiu("a0", "a0", 0x40))
        for i, row in enumerate(rows):
            struct.pack_into("<4I", blob, at + 16 * i, *row)
        return Code(bytes(blob))

    def chord(self):
        """The rows the game holds: a straight line between the rounded roots
        of the powers of two either side of a square."""
        out = []
        for zeros in range(ROOT_ROWS):
            low = round((1 << (31 - zeros)) ** 0.5)
            out.append((round((1 << (32 - zeros)) ** 0.5) - low, (1 << (31 - zeros)) - 1, low, 0))
        return out

    def test_a_row_is_the_root_below_a_square_and_the_step_to_the_next(self):
        rows = root_table(self.table(self.chord()))
        self.assertEqual(len(rows), ROOT_ROWS)
        self.assertEqual(rows[14], [362, 150])
        self.assertEqual(rows[13], [512, 212])

    def test_a_row_that_masks_anything_but_its_power_of_two_stops_the_reading(self):
        rows = self.chord()
        rows[5] = (rows[5][0], rows[5][1] >> 1, rows[5][2], 0)
        with self.assertRaises(SystemExit):
            root_table(self.table(rows))

    def test_the_light_ships_both_ways_round_with_the_root_it_measures_by(self):
        lit = light(GAME)
        self.assertEqual((lit["near"], lit["far"], lit["full"], lit["bits"]), (350, 512, 128, 23))
        self.assertEqual(lit["turned"], {"kind": 9, "value": 1, "near": 1280, "far": 1792})
        self.assertEqual(lit["root"], GAME["light.root"])

    def test_a_light_not_full_at_one_brightness_stops_the_reading(self):
        with self.assertRaises(SystemExit):
            light({**GAME, "light.full.turned": 255})

    def test_a_fixed_point_that_does_not_come_back_to_full_stops_the_reading(self):
        for change in ({"light.scale": 0x2000}, {"light.bits.high": 8}):
            with self.assertRaises(SystemExit):
                light({**GAME, **change})

    def test_a_light_on_another_kind_stops_the_reading(self):
        with self.assertRaises(SystemExit):
            light({**GAME, "light.kind": 2})


class Glow(unittest.TestCase):
    OWN = [2, 2, 2, 2]
    EDGE = [[-1, 0, -1, 1, [0, 2, 0, 2]], [-1, 0, 0, 0, [0, 2, 0, 2]], [0, 0, 0, 4, [0, 1, 0, 1]]]

    def maker(self, own=OWN):
        """A routine where the game's makes a light, which takes the face it is
        given at `own`, then the first of three faces for one edge that is
        there."""
        words = [addu("s0", "a0", "zero"), addu("v1", "a2", "zero")]

        def take(levels):
            for i, v in enumerate(levels):
                words.extend([addiu("t0", "zero", v), sw("t0", "sp", 16 + 4 * i)])
            words.extend([jal(GLOW_FACE), 0])
        take(own)
        ends = []
        for dx, _, dz, face, levels in self.EDGE:
            words.extend([addiu("a0", "s0", dx), addiu("a2", "v1", dz), addiu("a3", "zero", face)])
            take(levels)
            ends.append(len(words))
            words.extend([0, 0])
        end = GLOW_MAKE + 4 * len(words)
        for i in ends:
            words[i] = beq("v0", "zero", GLOW_MAKE + 4 * i, end)
        words.extend([jr("ra"), 0])
        blob = bytearray(GLOW_MAKE - EXE_BASE) + b"".join(struct.pack("<I", w) for w in words)
        return Code(bytes(blob))

    def test_a_light_tries_an_edges_faces_in_order_until_one_is_there(self):
        spill = glow_spill(self.maker())
        self.assertEqual(len(spill), 6)
        for face, groups in enumerate(spill):
            self.assertEqual(groups, [[[0, 0, 0, face, self.OWN]], self.EDGE])

    def test_a_light_not_started_from_its_own_face_at_full_stops_the_reading(self):
        with self.assertRaises(SystemExit):
            glow_spill(self.maker(own=[1, 1, 1, 1]))


def rise_at(seq):
    """Where the spikes leave the ground: the frame after the last flat one."""
    return next(i for i in range(len(seq)) if seq[i - 1] == 0 and seq[i] == 6)


def runs(seq):
    """How long each value lasts, round the cycle, starting from a change."""
    start = next(i for i in range(len(seq)) if seq[i - 1] != seq[i])
    out = []
    for v in seq[start:] + seq[:start]:
        if out and out[-1][0] == v:
            out[-1][1] += 1
        else:
            out.append([v, 1])
    return out


class Cycles(unittest.TestCase):
    def test_the_spikes_run_143_frames_from_flat_to_full_and_back(self):
        seq = spike_cycle(GAME, 0)
        self.assertEqual(len(seq), 143)
        self.assertTrue(all(0 <= f <= 31 for f in seq))
        rise = rise_at(seq)
        twice = seq + seq
        self.assertEqual(twice[rise - 1:rise + 22],
                         [0, 6, 12, 19, 25, 31, 2, 31, 6, 31, 11, 31, 15, 31, 20, 31, 25, 31, 29, 31, 31, 31, 31])
        self.assertEqual(twice[rise + 20:rise + 34], [31] * 14)
        self.assertEqual(twice[rise + 34:rise + 79], [c * 32 // 44 for c in range(43, -1, -1)] + [0])
        self.assertEqual(runs([f == 0 for f in seq]), [[False, 76], [True, 67]])

    def test_the_spikes_phases_are_35_frames_apart_from_the_second_cycle(self):
        starts = [rise_at(spike_cycle(GAME, p)) for p in range(PHASES)]
        self.assertEqual([(starts[0] - s) % 143 for s in starts], [0, 35, 72, 107])

    def test_the_vanishing_block_runs_224_frames_through_its_six_states(self):
        seq = vanish_cycle(GAME, 0)
        self.assertEqual(len(seq), 224)
        self.assertEqual(sorted(runs([s for s, _ in seq])),
                         [[0, 91], [1, 9], [2, 5], [3, 91], [4, 9], [5, 19]])
        self.assertTrue(all(0 <= v <= 255 for _, v in seq))
        self.assertTrue(all(v == 128 for s, v in seq if s == 3))
        self.assertEqual(max(v for s, v in seq if s == 1), 226)

    def test_the_vanishing_block_phases_are_a_quarter_cycle_apart(self):
        appear = [[s for s, _ in vanish_cycle(GAME, p)].index(1) for p in range(PHASES)]
        self.assertEqual([(appear[0] - a) % 224 for a in appear], [0, 56, 112, 168])


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


class Table(unittest.TestCase):
    def test_the_table_carries_a_program_per_phase_and_the_platform_scaled(self):
        r = dict(GAME)
        for key in ("coin.turn", "coin.bob", "coin.bob.reach", "fruit.turn", "fruit.tilt",
                    "fruit.tilt.reach", "fruit.bob", "fruit.bob.reach", "gem.turn",
                    "hourglass.swing", "hourglass.turn", "hourglass.lean", "pill.flip",
                    "pill.turn", "star42.form", "star42.form.past", "star42.orbit.brown",
                    "star42.orbit.green", "star42.orbit.radius", "teleporter.turn",
                    "exit.turn", "exit.turn.open", "platform.dwell", "corkscrew.phase0",
                    "corkscrew.phase1", "corkscrew.phase2", "corkscrew.bounce",
                    "corkscrew.wrap", "corkscrew.rise", "corkscrew.spin", "star52.sway",
                    "star52.sway.reach", "star52.tumble.x", "star52.tumble.y",
                    "star50.tumble.x", "star50.tumble.y", "star50.tumble.z", "star50.travel",
                    "ball53.shake", "ball53.lurch.reach", "ball53.dash", "ball53.settle",
                    "ball53.ways", "wheel.roll",
                    "wheel.travel", "wheel.turning", "wheel.turn.right", "wheel.turn.about",
                    "corkscrew.drop", "ball.breathe", "ball.breathe.reach",
                    "button.start", "button.full", "button.sink", "button.rise", "button.reach",
                    "ball.breathe.full", "ball.breathe.over", "time.tick"):
            r.setdefault(key, 1)
        r["platform.scale"] = 50
        r["captivator.standoff"] = 456
        r["corkscrew.drop"] = 150
        r.update({"dice.seed": 1, "dice.times": 0x41C64E6D, "dice.plus": 12345})
        r["glow"] = {"every": 19, "part": [1792, 4096], "spill": []}
        r["glow.colours"] = {5: [[[25, 25, 0]] * 4], 7: [[[16, 64, 16]]], 9: [[[25, 25, 0]] * 4]}
        t = table(r, 30)
        self.assertEqual(t["hz"], 60)
        self.assertEqual(t["kinds"]["5"], {"speed": 25, "dwell": 1})
        self.assertEqual(t["kinds"]["3"]["light"]["far"], 512)
        self.assertEqual(t["glow"]["colours"]["9"], [[[25, 25, 0]] * 4])
        self.assertEqual(t["glow"]["every"], 19)
        self.assertNotIn("glow", t["types"]["5"])
        self.assertEqual(t["kinds"]["8"]["levels"], GAME["laser.levels"])
        self.assertEqual([len(c) for c in t["types"]["11"]["cycle"]], [143] * PHASES)
        self.assertEqual([len(c) for c in t["kinds"]["7"]["cycle"]], [224] * PHASES)
        self.assertEqual([len(c) for c in t["kinds"]["7"]["level"]], [224] * PHASES)
        self.assertEqual(t["types"]["56"]["phases"], [1, 1, 1, 0])
        for k in ("50", "51", "52", "53"):
            self.assertEqual(t["types"][k]["entry"], {"stand": 200})
        self.assertEqual(t["types"]["56"]["entry"], {"stand": 50})
        self.assertNotIn("entry", t["types"]["37"])
        self.assertEqual(t["dice"], {"seed": 1, "times": 1103515245, "plus": 12345})
        self.assertEqual(set(t["types"]["10"]["press"]), {"start", "full", "sink", "rise", "reach"})
        self.assertEqual(t["shadow"], {"half": 150})
        for k in ("50", "52", "53"):
            self.assertEqual(t["types"][k]["shadow"], {"sprite": 0, "off": 0, "strength": 128})
        self.assertEqual(t["types"]["51"]["shadow"],
                         {"sprite": 1, "off": 0, "strength": 128, "turns": True})
        self.assertEqual(t["types"]["56"]["shadow"],
                         {"sprite": 0, "off": 30, "strength": 128, "fade": 48})
        self.assertEqual(t["types"]["30"]["shadow"],
                         {"sprite": 0, "off": 0, "strength": 128, "top": 512, "over": 412,
                          "squash": True})
        self.assertEqual({k for k, v in t["types"].items() if "shadow" in v},
                         {"30", "50", "51", "52", "53", "56"})
        with self.assertRaises(SystemExit):
            table({**r, "shadow.sprite.51": 2}, 30)
        self.assertEqual(set(t["types"]), {str(k) for k in
                                           (5, 7, 10, 11, 26, 30, 31, 32, 33, 34, 35, 36, 37, 38, 42,
                                            43, 44, 45, 46, 47, 50, 51, 52, 53, 56)})


if __name__ == "__main__":
    unittest.main()
