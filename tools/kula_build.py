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
colours otherwise, its objects against the US models, the model lists of the
types its mesh file draws otherwise and the jump's arc where that differs,
and, where the release has a map under maps/ with nothing pending, what its
executable's motion and skins tables change from the US tables.

    export KULA_DISC="/path/to/Roll Away.bin"
    python3 tools/kula_build.py                 # the US data and public/releases/us.json
    python3 tools/kula_build.py --release eu    # public/releases/eu.json and public/tex/eu/, from $KULA_DISC_EU
    python3 tools/kula_build.py --all           # every release whose variable is set, the US first

Another release's run reads its own image and its own executable and nothing
of the US disc, compares its levels slot by slot with the committed US data,
its textures cell by cell with the committed US atlases, its meshes model by
model with the committed US objects and, where it has a map, its executable's
tables key by key with the committed US tables, and makes every check the US
build makes on its disc before it writes.

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
from kula_map import check_base
from kula_motion import readings, table
from kula_motion_code import MAPS, Code, Map
from kula_pak import Pak
from kula_place import RECOMPRESS, ROOM
from kula_release import rules as release_rules
from kula_score import HOURGLASS
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
NESTED = ("types", "kinds")
ARTWORK = ("textures", "shade", "turn", "light")

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


def map_of(release):
    """The release's map where it has one with nothing pending, else None, the printout saying where a map is left
    aside for the rows it has pending, since no table is shipped through an unfinished map."""
    if not Map.exists(release):
        return None
    left = Map.pending(release)
    if left:
        print(f"the {release} map has {len(left)} pending row{'s' if len(left) != 1 else ''}, so its tables and the "
              f"readings its meshes are read with are the base's and the Simon rooms are the committed ones")
        return None
    return Map.load(release)


def code_of(disc, release):
    """The release's executable, read at the addresses its entry of the release table gives and through its map
    where it has one with nothing pending."""
    return Code.of(release, disc.read_file(RELEASES[release]["exe"]), map_of(release))


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
    """The readings of the executable the mesh readers take, which a release's
    file records and its models are read and checked with, one the executable
    has no instruction for None."""
    return {k: r.get(k) for k in MESH_READINGS}


def base_objects(readings):
    """The base's objects entry: the readings its meshes are read with and no
    model list, arc, motion or skins of its own."""
    return {"readings": readings, "types": {}, "jump": {}, "motion": {}, "skins": {}}


def release_objects(g, base, readings, sheet=None, motion=None, skins=None):
    """Another release's objects entry against the base's models and tables:
    the readings its mesh file is read and checked with, the model lists of
    the types it draws otherwise and the arc where that differs, as `overlay`
    gives them, and what its executable's motion and skins tables change, as
    the overlays below give them, nothing where that executable is not read."""
    return {"readings": readings, **overlay(g, base, readings, sheet), "motion": motion or {}, "skins": skins or {}}


def table_overlay(theirs, base, nested=()):
    """What a release's table changes from the base's: every key whose value is
    not the base's, whole, but for the keys in `nested`, whose entries are
    written one level down, an entry whole where any value in it differs; the
    tool's exit where the table lacks a key or an entry of the base's, which
    an overlay cannot say."""
    apart = sorted(set(theirs) ^ set(base))
    if apart:
        sys.exit(f"the table's keys are not the base's: {', '.join(apart)}")
    out = {}
    for key, value in theirs.items():
        if key in nested:
            gone = [e for e in base[key] if e not in value]
            if gone:
                sys.exit(f"the table's {key} lack {', '.join(gone)}, which the base's hold")
            entries = {e: v for e, v in value.items() if v != base[key].get(e)}
            if entries:
                out[key] = entries
        elif value != base[key]:
            out[key] = value
    return out


def motion_overlay(motion, base):
    """What a release's motion table changes from the base's, its types and
    kinds one level down."""
    return table_overlay(motion, base, NESTED)


def skins_overlay(skins, base, tinted=()):
    """What a release's skins change from the base's, by key, the tint left to
    the artwork entry, which carries a world's own where the disc colours it
    otherwise; the tool's exit where a key the artwork gives rather than the
    executable, the textures' count, the shades, the turns or the lights, is
    not the base's, or a world's tint is and `tinted` does not name the world."""
    out = table_overlay(skins, base)
    given = [k for k in ARTWORK if k in out]
    if given:
        sys.exit(f"the skins' {', '.join(given)} are not the base's, though the artwork gives them")
    worlds = [w for w, t in out.pop("tint", {}).items() if t != base["tint"].get(w) and w not in tinted]
    if worlds:
        sys.exit(f"the skins tint {', '.join(worlds)} otherwise than the base's, where the artwork entry names no tint")
    return out


def hold_to_rules(motion, rules):
    """The motion table held to the rules where the two readers read the same
    instructions: the frames of a second, the clock's ticks a second and the
    hourglass's count, its seconds and its points, a null agreeing with a null."""
    take = motion["types"][str(HOURGLASS)]["take"]
    read = (("frames a second", motion["hz"], rules["hz"]),
            ("the clock's ticks a second", motion["play"]["clock"]["second"], rules["clock"]["fill"]),
            ("the hourglass's count", take["clock"]["from"], rules["hourglass"]["from"]),
            ("the hourglass's seconds", take["clock"]["second"], rules["hourglass"]["second"]),
            ("the hourglass's points", take["points"], rules["hourglass"]["points"]))
    for what, theirs, ours in read:
        if theirs != ours:
            sys.exit(f"the motion table reads {what} as {json.dumps(theirs)}, where the rules read {json.dumps(ours)}")


def rooms_of(code, base, copycat):
    """The world each room of the Simon pack is played in, by its number: off
    the release's own executable where it is read, held to the committed
    base's rooms, else the base's, which the base's executable alone says."""
    rooms = [l["theme"] for l in sorted((l for l in base.values() if l["pack"] == copycat), key=lambda l: l["index"])]
    if code.map is None:
        return rooms
    worlds = copycat_worlds(code)
    if worlds[:len(rooms)] != rooms:
        sys.exit(f"the rooms step through {', '.join(worlds)} on this disc, where the base's are played in {', '.join(rooms)}")
    return worlds


def release_json(release, rules, layout, art, objects, levels):
    """The release's file: its identity, the rules of its executable, the layout
    of its packs, its artwork laid against the base's atlases, its objects
    against the base's models and tables and the levels of its disc that differ
    from the base's."""
    entry = RELEASES[release]
    return {"id": release, **{k: entry[k] for k in IDENTITY}, "rules": rules, "packs": layout, "art": art,
            "objects": objects, "levels": levels}


def other_release(disc, release):
    """Another release's file, written against the committed base, with the
    levels read for it and the pixels of its sheets: the sheets are cut against
    the committed atlases, the tint taken with the committed skins and the
    models and the tables held to the committed objects, so no disc but the
    release's own is opened. Its executable is read through its map where it
    has one with nothing pending, for its tables, the readings its meshes are
    read with and the Simon rooms' pack and the world each room is played in,
    held to the committed rooms; without a map the committed data says both
    and the base's file the readings, since no executable but the base's is
    read, so a room that is not the base's cannot be placed and is refused,
    and the tables are the base's."""
    missing = [p.name for p in (OUT, OBJECTS, SPARKS, RELEASE_FILES[BASE]) if not p.exists()]
    if missing:
        sys.exit(f"no {' or '.join(missing)} to write {release} against; build the base first")
    base = {slot(l): l for l in json.loads(OUT.read_text())["levels"]}
    shapes = json.loads(OBJECTS.read_text())
    own = json.loads(RELEASE_FILES[BASE].read_text())
    if "art" not in own or "objects" not in own:
        sys.exit(f"{RELEASE_FILES[BASE].name} carries no digest of the base's artwork or readings of its executable "
                 f"to hold {release} to; build the base first")
    code = code_of(disc, release)
    rules = rules_of(code, release)
    tgis = tgis_of(disc)
    skins = skins_table(code, tgis) if code.map is not None else shapes["skins"]
    copycat = skins["copycat"]
    read = read_levels(disc, copycat, rooms_of(code, base, copycat))
    problems = read.problems + slot_problems(base, read.levels, [p for _, p in packs(disc)])
    if problems:
        refuse(problems)
    levels = variants(base, read.levels, release)
    rooms_apart = [k for k in levels if k.startswith(f"{copycat}#")]
    if rooms_apart and code.map is None:
        sys.exit(f"{', '.join(rooms_apart)} differ from the base's rooms, which say the world each is played in")
    art, pixels = release_art(release, tgis, shapes["skins"], own["art"]["quads"], base_atlases(THEMES))
    mesh, motion, faces = own["objects"]["readings"], {}, {}
    if code.map is not None:
        r = readings(code)
        theirs = table(r, next(iter(read.speeds)), rules["hz"])
        hold_to_rules(theirs, rules)
        mesh = mesh_readings(r)
        motion, faces = motion_overlay(theirs, shapes["motion"]), skins_overlay(skins, shapes["skins"], art["tint"])
    models = release_objects(Ggi(disc.read_file(GGI)), shapes, mesh, motion=motion, skins=faces)
    return release_json(release, rules, layout_of(disc), art, models, levels), read, pixels


def laid_out(data):
    """The release file's text, a space a level, but for the models of its
    objects entry, each on a line as the base's objects file lays them, and
    the keys of its motion and skins, a type's or a kind's entry and any other
    key on a line of its own the same way, so a rebuild diffs by model or by
    entry."""
    held = []

    def hold(value):
        held.append(value)
        return f"\0{len(held) - 1}\0"

    objects = data["objects"]
    types = {t: [hold(m) for m in lst] for t, lst in objects["types"].items()}
    motion = {k: {e: hold(x) for e, x in v.items()} if k in NESTED else hold(v) for k, v in objects["motion"].items()}
    skins = {k: hold(v) for k, v in objects["skins"].items()}
    text = json.dumps({**data, "objects": {**objects, "types": types, "motion": motion, "skins": skins}}, indent=1)
    for i, value in enumerate(held):
        text = text.replace(json.dumps(f"\0{i}\0"), json.dumps(value, separators=(",", ":")))
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
    hold_to_rules(motion, rules)
    for path in sorted(MAPS.glob("*.json")):
        check_base(code, path)
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
    shapes = json.loads(OBJECTS.read_text())
    motion, skins = models["motion"], models["skins"]
    within = " and ".join(f"{len(motion.get(k, {}))} of {len(shapes['motion'][k])} {k}" for k in NESTED)
    print(f"{own} and {arc} of its own, {len(motion)} of the motion table's {len(shapes['motion'])} keys, "
          f"{within} among them, and {len(skins)} of the skins' {len(shapes['skins'])}, the rest the base's")


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
