# 34. What play leaves to read

## What and why

"The ball's roll" in [docs/motion.md](../docs/motion.md) reads how the ball rolls, turns, goes round an edge and up a wall, jumps, falls and lands, which is enough for a play mode to roll the ball over plain blocks as the game does, which the map's Rolling the ball ([docs/viewer.md](../docs/viewer.md)) now does. The sections after it read what the ball takes, the devices and the blocks under it, what harms it and how a level ends, which is what a play mode runs.

This item holds what is left, each with where it was last seen in the code, so that the next reading starts where this one stopped; and as [item 25](item-025-play-checks-for-the-editor.md) lists what only an emulator can settle about a written level, it ends with what only an emulator can settle about the ball.

## Sketch

The free camera: the camera The Cutting Room Floor says the Japanese release gives the Select button, which the cheat frees here, takes Up and Down as a pitch of 25 either way, Left and Right as a yaw of 32 and L1 and L2 as a zoom of 4 between 4 and 20 in the input routine's tail (`0x800371ec` to `0x80037338`), and `0x80034684` draws from them; what it shows is unread.

The ball on a moving platform, past what motion.md's "The blocks under the ball" reads:

- What the 27-word read does with the body test, which it calls too where the lattice names a platform's record (`0x800376c0` to `0x800376e4`), so that what holds a ball that comes down on a platform's body without riding it, from a hop in place or a roll from a neighbour, and whether it falls as the platform moves off, turn on it, where the map's probe follows the drawn body, and the level's lattice names a platform's record at its first block's cell alone, 37 records on the disc with the other home cells and every cell along the runs absent from the map's data, so the game may board only over that cell where the map boards along the drawn body, unread.
- What the riding read of the platform's lattice (`0x80033978` onward) writes at 356, for which the map stands the platform's own word in.
- The ceiling test's first question to `0x80032fd0`, which reads the cell above as a record for a platform overhead and drops the ball where it answers.
- Whether a ball riding a platform can roll off its end onto a block the platform docks against, since the platform's lattice holds no block of the level's, is for the emulator.

The ball in the air, what the reading passed over: how the ball is laid after the arrow's bounce, and the word at 700 the draw scales the ball by, which the level's load clears (`0x80035e34`) and a routine of the jump's alone writes (`0x80032558` to `0x8003259c`) from a word at gp+6456 that nothing writes but to clear it (`0x800324ec`).

Two of motion.md's sentences rest on less than a listing: that a snapped centre lying in a block lands inside it where it was less than 156 in, the wall met at 412 standing between, follows from the landing's arithmetic and was not read off a case; and the call at `0x8004f108` the −66 landing makes, the pad's vibration under the vibration option, is made on a bounce and on a hit on a block above too (`0x80030924`, `0x80030a94`), which the map has no pad to shudder for.

The ending's view: how long the game holds it before the next level loads, and the sense of each of its three angles against the viewer's axes, are unread (`0x800347b8`, [docs/camera.md](../docs/camera.md)); the map runs it for the length of one swing of an arcade level's eye, whichever level it is, or until a key, turns its yaw and pitch by the game's third and first angles as they stand, and stands the level's radius in for the free camera's distance, whose margin past the furthest cell the table does not ship.

The view's other word: a second yaw at 506, which decays by 33 a frame toward nothing while the word at 498 is clear and is added to the turn's yaw (`0x800351c0` to `0x8003521c`, `0x80035238`); what sets it is unread.

The two boost buttons on LEVEL 119 and SIMON 8 that sink by the game's measure and stand on the map (motion.md's Not settled): to look at in DuckStation as each level opens.

A jump from a roll lands at the progress it left, and the landing leaves a ball past 180 of progress at rest where it is: whether play shows a ball resting off a middle, or something unread brings it to one, is for the emulator.

The counts that would hold the reading to play, in DuckStation with frame advance after `python3 tools/kula_warp.py --cheat --level /HIRO/HIRO.PAK#0`:

- The frames from one middle to the next with Up held from rest, 18, and rolling on, 15 or 16 by turns.
- A turn, the ball facing the new way from the first frame and the view coming round over 19.
- An edge, four frames of arc and eight to the middle, and a wall, five to the middle.
- The jump, 30 frames of rows and the 31st landing two blocks on, and the hop.
- A held Left turning again on the seventh frame after a turn ends.
- The view pitching down over a fall.
- Which way the body spins, with the roll or against it, since the sense of five times the speed about its own x rests on the model's handedness.
- The slide across ice ending at the first stone block's middle.
- A crumbling block gone on the twentieth frame from the one the ball first stands on.
- Through a teleport the body's turn, which the reading says is kept, the ball arriving turned within its new frame as it stood within the old rather than laid afresh as the start lays it.

Each count that differs corrects motion.md, and the ball on the map with it.

## Ruled out

Reading any of it from the level data: none of it is there, and every rule above is the executable's.

Running the game in the page, as item 32 ruled out.
