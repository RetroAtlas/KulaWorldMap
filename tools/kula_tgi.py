#!/usr/bin/env python3
"""Probe a world's .TGI, the file that holds its artwork.

The format is partly decoded; see SPIKE-TGI.md for what is settled and what is
not. This tool is the fast way to look at it, because the questions left are
visual ones: dump the atlas and see whether a guess lines up.

    python3 tools/kula_tgi.py --world HIRO --grey      out/tgi/HIRO-grey.png
    python3 tools/kula_tgi.py --world HIRO --palettes  out/tgi/HIRO-clut.png
    python3 tools/kula_tgi.py --world HIRO --colour --clut 3
    python3 tools/kula_tgi.py --world HIRO --profile   where the regions are
"""
import argparse
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import open_disc, THEMES
from png import write_png

OUT = Path(__file__).resolve().parent.parent / "out" / "tgi"

HEADER = 400          # lighting and shading parameters, then the data
TILE = 64             # pixels; rows are 64 bytes, so the pixels are 8bpp
CLUT_ENTRIES = 256
CLUT_BYTES = CLUT_ENTRIES * 2


def clut_run(blob):
    """The stretch of 512-byte blocks that really are palettes.

    Smoothness alone is not enough: pixel data read as 16-bit passes it. What
    separates them is that every entry of a real palette has its top bit set,
    and that a palette holds far more distinct values than pixel data does.
    """
    def is_clut(off):
        v = struct.unpack_from(f"<{CLUT_ENTRIES}H", blob, off)
        return (sum(1 for x in v if x & 0x8000) == CLUT_ENTRIES
                and len(set(v)) >= 120)

    best = None
    start = None
    for off in range(0, len(blob) - CLUT_BYTES, CLUT_BYTES):
        ok = is_clut(off)
        if ok and start is None:
            start = off
        elif not ok and start is not None:
            if best is None or off - start > best[1] - best[0]:
                best = (start, off)
            start = None
    if start is not None and (best is None or len(blob) - start > best[1] - best[0]):
        best = (start, len(blob) // CLUT_BYTES * CLUT_BYTES)
    return best


def palette(blob, base, i):
    v = struct.unpack_from(f"<{CLUT_ENTRIES}H", blob, base + i * CLUT_BYTES)
    return [(((x & 31) << 3), (((x >> 5) & 31) << 3), (((x >> 10) & 31) << 3)) for x in v]


def sheet(blob, start, cols, rows, pal=None):
    w, h = cols * TILE, rows * TILE
    out = bytearray(w * h * 4)
    for i in range(cols * rows):
        base = start + i * TILE * TILE
        tx, ty = i % cols, i // cols
        for y in range(TILE):
            for x in range(TILE):
                p = base + y * TILE + x
                v = blob[p] if p < len(blob) else 0
                c = pal[v] if pal else (v, v, v)
                o = ((ty * TILE + y) * w + (tx * TILE + x)) * 4
                out[o], out[o + 1], out[o + 2], out[o + 3] = c[0], c[1], c[2], 255
    return w, h, bytes(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=None)
    ap.add_argument("--world", default="HIRO", choices=THEMES)
    ap.add_argument("--start", type=lambda v: int(v, 0), default=HEADER)
    ap.add_argument("--cols", type=int, default=12)
    ap.add_argument("--rows", type=int, default=12)
    ap.add_argument("--clut", type=int, default=None, help="palette index for --colour")
    ap.add_argument("--grey", action="store_true")
    ap.add_argument("--colour", action="store_true")
    ap.add_argument("--palettes", action="store_true")
    ap.add_argument("--profile", action="store_true")
    args = ap.parse_args()

    disc = open_disc(args.disc)
    blob = disc.read_file(f"/{args.world}/{args.world}.TGI")
    OUT.mkdir(parents=True, exist_ok=True)
    run = clut_run(blob)

    if args.profile or not (args.grey or args.colour or args.palettes):
        print(f"{args.world}.TGI  {len(blob)} bytes")
        print(f"  header       0 - {HEADER}")
        if run:
            n = (run[1] - run[0]) // CLUT_BYTES
            print(f"  palettes  {run[0]:6} - {run[1]:6}   {n} of {CLUT_ENTRIES} colours")
            print(f"  pixels    {HEADER:6} - {run[0]:6} and {run[1]:6} - {len(blob)}"
                  f"   ({(run[0] - HEADER + len(blob) - run[1]) / (TILE * TILE):.1f} tiles' worth)")
        else:
            print("  no palette run found")
        if not (args.grey or args.colour or args.palettes):
            return

    if args.palettes and run:
        n = (run[1] - run[0]) // CLUT_BYTES
        scale = 3
        w, h = CLUT_ENTRIES, n * scale
        out = bytearray(w * h * 4)
        for r in range(n):
            p = palette(blob, run[0], r)
            for i, c in enumerate(p):
                for s in range(scale):
                    o = ((r * scale + s) * w + i) * 4
                    out[o], out[o + 1], out[o + 2], out[o + 3] = c[0], c[1], c[2], 255
        path = OUT / f"{args.world}-clut.png"
        write_png(path, w, h, bytes(out))
        print(f"{path}  {n} palettes")

    if args.grey or args.colour:
        pal = palette(blob, run[0], args.clut) if (args.colour and run and args.clut is not None) else None
        w, h, px = sheet(blob, args.start, args.cols, args.rows, pal)
        name = f"{args.world}-{'colour' if pal else 'grey'}-{args.start}.png"
        write_png(OUT / name, w, h, px)
        print(f"{OUT / name}  {w}x{h}, {args.cols * args.rows} tiles from {args.start}")


if __name__ == "__main__":
    main()
