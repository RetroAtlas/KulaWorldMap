#!/usr/bin/env python3
"""Put a level's compressed stream into a slot of a pack on a disc image.

    from kula_place import place
    placed = place(image, "/HIRO/HIRO.PAK", 0, stream, out, title="Spiral")

The game reads a pack by its directory record's size into a 32,768-byte
buffer and takes each record by the offset and size the pack's table gives,
so a stream goes in by one of three paths. In place, when it is no longer
than the record it replaces: it is written over the old bytes and the table's
size is set, and nothing else moves. By a rebuild, when the pack laid out
again fits the sectors it has, first with the other records as they are and
then with them recompressed at level 9 to win room, which also rewrites the
directory record's size. By a move, otherwise, into the zero sectors of
/3.00, the one room on the disc, with the directory record's extent and size
rewritten. Every sector written is built whole, EDC and ECC included, and the
result is read back through the same readers that read the disc.

The image is known by its structure, not by a hash: a raw image of 2352-byte
sectors with the volume descriptor at sector 16, the system identifier the
console looks for, a SYSTEM.CNF that boots the game's executable and the 21
packs by path. What is missing is a warning, so a synthetic image drives the
tests.
"""
import shutil
import struct
import sys
import zlib
from pathlib import Path
from typing import NamedTuple

sys.path.insert(0, str(Path(__file__).resolve().parent))
from disc import Disc, record, set_record
from kula_disc import THEMES
from kula_kwl import FORMAT, VERSION, canonical
from kula_pak import Pak, pack
from kula_sector import (
    DATA_SUBMODE,
    EOF_SUBMODE,
    SECTOR_RAW,
    USER,
    USER_OFF,
    check,
    raw_sector,
    rewrite,
    sector,
    sectors_of,
)

IN_PLACE, REBUILD, RELOCATE = "in place", "rebuild", "relocate"
BUFFER = 32768         # the game reads a pack into this much memory
LARGEST = BUFFER - 1   # it reads (size >> 11) + 1 sectors, which fills the buffer at this size
RECOMPRESS = 9
ROOM = "/3.00"         # the file whose sectors are all zero, where a pack can move to
PVD = 16
SYSTEM_ID = b"PLAYSTATION"
BOOT = b"BOOT = cdrom:SLUS_007.24;1"
NTSC_U = 109607        # sectors in the North American image
PACKS = ([f"/{t}/{t}.PAK" for t in THEMES] + [f"/{t}/{t}FI.PAK" for t in THEMES]
         + ["/HIRO/COPYCAT.PAK"])
CUE = 'FILE "{}" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n'


class Fit(NamedTuple):
    """The path a stream takes into a pack, every slot's record and name as the
    pack will carry them, the pack's size afterwards, the bytes to spare on
    that path, and whether the other records were recompressed to make room."""
    path: str
    streams: list
    names: list
    size: int
    room: int
    recompressed: bool


class Placed(NamedTuple):
    """A fit, where the pack lies afterwards, the sectors to write as (lba, raw
    sector) in address order, and what says the image is not the disc's."""
    fit: Fit
    lba: int
    writes: list
    warnings: list


def pack_name(title, old):
    """The name a slot takes from a level's title: upper-case ASCII no longer
    than the name it replaces, or that name where the title gives nothing."""
    text = "".join(c for c in title.upper() if " " <= c <= "~")[:len(old)].strip()
    return text or old


def _recompressed(names, streams, slot):
    """The other records at level 9, each from its level."""
    out = []
    for i, s in enumerate(streams):
        if i == slot:
            out.append(s)
            continue
        try:
            level = zlib.decompress(s)
        except zlib.error as e:
            raise ValueError(f"the record of {names[i]} is not one the game inflates: {e}") from None
        out.append(zlib.compress(level, RECOMPRESS))
    return out


def fit(pak, capacity, slot, stream, title=None):
    """How the stream goes into the slot of a pack with so many bytes of sectors."""
    if not 0 <= slot < len(pak):
        raise ValueError(f"the pack has {len(pak)} slots, so #{slot} is not one of them")
    names, streams = pak.names(), pak.streams()
    old = len(streams[slot])
    streams[slot] = stream
    if len(stream) <= old:
        return Fit(IN_PLACE, streams, names, pak.size, old - len(stream), False)
    if title is not None:
        names[slot] = pack_name(title, names[slot])
    limit = min(capacity, LARGEST)
    size = len(pack(names, streams))
    if size <= limit:
        return Fit(REBUILD, streams, names, size, limit - size, False)
    again = _recompressed(names, streams, slot)
    size9 = len(pack(names, again))
    if size9 <= limit:
        return Fit(REBUILD, again, names, size9, limit - size9, True)
    for streams_, size_, recompressed in ((streams, size, False), (again, size9, True)):
        if size_ <= LARGEST:
            return Fit(RELOCATE, streams_, names, size_, LARGEST - size_, recompressed)
    raise ValueError(f"a pack of {size9} bytes is more than the game reads")


def identify(disc):
    """What says the image is not the disc's, each a warning rather than a refusal."""
    out = []
    disc.f.seek(0, 2)
    size = disc.f.tell()
    if size % SECTOR_RAW:
        out.append(f"the image is {size:,} bytes, which is not whole sectors of {SECTOR_RAW}")
    elif size != NTSC_U * SECTOR_RAW:
        out.append(f"the image has {size // SECTOR_RAW:,} sectors, not the {NTSC_U:,} of the disc")
    pvd = disc.sector(PVD)
    system = pvd[8:40].rstrip()
    if system != SYSTEM_ID:
        out.append(f"the system identifier is {system.decode('ascii', 'replace')!r}, not {SYSTEM_ID.decode()}")
    cnf = disc.read_file("/SYSTEM.CNF") if "/SYSTEM.CNF" in disc.files else b""
    if BOOT not in cnf:
        out.append(f"SYSTEM.CNF does not say {BOOT.decode()}")
    missing = [p for p in PACKS if p not in disc.files]
    if missing:
        out.append(f"{len(missing)} of the {len(PACKS)} packs are missing")
    return out


def _sectors(disc, lba, user, size):
    """The sectors of a file's run that differ once it holds the user data given,
    each built whole: data within the file, end of file on its last sector."""
    last = len(sectors_of(lba, size)) - 1
    out = []
    for i in range(len(user) // USER):
        raw = sector(lba + i, user[i * USER:(i + 1) * USER], EOF_SUBMODE if i == last else DATA_SUBMODE)
        if raw != raw_sector(disc.f, lba + i):
            out.append((lba + i, raw))
    return out


def _directory(disc, key, extent, size):
    """The directory sector with the file's record naming a new extent and size,
    its own subheader kept."""
    at, pos = disc.records[key]
    raw = raw_sector(disc.f, at)
    user = bytearray(raw[USER_OFF:USER_OFF + USER])
    set_record(user, pos, extent, size)
    new = rewrite(raw, user)
    return [] if new == raw else [(at, new)]


def _room(disc, size):
    """Where a pack of this size can move to: the head of /3.00, with the
    sector after it clear, since the game reads one sector past a pack."""
    if ROOM not in disc.files:
        raise ValueError(f"the image has no {ROOM} to move the pack into")
    lba, room = disc.files[ROOM]
    need = len(sectors_of(lba, size)) + 1
    if need > len(sectors_of(lba, room)):
        raise ValueError(f"{ROOM} has {len(sectors_of(lba, room))} sectors and the pack needs {need}")
    if any(any(disc.sector(lba + i)) for i in range(need)):
        raise ValueError(f"the head of {ROOM} is not zero, so the pack has nowhere to move to")
    return lba


def plan(disc, pack_path, slot, stream, title=None):
    """The sectors that put the stream into the slot, read off the image."""
    key = pack_path.upper()
    if key not in disc.files:
        raise ValueError(f"no such pack on the disc: {pack_path}")
    try:
        zlib.decompress(stream)
    except zlib.error as e:
        raise ValueError(f"the stream is not one the game inflates: {e}") from None
    lba, size = disc.files[key]
    capacity = len(sectors_of(lba, size)) * USER
    pak = Pak(disc.read_file(key), key)
    f = fit(pak, capacity, slot, stream, title)
    if f.path == IN_PLACE:
        user = bytearray(disc.read(lba, capacity))
        at = pak.entries[slot]["offset"]
        user[at:at + len(stream)] = stream
        struct.pack_into("<I", user, 4 + slot * 8 + 4, len(stream))
        writes, where = _sectors(disc, lba, user, size), lba
    elif f.path == REBUILD:
        writes, where = _sectors(disc, lba, pack(f.names, f.streams).ljust(capacity, b"\0"), f.size), lba
        if f.size != size:
            writes += _directory(disc, key, lba, f.size)
    else:
        blob = pack(f.names, f.streams)
        where = _room(disc, len(blob))
        user = blob.ljust(len(sectors_of(where, len(blob))) * USER, b"\0")
        writes = _sectors(disc, where, user, len(blob)) + _directory(disc, key, where, f.size)
    writes.sort()
    return Placed(f, where, writes, identify(disc))


class Patched(Disc):
    """The image as it reads with the sectors written, before they are."""

    def __init__(self, path, writes):
        self.writes = dict(writes)
        super().__init__(path)

    def sector(self, lba):
        raw = self.writes.get(lba)
        return raw[USER_OFF:USER_OFF + USER] if raw else super().sector(lba)


def verify(disc, pack_path, slot, stream, placed):
    """Read the pack back through the readers and hold it to the plan: the slot
    inflates to the level, every record and name is the plan's, the directory
    places the pack where the plan put it, and every sector written checks."""
    key = pack_path.upper()
    if disc.files.get(key) != (placed.lba, placed.fit.size):
        raise ValueError(f"the directory puts {pack_path} at {disc.files.get(key)}, not {(placed.lba, placed.fit.size)}")
    pak = Pak(disc.read_file(key), key)
    if zlib.decompress(pak.entries[slot]["blob"]) != zlib.decompress(stream):
        raise ValueError(f"{pack_path}#{slot} does not inflate to the level")
    if pak.streams() != placed.fit.streams or pak.names() != placed.fit.names:
        raise ValueError(f"{pack_path} does not read back as planned")
    for lba, raw in placed.writes:
        if not check(raw):
            raise ValueError(f"sector {lba} does not check")


def write_sectors(path, writes):
    with open(path, "r+b") as f:
        for lba, raw in writes:
            f.seek(lba * SECTOR_RAW)
            f.write(raw)


def write_image(src, out, writes):
    """A copy of the image with the sectors written, and a cue sheet beside it."""
    out = Path(out)
    shutil.copyfile(src, out)
    write_sectors(out, writes)
    out.with_suffix(".cue").write_text(CUE.format(out.name))


def proven(out, pack_path, slot, stream, placed):
    """Read the copy back and hold it to the plan, removing it and its cue sheet where it fails."""
    out = Path(out)
    try:
        with Disc(out) as disc:
            verify(disc, pack_path, slot, stream, placed)
            for lba, raw in placed.writes:
                if raw_sector(disc.f, lba) != raw:
                    raise ValueError(f"sector {lba} of {out} is not what was written")
    except Exception:
        for path in (out, out.with_suffix(".cue")):
            path.unlink(missing_ok=True)
        raise


def place(image, pack_path, slot, stream, out, title=None):
    """Copy the image to out with the stream placed, prove the copy, and say what was done."""
    with Disc(image) as disc:
        placed = plan(disc, pack_path, slot, stream, title)
    write_image(image, out, placed.writes)
    proven(out, pack_path, slot, stream, placed)
    return placed


# --- an image built as the disc is, for the tests and the fixture --------------

ROOT_AT = 22
CNF_AT = 23
WORLD_AT = 24
PACK_AT = 25
FINALS_AT = 26
ROOM_AT = 27
ROOM_SECTORS = 12
POSTGAP = 4
SYNTHETIC_SECTORS = ROOM_AT + ROOM_SECTORS + POSTGAP
SYNTHETIC_PACK = "/HIRO/HIRO.PAK"
SYNTHETIC_FINALS = "/HIRO/HIROFI.PAK"
PICKUPS = (37, 36, 31, 32, 33, 34, 35, 38)
SIDES = (10, 12, 1, 2, 8)


def synthetic(n, title="Spiral"):
    """A project of n blocks scattered through the lattice, the first carrying
    the start, with pickups and paint cycling over the faces, so that its
    stream grows with n."""
    blocks = []
    for i in range(n):
        cell = [1 + (i * 7) % 32, 1 + (i * 5) % 31, 1 + (i * 3) % 29]
        faces = {"0": {"type": 30, "facing": 1}} if i == 0 else {"0": {"type": PICKUPS[i % len(PICKUPS)]}}
        if faces["0"]["type"] in (36, 37):
            faces["0"]["variant"] = i % 3
        if i % 2:
            faces["1"] = {"type": SIDES[i % len(SIDES)]}
        blocks.append({"cell": cell, "kind": 0 if i == 0 else i % 3, "faces": faces})
    return {"format": FORMAT, "version": VERSION, "title": title, "author": "", "notes": "",
            "world": THEMES[0], "time": 99, "hidden": False, "invisibleFromAfar": False,
            "circuits": {}, "blocks": blocks}


def stream_of(project, level=6):
    return zlib.compress(canonical(project), level)


def synthetic_packs():
    """The two packs of the synthetic image, as (path, sector, bytes)."""
    world = pack(["LEVEL 1", "LEVEL 2", "LEVEL 3"],
                 [stream_of(synthetic(n, f"LEVEL {n}"), 1) for n in (1, 2, 3)])
    finals = pack(["FINAL 1", "FINAL 2"], [stream_of(synthetic(n, f"FINAL {n}")) for n in (4, 5)])
    return [(SYNTHETIC_PACK, PACK_AT, world), (SYNTHETIC_FINALS, FINALS_AT, finals)]


def synthetic_image():
    """A few sectors with the disc's structure, every one built whole: the volume
    descriptor, the root and one world's directory, SYSTEM.CNF, two one-sector
    packs of small levels, the world pack's at level 1 so that recompression
    wins room, a /3.00 of zero sectors and a postgap."""
    packs_ = synthetic_packs()
    cnf = BOOT + b"\r\nTCB = 4\r\nEVENT = 16\r\nSTACK = 0X801FFF00\r\n"
    pvd = bytearray(USER)
    pvd[0] = 1
    pvd[1:6] = b"CD001"
    pvd[6] = 1
    pvd[8:40] = SYSTEM_ID.ljust(32)
    pvd[40:72] = b" " * 32
    pvd[80:88] = struct.pack("<I", SYNTHETIC_SECTORS) + struct.pack(">I", SYNTHETIC_SECTORS)
    pvd[120:128] = struct.pack("<H", 1) + struct.pack(">H", 1) + struct.pack("<H", 1) + struct.pack(">H", 1)
    pvd[128:132] = struct.pack("<H", USER) + struct.pack(">H", USER)
    pvd[156:190] = record(b"\0", ROOT_AT, USER, 2)
    terminator = bytearray(USER)
    terminator[0] = 255
    terminator[1:6] = b"CD001"
    terminator[6] = 1
    root = (record(b"\0", ROOT_AT, USER, 2) + record(b"\1", ROOT_AT, USER, 2)
            + record("3.00;1", ROOM_AT, ROOM_SECTORS * USER) + record("HIRO", WORLD_AT, USER, 2)
            + record("SYSTEM.CNF;1", CNF_AT, len(cnf)))
    world = record(b"\0", WORLD_AT, USER, 2) + record(b"\1", ROOT_AT, USER, 2)
    for path, at, blob in packs_:
        world += record(path.rsplit("/", 1)[1] + ";1", at, len(blob))
    users = {PVD: (pvd, 0x09), PVD + 1: (terminator, EOF_SUBMODE), ROOT_AT: (root, EOF_SUBMODE),
             CNF_AT: (cnf, EOF_SUBMODE), WORLD_AT: (world, EOF_SUBMODE)}
    for _, at, blob in packs_:
        users[at] = (blob, EOF_SUBMODE)
    for i in range(ROOM_SECTORS):
        users[ROOM_AT + i] = (b"", DATA_SUBMODE)
    return b"".join(sector(lba, bytes(users.get(lba, (b"", 0))[0]).ljust(USER, b"\0"),
                           users.get(lba, (b"", 0))[1])
                    for lba in range(SYNTHETIC_SECTORS))
