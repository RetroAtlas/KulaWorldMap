"""The game's discs: the three releases by id, where each keeps its level packs,
textures and executable, and which of them an image is, told by its boot line.

`$KULA_DISC`, `$KULA_DISC_EU` and `$KULA_DISC_JP` point at raw .bin images of the
North American, European and Japanese releases.
"""
import errno
import os
import stat
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from disc import Disc

# `base` is the load address less the PS-EXE header, where the file's first byte would
# stand in memory; `gp` the pointer the startup sets.
RELEASES = {
    "us": {"label": "US", "name": "Roll Away", "region": "North America", "serial": "SLUS-00724",
           "boot": "SLUS_007.24", "sectors": 109607, "exe": "/SLUS_007.24",
           "base": 0x80010000 - 0x800, "gp": 0x800a2f38},
    "eu": {"label": "EU", "name": "Kula World", "region": "Europe", "serial": "SCES-01000",
           "boot": "SCES_010.00", "sectors": 108471, "exe": "/SCES_010.00",
           "base": 0x80011000 - 0x800, "gp": 0x800a29e0},
    "jp": {"label": "JP", "name": "Kula Quest", "region": "Japan", "serial": "SCPS-10064",
           "boot": "SCPS_100.64", "sectors": 136980, "exe": "/SCPS_100.64",
           "base": 0x80010000 - 0x800, "gp": 0x8009f064},
}
DISC_VARS = {"us": "KULA_DISC", "eu": "KULA_DISC_EU", "jp": "KULA_DISC_JP"}
RELEASE_FILES = {r: Path(__file__).resolve().parent.parent / "public" / "releases" / f"{r}.json" for r in RELEASES}
EXE = RELEASES["us"]["exe"]
EXE_BASE = RELEASES["us"]["base"]

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


def output_at(arg, flag, exts=("",), replaces=True):
    """The path an output is written at, or the tool's exit in one sentence:
    the argument must name a file, its directory must stand, and the process
    must be able to write it, or write into the directory where nothing stands
    yet; `exts` are the endings the outputs take, the first of them naming the
    file in the sentence, and a tool that never writes over a standing file
    says so with `replaces`, leaving that file to its own refusal."""
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
    # a file that stands is replaced, which asks leave of the file and not of its directory,
    # or is left to the tool's own refusal where it never writes over one
    if mode is not None and first == path:
        if replaces and not os.access(path, os.W_OK):
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


def release_of(disc):
    """The id of the release whose executable the image's SYSTEM.CNF boots, or None
    where the image has no SYSTEM.CNF or its BOOT line names no release's."""
    if "/SYSTEM.CNF" not in disc.files:
        return None
    for line in disc.read_file("/SYSTEM.CNF").decode("ascii", "replace").upper().splitlines():
        key, eq, value = line.partition("=")
        if eq and key.strip() == "BOOT":
            return next((r for r, e in RELEASES.items() if e["boot"] in value), None)
    return None


def open_release(release, path=None):
    """The image of a release, from the path given, else from the release's own
    variable, or the tool's exit in one sentence where there is none or the image
    boots another executable than that release's."""
    entry = RELEASES[release]
    path = path or os.environ.get(DISC_VARS[release])
    if not path:
        sys.exit(f"no disc image: pass --disc or set ${DISC_VARS[release]}")
    disc = open_disc(path)
    found = release_of(disc)
    if found != release:
        disc.close()
        boots = RELEASES[found]["boot"] if found else "no executable the game shipped"
        sys.exit(f"{path} boots {boots}, not the {entry['name']} disc's {entry['boot']}")
    return disc


def exe_of(disc):
    """The path and base of the executable the image boots, or the tool's exit
    where the image has no SYSTEM.CNF or its BOOT line names no release's."""
    if "/SYSTEM.CNF" not in disc.files:
        sys.exit(f"{disc.f.name} has no SYSTEM.CNF")
    release = release_of(disc)
    if release is None:
        sys.exit(f"{disc.f.name}: SYSTEM.CNF names none of the three releases' executables")
    return RELEASES[release]["exe"], RELEASES[release]["base"]


def packs(disc):
    out = []
    for theme in THEMES:
        out.append((theme, f"/{theme}/{theme}.PAK"))
        if theme == "HIRO":
            out.append((theme, "/HIRO/COPYCAT.PAK"))
        out.append((theme, f"/{theme}/{theme}FI.PAK"))
    return [(t, p) for t, p in out if p.upper() in disc.files]
