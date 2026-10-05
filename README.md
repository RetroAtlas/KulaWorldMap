# Kula World Map

An interactive map of every level in **Kula World** (PlayStation), read straight off the disc: the block lattice each level is built from, every object the game places on it, and the level's own name, time and start. It is at **[kulaworld.retroatlas.org](https://kulaworld.retroatlas.org/)**, part of [RetroAtlas](https://retroatlas.org/), a collection of interactive maps of classic games.

All 230 levels are here, which is more than the game ever shows you in one place: 150 numbered levels across ten worlds, 30 bonus and 10 hidden levels, the 20 finals, the 10 Simon rooms, the lesson and the nine copies of the object catalogue that no menu reaches. A level is titled by the number the game's pause screen gives it, which the engine counts through the worlds rather than reading from the level record; where the record calls it something else, the level's note says so.

The data is read from the NTSC-U release, sold as **Roll Away** (SLUS-00724). The same game shipped as Kula World in PAL territories and Kula Quest in Japan; the level data is the game's own and applies to all three.

## What the disc stores

Every level is one compressed record inside its world's pack: a fixed 34 x 34 x 34 lattice of cells, each empty, one of five plain kinds of block, or a block carrying a record, and a table of records that are the blocks with something on them, a record being a kind of block and six slots that are its six faces, with an object standing on any face whose slot is filled. The game numbers its blocks and objects and names none of them; the names on the map are curated from a walkthrough and from play, and checked by the scores the walkthrough states. The artwork is the game's own, each world's textures replayed from its own file onto the faces the game's loader paints them on, and the objects are drawn from the one mesh file on the disc, moving at the rates the executable moves them. Nothing in a level says how a block looks or how a thing moves: those are rules in the game's code, read off the executable.

## Running and rebuilding

To serve the viewer locally:

```bash
python3 tools/serve.py
```

The disc is never committed. To rebuild the data, point `$KULA_DISC` at a raw 2352-byte-sector `.bin` image:

```bash
export KULA_DISC="/path/to/Roll Away.bin"
python3 tools/kula_build.py
```

That writes `public/map_data.json` and `public/objects.json`, the levels and the objects' meshes, both generated **and committed**, so regenerate them rather than hand-editing.

## Where the rest is

- [docs/viewer.md](docs/viewer.md): every control the map has, what moves, the compass, the search and the permalinks, and how the viewer is built.
- [docs/level-format.md](docs/level-format.md): the level file, reading by reading, with what each rests on, the object catalogue and the cheat that reaches any level.
- [docs/tgi.md](docs/tgi.md): the artwork, and the rule that paints each face.
- [docs/ggi.md](docs/ggi.md): the objects' meshes, colours and sprites.
- [docs/motion.md](docs/motion.md): what the executable does to each thing every frame.
- [docs/camera.md](docs/camera.md): how the game frames a level.
- [docs/annotations.md](docs/annotations.md): what each curated name, point value and note rests on.
- [docs/tools.md](docs/tools.md): what each tool under `tools/` does.
- [CLAUDE.md](CLAUDE.md): the rules for changing any of it, and [backlog/](backlog/) the open questions.

## Licensing

Copyright (C) 2026 mariobob, under GPL-2.0 (see [LICENSE](LICENSE)). The licence covers the code here and nothing else: the tooling ships no game code, and the extracted level data is © the rights holders in Kula World, presented for research and preservation. A rights holder who wants something taken down can write to hello@retroatlas.org.
