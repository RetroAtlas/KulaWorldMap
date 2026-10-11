"""Unit tests for the patch writer: python3 -m unittest discover -s tools/tests

The patches are proven by appliers of their own here: a PPF applier and a
VCDIFF decoder that knows COPY and ADD, which is all the writer uses. xdelta3
decodes them too where it is on PATH. The last class holds the patches to
the disc under $KULA_DISC and is skipped without it.
"""

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

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from disc import Disc  # noqa: E402
from kula_kwl import canonical, project_of_level  # noqa: E402
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
    SERIAL,
    SLOT,
    TITLE,
    VCD_ADLER32,
    VCD_SOURCE,
    VCDIFF_MAGIC,
    WINDOW,
    changes,
    digest,
    fixture,
    placements,
    ppf,
    runs,
    varint,
    vcdiff,
)
from kula_place import SYNTHETIC_PACK, place, plan, synthetic, synthetic_image  # noqa: E402
from kula_sector import SECTOR_RAW  # noqa: E402

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

    def test_the_placements_name_the_image_for_two_emulators_and_the_serial_for_two(self):
        lines = placements("/discs/Roll Away.bin", "out/spiral")
        self.assertEqual(len(lines), 3)
        self.assertIn("Roll Away.ppf", lines[0])
        self.assertIn("DuckStation", lines[0])
        self.assertIn("PCSX-Redux", lines[0])
        self.assertIn(SERIAL, lines[1])
        self.assertIn("ePSXe", lines[1])
        self.assertIn('xdelta3 -d -s "Roll Away.bin" "spiral.xdelta" "spiral.bin"', lines[2])
        spaced = placements("/discs/Roll Away.bin", "out/level 4")[2]
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

    def test_a_target_that_is_not_a_slot_of_a_world_or_a_finals_pack_is_refused(self):
        with tempfile.TemporaryDirectory() as scratch:
            scratch = Path(scratch)
            (scratch / "image.bin").write_bytes(IMAGE)
            (scratch / "spiral.kula.json").write_text(json.dumps(synthetic(CASE["in place"])))
            for into in ("/HIRO/COPYCAT.PAK#0", "/HIRO/HIRO.PAK#20", "/HIRO/HIROFI.PAK#2"):
                with self.subTest(into):
                    done = subprocess.run([sys.executable, TOOL, "--level", scratch / "spiral.kula.json", "--into", into,
                                           "--out", scratch / "simon", "--disc", scratch / "image.bin"],
                                          capture_output=True, text=True)
                    self.assertNotEqual(done.returncode, 0)
                    self.assertIn(f"error: the target {into!r} is not a slot of a world or a finals pack", done.stderr)
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
            self.assertEqual(sorted(p.name for p in scratch.iterdir()), ["bad.kula.json", "image.bin", "ok.kwl", "ok.ppf"])
            patch = (scratch / "ok.ppf").read_bytes()
            self.assertEqual(patch[6:56], b"Kula World Map: ok".ljust(50))
            with Disc(scratch / "image.bin") as disc:
                placed = plan(disc, SYNTHETIC_PACK, SLOT, stream_of(CASE["rebuild"]), "ok")
            self.assertEqual(Pak(apply_ppf(IMAGE, patch)[25 * SECTOR_RAW + 24:][:placed.fit.size]).names(), ["LEVEL 1", "OK", "LEVEL 3"])


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
