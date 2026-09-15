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
the colour block has records, and a triangle's fourth byte is whatever it
is. Then three blocks that each open with `u32 count, u32 bytes per item`:
vertices, packed three at a time as three (x, z) i16 pairs, three y i16 and
a pad, with y up and one item per animation frame; one 16-byte colour record
per polygon, four corners of `u8 r, g, b, flags`, the flags on the first
corner only: 0x20 always, 0x10 for a Gouraud polygon, 0x08 for a quad and
0x02 for a translucent one; and, where there is a fourth block, normals
packed like the vertices. The meshes carry no texture coordinates: every
polygon is coloured, and the shading is baked into the colours.

After the models come the sprites and the lettering the game draws flat, 148
VRAM uploads with their palettes; none of the meshes is textured.

    python3 tools/kula_ggi.py --sections
    python3 tools/kula_ggi.py --tables
    python3 tools/kula_ggi.py --sheet          # out/ggi/models.png and models.md
    python3 tools/kula_ggi.py --textures       # out/ggi/textures.png and textures.md
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
# The flags a colour record carries in its first corner's fourth byte.
GOURAUD = 0x10
QUAD = 0x08
BLEND = 0x02


class Model:
    __slots__ = ("at", "size", "centre", "radius", "kind", "flags", "blocks",
                 "quads", "frames", "colours", "normals")

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
        self.colours = self._colours(body, self.blocks[2])
        self.quads = self._quads(body, self.blocks[0], len(self.colours))
        self.frames = self._packed(body, self.blocks[1], self.blocks[2])
        self.normals = self._packed(body, self.blocks[3], self.blocks[4]) if n == 4 else []

    def polygons(self):
        """Each polygon's vertex indices: four where its record's flag says quad,
        else three, and the fourth byte then holds whatever it holds."""
        return [q if c["flags"] & QUAD else q[:3] for q, c in zip(self.quads, self.colours)]

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
    def _colours(body, a):
        """One colour record per polygon; the block's prefix counts them."""
        one, length = struct.unpack_from("<II", body, a)
        out = []
        for i in range(length // 16):
            b = struct.unpack_from("<16B", body, a + PREFIX + i * 16)
            out.append({"rgb": [tuple(b[k:k + 3]) for k in range(0, 16, 4)], "flags": b[3]})
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


# The last section is the sprites, walked by 0x80022fd8 into a table of 180
# twelve-byte descriptors: `u32 count`, then per sprite `i16 bpp, i16 abr`,
# for a paletted one `u16 x, y` of its palette in VRAM, `i16 inline, u16 late`
# and the palette's words where `inline` is 0, and then `u16 x, y, w, h` of
# the image with its pixels where `late` is 0, w in pixels and the data padded
# to four bytes. Everything is a VRAM upload, like the artwork's.
TEXTURES = 6
VRAM_W, VRAM_H = 1024, 512


def textures(g):
    blob, p, end = g.blob, g.bounds[TEXTURES], g.bounds[TEXTURES + 1]
    count = struct.unpack_from("<I", blob, p)[0]
    p += 4
    out = []
    for i in range(count):
        bpp, abr = struct.unpack_from("<hh", blob, p)
        p += 4
        if bpp == -1:
            p += 2
            out.append(None)
            continue
        t = {"bpp": bpp, "abr": abr, "clut": None, "palette": None}
        px, py, inline, late = struct.unpack_from("<HHhH", blob, p)
        p += 8
        if bpp != 16:
            t["clut"] = (px, py)
            if inline == 0:
                n = (1 << bpp) * 2
                t["palette"] = (px, py, p, n)
                p += n
        x, y, w, h = struct.unpack_from("<4H", blob, p)
        p += 8
        words = (w * bpp) >> 4
        t.update({"x": x, "y": y, "w": w, "h": h, "words": words, "at": None})
        if late == 0:
            t["at"] = p
            p += words * h * 2
            if (words * h) & 1:
                p += 2
        out.append(t)
    return out, p == end


def vram(g):
    """Replay every upload into a 1024x512 page of 16-bit words."""
    page = bytearray(VRAM_W * VRAM_H * 2)
    for t in textures(g)[0]:
        if t is None:
            continue
        if t["palette"]:
            px, py, at, n = t["palette"]
            dst = (py * VRAM_W + px) * 2
            page[dst:dst + n] = g.blob[at:at + n]
        if t["at"] is not None:
            for row in range(t["h"]):
                src = t["at"] + row * t["words"] * 2
                dst = ((t["y"] + row) * VRAM_W + t["x"]) * 2
                page[dst:dst + t["words"] * 2] = g.blob[src:src + t["words"] * 2]
    return page


def rgb(word):
    return ((word & 31) << 3, ((word >> 5) & 31) << 3, ((word >> 10) & 31) << 3, 255)


def texel(page, t, u, v):
    """The colour of one pixel of a texture, read the way the GPU would."""
    if u < 0 or v < 0 or u >= t["w"] or v >= t["h"]:
        return (0, 0, 0, 0)
    row = (t["y"] + v) * VRAM_W
    if t["bpp"] == 16:
        word = struct.unpack_from("<H", page, (row + t["x"] + u) * 2)[0]
        return rgb(word) if word else (0, 0, 0, 0)
    if t["bpp"] == 8:
        index = page[(row + t["x"]) * 2 + u]
    else:
        byte = page[(row + t["x"]) * 2 + u // 2]
        index = byte & 15 if u % 2 == 0 else byte >> 4
    px, py = t["clut"]
    word = struct.unpack_from("<H", page, (py * VRAM_W + px + index) * 2)[0]
    return rgb(word) if word else (0, 0, 0, 0)


def texture_sheet(g):
    """Every sprite decoded with its own palette, in a grid, numbered."""
    tex, exact = textures(g)
    page = vram(g)
    cell = 72
    cols = 12
    rows = math.ceil(len(tex) / cols)
    w, h = cols * cell, rows * cell
    buf = bytearray(b"\x11\x17\x25\xff" * (w * h))
    for i, t in enumerate(tex):
        ox, oy = (i % cols) * cell + 4, (i // cols) * cell + 12
        label(buf, w, h, str(i), (i % cols) * cell + 3, (i // cols) * cell + 2)
        if t is None:
            continue
        sx = min(1.0, (cell - 8) / max(t["w"], t["h"]))
        for v in range(t["h"]):
            for u in range(t["w"]):
                c = texel(page, t, u, v)
                if not c[3]:
                    continue
                x, y = ox + int(u * sx), oy + int(v * sx)
                if x < w and y < h:
                    k = (y * w + x) * 4
                    buf[k:k + 4] = bytes(c)
    OUT.mkdir(parents=True, exist_ok=True)
    write_png(OUT / "textures.png", w, h, buf)
    lines = ["# Sprites in HIRO.GGI", "",
             f"Generated by `tools/kula_ggi.py --textures`; {len(tex)} uploads in the last section, "
             f"{'walked exactly' if exact else 'NOT walked exactly'}. The sheet is `textures.png`.", "",
             "| # | bpp | abr | palette at | image at | size |", "| --- | --- | --- | --- | --- | --- |"]
    for i, t in enumerate(tex):
        if t is None:
            lines.append(f"| {i} | - | | | | |")
            continue
        lines.append(f"| {i} | {t['bpp']} | {t['abr']} | {t['clut'] or ''}"
                     f"{' (inline)' if t['palette'] else ''} | {t['x']},{t['y']} | {t['w']}x{t['h']} |")
    (OUT / "textures.md").write_text("\n".join(lines) + "\n")
    print(f"{len(tex)} sprites -> {OUT / 'textures.png'} and textures.md")


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


def draw(buf, w, h, model, ox, oy, scale):
    """The model in its own colours, back to front, a triangle filled with the
    mean of its corners' colours since the shading is already in them."""
    right, up, toward = basis()
    pts = model.frames[0] if model.frames else []
    if not pts:
        return
    tris = []
    for q, c in zip(model.polygons(), model.colours):
        corners = ((0, 1, 2), (1, 3, 2)) if len(q) == 4 else ((0, 1, 2),)
        for i, j, k in corners:
            tri = (pts[q[i]], pts[q[j]], pts[q[k]])
            if len({q[i], q[j], q[k]}) < 3:
                continue
            rgb = [c["rgb"][i], c["rgb"][j], c["rgb"][k]]
            mean = tuple(sum(x[n] for x in rgb) // 3 for n in range(3))
            depth = sum(dot(p, toward) for p in tri) / 3
            tris.append((depth, mean, tri))
    tris.sort(key=lambda t: t[0])
    for _, rgb, tri in tris:
        screen = [(ox + dot(p, right) * scale, oy - dot(p, up) * scale) for p in tri]
        raster(buf, w, h, screen, bytes(rgb + (255,)))


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
    ap.add_argument("--textures", action="store_true", help="draw every sprite to out/ggi/")
    args = ap.parse_args()
    g = read(args.disc)
    if args.sections or not (args.tables or args.sheet or args.textures):
        show_sections(g)
    if args.tables:
        show_tables(g)
    if args.sheet:
        sheet(g)
    if args.textures:
        texture_sheet(g)


if __name__ == "__main__":
    main()
