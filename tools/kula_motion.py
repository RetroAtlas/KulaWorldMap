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
import re
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kula_motion_blocks
import kula_motion_code
import kula_motion_harms
import kula_motion_jump
import kula_motion_light
import kula_motion_roll
import kula_motion_take
import kula_motion_things
from kula_disc import EXE, EXE_BASE, open_disc
from kula_level import BLOCK_KINDS, UNPLACED_KIND
from kula_motion_blocks import CRUMBLING, blocks, standing
from kula_motion_code import ADD, BLOCK, GP, GP_INIT, HZ, INVISIBLE, ONE, PHASES, READS_FIRST, TURN, Code, dispatch
from kula_motion_harms import CLEARED, harms
from kula_motion_jump import FLIGHT_THIRD, flight, jump
from kula_motion_light import (GLINT_RECORDS, GLINT_STATE, GLINT_TIMES, LIGHT_ROOT, SHADOW_SQUARE, glint, glow, light,
                               root_table, shadow_half, spike_cycle, vanish_cycle)
from kula_motion_roll import STATES, body, moves, roll
from kula_motion_take import (END_CASES, END_FACES, LOADER_CASES, LOADER_PLAIN, LOADER_TYPES, ONE_PLAYER, SCREEN_WORDS,
                              TAKE_CASES, TAKE_TAIL, TAKE_TYPES, UNHARMED, devices, exits, take)
from kula_motion_things import (BUTTON_REACH, DICE_TIMES, LASER_LEVELS, QUARTER, QUARTERED, WORLD_AXES, laser,
                                spin_orders)

# What has to be there for the numbers below to mean what the doc says.
CHECKS = [
    *kula_motion_code.CHECKS,
    *kula_motion_things.CHECKS,
    *kula_motion_light.CHECKS,
    *kula_motion_roll.CHECKS,
    *kula_motion_jump.CHECKS,
    *kula_motion_take.CHECKS,
    *kula_motion_harms.CHECKS,
    *kula_motion_blocks.CHECKS,
    # The level's mode word.
    (0x80027b3c, "sw $zero, 24316($at)", "the loader's mode routine clears the key count at 0x800a5efc"),
    (0x80027b5c, "lhu $v0, 0($a2)", "reads each record's kind"),
    (0x80027b88, "bne $v0, $t0, 0x80027ba8", "and counts the slots of the key's type"),
    (0x80027bd4, "bne $v0, $zero, 0x80027be8", "with none"),
    (0x80027bdc, "sw $v0, 9372($gp)", "the level's mode word is 1"),
    (0x80027be8, "sw $zero, 9372($gp)", "and otherwise 0"),
    (0x80027c54, "lh $v0, 0($v1)", "the kind of each record"),
    (0x80027c5c, "bne $v0, $t2, 0x80027ca0", "where it is the settings record's kind"),
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
    (0x80015c28, "addiu $s2, $s2, 1", "a word is two entries, the index's entry and the next"),
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
    (0x800424c8, "lw $v0, 13232($v0)", "the arcade's branch is the game's mode word's branch"),
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
    (0x80042534, "sw $v0, 1232($gp)", "makes it the hidden level's slot"),
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
    (0x80036ed4, "sh $v0, 1150($gp)", "Cross's latch at 0x800a33b6"),
    (0x80036ed8, "lh $v0, 1152($gp)", "with Up's latch"),
    (0x80036ee0, "beq $v0, $v1, 0x80036ef8", "set"),
    (0x80036ee8, "lh $v0, 1150($gp)", "or Cross's latch"),
    (0x80036ef0, "bne $v0, $v1, 0x80036f08", "set"),
    (0x80036ef8, "lhu $v0, 7512($gp)", "the latch's count at 0x800a4c90"),
    (0x80036f04, "sh $v0, 7512($gp)", "grows"),
    (0x80036f08, "lh $v0, 7512($gp)", "and once it is no longer under the latch's frames"),
    (0x80036f14, "bne $v0, $zero, 0x80036f38", ""),
    (0x80036f1c, "lh $v0, 1150($gp)", "Cross's latch"),
    (0x80036f20, "lh $v1, 1152($gp)", "and Up's latch"),
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
    (0x80049684, "bgez $v1, 0x8004967c", "down to the first player's word"),
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
    (0x8001582c, "lw $v0, 22252($v0)", "the second player's points"),
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
    (0x8004ad80, "lw $v0, 22252($v0)", "and the second player's points"),
    (0x8004ad8c, "bne $v0, $zero, 0x8004ae2c", ""),
    (0x8004adcc, "sw $v0, 24196($at)", "and past it puts the total at 0x800a5e84 below nothing"),
    (0x8004ade0, "sw $zero, 13228($at)", "with the turn cleared"),
    (0x8004adf0, "sw $zero, 13324($at)", "and the world word"),
    # The effects.
    (0x80011520, "addiu $v0, $v0, -4", "startup clears the twelve pointers a word at a time"),
    (0x80011524, "lui $v0, 0x000a", "and fills them from seven tables in the data"),
    (0x80011550, "lw $a1, 23216($a1)", "reads how many effect sprites the .GGI header counts"),
    (0x80011594, "sw $a0, 5088($gp)", "the last pointer filled, kind 10's pointer"),
    (0x800115f8, "sb $v1, 5124($gp)", "and the last byte of the sprites' colours"),
    (0x800115fc, "blez $a1, 0x800118a0", "lays no quad where the header counts none"),
    (0x80011618, "addiu $s0, $s0, -19372", "the quads lie at 0x800ab454"),
    (0x80011620, "jal 0x8005f928", "each set up as a textured quad"),
    (0x8001163c, "lw $v1, 23212($v1)", "from the sprite the header's first word names on"),
    (0x8001165c, "lbu $a1, -23063($at)", "whether the sprite's upload named a blend"),
    (0x80011660, "jal 0x8005f8c8", "makes the quad semi-transparent"),
    (0x80011694, "sb $v0, 12($s0)", "the sprite's place and size give the first corner's texture coordinates"),
    (0x800116c4, "sb $v0, 13($s0)", ""),
    (0x80011708, "sb $v1, 20($s0)", "the second corner's texture coordinates"),
    (0x80011738, "sb $v0, 21($s0)", ""),
    (0x80011768, "sb $v0, 28($s0)", "the third corner's texture coordinates"),
    (0x800117ac, "sb $v1, 29($s0)", ""),
    (0x800117f0, "sb $v1, 36($s0)", "and the fourth corner's texture coordinates"),
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
    (0x800120dc, "addu $a0, $v1, $a0", "plus the row's angle"),
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
    (0x80012454, "bne $a1, $zero, 0x80012460", "the sine"),
    (0x8001247c, "div $v0, $a1", "likewise"),
    (0x800124c4, "lh $a0, 0($v0)", "else the slot's angle"),
    (0x800124cc, "addu $a0, $a1, $a0", "plus the row's angle"),
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
    (0x80038d70, "addiu $a1, $a1, 13180", "the third fruit's icon"),
    (0x80038e18, "addiu $a1, $a1, 13188", "the fourth fruit's icon"),
    (0x80038ec0, "addiu $a1, $a1, 13196", "and the fifth fruit's icon"),
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
    *kula_motion_code.IMMEDIATES,
    *kula_motion_things.IMMEDIATES,
    *kula_motion_light.IMMEDIATES,
    *kula_motion_roll.IMMEDIATES,
    *kula_motion_jump.IMMEDIATES,
    *kula_motion_take.IMMEDIATES,
    *kula_motion_harms.IMMEDIATES,
    *kula_motion_blocks.IMMEDIATES,
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
    ("the level's clock and its end", "words.won1", "this for the first player's win", 0x8001586c, "addiu $s2, $zero, {}"),
    ("the level's clock and its end", "words.equal", "and this for a draw", 0x80015878, "addiu $s2, $zero, {}"),
    ("the level's clock and its end", "words.trial.won2", "as does the time trial for two players", 0x800159f4,
     "addiu $s2, $zero, {}"),
    ("the level's clock and its end", "words.trial.won1", "the first player's win", 0x800159f8, "addiu $s2, $zero, {}"),
    ("the level's clock and its end", "words.trial.equal", "and a draw", 0x80015a04, "addiu $s2, $zero, {}"),
    ("the level's clock and its end", "words.final.world", "the last final completed, the world counted on to this",
     0x800158b4, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "words.final", "picks this for a pass", 0x800158cc, "addiu $s2, $zero, {}"),

    ("the level's clock and its end", "start.wait", "a level starts with the countdown at 370 at this", 0x80035e04,
     "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "start.guard", "and the guard clears itself at this", 0x8003631c,
     "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "end.exit.landing", "the exit's result written at once after a landing", 0x8003aef8,
     "addiu $v1, $zero, {}"),
    ("the level's clock and its end", "end.hidden.landing", "and the hidden exit's result", 0x8003af6c, "addiu $v1, $zero, {}"),
    ("the level's clock and its end", "end.bonus.landing", "and a bonus level's outcome", 0x8003ae9c,
     "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "simon.done", "the Simon rooms' verdict at this is the sequence done", 0x80036330,
     "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "simon.wrong", "and at this a wrong move", 0x8003639c, "addiu $v0, $zero, {}"),
    ("the level's clock and its end", "end.view.x", "the ending's view steps its first angle by this a frame", 0x800347d0,
     "addiu $v1, $a0, {}"),
    ("the level's clock and its end", "end.view.y", "its second by this", 0x800347f4, "addiu $v1, $a0, {}"),
    ("the level's clock and its end", "end.view.z", "its third by this", 0x80034818, "addiu $a0, $a1, {}"),
    ("the level's clock and its end", "end.view.swing", "and its fourth, the swing's angle, by this", 0x80034850,
     "addiu $v1, $a0, {}"),
    ("the level's clock and its end", "end.view.swing.bonus", "or on a level with no key by this", 0x8003488c,
     "addiu $v1, $a0, {}"),
    ("the level's clock and its end", "end.view.off", "the eye stands this further than the free camera's distance", 0x800349b4,
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
    ("the level's mode", "mode.key", "counts the slots of this type, the key's type", 0x80027b4c, "addiu $t0, $zero, {}"),
    ("the level's mode", "mode.kinds", "on the records of kinds below this", 0x80027b64, "sltiu $v0, $v0, {}"),
    ("the level's mode", "mode.slots", "in this many slots of each", 0x80027bac, "slti $v0, $a0, {}"),
    ("the level's mode", "mode.bonus", "and writes this where there are none", 0x80027bd8, "addiu $v0, $zero, {}"),
    ("the level's mode", "mode.settings", "the settings record is of this kind", 0x80027c34, "addiu $t2, $zero, {}"),
    ("the level's mode", "mode.hidden.flag", "and a type of this in its first slot marks a hidden level",
     0x80027c38, "addiu $a0, $zero, {}"),
    ("the level's mode", "mode.hidden", "which writes this", 0x80027c3c, "addiu $t1, $zero, {}"),
    ("the level's mode", "mode.simon", "and the game's mode word at this, the Simon rooms' mode, puts it back to 0",
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
    ("the Simon rooms", "simon.points.gate.other", "or the second player's points this", 0x80015834, "slti $v0, $v0, {}"),
    ("the Simon rooms", "simon.menu.cross", "menu code reads a press of this bit", 0x8004ad40, "andi $v0, $v0, {}"),
    ("the Simon rooms", "simon.menu.gate", "and asks the first player's points against this", 0x8004ad70,
     "slti $v0, $v0, {}"),
    ("the Simon rooms", "simon.menu.gate.other", "and the second player's points", 0x8004ad88, "slti $v0, $v0, {}"),
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
    ("the effects", "effect.full", "each coloured this, the texture's own colour, until a row sets it",
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
    ("the effects", "effect.light.shift.g", "the second byte's shift", 0x800126ec, "sra $v0, $t2, {}"),
    ("the effects", "effect.light.shift.b", "and the third byte's shift", 0x80012704, "sra $v0, $t6, {}"),
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
    ("the effects", "teleport.flash.step.1", "off mode 1's strength", 0x8002081c, "addiu $v0, $v0, {}"),
    ("the effects", "teleport.flash.step.last", "and off the last mode's strength", 0x80020828, "addiu $v0, $v0, {}"),
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

# A number that is the multiplier a run of shifts and adds applies to what a
# register held on entry: the run starts at the address and is this many
# instructions long, and the product is read from the last register named.
MULTIPLIERS = [
    *kula_motion_code.MULTIPLIERS,
    *kula_motion_things.MULTIPLIERS,
    *kula_motion_light.MULTIPLIERS,
    *kula_motion_roll.MULTIPLIERS,
    *kula_motion_jump.MULTIPLIERS,
    *kula_motion_take.MULTIPLIERS,
    *kula_motion_harms.MULTIPLIERS,
    *kula_motion_blocks.MULTIPLIERS,
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
    ("the effects", "effect.entry", "an effect's entry is this many bytes", 0x80011930, 5, "a0", "v0"),
    ("the effects", "effect.player", "and a player's list this many", 0x80011944, 5, "a3", "a0"),
    ("the effects", "effect.buffer", "a buffer's quads lie this many bytes apart in the entry", 0x80011e94, 3, "v1", "v0"),
    ("the effects", "effect.table.mul", "the frame's table lies at the buffer times this, shifted", 0x80012998, 2, "v1", "v0"),
]

# A divisor the compiler turned into a multiply by a reciprocal and a shift:
# the two halves of the reciprocal and the shift of the high word.
DIVISORS = [
    *kula_motion_code.DIVISORS,
    *kula_motion_things.DIVISORS,
    *kula_motion_light.DIVISORS,
    *kula_motion_roll.DIVISORS,
    *kula_motion_jump.DIVISORS,
    *kula_motion_take.DIVISORS,
    *kula_motion_harms.DIVISORS,
    *kula_motion_blocks.DIVISORS,
    ("the level's clock and its end", "next.third", "the bonus slot counts the finished slot in thirds of this many",
     0x80042598, "lui $v1, {}", 0x800425a0, "ori $v1, $v1, {}", 0x800425bc, "sra $a0, $t0, {}"),
    ("the Simon rooms", "simon.next.levels", "the furthest level reached is counted in worlds of this many",
     0x80042660, "lui $v0, {}", 0x80042668, "ori $v0, $v0, {}", 0x80042690, "sra $v0, $v0, {}"),
]

# A brightness or a step of one, a grey held as a colour word in two halves.
GREYS = [
    *kula_motion_code.GREYS,
    *kula_motion_things.GREYS,
    *kula_motion_light.GREYS,
    *kula_motion_roll.GREYS,
    *kula_motion_jump.GREYS,
    *kula_motion_take.GREYS,
    *kula_motion_harms.GREYS,
    *kula_motion_blocks.GREYS,
]

KEY = 31
SLOTS = 6                 # slots to a record
LEVELS = 15               # levels a world the penalty counts
FINALS = 2                # finals a world
NEXT_ROUND = (0x800425ac, "lui $v1, {}", 0x800425b0, "ori $v1, $v1, {}")   # the bonus slots come round by it
NEXT_MODE = 0x800a3448    # the word the next-level routine's other starts hang on
NEXT_MODE_CLEARS = (0x800482e4, 0x8004adc4, 0x8004b5dc)

# A stretch of code whose every store the scan resolves to an address, none within a span of the
# ball's record: its first and last instruction, the register handed the record, the span's first
# and last word, and the calls the record goes on to, each where, the callee and the argument
# registers holding it with their offsets.
SCANS = [
    *kula_motion_code.SCANS,
    *kula_motion_things.SCANS,
    *kula_motion_light.SCANS,
    *kula_motion_roll.SCANS,
    *kula_motion_jump.SCANS,
    *kula_motion_take.SCANS,
    *kula_motion_harms.SCANS,
    *kula_motion_blocks.SCANS,
]
PLAYERS = 2
SIMON_STORE = (0x8003710c, 0x80037110)   # the sequence the Simon rooms hold a move to, as the pad builds its address
SIMON_FILL = (0x80035cdc, 0x80035ce0)    # and the halfword the reset fills it from
SIMON_AT = {"idle": (0x800a4c8c, 7508), "latch": (0x800a4c90, 7512), "move": (0x800a4adc, 7076),
            "count": (0x800a4cac, 7540), "round": (0x800a4cb0, 7544), "verdict": (0x800a4cb4, 7548),
            "turn": (0x800a33ac, 1140), "last": (0x800a5704, 10188), "starter": (0x800a38a0, 2408)}

LEVEL_MODE = (0x800a53d4, 9372)   # the level's mode word, and its offset from gp
LEVEL_MODE_READ = (0x80034830, 0x80034834)   # where the ending's view builds its address
GAME_MODE = (0x800a33b0, 1144)    # the game's mode word, 1 in the Simon rooms, and its offset from gp
GAME_MODE_READ = (0x80027cb0, 0x80027cb4)    # where the mode routine builds its address

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
    branch and the menu, the pad's verdicts the ones the ending reads, the bits one each,
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
        sys.exit("the Simon rooms read other bits of the pad than the arcade's bits")
    if r["simon.turn.left"] != r["pad.turn.left"] or r["simon.turn.right"] != r["pad.turn.right"] \
            or r["simon.empty"] != r["simon.turn.right"]:
        sys.exit("the Simon rooms' turns are not the arcade's turns, or a turn right is not told by the empty halfword's -1")
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
        sys.exit("a word of the Simon rooms does not lie where its offset from gp puts it")
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
    from the world's kinds, two particles a row, every sprite among the seven
    and every brightness a byte, the dice's -1 the one angle below nothing
    and drawn in the world only where nothing shows, a size's shifts one
    for the cosine and the sine past the sine's one, the entry two buffers
    of two quads and six words, a row eight bytes of four halfwords, the
    light's bytes shifted alike, one table for the run, the clear and the
    send, sent from its last word, every HUD point's third word -1, and
    the flash marked, tested and given with the one the loop waits two
    blanks on, a flat quad over the screen in the blend that adds, the
    level's load starting the last mode's flash on a level with no key."""
    pointers, colours, tables = r["effect.pointers"], r["effect.colours"], r["effect.tables"]
    if len(pointers) != r["effect.slots.last"] + 1 or pointers[-1] != 0 or 0 in pointers[:-1]:
        sys.exit("the effect tables' pointers are not eleven kinds' pointers of twelve")
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
        sys.exit("the sprites' colours are not the bytes startup stores, under the texture's own colour")
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
        sys.exit("the exits are tested as other types than the exit's type and the hidden exit's type")
    if r["clock.mode"] != 1 or r["clock.face"] != 8:
        sys.exit("the clock stands in another mode than the Simon rooms' mode or on another type than the clock face")
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
        sys.exit(f"the endings are {ending}, not one code each from -8 to 3 with the spikes' ending the invincibility word's rest")
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
        sys.exit("the hidden slot does not follow the bonus slots, or is not the hidden exit's slot")
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
        sys.exit("the end screen picks an entry that letters no word, or draws past another count than its pairs' count")
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
    bonus level's, an ending's, a run's, the Simon rooms', the fly-in's and the screen's words, sit under `play`. The devices' light and each device's
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
    # the ball's shadow lies as far toward the block from its middle as the
    # middle is off the face, so on the face
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
    rows.append(("the level's mode", f"and the game's mode word, which the mode routine reads, 0x{modes['game.mode.word']:08x}, "
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
