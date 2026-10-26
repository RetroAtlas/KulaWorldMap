#!/usr/bin/env python3
"""Write a level, or several, onto the disc as one patch: a PPF, an xdelta, or a patched image.

    export KULA_DISC="/path/to/Roll Away.bin"
    python3 tools/kula_patch.py --level spiral.kula.json --into /HIRO/HIRO.PAK#0 --out spiral
    python3 tools/kula_patch.py --level spiral.kwl --into /HIRO/HIRO.PAK#0 --out spiral --ppf
    python3 tools/kula_patch.py --level /HIRO/HIRO.PAK#3 --into /HIRO/HIRO.PAK#0 --out level4 --image
    python3 tools/kula_patch.py --level /HELL/HELL.PAK#17 --release eu --into /HELL/HELL.PAK#17 --out bonus30 --ppf
    python3 tools/kula_patch.py --level spiral.kwl --into /HIRO/HIRO.PAK#0 \
                                --level tower.kwl --into /HIRO/HIRO.PAK#1 --out world
    python3 tools/kula_patch.py --fixture               # tests/fixtures/patch-digests.json

The level, a project file, a level file or a shipped level, is written as the
game's bytes, deflated, and placed in its slot by kula_place; the sectors the
placement writes are what the patches carry. A shipped level is the US disc's
unless --release names another disc, whose level it is where that disc's file
under public/releases/ holds the slot. Several levels, each --level paired
with the --into after it, are placed in the order given, each over the image
as the earlier ones left it, and the sectors of every placement are one patch.
A PPF 3.0 patch is what the PlayStation emulators lay over an untouched image,
each reading it from a place of its own, two of them from a folder named after
the executable the image boots; an xdelta patch, VCDIFF as xdelta3 writes it,
is what a player applies with xdelta3 or Rom Patcher to get a patched copy;
the image is that copy itself, with its cue sheet beside it. Nothing here
writes to the original image.
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
from kula_disc import RELEASES, file_at, open_disc, output_at, release_of
from kula_kwl import DATA, OBJECTS, canonical, describe, level_at, project_at, template, validate
from kula_place import (
    SYNTHETIC_FINALS,
    SYNTHETIC_PACK,
    Patched,
    place,
    place_all,
    plan_all,
    synthetic,
    synthetic_image,
    verify_all,
    written,
)
from kula_sector import HEX_RUN, SECTOR_RAW, raw_sector

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / "tests" / "fixtures" / "patch-digests.json"
RELEASE_FILES = {r: ROOT / "public" / "releases" / f"{r}.json" for r in RELEASES}

PPF_MAGIC = b"PPF30"
PPF_VERSION = 2
DESCRIPTION = 50
BLOCK_AT = 0x9320       # 32 bytes into sector 16: the volume descriptor from its system identifier on
BLOCK = 1024
RECORD_MOST = 255

VCDIFF_MAGIC = b"\xd6\xc3\xc4\x00"
WINDOW = 8 << 20
VCD_SOURCE = 1
VCD_ADLER32 = 4
COPY, ADD = 19, 1       # the default code table's COPY in mode 0 and ADD, each with its size following

PREFIX = "Kula World Map: "
INTO = "/HIRO/HIRO.PAK#0"


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
    text = "".join(c if " " <= c <= "~" else "?" for c in description).encode("ascii")[:DESCRIPTION].ljust(DESCRIPTION)
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


def description(titles):
    """What a PPF says of itself: the prefix and the levels' titles."""
    return PREFIX + ", ".join(titles)


def placements(image, out, boot):
    """Where each emulator wants the PPF, and how the xdelta is applied; the folder
    two of them read it from is named `boot`, the executable the image boots, and
    goes unsaid where the image boots none of the three."""
    image, out = Path(image), Path(out)
    folder = [f"ePSXe and PCSX-ReARMed read it from their patches folder as {boot}, with no extension"] if boot else []
    return [f"DuckStation, with Apply Image Patches on, and PCSX-Redux read the PPF beside the image as {image.stem}.ppf",
            *folder,
            f'the xdelta applies with: xdelta3 -d -s "{image.name}" "{out.name}.xdelta" "{out.name}.bin"']


# --- the fixture: the synthetic image patched by every path, and by sets of levels ---

SLOT = 1
TITLE = "Spiral"
CASES = [("in place", 6), ("rebuild", 30), ("rebuild, recompressed", 60), ("relocate", 120)]
SETS = [("two in one pack", [(6, SYNTHETIC_PACK, SLOT, TITLE), (30, SYNTHETIC_PACK, 2, "Tower")]),
        ("across packs", [(6, SYNTHETIC_PACK, SLOT, TITLE), (5, SYNTHETIC_FINALS, 0, "Tower")])]


def digest(blob):
    return hashlib.sha256(blob).hexdigest()


def items_of(members):
    """A set's members, (blocks, pack, slot, title), as the placer takes them."""
    return [(pack_path, slot, zlib.compress(canonical(synthetic(n, title)), 6), title)
            for n, pack_path, slot, title in members]


def fixture(scratch):
    """The digests of the synthetic image patched by each path and by each set
    of levels placed together, written beside the image's own digest so a port
    can hold its image to this one first."""
    image = Path(scratch) / "synthetic.bin"
    image.write_bytes(synthetic_image())
    out = {"image": digest(image.read_bytes()), "pack": SYNTHETIC_PACK, "slot": SLOT, "title": TITLE, "cases": [], "sets": []}
    patched = Path(scratch) / "patched.bin"
    for name, n in CASES:
        stream = zlib.compress(canonical(synthetic(n)), 6)
        placed = place(image, SYNTHETIC_PACK, SLOT, stream, patched, TITLE)
        out["cases"].append({
            "name": name, "blocks": n, "stream": len(stream), "path": placed.fit.path,
            "recompressed": placed.fit.recompressed, "size": placed.fit.size, "room": placed.fit.room,
            "lba": placed.lba, "sectors": [lba for lba, _ in placed.writes],
            "patched": digest(patched.read_bytes()),
            "ppf": digest(ppf(image, placed.writes, PREFIX + TITLE)),
            "xdelta": digest(vcdiff(image, placed.writes)),
        })
    for name, members in SETS:
        items = items_of(members)
        planned = place_all(image, items, patched)
        out["sets"].append({
            "name": name,
            "items": [{"blocks": n, "pack": pack_path, "slot": slot, "title": title, "stream": len(stream),
                       "path": placed.fit.path, "recompressed": placed.fit.recompressed, "size": placed.fit.size,
                       "room": placed.fit.room, "lba": placed.lba}
                      for (n, _, _, _), (pack_path, slot, stream, title), placed in zip(members, items, planned.placed)],
            "sectors": [lba for lba, _ in planned.writes],
            "patched": digest(patched.read_bytes()),
            "ppf": digest(ppf(image, planned.writes, description(title for *_, title in items))),
            "xdelta": digest(vcdiff(image, planned.writes)),
        })
    text = json.dumps(out, indent=1) + "\n"
    hit = HEX_RUN.search(text)
    if hit:
        raise ValueError(f"the fixture holds {hit.group()}, which reads as a hash")
    return text


# --- the command line ---------------------------------------------------------------

def shipped(release):
    """The levels of a release's disc: the US data with the slots the release's
    file holds in their place."""
    data = json.loads(DATA.read_text())
    variants = json.loads(RELEASE_FILES[release].read_text())["levels"]
    data["levels"] = [variants.get(f"{level['pack']}#{level['index']}", level) for level in data["levels"]]
    return data


def load_level(arg, world, release):
    """A project from a .kula.json, a .kwl, or a shipped level named PACK#slot, the release's disc's."""
    path = Path(arg)
    if file_at(arg):
        if path.suffix == ".json":
            return project_at(arg)
        project, report = level_at(arg, world)
        project["title"] = path.stem
        return project, report
    if "#" in arg:
        try:
            return template(shipped(release), arg), []
        except KeyError:
            sys.exit(f"no shipped level is {arg}; name one like /HIRO/HIRO.PAK#0")
    sys.exit(f"no file at {arg}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--level", action="append", metavar="FILE",
                    help="a .kula.json project, a .kwl level file, or a shipped level as PACK#slot; repeat for several")
    ap.add_argument("--into", action="append",
                    help=f"the slot the level takes, of a world pack, a finals pack or the Simon rooms' pack, one after each --level; {INTO} for one level without it")
    ap.add_argument("--out", metavar="NAME", help="what the outputs are called, without an extension")
    ap.add_argument("--disc", default=None, help="raw PS1 image; defaults to $KULA_DISC")
    ap.add_argument("--ppf", action="store_true", help="write NAME.ppf")
    ap.add_argument("--xdelta", action="store_true", help="write NAME.xdelta")
    ap.add_argument("--image", action="store_true", help="write NAME.bin and NAME.cue")
    ap.add_argument("--world", default="HIRO", help="the world a .kwl file is read as being for")
    ap.add_argument("--release", choices=list(RELEASES), default="us",
                    help="the disc whose level a PACK#slot names, where that disc's level differs from the US one")
    ap.add_argument("--fixture", action="store_true", help=f"write {FIXTURE.relative_to(ROOT)}")
    args = ap.parse_args()

    if args.fixture:
        with tempfile.TemporaryDirectory() as scratch:
            FIXTURE.write_text(fixture(scratch))
        print(f"wrote {FIXTURE.relative_to(ROOT)}")
        return
    if not (args.level and args.out):
        ap.error("say --level FILE and --out NAME")
    intos = args.into or ([INTO] if len(args.level) == 1 else [])
    if len(intos) != len(args.level):
        sys.exit(f"{len(args.level)} --level and {len(intos)} --into do not pair up; say one --into after each --level")
    wanted = {"ppf": args.ppf, "xdelta": args.xdelta, "image": args.image}
    if not any(wanted.values()):
        wanted = dict.fromkeys(wanted, True)
    src = args.disc or os.environ.get("KULA_DISC")
    asked = [ext for ext, want in ((".bin", wanted["image"]), (".cue", wanted["image"]),
                                   (".ppf", wanted["ppf"]), (".xdelta", wanted["xdelta"])) if want]
    out = output_at(args.out, "--out", asked)
    named = lambda ext: out.with_name(out.name + ext)  # noqa: E731
    try:
        for path in (named(ext) for ext in asked):
            if path.exists():
                why = "is the image itself" if src and file_at(src) and path.samefile(src) else "exists already"
                sys.exit(f"{path} {why}; say another --out")
    except OSError as e:
        sys.exit(f"{named(asked[0])} cannot be written: {e.strerror}")

    hides = json.loads(OBJECTS.read_text())["skins"]["hides"]
    items = []
    for arg, into in zip(args.level, intos):
        project, report = load_level(arg, args.world, args.release)
        for line in report:
            print(line, file=sys.stderr)
        pack_path, _, slot = into.rpartition("#")
        if not pack_path or not re.fullmatch(r"[0-9]+", slot):
            sys.exit(f"--into wants a pack path and a slot, like {INTO}, not {into!r}")
        project["into"] = into
        findings = validate(project, hides)
        for finding in findings:
            print(describe(finding), file=sys.stderr)
        title = project.get("title") or Path(arg).stem.removesuffix(".kula")
        if any(level == "error" for level, _, _ in findings):
            sys.exit(f"{title} has errors the game would not forgive; fix them first")
        try:
            stream = zlib.compress(canonical(project), 6)
        except ValueError as e:
            sys.exit(str(e))
        items.append((pack_path, int(slot), stream, title))

    disc = open_disc(src)
    try:
        with disc:
            planned = plan_all(disc, items)
            release = release_of(disc)
    except ValueError as e:
        sys.exit(str(e))
    except OSError as e:
        sys.exit(f"{src} cannot be read: {e.strerror}")
    try:
        if wanted["image"]:
            written(src, named(".bin"), planned.writes, lambda copy: verify_all(copy, items, planned))
        else:
            with Patched(src, planned.writes) as view:
                verify_all(view, items, planned)
    except ValueError as e:
        sys.exit(str(e))
    except OSError as e:
        sys.exit(f"{e.filename or named('.bin')} cannot be written: {e.strerror}")
    for warning in planned.warnings:
        print(f"warning: {warning}", file=sys.stderr)

    for (pack_path, slot, stream, title), placed in zip(items, planned.placed):
        recompressed = ", the other levels recompressed" if placed.fit.recompressed else ""
        print(f"{title} ({len(stream)} bytes) into {pack_path}#{slot}: {placed.fit.path}{recompressed}, "
              f"{placed.fit.room} bytes of room, the pack {placed.fit.size} bytes at sector {placed.lba}")
    if wanted["image"]:
        print(f"{len(planned.writes)} sectors written: {', '.join(str(lba) for lba, _ in planned.writes)}")
        print(f"{named('.bin')} and {named('.cue')}")
    patches = []
    if wanted["ppf"]:
        patches.append((named(".ppf"), ppf(src, planned.writes, description(title for *_, title in items))))
    if wanted["xdelta"]:
        patches.append((named(".xdelta"), vcdiff(src, planned.writes)))
    for path, blob in patches:
        try:
            path.write_bytes(blob)
        except OSError as e:
            sys.exit(f"{path} cannot be written: {e.strerror}")
        print(f"{path}: {len(blob)} bytes")
    for line in placements(src, out, RELEASES[release]["boot"] if release else None):
        print(f"  {line}")


if __name__ == "__main__":
    main()
