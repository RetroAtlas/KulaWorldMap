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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=None)
    ap.add_argument("--world", default="HIRO", choices=THEMES)
    ap.add_argument("--clut", type=int, default=0)
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
        pal = pals[args.clut][1] if pals else [(i, i, i) for i in range(256)]
        cols = 8
        rows = (len(tex) + cols - 1) // cols
        W, H = cols * 64, rows * 64
        px = bytearray(W * H * 4)
        for i, b in enumerate(tex):
            tx, ty = (i % cols) * 64, (i // cols) * 64
            for y in range(64):
                for x in range(64):
                    v = blob[b["at"] + y * 64 + x]
                    r, g, bb = pal[v]
                    o = ((ty + y) * W + tx + x) * 4
                    px[o:o + 4] = bytes((r, g, bb, 255))
        name = f"{args.world}-textures-clut{args.clut}.png"
        write_png(OUT / name, W, H, bytes(px))
        print(f"{OUT / name}  {len(tex)} textures with palette {args.clut} of {len(pals)}")


if __name__ == "__main__":
    main()
