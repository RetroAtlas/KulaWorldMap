#!/usr/bin/env python3
"""Export the block textures the viewer draws with.

A lattice cell below `firstRecord` is one of five block styles, and the model
table pairs the first four with the world's own stone (textures 0 to 3) and the
fifth with the shared panel at 8. That table is identical in all ten worlds, so
only the pixels change.

Each texture ships pre-shaded three ways, which is what the header's three
multipliers are for and exactly what a cube needs: one brightness per face
orientation. The atlas is one row per world and, along the row, each style in
each of its three shades.

    python3 tools/kula_tex.py        # public/tex/blocks.png
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kula_tgi as tgi
from kula_disc import open_disc, THEMES
from png import write_png

OUT = Path(__file__).resolve().parent.parent / "public" / "tex" / "blocks.png"
SHADES = 3
SIZE = 64


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=None)
    args = ap.parse_args()
    disc = open_disc(args.disc)

    first = tgi.style_textures(disc.read_file(f"/{THEMES[0]}/{THEMES[0]}.TGI"))
    cols = len(first) * SHADES
    W, H = cols * SIZE, len(THEMES) * SIZE
    px = bytearray(W * H * 4)
    for row, world in enumerate(THEMES):
        blob = disc.read_file(f"/{world}/{world}.TGI")
        page = tgi.vram(blob)
        pals = dict(tgi.cluts(page))
        pmap = tgi.palette_map(blob)
        tex = tgi.textures(blob)
        styles = tgi.style_textures(blob)
        if styles != first:
            sys.exit(f"{world} names different style textures ({styles} vs {first})")
        for s, ti in enumerate(styles):
            rows = pmap.get(ti)
            for k in range(SHADES):
                pal = pals.get(rows[k]) if rows else None
                if pal is None:
                    pal = [(i, i, i) for i in range(256)]
                ox, oy = (s * SHADES + k) * SIZE, row * SIZE
                base = tex[ti]["at"]
                for y in range(SIZE):
                    for x in range(SIZE):
                        r, g, b = pal[blob[base + y * SIZE + x]]
                        o = ((oy + y) * W + ox + x) * 4
                        px[o:o + 4] = bytes((r, g, b, 255))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    write_png(OUT, W, H, bytes(px))
    print(f"{OUT.relative_to(OUT.parent.parent.parent)}  {W}x{H}  "
          f"{len(THEMES)} worlds x {len(first)} styles {first} x {SHADES} shades "
          f"({OUT.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
