"""Unit tests for the map writer: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import io
import json
import struct
import sys
import tempfile
import unittest
import zlib
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from align_fixture import ANCHORS, GAPS, ORDER, laid, pill, spikes, twin  # noqa: E402
from kula_align import MODULES, Placement  # noqa: E402
from kula_disc import RELEASES  # noqa: E402
from kula_map import (FITS, KINDS, Pending, base_values, build, check, check_base, cut, derived, dump, leaves,  # noqa: E402
                      pattern_on, reaching, registries, relation, report, write_words)
from motion_fixture import addiu, addu, jal, jr, lh, lui, lw, sll, sllv, sra, sw  # noqa: E402
from png import read_png  # noqa: E402

GP = RELEASES["us"]["gp"]
RATES = (60, 50)
HIGH = 0x8001             # the half of every address of the fixture's code and data
MODE = 1296               # the mode word's offset from gp
CLOCK = -17288            # the clock word's low half under 0x800a


def tim(colour):
    """An image four bits a pixel with a palette of one colour, four pixels by two."""
    clut = struct.pack("<IHHHH", 12 + 32, 0, 0, 16, 1) + struct.pack("<16H", colour, *([0] * 15))
    return struct.pack("<II", 0x10, 0x8) + clut + struct.pack("<IHHHH", 12 + 4, 0, 0, 1, 2) + bytes(4)


def words_table(images):
    """The end screen's table over the images: its count, an offset and a length an entry, then the images
    deflated, as a list of words."""
    deflated = [zlib.compress(image) for image in images]
    table = bytearray(struct.pack("<I", len(images)))
    at = 4 + 8 * len(images)
    for image in deflated:
        table += struct.pack("<II", at, len(image))
        at += len(image) + (-len(image)) % 4
    for image in deflated:
        table += image + bytes((-len(image)) % 4)
    return list(struct.unpack_from(f"<{len(table) // 4}I", table))


IMAGES = (tim(0x7fff), tim(0x001f))
DIGEST = zlib.crc32(b"".join(IMAGES))


def mode(callee, at=MODE, store=MODE, clock=CLOCK, four=4, table=0, words=0, fill=(sll("v0", "v1", 2), addu("v0", "v0", "v1"))):
    """A routine of the tests' own: it reads the mode word off gp and stores to it, reaches the clock word as the
    clock's routine does, picks a case out of a table in the data, reads the end screen's table through a pointer
    there, calls the step and fills a word by a run of shifts and adds."""
    return [addiu("sp", "sp", -24), sw("ra", "sp", 16), lw("v0", "gp", at), lui("at", 0x800a), addiu("v1", "at", clock),
            sw("v1", "gp", store), lui("at", HIGH), addu("at", "at", "v0"), lw("v0", "at", table), lui("at", HIGH),
            lw("v0", "at", words), jal(callee), addiu("a0", "zero", four), lh("v1", "a0", 12), *fill, sw("v0", "a0", 36),
            lw("ra", "sp", 16), jr("ra"), addiu("sp", "sp", 24)]


def executable(gaps=None, routines=None, images=IMAGES, cases=("spikes", "vanish"), **at):
    """The fixture's executable with the mode routine after its others and the data its routine reaches after the
    tail: the cases' table, the pointer to the end screen's table and that table, laid twice over so the routine
    knows where the data stands."""
    routines = routines or {}
    make = routines.get("mode", mode)
    order = ORDER + ("mode",)
    first = laid(order=order, gaps=gaps, routines={**routines, "mode": make}, **at)
    data_at = first.starts["data"]
    table = data_at - (HIGH << 16)
    data = [first.starts[name] for name in cases] + [data_at + 4 * len(cases) + 4] + words_table(images)
    copy = laid(order=order, gaps=gaps, routines={**routines, "mode": lambda c: make(c, table=table, words=table + 4 * len(cases))},
                data=data, **at)
    assert copy.starts == first.starts
    return copy


def module(us):
    """A reader's lists over the fixture's executable, as the test's own module."""
    s = us.starts
    text = us.listing.text
    at = us.listing.position

    def pattern(addr):
        return text[at(addr)].rsplit(" ", 1)[0] + " {}" if "(" not in text[at(addr)] else \
            text[at(addr)].replace(text[at(addr)].split(", ")[1].split("(")[0], "{}")

    lists = {kind: [] for kind in ("CHECKS", "IMMEDIATES", "MULTIPLIERS", "DIVISORS", "GREYS", "SCANS")}
    for routine, i, kind, key in ANCHORS:
        addr = s[routine] + 4 * i
        if kind == "CHECKS":
            lists["CHECKS"].append((addr, text[at(addr)], key))
        elif kind == "IMMEDIATES":
            lists["IMMEDIATES"].append(("fixture", key, key, addr, pattern(addr)))
    lists["MULTIPLIERS"].append(("fixture", "pill.fill", "fills by", s["pill"] + 4 * 6, 2, "v1", "v0"))
    lists["MULTIPLIERS"].append(("fixture", "mode.fill", "fills by", s["mode"] + 4 * 14, 2, "v1", "v0"))
    c = s["clock"]
    lists["DIVISORS"].append(("fixture", "clock.shown", "shown in", c + 12, "lui $v0, {}", c + 16, "ori $v0, $v0, {}",
                              c + 28, "sra $v0, $v1, {}"))
    lists["GREYS"].append(("fixture", "clock.grey", "grey of", c + 40, "lui $v1, {}", c + 44, "ori $v1, $v1, {}"))
    m = s["mode"]
    lists["IMMEDIATES"] += [("fixture", "mode.at", "the mode word this far past gp", m + 8, "lw $v0, {}($gp)"),
                            ("fixture", "mode.four", "four", m + 48, "addiu $a0, $zero, {}")]
    lists["CHECKS"].append((m + 44, text[at(m + 44)], "the mode routine calls the step"))
    lists["SCANS"].append(("fixture", "mode.stores", "stores", m, m + 20, "a0", (0, 8), ()))
    named = {"MODE_WORD": ("offset", (GP + MODE, MODE), ("mode.at",)), "CLOCK_WORD": ("word", (0x800a << 16) + CLOCK),
             "CASES": ("table", (s["data"], 0, 2)), "SPIKES": ("routine", s["spikes"]), "CALL": ("instruction", m + 44),
             "CLOCK_PAIR": ("pair", (m + 12, m + 16)), "SHOWN": ("matched", (c + 12, "lui $v0, {}", c + 16, "ori $v0, $v0, {}")),
             "FILL": ("run", (m + 56, 2, "v1", "v0")), "WORDS_TABLE": ("pair", (m + 36, m + 40)),
             "GLOW": ("instruction", {7: (s["twin"] + 24, s["twin"] + 28)})}
    return SimpleNamespace(__name__="fixture", NAMED=named, **lists)


def hand(**tables):
    out = {name: {"eu": {}} for name in ("PLACED", "TUNED", "ABSENT", "SHIFTS", "RESHAPED", "MULTIPLIERS", "WORDS")}
    out["EXTRA"] = {"eu": []}
    for name, rows in tables.items():
        out[name]["eu"] = rows
    return SimpleNamespace(**out)


US = executable()
FIXTURE = module(US)
WORDS = {0: ("HELLO!", DIGEST)}


def mapped(copy, hand_table=None, rates=RATES, modules=(FIXTURE,)):
    return build(US.listing, copy.listing, "eu", modules=modules, hand=hand_table or hand(), rates=rates, us_words=WORDS)


def key_rows(built):
    return {row["key"]: row for row in built["rows"].values() if "key" in row}


def pending_keys(built):
    return {p.get("key", p.get("name", p.get("pair"))): p for p in built["pending"]}


class Relations(unittest.TestCase):
    def test_a_ratio_cuts_toward_nothing_either_side_of_it(self):
        self.assertEqual((cut(63, 50, 60), cut(-80, 50, 60), cut(14, 60, 50), cut(33, 60, 50)), (52, -66, 16, 39))

    def test_each_relation_and_each_direction_of_each_scaling(self):
        self.assertEqual(relation("k", 360, 360, RATES, {}), "same")
        self.assertEqual(relation("k", 360, 300, RATES, {}), "count")
        self.assertEqual(relation("k", 16, 14, RATES, {}), "count")
        self.assertEqual(relation("k", 5, 6, RATES, {}), "rate")
        self.assertEqual(relation("k", 33, 40, RATES, {}), "rate")
        self.assertEqual(relation("k", -66, -80, RATES, {}), "rate")
        self.assertIsNone(relation("k", 77, 65, RATES, {}))
        self.assertEqual(relation("k", 77, 65, RATES, {"k": "its lurch is retuned"}), "tuned")
        self.assertEqual(relation("k", 9372, 9600, RATES, {}, address=9600), "address")
        self.assertIsNone(relation("k", 9372, 9372, RATES, {"k": "why"}, address=9600))

    def test_no_scaling_is_offered_where_the_two_executables_run_at_one_rate(self):
        self.assertIsNone(relation("k", 360, 300, (60, 60), {}))
        self.assertEqual(relation("k", 360, 360, (60, 60), {}), "same")

    def test_a_pattern_takes_the_registers_of_the_instruction_placed(self):
        self.assertEqual(pattern_on("addiu $v0, $zero, {}", "addiu $v0, $zero, 360", "addiu $v1, $zero, 300"), "addiu $v1, $zero, {}")
        self.assertEqual(pattern_on("lh $v0, {}($s0)", "lh $v0, 6($s0)", "lh $v0, 6($s5)"), "lh $v0, {}($s5)")
        self.assertEqual(pattern_on("lw $v0, {}($gp)", "lw $v0, 9372($gp)", "lw $v0, 9600($gp)"), "lw $v0, {}($gp)")


class Rows(unittest.TestCase):
    def test_a_shifted_copy_maps_every_row_as_the_same_with_its_tier_and_every_name(self):
        copy = executable(gaps=GAPS)
        built = mapped(copy)
        self.assertEqual(built["pending"], [])
        rows = key_rows(built)
        self.assertEqual({row["by"] for row in rows.values()}, {"same", "address"})
        self.assertEqual(rows["pill.lethargy"], {"key": "pill.lethargy", "at": f"0x{copy.places['pill.lethargy']:08x}",
                                                 "word": "0x24020168", "text": "addiu $v0, $zero, 360", "tier": "strict10",
                                                 "pattern": "addiu $v0, $zero, {}", "us": 360, "value": 360, "by": "same"})
        self.assertEqual((rows["pill.fill"]["count"], rows["pill.fill"]["value"], len(rows["pill.fill"]["words"])), (2, 5, 2))
        self.assertEqual((rows["mode.fill"]["count"], rows["mode.fill"]["value"], rows["mode.fill"]["tier"]), (2, 5, "strict10"))
        self.assertEqual((rows["clock.shown"]["value"], rows["clock.grey"]["value"], len(rows["clock.shown"]["at"])), (60, 128, 3))
        self.assertEqual(rows["mode.at"], {**rows["mode.at"], "us": MODE, "value": MODE, "by": "address"})
        check_row = built["rows"][f"0x{US.places['the pill tests its word']:08x}"]
        self.assertEqual(set(check_row), {"at", "word", "text", "tier"})
        s = copy.starts
        self.assertEqual(built["names"]["CASES"], [f"0x{s['data']:08x}", 0, 2])
        self.assertEqual(built["names"]["SPIKES"], f"0x{s['spikes']:08x}")
        self.assertEqual(built["names"]["MODE_WORD"], [f"0x{GP + MODE:08x}", MODE])
        self.assertEqual(built["names"]["CLOCK_WORD"], f"0x{(0x800a << 16) + CLOCK:08x}")
        self.assertEqual(built["names"]["FILL"], [f"0x{s['mode'] + 56:08x}", 2, "v1", "v0"])
        self.assertEqual(built["names"]["SHOWN"], [f"0x{s['clock'] + 12:08x}", "lui $v0, {}", f"0x{s['clock'] + 16:08x}", "ori $v0, $v0, {}"])
        self.assertEqual(built["names"]["GLOW"], {7: [f"0x{s['twin'] + 24:08x}", f"0x{s['twin'] + 28:08x}"]})
        self.assertEqual(built["words"], {"count": 2, "pairs": {"0": ["HELLO!", f"0x{DIGEST:08x}"]}})

    def test_a_scaled_copy_reads_its_counts_and_rates_in_either_direction_of_truncation(self):
        copy = executable(gaps=GAPS, routines={"pill": lambda c: pill(c, counts=(300, 700)),
                                               "spikes": lambda c: spikes("s0", "a0", 52, 12), "twin": lambda c: twin(c, count=8)})
        rows = key_rows(mapped(copy))
        self.assertEqual({k: (rows[k]["us"], rows[k]["value"], rows[k]["by"]) for k in
                          ("pill.lethargy", "pill.invincible", "spikes.down", "spikes.hold", "twin.count")},
                         {"pill.lethargy": (360, 300, "count"), "pill.invincible": (840, 700, "count"),
                          "spikes.down": (63, 52, "count"), "spikes.hold": (14, 12, "count"), "twin.count": (7, 8, "rate")})

    def test_a_value_outside_every_relation_is_pending_with_both_values_and_no_row(self):
        copy = executable(gaps=GAPS, routines={"twin": lambda c: twin(c, count=10)})
        built = mapped(copy)
        self.assertNotIn("twin.count", key_rows(built))
        self.assertEqual(built["pending"], [{"address": f"0x{US.places['twin.count']:08x}", "module": "fixture",
                                             "list": "IMMEDIATES", "key": "twin.count",
                                             "why": "10 stands in no relation to the base's 7", "us": 7, "value": 10}])
        tuned = mapped(copy, hand(TUNED={"twin.count": "the twin counts ten"}))
        self.assertEqual(tuned["pending"], [])
        self.assertEqual(key_rows(tuned)["twin.count"]["by"], "tuned")

    def test_a_check_or_a_scan_anchor_the_aligner_leaves_is_pending_with_why_and_no_row(self):
        c = US.starts["clock"]
        scans = FIXTURE.SCANS + [("fixture", "clock.stores", "stores", c + 12, c + 36, "a1", (0, 8), ())]
        modules = (SimpleNamespace(**{**vars(FIXTURE), "SCANS": scans}),)
        built = mapped(executable(gaps=GAPS, routines={"clock": lambda callee: []}), modules=modules)
        check_at, why = f"0x{US.places['and marks the clock turned']:08x}", "its function is unpaired"
        self.assertEqual([p for p in built["pending"] if p.get("list") in ("CHECKS", "SCANS")],
                         [{"address": check_at, "module": "fixture", "list": "CHECKS", "key": "and marks the clock turned", "why": why},
                          {"address": f"0x{c + 12:08x}", "module": "fixture", "list": "SCANS", "key": "clock.stores.start", "why": why},
                          {"address": f"0x{c + 36:08x}", "module": "fixture", "list": "SCANS", "key": "clock.stores.end", "why": why}])
        self.assertNotIn(check_at, built["rows"])
        plus = f"0x{US.places['clock.plus']:08x}"
        self.assertIn({"address": plus, "module": "fixture", "list": "IMMEDIATES", "key": "clock.plus",
                       "why": f"{plus} is not placed: {why}"}, built["pending"])

    def test_a_multiplier_run_is_read_at_its_place_with_its_own_count(self):
        longer = (sll("v0", "v1", 1), addu("v0", "v0", "v1"), sll("v0", "v0", 1))
        copy = executable(gaps=GAPS, routines={"mode": lambda c, **k: mode(c, fill=longer, **k)})
        built = mapped(copy)
        row = key_rows(built)["mode.fill"]
        self.assertEqual((row["at"], row["count"], row["us"], row["value"], row["by"], len(row["words"])),
                         (f"0x{copy.starts['mode'] + 56:08x}", 3, 5, 6, "rate", 3))
        self.assertEqual(built["names"]["FILL"], [f"0x{copy.starts['mode'] + 56:08x}", 3, "v1", "v0"])
        self.assertEqual(built["pending"], [])

    def test_a_run_is_cut_where_its_destination_is_overwritten_by_no_shift_or_add(self):
        for fill, count in (((sll("v0", "v1", 2), addu("v0", "v0", "v1"), lw("v0", "a0", 8)), 2),
                            ((sll("v0", "v1", 2), lw("a1", "a0", 8), addu("v0", "v0", "v1")), 3)):
            with self.subTest(count=count):
                copy = executable(gaps=GAPS, routines={"mode": lambda c, fill=fill, **k: mode(c, fill=fill, **k)})
                built = mapped(copy)
                row = key_rows(built)["mode.fill"]
                at = f"0x{copy.starts['mode'] + 56:08x}"
                self.assertEqual((row["at"], row["count"], len(row["words"]), row["value"], row["by"]), (at, count, count, 5, "same"))
                self.assertEqual(built["names"]["FILL"], [at, count, "v1", "v0"])
                self.assertEqual(built["pending"], [])

    def test_a_run_row_takes_the_least_sure_tier_of_the_placements_about_it(self):
        longer = (sll("v0", "v1", 1), addu("v0", "v0", "v1"), sll("v0", "v0", 1))
        copy = executable(gaps=GAPS, routines={"mode": lambda c, **k: mode(c, fill=longer, **k)})
        start, at = US.starts["mode"] + 56, copy.starts["mode"] + 56
        before, after = {start - 4: (at - 4, "the load before the run")}, {start + 8: (at + 12, "the store after it")}
        self.assertEqual(key_rows(mapped(copy))["mode.fill"]["tier"], "aligned")
        self.assertEqual(key_rows(mapped(copy, hand(PLACED=before)))["mode.fill"]["tier"], "aligned")
        self.assertEqual(key_rows(mapped(copy, hand(PLACED=after)))["mode.fill"]["tier"], "offset")
        self.assertEqual(key_rows(mapped(copy, hand(PLACED={**before, **after})))["mode.fill"]["tier"], "hand")

    def test_a_run_shifting_by_a_register_carries_the_instruction_that_sets_it(self):
        fill = (addiu("a2", "zero", 3), sllv("v0", "v1", "a2"))
        copy = executable(gaps=GAPS, routines={"mode": lambda c, **kw: mode(c, fill=fill, **kw)})
        at = copy.starts["mode"] + 56
        row = key_rows(mapped(copy, hand(TUNED={"mode.fill": "eight against five, a shift by the register set before it"})))["mode.fill"]
        self.assertEqual((row["value"], row["by"], row["sets"]), (8, "tuned", {f"0x{at:08x}": f"0x{fill[0]:08x}"}))
        self.assertNotIn("sets", key_rows(mapped(copy := executable(gaps=GAPS)))["mode.fill"])

    def test_a_hand_run_is_read_as_given(self):
        copy = executable(gaps=GAPS)
        at = copy.starts["mode"] + 56
        row = key_rows(mapped(copy, hand(MULTIPLIERS={"mode.fill": (at, 2, "v1", "v0", "the run as laid")})))["mode.fill"]
        self.assertEqual((row["at"], row["count"], row["value"], row["tier"]), (f"0x{at:08x}", 2, 5, "hand"))

    def test_two_keys_reading_one_address_otherwise_stop_the_writer(self):
        shift = ("fixture", "pill.shift", "shifts by", US.starts["pill"] + 24, "sll $v0, $v1, {}")
        modules = (SimpleNamespace(**{**vars(FIXTURE), "IMMEDIATES": FIXTURE.IMMEDIATES + [shift]}),)
        with self.assertRaises(SystemExit) as stopped:
            mapped(executable(gaps=GAPS), modules=modules)
        self.assertEqual(str(stopped.exception), f"0x{US.starts['pill'] + 24:08x} is read as pill.shift and as pill.fill, which disagree")

    def test_a_stale_hand_row_stops_the_writer(self):
        copy = executable(gaps=GAPS)
        at, immediate = copy.starts["clock"] + 28, US.places["pill.lethargy"]
        for what, named, table in (
                ("tuned", "nobody.home", hand(TUNED={"nobody.home": "a key no reader lists"})),
                ("shift", "nobody.home", hand(SHIFTS={"nobody.home": (at, "sra $v0, $v1, 5", "a shift no reader lists")})),
                ("absent", "nobody.home", hand(ABSENT={"nobody.home": (at, "sra $v0, $v1, 5", "an instruction no reader lists")})),
                ("absent", f"0x{immediate:08x}", hand(ABSENT={immediate: (at, "sra $v0, $v1, 5", "an address no reader lists as a check")})),
                ("multiplier", "nobody.home", hand(MULTIPLIERS={"nobody.home": (at, 1, "v1", "v0", "a run no reader lists")})),
                ("reshaped", f"0x{US.starts['mode'] + 4:08x}",
                 hand(RESHAPED={US.starts["mode"] + 4: (copy.starts["mode"] + 4, "sw $ra, 16($sp)", "an address no reader lists")})),
                ("placed", f"0x{US.starts['pill']:08x}", hand(PLACED={US.starts["pill"]: (copy.starts["pill"], "an address no reader lists")}))):
            with self.subTest(what, named=named):
                with self.assertRaises(SystemExit) as stopped:
                    mapped(copy, table)
                self.assertEqual(str(stopped.exception), f"the hand table's {what} rows name {named}, which no reader lists")


class Words(unittest.TestCase):
    def test_a_word_is_derived_through_the_instructions_reaching_it_and_an_offset_against_the_copys_gp(self):
        copy = executable(gaps=GAPS, routines={"mode": lambda c, **k: mode(c, at=MODE + 400, store=MODE + 400, **k)}, gp=GP - 400)
        built = mapped(copy)
        self.assertEqual(built["names"]["MODE_WORD"], [f"0x{GP + MODE:08x}", MODE + 400])
        self.assertEqual((key_rows(built)["mode.at"]["value"], key_rows(built)["mode.at"]["by"]), (MODE + 400, "address"))
        self.assertEqual(built["pending"], [])

    def test_a_word_is_derived_through_an_addiu_off_gp(self):
        def pointed(callee, at=MODE, **k):
            rows = mode(callee, at=at, store=at, **k)
            rows[rows.index(sw("v1", "gp", at))] = addiu("v1", "gp", at)
            return rows
        us = executable(routines={"mode": pointed})
        copy = executable(gaps=GAPS, routines={"mode": lambda c, **k: pointed(c, at=MODE + 400, **k)})
        self.assertIn((None, us.listing.position(us.starts["mode"] + 20)), reaching(us.listing)[GP + MODE])
        built = build(us.listing, copy.listing, "eu", modules=(module(us),), hand=hand(), rates=RATES, us_words=WORDS)
        self.assertEqual(built["names"]["MODE_WORD"], [f"0x{GP + MODE + 400:08x}", MODE + 400])
        self.assertEqual(built["pending"], [])

    def test_a_word_two_instructions_reach_otherwise_is_refused_and_the_offset_read_as_it_is_pending(self):
        copy = executable(gaps=GAPS, routines={"mode": lambda c, **k: mode(c, store=MODE + 4, **k)})
        built = mapped(copy)
        self.assertNotIn("MODE_WORD", built["names"])
        self.assertNotIn("mode.at", key_rows(built))
        why = pending_keys(built)
        self.assertEqual(why["MODE_WORD"]["why"], f"the instructions reaching it reach 0x{GP + MODE:08x} (0x{copy.starts['mode'] + 8:08x}) "
                                                  f"and 0x{GP + MODE + 4:08x} (0x{copy.starts['mode'] + 20:08x})")
        self.assertEqual(why["mode.at"]["why"], "the word it is an offset of is not derived")

    def test_a_word_moved_on_the_copy_is_the_copys_through_a_lui_and_the_load_after_it(self):
        from align_fixture import clock
        copy = executable(gaps=GAPS, routines={"clock": lambda c: clock(c, word=CLOCK + 8),
                                               "mode": lambda c, **k: mode(c, clock=CLOCK + 8, **k)})
        self.assertEqual(mapped(copy)["names"]["CLOCK_WORD"], f"0x{(0x800a << 16) + CLOCK + 8:08x}")

    def test_a_word_is_derived_through_the_adds_between_its_lui_and_its_load(self):
        def added(callee, table=0, words=0, **k):
            rows = mode(callee, table=table, words=words, **k)
            i = rows.index(lw("v0", "at", table))
            return [*rows[:i - 2], lui("at", HIGH), addiu("at", "at", table), addu("at", "at", "v0"), lw("v0", "at", 0), *rows[i + 1:]]
        copy = executable(gaps=GAPS, routines={"mode": added})
        built = mapped(copy)
        self.assertEqual(built["names"]["CASES"], [f"0x{copy.starts['data']:08x}", 0, 2])
        self.assertNotIn("CASES", pending_keys(built))

    def test_a_lui_and_a_use_placed_where_no_address_is_built_are_passed_over(self):
        copy = executable(gaps=GAPS)
        word, reach = (0x800a << 16) + CLOCK, reaching(US.listing)
        pairs = [(li, ui) for li, ui in reach[word] if li is not None]
        self.assertGreater(len(pairs), 1)

        def on_copy(i):
            addr = US.listing.address(i)
            routine = max((start for start in US.starts.values() if start <= addr), default=None)
            name = next(n for n, start in US.starts.items() if start == routine)
            at = copy.starts[name] + addr - routine
            return Placement(at, "hand", copy.listing.text[copy.listing.position(at)])
        placements = {US.listing.address(i): on_copy(i) for pair in pairs for i in pair}
        self.assertEqual(derived(US.listing, copy.listing, word, reach, placements), word)
        off = copy.starts["mode"] + 52
        placements[US.listing.address(pairs[0][1])] = Placement(off, "hand", "lh $v1, 12($a0)")
        self.assertEqual(derived(US.listing, copy.listing, word, reach, placements), word)
        for _, ui in pairs:
            placements[US.listing.address(ui)] = Placement(off, "hand", "lh $v1, 12($a0)")
        with self.assertRaises(Pending) as left:
            derived(US.listing, copy.listing, word, reach, placements)
        self.assertEqual(str(left.exception), f"the instructions placed for it build no address, at 0x{off:08x} and 0x{off:08x}")

    def test_a_tables_entries_are_held_to_where_the_bases_entries_were_placed(self):
        copy = executable(gaps=GAPS, cases=("vanish", "spikes"))
        why = pending_keys(mapped(copy))
        self.assertIn("CASES", why)
        self.assertTrue(why["CASES"]["why"].startswith(f"entry 0 of the table derived at 0x{copy.starts['data']:08x} is "))

    def test_the_end_screens_pairs_are_lettered_by_the_bases_digest_or_the_hands_word(self):
        copy = executable(gaps=GAPS, images=(tim(0x7fff), tim(0x03e0)))
        built = mapped(copy)
        self.assertEqual(built["words"], {"count": 2, "pairs": {}})
        self.assertEqual(built["pending"], [{"pair": 0, "why": "its images are not the base's 'HELLO!' pair, and the hand table gives no word for them"}])
        given = mapped(copy, hand(WORDS={0: "HALLO!"}))
        digest = zlib.crc32(tim(0x7fff) + tim(0x03e0))
        self.assertEqual(given["words"], {"count": 2, "pairs": {"0": ["HALLO!", f"0x{digest:08x}"]}})
        self.assertEqual(given["pending"], [])

    def test_a_pair_the_hand_letters_beyond_the_bases_table_is_held_by_its_own_digest(self):
        own = (tim(0x03e0), tim(0x7c00))
        built = mapped(executable(gaps=GAPS, images=(*IMAGES, *own)), hand(WORDS={2: "WELT!"}))
        digest = zlib.crc32(b"".join(own))
        self.assertEqual(built["words"], {"count": 4, "pairs": {"0": ["HELLO!", f"0x{DIGEST:08x}"],
                                                                 "2": ["WELT!", f"0x{digest:08x}"]}})
        self.assertEqual(built["pending"], [])
        with tempfile.TemporaryDirectory() as out:
            path = Path(out) / "eu.json"
            dump(built, path)
            with redirect_stdout(io.StringIO()):
                check(built, path)
            redrawn = mapped(executable(gaps=GAPS, images=(*IMAGES, own[0], tim(0x001f))), hand(WORDS={2: "WELT!"}))
            with self.assertRaises(SystemExit) as stopped:
                check(redrawn, path)
            self.assertIn("words holds", str(stopped.exception))

    def test_the_pairs_are_rendered_side_by_side_named_by_their_index(self):
        copy = executable(gaps=GAPS)
        with tempfile.TemporaryDirectory() as out, redirect_stdout(io.StringIO()):
            write_words(copy.listing, mapped(copy), out)
            w, h, rgba = read_png(Path(out) / "0.png")
        self.assertEqual((w, h), (8, 2))
        self.assertEqual(rgba[:4], bytes((255, 255, 255, 255)))
        self.assertEqual(rgba[16:20], bytes((255, 0, 0, 255)))


class Hand(unittest.TestCase):
    def test_a_placed_row_wins_over_the_aligner_and_one_of_another_shape_is_refused(self):
        copy = executable(gaps=GAPS, routines={"twin": lambda c: twin(c, count=7)})
        twice = executable(gaps=GAPS)
        at = copy.places["twin.count"]
        built = mapped(copy, hand(PLACED={US.places["twin.count"]: (at, "the twin's count, by its lui of 0x800b")}))
        self.assertEqual((key_rows(built)["twin.count"]["at"], key_rows(built)["twin.count"]["tier"]), (f"0x{at:08x}", "hand"))
        with self.assertRaises(SystemExit) as refused:
            mapped(twice, hand(PLACED={US.places["twin.count"]: (twice.places["twin.count"] + 4, "the wrong instruction")}))
        self.assertIn("a check the release lays out otherwise is a reshaped row", str(refused.exception))

    def test_an_absent_row_is_written_with_the_standing_instructions_word(self):
        from motion_fixture import ori
        copy = executable(gaps=GAPS, routines={"pill": lambda c: pill(c, load=ori)})
        at = copy.places["pill.invincible"]
        built = mapped(copy, hand(ABSENT={"pill.invincible": (at, "ori $v0, $zero, 840", "the pill's second count is or'ed in")}))
        self.assertEqual(key_rows(built)["pill.invincible"], {"key": "pill.invincible", "absent": True, "at": f"0x{at:08x}",
                                                               "word": f"0x{copy.listing.code.word(at):08x}", "text": "ori $v0, $zero, 840"})
        self.assertEqual([p for p in built["pending"] if p.get("key") == "pill.invincible"], [])
        with self.assertRaises(SystemExit):
            mapped(copy, hand(ABSENT={"pill.invincible": (at, "addiu $v0, $zero, 840", "not what stands there")}))

    def test_an_absent_check_stands_at_its_address_whatever_the_aligner_placed_or_left_there(self):
        placed, left = executable(gaps=GAPS), executable(gaps=GAPS, routines={"clock": lambda callee: []})
        at, text = placed.places["pill.invincible"], "addiu $v0, $zero, 840"
        row = {"absent": True, "at": f"0x{at:08x}", "word": f"0x{placed.listing.code.word(at):08x}", "text": text, "tier": "hand"}
        tested, turned = US.places["the pill tests its word"], US.places["and marks the clock turned"]
        built = mapped(placed, hand(ABSENT={tested: (at, text, "the copy makes no such test")}))
        self.assertEqual((built["rows"][f"0x{tested:08x}"], built["pending"]), (row, []))
        built = mapped(left, hand(ABSENT={turned: (at, text, "the copy makes no such test")}))
        self.assertEqual(built["rows"][f"0x{turned:08x}"], row)
        self.assertEqual([p for p in built["pending"] if p.get("address") == f"0x{turned:08x}"], [])
        with self.assertRaises(SystemExit) as stopped:
            mapped(placed, hand(ABSENT={tested: (at, "addiu $v0, $zero, 841", "not what stands there")}))
        self.assertEqual(str(stopped.exception), f"the hand table's absent row at 0x{at:08x} reads `{text}`, not `addiu $v0, $zero, 841`")

    def test_a_shift_row_is_two_to_its_shift_held_by_relation_and_another_instruction_standing_there_is_refused(self):
        from align_fixture import clock

        def shifted(callee):
            words = clock(callee)
            return [*words[:3], *words[5:7], sra("v0", "v1", 6), *words[8:]]
        copy = executable(gaps=GAPS, routines={"clock": shifted})
        named = {name: entry for name, entry in FIXTURE.NAMED.items() if name != "SHOWN"}
        modules = (SimpleNamespace(**{**vars(FIXTURE), "NAMED": named}),)
        at = copy.starts["clock"] + 20
        row = {"clock.shown": (at, "sra $v0, $v1, 6", "the clock divides by a shift of six")}
        built = mapped(copy, hand(SHIFTS=row, TUNED={"clock.shown": "sixty-four against sixty"}), modules=modules)
        self.assertEqual(key_rows(built)["clock.shown"], {"key": "clock.shown", "at": f"0x{at:08x}", "word": f"0x{sra('v0', 'v1', 6):08x}",
                                                           "text": "sra $v0, $v1, 6", "shift": 6, "tier": "hand", "us": 60, "value": 64,
                                                           "by": "tuned"})
        self.assertEqual(built["pending"], [])
        left = pending_keys(mapped(copy, hand(SHIFTS=row), modules=modules))["clock.shown"]
        self.assertEqual((left["us"], left["value"], left["why"]), (60, 64, "64 stands in no relation to the base's 60"))
        with self.assertRaises(SystemExit):
            mapped(copy, hand(SHIFTS={"clock.shown": (at, "sra $v0, $v1, 5", "not what stands there")}), modules=modules)

    def test_a_reshaped_row_is_written_as_given_and_an_extra_check_verified(self):
        copy = executable(gaps=GAPS)
        us_at = US.places["and test it"]
        at = copy.places["and store it"]
        built = mapped(copy, hand(RESHAPED={us_at: (at, "sw $v0, 12($s0)", "the test is folded into the store")},
                                  EXTRA=[(copy.places["spikes.down"], "addiu $v1, $zero, 63", "the copy's own check")]))
        self.assertEqual(built["rows"][f"0x{us_at:08x}"], {"at": f"0x{at:08x}", "word": f"0x{copy.listing.code.word(at):08x}",
                                                            "text": "sw $v0, 12($s0)", "tier": "reshaped"})
        self.assertEqual(built["extra"], [{"at": f"0x{copy.places['spikes.down']:08x}", "word": "0x2403003f", "text": "addiu $v1, $zero, 63"}])
        with self.assertRaises(SystemExit):
            mapped(copy, hand(RESHAPED={us_at: (at, "sw $v0, 16($s0)", "not what stands there")}))

    def test_a_reshaped_row_places_a_registered_routines_entry(self):
        copy = executable(gaps=GAPS, routines={"spikes": lambda callee: [lui("at", 0x800b), *spikes("s0", "a0", 63, 14)]})
        us_at, at = US.starts["spikes"], copy.starts["spikes"]
        self.assertEqual(mapped(copy)["names"]["SPIKES"], f"0x{at + 4:08x}")
        built = mapped(copy, hand(RESHAPED={us_at: (at, "lui $at, 0x800b", "the routine opens with the half hoisted")}))
        self.assertEqual(built["names"]["SPIKES"], f"0x{at:08x}")
        self.assertEqual(built["rows"][f"0x{us_at:08x}"]["tier"], "reshaped")

    def test_a_reshaped_row_for_an_immediate_is_written_with_the_hands_value_in_its_relation_to_the_bases(self):
        from motion_fixture import ori
        copy = executable(gaps=GAPS, routines={"pill": lambda c: pill(c, load=ori)})
        us_at, at = US.places["pill.invincible"], copy.places["pill.invincible"]
        built = mapped(copy, hand(RESHAPED={us_at: (at, "ori $v0, $zero, 840", 840, "the pill's second count is or'ed in")}))
        self.assertEqual(key_rows(built)["pill.invincible"],
                         {"key": "pill.invincible", "at": f"0x{at:08x}", "word": f"0x{copy.listing.code.word(at):08x}",
                          "text": "ori $v0, $zero, 840", "tier": "reshaped", "us": 840, "value": 840, "by": "same"})
        self.assertNotIn("pill.invincible", pending_keys(built))
        left = pending_keys(mapped(copy, hand(RESHAPED={us_at: (at, "ori $v0, $zero, 840", 841, "one more")})))["pill.invincible"]
        self.assertEqual((left["us"], left["value"], left["why"]), (840, 841, "841 stands in no relation to the base's 840"))
        with self.assertRaises(SystemExit):
            mapped(copy, hand(RESHAPED={us_at: (at, "ori $v0, $zero, 841", 840, "not what stands there")}))
        check, store = US.places["and test it"], copy.places["and store it"]
        with self.assertRaises(SystemExit) as stale:
            mapped(copy, hand(RESHAPED={check: (store, "sw $v0, 12($s0)", 1, "a check given a value")}))
        self.assertEqual(str(stale.exception), f"the hand table's reshaped immediate rows name 0x{check:08x}, which no reader lists")

    def test_a_reshaped_immediate_and_an_absence_for_one_reading_stop_the_writer(self):
        from motion_fixture import ori
        copy = executable(gaps=GAPS, routines={"pill": lambda c: pill(c, load=ori)})
        us_at, at = US.places["pill.invincible"], copy.places["pill.invincible"]
        with self.assertRaises(SystemExit) as stopped:
            mapped(copy, hand(RESHAPED={us_at: (at, "ori $v0, $zero, 840", 840, "the pill's second count is or'ed in")},
                              ABSENT={"pill.invincible": (at, "ori $v0, $zero, 840", "and read nowhere")}))
        self.assertEqual(str(stopped.exception), f"the hand table's reshaped and absent rows meet at pill.invincible, 0x{us_at:08x}")

    def test_two_hand_rows_meeting_at_one_address_stop_the_writer(self):
        copy = executable(gaps=GAPS)
        tested, at = US.places["the pill tests its word"], copy.places["the pill tests its word"]
        text = copy.listing.text[copy.listing.position(at)]
        placed, reshaped = {tested: (at, "the test as laid")}, {tested: (at, text, "the test as laid")}
        absent = {tested: (at, text, "the copy makes no such test")}
        for named, tables in (("placed and reshaped", dict(PLACED=placed, RESHAPED=reshaped)),
                              ("placed and absent", dict(PLACED=placed, ABSENT=absent)),
                              ("reshaped and absent", dict(RESHAPED=reshaped, ABSENT=absent))):
            with self.subTest(named):
                with self.assertRaises(SystemExit) as stopped:
                    mapped(copy, hand(**tables))
                self.assertEqual(str(stopped.exception), f"the hand table's {named} rows meet at 0x{tested:08x}")

    def test_a_reading_valued_at_an_absent_checks_address_stops_the_writer_and_one_absent_too_stands_there(self):
        copy = executable(gaps=GAPS)
        fill, at = US.starts["mode"] + 56, copy.starts["mode"] + 56
        text = copy.listing.text[copy.listing.position(at)]
        checked = (SimpleNamespace(**{**vars(FIXTURE), "CHECKS": FIXTURE.CHECKS + [(fill, US.listing.text[US.listing.position(fill)],
                                                                                   "the mode fills its word")]}),)
        with self.assertRaises(SystemExit) as stopped:
            mapped(copy, hand(ABSENT={fill: (at, text, "the copy fills its word otherwise")}), modules=checked)
        self.assertEqual(str(stopped.exception), f"0x{fill:08x} is the hand table's absent check and is read as mode.fill")
        use, at, text = US.starts["mode"] + 8, copy.starts["mode"] + 8, f"lw $v0, {MODE}($gp)"
        built = mapped(copy, hand(ABSENT={use: (at, text, "the mode word is read nowhere"), "mode.at": (at, text, "as above")}))
        self.assertEqual(built["rows"][f"0x{use:08x}"], {"key": "mode.at", "absent": True, "at": f"0x{at:08x}",
                                                          "word": f"0x{copy.listing.code.word(at):08x}", "text": text})
        self.assertEqual(built["pending"], [])
        other = copy.listing.text[copy.listing.position(at + 4)]
        with self.assertRaises(SystemExit) as stopped:
            mapped(copy, hand(ABSENT={use: (at, text, "the mode word is read nowhere"), "mode.at": (at + 4, other, "as above")}))
        self.assertEqual(str(stopped.exception),
                         f"0x{use:08x} is absent as a check at 0x{at:08x} and as mode.at at 0x{at + 4:08x}, which disagree")

    def test_an_absent_row_for_an_instruction_reaching_a_word_takes_it_out_of_the_derivation(self):
        copy = executable(gaps=GAPS, routines={"mode": lambda c, **k: mode(c, clock=CLOCK + 8, **k)})
        mode_use, clock_use = US.starts["mode"] + 16, US.starts["clock"] + 24
        word, other = f"0x{(0x800a << 16) + CLOCK:08x}", f"0x{(0x800a << 16) + CLOCK + 8:08x}"
        at, text = copy.starts["mode"] + 16, f"addiu $v1, $at, {CLOCK + 8}"
        self.assertEqual(pending_keys(mapped(copy))["CLOCK_WORD"]["why"],
                         f"the instructions reaching it reach {word} (0x{copy.starts['clock'] + 24:08x}) and {other} (0x{at:08x})")
        built = mapped(copy, hand(ABSENT={mode_use: (at, text, "the mode routine builds another word here")}))
        self.assertEqual(built["names"]["CLOCK_WORD"], word)
        self.assertEqual(built["rows"][f"0x{mode_use:08x}"], {"absent": True, "at": f"0x{at:08x}", "word": f"0x{addiu('v1', 'at', CLOCK + 8):08x}",
                                                               "text": text, "tier": "hand"})
        self.assertNotIn("CLOCK_WORD", pending_keys(built))
        clock_at, clock_text = copy.starts["clock"] + 24, f"lw $a2, {CLOCK}($at)"
        built = mapped(copy, hand(ABSENT={mode_use: (at, text, "as above"), clock_use: (clock_at, clock_text, "and the clock's reads another")}))
        self.assertEqual(pending_keys(built)["CLOCK_WORD"]["why"], "no instruction reaching it is placed")

    def test_an_absent_check_is_taken_at_a_check_or_a_words_reacher_and_refused_elsewhere(self):
        copy = executable(gaps=GAPS)
        s, c, text = US.starts, copy.starts, copy.listing.text

        def row(at):
            return at, text[copy.listing.position(at)], "the copy lays this out otherwise"
        for addr, at in ((US.places["the pill tests its word"], copy.places["the pill tests its word"]), (s["mode"] + 16, c["mode"] + 16)):
            built = mapped(copy, hand(ABSENT={addr: row(at)}))
            self.assertEqual(built["rows"][f"0x{addr:08x}"], {"absent": True, "at": f"0x{at:08x}", "word": f"0x{copy.listing.code.word(at):08x}",
                                                            "text": text[copy.listing.position(at)], "tier": "hand"})
        for what, addr, at in (("a registered instruction", s["twin"] + 24, c["twin"] + 24), ("a run's flank", s["mode"] + 52, c["mode"] + 52),
                               ("a table's entry", s["vanish"], c["vanish"])):
            with self.subTest(what):
                with self.assertRaises(SystemExit) as stopped:
                    mapped(copy, hand(ABSENT={addr: row(at)}))
                self.assertEqual(str(stopped.exception), f"the hand table's absent rows name 0x{addr:08x}, which no reader lists")

    def test_a_registered_run_is_read_as_the_hand_gives_it(self):
        copy = executable(gaps=GAPS)
        at = copy.starts["mode"] + 56
        self.assertEqual(mapped(copy)["names"]["FILL"], [f"0x{at:08x}", 2, "v1", "v0"])
        built = mapped(copy, hand(MULTIPLIERS={"FILL": (at, 1, "v1", "v0", "the run read as one shift")}))
        self.assertEqual(built["names"]["FILL"], [f"0x{at:08x}", 1, "v1", "v0"])
        self.assertEqual(built["pending"], [])

    def test_a_run_row_named_for_an_entry_of_several_runs_stops_the_writer(self):
        copy = executable(gaps=GAPS)
        fills = ((US.starts["mode"] + 56, 2, "v1", "v0"), (US.starts["pill"] + 24, 2, "v1", "v0"))
        modules = (SimpleNamespace(**{**vars(FIXTURE), "NAMED": {**FIXTURE.NAMED, "FILLS": ("run", fills)}}),)
        self.assertEqual(len(mapped(copy, modules=modules)["names"]["FILLS"]), 2)
        with self.assertRaises(SystemExit) as stopped:
            mapped(copy, hand(MULTIPLIERS={"FILLS": (copy.starts["mode"] + 56, 2, "v1", "v0", "one run given for two")}), modules=modules)
        self.assertEqual(str(stopped.exception), f"the hand table's multiplier row FILLS names 2 runs, at 0x{fills[0][0]:08x} and "
                                                 f"0x{fills[1][0]:08x}, and a named row places one")

    def test_a_hand_run_laid_outside_the_executable_stops_the_writer(self):
        copy = executable(gaps=GAPS)
        end = copy.listing.code.base + len(copy.listing.code.blob)
        for key, at, n in (("FILL", end, 1), ("mode.fill", end - 4, 2)):
            with self.subTest(key):
                with self.assertRaises(SystemExit) as stopped:
                    mapped(copy, hand(MULTIPLIERS={key: (at, n, "v1", "v0", "a run past the end")}))
                self.assertEqual(str(stopped.exception),
                                 f"the hand table's multiplier row {key} lays {n} instructions at 0x{at:08x}, outside the executable")


class Files(unittest.TestCase):
    def test_the_map_is_written_a_row_to_a_line_and_the_check_holds_it_to_the_discs(self):
        copy = executable(gaps=GAPS)
        built = mapped(copy)
        with tempfile.TemporaryDirectory() as out:
            path = Path(out) / "eu.json"
            dump(built, path)
            text = path.read_text()
            self.assertEqual(json.loads(text), json.loads(json.dumps(built)))
            self.assertEqual(len([line for line in text.splitlines() if line.startswith('  "0x')]), len(built["rows"]))
            with redirect_stdout(io.StringIO()) as said:
                check(built, path)
            self.assertIn("holds what the discs and the hand table give", said.getvalue())
            changed = json.loads(text)
            key = f"0x{US.places['pill.lethargy']:08x}"
            changed["rows"][key]["word"] = "0x24020169"
            path.write_text(json.dumps(changed))
            with self.assertRaises(SystemExit) as stopped:
                check(built, path)
            self.assertIn(f"rows {key} holds", str(stopped.exception))

    def test_the_check_refuses_a_map_with_pending_rows_counting_them(self):
        one = executable(gaps=GAPS, routines={"twin": lambda c: twin(c, count=10)})
        two = executable(gaps=GAPS, routines={"twin": lambda c: twin(c, count=10), "pill": lambda c: pill(c, counts=(360, 841))})
        for copy, said in ((one, " has 1 pending row"), (two, " has 2 pending rows")):
            built = mapped(copy)
            with tempfile.TemporaryDirectory() as out, self.subTest(said):
                path = Path(out) / "eu.json"
                dump(built, path)
                with self.assertRaises(SystemExit) as stopped:
                    check(built, path)
                self.assertTrue(str(stopped.exception).endswith(said), str(stopped.exception))

    def test_the_report_lists_the_pending_then_the_hands_rows_then_the_loosely_placed(self):
        copy = executable(gaps=GAPS, routines={"twin": lambda c: twin(c, count=10)})
        with redirect_stdout(io.StringIO()) as said:
            report(mapped(copy))
        text = said.getvalue()
        self.assertTrue(text.startswith("pending: 1\n  address 0x"))
        self.assertEqual([line for line in text.splitlines() if line and not line.startswith("  ")],
                         ["pending: 1", "tuned: 0", "absent: 0", "shift: 0", "reshaped: 0", "renamed or loose: 0"])


class Base(unittest.TestCase):
    def test_the_bases_values_are_read_by_address_and_key_and_a_committed_row_the_base_no_longer_reads_is_named(self):
        values = base_values(US.listing.code, (FIXTURE,))
        s = US.starts
        self.assertEqual(values[US.places["pill.lethargy"], "pill.lethargy"], 360)
        self.assertEqual(values[s["pill"] + 4 * 6, "pill.fill"], 5)
        self.assertEqual((values[s["clock"] + 12, "clock.shown"], values[s["clock"] + 40, "clock.grey"]), (60, 128))
        built = mapped(executable(gaps=GAPS))
        with tempfile.TemporaryDirectory() as out:
            path = Path(out) / "eu.json"
            dump(built, path)
            check_base(US.listing.code, path, (FIXTURE,))
            changed = json.loads(path.read_text())
            key = f"0x{US.places['pill.lethargy']:08x}"
            changed["rows"][key]["us"] = 361
            path.write_text(json.dumps(changed))
            with self.assertRaises(SystemExit) as stopped:
                check_base(US.listing.code, path, (FIXTURE,))
            self.assertIn(f"pill.lethargy at {key} holds the base's value as 361, where the base's executable reads 360",
                          str(stopped.exception))

    def test_a_map_with_pending_rows_is_held_by_the_rows_it_has_and_its_pending_block_passed_over(self):
        built = mapped(executable(gaps=GAPS, routines={"twin": lambda c: twin(c, count=10)}))
        self.assertTrue(built["pending"])
        with tempfile.TemporaryDirectory() as out:
            path = Path(out) / "eu.json"
            dump(built, path)
            check_base(US.listing.code, path, (FIXTURE,))
            changed = json.loads(path.read_text())
            key = f"0x{US.places['pill.lethargy']:08x}"
            changed["rows"][key]["us"] = 361
            path.write_text(json.dumps(changed))
            with self.assertRaises(SystemExit) as stopped:
                check_base(US.listing.code, path, (FIXTURE,))
            self.assertIn(f"pill.lethargy at {key}", str(stopped.exception))


class Registries(unittest.TestCase):
    def test_every_registry_entry_of_every_module_names_a_kind_the_writer_knows_and_holds_a_leaf_of_it(self):
        entries = registries(MODULES)
        self.assertEqual({e.module for e in entries}, {m.__name__ for m in MODULES} - {"kula_motion_blocks"})
        for e in entries:
            with self.subTest(f"{e.module}.{e.name}"):
                self.assertIn(e.kind, KINDS)
                self.assertTrue(list(leaves(e.kind, e.value)))
                self.assertTrue(e.kind == "offset" or not e.keys)

    def test_a_kind_the_writer_does_not_know_stops_it(self):
        with self.assertRaises(SystemExit):
            registries([SimpleNamespace(__name__="odd", NAMED={"X": ("byte", 0x80010000)})])

    def test_an_entry_whose_keys_are_a_bare_string_stops_it(self):
        with self.assertRaises(SystemExit) as stopped:
            registries([SimpleNamespace(__name__="odd", NAMED={"X": ("offset", (GP + MODE, MODE), "mode.at")})])
        self.assertEqual(str(stopped.exception), "odd.NAMED['X'] gives its keys as 'mode.at', a bare string and not a tuple of them")

    def test_a_leaf_is_told_by_its_shape_alone(self):
        self.assertTrue(FITS["pair"]((1, 2)) and FITS["offset"]((1, 2)) and not FITS["pair"](((1, 2), 4)))
        self.assertTrue(FITS["matched"]((1, "lui $v0, {}")) and not FITS["matched"]((1, 2)))
        self.assertTrue(FITS["run"]((1, 3, "v1", "v0")) and FITS["table"]((1, 0, 9)) and not FITS["table"]((1, 2)))
        self.assertEqual(list(leaves("pair", {5: ((1, 2), 4), 7: ((3, 4), 1)})), [(1, 2), (3, 4)])


if __name__ == "__main__":
    unittest.main()
