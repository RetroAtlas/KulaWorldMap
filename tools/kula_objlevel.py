#!/usr/bin/env python3
"""The sheet for naming objects by walking the game's own catalogue.

OBJ LEVEL ships in nine of the ten worlds, identical every time, and the game
never takes you there. It is a flat floor with one or a few of nearly every
object kind standing on it, which makes it the one place where every kind can
be identified in a single sitting.

This writes a floor plan with every object numbered, and a table to fill in as
you walk it. Load the level in an emulator with a save-state hack or a level
warp, walk the numbers, and write down what each one looks like.

    python3 tools/kula_objlevel.py                 # out/obj-level.md
    python3 tools/kula_objlevel.py --level "LEVEL 1"

The catalogue needs a level warp to reach. The early numbered levels do not,
and between them they place the objects the game uses most, so `--level` writes
the same sheet for any level you can simply play to.
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from kula_level import FIELD_WORD

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out" / "obj-level.md"
DATA = ROOT / "public" / "map_data.json"
NAMES = ROOT / "public" / "annotations.json"
FACE = ["-z", "+x", "+y", "-y", "-x", "+z"]


def serpentine(objects):
    """Number the objects along a walk that does not double back."""
    rows = {}
    for o in objects:
        rows.setdefault(o["y"], []).append(o)
    out = []
    for i, y in enumerate(sorted(rows)):
        row = sorted(rows[y], key=lambda o: o["x"], reverse=bool(i % 2))
        out += row
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=None)
    ap.add_argument("--level", default="OBJ LEVEL",
                    help="the level to write a sheet for; default is the catalogue")
    args = ap.parse_args()
    data = json.loads(DATA.read_text())

    named = [l for l in data["levels"] if l["name"] == args.level]
    if not named:
        sys.exit(f"no level called {args.level!r} in map_data.json")
    level = named[0]
    catalogue = args.level == "OBJ LEVEL"

    def things(l):
        """What stands in a level, one entry a marker, with the key its name goes under."""
        out = []
        for r in l["records"]:
            if "type" in r or r["kind"] == 9:
                out.append({"x": r["x"], "y": r["y"], "z": r["z"], "key": f"kind {r['kind']}",
                            "f": r.get("f", []), "face": None})
            for o in r["on"]:
                out.append({"x": r["x"], "y": r["y"], "z": r["z"], "key": f"type {o['type']}",
                            "f": o["f"], "face": FACE[o["face"]]})
        return out

    game = Counter()
    for l in data["levels"]:
        if l["name"] == "OBJ LEVEL":
            continue
        for o in things(l):
            game[o["key"]] += 1

    cells = level["cells"]
    floor = {(cells[i], cells[i + 1]): cells[i + 2] for i in range(0, len(cells), 4)}
    plane = Counter(floor.values()).most_common(1)[0][0]
    # The start is an object like any other, known by its curated name, so it is
    # walked and numbered rather than marked apart; the sheet says which it is.
    ann = json.loads(NAMES.read_text())
    named = ann.get("types", {})
    start_key = next((f"type {t}" for t, v in named.items() if v.get("name") == "Start"), None)

    def map_says(o):
        """The curated name the map already gives the thing, variant included, or nothing."""
        what, num = o["key"].split()
        e = (ann.get("types") if what == "type" else ann.get("kinds", {})).get(num, {})
        if e.get("by") and what == "type":
            v = e.get("variants", {}).get(str(o["f"][int(e["by"][1:]) - FIELD_WORD]), {})
            if v.get("name"):
                return v["name"]
        return e.get("name", "")
    walk = serpentine(things(level))
    start = next(((o["x"], o["y"], o["z"]) for o in walk if o["key"] == start_key), None)
    at = {}
    for i, o in enumerate(walk):
        at.setdefault((o["x"], o["y"]), i + 1)

    xs = [x for x, _ in floor] + [o["x"] for o in walk]
    ys = [y for _, y in floor] + [o["y"] for o in walk]
    plan = []
    for y in range(min(ys), max(ys) + 1):
        row = []
        for x in range(min(xs), max(xs) + 1):
            if (x, y) in at:
                row.append(f"{at[(x, y)]:2d} ")
            elif (x, y) in floor:
                row.append(" . ")
            else:
                row.append("   ")
        plan.append("".join(row).rstrip())
    lines = [
        f"# Naming Kula World's objects: {level['name']}\n\n",
        (f"`OBJ LEVEL` is {level['pack']} index {level['index']}, and eight more copies of it "
         "sit in the other worlds' packs. The game never takes you there, so reaching it "
         "needs a level warp.\n\n"
         if catalogue else
         f"{level['name']} is {level['pack']} index {level['index']}, in {level['theme']}. "
         "You can reach it by playing.\n\n"),
        f"The floor is one plane at z={plane}, {max(xs) - min(xs) + 1} by ",
        f"{max(ys) - min(ys) + 1} blocks, carrying {len(walk)} objects of ",
        f"{len({o['key'] for o in walk})} distinct types. ",
        (f"You start at ({start[0]},{start[1]},{start[2]}), number {at[start[:2]]} on the plan.\n\n"
         if start else "Where the ball starts is not among the objects.\n\n"),
        "Numbers run left to right, then right to left on the next row, so walking them ",
        "in order never doubles back. Columns are x, rows are y, both increasing. A block ",
        "carrying more than one object shows its first number; the table lists them all.\n\n",
        "```\n", "\n".join(plan), "\n```\n\n",
        "## What to fill in\n\n",
        "`elsewhere` is how many times the type is placed in the rest of the game, which is ",
        "how much a name is worth. A type that appears only here is marked `only here`: it is ",
        "cut content or a developer marker, and naming it is optional.\n\n",
        "`map says` is the name the map already gives the thing; the last ",
        "column is for what the game shows, so that the two can be scored against each other. ",
        "Names go into `public/annotations.json` under `types`, keyed by the type number, ",
        "or under `kinds` for a record that is its own thing.\n\n",
        "| # | cell | face | type | elsewhere | fields | map says | what it is |\n",
        "| --- | --- | --- | --- | --- | --- | --- | --- |\n",
    ]
    for i, o in enumerate(walk, 1):
        n = game[o["key"]]
        where = "only here" if not n else f"{n}"
        fields = ", ".join(f"f{j + FIELD_WORD}={v}" for j, v in enumerate(o["f"]) if v != -1) or "none set"
        lines.append(f"| {i} | {o['x']},{o['y']},{o['z']} | {o['face'] or ''} | {o['key']} | "
                     f"{where} | {fields} | {map_says(o)} | |\n")

    seen = {o["key"] for o in walk}
    missing = sorted(k for k in game if k not in seen and game[k] >= 5)
    if missing:
        lines.append("\n## Not here\n\n")
        lines.append(
            "Types placed five or more times in the game that OBJ LEVEL does not carry, so "
            "they have to be named from a real level:\n\n"
            if catalogue else
            f"Types placed five or more times in the game that {level['name']} does not "
            "carry, so another level has to name them:\n\n")
        for k in sorted(missing, key=lambda k: -game[k]):
            lines.append(f"- `{k}` — {game[k]} placed\n")

    path = Path(args.out) if args.out else (
        OUT if catalogue else OUT.with_name("naming-" + level["name"].lower().replace(" ", "-") + ".md"))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(lines))
    print(f"{path} written: {len(walk)} objects, "
          f"{len(seen)} types, {len(missing)} common ones not covered")


if __name__ == "__main__":
    main()
