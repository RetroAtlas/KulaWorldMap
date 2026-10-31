#!/usr/bin/env python3
"""Export the block textures, one atlas per world: a row per shade the game
ships a texture pre-lit in and, along the row, every texture in order; and for
another release, sheets of the same grid carrying only the cells whose texture
differs from the base's, transparent everywhere else, to be drawn over the
base's atlas.

    python3 tools/kula_tex.py                # public/tex/<WORLD>.png
    python3 tools/kula_tex.py --release jp   # public/tex/jp/all.png and public/tex/jp/<WORLD>.png
"""
import argparse
import hashlib
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kula_tgi as tgi
from kula_disc import BASE, RELEASES, THEMES, file_at, open_release
from png import read_png, write_png

OUT = Path(__file__).resolve().parent.parent / "public" / "tex"
SHARED = "all"
SHADES = 3
SIZE = 64


def shades(blob):
    """The textures, and for the texture and shade given the palette it is drawn through."""
    page = tgi.vram(blob)
    pmap = tgi.palette_map(blob)
    tex = tgi.textures(blob)
    pals = {}

    def palette(i, k):
        rows = pmap.get(i)
        if rows is None:
            sys.exit(f"texture {i} at ({tex[i]['x']}, {tex[i]['y']}) has no record naming its palettes")
        if rows[k] not in pals:
            pals[rows[k]] = tgi.palette(page, rows[k])
        return pals[rows[k]]

    return tex, palette


def atlas(blob):
    tex, palette = shades(blob)
    W, H = len(tex) * SIZE, SHADES * SIZE
    px = bytearray(W * H * 4)
    for i, t in enumerate(tex):
        for k in range(SHADES):
            pal = palette(i, k)
            for y in range(SIZE):
                src = t["at"] + y * SIZE
                o = ((k * SIZE + y) * W + i * SIZE) * 4
                for x in range(SIZE):
                    r, g, b = pal[blob[src + x]]
                    px[o:o + 4] = bytes((r, g, b, 255))
                    o += 4
    return W, H, bytes(px), len(tex)


def cut(w, h, rgba):
    """An atlas's pixels as its cells, by texture index and shade."""
    out = {}
    for i in range(w // SIZE):
        for k in range(h // SIZE):
            at = ((k * SIZE) * w + i * SIZE) * 4
            out[i, k] = b"".join(rgba[at + y * w * 4:at + y * w * 4 + SIZE * 4] for y in range(SIZE))
    return out


def cells(blob):
    """A world's textures in their shades, an RGBA cell each, by texture index and shade."""
    W, H, px, _ = atlas(blob)
    return cut(W, H, px)


def digest(blob):
    """A digest of the model table and the quads, which say what each texture index means."""
    bounds = tgi.sections(blob)
    return hashlib.sha256(b"".join(blob[bounds[s]:bounds[s + 1]] for s in (tgi.MODELS, tgi.MAP))).hexdigest()


def mean(blob, texs, shade):
    """The mean colour of the textures numbered, drawn in a shade."""
    tex, palette = shades(blob)
    sums, n = [0, 0, 0], 0
    for i in texs:
        pal = palette(i, shade)
        at = tex[i]["at"]
        counts = Counter(blob[at:at + SIZE * SIZE])
        for v, c in counts.items():
            for ch in range(3):
                sums[ch] += pal[v][ch] * c
        n += SIZE * SIZE
    return [round(s / n) for s in sums]


def sheet(w, h, carried):
    """A sheet of the atlas's size, transparent but for the cells it carries."""
    px = bytearray(w * h * 4)
    for (i, k), cell in carried.items():
        for y in range(SIZE):
            o = ((k * SIZE + y) * w + i * SIZE) * 4
            px[o:o + SIZE * 4] = cell[y * SIZE * 4:(y + 1) * SIZE * 4]
    return w, h, bytes(px), len(carried)


def sheets(theirs, base):
    """For each world of a release the sheets to draw over the base's atlas, in order, and each
    sheet's pixels, from the release's TGI by world and the base's atlas by world as read_png gives
    it. A cell that differs from the base's in every world, and the same way in every world, goes
    on the one sheet every world takes; any other cell that differs goes on its world's own."""
    if not theirs:
        return {}, {}
    differing = {}
    for world, blob in theirs.items():
        W, H, px, n = atlas(blob)
        bw, bh, bpx = base[world]
        if (W, H) != (bw, bh):
            sys.exit(f"{world}: the release's atlas is {W}x{H}, {n} textures, "
                     f"not the base's {bw}x{bh}, {bw // SIZE} textures")
        ours = cut(bw, bh, bpx)
        differing[world] = {key: cell for key, cell in cut(W, H, px).items() if cell != ours[key]}
    (w, h), *more = {base[world][:2] for world in theirs}
    if more:
        sys.exit("the base's atlases are not one size, so no sheet can serve every world")
    everywhere = set.intersection(*(set(d) for d in differing.values()))
    shared = {key: cell for key, cell in next(iter(differing.values())).items()
              if key in everywhere and len({d[key] for d in differing.values()}) == 1}
    order, pixels = {}, {}
    if shared:
        pixels[SHARED] = sheet(w, h, shared)
    for world, found in differing.items():
        own = {key: cell for key, cell in found.items() if key not in shared}
        if own:
            pixels[world] = sheet(w, h, own)
        names = [SHARED] * bool(shared) + [world] * bool(own)
        if names:
            order[world] = names
    return order, pixels


def base_atlases(worlds):
    """The base's committed atlases by world, which a release's sheets are laid against."""
    out = {}
    for world in worlds:
        path = OUT / f"{world}.png"
        if not file_at(path):
            sys.exit(f"no atlas at {path}: write the base's atlases first")
        out[world] = read_png(path)
    return out


def sheet_at(release, name):
    """Where a release's sheet stands, under the atlases' directory by the release's id."""
    return OUT / release / f"{name}.png"


def write_sheets(release, pixels):
    """A release's sheets, each by name with its pixels, written under its own directory, any other
    left there from an earlier build removed; per sheet its path, size and cells."""
    out = OUT / release
    for stale in out.glob("*.png") if out.is_dir() else ():
        if stale.stem not in pixels:
            stale.unlink()
    files = {}
    for name, (w, h, px, n) in pixels.items():
        path = sheet_at(release, name)
        path.parent.mkdir(parents=True, exist_ok=True)
        write_png(path, w, h, px)
        files[name] = (path, w, h, n)
    return files


def write_atlases(disc, worlds):
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for world in worlds:
        W, H, px, n = atlas(disc.read_file(f"/{world}/{world}.TGI"))
        out = OUT / f"{world}.png"
        write_png(out, W, H, px)
        total += out.stat().st_size
        print(f"{out.relative_to(OUT.parent.parent)}  {W}x{H}  {n} textures x {SHADES} shades "
              f"({out.stat().st_size / 1024:.0f} KB)")
    print(f"{total / 1024:.0f} KB in all")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--release", choices=list(RELEASES), default=BASE,
                    help="the release whose disc is read: the base's atlases, or another's sheets over them")
    ap.add_argument("--disc", default=None)
    ap.add_argument("--world", default=None, choices=THEMES, help="one world's atlas only")
    args = ap.parse_args()
    if args.world and args.release != BASE:
        sys.exit("a release's sheets are cut over every world; --world picks one atlas of the base's")
    disc = open_release(args.release, args.disc)
    if args.release == BASE:
        write_atlases(disc, [args.world] if args.world else THEMES)
        return
    tgis = {world: disc.read_file(f"/{world}/{world}.TGI") for world in THEMES}
    order, pixels = sheets(tgis, base_atlases(THEMES))
    files = write_sheets(args.release, pixels)
    if not files:
        print(f"no texture of {RELEASES[args.release]['name']} differs from the base's; nothing written")
        return
    total = 0
    for path, w, h, n in files.values():
        total += path.stat().st_size
        print(f"{path.relative_to(OUT.parent.parent)}  {w}x{h}  {n} cells ({path.stat().st_size / 1024:.0f} KB)")
    print(f"{total / 1024:.0f} KB in all, drawn over {len(order)} of {len(tgis)} worlds")


if __name__ == "__main__":
    main()
