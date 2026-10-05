# What is in `tools/`

Dependency-free Python 3, standard library only. `oxipng` is used to compress images where it is on PATH, and `ogcard.js` and `icons.js` are the two Node tools. Every tool that reads the disc takes it from `$KULA_DISC`, a raw 2352-byte-sector `.bin` image, which is never committed.

| | |
| --- | --- |
| `disc.py` | a raw PS1 image as an ISO9660 tree, addressed by full path |
| `kula_disc.py` | where this game keeps its packs, textures and executable |
| `kula_pak.py` | the `.PAK` container, and the names inside it |
| `kula_level.py` | the lattice and the record table, field by field |
| `kula_build.py` | reads every level and every mesh, and writes `public/map_data.json` and `public/objects.json` |
| `kula_kinds.py` | per-type contact sheets, for naming objects |
| `kula_score.py` | what each level scores, beside the curated score where there is one |
| `kula_faces.py` | what the six slots of every record hold, per kind and per face |
| `kula_objlevel.py` | the floor plan and sheet for naming objects by walking OBJ LEVEL |
| `kula_warp.py` | the cheat, or a disc copy, that reaches a level no menu asks for |
| `kula_tgi.py` | a world's artwork: sections, VRAM page, textures |
| `kula_ggi.py` | the objects' geometry: the model tables, every mesh, and a sheet of them drawn |
| `kula_skins.py` | what the game paints on every face of every block, read off the executable |
| `kula_tex.py` | the atlases the viewer draws with, every texture of a world in its three shades |
| `png.py` | write a PNG, and squeeze it with `oxipng` where that is installed |
| `mips.py` | disassemble the executable, which is how the lattice was pinned down, and run a routine of it |
| `kula_motion.py` | what the executable does to each thing every frame, the rates behind [motion.md](motion.md) |
| `ogcard.js` | render the social card from the map itself (Node, needs Playwright) |
| `icons.js` | render the raster icons from the favicon (Node, needs Playwright) |
| `serve.py` | local static server, caching off, 404.html like the host |

`kula_build.py` writes both JSON files in under a second, laid out so that a rebuild diffs line by line, or model by model, and refuses to write when the level file's cross-check fails ([level-format.md](level-format.md)). [tgi.md](tgi.md) and [ggi.md](ggi.md) show the artwork and geometry tools' own switches.
