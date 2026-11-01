"""The hand's rows for the Japanese release's map, each table in the shape `kula_map_hand.py` gives it."""

PLACED = {}

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
}

SHIFTS = {}

RESHAPED = {}

MULTIPLIERS = {}

EXTRA = []

WORDS = {}
