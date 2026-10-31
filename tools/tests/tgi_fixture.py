"""A world's artwork built for the tests: one to three textures, each a picture of its own, drawn
through a palette set and laid out as the game's .TGI lays them, and the atlases a base release's
worlds would ship, as read_png gives the committed ones."""

import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import kula_tgi as tgi  # noqa: E402
from kula_tex import SHADES, atlas  # noqa: E402

TEX_AT = (64, 0)
ROWS = (5, 6, 7)
# every index 16 times over, so each palette entry is painted somewhere
PIXELS = bytes(range(256)) * 16

PALETTES = {
    5: [0x8000 | (v & 31) | ((v >> 3) << 10) for v in range(256)],
    # index 0 without its top bit, as a transparent black is stored
    6: [0] + [0x8000 | (v << 5) | 7 for v in range(1, 256)],
    # fourteen greys
    7: [0x8000 | ((v // 19 + 10) * 0x421) for v in range(256)],
}
# palette sets another release might ship: the bright shade's row repainted, and the middle one's with it
BRIGHT = {**PALETTES, 7: PALETTES[5]}
BOTH = {**BRIGHT, 6: PALETTES[7]}


def upload(x, y, w, h, words):
    return struct.pack("<4H", x, y, w, h) + words


def texture(i):
    """The bytes of texture `i`, each texture a picture of its own."""
    return PIXELS[i:] + PIXELS[:i]


def tgi_blob(rows=ROWS, record=True, tex_at=TEX_AT, textures=1, palettes=PALETTES, models=()):
    art = b"".join(upload(tex_at[0] + i * 32, tex_at[1], 32, 64, texture(i)) for i in range(textures))
    for row, words in palettes.items():
        art += upload(768, row, 256, 1, struct.pack("<256H", *words))
    quads = b""
    for i in range(textures if record else 0):
        rec = [0] * tgi.MAP_STRIDE
        rec[3], rec[4] = tex_at[0] + i * 32, tex_at[1]
        rec[5:5 + SHADES] = rows
        quads += struct.pack(f"<{tgi.MAP_STRIDE}H", *rec)
    table = struct.pack(f"<{2 * len(models)}h", *[v for pair in models for v in pair])
    counts = [0] * tgi.SECTIONS
    counts[tgi.MODELS] = len(table) // 2
    counts[tgi.MAP] = len(quads) // 2
    counts[tgi.ART] = len(art) // 2
    header = bytearray(tgi.HEADER)
    struct.pack_into(f"<{tgi.SECTIONS}I", header, tgi.COUNTS_AT, *counts)
    return bytes(header) + table + quads + art


def worlds(**palettes):
    """A release's artwork by world, each world's two textures drawn through the palette set named for it."""
    return {world: tgi_blob(textures=2, palettes=p) for world, p in palettes.items()}


def atlases(blobs):
    return {world: atlas(blob)[:3] for world, blob in blobs.items()}
