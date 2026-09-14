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
from kula_disc import THEMES, open_disc, packs
from kula_level import Level, SIDE, STYLES, FIRST_RECORD
from kula_pak import Pak

OUT = Path(__file__).resolve().parent.parent / "public" / "map_data.json"
WORLD_LEVELS = 15
FINAL_LEVELS = 2


def shown_as(theme, pack, index):
    """The number the game's pause screen gives a level, which is not read
    from the pack: the routine at 0x800478dc computes world * 15 + slot + 1
    for the arcade levels and world * 2 + slot + 151 for The Final."""
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
    t = L.trailer
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
        "camera": {"look": [t.type, t.f[0], t.f[1]], "angle": [t.f[2], t.f[3]], "time": t.f[4]},
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
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1))
    cells = sum(len(l["cells"]) // 4 for l in levels)
    records = sum(len(l["records"]) for l in levels)
    objs = sum(len(r["on"]) for l in levels for r in l["records"])
    print(f"cross-check: {checked} cell/record pairs agree, {len(levels)} camera records found")
    print(f"{len(levels)} levels, {cells} placed cells, {records} records carrying {objs} objects "
          f"-> {OUT.relative_to(OUT.parent.parent.parent)} ({OUT.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
