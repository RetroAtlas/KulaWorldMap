"""What the aligner's and the map writer's tests share: an executable of a few routines, where each reading in it
stands, and copies of it laid out as another release lays out the same code, every routine shifted by its own
amount, a word put in beside a reading, a register renamed throughout a routine, one that another routine shadows
with the same opcodes and one that none does, a reading given by another instruction, a routine returning early on
the copy, one routine twice over, one shifted and renamed with the words it builds kept, that one with a word put
in between its readings, one laid twice in its place, a renamed routine with a word put in after a reading, a count
kept in another register, a routine left out, and a routine whose record is renamed beside its callee's with a word
put in before its reading, so its call alone tells it; a copy may carry other counts in its routines, words of data
after its code and another gp."""

import sys
from collections import namedtuple
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from kula_align import Anchor, Listing  # noqa: E402
from motion_fixture import (AT, addiu, addu, beq, code, jal, jr, lh, lui, lw, ori, sb, sh, sll, sra, subu, sw,  # noqa: E402
                            xori)

Copy = namedtuple("Copy", "listing starts places")


def branch(rs, rt, ahead):
    """A beq over that many instructions, the same word wherever it stands."""
    return beq(rs, rt, 0, 4 * (ahead + 1))


def pill(callee, load=addiu, counts=(360, 840), fill=(sll("v0", "v1", 2), addu("v0", "v0", "v1")), kept="v0"):
    """The pill's routine, its second count loaded by the instruction given into the register given, its two counts
    and the run that fills its word as given."""
    return [addiu("sp", "sp", -24), sw("ra", "sp", 16), lw("v0", "a0", 20), lh("v1", "a0", 12),
            addiu("v0", "zero", counts[0]), sw("v0", "a0", 36), *fill,
            sh("v0", "a0", 40), lw("v1", "a0", 44), branch("v1", "zero", 3), load(kept, "zero", counts[1]),
            sw(kept, "a0", 48), jal(callee), addiu("a0", "a0", 4), lw("ra", "sp", 16), jr("ra"), addiu("sp", "sp", 24)]


def clock(callee, word=-17288, record="a1"):
    """The clock's routine over the register it takes its record in, the two words it builds its own."""
    return [addiu("sp", "sp", -24), sw("ra", "sp", 16), lw("v1", record, 12), lui("v0", 0x8888), ori("v0", "v0", 0x8889),
            lui("at", 0x800a), lw("a2", "at", word), sra("v0", "v1", 5), addiu("v0", "v0", 1), sh("v0", record, 4),
            lui("v1", 0x0080), ori("v1", "v1", 0x8080), sw("v1", record, 8), xori("v0", "v0", 1), sb("v0", record, 2),
            jal(callee), addiu("a0", record, 8), lw("ra", "sp", 16), jr("ra"), addiu("sp", "sp", 24)]


def spikes(s, a, down, hold, step=-1):
    """The spikes' routine over the registers it keeps its record and its argument in; the same opcodes over other
    registers and numbers are the vanishing block's."""
    return [addiu("sp", "sp", -32), sw("ra", "sp", 24), sw(s, "sp", 20), lw(s, a, 0), lw("v0", a, 4), lh("v1", a, 2),
            sll("v0", "v0", 1), addu("v0", "v0", "v1"), sh("v0", a, 10), lh("v1", a, 8), sb("v1", a, 1),
            lh("v0", s, 6), addiu("v1", "zero", down), branch("v0", "v1", 3), sb("v0", s, 3), xori("v0", "v0", 1),
            sw("v0", s, 12), lw(s, "sp", 20), lh("v0", a, 8), addiu("v1", "zero", hold), sh("v1", a, 10),
            lw("v1", a, 16), sll("v1", "v1", 1), addiu("v0", "v0", step), sh("v0", a, 8), addu("v0", "v0", "v1"),
            sw("v0", a, 12), lw("v1", a, 20), sra("v1", "v1", 3), sb("v1", a, 5), lw("ra", "sp", 24), jr("ra"),
            addiu("sp", "sp", 32)]


def step(callee):
    return [lw("v0", "a0", 0), lh("v1", "a0", 4), addu("v0", "v0", "v1"), sll("v1", "v1", 2), subu("v0", "v0", "v1"),
            addiu("v0", "v0", 1), sh("v0", "a0", 4), sb("v1", "a0", 6), lw("v1", "a0", 8), sw("v1", "a0", 12), jr("ra"),
            sw("v0", "a0", 0)]


def twin(callee, s="s0", count=7):
    """The twin's routine over the register it keeps its record in; no other routine has its opcodes."""
    return [addiu("sp", "sp", -40), sw("ra", "sp", 32), sw(s, "sp", 28), addu(s, "a0", "zero"), lw("v0", s, 0),
            lh("v1", s, 4), sll("v0", "v0", 1), subu("v0", "v0", "v1"), sb("v0", s, 8), lui("at", 0x800b),
            lw("v1", "at", 1234), sra("v1", "v1", 2), addiu("v0", "zero", count), sh("v0", s, 10), xori("v1", "v1", 3),
            sw("v1", s, 12), lw("a0", s, 16), jal(callee), addiu("a1", "zero", 2), lw(s, "sp", 28),
            lw("ra", "sp", 32), jr("ra"), addiu("sp", "sp", 40)]


def caller(callee, s="s0"):
    """The caller's routine over the register it keeps its record in: no word, no immediate above the common ones and
    one call, which alone tells it from another routine."""
    return [addiu("sp", "sp", -24), sw("ra", "sp", 16), sw(s, "sp", 12), addu(s, "a0", "zero"), lh("v0", s, 6),
            sb("v0", s, 9), lw("a0", s, 16), jal(callee), addiu("a1", "zero", 3), lh("v0", s, 4), addiu("v0", "v0", 5),
            sh("v0", s, 4), lw(s, "sp", 12), lw("ra", "sp", 16), jr("ra"), addiu("sp", "sp", 24)]


ROUTINES = {"pill": pill, "clock": clock, "spikes": lambda callee: spikes("s0", "a0", 63, 14), "step": step,
            "vanish": lambda callee: spikes("s5", "a1", 91, 9), "caller": caller, "twin": twin}
ORDER = ("pill", "clock", "spikes", "step", "vanish", "caller", "twin")
CALLS = {"caller": "clock"}      # the routine a routine calls, where it is not the step
TAIL = 16     # words after the last routine, which decode as nop

# Each reading's routine and its position in it, the list it would stand in and its key.
ANCHORS = [
    ("pill", 4, "IMMEDIATES", "pill.lethargy"),
    ("pill", 6, "MULTIPLIERS", "pill.fill+0"),
    ("pill", 7, "MULTIPLIERS", "pill.fill+1"),
    ("pill", 10, "CHECKS", "the pill tests its word"),
    ("pill", 11, "IMMEDIATES", "pill.invincible"),
    ("clock", 3, "DIVISORS", "clock.shown.hi"),
    ("clock", 4, "DIVISORS", "clock.shown.lo"),
    ("clock", 7, "DIVISORS", "clock.shown.sa"),
    ("clock", 8, "IMMEDIATES", "clock.plus"),
    ("clock", 10, "GREYS", "clock.grey.hi"),
    ("clock", 11, "GREYS", "clock.grey.lo"),
    ("clock", 14, "CHECKS", "and marks the clock turned"),
    ("spikes", 11, "CHECKS", "the spikes read their phase"),
    ("spikes", 12, "IMMEDIATES", "spikes.down"),
    ("spikes", 13, "CHECKS", "and test it"),
    ("spikes", 16, "CHECKS", "and store it"),
    ("spikes", 19, "IMMEDIATES", "spikes.hold"),
    ("spikes", 23, "IMMEDIATES", "spikes.step"),
    ("step", 5, "IMMEDIATES", "step.one"),
    ("caller", 10, "IMMEDIATES", "caller.plus"),
    ("twin", 12, "IMMEDIATES", "twin.count"),
]

GAPS = {"pill": 1, "clock": 3, "spikes": 6, "step": 2, "vanish": 4, "caller": 7, "twin": 5}    # words before each routine
INSERTED = {"pill": 12, "clock": 9}      # where a word is put into a routine
PUT_IN = subu("a2", "a2", "v1")
RETURNED = {"spikes": 20, "vanish": 20}      # where a return is put into a routine, which cuts it in two
EDGED = {"spikes": 17, "vanish": 17}      # where a word is put in after the store of the spikes' phase, and into its shadow
KEPT = {"pill": 12}          # where a word is put in after the load of the pill's second count
CHAINED = {"caller": 9}      # where a word is put in before the caller's reading


def lay(order, gaps, change, routines, data=()):
    """The executable's words and where each routine starts, the routines in order each after its gap of nops,
    `routines` giving a routine's builder in place of its own and `change` its words as the copy lays them, `tail`
    where the words after the last one start, and `data` the words laid after the tail."""
    starts = {}
    for _ in range(2):      # a callee's address is known once the routines before it are laid
        words, at, known, starts = [], AT, starts, {}
        for name in order:
            gap = gaps.get(name, 0)
            words += [0] * gap
            at += 4 * gap
            body = change(name, routines[name](known.get(CALLS.get(name, "step"), AT)))
            starts.setdefault(name, at)
            words += body
            at += 4 * len(body)
        starts["tail"] = at
        starts["data"] = at + 4 * TAIL
    return words + [0] * TAIL + list(data), starts


def laid(order=ORDER, gaps=None, change=None, inserted=None, routines=None, data=(), **at):
    """A copy laid out as asked: its listing, its routines' starts and each reading's address in it, `at` giving
    its code another base, gp or record."""
    words, starts = lay(order, gaps or {}, change or (lambda name, words: words), {**ROUTINES, **(routines or {})}, data)
    inserted = inserted or {}
    places = {key: starts[r] + 4 * (i + (1 if i >= inserted.get(r, 1 << 30) else 0)) for r, i, _, key in ANCHORS}
    return Copy(Listing(code(*words, **at)), starts, places)


def base():
    return laid()


def shifted():
    """Every routine shifted by its own amount."""
    return laid(gaps=GAPS)


def put_in(name, words, where=INSERTED, word=PUT_IN):
    at = where.get(name)
    return words if at is None else words[:at] + [word] + words[at:]


def broken():
    """A word put into the pill's routine after its last reading, and into the clock's between its readings."""
    return laid(change=put_in, inserted=INSERTED)


def renamed():
    """The spikes' record kept in another register throughout, the vanishing block's routine shadowing it."""
    return laid(routines={"spikes": lambda callee: spikes("s5", "a0", 63, 14)})


def recast():
    """The twin's record kept in another register throughout, no routine shadowing it."""
    return laid(routines={"twin": lambda callee: twin(callee, "s5")})


def reworked():
    """The pill's second count loaded by another instruction."""
    return laid(routines={"pill": lambda callee: pill(callee, ori)})


def twins():
    """The twin's routine laid twice over, one after the other."""
    return laid(order=ORDER + ("twin",))


def returned():
    """A return put into the spikes' routine before its last readings and into the vanishing block's, which
    shadows it, at the same place, cutting each in two on the copy."""
    return laid(change=lambda name, words: put_in(name, words, RETURNED, jr("ra")), inserted=RETURNED)


def relaid():
    """Every routine shifted by its own amount and the clock's record kept in another register throughout, the two
    words the clock builds and its call kept."""
    return laid(gaps=GAPS, routines={"clock": lambda callee: clock(callee, record="a3")})


def wedged():
    """Every routine shifted by its own amount and the clock's record kept in another register throughout, with a
    word put into the pill's routine after its last reading and into the clock's between its readings."""
    return laid(gaps=GAPS, routines={"clock": lambda callee: clock(callee, record="a3")}, change=put_in, inserted=INSERTED)


def doubled():
    """The clock's routine laid twice over in its place, a gap before each and before the routine after them."""
    return laid(order=("pill", "clock", "clock", "spikes", "step", "vanish", "caller", "twin"), gaps={"clock": 2, "spikes": 2})


def edged():
    """The spikes' record kept in another register throughout and a word put in after the store of its phase, and
    into the vanishing block's routine, which shadows it, at the same place."""
    return laid(routines={"spikes": lambda callee: spikes("s5", "a0", 63, 14)},
                change=lambda name, words: put_in(name, words, EDGED), inserted=EDGED)


def kept():
    """The pill's second count kept in another register and a word put in after its load."""
    return laid(routines={"pill": lambda callee: pill(callee, kept="t0")},
                change=lambda name, words: put_in(name, words, KEPT), inserted=KEPT)


def unshadowed():
    """The vanishing block's routine left out, so nothing shadows the spikes'."""
    return laid(order=("pill", "clock", "spikes", "step", "caller", "twin"))


def chained():
    """Every routine shifted by its own amount, the clock's and the caller's records kept in other registers
    throughout, and a word put into the caller's routine before its reading, so the caller is told by its call to the
    clock and by nothing else."""
    return laid(gaps=GAPS, routines={"clock": lambda callee: clock(callee, record="a3"), "caller": lambda callee: caller(callee, "s5")},
                change=lambda name, words: put_in(name, words, CHAINED), inserted=CHAINED)


def anchors_of(copy):
    """The readings as the aligner's anchors, at their addresses in the copy."""
    return [Anchor("fixture", kind, key, copy.places[key]) for _, _, kind, key in ANCHORS]
