"""The hand's rows for the PAL release's map, each table in the shape `kula_map_hand.py` gives it."""

PLACED = {
    # The frame loop.
    0x80040ad0: (0x80041254, "the frame loop's load of the lethargy pill's mode word, between its lui and the branch "
                             "that tests it, in the loop that waits each pass"),
    0x80040a98: (0x800411b8, "the 1 the level loop keeps in a saved register for its mode tests, s6 on this disc where "
                             "the US keeps it in s2, set before the frame loop as the callback is installed"),
    0x80040b28: (0x800412ec, "the 1026 words the loop clears from the frame's table, the clear standing after the wait "
                             "as on the US, inside a loop over the players"),
    0x80040b38: (0x800411bc, "the lui of the frame's table, which this disc builds once into fp before the frame loop "
                             "and adds the buffer's offset to each pass, where the US builds it in v0 each pass"),
    0x80040b3c: (0x800411c0, "and the low half of the table's address, added to fp"),
    0x80040744: (0x80040f04, "the level loop's first store, clearing its word at the loop's entry as on the US, the "
                             "word lying at another offset from gp"),
    0x8004100c: (0x800417f0, "the level loop's call of the routine that sets the guard, the target of the three "
                             "branches on the outcome, the pause and the third word before it, where a like-shaped "
                             "call in the helper the loop calls reaches another routine"),
    0x80040c80: (0x800412cc, "the load of the screen's distance word off gp into a0 for the library call that follows, "
                             "the word lying at another offset from gp"),
    # The ball's light.
    0x800324a4: (0x80032cdc, "the clear of the green component's word on the stack, which this disc stores with the "
                             "other clears before the multiply rather than beside the base's store"),
    0x800324a8: (0x80032d2c, "the store of the base, 178, to the stack before the call, after the load of the constant "
                             "as on the US"),
    # The body's spin and the rotation routines.
    0x80032508: (0x80032d8c, "the load of the spin's speed at 320 in the body's turn routine, the first of the two the "
                             "roll calls on both discs, the one it calls where the state is 1"),
    0x8003250c: (0x80032d90, "the body's matrix at 596 handed to the turn"),
    0x80032518: (0x80032da0, "the call of the turn about x, the first of the three copies of the rotation routine on "
                             "this disc as on the US, called with the negated step"),
    0x80060fb4: (0x80061d2c, "the sine taken as it is for a positive angle, at the same place of the rotation about x, "
                             "which the spin calls"),
    0x80060fbc: (0x80061d34, "the load of the matrix's second row"),
    0x80060fc0: (0x80061d38, "and of its third"),
    0x80060ff8: (0x80061d70, "the store of the mixed second row"),
    0x80061088: (0x80061e00, "and of the mixed third"),
    0x8006132c: (0x800620a4, "the first subtraction of the rotation about z, the third copy of the rotation routine on "
                             "this disc as on the US, called from the same four places"),
    0x800613bc: (0x80062134, "and its first addition"),
    # The system library.
    0x8005f808: (0x80060680, "the first instruction of the library's routine that packs a page word, laid out as the US's"),
    0x8005fa78: (0x80060890, "the first instruction of the library's routine that merges two primitives' lengths, laid "
                             "out as the US's"),
    # The Copycat loader.
    0x8004cd0c: (0x8004d52c, "the lui of the game's mode word at the top of the Copycat loader"),
    0x8004cd10: (0x8004d530, "and its load"),
    0x8004cd14: (0x8004d534, "the 1 the mode is tested against"),
    0x8004cd20: (0x8004d544, "and the 2 the file wanted is tested against"),
    # The view's reset.
    0x80020238: (0x80020b10, "the one 4096 the reset routine loads on this disc and stores across and down, where the "
                             "US loads 4096 and 3840"),
    0x80020244: (0x80020b10, "the same instruction, the scale down being 4096 as the scale across is"),
    0x8002023c: (0x80020b18, "the lui of the screen word across"),
    0x80020240: (0x80020b1c, "and the store to it"),
    0x80020248: (0x80020b14, "the clear of the mode word, which this disc does first"),
    0x8002024c: (0x80020b20, "the lui of the screen word down"),
    0x80020250: (0x80020b24, "and the store to it"),
    # The jump, the hop and the fall.
    0x8002fce8: (0x80030530, "the jump's count falling by one, straight after its load, with no skip tested against it "
                             "on this disc"),
    0x8002fd00: (0x80030534, "the jump ends where the count is nothing, tested as the count is stored"),
    0x8002fd10: (0x80030544, "the harm word's test at 706, after the count's test as on the US"),
    0x80030084: (0x800308b8, "the hop's count falling by one, straight after its load, with no skip tested against it "
                             "on this disc"),
    0x800301d4: (0x800309fc, "the state set to 6, falling, as the hop runs out over nothing"),
    0x8002f91c: (0x80030164, "the fall from rest's -10 along the normal, loaded after the state is set to 3 and stored at "
                             "310 before the jump out, as on the US"),
    0x800307f4: (0x8003101c, "the jump's wall test against 412 on the progress at 336, at the top of the jump's routine, "
                             "which saves s1 beside s0 and ra on this disc; the hop's routine opens with the same test on "
                             "its own word at 334"),
    # The moving spikes.
    0x8002bd00: (0x8002c55c, "the rattle's count loaded into s0 before the jump out whose delay slot sets the state to 2, "
                             "the first of the routine's two such loads, 12 on this disc for the US 14"),
    0x8002bd58: (0x8002c5b0, "the hold's count loaded into s0 before the jump out whose delay slot sets the state to 3, "
                             "the second of the two, the retract's countdown after it"),
    # The level loop and the draw.
    0x80041c34: (0x80042328, "the level loop's branch back to its frame loop while the word it tests is nothing, kept in s7 "
                             "on this disc where the US reloads it into t2 off the stack, between a word copied across gp "
                             "and the call that follows, whose delay slot carries nothing here"),
    0x80036988: (0x800371e0, "the draw's branch past the ball while the outcome word is set, the second of three words it "
                             "loads through a lui and tests in turn, each lying at another offset on this disc"),
    0x80041cc0: (0x800423b4, "the world word's test against 10, which ends the game, after its load off gp and the sign "
                             "test of the word before it, as on the US with both words at other offsets from gp"),
    # The wall test in the air and the air test.
    0x800308cc: (0x80031178, "the first axis test of the heading against the arrow's way, the way read off gp on this disc"),
    0x800308e4: (0x8003118c, "the second"),
    0x800308fc: (0x800311a0, "and the third"),
    0x80030914: (0x800311b8, "the bounce's sound"),
    0x800309c4: (0x80031268, "the bounce's speed along the heading, the advance reversed"),
    0x8003b51c: (0x8003bd98, "the state's test against 6 in the air test, which three callers reach on this disc as on "
                             "the US"),
    0x8003b520: (0x8003bd9c, "and against the hop's and the jump's"),
    0x8003b534: (0x8003bdb0, "the count's test against 2"),
    # The next-level routine and the record builder.
    0x8004245c: (0x80042b5c, "the lui of the level's mode word in the next-level routine, which reads the word once on "
                             "this disc, before the ways out; the read before the numbering is gone with the numbering"),
    0x80042460: (0x80042b60, "and its load"),
    0x800424b4: (0x80042b38, "the routine's first instruction on this disc, the load of the word the banking skips on"),
    0x800424bc: (0x80042b40, "and the return while it is set"),
    0x800424c4: (0x80042b48, "the lui of the game's mode word"),
    0x800424c8: (0x80042b4c, "and its load"),
    0x800424d0: (0x80042b54, "the arcade's branch on it"),
    0x80042478: (0x80046578, "the split between an ordinary level's number and a final's in the routine that builds a "
                             "level's record from the loaded pack, the one place this disc numbers a level"),
    0x80042490: (0x8004659c, "the place times fifteen plus the slot, there"),
    0x80042498: (0x800465a0, "plus one"),
    0x800424a8: (0x800465e4, "or twice the place plus the slot"),
    0x800424ac: (0x800465e8, "plus 151"),
}

TUNED = {
    "ball53.shake": "65 against 77, 77 at fifty a second rounded up, where a count cut either way gives 64 or 78, and one "
                    "above the wheel's turning gate of its disc, 64 and 76",
    "flight.slow.gate": "881 against 929, each one above a multiple of the flight's step of 16, 55 and 58 of them, so the "
                        "parameter steps evenly to 896 and to 944 and eases from there past 1024 with a first step of 16 "
                        "and 13, 69 frames at fifty against 68 at sixty",
    "climb.step": "-73 against -64, the quarter turn's 1024 over the climb's frames, 14 and 16, cut toward nothing",
    "screen.rest.down": "4096 against 3840, the scale down equal to the 4096 across, where the US's is fifteen sixteenths "
                        "of it",
    "screen.reset.down": "4096 against 3840, the reset's scale down equal to its 4096 across as the rest's is",
    "teleport.flash.from": "272 against 268, the 248 the flash's first pass shows plus the mode's step, 24 and 20",
    "teleport.flash.from.1": "264 against 261, 248 plus mode 1's step, 16 and 13",
    "teleport.flash.from.last": "256 against 254, 248 plus the last mode's step, 8 and 6",
    "teleport.flash.level.from": "256 against 254, the last mode's start again, 248 plus its step of 8 and 6",
    "vanish.settle.scale": "56 against 224, each the settling's 224 spread over its frames, 4 and 5, the US dividing by "
                           "five where this disc has the 56 whole",
    "vanish.dim.scale": "28 against 224, each the dimming's 224 spread over its frames, 8 and 9, the US dividing by nine "
                        "where this disc has the 28 whole",
}

ABSENT = {
    "platform.scale": (0x800332e4, "lhu $v1, 36($v0)",
                       "the loader reads the speed's halfword at 36 and stores it back two instructions on as it is, "
                       "where the US multiplies it by 50 first, so the speed ships as the disc holds it"),
    "platform.over": (0x800332e8, "sh $zero, 38($v0)",
                      "the loader clears the halfword at 38 between the speed's load and its store with no reciprocal "
                      "about them, where the US divides the product by 60 through one"),
    "jump.skip": (0x80030534, "blez $v0, 0x80030648",
                  "the jump's count falls by one a frame to nothing with no skip from one past 2, the end test following "
                  "the fall at once"),
    "hop.skip": (0x800308bc, "blez $v0, 0x800309d4",
                 "the hop's count the same, the end test following the fall at once"),
    "fall.hop": (0x800309f4, "lhu $v1, 326($s0)",
                 "a hop over nothing starts down at the last frame's change along the normal, read off the record at 326 "
                 "and stored at 310 as it is, where the US stores a constant"),
    "vanish.settle.by": (0x8002c1d4, "addiu $a1, $v0, 32",
                         "the settling adds its floor to the count times 56 with no division, where the US divides the "
                         "count times 224 by five"),
    "vanish.dim.by": (0x8002c2cc, "addiu $v1, $zero, 256",
                      "the dimming takes the count times 28 off 256 with no division, where the US divides the count "
                      "times 224 by nine"),
}

SHIFTS = {
    "vanish.in.by": (0x8002c12c, "sra $a1, $v0, 3",
                     "the fade in divides the rise times 255 by a shift of three, by eight cut toward nothing, a second "
                     "shift of the sum plus seven fixing a negative, over the eight frames it fades in, where the US "
                     "multiplies by the reciprocal of nine over nine"),
    "vanish.out.by": (0x8002c370, "sra $a1, $v0, 4",
                      "the flash out divides the count times 255 by a shift of four, by sixteen cut toward nothing, a "
                      "second shift of the sum plus fifteen fixing a negative, over the sixteen frames it flashes out, "
                      "where the US multiplies by the reciprocal of nineteen over nineteen"),
}

RESHAPED = {
    0x80040b04: (0x80041288, "jal 0x80052ab8",
                 "each pass of the frame loop waits once through a routine laid out as the US's wait at another address, "
                 "spinning on the flag the blank's callback sets"),
    0x80051d18: (0x80052ac8, "beq $t1, $zero, 0x80052ac0",
                 "the wait's spin on the flag, the fifth instruction of the wait and the last of the three it spins "
                 "through, as on the US"),
    0x8002fcf4: (0x80030538, "sw $v0, 404($s0)",
                 "the jump's count stored as it fell by one; this disc has no skip from one past 2 to nothing, so the "
                 "count runs down through 2 and 1"),
    0x800308ac: (0x8003110c, "lh $v1, 2($v0)",
                 "the wall test in the air reads the kind of the block under the ball off the level, where the US read "
                 "the flag the air test set"),
    0x800308b4: (0x80031114, "bne $v1, $v0, 0x80031270",
                 "and gives up where the kind is not the arrow's, where the US gave up where the flag was not 1"),
    0x800309cc: (0x800311a4, "addu $v0, $zero, $zero",
                 "a heading along the way answers nothing from the delay slot of the third axis test, with no flag to "
                 "clear"),
    0x8003b548: (0x80031114, "bne $v1, $v0, 0x80031270",
                 "the kind's test against the arrow's 28 stands in the wall test in the air on this disc, where the "
                 "US's air test made it and kept the answer in a flag"),
    0x8003b550: (0x8003bdbc, "addiu $v0, $zero, 1",
                 "the air test answers 1 for the air and sets no flag, the arrow being tested where the US read the flag"),
    0x8003b55c: (0x8003bdb8, "addu $v0, $zero, $zero",
                 "and answers nothing for the ground from the count test's delay slot, with no flag to clear"),
    0x800406c4: (0x80040e98, "j 0x800409f0",
                 "the play loop goes back to its start by one jump at its tail; the outcome word's test against 4 and "
                 "the clearing of it and of the game's mode word stand at the level loop's tail on this disc"),
    0x80042468: (0x80046524, "bne $v1, $v0, 0x80046610",
                 "the record builder numbers the entries the loaded list marks with a 1 and clears the rest; the "
                 "next-level routine's numbering, gated on the level's mode word, is not on this disc, and the word it "
                 "wrote is read by nothing on either"),
    0x80042470: (0x80046570, "lh $v0, -18366($at)",
                 "the builder reads whether the entry is a final off the entry itself, where the next-level routine read "
                 "the finals flag off gp"),
    0x800424b0: (0x800465ac, "sh $v0, 21388($at)",
                 "the number goes into the records' table as a halfword, where the next-level routine stored it in a "
                 "word of gp"),
}

MULTIPLIERS = {
    "spin": (0x80032d94, 5, "v0", "a0",
             "the spin's speed times 6 in three instructions and negated across the call, where the US has it times 5 "
             "in two, 6 being 5 at fifty frames a second"),
    "words.allowance": (0x8001655c, 8, "v1", "v0",
                        "the difficulty times 50 in five shifts and adds about a lui, an addu and a load, on v1 where "
                        "the US has it on a0 times 60 in six"),
    "spikes.phase.step": (0x8002a9d8, 4, "v1", "v1",
                          "the phase times 29 by a shift of three, a subtraction, a shift of two and an addition, where "
                          "the US has 35 by a shift, an addition, a shift and a subtraction, 29 being 35 at fifty frames "
                          "a second cut"),
    "vanish.phase.step": (0x800294e0, 4, "a1", "v0",
                          "the phase times 47 in four instructions into v0, where the US has 56 in three into v1, 47 at "
                          "fifty being 56 at sixty cut"),
    "vanish.in.scale": (0x8002c120, 2, "v0", "v0",
                        "the fade in's rise times 255 in a shift and a subtraction into v0, where the US has the same "
                        "into v1"),
    "vanish.settle.scale": (0x8002c1c8, 3, "a2", "v0",
                            "the count times 56 in two shifts and a subtraction, where the US has 224 before a division "
                            "by five"),
    "vanish.dim.scale": (0x8002c2c0, 3, "a2", "v0",
                         "the count times 28 in two shifts and a subtraction, where the US has 224 before a division by "
                         "nine"),
    "vanish.out.scale": (0x8002c364, 2, "a2", "v0", "the count times 255 in a shift and a subtraction, as on the US"),
    "star50.travel": (0x8003c520, 1, "v0", "v0",
                      "the slow star's speed times 16 by one shift of four, after the position's load, where the US has "
                      "13 in four instructions before it, 16 at fifty being 13 at sixty cut"),
    "wheel.travel": (0x8003c73c, 2, "v0", "v1",
                     "the wheel's speed times 15 by a shift of four and a subtraction, where the US has 12 in six "
                     "instructions about the position's load, 15 at fifty being 12 at sixty cut"),
    "ball53.dash": (0x8003d474, 1, "v0", "v0",
                    "the wandering ball's speed times 64 by one shift of six, after the position's load, where the US "
                    "has 53 in six instructions, 64 at fifty being 53 at sixty cut"),
    "next.levels": (0x80046594, 2, "a0", "v1",
                    "the place times fifteen in the record builder, the one place this disc numbers a level, as the US "
                    "numbers it there and in the next-level routine"),
    "next.levels.final": (0x800465e0, 1, "v1", "v1", "and the place times two for a final, there"),
}

EXTRA = []

WORDS = {
    0: "LOADING!", 2: "SPIKED!", 4: "TIME OUT!", 6: "FELL OFF!", 8: "FIRE!", 10: "CAPTURED!", 12: "Final Completed!",
    14: "LASER!", 16: "Wrong Move!", 18: "Game Over!", 20: "Well Done!", 22: "You failed to qualify!",
    24: "You qualified!", 28: "Player 1 Won!", 30: "Player 2 Won!", 32: "Draw!", 34: "Very Well Done!",
    36: "Level Cleared!",
}
