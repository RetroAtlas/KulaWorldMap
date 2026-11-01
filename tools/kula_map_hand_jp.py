"""The hand's rows for the Japanese release's map, each table in the shape `kula_map_hand.py` gives it, the placed
rows gathered from `kula_map_hand_jp_placed.py`, a module of their own.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kula_map_hand_jp_placed

PLACED = kula_map_hand_jp_placed.PLACED

TUNED = {
    "ball.breathe.full": "7200 against 6000, the ticks the breath measures the clock short of, a tick past the 7199 this disc's "
                         "hourglass takes the clock from as the US's 6000 is past its 5999",
    "ball.breathe.over": "50 against 40, the breath takes a fiftieth of the ticks the clock is short through the reciprocal "
                         "0x51eb851f and a shift of four, where the US takes a fortieth through 0x66666667 and the same shift",
    "hourglass.from": "7199 against 5999, the ticks the hourglass takes the clock from, a tick under the breath's 7200 as the "
                      "US's 5999 is under its 6000",
    "time.tick": "60 against 50, the ticks of the clock a second of the level's time fills, a frame a tick on this disc, where "
                 "the US fills fifty a second into a clock that runs sixty a second",
    "end.view.x": "-5 against -8, the step the ending's view takes toward its first angle a frame, the wrap beside it 4090 where "
                  "the US's is 4087, each the step and 4095",
    "end.view.y": "2 against 3, the second angle's step, its wrap 4097 against 4098",
    "end.view.z": "7 against 10, the third angle's step, its wrap 4102 against 4105",
    "simon.points.gate": "3 against 6, the gate the end screen asks the first player's points against, naming the winner where "
                         "they are no longer under it",
    "simon.points.gate.other": "3 against 6, the same gate on the second player's points",
    "simon.menu.gate": "3 against 6, the gate the menu asks the first player's points against",
    "simon.menu.gate.other": "3 against 6, and the second player's",
    "simon.menu.cross": "8192 against 16384, the bit of the pad the menu reads a press of, Circle's on this disc where the US "
                        "reads Cross's",
    "hide.below": "3 against 2, the floor of the kinds any other face is not built toward, which takes kind 2 in, where the US "
                  "tests kind 2 apart after a floor of 2, so the kinds are one set on both",
    "crumbling.below": "3 against 2, the floor of the kinds a crumbling face is hidden toward, which takes kind 2 in as the "
                       "other faces' floor does, where the US tests kind 2 apart, so the kinds are one set on both",
    "invisible.below": "5 against 2, the one test the invisible face's path reads, of kinds 0 to 4, which takes in the US's floor "
                       "of 2, its range of two from 2 and its kind 4, so the kinds are one set on both",
    "land.under": "101 against 100, the landing looks a unit past the ball's rest under its centre on this disc, into the block under "
                  "the face it stands on, where the US looks exactly to the face; the lift back is 100 on both",
}

ABSENT = {
    ("hourglass.second", "hourglass.points"): (0x800396cc, "jal 0x80011780",
                                               "the hourglass goes on from the clock's store to its call with nothing added "
                                               "to the score, where the US multiplies what the clock leaves by the reciprocal "
                                               "of 50 and adds ten a second"),
    "star52.points": (0x8003b064, "lw $v1, 356($s1)",
                      "the hazards routine runs from the call before the US's fast star case straight to this reload of the "
                      "word for what the ball stands on, which the fire's test follows, with no test of type 52 and no 5 a "
                      "frame between"),
    0x8003aaec: (0x8003b064, "lw $v1, 356($s1)",
                 "the reload the fire's test reads, standing where the US tests the word against the fast star's type, the "
                 "routine making no such test"),
    "hide.also.a": (0x800278d8, "addiu $v0, $zero, 4",
                    "the test of kind 4 follows the branch on the floor straight away, the floor of 3 having taken kind 2 in, "
                    "where the US tests kind 2 between"),
    "invisible.from": (0x8002764c, "sltiu $v0, $s2, 3",
                       "the invisible face's path tests its floor of 3 and overwrites the answer with the next instruction "
                       "before anything reads it, where the US begins the range's test from kind 2"),
    "invisible.span": (0x80027650, "sltiu $v0, $s2, 5",
                       "the one test the path reads, of kinds 0 to 4, which takes the floor, the US's range of two from 2 and "
                       "its kind 4 into one"),
    "invisible.also": (0x80027654, "bne $v0, $zero, 0x80027b64",
                       "and the branch past the face on that test, where the US tests kind 4 apart"),
    "crumbling.a": (0x80027714, "addiu $v0, $zero, 4",
                    "the crumbling path tests kind 4 straight after its floor of 3, which takes kind 2 in, where the US "
                    "tests kind 2 between"),
    0x800426b0: (0x80042a74, "lw $v0, 1192($gp)",
                 "the slot's load, standing where the US loads the world word to test it against the worlds' count; this "
                 "disc tests the slot against it and picks the next room not yet done from a table"),
    0x800426c8: (0x80042a94, "sw $zero, 1192($gp)",
                 "the slot's wrap to nothing, standing where the US puts the world back to nothing with the slot; this disc "
                 "wraps the world as it steps, against the worlds reached"),
    0x8004ad54: (0x800499b4, "jal 0x80042e40",
                 "the menu asks a routine of its own and tests its answer against 1, where the US reads the slot word off "
                 "its address and tests it against nothing"),
    0x80015800: (0x80015d4c, "jal 0x80042e40",
                 "the words routine asks a routine of its own and tests its answer against the mode's 1, where the US reads "
                 "the slot word off its address and tests it against nothing"),
    0x80042afc: (0x800420b8, "lw $v0, 1168($gp)",
                 "no routine of this disc sets the word the banking skips on: its four stores, in the menus, are clears, so the banking's "
                 "test here never skips"),
    0x80036c4c: (0x80036f7c, "sh $zero, 364($s0)",
                 "the count at 364 is only ever cleared on this disc, here and at three other places, and never counted up: a held turn "
                 "does not press again"),
    0x80036c5c: (0x80036d74, "sh $v0, 10974($gp)",
                 "the repeat's wait is stored at the routine's head on this disc and read nowhere, so no count is tested against it"),
    0x80036c68: (0x80036e5c, "sw $v0, 11364($gp)",
                 "this disc takes the pad's new presses once at the routine's head, the pad now and not the pad before, into a2; the copy "
                 "of the last pad it stores here is read nowhere and never cleared"),
    0x80040eec: (0x80040d58, "lw $v1, -2900($v1)",
                 "the level loop draws its line without the screen's width on this disc, reading the game's mode here to test it "
                 "against 2 where the US loads the width for the draw's call"),
}

SHIFTS = {}

RESHAPED = {
    0x80040a7c: (0x80040548, "jal 0x80069010",
                 "the callback's install through the system library, the addiu that builds the callback's address "
                 "standing in its delay slot where the US has it before the call"),
    0x80040b04: (0x800405d4, "jal 0x800552b0",
                 "each pass of the frame loop waits once through a routine laid out as the US's wait at another address, "
                 "spinning on the flag the blank's callback sets"),
    0x800202cc: (0x80020d24, "lhu $a0, -2860($a0)",
                 "the screen's width read as a halfword for the pill's quad, where the US loads the word"),
    0x800202e0: (0x80020d38, "lhu $v1, -2852($v1)", "and its height"),
    0x800244cc: (0x80024940, "lhu $v1, -2840($v1)",
                 "the screen's width read as a halfword for the flash's quad, where the US loads the word"),
    0x80027020: (0x800272ec, "sllv $v0, $a3, $s1",
                 "twice the cycle's length by a shift of s1, which holds the 1 the mode was tested against, where the US "
                 "shifts by the immediate 1"),
    0x8002702c: (0x800272f8, "sllv $v1, $v1, $s1", "twice the parity, by the same register"),
    0x80027030: (0x800272fc, "addu $v1, $v1, $s1", "and one, the register added where the US adds the immediate"),
    0x800277ec: (0x80027a40, "or $s0, $s0, $v1",
                 "the hidden level's flag ored in from v1, which holds the 2 the mode word was tested against, where the "
                 "US ors the immediate 2"),
    0x8003d6d4: (0x8003d744, "addiu $s1, $v0, 27248",
                 "the draw keeps the entries' base in s1, built from a lui, and reads each entry's position at 24 off it, "
                 "where the US keeps the position itself in s5, 32 before s4"),
    0x8003d6e8: (0x8003d744, "addiu $s1, $v0, 27248",
                 "and reads each entry's home at 32 off the same base, building no second pointer, where the US keeps "
                 "the home in fp, 24 before s4"),
    0x8002bfc0: (0x8002c460, "bgtz $v0, 0x8002c470",
                 "the count's test in an off spell, this disc branching to the swap while the count stays above nothing "
                 "and falling through to the end, where the US branches to the end at nothing or below and falls through "
                 "to the swap"),
    0x8002c024: (0x8002c4cc, "blez $v0, 0x8002c468",
                 "the count's test in an on spell, this disc branching to the end at nothing or below and falling through "
                 "to the swap, where the US branches to the swap while the count stays above nothing"),
    0x80030e24: (0x80032a38, "bgez $v0, 0x80032a48",
                 "the test of the cell at 124, this disc branching to the ice test where the word is not negative and "
                 "returning 1 after it, where the US returns 1 where it is negative and falls through to the ice test"),
    0x80032fc0: (0x80033474, "bgez $v1, 0x80033480",
                 "the second end's word tested for its sign by a branch, where the US takes the sign bit of its complement"),
    0x80032fc4: (0x80033478, "addiu $v0, $zero, 1",
                 "and 1 answered in the branch's delay slot, where the US shifts the bit down"),
    0x80033604: (0x800339fc, "beq $v0, $zero, 0x80033a0c",
                 "the body landing's test of the way routine's answer, this disc branching past the refusal where the "
                 "answer is nothing and jumping to it after, where the US branches to the refusal where it is not nothing"),
    0x80033c70: (0x800340f8, "bne $a1, $v0, 0x80034108",
                 "the face's test against 4 in the way routine, this disc branching on to the y test where the face is not "
                 "4 and returning 1 after, where the US branches to the answer 1 where it is 4"),
    0x80033ca8: (0x80034138, "beq $a1, $v0, 0x80034100",
                 "the face's test against 5, this disc branching to the return of 1 where the face is 5 and returning "
                 "nothing after, where the US branches to the return of nothing where it is not 5"),
    0x80036620: (0x8003691c, "bne $v0, $v1, 0x80036940",
                 "the word's test against 1 before the input routine, this disc branching where the word is not 1 and "
                 "jumping on where it is, where the US branches where it is 1 and jumps on where it is not"),
    0x8003686c: (0x80036b30, "lh $a0, 332($s0)",
                 "the measure across read signed off the record for two tests, below 357 and below 156, where the US reads "
                 "it unsigned and tests the difference from 156 below 201, the same range"),
    0x8003762c: (0x80037e40, "sw $v0, 104($a0)",
                 "the cell's word stored at 104 off the record and the cell's offset, the 104 folded into the store on "
                 "this disc where the US adds it to the pointer first"),
    0x8003a3e4: (0x8003a9b0, "lh $v1, 332($s0)",
                 "the measure across read signed for two tests, below 197 and below 316, where the US reads it unsigned "
                 "and tests the difference from 197 below 119, the same range"),
    0x80036cac: (0x80036fb4, "andi $v0, $a2, 128",
                 "a new press told from the word the caller hands in a2 on this disc, the pad less the last frame's, "
                 "where the US complements the last frame's pad it keeps off gp at each test"),
    0x8003a940: (0x8003aecc, "lhu $v0, 156($s1)",
                 "the ball's own cell read as a halfword off the record in s1, where the US loads the word off s0"),
    0x8003b7c4: (0x8003be88, "lwr $t0, 24($a1)",
                 "the loader reads an entry's position at 24 off the entry itself, where the US points v0 at it 24 past "
                 "s4 first"),
    0x8003b7bc: (0x8003be98, "swr $t0, 32($a1)",
                 "the position copied into the home at 32 off the entry itself, where the US points v1 at the home 32 past "
                 "s4 first"),
    0x800384f4: (0x80038afc, "lw $v0, 104($v0)",
                 "the cell's word loaded at 104 off the record and the cell's offset, the 104 folded into the load on this "
                 "disc where the US adds it to the pointer first"),
    0x80037ff8: (0x8003b9fc, "addu $v0, $zero, $zero",
                 "the top face answered as nothing in the delay slot of the branch on -1, where the US takes the truth of "
                 "the complement and negates it"),
    0x80037ffc: (0x8003ba04, "addiu $v0, $zero, -1",
                 "and -1 answered for anything else, in the delay slot of the return"),
    0x80011f4c: (0x80011d80, "lbu $v0, 2($s7)",
                 "the row's brightness read as a byte off the row, where the US reads the halfword"),
    0x80039d14: (0x8003a30c, "lhu $v0, 28($a3)",
                 "the draw walk's translation read as a halfword off the record, at 28, where the US reads a word out of a table of its "
                 "own at the record's index"),
    0x8002f16c: (0x8002efc8, "lui $t0, 0x001a",
                 "the glow face routine's entry, which this disc opens with the high half of a constant hoisted out of the body, the "
                 "body the US opens with following two instructions on"),
    0x8002f954: (0x8002faa8, "slti $v0, $v1, 101", -101,
                 "the fall window's start on a roll over nothing, tested on this disc as the progress, read signed, being under 101, "
                 "which skips the fall, where the US adds -101 to the progress and tests what is left unsigned against the span; "
                 "the window opens at 101 on both"),
    0x8002f958: (0x8002fab0, "slti $v0, $v1, 428", 327,
                 "and its end, the progress under 428 tested in the first test's delay slot, where the US tests the 327 units left "
                 "past the start; the window closes at 428 on both, 327 units on"),
}

MULTIPLIERS = {
    "spikes.phase.step": (0x80029fa8, 4, "a0", "v1",
                          "the phase times 35 in four instructions as on the US, the phase read into a0 on this disc where "
                          "the US reads it into v1"),
    "end.view.reach.bonus": (0x80034f48, 7, "v0", "a2",
                             "the reach times 3000 in seven instructions as on the US, into a2 on this disc where the US has "
                             "it in a1"),
    "move.cells.up": (0x80037dec, 3, "t0", "v0",
                      "the row's index times 36 in three instructions as on the US, from t0 into v0 on this disc where the "
                      "US has it from t2 into v1, and after the cell's index where the US has it before"),
    "move.cells.on": (0x80037dd4, 3, "t1", "v0",
                      "the cell's index times 12 in three instructions as on the US, into v0 on this disc where the US has "
                      "it into a0"),
    "star50.travel": (0x8003c2a8, 4, "v1", "v0",
                      "the slow star's speed times 13 in four instructions as on the US, the position's address added by a "
                      "register after them on this disc where the US builds it through at"),
    "ball53.lurch.reach": (0x8003cd2c, 2, "v0", "v1",
                           "the sine times 65 in two instructions as on the US, after the sine's call, in whose delay slot this "
                           "disc stores the angle where the US shifts the call's argument"),
    "ball53.dash": (0x8003cf48, 6, "v1", "v0",
                    "the wandering ball's speed times 53 in six instructions as on the US, the position's load following them "
                    "on this disc where the US builds the position's address through at"),
    "words.allowance": (0x80015ca0, 4, "a0", "v0",
                        "the difficulty times 60 in a shift, a subtraction, the table's load and a shift on this disc, where "
                        "the US has a lui and an addu about the load too"),
    "effect.entry": (0x800117fc, 5, "a0", "v0",
                     "the entry's index times 184 in five instructions as on the US, after the list's address is built on "
                     "this disc where the US builds it after"),
    "effect.table.mul": (0x80012700, 2, "a0", "v0",
                         "the buffer's index times 513 in two instructions as on the US, from a0 on this disc where the US has "
                         "it from v1"),
    "GLOW_LIFT_STRIDE": (0x8002d77c, 3, "a1", "v0",
                         "a circuit's stride of 12 words as an sllv by the 1 v0 was set to before the branch, an add and a shift of 2, "
                         "through v1 into v0 on this disc where the US shifts, adds and shifts in v0"),
    "arc.2.heading": (0x8002fc58, 5, "v1", "v0",
                      "the second arc step's heading, 22 as on the US, in a shift, an add, an sllv by the 2 a2 holds from before the "
                      "branch, a subtract and a shift"),
    "land.under": (0x80030c8c, 6, "a0", "v0",
                   "the landing's look under the centre from a0 by shifts of 1 and 3 with adds, a shift of 2 and one add more, 101, where "
                   "the US's six make 100 from v1"),
}

EXTRA = [
    # The end screen.
    (0x80015c68, "addiu $s2, $zero, 38",
     "the end screen picks pair 38 in the normal mode where the word at 0x800a1f08 is 1, a choice the US never makes"),
    # The Simon rooms' branch of the next-level routine.
    (0x8004290c, "addiu $t1, $zero, 1", "the 1 a marked halfword of either table holds, and the shift from an index to its halfword"),
    (0x80042910, "lui $v0, 0x000a", "the high half of the table by room"),
    (0x80042914, "addiu $v0, $v0, 8080", "and its base, 0x800a1f90, a halfword a room"),
    (0x8004291c, "lui $a0, 0x000a", "the high half of the table by world"),
    (0x80042920, "addiu $a0, $a0, 8040", "and its base, 0x800a1f68, a halfword a world"),
    (0x80042924, "lw $v1, 1196($gp)", "the world word read before anything steps it"),
    (0x80042928, "lw $v0, 1192($gp)", "and the slot"),
    (0x8004293c, "sh $t0, 0($v1)", "the world's halfword marked with the starter word's 1"),
    (0x80042940, "sh $t0, 0($v0)", "and the room's halfword"),
    (0x80042944, "lh $v0, 0($a1)", "the table by room read a halfword at a time"),
    (0x8004294c, "bne $v0, $t1, 0x80042958", "a halfword at 1"),
    (0x80042954, "addiu $a3, $a3, 1", "counted as a room done"),
    (0x8004295c, "slti $v0, $a2, 10", "over ten halfwords"),
    (0x80042968, "slti $v0, $a3, 3", "and where three or more rooms are done"),
    (0x8004296c, "beq $v0, $zero, 0x80042acc", "no room is picked and the reload word is left as it stands"),
    (0x80042980, "lw $v1, 1228($gp)", "under three, a word 1228 past gp, 0x8009f530, which the level loop counts up by one"),
    (0x80042998, "div $v1, $v0", "divided by the furthest level reached in worlds of fifteen"),
    (0x8004299c, "mfhi $a0", "whose remainder"),
    (0x800429a8, "sw $a0, 1196($gp)", "is the world word"),
    (0x80042a08, "slt $v0, $v0, $v1", "the world stepped on again while it is past the worlds reached"),
    (0x80042a0c, "bne $v0, $zero, 0x800429bc", "back to the step that wraps it to the first"),
    (0x80042a1c, "addiu $v1, $v1, 8040", "the table by world read at the world word"),
    (0x80042a24, "lh $v1, 0($v0)", "its halfword"),
    (0x80042a2c, "beq $v1, $v0, 0x800429bc", "and the world stepped on again where that is marked"),
    (0x80042a38, "lw $a0, 1228($gp)", "the same word read again"),
    (0x80042a3c, "ori $v0, $v0, 26215", "taken modulo 10 through the tenth's reciprocal 0x66666667"),
    (0x80042a60, "subu $a0, $a0, $v0", "the tens taken off"),
    (0x80042a68, "sw $a0, 1192($gp)", "as the slot word"),
    (0x80042a84, "slti $v1, $v1, 10", "the slot stepped on wraps to nothing past the tenth room"),
    (0x80042aa4, "beq $v0, $zero, 0x80042a74", "and steps on again while it is not under 10"),
    (0x80042ab0, "addiu $v1, $v1, 8080", "the table by room read at the slot"),
    (0x80042ab8, "lh $v1, 0($v0)", "its halfword"),
    (0x80042ac0, "beq $v1, $v0, 0x80042a74", "and the slot stepped on again where that is marked"),
    # The level loop.
    (0x80041854, "addiu $v0, $v0, 1", "the word at 0x8009f530 counted up by one in the level loop"),
    (0x80041858, "sw $v0, 1228($gp)", "and stored, by no other instruction that names it"),
    # The tables' reset.
    (0x80048218, "jal 0x80042da4", "the menu that starts the mode, its mode and starter words set, calls the tables' reset"),
    (0x80042db8, "sh $zero, 0($v1)", "which clears the table by world"),
    (0x80042dbc, "sh $zero, 0($a0)", "and the table by room"),
    (0x80042dc8, "slti $v0, $a1, 20", "twenty halfwords each"),
    (0x80042de4, "lw $a0, 1228($gp)", "reads the counted word"),
    (0x80042dfc, "div $a0, $v0", "divides it by the furthest level reached in worlds of fifteen"),
    (0x80042e30, "sw $a0, 1192($gp)", "and makes the word modulo 10 the first room's slot"),
    (0x80042e34, "sw $a1, 1196($gp)", "and the remainder its world, with nothing marked to step past"),
    # The marked rooms' count.
    (0x80042e54, "lh $v0, 0($v1)", "the routine the end screen and the menu ask reads the table by room"),
    (0x80042e78, "slti $v0, $a1, 3", "counts its halfwords at 1 against 3"),
    (0x80042e80, "xori $v0, $v0, 1",
     "and answers 1 where three or more rooms are done, where the US asks whether the slot is at nothing"),
]

WORDS = {
    0: "LOADING",
    2: "刺さった",
    4: "タイムアウト",
    6: "落ちた",
    8: "燃えた",
    10: "捕まった",
    12: "ファイナルクリア",
    14: "やられた",
    16: "間違えた",
    18: "Game Over",
    20: "良くできました",
    22: "不合格 リトライするステージを選択して○ボタン",
    24: "合格 ○ボタンで続ける",
    28: "1プレイヤーの勝ち",
    30: "2プレイヤーの勝ち",
    32: "引き分け",
    34: "大変良くできました",
    36: "ステージクリア",
    38: "大変良くできました Perfect!",
}
