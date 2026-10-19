# What the curated names rest on

[`public/annotations.json`](../public/annotations.json) is what the map says about the things the game leaves numbered: a name, the points a pickup scores, whether a thing is a hazard, what a raw field holds, a level's best score where the disc holds more than can be collected, and a note for whoever is looking at the map. This file is why each of those is believed, one section per entry under the entry's key, and a unit test fails when an entry has no section here or a section names no entry. The note says what a thing is and does; the reasons stay here. A type the file does not name shows on the map as its number, and `python3 tools/kula_kinds.py` writes the per-type contact sheets the naming started from.

A name rests on what the game draws for its number and on what the thing does in play: a kind wears the texture the loader paints it with ([tgi.md](tgi.md)), a type is the model the mesh file keeps under its number ([ggi.md](ggi.md)) or the paint the loader gives its face, and a section adds what the executable says. The points rest on play, and so does each level's `score`, the best score play reaches where the disc holds more than can be collected; type 42's points rest on the executable instead, since only the object catalogue holds one. Syonyx's Roll Away walkthrough (GameFAQs, 2006) states a maximum score for 209 levels, and on 193 of them it is the disc's total, which is what says that everything on those can be collected; of the other 16, play collects everything on LEVEL 128, BONUS 29, BONUS 30, FINAL 12 and FINAL 13, and each of the other 11 curates its `score` ([level-format.md](level-format.md) has the arithmetic). Every regional difference a note mentions is from The Cutting Room Floor's Roll Away page.

An entry marked `hazard` is one that can cost the ball its life, and its section says what shows it. The things that travel share one routine for it: the loader puts every type 50 to 53 and 56 into one table (`0x8003b678`), and once a frame the ball's routine tests the ball against every entry in it (`0x8003d570`, called at `0x8003679c`) and on a hit sets it dying with the cause the game keeps for them (`0x80036814`), the wandering ball's reach being the shorter. The notes call that capturing the ball, a word taken from the captivators' name, and use it for all of them and for type 42's brown form, since all set the same cause. No hazard harms the ball while the invincibility pill lasts (type 34).

## Block kinds

### kind 0: Block

The plain block, style 0 in the lattice and kind 0 in a record: every block that is none of the others ([level-format.md](level-format.md)).

### kind 1: Fire block

The lattice's style 1 and a record's kind 1 are the same thing, the second being a fire block with something standing on it, and the loader paints both with the fire texture ([tgi.md](tgi.md)). It is a hazard: in play the ball swells and reddens on it and burns on the third fire square in a row. The code heats the ball on fire, by 40 a frame and by 600 at a time besides, and past 2000 sets it dying with a cause of its own rather than the captivators' (`0x8003ab40` to `0x8003ac14`), which is why the notes say it burns.

### kind 2: Ice block

Style 2 in the lattice, kind 2 in a record, painted with the ice texture ([tgi.md](tgi.md)), and in play the ball slides across it. Most of the game's 668 are in Arctic and Hell, 244 and 233.

### kind 3: Invisible block

Style 3 in the lattice, kind 3 in a record. More than half of the game's 1245 are in Haze, 705 of them. That rolling over one in a bonus level scores nothing, which the map's totals count on, is the executable's: the walk that counts a bonus level's blocks takes the plain, fire, ice, acid, crumbling and vanishing kinds and not this one ([level-format.md](level-format.md)).

How one shows is the executable's: [motion.md](motion.md) has the routine. It is hidden and lights up only within a block of the ball, and on the seven levels whose settings record carries a first field of 1 it is the other way round, seen everywhere and fading out as the ball comes within three and a half blocks, gone within two and a half, which is the note's "only from far away". The sunglasses show them all.

### kind 4: Acid block

One cell in each copy of OBJ LEVEL and nowhere else. The loader paints it with the green splat, the fifteenth model of the artwork's table, and on OBJ LEVEL in play it is the green block. The name was what it looks like until play settled it: the ball melts on it with the game calling out ACID!, which makes it a hazard.

### kind 5: Moving platform

A block that travels between two cells named in its own fields, on one axis, and back. The record's type is the direction from its block to the far end, and its tail keeps a fixed-point copy of where it is; [motion.md](motion.md) has the rest of the record and the pause at each end. `f2` is the axis, as the direction number of its positive way, 1, 2 or 5, and `f4` to `f6` and `f7` to `f9` are the two ends, the lower along the axis first on all 37 ([level-format.md](level-format.md)). LEVEL 71 carries the game's first.

### kind 6: Crumbling block

LEVEL 16 carries the game's first kind 6, fifteen of them, painted with the cracked stone ([tgi.md](tgi.md)), and in play each scores 50. The record keeps its position in `f2` to `f4`, 512 times its own cell on all 435, which the game does not use ([motion.md](motion.md)).

### kind 7: Vanishing block

LEVEL 76 carries the game's first kind 7. The record's `f2`, 0 to 3, is its phase, where in the cycle the block starts, which [motion.md](motion.md) decodes.

### kind 8: Laser

A beam between two cells, named in the record's own fields rather than drawn between blocks that happen to line up. It runs on one axis on all 123 in the game, and no block ever stands between its ends. The record's type is the direction from its own block to the far end, one of the six the game numbers, its `f2` the axis and `f4` to `f9` the two ends, as on a moving platform and the lower first on all 123, and the slot after its own holds its circuit: the colour of the beam, and of the switch and teleporter that share it. At load the engine's routine at `0x80035a70` writes a plain block into the lattice at both ends and marks every cell between as beam, which is why 64 of the 246 ends are cells the level file leaves empty and the game stands a block on anyway. That a beam starts switched off is the record's own flag, `f3`, 1 where the beam starts lit and 0 where it starts dark, which agrees with the switches of its colour on every level ([level-format.md](level-format.md)). In play a beam burns the ball the moment it reaches it, which makes it a hazard.

### kind 9: Level settings

The last record on 160 levels, and the one kind no lattice cell ever names, so the engine's walk over the level does not reach it. The loader reads its first slot as the level's settings: a type of 1 marks a hidden level, which draws its blocks half-transparent and the glass ball, and is 1 on exactly the ten; a first field of 1 turns round how invisible blocks show, on LEVEL 106 to 108, 110 and 111, SIMON 9 and HIDDEN 8, which kind 3 has. It stands on an empty cell on 114 of the 160. Its other slots hold objects like any block's, 55 of them on 43 levels, which the walk does not reach either. So the slots read as a block deleted in the editor with its faces left as they were, and the build ships the record without them. [level-format.md](level-format.md) has the addresses.

## Object types

### type 1: Fire

The loader paints the face with the fire block's own texture ([tgi.md](tgi.md)). LEVEL 38 is a start block and four blocks two squares out, each with fire on four faces and fire-free on two. It is a hazard for the fire block's reasons.

### type 2: Ice

The loader paints the face with the ice block's own texture ([tgi.md](tgi.md)). LEVEL 47 carries seventeen and no ice blocks. The game reads a patch as ice for the roll as for the chill. The ball's read of the block under it writes one word for what it stands on, 2 for a kind-2 block (`0x800378bc`) and, for a plain block, the type of the slot on the face it stands on (`0x80037944`, `0x8003794c`), so 2 for a patch there, and the roll's predicate (`0x80030e2c` to `0x80030e38`) and the hazards' ice case (`0x8003aab0`) ask that word, not the block's kind ([motion.md](motion.md)).

### type 5: Teleporter

LEVEL 66 carries the game's first two. The colour is `f3`, the circuit number the lasers and switches use: LEVEL 68's are yellow and blue and read 0 and 1, LEVEL 70's yellow, red and green read 0, 3 and 2. `f4` says whether it starts on, 1 for on and 2 for off: the draw lights a teleporter while it is 1 ([motion.md](motion.md)), and on every level with lasers of the same colour the field agrees with whether the beams start lit ([level-format.md](level-format.md)). `f7` is its destination: the teleporter's routine reads it at `0x8003a6e4` as the record and face of the teleporter the ball comes out of, on all 147 one of the same colour, and where three or more share a colour on a level they send the ball round a ring, one way ([level-format.md](level-format.md)). `f2` is its facing, the way the ball faces as it comes out of this one: once the teleporter's routine has the destination it reads that teleporter's `f2` (`0x8003a724`) and faces the ball by it through the routine that faces the ball at the start (`0x80038178`, called at `0x8003a734` and by the start's routine at `0x80036114`), so it counts in the quarter turns the start and the arrows do, and the loader turns the teleporter itself by the same field, as it turns every object its table knows (`0x800359ec`, into `0x80039ec0`). It is 1 to 4 on all 147, and unlike the start's it has not been checked in play.

### type 7: Exit

One on each of 190 levels, and none on the 30 bonus and 10 Simon levels, which have no exit to reach; the disc keeps a second on three of them, on records the game never walks ([level-format.md](level-format.md)). LEVEL 1's, LEVEL 2's and HIDDEN 10's stand on the cells and faces the map draws them on.

### type 8: Clock

LEVEL 56 carries the game's first seven, painted with the clock's face ([tgi.md](tgi.md)); the clock LEVEL 136 starts you on is the start itself, type 29, which the loader makes a clock of.

### type 9: Switch

LEVEL 84 carries the game's first; LEVEL 98's red, green and blue read 3, 2 and 1 in `f3`, the same circuit numbers its three lasers carry. The field after the colour is the circuit's starting state, 1 for on and 2 for off, and agrees with the lasers and teleporters of that colour on every level. That a switch turns every laser and teleporter of its colour on and off is the code's: a press walks a list its `f7` starts (`0x8003a388`) and turns over each thing on it, and on every level the list is exactly the switches, teleporters and lasers of the switch's colour ([level-format.md](level-format.md)).

### type 10: Boost button

LEVEL 26 carries the game's first three.

### type 11: Moving spikes

LEVEL 41 carries the game's first six. `f3` takes four values, which is where in the cycle each one starts, its phase ([motion.md](motion.md)). They are a hazard while up: the ball's code at `0x8003b0d0` sets it dying on a type 11 whose `f4` is 1, which the cycle sets as the spikes rise and clears as they retract.

### type 12: Spikes

LEVEL 4 carries the game's first four. They are a hazard: the ball's code at `0x8003b02c` sets it dying on a type 12 under it.

### type 26: Hidden exit

Ten levels carry one, one in each world, and the disc keeps a second on LEVEL 82 on a record the game never walks. LEVEL 132's is the one the NTSC release puts out of reach.

### type 28: Arrow

LEVEL 61 carries the game's first twelve. `f2` takes 1 to 4, a quarter turn each on the face: on a block's top they point +y, -x, -y and +x, which LEVEL 62's arrows in play fixed, one of each; [level-format.md](level-format.md) has the sides.

### type 29: Start on a clock

Two in the game, on LEVEL 58 and LEVEL 136 (`LEVEL 135` on the disc), and each level's only start. The routine that places the ball at `0x80036100` takes a type 29 like a type 30, faces the ball by the same field, and then makes the slot a clock, type 8, at `0x8003627c`, so the ball starts on a clock, and both starts were checked in play. The face is painted with the clock's face like any clock's.

### type 30: Start

The block and face the ball starts on, checked in play on LEVEL 1, LEVEL 2 and HIDDEN 10. One on each of 228 levels; the other two start the ball on a clock instead, type 29. `f2` is the way the ball faces, in the quarter turns the arrows use: LEVEL 1's reads 3, which is -y, and the first coin is two blocks that way. The game picks the ball's design by the world's place from the fourteen the disc holds ([ggi.md](ggi.md)).

### type 31: Key

One to six a level on the disc: 61 levels with one, 92 with two, 31 with three, five with four, and one with six, FINAL 13, three of whose keys stand on crumbling blocks the game never walks, so in play it asks for three. LEVEL 1's and LEVEL 2's are on the cells the map draws them on, and HIDDEN 10's four are on the face.

### type 32: Lethargy pill

Named for what it does in play: its mode word makes the play loop wait two blanks a pass, so the ball and everything else run at half pace while the screen rocks ([motion.md](motion.md), [camera.md](camera.md)). LEVEL 10 carries the game's first four. How long it lasts is the code's: its case sets the word at `0x800ba338` to 360 (`0x800387d4`), and the ball's routine, which the play loop runs once a pass, takes 2 off it a pass (`0x8003b388`) and 4 ticks off the clock with it (`0x8003b390`, through `0x8003b468`), testing the word before it counts it down, so the pill lasts 181 passes, six seconds at two blanks each, and costs 724 ticks beyond the clock's own, 14.5 of its seconds at fifty ticks to the second ([motion.md](motion.md)), which the note gives as about fifteen.

### type 33: Bouncy pill

LEVEL 86 carries the game's first, and LEVEL 88 has two.

### type 34: Invincibility pill

Nine in the game, one in each copy of OBJ LEVEL, so it is catalogue stock the levels never use. The name is play's: taken on OBJ LEVEL, it sets the ball flashing in colours, and while it does nothing harms it, not the spikes, the moving spikes, the stars, the rolling stone, the corkscrew or fire. The code says the same. The ball's contact walk at `0x80038548` sends it to its case at `0x80038804`, which scores nothing, sets the word at `0x800ba340` to 840 and takes the pill off its face; the loader sets that word to -1 (`0x80035df8`), and the ball's routine counts it down by one a frame back to -1 (`0x8003b2f8`), so the pill lasts 14 s. Every path that sets the ball dying first tests that the word is -1: the laser's beam (`0x8003a960`), fire (`0x8003ab64`, `0x8003abc8`), the acid block (`0x8003acbc`), the spikes (`0x8003b050`), the moving spikes (`0x8003b108`), the things that travel (`0x80036760`) and type 42's brown form (`0x800386d8`). While the word runs, the same routine also sets the bouncy pill's word at `0x800ba33c` to -1 and the lethargy pill's at `0x800ba338` to 0 (`0x8003b324` to `0x8003b358`), and in play it cancels both pills.

### type 35: Hourglass

LEVEL 6 carries the game's first. The code turns the clock round and scores by what it leaves: the ball's contact walk at `0x80038548` sends it to its case at `0x80039048`, which writes 5999 less the clock back as the clock and adds 10 for every whole second of the new clock, 50 ticks each ([motion.md](motion.md)), so taken with s whole seconds left it leaves 119 − s seconds and scores 1190 − 10·s, 1190 with less than a second left, which is the most it can score and what the map counts each at. Play had put the rule at 1200 less twelve a second, rounded to the nearest 10, from a few counts; the code's is what the note gives.

### type 36: Gem

It scores 2975 in play whatever the colour, the figure the ball's contact walk adds for it (type 42). The colour is `f3`: LEVEL 5's blue gems read 0, LEVEL 64's green one 1, and the red ones of LEVEL 77, 103 and 118 read 2.

### type 37: Coin

Three tiers, told apart by `f3`, which score 250, 500 and 750 in play, the three figures the ball's contact walk adds for a coin (type 42). LEVEL 1's and LEVEL 2's are the 250 kind and read bronze in play; LEVEL 112's thirteen and HIDDEN 10's eight, which show gold, are the 750 kind; the middle tier is the blue one, on BONUS 15 and HIDDEN 5 among others. The three colours are the models' own ([ggi.md](ggi.md)).

### type 38: Sunglasses

LEVEL 113 carries the game's first three, and each scores 500 in play ([motion.md](motion.md) has the timer it starts).

### type 42

Nine in the game, one in each copy of OBJ LEVEL, so it is catalogue stock the levels never use, and nothing names it. What it does is in the code. Its `f5` is set as on every pickup ([level-format.md](level-format.md)), and the ball's contact walk at `0x80038548`, which sends a type 27 to 47 through the table at `0x80010238`, gives it a case of its own at `0x800386a4` that reads its form, `f3`, which changes every 2.6 s ([motion.md](motion.md)). In the green form, 1, it adds 1550 to the score at `0x800a53c8`, the word the same walk adds a key's 1000, a gem's 2975, a coin's 250, 500 or 750 and a fruit's 2500 to, and the walk's tail takes it off its face. In the brown form, 0, it stays, and sets the ball dying with the cause a captivator's touch sets (`0x80036814`), which makes it a hazard.

### type 43: Fruit

One placement in the game, on LEVEL 83. Its model is the apple.

### type 44: Fruit

Five in the game, each on a level without the common fruit type, and it scores 2500 in play like the rest. Its model is the watermelon.

### type 45: Fruit

Three in the game, each on a level without the common fruit type, one of them HIDDEN 9, which the Japanese release removed. Its model is the pumpkin.

### type 46: Fruit

The common fruit: one on each of 151 levels, and a second on LEVEL 134 on a crumbling block the game never walks. The fruit of LEVEL 1 and LEVEL 2 stands on the cell the map draws this on. Its model is the bananas, but in play LEVEL 1 shows an apple and each numbered level after it the next fruit round apple, watermelon, pumpkin, bananas and strawberry, which is how the map draws the numbered levels ([ggi.md](ggi.md)). Which fruit a level shows in play is progress rather than data.

### type 47: Fruit

One placement in the game, on LEVEL 19, a level without the common fruit type. Its model is the strawberry.

### type 50: Captivator, slow

LEVEL 132 sends the ball through a gap between twelve of them as they move around, LEVEL 141 past a group of four travelling in a line. That it is the thinner star with three long points was seen in play beside type 52, and it is the slower of the two, walking a block in 0.66 s where type 52 swings 1.17 blocks either way and back in 1.29 s ([motion.md](motion.md)); `f2` is its direction. In play, touching it costs the ball its life, and the lost life is what restarts the level. It is a hazard by the routine the things that travel share.

### type 51: Rolling stone

Drawn as the wheel the disc keeps beside the stars. LEVEL 51 carries the game's first, and LEVEL 52 four. It rolls round a course of its own, turning where it cannot go on ([motion.md](motion.md)), and in play touching it costs the ball its life. It is a hazard by the routine the things that travel share.

### type 52: Captivator, quick

The game's first are LEVEL 22's seven. That it is the fuller star with four short points was seen in play beside type 50, and it is the quicker of the two ([motion.md](motion.md)); `f2` is its direction. In play, touching it costs the ball its life, and the lost life is what restarts the level. It is a hazard by the routine the things that travel share.

### type 53: Captivator, wandering

LEVEL 84 carries the game's first four, and the way one shakes before it moves tells which way it will go ([motion.md](motion.md)). It has no direction field. Its walk is the same on every play of a level, which play on OBJ LEVEL showed and the game's dice explain, seeded as the level starts and drawn from by nothing else while the ball stands still ([motion.md](motion.md)). In play, touching it costs the ball its life, as the rolling stone does. It is a hazard by the routine the things that travel share.

### type 56: Captivator, bouncing

LEVEL 45 carries the game's first six, and LEVEL 122's go up in sequence, which is what `f3`, four-valued, reads as: its phase ([motion.md](motion.md)). In play, touching it costs the ball its life. It is a hazard by the routine the things that travel share. Its hit test reads the position its bounce writes, so a ball under it is within reach only about each landing and a ball jumping over it only while it is up ([motion.md](motion.md)), which is what the note's advice rests on.

## Levels

### /HIRO/HIRO.PAK#19: LESSON

Aris Efraimidis's GameShark codes found it, and `python3 tools/kula_warp.py --cheat --level /HIRO/HIRO.PAK#19` prints the cheat that reaches it.

### /HILLS/HILLS.PAK#19, /INCA/INCA.PAK#19, /ARCTIC/ARCTIC.PAK#19, /COWBOY/COWBOY.PAK#19, /FIELD/FIELD.PAK#19, /ATLANT/ATLANT.PAK#19, /HAZE/HAZE.PAK#19, /MARS/MARS.PAK#19, /HELL/HELL.PAK#19: OBJ LEVEL

The name is what it holds: one of nearly every object in the game on a flat floor, identical in the nine worlds that ship it, and no way to it in play. Walked once in an emulator, each object names itself; `tools/kula_objlevel.py` writes the floor plan, and `tools/kula_warp.py --cheat` prints the emulator cheat that reaches it.

### /HILLS/HILLS.PAK#15: BONUS 4

The best score in play. The disc holds 3500 more, the twelve coins on the corners of the lowest ring: they and the four gems inside that ring cannot both be had, and the gems score more.

### /HILLS/HILLS.PAK#18: HIDDEN 2

The best score in play: it leaves one of the ten crumbling blocks, and takes the coin under the exit block, which the Japanese release removes as unreachable. The disc holds 50 more.

### /HILLS/HILLSFI.PAK#0: FINAL 3

From The Cutting Room Floor's Roll Away page.

### /INCA/INCA.PAK#9: LEVEL 40

The best score in play. The disc holds 100 more, two crumbling blocks that cannot be reached.

### /FIELD/FIELD.PAK#7: LEVEL 83

The best score in play. The disc holds 150 more, three crumbling blocks on the top level that cannot be broken by any means.

### /FIELD/FIELD.PAK#15: BONUS 16

The redesign is The Cutting Room Floor's.

### /FIELD/FIELD.PAK#16: BONUS 17

The best score in play. The disc holds 4475 more, the gem and two gold coins on whichever end block is reached last, since touching the last block ends a bonus level before anything on it can be collected.

### /FIELD/FIELD.PAK#18: HIDDEN 6

From The Cutting Room Floor's Roll Away page.

### /ATLANT/ATLANT.PAK#3: LEVEL 94

The best score in play. The disc holds 50 more, a crumbling block that is out of reach. The hourglass and two gold coins on the crumbling blocks are left out because the game never walks what stands on a crumbling block ([level-format.md](level-format.md)).

### /ATLANT/ATLANT.PAK#11: LEVEL 102

The best score in play. The disc holds 750 more, a gold coin inside one of the rings that cannot be reached.

### /HAZE/HAZEFI.PAK#1: FINAL 16

The best score in play. The disc holds 30500 more: ten of the eleven gems on the ring at y=28, which cannot be left once reached, and a gold coin.

### /MARS/MARS.PAK#10: LEVEL 131

The regional difference is The Cutting Room Floor's, which also calls the coin unreachable; in this release it is not. It is the blue coin on the -x face of the ice block at 7,16,21, and it was collected in play for the level's full 12,290, everything the disc holds.

### /MARS/MARS.PAK#11: LEVEL 132

That the hidden exit at 14,19,18 cannot be reached once it has appeared is the walkthrough's, which finds no way to it. The regional history is The Cutting Room Floor's.

### /MARS/MARS.PAK#12: LEVEL 133

From The Cutting Room Floor's Roll Away page.

### /MARS/MARS.PAK#13: LEVEL 134

The second fruit, on the `+y` face of the crumbling block at 17,16,20, is left out because the game never walks what stands on a crumbling block ([level-format.md](level-format.md)).

### /MARS/MARS.PAK#16: BONUS 26

The best score in play. The disc holds 8925 more, three gems under the three far blocks, which only the bouncy pill reaches and which the pill then keeps you from collecting.

### /MARS/MARS.PAK#18: HIDDEN 9

From The Cutting Room Floor's Roll Away page.

### /HELL/HELL.PAK#14: LEVEL 150

The best score in play. The disc holds 50 more, the one crumbling block it leaves standing.

### /HELL/HELL.PAK#15: BONUS 28

The best score in play. The disc holds 1000 more, the two coins on top of the first platform, a face that cannot be reached.

### /HELL/HELL.PAK#17: BONUS 30

From The Cutting Room Floor's Roll Away page. Its thirty pickups are the only ones in the game without a pickup number.

### /HELL/HELL.PAK#18: HIDDEN 10

The 160 blocks of lettering lie flat on z=32, the floor of the lattice and 22 blocks below the playable structure. The other 18 are a frame standing in the xz plane, and everything the level places, the start, the exit, four keys, eight bronze coins and four gems, stands on its `-y` face ([level-format.md](level-format.md) has how the lettering fixed the handedness).
