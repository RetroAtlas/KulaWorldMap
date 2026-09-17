#!/usr/bin/env python3
"""What the executable does to each thing every frame, read off its code.

    python3 tools/kula_motion.py

Prints every rate, amplitude and timing behind docs/motion.md with the address
it was read at. A number is either the immediate of one instruction or the
multiplier a short run of shifts and adds applies to a register, and each is
read by matching the instruction it lives in, so a build that lays the code
out differently stops this with a message rather than yielding a number that
looks like a reading. The disc is the NTSC-U release and the game runs its
loop once per vertical blank, so a rate per frame is a rate per sixtieth of a
second.
"""
import re
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import EXE, EXE_BASE, open_disc
from mips import decode

TURN = 4096          # the angle that is one full turn
BLOCK = 512          # units across a block
HZ = 60

# What has to be there for the numbers below to mean what the doc says: the
# frame loop's one wait is VSync(0), one vertical blank, and the words that
# would halve the rate or pick another view are never written, so they keep
# the zero the executable loads with.
CHECKS = [
    (0x800406b4, "jal 0x80065b68", "the frame loop waits once, at VSync"),
    (0x800406b8, "addu $a0, $zero, $zero", "and waits for one vertical blank"),
    (0x80040ad0, "lw $v0, 22316($v0)", "the half-rate word the loop reads is 0x800a572c"),
    (0x80039608, "lw $v0, 13264($v0)", "the view word the updates read is 0x800a33d0"),
]

# A number that is the immediate of one instruction: the pattern is the
# disassembly with {} where the immediate goes.
IMMEDIATES = [
    ("on a block", "angles a pickup starts at, drawn from", 0x80035934, "addiu $a0, $zero, {}"),
    ("on a block", "boost button's starting height, of 16", 0x80035958, "addiu $v0, $zero, {}"),
    ("on a block", "coin, key, sunglasses: turn per frame", 0x80039890, "addiu $a0, $v1, {}"),
    ("on a block", "coin, key, sunglasses: bob per frame", 0x800398b4, "addiu $v0, $v1, {}"),
    ("on a block", "coin, key, sunglasses: bob's centre, units", 0x80039904, "addiu $v1, $v1, {}"),
    ("on a block", "fruit: turn per frame", 0x8003974c, "addiu $a0, $v1, {}"),
    ("on a block", "fruit: tilt per frame", 0x80039770, "addiu $v1, $a1, {}"),
    ("on a block", "fruit: bob per frame", 0x80039794, "addiu $v0, $a1, {}"),
    ("on a block", "fruit: bob's centre, units", 0x800397e4, "addiu $v1, $v1, {}"),
    ("on a block", "gem: turn per frame", 0x80039964, "addiu $a1, $v0, {}"),
    ("on a block", "hourglass: swing per frame", 0x800399a0, "addiu $a0, $v1, {}"),
    ("on a block", "hourglass: turn per frame", 0x800399c4, "addiu $v1, $a1, {}"),
    ("on a block", "hourglass: swing's centre, angle", 0x80039a00, "addiu $v1, $v1, {}"),
    ("on a block", "pills and type 34: flip per frame", 0x80039a5c, "addiu $a0, $v1, {}"),
    ("on a block", "pills and type 34: turn per frame", 0x80039a80, "addiu $a1, $v1, {}"),
    ("on a block", "type 42: form angle per frame", 0x8003932c, "addiu $a0, $v1, {}"),
    ("on a block", "type 42: form changes past", 0x800393fc, "slti $v0, $v0, {}"),
    ("on a block", "type 42: orbit per frame, brown form", 0x8003935c, "addiu $a0, $v1, {}"),
    ("on a block", "type 42: orbit per frame, green form", 0x800393b4, "addiu $a0, $v1, {}"),
    ("on a block", "teleporter: turn per frame while on", 0x80039620, "addiu $a0, $v1, {}"),
    ("on a block", "exit: turn per frame while open", 0x800396b0, "addiu $a0, $v1, {}"),
    ("on a block", "exit: turn per frame while shut", 0x800396cc, "addiu $a0, $v1, {}"),
    ("on a block", "placeholder arrows: turn per frame", 0x80039af8, "addiu $a1, $v0, {}"),
    ("on a block", "boost button: sinks per frame near the ball", 0x80039c10, "addiu $v0, $v1, {}"),
    ("on a block", "boost button: rises per frame after", 0x80039c7c, "addiu $v0, $v1, {}"),
    ("on a block", "boost button: full height", 0x80039c74, "slti $v0, $v0, {}"),

    ("moving spikes", "phase: down, if phase times step is under", 0x8002a120, "slti $v0, $v1, {}"),
    ("moving spikes", "phase: held up, if under", 0x8002a148, "slti $v0, $v1, {}"),
    ("moving spikes", "phase: retracting, if under", 0x8002a160, "slti $v0, $v1, {}"),
    ("moving spikes", "phase: down for this many frames less the phase", 0x8002a134, "addiu $v0, $zero, {}"),
    ("moving spikes", "phase: held for this many less the phase", 0x8002a15c, "addiu $v0, $zero, {}"),
    ("moving spikes", "phase: retracting this many less the phase", 0x8002a170, "addiu $v0, $zero, {}"),
    ("moving spikes", "down, frames", 0x8002be6c, "addiu $s0, $zero, {}"),
    ("moving spikes", "rising, frames", 0x8002bc6c, "addiu $s0, $zero, {}"),
    ("moving spikes", "rattling, frames", 0x8002bd00, "addiu $s0, $zero, {}"),
    ("moving spikes", "held up, frames", 0x8002bd58, "addiu $s0, $zero, {}"),
    ("moving spikes", "retracting, frames", 0x8002bd70, "addiu $s0, $zero, {}"),
    ("moving spikes", "retracting: harmless once this many remain", 0x8002be54, "addiu $v0, $zero, {}"),

    ("vanishing block", "phase: starts absent if under", 0x80028bd0, "slti $v0, $a1, {}"),
    ("vanishing block", "phase: absent for this many frames less the phase", 0x80028c1c, "addiu $v0, $zero, {}"),
    ("vanishing block", "phase: solid for this many less the phase", 0x80028cb8, "addiu $v0, $zero, {}"),
    ("vanishing block", "absent, frames", 0x8002bb78, "addiu $a2, $zero, {}"),
    ("vanishing block", "fading in, frames", 0x8002b7fc, "addiu $a2, $zero, {}"),
    ("vanishing block", "settling, frames", 0x8002b900, "addiu $a2, $zero, {}"),
    ("vanishing block", "solid, frames", 0x8002b9c0, "addiu $a2, $zero, {}"),
    ("vanishing block", "dimming, frames", 0x8002b9d4, "addiu $a2, $zero, {}"),
    ("vanishing block", "flashing out, frames", 0x8002bad4, "addiu $a2, $zero, {}"),

    ("crumbling block", "size at load, units", 0x80028ab8, "addiu $a3, $zero, {}"),
    ("crumbling block", "shrinks per frame once broken, units", 0x8002b5b8, "addiu $v0, $v0, {}"),

    ("moving platform", "waits at each end, frames", 0x80032e7c, "addiu $v1, $zero, {}"),

    ("captivators", "corkscrew: phase 2 starts at, angle", 0x8003b86c, "addiu $v0, $zero, {}"),
    ("captivators", "corkscrew: phase 1 starts at, angle", 0x8003b8b8, "addiu $v1, $zero, {}"),
    ("captivators", "corkscrew: phase 0 starts at, angle", 0x8003b904, "addiu $v1, $zero, {}"),
    ("captivators", "corkscrew: bounce angle per frame", 0x8003c274, "addiu $v0, $v0, {}"),
    ("captivators", "corkscrew: bounce angle wraps at", 0x8003c28c, "slti $v0, $v0, {}"),
    ("captivators", "fast star: sway angle per frame", 0x8003c15c, "addiu $a0, $t0, {}"),
    ("captivators", "fast star: tumble per frame, first axis", 0x8003f2fc, "addiu $v1, $a0, {}"),
    ("captivators", "fast star: tumble per frame, second axis", 0x8003f330, "addiu $v1, $a0, {}"),
    ("captivators", "slow star: tumble per frame, first axis", 0x8003d730, "addiu $v1, $a0, {}"),
    ("captivators", "slow star: tumble per frame, second axis", 0x8003d764, "addiu $v1, $a0, {}"),
    ("captivators", "slow star: tumble per frame, third axis", 0x8003d798, "addiu $v1, $a0, {}"),
    ("captivators", "wandering ball: tumble per frame, first axis", 0x8003ddb4, "addiu $v1, $a0, {}"),
    ("captivators", "wandering ball: tumble per frame, second axis", 0x8003dde8, "addiu $v1, $a0, {}"),
    ("captivators", "wandering ball: tumble per frame, third axis", 0x8003de1c, "addiu $v1, $a0, {}"),
    ("captivators", "wandering ball: shakes for this many frames", 0x8003cb14, "slti $v0, $v0, {}"),
    ("captivators", "wandering ball: lurch's centre, units", 0x8003c9cc, "addiu $v0, $v0, {}"),
    ("captivators", "wandering ball: settles a block on, units past", 0x8003c574, "slti $v0, $v0, {}"),
    ("captivators", "wandering ball: ways drawn from", 0x8003c730, "addiu $a0, $zero, {}"),
    ("captivators", "wheel: roll per frame", 0x8003ebc0, "addiu $v0, $v0, {}"),
    ("captivators", "wheel: a turn takes, frames", 0x8003cd78, "slti $v0, $v0, {}"),
    ("captivators", "wheel: turns per frame, one way", 0x8003cda0, "addiu $v0, $v0, {}"),
    ("captivators", "wheel: turns per frame, the other", 0x8003ce30, "addiu $v0, $v0, {}"),
    ("captivators", "wheel: turns per frame, about", 0x8003cec0, "addiu $v0, $v0, {}"),
]

# A number that is the multiplier a run of shifts and adds applies to what a
# register held on entry: the run starts at the address and is this many
# instructions long, and the product is read from the last register named.
MULTIPLIERS = [
    ("on a block", "coin, key, sunglasses: bob's reach, units", 0x800398e0, 3, "v0", "v1"),
    ("on a block", "fruit: bob's reach, units", 0x800397c0, 3, "v0", "v1"),
    ("on a block", "fruit: tilt's reach, angle", 0x80039810, 5, "v0", "v1"),
    ("on a block", "type 42: orbit's radius, units", 0x800394f0, 5, "v0", "v1"),
    ("moving spikes", "phase: frames per step", 0x8002a110, 4, "v1", "v1"),
    ("vanishing block", "phase: frames per step", 0x80028c10, 3, "a1", "v1"),
    ("moving platform", "speed on the disc is scaled by this over sixty", 0x80032a60, 5, "v1", "v0"),
    ("captivators", "stand this far off the block's centre, units", 0x8003b720, 5, "a0", "v0"),
    ("captivators", "slow star: travels per frame, units", 0x8003bcbc, 4, "v1", "v0"),
    ("captivators", "wheel: rolls per frame, units", 0x8003bf10, 6, "v0", "v1"),
    ("captivators", "fast star: sways this far either way, units", 0x8003c008, 5, "v1", "v1"),
    ("captivators", "corkscrew: rises this far, units", 0x8003c3a0, 5, "a0", "v1"),
    ("captivators", "corkscrew: spins this much times the cosine per frame", 0x8003e474, 5, "v0", "a2"),
    ("captivators", "wandering ball: lurch's reach, units", 0x8003c98c, 2, "v0", "v1"),
    ("captivators", "wandering ball: dashes per frame, units", 0x8003cc40, 6, "v1", "v0"),
]


class Code:
    def __init__(self, blob):
        self.blob = blob

    def word(self, addr):
        return struct.unpack_from("<I", self.blob, addr - EXE_BASE)[0]

    def text(self, addr):
        return decode(self.word(addr), addr)[0]

    def immediate(self, addr, pattern):
        text = self.text(addr)
        rx = "^" + re.escape(pattern).replace(r"\{\}", r"(-?(?:0x)?[0-9a-f]+)") + "$"
        m = re.match(rx, text)
        if not m:
            sys.exit(f"0x{addr:08x} reads `{text}`, not `{pattern}`")
        return int(m.group(1), 0) if m.lastindex else None

    def multiplier(self, addr, count, src, dst):
        """The factor applied to `src` by `count` instructions of shifts and adds."""
        coef = {src: 1}
        for i in range(count):
            pc = addr + 4 * i
            text = self.text(pc)
            m = re.match(r"(sll|addu|subu) \$(\w+), \$(\w+)(?:, \$(\w+)|, (\d+))$", text)
            if m:
                op, rd, a, b, sa = m.groups()
                x = coef.get(a, 0)
                if op == "sll":
                    y = x << int(sa)
                else:
                    y = x + coef.get(b, 0) if op == "addu" else x - coef.get(b, 0)
                if x is None or (b and coef.get(b, 0) is None):
                    y = None
                coef[rd] = y
            else:
                m = re.match(r"\w+ \$(\w+)", text)
                if m and m.group(1) in coef:
                    coef[m.group(1)] = None      # overwritten by something not a shift or add
        if coef.get(dst) is None:
            sys.exit(f"0x{addr:08x}: {dst} is not a multiple of {src} after {count} instructions")
        return coef[dst]


def main():
    disc = open_disc(sys.argv[1] if len(sys.argv) > 1 else None)
    code = Code(disc.read_file(EXE))
    rows = []
    for addr, pattern, what in CHECKS:
        code.immediate(addr, pattern)
        print(f"  0x{addr:08x}  {what}")
    for group, what, addr, pattern in IMMEDIATES:
        rows.append((group, what, addr, code.immediate(addr, pattern)))
    reach = (code.immediate(0x80039bbc, "lui $v1, {}") << 16) + code.immediate(0x80039bc0, "ori $v1, $v1, {}")
    rows.append(("on a block", "boost button: sinks while the ball is within, units", 0x80039bbc, round(reach ** 0.5)))
    for group, what, addr, count, src, dst in MULTIPLIERS:
        rows.append((group, what, addr, code.multiplier(addr, count, src, dst)))
    order = {g: i for i, g in enumerate(dict.fromkeys(r[0] for r in rows))}
    rows.sort(key=lambda r: (order[r[0]], r[2]))
    last = None
    for group, what, addr, value in rows:
        if group != last:
            print(f"\n{group}")
            last = group
        print(f"  0x{addr:08x}  {value:>6}  {what}")
    print(f"\nangles are in {TURN}ths of a turn, units are {BLOCK} to a block, a frame is 1/{HZ} s")


if __name__ == "__main__":
    main()
