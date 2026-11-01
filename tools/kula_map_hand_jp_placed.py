"""The hand's placed rows for the Japanese release's map, in the shape `kula_map_hand.py` gives the table, gathered by
`kula_map_hand_jp.py` with its other tables.
"""

PLACED = {
    # The frame loop.
    0x8003fdbc: (0x8003faa4, "the callback's store of 1 to the flag the wait spins on, in the delay slot of its return, "
                             "through v1 where the US stores through at"),
    # The lethargy pill's screen.
    0x800201f4: (0x800256bc, "the count of players read through a lui at the top of the routine that writes the pill's mode "
                             "word, whose return in the middle cuts it in two on this disc's listing"),
    0x800201fc: (0x800256c4, "and the 2 it is tested against"),
    0x80020208: (0x800256d0, "the test of the argument against 1"),
    0x80020210: (0x800256d8, "and the store of it as the mode word, off gp as on the US"),
    0x800202e8: (0x80020d40, "the quad's red on the pill's pass, written at 4 of the quad as on the US"),
    0x8002040c: (0x80020e64, "the ghost's green, 112 kept in s2 on this disc where the US keeps it in s1, written at 5 of "
                             "the quad where the US writes each colour byte at its absolute address"),
    0x80020430: (0x80020e88, "and its blue, s0 written at 6 of the quad"),
    0x80020460: (0x80020eac, "the call that adds the ghost to the frame's table, the table's address added in the delay slot "
                             "as on the US"),
    0x800204a0: (0x80020eec, "the second sprite's red, written at 4 of its quad"),
    0x800205a8: (0x80020fe8, "the call that draws the ghost once more, before the last halfword store on this disc where the "
                             "US has it after"),
    0x8002062c: (0x8002107c, "the fading sprite's red, the level read as a byte off gp on this disc and written at 4 of the "
                             "quad"),
    0x80020658: (0x800210a0, "its green, at 5"),
    0x80020680: (0x800210c4, "and its blue, at 6"),
    0x80024274: (0x80024704, "the lethargy screen's page word read at 4 off the quad's entry on this disc where the US reads "
                             "it at its absolute address"),
    0x8002428c: (0x80024710, "and its palette word at 2"),
    0x8002429c: (0x80024718, "the test of the buffer against the other's, s1 on this disc where the US keeps it in s3"),
    # The teleport's flash.
    0x80020794: (0x80025754, "the last mode's 2 in the strength routine's tail, which lies past the return this disc's "
                             "listing cuts the routine at"),
    0x8002079c: (0x8002575c, "and the 254 the flash starts from in that mode"),
    0x800207a8: (0x80025774, "mode 1's 261"),
    0x800207ac: (0x80025778, "and the strength's store after it, this disc storing on each mode's path where the US joins "
                             "the paths before one store"),
    0x800208ac: (0x800212ac, "the low half of the frame table's address, built in v1 on this disc where the US builds it in "
                             "t1"),
    0x800208c4: (0x800212a4, "the strength written into the quad's third colour byte, read as a byte off gp before the "
                             "table's address is built where the US loads the word after"),
    0x80020940: (0x80021324, "the quad's first word written, in the delay slot of the return on this disc"),
    0x80020944: (0x80021328, "the flash's mark cleared, past that return"),
    0x80020948: (0x8002132c, "and its word"),
    0x800244ec: (0x80024930, "the 1 the flash's quad is wider than the screen by, loaded into a1 once and added to the width "
                             "and the height as a register where the US adds an immediate to each"),
    0x800244f0: (0x80024930, "the same 1, which the height takes too"),
    # The screen's shake.
    0x80022818: (0x80023054, "the shake's flag read off gp at the top of the routine of the frame that runs its count down"),
    0x80022838: (0x80023074, "and the branch while the count stays at nothing or above"),
    # The gem's glints.
    0x80022f40: (0x8002369c, "the low half of the glints' top grey, after its lui as on the US"),
    0x8002aa5c: (0x8002afc8, "the 1044 the frame's row steps by, after the loop over the three models as on the US"),
    0x8002aa68: (0x8002afd0, "the first of the two calls before the models are drawn, the address it takes standing in "
                             "its delay slot on this disc where the US has it before the call"),
    0x8002327c: (0x8002599c, "the slot times four, in the branch that reads it where the US shifts it in the branch's delay "
                             "slot"),
    0x800232c0: (0x80025990, "the cut times 64, before the slot's load on this disc where the US has it after"),
    0x80023334: (0x80025a18, "the record's third word stored, each of the five from the stack reloaded into v0 on this disc "
                             "where the US keeps them in t2 to t5 and t1"),
    0x80023338: (0x80025a24, "its fourth"),
    0x8002333c: (0x80025a30, "its fifth"),
    0x80023340: (0x80025a40, "its sixth, stored after the seventh on this disc"),
    0x80023344: (0x80025a3c, "and its seventh, from t1 as on the US"),
    # The things on a block.
    0x800286b0: (0x80028824, "the y stretch's count stepping on, the second of the three stretches that lay the things "
                             "along an axis, s3 as on the US"),
    0x800287f8: (0x80028964, "and the z stretch's, s4"),
    # The dice.
    0x8004740c: (0x80046bf8, "the dice's seed stored off gp in the routine of three instructions before the one that "
                             "multiplies it, as on the US"),
    0x80025058: (0x800253ac, "the seed of 1 the dice are started with, before the call that stores it"),
    # The effects.
    0x8002539c: (0x8002583c, "the first instruction of the routine that sets a primitive's page word and quad, laid out "
                             "as the US's"),
    # The devices' light.
    0x8002d334: (0x8002d610, "the 1 the mode is tested against, after the load of the face's shade on this disc where the "
                             "US has it before"),
    0x8002d344: (0x8002d624, "the lui of the level's mode word"),
    0x8002d348: (0x8002d628, "and its load, the pair standing after the shade's index is added where the US has them "
                             "before"),
    0x8002d3f0: (0x8002d6b8, "the lui of the light's table of cases by type, whose low half an addiu adds before the index "
                             "on this disc where the US adds the index first"),
    0x8002d4b0: (0x8002d774, "the lui of the circuits' lifts, whose low half an addiu adds before the index the same way"),
    0x8002d4c0: (0x8002d794, "the light times the circuit's lift, the lift read into v0 on this disc where the US reads it "
                             "into v1"),
    0x8002d4f8: (0x8002d7dc, "the product over 4096, from a3 on this disc where the US has it in a2"),
    0x8002d514: (0x8002d7d4, "the lui of the teleporters' colours, whose low half an addiu adds before the index the same "
                             "way"),
    # The gem's glints' records.
    0x80022f4c: (0x80023618, "the lui of the glints' records, whose low half an addiu adds into s4 on this disc where the US "
                             "adds it into a0 and adds the slot after"),
    0x80022f50: (0x80023620, "and that addiu, a load off gp between the two"),
    0x8002aa2c: (0x8002af90, "the same lui in the frame's draw, the low half added into s5 there"),
    0x8002aa30: (0x8002af94, "and that addiu"),
    # The devices' light's colours.
    0x8002d5ec: (0x8002d8cc, "the lui of the switches' colour, whose low half an addiu adds before a jump to the load the "
                             "exits' path shares on this disc, where the US adds the index and loads on each path"),
    0x8002d5f4: (0x8002d9b0, "that shared load of the colour, which the exits' path falls into after its own lui"),
    # The skins' cycles and the face builder.
    0x80027004: (0x800272d0, "the lui of the colour cycles' length, before its load as on the US"),
    0x800273bc: (0x80027650, "the one test the invisible face's path reads, of kinds 0 to 4, where the US tests a floor of 2 "
                             "and then the range from 2 and kind 4 apart"),
    0x80027498: (0x80027714, "the crumbling path's test of kind 4, straight after its floor on this disc where the US tests "
                             "kind 2 between"),
    0x800274a0: (0x8002771c, "and its test of kind 6"),
    0x80027568: (0x800277e4, "the crumbling block's model in its set, added before a jump on this disc where the US adds it "
                             "in the delay slot of a call"),
    0x80027638: (0x80027890, "the vanishing block's colour word handed to its record, from v1 on this disc where the US hands "
                             "it from v0"),
    0x80027884: (0x80027ad4, "the low half of a face's colour word, ored into v1 on this disc where the US ors it into v0"),
    0x800278b0: (0x80027b00, "and the word handed to the face's record, from v1"),
    0x800278cc: (0x80027aec, "the fire's selector, 1, loaded into s0 before the call on this disc and copied into s4 after it, "
                             "where the US loads it after the call"),
    # The level's mode.
    0x80027bd4: (0x80027d5c, "the test of the keys' count against nothing in the mode routine, as on the US"),
    0x80027bd8: (0x80027d64, "the 1 the mode word takes with no key, after a clear of a1 this disc puts between"),
    0x80027bdc: (0x80027d68, "and its store off gp"),
    0x80027c38: (0x80027dc4, "the 1 the hidden flag's type is tested against, between the 9 and the 2 as on the US"),
    # The moving platform's tables.
    0x80027e58: (0x80027fd8, "the lui of the first block's table, its low half added in the delay slot of the jump that "
                             "follows on this disc where the US adds it before the jump"),
    # The things' draw.
    0x8003e574: (0x8003e360, "the corkscrew's entry reached off s1, the entries' base on this disc, its position copied from "
                             "24 off the entry where the US keeps the position itself in s5 and copies from nothing off it"),
    0x80027880: (0x80027abc, "the lui of a face's colour word, before the shade's store on this disc where the US has it "
                             "after"),
    # The things' spins.
    0x8003d7c8: (0x8003d814, "the slow star's draw calling the first spin routine, the first of the draw's ten calls of the two "
                             "routines, which fall in the same order on both discs"),
    0x8003de4c: (0x8003dd5c, "the wandering ball's, the third call"),
    0x8003e4d0: (0x8003e2b0, "the corkscrew's, the fifth call and the first of the second routine"),
    0x8003ec88: (0x8003e944, "the wheel's, the seventh"),
    0x8003f390: (0x8003ef0c, "and the fast star's, the ninth"),
    # The vanishing block's and the shadows' light.
    0x80028bd0: (0x80028cc4, "the phase's test against 2 for a block that is not there, into v1 on this disc where the US "
                             "has it in v0"),
    0x80028e6c: (0x80028ec8, "the record's word laid at 12 of the face, through a0 pointing at the face on this disc where "
                             "the US's s1 points at the word itself"),
    # The frame's draw.
    0x8002a4c8: (0x8002aa58, "the low half of the view copy's address, built in v1 on this disc where the US builds it in a2"),
    0x8002a4d4: (0x8002aa6c, "the first word of the copy loaded as it is, at nothing off the sum on this disc where the US "
                             "loads it at its offset off at"),
    # The moving spikes' light.
    0x8002bc74: (0x8002c1b8, "the 1 written as f4 as the spikes start to rise, kept in s2 on this disc and stored from it, "
                             "where the US loads it again into v0 for the store"),
    0x8002bc84: (0x8002c1c0, "and that store, from s2"),
    # The frame's draw's chains.
    0x8002a41c: (0x8002a9c4, "the animator run over the fire's chain, the first of the draw's four calls of it, the chain's "
                             "address low half in the delay slot on this disc where the US has it before the call"),
    0x8002a42c: (0x8002a9d0, "the invisible block's chain, the second"),
    0x8002a450: (0x8002a9ec, "on a level with no key the chain of the faces with no frames, the third"),
    0x8002a460: (0x8002a9f8, "and the swirl's chain, the fourth, before the marked faces' fade as on the US"),
    # The marked faces.
    0x8002dcc0: (0x8002de40, "the marking's test of the cell against -1, no block, as on the US"),
    0x8002dce0: (0x8002de64, "and of the block's mark against the ball's, read into a0 on this disc where the US reads it "
                             "into a1"),
    0x8002dcf8: (0x8002de90, "the mark written to the block, through a1 after the face's index is added on this disc"),
    0x8002de04: (0x8002f41c, "a face's mark read from byte 48 of the face, as on the US"),
    0x8002df3c: (0x8002f748, "the grey a marked face fades from, 160, after the shift as on the US"),
    # The devices' light's routines.
    0x8002e3d8: (0x8002e234, "the first instruction of the routine that makes a light, laid out as the US's"),
    0x8002f1b8: (0x8002f018, "the test of the cell against the value in t2 on this disc, v1 on the US, which passes a face "
                             "only where the lattice holds a block"),
    0x8002f2b4: (0x8002f554, "the slot times 32 in the routine of six instructions that writes a light's colour, after the "
                             "table's address is built on this disc where the US builds it after"),
    0x8002f2c0: (0x8002f560, "and the colour's store, at nothing off the sum in the delay slot of the return"),
    0x8002f2cc: (0x8002f56c, "the slot times 32 in the routine of seven that lets a light go, the same way"),
    # The jump's and the hop's tables.
    0x8002f638: (0x800326c0, "the table's row copied to 72 of the record, through a3 and a0 on this disc where the US copies "
                             "through v1 and s0"),
    0x8002f75c: (0x800327d8, "the 8 rows the hop reads ahead of the jump, added before the state's store on this disc where "
                             "the US adds it after"),
    0x8002f760: (0x800327e8, "the hop's count stored at 404, after the table's pointer at 416 on this disc where the US "
                             "stores it before"),
    0x8002f764: (0x800327e4, "and the pointer's store at 416"),
    # The sunglasses' blink.
    0x8002bf78: (0x8002c418, "the state's test against 2, an on spell, in the blink's routine, whose returns in the middle cut "
                             "it into pieces on this disc's listing"),
    0x8002bf9c: (0x8002c43c, "the timer stepping down in an off spell"),
    0x8002bfa0: (0x8002c440, "and the return while it stays above nothing"),
    0x8002bfbc: (0x8002c45c, "the count stepping down in an off spell, in the path from the state's test against 1 on this disc "
                             "as on the US"),
    0x8002bfc8: (0x8002c470, "the 9 the timer is laid again with as the spell swaps to an on spell"),
    0x8002bfd4: (0x8002c47c, "and the 2 written as the state"),
    0x8002bfe0: (0x8002c490, "and the flag set, in the delay slot of the return on this disc, at nothing off the sum where the "
                             "US stores at its offset off at"),
    0x8002c000: (0x8002c4a8, "the timer stepping down in an on spell"),
    0x8002c004: (0x8002c4ac, "and the return while it stays above nothing"),
    0x8002c020: (0x8002c4c8, "the count stepping down in an on spell"),
    0x8002c030: (0x8002c46c, "the end's clear of the state, in the delay slot of the return the two spells share on this disc"),
    0x8002c034: (0x8002c4d4, "the 9 the timer is laid again with as the spell swaps to an off spell"),
    0x8002c03c: (0x8002c4e8, "and the 1 written as the state"),
    0x8002c048: (0x8002c4ec, "and the flag cleared, at nothing off the sum"),
    # The captivators' light.
    0x8002ce80: (0x8002d170, "the command stored into the primitive the captivator's light goes out as, read off the stack on "
                             "this disc where the US keeps it in t9, the first of the four stores"),
    0x8002ce94: (0x8002d184, "the light's colour, the second, joined from two halves as on the US"),
    0x8002cee8: (0x8002d1bc, "and the base, the fourth, off the stack where the US keeps it in fp"),
    # The ball's roll and spin.
    0x8002f894: (0x8002f9e4, "the test of the jump's count against 2, which keeps the count where it is 2 or more"),
    0x8002f9d8: (0x8002fb30, "rolling, the speed times the heading's first component, as on the US"),
    0x8002fa18: (0x8002fb58, "and the speed kept at 320 for the spin, the second of the nine stores to 320 on both discs"),
    0x8002fa40: (0x8002fb8c, "the flag at 708 held round an edge"),
    0x8002fa48: (0x8002fb94, "and the frame counted at 404"),
    0x8002fb08: (0x8002fc54, "the second ramp's step along the normal, the shift by five after the heading's load as on the US"),
    0x8002fb0c: (0x8002fc58, "and the first of the five instructions of its step along the heading"),
    0x8002fc50: (0x8002fd9c, "the fourth ramp's step along the normal, the shift by three"),
    0x8002fc54: (0x8002fda0, "and the first of the four instructions of its step along the heading"),
    0x8002ffe4: (0x8003012c, "the fall's change along the normal times the heading's first component"),
    0x800300b0: (0x800301f4, "hopping, each row puts the spin's speed at nothing, the ninth and last store to 320 on both discs"),
    0x80030748: (0x80030880, "a falling ball's test of the cell ahead at its level, as on the US"),
    0x80030774: (0x800308ac, "and of the one behind"),
    0x80030b5c: (0x80030c84, "the landing taking the normal's first component into a0 on this disc where the US takes it into "
                             "v1"),
    0x80030b80: (0x80030ca8, "and the point under the centre stored off gp"),
    0x80032508: (0x80032908, "the jump's spin step reading the spin's speed at 320 in its own routine"),
    0x800325d0: (0x800323d8, "and the rest's spin step reading the same word in its own, the two routines standing in the "
                             "other order on this disc"),
    0x800325d8: (0x800323e0, "the first of the two instructions that make the speed's multiple before the turn's call"),
    0x800325e0: (0x800323e8, "the call of the turn about the x axis"),
    0x800325e8: (0x800323f0, "the rise's count read off gp after the call, as on the US"),
    0x800325f0: (0x800323f8, "the draw's test of the rise while any is left"),
    0x80032628: (0x8003242c, "and of the squash"),
    0x80032638: (0x8003243c, "the 10 the squash eases down by a frame"),
    0x8003263c: (0x80032440, "stored back off gp"),
    0x80032680: (0x80032430, "the lui of the breath's reciprocal, in the delay slot of the squash's test on this disc where the "
                             "US has it after the squash's path"),
    0x80032718: (0x80032518, "the squash and the breath added into 702 as one"),
    # The ball's moves.
    0x80030dfc: (0x80032a10, "the move routine's load of the floor ahead at 132, the routine laid out as the US's but for the "
                             "test of 124"),
    0x80030e04: (0x80032a18, "and its test, which answers 1 where the floor is there"),
    0x80030e0c: (0x80032a20, "the load of the cell beside the block under, at 116"),
    0x80030e14: (0x80032a28, "and its test"),
    0x80030e1c: (0x80032a30, "the load of the one at 124"),
    0x80030e2c: (0x80032a48, "the load of what the ball stands on at 356"),
    0x80030e34: (0x80032a50, "its test against ice"),
    0x80030e38: (0x80032a58, "and the answer, in the delay slot of the return on this disc"),
    0x80030e4c: (0x80032a64, "the progress's test against the middle in the next routine, in v0 on this disc where the US has "
                             "it in v1"),
    0x80030e58: (0x80032a70, "the last frame's progress read, into v1 where the US reads it into v0"),
    0x80030e60: (0x80032a78, "and its test against the middle and one"),
    0x80030e78: (0x80032a9c, "the test of the distance against the step in the routine after, as on the US"),
    # The blocks under the ball.
    0x80032efc: (0x800333bc, "the 1 the body landing's axis word is tested against, as on the US"),
    0x80033488: (0x80033888, "the travel's 512 taken off the platform's position, as on the US"),
    0x80033978: (0x80033d5c, "the low half of the platform's own lattice, built in s1 on this disc where the US builds it in t9"),
    # The sunglasses' blink's start.
    0x8002becc: (0x8002f124, "the 1 the sunglasses' flag is set to, in the delay slot of the branch on the argument as on the "
                             "US, in the routine the take's call and the start share"),
    0x8002bed4: (0x8002f134, "the word that gates every update, read into a0 on this disc where the US reads it into v1, after "
                             "the state table's address is built"),
    0x8002bedc: (0x8002f13c, "times four"),
    0x8002bee8: (0x8002f144, "the state stored as an off spell's, at nothing off the sum of the table's address and the index "
                             "where the US stores at its offset off at"),
    0x8002beec: (0x8002f154, "the 21 blinks laid as the count, in v1 on this disc where the US has it in v0"),
    0x8002bef8: (0x8002f158, "and stored"),
    0x8002befc: (0x8002f168, "the 9 frames of a blink laid as the timer, in v1"),
    0x8002bf08: (0x8002f16c, "and stored"),
    0x8002bf14: (0x8002f180, "and the flag cleared, in the delay slot of the return"),
    # The moving platform's way routine.
    0x80033c54: (0x800340dc, "the 1 an axis word is tested against in the way routine, whose returns in the middle cut it in "
                             "three on this disc's listing"),
    0x80033c58: (0x800340e0, "and the test"),
    0x80033c5c: (0x800340e4, "the 4"),
    0x80033c64: (0x800340ec, "the 2 taken off the axis word"),
    0x80033c68: (0x800340f0, "the face's test against 1"),
    0x80033c6c: (0x800340f4, "the 4 it is tested against"),
    0x80033c78: (0x80034108, "the difference tested below 2"),
    0x80033c7c: (0x8003410c, "and the branch where it is not"),
    0x80033c80: (0x80034110, "the 2 taken off the face"),
    0x80033c84: (0x80034114, "and the difference tested below 2"),
    0x80033c88: (0x80034118, "the branch to the answer 1, which this disc keeps in the delay slot of a return of its own where "
                             "the US sets it in this branch's delay slot"),
    0x80033c90: (0x80034120, "the axis word's test against nothing"),
    0x80033c94: (0x80034124, "the 5 it is tested against"),
    0x80033c98: (0x80034128, "and the branch to the answer nothing"),
    0x80033c9c: (0x80034144, "the answer nothing, in the delay slot of the return this disc branches to for it, where the US "
                             "sets it in the branch's delay slot before the shared return"),
    0x80033ca0: (0x80034130, "the face's test against nothing"),
    0x80033ca4: (0x80034134, "the 5 it is tested against"),
    0x80033cac: (0x80034144, "the answer nothing again, the same return"),
    0x80033cb0: (0x80034104, "and the answer 1, in the delay slot of its return"),
    # The fly-in's view.
    0x8003431c: (0x800347a4, "the view routine's read of the parameter, into v0 on this disc where the US reads it into v1"),
    0x80034470: (0x800348f8, "the view's first row, written at nothing off the view's address on this disc where the US writes "
                             "at its offset off at"),
    0x800344a8: (0x80034920, "its down row, at 6"),
    0x800344f8: (0x80034960, "the 1024 the yaw is turned by, before the call on this disc as on the US"),
    0x80034518: (0x80034964, "and the call that turns the view about its down axis"),
    0x8003458c: (0x800349dc, "the middle across negated, in v1 on this disc where the US has it in v0"),
    0x80034598: (0x800349e0, "and written into the view's translation at 20 off its address"),
    0x800345b4: (0x800349f4, "the height below the middle written at 24"),
    # The ending's view.
    0x80034964: (0x80034ed0, "the view's distance written at 28 off its address, whatever the level's mode, as on the US"),
    0x80034968: (0x80034ecc, "and the branch past the arcade's swing, before the store on this disc where the US has it after"),
    0x80034a38: (0x80034f9c, "the further swing written over the distance"),
    0x8002bf38: (0x8002f19c, "the take's call clearing the blink's state, at nothing off the sum as the start's stores are"),
    0x8002bf44: (0x8002f1b4, "and setting the flag, from a 1 loaded again on this disc where the US keeps the 1 from the "
                             "branch's delay slot, in the delay slot of the return"),
    0x800344f0: (0x8003494c, "its ahead row, at 12"),
    # The body's turn.
    0x80034acc: (0x8003502c, "the heading turned round, as on the US"),
    0x80034ad0: (0x80035030, "into the side at 20"),
    0x80034b94: (0x800350f8, "the heading put into the side, through t0 on this disc where the US copies through v0"),
    0x80034bf8: (0x80035164, "the count stepping down a frame, in v0 on this disc where the US has it in a0"),
    0x80034bfc: (0x80035154, "the yaw growing by the step, before the count's step on this disc where the US has it after"),
    0x80034c04: (0x80035158, "and written at 450"),
    0x80034d24: (0x80035284, "the heading turned round for an edge"),
    0x80034d28: (0x80035288, "into the normal at 28"),
    0x80034dcc: (0x80035328, "the pitch growing by the step at 444, before the count's step on this disc where the US has it "
                             "after"),
    0x80034de0: (0x80035340, "the count's test as a ramp ends, before the mode's load on this disc where the US has it after"),
    0x80034e60: (0x800353c4, "the camera's first row written at nothing off the view's address on this disc, where the US "
                             "writes at its offset off at"),
    0x80034efc: (0x80035430, "and its third row at 12"),
    0x800350b0: (0x800355d4, "the extra pitch's count stored off gp, after the step is added as a register on this disc"),
    0x800350b4: (0x800355d8, "and tested against 33"),
    # The loader.
    0x800355c4: (0x80035a50, "the 1 the loader marks a slot to be taken with, kept in s4 as on the US"),
    0x800355c8: (0x80035a54, "the 386 a thing stands off its block's centre, kept in fp on this disc where the US keeps it in "
                             "s7"),
    0x80035620: (0x80035abc, "every slot marked as not to be taken, at 4 of the slot's entry off s1 on this disc where the US "
                             "stores at its absolute address"),
    0x80035690: (0x80035b20, "and then a fruit as to be taken, the same way"),
    0x8003579c: (0x80035c14, "a coin"),
    0x800357d0: (0x80035c38, "type 42"),
    0x80035804: (0x80035c5c, "an hourglass"),
    0x80035830: (0x80035c78, "and a gem"),
    0x800358dc: (0x80035d14, "a key, a pill or the sunglasses"),
    # The Simon rooms' reset and start.
    0x80035ce4: (0x8003b920, "the sequence filled with no move, in the reset laid out as the US's"),
    0x80035d40: (0x80036134, "the round read off gp into v1 at the room's start, after the count on this disc where the US "
                             "reads it before"),
    0x80035d44: (0x80036124, "the 10 frames the start waits, loaded before the round's read on this disc"),
    0x80035d4c: (0x80036128, "and written into the countdown at 370, through the record's address built in v1"),
    0x80035d50: (0x8003612c, "the count read off gp into v0, before the round on this disc"),
    0x80035d6c: (0x80036130, "the index at 490 put at nothing, through v1"),
    0x80035d70: (0x80036150, "the round stepping on by one, in v1, after the count's 2 on this disc where the US has it "
                             "before"),
    0x80035d74: (0x8003614c, "and the count growing by 2, in v0"),
    # The level's start.
    0x80035de8: (0x800361c0, "the sunglasses' word put at -1 as a level starts, at 544 off the record in s0 on this disc "
                             "where the US stores at its absolute address"),
    0x80035df0: (0x800361c4, "the lethargy pill's, at 548"),
    0x80035df8: (0x800361c8, "the invincibility pill's, at 556"),
    0x80035e00: (0x800361cc, "and the bouncy pill's, at 552"),
    0x80035e74: (0x8003620c, "the countdown at 370 set as a level starts, off s0 the same way"),
    0x80035e7c: (0x80036210, "and the count at 372 put at nothing"),
    0x80035ea4: (0x80036224, "the jump's count at 412 put at nothing"),
    0x80035eac: (0x80036228, "and the landed flag at 494"),
    0x800361c0: (0x800364f4, "the normal's component read at 28 off the record in s0 on this disc, where the US reads it at its "
                             "absolute address"),
    0x800362bc: (0x800365c8, "the start's call that lays the fly-in's curve, the record's address low half in its delay slot on "
                             "this disc where the US has it before the call"),
    0x800343bc: (0x800347e4, "the 15 the fly-in's curve is shifted by, in the delay slot of the mode's test at the top of the "
                             "view routine on this disc where the US loads it before the curve's call"),
    0x80034b10: (0x80035048, "the body's mark of 3 for a turn right, loaded before the side is copied on this disc where the US "
                             "loads it after"),
    0x800355cc: (0x80035a80, "the 25600 a thing is taken within, squared, kept in s7 on this disc where the US keeps it in s6"),
    0x80034690: (0x80034acc, "the free camera's read of the word at 374, off s1 on this disc where the US reads it off a0"),
    0x80034bc8: (0x800350e0, "and the mark of 4 for a turn left, loaded before the side is copied the same way"),
    # The ball's routine.
    0x80036334: (0x8003664c, "the Simon rooms' verdict tested against 1, done, the verdict in a1 and the 1 in a0 on this disc "
                             "where the US has them in a0 and v0"),
    0x80036360: (0x80036674, "the 25 frames the room waits on the sequence done, loaded after the state's test on this disc "
                             "where the US loads it before"),
    0x80036364: (0x800367d0, "the turn word read as the countdown runs out on this disc, in the arcade's mode with the "
                             "outcome done, where the US reads it as the verdict is given"),
    0x8003636c: (0x80036678, "the verdict written as the ending, at 540 off the record in a0 on this disc where the US stores "
                             "at its absolute address"),
    0x80036394: (0x800367f0, "and the turn passed to the other player, stored off gp as the countdown runs out"),
    0x8003639c: (0x80036688, "the verdict's 2, a wrong move"),
    0x800363a0: (0x8003668c, "and the test against it"),
    0x800363cc: (0x800366cc, "the wrong move's ending, -8, loaded after a sound call's arguments on this disc"),
    0x800363d4: (0x800366d0, "and written at 540 off the record in t0"),
    0x800363d8: (0x800366d4, "the 25 frames the room waits on a wrong move"),
    0x800363e0: (0x800366dc, "written into the countdown at 370, in the delay slot of the sound call this disc makes"),
    0x800363f0: (0x800366fc, "the countdown at 370 read, off the record in a0 on this disc where the US reads it through a "
                             "pointer to the word"),
    0x800363f8: (0x80036704, "and tested against nothing"),
    0x80036404: (0x80036714, "stepped down a frame"),
    0x80036410: (0x80036710, "the fire's ending, -4, loaded before the step's store on this disc where the US loads it after"),
    0x80036418: (0x80036718, "the forward request cleared at 96 off the record"),
    0x80036420: (0x8003671c, "the turn's request at 92"),
    0x80036428: (0x80036724, "and the jump's at 100, in the delay slot of the fire's test on this disc"),
    0x8003642c: (0x80036720, "the test of the ending against the fire's, the ending in a1 on this disc where the US has it in "
                             "a0"),
    0x80036440: (0x80036730, "the 210 the word at 704 swells by"),
    0x80036448: (0x80036734, "and the word stored"),
    0x80036450: (0x8003673c, "the test of the ending against the spikes'"),
    0x80036460: (0x80036750, "and of the wait against 1"),
    0x8003646c: (0x8003675c, "the ending written into the outcome word, from a1"),
    0x80036478: (0x80036768, "the acid's ending, -6"),
    0x8003647c: (0x8003676c, "and the test against it"),
    0x80036490: (0x8003677c, "the 300 the acid's word at 524 grows by a frame"),
    0x80036498: (0x80036780, "and the word stored"),
    0x800364a8: (0x8003678c, "the countdown's test as it runs out"),
    0x800364b4: (0x80036798, "the view word read for the result's index"),
    0x800364c8: (0x800367b0, "and the ending copied into the result, at nothing off the sum on this disc"),
    0x800364dc: (0x80036804, "the count at 372 tested against nothing, read off the record in a0 on this disc where the US "
                             "reads it through a pointer to the word"),
    0x800364f4: (0x80036814, "the roll asked while it runs, at 96"),
    0x800364fc: (0x80036818, "the turn dropped at 92"),
    0x80036504: (0x8003681c, "and the jump at 100"),
    0x80036538: (0x80036848, "the word at 356 tested before the input routine is called, as on the US"),
    0x8003659c: (0x800368a4, "the bouncy pill's word tested at its hold or more"),
    0x800365a0: (0x800368a8, "the rolling state's 2"),
    0x800365a8: (0x800368ac, "and the state at 408 read, off the record in a0 on this disc"),
    0x800365bc: (0x800368bc, "the jump dropped at 100"),
    0x800365c4: (0x800368c0, "and the roll at 96"),
    0x8003670c: (0x80036a00, "the hazards' call, the record's address in its delay slot on this disc"),
    0x80036754: (0x80036a48, "the pad shaken"),
    0x80036760: (0x80036a58, "the invincibility word read at 556 off the record in s0 on this disc where the US reads it at its "
                             "absolute address"),
    0x80036774: (0x80036a6c, "the first of the ball's position words passed to the hit test, read at 60 off the record, "
                             "after the second on this disc"),
    0x8003677c: (0x80036a68, "the second at 62, read first"),
    0x800367b8: (0x80036a9c, "the ending tested against the captured ending, in s1 on this disc where the US keeps it in s0"),
    0x800367ec: (0x80036acc, "the ball frozen at 706"),
    0x800367f8: (0x80036ad4, "the countdown set at 370"),
    0x80036804: (0x80036adc, "the speed dropped at 312"),
    0x8003680c: (0x80036ae0, "and the spin's speed at 320"),
    0x80036814: (0x80036ae4, "the ending set at 540, from s1"),
    0x8003681c: (0x80036ae8, "and the ball marked dying at 512"),
    0x80036854: (0x80036b18, "the progress read at 336 off the record in s0"),
    0x80036884: (0x80036b50, "the ball put on the middle, the word at 492 reached through a lui on this disc where the US "
                             "reaches it off s1"),
    0x800368ac: (0x80036b74, "the live word at 460 read off the record in s0"),
    0x800368f0: (0x80036bb4, "and the position's first word at 60"),
    # The ending's draw.
    0x800369ac: (0x80036c54, "the draw's call that draws the ball, the record's address in its delay slot on this disc"),
    0x800369b4: (0x80036c5c, "and the call that draws the things on the blocks"),
    0x80036a18: (0x80036c90, "the 37 the ball is lost past, as on the US"),
    0x80036330: (0x80036610, "the 1 the Simon rooms' verdict is tested against, which this disc keeps in a0 from the mode's "
                             "test at the top of the routine where the US loads it again into v0"),
    0x800366bc: (0x800369b4, "the input routine's call, after the position's sums as on the US"),
    0x80036784: (0x80036a7c, "and the third position word at 64, read after the fourth on this disc"),
    0x80037618: (0x80037de8, "the row's index sign-extended into t0 on this disc where the US extends it into t2, after the "
                             "cell's index"),
    0x8003764c: (0x80037dc8, "a word a cell, the shift by 14 on a0 on this disc where the US shifts a1, before the indexes "
                             "on this disc where the US has it after"),
    # The ending's guard.
    0x80036aac: (0x8003b958, "the 1 the guard is set to, in the routine of twelve instructions that runs the ending's view, "
                             "laid out as the US's"),
    0x80036abc: (0x8003b964, "stored off gp"),
    0x80036ac0: (0x8003b968, "and the ending's view run, the record's address in the call's delay slot on this disc"),
    0x800366cc: (0x800369c0, "the captured ending, -5, loaded after the input routine's call as on the US"),
    0x800366d0: (0x800369c4, "and the ending tested against it, past which the captivators stand still"),
    # The moving platform's way routine.
    0x80038038: (0x800386cc, "the way routine's test of the top face, as on the US"),
    0x800380ac: (0x80038738, "the low half of the first way's address, built in t4 on this disc where the US builds it in a1"),
    0x80038100: (0x8003878c, "and the test for a facing of 3, against v0 on this disc where the US tests against a3"),
    # The things' draw walk and the boost button.
    0x80039b74: (0x8003a184, "the boost button's reach measured from the ball's position read at 60 off the record in s3 on "
                             "this disc, where the US reads it at its absolute address"),
    # The teleporter's send.
    0x8003a400: (0x8003a9d8, "the device marked in the word at 492, from a0 on this disc where the US stores from v1"),
    0x8003a634: (0x8003ac10, "the 3 the HUD effect of a teleport is started as, loaded after the wait on this disc where the US "
                             "loads it before"),
    0x8003a638: (0x8003ac00, "the 15 frames the send waits"),
    0x8003a63c: (0x8003ac08, "stored off gp in a word of its own"),
    0x8003a680: (0x8003ac54, "the test of the count against -1 until it has passed nothing, the count in s1 on this disc where "
                             "the US keeps it in s2"),
    0x8003a6a8: (0x8003ac6c, "the 5 the device is marked with as the send ends, loaded once into a0 for the sound call and "
                             "copied into v0 on this disc where the US loads it again"),
    0x8003a710: (0x8003ace8, "the slot the ball stands on written at 348, after the store at 352 on this disc where the US "
                             "has it before"),
    0x8003a7a0: (0x8003ad74, "the side's first halfword read at 20 off the record in v1 on this disc where the US reads it at "
                             "its absolute address"),
    0x8003a83c: (0x8003add8, "the matrix's last halfword written at 228 off the record"),
    0x8003a860: (0x8003adf0, "and its last store, at 226"),
    # The contact.
    0x80038598: (0x80038b88, "a thing's mark read at 4 off its entry on this disc where the US reads it at its absolute "
                             "address"),
    0x800385b4: (0x80038b9c, "and its position at 40, which the measure from the ball's centre is taken to"),
    0x800386e0: (0x80038cb0, "the brown form's test of the invincibility, as on the US"),
    0x800386f8: (0x80038cd0, "the -5 the brown form ends the level with, loaded after the ball is frozen on this disc where "
                             "the US loads it before"),
    0x80038700: (0x80038cd4, "and written at 540 off the record in s1"),
    0x80038724: (0x80038cdc, "the countdown set at 370"),
    0x80038730: (0x80038cf4, "and the brown kept, 1 loaded again into v0 on this disc where the US keeps it in s2"),
    0x800387cc: (0x80038d94, "the 360 frames the lethargy pill lasts, after the 1 the screen's effect is called with on this "
                             "disc where the US loads the 1 after the store"),
    0x800387d4: (0x80038d9c, "written at 548 off the record, in the delay slot of the effect's call on this disc"),
    0x800387d8: (0x80038d98, "and the call that starts the screen's effect"),
    0x8003884c: (0x80038e10, "the 840 frames the invincibility pill lasts, after the sound call's last argument on this disc "
                             "where the US loads it before"),
    0x80038854: (0x80038e18, "written at 556 off the record, in the delay slot of the sound call on this disc"),
    0x80038868: (0x80038e24, "type 33's case reading the first of the four words the burst takes, as the other cases do"),
    0x800388b0: (0x80038e70, "the 840 frames the bouncy pill lasts, the same way"),
    0x800388b8: (0x80038e78, "written at 552 off the record"),
    0x8003892c: (0x80038ee0, "and the sunglasses' 840 at 544"),
    0x80038bbc: (0x800391d0, "the tier's test against 1, the second, against a 1 loaded into v0 on this disc where the US "
                             "keeps it in s2"),
    0x80038be4: (0x800391f8, "and against 2, the third least, against a 2 loaded into v0 where the US keeps it in s1"),
    0x800384b0: (0x800391cc, "the 1 a thing opens at, loaded into v0 at the tier's test on this disc where the US keeps it in "
                             "s2 from the routine's start"),
    0x800384bc: (0x800391f4, "and the 2 of the third tier, loaded at its test where the US keeps it in s1"),
    0x80038c0c: (0x80039220, "the game's mode word read for a fruit's HUD effect, into v1 on this disc"),
    0x80038c14: (0x80039228, "and tested against a 2 loaded into v0, where the US tests against s1"),
    0x80039070: (0x800396bc, "the ticks the hourglass takes the clock from, 7199 on this disc"),
    0x80039074: (0x800396c0, "and the clock taken from them"),
    # The moving platform's face routine.
    0x80037fa4: (0x8003b9ac, "the first halfword's test against 1 in the face routine, whose returns in the middle cut it into "
                             "pieces on this disc's listing, against a0 where the US tests against v1"),
    0x80037fb0: (0x8003b9a8, "the 1 the top face answers, which this disc copies from a0 in the delay slot of its return where "
                             "the US loads it there"),
    # The things' draw walk.
    0x80039d24: (0x8003a318, "the turned offset added to the translation, as on the US"),
    0x80039d30: (0x8003a31c, "and the point kept at 40 of the entry as the thing's position, through a3 on this disc where the "
                             "US keeps the entry in v1"),
    # The teleporter's frame matrix.
    0x8003a79c: (0x8003ad0c, "the lui of the record's address, built once into v1 before the copies on this disc and the "
                             "matrix laid off it, where the US builds the address at each store"),
    0x8003a7c8: (0x8003ad88, "the matrix's first store, at 212 off the record"),
    # The contact's constants and the hourglass.
    0x800384c8: (0x80038a88, "the 10000 the nearest thing is measured from, loaded before the record's position is copied on "
                             "this disc where the US loads it after the constants"),
    0x8003907c: (0x800396a0, "the lui of the clock's point for the hourglass's HUD effect, before the clock's load on this disc "
                             "where the US has it after the take"),
    0x80039080: (0x800396a4, "and the point's low half"),
    0x80039084: (0x800396d0, "the effect given no light, in the delay slot of its call on this disc"),
    0x80039094: (0x800396c8, "the clock written back less the count, the one store of the clock this disc's hourglass makes"),
    0x800390cc: (0x8003969c, "the 1 the hourglass's HUD effect is started as, loaded before the clock's point on this disc where "
                             "the US loads it in the call's delay slot"),
    # The pad.
    0x80036bb4: (0x80036e24, "the bouncy pill's word tested not negative, as on the US"),
    0x80036c2c: (0x80036ea0, "the live word at 460 tested, past which nothing of the pad is read"),
    0x80036c70: (0x80036fbc, "the 1 a Left asks as its turn, in the delay slot of the branch on a new press on this disc where "
                             "the US loads it into a0 before the latch's test"),
    0x80036c84: (0x80036f94, "the latched turn asked as the turn ends, from the word at 1112 off gp this disc sets from the "
                             "latches at 360 and 362, where the US asks it from the latch at 360"),
    0x80036cb0: (0x80036fb4, "and Left's bit of it, 128, with no turn running"),
    0x80036cc8: (0x80036fd4, "which asks a turn of 1"),
    0x80036cd8: (0x80036fcc, "Right's bit, 32"),
    0x80036d18: (0x80036ef8, "a Left pressed while a turn runs latched at 360"),
    0x80036d38: (0x80036f1c, "and a Right at 362"),
    0x80036d74: (0x80037064, "Cross's latch set in the Simon rooms, the third of the four face buttons this disc latches on "
                             "where the US latches on Cross alone"),
    0x80036d80: (0x80037080, "the Up latch tested while it stands"),
    0x80036da0: (0x800370a0, "the latch's count stepping on by one"),
    0x80036da4: (0x800370a4, "and stored off gp"),
    0x80036e38: (0x800371e0, "Cross's bit of the pad, 16384, asking a jump, the third of the four face buttons this disc tests "
                             "for a jump where the US tests Cross alone"),
    0x80036e8c: (0x80037288, "the idle count's test while no turn runs"),
    0x80036e94: (0x80037294, "the count read into v1 on this disc where the US reads it into v0, which this disc also holds "
                             "under 1000"),
    0x80036e9c: (0x800372a0, "and stepped on by one"),
    0x80036ea0: (0x800372a4, "a frame"),
    0x80036ec8: (0x80037394, "Cross's bit of a new press in the Simon rooms, 16384, the third of the four face buttons this disc "
                             "latches on where the US latches on Cross alone"),
    0x80036ed4: (0x800373a4, "and the latch set from it"),
    0x80036ee0: (0x800373bc, "the Up latch tested as set"),
    0x80036f6c: (0x80037448, "the test of the turn's count before the sequence is read"),
    0x80036f74: (0x80037450, "the index at 490 read, into v1 on this disc where the US reads it into v0"),
    0x80036f80: (0x8003744c, "the lui of the sequence, in the delay slot of the branch on this disc"),
    0x80036fdc: (0x8003758c, "Left's bit of the pad held in the Simon rooms, 128"),
    0x80036fe0: (0x80037590, "and the branch where it is not held"),
    0x80036fe8: (0x80037598, "the turn asked, from v1 on this disc where the US asks it from v0"),
    0x80036ffc: (0x800375ac, "and the branch on Right's bit"),
    0x800370c4: (0x800376d4, "the move's own bit added into the halfword off gp"),
    0x800370d0: (0x800376e0, "the roll's request tested, against a1 on this disc where the US tests against v1"),
    0x800370e4: (0x800376f4, "its bit added"),
    0x800370f0: (0x80037700, "and the jump's request tested"),
    0x8003710c: (0x80037704, "the lui of the sequence the move is held to, in the delay slot of the jump's test on this disc "
                             "where the US has it after"),
    # The hazards.
    0x8003aa80: (0x8003b004, "the block under the ball tested against the kind read off gp, as on the US"),
    0x8003aac0: (0x8003b040, "and the turn's request dropped at 92 off the record in s1"),
    0x8003abf4: (0x8003b110, "the heat tested past its limit"),
    0x8003aef8: (0x8003b428, "the exit's ending at a landing, 1, loaded after the result's address is built on this disc where "
                             "the US loads it before"),
    0x8003af14: (0x8003b430, "and written into the result, at nothing off the sum"),
    0x8003af6c: (0x8003b49c, "the hidden exit's ending at a landing, 3, the same way"),
    0x8003af88: (0x8003b4a4, "and written into the result"),
    0x8003b030: (0x8003b544, "the spikes' type, 12"),
    0x8003b034: (0x8003b548, "and the test against it"),
    0x8003b048: (0x8003b568, "the spikes' ending, -1, loaded after the invincibility word on this disc where the US loads it "
                             "before"),
    0x8003b058: (0x8003b56c, "and the word tested against it, in s2 on this disc where the US keeps it in s1"),
    0x8003b09c: (0x8003b5a8, "the ball frozen at 706 off the record in s0"),
    0x8003b0a8: (0x8003b5b0, "the countdown set at 370"),
    0x8003b0c4: (0x8003b5c0, "the ending written at 540, from s2"),
    0x8003b0cc: (0x8003b5c4, "and the ball marked dying at 512"),
    0x8003b0fc: (0x8003b5f4, "the moving spikes' value tested against the deadly 1, in s2 on this disc where the US keeps it "
                             "in s1"),
    0x8003b110: (0x8003b608, "and the invincibility word against -1, in s3 where the US keeps it in s2"),
    0x8003b168: (0x8003b650, "the 10 frames a landing on the spikes waits, loaded before the ball is frozen on this disc where "
                             "the US loads it after"),
    0x8003b180: (0x8003b660, "the ending written at 540 from the invincibility word in s3"),
    0x8003b188: (0x8003b664, "and the countdown at 370"),
    0x8003b208: (0x8003b6c4, "the same ending written for a roll onto the spikes"),
    0x8003b228: (0x8003b6dc, "the boost button's type, 10"),
    0x8003b22c: (0x8003b6e0, "and the test against it"),
    0x8003b244: (0x8003b6dc, "and the 10 frames the button writes at 372, which this disc stores from v1 after the type's "
                             "test found it 10 where the US loads the 10 again"),
    0x8003b248: (0x8003b6fc, "the count written at 372 from the roll's gate, from v1"),
    0x8003b2d0: (0x8003b784, "the sunglasses' word found at nothing, read at 544 off the record"),
    0x8003b33c: (0x8003b7dc, "the bouncy pill's word put back to -1 at 552"),
    0x8003b358: (0x8003b7f0, "and the lethargy pill's at nothing at 548"),
    0x8003b36c: (0x8003b800, "the lethargy pill's word found at nothing"),
    # The level's clock.
    0x8003b490: (0x8003bae8, "the game's mode word read in the clock's routine, laid out as the US's"),
    0x8003b494: (0x8003baec, "the 1 it is tested against"),
    0x8003b498: (0x8003baf0, "and the test"),
    0x8003b4b4: (0x8003bb0c, "the clock written back"),
    0x8003b4b8: (0x8003bb10, "and tested above nothing"),
    0x8003b4bc: (0x8003bb18, "the time's ending, -2, after a lui this disc puts between"),
    0x8003b4c4: (0x8003bb20, "written into the outcome word"),
    0x8003ab44: (0x8003b068, "the fire's kind, 1, after the reload of the word for what the ball stands on, which this disc "
                             "runs to straight from the call before the US's fast star case"),
    0x8003ab48: (0x8003b06c, "and the word tested against it"),
    0x8003b2f8: (0x8003b7a8, "the invincibility word read at 556 off the record in s0 as the pills run down, the second of "
                             "the four words on both discs"),
    0x8003b300: (0x8003b7b0, "and tested below nothing"),
    0x8003b304: (0x8003b7b4, "the step of -1 it falls by"),
    0x8003b30c: (0x8003b7b8, "stored back at 556"),
    0x8003b314: (0x8003b7bc, "and read again"),
    0x8003b31c: (0x8003b7c4, "for the test below nothing that skips the other pills' words"),
    # The air test.
    0x8003b55c: (0x8003bc34, "the arrow's flag cleared on the ground, past the return this disc's listing cuts the air test "
                             "at"),
    # The input routine's tail.
    0x80037344: (0x800379f0, "the input routine's tail testing the floor ahead at 132"),
    0x80037364: (0x80037a10, "and the cell at 124, on the other side"),
    0x80037384: (0x80037a30, "and the jump's request at 100"),
    # The moving platform's face routine's answers.
    0x80037fbc: (0x8003b9c4, "the 4 the -x face answers, in the delay slot of the test against -1"),
    0x80037fd4: (0x8003b9dc, "the 2 the +y face answers, in the delay slot of a return of its own on this disc where the US "
                             "has it in a jump's"),
    0x80037fdc: (0x8003b9e4, "the 3 the -y face answers"),
    0x80037ff4: (0x8003b9f4, "and the 5 the +z face answers, the underside"),
    # The things' update.
    0x8003c280: (0x8003c710, "the corkscrew's angle stepped, written at 174 off the entry in a3 on this disc where the US writes "
                             "at its absolute address"),
    0x8003c344: (0x8003c7b0, "and wrapped, written the same way through a0"),
    0x8003c3f4: (0x8003c848, "the position written at 24 off the entry in a2"),
    0x8003c49c: (0x8003c8d0, "on the second axis at 26"),
    0x8003c520: (0x8003c940, "the home's third halfword read at 36 off the entry in a1"),
    0x8003c534: (0x8003c94c, "and the position written at 28"),
    # The captivators' hit test.
    0x8003d588: (0x8003d6bc, "the wandering ball's type, 53, loaded before the comparison on this disc where the US loads it "
                             "at the routine's top into t1"),
    0x8003d58c: (0x8003d6c8, "and the square of the longer reach, in the delay slot of the type's test on this disc where the US "
                             "loads it at the top into t0"),
    0x8003d5bc: (0x8003d66c, "the hit test reading a captivator's position at 24 off its entry in a0, where the US reads it at "
                             "its absolute address"),
    0x8003d5cc: (0x8003d67c, "the ball's second position word read off the stack, after the first square on this disc"),
    0x8003d5d8: (0x8003d680, "and the captivator's second position at 26"),
    0x8003d628: (0x8003d6c4, "the type tested against the wandering ball's, in v0 on this disc where the US keeps it in t1"),
    # The level loop and the banking.
    0x80040b28: (0x80040650, "the 1026 words the frame's table is cleared by, loaded before the frame's index on this disc where "
                             "the US loads it after"),
    0x8004174c: (0x80041560, "the level loop's load of the level's mode, which it tests against s2 and then against 2, into v1 "
                             "on this disc where the US loads it into v0 and tests it against s2 and s3"),
    0x80041b6c: (0x80041a80, "the player's turn taken modulo two, into v0 on this disc where the US takes it into a0"),
    0x80041b8c: (0x80041aa0, "and the count stored, a call this disc puts between it and the banking's"),
    0x80041b98: (0x80041ab8, "the next-level routine called on an ending's first pass, after the banking as on the US"),
    0x80041f3c: (0x800421a8, "the banking's test of the game's mode word, as on the US"),
    0x80042024: (0x80042298, "the pickups banked last read into a1 on this disc where the US reads them into v0"),
    0x80042028: (0x8004229c, "and the pickups' word into v1, after the score takes the bonus word on this disc"),
    0x80042030: (0x800422a8, "and the two tested where they differ"),
    0x80042038: (0x800422b8, "the fruit's halfword counted"),
    0x80042040: (0x800422c0, "one on"),
    0x80042050: (0x800422d0, "and the pickups' word banked, from v0 on this disc where the US banks it from a0"),
    0x80042054: (0x800422a0, "the bonus word added into the score, in a0 on this disc where the US adds in v0, before the test "
                             "of the pickups where the US adds after"),
    0x80042058: (0x800422a4, "and the score stored"),
    0x8003c3e0: (0x8003c838, "the corkscrew's home read at 32 off its entry in a2, where the US reads it at its absolute "
                             "address"),
    0x8003c488: (0x8003c8c0, "and on the second axis at 34"),
    0x8003cb14: (0x8003ce40, "the 77 frames the wandering ball shakes for, after the count is stepped and stored on this disc "
                             "where the US tests the count as read"),
    0x8003cd78: (0x8003d030, "the 76 frames the wheel's turn takes, the first of three tests of it on this disc, one a way of "
                             "turning, where the US tests once before the ways part"),
    0x8003cda0: (0x8003d044, "the -13 the wheel turns by a frame one way"),
    0x8003ce30: (0x8003d098, "the 13 the other"),
    0x8003cec0: (0x8003d0ec, "and the 26 about"),
    0x8003d5f4: (0x8003d694, "and the captivator's third position at 28"),
    0x8003d5f8: (0x8003d698, "the ball's third position word read off the stack"),
    0x8003d644: (0x8003d6e0, "the square of the longer reach tested against the distance, in a1 on this disc where the US has "
                             "the distance in v0 and the square in t0, past the return this disc's listing cuts the test at"),
    0x8003d648: (0x8003d6e4, "and the branch within the longer"),
    0x80041ee0: (0x8004214c, "the outcome read off gp as the level loop returns, the second of two loads on this disc, the "
                             "first in a test of a word this disc puts between"),
    # The next-level routine.
    0x8004245c: (0x80042704, "the lui of the level's mode word at the top of the next-level routine"),
    0x80042460: (0x80042708, "and its load"),
    0x80042468: (0x80042710, "the branch past the numbering while the word is set"),
    0x80042470: (0x80042718, "the finals flag read off gp"),
    0x80042478: (0x80042720, "and tested, which parts the two ways of numbering"),
    0x80042568: (0x80042810, "the bank cleared as the slot is taken"),
    0x8004256c: (0x80042814, "the slot after kept off gp"),
    0x80042570: (0x80042818, "and tested against 15, the slot after the last ordinary level"),
    0x80042578: (0x80042820, "the chain word read off gp"),
    0x80042580: (0x80042828, "and tested clear"),
    0x8004258c: (0x80042834, "the pack's count read"),
    0x80042594: (0x8004283c, "and kept as the slot"),
    0x80042598: (0x8004281c, "the lui of the third's reciprocal, in the delay slot of the slot's test on this disc where the "
                             "US has it before the count's path"),
    0x800425a0: (0x80042844, "and its low half, after the slot's load as on the US"),
    0x8004259c: (0x80042840, "the slot taken"),
    0x800425a4: (0x80042848, "and the level finished counted off it"),
    0x80042638: (0x800428dc, "the level's mode tested at nothing in the Simon rooms' branch"),
    0x80042640: (0x800428e4, "the outcome read"),
    0x80042648: (0x800428ec, "and tested below nothing"),
    0x80042654: (0x800428f8, "the starter word read, into t0 on this disc where the US reads it into a1"),
    0x8004265c: (0x80042900, "and tested at 1"),
    0x80042660: (0x80042970, "the lui of the fifteenth's reciprocal, the first of two the branch holds on this disc"),
    0x80042668: (0x80042978, "its low half"),
    0x80042690: (0x8004298c, "and the shift by three after the product's high word is added, the first of two on this disc"),
    0x80042664: (0x80042974, "the furthest level reached read off gp, between the reciprocal's halves as on the US"),
    0x800428d0: (0x80042cd0, "the level within the pack tested against the pack's count"),
    0x800428d4: (0x80042cd4, "and the return while it is below, before a test of the score's sign this disc puts between"),
    0x800428dc: (0x80042cec, "the chain word read"),
    0x800428e4: (0x80042cf4, "and tested at 1, which would start the next world at its last slot"),
    0x8004290c: (0x80042d18, "the test of the chain word against 2"),
    0x80042910: (0x80042d1c, "and the 15 the slot is started at for a level with no key"),
    0x80042970: (0x80042d7c, "the world word stored as a world ends"),
    0x80042974: (0x80042d80, "the 1 the next-level routine sets"),
    0x80042978: (0x80042d84, "and stores as the reload word"),
    0x800428f8: (0x80042d08, "the chain word tested at nothing, after its test below 2 as on the US"),
    # The Simon rooms' branch of the next-level routine.
    0x80042670: (0x800429c8, "the world word read before it is stepped, into v0 on this disc where the US reads it into v1, in "
                             "a loop this disc runs over the worlds where the US steps once"),
    0x80042678: (0x800429d4, "and stepped on by one"),
    0x8004267c: (0x800429d8, "and stored"),
    0x800426a0: (0x800429f4, "the branch where the world is still short of the worlds reached, the test's answer in a0 on this "
                             "disc where the US has it in v0"),
    0x800426a8: (0x800429fc, "and the world put back to the first where it is not"),
    0x800426ac: (0x80042ac8, "the reload word set to 1, from v0 on this disc where the US stores the starter word's 1 from a1, "
                             "after a loop over the slots this disc runs"),
    0x800426b8: (0x80042aa0, "the 10 the Simon rooms count, bounding the slot's word on this disc where the US's bounds the "
                             "world word"),
    # The Simon menus.
    0x800496ac: (0x800481c4, "the menu that starts the mode setting the mode word, as on the US"),
    0x800496b8: (0x800481d8, "and the starter word alike, off gp"),
    0x8004ad5c: (0x800499c0, "the menu's test of a routine's answer against 1 on this disc, where the US tests the slot word "
                             "against nothing"),
    0x8004ad88: (0x800499ec, "the gate the menu asks the second player's points against, 3 on this disc"),
    0x8004ad8c: (0x800499f0, "and the branch while they are under it"),
    # The chain word's clears.
    0x800482e4: (0x8004bf28, "the chain word cleared by the routine the loop calls, the first of the clears on both discs, in "
                             "a routine laid out as the US's"),
    0x8003cdac: (0x8003d04c, "the wheel's angle stored at 60 off its entry, in the delay slot of the jump to the routine's "
                             "tail on this disc, where the US stores at its absolute address"),
    # The rotation routines.
    0x80060fb4: (0x8006419c, "the sine taken as it is for a positive angle, at the same place of the rotation about x, the "
                             "copy the spin calls on this disc as on the US"),
    0x80060fbc: (0x800641a4, "the load of the matrix's second row"),
    0x80060fc0: (0x800641a8, "and of its third"),
    0x80060ff8: (0x800641e0, "the store of the mixed second row"),
    0x80061088: (0x80064270, "and of the mixed third"),
    0x8006132c: (0x80064514, "the first subtraction of the rotation about z, the copy laid out as the US's at the same "
                             "distance from the rotation about x"),
    0x800613bc: (0x800645a4, "and its first addition"),
    # The HUD and the end screen's words.
    0x80014d4c: (0x80015354, "the scale across read for the HUD, into a3 on this disc where the US reads it into t3"),
    0x80014e44: (0x8001541c, "the pitch shifted down by 4, as on the US"),
    0x80015724: (0x80015c44, "the game's mode word read as the words routine opens, into v0 on this disc where the US reads it "
                             "into v1"),
    0x800157e4: (0x80015d34, "the 18 of Game Over's pair, after the test of the word at 268 off gp as on the US"),
    0x800157f0: (0x80015d40, "the 1 of the Simon rooms' mode, before the mode's test"),
    0x80015acc: (0x8001601c, "the call that draws both images of the pair, the second of the three library calls as on the US"),
    0x80042674: (0x80042a74, "the slot read, in a loop over the slots this disc runs after the world's where the US steps "
                             "the slot with the world"),
    0x80042680: (0x80042a80, "and stepped on by one"),
    0x80042684: (0x80042a88, "and stored"),
    0x800426bc: (0x80042a8c, "the branch past the slot's wrap while it is under 10, the test's answer in v1 on this disc"),
    0x800426c4: (0x80042a94, "and the slot put back to nothing where it is not"),
    # The effects.
    0x800117f0: (0x800116d4, "the fourth corner's texture coordinate written at 36 of the quad, as on the US"),
    0x80011834: (0x8001170c, "and at 37"),
    0x80011868: (0x80011738, "the quad's palette word written at 14 of it on this disc where the US writes it at its absolute "
                             "address"),
    0x80011884: (0x80011744, "and its page word at 22"),
    0x800118c4: (0x80011784, "the kind times four as an effect starts, in v0 on this disc where the US has it in a0"),
    0x800118d0: (0x80011794, "the kind's table pointer loaded at nothing off the sum on this disc, where the US loads it at its "
                             "offset off at"),
    0x80011920: (0x800117e4, "the count of players read where the kind is the HUD's"),
    0x80022808: (0x8002589c, "the shake's flag set to 1 off gp, the last store of the routine that starts the screen's shake, "
                             "laid out as the US's"),
    0x80011618: (0x8001152c, "the low half of the quads' table, built in s0 before the loop over the effects on this disc "
                             "where the US builds it in the loop and adds the entry"),
    0x80011ac0: (0x80011980, "the lui of the players' count at the top of the frame's pass over the effects, after the stack's "
                             "adjustment on this disc where the US has it before"),
    0x80011b04: (0x800119c0, "the count of effects read at nothing off the sum on this disc"),
    0x80011b74: (0x80011a18, "the table's frames read, before the entry's frame count on this disc where the US reads them "
                             "after"),
    0x80011b80: (0x80011a1c, "and the entry's frame count at 176 off the entry, where the US reads it at its absolute address"),
    0x80011b9c: (0x80011a30, "the light let go at 180 off the entry"),
    0x80011e5c: (0x80011ca4, "a row's size read off the row"),
    0x80011e68: (0x80011ca8, "and the position's third word at 164 off the entry"),
    0x80012024: (0x80011e4c, "the position's second word at 162"),
    0x80012084: (0x80011e98, "the size times the cosine, the size in s4 on this disc where the US keeps it in s5"),
    0x80012254: (0x80012044, "the fourth corner's y written, in the first of the two sprite paths"),
    0x8001293c: (0x800126ac, "and in the second"),
    0x8001235c: (0x80012138, "the position's address added into the view's, in one add on this disc where the US sums the "
                             "buffer and the entry into v0 first"),
    0x800124f0: (0x80012298, "the quotient taken into a0 on this disc where the US takes it into a1"),
    0x80012510: (0x800122a8, "and multiplied by the cosine, before the index's shifts on this disc where the US has it among "
                             "them"),
    0x80012628: (0x800123c4, "the row's sprite read, through t3 on this disc where the US reads it through t4"),
    0x80012748: (0x800124d0, "the quad's second word copied into the entry, from t3 through a0 on this disc"),
    0x80012950: (0x800126b8, "the lui of the frame's table, in a3 on this disc where the US builds it in t1"),
    0x80012a54: (0x800127bc, "the flag for a particle drawn read off the stack, into t6 on this disc"),
    # The jump's table, the call gate and the second image.
    0x8002f63c: (0x80032698, "the jump's table read off gp before the copies of the ball's position on this disc, where the US reads it "
                             "after them"),
    0x8004dddc: (0x80050d40, "the gate on the argument at the head of the routine the take cases call, 130 on this disc where the US gates "
                             "at 120, its table being longer here"),
    0x80015e28: (0x800162e4, "the second image's index set for the draw call, the first argument cleared before it and the third set after it "
                             "as on the US, the call itself further on in this disc's scheduling"),
    # The menu's pad.
    0x8004ad38: (0x80049364, "the pad's word read once into fp at the menu routine's head on this disc, where the US reads it before each "
                             "test"),
    # The effects' position words, rows, corners and frame count.
    0x80011994: (0x80011858, "the position's first word stored at 160 off the entry, where the US stores it at its absolute address"),
    0x800119c4: (0x80011884, "the position's second word, at 162"),
    0x800119f4: (0x800118b0, "and the third, at 164"),
    0x80011e08: (0x80011c94, "the count of rows read again for the loop off the table's pointer, which this disc reads at 168 off the "
                             "entry"),
    0x80011e10: (0x80011c7c, "the row's doubling shift, from t4 into v0 on this disc where the US takes t5 into v1"),
    0x80011e14: (0x80011c80, "and the header's 4 added"),
    0x80011e18: (0x80011c84, "the frame's rows found past the header, walked in t5 on this disc where the US walks t4"),
    0x800122fc: (0x80011cbc, "the player's index shifted for the view's matrix, in the branch's delay slot on this disc where the US has it "
                             "at the head of the world path"),
    0x800121d8: (0x800119d0, "the corners' table built once at the head of the routine, into fp by this lui and the addiu after it, where "
                             "the US builds it at the head of each sprite path; the first path's"),
    0x800128c0: (0x800119d0, "and the second path's, which reads the same fp"),
    0x80012a50: (0x80012760, "a particle's quad stepped, s5 on this disc where the US steps s4"),
    0x80012b18: (0x8001286c, "the frame count's step"),
    0x80012b1c: (0x80012870, "and the count stored, at 176 off the entry, at the end of the pass"),
    0x800142b4: (0x800149c0, "the HUD's primitives linked into the frame's table, at 0x800a1390 on this disc"),
    # The effect table's second pair.
    0x80040b38: (0x80040654, "the level loop's lui of the effect table, into a0 on this disc where the US builds it in v0, before the shifts "
                             "where the US has it after them"),
    0x80040b3c: (0x8004065c, "and its low half"),
    # The glow colours' ninth type.
    0x8002d6c4: (0x8002d98c, "the lui of the colours' table for type 9, into v1 with its addiu on this disc where the US adds the index "
                             "into at"),
    # The take cases' type 37.
    0x80038b1c: (0x80039130, "the case for type 37, which this disc's dispatch table names here, the same instructions as type 33's at "
                             "0x80038e24"),
    # The dispatch tables.
    0x8003868c: (0x80038c58, "the lui of the take cases' table, into v0 with its addiu on this disc where the US adds the index into at"),
    0x8003564c: (0x80035ae4, "the lui of the loader's table, the same way"),
    0x8002f8cc: (0x8002fa18, "the lui of the ball's states' table, the same way"),
    # The laser's lines.
    0x800285d8: (0x80028754, "the nozzle's 90 added for the second circuit, after the width's two instructions this disc copies into the "
                             "branch before it"),
    0x80028600: (0x8002877c, "the width's 7, where the paths join"),
    0x80028604: (0x80028780, "and its -7"),
    # The fruit.
    0x80038c8c: (0x800392a0, "the points of type 43, each fruit's case 176 bytes on from the last on this disc where the US's are 168 on"),
    0x80038d34: (0x80039350, "type 44"),
    0x80038ddc: (0x80039400, "type 45"),
    0x80038e84: (0x800394b0, "type 46"),
    0x80038f2c: (0x80039560, "and type 47"),
    # The end screen's trial test.
    0x80015728: (0x80015c74, "the time trial's mode tested after a test of the normal mode this disc makes first, which picks pair 38 "
                             "where the word at 0x800a1f08 is 1"),
    # The Simon pad's turn and verdict.
    0x80036fe4: (0x80037578, "the 1 a turn left is asked with: this disc stores the register the compare before the store tests against "
                             "this 1, and the store is reached only where the two are equal"),
    0x80037148: (0x800376bc, "the verdict for a move stored at the count, set in a1 well before the stores on this disc, which stores that "
                             "register where the US sets v0 at the store"),
    # The breath's divisor.
    0x80032684: (0x80032484, "the reciprocal's low half, or'ed in after the count this disc keeps between the lui and the multiply"),
    # The finals flag.
    0x800462c8: (0x80045650, "the table routine's store of an entry's halfword into the finals flag, the sixth field it loads and "
                             "14 past the lowest, through t1 on this disc where the US has it in v0, the entry's address kept in "
                             "s0 where the US adds its offset into at at each load"),
    0x8004910c: (0x80047e50, "the menu case's store of 1 to the flag from s0, set before the choice's compare on this disc where "
                             "the US sets it in the case, after the screen's height's load and before the mode word's clear as "
                             "on the US, which jumps to the case through a table where this disc compares its way there; the "
                             "level loop of this disc sets the flag itself too, at 0x80040914 and 0x80040948, where the US's "
                             "loop only clears it"),
    # The corkscrew's shadow.
    0x8003e87c: (0x8003e5f0, "the corkscrew's home added into its record's address, s1 on this disc where the US keeps it in fp, the copy "
                             "reading 32 further in"),
    # The end screen's width.
    0x80016d08: (0x80017c50, "the lui of the screen's width in the end screen's routine, into a0 as on the US, between a pair into v0 and "
                             "one into v1 that read other words"),
    0x80016d0c: (0x80017c54, "and its load"),
}
