#!/usr/bin/env python3
"""A world's .TGI: its artwork, as the game itself reads it.

The file is a 400-byte header, then eleven sections whose lengths are counts of
u16 stored at header offsets 356..396. The parser at 0x000253e0 walks exactly
that, and the cumulative lengths land on the file size in all ten worlds.

The last section is the artwork, and it is not a picture: it is a list of VRAM
uploads. Each is `u16 x, y, w, h` followed by w*h halfwords of raw VRAM, handed
straight to the Psy-Q LoadImage at 0x000254e0. So `w` counts 16-bit words, and
an 8bpp texture is twice that many pixels wide.

Each world uploads 56 textures of 64x64 at 8bpp, three smaller 4bpp mip levels
of each, and two blocks of 256-entry palettes parked off to the side of VRAM.

    python3 tools/kula_tgi.py --world HIRO --sections
    python3 tools/kula_tgi.py --world HIRO --vram
    python3 tools/kula_tgi.py --world HIRO --textures --clut 0
"""
import argparse
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import open_disc, THEMES
from png import write_png

OUT = Path(__file__).resolve().parent.parent / "out" / "tgi"

HEADER = 400
SECTIONS = 11
COUNTS_AT = 356
ART = 10              # the section holding the VRAM uploads
MODELS = 5            # a table of (first, count) runs into the quads of section 6
MAP = 6               # the quads, which also pair textures with their palettes
STYLE_MODEL = 7       # the model a lattice cell of style 0 draws
MAP_STRIDE = 20       # u16 per record
LEVELS = 4            # a texture and its three smaller levels
SHADES = 3            # a palette per lighting level, which the header sets out
VRAM_W, VRAM_H = 1024, 512
TEX = (32, 64)        # the blit shape of a full-size texture, in words


def sections(blob):
    counts = struct.unpack_from(f"<{SECTIONS}I", blob, COUNTS_AT)
    bounds, off = [HEADER], HEADER
    for c in counts:
        off += c * 2
        bounds.append(off)
    return bounds


def blits(blob):
    bounds = sections(blob)
    p, end = bounds[ART], bounds[ART + 1]
    out = []
    while p + 8 <= end:
        x, y, w, h = struct.unpack_from("<4H", blob, p)
        p += 8
        n = w * h * 2
        if not n or p + n > end:
            break
        out.append({"x": x, "y": y, "w": w, "h": h, "at": p})
        p += n
    return out, p == end


def vram(blob):
    """Replay every upload into a 1024x512 page of 16-bit words."""
    page = bytearray(VRAM_W * VRAM_H * 2)
    for b in blits(blob)[0]:
        for row in range(b["h"]):
            src = b["at"] + row * b["w"] * 2
            dst = ((b["y"] + row) * VRAM_W + b["x"]) * 2
            if b["y"] + row >= VRAM_H:
                break
            page[dst:dst + b["w"] * 2] = blob[src:src + b["w"] * 2]
    return page


def rgb(word):
    return ((word & 31) << 3, ((word >> 5) & 31) << 3, ((word >> 10) & 31) << 3)


def cluts(page):
    """Every 256-entry palette row parked to the right of the textures."""
    out = []
    for y in range(VRAM_H):
        row = struct.unpack_from("<256H", page, (y * VRAM_W + 768) * 2)
        if sum(1 for v in row if v & 0x8000) == 256 and len(set(row)) >= 32:
            out.append((y, [rgb(v) for v in row]))
    return out


def textures(blob):
    return [b for b in blits(blob)[0] if (b["w"], b["h"]) == TEX]


def models(blob):
    """Each model as the textures of its quads, in order.

    Section 5 is (first, count) pairs, and the loop at 0x000259b8 indexes it
    with a stride of 4 bytes. The table is identical in all ten worlds, so a
    model means the same thing everywhere and only the pixels change.
    """
    bounds = sections(blob)
    pairs = struct.unpack_from(f"<{(bounds[MODELS + 1] - bounds[MODELS]) // 2}h",
                               blob, bounds[MODELS])
    quads = (bounds[MAP + 1] - bounds[MAP]) // 2 // MAP_STRIDE
    w = struct.unpack_from(f"<{(bounds[MAP + 1] - bounds[MAP]) // 2}H", blob, bounds[MAP])
    at = {(b["x"], b["y"]): i for i, b in enumerate(textures(blob))}
    out = []
    for i in range(len(pairs) // 2):
        first, count = pairs[i * 2], pairs[i * 2 + 1]
        out.append([at.get((w[r * MAP_STRIDE + 3], w[r * MAP_STRIDE + 4]))
                    for r in range(first, first + max(0, count)) if 0 <= r < quads])
    return out


def style_textures(blob):
    """The texture each lattice style below firstRecord draws.

    The five styles are the five single-quad models from STYLE_MODEL up, which
    hold the four textures a world changes plus one shared panel.
    """
    m = models(blob)
    return [m[STYLE_MODEL + s][0] for s in range(5)]


def palette_map(blob):
    """Which palettes each texture is drawn with.

    Section 6 is a table of 20 u16. The first three are CLUT ids, and the same
    palettes appear again as bare VRAM rows beside the position of each of the
    texture's four levels. Keying on the level-0 position pairs every texture
    with exactly one triple, which is the check that this reading is right.
    """
    bounds = sections(blob)
    lo, hi = bounds[MAP], bounds[MAP + 1]
    n = (hi - lo) // 2
    w = struct.unpack_from(f"<{n}H", blob, lo)
    at = {(b["x"], b["y"]): i for i, b in enumerate(textures(blob))}
    out = {}
    for r in range(n // MAP_STRIDE):
        rec = w[r * MAP_STRIDE:(r + 1) * MAP_STRIDE]
        i = at.get((rec[3], rec[4]))
        if i is not None:
            out[i] = rec[5:5 + SHADES]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=None)
    ap.add_argument("--world", default="HIRO", choices=THEMES)
    ap.add_argument("--clut", type=int, default=None,
                    help="force one palette; default is each texture's own")
    ap.add_argument("--shade", type=int, default=1, choices=range(SHADES),
                    help="which of the three lighting levels to draw")
    ap.add_argument("--sections", action="store_true")
    ap.add_argument("--vram", action="store_true")
    ap.add_argument("--textures", action="store_true")
    args = ap.parse_args()

    disc = open_disc(args.disc)
    blob = disc.read_file(f"/{args.world}/{args.world}.TGI")
    OUT.mkdir(parents=True, exist_ok=True)
    bl, exact = blits(blob)
    page = vram(blob)
    pals = cluts(page)

    if args.sections or not (args.vram or args.textures):
        bounds = sections(blob)
        print(f"{args.world}.TGI  {len(blob)} bytes")
        for i in range(SECTIONS):
            print(f"  section {i:2}: {bounds[i]:7} .. {bounds[i+1]:7}  {bounds[i+1]-bounds[i]:7} bytes")
        print(f"  section {ART} holds {len(bl)} VRAM uploads, "
              f"{'ending exactly on the section' if exact else 'NOT ending on the section'}")
        print(f"  {len(textures(blob))} textures of 64x64, {len(pals)} palettes")

    if args.vram:
        px = bytearray(VRAM_W * VRAM_H * 4)
        for i in range(VRAM_W * VRAM_H):
            r, g, b = rgb(struct.unpack_from("<H", page, i * 2)[0])
            px[i * 4:i * 4 + 4] = bytes((r, g, b, 255))
        write_png(OUT / f"{args.world}-vram.png", VRAM_W, VRAM_H, bytes(px))
        print(f"{OUT / f'{args.world}-vram.png'}  the whole page as 16-bit colour")

    if args.textures:
        tex = textures(blob)
        by_row = dict(pals)
        pmap = palette_map(blob)
        cols = 8
        rows = (len(tex) + cols - 1) // cols
        W, H = cols * 64, rows * 64
        px = bytearray(W * H * 4)
        grey = [(i, i, i) for i in range(256)]
        for i, b in enumerate(tex):
            if args.clut is not None:
                pal = pals[args.clut][1] if pals else grey
            else:
                rows = pmap.get(i)
                pal = by_row.get(rows[args.shade], grey) if rows else grey
            tx, ty = (i % cols) * 64, (i // cols) * 64
            for y in range(64):
                for x in range(64):
                    v = blob[b["at"] + y * 64 + x]
                    r, g, bb = pal[v]
                    o = ((ty + y) * W + tx + x) * 4
                    px[o:o + 4] = bytes((r, g, bb, 255))
        tag = f"clut{args.clut}" if args.clut is not None else f"shade{args.shade}"
        name = f"{args.world}-textures-{tag}.png"
        write_png(OUT / name, W, H, bytes(px))
        print(f"{OUT / name}  {len(tex)} textures, {len(pmap)} of them paired with a palette")


if __name__ == "__main__":
    main()
