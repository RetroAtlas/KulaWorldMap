#!/usr/bin/env python3
"""What the 224 bytes after a record's entity hold, which nothing decodes.

A record is eight 32-byte groups and only the first is an entity. This walks
the other seven across every record in the game and reports their shape, so a
reading can be argued from the whole 5,700 rather than from a level or two.

    python3 tools/kula_tail.py
    python3 tools/kula_tail.py --kind 0 --type 37    # just that kind's records
    python3 tools/kula_tail.py --dump 4              # print whole records

See backlog/item-002-the-unread-record-bytes.md for what this has settled.
"""
import argparse
import struct
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import open_disc, packs
from kula_level import GROUP, GROUPS, GRID_BYTES, RECORD
from kula_pak import Pak

WORDS = GROUP // 2


def records(disc):
    for theme, path in packs(disc):
        pak = Pak(disc.read_file(path), path)
        for i in range(len(pak)):
            blob = pak.level(i)
            count = struct.unpack_from("<H", blob, GRID_BYTES + 4)[0]
            for k in range(count):
                at = GRID_BYTES + RECORD * (1 + k)
                yield pak.name(i), theme, k, struct.unpack_from(f"<{GROUPS * WORDS}h", blob, at)


def groups(words):
    return [words[g * WORDS:(g + 1) * WORDS] for g in range(1, GROUPS)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=None)
    ap.add_argument("--kind", type=int, default=None)
    ap.add_argument("--type", type=int, default=None)
    ap.add_argument("--dump", type=int, default=0, help="print this many whole records")
    args = ap.parse_args()

    rows = [r for r in records(open_disc(args.disc))
            if (args.kind is None or r[3][3] == args.kind)
            and (args.type is None or r[3][4] == args.type)]
    if not rows:
        sys.exit("no records match")

    live = Counter()
    prefix = 0
    vocab = defaultdict(Counter)
    for _, _, _, w in rows:
        gs = groups(w)
        on = [i for i, g in enumerate(gs) if any(v != -1 for v in g)]
        live[len(on)] += 1
        prefix += on == list(range(len(on)))
        for i in on:
            for j, v in enumerate(gs[i]):
                vocab[j][v] += 1

    print(f"{len(rows)} records, {len(rows) * (GROUPS - 1)} trailing groups\n")
    print("live groups per record:")
    for n, c in sorted(live.items()):
        print(f"  {n}: {c}")
    print(f"\nrecords whose live groups form a prefix: {prefix} of {len(rows)}")
    print("\nword vocabulary within a live group (entity layout: x y z kind type f5..f15):")
    names = ["x", "y", "z", "kind", "type"] + [f"f{i}" for i in range(5, 16)]
    for j in range(WORDS):
        c = vocab[j]
        if set(c) <= {-1}:
            continue
        top = ", ".join(f"{v}x{n}" for v, n in c.most_common(6))
        print(f"  {names[j]:>5}  {len(c):4} distinct  {top}")

    for name, theme, k, w in rows[:args.dump]:
        print(f"\n-- {theme} {name} record {k}: "
              f"{w[0]},{w[1]},{w[2]} kind {w[3]} type {w[4]}")
        for g in range(GROUPS):
            seg = w[g * WORDS:(g + 1) * WORDS]
            print(f"   g{g} " + " ".join(f"{v:>6}" for v in seg))


if __name__ == "__main__":
    main()
