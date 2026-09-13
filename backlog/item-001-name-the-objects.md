# 1. Name the game's objects

**Status:** mostly resolved 2026-09-13, a survey still owed · **Effort:** medium, mostly away from the keyboard · **Where:** an emulator, then `public/annotations.json`

**2026-09-13.** Named from Syonyx's Roll Away walkthrough (GameFAQs, 2006, not in the repo) rather than from a sitting in the emulator: for each thing the walkthrough introduces, the level it introduces it on carries the game's first placements of one type or kind and nothing else new, and the maximum scores it states pin the points, which `tools/kula_score.py --guide` checks. 26 of the 30 object types and every block kind but 4 are named that way; each note in `annotations.json` says what it rests on. What the survey still has to settle: the coin tiers' colours (the 250 kind read bronze in play and the 750 kind gold in a screenshot, and the walkthrough calls the 500 kind blue); which of types 50 and 52 is the fast short-spiked captivator and which the slow long-spiked one; and types 29 (two placements), 34 and 42 (catalogue only) and block kind 4 (catalogue only), which the walkthrough never meets.

## What and why

The game names none of its objects, so the map says `type 37` where it should say what the thing is. 30 object types are placed across the game, on any of a block's six faces, and five of them are named, plus one kind of record. This is the single largest gap between this map and its sibling, whose tooltips read as English because someone curated them.

Nothing about it is hard, only unautomatable: a type's meaning shows in where it sits and what it looks like, and looking is the job.

## Sketch

`OBJ LEVEL` is the developers' own catalogue, shipped unchanged in nine of the ten worlds and never reached in play. It is a flat floor at z=17 carrying 36 objects, all on top, covering 23 of the game's 30 types.

```bash
python3 tools/kula_objlevel.py     # out/obj-level.md: the floor plan and the sheet
python3 tools/kula_kinds.py        # out/kinds.md: where each kind sits, and what is around it
```

Walk it in an emulator with a level warp or a save state, fill the sheet's last column, and write the names into `annotations.json` under `types`, keyed by the type number. The seven types the catalogue misses are placed 125 times between them and have to be named from a real level; `out/obj-level.md` lists them.

Names go under `types` per object type, or under `kinds` for a record that is its own thing, a laser for one. The viewer treats a missing name as normal, so this can land a few at a time.

## Ruled out

**Guessing from the field statistics alone.** `out/kinds.md` narrows what a type could be but cannot settle it, and a wrong name is worse than a number. The one name that was guessed, a blue coin for type 0, was a bare top face with the object on another side, and it stood for a week.
