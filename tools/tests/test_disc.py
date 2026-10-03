"""Unit tests for the image reader: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import struct
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import disc  # noqa: E402
from disc import SECTOR_RAW, USER_OFF, Disc  # noqa: E402
from kula_disc import open_disc  # noqa: E402


def image(sectors, root_at, directory=b""):
    """An image of so many raw sectors whose volume descriptor puts the root
    directory at a sector of the caller's choosing, holding what is given."""
    raw = bytearray(SECTOR_RAW * sectors)
    pvd = SECTOR_RAW * 16 + USER_OFF
    raw[pvd + 1:pvd + 6] = b"CD001"
    struct.pack_into("<I", raw, pvd + 156 + 2, root_at)
    struct.pack_into("<I", raw, pvd + 156 + 10, 2048)
    at = SECTOR_RAW * root_at + USER_OFF
    raw[at:at + len(directory)] = directory
    return bytes(raw)


class TheImage(unittest.TestCase):
    def write(self, data):
        f = tempfile.NamedTemporaryFile(suffix=".bin", delete=False)
        self.addCleanup(Path(f.name).unlink)
        f.write(data)
        f.close()
        return f.name

    def refused(self, data, error):
        opened = []
        real = open

        def spy(*args, **kwargs):
            opened.append(real(*args, **kwargs))
            return opened[-1]

        with mock.patch.object(disc, "open", spy, create=True), self.assertRaises(error):
            Disc(self.write(data))
        self.assertTrue(opened[0].closed)

    def test_a_file_without_the_mark_is_refused_and_closed(self):
        self.refused(bytes(SECTOR_RAW * 17), ValueError)

    def test_an_image_that_ends_before_its_directory_is_refused_and_closed(self):
        self.refused(image(17, root_at=40), ValueError)

    def test_a_directory_record_running_past_its_table_is_refused_and_closed(self):
        # records spanning most of the table, then one whose fields lie past its end
        broken = (bytes([255]) + bytes(254)) * 8 + bytes([1])
        self.refused(image(24, root_at=20, directory=broken), struct.error)
        with self.assertRaises(SystemExit):
            open_disc(self.write(image(24, root_at=20, directory=broken)))

    def test_an_image_that_holds_its_directory_opens_and_closes(self):
        with Disc(self.write(image(24, root_at=20))) as disc:
            self.assertEqual(disc.files, {})
        self.assertTrue(disc.f.closed)


if __name__ == "__main__":
    unittest.main()
