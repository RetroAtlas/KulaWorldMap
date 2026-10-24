"""The level's clock and its end, the clock that ticks once a frame at the
top of the ball's routine and stands while the ball is on a clock face, the
outcome word a level ends in, positive for a way out and negative for a
loss, the frames each ending waits and the word of the game's own lettering
the end screen names it by, read off its table of deflated images two to a
word and held to the disc by a digest of each pair, the level's mode word
the loader writes, 1 on a level with no key, 2 where the settings record's
first slot marks a hidden level and 0 again in the Simon rooms, the start's
two counts, the view an ending turns round the level and the points a death
costs, the last final's completion, and the run, the points and the fruit
banked as each level ends and the slot the next-level routine picks for the
game to load next: "The level's clock and its end" in docs/motion.md.
"""
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_level import BLOCK_KINDS, UNPLACED_KIND
from kula_motion_code import BLOCK, GP, INVISIBLE
from kula_motion_jump import flight
from kula_motion_simon import simon
from kula_motion_take import UNHARMED

CHECKS = [
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
]
IMMEDIATES = [
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
]
MULTIPLIERS = [
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
]
DIVISORS = [
    ("the level's clock and its end", "next.third", "the bonus slot counts the finished slot in thirds of this many",
     0x80042598, "lui $v1, {}", 0x800425a0, "ori $v1, $v1, {}", 0x800425bc, "sra $a0, $t0, {}"),
]
GREYS = []
SCANS = []

KEY = 31
SLOTS = 6                 # slots to a record
LEVELS = 15               # levels a world the penalty counts
FINALS = 2                # finals a world
NEXT_ROUND = (0x800425ac, "lui $v1, {}", 0x800425b0, "ori $v1, $v1, {}")   # the bonus slots come round by it
NEXT_MODE = 0x800a3448    # the word the next-level routine's other starts hang on
NEXT_MODE_CLEARS = (0x800482e4, 0x8004adc4, 0x8004b5dc)

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
