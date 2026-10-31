"""Minimal PNG writer and reader, with `oxipng` run over what it writes where it
is on PATH; without it the file is still correct, only larger.
"""
import shutil
import struct
import subprocess
import sys
import zlib
from pathlib import Path

SIGNATURE = b"\x89PNG\r\n\x1a\n"
COLOURS = {0: "greyscale", 2: "RGB", 3: "indexed colour", 4: "greyscale and alpha", 6: "RGBA"}


def write_png(path, w, h, rgba):
    """RGBA in, and RGB out wherever the alpha channel says nothing."""
    opaque = all(rgba[i] == 255 for i in range(3, len(rgba), 4))
    px, bpp, colour = (_drop_alpha(rgba), 3, 2) if opaque else (rgba, 4, 6)

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))

    stride = w * bpp
    scan = b"".join(b"\x00" + bytes(px[y * stride:(y + 1) * stride]) for y in range(h))
    png = (SIGNATURE
           + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, colour, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(scan, 9))
           + chunk(b"IEND", b""))
    Path(path).write_bytes(png)
    optimise(path)


def read_png(path):
    """RGBA out, alpha 255 wherever the file carries none, from an 8-bit RGB or RGBA PNG."""
    png = Path(path).read_bytes()
    if png[:8] != SIGNATURE:
        sys.exit(f"{path} is not a PNG")
    chunks, at = {}, 8
    while at < len(png):
        n, tag = struct.unpack(">I4s", png[at:at + 8])
        chunks[tag] = chunks.get(tag, b"") + png[at + 8:at + 8 + n]
        at += n + 12
    w, h, depth, colour, _, _, interlace = struct.unpack(">IIBBBBB", chunks[b"IHDR"])
    bpp = {2: 3, 6: 4}.get(colour)
    if depth != 8 or not bpp or interlace:
        kind = f"{depth}-bit {COLOURS.get(colour, f'colour type {colour}')}{', interlaced' if interlace else ''}"
        sys.exit(f"{path} is {kind}, and only 8-bit RGB or RGBA without interlace is read")
    px = _unfilter(zlib.decompress(chunks[b"IDAT"]), w * bpp, bpp, h)
    return w, h, bytes(px if bpp == 4 else _add_alpha(px, chunks.get(b"tRNS")))


def _drop_alpha(rgba):
    out = bytearray(len(rgba) // 4 * 3)
    out[0::3] = rgba[0::4]
    out[1::3] = rgba[1::4]
    out[2::3] = rgba[2::4]
    return out


def _add_alpha(rgb, key):
    out = bytearray(len(rgb) // 3 * 4)
    out[0::4] = rgb[0::3]
    out[1::4] = rgb[1::3]
    out[2::4] = rgb[2::3]
    key = key and bytes(struct.unpack(">3H", key))
    out[3::4] = bytes(255 * (rgb[i:i + 3] != key) for i in range(0, len(rgb), 3))
    return out


def _unfilter(data, stride, bpp, h):
    """The scanlines with their filters undone: none, sub, up, average and Paeth."""
    out, prev = bytearray(), bytes(stride)
    for y in range(h):
        at = y * (stride + 1)
        kind, row = data[at], bytearray(data[at + 1:at + 1 + stride])
        for i in range(stride if kind else 0):
            a, b, c = (row[i - bpp], prev[i], prev[i - bpp]) if i >= bpp else (0, prev[i], 0)
            if kind == 1:
                p = a
            elif kind == 2:
                p = b
            elif kind == 3:
                p = (a + b) >> 1
            else:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                p = a if pa <= pb and pa <= pc else b if pb <= pc else c
            row[i] = (row[i] + p) & 255
        out += row
        prev = row
    return out


def optimise(path):
    if not shutil.which("oxipng"):
        return
    done = subprocess.run(["oxipng", "-o", "max", "--strip", "safe", str(path)], stdout=subprocess.DEVNULL)
    if done.returncode:
        sys.exit(f"oxipng could not squeeze {path}, which is not to be committed as it is")
