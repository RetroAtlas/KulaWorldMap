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
| `kula_motion_things.py` | the things on a block, how each is laid out and turned and the rates it moves at, the boost button, the captivators, their order and the dice, the spin each type's draw builds, and the laser, "The things on a block", "The captivators" and "The laser" in [motion.md](motion.md) |
| `kula_motion_light.py` | a device's light, the colour a teleporter, a switch or an exit that is on casts on the faces round it, the shadows under the ball and the captivators, the moving spikes' and the vanishing block's cycles, the invisible block's light as the ball comes near, the ball's own light and the gem's glints, "The devices' light", "The shadows", "The moving spikes", "The vanishing block", "The invisible block" and "The gem's glints" in [motion.md](motion.md) |
| `kula_motion_roll.py` | the ball's breath at rest and its position in its cell, its moves against the walls, the edges and the cells about it, its frame and the pad, the roll, the turn in place, the camera over a turn and a face change, the way round an edge, the fall and the landing, the landing's squash and the spin, and the body's orientation, "The ball", "The ball's moves" and "The ball's roll" in [motion.md](motion.md) |
| `kula_motion_jump.py` | the view's extra pitch, the word R1 held adds to and a fall or a jump's last rows over nothing grow, the fly-in, the curve the level's start lays and the view flies along for 68 frames with the ball's wait held, and the jump, the hop and the boost button's launch, "The ball's roll" and "The level's clock and its end" in [motion.md](motion.md) and "The view in play" and "The fly-in" in [camera.md](camera.md) |
| `kula_motion_take.py` | what the ball takes off its face, by type, how near its centre has to come to a thing's middle, where that middle stands off its block's centre, what it scores and, for each thing that lasts, the word it sets and how that word runs down, the lethargy pill's hold on the pace, the view and the screen, the devices under the ball, the switch and the teleporter the hazards routine runs every frame, the run of progress each acts in and the marker that keeps either from acting twice in a visit, and the level's end, the exits, the wait an ending runs and the blocks a bonus level marks under the ball, "What the ball takes", "The devices under the ball" and "The level's clock and its end" in [motion.md](motion.md) and "The view in play" in [camera.md](camera.md) |
| `kula_motion_harms.py` | what harms the ball, the hazards the ball's routine runs each frame over its cell and the block under it and the captivators' hit test after them, with a death as a countdown rather than a state and the dying ball's flash and tint, the lit beam that kills the ball whose cell it is, fire's heat and acid's melt with their limits and the heat's shake of the pad, the spikes and the moving spikes' deadly value, the captivators' and the wandering ball's reach as the squared distance each catches the ball within, the corkscrew's reach from where it bounces, and the invincible ball's colours, the light that runs red, green and blue by a counter, "What harms the ball" in [motion.md](motion.md) |
| `ogcard.js` | render the social card from the map itself (Node, needs Playwright) |
| `icons.js` | render the raster icons from the favicon (Node, needs Playwright) |
| `serve.py` | local static server, caching off, 404.html like the host |

`kula_build.py` writes the three JSON files and the sheet in under a second, laid out so that a rebuild diffs line by line, or model by model, and refuses to write when the level file's cross-check fails ([level-format.md](level-format.md)) or when a cap or a loader figure the level writer's checks rest on is not what the executable holds ([editor.md](editor.md)). [tgi.md](tgi.md) and [ggi.md](ggi.md) show the artwork and geometry tools' own switches.
