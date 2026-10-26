"""Unit tests for the placer: python3 -m unittest discover -s tools/tests

The image is the synthetic one the placer builds, a few sectors with the
disc's structure. The disc classes at the end need one: the placer is held to
the disc under $KULA_DISC on one copy of it, and each of the three images to
being an image of its disc, every class skipped without its variable.
"""

import hashlib
import os
import shutil
import struct
import sys
import tempfile
import unittest
import zlib
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from disc import EXTENT, SIZE, Disc, record  # noqa: E402
from kula_disc import DISC_VARS, RELEASES, open_disc, open_release, packs  # noqa: E402
from kula_kwl import REWIRED, canonical, project_of_level, read_kwl  # noqa: E402
from kula_level import Level  # noqa: E402
from kula_pak import Pak, pack  # noqa: E402
from kula_place import (  # noqa: E402
    CUE,
    IN_PLACE,
    cue,
    LARGEST,
    PACK_AT,
    REBUILD,
    RELOCATE,
    ROOM,
    ROOM_AT,
    ROOM_SECTORS,
    ROOT_AT,
    FINALS_AT,
    SYNTHETIC_FINALS,
    SYNTHETIC_PACK,
    SYNTHETIC_SECTORS,
    WORLD_AT,
    Patched,
    fit,
    identify,
    pack_name,
    place,
    place_all,
    plan,
    plan_all,
    proven,
    stream_of,
    synthetic,
    synthetic_image,
    verify,
    verify_all,
    write_image,
    write_sectors,
    written,
)
from kula_sector import (  # noqa: E402
    DATA_SUBMODE,
    EDC_OFF,
    EOF_SUBMODE,
    SECTOR_RAW,
    SUBHEADER_OFF,
    USER,
    USER_OFF,
    check,
    noise,
    raw_sector,
    rebuilt,
    rewrite,
    sector,
)
from test_kula_disc import booting, without_cnf  # noqa: E402

IMAGE = synthetic_image()
SLOT = 1
TITLE = "Spiral"
LEVELS = {IN_PLACE: 6, REBUILD: 30, "recompressed": 60, RELOCATE: 120}


def raw(image, lba):
    return image[lba * SECTOR_RAW:(lba + 1) * SECTOR_RAW]


def user(image, lba):
    return raw(image, lba)[USER_OFF:EDC_OFF]


def stored(n):
    """A zlib stream of exactly n bytes, holding noise in stored blocks."""
    return zlib.compress(noise(3, n - 11), 0)


def both_ways(data, pos):
    """A directory record's extent and size, each as (little-endian, big-endian)."""
    return ((struct.unpack_from("<I", data, pos + EXTENT)[0], struct.unpack_from(">I", data, pos + EXTENT + 4)[0]),
            (struct.unpack_from("<I", data, pos + SIZE)[0], struct.unpack_from(">I", data, pos + SIZE + 4)[0]))


BARE = [-1, 0, -1, -1, 0] + [-1] * 11
COMMUNITY = [
    ((10, 10, 10), [0, 9, 0, 1, 1, -1, -1, 0, 0, 256, 0, -1, -1, -1, 0, -1]),
    ((11, 10, 10), [0, 30, 1, 0, 0, -1, -1, -1, 0, 256, 0, -1, -1, -1, 0, -1]),
    ((12, 10, 10), [0, 5, 1, 1, 1, -1, -1, -1, 0, 256, 1, -1, -1, -1, 30, -1]),
]


def community():
    """A level file as the community's tools leave one: no trailer, the links as they stand."""
    lattice = [0xFFFF] * (34 ** 3)
    records = []
    for k, (cell, top) in enumerate(COMMUNITY):
        lattice[(cell[0] * 34 + cell[1]) * 34 + cell[2]] = 5 + k
        words = top + BARE * 5 + [-1] * (128 - 96 - 3) + list(cell)
        records.append(struct.pack("<128h", *words))
    return struct.pack(f"<{34 ** 3}H", *lattice) + struct.pack("<iH", len(COMMUNITY), len(COMMUNITY)) + b"".join(records)


class TheCommunityFile(unittest.TestCase):
    def test_a_level_file_with_no_trailer_and_its_own_wiring_reads_the_same_on_both_sides(self):
        blob = community()
        self.assertEqual(len(blob), 78614 + 256 * 3)
        self.assertEqual(hashlib.sha256(blob).hexdigest(), "ae92811f550d5fde6e4c0a646b813d88108f9cd247efb2099fe5ce59c4022314")
        project, report, _ = read_kwl(blob, "HIRO")
        self.assertEqual(report, ["no trailer, so the time is 99", REWIRED])
        self.assertEqual(project["blocks"], [
            {"cell": [10, 10, 10], "kind": 0, "faces": {"0": {"type": 9, "variant": 1}}},
            {"cell": [11, 10, 10], "kind": 0, "faces": {"0": {"type": 30, "facing": 1}}},
            {"cell": [12, 10, 10], "kind": 0, "faces": {"0": {"type": 5, "facing": 1, "variant": 1}}},
        ])
        self.assertEqual((project["time"], project["hidden"], project["circuits"]), (99, False, {}))
        again = canonical(project)
        self.assertNotEqual(again, blob)
        self.assertEqual(read_kwl(again, "HIRO")[0]["blocks"], project["blocks"])


class ThePack(unittest.TestCase):
    def test_the_writer_lays_the_container_out_as_the_disc_does(self):
        names, streams = ["LEVEL 1", "LEVEL 10", "OBJ LEVEL"], [b"abc", b"defgh", b"i"]
        blob = pack(names, streams)
        p = Pak(blob)
        self.assertEqual((p.names(), p.streams(), p.size), (names, streams, len(blob)))
        table = 4 + 3 * 12
        self.assertEqual([struct.unpack_from("<I", blob, 4 + 3 * 8 + i * 4)[0] for i in range(3)],
                         [table, table + 9, table + 19])
        self.assertEqual(blob[table:table + 30], b"LEVEL 1\n\0LEVEL 10\n\0OBJ LEVEL\n\0")
        first = p.entries[0]["offset"]
        self.assertEqual((first - (table + 30), first % 4), (2, 0))
        self.assertEqual(blob[table + 30:first], b"\0\0")
        self.assertEqual([e["offset"] for e in p.entries], [first, first + 3, first + 8])
        self.assertEqual(len(blob), first + 9)

    def test_the_padding_is_one_to_four_bytes(self):
        for n in range(1, 9):
            blob = pack(["X" * n], [b"z"])
            first = Pak(blob).entries[0]["offset"]
            self.assertIn(first - (16 + n + 2), range(1, 5), n)
            self.assertEqual(first % 4, 0, n)


class TheCueSheet(unittest.TestCase):
    def test_it_names_the_image_in_one_mode_2_track_and_escapes_a_quote_in_the_name(self):
        self.assertEqual(cue("spiral.bin"), 'FILE "spiral.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n')
        self.assertEqual(cue('my "disc".bin').splitlines()[0], 'FILE "my \\"disc\\".bin" BINARY')


class TheName(unittest.TestCase):
    def test_a_title_becomes_upper_case_ascii_no_longer_than_the_name_it_replaces(self):
        self.assertEqual(pack_name("Spiral", "LEVEL 1"), "SPIRAL")
        self.assertEqual(pack_name("my great level", "LEVEL 1"), "MY GREA")
        self.assertEqual(pack_name("Épée à la mode", "LEVEL 10"), "PE  LA M")
        self.assertEqual(pack_name("a\tb\nc", "LEVEL 1"), "ABC")

    def test_a_title_that_gives_nothing_leaves_the_old_name(self):
        for title in ("", "   ", "ééé", "\n"):
            self.assertEqual(pack_name(title, "LEVEL 1"), "LEVEL 1", repr(title))


class TheFit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f:
            f.write(IMAGE)
        cls.path = f.name
        with Disc(cls.path) as disc:
            cls.pak = Pak(disc.read_file(SYNTHETIC_PACK))

    @classmethod
    def tearDownClass(cls):
        os.unlink(cls.path)

    def fit(self, stream, title=TITLE, capacity=USER, slot=SLOT):
        return fit(self.pak, capacity, slot, stream, title)

    def test_a_stream_no_longer_than_the_record_goes_in_place_and_the_name_stays(self):
        stream = stream_of(synthetic(LEVELS[IN_PLACE]))
        f = self.fit(stream)
        self.assertEqual((f.path, f.room, f.size, f.recompressed), (IN_PLACE, self.pak.entries[SLOT]["size"] - len(stream), self.pak.size, False))
        self.assertEqual(f.streams, self.pak.streams()[:SLOT] + [stream] + self.pak.streams()[SLOT + 1:])
        self.assertEqual(f.names, self.pak.names())
        exact = self.fit(stored(self.pak.entries[SLOT]["size"]))
        self.assertEqual((exact.path, exact.room), (IN_PLACE, 0))

    def test_a_longer_stream_rebuilds_the_pack_within_its_sectors_with_the_others_as_they_are(self):
        stream = stream_of(synthetic(LEVELS[REBUILD]))
        f = self.fit(stream)
        self.assertEqual((f.path, f.recompressed), (REBUILD, False))
        self.assertEqual(f.size, len(pack(f.names, f.streams)))
        self.assertEqual(f.room, USER - f.size)
        self.assertEqual(f.streams, self.pak.streams()[:SLOT] + [stream] + self.pak.streams()[SLOT + 1:])
        self.assertEqual(f.names, ["LEVEL 1", "SPIRAL", "LEVEL 3"])
        self.assertEqual(self.fit(stream, title=None).names, self.pak.names())

    def test_then_with_the_others_recompressed_at_level_9(self):
        stream = stream_of(synthetic(LEVELS["recompressed"]))
        f = self.fit(stream)
        self.assertEqual((f.path, f.recompressed, f.room), (REBUILD, True, USER - f.size))
        self.assertEqual(f.streams[SLOT], stream)
        for i in (0, 2):
            self.assertEqual(f.streams[i], zlib.compress(zlib.decompress(self.pak.streams()[i]), 9))
            self.assertEqual(f.streams[i][:2], b"\x78\xda")
            self.assertLess(len(f.streams[i]), self.pak.entries[i]["size"])
        self.assertGreater(len(pack(f.names, self.pak.streams()[:SLOT] + [stream] + self.pak.streams()[SLOT + 1:])), USER)

    def test_and_moves_the_pack_when_even_that_does_not_fit(self):
        stream = stream_of(synthetic(LEVELS[RELOCATE]))
        f = self.fit(stream)
        self.assertEqual((f.path, f.recompressed), (RELOCATE, False))
        self.assertEqual(f.streams, self.pak.streams()[:SLOT] + [stream] + self.pak.streams()[SLOT + 1:])
        self.assertEqual((f.size, f.room), (len(pack(f.names, f.streams)), LARGEST - f.size))
        self.assertGreater(f.size, USER)

    def test_a_moved_pack_is_recompressed_only_to_come_under_what_the_game_reads(self):
        others = self.pak.streams()[:SLOT] + self.pak.streams()[SLOT + 1:]
        gain = sum(len(s) - len(zlib.compress(zlib.decompress(s), 9)) for s in others)
        base = len(pack(self.pak.names(), self.pak.streams()[:SLOT] + [b""] + self.pak.streams()[SLOT + 1:]))
        over = self.fit(stored(LARGEST + 1 - base), title=None)
        self.assertEqual((over.path, over.recompressed, over.size), (RELOCATE, True, LARGEST + 1 - gain))
        with self.assertRaises(ValueError):
            self.fit(stored(LARGEST + 1 - base + gain), title=None)

    def test_a_pack_is_rebuilt_only_within_what_the_game_reads(self):
        stream = stream_of(synthetic(LEVELS[REBUILD]))
        f = self.fit(stream, capacity=LARGEST + USER)
        self.assertEqual((f.path, f.room), (REBUILD, LARGEST - f.size))
        base = len(pack(self.pak.names(), self.pak.streams()[:SLOT] + [b""] + self.pak.streams()[SLOT + 1:]))
        over = self.fit(stored(LARGEST + 1 - base), title=None, capacity=LARGEST + USER)
        self.assertEqual((over.path, over.recompressed), (REBUILD, True))

    def test_a_slot_the_pack_does_not_have_is_refused(self):
        with self.assertRaises(ValueError):
            self.fit(b"x", slot=3)
        with self.assertRaises(ValueError):
            self.fit(b"x", slot=-1)


class ThePlacer(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.src = self.dir / "image.bin"
        self.src.write_bytes(IMAGE)
        self.out = self.dir / "patched.bin"
        with Disc(self.src) as disc:
            self.pak = Pak(disc.read_file(SYNTHETIC_PACK))
            self.record = disc.records[SYNTHETIC_PACK]

    def placed(self, n, slot=SLOT, title=TITLE, pack_path=SYNTHETIC_PACK):
        stream = stream_of(synthetic(n))
        placed = place(self.src, pack_path, slot, stream, self.out, title)
        after = self.out.read_bytes()
        self.hold(stream, placed, after, slot, pack_path)
        return stream, placed, after

    def hold(self, stream, placed, after, slot, pack_path):
        """What every placement has to satisfy, whichever path it took."""
        self.assertEqual(len(after), len(IMAGE))
        touched = {lba for lba, _ in placed.writes}
        self.assertEqual([lba for lba, _ in placed.writes], sorted(touched))
        for lba in range(SYNTHETIC_SECTORS):
            if lba not in touched:
                self.assertEqual(raw(after, lba), raw(IMAGE, lba), lba)
        for lba, raw_ in placed.writes:
            self.assertEqual(raw(after, lba), raw_)
            self.assertNotEqual(raw_, raw(IMAGE, lba))
            self.assertTrue(check(raw_) and rebuilt(raw_, lba), lba)
        with Disc(self.src) as disc:
            before = Pak(disc.read_file(pack_path))
        with Disc(self.out) as disc:
            self.assertEqual(disc.files[pack_path], (placed.lba, placed.fit.size))
            pak = Pak(disc.read_file(pack_path))
            self.assertEqual(zlib.decompress(pak.entries[slot]["blob"]), zlib.decompress(stream))
            self.assertEqual(pak.streams(), placed.fit.streams)
            self.assertEqual(pak.names(), placed.fit.names)
            for i in range(len(pak)):
                if i != slot:
                    self.assertEqual(pak.level(i), before.level(i))
                self.assertEqual(Level(pak.level(i)).verify(), [])
            at, pos = disc.records[pack_path]
            (lba_le, lba_be), (size_le, size_be) = both_ways(disc.sector(at), pos)
            self.assertEqual((lba_le, size_le), (lba_be, size_be))
            self.assertEqual((lba_le, size_le), (placed.lba, placed.fit.size))
            verify(disc, pack_path, slot, stream, placed)
        self.assertEqual(self.out.with_suffix(".cue").read_text(), cue(self.out.name))
        self.assertEqual(cue(self.out.name), CUE.format(self.out.name))

    def test_in_place_the_record_is_written_over_the_old_bytes_and_nothing_else_moves(self):
        stream, placed, after = self.placed(LEVELS[IN_PLACE])
        self.assertEqual(placed.fit.path, IN_PLACE)
        self.assertEqual([lba for lba, _ in placed.writes], [PACK_AT])
        before, now = user(IMAGE, PACK_AT), user(after, PACK_AT)
        at = self.pak.entries[SLOT]["offset"]
        changed = {i for i in range(USER) if before[i] != now[i]}
        self.assertTrue(changed <= set(range(4 + SLOT * 8 + 4, 4 + SLOT * 8 + 8)) | set(range(at, at + len(stream))))
        self.assertEqual(now[at:at + len(stream)], stream)
        self.assertEqual(struct.unpack_from("<II", now, 4 + SLOT * 8), (at, len(stream)))
        self.assertEqual(now[at + len(stream):at + self.pak.entries[SLOT]["size"]],
                         before[at + len(stream):at + self.pak.entries[SLOT]["size"]])
        self.assertEqual(placed.fit.names[SLOT], "LEVEL 2")
        self.assertEqual(raw(after, WORLD_AT), raw(IMAGE, WORLD_AT))
        self.assertEqual(placed.fit.room, self.pak.entries[SLOT]["size"] - len(stream))

    def test_a_rebuild_lays_the_pack_out_again_and_rewrites_the_directory_record_size(self):
        stream, placed, after = self.placed(LEVELS[REBUILD])
        self.assertEqual((placed.fit.path, placed.fit.recompressed, placed.lba), (REBUILD, False, PACK_AT))
        self.assertEqual([lba for lba, _ in placed.writes], [WORLD_AT, PACK_AT])
        self.assertEqual(user(after, PACK_AT), pack(placed.fit.names, placed.fit.streams).ljust(USER, b"\0"))
        self.assertEqual(placed.fit.names, ["LEVEL 1", "SPIRAL", "LEVEL 3"])
        pak = Pak(user(after, PACK_AT)[:placed.fit.size])
        for i in (0, 2):
            self.assertEqual(pak.entries[i]["blob"], self.pak.entries[i]["blob"])
        self.assertEqual(raw(after, WORLD_AT)[:USER_OFF], raw(IMAGE, WORLD_AT)[:USER_OFF])
        changed = {i for i in range(USER) if user(IMAGE, WORLD_AT)[i] != user(after, WORLD_AT)[i]}
        self.assertTrue(changed <= set(range(self.record[1] + SIZE, self.record[1] + SIZE + 8)))
        self.assertEqual(placed.fit.room, USER - placed.fit.size)

    def test_a_rebuild_recompresses_the_others_when_that_is_what_makes_room(self):
        stream, placed, after = self.placed(LEVELS["recompressed"])
        self.assertEqual((placed.fit.path, placed.fit.recompressed), (REBUILD, True))
        self.assertEqual([lba for lba, _ in placed.writes], [WORLD_AT, PACK_AT])
        pak = Pak(user(after, PACK_AT)[:placed.fit.size])
        for i in (0, 2):
            self.assertNotEqual(pak.entries[i]["blob"], self.pak.entries[i]["blob"])
            self.assertEqual(pak.entries[i]["blob"], zlib.compress(self.pak.level(i), 9))
        self.assertLessEqual(placed.fit.size, USER)

    def test_a_pack_that_does_not_fit_moves_to_the_head_of_the_room(self):
        stream, placed, after = self.placed(LEVELS[RELOCATE])
        self.assertEqual((placed.fit.path, placed.fit.recompressed, placed.lba), (RELOCATE, False, ROOM_AT))
        self.assertEqual([lba for lba, _ in placed.writes], [WORLD_AT, ROOM_AT, ROOM_AT + 1])
        blob = pack(placed.fit.names, placed.fit.streams)
        self.assertEqual(user(after, ROOM_AT) + user(after, ROOM_AT + 1), blob.ljust(2 * USER, b"\0"))
        self.assertEqual(raw(after, ROOM_AT)[SUBHEADER_OFF + 2], DATA_SUBMODE)
        self.assertEqual(raw(after, ROOM_AT + 1)[SUBHEADER_OFF + 2], EOF_SUBMODE)
        self.assertEqual(raw(after, ROOM_AT), sector(ROOM_AT, user(after, ROOM_AT), DATA_SUBMODE))
        self.assertEqual(user(after, ROOM_AT + 2), bytes(USER))
        self.assertEqual(raw(after, PACK_AT), raw(IMAGE, PACK_AT))
        (lba_le, lba_be), _ = both_ways(user(after, WORLD_AT), self.record[1])
        self.assertEqual((lba_le, lba_be), (ROOM_AT, ROOM_AT))
        self.assertEqual(placed.fit.room, LARGEST - placed.fit.size)

    def test_a_pack_moves_into_the_first_free_run_of_the_room_behind_one_already_moved_there(self):
        moving = stream_of(synthetic(LEVELS[RELOCATE]))
        taken = bytearray(IMAGE)
        head = bytearray(user(IMAGE, ROOM_AT))
        head[0] = 1
        taken[ROOM_AT * SECTOR_RAW:(ROOM_AT + 1) * SECTOR_RAW] = sector(ROOM_AT, bytes(head), DATA_SUBMODE)
        self.src.write_bytes(taken)
        behind = place(self.src, SYNTHETIC_PACK, SLOT, moving, self.out, TITLE)
        self.assertEqual((behind.fit.path, behind.lba), (RELOCATE, ROOM_AT + 2))
        self.assertEqual([lba for lba, _ in behind.writes], [WORLD_AT, ROOM_AT + 2, ROOM_AT + 3])
        self.src.write_bytes(IMAGE)
        first = place(self.src, SYNTHETIC_PACK, SLOT, moving, self.out, TITLE)
        again = self.dir / "second.bin"
        second = place(self.out, SYNTHETIC_FINALS, 0, stream_of(synthetic(100)), again, TITLE)
        self.assertEqual((second.fit.path, second.lba), (RELOCATE, ROOM_AT + 3))
        self.assertEqual([lba for lba, _ in second.writes], [WORLD_AT, ROOM_AT + 3, ROOM_AT + 4])
        after = again.read_bytes()
        for lba in (ROOM_AT + 2, ROOM_AT + 5):
            self.assertEqual(user(after, lba), bytes(USER))
        for lba in (ROOM_AT, ROOM_AT + 1):
            self.assertEqual(raw(after, lba), raw(self.out.read_bytes(), lba))
        with Disc(again) as disc:
            self.assertEqual(disc.files[SYNTHETIC_PACK], (ROOM_AT, first.fit.size))
            self.assertEqual(disc.files[SYNTHETIC_FINALS], (ROOM_AT + 3, second.fit.size))
        third = self.dir / "third.bin"
        full = place(again, SYNTHETIC_PACK, 0, stream_of(synthetic(120)), third, TITLE)
        self.assertEqual((full.fit.path, full.lba), (RELOCATE, ROOM_AT + 6))
        self.assertEqual([lba for lba, _ in full.writes], [WORLD_AT, ROOM_AT + 6, ROOM_AT + 7, ROOM_AT + 8])
        with Disc(third) as disc, self.assertRaisesRegex(ValueError, "has no run of 4 zero sectors left"):
            plan(disc, SYNTHETIC_FINALS, 1, stream_of(synthetic(200)), TITLE)

    def test_a_rebuilt_pack_that_comes_to_fewer_sectors_is_written_over_the_sectors_it_then_occupies(self):
        at = SYNTHETIC_SECTORS
        two = pack(["LEVEL 1", "LEVEL 2", "LEVEL 3"], [stored(500), stored(1000), stored(481)])
        self.assertEqual(len(two), USER + 1)
        with Disc(self.src) as disc:
            finals_at, finals_size = disc.files[SYNTHETIC_FINALS]
        world = (record(b"\0", WORLD_AT, USER, 2) + record(b"\1", ROOT_AT, USER, 2)
                 + record("HIRO.PAK;1", at, len(two)) + record("HIROFI.PAK;1", finals_at, finals_size))
        image = bytearray(IMAGE)
        image[WORLD_AT * SECTOR_RAW:(WORLD_AT + 1) * SECTOR_RAW] = sector(WORLD_AT, world.ljust(USER, b"\0"), EOF_SUBMODE)
        image += sector(at, two[:USER], DATA_SUBMODE) + sector(at + 1, two[USER:].ljust(USER, b"\0"), EOF_SUBMODE)
        self.src.write_bytes(image)
        placed = place(self.src, SYNTHETIC_PACK, SLOT, stored(1001), self.out, "A")
        self.assertEqual((placed.fit.path, placed.fit.recompressed, placed.fit.size, placed.fit.names),
                         (REBUILD, False, USER - 2, ["LEVEL 1", "A", "LEVEL 3"]))
        self.assertEqual([lba for lba, _ in placed.writes], [WORLD_AT, at])
        after = self.out.read_bytes()
        self.assertEqual(raw(after, at)[SUBHEADER_OFF + 2], EOF_SUBMODE)
        self.assertEqual(raw(after, at + 1), raw(bytes(image), at + 1))
        with Disc(self.out) as disc:
            self.assertEqual(disc.files[SYNTHETIC_PACK], (at, USER - 2))
            self.assertEqual(Pak(disc.read_file(SYNTHETIC_PACK)).names(), ["LEVEL 1", "A", "LEVEL 3"])

    def test_a_directory_sector_is_rewritten_under_its_own_subheader(self):
        dir_at = SYNTHETIC_SECTORS
        with Disc(self.src) as disc:
            cnf_at, cnf_size = disc.files["/SYSTEM.CNF"]
            packs_ = [(path, disc.files[path]) for path in (SYNTHETIC_PACK, SYNTHETIC_FINALS)]
        root = (record(b"\0", ROOT_AT, USER, 2) + record(b"\1", ROOT_AT, USER, 2)
                + record("3.00;1", ROOM_AT, ROOM_SECTORS * USER) + record("HIRO", dir_at, 2 * USER, 2)
                + record("SYSTEM.CNF;1", cnf_at, cnf_size))
        world = record(b"\0", dir_at, 2 * USER, 2) + record(b"\1", ROOT_AT, USER, 2)
        for path, (at, size) in packs_:
            world += record(path.rsplit("/", 1)[1] + ";1", at, size)
        image = bytearray(IMAGE)
        image[ROOT_AT * SECTOR_RAW:(ROOT_AT + 1) * SECTOR_RAW] = sector(ROOT_AT, root.ljust(USER, b"\0"), EOF_SUBMODE)
        image += sector(dir_at, world.ljust(USER, b"\0"), DATA_SUBMODE) + sector(dir_at + 1, bytes(USER), EOF_SUBMODE)
        self.src.write_bytes(image)
        placed = place(self.src, SYNTHETIC_PACK, SLOT, stream_of(synthetic(LEVELS[REBUILD])), self.out, TITLE)
        self.assertEqual([lba for lba, _ in placed.writes], [PACK_AT, dir_at])
        was = raw(bytes(image), dir_at)
        written = dict(placed.writes)[dir_at]
        self.assertEqual(written[:USER_OFF], was[:USER_OFF])
        self.assertEqual(written[SUBHEADER_OFF + 2], DATA_SUBMODE)
        self.assertEqual(written, rewrite(was, written[USER_OFF:EDC_OFF]))
        self.assertTrue(check(written))

    def test_the_finals_pack_takes_a_level_too(self):
        stream, placed, after = self.placed(1, slot=0, title="Tiny", pack_path="/HIRO/HIROFI.PAK")
        self.assertEqual(placed.fit.path, IN_PLACE)

    def test_the_plan_reads_back_through_the_patched_view_before_anything_is_written(self):
        stream = stream_of(synthetic(LEVELS[RELOCATE]))
        with Disc(self.src) as disc:
            placed = plan(disc, SYNTHETIC_PACK, SLOT, stream, TITLE)
        with Patched(self.src, placed.writes) as view:
            self.assertEqual(view.files[SYNTHETIC_PACK], (ROOM_AT, placed.fit.size))
            verify(view, SYNTHETIC_PACK, SLOT, stream, placed)
        self.assertEqual(self.src.read_bytes(), IMAGE)

    def test_a_copy_that_fails_its_check_is_removed_with_its_cue_sheet(self):
        stream = stream_of(synthetic(LEVELS[REBUILD]))
        with Disc(self.src) as disc:
            placed = plan(disc, SYNTHETIC_PACK, SLOT, stream, TITLE)
        write_image(self.src, self.out, placed.writes)
        cue = self.out.with_suffix(".cue")
        self.assertTrue(self.out.exists() and cue.exists())
        proven(self.out, SYNTHETIC_PACK, SLOT, stream, placed)
        self.assertTrue(self.out.exists() and cue.exists())
        wrong = placed._replace(fit=placed.fit._replace(size=placed.fit.size + 1))
        with self.assertRaisesRegex(ValueError, "does not read back as planned, so it and its cue sheet were removed: the directory puts"):
            proven(self.out, SYNTHETIC_PACK, SLOT, stream, wrong)
        self.assertFalse(self.out.exists() or cue.exists())
        self.assertEqual(self.src.read_bytes(), IMAGE)

    def test_a_copy_written_for_any_check_is_kept_only_where_the_check_passes(self):
        stream = stream_of(synthetic(LEVELS[REBUILD]))
        with Disc(self.src) as disc:
            placed = plan(disc, SYNTHETIC_PACK, SLOT, stream, TITLE)
        cue = self.out.with_suffix(".cue")

        def refuse(disc):
            raise ValueError("no")

        with self.assertRaisesRegex(ValueError, "does not read back as planned, so it and its cue sheet were removed: no"):
            written(self.src, self.out, placed.writes, refuse)
        self.assertFalse(self.out.exists() or cue.exists())
        written(self.src, self.out, placed.writes, lambda disc: None)
        self.assertTrue(self.out.exists() and cue.exists())
        self.hold(stream, placed, self.out.read_bytes(), SLOT, SYNTHETIC_PACK)

    def test_a_record_that_does_not_inflate_stops_only_a_rebuild_that_would_recompress_it(self):
        damaged = bytearray(IMAGE)
        data = bytearray(user(IMAGE, PACK_AT))
        data[self.pak.entries[0]["offset"] + 3] ^= 0xFF
        damaged[PACK_AT * SECTOR_RAW:(PACK_AT + 1) * SECTOR_RAW] = sector(PACK_AT, bytes(data), EOF_SUBMODE)
        self.src.write_bytes(damaged)
        with Disc(self.src) as disc:
            fitted = lambda n: plan(disc, SYNTHETIC_PACK, SLOT, stream_of(synthetic(n)), TITLE).fit  # noqa: E731
            self.assertEqual(fitted(LEVELS[IN_PLACE]).path, IN_PLACE)
            self.assertEqual((fitted(LEVELS[REBUILD]).path, fitted(LEVELS[REBUILD]).recompressed), (REBUILD, False))
            with self.assertRaisesRegex(ValueError, "^the record of LEVEL 1 is not one the game inflates: "):
                fitted(LEVELS["recompressed"])

    def test_the_record_of_the_slot_being_replaced_is_never_inflated_so_a_damaged_one_does_not_stop_the_rebuild(self):
        damaged = bytearray(IMAGE)
        data = bytearray(user(IMAGE, PACK_AT))
        at = self.pak.entries[SLOT]["offset"]
        data[at + 3] ^= 0xFF
        with self.assertRaises(zlib.error):
            zlib.decompress(bytes(data[at:at + self.pak.entries[SLOT]["size"]]))
        damaged[PACK_AT * SECTOR_RAW:(PACK_AT + 1) * SECTOR_RAW] = sector(PACK_AT, bytes(data), EOF_SUBMODE)
        self.src.write_bytes(damaged)
        with Disc(self.src) as disc:
            fitted = plan(disc, SYNTHETIC_PACK, SLOT, stream_of(synthetic(LEVELS["recompressed"])), TITLE).fit
        self.assertEqual((fitted.path, fitted.recompressed), (REBUILD, True))

    def test_the_image_is_known_by_its_structure_and_warned_about_where_it_is_not_the_disc_it_boots(self):
        with Disc(self.src) as disc:
            self.assertEqual(identify(disc), [f"the image has {SYNTHETIC_SECTORS} sectors, not the 109,607 of the Roll Away disc",
                                              "19 of the 21 packs are missing"])
            stream = stream_of(synthetic(LEVELS[IN_PLACE]))
            self.assertEqual(plan(disc, SYNTHETIC_PACK, SLOT, stream).warnings, identify(disc))
        with open(self.src, "r+b") as f:
            f.truncate(RELEASES["us"]["sectors"] * SECTOR_RAW)
        with Disc(self.src) as disc:
            self.assertEqual(identify(disc), ["19 of the 21 packs are missing"])

    def test_an_image_booting_another_release_s_executable_is_held_to_that_disc_s_count(self):
        self.src.write_bytes(booting(b"SCES_010.00"))
        with Disc(self.src) as disc:
            self.assertEqual(identify(disc), [f"the image has {SYNTHETIC_SECTORS} sectors, not the 108,471 of the Kula World disc",
                                              "19 of the 21 packs are missing"])
        self.src.write_bytes(booting(b"SCPS_100.64"))
        with Disc(self.src) as disc:
            self.assertEqual(identify(disc)[0], f"the image has {SYNTHETIC_SECTORS} sectors, not the 136,980 of the Kula Quest disc")

    def test_an_image_booting_none_of_the_three_is_told_so_in_one_sentence_and_held_to_no_count(self):
        for image in (booting(b"SLES_000.00"), without_cnf()):
            self.src.write_bytes(image)
            with Disc(self.src) as disc:
                self.assertEqual(identify(disc), ["SYSTEM.CNF names none of the three releases' executables",
                                                  "19 of the 21 packs are missing"])

    def test_what_is_refused(self):
        stream = stream_of(synthetic(LEVELS[IN_PLACE]))
        with Disc(self.src) as disc:
            with self.assertRaises(ValueError):
                plan(disc, "/HIRO/COPYCAT.PAK", 0, stream)
            with self.assertRaises(ValueError):
                plan(disc, SYNTHETIC_PACK, 3, stream)
            with self.assertRaises(ValueError):
                plan(disc, SYNTHETIC_PACK, SLOT, b"not a stream")
            with self.assertRaises(ValueError):
                plan(disc, SYNTHETIC_PACK, SLOT, stored(ROOM_SECTORS * USER - USER))
        crowded = bytearray(IMAGE)
        mark = bytearray(user(IMAGE, ROOM_AT))
        mark[0] = 1
        for i in range(0, ROOM_SECTORS, 2):
            crowded[(ROOM_AT + i) * SECTOR_RAW:(ROOM_AT + i + 1) * SECTOR_RAW] = sector(ROOM_AT + i, bytes(mark), DATA_SUBMODE)
        self.src.write_bytes(crowded)
        with Disc(self.src) as disc, self.assertRaisesRegex(ValueError, "has no run of 3 zero sectors left"):
            plan(disc, SYNTHETIC_PACK, SLOT, stream_of(synthetic(LEVELS[RELOCATE])))
        roomless = bytearray(IMAGE)
        root = (record(b"\0", ROOT_AT, USER, 2) + record(b"\1", ROOT_AT, USER, 2)
                + record("HIRO", WORLD_AT, USER, 2)).ljust(USER, b"\0")
        roomless[ROOT_AT * SECTOR_RAW:(ROOT_AT + 1) * SECTOR_RAW] = sector(ROOT_AT, root, EOF_SUBMODE)
        self.src.write_bytes(roomless)
        with Disc(self.src) as disc:
            self.assertNotIn(ROOM, disc.files)
            with self.assertRaises(ValueError):
                plan(disc, SYNTHETIC_PACK, SLOT, stream_of(synthetic(LEVELS[RELOCATE])))
            self.assertEqual(plan(disc, SYNTHETIC_PACK, SLOT, stream_of(synthetic(LEVELS[REBUILD]))).fit.path, REBUILD)


class SeveralLevels(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.src = self.dir / "image.bin"
        self.src.write_bytes(IMAGE)
        self.out = self.dir / "patched.bin"
        with Disc(self.src) as disc:
            self.pak = Pak(disc.read_file(SYNTHETIC_PACK))
            self.finals = Pak(disc.read_file(SYNTHETIC_FINALS))
            self.warnings = identify(disc)
        self.first = (SYNTHETIC_PACK, SLOT, stream_of(synthetic(LEVELS[IN_PLACE])), TITLE)
        self.second = (SYNTHETIC_PACK, 2, stream_of(synthetic(LEVELS[REBUILD], "Tower")), "Tower")

    def hold(self, items, planned, after):
        """What every set has to satisfy: the copy is the image with the merged
        sectors written and nothing else, every pack lies where its last
        placement put it, and every slot inflates to its level."""
        self.assertEqual(len(after), len(IMAGE))
        touched = {lba for lba, _ in planned.writes}
        self.assertEqual([lba for lba, _ in planned.writes], sorted(touched))
        for lba in range(SYNTHETIC_SECTORS):
            if lba not in touched:
                self.assertEqual(raw(after, lba), raw(IMAGE, lba), lba)
        for lba, raw_ in planned.writes:
            self.assertEqual(raw(after, lba), raw_)
            self.assertNotEqual(raw_, raw(IMAGE, lba))
            self.assertTrue(check(raw_) and rebuilt(raw_, lba), lba)
        with Disc(self.out) as disc:
            for (pack_path, slot, stream, _), placed in zip(items, planned.placed):
                pak = Pak(disc.read_file(pack_path))
                self.assertEqual(pak.level(slot), zlib.decompress(stream))
                self.assertEqual(Level(pak.level(slot)).verify(), [])
            for pack_path, placed in {p.upper(): placed for (p, *_), placed in zip(items, planned.placed)}.items():
                self.assertEqual(disc.files[pack_path], (placed.lba, placed.fit.size))
                pak = Pak(disc.read_file(pack_path))
                self.assertEqual((pak.streams(), pak.names()), (placed.fit.streams, placed.fit.names))
            verify_all(disc, items, planned)
        self.assertEqual(self.out.with_suffix(".cue").read_text(), cue(self.out.name))
        self.assertEqual(self.src.read_bytes(), IMAGE)

    def test_one_level_is_planned_as_plan_plans_it(self):
        with Disc(self.src) as disc:
            one = plan(disc, *self.first)
            planned = plan_all(disc, [self.first])
        self.assertEqual(planned.placed, [one])
        self.assertEqual((planned.writes, planned.warnings), (one.writes, one.warnings))
        self.assertEqual(planned.warnings, self.warnings)

    def test_the_second_is_planned_over_the_image_the_first_leaves(self):
        with Disc(self.src) as disc:
            one = plan(disc, *self.first)
            planned = plan_all(disc, [self.first, self.second])
        with Patched(self.src, one.writes) as view:
            two = plan(view, *self.second)
        self.assertEqual(planned.placed, [one, two])
        self.assertEqual(planned.writes, sorted((dict(one.writes) | dict(two.writes)).items()))
        self.assertEqual([lba for lba, _ in planned.writes], [WORLD_AT, PACK_AT])
        self.assertEqual([lba for lba, _ in one.writes], [PACK_AT])
        self.assertEqual(dict(planned.writes)[PACK_AT], dict(two.writes)[PACK_AT])
        self.assertNotEqual(dict(one.writes)[PACK_AT], dict(two.writes)[PACK_AT])
        self.assertEqual((one.fit.path, two.fit.path, two.fit.recompressed), (IN_PLACE, REBUILD, False))
        self.assertEqual(two.fit.streams, [self.pak.streams()[0], self.first[2], self.second[2]])
        self.assertEqual(two.fit.names, ["LEVEL 1", "LEVEL 2", "TOWER"])
        self.assertEqual(planned.warnings, self.warnings)

    def test_a_later_rebuild_that_recompresses_carries_the_earlier_level_at_level_9(self):
        heavier = (SYNTHETIC_PACK, 2, stream_of(synthetic(65, "Tower")), "Tower")
        planned = place_all(self.src, [self.first, heavier], self.out)
        two = planned.placed[1]
        self.assertEqual((two.fit.path, two.fit.recompressed), (REBUILD, True))
        self.assertEqual(two.fit.streams[SLOT], zlib.compress(zlib.decompress(self.first[2]), 9))
        self.assertNotEqual(two.fit.streams[SLOT], self.first[2])
        self.hold([self.first, heavier], planned, self.out.read_bytes())

    def test_two_packs_sharing_a_directory_sector_both_rebuilt_carry_both_records(self):
        items = [(SYNTHETIC_PACK, SLOT, stream_of(synthetic(LEVELS[REBUILD])), TITLE),
                 (SYNTHETIC_FINALS, 0, stream_of(synthetic(5, "Tower")), "Tower")]
        planned = place_all(self.src, items, self.out)
        self.assertEqual([(p.fit.path, p.lba) for p in planned.placed], [(REBUILD, PACK_AT), (REBUILD, FINALS_AT)])
        self.assertEqual([lba for lba, _ in planned.writes], [WORLD_AT, PACK_AT, FINALS_AT])
        self.assertEqual([[lba for lba, _ in p.writes] for p in planned.placed], [[WORLD_AT, PACK_AT], [WORLD_AT, FINALS_AT]])
        after = self.out.read_bytes()
        with Disc(self.out) as disc:
            self.assertEqual(disc.files[SYNTHETIC_PACK], (PACK_AT, planned.placed[0].fit.size))
            self.assertEqual(disc.files[SYNTHETIC_FINALS], (FINALS_AT, planned.placed[1].fit.size))
            self.assertNotEqual(planned.placed[0].fit.size, self.pak.size)
            self.assertNotEqual(planned.placed[1].fit.size, self.finals.size)
            self.assertEqual(Pak(disc.read_file(SYNTHETIC_PACK)).names(), ["LEVEL 1", "SPIRAL", "LEVEL 3"])
            self.assertEqual(Pak(disc.read_file(SYNTHETIC_FINALS)).names(), ["TOWER", "FINAL 2"])
        self.hold(items, planned, after)

    def test_a_pack_moved_once_is_rebuilt_in_its_new_place_or_moved_again(self):
        moving = (SYNTHETIC_PACK, SLOT, stream_of(synthetic(LEVELS[RELOCATE])), TITLE)
        lighter = (SYNTHETIC_PACK, 0, stream_of(synthetic(20, "Tower")), "Tower")
        heavier = (SYNTHETIC_PACK, 0, stream_of(synthetic(LEVELS[RELOCATE], "Tower")), "Tower")
        rebuilt_ = place_all(self.src, [moving, lighter], self.out)
        self.assertEqual([(p.fit.path, p.lba) for p in rebuilt_.placed], [(RELOCATE, ROOM_AT), (REBUILD, ROOM_AT)])
        self.assertEqual([lba for lba, _ in rebuilt_.writes], [WORLD_AT, ROOM_AT, ROOM_AT + 1])
        self.assertEqual(rebuilt_.placed[1].fit.names, ["TOWER", "SPIRAL", "LEVEL 3"])
        self.hold([moving, lighter], rebuilt_, self.out.read_bytes())
        moved = place_all(self.src, [moving, heavier], self.out)
        self.assertEqual([(p.fit.path, p.lba) for p in moved.placed], [(RELOCATE, ROOM_AT), (RELOCATE, ROOM_AT + 3)])
        self.assertEqual([lba for lba, _ in moved.writes], [WORLD_AT, ROOM_AT, ROOM_AT + 1, ROOM_AT + 3, ROOM_AT + 4, ROOM_AT + 5])
        after = self.out.read_bytes()
        self.assertEqual(raw(after, ROOM_AT), dict(moved.placed[0].writes)[ROOM_AT])
        self.assertEqual(user(after, ROOM_AT + 2), bytes(USER))
        self.assertEqual(raw(after, PACK_AT), raw(IMAGE, PACK_AT))
        with Disc(self.out) as disc:
            self.assertEqual(disc.files[SYNTHETIC_PACK], (ROOM_AT + 3, moved.placed[1].fit.size))
        self.hold([moving, heavier], moved, after)

    def test_a_set_across_packs_is_one_list_of_sectors(self):
        items = [self.first, (SYNTHETIC_FINALS, 0, stream_of(synthetic(5, "Tower")), "Tower")]
        planned = place_all(self.src, items, self.out)
        self.assertEqual([(p.fit.path, p.lba) for p in planned.placed], [(IN_PLACE, PACK_AT), (REBUILD, FINALS_AT)])
        self.assertEqual([lba for lba, _ in planned.writes], [WORLD_AT, PACK_AT, FINALS_AT])
        self.hold(items, planned, self.out.read_bytes())

    def test_the_set_is_proven_on_the_copy_as_one_placement_is(self):
        items = [self.first, self.second]
        planned = place_all(self.src, items, self.out)
        self.hold(items, planned, self.out.read_bytes())
        with Disc(self.out) as disc:
            with self.assertRaisesRegex(ValueError, f"{SYNTHETIC_PACK}#{SLOT} does not inflate to the level"):
                verify_all(disc, [(SYNTHETIC_PACK, SLOT, self.second[2], TITLE), self.second], planned)
            with self.assertRaisesRegex(ValueError, "^the directory puts"):
                wrong = planned.placed[1]._replace(fit=planned.placed[1].fit._replace(size=planned.placed[1].fit.size + 1))
                verify_all(disc, items, planned._replace(placed=[planned.placed[0], wrong]))
        cue_ = self.out.with_suffix(".cue")
        wrong = planned._replace(placed=[planned.placed[0], wrong])
        with self.assertRaisesRegex(ValueError, "does not read back as planned, so it and its cue sheet were removed"):
            written(self.src, self.out, planned.writes, lambda disc: verify_all(disc, items, wrong))
        self.assertFalse(self.out.exists() or cue_.exists())

    def test_two_levels_naming_one_slot_are_refused(self):
        with Disc(self.src) as disc:
            with self.assertRaisesRegex(ValueError, f"^two levels name {SYNTHETIC_PACK.lower()}#{SLOT}, which holds one$"):
                plan_all(disc, [self.first, (SYNTHETIC_PACK.lower(), SLOT, self.second[2], "Tower")])
            self.assertEqual(len(plan_all(disc, [self.first, self.second]).placed), 2)


@unittest.skipUnless(os.environ.get("KULA_DISC"), "needs the disc under $KULA_DISC")
class TheDisc(unittest.TestCase):
    PACK = "/HIRO/HIRO.PAK"
    CHUNK = 8 << 20

    @classmethod
    def setUpClass(cls):
        cls.disc = open_disc()
        cls.dir = Path(tempfile.mkdtemp())
        cls.copy = cls.dir / "copy.bin"
        shutil.copyfile(os.environ["KULA_DISC"], cls.copy)

    @classmethod
    def tearDownClass(cls):
        cls.disc.close()
        shutil.rmtree(cls.dir)

    def test_the_writer_reproduces_every_pack_of_the_disc_but_for_its_padding(self):
        for _, path in packs(self.disc):
            blob = self.disc.read_file(path)
            pak = Pak(blob)
            again = pack(pak.names(), pak.streams())
            first = pak.entries[0]["offset"]
            end = blob.index(b"\0", struct.unpack_from("<I", blob, 4 + len(pak) * 12 - 4)[0]) + 1
            self.assertEqual(len(again), len(blob), path)
            self.assertEqual(again[:end], blob[:end], path)
            self.assertEqual(again[first:], blob[first:], path)
            self.assertIn(first - end, range(1, 5), path)

    def placed(self, pack_path, slot, stream, title):
        """Write the plan into the copy, hold it, and put the copy back."""
        placed = plan(self.disc, pack_path, slot, stream, title)
        self.assertEqual(placed.warnings, [])
        kept = [(lba, raw_sector(self.disc.f, lba)) for lba, _ in placed.writes]
        write_sectors(self.copy, placed.writes)
        try:
            with Disc(self.copy) as disc:
                verify(disc, pack_path, slot, stream, placed)
                pak = Pak(disc.read_file(pack_path))
                before = Pak(self.disc.read_file(pack_path))
                for i in range(len(pak)):
                    self.assertEqual(pak.level(i), zlib.decompress(stream) if i == slot else before.level(i))
                    self.assertEqual(Level(pak.level(i)).verify(), [])
                at, pos = disc.records[pack_path]
                (lba_le, lba_be), (size_le, size_be) = both_ways(disc.sector(at), pos)
                self.assertEqual(((lba_le, size_le), (lba_be, size_be)), ((placed.lba, placed.fit.size),) * 2)
                for lba, raw_ in placed.writes:
                    self.assertTrue(check(raw_) and rebuilt(raw_, lba), lba)
                    self.assertEqual(raw_sector(disc.f, lba), raw_)
            self.image_is_the_disc_with(placed.writes)
        finally:
            write_sectors(self.copy, kept)
        with open(self.copy, "rb") as f:
            for lba, raw_ in kept:
                self.assertEqual(raw_sector(f, lba), raw_)
        return placed

    def image_is_the_disc_with(self, writes):
        """The copy is the disc with these sectors written and nothing else."""
        writes = dict(writes)
        with open(os.environ["KULA_DISC"], "rb") as a, open(self.copy, "rb") as b:
            at = 0
            while True:
                want, got = bytearray(a.read(self.CHUNK)), b.read(self.CHUNK)
                if not want:
                    self.assertEqual(got, b"")
                    break
                for lba, raw_ in writes.items():
                    lo, hi = lba * SECTOR_RAW - at, (lba + 1) * SECTOR_RAW - at
                    if hi > 0 and lo < len(want):
                        want[max(lo, 0):min(hi, len(want))] = raw_[max(-lo, 0):len(raw_) - max(hi - len(want), 0)]
                self.assertEqual(bytes(want), got, f"the chunk at {at} differs")
                at += len(want)

    def test_level_1_s_own_stream_goes_back_in_place_with_a_few_bytes_to_spare(self):
        pak = Pak(self.disc.read_file(self.PACK), self.PACK)
        own = stream_of(project_of_level(Level(pak.level(0), pak.name(0), "HIRO")))
        placed = self.placed(self.PACK, 0, own, None)
        self.assertEqual((placed.fit.path, placed.fit.room, placed.lba), (IN_PLACE, pak.entries[0]["size"] - len(own), 1002))
        self.assertEqual([lba for lba, _ in placed.writes], [1002])
        self.assertEqual(placed.fit.names, pak.names())

    def test_a_larger_level_takes_each_path_in_turn(self):
        pak = Pak(self.disc.read_file(self.PACK), self.PACK)
        taken = {}
        for n in (4, 30, 80, 150):
            stream = stream_of(synthetic(n))
            placed = self.placed(self.PACK, 0, stream, TITLE)
            taken[(placed.fit.path, placed.fit.recompressed)] = (n, placed)
        self.assertEqual(set(taken), {(IN_PLACE, False), (REBUILD, False), (REBUILD, True), (RELOCATE, False)})
        n, rebuilt_ = taken[(REBUILD, False)]
        self.assertEqual([lba for lba, _ in rebuilt_.writes], [322] + list(range(1002, 1008)))
        self.assertEqual(rebuilt_.fit.names, ["SPIRAL"] + pak.names()[1:])
        self.assertEqual(rebuilt_.fit.room, 12288 - rebuilt_.fit.size)
        n, moved = taken[(RELOCATE, False)]
        self.assertEqual(moved.lba, 93953)
        self.assertEqual([lba for lba, _ in moved.writes][:1], [322])
        self.assertEqual([lba for lba, _ in moved.writes][1:], list(range(93953, 93953 + len(moved.writes) - 1)))
        self.assertEqual(moved.writes[-1][1][SUBHEADER_OFF + 2], EOF_SUBMODE)

    def test_inca_has_no_slack_so_a_longer_level_recompresses_the_pack(self):
        pak = Pak(self.disc.read_file("/INCA/INCA.PAK"))
        stream = stream_of(synthetic(15))
        self.assertGreater(len(stream), pak.entries[0]["size"])
        placed = self.placed("/INCA/INCA.PAK", 0, stream, TITLE)
        self.assertEqual((placed.fit.path, placed.fit.recompressed, placed.lba), (REBUILD, True, 3609))
        self.assertLess(placed.fit.size, 12288)
        self.assertEqual([lba for lba, _ in placed.writes], [3293] + list(range(3609, 3615)))

    def test_two_levels_go_in_together_each_over_the_image_the_earlier_leaves(self):
        pak = Pak(self.disc.read_file(self.PACK), self.PACK)
        items = [(self.PACK, 0, stream_of(synthetic(4)), TITLE), (self.PACK, 1, stream_of(synthetic(30, "Tower")), "Tower")]
        planned = plan_all(self.disc, items)
        self.assertEqual(planned.warnings, [])
        self.assertEqual([(p.fit.path, p.fit.recompressed, p.lba) for p in planned.placed],
                         [(IN_PLACE, False, 1002), (REBUILD, False, 1002)])
        self.assertEqual([lba for lba, _ in planned.writes], [322] + list(range(1002, 1008)))
        self.assertEqual([lba for lba, _ in planned.placed[0].writes], [1002])
        self.assertEqual(planned.placed[1].fit.names, [pak.name(0), "TOWER"] + pak.names()[2:])
        self.assertEqual(planned.placed[1].fit.streams[0], items[0][2])
        kept = [(lba, raw_sector(self.disc.f, lba)) for lba, _ in planned.writes]
        write_sectors(self.copy, planned.writes)
        try:
            with Disc(self.copy) as disc:
                verify_all(disc, items, planned)
                after = Pak(disc.read_file(self.PACK))
                for i in range(len(after)):
                    self.assertEqual(after.level(i), zlib.decompress(items[i][2]) if i < 2 else pak.level(i))
                    self.assertEqual(Level(after.level(i)).verify(), [])
                self.assertEqual(disc.files[self.PACK], (1002, planned.placed[1].fit.size))
            self.image_is_the_disc_with(planned.writes)
        finally:
            write_sectors(self.copy, kept)

    def test_the_canonical_rebuild_of_a_level_goes_back_into_its_own_slot_in_place_but_for_six(self):
        paths, longer = Counter(), []
        for _, path in packs(self.disc):
            pak = Pak(self.disc.read_file(path), path)
            lba, size = self.disc.files[path]
            capacity = len(range(lba, lba + (size + USER - 1) // USER)) * USER
            for i in range(len(pak)):
                stream = zlib.compress(canonical(project_of_level(Level(pak.level(i), pak.name(i)))), 6)
                f = fit(pak, capacity, i, stream)
                paths[f.path] += 1
                if f.path != IN_PLACE:
                    longer.append((pak.name(i), len(stream) - pak.entries[i]["size"], f.recompressed))
        self.assertEqual(paths, {IN_PLACE: 224, REBUILD: 6})
        self.assertEqual(longer, [("BONUS 1", 6, False), ("SIMON 4", 2, False), ("LEVEL 33", 1, True),
                                  ("LEVEL 86", 2, False), ("LEVEL 87", 5, False), ("BONUS 30", 82, False)])


class Image:
    """One release's image, opened through its own variable, is an image of its disc."""
    release = None

    def test_the_image_is_the_disc(self):
        disc = open_release(self.release)
        self.addCleanup(disc.close)
        self.assertEqual(identify(disc), [])


@unittest.skipUnless(os.environ.get(DISC_VARS["us"]), f"needs the disc under ${DISC_VARS['us']}")
class TheImage(Image, unittest.TestCase):
    release = "us"


@unittest.skipUnless(os.environ.get(DISC_VARS["eu"]), f"needs the PAL disc under ${DISC_VARS['eu']}")
class ThePalImage(Image, unittest.TestCase):
    release = "eu"


@unittest.skipUnless(os.environ.get(DISC_VARS["jp"]), f"needs the Japanese disc under ${DISC_VARS['jp']}")
class TheJapaneseImage(Image, unittest.TestCase):
    release = "jp"


if __name__ == "__main__":
    unittest.main()
