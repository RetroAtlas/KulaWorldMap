# What is in `tools/`

Dependency-free Python 3, standard library only. `oxipng` is used to compress images where it is on PATH, and `ogcard.js` and `icons.js` are the two Node tools. Every tool that reads the disc takes it from `$KULA_DISC`, a raw 2352-byte-sector `.bin` image, which is never committed.

| | |
| --- | --- |
| `disc.py` | a raw PS1 image as an ISO9660 tree, addressed by full path |
| `kula_disc.py` | where this game keeps its packs, textures and executable |
| `kula_pak.py` | the `.PAK` container, and the names inside it |
| `kula_level.py` | the lattice and the record table, field by field |
| `kula_build.py` | reads every level, every mesh and every pack's layout, and writes `public/map_data.json`, `public/objects.json`, `public/packs.json` and the sheet of the effects' sprites under `public/tex/` |
| `kula_kinds.py` | per-type contact sheets, for naming objects |
| `kula_score.py` | what each level scores, beside the curated score where there is one |
| `kula_faces.py` | what the six slots of every record hold, per kind and per face |
| `kula_objlevel.py` | the floor plan and sheet for naming objects by walking OBJ LEVEL |
| `kula_warp.py` | the cheat, or a disc copy, that reaches a level no menu asks for |
| `kula_kwl.py` | a level written back to the game's bytes from its fields, read out of any file the game would load, and held to the disc word for word ([editor.md](editor.md)) |
| `kula_sector.py` | a Mode 2 Form 1 sector built as the disc has it, EDC and ECC included, and the disc's own sectors rebuilt to prove it ([disc.md](disc.md)) |
| `kula_place.py` | a level's stream put into a slot of a pack on a copy of the image, in place, in a pack rebuilt within its sectors or in one moved into the free sectors, every written sector built whole ([disc.md](disc.md)) |
| `kula_patch.py` | a level, or several as one patch, written onto the disc as a PPF, an xdelta or a patched image, each from a project, a level file or a shipped level ([disc.md](disc.md)) |
| `kula_tgi.py` | a world's artwork: sections, VRAM page, textures |
| `kula_ggi.py` | the objects' geometry: the model tables, every mesh, and a sheet of them drawn |
| `kula_skins.py` | what the game paints on every face of every block, read off the executable |
| `kula_tex.py` | the atlases the viewer draws with, every texture of a world in its three shades |
| `png.py` | write a PNG, and squeeze it with `oxipng` where that is installed |
| `mips.py` | disassemble the executable, which is how the lattice was pinned down, and run a routine of it |
| `kula_motion.py` | what the executable does to each thing every frame, the rates behind [motion.md](motion.md) |
| `kula_motion_code.py` | the executable as the readings read it, a word or an instruction at a time, the units and the words the readings share, and the frame loop's checks, "The frame" in [motion.md](motion.md) |
| `ogcard.js` | render the social card from the map itself (Node, needs Playwright) |
| `icons.js` | render the raster icons from the favicon (Node, needs Playwright) |
| `serve.py` | local static server, caching off, 404.html like the host |

`kula_build.py` writes the three JSON files and the sheet in under a second, laid out so that a rebuild diffs line by line, or model by model, and refuses to write when the level file's cross-check fails ([level-format.md](level-format.md)) or when a cap or a loader figure the level writer's checks rest on is not what the executable holds ([editor.md](editor.md)). [tgi.md](tgi.md) and [ggi.md](ggi.md) show the artwork and geometry tools' own switches.
