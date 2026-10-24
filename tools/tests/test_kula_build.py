"""Unit tests for the build: python3 -m unittest discover -s tools/tests

Only the packs file's class needs the disc, and it is skipped without $KULA_DISC.
"""

import json
import os
import sys
import unittest
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_build import PACKS, packs_json  # noqa: E402
from kula_disc import open_disc, packs  # noqa: E402
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


if __name__ == "__main__":
    unittest.main()
