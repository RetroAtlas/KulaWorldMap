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

from kula_level import FIELD_WORD

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "map_data.json"
NAMES = ROOT / "public" / "annotations.json"
BONUS_SLOTS = (15, 16, 17)
BLOCK_POINTS = 50
INVISIBLE_KIND = 3


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


def tallied(level, first_record):
    """The blocks a bonus level counts: rolling over an invisible one scores nothing."""
    n = 0
    for v in level["cells"][3::4]:
        kind = v if v < first_record else level["records"][v - first_record]["kind"]
        n += kind != INVISIBLE_KIND
    return n


def level_points(level, kinds, types, first_record):
    total = 0
    for r in level["records"]:
        total += kinds.get(r["kind"], 0)
        for o in r["on"]:
            total += types.get(o["type"], lambda o: 0)(o)
    if level["index"] in BONUS_SLOTS:
        total += BLOCK_POINTS * tallied(level, first_record)
    return total


def main():
    data = json.loads(DATA.read_text())
    kinds, types, scores = points_of(json.loads(NAMES.read_text()))

    bad = []
    for l in data["levels"]:
        total = level_points(l, kinds, types, data["firstRecord"])
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
