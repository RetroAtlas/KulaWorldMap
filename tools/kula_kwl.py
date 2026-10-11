#!/usr/bin/env python3
"""A level as the game loads it, written from its fields and read back into them.

    python3 tools/kula_kwl.py --template /HIRO/HIRO.PAK#0           # a shipped level as a project
    python3 tools/kula_kwl.py --from-json spiral.kula.json --kwl spiral.kwl
    python3 tools/kula_kwl.py --from-kwl spiral.kwl --json [--world HIRO]
    python3 tools/kula_kwl.py --digests                              # tests/fixtures/kwl-digests.json
    python3 tools/kula_kwl.py --check                                # every disc level, needs $KULA_DISC

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
import hashlib
import json
import re
import struct
import sys
import zlib
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import THEMES, open_disc, packs
from kula_level import (
    BLOCK_KINDS,
    CELLS,
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
from kula_pak import Pak

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "map_data.json"
OBJECTS = ROOT / "public" / "objects.json"
DIGESTS = ROOT / "tests" / "fixtures" / "kwl-digests.json"

FORMAT = "kula-world-level"
VERSION = 1
WORLDS = THEMES
WORLD_SLOTS = 20
FINAL_SLOTS = 2

CRUMBLING_KIND = 6
VANISHING_KIND = 7
SPAN_KINDS = frozenset({PLATFORM_KIND, LASER_KIND})
COLOURS = 4
DEFAULT_TIME = 99
DEFAULT_SPEED = 30
DEFAULT_LENGTH = 2
LENGTHS = range(2, 4)
PHASES = range(0, 4)
DIM_AT_ONCE = (4, 5)
FIXED = 512          # the fixed-point unit a cell is scaled by in a record
PLATFORM_UNIT = 256  # the three words after a platform's position
INNER = range(1, SIDE - 1)
LATTICE = range(SIDE)

# The six directions as the game numbers them, which is also the face order.
DIRECTIONS = ((0, 0, -1), (1, 0, 0), (0, 1, 0), (0, -1, 0), (-1, 0, 0), (0, 0, 1))
AXIS_WORD = (1, 2, 5)    # a span's axis, named by the direction of its positive way

START = 30
START_ON_CLOCK = 29
EXIT = 7
HIDDEN_EXIT = 26
KEY = 31
STAR = 42
FRUIT = range(43, 48)
CAPTIVATORS = range(50, 57)
# f2 is a heading on these; a wandering ball or a corkscrew with 0 there heads as 1.
FACING_TYPES = frozenset({TELEPORTER, 28, START_ON_CLOCK, START, 50, 51, 52, 53, 56})
FACING_NEEDED = frozenset({TELEPORTER, 28, START_ON_CLOCK, START, 50, 51, 52})
VARIANT_TYPES = frozenset({TELEPORTER, SWITCH, 11, 36, 37, 56})
VARIANTS = {TELEPORTER: range(COLOURS), SWITCH: range(COLOURS), 11: PHASES, 36: range(3), 37: range(3), 56: PHASES}
PICKUPS = (31, 32, 33, 34, 35, 36, 37, 38, 42, 43, 44, 45, 46, 47)
PLAIN_ONLY = frozenset({TELEPORTER, EXIT, SWITCH, HIDDEN_EXIT, 11})   # initialised on kind 0 alone
LIGHTS = frozenset({TELEPORTER, EXIT, SWITCH})                         # what casts a light when on
NUMBERED = frozenset({5, 7, 9, 10, 11, 12, 26, 28} | set(PICKUPS))      # what the loader numbers
PLAYED = frozenset({1, 2, 4, 5, 7, 8, 9, 10, 11, 12, 26, 28, 29, 30, 50, 51, 52, 53, 56} | set(PICKUPS))
# f4 by type; a teleporter or a switch takes its colour's state instead.
STATE_ON, STATE_OFF = 1, 2
STATE = {t: STATE_ON for t in (10, 11, 12, 28, *PICKUPS)}
STATE.update({EXIT: STATE_OFF, HIDDEN_EXIT: STATE_OFF})
# f9, f10 and f14 by type, the words the disc holds for it.
TRIO = {TELEPORTER: (256, 1, 30), EXIT: (500, 1, 30), HIDDEN_EXIT: (500, 1, 30), 10: (256, 3, 0),
        START_ON_CLOCK: (386, 1, -100), 36: (386, 1, -17), STAR: (416, 0, 100)}
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
        "vanishing": 64, "crumbling": 64, "captivators": 32}
LIGHT_LIST = 32
DISC_MAX = {"records": 76, "cells": 178, "objects": 81, "platforms": 4, "lasers": 12,
            "captivators": 12, "keys": 4, "lights": 19}
COUNTED_KINDS = frozenset({0, 1, 2, 4, CRUMBLING_KIND, VANISHING_KIND})

ERROR, WARNING = "error", "warning"
TIME_MAX = 99


def lattice_index(cell):
    x, y, z = cell
    return (x * SIDE + y) * SIDE + z


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


def level_key(pack, index):
    return f"{pack}#{index}"


# --- a project out of a level -------------------------------------------------

def _face_of(o):
    """One object of a map_data record as the project writes it."""
    t = o["type"]
    f2, f3 = o["f"][0], o["f"][1]
    out = {"type": t}
    if t in FACING_TYPES and f2 != 0:
        out["facing"] = f2
    if t in VARIANT_TYPES:
        out["variant"] = f3
    return out


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
            faces = {str(o["face"]): _face_of(o) for o in sorted(r["on"], key=lambda o: o["face"])}
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
            b["colour"] = r["colour"]
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
            found = [(r["colour"], STATE_ON if r["f"][1] == 1 else STATE_OFF)]
        elif r["kind"] < BLOCK_KINDS:
            found = [(o["f"][1], STATE_OFF if o["f"][2] == STATE_OFF else STATE_ON)
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
    project.update({
        "time": level["time"],
        "hidden": hidden,
        "invisibleFromAfar": flip,
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


def project_of_level(L, world=None, report=None):
    """The project a parsed level means, every word of the file in hand."""
    report = [] if report is None else report
    level = _level_dict(L.cells, L.records, L.trailer.f[4], world or L.theme or WORLDS[0], L.name, report)
    return project_of(level, report)


# --- the game's bytes out of a project ---------------------------------------

def _face_number(f):
    try:
        return int(f)
    except (TypeError, ValueError):
        return f


def _faces_of(b):
    """What stands on a block's faces, by face number, for a kind that carries any."""
    if b["kind"] >= BLOCK_KINDS:
        return {}
    return {_face_number(f): o for f, o in (b.get("faces") or {}).items() if o.get("type", 0) > 0}


def _carries(b):
    """Whether a block needs a record: a span, a payload kind, or a face with something on it."""
    return b["kind"] >= BLOCK_KINDS or bool(_faces_of(b))


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
        raise ValueError(f"the span from {cell} to {far} runs along no one axis")
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
        slots[0] = [kind, d, axis, 1, *lower, *upper] + [-1] * 6
        slots[1] = [0 if cell == lower else 1, b.get("length", DEFAULT_LENGTH),
                    b.get("speed", DEFAULT_SPEED), -1, FIRST_RECORD + k] + [-1] * 11
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
    else:
        raise ValueError(f"a block of kind {kind} cannot be written")
    words = [w for s in slots for w in s] + extras + list(cell)
    try:
        return struct.pack(f"<{WORDS}h", *words)
    except struct.error:
        raise ValueError(f"a word of the block at {cell} is outside the file's range") from None


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
    blocks = sorted(project["blocks"], key=lambda b: tuple(b["cell"]))
    seen = set()
    for b in blocks:
        cell = tuple(b["cell"])
        kind = b.get("kind")
        if kind not in range(UNPLACED_KIND):
            raise ValueError(f"kind {kind} is not a kind of block")
        if len(cell) != 3 or any(c not in LATTICE for c in cell):
            raise ValueError(f"cell {cell} is outside the lattice")
        if cell in seen:
            raise ValueError(f"two blocks on cell {cell}")
        seen.add(cell)
        for j in _faces_of(b):
            if j not in range(FACES):
                raise ValueError(f"face {j} is not one of the six")
        if kind in SPAN_KINDS and (not isinstance(b.get("far"), (list, tuple)) or len(b["far"]) != 3):
            raise ValueError(f"the span at {cell} needs a far end")
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

def read_kwl(blob, world=WORLDS[0]):
    """(project, report) for a level file by what the game accepts: the lattice
    decides where a record stands and which records exist, the file's length
    decides how many stretches it holds, and a trailer is made up where the file
    has none. Only a length that is not a level's raises."""
    report = []
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
            report.append(f"cell {cell} names record {k}, which is not a block; the cell is left empty")
            continue
        if k in named:
            report.append(f"cell {cell} names record {k}, which cell {named[k]} already names; the cell is left empty")
            continue
        named[k] = cell
        cells.append((*cell, v))
        r = records[k]
        if r.cell != cell:
            report.append(f"record {k} says it stands at {r.cell}; the lattice puts it at {cell}")
            r.x, r.y, r.z = cell

    kept, settings = [], []
    for k, r in enumerate(records):
        if r.kind == UNPLACED_KIND:
            settings.append(k)
        elif k in named:
            kept.append(k)
        else:
            report.append(f"record {k} of kind {r.kind} at {r.cell} is named by no cell; it is dropped")
    if len(settings) > 1:
        report.append(f"{len(settings)} settings records; the flags of all of them are taken")

    for k in kept:
        r = records[k]
        if r.kind in SPAN_KINDS:
            a, b = sorted(r.span)
            if r.cell not in (a, b):
                report.append(f"record {k} spans {a} to {b} and stands at {r.cell}; its lower end is now its cell")
                a = r.cell
            r.slots[0][4:10] = [*a, *b]
        if r.kind == PLATFORM_KIND:
            if r.length not in LENGTHS:
                report.append(f"the platform at {r.cell} is {r.length} blocks long")
            if r.speed != DEFAULT_SPEED:
                report.append(f"the platform at {r.cell} runs at {r.speed}")
        if r.kind == VANISHING_KIND and r.f[0] in DIM_AT_ONCE:
            report.append(f"the vanishing block at {r.cell} has phase {r.f[0]}, which dims at once")

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
    return project_of(level, report), report


# --- what the game would make of a project ------------------------------------

def _kinds_at(blocks):
    """The lattice as the loader leaves it before building faces: a beam's far end
    stands a plain block where the file has none."""
    kinds = {tuple(b["cell"]): b["kind"] for b in blocks}
    for b in blocks:
        if b["kind"] == LASER_KIND and "far" in b:
            kinds.setdefault(tuple(b["far"]), 0)
    return kinds


def _built(hides, kinds, cell, kind):
    """How many of a block's six faces the game builds: a face toward a kind the
    block's kind hides behind is not, unless the block's kind is one that is
    built unseen behind it. A laser's own cell hides as the plain block the
    loader has made of it."""
    own = hides["kinds"].get(str(kind), hides["other"])
    unseen = hides["unseen"] if str(kind) not in hides["kinds"] else ()
    n = 0
    for d in DIRECTIONS:
        theirs = kinds.get((cell[0] + d[0], cell[1] + d[1], cell[2] + d[2]))
        if theirs == LASER_KIND:
            theirs = 0
        if theirs is None or theirs not in own or theirs in unseen:
            n += 1
    return n


COUNTERS = ("records", "cells", "faces", "blocks", "objects", "platforms", "lasers",
            "vanishing", "crumbling", "captivators", "keys", "lights")


def counts(project, hides):
    """The counters the caps and the disc's maxima are read against."""
    blocks = project["blocks"]
    at = {tuple(b["cell"]): b for b in blocks}
    kinds = _kinds_at(blocks)
    n = Counter({what: 0 for what in COUNTERS})
    n["cells"] = len(blocks)
    for cell, kind in kinds.items():
        if not all(c in INNER for c in cell):
            continue
        if kind == PLATFORM_KIND:
            length = at[cell].get("length", DEFAULT_LENGTH)
            n["faces"] += FACES if length < 2 else 4 * length + 2
            continue
        built = _built(hides, kinds, cell, kind)
        n["faces"] += built
        if kind in COUNTED_KINDS and built:
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
    n["records"] += bool(project.get("hidden") or project.get("invisibleFromAfar"))
    return dict(n)


def plays_as(project):
    keyed = any(o["type"] == KEY for b in project["blocks"] for o in _faces_of(b).values())
    bonus = ("it has no key, so every block scores 50 the first time the ball rolls onto it, "
             "the level ends once every block has been rolled, and an exit stands open from the start")
    if project.get("hidden"):
        if keyed:
            return "Plays as a hidden level, with the glass ball on half-seen blocks."
        return f"Plays as a hidden bonus level, with the glass ball on half-seen blocks: {bonus}."
    return "Plays as an arcade level." if keyed else f"Plays as a bonus level: {bonus}."


def _slot_of(pack, index):
    """Whether a target names a slot of a world pack or a finals pack."""
    for w in WORLDS:
        if pack == f"/{w}/{w}.PAK" and index in range(WORLD_SLOTS):
            return True
        if pack == f"/{w}/{w}FI.PAK" and index in range(FINAL_SLOTS):
            return True
    return False


def validate(project, hides):
    """What the game would make of the project: (level, text, at) findings, `at`
    naming a cell and perhaps a face, errors first in the order found."""
    out = []

    def err(text, cell=None, face=None):
        out.append((ERROR, text, _at(cell, face)))

    def warn(text, cell=None, face=None):
        out.append((WARNING, text, _at(cell, face)))

    if project.get("world") not in WORLDS:
        err(f"the world '{project.get('world')}' is not one of the disc's ten")
    into = project.get("into")
    if into is not None:
        text = str(into)
        pack, _, index = text.rpartition("#")
        if not (re.fullmatch(r"[0-9]+", index) and _slot_of(pack, int(index))):
            err(f"the target '{text}' is not a slot of a world or a finals pack")
    time = project.get("time", DEFAULT_TIME)
    if time < 1:
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
    beams = _beam_cells(blocks)
    starts = []
    for b in blocks:
        cell, kind = tuple(b["cell"]), b["kind"]
        if kind not in range(UNPLACED_KIND):
            err(f"kind {kind} is not a kind of block", cell)
            continue
        faces = _faces_of(b)
        if kind >= BLOCK_KINDS and b.get("faces"):
            err("nothing stands on a platform's, laser's, crumbling or vanishing block's faces", cell)
        if kind == VANISHING_KIND:
            phase = b.get("phase", 0)
            if phase in DIM_AT_ONCE:
                warn(f"a phase of {phase} dims at once", cell)
            elif phase not in PHASES:
                err(f"a phase of {phase}", cell)
        if kind in SPAN_KINDS:
            _validate_span(b, at, kinds, err, warn)
        if kind == LASER_KIND and b.get("colour") not in range(COLOURS):
            err(f"a colour of {b.get('colour')}", cell)
        for j, o in sorted(faces.items(), key=lambda kv: (isinstance(kv[0], str), kv[0])):
            t = o["type"]
            if j not in range(FACES):
                err(f"face {j} is not one of the six", cell)
                continue
            if t not in PLAYED:
                err(f"type {t} is nothing the game plays", cell, j)
            if t in PLAIN_ONLY and kind != 0:
                err("a device works on a plain block only", cell, j)
            if t in FACING_NEEDED and o.get("facing") not in range(1, 5):
                err("a facing of 1 to 4 is needed", cell, j)
            elif t in FACING_TYPES and "facing" in o and o["facing"] not in range(1, 5):
                err("a facing of 1 to 4, or none", cell, j)
            if t in VARIANT_TYPES and o.get("variant", 0) not in VARIANTS[t]:
                err(f"a variant of {o.get('variant')}", cell, j)
            if t in (START, START_ON_CLOCK):
                starts.append((cell, j))
            if t == STAR:
                warn("the star is untested in play", cell, j)
            if t in FRUIT:
                warn("the game shows the player's next fruit, whichever is placed", cell, j)
            _validate_outlook(cell, j, kinds, beams, warn)
    if not starts:
        err("no start")
    elif len(starts) > 1:
        cell, j = starts[-1]
        warn(f"{len(starts)} starts; the game takes the one on face {j} of the block at {cell[0]},{cell[1]},{cell[2]}")

    _validate_circuits(project, blocks, warn)
    n = counts(project, hides)
    if n["keys"] and not any(o["type"] == EXIT for b in blocks for o in _faces_of(b).values()):
        warn("a key and no exit")
    for what, cap in CAPS.items():
        if n[what] > cap:
            err(f"{n[what]} {what}, over the {cap} the game has room for")
    if n["lights"] > LIGHT_LIST:
        warn(f"{n['lights']} devices that cast a light, over the {LIGHT_LIST} the game lights at once")
    for what, most in DISC_MAX.items():
        if n[what] > most:
            warn(f"{n[what]} {what}, more than any level on the disc")
    out.sort(key=lambda f: f[0] != ERROR)
    return out


def describe(finding):
    """One finding as a line: its level, where it is, and what it says."""
    level, text, at = finding
    where = ""
    if at:
        where = " at " + ",".join(map(str, at["cell"]))
        if "face" in at:
            where += f" face {at['face']}"
    return f"{level}{where}: {text}"


def _at(cell, face):
    if cell is None:
        return None
    where = {"cell": list(cell)}
    if face is not None:
        where["face"] = face
    return where


def _run(b):
    """The cells a span covers: a platform's from its lower end to its upper end
    plus its length, a laser's from end to end."""
    cell, far = tuple(b["cell"]), tuple(b["far"])
    axis = span_axis(cell, far)
    lower, upper = sorted((cell, far))
    extra = b.get("length", DEFAULT_LENGTH) - 1 if b["kind"] == PLATFORM_KIND else 0
    cells = []
    for t in range(lower[axis], upper[axis] + extra + 1):
        c = list(lower)
        c[axis] = t
        cells.append(tuple(c))
    return cells


def _validate_span(b, at, kinds, err, warn):
    cell = tuple(b["cell"])
    if "far" not in b:
        err("a span needs a far end", cell)
        return
    far = tuple(b["far"])
    if far == cell:
        err("the far end is the block's own cell", cell)
        return
    if direction(cell, far) is None:
        err("the far end is not along one axis from the block", cell)
        return
    if any(c not in INNER for c in far):
        err("the far end is past the edge", cell)
        return
    run = _run(b)
    if b["kind"] == PLATFORM_KIND:
        if b.get("length", DEFAULT_LENGTH) not in LENGTHS:
            warn(f"a platform {b.get('length')} blocks long", cell)
        if b.get("speed", DEFAULT_SPEED) != DEFAULT_SPEED:
            warn(f"a platform running at {b.get('speed')}", cell)
        for c in run:
            if c != cell and c in at:
                err(f"the platform's run crosses the block at {c[0]},{c[1]},{c[2]}", cell)
        return
    for c in run:
        other = at.get(c)
        if other is None or c == cell:
            continue
        if c == far:
            if other["kind"] == 0 and _faces_of(other):
                warn("the beam's end makes a bare plain block of the block there; what stands on it "
                     "still works but its faces paint plain", cell)
            elif other["kind"] not in (0, LASER_KIND):
                err("a beam ends on an empty cell, a plain block or another laser's block", cell)
        else:
            err(f"the beam crosses the block at {c[0]},{c[1]},{c[2]}", cell)


def _beam_cells(blocks):
    cells = set()
    for b in blocks:
        if b["kind"] == LASER_KIND and "far" in b and direction(tuple(b["cell"]), tuple(b["far"])) is not None:
            cells.update(_run(b)[1:-1])
    return cells


def _validate_outlook(cell, j, kinds, beams, warn):
    d = DIRECTIONS[j]
    beyond = (cell[0] + d[0], cell[1] + d[1], cell[2] + d[2])
    theirs = kinds.get(beyond)
    if theirs is None:
        if beyond in beams:
            warn("looks into a beam", cell, j)
        return
    if theirs == CRUMBLING_KIND:
        warn("looks into a crumbling block", cell, j)
    elif theirs == VANISHING_KIND:
        warn("looks into a vanishing block", cell, j)
    else:
        warn(f"looks into the block at {beyond[0]},{beyond[1]},{beyond[2]}", cell, j)


def _validate_circuits(project, blocks, warn):
    circuits = project.get("circuits") or {}
    members = {c: Counter() for c in range(COLOURS)}
    for b in blocks:
        if b["kind"] == LASER_KIND:
            if b.get("colour") in members:
                members[b["colour"]]["lasers"] += 1
        elif b["kind"] < BLOCK_KINDS:
            for o in _faces_of(b).values():
                colour = o.get("variant", 0)
                if o["type"] == TELEPORTER and colour in members:
                    members[colour]["teleporters"] += 1
                elif o["type"] == SWITCH and colour in members:
                    members[colour]["switches"] += 1
    for c, m in members.items():
        if circuits.get(str(c)) == "off" and not m["switches"] and (m["lasers"] or m["teleporters"]):
            warn(f"colour {c} starts off and has no switch to turn it on")
        if m["teleporters"] == 1:
            warn(f"the one teleporter of colour {c} leads to itself")
        if m["switches"] and not m["teleporters"] and not m["lasers"]:
            warn(f"the switches of colour {c} have nothing to switch")


# --- the checks that hold the writer to the data and the disc -----------------

def digests(data):
    """Per shipped level, the digest of its canonical file and of that file's deflate."""
    out = {}
    for level in data["levels"]:
        blob = canonical(project_of(level))
        z = zlib.compress(blob, 6)
        out[level_key(level["pack"], level["index"])] = {
            "deflate": hashlib.sha256(z).hexdigest(),
            "kwl": hashlib.sha256(blob).hexdigest(),
            "size": len(z),
        }
    return out


def render_digests(digests):
    return json.dumps(digests, indent=1, sort_keys=True) + "\n"


def template(data, key):
    """The project of a shipped level named by its pack and index, the pack as
    its path or as its stem."""
    pack, _, index = key.rpartition("#")
    for level in data["levels"]:
        stem = level["pack"].rsplit("/", 1)[-1].rsplit(".", 1)[0]
        if pack.upper() in (level["pack"].upper(), stem) and re.fullmatch(r"[0-9]+", index) and int(index) == level["index"]:
            return project_of(level)
    raise KeyError(key)


# The words the game never reads, by the research behind docs/editor.md, which
# the disc's own levels fill with an editor's leftovers.
F5_LEVELS = frozenset({"BONUS 30", "LEVEL 134", "LECEL 94", "FINAL 11", "FINAL 13"})
WORD_NAME = {0: "kind word", 1: "type", 13: "w13", 14: "f14", 15: "w15"}


def word_name(w):
    return WORD_NAME.get(w, f"f{w}")


def unread(kind, w, dslot, cslot, name):
    """Whether word w of a record of this kind is one the game never reads."""
    if w >= SLOT * FACES:
        return w <= 118 or kind == UNPLACED_KIND
    slot, sw = divmod(w, SLOT)
    if kind == UNPLACED_KIND:
        return not (slot == 0 and sw in (1, 2))
    if kind == TRAILER_KIND:
        return slot > 0 or 1 <= sw <= 5
    if sw in (13, 15) or (sw == 0 and slot >= 2):
        return True
    if kind == PLATFORM_KIND and slot == 1:
        return sw == 3 or sw >= 5
    if kind == PLATFORM_KIND and slot == 0:
        return sw >= 10
    if kind == CRUMBLING_KIND:
        return slot >= 1 or sw >= 5
    if kind == VANISHING_KIND:
        return slot >= 1 or sw == 1 or sw >= 3
    if kind == LASER_KIND:
        return slot >= 2
    typ = dslot[1]
    if typ == 0 and cslot[1] == 0:
        return sw not in (1, 4)
    if sw in (9, 10, 14):
        return True
    if sw in (6, 7) and typ not in (TELEPORTER, SWITCH):
        return True
    return sw == 5 and name in F5_LEVELS


def _at_of(L, word):
    """A link word as the cell and face it names, so an index shift reads as equal."""
    at = link(word)
    if at is None:
        return None
    if at[0] >= len(L.records):
        return ("past the table", word)
    return (L.records[at[0]].cell, at[1])


def _value(L, k, kind, w, word):
    """A word as it compares across two levels: a link as what it names, a
    record's own lattice value as "own", anything else as itself."""
    if w >= SLOT * FACES:
        return word
    slot, sw = divmod(w, SLOT)
    if kind < BLOCK_KINDS and sw in (NEXT_WORD, LINK_WORD) and L.records[k].slots[slot][1] in (TELEPORTER, SWITCH):
        return _at_of(L, word)
    if kind == LASER_KIND and slot == 1 and sw == LINK_WORD:
        return _at_of(L, word)
    if kind in SPAN_KINDS and slot == 1 and sw == 4:
        return "own" if word == FIRST_RECORD + k else word
    return word


def _objects(L, k):
    r = L.records[k]
    out = {}
    for o in r.objects:
        o_ = {"type": o.type}
        if o.type in FACING_TYPES:
            o_["facing"] = o.f[0]
        if o.type in VARIANT_TYPES:
            o_["variant"] = o.f[1]
        o_["state"] = o.f[2]
        out[o.face] = o_
    return out


def _circuits(L):
    """Every switch's list and every teleporter's destination, by cell and face."""
    lists, leads = {}, {}
    for k, r in enumerate(L.records):
        for o in r.objects:
            if o.type == SWITCH:
                lists[(r.cell, o.face)] = frozenset(_at_of(L, at[0] * 16 + at[1]) for at in L.circuit(k, o.face))
            elif o.type == TELEPORTER:
                leads[(r.cell, o.face)] = _at_of(L, r.slots[o.face][LINK_WORD])
    return lists, leads


def compare(L, C):
    """What differs in play between a disc level and its canonical rebuild: the
    blocks, the records both have, their objects as the format reads them, the
    spans, the circuits, the time and the settings."""
    bad = []
    if _kind_at(L) != _kind_at(C):
        bad.append("the blocks differ")
    disc = {r.cell: k for k, r in enumerate(L.records) if r.kind != UNPLACED_KIND}
    canon = {r.cell: k for k, r in enumerate(C.records) if r.kind != UNPLACED_KIND}
    for cell in disc.keys() & canon.keys():
        a, b = L.records[disc[cell]], C.records[canon[cell]]
        if a.kind != b.kind:
            bad.append(f"record at {cell} is kind {a.kind} on the disc and {b.kind} rebuilt")
        elif a.kind < BLOCK_KINDS and _objects(L, disc[cell]) != _objects(C, canon[cell]):
            bad.append(f"the objects at {cell} differ")
        elif a.kind in SPAN_KINDS and (sorted(a.span), a.colour, a.f[1], a.length, a.speed) != \
                (sorted(b.span), b.colour, b.f[1], b.length, b.speed):
            bad.append(f"the span at {cell} differs")
    if _circuits(L) != _circuits(C):
        bad.append("the circuits differ")
    if L.trailer.f[4] != C.trailer.f[4]:
        bad.append("the time differs")
    if _flags(L) != _flags(C):
        bad.append("the settings differ")
    return bad


def _kind_at(L):
    return {c[:3]: c[3] if c[3] < FIRST_RECORD else L.records[c[3] - FIRST_RECORD].kind for c in L.cells}


def _flags(L):
    """The two settings a level's kind 9 records set between them."""
    settings = [r for r in L.records if r.kind == UNPLACED_KIND]
    return any(r.type == 1 for r in settings), any(r.f[0] == 1 for r in settings)


def diff_words(L, C, classes, examples):
    """Count every word that differs outside the unread mask, by its class."""
    disc = {r.cell: k for k, r in enumerate(L.records) if r.kind != UNPLACED_KIND}
    canon = {r.cell: k for k, r in enumerate(C.records) if r.kind != UNPLACED_KIND}
    pairs = [(disc[c], canon[c]) for c in disc if c in canon]
    pairs += [(k, j) for k, r in enumerate(L.records) if r.kind == UNPLACED_KIND
              for j, s in enumerate(C.records) if s.kind == UNPLACED_KIND]
    pairs.append((L.count, C.count))
    for kd, kc in pairs:
        a = L.records[kd] if kd < L.count else L.trailer
        b = C.records[kc] if kc < C.count else C.trailer
        da = struct.unpack_from(f"<{WORDS}h", L.blob, GRID_BYTES + HEAD + RECORD * kd)
        db = struct.unpack_from(f"<{WORDS}h", C.blob, GRID_BYTES + HEAD + RECORD * kc)
        for w in range(WORDS - 3):
            slot, sw = divmod(w, SLOT)
            dslot = a.slots[slot] if w < SLOT * FACES else None
            cslot = b.slots[slot] if w < SLOT * FACES else None
            if unread(a.kind, w, dslot, cslot, L.name):
                continue
            x = _value(L, kd, a.kind, w, da[w]) if kd < L.count else da[w]
            y = _value(C, kc, b.kind, w, db[w]) if kc < C.count else db[w]
            if x == y:
                continue
            if w >= SLOT * FACES:
                what = f"kind {a.kind} record word {w}"
            elif a.kind < BLOCK_KINDS and dslot[1] > 0:
                what = f"kind 0..4 object type {dslot[1]} {word_name(sw)}"
            elif a.kind < BLOCK_KINDS:
                what = f"kind 0..4 bare slot {word_name(sw)}"
            else:
                what = f"kind {a.kind} slot {slot} {word_name(sw)}"
            classes[what] += 1
            examples.setdefault(what, []).append(f"{L.name} record {kd} at {a.cell} slot {slot} word {sw}: {da[w]} on the disc, {db[w]} rebuilt")


def check(disc, out=print):
    """Rebuild every level of the disc from its fields and hold the result to the
    disc: in play, and word for word outside the unread mask. Returns (semantic
    failures, residual classes)."""
    classes, examples, failures = Counter(), {}, []
    levels = left_out = folded_levels = 0
    for theme, path in packs(disc):
        pak = Pak(disc.read_file(path), path)
        for i in range(len(pak)):
            L = Level(pak.level(i), pak.name(i), theme)
            report = []
            blob = canonical(project_of_level(L, report=report))
            C = Level(blob, L.name, theme)
            levels += 1
            failures += [f"{L.name}: {m}" for m in C.verify()]
            failures += [f"{L.name}: {m}" for m in compare(L, C)]
            settings = [r for r in L.records if r.kind == UNPLACED_KIND]
            if settings and not any(r.type == 1 or r.f[0] == 1 for r in settings):
                left_out += 1
            folded_levels += any(m.startswith("folded") for m in report)
            diff_words(L, C, classes, examples)
    out(f"{levels} levels rebuilt; every rebuild verifies and plays as the disc's"
        if not failures else f"{levels} levels rebuilt; {len(failures)} differ in play:")
    for f in failures:
        out(f"  {f}")
    out(f"{left_out} levels leave out a settings record with no flag set, "
        f"{folded_levels} fold a record carrying nothing into a plain block")
    if not classes:
        out("no word differs outside the unread mask")
    for what, n in sorted(classes.items(), key=lambda kv: -kv[1]):
        out(f"{n:5} x {what}")
        for e in examples[what][:3]:
            out(f"        {e}")
    return failures, classes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--template", metavar="PACK#i", help="print the project of a shipped level")
    ap.add_argument("--from-json", metavar="FILE", help="a project to write as the game's bytes")
    ap.add_argument("--kwl", metavar="OUT", help="where --from-json writes")
    ap.add_argument("--from-kwl", metavar="FILE", help="a level file to read as a project")
    ap.add_argument("--json", action="store_true", help="print the project --from-kwl reads")
    ap.add_argument("--world", default=WORLDS[0], help="the world a level file is given")
    ap.add_argument("--digests", action="store_true", help=f"write {DIGESTS.relative_to(ROOT)}")
    ap.add_argument("--check", action="store_true", help="hold the rebuild of every disc level to the disc")
    ap.add_argument("--disc", default=None, help="raw PS1 image; defaults to $KULA_DISC")
    args = ap.parse_args()

    if args.template:
        try:
            print(json.dumps(template(json.loads(DATA.read_text()), args.template), indent=1))
        except KeyError:
            sys.exit(f"no shipped level is {args.template}; name one like /HIRO/HIRO.PAK#0")
    elif args.from_json:
        if not args.kwl:
            sys.exit("--from-json needs --kwl OUT")
        project = json.loads(Path(args.from_json).read_text())
        if project.get("format") != FORMAT:
            sys.exit(f"{args.from_json} is not a {FORMAT} file")
        hides = json.loads(OBJECTS.read_text())["skins"]["hides"]
        for finding in validate(project, hides):
            print(describe(finding), file=sys.stderr)
        try:
            blob = canonical(project)
        except ValueError as e:
            sys.exit(str(e))
        Path(args.kwl).write_bytes(blob)
        print(f"{len(blob)} bytes -> {args.kwl}")
    elif args.from_kwl:
        try:
            project, report = read_kwl(Path(args.from_kwl).read_bytes(), args.world)
        except ValueError as e:
            sys.exit(str(e))
        if args.json:
            print(json.dumps(project, indent=1))
        for line in report:
            print(line, file=sys.stderr)
    elif args.digests:
        DIGESTS.parent.mkdir(parents=True, exist_ok=True)
        text = render_digests(digests(json.loads(DATA.read_text())))
        DIGESTS.write_text(text)
        print(f"{text.count(chr(10))} lines -> {DIGESTS.relative_to(ROOT)}")
    elif args.check:
        with open_disc(args.disc) as disc:
            failures, classes = check(disc)
        if failures:
            sys.exit(1)
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
