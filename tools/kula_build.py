#!/usr/bin/env python3
"""Read every level off the disc and write public/map_data.json; every
object's mesh, with how everything moves and what every face wears, and write
public/objects.json; every pack's layout, from which a level is fitted to a
slot without the image, and write public/packs.json; the sprites the
game's effects draw, and write their sheet to public/tex/sparks.png; and for
each release its file under public/releases/, its identity, the rules of its
executable, its packs' layout, the levels of its disc that differ from the US
data, its artwork against the US atlases, the sheets of the textures its
disc draws otherwise, laid under public/tex/<id>/, and the tint of a world it
colours otherwise, and its objects against the US models, the model lists of
the types its mesh file draws otherwise and the jump's arc where that differs.

    export KULA_DISC="/path/to/Roll Away.bin"
    python3 tools/kula_build.py                 # the US data and public/releases/us.json
    python3 tools/kula_build.py --release eu    # public/releases/eu.json and public/tex/eu/, from $KULA_DISC_EU
    python3 tools/kula_build.py --all           # every release whose variable is set, the US first

Another release's run reads its own image and its own executable and nothing
of the US disc, compares its levels slot by slot with the committed US data,
its textures cell by cell with the committed US atlases and its meshes model
by model with the committed US objects, and makes every check the US build
makes on its disc before it writes.

The output is generated and committed, so regenerate it rather than editing it.
"""
import argparse
import json
import os
import sys
import zlib
from collections import namedtuple
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import BASE, DISC_VARS, RELEASE_FILES, RELEASES, THEMES, open_release, packs
from kula_ggi import FILE as GGI, OBJECTS, SPARKS, Ggi, jump, overlay, shadows, sparks, write_objects
from kula_kwl_check import executable, figure_failures
from kula_level import DEFAULT_TIME, Level, SIDE, STYLES, FIRST_RECORD, PLATFORM_KIND
from kula_motion import readings, table
from kula_motion_code import Code, Map
from kula_pak import Pak
from kula_place import RECOMPRESS, ROOM
from kula_release import rules as release_rules
from kula_sector import USER, sectors_of
from kula_skins import copycat_worlds, table as skins_table, tint
from kula_tex import base_atlases, digest, sheet_at, sheets, write_sheets
from png import write_png

OUT = Path(__file__).resolve().parent.parent / "public" / "map_data.json"
PUBLIC = OUT.parent
PACKS = PUBLIC / "packs.json"
WORLD_LEVELS = 15
FINAL_LEVELS = 2
IDENTITY = ("label", "name", "region", "serial", "boot", "sectors")
MESH_READINGS = ("jump.skip", "shadow.sprite", "shadow.sprites", "effect.sprites")

# What a run reads off a disc.
Read = namedtuple("Read", "levels checked speeds untrailed problems")


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


def slot(level):
    """The key a level is known by, its pack's path and its index in it."""
    return f"{level['pack']}#{level['index']}"


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


def layout_of(disc):
    if ROOM not in disc.files:
        sys.exit(f"the disc has no {ROOM}, so nothing says where a pack can move to")
    return packs_json(disc)


def code_of(disc, release):
    """The release's executable, read at the addresses its entry of the release table gives and through its map
    where it has one."""
    return Code.of(release, disc.read_file(RELEASES[release]["exe"]), Map.load(release) if Map.exists(release) else None)


def tgis_of(disc):
    """Each world's artwork off the disc, by world."""
    return {t: disc.read_file(f"/{t}/{t}.TGI") for t in THEMES}


def rules_of(code, release):
    """The release's rules off its executable, or the tool's exit where its pause
    screen does not number the levels as the titles count them."""
    rules = release_rules(code, release)
    pause = {"levels": WORLD_LEVELS, "finals": FINAL_LEVELS, "firstFinal": WORLD_LEVELS * len(THEMES) + 1}
    if rules["pause"] != pause:
        sys.exit(f"the pause screen numbers the levels by {rules['pause']}, not by {pause} as the titles count them")
    return rules


def read_levels(disc, copycat, rooms):
    """Every level of the image, checked, in the worlds' order with each Simon
    room of the pack given in the world it is played in."""
    read, checked, speeds, untrailed, problems = [], 0, set(), [], []
    for theme, path in packs(disc):
        pak = Pak(disc.read_file(path), path)
        simon = path == copycat
        if simon and len(pak) > len(rooms):
            sys.exit(f"{path} holds {len(pak)} rooms, more than the {len(rooms)} worlds they are played in")
        for i in range(len(pak)):
            world = rooms[i] if simon else theme
            L = Level(pak.level(i), pak.name(i), world)
            for msg in L.verify():
                problems.append(f"{path} {L.name}: {msg}")
            checked += sum(1 for c in L.cells if c[3] >= FIRST_RECORD)
            speeds |= {r.speed for r in L.records if r.kind == PLATFORM_KIND}
            if L.trailer is None:
                untrailed.append(L.name)
            read.append(((THEMES.index(world), simon), level_json(L, world, path, i)))
    if len(speeds) != 1:
        problems.append(f"moving platforms run at {sorted(speeds)}, not one speed")
    return Read([l for _, l in sorted(read, key=lambda e: e[0])], checked, speeds, untrailed, problems)


def refuse(problems):
    for p in problems[:20]:
        print(f"  {p}", file=sys.stderr)
    sys.exit(f"{len(problems)} readings do not check out; refusing to write")


def slot_problems(base, levels, paths):
    """Where an image's packs and slots are not the base's: the pack paths, then
    the slots in the base's order, each under the title the pause screen gives it."""
    problems = []
    theirs = {l["pack"] for l in base.values()}
    if set(paths) != theirs:
        problems.append(f"the packs are not the base's: {', '.join(sorted(set(paths) ^ theirs))}")
    if len(levels) != len(base):
        problems.append(f"{len(levels)} slots, not the base's {len(base)}")
    for l, b in zip(levels, base.values()):
        if (slot(l), l.get("shown")) != (slot(b), b.get("shown")):
            problems.append(f"{slot(l)}, {l.get('shown') or l['name']}, stands where the base has "
                            f"{slot(b)}, {b.get('shown') or b['name']}")
            break
    return problems


def variants(base, levels, release):
    """The levels that are not the base's level of their slot, keyed by slot in
    the order given, each naming the release it is read from."""
    return {slot(l): {**l, "release": release} for l in levels if l != base[slot(l)]}


def base_art(tgis):
    """The base's artwork entry: a digest a world of the model table and the quads,
    which say what each texture index means and which another release's sheets are
    held to, and no sheet or tint of its own."""
    return {"quads": {w: digest(blob) for w, blob in tgis.items()}, "sheets": {}, "tint": {}}


def release_art(release, tgis, skins, quads, atlases):
    """Another release's artwork entry against the base's digests, skins and atlases,
    with the pixels of its sheets: its worlds' digests, each of which has to match
    the base's digest for a cell keyed by texture index to mean the same texture; by
    world, in drawing order, the sheets of the cells its disc draws otherwise, as
    paths under public/; and the tint of each world whose stones do not average to
    the base's colour."""
    theirs = {w: digest(blob) for w, blob in tgis.items()}
    apart = [w for w, d in theirs.items() if d != quads.get(w)]
    if apart:
        sys.exit(f"the model table or the quads of {', '.join(apart)} are not the base's table and quads, so a "
                 f"texture index means another texture there and no sheet can be laid over the base's atlas")
    order, pixels = sheets(tgis, atlases)
    laid = {w: [sheet_at(release, name).relative_to(PUBLIC).as_posix() for name in names]
            for w, names in order.items()}
    stones = skins["sets"]["arcade"]["stone"]
    tints = {w: tint(blob, stones, skins["shade"][w]) for w, blob in tgis.items()}
    art = {"quads": theirs, "sheets": laid, "tint": {w: t for w, t in tints.items() if t != skins["tint"][w]}}
    return art, pixels


def mesh_readings(r):
    """The readings of the executable the mesh readers take, which the base's
    file records and another release's models are read and checked with."""
    return {k: r[k] for k in MESH_READINGS}


def base_objects(readings):
    """The base's objects entry: the readings its meshes are read with and no
    model list or arc of its own."""
    return {"readings": readings, "types": {}, "jump": {}}


def release_objects(g, base, readings, sheet=None):
    """Another release's objects entry against the base's models: the readings
    its mesh file is read and checked with, the model lists of the types it
    draws otherwise and the arc where that differs, as `overlay` gives them."""
    return {"readings": readings, **overlay(g, base, readings, sheet)}


def release_json(release, rules, layout, art, objects, levels):
    """The release's file: its identity, the rules of its executable, the layout
    of its packs, its artwork laid against the base's atlases, its objects
    against the base's models and the levels of its disc that differ from the
    base's."""
    entry = RELEASES[release]
    return {"id": release, **{k: entry[k] for k in IDENTITY}, "rules": rules, "packs": layout, "art": art,
            "objects": objects, "levels": levels}


def other_release(disc, release):
    """Another release's file, written against the committed base, with the
    levels read for it and the pixels of its sheets: the Simon rooms' pack and
    the world each room is played in come from the committed data, since no
    executable but the base's is read for them, so a room that is not the
    base's cannot be placed and is refused; the sheets are cut against the
    committed atlases, the tint taken with the committed skins and the models
    held to the committed objects with the readings the base's file records,
    so no disc but the release's own is opened."""
    missing = [p.name for p in (OUT, OBJECTS, SPARKS, RELEASE_FILES[BASE]) if not p.exists()]
    if missing:
        sys.exit(f"no {' or '.join(missing)} to write {release} against; build the base first")
    base = {slot(l): l for l in json.loads(OUT.read_text())["levels"]}
    shapes = json.loads(OBJECTS.read_text())
    skins = shapes["skins"]
    own = json.loads(RELEASE_FILES[BASE].read_text())
    if "art" not in own or "objects" not in own:
        sys.exit(f"{RELEASE_FILES[BASE].name} carries no digest of the base's artwork or readings of its executable "
                 f"to hold {release} to; build the base first")
    copycat = skins["copycat"]
    rooms = [l["theme"] for l in sorted((l for l in base.values() if l["pack"] == copycat), key=lambda l: l["index"])]
    rules = rules_of(code_of(disc, release), release)
    read = read_levels(disc, copycat, rooms)
    problems = read.problems + slot_problems(base, read.levels, [p for _, p in packs(disc)])
    if problems:
        refuse(problems)
    levels = variants(base, read.levels, release)
    rooms_apart = [k for k in levels if k.startswith(f"{copycat}#")]
    if rooms_apart:
        sys.exit(f"{', '.join(rooms_apart)} differ from the base's rooms, which say the world each is played in")
    art, pixels = release_art(release, tgis_of(disc), skins, own["art"]["quads"], base_atlases(THEMES))
    models = release_objects(Ggi(disc.read_file(GGI)), shapes, own["objects"]["readings"])
    return release_json(release, rules, layout_of(disc), art, models, levels), read, pixels


def laid_out(data):
    """The release file's text, a space a level, but for the models of its
    objects entry, each on a line as the base's objects file lays them, so a
    rebuild diffs by model."""
    models = []
    types = {}
    for t, lst in data["objects"]["types"].items():
        types[t] = [f"\0{len(models) + i}\0" for i in range(len(lst))]
        models.extend(lst)
    text = json.dumps({**data, "objects": {**data["objects"], "types": types}}, indent=1)
    for i, m in enumerate(models):
        text = text.replace(json.dumps(f"\0{i}\0"), json.dumps(m, separators=(",", ":")))
    return text


def write_release(release, data):
    path = RELEASE_FILES[release]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(laid_out(data))
    return path


def written(path):
    """A path as the printout names it, with its size."""
    return f"{path.relative_to(OUT.parent.parent.parent)} ({path.stat().st_size/1024:.0f} KB)"


def counted(levels):
    cells = sum(len(l["cells"]) // 4 for l in levels)
    records = sum(len(l["records"]) for l in levels)
    objs = sum(len(r["on"]) for l in levels for r in l["records"])
    return f"{len(levels)} levels, {cells} placed cells, {records} records carrying {objs} objects"


def report(read):
    print(f"cross-check: {read.checked} cell/record pairs agree, {len(read.levels) - len(read.untrailed)} level times found")
    if read.untrailed:
        n = len(read.untrailed)
        print(f"{n} level{'s carry' if n > 1 else ' carries'} no trailer ({', '.join(read.untrailed)}), "
              f"shipped with a time of {DEFAULT_TIME}")


def build_base(disc):
    code = code_of(disc, BASE)
    tgis = tgis_of(disc)
    skins = skins_table(code, tgis)
    read = read_levels(disc, skins["copycat"], copycat_worlds(code))
    problems = figure_failures(executable(code)) + read.problems
    if problems:
        refuse(problems)
    rules = rules_of(code, BASE)
    levels = read.levels
    themes = []
    for i, l in enumerate(levels):
        if not themes or themes[-1]["id"] != l["theme"]:
            themes.append({"id": l["theme"], "levels": []})
        themes[-1]["levels"].append(i)

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
    motion = table(r, next(iter(read.speeds)), rules["hz"])
    if skins["copycat"] not in {l["pack"] for l in levels}:
        sys.exit(f"the skins name {skins['copycat']}, which is no pack on the disc")
    layout = layout_of(disc)
    g = Ggi(disc.read_file(GGI))
    mesh = mesh_readings(r)
    cast = shadows(g, mesh["shadow.sprite"], mesh["shadow.sprites"])
    arc = jump(g, mesh["jump.skip"])
    side, sheet = sparks(g, mesh["effect.sprites"])
    burst = {"side": side, "count": mesh["effect.sprites"]}

    SPARKS.parent.mkdir(parents=True, exist_ok=True)
    write_png(SPARKS, side * burst["count"], side, sheet)
    shapes = write_objects(g, OBJECTS, placed, motion, skins, cast, arc, burst)
    OUT.write_text(json.dumps(data, indent=1))
    PACKS.write_text(json.dumps(layout, indent=1))
    own = write_release(BASE, release_json(BASE, rules, layout, base_art(tgis), base_objects(mesh), {}))
    report(read)
    print(f"{counted(levels)} -> {written(OUT)}")
    models = sum(len(v) for v in shapes["types"].values()) + len(shapes["balls"])
    print(f"{len(shapes['types'])} object types and the ball drawn by {models} models, "
          f"{len(motion['types'])} types and {len(motion['kinds'])} kinds of block in motion, "
          f"the skins of {len(skins['sets'])} sets of faces, {len(shapes['shadows'])} shadows, the jump's "
          f"{len(arc['rows'])} rows and the effects' {burst['count']} sprites -> {written(OBJECTS)}")
    print(f"{burst['count']} sprites of {side} a side -> {written(SPARKS)}")
    held = sum(p["size"] for p in layout["packs"])
    capacity = sum(p["capacity"] for p in layout["packs"])
    print(f"{len(layout['packs'])} packs holding {held:,} bytes in {capacity // USER} sectors of "
          f"{capacity:,} -> {written(PACKS)}")
    print(f"the rules of {RELEASES[BASE]['boot']} beside the layout, a digest of each of the {len(tgis)} worlds' "
          f"model table and quads, the {len(mesh)} readings the meshes are read with and no level differing from "
          f"the base's own -> {written(own)}")


def build_release(disc, release):
    data, read, pixels = other_release(disc, release)
    files = write_sheets(release, pixels)
    path = write_release(release, data)
    report(read)
    print(f"{counted(read.levels)}, {len(data['levels'])} differing from the base's, with the rules of "
          f"{RELEASES[release]['boot']} and the layout of {len(data['packs']['packs'])} packs -> {written(path)}")
    art = data["art"]
    cells = sum(n for *_, n in files.values())
    print(f"{len(files)} sheet{'s' if len(files) != 1 else ''} carrying the {cells} cells the disc draws otherwise, "
          f"laid over {len(art['sheets'])} of {len(THEMES)} worlds, and a tint of its own for "
          f"{', '.join(art['tint']) or 'no world'} -> {', '.join(written(p) for p, *_ in files.values()) or 'nothing'}")
    models = data["objects"]
    kinds = list(models["types"])
    own = f"the models of type{'s' if len(kinds) > 1 else ''} {', '.join(kinds)}" if kinds else "no model"
    arc = f"an arc of {len(models['jump']['rows'])} rows" if models["jump"] else "no arc"
    print(f"{own} and {arc} of its own, the rest the base's")


def main():
    ap = argparse.ArgumentParser()
    which = ap.add_mutually_exclusive_group()
    which.add_argument("--release", choices=list(RELEASES), default=BASE, help="the release whose disc is read")
    which.add_argument("--all", action="store_true", help="every release whose variable is set, the US first")
    ap.add_argument("--disc", default=None, help="raw PS1 image; defaults to the release's own variable")
    args = ap.parse_args()
    if args.all:
        if args.disc:
            sys.exit("--all takes every release's image from its own variable; pass --disc with --release")
        releases = [r for r in RELEASES if os.environ.get(DISC_VARS[r])]
        if not releases:
            sys.exit(f"no disc image: set {', '.join('$' + v for v in DISC_VARS.values())}")
    else:
        releases = [args.release]
    for release in releases:
        disc = open_release(release, args.disc)
        if release == BASE:
            build_base(disc)
        else:
            build_release(disc, release)
        disc.close()


if __name__ == "__main__":
    main()
