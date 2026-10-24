"""Unit tests for the lights, the shadows, the glints and the cycles: python3 -m unittest discover -s tools/tests"""

import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_disc import EXE_BASE  # noqa: E402
from kula_motion_code import PHASES, Code  # noqa: E402
from kula_motion_light import (GLOW_DOUBLE, GLOW_FACE, GLOW_LIFT, GLOW_MAKE, LIGHT_ROOT, ROOT_ROWS,  # noqa: E402
                               SHADOW_SQUARE, glint, glow_lift, glow_spill, light, root_table, shadow_half, spike_cycle,
                               vanish_cycle)
from motion_fixture import GAME, R, addiu, addu, beq, jal, jr, lui, rise_at, runs, sll, sra, sw  # noqa: E402


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
        """A routine where the game's routine makes a light, which takes the face it is
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


class Glint(unittest.TestCase):
    def test_the_glint_ships_its_steps_its_slots_and_a_generator_of_its_own(self):
        g = glint(GAME)
        self.assertEqual((g["chance"], g["rise"], g["top"], g["fall"], g["slots"]), (3, 128, 254, 16, 16))
        self.assertEqual((g["rows"], g["cuts"]), (3, 3))
        self.assertEqual(g["dice"], {"seed": 1, "times": 1103515245, "plus": 12345})

    def test_a_frame_that_runs_the_glint_over_other_records_stops_the_reading(self):
        for change in ({"glint.frame.at": 0x800DE038}, {"glint.frame.rows": 2}, {"glint.frame.record": 344}):
            with self.assertRaises(SystemExit):
                glint({**GAME, **change})

    def test_a_record_that_does_not_hold_its_slots_or_a_row_its_records_stops_the_reading(self):
        for change in ({"glint.slots": 15}, {"glint.row": 1040, "glint.frame.row": 1040}):
            with self.assertRaises(SystemExit):
                glint({**GAME, **change})

    def test_a_glint_that_steps_more_than_a_flat_polygons_first_corner_stops_the_reading(self):
        with self.assertRaises(SystemExit):
            glint({**GAME, "glint.flat": 12})


class Lift(unittest.TestCase):
    TELEPORTER = [[6144, 6144, 5120], [5120, 5120, 6144], [5120, 6144, 5120], [6144, 5120, 5120]]

    def code(self, up=13, down=12):
        """An executable whose lit devices lift their light as the game's devices do."""
        table = 0x800a3308
        blob = bytearray(table - EXE_BASE + 48)
        put = lambda at, w: struct.pack_into("<I", blob, at - EXE_BASE, w)
        for i, w in enumerate((sll("v0", "a1", 1), addu("v0", "v0", "a1"), sll("v0", "v0", 2))):
            put(0x8002d4a4 + 4 * i, w)
        lui_at, lw_at = GLOW_LIFT
        put(lui_at, lui("at", 0x000a))
        put(lw_at, (0x23 << 26) | (R["at"] << 21) | (R["v1"] << 16) | 0x3308)
        for c, triple in enumerate(self.TELEPORTER):
            struct.pack_into("<3I", blob, table - EXE_BASE + 12 * c, *triple)
        for left, right in GLOW_DOUBLE.values():
            put(left, sll("v0", "s5", up))
            put(right, sra("s5", "v0", down))
        return Code(bytes(blob))

    def test_a_lit_teleporter_takes_its_circuits_triple_and_an_exit_or_a_switch_twice_its_light(self):
        lift = glow_lift(self.code())
        self.assertEqual(lift["5"], self.TELEPORTER)
        self.assertEqual(lift["7"], [[8192] * 3])
        self.assertEqual(lift["9"], [[8192] * 3])

    def test_the_shifts_say_how_many_times_over(self):
        self.assertEqual(glow_lift(self.code(up=14))["9"], [[16384] * 3])


class Cycles(unittest.TestCase):
    def test_the_spikes_run_143_frames_from_flat_to_full_and_back(self):
        seq = [f for f, _ in spike_cycle(GAME, 0)]
        self.assertEqual(len(seq), 143)
        self.assertTrue(all(0 <= f <= 31 for f in seq))
        rise = rise_at(seq)
        twice = seq + seq
        self.assertEqual(twice[rise - 1:rise + 22],
                         [0, 6, 12, 19, 25, 31, 2, 31, 6, 31, 11, 31, 15, 31, 20, 31, 25, 31, 29, 31, 31, 31, 31])
        self.assertEqual(twice[rise + 20:rise + 34], [31] * 14)
        self.assertEqual(twice[rise + 34:rise + 79],
                         [31, 30, 29, 29, 28, 27, 26, 26, 25, 24, 24, 23, 22, 21, 21, 20, 19, 18, 18, 17, 16, 16,
                          15, 14, 13, 13, 12, 11, 10, 10, 9, 8, 8, 7, 6, 5, 5, 4, 3, 2, 2, 1, 0, 0, 0])
        self.assertEqual(runs([f == 0 for f in seq]), [[False, 76], [True, 67]])

    def test_the_spikes_phases_are_35_frames_apart_from_the_second_cycle(self):
        starts = [rise_at([f for f, _ in spike_cycle(GAME, p)]) for p in range(PHASES)]
        self.assertEqual([(starts[0] - s) % 143 for s in starts], [0, 35, 72, 107])

    def test_the_spikes_are_deadly_from_two_frames_before_they_rise_until_11_of_the_retraction_remain(self):
        for p in range(PHASES):
            frames, deadly = map(list, zip(*spike_cycle(GAME, p)))
            rise = 143 + rise_at(frames)
            self.assertEqual((deadly * 3)[rise - 3:rise + 141], [False] + [True] * 68 + [False] * 75)
            self.assertEqual((frames * 3)[rise + 65:rise + 67], [8, 8])
        self.assertEqual([spike_cycle(GAME, p)[0][1] for p in range(PHASES)], [False, False, True, True])

    def test_a_flag_that_is_not_the_hazards_value_as_the_spikes_rise_stops_the_reading(self):
        for change in ({"spikes.rise.flag": 2}, {"spikes.retract.flag": 1}, {"spikes.phase.down.flag": 1},
                       {"spikes.phase.up.flag": 2}):
            with self.assertRaises(SystemExit):
                spike_cycle({**GAME, **change}, 0)

    def test_the_vanishing_block_runs_224_frames_through_its_six_states(self):
        seq = vanish_cycle(GAME, 0)
        self.assertEqual(len(seq), 224)
        self.assertEqual(sorted(runs([s for s, _ in seq])),
                         [[0, 91], [1, 9], [2, 5], [3, 91], [4, 9], [5, 19]])
        self.assertTrue(all(0 <= v <= 255 for _, v in seq))
        self.assertTrue(all(v == 128 for s, v in seq if s == 3))
        self.assertEqual([v for s, v in seq if s == 1], [0, 28, 56, 85, 113, 141, 170, 198, 226])
        self.assertEqual([v for s, v in seq if s == 2], [255, 211, 166, 121, 76])
        self.assertEqual([v for s, v in seq if s == 4], [32, 57, 82, 107, 132, 157, 182, 207, 232])
        self.assertEqual([v for s, v in seq if s == 5][:3] + [v for s, v in seq if s == 5][-2:],
                         [255, 241, 228, 26, 13])

    def test_a_vanishing_ramp_that_does_not_run_over_its_state_stops_the_reading(self):
        for change in ({"vanish.dim.by": 8}, {"vanish.in.over": 8}):
            with self.assertRaises(SystemExit):
                vanish_cycle({**GAME, **change}, 0)

    def test_the_vanishing_block_phases_are_a_quarter_cycle_apart(self):
        appear = [[s for s, _ in vanish_cycle(GAME, p)].index(1) for p in range(PHASES)]
        self.assertEqual([(appear[0] - a) % 224 for a in appear], [0, 56, 112, 168])


if __name__ == "__main__":
    unittest.main()
