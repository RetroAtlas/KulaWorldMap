#!/usr/bin/env python3
"""Read every level off the disc and write public/map_data.json; every
object's mesh, with how everything moves and what every face wears, and write
public/objects.json; every pack's layout, from which a level is fitted to a
slot without the image, and write public/packs.json; and the sprites the
game's effects draw, and write their sheet to public/tex/sparks.png.

    export KULA_DISC="/path/to/Roll Away.bin"
    python3 tools/kula_build.py

The output is generated and committed, so regenerate it rather than editing it.
"""
import argparse
import json
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import EXE, THEMES, open_disc, packs
from kula_ggi import FILE as GGI, Ggi, jump, shadows, sparks, write_objects
from kula_kwl import executable, figure_failures
from kula_level import Level, SIDE, STYLES, FIRST_RECORD, PLATFORM_KIND
from kula_motion import readings, table
from kula_motion_code import BALL, Code
from kula_pak import Pak
from kula_place import RECOMPRESS, ROOM
from kula_sector import USER, sectors_of
from kula_skins import copycat_worlds, table as skins_table
from png import write_png

OUT = Path(__file__).resolve().parent.parent / "public" / "map_data.json"
OBJECTS = OUT.parent / "objects.json"
PACKS = OUT.parent / "packs.json"
SPARKS = OUT.parent / "tex" / "sparks.png"
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
        "time": L.time,
    }
    shown = shown_as(theme, pack, index)
    if shown:
        out["shown"] = shown
    return out


def packs_json(disc):
    """Where every pack lies and how much room it has, the length of each
    record as stored and as recompressed, and where the free sectors are."""
    lba, size = disc.files[ROOM]
    out = {"room": {"path": ROOM, "lba": lba, "size": size}, "packs": []}
    for _, path in packs(disc):
        pak = Pak(disc.read_file(path), path)
        lba, size = disc.files[path]
        slots = [{"name": e["name"], "size": e["size"],
                  "size9": len(zlib.compress(pak.level(i), RECOMPRESS))}
                 for i, e in enumerate(pak.entries)]
        out["packs"].append({"path": path, "lba": lba, "size": size,
                             "capacity": len(sectors_of(lba, size)) * USER, "slots": slots})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=None, help="raw PS1 image; defaults to $KULA_DISC")
    args = ap.parse_args()
    disc = open_disc(args.disc)
    code = Code(disc.read_file(EXE))
    skins = skins_table(code, {t: disc.read_file(f"/{t}/{t}.TGI") for t in THEMES})
    rooms = copycat_worlds(code)

    read, checked, speeds = [], 0, set()
    problems = figure_failures(executable(code))
    for theme, path in packs(disc):
        pak = Pak(disc.read_file(path), path)
        simon = path == skins["copycat"]
        if simon and len(pak) > len(rooms):
            sys.exit(f"{path} holds {len(pak)} rooms, more than the {len(rooms)} worlds they are played in")
        for i in range(len(pak)):
            world = rooms[i] if simon else theme
            L = Level(pak.level(i), pak.name(i), world)
            for msg in L.verify():
                problems.append(f"{path} {L.name}: {msg}")
            checked += sum(1 for c in L.cells if c[3] >= FIRST_RECORD)
            speeds |= {r.speed for r in L.records if r.kind == PLATFORM_KIND}
            read.append(((THEMES.index(world), simon), level_json(L, world, path, i)))
    levels = [l for _, l in sorted(read, key=lambda e: e[0])]
    themes = []
    for i, l in enumerate(levels):
        if not themes or themes[-1]["id"] != l["theme"]:
            themes.append({"id": l["theme"], "levels": []})
        themes[-1]["levels"].append(i)
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
    r = readings(code)
    motion = table(r, speeds.pop())
    if skins["copycat"] not in {l["pack"] for l in levels}:
        sys.exit(f"the skins name {skins['copycat']}, which is no pack on the disc")
    if ROOM not in disc.files:
        sys.exit(f"the disc has no {ROOM}, so nothing says where a pack can move to")
    layout = packs_json(disc)
    g = Ggi(disc.read_file(GGI))
    cast = shadows(g, r["shadow.sprite"], r["shadow.sprites"])
    arc = jump(g, motion["types"][BALL]["jump"]["skip"])
    side, sheet = sparks(g, r["effect.sprites"])
    burst = {"side": side, "count": r["effect.sprites"]}

    SPARKS.parent.mkdir(parents=True, exist_ok=True)
    write_png(SPARKS, side * burst["count"], side, sheet)
    shapes = write_objects(g, OBJECTS, placed, motion, skins, cast, arc, burst)
    OUT.write_text(json.dumps(data, indent=1))
    PACKS.write_text(json.dumps(layout, indent=1))
    cells = sum(len(l["cells"]) // 4 for l in levels)
    records = sum(len(l["records"]) for l in levels)
    objs = sum(len(r["on"]) for l in levels for r in l["records"])
    print(f"cross-check: {checked} cell/record pairs agree, {len(levels)} level times found")
    print(f"{len(levels)} levels, {cells} placed cells, {records} records carrying {objs} objects "
          f"-> {OUT.relative_to(OUT.parent.parent.parent)} ({OUT.stat().st_size/1024:.0f} KB)")
    models = sum(len(v) for v in shapes["types"].values()) + len(shapes["balls"])
    print(f"{len(shapes['types'])} object types and the ball drawn by {models} models, "
          f"{len(motion['types'])} types and {len(motion['kinds'])} kinds of block in motion, "
          f"the skins of {len(skins['sets'])} sets of faces, {len(shapes['shadows'])} shadows, the jump's "
          f"{len(arc['rows'])} rows and the effects' {burst['count']} sprites "
          f"-> {OBJECTS.relative_to(OUT.parent.parent.parent)} ({OBJECTS.stat().st_size/1024:.0f} KB)")
    print(f"{burst['count']} sprites of {side} a side "
          f"-> {SPARKS.relative_to(OUT.parent.parent.parent)} ({SPARKS.stat().st_size/1024:.0f} KB)")
    held = sum(p["size"] for p in layout["packs"])
    capacity = sum(p["capacity"] for p in layout["packs"])
    print(f"{len(layout['packs'])} packs holding {held:,} bytes in {capacity // USER} sectors of "
          f"{capacity:,} -> {PACKS.relative_to(OUT.parent.parent.parent)} ({PACKS.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
