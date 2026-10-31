"""What the aligner's and the map writer's tests share: an executable of a few routines, where each reading in it
stands, and copies of it laid out as another release lays out the same code, every routine shifted by its own
amount, a word put in beside a reading, a register renamed throughout a routine, one that another routine shadows
with the same opcodes and one that none does, a reading given by another instruction, and one routine twice over."""

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


def pill(callee, load=addiu):
    """The pill's routine, its second count loaded by the instruction given."""
    return [addiu("sp", "sp", -24), sw("ra", "sp", 16), lw("v0", "a0", 20), lh("v1", "a0", 12),
            addiu("v0", "zero", 360), sw("v0", "a0", 36), sll("v0", "v1", 2), addu("v0", "v0", "v1"),
            sh("v0", "a0", 40), lw("v1", "a0", 44), branch("v1", "zero", 3), load("v0", "zero", 840),
            sw("v0", "a0", 48), jal(callee), addiu("a0", "a0", 4), lw("ra", "sp", 16), jr("ra"), addiu("sp", "sp", 24)]


def clock(callee):
    return [addiu("sp", "sp", -24), sw("ra", "sp", 16), lw("v1", "a1", 12), lui("v0", 0x8888), ori("v0", "v0", 0x8889),
            lui("at", 0x800a), lw("a2", "at", -17288), sra("v0", "v1", 5), addiu("v0", "v0", 1), sh("v0", "a1", 4),
            lui("v1", 0x0080), ori("v1", "v1", 0x8080), sw("v1", "a1", 8), xori("v0", "v0", 1), sb("v0", "a1", 2),
            jal(callee), addiu("a0", "a1", 8), lw("ra", "sp", 16), jr("ra"), addiu("sp", "sp", 24)]


def spikes(s, a, down, hold):
    """The spikes' routine over the registers it keeps its record and its argument in; the same opcodes over other
    registers and numbers are the vanishing block's."""
    return [addiu("sp", "sp", -32), sw("ra", "sp", 24), sw(s, "sp", 20), lw(s, a, 0), lw("v0", a, 4), lh("v1", a, 2),
            sll("v0", "v0", 1), addu("v0", "v0", "v1"), sh("v0", a, 10), lh("v1", a, 8), sb("v1", a, 1),
            lh("v0", s, 6), addiu("v1", "zero", down), branch("v0", "v1", 3), sb("v0", s, 3), xori("v0", "v0", 1),
            sw("v0", s, 12), lw(s, "sp", 20), lh("v0", a, 8), addiu("v1", "zero", hold), sh("v1", a, 10),
            lw("v1", a, 16), sll("v1", "v1", 1), addiu("v0", "v0", -1), sh("v0", a, 8), addu("v0", "v0", "v1"),
            sw("v0", a, 12), lw("v1", a, 20), sra("v1", "v1", 3), sb("v1", a, 5), lw("ra", "sp", 24), jr("ra"),
            addiu("sp", "sp", 32)]


def step(callee):
    return [lw("v0", "a0", 0), lh("v1", "a0", 4), addu("v0", "v0", "v1"), sll("v1", "v1", 2), subu("v0", "v0", "v1"),
            addiu("v0", "v0", 1), sh("v0", "a0", 4), sb("v1", "a0", 6), lw("v1", "a0", 8), sw("v1", "a0", 12), jr("ra"),
            sw("v0", "a0", 0)]


def twin(callee, s="s0"):
    """The twin's routine over the register it keeps its record in; no other routine has its opcodes."""
    return [addiu("sp", "sp", -40), sw("ra", "sp", 32), sw(s, "sp", 28), addu(s, "a0", "zero"), lw("v0", s, 0),
            lh("v1", s, 4), sll("v0", "v0", 1), subu("v0", "v0", "v1"), sb("v0", s, 8), lui("at", 0x800b),
            lw("v1", "at", 1234), sra("v1", "v1", 2), addiu("v0", "zero", 7), sh("v0", s, 10), xori("v1", "v1", 3),
            sw("v1", s, 12), lw("a0", s, 16), jal(callee), addiu("a1", "zero", 2), lw(s, "sp", 28),
            lw("ra", "sp", 32), jr("ra"), addiu("sp", "sp", 40)]


ROUTINES = {"pill": pill, "clock": clock, "spikes": lambda callee: spikes("s0", "a0", 63, 14), "step": step,
            "vanish": lambda callee: spikes("s5", "a1", 91, 9), "twin": twin}
ORDER = ("pill", "clock", "spikes", "step", "vanish", "twin")
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
    ("twin", 12, "IMMEDIATES", "twin.count"),
]

GAPS = {"pill": 1, "clock": 3, "spikes": 6, "step": 2, "vanish": 4, "twin": 5}    # words before each routine
INSERTED = {"pill": 12, "clock": 9}      # where a word is put into a routine
PUT_IN = subu("a2", "a2", "v1")


def lay(order, gaps, change, routines):
    """The executable's words and where each routine starts, the routines in order each after its gap of nops,
    `routines` giving a routine's builder in place of its own and `change` its words as the copy lays them, and
    `tail` where the words after the last one start."""
    starts, callee = {}, AT
    for _ in range(2):      # the callee's address is known once the routines before it are laid
        words, at, starts = [], AT, {}
        for name in order:
            gap = gaps.get(name, 0)
            words += [0] * gap
            at += 4 * gap
            body = change(name, routines[name](callee))
            starts.setdefault(name, at)
            words += body
            at += 4 * len(body)
        starts["tail"] = at
        callee = starts["step"]
    return words + [0] * TAIL, starts


def laid(order=ORDER, gaps=None, change=None, inserted=None, routines=None):
    """A copy laid out as asked: its listing, its routines' starts and each reading's address in it."""
    words, starts = lay(order, gaps or {}, change or (lambda name, words: words), {**ROUTINES, **(routines or {})})
    inserted = inserted or {}
    places = {key: starts[r] + 4 * (i + (1 if i >= inserted.get(r, 1 << 30) else 0)) for r, i, _, key in ANCHORS}
    return Copy(Listing(code(*words)), starts, places)


def base():
    return laid()


def shifted():
    """Every routine shifted by its own amount."""
    return laid(gaps=GAPS)


def put_in(name, words):
    at = INSERTED.get(name)
    return words if at is None else words[:at] + [PUT_IN] + words[at:]


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


def anchors_of(copy):
    """The readings as the aligner's anchors, at their addresses in the copy."""
    return [Anchor("fixture", kind, key, copy.places[key]) for _, _, kind, key in ANCHORS]
