#!/usr/bin/env python3
"""What the executable does to each thing every frame, read off its code.

    python3 tools/kula_motion.py            # every reading, with its address
    python3 tools/kula_motion.py --table    # the table the build ships

Every number is the immediate of one instruction or the multiplier a short
run of shifts and adds applies to a register, read by matching the
instruction it lives in, so a build that lays the code out differently stops
this with a message rather than yielding a number that looks like a reading.
The game runs its loop once per vertical blank.
"""
import argparse
import json
import math
import re
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_disc import EXE, EXE_BASE, THEMES, open_disc
from kula_level import BLOCK_KINDS, FACE, FACES, FIRST_RECORD, SIDE, STYLES, UNPLACED_KIND
from mips import Machine, decode

TURN = 4096          # the angle that is one full turn
BLOCK = 512          # units across a block
ONE = 4096           # a matrix's unit, 1.0 in the GTE's fixed point
HZ = 60
PHASES = 4           # the values a phase field takes
SPIKE_FRAMES = 32    # frames in the moving spikes' mesh, flat to full

# What has to be there for the numbers below to mean what the doc says.
CHECKS = [
    # The frame loop.
    (0x80040a78, "addiu $a0, $a0, -588", "before its frame loop a level installs the callback at 0x8003fdb4"),
    (0x80040a7c, "jal 0x80065e28", "through the system library"),
    (0x8003fdbc, "sw $v0, -17288($at)", "which sets the flag at 0x800cbc78"),
    (0x80040b04, "jal 0x80051d08", "and each pass of the loop waits once"),
    (0x80051d18, "beq $t1, $zero, 0x80051d10", "until the flag is set"),
    (0x80040ad0, "lw $v0, 22316($v0)", "the half-rate word the loop reads is 0x800a572c"),
    (0x80039608, "lw $v0, 13264($v0)", "the view word the updates read is 0x800a33d0"),
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
    (0x80035ab4, "bne $v1, $v0, 0x80035cac", "the loader's walk at load takes the records of kind 8 too"),
    (0x80035b2c, "sh $zero, 0($v0)", "lays a bare block at a beam's end"),
    (0x80035ca8, "sh $zero, 0($v1)", "and at its far end, the one store the three axes share"),
    (0x80035b68, "sh $t3, 0($v0)", "and the lit beam's word between"),
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
    # The ball's position.
    (0x800361d0, "sll $v0, $v0, 9", "the start puts the ball's position at its cell"),
    (0x800361c0, "lh $v1, -24272($v1)", "and along its face's normal"),
    (0x800361cc, "sll $v1, $v1, 8", "half a block, where it touches the face"),
    (0x80039b74, "lh $v1, -24240($v1)", "a boost button measures its reach from that position"),
    (0x800368f0, "lh $v0, -24240($v0)", "and the light from it and a platform's travel"),
    # The ball's moves.
    (0x8003688c, "addiu $s0, $s0, -24300", "the ball's routine hands its record at 0x800ba114"),
    (0x80036540, "jal 0x80036af8", "first to the input routine"),
    (0x80036838, "jal 0x8002f86c", "then to the ball's state"),
    (0x80036840, "jal 0x80037430", "to the reading of the cells about it"),
    (0x80036848, "jal 0x80037a98", "to the measure of where it is within its cell"),
    (0x80036890, "jal 0x8003023c", "to the move step"),
    (0x800368dc, "jal 0x8003431c", "and to the camera"),
    (0x80034380, "jal 0x80034a50", "which runs the view routine"),
    (0x80036260, "jal 0x80034a50", "as the start does once"),
    (0x80038288, "swr $v0, 12($a2)", "the frame layer writes the heading at 12 of the record"),
    (0x80038260, "swr $v0, 20($a2)", "the side at 20"),
    (0x800382b0, "swr $v0, 28($a2)", "and the normal at 28"),
    (0x80038400, "sh $v0, 212($a0)", "the frame matrix at 212 takes the side as its first column"),
    (0x80038440, "subu $v1, $zero, $v1", "the heading turned round"),
    (0x80038454, "sh $v1, 214($a0)", "as its second"),
    (0x80038438, "sh $v0, 216($a0)", "and the normal as its third"),
    (0x80037464, "lh $v1, 60($s0)", "the position is at 60"),
    (0x8003746c, "addiu $v1, $v1, 256", "and lies in the cell"),
    (0x80037470, "sra $v1, $v1, 9", "whose 512 units hold it"),
    (0x8002f8e8, "jal 0x80037e70", "at rest the ball's state lays its centre"),
    (0x80037e94, "addu $v0, $v0, $a1", "off the face along the normal"),
    (0x80037bc4, "sh $v0, 334($a2)", "and how far off it is is kept at 334"),
    (0x8002f8bc, "addiu $v1, $v0, 1", "the states dispatch by the state plus one"),
    (0x8002f8d4, "lw $v0, 308($at)", "through the table at 0x80010134"),
    (0x8002f9d8, "mult $v1, $v0", "rolling, the state multiplies the speed by the heading"),
    (0x8002fa0c, "addu $v0, $v0, $t0", "and adds that to the position"),
    (0x8002fa10, "sh $v0, 60($s0)", "so the heading is the way the ball travels"),
    (0x80037aa8, "andi $v0, $v0, 511", "how far the centre is into its cell"),
    (0x80037b10, "sh $v0, 336($a2)", "along the heading is the progress at 336"),
    (0x80037b2c, "subu $v0, $v0, $v1", "taken from the far side for a heading the other way"),
    (0x80037af4, "swr $v1, 344($a2)", "with the last frame's kept at 344"),
    (0x80037d6c, "addu $v0, $v0, $a1", "and a progress is laid by moving the centre along the heading"),
    (0x80037d74, "sh $v0, 60($a0)", "from the edge behind it"),
    (0x80030264, "bne $v1, $v0, 0x8003060c", "the move step runs in the rolling state alone"),
    (0x8003026c, "jal 0x80030e44", "and asks whether the ball has come to the middle of its cell"),
    (0x80030e58, "lh $v0, 344($a0)", "since the last frame"),
    (0x80030284, "beq $v0, $zero, 0x8003029c", "stopping there where the forward request is gone"),
    (0x80030294, "beq $v0, $zero, 0x800302bc", "or a turn is asked"),
    (0x800302ac, "jal 0x80037d48", "with the centre laid at the middle"),
    (0x800302a0, "addiu $v0, $zero, -1", "at rest"),
    (0x800302b0, "sw $v0, 408($a0)", "by its state"),
    (0x800302bc, "jal 0x80030dfc", "else it asks whether the ball may roll on"),
    (0x80030dfc, "lw $v0, 132($a0)", "which it may where the floor ahead, at 132"),
    (0x80030e04, "bgez $v0, 0x80030e3c", "is there"),
    (0x80030e0c, "lw $v0, 116($a0)", "or where the cell beside the block under at 116"),
    (0x80030e14, "bgez $v0, 0x80030e2c", "is empty"),
    (0x80030e1c, "lw $v0, 124($a0)", "and the one at 124"),
    (0x80030e24, "bltz $v0, 0x80030e3c", "is too"),
    (0x80030e2c, "lw $v0, 356($a0)", "or where what it stands on"),
    (0x80030e38, "sltiu $v0, $v0, 1", "is ice"),
    (0x800302c4, "bne $v0, $zero, 0x80030388", "where it may, the step goes on to the two face changes"),
    (0x800302e8, "beq $v1, $v0, 0x8003060c", "where it may not, a ball on ice slides on"),
    (0x800302f0, "jal 0x80030e44", "one at the middle stops there"),
    (0x80030350, "subu $v0, $v0, $t1", "and one past it has the frame's advance taken off the position"),
    (0x80030354, "sh $v0, 60($s0)", "again"),
    (0x8003037c, "sh $zero, 312($s0)", "and stops"),
    (0x80030388, "lw $v0, 168($s0)", "a block in the cell ahead at the ball's own level, at 168"),
    (0x80030390, "bltz $v0, 0x800304c4", "is a wall"),
    (0x800303a4, "bne $v0, $zero, 0x800304c4", "which takes the ball once its progress reaches it"),
    (0x800304b4, "jal 0x80037d48", "laying the centre touching the wall"),
    (0x800304a0, "addiu $v0, $zero, -1", "and telling the view routine"),
    (0x800304a4, "sw $v0, 428($s0)", "at 428"),
    (0x80034cdc, "bne $v1, $v0, 0x80034d74", "which finds the word that frame"),
    (0x80034d00, "lwr $v0, 52($s0)", "takes the normal it saved at 52"),
    (0x80034d24, "subu $v0, $zero, $v0", "turns the heading round"),
    (0x80034d28, "sh $v0, 28($s0)", "into the normal"),
    (0x80034d5c, "swr $v0, 12($s0)", "and puts the saved normal into the heading"),
    (0x80034de0, "bne $v0, $zero, 0x80034e44", "the normal being saved as a ramp ends"),
    (0x80034e14, "swr $v0, 52($s0)", "from 28"),
    (0x80030500, "lw $v0, 120($s0)", "with no block under the ball's cell, at 120"),
    (0x80030508, "bgez $v0, 0x8003060c", "once the centre is past the edge"),
    (0x80030510, "lw $v0, 104($s0)", "and none beside the block it leaves, at 104"),
    (0x80030518, "bgez $v0, 0x8003060c", "nor"),
    (0x80030520, "lw $v0, 112($s0)", "at 112"),
    (0x80030528, "bgez $v0, 0x8003060c", "the edge takes the ball round"),
    (0x80030530, "lh $v0, 344($s0)", "where the last frame's progress"),
    (0x8003053c, "addu $v0, $v0, $v1", "plus the speed"),
    (0x80030544, "bne $v0, $zero, 0x8003060c", "reaches the cell's far edge"),
    (0x80030560, "addiu $v0, $zero, 7", "in a state of its own"),
    (0x80030564, "sw $v0, 408($s0)", "that runs the ball round the edge"),
    (0x8002fc44, "sw $a2, 408($a0)", "and puts it back rolling"),
    (0x8003055c, "addu $a1, $zero, $zero", "the progress laid at nothing"),
    (0x8003058c, "jal 0x80037d48", "along the heading"),
    (0x8003059c, "subu $v0, $zero, $v0", "the normal turned round"),
    (0x800305a0, "sh $v0, 6428($gp)", "kept at 0x800a4854"),
    (0x800305d8, "swr $v0, 28($s0)", "the heading put into the normal"),
    (0x800305e8, "addiu $a1, $a1, 18516", "and the turned normal"),
    (0x80030600, "swr $v0, 12($s0)", "into the heading"),
    (0x80037444, "lh $v0, 486($s0)", "the cells about a ball on a platform"),
    (0x80037454, "jal 0x80033930", "are read otherwise"),
    (0x800374a8, "subu $v1, $v1, $v0", "the others are read from the cell under the ball's own"),
    (0x800374b4, "addu $v0, $v0, $v1", "one over to the side"),
    (0x800374bc, "subu $v0, $v0, $a2", "and one back"),
    (0x80037590, "addu $a0, $a0, $t7", "a cell up for each along the normal"),
    (0x80037594, "addu $a0, $a0, $v1", "a cell on for each along the heading"),
    (0x800375a8, "subu $a0, $a0, $t4", "and a cell over for each the side is taken off"),
    (0x80037798, "slti $v0, $v0, 3", "three each way"),
    (0x8003762c, "addiu $v1, $v1, 104", "into words from 104 of the record"),
    (0x8003764c, "sra $a1, $a1, 14", "a word a cell"),
    (0x800375e0, "blez $t0, 0x800376f4", "a cell at the lattice's edge or past it"),
    (0x80037450, "addiu $s1, $zero, -1", "reads empty"),
    (0x80037730, "sw $s1, 0($v1)", "as a cell with nothing in it does"),
    (0x80037688, "lh $v0, 0($v1)", "and any other reads what the lattice holds"),
    (0x80037694, "sw $v0, 0($a0)", "as it is"),
    (0x800376c0, "bne $v1, $v0, 0x80037738", "unless it holds a moving platform"),
    (0x800377a4, "lw $a0, 120($s0)", "the word at 120 being the block under"),
    (0x8003700c, "lw $v1, 96($s0)", "the input routine reads the forward request at 96"),
    (0x80037014, "bne $v1, $v0, 0x80037060", "where it is made"),
    (0x8003701c, "lw $v0, 100($s0)", "with no jump"),
    (0x80037024, "bne $v0, $zero, 0x80037060", "asked"),
    (0x8003702c, "lw $v0, 132($s0)", "and lets it stand where the floor ahead"),
    (0x80037034, "bgez $v0, 0x80037060", "is there"),
    (0x8003703c, "lw $v0, 116($s0)", "else drops it where a block stands beside the block under"),
    (0x80037044, "bgez $v0, 0x8003705c", "on one side"),
    (0x8003704c, "lw $v0, 124($s0)", "or the other"),
    (0x80037054, "bltz $v0, 0x80037060", "and lets it stand where neither does"),
    (0x8003705c, "sw $zero, 96($s0)", "dropped"),
    (0x8002f560, "jal 0x8002f688", "at rest the request starts the roll"),
    (0x8002f698, "lw $v0, 120($s0)", "where a block is under the ball"),
    (0x8002f6a8, "jal 0x80030dfc", "and it may roll on"),
    (0x8002f6d0, "sw $v0, 408($s0)", "into the rolling state"),
    (0x8002f6cc, "sw $v0, 0($s0)", "writing the word at the record's start"),
    (0x8002f6d4, "sh $zero, 494($s0)", "and the landed flag, and no speed"),
    # The ball's frame, and the pad.
    (0x800362f8, "jal 0x8003b468", "the ball's routine runs the clock first"),
    (0x800364dc, "beq $v0, $zero, 0x80036508", "then, on every frame the count at 372 is not nothing"),
    (0x800364e4, "addiu $v0, $v1, -1", "takes one off it"),
    (0x800364e8, "sh $v0, 0($a0)", "and keeps it"),
    (0x800364f4, "sw $v0, -24204($at)", "asks the roll"),
    (0x800364fc, "sw $zero, -24208($at)", "drops the turn"),
    (0x80036504, "sw $zero, -24200($at)", "and the jump"),
    (0x80036514, "bgtz $v0, 0x80036548", "and reads the pad unless a countdown at 370 runs"),
    (0x8003651c, "lh $v0, 0($a0)", "or the count at 372, read again after the one came off"),
    (0x80036524, "bgtz $v0, 0x80036548", "still stands"),
    (0x80036528, "addiu $v0, $zero, 10", "or the ball stands on a boost button"),
    (0x80036538, "beq $v1, $v0, 0x80036548", "by the word at 356"),
    (0x80036b44, "sw $zero, 100($s0)", "the pad routine first drops the jump's request"),
    (0x80036b98, "sw $zero, 96($s0)", "the roll's"),
    (0x80036b9c, "sw $zero, 92($s0)", "and the turn's"),
    (0x800366bc, "jal 0x80032aec", "the input routine, then the platforms"),
    (0x8003670c, "jal 0x8003a928", "the hazards"),
    (0x8003679c, "jal 0x8003d570", "the captivators' reach"),
    (0x80036830, "jal 0x8002f3f4", "the intents"),
    (0x80036898, "jal 0x80030620", "and after the move step the landings"),
    (0x800368a0, "jal 0x8002f3c0", "the view's target"),
    (0x8002f3d4, "sh $v0, 388($a0)", "which is the centre with a platform's travel added"),
    (0x80034f38, "sw $v0, 6828($gp)", "and which the view routine aims at"),
    (0x800368cc, "jal 0x80038468", "and the contact"),
    (0x800368e4, "jal 0x800383ec", "and after the camera the frame matrix"),
    (0x800369ac, "jal 0x80031024", "the draw draws the ball"),
    (0x800369b4, "jal 0x80039200", "then the things on the blocks"),
    (0x800369dc, "addiu $a0, $a0, 256", "and takes the cell the ball is in"),
    (0x800369e0, "sra $a0, $a0, 9", "on each axis"),
    (0x800369ec, "addiu $a0, $a0, 1", "plus one"),
    (0x80036a34, "beq $a0, $zero, 0x80036a5c", "and where that is out of range"),
    (0x80036a64, "sw $v0, 24064($at)", "the ball is lost in the level's outcome word"),
    (0x80036af8, "lh $v0, 1148($gp)", "the input routine reads an option"),
    (0x80036b14, "sh $v0, 7080($gp)", "that sets the repeat's wait"),
    (0x80036b20, "sh $zero, 7080($gp)", "or none"),
    (0x80040cc0, "sw $v0, 21808($at)", "the loop keeps every frame's pad as the last frame's, read or not"),
    (0x80036be4, "lw $v0, 9720($gp)", "which the input routine takes as it runs"),
    (0x80036bf0, "sw $v0, 7504($gp)", "to tell a new press from a held one"),
    (0x80036bf8, "beq $v1, $v0, 0x80036e4c", "the Simon rooms' mode reads the pad another way"),
    (0x80036c2c, "beq $v0, $zero, 0x80037178", "and nothing is read until the view has run"),
    (0x80034a6c, "sh $v0, 460($s0)", "which marks the ball live at 460"),
    (0x80034348, "sh $zero, 460($s2)", "and the fly-in unmarks"),
    (0x80036c4c, "addiu $v0, $v0, 1", "a count at 364 runs while no turn does"),
    (0x80036c5c, "slt $v1, $v1, $v0", "and past the wait"),
    (0x80036c68, "sw $zero, 7504($gp)", "the last frame's pad is forgotten, so a held turn presses again"),
    (0x80036cac, "nor $v0, $zero, $v0", "a new press is held and not held before"),
    (0x80036cc8, "sw $a0, 92($s0)", "Left asks a turn of 1"),
    (0x80036cf4, "sw $v0, 92($s0)", "Right of -1"),
    (0x80036d18, "sh $v0, 360($s0)", "a Left pressed while a turn runs waits at 360"),
    (0x80036d38, "sh $v0, 362($s0)", "a Right at 362"),
    (0x80036c84, "sw $a0, 92($s0)", "and is asked as the turn ends"),
    (0x80036d48, "bltz $v0, 0x80036e18", "with no bouncy pill in effect"),
    (0x80036e2c, "sw $v0, 96($s0)", "Up held asks the roll"),
    (0x80036e48, "sw $v0, 100($s0)", "and Cross held the jump"),
    (0x80036bbc, "sw $v0, 100($s0)", "which the bouncy pill asks on every frame"),
    (0x80036d50, "lw $v1, 10976($gp)", "under the pill the pad is read again"),
    (0x80036d58, "andi $v0, $v1, 16", "Up held"),
    (0x80036d64, "sh $v0, 1152($gp)", "sets a latch at 0x800a33b8"),
    (0x80036d68, "andi $v0, $v1, 16384", "and Cross held"),
    (0x80036d74, "sh $v0, 1150($gp)", "one at 0x800a33b6"),
    (0x80036d80, "beq $v0, $v1, 0x80036d98", "while the Up latch stands"),
    (0x80036d90, "bne $v0, $v1, 0x80036db0", "or the Cross latch"),
    (0x80036da4, "sh $v0, 7512($gp)", "a count at 0x800a4c90 steps"),
    (0x80036db0, "sh $zero, 7512($gp)", "and is put at nothing otherwise"),
    (0x80036dc0, "bne $v0, $zero, 0x80037178", "under the latch's count nothing more of Up or Cross is read"),
    (0x80036dd8, "sw $v1, 96($s0)", "from it the roll's request is the Up latch"),
    (0x80036dd4, "bne $a0, $v0, 0x80036e08", "and where Cross is latched"),
    (0x80036ddc, "bne $v1, $a0, 0x80036e08", "with Up"),
    (0x80036dec, "bne $v0, $zero, 0x80036e08", "the long jump's word is nothing"),
    (0x80036dfc, "beq $v0, $v1, 0x80036e08", "and the state is not the forward jump's, the word is armed"),
    (0x80036e08, "sh $zero, 1150($gp)", "both latches are cleared"),
    (0x80036e0c, "sh $zero, 1152($gp)", "either way"),
    (0x80036e10, "j 0x80037178", "and the count kept"),
    (0x80035d38, "bne $v1, $v0, 0x80035d80", "the level's start, in the Simon rooms' mode alone"),
    (0x80035d60, "sh $zero, 7512($gp)", "puts the count at nothing"),
    (0x800371a4, "sh $v0, 496($s0)", "and R2 and R1 set the word at 496"),
    (0x8002f4a8, "lw $s1, 408($s0)", "the intents read the state"),
    (0x8002f4b0, "bne $s1, $v0, 0x8002f5c8", "and take the requests at rest alone"),
    (0x8002f4c0, "beq $v0, $v1, 0x8002f530", "where a jump is asked"),
    (0x8002f530, "lw $v0, 96($s0)", "reads the roll's request"),
    (0x8002f538, "beq $v0, $v1, 0x8002f5c0", "with the roll"),
    (0x8002f5c0, "jal 0x8002f5e0", "it is the forward jump"),
    (0x8002f540, "jal 0x8002f6ec", "and alone the hop"),
    (0x8002f488, "bne $v1, $v0, 0x8002f4a8", "rolling"),
    (0x8002f490, "lw $v0, 100($s0)", "a jump"),
    (0x8002f498, "bne $v0, $a0, 0x8002f4a8", "asked"),
    (0x8002f4a0, "jal 0x8002f5e0", "is the forward jump at once, whatever the roll's request"),
    (0x8002f4e8, "jal 0x8002f7f4", "at rest a turn of 1 is a turn left"),
    (0x8002f500, "jal 0x8002f77c", "and one of -1 a turn right"),
    (0x8002f468, "jal 0x8002f7f4", "as during a hop"),
    # The roll.
    (0x8002f8f8, "bgez $v0, 0x8002f928", "at rest, with no block under the ball's cell"),
    (0x8002f910, "sw $v0, 408($s0)", "the ball falls"),
    (0x8002f934, "jal 0x80030e6c", "rolling, the state first moves the centre across toward the middle"),
    (0x80030e78, "slt $v0, $v1, $v0", "where it is further off than the step"),
    (0x8002f944, "bgez $v0, 0x8002f98c", "then, with no block under the ball's cell"),
    (0x8002f974, "sw $v0, 408($s0)", "within the window, falls"),
    (0x8002f9a0, "sh $zero, 708($s0)", "lets the next edge be taken once the progress has passed the mark"),
    (0x8002f9b0, "sh $v0, 312($s0)", "the speed grows"),
    (0x8002f9c8, "sh $v0, 312($s0)", "to its top"),
    (0x8002fa18, "sh $v1, 320($s0)", "and is kept at 320 for the spin"),
    (0x8002f92c, "sh $zero, 320($s0)", "which the rest state puts at nothing on every frame it runs"),
    (0x800302a8, "sh $zero, 312($a0)", "a stop at the middle drops the speed"),
    # The turn in place.
    (0x8002f804, "bne $v0, $zero, 0x8002f85c", "a turn is refused while one runs"),
    (0x8002f814, "bne $v0, $zero, 0x8002f85c", "or a face change's ramp"),
    (0x8002f820, "sw $v0, 420($a0)", "Left tells the view at 420"),
    (0x8002f828, "sh $v0, 434($a0)", "sets the view's count"),
    (0x8002f830, "sh $v0, 442($a0)", "and its step"),
    (0x8002f7bc, "sw $a0, 420($a1)", "and Right tells the view"),
    (0x8002f7b0, "sh $v0, 434($a1)", "sets the count"),
    (0x8002f7c0, "sh $v0, 442($a1)", "and the step the other way"),
    (0x80034a74, "bne $v1, $v0, 0x80034b20", "the view routine finds a turn right"),
    (0x80034acc, "subu $v0, $zero, $v0", "turns the heading round"),
    (0x80034ad0, "sh $v0, 20($s0)", "into the side"),
    (0x80034b04, "swr $v0, 12($s0)", "and puts the old side into the heading"),
    (0x80034b28, "bne $v1, $v0, 0x80034bd8", "a turn left"),
    (0x80034b94, "swr $v0, 20($s0)", "puts the heading into the side"),
    (0x80034b58, "subu $v0, $zero, $v0", "and the old side turned round"),
    (0x80034bbc, "swr $v0, 12($s0)", "into the heading"),
    (0x80034b1c, "sw $v0, 420($s0)", "and marks the turn running"),
    (0x80034bf8, "addiu $a0, $a0, -1", "each frame of the count"),
    (0x80034bfc, "addu $v0, $v0, $a1", "the yaw grows by the step"),
    (0x80034c04, "sh $v0, 450($s0)", "at 450"),
    (0x80034c14, "sh $v0, 312($s0)", "and the speed is clamped"),
    (0x80034c20, "bne $v0, $zero, 0x80034cd4", "as the count runs out"),
    (0x80034c60, "sh $zero, 450($s0)", "the yaw is nothing again"),
    (0x80034c78, "swr $v0, 44($s0)", "the view takes the side"),
    (0x80034c98, "swr $v0, 36($s0)", "and the heading"),
    (0x80034ccc, "sw $zero, 420($s0)", "and the turn is over"),
    # The camera over a turn and a face change.
    (0x80034e60, "sh $v0, 22884($at)", "the camera's first row is the side the view holds at 44"),
    (0x80034e9c, "subu $v0, $zero, $v0", "its second the normal it holds at 52, turned round"),
    (0x80034efc, "sh $v0, 22896($at)", "and its third the heading it holds at 36"),
    (0x80035238, "addu $a0, $v0, $a0", "the yaw at 450"),
    (0x80035240, "jal 0x800610f8", "turns the camera about its down axis"),
    (0x8006115c, "lh $t2, 0($a1)", "mixing its first row"),
    (0x80061160, "lh $t5, 12($a1)", "with its third"),
    (0x80061154, "subu $t1, $zero, $t7", "by the sine turned round, so a positive yaw turns it left"),
    (0x80035250, "lh $a0, 452($s0)", "and the pitch at 452"),
    (0x80035258, "jal 0x80060f58", "about its right axis"),
    (0x80060fbc, "lh $t2, 6($a1)", "mixing its second row"),
    (0x80060fc0, "lh $t5, 12($a1)", "with its third"),
    (0x80060fb4, "sra $t1, $t8, 16", "by the sine as it is, so a positive pitch turns it down"),
    (0x80034d7c, "bne $a0, $v0, 0x80034d9c", "the view finds a wrap at 428"),
    (0x80034d98, "sw $a0, 456($s0)", "and marks a ramp running at 456"),
    (0x80034da4, "blez $v0, 0x80034dd8", "while the count at 436 runs"),
    (0x80034dcc, "addu $v0, $v0, $a0", "the pitch grows by the step at 444"),
    (0x80034dd0, "sh $v0, 452($s0)", "at 452"),
    (0x80034dfc, "sh $zero, 452($s0)", "and as the count runs out the pitch is nothing again"),
    (0x80034e34, "swr $v0, 36($s0)", "the view taking the heading with the normal"),
    (0x80034e40, "sw $zero, 456($s0)", "and the ramp is over"),
    (0x80030574, "sw $v0, 428($s0)", "an edge tells the view of a wrap"),
    (0x8003057c, "sh $v0, 436($s0)", "with a count"),
    (0x80030590, "sh $v0, 444($s0)", "and a step"),
    (0x8003054c, "lh $v0, 708($s0)", "and is not taken"),
    (0x80030554, "bne $v0, $zero, 0x8003060c", "while the last wrap's flag stands"),
    (0x80030588, "sw $zero, 404($s0)", "the arc's count starts at nothing"),
    (0x800304ac, "sh $v0, 436($s0)", "a wall tells the view with a count"),
    (0x800304b8, "sh $v0, 444($s0)", "and a step the other way"),
    # Round the edge.
    (0x8002fa40, "sh $v1, 708($s0)", "round an edge the state holds the flag at 708"),
    (0x8002fa48, "sw $v0, 404($s0)", "counts its frame at 404"),
    (0x8002fa54, "bne $v1, $v0, 0x8002faf0", "and on the first"),
    (0x8002faa0, "sh $v1, 60($s0)", "moves the centre along the new normal and heading"),
    (0x8002faf8, "bne $v0, $a2, 0x8002fb90", "on the second"),
    (0x8002fb30, "sh $v1, 60($s0)", "again"),
    (0x8002fb98, "bne $v1, $v0, 0x8002fc3c", "on the third"),
    (0x8002fbe4, "sh $v1, 60($s0)", "again"),
    (0x8002fc3c, "bne $v1, $v0, 0x80030228", "and on the fourth"),
    (0x8002fc74, "sh $v1, 60($a0)", "once more"),
    (0x8002fcd0, "jal 0x80037e70", "and lays the centre off the new face"),
    (0x80037e8c, "sra $v0, $v0, 25", "which is the face plane nearest the centre"),
    (0x80037e98, "addiu $v0, $v0, 256", "along the normal"),
    (0x80037ec4, "subu $v0, $v0, $a1", "or against it, where the normal points the other way"),
    # The fall and the landing.
    (0x8002ff20, "beq $v0, $zero, 0x8002ff54", "falling, the spin's speed grows while the roll is asked"),
    (0x8002ff34, "sh $v0, 320($s0)", "at 320"),
    (0x8002ff60, "sh $v0, 320($s0)", "and wanes otherwise"),
    (0x8002ff74, "lh $v0, 312($s0)", "the speed along the heading"),
    (0x8002ff7c, "blez $v0, 0x8002ff8c", "where it is forward"),
    (0x8002ff84, "sh $zero, 312($s0)", "is dropped on every frame of the fall"),
    (0x8002ff90, "bgez $v0, 0x8002ffb0", "and where it is back, a bounce's"),
    (0x8002ff9c, "sh $v0, 312($s0)", "decays"),
    (0x8002ffac, "sh $zero, 312($s0)", "to nothing"),
    (0x8002ffbc, "sh $v0, 310($s0)", "the speed down at 310 grows"),
    (0x8002ffd4, "sh $v0, 310($s0)", "to its top"),
    (0x8002ffe4, "mult $v1, $v0", "and the centre moves by it along the normal"),
    (0x8002fff8, "mult $v1, $v0", "and by the speed at 312 along the heading"),
    (0x8003070c, "jal 0x80033078", "the landings try a platform under a falling ball"),
    (0x8003071c, "jal 0x80030b48", "then a block"),
    (0x80030b5c, "lh $v1, 28($s0)", "the landing takes the normal"),
    (0x80030b80, "sh $v1, 6020($gp)", "to the point under the centre"),
    (0x80030bd8, "jal 0x800379e8", "and looks up the cell it lies in"),
    (0x800379e8, "lh $v0, 0($a0)", "the lookup takes the point's first coordinate"),
    (0x800379f0, "addiu $v0, $v0, 256", "adds half a block"),
    (0x800379f4, "sra $a1, $v0, 9", "and shifts it down to its cell, so a point on a face plane lies in the cell on the plane's positive side"),
    (0x800379f8, "addiu $v1, $v1, 256", "the second coordinate the same"),
    (0x80037a00, "sra $a0, $v1, 9", "to its cell"),
    (0x80037a0c, "addiu $v0, $v0, 256", "and the third"),
    (0x80037a10, "sra $a2, $v0, 9", "to its cell"),
    (0x80030c0c, "beq $v1, $v0, 0x80030db8", "a moving platform's record lands nothing here"),
    (0x80030c14, "bgez $a0, 0x80030c24", "nor does an empty cell"),
    (0x80030d24, "jal 0x80037e70", "else the centre is laid off the face"),
    (0x80030d30, "sw $v0, 408($s0)", "at rest"),
    (0x80030d40, "beq $v0, $zero, 0x80030d50", "at the top speed where the roll is asked"),
    (0x80030d88, "beq $v0, $zero, 0x80030db8", "and where it landed short of the gate"),
    (0x80030da0, "sw $v0, 96($s0)", "the roll is asked for it"),
    (0x80030da8, "sh $s1, 372($s0)", "with a count of one at 372, lost to the pad"),
    (0x80030db0, "sh $v0, 312($s0)", "and the top speed left for the next roll"),
    (0x80030748, "bltz $v0, 0x80030758", "a falling ball with a block ahead at its level"),
    (0x80030750, "jal 0x80037d48", "is held off it"),
    (0x80030774, "bltz $v0, 0x800307c8", "and with one behind"),
    (0x8003077c, "jal 0x80037d48", "held off that"),
    # The landing's squash, and the spin.
    (0x80030d54, "sh $v0, 6468($gp)", "a landing starts the squash's rise"),
    (0x80030d5c, "sh $v0, 6460($gp)", "by this a frame"),
    (0x80030d6c, "sh $zero, 6464($gp)", "from nothing"),
    (0x80030d70, "sh $v0, 6472($gp)", "with its fall to come"),
    (0x800325f0, "blez $v0, 0x80032620", "the draw counts the rise down"),
    (0x80032614, "sh $v1, 6464($gp)", "adding the rise"),
    (0x80032628, "blez $v0, 0x80032680", "then while any squash is left"),
    (0x8003263c, "sh $v0, 6472($gp)", "eases the fall"),
    (0x80032664, "sh $v0, 6464($gp)", "and takes it off"),
    (0x80032718, "sh $v0, 702($s0)", "the squash and the breath drawn as one"),
    # The body's orientation.
    (0x80031044, "lw $v0, 536($s3)", "the ball's draw reads the mark at 536"),
    (0x8003104c, "bne $v0, $zero, 0x80031160", "and where one stands takes no spin step and no rebuild"),
    (0x8003105c, "bne $v1, $v0, 0x80031074", "else the spin step is the jump's in the jump's state"),
    (0x80031064, "jal 0x800324f8", "there"),
    (0x80031074, "jal 0x800325c0", "and the rest's otherwise"),
    (0x80032508, "lh $v0, 320($s0)", "the jump's turns by the spin's speed at 320"),
    (0x8003250c, "addiu $a1, $s0, 596", "the body's matrix at 596"),
    (0x80032518, "jal 0x80060f58", "about x"),
    (0x800325d0, "lh $v0, 320($s0)", "and the rest's by the same word"),
    (0x800325d4, "addiu $a1, $s0, 596", "the same matrix"),
    (0x800325e0, "jal 0x80060f58", "about the same axis"),
    (0x80060ff8, "sh $t8, 6($a1)", "the turn mixing the matrix's second row"),
    (0x80061088, "sh $t8, 12($a1)", "and its third, so it is laid on from the left"),
    (0x80031084, "jal 0x80060308", "the draw straightens the body's matrix on every frame"),
    (0x800310a4, "addiu $s0, $s3, 564", "and the frame's, at 564"),
    (0x800310ac, "jal 0x80060308", "the same way"),
    (0x800310cc, "lw $v0, 456($s3)", "and while no ramp runs"),
    (0x800310d4, "bne $v0, $zero, 0x80031160", "rebuilds the frame's matrix"),
    (0x800310e8, "sh $v0, 564($s3)", "from the side"),
    (0x80031100, "subu $v1, $zero, $v1", "the heading turned round"),
    (0x80031138, "subu $v0, $zero, $v0", "and the normal turned round"),
    (0x8003115c, "sh $v0, 580($s3)", "its columns"),
    (0x800313b4, "addiu $a0, $s3, 564", "the model is drawn through the frame's matrix"),
    (0x800313f0, "jal 0x800603f8", "times the squash"),
    (0x8003141c, "addiu $a1, $s3, 596", "times the body's"),
    (0x80031420, "jal 0x800603f8", "in that order"),
    (0x800314bc, "jal 0x800603f8", "and the camera's over all"),
    (0x800314c4, "lh $v1, 702($s3)", "and takes the squash's word for the position"),
    (0x80031428, "lhu $v0, 6292($gp)", "and copies the product"),
    (0x80031430, "sh $v0, 660($s3)", "into a fourth matrix at 660"),
    (0x8003149c, "sh $v0, 676($s3)", "to its last halfword"),
    (0x80036258, "jal 0x8002f2e8", "the level's start lays the ball's matrices"),
    (0x80034b14, "sw $v0, 536($s0)", "a turn right marks the frame's own draw"),
    (0x80034bcc, "sw $v0, 536($s0)", "as a turn left does"),
    (0x800304c0, "sw $v0, 692($s0)", "a wall marks the next frame's draw at 692"),
    (0x8002fa58, "sw $v0, 692($s0)", "as each frame round an edge does"),
    (0x800324bc, "lw $v0, 692($s3)", "the draw's end copies 692"),
    (0x800324c4, "sw $v0, 536($s3)", "into 536"),
    (0x8002f888, "sw $zero, 692($s0)", "which the states' dispatcher clears on every frame"),
    (0x80031168, "bne $v1, $v0, 0x800311b4", "the edge's mark"),
    (0x80031190, "jal 0x80060a38", "builds a turn from three angles"),
    (0x80031198, "addiu $a0, $s3, 564", "and lays it on the frame's matrix"),
    (0x800311a4, "jal 0x800603f8", "from the right, the body's untouched"),
    (0x800311b4, "bne $v1, $v0, 0x80031250", "a turn right's mark"),
    (0x80031208, "jal 0x800603f8", "lays its turn on the body's matrix from the left"),
    (0x80031220, "jal 0x800609f8", "and the turn's transpose"),
    (0x80031234, "jal 0x800603f8", "on the frame's from the right"),
    (0x80031320, "jal 0x800609f8", "the wall's turn transposed for the frame"),
    (0x80031258, "bne $v1, $v0, 0x800312d0", "a turn left's mark"),
    (0x80031294, "jal 0x800603f8", "the same"),
    (0x800312c0, "jal 0x800603f8", "on both"),
    (0x800312d0, "bne $v1, $v0, 0x8003133c", "and a wall's"),
    (0x80031308, "jal 0x800603f8", "the same"),
    (0x80031334, "jal 0x800603f8", "on both"),
    (0x8002f358, "sh $v0, 564($a0)", "the start lays the frame's matrix as the identity"),
    (0x8002f35c, "sh $v0, 596($a0)", "and the body's"),
    (0x8002f360, "sh $v0, 628($a0)", "and a third at 628"),
    (0x80030c18, "addiu $s1, $zero, 1", "which a landing from the jump's state"),
    (0x80030c34, "jal 0x80032730", "takes"),
    (0x80032740, "addiu $a0, $s0, 628", "from 628"),
    (0x80032748, "jal 0x800603f8", "times the body's matrix"),
    (0x80032774, "sh $v0, 628($s0)", "and lays as the identity again"),
    # The view's extra pitch.
    (0x80034f60, "bne $v1, $v0, 0x80034fb8", "R1 held"),
    (0x80034f94, "sh $v0, 504($s0)", "adds to the extra pitch at 504"),
    (0x80035050, "beq $v1, $v0, 0x80035074", "falling"),
    (0x80035058, "bne $v1, $v0, 0x8003512c", "or jumping"),
    (0x8003506c, "beq $v0, $zero, 0x8003512c", "in the arc's last rows"),
    (0x80035078, "bne $a0, $v0, 0x80035130", "over nothing"),
    (0x8003508c, "beq $v0, $zero, 0x800350dc", "short of the near mark"),
    (0x800350b0, "sw $v0, 7000($gp)", "the rate grows"),
    (0x800350d8, "sh $v0, 504($s0)", "and the pitch by the rate"),
    (0x800350e8, "sw $v0, 7000($gp)", "past the mark the rate wanes"),
    (0x8003510c, "sh $v0, 504($s0)", "and the pitch grows by it"),
    (0x8003512c, "sw $v0, 7000($gp)", "over a block the rate is reset"),
    (0x80035184, "sh $v0, 504($s0)", "and the pitch comes back"),
    (0x800354d4, "jal 0x80060f58", "the extra pitch and the view's own pitch the camera down"),
    # The fly-in.
    (0x800362bc, "jal 0x80033e94", "the level's start lays the fly-in's curve"),
    (0x80033ee4, "lh $v0, 12($s0)", "from the ball's heading at 12"),
    (0x80033f14, "lh $v0, 20($s0)", "its side at 20"),
    (0x80033eb4, "lh $v0, 28($s0)", "and its normal at 28, each a whole unit"),
    (0x8002f36c, "sh $a1, 388($a0)", "the start copies the position at 60, laid on the face, into the view's target"),
    (0x800341b4, "lh $a0, 388($s0)", "and from the view's target at 388"),
    (0x800341bc, "addu $s1, $a0, $v1", "which the last point stands off along the normal"),
    (0x800341ec, "subu $v0, $s1, $t9", "the first lies back along the heading from it"),
    (0x800341f0, "subu $a3, $v0, $t2", "and against the side"),
    (0x80034258, "addu $v1, $a3, $v1", "the second a share of the way from the first to the last"),
    (0x80034268, "addu $v1, $v1, $v0", "and a share of the side on"),
    (0x800342b0, "subu $v0, $s1, $v0", "and the third a share of the heading short of the last"),
    (0x80033f34, "sw $zero, 6992($gp)", "the start puts the parameter at nothing"),
    (0x80033f38, "sw $v1, 6996($gp)", "and the slowing step at its first value"),
    (0x8003431c, "lw $v1, 6992($gp)", "the view routine reads the parameter"),
    (0x80034344, "beq $v0, $zero, 0x80034360", "and takes the flight while it is within the end"),
    (0x80034350, "lw $v0, 13232($v0)", "and the mode word at 0x800a33b0"),
    (0x80034358, "bne $v0, $s4, 0x80034390", "is not the one the flight is skipped in"),
    (0x800343cc, "jal 0x80033cbc", "it evaluates the curve"),
    (0x80033cc8, "sll $v0, $t4, 1", "whose unit is one shifted up by two thirds"),
    (0x80033ce4, "sllv $t3, $t3, $v0", "of the shift it is given"),
    (0x80033ce8, "subu $t3, $t3, $t1", "the remainder being the unit less the parameter"),
    (0x80033d14, "lw $v1, 0($a0)", "the first point weighted by the remainder's cube"),
    (0x80033d50, "lw $v0, 0($a1)", "the second by three times the parameter by the remainder's square"),
    (0x80033d88, "lw $v0, 0($a2)", "the third by three times the parameter's square by the remainder"),
    (0x80033db0, "lw $v0, 0($a3)", "and the last by the parameter's cube"),
    (0x80033dc4, "srav $v1, $v1, $t4", "the sum shifted down by the shift"),
    (0x80033dc8, "sw $v1, 0($t2)", "into the point"),
    (0x80034428, "jal 0x800601e8", "the flight's view takes the heading normalised"),
    (0x80034440, "jal 0x800608fc", "the side as the heading's cross product with the normal"),
    (0x80034450, "jal 0x800601e8", "normalised"),
    (0x8003449c, "subu $v0, $zero, $v0", "and the normal turned round"),
    (0x80034470, "sh $v0, 22884($at)", "as its rows right"),
    (0x800344a8, "sh $v0, 22890($at)", "down"),
    (0x800344f0, "sh $v0, 22896($at)", "and ahead"),
    (0x80034518, "jal 0x800610f8", "turns it about its down axis by the parameter less the end"),
    (0x80034530, "jal 0x80060f58", "pitches it down"),
    (0x80034548, "subu $a0, $s0, $a0", "and rolls it about its line of sight by the remainder"),
    (0x80034554, "jal 0x80061298", "doubled"),
    (0x80034570, "jal 0x80060508", "turns the curve's point by the view"),
    (0x8003458c, "subu $v0, $zero, $v0", "and puts it at the middle across"),
    (0x80034598, "sw $v0, 22904($at)", "in the view's translation"),
    (0x800345b4, "sw $v0, 22908($at)", "below the middle"),
    (0x800345a0, "subu $s0, $s0, $a0", "and ahead of the eye by the remainder's share of the distance out"),
    (0x800345f8, "sw $v0, 22912($at)", "over the depth in play"),
    (0x80034600, "sh $v0, 370($s2)", "writes the hold into the wait at 370"),
    (0x8003463c, "sw $v0, 6992($gp)", "steps the parameter by the step while it is within the slow gate"),
    (0x80034610, "lw $v0, 6996($gp)", "and past it reads the slowing step"),
    (0x80034620, "sw $v1, 6992($gp)", "stepping it by that"),
    (0x8003461c, "addiu $v0, $v0, -1", "which falls by one"),
    (0x80034624, "sw $v0, 6996($gp)", "each frame"),
    (0x80034628, "bgtz $v0, 0x80034640", "unless it would fall past nothing"),
    (0x80034630, "sw $s4, 6996($gp)", "when it is the least step"),
    (0x8003464c, "bne $v0, $zero, 0x80034658", "and as the parameter passes the end"),
    (0x80034654, "sh $v0, 370($s2)", "writes the last wait"),
    (0x80034658, "sh $zero, 374($s2)", "and puts the free camera's angles at 374"),
    (0x8003465c, "sh $zero, 376($s2)", "and 376 at nothing"),
    (0x80034690, "lh $v1, 374($a0)", "which the free camera turns the eye by"),
    (0x800346b8, "lh $a0, 376($a0)", "both"),
    (0x80036648, "lh $v0, 0($s1)", "the ball's routine reads the wait"),
    (0x80036654, "beq $v0, $zero, 0x80036714", "and skips the platforms, the captivators' moves and the hazards while it is at the gate or past it"),
    (0x800368ac, "lh $v1, -23840($v1)", "the contact walk's caller asks the live word at 460"),
    (0x800368b4, "bne $v1, $v0, 0x800368d4", "and skips the walk while it is not set"),
    # The jump, the hop and the boost button's launch.
    (0x80022e44, "lw $t2, 24($a3)", "the parser of the .GGI takes the header's section sizes"),
    (0x80022e60, "sll $t2, $t2, 1", "in halfwords"),
    (0x80022e8c, "addu $v0, $v1, $v0", "summed from the first section's start"),
    (0x80022ea0, "sw $v0, 11296($gp)", "and keeps where the fifth begins"),
    (0x8002f2ec, "lw $v1, 23384($v1)", "which the ball's init takes"),
    (0x8002f368, "sw $v1, 6452($gp)", "as the jump's table"),
    (0x8002f5f0, "lw $v0, 120($s0)", "the forward jump needs a block under the ball"),
    (0x8002f5f8, "bltz $v0, 0x8002f674", "and does nothing otherwise"),
    (0x8002f630, "swr $v0, 68($s0)", "it saves the centre at 68"),
    (0x8002f638, "swr $v1, 72($s0)", "and 72"),
    (0x8002f63c, "lw $v0, 6452($gp)", "takes the table"),
    (0x8002f648, "lh $a1, 0($v0)", "its count"),
    (0x8002f668, "sw $a1, 404($a0)", "as the count at 404"),
    (0x8002f670, "sw $v1, 416($a0)", "and its first row at 416"),
    (0x8002f60c, "sw $v0, 408($s0)", "in the jumping state"),
    (0x8002f65c, "sh $v0, 312($a0)", "at its speed"),
    (0x8002f660, "sh $v0, 320($a0)", "the spin's speed set to the same"),
    (0x8002f6fc, "lh $v0, 486($s0)", "the hop"),
    (0x8002f708, "sw $zero, 408($s0)", "is a state of its own"),
    (0x8002f730, "swr $v0, 68($s0)", "saving the centre, which its rows never read"),
    (0x8002f760, "sw $a0, 404($s0)", "with the same count"),
    (0x8002f764, "sw $v1, 416($s0)", "and the same first row"),
    (0x8002fcf0, "sw $v0, 404($s0)", "jumping, the count falls by one a frame"),
    (0x8002fcf4, "sw $zero, 404($s0)", "and from one past the skip to nothing"),
    (0x8002fd00, "blez $v0, 0x8002fe14", "where it is nothing the jump ends"),
    (0x8002fd30, "sh $v1, 80($s0)", "else a row's height"),
    (0x8002fd44, "sh $v1, 76($s0)", "its right"),
    (0x8002fd5c, "sh $a0, 78($s0)", "and its back are taken"),
    (0x8002fd58, "beq $v1, $zero, 0x8002fdc4", "and where the long jump's word at 412 is set"),
    (0x8002fd68, "sll $v0, $v1, 1", "each is taken three"),
    (0x8002fd6c, "addu $v0, $v0, $v1", "times"),
    (0x8002fd70, "srl $v1, $v0, 31", "with its sign added"),
    (0x8002fd7c, "sra $v0, $v0, 1", "over two, toward nothing"),
    (0x8002fd80, "sh $v0, 76($s0)", "the right"),
    (0x8002fd9c, "sh $v0, 78($s0)", "the back"),
    (0x8002fdb8, "sh $v0, 80($s0)", "and the height"),
    (0x8002fdbc, "addiu $v1, $v1, 1", "and the word"),
    (0x8002fdc0, "sw $v1, 412($s0)", "counts the row"),
    (0x8002fdcc, "jal 0x800606b8", "the frame matrix turns the row"),
    (0x8002fdd8, "jal 0x80030f48", "the saved centre is drawn across toward the middle"),
    (0x8002fdf4, "sh $v0, 60($s0)", "and the centre is the saved one plus the turned row"),
    (0x8002fe20, "bne $v0, $zero, 0x8002fe78", "as the jump ends, with the word short of the long jump"),
    (0x8002fe8c, "sh $v1, 60($s0)", "the centre is the saved one moved two blocks along the heading"),
    (0x8002fe50, "sh $v0, 60($s0)", "or three"),
    (0x8002feb4, "jal 0x80030b48", "and the landing is tried"),
    (0x8002febc, "beq $v0, $zero, 0x8002fecc", "which failing"),
    (0x8002fecc, "sw $v0, 408($s0)", "the ball falls"),
    (0x8002fee0, "sh $zero, 312($s0)", "with its speed along the heading dropped"),
    (0x8002fed8, "lhu $v0, 326($s0)", "at the last frame's change along the normal"),
    (0x8002ff00, "subu $v0, $zero, $v0", "turned downward"),
    (0x8002ff0c, "sh $v0, 310($s0)", "for its speed down"),
    (0x8002ff14, "sw $zero, 412($s0)", "and the long jump's word cleared"),
    (0x80030d68, "sw $zero, 412($s0)", "as a landing clears it"),
    (0x800334a8, "sw $zero, 412($s0)", "and a landing on a platform"),
    (0x800309b8, "sw $zero, 412($s0)", "a bounce off a wall"),
    (0x80030ae8, "sw $zero, 412($s0)", "a drop under a block above"),
    (0x80035ea4, "sw $zero, -23888($at)", "and the level's start"),
    (0x8002f880, "addiu $v0, $zero, 1", "and the states' dispatcher, in every state but the jump's"),
    (0x8002f884, "beq $v1, $v0, 0x8002f8a4", "which it passes over"),
    (0x8002f88c, "lw $v0, 412($s0)", "reads the word"),
    (0x8002f8a0, "sw $zero, 412($s0)", "and clears it from the kept value up"),
    (0x80036e04, "sw $v1, 412($s0)", "the bouncy pill's latch on the pad arms it as the button does"),
    (0x80037d1c, "lhu $a0, 342($a2)", "the measure routine takes the last frame's measure along the normal"),
    (0x80037d34, "subu $v0, $v0, $a0", "off this frame's"),
    (0x80037d3c, "sh $v0, 326($a2)", "and keeps the change at 326"),
    (0x800300b0, "sh $zero, 320($s0)", "hopping, each row puts the spin's speed at nothing"),
    (0x800300b8, "lhu $t0, 0($v0)", "and takes this row's height"),
    (0x800300c4, "subu $v1, $v1, $t0", "off the next's"),
    (0x800300f8, "sh $zero, 76($s0)", "and nothing across"),
    (0x80030110, "sh $zero, 78($s0)", "or along"),
    (0x80030124, "addu $v0, $v0, $a0", "moves the centre from where it is"),
    (0x800301b0, "lw $v1, 120($s0)", "and as the count runs out the hop asks after the block under the ball's cell"),
    (0x800301cc, "sw $v0, 408($s0)", "and is at rest"),
    (0x800301c8, "bgez $v1, 0x800301f4", "or, over nothing"),
    (0x800301d4, "sw $v0, 408($s0)", "falls"),
    (0x800301e8, "sh $zero, 312($s0)", "with no speed along the heading"),
    (0x80030648, "beq $v1, $v0, 0x8003067c", "the landings, jumping"),
    (0x80030690, "jal 0x80033078", "try a platform in the arc's last rows"),
    (0x800306a0, "jal 0x80030b48", "then a block"),
    (0x800306c0, "jal 0x800307dc", "then a wall"),
    (0x80030810, "lw $v0, 168($s0)", "which is a block ahead at the ball's level"),
    (0x8003083c, "bgez $v0, 0x80030908", "or ahead and above, high in the cell"),
    (0x80030858, "bgez $v0, 0x80030908", "or the floor ahead, low in it"),
    (0x80030934, "sll $v0, $v0, 1", "and bounces the ball back twice the frame's advance"),
    (0x80030968, "sw $a0, 408($s0)", "into a fall"),
    (0x800309c4, "sh $v1, 312($s0)", "at that advance reversed"),
    (0x800309b4, "sh $zero, 320($s0)", "with the spin's speed at nothing"),
    (0x800307c0, "jal 0x800309e8", "or a block above"),
    (0x80030a2c, "lw $v0, 192($s0)", "over the ball"),
    (0x80030ad4, "sw $v1, 408($s0)", "which drops it"),
    (0x80030b04, "sh $v1, 310($s0)", "at its rise reversed"),
    (0x80030aa4, "sll $v0, $v0, 1", "the centre set back by twice that rise"),
    (0x80030b10, "sh $a0, 60($s0)", "along the normal"),
    (0x80030ac4, "sh $zero, 312($s0)", "and the speed"),
    (0x80030ac8, "sh $zero, 320($s0)", "and the spin's speed at nothing"),
    (0x8003b22c, "bne $v1, $v0, 0x8003b2c0", "a boost button under the ball"),
    (0x8003b248, "sh $v0, 372($s0)", "writes the count at 372 from the roll's gate"),
    (0x8003b268, "beq $v0, $zero, 0x8003b280", "and from the launch's gate"),
    (0x8003b270, "lh $v1, 494($s0)", "or with the landed flag"),
    (0x8003b278, "bne $v1, $v0, 0x8003b2c0", "standing"),
    (0x8003b280, "addiu $a0, $zero, 10", "makes the sound call with 10"),
    (0x8003b290, "jal 0x8004ddbc", "the call"),
    (0x8003b298, "jal 0x8004f154", "shudders the pad"),
    (0x8003b29c, "addiu $a0, $zero, 1", "with one argument"),
    (0x8003b2a0, "lw $v0, 412($s0)", "reads the long jump's word"),
    (0x8003b2a8, "sh $zero, 372($s0)", "puts the count at nothing"),
    (0x8003b2ac, "bne $v0, $zero, 0x8003b2b8", "and where the word is nothing"),
    (0x8003b2b0, "sw $v1, 100($s0)", "asks the jump"),
    (0x8003b2b4, "sw $v1, 412($s0)", "as the long jump"),
    (0x8003b2b8, "sw $v1, 96($s0)", "forward"),
    (0x8003b2bc, "sw $zero, 92($s0)", "and drops the turn"),
    (0x800301b8, "sh $v0, 494($s0)", "a hop's end marks the ball landed as a landing does"),
    (0x80035e7c, "sh $zero, -23928($at)", "the level's start puts the count at nothing"),
    (0x80035eac, "sh $zero, -23806($at)", "and the landed flag"),
    (0x80030c6c, "addiu $a0, $zero, 102", "a landing makes the sound call with 102"),
    (0x800301f4, "addiu $a0, $zero, 102", "as a hop's end does"),
    (0x800367c0, "addiu $a0, $zero, 113", "and a capture with 113"),
    (0x8004dddc, "slti $v0, $a0, 120", "which the call takes to a table while under 120"),
    (0x800227f8, "sw $a0, 5816($gp)", "the landing's shake keeps its arguments"),
    (0x80022808, "sw $v0, 5812($gp)", "under a flag of 1"),
    (0x80022818, "lw $v1, 5812($gp)", "which a routine of the frame reads"),
    (0x80022838, "bgez $v0, 0x8002287c", "running the count down"),
    # A device's light.
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
    (0x8002d494, "bne $s0, $v0, 0x8002d708", "while a teleporter's light is lit its model is lifted"),
    (0x8002d49c, "lh $a1, 6($s2)", "by its circuit, its f3"),
    (0x8002d4c0, "mult $s5, $v1", "its light times the circuit's"),
    (0x8002d4f8, "sra $s5, $a2, 12", "over 4096"),
    (0x8002d5c0, "bne $s0, $v0, 0x8002d708", "and an open exit's while its light is lit"),
    (0x8002d68c, "bne $s0, $v0, 0x8002d708", "and a switch's"),
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
    # The shadow under the ball and the captivators.
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
    (0x8003e8f8, "subu $v1, $v1, $v0", "less a multiple of its normal"),
    (0x8003e9e4, "lh $v0, -23414($at)", "as strong as the corkscrew's bounce"),
    (0x8003ea08, "jal 0x8005fb58", "less a multiple of its sine"),
    (0x80031f3c, "jal 0x800603f8", "the ball's shadow is widened by the landing's squash"),
    (0x80031f54, "jal 0x800603f8", "and by the breath's"),
    # The moving spikes.
    (0x8002a128, "sh $zero, 6($a1)", "the loader clears a moving spikes slot's f3"),
    (0x8002a130, "sh $v0, 8($a1)", "and writes its f4 for a phase that starts down"),
    (0x8002a178, "sh $t5, 8($a1)", "or held up or retracting"),
    (0x8002bc84, "sh $v0, 8($s3)", "the routine writes f4 as the spikes start to rise"),
    (0x8002be64, "sh $v0, 8($s3)", "and once the harmless frames of the retraction remain"),
    # The vanishing block.
    (0x8002b7e8, "sw $zero, 12($v0)", "a vanishing block that returns starts its faces black"),
    (0x8002b9a0, "sb $zero, 1($v0)", "settled, its faces lose the translucent flag"),
    (0x8002b9fc, "sb $t6, 1($v0)", "and take it as they start to dim"),
    # The invisible block's light.
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
    (0x800513b8, "beq $t9, $zero, 0x800513c4", "which hides every face, or shows it where the flag is set"),
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
    (0x80051630, "srlv $s6, $s6, $s3", "shifted down as far as the top bit is up"),
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
    # The ball's light.
    (0x80035278, "lhu $v1, 22884($at)", "the camera's matrix"),
    (0x80035280, "sh $v1, 276($s0)", "is copied into the ball's state row by row"),
    (0x800315e8, "lh $v0, 282($s3)", "the ball's light is the camera's second row"),
    (0x800315ec, "lh $v1, 288($s3)", "its third"),
    (0x800315f0, "lhu $a0, 276($s3)", "and its first"),
    (0x800315f8, "subu $v0, $zero, $v0", "turned round"),
    (0x80031600, "subu $v0, $v0, $v1", "less the third"),
    (0x80031604, "subu $v0, $v0, $a0", "less the first"),
    (0x8003165c, "jal 0x80060218", "made a unit long"),
    (0x80031fe0, "sh $v0, 6356($gp)", "as the light matrix's first row"),
    (0x80032004, "jal 0x800603f8", "and carried into the ball's frame"),
    (0x80032410, "sw $v0, 80($sp)", "the ball's draw hands on a background"),
    (0x80032418, "sw $v0, 84($sp)", "the light's colour in red"),
    (0x80032454, "sw $zero, 88($sp)", "none from the other two lights"),
    (0x800324a4, "sw $zero, 92($sp)", "nor in green"),
    (0x800324a8, "sw $v0, 96($sp)", "and a base"),
    (0x8002ce80, "sw $t9, -22648($at)", "which the command carries"),
    (0x8002ce94, "sw $v0, -22648($at)", "with the light's colour"),
    (0x8002cee8, "sw $fp, -22648($at)", "and the base"),
    (0x8005446c, "ncct", "the renderer lights a ball's corners by their normals"),
    (0x80054444, "andi $t6, $t6, 255", "keeps the red channel"),
    (0x800545d0, "sll $t4, $t4, 4", "sixteen times over"),
    (0x8005467c, "gpf", "as the share of its light a corner takes"),
    (0x80032158, "addiu $v0, $v0, -4096", "and the ball's own light is 4096 untinted"),
    # The gem's glints.
    (0x80022f84, "jal 0x80023258", "the parser builds the glints' records"),
    (0x80022f5c, "addiu $a1, $zero, 1", "of a model of the second table"),
    (0x80022f74, "addu $a3, $s2, $zero", "a row of it for each pass of the outer loop"),
    (0x80022f78, "sw $s0, 16($sp)", "and a slot for each pass of the inner"),
    (0x800232c0, "sll $v0, $a2, 6", "the model is a type"),
    (0x800232b8, "sll $v1, $a3, 4", "a row a level of detail"),
    (0x8002327c, "sll $a0, $a0, 2", "and a slot a cut"),
    (0x800232f0, "lw $v0, 20($v1)", "a record keeps where the model's colours are"),
    (0x80023310, "addiu $v0, $v1, 8", "past their block's count and length"),
    (0x8002332c, "sra $v0, $v0, 4", "and how many polygons have one, sixteen bytes each"),
    (0x80022f68, "sw $v0, 20($sp)", "the parser hands the builder a chance"),
    (0x80023334, "sw $t2, 8($t0)", "which the record keeps third"),
    (0x80050d6c, "lw $s7, 8($a0)", "and the glint reads as its chance"),
    (0x80022f7c, "sw $t0, 24($sp)", "a rise"),
    (0x80023338, "sw $t3, 12($t0)", "kept fourth"),
    (0x80050e54, "lw $t3, 12($a0)", "and read as the rise"),
    (0x80022f70, "sw $a3, 28($sp)", "a top"),
    (0x8002333c, "sw $t4, 16($t0)", "kept fifth"),
    (0x80050e58, "lw $s1, 16($a0)", "and read as the top"),
    (0x80022f80, "sw $v1, 32($sp)", "a fall"),
    (0x80023340, "sw $t5, 20($t0)", "kept sixth"),
    (0x80050e5c, "lw $s2, 20($a0)", "and read as the fall"),
    (0x80022f88, "sw $v0, 36($sp)", "and how many slots"),
    (0x80023344, "sw $t1, 24($t0)", "kept seventh"),
    (0x80050d78, "lw $v0, 24($a0)", "and read as the slots"),
    (0x80050e84, "addi $a0, $a0, 28", "which start past the record's seven words"),
    (0x80050e94, "addi $a0, $a0, 20", "five words each"),
    (0x8002a6b8, "jal 0x8002a998", "the frame's draw ends"),
    (0x8002aa38, "jal 0x80050d04", "by running the glint over every record"),
    (0x8002aa68, "jal 0x800530b0", "before it draws the models"),
    (0x80050d50, "lw $s6, 0($s7)", "a run steps the state of the glint's own generator"),
    (0x80050d5c, "mult $s6, $t8", "by a multiplier"),
    (0x80050d68, "sw $s6, 0($s7)", "and keeps it"),
    (0x80050d70, "srl $t8, $s6, 16", "a glint starts where the state's high half"),
    (0x80050d74, "mult $t8, $s7", "times the chance"),
    (0x80050d80, "srl $s7, $s7, 16", "over 65536"),
    (0x80050d84, "bne $s7, $zero, 0x80050e54", "is nothing"),
    (0x80050db4, "andi $s6, $s6, 65535", "on the polygon that the low half"),
    (0x80050db8, "mult $s6, $t8", "times the count"),
    (0x80050dc4, "srl $t8, $t8, 16", "over 65536 names"),
    (0x80050df0, "bne $s6, $gp, 0x80050ddc", "unless that polygon is glinting already"),
    (0x80050e18, "beq $t9, $zero, 0x80050e30", "stepping a flat polygon's colour"),
    (0x80050ec8, "add $t8, $t8, $t3", "a corner rises by the rise"),
    (0x80050ecc, "slt $at, $t8, $t6", "to no more than the top"),
    (0x80050f34, "ori $a1, $a1, 32", "until all are there"),
    (0x80050f60, "sub $t8, $t8, $s2", "then falls by the fall"),
    (0x80050f68, "slt $at, $t8, $fp", "to no less than its own"),
    (0x80050fdc, "sw $zero, -20($a0)", "and once all are back its slot is free"),
    (0x800534f4, "lw $s6, 0($s1)", "the renderer reads a polygon's first corner"),
    (0x80053604, "mtc2 $s6, rgbc", "and draws a flat one in that colour"),
    # What the ball takes.
    (0x80035620, "sw $zero, -29572($at)", "the loader marks every slot as not to be taken"),
    (0x80035690, "sw $s4, -29572($at)", "and then a fruit as to be taken"),
    (0x800358dc, "sw $s4, -29572($at)", "a key, a pill or the sunglasses"),
    (0x8003579c, "sw $s4, -29572($at)", "a coin"),
    (0x800357d0, "sw $s4, -29572($at)", "type 42"),
    (0x80035804, "sw $s4, -29572($at)", "an hourglass"),
    (0x80035830, "sw $s4, -29572($at)", "and a gem"),
    (0x80035838, "lh $v0, 6($v1)", "whose stand is by its cut"),
    (0x80035840, "bne $v0, $zero, 0x80035854", "the first cut standing lower"),
    (0x80035640, "beq $v0, $zero, 0x80035924", "a type outside the loader's table"),
    (0x80035928, "beq $a1, $zero, 0x800359fc", "or sent to its plain case lays no entry and is passed over"),
    (0x800359f4, "jal 0x80039ec0", "the loader lays each thing's matrix"),
    (0x80039fa8, "subu $v1, $v1, $a3", "whose translation takes the stand along the top's normal"),
    (0x80039fac, "sw $v1, 28($t0)", "from the block's centre"),
    (0x80039d14, "lw $v1, -29548($at)", "the draw walk takes the translation"),
    (0x80039d24, "addu $v0, $v0, $v1", "adds the offset it turned"),
    (0x80039d30, "sh $v0, 40($v1)", "and keeps the point as the thing's position"),
    (0x800384f4, "addiu $a0, $a0, 104", "the contact walks the cells about the ball from the words at 104"),
    (0x80039198, "slti $v0, $v0, 3", "three over"),
    (0x800391b4, "slti $v0, $v0, 3", "three on"),
    (0x800391d0, "slti $v0, $v0, 3", "and three up"),
    (0x80038548, "slti $v0, $v0, 5", "taking a record of a kind below 5"),
    (0x80038578, "lh $v0, 8($a3)", "and each slot's f4"),
    (0x80038580, "beq $v0, $zero, 0x8003916c", "passing over a slot where it is nothing"),
    (0x80038598, "lw $v0, -29572($at)", "and a thing the loader marked not to be taken"),
    (0x800385a0, "beq $v0, $zero, 0x8003916c", "too"),
    (0x800385b4, "lh $v1, -29536($at)", "it measures from the ball's centre to the thing's position"),
    (0x800385c0, "mult $v0, $v0", "squared"),
    (0x8003862c, "slt $v0, $v0, $v1", "against the thing's reach squared plus the ball's"),
    (0x80038630, "beq $v0, $zero, 0x8003916c", "and passes over one out of reach"),
    (0x80038670, "sw $zero, 7236($gp)", "a thing in reach is to be taken"),
    (0x80038674, "addiu $v0, $v0, -27", "and its type less the first the walk knows"),
    (0x80038680, "sltiu $v0, $v1, 21", "one of the types it knows"),
    (0x80038694, "lw $v0, 568($at)", "picks its case from the table at 0x80010238"),
    (0x80039110, "bne $v0, $zero, 0x80039168", "unless the case asked to keep the thing"),
    (0x80039138, "sh $zero, 8($v0)", "the walk's tail writes 0 into its f4"),
    (0x80039140, "sh $zero, 2($v0)", "and its type"),
    (0x80039158, "jal 0x8002c184", "and repaints its face"),
    (0x800386c4, "lh $v0, 6($v0)", "type 42's case reads its form"),
    (0x800386cc, "bne $v0, $zero, 0x8003873c", "the green scores"),
    (0x80038730, "sw $s2, 7236($gp)", "and the brown is kept"),
    (0x80038700, "sw $v0, -23760($at)", "ending the level"),
    (0x80038b8c, "lh $v0, 6($v1)", "a coin's case reads its tier"),
    (0x80038b94, "bne $v0, $zero, 0x80038bb8", "the first scoring most"),
    (0x80038bbc, "bne $v0, $s2, 0x80038bdc", "the second"),
    (0x80038be4, "bne $v0, $s1, 0x80039108", "and the third least"),
    (0x80038a24, "addiu $v1, $v1, -1", "a key takes one off the keys left"),
    (0x80038a30, "sw $v1, 13308($at)", "at 0x800a33fc"),
    (0x800358bc, "addiu $v1, $v1, 1", "which the loader counted"),
    (0x800358c4, "sw $v1, 13308($at)", "key by key"),
    (0x80038a3c, "bne $v1, $zero, 0x80038a90", "and the last"),
    (0x80038a78, "sh $zero, 6($v0)", "writes 0 into the exit's f3"),
    (0x80038a7c, "sh $s2, 8($v0)", "1 into its f4"),
    (0x80038a84, "sh $s2, 8($v1)", "and 1 into the hidden exit's f4"),
    (0x80035868, "sw $s0, 7516($gp)", "the exit being the last the loader met"),
    (0x80035874, "sh $s4, 6($v1)", "whose f3 it set"),
    (0x8003588c, "sw $s0, 7520($gp)", "the hidden exit the last it met"),
    (0x80035898, "sh $zero, 8($v1)", "whose f4 it cleared"),
    (0x80035a3c, "sw $v0, 7520($gp)", "or the exit again where it met none"),
    (0x80039074, "subu $v0, $v0, $v1", "the hourglass takes the clock from a count"),
    (0x80039094, "sw $v0, 22332($at)", "and writes the difference back as the clock"),
    (0x800390c4, "sw $v1, 21448($at)", "scoring by the seconds of it"),
    (0x800387d4, "sw $v0, -23752($at)", "the lethargy pill sets its word"),
    (0x80038854, "sw $v0, -23744($at)", "the invincibility pill its"),
    (0x800388b8, "sw $v0, -23748($at)", "the bouncy pill its"),
    (0x8003892c, "sw $v0, -23756($at)", "and the sunglasses theirs"),
    (0x80035de0, "addiu $v0, $zero, -1", "which the level's load sets to -1"),
    (0x80035de8, "sw $v0, -23756($at)", "the sunglasses'"),
    (0x80035df0, "sw $v0, -23752($at)", "the lethargy pill's"),
    (0x80035df8, "sw $v0, -23744($at)", "the invincibility pill's"),
    (0x80035e00, "sw $v0, -23748($at)", "and the bouncy pill's"),
    (0x8003b2d0, "bne $v0, $zero, 0x8003b2e4", "the hazards routine finds the sunglasses' word at nothing"),
    (0x8003b2d8, "jal 0x8002bec8", "and starts their blink"),
    (0x8003b2e8, "bltz $v0, 0x8003b2f4", "counting the word down while it is not negative"),
    (0x8003b2dc, "addu $a0, $zero, $zero", "the start called with nothing"),
    (0x8003893c, "jal 0x8002bec8", "the take calls the blink's start"),
    (0x8002bf38, "sw $zero, 24144($at)", "the take's call clears the blink's state"),
    (0x8002bf44, "sw $v1, 23192($at)", "and sets the flag"),
    (0x8002bee8, "sw $v0, 24144($at)", "the start marks the state an off spell's"),
    (0x8002bef8, "sw $v0, 18076($at)", "lays the count"),
    (0x8002bf08, "sw $v0, 18080($at)", "and the timer"),
    (0x8002bf14, "sw $zero, 23192($at)", "and clears the flag"),
    (0x8002bed4, "lw $v1, 13264($v1)", "the four stores indexed by the word that gates every update"),
    (0x8002bedc, "sll $v1, $v1, 2", "four bytes a step"),
    (0x8002bf70, "beq $v1, $a3, 0x8002bf88", "the blink runs an off spell"),
    (0x8002bf78, "beq $v1, $v0, 0x8002bfec", "or an on spell, and otherwise returns"),
    (0x8002bfa0, "bgtz $v0, 0x8002c04c", "returning while the timer stays above nothing"),
    (0x8002c004, "bgtz $v0, 0x8002c04c", "in an on spell too"),
    (0x8002bfc0, "blez $v0, 0x8002c02c", "the count at nothing ends the blink"),
    (0x8002c024, "bgtz $v0, 0x8002c034", "from an on spell too"),
    (0x8002c030, "sw $zero, 0($a2)", "the end clears the state and leaves the flag"),
    (0x8002bfd4, "sw $v0, 0($a2)", "else the state swaps to an on spell"),
    (0x8002bfe0, "sw $a3, 23192($at)", "and the flag goes on"),
    (0x8002c03c, "sw $a3, 0($a2)", "or to an off spell"),
    (0x8002c048, "sw $zero, 23192($at)", "and the flag goes off"),
    (0x80051370, "lw $s5, 0($s5)", "the invisible block's light reads the flag"),
    (0x80051390, "beq $s5, $zero, 0x800513b8", "and draws every face through it"),
    (0x8002a3e8, "jal 0x8002bf50", "the frame's draw runs the blink before the light"),
    (0x8002a3c8, "lw $s0, 12096($gp)", "under a gate of its own"),
    (0x8002a3d8, "bne $s0, $v0, 0x8002a6c8", "which is not read"),
    (0x8003b300, "bltz $v0, 0x8003b310", "and the invincibility pill's"),
    (0x8003b30c, "sw $v0, -23744($at)", "by its step"),
    (0x8003b31c, "bltz $v0, 0x8003b35c", "and while that runs"),
    (0x8003b33c, "sw $v0, -23748($at)", "puts the bouncy pill's word back"),
    (0x8003b358, "sw $zero, -23752($at)", "and the lethargy pill's at nothing"),
    (0x8003b384, "bltz $v0, 0x8003b398", "the lethargy pill's word not negative"),
    (0x8003b38c, "sw $v0, 0($s1)", "counts down by its step"),
    (0x8003b390, "jal 0x8003b468", "and ticks the clock on"),
    # The lethargy pill's hold on the pace, the view and the screen.
    (0x80069a04, "lui $gp, 0x000a", "the start sets gp"),
    (0x80069a08, "addiu $gp, $gp, 12088", "to 0x800a2f38"),
    (0x800387d8, "jal 0x800201f0", "the lethargy pill's case starts the screen's effect"),
    (0x800387dc, "addiu $a0, $zero, 1", "with its start word"),
    (0x800201f4, "lw $v0, 13260($v0)", "which reads the count of players at 0x800a33cc"),
    (0x80020208, "bne $a0, $v0, 0x8002021c", "and asked to start"),
    (0x80020210, "sw $a0, 10228($gp)", "writes the mode word at 0x800a572c"),
    (0x80020224, "beq $v0, $zero, 0x80020230", "or asked to end while the mode stands"),
    (0x8002022c, "sw $v0, 10228($gp)", "marks the end"),
    (0x8003b36c, "bne $v0, $zero, 0x8003b380", "the hazards routine finds the pill's word at nothing"),
    (0x8003b374, "jal 0x800201f0", "and asks the end"),
    (0x8003b378, "addu $a0, $zero, $zero", "with nothing"),
    (0x80040ad8, "bne $v0, $zero, 0x80040af4", "the loop finds the mode word standing"),
    (0x80040af4, "jal 0x80065b68", "and waits through the library's VSync instead"),
    (0x8002076c, "sw $a1, 10740($gp)", "the second half-rate word, 0x800a592c, is written here"),
    (0x80035268, "lw $a0, 548($s0)", "the view routine reads the pill's word at 548 of the record"),
    (0x8003531c, "blez $a0, 0x80035368", "and while it is positive"),
    (0x80035334, "sra $a0, $a0, 12", "takes its product"),
    (0x80035338, "sll $a0, $a0, 12", "modulo"),
    (0x80035340, "subu $a0, $v0, $a0", "a turn"),
    (0x8003533c, "jal 0x8005fb58", "its sine"),
    (0x80035344, "bgez $v0, 0x80035350", "rounded toward nothing"),
    (0x80035360, "jal 0x80061298", "and rolls the view about its line of sight"),
    (0x80035364, "addu $a1, $a1, $s1", "the view the frame draws"),
    (0x8006132c, "subu $t9, $t8, $t9", "the roll takes the sine times the down row off the right row"),
    (0x800613bc, "addu $t9, $t8, $t9", "and adds the sine times the right row to the down row"),
    (0x8001dcd0, "jal 0x8002025c", "the frame's draw runs the screen's routine each pass"),
    (0x80020260, "lw $v1, 10228($gp)", "which reads the mode"),
    (0x80020288, "beq $v1, $v0, 0x800202b4", "the start's pass"),
    (0x80020274, "beq $v1, $a0, 0x80020398", "the passes the pill works"),
    (0x8002029c, "beq $v1, $v0, 0x80020518", "the end's pass"),
    (0x800202a4, "beq $v1, $v0, 0x800205f4", "and the fade's"),
    (0x80024060, "lw $v1, 10240($gp)", "the flash's quad shows a sprite counted from the group's start"),
    (0x80024274, "lhu $v0, -23060($at)", "with its page word"),
    (0x8002428c, "lhu $v0, -23062($at)", "and its palette word"),
    (0x8002423c, "lbu $a1, -23063($at)", "blending where its descriptor's second byte says"),
    (0x80024240, "jal 0x8005f8c8", "so"),
    (0x80023048, "nor $v0, $zero, $s3", "the byte the walker sets where the upload names a blend"),
    (0x8002304c, "sltu $v0, $zero, $v0", "any blend"),
    (0x80023054, "sb $v0, 1($s1)", "second in the descriptor"),
    (0x80023198, "jal 0x8005f808", "and puts the blend in the page word"),
    (0x8002319c, "addu $a1, $s3, $zero", "as named"),
    (0x800202e8, "sb $a2, 4($v0)", "on the pill's pass the quad's red is written"),
    (0x8002032c, "sb $a2, 5($v0)", "its green"),
    (0x8002034c, "sb $a2, 6($v0)", "and its blue"),
    (0x800202cc, "lw $a0, 13268($a0)", "the screen's width at 0x800a33d4"),
    (0x800202e0, "lw $v1, 13276($v1)", "and its height at 0x800a33dc"),
    (0x800202f4, "addiu $a0, $a0, 1", "each a pixel more"),
    (0x80020310, "addiu $v1, $v1, 1", "than the screen"),
    (0x80020300, "sh $a0, 16($v0)", "are the quad's corners across"),
    (0x80020314, "sh $v1, 26($v0)", "and down"),
    (0x80020374, "jal 0x8005f868", "added to the frame's table"),
    (0x800202c4, "sw $a0, 10228($gp)", "and the mode moved on"),
    (0x80020380, "sw $v0, 5148($gp)", "the idle phase"),
    (0x80020384, "sw $v0, 5152($gp)", "the stretch's phase"),
    (0x8002038c, "sw $v0, 5156($gp)", "and the magnitude set"),
    (0x80020398, "lw $v1, 5148($gp)", "each pass after, the idle phase"),
    (0x800203c0, "jal 0x8005fb58", "has its sine taken"),
    (0x800203d4, "sll $v0, $v1, 3", "and thrown away"),
    (0x800203e8, "sb $s0, 22656($at)", "the ghost's red is written"),
    (0x8002040c, "sb $s1, 22657($at)", "its green"),
    (0x80020430, "sb $s0, 22658($at)", "and its blue"),
    (0x80020460, "jal 0x8005f868", "and the ghost added to the frame's table"),
    (0x800204a0, "sb $s0, 22684($at)", "the second sprite's red"),
    (0x800206ac, "jal 0x8005f868", "and that added"),
    (0x8002429c, "beq $s3, $s5, 0x800242ac", "each buffer's ghost is paged at the other buffer's place"),
    (0x800242a8, "lw $a2, 13268($a2)", "the screen's width along"),
    (0x800242b0, "addu $a1, $zero, $zero", "with the blend that takes half of each"),
    (0x800242b4, "jal 0x8005f808", "in its page word"),
    (0x800242d8, "jal 0x80025354", "laid before the sprite"),
    (0x80024308, "sh $s4, 16($s0)", "the sprite is a page wide"),
    (0x80024318, "sh $v0, 18($s0)", "and the screen high"),
    (0x800242f0, "addiu $a1, $zero, 1", "semi-transparent"),
    (0x80024314, "jal 0x8005f8c8", "so"),
    (0x80024324, "addu $a1, $zero, $zero", "and shaded by its colour"),
    (0x80024320, "jal 0x8005f8f8", "so"),
    (0x800243ac, "sh $s4, 8($v0)", "the second sprite starts a page along"),
    (0x800243c0, "sh $v1, 16($v0)", "and is the rest of the width wide"),
    (0x800206c8, "beq $v0, $zero, 0x80020748", "while the mode stands the routine's tail runs"),
    (0x800206dc, "sw $v0, 5156($gp)", "waning the magnitude"),
    (0x800206e0, "blez $v0, 0x80020748", "and while that is positive"),
    (0x80020708, "subu $a0, $v0, $a0", "steps the phase modulo a turn"),
    (0x8002070c, "sw $a0, 5152($gp)", "keeps it"),
    (0x80020710, "jal 0x8005fb58", "takes its sine"),
    (0x80020720, "mult $v0, $v1", "times the magnitude"),
    (0x80020728, "sra $v1, $t0, 12", "over 4096"),
    (0x80020734, "sw $v0, 13272($at)", "adds it to the scale across at 0x800a33d8"),
    (0x8002073c, "subu $v0, $v0, $v1", "and takes it off"),
    (0x80020744, "sw $v0, 13280($at)", "the scale down at 0x800a33e0"),
    (0x80041ba8, "jal 0x80020238", "which the loop puts back as a level is left"),
    (0x80020240, "sw $v0, 13272($at)", "across"),
    (0x80020250, "sw $v0, 13280($at)", "and down"),
    (0x80020248, "sw $zero, 10228($gp)", "with the mode cleared"),
    (0x80020530, "sw $v0, 5404($gp)", "the end's pass sets the fade's level"),
    (0x80020588, "sh $v0, 5340($gp)", "lays the quad's corners again"),
    (0x800205a8, "jal 0x8005f868", "draws the ghost once more"),
    (0x80020518, "sw $v0, 10228($gp)", "and moves the mode on"),
    (0x80020600, "sw $a0, 5404($gp)", "the fade's pass steps the level down"),
    (0x80020604, "bltz $a0, 0x800206bc", "and below nothing"),
    (0x800206bc, "sw $zero, 10228($gp)", "clears the mode"),
    (0x8002062c, "sb $a0, 17416($at)", "else writes the level as the quad's red"),
    (0x80020658, "sb $v1, 17417($at)", "its green"),
    (0x80020680, "sb $v1, 17418($at)", "and its blue"),
    (0x80041034, "jal 0x80014d40", "each pass the loop lays the coprocessor's matrix"),
    (0x80014d4c, "lw $t3, 13272($t3)", "from the scale across"),
    (0x80014d54, "lw $t1, 13280($t1)", "and the scale down"),
    (0x80014e70, "mult $v0, $t3", "the view's first row times the one"),
    (0x80014e80, "mult $v0, $t1", "the second times the other"),
    (0x80014e88, "sra $v0, $t4, 12", "over 4096"),
    (0x80014eb8, "mult $v1, $v0", "the translation across the same"),
    (0x80014ed0, "mult $v1, $v0", "and down"),
    (0x80014ee8, "jal 0x80060718", "loaded"),
    (0x8006072c, "ctc2 $t0, rt11rt12", "as the coprocessor's rotation"),
    (0x800517a8, "addiu $v0, $v0, 13272", "and the meshes' draws take the scale across"),
    (0x800517bc, "mult $a2, $v0", "into their own matrices"),
    (0x8005181c, "ctc2 $a2, rt11rt12", "too"),
    (0x80036bb4, "bltz $v0, 0x80036bc0", "the bouncy pill's word not negative"),
    (0x8003659c, "bne $v0, $zero, 0x800365cc", "and at its hold or more"),
    (0x800365a0, "addiu $v0, $zero, 2", "while the state at 408 is the rolling state's"),
    (0x800365a8, "lw $v1, -23892($v1)", "and no other"),
    (0x800365b0, "bne $v1, $v0, 0x800365cc", "the ball's routine"),
    (0x800365bc, "sw $zero, -24200($at)", "drops the jump"),
    (0x800365c4, "sw $zero, -24204($at)", "and the roll, and the word"),
    (0x800365c8, "sw $v0, 0($a1)", "grows by one"),
    (0x8003b00c, "sw $v0, 21448($at)", "a crumbling block scores"),
    (0x8003afd4, "lh $v1, 2($v0)", "where its type"),
    (0x8003afdc, "bne $v1, $v0, 0x8003b010", "is 1"),
    (0x8003b024, "addiu $v1, $zero, 2", "and the type becomes 2"),
    (0x8003b028, "sh $v1, 2($v0)", "broken"),
    # The devices under the ball, and the level's end.
    (0x8003b398, "jal 0x8003a388", "the hazards routine runs the switch"),
    (0x8003b3a0, "jal 0x8003a58c", "and the teleporter"),
    (0x8003a394, "jal 0x8003b56c", "the switch asks whether the ball is in the air"),
    (0x8003a3a8, "sh $zero, 492($s0)", "clearing the device marker there"),
    (0x8003a3b4, "beq $v0, $v1, 0x8003a578", "does nothing while the marker holds it"),
    (0x8003a3c4, "bne $v0, $v1, 0x8003a578", "or while the ball stands on anything else"),
    (0x8003a3cc, "lhu $v0, 336($s0)", "and asks the progress"),
    (0x8003a3e4, "lhu $v0, 332($s0)", "and the measure across"),
    (0x8003a400, "sh $v1, 492($s0)", "then marks the device"),
    (0x8003a464, "lh $a0, 14($v0)", "and walks the list its f7 starts"),
    (0x8003a49c, "bne $a0, $v0, 0x8003a500", "a laser by its face"),
    (0x8003a4ec, "sh $v1, 6($a1)", "turning its lit flag over"),
    (0x8003a4b8, "lh $a2, 46($a1)", "and reading the next from its second slot"),
    (0x8003a558, "sh $a0, 8($a1)", "a device's f4 turned between 1 and 2"),
    (0x8003a520, "lhu $v1, 12($a1)", "and the next read from its f6"),
    (0x8003a570, "bne $v1, $v0, 0x8003a494", "until the list ends"),
    (0x8003a5a0, "jal 0x8003b514", "the teleporter asks whether the ball is in the air"),
    (0x8003a5b0, "sh $zero, 492($s0)", "clearing the marker there"),
    (0x8003a5c8, "bne $a0, $v0, 0x8003a5f4", "does nothing unless the ball stands on one"),
    (0x8003a5e4, "lh $v1, 8($v0)", "whose f4"),
    (0x8003a5ec, "beq $v1, $v0, 0x8003a600", "is 1"),
    (0x8003a608, "beq $v0, $a0, 0x8003a90c", "and the marker is not its"),
    (0x8003a610, "lhu $v0, 336($s0)", "and asks the progress"),
    (0x8003a620, "beq $v0, $zero, 0x8003a908", "within the band"),
    (0x8003a630, "bne $v0, $s1, 0x8003a654", "starting the count where none runs"),
    (0x8003a63c, "sw $v0, 7472($gp)", "at 0x800a4c68"),
    (0x8003a660, "sw $v0, 7472($gp)", "counting it down"),
    (0x8003a668, "sh $v0, 370($s0)", "holding the pad off"),
    (0x8003a66c, "sw $zero, 96($s0)", "and dropping the roll"),
    (0x8003a680, "bne $s2, $s1, 0x8003a908", "until the count has passed nothing"),
    (0x8003a6b4, "sh $v0, 492($s0)", "then marks the device"),
    (0x8003a6e4, "lhu $v1, 14($v0)", "reads the far end from its f7"),
    (0x8003a710, "sw $v0, 348($s0)", "as the slot the ball stands on"),
    (0x8003a724, "lh $a1, 4($v0)", "takes the far end's f2"),
    (0x8003a734, "jal 0x80038178", "lays the frame by it"),
    (0x8003a750, "swr $v0, 44($s0)", "copies the side into the view's"),
    (0x8003a770, "swr $v0, 36($s0)", "the heading"),
    (0x8003a790, "swr $v0, 52($s0)", "and the normal"),
    (0x8003a86c, "sw $s2, 408($s0)", "puts the ball at rest"),
    (0x8003a878, "sll $a0, $a0, 8", "half a block along the normal"),
    (0x8003a894, "sh $v1, 68($s0)", "from the far end's cell"),
    (0x8003a8ec, "swr $v0, 60($a0)", "as its position"),
    (0x8003a8f8, "jal 0x80037430", "and reads the cells about it again"),
    (0x8003a6cc, "sw $zero, 0($s0)", "the send writes 0 into the record's first word, as a landing does"),
    (0x8003a79c, "lui $v0, 0x000c", "and lays the frame matrix at 212 by the record's address"),
    (0x8003a7a0, "lhu $v0, -24280($v0)", "from the side at 20"),
    (0x8003a7c8, "sh $v0, -24088($at)", "its first store, at 212"),
    (0x8003a83c, "sh $v0, -24072($at)", "the matrix's last halfword, at 228"),
    (0x8003a860, "sh $v0, -24074($at)", "and its last store, at 226"),
    (0x8003817c, "sh $zero, 7184($gp)", "the frame routine's first store, to its scratch by gp"),
    (0x8003825c, "swl $v0, 23($a2)", "its first to the record"),
    (0x800383e0, "sh $v0, 16($a2)", "and its last"),
    (0x800383e4, "jr $ra", "and its return"),
    (0x8003a904, "addiu $v0, $zero, 1", "the send returns 1"),
    (0x8003b3a8, "beq $v0, $zero, 0x8003b3d8", "on which the hazards' routine"),
    (0x8003b3b0, "jal 0x80037430", "reads the cells about the ball again"),
    (0x8003b3b8, "jal 0x80037a98", "and measures where it is within its cell, as the frame does"),
    (0x8003b3cc, "bne $v0, $zero, 0x8003b3d8", "after which a progress past the band"),
    (0x8003b3d4, "sh $zero, 492($s0)", "clears the marker"),
    (0x80036854, "lhu $v0, -23964($v0)", "as does a progress"),
    (0x8003686c, "lhu $v0, -162($s1)", "or a measure across"),
    (0x80036884, "sh $zero, -2($s1)", "off the middle"),
    (0x80030d3c, "sh $s1, 494($s0)", "a landing marks the ball landed"),
    (0x80036834, "sh $zero, 0($s1)", "until the next frame's intents"),
    (0x8003b474, "beq $v1, $v0, 0x8003b4f4", "the clock stands on a clock face"),
    (0x8003b490, "lw $v1, 1144($gp)", "and in the mode"),
    (0x8003b498, "beq $v1, $v0, 0x8003b4c8", "that is 1"),
    (0x8003b4ac, "subu $v0, $v0, $a0", "else ticks down"),
    (0x8003b4b4, "sw $v0, 22332($at)", "at 0x800a573c"),
    (0x8003b4b8, "bgtz $v0, 0x8003b4c8", "and at nothing"),
    (0x8003b4c4, "sw $v0, 24064($at)", "ends the level in the outcome word"),
    (0x8003ad84, "beq $v0, $zero, 0x8003aec8", "with no bonus flag the hazards routine tests the exits"),
    (0x8003aed0, "bne $v1, $v0, 0x8003af44", "the ball standing on the exit"),
    (0x8003aedc, "lw $v0, 13308($v0)", "with the keys left"),
    (0x8003aee4, "bne $v0, $zero, 0x8003af44", "at nothing"),
    (0x8003aef4, "beq $v0, $zero, 0x8003af20", "where it has just landed"),
    (0x8003af14, "sw $v1, 19612($at)", "leaves at once"),
    (0x8003af28, "bne $v0, $zero, 0x8003af3c", "else, with no wait running"),
    (0x8003af30, "sw $v0, 540($s0)", "takes the ending at 540"),
    (0x8003af38, "sh $v0, 370($s0)", "with a wait at 370"),
    (0x8003af44, "bne $v1, $v0, 0x8003afb0", "and the hidden exit"),
    (0x8003af88, "sw $v1, 19612($at)", "leaves at once from a landing"),
    (0x8003afa4, "sw $v0, 540($s0)", "or takes its own ending"),
    (0x8003afac, "sh $v0, 370($s0)", "with the wait"),
    (0x800363f8, "beq $v0, $zero, 0x800364cc", "the ball's routine counts a wait"),
    (0x80036404, "sh $v1, 0($a0)", "down"),
    (0x800364a8, "bne $v0, $zero, 0x800364cc", "and as it runs out"),
    (0x800364b4, "lw $v0, 13264($v0)", "at the view word's index"),
    (0x800364c8, "sw $v1, 19612($at)", "copies the ending to 0x800a4c9c"),
    (0x800365e4, "lw $v1, 19612($at)", "which the routine reads back"),
    (0x800365ec, "bne $v1, $v0, 0x80036630", "from where an exit's"),
    (0x80036600, "beq $v0, $v1, 0x80036638", "with one player"),
    (0x80036610, "bne $v0, $v1, 0x80036640", "or with both results"),
    (0x80036620, "beq $v0, $v1, 0x80036638", "at 1"),
    (0x80036630, "beq $v1, $zero, 0x80036640", "or any other"),
    (0x8003663c, "sw $v1, 24064($at)", "becomes the outcome"),
    (0x80036450, "bne $a0, $v0, 0x80036470", "the spikes'"),
    (0x80036460, "bne $v0, $v1, 0x80036470", "with the wait at 1"),
    (0x8003646c, "sw $a0, 24064($at)", "is written into the outcome directly"),
    (0x8003b058, "bne $s1, $v0, 0x8003b0d0", "the spikes' ending is the invincibility word"),
    (0x8003b0c4, "sw $s1, -23760($at)", "as tested"),
    (0x80035fe0, "sw $v1, 12088($gp)", "the start sets the bonus flag"),
    (0x80030468, "lw $v0, 24176($v0)", "which the landing reads"),
    (0x80030490, "jal 0x8002dc30", "to mark the block under the ball"),
    (0x80030494, "addiu $a3, $zero, 1", "with a mark of 1"),
    (0x8003ae74, "jal 0x8002dc30", "as the hazards routine does every frame"),
    (0x8003ae78, "addiu $a3, $zero, 1", "with the same"),
    (0x8002dcc0, "beq $v1, $v0, 0x8002dd88", "the marking passes where no block is"),
    (0x8002dce0, "beq $a1, $s1, 0x8002dd88", "or one marked already"),
    (0x8002dcf0, "beq $v1, $v0, 0x8002dd88", "or one of the kind it skips"),
    (0x8002dcf8, "sw $s1, 0($a0)", "else marks it"),
    (0x8002dd14, "sw $v0, 0($v1)", "takes one off the count of unmarked blocks"),
    (0x8002dd50, "sw $v0, 21448($at)", "and scores"),
    (0x8002dd70, "jal 0x8002ddac", "and repaints each face"),
    (0x8003ae80, "lw $v0, 24152($v0)", "the count at nothing"),
    (0x8003ae88, "bne $v0, $zero, 0x8003afb0", "ends the level"),
    (0x8003ae98, "beq $v0, $zero, 0x8003aeb0", "at once where the ball has just landed"),
    (0x8003aea4, "sw $v0, 24064($at)", "in the outcome word"),
    (0x8003aeb8, "bne $v0, $zero, 0x8003afb0", "else with no wait running"),
    (0x8003aec4, "sw $v0, 540($s0)", "as an ending"),
    (0x8003aec0, "j 0x8003afa8", "with the hidden exit's wait"),
    (0x80041b18, "bgez $a0, 0x80041b90", "a level that ends badly"),
    (0x80041b24, "lw $v0, 21460($v0)", "in a mode"),
    (0x80041b2c, "blez $v0, 0x80041b38", "past the arcade's"),
    (0x80041b34, "sw $zero, 9360($gp)", "scores nothing"),
    # What harms the ball.
    (0x80035e74, "sh $v0, -23930($at)", "a level's start sets the countdown at 370"),
    (0x80036300, "lh $v0, 12192($gp)", "the ball's routine counts the guard at 0x800a5ed8"),
    (0x80036314, "sh $v0, 12192($gp)", "up by one while it stands"),
    (0x80036328, "sh $zero, 12192($gp)", "and clears it at its limit"),
    (0x80040fdc, "lw $v0, 11976($gp)", "the loop reads the level's outcome word"),
    (0x80040fe4, "bne $v0, $zero, 0x8004100c", "and while it is set"),
    (0x80040fcc, "lw $v0, 14500($v0)", "or the word at 0x800a38a4 that reads as the pause"),
    (0x80040fd4, "bne $v0, $zero, 0x8004100c", "is set"),
    (0x80040fec, "lw $v0, 10432($gp)", "or a third word at 0x800a57f8"),
    (0x80040ff4, "bne $v0, $zero, 0x8004100c", "is set, runs"),
    (0x8004100c, "jal 0x80036aa8", "another routine instead of the ball's"),
    (0x80036aac, "addiu $v0, $zero, 1", "which sets the guard"),
    (0x80036abc, "sh $v0, 12192($gp)", "to one"),
    (0x80036ac0, "jal 0x800347b8", "and runs the ending's view"),
    (0x80036a8c, "sh $zero, 9364($gp)", "the ball's routine takes a request at 0x800a53cc"),
    (0x80036a94, "sw $v1, 14500($at)", "and sets the pause word from it"),
    (0x800408a4, "sw $v0, 10432($gp)", "the third word is set here"),
    (0x80041378, "sw $v0, 10432($gp)", "and here"),
    (0x80040744, "sw $zero, 10432($gp)", "cleared here"),
    (0x80040f40, "sw $zero, 10432($gp)", "and here"),
    (0x80036980, "lw $v0, 24064($v0)", "the draw reads the outcome word"),
    (0x80036988, "bne $v0, $zero, 0x800369b4", "and draws no ball while it is set"),
    (0x80036994, "lw $v0, 22520($v0)", "nor while the third word is"),
    (0x800414c8, "lw $v0, 23204($v0)", "the loop leaves an ending once a flag at 0x800a5aa4 is set"),
    (0x800320b4, "lw $v0, 516($s3)", "the ball's draw reads the heat"),
    (0x800321fc, "sw $v1, 6064($gp)", "into the light's channels"),
    (0x800363e0, "sh $v0, -23930($at)", "the Simon rooms' wrong move sets the countdown"),
    (0x80036bd4, "lh $v0, 12192($gp)", "the input routine, with Cross held"),
    (0x80036bdc, "bne $v0, $zero, 0x8003741c", "reads nothing while the guard stands"),
    (0x80036bec, "sh $zero, 12192($gp)", "and otherwise clears it"),
    (0x800366fc, "lh $v0, 12192($gp)", "the hazards are skipped"),
    (0x80036704, "bne $v0, $zero, 0x80036714", "while it stands"),
    (0x800368bc, "lh $v0, 12192($gp)", "as is the contact"),
    (0x800368c4, "bne $v0, $zero, 0x800368d4", "with what the ball stands on"),
    (0x8003a940, "lw $v0, 156($s0)", "the hazards read the ball's own cell, the word at 156"),
    (0x8003a954, "bne $v0, $v1, 0x8003a99c", "and where it holds a lit beam"),
    (0x8003a968, "bne $v1, $v0, 0x8003a99c", "with no invincibility"),
    (0x8003a978, "bne $v0, $zero, 0x8003a99c", "and no countdown running"),
    (0x8003a980, "sw $v0, 540($s0)", "set the ending at 540"),
    (0x8003a988, "sh $v0, 370($s0)", "the countdown"),
    (0x8003a990, "sh $zero, 312($s0)", "drop the speed"),
    (0x8003a994, "sh $zero, 320($s0)", "and the spin's"),
    (0x8003a998, "sw $v0, 516($s0)", "and set the heat at 516"),
    (0x8003ab48, "bne $v1, $v0, 0x8003ac2c", "on fire"),
    (0x8003ab50, "jal 0x8003b514", "the air is asked after"),
    (0x8003ab58, "bne $v0, $zero, 0x8003abb4", "and on the ground"),
    (0x8003ab6c, "bne $v1, $v0, 0x8003ab84", "with no invincibility"),
    (0x8003ab80, "sw $v0, 516($s0)", "the heat grows"),
    (0x8003abb4, "lh $v1, 494($s0)", "and on the frame after a landing, marked at 494"),
    (0x8003abbc, "bne $v1, $v0, 0x8003abe8", "set"),
    (0x8003abd0, "bne $v1, $v0, 0x8003abe8", "with no invincibility"),
    (0x8003abe4, "sw $v0, 516($s0)", "grows by more"),
    (0x8003abf4, "bne $v0, $zero, 0x8003ac70", "past its limit"),
    (0x8003ac04, "bne $v0, $zero, 0x8003ac70", "with no countdown running"),
    (0x8003ac0c, "sh $v0, 706($s0)", "the ball is frozen at 706"),
    (0x8003ac14, "sw $v0, 540($s0)", "the ending set"),
    (0x8003ac28, "sh $v0, 370($s0)", "and the countdown"),
    (0x8003ac68, "sw $v0, 516($s0)", "off fire the heat cools"),
    (0x8003ac6c, "sw $zero, 516($s0)", "to no less than nothing"),
    (0x8003ad38, "sw $v0, 516($s0)", "and on ice by more"),
    (0x8003642c, "bne $a0, $v0, 0x80036450", "while the fire's countdown runs"),
    (0x80036448, "sh $v0, -23596($at)", "the ball's routine swells the word at 704"),
    (0x80031390, "lh $v1, 704($s3)", "which the draw widens the ball by"),
    (0x80036718, "lw $v1, -23784($v1)", "and the heat"),
    (0x80036754, "jal 0x8004f108", "shakes the pad"),
    (0x8003ac70, "jal 0x8003b514", "the kinds and types under the ball act"),
    (0x8003ac78, "bne $v0, $zero, 0x8003b2c0", "on the ground alone"),
    (0x8003ac8c, "bne $v0, $zero, 0x8003ac98", "the melt at 524 is held"),
    (0x8003ac94, "sw $v0, 524($s0)", "at its top"),
    (0x8003aca0, "bne $v1, $v0, 0x8003acec", "on acid"),
    (0x8003acb0, "bne $v0, $zero, 0x8003acec", "with no countdown running"),
    (0x8003acc4, "bne $v1, $v0, 0x8003ace4", "and no invincibility"),
    (0x8003accc, "sw $v0, 540($s0)", "the ending is set"),
    (0x8003acd8, "sh $v1, 370($s0)", "with the countdown"),
    (0x8003ace0, "sw $v0, 524($s0)", "and the melt grows"),
    (0x8003647c, "bne $v1, $v0, 0x8003649c", "as it does, while the acid's countdown runs"),
    (0x80036498, "sw $v0, -23776($at)", "in the ball's routine"),
    (0x8003b034, "bne $v1, $v0, 0x8003b0d0", "on spikes"),
    (0x8003b044, "bne $v0, $zero, 0x8003b0d0", "with no countdown running"),
    (0x8003b09c, "sh $v0, -23594($at)", "the ball is frozen"),
    (0x8003b0a8, "sh $v0, -23930($at)", "the countdown set"),
    (0x8003b0cc, "sw $v0, -23788($at)", "and the ball marked dying at 512"),
    (0x8003b0d8, "bne $v1, $v0, 0x8003b22c", "on moving spikes"),
    (0x8003b0f4, "lh $s1, 8($v0)", "whose slot's f4"),
    (0x8003b0fc, "bne $s1, $v0, 0x8003b224", "is the deadly value"),
    (0x8003b110, "bne $s2, $v0, 0x8003b224", "with no invincibility"),
    (0x8003b120, "bne $v0, $s1, 0x8003b19c", "on the frame after a landing"),
    (0x8003b180, "sw $s2, -23760($at)", "the ending is the invincibility word's value"),
    (0x8003b188, "sh $v0, -23930($at)", "with the countdown"),
    (0x8003b1a4, "bne $v0, $zero, 0x8003b224", "and standing, with no countdown running"),
    (0x8003b208, "sw $s2, -23760($at)", "the same ending"),
    (0x8003b220, "sh $v0, 370($s0)", "with a countdown of its own"),
    (0x80036760, "lw $v1, -23744($v1)", "the ball's routine reads the invincibility"),
    (0x80036768, "bne $v1, $v0, 0x80036820", "and with none"),
    (0x800367a4, "beq $v0, $zero, 0x80036820", "where the hit test finds a captivator in reach"),
    (0x800367b8, "beq $v0, $s0, 0x80036820", "and the ball is not captured already"),
    (0x800367cc, "jal 0x8004ddbc", "plays a sound"),
    (0x800367ec, "sh $v0, -23594($at)", "freezes the ball"),
    (0x800367f8, "sh $v0, -23930($at)", "sets the countdown"),
    (0x80036804, "sh $zero, -23988($at)", "drops the speed"),
    (0x8003680c, "sh $zero, -23980($at)", "and the spin's"),
    (0x80036814, "sw $s0, -23760($at)", "sets the ending"),
    (0x8003681c, "sw $v0, -23788($at)", "and marks the ball dying"),
    (0x800366d0, "beq $v1, $v0, 0x800366fc", "the captivators stand still once the ball is captured"),
    (0x8003d570, "lw $v0, 7880($gp)", "the hit test runs over the entries"),
    (0x8003d5c8, "mult $v0, $v0", "squaring the ball's distance from each"),
    (0x8003d628, "bne $v1, $t1, 0x8003d644", "a wandering ball"),
    (0x8003d634, "beq $v0, $zero, 0x8003d650", "catches the ball within the shorter reach"),
    (0x8003d644, "slt $v0, $t0, $v0", "and the others"),
    (0x8003d648, "beq $v0, $zero, 0x8003d670", "within the longer"),
    (0x8003c25c, "bne $v1, $v0, 0x8003c538", "the mover's case for the corkscrew"),
    (0x8003c280, "sh $v0, -23414($at)", "steps its angle"),
    (0x8003c290, "bne $v0, $zero, 0x8003c2f8", "and where it has reached 2048"),
    (0x8003c2f0, "jal 0x8004ddbc", "plays the landing's sound"),
    (0x8003c2f8, "lw $v0, 7552($gp)", "then takes the angle mod 2048 every frame"),
    (0x8003c344, "sh $v0, -23414($at)", "which wraps it"),
    (0x8003c36c, "jal 0x8005fb58", "takes its sine"),
    (0x8003c398, "lh $a0, -23572($at)", "and for each axis of the normal"),
    (0x8003c440, "lh $a0, -23570($at)", "the second"),
    (0x8003c4e8, "lh $a0, -23568($at)", "and the third"),
    (0x8003c3b4, "mult $v0, $v1", "multiplies the rise by the sine"),
    (0x8003c3c8, "sra $v1, $v1, 12", "over 4096"),
    (0x8003c3e0, "lhu $v0, -23556($at)", "adds the home"),
    (0x8003c488, "lhu $v0, -23554($at)", "on the second axis"),
    (0x8003c520, "lhu $v0, -23552($at)", "and the third"),
    (0x8003c3f4, "sh $v0, -23564($at)", "and writes the position"),
    (0x8003c49c, "sh $v0, -23562($at)", "on the second axis"),
    (0x8003c534, "sh $v0, -23560($at)", "and the third"),
    (0x8003d5bc, "lh $v1, -23564($at)", "which the hit test reads"),
    (0x8003d5d8, "lh $v1, -23562($at)", "on the second axis"),
    (0x8003d5f4, "lh $v1, -23560($at)", "and the third"),
    (0x80036774, "lhu $v0, -24240($v0)", "the ball's routine passes the hit test the ball's position words"),
    (0x8003677c, "lhu $a0, -24238($a0)", "the second"),
    (0x80036784, "lhu $v1, -24236($v1)", "and the third"),
    (0x8003d5b0, "lh $v0, 0($sp)", "which it takes as they stand"),
    (0x8003d5cc, "lh $v0, 2($sp)", "the second"),
    (0x8003d5f8, "lh $v0, 4($sp)", "and the third"),
    (0x800386e0, "bne $v1, $v0, 0x80038730", "type 42's brown form asks no invincibility"),
    (0x800386f4, "bne $v0, $zero, 0x80038730", "and no countdown running"),
    (0x80038724, "sh $v0, -23930($at)", "and sets the countdown"),
    (0x8002f8a4, "lh $v0, 706($s0)", "frozen, the ball's state"),
    (0x8002f8ac, "bne $v0, $zero, 0x80030228", "does nothing"),
    (0x8002fd08, "lh $v0, 706($s0)", "nor a jump's rows"),
    (0x8002fd10, "bne $v0, $zero, 0x80030228", "anything"),
    (0x8003024c, "lh $v0, 706($s0)", "nor the move step"),
    (0x80030254, "bne $v0, $zero, 0x8003060c", "anything"),
    (0x80030630, "lh $v0, 706($s0)", "nor the landings"),
    (0x80030638, "bne $v0, $zero, 0x800307c8", "anything"),
    (0x80032318, "lw $v0, 512($s3)", "the draw reads the dying mark"),
    (0x80032320, "beq $v0, $zero, 0x8003236c", "and while it stands"),
    (0x80032350, "sh $v0, 6080($gp)", "steps an angle"),
    (0x80032360, "sw $v0, 6064($gp)", "and puts its sine over full into the light's blue"),
    (0x80032364, "sw $v0, 6060($gp)", "green"),
    (0x80032368, "sw $v0, 6056($gp)", "and red"),
    # The invincible ball's colours.
    (0x80032200, "lw $v1, 556($s3)", "the draw reads the invincibility pill's word at 556 of the record"),
    (0x80032208, "beq $v1, $v0, 0x80032318", "and passes the glow over while it is -1"),
    (0x80032210, "lh $a0, 6076($gp)", "otherwise it reads the glow's counter"),
    (0x8003221c, "bgez $v1, 0x80032228", "steps it, rounded toward nothing"),
    (0x8003222c, "sll $v0, $v0, 13", "modulo its round"),
    (0x80032230, "subu $v0, $v1, $v0", "to the remainder"),
    (0x80032234, "sh $v0, 6076($gp)", "which it keeps"),
    (0x80032244, "beq $v0, $zero, 0x80032284", "within the red's turn"),
    (0x8003224c, "bgez $v1, 0x80032258", "the counter's remainder"),
    (0x8003225c, "sll $a0, $a0, 12", "modulo a turn"),
    (0x80032260, "subu $a0, $v1, $a0", "is the angle"),
    (0x80032268, "jal 0x8005fb58", "whose sine"),
    (0x80032274, "lw $a0, 6056($gp)", "times the gain"),
    (0x8003227c, "addu $a0, $a0, $v1", "goes onto the light's red"),
    (0x80032280, "sw $a0, 6056($gp)", "as the draw has tinted it"),
    (0x80032284, "lhu $v1, 6076($gp)", "the counter read again"),
    (0x80032294, "beq $v0, $zero, 0x800322d4", "within the green's turn"),
    (0x800322a4, "bgez $v1, 0x800322b0", "the remainder of the counter less its phase"),
    (0x800322b4, "sll $a0, $a0, 12", "modulo a turn"),
    (0x800322b8, "jal 0x8005fb58", "whose sine"),
    (0x800322bc, "subu $a0, $v1, $a0", "is the angle"),
    (0x800322c4, "lw $a0, 6060($gp)", "times the gain"),
    (0x800322cc, "addu $a0, $a0, $v1", "goes onto the green"),
    (0x800322d0, "sw $a0, 6060($gp)", "as tinted"),
    (0x800322d4, "lh $v1, 6076($gp)", "and read again"),
    (0x800322e0, "bne $v0, $zero, 0x80032318", "from the blue's turn on"),
    (0x800322e8, "bgez $v0, 0x800322f4", "the remainder of the counter less its phase"),
    (0x800322f8, "sll $a0, $a0, 12", "modulo a turn"),
    (0x800322fc, "jal 0x8005fb58", "whose sine"),
    (0x80032300, "subu $a0, $v0, $a0", "is the angle"),
    (0x80032308, "lw $a0, 6064($gp)", "times the gain"),
    (0x80032310, "addu $a0, $a0, $v1", "goes onto the blue"),
    (0x80032314, "sw $a0, 6064($gp)", "as tinted"),
    (0x8003241c, "lw $v0, 6056($gp)", "the three channels"),
    (0x80032420, "lw $t0, 6060($gp)", "as they stand"),
    (0x80032424, "lw $t1, 6064($gp)", "then"),
    (0x80032464, "sw $v0, 16($sp)", "go on the stack"),
    (0x80032468, "sw $t0, 20($sp)", "all three"),
    (0x8003246c, "sw $t1, 24($sp)", "to the model's draw"),
    (0x800324b4, "jal 0x8002ca2c", "the call"),
    (0x80069998, "sw $zero, 0($v0)", "the start clears every word"),
    (0x8006999c, "addiu $v0, $v0, 4", "one after another"),
    (0x800699a0, "sltu $at, $v0, $v1", "up to its end"),
    (0x800699a4, "bne $at, $zero, 0x80069998", "the glow's counter among them"),
    (0x800363f0, "lh $v0, 0($a0)", "the ball's routine counts the countdown"),
    (0x80036418, "sw $zero, -24204($at)", "with the forward request cleared"),
    (0x80036420, "sw $zero, -24208($at)", "the turn's"),
    (0x80036428, "sw $zero, -24200($at)", "and the jump's"),
    (0x80036334, "bne $a0, $v0, 0x80036398", "the Simon rooms' verdict at 0x800a4cb4, done"),
    (0x8003636c, "sw $a0, -23760($at)", "is the exit's ending"),
    (0x800363a0, "bne $v1, $v0, 0x800363e8", "and wrong"),
    (0x800363d4, "sw $v0, -23760($at)", "an ending of its own"),
    (0x80037164, "sh $v0, 7548($gp)", "which the input routine gives"),
    (0x800347c4, "sh $zero, 460($a0)", "the ending's routine marks the ball not live"),
    (0x8003483c, "sh $v0, 6756($gp)", "steps its three angles"),
    (0x800348c8, "jal 0x80060a38", "turns the view by three angles"),
    (0x800348e4, "lw $v0, 7020($gp)", "about the lattice's middle"),
    (0x8003490c, "jal 0x80060508", "turned into the view"),
    (0x80034920, "lw $v1, 7048($gp)", "and puts the eye the free camera's distance"),
    (0x80034964, "sw $v0, 22912($at)", "and more away, whatever the level's mode"),
    (0x80034834, "lw $v1, 21460($v1)", "which it reads at 0x800a53d4"),
    (0x80034840, "bne $v1, $zero, 0x80034870", "in the arcade's steps the fourth angle"),
    (0x80034874, "lw $v1, 21460($v1)", "reads the mode again"),
    (0x8003487c, "bne $v1, $v0, 0x800348ac", "on a level with no key steps it faster"),
    (0x80034954, "lw $v1, 21460($v1)", "and again"),
    (0x80034968, "bne $v1, $zero, 0x800349c8", "in the arcade's"),
    (0x80034974, "jal 0x8005fb58", "takes the sine of the fourth angle"),
    (0x800349c4, "sw $v0, 22912($at)", "and writes the eye's swing over the distance"),
    (0x800349cc, "lw $v1, 21460($v1)", "and once more"),
    (0x800349d4, "bne $v1, $v0, 0x80034a3c", "on a level with no key"),
    (0x80034a38, "sw $v0, 22912($at)", "writes the further swing over it"),
    # The level's mode word.
    (0x80027b3c, "sw $zero, 24316($at)", "the loader's mode routine clears the key count at 0x800a5efc"),
    (0x80027b5c, "lhu $v0, 0($a2)", "reads each record's kind"),
    (0x80027b88, "bne $v0, $t0, 0x80027ba8", "and counts the slots of the key's type"),
    (0x80027bd4, "bne $v0, $zero, 0x80027be8", "with none"),
    (0x80027bdc, "sw $v0, 9372($gp)", "the level's mode word is 1"),
    (0x80027be8, "sw $zero, 9372($gp)", "and otherwise 0"),
    (0x80027c54, "lh $v0, 0($v1)", "the kind of each record"),
    (0x80027c5c, "bne $v0, $t2, 0x80027ca0", "where it is the settings record's"),
    (0x80027c64, "lh $v0, 2($v1)", "its first slot's type"),
    (0x80027c6c, "bne $v0, $a0, 0x80027c78", "where it is the hidden flag"),
    (0x80027c74, "sw $t1, 9372($gp)", "makes the word 2"),
    (0x80027cb4, "lw $v1, 13232($v1)", "and the game's mode word at 0x800a33b0"),
    (0x80027cbc, "bne $v1, $v0, 0x80027cc8", "in the Simon rooms"),
    (0x80027cc4, "sw $zero, 9372($gp)", "puts it back to 0"),
    (0x80041b08, "lw $v0, 10252($gp)", "on the first frame of an ending"),
    (0x80041b10, "bne $v0, $zero, 0x80041bc8", "alone"),
    (0x80041b90, "jal 0x80041f30", "the loop settles the points"),
    (0x80041f6c, "bgez $v0, 0x80042024", "after a death"),
    (0x80041f80, "bne $v0, $zero, 0x80042024", "in the arcade mode"),
    (0x80041f90, "bne $v0, $zero, 0x80041fc8", "outside the finals"),
    (0x80041fd0, "sll $v0, $v0, 1", "where a world is two levels"),
    (0x80041ff4, "bne $v0, $zero, 0x80042000", "the penalty is held at its most"),
    (0x80042000, "lw $v0, 9360($gp)", "and with the level's score at 0x800a53c8"),
    (0x80042008, "addu $v0, $v0, $v1", "added"),
    (0x80042014, "subu $v1, $v1, $v0", "comes off the total at 0x800a5e84"),
    (0x80042018, "sw $v1, 12108($gp)", "kept there"),
    (0x80042054, "addu $v0, $v0, $v1", "which a level completed adds its score to"),
    (0x80042058, "sw $v0, 12108($gp)", "instead"),
    (0x80041ca8, "lw $v0, 12108($gp)", "and as the level is left"),
    (0x80041cb0, "bltz $v0, 0x80041ccc", "a total below nothing"),
    (0x80041e54, "bgez $v0, 0x80041ee0", "is the game's end"),
    (0x80041ec4, "sw $v0, 1280($gp)", "told to the game's loop"),
    (0x800406c4, "bne $v1, $v0, 0x80040210", "which goes back to its start"),
    (0x800401b4, "sw $zero, 12108($gp)", "where the total starts at nothing"),
    (0x80041ecc, "sw $zero, 12108($gp)", "as it does at the game's end"),
    (0x800405bc, "jal 0x80025be4", "and otherwise loads the level again"),
    (0x800405c4, "jal 0x80035d18", "and sets the ball's words afresh"),
    # The blocks under the ball.
    (0x8003b514, "lw $v1, 408($a0)", "the air test reads the ball's state"),
    (0x8003b51c, "beq $v1, $v0, 0x8003b540", "falling"),
    (0x8003b520, "sltiu $v0, $v1, 2", "or in a hop or a jump"),
    (0x8003b534, "slti $v0, $v0, 2", "while its count stands at two or more, the ball is in the air"),
    (0x8003aab0, "bne $v1, $v0, 0x8003aac4", "on ice, before the air test is asked"),
    (0x8003aab8, "sw $v0, 96($s0)", "the hazards make the forward request"),
    (0x8003aac0, "sw $zero, 92($s0)", "and drop the turn's"),
    (0x8003acec, "bne $v1, $v0, 0x8003ad64", "and on the ground on ice, as the heat cools"),
    (0x8003ad4c, "sw $v0, 520($s0)", "the cold at 520 grows"),
    (0x8003ad60, "sw $v0, 520($s0)", "and is set back"),
    (0x8003ad74, "sw $v0, 520($s0)", "off ice it wanes"),
    (0x8003ad78, "sw $zero, 520($s0)", "to no less than nothing"),
    (0x8003a9a4, "bne $v1, $v0, 0x8003aab0", "on an arrow"),
    (0x8003aa48, "lh $a1, 4($v0)", "the hazards take its facing, the slot's f2"),
    (0x8003aa54, "jal 0x80038008", "and lay its way"),
    (0x80038038, "bne $a0, $zero, 0x80038050", "the way routine, on the top"),
    (0x80038044, "sh $v0, 7164($gp)", "lays a first tangent"),
    (0x8003804c, "sh $v0, 7174($gp)", "and a second"),
    (0x800380ac, "addiu $a1, $a1, 19260", "gives the second"),
    (0x800380d0, "bne $t0, $t1, 0x80038100", "for a facing of 2"),
    (0x800380dc, "addiu $a1, $a1, 19252", "the first"),
    (0x80038100, "bne $t0, $a3, 0x80038138", "for 3"),
    (0x80038110, "subu $v0, $zero, $v0", "the second turned round"),
    (0x80038138, "bne $t0, $t2, 0x80038170", "and for 4"),
    (0x80038148, "subu $v0, $zero, $v0", "the first turned round"),
    (0x8003aa68, "bne $v1, $v0, 0x8003aaa0", "and where the heading differs from the way"),
    (0x8003aa80, "bne $v1, $v0, 0x8003aaa0", "on any"),
    (0x8003aa98, "beq $v1, $v0, 0x8003aaa8", "axis"),
    (0x8003aaa4, "sw $zero, -24204($at)", "the forward request is dropped"),
    (0x8003b548, "bne $v1, $v0, 0x8003b554", "in the air over an arrow"),
    (0x8003b550, "sh $v0, 12128($gp)", "the air test sets a flag at 0x800a5e98"),
    (0x8003b55c, "sh $zero, 12128($gp)", "cleared on the ground"),
    (0x800308ac, "lh $v1, 24216($v1)", "which the wall test in the air reads"),
    (0x800308b4, "bne $v1, $v0, 0x800309c8", "and where it stands"),
    (0x800308cc, "bne $v1, $v0, 0x80030908", "a heading differing from the way"),
    (0x800308e4, "bne $v1, $v0, 0x80030908", "on any"),
    (0x800308fc, "beq $v1, $v0, 0x800309c8", "axis"),
    (0x80030914, "jal 0x8004ddbc", "bounces the ball with a sound"),
    (0x800309cc, "sh $zero, 24216($at)", "and one along the way clears the flag"),
    (0x8003afb8, "bne $v1, $v0, 0x8003b034", "on a crumbling block"),
    (0x8002a40c, "jal 0x8002b3ec", "the frame's draw runs the crumbling blocks"),
    (0x8002b4b8, "beq $v1, $v0, 0x8002b4d0", "a block marked broken"),
    (0x8002b4c0, "beq $v1, $t0, 0x8002b5b0", "or breaking"),
    (0x8002b580, "sh $t0, 2($s4)", "is set breaking"),
    (0x8002b58c, "jal 0x800227f4", "with the screen shaken"),
    (0x8002b5bc, "sh $v0, 4($s4)", "and its size at f2 shrinks"),
    (0x8002b5c4, "bltz $v0, 0x8002b624", "until it goes negative"),
    (0x8002b64c, "sw $v0, 0($v1)", "when its faces are undrawn"),
    (0x8002b690, "sh $zero, 2($s4)", "its type cleared"),
    (0x8002b69c, "sh $v0, 0($v1)", "and its lattice cell emptied"),
    (0x80037344, "bgez $v0, 0x8003741c", "the input routine's tail, with the floor ahead empty"),
    (0x80037354, "bgez $v0, 0x8003741c", "and nothing beside the block under"),
    (0x80037364, "bgez $v0, 0x8003741c", "on either side"),
    (0x80037374, "bne $v1, $v0, 0x8003741c", "on a crumbling block"),
    (0x80037384, "bne $v0, $zero, 0x8003741c", "with no jump asked"),
    (0x80037394, "blez $v0, 0x8003741c", "and rolling"),
    (0x800373c0, "sw $zero, 96($s0)", "drops the forward request"),
    (0x800373ec, "sh $v0, 60($s0)", "sets the centre back"),
    (0x80037418, "sh $zero, 312($s0)", "and drops the speed"),
    (0x80033098, "bne $v0, $zero, 0x800334d4", "the platform landing does nothing for a ball riding one"),
    (0x800330a8, "jal 0x800334f0", "and probes"),
    (0x80033518, "sll $v0, $v0, 9", "a block under the centre"),
    (0x80033584, "jal 0x800379e8", "for the cell it lies in"),
    (0x800335b8, "bne $v1, $v0, 0x80033640", "whose record is a platform's"),
    (0x80033624, "jal 0x80032ec4", "with the ball within its body"),
    (0x800330dc, "sh $v0, 486($s0)", "marks the ball riding at 486"),
    (0x800330f0, "sw $s2, 408($s0)", "at rest"),
    (0x800331cc, "subu $v0, $v0, $a0", "keeps the centre relative to the platform's position"),
    (0x80033208, "sh $v0, 84($s0)", "with the travel at 84"),
    (0x80033224, "sw $a1, 528($s0)", "and the record at 528"),
    (0x80033228, "lui $a1, 0x000a", "a second probe"),
    (0x80033230, "jal 0x80033654", "lands the ball against a platform's end"),
    (0x8003314c, "sh $zero, 20052($at)", "the landing lays the platform's blocks along x"),
    (0x8003316c, "sh $zero, 20276($at)", "or y"),
    (0x80033188, "sh $zero, 0($v0)", "or z"),
    (0x80033978, "addiu $t9, $t9, 20016", "into a lattice of its own at 0x800d4e30"),
    (0x800334b8, "jal 0x80033930", "which the cells about a riding ball are read from"),
    (0x80033b30, "lh $v0, 0($v0)", "a word a cell"),
    (0x80033bd0, "jal 0x800379e8", "and then the level's lattice at the ball's true cell"),
    (0x80033be8, "bne $v1, $v0, 0x80033bf4", "where a lit beam"),
    (0x80033bf0, "sw $v1, 156($s0)", "is written over the ball's own cell"),
    (0x80033c30, "jal 0x8004f108", "and the pad shakes while the platform moves"),
    (0x8002f908, "bne $v0, $zero, 0x8002f928", "a ball riding a platform does not fall at rest"),
    (0x8002f96c, "bne $v0, $zero, 0x8002f98c", "nor rolling over nothing"),
    (0x80032c9c, "sh $v0, 238($a1)", "the platform's routine moves its position words"),
    (0x8003b3e0, "beq $v0, $zero, 0x8003b440", "and the hazards take the travel from them"),
    (0x8003b408, "addu $v1, $v1, $a0", "each frame"),
    (0x8003b410, "sh $v0, 84($s0)", "into 84"),
    (0x800314f0, "lhu $v0, 84($s3)", "which the ball's draw adds to the centre"),
    (0x8002f610, "jal 0x80033810", "the forward jump leaves the platform"),
    (0x8002f70c, "jal 0x80033810", "as does the hop"),
    (0x80033818, "sh $v0, 488($a2)", "marking the leave at 488"),
    (0x80033828, "sh $zero, 486($a2)", "unmarking the ride"),
    (0x800338e8, "sh $v1, 60($a2)", "with the centre the level's again"),
    (0x8003391c, "sh $zero, 84($a2)", "and no travel"),
    # The platform landings' direction and body tests.
    (0x800335dc, "jal 0x80037f98", "the body landing takes the face of the ball's normal"),
    (0x80037fa4, "bne $v0, $v1, 0x80037fb4", "which the face routine numbers as the record's slots are numbered"),
    (0x80037fb0, "addiu $v0, $zero, 1", "+x"),
    (0x80037fbc, "addiu $v0, $zero, 4", "-x"),
    (0x80037fd4, "addiu $v0, $zero, 2", "+y"),
    (0x80037fdc, "addiu $v0, $zero, 3", "-y"),
    (0x80037ff4, "addiu $v0, $zero, 5", "+z, the underside"),
    (0x80037ff8, "sltu $v0, $zero, $v0", "-z, the top, 0"),
    (0x80037ffc, "subu $v0, $zero, $v0", "and -1 for anything else"),
    (0x800335f8, "lh $a0, 4($v1)", "and the record's first field, the axis of the run"),
    (0x800335fc, "jal 0x80033c54", "and asks whether the face lies along it"),
    (0x80033c58, "beq $a0, $v1, 0x80033c68", "an axis word of 1"),
    (0x80033c60, "bne $a0, $v0, 0x80033c78", "or 4 is x"),
    (0x80033c68, "beq $a1, $v1, 0x80033cb0", "along which a face of 1"),
    (0x80033c70, "beq $a1, $v0, 0x80033cb0", "or 4 lies"),
    (0x80033c7c, "beq $v0, $zero, 0x80033c90", "an axis word of 2 or 3 is y"),
    (0x80033c88, "bne $v0, $zero, 0x80033cb4", "along which a face of 2 or 3 lies"),
    (0x80033c90, "beq $a0, $zero, 0x80033ca0", "an axis word of 0"),
    (0x80033c98, "bne $a0, $v0, 0x80033cb4", "or 5 is z"),
    (0x80033c9c, "addu $v0, $zero, $zero", "any other axis word answering no"),
    (0x80033ca0, "beq $a1, $zero, 0x80033cb0", "along which a face of 0"),
    (0x80033ca8, "bne $a1, $v0, 0x80033cb4", "or 5 lies"),
    (0x80033cac, "addu $v0, $zero, $zero", "and any other face lies across"),
    (0x80033604, "bne $v0, $zero, 0x80033640", "the body landing refuses a face along the run"),
    (0x8003360c, "lh $v0, 334($s0)", "and reads the distance off the face"),
    (0x8003361c, "addiu $a0, $s0, 60", "the body test takes the centre"),
    (0x80033620, "lw $a1, 6560($gp)", "the record"),
    (0x80033628, "addu $a2, $zero, $zero", "and a slack of nothing"),
    (0x80032ed4, "lh $v0, 34($a1)", "it reads the record's count of blocks"),
    (0x80032ed8, "lh $v1, 4($a1)", "and its axis"),
    (0x80032ef4, "slti $v0, $v1, 3", "dispatching on the axis"),
    (0x80032f08, "j 0x80032fa8", "any other axis word answering as the last call did"),
    (0x80032f1c, "j 0x80032fa8", "either way"),
    (0x80032f24, "lh $v0, 0($a0)", "along x it takes the centre"),
    (0x80032f28, "lh $v1, 238($a1)", "and the platform's position"),
    (0x80032f3c, "sw $v0, 6508($gp)", "keeping the centre plus the slack plus half a block less the position"),
    (0x80032f50, "lh $v1, 240($a1)", "along y the position's y"),
    (0x80032f58, "addiu $v0, $v0, 256", "the same way"),
    (0x80032f78, "lh $v1, 242($a1)", "and along z its z"),
    (0x80032f80, "addiu $v0, $v0, 256", "the same way"),
    (0x80032f98, "subu $v0, $v0, $a2", "then takes the slack off the centre"),
    (0x80032fa4, "sw $v1, 6512($gp)", "keeping the position plus the run plus half a block less that"),
    (0x80032fb0, "bltz $v1, 0x80032fc8", "and answers no where the first is negative"),
    (0x80032fc0, "nor $v0, $zero, $v0", "or the second"),
    (0x80032fc4, "srl $v0, $v0, 31", "is"),
    (0x800330bc, "beq $s1, $s2, 0x80033228", "where the first probe finds nothing the second runs"),
    (0x8003367c, "lwl $v0, 63($s0)", "taking the ball's centre"),
    (0x800336d4, "jal 0x800379e8", "and the cell it lies in"),
    (0x80033708, "beq $v1, $v0, 0x80033790", "keeping a platform's record where that cell names one"),
    (0x80033718, "lh $v0, 28($s0)", "else the cell a block under the centre along the normal"),
    (0x80033754, "jal 0x800379e8", "is looked up"),
    (0x80033768, "bltz $v0, 0x800337f0", "and must name a record"),
    (0x80033788, "bne $v1, $v0, 0x800337fc", "of a platform"),
    (0x800337ac, "jal 0x80037f98", "the end landing takes the face of the normal"),
    (0x800337cc, "jal 0x80033c54", "asks whether it lies along the run"),
    (0x800337d4, "beq $v0, $zero, 0x800337f0", "refusing one across it"),
    (0x800337e0, "jal 0x80032ec4", "and runs the body test"),
    (0x8003325c, "sh $v0, 486($s0)", "the end landing marks the ride"),
    (0x80033270, "sw $s1, 408($s0)", "at rest"),
    (0x80033370, "sh $v0, 60($s0)", "biases the centre as the body landing does"),
    (0x80033398, "jal 0x80037f98", "takes the face of the normal again"),
    (0x800333a4, "sltiu $v0, $v1, 6", "one of the six"),
    (0x800333bc, "lw $v0, 368($at)", "and lays the centre by it through the table at 0x80010170"),
    (0x800333d4, "sh $v0, 60($s0)", "along x toward the near end"),
    (0x800333d8, "lw $v0, 6548($gp)", "or by the count past the far end"),
    (0x80033404, "addiu $v0, $zero, 156", "along y toward the near end"),
    (0x80033410, "lw $v0, 6548($gp)", "or by the count"),
    (0x80033424, "lh $v0, 34($v0)", "of blocks"),
    (0x80033430, "addiu $v0, $v0, 356", "past the far end"),
    (0x8003343c, "j 0x80033468", "along z toward the near end"),
    (0x80033440, "addiu $v0, $zero, 156", "the same way"),
    (0x80033444, "lw $v0, 6548($gp)", "or by the count"),
    (0x80033458, "lh $v0, 34($v0)", "of blocks"),
    (0x80033464, "addiu $v0, $v0, 356", "past the far end"),
    (0x80033468, "sh $v0, 64($s0)", "into the centre's z"),
    (0x80033488, "addiu $v0, $v0, -512", "with the travel"),
    (0x800334a4, "sw $a0, 528($s0)", "and the record kept as the body landing keeps them"),
    # What the ball stands on.
    (0x800377a4, "lw $a0, 120($s0)", "the ball's word for what it stands on is read from the cell under the one its centre lies in, word 4 of the 27"),
    (0x800377b4, "sw $a0, 352($s0)", "kept at 352"),
    (0x80037944, "lh $v0, 2($v0)", "a plain block carrying a record reads as the type of the slot on the ball's face"),
    (0x8003794c, "sw $v0, 356($s0)", "into 356"),
    (0x80037894, "sw $v1, 356($s0)", "fire as its own kind"),
    (0x800378bc, "sw $v1, 356($s0)", "ice too"),
    (0x8003790c, "sw $v1, 356($s0)", "and acid"),
    (0x8003795c, "sw $a0, 356($s0)", "a lattice style of fire the same"),
    (0x80037970, "sw $v1, 356($s0)", "of ice"),
    (0x80037998, "sw $v1, 356($s0)", "and of acid"),
    (0x8003792c, "bne $v0, $zero, 0x800379d0", "a kind with no case leaves the word as it was"),
    (0x800379bc, "bne $v0, $v1, 0x800379c8", "as does a lattice word below the empty one"),
    # The level's end screen.
    (0x80041bf0, "jal 0x80015fe8", "the loop draws the end screen on each pass of an ending"),
    (0x80015ff8, "jal 0x800156e0", "through the loader of its word"),
    (0x800156e4, "lw $v1, 24064($v1)", "which reads the outcome at 0x800a5e00"),
    (0x80015714, "subu $v0, $zero, $v1", "takes its negation"),
    (0x80015718, "bltz $v1, 0x80015784", "for a death"),
    (0x8001571c, "sll $s2, $v0, 1", "doubled, as the index of the word"),
    (0x80015784, "lui $v0, 0x000a", "a death's screen reads the total"),
    (0x80015788, "lw $v0, 24196($v0)", "at 0x800a5e84 for the game's end"),
    (0x80015724, "lw $v1, 13232($v1)", "the mode at 0x800a33b0 opens the other modes' words"),
    (0x80015880, "lw $v0, 13232($v0)", "and the arcade's last final completed, the world counted on"),
    (0x80015a1c, "addu $s2, $zero, $zero", "and the first word where there is no outcome"),
    (0x80015a34, "lw $t0, 24536($t0)", "the table's address is the word at 0x80075fd8"),
    (0x80015a3c, "lw $v0, 0($t0)", "its first word the count of its entries"),
    (0x80015a48, "slt $v0, $v0, $s2", "past which, less two, nothing is drawn"),
    (0x80015a4c, "bne $v0, $zero, 0x80015f2c", "the draw skipped there"),
    (0x80015a88, "sll $v0, $s2, 3", "an entry is eight bytes"),
    (0x80015a94, "lw $v1, 4($v0)", "an offset from the table"),
    (0x80015a90, "lw $a3, 8($v0)", "and a length"),
    (0x80015abc, "jal 0x8005800c", "inflated by the zlib the executable carries"),
    (0x80015acc, "jal 0x80058060", "in one call"),
    (0x80015c28, "addiu $s2, $s2, 1", "a word is two entries, the index's and the next"),
    (0x80015d3c, "addiu $a1, $zero, 2", "the first taken off what is behind it"),
    (0x80015e28, "addiu $a1, $zero, 1", "and the second added to it"),
    # The last final's completion.
    (0x80041c30, "sw $v0, 10252($gp)", "the loop keeps the pass's outcome for the next pass's gate"),
    (0x80041b98, "jal 0x8004245c", "and on an ending's first pass calls the next-level routine"),
    (0x800428d0, "slt $v0, $v0, $v1", "which asks the level within the pack against the pack's count"),
    (0x800428d4, "bne $v0, $zero, 0x8004297c", "and returns while it is below"),
    (0x8004296c, "addiu $v0, $v0, 1", "else counts the world word on"),
    (0x80042970, "sw $v0, 1236($gp)", "at 0x800a340c"),
    (0x80041d48, "sw $zero, 1236($gp)", "which the pass's tail puts back to nothing"),
    (0x80041d4c, "sw $v0, 12108($gp)", "with the total at 0x800a5e84 below it"),
    (0x80041e44, "sw $zero, 1236($gp)", "on its other path as well"),
    (0x80041e48, "sw $v0, 12108($gp)", "the total with it"),
    # A run's bank and the next level.
    (0x80041f34, "lw $v0, 13232($v0)", "the points routine reads the game's mode word"),
    (0x80041f3c, "bne $v0, $zero, 0x8004211c", "and banks the arcade's way where it is nothing"),
    (0x80041f44, "lw $v0, 1212($gp)", "unless the word at 0x800a33f4"),
    (0x80041f4c, "bne $v0, $zero, 0x8004211c", "is set"),
    (0x80041f54, "lw $v0, 1244($gp)", "or the word at 0x800a3414"),
    (0x80041f5c, "bne $v0, $zero, 0x800420f0", "is"),
    (0x80042974, "addiu $v0, $zero, 1", "which the next-level routine sets"),
    (0x80042978, "sw $v0, 1244($gp)", "as a world ends"),
    (0x80042004, "lw $a0, 9396($gp)", "a death reads the bank at 0x800a53ec"),
    (0x80042010, "sw $a0, 10028($gp)", "and puts it back into the pickups' word at 0x800a5664"),
    (0x80042024, "lw $v0, 9396($gp)", "any other ending reads the bank"),
    (0x80042028, "lw $a0, 10028($gp)", "and the pickups' word"),
    (0x80042030, "beq $v0, $a0, 0x80042048", "and where they differ"),
    (0x80042038, "lhu $v0, 10756($gp)", "counts a fruit at 0x800a593c"),
    (0x80042040, "addiu $v0, $v0, 1", "one on"),
    (0x80042044, "sh $v0, 10756($gp)", "kept there"),
    (0x80042050, "sw $a0, 9396($gp)", "and banks the pickups' word"),
    (0x80038ca4, "lw $v0, 22116($v0)", "which a fruit's case reads"),
    (0x80038f58, "sw $v0, 22116($at)", "and writes with its bit set"),
    (0x80042460, "lw $v0, 21460($v0)", "the next-level routine reads the level's mode word"),
    (0x80042468, "bne $v0, $zero, 0x800424b4", "and numbers an ordinary level alone"),
    (0x80042470, "lw $v0, 1308($gp)", "by the finals flag at 0x800a3454"),
    (0x80042478, "bne $v0, $zero, 0x8004249c", "in two ways"),
    (0x80042490, "addu $v0, $v0, $v1", "the world's place times fifteen plus the slot"),
    (0x800424a8, "addu $v0, $v0, $v1", "or twice the place plus the slot"),
    (0x800424b0, "sw $v0, 1224($gp)", "into the word at 0x800a3400"),
    (0x800424b4, "lw $v0, 1212($gp)", "and returns while the word at 0x800a33f4"),
    (0x800424bc, "bne $v0, $zero, 0x8004297c", "is set"),
    (0x800424c8, "lw $v0, 13232($v0)", "the arcade's branch is the game's mode word's"),
    (0x800424d0, "bne $v0, $zero, 0x80042618", "at nothing"),
    (0x800424dc, "lw $v0, 21460($v0)", "on an ordinary level"),
    (0x800424e4, "bne $v0, $zero, 0x80042618", "alone"),
    (0x800424ec, "lw $v1, 11976($gp)", "with the outcome"),
    (0x800424f4, "blez $v1, 0x80042618", "a way out"),
    (0x800424fc, "bne $v1, $v0, 0x80042544", "the hidden exit's outcome going its own way"),
    (0x80042504, "lw $v0, 1232($gp)", "which counts the slot at 0x800a3408"),
    (0x8004250c, "addiu $v0, $v0, 1", "on by one"),
    (0x80042510, "sw $v0, 1232($gp)", "kept"),
    (0x80042514, "bne $v0, $v1, 0x8004252c", "and where that is the slot after the last ordinary level"),
    (0x80042520, "lw $v0, 24576($v0)", "reads the pack's count at 0x80156000"),
    (0x80042528, "sw $v0, 1232($gp)", "instead"),
    (0x8004252c, "lw $v1, 1232($gp)", "then takes the slot"),
    (0x80042534, "sw $v0, 1232($gp)", "makes it the hidden level's"),
    (0x80042538, "sw $v1, 10716($gp)", "and keeps the slot after at 0x800a5914"),
    (0x80042544, "lw $v0, 1232($gp)", "the exit's way counts the slot"),
    (0x80042548, "lw $v1, 9396($gp)", "and reads the bank"),
    (0x8004254c, "addiu $a0, $v0, 1", "on by one"),
    (0x80042558, "sw $a0, 1232($gp)", "kept"),
    (0x8004255c, "bne $v1, $v0, 0x800425f0", "and with every fruit banked"),
    (0x80042564, "sw $zero, 10028($gp)", "clears the pickups' word"),
    (0x80042568, "sw $zero, 9396($gp)", "and the bank"),
    (0x8004256c, "sw $a0, 10716($gp)", "keeps the slot after"),
    (0x80042570, "bne $a0, $v0, 0x80042598", "the count instead where that is the slot after the last ordinary level"),
    (0x80042578, "lw $v0, 1296($gp)", "and the word at 0x800a3448"),
    (0x80042580, "bne $v0, $zero, 0x8004259c", "is clear"),
    (0x8004258c, "lw $v0, 24576($v0)", "the count"),
    (0x80042594, "sw $v0, 10716($gp)", "kept"),
    (0x8004259c, "lw $v0, 1232($gp)", "and takes the slot"),
    (0x800425a4, "addiu $v0, $v0, -1", "finished"),
    (0x800425c0, "subu $a0, $a0, $v0", "over five, rounded toward nothing"),
    (0x800425dc, "subu $a0, $a0, $v0", "less three times its third"),
    (0x800425e4, "sw $a0, 1232($gp)", "for the bonus slot"),
    (0x800425f0, "bne $a0, $v0, 0x80042618", "else, where the slot after is the one after the last ordinary level"),
    (0x800425f8, "lw $v0, 1296($gp)", "and the word at 0x800a3448"),
    (0x80042600, "bne $v0, $zero, 0x80042618", "is clear"),
    (0x8004260c, "lw $v0, 24576($v0)", "the pack's count"),
    (0x80042614, "sw $v0, 1232($gp)", "is the slot"),
    (0x800427d4, "lw $v0, 21460($v0)", "a bonus or a hidden level"),
    (0x800427dc, "blez $v0, 0x800428c0", "by the level's mode word"),
    (0x800427e4, "lw $v0, 1232($gp)", "with its slot"),
    (0x800427ec, "lw $v1, 24576($v1)", "within the pack's count"),
    (0x800427f8, "beq $v0, $zero, 0x8004285c", "alone"),
    (0x80042800, "lw $v0, 1296($gp)", "and the word at 0x800a3448"),
    (0x80042808, "bne $v0, $zero, 0x8004285c", "clear"),
    (0x80042810, "lw $v0, 9396($gp)", "reads the bank"),
    (0x8004281c, "bne $v0, $v1, 0x80042850", "and short of every fruit"),
    (0x80042850, "lw $v0, 10716($gp)", "goes back to the slot kept"),
    (0x80042858, "sw $v0, 1232($gp)", "whatever its outcome"),
    (0x80042824, "lw $v1, 10716($gp)", "else reads the slot kept"),
    (0x80042828, "sw $zero, 10028($gp)", "clears the pickups' word"),
    (0x8004282c, "sw $zero, 9396($gp)", "and the bank"),
    (0x80042834, "bne $v0, $zero, 0x80042854", "and picks the bonus slot by the slot kept"),
    (0x80042840, "bne $v0, $zero, 0x80042854", "in thirds"),
    (0x800428c0, "lw $v0, 1232($gp)", "a slot"),
    (0x800428c8, "lw $v1, 24576($v1)", "at the pack's count or past it"),
    (0x800428dc, "lw $v1, 1296($gp)", "asks the word at 0x800a3448"),
    (0x800428e4, "beq $v1, $v0, 0x80042928", "whose 1 would start the next world at its last slot"),
    (0x800428f8, "beq $v1, $zero, 0x8004291c", "and whose 0"),
    (0x8004291c, "sw $zero, 1232($gp)", "starts it at its first"),
    (0x8004290c, "beq $v1, $v0, 0x80042938", "and whose 2"),
    (0x80042938, "sw $v0, 1232($gp)", "at its first bonus level"),
    (0x80042934, "addiu $v0, $v0, -1", "the last slot being the count less one"),
    (0x8004288c, "lw $v1, 1296($gp)", "the same 2"),
    (0x80042894, "bne $v1, $v0, 0x800428c0", "would run the bonus levels on"),
    (0x800428ac, "sw $v0, 1232($gp)", "one after another"),
    (0x800428bc, "sw $a1, 1232($gp)", "and the count past the third, the hidden level passed over"),
    (0x800482e4, "sw $zero, 13384($at)", "the word at 0x800a3448 is cleared by a routine the loop calls"),
    (0x8004adc4, "sw $zero, 13384($at)", "and twice by the routine the loop runs on each pass of an ending"),
    (0x8004b5dc, "sw $zero, 13384($at)", "on another of its paths"),
    (0x800403b4, "lw $a0, 1236($gp)", "the game's loop takes the world word"),
    (0x800403c4, "sw $a0, 1240($gp)", "for the world's place at 0x800a3410"),
    (0x800403c8, "jal 0x8004ccf8", "and loads the world's pack"),
    (0x800403cc, "ori $a2, $a2, 24576", "at 0x80156000"),
    (0x80041e84, "sw $zero, 1232($gp)", "the game's end puts the slot back to 0"),
    (0x80041e88, "bne $v0, $zero, 0x80041eb4", "and past the first world"),
    (0x80041eb4, "sw $zero, 1236($gp)", "the world word"),
    (0x80041e70, "lw $v0, 1212($gp)", "unless the word at 0x800a33f4 is set"),
    (0x80041e78, "bne $v0, $zero, 0x80041ec4", "when both are passed over"),
    (0x80041ed0, "sw $zero, 10028($gp)", "and clears the pickups' word"),
    (0x80041ed4, "sw $zero, 9396($gp)", "and the bank"),
    (0x800401a8, "sw $zero, 10028($gp)", "as the game's start clears them"),
    (0x800401ac, "sw $zero, 9396($gp)", "both"),
    (0x800401b0, "sw $zero, 9360($gp)", "with the score"),
    (0x80042afc, "sw $v0, 1212($gp)", "a routine the loop calls sets the word at 0x800a33f4"),
    (0x800462c8, "sw $v0, 13396($at)", "a routine writes the finals flag from a table"),
    (0x8004910c, "sw $s0, 13396($at)", "and another sets it to 1"),
    # The Simon rooms.
    (0x80036e4c, "lh $v0, 460($s0)", "the Simon rooms' case asks whether the ball is live"),
    (0x80036e54, "beq $v0, $zero, 0x80037178", "and reads nothing until it is"),
    (0x80036e5c, "lh $a0, 7548($gp)", "nor while the verdict at 0x800a4cb4"),
    (0x80036e64, "beq $a0, $v1, 0x80037178", "is the sequence done"),
    (0x80036e6c, "beq $a0, $v0, 0x80037178", "or a wrong move"),
    (0x80036e74, "lw $v1, 408($s0)", "the idle count asks the state"),
    (0x80036e7c, "bne $v1, $v0, 0x80036eac", "at rest"),
    (0x80036e84, "lw $v0, 420($s0)", "and the turn"),
    (0x80036e8c, "bne $v0, $zero, 0x80036eac", "not running"),
    (0x80036e94, "lhu $v0, 7508($gp)", "and grows at 0x800a4c8c"),
    (0x80036ea0, "sh $v0, 7508($gp)", "a frame"),
    (0x80036eac, "sh $zero, 7508($gp)", "or goes back to nothing"),
    (0x80036eb0, "lw $v1, 10976($gp)", "the pad's word"),
    (0x80036ebc, "beq $v0, $zero, 0x80036ec8", "with Up held"),
    (0x80036ec4, "sh $v0, 1152($gp)", "sets Up's latch at 0x800a33b8"),
    (0x80036ecc, "beq $v0, $zero, 0x80036ed8", "and with Cross held"),
    (0x80036ed4, "sh $v0, 1150($gp)", "Cross's at 0x800a33b6"),
    (0x80036ed8, "lh $v0, 1152($gp)", "with Up's latch"),
    (0x80036ee0, "beq $v0, $v1, 0x80036ef8", "set"),
    (0x80036ee8, "lh $v0, 1150($gp)", "or Cross's"),
    (0x80036ef0, "bne $v0, $v1, 0x80036f08", "set"),
    (0x80036ef8, "lhu $v0, 7512($gp)", "the latch's count at 0x800a4c90"),
    (0x80036f04, "sh $v0, 7512($gp)", "grows"),
    (0x80036f08, "lh $v0, 7512($gp)", "and once it is no longer under the latch's frames"),
    (0x80036f14, "bne $v0, $zero, 0x80036f38", ""),
    (0x80036f1c, "lh $v0, 1150($gp)", "Cross's latch"),
    (0x80036f20, "lh $v1, 1152($gp)", "and Up's"),
    (0x80036f24, "sh $zero, 7512($gp)", "with the count cleared"),
    (0x80036f28, "sh $zero, 1150($gp)", "and both latches"),
    (0x80036f2c, "sh $zero, 1152($gp)", ""),
    (0x80036f30, "sw $v0, 100($s0)", "become the jump request"),
    (0x80036f34, "sw $v1, 96($s0)", "and the roll request"),
    (0x80036f38, "lh $v0, 7508($gp)", "the idle count"),
    (0x80036f44, "beq $v0, $zero, 0x80036fb0", "under the latch's gate"),
    (0x80036f4c, "lw $v1, 408($s0)", "reads the state"),
    (0x80036f50, "sh $zero, 7512($gp)", "and clears the latch's count"),
    (0x80036f54, "sh $zero, 1150($gp)", "and both latches"),
    (0x80036f58, "sh $zero, 1152($gp)", ""),
    (0x80036f5c, "bne $v1, $v0, 0x80036fb0", "and at rest"),
    (0x80036f64, "lw $v0, 420($s0)", "with no turn running"),
    (0x80036f6c, "bne $v0, $zero, 0x80036fb0", ""),
    (0x80036f74, "lh $v0, 490($s0)", "reads the index at 490"),
    (0x80036f80, "lui $at, 0x000d", "into the sequence"),
    (0x80036f88, "lh $v0, 32644($at)", "at 0x800d7f84"),
    (0x80036f90, "bne $v0, $v1, 0x80036fa8", "and where it holds no move"),
    (0x80036f9c, "sh $v0, 13400($at)", "sets the flag at 0x800a3458"),
    (0x80036fac, "sh $zero, 13400($at)", "or clears it"),
    (0x80036fb0, "lh $v0, 7508($gp)", "the idle count"),
    (0x80036fbc, "beq $v0, $zero, 0x80036fd4", "under the turn's gate"),
    (0x80036fc4, "sw $zero, 100($s0)", "drops the jump"),
    (0x80036fc8, "sw $zero, 92($s0)", "the turn"),
    (0x80036fcc, "j 0x8003700c", "and"),
    (0x80036fd0, "sw $zero, 96($s0)", "the roll"),
    (0x80036fd4, "lw $v0, 10976($gp)", "else the pad's word"),
    (0x80036fe0, "beq $v0, $zero, 0x80036ff0", "with Left held"),
    (0x80036fe8, "sw $v0, 92($s0)", "asks a turn"),
    (0x80036fec, "sh $zero, 7508($gp)", "and puts the idle count at nothing"),
    (0x80036ff0, "lw $v0, 10976($gp)", "and with Right held"),
    (0x80036ffc, "beq $v0, $zero, 0x8003700c", ""),
    (0x80037004, "sw $v0, 92($s0)", "the other turn"),
    (0x80037008, "sh $zero, 7508($gp)", "the idle count at nothing again"),
    (0x80037060, "lw $v0, 92($s0)", "a frame with no turn asked"),
    (0x80037068, "bne $v0, $zero, 0x80037098", ""),
    (0x80037070, "lw $v0, 96($s0)", "no roll"),
    (0x80037078, "bne $v0, $zero, 0x80037090", ""),
    (0x80037080, "lw $v0, 100($s0)", "and no jump"),
    (0x80037088, "beq $v0, $zero, 0x80037178", "reads no further"),
    (0x80037098, "sh $zero, 7076($gp)", "the move at 0x800a4adc starts at nothing"),
    (0x8003709c, "bne $v0, $a1, 0x800370a8", "a turn right"),
    (0x800370a4, "sh $v0, 7076($gp)", "is its bit"),
    (0x800370b0, "bne $v0, $v1, 0x800370c8", "a turn left"),
    (0x800370c4, "sh $v0, 7076($gp)", "adds its own"),
    (0x800370d0, "bne $v0, $v1, 0x800370e8", "the roll"),
    (0x800370e4, "sh $v0, 7076($gp)", "its own"),
    (0x800370f0, "bne $v0, $v1, 0x80037108", "and the jump"),
    (0x80037104, "sh $v0, 7076($gp)", "its own"),
    (0x80037108, "lh $v0, 490($s0)", "the index at 490"),
    (0x8003710c, "lui $v1, 0x000d", "into the sequence"),
    (0x80037110, "addiu $v1, $v1, 32644", "at 0x800d7f84"),
    (0x8003711c, "lh $v1, 0($a0)", "reads the move stored"),
    (0x80037124, "bne $v1, $a1, 0x80037154", "and where there is none"),
    (0x8003712c, "lhu $v0, 7076($gp)", "stores the move"),
    (0x80037134, "sh $v0, 0($a0)", ""),
    (0x80037138, "lh $v1, 490($s0)", "and where the index"),
    (0x8003713c, "lh $v0, 7540($gp)", "is the count of moves at 0x800a4cac"),
    (0x80037144, "bne $v1, $v0, 0x80037168", ""),
    (0x8003714c, "j 0x80037164", "gives the verdict"),
    (0x80037154, "lh $v0, 7076($gp)", "else holds the move to the one stored"),
    (0x8003715c, "beq $v1, $v0, 0x80037168", ""),
    (0x80037168, "lhu $v0, 490($s0)", "and the index"),
    (0x80037174, "sh $v0, 490($s0)", "counts on"),
    (0x80036364, "lw $v0, 1140($gp)", "the sequence done reads the turn at 0x800a33ac"),
    (0x80036394, "sw $v0, 1140($gp)", "and passes it to the other player"),
    (0x800417ac, "lw $v0, 14500($v0)", "the frame loop, not paused"),
    (0x800417bc, "lw $v0, 11976($gp)", "with no outcome"),
    (0x800417cc, "lh $v0, 1312($gp)", "reads the flag"),
    (0x800417d4, "bne $v0, $s2, 0x800417e0", "and hands it"),
    (0x800417e0, "jal 0x80012d88", "to a routine not read here"),
    (0x80035d1c, "lw $v1, 1144($gp)", "the level's start reads the game's mode word"),
    (0x80035d38, "bne $v1, $v0, 0x80035d80", "for the Simon rooms' branch"),
    (0x80035d40, "lhu $v1, 7544($gp)", "which reads the round at 0x800a4cb0"),
    (0x80035d4c, "sh $v0, -23930($at)", "writes its wait into the countdown at 370"),
    (0x80035d50, "lhu $v0, 7540($gp)", "reads the count of moves"),
    (0x80035d58, "sh $zero, 13400($at)", "clears the flag"),
    (0x80035d5c, "sh $zero, 7548($gp)", "the verdict"),
    (0x80035d60, "sh $zero, 7512($gp)", "the latch's count"),
    (0x80035d64, "sh $zero, 7508($gp)", "the idle count"),
    (0x80035d6c, "sh $zero, -23810($at)", "and the index at 490"),
    (0x80035d78, "sh $v0, 7540($gp)", "and keeps the count"),
    (0x80035d7c, "sh $v1, 7544($gp)", "and the round"),
    (0x80035cdc, "lui $v0, 0x000e", "the reset fills the sequence from its last halfword"),
    (0x80035ce0, "addiu $v0, $v0, -30846", "at 0x800d8782"),
    (0x80035ce4, "sh $a1, 0($v0)", "with no move"),
    (0x80035cec, "bgez $v1, 0x80035ce4", "down to its first"),
    (0x80035cf8, "sh $v0, 7540($gp)", "puts the count of moves at its first"),
    (0x80035cfc, "sw $a0, 1140($gp)", "the turn to the player given"),
    (0x80035d04, "sh $zero, 7544($gp)", "the round at nothing"),
    (0x80035d0c, "sh $v0, 13400($at)", "and the flag set"),
    (0x800405d0, "lw $v0, 13232($v0)", "the game's loop reads the mode word after the start"),
    (0x800405d8, "bne $v0, $s0, 0x80040610", "and in the Simon rooms"),
    (0x800405e0, "lw $v0, 10188($gp)", "with the last outcome at 0x800a5704"),
    (0x800405e8, "bgtz $v0, 0x80040610", "not above nothing"),
    (0x800405f4, "lw $a0, 14496($a0)", "flips the word at 0x800a38a0"),
    (0x80040604, "sw $a0, 14496($at)", ""),
    (0x80040608, "jal 0x80035cd4", "and resets the match with it as the player"),
    (0x80041ee0, "lw $v0, 11976($gp)", "the level loop returns the outcome"),
    (0x80040698, "sw $v0, 10188($gp)", "which the game's loop keeps"),
    (0x800496ac, "sw $s0, 13232($at)", "the menu that starts the mode sets the mode word"),
    (0x800496b8, "sw $s0, 2408($gp)", "and the word at 0x800a38a0 alike"),
    (0x80049678, "addiu $v0, $v0, 22252", "and clears the points from the second player's word"),
    (0x8004967c, "sw $zero, 0($v0)", ""),
    (0x80049684, "bgez $v1, 0x8004967c", "down to the first's"),
    (0x80041b3c, "lw $v0, 13232($v0)", "an ending below nothing reads the mode word"),
    (0x80041b44, "bne $v0, $s2, 0x80041b90", "and in the Simon rooms"),
    (0x80041b50, "lw $v1, 13228($v1)", "takes the turn"),
    (0x80041b68, "sll $v0, $a0, 1", "round the two players"),
    (0x80041b6c, "subu $a0, $v1, $v0", ""),
    (0x80041b74, "addiu $v0, $v0, 22248", "into the points at 0x800a56e8"),
    (0x80041b78, "sll $v1, $a0, 2", "a word a player"),
    (0x80041b80, "lw $v0, 0($v1)", "one more"),
    (0x80041b8c, "sw $v0, 0($v1)", ""),
    (0x8004261c, "lw $v1, 13232($v1)", "the next-level routine reads the mode word"),
    (0x80042624, "bne $v1, $v0, 0x800426d8", "for the Simon rooms' branch"),
    (0x80042630, "lw $v0, 21460($v0)", "on a level whose mode word"),
    (0x80042638, "bne $v0, $zero, 0x800426d8", "is nothing"),
    (0x80042640, "lw $v0, 11976($gp)", "with the outcome"),
    (0x80042648, "bgez $v0, 0x800426d4", "below nothing"),
    (0x80042654, "lw $a1, 14496($a1)", "and the word at 0x800a38a0"),
    (0x8004265c, "bne $a1, $v1, 0x800426b0", "at 1"),
    (0x80042664, "lw $a0, 1228($gp)", "reads the furthest level at 0x800a3404"),
    (0x80042670, "lw $v1, 1236($gp)", "the world word"),
    (0x80042674, "lw $v0, 1232($gp)", "and the slot"),
    (0x8004267c, "sw $v1, 1236($gp)", "each one on"),
    (0x80042684, "sw $v0, 1232($gp)", ""),
    (0x8004269c, "slt $v0, $v0, $v1", "and where the furthest world falls short of the new one"),
    (0x800426a0, "beq $v0, $zero, 0x800426ac", ""),
    (0x800426a8, "sw $zero, 1236($gp)", "puts the world back to the first"),
    (0x800426ac, "sw $a1, 1244($gp)", "and has the files loaded afresh through 0x800a3414"),
    (0x800426b0, "lw $v0, 1236($gp)", "a world word"),
    (0x800426bc, "bne $v0, $zero, 0x800426cc", "at the worlds' count or past it"),
    (0x800426c4, "sw $zero, 1232($gp)", "puts the slot"),
    (0x800426c8, "sw $zero, 1236($gp)", "and the world back to nothing"),
    (0x800157ec, "lw $v1, 13232($v1)", "the end screen reads the mode word"),
    (0x800157f4, "bne $v1, $v0, 0x8001587c", "for the Simon rooms"),
    (0x80015800, "lw $v0, 13320($v0)", "with the slot at 0x800a3408"),
    (0x80015808, "bne $v0, $zero, 0x8001587c", "at nothing"),
    (0x80015814, "lw $v1, 22248($v1)", "reads the first player's points"),
    (0x80015820, "beq $v0, $zero, 0x80015840", "and under the gate"),
    (0x8001582c, "lw $v0, 22252($v0)", "the second's"),
    (0x80015838, "bne $v0, $zero, 0x8001587c", "and leaves the word where both are under it"),
    (0x80015844, "lw $v0, 24064($v0)", "else with the outcome"),
    (0x8001584c, "bgez $v0, 0x8001587c", "below nothing"),
    (0x80015858, "lw $a0, 22252($a0)", "holds the two"),
    (0x80015860, "slt $v0, $a0, $v1", "against each other"),
    (0x80015870, "bne $v1, $a0, 0x8001587c", "and names the winner, or neither"),
    (0x8004ad2c, "lui $v0, 0x000a", "menu code reads the last pad"),
    (0x8004ad38, "lw $v1, 23064($v1)", "and the pad"),
    (0x8004ad48, "beq $v1, $zero, 0x8004ae2c", "for a press of Cross"),
    (0x8004ad54, "lw $v0, 13320($v0)", "with the slot"),
    (0x8004ad5c, "bne $v0, $zero, 0x8004ae2c", "at nothing"),
    (0x8004ad68, "lw $v0, 22248($v0)", "asks the first player's points"),
    (0x8004ad74, "beq $v0, $zero, 0x8004ad94", "against the gate"),
    (0x8004ad80, "lw $v0, 22252($v0)", "and the second's"),
    (0x8004ad8c, "bne $v0, $zero, 0x8004ae2c", ""),
    (0x8004adcc, "sw $v0, 24196($at)", "and past it puts the total at 0x800a5e84 below nothing"),
    (0x8004ade0, "sw $zero, 13228($at)", "with the turn cleared"),
    (0x8004adf0, "sw $zero, 13324($at)", "and the world word"),
    # The effects.
    (0x80011520, "addiu $v0, $v0, -4", "startup clears the twelve pointers a word at a time"),
    (0x80011524, "lui $v0, 0x000a", "and fills them from seven tables in the data"),
    (0x80011550, "lw $a1, 23216($a1)", "reads how many effect sprites the .GGI header counts"),
    (0x80011594, "sw $a0, 5088($gp)", "the last pointer filled, kind 10's"),
    (0x800115f8, "sb $v1, 5124($gp)", "and the last byte of the sprites' colours"),
    (0x800115fc, "blez $a1, 0x800118a0", "lays no quad where the header counts none"),
    (0x80011618, "addiu $s0, $s0, -19372", "the quads lie at 0x800ab454"),
    (0x80011620, "jal 0x8005f928", "each set up as a textured quad"),
    (0x8001163c, "lw $v1, 23212($v1)", "from the sprite the header's first word names on"),
    (0x8001165c, "lbu $a1, -23063($at)", "whether the sprite's upload named a blend"),
    (0x80011660, "jal 0x8005f8c8", "makes the quad semi-transparent"),
    (0x80011694, "sb $v0, 12($s0)", "the sprite's place and size give the first corner's texture coordinates"),
    (0x800116c4, "sb $v0, 13($s0)", ""),
    (0x80011708, "sb $v1, 20($s0)", "the second's"),
    (0x80011738, "sb $v0, 21($s0)", ""),
    (0x80011768, "sb $v0, 28($s0)", "the third's"),
    (0x800117ac, "sb $v1, 29($s0)", ""),
    (0x800117f0, "sb $v1, 36($s0)", "and the fourth's"),
    (0x80011834, "sb $v1, 37($s0)", ""),
    (0x80011868, "sh $v0, -19358($at)", "its palette word"),
    (0x80011884, "sh $v0, -19350($at)", "and its page word, which holds the blend"),
    (0x800118c4, "sll $a0, $a0, 2", "an effect starts from a kind"),
    (0x800118d0, "lw $t1, 17136($at)", "whose table the pointers at 0x800a42f0 hold"),
    (0x800118d8, "beq $t1, $zero, 0x80011ab8", "none for a kind without one"),
    (0x800118e4, "lw $a3, 13264($a3)", "the player's word at 0x800a33d0"),
    (0x800118f0, "sll $v1, $a3, 2", "picks the count"),
    (0x800118f4, "addu $t0, $v1, $v0", "a word a player from 0x800a4320"),
    (0x800118f8, "lw $a0, 0($t0)", "the count at 0x800a4320"),
    (0x80011904, "beq $v0, $zero, 0x80011ab8", "stops it at sixteen"),
    (0x80011914, "bltz $v0, 0x80011930", "a position whose third word is below nothing is on the HUD"),
    (0x80011920, "lw $v1, 13260($v1)", "else the count of players at 0x800a33cc"),
    (0x80011928, "bne $v1, $v0, 0x80011ab8", "must be one"),
    (0x80011958, "addu $v0, $v0, $a0", "the entry lies at its index in the player's list"),
    (0x80011964, "sw $t1, -18924($at)", "and takes the table"),
    (0x80011994, "sh $v1, -18932($at)", "the position's three words"),
    (0x800119c4, "sh $v1, -18930($at)", ""),
    (0x800119f4, "sh $v1, -18928($at)", ""),
    (0x80011a20, "sw $zero, -18916($at)", "a frame count at nothing"),
    (0x80011a4c, "sw $a2, -18912($at)", "the light"),
    (0x80011a78, "sh $zero, -18920($at)", "and an angle a particle at nothing"),
    (0x80011aa4, "sh $zero, -18918($at)", ""),
    (0x80011aa8, "lw $v0, 0($t0)", "and the count"),
    (0x80011ab4, "sw $v0, 0($t0)", "goes up by one"),
    (0x80011ac0, "lui $v0, 0x000a", "the run"),
    (0x80011b04, "lw $v0, 17184($at)", "reads the count"),
    (0x80011b74, "lh $v1, 2($v0)", "the table's frames"),
    (0x80011b80, "lw $v0, -18916($at)", "against the entry's frame count"),
    (0x80011b88, "slt $v0, $v0, $v1", ""),
    (0x80011b8c, "bne $v0, $zero, 0x80011d8c", "drawn while the count is under them"),
    (0x80011b9c, "lw $a0, -18912($at)", "else the light"),
    (0x80011ba0, "jal 0x8002f2cc", "is let go"),
    (0x80011bcc, "sw $v1, 0($v0)", "the count comes down"),
    (0x80011be8, "addu $a1, $a1, $fp", "and the entries after move up one"),
    (0x80011d10, "bne $v0, $zero, 0x80011be8", "to the last"),
    (0x80011d84, "beq $v0, $zero, 0x80011b94", "and the index is tried again"),
    (0x80011dec, "lh $a0, 0($t4)", "the table's count of particles"),
    (0x80011e08, "lh $v0, 0($v0)", "read again for the loop"),
    (0x80011e18, "addu $t4, $t4, $v1", "finds the frame's rows past the header"),
    (0x80011e5c, "lh $v0, 0($s7)", "a row's size"),
    (0x80011e68, "lh $v1, -18928($at)", "and the position's third word"),
    (0x80011e6c, "bgez $v0, 0x80011e78", "the size"),
    (0x80011e74, "subu $s5, $zero, $s5", "taken positive"),
    (0x80011e78, "bgez $v1, 0x800122fc", "a third word not below nothing is a position in the world"),
    (0x80011f4c, "lhu $v0, 2($s7)", "the row's brightness"),
    (0x80011f54, "sb $v0, 4($v1)", "goes into the quad's three channels"),
    (0x80011f9c, "sb $v0, 5($v1)", ""),
    (0x80011fe4, "sb $v0, 6($v1)", ""),
    (0x80012014, "lh $s3, -18932($at)", "on the HUD the position is the point"),
    (0x80012018, "lh $v1, -2($s7)", "the row's angle"),
    (0x80012024, "lh $s2, -18930($at)", ""),
    (0x80012028, "bgez $v1, 0x800120c0", "below nothing"),
    (0x80012030, "jal 0x80047418", "draws one from the dice"),
    (0x80012078, "sh $v0, 0($v1)", "kept in the entry's slot for the particle"),
    (0x80012084, "mult $s5, $v0", "the size times the cosine"),
    (0x800120d4, "lh $a0, 0($v0)", "else the slot's angle"),
    (0x800120dc, "addu $a0, $v1, $a0", "plus the row's"),
    (0x80012134, "mult $s5, $v0", "and times the sine"),
    (0x8001213c, "lh $v0, 0($s7)", "the size"),
    (0x80012144, "bltz $v0, 0x800121d8", "below nothing picks the square off a corner"),
    (0x80012194, "addu $v0, $s3, $s1", "the corners about the middle"),
    (0x800121d4, "sh $v0, 34($v1)", ""),
    (0x800121d8, "lui $t5, 0x000b", "the corners off one at the middle"),
    (0x80012220, "addu $a0, $s3, $s1", "the first the size on at the angle"),
    (0x80012238, "sh $v0, 10($v1)", ""),
    (0x80012248, "sh $s3, 24($v1)", "the third at the middle"),
    (0x8001224c, "sh $s2, 26($v1)", ""),
    (0x80012254, "sh $a0, 34($v1)", ""),
    (0x800122b0, "addiu $v0, $v0, 23452", "the HUD's table at 0x800a5b9c"),
    (0x800122bc, "lw $a1, 0($a0)", "takes the quad"),
    (0x800122d0, "sw $a1, 0($a0)", ""),
    (0x800122f4, "j 0x800129f4", "past the colour's sum"),
    (0x800122fc, "sll $a0, $a1, 5", "in the world the view's matrix"),
    (0x80012324, "addu $a0, $a0, $s0", "is set"),
    (0x8001235c, "addu $v0, $t4, $t5", "and the position"),
    (0x80012374, "bne $v0, $zero, 0x800129f4", "a particle too near is skipped"),
    (0x80012380, "lh $a1, -2($s7)", "the row's angle"),
    (0x80012388, "bgez $a1, 0x8001248c", "below nothing"),
    (0x80012390, "jal 0x80047418", "draws one from the dice"),
    (0x800123dc, "sh $v0, 0($v1)", "kept in the slot"),
    (0x800123e4, "bne $a1, $zero, 0x800123f0", "where the cosine shifted down by 16 is nothing"),
    (0x80012440, "div $a2, $a1", "divides the size where the depth should"),
    (0x80012454, "bne $a1, $zero, 0x80012460", "the sine's"),
    (0x8001247c, "div $v0, $a1", "likewise"),
    (0x800124c4, "lh $a0, 0($v0)", "else the slot's angle"),
    (0x800124cc, "addu $a0, $a1, $a0", "plus the row's"),
    (0x800124d4, "lw $v1, 13284($v1)", "the screen's distance"),
    (0x800124dc, "mult $s5, $v1", "times the size"),
    (0x800124ec, "div $v1, $s0", "over the depth"),
    (0x800124f0, "mflo $a1", ""),
    (0x80012510, "mult $a1, $v0", "times the cosine"),
    (0x80012540, "mflo $t0", ""),
    (0x80012578, "mult $v1, $v0", "and times the sine"),
    (0x80012588, "lui $a0, 0x000a", "the corners against the screen"),
    (0x80012618, "bne $a1, $zero, 0x800129f4", "every one off it skips the particle"),
    (0x80012628, "lh $a3, 0($t4)", "the row's sprite"),
    (0x80012640, "lbu $v0, 17192($at)", "its colour's first byte"),
    (0x800126cc, "sll $v0, $a3, 2", "its quad"),
    (0x8001270c, "sb $t4, 56($sp)", "the third byte times the brightness summed"),
    (0x80012748, "sw $v1, 4($t0)", "the quad copied into the entry"),
    (0x80012798, "sb $v0, 4($v1)", "the brightness in the quad's channels"),
    (0x800127e0, "sb $v0, 5($v1)", ""),
    (0x80012828, "sb $v0, 6($v1)", ""),
    (0x8001282c, "lh $v0, 0($s7)", "the size"),
    (0x80012834, "bltz $v0, 0x800128c0", "below nothing picks the square off a corner"),
    (0x8001287c, "addu $v0, $s3, $s1", "the corners about the middle"),
    (0x800128bc, "sh $v0, 34($v1)", ""),
    (0x800128c0, "lui $t4, 0x000b", "the corners off one at the middle"),
    (0x80012908, "addu $a0, $s3, $s1", "the first the size on at the angle"),
    (0x80012920, "sh $v0, 10($v1)", ""),
    (0x80012930, "sh $s3, 24($v1)", "the third at the middle"),
    (0x80012934, "sh $s2, 26($v1)", ""),
    (0x8001293c, "sh $a0, 34($v1)", ""),
    (0x80012950, "lui $t1, 0x000d", "the frame's ordering table"),
    (0x80012954, "addiu $t1, $t1, 11808", "at 0x800d2e20"),
    (0x800129b8, "lw $a2, 0($a1)", "takes the quad at its first word"),
    (0x800129f0, "sw $v0, 0($v1)", ""),
    (0x80012a54, "lw $t4, 32($sp)", "where a particle was drawn"),
    (0x80012a5c, "bne $t4, $zero, 0x80012ab4", ""),
    (0x80012a94, "lw $a0, -18912($at)", "the light"),
    (0x80012ab0, "or $a1, $v1, $a1", "takes the sum, the first byte highest"),
    (0x80012b1c, "sw $v1, 176($v0)", "and the frame count goes up"),
    (0x800142b4, "addiu $v0, $v0, 23452", "the HUD's own primitives link into the same table"),
    (0x80020768, "sw $v0, 10992($gp)", "the flash is marked running at 0x800a5a28"),
    (0x80020770, "sw $a0, 5408($gp)", "its first is the mode"),
    (0x80020774, "beq $a0, $v0, 0x800207a8", "mode 1"),
    (0x800207ac, "sw $v0, 5412($gp)", "the strength"),
    (0x800207b8, "lw $a0, 10992($gp)", "the run reads the mark"),
    (0x800207c0, "bne $a0, $v0, 0x8002094c", "and does nothing while it is down"),
    (0x800207c8, "lw $v1, 5408($gp)", "by the mode"),
    (0x8002082c, "sw $v0, 5412($gp)", "the strength comes down"),
    (0x80020830, "lw $a0, 5412($gp)", "and while above nothing"),
    (0x80020838, "blez $a0, 0x80020944", ""),
    (0x80020864, "sb $a0, 17516($at)", "goes into the quad's three channels"),
    (0x80020894, "sb $v1, 17517($at)", ""),
    (0x800208ac, "addiu $t1, $t1, 11808", "the frame's table"),
    (0x800208c4, "sb $v1, 17518($at)", ""),
    (0x800208e8, "sll $v0, $v1, 9", "takes the quad"),
    (0x80020940, "sw $v0, 0($v1)", "at its first word"),
    (0x80020944, "sw $zero, 10992($gp)", "else the mark"),
    (0x80020948, "sw $zero, 10740($gp)", "and the word are cleared"),
    (0x80022ed8, "sw $v0, 11124($gp)", "the .GGI parser keeps the header's first word"),
    (0x80022ee0, "sw $a0, 11128($gp)", "and its second"),
    (0x800233a4, "jal 0x80024414", "the level's load lays the flash's quad"),
    (0x80024414, "addiu $sp, $sp, -48", ""),
    (0x8002441c, "lw $v1, 21460($v1)", "reading the level's mode word"),
    (0x80024464, "sw $v0, 5412($gp)", "and starting the flash on a level with no key"),
    (0x80024488, "jal 0x8005f808", "a page word"),
    (0x800244b0, "jal 0x8002539c", "before a flat quad"),
    (0x800244b8, "addiu $a0, $s0, 8", "the quad"),
    (0x800244cc, "lw $v1, 13288($v1)", "the screen's width"),
    (0x80024500, "jal 0x8005f8c8", "made semi-transparent"),
    (0x80024504, "sh $a2, 22($v0)", "its last corner at the height plus one"),
    (0x8002539c, "addiu $sp, $sp, -24", "the page word and the quad"),
    (0x800253c4, "jal 0x8005fa78", "merges the quad behind the page word"),
    (0x8002a354, "addiu $v1, $v1, 11808", "the loop's routine before the draw sends the table"),
    (0x8002a6b0, "jal 0x800207b8", "the frame's draw runs the flash"),
    (0x8002f2b4, "sll $a0, $a0, 5", "a light takes its colour"),
    (0x8002f2cc, "sll $a0, $a0, 5", "and is let go"),
    (0x800389c0, "addu $a0, $zero, $zero", "a key's HUD effect is kind 0"),
    (0x800389d8, "addu $a2, $zero, $zero", "with no light"),
    (0x80038c0c, "lw $v0, 1144($gp)", "a fruit's HUD effect asks the game's mode word"),
    (0x80038c14, "beq $v0, $s1, 0x80038c2c", "and is skipped at 2"),
    (0x80038c18, "addu $a0, $zero, $zero", "kind 0"),
    (0x80038c28, "addu $a2, $zero, $zero", "with no light"),
    (0x80038cc8, "addiu $a1, $a1, 13172", "at the second fruit's icon"),
    (0x80038d70, "addiu $a1, $a1, 13180", "the third's"),
    (0x80038e18, "addiu $a1, $a1, 13188", "the fourth's"),
    (0x80038ec0, "addiu $a1, $a1, 13196", "and the fifth's"),
    (0x80038f64, "addu $a0, $zero, $zero", "type 27's case, never reached, starts kind 0 at each icon"),
    (0x80038ffc, "addu $a1, $a1, $s0", "and kind 4 at the thing"),
    (0x8003907c, "lui $a1, 0x000a", "the hourglass's HUD effect"),
    (0x80039080, "addiu $a1, $a1, 13156", "at the clock's point, 0x800a3364"),
    (0x80039084, "addu $a2, $zero, $zero", "with no light"),
    (0x800390c8, "jal 0x800118c4", ""),
    (0x8003a64c, "addu $a2, $zero, $zero", "the teleporter's HUD effect has no light"),
    (0x8003a684, "addu $a0, $zero, $zero", "the send starts the flash in mode 0"),
    (0x80040ae4, "lw $v0, 22828($v0)", "the frame loop reads the word at 0x800a592c"),
    (0x80040aec, "bne $v0, $s2, 0x80040b04", "and at 1"),
    (0x80040b40, "jal 0x8005c7c0", "the loop clears the frame's table each pass"),
    (0x80041014, "jal 0x8002a1b4", "the loop's routine before the draw"),
    (0x8004101c, "jal 0x8002a3c0", "the frame's draw"),
    (0x8005f808, "andi $v0, $a0, 3", "a page word's blend goes in bits 5 and 6"),
    (0x8005fa78, "lbu $v0, 3($a0)", "the merge sums the two lengths into the first's tag"),
    (0x8005fba8, "lui $at, 0x000a", "the sine table"),
    (0x8005fbb0, "lh $v0, -15860($at)", "at 0x8009c20c"),
    (0x800609c8, "lwc2 vxy0, 0($a0)", "the projection"),
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
    ("the ball", "ball.light.down", "its light takes the camera's row down the screen shifted up this far", 0x800315f4,
     "sll $v0, $v0, {}"),
    ("the ball", "ball.light.into", "and its row into the screen this far", 0x800315fc, "sll $v1, $v1, {}"),
    ("the ball", "ball.light.background", "a corner's light stands on this background", 0x8003240c,
     "addiu $v0, $zero, {}"),
    ("the ball", "ball.light.colour", "with this of 4096 of how squarely the light falls", 0x80032414,
     "addiu $v0, $zero, {}"),
    ("the ball", "ball.light.base", "times this base", 0x800324a0, "addiu $v0, $zero, {}"),
    ("the ball", "ball.rest", "rests with its centre this far off its face, units", 0x8002f8ec, "addiu $a1, $zero, {}"),
    ("the ball", "move.middle", "has come to the middle of its cell at this progress, units from the edge behind",
     0x80030e4c, "slti $v1, $v1, {}"),
    ("the ball", "move.middle.last", "where the last frame's progress was short of this", 0x80030e60, "slti $v0, $v0, {}"),
    ("the ball", "move.middle.past", "and a roll that may not go on is past the middle from this", 0x800302d4,
     "slti $v0, $v0, {}"),
    ("the ball", "move.stop", "a stop at the middle lays the centre at this", 0x8003029c, "addiu $a1, $zero, {}"),
    ("the ball", "move.stop.refused", "as does a refused roll's", 0x80030304, "addiu $a1, $zero, {}"),
    ("the ball", "move.ice", "may roll over an edge beside a neighbour on this kind alone", 0x80030e34, "xori $v0, $v0, {}"),
    ("the ball", "move.ice.slide", "and slides on past the middle on it", 0x800302dc, "addiu $v0, $zero, {}"),
    ("the ball", "move.climb", "a wall ahead takes the ball up it at this progress", 0x800303a0, "slti $v0, $v0, {}"),
    ("the ball", "move.touch", "laying its centre at this, touching the wall", 0x8003049c, "addiu $a1, $zero, {}"),
    ("the ball", "move.wrap", "an edge takes it round at this progress", 0x80030540, "slti $v0, $v0, {}"),
    ("the ball", "move.lattice", "a cell at this or past it on an axis reads empty", 0x800375fc, "slti $v0, $t0, {}"),

    ("the ball's roll", "pad.up", "the pad's bit for Up, which asks the roll while held", 0x80036e20, "andi $v0, $v0, {}"),
    ("the ball's roll", "pad.cross", "and for Cross, which asks the jump while held", 0x80036e38, "andi $v0, $v0, {}"),
    ("the ball's roll", "pad.left", "and for Left, which asks a turn as it is pressed", 0x80036cb0, "andi $v0, $v0, {}"),
    ("the ball's roll", "pad.right", "and for Right", 0x80036cd8, "andi $v0, $v0, {}"),
    ("the ball's roll", "pad.r1", "and for R1, which pitches the view down", 0x80037180, "andi $v0, $v0, {}"),
    ("the ball's roll", "pad.r2", "and for R2, which pitches it up", 0x80037198, "andi $v0, $v0, {}"),
    ("the ball's roll", "pad.turn.left", "a turn asked by Left is this", 0x80036c70, "addiu $a0, $zero, {}"),
    ("the ball's roll", "pad.turn.right", "and by Right this", 0x80036ce4, "addiu $v0, $zero, {}"),
    ("the ball's roll", "pad.repeat", "a held Left or Right presses again this many frames after a turn", 0x80036b10,
     "addiu $v0, $zero, {}"),
    ("the ball's roll", "roll.gain", "rolling, the speed grows by this a frame, units", 0x8002f9ac, "addiu $v0, $v0, {}"),
    ("the ball's roll", "roll.top.gate", "while under this", 0x8002f9bc, "slti $v0, $v0, {}"),
    ("the ball's roll", "roll.top", "to this", 0x8002f9c4, "addiu $v0, $zero, {}"),
    ("the ball's roll", "roll.recentre", "and the centre moves across toward the middle by this a frame", 0x8002f938,
     "addiu $a1, $zero, {}"),
    ("the ball's roll", "roll.fall.from", "over nothing the ball falls from this progress", 0x8002f954, "addiu $v0, $v0, {}"),
    ("the ball's roll", "roll.fall.span", "for this many units of it", 0x8002f958, "sltiu $v0, $v0, {}"),
    ("the ball's roll", "roll.fall", "starting down at this a frame", 0x8002f980, "addiu $v0, $zero, {}"),
    ("the ball's roll", "roll.fall.rest", "as from rest", 0x8002f91c, "addiu $v0, $zero, {}"),
    ("the ball's roll", "roll.resume", "the last wrap's flag stands until this progress", 0x8002f994, "slti $v0, $v0, {}"),
    ("the ball's roll", "turn.frames", "a turn left runs the view's yaw for this many frames", 0x8002f824,
     "addiu $v0, $zero, {}"),
    ("the ball's roll", "turn.step", "by this a frame", 0x8002f82c, "addiu $v0, $zero, {}"),
    ("the ball's roll", "turn.frames.right", "a turn right for this many", 0x8002f7ac, "addiu $v0, $zero, {}"),
    ("the ball's roll", "turn.step.right", "by this", 0x8002f7b4, "addiu $v0, $zero, {}"),
    ("the ball's roll", "turn.left", "the view is told of a turn left by this", 0x8002f818, "addiu $v0, $zero, {}"),
    ("the ball's roll", "turn.right", "and of a turn right by this", 0x8002f7a4, "addiu $a0, $zero, {}"),
    ("the ball's roll", "turn.clamp.gate", "while the yaw runs a speed at this or more", 0x80034c00, "slti $v1, $v1, {}"),
    ("the ball's roll", "turn.clamp", "is clamped to this", 0x80034c10, "addiu $v0, $zero, {}"),
    ("the ball's roll", "wrap.frames", "an edge runs the view's pitch for this many frames", 0x80030578,
     "addiu $v0, $zero, {}"),
    ("the ball's roll", "wrap.step", "by this a frame", 0x80030580, "addiu $v0, $zero, {}"),
    ("the ball's roll", "wrap.resume", "and the arc ends with the centre this far off the new face, units", 0x8002fca0,
     "addiu $a1, $zero, {}"),
    ("the ball's roll", "climb.frames", "a wall runs the view's pitch for this many frames", 0x800304a8,
     "addiu $v0, $zero, {}"),
    ("the ball's roll", "climb.step", "by this a frame", 0x800304b0, "addiu $v0, $zero, {}"),
    ("the ball's roll", "fall.gain", "falling, the speed down grows by this a frame, units", 0x8002ffb8, "addiu $v0, $v0, {}"),
    ("the ball's roll", "fall.top.gate", "while over this", 0x8002ffc8, "slti $v0, $v0, {}"),
    ("the ball's roll", "fall.top", "to this", 0x8002ffd0, "addiu $v0, $zero, {}"),
    ("the ball's roll", "fall.hop", "a hop over nothing starts down at this", 0x800301e0, "addiu $v0, $zero, {}"),
    ("the ball's roll", "fall.spin.gain", "the spin's speed grows by this a frame while the roll is asked", 0x8002ff30,
     "addiu $v0, $v0, {}"),
    ("the ball's roll", "fall.spin.top.gate", "while under this", 0x8002ff40, "slti $v0, $v0, {}"),
    ("the ball's roll", "fall.spin.top", "to this", 0x8002ff48, "addiu $v0, $zero, {}"),
    ("the ball's roll", "fall.spin.wane", "and wanes by this otherwise", 0x8002ff5c, "addiu $v0, $v0, {}"),
    ("the ball's roll", "fall.back", "a bounce's speed back decays by this a frame", 0x8002ff98, "addiu $v0, $v1, {}"),
    ("the ball's roll", "fall.wall.gate", "a falling ball at this progress or past it, with a block ahead", 0x80030734,
     "slti $v0, $v0, {}"),
    ("the ball's roll", "fall.wall", "is held at this", 0x80030754, "addiu $a1, $zero, {}"),
    ("the ball's roll", "fall.behind.gate", "and short of this, with a block behind", 0x80030760, "slti $v0, $v0, {}"),
    ("the ball's roll", "fall.behind", "at this", 0x80030780, "addiu $a1, $zero, {}"),
    ("the ball's roll", "land.speed", "a landing with the roll asked takes this speed at once", 0x80030d48,
     "addiu $v0, $zero, {}"),
    ("the ball's roll", "land.off", "lays the centre this far off the face, units", 0x80030cb8, "addiu $a1, $zero, {}"),
    ("the ball's roll", "land.short", "and short of this progress asks the roll, lost to the pad the frame after", 0x80030d84,
     "slti $v0, $v0, {}"),
    ("the ball's roll", "land.short.speed", "at this speed", 0x80030da4, "addiu $v0, $zero, {}"),
    ("the ball's roll", "land.thud", "the ground shakes under a ball that falls at this", 0x80030c88, "addiu $v0, $zero, {}"),
    ("the ball's roll", "lost", "the ball is lost where its cell plus one is this or more on an axis", 0x80036a18,
     "sltiu $a0, $a0, {}"),
    ("the ball's roll", "squash.frames", "a landing squashes the ball over this many frames", 0x80030d50,
     "addiu $v0, $zero, {}"),
    ("the ball's roll", "squash.rise", "by this each, of 4096", 0x80030d58, "addiu $v0, $zero, {}"),
    ("the ball's roll", "squash.fall", "and the squash comes off by this a frame", 0x80030d60, "addiu $v0, $zero, {}"),
    ("the ball's roll", "squash.ease", "less this each frame", 0x80032638, "addiu $v0, $v0, {}"),
    ("the ball's roll", "squash.least.gate", "while over this", 0x80032648, "slti $v0, $v0, {}"),
    ("the ball's roll", "squash.least", "to no less than this", 0x80032650, "addiu $v0, $zero, {}"),
    ("the ball's roll", "squash.fall.reset", "the fall starting again from this while the rise runs", 0x80032608,
     "addiu $v0, $zero, {}"),
    ("the ball's roll", "squash.hop.frames", "a hop's end squashes over this many frames", 0x8003020c, "addiu $v0, $zero, {}"),
    ("the ball's roll", "squash.hop.rise", "by this", 0x80030214, "addiu $v0, $zero, {}"),
    ("the ball's roll", "squash.hop.fall", "coming off from this", 0x8003021c, "addiu $v0, $zero, {}"),
    ("the ball's roll", "look.rate", "over a block the extra pitch's rate stands at this", 0x8003505c, "addiu $v0, $zero, {}"),
    ("the ball's roll", "look.rate.jump", "as it does in a jump", 0x80035070, "addiu $v0, $zero, {}"),
    ("the ball's roll", "look.rows", "until the arc's count is under this", 0x80035068, "slti $v0, $v0, {}"),
    ("the ball's roll", "look.near", "over nothing the pitch grows by the rate up to this", 0x80035088, "slti $v0, $v0, {}"),
    ("the ball's roll", "look.to.gate", "the rate growing by one a frame while under this", 0x800350b4, "slti $v0, $v0, {}"),
    ("the ball's roll", "look.to", "to this", 0x800350bc, "addiu $v0, $zero, {}"),
    ("the ball's roll", "look.least.gate", "and past the near mark waning while over this", 0x800350ec, "slti $v0, $v0, {}"),
    ("the ball's roll", "look.least", "to this", 0x800350f4, "addiu $v0, $zero, {}"),
    ("the ball's roll", "look.far.gate", "the pitch going on while under this", 0x80035118, "slti $v0, $v0, {}"),
    ("the ball's roll", "look.far", "to this", 0x80035120, "addiu $v0, $zero, {}"),
    ("the ball's roll", "look.back", "and coming back by this a frame", 0x80035180, "addiu $v0, $v1, {}"),
    ("the ball's roll", "look.back.up", "from either side", 0x800351a8, "addiu $v0, $v1, {}"),
    ("the ball's roll", "look.held", "R1 held adds this a frame", 0x80034f90, "addiu $v0, $v0, {}"),
    ("the ball's roll", "look.held.gate", "while under this", 0x80034fa0, "slti $v0, $v0, {}"),
    ("the ball's roll", "look.held.far", "to this", 0x80034fa8, "addiu $v0, $zero, {}"),
    ("the ball's roll", "look.up", "and R2 held adds this a frame to a word of its own", 0x80034fd8, "addiu $v0, $v0, {}"),
    ("the ball's roll", "look.up.back", "which comes back by this", 0x8003514c, "addiu $v0, $v0, {}"),
    ("the ball's roll", "look.pitch", "over the view's own pitch down of this", 0x800354cc, "addiu $a0, $a0, {}"),
    ("the ball's roll", "look.below", "the view puts its target this below the middle", 0x80035528, "addiu $v0, $v0, {}"),
    ("the ball's roll", "look.ahead", "and this ahead of the eye", 0x80035544, "addiu $v0, $v0, {}"),

    ("the ball's jump", "jump.speed", "the jump starts at this speed, units a frame", 0x8002f658, "addiu $v0, $zero, {}"),
    ("the ball's jump", "jump.rows", "the table's rows start this many bytes in", 0x8002f664, "addiu $v1, $v1, {}"),
    ("the ball's jump", "jump.step", "the count falls by this a frame", 0x8002fce8, "addiu $v0, $v0, {}"),
    ("the ball's jump", "jump.skip", "and from one past this to nothing", 0x8002fce4, "addiu $v1, $zero, {}"),
    ("the ball's jump", "jump.row", "a row is read this many bytes a step", 0x8002fd24, "addiu $v0, $a1, {}"),
    ("the ball's jump", "jump.recentre", "the saved centre moves across toward the middle by this a frame", 0x8002fddc,
     "addiu $a1, $zero, {}"),
    ("the ball's jump", "jump.long", "the long jump lands three blocks on from this count of rows", 0x8002fe1c,
     "slti $v0, $v0, {}"),
    ("the ball's jump", "jump.catch", "the landing is tried while the count is under this", 0x80030684, "slti $v0, $v0, {}"),
    ("the ball's jump", "jump.wall", "a wall is met from this progress", 0x800307f4, "slti $v0, $v0, {}"),
    ("the ball's jump", "jump.wall.high", "a block ahead and above from this measure into its cell along the normal",
     0x80030828, "slti $v0, $v1, {}"),
    ("the ball's jump", "jump.wall.low", "and the floor ahead under this", 0x80030830, "slti $v0, $v1, {}"),
    ("the ball's jump", "jump.bounce", "a bounce while rising starts down at this", 0x800309a4, "addiu $v0, $zero, {}"),
    ("the ball's jump", "jump.ceiling", "a block above is met from this measure into its cell along the normal",
     0x80030a00, "slti $v0, $v0, {}"),
    ("the ball's jump", "jump.ceiling.ahead", "ahead and above from this progress", 0x80030a44, "slti $v0, $v1, {}"),
    ("the ball's jump", "jump.ceiling.behind", "and behind and above under this", 0x80030a4c, "slti $v0, $v1, {}"),
    ("the ball's jump", "boost.type", "a boost button is this type", 0x8003b228, "addiu $v0, $zero, {}"),
    ("the ball's jump", "boost.roll", "a ball on it from this progress is rolled on by the game", 0x8003b23c, "slti $v0, $v0, {}"),
    ("the ball's jump", "boost.frames", "for this many frames", 0x8003b244, "addiu $v0, $zero, {}"),
    ("the ball's jump", "boost.fire", "and launched from this progress", 0x8003b264, "slti $v0, $v0, {}"),
    ("the ball's jump", "jump.arm", "the launch arms the long jump's word with this where it is nothing", 0x8003b2a4,
     "addiu $v1, $zero, {}"),
    ("the ball's jump", "jump.keep", "and outside the jump's state the word is kept while under this", 0x8002f894,
     "slti $v0, $v0, {}"),
    ("the ball's jump", "hop.rows", "the hop's rows start this many bytes in", 0x8002f75c, "addiu $v1, $v1, {}"),
    ("the ball's jump", "hop.skip", "its count falls from one past this to nothing", 0x80030080, "addiu $v1, $zero, {}"),
    ("the ball's jump", "hop.step", "by this a frame", 0x80030084, "addiu $v0, $v0, {}"),
    ("the ball's jump", "hop.ahead", "and each row moves the centre by the height this many bytes on, the next row's, less this row's",
     0x800300b4, "lhu $v1, {}($v0)"),
    ("the ball's jump", "hop.row", "a row read this many bytes a step", 0x800300bc, "addiu $v0, $a3, {}"),

    ("the body's orientation", "body.one", "the matrices' unit, the identity's diagonal", 0x8002f304, "addiu $v0, $zero, {}"),
    ("the body's orientation", "body.one.landing", "as a landing lays the third matrix", 0x80032750, "addiu $v0, $zero, {}"),
    ("the body's orientation", "body.mark.wrap", "a frame round an edge marks the next frame's draw with this", 0x8002fa50,
     "addiu $v0, $zero, {}"),
    ("the body's orientation", "body.mark.wall", "a wall with this", 0x800304bc, "addiu $v0, $zero, {}"),
    ("the body's orientation", "body.mark.right", "a turn right marks the frame's own draw with this", 0x80034b10,
     "addiu $v0, $zero, {}"),
    ("the body's orientation", "body.mark.left", "and a turn left with this", 0x80034bc8, "addiu $v0, $zero, {}"),
    ("the body's orientation", "body.test.wrap", "the draw takes this mark as the edge's", 0x80031164, "addiu $v0, $zero, {}"),
    ("the body's orientation", "body.test.right", "this as a turn right's", 0x8003116c, "addiu $v0, $zero, {}"),
    ("the body's orientation", "body.test.left", "this as a turn left's", 0x80031254, "addiu $v0, $zero, {}"),
    ("the body's orientation", "body.test.wall", "and this as a wall's", 0x8003125c, "addiu $v0, $zero, {}"),
    ("the body's orientation", "body.wrap", "round an edge the frame's matrix turns by this a frame about its x, the side",
     0x80031180, "addiu $v0, $zero, {}"),
    ("the body's orientation", "body.right", "a turn right turns the body's matrix by this about the frame's z, its down",
     0x800311cc, "addiu $v0, $zero, {}"),
    ("the body's orientation", "body.left", "a turn left by this", 0x80031270, "addiu $v0, $zero, {}"),
    ("the body's orientation", "body.wall", "and a wall by this about the frame's x, the frame's matrix each time the other way",
     0x800312d4, "addiu $v0, $zero, {}"),

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
    ("moving spikes", "spikes.phase.down.flag", "phase: f4 for a phase that starts down", 0x8002a12c, "addiu $v0, $zero, {}"),
    ("moving spikes", "spikes.phase.up.flag", "phase: f4 for one that starts held up or retracting", 0x8002a098,
     "addiu $t5, $zero, {}"),
    ("moving spikes", "spikes.rise.flag", "rising: f4 as it starts", 0x8002bc74, "addiu $v0, $zero, {}"),
    ("moving spikes", "spikes.retract.flag", "retracting: f4 once the harmless frames remain", 0x8002be5c,
     "addiu $v0, $zero, {}"),

    ("vanishing block", "vanish.phase.absent", "phase: starts absent if under", 0x80028bd0, "slti $v0, $a1, {}"),
    ("vanishing block", "vanish.phase.absent.from", "phase: absent for this many frames less the phase", 0x80028c1c, "addiu $v0, $zero, {}"),
    ("vanishing block", "vanish.phase.solid.from", "phase: solid for this many less the phase", 0x80028cb8, "addiu $v0, $zero, {}"),
    ("vanishing block", "vanish.absent", "absent, frames", 0x8002bb78, "addiu $a2, $zero, {}"),
    ("vanishing block", "vanish.in", "fading in, frames", 0x8002b7fc, "addiu $a2, $zero, {}"),
    ("vanishing block", "vanish.settle", "settling, frames", 0x8002b900, "addiu $a2, $zero, {}"),
    ("vanishing block", "vanish.solid", "solid, frames", 0x8002b9c0, "addiu $a2, $zero, {}"),
    ("vanishing block", "vanish.dim", "dimming, frames", 0x8002b9d4, "addiu $a2, $zero, {}"),
    ("vanishing block", "vanish.out", "flashing out, frames", 0x8002bad4, "addiu $a2, $zero, {}"),
    ("vanishing block", "vanish.in.over", "fading in: the count is taken from this", 0x8002b858, "addiu $v0, $zero, {}"),
    ("vanishing block", "vanish.settle.floor", "settling: the ramp stands this far above black", 0x8002b93c, "addiu $a1, $v1, {}"),
    ("vanishing block", "vanish.dim.from", "dimming: the ramp is taken from this", 0x8002ba50, "addiu $v0, $zero, {}"),

    ("crumbling block", "crumble.size", "size at load, units", 0x80028ab8, "addiu $a3, $zero, {}"),
    ("crumbling block", "crumble.shrink", "shrinks per frame once broken, units", 0x8002b5b8, "addiu $v0, $v0, {}"),

    ("moving platform", "platform.dwell", "waits at each end, frames", 0x80032e7c, "addiu $v1, $zero, {}"),

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
    ("shadows", "standing.centre", "ball: the cell its centre lies in is taken this far past the centre, units", 0x8003746c,
     "addiu $v1, $v1, {}"),
    ("shadows", "standing.shift", "and shifted down this far, a block", 0x80037470, "sra $v1, $v1, {}"),
    ("shadows", "standing.first", "ball: the block under that cell carries a record from this lattice word", 0x800377ac,
     "slti $v0, $a0, {}"),
    ("shadows", "standing.kind.5", "ball: a platform under it is tested as this kind", 0x80037810, "addiu $v0, $zero, {}"),
    ("shadows", "standing.word.5", "and reads as this", 0x80037818, "addiu $v0, $zero, {}"),
    ("shadows", "standing.kind.6", "ball: a crumbling block as this kind", 0x80037838, "addiu $v0, $zero, {}"),
    ("shadows", "standing.word.6", "and reads as this", 0x80037840, "addiu $v0, $zero, {}"),
    ("shadows", "standing.kind.7", "ball: a vanishing block as this kind", 0x80037860, "addiu $v0, $zero, {}"),
    ("shadows", "standing.word.7", "and reads as this", 0x80037868, "addiu $v0, $zero, {}"),
    ("shadows", "standing.kind.1", "ball: fire as this kind, which reads as itself", 0x80037888, "addiu $v0, $zero, {}"),
    ("shadows", "standing.kind.2", "ball: ice as this kind, which reads as itself", 0x800378b0, "addiu $v0, $zero, {}"),
    ("shadows", "standing.kind.3", "ball: an invisible block as this kind", 0x800378d8, "addiu $v0, $zero, {}"),
    ("shadows", "standing.word.3", "and reads as this", 0x800378e0, "addiu $v0, $zero, {}"),
    ("shadows", "standing.kind.4", "ball: acid as this kind, which reads as itself", 0x80037900, "addiu $v0, $zero, {}"),
    ("shadows", "standing.style.1", "ball: a lattice style of this reads as fire's kind", 0x80037950, "addiu $v0, $zero, {}"),
    ("shadows", "standing.style.2", "of this as ice's", 0x80037964, "addiu $v0, $zero, {}"),
    ("shadows", "standing.style.3", "of this as the invisible block's", 0x8003796c, "addiu $v0, $zero, {}"),
    ("shadows", "standing.style.word.3", "which reads as this", 0x80037980, "addiu $v0, $zero, {}"),
    ("shadows", "standing.style.4", "and of this as acid's", 0x8003798c, "addiu $v0, $zero, {}"),
    ("shadows", "standing.nothing", "ball: a bare plain block reads as this", 0x800379ac, "addiu $v0, $zero, {}"),
    ("shadows", "standing.none", "as does a cell holding this, no block", 0x800379a8, "addiu $v1, $zero, {}"),

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

    ("gem's glints", "glint.model", "the records are of this model of the second table", 0x80022f60,
     "addiu $a2, $zero, {}"),
    ("gem's glints", "glint.cuts", "the parser builds a record for each of this many slots", 0x80022f90, "slti $v0, $s0, {}"),
    ("gem's glints", "glint.rows", "in each of this many rows", 0x80022fa0, "slti $v0, $s2, {}"),
    ("gem's glints", "glint.record", "bytes from one slot's record to the next", 0x80022f98, "addiu $s1, $s1, {}"),
    ("gem's glints", "glint.row", "and from one row's to the next", 0x80022fa8, "addiu $s3, $s3, {}"),
    ("gem's glints", "glint.head", "a record's slots start this far in", 0x80023348, "addiu $t0, $t0, {}"),
    ("gem's glints", "glint.slot", "and are this many bytes each", 0x80023364, "addiu $t0, $t0, {}"),
    ("gem's glints", "glint.chance", "a glint starts where a draw of this many comes up nothing", 0x80022f64,
     "addiu $v0, $zero, {}"),
    ("gem's glints", "glint.slots", "glints a record holds at once", 0x80022f6c, "addiu $v0, $zero, {}"),
    ("gem's glints", "glint.flat", "bytes of a flat polygon's colour stepped", 0x80050e1c, "addiu $gp, $zero, {}"),
    ("gem's glints", "glint.frame.cuts", "the frame runs the glint over this many records a row", 0x8002aa44,
     "slti $v0, $s1, {}"),
    ("gem's glints", "glint.frame.rows", "for this many rows", 0x8002aa54, "slti $v0, $s4, {}"),
    ("gem's glints", "glint.frame.record", "stepping this far a record", 0x8002aa4c, "addiu $s0, $s0, {}"),
    ("gem's glints", "glint.frame.row", "and this far a row", 0x8002aa5c, "addiu $s3, $s3, {}"),
    ("gem's glints", "glint.plus", "a draw adds this after it multiplies", 0x80050d64, "addiu $s6, $s6, {}"),

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

    ("what the ball takes", "take.live", "the loader marks a thing the walk may take with this", 0x800355c4,
     "addiu $s4, $zero, {}"),
    ("what the ball takes", "take.stand", "a pickup's middle stands this far from its block's centre, units",
     0x800355c8, "addiu $s7, $zero, {}"),
    ("what the ball takes", "take.stand.coin", "a coin's this far", 0x800357a4, "addiu $v0, $zero, {}"),
    ("what the ball takes", "take.stand.star", "type 42's this far", 0x800357d8, "addiu $v0, $zero, {}"),
    ("what the ball takes", "take.stand.hourglass", "an hourglass's this far", 0x80035850, "addiu $v0, $zero, {}"),
    ("what the ball takes", "take.stand.gem", "and a gem's this far, past the first cut", 0x80035844,
     "addiu $v0, $zero, {}"),
    ("what the ball takes", "take.reach", "a pickup's reach squared, units", 0x800355cc, "addiu $s6, $zero, {}"),
    ("what the ball takes", "take.reach.key", "a key's", 0x800358ac, "addiu $v0, $zero, {}"),
    ("what the ball takes", "take.reach.fruit", "and a fruit's", 0x8003566c, "addiu $v0, $zero, {}"),
    ("what the ball takes", "take.within", "the walk adds this, the ball's radius squared, to it", 0x800384c8,
     "addiu $v0, $zero, {}"),
    ("what the ball takes", "take.first", "the walk's cases start at this type", 0x80038674, "addiu $v0, $v0, {}"),
    ("what the ball takes", "take.open", "a case writes this into an exit's f4 and a thing it keeps", 0x800384b0,
     "addiu $s2, $zero, {}"),
    ("what the ball takes", "take.third", "and tells a coin's third tier by this", 0x800384bc, "addiu $s1, $zero, {}"),
    ("what the ball takes", "key.points", "a key scores", 0x80038a28, "addiu $v0, $v0, {}"),
    ("what the ball takes", "gem.points", "a gem", 0x80038b00, "addiu $v0, $v0, {}"),
    ("what the ball takes", "coin.points.0", "a coin of the first tier", 0x80038ba8, "addiu $v0, $v0, {}"),
    ("what the ball takes", "coin.points.1", "of the second", 0x80038bd0, "addiu $v0, $v0, {}"),
    ("what the ball takes", "coin.points.2", "and of the third", 0x80038bf8, "addiu $v0, $v0, {}"),
    ("what the ball takes", "star42.points", "type 42 in its green form", 0x80038780, "addiu $v0, $v0, {}"),
    ("what the ball takes", "sunglasses.points", "the sunglasses", 0x80038930, "addiu $v1, $v1, {}"),
    ("what the ball takes", "fruit.points.43", "a fruit of type 43", 0x80038c8c, "addiu $v0, $v0, {}"),
    ("what the ball takes", "fruit.points.44", "44", 0x80038d34, "addiu $v0, $v0, {}"),
    ("what the ball takes", "fruit.points.45", "45", 0x80038ddc, "addiu $v0, $v0, {}"),
    ("what the ball takes", "fruit.points.46", "46", 0x80038e84, "addiu $v0, $v0, {}"),
    ("what the ball takes", "fruit.points.47", "and 47", 0x80038f2c, "addiu $v0, $v0, {}"),
    ("what the ball takes", "hourglass.from", "the hourglass takes the clock from this many ticks", 0x80039070,
     "addiu $v0, $zero, {}"),
    ("what the ball takes", "pill.lethargy", "the lethargy pill sets its word to", 0x800387cc, "addiu $v0, $zero, {}"),
    ("what the ball takes", "pill.lethargy.step", "which counts down by this a frame", 0x8003b388, "addiu $v0, $v0, {}"),
    ("what the ball takes", "pill.lethargy.ticks", "ticking the clock this many extra a frame", 0x8003b394,
     "addiu $a0, $zero, {}"),
    ("what the ball takes", "pill.lethargy.players", "the screen's effect starts where the players are fewer than",
     0x800201fc, "slti $v0, $v0, {}"),
    ("what the ball takes", "pill.lethargy.blanks", "and while its mode stands a pass waits this many blanks",
     0x80040af8, "addiu $a0, $zero, {}"),
    ("the view in play", "rock.shift", "the view rolls by the sine of the pill's word's product shifted down by this",
     0x80035358, "sra $a0, $v0, {}"),
    ("the view in play", "rock.round", "the sine rounded toward nothing by this first", 0x8003534c,
     "addiu $v0, $v0, {}"),
    ("the view in play", "flash.code", "the flash is a textured quad coded this", 0x80024058, "addiu $v0, $zero, {}"),
    ("the view in play", "flash.sprite", "showing the sprite this far past the group the header's sixth bound starts",
     0x80024068, "addiu $v1, $v1, {}"),
    ("the view in play", "flash.laid", "its colour laid at this", 0x80024200, "addiu $v0, $zero, {}"),
    ("the view in play", "screen.grey", "and written at this on the pill's pass", 0x8002028c, "addiu $a2, $zero, {}"),
    ("the view in play", "screen.phase", "the two phases start at this", 0x8002037c, "addiu $v0, $zero, {}"),
    ("the view in play", "screen.magnitude", "and the stretch's magnitude at this", 0x80020388,
     "addiu $v0, $zero, {}"),
    ("the view in play", "screen.idle.step", "the idle phase steps this a pass, its sine thrown away", 0x800203a0,
     "addiu $v0, $v1, {}"),
    ("the view in play", "screen.tint.outer", "the ghost's red and blue", 0x800203c4, "addiu $s0, $zero, {}"),
    ("the view in play", "screen.tint.green", "and its green", 0x800203f4, "addiu $s1, $zero, {}"),
    ("the view in play", "screen.page.gate", "a second ghost where the screen is this wide or more", 0x80020474,
     "slti $v0, $v0, {}"),
    ("the view in play", "screen.sprite.width", "a ghost is this wide, a texture page", 0x800242fc,
     "addiu $s4, $zero, {}"),
    ("the view in play", "screen.sprite.rest", "and the second the width less this", 0x800243bc,
     "addiu $v1, $v1, {}"),
    ("the view in play", "screen.wane", "the magnitude wanes by this a pass", 0x800206d8, "addiu $v0, $v0, {}"),
    ("the view in play", "screen.step", "and the stretch's phase steps this", 0x800206f0, "addiu $v0, $v1, {}"),
    ("the view in play", "screen.rest.across", "the scale across is this plus the stretch", 0x8002072c,
     "addiu $v0, $v1, {}"),
    ("the view in play", "screen.rest.down", "and the scale down this less it", 0x80020738, "addiu $v0, $zero, {}"),
    ("the view in play", "screen.reset.across", "which a level's leaving puts back to this", 0x80020238,
     "addiu $v0, $zero, {}"),
    ("the view in play", "screen.reset.down", "and this", 0x80020244, "addiu $v0, $zero, {}"),
    ("the view in play", "screen.end", "the end's pass sets the fade's level at this", 0x8002051c,
     "addiu $v0, $zero, {}"),
    ("the view in play", "screen.fade", "which steps by this a pass", 0x800205fc, "addiu $a0, $v0, {}"),
    ("what the ball takes", "pill.invincible", "the invincibility pill sets its word to", 0x8003884c,
     "addiu $v0, $zero, {}"),
    ("what the ball takes", "pill.invincible.step", "which counts down by this a frame", 0x8003b304,
     "addiu $v0, $v0, {}"),
    ("what the ball takes", "pill.bouncy", "the bouncy pill sets its word to", 0x800388b0, "addiu $v0, $zero, {}"),
    ("what the ball takes", "pill.bouncy.hold", "which grows while the ball rolls from this", 0x80036598,
     "slti $v0, $a0, {}"),
    ("what the ball takes", "pill.bouncy.grow", "by this a frame", 0x800365b4, "addiu $v0, $a0, {}"),
    ("what the ball takes", "pill.bouncy.latch", "giving the roll to the Up latch from this count",
     0x80036dbc, "slti $v0, $v0, {}"),
    ("what the ball takes", "pill.bouncy.latch.step",
     "and a count of frames Up or Cross has been latched under it steps by this a frame", 0x80036da0,
     "addiu $v0, $v0, {}"),
    ("what the ball takes", "sunglasses.word", "the sunglasses set their word to", 0x80038924, "addiu $v0, $zero, {}"),
    ("what the ball takes", "sunglasses.step", "which counts down by this a frame", 0x8003b2ec, "addiu $v0, $v0, {}"),
    ("what the ball takes", "sunglasses.blinks", "and at nothing they blink this many times", 0x8002beec,
     "addiu $v0, $zero, {}"),
    ("what the ball takes", "sunglasses.blink", "of this many frames each", 0x8002befc, "addiu $v0, $zero, {}"),
    ("what the ball takes", "sunglasses.flag.on", "the take calls the blink's start with this", 0x80038940,
     "addiu $a0, $zero, {}"),
    ("what the ball takes", "sunglasses.flag", "which sets the sunglasses' flag to this", 0x8002becc,
     "addiu $v1, $zero, {}"),
    ("what the ball takes", "sunglasses.blink.step", "the blink takes this off an off spell's timer a frame",
     0x8002bf9c, "addiu $v0, $v0, {}"),
    ("what the ball takes", "sunglasses.blink.count.step", "and this off its count as the timer runs out", 0x8002bfbc,
     "addiu $v0, $v0, {}"),
    ("what the ball takes", "sunglasses.blink.on", "laying the timer at this for the on spell", 0x8002bfc8,
     "addiu $v0, $zero, {}"),
    ("what the ball takes", "sunglasses.blink.step.on", "an on spell's timer steps by this", 0x8002c000,
     "addiu $v0, $v0, {}"),
    ("what the ball takes", "sunglasses.blink.count.step.on", "and the count by this as it runs out", 0x8002c020,
     "addiu $v0, $v0, {}"),
    ("what the ball takes", "sunglasses.blink.off", "the timer laid at this for the off spell", 0x8002c034,
     "addiu $v0, $zero, {}"),
    ("what the ball takes", "crumble.points", "a crumbling block scores this as it breaks", 0x8003b004,
     "addiu $v0, $v0, {}"),
    ("what the ball takes", "crumble.under", "the ball on one standing on this", 0x8003afb4, "addiu $v0, $zero, {}"),

    ("the devices under the ball", "send.type", "the teleporter's routine runs on this type", 0x8003a5c4,
     "addiu $v0, $zero, {}"),
    ("the devices under the ball", "send.band", "from a progress of this, taken the other way", 0x8003a618,
     "addiu $v0, $v0, {}"),
    ("the devices under the ball", "send.band.span", "for this many units", 0x8003a61c, "sltiu $v0, $v0, {}"),
    ("the devices under the ball", "send.wait", "counting down from this", 0x8003a638, "addiu $v0, $zero, {}"),
    ("the devices under the ball", "send.hold", "with the pad held off for this many frames", 0x8003a664,
     "addiu $v0, $zero, {}"),
    ("the devices under the ball", "send.hold.after", "and for this many once the ball is sent", 0x8003a6b8,
     "addiu $v0, $zero, {}"),
    ("the devices under the ball", "send.mark", "the device marked done with this", 0x8003a6a8, "addiu $v0, $zero, {}"),
    ("the devices under the ball", "throw.type", "the switch's routine runs on this type", 0x8003a3a0,
     "addiu $v1, $zero, {}"),
    ("the devices under the ball", "throw.band", "from a progress of this, taken the other way", 0x8003a3d4,
     "addiu $v0, $v0, {}"),
    ("the devices under the ball", "throw.band.span", "for this many units, along and across", 0x8003a3d8,
     "sltiu $v0, $v0, {}"),
    ("the devices under the ball", "throw.laser", "a laser on its list is named by this face", 0x8003a498,
     "addiu $v0, $zero, {}"),
    ("the devices under the ball", "rearm", "the marker clears past this far off the middle, taken the other way",
     0x8003685c, "addiu $v0, $v0, {}"),
    ("the devices under the ball", "rearm.span", "for this many units", 0x80036860, "sltiu $v0, $v0, {}"),
    ("the devices under the ball", "exit.type", "the hazards routine tests the exit as this type", 0x8003ad88,
     "addiu $v0, $zero, {}"),
    ("the devices under the ball", "exit.hidden.type", "and the hidden exit as this", 0x8003af40, "addiu $v0, $zero, {}"),

    ("the level's clock and its end", "clock.tick", "the clock ticks this many a frame", 0x800362ec,
     "addiu $a0, $zero, {}"),
    ("the level's clock and its end", "clock.face", "and stands while the ball is on this type", 0x8003b470,
     "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "clock.mode", "or in this mode", 0x8003b494, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "end.time", "the outcome at nothing on the clock", 0x8003b4bc,
     "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "end.lost", "off the lattice", 0x80036a5c, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "end.exit", "the ending by the exit", 0x8003af2c, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "wait.exit", "after this many frames", 0x8003af34, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "end.hidden", "by the hidden exit", 0x8003afa0, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "wait.hidden", "after this many", 0x8003afa8, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "end.bonus", "by the last block of a bonus level", 0x8003aebc,
     "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "end.spikes", "on the spikes, where the invincibility word is this",
     0x8003b048, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "wait.spikes", "after this many", 0x8003b0a0, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "end.fire", "burnt", 0x8003ac10, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "wait.fire", "after this many", 0x8003ac18, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "end.captivator", "caught by a captivator", 0x800367a8, "addiu $s0, $zero, {}"),
    ("the level's clock and its end", "wait.captivator", "after this many", 0x800367f0, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "end.star", "or by type 42's brown form", 0x800386f8, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "wait.star", "after this many", 0x80038704, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "end.acid", "on the acid block", 0x8003acc8, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "wait.acid", "after this many", 0x8003acd4, "addiu $v1, $zero, {}"),
    ("the level's clock and its end", "end.laser", "in a beam", 0x8003a97c, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "wait.laser", "after this many", 0x8003a984, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "end.simon", "and a Simon room failed", 0x800363cc, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "wait.simon", "after this many", 0x800363d8, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "wait.simon.done", "as one done", 0x80036360, "addiu $v1, $zero, {}"),
    ("the level's clock and its end", "mark.points", "a bonus level scores this for a block the ball first stands on",
     0x8002dd48, "addiu $v0, $v0, {}"),
    ("the level's clock and its end", "mark.skips", "a block of this kind not counted", 0x8002dcec,
     "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "words.win", "a way out shows the end screen's word at this index", 0x80015730,
     "addiu $s2, $zero, {}"),
    ("the level's clock and its end", "words.last", "an index past the count less this draws nothing", 0x80015a44,
     "addiu $v0, $v0, {}"),
    ("the level's clock and its end", "words.over", "a total below nothing shows the word at this", 0x800157e4,
     "addiu $s2, $zero, {}"),
    ("the level's clock and its end", "words.over.state", "once the screen's state is this", 0x800157d8,
     "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "words.trial", "the time trial, this mode", 0x80015728, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "words.better", "shows this for an exit under a frame of its time", 0x8001576c,
     "addiu $s2, $zero, {}"),
    ("the level's clock and its end", "words.slow.gate", "and past this many frames, less one", 0x80015770,
     "slti $v0, $v0, {}"),
    ("the level's clock and its end", "words.slow", "this", 0x80015780, "addiu $s2, $zero, {}"),
    ("the level's clock and its end", "words.qualified", "its qualifying screen this", 0x80015958, "addiu $s2, $zero, {}"),
    ("the level's clock and its end", "words.failed", "or this", 0x8001595c, "addiu $s2, $zero, {}"),
    ("the level's clock and its end", "words.copycat", "Copycat, this mode", 0x800157f0, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "words.won2", "shows this for the second player's win", 0x80015868,
     "addiu $s2, $zero, {}"),
    ("the level's clock and its end", "words.won1", "this for the first's", 0x8001586c, "addiu $s2, $zero, {}"),
    ("the level's clock and its end", "words.equal", "and this for a draw", 0x80015878, "addiu $s2, $zero, {}"),
    ("the level's clock and its end", "words.trial.won2", "as does the time trial for two players", 0x800159f4,
     "addiu $s2, $zero, {}"),
    ("the level's clock and its end", "words.trial.won1", "the first's", 0x800159f8, "addiu $s2, $zero, {}"),
    ("the level's clock and its end", "words.trial.equal", "and a draw", 0x80015a04, "addiu $s2, $zero, {}"),
    ("the level's clock and its end", "words.final.world", "the last final completed, the world counted on to this",
     0x800158b4, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "words.final", "picks this for a pass", 0x800158cc, "addiu $s2, $zero, {}"),

    ("what harms the ball", "laser.cell", "the ball's own cell holding this, a lit beam, is the laser's death", 0x8003a944,
     "addiu $v1, $zero, {}"),
    ("what harms the ball", "laser.heat", "which sets the heat to this", 0x8003a98c, "addiu $v0, $zero, {}"),
    ("what harms the ball", "fire.kind", "fire is this kind under the ball", 0x8003ab44, "addiu $v0, $zero, {}"),
    ("what harms the ball", "fire.burn", "and heats it by this a frame on the ground", 0x8003ab7c, "addiu $v0, $v0, {}"),
    ("what harms the ball", "fire.landed", "the landing's mark at 494 being this on the frame after one", 0x8003abb8,
     "addiu $v0, $zero, {}"),
    ("what harms the ball", "fire.land", "when it heats by this besides", 0x8003abe0, "addiu $v0, $v0, {}"),
    ("what harms the ball", "fire.limit.gate", "past this, less one", 0x8003abf0, "slti $v0, $v0, {}"),
    ("what harms the ball", "fire.cool", "off fire the heat cools by this a frame", 0x8003ac60, "addiu $v0, $v0, {}"),
    ("what harms the ball", "heat.chill", "and on ice by this more", 0x8003ad30, "addiu $v0, $v0, {}"),
    ("what harms the ball", "end.fire.swell", "while the fire's countdown runs, the ending being this", 0x80036410,
     "addiu $v0, $zero, {}"),
    ("what harms the ball", "fire.swell", "the ball swells by this of 4096 a frame", 0x80036440, "addiu $v0, $v0, {}"),
    ("what harms the ball", "heat.shake", "the heat shakes the pad by this", 0x80036740, "addiu $a1, $v0, {}"),
    ("what harms the ball", "heat.shake.big", "and from this with the big motor", 0x80036744, "slti $v0, $a1, {}"),
    ("what harms the ball", "acid.top.gate", "the melt at 524 is held under this", 0x8003ac88, "slti $v0, $v0, {}"),
    ("what harms the ball", "acid.top", "at this", 0x8003ac90, "addiu $v0, $zero, {}"),
    ("what harms the ball", "acid.kind", "acid is this kind under the ball", 0x8003ac9c, "addiu $v0, $zero, {}"),
    ("what harms the ball", "acid.gain", "and the melt grows by this", 0x8003acdc, "addiu $v0, $v0, {}"),
    ("what harms the ball", "end.acid.wait", "and while the countdown runs with the ending at this", 0x80036478,
     "addiu $v0, $zero, {}"),
    ("what harms the ball", "acid.gain.wait", "by this a frame", 0x80036490, "addiu $v0, $v0, {}"),
    ("what harms the ball", "spikes12.type", "spikes are this type under the ball", 0x8003b030, "addiu $v0, $zero, {}"),
    ("what harms the ball", "spikes11.type", "moving spikes are this type", 0x8003b0d4, "addiu $v0, $zero, {}"),
    ("what harms the ball", "spikes11.deadly", "deadly while their f4 is this", 0x8003b0f8, "addiu $v0, $zero, {}"),
    ("what harms the ball", "wait.spikes.landing", "with a countdown of this many frames after a landing", 0x8003b168,
     "addiu $v0, $zero, {}"),
    ("what harms the ball", "wait.spikes.standing", "and this many standing", 0x8003b21c, "addiu $v0, $zero, {}"),
    ("what harms the ball", "end.captivator.still", "the captivators stand while the ending is this", 0x800366cc,
     "addiu $v0, $zero, {}"),
    ("what harms the ball", "catch.type53", "the hit test gives this type", 0x8003d588, "addiu $t1, $zero, {}"),
    ("what harms the ball", "catch.near.gate", "a reach of a squared distance under this", 0x8003d630, "slti $v0, $v0, {}"),
    ("what harms the ball", "catch.square", "and the others one of at most this", 0x8003d58c, "ori $t0, $zero, {}"),
    ("what harms the ball", "dying.flash", "the dying ball's light flashes by an angle stepping this", 0x80032330,
     "addiu $v1, $a0, {}"),
    ("what harms the ball", "dying.flash.full", "its sine over this", 0x8003235c, "addiu $v0, $v0, {}"),
    ("what harms the ball", "tint.full", "the ball's light is this untinted", 0x80032158, "addiu $v0, $v0, {}"),
    ("what harms the ball", "glow.gate.word", "the ball's draw reads the invincibility pill's word at this of the record",
     0x80032200, "lw $v1, {}($s3)"),
    ("what harms the ball", "glow.gate", "and glows while it is not this", 0x80032204, "addiu $v0, $zero, {}"),
    ("what harms the ball", "glow.counter.at", "stepping a counter this far past gp", 0x80032210, "lh $a0, {}($gp)"),
    ("what harms the ball", "glow.step", "by this a frame", 0x80032218, "addiu $v1, $a0, {}"),
    ("what harms the ball", "glow.round.rest", "rounded toward nothing from this", 0x80032224, "addiu $v0, $a0, {}"),
    ("what harms the ball", "glow.round.shift", "modulo one shifted up by this", 0x80032228, "sra $v0, $v0, {}"),
    ("what harms the ball", "glow.red.under", "and raises the red while the counter is under this", 0x80032240,
     "slti $v0, $v1, {}"),
    ("what harms the ball", "glow.red.rest", "by the sine of it, rounded from this", 0x80032254, "addiu $a0, $v1, {}"),
    ("what harms the ball", "glow.red.shift", "modulo one shifted up by this", 0x80032258, "sra $a0, $a0, {}"),
    ("what harms the ball", "glow.green.from", "the green while the counter plus this", 0x8003228c, "addiu $v0, $v1, {}"),
    ("what harms the ball", "glow.green.span", "is under this, taken unsigned", 0x80032290, "sltiu $v0, $v0, {}"),
    ("what harms the ball", "glow.green.phase", "by the sine of the counter plus this", 0x800322a0, "addiu $v1, $v0, {}"),
    ("what harms the ball", "glow.green.rest", "rounded from this", 0x800322ac, "addiu $a0, $v0, {}"),
    ("what harms the ball", "glow.green.shift", "modulo one shifted up by this", 0x800322b0, "sra $a0, $a0, {}"),
    ("what harms the ball", "glow.blue.gate", "and the blue while the counter is not under this", 0x800322dc,
     "slti $v0, $v1, {}"),
    ("what harms the ball", "glow.blue.phase", "by the sine of the counter plus this", 0x800322e4, "addiu $v0, $v1, {}"),
    ("what harms the ball", "glow.blue.rest", "rounded from this", 0x800322f0, "addiu $a0, $v1, {}"),
    ("what harms the ball", "glow.blue.shift", "modulo one shifted up by this", 0x800322f4, "sra $a0, $a0, {}"),

    ("the level's clock and its end", "start.wait", "a level starts with the countdown at 370 at this", 0x80035e04,
     "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "start.guard", "and the guard clears itself at this", 0x8003631c,
     "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "end.exit.landing", "the exit's result written at once after a landing", 0x8003aef8,
     "addiu $v1, $zero, {}"),
    ("the level's clock and its end", "end.hidden.landing", "and the hidden exit's", 0x8003af6c, "addiu $v1, $zero, {}"),
    ("the level's clock and its end", "end.bonus.landing", "and a bonus level's outcome", 0x8003ae9c,
     "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "simon.done", "the Simon rooms' verdict at this is the sequence done", 0x80036330,
     "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "simon.wrong", "and at this a wrong move", 0x8003639c, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "end.view.x", "the ending's view steps its first angle by this a frame", 0x800347d0,
     "addiu $v1, $a0, {}"),
    ("the level's clock and its end", "end.view.y", "its second by this", 0x800347f4, "addiu $v1, $a0, {}"),
    ("the level's clock and its end", "end.view.z", "its third by this", 0x80034818, "addiu $a0, $a1, {}"),
    ("the level's clock and its end", "end.view.swing", "and its fourth, the swing's, by this", 0x80034850,
     "addiu $v1, $a0, {}"),
    ("the level's clock and its end", "end.view.swing.bonus", "or on a level with no key by this", 0x8003488c,
     "addiu $v1, $a0, {}"),
    ("the level's clock and its end", "end.view.off", "the eye stands this further than the free camera's", 0x800349b4,
     "addiu $v0, $v0, {}"),
    ("the level's clock and its end", "end.view.off.bonus", "or on a level with no key this", 0x80034a28,
     "addiu $v0, $v0, {}"),
    ("the level's clock and its end", "end.view.off.hidden",
     "or, whatever the mode, this first, which the two swings write over", 0x80034958, "addiu $v0, $v0, {}"),
    ("the level's clock and its end", "end.view.mode.bonus", "the faster step is keyed on the mode word at this",
     0x80034878, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "end.view.mode.bonus.eye", "and the further swing on the same", 0x800349d0,
     "addiu $v0, $zero, {}"),
    ("the level's mode", "mode.at", "the loader's mode routine reads the level's mode word this far past gp",
     0x80027b30, "lw $v0, {}($gp)"),
    ("the level's mode", "mode.key", "counts the slots of this type, the key's", 0x80027b4c, "addiu $t0, $zero, {}"),
    ("the level's mode", "mode.kinds", "on the records of kinds below this", 0x80027b64, "sltiu $v0, $v0, {}"),
    ("the level's mode", "mode.slots", "in this many slots of each", 0x80027bac, "slti $v0, $a0, {}"),
    ("the level's mode", "mode.bonus", "and writes this where there are none", 0x80027bd8, "addiu $v0, $zero, {}"),
    ("the level's mode", "mode.settings", "the settings record is of this kind", 0x80027c34, "addiu $t2, $zero, {}"),
    ("the level's mode", "mode.hidden.flag", "and a type of this in its first slot marks a hidden level",
     0x80027c38, "addiu $a0, $zero, {}"),
    ("the level's mode", "mode.hidden", "which writes this", 0x80027c3c, "addiu $t1, $zero, {}"),
    ("the level's mode", "mode.simon", "and the game's mode word at this, the Simon rooms', puts it back to 0",
     0x80027cb8, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "death.most.gate", "a death's penalty is held under this", 0x80041ff0,
     "slti $v0, $v1, {}"),
    ("the level's clock and its end", "death.most", "at this", 0x80041ffc, "addiu $v1, $zero, {}"),
    ("the level's clock and its end", "death.over", "and a total below nothing tells the game's loop this", 0x80041ec0,
     "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "fruit.bit.43", "a fruit of type 43 sets this bit in the pickups' word",
     0x80038cb0, "ori $v0, $v0, {}"),
    ("the level's clock and its end", "fruit.bit.44", "44 this", 0x80038d58, "ori $v0, $v0, {}"),
    ("the level's clock and its end", "fruit.bit.45", "45 this", 0x80038e00, "ori $v0, $v0, {}"),
    ("the level's clock and its end", "fruit.bit.46", "46 this", 0x80038ea8, "ori $v0, $v0, {}"),
    ("the level's clock and its end", "fruit.bit.47", "and 47 this", 0x80038f4c, "ori $v0, $v0, {}"),
    ("the level's clock and its end", "fruit.bit.all", "and the case for type 27, never reached, all of them",
     0x8003902c, "ori $v1, $v1, {}"),
    ("the level's clock and its end", "next.one", "the level's number is the place's levels plus the slot plus this",
     0x80042498, "addiu $v0, $v0, {}"),
    ("the level's clock and its end", "next.final", "and in the finals twice the place plus the slot plus this",
     0x800424ac, "addiu $v0, $v0, {}"),
    ("the level's clock and its end", "next.hidden.out", "the outcome the next-level routine takes for the hidden exit",
     0x800424f8, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "next.slots", "the slot after the last ordinary level, the pack's count instead",
     0x80042500, "addiu $v1, $zero, {}"),
    ("the level's clock and its end", "next.hidden", "the hidden exit leads to this slot", 0x80042530,
     "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "next.fruit.mask", "an exit asks the bank's low bits", 0x80042550,
     "andi $v1, $v1, {}"),
    ("the level's clock and its end", "next.fruit", "against every fruit", 0x80042554, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "next.slots.bonus", "and the slot after against this", 0x80042560,
     "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "next.bonus.first", "the bonus slot is this plus the finished slot's third",
     0x800425e0, "addiu $a0, $a0, {}"),
    ("the level's clock and its end", "next.fruit.back", "a bonus or hidden level asks every fruit", 0x8004280c,
     "addiu $v1, $zero, {}"),
    ("the level's clock and its end", "next.fruit.back.mask", "of the bank's low bits", 0x80042818,
     "andi $v0, $v0, {}"),
    ("the level's clock and its end", "next.back.gate.0", "and a slot kept under this", 0x80042830,
     "slti $v0, $v1, {}"),
    ("the level's clock and its end", "next.bonus.0", "opens this bonus slot", 0x80042838, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "next.back.gate.1", "under this", 0x8004283c, "slti $v0, $v1, {}"),
    ("the level's clock and its end", "next.bonus.1", "this", 0x80042844, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "next.bonus.2", "and else this", 0x8004284c, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "next.chain.end", "the word at 0x800a3448 at 2 would run the bonus levels on "
     "while the slot after is under this", 0x800428b0, "slti $v0, $v0, {}"),
    ("the level's clock and its end", "next.start.bonus", "and start a world at this slot", 0x80042910,
     "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "run.worlds", "the world word reaching this ends the game", 0x80041cc0,
     "slti $v0, $v0, {}"),

    ("the fly-in", "flight.unit.shift", "the start shifts the ball's frame vectors up by this, a whole unit to eight blocks",
     0x80033ebc, "sll $v0, $v0, {}"),
    ("the fly-in", "flight.quarter.shift", "the curve's second point lies the way from the first to the last shifted down by this on",
     0x80034254, "sra $v1, $a2, {}"),
    ("the fly-in", "flight.half.shift", "and the third the heading's eight blocks shifted down by this short of the last",
     0x800342ac, "sra $v0, $v0, {}"),
    ("the fly-in", "flight.first", "the slowing step starts at this", 0x80033f2c, "addiu $v1, $zero, {}"),
    ("the fly-in", "flight.end.gate", "the view flies while the parameter is under this", 0x80034340, "slti $v0, $v1, {}"),
    ("the fly-in", "flight.least", "and the mode word is not this, which is the slowing step's floor too", 0x80034354,
     "addiu $s4, $zero, {}"),
    ("the fly-in", "flight.curve.shift", "the curve is evaluated with a shift of this, its unit one shifted up by two thirds of it",
     0x800343bc, "addiu $v0, $zero, {}"),
    ("the fly-in", "flight.yaw", "the view is turned about its down axis by the parameter plus this", 0x800344f8,
     "addiu $a0, $a0, {}"),
    ("the fly-in", "flight.pitch", "pitched down by this", 0x80034528, "addiu $a0, $zero, {}"),
    ("the fly-in", "flight.bank.from", "and rolled about its line of sight by this less the parameter", 0x80034538,
     "addiu $s0, $zero, {}"),
    ("the fly-in", "flight.bank.shift", "shifted up by this", 0x8003454c, "sll $a0, $a0, {}"),
    ("the fly-in", "flight.below", "the curve's point is put this below the middle of the view", 0x800345a8,
     "addiu $v0, $v0, {}"),
    ("the fly-in", "flight.out.shift", "and ahead of the eye by the remainder's share, shifted down by this, of the distance out",
     0x800345e4, "sra $v0, $v1, {}"),
    ("the fly-in", "flight.ahead", "over this, the depth in play", 0x800345e8, "addiu $v0, $v0, {}"),
    ("the fly-in", "flight.hold", "the flight writes this into the wait at 370 on each of its frames", 0x800345fc,
     "addiu $v0, $zero, {}"),
    ("the fly-in", "flight.slow.gate", "and steps the parameter while it is under this", 0x80034604, "slti $v0, $a0, {}"),
    ("the fly-in", "flight.step", "by this", 0x8003460c, "addiu $v0, $a0, {}"),
    ("the fly-in", "flight.end.gate.after", "and as the stepped parameter is no longer under this", 0x80034648,
     "slti $v0, $v0, {}"),
    ("the fly-in", "flight.done", "writes this into the wait", 0x80034650, "addiu $v0, $zero, {}"),
    ("the fly-in", "flight.gate",
     "the ball's routine skips the platforms, the captivators' moves and the hazards while the wait is this or more",
     0x80036650, "slti $v0, $v0, {}"),

    ("the blocks under the ball", "ice.kind", "ice is this kind under the ball", 0x8003aaac, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "cold.gain", "on which the cold at 520 grows by this a frame", 0x8003ad48,
     "addiu $v0, $v0, {}"),
    ("the blocks under the ball", "cold.top.gate", "and is set back once it passes this, less one", 0x8003ad50,
     "slti $v0, $v0, {}"),
    ("the blocks under the ball", "cold.back", "to this", 0x8003ad58, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "cold.wane", "and off ice wanes by this a frame", 0x8003ad6c, "addiu $v0, $v0, {}"),
    ("the blocks under the ball", "arrow.type", "an arrow is this type under the ball", 0x8003a9a0, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "crumble.whole", "a crumbling block's type word is this while it is whole", 0x8003afd8,
     "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "crumble.broken", "and this once the ball has stood on it", 0x8003b024,
     "addiu $v1, $zero, {}"),
    ("the blocks under the ball", "crumble.broken.seen", "which the frame's draw breaks the block at", 0x8002b4a0,
     "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "crumble.breaking", "setting the word to this while it shrinks", 0x8002b4bc,
     "addiu $t0, $zero, {}"),
    ("the blocks under the ball", "crumble.code.input", "the input routine holds a ball rolling on this", 0x80037368,
     "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "crumble.edge.hold", "short of its free edge, dropping the roll and the speed from this progress",
     0x800373a4, "slti $v0, $v0, {}"),
    ("the blocks under the ball", "crumble.edge.back", "and setting the centre back from this", 0x800373b8,
     "slti $v0, $v0, {}"),
    ("the blocks under the ball", "ride.kind", "a platform is this kind under the landing's probe", 0x800335b4,
     "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.body.off", "which lands the ball under this far off its face", 0x80033614,
     "slti $v0, $v0, {}"),
    ("the blocks under the ball", "ride.bias", "its centre kept relative to the platform's position plus this", 0x800331c8,
     "addiu $v0, $v0, {}"),
    ("the blocks under the ball", "ride.bias.back", "and the travel that position plus this", 0x80033204,
     "addiu $v0, $v0, {}"),
    ("the blocks under the ball", "ride.bias.travel", "as the hazards take it each frame", 0x8003b40c,
     "addiu $v0, $v0, {}"),
    ("the blocks under the ball", "ride.beam", "the level's lattice read at the true cell for this alone", 0x80033be4,
     "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.rumble", "and the pad shaken by this while the platform moves", 0x80033c2c,
     "addiu $a1, $zero, {}"),
    ("the blocks under the ball", "ride.face.x", "the face of the ball's normal is numbered as the slots are, +x this",
     0x80037fb0, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.face.x.back", "-x this", 0x80037fbc, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.face.y", "+y this", 0x80037fd4, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.face.y.back", "-y this", 0x80037fdc, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.face.z", "and the underside this, the top being 0", 0x80037ff4,
     "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.along.x", "the direction test pairs an axis word or a face of this", 0x80033c54,
     "addiu $v1, $zero, {}"),
    ("the blocks under the ball", "ride.along.x.back", "with an axis word of this as x", 0x80033c5c,
     "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.along.face.x.back", "and a face of this", 0x80033c6c, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.along.y.from", "an axis word this far past the y pair's first", 0x80033c64,
     "addiu $v0, $a0, {}"),
    ("the blocks under the ball", "ride.along.y.span", "within a pair this wide, as y", 0x80033c78, "sltiu $v0, $v0, {}"),
    ("the blocks under the ball", "ride.along.face.y.from", "and a face this far past the pair's first", 0x80033c80,
     "addiu $v0, $a1, {}"),
    ("the blocks under the ball", "ride.along.face.y.span", "within a pair this wide", 0x80033c84, "sltiu $v0, $v0, {}"),
    ("the blocks under the ball", "ride.along.z.back", "an axis word of 0 or this as z", 0x80033c94, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.along.face.z.back", "and a face of 0 or this", 0x80033ca4, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.along.yes", "answering this where the two fall in one pair", 0x80033cb0,
     "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.body.count.less", "the body test takes the record's count of blocks plus this",
     0x80032edc, "addiu $v0, $v0, {}"),
    ("the blocks under the ball", "ride.body.axis.y", "dispatches on the axis word, this for y", 0x80032ee4,
     "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.body.axis.x", "this for x", 0x80032efc, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.body.axis.z", "and this for z", 0x80032f10, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.body.ends", "and reaches this far past the first block's centre toward the near end, units",
     0x80032f30, "addiu $v0, $v0, {}"),
    ("the blocks under the ball", "ride.body.ends.back", "and this far past the last block's centre toward the far end", 0x80032f9c,
     "addiu $v0, $v0, {}"),
    ("the blocks under the ball", "ride.end.kind", "the end landing takes a record of this kind at the ball's own cell",
     0x80033704, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.end.kind.under", "or a block under it", 0x80033784, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.end.tolerance", "and runs the body test with a slack of this, units", 0x800337e4,
     "addiu $a2, $zero, {}"),
    ("the blocks under the ball", "ride.end.bias", "biases the centre by this, as the body landing does", 0x80033368,
     "addiu $v0, $v0, {}"),
    ("the blocks under the ball", "ride.end.low", "and lays it this far along the axis for a face toward the near end, units",
     0x800333cc, "addiu $v0, $zero, {}"),
    ("the blocks under the ball", "ride.end.high", "or the count of blocks times a block plus this for one toward the far end",
     0x800333f8, "addiu $v0, $v0, {}"),

    ("the Simon rooms", "simon.mode", "the input routine takes the Simon rooms' case where the game's mode word is this",
     0x80036bf4, "addiu $v0, $zero, {}"),
    ("the Simon rooms", "simon.verdict.stands", "and reads nothing while the verdict is the sequence done or this",
     0x80036e68, "addiu $v0, $zero, {}"),
    ("the Simon rooms", "simon.rest", "the idle count grows while the state is this, rest", 0x80036e70,
     "addiu $v0, $zero, {}"),
    ("the Simon rooms", "simon.idle.step", "by this a frame", 0x80036e9c, "addiu $v0, $v0, {}"),
    ("the Simon rooms", "simon.pad.up", "Up's bit", 0x80036eb8, "andi $v0, $v1, {}"),
    ("the Simon rooms", "simon.latch.up", "sets its latch to this", 0x80036ec0, "addiu $v0, $zero, {}"),
    ("the Simon rooms", "simon.pad.cross", "and Cross's bit", 0x80036ec8, "andi $v0, $v1, {}"),
    ("the Simon rooms", "simon.latch.cross", "its own to this", 0x80036ed0, "addiu $v0, $zero, {}"),
    ("the Simon rooms", "simon.latch.set", "a latch set reads this", 0x80036edc, "addiu $v1, $zero, {}"),
    ("the Simon rooms", "simon.latch.step", "the latch's count grows by this a frame either is set", 0x80036f00,
     "addiu $v0, $v0, {}"),
    ("the Simon rooms", "simon.latch", "and makes the requests once it is no longer under this", 0x80036f10,
     "slti $v0, $v0, {}"),
    ("the Simon rooms", "simon.idle.latch", "the latch and its count are cleared while the idle count is under this",
     0x80036f40, "slti $v0, $v0, {}"),
    ("the Simon rooms", "simon.rest.flag", "and the flag is set at rest, the state this", 0x80036f48,
     "addiu $v0, $zero, {}"),
    ("the Simon rooms", "simon.index.half", "the index shifted up by this for a halfword", 0x80036f7c, "sll $v0, $v0, {}"),
    ("the Simon rooms", "simon.flag", "to this where the sequence holds no move at it", 0x80036f94, "addiu $v0, $zero, {}"),
    ("the Simon rooms", "simon.idle.turn", "the requests are dropped while the idle count is under this", 0x80036fb8,
     "slti $v0, $v0, {}"),
    ("the Simon rooms", "simon.pad.left", "then Left's bit", 0x80036fdc, "andi $v0, $v0, {}"),
    ("the Simon rooms", "simon.turn.left", "asks a turn of this", 0x80036fe4, "addiu $v0, $zero, {}"),
    ("the Simon rooms", "simon.pad.right", "and Right's bit", 0x80036ff8, "andi $v0, $v0, {}"),
    ("the Simon rooms", "simon.turn.right", "one of this", 0x80037000, "addiu $v0, $zero, {}"),
    ("the Simon rooms", "simon.empty", "a turn right is told by this, and the sequence's empty halfword", 0x8003706c,
     "addiu $a1, $zero, {}"),
    ("the Simon rooms", "simon.empty.again", "on either path", 0x80037094, "addiu $a1, $zero, {}"),
    ("the Simon rooms", "simon.bit.right", "a turn right packs as this", 0x800370a0, "addiu $v0, $zero, {}"),
    ("the Simon rooms", "simon.request", "a request made reads this", 0x800370ac, "addiu $v1, $zero, {}"),
    ("the Simon rooms", "simon.bit.left", "a turn left adds this", 0x800370c0, "ori $v0, $v0, {}"),
    ("the Simon rooms", "simon.bit.forward", "the roll this", 0x800370e0, "ori $v0, $v0, {}"),
    ("the Simon rooms", "simon.bit.jump", "and the jump this", 0x80037100, "ori $v0, $v0, {}"),
    ("the Simon rooms", "simon.index.half.store", "the index shifted up by this for the halfword stored", 0x80037114,
     "sll $v0, $v0, {}"),
    ("the Simon rooms", "simon.verdict.done", "a move stored at the count of moves gives the verdict this", 0x80037148,
     "addiu $v0, $zero, {}"),
    ("the Simon rooms", "simon.verdict.wrong", "and a move unlike the one stored this", 0x80037160, "addiu $v0, $zero, {}"),
    ("the Simon rooms", "simon.index.step", "the index counts on by this a move", 0x80037170, "addiu $v0, $v0, {}"),
    ("the Simon rooms", "simon.pass", "the sequence done passes the turn on by this", 0x8003637c, "addiu $v0, $v0, {}"),
    ("the Simon rooms", "simon.pass.shift", "round the players, two by this shift", 0x80036388, "sra $v1, $v1, {}"),
    ("the Simon rooms", "simon.start.mode", "the level's start takes the Simon rooms' branch where the mode word is this",
     0x80035d20, "addiu $v0, $zero, {}"),
    ("the Simon rooms", "simon.wait", "and writes this into the countdown at 370, under the start's own wait", 0x80035d44,
     "addiu $v0, $zero, {}"),
    ("the Simon rooms", "simon.round.step", "counts the round on by this", 0x80035d70, "addiu $v1, $v1, {}"),
    ("the Simon rooms", "simon.grow", "and the count of moves by this", 0x80035d74, "addiu $v0, $v0, {}"),
    ("the Simon rooms", "simon.fill", "the reset fills the sequence with this", 0x80035cd4, "addiu $a1, $zero, {}"),
    ("the Simon rooms", "simon.store.last", "from the halfword at this index", 0x80035cd8, "addiu $v1, $zero, {}"),
    ("the Simon rooms", "simon.fill.down", "counting down by this", 0x80035ce8, "addiu $v1, $v1, {}"),
    ("the Simon rooms", "simon.fill.step", "a halfword this many bytes on", 0x80035cf0, "addiu $v0, $v0, {}"),
    ("the Simon rooms", "simon.first", "and puts the count of moves at this", 0x80035cf4, "addiu $v0, $zero, {}"),
    ("the Simon rooms", "simon.starter.flip", "the game's loop flips the word at 0x800a38a0 by this before the reset",
     0x800405fc, "xori $a0, $a0, {}"),
    ("the Simon rooms", "simon.menu.start", "the menu that starts the mode sets the mode word and that word to this",
     0x800496a0, "addiu $s0, $zero, {}"),
    ("the Simon rooms", "simon.points.last", "and clears the points from the word at this index", 0x80049654,
     "addiu $v1, $zero, {}"),
    ("the Simon rooms", "simon.loop.mode", "the level loop gives a point in the mode this", 0x80040a98,
     "addiu $s2, $zero, {}"),
    ("the Simon rooms", "simon.other", "to the turn plus this", 0x80041b58, "addiu $v1, $v1, {}"),
    ("the Simon rooms", "simon.players.shift", "taken round the players, two by this shift", 0x80041b64,
     "sra $a0, $v0, {}"),
    ("the Simon rooms", "simon.point", "one point", 0x80041b88, "addiu $v0, $v0, {}"),
    ("the Simon rooms", "simon.next.mode", "the next-level routine takes the Simon rooms' branch where the mode word is this",
     0x80042620, "addiu $v0, $zero, {}"),
    ("the Simon rooms", "simon.world.step", "and counts the world word on by this", 0x80042678, "addiu $v1, $v1, {}"),
    ("the Simon rooms", "simon.room.step", "and the slot by this", 0x80042680, "addiu $v0, $v0, {}"),
    ("the Simon rooms", "simon.next.worlds", "and puts both back to nothing where the world word is no longer under this",
     0x800426b8, "slti $v0, $v0, {}"),
    ("the Simon rooms", "simon.points.gate", "the end screen names the winner where the first player's points are no longer "
     "under this", 0x8001581c, "slti $v0, $v1, {}"),
    ("the Simon rooms", "simon.points.gate.other", "or the second's this", 0x80015834, "slti $v0, $v0, {}"),
    ("the Simon rooms", "simon.menu.cross", "menu code reads a press of this bit", 0x8004ad40, "andi $v0, $v0, {}"),
    ("the Simon rooms", "simon.menu.gate", "and asks the first player's points against this", 0x8004ad70,
     "slti $v0, $v0, {}"),
    ("the Simon rooms", "simon.menu.gate.other", "and the second's", 0x8004ad88, "slti $v0, $v0, {}"),
    ("the Simon rooms", "simon.menu.over", "and past it puts the total at this", 0x8004ada8, "addiu $v0, $zero, {}"),

    ("the effects", "effect.slots.last", "startup clears the effect tables' pointers from the one at this index down",
    0x800114fc, "addiu $s1, $zero, {}"),
    ("the effects", "effect.colour.a", "a byte of the sprites' light colours", 0x80011580, "addiu $v1, $zero, {}"),
    ("the effects", "effect.colour.b", "another", 0x80011588, "addiu $v0, $zero, {}"),
    ("the effects", "effect.colour.c", "another", 0x80011598, "addiu $a0, $zero, {}"),
    ("the effects", "effect.colour.d", "another", 0x800115a4, "addiu $v1, $zero, {}"),
    ("the effects", "effect.colour.e", "another", 0x800115ac, "addiu $v0, $zero, {}"),
    ("the effects", "effect.colour.f", "and the last", 0x800115b8, "addiu $v0, $zero, {}"),
    ("the effects", "effect.sprites", "quads laid for this many sprites", 0x80011608, "slti $v0, $s1, {}"),
    ("the effects", "effect.full", "each coloured this, the texture's own, until a row sets it",
    0x80011628, "addiu $v0, $zero, {}"),
    ("the effects", "effect.quad", "a quad is this many bytes", 0x8001189c, "addiu $s2, $s2, {}"),
    ("the effects", "effect.most", "effects in a player's list at most", 0x80011900, "slti $v0, $a0, {}"),
    ("the effects", "effect.third", "the position's word this far in says where the effect is drawn",
    0x8001190c, "lh $v0, {}($a1)"),
    ("the effects", "effect.players", "one in the world starts only with this many players",
    0x80011918, "addiu $v0, $zero, {}"),
    ("the effects", "effect.gone", "an effect run out takes this off the count", 0x80011bc8, "addiu $v1, $v1, {}"),
    ("the effects", "effect.row.quad", "a frame's rows lie at the count times the frame shifted by this",
    0x80011df0, "sll $v1, $v1, {}"),
    ("the effects", "effect.row.double", "and by this", 0x80011e10, "sll $v1, $t5, {}"),
    ("the effects", "effect.header", "past a header of this many bytes", 0x80011e14, "addiu $v1, $v1, {}"),
    ("the effects", "effect.dice", "a row's angle below nothing draws from the dice, of this",
    0x80012034, "addiu $a0, $zero, {}"),
    ("the effects", "effect.hud.shift", "on the HUD the size times the cosine is shifted down by this",
    0x80012130, "sra $s1, $t4, {}"),
    ("the effects", "effect.hud.shift.sine", "and times the sine by this", 0x80012148, "sra $t1, $t5, {}"),
    ("the effects", "effect.prims", "an entry's position lies past this many bytes of primitives",
    0x80012368, "addiu $a0, $a0, {}"),
    ("the effects", "effect.depth.shift", "in the world the depth is what the projection gives shifted up by this",
    0x8001236c, "sll $s0, $v0, {}"),
    ("the effects", "effect.near", "and a particle nearer than this is skipped", 0x80012370, "slti $v0, $s0, {}"),
    ("the effects", "effect.dice.world", "a world row's angle below nothing draws from the dice, of this",
    0x80012394, "addiu $a0, $zero, {}"),
    ("the effects", "effect.whole.shift", "and divides the size by the cosine shifted down by this",
    0x800123e0, "sra $a1, $v0, {}"),
    ("the effects", "effect.whole.one", "or by this where that is nothing", 0x800123ec, "addiu $a1, $zero, {}"),
    ("the effects", "effect.whole.shift.sine", "and by the sine shifted down by this", 0x80012450, "sra $a1, $v0, {}"),
    ("the effects", "effect.whole.one.sine", "or by this", 0x8001245c, "addiu $a1, $zero, {}"),
    ("the effects", "effect.world.shift", "else the scaled size times the cosine is shifted down by this",
    0x80012548, "sra $s1, $t0, {}"),
    ("the effects", "effect.world.shift.sine", "and times the sine by this", 0x80012580, "sra $t1, $v1, {}"),
    ("the effects", "effect.light.shift", "a colour byte times the brightness is shifted down by this into the light",
    0x800126e4, "sra $v0, $t3, {}"),
    ("the effects", "effect.light.shift.g", "the second byte's", 0x800126ec, "sra $v0, $t2, {}"),
    ("the effects", "effect.light.shift.b", "and the third's", 0x80012704, "sra $v0, $t6, {}"),
    ("the effects", "effect.table.shift", "the frame's table lies at the buffer times 513 shifted up by this",
    0x800129ac, "sll $v1, $v1, {}"),
    ("the effects", "effect.row.step", "a row is this many bytes", 0x800129f4, "addiu $s7, $s7, {}"),
    ("the effects", "effect.angle.step", "an angle's slot this many", 0x80012a38, "addiu $t5, $t5, {}"),
    ("the effects", "effect.particle", "and a particle's quad this many", 0x80012a50, "addiu $s4, $s4, {}"),
    ("the effects", "effect.step", "the frame count goes up by this a pass", 0x80012b18, "addiu $v1, $v1, {}"),
    ("the effects", "teleport.flash.on", "the flash's mark is set to this", 0x80020764, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.modes", "its modes under this take their strength apart",
    0x80020778, "slti $v0, $a0, {}"),
    ("the effects", "teleport.flash.from", "mode 0 starts at this", 0x80020788, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.mode.last", "the last mode", 0x80020794, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.from.last", "starts at this", 0x8002079c, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.from.1", "and mode 1 at this", 0x800207a8, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.run.on", "the run draws while the mark is this",
    0x800207bc, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.step", "and takes this off mode 0's strength a pass",
    0x80020810, "addiu $v0, $v0, {}"),
    ("the effects", "teleport.flash.step.1", "off mode 1's", 0x8002081c, "addiu $v0, $v0, {}"),
    ("the effects", "teleport.flash.step.last", "and off the last mode's", 0x80020828, "addiu $v0, $v0, {}"),
    ("the effects", "teleport.flash.level", "the level's load starts the flash on a level whose mode word is this",
    0x80024420, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.level.mode", "in this mode", 0x80024450, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.level.from", "at this", 0x80024458, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.blend", "the flash's page word asks this blend",
    0x80024480, "addiu $a1, $zero, {}"),
    ("the effects", "teleport.flash.semi", "and its quad is made semi-transparent by this",
    0x800244bc, "addiu $a1, $zero, {}"),
    ("the effects", "teleport.flash.wide", "its far corners lie the screen's width plus this",
    0x800244ec, "addiu $v1, $v1, {}"),
    ("the effects", "teleport.flash.high", "and its height plus this", 0x800244f0, "addiu $a2, $a2, {}"),
    ("the effects", "teleport.flash.len", "the quad's tag counts this many words", 0x800253b8, "addiu $v0, $zero, {}"),
    ("the effects", "teleport.flash.quad", "and codes it this, a flat quad", 0x800253c0, "addiu $v0, $zero, {}"),
    ("the effects", "effect.table.send", "the frame's table is sent from this many bytes in, its last word",
    0x8002a364, "addiu $a0, $a0, {}"),
    ("the effects", "effect.kind.42", "type 42's green form starts this kind", 0x80038754, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.32", "the lethargy pill this", 0x800387ac, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.34", "the bouncy pill this", 0x8003881c, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.33", "the invincibility pill this", 0x80038880, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.38", "the sunglasses this", 0x800388fc, "addiu $a0, $zero, {}"),
    ("the effects", "effect.hud.key.right", "a key's HUD effect lies this far right of its icon's point",
    0x800389a8, "addiu $v0, $v0, {}"),
    ("the effects", "effect.hud.key.down", "and this far down", 0x800389b8, "addiu $v0, $v0, {}"),
    ("the effects", "effect.hud.z", "with this as its third word, which puts it on the HUD",
    0x800389cc, "addiu $v0, $zero, {}"),
    ("the effects", "effect.kind.31", "the key starts this kind at the thing", 0x800389f4, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.36", "the gem this", 0x80038ac4, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.37", "the coin this", 0x80038b34, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.43", "the first fruit this", 0x80038c44, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.44", "the second", 0x80038cec, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.45", "the third", 0x80038d94, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.46", "the fourth", 0x80038e3c, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.47", "the fifth", 0x80038ee4, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.27", "and type 27's case, never reached, this", 0x80038fe0, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.35.hud", "the hourglass starts this kind at the clock",
    0x800390cc, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.35", "and this at the thing", 0x800390e8, "addiu $a0, $zero, {}"),
    ("the effects", "effect.kind.5.hud", "a teleporter starts this kind on the HUD as its count starts",
    0x8003a634, "addiu $a0, $zero, {}"),
    ("the effects", "teleport.flash.word", "and the send gives the flash this for the word the loop waits two blanks on",
    0x8003a68c, "addiu $a1, $zero, {}"),
    ("the effects", "effect.table.words", "the frame's table is cleared with this many words",
    0x80040b28, "addiu $a1, $zero, {}"),
]

# The table of brightness a beam's lines step through, from its first byte to
# the one past its last, each an address built by a lui and an addiu.
LASER_LEVELS = ((0x800280dc, 0x800280e0), (0x800280d4, 0x800280d8))
LASER_CIRCUITS = [["laser.colour.0a", "laser.colour.0b"], ["laser.colour.1"],
                  ["laser.colour.2"], ["laser.colour.3"]]
CHANNEL = 8          # bits to a channel of a colour word, red lowest
LEVEL_BITS = 5       # the depth the GPU draws a colour at
ADD = 1              # the blend that adds a quad to what is behind it

# The instructions whose first register is read rather than written.
READS_FIRST = {"sb", "sh", "sw", "swl", "swr", "mtc2", "ctc2", "mthi", "mtlo",
               "mult", "multu", "div", "divu", "beq", "bne", "blez", "bgtz", "bltz", "bgez",
               "bltzal", "bgezal", "jr"}

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
    ("the ball", "move.cells.up", "the cells about the ball: bytes from a layer's words to the layer above", 0x8003761c, 3,
     "t2", "v1"),
    ("the ball", "move.cells.on", "and from a row's to the row ahead", 0x80037638, 3, "t1", "a0"),
    ("the ball's roll", "arc.1.normal", "round an edge, the first frame moves the centre this far along the new normal",
     0x8002fa64, 6, "v1", "v0"),
    ("the ball's roll", "arc.1.heading", "and this far along the new heading", 0x8002fa7c, 1, "v1", "v1"),
    ("the ball's roll", "arc.2.normal", "the second this far along the normal", 0x8002fb08, 1, "a0", "a0"),
    ("the ball's roll", "arc.2.heading", "and this far along the heading", 0x8002fb0c, 5, "v1", "v0"),
    ("the ball's roll", "arc.3.normal", "the third this far along the normal", 0x8002fba8, 6, "v1", "v0"),
    ("the ball's roll", "arc.3.heading", "and this far along the heading", 0x8002fbc0, 1, "v1", "v1"),
    ("the ball's roll", "arc.4.normal", "the fourth this far along the normal", 0x8002fc50, 1, "a2", "a2"),
    ("the ball's roll", "arc.4.heading", "and this far along the heading", 0x8002fc54, 4, "v1", "v0"),
    ("the ball's roll", "land.under", "a landing looks this far under the centre along the normal, units",
     0x80030b64, 6, "v1", "v0"),
    ("the ball's roll", "land.lift", "and lifts the centre this far before laying it", 0x80030cc4, 6, "v1", "v0"),
    ("the ball's roll", "spin", "the body spins by this times the speed a frame, angle", 0x80032510, 4, "v0", "a0"),
    ("the ball's roll", "spin.rest", "as it does at rest", 0x800325d8, 4, "v0", "a0"),
    ("the ball's jump", "jump.snap", "as the jump ends the centre is the saved one moved this far along the heading",
     0x8002fe80, 1, "v0", "v0"),
    ("the ball's jump", "jump.far", "or this far after the long jump", 0x8002fe30, 4, "v0", "v1"),
    ("moving spikes", "spikes.phase.step", "phase: frames per step", 0x8002a110, 4, "v1", "v1"),
    ("vanishing block", "vanish.phase.step", "phase: frames per step", 0x80028c10, 3, "a1", "v1"),
    ("vanishing block", "vanish.in.scale", "fading in: the count's rise times this", 0x8002b860, 2, "v0", "v1"),
    ("vanishing block", "vanish.settle.scale", "settling: the count times this", 0x8002b914, 3, "a2", "v0"),
    ("vanishing block", "vanish.dim.scale", "dimming: the count times this", 0x8002ba28, 3, "a2", "v0"),
    ("vanishing block", "vanish.out.scale", "flashing out: the count times this", 0x8002bae8, 2, "a2", "v0"),
    ("moving platform", "platform.scale", "speed on the disc is scaled by this over sixty", 0x80032a60, 5, "v1", "v0"),
    ("the view in play", "rock.scale", "the pill's word is scaled by this before its sine", 0x80035324, 1, "a0", "v0"),
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
    ("shadows", "shadow.corkscrew.drop", "corkscrew: lies this far from its home toward the block, units", 0x8003e8e0, 6, "v1", "v0"),
    ("shadows", "shadow.corkscrew.fade", "corkscrew: weaker by this times the sine of its bounce", 0x8003ea10, 3, "v0", "v1"),
    ("what the ball takes", "hourglass.points", "the hourglass scores this a second of the clock it leaves", 0x800390a8, 5,
     "v1", "v0"),
    ("the level's clock and its end", "mark.under", "the block marked lies this far under the ball's centre, units",
     0x8003ad94, 7, "v1", "v0"),
    ("the level's clock and its end", "end.view.reach", "the ending's eye swings this far either way, units", 0x8003497c, 5,
     "v0", "a1"),
    ("the level's clock and its end", "end.view.reach.bonus", "or on a level with no key this far", 0x800349e8, 7, "v0",
     "a1"),
    ("the level's clock and its end", "death.levels", "a death's penalty counts this many levels a world", 0x80041fa0, 2,
     "v0", "v1"),
    ("the level's clock and its end", "death.each", "times this a level", 0x80041fb0, 6, "v1", "v1"),
    ("the level's clock and its end", "death.each.final", "as in the finals", 0x80041fdc, 5, "v0", "v1"),
    ("the level's clock and its end", "death.finals", "the finals count this many levels a world", 0x80041fd0, 1, "v0",
     "v0"),
    ("the level's clock and its end", "next.levels", "the next-level routine numbers a level by this many a world",
     0x80042488, 2, "a0", "v1"),
    ("the level's clock and its end", "next.levels.final", "and a final by this many", 0x800424a4, 1, "v1", "v1"),
    ("the level's clock and its end", "next.round.times", "the bonus slots come round every this many", 0x800425d4, 2,
     "v1", "v0"),
    ("the level's clock and its end", "words.allowance", "the time trial adds this many frames a step of its difficulty",
     0x80015748, 6, "a0", "v0"),
    ("the fly-in", "flight.above", "the curve ends this far along the normal from the view's target, units", 0x800341a4, 6,
     "a0", "v1"),
    ("the fly-in", "flight.out", "the eye starts this much further out along its line of sight, units", 0x800345b8, 8, "s0",
     "v1"),
    ("the blocks under the ball", "crumble.edge.push",
     "the input routine sets a ball at a crumbling block's free edge back this far along its heading, units",
     0x800373cc, 4, "v0", "v1"),
    ("the blocks under the ball", "ride.body.block", "the body test's run is the count of blocks less one times this, units",
     0x80032ee0, 1, "v0", "a3"),
    ("the blocks under the ball", "ride.end.block", "and the end landing's far end lies at the count times this", 0x800333f4, 1,
     "v0", "v0"),
    ("what harms the ball", "glow.gain", "the invincible ball's light takes the sine times this in red", 0x80032270, 3,
     "v0", "v1"),
    ("what harms the ball", "glow.gain.green", "in green", 0x800322c0, 3, "v0", "v1"),
    ("what harms the ball", "glow.gain.blue", "and in blue", 0x80032304, 3, "v0", "v1"),
    ("the effects", "effect.entry", "an effect's entry is this many bytes", 0x80011930, 5, "a0", "v0"),
    ("the effects", "effect.player", "and a player's list this many", 0x80011944, 5, "a3", "a0"),
    ("the effects", "effect.buffer", "a buffer's quads lie this many bytes apart in the entry", 0x80011e94, 3, "v1", "v0"),
    ("the effects", "effect.table.mul", "the frame's table lies at the buffer times this, shifted", 0x80012998, 2, "v1", "v0"),
]

# The one reach that is a square held in two halves of a word.
BUTTON_REACH = (0x80039bbc, "lui $v1, {}", 0x80039bc0, "ori $v1, $v1, {}")

# The share of the side the fly-in's second point lies on, a divide by a
# reciprocal with no shift after it.
FLIGHT_THIRD = (0x80034240, "lui $t0, {}", 0x80034248, "ori $t0, $t0, {}")

# What a draw multiplies the dice's state by, held in two halves of a word.
DICE_TIMES = (0x80047418, "lui $v1, {}", 0x80047420, "ori $v1, $v1, {}")
# And the glints' generator's.
GLINT_TIMES = (0x80050d54, "lui $t8, {}", 0x80050d58, "ori $t8, $t8, {}")

# A divisor the compiler turned into a multiply by a reciprocal and a shift:
# the two halves of the reciprocal and the shift of the high word.
DIVISORS = [
    ("the ball", "ball.breathe.over", "over this", 0x80032680, "lui $a0, {}", 0x80032684, "ori $a0, $a0, {}",
     0x800326a8, "sra $v1, $a2, {}"),
    ("shadows", "shadow.ball.over", "ball: and divided by this", 0x800323d4, "lui $s2, {}", 0x800323d8,
     "ori $s2, $s2, {}", 0x80032494, "sra $v0, $t8, {}"),
    ("vanishing block", "vanish.in.by", "fading in: over this", 0x8002b850, "lui $a0, {}", 0x8002b854,
     "ori $a0, $a0, {}", 0x8002b87c, "sra $v0, $t7, {}"),
    ("vanishing block", "vanish.settle.by", "settling: over this", 0x8002b90c, "lui $v1, {}", 0x8002b910,
     "ori $v1, $v1, {}", 0x8002b934, "sra $v1, $t7, {}"),
    ("vanishing block", "vanish.dim.by", "dimming: over this", 0x8002ba20, "lui $v1, {}", 0x8002ba24,
     "ori $v1, $v1, {}", 0x8002ba48, "sra $v1, $t7, {}"),
    ("vanishing block", "vanish.out.by", "flashing out: over this", 0x8002bae0, "lui $v1, {}", 0x8002bae4,
     "ori $v1, $v1, {}", 0x8002bb04, "sra $v1, $t7, {}"),
    ("what the ball takes", "hourglass.second", "the hourglass counts the clock it leaves in seconds of this many ticks",
     0x80039060, "lui $a0, {}", 0x80039064, "ori $a0, $a0, {}", 0x800390a0, "sra $v1, $t3, {}"),
    ("what harms the ball", "heat.shake.over", "the heat shakes the pad by more by the heat over this", 0x80036724,
     "lui $v0, {}", 0x80036728, "ori $v0, $v0, {}", 0x80036738, "sra $v0, $t2, {}"),
    ("what harms the ball", "tint.own", "the heat, the melt and the cold each tint the ball's light by their share of this",
     0x80032048, "lui $t3, {}", 0x800320b8, "ori $t3, $t3, {}", 0x80032130, "sra $v1, $v1, {}"),
    ("what harms the ball", "tint.other", "into their own channel and take their share of this off the other two",
     0x800320c4, "lui $t2, {}", 0x800320d0, "ori $t2, $t2, {}", 0x80032138, "sra $v0, $t0, {}"),
    ("the level's clock and its end", "next.third", "the bonus slot counts the finished slot in thirds of this many",
     0x80042598, "lui $v1, {}", 0x800425a0, "ori $v1, $v1, {}", 0x800425bc, "sra $a0, $t0, {}"),
    ("the Simon rooms", "simon.next.levels", "the furthest level reached is counted in worlds of this many",
     0x80042660, "lui $v0, {}", 0x80042668, "ori $v0, $v0, {}", 0x80042690, "sra $v0, $v0, {}"),
]

# A brightness or a step of one, a grey held as a colour word in two halves.
GREYS = [
    ("vanishing block", "vanish.in.to", "fading in: ends at", 0x8002b8c8, "lui $v1, {}", 0x8002b8cc, "ori $v1, $v1, {}"),
    ("vanishing block", "vanish.settle.to", "settling: ends at", 0x8002b984, "lui $v1, {}", 0x8002b988, "ori $v1, $v1, {}"),
    ("vanishing block", "vanish.dim.at", "dimming: starts at", 0x8002b9e0, "lui $v1, {}", 0x8002b9e4, "ori $v1, $v1, {}"),
    ("vanishing block", "vanish.out.at", "flashing out: starts at", 0x8002ba9c, "lui $v1, {}", 0x8002baa0, "ori $v1, $v1, {}"),
    ("gem's glints", "glint.rise", "a glinting corner rises by this in each channel", 0x80022f34, "lui $t0, {}",
     0x80022f38, "ori $t0, $t0, {}"),
    ("gem's glints", "glint.top", "to no more than this", 0x80022f3c, "lui $a3, {}", 0x80022f40, "ori $a3, $a3, {}"),
    ("gem's glints", "glint.fall", "and falls by this to no less than its own", 0x80022f44, "lui $v1, {}",
     0x80022f48, "ori $v1, $v1, {}"),
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

# The ball's states, dispatched through a table by the state plus one, and
# the three the moves run in: at rest, rolling and round an edge.
STATES = (0x80010134, -1, 9)
STATE_AT = {-1: 0x8002f8e4, 0: 0x8003007c, 1: 0x8002fce0, 2: 0x8002f930, 6: 0x8002ff18, 7: 0x8002fa38}
ARC_STEPS = 4             # frames the ball takes round an edge
BALL = "30"               # the ball's type in the table
BUTTON = 10               # the boost button's type
LONG = [3, 2]             # the long jump takes each row times the first over the second
ICE = 2
PLATFORM = 5
ABOUT = 3                 # cells each way about the ball
FIRE, ACID = 1, 4         # the kinds that harm by standing on them
LIT = -2                  # a lit beam's cell in the lattice
OFF = -1                  # the lattice's word for no block
VANISHING = 7
KEY, EXIT, HIDDEN_EXIT, MOVING_SPIKES, SPIKES, WANDERER, CORKSCREW = 31, 7, 26, 11, 12, 53, 56
SLOTS = 6                 # slots to a record
ARROW = 28
BROWN = 0                 # type 42's form that stays and harms
UNHARMED = -1             # the invincibility word while no pill lasts
BALL_RECORD = 0x800ba114  # the ball's record, which the pills' words lie in
INVINCIBLE_WORD = 0x800ba340
CLEARED = ((0x80069988, 0x8006998c), (0x80069990, 0x80069994))  # the range the start zeroes word by word
LEVELS = 15               # levels a world the penalty counts
FINALS = 2                # finals a world
NEXT_ROUND = (0x800425ac, "lui $v1, {}", 0x800425b0, "ori $v1, $v1, {}")   # the bonus slots come round by it
NEXT_MODE = 0x800a3448    # the word the next-level routine's other starts hang on
NEXT_MODE_CLEARS = (0x800482e4, 0x8004adc4, 0x8004b5dc)
STORES = {0x28, 0x29, 0x2a, 0x2b, 0x2e}   # the store opcodes
WIDTHS = {"sb": 1, "sh": 2, "sw": 4, "swc2": 4}   # bytes a store writes; swl and swr stay within their word
ARGUMENTS = ("a0", "a1", "a2", "a3")
CALLER_SAVED = ("at", "v0", "v1", *ARGUMENTS, *(f"t{i}" for i in range(10)), "ra")

# A stretch of code whose every store the scan resolves to an address, none within a span of the
# ball's record: its first and last instruction, the register handed the record, the span's first
# and last word, and the calls the record goes on to, each where, the callee and the argument
# registers holding it with their offsets.
SCANS = [
    ("the devices under the ball", "send.stores",
     "stores in the send, each resolved to its address, none from 564 to 688 of the ball's record",
     0x8003a6b4, 0x8003a8fc, "s0", (564, 688),
     ((0x8003a734, 0x80038178, {"a2": 0}), (0x8003a8f8, 0x80037430, {"a0": 0}))),
    ("the devices under the ball", "frame.stores",
     "stores in the frame routine the send hands the record to, each resolved, none from 564 to 688, and it calls nothing",
     0x80038178, 0x800383e8, "a2", (564, 688), ()),
]
PLAYERS = 2
SIMON_STORE = (0x8003710c, 0x80037110)   # the sequence the Simon rooms hold a move to, as the pad builds its address
SIMON_FILL = (0x80035cdc, 0x80035ce0)    # and the halfword the reset fills it from
SIMON_AT = {"idle": (0x800a4c8c, 7508), "latch": (0x800a4c90, 7512), "move": (0x800a4adc, 7076),
            "count": (0x800a4cac, 7540), "round": (0x800a4cb0, 7544), "verdict": (0x800a4cb4, 7548),
            "turn": (0x800a33ac, 1140), "last": (0x800a5704, 10188), "starter": (0x800a38a0, 2408)}

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
GLOW_LEVELS = 3           # the levels a corner can take
# Where a lit teleporter's lift is, by circuit, and the shifts that double a lit exit's and switch's.
GLOW_LIFT = (0x8002d4b0, 0x8002d4b8)
GLOW_DOUBLE = {7: (0x8002d5c8, 0x8002d5cc), 9: (0x8002d694, 0x8002d698)}
MVMVA_SF = 1 << 19        # the command's bit that shifts its products down by 12
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

# Where the parser and the frame put the glints' records, and their generator's state.
GLINT_RECORDS = ((0x80022f4c, 0x80022f50), (0x8002aa2c, 0x8002aa30))
GLINT_STATE = (0x80050d48, 0x80050d4c)
GP_INIT = (0x80069a04, 0x80069a08)
GP = 0x800a2f38
MODE_WORD = (0x800a572c, 10228)   # the lethargy effect's mode word, and its offset from gp
LEVEL_MODE = (0x800a53d4, 9372)   # the level's mode word, and its offset from gp
LEVEL_MODE_READ = (0x80034830, 0x80034834)   # where the ending's view builds its address
GAME_MODE = (0x800a33b0, 1144)    # the game's mode word, 1 in the Simon rooms, and its offset from gp
GAME_MODE_READ = (0x80027cb0, 0x80027cb4)    # where the mode routine builds its address
SCREEN_WORDS = {"wide": 0x800a33d4, "high": 0x800a33dc, "distance": 0x800a33e4,
                "across": 0x800a33d8, "down": 0x800a33e0}
FLAT_TEXTURED = 0x2c      # the GPU's code for a flat textured quad
ONE_PLAYER = 2            # the gate the screen's effect asks the count of players against
CORNER = 4                # bytes to a corner of a polygon's colour

# The contact walk's and the loader's cases by type, from the first each
# knows, and the case every other type goes to.
TAKE_TYPES = (0x80010238, 27, 21)
TAKE_TAIL = 0x80039108
TAKE_CASES = {27: 0x80038f64, 31: 0x8003894c, 32: 0x80038794, 33: 0x80038868, 34: 0x80038804, 35: 0x80039048,
              36: 0x80038aac, 37: 0x80038b1c, 38: 0x800388cc, 42: 0x800386a4, 43: 0x80038c0c, 44: 0x80038cb4,
              45: 0x80038d5c, 46: 0x80038e04, 47: 0x80038eac}
LOADER_TYPES = (0x80010188, 5, 43)
LOADER_PLAIN = 0x80035924
LOADER_CASES = {**dict.fromkeys((5, 9, 11, 12, 28), 0x80035908), 7: 0x8003585c, 10: 0x800358ec, 26: 0x80035880,
                31: 0x800358a4, **dict.fromkeys((32, 33, 34, 38), 0x80035760), 35: 0x800357e4, 36: 0x80035810,
                37: 0x8003577c, 42: 0x800357b0, **dict.fromkeys(range(43, 48), 0x80035664)}
# The end landing lays the centre by the face of the ball's normal: a face toward the near end of the run goes to
# its axis's near case, one toward the far end to the far case.
END_FACES = (0x80010170, 0, FACES)
END_NEAR = {"-x": 0x800333cc, "-y": 0x80033404, "-z": 0x8003343c}
END_FAR = {"+x": 0x800333d8, "+y": 0x80033410, "+z": 0x80033444}
END_CASES = {FACE.index(f): at for f, at in (*END_NEAR.items(), *END_FAR.items())}
CUTS = 3                  # a gem's cuts, by its f3
TIERS = 3                 # a coin's tiers, by its f3
CRUMBLING = 6
CRUMBLING_UNDER = 96      # the ball's word for standing on a crumbling block
ENDINGS = ("exit", "bonus", "hidden", "spikes", "time", "lost", "fire", "captivator", "acid", "laser", "simon")

# The level's end screen: a table of deflated images two to a word, the word each pair letters read off the pictures
# and held to the disc by a digest of the pair's two images.
WORDS_TABLE = (0x80015a30, 0x80015a34)
WORDS_COUNT = 38
PAIR = 2                  # sprites to a word
TIM = (0x10, 0x8)         # an image's magic and its flags, four bits a pixel with a palette
WORDS = {0: ("LOADING!", 0x122f0a86), 2: ("SPIKED!", 0xfbb76945), 4: ("TIME OUT!", 0x7aae5b28),
         6: ("FELL OFF!", 0x44bd0451), 8: ("FIRE!", 0x9bb30072), 10: ("CAPTURED!", 0x0a0701e3),
         12: ("ACID!", 0xd8986b6e), 14: ("LASER!", 0x318d30cd), 16: ("Wrong Move!", 0x1a4e42da),
         18: ("Game Over!", 0x972e699e), 20: ("Well Done!", 0x6a8efed3), 22: ("You failed to qualify!", 0xa0166629),
         24: ("You qualified!", 0x75eea631), 28: ("Player 1 Won!", 0x4b91b885), 30: ("Player 2 Won!", 0xf2f91628),
         32: ("Equal Time!", 0x27bcf853), 34: ("Very Well Done!", 0x1a647fd3), 36: ("Level Cleared!", 0x5a073910)}

# The effects: the straight run of startup that fills the kinds' table pointers and the sprites' colours, where both
# lie with their offsets from gp, the frame's ordering table as the run, the loop's clear and the send build its
# address, the sine table's quarter turn, the HUD points the key-less effects start at, the kind a key and a fruit
# start at their icon, which the walk passes as $zero, a row's particles, the buffers an entry holds quads for, the
# words an entry holds past them and the GPU's flat quad.
EFFECT_INIT = (0x80011524, 0x800115fc)
EFFECT_POINTERS = (0x800a42f0, 5048)
EFFECT_COLOURS = (0x800a4328, 5104)
EFFECT_TABLE = ((0x80012950, 0x80012954), (0x80040b38, 0x80040b3c), (0x8002a350, 0x8002a354))
EFFECT_SINE = (0x8005fba8, "lui $at, {}", 0x8005fbb0, "lh $v0, {}($at)")
EFFECT_HUD = {"clock": (0x8003907c, 0x80039080), "teleport": (0x8003a640, 0x8003a644),
              "fruit": ((0x80038c1c, 0x80038c20), (0x80038cc4, 0x80038cc8), (0x80038d6c, 0x80038d70),
                        (0x80038e14, 0x80038e18), (0x80038ebc, 0x80038ec0))}
EFFECT_HUD_KIND = 0
EFFECT_WORLD = (27, 31, 32, 33, 34, 35, 36, 37, 38, 42, 43, 44, 45, 46, 47)
PARTICLES = 2
BUFFERS = 2
ENTRY_WORDS = 6
FLAT = 0x28
FLAT_WORDS = 5


class Code:
    def __init__(self, blob):
        self.blob = blob

    def word(self, addr):
        return struct.unpack_from("<I", self.blob, addr - EXE_BASE)[0]

    def holds(self, addr, n=4):
        return EXE_BASE <= addr and addr + n <= EXE_BASE + len(self.blob)

    def read(self, addr, n):
        return self.blob[addr - EXE_BASE:addr - EXE_BASE + n]

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

    def word_of(self, hi, hp, lo, lp):
        """The word a lui and an ori hold between them."""
        return (self.immediate(hi, hp) << 16) | (self.immediate(lo, lp) & 0xFFFF)

    def grey(self, hi, hp, lo, lp):
        """The level of a colour word whose three channels are one."""
        word = self.word_of(hi, hp, lo, lp)
        if word != (word & 0xFF) * 0x010101:
            sys.exit(f"0x{hi:08x} and 0x{lo:08x} hold the colour 0x{word:08x}, not a grey")
        return word & 0xFF

    def divisor(self, hi, hp, lo, lp, sa, sp):
        """The number a multiply by a reciprocal and a shift divides by."""
        return round(2 ** (32 + self.immediate(sa, sp)) / self.word_of(hi, hp, lo, lp))

    def multiplier(self, addr, count, src, dst):
        """The factor applied to `src` by `count` instructions of shifts and adds."""
        coef = {src: 1, "zero": 0}
        for i in range(count):
            pc = addr + 4 * i
            text = self.text(pc)
            m = re.match(r"(sll|addu|subu) \$(\w+), \$(\w+)(?:, \$(\w+)|, (\d+))$", text)
            if m:
                op, rd, a, b, sa = m.groups()
                x, y = coef.get(a), coef.get(b) if b else 0
                if x is None or y is None:
                    coef[rd] = None
                elif op == "sll":
                    coef[rd] = x << int(sa)
                else:
                    coef[rd] = x + y if op == "addu" else x - y
            else:
                m = re.match(r"(\w+) \$(\w+)", text)
                if m and m.group(1) not in READS_FIRST and m.group(2) in coef and m.group(2) != "zero":
                    coef[m.group(2)] = None      # overwritten by something not a shift or add
        if coef.get(dst) is None:
            sys.exit(f"0x{addr:08x}: {dst} is not a multiple of {src} after {count} instructions")
        return coef[dst]

    def stores_to(self, addr):
        """Every store to `addr` through gp, or through $at after a lui, as (address, register stored)."""
        out = []
        words = struct.unpack_from(f"<{len(self.blob) // 4}I", self.blob)
        for i, w in enumerate(words):
            if w >> 26 not in STORES:
                continue
            base, imm = (w >> 21) & 31, w & 0xFFFF
            if imm >= 0x8000:
                imm -= 0x10000
            if base == 28:
                at = GP + imm
            elif base == 1 and i and words[i - 1] >> 16 == 0x3C01:
                at = (0x80000000 | ((words[i - 1] & 0xFFFF) << 16)) + imm
            else:
                continue
            if at == addr:
                out.append((EXE_BASE + 4 * i, (w >> 16) & 31))
        return out

    def resolved(self, start, end, base, span, calls=(), record=BALL_RECORD):
        """How many stores the stretch from `start` to `end` makes, each resolved to an address through `base`,
        which holds `record`, a register derived from it, gp, sp or a lui; none within the record's `span` of
        words, no pointer made into it, and the record handed on by the `calls` listed alone."""
        low, high = record + span[0], record + span[1] + 3
        held = {base: (record, True), "gp": (GP, False)}     # a register's address, and whether it is the record's
        awaited = {where: (callee, handed) for where, callee, handed in calls}
        count, pc = 0, start
        while pc <= end:
            text = self.text(pc)
            if text.startswith("jal "):
                count += self.follow(pc + 4, held, low, high)     # the delay slot runs before the call
                handed = {r: a - record for r, (a, own) in held.items() if own and r in ARGUMENTS}
                callee, want = awaited.pop(pc, (0, None))
                if text != f"jal 0x{callee:08x}" or handed != want:
                    sys.exit(f"0x{pc:08x} `{text}` is handed the record in {handed}, which the reading does not follow")
                for r in CALLER_SAVED:
                    held.pop(r, None)
                pc += 8
                continue
            count += self.follow(pc, held, low, high)
            pc += 4
        if awaited:
            sys.exit(f"0x{start:08x}: the calls at {', '.join(f'0x{a:08x}' for a in awaited)} are not made")
        return count

    def follow(self, pc, held, low, high):
        """One instruction of a scanned stretch: a store resolved and counted, a pointer tracked, a register
        overwritten forgotten."""
        text = self.text(pc)
        m = re.match(r"(sb|sh|sw|swl|swr|swc2) \S+, (-?\d+)\(\$(\w+)\)$", text)
        if m:
            op, imm, reg = m.group(1), int(m.group(2)), m.group(3)
            if reg == "sp":
                return 1                                  # the stack cannot hold the record
            if reg not in held:
                sys.exit(f"0x{pc:08x} `{text}` stores through a register the scan cannot resolve")
            at = held[reg][0] + imm
            first, last = (at & ~3, (at & ~3) + 3) if op in ("swl", "swr") else (at, at + WIDTHS[op] - 1)
            if first <= high and last >= low:
                sys.exit(f"0x{pc:08x} `{text}` stores to 0x{at:08x}, within the span")
            return 1
        if text.startswith((".word", "jalr")) or (text.startswith("jr ") and text != "jr $ra"):
            sys.exit(f"0x{pc:08x} `{text}`, which the scan does not follow")
        m = re.match(r"(?:b\w+|j) .*0x([0-9a-f]{8})$", text)
        if m and int(m.group(1), 16) <= pc:
            sys.exit(f"0x{pc:08x} `{text}` loops back, which the scan does not follow")
        m = re.match(r"lui \$(\w+), (0x[0-9a-f]+)$", text)
        if m:
            held[m.group(1)] = (0x80000000 | (int(m.group(2), 0) << 16), False)
            return 0
        m = re.match(r"addiu \$(\w+), \$(\w+), (-?\d+)$", text)
        if m and m.group(2) in held:
            at, own = held[m.group(2)]
            self.point(pc, held, m.group(1), at + int(m.group(3)), own, low, high)
            return 0
        m = re.match(r"(?:addu|or) \$(\w+), \$(\w+), \$(\w+)$", text)
        if m and "zero" in m.groups()[1:]:
            src = m.group(2) if m.group(3) == "zero" else m.group(3)
            if src in held:
                self.point(pc, held, m.group(1), *held[src], low, high)
                return 0
        m = re.match(r"(\w+) \$(\w+)", text)
        if m and m.group(1) not in READS_FIRST:
            held.pop(m.group(2), None)
        return 0

    def point(self, pc, held, reg, at, own, low, high):
        """`reg` comes to hold the address `at`, unless that lies within the span."""
        if low <= at <= high:
            sys.exit(f"0x{pc:08x} `{self.text(pc)}` points into the span, at 0x{at:08x}")
        held[reg] = (at, own)


def readings(code):
    """Every number, by its id, after the checks have passed."""
    for addr, pattern, _ in CHECKS:
        code.immediate(addr, pattern)
    out = {}
    for _, key, _, addr, pattern in IMMEDIATES:
        out[key] = code.immediate(addr, pattern)
    for _, key, _, addr, count, src, dst in MULTIPLIERS:
        out[key] = code.multiplier(addr, count, src, dst)
    for _, key, _, start, end, base, span, calls in SCANS:
        out[key] = code.resolved(start, end, base, span, calls)
    out["button.reach"] = round(code.word_of(*BUTTON_REACH) ** 0.5)
    out["flight.third"] = round(2 ** 32 / code.word_of(*FLIGHT_THIRD))
    out["next.round"] = round(2 ** 32 / code.word_of(*NEXT_ROUND))
    out["next.mode.load"] = code.word(NEXT_MODE)
    stores = code.stores_to(NEXT_MODE)
    out["next.mode.clears"] = sorted(a for a, rt in stores if rt == 0)
    out["next.mode.writes"] = sorted(a for a, rt in stores if rt != 0)
    out["simon.store"] = code.address(*SIMON_STORE)
    out["simon.fill.from"] = code.address(*SIMON_FILL)
    out["dice.times"] = code.word_of(*DICE_TIMES)
    out["glint.times"] = code.word_of(*GLINT_TIMES)
    out["glint.seed"] = code.word(code.address(*GLINT_STATE))
    out["glint.at"], out["glint.frame.at"] = (code.address(*pair) for pair in GLINT_RECORDS)
    out["gp"] = code.address(*GP_INIT)
    out["mode.word"] = code.address(*LEVEL_MODE_READ)
    out["game.mode.word"] = code.address(*GAME_MODE_READ)
    out["glow.counter.load"] = int.from_bytes(code.read(out["gp"] + out["glow.counter.at"], 2), "little", signed=True)
    out["glow.clear"] = [code.address(*pair) for pair in CLEARED]
    for name, addr in SCREEN_WORDS.items():
        out[f"screen.load.{name}"] = code.word(addr)
    for _, key, _, *args in DIVISORS:
        out[key] = code.divisor(*args)
    for _, key, _, *args in GREYS:
        out[key] = code.grey(*args)
    start, end = (code.address(*pair) for pair in LASER_LEVELS)
    out["laser.levels"] = list(code.blob[start - EXE_BASE:end - EXE_BASE])
    out["shadow.half"] = shadow_half(code)
    out["light.root"] = root_table(code)
    out["glow"], out["glow.colours"] = glow(code, out)
    out["spin.order"] = spin_orders(code)
    out["spin.quarter"] = code.immediate(*QUARTER)
    out["words"] = words(code)
    out["effect.pointers"], out["effect.colours"] = effect_setup(code, out["effect.slots.last"] + 1, out["effect.sprites"])
    out["effect.tables"] = effect_tables(code, out["effect.pointers"])
    out["effect.sine.at"], out["effect.sine.one"] = effect_sine(code)
    out["effect.hud.at"] = effect_places(code)
    out["effect.table.at"] = [code.address(*pair) for pair in EFFECT_TABLE]
    moves(code, out)
    dispatch(code, TAKE_TYPES, TAKE_CASES, TAKE_TAIL, "the contact walk")
    dispatch(code, LOADER_TYPES, LOADER_CASES, LOADER_PLAIN, "the loader")
    dispatch(code, END_FACES, END_CASES, None, "the end landing")
    return out


def dispatch(code, where, cases, default, what):
    """A table of cases by type holds the case each type is known to go to."""
    at, first, count = where
    for typ in range(first, first + count):
        case = 0x80000000 | code.word(at + 4 * (typ - first))
        if cases.get(typ, default) != case:
            sys.exit(f"{what} sends type {typ} to 0x{case:08x}")


def root(v, what):
    """The root of a reach the code holds squared."""
    r = math.isqrt(v)
    if r * r != v:
        sys.exit(f"{what} is {v}, not a square")
    return r


def spin_orders(code):
    """The product each type's spin is, by the routine its draw calls."""
    out = {}
    for t, at in SPUN_AT.items():
        routine = code.immediate(at, "jal {}")
        if routine not in SPINS:
            sys.exit(f"type {t}'s spin is built by 0x{routine:08x}, which this does not know")
        out[t] = SPINS[routine]
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
    """How the game lights an invisible block near the ball, and the distances
    of a level that turns the light round."""
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


def moves(code, r):
    """What the move step holds the ball's moves to, each against the others:
    the middle of a cell is half a block in, a wall takes the ball where its
    side touches the wall, an edge where its centre reaches the cell's far
    side, and the states the moves run in are the ones the table names."""
    at, first, count = STATES
    for state in range(first, first + count):
        case = 0x80000000 | code.word(at + 4 * (state - first))
        if STATE_AT.get(state, case) != case:
            sys.exit(f"the ball's state {state} runs at 0x{case:08x}")
    middles = {r[k] for k in ("move.middle", "move.middle.past", "move.stop", "move.stop.refused")}
    if middles != {BLOCK // 2} or r["move.middle.last"] != BLOCK // 2 + 1:
        sys.exit(f"the move step's middle of a cell is {sorted(middles)}, not half a block in")
    if r["move.wrap"] != BLOCK:
        sys.exit(f"an edge takes the ball round at {r['move.wrap']}, not at the cell's far side")
    if r["move.touch"] != BLOCK - r["ball.rest"] or r["move.climb"] != r["move.touch"] + 1:
        sys.exit(f"a wall takes the ball at {r['move.climb']} and lays it at {r['move.touch']}, not touching it")
    if r["move.ice"] != ICE or r["move.ice.slide"] != ICE:
        sys.exit("the ball slides over an edge on another kind than ice")
    if r["move.lattice"] != SIDE - 1:
        sys.exit(f"a cell reads empty from {r['move.lattice']}, not from the lattice's edge")
    if r["move.cells.on"] != ABOUT * 4 or r["move.cells.up"] != ABOUT * r["move.cells.on"]:
        sys.exit("the cells about the ball are not three by three by three words")


def roll(r):
    """How the ball rolls, turns, goes round an edge and up a wall, falls and
    lands, each number held against the others: the one top speed wherever
    the roll takes it, the arc ending where the ball rests off a face, the
    view's ramps each running their count of steps to within a step of a
    quarter turn, or to it exactly, the last frame snapping the rest, and
    every gate one past the value it gates."""
    if len({r["roll.top"], r["roll.top.gate"], r["land.speed"], r["land.short.speed"], r["fall.spin.top"]}) != 1 \
            or r["fall.spin.top.gate"] != r["roll.top"] + 1:
        sys.exit("the roll's top speed is not one speed wherever it is taken")
    if r["roll.gain"] != r["fall.spin.gain"] or r["roll.gain"] != r["fall.back"]:
        sys.exit("the roll's speed does not grow and decay by one step")
    if r["roll.fall"] != r["roll.fall.rest"]:
        sys.exit("a fall from rest does not start as one from a roll")
    if r["fall.top.gate"] != r["fall.top"] + 1 or r["turn.clamp.gate"] != r["turn.clamp"] + 1:
        sys.exit("a fall's top speed or a turn's clamp is not gated at itself")
    if r["fall.wall"] + r["fall.behind"] != BLOCK or r["fall.wall.gate"] != r["fall.wall"] + 2 \
            or r["fall.behind.gate"] != r["fall.behind"] - 1:
        sys.exit("a falling ball is not held off the walls by about its radius")
    arc = [[r[f"arc.{i}.normal"], r[f"arc.{i}.heading"]] for i in range(1, ARC_STEPS + 1)]
    if sum(n for n, _ in arc) != r["wrap.resume"] or r["wrap.resume"] != r["ball.rest"] or r["land.off"] != r["ball.rest"]:
        sys.exit(f"the arc {arc} does not end with the ball resting off the new face")
    if r["land.under"] != r["ball.rest"] or r["land.lift"] != r["ball.rest"]:
        sys.exit("a landing does not look a radius under the centre")
    quarter = TURN // 4
    if r["turn.frames"] != r["turn.frames.right"] or r["turn.step"] != -r["turn.step.right"] \
            or not 0 < quarter - r["turn.frames"] * r["turn.step"] <= r["turn.step"]:
        sys.exit("a turn's yaw does not come within a step of a quarter turn")
    if not 0 < quarter - r["wrap.frames"] * r["wrap.step"] <= r["wrap.step"] \
            or r["climb.frames"] * r["climb.step"] != -quarter:
        sys.exit("a face change's pitch does not come to a quarter turn")
    if r["spin"] != r["spin.rest"]:
        sys.exit("the body spins otherwise in the air than on a face")
    for key in ("frames", "rise", "fall"):
        if r[f"squash.{key}"] != r[f"squash.hop.{key}"]:
            sys.exit("a hop's end does not squash the ball as a landing does")
    if r["squash.fall.reset"] != r["squash.fall"] or r["squash.least.gate"] != r["squash.least"]:
        sys.exit("the squash does not come off from its fall to its least")
    if r["look.rate"] != r["look.rate.jump"] or r["look.to.gate"] != r["look.to"] + 1 \
            or r["look.least.gate"] != r["look.least"] or r["look.far.gate"] != r["look.far"] + 1 \
            or r["look.held.gate"] != r["look.far"] + 1 or r["look.held.far"] != r["look.far"] \
            or r["look.back"] != -r["look.back.up"] or r["look.up"] != r["look.held"] or r["look.up.back"] != r["look.back"]:
        sys.exit("the view's extra pitch is not gated at its marks")
    bits = [r[k] for k in ("pad.up", "pad.right", "pad.left", "pad.cross", "pad.r1", "pad.r2")]
    if len(set(bits)) != len(bits) or any(b & (b - 1) for b in bits):
        sys.exit(f"the pad's bits {bits} are not one bit each")
    if r["pad.turn.left"] != -r["pad.turn.right"]:
        sys.exit("Left and Right do not ask opposite turns")
    cell = r["lost"] - 1
    return {
        "rolling": {"gain": r["roll.gain"], "top": r["roll.top"], "middle": r["move.middle"], "wrap": r["move.wrap"],
                 "climb": r["move.climb"], "touch": r["move.touch"], "resume": r["ball.rest"],
                 "recentre": r["roll.recentre"], "repeat": r["pad.repeat"],
                 "over": [-r["roll.fall.from"], -r["roll.fall.from"] + r["roll.fall.span"] - 1]},
        "quarter": {"frames": r["turn.frames"], "step": r["turn.step"], "clamp": r["turn.clamp"]},
        "wrap": {"frames": r["wrap.frames"], "step": r["wrap.step"], "arc": arc},
        "climb": {"frames": r["climb.frames"], "step": r["climb.step"]},
        "fall": {"start": r["roll.fall"], "hop": r["fall.hop"], "gain": r["fall.gain"], "top": r["fall.top"],
                 "short": r["land.short"], "wall": r["fall.wall"], "behind": r["fall.behind"],
                 "hold": [r["fall.wall.gate"], r["fall.behind.gate"]], "lost": [-2, cell]},
        "spin": r["spin"],
        "squash": {"frames": r["squash.frames"], "rise": r["squash.rise"], "fall": r["squash.fall"],
                   "ease": -r["squash.ease"], "least": r["squash.least"]},
        "look": {"from": r["look.rate"], "to": r["look.to"], "near": r["look.near"], "far": r["look.far"],
                 "least": r["look.least"], "back": -r["look.back"], "held": r["look.held"], "pitch": r["look.pitch"],
                 "rows": r["look.rows"]},
    }


def jump(r):
    """The jump, the hop and the boost button's launch, each number against
    the others: the jump at the roll's top speed, the rows past a count and
    three pads, the landings two and three blocks on, a wall met in the air
    where one takes a roll, and the centre drawn across as a roll's is."""
    if r["jump.speed"] != r["roll.top"]:
        sys.exit("the jump does not start at the roll's top speed")
    if r["jump.rows"] != 4 * r["jump.row"] or r["jump.step"] != -1:
        sys.exit("the jump's rows do not start past a count and three pads, or the count does not fall by one")
    if r["jump.snap"] != 2 * BLOCK or r["jump.far"] != 3 * BLOCK:
        sys.exit("the jump does not land two blocks on, or the long jump three")
    if len({r[k] for k in ("jump.wall", "jump.wall.high", "jump.ceiling", "jump.ceiling.ahead", "move.touch")}) != 1:
        sys.exit("a wall is not met in the air where one takes a roll")
    if r["jump.wall.low"] != r["ball.rest"] or r["jump.ceiling.behind"] != r["ball.rest"] + 1:
        sys.exit("the floor ahead or a block behind is not met at the ball's radius")
    if r["jump.recentre"] != r["roll.recentre"] or r["jump.bounce"] != r["roll.fall"]:
        sys.exit("a jump's centre is not drawn across, or a bounce does not start down, as a roll's are")
    if r["boost.type"] != BUTTON:
        sys.exit(f"the launch is a type {r['boost.type']}'s, not the boost button's")
    if not r["jump.arm"] < r["jump.keep"] <= r["jump.long"]:
        sys.exit("the long jump's word, armed, would not survive to the jump, or a count kept would land it long")
    if r["hop.rows"] != r["jump.rows"] or r["hop.skip"] != r["jump.skip"] or r["hop.step"] != r["jump.step"]:
        sys.exit("the hop does not run the jump's rows by the jump's count")
    if r["hop.row"] != r["jump.row"] or r["hop.ahead"] != 3 * r["hop.row"]:
        sys.exit("the hop does not take the next row's height, a row of three halfwords on")
    return {"speed": r["jump.speed"], "skip": r["jump.skip"], "snap": r["jump.snap"], "far": r["jump.far"],
            "long": r["jump.long"], "scale": LONG, "arm": r["jump.arm"], "keep": r["jump.keep"],
            "recentre": r["jump.recentre"], "catch": r["jump.catch"],
            "wall": r["jump.wall"], "low": r["jump.wall.low"], "bounce": r["jump.bounce"],
            "boost": {"roll": r["boost.roll"], "frames": r["boost.frames"], "fire": r["boost.fire"]}}


def body(r):
    """The body's orientation, each number against the others: the draw's
    four marks the ones the routines that set them are tested for, each its
    own and none the cleared word; a turn in place and a wall turning the
    body's matrix a quarter turn, which the frame's takes back; the arc's
    frames turning the frame's matrix a quarter turn in all; and the
    matrices in the one fixed point. Returns the arc's turn a frame."""
    marks = {k: r[f"body.mark.{k}"] for k in ("wrap", "wall", "right", "left")}
    if any(r[f"body.test.{k}"] != m for k, m in marks.items()) or len(set(marks.values())) != len(marks) \
            or 0 in marks.values():
        sys.exit(f"the draw's marks {marks} are not the ones the draw tests for, each its own")
    quarter = TURN // 4
    if r["body.right"] != -quarter or r["body.left"] != quarter or r["body.wall"] != -quarter:
        sys.exit("a turn in place or a wall does not turn the body's matrix by a quarter turn")
    if r["body.wrap"] * ARC_STEPS != -quarter:
        sys.exit("the arc's frames do not turn the frame's matrix by a quarter turn in all")
    if r["body.one"] != ONE or r["body.one.landing"] != ONE:
        sys.exit("the matrices are not laid in the one fixed point")
    return r["body.wrap"]


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
    return {"every": everies.pop(), "part": [parts.pop(), 1 << 12], "spill": glow_spill(code),
            "lift": glow_lift(code)}, colours


def glow_lift(code):
    """What a lit device's model is drawn times, in 4096ths a channel: a
    teleporter's by its circuit, an exit's and a switch's one for all."""
    if code.multiplier(0x8002d4a4, 3, "a1", "v0") != 12:
        sys.exit("a teleporter's lift is not three words to a circuit")
    base = code.address(*GLOW_LIFT)
    circuits = GLOW_COLOURS[5][1]
    lift = {5: [[code.word(base + 12 * c + 4 * ch) for ch in range(3)] for c in range(circuits)]}
    for t, (up, down) in GLOW_DOUBLE.items():
        times = 1 << (code.immediate(up, "sll $v0, $s5, {}") - code.immediate(down, "sra $s5, $v0, {}"))
        lift[t] = [[times << 12] * 3]
    return {str(t): lift[t] for t in sorted(lift)}


def glint(r):
    """The gem's glints: the chance a run starts one, how a glinting corner
    rises and falls, how many a record holds at once, the parser's rows and
    cuts of records, which the frame runs over a row at a time, and the
    generator a run steps once."""
    if r["glint.at"] != r["glint.frame.at"]:
        sys.exit(f"the frame runs the glint over 0x{r['glint.frame.at']:08x}, "
                 f"not the records the parser builds at 0x{r['glint.at']:08x}")
    for key in ("rows", "cuts", "record", "row"):
        if r[f"glint.{key}"] != r[f"glint.frame.{key}"]:
            sys.exit(f"the frame runs the glint over {r[f'glint.frame.{key}']} where the parser's {key} is "
                     f"{r[f'glint.{key}']}")
    if r["glint.record"] != r["glint.head"] + r["glint.slots"] * r["glint.slot"] \
            or r["glint.row"] != r["glint.cuts"] * r["glint.record"]:
        sys.exit("a glint's record does not hold its slots, or a row its records")
    if r["glint.flat"] != CORNER:
        sys.exit(f"a glint steps {r['glint.flat']} bytes of a flat polygon's colour, not its first corner")
    return {"chance": r["glint.chance"], "rise": r["glint.rise"], "top": r["glint.top"], "fall": r["glint.fall"],
            "slots": r["glint.slots"], "rows": r["glint.rows"], "cuts": r["glint.cuts"],
            "dice": {"seed": r["glint.seed"], "times": r["glint.times"], "plus": r["glint.plus"]}}


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


def spike_cycle(r, phase, frames=SPIKE_FRAMES, at=None):
    """The frame the moving spikes show on each frame of one cycle, for a
    phase, with whether their f4 holds the value the hazards kill on.

    The game's routine is run from the state its loader gives that phase,
    past the first cycle, which the loader cuts short or stretches, and one
    steady cycle is taken from the same frame for every phase, so the
    programs keep the game's spacing between them.
    """
    deadly, harmless = r["spikes.rise.flag"], r["spikes.retract.flag"]
    if deadly != r["spikes11.deadly"] or harmless == deadly:
        sys.exit("the moving spikes' f4 is not the hazards' deadly value as they rise and another as they retract")
    if (r["spikes.phase.down.flag"], r["spikes.phase.up.flag"]) != (harmless, deadly):
        sys.exit("the loader does not start the moving spikes harmless down and deadly held up or retracting")
    top = frames - 1
    v = phase * r["spikes.phase.step"]
    if v < r["spikes.phase.down"]:
        state, count, frame, flag = 0, r["spikes.phase.down.from"] - v, 0, r["spikes.phase.down.flag"]
    elif v < r["spikes.phase.held"]:
        state, count, frame, flag = 3, r["spikes.phase.held.from"] - v, top, r["spikes.phase.up.flag"]
    else:
        state, count, frame, flag = 4, r["spikes.phase.retracting.from"] - v, top, r["spikes.phase.up.flag"]
    rise, rattle, retract = r["spikes.rise"], r["spikes.rattle"], r["spikes.retract"]
    cycle = r["spikes.down"] + rise + 1 + rattle + 1 + r["spikes.hold"] + retract + 1
    at = cycle * 2 if at is None else at
    seq = []
    for _ in range(at + cycle * 2):
        count -= 1
        if state == 0:
            if count <= 0:
                state, count, flag = 1, rise, deadly
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
                if count == r["spikes.harmless"]:
                    flag = harmless
        seq.append((frame, flag == deadly))
    return period(seq, at, cycle, "the moving spikes")


def vanish_cycle(r, phase, at=None):
    """The state of a vanishing block on each frame of one cycle, for a phase,
    with the brightness its faces are drawn at, taken as the spikes' cycle is."""
    v = phase * r["vanish.phase.step"]
    if phase < r["vanish.phase.absent"]:
        state, count, level = 0, r["vanish.phase.absent.from"] - v, 0
    else:
        state, count, level = 3, r["vanish.phase.solid.from"] - v, r["vanish.settle.to"]
    lasts = [r["vanish.absent"], r["vanish.in"], r["vanish.settle"],
             r["vanish.solid"], r["vanish.dim"], r["vanish.out"]]
    for name, last in zip(("in", "settle", "dim", "out"), (lasts[1], lasts[2], lasts[4], lasts[5])):
        if r[f"vanish.{name}.by"] != last:
            sys.exit(f"the vanishing block's ramp {name} runs over {r[f'vanish.{name}.by']} frames of {last}")
    if r["vanish.in.over"] != lasts[1]:
        sys.exit(f"the vanishing block fades in from {r['vanish.in.over']} over {lasts[1]} frames")
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
                level = (r["vanish.in.over"] - count) * r["vanish.in.scale"] // r["vanish.in.by"]
            else:
                state, count, level = 2, lasts[2], r["vanish.in.to"]
        elif state == 2:
            if count > 0:
                level = count * r["vanish.settle.scale"] // r["vanish.settle.by"] + r["vanish.settle.floor"]
            else:
                state, count, level = 3, lasts[3], r["vanish.settle.to"]
        elif state == 3:
            if count <= 0:
                state, count, level = 4, lasts[4], r["vanish.dim.at"]
        elif state == 4:
            if count > 0:
                level = r["vanish.dim.from"] - count * r["vanish.dim.scale"] // r["vanish.dim.by"]
            else:
                state, count, level = 5, lasts[5], r["vanish.out.at"]
        else:
            if count > 0:
                level = r["vanish.out.scale"] * count // r["vanish.out.by"]
            else:
                state, count, level = 0, lasts[0], 0
        seq.append((state, level))
    return period(seq, at, cycle, "the vanishing block")


def period(seq, at, cycle, what):
    """One cycle from `at`, which has to repeat, or the reading is wrong."""
    if seq[at:at + cycle] != seq[at + cycle:at + 2 * cycle]:
        sys.exit(f"{what} does not repeat every {cycle} frames from frame {at}")
    return seq[at:at + cycle]


def take(r):
    """What the ball takes off its face, by type: how far from the thing's
    middle the ball's centre has to come, the ball's own radius apart, where
    that middle stands off its block's centre, what it scores and, for a
    fruit, the bit it sets in the pickups' word; and for each thing that lasts, the word it sets and how that word runs down, the
    bouncy pill's latch, the lethargy pill's with the blanks a pass waits while
    its effect stands, the roll of the view and the screen's flash, ghost,
    stretch and fade, and the invincibility pill's with the glow the ball's draw
    runs off its word."""
    if r["take.live"] != 1 or r["take.open"] != 1 or r["take.third"] != 2:
        sys.exit("the loader or the walk marks a thing with something other than 1")
    if r["take.first"] != -min(TAKE_CASES) or r["take.first"] + max(TAKE_CASES) >= TAKE_TYPES[2]:
        sys.exit("the walk's cases do not start at the first type its table knows")
    if root(r["take.within"], "the ball's part of the reach") != r["ball.rest"]:
        sys.exit("the walk's reach does not add the ball's radius")
    reach = {k: root(r[k], k) for k in ("take.reach", "take.reach.key", "take.reach.fruit")}
    stand = r["take.stand"]
    if r["hourglass.second"] != r["time.tick"]:
        sys.exit("the hourglass counts seconds otherwise than the clock does")
    if r["hourglass.from"] + 1 != r["ball.breathe.full"]:
        sys.exit("the hourglass does not take the clock from a tick short of the cap the breath takes the time against")
    fruit = {r[f"fruit.points.{t}"] for t in range(43, 48)}
    if len(fruit) != 1:
        sys.exit(f"the fruit score {sorted(fruit)}, not one figure")
    if r["pill.lethargy"] % r["pill.lethargy.step"] or r["pill.lethargy.step"] > -1:
        sys.exit("the lethargy pill's word does not count down to nothing in whole steps")
    if r["pill.invincible.step"] != -1 or r["sunglasses.step"] != -1:
        sys.exit("the invincibility pill's or the sunglasses' word does not count down by one")
    if r["sunglasses.flag.on"] != 1:
        sys.exit("the take does not call the sunglasses' blink's start with 1")
    if r["sunglasses.flag"] != 1:
        sys.exit("the blink's start does not set the sunglasses' flag to 1")
    if {r["sunglasses.blink.step"], r["sunglasses.blink.step.on"], r["sunglasses.blink.count.step"],
            r["sunglasses.blink.count.step.on"]} != {-1}:
        sys.exit("the sunglasses' blink does not count its timer and its count down by one")
    if r["sunglasses.blink.on"] != r["sunglasses.blink"] or r["sunglasses.blink.off"] != r["sunglasses.blink"]:
        sys.exit("the sunglasses' blink does not lay its timer at the frames the start lays it at")
    if r["pill.bouncy.hold"] != r["pill.bouncy"] - 1 or r["pill.bouncy.grow"] != 1:
        sys.exit("the bouncy pill's word does not grow by one from a step short of its start")
    if r["pill.bouncy.latch"] < 1 or r["pill.bouncy.latch.step"] != 1:
        sys.exit("the bouncy pill's latch does not count frames by one")
    if r["crumble.under"] != CRUMBLING_UNDER:
        sys.exit(f"a crumbling block scores while the ball stands on {r['crumble.under']}")
    if r["gp"] != GP or GP + MODE_WORD[1] != MODE_WORD[0] or r["pill.lethargy.players"] != ONE_PLAYER:
        sys.exit("the lethargy effect's mode word is not where gp puts it, or its start is not gated at one player")
    if r["rock.round"] != (1 << r["rock.shift"]) - 1:
        sys.exit("the view's roll is not rounded toward nothing by its own shift")
    if r["flash.code"] != FLAT_TEXTURED or r["flash.laid"] != r["screen.grey"]:
        sys.exit("the flash is not a flat textured quad with its colour laid as the pill's pass writes it")
    if r["screen.page.gate"] != r["screen.sprite.width"] + 1 or r["screen.sprite.rest"] != -r["screen.sprite.width"]:
        sys.exit("the ghost's second sprite is not gated at a page's width or does not take the rest of the screen")
    if r["screen.wane"] > -1 or r["screen.magnitude"] % r["screen.wane"] \
            or r["screen.fade"] > -1 or r["screen.end"] % r["screen.fade"]:
        sys.exit("the stretch's magnitude or the fade's level does not run down to nothing in whole steps")
    rest = (r["screen.rest.across"], r["screen.rest.down"])
    if rest != (r["screen.reset.across"], r["screen.reset.down"]) \
            or rest != (r["screen.load.across"], r["screen.load.down"]):
        sys.exit("the stretch does not rest at the scales the executable loads and a level's leaving puts back")
    if r["glow.gate"] != UNHARMED or BALL_RECORD + r["glow.gate.word"] != INVINCIBLE_WORD:
        sys.exit("the ball's draw does not gate its glow on the invincibility pill's word at rest")
    glow_round = 1 << r["glow.round.shift"]
    if r["glow.round.rest"] != r["glow.step"] + glow_round - 1 or glow_round != 2 * TURN:
        sys.exit("the glow's counter does not step modulo a round of two turns, rounded toward nothing")
    phases = {"red": 0, "green": r["glow.green.phase"], "blue": r["glow.blue.phase"]}
    for channel, phase in phases.items():
        if 1 << r[f"glow.{channel}.shift"] != TURN or r[f"glow.{channel}.rest"] != phase + TURN - 1:
            sys.exit(f"the glow's {channel} does not take its angle modulo a turn, rounded toward nothing")
    if r["glow.red.under"] != TURN or r["glow.green.from"] != phases["green"] - 1 \
            or r["glow.green.span"] != TURN - 1 or r["glow.blue.gate"] != 1 - phases["blue"]:
        sys.exit("a channel of the glow is not raised over the one turn its angle runs")
    if (-phases["green"], -phases["blue"]) != (TURN // 2, TURN):
        sys.exit("the glow's channels are not a quarter round apart")
    if r["glow.gain.green"] != r["glow.gain"] or r["glow.gain.blue"] != r["glow.gain"]:
        sys.exit("the glow's three channels do not share one gain")
    counter = r["gp"] + r["glow.counter.at"]
    if not r["glow.clear"][0] <= counter < r["glow.clear"][1] or r["glow.counter.load"] != 0:
        sys.exit("the glow's counter does not start at nothing")
    pickup = {"reach": reach["take.reach"], "stand": stand}
    taken = {
        31: {"reach": reach["take.reach.key"], "stand": stand, "points": r["key.points"]},
        32: pickup, 33: pickup, 34: pickup,
        35: {**pickup, "stand": r["take.stand.hourglass"], "points": r["hourglass.points"],
             "clock": {"from": r["hourglass.from"], "second": r["hourglass.second"]}},
        36: {**pickup, "stand": [stand] + [r["take.stand.gem"]] * (CUTS - 1), "points": r["gem.points"]},
        37: {**pickup, "stand": r["take.stand.coin"], "points": [r[f"coin.points.{t}"] for t in range(TIERS)]},
        38: {**pickup, "points": r["sunglasses.points"]},
        42: {**pickup, "stand": r["take.stand.star"], "points": r["star42.points"]},
    }
    for t in range(43, 48):
        taken[t] = {"reach": reach["take.reach.fruit"], "stand": stand, "points": next(iter(fruit)),
                    "fruit": r[f"fruit.bit.{t}"]}
    lasting = {
        32: {"word": r["pill.lethargy"], "step": -r["pill.lethargy.step"], "ticks": r["pill.lethargy.ticks"],
             "blanks": r["pill.lethargy.blanks"],
             "rock": {"scale": r["rock.scale"], "shift": r["rock.shift"]},
             "screen": {"grey": r["screen.grey"],
                        "tint": [r["screen.tint.outer"], r["screen.tint.green"], r["screen.tint.outer"]],
                        "magnitude": r["screen.magnitude"], "wane": -r["screen.wane"],
                        "step": r["screen.step"], "phase": r["screen.phase"],
                        "fade": {"from": r["screen.end"], "by": -r["screen.fade"]}}},
        33: {"word": r["pill.bouncy"], "hold": r["pill.bouncy.hold"], "latch": r["pill.bouncy.latch"]},
        34: {"word": r["pill.invincible"], "step": -r["pill.invincible.step"],
             "glow": {"step": r["glow.step"], "round": glow_round, "gain": r["glow.gain"],
                      "from": [-phase for phase in phases.values()]}},
        38: {"word": r["sunglasses.word"], "step": -r["sunglasses.step"],
             "blink": {"times": r["sunglasses.blinks"], "frames": r["sunglasses.blink"],
                       "first": r["sunglasses.blink"] + r["sunglasses.blink.step"]}},
    }
    return taken, lasting


def exits(r):
    """What the loader writes into the exits' slots and what the last key writes."""
    return {7: {"shut": {"f3": r["take.live"]}, "opened": {"f3": 0, "f4": r["take.open"]}},
            26: {"shut": {"f4": 0}, "opened": {"f4": r["take.open"]}}}


def band(r, key):
    """A run of progress the code tests as an offset and a span, as its two ends."""
    lo = -r[key]
    hi = lo + r[f"{key}.span"] - 1
    if lo + hi != BLOCK:
        sys.exit(f"{key} runs from {lo} to {hi}, not about the middle of a cell")
    return [lo, hi]


def devices(r):
    """What the teleporter and the switch under the ball do: the run of
    progress each acts in, the teleporter's count and the hold on the pad,
    and the run about the middle the marker that keeps either from acting
    twice holds in."""
    if r["send.type"] != 5 or r["send.mark"] != r["send.type"] or r["throw.type"] != 9:
        sys.exit("the devices' routines run on other types than the teleporter's and the switch's")
    if r["send.hold"] != r["send.hold.after"]:
        sys.exit("the teleporter holds the pad off otherwise after the ball is sent than before")
    if r["throw.laser"] != FACES:
        sys.exit(f"a switch's list names a laser by face {r['throw.laser']}, not the one past the six")
    rearm = band(r, "rearm")
    return {5: {"send": {"wait": r["send.wait"], "band": band(r, "send.band"), "hold": r["send.hold"], "rearm": rearm}},
            9: {"throw": {"band": band(r, "throw.band"), "rearm": rearm}}}


def flight(r):
    """The fly-in: the wait it holds the ball's words at and the gate the
    ball's routine skips the platforms, the captivators' moves and the
    hazards from, the wait it ends with, the parameter's end and steps with
    the frames flown simulated from them, the yaw and the roll it undoes,
    the pitch, the depths and the curve's points as shifts along the ball's
    frame, each held against the others: the end read alike before and
    after a step, the curve's unit and the depth's share both the end, the
    turn and the roll undone from it, the mode skipped the one the clock
    stands in, the pitch and the depths the view in play's, and the hold at
    the gate or past it where the start's wait and the last wait stay
    under it."""
    end = r["flight.end.gate"] - 1
    unit = 1 << r["flight.unit.shift"]
    if r["flight.end.gate.after"] != r["flight.end.gate"]:
        sys.exit("the flight's end is read as two values")
    if 1 << (2 * r["flight.curve.shift"] // 3) != end or 1 << r["flight.out.shift"] != end:
        sys.exit("the curve's unit or the depth's share is not the parameter's end")
    if r["flight.yaw"] != -end or r["flight.bank.from"] != end:
        sys.exit("the flight's turn and roll are not undone from the parameter's end")
    if r["flight.least"] != r["clock.mode"]:
        sys.exit("the 1 the flight tests the mode word against is not the mode the clock stands in")
    if r["flight.pitch"] != r["look.pitch"] or r["flight.below"] != r["look.below"] or r["flight.ahead"] != r["look.ahead"]:
        sys.exit("the flight pitches the view or places its point otherwise than the view in play")
    if not r["start.wait"] < r["flight.gate"] <= r["flight.hold"] or not 0 < r["flight.done"] < r["flight.gate"]:
        sys.exit("the flight's hold does not reach the gate the start's wait and its last wait stay under")
    slow, step, least = r["flight.slow.gate"] - 1, r["flight.step"], r["flight.least"]
    t, inc, frames = 0, r["flight.first"], 0
    while t <= end:
        frames += 1
        if t <= slow:
            t += step
        else:
            t, inc = t + inc, inc - 1
            if inc <= 0:
                inc = least
    quarter, half = unit >> r["flight.quarter.shift"], unit >> r["flight.half.shift"]
    return {"hold": r["flight.hold"], "gate": r["flight.gate"], "done": r["flight.done"],
            "end": end, "step": step, "slow": slow, "first": r["flight.first"], "least": least, "frames": frames,
            "yaw": r["flight.yaw"], "bank": end << r["flight.bank.shift"], "pitch": r["flight.pitch"],
            "below": r["flight.below"], "ahead": r["flight.ahead"], "out": r["flight.out"],
            "curve": {"above": r["flight.above"], "back": [unit, unit - quarter, half, 0],
                      "left": [unit, unit - quarter - unit // r["flight.third"], 0, 0]}}


def words(code):
    """The word each pair of the end screen's sprites letters, by the index
    of the pair's first entry. The table the loader reads is the count of
    its entries and then an offset and a length for each, a deflated image
    four bits a pixel with a palette; a pair is held to the disc by a digest
    of its two images, and a pair that letters no word is left out."""
    sprites = 0x80000000 | code.word(code.address(*WORDS_TABLE))
    count = code.word(sprites)
    if count != WORDS_COUNT:
        sys.exit(f"the end screen's table at 0x{sprites:08x} holds {count} entries, not {WORDS_COUNT}")
    out = {}
    for index, (word, digest) in WORDS.items():
        pair = b""
        for entry in range(index, index + PAIR):
            offset, size = code.word(sprites + 4 + 8 * entry), code.word(sprites + 8 + 8 * entry)
            try:
                image = zlib.decompress(code.read(sprites + offset, size))
            except zlib.error as e:
                sys.exit(f"entry {entry} of the end screen's table does not inflate: {e}")
            if len(image) < 8 or struct.unpack_from("<II", image) != TIM:
                sys.exit(f"entry {entry} of the end screen's table is not an image four bits a pixel with a palette")
            pair += image
        if zlib.crc32(pair) != digest:
            sys.exit(f"entries {index} and {index + 1} of the end screen's table are not the pair read as {word!r}")
        out[index] = word
    return out


def simon(r):
    """The Simon rooms' words: the frames Up and Cross are latched over, the
    idle count's gates for the latch and for a turn, the bits a move packs
    into, the sequence's length and the halfword that holds no move, the
    count of moves the reset leaves, the two verdicts, the moves a round adds,
    the points a game is won past, the players the turn and the point go
    round, the word the menu sets for the loop to flip and the total the menu
    code puts to end the game, each held against the others: one mode for the
    pad's case, the start's branch, the loop's point, the next-level routine's
    branch and the menu, the pad's verdicts the ending's, the bits one each,
    the reset's fill the sequence the pad reads from its last halfword down,
    a latched request past the turn's gate, and one gate for the points
    wherever they are asked."""
    if len({r["simon.mode"], r["simon.start.mode"], r["simon.loop.mode"], r["simon.next.mode"], r["simon.menu.start"],
            r["clock.mode"]}) != 1:
        sys.exit("the Simon rooms' case, branch, point and menu are not keyed on the mode the clock stands in")
    if r["simon.verdict.done"] != r["simon.done"] or r["simon.verdict.wrong"] != r["simon.wrong"] \
            or r["simon.verdict.stands"] != r["simon.wrong"]:
        sys.exit("the pad's verdicts are not the ones the ending reads")
    if r["simon.rest"] != STATES[1] or r["simon.rest.flag"] != STATES[1]:
        sys.exit("the idle count does not grow in the rest state")
    if any(r[f"simon.pad.{key}"] != r[f"pad.{key}"] for key in ("up", "cross", "left", "right")) \
            or r["simon.menu.cross"] != r["pad.cross"]:
        sys.exit("the Simon rooms read other bits of the pad than the arcade's")
    if r["simon.turn.left"] != r["pad.turn.left"] or r["simon.turn.right"] != r["pad.turn.right"] \
            or r["simon.empty"] != r["simon.turn.right"]:
        sys.exit("the Simon rooms' turns are not the arcade's, or a turn right is not told by the empty halfword's -1")
    if {r["simon.latch.up"], r["simon.latch.cross"], r["simon.latch.set"], r["simon.request"], r["simon.flag"],
            r["simon.idle.step"], r["simon.latch.step"], r["simon.index.step"], r["simon.round.step"], r["simon.pass"],
            r["simon.other"], r["simon.point"], r["simon.room.step"], r["simon.world.step"], r["simon.first"],
            r["simon.starter.flip"]} != {1}:
        sys.exit("a latch, a request, the flag, a count's step or the first count of moves is not 1")
    bits = {name: r[f"simon.bit.{name}"] for name in ("right", "left", "forward", "jump")}
    if sorted(bits.values()) != [1 << i for i in range(len(bits))]:
        sys.exit(f"a move's bits are {bits}, not one each")
    half = 1 << r["simon.index.half"]
    if r["simon.index.half.store"] != r["simon.index.half"] or half != 2 or r["simon.fill.step"] != -half \
            or r["simon.fill.down"] != -1 or r["simon.fill"] != r["simon.empty"] or r["simon.empty.again"] != r["simon.empty"] \
            or r["simon.fill.from"] != r["simon.store"] + half * r["simon.store.last"]:
        sys.exit("the reset does not fill the sequence the pad reads with the empty halfword, from its last down")
    if r["simon.idle.latch"] + r["simon.latch"] - 1 < r["simon.idle.turn"]:
        sys.exit("a request the latch makes could be dropped by the turn's gate")
    if len({r["simon.points.gate"], r["simon.points.gate.other"], r["simon.menu.gate"], r["simon.menu.gate.other"]}) != 1:
        sys.exit("the points are not asked against one gate wherever they are asked")
    if 1 << r["simon.players.shift"] != PLAYERS or r["simon.pass.shift"] != r["simon.players.shift"] \
            or r["simon.points.last"] + 1 != PLAYERS:
        sys.exit("the turn and the point do not go round two players, or the points are not two words")
    if r["simon.next.worlds"] != r["run.worlds"] or r["simon.next.levels"] != r["death.levels"] \
            or r["simon.menu.over"] >= 0 or r["simon.wait"] >= r["start.wait"]:
        sys.exit("the rooms' round, the worlds' count, the game's end or the branch's wait is not as read elsewhere")
    if any(r["gp"] + off != addr for addr, off in SIMON_AT.values()):
        sys.exit("a word of the Simon rooms' does not lie where its offset from gp puts it")
    return {"latch": r["simon.latch"], "idle": [r["simon.idle.latch"], r["simon.idle.turn"]], "bits": bits,
            "store": r["simon.store.last"] + 1, "empty": r["simon.empty"], "first": r["simon.first"],
            "verdict": {"done": r["simon.verdict.done"], "wrong": r["simon.verdict.wrong"]}, "grow": r["simon.grow"],
            "points": r["simon.points.gate"] - 1, "players": 1 << r["simon.players.shift"],
            "starter": r["simon.menu.start"], "over": r["simon.menu.over"]}


def effect_init(code, span=EFFECT_INIT):
    """What startup's straight run from the first address to the second
    stores through gp, by address: a lui or an addiu sets a register, any
    other write unsets it, and a word or a byte stored from one that is set
    is kept with which it was."""
    regs, stored = {"zero": 0}, {}
    for pc in range(*span, 4):
        text = code.text(pc)
        m = re.match(r"lui \$(\w+), (0x[0-9a-f]+)$", text)
        if m:
            regs[m.group(1)] = 0x80000000 | (int(m.group(2), 0) << 16)
            continue
        m = re.match(r"addiu \$(\w+), \$(\w+), (-?\d+)$", text)
        if m:
            base = regs.get(m.group(2))
            regs[m.group(1)] = None if base is None else (base + int(m.group(3))) & 0xFFFFFFFF
            continue
        m = re.match(r"(sw|sb) \$(\w+), (-?\d+)\(\$gp\)$", text)
        if m:
            if regs.get(m.group(2)) is None:
                sys.exit(f"0x{pc:08x} stores a register the run has not set")
            stored[GP + int(m.group(3))] = (m.group(1), regs[m.group(2)])
            continue
        m = re.match(r"(\w+) \$(\w+)", text)
        if m and m.group(1) not in READS_FIRST:
            regs[m.group(2)] = None
    return stored


def effect_setup(code, slots, sprites):
    """The pointers to the effect tables, nothing where a kind has none, and
    the sprites' colours, three bytes each, as startup stores them."""
    if GP + EFFECT_POINTERS[1] != EFFECT_POINTERS[0] or GP + EFFECT_COLOURS[1] != EFFECT_COLOURS[0]:
        sys.exit("the effect tables' pointers or the sprites' colours do not lie where their offsets from gp put them")
    stored = effect_init(code)
    pointers = []
    for i in range(slots):
        op, value = stored.get(EFFECT_POINTERS[0] + 4 * i, ("sw", 0))
        if op != "sw":
            sys.exit(f"slot {i} of the effect tables' pointers is not stored as a word")
        pointers.append(value)
    colours = []
    for i in range(sprites):
        channels = [stored.get(EFFECT_COLOURS[0] + 3 * i + c) for c in range(3)]
        if any(ch is None or ch[0] != "sb" for ch in channels):
            sys.exit(f"sprite {i}'s colour is not three bytes startup stores")
        colours.append([ch[1] for ch in channels])
    return pointers, colours


def effect_tables(code, pointers):
    """Each table the pointers name: its count of particles, its frames and a
    row a particle a frame of four halfwords, a sprite, an angle, a size and
    a brightness."""
    out = {}
    for at in sorted(set(pointers) - {0}):
        if not code.holds(at, 4):
            sys.exit(f"the effect table at 0x{at:08x} lies outside the executable")
        count, frames = struct.unpack_from("<hh", code.blob, at - EXE_BASE)
        if count <= 0 or frames <= 0 or not code.holds(at, 4 + 8 * count * frames):
            sys.exit(f"the effect table at 0x{at:08x} holds {count} particles over {frames} frames")
        rows = [[list(struct.unpack_from("<hhhH", code.blob, at + 4 + 8 * (f * count + p) - EXE_BASE))
                 for p in range(count)] for f in range(frames)]
        out[at] = {"count": count, "frames": frames, "rows": rows}
    return out


def effect_sine(code):
    """Where the sine table lies, and what it gives at a quarter turn."""
    hi, hp, lo, lp = EFFECT_SINE
    table = (0x80000000 | (code.immediate(hi, hp) << 16)) + code.immediate(lo, lp)
    return table, int.from_bytes(code.read(table + 2 * (TURN // 4), 2), "little", signed=True)


def effect_places(code):
    """The HUD points the key-less effects start at, three halfwords each, as data."""
    def point(pair):
        at = code.address(*pair)
        return list(struct.unpack_from("<hhh", code.blob, at - EXE_BASE))
    return {"clock": point(EFFECT_HUD["clock"]), "teleport": point(EFFECT_HUD["teleport"]),
            "fruit": [point(pair) for pair in EFFECT_HUD["fruit"]]}


def effects(r):
    """The effects: the list's size, a row's particles, the depth under which
    a particle is skipped, the sprites' light colours as the faces show
    them and the brightness a sprite's texture is its own at, a size's
    unit on the HUD and in the world, what a colour byte times the
    brightness is divided by into the light, the tables by the first kind
    that uses each and every kind's table, what each pickup starts in the
    world and on the HUD, the teleporter's HUD kind, the HUD's points and
    the flash, each held against the others: twelve pointers with the last
    empty and the kinds the pickups start among them, the three pills one
    kind and the five fruit and type 27's case one, the HUD's kinds apart
    from the world's, two particles a row, every sprite among the seven
    and every brightness a byte, the dice's -1 the one angle below nothing
    and drawn in the world only where nothing shows, a size's shifts one
    for the cosine and the sine past the sine's one, the entry two buffers
    of two quads and six words, a row eight bytes of four halfwords, the
    light's bytes shifted alike, one table for the run, the clear and the
    send, sent from its last word, every HUD point's third word -1, and
    the flash marked, tested and given with the one the loop waits two
    blanks on, a flat quad over the screen in the blend that adds, the
    level's load starting the last mode's on a level with no key."""
    pointers, colours, tables = r["effect.pointers"], r["effect.colours"], r["effect.tables"]
    if len(pointers) != r["effect.slots.last"] + 1 or pointers[-1] != 0 or 0 in pointers[:-1]:
        sys.exit("the effect tables' pointers are not eleven kinds' of twelve")
    first = {kind: pointers.index(at) for kind, at in enumerate(pointers[:-1])}
    world = {t: r[f"effect.kind.{t}"] for t in EFFECT_WORLD}
    hud = {31: EFFECT_HUD_KIND, 35: r["effect.kind.35.hud"], 5: r["effect.kind.5.hud"],
           **dict.fromkeys(range(43, 48), EFFECT_HUD_KIND)}
    if len({world[t] for t in (32, 33, 34)}) != 1 or len({world[t] for t in (27, 43, 44, 45, 46, 47)}) != 1 \
            or world[36] != world[42] or any(k not in first for k in list(world.values()) + list(hud.values())):
        sys.exit("the kinds the pickups start are not shared as read, or one has no table")
    if set(world.values()) & set(hud.values()):
        sys.exit("a kind is started both in the world and on the HUD")
    for at, t in tables.items():
        on_hud = any(k in hud.values() for k, p in enumerate(pointers) if p == at)
        if t["count"] != PARTICLES or len(t["rows"]) != t["frames"] or any(len(row) != PARTICLES for row in t["rows"]):
            sys.exit(f"the effect table at 0x{at:08x} does not hold {PARTICLES} particles a row over its frames")
        for f, row in enumerate(t["rows"]):
            for sprite, angle, size, bright in row:
                if not 0 <= sprite < r["effect.sprites"] or not 0 <= bright <= 255 or angle < -1:
                    sys.exit(f"row {f} of the effect table at 0x{at:08x} holds {(sprite, angle, size, bright)}")
                if angle == -1 and not on_hud and size and bright:
                    sys.exit(f"row {f} of the effect table at 0x{at:08x} draws from the dice in the world with something to show")
    stored = {r[f"effect.colour.{c}"] for c in "abcdef"} | {0}
    if len(colours) != r["effect.sprites"] or {ch for c in colours for ch in c} != stored or max(stored) >= r["effect.full"]:
        sys.exit("the sprites' colours are not the bytes startup stores, under the texture's own")
    shown = [[third, second, first_byte] for first_byte, second, third in colours]
    if r["effect.player"] != r["effect.most"] * r["effect.entry"] or r["effect.buffer"] != PARTICLES * r["effect.quad"] \
            or r["effect.prims"] != BUFFERS * r["effect.buffer"] or r["effect.entry"] != r["effect.prims"] + 4 * ENTRY_WORDS \
            or r["effect.particle"] != r["effect.quad"]:
        sys.exit("an effect's entry is not the quads of two buffers of two particles and six words")
    if 1 << r["effect.row.quad"] != r["effect.header"] or r["effect.header"] << r["effect.row.double"] != r["effect.row.step"] \
            or r["effect.header"] != 2 * r["effect.angle.step"] or r["effect.third"] != 2 * r["effect.angle.step"]:
        sys.exit("a table's header is not two halfwords, or a row not eight bytes, or an angle not a halfword")
    if r["effect.players"] != ONE_PLAYER - 1 or r["effect.gone"] != -1 or r["effect.step"] != 1:
        sys.exit("the world's gate is not one player, or the counts do not step by one")
    if r["effect.dice"] != TURN or r["effect.dice.world"] != TURN or r["effect.sine.one"] != ONE:
        sys.exit("the dice are not drawn for a turn, or the sine table's one is not 4096")
    one = r["effect.sine.one"].bit_length() - 1
    if r["effect.hud.shift"] != r["effect.hud.shift.sine"] or r["effect.world.shift"] != r["effect.world.shift.sine"] \
            or r["effect.whole.shift"] != r["effect.world.shift"] or r["effect.whole.shift.sine"] != r["effect.world.shift"] \
            or r["effect.whole.one"] != 1 or r["effect.whole.one.sine"] != 1 \
            or min(r["effect.hud.shift"], r["effect.world.shift"]) < one:
        sys.exit("a size's shifts are not one for the cosine and the sine, past the sine's one")
    if len({r["effect.light.shift"], r["effect.light.shift.g"], r["effect.light.shift.b"]}) != 1:
        sys.exit("the light's three bytes are not shifted alike")
    if len(set(r["effect.table.at"])) != 1 or r["effect.table.mul"] << r["effect.table.shift"] != 4 * r["effect.table.words"] \
            or r["effect.table.send"] != 4 * (r["effect.table.words"] - 1):
        sys.exit("the frame's table is not one address of so many words, sent from its last")
    at = r["effect.hud.at"]
    points = [at["clock"], at["teleport"], *at["fruit"]]
    if len(at["fruit"]) != 5 or r["effect.hud.z"] >= 0 or any(p[2] != r["effect.hud.z"] for p in points):
        sys.exit("a HUD point's third word is not the one below nothing")
    f = {k: r[f"teleport.flash.{k}"] for k in ("on", "run.on", "word", "modes", "mode.last", "level.mode", "level", "from",
                                                 "from.1", "from.last", "level.from", "step", "step.1", "step.last", "blend",
                                                 "semi", "wide", "high", "len", "quad")}
    if len({f["on"], f["run.on"], f["word"], r["simon.loop.mode"]}) != 1:
        sys.exit("the flash is not marked, tested and given with the one the loop waits two blanks on")
    if len({f["modes"], f["mode.last"], f["level.mode"]}) != 1 or f["level.from"] != f["from.last"] or f["level"] != r["mode.bonus"]:
        sys.exit("the level's load does not start the flash in the last mode on a level with no key")
    if any(f[k] >= 0 for k in ("step", "step.1", "step.last")) or min(f["from"], f["from.1"], f["from.last"]) <= 0:
        sys.exit("a flash's strength does not come down from above nothing")
    if f["blend"] != ADD or f["semi"] != 1 or f["wide"] != 1 or f["high"] != 1 or f["quad"] != FLAT or f["len"] != FLAT_WORDS:
        sys.exit("the flash is not a flat quad over the screen in the blend that adds")
    return {"most": r["effect.most"], "particles": PARTICLES, "near": r["effect.near"],
            "sprites": {"count": r["effect.sprites"], "colours": shown, "full": r["effect.full"]},
            "size": {"hud": 1 << (r["effect.hud.shift"] - one), "world": 1 << (r["effect.world.shift"] - one)},
            "light": {"over": 1 << r["effect.light.shift"]},
            "tables": {str(k): {"frames": tables[pointers[k]]["frames"], "rows": tables[pointers[k]]["rows"]}
                       for k in sorted(set(first.values()))},
            "kinds": {str(k): str(v) for k, v in first.items()},
            "starts": {str(t): ({"world": world[t], "hud": hud[t]} if t in hud else {"world": world[t]})
                       for t in sorted(world) if t in TAKE_CASES and t != 27},
            "teleport": {"hud": hud[5]},
            "hud": {"clock": at["clock"][:2], "teleport": at["teleport"][:2], "fruit": [p[:2] for p in at["fruit"]],
                    "key": [r["effect.hud.key.right"], r["effect.hud.key.down"]]},
            "flash": {"blend": f["blend"],
                      "teleport": {"from": f["from"], "step": -f["step"], "blanks": r["pill.lethargy.blanks"]},
                      "bonus": {"from": f["level.from"], "step": -f["step.last"]}}}



def play(r):
    """The level's own words: the start's two counts, the clock's ticks, the
    outcomes a level ends with, the frames each ending waits and the word
    the end screen shows for it and for the game's end, a bonus level's marking, the deaths'
    penalty, the ending's view, the fly-in, the screen's words as the
    executable loads them, the slots a run goes on to and the Simon rooms'
    moves, each held against the others: one code and one countdown for a cause wherever it is read
    twice, the codes distinct, the spikes' ending the invincibility word's
    own rest, every index the end screen picks lettered, the gates one
    past their values, and the level's mode word one word for the loader
    that writes it and the ending's view that reads it."""
    if r["exit.type"] != 7 or r["exit.hidden.type"] != 26:
        sys.exit("the exits are tested as other types than the exit's and the hidden exit's")
    if r["clock.mode"] != 1 or r["clock.face"] != 8:
        sys.exit("the clock stands in another mode than the Simon rooms' or on another type than the clock face")
    if r["mark.under"] != BLOCK // 2 + r["ball.rest"]:
        sys.exit(f"a bonus level marks the block {r['mark.under']} under the ball's centre, not the one it stands on")
    if r["mark.skips"] != INVISIBLE:
        sys.exit(f"a bonus level skips blocks of kind {r['mark.skips']}, not the invisible ones")
    for keys in (("end.exit", "end.exit.landing", "simon.done"), ("end.bonus", "end.bonus.landing"),
                 ("end.hidden", "end.hidden.landing"), ("end.acid", "end.acid.wait"), ("end.fire", "end.fire.swell"),
                 ("end.captivator", "end.captivator.still", "end.star"), ("wait.exit", "wait.hidden"),
                 ("wait.simon", "wait.simon.done"), ("wait.spikes", "wait.spikes.landing", "wait.captivator", "wait.star"),
                 ("acid.gain", "acid.gain.wait"), ("death.each", "death.each.final"),
                 ("words.won1", "words.trial.won1"), ("words.won2", "words.trial.won2"),
                 ("words.equal", "words.trial.equal")):
        if len({r[k] for k in keys}) != 1:
            sys.exit(f"{', '.join(keys)} are not one value")
    ending = {name: r[f"end.{name}"] for name in ENDINGS}
    if sorted(ending.values()) != [v for v in range(-8, 4) if v] or r["end.spikes"] != UNHARMED:
        sys.exit(f"the endings are {ending}, not one code each from -8 to 3 with the spikes' the invincibility word's rest")
    if r["simon.wrong"] != r["simon.done"] + 1:
        sys.exit("the Simon rooms' verdicts are not one and two")
    if r["death.most.gate"] != r["death.most"] + 1 or r["death.levels"] != LEVELS:
        sys.exit("a death's penalty is not gated at its most, or does not count a world's levels")
    if r["gp"] + LEVEL_MODE[1] != r["mode.word"] or r["mode.word"] != LEVEL_MODE[0] or r["mode.at"] != LEVEL_MODE[1]:
        sys.exit("the level's mode word the loader writes is not the one the ending's view reads")
    if r["game.mode.word"] != GAME_MODE[0] or GP + GAME_MODE[1] != GAME_MODE[0] or r["mode.simon"] != r["clock.mode"]:
        sys.exit("the mode routine does not put the level's word back to 0 in the mode the clock stands in")
    if sorted((0, r["mode.bonus"], r["mode.hidden"])) != [0, 1, 2] or r["mode.hidden.flag"] != 1:
        sys.exit("the level's modes are not 0, 1 and 2, or the hidden flag is not a type of 1")
    if r["mode.key"] != KEY or r["mode.kinds"] != BLOCK_KINDS or r["mode.slots"] != SLOTS \
            or r["mode.settings"] != UNPLACED_KIND:
        sys.exit("the keys are not counted as the key's type in every slot of the blocks, "
                 "or the settings record is not the kind the lattice never names")
    if r["end.view.mode.bonus"] != r["mode.bonus"] or r["end.view.mode.bonus.eye"] != r["mode.bonus"]:
        sys.exit("the ending's quicker swing is not keyed on the mode a level with no key plays in")
    bits = [r[f"fruit.bit.{t}"] for t in range(43, 48)]
    if sorted(bits) != [1 << i for i in range(len(bits))] or sum(bits) != r["next.fruit"] \
            or len({r["next.fruit"], r["next.fruit.mask"], r["next.fruit.back"], r["next.fruit.back.mask"],
                    r["fruit.bit.all"]}) != 1:
        sys.exit("the five fruit do not set one bit each of the mask the next-level routine asks for")
    if len({r["next.slots"], r["next.slots.bonus"], r["next.levels"], r["death.levels"], r["next.bonus.first"],
            r["next.bonus.0"], r["next.start.bonus"]}) != 1:
        sys.exit("the slot after the last ordinary level is not the first bonus slot and the levels a world")
    if r["next.round"] != r["next.round.times"] or r["next.third"] * r["next.round"] != r["next.slots"] \
            or [r[f"next.bonus.{i}"] for i in range(3)] != [r["next.bonus.first"] + i for i in range(r["next.round"])] \
            or r["next.back.gate.0"] != r["next.third"] + 1 or r["next.back.gate.1"] != 2 * r["next.third"] + 1:
        sys.exit("the bonus slots do not come round in thirds of the world's levels")
    if r["next.hidden"] != r["next.bonus.first"] + r["next.round"] or r["next.chain.end"] != r["next.hidden"] \
            or r["next.hidden.out"] != r["end.hidden"]:
        sys.exit("the hidden slot does not follow the bonus slots, or is not the hidden exit's")
    if r["next.one"] != 1 or r["next.final"] != r["run.worlds"] * r["next.slots"] + 1 \
            or r["next.levels.final"] != r["death.finals"] or r["death.finals"] != FINALS:
        sys.exit("the finals are not numbered on from the worlds' levels, or are not two a world")
    if r["next.mode.load"] != 0 or r["next.mode.writes"] or tuple(r["next.mode.clears"]) != NEXT_MODE_CLEARS:
        sys.exit(f"the word at 0x{NEXT_MODE:08x} does not load as 0, or something writes it")
    wait = {name: r[f"wait.{name}"] for name in ENDINGS if f"wait.{name}" in r}
    wait["bonus"] = r["wait.hidden"]
    picks = {name: -code * 2 if code < 0 else r["words.win"] for name, code in ending.items()}
    shown = (*picks.values(), r["words.over"], r["words.better"], r["words.slow"], r["words.qualified"],
             r["words.failed"], r["words.won1"], r["words.won2"], r["words.equal"])
    if any(index not in r["words"] for index in shown) or r["words.last"] != -PAIR:
        sys.exit("the end screen picks an entry that letters no word, or draws past another count than its pairs'")
    if r["words.final"] != picks["acid"] or r["words.copycat"] != r["clock.mode"] \
            or r["words.slow.gate"] != 20 * r["words.allowance"] + 1:
        sys.exit("the final's branch does not pick the acid's word, Copycat is not the clock's standing mode, "
                 "or the time trial's slow exit is not gated at twenty seconds")
    named = {name: r["words"][index] for name, index in picks.items()}
    for name in ("over", "won1", "won2", "equal"):
        named[name] = r["words"][r[f"words.{name}"]]
    return {"start": {"wait": r["start.wait"], "guard": r["start.guard"]},
            "clock": {"tick": r["clock.tick"], "second": r["time.tick"], "face": r["clock.face"],
                      "out": r["end.time"]},
            "ending": ending, "wait": wait, "words": named,
            "bonus": {"block": r["mark.points"], "skips": r["mark.skips"]},
            "points": {"each": r["death.each"], "most": r["death.most"], "levels": r["death.levels"],
                       "finals": r["death.finals"]},
            "next": {"bonus": [r[f"next.bonus.{i}"] for i in range(3)], "hidden": r["next.hidden"],
                     "slots": r["next.slots"], "third": r["next.third"], "fruit": r["next.fruit"],
                     "worlds": r["run.worlds"]},
            "simon": simon(r),
            "view": {"angles": [r["end.view.x"], r["end.view.y"], r["end.view.z"]], "swing": r["end.view.swing"],
                     "off": r["end.view.off"], "reach": r["end.view.reach"],
                     "bonus": {"swing": r["end.view.swing.bonus"], "off": r["end.view.off.bonus"],
                               "reach": r["end.view.reach.bonus"]},
                     "hidden": {"off": r["end.view.off.hidden"]}},
            "flight": flight(r),
            "screen": {"wide": r["screen.load.wide"], "high": r["screen.load.high"],
                       "distance": r["screen.load.distance"],
                       "scale": {"across": r["screen.load.across"], "down": r["screen.load.down"]}}}


def harms(r):
    """What each kind and type that can hurt the ball does to it, by kind and
    by type: fire's heat and acid's melt with their limits, the laser's cell
    and the heat it leaves, the moving spikes' deadly value and their own
    countdown, the captivators' reach as the squared distance each catches
    the ball within, the corkscrew's with how far off the face the point its
    bounce moves stands at a landing, and the dying ball's flash and tint."""
    if r["fire.kind"] != FIRE or r["acid.kind"] != ACID or r["laser.cell"] != LIT:
        sys.exit("fire, acid or the laser is not read from its own kind or the lit beam's cell")
    if r["laser.lay"] != r["laser.cell"]:
        sys.exit("the loader lays another word between a beam's ends than the one the laser's death tests")
    if r["fire.limit.gate"] != r["acid.top"] + 1 or r["acid.top.gate"] != r["acid.top"] + 1:
        sys.exit("the heat's limit and the melt's top are not one value, gated one past it")
    if {r["exit.type"], r["exit.hidden.type"], r["spikes12.type"], r["spikes11.type"], r["catch.type53"]} \
            != {EXIT, HIDDEN_EXIT, SPIKES, MOVING_SPIKES, WANDERER}:
        sys.exit("the exits, the spikes or the wandering ball are not read by their types")
    if r["tint.full"] != -TURN or r["dying.flash.full"] != TURN or r["fire.landed"] != 1:
        sys.exit("the ball's light is not full at a turn, or a landing is not marked by one")
    if r["corkscrew.type"] != CORKSCREW \
            or r["corkscrew.rise.y"] != r["corkscrew.rise"] or r["corkscrew.rise.z"] != r["corkscrew.rise"]:
        sys.exit("the corkscrew is not moved by its type, or its position does not rise alike on its three axes")
    catch = {"square": r["catch.square"]}
    return {
        "kinds": {
            FIRE: {"heat": {"burn": r["fire.burn"], "land": r["fire.land"], "limit": r["acid.top"],
                            "cool": -r["fire.cool"], "swell": r["fire.swell"],
                            "shake": {"base": r["heat.shake"], "over": r["heat.shake.over"], "big": r["heat.shake.big"]}}},
            ACID: {"melt": {"gain": r["acid.gain"], "top": r["acid.top"]}},
            8: {"harm": {"cell": r["laser.cell"], "heat": r["laser.heat"]}},
        },
        "types": {
            MOVING_SPIKES: {"harm": {"flag": r["spikes11.deadly"], "standing": r["wait.spikes.standing"]}},
            42: {"harm": {"form": BROWN}},
            50: {"catch": catch}, 51: {"catch": catch}, 52: {"catch": catch},
            CORKSCREW: {"catch": {**catch, "stand": r["captivator.standoff"] - BLOCK // 2}},
            WANDERER: {"catch": {"square": r["catch.near.gate"] - 1}},
            int(BALL): {"dying": {"flash": r["dying.flash"]}, "tint": {"own": r["tint.own"], "other": r["tint.other"]}},
        },
    }


def blocks(r):
    """What the blocks under the ball do to its roll, by kind: ice's chill of
    the heat and its cold, the crumbling block's size, its shrink and the
    edge rule that keeps a ball from going round it, and a platform's landing
    height, the block its position is biased by, the pad's rumble, the body
    landing's height and reach along the run and the end landing's slack,
    each held to the kind or the type it is read from and to the ball's
    rest; the face routine's numbering and the direction test's pairs are
    held to the record's slot order."""
    if r["ice.kind"] != ICE or r["arrow.type"] != ARROW or r["ride.kind"] != PLATFORM \
            or r["crumble.under"] != CRUMBLING_UNDER or r["crumble.code.input"] != CRUMBLING_UNDER:
        sys.exit("ice, the arrow, the crumbling block or the platform is not read from its own kind or type")
    over = r["cold.top.gate"] - 1
    if not 0 < r["cold.back"] < over or r["cold.gain"] <= 0 or r["cold.wane"] >= 0:
        sys.exit("the cold does not grow on ice, wane off it and go back below the mark it passes")
    if r["crumble.size"] != BLOCK or r["crumble.shrink"] >= 0:
        sys.exit("a crumbling block's size is not a block, or does not shrink")
    if (r["crumble.whole"], r["crumble.broken"], r["crumble.breaking"]) != (1, 2, 3) \
            or r["crumble.broken.seen"] != r["crumble.broken"]:
        sys.exit("a crumbling block's type does not go whole, broken, breaking")
    if not r["move.middle"] < r["crumble.edge.hold"] < r["crumble.edge.back"] < BLOCK:
        sys.exit("the crumbling block's edge rule does not hold the ball past the middle and set it back short of the edge")
    if len({r["ride.bias"], -r["ride.bias.back"], -r["ride.bias.travel"], BLOCK}) != 1:
        sys.exit("a platform's position is not biased by a block wherever it is taken")
    if r["ride.body.off"] != r["ball.rest"] + 1 or r["ride.beam"] != LIT:
        sys.exit("a platform lands the ball otherwise than at its rest, or reads the level's lattice for more than a lit beam")
    faces = {"+x": r["ride.face.x"], "-x": r["ride.face.x.back"], "+y": r["ride.face.y"], "-y": r["ride.face.y.back"],
             "+z": r["ride.face.z"], "-z": 0}
    if faces != {f: FACE.index(f) for f in faces}:
        sys.exit("the face routine does not number the ball's normal as the record's slots are numbered")
    pairs = {"x": {r["ride.along.x"], r["ride.along.x.back"]},
             "y": set(range(-r["ride.along.y.from"], -r["ride.along.y.from"] + r["ride.along.y.span"])),
             "z": {0, r["ride.along.z.back"]}}
    if pairs != {a: {faces["+" + a], faces["-" + a]} for a in pairs}:
        sys.exit("the direction test does not pair the axis words by axis")
    if {r["ride.along.x"], r["ride.along.face.x.back"]} != pairs["x"] \
            or (r["ride.along.face.y.from"], r["ride.along.face.y.span"]) != (r["ride.along.y.from"], r["ride.along.y.span"]) \
            or r["ride.along.face.z.back"] != r["ride.along.z.back"] or r["ride.along.yes"] != 1:
        sys.exit("the direction test does not pair the faces as it pairs the axis words")
    if (r["ride.body.axis.x"], r["ride.body.axis.y"], r["ride.body.axis.z"]) != (faces["+x"], faces["+y"], faces["+z"]):
        sys.exit("the body test does not dispatch on the axis word by the positive way's number")
    if r["ride.body.count.less"] != -1 or r["ride.body.block"] != BLOCK or r["ride.body.ends"] != BLOCK // 2 \
            or r["ride.body.ends.back"] != -r["ride.body.ends"]:
        sys.exit("the body test does not reach from the first block's centre to the last's and half a block past each")
    if r["ride.end.kind"] != PLATFORM or r["ride.end.kind.under"] != PLATFORM or r["ride.end.bias"] != BLOCK \
            or r["ride.end.block"] != BLOCK:
        sys.exit("the end landing is not read from a platform's kind, or lays the body otherwise than a block at a time")
    if r["ride.end.tolerance"] != r["ball.rest"] or r["ride.end.low"] != BLOCK // 2 - r["ball.rest"] \
            or r["ride.end.high"] != BLOCK // 2 + r["ball.rest"]:
        sys.exit("the end landing's slack, or where it lays the centre, is not the ball's rest height off the end face")
    return {
        ICE: {"chill": -r["heat.chill"],
              "cold": {"gain": r["cold.gain"], "over": over, "back": r["cold.back"], "wane": -r["cold.wane"]}},
        CRUMBLING: {"size": r["crumble.size"], "shrink": -r["crumble.shrink"],
                    "edge": {"hold": r["crumble.edge.hold"], "back": r["crumble.edge.back"], "push": r["crumble.edge.push"]}},
        PLATFORM: {"ride": {"bias": r["ride.bias"], "rumble": r["ride.rumble"],
                            "body": {"off": r["ball.rest"], "ends": r["ride.body.ends"]},
                            "end": {"tolerance": r["ride.end.tolerance"]}}},
    }


def standing(r):
    """The word the ball keeps for what it stands on, by the kind of the block
    under the cell its centre lies in: fire, ice and acid their own kind, the
    invisible, platform, crumbling and vanishing kinds one number each past
    the types, a lattice style the kind it is, and a bare plain block or no
    block the lattice's empty word, each held to the kind or the style its
    case tests."""
    if r["standing.centre"] != BLOCK // 2 or 1 << r["standing.shift"] != BLOCK:
        sys.exit("the cell the ball's centre lies in is not the nearest block's")
    if r["standing.first"] != FIRST_RECORD:
        sys.exit(f"the block under the ball carries a record from {r['standing.first']}, not from the first record")
    words = {kind: kind for kind in (FIRE, ICE, ACID)}
    words.update({kind: r[f"standing.word.{kind}"] for kind in (INVISIBLE, PLATFORM, CRUMBLING, VANISHING)})
    for kind in words:
        if r[f"standing.kind.{kind}"] != kind:
            sys.exit(f"kind {kind} under the ball is tested as {r[f'standing.kind.{kind}']}")
    for style in range(1, STYLES):
        if r[f"standing.style.{style}"] != style:
            sys.exit(f"lattice style {style} under the ball is tested as {r[f'standing.style.{style}']}")
    if r["standing.style.word.3"] != words[INVISIBLE]:
        sys.exit("the invisible block reads otherwise as a lattice style than as a record")
    if r["standing.nothing"] != OFF or r["standing.none"] != OFF:
        sys.exit("a bare plain block or no block under the ball does not read as the lattice's empty word")
    if words[CRUMBLING] != r["crumble.under"]:
        sys.exit("the crumbling block reads otherwise under the ball than the hazards test it")
    past = {word - kind for kind, word in words.items() if word != kind}
    if len(past) != 1 or next(iter(past)) <= max(SPUN_AT):
        sys.exit(f"the kinds that read as a number of their own are not one step past the types: {words}")
    return words


def table(r, platform_speed):
    """The motion table by type and by kind of block, in the game's units.

    A cycle is a frame program per phase, and the moving spikes say beside it
    on which of its frames they kill. The platform's speed is the one the
    level data holds, scaled as the loader scales it. A type the loader lifts
    into an entry of its own says how far off its face the game draws the
    model's origin, and a type the game draws a shadow under says which
    sprite, how far off its face it lies and how strong it is, and the type
    whose models glint says how. A pickup says what it takes for the ball
    to take it and what that scores, a device under the ball what it does
    there, a kind or a type that can hurt the ball what it does, a kind the
    ball slides on, breaks or rides what it does to the roll, each kind the
    word the ball keeps for standing on it, and the level's own words, the clock's, the endings', the end screen's, a
    bonus level's, an ending's, a run's, the Simon rooms', the fly-in's and the screen's, sit under `play`. The devices' light and each device's
    colours, by world and then by circuit where it has one, sit apart from
    the types, whose entries are what moves, as do the effects a pickup or
    a teleport starts, their tables, their sprites' colours and the flash,
    under `effects`.
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
        32: dict(pill), 33: dict(pill), 34: dict(pill),
        35: {"turn": r["hourglass.turn"],
             "swing": {"rate": r["hourglass.swing"], "reach": TURN // 2, "lean": r["hourglass.lean"]}},
        36: {"turn": r["gem.turn"]},
        37: {"turn": r["coin.turn"], "bob": bob},
        38: {"turn": r["coin.turn"], "bob": bob},
        42: {"form": {"rate": r["star42.form"], "past": r["star42.form.past"]},
             "orbit": {"radius": r["star42.orbit.radius"],
                       "rate": [r["star42.orbit.brown"], r["star42.orbit.green"]]}},
        11: {"cycle": [[f for f, _ in spike_cycle(r, p)] for p in range(PHASES)],
             "deadly": [[d for _, d in spike_cycle(r, p)] for p in range(PHASES)]},
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
                        "rise": r["corkscrew.rise"], "spin": -r["corkscrew.spin"]},
             "phases": [r["corkscrew.phase0"], r["corkscrew.phase1"], r["corkscrew.phase2"], 0]},
    }
    for t in range(43, 48):
        types[t] = dict(fruit)
    types[30].update(roll(r))
    types[30]["jump"] = jump(r)
    types[30]["wrap"]["body"] = body(r)
    taken, lasting = take(r)
    for t, entry in taken.items():
        types[t]["take"] = entry
    for t, entry in lasting.items():
        types[t]["lasts"] = entry
    for t, entry in exits(r).items():
        types[t].update(entry)
    for t, entry in devices(r).items():
        types.setdefault(t, {}).update(entry)
    for t in (50, 51, 52, 53):
        types[t]["entry"] = {"stand": stand}
        types[t]["shadow"] = {"sprite": 0, "off": stand + r[f"shadow.drop.{t}"],
                              "strength": r[f"shadow.strength.{t}"]}
    types[51]["shadow"].update({"sprite": r["shadow.sprite.51"], "turns": True})
    types[56]["entry"] = {"stand": stand - r["corkscrew.drop"]}
    types[56]["shadow"] = {"sprite": 0, "off": stand - r["shadow.corkscrew.drop"],
                           "strength": r["shadow.strength.56"], "fade": r["shadow.corkscrew.fade"]}
    # the ball's light is the camera's rows turned round, in its axes right, down
    # and into the screen
    types[30]["light"] = {"view": [-1, -(1 << r["ball.light.down"]), -(1 << r["ball.light.into"])],
                          "background": r["ball.light.background"], "colour": r["ball.light.colour"],
                          "base": r["ball.light.base"]}
    # the ball's lies as far toward the block from its middle as the middle
    # is off the face, so on the face
    types[30]["shadow"] = {"sprite": 0, "off": 0, "strength": 1 << r["shadow.ball.shift"],
                           "top": r["shadow.ball.top"], "over": r["shadow.ball.over"],
                           "squash": True}
    # a spin's angles are about the game's model axes, and `before` is a turn
    # the model takes ahead of its spin
    for t, order in r["spin.order"].items():
        types[t]["order"] = order
    for t in WORLD_AXES:
        types[t]["axes"] = "world"
    for t in QUARTERED:
        types[t]["before"] = [0, 0, r["spin.quarter"]]
    types[30]["before"] = [TURN // 2, 0, 0]
    if r["glint.model"] not in types:
        sys.exit(f"the glints are of model {r['glint.model']}, which no type in the table is")
    types[r["glint.model"]]["glint"] = glint(r)
    for t, entry in types.items():
        if "shadow" in entry and entry["shadow"]["sprite"] >= r["shadow.sprites"]:
            sys.exit(f"type {t}'s shadow is sprite {entry['shadow']['sprite']} of {r['shadow.sprites']}")
    kinds = {
        5: {"speed": platform_speed * r["platform.scale"] // HZ, "dwell": r["platform.dwell"]},
        7: {"cycle": [[s for s, _ in vanish_cycle(r, p)] for p in range(PHASES)],
            "level": [[v for _, v in vanish_cycle(r, p)] for p in range(PHASES)]},
        3: {"light": light(r)},
        8: laser(r),
        CRUMBLING: {"points": r["crumble.points"]},
    }
    harm = harms(r)
    for k, entry in harm["kinds"].items():
        kinds.setdefault(k, {}).update(entry)
    for t, entry in harm["types"].items():
        types[t].update(entry)
    for k, entry in blocks(r).items():
        kinds.setdefault(k, {}).update(entry)
    for k, word in standing(r).items():
        kinds.setdefault(k, {})["standing"] = word
    colours = {str(t): r["glow.colours"][t] for t in sorted(r["glow.colours"])}
    return {"hz": HZ, "turn": TURN, "standoff": r["captivator.standoff"],
            "dice": {"seed": r["dice.seed"], "times": r["dice.times"], "plus": r["dice.plus"]},
            "shadow": {"half": r["shadow.half"]},
            "glow": {**r["glow"], "colours": colours},
            "play": play(r),
            "effects": effects(r),
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
    for group, key, what, start, end, base, span, calls in SCANS:
        rows.append((group, what, start, code.resolved(start, end, base, span, calls)))
    rows.append(("on a block", "boost button: sinks while the ball is within, units",
                 BUTTON_REACH[0], readings(code)["button.reach"]))
    rows.append(("the fly-in", "the curve's second point lies this share of eight blocks along the side on",
                 FLIGHT_THIRD[0], readings(code)["flight.third"]))
    run = readings(code)
    rows.append(("the level's clock and its end", "the bonus slots come round every this many, by the reciprocal",
                 NEXT_ROUND[0], run["next.round"]))
    rows.append(("the level's clock and its end", "the word the next-level routine's other starts hang on, as the "
                 "executable loads it", NEXT_MODE, run["next.mode.load"]))
    rows.append(("the level's clock and its end", "stores to that word through gp or $at, every one of nothing",
                 run["next.mode.clears"][0], len(run["next.mode.clears"])))
    rows.append(("the Simon rooms", f"the sequence a move is held to lies at 0x{run['simon.store']:08x}, this many "
                 "halfwords by the reset", SIMON_STORE[0], run["simon.store.last"] + 1))
    rows.append(("the Simon rooms", "the reset fills it from the halfword this many bytes past its first",
                 SIMON_FILL[0], run["simon.fill.from"] - run["simon.store"]))
    rows.append(("dice", "a draw multiplies the state by this", DICE_TIMES[0],
                 readings(code)["dice.times"]))
    rows.append(("gem's glints", "a draw multiplies the generator's state by this", GLINT_TIMES[0],
                 readings(code)["glint.times"]))
    rows.append(("gem's glints", "the generator's state as the executable loads it", code.address(*GLINT_STATE),
                 readings(code)["glint.seed"]))
    for name, what in (("wide", "the screen's width as the executable loads it"), ("high", "and its height"),
                       ("distance", "the projection's screen distance"), ("across", "the scale across, of 4096"),
                       ("down", "and the scale down")):
        rows.append(("the view in play", what, SCREEN_WORDS[name], readings(code)[f"screen.load.{name}"]))
    for group, key, what, hi, hp, lo, lp, sa, sp in DIVISORS:
        rows.append((group, what, hi, code.divisor(hi, hp, lo, lp, sa, sp)))
    for group, key, what, hi, hp, lo, lp in GREYS:
        rows.append((group, what, hi, code.grey(hi, hp, lo, lp)))
    glow = readings(code)
    counter = glow["gp"] + glow["glow.counter.at"]
    rows.append(("what harms the ball", "the glow's counter as the executable loads it", counter,
                 glow["glow.counter.load"]))
    rows.append(("what harms the ball",
                 f"the start clears this many bytes from 0x{glow['glow.clear'][0]:08x}, the counter at 0x{counter:08x} among them",
                 CLEARED[0][0], glow["glow.clear"][1] - glow["glow.clear"][0]))
    modes = readings(code)
    rows.append(("the level's mode", f"the level's mode word the ending's view reads, 0x{modes['mode.word']:08x}, "
                 "lies this far past gp", LEVEL_MODE_READ[0], modes["mode.word"] - modes["gp"]))
    rows.append(("the level's mode", f"and the game's, which the mode routine reads, 0x{modes['game.mode.word']:08x}, "
                 "this far", GAME_MODE_READ[0], modes["game.mode.word"] - modes["gp"]))
    rows.append(("shadows", "the square reaches this far either way of its middle, units",
                 code.address(*SHADOW_SQUARE), readings(code)["shadow.half"]))
    rows.append(("invisible block", "rows of the square root it measures a corner by",
                 code.address(*LIGHT_ROOT), len(readings(code)["light.root"])))
    levels = readings(code)["laser.levels"]
    rows.append(("laser", f"steps in the beam's table, levels {min(levels)} to {max(levels)}",
                 code.address(*LASER_LEVELS[0]), len(levels)))
    sprites = 0x80000000 | code.word(code.address(*WORDS_TABLE))
    for index, word in words(code).items():
        rows.append(("the level's clock and its end", f"the end screen's word at {index}, in two sprites",
                     sprites + 4 + 8 * index, word))
    fx = readings(code)
    for at, t in sorted(fx["effect.tables"].items()):
        kinds = [k for k, p in enumerate(fx["effect.pointers"]) if p == at]
        rows.append(("the effects", f"the table at 0x{at:08x}, kinds {', '.join(map(str, kinds))}, runs this many frames of "
                     f"{t['count']} particles", EFFECT_POINTERS[0] + 4 * kinds[0], t["frames"]))
    rows.append(("the effects", "the sine table gives this at a quarter turn", fx["effect.sine.at"], fx["effect.sine.one"]))
    for name in ("clock", "teleport"):
        rows.append(("the effects", f"the HUD point the {name}'s effect starts at, x, y and the third word",
                     code.address(*EFFECT_HUD[name]), ",".join(map(str, fx["effect.hud.at"][name]))))
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
