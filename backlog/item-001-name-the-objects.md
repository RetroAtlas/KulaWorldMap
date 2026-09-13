# 1. Name the game's objects

**Status:** open · **Effort:** medium, mostly away from the keyboard · **Where:** an emulator, then `public/annotations.json`

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
