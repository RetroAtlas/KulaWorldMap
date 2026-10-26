"""Unit tests for the motion reader: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_disc import EXE_BASE  # noqa: E402
from kula_motion import CHECKS, DIVISORS, GREYS, IMMEDIATES, MULTIPLIERS, SCANS, table  # noqa: E402
from kula_motion_blocks import blocks  # noqa: E402
from kula_motion_code import PHASES  # noqa: E402
from kula_motion_effects import effects  # noqa: E402
from kula_motion_harms import harms  # noqa: E402
from kula_motion_light import glint  # noqa: E402
from kula_motion_run import play  # noqa: E402
from kula_motion_things import SPUN_AT  # noqa: E402
from motion_fixture import (AT, GAME, addiu, addu, beq, code, jal, jr, lh, lui, lw, ori, sb, sh, sll, sra,  # noqa: E402
                            subu, sw, swl, swr, xori)


class Reads(unittest.TestCase):
    def test_a_divisor_is_read_back_from_its_reciprocal_and_shift(self):
        c = code(lui("a0", 0x6666), ori("a0", "a0", 0x6667), sra("v1", "a2", 4))
        self.assertEqual(c.divisor(AT, "lui $a0, {}", AT + 4, "ori $a0, $a0, {}", AT + 8, "sra $v1, $a2, {}"), 40)
        c = code(lui("a0", 0x38e3), ori("a0", "a0", 0x8e39), sra("v1", "a2", 1))
        self.assertEqual(c.divisor(AT, "lui $a0, {}", AT + 4, "ori $a0, $a0, {}", AT + 8, "sra $v1, $a2, {}"), 9)

    def test_a_word_is_its_lui_and_ori_halves_whatever_the_low_halfs_top_bit(self):
        c = code(lui("v1", 0x41c6), ori("v1", "v1", 0x4e6d), lui("a0", 0x38e3), ori("a0", "a0", 0x8e39))
        self.assertEqual(c.word_of(AT, "lui $v1, {}", AT + 4, "ori $v1, $v1, {}"), 0x41c64e6d)
        self.assertEqual(c.word_of(AT + 8, "lui $a0, {}", AT + 12, "ori $a0, $a0, {}"), 0x38e38e39)

    def test_a_grey_is_the_one_level_of_a_colour_word_in_two_halves(self):
        c = code(lui("v1", 0x0080), ori("v1", "v1", 0x8080), lui("v1", 0x00ff), ori("v1", "v1", 0xff00))
        self.assertEqual(c.grey(AT, "lui $v1, {}", AT + 4, "ori $v1, $v1, {}"), 128)
        with self.assertRaises(SystemExit):
            c.grey(AT + 8, "lui $v1, {}", AT + 12, "ori $v1, $v1, {}")

    def test_an_immediate_is_read_from_the_instruction_it_lives_in(self):
        c = code(addiu("a0", "v1", -75))
        self.assertEqual(c.immediate(AT, "addiu $a0, $v1, {}"), -75)

    def test_an_offset_from_gp_is_an_immediate_too(self):
        c = code(lw("v0", "gp", 9372))
        self.assertEqual(c.immediate(AT, "lw $v0, {}($gp)"), 9372)

    def test_a_logic_immediate_is_read_unsigned_as_the_processor_takes_it(self):
        c = code(xori("v0", "v0", 2), xori("v0", "v0", 0x8000))
        self.assertEqual(c.immediate(AT, "xori $v0, $v0, {}"), 2)
        self.assertEqual(c.immediate(AT + 4, "xori $v0, $v0, {}"), 32768)

    def test_another_instruction_there_stops_the_reading(self):
        c = code(addiu("a0", "v0", -75))
        with self.assertRaises(SystemExit):
            c.immediate(AT, "addiu $a0, $v1, {}")

    def test_the_words_stand_at_the_base_the_code_is_built_at(self):
        shift = 0x400
        c = code(sw("v0", "gp", 1296), addiu("a0", "v1", -75), base=EXE_BASE + shift)
        self.assertEqual(c.immediate(AT + shift + 4, "addiu $a0, $v1, {}"), -75)
        with self.assertRaises(SystemExit):
            c.immediate(AT + 4, "addiu $a0, $v1, {}")
        self.assertEqual(c.stores_to(0x800a3448), [(AT + shift, 2)])
        self.assertEqual([c.holds(a) for a in (EXE_BASE + shift, EXE_BASE + shift - 4)], [True, False])

    def test_a_multiplier_is_what_shifts_and_adds_do_to_a_register(self):
        c = code(sll("v1", "v0", 2), addu("v1", "v1", "v0"), sll("v1", "v1", 2))
        self.assertEqual(c.multiplier(AT, 3, "v0", "v1"), 20)
        c = code(sll("a0", "v1", 2), addu("a0", "a0", "v1"), sll("v1", "a0", 4),
                 subu("v1", "v1", "a0"), sll("v1", "v1", 3))
        self.assertEqual(c.multiplier(AT, 5, "v1", "v1"), 600)

    def test_a_shift_alone_is_a_multiplier_too(self):
        c = code(sll("v0", "a0", 6))
        self.assertEqual(c.multiplier(AT, 1, "a0", "v0"), 64)

    def test_a_store_scan_finds_stores_through_gp_and_through_at_after_a_lui(self):
        c = code(sw("v0", "gp", 1296), lui("at", 0x000a), sw("zero", "at", 13384), lui("at", 0x000a),
                 sh("a0", "at", 13384), sw("v1", "gp", 1300), sw("zero", "at", 13384), lw("v0", "gp", 1296))
        self.assertEqual(c.stores_to(0x800a3448), [(AT, 2), (AT + 8, 0), (AT + 16, 4)])
        self.assertEqual(c.stores_to(0x800a344c), [(AT + 20, 3)])

    def test_a_stretch_is_scanned_for_its_stores_through_the_record_a_copy_a_pointer_gp_sp_or_a_lui(self):
        c = code(sh("v0", "s0", 492), lui("at", 0x000c), sh("v0", "at", -24088), sw("v1", "gp", 7464),
                 addu("a2", "s0", "zero"), jal(0x80038178), sh("v0", "s0", 494), addu("a0", "s0", "zero"),
                 sw("zero", "a0", 96), addiu("a1", "s0", 60), sh("v1", "a1", 8), swl("v0", "s0", 563),
                 swr("v0", "s0", 692), beq("v0", "zero", AT + 52, AT + 64), sh("v0", "s0", 562),
                 sw("ra", "sp", 28), jr("ra"), 0)
        self.assertEqual(c.resolved(AT, AT + 68, "s0", (564, 688), ((AT + 20, 0x80038178, {"a2": 0}),)), 10)

    def test_a_store_a_pointer_a_call_a_loop_or_a_jump_the_scan_cannot_clear_stops_the_reading(self):
        span = (564, 688)
        for stretch in ((sw("v0", "s0", 564),), (sh("v0", "s0", 690),), (sb("v0", "s0", 691),), (swl("v0", "s0", 567),),
                        (addu("a0", "s0", "zero"), sw("v0", "a0", 600)), (addiu("a1", "s0", 596),),
                        (addiu("a1", "s0", 560), sw("v0", "a1", 4)), (lui("at", 0x000c), sh("v0", "at", -23736)),
                        (lw("a1", "gp", 7472), sw("v0", "a1", 0)), (jal(0x80037430), addu("a0", "s0", "zero")),
                        (beq("v0", "zero", AT, AT), 0), (jr("t0"), 0)):
            with self.assertRaises(SystemExit):
                code(*stretch).resolved(AT, AT + 4 * (len(stretch) - 1), "s0", span)
        c = code(jal(0x80037430), addu("a0", "s0", "zero"))
        for calls in (((AT, 0x80037430, {"a1": 0}),), ((AT, 0x80038178, {"a0": 0}),)):
            with self.assertRaises(SystemExit):
                c.resolved(AT, AT + 4, "s0", span, calls)
        with self.assertRaises(SystemExit):
            code(sh("v0", "s0", 492)).resolved(AT, AT, "s0", span, ((AT + 8, 0x80037430, {"a0": 0}),))
        c = code(addu("a0", "s0", "zero"), jal(0x80038178), 0, sw("v0", "a0", 96))
        with self.assertRaises(SystemExit):
            c.resolved(AT, AT + 12, "s0", span, ((AT + 4, 0x80038178, {"a0": 0}),))

    def test_an_address_is_its_lui_and_addiu_in_rams_mirror(self):
        c = code(lui("gp", 0x000a), addiu("gp", "gp", 12088), lui("v0", 0x000a), lw("v0", "v0", 13260))
        self.assertEqual(c.address(AT, AT + 4), 0x800a2f38)
        self.assertEqual(c.address(AT + 8, AT + 12), 0x800a33cc)
        with self.assertRaises(SystemExit):
            c.address(AT + 4, AT + 8)

    def test_a_register_the_run_never_derived_stops_the_reading(self):
        c = code(sll("v1", "v0", 2), addu("v1", "v1", "a0"), sll("v1", "v1", 1))
        with self.assertRaises(SystemExit):
            c.multiplier(AT, 3, "v0", "v1")
        c = code(sll("v1", "v0", 2), addu("v1", "v1", "zero"))
        self.assertEqual(c.multiplier(AT, 2, "v0", "v1"), 4)

    def test_an_instruction_reading_its_first_register_overwrites_nothing_in_the_run(self):
        c = code(sw("zero", "a0", 0), sll("v1", "v0", 2), addu("v1", "v1", "zero"))
        self.assertEqual(c.multiplier(AT, 3, "v0", "v1"), 4)
        c = code(sll("v1", "v0", 2), sw("v1", "a0", 0), addu("v1", "v1", "v0"))
        self.assertEqual(c.multiplier(AT, 3, "v0", "v1"), 5)
        c = code(sll("v1", "v0", 2), beq("v1", "zero", AT + 4, AT + 12), addu("v1", "v1", "v0"))
        self.assertEqual(c.multiplier(AT, 3, "v0", "v1"), 5)

    def test_a_load_in_the_run_is_fine_unless_the_product_reads_it(self):
        c = code(sll("v1", "v0", 1), addu("v1", "v1", "v0"), lh("v0", "a0", 8), sll("v1", "v1", 2))
        self.assertEqual(c.multiplier(AT, 4, "v0", "v1"), 12)
        c = code(sll("v1", "v0", 1), lh("v0", "a0", 8), addu("v1", "v1", "v0"))
        with self.assertRaises(SystemExit):
            c.multiplier(AT, 3, "v0", "v1")


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
        r.update({"ball.light.down": 2, "ball.light.into": 1, "ball.light.background": 2048,
                  "ball.light.colour": 4000, "ball.light.base": 178})
        r["platform.scale"] = 50
        r["captivator.standoff"] = 456
        r["corkscrew.drop"] = 150
        r.update({"dice.seed": 1, "dice.times": 0x41C64E6D, "dice.plus": 12345})
        r["glow"] = {"every": 19, "part": [1792, 4096], "spill": []}
        r["glow.colours"] = {5: [[[25, 25, 0]] * 4], 7: [[[16, 64, 16]]], 9: [[[25, 25, 0]] * 4]}
        last = (31, 32, 33, 34, 35, 37, 38, 42, 43, 44, 45, 46, 47, 51, 56)
        r["spin.order"] = {t: "zyx" if t in last else "xyz" for t in SPUN_AT}
        r["spin.quarter"] = 1024
        t = table(r, 30)
        self.assertEqual(t["hz"], 60)
        self.assertEqual(t["kinds"]["5"], {"speed": 25, "dwell": 1,
                                           "ride": {"bias": 512, "rumble": 70,
                                                    "body": {"off": 100, "ends": 256}, "end": {"tolerance": 100}},
                                           "standing": 95})
        self.assertEqual(t["kinds"]["3"]["light"]["far"], 512)
        self.assertEqual(t["glow"]["colours"]["9"], [[[25, 25, 0]] * 4])
        self.assertEqual(t["glow"]["every"], 19)
        self.assertNotIn("glow", t["types"]["5"])
        self.assertEqual(t["kinds"]["8"]["levels"], GAME["laser.levels"])
        self.assertEqual([len(c) for c in t["types"]["11"]["cycle"]], [143] * PHASES)
        self.assertEqual([len(c) for c in t["kinds"]["7"]["cycle"]], [224] * PHASES)
        self.assertEqual([len(c) for c in t["kinds"]["7"]["level"]], [224] * PHASES)
        self.assertEqual(t["types"]["56"]["phases"], [1, 1, 1, 0])
        self.assertEqual(t["types"]["56"]["bounce"]["spin"], -r["corkscrew.spin"])
        for k in ("50", "51", "52", "53"):
            self.assertEqual(t["types"][k]["entry"], {"stand": 200})
        self.assertEqual(t["types"]["56"]["entry"], {"stand": 50})
        self.assertNotIn("entry", t["types"]["37"])
        self.assertEqual(t["dice"], {"seed": 1, "times": 1103515245, "plus": 12345})
        self.assertEqual(t["types"]["36"]["glint"], glint(GAME))
        self.assertEqual(t["types"]["30"]["light"],
                         {"view": [-1, -4, -2], "background": 2048, "colour": 4000, "base": 178})
        self.assertEqual(t["types"]["30"]["rolling"]["top"], 33)
        self.assertEqual(t["types"]["30"]["wrap"], {"frames": 13, "step": 78, "arc": [[38, 8], [32, 22], [22, 32], [8, 39]],
                                                 "body": -256})
        self.assertEqual(t["types"]["30"]["fall"]["short"], 180)
        self.assertEqual(t["types"]["30"]["fall"]["hold"], [411, 102])
        self.assertEqual(t["types"]["30"]["spin"], -5)
        self.assertEqual(t["types"]["30"]["jump"]["far"], 1536)
        self.assertEqual(set(t["types"]["30"]), {"breathe", "light", "shadow", "before", "rolling", "quarter", "wrap", "climb",
                                                 "fall", "spin", "squash", "look", "jump", "dying", "tint"})
        self.assertEqual(t["types"]["43"]["order"], "zyx")
        self.assertEqual(t["types"]["7"]["order"], "xyz")
        self.assertEqual(t["types"]["51"]["order"], "zyx")
        self.assertEqual([t["types"][k].get("axes") for k in ("50", "51", "52", "53")],
                         ["world", None, "world", "world"])
        self.assertEqual(t["types"]["51"]["before"], [0, 0, 1024])
        self.assertEqual(t["types"]["30"]["before"], [2048, 0, 0])
        self.assertNotIn("before", t["types"]["37"])
        self.assertNotIn("glint", t["types"]["37"])
        with self.assertRaises(SystemExit):
            table({**r, "glint.model": 39}, 30)
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
                                           (5, 7, 9, 10, 11, 26, 30, 31, 32, 33, 34, 35, 36, 37, 38, 42,
                                            43, 44, 45, 46, 47, 50, 51, 52, 53, 56)})
        self.assertEqual(t["types"]["31"]["take"], {"reach": 150, "stand": 386, "points": 1000})
        self.assertEqual(t["types"]["37"]["take"]["points"], [750, 500, 250])
        self.assertEqual([t["types"][k]["lasts"]["word"] for k in ("32", "33", "34", "38")], [360, 840, 840, 840])
        self.assertEqual(t["types"]["32"]["lasts"]["ticks"], 4)
        self.assertEqual(t["types"]["32"]["lasts"]["blanks"], 2)
        self.assertEqual(t["types"]["32"]["lasts"]["rock"], {"scale": 64, "shift": 5})
        self.assertEqual(t["types"]["34"]["lasts"]["glow"], {"step": 100, "round": 8192, "gain": 3, "from": [0, 2048, 4096]})
        self.assertEqual(set(t["types"]["32"]["lasts"]["screen"]),
                         {"grey", "tint", "magnitude", "wane", "step", "phase", "fade"})
        self.assertEqual(t["play"]["screen"]["scale"], {"across": 4096, "down": 3840})
        self.assertNotIn("lasts", t["types"]["33"].get("take", {}))
        self.assertEqual(t["types"]["33"]["turn"], t["types"]["34"]["turn"])
        self.assertEqual(t["types"]["7"]["opened"], {"f3": 0, "f4": 1})
        self.assertEqual(t["types"]["26"]["shut"], {"f4": 0})
        self.assertEqual(t["types"]["5"]["send"]["band"], [167, 345])
        self.assertEqual(t["types"]["9"], {"throw": {"band": [197, 315], "rearm": [156, 356]}})
        self.assertEqual(t["kinds"]["6"], {"points": 50, "size": 512, "shrink": 26,
                                           "edge": {"hold": 301, "back": 401, "push": 40}, "standing": 96})
        self.assertEqual(t["kinds"]["2"], {**blocks(GAME)[2], "standing": 2})
        self.assertEqual({k: v.get("standing") for k, v in t["kinds"].items()},
                         {"1": 1, "2": 2, "3": 93, "4": 4, "5": 95, "6": 96, "7": 97, "8": None})
        self.assertEqual(t["play"]["clock"]["second"], 50)
        self.assertEqual(t["play"]["ending"]["lost"], -3)
        self.assertEqual(t["play"]["view"]["hidden"], {"off": 400})
        self.assertEqual(set(t["play"]),
                         {"start", "clock", "ending", "wait", "words", "bonus", "points", "view", "flight", "screen",
                          "next", "simon"})
        self.assertEqual(t["play"]["simon"]["store"], 1024)
        self.assertEqual(t["effects"], effects(GAME))
        self.assertEqual(t["effects"]["size"], {"hud": 64, "world": 16})
        self.assertEqual(t["effects"]["kinds"]["7"], "2")
        self.assertEqual(t["play"], play(GAME))
        self.assertEqual(t["kinds"]["1"], {**harms(GAME)["kinds"][1], "standing": 1})
        self.assertEqual(t["kinds"]["4"], {**harms(GAME)["kinds"][4], "standing": 4})
        self.assertEqual(t["kinds"]["8"]["harm"], {"cell": -2, "heat": 1900})
        self.assertEqual(t["kinds"]["8"]["reach"], 256)
        self.assertEqual(t["types"]["53"]["catch"], {"square": 16199})
        self.assertEqual(t["types"]["56"]["catch"], {"square": 44999, "stand": 200})
        self.assertEqual(t["types"]["11"]["harm"], {"flag": 1, "standing": 9})
        self.assertEqual(set(t["types"]["11"]), {"cycle", "deadly", "harm"})
        self.assertEqual([len(d) for d in t["types"]["11"]["deadly"]], [143] * PHASES)
        self.assertEqual([sum(d) for d in t["types"]["11"]["deadly"]], [68] * PHASES)
        self.assertEqual(set(t["kinds"]), {"1", "2", "3", "4", "5", "6", "7", "8"})


class Lists(unittest.TestCase):
    BY_HAND = {"button.reach", "flight.third", "next.round", "next.mode.load", "next.mode.clears", "next.mode.writes",
               "simon.store", "simon.fill.from", "dice.times", "glint.times", "glint.seed", "glint.at", "glint.frame.at",
               "gp", "mode.word", "game.mode.word", "glow.counter.load", "glow.clear", "laser.levels", "shadow.half",
               "light.root", "glow", "glow.colours", "spin.order", "spin.quarter", "words", "effect.pointers",
               "effect.colours", "effect.tables", "effect.sine.at", "effect.sine.one", "effect.hud.at", "effect.table.at",
               *(f"screen.load.{name}" for name in ("wide", "high", "distance", "across", "down"))}

    def test_the_six_lists_hold_their_counts_and_every_check_is_an_address_an_instruction_and_a_sentence(self):
        self.assertEqual([len(t) for t in (CHECKS, IMMEDIATES, MULTIPLIERS, DIVISORS, GREYS, SCANS)], [2241, 750, 67, 12, 7, 2])
        self.assertEqual({tuple(type(x) for x in check) for check in CHECKS}, {(int, str, str)})

    def test_every_key_is_read_once_and_none_of_them_is_set_by_hand(self):
        keys = [entry[1] for t in (IMMEDIATES, MULTIPLIERS, DIVISORS, GREYS, SCANS) for entry in t]
        self.assertEqual(sorted(set(keys) - self.BY_HAND), sorted(keys))


if __name__ == "__main__":
    unittest.main()
