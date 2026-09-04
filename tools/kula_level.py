"""A level record, inflated from a .PAK entry.

    u16[34*34*34]   the lattice, 0xFFFF where nothing is placed
    i32             the game's own, unnamed: usually the placed-cell count and
                    sometimes a small negative number, so not a count
    u16             record count
    u16             unknown, zero on all but 24 levels
    (padding to 256 bytes)
    record[count]   256 bytes each
    6 bytes         0xFF filler

A lattice cell holds one of five plain block styles below 5, or 5 + i for a
block carrying record i. The record repeats the cell's own coordinates, which
is what pins the two representations together and is checked on every build.

A record is eight 32-byte groups, and only the first holds an entity: a
position, a kind the engine dispatches on, a type within that kind, and eleven
more fields whose meaning follows from the kind. The other seven never hold a
position, their first and third words taking no value but -1 and 0 anywhere in
the game, and the one word of each that does carry a number is not decoded.
`verify` asserts that, because a range test alone does not: the game leaves 51
records zeroed past the entity, which puts a lattice-shaped (0, 0, 0) in every
group of them.

`kind` separates the classes the engine dispatches on; 666 marks the record
every level ends with, which carries the start, a look-at and the level's time.
"""
import struct

SIDE = 34
CELLS = SIDE ** 3
GRID_BYTES = CELLS * 2
EMPTY = 0xFFFF
STYLES = 5           # 0..4 are block styles the engine draws without a record
FIRST_RECORD = 5     # from here up, a cell value names the record it carries
RECORD = 256
GROUP = 32
GROUPS = RECORD // GROUP
START_KIND = 666


class Entity:
    __slots__ = ("x", "y", "z", "kind", "type", "f")

    def __init__(self, words):
        self.x, self.y, self.z, self.kind, self.type = words[:5]
        self.f = list(words[5:])

    def as_dict(self):
        return {"x": self.x, "y": self.y, "z": self.z, "kind": self.kind, "type": self.type,
                "f": self.f}


class Level:
    def __init__(self, blob, name="", theme=""):
        if len(blob) < GRID_BYTES + 12:
            raise ValueError(f"{name}: {len(blob)} bytes is too short for a level")
        self.name = name
        self.theme = theme
        self.blob = blob
        self.header = struct.unpack_from("<i", blob, GRID_BYTES)[0]
        self.count, self.flag = struct.unpack_from("<HH", blob, GRID_BYTES + 4)
        expect = GRID_BYTES + RECORD * (1 + self.count) + 6
        if len(blob) != expect:
            raise ValueError(f"{name}: {len(blob)} bytes, expected {expect}")

        self.cells = []          # (x, y, z, value)
        cells = struct.unpack_from(f"<{CELLS}H", blob, 0)
        for i, v in enumerate(cells):
            if v != EMPTY:
                self.cells.append((i // (SIDE * SIDE), (i // SIDE) % SIDE, i % SIDE, v))

        self.records = [Entity(struct.unpack_from("<16h", blob, self._at(k)))
                        for k in range(self.count)]

    def _at(self, k):
        return GRID_BYTES + RECORD * (1 + k)

    @property
    def start(self):
        """The 666 record: every level ends with exactly one."""
        return self.records[-1] if self.records and self.records[-1].kind == START_KIND else None

    @property
    def objects(self):
        """The records that are things on blocks. The start is not one of them,
        and reads as one only by accident: where an entity carries a type, it
        carries the x of the cell it looks at."""
        return self.records[:-1] if self.start else self.records

    def verify(self):
        """What has to hold if the lattice is being read the way the engine reads it.

        The cross-check that matters is the first: a cell that names a record is
        named back by it. Nothing else pins the two representations together,
        and several size-based readings of this format fit a few levels and then
        come apart.
        """
        bad = []
        for x, y, z, v in self.cells:
            if v < FIRST_RECORD:
                continue
            k = v - FIRST_RECORD
            if not 0 <= k < self.count:
                bad.append(f"cell {x},{y},{z} names record {k} of {self.count}")
                continue
            e = self.records[k]
            if (e.x, e.y, e.z) != (x, y, z):
                bad.append(f"cell {x},{y},{z} names record {k}, which sits at {e.x},{e.y},{e.z}")
        for k in range(self.count):
            for g in range(1, GROUPS):
                a, _, c = struct.unpack_from("<3h", self.blob, self._at(k) + g * GROUP)
                if a not in (-1, 0) or c not in (-1, 0):
                    bad.append(f"record {k} group {g} reads as a position at {a},_,{c}")
        starts = [k for k, e in enumerate(self.records) if e.kind == START_KIND]
        if starts != [self.count - 1]:
            bad.append(f"start records at {starts}, expected only {self.count - 1}")
        return bad

    def extent(self):
        if not self.cells:
            return None
        xs = [c[0] for c in self.cells]
        ys = [c[1] for c in self.cells]
        zs = [c[2] for c in self.cells]
        return (min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs))
