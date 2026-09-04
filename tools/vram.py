"""PS1 video memory: load TIM records into it, read texels back through a CLUT.

Metal Slug X ships its artwork as TIM records carrying their own VRAM
destination, so a mission's art is reconstructed by replaying those uploads
into a 1024x512 halfword framebuffer — the same state the GPU draws from.
"""
import struct

VRAM_W, VRAM_H = 1024, 512


def tim_records(data):
    """Walk a file as a chain of TIM records.

    The magic word is present only on some records; the rest start straight at
    the flag word, so records are validated by their block lengths instead.
    """
    out = []
    p = 0
    while p < len(data) - 16:
        q = p
        if data[q:q + 4] == b"\x10\x00\x00\x00":
            q += 4
        if q + 4 > len(data):
            break
        flag = struct.unpack_from("<I", data, q)[0]
        if flag & 7 not in (0, 1, 2) or flag & ~0xF:
            p += 2
            continue
        mode = flag & 7
        q += 4
        clut = None
        if (flag >> 3) & 1:
            if q + 12 > len(data):
                break
            bnum, cx, cy, cw, ch = struct.unpack_from("<IHHHH", data, q)
            if bnum < 12 or q + bnum > len(data) or 12 + cw * ch * 2 != bnum or not (cw and ch):
                p += 2
                continue
            clut = (cx, cy, cw, ch, data[q + 12:q + bnum])
            q += bnum
        if q + 12 > len(data):
            break
        bnum, ix, iy, iw, ih = struct.unpack_from("<IHHHH", data, q)
        if bnum < 12 or q + bnum > len(data) or 12 + iw * ih * 2 != bnum or not (iw and ih):
            p += 2
            continue
        out.append(dict(start=p, end=q + bnum, mode=mode, clut=clut,
                        x=ix, y=iy, w=iw, h=ih, pixels=data[q + 12:q + bnum]))
        p = q + bnum
    return out


class Vram:
    def __init__(self):
        self.buf = bytearray(VRAM_W * VRAM_H * 2)
        self.written = bytearray(VRAM_W * VRAM_H)

    def copy(self):
        other = Vram()
        other.buf[:] = self.buf
        other.written[:] = self.written
        return other

    def blit(self, x, y, w, h, blob):
        for row in range(h):
            if y + row >= VRAM_H:
                break
            start = (y + row) * VRAM_W + x
            self.buf[start * 2:(start + w) * 2] = blob[row * w * 2:(row + 1) * w * 2]
            self.written[start:start + w] = b"\1" * w

    def blank(self, x, y, w, h):
        """True when nothing has uploaded to this rectangle yet."""
        for row in range(h):
            if y + row >= VRAM_H:
                break
            start = (y + row) * VRAM_W + x
            if any(self.written[start:start + w]):
                return False
        return True

    def upload(self, record):
        self.blit(record["x"], record["y"], record["w"], record["h"], record["pixels"])
        if record["clut"]:
            cx, cy, cw, ch, blob = record["clut"]
            self.blit(cx, cy, cw, ch, blob)

    def load(self, data):
        """Replay every TIM upload in `data`; returns the records applied."""
        rs = tim_records(data)
        for r in rs:
            self.upload(r)
        return rs

    def halfword(self, x, y):
        off = (y * VRAM_W + x) * 2
        return self.buf[off] | (self.buf[off + 1] << 8)

    def texel4(self, page_x, page_y, u, v):
        """4-bit palette index at (u, v) within the texture page at page_x/page_y."""
        hw = self.halfword(page_x + (u >> 2), page_y + v)
        return (hw >> ((u & 3) * 4)) & 0xF

    def clut_colour(self, clut_id, index):
        x = (clut_id & 0x3F) * 16
        y = clut_id >> 6
        if y >= VRAM_H:
            return 0
        return self.halfword(x + index, y)


def rgba(px):
    r = (px & 0x1F) << 3
    g = ((px >> 5) & 0x1F) << 3
    b = ((px >> 10) & 0x1F) << 3
    return (r | r >> 5, g | g >> 5, b | b >> 5, 0 if px == 0 else 255)
