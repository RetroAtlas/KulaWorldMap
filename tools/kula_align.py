#!/usr/bin/env python3
"""Where each instruction the readings match on the base release's executable
stands on another release's, found by the shape of the code about it.

    python3 tools/kula_align.py --release eu --report         # the count per tier, the anchors placed renamed and those left, by module and list
    python3 tools/kula_align.py --release eu --at 0x800387cc   # the base's window about an address beside the release's

A shape is an instruction's text with every number dropped and the registers
kept, a loose shape drops the registers too, and a word that does not decode
is its own shape. An anchor is placed where the shapes about it, at radius 10,
5 or 3, exact then loose, stand at one position of the other executable and
no other; the executables are then split into functions at their returns and
paired by the votes of the placements the two widest exact windows made inside
them, a function whose votes split staying unpaired, and the functions the
votes leave are paired by the rare constants they share, a word a lui and an
ori build, an immediate above 255 or a call to a function paired already, each
held by three functions or fewer of each executable, where the two lie in the
same order between their paired neighbours and neither has a second candidate.
A placement by window whose place lies outside the function its own is paired
with is left, as are two anchors placed at one place. Within a pair the one
offset its placements share places an anchor whose shape stands at that
offset, and an alignment of the two functions' loose shapes places the rest,
exact or with the registers renamed, a check placed with its registers renamed
only where the instructions before and after it align too, since its text is
taken from the place and holds nothing on its own. Every placement says its
tier, and the anchors placed renamed and those no tier places are listed for a
hand read.
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
from kula_motion_code import READS_FIRST, Code
from mips import decode

# The readers whose lists hold the anchors, in the order the printouts take them, and the lists.
MODULES = (kula_motion_code, kula_motion_things, kula_motion_light, kula_motion_roll, kula_motion_jump, kula_motion_take,
           kula_motion_harms, kula_motion_blocks, kula_motion_run, kula_motion_simon, kula_motion_effects, kula_skins)
LISTS = ("CHECKS", "IMMEDIATES", "MULTIPLIERS", "DIVISORS", "GREYS", "SCANS")

RADII = (10, 5, 3)      # the windows tried about an anchor, widest first
TIERS = ("strict10", "strict5", "strict3", "loose10", "loose5", "loose3", "offset", "aligned", "renamed")
VOTING = TIERS[:2]      # the tiers sure enough to pair functions by
COMMON = 255            # an immediate up to this tells no function from another
RARE = 3                # a constant held by this many functions or fewer of each executable tells them apart

NUMBER = re.compile(r"(?<![$\w])-?(?:0x[0-9a-f]+|[0-9]+)(?![\w])")
REGISTER = re.compile(r"\$\w+")
IMMEDIATE = re.compile(r"(?:addi|addiu|andi|ori|xori|slti|sltiu) \$\w+, \$\w+, (-?\d+)$")
LUI = re.compile(r"lui \$(\w+), (0x[0-9a-f]+)$")
ORI = re.compile(r"ori \$(\w+), \$(\w+), (\d+)$")
JAL = re.compile(r"jal (0x[0-9a-f]+)$")
WRITTEN = re.compile(r"(\w+) \$(\w+)")

UNPAIRED = "its function is unpaired"
BEYOND = "it lies outside the aligned stretches of its pair"
OUTSIDE = "its window stands outside the function its own is paired with"
EDGE = "it stands with its registers renamed at the edge of an aligned stretch"

Anchor = namedtuple("Anchor", "module list key address")
Placement = namedtuple("Placement", "at tier text")
Left = namedtuple("Left", "anchor why pair")


def shape(text):
    """The text with every number dropped, unless it is a word that does not decode."""
    return text if text.startswith(".word") else NUMBER.sub("#", text)


def loose(text):
    """The shape with the registers dropped too."""
    return REGISTER.sub("$", shape(text))


def anchors(modules=MODULES):
    """Every address of the base's executable the readers match an instruction at, by module and list: a check's or
    an immediate's instruction, each instruction of a multiplier's run, a divisor's three and a grey's two, and a
    scan's first and last instructions with the calls it lists."""
    out = []
    for module in modules:
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
        self.held = None

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

    def constants(self):
        """The constants each function holds, by its first position: the words its lui and ori pairs build, its
        immediates above the common ones and the functions it calls, each by its first position."""
        if self.held is None:
            self.held = {}
            for k, f0 in enumerate(self.starts):
                f1 = self.starts[k + 1] if k + 1 < len(self.starts) else len(self.text)
                high, found = {}, set()
                for i in range(f0, f1):
                    text = self.text[i]
                    m = LUI.match(text)
                    if m:
                        high[m.group(1)] = int(m.group(2), 16) << 16
                        continue
                    m = ORI.match(text)
                    if m and m.group(2) in high:
                        found.add(("word", high[m.group(2)] | int(m.group(3))))
                    m = IMMEDIATE.match(text)
                    if m and abs(int(m.group(1))) > COMMON:
                        found.add(("immediate", int(m.group(1))))
                    m = JAL.match(text)
                    if m and self.code.holds(int(m.group(1), 16)):
                        found.add(("call", self.function(self.position(int(m.group(1), 16)))[0]))
                    m = WRITTEN.match(text)
                    if m and m.group(1) not in READS_FIRST:
                        high.pop(m.group(2), None)
                self.held[f0] = found
        return self.held


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


def shared(us, other, pairs):
    """Every rare constant each unpaired function of the base shares with each unpaired function of the other
    listing, a call counting as the function it reaches once that one is paired, by the two functions."""
    inverse = {fo: fu for fu, fo in pairs.items()}

    def named(found, known, name):
        return {(kind, name(v)) if kind == "call" else (kind, v) for kind, v in found if kind != "call" or v in known}

    held = [{f: named(found, pairs, lambda v: v) for f, found in us.constants().items()},
            {f: named(found, inverse, inverse.get) for f, found in other.constants().items()}]
    counts = [Counter(c for found in side.values() for c in found) for side in held]
    rare = {c for c in counts[0] if counts[0][c] <= RARE and 0 < counts[1][c] <= RARE}
    holders = defaultdict(set)
    for fo, found in held[1].items():
        if fo not in inverse:
            for c in found & rare:
                holders[c].add(fo)
    out = defaultdict(set)
    for fu, found in held[0].items():
        if fu not in pairs:
            for c in found & rare:
                for fo in holders[c]:
                    out[fu, fo].add(c)
    return out


def between(pairs, fu, fo):
    """Whether the other listing's function stands between the pairs of the base function's nearest paired
    neighbours, as the base function stands between them."""
    paired = sorted(pairs)
    k = bisect.bisect_left(paired, fu)
    low = pairs[paired[k - 1]] if k else -1
    high = pairs[paired[k]] if k < len(paired) else float("inf")
    return low < fo < high


def pair_by_constants(us, other, placed, pairs):
    """Each function of the base not yet paired, paired with the one function of the other listing not yet paired
    that shares a rare constant with it and stands in the same order between their paired neighbours, where no
    other function of either listing could be paired the same way; the pairs are made until no more are, since
    each narrows the order the next are held to."""
    out, known = {}, dict(pairs)
    while True:
        candidates = defaultdict(set)
        for fu, fo in shared(us, other, known):
            if between(known, fu, fo):
                candidates[fu].add(fo)
        taken = Counter(fo for cs in candidates.values() for fo in cs)
        new = {fu: next(iter(cs)) for fu, cs in candidates.items() if len(cs) == 1 and taken[next(iter(cs))] == 1}
        if not new:
            return out
        out.update(new)
        known.update(new)


# The pairers, each in turn pairing the functions the ones before it left.
PAIRERS = (pair_by_votes, pair_by_constants)


def inside(us, other, i, j, pairs):
    """Whether position j lies in the function paired with position i's, or that function is unpaired."""
    fo = pairs.get(us.function(i)[0])
    return fo is None or other.function(j)[0] == fo


def flanked(blocks, i):
    """Whether the instructions before and after position i lie in the aligned stretch it lies in."""
    return any(a < i < a + n - 1 for a, _, n in blocks)


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
    why = {}
    for i, (_, j) in list(placed.items()):
        if not inside(us, other, i, j, pairs):
            del placed[i]
            why[i] = OUTSIDE
    offsets = defaultdict(set)
    for i, (_, j) in placed.items():
        offsets[us.function(i)[0]].add(j - i)
    by_hand = {us.position(a.address) for a in hand} - set(positions)
    keyed = {us.position(a.address) for a in anchors if a.list != "CHECKS"}
    checks = {us.position(a.address) for a in anchors if a.list == "CHECKS"} - keyed
    blocks = {}
    for i in positions + sorted(by_hand):
        if i in placed or i in why:
            continue
        fu = us.function(i)[0]
        hit = by_window(us, other, i) if i in by_hand else None
        if hit and not inside(us, other, i, hit[1], pairs):
            hit, why[i] = None, OUTSIDE
        elif not hit and fu in pairs:
            hit = within(us, other, i, pairs[fu], offsets[fu], blocks)
            if hit and hit[0] == "renamed" and i in checks and not flanked(blocks[fu, pairs[fu]], i):
                hit, why[i] = None, EDGE
        if hit:
            placed[i] = hit
        elif i not in why:
            window = us.window("shape", i, RADII[-1])
            stands = len(other.matches("shape", window)) if window else 0
            why[i] = UNPAIRED if fu not in pairs else BEYOND
            if stands > 1:
                why[i] += f", its shapes standing at {stands} places"
    at = defaultdict(list)
    for i, (_, j) in placed.items():
        at[j].append(i)
    for group in at.values():
        for i in group if len(group) > 1 else ():
            del placed[i]
            others = [f"0x{us.address(k):08x}" for k in sorted(group) if k != i]
            why[i] = f"{' and '.join(others)} {'stands' if len(others) == 1 else 'stand'} at its place too"
    placements = {us.address(i): Placement(other.address(j), tier, other.text[j]) for i, (tier, j) in placed.items()}
    left = []
    for a in list(anchors) + [a for a in hand if us.position(a.address) in by_hand]:
        i = us.position(a.address)
        if i in why:
            fu = us.function(i)[0]
            left.append(Left(a, why[i], other.address(pairs[fu]) if fu in pairs else None))
    return placements, left


def listed(title, rows):
    """The rows' count of anchors and of addresses, then each anchor with what is said of it, by module and list in
    the readers' order."""
    print(f"\n{title}: {len(rows):,} anchors at {len({a.address for a, _ in rows}):,} addresses")
    groups = defaultdict(list)
    for a, said in rows:
        groups[a.module, a.list].append(f"  0x{a.address:08x}  {a.key}: {said}")
    names = [m.__name__ for m in MODULES]
    for module, kind in sorted(groups, key=lambda g: (names.index(g[0]) if g[0] in names else len(names), LISTS.index(g[1]))):
        print(f"\n{module} {kind}")
        print("\n".join(groups[module, kind]))


def report(release, placements, left, anchors):
    """The count per tier over the anchors, then every anchor placed with its registers renamed and every anchor
    left, each by module and list."""
    addresses = {a.address for a in anchors}
    counts = Counter(p.tier for address, p in placements.items() if address in addresses)
    print(f"{RELEASES[release]['name']}: {sum(counts.values()):,} of {len(addresses):,} addresses placed")
    for tier in TIERS:
        if counts[tier]:
            print(f"  {tier:<9}{counts[tier]:>6,}")
    renamed = [a for a in anchors if a.address in placements and placements[a.address].tier == "renamed"]
    listed("renamed", [(a, f"at 0x{placements[a.address].at:08x}  {placements[a.address].text}") for a in renamed])
    listed("left", [(entry.anchor, entry.why) for entry in left if entry.anchor.address in addresses])


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


def given(us, rows, address):
    """The address given by hand as an anchor, or none where the rows hold it already; one outside the base's
    executable or not a multiple of four exits with a sentence."""
    if not us.code.holds(address):
        sys.exit(f"0x{address:08x} is not in the {RELEASES[BASE]['name']} executable")
    if address % 4:
        sys.exit(f"0x{address:08x} is not a multiple of four")
    return [] if any(a.address == address for a in rows) else [Anchor("", "", "", address)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--release", choices=[r for r in RELEASES if r != BASE], required=True,
                    help="the release whose executable the anchors are placed on")
    ap.add_argument("--disc", default=None, help="raw PS1 image of that release; defaults to the release's own variable")
    ap.add_argument("--report", action="store_true",
                    help="print the count per tier, every anchor placed with its registers renamed and every anchor left")
    ap.add_argument("--at", type=lambda v: int(v, 0), default=None,
                    help="an address of the base's executable, shown beside its place")
    args = ap.parse_args()
    if not args.report and args.at is None:
        ap.error("say --report or --at")
    us, other = Listing.of(BASE), Listing.of(args.release, args.disc)
    rows = anchors()
    hand = given(us, rows, args.at) if args.at is not None else []
    placements, left = align(us, other, rows, hand=hand)
    if args.report:
        report(args.release, placements, left, rows)
    if args.at is not None:
        show(us, other, args.at, rows, placements, left)


if __name__ == "__main__":
    main()
