# 7. The six-slot record reading, and why it held

**Status:** closed 2026-09-05 · **Filed:** repo review, 2026-09-05

## What happened

A record was read as six 32-byte entity slots, keeping any slot whose first three words fell in `0..33`. That is a range test, and the game zeroes 51 records from byte 32 on, so every group of those read back as a placed entity at `(0, 0, 0)`. 255 phantom objects shipped in `map_data.json`.

## Why it survived

Because the artefact was symmetric. The phantoms landed 51 in each of five slots, and that even spread was written down as *the evidence for the rule*: "with that rule the five secondary slots hold exactly 51 entities each, and slot 2 stops being an outlier at 107." A rule that produces an implausibly tidy result is being confirmed by its own failure mode.

It also propagated: "92 cells in the game carry more than one entity, and a block has one skin, so those records are things standing on the block" was written down as the reason a record cell draws the plain stone. The number 92 is in none of the data under any reading; the true count of records holding more than one entity is zero.

## What replaced it

One entity per record, and `Level.verify` asserting that the seven trailing groups never hold a position, which a range test cannot do. The conclusion the bad number supported survives on other ground: a cell holds either a style or a record index and never both, and the record every level ends with carries the start, the look-at, the angles and the time while 70 of the 230 levels name it from a lattice cell like any other. One table cannot be both a skin table and that.

## What to take from it

A count that makes an argument goes in a test, not only in prose. Ten of the README's now do. And a symmetry is not evidence until you have asked what else would produce it.
