#!/usr/bin/env python3
"""What a release's executable changes about a level, read off its code: the
frame rate, the clock's fill, default and swap and the seconds the HUD shows
it in, the hourglass's count and points, and the pause screen's numbering.

    python3 tools/kula_release.py --release eu            # every reading, with its address
    python3 tools/kula_release.py --release jp --table    # the rules the build ships

Every number is the immediate of one instruction, the multiplier a run of
shifts and adds applies or the divisor a reciprocal and a shift stand for,
matched by the instruction it lives in at the release's own address, so a
build that lays the code out differently stops this with a message rather
than yielding a number that looks like a reading. Where a release has no
instruction for a reading, the one that stands in its place is matched and
the reading is null. The image comes from --disc or the release's own
variable, and one whose boot line names another release's executable is
refused.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import RELEASES, open_release
from kula_level import TRAILER_KIND
from kula_motion_code import Code

# The frame rate the video mode's argument stands for.
RATES = {0: 60, 1: 50}

# The one call that sets the video mode, whose argument its delay slot loads.
VIDEO = {"us": (0x8004e9fc, "jal 0x80066868"),
         "eu": (0x8004f7ac, "jal 0x80067370"),
         "jp": (0x80051e08, "jal 0x80069a50")}

# What has to be there for the numbers below to mean what they do: the
# instruction's text, and its address on each release that holds it.
CHECKS = [
    ("the start tests the record past the count for the trailer's kind", f"addiu $v0, $zero, {TRAILER_KIND}",
     {"us": 0x80035f7c, "eu": 0x800367d4, "jp": 0x800362d0}),
    ("and reads its time where it is one", "lh $v1, 12($a0)", {"us": 0x80035f88, "eu": 0x800367e0, "jp": 0x800362dc}),
    ("the start tests the clock it stored against one count", "bne $v1, $v0, {}", {"jp": 0x8003630c}),
    ("the HUD multiplies the clock by a reciprocal", "mult $v1, $v0",
     {"us": 0x8001eba4, "eu": 0x8001f480, "jp": 0x8001f664}),
    ("the hourglass takes the clock from a count", "subu $v0, $v0, $v1",
     {"us": 0x80039074, "eu": 0x800398f8, "jp": 0x800396c0}),
    ("and multiplies what it leaves by a reciprocal", "mult $v0, $a0", {"us": 0x80039078, "eu": 0x800398fc}),
    ("adding the product to the score", "addu $v1, $v1, $v0", {"us": 0x800390bc, "eu": 0x80039940}),
    ("the pause screen adds the slot to the world's levels", "addu $a0, $a0, $v1",
     {"us": 0x800478f4, "eu": 0x80048060, "jp": 0x80046cf0}),
    ("and counts from 1", "addiu $a2, $a0, 1", {"us": 0x800478fc, "eu": 0x80048068, "jp": 0x80046cf8}),
    ("or shifts the world for the finals", "sll $v0, $v0, {}", {"us": 0x80047910, "eu": 0x8004807c, "jp": 0x80046d0c}),
    ("and adds the slot", "addu $v1, $v1, $v0", {"us": 0x80047914, "eu": 0x80048080, "jp": 0x80046d10}),
]

# A number that is the immediate of one instruction: the pattern is the
# disassembly with {} where the immediate goes, at each release's address.
IMMEDIATES = [
    ("the clock", "clock.default", "the start fills the clock with this where no trailer stands past the count",
     "addiu $v0, $zero, {}", {"us": 0x80035fa8, "eu": 0x80036800, "jp": 0x800362f4}),
    ("the clock", "clock.swap.from", "and then takes a clock of this", "addiu $v0, $zero, {}", {"jp": 0x80036308}),
    ("the clock", "clock.swap.to", "to this", "addiu $v0, $zero, {}", {"jp": 0x80036310}),
    ("the hourglass", "hourglass.from", "the hourglass takes the clock from this many ticks", "addiu $v0, $zero, {}",
     {"us": 0x80039070, "eu": 0x800398f4, "jp": 0x800396bc}),
    ("the pause screen", "pause.firstFinal", "the pause screen numbers the finals from this", "addiu $a2, $v1, {}",
     {"us": 0x80047918, "eu": 0x80048084, "jp": 0x80046d14}),
]

# A number that is the multiplier a run of shifts and adds applies to what a
# register held on entry: the run starts at each release's address and is
# that many instructions long, and the product is read from the last
# register named.
MULTIPLIERS = [
    ("the clock", "clock.fill", "the start fills the clock with the trailer's time times this", "v1", "v0",
     {"us": (0x80035f90, 6), "eu": (0x800367e8, 6), "jp": (0x800362e4, 4)}),
    ("the hourglass", "hourglass.points", "the hourglass scores this a second of the clock it leaves", "v1", "v0",
     {"us": (0x800390a8, 5), "eu": (0x8003992c, 5)}),
    ("the pause screen", "pause.levels", "the pause screen counts a world's levels as this many", "v0", "v1",
     {"us": (0x800478ec, 2), "eu": (0x80048058, 2), "jp": (0x80046ce8, 2)}),
    ("the pause screen", "pause.finals", "and its finals as this many", "v0", "v0",
     {"us": (0x80047910, 1), "eu": (0x8004807c, 1), "jp": (0x80046d0c, 1)}),
]

# A divisor the compiler turned into a multiply by a reciprocal and a shift:
# the two halves of the reciprocal and, at each release's addresses, the
# shift of the high word.
DIVISORS = [
    ("the clock", "clock.shown", "the HUD shows the clock in seconds of this many ticks", "lui $v0, {}",
     "ori $v0, $v0, {}",
     {"us": (0x8001e314, 0x8001eba0, 0x8001ebb0, "sra $v0, $v0, {}"),
      "eu": (0x8001ebf0, 0x8001f47c, 0x8001f48c, "sra $v0, $t6, {}"),
      "jp": (0x8001eeec, 0x8001f660, 0x8001f670, "sra $v0, $v0, {}")}),
    ("the hourglass", "hourglass.second", "the hourglass counts the clock it leaves in seconds of this many ticks",
     "lui $a0, {}", "ori $a0, $a0, {}",
     {"us": (0x80039060, 0x80039064, 0x800390a0, "sra $v1, $t3, {}"),
      "eu": (0x800398e4, 0x800398e8, 0x80039924, "sra $v1, $t3, {}")}),
]

# A reading a release has no instruction for, read as the instruction that
# stands where it would: the keys it leaves null, and that instruction's text
# at each such release's address.
ABSENT = [
    ("the clock", ("clock.swap.from", "clock.swap.to"),
     "the start goes on from the clock's store to its call, swapping nothing",
     {"us": (0x80035fb4, "jal 0x80035580"), "eu": (0x8003680c, "jal 0x80035ddc")}),
    ("the hourglass", ("hourglass.second", "hourglass.points"),
     "the hourglass goes on from the clock's store to its call, scoring nothing", {"jp": (0x800396cc, "jal 0x80011780")}),
]

# Where the clock word is reached, each a lui and the load or store after it
# but the HUD's, which loads it off gp.
CLOCK_WORD = {
    "us": {"start": (0x80035fac, 0x80035fb0), "hud": 0x8001eb9c,
           "hourglass": (0x80039068, 0x8003906c, 0x80039090, 0x80039094)},
    "eu": {"start": (0x80036804, 0x80036808), "hud": 0x8001f478,
           "hourglass": (0x800398ec, 0x800398f0, 0x80039914, 0x80039918)},
    "jp": {"start": (0x800362f8, 0x800362fc), "hud": 0x8001f65c,
           "hourglass": (0x800396a8, 0x800396ac, 0x800396c4, 0x800396c8),
           "swap": (0x80036300, 0x80036304, 0x80036314, 0x80036318)},
}

GROUPS = ("the frame", "the clock", "the hourglass", "the pause screen")


def loaded(code, addr, reg):
    """The value one instruction loads into a register: zero by an addu of zero twice, else an addiu's immediate."""
    if code.text(addr) == f"addu ${reg}, $zero, $zero":
        return 0
    return code.immediate(addr, f"addiu ${reg}, $zero, {{}}")


def reaches(code, hi, lo, hp, lp):
    """The word a lui and the load or store after it reach, in RAM's mirror."""
    return (0x80000000 | (code.immediate(hi, hp) << 16)) + code.immediate(lo, lp)


def clock_word(code, release):
    """The clock word the start fills, which the HUD, the hourglass and the swap have to reach too."""
    places = CLOCK_WORD[release]
    word = reaches(code, *places["start"], "lui $at, {}", "sw $v0, {}($at)")
    reached = {places["hud"]: RELEASES[release]["gp"] + code.immediate(places["hud"], "lw $v1, {}($gp)")}
    for name in ("hourglass", "swap"):
        if name in places:
            hi, lo, hi2, lo2 = places[name]
            reached[lo] = reaches(code, hi, lo, "lui $v1, {}", "lw $v1, {}($v1)")
            reached[lo2] = reaches(code, hi2, lo2, "lui $at, {}", "sw $v0, {}($at)")
    for at, other in reached.items():
        if other != word:
            sys.exit(f"0x{at:08x} reaches the clock at 0x{other:08x}, not 0x{word:08x} where the start fills it")
    return word


def readings(code, release):
    """Every number, by its id, after the checks have passed."""
    for _, pattern, where in CHECKS:
        if release in where:
            code.immediate(where[release], pattern)
    call, callee = VIDEO[release]
    code.immediate(call, callee)
    mode = loaded(code, call + 4, "a0")
    if mode not in RATES:
        sys.exit(f"0x{call + 4:08x} sets video mode {mode}, which is neither NTSC's nor PAL's")
    out = {"hz": RATES[mode]}
    for _, key, _, pattern, where in IMMEDIATES:
        if release in where:
            out[key] = code.immediate(where[release], pattern)
    for _, key, _, src, dst, where in MULTIPLIERS:
        if release in where:
            out[key] = code.multiplier(*where[release], src, dst)
    for _, key, _, hp, lp, where in DIVISORS:
        if release in where:
            hi, lo, sa, sp = where[release]
            out[key] = code.divisor(hi, hp, lo, lp, sa, sp)
    for _, keys, _, where in ABSENT:
        if release in where:
            code.immediate(*where[release])
            for key in keys:
                out[key] = None
    out["clock.word"] = clock_word(code, release)
    return out


def rules(code, release):
    """The release's rules: frames a second, the clock's fill of ticks a second of the trailer's time, its default,
    the swap of one clock for another where the start makes one and the ticks the HUD shows a second, the ticks the
    hourglass takes the clock from and the seconds and points it scores by where it scores, and the pause screen's
    levels a world, finals a world and the first final's number."""
    r = readings(code, release)
    swap = None if r["clock.swap.from"] is None else [r["clock.swap.from"], r["clock.swap.to"]]
    return {"hz": r["hz"],
            "clock": {"fill": r["clock.fill"], "default": r["clock.default"], "swap": swap, "shown": r["clock.shown"]},
            "hourglass": {"from": r["hourglass.from"], "second": r["hourglass.second"], "points": r["hourglass.points"]},
            "pause": {"levels": r["pause.levels"], "finals": r["pause.finals"], "firstFinal": r["pause.firstFinal"]}}


def read(release, disc=None):
    entry = RELEASES[release]
    return Code(open_release(release, disc).read_file(entry["exe"]), entry["base"])


def show_readings(code, release):
    for what, pattern, where in CHECKS:
        if release in where:
            code.immediate(where[release], pattern)
            print(f"  0x{where[release]:08x}  {what}")
    for _, _, what, where in ABSENT:
        if release in where:
            code.immediate(*where[release])
            print(f"  0x{where[release][0]:08x}  {what}")
    run = readings(code, release)
    rows = [("the frame", "frames a second, by the video mode the startup sets", VIDEO[release][0] + 4, run["hz"])]
    for group, key, what, _, where in IMMEDIATES:
        if release in where:
            rows.append((group, what, where[release], run[key]))
    for group, key, what, _, _, where in MULTIPLIERS + DIVISORS:
        if release in where:
            rows.append((group, what, where[release][0], run[key]))
    rows.append(("the clock", f"the clock the start fills, the HUD shows and the hourglass turns lies at "
                 f"0x{run['clock.word']:08x}, this far past gp", CLOCK_WORD[release]["hud"],
                 run["clock.word"] - RELEASES[release]["gp"]))
    rows.sort(key=lambda r: (GROUPS.index(r[0]), r[2]))
    last = None
    for group, what, addr, value in rows:
        if group != last:
            print(f"\n{group}")
            last = group
        print(f"  0x{addr:08x}  {value:>6}  {what}")
    print(f"\n{RELEASES[release]['name']}: a frame is 1/{run['hz']} s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--release", choices=list(RELEASES), default="us", help="the release whose executable is read")
    ap.add_argument("--disc", default=None, help="raw PS1 image; defaults to the release's own variable")
    ap.add_argument("--table", action="store_true", help="print the rules the build ships")
    args = ap.parse_args()
    code = read(args.release, args.disc)
    if args.table:
        print(json.dumps(rules(code, args.release), indent=1))
    else:
        show_readings(code, args.release)


if __name__ == "__main__":
    main()
