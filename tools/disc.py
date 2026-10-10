"""Read a raw PS1 disc image (.bin) as an ISO9660 filesystem, each file keyed by
its full path, and build the directory records a writer rewrites."""
import struct

SECTOR_RAW = 2352
USER_OFF = 24       # Mode 2 Form 1 user data within the raw sector
USER = 2048
EXTENT = 2          # a directory record's extent, little-endian here and big-endian four bytes on
SIZE = 10           # its size, laid out the same way
FLAGS = 25
NAME_LEN = 32
NAME = 33
DIRECTORY = 2       # the flag bit of a record that names a directory


def both_ways(value):
    """A number as a directory record stores it: little-endian, then big-endian."""
    return struct.pack("<I", value) + struct.pack(">I", value)


def set_record(data, pos, extent, size):
    """Rewrite the extent and the size of the directory record at pos, in both byte orders."""
    data[pos + EXTENT:pos + EXTENT + 8] = both_ways(extent)
    data[pos + SIZE:pos + SIZE + 8] = both_ways(size)


def record(name, extent, size, flags=0):
    """A directory record naming a file or a directory, padded to an even length."""
    ident = name if isinstance(name, bytes) else name.encode("ascii")
    length = NAME + len(ident)
    length += length % 2
    out = bytearray(length)
    out[0] = length
    set_record(out, 0, extent, size)
    out[FLAGS] = flags
    out[28:32] = struct.pack("<H", 1) + struct.pack(">H", 1)
    out[NAME_LEN] = len(ident)
    out[NAME:NAME + len(ident)] = ident
    return bytes(out)


class Disc:
    def __init__(self, path):
        self.f = open(path, "rb")
        try:
            pvd = self.sector(16)
            if pvd[1:6] != b"CD001":
                raise ValueError("not a raw ISO9660 image")
            root = pvd[156:156 + 34]
            self.files = {}   # /PATH/NAME -> (lba, size)
            self.records = {}  # /PATH/NAME -> (sector, offset) of the file's directory record
            self._walked = set()
            self._read_dir(struct.unpack_from("<I", root, EXTENT)[0],
                           struct.unpack_from("<I", root, SIZE)[0], "")
        except Exception:
            self.f.close()
            raise

    def close(self):
        self.f.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def sector(self, lba):
        self.f.seek(lba * SECTOR_RAW)
        raw = self.f.read(SECTOR_RAW)
        if len(raw) < SECTOR_RAW:
            raise ValueError(f"the image ends before sector {lba}")
        return raw[USER_OFF:USER_OFF + USER]

    def read(self, lba, size):
        out = bytearray()
        while len(out) < size:
            out += self.sector(lba)
            lba += 1
        return bytes(out[:size])

    def read_file(self, path):
        lba, size = self.files[path.upper()]
        return self.read(lba, size)

    def _read_dir(self, lba, size, prefix):
        if lba in self._walked:
            raise ValueError(f"the directory at sector {lba} is reached twice")
        self._walked.add(lba)
        data = self.read(lba, size)
        pos = 0
        while pos < len(data):
            ln = data[pos]
            if ln == 0:
                pos = (pos // USER + 1) * USER
                if pos >= len(data):
                    break
                continue
            e_lba = struct.unpack_from("<I", data, pos + EXTENT)[0]
            e_size = struct.unpack_from("<I", data, pos + SIZE)[0]
            flags = data[pos + FLAGS]
            name_len = data[pos + NAME_LEN]
            name = data[pos + NAME:pos + NAME + name_len].decode("ascii", "replace")
            if name not in ("\x00", "\x01"):
                name = name.split(";")[0].upper()
                if flags & DIRECTORY:
                    self._read_dir(e_lba, e_size, f"{prefix}/{name}")
                else:
                    self.files[f"{prefix}/{name}"] = (e_lba, e_size)
                    self.records[f"{prefix}/{name}"] = (lba + pos // USER, pos % USER)
            pos += ln
