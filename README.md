# Kula World Map

An interactive map of every level in **Kula World** (PlayStation), read straight off the disc: the block lattice each level is built from, every object the game places on it, and the level's own name, time and start.

All 230 levels are here, which is more than the game ever shows you in one place: 150 numbered levels across ten worlds, 30 bonus and 10 hidden levels, the 20 finals, the 10 Simon rooms and the lesson.

The data is read from the NTSC-U release, sold as **Roll Away** (SLUS-00724). The same game shipped as Kula World in PAL territories and Kula Quest in Japan; the level data is the game's own and applies to all three.

Part of [RetroAtlas](https://retroatlas.org/), a collection of interactive maps of classic games.

## Using the map

- **Drag to turn the level.** A lattice has no side that is the right one to look from, so dragging orbits the camera around it rather than sliding the view: left and right swing around, up and down raise and lower the eye between looking along the floor and looking straight down. `q` and `e` snap the swing to 45°, and `f` frames the level again.
- **Pan** with shift-drag, a right-drag, two fingers, or the arrow keys. If you would rather drag panned all the time, there is a switch for it under Display.
- **Zoom** with the wheel, a pinch, or `+` / `-`, anchored wherever the pointer is.
- **Slice** the level with `,` and `.`, which lower and raise a ceiling so you can see inside a stack. `\` puts the whole level back.
- **Click** a block or an object for what the game stores about it: its lattice cell, its kind and type, and the raw fields the record carries. `Esc` clears.
- **Search** with `/`: a level by name or number (`level 42`, `bonus`, `final 7`), a world by name (`inca`), an object kind by number or curated name, or a bare `x,y,z` to jump to a cell.
- `[` and `]` step through the levels of the current world; `Shift` with either crosses into the next.
- The URL is a permalink: `#L42/45,35/0.90/17,17,17/0,0/33` is level, the yaw and pitch it is turned to, zoom, the cell it orbits around, the pan away from that cell, and the slice.

## What the disc stores, and what it does not

Every level is one zlib record inside its world's `.PAK`, and inflates to a fixed **34 x 34 x 34 lattice** of `u16` cells followed by a table of 256-byte records. A cell holds `0xFFFF` for empty, one of five plain block styles below 5, or `5 + i` for a block carrying record `i`; the record repeats the cell's own coordinates, which is what pins the two representations together. `tools/kula_build.py` checks that on every build and refuses to write if it fails: all 5540 pairs in the game agree, which is the evidence the layout is right rather than merely plausible.

The five styles below 5 are the game's own numbers and carry no record: 4517 cells are style 0, then 1065, 527, 70 and 9 of styles 3, 2, 1 and 4. What tells them apart is not decoded, and the map draws them as shades of the world's tint.

A record holds up to six 32-byte entities, though only the first is used except on a handful of levels: the five secondary slots hold exactly 51 entities each across the whole game. Unused slots are not blanked consistently, so what marks one used is that its position is a cell the lattice has.

An entity is a position, a `kind` the engine dispatches on, a `type` within that kind, and eleven more fields whose meaning follows from the kind. Kind and type are close to orthogonal: the game has only **33 distinct types**, and the same type appears under several kinds.

The field at the head of the trailer is signed, and negative on 16 levels. It matches the placed-cell count on 79 of the 230 and is unexplained on the rest, so the map counts the lattice itself and leaves that field unnamed.

Every level ends with exactly one record of kind **666**, carrying the start position, a second position it looks at, two angles and a number that is 99 on 207 of the 230 levels and lower on a dozen of the numbered ones. That reads as the level's time, and the map shows it as such.

**The artwork is decoded; the map does not draw it yet.** Each world's `.TGI` is a header, eleven sections, and a list of VRAM uploads the game feeds straight to `LoadImage`. Replaying them recovers the page exactly: **56 textures of 64x64 per world**, three 4bpp mip levels of each, and 96 palettes. Section 6 says which palettes each texture wears, and every texture in every world pairs with exactly one triple of them, one per lighting level. `tools/kula_tgi.py --world HIRO --textures` writes the lot.

What is still open is which texture belongs on which block face, which is a question about the level records rather than the artwork, so the map goes on drawing the lattice in a stand-in tint per world. [SPIKE-TGI.md](SPIKE-TGI.md) has the detail and the addresses it came from.

**Object kinds ship as the game's own numbers.** The game names none of them, so [`public/annotations.json`](public/annotations.json) is where identified names go, per kind or per (kind, type) pair, and the viewer falls back to `kind 6 / type 1` for anything unnamed and says so in the detail panel. This mirrors OddworldMap, which curates its place names the same way.

**Naming them is a job you can do by eye**, because a kind's meaning shows in where it sits. `python3 tools/kula_kinds.py` writes a contact sheet per kind: which levels place it, how many, and what sits around it.

## Two things the disc was hiding

**`OBJ LEVEL`** ships in nine of the ten worlds, identical every time, and never appears in the game. It is the developers' object catalogue: 45 objects on a flat floor covering **26 of the game's 33 types**, and the seven it misses are placed 85 times between them against the 26's four thousand. Walking it once in an emulator names most of the game's vocabulary. `tools/kula_objlevel.py` writes the floor plan and the sheet to fill in.

**`HIDDEN 10`**, the last hidden level of the last world, carries 178 blocks of which only 18 are the level. The other 160 lie flat on z=32, the ceiling of the lattice, 22 blocks above anything you can stand on, spelling **VERY WELL DONE** in block capitals six blocks tall.

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
| `kula_objlevel.py` | the floor plan and sheet for naming objects by walking OBJ LEVEL |
| `kula_tgi.py` | a world's artwork: sections, VRAM page, textures |
| `mips.py` | disassemble the executable, which is how the lattice was pinned down |
| `serve.py` | local static server, caching off |

## The viewer

`public/` is the deploy artifact: dependency-free ES modules, no build step. `js/main.js` boots, `js/state.js` holds shared state and the camera, and modules talk through the `emit`/`on` pair in `js/dom.js` rather than importing each other both ways.

The camera is a plain orbit: a yaw and a pitch give three unit vectors, and every point is projected orthographically onto two of them with the third as depth. Cubes are drawn back to front by that depth, which is exact for equal cubes on a lattice, and a face is drawn only when its outward normal turns toward the camera and the neighbour behind it is absent. Lighting comes from a fixed direction in the world rather than from the screen, so a face keeps its brightness as the view turns and the solid goes on reading as solid.

## Licensing

Copyright (C) 2026 mariobob, under GPL-2.0 (see [LICENSE](LICENSE)). The licence covers the code here and nothing else: the tooling ships no game code, and the extracted level data is © the rights holders in Kula World, presented for research and preservation. A rights holder who wants something taken down can write to hello@retroatlas.org.
