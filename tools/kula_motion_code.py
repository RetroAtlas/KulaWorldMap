"""The executable as the readings read it: a word, an immediate, a multiplier,
a grey, a divisor or a stretch's stores, each matched against the instruction
it lives in, with the frame loop's checks and the units of "The frame" in
docs/motion.md, the registers and opcodes a read goes by, and the words more
than one reading tests.
"""
import json
import math
import re
import struct
import sys
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import BASE, RELEASES
from mips import decode

TURN = 4096          # the angle that is one full turn
BLOCK = 512          # units across a block
ONE = 4096           # a matrix's unit, 1.0 in the GTE's fixed point
PHASES = 4           # the values a phase field takes

CHECKS = [
    # The frame loop.
    (0x80040a78, "addiu $a0, $a0, -588", "before its frame loop a level installs the callback each blank runs"),
    (0x80040a7c, "jal 0x80065e28", "through the system library"),
    (0x8003fdbc, "sw $v0, -17288($at)", "which sets the flag the loop waits on"),
    (0x80040b04, "jal 0x80051d08", "and each pass of the loop waits once"),
    (0x80051d18, "beq $t1, $zero, 0x80051d10", "until the flag is set"),
    (0x80040ad0, "lw $v0, 22316($v0)", "the half-rate word the loop reads is the lethargy pill's mode word"),
    (0x80039608, "lw $v0, 13264($v0)", "the view word the updates read selects a second view the game never draws"),
]
IMMEDIATES = []
MULTIPLIERS = []
DIVISORS = []
GREYS = []
SCANS = []

# The instructions whose first register is read rather than written.
WALK = 64
READS_FIRST = {"sb", "sh", "sw", "swl", "swr", "mtc2", "ctc2", "mthi", "mtlo",
               "mult", "multu", "div", "divu", "beq", "bne", "blez", "bgtz", "bltz", "bgez",
               "bltzal", "bgezal", "jr"}
STORES = {0x28, 0x29, 0x2a, 0x2b, 0x2e}   # the store opcodes
WIDTHS = {"sb": 1, "sh": 2, "sw": 4, "swc2": 4}   # bytes a store writes; swl and swr stay within their word
ARGUMENTS = ("a0", "a1", "a2", "a3")
CALLER_SAVED = ("at", "v0", "v1", *ARGUMENTS, *(f"t{i}" for i in range(10)), "ra")
GP_INIT = (0x80069a04, 0x80069a08)
RECORD_INIT = (0x80036888, 0x8003688c)

# The address constants outside the lists, each with the kind of thing it is, by which it is found on another
# release's executable.
NAMED = {"GP_INIT": ("pair", GP_INIT), "RECORD_INIT": ("pair", RECORD_INIT)}

BALL = "30"               # the ball's type in the table
ICE = 2
FIRE, ACID = 1, 4         # the kinds that harm by standing on them
INVISIBLE = 3
LIT = -2                  # a lit beam's cell in the lattice
CRUMBLING_UNDER = 96      # the ball's word for standing on a crumbling block
ADD = 1              # the blend that adds a quad to what is behind it

MAPS = Path(__file__).resolve().parent / "maps"

# What a registered constant is, which says how it is found on another executable: an instruction or a routine's
# entry is placed as an anchor is, a pair that builds an address and the instructions a pattern matches are placed
# one by one, a data word and a word kept with its offset from gp are derived through the instructions that reach
# them, a table of cases the same way with its entries read, and a multiplier's run as a multiplier row is.
KINDS = ("instruction", "routine", "pair", "matched", "word", "offset", "table", "run")


def ints(v, n):
    return isinstance(v, tuple) and len(v) == n and all(isinstance(x, int) for x in v)


def matched(v):
    return isinstance(v, tuple) and v and len(v) % 2 == 0 \
        and all(isinstance(x, int) if i % 2 == 0 else isinstance(x, str) for i, x in enumerate(v))


FITS = {"instruction": lambda v: isinstance(v, int), "routine": lambda v: isinstance(v, int),
        "pair": lambda v: ints(v, 2), "matched": matched, "word": lambda v: isinstance(v, int),
        "offset": lambda v: ints(v, 2), "table": lambda v: ints(v, 3),
        "run": lambda v: isinstance(v, tuple) and len(v) == 4 and ints(v[:2], 2) and all(isinstance(x, str) for x in v[2:])}


def unhex(s):
    return int(s, 16)


# A leaf of a registered constant as a map writes it, back in the registry's own shape.
LEAVES = {"instruction": unhex, "routine": unhex, "word": unhex, "pair": lambda t: tuple(unhex(x) for x in t),
          "matched": lambda t: tuple(unhex(x) if i % 2 == 0 else x for i, x in enumerate(t)),
          "run": lambda t: (unhex(t[0]), *t[1:]), "offset": lambda t: (unhex(t[0]), t[1]),
          "table": lambda t: (unhex(t[0]), *t[1:])}


@lru_cache(maxsize=None)
def registry():
    """Every address constant the readers register by name, with its kind: the readers import this module, so they
    are reached from here once a name is asked for."""
    from kula_align import MODULES
    return {name: tuple(entry[:2]) for module in MODULES for name, entry in module.NAMED.items()}


def beside(kind, value, theirs):
    """Each leaf of the kind in a registered constant's value beside a map's value for it, the two nested alike."""
    if FITS[kind](value):
        yield value, theirs
    elif isinstance(value, dict):
        for k, v in value.items():
            yield from beside(kind, v, theirs[str(k)])
    elif isinstance(value, (tuple, list)):
        for v, t in zip(value, theirs):
            yield from beside(kind, v, t)


def rebuilt(kind, value, theirs):
    """A map's value for a registered constant in the registry's own shape, every address an int, every sequence a
    tuple, every key as the registry keys it and what is no leaf of the kind as the registry holds it."""
    if FITS[kind](value):
        return LEAVES[kind](theirs)
    if isinstance(value, dict):
        return {k: rebuilt(kind, v, theirs[str(k)]) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        return tuple(rebuilt(kind, v, t) for v, t in zip(value, theirs))
    return value


class Map:
    """Where each instruction the readers match on the base's executable stands on a release's, as the map writer
    writes it: the rows by the base's address, an absent row among them naming the instruction standing where a
    reading the release has no instruction for would be, a shift row the shift a divisor is laid out as and a
    reshaped row the instruction an immediate is laid out as with the value the hand gives it, the
    registered constants by name, the multipliers' runs with their counts and registers there, and the end screen's
    table as its count and its pairs by the index of each one's first entry, the word the release's pair letters and
    the digest of its two images. A map with pending rows is refused, and what a map has pending is read off its file
    without building it."""

    def __init__(self, data):
        pending = data.get("pending") or []
        if pending:
            left = ", ".join(str(p.get("key") or p.get("name") or p.get("address") or f"pair {p.get('pair')}") for p in pending)
            sys.exit(f"the {data['release']} map has {len(pending)} pending rows: {left}")
        self.release = data["release"]
        self.rows = {unhex(addr): row for addr, row in data["rows"].items()}
        self.names = data["names"]
        self.places = {}
        self.runs = {addr: (unhex(row["at"]), row["count"], row["src"], row["dst"])
                     for addr, row in self.rows.items() if "count" in row}
        block = data.get("words")
        self.words = None if block is None else \
            (block["count"], {int(i): (word, unhex(digest)) for i, (word, digest) in block["pairs"].items()})
        for name, (kind, _) in registry().items():
            if name not in self.names:
                continue
            for ours, theirs in self.shaped(name, lambda k, v, t: list(beside(k, v, t))):
                if kind in ("instruction", "routine"):
                    self.places[ours] = (unhex(theirs), None)
                elif kind == "pair":
                    self.places.update({a: (unhex(b), None) for a, b in zip(ours, theirs)})
                elif kind == "matched":
                    self.places.update({a: (unhex(b), p) for a, b, p in zip(ours[::2], theirs[::2], theirs[1::2])})
                elif kind == "run":
                    self.runs.setdefault(ours[0], (unhex(theirs[0]), *theirs[1:]))

    @classmethod
    def exists(cls, release):
        return (MAPS / f"{release}.json").exists()

    @classmethod
    def read(cls, release):
        """The release's map as its file holds it, or the tool's exit where there is none."""
        path = MAPS / f"{release}.json"
        if not path.exists():
            sys.exit(f"no map at {path}")
        return json.loads(path.read_text())

    @classmethod
    def load(cls, release):
        return cls(cls.read(release))

    @classmethod
    def pending(cls, release):
        """What the release's map has pending, read off its file without building the map, which refuses a map with
        pending rows."""
        return cls.read(release).get("pending") or []

    def shaped(self, name, walk):
        """What `walk` makes of a registered constant's value beside the map's, or the tool's exit where the two are
        not shaped alike."""
        try:
            return walk(*registry()[name], self.names[name])
        except (KeyError, IndexError, TypeError):
            sys.exit(f"the {self.release} map's value for {name} is not shaped as the registry's; regenerate it")

    def lookup(self, addr):
        """Where the base's instruction stands and the pattern the map keeps for it: a keyed row's own, a registered
        constant's where the row is a check's, else the check's text, or None where the map has neither."""
        row, placed = self.rows.get(addr), self.places.get(addr)
        if row is None:
            return placed
        at, pattern = row["at"], row.get("pattern")
        if pattern is None:
            pattern = placed[1] if placed and placed[1] is not None else row.get("text")
        if isinstance(at, list):
            at, pattern = at[0], pattern[0]
        return unhex(at), pattern

    def at(self, addr):
        """The release's address of the base's instruction, or the tool's exit where the map has no row for it."""
        found = self.lookup(addr)
        if found is None:
            sys.exit(f"the {self.release} map has no row for 0x{addr:08x}")
        return found[0]

    def absent(self, addr):
        """The row saying the release has no instruction for the reading at the base's `addr`, naming the instruction
        standing where the reading would be, or None where the release has the instruction."""
        row = self.rows.get(addr)
        return row if row is not None and row.get("absent") else None

    def reshaped(self, addr):
        """The row saying the release lays the immediate at the base's `addr` out as another instruction, whose value
        the hand table gives in the reading's own terms, or None where the map has no such row."""
        row = self.rows.get(addr)
        return row if row is not None and row.get("tier") == "reshaped" and "value" in row else None

    def shift(self, addr):
        """The row saying the release divides by a shift where the base's `addr` begins a multiply by a reciprocal,
        or None where the map has no such row."""
        row = self.rows.get(addr)
        return row if row is not None and "shift" in row else None

    def place(self, addr, pattern):
        """Where a reading at the base's instruction is read on the release and by what: a keyed row's own pattern, a
        registered constant's, a check row's text where the pattern given has no blank to read, or else the pattern
        given."""
        row = self.absent(addr)
        if row is not None:
            sys.exit(f"0x{addr:08x} has no instruction on {self.release}: `{row['text']}` stands at {row['at']} where "
                     "the reading would be")
        at, kept = self.lookup(addr) or (None, None)
        if at is None:
            sys.exit(f"the {self.release} map has no row for 0x{addr:08x}")
        if kept is None or (pattern is not None and "{}" in pattern and "{}" not in kept):
            return at, pattern
        return at, kept

    def halves(self, parts):
        """The addresses and patterns of a reading held in two or three instructions, each at its place: through the
        row the first keys where that row holds them all, else each through its own."""
        row = self.rows.get(parts[0])
        if row is not None and isinstance(row["at"], list):
            return tuple(x for at, pattern in zip(row["at"], row["pattern"]) for x in (unhex(at), pattern))
        return tuple(x for addr, pattern in zip(parts[::2], parts[1::2]) for x in self.place(addr, pattern))

    def run(self, addr):
        """Where a multiplier's run stands on the release, how many instructions it is and its registers there."""
        found = self.runs.get(addr)
        if found is None:
            self.place(addr, None)
            sys.exit(f"the {self.release} map has no run at 0x{addr:08x}")
        return found

    def named(self, name):
        """A registered constant's value on the release, in the registry's own shape."""
        if name not in self.names:
            sys.exit(f"the {self.release} map has no value for {name}; regenerate it")
        return self.shaped(name, rebuilt)


class Code:
    """The executable's bytes, addressed from `base`, where its first byte stands in memory, with the pointer the
    start sets in gp, the address of the ball's record, which the stores a reading resolves go by, and the map that
    says where each instruction the readers match on the base's executable stands on this one, none for the base,
    whose addresses are read as given; a reading the map says this executable has no instruction for reads as None
    once the instruction standing in its place is matched, a divisor it says this executable lays out as a shift
    reads as two to the shift once that shift is matched, and an immediate it says this executable lays out as
    another instruction reads as the hand's value once that instruction is matched."""

    def __init__(self, blob, base=RELEASES[BASE]["base"], gp=RELEASES[BASE]["gp"], record=RELEASES[BASE]["record"],
                 map=None):
        self.blob = blob
        self.base = base
        self.gp = gp
        self.record = record
        self.map = map

    @classmethod
    def of(cls, release, blob, map=None):
        """The release's executable at the addresses its entry of the release table gives, read through `map`."""
        entry = RELEASES[release]
        return cls(blob, entry["base"], entry["gp"], entry["record"], map)

    def own(self):
        """The executable read at its own addresses, with no map between, which a reader keyed by release takes."""
        return Code(self.blob, self.base, self.gp, self.record)

    def word(self, addr):
        return struct.unpack_from("<I", self.blob, addr - self.base)[0]

    def holds(self, addr, n=4):
        return self.base <= addr and addr + n <= self.base + len(self.blob)

    def read(self, addr, n):
        return self.blob[addr - self.base:addr - self.base + n]

    def text(self, addr):
        return decode(self.word(addr), addr)[0]

    def at(self, addr):
        """This executable's address of an instruction the readers match on the base's: the address itself with no
        map, and the tool's exit where the map has no row for it."""
        return addr if self.map is None else self.map.at(addr)

    def placed(self, addr):
        """As `at`, but None where the map has no row for the instruction."""
        if self.map is None:
            return addr
        found = self.map.lookup(addr)
        return None if found is None else found[0]

    def absent(self, addr):
        """Whether this executable has no instruction for the reading at the base's `addr`, as the map's row for it
        says: the instruction the row names has to stand where the reading would be, else the tool's exit."""
        row = None if self.map is None else self.map.absent(addr)
        if row is None:
            return False
        self.standing(row, addr)
        return True

    def standing(self, row, addr):
        """The instruction a hand row names, held to stand at the row's place, where the base's `addr` is read, or
        the tool's exit naming both."""
        at = unhex(row["at"])
        if self.text(at) != row["text"]:
            sys.exit(f"0x{at:08x} reads `{self.text(at)}`, not the `{row['text']}` standing where the base's "
                     f"0x{addr:08x} would be read")

    def place(self, addr, pattern):
        return (addr, pattern) if self.map is None else self.map.place(addr, pattern)

    def halves(self, parts):
        return parts if self.map is None else self.map.halves(parts)

    def named(self, name):
        """A registered constant's value on this executable, the registry's own with no map."""
        if name not in registry():
            sys.exit(f"{name} is not a constant the readers register")
        return registry()[name][1] if self.map is None else self.map.named(name)

    def names(self):
        """Every registered constant's value on this executable, by name."""
        return {name: self.named(name) for name in registry()}

    def words(self, count, pairs):
        """The end screen's table on this executable, its count and its pairs by the index of each one's first entry,
        the word the pair letters and the digest of its two images: the given with no map, else the map's."""
        if self.map is None:
            return count, pairs
        if self.map.words is None:
            sys.exit(f"the {self.map.release} map has no words block; regenerate it")
        return self.map.words

    def immediate(self, addr, pattern):
        """The immediate of the instruction the readers match at the base's `addr`, read where this executable has it
        and against the pattern the map keeps for it, the hand's value where the map says this executable lays it
        out as another instruction, or None where it says this executable has none."""
        if self.absent(addr):
            return None
        row = None if self.map is None else self.map.reshaped(addr)
        if row is not None:
            self.standing(row, addr)
            return row["value"]
        at, pattern = self.place(addr, pattern)
        return self.immediate_at(at, pattern, addr)

    def check(self, addr, pattern):
        """A check's instruction matched at its place, or a check the hand table declares absent held by the
        instruction standing where the test would be."""
        if self.absent(addr):
            return
        self.immediate(addr, pattern)

    def immediate_at(self, at, pattern, addr=None):
        """The immediate of the instruction at this executable's own `at`, matched against the pattern, the base's
        `addr` named beside it where the match fails."""
        text = self.text(at)
        rx = "^" + re.escape(pattern).replace(r"\{\}", r"(-?(?:0x)?[0-9a-f]+)") + "$"
        m = re.match(rx, text)
        if not m:
            where = f", where the base's 0x{addr:08x} is read" if addr is not None and addr != at else ""
            sys.exit(f"0x{at:08x} reads `{text}`, not `{pattern}`{where}")
        return int(m.group(1), 0) if m.lastindex else None

    def address(self, lui, addiu):
        """The address a lui and the addiu, load or store that uses it build, in RAM's mirror, through the adds
        between them."""
        hi_at, lo_at = self.at(lui), self.at(addiu)
        value = self.built(hi_at, lo_at)
        if value is None:
            where = f", where the base's 0x{lui:08x} and 0x{addiu:08x} are read" if (hi_at, lo_at) != (lui, addiu) else ""
            sys.exit(f"0x{hi_at:08x} and 0x{lo_at:08x} read `{self.text(hi_at)}` and `{self.text(lo_at)}`, not an address{where}")
        return value

    def built(self, hi_at, lo_at):
        """The address the lui at `hi_at` builds by `lo_at`, in RAM's mirror: an addiu between them adds its
        immediate to the half, an addu carries the half past an index, a jump is followed through its delay slot,
        and the addiu, load or store at `lo_at` adds its own; None where the lui, the use or what joins them is not
        that, or the use is not reached within the walk."""
        hi = re.match(r"lui \$(\w+), (0x[0-9a-f]+)$", self.text(hi_at)) if lo_at > hi_at else None
        if not hi:
            return None
        held = {hi.group(1): 0x80000000 | (int(hi.group(2), 0) << 16)}
        pc, left = hi_at + 4, WALK
        while left and self.holds(pc):
            left -= 1
            text = self.text(pc)
            if pc == lo_at:
                return self.added(held, text)
            m = re.match(r"j (0x[0-9a-f]+)$", text)
            if m:
                if pc + 4 == lo_at:
                    return self.added(held, self.text(pc + 4))
                self.carry(held, self.text(pc + 4))
                pc = int(m.group(1), 16)
                continue
            self.carry(held, text)
            pc += 4
        return None

    @staticmethod
    def carry(held, text):
        """What the instruction does to the halves held: an addiu adds its immediate to a half, an addu carries one
        half past an index, and any other write to a register drops that register's half."""
        m = re.match(r"addiu \$(\w+), \$(\w+), (-?\d+)$", text)
        if m and m.group(2) in held:
            held[m.group(1)] = held[m.group(2)] + int(m.group(3))
            return
        m = re.match(r"addu \$(\w+), \$(\w+), \$(\w+)$", text)
        if m:
            high = [held[r] for r in m.groups()[1:] if r in held]
            if len(high) == 1:
                held[m.group(1)] = high[0]
            else:
                held.pop(m.group(1), None)
            return
        m = re.match(r"(\w+) \$(\w+)", text)
        if m and m.group(1) not in READS_FIRST:
            held.pop(m.group(2), None)

    @staticmethod
    def added(held, text):
        """The address the addiu, load or store completes from the half it reads, or None where it reads none."""
        m = re.match(r"addiu \$\w+, \$(\w+), (-?\d+)$", text)
        if m:
            return held[m.group(1)] + int(m.group(2)) if m.group(1) in held else None
        m = re.match(r"\w+ \$\w+, (-?\d+)\(\$(\w+)\)$", text)
        if m:
            return held[m.group(2)] + int(m.group(1)) if m.group(2) in held else None
        return None

    def word_of(self, hi, hp, lo, lp):
        """The word a lui and an ori hold between them."""
        return self.joined(*self.halves((hi, hp, lo, lp)))

    def joined(self, hi, hp, lo, lp):
        """The word a lui and an ori at this executable's own addresses hold between them."""
        return (self.immediate_at(hi, hp) << 16) | (self.immediate_at(lo, lp) & 0xFFFF)

    def grey(self, hi, hp, lo, lp):
        """The level of a colour word whose three channels are one."""
        hi, hp, lo, lp = self.halves((hi, hp, lo, lp))
        word = self.joined(hi, hp, lo, lp)
        if word != (word & 0xFF) * 0x010101:
            sys.exit(f"0x{hi:08x} and 0x{lo:08x} hold the colour 0x{word:08x}, not a grey")
        return word & 0xFF

    def divisor(self, hi, hp, lo, lp, sa, sp):
        """The number a multiply by a reciprocal and a shift divides by, two to the shift where the map says this
        executable divides by a shift alone, or None where it says this executable has no such multiply."""
        if self.absent(hi):
            return None
        row = None if self.map is None else self.map.shift(hi)
        if row is not None:
            self.standing(row, hi)
            return 2 ** row["shift"]
        hi, hp, lo, lp, sa, sp = self.halves((hi, hp, lo, lp, sa, sp))
        return round(2 ** (32 + self.immediate_at(sa, sp)) / self.joined(hi, hp, lo, lp))

    def multiplier(self, addr, count, src, dst):
        """The factor applied to `src` by `count` instructions of shifts and adds, a shift by a register taking the
        constant that register was last set to before it, the run's place, count and registers the map's where it
        has them, or None where the map says this executable has no such run."""
        if self.absent(addr):
            return None
        if self.map is not None:
            addr, count, src, dst = self.map.run(addr)
        coef = {src: 1, "zero": 0}
        for i in range(count):
            pc = addr + 4 * i
            text = self.text(pc)
            m = re.match(r"(sll|sllv|addu|subu) \$(\w+), \$(\w+)(?:, \$(\w+)|, (\d+))$", text)
            if m:
                op, rd, a, b, sa = m.groups()
                if op == "sllv":
                    sa, b = self.constant(pc, b), None
                x, y = coef.get(a), coef.get(b) if b else 0
                if x is None or y is None:
                    coef[rd] = None
                elif op in ("sll", "sllv"):
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

    def setter(self, before, reg):
        """Where `reg` was last written before `before`, or the tool's exit where nothing within the walk writes it."""
        for pc in range(before - 4, before - 4 * WALK, -4):
            if not self.holds(pc):
                break
            m = re.match(r"(\w+) \$(\w+)", self.text(pc))
            if m and m.group(2) == reg and m.group(1) not in READS_FIRST:
                return pc
        sys.exit(f"0x{before:08x}: nothing before it sets {reg}")

    def constant(self, before, reg):
        """The constant `reg` holds at `before`: the immediate of the addiu or ori from zero that last wrote it, or
        the tool's exit where another instruction wrote it last."""
        pc = self.setter(before, reg)
        text = self.text(pc)
        m = re.match(r"(?:addiu|ori) \$\w+, \$zero, (\d+)$", text)
        if not m:
            sys.exit(f"0x{before:08x}: {reg} holds what `{text}` at 0x{pc:08x} leaves in it, not a constant")
        return int(m.group(1))

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
                at = self.gp + imm
            elif base == 1 and i and words[i - 1] >> 16 == 0x3C01:
                at = (0x80000000 | ((words[i - 1] & 0xFFFF) << 16)) + imm
            else:
                continue
            if at == addr:
                out.append((self.base + 4 * i, (w >> 16) & 31))
        return out

    def resolved(self, start, end, base, span, calls=()):
        """How many stores the stretch from `start` to `end` makes, each resolved to an address through `base`,
        which holds the record, a register derived from it, gp, sp or a lui; none within the record's `span` of
        words, no pointer made into it, and the record handed on by the `calls` listed alone, each to its callee
        where this executable is known to hold it."""
        low, high = self.record + span[0], self.record + span[1] + 3
        held = {base: (self.record, True), "gp": (self.gp, False)}     # a register's address, and whether it is the record's address
        awaited = {self.at(where): (self.placed(callee), handed) for where, callee, handed in calls}
        start, end = self.at(start), self.at(end)
        count, pc = 0, start
        while pc <= end:
            text = self.text(pc)
            if text.startswith("jal "):
                count += self.follow(pc + 4, held, low, high)     # the delay slot runs before the call
                handed = {r: a - self.record for r, (a, own) in held.items() if own and r in ARGUMENTS}
                callee, want = awaited.pop(pc, (0, None))
                if (callee is not None and text != f"jal 0x{callee:08x}") or handed != want:
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


class Readings(dict):
    """Every reading by its key as a reader returns them, one the map says the release has no instruction for None:
    `get` hands that None to the few rules that take one, and reading it as a number is the tool's exit naming the
    key."""

    def __getitem__(self, key):
        value = super().__getitem__(key)
        if value is None:
            sys.exit(f"{key} has no instruction on this executable, and what takes it needs a number")
        return value


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
