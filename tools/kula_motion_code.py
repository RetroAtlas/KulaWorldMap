"""The executable as the readings read it: a word, an immediate, a multiplier,
a grey, a divisor or a stretch's stores, each matched against the instruction
it lives in, with the frame loop's checks and the units of "The frame" in
docs/motion.md, the registers and opcodes a read goes by, and the words more
than one reading tests.
"""
import math
import re
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import EXE_BASE
from mips import decode

TURN = 4096          # the angle that is one full turn
BLOCK = 512          # units across a block
ONE = 4096           # a matrix's unit, 1.0 in the GTE's fixed point
HZ = 60
PHASES = 4           # the values a phase field takes

CHECKS = [
    # The frame loop.
    (0x80040a78, "addiu $a0, $a0, -588", "before its frame loop a level installs the callback at 0x8003fdb4"),
    (0x80040a7c, "jal 0x80065e28", "through the system library"),
    (0x8003fdbc, "sw $v0, -17288($at)", "which sets the flag at 0x800cbc78"),
    (0x80040b04, "jal 0x80051d08", "and each pass of the loop waits once"),
    (0x80051d18, "beq $t1, $zero, 0x80051d10", "until the flag is set"),
    (0x80040ad0, "lw $v0, 22316($v0)", "the half-rate word the loop reads is 0x800a572c"),
    (0x80039608, "lw $v0, 13264($v0)", "the view word the updates read is 0x800a33d0"),
]
IMMEDIATES = []
MULTIPLIERS = []
DIVISORS = []
GREYS = []
SCANS = []

# The instructions whose first register is read rather than written.
READS_FIRST = {"sb", "sh", "sw", "swl", "swr", "mtc2", "ctc2", "mthi", "mtlo",
               "mult", "multu", "div", "divu", "beq", "bne", "blez", "bgtz", "bltz", "bgez",
               "bltzal", "bgezal", "jr"}
STORES = {0x28, 0x29, 0x2a, 0x2b, 0x2e}   # the store opcodes
WIDTHS = {"sb": 1, "sh": 2, "sw": 4, "swc2": 4}   # bytes a store writes; swl and swr stay within their word
ARGUMENTS = ("a0", "a1", "a2", "a3")
CALLER_SAVED = ("at", "v0", "v1", *ARGUMENTS, *(f"t{i}" for i in range(10)), "ra")
GP_INIT = (0x80069a04, 0x80069a08)
GP = 0x800a2f38
BALL_RECORD = 0x800ba114  # the ball's record, which the pills' words lie in

BALL = "30"               # the ball's type in the table
ICE = 2
FIRE, ACID = 1, 4         # the kinds that harm by standing on them
INVISIBLE = 3
LIT = -2                  # a lit beam's cell in the lattice
CRUMBLING_UNDER = 96      # the ball's word for standing on a crumbling block
ADD = 1              # the blend that adds a quad to what is behind it


class Code:
    def __init__(self, blob):
        self.blob = blob

    def word(self, addr):
        return struct.unpack_from("<I", self.blob, addr - EXE_BASE)[0]

    def holds(self, addr, n=4):
        return EXE_BASE <= addr and addr + n <= EXE_BASE + len(self.blob)

    def read(self, addr, n):
        return self.blob[addr - EXE_BASE:addr - EXE_BASE + n]

    def text(self, addr):
        return decode(self.word(addr), addr)[0]

    def immediate(self, addr, pattern):
        text = self.text(addr)
        rx = "^" + re.escape(pattern).replace(r"\{\}", r"(-?(?:0x)?[0-9a-f]+)") + "$"
        m = re.match(rx, text)
        if not m:
            sys.exit(f"0x{addr:08x} reads `{text}`, not `{pattern}`")
        return int(m.group(1), 0) if m.lastindex else None

    def address(self, lui, addiu):
        """The address a lui and the addiu or load after it build, in RAM's mirror."""
        hi = re.match(r"lui \$\w+, (0x[0-9a-f]+)$", self.text(lui))
        lo = re.match(r"(?:addiu \$\w+, \$\w+, |lw \$\w+, )(-?\d+)", self.text(addiu))
        if not hi or not lo:
            sys.exit(f"0x{lui:08x} and 0x{addiu:08x} read `{self.text(lui)}` and `{self.text(addiu)}`, not an address")
        return (0x80000000 | (int(hi.group(1), 0) << 16)) + int(lo.group(1))

    def word_of(self, hi, hp, lo, lp):
        """The word a lui and an ori hold between them."""
        return (self.immediate(hi, hp) << 16) | (self.immediate(lo, lp) & 0xFFFF)

    def grey(self, hi, hp, lo, lp):
        """The level of a colour word whose three channels are one."""
        word = self.word_of(hi, hp, lo, lp)
        if word != (word & 0xFF) * 0x010101:
            sys.exit(f"0x{hi:08x} and 0x{lo:08x} hold the colour 0x{word:08x}, not a grey")
        return word & 0xFF

    def divisor(self, hi, hp, lo, lp, sa, sp):
        """The number a multiply by a reciprocal and a shift divides by."""
        return round(2 ** (32 + self.immediate(sa, sp)) / self.word_of(hi, hp, lo, lp))

    def multiplier(self, addr, count, src, dst):
        """The factor applied to `src` by `count` instructions of shifts and adds."""
        coef = {src: 1, "zero": 0}
        for i in range(count):
            pc = addr + 4 * i
            text = self.text(pc)
            m = re.match(r"(sll|addu|subu) \$(\w+), \$(\w+)(?:, \$(\w+)|, (\d+))$", text)
            if m:
                op, rd, a, b, sa = m.groups()
                x, y = coef.get(a), coef.get(b) if b else 0
                if x is None or y is None:
                    coef[rd] = None
                elif op == "sll":
                    coef[rd] = x << int(sa)
                else:
                    coef[rd] = x + y if op == "addu" else x - y
            else:
                m = re.match(r"(\w+) \$(\w+)", text)
                if m and m.group(1) not in READS_FIRST and m.group(2) in coef and m.group(2) != "zero":
                    coef[m.group(2)] = None      # overwritten by something not a shift or add
        if coef.get(dst) is None:
            sys.exit(f"0x{addr:08x}: {dst} is not a multiple of {src} after {count} instructions")
        return coef[dst]

    def stores_to(self, addr):
        """Every store to `addr` through gp, or through $at after a lui, as (address, register stored)."""
        out = []
        words = struct.unpack_from(f"<{len(self.blob) // 4}I", self.blob)
        for i, w in enumerate(words):
            if w >> 26 not in STORES:
                continue
            base, imm = (w >> 21) & 31, w & 0xFFFF
            if imm >= 0x8000:
                imm -= 0x10000
            if base == 28:
                at = GP + imm
            elif base == 1 and i and words[i - 1] >> 16 == 0x3C01:
                at = (0x80000000 | ((words[i - 1] & 0xFFFF) << 16)) + imm
            else:
                continue
            if at == addr:
                out.append((EXE_BASE + 4 * i, (w >> 16) & 31))
        return out

    def resolved(self, start, end, base, span, calls=(), record=BALL_RECORD):
        """How many stores the stretch from `start` to `end` makes, each resolved to an address through `base`,
        which holds `record`, a register derived from it, gp, sp or a lui; none within the record's `span` of
        words, no pointer made into it, and the record handed on by the `calls` listed alone."""
        low, high = record + span[0], record + span[1] + 3
        held = {base: (record, True), "gp": (GP, False)}     # a register's address, and whether it is the record's address
        awaited = {where: (callee, handed) for where, callee, handed in calls}
        count, pc = 0, start
        while pc <= end:
            text = self.text(pc)
            if text.startswith("jal "):
                count += self.follow(pc + 4, held, low, high)     # the delay slot runs before the call
                handed = {r: a - record for r, (a, own) in held.items() if own and r in ARGUMENTS}
                callee, want = awaited.pop(pc, (0, None))
                if text != f"jal 0x{callee:08x}" or handed != want:
                    sys.exit(f"0x{pc:08x} `{text}` is handed the record in {handed}, which the reading does not follow")
                for r in CALLER_SAVED:
                    held.pop(r, None)
                pc += 8
                continue
            count += self.follow(pc, held, low, high)
            pc += 4
        if awaited:
            sys.exit(f"0x{start:08x}: the calls at {', '.join(f'0x{a:08x}' for a in awaited)} are not made")
        return count

    def follow(self, pc, held, low, high):
        """One instruction of a scanned stretch: a store resolved and counted, a pointer tracked, a register
        overwritten forgotten."""
        text = self.text(pc)
        m = re.match(r"(sb|sh|sw|swl|swr|swc2) \S+, (-?\d+)\(\$(\w+)\)$", text)
        if m:
            op, imm, reg = m.group(1), int(m.group(2)), m.group(3)
            if reg == "sp":
                return 1                                  # the stack cannot hold the record
            if reg not in held:
                sys.exit(f"0x{pc:08x} `{text}` stores through a register the scan cannot resolve")
            at = held[reg][0] + imm
            first, last = (at & ~3, (at & ~3) + 3) if op in ("swl", "swr") else (at, at + WIDTHS[op] - 1)
            if first <= high and last >= low:
                sys.exit(f"0x{pc:08x} `{text}` stores to 0x{at:08x}, within the span")
            return 1
        if text.startswith((".word", "jalr")) or (text.startswith("jr ") and text != "jr $ra"):
            sys.exit(f"0x{pc:08x} `{text}`, which the scan does not follow")
        m = re.match(r"(?:b\w+|j) .*0x([0-9a-f]{8})$", text)
        if m and int(m.group(1), 16) <= pc:
            sys.exit(f"0x{pc:08x} `{text}` loops back, which the scan does not follow")
        m = re.match(r"lui \$(\w+), (0x[0-9a-f]+)$", text)
        if m:
            held[m.group(1)] = (0x80000000 | (int(m.group(2), 0) << 16), False)
            return 0
        m = re.match(r"addiu \$(\w+), \$(\w+), (-?\d+)$", text)
        if m and m.group(2) in held:
            at, own = held[m.group(2)]
            self.point(pc, held, m.group(1), at + int(m.group(3)), own, low, high)
            return 0
        m = re.match(r"(?:addu|or) \$(\w+), \$(\w+), \$(\w+)$", text)
        if m and "zero" in m.groups()[1:]:
            src = m.group(2) if m.group(3) == "zero" else m.group(3)
            if src in held:
                self.point(pc, held, m.group(1), *held[src], low, high)
                return 0
        m = re.match(r"(\w+) \$(\w+)", text)
        if m and m.group(1) not in READS_FIRST:
            held.pop(m.group(2), None)
        return 0

    def point(self, pc, held, reg, at, own, low, high):
        """`reg` comes to hold the address `at`, unless that lies within the span."""
        if low <= at <= high:
            sys.exit(f"0x{pc:08x} `{self.text(pc)}` points into the span, at 0x{at:08x}")
        held[reg] = (at, own)


def dispatch(code, where, cases, default, what):
    """A table of cases by type holds the case each type is known to go to."""
    at, first, count = where
    for typ in range(first, first + count):
        case = 0x80000000 | code.word(at + 4 * (typ - first))
        if cases.get(typ, default) != case:
            sys.exit(f"{what} sends type {typ} to 0x{case:08x}")


def root(v, what):
    """The root of a reach the code holds squared."""
    r = math.isqrt(v)
    if r * r != v:
        sys.exit(f"{what} is {v}, not a square")
    return r
