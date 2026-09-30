"""Unit tests for the model reader: python3 -m unittest discover -s tools/tests

Nothing here needs the disc.
"""

import struct
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_ggi import GROUP, PREFIX, QUAD, TEXTURES, Model, shadows  # noqa: E402


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
    """A colour record per polygon; polys are (indices, is a quad, a grey level)."""
    out = b""
    for _, quad, grey in polys:
        flags = (QUAD if quad else 0) | 0x20
        out += bytes((grey, grey, grey, flags)) + bytes((grey, grey, grey, 0)) * 3
    return struct.pack("<II", 1, len(out)) + out


def model(polys, frames, normals=None):
    quads = b"".join(bytes(q) for q, _, _ in polys)
    blocks = [quads, packed(frames), records(polys)]
    if normals:
        blocks.append(packed([normals]))
    head = 12 + 4 * len(blocks)
    offs, at = [], head
    for b in blocks:
        offs.append(at)
        at += len(b)
    return (struct.pack("<hhhHhH", 1, -2, 3, 99, -1, 2 if normals else 0)
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


def sprites(palette, abr=2):
    """A .GGI whose last section holds one 4 by 2 sprite at 4 bits, its
    pixels naming palette entries 0, 1, 2, 0 and then 1 four times."""
    section = struct.pack("<I", 1) + struct.pack("<hh", 4, abr)
    section += struct.pack("<HHhH", 0, 10, 0, 0) + struct.pack("<16H", *palette, *[0] * (16 - len(palette)))
    section += struct.pack("<4H", 0, 20, 4, 2) + bytes((0x10, 0x02, 0x11, 0x11))
    return SimpleNamespace(blob=section, bounds=[0] * TEXTURES + [0, len(section)], header=[0] * 6)


GREY = 0x421
STP = 0x8000


class Shadows(unittest.TestCase):
    def test_a_shadow_ships_what_each_texel_takes_off_in_base_32(self):
        g = sprites([0, STP | 3 * GREY, STP | 10 * GREY])
        self.assertEqual(shadows(g, 0, 1), [["03a0", "3333"]])

    def test_a_tinted_or_opaque_texel_or_another_blend_stops_the_build(self):
        for g in (sprites([0, STP | 3, STP | 10 * GREY]), sprites([0, 3 * GREY, STP | 10 * GREY]),
                  sprites([0, STP | 3 * GREY, STP | 10 * GREY], abr=1)):
            with self.assertRaises(SystemExit):
                shadows(g, 0, 1)


if __name__ == "__main__":
    unittest.main()
