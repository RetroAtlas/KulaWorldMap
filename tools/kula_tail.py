#!/usr/bin/env python3
"""What the 224 bytes between an entity's fields and its position hold.

An entity is 256 bytes: kind, type and eleven fields, then seven 32-byte groups,
then the cell it stands on. The groups look like entities and are not. This
walks them across every entity in the game and reports their shape, so a
reading can be argued from the whole 5,700 rather than from a level or two.

    python3 tools/kula_tail.py
    python3 tools/kula_tail.py --kind 0 --type 37    # just that kind's entities
    python3 tools/kula_tail.py --dump 4              # print whole entities

See backlog/item-002-the-unread-record-bytes.md for what this has settled.
"""
import argparse
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import open_disc, packs
from kula_level import GROUP, GROUPS, Level
from kula_pak import Pak

WORDS = GROUP // 2


def entities(disc):
    for theme, path in packs(disc):
        pak = Pak(disc.read_file(path), path)
        for i in range(len(pak)):
            L = Level(pak.level(i), pak.name(i), theme)
            for k, e in enumerate(L.objects):
                yield L.name, theme, k, e


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=None)
    ap.add_argument("--kind", type=int, default=None)
    ap.add_argument("--type", type=int, default=None)
    ap.add_argument("--dump", type=int, default=0, help="print this many whole entities")
    args = ap.parse_args()

    rows = [r for r in entities(open_disc(args.disc))
            if (args.kind is None or r[3].kind == args.kind)
            and (args.type is None or r[3].type == args.type)]
    if not rows:
        sys.exit("no entities match")

    live = Counter()
    prefix = 0
    vocab = defaultdict(Counter)
    for _, _, _, e in rows:
        on = [i for i, g in enumerate(e.groups) if any(v != -1 for v in g)]
        live[len(on)] += 1
        prefix += on == list(range(len(on)))
        for i in on:
            for j, v in enumerate(e.groups[i]):
                vocab[j][v] += 1

    print(f"{len(rows)} entities, {len(rows) * GROUPS} trailing groups\n")
    print("live groups per entity:")
    for n, c in sorted(live.items()):
        print(f"  {n}: {c}")
    print(f"\nentities whose live groups form a prefix: {prefix} of {len(rows)}")
    print("\nword vocabulary within a live group (entity layout: x y z kind type f5..f15):")
    names = ["x", "y", "z", "kind", "type"] + [f"f{i}" for i in range(5, 16)]
    for j in range(WORDS):
        c = vocab[j]
        if set(c) <= {-1}:
            continue
        top = ", ".join(f"{v}x{n}" for v, n in c.most_common(6))
        print(f"  {names[j]:>5}  {len(c):4} distinct  {top}")

    for name, theme, k, e in rows[:args.dump]:
        print(f"\n-- {theme} {name} entity {k}: "
              f"{e.x},{e.y},{e.z} kind {e.kind} type {e.type} f {e.f}")
        for g, seg in enumerate(e.groups, 1):
            print(f"   g{g} " + " ".join(f"{v:>6}" for v in seg))


if __name__ == "__main__":
    main()
