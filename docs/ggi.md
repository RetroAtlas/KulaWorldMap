# The .GGI file: the objects' geometry

`/HIRO/HIRO.GGI` is the one file of its kind on the disc, 310,376 bytes, and it holds the meshes of everything the game draws in 3D that is not a block: the ball, every object a level places, and the things that move. It is loaded once at startup rather than per world, which is why the objects look the same in every world while the blocks change. `tools/kula_ggi.py` reads it, and what is left is the texture page.

```bash
python3 tools/kula_ggi.py --sections
python3 tools/kula_ggi.py --tables          # both model tables, and every model's shape
python3 tools/kula_ggi.py --sheet           # out/ggi/models.png, every model drawn flat
```

## How it was found

The filename is built at `0x8004ccf8` from a world index, an extension index into the table of five at `0x80073504` (`.TGI`, `.SFX`, `.PAK`, `.GGI`, `FI.PAK`) and a destination. `0x80040144` calls it with extension 3 and destination `0x80106000`, the buffer the `.SFX` has just been read from and consumed, and `0x80040154` hands that address to `0x80022de0`, which is the parser. The level packs and the artwork are loaded later and per world; this one is not.

## Settled

**A 13-word header, then seven sections laid end to end from byte 52.** Words 6 to 12 are the sections' sizes in `u16`, and the seventh boundary lands on the file's end exactly: S0 191,496 bytes, S1 1,920, S2 8,192, S3 8,192, S4 12, S5 204, S6 100,308. Words 13 and 14 (8 and 408) place two tables inside S0, at bytes 60 and 460. Words 0 to 5 (10, 7, 10, 44, 32, 13) are summed cumulatively by the parser into 10, 17, 27, 71, 103 and 116 and kept; what they bound is not read. Words 15 to 17 repeat the second table's length, 3,600.

**Two model tables, each of `u32` offsets from its own start**, `-1` for absent. The first has 25 entries of four words; the second 50 models of four rows of four words, and the routine at `0x80023258` indexes it as `[model][row][slot]` with strides 64, 16 and 4. That the offsets are relative to the table they sit in, not to the section, is what made the first table's models readable: relative to the section they landed in the middle of the ball.

**In the second table the model index is the object type.** Type 5 holds the teleporter, 7 the exit, 9 the switch, 10 the boost button, 11 the moving spikes, 12 the spikes, 26 the hidden exit, 28 the arrow, 31 the key, 32 and 33 the two pills, 35 the hourglass, 36 the gem, 37 the coin, 38 the sunglasses and 43 to 47 the five fruit, in the walkthrough's own order apple, watermelon, pumpkin, bananas, strawberry. A row is a level of detail, three of them where the model has any and the fourth row unused, and a slot is the variant the type's varying field picks: four teleporters and four switches for the four circuit colours, three gems that are three different cuts, three coins, two exits for red and green. Types 34 and 42, which only the object catalogue places, are a third pill, a flat tablet, and two many-pointed stars. Types with no model of their own, 1, 2, 8, 29 and 30, are the ones drawn on the block's face or not at all: fire, ice, the clock, the start. Types 39 to 41 and 48 to 49 all point at the arrow, which reads as a placeholder.

**The first table holds fourteen balls and the things that move.** Entries 0 to 13 are spheres of radius 100, most of 98 vertices and one of 140, each entry naming the same model three times over; entries 20 to 24 are a three-pointed star, the wheel at three levels of detail, a four-pointed star, the hexagonal ball and the corkscrew at three levels: the two directional captivators, the rolling stone, the wandering captivator and the bouncing one, which are types 50 to 56. Which star is type 50 and which 52 is the same open question the names have. The parser runs `0x80023258` at load over the second table's first three models and rows and builds nine 348-byte records from them, which is the only call of that routine; how the rest are reached in play is not traced.

**A model** is a header and three or four blocks:

- `i16 x, z, y` of the model's centre, `u16` bounding radius, `i16` (-1, 0 or 3), `u16` flags, then `u32` block offsets, the first of which is 24 or 28 and so says how many there are.
- Polygons: four `u8` vertex indices each, as many as the texture block has records.
- Vertices: `u32 frames, u32 bytes per frame`, then per frame three vertices to a 20-byte group, `x1 z1 x2 z2 x3 z3 y1 y2 y3 pad` as `i16`, unused slots holding `-1`. Y is up. Every model has one frame except the moving spikes, which have 32.
- Texture records: `u32 1, u32 bytes`, then 16 bytes per polygon in the POLY_FT4 layout, `u0 v0 A, u1 v1 B, u2 v2 pad, u3 v3 pad`. Bit 11 of `A` makes the polygon a quad; without it the fourth index and the fourth coordinate are whatever they are, and 3,306 of the 6,449 polygons are triangles. Reading the flag rather than the fourth index is what settled it: a triangle's fourth byte is 0 on the spikes, 116 to 120 on the ball's pole, and quads read with a fourth corner were off their plane by a triangle's width on 88% of the records whose flag was clear and on none whose flag was set. The low byte of `A` and of `B` are numbers, not the GPU's clut and tpage words; the loader turns them into those, and what they index is the texture question below.
- Normals, where there is a fourth block and bit 1 of the flags is set: packed like the vertices, unit length 4096. Only the balls have them.

**The scale.** A block is 512 units: a crumbling block's record keeps its cell times 512, and the spikes and the teleporter, which cover a block's face, are 462 and 486 across. The ball is radius 100, the exit 266 wide, a coin 186. The sheet draws every model at one scale on that reading.

## Not settled

**The textures.** S6 at 100 KB is the size of a page and S2 and S3 at 8 KB each are the size of sixteen 256-colour palettes, and the UVs are bytes, which says one page 256 wide. It is not an upload list like the TGI's section 10 (that walk does not consume it). The parser calls `0x80022fd8(base, ?, 180)` before the ball records, which is where the numbers in the texture records would be turned into GPU words.

**The header's `i16` and the flags' bit 0**, and what the six category bounds of words 0 to 5 bound.

**How a level object finds its model in play**, which is only inferred from the tables' shape; and whether the fruit a level shows is its type's model or, as the walkthrough's apple on LEVEL 1 (type 46, the bananas) says, the next one the player needs.
