"""Unit tests for the disc copy's writer: python3 -m unittest discover -s tools/tests

Nothing here needs the disc: the image is a few sectors built as the disc
builds them.
"""

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

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
from kula_warp import Image  # noqa: E402


def raw(image, i):
    return image[i * SECTOR_RAW:(i + 1) * SECTOR_RAW]


def user(image, i):
    return raw(image, i)[USER_OFF:EDC_OFF]


class TheImage(unittest.TestCase):
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

    def written(self, path, lba, offset, data):
        img = Image(path)
        img.write(lba, offset, data)
        img.close()
        return Path(path).read_bytes()

    def test_a_write_within_a_sector_rebuilds_that_sector_as_the_disc_would_have_it(self):
        path, before = self.image(2)
        after = self.written(path, 0, 10, b"\x01\x02\x03")
        want = bytearray(user(before, 0))
        want[10:13] = b"\x01\x02\x03"
        self.assertEqual(raw(after, 0), sector(0, bytes(want), DATA_SUBMODE))
        self.assertEqual(raw(after, 1), raw(before, 1))

    def test_a_write_across_sectors_rebuilds_each_whole_and_leaves_the_others(self):
        path, before = self.image(4)
        data = bytes(range(256)) * 2
        after = self.written(path, 1, USER - 100, data)
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

    def test_a_write_of_a_sector_whole_keeps_its_submode(self):
        path, before = self.image(3)
        after = self.written(path, 2, 0, bytes(USER))
        self.assertEqual(raw(after, 2), sector(2, bytes(USER), EOF_SUBMODE))
        self.assertEqual(after[:2 * SECTOR_RAW], before[:2 * SECTOR_RAW])


if __name__ == "__main__":
    unittest.main()
