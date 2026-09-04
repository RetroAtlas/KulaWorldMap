# 2. Read the 224 bytes after a record's entity

**Status:** open · **Effort:** medium-large · **Where:** the disc, plus `tools/mips.py`

## What and why

A record is 256 bytes. The first 32 are the entity the map draws. The other 224 are read by nothing, in either the tooling or the map, and there are 5,700 records: **about 1.2 MB of the game's own level data that no one has looked at.**

They are not filler. Measured 2026-09-05 across all 39,900 of the seven trailing 32-byte groups:

- the first and third words take no value but `-1` and `0`, so no group is ever a position
- the second word carries a number from a vocabulary of six: `-1`, `-100`, `0`, `100`, `30`, `-17`
- group 7 is `-1` throughout, on every record but the 51 that are zeroed
- 51 records are zeroed from byte 32 on, which is what made a range test read 255 phantom objects out of them ([7](item-007-the-six-slot-misreading.md))

`Level.verify` asserts the `-1`/`0` invariant on every build, so a reading that contradicts it will say so.

## Why it matters

[SPIKE-TGI.md](../SPIKE-TGI.md) names "which texture goes on which block face" as the open question and assumes the answer is somewhere in the 32-byte entity. It may be here instead. A record-carrying cell has no style of its own, so something has to say what it wears, and this is the unexamined space.

## Sketch

The record table is walked by the engine somewhere; find the loop the way the lattice walk was found, with `tools/mips.py`, and read the offsets it touches. `-100`, `100` and `30` look like an angle or a speed rather than an index, so a field that is only ever one of six values is a small enum and the caller will say which.
