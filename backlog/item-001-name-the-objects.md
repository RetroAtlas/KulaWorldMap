# 1. Name the game's objects

**Status:** open · **Effort:** medium, mostly away from the keyboard · **Where:** an emulator, then `public/annotations.json`

## What and why

The game names none of its objects, so the map says `kind 0 / type 37` where it should say what the thing is. 78 kind/type pairs are placed across the game and exactly one of them is named. This is the single largest gap between this map and its sibling, whose tooltips read as English because someone curated them.

Nothing about it is hard, only unautomatable: a kind's meaning shows in where it sits and what it looks like, and looking is the job.

## Sketch

`OBJ LEVEL` is the developers' own catalogue, shipped unchanged in nine of the ten worlds and never reached in play. It is a flat floor at z=17 carrying 44 objects covering 28 of the game's 35 types.

```bash
python3 tools/kula_objlevel.py     # out/obj-level.md: the floor plan and the sheet
python3 tools/kula_kinds.py        # out/kinds.md: where each kind sits, and what is around it
```

Walk it in an emulator with a level warp or a save state, fill the sheet's last column, and write the names into `annotations.json` under `types`, keyed `kind/type`. The seven types the catalogue misses are placed 45 times between them and have to be named from a real level; `out/obj-level.md` lists them.

Names go under `types` per pair, or under `kinds` where a whole kind means one thing. The viewer treats a missing name as normal, so this can land a few at a time.

## Ruled out

**Guessing from the field statistics alone.** `out/kinds.md` narrows what a kind could be but cannot settle it, and a wrong name is worse than a number.
