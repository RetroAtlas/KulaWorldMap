#!/usr/bin/env python3
"""Write a disc copy that reaches OBJ LEVEL, the catalogue the game never loads.

    export KULA_DISC="/path/to/Roll Away.bin"
    python3 tools/kula_warp.py

Every world pack but HIRO's carries `OBJ LEVEL` in its twentieth slot, and no
menu asks for it. A pack addresses its records by offset and size, so pointing a
slot a player does reach at those bytes is an eight-byte edit and leaves every
length on the disc alone, which is what keeps the ISO valid without rebuilding
it. Where the target pack has no copy of its own the record is written over one
of its own slots first, which fits because the slot it lands on is longer.

The catalogue carries no world of its own, so it wears whichever world's
artwork the pack it is reached from belongs to.

Writing user data leaves each touched sector's EDC and ECC stale. Emulators do
not read them; a real console would.
"""
import argparse
import os
import shutil
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import open_disc, packs
from kula_pak import Pak

SECTOR_RAW = 2352
USER = 2048
USER_OFF = 24
CATALOGUE = "OBJ LEVEL"


def find(disc, want):
    """Every pack on the disc, as (path, Pak), with the catalogue's home first."""
    out = []
    for _, path in packs(disc):
        pak = Pak(disc.read_file(path), path)
        out.append((path, pak))
    if want:
        out.sort(key=lambda p: p[0].upper() != want.upper())
    return out


def slot_named(pak, name):
    for i in range(len(pak)):
        if pak.name(i).upper() == name:
            return i
    return None


class Image:
    """The raw image, addressed through a file's own extent."""

    def __init__(self, path):
        self.f = open(path, "r+b")

    def write(self, lba, offset, data):
        while data:
            sec, within = divmod(offset, USER)
            n = min(len(data), USER - within)
            self.f.seek((lba + sec) * SECTOR_RAW + USER_OFF + within)
            self.f.write(data[:n])
            data = data[n:]
            offset += n

    def close(self):
        self.f.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=None, help="raw PS1 image; defaults to $KULA_DISC")
    ap.add_argument("--out", default=None, help="patched image to write")
    ap.add_argument("--into", default="/HIRO/HIRO.PAK#0",
                    help="pack path and slot the catalogue should answer to")
    ap.add_argument("--donor", default=None, help="pack to take the record from")
    args = ap.parse_args()

    src = args.disc or os.environ.get("KULA_DISC")
    if not src:
        sys.exit("no disc image: pass --disc or set $KULA_DISC")
    src = Path(src)
    out = Path(args.out) if args.out else src.with_name(f"{src.stem} (obj level).bin")

    disc = open_disc(str(src))
    target_path, _, slot = args.into.rpartition("#")
    if not target_path or not slot.isdigit():
        sys.exit(f"--into wants a pack path and a slot, like /HIRO/HIRO.PAK#0, not {args.into!r}")
    slot = int(slot)
    if target_path.upper() not in disc.files:
        sys.exit(f"no such pack on the disc: {target_path}")

    found = find(disc, args.donor or target_path)
    donor = next(((p, k, slot_named(k, CATALOGUE)) for p, k in found
                  if slot_named(k, CATALOGUE) is not None), None)
    if not donor:
        sys.exit(f"no pack on this disc carries {CATALOGUE}")
    donor_path, donor_pak, donor_slot = donor
    record = donor_pak.entries[donor_slot]["blob"]

    target = Pak(disc.read_file(target_path), target_path)
    if slot >= len(target):
        sys.exit(f"{target_path} has {len(target)} slots, so #{slot} is not one of them")
    lba, _ = disc.files[target_path.upper()]

    shutil.copyfile(src, out)
    cue = out.with_suffix(".cue")
    cue.write_text(f'FILE "{out.name}" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n')

    img = Image(out)
    if donor_path.upper() == target_path.upper():
        at, size = donor_pak.entries[donor_slot]["offset"], len(record)
        laid = None
    else:
        # The record has to live inside the pack that names it, so it goes over a
        # slot of that pack's own: the last, which is the one no world reaches.
        laid = len(target) - 1
        room = target.entries[laid]
        if room["size"] < len(record):
            sys.exit(f"{target_path}#{laid} holds {room['size']} bytes, too few for {len(record)}")
        at, size = room["offset"], len(record)
        img.write(lba, at, record)

    entry = struct.pack("<II", at, size)
    for i in {slot, laid} - {None}:
        img.write(lba, 4 + i * 8, entry)
    img.close()

    check = Pak(open_disc(str(out)).read_file(target_path), target_path)
    if zlib.decompress(check.entries[slot]["blob"]) != zlib.decompress(record):
        sys.exit(f"wrote {out}, but {target_path}#{slot} does not read back as {CATALOGUE}")

    print(f"{out}")
    print(f"  {CATALOGUE} taken from {donor_path}#{donor_slot}, {len(record)} bytes")
    if laid is not None:
        print(f"  laid over {target_path}#{laid} ({target.name(laid)})")
    print(f"  {target_path}#{slot} ({target.name(slot)}) now loads it")
    print(f"  play it as {target.name(slot)}")


if __name__ == "__main__":
    main()
