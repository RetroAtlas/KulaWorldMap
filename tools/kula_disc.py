"""The Roll Away disc: where the level packs, textures and executable live.

`$KULA_DISC` points at a raw .bin image of the NTSC-U release (SLUS-00724).
"""
import errno
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


def output_at(arg, flag, exts=("",)):
    """The path an output is written at, or the tool's exit in one sentence:
    the argument must name a file, its directory must stand, and the process
    must be able to write it, or write into the directory where nothing stands
    yet; `exts` are the endings the outputs take, the first of them naming the
    file in the sentence."""
    path = Path(arg)
    if not path.name or path.name == ".." or str(arg).endswith(("/", os.sep)):
        sys.exit(f"say a name for {flag}")
    first = path.with_name(path.name + exts[0])
    try:
        mode = os.stat(path).st_mode
    except (FileNotFoundError, NotADirectoryError):
        mode = None
    except OSError as e:
        sys.exit(f"{first} cannot be written: {e.strerror}")
    if mode is not None and stat.S_ISDIR(mode):
        sys.exit(f"{path} is a directory; say a name for {flag}")
    # a file that stands is replaced, which asks leave of the file and not of its directory
    if mode is not None and first == path:
        if not os.access(path, os.W_OK):
            sys.exit(f"{path} cannot be written: {os.strerror(errno.EACCES)}")
        return path
    try:
        if not stat.S_ISDIR(os.stat(path.parent).st_mode):
            sys.exit(f"no directory at {path.parent}; say another {flag}")
    except (FileNotFoundError, NotADirectoryError):
        sys.exit(f"no directory at {path.parent}; say another {flag}")
    except OSError as e:
        sys.exit(f"{first} cannot be written: {e.strerror}")
    if not os.access(path.parent, os.W_OK | os.X_OK):
        sys.exit(f"{first} cannot be written: {os.strerror(errno.EACCES)}")
    return path


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
