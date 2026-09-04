"""Minimal RGBA PNG writer (unfiltered, zlib). No third-party dependencies."""
import struct
import zlib
from pathlib import Path


def write_png(path, w, h, rgba, keep_alpha=True):
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))

    rgba = bytearray(rgba)
    if not keep_alpha:
        for i in range(3, len(rgba), 4):
            rgba[i] = 255
    scan = b"".join(b"\x00" + bytes(rgba[y * w * 4:(y + 1) * w * 4]) for y in range(h))
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(scan, 6))
           + chunk(b"IEND", b""))
    Path(path).write_bytes(png)
