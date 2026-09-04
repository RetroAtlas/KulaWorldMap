#!/usr/bin/env python3
"""Read every level off the disc and write public/map_data.json.

    export KULA_DISC="/path/to/Roll Away.bin"
    python3 tools/kula_build.py

The output is generated and committed, so regenerate it rather than editing it.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import open_disc, packs
from kula_level import Level, SIDE, STYLES, FIRST_RECORD, START_KIND
from kula_pak import Pak

OUT = Path(__file__).resolve().parent.parent / "public" / "map_data.json"


def level_json(L, theme, pack, index):
    cells = []
    for x, y, z, v in L.cells:
        cells += [x, y, z, v]
    objects = []
    for k, e in enumerate(L.objects):
        o = e.as_dict()
        o["r"] = k
        objects.append(o)
    (x0, x1), (y0, y1), (z0, z1) = L.extent() or ((0, 0), (0, 0), (0, 0))
    start = L.start
    out = {
        "name": L.name,
        "theme": theme,
        "pack": pack,
        "index": index,
        "placed": len(L.cells),
        "header": L.header,
        "records": L.count,
        "min": [x0, y0, z0],
        "max": [x1, y1, z1],
        "cells": cells,
        "objects": objects,
    }
    if L.flag:
        out["flag"] = L.flag
    if start:
        out["start"] = {"at": [start.x, start.y, start.z],
                        "look": [start.type, start.f[0], start.f[1]],
                        "angle": [start.f[2], start.f[3]],
                        "time": start.f[4]}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=None, help="raw PS1 image; defaults to $KULA_DISC")
    args = ap.parse_args()
    disc = open_disc(args.disc)

    levels, themes, checked, problems = [], [], 0, []
    for theme, path in packs(disc):
        pak = Pak(disc.read_file(path), path)
        if not themes or themes[-1]["id"] != theme:
            themes.append({"id": theme, "levels": []})
        for i in range(len(pak)):
            L = Level(pak.level(i), pak.name(i), theme)
            for msg in L.verify():
                problems.append(f"{path} {L.name}: {msg}")
            checked += sum(1 for c in L.cells if c[3] >= FIRST_RECORD)
            themes[-1]["levels"].append(len(levels))
            levels.append(level_json(L, theme, path, i))
    if problems:
        for p in problems[:20]:
            print(f"  {p}", file=sys.stderr)
        sys.exit(f"{len(problems)} levels do not read back consistently; refusing to write")

    data = {
        "game": "Kula World",
        "platform": "PlayStation",
        "release": "Roll Away (NTSC-U, SLUS-00724)",
        "side": SIDE,
        "styles": STYLES,
        "firstRecord": FIRST_RECORD,
        "startKind": START_KIND,
        "themes": themes,
        "levels": levels,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1))
    cells = sum(len(l["cells"]) // 4 for l in levels)
    objs = sum(len(l["objects"]) for l in levels)
    print(f"cross-check: {checked} cell/record pairs agree, {len(levels)} start records found")
    print(f"{len(levels)} levels, {cells} placed cells, {objs} entities "
          f"-> {OUT.relative_to(OUT.parent.parent.parent)} ({OUT.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
