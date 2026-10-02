"""Read a raw PS1 disc image (.bin) as an ISO9660 filesystem, each file keyed by
its full path."""
import struct

SECTOR_RAW = 2352
USER_OFF = 24       # Mode 2 Form 1 user data within the raw sector


class Disc:
    def __init__(self, path):
        self.f = open(path, "rb")
        pvd = self.sector(16)
        if pvd[1:6] != b"CD001":
            raise ValueError(f"{path} is not a raw ISO9660 image")
        root = pvd[156:156 + 34]
        self.files = {}   # /PATH/NAME -> (lba, size)
        self._read_dir(struct.unpack_from("<I", root, 2)[0],
                       struct.unpack_from("<I", root, 10)[0], "")

    def close(self):
        self.f.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def sector(self, lba):
        self.f.seek(lba * SECTOR_RAW)
        return self.f.read(SECTOR_RAW)[USER_OFF:USER_OFF + 2048]

    def read(self, lba, size):
        out = bytearray()
        while len(out) < size:
            sec = self.sector(lba)
            if not sec:
                raise EOFError(f"read past end of image at LBA {lba}")
            out += sec
            lba += 1
        return bytes(out[:size])

    def read_file(self, path):
        lba, size = self.files[path.upper()]
        return self.read(lba, size)

    def _read_dir(self, lba, size, prefix):
        data = self.read(lba, size)
        pos = 0
        while pos < len(data):
            ln = data[pos]
            if ln == 0:
                pos = (pos // 2048 + 1) * 2048
                if pos >= len(data):
                    break
                continue
            e_lba = struct.unpack_from("<I", data, pos + 2)[0]
            e_size = struct.unpack_from("<I", data, pos + 10)[0]
            flags = data[pos + 25]
            name_len = data[pos + 32]
            name = data[pos + 33:pos + 33 + name_len].decode("ascii", "replace")
            if name not in ("\x00", "\x01"):
                name = name.split(";")[0].upper()
                if flags & 2:
                    self._read_dir(e_lba, e_size, f"{prefix}/{name}")
                else:
                    self.files[f"{prefix}/{name}"] = (e_lba, e_size)
            pos += ln
