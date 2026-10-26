"""Unit tests for the release reader: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import io
import struct
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_disc import RELEASES  # noqa: E402
from kula_motion_code import Code  # noqa: E402
from kula_release import (ABSENT, CHECKS, CLOCK_WORD, DIVISORS, GROUPS, IMMEDIATES, MULTIPLIERS, VIDEO,  # noqa: E402
                          readings, rules, show_readings)
from motion_fixture import addiu, addu, lw  # noqa: E402

# Each executable's size and its words at the readings, a stretch at a time from its first word's address.
SIZE = {"us": 610304, "eu": 604160, "jp": 593920}
WORDS = {
    "us": {
        0x80035f78: [0x84830000, 0x2402029a, 0x14620009, 0x00000000, 0x8483000c, 0x00000000, 0x00031040, 0x00431021,
                     0x000210c0, 0x00431021, 0x0800d7eb, 0x00021040, 0x24021356, 0x3c01000a, 0xac22573c, 0x0c00d560],
        0x8001e310: [0x08007ae7, 0x3c028888],
        0x8001eb9c: [0x8f832804, 0x34428889, 0x00620018, 0x00007010, 0x01c31021, 0x00021143, 0x00031fc3, 0x00431023,
                     0x244c0001, 0x29820033, 0x10400059],
        0x80039048: [0x24040023, 0x00002821, 0x3c06000a, 0x24c6335c, 0x0c01376f, 0x24071b58, 0x3c0451eb, 0x3484851f,
                     0x3c03000a, 0x8c63573c, 0x2402176f, 0x00431023, 0x00440018, 0x3c05000a, 0x24a53364, 0x00003021,
                     0x3c01000a, 0xac3255c8, 0x3c01000a, 0xac22573c, 0x000217c3, 0x00005810, 0x000b1903, 0x00621823,
                     0x00031080, 0x00431021, 0x3c03000a, 0x8c6353c8, 0x00021040, 0x00621821, 0x3c01000a, 0xac2353c8,
                     0x0c004631, 0x24040001],
        0x800478c8: [0x3c02000a, 0x8c423454, 0x00000000, 0x1440000a, 0x00000000, 0x3c02000a, 0x8c423410, 0x3c04000a,
                     0x8c843408, 0x00021900, 0x00621823, 0x00832021, 0x08011e47, 0x24860001, 0x3c02000a, 0x8c423410,
                     0x3c03000a, 0x8c633408, 0x00021040, 0x00621821, 0x24660097, 0x3c03000a],
        0x8004e9fc: [0x0c019a1a, 0x00002021],
    },
    "eu": {
        0x800367d0: [0x84830000, 0x2402029a, 0x14620009, 0x00000000, 0x8483000c, 0x00000000, 0x00031040, 0x00431021,
                     0x000210c0, 0x00431021, 0x0800da01, 0x00021040, 0x24021356, 0x3c01000a, 0xac2252c8, 0x0c00d777],
        0x8001ebec: [0x08007d1e, 0x3c0251eb],
        0x8001f478: [0x8f8328e8, 0x3442851f, 0x00620018, 0x00031fc3, 0x00007010, 0x000e1103, 0x00431023, 0x244c0001,
                     0x29820033, 0x10400059],
        0x800398cc: [0x24040023, 0x00002821, 0x3c06000a, 0x24c62df4, 0x0c013adb, 0x24071b58, 0x3c0451eb, 0x3484851f,
                     0x3c03000a, 0x8c6352c8, 0x24021387, 0x00431023, 0x00440018, 0x3c05000a, 0x24a52dfc, 0x00003021,
                     0x3c01000a, 0xac325154, 0x3c01000a, 0xac2252c8, 0x000217c3, 0x00005810, 0x000b1903, 0x00621823,
                     0x00031080, 0x00431021, 0x3c03000a, 0x8c634f54, 0x00021040, 0x00621821, 0x3c01000a, 0xac234f54,
                     0x0c0049c7, 0x24040001],
        0x80048034: [0x3c02000a, 0x8c422edc, 0x00000000, 0x1440000a, 0x00000000, 0x3c02000a, 0x8c422ea8, 0x3c04000a,
                     0x8c842ea0, 0x00021900, 0x00621823, 0x00832021, 0x08012022, 0x24860001, 0x3c02000a, 0x8c422ea8,
                     0x3c03000a, 0x8c632ea0, 0x00021040, 0x00621821, 0x24660097, 0x3c03000a],
        0x8004f7ac: [0x0c019cdc, 0x24040001],
    },
    "jp": {
        0x800362cc: [0x84830000, 0x2402029a, 0x14620007, 0x00000000, 0x8483000c, 0x00000000, 0x00031100, 0x00431023,
                     0x0800d8be, 0x00021080, 0x24021be4, 0x3c01000a, 0xac2212ec, 0x3c03000a, 0x8c6312ec, 0x24021734,
                     0x14620003, 0x24021be4, 0x3c01000a, 0xac2212ec],
        0x8001eee8: [0x10600007, 0x3c028888],
        0x8001f65c: [0x8f832288, 0x34428889, 0x00620018, 0x00007010, 0x01c31021, 0x00021143, 0x00031fc3, 0x00431023,
                     0x244c0001, 0x29820033, 0x10400059],
        0x80039684: [0x24040023, 0x00002821, 0x3c06000a, 0x24c6f468, 0x0c01434c, 0x24071b58, 0x24040001, 0x3c05000a,
                     0x24a5f470, 0x3c03000a, 0x8c6312ec, 0x00801021, 0x3c01000a, 0xac2212d8, 0x24021c1f, 0x00431023,
                     0x3c01000a, 0xac2212ec, 0x0c0045e0, 0x00003021, 0x87842b60, 0x87852b62, 0x87862b64, 0x87872b66,
                     0x0c00b88d, 0x00000000, 0x2404000a, 0x8f832b54, 0x00403021, 0x00032840, 0x00a32821, 0x00052900,
                     0x0c0045e0, 0x00b02821, 0x8f822b5c, 0x00000000],
        0x80046cc4: [0x3c02000a, 0x8c42f55c, 0x00000000, 0x1440000a, 0x00000000, 0x3c02000a, 0x8c42f514, 0x3c04000a,
                     0x8c84f50c, 0x00021900, 0x00621823, 0x00832021, 0x08011b46, 0x24860001, 0x3c02000a, 0x8c42f514,
                     0x3c03000a, 0x8c63f50c, 0x00021040, 0x00621821, 0x24660097, 0x28c20064],
        0x80051e08: [0x0c01a694, 0x00002021],
    },
}

# The rules each executable's words read as, and the clock word they reach.
RULES = {
    "us": {"hz": 60, "clock": {"fill": 50, "default": 4950, "swap": None, "shown": 60},
           "hourglass": {"from": 5999, "second": 50, "points": 10},
           "pause": {"levels": 15, "finals": 2, "firstFinal": 151}},
    "eu": {"hz": 50, "clock": {"fill": 50, "default": 4950, "swap": None, "shown": 50},
           "hourglass": {"from": 4999, "second": 50, "points": 10},
           "pause": {"levels": 15, "finals": 2, "firstFinal": 151}},
    "jp": {"hz": 60, "clock": {"fill": 60, "default": 7140, "swap": [5940, 7140], "shown": 60},
           "hourglass": {"from": 7199, "second": None, "points": None},
           "pause": {"levels": 15, "finals": 2, "firstFinal": 151}},
}
CLOCK = {"us": 0x800a573c, "eu": 0x800a52c8, "jp": 0x800a12ec}
READINGS = IMMEDIATES + MULTIPLIERS + DIVISORS


def executable(release, changed=()):
    """The release's executable: zeros, which decode as nop, but for its stretches and the words changed."""
    base = RELEASES[release]["base"]
    blob = bytearray(SIZE[release])
    for start, words in WORDS[release].items():
        struct.pack_into(f"<{len(words)}I", blob, start - base, *words)
    for addr, word in changed:
        struct.pack_into("<I", blob, addr - base, word)
    return Code(bytes(blob), base)


def touched(release):
    """Every instruction a release's readings match, with the register a load there overwrites, keyed by the address
    the reading's sentence names."""
    call = VIDEO[release][0]
    out = {call: [(call, "v0")], call + 4: [(call + 4, "a0")]}
    for _, _, where in CHECKS:
        if release in where:
            out[where[release]] = [(where[release], "v0")]
    for _, _, _, _, where in IMMEDIATES:
        if release in where:
            out[where[release]] = [(where[release], "v0")]
    for _, _, _, _, dst, where in MULTIPLIERS:
        if release in where:
            addr, count = where[release]
            out[addr] = [(addr + 4 * i, dst) for i in range(count)]
    for _, _, _, _, _, where in DIVISORS:
        if release in where:
            for addr in where[release][:3]:
                out[addr] = [(addr, "v0")]
    for _, _, _, where in ABSENT:
        if release in where:
            out[where[release][0]] = [(where[release][0], "v0")]
    for name, addrs in CLOCK_WORD[release].items():
        for addr in [addrs] if name == "hud" else addrs:
            out[addr] = [(addr, "v0")]
    return out


class Rules(unittest.TestCase):
    def test_each_executable_reads_as_its_rules_and_reaches_one_clock_word(self):
        for release in RELEASES:
            with self.subTest(release):
                self.assertEqual(rules(executable(release), release), RULES[release])
                self.assertEqual(readings(executable(release), release)["clock.word"], CLOCK[release])

    def test_a_changed_word_at_any_reading_stops_it_naming_the_readings_address(self):
        for release in RELEASES:
            for named, words in touched(release).items():
                for addr, reg in words:
                    with self.subTest(release=release, addr=hex(addr)):
                        with self.assertRaises(SystemExit) as caught:
                            rules(executable(release, [(addr, lw(reg, "sp", 0))]), release)
                        self.assertIn(f"0x{named:08x}", str(caught.exception.code))

    def test_the_video_modes_argument_is_read_through_either_instruction_that_loads_it(self):
        us, eu = VIDEO["us"][0] + 4, VIDEO["eu"][0] + 4
        self.assertEqual(rules(executable("us", [(us, addiu("a0", "zero", 1))]), "us")["hz"], 50)
        self.assertEqual(rules(executable("eu", [(eu, addu("a0", "zero", "zero"))]), "eu")["hz"], 60)
        with self.assertRaises(SystemExit) as caught:
            rules(executable("eu", [(eu, addiu("a0", "zero", 2))]), "eu")
        self.assertIn(f"0x{eu:08x} sets video mode 2", str(caught.exception.code))

    def test_a_routine_reaching_another_word_than_the_clock_stops_the_reading(self):
        hud = CLOCK_WORD["us"]["hud"]
        with self.assertRaises(SystemExit) as caught:
            readings(executable("us", [(hud, lw("v1", "gp", 10248))]), "us")
        self.assertEqual(caught.exception.code,
                         f"0x{hud:08x} reaches the clock at 0x800a5740, not 0x800a573c where the start fills it")

    def test_the_printout_names_every_check_and_every_reading(self):
        for release in RELEASES:
            with self.subTest(release):
                out = io.StringIO()
                with redirect_stdout(out):
                    show_readings(executable(release), release)
                text = out.getvalue()
                shown = [VIDEO[release][0] + 4, CLOCK_WORD[release]["hud"]]
                shown += [entry[-1][release] for entry in CHECKS + IMMEDIATES if release in entry[-1]]
                shown += [entry[-1][release][0] for entry in MULTIPLIERS + DIVISORS + ABSENT if release in entry[-1]]
                for addr in shown:
                    self.assertIn(f"0x{addr:08x}", text)
                for group in GROUPS:
                    self.assertIn(f"\n{group}\n", text)
                self.assertTrue(text.endswith(f": a frame is 1/{RULES[release]['hz']} s\n"))


class Tables(unittest.TestCase):
    def test_every_reading_is_read_on_each_release_or_its_absence_is(self):
        keys = sorted({entry[1] for entry in READINGS})
        for release in RELEASES:
            with self.subTest(release):
                read = [entry[1] for entry in READINGS if release in entry[-1]]
                absent = [key for _, keys_, _, where in ABSENT if release in where for key in keys_]
                self.assertEqual(sorted(read + absent), keys)
                self.assertIn(release, VIDEO)
                self.assertEqual(set(CLOCK_WORD[release]) - {"swap"}, {"start", "hud", "hourglass"})

    def test_every_entry_names_only_the_releases_and_its_group_is_one_of_the_printouts(self):
        for entry in CHECKS + READINGS + ABSENT:
            self.assertLessEqual(set(entry[-1]), set(RELEASES))
        for entry in READINGS + ABSENT:
            self.assertIn(entry[0], GROUPS)
        self.assertEqual(set(VIDEO) | set(CLOCK_WORD), set(RELEASES))


if __name__ == "__main__":
    unittest.main()
