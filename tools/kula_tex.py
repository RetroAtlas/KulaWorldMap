#!/usr/bin/env python3
"""Export the block textures, one atlas per world: a row per shade the game
ships a texture pre-lit in and, along the row, every texture in order.

    python3 tools/kula_tex.py        # public/tex/<WORLD>.png
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kula_tgi as tgi
from kula_disc import open_disc, THEMES
from png import write_png

OUT = Path(__file__).resolve().parent.parent / "public" / "tex"
SHADES = 3
SIZE = 64


def atlas(blob):
    page = tgi.vram(blob)
    pmap = tgi.palette_map(blob)
    tex = tgi.textures(blob)
    W, H = len(tex) * SIZE, SHADES * SIZE
    px = bytearray(W * H * 4)
    pals = {}
    for i, t in enumerate(tex):
        rows = pmap.get(i)
        if rows is None:
            sys.exit(f"texture {i} at ({t['x']}, {t['y']}) has no record naming its palettes")
        for k in range(SHADES):
            if rows[k] not in pals:
                pals[rows[k]] = tgi.palette(page, rows[k])
            pal = pals[rows[k]]
            for y in range(SIZE):
                src = t["at"] + y * SIZE
                o = ((k * SIZE + y) * W + i * SIZE) * 4
                for x in range(SIZE):
                    r, g, b = pal[blob[src + x]]
                    px[o:o + 4] = bytes((r, g, b, 255))
                    o += 4
    return W, H, bytes(px), len(tex)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=None)
    ap.add_argument("--world", default=None, choices=THEMES, help="one world only")
    args = ap.parse_args()
    disc = open_disc(args.disc)
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for world in [args.world] if args.world else THEMES:
        W, H, px, n = atlas(disc.read_file(f"/{world}/{world}.TGI"))
        out = OUT / f"{world}.png"
        write_png(out, W, H, px)
        total += out.stat().st_size
        print(f"{out.relative_to(OUT.parent.parent)}  {W}x{H}  {n} textures x {SHADES} shades "
              f"({out.stat().st_size / 1024:.0f} KB)")
    print(f"{total / 1024:.0f} KB in all")


if __name__ == "__main__":
    main()
