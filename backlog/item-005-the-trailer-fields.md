# 5. The two unnamed fields in the trailer

**Status:** open · **Effort:** small · **Where:** the disc

## What and why

The level trailer holds two numbers the map ships without naming:

- **`header`**, an `i32` at the head. It equals the placed-cell count on 79 of the 230 levels, is negative on 16 (down to -51) and is unexplained on the rest. It ships as `header`, and nothing in the viewer presents it as a count: reading it as unsigned once put "4294967276 blocks" on the chip for Inca's LEVEL 45, which is how the sign was caught.
- **`flag`**, a `u16` after the record count, zero on all but 24 levels.

Twenty-four levels is a small enough set to look at by hand, and whatever the flag marks they will have in common.

## Sketch

List the 24 and the 16 and look for what they share: world, pack, level kind, extents. Then find where the engine reads `GRID_BYTES + 0` and `GRID_BYTES + 6`.
