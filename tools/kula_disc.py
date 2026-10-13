"""The Roll Away disc: where the level packs, textures and executable live.

`$KULA_DISC` points at a raw .bin image of the NTSC-U release (SLUS-00724).
"""
import os
import stat
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from disc import Disc

EXE = "/SLUS_007.24"
EXE_BASE = 0x80010000 - 0x800    # the PS-EXE header occupies the first 0x800 bytes

# The order a player meets them.
THEMES = ["HIRO", "HILLS", "INCA", "ARCTIC", "COWBOY",
          "FIELD", "ATLANT", "HAZE", "MARS", "HELL"]


def file_at(path):
    """Whether a file stands at the path, or the tool's exit in one sentence
    where the system will not say."""
    try:
        return stat.S_ISREG(os.stat(path).st_mode)
    except (FileNotFoundError, NotADirectoryError):
        return False
    except OSError as e:
        sys.exit(f"{path} cannot be read: {e.strerror}")


def open_disc(path=None):
    path = path or os.environ.get("KULA_DISC")
    if not path:
        sys.exit("no disc image: pass --disc or set $KULA_DISC")
    if not file_at(path):
        sys.exit(f"no disc image at {path}")
    try:
        return Disc(path)
    except OSError as e:
        sys.exit(f"{path} cannot be read: {e.strerror}")
    except (ValueError, IndexError, struct.error, RecursionError) as e:
        sys.exit(f"{path} does not read as a disc image: {e}")


def packs(disc):
    out = []
    for theme in THEMES:
        out.append((theme, f"/{theme}/{theme}.PAK"))
        if theme == "HIRO":
            out.append((theme, "/HIRO/COPYCAT.PAK"))
        out.append((theme, f"/{theme}/{theme}FI.PAK"))
    return [(t, p) for t, p in out if p.upper() in disc.files]
