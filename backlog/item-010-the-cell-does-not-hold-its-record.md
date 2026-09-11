# 10. The object on a block is not the record the block names

**Status:** resolved 2026-09-11 · **Filed:** playing LEVEL 1 and LEVEL 2 against the map, 2026-09-06

**Resolution.** The block does hold its entity; the reader was pairing each payload with the position one slot behind it. An entity's position is the *last* six bytes of its 256, not the first, and the six bytes that open the table are the level header, not padding: the first entity's payload was never being read at all, and the last slot's payload, the camera record, was being given the last object's cell as its position. `Level.verify` passes under both framings because the positions stay in order either way, which is exactly why the contradiction below could not be argued away and had to be settled in play. Under the corrected reading every cell of LEVEL 1 and LEVEL 2 carries what the game shows on it, with one type to a thing: `0/37` coin, `0/31` key, `0/30` start, `0/46` fruit, `0/7` exit. The account below is kept as it was written, because the reasoning that ruled out every other explanation is what made the framing the only one left.

## What and why

The map draws each cell's marker from the record that cell names. That is wrong, and LEVEL 1 disproves it from the game side in one measurement.

LEVEL 1 is a ladder: rails at `x=17` and `x=20` running `y=12..18`, rungs at `y=12`, `y=15`, `y=18`. Six cells name records. Measured in play: the ball starts at a corner, and the first object along its own rail is **two** blocks away. Only one corner fits. On `x=17` the objects sit 2 and 6 from `(17,18)`; on `x=20` they sit 3 and 5 from `(20,18)`. So the ball starts at `(17,18,17)` — which the file has as record 2, a `0/37` — and the kind-666 record at `(20,18,17)` is not the start.

The coin two blocks along is then `(17,16,17)`, record 1, a `0/30`. **LEVEL 2 has six bronze coins and exactly one `0/30`.** One of those two readings has to give, and no relabelling of `type` saves either.

Two independent findings say the same thing:

- **No type is the exit.** Every playable level has exactly one, and no family of one, two or three kind/type pairs totals exactly one in all 230 levels. So `type` does not name objects.
- **The record has nothing left in it.** All 256 bytes of every record in both levels were dumped 2026-09-06. Past the 32-byte entity the only word that varies is one in group 1, and it is a function of `type` (`37`→`-100`, `30`→`0`, `31`→`-100`, `46`→`100`, `7`→`30`). In LEVEL 1 records 0 and 2 are identical apart from a counter, so nothing in the file can make one an exit and the other a start. See [2](item-002-the-unread-record-bytes.md).

## Why it matters

Every name in `annotations.json` under `types` rests on counting `0/37` against a level and finding two. The counts still match; the placements do not, which is the shape of a mapping that is right in aggregate and wrong per cell. Until this is settled the map states object identity with a confidence it has not earned, and [1](item-001-name-the-objects.md) and [9](item-009-draw-the-objects.md) are both building on it.

## Sketch

Start from the engine, the way the lattice walk was. The walk is at `0x00033f6c`-`0x00034054`; the loop that strides the record table by 256 will be near it. Read which offsets within a record it loads and what it dispatches on. That names the object field and says how a cell resolves to a record, and it cannot be fooled by a level whose shape is symmetric.

Feed it ground truth rather than argument: `?survey` records what a level really shows, cell by cell, and exports it. `/HILLS/HILLS.PAK#19` is the level to survey first — one of nearly every object on a flat floor, 44 of them, and [out/obj-level.md](../out/obj-level.md) already has the plan to check against. A survey of it names every type and pins the position decode in the same pass.

## Ruled out

**That the viewer misplaces the markers.** Each marker is drawn on the cell whose value names its record, and in a plan view the cells the file marks match the played level exactly, six of six in LEVEL 1 and ten of ten in LEVEL 2. It is which object, not which block.

**That an orientation fixes it.** All eight symmetries of the level box were searched against both levels' played layouts, crossed with record-index offsets of -3 to +3. No combination yields a consistent type-to-object map.

**That `Level.verify` pins the pairing.** It checks that the cell valued `5 + k` carries record `k`'s coordinates. Cell values are assigned in lattice order in all 230 levels, and every record's coordinates are in the same order, so the check passes for the whole family of pairings that preserve that order. It caught a wrong reading once and is worth keeping, but it is not evidence here.
