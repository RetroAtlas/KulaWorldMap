#!/usr/bin/env python3
"""A level as the game loads it, written from its fields and read back into them.

    python3 tools/kula_kwl.py --template /HIRO/HIRO.PAK#0           # a shipped level as a project
    python3 tools/kula_kwl.py --from-json spiral.kula.json --kwl spiral.kwl
    python3 tools/kula_kwl.py --from-kwl spiral.kwl --json [--world HIRO]
    python3 tools/kula_kwl.py --digests                              # tests/fixtures/kwl-digests.json
    python3 tools/kula_kwl.py --deflate-vectors                      # tests/fixtures/deflate-vectors.json
    python3 tools/kula_kwl.py --hostile                              # tests/fixtures/hostile-projects.json
    python3 tools/kula_kwl.py --check [--release eu]                 # every disc level, needs $KULA_DISC or the release's variable

A project is the editor's file: the game's own structure spelled in JSON, a
block per placed cell with what stands on each face, a span's far end, a
vanishing block's phase and the four colours' starting states. Everything the
game derives or never reads, the links, the pickup numbers, the record order,
the lattice values and the filler words, is left out and rebuilt here.

`canonical` writes the one level file a project means, `read_kwl` reads any
file the game would load and repairs what the lattice contradicts, `validate`
says what the game would make of a project, and `--check` holds the rebuild to
the disc word for word outside the words the game never reads.
"""
import argparse
import base64
import hashlib
import json
import re
import struct
import sys
import zlib
from collections import Counter
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import RELEASES, THEMES, file_at, open_disc, open_release, output_at, release_of
from kula_level import (
    BLOCK_KINDS,
    CELLS,
    DEFAULT_TIME,
    EMPTY,
    FACES,
    FIRST_RECORD,
    GRID_BYTES,
    HEAD,
    LASER_KIND,
    LINK_WORD,
    NEXT_WORD,
    OWN,
    PLATFORM_KIND,
    RECORD,
    SIDE,
    SLOT,
    SWITCH,
    TELEPORTER,
    TRAILER_KIND,
    UNPLACED_KIND,
    WORDS,
    Level,
    Record,
    link,
)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "map_data.json"
OBJECTS = ROOT / "public" / "objects.json"
NAMES = ROOT / "public" / "annotations.json"
DIGESTS = ROOT / "tests" / "fixtures" / "kwl-digests.json"
VECTORS = ROOT / "tests" / "fixtures" / "deflate-vectors.json"
HOSTILE = ROOT / "tests" / "fixtures" / "hostile-projects.json"

FORMAT = "kula-world-level"
VERSION = 1
WORLDS = THEMES
WORLD_SLOTS = 20
FINAL_SLOTS = 2
COPYCAT_SLOTS = 10
COPYCAT_PACK = "/HIRO/COPYCAT.PAK"   # the pack whose levels the game plays as Simon rooms
TITLE_MOST = 80      # the most characters a reader keeps of a title
TEXT_MOST = 2000     # and of any other text

CRUMBLING_KIND = 6
VANISHING_KIND = 7
SPAN_KINDS = frozenset({PLATFORM_KIND, LASER_KIND})
COLOURS = 4
DEFAULT_SPEED = 30
DEFAULT_LENGTH = 2
LENGTHS = range(2, 4)
PHASES = range(0, 4)
DIM_AT_ONCE = (4, 5)
FIXED = 512          # the fixed-point unit a cell is scaled by in a record
PLATFORM_UNIT = 256  # the three words after a platform's position
INNER = range(1, SIDE - 1)
LATTICE = range(SIDE)
WORD = range(-(2 ** 15), 2 ** 15)
LINK_RECORDS = WORD.stop // 16   # the records a link word can name
SAFE = 2 ** 53 - 1   # the whole numbers a double holds exactly

# The six directions as the game numbers them, which is also the face order.
DIRECTIONS = ((0, 0, -1), (1, 0, 0), (0, 1, 0), (0, -1, 0), (-1, 0, 0), (0, 0, 1))
AXIS_WORD = (1, 2, 5)    # a span's axis, named by the direction of its positive way

START = 30
START_ON_CLOCK = 29
EXIT = 7
MOVING_SPIKES = 11
HIDDEN_EXIT = 26
KEY = 31
HEDGEHOG = 42
FRUIT = range(43, 48)
CAPTIVATORS = range(50, 57)
# f2 is a heading on these; a wandering ball or a corkscrew with 0 there heads as 1.
# What the bonus artwork, drawn for a level with no key, has no picture for.
BONUS_UNDRAWN_KINDS = (1, 2, 4, PLATFORM_KIND)
BONUS_UNDRAWN_TYPES = (1, 2, 4, EXIT, 8, START_ON_CLOCK, *FRUIT)
FACING_TYPES = frozenset({TELEPORTER, 28, START_ON_CLOCK, START, 50, 51, 52, 53, 56})
FACING_NEEDED = frozenset({TELEPORTER, 28, START_ON_CLOCK, START, 50, 51, 52})
VARIANT_TYPES = frozenset({TELEPORTER, SWITCH, 11, 36, 37, 56})
VARIANTS = {TELEPORTER: range(COLOURS), SWITCH: range(COLOURS), 11: PHASES, 36: range(3), 37: range(3), 56: PHASES}
PICKUPS = (31, 32, 33, 34, 35, 36, 37, 38, 42, 43, 44, 45, 46, 47)
PLAIN_ONLY = frozenset({TELEPORTER, EXIT, SWITCH, MOVING_SPIKES})   # initialised on kind 0 alone
LIGHTS = frozenset({TELEPORTER, EXIT, SWITCH})                         # what casts a light when on
NUMBERED = frozenset({5, 7, 9, 10, 11, 12, 26, 28} | set(PICKUPS))      # what the loader numbers
PLAYED = frozenset({1, 2, 4, 5, 7, 8, 9, 10, 11, 12, 26, 28, 29, 30, 50, 51, 52, 53, 56} | set(PICKUPS))
# f4 by type; a teleporter or a switch takes its colour's state instead.
STATE_ON, STATE_OFF = 1, 2
STATE = {t: STATE_ON for t in (10, 11, 12, 28, *PICKUPS)}
STATE.update({EXIT: STATE_OFF, HIDDEN_EXIT: STATE_OFF})
# f9, f10 and f14 by type, the words the disc holds for it.
TRIO = {TELEPORTER: (256, 1, 30), EXIT: (500, 1, 30), HIDDEN_EXIT: (500, 1, 30), 10: (256, 3, 0),
        START_ON_CLOCK: (386, 1, -100), 36: (386, 1, -17), HEDGEHOG: (416, 0, 100)}
TRIO.update({t: (256, 0, 0) for t in (8, SWITCH, 11, 12, 28, START)})
TRIO.update({t: (386, 1, -100) for t in (KEY, 37, 38)})
TRIO.update({t: (386, 2, 100) for t in (32, 33, 34, 35)})
TRIO.update({t: (386, 1, 100) for t in FRUIT})
NO_TRIO = (-1, -1, -1)

BARE = [-1, 0, -1, -1, 0, -1, -1, -1, 0] + [-1] * 7   # a face with nothing on it
UNSET = [-1] * SLOT                                      # a slot of a kind that has no faces
NEVER_SET = [-1] * (WORDS - SLOT * FACES - 3)
FRAME_WORD = 8          # f8, the draw command's frame, 0 on every object
SETTINGS_CELL = (0, 0, 0)

# What the game's memory holds room for, and the most the disc asks of it.
CAPS = {"records": 123, "faces": 768, "blocks": 256, "objects": 255, "platforms": 8,
        "vanishing": 64, "crumbling": 64, "captivators": 32, "lights": 32, "spikes": 64}
LENGTH_CAP = 7       # the longest run the ride's grid holds a platform of
DISC_MAX = {"records": 75, "cells": 178, "faces": 766, "blocks": 178, "objects": 81, "platforms": 4,
            "lasers": 12, "vanishing": 14, "crumbling": 33, "captivators": 12, "keys": 4, "lights": 19, "spikes": 19}
COUNTED_KINDS = frozenset({0, 1, 2, 4, CRUMBLING_KIND, VANISHING_KIND})

ERROR, WARNING = "error", "warning"
TIME_MAX = 99


def lattice_index(cell):
    x, y, z = cell
    return (x * SIDE + y) * SIDE + z


def cell_text(cell):
    return ",".join(_js_text(c) for c in cell) if isinstance(cell, (list, tuple)) else _js_text(cell)


def is_cell(v):
    return isinstance(v, (list, tuple)) and len(v) == 3 and all(_whole(c) for c in v)


def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _integer(v):
    """Whether a JSON value is a number with no fraction, as the page's Number.isInteger reads one."""
    return _is_int(v) or (isinstance(v, float) and v.is_integer())


def _whole(v):
    """Whether a JSON value is a whole number as the page reads one: within the
    integers a double holds exactly, spelled with or without a point."""
    return _integer(v) and abs(v) <= SAFE


def _int(v):
    return int(v) if isinstance(v, float) else v


def _js_number(v):
    """A number as the page's JSON prints it: digits from 1e-6 below 1e21, a power
    of ten beyond, and null where a double overflows."""
    if _is_int(v) and abs(v) <= SAFE:
        return str(v)
    try:
        f = float(v)
    except OverflowError:
        return "null"
    if f != f or f in (float("inf"), float("-inf")):
        return "null"
    if f == 0:
        return "0"
    if 1e-6 <= abs(f) < 1e21:
        return format(Decimal(repr(f)).normalize(), "f")
    return re.sub(r"e([+-])0+(?=[0-9])", r"e\1", repr(f))


def _whole_cells(b):
    """A block with its cell and far end as ints where JSON spelled a whole number with a point."""
    out = dict(b)
    for key in ("cell", "far"):
        if is_cell(b.get(key)):
            out[key] = [_int(c) for c in b[key]]
    return out


def _show(v):
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return _js_number(v)
    return json.dumps(v, ensure_ascii=False, separators=(",", ":"))


def _js_text(v):
    """A value as the page prints it in a sentence."""
    if isinstance(v, str):
        return v
    if isinstance(v, bool):
        return "true" if v else "false"
    if v is None:
        return "null"
    if isinstance(v, float) and (v != v or v in (float("inf"), float("-inf"))):
        return "NaN" if v != v else ("Infinity" if v > 0 else "-Infinity")
    if isinstance(v, (int, float)):
        return _js_number(v)
    if isinstance(v, list):
        return ",".join(_js_text(x) for x in v)
    return "[object Object]"


def _as_page(v):
    """A parsed document with every whole number an int, as the page's JSON holds one."""
    if isinstance(v, float) and _whole(v):
        return int(v)
    if isinstance(v, dict):
        return {k: _as_page(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_as_page(x) for x in v]
    return v


def _truthy(v):
    """Whether the page's `if` takes a JSON value: anything but null, false, 0, NaN and the empty string."""
    if v is None or v is False or v == "":
        return False
    return not (isinstance(v, (int, float)) and not isinstance(v, bool) and (v == 0 or v != v))


INDEX_KEY = re.compile(r"0|[1-9][0-9]*")
INDEX_MOST = 2 ** 32 - 1


def _is_index(k):
    """Whether a key spells an array index, which the page walks before the other keys."""
    return bool(INDEX_KEY.fullmatch(k)) and len(k) <= len(str(INDEX_MOST)) and int(k) < INDEX_MOST


def _entries(d):
    """A JSON object's entries in the order the page walks them: keys that spell
    an array index ascending, then the rest as written."""
    keys = [str(k) for k in d]
    index = sorted((k for k in keys if _is_index(k)), key=int)
    rest = [k for k in keys if not _is_index(k)]
    at = {str(k): v for k, v in d.items()}
    return [(k, at[k]) for k in index + rest]


def _entries_of(v):
    """A JSON value's entries as the page's Object.entries walks them: a table's
    entries, a list's or a text's entries by index, else none."""
    if isinstance(v, dict):
        return _entries(v)
    if isinstance(v, (list, str)):
        return [(str(i), x) for i, x in enumerate(v)]
    return []


def _property(v, key):
    """The page's `v[key]` on a JSON value: a table's entry, a list's or a text's
    element by index, else none."""
    if isinstance(v, dict):
        return v.get(key)
    if isinstance(v, (list, str)) and _is_index(key) and int(key) < len(v):
        return v[int(key)]
    return None


def direction(a, b):
    """The game's direction from a to b where they differ on one axis, else None."""
    diff = [(i, b[i] - a[i]) for i in range(3) if b[i] != a[i]]
    if len(diff) != 1:
        return None
    axis, d = diff[0]
    step = [0, 0, 0]
    step[axis] = 1 if d > 0 else -1
    return DIRECTIONS.index(tuple(step))


def span_axis(a, b):
    d = direction(a, b)
    return None if d is None else [i for i in range(3) if DIRECTIONS[d][i]][0]


def room_for(cell, far):
    """The blocks the lattice holds from a span's upper end to its edge, or None
    where the span runs along no one axis."""
    axis = span_axis(cell, far)
    return None if axis is None else SIDE - max(cell[axis], far[axis])


def inner_room_for(cell, far):
    """The run's room from a span's upper end to the last cell the game builds, None along no one axis."""
    axis = span_axis(cell, far)
    return None if axis is None else INNER.stop - max(cell[axis], far[axis])


def held_length(length, room):
    """A platform's length held to its run's room: 1 below one block or with no room, else the most it holds."""
    return max(1, min(length, room))


def level_key(pack, index):
    return f"{pack}#{index}"


# --- a project out of a level -------------------------------------------------

KEEP = 3


def _shape_of(line):
    return re.sub(r"-?[0-9]+", "#", line)


def collapse(lines):
    """A report with lines of one shape, the same words with other numbers, kept to
    the first few and the rest counted in one line after them."""
    shapes = [_shape_of(line) for line in lines]
    total = Counter(shapes)
    seen = Counter()
    out = []
    for line, shape in zip(lines, shapes):
        seen[shape] += 1
        if seen[shape] <= KEEP:
            out.append(line)
        rest = total[shape] - KEEP
        if seen[shape] == KEEP and rest > 0:
            out.append(f"{rest} more line{'' if rest == 1 else 's'} like the one above")
    return out

# The line both readers give a facing of 0 on a type that needs one: the game heads as 1.
HEADS_AS_ONE = "which the game heads as 1; it is 1"
SPELLED = ("one", "two", "three", "four", "five", "six")


def spelled(n):
    """A small count as a word, as the readers' lines spell the size of a range."""
    return SPELLED[n - 1] if 0 < n <= len(SPELLED) else str(n)


def _face_of(o, cell, report):
    """One object of a map_data record as the project writes it."""
    t = o["type"]
    f2, f3 = o["f"][0], o["f"][1]
    at = f"type {t} on face {o['face']} of the block at {cell_text(cell)}"
    out = {"type": t}
    if t in FACING_TYPES and f2 != 0:
        out["facing"] = f2
    elif t in FACING_NEEDED:
        report.append(f"{at} has a facing of 0, {HEADS_AS_ONE}")
        out["facing"] = 1
    if t in VARIANT_TYPES:
        if f3 in VARIANTS[t]:
            out["variant"] = f3
        else:
            report.append(f"{at} has a variant of {f3}, which is not one of the {spelled(len(VARIANTS[t]))}; it is 0")
            out["variant"] = 0
    return out


def _in_colour(c):
    return c if c in range(COLOURS) else 0


def _colour_of(r, cell, report):
    if r["colour"] in range(COLOURS):
        return r["colour"]
    report.append(f"the laser at {cell_text(cell)} has a colour of {r['colour']}, which is not one of the {spelled(COLOURS)}; it is 0")
    return 0


def _span(r, cell):
    a, b = tuple(r["f"][2:5]), tuple(r["f"][5:8])
    return b if a == cell else a


def project_of(level, report=None):
    """The project a map_data-shaped level means; `report`, a list, takes a
    line for each thing the project leaves behind."""
    report = [] if report is None else report
    records = level["records"]
    cells = level["cells"]
    blocks, folded = [], 0
    for i in range(0, len(cells), 4):
        x, y, z, v = cells[i:i + 4]
        cell = (x, y, z)
        if v < FIRST_RECORD:
            blocks.append({"cell": list(cell), "kind": v})
            continue
        r = records[v - FIRST_RECORD]
        b = {"cell": list(cell), "kind": r["kind"]}
        if r["kind"] < BLOCK_KINDS:
            faces = {str(o["face"]): _face_of(o, cell, report) for o in sorted(r["on"], key=lambda o: o["face"])}
            if faces:
                b["faces"] = faces
            else:
                folded += 1
        elif r["kind"] == PLATFORM_KIND:
            b["far"] = list(_span(r, cell))
            b["length"] = r["length"]
            b["speed"] = r.get("speed", DEFAULT_SPEED)
        elif r["kind"] == LASER_KIND:
            b["far"] = list(_span(r, cell))
            b["colour"] = _colour_of(r, cell, report)
        elif r["kind"] == VANISHING_KIND:
            b["phase"] = r["f"][0]
        blocks.append(b)
    if folded:
        report.append(f"folded {folded} records carrying nothing into plain blocks")

    hidden = flip = False
    for r in records:
        if r["kind"] == UNPLACED_KIND:
            hidden |= r["type"] == 1
            flip |= r["f"][0] == 1

    states, disagree = {}, set()
    for r in records:
        if r["kind"] == LASER_KIND:
            found = [(_in_colour(r["colour"]), STATE_ON if r["f"][1] == 1 else STATE_OFF)]
        elif r["kind"] < BLOCK_KINDS:
            found = [(_in_colour(o["f"][1]), STATE_OFF if o["f"][2] == STATE_OFF else STATE_ON)
                     for o in r["on"] if o["type"] in (TELEPORTER, SWITCH)]
        else:
            continue
        for colour, state in found:
            if states.setdefault(colour, state) != state:
                disagree.add(colour)
    for colour in sorted(disagree):
        report.append(f"colour {colour} starts on for some of its devices and off for others; "
                      f"the first decides")

    project = {
        "format": FORMAT,
        "version": VERSION,
        "title": level.get("shown") or level.get("name", ""),
        "author": "",
        "notes": "",
        "world": level["theme"],
    }
    if "pack" in level:
        project["from"] = level_key(level["pack"], level["index"])
        if "release" in level:
            project["fromRelease"] = level["release"]
    project.update({
        "time": level["time"],
        "hidden": hidden,
        "invisibleFromAfar": flip,
        "simon": level.get("pack") == COPYCAT_PACK,
        "circuits": {str(c): "off" for c in sorted(states) if states[c] == STATE_OFF},
        "blocks": sorted(blocks, key=lambda b: tuple(b["cell"])),
    })
    return project


def _level_dict(cells, records, time, world, name, report):
    """The map_data shape of parsed records, with a platform's speed kept and
    what stands on the kinds the game never walks counted."""
    flat = []
    for x, y, z, v in cells:
        flat += [x, y, z, v]
    out, unplayed = [], 0
    for r in records:
        d = r.as_dict()
        if r.kind == PLATFORM_KIND:
            d["speed"] = r.speed
        if r.kind >= BLOCK_KINDS:
            first = 2 if r.kind in SPAN_KINDS else 1
            unplayed += sum(1 for s in r.slots[first:] if s[1] > 0)
        out.append(d)
    if unplayed:
        report.append(f"left out {unplayed} objects standing on records the game never walks")
    return {"name": name, "theme": world, "cells": flat, "records": out, "time": time}


def project_of_level(L, world=None, report=None, **meta):
    """The project a parsed level means, every word of the file in hand; `meta`
    lays a shipped level's `shown`, `pack` and `index` over it."""
    report = [] if report is None else report
    level = _level_dict(L.cells, L.records, L.time, world or L.theme or WORLDS[0], L.name, report)
    level.update({k: v for k, v in meta.items() if v is not None})
    return project_of(level, report)


# --- the game's bytes out of a project ---------------------------------------

FACE_KEY = re.compile(r"-?[0-9]+")


def _face_number(f):
    """A face key as the face it names: a number, or an ASCII integer string."""
    if _is_int(f):
        return f
    return int(f) if isinstance(f, str) and FACE_KEY.fullmatch(f) else f


def _standing(o):
    t = o.get("type", 0) if isinstance(o, dict) else 0
    return isinstance(t, (int, float)) and not isinstance(t, bool) and t > 0


def _faceless(b):
    """Whether a block's kind carries nothing on its faces."""
    return isinstance(b, dict) and _integer(b.get("kind")) and b["kind"] >= BLOCK_KINDS


def _occupied(b):
    """The entries of a block's faces with something standing on them, on a kind
    that carries any."""
    if not isinstance(b, dict) or _faceless(b):
        return []
    return [(f, o) for f, o in _entries_of(b.get("faces")) if _standing(o)]


def _faces_of(b):
    """What stands on a block's faces, by face number, for a kind that carries any."""
    return {_face_number(f): o for f, o in _occupied(b) if _is_int(_face_number(f))}


def _stray_face_keys(b):
    """The keys of a block's faces that name no face by number, with something standing on them."""
    return [f for f, _ in _occupied(b) if not _is_int(_face_number(f))]


def _named_twice(b):
    """The face two keys of a block's faces spell between them, or None."""
    seen = set()
    for f, _ in _occupied(b):
        j = _face_number(f)
        if j in seen:
            return j
        seen.add(j)
    return None


def _carries(b):
    """Whether a block needs a record: a span, a payload kind, or a face with something on it."""
    return _faceless(b) or bool(_faces_of(b))


def _members(carried):
    """Each colour's switches, teleporters and lasers as (record, face), a laser on face 6."""
    members = {c: [] for c in range(COLOURS)}
    for k, b in enumerate(carried):
        found = [(b.get("colour"), OWN)] if b["kind"] == LASER_KIND else \
            [(o.get("variant", 0), j) for j, o in _faces_of(b).items() if o["type"] in (TELEPORTER, SWITCH)]
        for colour, face in found:
            if colour not in members:
                raise ValueError(f"colour {colour} is not one of the four")
            members[colour].append((k, face))
    return members


def _type_at(carried, m):
    return LASER_KIND if m[1] == OWN else _faces_of(carried[m[0]])[m[1]]["type"]


def _links(carried):
    """(record, face) -> [next, link] for every switch, teleporter and laser."""
    out = {}
    for M in _members(carried).values():
        M.sort()
        for i, m in enumerate(M):
            out[m] = [-1 if i == 0 else M[i - 1][0] * 16 + M[i - 1][1], -1]
        if not M:
            continue
        last = M[-1][0] * 16 + M[-1][1]
        T = [m for m in M if _type_at(carried, m) == TELEPORTER]
        for i, t in enumerate(T):
            back = T[(i - 1) % len(T)]
            out[t][1] = back[0] * 16 + back[1]
        for m in M:
            if _type_at(carried, m) == SWITCH:
                out[m][1] = last
    return out


def _numbers(carried):
    """(record, face) -> the pickup's number, in record then face order."""
    out, n = {}, 0
    for k, b in enumerate(carried):
        for j, o in sorted(_faces_of(b).items()):
            if o["type"] in PICKUPS:
                out[(k, j)] = n
                n += 1
    return out


def _object_slot(kind_word, o, state, number, links):
    t = o["type"]
    facing = o.get("facing", 0) if t in FACING_TYPES else 0
    variant = o.get("variant", 0) if t in VARIANT_TYPES else 0
    f9, f10, f14 = TRIO.get(t, NO_TRIO)
    nxt, lnk = links
    return [kind_word, t, facing, variant, state, number, nxt, lnk, 0, f9, f10, -1, -1, -1, f14, -1]


def _span_words(cell, far):
    lower, upper = sorted((cell, far))
    d = direction(cell, far)
    if d is None:
        raise ValueError(f"the span from {cell_text(cell)} to {cell_text(far)} runs along no one axis")
    return d, AXIS_WORD[span_axis(cell, far)], lower, upper


def _record(b, k, states, links, numbers):
    cell = tuple(b["cell"])
    kind = b["kind"]
    slots = [list(BARE if kind < BLOCK_KINDS else UNSET) for _ in range(FACES)]
    slots[0][0] = kind
    extras = list(NEVER_SET)
    if kind < BLOCK_KINDS:
        for j, o in _faces_of(b).items():
            t = o["type"]
            state = states[o.get("variant", 0)] if t in (TELEPORTER, SWITCH) else STATE.get(t, 0)
            slots[j] = _object_slot(kind if j == 0 else -1, o, state,
                                    numbers.get((k, j), -1), links.get((k, j), (-1, -1)))
    elif kind == PLATFORM_KIND:
        far = tuple(b["far"])
        d, axis, lower, upper = _span_words(cell, far)
        length = b.get("length", DEFAULT_LENGTH)
        if _is_int(length) and (length < 1 or length > room_for(cell, far)):
            raise ValueError(f"the platform at {cell_text(cell)} is {length} blocks long, which the lattice cannot hold")
        slots[0] = [kind, d, axis, 1, *lower, *upper] + [-1] * 6
        slots[1] = [0 if cell == lower else 1, length, b.get("speed", DEFAULT_SPEED), -1, FIRST_RECORD + k] + [-1] * 11
        extras[-6:] = [FIXED * c for c in cell] + [PLATFORM_UNIT] * 3
    elif kind == CRUMBLING_KIND:
        slots[0] = [kind, 1, *(FIXED * c for c in cell)] + [-1] * 11
    elif kind == VANISHING_KIND:
        slots[0] = [kind, 0, b.get("phase", 0)] + [-1] * 13
    elif kind == LASER_KIND:
        far = tuple(b["far"])
        d, axis, lower, upper = _span_words(cell, far)
        colour = b["colour"]
        slots[0] = [kind, d, axis, 1 if states[colour] == STATE_ON else 0, *lower, *upper] + [-1] * 6
        slots[1] = [-1, 1, -1, -1, FIRST_RECORD + k, -1, colour, links[(k, OWN)][0]] + [-1] * 8
    words = [w for s in slots for w in s] + extras + list(cell)
    try:
        return struct.pack(f"<{WORDS}h", *words)
    except struct.error:
        raise ValueError(f"a word of the block at {cell_text(cell)} is outside the file's range") from None


def _settings(project):
    words = [UNPLACED_KIND, int(bool(project.get("hidden"))), int(bool(project.get("invisibleFromAfar")))]
    words += [0] * (WORDS - 3 - len(words))
    return struct.pack(f"<{WORDS}h", *words, *SETTINGS_CELL)


def start_cell(carried):
    """Where the game puts the ball: the last start it meets, else nowhere."""
    found = SETTINGS_CELL
    for b in carried:
        if any(o["type"] in (START, START_ON_CLOCK) for o in _faces_of(b).values()):
            found = tuple(b["cell"])
    return found


def _trailer(project, carried):
    words = [TRAILER_KIND, *start_cell(carried), 0, 0, project.get("time", DEFAULT_TIME)] + [-1] * 9
    words += [-1] * (WORDS - 3 - len(words))
    try:
        return struct.pack(f"<{WORDS}h", *words, -1, -1, -1)
    except struct.error:
        raise ValueError(f"a time of {project.get('time')!r} is outside the file's range") from None


def canonical(project):
    """The level file the project means, byte for byte.

    Records go in lattice order, the settings record after them where a flag
    is set, and the trailer last; links, pickup numbers, states and the filler
    words are derived here and nowhere else. Raises ValueError where the bytes
    are undefined: a cell outside the lattice, two blocks on one cell, a span
    along no one axis.
    """
    blocks = sorted((_whole_cells(b) for b in project["blocks"]), key=lambda b: tuple(b["cell"]))
    seen = set()
    for b in blocks:
        cell = tuple(b["cell"])
        kind = b.get("kind")
        if not is_cell(cell) or any(c not in LATTICE for c in cell):
            raise ValueError(f"cell {cell_text(cell)} is outside the lattice")
        if cell in seen:
            raise ValueError(f"two blocks on cell {cell_text(cell)}")
        seen.add(cell)
        if not _is_int(kind) or kind not in range(UNPLACED_KIND):
            raise ValueError(f"kind {kind} is not a kind of block")
        for key in _stray_face_keys(b):
            raise ValueError(f"face {json.dumps(key, ensure_ascii=False)} is not one of the six")
        for j in _faces_of(b):
            if j not in range(FACES):
                raise ValueError(f"face {j} is not one of the six")
        twice = _named_twice(b)
        if twice is not None:
            raise ValueError(f"face {twice} of the block at {cell_text(cell)} is named twice")
        if kind in SPAN_KINDS:
            if not is_cell(b.get("far")):
                raise ValueError(f"the span at {cell_text(cell)} needs a far end")
            if any(c not in LATTICE for c in b["far"]):
                raise ValueError(f"the far end {cell_text(b['far'])} of the span at {cell_text(cell)} "
                                 f"is outside the lattice")
    carried = [b for b in blocks if _carries(b)]
    index = {tuple(b["cell"]): k for k, b in enumerate(carried)}
    grid = [EMPTY] * CELLS
    for b in blocks:
        cell = tuple(b["cell"])
        grid[lattice_index(cell)] = FIRST_RECORD + index[cell] if cell in index else b["kind"]
    circuits = project.get("circuits") or {}
    states = {c: STATE_OFF if circuits.get(str(c)) == "off" else STATE_ON for c in range(COLOURS)}
    links, numbers = _links(carried), _numbers(carried)
    settings = bool(project.get("hidden") or project.get("invisibleFromAfar"))

    out = bytearray(struct.pack(f"<{CELLS}H", *grid))
    out += struct.pack("<iH", len(blocks), len(carried) + settings)
    for k, b in enumerate(carried):
        out += _record(b, k, states, links, numbers)
    if settings:
        out += _settings(project)
    out += _trailer(project, carried)
    return bytes(out)


# --- a project out of any file the game would load ----------------------------

# The line both readers add where a level's own wiring is not what the colour rule writes.
REWIRED = ("the level's switches, teleporters and lasers are wired otherwise than the colour rule wires them; "
           "the level written back follows the colours")


def _wiring(records, devices=None):
    """A level's wiring in play: the slots each switch's list reaches and where each
    teleporter leads, as the cells and faces they name, in one order, so two levels
    wired alike compare equal whatever their record order. `devices` says which of
    `records` to read the switches and teleporters from."""
    def target(at):
        return f"{cell_text(records[at[0]].cell)}/{at[1]}" if at[0] < len(records) else "past"

    def lst(word):
        seen, at = [], link(word)
        while at is not None and at[0] < len(records) and at[1] <= OWN and target(at) not in seen:
            seen.append(target(at))
            r = records[at[0]]
            at = link(r.slots[1][LINK_WORD] if at[1] == OWN else r.slots[at[1]][NEXT_WORD])
        return " ".join(sorted(seen))

    out = []
    for r in records if devices is None else devices:
        if r.kind >= BLOCK_KINDS:
            continue
        for j, s in enumerate(r.slots):
            if s[1] == SWITCH:
                out.append(f"{cell_text(r.cell)}/{j} flips {lst(s[LINK_WORD])}")
            elif s[1] == TELEPORTER:
                at = link(s[LINK_WORD])
                out.append(f"{cell_text(r.cell)}/{j} leads to {'none' if at is None else target(at)}")
    return sorted(out)

def read_kwl(blob, world=WORLDS[0]):
    """(project, report, repairs) for a level file by what the game accepts, the
    report collapsed and the repairs the count of its lines before that, less the
    notes, the lines on a value kept as it was: the lattice decides where a record
    stands and which records exist, the file's length decides how many stretches
    it holds, and a trailer is made up where the file has none. Only a length that
    is not a level's length raises."""
    report = []
    notes = 0

    def note(line):
        nonlocal notes
        report.append(line)
        notes += 1

    body = len(blob) - GRID_BYTES - HEAD
    if body < 0 or body % RECORD:
        raise ValueError(f"{len(blob)} bytes is not a level: the lattice, six bytes and whole {RECORD}-byte stretches")
    words = [list(struct.unpack_from(f"<{WORDS}h", blob, GRID_BYTES + HEAD + RECORD * k))
             for k in range(body // RECORD)]
    _, count = struct.unpack_from("<iH", blob, GRID_BYTES)
    time = DEFAULT_TIME
    if words and words[-1][0] == TRAILER_KIND:
        time = Record(words.pop()).f[4]
    else:
        report.append(f"no trailer, so the time is {DEFAULT_TIME}")
    if count != len(words):
        report.append(f"the header counts {count} records and the file holds {len(words)}")
    records = [Record(w) for w in words]

    named = {}
    cells = []
    for i, v in enumerate(struct.unpack_from(f"<{CELLS}H", blob, 0)):
        if v == EMPTY:
            continue
        cell = (i // (SIDE * SIDE), (i // SIDE) % SIDE, i % SIDE)
        if v < FIRST_RECORD:
            cells.append((*cell, v))
            continue
        k = v - FIRST_RECORD
        if k >= len(records) or records[k].kind not in range(UNPLACED_KIND):
            report.append(f"cell {cell_text(cell)} names record {k}, which is not a block; the cell is left empty")
            continue
        if k in named:
            report.append(f"cell {cell_text(cell)} names record {k}, which cell {cell_text(named[k])} already names; "
                          f"the cell is left empty")
            continue
        named[k] = cell
        cells.append((*cell, v))
        r = records[k]
        if r.cell != cell:
            report.append(f"record {k} says it stands at {cell_text(r.cell)}; the lattice puts it at {cell_text(cell)}")
            r.x, r.y, r.z = cell

    kept, settings = [], []
    for k, r in enumerate(records):
        if r.kind == UNPLACED_KIND:
            settings.append(k)
        elif k in named:
            kept.append(k)
        else:
            report.append(f"record {k} of kind {r.kind} at {cell_text(r.cell)} is named by no cell; it is dropped")
    if len(settings) > 1:
        report.append(f"{len(settings)} settings records; the flags of all of them are taken")

    dropped = set()
    for k in kept:
        r = records[k]
        if r.kind in SPAN_KINDS:
            a, b = sorted(r.span)
            ends = f"{cell_text(a)} to {cell_text(b)}"

            def drop(why):
                report.append(f"record {k} spans {why}; it is dropped and its cell left empty")
                dropped.add(k)

            if r.cell in (a, b):
                far = b if a == r.cell else a
                if far == r.cell:
                    drop(f"nothing: both of its ends are its own cell {cell_text(r.cell)}")
                    continue
                if direction(r.cell, far) is None:
                    drop(f"{ends}, along no one axis")
                    continue
            else:
                if a == b:
                    drop(f"nothing: both of its ends are {cell_text(a)}, away from its cell {cell_text(r.cell)}")
                    continue
                axis = span_axis(a, b)
                if axis is None:
                    drop(f"{ends}, along no one axis")
                    continue
                far = list(r.cell)
                far[axis] = a[axis] if b[axis] == r.cell[axis] else b[axis]
                far = tuple(far)
                if all(c in LATTICE for c in far):
                    if far == b:
                        end = "lower" if r.cell < b else "upper"
                        report.append(f"record {k} spans {ends} and stands at {cell_text(r.cell)}; its {end} end is now its cell")
                    else:
                        report.append(f"record {k} spans {ends} and stands at {cell_text(r.cell)}, off their line; "
                                      f"it now spans {cell_text(r.cell)} to {cell_text(far)}")
            if any(c not in LATTICE for c in far):
                drop(f"to {cell_text(far)}, outside the lattice")
                continue
            lower, upper = sorted((r.cell, far))
            r.slots[0][4:10] = [*lower, *upper]
            if r.kind == PLATFORM_KIND:
                held = held_length(r.length, inner_room_for(r.cell, far))
                if held != r.length:
                    why = "is less than one block" if r.length < 1 else "runs past the edge"
                    report.append(f"the platform at {cell_text(r.cell)} is {r.length} blocks long, which {why}; it is {held}")
                    r.slots[1][1] = held
                elif r.length not in LENGTHS:
                    note(f"the platform at {cell_text(r.cell)} is {r.length} blocks long")
                if r.speed != DEFAULT_SPEED:
                    note(f"the platform at {cell_text(r.cell)} runs at {r.speed}")
        if r.kind == VANISHING_KIND and r.f[0] in DIM_AT_ONCE:
            note(f"the vanishing block at {cell_text(r.cell)} has phase {r.f[0]}, which dims at once")

    if dropped:
        kept = [k for k in kept if k not in dropped]
        cells = [c for c in cells if c[3] < FIRST_RECORD or c[3] - FIRST_RECORD not in dropped]
    order = [records[k].cell for k in kept]
    if order != sorted(order):
        starts = sum(1 for k in kept if records[k].kind < BLOCK_KINDS
                     for o in records[k].objects if o.type in (START, START_ON_CLOCK))
        captive = any(o.type in CAPTIVATORS for k in kept if records[k].kind < BLOCK_KINDS
                      for o in records[k].objects)
        if starts > 1 or captive:
            report.append("the records are not in lattice order, which the file written back will be; "
                          "the start the game takes and the captivators' order may change")

    renumber = {k: n for n, k in enumerate(kept)}
    cells = [(x, y, z, v if v < FIRST_RECORD else FIRST_RECORD + renumber[v - FIRST_RECORD])
             for x, y, z, v in cells]
    level = _level_dict(cells, [records[k] for k in kept + settings], time, world, "", report)
    project = project_of(level, report)
    try:
        rebuilt = Level(canonical(project))
    except ValueError:
        rebuilt = None
    if rebuilt is not None and _wiring(records, [records[k] for k in kept]) != _wiring(rebuilt.records):
        report.append(REWIRED)
    return project, collapse(report), len(report) - notes


# --- a project out of a project file -------------------------------------------

def _taken(raw, key, fallback, where, report):
    """The whole number under `key`, or `fallback` where it is missing or not one, reported."""
    if key not in raw:
        return fallback
    v = raw[key]
    if _whole(v):
        return _int(v)
    report.append(f"{where} has a {key} of {_show(v)}, which is not a whole number; it is {_show(fallback)}")
    return fallback


def _word(v, key, where, report):
    """`v` where the file's word holds it, else the nearest word with a line."""
    if v in WORD:
        return v
    held = WORD.start if v < 0 else WORD.stop - 1
    report.append(f"{where} has a {key} of {v}, outside the file's range; it is {held}")
    return held


def _one_of(raw, key, n, where, report):
    """The number under `key` where it is one of `n`, else 0 with a line; missing is 0."""
    if key not in raw:
        return 0
    v = raw[key]
    if _whole(v) and 0 <= v < n:
        return _int(v)
    report.append(f"{where} has a {key} of {_show(v)}, which is not one of the {spelled(n)}; it is 0")
    return 0


def _read_faces(faces, where, report):
    out = {}
    for key, o in _entries(faces):
        face = key.lstrip("0") or "0"
        if not re.fullmatch(r"[0-9]+", key) or len(face) > 1 or int(face) >= FACES:
            report.append(f'{where} names a face "{key}", which is not one of the six; it is left out')
            continue
        if face in out:
            report.append(f'{where} names face {face} again as "{key}"; it is left out')
            continue
        if not isinstance(o, dict) or not _whole(o.get("type")):
            report.append(f"{where} face {key} holds nothing that could stand on a face; it is left out")
            continue
        t = _int(o["type"])
        if t <= 0:
            report.append(f"{where} face {key} has a type of {t}, which is nothing standing there; it is left out")
            continue
        at = f"{where} face {key}"
        t = _word(t, "type", at, report)
        obj = {"type": t}
        if "facing" in o:
            if _whole(o["facing"]):
                obj["facing"] = _word(_int(o["facing"]), "facing", at, report)
            else:
                report.append(f"{at} has a facing of {_show(o['facing'])}, which is not a whole number; it is left out")
        if t in FACING_NEEDED and not obj.get("facing"):
            report.append(f"{at} has {'no facing' if 'facing' not in obj else 'a facing of 0'}, {HEADS_AS_ONE}")
            obj["facing"] = 1
        if t in VARIANT_TYPES:
            obj["variant"] = _one_of(o, "variant", len(VARIANTS[t]), at, report)
        elif "variant" in o:
            if _whole(o["variant"]):
                obj["variant"] = _word(_int(o["variant"]), "variant", at, report)
            else:
                report.append(f"{at} has a variant of {_show(o['variant'])}, which is not a whole number; it is left out")
        out[face] = obj
    return out


def _read_block(raw, i, report, seen):
    where = f"block {i}"
    if not isinstance(raw, dict) or not is_cell(raw.get("cell")) or not _whole(raw.get("kind")):
        report.append(f"{where} has no cell of three whole numbers and a kind; it is left out")
        return None
    b = {"cell": [_int(c) for c in raw["cell"]], "kind": _int(raw["kind"])}
    at = f"{where} at {cell_text(b['cell'])}"
    if any(c not in LATTICE for c in b["cell"]):
        report.append(f"{at} stands outside the lattice; it is left out")
        return None
    if b["kind"] not in range(UNPLACED_KIND):
        report.append(f"{at} has a kind of {b['kind']}, which is not a kind of block; it is left out")
        return None
    if tuple(b["cell"]) in seen:
        report.append(f"{at} stands on the cell of block {seen[tuple(b['cell'])]}; it is left out")
        return None
    if "faces" in raw:
        if not isinstance(raw["faces"], dict):
            report.append(f"{at} has faces that are not a table of the six; they are left out")
        else:
            faces = _read_faces(raw["faces"], at, report)
            if faces:
                b["faces"] = faces
    if b["kind"] in SPAN_KINDS:
        far = raw.get("far")
        if "far" not in raw:
            report.append(f"{at} is a span with no far end; it is left out")
            return None
        if not is_cell(far):
            report.append(f"{at} has a far end that is not a cell of three whole numbers; it is left out")
            return None
        far = [_int(c) for c in far]
        if far == b["cell"]:
            report.append(f"{at} has its far end on its own cell; it is left out")
            return None
        if any(c not in LATTICE for c in far):
            report.append(f"{at} has its far end at {cell_text(far)}, outside the lattice; it is left out")
            return None
        if direction(b["cell"], far) is None:
            report.append(f"{at} spans to {cell_text(far)} along no one axis; it is left out")
            return None
        b["far"] = far
    if b["kind"] == PLATFORM_KIND:
        b["length"] = _taken(raw, "length", DEFAULT_LENGTH, at, report)
        held = held_length(b["length"], inner_room_for(b["cell"], b["far"]))
        if held != b["length"]:
            why = "is less than one block" if b["length"] < 1 else "runs past the edge"
            report.append(f"{at} has a length of {b['length']}, which {why}; it is {held}")
            b["length"] = held
        b["speed"] = _word(_taken(raw, "speed", DEFAULT_SPEED, at, report), "speed", at, report)
    if b["kind"] == LASER_KIND:
        b["colour"] = _one_of(raw, "colour", COLOURS, at, report)
    if b["kind"] == VANISHING_KIND:
        b["phase"] = _word(_taken(raw, "phase", 0, at, report), "phase", at, report)
    seen[tuple(b["cell"])] = i
    return b


def read_project(raw):
    """(project, report, repairs) for a parsed project document, rule for rule as
    the page reads one, the report collapsed and the repairs the count of its
    lines before that, less the note on a newer file; raises ValueError on
    another format's document."""
    if not isinstance(raw, dict) or raw.get("format") != FORMAT:
        raise ValueError(f"not a {FORMAT} file")
    report = []
    notes = 0
    if "version" in raw and not _whole(raw["version"]):
        report.append(f"a version of {_show(raw['version'])} is not a whole number; "
                      f"the file is read as version {VERSION}")
    elif "version" in raw and raw["version"] > VERSION:
        report.append(f"written as version {_int(raw['version'])} of the format, newer than this reader's version {VERSION}; "
                      f"what it knows is read")
        notes += 1

    def cut(key, most):
        if most is None or len(raw[key]) <= most:
            return raw[key]
        report.append(f"{key} is {len(raw[key])} characters long, more than the {most} kept; it is cut to {most}")
        return raw[key][:most]

    def text(key, most=None):
        if key not in raw:
            return ""
        if not isinstance(raw[key], str):
            report.append(f"{key} is not text; it is left empty")
            return ""
        return cut(key, most)

    def optional(key, most):
        if key not in raw:
            return None
        if not isinstance(raw[key], str):
            report.append(f"{key} is not text; it is left out")
            return None
        return cut(key, most)

    def flag(key):
        if key not in raw:
            return False
        if isinstance(raw[key], bool):
            return raw[key]
        report.append(f"{key} is neither true nor false; it is taken as false")
        return False

    project = {"format": FORMAT, "version": VERSION, "title": text("title", TITLE_MOST),
               "author": text("author", TEXT_MOST), "notes": text("notes", TEXT_MOST), "world": text("world", TEXT_MOST)}
    into = optional("into", TEXT_MOST)
    if into is not None:
        project["into"] = into
    source = optional("from", TEXT_MOST)
    if source is not None:
        project["from"] = source
    disc = optional("fromRelease", TEXT_MOST)
    if disc is not None:
        project["fromRelease"] = disc
    if "time" not in raw or _whole(raw["time"]):
        project["time"] = _int(raw["time"]) if "time" in raw else DEFAULT_TIME
    else:
        report.append(f"a time of {_show(raw['time'])} is not a whole number; it is {DEFAULT_TIME}")
        project["time"] = DEFAULT_TIME
    if project["time"] not in WORD:
        held = WORD.start if project["time"] < 0 else WORD.stop - 1
        report.append(f"a time of {project['time']} is outside the file's range; it is {held}")
        project["time"] = held
    project["hidden"] = flag("hidden")
    project["invisibleFromAfar"] = flag("invisibleFromAfar")
    project["simon"] = flag("simon")
    project["circuits"] = {}
    if "circuits" in raw and not isinstance(raw["circuits"], dict):
        report.append("circuits is not a table of colours; every colour starts on")
    else:
        for colour, state in _entries(raw.get("circuits") or {}):
            if not re.fullmatch(r"[0-3]", colour):
                report.append(f"colour {colour} is not one of the four; it is left out")
            elif state == "off":
                project["circuits"][colour] = "off"
            elif state != "on":
                report.append(f"colour {colour} is neither on nor off; it starts on")
    if not isinstance(raw.get("blocks"), list):
        report.append("no blocks")
        project["blocks"] = []
    else:
        seen = {}
        blocks = [_read_block(b, i, report, seen) for i, b in enumerate(raw["blocks"])]
        project["blocks"] = sorted((b for b in blocks if b is not None), key=lambda b: tuple(b["cell"]))
    return project, collapse(report), len(report) - notes


# --- what the game would make of a project ------------------------------------

def _is_far(v):
    """Whether a far end has the shape the span rules read, three coordinates."""
    return isinstance(v, list) and len(v) == 3


def _kinds_at(blocks):
    """The lattice as the loader leaves it before building faces: a beam's far end
    stands a plain block where the file has none."""
    kinds = {tuple(b["cell"]): b["kind"] for b in blocks}
    for b in blocks:
        if b["kind"] == LASER_KIND and _is_far(b.get("far")):
            kinds.setdefault(tuple(b["far"]), 0)
    return kinds


def _built(hides, kinds, cell, kind):
    """How many of a block's six faces the game builds: a face toward a kind the
    block's kind hides behind is not, unless the block's kind is one that is
    built unseen behind it. A laser's own cell hides as the plain block the
    loader has made of it."""
    own = hides["kinds"].get(_js_text(kind), hides["other"])
    unseen = hides["unseen"] if _js_text(kind) not in hides["kinds"] else ()
    n = 0
    for d in DIRECTIONS:
        theirs = kinds.get((cell[0] + d[0], cell[1] + d[1], cell[2] + d[2]))
        if theirs == LASER_KIND:
            theirs = 0
        if not _is_int(theirs) or theirs not in own or theirs in unseen:
            n += 1
    return n


COUNTERS = ("records", "cells", "faces", "blocks", "objects", "platforms", "lasers",
            "vanishing", "crumbling", "captivators", "keys", "lights", "spikes")
COUNTER_WORDS = {
    "records": "records",
    "cells": "cells",
    "faces": "faces",
    "blocks": "blocks",
    "objects": "objects the loader numbers",
    "platforms": "platforms",
    "lasers": "lasers",
    "vanishing": "vanishing blocks",
    "crumbling": "crumbling blocks",
    "captivators": "captivators",
    "keys": "keys",
    "lights": "devices that cast a light",
    "spikes": "moving spikes",
}


TABLE_COUNTERS = ("faces", "blocks")   # the counters that need the skins table


def counts(project, hides):
    """The counters the caps and the disc's maxima are read against; without the
    skins table the faces and the blocks are None."""
    blocks = _as_page(project["blocks"])
    at = {tuple(b["cell"]): b for b in blocks}
    kinds = _kinds_at(blocks)
    n = Counter({what: 0 for what in COUNTERS})
    n["cells"] = len(blocks)
    for cell, kind in kinds.items() if hides else ():
        if not all(c in INNER for c in cell):
            continue
        if kind == PLATFORM_KIND:
            length = _length_of(at[cell])
            n["faces"] += FACES if length < 2 else 4 * length + 2
            continue
        built = _built(hides, kinds, cell, kind)
        n["faces"] += built
        if _is_int(kind) and kind in COUNTED_KINDS and built:
            n["blocks"] += 1
    for b in blocks:
        kind = b["kind"]
        if kind == PLATFORM_KIND:
            n["platforms"] += 1
        elif kind == LASER_KIND:
            n["lasers"] += 1
        elif kind == VANISHING_KIND:
            n["vanishing"] += 1
        elif kind == CRUMBLING_KIND:
            n["crumbling"] += 1
        if _carries(b):
            n["records"] += 1
        for o in _faces_of(b).values():
            t = o["type"]
            n["objects"] += t in NUMBERED
            n["captivators"] += t in CAPTIVATORS
            n["keys"] += t == KEY
            n["lights"] += t in LIGHTS
            n["spikes"] += t == MOVING_SPIKES
    n["records"] += _truthy(project.get("hidden")) or _truthy(project.get("invisibleFromAfar"))
    out = dict(n)
    if not hides:
        out.update(dict.fromkeys(TABLE_COUNTERS))
    return out


def plays_as(project):
    keyed = any(o["type"] == KEY for b in project["blocks"] for o in _faces_of(b).values())
    room = not keyed and _truthy(project.get("simon"))
    if _truthy(project.get("hidden")):
        if keyed:
            return "Plays as a hidden level, with the glass ball on half-seen blocks."
        if room:
            return "Plays as a hidden Simon room, with the glass ball on half-seen blocks."
        return "Plays as a hidden bonus level since it has no key, with the glass ball on half-seen blocks."
    if keyed:
        return "Plays as an arcade level."
    if room:
        return "Plays as a Simon room."
    return "Plays as a bonus level since it has no key."


def _slot_of(pack, index):
    """Whether a target names a slot of a world pack, a finals pack or the Simon rooms' pack."""
    if pack == COPYCAT_PACK:
        return index in range(COPYCAT_SLOTS)
    for w in WORLDS:
        if pack == f"/{w}/{w}.PAK" and index in range(WORLD_SLOTS):
            return True
        if pack == f"/{w}/{w}FI.PAK" and index in range(FINAL_SLOTS):
            return True
    return False


def _over_cap(what, n):
    return f"{n} {COUNTER_WORDS[what]}, over the {CAPS[what]} the game has room for"


def record_overflow(project):
    """The checks' sentence for a project whose blocks carry more records than a link
    word can name, which the writer has no bytes for; None where it has room."""
    carried = sum(_carries(b) for b in _as_page(project["blocks"]))
    return _over_cap("records", counts(project, None)["records"]) if carried > LINK_RECORDS else None


def validate(project, hides):
    """What the game would make of the project: (level, text, at) findings, `at`
    naming a cell and perhaps a face, errors first in the order found."""
    out = []
    project = _as_page(project)

    def err(text, cell=None, face=None):
        out.append((ERROR, text, _at(cell, face)))

    def warn(text, cell=None, face=None):
        out.append((WARNING, text, _at(cell, face)))

    world = project.get("world") if isinstance(project.get("world"), str) else ""
    if world not in WORLDS:
        err(f"the world '{world}' is not one of the disc's ten worlds")
    into = project.get("into")
    if into is not None:
        text = into if isinstance(into, str) else _show(into)
        pack, _, index = text.rpartition("#")
        if not (re.fullmatch(r"[0-9]+", index) and _slot_of(pack, int(index))):
            err(f"the target '{text}' is not a slot of a world pack, a finals pack or the Simon rooms' pack")
    time = _or(project.get("time"), DEFAULT_TIME)
    if not _is_int(time) or time not in WORD:
        err(f"a time of {_js_text(time)} seconds, outside the file's range")
    elif time < 1:
        err(f"a time of {time} seconds")
    elif time > TIME_MAX:
        warn(f"a time of {time} seconds, above the {TIME_MAX} the game's levels keep to")

    blocks = sorted(project["blocks"], key=lambda b: tuple(b["cell"]))
    at = {}
    for b in blocks:
        cell = tuple(b["cell"])
        if cell in at:
            err("two blocks on one cell", cell)
        at[cell] = b
        if any(c not in INNER for c in cell):
            err("the game builds nothing past the edge", cell)
    kinds = _kinds_at(blocks)
    loader = _filled(blocks)
    beams = set(loader[0])
    starts = []
    for b in blocks:
        cell, kind = tuple(b["cell"]), b["kind"]
        if not _is_int(kind) or kind not in range(UNPLACED_KIND):
            err(f"kind {_js_text(kind)} is not a kind of block", cell)
            continue
        faces = _faces_of(b)
        if kind >= BLOCK_KINDS and _entries_of(b.get("faces")):
            err("nothing stands on a platform's, laser's, crumbling or vanishing block's faces", cell)
        twice = _named_twice(b)
        if twice is not None:
            err(f"face {twice} is named twice", cell)
        if kind == VANISHING_KIND:
            phase = _or(b.get("phase"), 0)
            if phase in DIM_AT_ONCE:
                warn(f"a phase of {phase} dims at once", cell)
            elif not _is_int(phase) or phase not in PHASES:
                err(f"a phase of {_js_text(phase)}", cell)
        colour = b.get("colour")
        if kind == LASER_KIND and not (_is_int(colour) and colour in range(COLOURS)):
            err(f"a colour of {'none' if colour is None else _js_text(colour)}", cell)
        if kind in SPAN_KINDS:
            _validate_span(b, at, loader, err, warn)
        for j, o in sorted(faces.items()):
            t = o["type"]
            if j not in range(FACES):
                err(f"face {j} is not one of the six", cell)
                continue
            if t not in PLAYED:
                err(f"type {t} is nothing the game plays", cell, j)
            if t in PLAIN_ONLY and kind != 0:
                err("a device works on a plain block only", cell, j)
            if t == HIDDEN_EXIT and kind != 0:
                warn("the game has not been seen to take a hidden exit on a block that is not plain", cell, j)
            if t in FACING_NEEDED and not _facing_ok(o.get("facing")):
                err("a facing of 1 to 4 is needed", cell, j)
            elif t in FACING_TYPES and "facing" in o and not _facing_ok(o["facing"]):
                err("a facing of 1 to 4, or none", cell, j)
            if t in VARIANT_TYPES:
                v = _or(o.get("variant"), 0)
                if not _is_int(v) or v not in VARIANTS[t]:
                    err(f"a variant of {_js_text(v)}", cell, j)
            if t in (START, START_ON_CLOCK):
                starts.append((cell, j))
            if t == HEDGEHOG:
                warn("the hedgehog is untested in play", cell, j)
            _validate_outlook(cell, j, kinds, beams, warn)
        for key in _stray_face_keys(b):
            err(f"face {json.dumps(key, ensure_ascii=False)} is not one of the six", cell)
    if not starts:
        err("no start")
    elif len(starts) > 1:
        cell, j = starts[-1]
        warn(f"{len(starts)} starts; the game takes the one on face {j} of the block at {cell_text(cell)}")

    _validate_circuits(project, warn)
    n = counts(project, hides)
    undrawn = [] if n["keys"] or _truthy(project.get("hidden")) or _truthy(project.get("simon")) else _undrawn_in_bonus(blocks)
    if undrawn:
        warn(f"with no key the game draws the bonus artwork, which has no picture for {_listed(undrawn)}")
    if not hides:
        warn("the face count could not be read, so the faces and the blocks are not counted")
    if n["keys"] and not any(o["type"] in (EXIT, HIDDEN_EXIT) for b in blocks for o in _faces_of(b).values()):
        warn("a key and no exit")
    for what, cap in CAPS.items():
        if n[what] is not None and n[what] > cap:
            err(_over_cap(what, n[what]))
    for what, most in DISC_MAX.items():
        if n[what] is not None and n[what] > most:
            warn(f"{n[what]} {COUNTER_WORDS[what]}, more than any level on the disc")
    out.sort(key=lambda f: f[0] != ERROR)
    return out


def describe(finding):
    """One finding as a line: its level, where it is, and what it says."""
    level, text, at = finding
    where = ""
    if at:
        where = f" at {cell_text(at['cell'])}"
        if "face" in at:
            where += f" face {at['face']}"
    return f"{level}{where}: {text}"


def _or(v, fallback):
    """A value, or the fallback where it is missing, as the page's ?? reads one."""
    return fallback if v is None else v


def _facing_ok(v):
    return _is_int(v) and v in range(1, 5)


def _at(cell, face):
    if cell is None:
        return None
    where = {"cell": list(cell)}
    if face is not None:
        where["face"] = face
    return where


def _length_of(b):
    """A platform's length as the loader walks it: the file's word, or the default where the value is none."""
    length = b.get("length")
    return length if _is_int(length) and length in WORD else DEFAULT_LENGTH


def _run(b):
    """The cells a span covers: a platform's cells from its lower end to its upper end
    plus its length, a laser's cells from end to end."""
    cell, far = tuple(b["cell"]), tuple(b["far"])
    axis = span_axis(cell, far)
    lower, upper = sorted((cell, far))
    extra = _length_of(b) - 1 if b["kind"] == PLATFORM_KIND else 0
    cells = []
    for t in range(max(lower[axis], 0), min(upper[axis] + extra, SIDE - 1) + 1):
        c = list(lower)
        c[axis] = t
        cells.append(tuple(c))
    return cells


def _spans(blocks, kind):
    return [b for b in blocks
            if b["kind"] == kind and _is_far(b.get("far")) and direction(tuple(b["cell"]), tuple(b["far"])) is not None]


def _filled(blocks):
    """The cells the loaders fill for the spans: a beam's cells between its ends,
    its far end, and a platform's whole run, each naming the span that fills it."""
    beams, ends, runs = {}, {}, {}
    for b in _spans(blocks, LASER_KIND):
        for c in _run(b)[1:-1]:
            beams.setdefault(c, []).append(b)
        ends[tuple(b["far"])] = b
    for b in _spans(blocks, PLATFORM_KIND):
        for c in _run(b):
            runs[c] = b
    return beams, ends, runs


def _validate_span(b, at, loader, err, warn):
    cell = tuple(b["cell"])
    if not _truthy(b.get("far")):
        err("a span needs a far end", cell)
        return
    if not _is_far(b["far"]):
        err("the far end is not along one axis from the block", cell)
        return
    far = tuple(b["far"])
    if far == cell:
        err("the far end is the block's own cell", cell)
        return
    if direction(cell, far) is None:
        err("the far end is not along one axis from the block", cell)
        return
    if any(c not in LATTICE for c in far):
        err("the far end is past the edge", cell)
        return
    length = _or(b.get("length"), DEFAULT_LENGTH) if b["kind"] == PLATFORM_KIND else 1
    if b["kind"] == PLATFORM_KIND:
        if not _is_int(length) or length not in WORD:
            err(f"a length of {_js_text(length)}, outside the file's range", cell)
            return
        if length < 1:
            err(f"a platform {length} blocks long, which is less than one block", cell)
            return
        if length > room_for(cell, far):
            err(f"a platform {length} blocks long, which the lattice cannot hold", cell)
            return
    if any(c not in INNER for c in far):
        err("the far end is past the edge", cell)
        return
    beams, ends, runs = loader
    if b["kind"] == PLATFORM_KIND:
        speed = _or(b.get("speed"), DEFAULT_SPEED)
        axis = span_axis(cell, far)
        if max(cell[axis], far[axis]) + length - 1 not in INNER:
            err("the platform's run reaches past the edge", cell)
            return
        if length > LENGTH_CAP:
            err(f"a platform {length} blocks long, more than the {LENGTH_CAP} the game's grid holds", cell)
        elif length not in LENGTHS:
            warn(f"a platform {length} blocks long", cell)
        if not _is_int(speed) or speed not in WORD:
            err(f"a speed of {_js_text(speed)}, outside the file's range", cell)
        elif speed != DEFAULT_SPEED:
            warn(f"a platform running at {speed}", cell)
        for c in _run(b):
            if c != cell and c in at:
                err(f"the platform's run crosses the block at {cell_text(c)}", cell)
            for laser in beams.get(c, ()):
                err(f"the platform's run crosses the beam from {cell_text(laser['cell'])}", cell)
            if c in ends:
                err(f"the platform's run crosses the end of the beam from {cell_text(ends[c]['cell'])}", cell)
        return
    for c in _run(b):
        other = at.get(c)
        if c == cell:
            continue
        if c == far:
            if other is not None and other["kind"] == 0 and _faces_of(other):
                warn("the beam's end makes a bare plain block of the block there; what stands on it "
                     "still works but its faces paint plain", cell)
            elif other is not None and other["kind"] not in (0, LASER_KIND):
                err("a beam ends on an empty cell, a plain block or another laser's block", cell)
            for laser in beams.get(c, ()):
                err(f"the beam ends in the beam from {cell_text(laser['cell'])}", cell)
            continue
        if other is not None:
            err(f"the beam crosses the block at {cell_text(c)}", cell)
        if c in runs:
            err(f"the beam crosses the platform's run from {cell_text(runs[c]['cell'])}", cell)


def _validate_outlook(cell, j, kinds, beams, warn):
    d = DIRECTIONS[j]
    beyond = (cell[0] + d[0], cell[1] + d[1], cell[2] + d[2])
    if beyond not in kinds:
        if beyond in beams:
            warn("looks into a beam", cell, j)
        return
    theirs = kinds[beyond]
    if theirs == CRUMBLING_KIND:
        warn("looks into a crumbling block", cell, j)
    elif theirs == VANISHING_KIND:
        warn("looks into a vanishing block", cell, j)
    else:
        warn(f"looks into the block at {cell_text(beyond)}", cell, j)


@lru_cache(maxsize=None)
def _names():
    return json.loads(NAMES.read_text())


def _lower(name):
    return name[0].lower() + name[1:]


def _listed(items):
    return f"{', '.join(items[:-1])} or {items[-1]}" if len(items) > 1 else items[0]


def _undrawn_in_bonus(blocks):
    """The things a keyless level places that the bonus artwork has no picture for, by name."""
    names = []

    def add(name):
        if name not in names:
            names.append(name)

    ann = _names()
    for b in blocks:
        if _is_int(b["kind"]) and b["kind"] in BONUS_UNDRAWN_KINDS:
            name = ann["kinds"].get(str(b["kind"]), {}).get("name")
            add(f"the {_lower(name)}" if name else f"kind {b['kind']}")
        for o in _faces_of(b).values():
            if o["type"] in BONUS_UNDRAWN_TYPES:
                name = ann["types"].get(str(o["type"]), {}).get("name")
                add(f"the {_lower(name)}" if name else f"type {o['type']}")
    return names


def _circuit_word(c):
    """A circuit's word, the bracketed part of its switch's name trimmed of its spaces, or None where the annotations have none or nothing but spaces."""
    name = _names()["types"].get(str(SWITCH), {}).get("variants", {}).get(str(c), {}).get("name") or ""
    found = re.search(r"\(([^)]*)\)", name)
    return (found.group(1).strip() or None) if found else None


def circuit_members(project):
    """Each colour's switches, teleporters and lasers, counted on the faces the game walks."""
    members = [{"switches": 0, "teleporters": 0, "lasers": 0} for _ in range(COLOURS)]

    def member_of(colour):
        return members[colour] if _is_int(colour) and colour in range(COLOURS) else None

    for b in project["blocks"]:
        if b["kind"] == LASER_KIND:
            m = member_of(_or(b.get("colour"), 0))
            if m is not None:
                m["lasers"] += 1
            continue
        for o in _faces_of(b).values():
            m = member_of(_or(o.get("variant"), 0))
            if m is None:
                continue
            if o["type"] == TELEPORTER:
                m["teleporters"] += 1
            elif o["type"] == SWITCH:
                m["switches"] += 1
    return members


def _validate_circuits(project, warn):
    circuits = _or(project.get("circuits"), {})
    for c, m in enumerate(circuit_members(project)):
        word = _circuit_word(c)
        if _property(circuits, str(c)) == "off" and not m["switches"] and (m["lasers"] or m["teleporters"]):
            warn(f"{f'the {word} circuit' if word else f'circuit {c}'} starts off and has no switch to turn it on")
        if m["teleporters"] == 1:
            warn(f"the one {word} teleporter leads to itself" if word else f"the one teleporter of circuit {c} leads to itself")
        if m["switches"] and not m["teleporters"] and not m["lasers"]:
            warn(f"the {word} switches have nothing to switch" if word else f"the switches of circuit {c} have nothing to switch")


# --- what holds the writer to the data ----------------------------------------

def digests(data):
    """Per shipped level, the digest of its canonical file and of that file's deflate
    at the two levels the page compresses at, under the version of the zlib that wrote them."""
    out = {"zlib": zlib.ZLIB_RUNTIME_VERSION}
    for level in data["levels"]:
        blob = canonical(project_of(level))
        z = zlib.compress(blob, 6)
        out[level_key(level["pack"], level["index"])] = {
            "deflate": hashlib.sha256(z).hexdigest(),
            "deflate9": hashlib.sha256(zlib.compress(blob, 9)).hexdigest(),
            "kwl": hashlib.sha256(blob).hexdigest(),
            "size": len(z),
        }
    return out


def render_digests(digests):
    return json.dumps(digests, indent=1, sort_keys=True) + "\n"


def _b64(data):
    return base64.b64encode(data).decode()


def deflate_vectors(fixture):
    """The fixture's inputs with the streams this zlib writes for each at the two
    levels the page compresses at, under the version that wrote them."""
    vectors = []
    for v in fixture["vectors"]:
        data = base64.b64decode(v["input"])
        vectors.append({"name": v["name"], "input": v["input"],
                        "level6": _b64(zlib.compress(data, 6)), "level9": _b64(zlib.compress(data, 9))})
    return {"zlib": zlib.ZLIB_RUNTIME_VERSION, "vectors": vectors}


def render_vectors(fixture):
    return json.dumps(fixture, indent=1) + "\n"


def hostile(fixture):
    """The fixture's documents with what the reader and the writer give for each:
    the project and the report, and the digest of the level or the sentence it is
    refused with; a document of another format carries its refusal alone."""
    cases = []
    for case in fixture["cases"]:
        out = {"name": case["name"], "input": case["input"]}
        try:
            project, report, _ = read_project(case["input"])
        except ValueError as e:
            out["refusal"] = str(e)
            cases.append(out)
            continue
        out["project"], out["report"] = project, report
        try:
            out["level"] = {"kwl": hashlib.sha256(canonical(project)).hexdigest()}
        except ValueError as e:
            out["level"] = {"refusal": str(e)}
        cases.append(out)
    return {"cases": cases}


def render_hostile(fixture):
    return json.dumps(fixture, indent=1, ensure_ascii=False) + "\n"


def template(data, key):
    """The project of a shipped level named by its pack and index, the pack as
    its path or as its stem."""
    pack, _, index = key.rpartition("#")
    for level in data["levels"]:
        stem = level["pack"].rsplit("/", 1)[-1].rsplit(".", 1)[0]
        if pack.upper() in (level["pack"].upper(), stem) and re.fullmatch(r"[0-9]+", index) and int(index) == level["index"]:
            return project_of(level)
    raise KeyError(key)


def project_at(path):
    """(project, report) read from a project file, or the tool's exit in one
    sentence where the file is missing, cannot be read or is no project."""
    if not file_at(path):
        sys.exit(f"no file at {path}")
    try:
        project, report, _ = read_project(json.loads(Path(path).read_text(encoding="utf-8-sig")))
    except OSError as e:
        sys.exit(f"{path} cannot be read: {e.strerror}")
    except UnicodeDecodeError:
        sys.exit(f"{path} is not UTF-8 text")
    except json.JSONDecodeError as e:
        sys.exit(f"{path} is not JSON: {e}")
    except ValueError as e:
        sys.exit(f"{path} is {e}")
    return project, report


def level_at(path, world):
    """(project, report) read from a level file, or the tool's exit in one
    sentence where the file is missing, cannot be read or is no level."""
    if not file_at(path):
        sys.exit(f"no file at {path}")
    try:
        project, report, _ = read_kwl(Path(path).read_bytes(), world)
    except OSError as e:
        sys.exit(f"{path} cannot be read: {e.strerror}")
    except ValueError as e:
        sys.exit(f"in {path}, {e}")
    return project, report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--template", metavar="PACK#i", help="print the project of a shipped level")
    ap.add_argument("--from-json", metavar="FILE", help="a project to write as the game's bytes")
    ap.add_argument("--kwl", metavar="OUT", help="where --from-json writes")
    ap.add_argument("--from-kwl", metavar="FILE", help="a level file to read as a project")
    ap.add_argument("--json", action="store_true", help="print the project --from-kwl reads")
    ap.add_argument("--world", default=WORLDS[0], help="the world a level file is given")
    ap.add_argument("--digests", action="store_true", help=f"write {DIGESTS.relative_to(ROOT)}")
    ap.add_argument("--deflate-vectors", action="store_true",
                    help=f"rewrite the streams of {VECTORS.relative_to(ROOT)} from its inputs")
    ap.add_argument("--hostile", action="store_true",
                    help=f"rewrite what the readers give for the documents of {HOSTILE.relative_to(ROOT)}")
    ap.add_argument("--check", action="store_true", help="hold the rebuild of every disc level to the disc")
    ap.add_argument("--release", choices=list(RELEASES), default=None,
                    help="the release whose tables --check holds the disc to; defaults to the one its boot line names")
    ap.add_argument("--disc", default=None,
                    help="raw PS1 image; defaults to $KULA_DISC, or with --release to that release's own variable")
    args = ap.parse_args()

    if args.template:
        try:
            print(json.dumps(template(json.loads(DATA.read_text()), args.template), indent=1))
        except KeyError:
            sys.exit(f"no shipped level is {args.template}; name one like /HIRO/HIRO.PAK#0")
    elif args.from_json:
        if not args.kwl:
            sys.exit("--from-json needs --kwl OUT")
        out = output_at(args.kwl, "--kwl")
        project, report = project_at(args.from_json)
        crowded = record_overflow(project)
        if crowded:
            sys.exit(f"{args.from_json} has {crowded}")
        for line in report:
            print(line, file=sys.stderr)
        hides = json.loads(OBJECTS.read_text())["skins"]["hides"]
        for finding in validate(project, hides):
            print(describe(finding), file=sys.stderr)
        try:
            blob = canonical(project)
            out.write_bytes(blob)
        except ValueError as e:
            sys.exit(str(e))
        except OSError as e:
            sys.exit(f"{args.kwl} cannot be written: {e.strerror}")
        print(f"{len(blob)} bytes -> {args.kwl}", file=sys.stderr)
    elif args.from_kwl:
        project, report = level_at(args.from_kwl, args.world)
        if args.json:
            print(json.dumps(project, indent=1))
        for line in report:
            print(line, file=sys.stderr)
    elif args.digests:
        DIGESTS.parent.mkdir(parents=True, exist_ok=True)
        text = render_digests(digests(json.loads(DATA.read_text())))
        DIGESTS.write_text(text)
        print(f"{text.count(chr(10))} lines -> {DIGESTS.relative_to(ROOT)}")
    elif args.deflate_vectors:
        fixture = deflate_vectors(json.loads(VECTORS.read_text()))
        VECTORS.write_text(render_vectors(fixture))
        print(f"{len(fixture['vectors'])} vectors at zlib {fixture['zlib']} -> {VECTORS.relative_to(ROOT)}")
    elif args.hostile:
        fixture = hostile(json.loads(HOSTILE.read_text()))
        HOSTILE.write_text(render_hostile(fixture))
        print(f"{len(fixture['cases'])} documents -> {HOSTILE.relative_to(ROOT)}")
    elif args.check:
        from kula_kwl_check import check, residuals
        disc = open_release(args.release, args.disc) if args.release else open_disc(args.disc)
        release = args.release or release_of(disc)
        if release is None:
            sys.exit(f"{disc.f.name} boots none of the three releases' executables; say whose tables hold it with --release")
        with disc:
            failures, classes, dropped = check(disc, release)
        unlisted = residuals(classes, dropped, release)
        for line in unlisted:
            print(f"not in the table: {line}", file=sys.stderr)
        if failures or unlisted:
            sys.exit(1)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
