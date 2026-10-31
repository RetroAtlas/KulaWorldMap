"""Unit tests for the atlas writer and the sheets of another release: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import kula_tgi as tgi  # noqa: E402
from kula_tex import SHADES, SHARED, SIZE, atlas, cells, cut, digest, mean, sheets  # noqa: E402
from tgi_fixture import BOTH, BRIGHT, OTHER, PALETTES, PIXELS, ROWS, atlases, texture, tgi_blob, worlds  # noqa: E402


def opaque(sheet):
    """The cells a sheet carries."""
    w, h, px, _ = sheet
    return {key for key, cell in cut(w, h, px).items() if any(cell[3::4])}


BASE = atlases(worlds(A=PALETTES, B=PALETTES))


class TheAtlas(unittest.TestCase):
    def test_each_shade_is_painted_through_the_palette_row_its_record_names(self):
        W, H, px, n = atlas(tgi_blob())
        self.assertEqual((W, H, n), (SIZE, SHADES * SIZE, 1))
        for k, row in enumerate(ROWS):
            for v in (0, 1, 77, 255):
                y, x = divmod(PIXELS.index(v), SIZE)
                o = ((k * SIZE + y) * W + x) * 4
                self.assertEqual(tuple(px[o:o + 4]), (*tgi.rgb(PALETTES[row][v]), 255))

    def test_a_mean_is_taken_through_the_palette_row_its_shade_names(self):
        for k, row in enumerate(ROWS):
            colours = [tgi.rgb(PALETTES[row][v]) for v in PIXELS]
            want = [round(sum(c[ch] for c in colours) / len(colours)) for ch in range(3)]
            self.assertEqual(mean(tgi_blob(), [0], k), want)

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


class TheCells(unittest.TestCase):
    def test_a_cell_is_its_texture_in_the_shade_of_its_row(self):
        found = cells(tgi_blob(textures=2))
        self.assertEqual(sorted(found), [(i, k) for i in range(2) for k in range(SHADES)])
        self.assertEqual({len(cell) for cell in found.values()}, {SIZE * SIZE * 4})
        for v in (0, 77, 255):
            at = texture(1).index(v) * 4
            self.assertEqual(tuple(found[1, 2][at:at + 4]), (*tgi.rgb(PALETTES[7][v]), 255))

    def test_the_digest_is_of_the_model_table_and_the_quads_alone(self):
        self.assertEqual(digest(tgi_blob()), digest(tgi_blob(palettes=BRIGHT)))
        self.assertNotEqual(digest(tgi_blob()), digest(tgi_blob(rows=(5, 7, 6))))
        self.assertNotEqual(digest(tgi_blob()), digest(tgi_blob(models=((0, 1),))))


class TheSheets(unittest.TestCase):
    def test_a_cell_that_differs_is_opaque_on_its_worlds_sheet_and_an_equal_cell_transparent(self):
        order, pixels = sheets(worlds(A=BRIGHT, B=PALETTES), BASE)
        self.assertEqual(order, {"A": ["A"]})
        w, h, px, n = pixels["A"]
        self.assertEqual((w, h, n), (2 * SIZE, SHADES * SIZE, 2))
        laid = cut(w, h, px)
        self.assertEqual(laid[1, 2], cells(tgi_blob(textures=2, palettes=BRIGHT))[1, 2])
        self.assertEqual(laid[1, 1], bytes(SIZE * SIZE * 4))

    def test_a_cell_that_differs_the_same_way_in_every_world_goes_on_the_shared_sheet(self):
        order, pixels = sheets(worlds(A=BOTH, B=BRIGHT), BASE)
        self.assertEqual(order, {"A": [SHARED, "A"], "B": [SHARED]})
        self.assertEqual(opaque(pixels[SHARED]), {(0, 2), (1, 2)})
        self.assertNotIn("B", pixels)

    def test_a_cell_that_differs_in_one_world_alone_goes_on_that_worlds_sheet(self):
        order, pixels = sheets(worlds(A=BOTH, B=BRIGHT), BASE)
        self.assertEqual(opaque(pixels["A"]), {(0, 1), (1, 1)})
        self.assertEqual(pixels["A"][3], 2)

    def test_a_cell_that_differs_another_way_in_each_world_goes_on_each_worlds_own_sheet(self):
        order, pixels = sheets(worlds(A=BRIGHT, B=OTHER), BASE)
        self.assertEqual(order, {"A": ["A"], "B": ["B"]})
        self.assertNotIn(SHARED, pixels)
        self.assertEqual(opaque(pixels["A"]), {(0, 2), (1, 2)})
        self.assertEqual(opaque(pixels["B"]), {(0, 2), (1, 2)})

    def test_a_release_atlas_of_another_texture_count_is_refused(self):
        with self.assertRaises(SystemExit):
            sheets({"A": tgi_blob(textures=3), "B": tgi_blob(textures=2)}, BASE)

    def test_base_atlases_of_two_sizes_are_refused(self):
        with self.assertRaises(SystemExit):
            sheets({"A": tgi_blob(textures=2), "B": tgi_blob(textures=3)},
                   {"A": BASE["A"], "B": atlas(tgi_blob(textures=3))[:3]})


if __name__ == "__main__":
    unittest.main()
