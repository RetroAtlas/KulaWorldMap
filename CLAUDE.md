# CLAUDE.md

Guidance for AI agents working in this repo. Read [README.md](README.md) first, which covers what this is and how to rebuild it. This file records what is not obvious from the code.

## The one thing to know

The lattice is **fixed at 34 x 34 x 34**, and the index is `x*1156 + y*34 + z`. This was not guessed: the executable's own level walk at `0x00033f6c`-`0x00034054` is three nested loops each bounded by `slti ..., 34`, stepping the inner pointer by 1, the middle by 34 and the outer by 1156, and reading `lh` against `-1`. `tools/mips.py` will show it. `z` is the vertical axis, which the extents confirm: it is the thinnest of the three on 160 of the 230 levels. **It counts downward**, so the smallest `z` in a level is its highest block and the viewer projects screen up against it. That came from play: `OBJ LEVEL` puts one block at `z=14` against a floor of 114 at `z=17`, and in the game that block floats above the floor. A level that is one flat plane cannot show this, which is why it went unnoticed while only the first two were being checked. **Seen from above with `x` to the right, `y` counts down the page.** That is the handedness, and no cross-check on the disc can fix it, because a mirror image reads as cleanly as the original; what fixes it is lettering. `HIDDEN 10` spells VERY WELL DONE across its floor, and it reads that way round and no other, which is also the way LEVEL 1 and LEVEL 2 come out when drawn from play.

Do not re-derive this by pattern-matching on file sizes. Level records vary in length only because the entity table does, and several plausible-looking size relations fit a handful of levels and then fall apart. The check that actually holds is the one the build asserts: an entity repeats the coordinates of the cell that points at it, on all 5540. Keep that assertion in `tools/kula_build.py` and keep it fatal. It has already caught one wrong reading, that every non-zero cell names an entity, when in fact the five values below 5 are block styles carrying none. It did not catch the other, which is the next section.

## An entity ends with its position

The six bytes after the lattice are the level header: an `i16` that equals the placed-cell count on 79 of the 230 levels and is unexplained on the rest, an `i16` that is `0` or, on sixteen levels, `-1`, and a `u16` entity count. It ships as `header` and `flag`, unnamed, and nothing in the viewer presents either as a count; what the viewer shows as a level's blocks is `placed`, derived by counting the lattice.

Then come `count + 1` slots of 256 bytes. Read each as *kind, type, eleven fields, seven 32-byte groups, and then the three words of the cell the entity stands on*: **the position closes an entity, it does not open the next one.** The first slot's position words are where the header sits, so the first entity's payload is not padding. The last slot is kind 666 and where its position would be the disc writes three `0xFFFF`, on all 230 levels: it stands on no cell. It carries a cell for the camera to look at, two angles and the level's time, and ships as `camera`.

Framing the slots the other way round, position first, reads cleanly and pairs every payload with the cell one slot behind it. `Level.verify` cannot tell the two apart, because the positions come out in the same order either way; that check is necessary, and it is what caught the block-style reading, but it is not sufficient. What settled the framing was play: under the wrong one LEVEL 2's key read as its first coin, LEVEL 1's two coins sat on the same rail when the game has them on opposite rails, and LEVEL 109's first laser read as its second. Under the right one every cell of both levels matches what the game shows.

## Entities that are not there

The seven 32-byte groups inside an entity look like entities and are not: across all 39,900 of them in the game the first and third words take no value but `-1` and `0`, so no group is ever a position. Most of what they hold is undecoded and varies per entity rather than per kind; for a laser, the second word of the first group is the beam's colour.

Do not reach for a range test here. 51 entities are zeroed past their fields, which puts a perfectly lattice-shaped `(0, 0, 0)` in all seven of their groups: a rule that admits any position in `0..33` reads a phantom object out of every one of those groups, exactly 51 to a group, and that even spread reads as a symmetry confirming the rule rather than as the artefact it is. `Level.verify` asserts the `-1`/`0` invariant on every entity so the reading cannot quietly come back.

`tools/kula_tail.py` reports what the seven do hold, across the whole game rather than a level or two. They are entity-shaped, they are a list rather than a struct, and their length varies per entity; [backlog/item-002](backlog/item-002-the-unread-record-bytes.md) has the measurements and what they rule out. It is the largest unread thing on the disc and the likeliest home for the block-skin field the artwork spike is missing.

## Blocks and the things on them

A lattice cell below `firstRecord` is a block style, and the five styles are models 7 to 11 of the shared table in the artwork file, which is where `tools/kula_tex.py` gets them. A cell at or above it names an entity instead, so a block carrying one has no style of its own and the entity would have to supply it. What stands on a cell is the entity it names, and LEVEL 1 and LEVEL 2 confirm every cell of it in play: `0/37` is the bronze coin, `0/31` the key, `0/30` where the ball starts, `0/46` the fruit and `0/7` the exit.

A level is wider than its lattice. A `kind 8` entity spans a beam between two cells it names in its own fields: on all 117 in the game the pair differs on exactly one axis, one field gives that axis and another says whether the beam starts lit, and no block ever stands between the two ends. The beam's colour is the second word of the entity's first trailing group, a circuit number the switches of that colour share; LEVEL 109 lines five of them up as red, yellow, green, yellow, red and the word reads `3, 0, 2, 0, 3`. The fourth value the game uses has not been seen lit. **61 of the 234 ends are cells the lattice leaves empty**, and the game stands a block on each anyway, which `OBJ LEVEL` shows in play: it carries one lattice block above its floor and the game draws two, joined by a beam. So `placed` counts the lattice and the lattice alone, and the viewer adds the ends a beam names. Which end holds the emitter, and what tells the six types apart beyond the axis, are not decoded.

The entity table is not a skin table: it holds coins, keys and beams, and its last entry stands on no cell at all. So every cell draws a style and what stands on it is a marker, and which skin an entity-carrying block really wears is open.

## Conventions

- [`backlog/`](backlog/) is where an open question goes when the gap between finding it and resolving it is long enough for the reasoning to be forgotten. Read it before starting anything large: most of what is left to learn about this game is filed there, with what has already been ruled out.
- The deployed site is `public/`, and the host serves that directory, so repo artefacts (`README.md`, this file) cannot ship by accident. `.github/workflows/static.yml` matches the sibling projects verbatim, action versions included.
- Dependency-free ES modules, no build step, no framework. The page must work when opened from a plain static server.
- `public/map_data.json` is generated by `tools/kula_build.py` and committed. Never hand-edit it; change the tool and rebuild.
- `public/annotations.json` is the opposite: hand-curated, never generated. It is where names for the game's numbered kinds go, and the viewer treats a missing name as normal rather than as an error.
- Images are compressed on the way out, never in a follow-up commit: `tools/png.py` writes RGB wherever the alpha says nothing and runs `oxipng` over what it wrote, and `tools/ogcard.js` does the same to the card it renders. Without `oxipng` on PATH the build still produces a correct file, only a larger one, so do not commit one built that way.
- The disc is never committed, and `.gitignore` keeps `*.bin` and `*.cue` out.
- `?survey` on the viewer opens the notebook behind the map: click a block to write down what the game really shows on it, then copy or download the marks. A mark is keyed to the lattice cell and nothing else, never to an entity, which is what lets a decode be scored against it rather than confirmed by it. Marks live in `localStorage` until exported, and the deployed page keeps the panel hidden without the flag.

## Naming

The game numbers its levels straight through the worlds (`LEVEL 1`-`LEVEL 150`) and keeps the bonus, hidden, final, Simon and lesson levels in the same packs under their own names. Those names are the game's own, spelling included: Atlantis really does contain a `LECEL 94`, and Hell numbers its levels 135-150 while Mars ends at 135 too, so a level number is not a unique key. **The pack path plus the index inside it is the key**; the name is for display.

World ids are the disc's directory names (`HIRO`, `ATLANT`, ...), and that is all the game has: the executable's only mention of a world is the path it loads the pack from, so the disc supplies no player-facing world name at all. A friendlier name is therefore a curated override with a source outside the disc, and it goes in `annotations.json` under `worlds`, never baked into the data or invented to fill the gap. The viewer already falls back to the id, which is why the gap costs nothing.

## Code comments

Match the sibling repos: default to none, comment only where the code is genuinely hard to follow, and never reference the history of the code. A comment must not need editing when a constant is tuned or a kind is added, so do not enumerate kinds or restate values in prose.
