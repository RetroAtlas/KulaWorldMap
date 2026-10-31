"""Unit tests for the PNG writer and reader: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from png import read_png, write_png  # noqa: E402

# a colour per pixel, more than a palette holds, so the squeeze keeps the colour type
W, H = 32, 24

# three pixels a row: the first row plain, the second as each filter encodes it
PREV = (10, 20, 30, 11, 90, 10, 6, 70, 40)
WANT = (12, 25, 50, 21, 100, 60, 30, 80, 100)
# under Paeth the second pixel's channels take the left, the upper and the upper-left byte in turn,
# and the third's first two tie, the left with the upper-left and the upper with the upper-left
FILTERED = {
    0: (12, 25, 50, 21, 100, 60, 30, 80, 100),
    1: (12, 25, 50, 9, 75, 10, 9, 236, 40),
    2: (2, 5, 20, 10, 10, 50, 24, 10, 60),
    3: (7, 15, 35, 10, 43, 30, 17, 251, 50),
    4: (2, 5, 20, 9, 10, 30, 9, 10, 40),
}


def picture(alpha):
    px = bytearray()
    for y in range(H):
        for x in range(W):
            px += bytes((x * 8, y * 10, (x * y) & 255, alpha(x, y)))
    return bytes(px)


def chunk(tag, data):
    c = tag + data
    return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))


def png_of(rows, depth=8, colour=2, interlace=0, extra=b""):
    """A PNG of the rows given, each a filter type and its bytes, three a pixel."""
    scan = b"".join(bytes([kind]) + bytes(row) for kind, row in rows)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", len(rows[0][1]) // 3, len(rows), depth, colour, 0, 0, interlace))
            + extra + chunk(b"IDAT", zlib.compress(scan)) + chunk(b"IEND", b""))


def rgba(*rows):
    return bytes(sum(([*row[i:i + 3], 255] for row in rows for i in range(0, len(row), 3)), []))


class ThePng(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory()
        self.out = Path(self.scratch.name) / "a.png"
        self.addCleanup(self.scratch.cleanup)

    def test_an_image_whose_alpha_says_something_comes_back_as_written(self):
        px = picture(lambda x, y: (x * 7 + y * 3) & 255)
        write_png(self.out, W, H, px)
        self.assertEqual(read_png(self.out), (W, H, px))

    def test_an_image_whose_alpha_says_nothing_is_written_as_rgb_and_read_back_opaque(self):
        px = picture(lambda x, y: 255)
        write_png(self.out, W, H, px)
        self.assertEqual(self.out.read_bytes()[25], 2)
        self.assertEqual(read_png(self.out), (W, H, px))

    def test_each_filter_is_undone_to_the_pixels_its_row_encodes(self):
        for kind, row in FILTERED.items():
            with self.subTest(filter=kind):
                self.out.write_bytes(png_of([(0, PREV), (kind, row)]))
                self.assertEqual(read_png(self.out), (3, 2, rgba(PREV, WANT)))

    def test_a_transparency_key_reads_as_alpha_0_on_the_pixel_it_names(self):
        self.out.write_bytes(png_of([(0, PREV)], extra=chunk(b"tRNS", struct.pack(">3H", 11, 90, 10))))
        self.assertEqual(read_png(self.out), (3, 1, bytes((10, 20, 30, 255, 11, 90, 10, 0, 6, 70, 40, 255))))

    def test_a_depth_or_a_layout_the_reader_does_not_take_is_refused(self):
        for header in (dict(depth=16), dict(interlace=1), dict(colour=3)):
            with self.subTest(**header):
                self.out.write_bytes(png_of([(0, PREV)], **header))
                with self.assertRaises(SystemExit):
                    read_png(self.out)


if __name__ == "__main__":
    unittest.main()
