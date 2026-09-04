"""A level record, inflated from a .PAK entry.

    u16[34*34*34]   the lattice, 0xFFFF where nothing is placed
    u32             solid-block count
    u16             record count
    u16             unknown, zero on all but 24 levels
    (padding to 256 bytes)
    record[count]   256 bytes each: six 32-byte entities, only the first of
                    which is used on all but a handful
    6 bytes         0xFF filler

A lattice cell holds 0 for a plain block and 5 + i for one that carries
record i; the record repeats the cell's own coordinates, which is what pins
the two together (verified on every one of the game's 5540 records).

Entity fields are the game's own numbers. `kind` separates the classes the
engine dispatches on; 666 marks the one record every level ends with, which
carries the start, a look-at and the level's time.
"""
import struct

SIDE = 34
CELLS = SIDE ** 3
GRID_BYTES = CELLS * 2
EMPTY = 0xFFFF
PLAIN = 0            # a lattice cell with no record of its own
FIRST_RECORD = 5     # lattice values below this are not record indices
RECORD = 256
ENTITY = 32
ENTITIES = 6
START_KIND = 666


class Entity:
    __slots__ = ("x", "y", "z", "kind", "type", "f", "slot")

    def __init__(self, words, slot):
        self.x, self.y, self.z, self.kind, self.type = words[:5]
        self.f = list(words[5:])
        self.slot = slot

    @property
    def placed(self):
        return self.x != -1

    def as_dict(self):
        d = {"x": self.x, "y": self.y, "z": self.z, "kind": self.kind, "type": self.type,
             "f": self.f}
        if self.slot:
            d["slot"] = self.slot
        return d


class Level:
    def __init__(self, blob, name="", theme=""):
        if len(blob) < GRID_BYTES + 12:
            raise ValueError(f"{name}: {len(blob)} bytes is too short for a level")
        self.name = name
        self.theme = theme
        self.blocks = struct.unpack_from("<I", blob, GRID_BYTES)[0]
        self.count, self.flag = struct.unpack_from("<HH", blob, GRID_BYTES + 4)
        expect = GRID_BYTES + RECORD * (1 + self.count) + 6
        if len(blob) != expect:
            raise ValueError(f"{name}: {len(blob)} bytes, expected {expect}")

        self.cells = []          # (x, y, z, value)
        cells = struct.unpack_from(f"<{CELLS}H", blob, 0)
        for i, v in enumerate(cells):
            if v != EMPTY:
                self.cells.append((i // (SIDE * SIDE), (i // SIDE) % SIDE, i % SIDE, v))

        self.records = []
        for k in range(self.count):
            base = GRID_BYTES + RECORD * (1 + k)
            ents = []
            for s in range(ENTITIES):
                words = struct.unpack_from("<16h", blob, base + s * ENTITY)
                e = Entity(words, s)
                if e.placed:
                    ents.append(e)
            self.records.append(ents)

    @property
    def start(self):
        """The 666 record: every level ends with exactly one."""
        for ents in reversed(self.records):
            for e in ents:
                if e.kind == START_KIND:
                    return e
        return None

    def extent(self):
        if not self.cells:
            return None
        xs = [c[0] for c in self.cells]
        ys = [c[1] for c in self.cells]
        zs = [c[2] for c in self.cells]
        return (min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs))
