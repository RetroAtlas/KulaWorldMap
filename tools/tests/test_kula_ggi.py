"""Unit tests for the model reader: python3 -m unittest discover -s tools/tests

Nothing here needs the disc: a model is built to order, the way the tables
would place it, and read back.
"""

import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kula_ggi import GROUP, PREFIX, QUAD, Model  # noqa: E402


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
    """A texture record per polygon; polys are (indices, is a quad, texture number)."""
    out = b""
    for _, quad, tex in polys:
        flags = (QUAD if quad else 0) | 0x2000
        out += struct.pack("<BBHBBHBBHBBH", 1, 2, flags, 3, 4, tex, 5, 6, 0, 7, 8, 0)
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
        self.assertEqual([r["tex"] for r in m.uv], [7, 8])
        self.assertEqual(m.uv[0]["uv"], [(1, 2), (3, 4), (5, 6), (7, 8)])

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


if __name__ == "__main__":
    unittest.main()
