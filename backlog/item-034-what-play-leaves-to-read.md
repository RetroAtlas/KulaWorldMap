# 34. What play leaves to read

## What and why

"The ball's roll" in [docs/motion.md](../docs/motion.md) reads how the ball rolls, turns, goes round an edge and up a wall, jumps, falls and lands, which is enough for a play mode to roll the ball over plain blocks as the game does, which the map's Rolling the ball ([docs/viewer.md](../docs/viewer.md)) now does. Everything else the ball meets is read for what it looks like and not for what it does to the ball, so a play mode that rolls over any of it rolls over plain stone and has to say so until each is read. This item holds what is left, each with where it was last seen in the code, so that the next reading starts where this one stopped; and as [item 25](item-025-play-checks-for-the-editor.md) lists what only an emulator can settle about a written level, it ends with what only an emulator can settle about the ball.

## Sketch

The slide on ice: the move step lets a ball on ice roll on past the middle and over an edge beside a neighbour, and the rolling state drops a ball over nothing between 101 and 427 of progress; where a slide ends, whether the ball may turn or jump on ice, and what the kind word at 356 does to the speed are not read.

The arrow, type 28: what it refuses the ball. The hazards routine at `0x8003a928` is where what the ball stands on acts on it; its case for the arrow clears the forward request on the ground where the ball's heading differs from the arrow's (`0x8003a9a0` to `0x8003aaa4`) and arms the wall test's bounce in the air, and whether a turn on an arrow is refused too, and what a planner's walk should allow on one, is left.

The crumbling block under a roll: the input routine's tail (`0x8003733c` to `0x80037418`) has a ball rolling forward on a crumbling block, 96 at 356 (motion.md's "The shadows"), with the floor ahead empty and no block beside the block under, lose the forward request and its speed past 301 of progress, and past 401 be pulled back 40 along the heading besides; what that is for is unread.

The teleporter's wait: standing on an on teleporter at a progress of 167 to 345, a count at `0x800a4c68` runs from 15 to −1 with the pad held off (`0x8003a618` to `0x8003a674`), and then the ball is sent (`0x8003a690` onward) and the device marked done at 492 of the ball's record (`0x8003a6b4`) until the ball leaves the band 156 to 356 of the middle (`0x80036850` to `0x80036884`); the far end's placing and facing, and whether a climb right after reads a stale saved normal at 52 (motion.md's Not settled), are unread.

The free camera: the camera The Cutting Room Floor says the Japanese release gives the Select button, which the cheat frees here, takes Up and Down as a pitch of 25 either way, Left and Right as a yaw of 32 and L1 and L2 as a zoom of 4 between 4 and 20 in the input routine's tail (`0x800371ec` to `0x80037338`), and `0x80034684` draws from them; what it shows is unread.

The bouncy pill's pad: while its word is not negative (motion.md's "What the ball takes") the input routine takes Up and Cross through a four-frame latch, Up with Cross marking the long jump (`0x80036d50` to `0x80036e10`); what the latch does to a roll and a jump is unread.

The Simon rooms: mode 1 of the word at `0x800a33b0`, the mode without a clock or a fly-in ([docs/camera.md](../docs/camera.md)), takes the pad as one move at a time, Up and Cross latched over five frames and a turn after six frames at rest, packs the move into a halfword of 1 for right, 2 for left, 4 for forward and 8 for the jump, and holds it to the one stored at `0x800d7f84` by the move's index at 490, filling a −1 there and ending the level with 1 at the stored count or 2 on a mismatch (`0x80036e4c` to `0x80037174`); how the sequence is shown and stored is unread. A follow-the-route could emit the same halfwords.

The ball on a moving platform: `0x80033930` reads its cells, `0x80033078` lands the ball on one and `0x80033810` carries a jump from one; all unread.

The ball in the air, what the reading passed over: the wall test's fourth path (`0x80030860` to `0x800308fc`), which bounces a ball in the air whose heading differs from the vector at `0x800a591c` while the halfword at `0x800a5e98` is 1: the arrow's case in the hazards routine fills the vector from the arrow under the ball (`0x8003aa54`, through `0x80038008`) and `0x8003b514` sets the halfword while the ball falls or jumps over one, so the path is the arrow refusing a ball that arrives in the air against its way, and how the ball is laid after the bounce is unread; the ceiling test's first question to `0x80032fd0`, which reads the cell above as a record for a platform overhead and drops the ball where it answers; and the word at 700 the draw scales the ball by, which the level's load clears (`0x80035e34`) and a routine of the jump's alone writes (`0x80032558` to `0x8003259c`) from a word at gp+6456 that nothing writes but to clear it (`0x800324ec`). Two of motion.md's sentences rest on less than a listing: that a snapped centre lying in a block lands inside it where it was less than 156 in, the wall met at 412 standing between, follows from the landing's arithmetic and was not read off a case; and the call at `0x8004f108` the −66 landing makes, the pad's vibration under the vibration option, is made on a bounce and on a hit on a block above too (`0x80030924`, `0x80030a94`), which the map has no pad to shudder for.

The view's other words: a second yaw at 506, which decays by 33 a frame toward nothing while the word at 498 is clear and is added to the turn's yaw (`0x800351c0` to `0x8003521c`, `0x80035238`), and a tilt from a word at 548 the view is rolled by (`0x8003531c` to `0x80035364`); what sets either is unread.

The two boost buttons on LEVEL 119 and SIMON 8 that sink by the game's measure and stand on the map (motion.md's Not settled): to look at in DuckStation as each level opens.

A jump from a roll lands at the progress it left, and the landing leaves a ball past 180 of progress at rest where it is: whether play shows a ball resting off a middle, or something unread brings it to one, is for the emulator.

The counts that would hold the reading to play, in DuckStation with frame advance after `python3 tools/kula_warp.py --cheat --level /HIRO/HIRO.PAK#0`: the frames from one middle to the next with Up held from rest, 18, and rolling on, 15 or 16 by turns; a turn, the ball facing the new way from the first frame and the view coming round over 19; an edge, four frames of arc and eight to the middle, and a wall, five to the middle; the jump, 30 frames of rows and the 31st landing two blocks on, and the hop; a held Left turning again on the seventh frame after a turn ends; the view pitching down over a fall; and which way the body spins, with the roll or against it, since the sense of five times the speed about its own x rests on the model's handedness. Each count that differs corrects motion.md before the ball moves on the map.

## Ruled out

Reading any of it from the level data: none of it is there, and every rule above is the executable's. Running the game in the page, as item 32 ruled out.
