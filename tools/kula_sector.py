#!/usr/bin/env python3
"""A Mode 2 Form 1 sector, built as the disc has it.

    export KULA_DISC="/path/to/Roll Away.bin"
    python3 tools/kula_sector.py --check      # rebuild the disc's own sectors and compare
    python3 tools/kula_sector.py --sweep      # the same over every Form 1 sector of the image
    python3 tools/kula_sector.py --fixture    # --check, then write tests/fixtures/sectors.json

    12 bytes   sync
    4          the sector's minutes, seconds and frames in BCD, then the mode
    4 + 4      file, channel, submode, coding, written twice
    2048       user data
    4          EDC, a CRC-32 over the subheader and the user data
    276        ECC, Reed-Solomon parity over the header, subheader, user data
               and EDC, with the header read as zero

The EDC's polynomial is (x^16 + x^15 + x^2 + 1)(x^16 + x^2 + x + 1), run least
significant bit first from a zero register with no final inversion. The ECC
works in GF(2^8) over x^8 + x^4 + x^3 + x^2 + 1 and reads the 2064 bytes it
covers as two planes, the even bytes and the odd. P lays a plane out as 24
rows of 43 and closes each column with two parity bytes; Q lays the plane and
its P parity out as 26 rows of 43 and closes each of the 26 diagonals. Both
codes have the check matrix of a row of ones over a row of descending powers
of alpha. The header is read as zero so that the same bytes carry the same
parity at any address, which is what lets a file move. The address counts
from the two-second pregap, so the header reads LBA + 150.
"""
import argparse
import base64
import json
import re
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import open_disc, packs

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / "tests" / "fixtures" / "sectors.json"

SECTOR_RAW = 2352
USER = 2048
SYNC = b"\x00" + b"\xff" * 10 + b"\x00"
HEADER_OFF = 12
SUBHEADER_OFF = 16
USER_OFF = 24
EDC_OFF = 2072
ECC_OFF = 2076
MODE = 2
PREGAP = 150
DATA_SUBMODE = 0x08
EOF_SUBMODE = 0x89     # a file's last sector: end of record, data, end of file
FORM2 = 0x20           # the submode bit of a Form 2 sector, which carries no ECC

EDC_POLY = 0xD8018001  # the EDC polynomial, bit-reversed
GF_POLY = 0x11D
PLANES = 2
P_ROWS, P_COLS = 24, 43
Q_ROWS, Q_COLS = 26, 43
P_STRIDE = PLANES * P_COLS        # a row of both planes, in bytes
Q_STRIDE = PLANES * (Q_COLS + 1)  # a diagonal steps one row down and one column along
P_SPAN = EDC_OFF + 4 - HEADER_OFF
P_PARITY = 2 * P_STRIDE
Q_SPAN = P_SPAN + P_PARITY
Q_PARITY = 2 * PLANES * Q_ROWS


def _crc_table(poly):
    out = []
    for i in range(256):
        x = i
        for _ in range(8):
            x = (x >> 1) ^ (poly if x & 1 else 0)
        out.append(x)
    return out


def _field():
    """A byte times alpha, and a byte over alpha + 1, in GF(2^8)."""
    times = [(v << 1) ^ (GF_POLY if v & 0x80 else 0) for v in range(256)]
    over = [0] * 256
    for v in range(256):
        over[v ^ times[v]] = v
    return times, over


EDC_TABLE = _crc_table(EDC_POLY)
TIMES_ALPHA, OVER_ALPHA1 = _field()


def edc(raw):
    """The CRC-32 of a sector's subheader and user data."""
    e = 0
    for v in raw[SUBHEADER_OFF:EDC_OFF]:
        e = (e >> 8) ^ EDC_TABLE[(e ^ v) & 0xFF]
    return e


def parity(body, start, step, count, wrap):
    """The two bytes that close the codeword read from body at start, every
    step bytes, round again at wrap."""
    s0 = s1 = 0
    i = start
    for _ in range(count):
        v = body[i]
        s0 ^= v
        s1 = TIMES_ALPHA[s1 ^ v]
        i = (i + step) % wrap
    p = OVER_ALPHA1[TIMES_ALPHA[s1] ^ s0]
    return p, p ^ s0


def ecc(raw):
    """The 276 parity bytes of a sector's header, subheader, user data and EDC."""
    body = bytearray(Q_SPAN)
    body[4:P_SPAN] = raw[HEADER_OFF + 4:EDC_OFF + 4]
    for m in range(P_STRIDE):
        body[P_SPAN + m], body[P_SPAN + P_STRIDE + m] = parity(body, m, P_STRIDE, P_ROWS, P_SPAN)
    q = bytearray(Q_PARITY)
    for m in range(PLANES * Q_ROWS):
        first = (m >> 1) * P_STRIDE + (m & 1)
        q[m], q[PLANES * Q_ROWS + m] = parity(body, first, Q_STRIDE, Q_COLS, Q_SPAN)
    return bytes(body[P_SPAN:]) + bytes(q)


def bcd(n):
    return (n // 10) * 16 + n % 10


def header(lba):
    """The sector's address in minutes, seconds and frames, and its mode."""
    minutes, rest = divmod(lba + PREGAP, 60 * 75)
    seconds, frames = divmod(rest, 75)
    return bytes([bcd(minutes), bcd(seconds), bcd(frames), MODE])


def close(front):
    """A whole sector from everything before its EDC."""
    raw = bytearray(SECTOR_RAW)
    raw[:EDC_OFF] = front
    struct.pack_into("<I", raw, EDC_OFF, edc(raw))
    raw[ECC_OFF:] = ecc(raw)
    return bytes(raw)


def _user(user):
    if len(user) != USER:
        raise ValueError(f"a sector carries {USER} bytes of user data, not {len(user)}")
    return bytes(user)


def sector(lba, user, submode, file=0, channel=0):
    """A sector at an address, carrying the user data given."""
    sub = bytes([file, channel, submode, 0])
    return close(SYNC + header(lba) + sub + sub + _user(user))


def rewrite(raw, user):
    """The sector with its user data replaced and its sync, header and subheader kept."""
    return close(bytes(raw[:USER_OFF]) + _user(user))


def check(raw):
    """Whether the sector's EDC and ECC are those of its bytes."""
    return (struct.unpack_from("<I", raw, EDC_OFF)[0] == edc(raw)
            and bytes(raw[ECC_OFF:]) == ecc(raw))


# The disc holds the readings above: its own sectors have to come out of them
# bit for bit.

SAMPLE_STRIDE = 97


def raw_sector(f, lba):
    f.seek(lba * SECTOR_RAW)
    return f.read(SECTOR_RAW)


def sectors_of(lba, size):
    """The sectors a file of so many bytes at an extent occupies."""
    return range(lba, lba + (size + USER - 1) // USER)


def directories(disc):
    """The sector runs of the root directory and of every directory in it."""
    pvd = disc.sector(16)
    root = sectors_of(*struct.unpack_from("<I4xI", pvd, 156 + 2))
    runs = [root]
    data = disc.read(root.start, len(root) * USER)
    pos = 0
    while pos < len(data):
        ln = data[pos]
        if ln == 0:
            pos = (pos // USER + 1) * USER
            continue
        if data[pos + 25] & 2 and data[pos + 33:pos + 34] not in (b"\x00", b"\x01"):
            runs.append(sectors_of(*struct.unpack_from("<I4xI", data, pos + 2)))
        pos += ln
    return runs


def survey(disc):
    """The sectors the disc is held to, as (lba, what): every pack sector, the
    volume descriptor, the directories, and a sample of the rest."""
    picks = [(16, "volume descriptor")]
    for _, path in packs(disc):
        picks += [(s, "pack") for s in sectors_of(*disc.files[path.upper()])]
    picks += [(s, "directory") for run in directories(disc) for s in run]
    disc.f.seek(0, 2)
    total = disc.f.tell() // SECTOR_RAW
    taken = {lba for lba, _ in picks}
    for lba in range(0, total, SAMPLE_STRIDE):
        if lba not in taken and not raw_sector(disc.f, lba)[SUBHEADER_OFF + 2] & FORM2:
            picks.append((lba, "sampled"))
    return picks


def rebuilt(raw, lba):
    """Whether the sector comes out of its address, subheader and user data as
    the disc has it, checks, and survives a rewrite with its own data."""
    file, channel, submode = raw[SUBHEADER_OFF:SUBHEADER_OFF + 3]
    user = raw[USER_OFF:EDC_OFF]
    return (sector(lba, user, submode, file, channel) == raw
            and check(raw) and rewrite(raw, user) == raw)


def verify(disc):
    """How many sectors of each kind rebuild, and the addresses of any that do not."""
    counts, failed = {}, []
    for lba, what in survey(disc):
        if rebuilt(raw_sector(disc.f, lba), lba):
            counts[what] = counts.get(what, 0) + 1
        else:
            failed.append((lba, what))
    return counts, failed


def sweep(disc):
    """How many Form 1 sectors of the whole image rebuild, and the addresses of any that do not."""
    disc.f.seek(0, 2)
    total = disc.f.tell() // SECTOR_RAW
    count, failed = 0, []
    for lba in range(total):
        raw = raw_sector(disc.f, lba)
        if raw[SUBHEADER_OFF + 2] & FORM2:
            continue
        if rebuilt(raw, lba):
            count += 1
        else:
            failed.append(lba)
    return count, failed


# The fixture: synthetic sectors for the viewer's port to be held to, written
# once the disc has held this side. Checksums are decimal and bytes base64,
# and no base64 run may read as a commit hash.

HEX_RUN = re.compile(r"(?<![\w#./-])(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,40}(?!\w)")


def noise(seed, n=USER):
    """So many bytes from a seed, the same in every run and every language."""
    out = bytearray(n)
    x = seed
    for i in range(n):
        x = (x * 1103515245 + 12345) & 0xFFFFFFFF
        out[i] = x >> 16 & 0xFF
    return bytes(out)


CASES = [
    ("zeros", 1002, DATA_SUBMODE, 0, 0, bytes(USER)),
    ("ones", 1003, DATA_SUBMODE, 0, 0, b"\xff" * USER),
    ("a ramp", 1004, DATA_SUBMODE, 0, 0, bytes(i & 0xFF for i in range(USER))),
    ("every seventh", 1005, DATA_SUBMODE, 0, 0, bytes(i * 7 & 0xFF for i in range(USER))),
    ("text", 16, 0x09, 0, 0, (b"KULA WORLD " * 187)[:USER]),
    ("noise 1", 59475, DATA_SUBMODE, 0, 0, noise(1)),
    ("noise 2", 322, DATA_SUBMODE, 0, 0, noise(2)),
    ("noise 3", 3609, DATA_SUBMODE, 0, 0, noise(3)),
    ("noise 4", 0, DATA_SUBMODE, 0, 0, noise(4)),
    ("noise 5", 93953, DATA_SUBMODE, 0, 0, noise(5)),
    ("a file's last sector", 1007, EOF_SUBMODE, 0, 0, noise(6)),
    ("a file and a channel", 2969, DATA_SUBMODE, 1, 2, noise(7)),
    ("the image's last sector", 109606, 0, 0, 0, noise(8)),
]
BROKEN = [(5, USER_OFF + 100, 0x01), (10, EDC_OFF - 1, 0x80)]


def fixture():
    b64 = lambda b: base64.b64encode(b).decode("ascii")  # noqa: E731
    cases = [{"name": name, "lba": lba, "submode": submode, "file": file, "channel": channel,
              "user": b64(user), "sector": b64(sector(lba, user, submode, file, channel))}
             for name, lba, submode, file, channel, user in CASES]
    broken = []
    for i, at, flip in BROKEN:
        raw = bytearray(base64.b64decode(cases[i]["sector"]))
        raw[at] ^= flip
        broken.append({"name": f"{cases[i]['name']} with byte {at} flipped", "from": i, "at": at,
                       "sector": b64(raw), "check": False})
    text = json.dumps({"cases": cases, "broken": broken}, indent=1) + "\n"
    hit = HEX_RUN.search(text)
    if hit:
        raise ValueError(f"the fixture holds {hit.group()}, which reads as a hash: change a seed")
    return text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=None, help="raw PS1 image; defaults to $KULA_DISC")
    ap.add_argument("--check", action="store_true", help="rebuild the disc's sectors and compare")
    ap.add_argument("--sweep", action="store_true", help="rebuild every Form 1 sector of the image and compare")
    ap.add_argument("--fixture", action="store_true",
                    help=f"after --check, write {FIXTURE.relative_to(ROOT)}")
    args = ap.parse_args()
    if not (args.check or args.sweep or args.fixture):
        ap.error("say --check, --sweep or --fixture")
    with open_disc(args.disc) as disc:
        if args.sweep:
            count, missed = sweep(disc)
            print(f"{count:5} Form 1 sectors rebuilt bit for bit")
            for lba in missed:
                print(f"sector {lba} does not rebuild")
            if missed:
                sys.exit(1)
        if args.check or args.fixture:
            counts, failed = verify(disc)
            for what, n in counts.items():
                print(f"{n:5} {what} sectors rebuilt bit for bit")
            for lba, what in failed:
                print(f"sector {lba} ({what}) does not rebuild")
            if failed:
                sys.exit(1)
    if args.fixture:
        FIXTURE.write_text(fixture())
        print(f"wrote {FIXTURE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
