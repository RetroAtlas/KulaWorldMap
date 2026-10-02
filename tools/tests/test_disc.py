"""Unit tests for the image reader: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from disc import SECTOR_RAW, USER_OFF, Disc  # noqa: E402


def image(sectors, root_at):
    """An image of so many raw sectors whose volume descriptor puts the root
    directory at a sector of the caller's choosing."""
    raw = bytearray(SECTOR_RAW * sectors)
    pvd = SECTOR_RAW * 16 + USER_OFF
    raw[pvd + 1:pvd + 6] = b"CD001"
    struct.pack_into("<I", raw, pvd + 156 + 2, root_at)
    struct.pack_into("<I", raw, pvd + 156 + 10, 2048)
    return bytes(raw)


class TheImage(unittest.TestCase):
    def write(self, data):
        f = tempfile.NamedTemporaryFile(suffix=".bin", delete=False)
        self.addCleanup(Path(f.name).unlink)
        f.write(data)
        f.close()
        return f.name

    def test_a_file_without_the_mark_is_refused(self):
        with self.assertRaises(ValueError):
            Disc(self.write(bytes(SECTOR_RAW * 17)))

    def test_an_image_that_ends_before_its_directory_is_refused(self):
        with self.assertRaises(ValueError):
            Disc(self.write(image(17, root_at=40)))

    def test_an_image_that_holds_its_directory_opens_and_closes(self):
        with Disc(self.write(image(24, root_at=20))) as disc:
            self.assertEqual(disc.files, {})
        self.assertTrue(disc.f.closed)


if __name__ == "__main__":
    unittest.main()
