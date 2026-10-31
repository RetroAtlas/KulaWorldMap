#!/usr/bin/env python3
"""Where each instruction the readings match on the base release's executable
stands on another release's, found by the shape of the code about it.

    python3 tools/kula_align.py --release eu --report         # the count per tier, and every anchor left by module and list
    python3 tools/kula_align.py --release eu --at 0x800387cc   # the base's window about an address beside the release's

A shape is an instruction's text with every number dropped and the registers
kept, a loose shape drops the registers too, and a word that does not decode
is its own shape. An anchor is placed where the shapes about it, at radius 10,
5 or 3, exact then loose, stand at one position of the other executable and
no other; the executables are then split into functions at their returns and
paired by the votes of the placements the two widest exact windows made inside
them, a function whose votes split staying unpaired, and within a pair the one
offset its placements share places an anchor whose shape stands at that
offset, and an alignment of the two functions' loose shapes places the rest,
exact or with the registers renamed. Every placement says its tier, and the
anchors no tier places are listed for a hand read.
"""
import argparse
import bisect
import difflib
import re
import struct
import sys
from collections import Counter, defaultdict, namedtuple
from itertools import zip_longest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kula_motion_blocks
import kula_motion_code
import kula_motion_effects
import kula_motion_harms
import kula_motion_jump
import kula_motion_light
import kula_motion_roll
import kula_motion_run
import kula_motion_simon
import kula_motion_take
import kula_motion_things
import kula_skins
from kula_disc import BASE, RELEASES, open_release
from kula_motion_code import Code
from mips import decode

# The readers whose lists hold the anchors, in the order the printouts take them, and the lists.
MODULES = (kula_motion_code, kula_motion_things, kula_motion_light, kula_motion_roll, kula_motion_jump, kula_motion_take,
           kula_motion_harms, kula_motion_blocks, kula_motion_run, kula_motion_simon, kula_motion_effects, kula_skins)
LISTS = ("CHECKS", "IMMEDIATES", "MULTIPLIERS", "DIVISORS", "GREYS", "SCANS")

RADII = (10, 5, 3)      # the windows tried about an anchor, widest first
TIERS = ("strict10", "strict5", "strict3", "loose10", "loose5", "loose3", "offset", "aligned", "renamed")
VOTING = TIERS[:2]      # the tiers sure enough to pair functions by

NUMBER = re.compile(r"(?<![$\w])-?(?:0x[0-9a-f]+|[0-9]+)(?![\w])")
REGISTER = re.compile(r"\$\w+")

Anchor = namedtuple("Anchor", "module list key address")
Placement = namedtuple("Placement", "at tier text")
Left = namedtuple("Left", "anchor why pair")


def shape(text):
    """The text with every number dropped, unless it is a word that does not decode."""
    return text if text.startswith(".word") else NUMBER.sub("#", text)


def loose(text):
    """The shape with the registers dropped too."""
    return REGISTER.sub("$", shape(text))


def anchors():
    """Every address of the base's executable the readers match an instruction at, by module and list: a check's or
    an immediate's instruction, each instruction of a multiplier's run, a divisor's three and a grey's two, and a
    scan's first and last instructions with the calls it lists."""
    out = []
    for module in MODULES:
        name = module.__name__
        lists = {kind: getattr(module, kind, ()) for kind in LISTS}
        out += [Anchor(name, "CHECKS", what, addr) for addr, _, what in lists["CHECKS"]]
        out += [Anchor(name, "IMMEDIATES", key, addr) for _, key, _, addr, _ in lists["IMMEDIATES"]]
        for _, key, _, addr, count, _, _ in lists["MULTIPLIERS"]:
            out += [Anchor(name, "MULTIPLIERS", f"{key}+{i}", addr + 4 * i) for i in range(count)]
        for _, key, _, hi, _, lo, _, sa, _ in lists["DIVISORS"]:
            out += [Anchor(name, "DIVISORS", f"{key}.{part}", addr) for part, addr in (("hi", hi), ("lo", lo), ("sa", sa))]
        for _, key, _, hi, _, lo, _ in lists["GREYS"]:
            out += [Anchor(name, "GREYS", f"{key}.{part}", addr) for part, addr in (("hi", hi), ("lo", lo))]
        for _, key, _, start, end, _, _, calls in lists["SCANS"]:
            out += [Anchor(name, "SCANS", f"{key}.start", start), Anchor(name, "SCANS", f"{key}.end", end)]
            out += [Anchor(name, "SCANS", f"{key}.call{n}", where) for n, (where, _, _) in enumerate(calls)]
    return out


class Listing:
    """A release's executable decoded whole: the text, the shape and the loose shape of every word, and the
    functions it splits into at each `jr $ra` and its delay slot."""

    def __init__(self, code):
        self.code = code
        count = len(code.blob) // 4
        words = struct.unpack_from(f"<{count}I", code.blob)
        self.text = [decode(w, code.base + 4 * i)[0] for i, w in enumerate(words)]
        self.shape = [shape(t) for t in self.text]
        self.loose = [loose(t) for t in self.text]
        self.starts = [0] + [i + 2 for i, t in enumerate(self.text) if t == "jr $ra" and i + 2 < count]
        self.indexes = {}

    @classmethod
    def of(cls, release, disc=None):
        """The release's executable off its image, from the path given, else from the release's own variable."""
        return cls(Code.of(release, open_release(release, disc).read_file(RELEASES[release]["exe"])))

    def position(self, address):
        return (address - self.code.base) // 4

    def address(self, position):
        return self.code.base + 4 * position

    def function(self, position):
        """The first position of the function holding the position, and the first past it."""
        k = bisect.bisect_right(self.starts, position) - 1
        return self.starts[k], self.starts[k + 1] if k + 1 < len(self.starts) else len(self.text)

    def window(self, kind, position, radius):
        """The shapes of the kind about the position, or None at an end of the listing."""
        seq = getattr(self, kind)
        if radius <= position < len(seq) - radius:
            return tuple(seq[position - radius:position + radius + 1])
        return None

    def matches(self, kind, window):
        """Every position whose shapes about it are the window's."""
        radius, inner = len(window) // 2, RADII[-1]
        if kind not in self.indexes:
            seq, index = getattr(self, kind), defaultdict(list)
            for i in range(inner, len(seq) - inner):
                index[tuple(seq[i - inner:i + inner + 1])].append(i)
            self.indexes[kind] = index
        return [j for j in self.indexes[kind].get(window[radius - inner:radius + inner + 1], ())
                if self.window(kind, j, radius) == window]

    def lines(self, first, last, mark=None):
        """The listing from one position up to another, the marked position flagged."""
        return [f"0x{self.address(i):08x}  {self.text[i]}{'  <--' if i == mark else ''}"
                for i in range(max(first, 0), min(last, len(self.text)))]


def by_window(us, other, i):
    """The tier and the position where the shapes about position i stand once and only once in the other listing,
    or None."""
    for kind, name in (("shape", "strict"), ("loose", "loose")):
        for radius in RADII:
            window = us.window(kind, i, radius)
            hits = other.matches(kind, window) if window else []
            if len(hits) == 1:
                return f"{name}{radius}", hits[0]
    return None


def windows(us, other, positions):
    """Every position the window matcher places, as its tier and its position in the other listing."""
    placed = {}
    for i in positions:
        hit = by_window(us, other, i)
        if hit:
            placed[i] = hit
    return placed


def pair_by_votes(us, other, placed, pairs):
    """Each function of the base not yet paired, paired with the one function of the other listing the voting
    placements inside it stand in, none where they stand in two."""
    votes = defaultdict(Counter)
    for i, (tier, j) in placed.items():
        if tier in VOTING:
            votes[us.function(i)[0]][other.function(j)[0]] += 1
    return {fu: next(iter(count)) for fu, count in votes.items() if len(count) == 1 and fu not in pairs}


# The pairers, each in turn pairing the functions the ones before it left.
PAIRERS = (pair_by_votes,)


def within(us, other, i, fo, offsets, blocks):
    """The tier and the position where position i stands in the paired function: at the pair's one offset where
    its shape stands there, else where the alignment of the two functions' loose shapes puts it, or None where it
    lies outside every aligned stretch."""
    b0, b1 = other.function(fo)
    if len(offsets) == 1:
        j = i + next(iter(offsets))
        if b0 <= j < b1 and other.shape[j] == us.shape[i]:
            return "offset", j
    fu, a1 = us.function(i)
    if (fu, fo) not in blocks:
        matcher = difflib.SequenceMatcher(None, us.loose[fu:a1], other.loose[b0:b1], autojunk=False)
        blocks[fu, fo] = [(fu + a, b0 + b, n) for a, b, n in matcher.get_matching_blocks() if n]
    for a, b, n in blocks[fu, fo]:
        if a <= i < a + n:
            j = b + i - a
            return ("aligned" if other.shape[j] == us.shape[i] else "renamed"), j
    return None


def align(us, other, anchors, pairers=PAIRERS, hand=()):
    """Where every anchor stands on the other listing, keyed by its address on the base, each its address there,
    its tier and the text at the place, and the anchors left, each with why and the address of the function its own
    is paired with, or None. The anchors given by hand are placed the same way once the functions are paired, so
    none of them votes in the pairing or lends it an offset."""
    positions = sorted({us.position(a.address) for a in anchors})
    placed = windows(us, other, positions)
    pairs = {}
    for pairer in pairers:
        pairs.update(pairer(us, other, placed, pairs))
    offsets = defaultdict(set)
    for i, (_, j) in placed.items():
        fu = us.function(i)[0]
        if pairs.get(fu) == other.function(j)[0]:
            offsets[fu].add(j - i)
    by_hand = {us.position(a.address) for a in hand} - set(positions)
    blocks, why = {}, {}
    for i in positions + sorted(by_hand):
        if i in placed:
            continue
        fu = us.function(i)[0]
        hit = by_window(us, other, i) if i in by_hand else None
        if not hit and fu in pairs:
            hit = within(us, other, i, pairs[fu], offsets[fu], blocks)
        if hit:
            placed[i] = hit
            continue
        window = us.window("shape", i, RADII[-1])
        stands = len(other.matches("shape", window)) if window else 0
        why[i] = "its function is unpaired" if fu not in pairs else "it lies outside the aligned stretches of its pair"
        if stands > 1:
            why[i] += f", its shapes standing at {stands} places"
    placements = {us.address(i): Placement(other.address(j), tier, other.text[j]) for i, (tier, j) in placed.items()}
    left = []
    for a in list(anchors) + [a for a in hand if us.position(a.address) in by_hand]:
        i = us.position(a.address)
        if i in why:
            fu = us.function(i)[0]
            left.append(Left(a, why[i], other.address(pairs[fu]) if fu in pairs else None))
    return placements, left


def report(release, placements, left, anchors):
    """The count per tier over the anchors, and every anchor left by module and list."""
    addresses = {a.address for a in anchors}
    counts = Counter(p.tier for address, p in placements.items() if address in addresses)
    print(f"{RELEASES[release]['name']}: {sum(counts.values()):,} of {len(addresses):,} addresses placed")
    for tier in TIERS:
        if counts[tier]:
            print(f"  {tier:<9}{counts[tier]:>6,}")
    left = [entry for entry in left if entry.anchor.address in addresses]
    print(f"\nleft: {len(left):,} anchors at {len({entry.anchor.address for entry in left}):,} addresses")
    groups = defaultdict(list)
    for entry in left:
        groups[entry.anchor.module, entry.anchor.list].append(entry)
    names = [m.__name__ for m in MODULES]
    for module, kind in sorted(groups, key=lambda g: (names.index(g[0]) if g[0] in names else len(names), LISTS.index(g[1]))):
        print(f"\n{module} {kind}")
        for entry in groups[module, kind]:
            print(f"  0x{entry.anchor.address:08x}  {entry.anchor.key}: {entry.why}")


def show(us, other, address, anchors, placements, left):
    """The base's window about the address beside the other's about its place, or where it is not placed, the base's
    window and the listing of the function its own is paired with."""
    i, radius = us.position(address), RADII[0]
    names = "; ".join(f"{a.module} {a.list} {a.key}" for a in anchors if a.address == address)
    head = f"0x{address:08x}" + (f", {names}" if names else "")
    if address in placements:
        p = placements[address]
        j = other.position(p.at)
        print(f"{head}: placed at 0x{p.at:08x} by {p.tier}")
        for a, b in zip_longest(us.lines(i - radius, i + radius + 1, i), other.lines(j - radius, j + radius + 1, j), fillvalue=""):
            print(f"  {a:<48}{b}")
        return
    entry = next(entry for entry in left if entry.anchor.address == address)
    print(f"{head}: left, {entry.why}")
    print("\n".join(f"  {line}" for line in us.lines(i - radius, i + radius + 1, i)))
    fu = us.function(i)[0]
    if entry.pair is None:
        print(f"\nthe function from 0x{us.address(fu):08x} is unpaired")
        return
    fo = other.position(entry.pair)
    end = other.function(fo)[1]
    print(f"\nthe function from 0x{us.address(fu):08x} is paired with the one from 0x{entry.pair:08x}, "
          f"{end - fo} instructions")
    print("\n".join(f"  {line}" for line in other.lines(fo, end)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--release", choices=[r for r in RELEASES if r != BASE], required=True,
                    help="the release whose executable the anchors are placed on")
    ap.add_argument("--disc", default=None, help="raw PS1 image of that release; defaults to the release's own variable")
    ap.add_argument("--report", action="store_true", help="print the count per tier and every anchor left")
    ap.add_argument("--at", type=lambda v: int(v, 0), default=None,
                    help="an address of the base's executable, shown beside its place")
    args = ap.parse_args()
    if not args.report and args.at is None:
        ap.error("say --report or --at")
    us, other = Listing.of(BASE), Listing.of(args.release, args.disc)
    rows, hand = anchors(), []
    if args.at is not None and all(a.address != args.at for a in rows):
        if not us.code.holds(args.at):
            sys.exit(f"0x{args.at:08x} is not in the {RELEASES[BASE]['name']} executable")
        hand = [Anchor("", "", "", args.at)]
    placements, left = align(us, other, rows, hand=hand)
    if args.report:
        report(args.release, placements, left, rows)
    if args.at is not None:
        show(us, other, args.at, rows, placements, left)


if __name__ == "__main__":
    main()
