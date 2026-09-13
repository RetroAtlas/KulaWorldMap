#!/usr/bin/env python3
"""Write a disc copy that reaches a level the game will not take you to.

    export KULA_DISC="/path/to/Roll Away.bin"
    python3 tools/kula_warp.py
    python3 tools/kula_warp.py --level /HELL/HELL.PAK#18

`OBJ LEVEL`, the developers' object catalogue, sits in the twentieth slot of
every world pack but HIRO's and no menu asks for it, so it is what this reaches
by default. A pack addresses its records by offset and size, so pointing a slot
a player does reach at another slot's bytes is an eight-byte edit and leaves
every length on the disc alone, which is what keeps the ISO valid without
rebuilding it. Across packs the record is written over a slot of the target's
own first, the roomiest, which is why what it displaces is named on the way
out.

A level carries no world of its own, so it wears whichever world's artwork the
pack it is reached from belongs to.

The game keeps the world it is loading at 0x800A340C and 0x800A3410 and the
slot at 0x800A3408 (the NTSC release; the PAL one at 0x800A2EA4, 0x800A2EA8 and
0x800A2EA0), so an emulator cheat that writes those reaches the same levels
without a patched disc. This tool is for when a disc is what is wanted.

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
                    help="pack path and slot the level should answer to")
    ap.add_argument("--level", default=None,
                    help="pack path and slot to make reachable; defaults to the catalogue")
    args = ap.parse_args()

    src = args.disc or os.environ.get("KULA_DISC")
    if not src:
        sys.exit("no disc image: pass --disc or set $KULA_DISC")
    src = Path(src)
    disc = open_disc(str(src))
    target_path, _, slot = args.into.rpartition("#")
    if not target_path or not slot.isdigit():
        sys.exit(f"--into wants a pack path and a slot, like /HIRO/HIRO.PAK#0, not {args.into!r}")
    slot = int(slot)
    if target_path.upper() not in disc.files:
        sys.exit(f"no such pack on the disc: {target_path}")

    if args.level:
        donor_path, _, ds = args.level.rpartition("#")
        if donor_path.upper() not in disc.files or not ds.isdigit():
            sys.exit(f"--level wants a pack path and a slot, not {args.level!r}")
        donor_pak, donor_slot = Pak(disc.read_file(donor_path), donor_path), int(ds)
        if donor_slot >= len(donor_pak):
            sys.exit(f"{donor_path} has {len(donor_pak)} slots, so #{donor_slot} is not one")
    else:
        donor = next(((p, k, slot_named(k, CATALOGUE))
                      for p, k in find(disc, target_path)
                      if slot_named(k, CATALOGUE) is not None), None)
        if not donor:
            sys.exit(f"no pack on this disc carries {CATALOGUE}")
        donor_path, donor_pak, donor_slot = donor
    record = donor_pak.entries[donor_slot]["blob"]
    what = donor_pak.name(donor_slot)
    out = Path(args.out) if args.out else src.with_name(f"{src.stem} ({what.lower()}).bin")

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
        # slot of that pack's own: the roomiest that is not the one being aimed.
        laid = max((i for i in range(len(target)) if i != slot),
                   key=lambda i: target.entries[i]["size"])
        room = target.entries[laid]
        if room["size"] < len(record):
            sys.exit(f"{target_path} has no slot roomy enough for {len(record)} bytes")
        at, size = room["offset"], len(record)
        img.write(lba, at, record)

    entry = struct.pack("<II", at, size)
    for i in {slot, laid} - {None}:
        img.write(lba, 4 + i * 8, entry)
    img.close()

    check = Pak(open_disc(str(out)).read_file(target_path), target_path)
    if zlib.decompress(check.entries[slot]["blob"]) != zlib.decompress(record):
        sys.exit(f"wrote {out}, but {target_path}#{slot} does not read back as {what}")

    print(f"{out}")
    print(f"  {what} taken from {donor_path}#{donor_slot}, {len(record)} bytes")
    if laid is not None:
        print(f"  laid over {target_path}#{laid} ({target.name(laid)}), which it replaces")
    print(f"  {target_path}#{slot} now loads it")
    print(f"  play it as {target.name(slot)}")


if __name__ == "__main__":
    main()
