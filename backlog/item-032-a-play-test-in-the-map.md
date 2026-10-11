# 32. A play-test in the map

## What and why

Motion moves what the game moves, the platforms, the stars, the wheel and the wandering ball, turns and bobs what stands in place, and a switch pressed from its panel turns its circuit over, so an author sees the level as it runs ([docs/viewer.md](../docs/viewer.md)); nothing rolls the ball. A play-test beyond Motion and the circuit presses was put aside for after the editor shipped, and [item 25](item-025-play-checks-for-the-editor.md) lists what only an emulator can settle about a written level, which is where a play-test of the game's own happens today.

## Sketch

The least of it is a walk: the ball moves cell to cell over the faces of the blocks, from the start, by the keys, and the map says where it stands and what it would pick up, with the rule for what a step may do taken from the game's code, the roll onto the next block, the turn round an edge onto the block above or below, the jump across a gap, the fall off the last block, as [docs/motion.md](../docs/motion.md) takes the motion of things from it and [docs/level-format.md](../docs/level-format.md) the scoring; none of the ball's own rules is read yet. From a walk follows a check that needs no playing: which blocks and which pickups the ball can reach from the start, so that a key no path reaches is a finding rather than a surprise. The whole of it is a game: the time running down, the hazards, fire, acid, the spikes and the lasers, the crumbling block's fall and the vanishing block's phase, the platforms carrying the ball, the teleporters, the keys and the exit, and a simulation that differs from the game in any of them tells an author something false, which is worse than nothing.

Open: how far to go, and whether the walk's rules can be read from the executable to the word before the first step is drawn. Ruled out: running the game in the page, since the page carries no emulator, serves no disc and sends nothing anywhere.
