# 16. How each thing moves, read off the game

## What and why

The map turns every pickup on the spot at one rate, floats the corkscrew up and down, cycles the moving spikes' frames and rolls the wheel. Play shows every object with a motion of its own (2026-09-16):

- coins, fruit, keys and sunglasses float ever so slightly up and down as they turn;
- the clock does two flips and a bit of a turn;
- the stars turn about every axis;
- the wandering, vibrating ball-like captivators vibrate, then move;
- the lethargy pill flips and turns at once, and the bouncy pill the same, perhaps faster, or only out of step with it;
- type 34 moves like a pill, and acts like one, flashing colours over the ball;
- type 42 circles fast within its block in its brown form and slowly in its green form;
- the corkscrew, type 56, kicks off the ground rather than gliding to a stop, and makes about three turns on the way up, where the map floats it;
- spikes come up fast by default, and some carry a setting that keeps them up longer and changes how often they extend;
- vanishing blocks flash bright, then go, then come back;
- invisible blocks glow faintly up close.
- moving platforms mechanically and smoothly move back and forth, but stopping each time on each edge for a period of time (probably same throughout the game)
- bouncy boost button is lively as a spring irregularly expanding and retracting

Rather than implement each by hand, the question is what of this the disc holds, per type (rates, amplitudes, timings, a routine each), and what the map could carry as data; so this is an investigation before anything is drawn. Item 13, travel across blocks, is the other half of the same question.

## What the disc holds (2026-09-17)

All of it, in the executable, and [docs/motion.md](../docs/motion.md) is the reading with the addresses; `python3 tools/kula_motion.py` prints every number with the instruction it came from. In short: the game runs at 60 frames a second and steps every angle by a constant a frame, angles in 4096ths of a turn. Pickups turn about the normal (coin, key, sunglasses −75, gem 29, fruit 20, teleporter 25 while on, exit −20 shut and −45 open) and the coins, keys, sunglasses and fruit bob twenty units on the lattice's vertical; the hourglass, which is the clock above, swings half a turn over and back at 26 while turning at −16; the pills and type 34 flip at 66 while turning at 20; type 42 circles at radius 100, fast in the brown form and slowly in the green, and changes form every 158 frames. The moving spikes run a 143-frame cycle of 63 down, 6 rising, 15 rattling, 14 up and 45 retracting, and `f6` is a phase of 35 frames, whose "keeps them up longer" is the first cycle only. The vanishing block runs a 224-frame cycle of 91 absent, 9 fading in, 5 settling, 91 solid, 9 dimming and 19 flashing out, and `f5` is a phase of a quarter cycle. The corkscrew bounces 400 units up a half sine every 89 frames, which is the kick, spinning 2.8 turns up and back, with `f6` a phase of a sixth; the stars and the wandering ball tumble about three axes at fixed rates; the wheel rolls at −53. The moving platform runs at 25 units a frame and waits 48 frames at each end; the fast star sways 600 units either way in 77 frames. Every pickup starts at a random angle, so phase is the map's to choose.

What is a reaction to the ball and not a motion of its own: the boost button sinks while the ball is within 700 units and springs back after; the crumbling block shrinks over twenty frames once broken; the invisible block's glow was not read but is by the ball's distance in play; the wandering ball's dash and the stars' turning are decided against the lattice and belong to item 13, and the routines that decide them are located in the doc.

## Proposal

Carry the numbers as data the build reads off the executable, not as constants in the viewer: `tools/kula_motion.py` already reads each one by the instruction it lives in and fails if the instruction is not there, so `kula_build.py` can have it write a `motion` table into `objects.json`, one entry per type and per block kind, in the game's units (a frame, 4096ths of a turn, 512 to a block), and the viewer converts at draw time with one clock of 60 frames a second. The viewer then needs one shape per motion rather than one per type: a turn about an axis at a rate, a bob or sway along an axis at a rate and reach, a swing (the hourglass's half turn over and back), a bounce (the corkscrew's half sine and its cosine spin), an orbit (type 42), and a stepped cycle (the spikes' frames and the vanishing block's states), each fed by its entry. Phases come from the record where the disc gives one, `f6` on types 11 and 56 and `f5` on kind 7, and from the cell hash where the game draws them at random.

What to draw by default is what happens on the spot: every turn, bob, swing, flip and orbit; the spikes' cycle; the corkscrew's bounce and spin; the vanishing block's cycle in place of the faint broken block it is now; and nothing for the boost button, the crumbling block or the glow, which wait for the ball. The fast star's sway, the wandering ball's shake and dash, the wheel's roll along its course and the platform's run are travel and stay behind item 13's switch, with the rates already in the table for it.

## Not settled

Which tangent a pill flips about and a fruit tilts about (one look in play); whether a coin on a wall bobs along the wall, as the code says, or off it; the PAL release's rate.

## Ruled out

Nothing.
