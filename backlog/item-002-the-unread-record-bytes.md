# 2. Read the 224 bytes after a record's entity

**Status:** resolved 2026-09-13 · **Effort:** medium-large · **Where:** the disc, plus `tools/mips.py`

**Resolution, 2026-09-13.** The 224 bytes are the other five faces of the block, and the 32 before them are the first. A record is a block: a kind word, then six 32-byte slots in the order `-z +x +y -y -x +z`, each a kind word, a type, eleven fields, a pad, a value and a pad, and a slot whose type is not zero is an object standing on that face. What was read as the entity was slot 0, the top face, and the "groups" were the other slots misaligned by three words, which is why their `type`, `f5`-`f15` and `y` (the value word) carried the entity's own vocabulary and their `x`, `z` and `kind` never did: a face has no position of its own, and the kind word is the block's. The reading ruled out below, further objects on the same block, was the right one; what was wrong with the six-slot reading of [7](item-007-the-six-slot-misreading.md) was giving each slot a position, not giving each slot an object. The order of the six was fixed by LEVEL 1 and 2 (slot 0, the top), HIDDEN 10 (slot 3, the `-y` face of its frame in play) and the lasers, whose type is the direction from their block to the far end on all 123; and under it 8 of the 5885 objects on blocks of the four plain kinds would sit inside a neighbouring block, against 94 for the next best of the 720 orders. `tools/kula_faces.py` reports what the slots hold; CLAUDE.md carries the reading. The kind word was settled the same day, see [4](item-004-block-styles.md): it is the block's kind, the same enumeration as the lattice styles. What the value word means stays open; it goes with the type (-100 on coins, keys and sunglasses, 100 on fruit, pills and hourglasses, 30 on exits and teleporters, -17 on gems, 0 on the rest) and reads like a height or a spin rather than a score.

**2026-09-11.** For a laser, the second word of the first group is its colour, a circuit number: LEVEL 109's five beams read `3, 0, 2, 0, 3` and the game shows red, yellow, green, yellow, red. The measurements below were taken under the earlier framing of the table, which paired each group set with the position one slot behind it; the groups themselves sit in the same bytes under either framing, so the counts stand.

## What and why

A record is 256 bytes. The first 32 are the entity the map draws. The other 224 are read by nothing, in either the tooling or the map, and there are 5,700 records: **about 1.2 MB of the game's own level data that no one has looked at.**

They are not filler. Measured 2026-09-05 across all 39,900 of the seven trailing groups, reproducible with `python3 tools/kula_tail.py`:

- **They are entity-shaped.** Read on the entity's own layout, the words that carry anything are `type`, `f5`-`f15`, and the one at `y`; and their vocabularies match the entity's. `f12` is `386`, `256`, `500`; `f13` is `0` to `3`; `type` is `37`, `36`, `2`, `1`. Those are the same values the first group's fields take.
- **They are never a position.** `x` and `z` take no value but `-1` and `0` in any of the 39,900, and `kind` is `-1` on 25,193 of the 25,601 live ones, so the engine cannot be dispatching on them.
- **They are a list, not a struct.** The live ones form a prefix on 5,658 of the 5,700 records: groups 1..n are on and the rest are `-1`. The length is strongly moded at five (3,710 records), then six (1,056) and none (616).
- **The length varies per instance, not per type.** 1,961 distinct tails across 5,700 records, and `kind 0 / type 0` alone has 991 of them; only 46 of the 103 kind/type pairs have one tail across all their records. So this is data, not a template the game stamps in.
- **`y` is the odd one out**, taking a six-value vocabulary of `-100`, `100`, `30`, `-17`, `20`, `0`, which reads as an angle or a speed rather than an index.
- 51 records are zeroed from byte 32 on, which is what made a range test read 255 phantom objects out of them ([7](item-007-the-six-slot-misreading.md)).

`Level.verify` asserts the `x`/`z` invariant on every build, so a reading that contradicts it will say so.

## Why it matters

[docs/tgi.md](../docs/tgi.md) names "which texture goes on which block face" as the open question and assumes the answer is somewhere in the 32-byte entity. It may be here instead. A record-carrying cell has no style of its own, so something has to say what it wears, and this is the unexamined space.

## Sketch

Start from the engine. The record table is walked somewhere; find the loop the way the lattice walk was found, with `tools/mips.py`, and read which offsets within the 256 it touches. A field that takes only six values is a small enum and the caller will name it.

`python3 tools/kula_tail.py --kind 0 --type 37` narrows the same report to one kind, and `--dump 4` prints whole records with the groups laid out in rows, which is the readable form.

## Ruled out

**That the groups are further objects standing on the same block.** It is the obvious reading of an entity-shaped group, and it is what the six-slot reading amounted to. Their `kind` is unset on all but 408 of 25,601, and an entity the engine cannot dispatch on is not an object. *Wrongly ruled out, see the resolution: the kind word is the block's, not the object's, so a face was never going to carry one.*

**That the tail is a per-type template.** Ruled out by the 991 distinct tails on `kind 0 / type 0`.
