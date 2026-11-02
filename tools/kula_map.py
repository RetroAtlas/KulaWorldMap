#!/usr/bin/env python3
"""Where each reading of the base release's executable stands on another release's, written as a map: for every
check, immediate, multiplier, divisor, grey and scan the readers list, the instruction's address, word and text on
the other executable and the tier that placed it, every keyed value held to the base's by a relation, every address
constant the readers register by name at its value there, and the end-screen table's pairs by their digests.

    python3 tools/kula_map.py --release eu                 # write tools/maps/eu.json from the two discs and the hand table
    python3 tools/kula_map.py --report eu                  # the pending rows, the hand's rows and the loosely placed, for a hand read
    python3 tools/kula_map.py --check eu                   # derive the map again and hold the committed file to it
    python3 tools/kula_map.py --words eu out/words         # each pair of the release's end-screen table as a PNG, to read a word off

The aligner places the instructions. A multiplier's run is placed by the mapped instructions before and after it,
its count read by walking the shifts and adds until the destination register is overwritten by something else, or
stands as the hand table gives it; a data word is derived through a mapped instruction that reaches it, a lui and
the load, store or addiu that uses it through the adds between them, or a load, a store or an addiu off gp, an absent row of the hand
table taking a misplaced one out of the derivation; a table of cases is derived the same way and its entries held to
where the base's entries were placed. A keyed value is written only where it stands in a relation to the base's: the same, a rate or a count
scaled by the two frame rates in either direction of truncation, an offset the release's own derived word gives, a
key the hand table lists as tuned, or a reading the hand table lists as absent; a divisor the hand table says the
release lays out as a shift is two to that shift and an immediate it says the release lays out as another
instruction is the value it gives, each held the same way. What fits none, and every anchor the aligner leaves that
the hand table does not settle, goes to the map's pending block, and a map is not finished while that block holds
anything. The base's build holds every committed map to the base's executable, each keyed row's base value against
what that executable reads, so a reader that changes a row regenerates the map rather than leaving it stale.
"""
import argparse
import json
import re
import struct
import sys
import zlib
from collections import namedtuple
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kula_map_hand
from kula_align import MODULES, REGISTER, TIERS, Anchor, Listing, Placement, align, anchors
from kula_disc import BASE, RELEASES, output_at
from kula_motion_code import FITS, KINDS, MAPS, READS_FIRST
from kula_motion_run import PAIR, WORDS, pair_of
from kula_release import readings as release_readings
from png import write_png

OTHERS = [r for r in RELEASES if r != BASE]

LUI = re.compile(r"lui \$(\w+), (0x[0-9a-f]+)$")
USE = re.compile(r"\w+ \$\w+, (-?\d+)\(\$(\w+)\)$")
ADDIU = re.compile(r"addiu \$(\w+), \$(\w+), (-?\d+)$")
ADDU = re.compile(r"addu \$(\w+), \$(\w+), \$(\w+)$")
WRITES = re.compile(r"(\w+) \$(\w+)")
STEPS = re.compile(r"(sll|sllv|addu|subu) \$")
LEFT = ("CHECKS", "SCANS")      # the lists whose anchors go to pending as the aligner leaves them

Entry = namedtuple("Entry", "module name kind value keys")


class Pending(Exception):
    """A row the map cannot write yet, with why and, where a value was refused, both values."""

    def __init__(self, why, us=None, value=None):
        super().__init__(why)
        self.values = {} if us is None else {"us": us, "value": value}


def hexed(v):
    return f"0x{v:08x}"


def word_at(listing, at):
    return hexed(listing.code.word(at))


def registries(modules=MODULES):
    """Every registered constant of the modules, each with its module, its kind and the keys read as its offset."""
    out = []
    for module in modules:
        for name, entry in module.NAMED.items():
            kind, value, *keys = entry
            if kind not in KINDS:
                sys.exit(f"{module.__name__}.NAMED[{name!r}] is of kind {kind!r}, which the map writer does not know")
            if keys and isinstance(keys[0], str):
                sys.exit(f"{module.__name__}.NAMED[{name!r}] gives its keys as {keys[0]!r}, a bare string and not a tuple of them")
            out.append(Entry(module.__name__, name, kind, value, tuple(keys[0]) if keys else ()))
    return out


def leaves(kind, value):
    """Every leaf of the kind in the value, however the value nests."""
    if FITS[kind](value):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from leaves(kind, v)
    elif isinstance(value, (tuple, list)):
        for v in value:
            yield from leaves(kind, v)


def mapped(kind, value, leaf):
    """The value with each leaf of the kind replaced by what `leaf` makes of it, the rest as it stands."""
    if FITS[kind](value):
        return leaf(value)
    if isinstance(value, dict):
        return {k: mapped(kind, v, leaf) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        return [mapped(kind, v, leaf) for v in value]
    return value


def adding(text):
    """The register a load, a store or an addiu adds its immediate to, and the immediate, or None and None."""
    m = USE.match(text)
    if m:
        return m.group(2), int(m.group(1))
    m = ADDIU.match(text)
    if m:
        return m.group(2), int(m.group(3))
    return None, None


def reaching(listing):
    """Every address an instruction of the listing reaches, each as the position of the lui holding its high half,
    None for one off gp, and the position of the load, store or addiu adding the low half; a lui's half is carried
    through an addu that adds an index to it, and nothing is carried into another function."""
    out, held, starts = {}, {}, set(listing.starts)
    for i, text in enumerate(listing.text):
        if i in starts:
            held.clear()
        m = LUI.match(text)
        if m:
            held[m.group(1)] = (i, int(m.group(2), 0) << 16)
            continue
        m = ADDU.match(text)
        if m:
            rd, rs, rt = m.groups()
            high = [held[r] for r in (rs, rt) if r in held]
            if len(high) == 1:
                held[rd] = high[0]
            else:
                held.pop(rd, None)
            continue
        base, low = adding(text)
        if base == "gp":
            out.setdefault(listing.code.gp + low, []).append((None, i))
        elif base in held:
            li, hi = held[base]
            out.setdefault((0x80000000 | hi) + low, []).append((li, i))
        m = WRITES.match(text)
        if m and m.group(1) not in READS_FIRST:
            held.pop(m.group(2), None)
    return out


def reachers(reach, word):
    """The positions of every instruction reaching the word."""
    return [i for li, ui in reach.get(word, ()) for i in (li, ui) if i is not None]


def reaching_words(us, entries, reach):
    """The address of every instruction reaching a registered word, an offset's word or a table."""
    return {us.address(i) for e in entries if e.kind in ("word", "offset", "table")
            for leaf in leaves(e.kind, e.value) for i in reachers(reach, leaf if e.kind == "word" else leaf[0])}


def by_hand(us, entries, modules, reach):
    """Every address the map writer has placed besides the anchors the readers list: the instructions a registered
    constant names or builds an address with, the ones before and after each multiplier's run, the ones reaching
    each registered data word and the entries of each registered table."""
    out = []
    for e in entries:
        for leaf in leaves(e.kind, e.value):
            if e.kind in ("instruction", "routine"):
                addrs = [leaf]
            elif e.kind == "pair":
                addrs = list(leaf)
            elif e.kind == "matched":
                addrs = list(leaf[::2])
            elif e.kind == "run":
                addrs = [leaf[0] - 4, leaf[0] + 4 * leaf[1]]
            else:
                word = leaf if e.kind == "word" else leaf[0]
                addrs = [us.address(i) for i in reachers(reach, word)]
                if e.kind == "table" and us.code.holds(word, 4 * leaf[2]):
                    addrs += [0x80000000 | us.code.word(word + 4 * i) for i in range(leaf[2])]
            out += [Anchor(e.module, "NAMED", e.name, a) for a in addrs]
    for module in modules:
        for _, key, _, start, count, _, _ in getattr(module, "MULTIPLIERS", ()):
            out.append(Anchor(module.__name__, "MULTIPLIERS", f"{key}.before", start - 4))
            out.append(Anchor(module.__name__, "MULTIPLIERS", f"{key}.after", start + 4 * count))
    return [a for a in out if us.code.holds(a.address)]


def within_lists(table, listed, what):
    """The hand table's rows keyed by a base address held to the addresses given, the writer stopping on one no
    reader lists."""
    stale = sorted(hexed(addr) for addr in set(table) - listed)
    if stale:
        sys.exit(f"the hand table's {what} rows name {', '.join(stale)}, which no reader lists")


def place_by_hand(us, other, placements, left, table, listed):
    """The hand's placements over the aligner's, each refused unless it names an anchor the readers list or the
    writer places for a registered name, and the instruction at the place has the base's shape, exact or with its
    registers renamed."""
    within_lists(table, listed, "placed")
    for addr, (at, _) in table.items():
        if not us.code.holds(addr) or not other.code.holds(at):
            sys.exit(f"the hand places 0x{addr:08x} at 0x{at:08x}, outside an executable")
        i, j = us.position(addr), other.position(at)
        if other.shape[j] != us.shape[i] and other.loose[j] != us.loose[i]:
            sys.exit(f"the hand places 0x{addr:08x} at 0x{at:08x}, which reads `{other.text[j]}` and not the shape of "
                     f"`{us.text[i]}`; a check the release lays out otherwise is a reshaped row")
        placements[addr] = Placement(at, "hand", other.text[j])
    left[:] = [entry for entry in left if entry.anchor.address not in table]


def place(addr, placements, why):
    p = placements.get(addr)
    if p is None:
        raise Pending(f"0x{addr:08x} is not placed" + (f": {why[addr]}" if addr in why else ""))
    return p


def read(reader):
    """What a reader of the executable gives, its refusal a pending row rather than the tool's exit."""
    try:
        return reader()
    except SystemExit as e:
        raise Pending(str(e)) from None


def pattern_on(pattern, text, placed):
    """The base's pattern with its registers renamed as the instruction placed names them."""
    was, now = REGISTER.findall(text), REGISTER.findall(placed)
    if was == now or len(was) != len(now):
        return pattern
    regs = iter(now)
    return REGISTER.sub(lambda m: next(regs), pattern)


def weakest(tiers):
    """The tier of a row several placements make: the least sure of them, a hand's placement the surest."""
    return max(tiers, key=lambda t: TIERS.index(t) if t in TIERS else -1)


def run_at(us, other, start, count, dst, placements, why):
    """Where a multiplier's run stands on the other executable and how many instructions it is: from the one after
    the placed instruction before the base's run to the placed one after it, cut where the destination register is
    overwritten by something that is not a shift or an add."""
    before, after = place(start - 4, placements, why), place(start + 4 * count, placements, why)
    at = before.at + 4
    n = (after.at - at) // 4
    if n <= 0:
        raise Pending(f"the instructions about the run are placed at 0x{before.at:08x} and 0x{after.at:08x}")
    for i in range(n):
        text = other.text[other.position(at) + i]
        m = WRITES.match(text)
        if m and not STEPS.match(text) and m.group(1) not in READS_FIRST and m.group(2) == dst:
            return at, i
    return at, n


def derived(us, other, word, reach, placements):
    """The word on the other executable that the placed instructions reaching the base's word reach, where every
    one of them reaches the same: a load, a store or an addiu off gp at its offset, a lui and its use through the
    adds between them, and a lui and a use placed where no address is built between them passed over."""
    found, unbuilt = {}, []
    for li, ui in reach.get(word, ()):
        use = placements.get(us.address(ui))
        lui = placements.get(us.address(li)) if li is not None else None
        if use is None or (li is not None and lui is None):
            continue
        text = other.text[other.position(use.at)]
        if li is None:
            base, low = adding(text)
            if base != "gp":
                raise Pending(f"0x{use.at:08x} reads `{text}`, not a load, a store or an addiu off gp")
            value = other.code.gp + low
        else:
            value = other.code.built(lui.at, use.at)
            if value is None:
                unbuilt.append(use.at)
                continue
        found.setdefault(value, []).append(use.at)
    if not found:
        if unbuilt:
            raise Pending("the instructions placed for it build no address, at " + " and ".join(hexed(a) for a in unbuilt))
        raise Pending("no instruction reaching it is placed")
    if len(found) > 1:
        raise Pending("the instructions reaching it reach " + " and ".join(
            f"0x{v:08x} (0x{ats[0]:08x})" for v, ats in sorted(found.items())))
    return next(iter(found))


def leaf_on(us, other, entry, leaf, reach, placements, why, runs):
    """A registered constant's leaf as it stands on the other executable, in the base's shape."""
    kind = entry.kind
    if kind in ("instruction", "routine"):
        return hexed(place(leaf, placements, why).at)
    if kind == "pair":
        return [hexed(place(a, placements, why).at) for a in leaf]
    if kind == "matched":
        out = []
        for addr, pattern in zip(leaf[::2], leaf[1::2]):
            p = place(addr, placements, why)
            out += [hexed(p.at), pattern_on(pattern, us.text[us.position(addr)], p.text)]
        return out
    if kind == "run":
        start, count, src, dst = leaf
        if entry.name in runs:
            at, n, src, dst, _ = runs[entry.name]
        else:
            at, n = run_at(us, other, start, count, dst, placements, why)
        read(lambda: other.code.multiplier(at, n, src, dst))
        return [hexed(at), n, src, dst]
    word = leaf if kind == "word" else leaf[0]
    value = derived(us, other, word, reach, placements)
    if kind == "word":
        return hexed(value)
    if kind == "offset":
        if us.code.gp + leaf[1] != word:
            sys.exit(f"{entry.module}.{entry.name} keeps 0x{word:08x} at {leaf[1]} past gp, which the base's gp does not give")
        return [hexed(value), value - other.code.gp]
    _, first, count = leaf
    if not other.code.holds(value, 4 * count):
        raise Pending(f"the table derived at 0x{value:08x} runs past the executable")
    for i in range(count):
        p = placements.get(0x80000000 | us.code.word(word + 4 * i))
        theirs = 0x80000000 | other.code.word(value + 4 * i)
        if p is not None and theirs != p.at:
            raise Pending(f"entry {first + i} of the table derived at 0x{value:08x} is 0x{theirs:08x}, where the "
                          f"base's entry was placed at 0x{p.at:08x}")
    return [hexed(value), first, count]


def cut(x, num, den):
    """x times a ratio, cut toward nothing."""
    q = abs(x) * num // den
    return q if x >= 0 else -q


def relation(key, us_value, value, rates, tuned, address=None):
    """How a value on the other executable stands to the base's: `address` for a key read as an offset, which the
    derived word has to give; else `same`, `rate` or `count` by the two frame rates where they differ, each in
    either direction of truncation, `tuned` where the hand table lists the key, or None."""
    if address is not None:
        return "address" if value == address else None
    if value == us_value:
        return "same"
    base, other = rates
    if base != other:
        if value == cut(us_value, base, other) or us_value == cut(value, other, base):
            return "rate"
        if value == cut(us_value, other, base) or us_value == cut(value, base, other):
            return "count"
    return "tuned" if key in tuned else None


def standing(other, at, text, what):
    """The hand table's instruction held to the executable, as a row's address, word and text."""
    if not other.code.holds(at) or other.text[other.position(at)] != text:
        reads = other.text[other.position(at)] if other.code.holds(at) else "nothing"
        sys.exit(f"the hand table's {what} at 0x{at:08x} reads `{reads}`, not `{text}`")
    return {"at": hexed(at), "word": word_at(other, at), "text": text}


def absent_rows(other, table):
    """Each absent key to its row, and each check's base address the hand table declares absent to its row, the
    standing instruction the hand table gives held to the executable."""
    out = {}
    for keys, (at, text, _) in table.items():
        row = standing(other, at, text, "absent row")
        if isinstance(keys, int):
            out[keys] = {"absent": True, **row, "tier": "hand"}
            continue
        keys = keys if isinstance(keys, tuple) else (keys,)
        for key in keys:
            named = {"key": key} if len(keys) == 1 else {"keys": list(keys)}
            out[key] = {**named, "absent": True, **row}
    return out


def shift_rows(other, table):
    """Each key the release divides by a shift to its row, the shift's instruction the hand table gives held to the
    executable and its count read off it."""
    out = {}
    for key, (at, text, _) in table.items():
        m = re.match(r"sra \$\w+, \$\w+, (\d+)$", text)
        if not m:
            sys.exit(f"the hand table's shift row {key} reads `{text}`, not a shift right")
        out[key] = {"key": key, **standing(other, at, text, "shift row"), "shift": int(m.group(1)), "tier": "hand"}
    return out


def base_values(code, modules=MODULES):
    """Every keyed row's value on the base's executable, by the base's address and the key, as the map writer holds a
    row to it."""
    out = {}
    for module in modules:
        for _, key, _, addr, pattern in getattr(module, "IMMEDIATES", ()):
            out[addr, key] = code.immediate(addr, pattern)
        for _, key, _, start, count, src, dst in getattr(module, "MULTIPLIERS", ()):
            out[start, key] = code.multiplier(start, count, src, dst)
        for _, key, _, *parts in [*getattr(module, "DIVISORS", ()), *getattr(module, "GREYS", ())]:
            out[parts[0], key] = (code.divisor if len(parts) == 6 else code.grey)(*parts)
    return out


def held_apart(hand, release):
    """The hand table's rows keyed by a base address, an address in one table alone, the writer stopping where two
    tables name one."""
    tables = {}
    for what, table in (("placed", hand.PLACED), ("reshaped", hand.RESHAPED), ("absent", hand.ABSENT)):
        for addr in table.get(release, {}):
            if isinstance(addr, int) and tables.setdefault(addr, what) != what:
                sys.exit(f"the hand table's {tables[addr]} and {what} rows meet at 0x{addr:08x}")


def hand_runs(other, entries, table):
    """The hand table's runs, each lying within the executable and a row named for a registered run naming an entry
    of one run, since the row places one; the writer stopping on a run laid outside or an entry of several."""
    for key, (at, n, *_) in table.items():
        if not other.code.holds(at, 4 * n):
            sys.exit(f"the hand table's multiplier row {key} lays {n} instructions at 0x{at:08x}, outside the executable")
    for e in entries:
        runs = list(leaves(e.kind, e.value)) if e.kind == "run" and e.name in table else []
        if len(runs) > 1:
            at = [hexed(r[0]) for r in runs]
            sys.exit(f"the hand table's multiplier row {e.name} names {len(runs)} runs, at "
                     f"{', '.join(at[:-1])} and {at[-1]}, and a named row places one")
    return table


def build(us, other, release, modules=MODULES, hand=kula_map_hand, rates=None, us_words=WORDS):
    """The release's map: the rows by the base's address, the registered names, the end-screen words, the extra
    checks and what is pending, from the two listings and the hand table."""
    if rates is None:
        rates = (release_readings(us.code, BASE)["hz"], release_readings(other.code, release)["hz"])
    held_apart(hand, release)
    entries, reach = registries(modules), reaching(us)
    rows_in, hand_anchors = anchors(modules), by_hand(us, entries, modules, reach)
    placements, left = align(us, other, rows_in, hand=hand_anchors)
    anchored = {a.address for a in hand_anchors}
    place_by_hand(us, other, placements, left, hand.PLACED.get(release, {}), {a.address for a in rows_in} | anchored)
    reshaped, runs = hand.RESHAPED.get(release, {}), hand_runs(other, entries, hand.MULTIPLIERS.get(release, {}))
    within_lists(reshaped, {a.address for a in rows_in if a.list in ("CHECKS", "IMMEDIATES")} | anchored, "reshaped")
    rows = {}
    for addr, (at, text, *_) in reshaped.items():
        row = standing(other, at, text, "reshaped row")
        placements[addr] = Placement(at, "reshaped", row["text"])
        rows[hexed(addr)] = {**row, "tier": "reshaped"}
    for addr in hand.ABSENT.get(release, {}):
        if isinstance(addr, int):
            placements.pop(addr, None)
    left[:] = [entry for entry in left if entry.anchor.address not in reshaped]
    why = {entry.anchor.address: entry.why for entry in left}
    pending = [{"address": hexed(e.anchor.address), "module": e.anchor.module, "list": e.anchor.list, "key": e.anchor.key,
                "why": e.why} for e in left if e.anchor.list in LEFT]
    names, offsets = {}, {}
    for e in entries:
        try:
            names[e.name] = mapped(e.kind, e.value, lambda leaf: leaf_on(us, other, e, leaf, reach, placements, why, runs))
            if e.kind == "offset" and e.keys:
                offsets.update(dict.fromkeys(e.keys, int(names[e.name][0], 16) - other.code.gp))
        except Pending as p:
            pending.append({"name": e.name, "module": e.module, "why": str(p)})
    for e in entries:
        for key in e.keys:
            if key not in offsets:
                offsets[key] = None
    keyed(us, other, release, modules, hand, placements, why, rates, offsets, rows, pending,
          reaching_words(us, entries, reach), {e.name for e in entries if e.kind == "run"})
    extra = [standing(other, at, text, "extra row") for at, text, _ in hand.EXTRA.get(release, ())]
    return {"release": release, "rows": rows, "names": names, "extra": extra,
            "words": words_block(other, names, us_words, hand.WORDS.get(release, {}), pending), "pending": pending}


def keyed(us, other, release, modules, hand, placements, why, rates, offsets, rows, pending, word_reachers, named_runs):
    """Every list's rows into `rows`, by the base's address: a check's and a scan's as placed, a keyed row with its
    value in its relation to the base's, and a multiplier's row carrying the instruction that sets a register its
    run shifts by. Where the hand table speaks, its row stands instead: an absence at a check's or a word reacher's
    address over whatever was placed there, an absence under a reading's key, two absences for one address standing
    as the keyed one where they name one instruction, a shift the release lays a divisor out as with two to the
    shift as its value, or another instruction it lays an immediate out as with the value it gives. The writer stops
    on a hand row naming nothing a reader lists, on a reading with a value where the hand declares a check absent,
    on two absences naming different instructions and on an immediate the hand both restates and declares absent."""
    tuned, absent = hand.TUNED.get(release, {}), absent_rows(other, hand.ABSENT.get(release, {}))
    shifts, runs, used = shift_rows(other, hand.SHIFTS.get(release, {})), hand.MULTIPLIERS.get(release, {}), set()
    restated = {addr: row for addr, row in hand.RESHAPED.get(release, {}).items() if len(row) == 4}
    values = base_values(us.code, modules)

    def put(addr, row, key=None):
        at = hexed(addr)
        old = rows.get(at)
        was_keyed = old is not None and ("key" in old or "keys" in old)
        if key is not None and old is not None and not was_keyed and old.get("absent"):
            if not row.get("absent"):
                sys.exit(f"0x{addr:08x} is the hand table's absent check and is read as {key}")
            if old["at"] != row["at"]:
                sys.exit(f"0x{addr:08x} is absent as a check at {old['at']} and as {key} at {row['at']}, which disagree")
        if old is None or (key is not None and not was_keyed):
            rows[at] = row
        elif key is not None and any(old.get(f) != row.get(f) for f in ("at", "pattern", "us", "value", "by", "absent")):
            sys.exit(f"0x{addr:08x} is read as {old.get('key', old.get('keys'))} and as {key}, which disagree")

    def valued(module, kind, key, addr, us_value, reader):
        used.add(key)
        if key in absent:
            put(addr, absent[key], key)
            return
        try:
            value, row = read(reader)
            address = offsets.get(key, False)
            if address is None:
                raise Pending("the word it is an offset of is not derived")
            by = relation(key, us_value, value, rates, tuned, None if address is False else address)
            if by is None:
                raise Pending(f"{value} stands in no relation to the base's {us_value}"
                              + (f", the derived word lying {address} past gp" if address is not False else ""), us_value, value)
            put(addr, {**row, "us": us_value, "value": value, "by": by}, key)
        except Pending as p:
            pending.append({"address": hexed(addr), "module": module, "list": kind, "key": key, "why": str(p), **p.values})

    def placed_row(addr):
        p = placements.get(addr)
        if p is not None:
            put(addr, {"at": hexed(p.at), "word": word_at(other, p.at), "text": p.text, "tier": p.tier})

    absent_checks = {addr for addr in absent if isinstance(addr, int)}
    absent_addresses = {hexed(addr) for addr in absent_checks}
    for addr in absent_checks:
        put(addr, absent[addr])
    used |= (absent_checks & word_reachers) | (set(runs) & named_runs)
    pending[:] = [p for p in pending if p.get("address") not in absent_addresses]
    for module in modules:
        name = module.__name__
        for addr, _, _ in getattr(module, "CHECKS", ()):
            if addr in absent_checks:
                used.add(addr)
            else:
                placed_row(addr)
        for _, _, _, start, end, _, _, calls in getattr(module, "SCANS", ()):
            for addr in (start, end, *(where for where, _, _ in calls)):
                placed_row(addr)
        for _, key, _, addr, pattern in getattr(module, "IMMEDIATES", ()):
            if addr in restated and key in absent:
                sys.exit(f"the hand table's reshaped and absent rows meet at {key}, 0x{addr:08x}")

            def immediate(key=key, addr=addr, pattern=pattern):
                if addr in restated:
                    at, text, value, _ = restated[addr]
                    used.add(addr)
                    return value, {"key": key, **standing(other, at, text, "reshaped row"), "tier": "reshaped"}
                p = place(addr, placements, why)
                pat = pattern_on(pattern, us.text[us.position(addr)], p.text)
                row = {"key": key, "at": hexed(p.at), "word": word_at(other, p.at), "text": p.text, "tier": p.tier, "pattern": pat}
                return other.code.immediate(p.at, pat), row
            valued(name, "IMMEDIATES", key, addr, values[addr, key], immediate)
        for _, key, _, start, count, src, dst in getattr(module, "MULTIPLIERS", ()):
            def multiplier(key=key, start=start, count=count, src=src, dst=dst):
                if key in runs:
                    at, n, s, d, _ = runs[key]
                    tier = "hand"
                else:
                    at, n = run_at(us, other, start, count, dst, placements, why)
                    s, d = src, dst
                    tier = weakest([placements[start - 4].tier, placements[start + 4 * count].tier])
                row = {"key": key, "at": hexed(at), "count": n, "src": s, "dst": d,
                       "words": [word_at(other, at + 4 * i) for i in range(n)], "tier": tier}
                sets = {}
                for i in range(n):
                    shift = re.match(r"sllv \$\w+, \$\w+, \$(\w+)$", other.text[other.position(at) + i])
                    if shift:
                        pc = other.code.setter(at + 4 * i, shift.group(1))
                        sets[hexed(pc)] = word_at(other, pc)
                if sets:
                    row["sets"] = sets
                return other.code.multiplier(at, n, s, d), row
            valued(name, "MULTIPLIERS", key, start, values[start, key], multiplier)
        for _, key, _, *parts in [*getattr(module, "DIVISORS", ()), *getattr(module, "GREYS", ())]:
            kind, reader = ("DIVISORS", "divisor") if len(parts) == 6 else ("GREYS", "grey")

            def halves(key=key, parts=parts, reader=reader):
                if key in shifts:
                    return 2 ** shifts[key]["shift"], shifts[key]
                addrs, patterns = parts[::2], parts[1::2]
                ps = [place(a, placements, why) for a in addrs]
                pats = [pattern_on(pat, us.text[us.position(a)], p.text) for a, pat, p in zip(addrs, patterns, ps)]
                row = {"key": key, "at": [hexed(p.at) for p in ps], "word": [word_at(other, p.at) for p in ps],
                       "text": [p.text for p in ps], "tier": weakest([p.tier for p in ps]), "pattern": pats}
                return getattr(other.code, reader)(*(x for p, pat in zip(ps, pats) for x in (p.at, pat))), row
            valued(name, kind, key, parts[0], values[parts[0], key], halves)
    for table, what in ((absent, "absent"), (shifts, "shift"), (tuned, "tuned"), (runs, "multiplier"),
                        (restated, "reshaped immediate")):
        stale = sorted(hexed(k) if isinstance(k, int) else k for k in set(table) - used)
        if stale:
            sys.exit(f"the hand table's {what} rows name {', '.join(stale)}, which no reader lists")


def words_block(other, names, us_words, given, pending):
    """The end-screen table as the other executable holds it: its count and, per pair the base's table or the hand
    letters, the word and the digest of the pair's two images, the base's word where the images are the base's and
    the hand table's where they are the release's own."""
    pair = names.get("WORDS_TABLE")
    if pair is None:
        return None
    code = other.code
    sprites = 0x80000000 | code.word(code.address(int(pair[0], 16), int(pair[1], 16)))
    count = code.word(sprites)
    out = {"count": count, "pairs": {}}
    for index in sorted(set(us_words) | set(given)):
        if index + PAIR > count:
            pending.append({"pair": index, "why": f"the table holds {count} entries"})
            continue
        try:
            theirs = zlib.crc32(b"".join(read(lambda: pair_of(code, sprites, index))))
        except Pending as p:
            pending.append({"pair": index, "why": str(p)})
            continue
        word, digest = us_words.get(index, (None, None))
        if theirs == digest:
            out["pairs"][str(index)] = [word, hexed(digest)]
        elif index in given:
            out["pairs"][str(index)] = [given[index], hexed(theirs)]
        else:
            pending.append({"pair": index, "why": f"its images are not the base's {word!r} pair, and the hand table "
                                                  "gives no word for them"})
    return out


def dump(built, path):
    """The map as JSON, a row, a name and a pending entry to a line, so a rewrite diffs line by line."""
    def lines(items, indent):
        return [f"{indent}{json.dumps(k)}: {json.dumps(v)}" + ("," if i < len(items) - 1 else "")
                for i, (k, v) in enumerate(items)]

    out = ["{", f' "release": {json.dumps(built["release"])},', ' "rows": {',
           *lines(sorted(built["rows"].items()), "  "), " },", ' "names": {',
           *lines(list(built["names"].items()), "  "), " },", f' "words": {json.dumps(built["words"])},']
    for name in ("extra", "pending"):
        items = built[name]
        last = "," if name == "extra" else ""
        if not items:
            out.append(f' "{name}": []{last}')
            continue
        out += [f' "{name}": [', *(f"  {json.dumps(v)}" + ("," if i < len(items) - 1 else "") for i, v in enumerate(items)),
                f" ]{last}"]
    out.append("}")
    Path(path).write_text("\n".join(out) + "\n")


def report(built):
    """The pending rows, then the hand's tuned, absent, shift and reshaped rows, then every row placed at a renamed
    or a loose tier, for a hand read."""
    pending = built["pending"]
    print(f"pending: {len(pending)}")
    for p in pending:
        print("  " + "  ".join(f"{k} {v}" for k, v in p.items()))
    rows = sorted(built["rows"].items())
    for title, keep in (("tuned", lambda r: r.get("by") == "tuned"), ("absent", lambda r: r.get("absent")),
                        ("shift", lambda r: "shift" in r), ("reshaped", lambda r: r.get("tier") == "reshaped"),
                        ("renamed or loose", lambda r: str(r.get("tier", "")).startswith("loose") or r.get("tier") == "renamed")):
        picked = [(addr, r) for addr, r in rows if keep(r)]
        print(f"\n{title}: {len(picked)}")
        for addr, r in picked:
            at = r["at"] if isinstance(r["at"], str) else r["at"][0]
            print(f"  {addr}  {at}  {r.get('tier', ''):<9} {r.get('key', r.get('keys', r.get('text')))}")


def check(built, path):
    """The committed map held to what the discs and the hand table give, stopping at the first row that differs."""
    if not path.exists():
        sys.exit(f"no map at {path}")
    was = json.loads(path.read_text())
    pending = was.get("pending") or []
    if pending:
        sys.exit(f"{path} has {len(pending)} pending row{'s' if len(pending) != 1 else ''}")
    now = json.loads(json.dumps(built))
    for block in ("rows", "names"):
        for key in sorted(set(was.get(block, {})) | set(now[block])):
            if was.get(block, {}).get(key) != now[block].get(key):
                sys.exit(f"{path}: {block} {key} holds {was.get(block, {}).get(key)}, where the discs give {now[block].get(key)}")
    for block in ("release", "words", "extra", "pending"):
        if was.get(block) != now[block]:
            sys.exit(f"{path}: {block} holds {was.get(block)}, where the discs give {now[block]}")
    print(f"{path} holds what the discs and the hand table give")


def check_base(code, path, modules=MODULES):
    """The committed map at `path` held to the base's executable: every keyed row's base value is what that
    executable reads at the row's address, or the tool's exit naming the first that is not, so a reader that
    changes a row cannot leave the map stale in silence."""
    values = base_values(code, modules)
    for addr, row in sorted(json.loads(path.read_text())["rows"].items()):
        if "us" not in row:
            continue
        at = (int(addr, 16), row["key"])
        if values.get(at) != row["us"]:
            reads = f"the base's executable reads {values[at]}" if at in values else "no reader lists the row"
            sys.exit(f"{path}: {row['key']} at {addr} holds the base's value as {row['us']}, where {reads}; "
                     f"regenerate the map")


def pixels(image):
    """A TIM image four bits a pixel with a palette as its width, its height and RGBA pixels, a palette entry of
    nothing transparent."""
    size, _, _, w, h = struct.unpack_from("<IHHHH", image, 8)
    clut = struct.unpack_from(f"<{w * h}H", image, 20)
    at = 8 + size
    size, _, _, w, h = struct.unpack_from("<IHHHH", image, at)
    data = image[at + 12:at + size]
    out = bytearray()
    for y in range(h):
        for b in data[y * w * 2:(y + 1) * w * 2]:
            for nibble in (b & 15, b >> 4):
                c = clut[nibble]
                out += bytes(((c & 31) * 255 // 31, ((c >> 5) & 31) * 255 // 31, ((c >> 10) & 31) * 255 // 31, 255 if c else 0))
    return w * 4, h, out


def write_words(other, built, out):
    """Each pair of the release's end-screen table as a PNG in the directory, the two images side by side, named
    by the pair's index."""
    pair = built["names"].get("WORDS_TABLE")
    if pair is None:
        sys.exit("the end-screen table is not placed on this release")
    code = other.code
    sprites = 0x80000000 | code.word(code.address(int(pair[0], 16), int(pair[1], 16)))
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    count = code.word(sprites)
    for index in range(0, count - 1, 2):
        images = [pixels(image) for image in pair_of(code, sprites, index)]
        w, h = sum(i[0] for i in images), max(i[1] for i in images)
        rgba = bytearray(w * h * 4)
        x = 0
        for iw, ih, px in images:
            for y in range(ih):
                rgba[(y * w + x) * 4:(y * w + x + iw) * 4] = px[y * iw * 4:(y + 1) * iw * 4]
            x += iw
        write_png(out / f"{index}.png", w, h, rgba)
    print(f"{out}: {count // 2} pairs")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--release", choices=OTHERS, help="write the release's map under tools/maps/")
    ap.add_argument("--report", choices=OTHERS, metavar="RELEASE",
                    help="print the pending rows, the hand's rows and the loosely placed rows of the release's map")
    ap.add_argument("--check", choices=OTHERS, metavar="RELEASE", help="hold the committed map of the release to the discs")
    ap.add_argument("--words", nargs=2, metavar=("RELEASE", "DIR"),
                    help="write each pair of the release's end-screen table as a PNG into the directory")
    ap.add_argument("--disc", default=None, help="raw PS1 image of the release; defaults to the release's own variable")
    ap.add_argument("--out", default=None, help="write the map here instead")
    args = ap.parse_args()
    asked = [r for r in (args.release, args.report, args.check, args.words and args.words[0]) if r]
    if len(asked) != 1:
        ap.error("say one of --release, --report, --check and --words")
    release = asked[0]
    if args.words and release not in OTHERS:
        ap.error(f"--words takes one of {', '.join(OTHERS)}")
    path = output_at(args.out, "--out") if args.out else MAPS / f"{release}.json"
    us, other = Listing.of(BASE), Listing.of(release, args.disc)
    built = build(us, other, release)
    if args.report:
        report(built)
    elif args.check:
        check(built, path)
    elif args.words:
        write_words(other, built, args.words[1])
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        dump(built, path)
        pairs = len(built["words"]["pairs"]) if built["words"] else 0
        print(f"{path}: {len(built['rows']):,} rows, {len(built['names'])} names, {pairs} pairs lettered, "
              f"{len(built['pending'])} pending")


if __name__ == "__main__":
    main()
