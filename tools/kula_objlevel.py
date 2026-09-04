#!/usr/bin/env python3
"""The sheet for naming objects by walking the game's own catalogue.

OBJ LEVEL ships in nine of the ten worlds, identical every time, and the game
never takes you there. It is a flat floor with one or a few of nearly every
object kind standing on it, which makes it the one place where every kind can
be identified in a single sitting.

This writes a floor plan with every object numbered, and a table to fill in as
you walk it. Load the level in an emulator with a save-state hack or a level
warp, walk the numbers, and write down what each one looks like.

    python3 tools/kula_objlevel.py            # out/obj-level.md
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out" / "obj-level.md"
DATA = ROOT / "public" / "map_data.json"


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
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    data = json.loads(DATA.read_text())

    catalogues = [l for l in data["levels"] if l["name"] == "OBJ LEVEL"]
    if not catalogues:
        sys.exit("no OBJ LEVEL in map_data.json; run tools/kula_build.py first")
    level = catalogues[0]

    game = Counter()
    for l in data["levels"]:
        if l["name"] == "OBJ LEVEL":
            continue
        for o in l["objects"]:
            game[(o["kind"], o["type"])] += 1

    cells = level["cells"]
    floor = {(cells[i], cells[i + 1]): cells[i + 2] for i in range(0, len(cells), 4)}
    plane = Counter(floor.values()).most_common(1)[0][0]
    walk = serpentine(level["objects"])
    at = {(o["x"], o["y"]): i + 1 for i, o in enumerate(walk)}
    start = level["start"]["at"]

    xs = [x for x, _ in floor] + [o["x"] for o in walk]
    ys = [y for _, y in floor] + [o["y"] for o in walk]
    plan = []
    for y in range(min(ys), max(ys) + 1):
        row = []
        for x in range(min(xs), max(xs) + 1):
            if (x, y) in at:
                row.append(f"{at[(x, y)]:2d} ")
            elif (x, y) == (start[0], start[1]):
                row.append(" S ")
            elif (x, y) in floor:
                row.append(" . ")
            else:
                row.append("   ")
        plan.append("".join(row).rstrip())
    lines = [
        "# Naming Kula World's objects by walking OBJ LEVEL\n\n",
        f"`OBJ LEVEL` is {level['pack']} index {level['index']}, and eight more copies of it ",
        "sit in the other worlds' packs. The game never takes you there.\n\n",
        f"The floor is one plane at z={plane}, {max(xs) - min(xs) + 1} by ",
        f"{max(ys) - min(ys) + 1} blocks, carrying {len(walk)} objects of ",
        f"{len({(o['kind'], o['type']) for o in walk})} "
        "distinct kind/type pairs. ",
        f"You start at ({start[0]},{start[1]},{start[2]}), marked `S` on the plan.\n\n",
        "Numbers run left to right, then right to left on the next row, so walking them ",
        "in order never doubles back. Columns are x, rows are y, both increasing.\n\n",
        "```\n", "\n".join(plan), "\n```\n\n",
        "## What to fill in\n\n",
        "`elsewhere` is how many times the kind is placed in the rest of the game, which is ",
        "how much a name is worth. A kind that appears only here is marked `only here`: it is ",
        "cut content or a developer marker, and naming it is optional.\n\n",
        "Write names into `public/annotations.json` under `types`, keyed `kind/type`.\n\n",
        "| # | cell | kind/type | elsewhere | fields | what it is |\n",
        "| --- | --- | --- | --- | --- | --- |\n",
    ]
    for i, o in enumerate(walk, 1):
        key = (o["kind"], o["type"])
        n = game[key]
        where = "only here" if not n else f"{n}"
        fields = ", ".join(f"f{j + 5}={v}" for j, v in enumerate(o["f"]) if v != -1) or "none set"
        lines.append(f"| {i} | {o['x']},{o['y']},{o['z']} | {o['kind']}/{o['type']} | "
                     f"{where} | {fields} | |\n")

    seen = {(o["kind"], o["type"]) for o in walk}
    missing = sorted(k for k in game if k not in seen and game[k] >= 5)
    if missing:
        lines.append("\n## Not in the catalogue\n\n")
        lines.append("Kinds placed five or more times in the game that OBJ LEVEL does not "
                     "carry, so they have to be named from a real level:\n\n")
        for k in sorted(missing, key=lambda k: -game[k]):
            lines.append(f"- `{k[0]}/{k[1]}` — {game[k]} placed\n")

    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(lines))
    print(f"{path} written: {len(walk)} objects, "
          f"{len(seen)} kind/type pairs, {len(missing)} common ones not covered")


if __name__ == "__main__":
    main()
