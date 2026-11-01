"""Unit tests for the motion reader: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_disc import EXE_BASE, RELEASES  # noqa: E402
from kula_motion import CHECKS, DIVISORS, GREYS, IMMEDIATES, MULTIPLIERS, SCANS, table  # noqa: E402
from kula_motion_blocks import blocks  # noqa: E402
from kula_motion_code import PHASES, Code, Map, Readings  # noqa: E402
from kula_motion_effects import effects  # noqa: E402
from kula_motion_harms import harms  # noqa: E402
from kula_motion_light import GLOW_CASES, glint  # noqa: E402
from kula_motion_run import NEXT_MODE, play  # noqa: E402
from kula_motion_things import QUARTER, SPUN_AT  # noqa: E402
from kula_skins import CHECKS as SKIN_CHECKS, IMMEDIATES as SKIN_IMMEDIATES  # noqa: E402
from motion_fixture import (AT, GAME, addiu, addu, beq, code, j, jal, jr, lh, lui, lw, ori, sb, sh, sll, sllv,  # noqa: E402
                            sra, subu, sw, swl, swr, xori)


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

    def test_a_code_is_built_at_the_base_the_gp_and_the_record_of_its_release(self):
        for release, entry in RELEASES.items():
            c = Code.of(release, bytes(0x800))
            self.assertEqual((c.base, c.gp, c.record), (entry["base"], entry["gp"], entry["record"]))
        c = code()
        self.assertEqual((c.base, c.gp, c.record), tuple(RELEASES["us"][k] for k in ("base", "gp", "record")))

    def test_a_store_through_gp_is_found_under_the_gp_the_code_is_given_and_missed_under_the_us_one(self):
        c = code(sw("v0", "gp", 1296), gp=0x800a29e0)
        self.assertEqual(c.stores_to(0x800a29e0 + 1296), [(AT, 2)])
        self.assertEqual(c.stores_to(0x800a3448), [])

    def test_a_stretch_is_scanned_against_the_span_of_the_record_the_code_is_given(self):
        span, record = (564, 688), 0x800b9bbc
        into = (lui("at", 0x000c), sh("v0", "at", -25104))      # 0x800b9df0, 564 past that record
        self.assertEqual(code(*into).resolved(AT, AT + 4, "s0", span), 1)
        with self.assertRaises(SystemExit):
            code(*into, record=record).resolved(AT, AT + 4, "s0", span)
        c = code(lui("at", 0x000c), sh("v0", "at", -23736), record=record)
        self.assertEqual(c.resolved(AT, AT + 4, "s0", span), 1)

    def test_a_multiplier_is_what_shifts_and_adds_do_to_a_register(self):
        c = code(sll("v1", "v0", 2), addu("v1", "v1", "v0"), sll("v1", "v1", 2))
        self.assertEqual(c.multiplier(AT, 3, "v0", "v1"), 20)
        c = code(sll("a0", "v1", 2), addu("a0", "a0", "v1"), sll("v1", "a0", 4),
                 subu("v1", "v1", "a0"), sll("v1", "v1", 3))
        self.assertEqual(c.multiplier(AT, 5, "v1", "v1"), 600)

    def test_a_shift_alone_is_a_multiplier_too(self):
        c = code(sll("v0", "a0", 6))
        self.assertEqual(c.multiplier(AT, 1, "a0", "v0"), 64)

    def test_a_shift_by_a_register_takes_the_constant_set_before_the_run(self):
        c = code(addiu("a2", "zero", 2), beq("v0", "a2", AT + 4, AT + 36), lh("v1", "s0", 12), sll("v0", "v1", 1),
                 addu("v0", "v0", "v1"), sllv("v0", "v0", "a2"), subu("v0", "v0", "v1"), sll("v0", "v0", 1))
        self.assertEqual(c.multiplier(AT + 12, 5, "v1", "v0"), 22)
        c = code(addiu("v0", "zero", 1), lh("a1", "s0", 6), sllv("v1", "a1", "v0"), addu("v1", "v1", "a1"), sll("v0", "v1", 2))
        self.assertEqual(c.multiplier(AT + 8, 3, "a1", "v0"), 12)
        c = code(lw("a2", "s0", 8), sllv("v0", "v1", "a2"))
        with self.assertRaises(SystemExit):
            c.multiplier(AT + 4, 1, "v1", "v0")
        c = code(sllv("v0", "v1", "a2"))
        with self.assertRaises(SystemExit):
            c.multiplier(AT, 1, "v1", "v0")

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

    def test_an_address_is_built_through_the_adds_between_its_lui_and_its_use(self):
        c = code(lui("v0", 0x0007), addiu("v1", "v0", 24200), sll("a1", "a0", 2), addu("v0", "a1", "v1"), lw("v0", "v0", 0),
                 lui("v0", 0x0001), addiu("v0", "v0", 116), addu("v1", "v1", "v0"), lw("v0", "a0", 0))
        self.assertEqual(c.address(AT, AT + 16), 0x80075e88)
        self.assertEqual(c.built(AT, AT + 4), 0x80075e88)
        self.assertEqual(c.built(AT + 20, AT + 24), 0x80010074)
        self.assertIsNone(c.built(AT + 20, AT + 32))
        self.assertIsNone(c.built(AT + 16, AT))
        with self.assertRaises(SystemExit):
            c.address(AT + 20, AT + 32)

    def test_an_address_is_built_through_a_jump_and_its_delay_slot(self):
        c = code(lui("v1", 0x000a), addiu("v1", "v1", -3080), j(AT + 24), sll("v0", "v0", 2), lw("a0", "a0", 0),
                 addiu("v0", "zero", 1), addu("v0", "v0", "v1"), lw("a1", "v0", 0))
        self.assertEqual(c.built(AT, AT + 28), 0x8009f3f8)
        self.assertEqual(c.address(AT, AT + 28), 0x8009f3f8)
        c = code(lui("v1", 0x000a), j(AT + 40), lw("a1", "v1", 16))
        self.assertEqual(c.built(AT, AT + 8), 0x800a0010)
        c = code(lui("v1", 0x000a), j(AT + 400), sll("v0", "v0", 2), lw("a1", "v1", 16))
        self.assertIsNone(c.built(AT, AT + 12))

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

    def test_an_absent_reading_is_none_through_get_and_read_as_a_number_stops_the_tool_naming_its_key(self):
        r = Readings({"jump.skip": None, "jump.rows": 8})
        self.assertEqual((r.get("jump.skip"), r["jump.rows"], r.get("jump.rows")), (None, 8, 8))
        self.assertEqual(dict(r), {"jump.skip": None, "jump.rows": 8})
        with self.assertRaises(SystemExit) as stopped:
            r["jump.skip"]
        self.assertIn("jump.skip", str(stopped.exception))


SHIFT = 0x1000       # how far on from the base's addresses a mapped code's words are laid here, as the PAL executable's are
WORDS = (addiu("v1", "zero", 300), lw("v0", "v0", 21960), sll("v0", "v1", 1), addu("v0", "v0", "v1"), sll("v0", "v0", 1),
         lui("v0", 0x000a), lw("v0", "v0", 13260))


def hexed(v):
    return f"0x{v:08x}"


def placed(i, word=None, **row):
    """A row of a map of the tests' own for the i-th word, keyed by the base's address of it and placed SHIFT on."""
    held = {} if word is None else {"word": hexed(word)}
    return hexed(AT + 4 * i), {"at": hexed(AT + SHIFT + 4 * i), **held, "tier": "hand", **row}


ROWS = (placed(0, WORDS[0], key="pill.lethargy", text="addiu $v1, $zero, 300", pattern="addiu $v1, $zero, {}", us=360,
               value=300, by="count"),
        placed(1, WORDS[1], text="lw $v0, 21960($v0)"),
        placed(2, key="spin", count=3, src="v1", dst="v0", words=[hexed(w) for w in WORDS[2:5]], us=5, value=6, by="rate"),
        placed(5, WORDS[5], text="lui $v0, 0x000a"), placed(6, WORDS[6], text="lw $v0, 13260($v0)"))
NAMES = {"NEXT_MODE": "0x800a2ed0", "GLOW_CASES": {"5": "0x8002dc60", "7": "0x8002dd8c", "9": "0x8002de58"},
         "QUARTER": ["0x8003c170", "addiu $a0, $zero, {}"]}


def mapped(*words, rows=ROWS, names=NAMES, pending=()):
    """A code of the words laid SHIFT on from AT, read through a map of the rows and the names."""
    data = {"release": "eu", "rows": dict(rows), "names": names, "words": None, "extra": [], "pending": list(pending)}
    return code(*words, base=EXE_BASE + SHIFT, map=Map(data))


class Mapped(unittest.TestCase):
    def test_an_immediate_is_read_at_its_rows_place_against_its_rows_pattern(self):
        self.assertEqual(mapped(*WORDS).immediate(AT, "addiu $v0, $zero, {}"), 300)
        with self.assertRaises(SystemExit):
            code(*WORDS).immediate(AT, "addiu $v0, $zero, {}")

    def test_a_check_is_matched_at_its_place_by_its_rows_text(self):
        self.assertIsNone(mapped(*WORDS).immediate(AT + 4, "lw $v0, 22316($v0)"))

    def test_a_check_row_at_a_registered_instructions_place_is_read_through_the_registered_pattern(self):
        us, pattern = QUARTER
        word = addiu("a0", "zero", 1024)
        rows = ((hexed(us), {"at": hexed(AT + SHIFT), "word": hexed(word), "text": "addiu $a0, $zero, 1024", "tier": "strict10"}),)
        self.assertEqual(mapped(word, rows=rows, names={"QUARTER": [hexed(AT + SHIFT), pattern]}).immediate(us, pattern), 1024)
        self.assertIsNone(mapped(word, rows=rows, names={}).immediate(us, "addiu $a0, $zero, 1024"))

    def test_a_check_row_at_a_registered_instructions_place_with_no_pattern_is_read_through_the_readers_own(self):
        us, routine = SPUN_AT[50], 0x80060a38
        word = jal(routine)
        rows = ((hexed(us), {"at": hexed(AT + SHIFT), "word": hexed(word), "text": f"jal 0x{routine:08x}", "tier": "strict10"}),)
        c = mapped(word, rows=rows, names={"SPUN_AT": {str(t): hexed(AT + SHIFT) for t in SPUN_AT}})
        self.assertEqual(c.immediate(us, "jal {}"), routine)
        self.assertIsNone(c.immediate(us, f"jal 0x{routine:08x}"))

    def test_a_multiplier_is_read_with_its_rows_count_and_registers(self):
        self.assertEqual(mapped(*WORDS).multiplier(AT + 8, 2, "a0", "a0"), 6)

    def test_an_address_is_built_through_two_rows_and_a_changed_word_names_both_addresses(self):
        self.assertEqual(mapped(*WORDS).address(AT + 20, AT + 24), 0x800a33cc)
        words = list(WORDS)
        words[6] = sll("v0", "v0", 2)
        with self.assertRaises(SystemExit) as stopped:
            mapped(*words).address(AT + 20, AT + 24)
        self.assertIn(hexed(AT + SHIFT + 24), str(stopped.exception))
        self.assertIn(hexed(AT + 24), str(stopped.exception))

    def test_a_registered_constant_is_the_maps_value_in_the_registrys_shape_and_its_own_with_no_map(self):
        c = mapped(*WORDS)
        self.assertEqual(c.named("NEXT_MODE"), 0x800a2ed0)
        self.assertEqual(c.named("GLOW_CASES"), {5: 0x8002dc60, 7: 0x8002dd8c, 9: 0x8002de58})
        self.assertEqual(c.named("QUARTER"), (0x8003c170, "addiu $a0, $zero, {}"))
        self.assertEqual((code().named("NEXT_MODE"), code().named("GLOW_CASES")), (NEXT_MODE, GLOW_CASES))
        self.assertEqual((code().at(AT), c.at(AT)), (AT, AT + SHIFT))
        for name in ("GLOW_MAKE", "NOBODY"):
            with self.assertRaises(SystemExit):
                c.named(name)

    def test_a_base_address_with_no_row_stops_the_reader_naming_it(self):
        c = mapped(*WORDS)
        for read in (lambda: c.immediate(AT + 100, "nop"), lambda: c.at(AT + 100), lambda: c.multiplier(AT + 100, 1, "v0", "v0"),
                     lambda: c.address(AT + 20, AT + 100)):
            with self.assertRaises(SystemExit) as stopped:
                read()
            self.assertIn(hexed(AT + 100), str(stopped.exception))

    def test_a_changed_word_at_a_place_stops_the_reader_naming_both_addresses(self):
        words = list(WORDS)
        words[1] = lw("v0", "v0", 21964)
        with self.assertRaises(SystemExit) as stopped:
            mapped(*words).immediate(AT + 4, "lw $v0, 22316($v0)")
        self.assertIn(hexed(AT + SHIFT + 4), str(stopped.exception))
        self.assertIn(hexed(AT + 4), str(stopped.exception))

    def test_an_absent_row_reads_none_and_another_instruction_standing_there_stops_the_reader(self):
        words = (*WORDS, sh("zero", "v0", 38))
        absent = (hexed(AT + 28), {"key": "platform.over", "absent": True, "at": hexed(AT + SHIFT + 28),
                                   "word": hexed(words[7]), "text": "sh $zero, 38($v0)"})
        reads = (lambda c: c.immediate(AT + 28, "addiu $v0, $zero, {}"), lambda c: c.multiplier(AT + 28, 5, "v1", "v0"),
                 lambda c: c.divisor(AT + 28, "lui $a1, {}", AT + 32, "ori $a1, $a1, {}", AT + 36, "sra $v1, $v1, {}"))
        c = mapped(*words, rows=(*ROWS, absent))
        for read in reads:
            self.assertIsNone(read(c))
        c = mapped(*words[:7], sh("zero", "v0", 36), rows=(*ROWS, absent))
        for read in reads:
            with self.assertRaises(SystemExit) as stopped:
                read(c)
            self.assertIn(hexed(AT + SHIFT + 28), str(stopped.exception))
            self.assertIn(hexed(AT + 28), str(stopped.exception))

    def test_a_shift_row_reads_two_to_its_shift_and_another_instruction_standing_there_stops_the_reader(self):
        words = (*WORDS, sra("a1", "v0", 3))
        shift = (hexed(AT + 28), {"key": "vanish.in.by", "at": hexed(AT + SHIFT + 28), "word": hexed(words[7]),
                                  "text": "sra $a1, $v0, 3", "shift": 3, "tier": "hand", "us": 9, "value": 8, "by": "count"})

        def read(c):
            return c.divisor(AT + 28, "lui $a0, {}", AT + 32, "ori $a0, $a0, {}", AT + 36, "sra $v0, $t7, {}")
        c = mapped(*words, rows=(*ROWS, shift))
        self.assertEqual((read(c), c.at(AT + 28)), (8, AT + SHIFT + 28))
        with self.assertRaises(SystemExit) as stopped:
            read(mapped(*words[:7], sra("a1", "v0", 4), rows=(*ROWS, shift)))
        self.assertIn(hexed(AT + SHIFT + 28), str(stopped.exception))
        self.assertIn(hexed(AT + 28), str(stopped.exception))

    def test_an_absent_check_passes_where_the_instruction_it_names_stands_and_stops_the_reader_where_another_does(self):
        words = (*WORDS, lw("v1", "s0", 356))
        absent = (hexed(AT + 28), {"absent": True, "at": hexed(AT + SHIFT + 28), "word": hexed(words[7]),
                                   "text": "lw $v1, 356($s0)", "tier": "hand"})
        c = mapped(*words, rows=(*ROWS, absent))
        c.check(AT + 28, "addiu $v0, $zero, 52")
        c.check(AT + 4, "lw $v0, 22316($v0)")
        with self.assertRaises(SystemExit) as stopped:
            mapped(*words[:7], lw("v1", "s0", 352), rows=(*ROWS, absent)).check(AT + 28, "addiu $v0, $zero, 52")
        self.assertIn(hexed(AT + SHIFT + 28), str(stopped.exception))
        self.assertIn(hexed(AT + 28), str(stopped.exception))

    def test_a_map_with_pending_rows_is_refused_naming_them(self):
        left = [{"address": hexed(AT), "module": "fixture", "list": "IMMEDIATES", "key": "twin.count", "why": "left"},
                {"name": "GLOW_MAKE", "module": "fixture", "why": "not placed"}]
        with self.assertRaises(SystemExit) as refused:
            mapped(*WORDS, pending=left)
        self.assertIn("2 pending rows: twin.count, GLOW_MAKE", str(refused.exception))

    def test_a_scan_takes_a_callee_where_the_map_places_it_and_as_called_where_it_does_not(self):
        words = (sh("v0", "s0", 492), jal(0x800389fc), addu("a2", "s0", "zero"), sh("v0", "s0", 494))
        rows = (placed(0, words[0], text="sh $v0, 492($s0)"), placed(1, words[1], text="jal 0x800389fc"),
                placed(3, words[3], text="sh $v0, 494($s0)"))
        calls = ((AT + 4, 0x80038178, {"a2": 0}),)
        self.assertEqual(mapped(*words, rows=rows).resolved(AT, AT + 12, "s0", (564, 688), calls), 2)
        callee = ("0x80038178", {"at": "0x800389fc", "word": "0x24020005", "text": "addiu $v0, $zero, 5", "tier": "strict10"})
        self.assertEqual(mapped(*words, rows=(*rows, callee)).resolved(AT, AT + 12, "s0", (564, 688), calls), 2)
        elsewhere = ("0x80038178", {**callee[1], "at": "0x80038a00"})
        with self.assertRaises(SystemExit):
            mapped(*words, rows=(*rows, elsewhere)).resolved(AT, AT + 12, "s0", (564, 688), calls)

    def test_a_call_the_scan_awaits_and_never_meets_is_named_with_the_releases_own_start(self):
        words = (sh("v0", "s0", 492), addu("a2", "s0", "zero"), sh("v0", "s0", 494))
        rows = (placed(0, words[0], text="sh $v0, 492($s0)"), placed(1, words[1], text="addu $a2, $s0, $zero"),
                placed(2, words[2], text="sh $v0, 494($s0)"))
        with self.assertRaises(SystemExit) as stopped:
            mapped(*words, rows=rows).resolved(AT, AT + 8, "s0", (564, 688), ((AT + 4, 0x80038178, {"a2": 0}),))
        self.assertIn(hexed(AT + SHIFT), str(stopped.exception))
        self.assertNotIn(hexed(AT), str(stopped.exception))


class Table(unittest.TestCase):
    def test_the_table_carries_a_program_per_phase_and_the_platform_scaled(self):
        r = dict(GAME)
        for key in ("coin.turn", "coin.bob", "coin.bob.reach", "fruit.turn", "fruit.tilt",
                    "fruit.tilt.reach", "fruit.bob", "fruit.bob.reach", "gem.turn",
                    "hourglass.swing", "hourglass.turn", "hourglass.lean", "pill.flip",
                    "pill.turn", "hedgehog.form", "hedgehog.form.past", "hedgehog.orbit.brown",
                    "hedgehog.orbit.green", "hedgehog.orbit.radius", "teleporter.turn",
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
        t = table(r, 30, 60)
        self.assertEqual(t["hz"], 60)
        self.assertEqual(t["kinds"]["5"], {"speed": 25, "dwell": 1,
                                           "ride": {"bias": 512, "rumble": 70,
                                                    "body": {"off": 100, "ends": 256}, "end": {"tolerance": 100}},
                                           "standing": 95})
        fifty = table(r, 30, 50)
        self.assertEqual((fifty["hz"], fifty["kinds"]["5"]["speed"]), (50, 25))
        self.assertEqual(table({**r, "platform.over": 50}, 30, 60)["kinds"]["5"]["speed"], 30)
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
            table({**r, "glint.model": 39}, 30, 60)
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
            table({**r, "shadow.sprite.51": 2}, 30, 60)
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
        absent = table(Readings({**r, "jump.skip": None, "hop.skip": None, "fall.hop": None, "star52.points": None}),
                       30, 60)
        ball = absent["types"]["30"]
        self.assertEqual((ball["jump"]["skip"], ball["fall"]["hop"], absent["types"]["52"]["points"]), (None, None, None))
        self.assertEqual({**absent["types"]["52"], "points": r["star52.points"]}, t["types"]["52"])
        self.assertEqual(({**ball["jump"], "skip": r["jump.skip"]}, {**ball["fall"], "hop": r["fall.hop"]}),
                         (t["types"]["30"]["jump"], t["types"]["30"]["fall"]))
        with self.assertRaises(SystemExit) as stopped:
            table(Readings({**r, "roll.gain": None}), 30, 60)
        self.assertIn("roll.gain", str(stopped.exception))
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
               "gp", "record", "mode.word", "game.mode.word", "glow.counter.load", "glow.clear", "laser.levels",
               "shadow.half", "light.root", "glow", "glow.colours", "spin.order", "spin.quarter", "words", "effect.pointers",
               "effect.colours", "effect.tables", "effect.sine.at", "effect.sine.one", "effect.hud.at", "effect.table.at",
               "names", *(f"screen.load.{name}" for name in ("wide", "high", "distance", "across", "down"))}

    def test_the_six_lists_hold_their_counts_and_every_check_is_an_address_an_instruction_and_a_sentence(self):
        self.assertEqual([len(t) for t in (CHECKS, IMMEDIATES, MULTIPLIERS, DIVISORS, GREYS, SCANS)], [2242, 751, 67, 13, 7, 2])
        self.assertEqual({tuple(type(x) for x in check) for check in CHECKS}, {(int, str, str)})

    def test_every_key_is_read_once_and_none_of_them_is_set_by_hand(self):
        keys = [entry[1] for t in (IMMEDIATES, MULTIPLIERS, DIVISORS, GREYS, SCANS) for entry in t]
        self.assertEqual(sorted(set(keys) - self.BY_HAND), sorted(keys))

    def test_no_check_sentence_and_no_readings_meaning_names_an_address(self):
        sentences = [check[2] for check in (*CHECKS, *SKIN_CHECKS)]
        sentences += [entry[2] for t in (IMMEDIATES, MULTIPLIERS, DIVISORS, GREYS, SCANS, SKIN_IMMEDIATES) for entry in t]
        self.assertEqual([s for s in sentences if re.search(r"0x8[0-9a-f]{7}", s)], [])


if __name__ == "__main__":
    unittest.main()
