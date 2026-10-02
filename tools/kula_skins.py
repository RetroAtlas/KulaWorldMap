#!/usr/bin/env python3
"""What the game paints on every face of every block, read off the executable
and the artwork's model table.

    python3 tools/kula_skins.py            # every reading, with its address
    python3 tools/kula_skins.py --table    # the table the build ships

Every number is read by matching the instruction it lives in, so a build laid
out differently stops this rather than yielding a reading that looks like
one. The routines that place a face's corners are run rather than read.
"""
import argparse
import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kula_tgi as tgi
from kula_disc import EXE, EXE_BASE, THEMES, open_disc
from kula_motion import Code
from mips import Machine

FACES = 6
TURNS = 4            # the quarter turns a texture can be laid at
TYPES = 50           # the models past the stones, one per type
BLOCK = 512
STRUCT = 0x80191000  # where the loader builds its first face
HEADER = {"shade": 300, "turn": 324, "groups": 336}
GROUPS = 5           # header words counting the model table's groups

# What has to be there for the readings to mean what the doc says.
CHECKS = [
    (0x80027338, "lh $s1, -1278($v0)", "a face's selector is the type in its slot"),
    (0x800278e8, "bne $s1, $s0, 0x80027910", "and a face of the fire's selector joins the fire's cycle"),
    (0x8002769c, "lw $v0, 336($v0)", "the stones come after the header's first group"),
    (0x800276ac, "jal 0x80047418", "a plain face draws a stone"),
    (0x800276b8, "addu $s4, $s4, $v0", "picked at random"),
    (0x800276c4, "lw $v0, 5868($gp)", "a type's model comes after the stones"),
    (0x800276cc, "addu $v0, $v0, $s1", "and is numbered by the type"),
    (0x800275a4, "addu $s4, $v1, $v0", "a vanishing block draws the first stone"),
    (0x80025cb8, "sw $v0, 5876($gp)", "the second set begins past the first three groups"),
    (0x80028e2c, "lw $v0, 300($v0)", "a face's shade is the header word its number picks"),
    (0x80027ad0, "lw $s0, 324($v0)", "how a stone is turned is the header's word"),
    (0x80028e98, "lw $v0, 12840($at)", "the face routines are a table indexed by face"),
    (0x8004f480, "sb $s2, 3($t6)", "an animated face's frame is byte 3 of its flags"),
    (0x8004fa18, "sll $s4, $s4, 5", "and picks the quad that many entries into its model"),
    (0x80027cb4, "lw $v1, 13232($v1)", "the set is decided over again by the mode the game is in"),
    (0x80027cc4, "sw $zero, 9372($gp)", "which puts one mode back on the first set whatever the keys"),
    (0x8004cd10, "lw $v1, 13232($v1)", "and that mode is the one that names a pack of its own"),
    (0x8004cd70, "lw $v0, 13528($at)", "out of a table of paths indexed past the ten worlds"),
    (0x80027384, "jal 0x8002dfac", "a face is built knowing its neighbour's kind"),
    (0x80027374, "subu $s1, $zero, $s1", "a kind past the styles selects its own path, negated"),
    (0x800273a4, "beq $s1, $v0, 0x80027590", "and the vanishing block's path asks nothing of the neighbour"),
    (0x800277d8, "and $s0, $s0, $v0", "a face hidden while its neighbour stands is built unseen"),
    (0x800277ec, "ori $s0, $s0, 2", "a hidden level's faces carry a flag"),
    (0x80056a0c, "ori $t9, $t9, 44", "that is the semi-transparent bit of a textured quad"),
    (0x8004fa2c, "andi $s7, $t2, 768", "and bits 8 and 9 of the flags are the blend mode"),
]

# A number that is the immediate of one instruction.
IMMEDIATES = [
    ("faces", "plain.from", "a type from here stands on a plain face", 0x80027344, "slti $v0, $s1, {}"),
    ("faces", "clock.alias", "a type drawn like the clock", 0x8002733c, "addiu $v0, $zero, {}"),
    ("faces", "clock.type", "the clock's type", 0x80027348, "addiu $s1, $zero, {}"),
    ("faces", "invisible", "an invisible block's model in its set", 0x80027420, "addiu $a2, $a2, {}"),
    ("faces", "crumbling", "a crumbling block's model", 0x80027568, "addiu $a2, $a2, {}"),
    ("faces", "laser", "a laser's near end's model", 0x800282c8, "addiu $a2, $a2, {}"),
    ("faces", "laser.far", "and its far end's", 0x80028a38, "addiu $a2, $a2, {}"),
    ("faces", "invisible.flags", "an invisible face's flags", 0x800273f0, "addiu $a3, $zero, {}"),
    ("faces", "shadow.plain", "a type from here shows its second quad on a plain face", 0x800276d4, "slti $v0, $s1, {}"),
    ("faces", "shadow.from", "on ice, a type from here", 0x80027834, "addiu $v0, $v1, {}"),
    ("faces", "shadow.span", "for this many types", 0x80027838, "sltiu $v0, $v0, {}"),
    ("faces", "shadow.not.a", "except this one", 0x80027840, "addiu $v0, $zero, {}"),
    ("faces", "shadow.not.b", "this one", 0x80027848, "addiu $v0, $zero, {}"),
    ("faces", "shadow.not.c", "and this one", 0x80027850, "addiu $v0, $zero, {}"),
    ("faces", "shadow.quad", "shows this quad, in the flags' top byte", 0x80027858, "lui $v0, {}"),
    ("faces", "turn.half.of", "a stone is turned a half turn, one time in", 0x80027afc, "addiu $a0, $zero, {}"),
    ("faces", "turn.half", "which is this many quarters", 0x80027b0c, "addiu $v0, $zero, {}"),
    ("faces", "turn.quarters", "or any of this many quarters", 0x80027b14, "addiu $a0, $zero, {}"),
    ("faces", "phase.unit", "an animation's phase steps every this many units", 0x80027430, "addiu $t1, $zero, {}"),
    ("faces", "fire.of", "the fire's cycle runs on a face whose selector is", 0x800278cc, "addiu $s0, $zero, {}"),

    ("sets", "key.type", "a level without this type draws the second set", 0x80027b4c, "addiu $t0, $zero, {}"),
    ("sets", "keys.below", "counting keys on records of kinds below", 0x80027b64, "sltiu $v0, $v0, {}"),
    ("sets", "hidden.kind", "the record whose first slot flags a hidden level", 0x80027c34, "addiu $t2, $zero, {}"),
    ("sets", "hidden.flag", "by this type", 0x80027c38, "addiu $a0, $zero, {}"),
    ("sets", "copycat.mode", "the mode that draws the first set whatever the keys", 0x80027cb8, "addiu $v0, $zero, {}"),
    ("sets", "copycat.names", "the mode that names its own pack", 0x8004cd14, "addiu $v0, $zero, {}"),
    ("sets", "copycat.pak", "when the file wanted is the extension", 0x8004cd20, "addiu $v0, $zero, {}"),
    ("sets", "copycat.world", "taking the path of this world", 0x8004cd2c, "addiu $a0, $zero, {}"),

    ("hiding", "path.crumbling", "the selector that takes the crumbling block's path", 0x80027390, "addiu $v0, $zero, {}"),
    ("hiding", "path.vanishing", "the vanishing block's", 0x800273a0, "addiu $v0, $zero, {}"),
    ("hiding", "path.invisible", "the invisible block's", 0x800273b4, "addiu $v0, $zero, {}"),
    ("hiding", "hide.below", "any other face is not built toward a neighbour of a kind below", 0x800273a8, "sltiu $v0, $s2, {}"),
    ("hiding", "hide.also.a", "nor toward this kind", 0x8002767c, "addiu $t1, $zero, {}"),
    ("hiding", "hide.also.b", "or this", 0x80027684, "addiu $v0, $zero, {}"),
    ("hiding", "hide.while", "and is hidden while a neighbour of this kind stands", 0x800277cc, "addiu $v0, $zero, {}"),
    ("hiding", "invisible.below", "an invisible face is not built toward a kind below", 0x800273bc, "sltiu $v0, $s2, {}"),
    ("hiding", "invisible.from", "nor toward one from minus this", 0x800273c4, "addiu $v0, $s2, {}"),
    ("hiding", "invisible.span", "for this many kinds", 0x800273c8, "sltiu $v0, $v0, {}"),
    ("hiding", "invisible.also", "nor toward this kind", 0x800273d0, "addiu $v0, $zero, {}"),
    ("hiding", "crumbling.below", "a crumbling face is hidden toward a kind below", 0x80027484, "sltiu $v0, $s2, {}"),
    ("hiding", "crumbling.a", "and toward this kind", 0x80027490, "addiu $t1, $zero, {}"),
    ("hiding", "crumbling.b", "this", 0x80027498, "addiu $v0, $zero, {}"),
    ("hiding", "crumbling.c", "and this", 0x800274a0, "addiu $v0, $zero, {}"),

    ("platform", "platform.stone", "a face drawn as a stone at random", 0x80027ec8, "addiu $v0, $zero, {}"),
    ("platform", "platform.none", "a face not drawn", 0x80027ec0, "addiu $v0, $zero, {}"),
]

# An address the code builds from a lui and an addiu, and the table there.
PLATFORM_TABLES = [
    ("single", 0x80027e40, 0x80027e44),
    ("first", 0x80027e58, 0x80027e5c),
    ("middle", 0x80027e80, 0x80027e84),
    ("last", 0x80027e90, 0x80027e94),
]
PLATFORM_AXIS_STRIDE = (0x80027e08, 3, "v1", "s5")
PLATFORM_AXES = "xyz"
PLATFORM_MODELS = 4  # the platform's own models open a set

# The animation lists: the frame table's start and end, its second table for
# a face with a pickup on it, and the brightness cycle's start and end.
CYCLES = {
    "fire": {"frames": ((0x80026f4c, 0x80026f50), (0x80026f44, 0x80026f48))},
    "invisible": {"frames": ((0x80026fac, 0x80026fb0), (0x80026fa4, 0x80026fa8)),
                  "level": ((0x80026fc0, 0x80026fc4), (0x80026fb8, 0x80026fbc))},
    "bonus": {"frames": ((0x800270d4, 0x800270d8), (0x800270c4, 0x800270c8)),
              "shadowed": (0x800270e4, 0x800270e8),
              "level": ((0x80027044, 0x80027048), (0x80027004, 0x80027008))},
}
# The tables the game builds a file's path out of: a path per world, and the
# extensions.
PATH_TABLE = (0x8004cd68, 0x8004cd70)
EXT_TABLE = (0x8004cdd0, 0x8004cdd8)
MIRROR = 0x80000000   # the tables hold addresses without RAM's mirror bit

PHASE_SPREAD = (0x80027a98, 3, "t0", "v0")     # the phase divides the face's position by unit times this
BONUS_CYCLES = 4     # colour cycles for the bonus stone: a pair per world parity, blocks then platforms
FACE_TABLE = (0x80028e90, 0x80028e98)


def text_at(code, addr):
    p = addr - EXE_BASE
    end = code.blob.index(b"\0", p)
    return code.blob[p:end].decode("ascii")


def entry(code, table, i):
    return struct.unpack_from("<I", code.blob, table + 4 * i - EXE_BASE)[0] | MIRROR


def copycat_pack(code, r):
    """The pack the game loads in the mode that draws the first set whatever
    the keys, in the form the disc's directory gives it.

    In that mode, and only for the level pack, the game takes the path one
    past the worlds'.
    """
    if r["copycat.mode"] != r["copycat.names"]:
        sys.exit("the mode that names its own pack is not the one that keeps the first set")
    path = text_at(code, entry(code, code.address(*PATH_TABLE), r["copycat.world"]))
    ext = text_at(code, entry(code, code.address(*EXT_TABLE), r["copycat.pak"]))
    return (path + ext).replace("\\", "/").split(";")[0]


def halfword(v):
    return v - 0x10000 if v & 0x8000 else v


def face_corners(code):
    """Where each of the six face routines puts a texture's four corners, top
    left, top right, bottom left and bottom right, for each of the four turns,
    as corners of the unit block.

    A routine takes the face's record, the block's size and centre and a
    turn, and writes the four vertices at bytes 32 to 52 of the record, in
    the order the renderer pairs them with the texture's corners.
    """
    table = code.address(*FACE_TABLE)
    m = Machine(code)
    centre = (BLOCK * 3, BLOCK * 5, BLOCK * 7)
    low = [c - BLOCK // 2 for c in centre]
    out = []
    for face in range(FACES):
        routine = 0x80000000 | code.word(table + 4 * face)
        turns = []
        for turn in range(TURNS):
            mem = m.run(routine, [STRUCT, BLOCK, centre[0], centre[1]], [centre[2], turn])
            if mem.get(STRUCT + 6) != turn:
                sys.exit(f"the routine for face {face} did not keep its turn")
            words = [sum(mem.get(STRUCT + o + b, 0) << (8 * b) for b in range(4)) for o in (32, 36, 40, 44, 48, 52)]
            zs = [words[4] & 0xFFFF, words[4] >> 16, words[5] & 0xFFFF, words[5] >> 16]
            corners = []
            for k in range(4):
                p = (halfword(words[k] & 0xFFFF), halfword(words[k] >> 16), halfword(zs[k]))
                c = [(v - lo) // BLOCK for v, lo in zip(p, low)]
                if any(v not in (0, 1) for v in c):
                    sys.exit(f"face {face}, turn {turn}: a corner landed at {p}, off the block")
                corners.append(c)
            turns.append(corners)
        out.append(turns)
    return out


def platform_table(code, r):
    """The (model, turn) each face of a moving platform's blocks draws, by the
    axis it runs along and whether the block is the only one, the first, one
    between or the last, with the model that stands for a stone at random."""
    stride = code.multiplier(*PLATFORM_AXIS_STRIDE)
    if stride != 2 * FACES * 2 * len(PLATFORM_TABLES):
        sys.exit(f"the platform tables are {stride} bytes an axis, not {2 * FACES * 2 * len(PLATFORM_TABLES)}")
    out = {"stone": r["platform.stone"]}
    for a, axis in enumerate(PLATFORM_AXES):
        out[axis] = {}
        for role, lui, addiu in PLATFORM_TABLES:
            at = code.address(lui, addiu) + a * stride
            pairs = struct.unpack_from(f"<{FACES * 2}h", code.blob, at - EXE_BASE)
            faces = []
            for f in range(FACES):
                model, turn = pairs[2 * f], pairs[2 * f + 1]
                if model == r["platform.none"]:
                    faces.append(None)
                elif model == r["platform.stone"] or 0 <= model < PLATFORM_MODELS:
                    faces.append([model, turn % TURNS])
                else:
                    sys.exit(f"a platform face names model {model}, not one of the platform's")
            out[axis][role] = faces
    return out


def cycles(code, r):
    """The animator's tables: a frame index per game frame and, where a face
    has one, a colour per frame of a second cycle to draw the texture through."""
    def span(start, end):
        a, b = code.address(*start), code.address(*end)
        return code.blob[a - EXE_BASE:b - EXE_BASE]

    def colours(raw):
        words = struct.unpack_from(f"<{len(raw) // 4}I", raw)
        return [[w & 0xFF, (w >> 8) & 0xFF, (w >> 16) & 0xFF] for w in words]

    def grey(rgb):
        if any(c[0] != c[1] or c[1] != c[2] for c in rgb):
            sys.exit("a brightness cycle is not grey")
        return [c[0] for c in rgb]

    inv = CYCLES["invisible"]
    bonus = CYCLES["bonus"]
    frames = list(span(*bonus["frames"]))
    shadowed_at = code.address(*bonus["shadowed"])
    base = code.address(*bonus["level"][0])
    length_at = code.address(*bonus["level"][1])
    length = struct.unpack_from("<I", code.blob, length_at - EXE_BASE)[0]
    palette = colours(code.blob[base - EXE_BASE:base - EXE_BASE + BONUS_CYCLES * length * 4])
    return {
        "fire": {"of": r["fire.of"], "frames": list(span(*CYCLES["fire"]["frames"]))},
        "invisible": {"frames": list(span(*inv["frames"])), "level": grey(colours(span(*inv["level"])))},
        "bonus": {"frames": frames,
                  "shadowed": list(code.blob[shadowed_at - EXE_BASE:shadowed_at - EXE_BASE + len(frames)]),
                  "colour": [palette[i * length:(i + 1) * length] for i in range(BONUS_CYCLES)]},
        "spread": r["phase.unit"] * code.multiplier(*PHASE_SPREAD),
    }


def hiding(r):
    """The neighbours a face is not built toward, or built unseen behind, by
    the kind of the block it belongs to, which picks the path the game takes.
    Of the kinds the path for every other face names, the ones it builds a
    face unseen behind rather than not at all are given apart."""
    below = lambda n: set(range(n))
    other = below(r["hide.below"]) | {r["hide.also.a"], r["hide.also.b"], r["hide.while"]}
    start = -r["invisible.from"]
    invisible = below(r["invisible.below"]) | set(range(start, start + r["invisible.span"])) | {r["invisible.also"]}
    crumbling = below(r["crumbling.below"]) | {r["crumbling.a"], r["crumbling.b"], r["crumbling.c"]}
    return {
        "other": sorted(other),
        "unseen": [r["hide.while"]],
        "kinds": {
            str(r["path.invisible"]): sorted(invisible),
            str(-r["path.crumbling"]): sorted(crumbling),
            str(-r["path.vanishing"]): [],
        },
    }


def readings(code):
    """Every number, by its id, after the checks have passed."""
    for addr, pattern, _ in CHECKS:
        code.immediate(addr, pattern)
    out = {}
    for _, key, _, addr, pattern in IMMEDIATES:
        out[key] = code.immediate(addr, pattern)
    if out["laser"] != out["laser.far"]:
        sys.exit("a laser's two ends wear different plates")
    quad = (out["shadow.quad"] << 16) >> 24
    if quad != 1:
        sys.exit(f"a shadowed face shows quad {quad}, not the second")
    return out


def header(blob):
    """The header words the loader reads: a shade per face, how a stone may be
    turned, and the sizes of the model table's groups."""
    shade = struct.unpack_from(f"<{FACES}I", blob, HEADER["shade"])
    turn = struct.unpack_from("<I", blob, HEADER["turn"])[0]
    groups = struct.unpack_from(f"<{GROUPS}I", blob, HEADER["groups"])
    return {"shade": list(shade), "turn": turn, "groups": list(groups)}


def sets(models, groups, r):
    """The two sets of models a level draws from, resolved to texture lists:
    the first for a level with a key, the second for one without.

    A set is a group of special models, then the world's stones, then one
    model per type; the second set has the same shape with the group sizes the
    header gives it.
    """
    out = {}
    first = 0
    for name, (n_special, n_stone, n_types) in (("arcade", (groups[0], groups[1], groups[2])),
                                                 ("bonus", (groups[0], groups[3], groups[4]))):
        special = models[first:first + n_special]
        stones = models[first + n_special:first + n_special + n_stone]
        typed = models[first + n_special + n_stone:first + n_special + n_stone + n_types]
        if len(typed) != TYPES:
            sys.exit(f"the {name} set has {len(typed)} models past its stones, not {TYPES}")
        types = {}
        for t in range(1, TYPES):
            types[str(t)] = typed[r["clock.type"] if t == r["clock.alias"] else t]
        kinds = {"1": typed[1], "2": typed[2], "3": special[r["invisible"]], "4": typed[4],
                 "6": special[r["crumbling"]], "7": stones[0]}
        out[name] = {"stone": stones, "kinds": kinds, "types": types,
                     "laser": special[r["laser"]], "platform": special[:PLATFORM_MODELS]}
        first += n_special + n_stone + n_types
    return out


def table(code, tgis):
    """The table the build ships under "skins" in public/objects.json.

    `tgis` maps a world id to its .TGI. The model table has to be the same in
    every world for the sets to mean anything.
    """
    r = readings(code)
    models = None
    worlds = {}
    for world, blob in tgis.items():
        m = tgi.models(blob)
        if models is None:
            models = m
        elif m != models:
            sys.exit(f"{world} names different textures for its models")
        worlds[world] = header(blob)
    groups = next(iter(worlds.values()))["groups"]
    if any(h["groups"] != groups for h in worlds.values()):
        sys.exit("the worlds do not agree on the model table's groups")
    shadow_from = -r["shadow.from"]
    if shadow_from != r["shadow.plain"]:
        sys.exit("plain and ice faces shadow different types")
    return {
        "textures": len(tgi.textures(next(iter(tgis.values())))),
        "shade": {w: h["shade"] for w, h in worlds.items()},
        "turn": {w: h["turn"] for w, h in worlds.items()},
        "turns": {"half": {"of": r["turn.half.of"], "quarters": r["turn.half"]}, "quarters": r["turn.quarters"]},
        "corners": face_corners(code),
        "sets": sets(models, groups, r),
        "keys": {"type": r["key.type"], "kinds": r["keys.below"]},
        "copycat": copycat_pack(code, r),
        "clock": {"alias": r["clock.alias"], "type": r["clock.type"]},
        "hides": hiding(r),
        "hidden": {"kind": r["hidden.kind"], "type": r["hidden.flag"]},
        "plainFrom": r["plain.from"],
        "shadow": {"from": shadow_from, "to": shadow_from + r["shadow.span"] - 1,
                   "except": [r["shadow.not.a"], r["shadow.not.b"], r["shadow.not.c"]]},
        "blend": {"3": (r["invisible.flags"] >> 8) & 3},
        "platform": platform_table(code, r),
        "cycles": cycles(code, r),
    }


def read(disc=None):
    d = open_disc(disc)
    return Code(d.read_file(EXE)), {w: d.read_file(f"/{w}/{w}.TGI") for w in THEMES}


def show_readings(code, tgis):
    for addr, pattern, what in CHECKS:
        code.immediate(addr, pattern)
        print(f"  0x{addr:08x}  {what}")
    last = None
    for group, key, what, addr, pattern in IMMEDIATES:
        if group != last:
            print(f"\n{group}")
            last = group
        print(f"  0x{addr:08x}  {code.immediate(addr, pattern):>6}  {what}")
    r = readings(code)
    print("\nthe corners a face routine lays a texture's top left, top right, bottom left and bottom right on")
    names = ["top", "+x", "+y", "-y", "-x", "under"]
    for face, turns in enumerate(face_corners(code)):
        for turn, corners in enumerate(turns):
            print(f"  face {face} {names[face]:5} turn {turn}: " + "  ".join("".join(map(str, c)) for c in corners))
    table = platform_table(code, r)
    print(f"\na moving platform's faces, (model, turn) by axis and place in the run; "
          f"model {table['stone']} is a stone at random")
    for axis in PLATFORM_AXES:
        for role, faces in table[axis].items():
            print(f"  {axis} {role:6}: " + "  ".join("-" if f is None else f"{f[0]},{f[1]}" for f in faces))
    print(f"\nthe pack that keeps the first set whatever the keys: {copycat_pack(code, r)}")
    cyc = cycles(code, r)
    print(f"\nfire runs {len(cyc['fire']['frames'])} frames over its quads, the invisible block "
          f"{len(cyc['invisible']['frames'])} with a brightness cycle of {len(cyc['invisible']['level'])}, "
          f"the bonus stone {len(cyc['bonus']['frames'])} with {len(cyc['bonus']['colour'])} colour cycles "
          f"of {len(cyc['bonus']['colour'][0])}; a phase steps every {cyc['spread']} units of position")
    for world, blob in tgis.items():
        h = header(blob)
        print(f"  {world:7} shade per face {h['shade']}  turn {h['turn']}  groups {h['groups']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--disc", default=None, help="raw PS1 image; defaults to $KULA_DISC")
    ap.add_argument("--table", action="store_true", help="print the table the build ships")
    args = ap.parse_args()
    code, tgis = read(args.disc)
    if args.table:
        print(json.dumps(table(code, tgis), indent=1))
    else:
        show_readings(code, tgis)


if __name__ == "__main__":
    main()
