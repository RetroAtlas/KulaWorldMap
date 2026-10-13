"""Unit tests for the disc copy's writer: python3 -m unittest discover -s tools/tests

Nothing here needs the disc: the images are a few sectors built as the disc
builds them, and the tool runs over the placer's synthetic image.
"""

import shutil
import subprocess
import sys
import tempfile
import os
import unittest
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from disc import Disc  # noqa: E402
from kula_pak import Pak  # noqa: E402
from kula_place import PACK_AT, SYNTHETIC_FINALS, SYNTHETIC_PACK, synthetic_image  # noqa: E402
from kula_sector import (  # noqa: E402
    DATA_SUBMODE,
    EDC_OFF,
    EOF_SUBMODE,
    SECTOR_RAW,
    USER,
    USER_OFF,
    check,
    noise,
    sector,
)
from kula_warp import changed  # noqa: E402

TOOL = Path(__file__).resolve().parents[1] / "kula_warp.py"
IMAGE = synthetic_image()


def raw(image, i):
    return image[i * SECTOR_RAW:(i + 1) * SECTOR_RAW]


def user(image, i):
    return raw(image, i)[USER_OFF:EDC_OFF]


class TheRewrite(unittest.TestCase):
    def image(self, sectors):
        """So many sectors of one file, each carrying noise of its own."""
        data = b"".join(sector(lba, noise(lba + 1),
                               EOF_SUBMODE if lba == sectors - 1 else DATA_SUBMODE)
                        for lba in range(sectors))
        f = tempfile.NamedTemporaryFile(suffix=".bin", delete=False)
        self.addCleanup(Path(f.name).unlink)
        f.write(data)
        f.close()
        return f.name, data

    def rewritten(self, path, before, lba, offset, data):
        """The image with the bytes laid at an offset into the file at lba, through the sectors that change."""
        want = bytearray(b"".join(user(before, i) for i in range(len(before) // SECTOR_RAW)))
        want[lba * USER + offset:lba * USER + offset + len(data)] = data
        with open(path, "rb") as f:
            writes = changed(f, lba, want[lba * USER:])
        after = bytearray(before)
        for at, sec in writes:
            after[at * SECTOR_RAW:(at + 1) * SECTOR_RAW] = sec
        return bytes(after), writes

    def test_a_write_within_a_sector_rebuilds_that_sector_as_the_disc_would_have_it(self):
        path, before = self.image(2)
        after, writes = self.rewritten(path, before, 0, 10, b"\x01\x02\x03")
        want = bytearray(user(before, 0))
        want[10:13] = b"\x01\x02\x03"
        self.assertEqual([lba for lba, _ in writes], [0])
        self.assertEqual(raw(after, 0), sector(0, bytes(want), DATA_SUBMODE))
        self.assertEqual(raw(after, 1), raw(before, 1))

    def test_a_write_across_sectors_rebuilds_each_whole_and_leaves_the_others(self):
        path, before = self.image(4)
        data = bytes(range(256)) * 2
        after, writes = self.rewritten(path, before, 1, USER - 100, data)
        self.assertEqual([lba for lba, _ in writes], [1, 2])
        self.assertEqual(len(after), len(before))
        self.assertEqual(raw(after, 0), raw(before, 0))
        self.assertEqual(raw(after, 3), raw(before, 3))
        for i in (1, 2):
            self.assertEqual(raw(after, i)[:USER_OFF], raw(before, i)[:USER_OFF])
            self.assertTrue(check(raw(after, i)))
            self.assertNotEqual(raw(after, i)[EDC_OFF:], raw(before, i)[EDC_OFF:])
        self.assertEqual(user(after, 1)[:USER - 100], user(before, 1)[:USER - 100])
        self.assertEqual(user(after, 1)[USER - 100:] + user(after, 2)[:len(data) - 100], data)
        self.assertEqual(user(after, 2)[len(data) - 100:], user(before, 2)[len(data) - 100:])

    def test_a_write_of_a_sector_whole_keeps_its_submode_and_bytes_already_there_write_nothing(self):
        path, before = self.image(3)
        after, writes = self.rewritten(path, before, 2, 0, bytes(USER))
        self.assertEqual([lba for lba, _ in writes], [2])
        self.assertEqual(raw(after, 2), sector(2, bytes(USER), EOF_SUBMODE))
        self.assertEqual(after[:2 * SECTOR_RAW], before[:2 * SECTOR_RAW])
        self.assertEqual(self.rewritten(path, before, 1, 5, user(before, 1)[5:9])[1], [])


class TheTool(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.src = self.dir / "image.bin"
        self.src.write_bytes(IMAGE)

    def run_tool(self, *args):
        return subprocess.run([sys.executable, TOOL, "--disc", self.src, *args], capture_output=True, text=True)

    def slot_level(self, image, pack_path, slot):
        with Disc(image) as disc:
            return Pak(disc.read_file(pack_path), pack_path).level(slot)

    def test_a_slot_of_the_same_pack_is_pointed_at_another_s_record_and_the_copy_proven(self):
        out = self.dir / "warped.bin"
        done = self.run_tool("--level", f"{SYNTHETIC_PACK}#2", "--into", f"{SYNTHETIC_PACK}#0", "--out", out)
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("LEVEL 3 taken from /HIRO/HIRO.PAK#2", done.stdout)
        self.assertIn("/HIRO/HIRO.PAK#0 now loads it", done.stdout)
        self.assertEqual(self.slot_level(out, SYNTHETIC_PACK, 0), self.slot_level(self.src, SYNTHETIC_PACK, 2))
        self.assertEqual(self.slot_level(out, SYNTHETIC_PACK, 1), self.slot_level(self.src, SYNTHETIC_PACK, 1))
        after = out.read_bytes()
        self.assertEqual(len(after), len(IMAGE))
        differing = [i for i in range(len(IMAGE) // SECTOR_RAW) if raw(after, i) != raw(IMAGE, i)]
        self.assertEqual(differing, [PACK_AT])
        self.assertTrue(check(raw(after, PACK_AT)))
        self.assertEqual(out.with_suffix(".cue").read_text().splitlines()[0], 'FILE "warped.bin" BINARY')
        self.assertEqual(self.src.read_bytes(), IMAGE)

    def test_a_record_from_another_pack_is_laid_over_the_roomiest_other_slot(self):
        out = self.dir / "cross.bin"
        done = self.run_tool("--level", f"{SYNTHETIC_FINALS}#1", "--into", f"{SYNTHETIC_PACK}#0", "--out", out)
        self.assertEqual(done.returncode, 0, done.stderr)
        self.assertIn("laid over /HIRO/HIRO.PAK#", done.stdout)
        self.assertEqual(self.slot_level(out, SYNTHETIC_PACK, 0), self.slot_level(self.src, SYNTHETIC_FINALS, 1))
        self.assertEqual(zlib.decompress(Pak(Disc(out).read_file(SYNTHETIC_FINALS)).entries[1]["blob"]),
                         self.slot_level(self.src, SYNTHETIC_FINALS, 1))

    def test_an_output_the_system_refuses_is_said_in_a_sentence_before_anything_is_written(self):
        refused = [(self.dir / "missing" / "warped.bin", f"no directory at {self.dir / 'missing'}; say another --out"),
                   (self.dir, f"{self.dir} is a directory; say a name for --out"),
                   (f"{self.dir}/", "say a name for --out"),
                   (".", "say a name for --out")]
        if os.name == "posix" and os.geteuid() != 0:
            (self.dir / "shut").mkdir()
            os.chmod(self.dir / "shut", 0o500)
            refused.append((self.dir / "shut" / "warped.bin", f"{self.dir / 'shut' / 'warped.bin'} cannot be written: Permission denied"))
        for out, why in refused:
            with self.subTest(why):
                done = self.run_tool("--level", f"{SYNTHETIC_PACK}#2", "--out", out)
                self.assertEqual(done.returncode, 1, done.stderr)
                self.assertEqual(done.stdout, "")
                self.assertEqual(done.stderr.splitlines()[-1], why)
                self.assertNotIn("Traceback", done.stderr)
        if (self.dir / "shut").exists():
            os.chmod(self.dir / "shut", 0o700)
            self.assertEqual(list((self.dir / "shut").iterdir()), [])
        # a link to nowhere passes the check, since nothing stands there, and the write's own refusal is a sentence
        os.symlink(self.dir / "gone" / "warped.bin", self.dir / "dangling.bin")
        done = self.run_tool("--level", f"{SYNTHETIC_PACK}#2", "--out", self.dir / "dangling.bin")
        self.assertEqual(done.returncode, 1, done.stderr)
        self.assertEqual(done.stderr.splitlines()[-1], f"{self.dir / 'dangling.bin'} cannot be written: No such file or directory")
        self.assertNotIn("Traceback", done.stderr)
        self.assertEqual(sorted(p.name for p in self.dir.iterdir() if p.is_file()), [self.src.name])

    def test_an_output_that_exists_is_the_image_or_would_be_its_cue_sheet_is_refused_and_a_missing_catalogue_said(self):
        out = self.dir / "warped.bin"
        self.assertEqual(self.run_tool("--level", f"{SYNTHETIC_PACK}#2", "--out", out).returncode, 0)
        before = {p.name: p.read_bytes() for p in self.dir.iterdir()}
        again = self.run_tool("--level", f"{SYNTHETIC_PACK}#2", "--out", out)
        self.assertNotEqual(again.returncode, 0)
        self.assertIn("warped.bin exists already; say another --out", again.stderr)
        same = self.run_tool("--level", f"{SYNTHETIC_PACK}#2", "--out", self.src)
        self.assertNotEqual(same.returncode, 0)
        self.assertIn("image.bin is the image itself; say another --out", same.stderr)
        # a standing file is never written over, so one the process may not write is standing all the same
        if os.name == "posix" and os.geteuid() != 0:
            os.chmod(out, 0o400)
            os.chmod(self.src, 0o400)
            self.assertIn("warped.bin exists already; say another --out", self.run_tool("--level", f"{SYNTHETIC_PACK}#2", "--out", out).stderr)
            self.assertIn("image.bin is the image itself; say another --out", self.run_tool("--level", f"{SYNTHETIC_PACK}#2", "--out", self.src).stderr)
            os.chmod(out, 0o600)
            os.chmod(self.src, 0o600)
        for name in ("warped.cue", "fresh.cue", "fresh.CUE"):
            sheet = self.run_tool("--level", f"{SYNTHETIC_PACK}#2", "--out", self.dir / name)
            self.assertNotEqual(sheet.returncode, 0)
            self.assertIn(f"{name} is the name its cue sheet would take; say another --out", sheet.stderr)
        self.assertEqual({p.name: p.read_bytes() for p in self.dir.iterdir()}, before)
        catalogue = self.run_tool("--out", self.dir / "obj.bin")
        self.assertNotEqual(catalogue.returncode, 0)
        self.assertIn("no pack on this disc carries OBJ LEVEL", catalogue.stderr)
        self.assertFalse((self.dir / "obj.bin").exists())
        # a standing file in a directory the process may not write into is standing before anything else
        if os.name == "posix" and os.geteuid() != 0:
            (self.dir / "ro").mkdir()
            (self.dir / "ro" / "warped.bin").write_bytes(b"")
            os.chmod(self.dir / "ro", 0o500)
            self.assertIn("warped.bin exists already; say another --out",
                          self.run_tool("--level", f"{SYNTHETIC_PACK}#2", "--out", self.dir / "ro" / "warped.bin").stderr)
            os.chmod(self.dir / "ro", 0o700)


if __name__ == "__main__":
    unittest.main()
