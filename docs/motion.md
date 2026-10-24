# How each thing moves

What the executable does to every object and every moving block each frame, read off the code of the NTSC-U release with `tools/mips.py`, and what each reading rests on. `python3 tools/kula_motion.py` prints every number below with the address it was read at and stops if an instruction is not the one it expects.

`--table` prints what the build ships under `motion` in `public/objects.json`, in the game's units, from the readings below and from what [camera.md](camera.md) and [ggi.md](ggi.md) read of the camera and the models, the rates by type and by kind of block among it, with the two cycles below as a frame program per phase, simulated from their routines and cut at one frame for all four phases so the game's spacing between them survives.

The viewer draws everything that moves on the spot from that table, on a clock of sixty frames a second that starts at the level's first frame as the level opens, as play's does, and stands while the page is hidden, and what travels across blocks does so from the same table and the rules below, one game frame at a time; the Motion switch holds all of it at that first frame, except for a few things posed to show what they are.

[level-format.md](level-format.md) is the same document for the level file and [ggi.md](ggi.md) for the meshes.

## The frame

**Everything below is per frame, and a frame is a sixtieth of a second.** The play loop at `0x80040210`-`0x800406c4` runs one level a pass (`0x80040690` calls `0x80040718`), and that routine loops a frame at a time from `0x80040aa0` to `0x80041c34`.

Each pass waits once, at `0x80051d08`, for a flag that a callback installed through the system library before the loop sets (`0x8003fdb4`, installed at `0x80040a7c`), which every rate play has borne out puts at once a vertical blank; unless one of two words is set, `0x800a572c`, the lethargy pill's mode word, which stands while the pill works and halves the game's pace ("What the ball takes" below), or `0x800a592c`, the word of the teleport's flash, which `0x80020764` writes (`0x8002076c`) and a teleport's send sets to 1 ("The effects" below), in which case the wait is `VSync(2)` (`0x80040ad8`, `0x80040af4`, `0x80040af8`), two blanks, and a counter at `0x8004188c` ticks by two instead of one.

Play bears out that the level's clock ticks once a pass, 50 ticks to a second it shows: OBJ LEVEL's 99 seconds are then 4950 passes, and play counted 57 moves of a wandering ball in them, at 86 a move, where 99 seconds of sixtieths would have held 69.

A cross-check comes from the level data: a moving platform's speed on the disc is 30 units a frame on all 37, and the loader at `0x80032a5c` scales it by 50/60 before use, which is what a game authored for a 50 Hz release does when it is built for 60. The rates that live in the code carry no such scaling, so on the PAL disc they may run at 50 a second or may have been retuned; this disc says nothing about that.

Angles are in 4096ths of a turn, the unit the sine table at `0x8005fb58` takes; distances are in units of which a block is 512; and one word, `0x800a33d0`, gates every update below with a test against zero. It selects a second view the shipped game never draws: it is a data word that loads as 0 and is never written, so the gates are always open.

The table ships the frames of a second, sixty, as `hz` and the angle of a whole turn, 4096, as `turn`.

## The things on a block

The routine at `0x80039200` walks every record of kinds 0 to 4, every slot of each, and every object whose `f4` is not zero, and both advances and draws it; the table at `0x80010290` sends each type to its own case.

**An object's angles live in its own slot**: `f11`, `f12` and `f13`, which this document calls A, B and C, are set at load (`0x80035930`) to random values up to 4095 for every type the loader knows, so the phase of every pickup is random on every visit, and the map hashes it from the thing's cell so that it is the same on every visit here; the boost button alone starts at A = 16. Which angle turns which axis is named by the game as x, y and z, and its z is the axis [ggi.md](ggi.md) calls y, the normal of the face the thing stands on, since a coin's spin is its z.

The bob some types have, and the catalogue star's circling, are an offset the routine adds to the object's position, and before it does it turns the offset by the object's own matrix (`0x80039cf0`), the one `0x80039ec0` builds from its face and facing, so a bob is along the face's normal on whatever face the thing stands, twenty units either way where a block is 512, and the circling is in the face's plane.

| type | what it does, per frame |
| --- | --- |
| 31 key, 37 coin, 38 sunglasses | turns about the normal by −75, a turn in 0.91 s; bobs by 20·sin C + 10 with C stepping −58, a cycle in 1.18 s |
| 36 gem | turns by 29, a turn in 2.35 s; no bob; its facets glint ("The gem's glints" below) |
| 43 to 47 fruit | turns by 20 (3.4 s a turn); tilts by 150·sin B about its own `x`, across the way it points, 13° either way, with B stepping −66 (1.03 s); bobs by 20·sin C + 10 with C stepping −50 (1.37 s) |
| 35 hourglass | swings by 2048·sin A + 30 about the way it points, half a turn either way and back, with A stepping 26, so it goes over twice in 2.63 s; and turns about the normal by −16, a turn in 4.3 s |
| 32 to 34 pills | flips about the way it points by 66 (1.03 s a turn) while turning about the normal by 20 (3.4 s) |
| 42 catalogue star | A steps 13 and the form is the brown model while A is below 2049 and the green one after, so it changes every 2.6 s; it circles its block's centre at radius 100 with C stepping 83 in the brown form (a lap in 0.82 s) and 6 in the green (11 s), turned about the normal by 1024 − C; a third angle B grows while green and is not drawn with |
| 5 teleporter | turns about the normal by 25 (2.7 s) while its `f4` is 1, on, and stands still while it is off, so one that starts off stands at the random angle the loader gave it |
| 7 exit, 26 hidden exit | turns by −45 (1.5 s) while its `f4` is 1, open, and by −20 (3.4 s) otherwise (`0x80039678`); the loader writes 1, the red model, into an exit's `f3` whatever the level holds there (`0x80035874`), and the last key sets it to 0, the green model, and `f4` to 1, and writes 1 into the hidden exit's `f4`, which every hidden exit holds as 2 on the disc and the loader sets to 0, so the walk, which passes over a thing whose `f4` is 0, takes it up and turns it at the open rate (`0x80038a78`, `0x80038a84`, `0x80035898`, `0x80039288`) |
| 9 switch, 11 moving spikes, 12 spikes, 28 arrow | no turn; the moving spikes' frame is written by the routine below into `f8`, which the draw command carries (`0x8002d920`) |
| 10 boost button | reacts to the ball and does nothing on its own: A is a height of 16, sinks by 1 a frame, to flat and no lower, while the ball is within 700 units, and rises by 4 a frame after, the model's height scaled by A/16 along its normal (`0x80039b48`): flat in 16 frames, a quarter of a second, and back in 4. Once A is back to 16 or more the game draws the model unscaled, so a rise from a height that is not a multiple of 4 overshoots by up to 3/16 for one frame and no longer |
| 39 to 41, 48, 49 | the placeholder arrows turn by −14 |

The variant a type draws is `f3` for every type, read by the draw dispatcher at `0x8002d878` as the model `type × 16 + row × 4 + f3` in the second table of the .GGI, the row a level of detail ([ggi.md](ggi.md)), which is why a coin's tier, a gem's cut and a teleporter's colour are all the same field, and why type 42 changes its shape by writing its own `f3`.

Three more things happen in the draw and not in the walk:

- A teleporter, a switch or an exit whose `f4` is 1 turns a light on the faces round it over every 19 frames (`0x8002d424`, and "The devices' light" below).
- The exit's face shows the second quad of its model, the green cross, on every frame with no keys left (`0x8002c150`), the face being the last exit face the loader builds, which walks the lattice with `z` outermost and `x` fastest (`0x8002787c`, `0x800279fc`), as the exit the last key opens is the last the object loader meets, which walks the records in their order (`0x80035868`), so that where a level has more than one exit the two can be different exits.
- A fruit's type is rewritten at load to the lowest of the five whose bit in the word at `0x800a5664` is clear (`0x80035664`), which reads as the first not yet collected; the map draws a numbered level's fruit by the level's number counted round the five, the picture of a run that takes every one, and while a run is on places the level's fruit by the run's own word, as the loader does ("What the ball takes" below).

The loader also numbers each object it knows in the order it meets them and writes that into `f5` (`0x80035998`), the index of its runtime entry, so the number the disc holds there is not the one the game plays by.

The viewer steps a boost button's count as the game does, a frame at a time, and presses it with the ball at the level's start, measured from the point where the ball touches its face to the button's place on its own face. The game measures from the ball's position (`0x80039b74`), its centre, 100 off the face ("The ball's moves" below), to the middle of the button's block, the cell times 512 that the walk over the things writes before the button's case reads it (`0x80039294` to `0x800392a0`, `0x80039b6c`).

The two measures agree on every button on the disc but two: the six beside a start, on LEVEL 29, 30 (two), 42 and 91 and SIMON 8, sink flat as a level opens under either, as they do in play, and the two on SIMON 8 and LEVEL 119 that stand on a neighbour's far face are 724 units from the touch point, so the map leaves them up, and 624 from the centre to the middle of their block, so the game's measure sinks them ("Not settled" below).

The block under the pointer and the selected block press a button too, each as the ball standing on that block's face the button stands on, since a block has no face of its own to give; so a button sinks as the pointer reaches its block or one beside it, springs back when the pointer leaves, and stays down while its block or a neighbour is selected, which on a touch screen is a tap.

## The ball

The ball at rest breathes. Its draw at `0x80031024` scales it by two matrices, one from a word at 700, which the level's load clears (`0x80035e34`) and a routine of the jump's alone writes (`0x80032558` to `0x8003259c`), not read here, and one for an idle swell that never stops (`0x800325c0`): an angle steps by 40 a frame plus a fortieth of what the level's time is short of 6000 ticks, the time being kept in fiftieths of a second (`0x80035f90`), and the ball is drawn 200·sin of it wider across the face, in 4096ths, and twice that shorter along the normal, a landing's squash riding on the same word ("The ball's roll" below); the first matrix is wider by an amount taken from its word and shorter by the same (`0x8003138c` to `0x8003139c`).

Both scale the ball about its centre, and the draw then moves the centre along the normal by the ball's radius of 100 times what the two have taken off its height (`0x800314c4`), so its underside stays on the face and its top alone rises and falls. On a level with 99 seconds that is a breath every 62 frames, just over a second, quickening to one every 22 as the clock runs down; the squash is applied after the ball's roll and before its face's orientation, so it is always along the face the ball stands on.

## The ball's moves

**The ball keeps a frame of three unit vectors, a heading, a side and a normal, and a position, and reads the lattice about itself every frame.** Its record is at `0x800ba114` (`0x8003688c`): the heading at 12, the side at 20 and the normal at 28, each three halfwords of −1, 0 or 1, and the position at 60, in units of which a block is 512, lying in the cell whose 512 units hold it (`0x80037464` to `0x80037470`).

The start lays the three through `0x80038178` from the face and the slot's `f2` ([camera.md](camera.md)), the normal being the face's outward normal (`0x80038260` to `0x800382b0`), and `0x800383ec` lays them as a matrix in 4096ths at 212, the side, the heading turned round and the normal its columns (`0x80038400` to `0x80038454`).

The draw lays a second from the same three at 564, the side, the heading turned round and the normal turned round its columns (`0x800310dc` to `0x8003115c`), the frame the model is drawn in, which says nothing of the way the ball goes, and the body's own turn within that frame is a third matrix, at 596 ("The ball's roll" below).

The position is the ball's centre: the start puts it on the face, at its cell's centre and 256 along the normal (`0x800361c8` to `0x8003621c`), and the state the ball rests in lays it 100 units off the face plane nearest it along the normal on every frame from the first (`0x8002f8e8`, `0x80037e8c` to `0x80037e98`, `0x80037ec4`), the cell boundary within 256 of the centre, so a centre as much as 356 below where it rests, 256 into its block, or short of 156 above it comes back to the same face, and the distance off the face is kept at 334 (`0x80037bc4`), the h the shadow fades by ("The shadows" below).

**Each frame the ball's routine runs the input routine, then the ball's state, reads the 27 cells about the ball, measures where it is within its cell, takes the move step and then runs the camera** (`0x80036540`, `0x80036838` to `0x800368dc`). The states dispatch by the state plus one through the table at `0x80010134` (`0x8002f8bc`, `0x8002f8d4`), −1 at rest, 2 rolling and 7 going round an edge, and `tools/kula_motion.py` holds the table to the three.

Rolling, the state multiplies its speed by the heading and adds that to the position (`0x8002f9d8` to `0x8002fa10`), **so the heading points the way the ball travels**; the one place the move step subtracts the same product (`0x80030350`) is a frame's advance taken back, below.

The 27 cells are read by `0x80037430` into words from 104 of the record (`0x8003762c`), a word a cell (`0x8003764c`), three along each axis of the frame (`0x80037798`), starting from the cell under the ball's own, one back and one over to the side (`0x800374a8` to `0x800374bc`).

Each word up adds the normal, each word on adds the heading and each word over takes the side off (`0x80037590` to `0x800375a8`), so the words step 4 bytes over, 12 on and 36 up, and the block under the ball's cell is the word at 120 (`0x800377a4`), the floor ahead of it at 132, the cell ahead at the ball's own level at 168, the two beside the block under at 116 and 124 and the two beside the block behind that at 104 and 112.

A word holds −1, empty, where the lattice holds nothing or the cell lies at the lattice's edge or past it, at 0 or at 33 or beyond on any axis (`0x800375e0`, `0x800375fc`, `0x80037450`, `0x80037730`), and otherwise what the lattice holds, a style or a record, as it is (`0x80037688`, `0x80037694`), a moving platform's cell alone read otherwise (`0x800376c0`). So a block the ball can stand on or roll against is any cell the lattice fills, an invisible block, a crumbling block and the block a laser's end stands on among them, and a beam's cells, −1 or −2, read as empty.

**The ball's progress through its cell is measured from the edge behind it, so that 256 is the middle.** `0x80037a98` takes how far the centre is into its cell along each axis, its position plus 256 within 512 (`0x80037aa8`), and keeps the one along the heading at 336, taken from the cell's far side where the heading runs the other way (`0x80037b10`, `0x80037b2c`), with the last frame's at 344 (`0x80037af4`).

The one along the normal is kept at 334 the same way, from the far side where the normal runs the other way (`0x80037bac` to `0x80037c5c`): how far along the normal the centre is into the cell it lies in, 100 at rest, starting over from nothing as the centre crosses into the cell above, with the frame's change along it at 326 (`0x80037d2c` to `0x80037d3c`).

`0x80037d48` lays a progress by moving the centre along the heading from the edge behind it (`0x80037d6c`, `0x80037d74`).

The ball has come to the middle of its cell where its progress is 256 or more and the last frame's was 256 or less (`0x80030e44`, `0x80030e4c`, `0x80030e58`, `0x80030e60`).

**The move step runs in the rolling state alone** (`0x80030264`), and first asks whether the ball has come to the middle of its cell (`0x8003026c`): there it stops, the centre laid at the middle, the speed nothing and the state at rest, where the forward request is gone or a turn is asked (`0x80030284` to `0x800302b0`), so the ball rests at the middles of cells and nowhere else.

Else it asks whether the ball may roll on (`0x800302bc`, `0x80030dfc`): it may where the floor ahead is there, else where both cells beside the block under are empty, else only on ice, the word at 356 being 2 (`0x80030e04` to `0x80030e38`).

Where it may not, a roll short of the middle goes on to it, a roll on ice would slide on past it (`0x800302dc`, `0x800302e8`), a branch never reached since the predicate refuses nothing on ice ("The blocks under the ball" below), and a roll already past it stops where it is, the frame's advance taken off the position again (`0x800302d4`, `0x800302f0`, `0x80030350` to `0x8003037c`). Where it may, two things can change the face the ball is on, and the roll on to the block ahead is what happens where neither does.

**A wall ahead takes the ball up it, with no arc.** Where the cell ahead at the ball's own level holds a block (`0x80030388`, `0x80030390`) and the progress has reached 413 (`0x800303a0`, `0x800303a4`), the move step lays the centre at 412 along the heading, 100 short of the wall and so touching it (`0x8003049c`, `0x800304b4`), and writes −1 into the word at 428 (`0x800304a0`, `0x800304a4`).

The view routine `0x80034a50`, which the camera runs later in the same frame (`0x800368dc`, `0x80034380`), reads that word (`0x80034cdc`), turns the heading round into the normal and puts into the heading the normal it saved at 52 as the last ramp ended or as the start ran it once (`0x80034d00` to `0x80034d5c`, `0x80034de0`, `0x80034e14`, `0x80036260`). So the heading becomes the old normal, up the wall, the normal the old heading turned round, out of the wall, and the ball stands on the wall's face 100 off it, at a progress of 100 from the floor it left, and rolls on up to the middle of that face.

The wall takes the ball whatever stands beside the block under; its one gate is that the roll was allowed at all, which asks that the floor ahead be there under the wall, or both cells beside the block under be empty, or the ball be on ice.

**An edge takes the ball round it, onto the next face of the block it was standing on.** Where the centre has passed the edge, the ball's cell having become the cell ahead, with no block under that cell (`0x80030500`, `0x80030508`), where the words at 104 and 112, which from there are the two cells beside the block the ball is leaving, are both empty (`0x80030510` to `0x80030528`), and where the last frame's progress plus the speed reaches 512, the cell's far edge, past which the progress itself has wrapped (`0x80030530` to `0x80030544`), the move step enters state 7 (`0x80030560`, `0x80030564`), lays the progress at nothing (`0x8003055c`, `0x8003058c`) and swaps the frame: it keeps the normal turned round at `0x800a4854` (`0x8003059c`, `0x800305a0`), puts the heading into the normal and that turned normal into the heading (`0x800305d8` to `0x80030600`).

So the normal becomes the old heading, out of the block's far face, the heading the old normal turned round, down that face, and state 7 runs the centre round the edge and puts the ball back rolling (`0x8002fc44`), from where it rolls on to the middle of the new face. The two cells it asks after are the side rule's: going round an edge needs the floor ahead empty and both cells beside the block under empty, and an edge where a block stands beside the block under is refused by the predicate above, and in the Simon rooms by the input routine too.

**The input routine's case for the Simon rooms refuses the edge beside a neighbour before the roll starts; the arcade's case leaves the request standing, and the roll's own gate refuses it.** The routine takes the pad into three requests, forward at 96, a turn at 92 and a jump at 100, and its case for the Simon rooms' mode ("The Simon rooms" below), where forward is asked and no jump is, drops the forward request where the floor ahead is empty and a block stands beside the block under on either side (`0x8003700c` to `0x8003705c`); the arcade's case (`0x80036c24` to `0x80036e48`) reads no cell, and nothing else reaches that test.

At rest the forward request starts the roll where a block is under the ball and it may roll on (`0x8002f560`, `0x8002f698`, `0x8002f6a8`, `0x8002f6d0`), so a ball facing such an edge from rest does not move in either mode, and one rolling toward it stops at the middle of the last block: in the Simon rooms the request is dropped on every frame it stands there, and in the arcade the move step, finding the roll refused at the middle, lays the centre there and the ball at rest with the speed at nothing (`0x800302f0` to `0x80030308`, `0x80030378` to `0x80030384`). A jump asked with it lets the request stand.

On ice the predicate lets the ball roll on over such an edge, where nothing takes it round, into the cell ahead with no block under it.

## The ball's roll

**Each frame the ball's routine runs in one order: the level's clock, the pad, what moves and what can hurt, the ball's intents and state, the cells about it, its place in its cell, the move step, the landings, its contact with what it stands on, and the camera** (`0x800362f8`, `0x80036540`, `0x800366bc`, `0x800366f4`, `0x8003670c`, `0x8003679c`, `0x80036830` to `0x80036848`, `0x80036890` to `0x800368a0`, `0x800368cc`, `0x800368dc`, `0x800368e4`).

The pad is not read while a countdown at 370 or 372 of the record runs, the first a device's, an ending's or the fly-in's wait ([camera.md](camera.md)), the second a run of frames the game rolls the ball for itself: before the pad, on every frame the count at 372 is not nothing, the routine takes one off it, asks the roll and drops the turn and the jump (`0x800364dc` to `0x80036504`), and the gate reads the count after, so the pad is read again on the frame it reaches nothing (`0x80036514`, `0x8003651c`, `0x80036524`); nor is the pad read while the ball stands on a boost button, type 10 in the word at 356 (`0x80036528`, `0x80036538`).

The draw that follows (`0x80036958`) draws the ball and then the things on the blocks (`0x800369ac`, `0x800369b4`), and takes the cell of the point 256 along the normal from the ball's centre on each axis, and where that cell is 36 or more, or −2 or less, writes −3 into the level's outcome word, the ball lost (`0x800369bc` to `0x800369ec`, `0x80036a18`, `0x80036a5c`, `0x80036a64`).

The view's target is the centre with a platform's travel added, written at 388 before the camera runs (`0x800368a0`, `0x8002f3d4`, `0x80034f38`, and [camera.md](camera.md)).

**The pad asks three things of the ball: the roll while Up is held, the jump while Cross is held, and a turn, left or right, as Left or Right is pressed** (`0x80036e20` to `0x80036e48`, `0x80036cac` to `0x80036cf4`), into the requests at 96, 100 and 92, a turn being 1 for left and −1 for right, all three of which it first puts at nothing (`0x80036b44`, `0x80036b98`, `0x80036b9c`), so a request made earlier in the frame stands only where the pad is not read.

The pad is the console's digital word, Up 16, Right 32, Down 64, Left 128, Cross 16384, R2 512 and R1 2048, as held this frame, and a press is a bit held now and not on the last frame, whose word the loop keeps on every frame, read or not (`0x80040cc0`, `0x80036be4`, `0x80036bf0`, `0x80036cac`).

A count at 364 runs while no turn does, and once it has passed 6 the last frame's pad is forgotten, so a held Left or Right presses again from the seventh frame after a turn ends (`0x80036c4c` to `0x80036c68`, `0x80036b10`), the 6 standing while the option at `0x800a33b4`, which the options menu toggles (`0x8004814c`, `0x80048154`), is set, and 0 otherwise, a held turn then repeating at once.

A Left or Right pressed while a turn runs waits at 360 or 362 and is asked as the turn ends (`0x80036d18`, `0x80036d38`, `0x80036c84`).

Nothing is read until the view routine has marked the ball live at 460, which the fly-in holds off for 69 frames (`0x80036c2c`, `0x80034a6c`, `0x80034348`).

While the bouncy pill's word at `0x800ba33c` is not negative the jump is asked on every frame and Up and Cross go through a latch (`0x80036bbc`, `0x80036d48`), read below, and the Simon rooms' mode, 1 in the word at `0x800a33b0`, takes the pad as one move at a time against a stored sequence (`0x80036bf8`, "The Simon rooms" below).

The intents (`0x8002f3f4`) take the requests at rest, a jump asked with the roll as the forward jump and alone as the hop, else the roll, else a turn (`0x8002f5c0`, `0x8002f540`, `0x8002f560`, `0x8002f4e8`, `0x8002f500`); rolling, a jump asked is the forward jump at once, whatever the roll's request (`0x8002f488` to `0x8002f4a0`), and a turn may be asked during a hop (`0x8002f468`).

**From rest the ball reaches its top speed in six frames, and a block from rest takes 18.** The rolling state first moves the centre across toward the middle of its cell by 8 a frame where it is more than 8 off (`0x8002f934`, `0x80030e78`), then grows the speed at 312 by 6 a frame to 33 (`0x8002f9ac`, `0x8002f9bc`, `0x8002f9c4`) and moves the centre by it along the heading, so the speeds run 6, 12, 18, 24, 30 and then 33, 90 units in the first five frames and 33 a frame after, and the middle of the next cell, 512 on, is reached on the 18th frame, 0.3 s, where the move step lays the centre at the middle and drops the speed where the roll is no longer asked (`0x800302a8`).

Rolling on, with Up held through the middle, the ball covers a block in 512/33 frames, 15 or 16 by turns, 0.26 s. The speed is kept at 320 too, for the spin (`0x8002fa18`), and the rest state puts that word at nothing on every frame it runs (`0x8002f92c`).

A roll over nothing, with no block under the ball's cell, between 101 and 427 of progress and not on a platform, drops the ball into a fall (`0x8002f944`, `0x8002f954`, `0x8002f958`, `0x8002f974`), as a ball at rest with the block under it gone is dropped (`0x8002f8f8`, `0x8002f910`), each by the word for the block under the ball's cell as the last frame's read left it (`0x8002f8f0`, `0x8002f93c`), the state running before the frame's read of the cells (`0x80036838`, `0x80036840`); a slide on ice is where a roll gets there.

A turn asked while rolling stops the ball at the next middle, as "The ball's moves" above has it, and a held Left or Right, pressing again on every frame once the count has passed 6, asks the turn there; a tap short of the middle is lost.

**A turn in place turns the ball's frame at once, the body not at all, and the view over 19 frames, 53 a frame, 0.32 s.** The turn routines refuse while a turn or a face change's ramp runs (`0x8002f804`, `0x8002f814`), and otherwise tell the view, 2 for left and 1 for right at 420, with a count of 19 at 434 and a step of 53 or −53 at 442 (`0x8002f818` to `0x8002f830`, `0x8002f7a4` to `0x8002f7c0`).

The view routine, later in the same frame, swaps the ball's frame, a turn left putting the heading into the side and the old side turned round into the heading, a turn right the heading turned round into the side and the old side into the heading (`0x80034a74` to `0x80034b1c`, `0x80034b28` to `0x80034bbc`), so the ball faces its old left or right from that frame, and then on each frame of the count adds the step to a yaw at 450 and clamps the speed to 10 while the count runs (`0x80034bf8` to `0x80034c14`), a roll started during a turn being slowed and not refused.

The camera is built not from the ball's frame but from the side, the normal and the heading the view holds at 44, 52 and 36, turned by the yaw about its down axis and by a pitch at 452 about its right axis (`0x80034e60`, `0x80034e9c`, `0x80034efc`, `0x80035238` to `0x80035258`), a positive yaw turning it left and a positive pitch down (`0x8006115c`, `0x80061154`, `0x80060fbc`, `0x80060fb4`).

So over a turn the view turns from the old frame by 53, 106 and so on to 954 on the 18th frame, and on the 19th, as the count runs out, takes the ball's side and heading with the yaw at nothing again (`0x80034c20` to `0x80034ccc`), the last step being the 70 left of the quarter turn's 1024.

The view routine marks the turn for the draw at 536, 3 for a turn right and 4 for a turn left (`0x80034b10`, `0x80034b14`, `0x80034bc8`, `0x80034bcc`).

The draw of the same frame, taking no spin step (`0x80031044`, `0x8003104c`), turns the body's matrix at 596 by a quarter turn about the frame's down axis, −1024 for right and 1024 for left, and the frame's matrix at 564 by the same turn the other way (`0x8003116c`, `0x800311b4`, `0x800311cc` to `0x800311d8`, `0x80031208`, `0x80031220`, `0x80031234`, `0x80031254`, `0x80031258`, `0x80031270` to `0x8003127c`, `0x80031294`, `0x800312c0`), so their product, which is what is drawn, is as it was: the body stands still in the world while the view turns round it, and from the next frame the spin turns it about the new side.

The draw's last act copies the word at 692 into 536 (`0x800324bc`, `0x800324c4`), and the states' dispatcher clears 692 on every frame (`0x8002f888`), so a mark lasts one draw.

**Round an edge the centre runs a quarter circle of the ball's radius in four frames, and the view pitches after it over 13.** State 7, which the move step enters as "The ball's moves" has it, with the centre laid at the edge and the frame swapped, counts its frames at 404 and moves the centre along the new normal and the new heading by 38 and 8 on the first, 32 and 22 on the second, 22 and 32 on the third and 8 and 39 on the fourth (`0x8002fa40` to `0x8002fa54`, `0x8002fa64` to `0x8002fc74`), 100 along the normal in all, from the plane of the new face to the ball's rest height, and 101 along the heading, from 100 short of the new face's near edge to 1 past it, each point within a unit of 100 from the edge.

The fourth frame lays the centre 100 off the face plane nearest it (`0x8002fcd0`, `0x8002fca0`, `0x80037e8c`, `0x80037e98`) and puts the ball back rolling (`0x8002fc44`) at the speed it came with, from a progress of 1, so the middle of the new face is 255 on, eight frames at 33.

The edge tells the view with a 1 at 428, a count of 13 at 436 and a step of 78 at 444 (`0x80030574` to `0x80030590`); the view marks a ramp running at 456 and adds the step to its pitch on each frame of the count (`0x80034d7c` to `0x80034dd0`), 78 to 936 over twelve frames, and on the 13th takes the ball's normal and heading with the pitch at nothing (`0x80034dfc`, `0x80034e34`, `0x80034e40`), 88 for the last step, 0.22 s in all.

A flag at 708 stands from the wrap until the progress reaches 101 and keeps the move step from a second wrap meanwhile (`0x8002fa40`, `0x8002f9a0`, `0x8003054c`, `0x80030554`), and the arc's count starts at nothing (`0x80030588`).

State 7 writes 1 into 692 on each of its four frames (`0x8002fa50`, `0x8002fa58`), which the draw reads at 536 a frame behind, and on each of those four draws turns the frame's matrix at 564 by −256 about its own x, the side, taking no spin step (`0x80031164`, `0x80031168`, `0x80031180`, `0x80031190` to `0x800311a8`), 1024 in all, so the body turns a quarter turn round the edge in the roll's sense, one frame behind the arc.

While the ramp's mark at 456 stands the frame's matrix is not rebuilt from the frame (`0x800310cc`, `0x800310d4`), and the rebuild as the ramp ends finds it within a few 4096ths of what the four turns left.

**Up a wall the roll goes on from a progress of 100, and the view pitches over 16 frames of 64.** The wall lays the centre at 412 and tells the view with a −1 at 428, a count of 16 and a step of −64 (`0x800304a8` to `0x800304b8`); the view swaps the ball's frame as "The ball's moves" has it, so the heading runs up the wall and the centre, 100 off the wall and 100 off the floor, stands at a progress of 100 on the new face, from which the roll goes on at its speed to the middle, five frames at 33.

The pitch runs −64 a frame to −1024 and the view takes the new normal and heading as the count runs out, so the turn up is even, 16 steps of a sixty-fourth of a turn, 0.27 s.

The wall writes 2 into 692 (`0x800304bc`, `0x800304c0`), and the draw of the frame after, taking no spin step, turns the body's matrix at 596 by −1024 about the frame's x and the frame's matrix at 564 by the same the other way (`0x8003125c`, `0x800312d0`, `0x800312d4` to `0x800312f0`, `0x80031308`, `0x80031320`, `0x80031334`), so the body is as it was and the frame alone has turned up the wall under it; the frame's matrix is not rebuilt while the ramp's mark at 456 stands.

**The ball falls 5 a frame faster to 66, and lands where the point under its centre enters a block.** State 6 starts down at −10 from a roll or from rest (`0x8002f980`, `0x8002f91c`) and at −30 after a hop over nothing (`0x800301e0`), and adds −5 a frame at 310 to no more than −66 (`0x8002ffb8` to `0x8002ffd4`), 3960 units a second, moving the centre by it along the normal and by the speed at 312 along the heading (`0x8002ffe4`, `0x8002fff8`), which the state first drops wherever it is forward, on every frame of the fall (`0x8002ff74` to `0x8002ff84`), and lets decay by 6 a frame toward nothing where it is back, a bounce's (`0x8002ff90` to `0x8002ffac`), so a falling ball never travels forward, whatever a roll, a jump or a block above left in the word, and drifts back only after a bounce.

The spin's speed at 320 grows by 6 to 33 while Up is held and wanes by 1 a frame otherwise (`0x8002ff20` to `0x8002ff60`), so a falling ball keeps turning.

A falling ball with a block ahead at its level, at a progress of 411 or more, is held at 409, and with one behind, under 102, at 103 (`0x80030734` to `0x8003077c`), about its radius, 103, off either wall.

Each frame the landings try a platform under it and then a block (`0x8003070c`, `0x8003071c`): the landing takes the point 100 under the centre along the normal and looks up the cell it lies in (`0x80030b5c` to `0x80030bd8`), and where that holds a block that is not a moving platform's (`0x80030c0c`, `0x80030c14`) lifts the centre 100 along the normal and lays it 100 off the face plane nearest it (`0x80030cc4`, `0x80030cb8`, `0x80030d24`), at rest (`0x80030d30`).

Where Up is held the speed is 33 at once (`0x80030d40`, `0x80030d48`), the spin's speed written nowhere, so what the ball turned by in the air stands until the next state writes it, the rest state's nothing on the frame after (`0x8002f92c`), the hop's nothing (`0x800300b0`) or the roll's copy of its speed (`0x8002fa18`).

Where it landed short of 180 of progress with no jump asked, the roll is asked at 33 and a 1 written into the count at 372 (`0x80030d84` to `0x80030db0`), which the next frame takes to nothing before the pad's gate, the pad then dropping the request with the others before it reads the keys (`0x8003651c`, `0x80036524`, `0x80036b98`), so the request is lost wherever the pad is read.

A ball landing on plain ground rolls on only where Up is held, from the near third of a block or beyond it alike, and rests where it landed otherwise, the speed at 312 standing as the landing left it for the roll asked next, whose start writes the state and the landed flag and no speed (`0x8002f6cc` to `0x8002f6d4`), so a ball that lands from a jump and rests rolls off at 33 from its first frame.

A ball that comes down at −66 shudders the pad as it lands, where the vibration option is on (`0x80030c88`, `0x8004f108`).

A landing or a hop's end squashes the ball: a word rises by 187 a frame for four frames, to 748 of 4096, and comes off by 100 less 10 each frame, 90, 80 and on down to no less than 20 (`0x80030d50` to `0x80030d70`, `0x8003020c` to `0x8003021c`, `0x800325f0` to `0x80032664`), gone in 28 frames, 0.47 s, and is drawn with the breath as one squash (`0x80032718`), wider across the face by it and twice as much shorter along the normal.

**The jump runs the centre along a table of rows from the mesh file, 30 frames in the air, and lands two blocks on.** The forward jump needs a block under the ball (`0x8002f5f0`, `0x8002f5f8`).

It saves the centre at 68 (`0x8002f630`, `0x8002f638`), takes the table the ball's init copied from the fifth section of the .GGI, which the parser found by summing the header's section sizes (`0x80022e44` to `0x80022ea0`, `0x8002f2ec`, `0x8002f368`, and [ggi.md](ggi.md)), its count of 33 as the count at 404 and its first row, 8 bytes in, at 416 (`0x8002f63c` to `0x8002f670`), sets the speed at 312 and the spin's speed at 320 to 33 (`0x8002f658` to `0x8002f660`) and enters its state (`0x8002f60c`); the rows write neither, so the ball turns at the roll's full rate through the arc.

Each frame the count falls by one, and from 3 straight to nothing (`0x8002fce4` to `0x8002fcf4`), and while it stands a row's height, right and back are taken, a halfword each (`0x8002fd24` to `0x8002fd5c`), turned by the frame matrix at 212, right along the side, back against the heading and height along the normal (`0x8002fdcc`), and added to the saved centre, which is drawn across toward the middle of its cell by 8 a frame as a roll's is (`0x8002fdd8`, `0x8002fddc`, `0x8002fdf4`); so the rows run for 30 frames, 0.5 s, the centre 458 up on the 15th and 16th and 986 along on the 30th.

On the 31st the centre is the saved one moved 1024 along the heading, two blocks, and the landing is tried (`0x8002fe20`, `0x8002fe80`, `0x8002fe8c`, `0x8002feb4`).

On a face whose normal points the positive way along its axis, +x, +y or the underside, the point 100 under the snapped centre lies on the face plane itself, the saved centre having been laid 100 off it, and the lookup's rounding, which adds 256 to each coordinate and shifts it right by 9 (`0x800379e8`, `0x800379f0`, `0x800379f4`, `0x800379f8`, `0x80037a00`, `0x80037a0c`, `0x80037a10`), puts it in the cell beyond the block, so that landing fails and the fall's landing, on the frame after, lays the ball where the snap left it.

The long jump takes each row's three halfwords three halves over, the odd half dropped toward nothing (`0x8002fd58` to `0x8002fdb8`), and lands 1536 along, three blocks, its word at 412 counting the rows from the 1 it is armed with, 31 at the end, the landing asking 3 or more of it (`0x8002fdbc`, `0x8002fdc0`, `0x8002fe1c`, `0x8002fe50`), so its apex is 687.

The word is armed by the boost button's launch and by the bouncy pill's latch on the pad (`0x80036e04`), both below; it is put at nothing by the level's start (`0x80035ea4`), by a landing on a block or on a platform (`0x80030d68`, `0x800334a8`) and by a bounce off a wall or a drop under a block above (`0x800309b8`, `0x80030ae8`), and on every frame outside the jump's state the states' dispatcher puts a word of 2 or more at nothing (`0x8002f880` to `0x8002f8a0`), so a word armed at 1 waits for the jump and a count left by anything else is gone on the next frame.

Failing the landing, the ball falls from there with its speed along the heading dropped (`0x8002febc`, `0x8002fecc`, `0x8002fee0`), down at the size of the last frame's change along the normal whichever way it went (`0x8002fef0` to `0x8002ff0c`), the word at 326 the measure routine writes as the frame's change along the normal (`0x80037d1c` to `0x80037d3c`, `0x8002fed8`, `0x8002fee8` to `0x8002ff0c`), 56 a frame, and with the long jump's word cleared (`0x8002ff14`), so a jump that finds no block two blocks on comes straight down in that cell and a long jump straight down three on, the two sharing the path from the landing's try.

A jump from a roll saves the centre wherever the roll had it, and lands at the same progress two blocks on.

**The hop runs the same rows a row ahead, in place and without a turn of the body, and a held Cross strings hops together with no rest between, each sinking the ball 14 further.** The hop is a state of its own with the same count and the same first row (`0x8002f6fc` to `0x8002f764`), writes neither speed at its start, saves the centre at 68 and never reads it (`0x8002f71c` to `0x8002f738`).

On each frame of its rows the hop puts the spin's speed at nothing (`0x800300b0`) and moves the centre by the next row's height less this row's, along the normal and by nothing else, from where it is (`0x800300b4` to `0x800300c4`, `0x80030124` to `0x80030148`), so on its k-th frame it stands at the k-th row's height, a row ahead of the jump, 458 up on the 14th and 15th and 14 below where it began on the 30th, and does not turn, not even after a jump.

As the count runs out it asks after the block under the cell the centre stands in, as the last frame's cells left it (`0x800301b0`, `0x800301c8`): with one there the ball is at rest (`0x800301cc`) and the squash restarts as a landing's does (`0x8003020c` to `0x80030224`), and with none it falls at −30 with no speed along the heading (`0x800301d4`, `0x800301e0`, `0x800301e8`).

The rest state's lay takes the 14 back on the first frame without Cross; but Cross held is the jump asked on every frame (`0x80036e38` to `0x80036e48`), and the intents, which run before the state and take the requests at rest alone (`0x8002f4a8`, `0x8002f4b0`, `0x8002f4c0`, `0x8002f538`, `0x8002f540`), start the next hop on the frame after the end, so the lay never comes between held hops and the 14 adds up, 14 a hop.

On the eighth, 112 in, the centre's cell is the block's own, and over a lone block the eighth hop ends in the fall, which the landing takes on the next frame, at −35, laying the ball at 100 again with a landing's squash; over a deeper floor the sink goes on until Cross is let go, and the lay brings the centre back to its face from as far as 356 in, which the 26th hop passes.

**A block met in the air bounces the ball back, and one above drops it.** Jumping, the landings try a platform and then a block only while the count is under 12, the arc's last nine rows (`0x80030648`, `0x80030684` to `0x800306a0`), and then a wall (`0x800306c0`): from a progress of 412, with a block ahead at the ball's level, or ahead and above where the centre is 412 or more into its cell along the normal, within its radius of the cell over its own, or in the floor ahead, the cell ahead one below the ball's own, where it is under 100 (`0x800307f4`, `0x80030810`, `0x80030828` to `0x80030858`), the ball is moved back twice the frame's advance and falls at that advance reversed, starting down at −10 where it was rising, with the spin's speed at nothing (`0x80030934`, `0x80030968`, `0x800309a4`, `0x800309b4`, `0x800309c4`).

A block over the ball's own cell, or ahead and above from a progress of 412, or behind and above under 101, met while rising with the centre 412 or more into its cell along the normal, drops the ball at its rise reversed, the centre set back by twice that rise along the normal and the speed and the spin's speed at nothing (`0x800307c0`, `0x800309f8`, `0x80030a00` to `0x80030a4c`, `0x80030aa4`, `0x80030ac4` to `0x80030ad4`, `0x80030b04`, `0x80030b10`), and the hop tests for that alone.

A block three above the floor is never met: the test for a block above runs only with the centre 412 or more into its cell, and the arc's apex puts it 558 off the face the jump left, 46 into the cell two above, the cell three above beginning at 1024, while a block two above is met from the first row that brings the centre within 100 of it. OBJ LEVEL's beam end over its floor stands three above, and the jump under it clears it.

A snapped centre that lies in a block lands all the same, the point under it lying in a block too, and is laid 100 off the face plane nearest it, inside the block where it was less than 156 in; the wall met a cell before, at 412, is what stands between the ball and that.

**The boost button takes the pad from the ball, rolls it on and launches it as the long jump, three blocks on and 687 up.** While the word at 356 reads type 10 the pad is not read, nor while the count at 372 runs, which rolls the ball on by itself (`0x80036524` to `0x80036538`, `0x800364dc` to `0x80036504`).

On the ground, with a button under the ball (`0x8003ac70`, `0x8003ac78`, `0x8003b22c`), the hazards routine writes 10 into the count on every frame the progress is 151 or more (`0x8003b23c` to `0x8003b248`), so the roll is asked from the frame after, and from 231 (`0x8003b264`, `0x8003b268`), or at any progress while the landed flag at 494 stands, which a landing on a block and a hop's end on one set and the frame clears before the intents, so for the hazards of the frame after alone (`0x8003b270` to `0x8003b278`, `0x80030d3c`, `0x800301b8`, `0x80036834`), it launches: the sound call is made with 10 and the pad shuddered (`0x8003b280` to `0x8003b29c`), the count put at nothing, the jump and the roll asked, the long jump's word at 412 armed with 1 where it is nothing, and the turn dropped (`0x8003b2a0` to `0x8003b2bc`).

The intents of the same frame start the forward jump, at rest or rolling, which the word makes the long one, 30 rows to a landing 1536 along at the progress the launch found.

So a ball rolling onto a button rolls on without the keys, is rolled on by the game from 151 and leaves on the first frame its progress is 231 or more, within a frame's roll past 231; a ball that lands on a button, from a jump, a fall or a hop, leaves on the frame after, from where it landed, whatever the keys; and either lands three blocks on at that progress, so a button three blocks on from another sends the ball on again on the frame after it lands, where a plain block holds it at rest, or rolling where Up is held. The level's start puts the count, the word and the flag at nothing (`0x80035e7c`, `0x80035ea4`, `0x80035eac`).

**The bouncy pill asks the jump on every frame and takes Up and Cross through a latch, so the ball bounds whenever it is not rolling, and forward only once Up has been held four frames.**

While the pill's word at `0x800ba33c` is not negative the pad routine asks the jump on every frame it is read, whatever the keys (`0x80036bb4`, `0x80036bbc`), and in place of the plain reading of Up and Cross runs the latch (`0x80036d48`, `0x80036d50` to `0x80036e10`): Up held sets a latch at `0x800a33b8` and Cross held one at `0x800a33b6` (`0x80036d58` to `0x80036d74`), a count at `0x800a4c90` steps by one on every frame either latch stands and is put at nothing on a frame neither does (`0x80036d80` to `0x80036db0`), and while the count is under 4 nothing more of Up or Cross is read (`0x80036dbc`, `0x80036dc0`); from 4 the roll's request is the Up latch (`0x80036dd8`), the long jump's word at 412 is armed with 1 where both latches stand, the word is nothing and the state at 408 is not the forward jump's, 1 (`0x80036dd4` to `0x80036e04`), and both latches are cleared with the count kept (`0x80036e08` to `0x80036e10`).

So Up held asks the roll on every frame from the fourth, the latch it sets again on each keeping the count stepping, and Up tapped asks it once, on the fourth frame counting the tap's own, its latch standing until the count passes 3, the count starting over on the first frame after that on which neither latch is set again.

Nothing outside the pad routine clears the latches, and the level's start puts the count at nothing in the Simon rooms' mode alone, whose reading of the pad shares the three words (`0x80035d38`, `0x80035d60`), so a latch or a count the last pill left stands into the next level.

After the pad, on every frame the word is 839 or more, which it is from the pill's 840 on, and the state at 408 is the rolling state's, 2, and no other, the ball's routine drops the jump and the roll and adds one to the word (`0x80036598` to `0x800365c8`), so the jump the pad asks never reaches the intents while the ball rolls, and a roll under the pill runs on to the next middle, where the move step rests the ball with the request gone (`0x80030284` to `0x800302b0`).

The intents take the jump at rest with the roll's request as the forward jump and without it as the hop (`0x8002f4a8` to `0x8002f540`), and rolling, a jump asked is the forward jump at once, at any progress and whatever the roll's request, needing a block under the ball alone (`0x8002f488` to `0x8002f4a0`, `0x8002f5f8`), which the hold is what keeps from happening.

So a ball that takes the pill rolling rolls on to the middle, Up held or not.

One that comes down on it, from a jump, a hop or a fall, with the count at nothing hops on the frame after, Up held or not, since Up held steps the count to 1 there and the roll's request waits for 4. With a count of 3 or more left by an earlier pill, Up held gives the roll's request on that first frame, and the ball jumps forward at once.

The frame after a roll's stop, a landing or a hop's end starts the next hop or jump, forward where the Up latch has stood four frames, in place otherwise: with Up held the ball bounds two blocks at a time, with Up and Cross held three, the long jump's word armed again after each landing clears it, and with Up released it hops where it is, until the level ends or an invincibility pill puts the word back.

A long jump from the middle of its block toward a block two on and one up lands on it by the landing's own rule: the landings are tried from the 22nd row, and on the 24th the point 100 under the centre, 474 up and 1243 along, lies in that block, so the ball is laid 100 off its top face at 475 of progress in it (`0x80030684`, `0x80030b5c` to `0x80030bd8`, `0x80030d24`, `0x80030d30`), where the plain jump, 458 up at its highest, is thrown back off it as a wall ("A block met in the air" above).

The viewer bounds the ball under the pill as the game does: while the pill's word is not negative the pad's reading asks the jump on every frame it runs and takes Up and Cross through the latch, whose three words start at nothing with a run, which is one level, so a latch or a count the last pill left is not carried into the next level as the game carries it, and after the pad a rolling ball with the word at the hold or more has the jump and the roll dropped and the word stepped, so it rolls on to the middle and hops or bounds from there, the long jump armed where the latch arms it.

**The body is a matrix of its own, at 596, kept from frame to frame and turned on each by −5 times the spin's speed at 320 about the frame's x, the side** (`0x80032508` to `0x8003251c`, `0x800325d0` to `0x800325e4`, `0x80060f58` laying the turn on the matrix's rows), the roll's speed while the ball rolls, 33 through a jump's rows and the frame it lands on, nothing at rest and through a hop, and in a fall what Up grows or lets wane; 165 of 4096 a frame at full speed, a turn every 25 frames, 0.41 s, where a ball of its radius rolling without slipping would turn every 19.

The draw multiplies the frame's matrix at 564 by the squash and then by the body's, and the camera's by that (`0x800313b4` to `0x80031424`, `0x800314bc`), so the squash lies along the face and the body's turn within the frame, and it straightens both matrices on every frame but a marked one (`0x80031084` to `0x800310c4`).

The level's start lays both as the identity, the body aligned with its frame (`0x8002f304`, `0x8002f340` to `0x8002f3bc`), and a landing from the jump's state multiplies the body's matrix by a third at 628 that nothing but the start and that landing writes, so it is only ever the identity and the landing leaves the body alone (`0x80030c18`, `0x80030c34`, `0x80032740` to `0x80032774`).

The view pitches down after a ball that falls, and after a jump's last rows over nothing ([camera.md](camera.md)).

The viewer hops the ball and lays it at rest as the game does:

- The hop puts the spin's speed at nothing on each frame of its rows, so a ball hopping after a jump does not turn.
- The rest state lays the centre its radius off the face plane nearest it along the normal, so hops strung together under a held Cross sink it 14 a hop and the first frame without Cross brings it back to its face.
- A hop's end asks after the block under the cell the centre stands in, by the lattice as it stands rather than by the last frame's read, so over a lone block the eighth held hop ends in the fall and the landing lays the ball at its radius on the next frame, and over a deeper floor the sink goes on for as long as Cross is held.

The viewer turns the ball's body as the game does:

- It keeps the body as a rotation of its own in the world, turned on each frame about the side by five times the spin's speed and straightened after, so a turn in place, which swaps the heading and the side at once, leaves it where it stands while the view turns round it and the spin that follows turns it about the new side.
- Up a wall the body stands while the frame turns under it, and the draw of the frame after takes no spin step.
- Round an edge the frame's four turns of −256 about the side fall on the body one frame behind the arc, with no spin step on those frames, so it comes round the edge with the ball and meets the new face as its frame does.

The viewer throws the ball back off a wall met in the air and drops it under a block above as the game does: the frame that meets the wall sets the centre back by twice its advance along the heading, with the speed at that advance reversed, and the frame that meets the block sets it back by twice its rise along the normal, with the speed at nothing, for the jump and for the hop alike, and either puts the spin's speed at nothing, so the ball ends the frame as far back as it would have come on, or as far below as it would have risen, and falls from there, the body standing until Up is held.

The viewer launches the ball off the boost button as the game does:

- On the ground on a button the hazards write the self-roll's count from 151 of progress, and the frame takes one off it before the pad, asks the roll and drops the turn and the jump, so the ball rolls on by itself.
- From 231, or on the frame after a landing on the button or a hop's end on it, the launch puts the count at nothing, asks the jump and the roll, drops the turn and arms the long jump's word where it is nothing, and the frame's intents start the forward jump as the long one, each row's three halfwords three halves over with the odd half dropped toward nothing, the word counting the rows and the landing laid 1536 along where it is 3 or more.
- The landing, a landing on a platform, a bounce off a wall, a drop under a block above and the failed landing put the word at nothing, and outside the jump's state the frame clears a word of 2 or more.

The pad is not read while the count runs nor while the word under the ball reads the button's type, and the roll and the jump are the pad's alone, put at nothing before the keys are read: a landing lays the ball at rest and asks the roll itself where it came down short of 180 of progress with no jump asked, the pad's reading of the frame after drops the request, and the speed stands as the air left it, 33 from a jump, so a landing with Up released rests where it landed, short of 180 or past it, and rolls on only with Up held, from that speed on its first frame.

The viewer judges a press as the game does. The game's loop copies the pad word into the last frame's word on every frame (`0x80040cc0`), the input routine takes that word as the one a press is judged against on the frames it runs (`0x80036be4`, `0x80036bf0`), and forgets it once the repeat count has passed (`0x80036c68`).

So the viewer keeps every frame's word, read or not, judges a press against the word of the frame before and steps the repeat count on the frames that read alone, and a key held through frames the pad is not read for is no press when it is read again: a Left held from a level's first frame turns on the 26th frame, the first to read the pad being the 20th and the count passing 6 on the seventh of those.

A key tapped over frames the pad is not read for, which the game never sees, the viewer keeps for the first frame that reads it, one a key, so that with Motion off a tap can carry the level through its opening; that is the viewer's one deviation here.

## What the ball takes

**The ball's contact with what stands about it runs after the landings, over the 27 cells about the ball, and takes a pickup whose middle its centre has come within reach of.** The routine at `0x80038468`, which the ball's routine calls at `0x800368cc`, copies the ball's centre and walks the words at 104 of the record three over, three on and three up (`0x800384f4`, `0x80039198`, `0x800391b4`, `0x800391d0`), and in each cell that holds a record of a kind below 5 (`0x80038548`) walks the six slots: a slot whose `f4` is 0 is passed over (`0x80038580`), as is one whose entry the loader marked as not to be taken (`0x80038598`, `0x800385a0`).

The loader at `0x800355e8` lays an entry of 48 bytes for every slot of a type its table at `0x80010188`, which runs from type 5 to 47, has a case for (`0x80035640`, `0x80035924`, `0x80035928`), numbered in its order into `f5` (`0x80035998`), with a word that is 0 unless the type is a pickup's, 1 for the key, the three pills, the hourglass, the gem, the coin, the sunglasses, type 42 and the five fruit (`0x80035620`, `0x80035690` to `0x80035830`), so the exits, the devices and the arrows are never taken.

The empty slots, the start, the captivators and a crumbling block's type word get no entry and keep the file's `f5`, and the start is never taken because its `f4` is 0 on every level and is passed over before its entry is asked.

The walk's own case for type 27, which takes a fruit of every kind at once for one fruit's 2500 (`0x80038f64`), is never reached, and the number in `f5` says where the entry is and nothing else, so the order the loader meets the pickups in decides nothing in play.

For a thing it reaches the walk squares the distance from the ball's centre to the thing's position (`0x800385b4` to `0x80038624`) and passes over the thing unless that is under its reach squared plus 10000, the ball's radius squared (`0x800384c8`, `0x8003862c`).

The reach is 160 for most pickups, 150 for a key and 180 for a fruit (`0x800355cc`, `0x800358ac`, `0x8003566c`), and the position is where the draw walk last put the thing: its block's centre moved along the face's normal by its stand, 386 for most, 406 for a coin, 416 for type 42, 436 for an hourglass and for a gem of the second or third cut, the first cut standing at 386 (`0x800355c8`, `0x800357a4`, `0x800357d8`, `0x80035850`, `0x80035844`, `0x80035838`), which the matrix the loader lays through `0x80039ec0` carries as its translation (`0x800359f4`, `0x80039fa8`), plus the bob or the circling turned into the face (`0x80039d14` to `0x80039d30`).

So the ball's centre, 356 from its block's centre, is 30 to 80 short of a pickup's middle along the normal, and the ball takes a pickup on its own face as its centre comes within about 170 to 185 of the block's middle, 200 for a fruit, at a progress of about 70 to 85 coming in, so one on the block ahead is taken only once the ball is on that block, the bob moving each mark by a few units and type 42's circling by up to 100.

**A pickup taken is gone from its face, scores at `0x800a53c8` and starts an effect.** Each case makes a light from the thing's cell and face (`0x8002e3d8`, the devices' light's maker) and starts an effect at the thing's position with it (`0x800118c4`), a key, a fruit and the hourglass starting a second one on the HUD ("The effects" below).

The walk's tail writes 0 into the slot's `f4` and its type (`0x80039138`, `0x80039140`) and takes the painted shadow off the face through `0x8002c184` (`0x80039158`).

`0x8002c184` reads the block's kind off the loader's table of faces (`0x8002c1f8`) and writes 0 into byte 3 of the face's flags word, the mark for the model's second quad that the loader sets on a plain block under a type of 20 or more, a start on a clock counting as the clock (`0x80027348`, `0x800276d4`, `0x800276e0`, cleared at `0x8002c248`), and on ice under a type of 20 to 49 but 26, 28 and 30 (`0x80027834` to `0x8002785c`, cleared at `0x8002c284`), and on a plain block in a level with no key, where the loader sets bit 16 of the word instead under the same types (`0x80027770`, `0x80027784`), clears that bit (`0x8002c22c` to `0x8002c244`), so the face is the bare stone, ice or swirl again.

All of it happens unless the case asked to keep the thing (`0x80038670`, `0x80039110`), which type 42's brown form alone does (`0x800386c4` to `0x80038730`), ending the level as a captivator's touch does ("The level's clock and its end" below).

The points: a key 1000 (`0x80038a28`), a gem 2975 whatever its cut (`0x80038b00`), a coin 750, 500 or 250 by an `f3` of 0, 1 or 2 (`0x80038b8c` to `0x80038bf8`), the sunglasses 500 (`0x80038930`), type 42 in its green form 1550 (`0x80038780`) and a fruit 2500 (`0x80038c8c`, `0x80038d34`, `0x80038ddc`, `0x80038e84`, `0x80038f2c`), which also sets the fruit's bit in the word at `0x800a5664` that the loader reads the next fruit's type from; the pills score nothing.

The table ships each pickup's reach, stand and points as its `take`, a fruit's bit beside them as its `fruit`, and the unit tests hold the points [annotations.md](annotations.md) curates for the site to them.

**A key takes one off the keys left, and the last opens the exits.** The word at `0x800a33fc`, which the loader counts up key by key (`0x800358bc`, `0x800358c4`), comes down by one (`0x80038a24`, `0x80038a30`), and where it reaches nothing the case writes 0 into the exit's `f3`, the green model, 1 into its `f4`, open, and 1 into the hidden exit's `f4` (`0x80038a3c`, `0x80038a78` to `0x80038a84`), the exits being the last of each the loader met (`0x80035868`, `0x8003588c`), and where it met no hidden exit the exit itself again (`0x80035a3c`).

The loader had set every exit's `f3` to 1, the red model, and every hidden exit's `f4` to 0 (`0x80035874`, `0x80035898`).

The table ships the two writes as the two types' `shut` and `opened`.

**The hourglass turns the clock round and scores by what it leaves.** Its case takes the clock at `0x800a573c` from 5999, a tick short of the 6000 the breath takes the time against, and writes the difference back (`0x80039070`, `0x80039074`, `0x80039094`), so a clock at c ticks becomes 5999 − c, and adds 10 for every whole second of the new clock, 50 ticks each (`0x80039060`, `0x800390a8`, `0x800390c4`): taken at once on a 99-second level it leaves 20 seconds and scores 200, and taken with s whole seconds left it leaves 119 − s and scores 1190 − 10·s, 1190 with less than a second left.

The table ships the 10, the 5999 and the 50 under the hourglass's `take`, and the 1190 [annotations.md](annotations.md) counts each at rests on them.

**A pill or the sunglasses set a word the hazards routine runs down.** The level's load sets the four words to −1 (`0x80035de0` to `0x80035e00`).

The lethargy pill sets `0x800ba338` to 360 (`0x800387cc`, `0x800387d4`) and starts the screen's effect through `0x800201f0` (`0x800387d8`, `0x800387dc`), which, where the count of players at `0x800a33cc` is under two (`0x800201f4`, `0x800201fc`), sets the mode word at `0x800a572c`, 10228 past gp, which the start sets to `0x800a2f38` (`0x80020208`, `0x80020210`, `0x80069a04`, `0x80069a08`).

Each pass the hazards routine takes 2 off the word while it is not negative and ticks the clock 4 more (`0x8003b384` to `0x8003b394`), 724 ticks beyond its own over 181 passes, the routine testing the word before it counts it down, and on the pass it finds the word at nothing it asks the effect's end (`0x8003b36c` to `0x8003b378`), which `0x800201f0` marks in the mode word while that stands (`0x80020224` to `0x8002022c`).

While the mode word stands the frame loop waits two blanks a pass instead of one ("The frame" above), from the pass after the pill's to the one the fade clears it on, 192 passes, 384 blanks, 6.4 s, so the ball and everything that moves run at half pace in real time, and the clock, 5 ticks a pass at 30 passes a second, loses 3 of its seconds a second where it loses 1.2, 18 of its seconds in the 6 s the 181 passes last, 11 more than those seconds cost otherwise.

The pill's own word is read by nothing else than the view routine, which rolls the view by it, and the screen's routine runs the flash, the ghost, the stretch and the fade off the mode word ([camera.md](camera.md)).

The invincibility pill sets `0x800ba340` to 840 (`0x8003884c`, `0x80038854`), which comes down by one a frame (`0x8003b300` to `0x8003b30c`); while it is not negative every death the pill guards is refused ("The level's clock and its end" below names the three it does not), the bouncy pill's word is put back to −1 and the lethargy pill's to 0 (`0x8003b31c` to `0x8003b358`), and since the routine tests before it counts the ball is safe for 841 frames, 14 s.

The bouncy pill sets `0x800ba33c` to 840 (`0x800388b0`, `0x800388b8`) and nothing counts it down: while it is not negative the input routine asks the jump on every frame (`0x80036bb4`, `0x80036bbc`), and while the ball rolls with the word at 839 or more the ball's routine drops the jump and the roll and adds one to it (`0x80036598` to `0x800365c8`), so the ball jumps whenever it is not rolling, forward by a latch on Up ("The ball's roll" above), until the level ends, or until an invincibility pill, which the disc places only on OBJ LEVEL, a level that never appears in the game, puts the word back.

The sunglasses set `0x800ba334` to 840 (`0x80038924`, `0x8003892c`) and turn on the flag at `0x800a5a98` the invisible block's light draws every face through (`0x8002bec8`, called at `0x8003893c`); the hazards routine counts the word down by one a frame and at nothing starts the blink (`0x8003b2d0` to `0x8003b2e8`), in which `0x8002bf50` turns the flag off and on in 21 spells, off first, the first of 8 frames and the rest of 9, read below, so every invisible face shows for 841 frames, 14 s, and blinks for 188 more, 3.1 s.

The table ships the four words as `lasts`, with the lethargy pill's step and ticks, the invincibility pill's step, the sunglasses' step and blink and the bouncy pill's hold and latch.

**The sunglasses' blink is 21 spells, off first and by turns, the first of 8 frames and every spell after of 9, and the flag stays off after the last.** The take calls `0x8002bec8` with 1 (`0x8003893c`, `0x80038940`), which clears a state word at `0x800a5e50` and sets the flag to 1 (`0x8002becc`, `0x8002bf38`, `0x8002bf44`); the hazards routine, finding the word at nothing, calls it with 0 (`0x8003b2d8`, `0x8003b2dc`), which marks the state an off spell's, lays a count of 21 at `0x800a469c` and a timer of 9 at `0x800a46a0` and clears the flag (`0x8002bee8`, `0x8002beec`, `0x8002bef8`, `0x8002befc`, `0x8002bf08`, `0x8002bf14`), and then counts the word to −1 (`0x8003b2e8`, `0x8003b2ec`).

The state, the count, the timer and the flag are each a store indexed by the word at `0x800a33d0` that gates every update ("The frame" above), four bytes a step (`0x8002bed4`, `0x8002bedc`), and the addresses here are the ones it selects at 0.

Each frame `0x8002bf50` returns at once with the state cleared (`0x8002bf70`, `0x8002bf78`), and otherwise takes 1 off the timer and returns while it stays above nothing (`0x8002bf9c`, `0x8002bfa0`, and in an on spell `0x8002c000`, `0x8002c004`); as the timer reaches nothing it takes 1 off the count (`0x8002bfbc`, `0x8002c020`), and where the count reaches nothing clears the state and leaves the flag as it stands (`0x8002bfc0`, `0x8002c024`, `0x8002c030`), else lays the timer at 9 again and swaps the state and the flag, on from an off spell (`0x8002bfc8`, `0x8002bfd4`, `0x8002bfe0`) and off from an on spell (`0x8002c034`, `0x8002c03c`, `0x8002c048`).

The invisible block's light reads the flag and nothing of the word, and draws every invisible face while the flag stands (`0x80051370`, `0x80051390`, "The invisible block" below).

The frame loop runs the ball's routine (`0x80040ffc`), which runs the hazards and then the contact (`0x8003670c`, `0x800368cc`), before the frame's draw at `0x8002a3c0` (`0x8004101c`), which runs the blink and then the light (`0x8002a3e8`, `0x8002a4a4`).

So the flag is seen on from the take's frame through the 840 frames the word counts down, 841 frames, 14 s; on the frame the word is found at nothing the start lays the timer at 9 and the blink takes it to 8 before the light reads the flag off, so the first spell is 8 frames; every spell after runs from the frame the timer before it reaches nothing to the frame before its own does, 9 frames; and the count of 21 ends the blink as the 21st spell's timer runs out, so the odd spells are off and the even on, 11 off and 10 on, 188 frames in all, 3.1 s, and the flag stays off after.

The table ships the blink under the sunglasses' `lasts` as its `times`, its `frames` and its `first`, the first spell's frames.

**A crumbling block breaks and scores 50 on the first frame the ball stands on it.** The hazards routine, with the ball on the ground on a block whose word at 356 is 96, reads the record's type word, adds 50 where it is still 1, and writes 2 into it on every frame the ball stands there, whatever it held (`0x8003afb4` to `0x8003b028`), from which the routine at `0x8002b3f4` takes the block down ("The crumbling block" below).

The table ships the 50 as kind 6's `points`.

The viewer takes what the ball rolls over as the game does:

- On every frame the guard is off it walks the cells about the ball and takes a pickup whose place lies within its reach of the ball's centre, the place its block's centre moved along the face's normal by its stand, bobbing by the table's reach about it and, for type 42, circling at the table's radius, each on the angles the map hashes for the thing, since the game's are random, and without the ten the game's bob stands above its stand, which the table does not ship.
- A key comes off the count and the last turns the exits' circuit over as the panel's button does.
- The hourglass turns the clock round and scores by the arithmetic above, the division signed as the game's is.
- A pill or the sunglasses set the word the hazards run down, in the order of the routine, the sunglasses' word starting the blink as it runs out, in the table's spells, the first of them the table's shorter one, and the flag standing while the word is not negative or a spell is on, which the frame draws every invisible face through ("The invisible block" below).
- Type 42's green form is taken while its brown form is left for the captivators' case.

A fruit taken sets its bit in the pickups' word, which the run banks as the level ends ("The level's clock and its end" below), and while a run is on the fruit a level holds is placed as the level loads by that word, as the loader places it, the first of the five whose bit is clear or the level's own where every bit is set, in play's index alone, the map drawing the level by its number where no run is on; the 200 a fruit takes off the word by the world ("Not settled" below) is not kept, nothing in the map reading it.

The lethargy pill's mode word is kept as the game's screen routine runs it: the pill's own pass, the ghost while the pill's word is not negative, the end's pass as the hazards find the word at nothing, and the fade's level, laid from the table on that pass and falling by the table's step on each pass after until it is below nothing, which clears the mode. While the mode stands, or while a teleport's flash does ("The effects" below), the map's frame loop waits the table's blanks a pass instead of one, so the ball, the walkers, the clock and the ending's view run at half pace in real time as the game's do.

Both words start at nothing with a run and with a restart, which is the map's choice, the game's clearing of the mode as a level loads being unread.

The frame draws the screen from those words as the game's draw of the pass showed it, the flash, the ghost and the fade, and the view rolls by the pill's word, both as [camera.md](camera.md) reads them.

## The devices under the ball

**The hazards routine, which the ball's routine runs before its intents, runs the switch and the teleporter under the ball every frame** (`0x8003670c`, `0x8003b398`, `0x8003b3a0`), each asking first whether the ball is in the air, falling or in a jump's rows (`0x8003b56c`, `0x8003b514`), where neither acts and both clear a marker at 492 of the ball's record (`0x8003a3a8`, `0x8003a5b0`).

The marker keeps a device from acting twice in one visit: a device that acts writes its type there (`0x8003a400`, `0x8003a6b4`), a device finding its own type there does nothing (`0x8003a3b4`, `0x8003a608`), and the ball's routine clears it once the ball's progress or its measure across is more than 100 off the middle, outside 156 to 356 (`0x80036850` to `0x80036884`), as the hazards routine does after a teleport that leaves the progress at 357 or more (`0x8003b3cc`, `0x8003b3d4`).

**A switch is thrown as the ball comes within 59 of its middle, along and across, and turns its whole colour over.** With the word at 356 reading 9 (`0x8003a3c4`) and the progress at 336 and the measure across at 332 both from 197 to 315 (`0x8003a3cc` to `0x8003a3f4`), the routine marks the device, plays a sound by the switch's own `f4` and shakes the pad, and walks the list its `f7` starts (`0x8003a464`): a link is a record's index times sixteen plus a face, −1 ending the list; a face of 6 names a laser, whose lit flag, its first slot's `f3`, is turned between 1 and 0 and whose next link is word 7 of its second slot (`0x8003a49c`, `0x8003a4ec`, `0x8003a4b8`), and any other face names a device's slot, whose `f4` is turned between 1 and 2 and whose next link is its `f6` (`0x8003a558`, `0x8003a520`), the lists being the colours' ([level-format.md](level-format.md)).

So a ball rolling across a switch throws it at 197 without stopping, and not again until it has left the middle by more than 100 and come back.

The table ships the band and the marker's as the switch's `throw`.

**An on teleporter sends the ball on the sixteenth frame it stands within 89 of the middle, to the middle of the face its `f7` names, facing by that teleporter's `f2`.** With the word at 356 reading 5 and the slot's `f4` 1 (`0x8003a5c8` to `0x8003a5ec`), the marker not its own, and the progress from 167 to 345 (`0x8003a610` to `0x8003a620`), the routine starts a count at `0x800a4c68` at 15 where none runs, with an effect on the HUD (`0x8003a638`, "The effects" below), and on every frame the count has not passed nothing takes one off it, writes 15 into the wait at 370, which keeps the pad from being read, and drops the roll, the turn and the jump (`0x8003a660` to `0x8003a674`), so a rolling ball stops at the middle.

On the frame the count passes from 0 to −1, the sixteenth, it marks the device, plays sound 5 and starts the flash ("The effects" below), writes 15 into the wait again (`0x8003a6b4` to `0x8003a6bc`), takes the far end from the teleporter's `f7` as the slot the ball stands on (`0x8003a6e4`, `0x8003a710`), lays the ball's frame from that face and that teleporter's `f2` through `0x80038178` (`0x8003a724`, `0x8003a734`), copies the side, the heading and the normal into the view's rows at 44, 36 and 52 (`0x8003a750` to `0x8003a790`), so the camera cuts to the new face with no ramp and the saved normal a wall turns the heading to is fresh, puts the ball at rest (`0x8003a86c`) with its centre at the far end's cell centre moved 256 along the normal, on the face (`0x8003a878` to `0x8003a8ec`), and reads the cells about it again (`0x8003a8f8`).

The send lays the frame matrix at 212 by the record's address (`0x8003a79c` to `0x8003a860`), the side, the heading turned round and the normal its columns as `0x800383ec` lays them, and writes 0 into the record's first word, as a landing does (`0x8003a6cc`).

It writes none of the words from 564 to 688, the frame's matrix, the body's matrix, the third matrix and the product the draw copies to 660 (`0x80031428` to `0x8003149c`): every store from `0x8003a6b4` to `0x8003a8fc` resolves to an address outside them, the frame routine the record is handed to writes the three vectors at 12 to 35 and its scratch by gp, nothing else, and calls nothing (`0x8003817c` to `0x800383e4`), and the read of the cells is the frame's own (`0x80036840`), as are the two calls the hazards' routine makes again once the send returns 1, that read and the measure of the ball within its cell (`0x8003a904`, `0x8003b3a8` to `0x8003b3b8`, `0x80036848`).

So the body keeps its turn within its frame through a teleport, and the draw after lays it on the new face as it stood on the old.

A count left running where the ball leaves the teleporter, or where the teleporter is off, is dropped to −1 (`0x8003a5b4`, `0x8003a5f4`), so the sixteen frames run unbroken.

The table ships the count, the band, the hold and the marker's band as the teleporter's `send`.

**The ball leaves by an exit it stands on with no key left, five frames on, or at once as it lands on one.** With no bonus flag (`0x8003ad84`) the hazards routine, with the ball on the ground, asks whether the word at 356 reads 7 (`0x8003aed0`) and the keys left are nothing (`0x8003aedc`, `0x8003aee4`): where the ball has just landed, which a flag at 494 the landing sets and the next frame's intents clear says (`0x80030d3c`, `0x80036834`), it writes 1 into the ending's copy at `0x800a4c9c` at once (`0x8003af14`), and else, with no wait running, writes 1 into the ending at 540 and 5 into the wait at 370 (`0x8003af30`, `0x8003af38`); the hidden exit, 26, the same with 3 (`0x8003af44` to `0x8003afa8`).

The exit's `f4` is not asked, so the keys left alone open it, and a level with no key never asks ("The level's clock and its end" below).

The table ships the two codes and the wait under `play`.

The viewer throws the switch and takes the teleporter as the game does: the hazards' slot runs the two after what is under the ball on the ground and the pills, each by the band the table ships against the progress word the last frame's place in its cell left, and for the switch against the measure across as well, the switch turning its circuit over through the map's own presses as the panel's button does, and the teleporter counting its frames with the wait held and the three requests cleared and then placing the ball at rest on the face its `f7` names, facing by that teleporter's `f2`, its radius off the face rather than on the face's plane, since the rest state lays it there on the next frame and the stepper's cell arithmetic would put a centre on the plane in the block's own cell.

The marker is cleared between the ball's state and its move step, where the game clears it, by the frame's own progress and measure across against the marking device's band, and on the frame of a send where the far end leaves the word past the band's top, as the routine's tail does; a count stands while the ball is off the band on the teleporter and is dropped where the teleporter is off or the ball has left it, as the routine's exits write it.

The send keeps the body's turn within its frame, as the game's does: the body as it stands along the ball's side, heading and normal is laid again about the far face's frame, so the draw after shows it on the new face as it stood on the old, while the level's start and a restart lay the body aligned with its frame, as the game's start does.

## What harms the ball

**Each frame the ball's routine runs the hazards, what the ball's cell and the block under it do to it, then the captivators' hit test, and a death is a countdown rather than a state** (`0x8003670c`, `0x8003679c`).

A cause sets its ending code in the word at 540 of the ball's record and a countdown at 370, where none runs yet, the captivators apart, and most set the word at 706, which freezes the ball: its state does nothing (`0x8002f8a4`, `0x8002f8ac`), nor a jump's rows (`0x8002fd08`, `0x8002fd10`), nor the move step (`0x8003024c`, `0x80030254`), nor the landings (`0x80030630`, `0x80030638`); the speed and the spin's are dropped, and a mark at 512 flashes the ball's light, all three channels running through a sine that steps 1024 a frame, white to black every four frames, over whatever the heat had tinted (`0x80032318` to `0x80032368`).

While the countdown runs the pad is not read and the three requests are cleared each frame (`0x800363f0` to `0x80036428`), and as it reaches nothing the ending becomes the result at `0x800a4c9c` and from there the level's outcome; the codes, the countdowns and the outcome's path are in "The level's clock and its end" below.

The table ships the flash and the tint as the ball's `dying` and `tint`.

**A lit beam kills the ball whose cell it is, in four frames.** The hazards read the word at 156 of the 27 about the ball, the ball's own cell (`0x8003a940`), and where it holds −2, a lit beam, with the ball unharmed and no countdown running, set the beam's ending and a countdown of 4, drop the speeds and set the heat to 1900 (`0x8003a954` to `0x8003a998`), so the ball glows red as it dies, stopped but not frozen.

The test is on the cell the centre lies in, on the ground or in the air, so a jump through a beam kills too; the ball rolls into a beam's cell freely, −2 reading as empty to the floor and wall tests ("The ball's moves" above), and a dark beam's −1 does nothing.

The table ships the cell and the heat as kind 8's `harm`.

**Fire heats the ball by 40 a frame, by 600 as it lands on it, and kills past 2000.** On fire, kind 1 (`0x8003ab48`), on the ground alone, which the air test says (`0x8003ab50` calls `0x8003b514` and `0x8003ab58` skips the heat on its answer), and unharmed, the heat at 516 grows by 40 (`0x8003ab7c`, `0x8003ab80`), and on the frame after a landing on it, by the mark at 494 ("The devices under the ball" above), by 600 besides (`0x8003abb4` to `0x8003abe4`); past 2000, with no countdown running, the ball is frozen, the ending fire's and the countdown 25 (`0x8003abf0` to `0x8003ac28`), and while that countdown runs the ball's routine widens the squash word at 704 by 210 a frame (`0x8003642c`, `0x80036448`, `0x80031390`, and "The ball" above), so it swells as it burns.

Off fire the heat cools by 15 a frame, and on ice by 150 more, to no less than nothing (`0x8003ac60` to `0x8003ac6c`, `0x8003ad30` to `0x8003ad3c`).

From cold a ball standing on fire dies on its 51st frame, 0.85 s; rolling on at full speed it takes about 620 a block, and from rest on the first of a row of fire blocks 1040 to cross it, so it dies on the third block, which is what play shows.

The heat shakes the pad by 40 plus a 25th of itself, with the big motor from 126 (`0x80036718` to `0x80036754`), and tints the ball's light: the heat, the acid's melt and the ice's cold each add their 400th to their own channel, red, green and blue, and take their 2000th off the other two, the light being 4096 untinted (`0x800320b4` to `0x800321fc`), so the red is doubled at a heat of 400.

The table ships the heat's numbers as kind 1's `heat`.

**Acid dissolves the ball in six frames.** On acid, kind 4 (`0x8003aca0`), on the ground, with no countdown running and the ball unharmed, the ending is acid's, the countdown 6, and the melt at 524 grows by 300 (`0x8003acb0` to `0x8003ace0`); while the countdown runs the ball's routine adds 300 a frame more (`0x8003647c`, `0x80036498`) and the hazards hold the word at 2000 (`0x8003ac88` to `0x8003ac94`), so the ball greens as it goes.

Acid alone of the deaths neither freezes the ball nor drops its speed: a rolling ball rolls on through its six frames with the pad dead.

The table ships the melt as kind 4's `melt`.

**Under the invincibility pill the ball's light runs red, green and blue by a counter stepping 100 round 8192, a round every 82 frames.** After the heat's, the melt's and the cold's tints (above) the ball's draw reads the pill's word, 556 of the record, the word at `0x800ba340` the hazards count down ("What the ball takes" above), and passes the colours over while it is −1 (`0x80032200` to `0x80032208`).

Otherwise it adds 100 to a halfword at `0x800a46f4`, 6076 past gp, takes the sum modulo 8192, rounded toward nothing, and keeps it (`0x80032210` to `0x80032234`), and then raises each channel by three times the sine of an angle of its own, the angle taken modulo a turn and the sine the table's, 4096 at a quarter turn: red while the counter is under 4096, by the sine of the counter itself (`0x80032240` to `0x80032280`), green while the counter less 2049 is under 4095 taken unsigned, so from 2049 to 6143, by the sine of the counter less 2048 (`0x80032284` to `0x800322d0`), and blue from 4097 on, by the sine of the counter less 4096 (`0x800322d4` to `0x80032314`).

So a channel rises for a quarter of the round and falls for the next, by up to 12288 either way of the 4096 of the untinted light, red over the first half of the round, green over the middle two quarters and blue over the last half, one channel falling as the next rises, a quarter round apart, about 20 frames, 0.34 s, and the round comes back to red every 82 frames, 1.37 s, the counter landing 8 further along each round since 100 does not divide 8192.

The glow adds to the tints the draw has just laid, so a ball that comes to the pill hot has its red raised twice over while the heat cools by 15 a frame (above), fire adding nothing to it while the word runs (`0x8003ab6c`, `0x8003abd0`), and the flash writes over all three channels where the ball is marked dying (`0x80032318` to `0x80032368`); the three words then go to the model's draw as they stand (`0x8003241c` to `0x8003246c`, `0x800324b4`), and what the renderer makes of a channel past full or below nothing is not read.

The counter is named by no other instruction, by gp or by address: the executable loads it as 0 and the start's clear zeroes every word from `0x800a4220` to `0x800fb1e8` (`0x80069988` to `0x800699a4`), the counter among them, so it starts at nothing as the game is switched on and every later pill carries on from where the last left it, stepping only on the frames the ball is drawn with the pill's word not −1, the 841 a pill lasts.

The table ships the step, the round, the gain and where in the round each channel's turn starts as type 34's `lasts.glow`.

**Spikes kill in ten frames, the moving spikes while their `f4` is 1.** On spikes, type 12 under the ball (`0x8003b034`), with no countdown running and the ball unharmed, a sound plays and the pad shudders, the ball is frozen, the countdown set to 10, the speeds dropped, the ending set to the invincibility word's own value as the test passed it, and the ball marked dying (`0x8003b044` to `0x8003b0cc`).

On the moving spikes, type 11 (`0x8003b0d8`), the slot's `f4` must be 1 (`0x8003b0f4`, `0x8003b0fc`), which their cycle sets as they rise and clears with 11 frames of the retraction left ("The moving spikes" below): on the frame after a landing the countdown is 10 (`0x8003b120`, `0x8003b188`), and standing as they rise it is 9 (`0x8003b1a4`, `0x8003b220`), the ending the same either way.

The table ships the flag and the standing countdown as type 11's `harm`, and the frames of the cycle on which `f4` holds the flag as its `deadly`.

**A captivator catches the ball within 212 units of its position, the wandering ball within 127.** Each frame, while the ball is unharmed, the hit test squares the distance from the ball's position words as they stand, with no travel added (`0x80036770` to `0x800367a0`), to each entry's position words as this frame's mover left them (`0x8003d5bc`, `0x8003d5d8`, `0x8003d5f4`), 200 off its face, the corkscrew's rising with its bounce (below), and a square of at most 44999 catches it, under 16200 for a wandering ball, type 53 (`0x8003d570` to `0x8003d648`), with no air test and no countdown asked after, so a ball riding a platform, whose words are relative to it ("The blocks under the ball" below) and lie near the lattice's corner, where no captivator of the disc's levels stands, is caught by nothing.

The ball's routine then, unless the ball is captured already, plays a sound, shudders the pad, freezes the ball, sets the countdown to 10, drops the speeds, sets the captivator's ending and marks the ball dying (`0x800367a4` to `0x8003681c`), and the captivators stand still while that ending stands (`0x800366d0`).

Type 42's brown form does the same from the contact walk, whose case reads the form, `f3`, and finds it 0 (`0x800386c4` to `0x80038724`), with the same ending and a countdown of 10; the green form is collected ("What the ball takes" above).

The table ships the squares as the five types' `catch` and the form as type 42's `harm`.

**The corkscrew catches from where it bounces: a ball rolling under it is within reach only about each landing, and one jumping over it only while it is up.**

The mover's case for type 56 (`0x8003c258`, `0x8003c25c`) steps the angle at 174 of the entry by 23 and stores it (`0x8003c274`, `0x8003c280`), plays the landing's sound where it has reached 2048 (`0x8003c28c`, `0x8003c290`, `0x8003c2f0`), wraps it at 2048 by a mod taken every frame (`0x8003c2f8` to `0x8003c344`) and takes its sine (`0x8003c36c`), and for each axis of the normal at 16 in turn (`0x8003c398`, `0x8003c440`, `0x8003c4e8`) multiplies the normal's word by 400 (`0x8003c3a0`, `0x8003c448`, `0x8003c4f0`) and by the sine over 4096 (`0x8003c3b4`, `0x8003c3c8`), adds the home at 32 (`0x8003c3e0`, `0x8003c488`, `0x8003c520`) and writes the sum into the position at 24 (`0x8003c3f4`, `0x8003c49c`, `0x8003c534`), the words the hit test reads (`0x8003d5bc`, `0x8003d5d8`, `0x8003d5f4`) later in the same frame (`0x800366f4`, `0x8003679c`).

So the hit test's point is the home, 456 from the block's centre and 200 off the face, plus 400·sin θ along the normal, and neither the draw's 150 nor the shadow's 170 enters it, the draw's taken off a copy of the position words (`0x8003d6d4`, `0x8003e574`, `0x8003e5f0`) and the shadow's off a copy of the home (`0x8003d6e8`, `0x8003e87c`, `0x8003e8f8`).

A ball on the corkscrew's face has its centre 100 off it ("The ball's moves" above), 100 under the point at a landing and 500 under it at the top of the bounce; straight under, it is within 212 while the rise is at most 112, θ within 186 of a landing either way, 373 of the 2048 angles and 16 or 17 frames about each landing, 0.27 or 0.28 s, and clear for the rest of the bounce, and across the face the reach is 187 at a landing and 7 at a rise of 112.

The test has no air test and takes the ball's position words at 60 as they stand (`0x80036774`, `0x8003677c`, `0x80036784`, `0x8003d5b0`, `0x8003d5cc`, `0x8003d5f8`), so a jump, whose centre passes over the block near its apex, 458 up and 558 off the face ("The ball's roll" above), is within reach of a corkscrew risen 146 or more, θ from 244 to 1804, 67 or 68 frames of each bounce, and clear for the 21 or 22 about the landing; the long jump's apex, 687 up, is within reach only of one risen 375 or more, θ from 793 to 1255, 20 or 21 frames about the top.

The table ships the point's height off the face as type 56's `catch.stand`, beside its square, where its `entry.stand` is the drawn 50.

The viewer kills the ball as the game does: the hazards' slot tests the word for the ball's own cell, read with the word for what it stands on between the state and the move step, where the game reads the cells about the ball, so a frame behind the centre, for a lit beam, on the ground or in the air, heats the ball on fire on the ground and by the landing's measure on the frame after a landing, cools it off fire, and on the ground holds the melt at its top and dissolves the ball on acid, and after the way out tests the spikes and the moving spikes under it, each death a countdown set as the routine sets it, with its ending and its wait, the ball frozen and marked dying where the routine writes the two words, the speeds dropped where it drops them, and refused while a wait runs or the invincibility pill's word is not negative, as the routine tests the wait at 370 rather than the ending.

The captivators' hit test follows the hazards every frame the pill's word is negative, under the guard too, against each walker's position as the rules have stepped it and each other entry's where the loader put it, 456 off its block's centre, the corkscrew's risen by its bounce, from the ball's position words as they stand, relative to the platform and biased by the table's block while it rides one, so a rider is caught by nothing, as in the game, and overrides any countdown but a catch's own, the catalogue star's brown form ending the contact walk's case the same way with the ordinary refusals.

The swell and the melt grow in the wait's slot, and a death is not set once the level's outcome stands, which the game's frame, run to its end, would set again to no effect.

The corkscrew's point rises with the bounce as drawn, posed at the frame the rules run, which is the frame the draw then shows, so a ball rolls under a risen corkscrew and a jump over it is caught while it is up, as above.

The mode flashes the marked ball and tints its light by the heat, the melt and the cold as the ball's draw does, and does not draw the burning ball's swell; the invincible ball's light it colours from the counter above, kept for the page's life and never put back, so a later pill carries on from where the pill before left it, and stepped on each frame the ball is drawn with the pill's word not negative, the ball not drawn once the level's outcome stands, each channel raised after those tints by the gain times the sine of the counter less its start while that lies within a turn, the start included, though the listing opens the green's and the blue's windows one on from their starts, where the sine is nothing, the dying flash writing over all three, a channel below nothing held at nothing and a channel past full left to the shading as it stands, since what the game's renderer makes of either is not read.

## The blocks under the ball

**Most of what is under the ball acts on the ground alone, and ice rolls the ball on.** The hazards ask the air test before the kinds and types under the ball (`0x8003ac70`, `0x8003ac78`): a ball falling, or in a hop or a jump while its count stands at 2 or more, through all its rows, is in the air (`0x8003b514` to `0x8003b534`), and the laser ("What harms the ball" above), the arrow and the ice's two requests, which come before the test, act in the air too, while fire's heating asks a test of its own.

The word for what the ball stands on reads 2 for a kind-2 block (`0x800378bc`, `0x80037970`). A plain block's word is the type of the slot on the face the ball stands on (`0x80037944`, `0x8003794c`), so a type-2 patch on that face reads 2 too, and a patch is ice to everything that asks the word, the predicate above included.

On ice, the word reading 2 (`0x8003aab0`), the hazards make the forward request and drop the turn's on every frame (`0x8003aab8`, `0x8003aac0`), after the input routine and before the intents, so a ball on ice never rests, never turns and rolls on through every middle; the jump's request stands, so Cross on ice is the forward jump.

The may-roll-on predicate refuses nothing on ice ("The ball's moves" above), so the move step's own branch for a refused roll on ice (`0x800302dc`, `0x800302e8`) is never reached: over an edge beside a neighbour, where nothing takes the ball round, it falls from 101 of progress in the cell beyond; an edge with nothing beside takes it round as on stone, and a wall ahead takes it up.

The slide ends on the first block that is not ice, where the request is the pad's again: at that block's middle where Up is not held, or in the fall, the wrap or the climb the ice sends it into.

On the ground on ice the heat cools by 150 a frame more than off it (`0x8003acec`, `0x8003ad30`, `0x8003ad38`), and a cold at 520 grows by 40 a frame and is set back to 400 as it passes 500 (`0x8003ad48` to `0x8003ad60`), so it runs 400, 440, 480 and back and the ball's light flickers blue ("What harms the ball" above); off ice the cold wanes by 10 a frame to nothing (`0x8003ad6c` to `0x8003ad78`).

The table ships the chill and the cold as kind 2's `chill` and `cold`.

**An arrow lets the ball roll off it its own way alone, and turns back a ball that arrives in the air against it.** On an arrow, type 28 under the ball (`0x8003a9a4`), the hazards lay the arrow's way from its face and its facing, the slot's `f2` (`0x8003aa48`, `0x8003aa54`): the way routine lays the face's second tangent and then its first, on the top −x and then +y (`0x80038038` to `0x8003804c`), and gives the first for a facing of 1 or any value but 2, 3 and 4, the second for 2, the first turned round for 3 and the second turned round for 4 (`0x800380ac` to `0x80038148`), the facing rule the start and the things on a block follow, turning from the first tangent ([level-format.md](level-format.md)); where the ball's heading differs from it on any axis the forward request is dropped (`0x8003aa68` to `0x8003aaa4`), on the ground or in the air.

The turn's request is left, so a ball on an arrow turns in place, and so is the jump's, so Cross with Up against the arrow is the hop and not the forward jump.

In the air over an arrow the air test sets a flag at `0x800a5e98` (`0x8003b548`, `0x8003b550`), cleared on the ground (`0x8003b55c`), and the wall test the jump runs reads it from a progress of 412 (`0x800308ac`, `0x800308b4`): where the heading differs from the arrow's way on any axis (`0x800308cc` to `0x800308fc`) the ball bounces as off a wall, back twice the frame's advance ("The ball's roll" above, `0x80030914`), and where it lies along the way the flag is cleared (`0x800309cc`).

**A crumbling block breaks the frame the ball first stands on it and is gone on the twentieth frame.** On a crumbling block, 96 at 356 ("The shadows" below, `0x8003afb8`), the hazards read the record's type word (`0x8003afd4`) and, where it is still 1, score 50 with a sound (`0x8003afdc` to `0x8003b00c`, and "What the ball takes" above), and write 2 into it on every frame the ball stands there (`0x8003b028`).

The frame's draw, which the loop runs after the ball's routine, runs the crumbling blocks (`0x8002a40c`): a type of 2 breaks the block, its faces drawn whole and debris spawned, the screen shaken, a sound played and the type set to 3 (`0x8002b4b8` to `0x8002b5a8`), and from either type its `f2`, 512 at load, loses 26 a frame (`0x8002b5bc`) until it goes negative, on the twentieth frame, when the faces are undrawn, the type cleared and the lattice cell emptied (`0x8002b5c4`, `0x8002b64c`, `0x8002b690`, `0x8002b69c`), from which a ball at rest on it falls, and one rolling between 101 and 427 of progress ("The ball's roll" above).

A block takes 15 or 16 frames at full speed, so a ball rolling on crosses a crumbling block before it goes, and one that stops at its middle, eight frames in, has about a dozen frames left.

The input routine's tail keeps a ball on one from its free edge: with the floor ahead empty and nothing beside the block under, where the wrap would take the ball round, a rolling ball on a crumbling block with no jump asked loses the forward request and its speed from 301 of progress, and from 401 is set back 40 along its heading besides (`0x80037344` to `0x80037418`), the floor ahead, the blocks beside and the block under's word all read as the last frame's read of the cells left them (`0x8003733c`, `0x8003736c`, `0x80037374`), so it is held short of the far edge and cannot go round a crumbling block, only off it onto a block ahead, up a wall, into a jump, or down with it.

The table ships the size, the shrink and the edge rule as kind 6's `size`, `shrink` and `edge`, beside its `points`.

**A vanishing block drops the ball as it goes.** Its cell is in the lattice while it fades in, stands and flashes out, and −1 for the 91 frames it is absent ("The vanishing block" below); the 27 words about the ball are read from the lattice each frame, so a ball at rest on it is dropped once the word under it reads empty (`0x8002f8f8`, `0x8002f910`), one rolling falls between 101 and 427 of progress, and nothing refuses a roll onto a block about to go, the may-roll-on predicate asking only that the floor ahead be there (`0x80030dfc`).

**A moving platform carries the ball in a lattice of its own.** The landings try a platform before a block (`0x8003070c`): the landing probes the cell a block under the centre (`0x80033518`, `0x80033584`), and where it names a record of kind 5 (`0x800335b8`), with the ball on a face across the run, at most 100 off it (`0x80033614`) and within the platform's body along the run (`0x80033624`, below), the ball is marked riding at 486 and set at rest (`0x800330dc`, `0x800330f0`), its centre made relative to the platform's position, biased by a block (`0x800331c8`, `0x800331cc`), the travel at 84 that position less the block (`0x80033204`, `0x80033208`), and the record kept at 528 (`0x80033224`); a second probe lands the ball against a platform's end face (`0x80033228`, `0x80033230`, below).

Riding, the cells about the ball are read from the platform's own lattice at `0x800d4e30` (`0x800334b8`, `0x80033978`, `0x80033b30`), into which the landing laid the platform's blocks along its axis (`0x8003314c` to `0x80033188`) and nothing else, so the ball rolls along the platform and round its ends and sides as round a free block, never falls (`0x8002f908`, `0x8002f96c`) and sees no block of the level's; the level's lattice is read at the ball's true cell for a lit beam alone, which kills a ball riding through it (`0x80033bd0` to `0x80033bf0`, and "What harms the ball" above).

The platform's routine moves the position words the travel is taken from (`0x80032c9c`), and the hazards take the travel afresh each frame (`0x8003b3e0` to `0x8003b410`), so the view's target, the invisible block's light and the draw, which add it to the centre (`0x8002f3d4`, `0x80036914`, `0x800314f0`), follow the platform while the ball's own position stands, and the pad shudders while the platform moves (`0x80033c30`).

The ball leaves a platform by the forward jump or the hop alone (`0x8002f610`, `0x8002f70c`), which mark the leave at 488, put the position back into the level's lattice and the travel to nothing (`0x80033818` to `0x8003391c`); at the run's ends the platform reverses under the ball, which rides on.

The table ships the bias and the rumble as kind 5's `ride`.

**The body landing takes a ball on a face across the run and measures its centre along the run alone, and the end landing takes one on a face along the run and lays it against the end.** Once the cell a block under the centre names a platform's record, the body landing takes the face of the ball's normal, the slot number of the face the normal points out of, +x 1, +y 2, −y 3, −x 4, the underside 5 and the top 0 (`0x800335c0` to `0x800335e0`, `0x80037f98` to `0x80038000`), and the record's first field, the axis of the run ([level-format.md](level-format.md), `0x800335e4` to `0x800335f8`), and asks whether the face lies along the axis (`0x800335fc`, through `0x80033c54`): 1 and 4 are x, 2 and 3 y and 0 and 5 z, for the axis word and the face alike, and the face lies along the run where the two fall in one pair (`0x80033c54` to `0x80033cb0`).

The body landing refuses such a face (`0x80033604`), so a ball on a platform's end face, the top of a platform that runs up and down among them, lands on it through the end landing alone.

With the ball at most 100 off its face (`0x8003360c`, `0x80033614`) it runs the body test (`0x80033624`, `0x80032ec4`), which measures along the axis alone: the run is the record's count of blocks less one, times 512 (`0x80032ed4` to `0x80032ee0`), and the test, dispatching on the axis word, 1 x, 2 y and 5 z (`0x80032ee4` to `0x80032f14`), asks that the centre plus a slack plus 256 be no less than the platform's position, its first block's centre as the platform's routine moves it ("The moving platform" below), and that the position plus the run plus 256 be no less than the centre less the slack (`0x80032f24` to `0x80032fa4`, `0x80032fb0` to `0x80032fc4`), so the centre lies between the two end faces or the slack past either; the body landing's slack is nothing (`0x80033628`), and nothing across the run or along the normal is measured, the cell under the centre and the 100 having fixed those.

Where the first probe finds nothing (`0x800330bc`) the second (`0x80033230`, `0x80033654`) takes the ball's own cell (`0x8003367c` to `0x800336d4`), and where that cell names a platform's record keeps it (`0x800336dc` to `0x80033708`), else the cell a block under the centre along the normal (`0x80033718` to `0x80033754`), which must name one (`0x8003375c` to `0x80033788`); it asks that the face lie along the run (`0x80033790` to `0x800337d4`) and runs the body test with a slack of 100 (`0x800337e0`, `0x800337e4`), the rest height, so the centre may lie as much as 100 past either end face along the axis, where a ball resting against the face has it, and nothing is asked of its height.

The end landing then marks the ride and biases the centre as the body landing does (`0x80033258` to `0x8003339c`), and lays the centre along the axis by the face, through a table at `0x80010170` (`0x80033398` to `0x800333c4`): at 156 where the face points down the axis, 0, 3 or 4 (`0x800333cc`, `0x80033404`, `0x8003343c`, `0x80033440`), and at the count times 512 plus 356 where it points up it, 1, 2 or 5 (`0x800333d8` to `0x800333f8`, `0x80033410` to `0x80033430`, `0x80033444` to `0x80033464`); the first block's centre lying at 512 in the ball's frame on the platform, both put the centre 100 off the end face, where the rest state keeps it, and the landing takes the travel and the record as the body landing does (`0x8003346c` to `0x800334a4`), the two sharing their tail from `0x800334a8`.

The table ships the body landing's height and the test's reach past the end blocks' centres as kind 5's `ride.body`, `off` and `ends`, and the end landing's slack as `ride.end.tolerance`.

The viewer slides the ball on ice and holds it to the arrow as the game does: the hazards' slot makes the forward request and drops the turn's on every frame the word for what the ball stands on reads ice, on the ground or in the air and before the air test, and the stepper's may-roll-on predicate passes where that same word reads ice, so a type-2 patch on a plain block's face is ice to both as an ice block is, and the ball slides through every middle to the first block that is not ice, over an edge beside a neighbour into the fall from 101 of the cell beyond, round an edge with nothing beside and up a wall ahead, and Cross on ice is the forward jump.

On the ground on ice the heat cools by the chill besides and the cold grows by the gain and is set back past its top, waning off ice, and the mode tints the ball's light blue by it.

On an arrow, on the ground or in the air, the way is laid from the slot's `f2` by the facing rule the start follows and the forward request is dropped where the heading differs from it on any axis, the turn's and the jump's left, the strip saying so where the ball is at rest; in the air over an arrow the flag stands and holds the way, cleared on the ground, and the jump's wall test throws the ball back as off a wall from 412 of progress where the heading differs from the way and clears the flag where it lies along.

The crumbling block breaks under the ball as the game breaks it: the hazards' slot, with the ball on the ground on one, scores the table's points while the record's type word is still whole and writes it broken on every frame, whatever it held.

The frame's last part, where the game's draw runs the crumbling blocks, turns a broken word into breaking up, shrinks the size by the table's step a frame from either and empties the cell as the size goes negative, on the twentieth frame counted from the break, from which the probe reads the cell empty and the index the frame draws leaves it out, so the next frame's read of the cells about the ball finds nothing under it and the frame after that drops a ball at rest on it, and one rolling from between the roll's bounds, by the word that read left, as the game's rest state and roll do.

The stepper's pad reading holds a rolling ball on a block the last frame's read found brittle short of its free edge, with the floor ahead empty, nothing beside and no jump asked, dropping the forward request and the speed from the table's hold and setting the centre back by its push from its further mark, as the input routine's tail does by the word that read left, so the ball creeps on by the roll's first gain a frame and never reaches the wrap, and the hold stands on the frame after the block goes, whose read first finds it gone.

The vanishing block is read through the same probe, which answers the lattice as the last frame's step left it, the cycle's entry for the frame before the one running, which is the entry the frame drawn before showed, so the read of the frame after the first the map draws it absent finds nothing under the ball and the frame after that drops it, at rest or from between the roll's bounds, by the word that read left, and nothing refuses a roll onto one about to go.

The platform carries the ball as the game's does: the landings try a platform before a block, the body landing first, and where the cell a block under the centre is a platform's body where the platform stands now, with the ball on a face across the run, the centre at most the table's height off its face and, measured along the run alone against the platform's position as the walkers left it, no further past either end block's centre than the table's reach, the ball is marked riding at rest with its position made relative to the platform's, in which the platform's own blocks stand at home and are all the probe calls solid while it rides, so it rolls along the platform and round its ends and sides as round a free block and never falls, the rest state's and the roll's drops passed over as the game passes them, and the contact walk takes nothing.

Where the body landing finds nothing the end landing takes the platform whose body the ball's own cell lies in, else the one the cell a block under the centre lies in, asks that the ball's face lie along the run, measures the centre along the run as the body landing does with the table's slack past either end, and rides as the body landing rides, with the centre laid along the run the rest height off the end face the ball's normal points out of.

The travel is taken afresh each frame from the platform's position less its home as the hazards end, once the walkers have stepped, so the beam is read at the cell the last frame's travel gave, and the view's target, the drawn ball and its dust add it to the position, while the level's lattice is read at the true cell for a lit beam alone and the captivators' hit test takes the position words as they stand ("What harms the ball" above).

The forward jump and the hop alone leave the platform, the position the level's again and the travel nothing, and the hop comes down by the lattice as it stands, on the body as on stone where it is still under, which the platform moving on drops.

Where the map still differs:

- The home cell reads empty while the body is away, so a ball standing on a platform's block without riding it is left to fall as the platform moves off.
- The word for what the ball stands on is the platform's own while it rides, what the game's read of the platform's lattice writes being unread.
- The ball keeps its shadow on the platform, which the game's loses.
- A forgiven rider is set down in the level where it last rested rather than put back riding.

The laser's blocks are read as the game's lattice holds them: a beam's two ends as bare blocks, the loader laying one at each ([level-format.md](level-format.md)), and a lit beam's cell under the ball's cell leaves the word for what the ball stands on as it was, as the game's read does.

## The level's clock and its end

**The clock ticks once a frame at the top of the ball's routine, 50 ticks to a second it shows, and stands while the ball is on a clock face.** The ball's routine calls `0x8003b468` with 1 first (`0x800362ec`, `0x800362f8`); the routine leaves the clock where the word at 356 reads 8, the clock face, where the word at `0x800a344c`, which nothing writes but to clear it, is set, or in the Simon rooms' mode (`0x8003b474` to `0x8003b498`), and otherwise takes the ticks off the clock at `0x800a573c` and where that comes to nothing or less writes −2 into the level's outcome at `0x800a5e00` (`0x8003b4ac` to `0x8003b4c4`); the lethargy pill calls it with 4 more.

The start fills the clock with the level's time times 50 ([level-format.md](level-format.md)), 4950 for 99 seconds, 82.5 s of frames, and a flag at `0x800a53c4` tells the HUD the clock stands.

**A level ends in the outcome word, positive for a way out and negative for a loss.** Most endings are first written into the ball's record at 540 with a wait at 370; the ball's routine counts the wait down, holding the pad and the requests off meanwhile (`0x800363f8` to `0x80036428`), and as it runs out copies the ending to the result at `0x800a4c9c` (`0x800364a8`, `0x800364c8`), a store indexed by the word at `0x800a33d0` that gates every update ("The frame" above), from where it becomes the outcome: a result of 1 only where the word at `0x800a33cc` is 1 or both results, at `0x800a4c9c` and `0x800a4ca0`, are 1 (`0x800365ec` to `0x80036628`), and any other straight in (`0x80036630`, `0x8003663c`).

The codes:

- 1 out by the exit, or a Simon room done (`0x8003af2c`, `0x8003636c`).
- 2 a bonus level's last block (`0x8003aebc`).
- 3 out by the hidden exit (`0x8003afa0`).
- −1 the spikes or the moving spikes, where the ending is the invincibility word itself, −1 as the test passed it (`0x8003b058`, `0x8003b0c4`), and the outcome is written directly as the wait reaches 1 (`0x80036450` to `0x8003646c`).
- −2 the clock (`0x8003b4bc`).
- −3 the ball lost off the lattice, written by the draw (`0x80036a5c`, "The ball's roll" above).
- −4 burnt, past 2000 of heat on fire (`0x8003ac10`).
- −5 caught by a captivator or by type 42's brown form (`0x800367a8`, `0x800386f8`).
- −6 the acid block (`0x8003acc8`).
- −7 a lit beam in the ball's own cell (`0x8003a97c`).
- −8 a Simon room failed (`0x800363cc`).

The waits: 5 for the exits and the bonus level, 10 for the spikes and a captivator, 25 for fire and the Simon rooms, 6 for acid and 4 for a beam (`0x8003af34`, `0x8003afa8`, `0x8003b0a0`, `0x800367f0`, `0x8003ac18`, `0x80036360`, `0x800363d8`, `0x8003acd4`, `0x8003a984`).

In the Simon rooms the input routine's verdict at `0x800a4cb4`, 1 for the sequence done and 2 for a wrong move (`0x80037164`), becomes the ending 1 or −8 once the ball rests with no turn running (`0x80036334` to `0x800363e0`, "The Simon rooms" below).

Every death but the clock's, the lattice's edge and a Simon room's failure, whose test asks only the verdict, the turn count and the rest state (`0x800363a8` to `0x800363cc`), is refused while the invincibility pill's word is not −1, and an outcome below nothing in a mode past the arcade's, a bonus or a hidden level, leaves the score at nothing as the loop takes it (`0x80041b18` to `0x80041b34`).

The table ships the codes as `play`'s `ending` and the waits as its `wait`, and the clock's tick, its second, the face it stands on and its outcome as `clock`.

**The end screen names the outcome in a word of the game's own lettering, a death's in capitals.** While an ending stands the loop draws the end screen on each pass (`0x80041bf0` calls `0x80015fe8`, and that the loader at `0x800156e0`), which reads the outcome (`0x800156e4`) and takes twice its negation as an index where it is negative (`0x80015714` to `0x8001571c`), 20 where it is not (`0x80015730`) and 0 where there is none yet (`0x80015a1c`), into a table of 38 deflated sprites at `0x80088798`, whose address the word at `0x80075fd8` holds (`0x80015a34`) and whose count comes first, an index past the count less two drawing nothing (`0x80015a3c` to `0x80015a4c`).

An entry is eight bytes, an offset from the table and a length (`0x80015a88` to `0x80015a94`), inflated by the zlib the executable carries (`0x80015abc`, `0x80015acc`) into an image four bits a pixel with a palette of 16, and a word is two entries, the index's and the next (`0x80015c28`), the first taken off what is behind it and the second added to it (`0x80015d3c`, `0x80015e28`), so the word stands embossed over the level.

The deaths read −1 "SPIKED!", −2 "TIME OUT!", −3 "FELL OFF!", −4 "FIRE!", −5 "CAPTURED!", −6 "ACID!", −7 "LASER!" and −8 "Wrong Move!", and every way out, by the exit, the hidden exit or a bonus level's last block, reads "Well Done!"; an outcome of nothing, the level loading, reads "LOADING!", and once the total is below nothing on an ordinary level of the arcade the screen fades to "Game Over!" (`0x80015784` to `0x800157e4`). The lettering sets the mark a space off the title-case words but "Wrong Move!", which the table drops.

The other modes have words of their own: the time trial's exit reads "Very Well Done!" where a time the trial keeps per player, with 60 frames a step of the difficulty added (`0x80015748`), is under a frame and "Level Cleared!" where it is past 20 seconds (`0x80015724` to `0x80015780`), its qualifying "You qualified!" or "You failed to qualify!" (`0x80015958`, `0x8001595c`), and two players, there or in Copycat, "Player 1 Won!", "Player 2 Won!" or "Equal Time!" (`0x800157f0`, `0x80015868` to `0x80015878`, `0x800159f4` to `0x80015a04`), and the pair at 26 is the memory card menu's picture.

The last final's completion picks the acid's pair for one pass: the next-level routine, which the loop calls on an ending's first pass alone, before the end screen's draw (`0x80041b08` to `0x80041b10`, `0x80041b98`, `0x80041c30`), counts the world word at `0x800a340c` on as the pack's levels run out (`0x800428d0` to `0x800428d4`, `0x8004296c`, `0x80042970`), the loader in the arcade reads that word at 10 with the finals flag at `0x800a3454` set and a way out as the index 12 (`0x80015880` to `0x800158cc`), and the pass's tail puts the world back to nothing and the total below it (`0x80041d48` to `0x80041d4c`, `0x80041e44` to `0x80041e48`).

What the screen shows of that pass is not read.

The table ships the word each of the eleven codes picks as `play`'s `words`, "Well Done!" for the three ways out, the word the game's end shows as their `over` and the three the Copycat mode's end names a winner or a draw with as `won1`, `won2` and `equal`, each pair held to the disc by a digest of its two images.

**A bonus level marks the block under the ball on every frame it stands on one, 50 for the first time, and ends with the last.** With the bonus flag, which the start sets where a level has no key outside the Simon rooms (`0x80035fe0`), the hazards routine takes the cell 356 under the ball's centre along the normal, the block it stands on, and where it lies at 1 to 33 on every axis hands it to `0x8002dc30` (`0x8003ad8c` to `0x8003ae78`), as the move step does for the floor block ahead, under the wall, as the ball climbs it (`0x80030468`, `0x80030490`).

That routine passes where the cell holds no block, where the block is marked already or where its kind is 3, the invisible block, and otherwise marks the block, takes one off the count of unmarked blocks at `0x800a5e58` that the face builder filled, adds 50 with sound 116 and repaints the six faces (`0x8002dcc0` to `0x8002dd70`).

The repaint hands each face to `0x8002ddac` (`0x8002dd70`) with the mark, 1 at both calls (`0x80030494`, `0x8003ae78`): the routine leaves a face whose own byte, at 48 plus the face in the block's 64-byte state, holds the word already (`0x8002de04`, `0x8002de0c`), else writes it there (`0x8002de1c`), takes the face's quad (`0x8002de20`) and, where there is one (`0x8002de28`), puts twice the word into bits 1 and 2 of the third byte of the quad's flags, bits 17 and 18 of the word (`0x8002de2c` to `0x8002de48`), and where the face has no entry in a list of 32 at `0x800d0f5c` (`0x8002de54`, `0x8002de80`), 16 bytes each (`0x8002de78`, `0x8002de88`), gives it the first free one, with the quad and a count of nothing (`0x8002de94` to `0x8002dea0`).

The texture animator at `0x8004f3b8`, which the frame's draw runs once over each chain of faces (`0x8002a41c`, `0x8002a42c`, `0x8002a450`, `0x8002a460`), picks a face's frame table by bit 16 of its flags (`0x8004f460` to `0x8004f468`), the first where it is clear (`0x8004f478`, `0x8004f480`) and the second where it is set (`0x8004f48c`, `0x8004f494`), so a mark changes no frame, and its colour table by bits 17 and 18 (`0x8004f498` to `0x8004f4b0`), the first where both are clear, the second on bit 17 alone, the third on bit 18 alone and the fourth on both, writing the table's word into the quad's colour at 12 (`0x8004f4d0`, `0x8004f4e4`, `0x8004f4f8`, `0x8004f50c`), so a marked face takes the second.

On a level with no key the loader hands the two chains it lays the faces on, one for the faces that run the swirl's frames (`0x800270dc`, `0x800270e0`) and one for the faces with none (`0x80027040`, `0x8002704c`), the crumbling block's, the platforms' and every face of a type short of 20 among them (`0x800274e8`, `0x80027704`, `0x80027708`, `0x800277b0`, `0x8002800c`), the same two of the four colour cycles the executable holds, picked by the parity of the world word at `0x800a340c` (`0x80027000` to `0x8002701c`): the cycle at twice the parity as the first table (`0x80027020`, `0x80027024`, `0x80027064`, `0x800270f8`) and the one after it as the second (`0x8002702c` to `0x80027034`, `0x80027078`, `0x8002710c`), so a face as built leaves the same magenta in every world, for violet and red in the even worlds and for red and brown in the odd, and a marked one runs through orange in the even worlds and blue in the odd ([tgi.md](tgi.md)).

After the animator the draw runs the fade at `0x8002deac` (`0x8002a468`) over the 32 entries (`0x8002df70`), passing one with no link (`0x8002dec8`): it adds 128 to the entry's count (`0x8002ded8`) and where the count has reached 4096 frees the face's link and the entry (`0x8002dedc` to `0x8002def0`), else keeps the count (`0x8002def8`), takes the quad's colour (`0x8002defc`) and puts each channel through 160 plus the channel less 160 times the count over 4096 (`0x8002df08`, `0x8002df0c`, `0x8002df38`, `0x8002df3c`), writing the word back (`0x8002df64`).

The 160 is the fade's own: 128 is a channel's own brightness, drawing the texture as it is, and is what the face builder lays a face with (`0x80027880`, `0x80027884`, `0x800278b0`), at 12 of the face (`0x80028e64`, `0x80028e6c`), the vanishing block's faces apart, laid at 160 (`0x80027608`, `0x8002760c`, `0x80027638`).

The ball's routine marks before the frame's draw runs (`0x80040ffc`, `0x8004101c`) and the animator writes the cycle's colour before the fade on every pass, so a face marked on a frame is drawn on that frame a 32nd of the way from a grey a quarter brighter than its texture to its cycle's colour, a 32nd further on each frame after, and from the 32nd frame on in the cycle's colour itself, 0.53 s from grey to colour.

With the count at nothing the level ends, at once with an outcome of 2 where the ball has just landed and else as an ending of 2 with a wait of 5 (`0x8003ae80` to `0x8003aec4`), and the exits are never asked.

The table ships the 50 and the kind skipped as `play`'s `bonus`, and the fade's step, its full count and its grey under `skins.cycles.bonus` as `marked`.

The viewer ends the level as the game does: with no key left the exit the ball stands on, or the hidden exit, writes the result at once on the frame after a landing and else the ending with its wait, and on a level with no key the block under the ball is marked on every frame on the ground, unless the ball rides a platform, whose cells are the platform's, and the block under the wall as the ball climbs it, the count of blocks the face builder fills taken from the lattice as [level-format.md](level-format.md) counts them, the invisible block skipped as the routine skips it, and the last block ends the level the same two ways, the landing's at once written as the outcome itself.

The word for what the ball stands on is read between the ball's state and its move step, where the game reads the cells about it, so the hazards read last frame's as the game's do.

The map marks and counts the block as the game does, and paints it as the game does: its six faces take the marked cycle of the world's pair, through the same spread as a face as built, and come to it from the grey over the game's frames, each frame a pass of the fade, the colour itself at once with Motion off.

**A level opens with the pad dead for 19 frames and the hazards off for 18 by the start's own words, and for longer under the fly-in's hold.** The level's start sets the countdown at 370 to 20 (`0x80035e04`, `0x80035e74`), so the input routine is skipped on 19 frames and runs from the 20th, which is how the Simon rooms open.

Elsewhere the fly-in writes 2000 into the same countdown on each of its 68 frames and 1 as it ends ([camera.md](camera.md)), so the pad is dead for 69 frames and read from the 70th, and the platforms, the captivators and the hazards, which the ball's routine skips while the countdown is 1000 or more, stand from the second frame to the 68th.

A guard at `0x800a5ed8`, which the ball's routine counts up by one while it stands and clears as it reaches 20 (`0x80036300` to `0x80036328`), holds the hazards and the contact walk off while it stands (`0x800366fc`, `0x80036704`, `0x800368bc`, `0x800368c4`).

The guard is set to 1 on every frame the loop runs the ending's routine in the ball's routine's place (`0x8004100c`, `0x80036aac`, `0x80036abc`), which it does while any of three words is set (`0x80040fcc` to `0x80040ff4`): the level's outcome; a word at `0x800a38a4`, which the ball's routine sets from a request at `0x800a53cc` while no outcome stands (`0x80036a68` to `0x80036a94`) and which reads as the pause; and a word at `0x800a57f8`, set at `0x800408a4` and `0x80041378` and cleared at `0x80040744` and `0x80040f40`, which the draw skips the ball on too (`0x80036994`) and whose meaning is not read ("Not settled" below).

So, where the fly-in does not hold them longer, a level that follows another opens with the guard at 1 and the hazards and the contact run from the 19th frame, and the first level since the game was switched on opens with them running.

The input routine clears the guard as soon as it runs with Cross up, and with Cross held reads nothing while the guard stands (`0x80036bd4` to `0x80036bec`), which keeps the press that closed the pause menu from jumping the ball.

The table ships the two counts as `play`'s `start`.

The viewer opens a level by the start's own words, as the game opens a Simon room: the pad is dead for 19 frames and read from the 20th, the platforms and the captivators move from the first, and the guard stands as a level starts again after an ending or follows another in a run, and is clear as the ball is first put down, so the hazards and the contact walk run from the 19th frame where the guard stands and from the first where it is clear.

The fly-in's hold is left out by choice with the flight it belongs to, the view easing from where it stood to the ball's view over 600 ms in the flight's place with Motion on, and cutting to it without ([camera.md](camera.md)).

**An ending turns the camera round the level, and a death costs points.** While the loop runs the ending's routine, the view it builds marks the ball not live and turns about the lattice's middle by three angles stepping −8, 3 and 10 a frame (`0x800347c4` to `0x8003483c`), and stands the eye by the level's mode word at `0x800a53d4` ([level-format.md](level-format.md) has its values), which it reads four times (`0x80034834`, `0x80034874`, `0x80034954`, `0x800349cc`), in three cases.

At 0, the arcade's, a fourth angle steps 12 a frame (`0x80034840`, `0x80034850`) and the eye stands the free camera's distance ([camera.md](camera.md)) plus 1400 off, 1000 further and nearer by turns with the sine of the fourth, 5.7 s a swing (`0x80034968`, `0x8003497c` to `0x800349c4`). At 1, a level with no key, the fourth steps 58 (`0x8003487c`, `0x8003488c`) and the eye swings 3000 about 3400, 1.2 s a swing (`0x800349d4`, `0x800349e8` to `0x80034a38`).

At any other value, which on this disc is the hidden levels' 2, the fourth angle does not step and the eye stands at the distance plus 400, the figure every case writes first and the two swings write over (`0x80034958`, `0x80034964`), where either swing comes nearest, so the level turns under an eye that does not swing. In the Simon rooms the word is 0 whatever the room holds, so a room's ending swings as the arcade's.

On the first frame of an ending the loop settles the points (`0x80041b08` to `0x80041b90`): a level completed adds its score, the word at `0x800a53c8` the pickups score at, to the total at `0x800a5e84` (`0x80042054`, `0x80042058`), and a death in the arcade mode, the level's mode word at nothing, takes off the total the score plus 50 times the level's number, the world's place times fifteen plus the slot plus one, at most 5000 (`0x80041f6c` to `0x80042018`), the finals counting two a world and no 151 (`0x80041fd0`); a death on a bonus or a hidden level, its score left at nothing as above, goes the completed level's way (`0x80041f80`), so nothing comes off the total.

As the level is left a total below nothing ends the game, back to the title with the total at nothing again (`0x80041ca8`, `0x80041cb0`, `0x80041e54`, `0x80041ec4`, `0x800406c4`, `0x80041ecc`), and otherwise the game's loop loads the level again from the disc and sets the ball's words afresh (`0x800405bc`, `0x800405c4`), the same level after a death.

The total starts a game at nothing (`0x800401b4`), so the game keeps no lives but its points: a death that costs more than has been banked ends the game, and from LEVEL 100 on every death costs 5000 and the level's points.

The table ships the penalty as `play`'s `points` and the view as its `view`, the no-key level's figures under `bonus` and the hidden level's eye under `hidden`.

The viewer keeps both mode words as a run starts, the game's word by the level's pack, or by the mark a level of your own carries as a room, and the level's word as the loader numbers it, and stands the eye by the level's word in the three cases: at 0 the arcade's swing, in the Simon rooms too, at 1 the quicker and wider swing and at 2 the still eye, the three angles stepping as before.

The viewer's eye is a zoom: each case starts at the fit, the level whole in the frame, and the two swings draw further and nearer by turns from there, so the still eye stands at the fit, where the arcade's swing starts, and not nearer as the game's eye does.

Every case runs for the frames one swing of the arcade's eye takes, the standing default where the game's length is not read, the still eye for the same count.

**A run banks its points and its fruit as each level ends, and the next-level routine picks the slot the game loads next.** On the first pass of an ending the loop calls the points routine (`0x80041b90`, `0x80041f30`) and then the next-level routine (`0x80041b98`, `0x8004245c`).

Each takes the arcade's branch where the game's mode word at `0x800a33b0` is nothing (`0x80041f34`, `0x80041f3c`, `0x800424c8`, `0x800424d0`); the first skips the banking below while either of two words is set, at `0x800a33f4`, which a routine the loop calls sets (`0x80042afc`), and at `0x800a3414`, which the next-level routine itself sets as a world ends (`0x80041f44` to `0x80041f5c`, `0x80042974`, `0x80042978`), and the second returns at once on the first of the two, the word at `0x800a33f4`, and asks nothing of the second (`0x800424b4`, `0x800424bc`).

The fruit are kept in two words: the one the pickups write at `0x800a5664`, where a fruit of type 43 to 47 sets the bit 1, 2, 4, 8 or 16 (`0x80038ca4`, `0x80038cb0`, `0x80038d58`, `0x80038e00`, `0x80038ea8`, `0x80038f4c`, `0x80038f58`) and the never-reached case for type 27 all five (`0x8003902c`), and a bank at `0x800a53ec`.

A death on an ordinary level, the level's mode word at nothing (`0x80041f6c`, `0x80041f80`), takes off the total the score plus 50 times the level's number, held under 5001 at 5000 (`0x80041ff0` to `0x80042018`), as above, and puts the bank back into the pickups' word (`0x80042004`, `0x80042010`), so a fruit taken on the level is lost with the level.

Any other ending, a way out or a death on a bonus or a hidden level, counts one more fruit in a halfword at `0x800a593c` where the two words differ (`0x80042024` to `0x80042044`), banks the pickups' word (`0x80042050`) and adds the score to the total (`0x80042054`, `0x80042058`), so a fruit taken on a hidden level is kept though the ball dies there.

The next-level routine first numbers an ordinary level (`0x80042460`, `0x80042468`) into a word at `0x800a3400`: the world's place times fifteen plus the slot plus one, or with the finals flag at `0x800a3454` set twice the place plus the slot plus 151, on from the ten worlds' 150 (`0x80042470` to `0x800424b0`).

Then on an ordinary level with a way out (`0x800424dc` to `0x800424f4`) the slot at `0x800a3408` counts on by one (`0x8004254c`, `0x80042558`), and where the bank's five low bits are all set, 31 (`0x80042548` to `0x8004255c`), both fruit words are cleared (`0x80042564`, `0x80042568`), the slot after is kept at `0x800a5914` (`0x8004256c`) and the slot becomes 15 plus the finished slot over five, that share taken round every three (`0x8004259c` to `0x800425e4`), so the first five levels of a world open its first bonus level, the next five its second and the last five its third; the hidden exit, the outcome 3 (`0x800424f8`, `0x800424fc`), keeps the slot after the same way and makes the slot 18 (`0x80042504` to `0x80042538`).

A bonus or a hidden level, whatever its outcome, goes back to the slot kept (`0x800427d4` to `0x800427f8`, `0x80042850`, `0x80042858`), unless the bank has filled meanwhile, when the routine clears both words and opens the bonus level of the kept slot's third, under 6 the first, under 11 the second and else the third (`0x80042810` to `0x8004284c`).

The slot after the fifteenth level, 15 (`0x80042500`, `0x80042514`, `0x80042560`, `0x80042570`, `0x800425f0`), is replaced wherever it comes up by the pack's count, 20 on every world pack of this disc, the first word of the pack the game's loop loads at `0x80156000` as it takes the world word at `0x800a340c` for the world's place (`0x80042520` to `0x80042528`, `0x8004258c` to `0x80042594`, `0x8004260c` to `0x80042614`, `0x800403b4` to `0x800403cc`), and a slot at the count or past it becomes 0 with the world word counted on (`0x800428c0` to `0x800428d4`, `0x800428f8`, `0x8004291c`, `0x8004296c`, `0x80042970`), so the fifteenth level leads to the next world's first, as does the bonus or hidden level it leads to, and slot 19 is never picked.

Two other starts for a world, its last slot and its first bonus level, and a run through the three bonus levels one after another, the hidden level passed over (`0x8004288c` to `0x800428bc`), hang on a word at `0x800a3448` being 1 or 2 (`0x800428dc` to `0x80042938`), which loads as 0 and which nothing writes but to clear it (`0x800482e4`, `0x8004adc4`, `0x8004b5dc`), so they are never taken; the time trial's and the Simon rooms' branches (`0x80042618` to `0x800427cc`) are not read.

The world word reaching 10 (`0x80041cc0`) ends the game as the last final's completion does above, and so, as the level is left, does a total below nothing (`0x80041ca8`, `0x80041cb0`, `0x80041e54`): the slot goes back to 0 (`0x80041e84`), the world word too where the world's place is not the first, among other cases (`0x80041e88`, `0x80041eb4`), both passed over while the word at `0x800a33f4` is set (`0x80041e70`, `0x80041e78`), the total to nothing (`0x80041ecc`) and both fruit words with it (`0x80041ed0`, `0x80041ed4`), as the game's loop clears the total, the score and both words as a game starts (`0x800401a8` to `0x800401b4`), so a run carries its total and its fruit from level to level and nothing else.

The table ships the slots as `play`'s `next`, the three bonus slots, the hidden slot, the fifteen ordinary slots, the five a third, the fruit mask and the ten worlds, and `points` gains the finals' two levels a world.

The viewer banks the points and the fruit as the game does, and follows the game from level to level by its slots, behind a Play setting, Play on through the levels, that is off until a visitor turns it on: without it a level plays on its own, the same level starting again after every ending with no total kept or shown. With it on, a level the game counts, one of a world pack or a finals pack, plays in a run that keeps a total, a bank, the pickups' word, the fruit counted and the slot kept apart from the level's words.

The frame an ending stands runs the loop's step on every level, a draft's included, run or no run: a bad ending past the arcade's mode scores nothing first, so a death on a level with no key or on a hidden level shows no points in the verdict whether or not a run is on; then, where a run is on, the points are settled in the routine's order: a death on an ordinary level takes the level's score and its penalty off the total, so much a level of its count held at the most, and puts the bank back into the pickups' word; any other ending counts a fruit where the two words differ, banks the word and adds the score.

The same frame picks the slot the game loads next as the next-level routine does, over the level's slot in its pack and its world's place in the game's order, the level's mode word and the outcome, the bank and the slot kept, the pack's count being its levels as the data holds them:

- An ordinary level with a way out counts the slot on, a full bank clearing both fruit words, keeping the slot after and opening the bonus level of the finished slot's third, and the hidden exit keeping the slot after and opening the hidden level.
- A bonus or a hidden level goes back to the slot kept whatever its outcome, or, where the bank has filled meanwhile, clears both words and opens the bonus level of the kept slot's third.
- The slot after the fifteenth level is the count wherever it comes up, and a slot at the count is the next world's first level.

As the ending's view runs out, or a key cuts it short, the map goes on to that level where it is another of the disc, through the viewer's level funnel with play kept on, the run's five words carried, the ball on the new level's start and the view coming round behind it as entering brings it, and where the pick is the level itself, as after a death, starts the level again.

A total below nothing ends the game as the level is left: the map has no title screen, so the run starts afresh with the five at nothing, which the strip's verdict says in the game's word before the level starts again; the world counted past the ten ends the game too, and the map starts the last level again with the run carried.

The finals, whose entry the routine does not read, and a draft and a Simon room, which no world counts, play the same level again after every ending until their rules land; the HUD shows the total with the level's points while a run is on and the verdict says what the ending did to it and what the key goes on to.

A run begins as the ball is put on a level with the setting on, and the setting turned off while the ball is on a level ends the run at the level's next ending, whose frame settles nothing and picks nothing.

## The Simon rooms

**In the Simon rooms the pad is read as one move at a time: Up and Cross are latched and asked together on the fifth frame of the latch, which runs from the third frame at rest, a held Left or Right turns the ball from the sixth frame at rest, and each move is packed into a halfword and held to a stored sequence.** The input routine takes a case of its own where the game's mode word at `0x800a33b0` is 1 (`0x80036bf4`, `0x80036bf8`), the mode the Copycat pack's ten rooms are played in ([tgi.md](tgi.md)).

The case reads nothing until the view has marked the ball live at 460 (`0x80036e4c`, `0x80036e54`), nor while a verdict stands at `0x800a4cb4`, 1 or 2 (`0x80036e5c` to `0x80036e6c`).

An idle count at `0x800a4c8c` grows by one on every frame the ball is at rest with no turn running and goes back to nothing on any other (`0x80036e74` to `0x80036eac`).

Up held sets a latch at `0x800a33b8` and Cross held one at `0x800a33b6` (`0x80036eb0` to `0x80036ed4`), a count at `0x800a4c90` grows by one on every frame either latch is set (`0x80036ed8` to `0x80036f04`), and on the frame it reaches 5 the jump request at 100 takes Cross's latch and the roll request at 96 Up's, and the count and both latches are cleared (`0x80036f08` to `0x80036f34`).

While the idle count is under 3 the count and the latches are cleared on every frame instead (`0x80036f38` to `0x80036f58`), so the latch runs from the third frame at rest, a tap of Up on that frame or any later one asks the roll on the fifth frame counting its own, 0.08 s, and a Cross held on any of the five joins it as the forward jump.

On the first two frames at rest a flag at `0x800a3458` is set to 1 where the sequence holds no move at the index and to 0 where it does (`0x80036f5c` to `0x80036fac`), which the frame loop hands to a routine not read here while no outcome stands and the game is not paused (`0x800417ac` to `0x800417e4`).

While the idle count is under 6 the three requests are put at nothing (`0x80036fb0` to `0x80036fd0`), and from the sixth frame at rest a held Left asks a turn of 1 and a held Right one of −1, each putting the idle count back to nothing (`0x80036fd4` to `0x80037008`), so a turn is a move of its own, taken as held rather than as pressed, and a held Left turns again on the sixth frame after the turn ends, 0.1 s; a request the latch makes is never dropped by that gate, since its count reaches 5 on the seventh frame at rest at the earliest.

A roll asked without a jump is dropped where the floor ahead is empty and a block stands beside the block under on either side (`0x8003700c` to `0x8003705c`, "The ball's moves" above), and a frame with no request left reads no further (`0x80037060` to `0x80037088`).

The move is packed into a halfword at `0x800a4adc`, 1 for a turn right, 2 for a turn left, 4 for the roll and 8 for the jump, added where more than one is asked (`0x80037098` to `0x80037104`).

The sequence is 1024 halfwords from `0x800d7f84`, indexed by the move's count at 490 of the ball's record (`0x80037108` to `0x8003711c`): where the halfword there is −1 the move is stored, and where the index equals the count of moves at `0x800a4cac` the verdict is 1, the sequence done (`0x80037124` to `0x8003714c`, `0x80037164`); where it holds a move, a move unlike it gives the verdict 2, a wrong move (`0x80037154` to `0x80037164`); and the index counts on by one either way (`0x80037168` to `0x80037174`).

The verdict becomes the ending, 1 or −8 with a wait of 25, as the ball rests with no turn running ("The level's clock and its end" above), and the sequence done passes the turn at `0x800a33ac` to the other player as it does (`0x80036364`, `0x8003637c` to `0x80036394`).

**A room opens with the index at nothing and two more moves to make than the round before; a failed round gives the other player a point and starts the match afresh with the other player first, in the next room after every second match.** The level's start has a branch for the mode (`0x80035d1c` to `0x80035d38`): it writes 10 into the countdown at 370 (`0x80035d44`, `0x80035d4c`), which the 20 the start writes after stands over (`0x80035e04`, `0x80035e74`), puts the flag, the verdict, the latch's count, the idle count and the index at nothing (`0x80035d58` to `0x80035d6c`), and counts a round at `0x800a4cb0` on by one and the count of moves at `0x800a4cac` by 2 (`0x80035d40`, `0x80035d50`, `0x80035d70` to `0x80035d7c`).

A reset at `0x80035cd4` fills the sequence's 1024 halfwords with −1 from the last down (`0x80035cd4` to `0x80035cf0`) and puts the count of moves at 1, the round at nothing, the flag at 1 and the turn at `0x800a33ac` to the player it is given (`0x80035cf4` to `0x80035d0c`).

The game's loop runs it after the start, in the mode alone, on every load that follows a level whose outcome was not above nothing, the outcome being what the level loop returns and the game's loop keeps at `0x800a5704` (`0x80041ee0`, `0x80040698`, `0x800405cc` to `0x80040608`), with a word at `0x800a38a0`, which the menu that starts the mode sets to 1 with the mode word (`0x800496a0` to `0x800496b8`), flipped first and given as the player (`0x800405f4` to `0x80040604`).

So the first round of a match asks two moves, at the index 0 and then at 1, the count; a round done reloads the room, the ending's branch having passed the turn, with the count up by 2, so the other player copies the moves made and adds two, 2k moves in the k-th round and the sequence full in the 512th; and a failed round, any outcome below nothing, ends the match.

On the ending's first pass the loop then gives a point to the other player than the turn's, the turn plus one taken round the two, in a word a player at `0x800a56e8` (`0x80040a98`, `0x80041b18`, `0x80041b3c` to `0x80041b8c`), the two words the menu cleared as the mode began (`0x80049654`, `0x80049674` to `0x80049688`); the next-level routine's branch for the mode (`0x8004261c` to `0x80042648`), where the word at `0x800a38a0` is 1 (`0x80042654`, `0x8004265c`), counts the slot at `0x800a3408`, the room's index in the Copycat pack, and the world word at `0x800a340c` on by one together, the world back to the first where the furthest level reached at `0x800a3404`, counted in worlds of fifteen, falls short of it, and has the files loaded afresh through the word at `0x800a3414` (`0x80042660` to `0x800426ac`, and [tgi.md](tgi.md) for the rooms' round), and puts both back to nothing where the world word is 10 or more (`0x800426b0` to `0x800426c8`).

The load that follows flips the word and resets the match. So each room is played twice over, the first match opened by the first player and the second by the second, and the rooms step on after the second.

**The end screen names the winner once the slot has come round to the first room and a player has more than 5 points, and menu code ends the game on the same test.** The screen's loader, in the mode and with the slot at nothing (`0x800157ec` to `0x80015808`), reads the two points words (`0x80015814`, `0x8001582c`), and where either is 6 or more and the outcome is below nothing (`0x8001581c`, `0x80015834`, `0x80015844`, `0x8001584c`) picks "Player 1 Won!", "Player 2 Won!" or "Equal Time!" by the two (`0x80015858` to `0x80015878`, and the words above) in place of the failure's own word; the slot is at nothing in the first room and again once the tenth room's second match has stepped it past the pack's count and round to the first ([tgi.md](tgi.md)), the routines of the ending's first pass running before the screen is drawn (`0x80041b98`, `0x80041bf0`).

Menu code that reads a press of Cross (`0x8004ad2c` to `0x8004ad48`) asks the same of the slot and the points (`0x8004ad50` to `0x8004ad8c`), and where they pass puts the total at `0x800a5e84` below nothing and clears the turn and the world word among its words (`0x8004ad94` to `0x8004ae28`), which ends the game as the paragraphs above have it; otherwise the loop goes on to the room the branch chose.

The table ships the Simon rooms' words as `play`'s `simon`: the latch's frames, the idle count's two gates, the four bits of a move, the sequence's length and the halfword that holds no move, the count of moves the reset leaves, the two verdicts, the moves a round adds, the points a game is won past, the players the turn and the point go round, the word the menu sets for the loop to flip and the total the menu code puts to end the game.

The viewer sets the game's mode word by the level's pack, so in a room the clock stands and no block is marked, as in the game's room, and an ending's view swings as the arcade's ("The level's clock and its end" above).

The viewer takes the pad in a room as the game's case takes it, one move at a time against the stored sequence:

- Nothing is read while a verdict stands.
- The idle count grows on a frame at rest with no turn running and goes back to nothing on any other.
- Up and Cross set the two latches the bouncy pill shares, whose count grows while either stands and, as it reaches the table's latch, asks the jump of Cross's latch and the roll of Up's latch, the count and both latches cleared, which they are on every frame instead while the idle count is under the first gate.
- The three requests are nothing while the idle count is under the second gate, and from it a held Left or Right asks its turn and puts the idle count back to nothing, in place of the arcade's presses.
- The roll asked without a jump off an edge beside a neighbour is refused on every level, as the game's case refuses it in this mode alone, though the arcade's roll comes to the same rest by its own gate ("The ball's moves" above).
- A move left is packed into the table's bits and held to the sequence at the index, stored where the halfword there is the empty one, with the verdict done where the index is the count of moves, and compared where it holds a move, with the verdict wrong where the two differ, the index counting on either way.

The verdict becomes the ending, the exit's code for the sequence done and the rooms' own code for a wrong move, with the rooms' wait, on the first frame the ball rests with no turn running, before the wait is counted, and is cleared as the game clears it, so the pad is dead from that frame until the frame the wait runs out, which reads it as any wait's last frame does, and a move made then is held to the sequence as in the game.

The keys, which keep a tap made over frames that read no pad for the first frame that does, drop it while an ending stands, so that frame reads only the keys held on it, as the game reads them.

The sequence and the count of moves outlive a room's reloads as they do in the game, in a match the run carries with the round and the turn:

- A room played from the map's entry opens on the match as the reset leaves it, the sequence filled with the empty halfword and the count of moves as the reset puts it, so the first round asks two moves, at the index 0 and then at 1.
- The room's start puts the index, the verdict, the idle count and the latch's count at nothing and, where the match comes from a round done, counts the round on by one and the count of moves by the table's grow, so the room started again asks the moves made and two more.
- A room that follows an ending not above nothing, a wrong move or a death, opens on the match reset, as the game's loop resets it after the start.

A done round reads "Well Done!" on the strip and a wrong move the game's own word, each saying whether the round is done or lost, and the HUD counts the round and the moves it asks.

Without a run, which is the Play switch's default, a room plays alone: either ending starts the same room again, and no point goes to anyone. With the switch on the run holds the two players' game as the menu that starts the mode leaves it, the points at nothing and the word the loop flips at the menu's, and plays the match as the game does.

The sequence done passes the turn to the other player as the verdict becomes the ending, so the room started again is the other player's round.

A failed round, any outcome below nothing, gives the other player than the turn's a point, and the room that follows opens on the match reset, the word flipped first and given as the turn: the same room again where the word was 0, and where it was 1 the next room of the pack, the first again past the tenth, as the next-level routine's branch has it, so each room is played twice over, the first match opened by the first player and the second by the second.

Once the branch has come round to the first room with a player's points past the table's and the outcome below nothing, the strip names the winner, or the draw, in the end screen's word in place of the failure's own, and the game is over, the total put below nothing as the menu code puts it, so the room that follows opens a fresh game, the points at nothing and the first player opening, which is the map's way where the game goes back to its menu.

The HUD says whose turn it is and the two players' points while a run is on.

What the game's HUD shows of a round and the flag the frame loop hands to a routine not read here are not drawn, and the rooms' world files, which the furthest level reached picks, are not followed: a room is shown in its own world's look whatever has been reached.

## The moving spikes

Type 11 keeps a state in the kind word of the slot after its own, a countdown in `f15` (the last pad of its slot) and the frame it shows in `f8`, and the routine at `0x8002bbec` steps them, dispatching on the state through `0x8001005c`:

| state | what it is | lasts | the frame shown |
| --- | --- | --- | --- |
| 0 | down | 63 | 0 |
| 1 | rising | 6 | 0, 0, 6, 12, 19, 25 then 31; `f4` becomes 1, deadly, and sound 105 plays as it starts |
| 2 | rattling | 15 | 31 on even counts, and 2, 6, 11, 15, 20, 25, 29 on odd ones between them |
| 3 | held up | 14 | 31 |
| 4 | retracting | 45 | 31 falling to 0 in steps of 32/44; `f4` becomes 2, harmless, with 11 frames left; sound 106 as it starts |

**The cycle is 143 frames, 2.4 s, and `f3` is a phase of 35 frames a step.** The loader at `0x8002a078` sets the first state from `f3 × 35`: under 63 it starts down with 63 − 35·f3 to go, under 96 held up with 96 − 70 to go, under 140 retracting with 140 − 105 to go, so on the first cycle a phase of 2 holds the spikes up for 26 frames instead of 14 and a phase of 3 starts them three quarters up; from the second cycle on all four run the same 143 frames, 35, 72 and 107 frames apart.

`f3` is set to 0 at load, so every one draws the same model, and the 32 frames of the mesh go from flat to 388 units tall in equal steps.

Simulating the routine from each phase is what gives the frame lists and the 143; `python3 tools/mips.py --at 0x8002bbec --count 184` shows it.

**The spikes are deadly for 68 frames of the 143, from two frames before they leave the ground, and the first cycle's deadly frames are the steady cycle's for every phase.** The routine writes `f4` as the states change, 1 as the rising state starts (`0x8002bc74`, `0x8002bc84`) and 2 as the retraction's count reaches 11 (`0x8002be5c`, `0x8002be64`), and the loader writes it with the first state, over the 1 every slot holds on the disc: 2 for a phase that starts down and 1 for one that starts held up or retracting (`0x8002a12c`, `0x8002a130`, `0x8002a098`, `0x8002a178`).

So `f4` is 1 from the frame the down count runs out, two frames before the first frame off the ground, through the rising, the rattling and the held states to the retraction's 8 with 11 frames of it left, 68 frames, and 2 for the 75 after, a phase of 0 deadly from the 63rd frame of the cycle, 1 from the 28th, 2 to the 58th and from the 134th and 3 to the 23rd and from the 99th.

Since the loader lays each phase's first state so that its first retraction falls where the steady cycle's does, a level opens with phases 0 and 1 harmless for 62 and 27 frames and phases 2 and 3 deadly for 58 and 23, the steady cycle's own frames, though a phase of 2 shows the spikes held up through frames on which the steady cycle rattles them.

Each frame the ball's routine, the hazards in it, runs before the moving blocks step, and the draw after both (`0x80040ffc`, `0x8004101c`, `0x8002a48c`, `0x8002a614`), so the hazards read the `f4` the last frame's step left while the frame drawn shows that step's own.

The table ships the frame shown as type 11's `cycle` and whether `f4` holds the deadly value on each frame as its `deadly`, a list per phase beside it.

The viewer kills the ball on the moving spikes by that list, read where the game's hazards read it: with the ball on the ground on them, the hazards' slot of the run's frame n, counted from 0 as the level opens, asks whether `f4` held the deadly value at the list's entry n − 1, counted from 0 as well, what the last frame's step left, so a phase that opens deadly kills on the first frame the start's wait lets a death through and a phase that opens down kills on the frame after the list's first deadly entry, and the countdown is the standing one unless the ball has just landed on them.

The map's picture of the cycle keeps the game's frame: the frame drawn after the run's frame n shows the list's entry n, as the game's frame n does, so the map's spikes are flat on the frame they kill, as the game's are, and leave the ground on the frame after.

## The vanishing block

Kind 7 keeps its state in the first slot's `f3` and a countdown in `f4`, and the routine at `0x8002b6ec` steps them through the six states of `0x80010044`; the first slot's `f2` on the disc, 0 to 3, is the phase, and the loader at `0x80028b14` turns it into a state:

| state | what it is | lasts | what shows |
| --- | --- | --- | --- |
| 0 | absent | 91 | nothing; the lattice cell is −1 |
| 1 | fading in | 9 | the cell is set and the faces brighten from black to white |
| 2 | settling | 5 | white, then 211, 166, 121 and 76, under neutral grey |
| 3 | solid | 91 | neutral, `0x808080` |
| 4 | dimming | 9 | 32, then from 57 up to 232 by 25 a frame, with the faces' translucent flag on |
| 5 | flashing out | 19 | white fading to black; then the cell is −1 again |

**The cycle is 224 frames, 3.7 s, and `f2` is a phase of 56 frames a step**, a quarter exactly: a phase under 2 starts absent with 91 − 56·f2 to go and the others start solid with 196 − 56·f2 to go. The block is in the lattice, and can be stood on, from the moment it starts fading in to the moment it finishes flashing out, 133 frames, and out of it for 91.

What the disc holds in the record's `type` word is overwritten at load with the lattice's own value for the cell, which is what the routine writes back when the block returns.

The map runs the cycle from the record's phase, solid and lit as the game lights it while the block is there and faint while it is gone, and the ball's reads see the cycle as the frame drawn before them showed it, as the game's read of the cells about the ball sees the lattice the last frame's step left, so the block is there for it on the frame after each it is drawn there ("The blocks under the ball" above).

## The invisible block

Kind 3 is hidden until the ball comes near it, and the routine at `0x80051318` decides that every frame. It reads a struct at `0x800a5a58`: the ball's position, its centre 100 off its face ("The ball's moves" above), with a platform's travel added, which the ball's routine writes there every frame (`0x80036914`), a near and a far distance, and a flag of its own (`0x8005134c`).

The sunglasses have a second flag, at `0x800a5a98`, which `0x8002bec8` and `0x8002bf50` turn on as they are taken, and off and on as they end (the pickup that scores 500 sets a word the hazards routine counts down, "What the ball takes" above), and the light tests it first (`0x80051370`, `0x80051390`): while it stands every invisible face is drawn and nothing else happens. Otherwise every invisible face is first hidden, or shown where the struct's own flag is set (`0x800513b8`), and then each invisible block near the ball is lit corner by corner: full within the near distance, falling in a straight line to nothing at the far one, and where that flag is set the other way round (`0x80051684`), nothing within the near distance and full from the far one out. A face with any corner lit is drawn, shaded between its corners' brightnesses, and added to what is behind it.

**The blocks it lights are those in a box of cells about the ball**, on each axis from the cell the far distance takes the ball to one way to the cell it takes it to the other, a point being in the cell it falls in, no lower than 0 and no higher than 33 (`0x80051418` onward), and of those only the blocks of kind 3 (`0x80051558`).

Of each face it takes the four vertices the face routines laid the texture on, in their order (`0x80051594`), the texture's top left, top right, bottom left and bottom right, and measures each from the ball: the geometry coprocessor squares the three differences (`0x800515d0`), and the root comes from a table at `0x80073ab0`, a row for each count of leading zeros in the sum (`0x800515f0`), which draws a straight line between the roots of the powers of two either side, each rounded, so it falls short of the true root between them, by up to 7 units at 418 and 26 at 1695.

A corner within the near distance is 128. Past it the corner is 128 less how far past it the corner is times 128 over the stretch between the two distances, in fixed point (2^30 over the stretch, the product shifted down 23), and no lower than nothing (`0x80051644` to `0x80051680`); where the flag is set it is 128 less that (`0x8005168c`). The four brightnesses are the face's corner colours (`0x800516ac`).

**A face's first byte says how it is drawn**, which the transform at `0x8005662c` reads every frame: bit 0 draws it, bit 1 blends it with what is behind, bit 2 drops it where it faces away, and bit 4 shades it between the four corner colours at bytes 16 to 28 of the face instead of drawing it flat in the colour at 12 (`0x800568d0`). The light writes 0 into every invisible face, or 7 where the flag is set or the sunglasses last, drawn flat; then 22 into each face of a block in the box, and 23 where any of its corners is lit (`0x80051698`), drawn and shaded between them.

The colour at 12 is the one the animator pulses, and the animator writes the face's frame of shimmer into its top byte whatever the light does, so a lit face runs through its seven frames at the steady brightness of its corners, without the pulse.

On the seven levels below, a face outside the box is drawn as it is through the sunglasses, and one in the box is steady at 128 past the far distance and fades as the ball comes near.

The loader sets the struct at `0x80027bf8`: 350 and 512 and no flag, so a block shows only within about a block of the ball; and on a level whose settings record, kind 9, carries a first field of 1 (`0x80027c78`), 1280 and 1792 with the flag, so its invisible blocks show everywhere, fade as the ball comes within three and a half blocks and are gone within two and a half. Seven levels do: LEVEL 106 to 108, 110 and 111, SIMON 9 and HIDDEN 8.

The table ships both pairs of distances, the settings' kind and the value that turns the light round, full and the shift of its fixed point, and the root's rows, as kind 3's `light`.

With the sunglasses the faces are drawn flat, through the colour the animator at `0x8004f3b8` pulses from 48 to 136 of 128 over 90 frames while they cycle through their seven frames of shimmer over 144, which is the look the map draws them in, so that they can be seen at all.

The viewer lights them as the game does, from the ball at the level's start and from the block under the pointer and the one selected, each as the ball standing on that block's face that looks the way the lit face does, the stand-ins the boost button takes, measured from where the ball touches the face rather than from its centre ("Not settled" below).

A face of a block in a stand-in's box is shaded between its corners' brightnesses, the nearest stand-in's at each corner, and the sunglasses' look fills in as much as each corner falls short of full, so a face in full light is exactly the game's and one out of reach keeps that look, with nothing darker between.

On the seven levels that look is the game's own for a face outside the box, and a face in it is drawn in the shading alone, as the game draws it, so it fades out as a stand-in comes near.

The corners' shading is interpolated evenly across the face, which is what the game's quartered near faces come to.

The light is one of the effects, which stand where the level starts while the Motion switch holds it, so there nothing is lit.

While play's flag stands, the sunglasses' word or an on spell of their blink, nothing is lit and every face keeps that look, as the game draws them all flat through the flag, so a face the ball's light reached shows the change and one out of reach does not.

## The devices' light

**A teleporter, a switch or an exit that is on casts a coloured light on the faces round it, on for 19 frames and off for 19.**

The draw of the things on a block (`0x8002d2ac`, which the walk calls for each of them at `0x80039e5c`) sends types 5, 7 and 9 through its table at `0x80010074` to a case each, and the hidden exit, 26, to none. While the thing's `f4` is 1 the case counts `f15`, the last pad of its slot, down, and when it reaches nothing sets it back to 19 and turns its light over: it makes a light from the thing's cell and face (`0x8002e3d8`) and keeps its handle in the low byte of the kind word of the slot after, with 256 over it to say it holds one, or lets the one it holds go (`0x8002d994`), leaving 255. While it holds one it gives it its colour every frame (`0x8002f2b4`), and while `f4` is not 1 it lets it go and counts nothing.

The loader starts every one of the three on a plain block, which all 441 are, at 19 and holding none (`0x80029744`), and the faces take their light (`0x80051020`) before the walk that turns it over (`0x80036958`, both in the frame's draw at `0x8002a3c0`), so a thing on from the start is dark for the level's first 19 frames and lit for the next 19, lit while the frame over 19, rounded down, is odd. One turned off loses its light at once and stops counting, and once on again counts on from where it stopped, so it comes back on a phase of its own.

**A light is a list of faces with a level at each corner.** The list at `0x800df184` holds 32 lights of eight words: a colour, −1 while the light is free, then up to seven faces, each a pointer with a byte of four two-bit levels over it, 0, 1 or 2 (`0x8002f16c`).

`0x8002e3d8` puts the thing's own face on it at 2 all round, then for each of the face's four edges the first of three faces that is there: the face of the block diagonally out over the edge that looks back across it, a wall rising from the edge; else the face of the block beside the edge that looks the way the thing's does; else the face of the thing's own block down from the edge. The first two take 2 at their two corners on the edge and nothing at the other two, and the third 1 at its two on the edge.

A face is there where the lattice holds a block that has the face, as the loader built it, so a face built unseen behind a crumbling block counts and one the loader built nothing for does not.

The levels are given in the order of the face's corners at its texture's first turn, and `0x8002f16c` turns them by the face's own turn, its byte at 6, so they stay with the block. `tools/kula_motion.py` runs `0x8002e3d8` for each face with that call answered by hand to read the faces and levels it tries, in order.

**Each frame the faces of a light are shaded between their corners with the light added.**

`0x800511c0`, before the invisible block's light, marks every face of every light as shaded between its corners and gives each corner the face's flat colour; `0x80051020`, after it, adds to each corner the light's colour for level 2, seven sixteenths of it for level 1, each channel rounded down (the coprocessor multiplies the channels, sixteen times over, by 1792 of 4096, and the result comes back down by sixteen), and nothing for 0, the lowest bit of each channel cleared, and a channel that passes 255 stands at 254; and `0x80051254`, once the faces are drawn, marks them flat again.

So the thing's face is lit all over, and the light fades across the next face on each side to nothing at its far edge.

**The colour is by world and circuit.** A teleporter and a switch take theirs from 40 words at `0x80073048`, four for each world in pack order, by `f3`, the circuit, where 128 is a channel's own brightness: yellow is 25 of red and green in six worlds, green 25 of green and red 25 of red in most, and a few take theirs brighter, up to 64; blue is 25 of blue in Atlantis, 32 in Arctic, 44 in Haze, 89 in Field, 128 in Hills, Inca, Cowboy and Hell, 192 in Mars and 204 in Hiro. An exit takes one word a world from `0x800a32e0`, the same green, 16, 64 and 16, in all ten.

So in most worlds a blue device lights the faces round it far more than the others do.

The table ships the count, level 1's share of the colour, what a light takes for each face, each device's colours by world, by its type, and what a lit device's model is drawn times ([ggi.md](ggi.md)), as `glow`.

The viewer casts the light of every teleporter and switch that is on, and of an exit opened from the panel, as the game does, turned over by the same count, which runs only while the device is on, so one switched off and on again from its panel keeps its own phase.

What each light takes is found once for a level, against the lattice as the level opens, since nothing beside a device breaks, vanishes or moves; a beam's cells hold no block, as a dark beam's do in the game.

At each corner the lights on a face are summed and added to the colour the face is drawn through, a channel standing at 254 once it passes that, and the face's texture, times what is added over 128, is added to what the face shows, shaded between its corners as the invisible block's light is.

The map leaves the light off an invisible face, which its own light draws.

An exit is shut as the level loads it and casts no light until the panel opens the exits, and is then dark for 19 frames, as one the last key opens is; a device hidden from the legend casts none while it is hidden.

The light is one of the effects, so while the Motion switch holds the level it stands as at the level's first frame, dark.

## The gem's glints

**A gem's facets flash white and fade back, a few at a time, and every gem of a cut flashes the same ones.** The parser of the .GGI builds nine records of 348 bytes at `0x800de034` through `0x80023258`, one for each of the three levels of detail of model 36, the gem, and each of its three cuts, and for no other model (`0x80022f2c` to `0x80022fa8`): a record holds where the model's colours are and how many polygons it has, then a chance of 3, a rise of 128 in each channel, a top of 254, a fall of 16, and sixteen slots of 20 bytes, one for each glint.

At the end of the frame's draw (`0x8002a6b8`) `0x80050d04` runs over the nine, a level of detail at a time and its three cuts in turn (`0x8002aa38`), before the models the walk queued are drawn (`0x8002aa68`); what it changes is the model's own colours, so every gem of a cut drawn at that level of detail shows it.

**A glint starts a third of the time.** Each run first steps a generator of its own, a word at `0x80073a54` that the executable loads as 1 and nothing else reads or writes, by the dice's rule, times 1103515245 plus 12345 (`0x80050d5c`), so the generator is stepped nine times a frame.

Where the state's high half times 3 over 65536 comes to 0 and a slot is free, the run takes the polygon its low half times the count over 65536 names, unless that polygon is glinting already (`0x80050d70` to `0x80050dfc`), and saves its colour: the first corner's alone for a flat polygon, which is all the renderer draws one in (`0x80053604`), or each corner's for a Gouraud one (`0x80050e14`).

Then each glint of the record takes a step (`0x80050e54` onward): every corner rises by 128 in each channel to no more than 254 until all are at 254, and from the next run falls by 16 in each channel to no less than its own (`0x80050f40` onward), and the slot is free in the run that has its corners all back.

**A facet is white for one frame and fades over sixteen.** Every polygon of the nine models is flat and translucent and has a channel at 0, so every glint lasts 18 frames: the first lifts each channel by 128 as far as 254, which a channel at 126 or more reaches at once, the second has the facet white, and from the third it greys, each channel stopping at the facet's own as the grey comes down to it, the strongest first, until the 18th has it back as it was. So a cut at full detail has about five of its 32 facets glinting at a time.

The draw picks a level of detail by the thing's depth (`0x8002d87c` to `0x8002d8ac`) and each has its record, so a near gem and a far one of a cut glint on facets of their own.

Nothing sets the generator back, so it runs on from level to level from the first played after the game is switched on, and which facets glint on a level depends on what was played before it; how often and how brightly does not.

The table ships the chance, the rise, the top and the fall, the slots a record holds, its rows and cuts of records and the generator as the gem's `glint`.

The viewer glints every gem as the game glints one at full detail, the detail it draws them all at: it runs the routine over the three cuts from the generator's first value at the level's first frame, stepping the generator nine times a frame so that the three runs it keeps draw what the game's would, and draws a glinting facet in the colour the routine has given it, translucent as the facet is.

The glint is one of the effects, so while the Motion switch holds the level it stands as at the level's first frame, where a facet of the blue cut and one of the red have just started theirs.

## The crumbling block

Kind 6's first slot holds 512 times its cell in `f2` to `f4` on the disc and the game does nothing with that: the loader at `0x80028a98` writes 512 into `f2`, and once the ball has broken the block (its `type` word goes from 1 to 2, then 3) the routine at `0x8002b3f4` takes 26 off `f2` a frame and drops the block from the lattice when it goes negative, twenty frames later, a third of a second, spawning debris from each face on the way.

The viewer breaks the block by the same words: the rules keep each crumbling block's type word and size, the hazards write the word under the ball and the frame's last part breaks, shrinks and empties the block as the routine does ("The blocks under the ball" above), and the map draws a block that is gone no longer, with a burst of dust where it stood, while the debris and the shrinking faces of a breaking block are not drawn.

## The moving platform

Kind 5's record is read three ways at once. Its `type` is the direction it is travelling, in the game's numbering of the six; `f4` to `f6` and `f7` to `f9` are the two ends of the run; the second slot is `[which end, blocks long, speed, dwell, a number, −1]`, the length 2 or 3 and the speed 30 on every one of the 37; and the extras hold its position, 512 times its cell, with three words of 256 after.

The routine at `0x80032af4` takes one off the dwell where it is not nothing, plays sound 107 where the dwell then stands at 1, and where it stands at nothing moves the position by the speed along the direction (`0x80032b50` to `0x80032be8`), dispatching on the direction through `0x80010158`; on reaching or passing the far end it reverses the direction (1 and 4, 2 and 3, 0 and 5 swap) and, after that frame's move, flips the end word and sets the dwell to 48 (`0x80032e48` to `0x80032e88`), so the platform stands still for the 47 frames after the one it arrives on, 0.78 s, plays sound 107 on the last of them and moves on the 48th. **At load the dwell is zeroed and the speed becomes 30 × 50 / 60 = 25**, 1500 units a second, a block in a third of a second (`0x8003278c`).

The record's faces are drawn at that position, one block after another the positive way along `f2`'s axis, by `0x8002b26c`, and the map lays the blocks so with the Motion switch on or off.

The viewer runs the platform under the ball by the walker the map draws it by: the ball rides it from a landing on its body or against its end ("The blocks under the ball" above), is carried as the position words move, reverses with it at the run's ends and rides on through the dwell, and leaves it by a jump or a hop alone.

## The laser

Kind 8 is built at load by `0x800280d0` and drawn every frame by `0x80051754`, which is written by hand against the geometry coprocessor. The builder lays a beam from the first cell its record names to the second, one stretch for each empty cell between, and all 123 name the lower end first; it never reads the record's `type`, and it gives both ends the same plate ([tgi.md](tgi.md)), so neither end is the emitter.

A stretch reaches 256 units either way of its cell's centre, face to face, and carries four lines 90 units off the axis on both axes across it. Each line is two flat quads 14 units wide, crossed along it, and a one-pixel line down their middle.

The renderer files a cell's stretches by the depth of the cell's centre and draws them in the blend that adds them to what is behind, the draw mode `0xe1000020`, so a block in front of a beam hides it; a dark beam, `f3` 0, it skips.

**A line's colour is its circuit's channels times a level it steps through on its own.** The builder makes a table per circuit (`0x80028128`) out of 240 levels at `0x8009a040`, each from 0 to 31, shifted into red and green for circuit 0, blue for 1, green for 2 and red for 3, so a full level is 248 in each channel it lights.

Each of a beam's four lines starts at a random place in the table (`0x800284e0`) and steps one entry a frame, so the table runs through in 4 s and the four lines shimmer out of step: it holds 31 on most frames, with a few fades, dips as low as 4 and runs of 31 and 12 on alternate frames.

The map hashes each line's start from its beam's first cell, and draws nothing for a dark beam, as the game does, but a broken line among the outlines.

**The lattice follows the switch.** Every frame, after drawing, the renderer writes −1 into every cell a dark beam crosses (`0x80051c0c`) and then −2 into every cell a lit one crosses (`0x80051c64`), so a dark beam's cells are open to the ball and to a captivator's probe alike, and where two beams cross, as on LEVEL 96, 98, 105 and 124 and FINAL 10, a lit one fills the cell. A switch turns the beam over in its record ([level-format.md](level-format.md)), so the writes follow it from the next frame on.

## The captivators

Types 50, 51, 52, 53 and 56 are lifted out of their slots at load into 180-byte entries at `0x800ba3dc` (`0x8003b5dc`), each standing **456 units from its block's centre along the face normal**, 200 off the face, with the normal, a home position, a heading from `f2` and three angles of its own. `0x8003ba88` moves them each frame and `0x8003d680` turns them, and the `f3` of a corkscrew alone survives as a phase.

The table ships the 456, which the lift multiplies the normal by (`0x8003b720` to `0x8003b730`), as `standoff`, and the viewer lays each entry's position there, the point a walker moves and the captivators' hit test measures to ("What harms the ball" above).

**Each is drawn with its model's origin where its entry is**: the draw copies the entry's position and turns it into the view as it is (`0x8003d81c`, `0x8003ed3c`, `0x8003f3e8`, `0x8003dea0`), so the stars, the wheel and the wandering ball all have their middles 200 off the face whatever their size, which leaves the small wandering ball clear of the floor by more than half its height; the corkscrew alone is drawn 150 nearer its face than its entry (`0x8003e5d8`), 50 off, and bounces from there.

The table ships that height with each of the five as its `entry`, and the viewer stands them there rather than on their lowest points.

| type | moves | turns |
| --- | --- | --- |
| 50 slow star | 13 units a frame along its heading, a block in 0.66 s, and decides what to do next each time it crosses the middle of a cell (`0x8003bb98`) | tumbles about its three axes by 11, −100 and 43, turns in 6.2, 0.68 and 1.6 s |
| 52 fast star | sways about its home along its heading by 600·sin θ, 1.17 blocks either way, with θ stepping 53, a swing and back in 1.29 s, starting at its home | tumbles by 64 and 32, turns in 1.07 and 2.1 s |
| 51 wheel | rolls 12 units a frame, a block in 0.71 s, and decides at cell middles; a turn steps its nose 13 a frame for 76 frames, 988 of a quarter's 1024, and the 77th snaps it square (`0x8003cdc8`), and an about-turn steps 26 and snaps the last 72 | rolls about its axle by −53, a turn in 1.29 s, while moving; the axle lies across the way its facing gives, which play on OBJ LEVEL fixed and which the viewer draws as a quarter turn on the mesh |
| 53 wandering ball | shakes for 76 frames, 1.27 s, lurching along the way it will go by 65·(1 − cos θ), up to 130 units, with θ stepping n²/8 on the nth frame so the shaking quickens; then dashes 53 units a frame, a block in ten, settles on the grid and draws a new way from four (`0x8003c730`) | tumbles like the slow star |
| 56 corkscrew | rises 400·sin θ along the normal, 0.78 blocks, with θ stepping 23 and wrapping at 2048, a half sine, so it lands and leaves at speed: a bounce every 89 frames, 1.48 s, with sound 24 at each landing, and the rise is written into the entry's position words from its home (`0x8003c3f4`, `0x8003c49c`, `0x8003c534`), so the hit test catches from where it bounces ("What harms the ball" above) | spins about the normal by −400·cos θ a frame, the step taken from its angle (`0x8003e4bc`), 2.8 turns up and 2.8 back |

The corkscrew's `f3` sets θ at load to 1024, 682, 341 or 0 for 0 to 3, a sixth of a bounce a step, with 0 the highest; the other four start at their homes with everything zero, so their tumbling is in step across a level.

**Where a star or the wheel goes is decided against the lattice, with no dice.** An entry keeps a heading and a side, the two tangents of its face turned by its `facing` (`0x8003f98c`, which lays the face's normal and the same two tangents the way routine at `0x80038008` lays for an arrow, and turns the two for a facing of 2, 3 or 4 alone: a facing of 1 heads along the first tangent, +y on the top, each further value a quarter turn on, the side following, and any value it does not turn for heads as 1 does, the 0 that 28 of the 46 wandering balls carry among them), and asks the lattice about the block beside it on either side and the block ahead through `0x8003d278`, `0x8003d3f4` and `0x8003cf6c`.

A probe looks 400 units back toward the block, into its cell, and one block along the side or the heading, and a block counts if `0x8003fc00` says it can be stood over, which is any lattice style below 5 (`0x8003fc10`), a bare plain, fire, ice, invisible or acid block, a crumbling block, or a record whose slot for that face is empty, holds a captivator, the start, fire, ice or type 4, and never a moving platform, a coin, a key or a device; going ahead also needs the cell above the block ahead empty, and a lit beam's cells count as filled, a dark beam's and a vanishing block's while it is gone as empty.

A vanishing block's top is asked through the record's type word, over which the loader writes the block's own lattice value, `5 + i` for record `i` (`0x80028bc4`, `0x80028bcc`), so to a walker on the tops a vanishing block counts only where that value is 30 or 50 or more (`0x8003fc5c` to `0x8003fc98`).

Its other faces are asked through their own slots' type words by the same read (`0x8003fc48` to `0x8003fc5c`), which the block's loader and its cycle leave as the file holds them, writing the type word, `f3` and `f4` of the first slot alone (`0x80028bcc`, `0x80028c58`, `0x80028cc0`, `0x8002b844`, `0x8002bbd4`), so a walker on any face of a vanishing block but its top passes or stops by the file's type there, as it does on the face of a plain block.

A beam's two ends count as the plain style, since the loader writes style 0 over both (`0x80035b2c`, `0x80035bb8`, `0x80035c38`, `0x80035ca8`, and [level-format.md](level-format.md)).

Turning is `0x8003d378`, `0x8003d4f4` and `0x8003d22c`: toward the side, toward the other side, or about, and a turn swaps the heading and the side and touches nothing else; what is drawn is RotMatrix of the entry's own three angles (`0x8003d7c8`), so a star tumbles on unbroken through a turn, and the wheel's nose swings round only because its turn steps one of its angles.

The slow star decides each time it crosses the middle of a cell along its heading, which `0x8003fca4` measures: if there is a block beside it on the side it turns onto it, else if there is one on the other side it turns that way, else if it cannot go on it turns about; and it walks 13 a frame.

The wheel rolls while it can go on, and only when it cannot, at the next middle of a cell, does it choose, the other side first, then the side, then about; it stands for 77 frames while its nose swings a quarter or half round, 13 or 26 a frame and square on the last, and rolls on at 12 a frame with its roll at −53 only while moving; the viewer swings the nose evenly all the way round instead, without the game's click of 3° or 6° at the end.

The wandering ball settles on the grid after each block, draws one of the four ways until it finds one open, 0 the side, 1 the other side, 2 on and 3 back (`0x8003c730`), then shakes toward it for 76 frames and dashes; the viewer draws its ways from the game's dice, as below, and steps every walker of a level together, in the game's order, a frame at a time.

**The wandering ball's dice are seeded once, as its level starts.** They are the game's one random routine (`0x80047418`): a word of state multiplied by 1103515245 and added 12345 at each draw, a draw of n being n times the state's low half over 65536. The play loop runs a level through one routine (`0x80040690` calls `0x80040718`), which seeds that state with 1 before anything else (`0x80040748` calls `0x80025054`, whose first act is to call `0x8004740c` with 1) and then loops a frame at a time from `0x80040aa0` to `0x80041c34`, so a restart seeds it afresh and nothing else does.

In the loop the balls draw in the order the loader lifted them, record by record and face by face (`0x8003b5dc`), each until it finds a way open, and the sequence runs on from one decision to the next. Three other things draw from it, none while the ball stands still: the screen's shake (`0x80022814`), only while the screen shakes; the effects ("The effects" below), only on a frame whose row asks a draw, which three of the seven tables do once each, and one is started by the ball's contacts (`0x800118c4`, called from `0x80038548` onward); and the pause and game-over menus.

So a level watched without playing walks its balls by their own draws alone, 1, 2, 3, 2, 3, 1, 2, 2, 2, 3, 0 and on from the start, the same on every play, and play on OBJ LEVEL bore that out move for move, 58 moves of the top ball from the start until the time ran out; a pickup collected, a shake or a pause on the way can shift the sequence for everything after, as far as the three routines' gates show.

The table ships the seed, the multiplier and the addend as `dice`, from which the viewer draws the wandering balls' ways and a burst's angles where a row asks a draw.

## The effects

**A pickup taken starts a burst of two sprites at its place, lit onto the faces about it, and a key, a fruit, the hourglass and a teleport start one on the HUD: an effect is an entry in a list of sixteen, played from a table of its kind a frame at a time.** `0x800118c4` starts one from a kind, a position and a light.

It takes the kind's table from twelve pointers at `0x800a42f0` (`0x800118c4`, `0x800118d0`), which startup clears and fills for kinds 0 to 10 from seven tables in the executable's data (`0x800114fc` to `0x80011520`, `0x80011524` to `0x80011594`), the twelfth pointer left empty, and returns for a kind without one (`0x800118d8`) or with sixteen effects in the list (`0x800118f8`, `0x80011900`, `0x80011904`).

Where the third word of the position is not below nothing, a position in the world, it also asks that the count of players at `0x800a33cc` be 1 (`0x8001190c`, `0x80011914`, `0x80011918`, `0x80011920`, `0x80011928`), so a pickup bursts for one player alone, while an effect on the HUD, whose third word is −1, runs for either.

The entry is 184 bytes in a list at `0x800ab56c` of sixteen a player, 2944 bytes a player (`0x80011930` to `0x80011958`): 160 bytes of primitives, then the position (`0x80011994`, `0x800119c4`, `0x800119f4`), the table (`0x80011964`), an angle a particle at nothing (`0x80011a78`, `0x80011aa4`), a frame count at nothing (`0x80011a20`) and the light (`0x80011a4c`); the count at `0x800a4320`, a word a player as the list is, the word at `0x800a33d0` picking both (`0x800118e4`, `0x800118f0`, `0x800118f4`, "The frame" above), goes up by one (`0x80011aa8` to `0x80011ab4`).

**Each pass the frame loop runs every effect once, after the frame's draw and the routine after it, draws the row of its frame count and counts it on** (`0x8004101c` to `0x8004102c`).

The run (`0x80011ac0`) returns where the count is nothing (`0x80011b04`, `0x80011b10`), and for each entry holds its frame count against the table's frames (`0x80011b74`, `0x80011b80`, `0x80011b88`, `0x80011b8c`): where it has reached them the light is let go (`0x80011b9c`, `0x80011ba0`, through `0x8002f2cc`, which writes −1 into the light's colour word, "The devices' light" above), the count comes down by one (`0x80011bc8`, `0x80011bcc`), the entries after move up one, the position, the table, the frame count, the light and the two angles (`0x80011be8` to `0x80011d10`), and the same index is tried again (`0x80011d84`).

A table is a count of particles and a count of frames, two halfwords (`0x80011e08`, `0x80011b74`), then eight bytes for each particle of each frame (`0x80011dec` to `0x80011e18`): a sprite, an angle, a size and a brightness, each a halfword (`0x80012628`, `0x80012018`, `0x80011e5c`, `0x80011f4c`). Every table shipped has two particles.

After the rows the frame count goes up by one (`0x80012b18`, `0x80012b1c`), so an effect of n frames draws on n passes, from the pass it starts on, and is dropped on the next.

**A particle is one of seven sprites laid on a square, turned by its angle, its texture scaled by its brightness over 128 and added to what is behind it.** Startup lays seven textured quads of 40 bytes (`0x80011608`, `0x80011618`, `0x80011620`, `0x8001189c`) from the .GGI's sprite table, the seven from the header's first word on, its second counting them (`0x80022ed8`, `0x80022ee0`, `0x80011550`, `0x800115fc`, `0x8001163c`): [ggi.md](ggi.md)'s sprites 10 to 16, each 64 by 64, a purple glow, the ball's stripes, a red disc, an electric blue ball, a shell and two rings of sparks, called below by their lights, the dark ring and the white ring.

Each quad takes the sprite's palette and page (`0x80011868`, `0x80011884`), its corners' texture coordinates from the sprite's place and size (`0x80011694`, `0x800116c4`, `0x80011708`, `0x80011738`, `0x80011768`, `0x800117ac`, `0x800117f0`, `0x80011834`) and is made semi-transparent where the sprite's descriptor says its upload named a blend (`0x8001165c`, `0x80011660`, `0x80023048` to `0x80023054`).

The blend itself is in the page word, built from the .GGI's blend for the sprite (`0x80023198`, `0x8005f808`, [ggi.md](ggi.md)), 1 for all seven, the one that adds the quad to what is behind it, so a particle at a brightness of nothing adds nothing and is not seen.

Each frame the row's sprite picks the quad, copied into the entry's own primitives (`0x80012628`, `0x800126cc` to `0x80012748`), and the brightness is written into the quad's three channels (`0x80011f54`, `0x80011f9c`, `0x80011fe4`, `0x80012798`, `0x800127e0`, `0x80012828`), by which the GPU scales the texture over 128.

The angle: where the row's is below nothing (`0x80012018`, `0x80012028`, `0x80012380`, `0x80012388`) the run draws one from the dice, a draw of 4096 ("The wandering ball's dice" above), and keeps it in the entry's slot for the particle (`0x80012030`, `0x80012034`, `0x80012078`, `0x80012390`, `0x80012394`, `0x800123dc`); else it adds the row's angle to the slot's (`0x800120d4`, `0x800120dc`, `0x800124c4`, `0x800124cc`), so a table's angles run on from a draw, and where no row draws the slot stays at nothing and the angles are the table's.

The square: with the size not below nothing (`0x8001213c`, `0x80012144`, `0x8001282c`, `0x80012834`) the four corners lie the size from the middle, at the angle, a quarter on, a quarter back and opposite (`0x80012194` to `0x800121d4`, `0x8001287c` to `0x800128bc`), the sprite's own corners in that order; else, the size taken positive (`0x80011e6c` to `0x80011e74`), the sprite's third corner lies at the middle (`0x80012248`, `0x8001224c`, `0x80012930`, `0x80012934`) and the others the size from it, the first at the angle (`0x80012220` to `0x80012238`, `0x80012908` to `0x80012920`), the fourth a quarter on and the second the two summed (`0x800121d8` to `0x80012254`, `0x800128c0` to `0x8001293c`), so the square stands off the middle on a side the size long with the sprite turned a quarter on from the angle.

**An effect in the world is drawn where it is seen through the camera, its size scaled by its distance, over everything; one on the HUD at a point of the screen.** The position's third word says which (`0x80011e68`, `0x80011e78`).

On the HUD the position is the point in pixels (`0x80012014`, `0x80012024`) and a size is in 64ths of a pixel: an offset is the size times the sine of the angle, which the table at `0x8009c20c` gives as 4096 at one (`0x8005fba8`, `0x8005fbb0`), shifted down by 18 (`0x80012084`, `0x80012130`, `0x80012134`, `0x80012148`).

In the world the position is turned by the view's matrix (`0x800122fc` to `0x80012324`) and projected (`0x8001235c` to `0x80012368`, through `0x800609c8`), and a size is in 16ths of a unit: a particle is skipped where its depth, four times what the projection gives (`0x8001236c`), is under 121 (`0x80012370`, `0x80012374`), or where every corner lies off the screen (`0x80012588` to `0x80012618`); the size is scaled by the screen's distance over the depth (`0x800124d4`, `0x800124dc`, `0x800124ec`, `0x800124f0`), the 160 of [camera.md](camera.md) shipped as `screen` under `play`, times the sine shifted down by 16 (`0x80012510`, `0x80012540`, `0x80012548`, `0x80012578`, `0x80012580`), which is where a length of a 16th of the size projects: a size of 2580 is 161 units, a third of a block.

Where a world row draws from the dice, the scaling divides by the cosine and the sine shifted down by 16 instead of the depth (`0x800123e0`, `0x80012440`, `0x80012450`, `0x8001247c`), nothing or −1 with 4096 at one, nothing taken as 1 (`0x800123e4`, `0x800123ec`, `0x80012454`, `0x8001245c`), so the particle would lie the size times the screen's distance across; the two rows shipped that draw in the world have a size or a brightness of nothing (kinds 4 and 9 below), so nothing of it shows.

A world particle's quad is linked into the frame's ordering table at its first word (`0x80012950`, `0x80012954`, `0x800129b8` to `0x800129f0`), the table of 1026 words the level loop clears each pass (`0x80040b28` to `0x80040b40`) and the loop's routine before the draw sends from its last word (`0x80041014`, `0x8002a354`, `0x8002a364`), so a particle is drawn after everything in the words above it, the scene, over whatever stands before it; a HUD particle's into the word the HUD's primitives are linked into (`0x800122b0`, `0x800122bc` to `0x800122d0`, as `0x800142b4` for one of them).

**While it runs, an effect in the world colours the light it was given with the sum of its particles' colours, so the faces about the pickup glow with the burst.** Startup gives the seven sprites a colour each, three bytes at `0x800a4328` (`0x80011580` to `0x800115f8`): 100, 50, 100; 80, 80, 80; 127, 60, 60; 20, 20, 127; 127, 127, 0; 20, 20, 80; 127, 127, 127.

For each particle drawn the run adds each byte times the brightness, shifted down by 9, to a running byte (`0x80012640` to `0x8001270c`), and where any was drawn gives the light the three as a colour word with the first byte highest (`0x80012a54`, `0x80012a5c`, `0x80012a94` to `0x80012ab0`, through `0x8002f2b4`); the faces take a light's word red lowest ("The devices' light" above), so a sprite's light is its third byte red and its first blue: the red disc lights the faces blue, 60, 60 and 127, the electric blue ball red, 127, 20, 20, the shell cyan, the dark ring red, 80, 20, 20, and the glow purple.

The light is the one the contact walk makes from the thing's cell and face, as a device's (`0x8002e3d8`, "What the ball takes" above), so the pickup's own face and the faces past its edges take the colour at the devices' levels and go dark as the effect ends and lets the light go.

An effect on the HUD is given no light, 0 (`0x800389d8`, `0x80038c28`, `0x8003a64c`), and colours none, its particles taking the HUD path past the sum (`0x800122f4`), but its end lets the list's first light go all the same (`0x80011b9c`), which whatever holds it colours again on its next frame.

**The seven tables, by the kinds that use them.** A size is the distance from the middle to a corner, in 64ths of a pixel on the HUD and 16ths of a unit in the world, an angle is in 4096ths of a turn and a brightness is of 128.

| kinds | frames | first particle | second particle |
| --- | --- | --- | --- |
| 0, at a key's or a fruit's icon | 67, 1.1 s | the white ring, 21 pixels out, turning 83 a frame, a turn in 49 frames, at 107 to frame 27 and fading by 7 to nothing at 43 | the glow, growing from 1 pixel by 1.2 a frame to 79 at the last frame, turning with the ring, at 107 to frame 14 and fading by 3 to nothing at 50 |
| 1, at the clock | 38, 0.63 s | the glow, growing to 60 pixels over the first three frames, turning 667 a frame, a turn in 6 frames, to frame 19 and 917 a frame from 20, from 167 fading by 7 to nothing at 24 | the stripes, 52 pixels out, turning 83 a frame from 2558, from 107 fading by 3 to nothing at 36 |
| 2, 6 and 7, at a coin, a key, a gem or type 42 | 50, 0.83 s | the dark ring, growing from nothing by 200 a frame, 12.5 units, to 362 units at frame 29, from 3763 stepping back 333 about every fifth frame, brightening by 35 to 140 at frame 4, fading by 10 from 11 to nothing at 24, gone from 30 | the white ring, 161 units out, turning back 83 a frame from 4013, brightening by 17 to 68 at frame 4, fading by 7 from 28 to nothing at 37 |
| 3, below the screen's middle for a teleport | 58, 0.97 s | the glow, growing from nothing by 5.2 pixels a frame to 140 at frame 27, turning 667 a frame, at 107 to frame 18 and fading by 13 to nothing at 27; then from 28 the shell, as a square of 53 pixels a side standing off the point from a corner, turned from a draw of the dice by 42 a frame, brightening by 8 to 64 at frame 36 and fading by 2 to 22 at the last frame | the blue ball, from frame 18, growing to 39 pixels out over three frames, turning 667 a frame, from 213 fading by 7 to nothing at 49 |
| 4, 5 and 10, at a fruit or the hourglass | 54, 0.9 s | the glow, 213 units out to frame 15, shrinking by 26 units a frame to 57 at 21 and by 3 to nothing at 40, not turning, brightening by 23 to 92 at frame 4, fading by 13 from 16 to nothing at 23 | the stripes, 161 units out and growing by 4.7 a frame to 307 at frame 31, turned from a draw of the dice at frame 0 by 127 a frame, a turn in 32, dark to frame 4, brightening by 27 to 135 at 9, fading by 8 from 14 to nothing at 30, gone from 32 |
| 8, at the sunglasses | 52, 0.87 s | the glow, growing from nothing by 14.6 units a frame to 699 at frame 48, not turning, at 107 to frame 24 and fading by 13 to nothing at 33 | the red disc, from frame 24, 208 units out and growing by 4.7 a frame to 335 at the last frame, not turning, from 160 fading by 7 to nothing at 47 |
| 9, at a pill | 49, 0.82 s | the white ring, at nothing to frame 19 though brightening from 11, then from a draw of the dice at frame 20 growing by 85 units a frame to 338 at 24 and turning back 468 a frame, a turn in 9 frames, from 255 fading by 7 to 59 at the last frame, where it is cut off | the red disc, growing by 22 units a frame to 224 at frame 10 and by 4.7 to 355 at 38, not turning, at 107 to frame 9, 160 at 10 and fading by 7 to nothing at 33, gone from 39 |

**Which effect each pickup starts** (`0x80038548` onward):

- A coin kind 2 (`0x80038b34`).
- A key kind 6 (`0x800389f4`) and, before it, kind 0 at the HUD's icon of the key taken, 6 right and 11 down of the icon's point with a third word of −1 (`0x800389a8`, `0x800389b8`, `0x800389c0` to `0x800389d8`).
- A gem kind 7 (`0x80038ac4`) and type 42's green form kind 7 (`0x80038754`).
- A fruit kind 4 (`0x80038c44`, `0x80038cec`, `0x80038d94`, `0x80038e3c`, `0x80038ee4`) and before it kind 0 at its icon's point, the five points at `0x800a336c` (`0x80038c18` to `0x80038c28`, `0x80038cc8`, `0x80038d70`, `0x80038e18`, `0x80038ec0`), unless the game's mode word at `0x800a33b0` is 2 (`0x80038c0c`, `0x80038c14`), a mode not read here.
- The hourglass kind 10 (`0x800390e8`) and before it kind 1 at the clock's point, 160 and 28 at `0x800a3364` (`0x8003907c`, `0x80039080`, `0x80039084`, `0x800390c8`, `0x800390cc`).
- The sunglasses kind 8 (`0x800388fc`).
- The three pills kind 9 (`0x800387ac`, `0x8003881c`, `0x80038880`).
- The case for type 27 that is never reached kind 0 at each fruit's icon and kind 4 (`0x80038f64` to `0x80038ffc`).

A teleporter starts kind 3 at 160 and 166 of the screen, at `0x800a3394`, as its count starts (`0x8003a634` to `0x8003a64c`, "The devices under the ball" above), with no light, so it runs 58 frames, the fifteen frames of the count, the send and 42 more on the far face.

A fruit's five icons and the clock's point are at `0x800a336c` and `0x800a3364` as data, 208 and 217, 228 and 216, 253 and 216, 278 and 216, 299 and 218, and 160 and 28, each with −1 as its third word.

**A teleport flashes the screen white and slows the game's pace through the flash.** The send (`0x8003a684` to `0x8003a68c`) calls `0x80020764` with 0 and 1: the routine marks the flash running at `0x800a5a28` (`0x80020764`, `0x80020768`), writes the 1 into the word at `0x800a592c` on which the frame loop waits two blanks where it is 1 (`0x8002076c`, `0x80040ae4`, `0x80040aec`, `0x80040af8`, "The frame" above), keeps the 0 as the flash's mode (`0x80020770`) and puts its strength at 268 for that mode (`0x80020774` to `0x80020788`, `0x800207ac`), 261 for mode 1 and 254 for mode 2 (`0x80020794` to `0x800207a8`).

The frame's draw runs the flash (`0x8002a6b0`, `0x800207b8`) while the mark stands (`0x800207bc`, `0x800207c0`): each pass takes 20 off the strength for mode 0, 13 for mode 1 and 6 for mode 2 (`0x800207c8` to `0x8002082c`), and where it is above nothing (`0x80020830`, `0x80020838`) writes it into the three channels of a flat quad (`0x80020864`, `0x80020894`, `0x800208c4`) and links its page word, the quad merged behind it, at the first word of the frame's table (`0x800208ac`, `0x800208e8` to `0x80020940`), over everything, and else clears the mark and the word (`0x80020944`, `0x80020948`).

The quad is laid as a level loads (`0x800233a4`, `0x80024414`): a page word with blend 1 (`0x80024480`, `0x80024488`, `0x8005f808`), the blend that adds the quad to what is behind it, with a flat quad merged behind it, their lengths summed into the page word's tag and the quad's tag cleared (`0x800244b0`, `0x8002539c`, `0x800253c4`, `0x8005fa78`), made semi-transparent (`0x800244b8`, `0x800244bc`, `0x80024500`) with corners at nothing and at the two words at `0x800a33e8` and `0x800a33ec` plus one (`0x800244cc` to `0x80024504`), so the grey is added to every pixel.

So a teleport shows the flash on 13 passes, at 248 falling by 20 to 8, and the word stands from the send to the pass after the last, so the loop waits two blanks on 13 passes, 26 blanks, 0.43 s, the game at half pace as under the lethargy pill. The same routine, on a level whose mode word at `0x800a53d4` is 1, a level with no key, is set at load to mode 2 at 254 with the word cleared (`0x8002441c` to `0x80024464`), so such a level opens from white, the flash fading by 6 over 42 passes, 0.7 s, at full pace.

The viewer plays the bursts as the game does. A pickup taken starts the kinds the table gives for its type, the HUD kind first where it has one, the hourglass's at the clock's point, a fruit's at its icon's point and the key's at a point of the HUD the map has not, and then the world kind at the thing's place with a light made from its cell and face; a teleporter starts its HUD kind at the screen's teleport point as its count starts, with no light; each is an entry in a list of the table's most, and a start past that, or of a kind without a table, is refused.

Each pass, as the screen's words step, every effect draws the row of its frame count, a particle's angle below nothing drawn from the dice the wandering ball draws from, a draw of a turn kept in the particle's slot, which the rows after run on from, and its count goes on, and one at its table's frames is dropped with its light let go. The list starts empty with a run and with a restart, which is the map's choice, the game's clearing of it as a level loads being unread.

The frame draws a world particle where the map's camera puts its place: the sheet's sprite on a square turned by its angle, its corners the size from the middle in 16ths of a unit, in blocks at the map's zoom, or, where the size is negative, standing off the point from the sprite's third corner, turned a quarter on from the angle, added to the frame at the brightness over the texture's own, twice where that is above one, and nothing at a brightness of nothing.

The camera is orthographic, so the game's scaling of the size by the screen's distance over the depth, and its skipping of a particle nearer than the table's depth, have no counterpart.

A HUD particle is drawn at its point scaled from the game's screen to the canvas, its size in 64ths of a pixel scaled the same way, and only the teleporter's particles, below the screen's middle, are drawn: the key's, the fruit's and the hourglass's HUD effects stand at the game's HUD's icons, and the map's HUD plays no burst, so they are kept in the list, taking a slot of the sixteen, and not drawn.

The particles draw over the scene, before the pill's screen and the flash, and with Motion off step with the game frames as everything does.

A world effect's light is cast on the faces about the pickup as a device's is, coloured each pass by the sum of its particles' colours by the arithmetic above, so the faces glow with the burst and go dark as it ends; a HUD effect's end letting the list's first light go for a pass is not kept.

The flash is kept as two words, its mode and its strength. A send starts it in the teleport's mode at the table's strength, and a run of a level with no key, the Simon rooms apart, starts it in the opening's mode at that mode's strength as the run begins, a restart included, as the game's load does. Each pass, the ending's view's passes included, takes the mode's step off the strength and clears it below nothing.

While the strength stands the frame adds a white quad over everything, the bursts and the pill's screen included, to every pixel at the strength over a channel's byte, with Motion on; with it off the words run and nothing is drawn, since the frames run only while the ball is driven and the quad would stand. So a teleport flashes the screen white and a level with no key opens from white, each over the passes the table's numbers give.

While the teleport's flash stands the frame loop waits the table's blanks a pass, so the level runs at half pace through a teleport as it does under the pill ("What the ball takes" above); the opening's flash leaves the pace alone.

The seven tables, row by row as the executable holds them, the sprites' colours as their lights show them and the brightness a sprite's texture is its own at, the units of a size, what each pickup and the teleporter start and the flash are shipped under `effects`, and the seven sprites on one sheet ([ggi.md](ggi.md)), which the page fetches as the first burst needs it.

## The shadows

Under a pickup the loader paints the shadow into the face ([tgi.md](tgi.md)), and the contact walk's tail paints it over as the pickup is taken ("What the ball takes" above).

Under the ball and the five captivators the game draws one every frame, **a flat square 300 units across laid on the face, textured with one of two sprites and taken away from what is behind it.** Nothing else has one: the square is drawn by the ball's draw (`0x80031024`, through `0x8002ca2c`) and the captivators' (`0x8003d680`, through `0x8002c4b0`), and its two sprites are read by nothing but the loop that sets up its primitives.

**The square.** Both routines transform the same four vertices, at `0x800a32c0`, 150 either way in x and z, by a matrix their caller builds, and drop the square when its corners wind the wrong way on the screen (`0x80051e8c`), so a shadow shows only on a face turned toward the view. The caller builds the matrix with `0x8003a114` from the face and a point it moves toward the block by a distance it gives, and turns it a quarter about x before the rest (1024, `0x8003db78`), which lays the square flat on the face.

**The sprites and the blend.** `0x80029048` sets up the primitives once, sixteen of each of two kinds: a textured quad, semi-transparent, drawing the sprite 14 or 15 past the group the .GGI header's sixth bound starts, which the parser keeps at `0x800a5738` (116, `0x80022f28`), so [ggi.md](ggi.md)'s sprites 130 and 131, both 32 by 32 at 4 bits: a soft round blot and a square with rounded corners.

Both uploads ask for blend 2, which the sprite table puts in the page word (`0x80023198`) and which takes each texel away from what is behind, and their palettes run from 0, drawn as nothing, up to 10 of 31 in each channel, so a shadow's middle takes 10 of 31 off whatever it lies on, darkening a pale stone a little and a dark one to black, and falls off evenly to nothing at its rim, 150 units out. The quad's colour, written into it with each draw (`0x8002c990`), scales every texel by itself over 128, and is how strong the shadow is.

| under | sprite | where | how strong |
| --- | --- | --- | --- |
| 50, 52 and 53 | round | on the face, its entry's position moved 200 toward the block (`0x8003db5c`, `0x8003f728`, `0x8003e1e0`), so it goes where the entry goes | 128 (`0x8003dd3c`, `0x8003f908`, `0x8003e3c0`) |
| 51 wheel | square (`0x8003f288`), turned about the normal by the wheel's third angle, the one its turns step, since the quarter turn that lays it flat comes first (`0x80060cc8` takes x before z) | on the face (`0x8003f07c`) | 128 (`0x8003f280`) |
| 56 corkscrew | round | 30 off its face, under its home: 170 toward the block from where the loader put its entry, which the bounce never moves (`0x8003e8f8`) | 128 − 48·sin θ, θ its bounce (`0x8003ea2c`), so 80 at the top of a bounce |
| the ball | round, and scaled across the face by the ball's two squash matrices, the landing's and the breath's (`0x80031f3c`, `0x80031f54`) | moved toward the block by h, how far the ball's middle is off its face, which the ball's state keeps (`0x80037bc4`), or by 512 where the block under it is a moving platform or there is none (`0x80031e98`) | 128·(512 − h)/412 (`0x8003245c`): full at rest, 100 off, fading as the ball rises, and nothing a block up, over a platform or over a gap |

So the ball's shadow breathes with it, wider and narrower by 200 of 4096, and a corkscrew's thins as it rises, its faint rim dropping out first, so it reads as smaller at the top of a bounce. The stars' and the wandering ball's shadows stay the same size and strength however they tumble.

The ball's state keeps a word for what it stands on, at 356: the routine at `0x80037430` takes the block under the cell the ball's centre lies in, the centre rounded to the nearest block (`0x8003746c`, `0x80037470`, `0x800377a4`), and gives a plain block's face the type of the slot there (`0x80037944`), fire, ice and acid their own numbers, and the invisible, platform, crumbling and vanishing kinds 93, 95, 96 and 97 (`0x800378e0`, `0x80037818`, `0x80037840`, `0x80037868`), so 96 is the ball on a crumbling block.

A lattice style reads as its kind (`0x80037950` to `0x80037998`), a bare plain block or no block as −1 (`0x800379ac`, `0x800379a8`), and a lit beam's cell leaves the word as it was (`0x800379bc`); a laser's two ends hold style 0 from the loader's write ([level-format.md](level-format.md)) and read as a bare block, and the routine's path for a record of another kind (`0x8003792c`), which leaves the word, is never met once the level is loaded.

The table ships the word as each kind's `standing`, and each of the six types' shadow as its `shadow`, which sprite, how far off the face it lies and how strong it is, with how the ball's and the corkscrew's change, and the square's reach under `shadow` beside the types; the build reads the two sprites out of the .GGI and ships them under `shadows`, a row of 32 texels to a string, each what it takes off, in base 32.

The viewer lays the sprite on a square as the game does and takes it away from the map by turning the square's box over, adding the sprite and turning the box back, which leaves every pixel what the sprite takes off it and no less than nothing; it lays the round sprite along the face's tangents, where its turn makes no difference, and the wheel's along its nose.

It paints the shadow under a pickup only while the pickup is drawn, so the face is bare again under a kind hidden from the legend, with the objects switched off, and once play has taken the pickup, as the game's is.

## Not settled

Which of the two tangents a pill flips about and a fruit tilts about rests on the naming of the model's axes in [ggi.md](ggi.md) and on RotMatrix's order; a pill in play flips the way the map does.

What the PAL release runs at is not on this disc.

The laser's beam was not looked at for a pulse.

On a crumbling block, h is scaled by a table before the shadow's strength is taken from it (`0x8003237c`), which the map does not draw.

Where a device's light looks for a face in a cell a lit beam crosses, the lattice holds the beam's −2, which `0x8002f16c` takes for a block and looks up 32 words before the table of faces, in memory the executable does not fill; whether it finds a face there, and so whether the light stops at that edge or falls through to the next face, is not settled. Past a dark beam's −1 it falls through, and the map lets it fall through past a lit one too.

The map measures the invisible block's light and the boost button's reach from the point where the ball touches its face, where the game measures from the ball's centre, 100 off the face, and the button's reach to the middle of its block besides, so that the two buttons on SIMON 8 and LEVEL 119 that stand up on the map sink by the game's measure; the map's measure stands until play has shown them sinking as the level opens.

Of the sunglasses, whether their blink runs on through a pause, which runs the ending's routine in the ball's routine's place and so holds the word, turns on the gate the frame's draw runs under, the word at `0x800a5e78` (`0x8002a3c8`, `0x8002a3d8`), which is not read; the map's play has no pause.

Of the Simon rooms, what the frame loop's routine does with the flag at `0x800a3458`, what the start does with the turn word it copies to `0x800a553c` (`0x80036070`, `0x80036078`), which player's pad the loop reads in the mode (`0x80040cdc` to `0x80040d20`) and whether the outcome the game's loop keeps at `0x800a5704` can stand above nothing as the mode opens, which would skip the reset, are not read.

The frame counts of the roll, the turn, the arc, the ramps and the jump are read off the code and not yet counted in play; and a landing with Up released leaves the ball at rest where it landed, short of 180 of progress or past it, which a jump from a roll can bring about; whether play shows the ball resting off a middle is not settled.

Of the body and the hop: the draw's marks for the Simon rooms and the bouncy pill were not read, and a marked draw skips the breath's and the squash's step too (`0x800325c0`), a hold of one frame the map need not draw.

Whether the game's ball is seen to sink under a held Cross, a fifth of a block after eight hops, snapping back with a squash over a lone block and sinking on over a deeper floor until the 26th hop lays it inside its block, is for the emulator to show; the draw takes the position at 60 with the squash's offset and the word at 84 (`0x800314c4`, `0x800314f0`), so the listing says it is seen.

`0x8004ddbc`, which the button's launch calls with 10, a landing and a hop's end with 102 and a capture with 113, and which takes a number under 120 to a table (`0x8003b280`, `0x80030c6c`, `0x800301f4`, `0x800367c0`, `0x8004dddc`), is the sound call, and `0x800227f4`, which the −66 landing calls with 3, 24 and 2 after the pad's shudder and which keeps the three under a flag for a routine that runs the 24 down (`0x800227f8` to `0x80022808`, `0x80022818` to `0x80022838`), the screen's shake; the map plays no sound, shakes no screen and shudders no pad, the button's shudder included (`0x8003b298`).

Why the hop reads a row ahead of the jump is not traced, nor what the word at the record's start selects, 3 at a jump's start and in a fall, 1 at a hop's start and a turn, 2 at a roll's start and 0 at a landing, a hop's end and a teleport's send.

What a jump over flat ground shows otherwise than the game's, the landing cell and the 31 frames being the game's, is for play to show.

What the fruit takes 200 off, a word by the world at `0x800a5584` that the level loop sets as a level starts and the menus read (`0x80038c88` onward, `0x800407f0`), is not read.

The third of the three words the loop runs the ending's routine on, at `0x800a57f8`, is not read for what it means ("The level's clock and its end" above).

A ball standing on a face whose slot is type 52, with the jump asked and the roll not, scores 5 a frame (`0x8003aaf8` to `0x8003ab3c`), which no level is known to reach.

How the finals are reached, by the flag at `0x800a3454`, which one routine writes from a table and another sets to 1 (`0x800462c8`, `0x8004910c`), and what the word at `0x800a33f4` marks, on which the points routine skips its banking and the next-level routine returns, are not read.

The hourglass's rule as read, 1190 less 10 a whole second left, differs from the one play had put at 1200 less 12 a second, and a count in play has not been taken against the code's.

How long an ending's view shows before the level is loaded again is not counted: the loop leaves the level once a flag at `0x800a5aa4`, which nothing read here sets, stands and a button is pressed (`0x800414c8`), or presses one for the player.

Whether the acid's six frames roll the ball on is for play to show, as is the swell of a ball burning, which the map does not draw.

Whether any level stands a captivator within reach of the start, which the reach test, tried through the fly-in's flight ([camera.md](camera.md)), would let catch the ball before the keys are live, is not checked.

Of the ball on a platform, whether a ball riding a platform can roll off its end onto a block the platform docks against, since the platform's lattice holds no block of the level's, is not read.

Whether a ball standing on a crumbling block is seen to drop two frames after the block goes, which the state's word and the order the frame runs in say ("The ball's roll" above), is for the emulator to show.

Of the effects: what the game's mode word at `0x800a33b0` means at 2, which skips a fruit's HUD burst and picks the key icon's table (`0x80038c14`, `0x80038958`), is not read; nor the code at `0x8001fd70`, which starts kind 0 at the five fruit icons in turn every tenth pass (`0x8001fd8c`, `0x8001fda4`) and once more at `0x80020054`, nor what it is for; whether the list's first light, let go by a HUD effect's end, is ever seen to flicker is for the emulator; and what the seven sprites show is [ggi.md](ggi.md)'s reading of the sheet, not play's.

Of the lethargy pill's screen ([camera.md](camera.md)): whether the ghost of the last frame lies over the scene or under it turns on the order the frame's tables are chained in at `0x8001dbec`, which is not read; and the library's `VSync(2)` counts from its own last call, so whether the first of the two-blank passes waits one blank or two is not read.
