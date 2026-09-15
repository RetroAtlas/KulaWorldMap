#!/usr/bin/env python3
"""The objects' geometry: /HIRO/HIRO.GGI, as the game itself reads it.

The one .GGI on the disc is loaded once at startup, and the parser at
0x80022de0 reads a 13-word header, seven sections laid end to end from byte 52
whose sizes in u16 are words 6 to 12, and two model tables inside the first
section, placed by words 13 and 14: 25 entries of four u32 at byte 60, and 50
models of four rows of four u32 at byte 460. An entry's words are byte offsets
from its own table's start, -1 for absent. In the second table the model index
is the object type, the row is the level of detail and the slot is the colour
or tier a type's varying field picks; the first holds fourteen balls and, in
its last five entries, the things that move: the two stars, the wheel, the
hexagonal ball and the corkscrew.

A model is a header of `i16 x, z, y` for its centre, `u16 radius, i16, u16
flags`, and three or four block offsets, the first of which says how long the
header is, then the blocks. Polygons of four u8 vertex indices, as many as
the texture block has records, and a triangle's fourth byte is whatever it
is. Then three blocks that each open with `u32 count, u32 bytes per item`:
vertices, packed three at a time as three (x, z) i16 pairs, three y i16 and
a pad, with y up and one item per animation frame; one 16-byte record per
polygon in the POLY_FT4 layout, `u0 v0 flags, u1 v1 tex, u2 v2 pad, u3 v3
pad`, where bit 11 of the flags makes it a quad and the low byte of each word
is a number the loader turns into the GPU's clut and tpage; and, where there
is a fourth block, normals packed like the vertices.

    python3 tools/kula_ggi.py --sections
    python3 tools/kula_ggi.py --tables
    python3 tools/kula_ggi.py --sheet          # out/ggi/models.png and models.md
"""
import argparse
import math
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import open_disc
from png import write_png

FILE = "/HIRO/HIRO.GGI"
OUT = Path(__file__).resolve().parent.parent / "out" / "ggi"

HEADER_WORDS = 19
SECTIONS_AT = 6          # header word holding the first section's size
SECTIONS = 7
BASE = 52                # the first section starts after the 13-word header
TABLE_AT = (13, 14)      # header words placing the two tables inside section 0
SINGLES = 25             # entries in the first table
TYPES = 50               # models in the second table, one per object type
ROWS = 4                 # levels of detail per model
SLOTS = 4                # variants per level of detail
ABSENT = 0xFFFFFFFF
GROUP = 20               # bytes per three packed vertices
PREFIX = 8               # the count and length that open a packed block
QUAD = 0x0800            # the record flag that makes a polygon four-sided


class Model:
    __slots__ = ("at", "size", "centre", "radius", "kind", "flags", "blocks",
                 "quads", "frames", "uv", "normals")

    def __init__(self, blob, at, size):
        self.at, self.size = at, size
        cx, cz, cy, self.radius, self.kind, self.flags, first = struct.unpack_from(
            "<hhhHhHI", blob, at)
        self.centre = (cx, cy, cz)
        if first % 4 or first < 24:
            raise ValueError(f"no model at {at}")
        n = (first - 12) // 4
        self.blocks = list(struct.unpack_from(f"<{n}I", blob, at + 12)) + [size]
        body = blob[at:at + size]
        self.uv = self._uv(body, self.blocks[2])
        self.quads = self._quads(body, self.blocks[0], len(self.uv))
        self.frames = self._packed(body, self.blocks[1], self.blocks[2])
        self.normals = self._packed(body, self.blocks[3], self.blocks[4]) if n == 4 else []

    def polygons(self):
        """Each polygon's vertex indices: four where its record's flag says quad,
        else three, and the fourth byte then holds whatever it holds."""
        return [q if r["flags"] & QUAD else q[:3] for q, r in zip(self.quads, self.uv)]

    def points(self):
        """Every vertex index a polygon names."""
        return sorted({i for q in self.polygons() for i in q})

    @staticmethod
    def _quads(body, a, count):
        return [tuple(body[a + 4 * i:a + 4 * i + 4]) for i in range(count)]

    @staticmethod
    def _packed(body, a, b):
        """The frames of a packed block, each a list of (x, y, z) triples."""
        count, per = struct.unpack_from("<II", body, a)
        frames = []
        for f in range(count):
            p = a + PREFIX + f * per
            if p + per > b:
                break
            words = struct.unpack_from(f"<{per // 2}h", body, p)
            frame = []
            for k in range(per // GROUP):
                g = words[k * 10:(k + 1) * 10]
                for j in range(3):
                    frame.append((g[2 * j], g[6 + j], g[2 * j + 1]))
            frames.append(frame)
        return frames

    @staticmethod
    def _uv(body, a):
        """One texture record per polygon; the block's prefix counts them. The two
        words where a POLY_FT4 keeps its clut and tpage hold flags and a number
        in the low byte of each, which the loader turns into the GPU's words."""
        one, length = struct.unpack_from("<II", body, a)
        out = []
        for i in range(length // 16):
            u0, v0, flags, u1, v1, tex, u2, v2, _, u3, v3, _ = struct.unpack_from(
                "<BBHBBHBBHBBH", body, a + PREFIX + i * 16)
            out.append({"uv": [(u0, v0), (u1, v1), (u2, v2), (u3, v3)],
                        "flags": flags, "tex": tex})
        return out

    def bbox(self, frame=0):
        pts = self.frames[frame] if self.frames else [(0, 0, 0)]
        lo = [min(p[i] for p in pts) for i in range(3)]
        hi = [max(p[i] for p in pts) for i in range(3)]
        return lo, hi


class Ggi:
    def __init__(self, blob):
        self.blob = blob
        self.header = struct.unpack_from(f"<{HEADER_WORDS}I", blob, 0)
        self.bounds = [BASE]
        for c in self.header[SECTIONS_AT:SECTIONS_AT + SECTIONS]:
            self.bounds.append(self.bounds[-1] + 2 * c)
        self.table_at = [BASE + self.header[w] for w in TABLE_AT]
        t1, t2 = self.table_at
        self.singles = [struct.unpack_from(f"<{SLOTS}I", blob, t1 + 4 * SLOTS * i)
                        for i in range(SINGLES)]
        self.types = [[struct.unpack_from(f"<{SLOTS}I", blob, t2 + 4 * SLOTS * (ROWS * m + r))
                       for r in range(ROWS)] for m in range(TYPES)]
        self.models = {}
        starts = sorted(self.every())
        end = self.bounds[1]
        for at in starts:
            after = [s for s in starts if s > at]
            self.models[at] = Model(blob, at, (after[0] if after else end) - at)

    def every(self):
        """Every model start the two tables name, as a file offset."""
        t1, t2 = self.table_at
        out = set()
        for e in self.singles:
            out |= {t1 + v for v in e if v != ABSENT}
        for rows in self.types:
            for r in rows:
                out |= {t2 + v for v in r if v != ABSENT}
        return out

    def named(self):
        """(label, model) for every distinct model, labelled by where the tables put it."""
        seen = {}
        t1, t2 = self.table_at
        for m, rows in enumerate(self.types):
            for r, row in enumerate(rows):
                for s, v in enumerate(row):
                    if v != ABSENT:
                        seen.setdefault(t2 + v, []).append(f"type {m}/{s} lod {r}")
        for i, e in enumerate(self.singles):
            for s, v in enumerate(e):
                if v != ABSENT:
                    seen.setdefault(t1 + v, []).append(f"single {i}/{s}")
        return [(labels, self.models[at]) for at, labels in sorted(seen.items())]


def read(disc=None):
    return Ggi(open_disc(disc).read_file(FILE))


def show_sections(g):
    print(f"header: {' '.join(str(w) for w in g.header[:6])} | "
          f"sections {' '.join(str(w) for w in g.header[6:13])} | tables at "
          f"{' '.join(str(w) for w in g.header[13:15])} | {' '.join(hex(w) for w in g.header[15:])}")
    for i, (a, b) in enumerate(zip(g.bounds, g.bounds[1:])):
        print(f"S{i}: {a:#8x} .. {b:#8x}  {b - a:7} bytes")
    print(f"tables at {g.table_at[0]:#x} and {g.table_at[1]:#x}; "
          f"{len(g.models)} distinct models, {sum(m.size for m in g.models.values())} bytes")


def show_tables(g):
    def cell(base, v):
        return "      -" if v == ABSENT else f"{v:7}"
    t1, t2 = g.table_at
    print("singles (offsets from the first table):")
    for i, e in enumerate(g.singles):
        print(f"  {i:2}: " + " ".join(cell(t1, v) for v in e))
    print("\ntypes (offsets from the second table; a row is a level of detail, a slot a variant):")
    for m, rows in enumerate(g.types):
        if all(v == ABSENT for r in rows for v in r):
            continue
        for r, row in enumerate(rows):
            if all(v == ABSENT for v in row):
                continue
            print(f"  type {m:2} lod {r}: " + " ".join(cell(t2, v) for v in row))
    print("\nmodels:")
    for labels, m in g.named():
        lo, hi = m.bbox()
        print(f"  {m.at:#7x} {m.size:5} B  centre {m.centre} radius {m.radius:3} kind {m.kind:2} "
              f"flags {m.flags}  quads {len(m.quads):3}  vertices {len(m.points()):3}  "
              f"frames {len(m.frames):2}  normals {'yes' if m.normals else 'no '}  "
              f"box {lo}..{hi}  {'; '.join(labels)}")


# The sheet draws each model flat-shaded in the same three-quarter view, at one
# scale, so a reader can say which thing each is and how big it is next to the
# others; the block the objects stand on is 512 units across.
CELL = 128
COLS = 12
BLOCK = 512


def basis(yaw=35, pitch=28):
    cy, sy = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    cp, sp = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))
    right = (cy, 0, -sy)
    up = (-sp * sy, cp, -sp * cy)
    toward = (cp * sy, sp, cp * cy)
    return right, up, toward


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def raster(buf, w, h, pts, colour):
    """Fill one triangle of screen points into an RGBA buffer."""
    (x0, y0), (x1, y1), (x2, y2) = pts
    ymin, ymax = max(0, int(min(y0, y1, y2))), min(h - 1, int(max(y0, y1, y2)) + 1)
    area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    if not area:
        return
    for y in range(ymin, ymax + 1):
        xs = []
        for (ax, ay), (bx, by) in (((x0, y0), (x1, y1)), ((x1, y1), (x2, y2)), ((x2, y2), (x0, y0))):
            if (ay <= y + 0.5) != (by <= y + 0.5):
                xs.append(ax + (y + 0.5 - ay) * (bx - ax) / (by - ay))
        if len(xs) < 2:
            continue
        for x in range(max(0, int(min(xs))), min(w - 1, int(max(xs))) + 1):
            i = (y * w + x) * 4
            buf[i:i + 4] = colour


def draw(buf, w, h, model, ox, oy, scale, light=(0.4, 0.8, 0.45)):
    right, up, toward = basis()
    pts = model.frames[0] if model.frames else []
    if not pts:
        return
    tris = []
    for q in model.polygons():
        for a, b, c in ((q[0], q[1], q[2]), (q[1], q[3], q[2])) if len(q) == 4 else (q,):
            pa, pb, pc = pts[a], pts[b], pts[c]
            if len({a, b, c}) < 3:
                continue
            e1 = [pb[i] - pa[i] for i in range(3)]
            e2 = [pc[i] - pa[i] for i in range(3)]
            nrm = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2],
                   e1[0] * e2[1] - e1[1] * e2[0])
            ln = math.hypot(*nrm) or 1
            nrm = tuple(v / ln for v in nrm)
            depth = sum(dot(p, toward) for p in (pa, pb, pc)) / 3
            tris.append((depth, nrm, (pa, pb, pc)))
    tris.sort(key=lambda t: t[0])
    for _, nrm, tri in tris:
        # Both windings are drawn, since the game's and this projection's need not
        # agree; the light is applied to whichever way the face turns.
        lit = 0.35 + 0.65 * abs(dot(nrm, light))
        shade = int(60 + 170 * lit)
        colour = bytes((shade, int(shade * 0.92), int(shade * 0.75), 255))
        screen = [(ox + dot(p, right) * scale, oy - dot(p, up) * scale) for p in tri]
        raster(buf, w, h, screen, colour)


def label(buf, w, h, text, x, y):
    """Five-by-seven digits and a few letters, enough to name a cell."""
    glyphs = {
        "0": "01110 10001 10011 10101 11001 10001 01110", "1": "00100 01100 00100 00100 00100 00100 01110",
        "2": "01110 10001 00001 00010 00100 01000 11111", "3": "11110 00001 00001 01110 00001 00001 11110",
        "4": "00010 00110 01010 10010 11111 00010 00010", "5": "11111 10000 11110 00001 00001 10001 01110",
        "6": "00110 01000 10000 11110 10001 10001 01110", "7": "11111 00001 00010 00100 01000 01000 01000",
        "8": "01110 10001 10001 01110 10001 10001 01110", "9": "01110 10001 10001 01111 00001 00010 01100",
        "t": "01000 01000 11100 01000 01000 01001 00110", "s": "01111 10000 10000 01110 00001 00001 11110",
        "/": "00001 00010 00010 00100 01000 01000 10000", " ": "00000 00000 00000 00000 00000 00000 00000",
    }
    for ch in text:
        rows = glyphs.get(ch, glyphs[" "]).split()
        for r, row in enumerate(rows):
            for c, bit in enumerate(row):
                if bit == "1" and 0 <= x + c < w and 0 <= y + r < h:
                    i = ((y + r) * w + x + c) * 4
                    buf[i:i + 4] = b"\xe8\xee\xfb\xff"
        x += 6


def sheet(g):
    named = g.named()
    rows = math.ceil(len(named) / COLS)
    w, h = COLS * CELL, rows * CELL
    buf = bytearray(b"\x11\x17\x25\xff" * (w * h))
    scale = CELL / (BLOCK * 1.1)
    lines = ["# Models in HIRO.GGI", "",
             "Generated by `tools/kula_ggi.py --sheet`; the sheet is `models.png`, one cell per "
             "distinct model, numbered left to right, and every cell is drawn at the same scale "
             "with the game's y up. A block is 512 units across. Names go in "
             "`public/annotations.json`, not here.", "",
             "| # | table | centre | radius | kind | flags | quads | vertices | frames | normals | box | bytes |",
             "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for i, (labels, m) in enumerate(named):
        ox = (i % COLS) * CELL + CELL // 2
        oy = (i // COLS) * CELL + CELL // 2 + 12
        draw(buf, w, h, m, ox, oy, scale)
        head = labels[0].replace("type ", "t").replace("single ", "s").replace(" lod ", "/")
        label(buf, w, h, f"{i} {head}", (i % COLS) * CELL + 3, (i // COLS) * CELL + 3)
        lo, hi = m.bbox()
        lines.append(f"| {i} | {'; '.join(labels)} | {m.centre} | {m.radius} | {m.kind} | {m.flags} | "
                     f"{len(m.quads)} | {len(m.points())} | {len(m.frames)} | "
                     f"{'yes' if m.normals else 'no'} | {lo} .. {hi} | {m.size} |")
    OUT.mkdir(parents=True, exist_ok=True)
    write_png(OUT / "models.png", w, h, buf)
    (OUT / "models.md").write_text("\n".join(lines) + "\n")
    print(f"{len(named)} models -> {OUT / 'models.png'} and models.md")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=None, help="raw PS1 image; defaults to $KULA_DISC")
    ap.add_argument("--sections", action="store_true", help="the header and the seven sections")
    ap.add_argument("--tables", action="store_true", help="both model tables and every model")
    ap.add_argument("--sheet", action="store_true", help="draw every model to out/ggi/")
    args = ap.parse_args()
    g = read(args.disc)
    if args.sections or not (args.tables or args.sheet):
        show_sections(g)
    if args.tables:
        show_tables(g)
    if args.sheet:
        sheet(g)


if __name__ == "__main__":
    main()
