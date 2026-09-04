"""The .PAK container: a named, zlib-compressed level per record.

    u32  count
    count x (u32 offset, u32 size)     the compressed records
    count x u32                        offsets into the name table
    ...                                NUL-terminated ASCII names
    ...                                the records themselves

Names are the game's own, spelling included ("LECEL 94" in Atlantis).
"""
import struct
import zlib


class Pak:
    def __init__(self, blob, path=""):
        self.path = path
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
