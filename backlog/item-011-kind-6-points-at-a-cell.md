# 11. Kind 6 carries a cell, in 1/512 units

**Status:** remeasured 2026-09-13, open · **Effort:** small · **Filed:** reading the laser records in `LECEL 94`, 2026-09-10

## What and why

`kind 6 / type 1` is the second most numerous record in the game, 435 of them across 70 levels, and the map says nothing about it beyond the number. Its first three fields are a cell in 1/512 units.

Measured 2026-09-13 across all 435, reproducible from `public/map_data.json`:

- **Every one of the three fields divides by 512**, and every quotient lands in `0..33`. No exceptions, no remainders.
- **Every one names the record's own cell.** 435 of 435.

The two earlier readings of this were both artefacts. Under the entity framing that paired each payload with the cell one slot behind, the fields read as pointing one record along, which looked like paths; with each record on its own cell the lookup found the kind 9 record standing on four of the same cells, which looked like rings. The field is the block's own position, kept as a fixed-point copy, and a kind 5 record keeps the same copy at the end of its record next to three words of `256`.

## Why it matters

A block that keeps its own position in fixed point is a block that moves, and the game has moving platforms. If that is what kind 6 is, the map draws 435 of them as a marker on a block and says nothing about the motion, and the rest of the record, which the other kinds leave unset, is where the path would have to be.

## Sketch

`?survey` settles what it is faster than the disc will: mark what actually moves in a level that has several, and the answer is either kind 6 or it is not. `tools/kula_kinds.py --kind 6` writes the contact sheet of where it is placed, `tools/kula_faces.py --kind 6 --dump 8` prints whole records, and `tools/kula_warp.py` reaches any level that is awkward to play to. Kind 5, which names two cells the way a laser does and keeps the same fixed-point copy, is the other candidate for a platform on a rail.

## Ruled out

**That the fields are a raw position.** They are 512 times one, and reading them as cells directly puts every record outside the lattice.

**That they point at another record.** They point at the record's own cell, all 435; the paths and rings were the framing and the lookup, not the data.
