"""Unit tests for the build: python3 -m unittest discover -s tools/tests

The packs file's class and the release files' classes need a disc, each skipped without its variable.
"""

import json
import os
import sys
import unittest
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_build import (  # noqa: E402
    BASE,
    IDENTITY,
    PACKS,
    RELEASE_FILES,
    code_of,
    layout_of,
    other_release,
    packs_json,
    release_json,
    rules_of,
    slot,
    slot_problems,
    variants,
)
from kula_disc import DISC_VARS, RELEASES, open_disc, open_release, packs  # noqa: E402
from kula_kwl import (  # noqa: E402
    CAPS,
    CAPTIVATORS,
    INNER,
    KEY,
    LENGTH_CAP,
    MOVING_SPIKES,
    NUMBERED,
    PLAIN_ONLY,
    UNTRACED,
    figure_failures,
)
from kula_level import BLOCK_KINDS  # noqa: E402
from kula_pak import Pak  # noqa: E402
from kula_place import RECOMPRESS, ROOM  # noqa: E402
from kula_sector import USER, sectors_of  # noqa: E402


def reading():
    """A reading of the executable that agrees with every figure the checks hold."""
    return {
        **{what: CAPS[what] for what in CAPS if what not in UNTRACED},
        "platform.length": LENGTH_CAP,
        "spikes.type": MOVING_SPIKES,
        "glow.types": PLAIN_ONLY - {MOVING_SPIKES},
        "key.type": KEY,
        "block.kinds": BLOCK_KINDS,
        "numbered.from": min(NUMBERED),
        "numbered.count": max(NUMBERED) + 1 - min(NUMBERED),
        "inner.from": INNER.start,
        "inner.below": INNER.stop,
        "captivators.from": min(CAPTIVATORS),
    }


class TheFigures(unittest.TestCase):
    def test_the_comparison_names_a_figure_that_disagrees_and_nothing_when_all_agree(self):
        r = reading()
        self.assertEqual(figure_failures(r), [])
        self.assertEqual(figure_failures({**r, "faces": 770}), ["the cap on faces is 768, not the executable's figure, 770"])
        self.assertEqual(figure_failures({**r, "platform.length": 8}), ["the length cap is 7, not the executable's figure, 8"])
        self.assertEqual(figure_failures({**r, "glow.types": frozenset({5, 7, 10})}),
                         ["the glow loader's set of types is 5, 7, 9, not the executable's figure, 5, 7, 10"])
        self.assertEqual(figure_failures({**r, "numbered.count": r["numbered.count"] + 1}),
                         ["the run of numbered types is 5 to 47, not the executable's figure, 5 to 48"])
        self.assertEqual(figure_failures({**r, "inner.below": 32}),
                         ["the run of inner cells is 1 to 32, not the executable's figure, 1 to 31"])
        self.assertEqual(figure_failures({**r, "platforms": CAPS["platforms"]}),
                         ["the list of untraced caps is blocks, platforms, not the executable's figure, blocks"])
        self.assertEqual(figure_failures({**r, "records": 124, "key.type": 32, "captivators.from": 51}),
                         ["the cap on records is 123, not the executable's figure, 124",
                         "the key's type is 31, not the executable's figure, 32",
                         "the first captivator is 50, not the executable's figure, 51"])


@unittest.skipUnless(os.environ.get("KULA_DISC"), "needs the disc under $KULA_DISC")
class ThePacksFile(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.disc = open_disc()
        cls.text = PACKS.read_text()
        cls.data = json.loads(cls.text)

    @classmethod
    def tearDownClass(cls):
        cls.disc.close()

    def test_every_pack_of_the_disc_is_there_in_order_with_its_place_and_its_room(self):
        self.assertEqual([p["path"] for p in self.data["packs"]], [path for _, path in packs(self.disc)])
        for p in self.data["packs"]:
            lba, size = self.disc.files[p["path"]]
            self.assertEqual((p["lba"], p["size"], p["capacity"]),
                             (lba, size, len(sectors_of(lba, size)) * USER), p["path"])
            self.assertEqual(set(p), {"path", "lba", "size", "capacity", "slots"}, p["path"])

    def test_every_slot_carries_its_name_and_the_length_of_its_record_as_stored_and_recompressed(self):
        for p in self.data["packs"]:
            pak = Pak(self.disc.read_file(p["path"]), p["path"])
            self.assertEqual([s["name"] for s in p["slots"]], pak.names(), p["path"])
            self.assertEqual([s["size"] for s in p["slots"]], [len(s) for s in pak.streams()], p["path"])
            self.assertEqual([s["size"] for s in p["slots"]], [e["size"] for e in pak.entries], p["path"])
            self.assertEqual([s["size9"] for s in p["slots"]],
                             [len(zlib.compress(pak.level(i), RECOMPRESS)) for i in range(len(pak))], p["path"])
            for s in p["slots"]:
                self.assertEqual(set(s), {"name", "size", "size9"}, p["path"])

    def test_the_room_is_the_free_file(self):
        lba, size = self.disc.files[ROOM]
        self.assertEqual(self.data["room"], {"path": ROOM, "lba": lba, "size": size})
        self.assertEqual(set(self.data), {"room", "packs"})

    def test_the_committed_file_is_what_the_build_writes(self):
        self.assertEqual(self.text, json.dumps(packs_json(self.disc), indent=1))


def level(pack, index, **more):
    """A level dict of the shape the build ships, with its one-point lattice, and anything given over it."""
    return {"name": f"L{index}", "theme": "HIRO", "pack": pack, "index": index, "placed": 1, "header": 1,
            "min": [1, 2, 3], "max": [1, 2, 3], "cells": [1, 2, 3, 0], "records": [], "time": 99, **more}


BASE_LEVELS = [level("/HIRO/HIRO.PAK", 0, shown="LEVEL 1"), level("/HIRO/HIRO.PAK", 1, shown="LEVEL 2"),
               level("/HIRO/HIROFI.PAK", 0, shown="FINAL 1")]
BASE_PACKS = ["/HIRO/HIRO.PAK", "/HIRO/HIROFI.PAK"]


class TheComparison(unittest.TestCase):
    def setUp(self):
        self.base = {slot(l): l for l in BASE_LEVELS}

    def test_the_slots_whose_level_is_not_the_bases_are_picked_in_order_naming_the_release(self):
        theirs = [level("/HIRO/HIRO.PAK", 0, shown="LEVEL 1", time=45), dict(BASE_LEVELS[1]),
                  level("/HIRO/HIROFI.PAK", 0, shown="FINAL 1", cells=[1, 2, 3, 2])]
        picked = variants(self.base, theirs, "eu")
        self.assertEqual(list(picked), ["/HIRO/HIRO.PAK#0", "/HIRO/HIROFI.PAK#0"])
        self.assertEqual(picked["/HIRO/HIRO.PAK#0"], {**theirs[0], "release": "eu"})
        self.assertEqual(picked["/HIRO/HIROFI.PAK#0"], {**theirs[2], "release": "eu"})
        self.assertNotIn("release", theirs[0])

    def test_a_disc_whose_every_level_is_the_bases_has_no_variant(self):
        self.assertEqual(variants(self.base, [dict(l) for l in BASE_LEVELS], "jp"), {})

    def test_the_packs_and_the_slots_have_to_be_the_bases_in_its_order_under_its_titles(self):
        levels = [dict(l) for l in BASE_LEVELS]
        self.assertEqual(slot_problems(self.base, levels, BASE_PACKS), [])
        self.assertEqual(slot_problems(self.base, levels, BASE_PACKS + ["/HIRO/COPYCAT.PAK"]),
                         ["the packs are not the base's: /HIRO/COPYCAT.PAK"])
        self.assertEqual(slot_problems(self.base, levels[:2], BASE_PACKS), ["2 slots, not the base's 3"])
        self.assertEqual(slot_problems(self.base, [levels[1], levels[0], levels[2]], BASE_PACKS),
                         ["/HIRO/HIRO.PAK#1, LEVEL 2, stands where the base has /HIRO/HIRO.PAK#0, LEVEL 1"])
        self.assertEqual(slot_problems(self.base, [levels[0], levels[1], {**levels[2], "shown": "FINAL 2"}], BASE_PACKS),
                         ["/HIRO/HIROFI.PAK#0, FINAL 2, stands where the base has /HIRO/HIROFI.PAK#0, FINAL 1"])

    def test_the_file_keys_the_identity_the_rules_the_layout_and_the_levels_in_order(self):
        data = release_json("eu", {"hz": 50}, {"room": {}, "packs": []}, {"/HIRO/HIRO.PAK#0": {}})
        self.assertEqual(list(data), ["id", *IDENTITY, "rules", "packs", "levels"])
        self.assertEqual(data["id"], "eu")
        self.assertEqual({k: data[k] for k in IDENTITY}, {k: RELEASES["eu"][k] for k in IDENTITY})
        self.assertEqual((data["rules"], data["packs"], data["levels"]),
                         ({"hz": 50}, {"room": {}, "packs": []}, {"/HIRO/HIRO.PAK#0": {}}))


class ReleaseFile:
    """A release's committed file held to what the build writes for its disc."""
    release = None

    @classmethod
    def setUpClass(cls):
        cls.disc = open_release(cls.release)
        cls.text = RELEASE_FILES[cls.release].read_text()
        cls.data = json.loads(cls.text)

    @classmethod
    def tearDownClass(cls):
        cls.disc.close()

    def written(self):
        if self.release == BASE:
            return release_json(BASE, rules_of(code_of(self.disc, BASE), BASE), layout_of(self.disc), {})
        return other_release(self.disc, self.release)[0]

    def test_the_committed_file_is_what_the_build_writes(self):
        self.assertEqual(self.text, json.dumps(self.written(), indent=1))

    def test_the_file_names_its_release_and_holds_its_discs_layout(self):
        entry = RELEASES[self.release]
        self.assertEqual([self.data["id"], *(self.data[k] for k in IDENTITY)], [self.release, *(entry[k] for k in IDENTITY)])
        self.assertEqual(self.data["packs"], packs_json(self.disc))


@unittest.skipUnless(os.environ.get(DISC_VARS["us"]), f"needs the disc under ${DISC_VARS['us']}")
class TheBaseFile(ReleaseFile, unittest.TestCase):
    release = "us"

    def test_the_base_has_no_variant_and_its_layout_is_the_packs_file(self):
        self.assertEqual(self.data["levels"], {})
        self.assertEqual(json.dumps(self.data["packs"], indent=1), PACKS.read_text())


@unittest.skipUnless(os.environ.get(DISC_VARS["eu"]), f"needs the PAL disc under ${DISC_VARS['eu']}")
class ThePalFile(ReleaseFile, unittest.TestCase):
    release = "eu"


@unittest.skipUnless(os.environ.get(DISC_VARS["jp"]), f"needs the Japanese disc under ${DISC_VARS['jp']}")
class TheJapaneseFile(ReleaseFile, unittest.TestCase):
    release = "jp"


if __name__ == "__main__":
    unittest.main()
