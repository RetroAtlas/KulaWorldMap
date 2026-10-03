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


def subdirectory(at):
    """A directory record naming the directory at a sector."""
    record = bytearray(34)
    record[0], record[25], record[32], record[33] = 34, 2, 1, ord("A")
    struct.pack_into("<I", record, 2, at)
    struct.pack_into("<I", record, 10, 2048)
    return bytes(record)


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

    def test_a_record_whose_flags_lie_past_the_table_is_refused_and_closed(self):
        # records to within a few bytes of the end, then one whose flags lie past it
        broken = (bytes([255]) + bytes(254)) * 7 + bytes([240]) + bytes(239) + bytes([1])
        self.refused(image(24, root_at=20, directory=broken), IndexError)
        with self.assertRaises(SystemExit):
            open_disc(self.write(image(24, root_at=20, directory=broken)))

    def test_a_directory_reached_twice_is_refused_and_closed(self):
        self.refused(image(24, root_at=20, directory=subdirectory(20)), ValueError)

    def test_a_chain_of_directories_past_the_recursion_limit_is_refused(self):
        depth = sys.getrecursionlimit() + 20
        raw = bytearray(image(20 + depth + 1, root_at=20))
        for n in range(depth):
            at = SECTOR_RAW * (20 + n) + USER_OFF
            raw[at:at + 34] = subdirectory(21 + n)
        self.refused(bytes(raw), RecursionError)
        with self.assertRaises(SystemExit):
            open_disc(self.write(bytes(raw)))

    def test_an_image_that_holds_its_directory_opens_and_closes(self):
        with Disc(self.write(image(24, root_at=20))) as disc:
            self.assertEqual(disc.files, {})
        self.assertTrue(disc.f.closed)


if __name__ == "__main__":
    unittest.main()
