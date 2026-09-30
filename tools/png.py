"""Minimal PNG writer, with `oxipng` run over what it writes where it is on PATH;
without it the file is still correct, only larger.
"""
import shutil
import struct
import subprocess
import zlib
from pathlib import Path


def write_png(path, w, h, rgba):
    """RGBA in, and RGB out wherever the alpha channel says nothing."""
    opaque = all(rgba[i] == 255 for i in range(3, len(rgba), 4))
    px, bpp, colour = (_drop_alpha(rgba), 3, 2) if opaque else (rgba, 4, 6)

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))

    stride = w * bpp
    scan = b"".join(b"\x00" + bytes(px[y * stride:(y + 1) * stride]) for y in range(h))
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, colour, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(scan, 9))
           + chunk(b"IEND", b""))
    Path(path).write_bytes(png)
    optimise(path)


def _drop_alpha(rgba):
    out = bytearray(len(rgba) // 4 * 3)
    out[0::3] = rgba[0::4]
    out[1::3] = rgba[1::4]
    out[2::3] = rgba[2::4]
    return out


def optimise(path):
    if not shutil.which("oxipng"):
        return
    subprocess.run(["oxipng", "-q", "-o", "max", "--strip", "safe", str(path)], check=False)
