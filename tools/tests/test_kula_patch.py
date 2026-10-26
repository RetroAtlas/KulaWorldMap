"""Unit tests for the patch writer: python3 -m unittest discover -s tools/tests

The patches are proven by appliers of their own here: a PPF applier and a
VCDIFF decoder that knows COPY and ADD, which is all the writer uses. xdelta3
decodes them too where it is on PATH. The last class holds the patches to
the disc under $KULA_DISC and is skipped without it.
"""

import contextlib
import errno
import io
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
import zlib
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from disc import Disc  # noqa: E402
from kula_disc import RELEASES, RELEASE_FILES  # noqa: E402
from kula_kwl import DATA, canonical, project_of_level, template  # noqa: E402
from kula_level import Level  # noqa: E402
from kula_pak import Pak  # noqa: E402
from kula_patch import (  # noqa: E402
    ADD,
    BLOCK,
    BLOCK_AT,
    CASES,
    COPY,
    DESCRIPTION,
    FIXTURE,
    PPF_MAGIC,
    PREFIX,
    RECORD_MOST,
    SETS,
    SLOT,
    TITLE,
    VCD_ADLER32,
    VCD_SOURCE,
    VCDIFF_MAGIC,
    WINDOW,
    changes,
    description,
    digest,
    fixture,
    items_of,
    main,
    placements,
    ppf,
    runs,
    shipped,
    varint,
    vcdiff,
)
from kula_place import SYNTHETIC_FINALS, SYNTHETIC_PACK, place, place_all, plan, plan_all, synthetic, synthetic_image  # noqa: E402
from kula_sector import SECTOR_RAW  # noqa: E402
from test_kula_disc import booting  # noqa: E402

IMAGE = synthetic_image()
CASE = {name: n for name, n in CASES}
TOOL = Path(__file__).resolve().parents[1] / "kula_patch.py"


def stream_of(n):
    return zlib.compress(canonical(synthetic(n)), 6)


def apply_ppf(original, patch):
    """The original with a PPF 3.0 patch's records laid over it."""
    assert patch[:5] == PPF_MAGIC and patch[5] == 2, "not a PPF 3.0 patch"
    assert patch[56:60] == bytes([0, 1, 0, 0]), "a BIN image, block check on, no undo data"
    assert patch[60:60 + BLOCK] == original[BLOCK_AT:BLOCK_AT + BLOCK], "the block check fails"
    out = bytearray(original)
    pos = 60 + BLOCK
    while pos < len(patch):
        at, n = struct.unpack_from("<QB", patch, pos)
        pos += 9
        out[at:at + n] = patch[pos:pos + n]
        pos += n
    return bytes(out)


def ppf_records(patch):
    out, pos = [], 60 + BLOCK
    while pos < len(patch):
        at, n = struct.unpack_from("<QB", patch, pos)
        out.append((at, patch[pos + 9:pos + 9 + n]))
        pos += 9 + n
    return out


def read_varint(buf, pos):
    n = 0
    while True:
        b = buf[pos]
        pos += 1
        n = (n << 7) | (b & 0x7F)
        if not b & 0x80:
            return n, pos


def decode_vcdiff(source, patch):
    """The target a VCDIFF patch of COPY and ADD instructions builds from the
    source, every window's Adler-32 and lengths checked on the way."""
    assert patch[:5] == VCDIFF_MAGIC + b"\0", "not a VCDIFF with no secondary compression or code table"
    pos, out, windows = 5, bytearray(), 0
    while pos < len(patch):
        windows += 1
        assert patch[pos] == VCD_SOURCE | VCD_ADLER32
        src_len, pos = read_varint(patch, pos + 1)
        src_pos, pos = read_varint(patch, pos)
        delta_len, pos = read_varint(patch, pos)
        body = pos
        target_len, pos = read_varint(patch, pos)
        assert patch[pos] == 0, "a delta indicator of 0"
        data_len, pos = read_varint(patch, pos + 1)
        inst_len, pos = read_varint(patch, pos)
        addr_len, pos = read_varint(patch, pos)
        adler = int.from_bytes(patch[pos:pos + 4], "big")
        pos += 4
        data, inst, addr = (patch[pos:pos + data_len], patch[pos + data_len:pos + data_len + inst_len],
                            patch[pos + data_len + inst_len:pos + data_len + inst_len + addr_len])
        pos += data_len + inst_len + addr_len
        assert pos - body == delta_len, "the delta encoding length counts everything after it"
        assert (src_pos, src_len) == (len(out), target_len), "the source segment is the window's own stretch"
        segment = source[src_pos:src_pos + src_len]
        target, ip, dp, ap = bytearray(), 0, 0, 0
        while ip < inst_len:
            op = inst[ip]
            size, ip = read_varint(inst, ip + 1)
            if op == COPY:
                at, ap = read_varint(addr, ap)
                target += segment[at:at + size]
            elif op == ADD:
                target += data[dp:dp + size]
                dp += size
            else:
                raise AssertionError(f"opcode {op}")
        assert (dp, ap, len(target)) == (data_len, addr_len, target_len), "every section is consumed whole"
        assert zlib.adler32(bytes(target)) == adler, "the window's checksum"
        out += target
    return bytes(out), windows


class Varints(unittest.TestCase):
    def test_base_128_most_significant_first_with_the_continuation_bit_high(self):
        self.assertEqual(varint(0), b"\x00")
        self.assertEqual(varint(127), b"\x7f")
        self.assertEqual(varint(128), b"\x81\x00")
        self.assertEqual(varint(123456789), b"\xba\xef\x9a\x15")
        for n in (0, 1, 127, 128, 16383, 16384, 2 ** 32 - 1, 257795664):
            self.assertEqual(read_varint(varint(n), 0), (n, len(varint(n))), n)


class Runs(unittest.TestCase):
    def test_the_stretches_that_differ(self):
        self.assertEqual(runs(b"abcdef", b"abcdef"), [])
        self.assertEqual(runs(b"abcdef", b"Abcdef"), [(0, 1)])
        self.assertEqual(runs(b"abcdef", b"abcdeF"), [(5, 1)])
        self.assertEqual(runs(b"abcdef", b"aBCdEF"), [(1, 2), (4, 2)])
        self.assertEqual(runs(b"abcdef", b"ABCDEF"), [(0, 6)])


class ThePatches(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = Path(tempfile.mkdtemp())
        cls.src = cls.dir / "image.bin"
        cls.src.write_bytes(IMAGE)
        cls.cases = {}
        for name, n in CASES:
            stream = stream_of(n)
            out = cls.dir / f"{n}.bin"
            placed = place(cls.src, SYNTHETIC_PACK, SLOT, stream, out, TITLE)
            cls.cases[name] = (placed, out.read_bytes())

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.dir)

    def test_a_ppf_is_the_header_the_block_check_and_a_record_for_every_changed_stretch(self):
        for name, (placed, patched) in self.cases.items():
            with self.subTest(name):
                patch = ppf(self.src, placed.writes, PREFIX + TITLE)
                self.assertEqual(patch[:6], PPF_MAGIC + b"\x02")
                self.assertEqual(patch[6:56], (PREFIX + TITLE).encode().ljust(DESCRIPTION))
                self.assertEqual(patch[56:60], bytes([0, 1, 0, 0]))
                self.assertEqual(patch[60:1084], IMAGE[BLOCK_AT:BLOCK_AT + BLOCK])
                self.assertEqual(IMAGE[BLOCK_AT:BLOCK_AT + 11], b"PLAYSTATION")
                records = ppf_records(patch)
                self.assertEqual([at for at, _ in records], sorted(at for at, _ in records))
                differing = sum(1 for a, b in zip(IMAGE, patched) if a != b)
                self.assertEqual(sum(len(data) for _, data in records), differing)
                for at, data in records:
                    self.assertIn(len(data), range(1, RECORD_MOST + 1))
                    self.assertTrue(all(IMAGE[at + i] != data[i] for i in range(len(data))))
                    self.assertEqual(patched[at:at + len(data)], data)
                self.assertEqual(apply_ppf(IMAGE, patch), patched)

    def test_a_long_description_is_cut_and_a_short_one_padded(self):
        placed, _ = self.cases["in place"]
        self.assertEqual(ppf(self.src, placed.writes, "x" * 80)[6:56], b"x" * 50)
        self.assertEqual(ppf(self.src, placed.writes, "Kula World Map: Épée")[6:56], b"Kula World Map: ?p?e".ljust(50))
        self.assertEqual(ppf(self.src, placed.writes, "a\tb\nc\x7fd\0")[6:56], b"a?b?c?d?".ljust(50))

    def test_a_vcdiff_decodes_to_the_patched_image_and_copies_the_rest_from_the_source(self):
        for name, (placed, patched) in self.cases.items():
            with self.subTest(name):
                patch = vcdiff(self.src, placed.writes)
                self.assertEqual(patch[:5], VCDIFF_MAGIC + b"\0")
                target, windows = decode_vcdiff(IMAGE, patch)
                self.assertEqual((target, windows), (patched, 1))
                self.assertLess(len(patch), len(ppf(self.src, placed.writes, PREFIX + TITLE)))

    def test_windows_of_a_size_that_cuts_a_sector_in_two_decode_the_same(self):
        placed, patched = self.cases["relocate"]
        for window in (WINDOW, 16384, 7 * SECTOR_RAW + 1, 2048):
            with self.subTest(window):
                patch = vcdiff(self.src, placed.writes, window)
                target, windows = decode_vcdiff(IMAGE, patch)
                self.assertEqual(target, patched)
                self.assertEqual(windows, -(-len(IMAGE) // window))
        sectors = {lba for lba, _ in placed.writes}
        self.assertTrue(any((lba * SECTOR_RAW) // 16384 != ((lba + 1) * SECTOR_RAW - 1) // 16384 for lba in sectors))

    def test_the_changes_are_the_differing_stretches_of_the_written_sectors(self):
        for name, (placed, patched) in self.cases.items():
            with self.subTest(name):
                changed = changes(self.src, placed.writes)
                self.assertEqual([at for at, _ in changed], sorted(at for at, _ in changed))
                for at, data in changed:
                    self.assertEqual(patched[at:at + len(data)], data)
                    self.assertIn(at // SECTOR_RAW, {lba for lba, _ in placed.writes})
                    self.assertNotEqual(IMAGE[at], data[0])
                    self.assertNotEqual(IMAGE[at + len(data) - 1], data[-1])
                sectors = {at // SECTOR_RAW for at, _ in changed}
                self.assertEqual(sectors, {lba for lba, _ in placed.writes})

    def test_the_placements_name_the_image_for_two_emulators_and_the_folder_given_for_two(self):
        lines = placements("/discs/Roll Away.bin", "out/spiral", "SLUS_007.24")
        self.assertEqual(len(lines), 3)
        self.assertIn("Roll Away.ppf", lines[0])
        self.assertIn("DuckStation", lines[0])
        self.assertIn("PCSX-Redux", lines[0])
        self.assertIn("ePSXe", lines[1])
        for entry in RELEASES.values():
            self.assertIn(f"folder as {entry['boot']}, with no extension", placements("/discs/x.bin", "out/spiral", entry["boot"])[1])
        self.assertEqual(placements("/discs/Roll Away.bin", "out/spiral", None), [lines[0], lines[2]])
        self.assertIn('xdelta3 -d -s "Roll Away.bin" "spiral.xdelta" "spiral.bin"', lines[2])
        spaced = placements("/discs/Roll Away.bin", "out/level 4", "SLUS_007.24")[2]
        self.assertTrue(spaced.endswith('xdelta3 -d -s "Roll Away.bin" "level 4.xdelta" "level 4.bin"'), spaced)

    @unittest.skipUnless(shutil.which("xdelta3"), "needs xdelta3 on PATH")
    def test_xdelta3_decodes_them(self):
        for name, (placed, patched) in self.cases.items():
            with self.subTest(name):
                patch = self.dir / "patch.xdelta"
                patch.write_bytes(vcdiff(self.src, placed.writes, 16384))
                out = self.dir / "decoded.bin"
                subprocess.run(["xdelta3", "-d", "-f", "-s", self.src, patch, out], check=True)
                self.assertEqual(out.read_bytes(), patched)


class TheFixture(unittest.TestCase):
    def test_it_regenerates_byte_for_byte(self):
        with tempfile.TemporaryDirectory() as scratch:
            self.assertEqual(fixture(scratch), FIXTURE.read_text())

    def test_it_holds_every_path_once_and_its_digests_are_sha_256(self):
        held = json.loads(FIXTURE.read_text())
        self.assertEqual(held["image"], digest(IMAGE))
        self.assertEqual((held["pack"], held["slot"], held["title"]), (SYNTHETIC_PACK, SLOT, TITLE))
        self.assertEqual([c["name"] for c in held["cases"]], [name for name, _ in CASES])
        self.assertEqual([(c["path"], c["recompressed"]) for c in held["cases"]],
                         [("in place", False), ("rebuild", False), ("rebuild", True), ("relocate", False)])
        for c in held["cases"]:
            for key in ("patched", "ppf", "xdelta"):
                self.assertRegex(c[key], r"^[0-9a-f]{64}$")
            self.assertEqual(c["sectors"], sorted(c["sectors"]))
        self.assertEqual(held["cases"][0]["sectors"], [25])
        self.assertEqual(held["cases"][1]["sectors"], [24, 25])
        self.assertEqual(held["cases"][3]["sectors"], [24, 27, 28])
        self.assertEqual(held["cases"][3]["lba"], 27)

    def test_it_holds_two_sets_whose_first_level_is_the_in_place_case(self):
        held = json.loads(FIXTURE.read_text())
        self.assertEqual([s["name"] for s in held["sets"]], [name for name, _ in SETS])
        self.assertEqual([[pack for _, pack, _, _ in members] for _, members in SETS],
                         [[SYNTHETIC_PACK, SYNTHETIC_PACK], [SYNTHETIC_PACK, SYNTHETIC_FINALS]])
        fields = ("blocks", "stream", "path", "recompressed", "size", "room", "lba")
        for s, (_, members) in zip(held["sets"], SETS):
            with self.subTest(s["name"]):
                self.assertEqual([(i["blocks"], i["pack"], i["slot"], i["title"]) for i in s["items"]], members)
                self.assertEqual([(i["path"], i["recompressed"]) for i in s["items"]], [("in place", False), ("rebuild", False)])
                self.assertEqual({k: s["items"][0][k] for k in fields}, {k: held["cases"][0][k] for k in fields})
                for key in ("patched", "ppf", "xdelta"):
                    self.assertRegex(s[key], r"^[0-9a-f]{64}$")
                self.assertEqual(s["sectors"], sorted(set(s["sectors"])))
        self.assertEqual([s["sectors"] for s in held["sets"]], [[24, 25], [24, 25, 26]])
        self.assertEqual([i["lba"] for i in held["sets"][1]["items"]], [25, 26])


class TheSets(unittest.TestCase):
    def test_each_set_holds_through_place_all_and_the_patch_writers(self):
        held = {s["name"]: s for s in json.loads(FIXTURE.read_text())["sets"]}
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            src = scratch / "image.bin"
            src.write_bytes(IMAGE)
            for name, members in SETS:
                with self.subTest(name):
                    items = items_of(members)
                    out = scratch / f"{name}.bin"
                    planned = place_all(src, items, out)
                    s = held[name]
                    self.assertEqual(
                        [(len(stream), p.fit.path, p.fit.recompressed, p.fit.size, p.fit.room, p.lba)
                         for (_, _, stream, _), p in zip(items, planned.placed)],
                        [(i["stream"], i["path"], i["recompressed"], i["size"], i["room"], i["lba"]) for i in s["items"]])
                    self.assertEqual([lba for lba, _ in planned.writes], s["sectors"])
                    patched = out.read_bytes()
                    self.assertEqual(digest(patched), s["patched"])
                    patch = ppf(src, planned.writes, description(title for *_, title in items))
                    self.assertEqual(digest(patch), s["ppf"])
                    self.assertEqual(patch[6:56], b"Kula World Map: Spiral, Tower".ljust(DESCRIPTION))
                    self.assertEqual(apply_ppf(IMAGE, patch), patched)
                    delta = vcdiff(src, planned.writes)
                    self.assertEqual(digest(delta), s["xdelta"])
                    self.assertEqual(decode_vcdiff(IMAGE, delta), (patched, 1))
                    with Disc(out) as disc:
                        for pack_path, slot, stream, _ in items:
                            self.assertEqual(Pak(disc.read_file(pack_path)).level(slot), zlib.decompress(stream))
                    self.assertEqual(src.read_bytes(), IMAGE)


class TheTool(unittest.TestCase):
    def test_it_writes_the_image_the_ppf_and_the_xdelta_the_fixture_holds(self):
        held = json.loads(FIXTURE.read_text())["cases"][0]
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            (scratch / "spiral.kula.json").write_text(json.dumps(synthetic(CASE["in place"])))
            done = subprocess.run([sys.executable, TOOL, "--level", scratch / "spiral.kula.json", "--into",
                                   f"{SYNTHETIC_PACK}#{SLOT}", "--out", scratch / "out.spiral", "--disc", scratch / "image.bin"],
                                  capture_output=True, text=True)
            self.assertEqual(done.returncode, 0, done.stderr)
            self.assertIn(f"in place, {held['room']} bytes of room", done.stdout)
            self.assertIn("1 sectors written: 25", done.stdout)
            self.assertIn("19 of the 21 packs are missing", done.stderr)
            self.assertEqual(digest((scratch / "out.spiral.bin").read_bytes()), held["patched"])
            self.assertEqual(digest((scratch / "out.spiral.ppf").read_bytes()), held["ppf"])
            self.assertEqual(digest((scratch / "out.spiral.xdelta").read_bytes()), held["xdelta"])
            self.assertEqual((scratch / "out.spiral.cue").read_text().splitlines()[0], 'FILE "out.spiral.bin" BINARY')

    def test_two_levels_go_in_as_one_patch_with_a_line_for_each(self):
        held = json.loads(FIXTURE.read_text())["sets"][0]
        spiral, tower = held["items"]
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            (scratch / "spiral.kula.json").write_text(json.dumps(synthetic(spiral["blocks"])))
            (scratch / "tower.kula.json").write_text(json.dumps(synthetic(tower["blocks"], tower["title"])))
            done = subprocess.run([sys.executable, TOOL, "--level", scratch / "spiral.kula.json", "--into", f"{SYNTHETIC_PACK}#{spiral['slot']}",
                                   "--level", scratch / "tower.kula.json", "--into", f"{SYNTHETIC_PACK}#{tower['slot']}",
                                   "--out", scratch / "world", "--disc", scratch / "image.bin"],
                                  capture_output=True, text=True)
            self.assertEqual(done.returncode, 0, done.stderr)
            self.assertEqual(done.stdout.splitlines()[:3], [
                f"Spiral ({spiral['stream']} bytes) into {SYNTHETIC_PACK}#{spiral['slot']}: in place, {spiral['room']} bytes of room, "
                f"the pack {spiral['size']} bytes at sector {spiral['lba']}",
                f"Tower ({tower['stream']} bytes) into {SYNTHETIC_PACK}#{tower['slot']}: rebuild, {tower['room']} bytes of room, "
                f"the pack {tower['size']} bytes at sector {tower['lba']}",
                "2 sectors written: 24, 25"])
            self.assertEqual(done.stderr.splitlines(), ["warning: a key and no exit"] * 2 + [
                "warning: the image has 43 sectors, not the 109,607 of the Roll Away disc", "warning: 19 of the 21 packs are missing"])
            self.assertIn("  ePSXe and PCSX-ReARMed read it from their patches folder as SLUS_007.24, with no extension",
                          done.stdout.splitlines())
            self.assertEqual(digest((scratch / "world.bin").read_bytes()), held["patched"])
            self.assertEqual(digest((scratch / "world.ppf").read_bytes()), held["ppf"])
            self.assertEqual(digest((scratch / "world.xdelta").read_bytes()), held["xdelta"])
            self.assertEqual((scratch / "world.ppf").read_bytes()[6:56], b"Kula World Map: Spiral, Tower".ljust(DESCRIPTION))
            with Disc(scratch / "image.bin") as disc:
                before = Pak(disc.read_file(SYNTHETIC_PACK))
            with Disc(scratch / "world.bin") as disc:
                pak = Pak(disc.read_file(SYNTHETIC_PACK))
            self.assertEqual(pak.names(), ["LEVEL 1", "LEVEL 2", "TOWER"])
            self.assertEqual([pak.level(i) for i in range(3)],
                             [before.level(0), canonical(synthetic(spiral["blocks"])), canonical(synthetic(tower["blocks"]))])

    def test_a_shipped_level_is_the_disc_s_that_release_names_and_the_folder_the_image_s_own(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "us.bin").write_bytes(IMAGE)
            (scratch / "eu.bin").write_bytes(booting(b"SCES_010.00"))
            run = lambda out, image, *more: subprocess.run(  # noqa: E731
                [sys.executable, TOOL, "--level", "/HELL/HELL.PAK#17", "--into", f"{SYNTHETIC_PACK}#{SLOT}",
                 "--out", scratch / out, "--disc", scratch / image, "--ppf", *more], capture_output=True, text=True)
            base, pal = run("base", "us.bin"), run("pal", "eu.bin", "--release", "eu")
            sizes = [len(zlib.compress(canonical(template(shipped(r), "/HELL/HELL.PAK#17")), 6)) for r in ("us", "eu")]
            self.assertNotEqual(*sizes)
            for done, size, boot in ((base, sizes[0], "SLUS_007.24"), (pal, sizes[1], "SCES_010.00")):
                self.assertEqual(done.returncode, 0, done.stderr)
                self.assertIn(f"BONUS 30 ({size} bytes) into {SYNTHETIC_PACK}#{SLOT}: rebuild", done.stdout)
                self.assertIn(f"patches folder as {boot}, with no extension", done.stdout)
            self.assertIn("warning: the image has 43 sectors, not the 108,471 of the Kula World disc", pal.stderr)
            self.assertNotEqual((scratch / "base.ppf").read_bytes(), (scratch / "pal.ppf").read_bytes())

    def test_one_level_without_an_into_goes_into_the_first_slot_of_hiro(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            (scratch / "spiral.kula.json").write_text(json.dumps(synthetic(CASE["in place"])))
            done = subprocess.run([sys.executable, TOOL, "--level", scratch / "spiral.kula.json",
                                   "--out", scratch / "spiral", "--disc", scratch / "image.bin", "--ppf"],
                                  capture_output=True, text=True)
            self.assertEqual(done.returncode, 0, done.stderr)
            self.assertIn("Spiral (305 bytes) into /HIRO/HIRO.PAK#0: ", done.stdout)
            self.assertEqual(len(done.stdout.splitlines()), 5)

    def test_levels_and_slots_that_do_not_pair_up_are_refused_before_any_level_is_read(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            spiral, missing = scratch / "spiral.kula.json", scratch / "missing.kula.json"
            spiral.write_text(json.dumps(synthetic(CASE["in place"])))
            into = f"{SYNTHETIC_PACK}#{SLOT}"
            for more, levels, intos in (
                (("--level", spiral, "--level", missing), 2, 0),
                (("--level", spiral, "--level", missing, "--into", into), 2, 1),
                (("--level", spiral, "--into", into, "--into", into), 1, 2),
            ):
                with self.subTest((levels, intos)):
                    done = subprocess.run([sys.executable, TOOL, *more, "--out", scratch / "out", "--disc", scratch / "image.bin", "--ppf"],
                                          capture_output=True, text=True)
                    self.assertEqual(done.returncode, 1, done.stderr)
                    self.assertEqual(done.stdout, "")
                    self.assertEqual(done.stderr.splitlines(),
                                     [f"{levels} --level and {intos} --into do not pair up; say one --into after each --level"])
            self.assertEqual(sorted(p.name for p in scratch.iterdir()), ["image.bin", "spiral.kula.json"])

    def test_two_levels_naming_one_slot_are_refused_in_a_sentence_and_nothing_is_written(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            (scratch / "spiral.kula.json").write_text(json.dumps(synthetic(CASE["in place"])))
            (scratch / "tower.kula.json").write_text(json.dumps(synthetic(CASE["rebuild"], "Tower")))
            into = f"{SYNTHETIC_PACK}#{SLOT}"
            done = subprocess.run([sys.executable, TOOL, "--level", scratch / "spiral.kula.json", "--into", into,
                                   "--level", scratch / "tower.kula.json", "--into", into,
                                   "--out", scratch / "out", "--disc", scratch / "image.bin"],
                                  capture_output=True, text=True)
            self.assertEqual(done.returncode, 1, done.stderr)
            self.assertEqual(done.stdout, "")
            self.assertEqual(done.stderr.splitlines()[-1], f"two levels name {into}, which holds one")
            self.assertNotIn("Traceback", done.stderr)
            self.assertEqual(sorted(p.name for p in scratch.iterdir()), ["image.bin", "spiral.kula.json", "tower.kula.json"])

    def test_a_level_with_errors_among_several_is_named_in_the_refusal(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            (scratch / "spiral.kula.json").write_text(json.dumps(synthetic(CASE["in place"])))
            bad = synthetic(CASE["rebuild"], "Tower")
            del bad["blocks"][0]["faces"]
            (scratch / "tower.kula.json").write_text(json.dumps(bad))
            done = subprocess.run([sys.executable, TOOL, "--level", scratch / "spiral.kula.json", "--into", f"{SYNTHETIC_PACK}#{SLOT}",
                                   "--level", scratch / "tower.kula.json", "--into", f"{SYNTHETIC_PACK}#2",
                                   "--out", scratch / "out", "--disc", scratch / "image.bin"],
                                  capture_output=True, text=True)
            self.assertEqual(done.returncode, 1, done.stderr)
            self.assertEqual(done.stdout, "")
            self.assertIn("error: no start", done.stderr)
            self.assertEqual(done.stderr.splitlines()[-1], "Tower has errors the game would not forgive; fix them first")
            self.assertEqual(sorted(p.name for p in scratch.iterdir()), ["image.bin", "spiral.kula.json", "tower.kula.json"])

    def test_a_project_without_a_title_is_named_after_its_file(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            (scratch / "helix.kula.json").write_text(json.dumps(synthetic(CASE["in place"], title="")))
            done = subprocess.run([sys.executable, TOOL, "--level", scratch / "helix.kula.json", "--into",
                                   f"{SYNTHETIC_PACK}#{SLOT}", "--out", scratch / "helix", "--disc", scratch / "image.bin", "--ppf"],
                                  capture_output=True, text=True)
            self.assertEqual(done.returncode, 0, done.stderr)
            self.assertIn("helix (305 bytes) into", done.stdout)
            self.assertEqual((scratch / "helix.ppf").read_bytes()[6:56], b"Kula World Map: helix".ljust(50))

    def test_a_project_file_is_read_by_the_project_reader_and_its_repairs_said(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            project = synthetic(CASE["in place"])
            project["title"] = 5
            (scratch / "odd.kula.json").write_text(json.dumps(project))
            run = lambda name: subprocess.run(  # noqa: E731
                [sys.executable, TOOL, "--level", scratch / name, "--into", f"{SYNTHETIC_PACK}#{SLOT}",
                 "--out", scratch / name.split(".")[0], "--disc", scratch / "image.bin", "--ppf"],
                capture_output=True, text=True)
            done = run("odd.kula.json")
            self.assertEqual(done.returncode, 0, done.stderr)
            self.assertIn("title is not text; it is left empty", done.stderr)
            self.assertIn("odd (305 bytes) into", done.stdout)
            self.assertEqual((scratch / "odd.ppf").read_bytes()[6:56], b"Kula World Map: odd".ljust(50))
            (scratch / "other.json").write_text(json.dumps({"format": "something-else", "blocks": []}))
            other = run("other.json")
            self.assertNotEqual(other.returncode, 0)
            self.assertIn("other.json is not a kula-world-level file", other.stderr)
            (scratch / "broken.json").write_text("{not json")
            broken = run("broken.json")
            self.assertNotEqual(broken.returncode, 0)
            self.assertIn("broken.json is not JSON:", broken.stderr)
            (scratch / "latin.kula.json").write_bytes(
                json.dumps(dict(project, title="caf\u00e9"), ensure_ascii=False).encode("latin-1"))
            latin = run("latin.kula.json")
            self.assertNotEqual(latin.returncode, 0)
            self.assertEqual(latin.stderr.splitlines(), [f"{scratch / 'latin.kula.json'} is not UTF-8 text"])
            (scratch / "marked.kula.json").write_text(json.dumps(project), encoding="utf-8-sig")
            marked = run("marked.kula.json")
            self.assertEqual(marked.returncode, 0, marked.stderr)
            self.assertIn("marked (305 bytes) into", marked.stdout)

    def test_a_level_file_that_is_no_level_is_said_in_a_sentence_and_not_a_traceback(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            (scratch / "notes.kwl").write_bytes(bytes(100))
            done = subprocess.run([sys.executable, TOOL, "--level", scratch / "notes.kwl", "--into", f"{SYNTHETIC_PACK}#{SLOT}",
                                   "--out", scratch / "notes", "--disc", scratch / "image.bin", "--ppf"],
                                  capture_output=True, text=True)
            self.assertEqual(done.returncode, 1, done.stderr)
            self.assertEqual(done.stderr.splitlines(), [
                f"in {scratch / 'notes.kwl'}, 100 bytes is not a level: the lattice, six bytes and whole 256-byte stretches"])
            self.assertEqual(sorted(p.name for p in scratch.iterdir()), ["image.bin", "notes.kwl"])

    def test_a_missing_path_is_said_in_a_sentence_and_not_a_traceback(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            done = subprocess.run([sys.executable, TOOL, "--level", scratch / "missing.kula.json", "--into", f"{SYNTHETIC_PACK}#{SLOT}",
                                   "--out", scratch / "missing", "--disc", scratch / "image.bin", "--ppf"],
                                  capture_output=True, text=True)
            self.assertEqual(done.returncode, 1, done.stderr)
            self.assertEqual(done.stderr.splitlines(), [f"no file at {scratch / 'missing.kula.json'}"])
            self.assertEqual(sorted(p.name for p in scratch.iterdir()), ["image.bin"])

    @unittest.skipIf(os.name != "posix" or os.geteuid() == 0, "a permission bit stops neither Windows nor root")
    def test_a_file_the_process_cannot_read_is_said_in_a_sentence_and_not_a_traceback(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            (scratch / "spiral.kula.json").write_text(json.dumps(synthetic(CASE["in place"])))
            (scratch / "shut").mkdir()
            for where in (scratch, scratch / "shut"):
                (where / "locked.bin").write_bytes(IMAGE)
                (where / "locked.kula.json").write_text(json.dumps(synthetic(CASE["in place"])))
                (where / "locked.kwl").write_bytes(canonical(synthetic(CASE["in place"])))
            for name in ("locked.bin", "locked.kula.json", "locked.kwl"):
                os.chmod(scratch / name, 0)
            os.chmod(scratch / "shut", 0o600)
            run = lambda level, disc: subprocess.run(  # noqa: E731
                [sys.executable, TOOL, "--level", level, "--into", f"{SYNTHETIC_PACK}#{SLOT}",
                 "--out", scratch / "out", "--disc", disc, "--ppf"], capture_output=True, text=True)
            for by, where in (("the file", scratch), ("its directory", scratch / "shut")):
                for level in ("locked.kula.json", "locked.kwl"):
                    with self.subTest((by, level)):
                        done = run(where / level, scratch / "image.bin")
                        self.assertEqual(done.returncode, 1, done.stderr)
                        self.assertEqual(done.stderr.splitlines(), [f"{where / level} cannot be read: Permission denied"])
                with self.subTest((by, "locked.bin")):
                    done = run(scratch / "spiral.kula.json", where / "locked.bin")
                    self.assertEqual(done.returncode, 1, done.stderr)
                    self.assertEqual(done.stderr.splitlines()[-1], f"{where / 'locked.bin'} cannot be read: Permission denied")
                    self.assertNotIn("Traceback", done.stderr)
            os.chmod(scratch / "shut", 0o700)
            self.assertFalse((scratch / "out.ppf").exists())

    def test_a_disc_that_fails_under_the_plan_is_said_as_unread_and_a_copy_that_fails_as_unwritten(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            (scratch / "spiral.kula.json").write_text(json.dumps(synthetic(CASE["in place"])))
            argv = ["kula_patch.py", "--level", str(scratch / "spiral.kula.json"), "--into", f"{SYNTHETIC_PACK}#{SLOT}",
                    "--out", str(scratch / "spiral"), "--disc", str(scratch / "image.bin"), "--image"]
            quiet = contextlib.redirect_stderr(io.StringIO())

            def planned_over_failing_reads(disc, items):
                with mock.patch.object(Disc, "raw", side_effect=OSError(errno.EIO, os.strerror(errno.EIO))):
                    return plan_all(disc, items)

            with mock.patch.object(sys, "argv", argv), quiet, mock.patch("kula_patch.plan_all", planned_over_failing_reads), \
                    self.assertRaises(SystemExit) as cm:
                main()
            self.assertEqual(cm.exception.code, f"{scratch / 'image.bin'} cannot be read: {os.strerror(errno.EIO)}")
            full = OSError(errno.ENOSPC, os.strerror(errno.ENOSPC))
            with mock.patch.object(sys, "argv", argv), quiet, mock.patch("kula_place.write_image", side_effect=full), \
                    self.assertRaises(SystemExit) as cm:
                main()
            self.assertEqual(cm.exception.code, f"{scratch / 'spiral.bin'} cannot be written: {os.strerror(errno.ENOSPC)}")
            self.assertEqual(sorted(p.name for p in scratch.iterdir()), ["image.bin", "spiral.kula.json"])

    def test_an_output_in_no_directory_is_refused_before_anything_is_written(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            (scratch / "spiral.kula.json").write_text(json.dumps(synthetic(CASE["in place"])))
            (scratch / "notes.txt").write_text("")
            for parent in (scratch / "missing", scratch / "notes.txt"):
                for more in ((), ("--image",), ("--ppf",)):
                    with self.subTest((parent.name, more)):
                        done = subprocess.run([sys.executable, TOOL, "--level", scratch / "spiral.kula.json", "--into",
                                               f"{SYNTHETIC_PACK}#{SLOT}", "--out", parent / "spiral", "--disc", scratch / "image.bin", *more],
                                              capture_output=True, text=True)
                        self.assertEqual(done.returncode, 1, done.stderr)
                        self.assertEqual(done.stdout, "")
                        self.assertEqual(done.stderr.splitlines()[-1], f"no directory at {parent}; say another --out")
                        self.assertNotIn("Traceback", done.stderr)
            # the output is judged before the level is read, so a level that is missing or has errors hides nothing
            faulty = synthetic(CASE["in place"])
            faulty["blocks"].append({"cell": [2, 2, 30], "kind": 1, "faces": {"0": {"type": 5, "variant": 0}}})
            (scratch / "faulty.kula.json").write_text(json.dumps(faulty))
            run = lambda level, out: subprocess.run(  # noqa: E731
                [sys.executable, TOOL, "--level", level, "--into", f"{SYNTHETIC_PACK}#{SLOT}", "--out", out,
                 "--disc", scratch / "image.bin", "--ppf"], capture_output=True, text=True)
            self.assertIn("fix them first", run(scratch / "faulty.kula.json", scratch / "faulty").stderr)
            for level in (scratch / "missing.kula.json", scratch / "faulty.kula.json"):
                done = run(level, scratch / "missing" / "spiral")
                self.assertEqual(done.returncode, 1, done.stderr)
                self.assertEqual(done.stderr.splitlines(), [f"no directory at {scratch / 'missing'}; say another --out"])
            self.assertEqual(sorted(p.name for p in scratch.iterdir()), ["faulty.kula.json", "image.bin", "notes.txt", "spiral.kula.json"])

    def test_a_standing_output_is_refused_as_standing_whether_or_not_the_disc_is_there(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            (scratch / "spiral.kula.json").write_text(json.dumps(synthetic(CASE["in place"])))
            (scratch / "spiral.ppf").write_bytes(b"")
            run = lambda disc: subprocess.run(  # noqa: E731
                [sys.executable, TOOL, "--level", scratch / "spiral.kula.json", "--into", f"{SYNTHETIC_PACK}#{SLOT}",
                 "--out", scratch / "spiral", "--disc", disc, "--ppf"], capture_output=True, text=True)
            for disc in (scratch / "image.bin", scratch / "gone.bin"):
                with self.subTest(disc.name):
                    done = run(disc)
                    self.assertEqual(done.returncode, 1, done.stderr)
                    self.assertEqual(done.stderr.splitlines(), [f"{scratch / 'spiral.ppf'} exists already; say another --out"])
            (scratch / "spiral.ppf").unlink()
            done = run(scratch / "gone.bin")
            self.assertEqual(done.returncode, 1, done.stderr)
            self.assertEqual(done.stderr.splitlines()[-1], f"no disc image at {scratch / 'gone.bin'}")

    def test_an_output_that_names_no_file_is_refused_before_anything_is_written(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            (scratch / "spiral.kula.json").write_text(json.dumps(synthetic(CASE["in place"])))
            (scratch / "patches").mkdir()
            run = lambda out: subprocess.run(  # noqa: E731
                [sys.executable, TOOL, "--level", scratch / "spiral.kula.json", "--into", f"{SYNTHETIC_PACK}#{SLOT}",
                 "--out", out, "--disc", scratch / "image.bin", "--ppf"], capture_output=True, text=True, cwd=scratch)
            for out in (".", "/", "..", scratch / "..", "patches/", f"{scratch / 'patches'}/"):
                with self.subTest(out):
                    done = run(out)
                    self.assertEqual(done.returncode, 1, done.stderr)
                    self.assertEqual(done.stdout, "")
                    self.assertEqual(done.stderr.splitlines()[-1], "say a name for --out")
                    self.assertNotIn("Traceback", done.stderr)
            for out in ("patches", scratch / "patches"):
                with self.subTest(out):
                    done = run(out)
                    self.assertEqual(done.returncode, 1, done.stderr)
                    self.assertEqual(done.stdout, "")
                    self.assertEqual(done.stderr.splitlines()[-1], f"{out} is a directory; say a name for --out")
            self.assertEqual(sorted(p.name for p in scratch.iterdir()), ["image.bin", "patches", "spiral.kula.json"])
            self.assertEqual(list((scratch / "patches").iterdir()), [])

    @unittest.skipIf(os.name != "posix" or os.geteuid() == 0, "a permission bit stops neither Windows nor root")
    def test_an_output_the_system_refuses_is_said_in_a_sentence_and_not_a_traceback(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            (scratch / "spiral.kula.json").write_text(json.dumps(synthetic(CASE["in place"])))
            (scratch / "shut").mkdir()
            os.chmod(scratch / "shut", 0o500)
            for more, ext in ((("--ppf",), ".ppf"), (("--image",), ".bin")):
                with self.subTest(ext):
                    done = subprocess.run([sys.executable, TOOL, "--level", scratch / "spiral.kula.json", "--into",
                                           f"{SYNTHETIC_PACK}#{SLOT}", "--out", scratch / "shut" / "spiral", "--disc", scratch / "image.bin", *more],
                                          capture_output=True, text=True)
                    self.assertEqual(done.returncode, 1, done.stderr)
                    self.assertEqual(done.stdout, "")
                    self.assertEqual(done.stderr.splitlines()[-1],
                                     f"{scratch / 'shut' / ('spiral' + ext)} cannot be written: Permission denied")
                    self.assertNotIn("Traceback", done.stderr)
            os.chmod(scratch / "shut", 0o700)
            self.assertEqual(list((scratch / "shut").iterdir()), [])

    @unittest.skipIf(os.name != "posix" or os.geteuid() == 0, "a permission bit stops neither Windows nor root")
    def test_an_output_the_process_cannot_reach_is_refused_before_anything_is_written(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            (scratch / "spiral.kula.json").write_text(json.dumps(synthetic(CASE["in place"])))
            (scratch / "sealed").mkdir()
            os.chmod(scratch / "sealed", 0o600)
            for out in (scratch / "sealed" / "spiral", scratch / "sealed" / "sub" / "spiral"):
                for more, ext in ((("--ppf",), ".ppf"), (("--image",), ".bin"), ((), ".bin")):
                    with self.subTest((out.relative_to(scratch), more)):
                        done = subprocess.run([sys.executable, TOOL, "--level", scratch / "spiral.kula.json", "--into",
                                               f"{SYNTHETIC_PACK}#{SLOT}", "--out", out, "--disc", scratch / "image.bin", *more],
                                              capture_output=True, text=True)
                        self.assertEqual(done.returncode, 1, done.stderr)
                        self.assertEqual(done.stdout, "")
                        self.assertEqual(done.stderr.splitlines()[-1], f"{out}{ext} cannot be written: Permission denied")
                        self.assertNotIn("Traceback", done.stderr)
            os.chmod(scratch / "sealed", 0o700)
            self.assertEqual(list((scratch / "sealed").iterdir()), [])

    def test_an_output_that_exists_or_is_the_image_itself_is_refused_before_anything_is_written(self):
        held = json.loads(FIXTURE.read_text())["cases"][0]
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            (scratch / "spiral.kula.json").write_text(json.dumps(synthetic(CASE["in place"])))
            run = lambda out, *more: subprocess.run(  # noqa: E731
                [sys.executable, TOOL, "--level", scratch / "spiral.kula.json", "--into", f"{SYNTHETIC_PACK}#{SLOT}",
                 "--out", out, "--disc", scratch / "image.bin", *more], capture_output=True, text=True)
            self.assertEqual(run(scratch / "spiral").returncode, 0)
            before = {p.name: p.read_bytes() for p in scratch.iterdir()}
            again = run(scratch / "spiral", "--ppf")
            self.assertNotEqual(again.returncode, 0)
            self.assertIn("spiral.ppf exists already; say another --out", again.stderr)
            self.assertEqual({p.name: p.read_bytes() for p in scratch.iterdir()}, before)
            same = run(scratch / "image", "--image")
            self.assertNotEqual(same.returncode, 0)
            self.assertIn("image.bin is the image itself; say another --out", same.stderr)
            self.assertEqual((scratch / "image.bin").read_bytes(), IMAGE)
            self.assertEqual(digest((scratch / "spiral.bin").read_bytes()), held["patched"])

    def test_a_missing_disc_is_said_in_a_sentence_whatever_is_asked_for(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "spiral.kula.json").write_text(json.dumps(synthetic(CASE["in place"])))
            for more in ((), ("--image",), ("--ppf",)):
                with self.subTest(more):
                    done = subprocess.run([sys.executable, TOOL, "--level", scratch / "spiral.kula.json", "--into",
                                           f"{SYNTHETIC_PACK}#{SLOT}", "--out", scratch / "spiral", "--disc", scratch / "missing.bin", *more],
                                          capture_output=True, text=True)
                    self.assertNotEqual(done.returncode, 0)
                    self.assertIn(f"no disc image at {scratch / 'missing.bin'}", done.stderr)
                    self.assertNotIn("Traceback", done.stderr)
            self.assertEqual(sorted(p.name for p in scratch.iterdir()), ["spiral.kula.json"])

    def test_a_file_that_is_no_disc_image_is_said_in_one_sentence_whatever_is_asked_for(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "spiral.kula.json").write_text(json.dumps(synthetic(CASE["in place"])))
            (scratch / "notes.bin").write_bytes(bytes(len(IMAGE)))
            for more in ((), ("--image",), ("--ppf",)):
                with self.subTest(more):
                    done = subprocess.run([sys.executable, TOOL, "--level", scratch / "spiral.kula.json", "--into",
                                           f"{SYNTHETIC_PACK}#{SLOT}", "--out", scratch / "spiral", "--disc", scratch / "notes.bin", *more],
                                          capture_output=True, text=True)
                    self.assertNotEqual(done.returncode, 0)
                    self.assertIn(f"{scratch / 'notes.bin'} does not read as a disc image: not a raw ISO9660 image", done.stderr)
                    self.assertNotIn("Traceback", done.stderr)
            self.assertEqual(sorted(p.name for p in scratch.iterdir()), ["notes.bin", "spiral.kula.json"])

    def test_a_target_that_is_not_a_slot_of_a_world_a_finals_or_the_simon_rooms_pack_is_refused(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            (scratch / "spiral.kula.json").write_text(json.dumps(synthetic(CASE["in place"])))
            for into in ("/HIRO/COPYCAT.PAK#10", "/HIRO/HIRO.PAK#20", "/HIRO/HIROFI.PAK#2"):
                with self.subTest(into):
                    done = subprocess.run([sys.executable, TOOL, "--level", scratch / "spiral.kula.json", "--into", into,
                                           "--out", scratch / "simon", "--disc", scratch / "image.bin"],
                                          capture_output=True, text=True)
                    self.assertNotEqual(done.returncode, 0)
                    self.assertIn(f"error: the target {into!r} is not a slot of a world pack, a finals pack or the Simon rooms' pack",
                                  done.stderr)
            # a slot is a run of ASCII digits, so a digit of another script is refused at the gate
            for into in ("/HIRO/HIRO.PAK#\u00b2", "/HIRO/HIRO.PAK#\u0663", "/HIRO/HIRO.PAK#"):
                with self.subTest(into):
                    done = subprocess.run([sys.executable, TOOL, "--level", scratch / "spiral.kula.json", "--into", into,
                                           "--out", scratch / "simon", "--disc", scratch / "image.bin"],
                                          capture_output=True, text=True)
                    self.assertNotEqual(done.returncode, 0)
                    self.assertIn("--into wants a pack path and a slot, like /HIRO/HIRO.PAK#0", done.stderr)
                    self.assertNotIn("Traceback", done.stderr)
            self.assertEqual(sorted(p.name for p in scratch.iterdir()), ["image.bin", "spiral.kula.json"])

    def test_a_simon_rooms_slot_is_a_target_the_checks_accept(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            (scratch / "loop.kula.json").write_text(json.dumps(dict(synthetic(2, "Loop"), simon=True)))
            done = subprocess.run([sys.executable, TOOL, "--level", scratch / "loop.kula.json", "--into", "/HIRO/COPYCAT.PAK#2",
                                   "--out", scratch / "loop", "--disc", scratch / "image.bin"],
                                  capture_output=True, text=True)
            self.assertNotEqual(done.returncode, 0)
            self.assertNotIn("is not a slot of", done.stderr)
            self.assertEqual(done.stderr.splitlines()[-1], "no such pack on the disc: /HIRO/COPYCAT.PAK")
            self.assertEqual(sorted(p.name for p in scratch.iterdir()), ["image.bin", "loop.kula.json"])

    def test_a_level_with_errors_is_refused_and_one_output_can_be_chosen(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            project = synthetic(CASE["in place"])
            del project["blocks"][0]["faces"]
            (scratch / "bad.kula.json").write_text(json.dumps(project))
            done = subprocess.run([sys.executable, TOOL, "--level", scratch / "bad.kula.json", "--into",
                                   f"{SYNTHETIC_PACK}#{SLOT}", "--out", scratch / "bad", "--disc", scratch / "image.bin"],
                                  capture_output=True, text=True)
            self.assertNotEqual(done.returncode, 0)
            self.assertIn("error: no start", done.stderr)
            self.assertEqual(sorted(p.name for p in scratch.iterdir()), ["bad.kula.json", "image.bin"])
            (scratch / "ok.kwl").write_bytes(canonical(synthetic(CASE["rebuild"])))
            done = subprocess.run([sys.executable, TOOL, "--level", scratch / "ok.kwl", "--into",
                                   f"{SYNTHETIC_PACK}#{SLOT}", "--out", scratch / "ok", "--disc", scratch / "image.bin", "--ppf"],
                                  capture_output=True, text=True)
            self.assertEqual(done.returncode, 0, done.stderr)
            self.assertIn("rebuild,", done.stdout)
            self.assertNotIn("sectors written", done.stdout)
            self.assertEqual(sorted(p.name for p in scratch.iterdir()), ["bad.kula.json", "image.bin", "ok.kwl", "ok.ppf"])
            patch = (scratch / "ok.ppf").read_bytes()
            self.assertEqual(patch[6:56], b"Kula World Map: ok".ljust(50))
            with Disc(scratch / "image.bin") as disc:
                placed = plan(disc, SYNTHETIC_PACK, SLOT, stream_of(CASE["rebuild"]), "ok")
            self.assertEqual(Pak(apply_ppf(IMAGE, patch)[25 * SECTOR_RAW + 24:][:placed.fit.size]).names(), ["LEVEL 1", "OK", "LEVEL 3"])


class TheShippedLevels(unittest.TestCase):
    def test_a_release_s_levels_are_the_us_data_with_its_own_slots_in_their_place(self):
        base = json.loads(DATA.read_text())
        self.assertEqual(shipped("us"), base)
        for release in RELEASES:
            with self.subTest(release):
                variants = json.loads(RELEASE_FILES[release].read_text())["levels"]
                levels = shipped(release)["levels"]
                self.assertEqual([(l["pack"], l["index"]) for l in levels], [(l["pack"], l["index"]) for l in base["levels"]])
                self.assertEqual({f"{l['pack']}#{l['index']}": l for l in levels if "release" in l}, variants)
                self.assertEqual([l for l in levels if "release" not in l],
                                 [l for l in base["levels"] if f"{l['pack']}#{l['index']}" not in variants])
        self.assertEqual(template(shipped("eu"), "/HIRO/HIRO.PAK#19")["title"], "OBJ LEVEL")
        self.assertEqual(template(shipped("us"), "/HIRO/HIRO.PAK#19")["title"], "LESSON")


@unittest.skipUnless(os.environ.get("KULA_DISC"), "needs the disc under $KULA_DISC")
class TheDisc(unittest.TestCase):
    PACK = "/HIRO/HIRO.PAK"

    @classmethod
    def setUpClass(cls):
        cls.src = os.environ["KULA_DISC"]
        cls.dir = Path(tempfile.mkdtemp())
        cls.original = Path(cls.src).read_bytes()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.dir)
        del cls.original

    def test_level_1_s_own_stream_as_a_ppf_and_an_xdelta_reproduce_the_patched_image(self):
        with Disc(self.src) as disc:
            pak = Pak(disc.read_file(self.PACK), self.PACK)
        own = zlib.compress(canonical(project_of_level(Level(pak.level(0), pak.name(0), "HIRO"))), 6)
        out = self.dir / "level1.bin"
        placed = place(self.src, self.PACK, 0, own, out, None)
        self.assertEqual(placed.fit.path, "in place")
        patched = out.read_bytes()
        patch = ppf(self.src, placed.writes, PREFIX + "LEVEL 1")
        self.assertEqual(apply_ppf(self.original, patch), patched)
        delta = vcdiff(self.src, placed.writes)
        target, windows = decode_vcdiff(self.original, delta)
        self.assertEqual((target, windows), (patched, 31))
        self.assertLess(len(patch), 2000)
        self.assertLess(len(delta), 2000)

    def test_a_rebuilt_pack_s_patches_carry_its_other_levels(self):
        out = self.dir / "level4.bin"
        with Disc(self.src) as disc:
            pak = Pak(disc.read_file(self.PACK), self.PACK)
        stream = pak.entries[3]["blob"]
        self.assertGreater(len(stream), pak.entries[0]["size"])
        placed = place(self.src, self.PACK, 0, stream, out, pak.name(3))
        self.assertEqual((placed.fit.path, placed.fit.recompressed), ("rebuild", False))
        self.assertEqual([lba for lba, _ in placed.writes], [322] + list(range(1002, 1008)))
        patched = out.read_bytes()
        patch = ppf(self.src, placed.writes, PREFIX + pak.name(3))
        self.assertEqual(apply_ppf(self.original, patch), patched)
        delta = vcdiff(self.src, placed.writes)
        target, _ = decode_vcdiff(self.original, delta)
        self.assertEqual(target, patched)
        self.assertGreater(sum(len(data) for _, data in ppf_records(patch)), pak.size - pak.entries[0]["size"])

    def test_a_level_goes_into_a_simon_rooms_slot(self):
        pack_path = "/HIRO/COPYCAT.PAK"
        with Disc(self.src) as disc:
            pak = Pak(disc.read_file(pack_path), pack_path)
        stream = stream_of(CASE["in place"])
        out = self.dir / "simon.bin"
        placed = place(self.src, pack_path, 2, stream, out, TITLE)
        self.assertEqual(placed.fit.path, "in place")
        with Disc(out) as patched:
            after = Pak(patched.read_file(pack_path), pack_path)
        self.assertEqual(after.names(), pak.names())
        self.assertEqual(after.level(2), canonical(synthetic(CASE["in place"])))
        self.assertEqual([after.level(i) for i in range(len(after)) if i != 2],
                         [pak.level(i) for i in range(len(pak)) if i != 2])
        self.assertEqual(apply_ppf(self.original, ppf(self.src, placed.writes, PREFIX + TITLE)), out.read_bytes())

    def test_level_4_rebuilt_from_its_fields_into_level_1_s_slot_is_the_documented_patch(self):
        with Disc(self.src) as disc:
            pak = Pak(disc.read_file(self.PACK), self.PACK)
        stream = zlib.compress(canonical(project_of_level(Level(pak.level(3), pak.name(3), "HIRO"))), 6)
        out = self.dir / "level4-rebuilt.bin"
        placed = place(self.src, self.PACK, 0, stream, out, pak.name(3))
        self.assertEqual((placed.fit.path, placed.fit.recompressed), ("rebuild", False))
        self.assertEqual(len(ppf(self.src, placed.writes, PREFIX + pak.name(3))), 14879)
        self.assertEqual(len(vcdiff(self.src, placed.writes)), 14329)


if __name__ == "__main__":
    unittest.main()
