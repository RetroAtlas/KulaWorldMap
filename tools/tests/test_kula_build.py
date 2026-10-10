"""Unit tests for the build's packs file: python3 -m unittest discover -s tools/tests

Everything here needs the disc, and is skipped without $KULA_DISC.
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
from kula_pak import Pak  # noqa: E402
from kula_place import RECOMPRESS, ROOM  # noqa: E402
from kula_sector import USER, sectors_of  # noqa: E402


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
