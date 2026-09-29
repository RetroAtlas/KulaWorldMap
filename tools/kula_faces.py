#!/usr/bin/env python3
"""What the six slots of a record hold, across every record in the game.

A record is a block: a kind word, then six 32-byte slots, one per face in the
order -z +x +y -y -x +z, then 32 bytes never set, 26 of extras and the cell.
This walks the slots of all 5,700 and reports, per kind, which slots carry an
object and what types and values they take, so a reading can be argued from
the whole game rather than from a level or two.

    python3 tools/kula_faces.py
    python3 tools/kula_faces.py --kind 8          # just that kind's records
    python3 tools/kula_faces.py --dump 4          # print whole records, a row a slot

See docs/level-format.md for what this has settled.
"""
import argparse
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import open_disc, packs
from kula_level import FACES, SLOT, WORDS, Level
from kula_pak import Pak

FACE = ["-z", "+x", "+y", "-y", "-x", "+z"]


def records(disc):
    for theme, path in packs(disc):
        pak = Pak(disc.read_file(path), path)
        for i in range(len(pak)):
            L = Level(pak.level(i), pak.name(i), theme)
            for k, r in enumerate(L.records):
                yield L, k, r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=None)
    ap.add_argument("--kind", type=int, default=None)
    ap.add_argument("--dump", type=int, default=0, help="print this many whole records")
    args = ap.parse_args()

    rows = [row for row in records(open_disc(args.disc))
            if args.kind is None or row[2].kind == args.kind]
    if not rows:
        sys.exit("no records match")

    by_kind = Counter(r.kind for _, _, r in rows)
    carry = defaultdict(Counter)       # kind -> slot -> records with a type there
    types = defaultdict(Counter)       # (kind, slot) -> type
    values = defaultdict(Counter)      # (kind, slot) -> value word
    per_block = defaultdict(Counter)   # kind -> objects on the block
    rest = Counter()
    for _, _, r in rows:
        for j, s in enumerate(r.slots):
            if s[1] > 0:
                carry[r.kind][j] += 1
                types[(r.kind, j)][s[1]] += 1
                values[(r.kind, j)][s[14]] += 1
        per_block[r.kind][len(r.objects)] += 1
        rest[(r.kind, all(v == -1 for v in r.extra))] += 1

    print(f"{len(rows)} records, {len(rows) * FACES} slots\n")
    for kind in sorted(by_kind):
        print(f"kind {kind}: {by_kind[kind]} records; objects on a block: "
              + ", ".join(f"{n}x{c}" for n, c in sorted(per_block[kind].items()))
              + f"; extras unset on {rest[(kind, True)]}")
        for j in range(FACES):
            n = carry[kind][j]
            if not n:
                continue
            top = ", ".join(f"{t}x{c}" for t, c in types[(kind, j)].most_common(6))
            vals = ", ".join(f"{v}x{c}" for v, c in values[(kind, j)].most_common(4))
            print(f"   slot {j} ({FACE[j]:>2}): {n:5} carry a type: {top}   value: {vals}")

    for L, k, r in rows[:args.dump]:
        print(f"\n-- {L.theme} {L.name} record {k}: {r.cell} kind {r.kind}, "
              f"{len(r.objects)} objects")
        for j, s in enumerate(r.slots):
            print(f"   [{j} {FACE[j]:>2}] " + " ".join(f"{v:>6}" for v in s))
        tail = list(r.extra) + list(r.cell)
        for j in range(FACES, WORDS // SLOT):
            seg = tail[SLOT * (j - FACES):SLOT * (j + 1 - FACES)]
            print(f"   [{j}   ] " + " ".join(f"{v:>6}" for v in seg))


if __name__ == "__main__":
    main()
