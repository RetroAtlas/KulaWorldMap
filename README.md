# Kula World Map

An interactive map of every level in **Kula World** (PlayStation), read straight off the disc: the block lattice each level is built from, every object the game places on it, and the level's own name, time and start.

All 230 levels are here, which is more than the game ever shows you in one place: 150 numbered levels across ten worlds, 30 bonus and 10 hidden levels, the 20 finals, the 10 Simon rooms and the lesson. A level is titled by the number the game's pause screen gives it, which the engine counts through the worlds rather than reading from the level record; where the record calls it something else, Atlantis's `LECEL 94` or Hell's first four, which are numbered one short, the map says so beside the title.

The data is read from the NTSC-U release, sold as **Roll Away** (SLUS-00724). The same game shipped as Kula World in PAL territories and Kula Quest in Japan; the level data is the game's own and applies to all three.

Part of [RetroAtlas](https://retroatlas.org/), a collection of interactive maps of classic games.

## Using the map

- **Drag to turn the level.** A lattice has no side that is the right one to look from, so dragging orbits the camera around it rather than sliding the view: left and right swing around, up and down raise and lower the eye between looking along the floor and looking straight down. `q` and `e` snap the swing to 45°, and `f` frames the level again.
- **Pan** with shift-drag, a right-drag, two fingers, or the arrow keys. If you would rather drag panned all the time, there is a switch for it under Display.
- **Zoom** with the wheel, a pinch, or `+` / `-`, anchored wherever the pointer is.
- **Slice** the level with `,` and `.`, which lower and raise a ceiling so you can see inside a stack. `\` puts the whole level back.
- `t` puts the game's own block textures on and off; with them off the lattice draws in a flat tint per world.
- **Click** a block or an object for what the game stores about it: its lattice cell, its kind and type, and the raw fields the record carries. `Esc` clears.
- `d` switches the objects between the game's own meshes and markers, and `o` hides them.
- **Search** with `/`: a level by name or number (`level 42`, `bonus`, `final 7`), a world by name (`inca`), an object kind by number or curated name, or a bare `x,y,z` to jump to a cell.
- `[` and `]` step through the levels of the current world; `Shift` with either crosses into the next.
- The URL is a permalink: `#L42/45,35/0.90/17,17,17/0,0/33` is level, the yaw and pitch it is turned to, zoom, the cell it orbits around, the pan away from that cell, and the slice.

## What the disc stores, and what it does not

Every level is one zlib record inside its world's `.PAK`, and inflates to a fixed **34 x 34 x 34 lattice** of `u16` cells, a six-byte header, and a table of 256-byte records. A cell holds `0xFFFF` for empty, one of five plain block styles below 5, or `5 + i` for a block carrying record `i`. A record is a block: a kind word, six 32-byte slots, 32 bytes never set, 26 of extras, and **then** the cell it stands on. The cell closes a record rather than opening it, and reading it the other way round pairs every block with the cell one slot behind. The record repeats the cell's own coordinates, which is what pins the two representations together; `tools/kula_build.py` checks that on every build and refuses to write if it fails, all 5540 pairs in the game agreeing. It is a necessary check and not a sufficient one, because the cells stay in order whichever way the stretches are framed: what settled the framing was play.

The five styles below 5 are the block's kind, and a record's kind word is the same enumeration: **0 is a plain block, 1 fire, 2 ice, 3 invisible**, and a block with something standing on it keeps its kind in the record instead of the cell. 4517 cells are plain, then 1065 invisible, 527 ice and 70 fire, and style 4 is one cell in each copy of `OBJ LEVEL`. The map draws each kind over its skin: fire and ice as a wash, an invisible block faint and broken, and a crumbling or vanishing block the same way.

**The six slots are the six faces of the block**, in the order the game numbers directions: the top, then `+x`, `+y`, `-y`, `-x`, and the underside. A slot is a kind word, a `type`, eleven fields and a value, and a slot whose type is not zero is an object standing on that face, so a block carries up to six and 690 carry two. The ball sticks to whichever face it rolls onto, so a level's objects are on all six: 3485 on tops, 939 on undersides and 1484 on sides. The kind word is the block's and is set in the first slot only; four kinds keep their own payload in the first two slots instead, a laser or a rail naming its two ends there and kind 6 keeping a fixed-point copy of its cell. The game has **30 distinct object types** and names none of them.

The order was fixed three ways: LEVEL 1 and LEVEL 2 put everything in the first slot and on top; `HIDDEN 10` puts all eighteen of its objects in the fourth, and in play they stand on the `-y` face of its frame; and a laser's type is the direction from its block to the far end of the beam, on all 123, which is where the numbering of the six comes from. Under that order 8 of the 5885 objects on blocks of the four plain kinds would sit inside a neighbouring block, against 94 for the best of the other 719 orders.

The field at the head of the trailer is signed, and negative on 16 levels. It matches the placed-cell count on 79 of the 230 and is unexplained on the rest, so the map counts the lattice itself and leaves that field unnamed.

Every level ends with exactly one record of kind **666**, standing on no cell and carrying a cell for the camera to look at, two angles and a number that is 99 on 218 of the 230 levels and lower on the other twelve. That reads as the level's time, and the map shows it as such.

**Blocks wear the game's own artwork.** Each world's `.TGI` is a header, eleven sections, and a list of VRAM uploads the game feeds straight to `LoadImage`. Replaying them recovers the page exactly: **56 textures of 64x64 per world**, three 4bpp mip levels of each, and 96 palettes. Section 6 pairs every texture with three palettes, one per lighting level, and section 5 is a table of 119 models that is byte-identical in all ten worlds, so a model means the same thing everywhere and only the pixels change. Four of those models are the world's plain stone, which is what a lattice cell below `firstRecord` draws.

The map uses the three shipped brightnesses as the three faces of a cube, which is what they are for, so the lighting is the game's rather than invented. `tools/kula_tex.py` writes the atlas the viewer samples.

A cell holds either a style or a record index, never both, so a block carrying a record has no style of its own and the record would have to supply one. That the record table is not a skin table is what the record every level ends with says: it carries a look-at, two angles and the time, and stands on no cell. So the map draws every cell in one of the five styles, and which skin a record-carrying block really wears stays open. [docs/tgi.md](docs/tgi.md) has the detail and the addresses it came from, and [docs/level-format.md](docs/level-format.md) is the same for the level file.

**The objects are drawn as themselves**, from the one `.GGI` on the disc, which holds every object's mesh in the game's own colours: the meshes carry no textures, only a colour per corner with the shading baked in, so a coin is gold, blue or bronze by its tier, the four teleporters wear their circuit's colour, and the exit is red. A thing stands on its face with its lowest point just off the block, turned the way its record says where it has a direction, and what moves in play moves here, on the spot: the pickups, the devices that rotate and the stars turn, the moving spikes rise and fall from the phase their record gives them, the corkscrews bounce in theirs, and the wheel rolls. Nothing travels across blocks yet. The pace is the map's own; the game's is not read. The five fruit are five types, and the arcade levels show the one the player needs next, which is the level's number counted round apple, watermelon, pumpkin, bananas, strawberry. Fire, ice, the clock and the start have no mesh and keep their markers, and `d` puts every object back to a marker, a diamond with its type number off the face it stands on. [docs/ggi.md](docs/ggi.md) is the format and the addresses, and `tools/kula_ggi.py` draws every model and every sprite on a sheet.

**Objects ship as the game's own numbers**, and [`public/annotations.json`](public/annotations.json) is where their names go, hand-curated, per object type or per kind of block, with a note saying what each rests on; a type the file does not name shows as its number. The names came from matching Syonyx's Roll Away walkthrough (GameFAQs, 2006) against the disc, level by level: the level it introduces boost buttons on carries the game's first three, the ten levels it marks as hidden-level access are exactly the ten with a hidden exit, and so on down the list. Then arithmetic: the walkthrough states a maximum score for 209 levels, and with coins worth 250, 500 or 750 by their colour field, gems 2975, keys 1000, fruit 2500, an hourglass 1190, sunglasses 500 and a crumbling block 50, and every block a bonus level counts 50 except an invisible one, the disc reproduces it exactly on 191, holds more on the other 18, which is what an unreachable coin leaves, and never less. `python3 tools/kula_score.py --guide <file>` is that check, and the map shows each level's total. On the 18 levels where the disc holds more than a player can collect, `annotations.json` carries the walkthrough's maximum as the level's `score` with a note saying what is out of reach, the map shows that figure beside the disc's, and the check holds the curated number to the walkthrough so it cannot drift. `python3 tools/kula_kinds.py` still writes the contact sheets the naming started from.

## Two things the disc was hiding

**`OBJ LEVEL`** ships in nine of the ten worlds, identical every time, and never appears in the game. It is the developers' object catalogue: 36 objects and nine records of the kinds that are their own thing on a flat floor, covering **23 of the game's 30 object types**, and the seven it misses are placed 125 times between them against the 23's 5,459. Everything on it stands on top, so walking it once in an emulator names most of the game's vocabulary and says nothing about faces. `tools/kula_objlevel.py` writes the floor plan and the sheet to fill in, and `tools/kula_warp.py --cheat` prints the emulator cheat that reaches it.

**Any level is a cheat away.** The walkthrough's GameShark section, from Aris Efraimidis, names the three words the game loads a level from: `800A340C` and `800A3410` take the world, 0 to 9 in pack order, and `800A3408` the slot within it, 0 to 14 for the numbered levels, 15 to 17 the bonus ones, 18 the hidden one, and 19 the slot no menu asks for, which is `OBJ LEVEL` in every world but the first, where it is the Japanese release's tutorial. An emulator cheat that sets those reaches any of the 200 without touching the disc, and `python3 tools/kula_warp.py --cheat --level /HELL/HELL.PAK#18` prints it in the form DuckStation takes, together with `800BA296 0001`, which frees the camera to orbit the level the way the Japanese release's Select button does (from The Cutting Room Floor, whose Roll Away page is also where the regional differences the level notes cite come from); without `--cheat` the same tool writes a patched disc image instead, which is the way for a real console or for the packs the cheat cannot name. The developers had a shorter route still: Left, Up, Down, Right, Square, Triangle, Circle, Cross on the pad arms a loader that takes a level over the console's serial port, and the code is still in the shipped build.

**`HIDDEN 10`**, the last hidden level of the last world, carries 178 blocks of which only 18 are the level. The other 160 lie flat on z=32, the floor of the lattice, 22 blocks below anything you can stand on, spelling **VERY WELL DONE** in block capitals six blocks tall.

## Rebuilding from the disc

The disc is never committed. Point `$KULA_DISC` at a raw 2352-byte-sector `.bin` image:

```bash
export KULA_DISC="/path/to/Roll Away.bin"
python3 tools/kula_build.py
```

That writes `public/map_data.json` and `public/objects.json`, the levels and the objects' meshes, both generated **and committed**, so regenerate them rather than hand-editing. A full build takes under a second, and the files are laid out so that a rebuild diffs line by line, or model by model.

To serve the viewer locally:

```bash
python3 tools/serve.py
```

## What is in `tools/`

Dependency-free Python 3, standard library only. `oxipng` is used to compress images where it is on PATH, and `ogcard.js` is the one Node tool.

| | |
| --- | --- |
| `disc.py` | a raw PS1 image as an ISO9660 tree, addressed by full path |
| `kula_disc.py` | where this game keeps its packs, textures and executable |
| `kula_pak.py` | the `.PAK` container, and the names inside it |
| `kula_level.py` | the lattice and the record table, field by field |
| `kula_build.py` | reads every level and every mesh, and writes `public/map_data.json` and `public/objects.json` |
| `kula_kinds.py` | per-type contact sheets, for naming objects |
| `kula_score.py` | what each level scores, and the check of the names against the walkthrough |
| `kula_faces.py` | what the six slots of every record hold, per kind and per face |
| `kula_objlevel.py` | the floor plan and sheet for naming objects by walking OBJ LEVEL |
| `kula_warp.py` | the cheat, or a disc copy, that reaches a level no menu asks for |
| `kula_tgi.py` | a world's artwork: sections, VRAM page, textures |
| `kula_ggi.py` | the objects' geometry: the model tables, every mesh, and a sheet of them drawn |
| `kula_tex.py` | the block atlas the viewer draws with |
| `png.py` | write a PNG, and squeeze it with `oxipng` where that is installed |
| `mips.py` | disassemble the executable, which is how the lattice was pinned down |
| `ogcard.js` | render the social card from the map itself (Node, needs Playwright) |
| `serve.py` | local static server, caching off, 404.html like the host |

## The viewer

`public/` is the deploy artifact: dependency-free ES modules, no build step. `js/main.js` boots, `js/state.js` holds shared state and the camera, and modules talk through the `emit`/`on` pair in `js/dom.js` rather than importing each other both ways.

The camera is a plain orbit: a yaw and a pitch give three unit vectors, and every point is projected orthographically onto two of them with the third as depth. Cubes are drawn back to front by that depth, which is exact for equal cubes on a lattice, and a face is drawn only when its outward normal turns toward the camera and the neighbour behind it is absent. Lighting comes from a fixed direction in the world rather than from the screen, so a face keeps its brightness as the view turns and the solid goes on reading as solid.

## Licensing

Copyright (C) 2026 mariobob, under GPL-2.0 (see [LICENSE](LICENSE)). The licence covers the code here and nothing else: the tooling ships no game code, and the extracted level data is © the rights holders in Kula World, presented for research and preservation. A rights holder who wants something taken down can write to hello@retroatlas.org.
