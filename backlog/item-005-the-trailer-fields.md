# 5. The unnamed word at the head of the trailer

## What and why

The level header holds one number the map ships without naming: **`header`**, a signed 32-bit word before the record count. It equals the placed-cell count on 79 of the 230 levels, falls short of it on 135, is negative on 16 (down to -51), and is never larger than it (measured 2026-09-16 from `public/map_data.json`). Nothing in the viewer presents it as a count: reading it as unsigned once put "4294967276 blocks" on the chip for Inca's LEVEL 45, which is how the sign was caught.

The shortfall against the count is not any one thing counted: not the records, the objects, the crumbling or invisible blocks, the beam cells, or the objects off the top, none of which match it on more levels than have none of them. LEVEL 16 falls short by its fifteen crumbling blocks and HIDDEN 2 by its ten, LEVEL 31 by its thirteen objects, and LEVEL 38 by 53 with five blocks on it.

## Sketch

The sixteen negative ones, to look at in play for whatever they share: FINAL 3 (-25), LEVEL 33 (-1), LEVEL 38 (-48), LEVEL 45 (-20), LEVEL 55 (-8), BONUS 10 (-51), BONUS 11 (-38), FINAL 10 (-3), LEVEL 76 (-9), LEVEL 79 (-21), LEVEL 94 (-3), LEVEL 112 (-9), BONUS 22 (-21), HIDDEN 8 (-7), LEVEL 131 (-1), LEVEL 149 (-30). Against them, levels where the word is the count exactly: LEVEL 1 to 7, 9 to 15, all of HIRO's bonus levels, LEVEL 61, 62, 64, 65, LEVEL 139, 140, 142 to 144, 147.

Then find where the engine reads the word, which it reaches through a pointer rather than by the lattice's size as an immediate, so `tools/mips.py` has to be walked from the loader.
