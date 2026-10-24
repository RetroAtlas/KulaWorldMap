"""The .PAK container: a named, zlib-compressed level per record.

    u32  count
    count x (u32 offset, u32 size)     the compressed records
    count x u32                        offsets into the name table
    ...                                ASCII names, each ending in a newline before its NUL
    1 to 4 bytes                       padding to a four-byte boundary
    ...                                the records themselves, back to back in slot order

Names are the game's own names, spelling included ("LECEL 94" in Atlantis), and
the game never reads them. The file ends where the last record ends.
"""
import struct
import zlib

ALIGN = 4
NAME_END = b"\n\0"


class Pak:
    def __init__(self, blob, path=""):
        self.path = path
        self.size = len(blob)
        count = struct.unpack_from("<I", blob, 0)[0]
        recs = [struct.unpack_from("<II", blob, 4 + i * 8) for i in range(count)]
        name_off = [struct.unpack_from("<I", blob, 4 + count * 8 + i * 4)[0]
                    for i in range(count)]
        self.entries = []
        for (off, size), no in zip(recs, name_off):
            end = blob.index(b"\0", no)
            name = blob[no:end].decode("ascii", "replace").strip()
            self.entries.append({"name": name, "offset": off, "size": size,
                                 "blob": blob[off:off + size]})

    def __len__(self):
        return len(self.entries)

    def level(self, i):
        return zlib.decompress(self.entries[i]["blob"])

    def name(self, i):
        return self.entries[i]["name"]

    def names(self):
        return [e["name"] for e in self.entries]

    def streams(self):
        return [e["blob"] for e in self.entries]


def pack(names, streams):
    """The container holding these records under these names, laid out as the disc has it."""
    count = len(names)
    text = b"".join(n.encode("ascii") + NAME_END for n in names)
    table = 4 + count * 12
    pad = ALIGN - (table + len(text)) % ALIGN
    out = bytearray(struct.pack("<I", count))
    at = table + len(text) + pad
    for s in streams:
        out += struct.pack("<II", at, len(s))
        at += len(s)
    at = table
    for n in names:
        out += struct.pack("<I", at)
        at += len(n) + len(NAME_END)
    out += text + bytes(pad)
    for s in streams:
        out += s
    return bytes(out)
