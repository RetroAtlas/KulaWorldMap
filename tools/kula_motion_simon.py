"""The Simon rooms, where the pad is read as one move at a time, Up and Cross
latched and asked together as the latch's count comes round, a held Left or
Right turning the ball once the idle count passes its gate, and each move
packed into a halfword and held to the stored sequence, with the verdict the
sequence done or a wrong move, the room's start that counts the round on and
adds to the moves to make, the reset that fills the sequence afresh, the
turn, the point and the match that go round the two players, and the end
screen and the menu code that name the winner and end the game past the
points' gate: "The Simon rooms" in docs/motion.md.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kula_motion_roll import STATES

CHECKS = [
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
]
IMMEDIATES = [
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
]
MULTIPLIERS = []
DIVISORS = [
    ("the Simon rooms", "simon.next.levels", "the furthest level reached is counted in worlds of this many",
     0x80042660, "lui $v0, {}", 0x80042668, "ori $v0, $v0, {}", 0x80042690, "sra $v0, $v0, {}"),
]
GREYS = []
SCANS = []

PLAYERS = 2
SIMON_STORE = (0x8003710c, 0x80037110)   # the sequence the Simon rooms hold a move to, as the pad builds its address
SIMON_FILL = (0x80035cdc, 0x80035ce0)    # and the halfword the reset fills it from
SIMON_AT = {"idle": (0x800a4c8c, 7508), "latch": (0x800a4c90, 7512), "move": (0x800a4adc, 7076),
            "count": (0x800a4cac, 7540), "round": (0x800a4cb0, 7544), "verdict": (0x800a4cb4, 7548),
            "turn": (0x800a33ac, 1140), "last": (0x800a5704, 10188), "starter": (0x800a38a0, 2408)}


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
