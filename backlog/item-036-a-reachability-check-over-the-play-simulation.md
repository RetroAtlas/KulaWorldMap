# 36. A reachability check over the play simulation

## What and why

A draft's overview on the level line lists what the checks find in the file, and nothing of whether the ball can come by its key, a coin or anything else it takes: a key on a block across a gap, or under a plate whose every edge the side rule refuses, is found only by playing the level.

A walk over the blocks alone, the planner's rolls from the start with no jump, teleporter, platform, ice or fall counted, once named every pickup it did not reach, and on any level with a jump that was most of them, a level with one jump listing a dozen things the ball takes with ease, so it was dropped as noise.

What would say which pickups the ball cannot reach is a search over the ball's whole simulation, since a jump, a pill's bounce, a teleporter, a moving platform and its timing, ice and a fall from a crumbling or vanishing block each carry the ball somewhere a roll does not.

## Sketch

A search from the start over the ball's rest states through the pure stepper under `public/js/play/`, a state being the block and the face the ball rests on, its heading and what the level has changed under it, and the moves out of a state being the game's own moves, a roll, a turn, a jump and the pills' jumps, each stepped to the ball's next rest.

A teleporter carries a state to its partner, a moving platform carries it along its run with the platform's phase part of the state, ice slides it to the next stone block, and a crumbling or vanishing block drops it onto whatever stands below.

A pickup is reached where some path's rest state takes it, and the finding names only what no path reaches, so a level with a jump names nothing the jump reaches.

The search is pure, so it would live in a module of its own with a unit test of its own, on the list of pure modules in `tests/unit/imports.test.js`, and the overview would read its answer as it reads `validate`'s findings.

## Open

- The size of the state: a platform's phase, each circuit's state, which crumbling blocks are gone and which pickups are taken multiply the rest states, and what the search can leave out of a state without missing a path.
- The cost: whether the search runs at every edit, as the overview is built, or on request, or in a worker, and what it costs on a phone on a level at the caps.
- Where it lives, since the editor's modules import nothing of play and hear from it through its seams alone.
- What it names: every pickup, or the key and the exit alone, without which the level cannot be finished, and whether a pickup only a fall off the level reaches counts as reached.
- What of the simulation it inherits unread, which [item 34](item-034-what-play-leaves-to-read.md) lists.

## Ruled out

- The walk over the blocks alone, the planner's rolls from the start with no jump, teleporter, platform, ice or fall counted, which named most of a level's pickups wherever the level had a jump and said nothing an author did not know.
- A conservative over-approximation, every jump and every platform's whole run taken as reached whatever the timing, since the pills' jumps and a platform's timing would still leave false warnings, and a warning that is often wrong is not read.
