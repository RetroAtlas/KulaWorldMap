#!/usr/bin/env python3
"""What collecting everything on each level scores, and the check behind the names.

The points a type is worth live in annotations.json, not on the disc: they
were read off the per-level maximum scores in Syonyx's Roll Away walkthrough
(GameFAQs, 2006), and the names rest on the disc reproducing those scores.
This prints the disc's total per level and, given the walkthrough as a text
file, scores it against every maximum the walkthrough states.

    python3 tools/kula_score.py
    python3 tools/kula_score.py --guide walkthrough.txt

The walkthrough is not in the repo; save GameFAQs' text of it and pass
the path.

Where the disc holds more than a level lets you collect, an unreachable coin
here, a crumbling block that cannot be broken there, annotations.json curates
the walkthrough's maximum as the level's `score` with a note saying what is
out of reach. The check then holds both ends: a level without a curated score
must reproduce the walkthrough exactly, and one with it must match the
walkthrough and fall short of the disc, so a curated number can neither drift
from its source nor outlive its reason.
"""
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "map_data.json"
NAMES = ROOT / "public" / "annotations.json"
BONUS_SLOTS = (15, 16, 17)
BLOCK_POINTS = 50
INVISIBLE_KIND = 3
FIELD_BASE = 5


def points_of(ann):
    """(kind points, type points, curated level scores): a type's points may
    depend on the value of one of its fields."""
    kinds = {int(k): v.get("points", 0) for k, v in ann["kinds"].items()}
    scores = {k: v["score"] for k, v in ann.get("levels", {}).items() if "score" in v}
    types = {}
    for t, e in ann["types"].items():
        base = e.get("points", 0)
        if e.get("by"):
            idx = int(e["by"][1:]) - FIELD_BASE
            variants = {int(v): x.get("points", base) for v, x in e.get("variants", {}).items()}
            types[int(t)] = lambda o, idx=idx, variants=variants, base=base: variants.get(o["f"][idx], base)
        else:
            types[int(t)] = lambda o, base=base: base
    return kinds, types, scores


def tallied(level, first_record):
    """The blocks a bonus level counts: rolling over an invisible one scores nothing."""
    kind_at = {(r["x"], r["y"], r["z"]): r["kind"] for r in level["records"]}
    n = 0
    for i in range(0, len(level["cells"]), 4):
        x, y, z, v = level["cells"][i:i + 4]
        kind = v if v < first_record else kind_at[(x, y, z)]
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


def guide_scores(text):
    """The walkthrough's maximum per level, keyed by its own numbering."""
    out, cur = {}, None
    for line in text.splitlines():
        m = re.match(r"^(LEVEL|BONUS LEVEL|HIDDEN LEVEL|THE FINAL - LEVEL) (\d+)", line.strip())
        if m:
            word, n = m.group(1), int(m.group(2))
            cur = {"LEVEL": f"LEVEL {n}", "BONUS LEVEL": f"BONUS {n}", "HIDDEN LEVEL": f"HIDDEN {n}",
                   "THE FINAL - LEVEL": f"FINAL {n - 150}"}[word]
        m = re.match(r"^MAX SC[OR]+E:?\s*(\d+)", line.strip(), re.I)
        if m and cur:
            out[cur] = int(m.group(1))
    return out


def played_as(level, worlds):
    """The number the walkthrough files the level under.

    The game numbers the arcade and Final levels itself, which the build ships
    as `shown`; the bonus and hidden levels it counts through the worlds.
    """
    if level.get("shown"):
        return level["shown"]
    w = worlds.index(level["theme"])
    slot = level["index"]
    if level["pack"].endswith("COPYCAT.PAK"):
        return None
    if 15 <= slot < 18:
        return f"BONUS {3 * w + slot - 14}"
    if slot == 18:
        return f"HIDDEN {w + 1}"
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--guide", default=None, help="the walkthrough as a text file, to score against")
    args = ap.parse_args()
    data = json.loads(DATA.read_text())
    kinds, types, scores = points_of(json.loads(NAMES.read_text()))
    guide = guide_scores(Path(args.guide).read_text(errors="replace")) if args.guide else None
    worlds = [t["id"] for t in data["themes"]]

    tally = Counter()
    bad = []
    for l in data["levels"]:
        total = level_points(l, kinds, types, data["firstRecord"])
        score = scores.get(f"{l['pack']}#{l['index']}")
        line = f"{l['theme']:7} {l['name']:10} {total:6}"
        if score is not None:
            line += f"   curated {score:6}   {score - total:+d}"
            if score >= total:
                bad.append(f"{l['name']}: the curated {score} is not below the disc's {total}")
        if guide is not None:
            stated = guide.get(played_as(l, worlds))
            if stated is None:
                tally["unrated"] += 1
            else:
                off = total - stated
                tally["exact" if off == 0 else "over" if off > 0 else "under"] += 1
                line += f"   walkthrough {stated:6}" + (f"   {off:+d}" if off else "")
                if score is None and off:
                    bad.append(f"{l['name']}: the disc holds {total}, the walkthrough {stated}, "
                               "and nothing is curated")
                if score is not None and score != stated:
                    bad.append(f"{l['name']}: the curated {score} is not the walkthrough's {stated}")
        print(line)
    if guide is not None:
        print(f"\n{tally['exact']} exact, {tally['over']} the walkthrough rates lower, "
              f"{tally['under']} it rates higher, {tally['unrated']} it does not rate")
    if bad:
        sys.exit("\n".join(bad))


if __name__ == "__main__":
    main()
