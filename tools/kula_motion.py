#!/usr/bin/env python3
"""What the executable does to each thing every frame, read off its code.

    python3 tools/kula_motion.py            # every reading, with its address
    python3 tools/kula_motion.py --table    # the table the build ships

Every rate, amplitude and timing behind docs/motion.md is either the immediate
of one instruction or the multiplier a short run of shifts and adds applies to
a register, and each is read by matching the instruction it lives in, so a
build that lays the code out differently stops this with a message rather
than yielding a number that looks like a reading. The disc is the NTSC-U
release and the game runs its loop once per vertical blank, so a rate per
frame is a rate per sixtieth of a second.

The table is what public/objects.json carries under "motion": the rates by
type and by kind of block, and for the two things that run a cycle of states,
the moving spikes and the vanishing block, the cycle itself as a frame
program per phase, simulated from their routines exactly as read.
"""
import argparse
import json
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
PHASES = 4           # the values a phase field takes
SPIKE_FRAMES = 32    # frames in the moving spikes' mesh, flat to full

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
    ("on a block", "start.range", "angles a pickup starts at, drawn from", 0x80035934, "addiu $a0, $zero, {}"),
    ("on a block", "button.start", "boost button's starting height, of 16", 0x80035958, "addiu $v0, $zero, {}"),
    ("on a block", "coin.turn", "coin, key, sunglasses: turn per frame", 0x80039890, "addiu $a0, $v1, {}"),
    ("on a block", "coin.bob", "coin, key, sunglasses: bob per frame", 0x800398b4, "addiu $v0, $v1, {}"),
    ("on a block", "coin.bob.centre", "coin, key, sunglasses: bob's centre, units", 0x80039904, "addiu $v1, $v1, {}"),
    ("on a block", "fruit.turn", "fruit: turn per frame", 0x8003974c, "addiu $a0, $v1, {}"),
    ("on a block", "fruit.tilt", "fruit: tilt per frame", 0x80039770, "addiu $v1, $a1, {}"),
    ("on a block", "fruit.bob", "fruit: bob per frame", 0x80039794, "addiu $v0, $a1, {}"),
    ("on a block", "fruit.bob.centre", "fruit: bob's centre, units", 0x800397e4, "addiu $v1, $v1, {}"),
    ("on a block", "gem.turn", "gem: turn per frame", 0x80039964, "addiu $a1, $v0, {}"),
    ("on a block", "hourglass.swing", "hourglass: swing per frame", 0x800399a0, "addiu $a0, $v1, {}"),
    ("on a block", "hourglass.turn", "hourglass: turn per frame", 0x800399c4, "addiu $v1, $a1, {}"),
    ("on a block", "hourglass.lean", "hourglass: swing's centre, angle", 0x80039a00, "addiu $v1, $v1, {}"),
    ("on a block", "pill.flip", "pills and type 34: flip per frame", 0x80039a5c, "addiu $a0, $v1, {}"),
    ("on a block", "pill.turn", "pills and type 34: turn per frame", 0x80039a80, "addiu $a1, $v1, {}"),
    ("on a block", "star42.form", "type 42: form angle per frame", 0x8003932c, "addiu $a0, $v1, {}"),
    ("on a block", "star42.form.past", "type 42: form changes past", 0x800393fc, "slti $v0, $v0, {}"),
    ("on a block", "star42.orbit.brown", "type 42: orbit per frame, brown form", 0x8003935c, "addiu $a0, $v1, {}"),
    ("on a block", "star42.orbit.green", "type 42: orbit per frame, green form", 0x800393b4, "addiu $a0, $v1, {}"),
    ("on a block", "teleporter.turn", "teleporter: turn per frame while on", 0x80039620, "addiu $a0, $v1, {}"),
    ("on a block", "exit.turn.open", "exit: turn per frame while open", 0x800396b0, "addiu $a0, $v1, {}"),
    ("on a block", "exit.turn", "exit: turn per frame while shut", 0x800396cc, "addiu $a0, $v1, {}"),
    ("on a block", "arrows.turn", "placeholder arrows: turn per frame", 0x80039af8, "addiu $a1, $v0, {}"),
    ("on a block", "button.sink", "boost button: sinks per frame near the ball", 0x80039c10, "addiu $v0, $v1, {}"),
    ("on a block", "button.rise", "boost button: rises per frame after", 0x80039c7c, "addiu $v0, $v1, {}"),
    ("on a block", "button.full", "boost button: full height", 0x80039c74, "slti $v0, $v0, {}"),

    ("the ball", "ball.breathe", "breathes at this angle a frame at least", 0x800326b4, "addiu $v0, $v1, {}"),
    ("the ball", "ball.breathe.full", "and faster by the ticks its time is short of this", 0x80032690, "addiu $v0, $zero, {}"),

    ("moving spikes", "spikes.phase.down", "phase: down, if phase times step is under", 0x8002a120, "slti $v0, $v1, {}"),
    ("moving spikes", "spikes.phase.held", "phase: held up, if under", 0x8002a148, "slti $v0, $v1, {}"),
    ("moving spikes", "spikes.phase.retracting", "phase: retracting, if under", 0x8002a160, "slti $v0, $v1, {}"),
    ("moving spikes", "spikes.phase.down.from", "phase: down for this many frames less the phase", 0x8002a134, "addiu $v0, $zero, {}"),
    ("moving spikes", "spikes.phase.held.from", "phase: held for this many less the phase", 0x8002a15c, "addiu $v0, $zero, {}"),
    ("moving spikes", "spikes.phase.retracting.from", "phase: retracting this many less the phase", 0x8002a170, "addiu $v0, $zero, {}"),
    ("moving spikes", "spikes.down", "down, frames", 0x8002be6c, "addiu $s0, $zero, {}"),
    ("moving spikes", "spikes.rise", "rising, frames", 0x8002bc6c, "addiu $s0, $zero, {}"),
    ("moving spikes", "spikes.rattle", "rattling, frames", 0x8002bd00, "addiu $s0, $zero, {}"),
    ("moving spikes", "spikes.hold", "held up, frames", 0x8002bd58, "addiu $s0, $zero, {}"),
    ("moving spikes", "spikes.retract", "retracting, frames", 0x8002bd70, "addiu $s0, $zero, {}"),
    ("moving spikes", "spikes.harmless", "retracting: harmless once this many remain", 0x8002be54, "addiu $v0, $zero, {}"),

    ("vanishing block", "vanish.phase.absent", "phase: starts absent if under", 0x80028bd0, "slti $v0, $a1, {}"),
    ("vanishing block", "vanish.phase.absent.from", "phase: absent for this many frames less the phase", 0x80028c1c, "addiu $v0, $zero, {}"),
    ("vanishing block", "vanish.phase.solid.from", "phase: solid for this many less the phase", 0x80028cb8, "addiu $v0, $zero, {}"),
    ("vanishing block", "vanish.absent", "absent, frames", 0x8002bb78, "addiu $a2, $zero, {}"),
    ("vanishing block", "vanish.in", "fading in, frames", 0x8002b7fc, "addiu $a2, $zero, {}"),
    ("vanishing block", "vanish.settle", "settling, frames", 0x8002b900, "addiu $a2, $zero, {}"),
    ("vanishing block", "vanish.solid", "solid, frames", 0x8002b9c0, "addiu $a2, $zero, {}"),
    ("vanishing block", "vanish.dim", "dimming, frames", 0x8002b9d4, "addiu $a2, $zero, {}"),
    ("vanishing block", "vanish.out", "flashing out, frames", 0x8002bad4, "addiu $a2, $zero, {}"),

    ("crumbling block", "crumble.size", "size at load, units", 0x80028ab8, "addiu $a3, $zero, {}"),
    ("crumbling block", "crumble.shrink", "shrinks per frame once broken, units", 0x8002b5b8, "addiu $v0, $v0, {}"),

    ("moving platform", "platform.dwell", "waits at each end, frames", 0x80032e7c, "addiu $v1, $zero, {}"),

    ("captivators", "corkscrew.phase2", "corkscrew: phase 2 starts at, angle", 0x8003b86c, "addiu $v0, $zero, {}"),
    ("captivators", "corkscrew.phase1", "corkscrew: phase 1 starts at, angle", 0x8003b8b8, "addiu $v1, $zero, {}"),
    ("captivators", "corkscrew.phase0", "corkscrew: phase 0 starts at, angle", 0x8003b904, "addiu $v1, $zero, {}"),
    ("captivators", "corkscrew.bounce", "corkscrew: bounce angle per frame", 0x8003c274, "addiu $v0, $v0, {}"),
    ("captivators", "corkscrew.wrap", "corkscrew: bounce angle wraps at", 0x8003c28c, "slti $v0, $v0, {}"),
    ("captivators", "star52.sway", "fast star: sway angle per frame", 0x8003c15c, "addiu $a0, $t0, {}"),
    ("captivators", "star52.tumble.x", "fast star: tumble per frame, first axis", 0x8003f2fc, "addiu $v1, $a0, {}"),
    ("captivators", "star52.tumble.y", "fast star: tumble per frame, second axis", 0x8003f330, "addiu $v1, $a0, {}"),
    ("captivators", "star50.tumble.x", "slow star: tumble per frame, first axis", 0x8003d730, "addiu $v1, $a0, {}"),
    ("captivators", "star50.tumble.y", "slow star: tumble per frame, second axis", 0x8003d764, "addiu $v1, $a0, {}"),
    ("captivators", "star50.tumble.z", "slow star: tumble per frame, third axis", 0x8003d798, "addiu $v1, $a0, {}"),
    ("captivators", "ball53.tumble.x", "wandering ball: tumble per frame, first axis", 0x8003ddb4, "addiu $v1, $a0, {}"),
    ("captivators", "ball53.tumble.y", "wandering ball: tumble per frame, second axis", 0x8003dde8, "addiu $v1, $a0, {}"),
    ("captivators", "ball53.tumble.z", "wandering ball: tumble per frame, third axis", 0x8003de1c, "addiu $v1, $a0, {}"),
    ("captivators", "ball53.shake", "wandering ball: shakes for this many frames", 0x8003cb14, "slti $v0, $v0, {}"),
    ("captivators", "ball53.lurch.centre", "wandering ball: lurch's centre, units", 0x8003c9cc, "addiu $v0, $v0, {}"),
    ("captivators", "ball53.settle", "wandering ball: settles a block on, units past", 0x8003c574, "slti $v0, $v0, {}"),
    ("captivators", "ball53.ways", "wandering ball: ways drawn from", 0x8003c730, "addiu $a0, $zero, {}"),
    ("captivators", "wheel.roll", "wheel: roll per frame", 0x8003ebc0, "addiu $v0, $v0, {}"),
    ("captivators", "wheel.turning", "wheel: a turn takes, frames", 0x8003cd78, "slti $v0, $v0, {}"),
    ("captivators", "wheel.turn.left", "wheel: turns per frame, one way", 0x8003cda0, "addiu $v0, $v0, {}"),
    ("captivators", "wheel.turn.right", "wheel: turns per frame, the other", 0x8003ce30, "addiu $v0, $v0, {}"),
    ("captivators", "wheel.turn.about", "wheel: turns per frame, about", 0x8003cec0, "addiu $v0, $v0, {}"),
]

# A number that is the multiplier a run of shifts and adds applies to what a
# register held on entry: the run starts at the address and is this many
# instructions long, and the product is read from the last register named.
MULTIPLIERS = [
    ("on a block", "coin.bob.reach", "coin, key, sunglasses: bob's reach, units", 0x800398e0, 3, "v0", "v1"),
    ("on a block", "fruit.bob.reach", "fruit: bob's reach, units", 0x800397c0, 3, "v0", "v1"),
    ("on a block", "fruit.tilt.reach", "fruit: tilt's reach, angle", 0x80039810, 5, "v0", "v1"),
    ("on a block", "star42.orbit.radius", "type 42: orbit's radius, units", 0x800394f0, 5, "v0", "v1"),
    ("the ball", "ball.breathe.reach", "breathes this much of 4096 wider and twice as much shorter", 0x800326e0, 5, "v0", "v0"),
    ("the ball", "time.tick", "the level's time is this many ticks a second", 0x80035f90, 6, "v1", "v0"),
    ("moving spikes", "spikes.phase.step", "phase: frames per step", 0x8002a110, 4, "v1", "v1"),
    ("vanishing block", "vanish.phase.step", "phase: frames per step", 0x80028c10, 3, "a1", "v1"),
    ("moving platform", "platform.scale", "speed on the disc is scaled by this over sixty", 0x80032a60, 5, "v1", "v0"),
    ("captivators", "captivator.standoff", "stand this far off the block's centre, units", 0x8003b720, 5, "a0", "v0"),
    ("captivators", "star50.travel", "slow star: travels per frame, units", 0x8003bcbc, 4, "v1", "v0"),
    ("captivators", "wheel.travel", "wheel: rolls per frame, units", 0x8003bf10, 6, "v0", "v1"),
    ("captivators", "star52.sway.reach", "fast star: sways this far either way, units", 0x8003c008, 5, "v1", "v1"),
    ("captivators", "corkscrew.rise", "corkscrew: rises this far, units", 0x8003c3a0, 5, "a0", "v1"),
    ("captivators", "corkscrew.spin", "corkscrew: spins this much times the cosine per frame", 0x8003e474, 5, "v0", "a2"),
    ("captivators", "ball53.lurch.reach", "wandering ball: lurch's reach, units", 0x8003c98c, 2, "v0", "v1"),
    ("captivators", "ball53.dash", "wandering ball: dashes per frame, units", 0x8003cc40, 6, "v1", "v0"),
]

# The one reach that is a square held in two halves of a word.
BUTTON_REACH = (0x80039bbc, "lui $v1, {}", 0x80039bc0, "ori $v1, $v1, {}")

# A divisor the compiler turned into a multiply by a reciprocal and a shift:
# the two halves of the reciprocal and the shift of the high word.
DIVISORS = [
    ("the ball", "ball.breathe.over", "over this", 0x80032680, "lui $a0, {}", 0x80032684, "ori $a0, $a0, {}",
     0x800326a8, "sra $v1, $a2, {}"),
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

    def divisor(self, hi, hp, lo, lp, sa, sp):
        """The number a multiply by a reciprocal and a shift divides by."""
        magic = (self.immediate(hi, hp) << 16) | (self.immediate(lo, lp) & 0xFFFF)
        return round(2 ** (32 + self.immediate(sa, sp)) / magic)

    def multiplier(self, addr, count, src, dst):
        """The factor applied to `src` by `count` instructions of shifts and adds."""
        coef = {src: 1}
        for i in range(count):
            pc = addr + 4 * i
            text = self.text(pc)
            m = re.match(r"(sll|addu|subu) \$(\w+), \$(\w+)(?:, \$(\w+)|, (\d+))$", text)
            if m:
                op, rd, a, b, sa = m.groups()
                x, y = coef.get(a, 0), coef.get(b, 0) if b else 0
                if x is None or y is None:
                    coef[rd] = None
                elif op == "sll":
                    coef[rd] = x << int(sa)
                else:
                    coef[rd] = x + y if op == "addu" else x - y
            else:
                m = re.match(r"\w+ \$(\w+)", text)
                if m and m.group(1) in coef:
                    coef[m.group(1)] = None      # overwritten by something not a shift or add
        if coef.get(dst) is None:
            sys.exit(f"0x{addr:08x}: {dst} is not a multiple of {src} after {count} instructions")
        return coef[dst]


def readings(code):
    """Every number, by its id, after the checks have passed."""
    for addr, pattern, _ in CHECKS:
        code.immediate(addr, pattern)
    out = {}
    for _, key, _, addr, pattern in IMMEDIATES:
        out[key] = code.immediate(addr, pattern)
    for _, key, _, addr, count, src, dst in MULTIPLIERS:
        out[key] = code.multiplier(addr, count, src, dst)
    hi, hp, lo, lp = BUTTON_REACH
    out["button.reach"] = round(((code.immediate(hi, hp) << 16) + code.immediate(lo, lp)) ** 0.5)
    for _, key, _, *args in DIVISORS:
        out[key] = code.divisor(*args)
    return out


def spike_cycle(r, phase, frames=SPIKE_FRAMES, at=None):
    """The frame the moving spikes show on each frame of one cycle, for a phase.

    The routine at 0x8002bbec is run from the state the loader at 0x8002a078
    gives that phase, past the first cycle, which the loader cuts short or
    stretches, and one steady cycle is taken from the same frame for every
    phase, so the four programs keep the game's spacing between them.
    """
    top = frames - 1
    v = phase * r["spikes.phase.step"]
    if v < r["spikes.phase.down"]:
        state, count, frame = 0, r["spikes.phase.down.from"] - v, 0
    elif v < r["spikes.phase.held"]:
        state, count, frame = 3, r["spikes.phase.held.from"] - v, top
    else:
        state, count, frame = 4, r["spikes.phase.retracting.from"] - v, top
    rise, rattle, retract = r["spikes.rise"], r["spikes.rattle"], r["spikes.retract"]
    cycle = r["spikes.down"] + rise + 1 + rattle + 1 + r["spikes.hold"] + retract + 1
    at = cycle * 2 if at is None else at
    seq = []
    for _ in range(at + cycle * 2):
        count -= 1
        if state == 0:
            if count <= 0:
                state, count = 1, rise
        elif state == 1:
            if count >= 0:
                frame = (rise - 1 - count) * frames // rise
            else:
                state, count, frame = 2, rattle, top
        elif state == 2:
            if count < 0:
                state, count, frame = 3, r["spikes.hold"], top
            else:
                frame = top if count % 2 == 0 else top - count * frames // rattle
        elif state == 3:
            if count <= 0:
                state, count = 4, retract
        else:
            if count < 0:
                state, count, frame = 0, r["spikes.down"], 0
            else:
                frame = count * frames // retract
        seq.append(frame)
    return period(seq, at, cycle, "the moving spikes")


def vanish_cycle(r, phase, at=None):
    """The state of a vanishing block on each frame of one cycle, for a phase,
    with the brightness its faces are drawn at, 128 being their own colour.

    The routine at 0x8002b6ec is run from the state the loader at 0x80028b14
    gives that phase, and a steady cycle is taken the same way as the
    spikes', from one frame for every phase.
    """
    v = phase * r["vanish.phase.step"]
    if phase < r["vanish.phase.absent"]:
        state, count, level = 0, r["vanish.phase.absent.from"] - v, 0
    else:
        state, count, level = 3, r["vanish.phase.solid.from"] - v, 128
    lasts = [r["vanish.absent"], r["vanish.in"], r["vanish.settle"],
             r["vanish.solid"], r["vanish.dim"], r["vanish.out"]]
    cycle = sum(lasts)
    at = cycle * 2 if at is None else at
    seq = []
    for _ in range(at + cycle * 2):
        count -= 1
        if state == 0:
            if count <= 0:
                state, count = 1, lasts[1]
        elif state == 1:
            if count > 0:
                level = (lasts[1] - count) * 255 // lasts[1]
            else:
                state, count, level = 2, lasts[2], 255
        elif state == 2:
            if count > 0:
                level = count * 224 // lasts[2] + 32
            else:
                state, count, level = 3, lasts[3], 128
        elif state == 3:
            if count <= 0:
                state, count, level = 4, lasts[4], 32
        elif state == 4:
            if count > 0:
                level = 256 - count * 224 // lasts[4]
            else:
                state, count, level = 5, lasts[5], 255
        else:
            if count > 0:
                level = 255 * count // lasts[5]
            else:
                state, count, level = 0, lasts[0], 0
        seq.append((state, level))
    return period(seq, at, cycle, "the vanishing block")


def period(seq, at, cycle, what):
    """One cycle from `at`, which has to repeat, or the reading is wrong."""
    if seq[at:at + cycle] != seq[at + cycle:at + 2 * cycle]:
        sys.exit(f"{what} does not repeat every {cycle} frames from frame {at}")
    return seq[at:at + cycle]


def table(r, platform_speed):
    """The motion table by type and by kind of block, in the game's units.

    A rate is per frame and an angle is in 4096ths of a turn; a reach is in
    units of which a block is 512. A cycle is a frame program per phase. The
    platform's speed is the one the level data holds, scaled as the loader
    scales it.
    """
    bob = {"rate": r["coin.bob"], "reach": r["coin.bob.reach"]}
    fruit = {"turn": r["fruit.turn"],
             "tilt": {"rate": r["fruit.tilt"], "reach": r["fruit.tilt.reach"]},
             "bob": {"rate": r["fruit.bob"], "reach": r["fruit.bob.reach"]}}
    pill = {"turn": r["pill.turn"], "flip": r["pill.flip"]}
    star50 = [r["star50.tumble.x"], r["star50.tumble.y"], r["star50.tumble.z"]]
    types = {
        5: {"turn": r["teleporter.turn"]},
        30: {"breathe": {"rate": r["ball.breathe"], "reach": r["ball.breathe.reach"],
                         "full": r["ball.breathe.full"], "over": r["ball.breathe.over"],
                         "tick": r["time.tick"]}},
        7: {"turn": r["exit.turn"], "open": r["exit.turn.open"]},
        26: {"turn": r["exit.turn"], "open": r["exit.turn.open"]},
        31: {"turn": r["coin.turn"], "bob": bob},
        32: pill, 33: pill, 34: pill,
        35: {"turn": r["hourglass.turn"],
             "swing": {"rate": r["hourglass.swing"], "reach": TURN // 2, "lean": r["hourglass.lean"]}},
        36: {"turn": r["gem.turn"]},
        37: {"turn": r["coin.turn"], "bob": bob},
        38: {"turn": r["coin.turn"], "bob": bob},
        42: {"form": {"rate": r["star42.form"], "past": r["star42.form.past"]},
             "orbit": {"radius": r["star42.orbit.radius"],
                       "rate": [r["star42.orbit.brown"], r["star42.orbit.green"]]}},
        11: {"cycle": [spike_cycle(r, p) for p in range(PHASES)]},
        50: {"tumble": star50, "travel": r["star50.travel"]},
        51: {"roll": r["wheel.roll"], "travel": r["wheel.travel"],
             "turning": {"frames": r["wheel.turning"], "rate": r["wheel.turn.right"],
                         "about": r["wheel.turn.about"]}},
        52: {"tumble": [r["star52.tumble.x"], r["star52.tumble.y"], 0],
             "sway": {"rate": r["star52.sway"], "reach": r["star52.sway.reach"]}},
        53: {"tumble": star50,
             "shake": {"frames": r["ball53.shake"], "reach": r["ball53.lurch.reach"]},
             "dash": r["ball53.dash"], "settle": r["ball53.settle"], "ways": r["ball53.ways"]},
        56: {"bounce": {"rate": r["corkscrew.bounce"], "wrap": r["corkscrew.wrap"],
                        "rise": r["corkscrew.rise"], "spin": r["corkscrew.spin"]},
             "phases": [r["corkscrew.phase0"], r["corkscrew.phase1"], r["corkscrew.phase2"], 0]},
    }
    for t in range(43, 48):
        types[t] = fruit
    kinds = {
        5: {"speed": platform_speed * r["platform.scale"] // HZ, "dwell": r["platform.dwell"]},
        7: {"cycle": [[s for s, _ in vanish_cycle(r, p)] for p in range(PHASES)],
            "level": [[v for _, v in vanish_cycle(r, p)] for p in range(PHASES)]},
    }
    return {"hz": HZ, "turn": TURN, "standoff": r["captivator.standoff"],
            "types": {str(t): types[t] for t in sorted(types)},
            "kinds": {str(k): kinds[k] for k in sorted(kinds)}}


def read(disc=None):
    return Code(open_disc(disc).read_file(EXE))


def show_readings(code):
    for addr, pattern, what in CHECKS:
        code.immediate(addr, pattern)
        print(f"  0x{addr:08x}  {what}")
    rows = []
    for group, key, what, addr, pattern in IMMEDIATES:
        rows.append((group, what, addr, code.immediate(addr, pattern)))
    for group, key, what, addr, count, src, dst in MULTIPLIERS:
        rows.append((group, what, addr, code.multiplier(addr, count, src, dst)))
    rows.append(("on a block", "boost button: sinks while the ball is within, units",
                 BUTTON_REACH[0], readings(code)["button.reach"]))
    for group, key, what, hi, hp, lo, lp, sa, sp in DIVISORS:
        rows.append((group, what, hi, code.divisor(hi, hp, lo, lp, sa, sp)))
    order = {g: i for i, g in enumerate(dict.fromkeys(r[0] for r in rows))}
    rows.sort(key=lambda r: (order[r[0]], r[2]))
    last = None
    for group, what, addr, value in rows:
        if group != last:
            print(f"\n{group}")
            last = group
        print(f"  0x{addr:08x}  {value:>6}  {what}")
    print(f"\nangles are in {TURN}ths of a turn, units are {BLOCK} to a block, a frame is 1/{HZ} s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=None, help="raw PS1 image; defaults to $KULA_DISC")
    ap.add_argument("--table", action="store_true", help="print the table the build ships")
    ap.add_argument("--platform-speed", type=int, default=30,
                    help="the speed word the level data gives a moving platform")
    args = ap.parse_args()
    code = read(args.disc)
    if args.table:
        print(json.dumps(table(readings(code), args.platform_speed), indent=1))
    else:
        show_readings(code)


if __name__ == "__main__":
    main()
