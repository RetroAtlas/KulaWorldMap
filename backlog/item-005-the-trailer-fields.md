# 5. The unnamed word at the head of the trailer

## What and why

The level header holds one number the map ships without naming: **`header`**, a signed 32-bit word before the record count. It equals the placed-cell count on 79 of the 230 levels, is negative on 16 (down to -51) and is unexplained on the rest. Nothing in the viewer presents it as a count: reading it as unsigned once put "4294967276 blocks" on the chip for Inca's LEVEL 45, which is how the sign was caught.

Sixteen levels is a small enough set to look at by hand, and whatever a negative value marks they will have in common.

## Sketch

List the 16 and the 79 and look for what they share: world, pack, level kind, extents. Then find where the engine reads the word, which it reaches through a pointer rather than by the lattice's size as an immediate, so `tools/mips.py` has to be walked from the loader.
