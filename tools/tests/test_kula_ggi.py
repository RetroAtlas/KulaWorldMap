"""Unit tests for the model reader: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import struct
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_ggi import (  # noqa: E402
    ARC, BLEND, GROUP, PREFIX, QUAD, SORTED, TEXTURES, VRAM_H, Model, as_dict, jump, rgb, shadows, sparks)


def packed(frames):
    """A vertex or normal block: (x, y, z) triples packed three at a time, per frame."""
    out = b""
    for pts in frames:
        pts = list(pts) + [(-1, -1, -1)] * (-len(pts) % 3)
        for k in range(0, len(pts), 3):
            g = pts[k:k + 3]
            out += struct.pack("<10h", g[0][0], g[0][2], g[1][0], g[1][2], g[2][0], g[2][2],
                               g[0][1], g[1][1], g[2][1], 0)
    per = len(out) // len(frames)
    return struct.pack("<II", len(frames), per) + out


def records(polys):
    """A colour record per polygon; polys are (indices, is a quad, a grey level,
    and any more flags)."""
    out = b""
    for _, quad, grey, *more in polys:
        flags = (QUAD if quad else 0) | 0x20 | sum(more)
        out += bytes((grey, grey, grey, flags)) + bytes((grey, grey, grey, 0)) * 3
    return struct.pack("<II", 1, len(out)) + out


def model(polys, frames, normals=None, kind=-1, flags=None):
    quads = b"".join(bytes(q[0]) for q in polys)
    blocks = [quads, packed(frames), records(polys)]
    if normals:
        blocks.append(packed([normals]))
    head = 12 + 4 * len(blocks)
    offs, at = [], head
    for b in blocks:
        offs.append(at)
        at += len(b)
    flags = (2 if normals else 0) if flags is None else flags
    return (struct.pack("<hhhHhH", 1, -2, 3, 99, kind, flags)
            + struct.pack(f"<{len(blocks)}I", *offs) + b"".join(blocks))


class Reads(unittest.TestCase):
    def test_a_polygon_is_a_quad_when_its_record_says_so(self):
        polys = [((0, 1, 2, 3), True, 7), ((1, 2, 3, 200), False, 8)]
        pts = [(0, 0, 0), (10, 0, 0), (10, 0, 10), (0, 0, 10)]
        m = Model(model(polys, [pts]), 0, len(model(polys, [pts])))
        self.assertEqual(m.polygons(), [(0, 1, 2, 3), (1, 2, 3)])
        self.assertEqual([c["rgb"][0] for c in m.colours], [(7, 7, 7), (8, 8, 8)])
        self.assertEqual(m.colours[0]["flags"] & QUAD, QUAD)
        self.assertEqual(m.colours[1]["flags"] & QUAD, 0)

    def test_vertices_come_back_with_y_up_and_one_frame_per_item(self):
        pts = [(1, 2, 3), (4, 5, 6), (7, 8, 9), (10, 11, 12)]
        moved = [(x + 1, y + 1, z + 1) for x, y, z in pts]
        blob = model([((0, 1, 2, 3), True, 0)], [pts, moved])
        m = Model(blob, 0, len(blob))
        self.assertEqual(m.frames[0][:4], pts)
        self.assertEqual(m.frames[1][:4], moved)
        self.assertEqual(len(m.frames), 2)
        self.assertEqual(m.centre, (1, 3, -2))
        self.assertEqual(m.radius, 99)

    def test_a_fourth_block_is_normals(self):
        pts = [(0, 0, 0), (10, 0, 0), (10, 0, 10)]
        nrm = [(0, 4096, 0)] * 3
        blob = model([((0, 1, 2, 0), False, 0)], [pts], nrm)
        m = Model(blob, 0, len(blob))
        self.assertEqual(m.normals[0][:3], nrm)
        self.assertEqual(m.flags, 2)
        self.assertEqual(len(m.blocks), 5)

    def test_the_packing_is_twenty_bytes_a_three(self):
        self.assertEqual(GROUP, 20)
        self.assertEqual(len(packed([[(0, 0, 0)] * 4])), PREFIX + 2 * GROUP)


class Ships(unittest.TestCase):
    SQUARE = [(0, 0, 0), (10, 0, 0), (10, 0, 10), (0, 0, 10)]
    OPAQUE = ((0, 1, 2, 3), True, 7)
    CLEAR = ((0, 1, 2, 0), False, 8, BLEND)

    def shipped(self, polys, **head):
        blob = model(polys, [self.SQUARE], **head)
        return as_dict(Model(blob, 0, len(blob)))

    def test_a_model_the_game_draws_by_depth_says_so(self):
        self.assertIs(self.shipped([self.OPAQUE], flags=SORTED)["sorted"], True)
        self.assertNotIn("sorted", self.shipped([self.OPAQUE]))

    def test_a_model_with_a_translucent_polygon_ships_the_blend_in_its_headers_low_bits(self):
        self.assertEqual(self.shipped([self.OPAQUE, self.CLEAR], kind=-1)["blend"], 3)
        self.assertEqual(self.shipped([self.OPAQUE, self.CLEAR], kind=0)["blend"], 0)
        self.assertNotIn("blend", self.shipped([self.OPAQUE], kind=0))

    def test_a_model_with_normals_ships_them_beside_its_vertices(self):
        nrm = [(0, 4096, 0), (4096, 0, 0), (0, 0, 4096), (0, -4096, 0)]
        blob = model([self.OPAQUE], [self.SQUARE], nrm)
        shipped = as_dict(Model(blob, 0, len(blob)))
        self.assertEqual(shipped["normals"], [c for n in nrm for c in n])
        self.assertNotIn("normals", self.shipped([self.OPAQUE]))

    def test_a_blend_that_takes_away_from_what_is_behind_stops_the_build(self):
        with self.assertRaises(SystemExit):
            self.shipped([self.CLEAR], kind=2)


def sprites(palette, abr=2, y=20, slack=0):
    """A .GGI whose last section holds one 4 by 2 sprite at 4 bits, its
    pixels naming palette entries 0, 1, 2, 0 and then 1 four times, with
    `slack` bytes of the section left over past it."""
    section = struct.pack("<I", 1) + struct.pack("<hh", 4, abr)
    section += struct.pack("<HHhH", 0, 10, 0, 0) + struct.pack("<16H", *palette, *[0] * (16 - len(palette)))
    section += struct.pack("<4H", 0, y, 4, 2) + bytes((0x10, 0x02, 0x11, 0x11)) + bytes(slack)
    return SimpleNamespace(blob=section, bounds=[0] * TEXTURES + [0, len(section)], header=[0] * 6)


GREY = 0x421
STP = 0x8000


class Shadows(unittest.TestCase):
    def test_a_shadow_ships_what_each_texel_takes_off_in_base_32(self):
        g = sprites([0, STP | 3 * GREY, STP | 10 * GREY])
        self.assertEqual(shadows(g, 0, 1), [["03a0", "3333"]])

    def test_a_sprite_outside_the_page_or_a_section_not_filled_stops_the_build(self):
        good = [0, STP | 3 * GREY, STP | 10 * GREY]
        for g in (sprites(good, y=VRAM_H - 1), sprites(good, slack=4)):
            with self.assertRaises(SystemExit):
                shadows(g, 0, 1)

    def test_a_tinted_or_opaque_texel_or_another_blend_stops_the_build(self):
        for g in (sprites([0, STP | 3, STP | 10 * GREY]), sprites([0, 3 * GREY, STP | 10 * GREY]),
                  sprites([0, STP | 3 * GREY, STP | 10 * GREY], abr=1)):
            with self.assertRaises(SystemExit):
                shadows(g, 0, 1)


SIDE = 64
SPRITES = 7
# A palette a sprite, entry 0 the transparent black, the rest semi-transparent.
PALETTES = [[0] + [STP | k | ((k + i) % 32) << 5 | (31 - k) << 10 for k in range(1, 16)] for i in range(SPRITES)]


def index(i, u, v):
    """The palette entry sprite `i` paints at texel (u, v): every entry somewhere."""
    return (u // 4 + v // 4 + i) % 16


def effects(named=SPRITES, sizes=None, abr=1, palettes=PALETTES, first=2):
    """A .GGI whose header names the sprite `first` and counts `named`, and
    whose last section holds `first` empty slots and then one 4-bit sprite
    a palette, `sizes` wide and high where given and a square of SIDE
    otherwise."""
    sizes = sizes or [(SIDE, SIDE)] * len(palettes)
    section = struct.pack("<I", first + len(palettes)) + struct.pack("<hhH", -1, 0, 0) * first
    for i, (palette, (w, h)) in enumerate(zip(palettes, sizes)):
        section += struct.pack("<hh", 4, abr) + struct.pack("<HHhH", 0, 500 + i, 0, 0) + struct.pack("<16H", *palette)
        section += struct.pack("<4H", i * (SIDE // 4), 0, w, h)
        for v in range(h):
            section += bytes(index(i, u, v) | index(i, u + 1, v) << 4 for u in range(0, w, 2))
    return SimpleNamespace(blob=section, bounds=[0] * TEXTURES + [0, len(section)], header=[first, named, 0, 0, 0, 0])


class Sparks(unittest.TestCase):
    def test_each_sprite_is_laid_on_the_sheet_through_its_palette_black_where_it_adds_nothing(self):
        side, px = sparks(effects(), SPRITES)
        self.assertEqual(side, SIDE)
        self.assertEqual(len(px), SPRITES * SIDE * SIDE * 4)
        for i in range(SPRITES):
            for u, v in ((0, 0), (5, 9), (31, 2), (63, 63), (4 * ((16 - i) % 16), 0)):
                word = PALETTES[i][index(i, u, v)]
                o = ((v * SPRITES + i) * SIDE + u) * 4
                self.assertEqual(tuple(px[o:o + 4]), rgb(word) if word else (0, 0, 0, 255), (i, u, v))

    def test_a_count_the_header_or_the_section_does_not_bear_out_stops_the_build(self):
        for g, count in ((effects(named=SPRITES - 1), SPRITES), (effects(), SPRITES - 1),
                         (effects(named=SPRITES + 1), SPRITES + 1)):
            with self.assertRaises(SystemExit):
                sparks(g, count)

    def test_a_sprite_of_another_size_or_not_square_stops_the_build(self):
        for last in ((SIDE // 2, SIDE // 2), (SIDE, SIDE // 2)):
            with self.assertRaises(SystemExit):
                sparks(effects(sizes=[(SIDE, SIDE)] * (SPRITES - 1) + [last]), SPRITES)

    def test_another_blend_or_a_texel_drawn_opaque_stops_the_build(self):
        opaque = [PALETTES[0][:3] + [PALETTES[0][3] & ~STP] + PALETTES[0][4:]] + PALETTES[1:]
        for g in (effects(abr=2), effects(palettes=opaque)):
            with self.assertRaises(SystemExit):
                sparks(g, SPRITES)


def arc(count, rows, pads=(0, 0, 0), slack=4):
    """A .GGI whose fifth section holds a jump's count, its pads and these
    rows, with `slack` bytes left past them."""
    section = struct.pack("<4h", count, *pads) + b"".join(struct.pack("<3h", *r) for r in rows) + bytes(slack)
    return SimpleNamespace(blob=section, bounds=[0] * ARC + [0, len(section)])


class Jump(unittest.TestCase):
    ROWS = [[0, 0, -47], [68, 0, -92], [129, 0, -135], [184, 0, -175]]

    def test_the_arc_ships_its_count_and_its_rows(self):
        self.assertEqual(jump(arc(5, self.ROWS), 2), {"count": 5, "rows": self.ROWS})
        self.assertEqual(len(jump(arc(5, self.ROWS, slack=0), 2)["rows"]), 4)

    def test_a_pad_that_is_not_nothing_or_too_few_rows_for_the_count_stop_the_build(self):
        for g in (arc(5, self.ROWS, pads=(1, 0, 0)), arc(7, self.ROWS), arc(0, self.ROWS)):
            with self.assertRaises(SystemExit):
                jump(g, 2)


if __name__ == "__main__":
    unittest.main()
