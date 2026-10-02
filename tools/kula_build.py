#!/usr/bin/env python3
"""Read every level off the disc and write public/map_data.json, and every
object's mesh, with how everything moves and what every face wears, and write
public/objects.json.

    export KULA_DISC="/path/to/Roll Away.bin"
    python3 tools/kula_build.py

The output is generated and committed, so regenerate it rather than editing it.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import EXE, THEMES, open_disc, packs
from kula_ggi import FILE as GGI, Ggi, shadows, write_objects
from kula_level import Level, SIDE, STYLES, FIRST_RECORD, PLATFORM_KIND
from kula_motion import Code, readings, table
from kula_pak import Pak
from kula_skins import table as skins_table

OUT = Path(__file__).resolve().parent.parent / "public" / "map_data.json"
OBJECTS = OUT.parent / "objects.json"
WORLD_LEVELS = 15
FINAL_LEVELS = 2


def shown_as(theme, pack, index):
    """The number the game's pause screen gives a level, which the game
    computes rather than reads from the pack."""
    w = THEMES.index(theme)
    if pack.upper() == f"/{theme}/{theme}.PAK" and index < WORLD_LEVELS:
        return f"LEVEL {WORLD_LEVELS * w + index + 1}"
    if pack.upper().endswith("FI.PAK"):
        return f"FINAL {FINAL_LEVELS * w + index + 1}"
    return None


def level_json(L, theme, pack, index):
    cells = []
    for x, y, z, v in L.cells:
        cells += [x, y, z, v]
    (x0, x1), (y0, y1), (z0, z1) = L.extent() or ((0, 0), (0, 0), (0, 0))
    out = {
        "name": L.name,
        "theme": theme,
        "pack": pack,
        "index": index,
        "placed": len(L.cells),
        "header": L.header,
        "min": [x0, y0, z0],
        "max": [x1, y1, z1],
        "cells": cells,
        "records": [r.as_dict() for r in L.records],
        "time": L.trailer.f[4],
    }
    shown = shown_as(theme, pack, index)
    if shown:
        out["shown"] = shown
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=None, help="raw PS1 image; defaults to $KULA_DISC")
    args = ap.parse_args()
    disc = open_disc(args.disc)

    levels, themes, checked, problems, speeds = [], [], 0, [], set()
    for theme, path in packs(disc):
        pak = Pak(disc.read_file(path), path)
        if not themes or themes[-1]["id"] != theme:
            themes.append({"id": theme, "levels": []})
        for i in range(len(pak)):
            L = Level(pak.level(i), pak.name(i), theme)
            for msg in L.verify():
                problems.append(f"{path} {L.name}: {msg}")
            checked += sum(1 for c in L.cells if c[3] >= FIRST_RECORD)
            speeds |= {r.speed for r in L.records if r.kind == PLATFORM_KIND}
            themes[-1]["levels"].append(len(levels))
            levels.append(level_json(L, theme, path, i))
    if len(speeds) != 1:
        problems.append(f"moving platforms run at {sorted(speeds)}, not one speed")
    if problems:
        for p in problems[:20]:
            print(f"  {p}", file=sys.stderr)
        sys.exit(f"{len(problems)} readings do not check out; refusing to write")

    data = {
        "game": "Kula World",
        "platform": "PlayStation",
        "release": "Roll Away (NTSC-U, SLUS-00724)",
        "side": SIDE,
        "styles": STYLES,
        "firstRecord": FIRST_RECORD,
        "themes": themes,
        "levels": levels,
    }
    placed = {o["type"] for l in levels for r in l["records"] for o in r["on"]}
    code = Code(disc.read_file(EXE))
    r = readings(code)
    motion = table(r, speeds.pop())
    skins = skins_table(code, {t: disc.read_file(f"/{t}/{t}.TGI") for t in THEMES})
    if skins["copycat"] not in {l["pack"] for l in levels}:
        sys.exit(f"the skins name {skins['copycat']}, which is no pack on the disc")
    g = Ggi(disc.read_file(GGI))
    cast = shadows(g, r["shadow.sprite"], r["shadow.sprites"])

    OUT.parent.mkdir(parents=True, exist_ok=True)
    shapes = write_objects(g, OBJECTS, placed, motion, skins, cast)
    OUT.write_text(json.dumps(data, indent=1))
    cells = sum(len(l["cells"]) // 4 for l in levels)
    records = sum(len(l["records"]) for l in levels)
    objs = sum(len(r["on"]) for l in levels for r in l["records"])
    print(f"cross-check: {checked} cell/record pairs agree, {len(levels)} level times found")
    print(f"{len(levels)} levels, {cells} placed cells, {records} records carrying {objs} objects "
          f"-> {OUT.relative_to(OUT.parent.parent.parent)} ({OUT.stat().st_size/1024:.0f} KB)")
    models = sum(len(v) for v in shapes["types"].values()) + len(shapes["balls"])
    print(f"{len(shapes['types'])} object types and the ball drawn by {models} models, "
          f"{len(motion['types'])} types and {len(motion['kinds'])} kinds of block in motion, "
          f"the skins of {len(skins['sets'])} sets of faces, {len(shapes['shadows'])} shadows "
          f"-> {OBJECTS.relative_to(OUT.parent.parent.parent)} ({OBJECTS.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
