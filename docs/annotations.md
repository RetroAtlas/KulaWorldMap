# What the curated names rest on

[`public/annotations.json`](../public/annotations.json) is what the map says about the things the game leaves numbered: a name, the points a pickup scores, whether a thing is a hazard, what a raw field holds, a level's best score where the disc holds more than can be collected, and a note for whoever is looking at the map. This file is why each of those is believed, one section per entry under the entry's key, and a unit test fails when an entry has no section here or a section names no entry. The note says what a thing is and does; the reasons stay here.

Most names rest on Syonyx's Roll Away walkthrough (GameFAQs, 2006), which the repo does not carry: the level it first mentions a thing on carries the game's first placement of one kind or type, and usually nothing else new. The points rest on its per-level maximum scores, which the disc reproduces exactly on 193 of the 209 levels it rates and exceeds on the other 16, each of which curates the walkthrough's figure as its `score`; [level-format.md](level-format.md) has the arithmetic. Type 42's rest on the executable instead, since no level it rates holds one. The names that rest on play are the coin tiers' colours, which of the two directional captivators is which, the acid block and the invincibility pill. Every regional difference a note mentions is from The Cutting Room Floor's Roll Away page.

An entry marked `hazard` is one that can cost the ball its life, and its section says what shows it. The things that travel share one routine for it: the loader puts every type 50 to 53 and 56 into one table (`0x8003b678`), and once a frame the ball's routine tests the ball against every entry in it (`0x8003d570`, called at `0x8003679c`) and on a hit sets it dying with the cause the game keeps for them (`0x80036814`), the wandering ball's reach being the shorter. The notes call that capturing the ball, a word taken from the captivators' name, and use it for all of them and for type 42's brown form, since all set the same cause. No hazard harms the ball while the invincibility pill lasts (type 34).

## Block kinds

### kind 0: Block

The plain block, style 0 in the lattice and kind 0 in a record: every block that is none of the others ([level-format.md](level-format.md)).

### kind 1: Fire block

The lattice's style 1 and a record's kind 1 are the same thing, the second being a fire block with something standing on it: LEVEL 35, the walkthrough's first fire, is style 1 and kind 1 and nothing else new, and so are LEVEL 44, 123 and 126. It is a hazard: the walkthrough's fire inflates the ball until it pops or reaches cooler ground, and in play the ball swells and reddens on it and burns on the third fire square in a row (2026-09-24). The code heats the ball on fire, by 40 a frame and by 600 at a time besides, and past 2000 sets it dying with a cause of its own rather than the captivators' (`0x8003ab40` to `0x8003ac14`), which is why the notes say it burns.

### kind 2: Ice block

Style 2 in the lattice, kind 2 in a record: LEVEL 46, the walkthrough's first ice, is 29 of them and nothing else new. Nearly all of the game's are in Arctic and Hell.

### kind 3: Invisible block

Style 3 in the lattice, kind 3 in a record: LEVEL 31, the walkthrough's first invisible platform, is eight of them and nothing else new. Two thirds of the game's are in Haze. That rolling over one in a bonus level scores nothing, which the map's totals count on, is arithmetic: the six bonus levels that have invisible blocks each fall short of the walkthrough's maximum by 50 times their count, and no other bonus level has one.

How one shows is the executable's: [motion.md](motion.md) has the routine. It is hidden and lights up only within a block of the ball, and on the seven levels whose settings record carries a first field of 1 it is the other way round, seen everywhere and fading out as the ball comes within three and a half blocks, gone within two and a half, which is the note's "only from far away". The sunglasses show them all.

### kind 4: Acid block

One cell in each copy of OBJ LEVEL and nowhere else, so the walkthrough never meets it. The loader paints it with the green splat, the fifteenth model of the artwork's table, and on OBJ LEVEL in play it is the green block (2026-09-16). The name was what it looks like until play settled it: the ball melts on it with the game calling out ACID! (2026-09-24), which makes it a hazard.

### kind 5: Moving platform

A block that travels between two cells named in its own fields, on one axis, and back. The record's type is the direction from its block to the far end, and its tail keeps a fixed-point copy of where it is; [motion.md](motion.md) has the rest of the record and the pause at each end. `f2` is the axis, as the direction number of its positive way, 1, 2 or 5, and `f4` to `f6` and `f7` to `f9` are the two ends, the lower along the axis first on all 37 ([level-format.md](level-format.md)). LEVEL 71, the walkthrough's first moving platform, carries the game's first kind 5, and every later mention of one lands on a level with them.

### kind 6: Crumbling block

LEVEL 16 introduces them in the walkthrough and carries the game's first kind 6, fifteen of them, and 50 points each is what the walkthrough's maximum scores need on every level that has them. The record keeps its position in `f2` to `f4`, 512 times its own cell on all 435, which the game does not use ([motion.md](motion.md)).

### kind 7: Vanishing block

LEVEL 76 introduces them in the walkthrough and carries the game's first kind 7. The record's `f2`, 0 to 3, is its phase, where in the cycle the block starts, which [motion.md](motion.md) decodes.

### kind 8: Laser

A beam between two cells, named in the record's own fields rather than drawn between blocks that happen to line up. It runs on one axis on all 123 in the game, and no block ever stands between its ends. The record's type is the direction from its own block to the far end, one of the six the game numbers, its `f2` the axis and `f4` to `f9` the two ends, as on a moving platform and the lower first on all 123, and the slot after its own holds its circuit: the colour of the beam, and of the switch and teleporter that share it. At load the engine's routine at `0x80035a70` writes a plain block into the lattice at both ends and marks every cell between as beam, which is why 64 of the 246 ends are cells the level file leaves empty and the game stands a block on anyway. That a beam starts switched off, which the map draws broken, is the record's own flag, `f3`, 1 where the beam starts lit and 0 where it starts dark, which agrees with the switches of its colour on every level ([level-format.md](level-format.md)). The walkthrough calls lasers deadly to touch, and in play a beam burns the ball the moment it reaches it (2026-09-24), which makes it a hazard.

### kind 9: Level settings

The last record on 160 levels, and the one kind no lattice cell ever names, so the engine's walk over the level does not reach it. The loader reads its first slot as the level's settings: a type of 1 marks a hidden level, which draws its blocks half-transparent and the glass ball, and is 1 on exactly the ten; a first field of 1 turns round how invisible blocks show, on LEVEL 106 to 108, 110 and 111, SIMON 9 and HIDDEN 8, which kind 3 has. It stands on an empty cell on 114 of the 160. Its other slots hold objects like any block's, 65 of them on 49 levels, and they are not in play: counted, they would push 27 levels past the walkthrough's maximum, LEVEL 24 by a fruit and LEVEL 142 by two gems, where without them those levels are exact. So the slots read as a block deleted in the editor with its faces left as they were, and the build ships the record without them. [level-format.md](level-format.md) has the addresses.

### kind 666: Camera

The record every level ends with, and the one that stands on no cell: where its cell would be, the disc writes three `0xFFFF`. It carries a cell for the camera to look at, two angles, and a number that is 99 on 218 of the 230 levels and lower on the other twelve, which reads as the level's time. It ships as the level's `camera` rather than as a record, so the viewer draws it as the camera target and never shows this entry's note.

## Object types

### type 1: Fire

LEVEL 38 is a start block and four blocks two squares out, each with fire on four faces and, as the walkthrough says, fire-free on two. It is a hazard for the fire block's reasons.

### type 2: Ice

The ice patch the walkthrough keeps warning about on column tips. LEVEL 47 carries seventeen and no ice blocks.

### type 5: Teleporter

LEVEL 66, the walkthrough's first teleporters, carries the game's first two. The colour is `f3`, the circuit number the lasers and switches use: LEVEL 68's are yellow and blue and read 0 and 1, LEVEL 70's yellow, red and green read 0, 3 and 2. `f4` says whether it starts on, 1 for on and 2 for off: the ones the walkthrough uses on arrival, LEVEL 66 to 71 among them, read 1, the ones it sends you to a button for first, LEVEL 84, 97, 99, 100, 101, 102, 117, 128, 133, 137, 142 and 145, read 2, and on every level with lasers of the same colour the field agrees with whether the beams start lit ([level-format.md](level-format.md)). `f7` is its destination: the teleporter's routine reads it at `0x8003a6e4` as the record and face of the teleporter the ball comes out of, on all 147 one of the same colour, and where three or more share a colour on a level they send the ball round a ring, one way ([level-format.md](level-format.md)). `f2` is its facing, the way the ball faces as it comes out of this one: once the teleporter's routine has the destination it reads that teleporter's `f2` (`0x8003a724`) and faces the ball by it through the routine that faces the ball at the start (`0x80038178`, called at `0x8003a734` and by the start's routine at `0x80036114`), so it counts in the quarter turns the start and the arrows do, and the loader turns the teleporter itself by the same field, as it turns every object its table knows (`0x800359ec`, into `0x80039ec0`). It is 1 to 4 on all 147, and unlike the start's it has not been checked in play.

### type 7: Exit

One on each of 190 levels, and none on the 30 bonus and 10 Simon levels, which have no exit to reach; the disc keeps a second on three of them, on records the game never walks ([level-format.md](level-format.md)). LEVEL 1's, LEVEL 2's and HIDDEN 10's stand on the cells and faces the map draws them on.

### type 8: Clock

LEVEL 56 is the walkthrough's first clock and carries seven, and LEVEL 58, 59 and 118 each have one where the walkthrough says; the clock LEVEL 136 starts you on is the start itself, type 29, which the loader makes a clock of.

### type 9: Switch

LEVEL 84 has the walkthrough's first button and the game's first of these; LEVEL 98's red, green and blue read 3, 2 and 1 in `f3`, the same circuit numbers its three lasers carry. The field after the colour is the circuit's starting state, 1 for on and 2 for off, and agrees with the lasers and teleporters of that colour on every level: LEVEL 105's all read 1 and the walkthrough turns them off, LEVEL 97's all read 2 and it turns red on. That a switch turns every laser and teleporter of its colour on and off is the code's: a press walks a list its `f7` starts (`0x8003a388`) and turns over each thing on it, and on every level the list is exactly the switches, teleporters and lasers of the switch's colour ([level-format.md](level-format.md)).

### type 10: Boost button

LEVEL 26, which the walkthrough introduces them on, carries the game's first three.

### type 11: Moving spikes

LEVEL 41 carries the game's first six where the walkthrough first says to wait for them to retract. `f3` takes four values, which is where in the cycle each one starts, its phase ([motion.md](motion.md)). They are a hazard while up: the ball's code at `0x8003b0d0` sets it dying on a type 11 whose `f4` is 1, which the cycle sets as the spikes rise and clears as they retract.

### type 12: Spikes

LEVEL 4 carries the game's first four where the walkthrough first says to jump the spikes. They are a hazard: the walkthrough's list of hazards opens with spikes that pop the ball, and the ball's code at `0x8003b02c` sets it dying on a type 12 under it.

### type 26: Hidden exit

Exactly the ten levels the walkthrough marks as hidden-level access carry one, and the disc keeps a second on LEVEL 82 on a record the game never walks. LEVEL 132's is the one the NTSC release puts out of reach.

### type 28: Arrow

LEVEL 61, the walkthrough's first arrows, carries the game's first twelve. `f2` takes 1 to 4, a quarter turn each on the face: on a block's top they point +y, -x, -y and +x, which LEVEL 62's arrows in play fixed, one of each; [level-format.md](level-format.md) has the sides.

### type 29: Start on a clock

Two in the game, on LEVEL 58 and LEVEL 136 (`LEVEL 135` on the disc), and each level's only start. The routine that places the ball at `0x80036100` takes a type 29 like a type 30, faces the ball by the same field, and then makes the slot a clock, type 8, at `0x8003627c`, so the ball starts on a clock: the walkthrough opens LEVEL 136 with just that, and both starts were checked in play (2026-09-21). The face is painted with the clock's face like any clock's.

### type 30: Start

The block and face the ball starts on, checked in play on LEVEL 1, LEVEL 2 and HIDDEN 10. One on each of 228 levels; the other two start the ball on a clock instead, type 29. `f2` is the way the ball faces, in the quarter turns the arrows use: LEVEL 1's reads 3, which is -y, and the first coin is two blocks that way. The game picks the ball's design by the world's place from the fourteen the disc holds ([ggi.md](ggi.md)).

### type 31: Key

One to six a level on the disc: 61 levels with one, 92 with two, 31 with three, five with four, and one with six, FINAL 13, three of whose keys stand on crumbling blocks the game never walks, so in play it asks for three. LEVEL 1's and LEVEL 2's are on the cells the map draws them on, and HIDDEN 10's four are on the face.

### type 32: Lethargy pill

The walkthrough's dizzy pill. LEVEL 10 introduces them and carries the game's first four, and LEVEL 34, 43, 56 and 87 have them where it says. How long it lasts is the code's: its case sets the word at `0x800ba338` to 360 (`0x800387d4`), and the ball's routine, which the play loop runs once a frame, takes 2 off it a frame (`0x8003b388`) and 4 ticks off the clock with it (`0x8003b390`, through `0x8003b468`), so the pill lasts 180 frames, three seconds, and costs 720 ticks beyond the clock's own, 14.4 of its seconds at fifty ticks to the second ([motion.md](motion.md)). The walkthrough's fifteen seconds is that loss.

### type 33: Bouncy pill

LEVEL 86 introduces them and carries the game's first; LEVEL 88 has either of two, as the walkthrough says.

### type 34: Invincibility pill

Nine in the game, one in each copy of OBJ LEVEL, so it is catalogue stock the levels never use, and the walkthrough never meets it. The name is play's: taken on OBJ LEVEL, it sets the ball flashing in colours, and while it does nothing harms it, not the spikes, the moving spikes, the stars, the rolling stone, the corkscrew or fire (2026-09-24). The code says the same. The ball's contact walk at `0x80038548` sends it to its case at `0x80038804`, which scores nothing, sets the word at `0x800ba340` to 840 and takes the pill off its face; the loader sets that word to -1 (`0x80035df8`), and the ball's routine counts it down by one a frame back to -1 (`0x8003b2f8`), so the pill lasts 14 s. Every path that sets the ball dying first tests that the word is -1: the laser's beam (`0x8003a960`), fire (`0x8003ab64`, `0x8003abc8`), the acid block (`0x8003acbc`), the spikes (`0x8003b050`), the moving spikes (`0x8003b108`), the things that travel (`0x80036760`) and type 42's brown form (`0x800386d8`). While the word runs, the same routine also sets the bouncy pill's word at `0x800ba33c` to -1 and the lethargy pill's at `0x800ba338` to 0 (`0x8003b324` to `0x8003b358`), and in play it cancels both pills (2026-09-24).

### type 35: Hourglass

LEVEL 6 introduces it and carries the game's first; the walkthrough's maximum scores need 1190 for each one, which is collecting it with a second on the clock. The formula is the walkthrough's, 1200 less twelve times the seconds left, rounded to the nearest 10, which is how a second left scores 1190 and not 1188.

### type 36: Gem

2975 whatever the colour is what the walkthrough's maximum scores need on every level that has one. The colour is `f3`: LEVEL 5's blue gems read 0, LEVEL 64's green one 1, and the red ones of LEVEL 77, 103 and 118 read 2.

### type 37: Coin

Three tiers, told apart by `f3`, and the walkthrough's maximum scores settle the points: 250, 500 and 750 fit 133 of its 148 arcade levels exactly and every miss is one it explains itself, an unreachable coin or block. LEVEL 1's and LEVEL 2's are the 250 kind and read bronze in play; LEVEL 112's thirteen, which the walkthrough calls orange, and HIDDEN 10's eight, which show gold, are the 750 kind; the middle tier is what it calls blue, on BONUS 15 and HIDDEN 5 among others.

### type 38: Sunglasses

LEVEL 113 introduces them and carries three, and the walkthrough's scores for LEVEL 113 to 117 need exactly 500 for each.

### type 42

Nine in the game, one in each copy of OBJ LEVEL, so it is catalogue stock the levels never use, and nothing names it. What it does is in the code. Its `f5` is set as on every pickup ([level-format.md](level-format.md)), and the ball's contact walk at `0x80038548`, which sends a type 27 to 47 through the table at `0x80010238`, gives it a case of its own at `0x800386a4` that reads its form, `f3`, which changes every 2.6 s ([motion.md](motion.md)). In the green form, 1, it adds 1550 to the score at `0x800a53c8`, the word the same walk adds a key's 1000, a gem's 2975, a coin's 250, 500 or 750 and a fruit's 2500 to, and the walk's tail takes it off its face. In the brown form, 0, it stays, and sets the ball dying with the cause a captivator's touch sets (`0x80036814`), which makes it a hazard.

### type 43: Fruit

One placement in the game, on LEVEL 83, where the walkthrough's pumpkin is. Its model is the apple.

### type 44: Fruit

Five in the game, on levels where the walkthrough's fruit stands and the common fruit type is absent; 2500 like the rest is what those levels' maximum scores need. Its model is the watermelon.

### type 45: Fruit

Three in the game, on levels where the walkthrough's fruit stands and the common fruit type is absent, one of them HIDDEN 9, which the Japanese release removed. Its model is the pumpkin.

### type 46: Fruit

The common fruit: one on each of 151 levels, and a second on LEVEL 134 on a crumbling block the game never walks. The fruit of LEVEL 1 and LEVEL 2 stands on the cell the map draws this on. Its model is the bananas where the walkthrough finds an apple on LEVEL 1, and every fruit it names is the level's number counted round apple, watermelon, pumpkin, bananas and strawberry, which is how the map draws the numbered levels ([ggi.md](ggi.md)). Which fruit a level shows in play is progress rather than data.

### type 47: Fruit

One placement in the game, on LEVEL 19, where the walkthrough's fruit stands and the common fruit type is absent. Its model is the strawberry.

### type 50: Captivator

LEVEL 132 sends the ball through a gap between twelve of them as they move around, LEVEL 141 past a group of four travelling in a line. That it is the thinner star with three long points was seen in play beside type 52, and it is the walkthrough's slower kind; `f2` is its direction. In play, touching it costs the ball its life, and the lost life is what restarts the level (2026-09-24). It is a hazard by the routine the things that travel share.

### type 51: Rolling stone

Drawn as the wheel the disc keeps beside the stars. LEVEL 51 carries the game's first where the walkthrough says to jump the rolling stone, and LEVEL 52's four are the captivators it follows clockwise. In play, touching it costs the ball its life (2026-09-24). It is a hazard by the routine the things that travel share.

### type 52: Captivator

The game's first are LEVEL 22's seven, which the walkthrough says glide in front of the ball and are jumped past as they move away. That it is the fuller star with four short points was seen in play beside type 50, and it is the walkthrough's quick kind; `f2` is its direction. In play, touching it costs the ball its life, and the lost life is what restarts the level (2026-09-24). It is a hazard by the routine the things that travel share.

### type 53: Captivator, wandering

LEVEL 84 carries four where the walkthrough says to watch their shaking to tell which way they will go. It has no direction field. Its walk is the same on every play of a level, which play on OBJ LEVEL showed (2026-09-25) and the game's dice explain, seeded as the level starts and drawn from by nothing else while the ball stands still ([motion.md](motion.md)). In play, touching it costs the ball its life, as the rolling stone does (2026-09-24). It is a hazard by the routine the things that travel share.

### type 56: Captivator, bouncing

LEVEL 45 carries six where the walkthrough says to roll under them when raised, and LEVEL 122's go up in sequence, which is what `f3`, four-valued, reads as: its phase ([motion.md](motion.md)). In play, touching it costs the ball its life (2026-09-24). It is a hazard by the routine the things that travel share.

## Levels

### /HIRO/HIRO.PAK#19: LESSON

The walkthrough's GameShark section found it, and `python3 tools/kula_warp.py --cheat --level /HIRO/HIRO.PAK#19` prints the cheat that reaches it.

### /HILLS/HILLS.PAK#19, /INCA/INCA.PAK#19, /ARCTIC/ARCTIC.PAK#19, /COWBOY/COWBOY.PAK#19, /FIELD/FIELD.PAK#19, /ATLANT/ATLANT.PAK#19, /HAZE/HAZE.PAK#19, /MARS/MARS.PAK#19, /HELL/HELL.PAK#19: OBJ LEVEL

The name is what it holds: one of nearly every object in the game on a flat floor, identical in the nine worlds that ship it, and no way to it in play. Walked once in an emulator, each object names itself; `tools/kula_objlevel.py` writes the floor plan, and `tools/kula_warp.py --cheat` prints the emulator cheat that reaches it.

### /HILLS/HILLS.PAK#15: BONUS 4

The walkthrough's maximum. The disc holds 3500 more, the twelve coins on the corners of the lowest ring: they and the four gems inside that ring cannot both be had, and the walkthrough takes the gems.

### /HILLS/HILLS.PAK#18: HIDDEN 2

The walkthrough's figure, which it marks with a question mark: it leaves one of the ten crumbling blocks, and counts the coin under the exit block, which the Japanese release removes as unreachable. The disc holds 50 more.

### /HILLS/HILLSFI.PAK#0: FINAL 3

From The Cutting Room Floor's Roll Away page.

### /INCA/INCA.PAK#9: LEVEL 40

The walkthrough's maximum. The disc holds 100 more, two crumbling blocks the walkthrough says cannot be reached.

### /FIELD/FIELD.PAK#7: LEVEL 83

The walkthrough's maximum. The disc holds 150 more, three crumbling blocks on the top level that the walkthrough says cannot be broken by any means.

### /FIELD/FIELD.PAK#15: BONUS 16

The redesign is The Cutting Room Floor's. R. Agsten's route in the walkthrough clears the US layout with seven seconds to spare.

### /FIELD/FIELD.PAK#16: BONUS 17

The walkthrough's maximum. The disc holds 4475 more, the gem and two gold coins on whichever end block is reached last, since touching the last block ends a bonus level before anything on it can be collected.

### /FIELD/FIELD.PAK#18: HIDDEN 6

From The Cutting Room Floor's Roll Away page.

### /FIELD/FIELDFI.PAK#1: FINAL 12

The walkthrough's maximum. The disc holds 50 more, a crumbling block the walkthrough says is unattainable.

### /ATLANT/ATLANT.PAK#3: LEVEL 94

The walkthrough's maximum. The disc holds 50 more, a crumbling block the walkthrough says is out of reach. The hourglass and two gold coins on the crumbling blocks are left out because the game never walks what stands on a crumbling block ([level-format.md](level-format.md)), and the walkthrough never sees the hourglass.

### /ATLANT/ATLANT.PAK#11: LEVEL 102

The walkthrough's maximum. The disc holds 750 more, a gold coin inside one of the rings that the walkthrough says cannot be reached.

### /ATLANT/ATLANTFI.PAK#0: FINAL 13

The walkthrough's maximum. The disc holds 200 more, four of the fifteen crumbling blocks, which the walkthrough calls a necessary evil. The three keys on the undersides of crumbling blocks are left out because the game never walks what stands on one ([level-format.md](level-format.md)).

### /HAZE/HAZEFI.PAK#1: FINAL 16

R. Agsten's figure in the walkthrough, one gem better than the author's. The disc holds 30500 more: ten of the eleven gems on the ring at y=28, which cannot be left once reached, and a gold coin.

### /MARS/MARS.PAK#7: LEVEL 128

The walkthrough's maximum. The disc holds 100 more, two of the five crumbling blocks, which the walkthrough's route leaves standing without saying so.

### /MARS/MARS.PAK#10: LEVEL 131

The regional difference is The Cutting Room Floor's, which also calls the coin unreachable; in this release it is not. It is the blue coin on the -x face of the ice block at 7,16,21, and it was collected in play for the level's full 12,290, everything the disc holds (2026-09-24).

### /MARS/MARS.PAK#11: LEVEL 132

The hidden exit at 14,19,18 is the one the walkthrough gave up on. The regional history is The Cutting Room Floor's.

### /MARS/MARS.PAK#12: LEVEL 133

From The Cutting Room Floor's Roll Away page.

### /MARS/MARS.PAK#13: LEVEL 134

The second fruit, on the `+y` face of the crumbling block at 17,16,20, is left out because the game never walks what stands on a crumbling block ([level-format.md](level-format.md)).

### /MARS/MARS.PAK#16: BONUS 26

The walkthrough's maximum. The disc holds 8925 more, three gems under the three far blocks, which only the bouncy pill reaches and which the pill then keeps you from collecting.

### /MARS/MARS.PAK#18: HIDDEN 9

From The Cutting Room Floor's Roll Away page.

### /HELL/HELL.PAK#14: LEVEL 150

The walkthrough's maximum. The disc holds 50 more, the one crumbling block the walkthrough leaves.

### /HELL/HELL.PAK#15: BONUS 28

The walkthrough's maximum. The disc holds 1000 more, the two coins on top of the first platform, a face the walkthrough says cannot be reached.

### /HELL/HELL.PAK#16: BONUS 29

The walkthrough's maximum. The disc holds 750 more, a gold coin's worth that the walkthrough's route does not take and does not name.

### /HELL/HELL.PAK#17: BONUS 30

The walkthrough's maximum. The disc holds 250 more, a bronze coin's worth that the walkthrough's route does not take and does not name. Its thirty pickups are the only ones in the game without a pickup number.

### /HELL/HELL.PAK#18: HIDDEN 10

The 160 blocks of lettering lie flat on z=32, the floor of the lattice and 22 blocks below the playable structure. The other 18 are a frame standing in the xz plane, and everything the level places, the start, the exit, four keys, eight bronze coins and four gems, stands on its `-y` face ([level-format.md](level-format.md) has how the lettering fixed the handedness).
