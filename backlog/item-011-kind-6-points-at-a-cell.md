# 11. Kind 6 carries a cell, in 1/512 units

**Status:** open · **Effort:** small-medium · **Filed:** reading the laser records in `LECEL 94`, 2026-09-10 · **Remeasured:** 2026-09-11, after the entity framing was corrected

## What and why

`kind 6 / type 1` is the second most numerous entity in the game, 435 of them across 70 levels, and the map says nothing about it beyond the number. Its first three fields are a cell.

Measured 2026-09-11 across all 435, reproducible from `public/map_data.json`:

- **Every one of the three fields divides by 512**, and every quotient lands in `0..33`. No exceptions, no remainders.
- **Every cell they name is a cell the level's lattice carries.** 435 of 435. A field that is a position by accident does not land on a placed block 435 times.
- **431 of them name another `6/1`**, and the other four name a `9/0`.
- **Following the pointers from any of the 435 comes back to a cell already walked.** They are rings.

The first reading of this, under the entity framing that paired each payload with the cell one slot behind, had 248 pointing at another `6/1` and none of the chains closing, which read as paths ending on a coin or a key. That was the off-by-one, not the data: with each entity on its own cell the chains close. `LECEL 94` (`/ATLANT/ATLANT.PAK#3`) is the smallest place to read one: sixteen blocks, sixteen entities, two rings.

## Why it matters

A ring of cells, each naming the next, is a circuit: the path something travels round, or the order something is visited in. Whatever it is, the map currently draws each link as an unrelated marker, so the shape of the thing is invisible even though the data is already parsed and in hand. The beams of [10](item-010-the-cell-does-not-hold-its-record.md) were the same shape of finding and turned out to be geometry the lattice does not carry.

## Sketch

The unit is the lead. 512 is not the 256 that shows up in `f12` elsewhere in an entity, so whatever writes these is not sharing that scale, and 512 sub-units to a block is the kind of number a position gets when it has to interpolate between cells. Check whether the remaining fields hold a speed or a dwell, and what the four that point at a `9/0` are doing that the rest are not.

`?survey` settles what it is faster than the disc will: mark what actually moves in a level that has a long chain, and the answer is either along it or it is not. `tools/kula_kinds.py` writes the contact sheet of where `6/1` is placed, and `tools/kula_warp.py` reaches any level that is awkward to play to.

## Ruled out

**That the fields are a raw position.** They are 512 times one, and reading them as cells directly puts every record outside the lattice.
