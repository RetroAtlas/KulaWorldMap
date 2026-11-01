"""Unit tests for the readers over every committed map: python3 -m unittest discover -s tools/tests

Nothing here needs the disc: a map's rows carry the words they were read from, which lay out an executable of the
release's size to read back through the map.
"""

import json
import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_disc import BASE, RELEASES  # noqa: E402
from kula_motion_code import MAPS, Code, Map, beside, registry, unhex  # noqa: E402
from mips import decode  # noqa: E402
from motion_fixture import SIZE  # noqa: E402

COMMITTED = {path.stem: json.loads(path.read_text()) for path in sorted(MAPS.glob("*.json"))}


def listed(v):
    return v if isinstance(v, list) else [v]


def laid(release, data):
    """The release's executable as the map's words lay it, every other word nothing."""
    base = RELEASES[release]["base"]
    blob = bytearray(SIZE[release])
    for row in data["rows"].values():
        if "count" in row:
            places = [(unhex(row["at"]) + 4 * i, word) for i, word in enumerate(row["words"])]
        else:
            places = [(unhex(at), word) for at, word in zip(listed(row["at"]), listed(row["word"]))]
        for at, word in places:
            struct.pack_into("<I", blob, at - base, unhex(word))
    return blob


def read_back(code, us, row):
    """A keyed row's value as a reader reads it, by the base's address alone, the parts it would pass left blank."""
    if "count" in row:
        return code.multiplier(us, 0, "", "")
    if "shift" in row:
        return code.divisor(us, "", 0, "", 0, "")
    if isinstance(row["at"], list):
        reader = code.divisor if len(row["at"]) == 3 else code.grey
        return reader(us, *[0] * (2 * len(row["at"]) - 1))
    return code.immediate(us, "")


def shape(v):
    """A value with every number and every word blanked, which is what is left of its nesting."""
    if isinstance(v, dict):
        return {k: shape(x) for k, x in v.items()}
    if isinstance(v, tuple):
        return tuple(shape(x) for x in v)
    return type(v)


class Maps(unittest.TestCase):
    def test_a_map_is_committed_for_a_release_other_than_the_base(self):
        self.assertTrue(COMMITTED)
        self.assertNotIn(BASE, COMMITTED)
        self.assertFalse(Map.exists(BASE))
        for release in COMMITTED:
            self.assertTrue(Map.exists(release))
            self.assertEqual(Map.load(release).release, release)

    def test_every_rows_word_decodes_to_its_text(self):
        for release, data in COMMITTED.items():
            for us, row in data["rows"].items():
                if "text" not in row:
                    continue
                for at, word, text in zip(listed(row["at"]), listed(row["word"]), listed(row["text"])):
                    with self.subTest(release=release, row=us):
                        self.assertEqual(decode(unhex(word), unhex(at))[0], text)

    def test_every_keyed_row_reads_its_value_through_the_map_at_its_place(self):
        for release, data in COMMITTED.items():
            code = Code.of(release, bytes(laid(release, data)), Map(data))
            for us, row in data["rows"].items():
                if "value" not in row:
                    continue
                with self.subTest(release=release, key=row["key"]):
                    self.assertEqual(read_back(code, unhex(us), row), row["value"])
                    self.assertEqual(code.at(unhex(us)), unhex(listed(row["at"])[0]))

    def test_a_registered_instruction_is_read_by_the_maps_pattern_at_its_place_whatever_row_stands_there(self):
        for release, data in COMMITTED.items():
            code = Code.of(release, bytes(laid(release, data)), Map(data))
            for name, (kind, value) in registry().items():
                if kind != "matched":
                    continue
                for ours, theirs in beside(kind, value, data["names"][name]):
                    for us, pattern, at, kept in zip(ours[::2], ours[1::2], theirs[::2], theirs[1::2]):
                        with self.subTest(release=release, name=name, us=f"0x{us:08x}"):
                            self.assertEqual(code.place(us, pattern), (unhex(at), kept))
                            self.assertIn("{}", kept)
                            if f"0x{us:08x}" in data["rows"]:
                                self.assertIsNotNone(code.immediate(us, pattern))

    def test_a_registered_instruction_the_map_keeps_no_pattern_for_is_read_by_the_readers_own_whatever_row_stands_there(self):
        for release, data in COMMITTED.items():
            code = Code.of(release, bytes(laid(release, data)), Map(data))
            for name, (kind, value) in registry().items():
                if kind != "instruction":
                    continue
                for us, at in beside(kind, value, data["names"][name]):
                    with self.subTest(release=release, name=name, us=f"0x{us:08x}"):
                        placed, pattern = code.place(us, "{}")
                        self.assertEqual(placed, unhex(at))
                        self.assertIn("{}", pattern)

    def test_an_absent_row_reads_none_through_every_reader_once_the_instruction_it_names_stands_there(self):
        for release, data in COMMITTED.items():
            code = Code.of(release, bytes(laid(release, data)), Map(data))
            for us, row in data["rows"].items():
                if not row.get("absent"):
                    continue
                with self.subTest(release=release, key=row["key"]):
                    self.assertIsNone(code.immediate(unhex(us), ""))
                    self.assertIsNone(code.multiplier(unhex(us), 0, "", ""))
                    self.assertIsNone(code.divisor(unhex(us), "", 0, "", 0, ""))

    def test_a_changed_word_at_a_keyed_or_an_absent_rows_place_stops_the_reader_naming_it(self):
        for release, data in COMMITTED.items():
            keyed = next((us, row) for us, row in data["rows"].items() if "pattern" in row and isinstance(row["at"], str))
            absent = next((us, row) for us, row in data["rows"].items() if row.get("absent"))
            for us, row in (keyed, absent):
                blob = laid(release, data)
                struct.pack_into("<I", blob, unhex(row["at"]) - RELEASES[release]["base"], 0xFFFFFFFF)
                with self.subTest(release=release, key=row["key"]):
                    with self.assertRaises(SystemExit) as stopped:
                        Code.of(release, bytes(blob), Map(data)).immediate(unhex(us), "")
                    self.assertIn(row["at"], str(stopped.exception))
                    self.assertIn(us, str(stopped.exception))

    def test_every_registered_constant_has_its_value_in_the_map_in_the_registrys_shape(self):
        for release, data in COMMITTED.items():
            self.assertEqual(sorted(data["names"]), sorted(registry()))
            code = Code.of(release, bytes(SIZE[release]), Map(data))
            for name, (_, value) in registry().items():
                with self.subTest(release=release, name=name):
                    self.assertEqual(shape(code.named(name)), shape(value))

    def test_a_map_with_pending_rows_is_refused(self):
        for release, data in COMMITTED.items():
            left = [{"address": "0x80010000", "module": "kula_motion_code", "list": "CHECKS", "key": "twin.count", "why": "left"}]
            with self.assertRaises(SystemExit) as refused:
                Map({**data, "pending": left})
            self.assertIn("twin.count", str(refused.exception))


if __name__ == "__main__":
    unittest.main()
