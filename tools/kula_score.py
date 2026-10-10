#!/usr/bin/env python3
"""What collecting everything on each level scores.

The points a type is worth live in annotations.json, not on the disc, and so
does a level's best score where the disc holds more than can be collected.
This prints the disc's total per level beside the curated score, and fails
where a curated score is not below the total it stands for.

    python3 tools/kula_score.py
"""
import json
import sys
from pathlib import Path

from kula_level import BLOCK_KINDS, FIELD_WORD

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "map_data.json"
NAMES = ROOT / "public" / "annotations.json"
OBJECTS = ROOT / "public" / "objects.json"
BLOCK_POINTS = 50
# The kinds the game's walk over the inner lattice builds and counts.
COUNTED_KINDS = frozenset({0, 1, 2, 4, 6, 7})
INNER = range(1, 33)
LASER_KIND = 8
NORMALS = ((0, 0, -1), (1, 0, 0), (0, 1, 0), (0, -1, 0), (-1, 0, 0), (0, 0, 1))


def points_of(ann):
    """(kind points, type points, curated level scores): a type's points may
    depend on the value of one of its fields."""
    kinds = {int(k): v.get("points", 0) for k, v in ann["kinds"].items()}
    scores = {k: v["score"] for k, v in ann.get("levels", {}).items() if "score" in v}
    types = {}
    for t, e in ann["types"].items():
        base = e.get("points", 0)
        if e.get("by"):
            idx = int(e["by"][1:]) - FIELD_WORD
            variants = {int(v): x.get("points", base) for v, x in e.get("variants", {}).items()}
            types[int(t)] = lambda o, idx=idx, variants=variants, base=base: variants.get(o["f"][idx], base)
        else:
            types[int(t)] = lambda o, base=base: base
    return kinds, types, scores


def plays_bonus(level, skins):
    """Whether the level plays by the bonus rules: no key on a block the ball
    can roll on, outside the Simon rooms."""
    keys = skins["keys"]
    keyed = any(o["type"] == keys["type"]
                for r in level["records"] if r["kind"] < keys["kinds"] for o in r["on"])
    return not keyed and level.get("pack") != skins["copycat"]


def _built(hides, kinds_at, cell, kind):
    """Whether the game builds a face of the block: one of its six looks at no
    block its kind hides behind, or at one it is built unseen behind. A laser's
    own cell hides as the plain block the loader has made of it."""
    hidden = hides["kinds"].get(str(kind), hides["other"])
    unseen = hides["unseen"] if str(kind) not in hides["kinds"] else ()
    for n in NORMALS:
        theirs = kinds_at.get((cell[0] + n[0], cell[1] + n[1], cell[2] + n[2]))
        if theirs == LASER_KIND:
            theirs = 0
        if theirs is None or theirs not in hidden or theirs in unseen:
            return True
    return False


def tallied(level, first_record, hides):
    """The blocks a level with no key counts: the kinds the game's walk over the
    inner lattice builds, with at least one face built. A beam's end stands a
    plain block on an empty cell before the faces are built."""
    cells = level["cells"]
    kinds_at = {}
    for i in range(0, len(cells), 4):
        v = cells[i + 3]
        kinds_at[tuple(cells[i:i + 3])] = v if v < first_record else level["records"][v - first_record]["kind"]
    for r in level["records"]:
        if r["kind"] == LASER_KIND:
            for end in (r["f"][2:5], r["f"][5:8]):
                kinds_at.setdefault(tuple(end), 0)
    n = 0
    for cell, kind in kinds_at.items():
        if kind in COUNTED_KINDS and all(c in INNER for c in cell) and _built(hides, kinds_at, cell, kind):
            n += 1
    return n


def level_points(level, kinds, types, first_record, skins):
    total = 0
    for r in level["records"]:
        if r["kind"] >= BLOCK_KINDS:
            total += kinds.get(r["kind"], 0)
        for o in r["on"]:
            total += types.get(o["type"], lambda o: 0)(o)
    if plays_bonus(level, skins):
        total += BLOCK_POINTS * tallied(level, first_record, skins["hides"])
    return total


def main():
    data = json.loads(DATA.read_text())
    kinds, types, scores = points_of(json.loads(NAMES.read_text()))
    skins = json.loads(OBJECTS.read_text())["skins"]

    bad = []
    for l in data["levels"]:
        total = level_points(l, kinds, types, data["firstRecord"], skins)
        score = scores.get(f"{l['pack']}#{l['index']}")
        line = f"{l['theme']:7} {l['name']:10} {total:6}"
        if score is not None:
            line += f"   curated {score:6}   {score - total:+d}"
            if score >= total:
                bad.append(f"{l['name']}: the curated {score} is not below the disc's {total}")
        print(line)
    if bad:
        sys.exit("\n".join(bad))


if __name__ == "__main__":
    main()
