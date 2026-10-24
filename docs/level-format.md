# The level format

What a level file holds, reading by reading, with what each reading rests on. Every figure here is computed from `public/map_data.json` or from the disc, and the readings that were once got wrong say what corrected them. [tgi.md](tgi.md) is the same document for the artwork.

## The lattice

Every level is one zlib record inside its world's `.PAK`, and inflates to the lattice of `u16` cells, a six-byte header, and a table of 256-byte records. A cell holds `0xFFFF` for empty, one of five block styles below 5, or `5 + i` for a block carrying record `i`.

The lattice is **fixed at 34 x 34 x 34**, and the index is `x*1156 + y*34 + z`. This was not guessed: the executable's own level walk at `0x80033f6c`-`0x80034054` is three nested loops each bounded by `slti ..., 34`, stepping the inner pointer by 1, the middle by 34 and the outer by 1156, and reading `lh` against `-1`. `tools/mips.py` will show it.

`z` is the vertical axis, which the extents confirm: it is the thinnest of the three on 160 of the 230 levels.

**It counts downward**, so the smallest `z` in a level is its highest block and the viewer projects screen up against it. That came from play: `OBJ LEVEL` puts one block at `z=14` against a floor of 114 at `z=17`, and in the game that block floats above the floor. A level that is one flat plane cannot show this, which is why it went unnoticed while only the first two were being checked.

**Seen from above with `x` to the right, `y` counts down the page.** That is the handedness, and no cross-check on the disc can fix it, because a mirror image reads as cleanly as the original; what fixes it is lettering. `HIDDEN 10`, the last hidden level of the last world, carries 178 blocks of which only 18 are the level; the other 160 lie flat on `z=32`, the floor of the lattice, 22 blocks below anything the ball can stand on, and spell VERY WELL DONE in block capitals six blocks tall. It reads that way round and no other, which is also the way LEVEL 1 and LEVEL 2 come out when drawn from play.

The game builds faces for the lattice's inner cells alone: the face builder at `0x800271d8` walks `x`, `y` and `z` from 1 to 32, so a block at 0 or 33 on any axis is never drawn, counted or stood on, and no level on the disc puts one there.

Level records vary in length only because the record table does, and several plausible-looking size relations fit a handful of levels and then fall apart; the lattice was not read off them.

The check that holds is the one `tools/kula_build.py` asserts on every build, refusing to write if it fails: a record repeats the coordinates of the cell that points at it, which is what pins the two representations together, and all 5540 pairs in the game agree. It caught one wrong reading, that every non-zero cell names a record, when in fact the five values below 5 are block styles carrying none. It cannot catch the two below: the framing leaves the cells in the same order either way, and the check never looks inside a record.

## A record ends with its cell

The six bytes after the lattice are the level header: a signed 32-bit word that equals the placed-cell count on 79 of the 230 levels, is negative on 16, down to -51, and is unexplained on the rest, and then a `u16` record count. It ships as `header`, unnamed. Its high half is `-1` on exactly the 16 levels where the word is negative and `0` on the other 214, which is what a sign extension looks like and not what a separate flag would, and no level's count reaches the high half. Nothing in the viewer presents it as a count; what the viewer shows as a level's blocks starts from `placed`, derived by counting the lattice, and adds the blocks the game stands on cells the lattice leaves empty, [below](#blocks-and-the-things-on-them).

Then come `count + 1` stretches of 256 bytes. Read each as *a kind word, six 32-byte slots, 32 bytes never set, 26 of extras, and then the three words of the cell the record stands on*: **the cell closes a record, it does not open the next one.** The first stretch's cell words are where the header sits, so the first record's slots are not padding.

The last is kind 666 and where its cell would be the disc writes three `0xFFFF`, on all 230 levels: it stands on no cell. Its first slot's type and `f2` and `f3` hold a cell, its `f4` and `f5` two numbers, and its `f6` the level's time, which is 99 on 218 of the 230 levels and lower on the other twelve, and the game reads the time alone.

The level lies at `0x8015e000`, lattice first, and `0x80025be4` points the game at its record count (`0x80171314`) and its first record (`0x80171316`); the level's start at `0x80035f5c` takes the record the count points past, and where its kind is 666 multiplies `f6` by 50 into the level's clock at `0x800a573c`, which it sets to 4950, 99 seconds, where the kind is anything else. Every other walk of the record table stops short of the count, and no other code reaches the record: the other places the executable holds 666 are a menu's states and a sound table. So the cell and the two numbers are never read.

The two numbers are multiples of 5 on every level, 0 and 0 on 157, and run as far as -1620, and the cell stands on a block on 213 levels, on a block that carries a record on 192. The time ships as the level's `time`, and the rest does not ship; a level's camera is the game's rule, not the level's ([camera.md](camera.md)).

Framing the stretches the other way round, cell first, reads cleanly and pairs every record with the cell one slot behind it. `Level.verify` cannot tell the two apart, because the cells come out in the same order either way; that check is necessary, and it is what caught the block-style reading, but it is not sufficient.

What settled the framing was play: under the wrong one LEVEL 2's key read as its first coin, LEVEL 1's two coins sat on the same rail when the game has them on opposite rails, and LEVEL 109's first laser read as its second. Under the right one every cell of both levels matches what the game shows.

## A record is a block with six faces

The six slots are the six faces of the block, in the order the game numbers directions: **0 is the top (`-z`), then `+x`, `+y`, `-y`, `-x`, and 5 the underside (`+z`).**

A slot is a kind word, a type, eleven fields, a pad, a value and a pad, and a slot whose type is not zero is an object standing on that face. So a block carries up to six objects, 688 carry two, and since the ball sticks to whichever face it rolls onto a level's objects are on all six, 3485 on tops, 931 on undersides and 1469 on sides; a block whose top slot is bare is not empty: 1262 of the 1266 records that were once read as a "blue coin" on the top are a bare top with the object on another face.

The kind word is the block's and is set in the first slot only, which is why a face's own kind word reads `-1` and why the same coin turns up under kinds 0, 1, 2 and 3: those are kinds of block, not of object, and the type is what names the thing.

Three things fix the face order, none of them a guess:

- LEVEL 1 and LEVEL 2 put everything in slot 0 and everything on top.
- `HIDDEN 10` puts all eighteen of its objects in slot 3, and in play the ball rolls on the `-y` face of its frame: the lettering below is a wall ahead, VERY is up and it reads left to right, which no other face gives.
- A laser's `type` is the direction from its own block to the far end of the beam, on all 123 and on the 37 kind-5 records with the same layout, which is where the numbering of the six comes from.

A fourth check runs on the disc alone: an object on a face cannot sit inside the neighbouring block, and under this order 8 of the 5885 objects on blocks of kinds 0 to 3 do, against 94 for the best of the other 719 permutations. `tools/kula_faces.py` reports what every slot in the game holds.

Four kinds keep words of their own in their first slots in place of what stands on a face, a laser (8) and a moving platform (5) in the first two and a crumbling block (6) and a vanishing block (7) in the first alone. A laser names its two ends in the first and keeps its circuit in the second, a moving platform names the two ends of its run in the first and keeps which end it is at, its length and its speed in the second, kind 6 keeps a fixed-point copy of its own cell in the first, three words that are 512 times its coordinates on all 435, which is what a block that moves would keep, though the game writes 512 over its first word at load and counts that down once the block breaks, and kind 7 keeps where in its cycle it starts in its first field ([motion.md](motion.md)).

**What stands on their other slots is never taken in play, and neither is anything on kind 9**: every walk the game makes over the records for the things on them, the loader's numbering at `0x800355e8`, the start's at `0x800360cc`, the ball's contact at `0x80038548` and the draw at `0x80039254`, takes a record of a kind below 5 and no other, so an object on a platform, a crumbling, vanishing or laser block or the settings record is never numbered, drawn or collected.

The game reads the types in a vanishing block's other slots all the same, for a captivator that walks: whether one may walk over a block is asked of the type in the block's slot for the face it walks on, so the file's type there decides it on any face of a vanishing block but its top, as on any face of a plain block, though no level on the disc brings a captivator to such a face ([motion.md](motion.md)).

The disc keeps 112 objects on the other slots of those four kinds, on 33 levels, and they read as what an editor leaves behind: 80 are a fire or a type 4 alone in the second slot of a crumbling or vanishing block, every other word of the slot -1; every exit, hidden exit, start and boost button among the rest has a twin on a plain block near it, LEVEL 80's exit two blocks along from the one on the vanishing block, LEVEL 130's start three blocks from the one on its vanishing block, FINAL 18's button on the block next to its crumbling one; and the pickups among them, a coin on BONUS 16, a gem on FINAL 11, three keys on FINAL 13, an hourglass and two coins on LEVEL 94 and a fruit on LEVEL 134, all stand on crumbling blocks.

The map leaves them all out, and the record's own marker says what the block is.

Kind 9 is the last record on 160 levels and the one kind no lattice cell ever names, so the engine's walk does not reach it either; its slots hold objects too, 55 of them on 43 levels.

Its first slot the loader reads as the level's settings (`0x80027b2c`): a type of 1 marks a hidden level, which the code numbers mode 2 and draws with the glass ball and every block face half-transparent, and it is 1 on exactly the ten; a first field of 1 turns round how invisible blocks show (`0x80027c78`, and [motion.md](motion.md) has what it turns), on LEVEL 106 to 108, 110 and 111, SIMON 9 and HIDDEN 8. The build ships the two.

A slot has no position of its own; it is a face of the block the record stands on. 51 records are zeroed past the first slot, which puts a lattice-shaped `(0, 0, 0)` in every slot of them, and a rule that admitted any position in `0..33` as a placed entity once read 255 phantom objects out of exactly that, 51 in each of five slots, an even spread that was taken for a symmetry confirming the rule.

## Blocks and the things on them

**A lattice value below `firstRecord` and a record's kind word are the same enumeration**: 0 is a plain block, 1 fire, 2 ice, 3 invisible, 4 the acid block, and a block with something standing on it keeps its kind in the record instead of the cell. Of the cells that hold a style, 4517 cells are plain, then 1065 invisible, 527 ice and 70 fire.

Each kind wears the texture the game paints it with ([tgi.md](tgi.md)), and how the invisible block and the vanishing block show is the game's own cycle ([motion.md](motion.md)). The loader reads a cell's style as its kind (`0x8002df84`) and paints the block by the kind, so a style is not a texture: a plain block draws one of the world's four stones at random per face, and the other kinds the texture the artwork's model table pairs with their number ([tgi.md](tgi.md)).

Style 4 is one cell in each copy of `OBJ LEVEL` and nowhere else, and in play it is the green block the loader paints with the acid splat.

The game has **30 distinct object types** and names none of them. What stands on a face is named the same way, by the model the game draws for it ([ggi.md](ggi.md)) and what it does in play, and play gives the points: coins at 250, 500 and 750 by the value of their one varying field, gems 2975, keys 1000, fruit 2500, an hourglass 1190, sunglasses 500 and a crumbling block 50.

Syonyx's Roll Away walkthrough (GameFAQs, 2006) states a maximum score for 209 levels, and by those points the disc's total is that maximum on 193 of them, which is what says that everything on those can be collected; it never scores higher than the disc holds. On the other 16 the disc holds more: play collects everything on five of them, and on the other 11 something cannot be collected.

A level with no key scores 50 for every block the ball rolls onto, the first time, and the game counts the blocks it builds as it builds them (`0x800271d8`): a block of the plain, fire, ice, acid, crumbling or vanishing kinds, at the lattice's inner coordinates 1 to 32, with at least one face built. So an invisible block is not one of them, nor a block sealed on every side, a platform or a laser's own block, and the map counts the same way.

The points live in `annotations.json`, because the levels do not hold them, and so does the best score on each of the 11, as the level's `score` with a note naming what is out of reach: a crumbling block that cannot be broken, a coin inside a ring, or the gems on a ring that cannot be left. The map shows each level's total, the curated score out of it where there is one, and `python3 tools/kula_score.py` prints them all.

The unit tests hold each curated score below what the disc holds, so it cannot outlive its reason, and the points to the figures this document gives, so one cannot change without the arithmetic changing with it.

Type 42's 1550 is the one points value that rests on the executable rather than play, since only the object catalogue holds one; [annotations.md](annotations.md) gives what each name and value rests on, entry by entry.

**A level with no key plays as a bonus level, by its keys and not by its slot.** The loader's mode routine at `0x80027b2c` counts the keys, every slot of type 31 in the six slots of every record of a kind below 5 (`0x80027b4c`, `0x80027b64`, `0x80027b88`, `0x80027bac`), into a count at `0x800a5efc` it clears first (`0x80027b3c`), and writes the level's mode word, 9372 past gp at `0x800a53d4` (`0x80027b30`): 1 where the count is nothing and 0 otherwise (`0x80027bd4` to `0x80027be8`), then 2 where the settings record, kind 9, carries a type of 1 in its first slot, the hidden flag (`0x80027c34` to `0x80027c74`), and last 0 again where the game's mode word at `0x800a33b0` is 1, the Simon rooms' (`0x80027cb4` to `0x80027cc4`).

Nothing else writes the level's word, and the two words are two: the game's names the game being played, 1 in the Simon rooms, and the level's names the level's own mode, 0 the arcade's, 1 a level with no key and 2 a hidden level, which the deaths' penalty and the ending's view read ([motion.md](motion.md)). The start routine at `0x80035fbc` sets a second flag from the same count outside the Simon rooms.

The mode is presentation: the second set of textures, the bonus song (`0x80040678`), the key icons off and the blocks-left meter on, no level number on the pause screen, and the level that follows, which is the slot last saved on entering a bonus or hidden level (`0x800427d4`) rather than the next one. The flag is the play:

- A block is marked and 50 added to the score the first time the ball stands on it, and the block under a wall as the ball climbs it (`0x8002dc30`, from `0x80030490` and every frame from `0x8003ae74`).
- The level ends with result 2 when the count of unmarked blocks reaches zero (`0x8003ae7c`).
- A death or a time-out leaves the level's score at nothing, as it does on a hidden level (`0x80041b24`).
- The ball is one of the three bonus balls by a counter the start routine steps at every level start since the game was switched on (`0x8003601c`).

A level with no key and an exit has the exit's face marked open from the first frame, since the marking asks only that the key count be zero (`0x8002c150`), but the ball cannot leave by it: the contact walk tests the exits only while the flag is clear (`0x8003ad84`), and with it set takes the block-marking path, which jumps past both exits' tests (`0x8003ae7c`, `0x8003afb0`), so such a level ends only by its blocks. The exit also keeps the red model and the slower turn the loader gives every exit, which only the last key changes ([motion.md](motion.md)).

The slot word (`0x800a3408`) is read by the menus, the HUD and the level advance alone: nothing the ball, the loader, the faces or the scoring do looks at it, so a level with no key plays as a bonus level in a numbered slot and a level with a key plays as an arcade level in a bonus slot.

A level is wider than its lattice. A `kind 8` record spans a beam between two cells it names in its own fields: on all 123 in the game the pair differs on exactly one axis, the type is the direction to the far end, one field gives the axis and another says whether the beam starts lit, and no block ever stands between the two ends.

The beam's colour is a word of the record's second slot, a circuit number the switches and teleporters of that colour share, 0 yellow, 1 blue, 2 green, 3 red; LEVEL 109 lines five of them up as red, yellow, green, yellow, red and the word reads `3, 0, 2, 0, 3`, and LEVEL 98's three lasers and three switches read the same three numbers.

**64 of the 246 ends are cells the lattice leaves empty**, and the game stands a block on each anyway: the routine at `0x80035a70` walks the records at load, and for each kind 8 (`0x80035ab4`) writes style 0 into the lattice at both ends (`0x80035b2c`, `0x80035bb8`, `0x80035c38`, `0x80035ca8`) and `-2` into every cell between (`0x80035a94`, `0x80035b68`), a value no level file holds. `OBJ LEVEL` shows it in play, carrying one lattice block above its floor where the game draws two, joined by a beam. So `placed` counts the lattice and the lattice alone, and the viewer adds the ends a beam names.

A moving platform (kind 5) has the same layout: its `type` is the direction it sets off in, the first three of its cells are the end of the run lower along the axis and the next three the end higher, and its second slot holds which end it is at, how many blocks long it is, 2 or 3, laid from its cell along the positive way of the axis its first field names, and its speed, 30 a frame on all 37, which the loader scales by 50/60; the routine at `0x80032af4` runs it, and [motion.md](motion.md) has the numbers.

Only a platform's first block has a cell in the lattice: the other 40, on 25 levels, stand on cells the file leaves empty. So what the viewer counts as a level's blocks is every block in play, the lattice's, the empty ends of a beam and the rest of a platform.

The game draws the beam a cell at a time, from the face of one end block to the face of the other, and neither end is the emitter: [motion.md](motion.md) has how it is built and drawn.

## The fields of an object

A slot is sixteen words, and the map names each by its place in the slot, counting the kind word as 0: the type is word 1, the eleven fields are `f2` to `f12`, which ship as the list `f`, and the value is `f14`, which ships as `v`. Words 13 and 15 hold only `-1` or `0` on the disc, in all 34,200 slots, and the build leaves them out; the game writes to both as it plays ([motion.md](motion.md)). The fields were once numbered from 5, the place they had when the record was read cell first, and commits from before the change use those numbers.

What each means is read per type: `annotations.json` names the field that tells a type's variants apart (`by`), the one that holds the way it points (`facing`) and the one that says whether a switched device starts on (`state`).

A `facing` field is not one of the six direction numbers: it takes 1 to 4 and turns the thing a quarter turn at a time about the inward normal of its face, from a first tangent that is the world's `+y` laid onto the face, the world's up on the `+y` face and the world's down on the `-y` face. LEVEL 62's arrows fixed the top in play, one arrow of each value, pointing +y, -x, -y and +x; LEVEL 106's fixed three sides, its `+x` arrows reading 2 and pointing up, its `-x` arrows reading 4 and pointing up, its `+y` arrows reading 1 and pointing up, which one first tangent could not give and the two above give exactly.

The `-y` face was once read as the `+y` face's mirror, up; the executable's own table of the six faces, at `0x80039ec0` for the things on a block and `0x8003f98c` for the captivators, lays a first tangent of `+y` on four faces, up on `+y` and down on `-y`, and agrees with play on the four faces play had fixed, so the map took its word for the fifth, and play then fixed that one too: LEVEL 68's three arrows on a `-y` face, reading 3, point up under it in the game as they do on the map.

`f3`, 0 to 3 on the moving spikes and the corkscrew, is where in its cycle it starts, which LEVEL 122's corkscrews going up in sequence says.

The two stars face along a straight run of cells a ball could stand on, to the edge of the platform or a wall, and on LEVEL 141 a group of four travelling in a line face `+x` along one seven-cell stretch; where each goes from there is the executable's rule, which [motion.md](motion.md) has.

Two fields are the same for every type that has them.

**`f5` numbers a level's pickups, on the disc.** It is set on exactly the pickup types, key, the two pills, hourglass, gem, coin, sunglasses, the five fruit and the two catalogue-only types 34 and 42, and on nothing else, and within a level it runs 0 to n-1 with no repeats on 223 of the 228 levels that have any. The five with a repeat are BONUS 16, LEVEL 94, LEVEL 134, FINAL 11 and FINAL 13, and on each one of every pair that shares a number stands on a crumbling block, which the game never walks: the editor numbered them and the block was changed under them after, and with those left out no level on the map repeats a number.

The game does not play by the disc's numbers in any case: the loader at `0x80035998` numbers the objects it walks afresh, in the order it meets them. The 30 pickups whose number is unset, all on BONUS 30 with their `f9`, `f10` and `f14` unset too, get one the same way; TCRF records BONUS 30 as the one arcade level rebuilt between the PAL and the NTSC release.

The record table is not a skin table: it holds coins, keys and beams, and its last entry stands on no cell at all. How a block looks is the loader's rule, by the kind and by the type of what stands on each face, and [tgi.md](tgi.md) has it: the type paints the face too, a plate under a device, a shadow under a pickup, and the thing itself stands off the face.

**The start is the last slot of type 30 or 29 the loader meets** walking the records of kinds below 5 and their six slots (`0x80036100`): it stands the ball off that face, turned by the slot's `f2` the way an arrow is, and where the type was 29 writes 8 into the slot (`0x8003627c`), so the ball starts on a clock. ARCTIC's LEVEL 58 and Hell's LEVEL 136 do, each with no type 30 at all, and in play both start the ball on a clock. Every level has one start the game reaches; LEVEL 130's second, on a vanishing block, is one it never walks.

**`f4` on a teleporter or a switch is its circuit's starting state**, 1 for on and 2 for off, and it is the same bit the laser record keeps for whether its beam starts lit. On every level that has lasers and switches or teleporters of one colour, the two agree, no exceptions across LEVEL 93, 97, 98, 101, 103, 104, 105, 109, 124, 136 and 149, FINAL 3, 6, 10, 18 and 20 and the nine copies of OBJ LEVEL. The draw lights a teleporter, a switch or an exit while its `f4` is 1 ([motion.md](motion.md)). The map draws the disc's reading, a device that starts off hollow and a beam that starts dark not at all, or broken among the outlines.

**A switch flips a list, and a teleporter names where it sends the ball.** Both keep a link, a word that is a record's index times sixteen plus a face, with face 6 naming a laser's own record.

The switch's routine at `0x8003a388` runs when the ball comes onto a switch (`0x8003a3bc`) and walks the list the switch's `f7` starts: a switch or a teleporter on it has its `f4` turned from 1 to 2 or back and names the next in its `f6`, and a laser has its lit flag, the first slot's `f3`, turned from 1 to 0 or back and names the next in word 7 of its second slot (`0x8003a494` to `0x8003a570`); -1 ends the list.

On every level each switch's list is exactly the switches, teleporters and lasers of its colour, itself among them, 104 switches in all, and since a colour starts on or off as one, a press turns the whole colour over; the build checks every list against its colour and refuses to write if one differs.

The teleporter's routine at `0x8003a58c` runs while the ball stands on a teleporter whose `f4` is 1, counts down from 15 (`0x8003a638`), and then puts the ball on the face its `f7` names, at that record's cell (`0x8003a6e4`), facing the way that teleporter's `f2` says through the routine that faces the ball at the start (`0x80038178`, which `0x80036114` calls too, and which turns the heading for an `f2` of 2, 3 or 4 alone, so a 0 there heads as a 1 does).

All 147 name a teleporter of their own colour, which the build checks as well, and a colour's teleporters on a level send the ball round one ring: 55 pairs, 18 that name themselves, two in each copy of OBJ LEVEL, and four longer rings, LEVEL 68's three blue and five yellow, LEVEL 70's three green and BONUS 23's eight red, each gone round one way.

## Level numbers and world names

The game numbers its levels straight through the worlds (`LEVEL 1`-`LEVEL 150`) and keeps the bonus and hidden levels and the lesson in the same packs, and the finals and the Simon rooms in packs of their own, all under their own names.

Those names are in the level records and the game never shows them for a numbered level: the pause screen's number comes from the routine at `0x800478dc`, which computes the world's place times fifteen plus the slot plus one, and times two plus 151 for The Final. So Atlantis's `LECEL 94` plays as LEVEL 94, and Hell, whose records say 135 to 138 and then skip to 140, plays as 136 to 150. The build ships that number as `shown` wherever the engine computes one.

World ids are the disc's directory names (`HIRO`, `ATLANT`, ...), and that is all the game has: the executable's only mention of a world is the path it loads the pack from, so the disc supplies no player-facing world name at all.

## The levels no menu asks for

A world's pack holds twenty slots: 0 to 14 are the numbered levels, 15 to 17 the bonus ones, 18 the hidden one, and 19 the slot no menu asks for, which is `OBJ LEVEL` in every world but the first, where it is the Japanese release's tutorial.

**`OBJ LEVEL`** ships in nine of the ten worlds, identical every time, and never appears in the game. It is the developers' object catalogue: 36 objects and nine records of the kinds that are their own thing on a flat floor, covering **23 of the game's 30 object types**, and the seven it misses are placed 124 times between them against the 23's 5,437. Everything on it stands on top, so walking it once in an emulator names most of the game's vocabulary and says nothing about faces. `tools/kula_objlevel.py` writes the floor plan and the sheet to fill in.

**Any level is a cheat away.** Aris Efraimidis's GameShark codes name the three words the game loads a level from: `800A340C` and `800A3410` take the world, 0 to 9 in pack order, and `800A3408` the slot within it.

An emulator cheat that sets those reaches any of the 200 without touching the disc, and `python3 tools/kula_warp.py --cheat --level /HELL/HELL.PAK#18` prints it in the form DuckStation takes, together with `800BA296 0001`, which frees the camera to orbit the level the way the Japanese release's Select button does ([camera.md](camera.md)); the word is from The Cutting Room Floor, whose Roll Away page is also where the regional differences the level notes cite come from.

Without `--cheat` the same tool writes a patched disc image instead, which is the way for a real console or for the packs the cheat cannot name.

The developers had a shorter route still: Left, Up, Right, Down, Square, Triangle, Circle, Cross on the pad arms a loader that takes a level over the console's serial port, and the code is still in the shipped build.
