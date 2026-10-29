"""The things on a block, how each is laid out and turned and the rates it
moves at, the boost button, the captivators, the order they move in and the
dice the wandering ball draws from, the spin each type's draw builds, and the
laser: "The things on a block", "The captivators" and "The laser" in
docs/motion.md.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_motion_code import ADD, BLOCK

CHECKS = [
    # The laser.
    (0x80028214, "addiu $v0, $zero, 8", "the laser builder takes the records of kind 8"),
    (0x8002833c, "addiu $v0, $s5, 6", "and keeps where the record says it is lit, f3"),
    (0x8002844c, "lh $v1, 44($s5)", "the colour is the circuit, a word of the second slot"),
    (0x8002856c, "addiu $s2, $s2, 1", "a beam along x is laid a cell at a time from its first end up"),
    (0x800286b0, "addiu $s3, $s3, 1", "and along y"),
    (0x800287f8, "addiu $s4, $s4, 1", "and along z"),
    (0x800284e0, "jal 0x80047418", "each of its four lines starts its brightness at random"),
    (0x8002815c, "beq $s1, $zero, 0x80028184", "circuit 0's colour is two shifts"),
    (0x80028198, "or $v0, $v0, $v1", "put together"),
    (0x8002814c, "beq $s1, $t3, 0x8002819c", "circuit 1's colour is one"),
    (0x8002816c, "beq $s1, $t2, 0x800281a8", "and circuit 2's colour"),
    (0x80028174, "beq $s1, $t1, 0x800281b4", "and circuit 3's colour"),
    (0x8005190c, "lhu $fp, 0($fp)", "the renderer reads whether a beam is lit"),
    (0x80051914, "bne $fp, $zero, 0x8005192c", "and draws only one that is"),
    (0x80051a18, "sra $t9, $t9, 6", "filing a cell's stretch by the depth of its centre"),
    (0x800518ec, "lui $a2, 0xe100", "in a draw mode set for the purpose"),
    (0x80051b2c, "lui $at, 0x2a00", "each line is two flat quads blended with what is behind"),
    (0x80051be4, "lui $at, 0x4200", "and a flat line down the middle, blended the same way"),
    (0x80051c44, "bne $fp, $zero, 0x80051c14", "every frame a dark beam's cells"),
    (0x80051c38, "addiu $t4, $zero, -1", "are written empty"),
    (0x80051c9c, "beq $fp, $zero, 0x80051c6c", "and a lit one's cells"),
    (0x80051c90, "addiu $t4, $zero, -2", "are written as beam"),
    (0x80035ab4, "bne $v1, $v0, 0x80035cac", "the loader's walk at load takes the records of kind 8 too"),
    (0x80035b2c, "sh $zero, 0($v0)", "lays a bare block at the lower end of a beam along x"),
    (0x80035bb8, "sh $zero, 0($v1)", "along y"),
    (0x80035c38, "sh $zero, 0($v0)", "or along z"),
    (0x80035ca8, "sh $zero, 0($v1)", "and at its upper end, the one store the three axes share"),
    (0x80035b68, "sh $t3, 0($v0)", "and the lit beam's word between, along x"),
    (0x80035bec, "sh $t3, 0($v0)", "along y"),
    (0x80035c60, "sh $t3, 0($v0)", "and along z"),
    # How a thing is laid out and turned.
    (0x80053480, "mtc2 $s7, vxy0", "a vertex's pair of words is the coprocessor's x and y"),
    (0x80053468, "mtc2 $gp, vz0", "and its third word its z"),
    (0x8005359c, "blez $t4, 0x800537ec", "a culled polygon is drawn only where nclip is positive"),
    (0x80039d7c, "jal 0x800603f8", "a thing on a block is its own matrix times its spin"),
    (0x8003b980, "jal 0x80061298", "a captivator's first matrix is turned about z"),
    (0x8003d7e8, "jal 0x800603f8", "the slow star is the camera times its spin, with no face in it"),
    (0x8003de6c, "jal 0x800603f8", "and the wandering ball"),
    (0x8003f3b4, "jal 0x800603f8", "and the fast star"),
    (0x8003e4bc, "subu $v0, $v0, $v1", "the corkscrew takes its spin's step from its angle"),
    # Where a captivator is drawn.
    (0x8003d6d4, "addiu $s5, $s4, -32", "the draw's s5 is an entry's position"),
    (0x8003d6e8, "addiu $fp, $s4, -24", "and its fp an entry's home"),
    (0x8003d81c, "addu $v0, $v0, $s5", "the slow star is drawn at its entry's position"),
    (0x8003d84c, "jal 0x800606b8", "as it is"),
    (0x8003ed3c, "addu $v0, $v0, $s5", "and the wheel"),
    (0x8003ed6c, "jal 0x800606b8", "as it is"),
    (0x8003f3e8, "addu $v0, $v0, $s5", "and the fast star"),
    (0x8003f418, "jal 0x800606b8", "as it is"),
    (0x8003dea0, "addu $v0, $v0, $s5", "and the wandering ball"),
    (0x8003ded0, "jal 0x800606b8", "as it is"),
    (0x8003e574, "addu $v0, $v0, $s5", "and the corkscrew"),
    (0x8003e5f0, "subu $v0, $v0, $v1", "less a multiple of its normal"),
    (0x8003e658, "jal 0x800606b8", "and then as it is"),
    # The dice, and the order the captivators move in.
    (0x80040690, "jal 0x80040718", "the play loop runs a level's routine"),
    (0x80040748, "jal 0x80025054", "which first calls the routine"),
    (0x80025064, "jal 0x8004740c", "that seeds the dice"),
    (0x80041c34, "beq $t2, $zero, 0x80040aa0", "and then loops a frame at a time from after it"),
    (0x8004740c, "sw $a0, 2380($gp)", "whose state is one word"),
    (0x80047430, "andi $v0, $v1, 65535", "a draw of n is n times the state's low half"),
    (0x80047444, "srl $v0, $a1, 16", "over 65536"),
    (0x80040d44, "jal 0x80022814", "the screen's shake is drawn before the captivators move"),
    (0x80022820, "bne $v1, $v0, 0x80022984", "and draws only while the screen shakes"),
    (0x8004102c, "jal 0x80011ac0", "the effects are drawn after them"),
    (0x80011b10, "blez $v0, 0x80012b3c", "and draw only while one runs"),
    (0x80040ffc, "jal 0x800362e8", "then the ball's routine"),
    (0x800366f4, "jal 0x8003ba88", "moves the captivators"),
    (0x8003b644, "slti $v0, $v0, 5", "which the loader lifts record by record"),
    (0x8003cf34, "addiu $v0, $v0, 1", "and the move visits in that order"),
    (0x8003c72c, "jal 0x80047418", "and the wandering ball draws its way from the dice"),
    # The boost button.
    (0x80039294, "lh $v0, 250($v1)", "the walk over the things on the blocks takes each one's block's cell"),
    (0x8003929c, "sll $v0, $v0, 9", "times 512"),
    (0x800392a0, "sh $v0, 7304($gp)", "as the point its case measures from"),
    (0x80039b6c, "lh $v0, 7304($gp)", "which the boost button's case reads"),
    (0x80039bd0, "slt $v1, $v1, $v0", "and sinks while the ball is in reach of it"),
    (0x80039c08, "blez $v0, 0x80039c18", "and no lower than flat"),
    (0x80039c78, "beq $v0, $zero, 0x80039cac", "and back at full it is drawn as it is"),
    (0x80039ca4, "sra $v0, $v0, 4", "else its height scaled by its count over 16"),
    (0x80039ca8, "sh $v0, 7400($gp)", "on the axis of its face's normal"),
]
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
    ("on a block", "hedgehog.form", "type 42: form angle per frame", 0x8003932c, "addiu $a0, $v1, {}"),
    ("on a block", "hedgehog.form.past", "type 42: form changes past", 0x800393fc, "slti $v0, $v0, {}"),
    ("on a block", "hedgehog.orbit.brown", "type 42: orbit per frame, brown form", 0x8003935c, "addiu $a0, $v1, {}"),
    ("on a block", "hedgehog.orbit.green", "type 42: orbit per frame, green form", 0x800393b4, "addiu $a0, $v1, {}"),
    ("on a block", "teleporter.turn", "teleporter: turn per frame while on", 0x80039620, "addiu $a0, $v1, {}"),
    ("on a block", "exit.turn.open", "exit: turn per frame while open", 0x800396b0, "addiu $a0, $v1, {}"),
    ("on a block", "exit.turn", "exit: turn per frame while shut", 0x800396cc, "addiu $a0, $v1, {}"),
    ("on a block", "arrows.turn", "placeholder arrows: turn per frame", 0x80039af8, "addiu $a1, $v0, {}"),
    ("on a block", "button.sink", "boost button: sinks per frame near the ball", 0x80039c10, "addiu $v0, $v1, {}"),
    ("on a block", "button.rise", "boost button: rises per frame after", 0x80039c7c, "addiu $v0, $v1, {}"),
    ("on a block", "button.full", "boost button: full height", 0x80039c74, "slti $v0, $v0, {}"),

    ("captivators", "corkscrew.phase2", "corkscrew: phase 2 starts at, angle", 0x8003b86c, "addiu $v0, $zero, {}"),
    ("captivators", "corkscrew.phase1", "corkscrew: phase 1 starts at, angle", 0x8003b8b8, "addiu $v1, $zero, {}"),
    ("captivators", "corkscrew.phase0", "corkscrew: phase 0 starts at, angle", 0x8003b904, "addiu $v1, $zero, {}"),
    ("captivators", "corkscrew.bounce", "corkscrew: bounce angle per frame", 0x8003c274, "addiu $v0, $v0, {}"),
    ("captivators", "corkscrew.wrap", "corkscrew: bounce angle wraps at", 0x8003c28c, "slti $v0, $v0, {}"),
    ("captivators", "corkscrew.type", "corkscrew: the mover's case is this type", 0x8003c258, "addiu $v0, $zero, {}"),
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

    ("dice", "dice.seed", "seeded with this as a level starts", 0x80025058, "addiu $a0, $zero, {}"),
    ("dice", "dice.plus", "a draw adds this after it multiplies", 0x8004742c, "addiu $v1, $a1, {}"),

    ("laser", "laser.reach", "a stretch reaches this far along the beam from its cell's centre, units", 0x80028578, "addiu $t2, $a0, {}"),
    ("laser", "laser.reach.back", "and this far back", 0x8002857c, "addiu $t1, $a0, {}"),
    ("laser", "laser.nozzle", "each of the four lines is this far off the axis, units", 0x800285d8, "addiu $a2, $a2, {}"),
    ("laser", "laser.nozzle.back", "or this far", 0x800285ec, "addiu $a2, $a2, {}"),
    ("laser", "laser.width", "a line's two quads reach this far either side of it, units", 0x80028600, "addiu $v1, $a3, {}"),
    ("laser", "laser.width.back", "and this far the other side", 0x80028604, "addiu $v0, $a3, {}"),
    ("laser", "laser.colour.0a", "circuit 0: its level shifted this far is one channel", 0x8002818c, "sll $v1, $v0, {}"),
    ("laser", "laser.colour.0b", "circuit 0: and this far another", 0x80028190, "sll $v0, $v0, {}"),
    ("laser", "laser.colour.1", "circuit 1: its level shifted this far", 0x800281a4, "sll $v0, $v0, {}"),
    ("laser", "laser.colour.2", "circuit 2: its level shifted this far", 0x800281b0, "sll $v0, $v0, {}"),
    ("laser", "laser.colour.3", "circuit 3: its level shifted this far", 0x800281bc, "sll $v0, $v0, {}"),
    ("laser", "laser.step", "each line steps this many entries of its table a frame", 0x8005194c, "addi $s5, $s5, {}"),
    ("laser", "laser.mode", "the draw mode's low half, whose bits 5 and 6 are the blend", 0x800518f0, "ori $a2, $a2, {}"),
    ("laser", "laser.lay", "the loader lays this between a beam's ends at load", 0x80035a94, "addiu $t3, $zero, {}"),
]
MULTIPLIERS = [
    ("on a block", "coin.bob.reach", "coin, key, sunglasses: bob's reach, units", 0x800398e0, 3, "v0", "v1"),
    ("on a block", "fruit.bob.reach", "fruit: bob's reach, units", 0x800397c0, 3, "v0", "v1"),
    ("on a block", "fruit.tilt.reach", "fruit: tilt's reach, angle", 0x80039810, 5, "v0", "v1"),
    ("on a block", "hedgehog.orbit.radius", "type 42: orbit's radius, units", 0x800394f0, 5, "v0", "v1"),
    ("captivators", "captivator.standoff", "stand this far off the block's centre, units", 0x8003b720, 5, "a0", "v0"),
    ("captivators", "star50.travel", "slow star: travels per frame, units", 0x8003bcbc, 4, "v1", "v0"),
    ("captivators", "wheel.travel", "wheel: rolls per frame, units", 0x8003bf10, 6, "v0", "v1"),
    ("captivators", "star52.sway.reach", "fast star: sways this far either way, units", 0x8003c008, 5, "v1", "v1"),
    ("captivators", "corkscrew.rise", "corkscrew: rises this far, units", 0x8003c3a0, 5, "a0", "v1"),
    ("captivators", "corkscrew.rise.y", "corkscrew: rises this far along the second axis, units", 0x8003c448, 5, "a0", "v1"),
    ("captivators", "corkscrew.rise.z", "corkscrew: and its third", 0x8003c4f0, 5, "a0", "v1"),
    ("captivators", "corkscrew.spin", "corkscrew: spins this much times the cosine per frame", 0x8003e474, 5, "v0", "a2"),
    ("captivators", "corkscrew.drop", "corkscrew: drawn this far nearer its face than its entry, units", 0x8003e5d8, 6, "v1", "v1"),
    ("captivators", "ball53.lurch.reach", "wandering ball: lurch's reach, units", 0x8003c98c, 2, "v0", "v1"),
    ("captivators", "ball53.dash", "wandering ball: dashes per frame, units", 0x8003cc40, 6, "v1", "v0"),
]
DIVISORS = []
GREYS = []
SCANS = []

# The table of brightness a beam's lines step through, from its first byte to
# the one past its last, each an address built by a lui and an addiu.
LASER_LEVELS = ((0x800280dc, 0x800280e0), (0x800280d4, 0x800280d8))
LASER_CIRCUITS = [["laser.colour.0a", "laser.colour.0b"], ["laser.colour.1"],
                  ["laser.colour.2"], ["laser.colour.3"]]
CHANNEL = 8          # bits to a channel of a colour word, red lowest
LEVEL_BITS = 5       # the depth the GPU draws a colour at

# The one reach that is a square held in two halves of a word.
BUTTON_REACH = (0x80039bbc, "lui $v1, {}", 0x80039bc0, "ori $v1, $v1, {}")

# What a draw multiplies the dice's state by, held in two halves of a word.
DICE_TIMES = (0x80047418, "lui $v1, {}", 0x80047420, "ori $v1, $v1, {}")

# The two routines that build a spin from three angles, named by the product
# each makes, Rx·Ry·Rz or Rz·Ry·Rx, and where each type that turns has its
# spin built.
SPINS = {0x80060a38: "xyz", 0x80060cc8: "zyx"}
SPUN_AT = {
    **dict.fromkeys((5, 7, 26, 36), 0x80039b38),
    **dict.fromkeys((31, 32, 33, 34, 35, 37, 38, 42, *range(43, 48)), 0x80039ac0),
    50: 0x8003d7c8, 51: 0x8003ec88, 52: 0x8003f390, 53: 0x8003de4c, 56: 0x8003e4d0,
}
WORLD_AXES = (50, 52, 53)  # turned by their spin alone, with no face in it
QUARTERED = (51, 56)       # their first matrix turned about z before the spin
QUARTER = (0x8003b914, "addiu $a0, $zero, {}")


def spin_orders(code):
    """The product each type's spin is, by the routine its draw calls."""
    out = {}
    for t, at in SPUN_AT.items():
        routine = code.immediate(at, "jal {}")
        if routine not in SPINS:
            sys.exit(f"type {t}'s spin is built by 0x{routine:08x}, which this does not know")
        out[t] = SPINS[routine]
    return out


def laser(r):
    """What the game draws for a beam. A colour is given as what a line's level
    is multiplied by in red, green and blue."""
    for key in ("laser.reach", "laser.nozzle", "laser.width"):
        if r[key + ".back"] != -r[key]:
            sys.exit(f"{key} is {r[key]} one way and {r[key + '.back']} the other")
    if r["laser.reach"] * 2 != BLOCK:
        sys.exit(f"a beam's stretch reaches {r['laser.reach']} either way, not to its cell's faces")
    if (r["laser.mode"] >> 5) & 3 != ADD:
        sys.exit("a beam is not drawn in the blend that adds")
    colours = []
    for keys in LASER_CIRCUITS:
        colour = [0, 0, 0]
        for key in keys:
            channel, shift = divmod(r[key], CHANNEL)
            if channel > 2 or shift + LEVEL_BITS > CHANNEL:
                sys.exit(f"{key} shifts a level by {r[key]}, out of any one channel")
            colour[channel] = 1 << shift
        colours.append(colour)
    levels = r["laser.levels"]
    if max(levels) >= 1 << LEVEL_BITS:
        sys.exit(f"the beam's table holds a level of {max(levels)}")
    return {"reach": r["laser.reach"], "nozzle": r["laser.nozzle"],
            "width": r["laser.width"] - r["laser.width.back"], "colours": colours,
            "levels": levels, "step": r["laser.step"], "add": True}
