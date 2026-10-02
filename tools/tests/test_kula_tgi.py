"""Unit tests for the artwork reader and the atlas it feeds: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import kula_tex as tex  # noqa: E402
import kula_tgi as tgi  # noqa: E402

TEX_W, TEX_H = tgi.TEX
PIXELS = TEX_W * 2
STP = 0x8000
# Two palette rows, each with every entry marked semi-transparent and
# distinct enough to be taken for a palette.
PALETTES = [[STP | i for i in range(256)], [STP | ((i * 7) & 0x7FFF) for i in range(256)]]
# Where the two full-size textures and a mip level of the first are uploaded,
# and the byte every pixel of each texture holds.
TEXTURE_AT = [(0, 0), (TEX_W, 0)]
MIP_AT = (TEX_W * 2, 0)
FILL = [5, 200]
# The quad records: the three palette rows a texture is drawn through, and
# one record whose position is no texture's.
ROWS = [(0, 1, 0), (1, 0, 1)]
NOWHERE = (500, 300)
# The model table: runs into the quad records.
MODELS = [(0, 2), (2, 1), (0, 1), (1, 0)]


def upload(x, y, w, h, body):
    assert len(body) == w * h * 2
    return struct.pack("<4H", x, y, w, h) + body


def quad(x, y, rows):
    rec = [0] * tgi.MAP_STRIDE
    rec[3], rec[4] = x, y
    rec[5:5 + tgi.SHADES] = rows
    return struct.pack(f"<{tgi.MAP_STRIDE}H", *rec)


def blob(slack=0):
    """A .TGI of two textures with their palettes and quads, with `slack`
    bytes left over at the end of the uploads' section."""
    art = b"".join(upload(x, y, TEX_W, TEX_H, bytes([fill]) * (TEX_W * TEX_H * 2))
                   for (x, y), fill in zip(TEXTURE_AT, FILL))
    art += upload(*MIP_AT, 8, 32, bytes(8 * 32 * 2))
    art += upload(768, 0, 256, len(PALETTES), struct.pack(f"<{256 * len(PALETTES)}H",
                                                            *[v for row in PALETTES for v in row]))
    art += bytes(slack)
    quads = b"".join(quad(x, y, rows) for (x, y), rows in zip(TEXTURE_AT, ROWS)) + quad(*NOWHERE, (3, 3, 3))
    models = struct.pack(f"<{2 * len(MODELS)}h", *[v for pair in MODELS for v in pair])
    sections = [b""] * tgi.SECTIONS
    sections[tgi.MODELS], sections[tgi.MAP], sections[tgi.ART] = models, quads, art
    header = bytearray(tgi.HEADER)
    struct.pack_into(f"<{tgi.SECTIONS}I", header, tgi.COUNTS_AT, *[len(s) // 2 for s in sections])
    return bytes(header) + b"".join(sections)


class Uploads(unittest.TestCase):
    def test_the_uploads_are_walked_to_the_end_of_their_section_exactly(self):
        uploads, exact = tgi.blits(blob())
        self.assertTrue(exact)
        self.assertEqual([(u["x"], u["y"], u["w"], u["h"]) for u in uploads],
                         [(0, 0, 32, 64), (32, 0, 32, 64), (64, 0, 8, 32), (768, 0, 256, 2)])
        self.assertEqual(blob()[uploads[1]["at"]], FILL[1])

    def test_bytes_the_walk_does_not_reach_say_the_section_is_not_read_right(self):
        uploads, exact = tgi.blits(blob(slack=6))
        self.assertFalse(exact)
        self.assertEqual(len(uploads), 4)

    def test_a_texture_is_a_full_size_upload_and_a_mip_level_is_not(self):
        self.assertEqual([(t["x"], t["y"]) for t in tgi.textures(blob())], TEXTURE_AT)

    def test_the_page_holds_each_upload_where_it_was_sent(self):
        page = tgi.vram(blob())
        pixel = lambda x, y: page[(y * tgi.VRAM_W + x) * 2]
        self.assertEqual(pixel(0, 63), FILL[0])
        self.assertEqual(pixel(TEX_W, 5), FILL[1])
        self.assertEqual(struct.unpack_from("<H", page, (1 * tgi.VRAM_W + 768 + 9) * 2)[0], PALETTES[1][9])


class Palettes(unittest.TestCase):
    def test_a_palette_row_is_one_marked_semi_transparent_throughout(self):
        pals = tgi.cluts(tgi.vram(blob()))
        self.assertEqual([y for y, _ in pals], [0, 1])
        self.assertEqual(pals[0][1][9], tgi.rgb(PALETTES[0][9]))

    def test_a_texture_is_paired_with_the_rows_of_the_quad_at_its_position(self):
        self.assertEqual(tgi.palette_map(blob()), {0: ROWS[0], 1: ROWS[1]})


class Models(unittest.TestCase):
    def test_a_model_is_the_textures_of_its_run_of_quads(self):
        self.assertEqual(tgi.models(blob()), [[0, 1], [None], [0], []])


class Atlas(unittest.TestCase):
    def test_the_atlas_lays_every_texture_along_a_row_per_shade(self):
        W, H, px, n = tex.atlas(blob())
        self.assertEqual((W, H, n), (2 * tex.SIZE, tex.SHADES * tex.SIZE, 2))
        pixel = lambda x, y: tuple(px[(y * W + x) * 4:(y * W + x) * 4 + 4])
        for i, (rows, fill) in enumerate(zip(ROWS, FILL)):
            for k, row in enumerate(rows):
                self.assertEqual(pixel(i * tex.SIZE + 3, k * tex.SIZE + 7), (*tgi.rgb(PALETTES[row][fill]), 255))


if __name__ == "__main__":
    unittest.main()
