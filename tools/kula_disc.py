"""The Roll Away disc: where the level packs, textures and executable live.

`$KULA_DISC` points at a raw .bin image of the NTSC-U release (SLUS-00724).
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from disc import Disc

EXE = "/SLUS_007.24"
EXE_BASE = 0x80010000 - 0x800    # the PS-EXE header occupies the first 0x800 bytes

# The order a player meets them.
THEMES = ["HIRO", "HILLS", "INCA", "ARCTIC", "COWBOY",
          "FIELD", "ATLANT", "HAZE", "MARS", "HELL"]


def open_disc(path=None):
    path = path or os.environ.get("KULA_DISC")
    if not path:
        sys.exit("no disc image: pass --disc or set $KULA_DISC")
    return Disc(path)


def packs(disc):
    out = []
    for theme in THEMES:
        out.append((theme, f"/{theme}/{theme}.PAK"))
        if theme == "HIRO":
            out.append((theme, "/HIRO/COPYCAT.PAK"))
        out.append((theme, f"/{theme}/{theme}FI.PAK"))
    return [(t, p) for t, p in out if p.upper() in disc.files]
