#!/usr/bin/env python3
"""Disassemble the game's MIPS code, and run a routine of it to its return.

    python3 tools/mips.py --at 0x80033f6c --count 60

The executable is a PS-EXE whose text sits at 0x80010000. A file that carries
no such header is loaded wherever its own `jal`s point, which --base says.
--disc defaults to $KULA_DISC.
"""
import argparse
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

# The geometry coprocessor: its data and control registers, the four moves
# between them and the CPU's, and its commands by their low six bits.
GTE_DATA = ["vxy0", "vz0", "vxy1", "vz1", "vxy2", "vz2", "rgbc", "otz",
            "ir0", "ir1", "ir2", "ir3", "sxy0", "sxy1", "sxy2", "sxyp",
            "sz0", "sz1", "sz2", "sz3", "rgb0", "rgb1", "rgb2", "res1",
            "mac0", "mac1", "mac2", "mac3", "irgb", "orgb", "lzcs", "lzcr"]
GTE_CONTROL = ["rt11rt12", "rt13rt21", "rt22rt23", "rt31rt32", "rt33", "trx", "try", "trz",
               "l11l12", "l13l21", "l22l23", "l31l32", "l33", "rbk", "gbk", "bbk",
               "lr1lr2", "lr3lg1", "lg2lg3", "lb1lb2", "lb3", "rfc", "gfc", "bfc",
               "ofx", "ofy", "h", "dqa", "dqb", "zsf3", "zsf4", "flag"]
GTE_MOVES = {0: ("mfc2", GTE_DATA), 2: ("cfc2", GTE_CONTROL),
             4: ("mtc2", GTE_DATA), 6: ("ctc2", GTE_CONTROL)}
GTE_COMMANDS = {0x01: "rtps", 0x06: "nclip", 0x0c: "op", 0x10: "dpcs", 0x11: "intpl",
                0x12: "mvmva", 0x13: "ncds", 0x14: "cdp", 0x16: "ncdt", 0x1b: "nccs",
                0x1c: "cc", 0x1e: "ncs", 0x20: "nct", 0x28: "sqr", 0x29: "dcpl",
                0x2a: "dpct", 0x2d: "avsz3", 0x2e: "avsz4", 0x30: "rtpt", 0x3d: "gpf",
                0x3e: "gpl", 0x3f: "ncct"}


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
    if op == 0x12:
        if word & 0x02000000:
            return GTE_COMMANDS.get(funct, f".word 0x{word:08x}"), None
        if rs not in GTE_MOVES:
            return f".word 0x{word:08x}", None
        name, regs = GTE_MOVES[rs]
        return f"{name} {R(rt)}, {regs[rd]}", None
    if op in (0x32, 0x3a):
        return f"{'lwc2' if op == 0x32 else 'swc2'} {GTE_DATA[rt]}, {simm}({R(rs)})", None
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


class Machine:
    """Enough of a MIPS to run a routine of the game's to its return, from
    the arguments and the words on the stack it is given. A call it makes is
    answered by `calls`, by the address called, from the four arguments and
    four stack words the call is made with; a word it loads that it has not
    stored is the executable's. It stops on anything else it meets."""

    def __init__(self, code):
        self.code = code

    def run(self, pc, args, stack, calls=None):
        R = [0] * 32
        R[4:4 + len(args)] = args
        sp = 0x801ff000
        R[29], R[31] = sp, 0
        mem = {}

        def ld(a, n):
            a = ram(a)
            if n == 4 and a not in mem and self.code.holds(a):
                return self.code.word(a)
            return sum(mem.get(a + b, 0) << (8 * b) for b in range(n))

        def st(a, v, n):
            a = ram(a)
            for b in range(n):
                mem[a + b] = (v >> (8 * b)) & 255

        for i, w in enumerate(stack):
            st(sp + 16 + 4 * i, w, 4)

        def step(pc):
            w = self.code.word(pc)
            op, rs, rt, rd = w >> 26, (w >> 21) & 31, (w >> 16) & 31, (w >> 11) & 31
            sa, fn, imm = (w >> 6) & 31, w & 63, w & 0xFFFF
            simm = imm - 0x10000 if imm & 0x8000 else imm
            target = None
            if w == 0:
                pass
            elif op == 0 and fn == 0:
                R[rd] = (R[rt] << sa) & 0xFFFFFFFF
            elif op == 0 and fn == 2:
                R[rd] = R[rt] >> sa
            elif op == 0 and fn == 3:
                R[rd] = (signed(R[rt]) >> sa) & 0xFFFFFFFF
            elif op == 0 and fn == 8:
                target = R[rs]
            elif op == 0 and fn in (0x20, 0x21):
                R[rd] = (R[rs] + R[rt]) & 0xFFFFFFFF
            elif op == 0 and fn in (0x22, 0x23):
                R[rd] = (R[rs] - R[rt]) & 0xFFFFFFFF
            elif op == 0 and fn == 0x25:
                R[rd] = R[rs] | R[rt]
            elif op == 0 and fn == 0x2a:
                R[rd] = int(signed(R[rs]) < signed(R[rt]))
            elif op == 2:
                target = (pc & 0xF0000000) | ((w & 0x3FFFFFF) << 2)
            elif op == 3:
                return ("call", (pc & 0xF0000000) | ((w & 0x3FFFFFF) << 2))
            elif op == 4:
                target = pc + 4 + simm * 4 if R[rs] == R[rt] else None
            elif op == 5:
                target = pc + 4 + simm * 4 if R[rs] != R[rt] else None
            elif op in (8, 9):
                R[rt] = (R[rs] + simm) & 0xFFFFFFFF
            elif op == 0xa:
                R[rt] = int(signed(R[rs]) < simm)
            elif op == 0xb:
                R[rt] = int(R[rs] < (simm & 0xFFFFFFFF))
            elif op == 0xf:
                R[rt] = imm << 16
            elif op == 0x23:
                R[rt] = ld((R[rs] + simm) & 0xFFFFFFFF, 4)
            elif op == 0x24:
                R[rt] = ld((R[rs] + simm) & 0xFFFFFFFF, 1)
            elif op == 0x2b:
                st((R[rs] + simm) & 0xFFFFFFFF, R[rt], 4)
            elif op == 0x28:
                st((R[rs] + simm) & 0xFFFFFFFF, R[rt], 1)
            else:
                sys.exit(f"0x{pc:08x} reads `{self.code.text(pc)}`, which the routine was not expected to hold")
            R[0] = 0
            return target

        for _ in range(10000):
            target = step(pc)
            if isinstance(target, tuple):
                step(pc + 4)
                answer = (calls or {}).get(target[1])
                if answer is None:
                    sys.exit(f"0x{pc:08x} calls 0x{target[1]:08x}, which nothing answers")
                words = [signed(ld(R[29] + 16 + 4 * i, 4)) for i in range(4)]
                R[2] = answer([signed(v) for v in R[4:8]], words) & 0xFFFFFFFF
                pc += 8
            elif target is not None:
                step(pc + 4)
                if target == 0:
                    return mem
                pc = ram(target)
            else:
                pc += 4
        sys.exit(f"the routine at 0x{pc:08x} does not return")


def ram(a):
    """An address as the one it mirrors in RAM, where the unmapped mirror
    names it without the top bit."""
    return ((a & 0x1FFFFFFF) | 0x80000000) if (a & 0x1FFFFFFF) < 0x00800000 else a


def signed(v):
    return v - 0x100000000 if v & 0x80000000 else v


def main():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from kula_disc import EXE, EXE_BASE, open_disc

    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=None, help="raw PS1 image; defaults to $KULA_DISC")
    ap.add_argument("--file", default=EXE, help="file on the disc to disassemble")
    ap.add_argument("--base", type=lambda v: int(v, 0), default=None,
                    help="load address of the file (default: the executable's)")
    ap.add_argument("--at", type=lambda v: int(v, 0), required=True, help="address to start at")
    ap.add_argument("--count", type=int, default=32, help="instructions to print")
    args = ap.parse_args()

    disc = open_disc(args.disc)
    name = args.file.upper()
    blob = disc.read_file(name)
    base = args.base if args.base is not None else (EXE_BASE if name == EXE.upper() else 0)
    print(listing(blob, base, args.at, args.count))


if __name__ == "__main__":
    main()
