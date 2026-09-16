# The .GGI file: the objects' geometry

`/HIRO/HIRO.GGI` is the one file of its kind on the disc, 310,376 bytes, and it holds the meshes of everything the game draws in 3D that is not a block: the ball, every object a level places, and the things that move, each in its own colours, and after them the sprites and the lettering the game draws flat. It is loaded once at startup rather than per world, which is why the objects look the same in every world while the blocks change. `tools/kula_ggi.py` reads all of it.

`tools/kula_build.py` writes what the viewer draws to `public/objects.json`: for every type some level places and that has a mesh, its models at full detail, one per variant, as vertices per frame, polygons, a colour per corner and the flags, in the game's units with a block 512 across. The types that move are keyed by their type numbers from the first table, on the reading below, and the fourteen balls come after, for the start.

```bash
python3 tools/kula_ggi.py --sections
python3 tools/kula_ggi.py --tables          # both model tables, and every model's shape
python3 tools/kula_ggi.py --sheet           # out/ggi/models.png, every model in its colours
python3 tools/kula_ggi.py --textures        # out/ggi/textures.png, every sprite and glyph
```

## How it was found

The filename is built at `0x8004ccf8` from a world index, an extension index into the table of five at `0x80073504` (`.TGI`, `.SFX`, `.PAK`, `.GGI`, `FI.PAK`) and a destination. `0x80040144` calls it with extension 3 and destination `0x80106000`, the buffer the `.SFX` has just been read from and consumed, and `0x80040154` hands that address to `0x80022de0`, which is the parser. The level packs and the artwork are loaded later and per world; this one is not.

## Settled

**A 13-word header, then seven sections laid end to end from byte 52.** Words 6 to 12 are the sections' sizes in `u16`, and the seventh boundary lands on the file's end exactly: S0 191,496 bytes, S1 1,920, S2 8,192, S3 8,192, S4 12, S5 204, S6 100,308. Words 13 and 14 (8 and 408) place two tables inside S0, at bytes 60 and 460. Words 0 to 5 (10, 7, 10, 44, 32, 13) are summed cumulatively by the parser into 10, 17, 27, 71, 103 and 116 and kept; what they bound is not read. Words 15 to 17 repeat the second table's length, 3,600.

**Two model tables, each of `u32` offsets from its own start**, `-1` for absent. The first has 25 entries of four words; the second 50 models of four rows of four words, and the routine at `0x80023258` indexes it as `[model][row][slot]` with strides 64, 16 and 4. That the offsets are relative to the table they sit in, not to the section, is what made the first table's models readable: relative to the section they landed in the middle of the ball.

**In the second table the model index is the object type.** Type 5 holds the teleporter, 7 the exit, 9 the switch, 10 the boost button, 11 the moving spikes, 12 the spikes, 26 the hidden exit, 28 the arrow, 31 the key, 32 and 33 the two pills, 35 the hourglass, 36 the gem, 37 the coin, 38 the sunglasses and 43 to 47 the five fruit, in the walkthrough's own order apple, watermelon, pumpkin, bananas, strawberry. A row is a level of detail, three of them where the model has any and the fourth row unused, and a slot is the variant the type's varying field picks: four teleporters and four switches for the four circuit colours, three gems that are three different cuts, three coins, two exits for red and green. Types 34 and 42, which only the object catalogue places, are a third pill, a flat tablet, and two many-pointed stars. Types with no model of their own, 1, 2, 8, 29 and 30, are the ones drawn on the block's face or not at all: fire, ice, the clock, the start, which is where the ball is, and for which the viewer draws the world's ball. Types 39 to 41 and 48 to 49 all point at the arrow, which reads as a placeholder.

**The first table holds fourteen balls and the things that move.** Entries 0 to 13 are spheres of radius 100, most of 98 vertices and one of 140, each entry naming the same model three times over, and the game picks among them at `0x80035ff4`: the world's place for an arcade level, so the ball is thematic, world 0 white with coloured panels and world 3 white and red; for a bonus level one of entries 10 to 12, stepped on each visit, so which one a player meets depends on the path they took; for a hidden level, which the code numbers mode 2, entry 13, a glass shell of 180 translucent polygons with three shards inside, green, yellow and red, drawn from the same mesh; and in the Japanese release whatever the ball designer chose. The viewer takes the world's, the glass one for a hidden level, and for a bonus level the three in the order of its slots; entries 20 to 24 are a three-pointed star, the wheel at three levels of detail, a four-pointed star, the hexagonal ball and the corkscrew at three levels: types 50, 51, 52, 53 and 56, the thinner star with three points being type 50 and the fuller one with four type 52, which play settled. The parser runs `0x80023258` at load over the second table's first three models and rows and builds nine 348-byte records from them, which is the only call of that routine; how the rest are reached in play is not traced.

**A model** is a header and three or four blocks:

- `i16 x, z, y` of the model's centre, `u16` bounding radius, `i16` (-1, 0 or 3), `u16` flags, then `u32` block offsets, the first of which is 24 or 28 and so says how many there are.
- Polygons: four `u8` vertex indices each, as many as the texture block has records.
- Vertices: `u32 frames, u32 bytes per frame`, then per frame three vertices to a 20-byte group, `x1 z1 x2 z2 x3 z3 y1 y2 y3 pad` as `i16`, unused slots holding `-1`. Y is up. Every model has one frame except the moving spikes, which have 32.
- Colours: `u32 1, u32 bytes`, then 16 bytes per polygon, four corners of `r, g, b, flags`, the flags on the first corner only: `0x20` always, `0x10` for a Gouraud polygon, `0x08` for a quad, `0x02` for a translucent one. That these are colours and not texture coordinates is what the coins say: tier 0 is `(201, 157, 78)`, gold, tier 1 `(79, 157, 201)`, blue, tier 2 `(173, 86, 0)`, bronze; the four teleporters' panels are `(255, 255, 0)`, `(0, 0, 255)`, `(0, 255, 0)` and `(255, 0, 0)`; the exit's two variants are green and red, the lethargy pill red and yellow and the bouncy pill purple and pink, as the walkthrough describes them. The shading is baked in, a teleporter's grey body running from 38 to 167 by face. The quad flag is what settled the triangles, which the fourth index could not: it is 0 on the spikes and 116 to 120 on the ball's pole, and read as quads the polygons without the flag were off their plane by a triangle's width on 88% of them, the ones with it on none. 3,306 of the 6,449 polygons are triangles.
- Normals, where there is a fourth block and bit 1 of the flags is set: packed like the vertices, unit length 4096. Only the balls have them.

**No mesh is textured.** Every polygon is coloured, flat or Gouraud, and nothing in a model names a texture. The fourteen balls are the beach-ball designs the Japanese release lets a player pick from.

**The last section is the sprites and the lettering**, 148 uploads walked by `0x80022fd8` into a table of 180 twelve-byte descriptors (bpp, whether it has a palette, the GPU's clut and tpage words, the offset within the page, width, height) that the HUD code indexes. Each is `i16 bpp, i16 abr`, for a paletted one `u16 x, y` of its palette in VRAM, `i16 inline, u16 late` and the palette's words where `inline` is 0, then `u16 x, y, w, h` of the image and its pixels where `late` is 0, `w` in pixels and the data padded to four bytes; every one is a VRAM upload like the artwork's, to the right of the world's textures at `x` 496 and up. Entries 0 to 9 are the five fruit icons grey and lit, in the same order as types 43 to 47; 10 to 16 are seven 64x64 pictures (a purple glow, the ball's stripes, a red disc, an electric blue ball, a shell, two rings of sparks) that read as the sprites drawn around the teleporters and exits and under the ball; 23 to 26 and 126 are the controller's four symbols; 27 to 70 and 132 to 147 the menus' words; 71 to 102 thirty-two 4x3 swatches; 119 and 125 the digits; 123 and 124 the key icon grey and gold. The header's six bounds (10, 17, 27, 71, 103, 116) are where these groups begin.

**The scale.** A block is 512 units: a crumbling block's record keeps its cell times 512, and the spikes and the teleporter, which cover a block's face, are 462 and 486 across. The ball is radius 100, the exit 266 wide, a coin 186. The sheet draws every model at one scale on that reading.

## Not settled

**Sections 1 to 5**, 1,920, 8,192, 8,192, 12 and 204 bytes; the two of 8 KB are the size of sixteen 256-colour palettes and are not needed to draw anything above.

**The header's `i16` and the flags' bit 0.**

**How a level object finds its model in play**, which is only inferred from the tables' shape. Which way a thing is turned is read off LEVEL 62: its `facing` field is quarter turns on the face, and on a block's top the arrow's tip, the model's `+z`, goes +y, -x, -y, +x for 1 to 4; the map turns every model the same way and on a side face from a tangent it chose, which no level has checked yet. The fruit a level shows is not its type's: LEVEL 1's fruit is type 46, the bananas, where the walkthrough finds an apple, and every named fruit down the walkthrough is the level's number counted round the five, so the map draws the arcade levels that way.
