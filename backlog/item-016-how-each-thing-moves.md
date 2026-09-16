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

Rather than implement each by hand, the question is what of this the disc holds, per type (rates, amplitudes, timings, a routine each), and what the map could carry as data; so this is an investigation before anything is drawn. Item 13, travel across blocks, is the other half of the same question.

Screenshots from play, in `out/shots/`: `acid-and-corkscrew.png` has the corkscrew mid-bounce. OBJ LEVEL places one of everything.

## Sketch

What is drawn today is `drawObject` in [render.js](../public/js/render.js) and the phase field [docs/level-format.md](../docs/level-format.md) describes. `tools/mips.py` reads the executable. Needs the disc.

## Ruled out

Nothing yet.
