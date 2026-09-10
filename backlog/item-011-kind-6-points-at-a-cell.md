# 11. Kind 6 carries a cell, in 1/512 units

**Status:** open · **Effort:** small-medium · **Filed:** reading the laser records in `LECEL 94`, 2026-09-10

## What and why

`kind 6 / type 1` is the second most numerous record in the game, 432 of them across 70 levels, and the map says nothing about it beyond the number. Its first three fields are a cell.

Measured 2026-09-10 across all 432, reproducible from `public/map_data.json`:

- **Every one of the three fields divides by 512**, and every quotient lands in `0..33`. No exceptions, no remainders.
- **Every cell they name is a cell the level's lattice carries.** 432 of 432. A field that is a position by accident does not land on a placed block 432 times.
- **248 of them name another `6/1`.** The rest name an object cell of some other kind, most often a coin.
- **Following the pointers never comes back to a cell already walked**, on any of the 432. They are paths that end on a record of some other kind, not rings.

`LECEL 94` (`/ATLANT/ATLANT.PAK#3`) is the smallest place to read one: sixteen blocks, sixteen records, and two chains, one ending on a `kind 5` and one on the fruit.

## Why it matters

A chain of cells that terminates on an object reads as a route: what the thing at the end travels along, or what order something is visited in. Whatever it is, the map currently draws each link as an unrelated marker, so the shape of the thing is invisible even though the data is already parsed and in hand. The beams of [10](item-010-the-cell-does-not-hold-its-record.md) were the same shape of finding and turned out to be geometry the lattice does not carry.

## Sketch

The unit is the lead. 512 is not the 256 that shows up in `f12` elsewhere in an entity, so whatever writes these is not sharing that scale, and 512 sub-units to a block is the kind of number a position gets when it has to interpolate between cells. Check whether the remaining fields hold a speed or a dwell, and whether the head of a chain is the link a lattice cell names rather than a middle one.

`?survey` settles what it is faster than the disc will: mark what actually moves in a level that has a long chain, and the answer is either along it or it is not. `tools/kula_kinds.py` writes the contact sheet of where `6/1` is placed, and `tools/kula_warp.py` reaches any level that is awkward to play to.

## Ruled out

**That the fields are a raw position.** They are 512 times one, and reading them as cells directly puts every record outside the lattice.
