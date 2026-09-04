# Kula World Map

An interactive map of every level in **Kula World** (PlayStation), read straight off the disc: the block lattice each level is built from, every object the game places on it, and the level's own name, time and start.

All 230 levels are here, which is more than the game ever shows you in one place: 150 numbered levels across ten worlds, 30 bonus and 10 hidden levels, the 20 finals, the 10 Simon rooms and the lesson.

The data is read from the NTSC-U release, sold as **Roll Away** (SLUS-00724). The same game shipped as Kula World in PAL territories and Kula Quest in Japan; the level data is the game's own and applies to all three.

Part of [RetroAtlas](https://retroatlas.org/), a collection of interactive maps of classic games.

## Using the map

- **Pan** by dragging or with the arrow keys, **zoom** with the wheel, a pinch, or `+` / `-`.
- **Rotate** the view a quarter turn with `q` and `e`. A lattice has no single right side to look from, so the map lets you walk around it; the rotation travels in the URL with everything else.
- **Slice** the level with `,` and `.`, which lower and raise a ceiling so you can see inside a stack. `\` puts the whole level back.
- **Click** a block or an object for what the game stores about it: its lattice cell, its kind and type, and the raw fields the record carries. `Esc` clears.
- **Search** with `/`: a level by name or number (`level 42`, `bonus`, `final 7`), a world by name (`inca`), an object kind by number or curated name, or a bare `x,y,z` to jump to a cell.
- `[` and `]` step through the levels of the current world; `Shift` with either crosses into the next.
- The URL is a permalink: `#L42/17,12,17/0.9/1/33` is level, centre, zoom, rotation and slice.

## What the disc stores, and what it does not

Every level is one zlib record inside its world's `.PAK`, and inflates to a fixed **34 x 34 x 34 lattice** of `u16` cells followed by a table of 256-byte records. A cell holds `0xFFFF` for empty, `0` for a plain block, and `5 + i` for a block carrying record `i`; the record repeats the cell's own coordinates, which is what pins the two together. That cross-check passes on all 5540 of the game's records, which is the evidence the layout is right rather than merely plausible.

A record holds up to six 32-byte entities, though only the first is used except on a handful of levels. An entity is a position, a `kind` the engine dispatches on, a `type` within that kind, and eleven more fields whose meaning follows from the kind.

Every level ends with exactly one record of kind **666**, carrying the start position, a second position it looks at, two angles and a number that is 99 on 207 of the 230 levels and lower on a dozen of the numbered ones. That reads as the level's time, and the map shows it as such.

**What is not decoded is the artwork.** Each world's `.TGI` holds its textures, 6.2 MB across the ten of them, and none of it is read yet: the map draws the lattice in each world's palette rather than in its own skin. The structure, the objects and the routes are all real; only the surface is stand-in.

**Object kinds ship as the game's own numbers.** The game names none of them, so [`public/annotations.json`](public/annotations.json) is where identified names go, per kind or per (kind, type) pair, and the viewer falls back to `kind 6 / type 1` for anything unnamed and says so in the detail panel. This mirrors OddworldMap, which curates its place names the same way.

**Naming them is a job you can do by eye**, because a kind's meaning shows in where it sits. `python3 tools/kula_kinds.py` writes a contact sheet per kind: which levels place it, how many, and what sits around it.

## Rebuilding from the disc

The disc is never committed. Point `$KULA_DISC` at a raw 2352-byte-sector `.bin` image:

```bash
export KULA_DISC="/path/to/Roll Away.bin"
python3 tools/kula_build.py
```

That writes `public/map_data.json`, which is generated **and committed**, so regenerate it rather than hand-editing. A full build takes about four seconds, and the file is indented so that a rebuild diffs line by line.

To serve the viewer locally:

```bash
python3 tools/serve.py
```

## What is in `tools/`

Dependency-free Python 3, standard library only.

| | |
| --- | --- |
| `disc.py` | a raw PS1 image as an ISO9660 tree, addressed by full path |
| `kula_disc.py` | where this game keeps its packs, textures and executable |
| `kula_pak.py` | the `.PAK` container, and the names inside it |
| `kula_level.py` | the lattice and the record table, field by field |
| `kula_build.py` | reads every level and writes `public/map_data.json` |
| `kula_kinds.py` | per-kind contact sheets, for naming objects |
| `mips.py` | disassemble the executable, which is how the lattice was pinned down |
| `serve.py` | local static server, caching off |

## The viewer

`public/` is the deploy artifact: dependency-free ES modules, no build step. `js/main.js` boots, `js/state.js` holds shared state and the lattice-to-screen projection, and modules talk through the `emit`/`on` pair in `js/dom.js` rather than importing each other both ways.

## Licensing

Copyright (C) 2026 mariobob, under GPL-2.0 (see [LICENSE](LICENSE)). The licence covers the code here and nothing else: the tooling ships no game code, and the extracted level data is © the rights holders in Kula World, presented for research and preservation. A rights holder who wants something taken down can write to hello@retroatlas.org.
