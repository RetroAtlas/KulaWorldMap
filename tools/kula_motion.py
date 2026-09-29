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
from kula_disc import EXE, EXE_BASE, THEMES, open_disc
from mips import Machine, decode

TURN = 4096          # the angle that is one full turn
BLOCK = 512          # units across a block
HZ = 60
PHASES = 4           # the values a phase field takes
SPIKE_FRAMES = 32    # frames in the moving spikes' mesh, flat to full

# What has to be there for the numbers below to mean what the doc says: a
# level's frame loop waits once a pass, for a flag a callback sets, and the
# words that would halve the rate or pick another view are never written, so
# they keep the zero the executable loads with.
CHECKS = [
    (0x80040a78, "addiu $a0, $a0, -588", "before its frame loop a level installs the callback at 0x8003fdb4"),
    (0x80040a7c, "jal 0x80065e28", "through the system library"),
    (0x8003fdbc, "sw $v0, -17288($at)", "which sets the flag at 0x800cbc78"),
    (0x80040b04, "jal 0x80051d08", "and each pass of the loop waits once"),
    (0x80051d18, "beq $t1, $zero, 0x80051d10", "until the flag is set"),
    (0x80040ad0, "lw $v0, 22316($v0)", "the half-rate word the loop reads is 0x800a572c"),
    (0x80039608, "lw $v0, 13264($v0)", "the view word the updates read is 0x800a33d0"),
    # The laser: built at load by 0x800280d0, drawn every frame by 0x80051754.
    (0x80028214, "addiu $v0, $zero, 8", "the laser builder takes the records of kind 8"),
    (0x8002833c, "addiu $v0, $s5, 6", "and keeps where the record says it is lit, f3"),
    (0x8002844c, "lh $v1, 44($s5)", "the colour is the circuit, a word of the second slot"),
    (0x8002856c, "addiu $s2, $s2, 1", "a beam along x is laid a cell at a time from its first end up"),
    (0x800286b0, "addiu $s3, $s3, 1", "and along y"),
    (0x800287f8, "addiu $s4, $s4, 1", "and along z"),
    (0x800284e0, "jal 0x80047418", "each of its four lines starts its brightness at random"),
    (0x8002815c, "beq $s1, $zero, 0x80028184", "circuit 0's colour is two shifts"),
    (0x80028198, "or $v0, $v0, $v1", "put together"),
    (0x8002814c, "beq $s1, $t3, 0x8002819c", "circuit 1's is one"),
    (0x8002816c, "beq $s1, $t2, 0x800281a8", "and circuit 2's"),
    (0x80028174, "beq $s1, $t1, 0x800281b4", "and circuit 3's"),
    (0x8005190c, "lhu $fp, 0($fp)", "the renderer reads whether a beam is lit"),
    (0x80051914, "bne $fp, $zero, 0x8005192c", "and draws only one that is"),
    (0x80051a18, "sra $t9, $t9, 6", "filing a cell's stretch by the depth of its centre"),
    (0x800518ec, "lui $a2, 0xe100", "in a draw mode set for the purpose"),
    (0x80051b2c, "lui $at, 0x2a00", "each line is two flat quads blended with what is behind"),
    (0x80051be4, "lui $at, 0x4200", "and a flat line down the middle, blended the same way"),
    (0x80051c44, "bne $fp, $zero, 0x80051c14", "every frame a dark beam's cells"),
    (0x80051c38, "addiu $t4, $zero, -1", "are written empty"),
    (0x80051c9c, "beq $fp, $zero, 0x80051c6c", "and a lit one's"),
    (0x80051c90, "addiu $t4, $zero, -2", "are written as beam"),
    # A captivator is drawn where its entry is: each type's draw copies the
    # entry's position and turns it into the view with nothing added, save
    # the corkscrew's, which takes a multiple of its normal off first.
    (0x8003d6d4, "addiu $s5, $s4, -32", "the draw's s5 is an entry's position"),
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
    # The game's one random routine, and the one draw from it that moves a
    # thing: the level's routine seeds it once, before its frame loop, and in
    # the loop nothing else draws from it while the ball stands still, since
    # the screen's shake and the effects a pickup starts draw only while they
    # run; the captivators move in the order the loader lifted them.
    (0x80040690, "jal 0x80040718", "the play loop runs a level's routine"),
    (0x80040748, "jal 0x80025054", "which first calls the routine"),
    (0x80025064, "jal 0x8004740c", "that seeds the dice"),
    (0x80041c34, "beq $t2, $zero, 0x80040aa0", "and then loops a frame at a time from after it"),
    (0x8004740c, "sw $a0, 2380($gp)", "whose state is one word"),
    (0x80047430, "andi $v0, $v1, -1", "a draw of n is n times the state's low half"),
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
    # The boost button: a count that sinks while the ball is in reach and
    # rises after, scaling the model's height along its normal, and left
    # unscaled once it is back to full.
    (0x80039bd0, "slt $v1, $v1, $v0", "the boost button sinks while the ball is in reach"),
    (0x80039c08, "blez $v0, 0x80039c18", "and no lower than flat"),
    (0x80039c78, "beq $v0, $zero, 0x80039cac", "and back at full it is drawn as it is"),
    (0x80039ca4, "sra $v0, $v0, 4", "else its height scaled by its count over 16"),
    (0x80039ca8, "sh $v0, 7400($gp)", "on the axis of its face's normal"),
    # The ball's position is where it touches its face: the start puts it at
    # its cell and half a block along the face's normal, and the button and
    # the invisible block's light both measure from it.
    (0x800361d0, "sll $v0, $v0, 9", "the start puts the ball's position at its cell"),
    (0x800361c0, "lh $v1, -24272($v1)", "and along its face's normal"),
    (0x800361cc, "sll $v1, $v1, 8", "half a block, where it touches the face"),
    (0x80039b74, "lh $v1, -24240($v1)", "a boost button measures its reach from that position"),
    (0x800368f0, "lh $v0, -24240($v0)", "and the light from it and a platform's travel"),
    # A device that is on turns a light over every so many frames: it makes
    # one from its cell and face, a list of faces with a level at each
    # corner, gives it its colour while it holds it, and lets it go when it
    # is turned off; each frame the faces of every light are shaded between
    # their corners with the light added, before the walk that turns it over.
    (0x8002d3d4, "addiu $v0, $v0, -5", "the draw of a thing on a block sends it on by its type"),
    (0x8002d3f8, "lw $v0, 116($at)", "through a table of cases"),
    (0x8002d468, "jal 0x8002e3d8", "a teleporter's case makes a light"),
    (0x8002d594, "jal 0x8002e3d8", "and an exit's"),
    (0x8002d660, "jal 0x8002e3d8", "and a switch's"),
    (0x8002d41c, "bne $v1, $s4, 0x8002d6e0", "only while its f4 is 1"),
    (0x8002d6ec, "jal 0x8002d994", "and lets it go otherwise"),
    (0x8002d424, "lhu $v0, 30($s2)", "counting in the last pad of its slot"),
    (0x8002d48c, "sh $v0, 32($s2)", "and keeping the light in the kind word of the slot after"),
    (0x8002d6d0, "jal 0x8002f2b4", "and gives the light it holds its colour"),
    (0x8002f2c0, "sw $a1, -3708($at)", "the first word of the light's entry"),
    (0x800297c4, "sh $t2, 30($a0)", "the loader starts the count"),
    (0x800297c8, "sh $t0, 32($a0)", "holding no light"),
    (0x8002a4ac, "jal 0x80051020", "the frame adds the lights to their faces"),
    (0x8002a614, "jal 0x80036958", "before the walk that turns them over"),
    (0x800369b4, "jal 0x80039200", "which is the walk over the things on the blocks"),
    (0x80039e5c, "jal 0x8002d2ac", "that draws each"),
    (0x8002f1b8, "beq $v0, $v1, 0x8002f2a8", "a light takes a face only where the lattice holds a block"),
    (0x8002f1d8, "beq $a3, $v1, 0x8002f2a8", "that has the face"),
    (0x8002f1e0, "lbu $v1, 6($a3)", "and turns the levels by the face's turn"),
    (0x80051098, "sw $zero, 0($a3)", "a corner of level 0 takes nothing"),
    (0x800510e4, "sw $t7, 8($a3)", "of level 2 the light's colour"),
    (0x800510bc, "sll $s0, $t7, 4", "and of level 1 the colour sixteen times over"),
    (0x800510e8, "mvmva", "times a matrix"),
    (0x800510f8, "srl $t7, $t7, 4", "and back down by sixteen"),
    (0x80051118, "sw $t7, 4($a3)", "each channel's lowest bit cleared"),
    (0x80051180, "lw $t6, 0($t6)", "each corner takes its level by its two bits"),
    (0x80051188, "add $t5, $t5, $t6", "added to its colour"),
    (0x80051198, "ori $t5, $t5, 255", "a channel that passes 255 stands at it"),
    (0x800511b4, "and $t5, $t5, $v0", "less its lowest bit"),
    # The shadow under the ball and the captivators: a square of four
    # vertices, laid flat on the face and dropped where it faces away,
    # textured with one of two sprites past the group the .GGI's header
    # bounds last, and taken away from what is behind it, as strong as the
    # colour each draw writes into it.
    (0x80022f28, "sw $v0, 10240($gp)", "the parser keeps the .GGI header's sixth bound"),
    (0x800290f8, "lw $v1, 22328($v1)", "which the shadow's sprites are counted past"),
    (0x800290ec, "addiu $v0, $zero, 44", "each shadow is a textured quad"),
    (0x800292f4, "jal 0x8005f8c8", "semi-transparent where its sprite is"),
    (0x80051ebc, "nclip", "the square's corners are tested for their winding"),
    (0x80051edc, "bgtz $v0, 0x80051eec", "and it is drawn only where they wind toward the view"),
    (0x8002c990, "sb $s4, 4($s0)", "a captivator's shadow is as strong as its caller says"),
    (0x8002cff8, "sb $s4, 4($s0)", "and the ball's"),
    (0x8003db78, "addiu $v0, $zero, 1024", "the square is laid flat by a quarter turn"),
    (0x8003dd50, "sw $zero, 72($sp)", "the slow star's is the round one"),
    (0x8003e3d4, "sw $zero, 72($sp)", "the wandering ball's"),
    (0x8003f91c, "sw $zero, 72($sp)", "the fast star's"),
    (0x8003eb40, "sw $zero, 72($sp)", "the corkscrew's"),
    (0x80032450, "sw $zero, 72($sp)", "and the ball's"),
    (0x8003f0bc, "lhu $v0, -23528($at)", "the wheel's is turned by its third angle"),
    (0x8003f0cc, "jal 0x80060cc8", "after the quarter turn, so about its normal"),
    (0x8003cdac, "sh $v0, -23528($at)", "which is the angle the wheel's turns step"),
    (0x8003b7c4, "addiu $v0, $s4, 24", "the loader copies an entry's position"),
    (0x8003b7bc, "addiu $v1, $s4, 32", "into its home"),
    (0x8003e87c, "addu $v0, $v0, $fp", "and the corkscrew's shadow lies under its home"),
    (0x8003e9e4, "lh $v0, -23414($at)", "as strong as the corkscrew's bounce"),
    (0x8003ea08, "jal 0x8005fb58", "less a multiple of its sine"),
    (0x80031f3c, "jal 0x800603f8", "the ball's shadow is widened by the landing's squash"),
    (0x80031f54, "jal 0x800603f8", "and by the breath's"),
    # The invisible block's light: every frame it measures each corner of
    # the invisible faces in a box of cells about where the ball touches its
    # face, and a face with a corner lit is drawn shaded between its corners,
    # where the rest are drawn flat or not at all.
    (0x8002a4a0, "addiu $a0, $a0, 23128", "the frame hands the light its struct"),
    (0x8002a4a4, "jal 0x80051318", "and runs it"),
    (0x80036914, "sw $v0, 23128($at)", "into which the ball's routine writes where it touches its face"),
    (0x80027c14, "sw $v0, 23140($at)", "the loader keeps the near distance there"),
    (0x80027c20, "sw $v0, 23144($at)", "and the far one"),
    (0x80027c28, "sw $zero, 23148($at)", "and no flag"),
    (0x80027c5c, "bne $v0, $t2, 0x80027ca0", "a record of the settings' kind"),
    (0x80027c78, "lh $v0, 4($v1)", "whose first field"),
    (0x80027c80, "bne $v0, $a0, 0x80027ca0", "holds the value"),
    (0x80027c8c, "sw $t0, 23140($at)", "keeps its own near distance"),
    (0x80027c94, "sw $a3, 23144($at)", "and far one"),
    (0x80027c9c, "sw $v0, 23148($at)", "and the flag"),
    (0x800513e0, "lw $a3, 12($a0)", "the light reads the near distance"),
    (0x800513e4, "lw $t0, 16($a0)", "and the far one"),
    (0x8005134c, "lw $t9, 20($a0)", "and the flag"),
    (0x80051418, "sub $s3, $a0, $t0", "its box starts at the ball less the far distance"),
    (0x8005141c, "addi $s3, $s3, 256", "in the cell that falls in"),
    (0x80051424, "srl $s3, $s3, 9", "a cell to 512 units"),
    (0x8005142c, "slti $at, $s3, 34", "within the lattice"),
    (0x80051444, "add $s4, $a0, $t0", "and ends at the ball plus the far distance"),
    (0x80051594, "add $s6, $s2, $t5", "each face's four vertices"),
    (0x800515d0, "sqr", "are measured by their squares"),
    (0x800515f0, "mtc2 $s3, lzcs", "and the root's row is the count of leading zeros in the sum"),
    (0x80051604, "sll $s5, $s4, 4", "four words a row"),
    (0x80051614, "and $s3, $s3, $s7", "the row's mask takes the sum's top bit off"),
    (0x80051618, "multu $s6, $s3", "and its step times what is left"),
    (0x80051630, "srlv $s6, $s3, $s6", "shifted down as far as the top bit is up"),
    (0x80051640, "add $s3, $s3, $s5", "is added to its root"),
    (0x80051644, "slt $at, $a3, $s3", "a corner past the near distance"),
    (0x80051410, "divu $s3, $s4", "is lit less by the fixed point over the stretch to the far one"),
    (0x80051658, "multu $s3, $t2", "times how far past it the corner is"),
    (0x8005166c, "sll $s4, $s4, 9", "shifted down across the product's two words"),
    (0x80051674, "sub $s3, $s5, $s3", "taken from full"),
    (0x80051678, "bgtz $s3, 0x80051684", "and no lower than nothing"),
    (0x80051684, "beq $t9, $zero, 0x80051690", "and where the flag is set"),
    (0x8005168c, "sub $s3, $s4, $s3", "taken from full again"),
    (0x80051690, "beq $s3, $zero, 0x800516ac", "a corner lit at all"),
    (0x80051698, "ori $t8, $t8, 1", "draws its face"),
    (0x8005157c, "addiu $t8, $zero, 22", "shaded between its corners"),
    (0x800516ac, "sw $s3, 16($s4)", "whose colours the four are"),
    (0x80056870, "andi $t9, $t1, 1", "the transform draws a face whose first bit is set"),
    (0x800568d0, "andi $t9, $ra, 16", "and shades one whose fifth is between its corners"),
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

    ("shadows", "shadow.sprite", "the round one is this sprite past the .GGI header's sixth bound", 0x80029098, "addiu $s1, $s5, {}"),
    ("shadows", "shadow.sprites", "and the square one the next, of this many", 0x80029374, "slti $v0, $s5, {}"),
    ("shadows", "shadow.drop.50", "slow star: lies this far along its normal from its entry, units", 0x8003db5c, "addiu $a3, $zero, {}"),
    ("shadows", "shadow.drop.51", "wheel: lies this far along its normal from its entry, units", 0x8003f07c, "addiu $a3, $zero, {}"),
    ("shadows", "shadow.drop.52", "fast star: lies this far along its normal from its entry, units", 0x8003f728, "addiu $a3, $zero, {}"),
    ("shadows", "shadow.drop.53", "wandering ball: lies this far along its normal from its entry, units", 0x8003e1e0, "addiu $a3, $zero, {}"),
    ("shadows", "shadow.strength.50", "slow star: strength, of 128", 0x8003dd3c, "addiu $v0, $zero, {}"),
    ("shadows", "shadow.strength.51", "wheel: strength, of 128", 0x8003f280, "addiu $v0, $zero, {}"),
    ("shadows", "shadow.strength.52", "fast star: strength, of 128", 0x8003f908, "addiu $v0, $zero, {}"),
    ("shadows", "shadow.strength.53", "wandering ball: strength, of 128", 0x8003e3c0, "addiu $v0, $zero, {}"),
    ("shadows", "shadow.sprite.51", "wheel: its sprite, of the two", 0x8003f288, "addiu $v0, $zero, {}"),
    ("shadows", "shadow.strength.56", "corkscrew: strength on its face, of 128", 0x8003ea2c, "addiu $v0, $zero, {}"),
    ("shadows", "shadow.ball.top", "ball: fades to nothing this far off its face, units", 0x80031f30, "addiu $v0, $zero, {}"),
    ("shadows", "shadow.ball.shift", "ball: its height short of that, shifted up this far", 0x80032458, "sll $v1, $v1, {}"),

    ("invisible block", "light.kind", "the light takes blocks of this kind", 0x80051558, "addiu $s4, $zero, {}"),
    ("invisible block", "light.near", "full within this far of the ball, units", 0x80027c0c, "addiu $v0, $zero, {}"),
    ("invisible block", "light.far", "and nothing from this far", 0x80027c18, "addiu $v0, $zero, {}"),
    ("invisible block", "light.full", "full is this, of 128", 0x80051654, "addiu $s3, $zero, {}"),
    ("invisible block", "light.full.fade", "and fades from this", 0x8005165c, "addiu $s5, $zero, {}"),
    ("invisible block", "light.full.turned", "and is taken from this where the flag is set", 0x80051688,
     "addiu $s4, $zero, {}"),
    ("invisible block", "light.scale", "over the stretch between the two, this in the top half of a word", 0x80051408,
     "lui $s3, {}"),
    ("invisible block", "light.bits", "the product shifted down this far", 0x80051664, "srl $s3, $s3, {}"),
    ("invisible block", "light.bits.high", "its high word shifted up this far", 0x8005166c, "sll $s4, $s4, {}"),
    ("invisible block", "light.turned.kind", "a record of this kind", 0x80027c34, "addiu $t2, $zero, {}"),
    ("invisible block", "light.turned.value", "whose first field is this turns the light round", 0x80027c38,
     "addiu $a0, $zero, {}"),
    ("invisible block", "light.turned.near", "nothing within this far, units", 0x80027c40, "addiu $t0, $zero, {}"),
    ("invisible block", "light.turned.far", "and full from this far", 0x80027c44, "addiu $a3, $zero, {}"),

    ("devices' light", "glow.every", "a teleporter turns its light over every this many frames", 0x8002d440,
     "addiu $v0, $zero, {}"),
    ("devices' light", "glow.every.exit", "an exit", 0x8002d56c, "addiu $v0, $zero, {}"),
    ("devices' light", "glow.every.switch", "a switch", 0x8002d638, "addiu $v0, $zero, {}"),
    ("devices' light", "glow.every.load", "and the loader starts the count at this", 0x80029764,
     "addiu $t2, $zero, {}"),
    ("devices' light", "glow.part.x", "level 1 is the colour times this of 4096 in red", 0x8005106c,
     "addiu $t7, $zero, {}"),
    ("devices' light", "glow.part.y", "in green", 0x80051078, "addiu $t7, $zero, {}"),
    ("devices' light", "glow.part.z", "in blue", 0x80051084, "addiu $t7, $zero, {}"),

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
]

# The table of brightness a beam's lines step through, from its first byte to
# the one past its last, each an address built by a lui and an addiu.
LASER_LEVELS = ((0x800280dc, 0x800280e0), (0x800280d4, 0x800280d8))
LASER_CIRCUITS = [["laser.colour.0a", "laser.colour.0b"], ["laser.colour.1"],
                  ["laser.colour.2"], ["laser.colour.3"]]
CHANNEL = 8          # bits to a channel of a colour word, red lowest
LEVEL_BITS = 5       # the depth the GPU draws a colour at
ADD = 1              # the blend that adds a quad to what is behind it

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
    ("captivators", "corkscrew.drop", "corkscrew: drawn this far nearer its face than its entry, units", 0x8003e5d8, 6, "v1", "v1"),
    ("captivators", "ball53.lurch.reach", "wandering ball: lurch's reach, units", 0x8003c98c, 2, "v0", "v1"),
    ("captivators", "ball53.dash", "wandering ball: dashes per frame, units", 0x8003cc40, 6, "v1", "v0"),
    ("shadows", "shadow.corkscrew.drop", "corkscrew: lies this far from its home toward the block, units", 0x8003e8e0, 6, "v1", "v0"),
    ("shadows", "shadow.corkscrew.fade", "corkscrew: weaker by this times the sine of its bounce", 0x8003ea10, 3, "v0", "v1"),
]

# The one reach that is a square held in two halves of a word.
BUTTON_REACH = (0x80039bbc, "lui $v1, {}", 0x80039bc0, "ori $v1, $v1, {}")

# What a draw multiplies the dice's state by, held in two halves of a word.
DICE_TIMES = (0x80047418, "lui $v1, {}", 0x80047420, "ori $v1, $v1, {}")

# A divisor the compiler turned into a multiply by a reciprocal and a shift:
# the two halves of the reciprocal and the shift of the high word.
DIVISORS = [
    ("the ball", "ball.breathe.over", "over this", 0x80032680, "lui $a0, {}", 0x80032684, "ori $a0, $a0, {}",
     0x800326a8, "sra $v1, $a2, {}"),
    ("shadows", "shadow.ball.over", "ball: and divided by this", 0x800323d4, "lui $s2, {}", 0x800323d8,
     "ori $s2, $s2, {}", 0x80032494, "sra $v0, $t8, {}"),
]

# The shadow's four vertices, each x, y, z and a pad, where both draws load
# them from.
SHADOW_SQUARE = (0x8002c8d0, 0x8002c8d4)

# The square root the invisible block's light takes: a table of four words a
# row, by the count of leading zeros in the square, where a lui and an addiu
# build its address. The rows kept are those for a square of 2^8 or more;
# past them the words are not the root's, and a square that small is well
# within any near distance.
LIGHT_ROOT = (0x800513f8, 0x800513fc)
ROOT_ROWS = 24
INVISIBLE = 3

# A device's light: the routine that makes it from a cell and a face, the one
# that adds a face to it where the face is there, and the three cases of the
# draw, with where each builds the address of its table of colours, a word
# a colour, four a world by the circuit or one a world.
GLOW_MAKE = 0x8002e3d8
GLOW_FACE = 0x8002f16c
GLOW_CASES = {5: 0x8002d408, 7: 0x8002d534, 9: 0x8002d600}
GLOW_TYPES = (0x80010074, 5, 24)  # the draw's table of cases: where, the first type, how many
GLOW_COLOURS = {5: ((0x8002d514, 0x8002d51c), 4), 7: ((0x8002d5ec, 0x8002d5f4), 1),
                9: ((0x8002d6c4, 0x8002d6cc), 4)}
GLOW_LEVELS = 3           # a corner's level is 0, 1 or 2
MVMVA_SF = 1 << 19        # the command's bit that shifts its products down by 12
FACES = 6


class Code:
    def __init__(self, blob):
        self.blob = blob

    def word(self, addr):
        return struct.unpack_from("<I", self.blob, addr - EXE_BASE)[0]

    def holds(self, addr):
        return EXE_BASE <= addr and addr + 4 <= EXE_BASE + len(self.blob)

    def text(self, addr):
        return decode(self.word(addr), addr)[0]

    def immediate(self, addr, pattern):
        text = self.text(addr)
        rx = "^" + re.escape(pattern).replace(r"\{\}", r"(-?(?:0x)?[0-9a-f]+)") + "$"
        m = re.match(rx, text)
        if not m:
            sys.exit(f"0x{addr:08x} reads `{text}`, not `{pattern}`")
        return int(m.group(1), 0) if m.lastindex else None

    def address(self, lui, addiu):
        """The address a lui and the addiu or load after it build, in RAM's mirror."""
        hi = re.match(r"lui \$\w+, (0x[0-9a-f]+)$", self.text(lui))
        lo = re.match(r"(?:addiu \$\w+, \$\w+, |lw \$\w+, )(-?\d+)", self.text(addiu))
        if not hi or not lo:
            sys.exit(f"0x{lui:08x} and 0x{addiu:08x} read `{self.text(lui)}` and `{self.text(addiu)}`, not an address")
        return (0x80000000 | (int(hi.group(1), 0) << 16)) + int(lo.group(1))

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
    hi, hp, lo, lp = DICE_TIMES
    out["dice.times"] = (code.immediate(hi, hp) << 16) | code.immediate(lo, lp)
    for _, key, _, *args in DIVISORS:
        out[key] = code.divisor(*args)
    start, end = (code.address(*pair) for pair in LASER_LEVELS)
    out["laser.levels"] = list(code.blob[start - EXE_BASE:end - EXE_BASE])
    out["shadow.half"] = shadow_half(code)
    out["light.root"] = root_table(code)
    out["glow"], out["glow.colours"] = glow(code, out)
    return out


def shadow_half(code):
    """How far the shadow's square reaches either way of its middle, from the
    four vertices both draws load: every corner of a square, flat in y."""
    at = code.address(*SHADOW_SQUARE) - EXE_BASE
    corners = [struct.unpack_from("<4h", code.blob, at + 8 * i) for i in range(4)]
    half = abs(corners[0][0])
    if sorted((x, z) for x, _, z, _ in corners) != [(-half, -half), (-half, half), (half, -half), (half, half)] \
            or any(y or pad for _, y, _, pad in corners):
        sys.exit(f"the shadow's vertices are {corners}, not a square flat in y")
    return half


def root_table(code):
    """The rows of the light's square root, by the count of leading zeros in
    the square: the root of the power of two the square is past, and how far
    it is to the root of the next. A row's mask takes that power of two off
    the square, which is what lets a row be read as the two numbers."""
    at = code.address(*LIGHT_ROOT) - EXE_BASE
    rows = []
    for zeros in range(ROOT_ROWS):
        step, mask, root, pad = struct.unpack_from("<4I", code.blob, at + 16 * zeros)
        if mask != (1 << (31 - zeros)) - 1 or pad:
            sys.exit(f"the root's row for {zeros} leading zeros masks with 0x{mask:x} and pads with {pad}")
        rows.append([root, step])
    return rows


def light(r):
    """How the game lights an invisible block near the ball: a corner is full
    within the near distance and falls in fixed point to nothing at the far
    one, measured by the game's own square root; and on a level whose
    settings record carries the value in its first field, the other way
    round, with distances of its own."""
    if r["light.kind"] != INVISIBLE:
        sys.exit(f"the light takes blocks of kind {r['light.kind']}, not the invisible block's")
    if not r["light.full"] == r["light.full.fade"] == r["light.full.turned"]:
        sys.exit("the light is not full at the same brightness where it is full, fades and turns round")
    if r["light.bits"] + r["light.bits.high"] != 32 or r["light.scale"] << 16 != r["light.full"] << r["light.bits"]:
        sys.exit("the light's fixed point does not come back to full over the stretch")
    return {"near": r["light.near"], "far": r["light.far"], "full": r["light.full"],
            "bits": r["light.bits"], "root": r["light.root"],
            "turned": {"kind": r["light.turned.kind"], "value": r["light.turned.value"],
                       "near": r["light.turned.near"], "far": r["light.turned.far"]}}


def glow_spill(code):
    """What a device's light takes, for each face it can stand on: groups of
    faces tried in order until one is there, the thing's own face first and
    then one group for each of its four edges. A face is an offset from the
    thing's cell, the face of the block there, and a level at each of its
    corners in the order of its texture's first turn. Each group is read by
    running the routine that makes a light, answering that no face is there
    and then that each in turn is, which is how the groups are told apart."""
    m = Machine(code)
    origin = (10, 10, 10)
    out = []
    for face in range(FACES):
        def trace(there):
            calls = []

            def add(args, words):
                x, y, z, f = args
                call = [x - origin[0], y - origin[1], z - origin[2], f, words]
                calls.append(call)
                return 0 if there(call) else 1
            m.run(GLOW_MAKE, [*origin, face], [], {GLOW_FACE: add})
            return calls
        tried = trace(lambda call: False)
        heads = trace(lambda call: True)
        starts = [tried.index(h) for h in heads]
        groups = [tried[a:b] for a, b in zip(starts, starts[1:] + [len(tried)])]
        if groups[0] != [[0, 0, 0, face, [GLOW_LEVELS - 1] * 4]]:
            sys.exit(f"a light on face {face} does not start from that face at full")
        for g, group in enumerate(groups):
            for k, call in enumerate(group):
                expect = [c for i, grp in enumerate(groups) for j, c in enumerate(grp) if i != g or j <= k]
                if trace(lambda c: c == call) != expect:
                    sys.exit(f"a light on face {face} does not stop at the face it finds in group {g}")
                if any(v not in range(GLOW_LEVELS) for v in call[4]) or call[3] not in range(FACES):
                    sys.exit(f"a light on face {face} tries {call}")
        out.append(groups)
    return out


def glow(code, r):
    """A device's light: how often it is turned over, what level 1 is of the
    colour, what the light takes for each face, and the colours by type."""
    everies = {r[k] for k in ("glow.every", "glow.every.exit", "glow.every.switch", "glow.every.load")}
    parts = {r[k] for k in ("glow.part.x", "glow.part.y", "glow.part.z")}
    if len(everies) != 1 or len(parts) != 1:
        sys.exit(f"the devices' light turns over every {everies} frames and takes {parts} for level 1")
    if not code.word(0x800510e8) & MVMVA_SF:
        sys.exit("level 1's product is not shifted down by 12")
    at, first, count = GLOW_TYPES
    for typ in range(first, first + count):
        case = 0x80000000 | code.word(at + 4 * (typ - first))
        if (typ in GLOW_CASES) != (case in GLOW_CASES.values()) or GLOW_CASES.get(typ, case) != case:
            sys.exit(f"type {typ} goes to the case at 0x{case:08x}")
    colours = {}
    for t, (at, each) in GLOW_COLOURS.items():
        base = code.address(*at)
        words = [code.word(base + 4 * i) for i in range(len(THEMES) * each)]
        colours[t] = [[[(w >> s) & 255 for s in (0, 8, 16)] for w in words[i * each:(i + 1) * each]]
                      for i in range(len(THEMES))]
    return {"every": everies.pop(), "part": [parts.pop(), 1 << 12], "spill": glow_spill(code)}, colours


def laser(r):
    """What the game draws for a beam: every stretch reaches from its cell's
    centre to both faces, and carries four lines set square about the axis,
    each two flat quads crossed along it and a line down their middle, all
    added to what is behind, in the circuit's colour times a level each line
    steps through on its own. A colour is given as what the level is
    multiplied by in red, green and blue."""
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
    scales it. A type the loader lifts into an entry of its own says how far
    off its face the game draws the model's origin. A type the game draws a
    shadow under says which of the two sprites, how far off its face it lies
    and how strong it is, of 128. The dice are the game's random routine,
    which it seeds once as a level starts. The invisible block carries its
    light. What the devices' light takes is beside the types, with each
    device's colours by its type, by world and then by circuit where it has
    one, apart from the types, whose entries are what moves.
    """
    bob = {"rate": r["coin.bob"], "reach": r["coin.bob.reach"]}
    fruit = {"turn": r["fruit.turn"],
             "tilt": {"rate": r["fruit.tilt"], "reach": r["fruit.tilt.reach"]},
             "bob": {"rate": r["fruit.bob"], "reach": r["fruit.bob.reach"]}}
    pill = {"turn": r["pill.turn"], "flip": r["pill.flip"]}
    star50 = [r["star50.tumble.x"], r["star50.tumble.y"], r["star50.tumble.z"]]
    stand = r["captivator.standoff"] - BLOCK // 2
    types = {
        5: {"turn": r["teleporter.turn"]},
        10: {"press": {"start": r["button.start"], "full": r["button.full"],
                       "sink": r["button.sink"], "rise": r["button.rise"],
                       "reach": r["button.reach"]}},
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
    for t in (50, 51, 52, 53):
        types[t]["entry"] = {"stand": stand}
        types[t]["shadow"] = {"sprite": 0, "off": stand + r[f"shadow.drop.{t}"],
                              "strength": r[f"shadow.strength.{t}"]}
    types[51]["shadow"].update({"sprite": r["shadow.sprite.51"], "turns": True})
    types[56]["entry"] = {"stand": stand - r["corkscrew.drop"]}
    types[56]["shadow"] = {"sprite": 0, "off": stand - r["shadow.corkscrew.drop"],
                           "strength": r["shadow.strength.56"], "fade": r["shadow.corkscrew.fade"]}
    # the ball's lies as far toward the block from its middle as the middle
    # is off the face, so on the face
    types[30]["shadow"] = {"sprite": 0, "off": 0, "strength": 1 << r["shadow.ball.shift"],
                           "top": r["shadow.ball.top"], "over": r["shadow.ball.over"],
                           "squash": True}
    for t, entry in types.items():
        if "shadow" in entry and entry["shadow"]["sprite"] >= r["shadow.sprites"]:
            sys.exit(f"type {t}'s shadow is sprite {entry['shadow']['sprite']} of {r['shadow.sprites']}")
    kinds = {
        5: {"speed": platform_speed * r["platform.scale"] // HZ, "dwell": r["platform.dwell"]},
        7: {"cycle": [[s for s, _ in vanish_cycle(r, p)] for p in range(PHASES)],
            "level": [[v for _, v in vanish_cycle(r, p)] for p in range(PHASES)]},
        3: {"light": light(r)},
        8: laser(r),
    }
    colours = {str(t): r["glow.colours"][t] for t in sorted(r["glow.colours"])}
    return {"hz": HZ, "turn": TURN, "standoff": r["captivator.standoff"],
            "dice": {"seed": r["dice.seed"], "times": r["dice.times"], "plus": r["dice.plus"]},
            "shadow": {"half": r["shadow.half"]},
            "glow": {**r["glow"], "colours": colours},
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
    rows.append(("dice", "a draw multiplies the state by this", DICE_TIMES[0],
                 readings(code)["dice.times"]))
    for group, key, what, hi, hp, lo, lp, sa, sp in DIVISORS:
        rows.append((group, what, hi, code.divisor(hi, hp, lo, lp, sa, sp)))
    rows.append(("shadows", "the square reaches this far either way of its middle, units",
                 code.address(*SHADOW_SQUARE), readings(code)["shadow.half"]))
    rows.append(("invisible block", "rows of the square root it measures a corner by",
                 code.address(*LIGHT_ROOT), len(readings(code)["light.root"])))
    levels = readings(code)["laser.levels"]
    rows.append(("laser", f"steps in the beam's table, levels {min(levels)} to {max(levels)}",
                 code.address(*LASER_LEVELS[0]), len(levels)))
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
