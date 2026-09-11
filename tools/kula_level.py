"""A level record, inflated from a .PAK entry.

    u16[34*34*34]   the lattice, 0xFFFF where nothing is placed
    i16             usually the placed-cell count, and unexplained where not
    i16             0, or -1 on sixteen levels
    u16             entity count
    entity[count]   256 bytes each, starting right after the count
    trailer         the same shape, kind 666: a cell, two angles, the time
    3 x 0xFFFF      where the trailer's position would go

An entity is 256 bytes and ends with its position: a kind the engine
dispatches on, a type within that kind, eleven fields whose meaning follows
from the kind, seven 32-byte groups, and then the three words of the cell it
stands on. The position that opens each 256-byte slot therefore closes the
entity before it. Reading it as the head of the entity that follows pairs
every payload with the cell one slot behind, and the lattice cross-check
cannot catch that, because the positions themselves stay in the right order.
It was caught in play: LEVEL 2's key read as its first coin, and LEVEL 109's
first laser as its second.

A lattice cell holds one of five plain block styles below 5, or 5 + i for a
block carrying entity i. The entity repeats the cell's own coordinates, which
is what pins the two representations together and is checked on every build.

The seven groups after an entity's fields look like entities and are not:
their first and third words take no value but -1 and 0 anywhere in the game.
`verify` asserts that, because a range test alone does not: the game leaves
51 entities zeroed past their fields, which puts a lattice-shaped (0, 0, 0)
in every group of them. What the groups do hold is per entity rather than
per kind, and undecoded.
"""
import struct

SIDE = 34
CELLS = SIDE ** 3
GRID_BYTES = CELLS * 2
EMPTY = 0xFFFF
STYLES = 5           # 0..4 are block styles the engine draws without a record
FIRST_RECORD = 5     # from here up, a cell value names the entity it carries
RECORD = 256
GROUP = 32
GROUPS = 7           # the groups after an entity's fields
HEAD = 6             # the position that ends an entity, or the level header
START_KIND = 666
NOWHERE = (-1, -1, -1)


class Entity:
    __slots__ = ("x", "y", "z", "kind", "type", "f", "groups")

    def __init__(self, pos, words, groups):
        self.x, self.y, self.z = pos
        self.kind, self.type = words[:2]
        self.f = list(words[2:])
        self.groups = groups

    @property
    def cell(self):
        return (self.x, self.y, self.z)

    def as_dict(self):
        return {"x": self.x, "y": self.y, "z": self.z, "kind": self.kind, "type": self.type,
                "f": self.f}


class Level:
    def __init__(self, blob, name="", theme=""):
        if len(blob) < GRID_BYTES + HEAD:
            raise ValueError(f"{name}: {len(blob)} bytes is too short for a level")
        self.name = name
        self.theme = theme
        self.blob = blob
        self.header, self.flag, self.count = struct.unpack_from("<hhH", blob, GRID_BYTES)
        expect = GRID_BYTES + RECORD * (1 + self.count) + HEAD
        if len(blob) != expect:
            raise ValueError(f"{name}: {len(blob)} bytes, expected {expect}")

        self.cells = []          # (x, y, z, value)
        cells = struct.unpack_from(f"<{CELLS}H", blob, 0)
        for i, v in enumerate(cells):
            if v != EMPTY:
                self.cells.append((i // (SIDE * SIDE), (i // SIDE) % SIDE, i % SIDE, v))

        self.objects = [self._entity(k) for k in range(self.count)]
        self.trailer = self._entity(self.count)

    def _slot(self, k):
        return GRID_BYTES + RECORD * k

    def _entity(self, k):
        at = self._slot(k)
        words = struct.unpack_from("<13h", self.blob, at + HEAD)
        groups = [struct.unpack_from("<16h", self.blob, at + GROUP * (1 + g))
                  for g in range(GROUPS)]
        pos = struct.unpack_from("<3h", self.blob, self._slot(k + 1))
        return Entity(pos, words, groups)

    def verify(self):
        """What has to hold if the lattice is being read the way the engine reads it.

        The cross-check that matters is the first: a cell that names an entity
        is named back by it. Nothing else pins the two representations
        together, and several size-based readings of this format fit a few
        levels and then come apart.
        """
        bad = []
        for x, y, z, v in self.cells:
            if v < FIRST_RECORD:
                continue
            k = v - FIRST_RECORD
            if not 0 <= k < self.count:
                bad.append(f"cell {x},{y},{z} names entity {k} of {self.count}")
                continue
            e = self.objects[k]
            if e.cell != (x, y, z):
                bad.append(f"cell {x},{y},{z} names entity {k}, which stands at {e.x},{e.y},{e.z}")
        for k, e in enumerate(self.objects + [self.trailer]):
            for g, grp in enumerate(e.groups, 1):
                if grp[0] not in (-1, 0) or grp[2] not in (-1, 0):
                    bad.append(f"entity {k} group {g} reads as a position at {grp[0]},_,{grp[2]}")
        starts = [k for k, e in enumerate(self.objects) if e.kind == START_KIND]
        if starts:
            bad.append(f"kind {START_KIND} among the entities, at {starts}")
        if self.trailer.kind != START_KIND:
            bad.append(f"the trailer is kind {self.trailer.kind}, expected {START_KIND}")
        if self.trailer.cell != NOWHERE:
            bad.append(f"the trailer claims a position at {self.trailer.x},{self.trailer.y},{self.trailer.z}")
        return bad

    def extent(self):
        if not self.cells:
            return None
        xs = [c[0] for c in self.cells]
        ys = [c[1] for c in self.cells]
        zs = [c[2] for c in self.cells]
        return (min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs))
