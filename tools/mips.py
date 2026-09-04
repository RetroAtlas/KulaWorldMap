#!/usr/bin/env python3
"""Disassemble Metal Slug X's MIPS code: the executable, or a section overlay.

    python3 tools/mips.py --file SLUS_012.12 --at 0x800436e8 --count 40
    python3 tools/mips.py --file X61_000.BIN --base 0x80130000 --at 0x80130000

The executable is a PS-EXE whose text sits at 0x80010000; an overlay carries no
header, so its load address is recovered from where its own `jal`s point and
passed with --base. --disc defaults to $METAL_SLUG_DISC_X.
"""
import argparse
import os
import struct
import sys
from pathlib import Path

REG = ["zero", "at", "v0", "v1", "a0", "a1", "a2", "a3",
       "t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7",
       "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7",
       "t8", "t9", "k0", "k1", "gp", "sp", "fp", "ra"]

SPECIAL = {0x00: "sll", 0x02: "srl", 0x03: "sra", 0x04: "sllv", 0x06: "srlv", 0x07: "srav",
           0x08: "jr", 0x09: "jalr", 0x0c: "syscall", 0x0d: "break",
           0x10: "mfhi", 0x11: "mthi", 0x12: "mflo", 0x13: "mtlo",
           0x18: "mult", 0x19: "multu", 0x1a: "div", 0x1b: "divu",
           0x20: "add", 0x21: "addu", 0x22: "sub", 0x23: "subu",
           0x24: "and", 0x25: "or", 0x26: "xor", 0x27: "nor",
           0x2a: "slt", 0x2b: "sltu"}

OPS = {0x02: "j", 0x03: "jal", 0x04: "beq", 0x05: "bne", 0x06: "blez", 0x07: "bgtz",
       0x08: "addi", 0x09: "addiu", 0x0a: "slti", 0x0b: "sltiu", 0x0c: "andi",
       0x0d: "ori", 0x0e: "xori", 0x0f: "lui",
       0x20: "lb", 0x21: "lh", 0x22: "lwl", 0x23: "lw", 0x24: "lbu", 0x25: "lhu",
       0x26: "lwr", 0x28: "sb", 0x29: "sh", 0x2a: "swl", 0x2b: "sw", 0x2e: "swr"}

LOADS = {"lb", "lh", "lwl", "lw", "lbu", "lhu", "lwr", "sb", "sh", "swl", "sw", "swr"}


def decode(word, pc):
    op = word >> 26
    rs, rt, rd = (word >> 21) & 31, (word >> 16) & 31, (word >> 11) & 31
    sa, funct = (word >> 6) & 31, word & 63
    imm = word & 0xFFFF
    simm = imm - 0x10000 if imm & 0x8000 else imm
    R = lambda n: f"${REG[n]}"

    if word == 0:
        return "nop", None
    if op == 0:
        name = SPECIAL.get(funct)
        if not name:
            return f".word 0x{word:08x}", None
        if name in ("sll", "srl", "sra"):
            return f"{name} {R(rd)}, {R(rt)}, {sa}", None
        if name == "jr":
            return f"jr {R(rs)}", None
        if name == "jalr":
            return f"jalr {R(rd)}, {R(rs)}", None
        if name in ("mfhi", "mflo"):
            return f"{name} {R(rd)}", None
        if name in ("mthi", "mtlo"):
            return f"{name} {R(rs)}", None
        if name in ("mult", "multu", "div", "divu"):
            return f"{name} {R(rs)}, {R(rt)}", None
        return f"{name} {R(rd)}, {R(rs)}, {R(rt)}", None
    if op == 1:
        name = {0: "bltz", 1: "bgez", 16: "bltzal", 17: "bgezal"}.get(rt, f"regimm{rt}")
        t = pc + 4 + simm * 4
        return f"{name} {R(rs)}, 0x{t:08x}", t
    name = OPS.get(op)
    if not name:
        return f".word 0x{word:08x}", None
    if name in ("j", "jal"):
        t = (pc & 0xF0000000) | ((word & 0x3FFFFFF) << 2)
        return f"{name} 0x{t:08x}", t
    if name in ("beq", "bne"):
        t = pc + 4 + simm * 4
        return f"{name} {R(rs)}, {R(rt)}, 0x{t:08x}", t
    if name in ("blez", "bgtz"):
        t = pc + 4 + simm * 4
        return f"{name} {R(rs)}, 0x{t:08x}", t
    if name == "lui":
        return f"lui {R(rt)}, 0x{imm:04x}", None
    if name in LOADS:
        return f"{name} {R(rt)}, {simm}({R(rs)})", None
    return f"{name} {R(rt)}, {R(rs)}, {simm}", None


def listing(blob, base, start, count, mark=()):
    """Disassemble `count` instructions from RAM address `start`."""
    out = []
    for i in range(count):
        pc = start + i * 4
        p = pc - base
        if p < 0 or p + 4 > len(blob):
            break
        word = struct.unpack_from("<I", blob, p)[0]
        text, target = decode(word, pc)
        flag = " <--" if pc in mark else ""
        out.append(f"  0x{pc:08x}  {word:08x}  {text}{flag}")
    return "\n".join(out)


EXE = "SLUS_012.12"
EXE_BASE = 0x80010000 - 0x800   # the PS-EXE header occupies the first 0x800 bytes


def main():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from disc import Disc

    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=os.environ.get("METAL_SLUG_DISC_X"),
                    help="raw PS1 disc image; defaults to $METAL_SLUG_DISC_X")
    ap.add_argument("--file", default=EXE, help="file on the disc to disassemble")
    ap.add_argument("--base", type=lambda v: int(v, 0), default=None,
                    help="load address of the file (default: the executable's)")
    ap.add_argument("--at", type=lambda v: int(v, 0), required=True, help="address to start at")
    ap.add_argument("--count", type=int, default=32, help="instructions to print")
    args = ap.parse_args()
    if not args.disc:
        ap.error("no disc image: pass --disc or set $METAL_SLUG_DISC_X")

    disc = Disc(args.disc)
    name = args.file.upper()
    blob = disc.read_file(name)
    base = args.base if args.base is not None else (EXE_BASE if name == EXE else 0)
    print(listing(blob, base, args.at, args.count))


if __name__ == "__main__":
    main()
