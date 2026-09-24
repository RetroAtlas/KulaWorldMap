"""A level record, inflated from a .PAK entry.

    u16[34*34*34]   the lattice, 0xFFFF where nothing is placed
    i16             usually the placed-cell count, and unexplained where not
    i16             0, or -1 on sixteen levels
    u16             record count
    record[count]   256 bytes each, starting right after the count
    trailer         the same shape, kind 666: a cell, two angles, the time
    3 x 0xFFFF      where the trailer's cell would go

A record is a block, and it ends with its cell: a kind word, six 32-byte
slots, 32 bytes that are never set, 26 bytes of extras, and then the three
words of the cell it stands on. The cell that opens each 256-byte stretch
therefore closes the record before it; reading it as the head of the record
that follows pairs every block with the cell one slot behind, and the lattice
cross-check cannot catch that, because the cells themselves stay in order. It
was caught in play.

A slot is [kind, type, eleven fields, pad, value, pad]. The six are the six
faces of the block, in the order the game numbers directions: -z, +x, +y, -y,
-x, +z. A slot whose type is not zero is an object standing on that face, so
a block carries up to six, and one whose top is bare is not empty. The kind
word is set in the first slot only. It is the block's, and a few kinds do not
carry objects in their first two slots: a laser or a rail names its two ends
there, with the type the direction from the block to the far end numbered as
above, a rail keeping which end it starts from, its length in blocks and its
speed in the second, and kind 6 keeps a fixed-point copy of its own cell.
Whatever the other slots of those kinds hold is not in play: every walk the
game makes over the records for the things on them takes a record of a kind
below 5 and no other, so an object on a platform, a crumbling, vanishing or
laser block or the settings record is never numbered, drawn or collected.

A lattice cell holds one of five plain block styles below 5, or 5 + i for a
block carrying record i. The record repeats the cell's own coordinates, which
is what pins the two representations together and is checked on every build.
"""
import struct

SIDE = 34
CELLS = SIDE ** 3
GRID_BYTES = CELLS * 2
EMPTY = 0xFFFF
STYLES = 5           # 0..4 are block styles the engine draws without a record
FIRST_RECORD = 5     # from here up, a cell value names the record it carries
BLOCK_KINDS = 5      # a kind below this is a block and nothing more, and the
                     # game's walks over the records for the things on them
                     # take only these
RECORD = 256
WORDS = RECORD // 2
SLOT = 16            # words in a slot
FACES = 6
FIELDS = 11
FIELD_WORD = 2       # the word of a slot the fields start at, and what names them
VALUE_WORD = 14
HEAD = 6             # the cell that ends a record, or the level header
TRAILER_KIND = 666
LASER_KIND = 8
PLATFORM_KIND = 5
NOWHERE = (-1, -1, -1)

# The kinds whose first two slots are the block's own payload, not its faces.
PAYLOAD_KINDS = frozenset({5, 6, 7, LASER_KIND})
# The kind the lattice never names: it is the last record on the levels that
# have it, and its first slot is the level's settings, which the loader reads.
UNPLACED_KIND = 9
SPANS = frozenset({PLATFORM_KIND, LASER_KIND})    # kinds whose fields name two cells


class Face:
    """An object standing on one face of a block."""
    __slots__ = ("face", "type", "f", "v")

    def __init__(self, face, slot):
        self.face = face
        self.type = slot[1]
        self.f = list(slot[FIELD_WORD:FIELD_WORD + FIELDS])
        self.v = slot[VALUE_WORD]

    def as_dict(self):
        return {"face": self.face, "type": self.type, "f": self.f, "v": self.v}


class Record:
    __slots__ = ("x", "y", "z", "kind", "slots", "extra")

    def __init__(self, words):
        self.kind = words[0]
        self.slots = [words[SLOT * j:SLOT * (j + 1)] for j in range(FACES)]
        self.extra = words[SLOT * FACES:WORDS - 3]
        self.x, self.y, self.z = words[WORDS - 3:]

    @property
    def cell(self):
        return (self.x, self.y, self.z)

    @property
    def type(self):
        return self.slots[0][1]

    @property
    def f(self):
        return list(self.slots[0][FIELD_WORD:FIELD_WORD + FIELDS])

    @property
    def objects(self):
        """What stands on the block and is in play."""
        if self.kind >= BLOCK_KINDS:
            return []
        return [Face(j, s) for j, s in enumerate(self.slots) if s[1] > 0]

    @property
    def span(self):
        """The two cells a beam or a rail runs between."""
        f = self.f
        return (tuple(f[2:5]), tuple(f[5:8])) if self.kind in SPANS else None

    @property
    def colour(self):
        """A laser's circuit: which switches it answers to, and the beam's colour."""
        return self.slots[1][6] if self.kind == LASER_KIND else None

    @property
    def speed(self):
        """A moving platform's speed in units a frame, as the level data holds it
        before the loader scales it: the third word of its second slot, after
        which end it starts from and how many blocks long it is."""
        return self.slots[1][2] if self.kind == PLATFORM_KIND else None

    @property
    def length(self):
        """How many blocks long a moving platform is, laid from its cell along
        the positive way of its run's axis."""
        return self.slots[1][1] if self.kind == PLATFORM_KIND else None

    def as_dict(self):
        d = {"x": self.x, "y": self.y, "z": self.z, "kind": self.kind}
        if self.kind in PAYLOAD_KINDS or self.kind == UNPLACED_KIND:
            d["type"] = self.type
            d["f"] = self.f
        if self.kind == LASER_KIND:
            d["colour"] = self.colour
        if self.kind == PLATFORM_KIND:
            d["length"] = self.length
        d["on"] = [o.as_dict() for o in self.objects]
        return d


class Level:
    def __init__(self, blob, name="", theme=""):
        if len(blob) < GRID_BYTES + HEAD:
            raise ValueError(f"{name}: {len(blob)} bytes is too short for a level")
        self.name = name
        self.theme = theme
        self.blob = blob
        self.header, self.count = struct.unpack_from("<iH", blob, GRID_BYTES)
        expect = GRID_BYTES + HEAD + RECORD * (1 + self.count)
        if len(blob) != expect:
            raise ValueError(f"{name}: {len(blob)} bytes, expected {expect}")

        self.cells = []          # (x, y, z, value)
        cells = struct.unpack_from(f"<{CELLS}H", blob, 0)
        for i, v in enumerate(cells):
            if v != EMPTY:
                self.cells.append((i // (SIDE * SIDE), (i // SIDE) % SIDE, i % SIDE, v))

        self.records = [self._record(k) for k in range(self.count)]
        self.trailer = self._record(self.count)

    def _record(self, k):
        return Record(struct.unpack_from(f"<{WORDS}h", self.blob, GRID_BYTES + HEAD + RECORD * k))

    def verify(self):
        """What has to hold if the lattice is being read the way the engine reads it.

        The cross-check that matters is the first: a cell that names a record
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
                bad.append(f"cell {x},{y},{z} names record {k} of {self.count}")
                continue
            r = self.records[k]
            if r.cell != (x, y, z):
                bad.append(f"cell {x},{y},{z} names record {k}, which stands at {r.x},{r.y},{r.z}")
        for k, r in enumerate(self.records):
            if r.span and r.cell not in r.span:
                bad.append(f"record {k} spans {r.span[0]} to {r.span[1]} but stands at {r.cell}")
        trailers = [k for k, r in enumerate(self.records) if r.kind == TRAILER_KIND]
        if trailers:
            bad.append(f"kind {TRAILER_KIND} among the records, at {trailers}")
        if self.trailer.kind != TRAILER_KIND:
            bad.append(f"the trailer is kind {self.trailer.kind}, expected {TRAILER_KIND}")
        if self.trailer.cell != NOWHERE:
            bad.append(f"the trailer claims a cell at {self.trailer.x},{self.trailer.y},{self.trailer.z}")
        return bad

    def extent(self):
        if not self.cells:
            return None
        xs = [c[0] for c in self.cells]
        ys = [c[1] for c in self.cells]
        zs = [c[2] for c in self.cells]
        return (min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs))
