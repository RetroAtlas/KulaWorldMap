"""Unit tests for the atlas writer: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import kula_tgi as tgi  # noqa: E402
from kula_tex import SHADES, SIZE, atlas  # noqa: E402

TEX_AT = (64, 0)
ROWS = (5, 6, 7)
# every index 16 times over, so each palette entry is painted somewhere
PIXELS = bytes(range(256)) * 16

PALETTES = {
    5: [0x8000 | (v & 31) | ((v >> 3) << 10) for v in range(256)],
    # index 0 without its top bit, as a transparent black is stored
    6: [0] + [0x8000 | (v << 5) | 7 for v in range(1, 256)],
    # fourteen greys
    7: [0x8000 | ((v // 19 + 10) * 0x421) for v in range(256)],
}


def upload(x, y, w, h, words):
    return struct.pack("<4H", x, y, w, h) + words


def tgi_blob(rows=ROWS, record=True, tex_at=TEX_AT):
    art = upload(*tex_at, 32, 64, PIXELS)
    for row, words in PALETTES.items():
        art += upload(768, row, 256, 1, struct.pack("<256H", *words))
    rec = [0] * tgi.MAP_STRIDE
    rec[3], rec[4] = tex_at
    rec[5:5 + SHADES] = rows
    quads = struct.pack(f"<{tgi.MAP_STRIDE}H", *rec) if record else b""
    counts = [0] * tgi.SECTIONS
    counts[tgi.MAP] = len(quads) // 2
    counts[tgi.ART] = len(art) // 2
    header = bytearray(tgi.HEADER)
    struct.pack_into(f"<{tgi.SECTIONS}I", header, tgi.COUNTS_AT, *counts)
    return bytes(header) + quads + art


class TheAtlas(unittest.TestCase):
    def test_each_shade_is_painted_through_the_palette_row_its_record_names(self):
        W, H, px, n = atlas(tgi_blob())
        self.assertEqual((W, H, n), (SIZE, SHADES * SIZE, 1))
        for k, row in enumerate(ROWS):
            for v in (0, 1, 77, 255):
                y, x = divmod(PIXELS.index(v), SIZE)
                o = ((k * SIZE + y) * W + x) * 4
                self.assertEqual(tuple(px[o:o + 4]), (*tgi.rgb(PALETTES[row][v]), 255))

    def test_a_palette_the_heuristic_scan_refuses_is_read_all_the_same(self):
        page = tgi.vram(tgi_blob())
        self.assertEqual([row for row, _ in tgi.cluts(page)], [5])
        self.assertEqual(tgi.palette(page, 6)[0], (0, 0, 0))
        self.assertEqual(tgi.palette(page, 7)[0], tgi.rgb(PALETTES[7][0]))

    def test_a_texture_without_a_record_stops_the_build(self):
        with self.assertRaises(SystemExit):
            atlas(tgi_blob(record=False))

    def test_an_upload_off_the_page_stops_the_build(self):
        with self.assertRaises(SystemExit):
            atlas(tgi_blob(tex_at=(tgi.VRAM_W - 16, 0)))
        with self.assertRaises(SystemExit):
            atlas(tgi_blob(tex_at=(0, tgi.VRAM_H - 32)))

    def test_a_row_outside_vram_stops_the_build(self):
        with self.assertRaises(SystemExit):
            atlas(tgi_blob(rows=(5, 6, tgi.VRAM_H)))


if __name__ == "__main__":
    unittest.main()
