"""Unit tests holding the fixture's readings of another release to the relations the map writer accepts:
python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_align import MODULES  # noqa: E402
from kula_map import relation  # noqa: E402
from kula_map_hand import ABSENT, SHIFTS, TUNED, WORDS  # noqa: E402
from kula_motion_code import Code, Map  # noqa: E402
from motion_fixture import GAME, GAME_EU  # noqa: E402

RELEASE = "eu"
RELEASES = Path(__file__).resolve().parents[2] / "public" / "releases"
RAM = range(0x80000000, 0x80200000)


def hz(release):
    return json.loads((RELEASES / f"{release}.json").read_text())["rules"]["hz"]


RATES = (hz("us"), hz(RELEASE))
KEYED = {entry[1] for module in MODULES for name in ("IMMEDIATES", "MULTIPLIERS", "DIVISORS", "GREYS")
         for entry in getattr(module, name, ())}
OFFSETS = {key: name for module in MODULES for name, entry in module.NAMED.items()
           if entry[0] == "offset" for key in (entry[2] if len(entry) > 2 else ())}
ABSENT_KEYS = {key for keys in ABSENT[RELEASE] for key in (keys if isinstance(keys, tuple) else (keys,))}
OVERRIDES = {key: value for key, value in GAME_EU.items() if value != GAME[key]}


def addressed(value):
    """Whether the value is an address in RAM, a sequence of them with a pointer of nothing allowed among them, or a
    table keyed by them."""
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return value in RAM
    if isinstance(value, (list, tuple)):
        return bool(value) and all(v == 0 or addressed(v) for v in value)
    if isinstance(value, dict):
        return bool(value) and all(addressed(k) for k in value)
    return False


def shape(value):
    """A value with every number and every word blanked, which is what is left of its nesting."""
    if isinstance(value, dict):
        return {k: shape(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [shape(v) for v in value]
    return type(value)


def relation_of(key, us, value):
    """How a reading of the fixture's other release stands to the base's: a keyed row's as the map writer relates it,
    None where the hand table lists the reading as absent, the map's places for a registered name, the hand table's
    words for the end screen's pairs, an address or a structure of addresses the release's own, and a word of the
    release's own data in the base's shape; None where it stands in none of these."""
    if key in ABSENT_KEYS:
        return "absent" if value is None else None
    if value is None:
        return None
    if key in KEYED:
        address = None
        if key in OFFSETS:
            word, _ = GAME_EU["names"][OFFSETS[key]]
            address = word - GAME_EU["gp"]
        return relation(key, us, value, RATES, TUNED[RELEASE], address)
    if key == "names":
        return "names" if value == Code(b"", map=Map.load(RELEASE)).names() else None
    if key == "words":
        return "words" if value == WORDS[RELEASE] else None
    if addressed(value):
        return "address"
    return "data" if shape(value) == shape(us) else None


class Overrides(unittest.TestCase):
    def test_the_fixture_holds_every_key_of_the_bases_for_the_other_release_and_overrides_some(self):
        self.assertEqual(set(GAME_EU), set(GAME))
        self.assertTrue(OVERRIDES)

    def test_every_override_stands_in_a_relation_the_map_writer_accepts(self):
        for key, value in sorted(OVERRIDES.items()):
            with self.subTest(key=key):
                self.assertIsNotNone(relation_of(key, GAME[key], value),
                                     f"{key}: {value!r} stands in no relation to the base's {GAME[key]!r}")

    def test_the_overrides_reach_every_relation_and_agree_with_the_hand_table_on_the_tuned_and_the_absent(self):
        by = {key: relation_of(key, GAME[key], value) for key, value in OVERRIDES.items()}
        self.assertLessEqual({"rate", "count", "tuned", "absent", "address", "names", "words", "data"}, set(by.values()))
        self.assertEqual({key for key, how in by.items() if how == "absent"}, ABSENT_KEYS & set(GAME))
        self.assertEqual({key for key, how in by.items() if how == "tuned"}, set(TUNED[RELEASE]) & set(GAME))
        for key, why in TUNED[RELEASE].items():
            self.assertTrue(why.strip(), key)

    def test_a_divisor_the_release_lays_out_as_a_shift_fits_a_count_and_is_read_as_a_number(self):
        self.assertEqual((relation_of("vanish.in.by", 9, 8), relation_of("vanish.out.by", 19, 16)), ("count", "count"))
        self.assertTrue(SHIFTS[RELEASE])
        for key in SHIFTS[RELEASE]:
            self.assertIsInstance(GAME_EU[key], int, key)
            self.assertNotIn(key, ABSENT_KEYS)

    def test_a_value_scaled_otherwise_an_absence_the_hand_table_does_not_list_or_a_word_not_the_hands_fails(self):
        self.assertIsNone(relation_of("spikes.rise", 5, 3))
        self.assertIsNone(relation_of("roll.gain", 6, 9))
        self.assertIsNone(relation_of("fall.gain", -5, None))
        self.assertIsNone(relation_of("jump.skip", 2, 1))
        self.assertIsNone(relation_of("mode.at", 9372, 9604))
        self.assertIsNone(relation_of("words", GAME["words"], {**GAME["words"], 12: "ACID!"}))
        self.assertIsNone(relation_of("effect.hud.at", GAME["effect.hud.at"], {"clock": [160, 26, -1]}))
        self.assertEqual(relation_of("spikes.rise", 5, 4), "count")
        self.assertEqual(relation_of("roll.gain", 6, 7), "rate")
        self.assertEqual(relation_of("mode.at", 9372, 9600), "address")


if __name__ == "__main__":
    unittest.main()
