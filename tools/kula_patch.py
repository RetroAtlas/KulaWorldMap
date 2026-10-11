#!/usr/bin/env python3
"""Write a level onto the disc as a patch: a PPF, an xdelta, or a patched image.

    export KULA_DISC="/path/to/Roll Away.bin"
    python3 tools/kula_patch.py --level spiral.kula.json --into /HIRO/HIRO.PAK#0 --out spiral
    python3 tools/kula_patch.py --level spiral.kwl --into /HIRO/HIRO.PAK#0 --out spiral --ppf
    python3 tools/kula_patch.py --level /HIRO/HIRO.PAK#3 --into /HIRO/HIRO.PAK#0 --out level4 --image
    python3 tools/kula_patch.py --fixture               # tests/fixtures/patch-digests.json

The level, a project file, a level file or a shipped level, is written as the
game's bytes, deflated, and placed in its slot by kula_place; the sectors the
placement writes are what the patches carry. A PPF 3.0 patch is what the
PlayStation emulators lay over an untouched image, each reading it from a
place of its own; an xdelta patch, VCDIFF as xdelta3 writes it, is what a
player applies with xdelta3 or Rom Patcher to get a patched copy; the image
is that copy itself, with its cue sheet beside it. Nothing here writes to the
original image.
"""
import argparse
import hashlib
import json
import os
import re
import struct
import sys
import tempfile
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import open_disc
from kula_kwl import DATA, OBJECTS, canonical, describe, read_kwl, read_project, template, validate
from kula_place import SYNTHETIC_PACK, Patched, place, plan, synthetic, synthetic_image, verify, written
from kula_sector import HEX_RUN, SECTOR_RAW, raw_sector

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / "tests" / "fixtures" / "patch-digests.json"

PPF_MAGIC = b"PPF30"
PPF_VERSION = 2
DESCRIPTION = 50
BLOCK_AT = 0x9320       # 32 bytes into sector 16: the volume descriptor from its system identifier on
BLOCK = 1024
RECORD_MOST = 255
SERIAL = "SLUS_007.24"  # the name ePSXe and PCSX-ReARMed look the patch up by

VCDIFF_MAGIC = b"\xd6\xc3\xc4\x00"
WINDOW = 8 << 20
VCD_SOURCE = 1
VCD_ADLER32 = 4
COPY, ADD = 19, 1       # the default code table's COPY in mode 0 and ADD, each with its size following

PREFIX = "Kula World Map: "


def runs(old, new):
    """The stretches where new differs from old, as (offset, length)."""
    out, start = [], None
    for i, (a, b) in enumerate(zip(old, new)):
        if a != b:
            start = i if start is None else start
        elif start is not None:
            out.append((start, i - start))
            start = None
    if start is not None:
        out.append((start, len(old) - start))
    return out


def changes(original, writes):
    """Every stretch of the image the writes change, as (offset, bytes), in address order."""
    out = []
    with open(original, "rb") as f:
        for lba, raw in sorted(writes):
            old = raw_sector(f, lba)
            out += [(lba * SECTOR_RAW + at, raw[at:at + n]) for at, n in runs(old, raw)]
    return out


def ppf(original, writes, description):
    """A PPF 3.0 patch: the header, a block check of the volume descriptor, and
    a record of at most 255 bytes for each stretch of each changed sector."""
    with open(original, "rb") as f:
        f.seek(BLOCK_AT)
        block = f.read(BLOCK)
    text = description.encode("ascii", "replace")[:DESCRIPTION].ljust(DESCRIPTION)
    out = bytearray(PPF_MAGIC + bytes([PPF_VERSION]) + text + bytes([0, 1, 0, 0]) + block)
    for at, data in changes(original, writes):
        for i in range(0, len(data), RECORD_MOST):
            piece = data[i:i + RECORD_MOST]
            out += struct.pack("<QB", at + i, len(piece)) + piece
    return bytes(out)


def varint(n):
    """An integer in base 128, most significant first, the continuation bit high on all but the last."""
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append(0x80 | (n & 0x7F))
        n >>= 7
    return bytes(reversed(out))


def _window(source, start, changed):
    """One VCDIFF window over the source bytes from start: a COPY for every
    unchanged stretch and an ADD for every changed one, with the window's
    Adler-32 for the decoder to check."""
    data, inst, addr = bytearray(), bytearray(), bytearray()
    target = bytearray(source)
    here = 0
    for at, piece in changed:
        lo, hi = max(at, start) - start, min(at + len(piece), start + len(source)) - start
        piece = piece[lo + start - at:hi + start - at]
        if lo > here:
            inst += bytes([COPY]) + varint(lo - here)
            addr += varint(here)
        inst += bytes([ADD]) + varint(hi - lo)
        data += piece
        target[lo:hi] = piece
        here = hi
    if here < len(source):
        inst += bytes([COPY]) + varint(len(source) - here)
        addr += varint(here)
    body = (varint(len(target)) + b"\0" + varint(len(data)) + varint(len(inst)) + varint(len(addr))
            + zlib.adler32(target).to_bytes(4, "big") + data + inst + addr)
    return bytes([VCD_SOURCE | VCD_ADLER32]) + varint(len(source)) + varint(start) + varint(len(body)) + body


def vcdiff(original, writes, window=WINDOW):
    """A VCDIFF patch as xdelta3 decodes it: windows of at most so many bytes,
    each copying from the same stretch of the source, with no secondary
    compression and no application header."""
    changed = changes(original, writes)
    out = bytearray(VCDIFF_MAGIC + b"\0")
    with open(original, "rb") as f:
        f.seek(0, 2)
        total = f.tell()
        for start in range(0, total, window):
            f.seek(start)
            source = f.read(min(window, total - start))
            within = [(at, piece) for at, piece in changed if at < start + len(source) and at + len(piece) > start]
            out += _window(source, start, within)
    return bytes(out)


def placements(image, out):
    """Where each emulator wants the PPF, and how the xdelta is applied."""
    image, out = Path(image), Path(out)
    return [f"DuckStation, with Apply Image Patches on, and PCSX-Redux read the PPF beside the image as {image.stem}.ppf",
            f"ePSXe and PCSX-ReARMed read it from their patches folder as {SERIAL}, with no extension",
            f'the xdelta applies with: xdelta3 -d -s "{image.name}" "{out.name}.xdelta" "{out.name}.bin"']


# --- the fixture: the synthetic image patched by every path -----------------------

SLOT = 1
TITLE = "Spiral"
CASES = [("in place", 6), ("rebuild", 30), ("rebuild, recompressed", 60), ("relocate", 120)]


def digest(blob):
    return hashlib.sha256(blob).hexdigest()


def fixture(scratch):
    """The digests of the synthetic image patched by each path, written beside
    the image's own digest so a port can hold its image to this one first."""
    image = Path(scratch) / "synthetic.bin"
    image.write_bytes(synthetic_image())
    out = {"image": digest(image.read_bytes()), "pack": SYNTHETIC_PACK, "slot": SLOT, "title": TITLE, "cases": []}
    for name, n in CASES:
        stream = zlib.compress(canonical(synthetic(n)), 6)
        patched = Path(scratch) / "patched.bin"
        placed = place(image, SYNTHETIC_PACK, SLOT, stream, patched, TITLE)
        out["cases"].append({
            "name": name, "blocks": n, "stream": len(stream), "path": placed.fit.path,
            "recompressed": placed.fit.recompressed, "size": placed.fit.size, "room": placed.fit.room,
            "lba": placed.lba, "sectors": [lba for lba, _ in placed.writes],
            "patched": digest(patched.read_bytes()),
            "ppf": digest(ppf(image, placed.writes, PREFIX + TITLE)),
            "xdelta": digest(vcdiff(image, placed.writes)),
        })
    text = json.dumps(out, indent=1) + "\n"
    hit = HEX_RUN.search(text)
    if hit:
        raise ValueError(f"the fixture holds {hit.group()}, which reads as a hash")
    return text


# --- the command line ---------------------------------------------------------------

def load_level(arg, world):
    """A project from a .kula.json, a .kwl, or a shipped level named PACK#slot."""
    path = Path(arg)
    if path.is_file() and path.suffix == ".json":
        try:
            return read_project(json.loads(path.read_text()))
        except json.JSONDecodeError as e:
            sys.exit(f"{arg} is not JSON: {e}")
        except ValueError as e:
            sys.exit(f"{arg} is {e}")
    if path.is_file():
        project, report = read_kwl(path.read_bytes(), world)
        project["title"] = path.stem
        return project, report
    if "#" in arg:
        try:
            return template(json.loads(DATA.read_text()), arg), []
        except KeyError:
            sys.exit(f"no shipped level is {arg}; name one like /HIRO/HIRO.PAK#0")
    sys.exit(f"no level at {arg}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--level", metavar="FILE", help="a .kula.json project, a .kwl level file, or a shipped level as PACK#slot")
    ap.add_argument("--into", default="/HIRO/HIRO.PAK#0", help="the slot the level takes, of a world pack or a finals pack")
    ap.add_argument("--out", metavar="NAME", help="what the outputs are called, without an extension")
    ap.add_argument("--disc", default=None, help="raw PS1 image; defaults to $KULA_DISC")
    ap.add_argument("--ppf", action="store_true", help="write NAME.ppf")
    ap.add_argument("--xdelta", action="store_true", help="write NAME.xdelta")
    ap.add_argument("--image", action="store_true", help="write NAME.bin and NAME.cue")
    ap.add_argument("--world", default="HIRO", help="the world a .kwl file is read as being for")
    ap.add_argument("--fixture", action="store_true", help=f"write {FIXTURE.relative_to(ROOT)}")
    args = ap.parse_args()

    if args.fixture:
        with tempfile.TemporaryDirectory() as scratch:
            FIXTURE.write_text(fixture(scratch))
        print(f"wrote {FIXTURE.relative_to(ROOT)}")
        return
    if not (args.level and args.out):
        ap.error("say --level FILE and --out NAME")
    wanted = {"ppf": args.ppf, "xdelta": args.xdelta, "image": args.image}
    if not any(wanted.values()):
        wanted = dict.fromkeys(wanted, True)

    project, report = load_level(args.level, args.world)
    for line in report:
        print(line, file=sys.stderr)
    pack_path, _, slot = args.into.rpartition("#")
    if not pack_path or not re.fullmatch(r"[0-9]+", slot):
        sys.exit(f"--into wants a pack path and a slot, like /HIRO/HIRO.PAK#0, not {args.into!r}")
    project["into"] = args.into
    findings = validate(project, json.loads(OBJECTS.read_text())["skins"]["hides"])
    for finding in findings:
        print(describe(finding), file=sys.stderr)
    if any(level == "error" for level, _, _ in findings):
        sys.exit("the level has errors the game would not forgive; fix them first")
    try:
        stream = zlib.compress(canonical(project), 6)
    except ValueError as e:
        sys.exit(str(e))
    stem = Path(args.level).stem
    title = project.get("title") or stem.removesuffix(".kula")

    src = args.disc or os.environ.get("KULA_DISC")
    disc = open_disc(src)
    out = Path(args.out)
    named = lambda ext: out.with_name(out.name + ext)  # noqa: E731
    asked = [ext for ext, want in ((".bin", wanted["image"]), (".cue", wanted["image"]),
                                   (".ppf", wanted["ppf"]), (".xdelta", wanted["xdelta"])) if want]
    for path in (named(ext) for ext in asked):
        if path.exists():
            why = "is the image itself" if path.samefile(src) else "exists already"
            sys.exit(f"{path} {why}; say another --out")
    try:
        with disc:
            placed = plan(disc, pack_path, int(slot), stream, title)
        if wanted["image"]:
            written(src, named(".bin"), placed.writes, lambda copy: verify(copy, pack_path, int(slot), stream, placed))
        else:
            with Patched(src, placed.writes) as view:
                verify(view, pack_path, int(slot), stream, placed)
    except ValueError as e:
        sys.exit(str(e))
    for warning in placed.warnings:
        print(f"warning: {warning}", file=sys.stderr)

    recompressed = ", the other levels recompressed" if placed.fit.recompressed else ""
    print(f"{title} ({len(stream)} bytes) into {pack_path}#{slot}: {placed.fit.path}{recompressed}, "
          f"{placed.fit.room} bytes of room, the pack {placed.fit.size} bytes at sector {placed.lba}")
    if wanted["image"]:
        print(f"{len(placed.writes)} sectors written: {', '.join(str(lba) for lba, _ in placed.writes)}")
        print(f"{named('.bin')} and {named('.cue')}")
    if wanted["ppf"]:
        blob = ppf(src, placed.writes, PREFIX + title)
        named(".ppf").write_bytes(blob)
        print(f"{named('.ppf')}: {len(blob)} bytes")
    if wanted["xdelta"]:
        blob = vcdiff(src, placed.writes)
        named(".xdelta").write_bytes(blob)
        print(f"{named('.xdelta')}: {len(blob)} bytes")
    for line in placements(src, out):
        print(f"  {line}")


if __name__ == "__main__":
    main()
