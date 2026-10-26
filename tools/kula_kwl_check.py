"""What holds the level writer to the disc and the executable: every level of
a disc rebuilt from its fields and held to the disc, in play and word for
word outside the words the game never reads, against that release's tables
of the words the rebuild writes differently and of the levels whose records
it does not keep one for one, and the caps and the loader figures the
writer's checks rest on, read off the executable.

    python3 tools/kula_kwl.py --check                                # every level of the disc, needs $KULA_DISC
    python3 tools/kula_kwl.py --check --release eu                   # the PAL disc's, needs $KULA_DISC_EU; jp the Japanese disc's
"""
import re
import struct
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import packs
from kula_kwl import (
    BARE,
    CAPS,
    CAPTIVATORS,
    CRUMBLING_KIND,
    FACING_TYPES,
    INNER,
    KEY,
    LENGTH_CAP,
    MOVING_SPIKES,
    NO_TRIO,
    NUMBERED,
    PICKUPS,
    PLAIN_ONLY,
    SPAN_KINDS,
    TRIO,
    VANISHING_KIND,
    VARIANT_TYPES,
    canonical,
    project_of_level,
)
from kula_level import (
    BLOCK_KINDS,
    FACES,
    FIRST_RECORD,
    GRID_BYTES,
    HEAD,
    LASER_KIND,
    LINK_WORD,
    NEXT_WORD,
    PAYLOAD_KINDS,
    PLATFORM_KIND,
    RECORD,
    SLOT,
    SWITCH,
    TELEPORTER,
    TRAILER_KIND,
    UNPLACED_KIND,
    WORDS,
    Level,
    link,
)
from kula_pak import Pak

# The words the game never reads, by the research behind docs/editor.md, which
# the disc's own levels fill with an editor's leftovers; the pickup numbers are
# masked on the levels of each release that left them unset.
F5_LEVELS = {"us": frozenset({"BONUS 30"}), "eu": frozenset(), "jp": frozenset({"BONUS 30"})}
WORD_NAME = {0: "kind word", 1: "type", 13: "w13", 14: "f14", 15: "w15"}


def word_name(w):
    return WORD_NAME.get(w, f"f{w}")


def unread(kind, w, dslot, cslot, unnumbered):
    """Whether word w of a record of this kind is one the game never reads, on a
    level whose pickup numbers the disc left unset where `unnumbered`."""
    if w >= SLOT * FACES:
        return w <= 118 or kind == UNPLACED_KIND
    slot, sw = divmod(w, SLOT)
    if kind == UNPLACED_KIND:
        return not (slot == 0 and sw in (1, 2))
    if kind == TRAILER_KIND:
        return slot > 0 or 1 <= sw <= 5
    if sw in (13, 15) or (sw == 0 and slot >= 2):
        return True
    if kind == PLATFORM_KIND and slot == 1:
        return sw == 3 or sw >= 5
    if kind == PLATFORM_KIND and slot == 0:
        return sw >= 10
    if kind == CRUMBLING_KIND:
        return slot >= 1 or sw >= 5
    if kind == VANISHING_KIND:
        return sw != 1 if slot >= 1 else (sw == 1 or sw >= 3)
    if kind == LASER_KIND:
        return slot >= 2
    typ = dslot[1]
    if typ == 0 and cslot[1] == 0:
        return sw not in (1, 4)
    if sw in (9, 10, 14):
        return True
    if sw in (6, 7) and typ not in (TELEPORTER, SWITCH):
        return True
    return sw == 5 and unnumbered


def _at_of(L, word):
    """A link word as the cell and face it names, so an index shift reads as equal."""
    at = link(word)
    if at is None:
        return None
    if at[0] >= len(L.records):
        return ("past the table", word)
    return (L.records[at[0]].cell, at[1])


def _value(L, k, kind, w, word):
    """A word as it compares across two levels: a link as what it names, a
    record's own lattice value as "own", anything else as itself."""
    if w >= SLOT * FACES:
        return word
    slot, sw = divmod(w, SLOT)
    if kind < BLOCK_KINDS and sw in (NEXT_WORD, LINK_WORD) and L.records[k].slots[slot][1] in (TELEPORTER, SWITCH):
        return _at_of(L, word)
    if kind == LASER_KIND and slot == 1 and sw == LINK_WORD:
        return _at_of(L, word)
    if kind in SPAN_KINDS and slot == 1 and sw == 4:
        return "own" if word == FIRST_RECORD + k else word
    return word


def _objects(L, k):
    r = L.records[k]
    out = {}
    for o in r.objects:
        o_ = {"type": o.type}
        if o.type in FACING_TYPES:
            o_["facing"] = o.f[0]
        if o.type in VARIANT_TYPES:
            o_["variant"] = o.f[1]
        o_["state"] = o.f[2]
        out[o.face] = o_
    return out


def _circuits(L):
    """Every switch's list and every teleporter's destination, by cell and face."""
    lists, leads = {}, {}
    for k, r in enumerate(L.records):
        for o in r.objects:
            if o.type == SWITCH:
                lists[(r.cell, o.face)] = frozenset(_at_of(L, at[0] * 16 + at[1]) for at in L.circuit(k, o.face))
            elif o.type == TELEPORTER:
                leads[(r.cell, o.face)] = _at_of(L, r.slots[o.face][LINK_WORD])
    return lists, leads


UNFLAGGED = "settings records with no flag set"
BARE_RECORDS = "records carrying nothing"
NO_TRAILER = "no trailer record"


def stripped(L):
    """The records of a level the rebuild keeps, and a count of what differs
    around them by what it is: a settings record with no flag set, which the
    writer leaves out, a record of kinds 0 to 4 with nothing on it, which folds
    into the lattice, and no trailer where the file ends at its count, which the
    writer always writes."""
    kept, gone = [], Counter()
    for r in L.records:
        if r.kind == UNPLACED_KIND and not (r.type == 1 or r.f[0] == 1):
            gone[UNFLAGGED] += 1
        elif r.kind < BLOCK_KINDS and not r.objects:
            gone[BARE_RECORDS] += 1
        else:
            kept.append(r)
    if L.trailer is None:
        gone[NO_TRAILER] += 1
    return kept, gone


def compare(L, C):
    """What differs in play between a disc level and its canonical rebuild: the
    blocks, every record kept by cell and kind, the records both have, their
    objects as the format reads them, the spans, the circuits, the time and
    the settings."""
    bad = []
    if _kind_at(L) != _kind_at(C):
        bad.append("the blocks differ")
    placed = Counter((r.cell, r.kind) for r in stripped(L)[0] if r.kind != UNPLACED_KIND)
    if placed != Counter((r.cell, r.kind) for r in C.records if r.kind != UNPLACED_KIND):
        bad.append("the records differ by cell and kind")
    disc = {r.cell: k for k, r in enumerate(L.records) if r.kind != UNPLACED_KIND}
    canon = {r.cell: k for k, r in enumerate(C.records) if r.kind != UNPLACED_KIND}
    for cell in disc.keys() & canon.keys():
        a, b = L.records[disc[cell]], C.records[canon[cell]]
        if a.kind != b.kind:
            bad.append(f"record at {cell} is kind {a.kind} on the disc and {b.kind} rebuilt")
        elif a.kind < BLOCK_KINDS and _objects(L, disc[cell]) != _objects(C, canon[cell]):
            bad.append(f"the objects at {cell} differ")
        elif a.kind in SPAN_KINDS and (sorted(a.span), a.colour, a.f[1], a.length, a.speed, a.slots[1][0]) != \
                (sorted(b.span), b.colour, b.f[1], b.length, b.speed, b.slots[1][0]):
            bad.append(f"the span at {cell} differs")
        elif a.kind == VANISHING_KIND and a.f[0] != b.f[0]:
            bad.append(f"the phase at {cell} differs")
        elif a.kind == CRUMBLING_KIND and a.f[:3] != b.f[:3]:
            bad.append(f"the crumbling block's cell words at {cell} differ")
    if _circuits(L) != _circuits(C):
        bad.append("the circuits differ")
    if L.time != C.time:
        bad.append("the time differs")
    if _flags(L) != _flags(C):
        bad.append("the settings differ")
    return bad


def _kind_at(L):
    return {c[:3]: c[3] if c[3] < FIRST_RECORD else L.records[c[3] - FIRST_RECORD].kind for c in L.cells}


def _flags(L):
    """The two settings a level's kind 9 records set between them."""
    settings = [r for r in L.records if r.kind == UNPLACED_KIND]
    return any(r.type == 1 for r in settings), any(r.f[0] == 1 for r in settings)


def diff_words(L, C, classes, examples, release):
    """Count every word that differs outside the unread mask, by its class, over
    the records both levels have and the trailer where the disc's level has one."""
    unnumbered = L.name in F5_LEVELS[release]
    disc = {r.cell: k for k, r in enumerate(L.records) if r.kind != UNPLACED_KIND}
    canon = {r.cell: k for k, r in enumerate(C.records) if r.kind != UNPLACED_KIND}
    pairs = [(disc[c], canon[c]) for c in disc if c in canon]
    pairs += [(k, j) for k, r in enumerate(L.records) if r.kind == UNPLACED_KIND
              for j, s in enumerate(C.records) if s.kind == UNPLACED_KIND]
    if L.trailer is not None:
        pairs.append((L.count, C.count))
    for kd, kc in pairs:
        a = L.records[kd] if kd < L.count else L.trailer
        b = C.records[kc] if kc < C.count else C.trailer
        da = struct.unpack_from(f"<{WORDS}h", L.blob, GRID_BYTES + HEAD + RECORD * kd)
        db = struct.unpack_from(f"<{WORDS}h", C.blob, GRID_BYTES + HEAD + RECORD * kc)
        for w in range(WORDS - 3):
            slot, sw = divmod(w, SLOT)
            dslot = a.slots[slot] if w < SLOT * FACES else None
            cslot = b.slots[slot] if w < SLOT * FACES else None
            if unread(a.kind, w, dslot, cslot, unnumbered):
                continue
            x = _value(L, kd, a.kind, w, da[w]) if kd < L.count else da[w]
            y = _value(C, kc, b.kind, w, db[w]) if kc < C.count else db[w]
            if x == y:
                continue
            if w >= SLOT * FACES:
                what = f"kind {a.kind} record word {w}"
            elif a.kind < BLOCK_KINDS and dslot[1] > 0:
                what = f"kind 0..4 object type {dslot[1]} {word_name(sw)}"
            elif a.kind < BLOCK_KINDS:
                what = f"kind 0..4 bare slot {word_name(sw)}"
            else:
                what = f"kind {a.kind} slot {slot} {word_name(sw)}"
            classes[what] += 1
            examples.setdefault(what, []).append(f"{L.name} record {kd} at {a.cell} slot {slot} word {sw}: {da[w]} on the disc, {db[w]} rebuilt")


# The executable's words behind the caps and the loader figures: an address, the instruction there and what it says.
EXECUTABLE = [
    (0x8002e418, "lw $v0, 0($a0)", "the light maker reads an entry of the light list"),
    (0x8002e42c, "slti $v0, $s5, 32", "searching its 32 entries for a free one"),
    (0x8002e434, "addiu $a0, $a0, 32", "32 bytes apart"),
    (0x8002e438, "sll $v0, $s5, 5", "and, finding none, takes the entry past the list"),
    (0x8002a0a8, "lh $v0, 0($t0)", "the moving spikes' init reads a record's kind"),
    (0x8002a0b0, "bne $v0, $zero, 0x8002a194", "and takes kind 0 alone"),
    (0x8002a0dc, "addiu $v0, $zero, 11", "for the faces of type 11"),
    (0x8002a0f0, "sll $v1, $a0, 3", "into entries of 8 bytes"),
    (0x80029774, "lh $v0, 0($t1)", "the glow loader reads a record's kind"),
    (0x8002977c, "bne $v0, $zero, 0x800297dc", "and takes kind 0 alone"),
    (0x80029758, "addiu $t6, $zero, 7", "for the exit"),
    (0x8002975c, "addiu $t5, $zero, 5", "the teleporter"),
    (0x80029760, "addiu $t4, $zero, 9", "and the switch"),
    (0x80027b4c, "addiu $t0, $zero, 31", "the mode routine counts the keys"),
    (0x80027b64, "sltiu $v0, $v0, 5", "on records of kinds below 5"),
    (0x800355e8, "slti $v0, $v0, 5", "the object loader walks records of kinds below 5"),
    (0x80035620, "sw $zero, -29572($at)", "zeroing the next entry's word before it reads a face"),
    (0x80035630, "addiu $v0, $v0, -5", "and takes the types from 5"),
    (0x8003563c, "sltiu $v0, $v1, 43", "for 43 types"),
    (0x800359e8, "addiu $s1, $s1, 48", "48 bytes an entry"),
    (0x800271e4, "addiu $t0, $zero, 1", "the face builder walks from 1"),
    (0x800279b4, "slti $v0, $t0, 33", "to 32 on one axis"),
    (0x800279e0, "slti $v0, $t1, 33", "on the next"),
    (0x800279f8, "slti $v0, $t0, 33", "and on the third"),
    (0x8003b644, "slti $v0, $v0, 5", "the captivators are lifted from records of kinds below 5"),
    (0x8003b678, "addiu $v0, $v1, -50", "from type 50 on"),
    (0x80028aac, "addiu $t1, $zero, 6", "the crumbling builder takes kind 6"),
    (0x80028ae4, "sll $v0, $v0, 1", "into a list of two-byte indices"),
    (0x80028b44, "addiu $v0, $zero, 7", "the vanishing builder takes kind 7"),
    (0x80028b58, "sll $v0, $a2, 1", "into a list of two-byte indices"),
    (0x800327ac, "sll $v0, $v0, 7", "the ride's grid has rows of 128 bytes"),
    (0x800327dc, "slti $v1, $v1, 8", "8 to a side"),
    (0x8003389c, "lh $v0, 34($v0)", "and a ridden platform marks its run by its length word"),
    (0x8003387c, "sll $v0, $v1, 7", "a row a block"),
]
# A table's start and the next address the code builds, each a lui and the instruction after it, and the bytes an entry takes.
TABLES = {
    "spikes": ((0x8002a08c, 0x8002a090), (0x800270a8, 0x800270ac), 8),
    "captivators": ((0x8003b620, 0x8003b624), (0x8003ff98, 0x8003ff9c), 180),
    "crumbling": ((0x80028ab0, 0x80028ab4), (0x80015810, 0x80015814), 2),
    "vanishing": ((0x80028b5c, 0x80028b64), (0x8002a554, 0x8002a558), 2),
    "objects": ((0x80035670, 0x80035678), (0x8003fdb8, 0x8003fdbc), 48),
    "grid": ((0x80032790, 0x80032794), (0x80040920, 0x80040924), 2),
    "faces": ((0x80028de8, 0x80028dec), (0x80025c40, 0x80025c44), 160),
}
FIRST_RECORD_AT = (0x80025bf0, 0x80025bfc)   # where the level's first record lies
FRAMES_AT = (0x80040c74, 0x80040c78)          # the frame buffers the record table runs into
UNTRACED = ("platforms", "blocks")   # the caps that rest on no table in the executable


def _built_address(code, lui, at):
    """The address a lui and any load or store after it build."""
    hi = code.immediate(lui, f"lui ${code.text(lui).split('$')[1].split(',')[0]}, {{}}")
    text = code.text(at)
    lo = re.search(r"(-?\d+)(?:\(\$\w+\))?$", text)
    if not lo:
        sys.exit(f"0x{at:08x} reads `{text}`, not a load, store or add")
    return (0x80000000 | (hi << 16)) + int(lo.group(1))


def executable(code):
    """The caps and loader figures as the executable holds them, after the checks have passed."""
    for addr, pattern, _ in EXECUTABLE:
        code.immediate(addr, pattern)
    room = {}
    for what, (start, end, entry) in TABLES.items():
        size = _built_address(code, *end) - _built_address(code, *start)
        if size % entry:
            sys.exit(f"the {what} table's {size} bytes are not whole entries of {entry}")
        room[what] = size // entry
    side = code.immediate(0x800327dc, "slti $v1, $v1, {}")
    if room["grid"] != side ** 3:
        sys.exit(f"the ride's grid holds {room['grid']} cells, not {side} cubed")
    stretches = (_built_address(code, *FRAMES_AT) - _built_address(code, *FIRST_RECORD_AT)) // RECORD
    return {
        "records": stretches - 1,
        "faces": room["faces"],
        "lights": code.immediate(0x8002e42c, "slti $v0, $s5, {}"),
        "spikes": room["spikes"],
        "captivators": room["captivators"],
        "crumbling": room["crumbling"],
        "vanishing": room["vanishing"],
        "objects": room["objects"] - 1,
        "platform.length": side - 1,
        "spikes.type": code.immediate(0x8002a0dc, "addiu $v0, $zero, {}"),
        "glow.types": frozenset(code.immediate(a, p) for a, p in ((0x80029758, "addiu $t6, $zero, {}"),
                                                                   (0x8002975c, "addiu $t5, $zero, {}"),
                                                                   (0x80029760, "addiu $t4, $zero, {}"))),
        "key.type": code.immediate(0x80027b4c, "addiu $t0, $zero, {}"),
        "block.kinds": code.immediate(0x80027b64, "sltiu $v0, $v0, {}"),
        "numbered.from": -code.immediate(0x80035630, "addiu $v0, $v0, {}"),
        "numbered.count": code.immediate(0x8003563c, "sltiu $v0, $v1, {}"),
        "inner.from": code.immediate(0x800271e4, "addiu $t0, $zero, {}"),
        "inner.below": code.immediate(0x800279b4, "slti $v0, $t0, {}"),
        "captivators.from": -code.immediate(0x8003b678, "addiu $v0, $v1, {}"),
    }


def _figure(v):
    if isinstance(v, range):
        return f"{v.start} to {v.stop - 1}"
    if isinstance(v, (set, frozenset)):
        return ", ".join(str(x) for x in sorted(v))
    return str(v)


def figure_failures(r):
    """Where a cap or a loader figure the checks hold is not what the executable's reading gives, a line each."""
    figures = [(f"the cap on {what}", CAPS[what], r[what]) for what in sorted(set(CAPS) & set(r))]
    figures += [
        ("the list of untraced caps", set(UNTRACED), set(CAPS) - set(r)),
        ("the length cap", LENGTH_CAP, r["platform.length"]),
        ("the moving spikes' type", MOVING_SPIKES, r["spikes.type"]),
        ("the glow loader's set of types", PLAIN_ONLY - {MOVING_SPIKES}, r["glow.types"]),
        ("the key's type", KEY, r["key.type"]),
        ("the count of block kinds", BLOCK_KINDS, r["block.kinds"]),
        ("the run of numbered types", range(min(NUMBERED), max(NUMBERED) + 1),
         range(r["numbered.from"], r["numbered.from"] + r["numbered.count"])),
        ("the run of inner cells", INNER, range(r["inner.from"], r["inner.below"])),
        ("the first captivator", min(CAPTIVATORS), r["captivators.from"]),
    ]
    return [f"{what} is {_figure(held)}, not the executable's figure, {_figure(read)}" for what, held, read in figures if held != read]


# The words the rebuild writes differently outside the unread mask, each a leftover nothing on its level reads, by its count on the US disc.
US_RESIDUALS = {
    # the clock's f2, which the loader never turns
    "kind 0..4 object type 8 f2": 27,
    # an editor's leftovers in the unused slots of five platforms
    "kind 5 slot 2 type": 4,
    "kind 5 slot 3 type": 4,
    "kind 5 slot 4 type": 4,
    "kind 5 slot 5 type": 4,
    "kind 5 slot 2 f4": 1,
    # a deleted object's constants on three lasers
    "kind 8 slot 0 f10": 3,
    "kind 8 slot 0 f14": 3,
    # a platform's position words on two blocks that were once platforms
    **{f"kind 2 record word {w}": 1 for w in range(119, 125)},
    **{f"kind 6 record word {w}": 1 for w in range(119, 125)},
    # a slot's kind word, the scratch the game writes before it reads
    "kind 0..4 object type 35 kind word": 1,
    # LEVEL 125's two yellow teleporters, the one chain the disc left unlinked
    "kind 0..4 object type 5 f6": 1,
    # the type of a vanishing block's other slots, read for a captivator walking that face, which no shipped level brings there
    "kind 7 slot 1 type": 58,
    "kind 7 slot 2 type": 5,
    "kind 7 slot 3 type": 6,
    "kind 7 slot 4 type": 6,
    "kind 7 slot 5 type": 6,
}
# The levels whose rebuild has other records than the disc, by what it leaves out or writes.
US_DROPPED = {UNFLAGGED: 144, BARE_RECORDS: 2}
# The tables by release. The Japanese disc's levels move no count; the PAL disc's HIRO slot 19 holds the catalogue in the
# lesson's place, with clocks and vanishing blocks of its own, and its BONUS 30 is a level of its own with no settings
# record and no trailer.
RESIDUALS = {
    "us": US_RESIDUALS,
    "eu": {**US_RESIDUALS, "kind 0..4 object type 8 f2": 30, "kind 7 slot 1 type": 62},
    "jp": US_RESIDUALS,
}
DROPPED = {"us": US_DROPPED, "eu": {UNFLAGGED: 142, BARE_RECORDS: 2, NO_TRAILER: 1}, "jp": US_DROPPED}


def slot_figures(disc):
    """What the disc's slots hold, as the docs state it of the NTSC-U disc: the bare slots on blocks
    of kinds 0 to 4, the unused slots of the four payload kinds that are -1
    throughout, by slot, the objects on those slots, the levels they stand on
    and how many are a fire or a type 4 alone in the second slot of a crumbling
    or vanishing block, and how the pickups are numbered."""
    bare, unset, totals = 0, {k: Counter() for k in PAYLOAD_KINDS}, Counter()
    left = Counter()
    numbered = ordered = 0
    repeats = []
    for theme, path in packs(disc):
        pak = Pak(disc.read_file(path), path)
        for i in range(len(pak)):
            L = Level(pak.level(i), pak.name(i), theme)
            walked, every, here = [], [], 0
            for r in L.records:
                for j, s in enumerate(r.slots):
                    if r.kind < BLOCK_KINDS and list(s[1:]) == BARE[1:] and (j == 0 or s[0] == -1):
                        bare += 1
                    if s[1] in PICKUPS and r.kind != UNPLACED_KIND:
                        every.append(s[5])
                        if r.kind < BLOCK_KINDS:
                            walked.append(s[5])
                if r.kind in PAYLOAD_KINDS:
                    totals[r.kind] += 1
                    for j in range(2 if r.kind in SPAN_KINDS else 1, FACES):
                        s = r.slots[j]
                        unset[r.kind][j] += all(w == -1 for w in s)
                        if s[1] > 0:
                            here += 1
                            left["alone"] += (r.kind in (CRUMBLING_KIND, VANISHING_KIND) and j == 1 and s[1] in (1, 4)
                                              and all(w == -1 for w in s[:1] + s[2:]))
            left["objects"] += here
            left["levels"] += here > 0
            if any(n != -1 for n in walked):
                numbered += 1
                ordered += walked == list(range(len(walked)))
                every = [n for n in every if n != -1]
                if len(set(every)) != len(every):
                    repeats.append((path, i))
    return {"bare": bare, "unset": {k: (min(c.values()), max(c.values()), totals[k]) for k, c in unset.items()},
            "left": (left["objects"], left["levels"], left["alone"]),
            "numbered": numbered, "ordered": ordered, "repeats": sorted(repeats)}


def check(disc, release, out=print):
    """Rebuild every level of the disc from its fields and hold the result to the
    disc: in play, and word for word outside the unread mask, with the pickup
    numbers of the release's unnumbered levels masked. Returns (semantic failures,
    residual classes, levels whose records the rebuild does not keep one for one,
    by what differs)."""
    classes, examples, failures, dropped = Counter(), {}, [], Counter()
    constants = {}
    levels = 0
    for theme, path in packs(disc):
        pak = Pak(disc.read_file(path), path)
        for i in range(len(pak)):
            L = Level(pak.level(i), pak.name(i), theme)
            C = Level(canonical(project_of_level(L)), L.name, theme)
            levels += 1
            failures += [f"{L.name}: {m}" for m in C.verify()]
            failures += [f"{L.name}: {m}" for m in compare(L, C)]
            dropped.update(stripped(L)[1].keys())
            diff_words(L, C, classes, examples, release)
            for r in L.records:
                for o in r.objects:
                    constants.setdefault(o.type, Counter())[(o.f[7], o.f[8], o.v)] += 1
    failures += trio_failures(constants)
    out(f"{levels} levels rebuilt; every rebuild verifies and plays as the disc's level does"
        if not failures else f"{levels} levels rebuilt; {len(failures)} differ in play:")
    for f in failures:
        out(f"  {f}")
    out(f"{dropped[UNFLAGGED]} levels leave out a settings record with no flag set, "
        f"{dropped[BARE_RECORDS]} fold a record carrying nothing into a plain block, "
        f"{dropped[NO_TRAILER]} gain a trailer where the file ends at its count")
    if not classes:
        out("no word differs outside the unread mask")
    for what, n in sorted(classes.items(), key=lambda kv: -kv[1]):
        out(f"{n:5} x {what}")
        for e in examples[what][:3]:
            out(f"        {e}")
    return failures, classes, dropped


def trio_failures(constants):
    """Where the three constants the writer holds for a type are not the ones most
    of the disc's objects of that type carry."""
    out = []
    for t, seen in sorted(constants.items()):
        mode = seen.most_common(1)[0][0]
        held = TRIO.get(t, NO_TRIO)
        if mode != held:
            out.append(f"type {t} carries {mode} on {seen[mode]} of {sum(seen.values())} objects, "
                       f"where the writer holds {held}")
    return out


def residuals(classes, dropped, release):
    """What the check found that the release's tables do not list, a line each."""
    words, levels = RESIDUALS[release], DROPPED[release]
    out = []
    for what in sorted(set(classes) | set(words)):
        if classes.get(what, 0) != words.get(what, 0):
            out.append(f"{classes.get(what, 0)} x {what}, where the table lists {words.get(what, 0)}")
    for what in sorted(set(dropped) | set(levels)):
        if dropped.get(what, 0) != levels.get(what, 0):
            out.append(f"{dropped.get(what, 0)} levels with {what}, where the table lists {levels.get(what, 0)}")
    return out
