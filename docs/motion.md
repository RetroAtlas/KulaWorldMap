# How each thing moves

What the executable does to every object and every moving block each frame, read off the code of the NTSC-U release with `tools/mips.py`, and what each reading rests on. `python3 tools/kula_motion.py` prints every number below with the address it was read at and stops if an instruction is not the one it expects, and `--table` prints what the build ships under `motion` in `public/objects.json`: the rates by type and by kind of block in the game's units, and the two cycles below as a frame program per phase, simulated from their routines and cut at one frame for all four phases so the game's spacing between them survives. The viewer draws everything that moves on the spot from that table, on a clock of sixty frames a second, and what travels across blocks waits on [../backlog/item-013-move-the-hazards.md](../backlog/item-013-move-the-hazards.md). [level-format.md](level-format.md) is the same document for the level file and [ggi.md](ggi.md) for the meshes.

## The frame

**Everything below is per frame, and a frame is a sixtieth of a second.** The play loop at `0x80040210`-`0x800406c4` runs the level once per pass (`0x80040690`) and waits once, `VSync(0)` at `0x800406b4`, which is one vertical blank; the play routine's own wait is the GPU's drawing callback unless one of two words, `0x800a572c` and `0x800a592c`, is set, in which case it is `VSync(2)` and a counter at `0x8004188c` ticks by two instead of one, and nothing in the executable writes either. A cross-check comes from the level data: a moving platform's speed on the disc is 30 units a frame on all 37, and the loader at `0x80032a5c` scales it by 50/60 before use, which is what a game authored for a 50 Hz release does when it is built for 60. The rates that live in the code carry no such scaling, so on the PAL disc they may run at 50 a second or may have been retuned; this disc says nothing about that.

Angles are in 4096ths of a turn, the unit the sine table at `0x8005fb58` takes; distances are in units of which a block is 512; and one word, `0x800a33d0`, gates every update below with a test against zero. It selects a second view the shipped game never draws: it is a data word that loads as 0 and is never written, so the gates are always open.

## The things on a block

The routine at `0x80039200` walks every record of kinds 0 to 4, every slot of each, and every object whose `f7` is not zero, and both advances and draws it; the table at `0x80010290` sends each type to its own case. **An object's angles live in its own slot**: `f14`, `f15` and the word after them, which this document calls A, B and C, are set at load (`0x80035930`) to random values up to 4095 for every type the loader knows, so the phase of every pickup is random on every visit; the boost button alone starts at A = 16. Which angle turns which axis is named by the game as x, y and z, and its z is the axis [ggi.md](ggi.md) calls y, the normal of the face the thing stands on, since a coin's spin is its z. The bob some types have is added to the object's world position on the lattice's vertical, `z`, before the view is applied (`0x80039d68`), so on a side face it runs along the wall rather than off it, twenty units either way where a block is 512.

| type | what it does, per frame |
| --- | --- |
| 31 key, 37 coin, 38 sunglasses | turns about the normal by −75, a turn in 0.91 s; bobs by 20·sin C + 10 with C stepping −58, a cycle in 1.18 s |
| 36 gem | turns by 29, a turn in 2.35 s; no bob |
| 43 to 47 fruit | turns by 20 (3.4 s a turn); tilts by 150·sin B about the first tangent, 13° either way, with B stepping −66 (1.03 s); bobs by 20·sin C + 10 with C stepping −50 (1.37 s) |
| 35 hourglass | swings by 2048·sin A + 30 about the second tangent, half a turn either way and back, with A stepping 26, so it goes over twice in 2.63 s; and turns about the normal by −16, a turn in 4.3 s |
| 32, 33 pills, 34 tablet | flips about the second tangent by 66 (1.03 s a turn) while turning about the normal by 20 (3.4 s) |
| 42 catalogue star | A steps 13 and the form is the brown model while A is below 2049 and the green one after, so it changes every 2.6 s; it circles its block's centre at radius 100 with C stepping 83 in the brown form (a lap in 0.82 s) and 6 in the green (11 s), turned about the normal by 1024 − C; a third angle B grows while green and is not drawn with |
| 5 teleporter | turns about the normal by 25 (2.7 s) while its `f7` is 1, on, and stands still off |
| 7 exit, 26 hidden exit | turns by −20 (3.4 s) while shut, `f7` = 2, and −45 (1.5 s) once open; the last key sets the exit's `f6` to 0, the green model, and `f7` to 1, and gives the hidden exit the `f7` the loader took from it (`0x80038a78`, `0x80035898`) |
| 9 switch, 11 moving spikes, 12 spikes, 28 arrow | no turn; the moving spikes' frame is written by the routine below into `f11`, which the draw command carries (`0x8002d920`) |
| 10 boost button | reacts to the ball and does nothing on its own: A is a height of 16, sinks by 1 a frame while the ball is within 700 units and rises by 4 a frame after, and scales the model's height by A/16 (`0x80039b48`); rising by fours from an odd height leaves it up to 3/16 taller than it began |
| 39 to 41, 48, 49 | the placeholder arrows turn by −14 |

The variant a type draws is `f6` for every type, read by the draw dispatcher at `0x8002d878` as the model `type × 16 + f6` in the second table of the .GGI, which is why a coin's tier, a gem's cut and a teleporter's colour are all the same field, and why type 42 changes its shape by writing its own `f6`. Three more things happen in the draw and not in the walk: a teleporter, a switch or an exit whose `f7` is 1 spawns a sprite every 19 frames, counting in the last pad of its slot and keeping the sprite's handle in the kind word of the slot after it (`0x8002d424`); the exit's face is marked open when no keys are left (`0x8002c150`); and a fruit's type is rewritten at load to the lowest of the five whose bit in the word at `0x800a5664` is clear (`0x80035664`), which reads as the first not yet collected and is the rule the map states as the level's number counted round the five. The loader also numbers each object it knows in the order it meets them and writes that into `f8` (`0x80035998`), the index of its runtime entry, so the number the disc holds there is not the one the game plays by.

## The moving spikes

Type 11 keeps a state in the kind word of the slot after its own, a countdown in the last pad of its slot and the frame it shows in `f11`, and the routine at `0x8002bbec` steps them, dispatching on the state through `0x8001005c`:

| state | what it is | lasts | the frame shown |
| --- | --- | --- | --- |
| 0 | down | 63 | 0 |
| 1 | rising | 6 | 0, 0, 6, 12, 19, 25 then 31; `f7` becomes 1, deadly, and sound 105 plays as it starts |
| 2 | rattling | 15 | 31 on even counts, and 2, 6, 11, 15, 20, 25, 29 on odd ones between them |
| 3 | held up | 14 | 31 |
| 4 | retracting | 45 | 31 falling to 0 in steps of 32/44; `f7` becomes 2, harmless, with 11 frames left; sound 106 as it starts |

**The cycle is 143 frames, 2.4 s, and `f6` is a phase of 35 frames a step.** The loader at `0x8002a078` sets the first state from `f6 × 35`: under 63 it starts down with 63 − 35·f6 to go, under 96 held up with 96 − 70 to go, under 140 retracting with 140 − 105 to go, so on the first cycle a phase of 2 holds the spikes up for 26 frames instead of 14 and a phase of 3 starts them three quarters up; from the second cycle on all four run the same 143 frames, 35, 72 and 107 frames apart. `f6` is set to 0 at load, so every one draws the same model, and the 32 frames of the mesh go from flat to 388 units tall in equal steps. Simulating the routine from each phase is what gives the frame lists and the 143; `python3 tools/mips.py --at 0x8002bbec --count 184` shows it.

## The vanishing block

Kind 7 keeps its state in the first slot's `f6` and a countdown in `f7`, and the routine at `0x8002b6ec` steps them through the six states of `0x80010044`; the first slot's `f5` on the disc, 0 to 3, is the phase, and the loader at `0x80028b14` turns it into a state:

| state | what it is | lasts | what shows |
| --- | --- | --- | --- |
| 0 | absent | 91 | nothing; the lattice cell is −1 |
| 1 | fading in | 9 | the cell is set and the faces brighten from black to white |
| 2 | settling | 5 | from 211 down to neutral grey |
| 3 | solid | 91 | neutral, `0x808080` |
| 4 | dimming | 9 | from 57 up to 231 with the faces' translucent flag on |
| 5 | flashing out | 19 | white fading to black; then the cell is −1 again |

**The cycle is 224 frames, 3.7 s, and `f5` is a phase of 56 frames a step**, a quarter exactly: a phase under 2 starts absent with 91 − 56·f5 to go and the others start solid with 196 − 56·f5 to go. The block is in the lattice, and can be stood on, from the moment it starts fading in to the moment it finishes flashing out, 133 frames, and out of it for 91. What the disc holds in the record's `type` word is overwritten at load with the lattice's own value for the cell, which is what the routine writes back when the block returns.

## The crumbling block

Kind 6's first slot holds 512 times its cell in `f5` to `f7` on the disc and the game does nothing with that: the loader at `0x80028a98` writes 512 into `f5`, and once the ball has broken the block (its `type` word goes from 1 to 2, then 3) the routine at `0x8002b3f4` takes 26 off `f5` a frame and drops the block from the lattice when it goes negative, twenty frames later, a third of a second, spawning debris from each face on the way.

## The moving platform

Kind 5's record is read three ways at once. Its `type` is the direction it is travelling, in the game's numbering of the six; `f7` to `f9` and `f10` to `f12` are the two ends of the run; the second slot is `[which end, blocks long, speed, dwell, a number, −1]`, the length 2 or 3 and the speed 30 on every one of the 37; and the extras hold its position, 512 times its cell, with three words of 256 after. The routine at `0x80032af4` moves the position by the speed along the direction each frame that the dwell is 0, dispatching on the direction through `0x80010158`, and on reaching the far end reverses the direction (1 and 4, 2 and 3, 0 and 5 swap), flips the end word and sets the dwell to 48 frames, 0.8 s; the dwell counts down and sound 107 plays the frame before it leaves. **At load the dwell is zeroed and the speed becomes 30 × 50 / 60 = 25**, 1500 units a second, a block in a third of a second (`0x8003278c`). The record's faces are drawn at that position, one block after another along `f5`'s axis, by `0x8002b26c`.

## The captivators

Types 50, 51, 52, 53 and 56 are lifted out of their slots at load into 180-byte entries at `0x800ba3dc` (`0x8003b5dc`), each standing **456 units from its block's centre along the face normal**, 200 off the face, with the normal, a home position, a heading from `f5` and three angles of its own. `0x8003ba88` moves them each frame and `0x8003d680` turns them, and the `f6` of a corkscrew alone survives as a phase.

| type | moves | turns |
| --- | --- | --- |
| 50 slow star | 13 units a frame along its heading, a block in 0.66 s, and decides what to do next each time it crosses the middle of a cell (`0x8003bb98`) | tumbles about its three axes by 11, −100 and 43, turns in 6.2, 0.68 and 1.6 s |
| 52 fast star | sways about its home along its heading by 600·sin θ, 1.17 blocks either way, with θ stepping 53, a swing and back in 1.29 s, starting at its home | tumbles by 64 and 32, turns in 1.07 and 2.1 s |
| 51 wheel | rolls 12 units a frame, a block in 0.71 s, and decides at cell middles; a turn takes 76 frames at 13 a frame, a quarter, and an about-turn 26 a frame | rolls about its axle by −53, a turn in 1.29 s, while moving |
| 53 wandering ball | shakes for 77 frames, 1.3 s, lurching along the way it will go by 65·(1 − cos θ), up to 130 units, with θ stepping n²/8 on the nth frame so the shaking quickens; then dashes 53 units a frame, a block in ten, settles on the grid and draws a new way from four (`0x8003c730`) | tumbles like the slow star |
| 56 corkscrew | rises 400·sin θ along the normal, 0.78 blocks, with θ stepping 23 and wrapping at 2048, a half sine, so it lands and leaves at speed: a bounce every 89 frames, 1.48 s, with sound 24 at each landing | spins about the normal by 400·cos θ a frame, 2.8 turns up and 2.8 back |

The corkscrew's `f6` sets θ at load to 1024, 682, 341 or 0 for 0 to 3, a sixth of a bounce a step, with 0 the highest; the other four start at their homes with everything zero, so their tumbling is in step across a level. Where a star or the wheel turns is decided by seven small routines the update calls, `0x8003cf6c`, `0x8003d0cc`, `0x8003d22c`, `0x8003d278`, `0x8003d378`, `0x8003d3f4` and `0x8003d4f4`, which probe the lattice 400 units into the block and a block along a vector of the entry and set a new heading; they are found and not read, and belong to [../backlog/item-013-move-the-hazards.md](../backlog/item-013-move-the-hazards.md).

## Not settled

Which of the two tangents a pill flips about and a fruit tilts about rests on the naming of the model's axes in [ggi.md](ggi.md) and on RotMatrix's order, and one look at a pill in play beside the map would settle it; the flip and the turn happen at once, so the difference is small. The bob along the lattice's vertical on a side face is read off the code and not seen. What the PAL release runs at is not on this disc. The faint glow of an invisible block near the ball lives in the hand-written renderer at `0x8004f000` onward and was not read, nor was the laser's beam looked at for a pulse. The rules that steer the stars, the wheel and the wandering ball are located above and not decoded.
