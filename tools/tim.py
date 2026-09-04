"""Decode PS1 TIM images (the standard PlayStation texture format).

Metal Slug X stores its stage artwork as raw TIM texture pages at the head of
each mission file (X*.BIN) — 256x256 4-bit pages, each with a bank of palettes
(CLUTs) selected per tile at draw time. This module locates and decodes them.

TIM layout: magic 0x00000010, flag u32 (bits0-2 = pixel mode 0/1/2 = 4/8/16-bit,
bit3 = CLUT present). Optional CLUT block and the image block are each
`u32 byte_length, u16 x, u16 y, u16 w, u16 h` headers followed by their data.
CLUT entries and 16-bit pixels are RGB5551 (0x0000 = transparent).
"""
import struct

TIM_MAGIC = b"\x10\x00\x00\x00"


def rgb5551(px):
    r = (px & 0x1F) << 3
    g = ((px >> 5) & 0x1F) << 3
    b = ((px >> 10) & 0x1F) << 3
    a = 0 if px == 0 else 255
    return bytes((r | r >> 5, g | g >> 5, b | b >> 5, a))


def decode_tim(data, pos, clut_index=0):
    """Decode the TIM at `data[pos:]` using palette `clut_index`.

    Returns dict(end, width, height, rgba, ncluts, mode) or None if not a valid
    TIM at this offset.
    """
    if data[pos:pos + 4] != TIM_MAGIC:
        return None
    flag = struct.unpack_from("<I", data, pos + 4)[0]
    mode = flag & 7
    has_clut = (flag >> 3) & 1
    if mode not in (0, 1, 2):
        return None

    p = pos + 8
    cluts = []
    if has_clut:
        if p + 12 > len(data):
            return None
        bnum, cx, cy, cw, ch = struct.unpack_from("<IHHHH", data, p)
        if bnum < 12 or p + bnum > len(data):
            return None
        entries = struct.unpack_from(f"<{(bnum - 12) // 2}H", data, p + 12)
        per = 16 if mode == 0 else 256
        cluts = [entries[i:i + per] for i in range(0, len(entries), per)]
        p += bnum

    if p + 12 > len(data):
        return None
    bnum, ix, iy, iw, ih = struct.unpack_from("<IHHHH", data, p)
    if bnum < 12 or p + bnum > len(data) or iw == 0 or ih == 0 or ih > 1024:
        return None
    px_data = data[p + 12:p + bnum]
    end = p + bnum

    if mode == 2:                          # 16-bit direct colour
        width = iw
        rgba = bytearray()
        for i in range(0, len(px_data) - 1, 2):
            rgba += rgb5551(struct.unpack_from("<H", px_data, i)[0])
        h = len(rgba) // 4 // width if width else 0
        return dict(end=end, width=width, height=h, rgba=bytes(rgba[:width * h * 4]),
                    ncluts=0, mode=mode)

    # indexed: needs a CLUT
    if not cluts:
        return None
    pal = cluts[min(clut_index, len(cluts) - 1)]
    if mode == 0:                          # 4-bit
        width = iw * 4
        idxs = []
        for b in px_data:
            idxs.append(b & 0xF)
            idxs.append(b >> 4)
    else:                                  # 8-bit
        width = iw * 2
        idxs = list(px_data)
    h = ih
    rgba = bytearray()
    for idx in idxs:
        rgba += rgb5551(pal[idx]) if idx < len(pal) else b"\x00\x00\x00\x00"
    need = width * h * 4
    rgba = bytes(rgba[:need]) + b"\x00" * max(0, need - len(rgba))
    return dict(end=end, width=width, height=h, rgba=rgba, ncluts=len(cluts), mode=mode)


def find_tims(data, min_side=8):
    """Yield decoded TIMs found by scanning `data` for TIM magic headers."""
    pos = 0
    while pos < len(data) - 8:
        if (data[pos:pos + 4] == TIM_MAGIC
                and struct.unpack_from("<I", data, pos + 4)[0] & 7 in (0, 1, 2)):
            tim = decode_tim(data, pos)
            if tim and tim["width"] >= min_side and tim["height"] >= min_side:
                tim["offset"] = pos
                yield tim
                pos = tim["end"]
                continue
        pos += 2
