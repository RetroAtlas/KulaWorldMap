"""Unit tests holding the fixture's readings of the other releases to the relations the map writer accepts for each:
python3 -m unittest discover -s tools/tests

Nothing here needs the disc. The names relation holds the registry's names to the map's places, which the map writer
wrote from the same registry, so it guards the fixture's copy of them and nothing of the disc; the address relation
accepts any address in RAM.
"""

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_align import MODULES  # noqa: E402
from kula_map import relation  # noqa: E402
from kula_map_hand import ABSENT, SHIFTS, TUNED, WORDS  # noqa: E402
from kula_motion_code import Readings  # noqa: E402
from kula_skins import hiding  # noqa: E402
from motion_fixture import GAME, GAME_EU, GAME_JP, names_on  # noqa: E402

RELEASE_FILES = Path(__file__).resolve().parents[2] / "public" / "releases"
RAM = range(0x80000000, 0x80200000)
KEYED = {entry[1] for module in MODULES for name in ("IMMEDIATES", "MULTIPLIERS", "DIVISORS", "GREYS")
         for entry in getattr(module, name, ())}
OFFSETS = {key: name for module in MODULES for name, entry in module.NAMED.items()
           if entry[0] == "offset" for key in (entry[2] if len(entry) > 2 else ())}


def hz(release):
    return json.loads((RELEASE_FILES / f"{release}.json").read_text())["rules"]["hz"]


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


class Release:
    """One release's fixture beside what its overrides are held to: the base's frame rate and its own, the keys the
    hand table tunes and the ones it lists as absent, and its map's places for the registry's names."""

    def __init__(self, release, game):
        self.release, self.game = release, game
        self.rates = (hz("us"), hz(release))
        self.tuned = TUNED[release]
        self.absent = {key for keys in ABSENT[release] for key in (keys if isinstance(keys, tuple) else (keys,))}
        self.overrides = {key: value for key, value in game.items() if value != GAME[key]}
        self.names = names_on(release)

    def relation_of(self, key, us, value):
        """How a reading of the release stands to the base's: a keyed row's as the map writer relates it, None where
        the hand table lists the reading as absent, the map's places for a registered name, the hand table's words for
        the end screen's pairs, an address or a structure of addresses the release's own, and a word of the release's
        own data in the base's shape; None where it stands in none of these."""
        if key in self.absent:
            return "absent" if value is None else None
        if value is None:
            return None
        if key in KEYED:
            address = None
            if key in OFFSETS:
                word, _ = self.game["names"][OFFSETS[key]]
                address = word - self.game["gp"]
            return relation(key, us, value, self.rates, self.tuned, address)
        if key == "names":
            return "names" if value == self.names else None
        if key == "words":
            return "words" if value == WORDS[self.release] else None
        if addressed(value):
            return "address"
        return "data" if shape(value) == shape(us) else None


EU, JP = Release("eu", GAME_EU), Release("jp", GAME_JP)
REACHED = {"eu": {"rate", "count", "tuned", "absent", "address", "names", "words", "data"},
           "jp": {"tuned", "absent", "address", "names", "words"}}


class Overrides(unittest.TestCase):
    def test_the_fixture_holds_every_key_of_the_bases_for_each_other_release_and_overrides_some(self):
        for r in (EU, JP):
            with self.subTest(release=r.release):
                self.assertEqual(set(r.game), set(GAME))
                self.assertTrue(r.overrides)

    def test_every_override_stands_in_a_relation_the_map_writer_accepts(self):
        for r in (EU, JP):
            for key, value in sorted(r.overrides.items()):
                with self.subTest(release=r.release, key=key):
                    self.assertIsNotNone(r.relation_of(key, GAME[key], value),
                                         f"{key}: {value!r} stands in no relation to the base's {GAME[key]!r}")

    def test_the_overrides_reach_every_relation_the_writer_offers_the_release_and_agree_with_the_hand_table(self):
        for r in (EU, JP):
            with self.subTest(release=r.release):
                by = {key: r.relation_of(key, GAME[key], value) for key, value in r.overrides.items()}
                self.assertEqual(set(by.values()), REACHED[r.release])
                self.assertEqual({key for key, how in by.items() if how == "absent"}, r.absent & set(GAME))
                self.assertEqual({key for key, how in by.items() if how == "tuned"}, set(r.tuned) & set(GAME))
                for key, why in r.tuned.items():
                    self.assertTrue(why.strip(), key)

    def test_a_divisor_the_pal_executable_lays_out_as_a_shift_fits_a_count_and_is_read_as_a_number(self):
        self.assertEqual((EU.relation_of("vanish.in.by", 9, 8), EU.relation_of("vanish.out.by", 19, 16)), ("count", "count"))
        self.assertTrue(SHIFTS["eu"])
        for key in SHIFTS["eu"]:
            self.assertIsInstance(GAME_EU[key], int, key)
            self.assertNotIn(key, EU.absent)

    def test_a_value_scaled_otherwise_an_absence_the_hand_table_does_not_list_or_a_word_not_the_hands_fails(self):
        self.assertIsNone(EU.relation_of("spikes.rise", 5, 3))
        self.assertIsNone(EU.relation_of("roll.gain", 6, 9))
        self.assertIsNone(EU.relation_of("fall.gain", -5, None))
        self.assertIsNone(EU.relation_of("jump.skip", 2, 1))
        self.assertIsNone(EU.relation_of("mode.at", 9372, 9604))
        self.assertIsNone(EU.relation_of("words", GAME["words"], {**GAME["words"], 12: "ACID!"}))
        self.assertIsNone(EU.relation_of("effect.hud.at", GAME["effect.hud.at"], {"clock": [160, 26, -1]}))
        self.assertEqual(EU.relation_of("spikes.rise", 5, 4), "count")
        self.assertEqual(EU.relation_of("roll.gain", 6, 7), "rate")
        self.assertEqual(EU.relation_of("mode.at", 9372, 9600), "address")

    def test_at_sixty_frames_a_second_a_value_scaled_by_the_rates_is_no_relation_and_the_hands_keys_stand(self):
        self.assertIsNone(JP.relation_of("spikes.rise", 5, 4))
        self.assertIsNone(JP.relation_of("roll.gain", 6, 7))
        self.assertIsNone(JP.relation_of("hourglass.from", 5999, None))
        self.assertIsNone(JP.relation_of("words", GAME["words"], WORDS["eu"]))
        self.assertEqual(JP.relation_of("ball.breathe.full", 6000, 7200), "tuned")
        self.assertEqual(JP.relation_of("hourglass.second", 50, None), "absent")
        self.assertEqual(JP.relation_of("simon.menu.cross", 16384, 8192), "tuned")

    def test_the_hiding_sets_each_release_gives_are_the_bases_the_japanese_paths_folding_kinds_into_ranges(self):
        for game in (GAME_EU, GAME_JP):
            self.assertEqual(hiding(Readings(game)), hiding(GAME))
        self.assertEqual(hiding(Readings(GAME_JP))["kinds"]["6"], [0, 1, 2, 4, 6])


if __name__ == "__main__":
    unittest.main()
