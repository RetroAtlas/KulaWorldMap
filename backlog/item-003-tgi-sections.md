# 3. The objects' geometry

## What and why

[docs/tgi.md](../docs/tgi.md) settles the artwork container, the VRAM page, the 56 textures, the 96 palettes, the texture/palette pairing and the 119-model table of quads. A key or a piece of fruit is a solid, so the objects' real geometry is not in that table, and drawing the objects as themselves rather than as markers is the largest visual step the map has left. The TGI's unread sections (0 to 5 and 7 to 9) were the first guess at where it lives; they are not, or not first.

## Where it lives: `/HIRO/HIRO.GGI`

The one `.GGI` on the disc, 310,376 bytes, loaded once at startup rather than per world: `0x80040144` builds its name with extension 3 of the table at `0x80073504` (order `.TGI`, `.SFX`, `.PAK`, `.GGI`, `FI.PAK`), reads it to `0x80106000` over the buffer the `.SFX` just vacated, and `0x80022de0` parses it. Measured 2026-09-15 on the NTSC disc:

- **Header of 13 words**, then seven sections whose sizes in `u16` are words 6 to 12, laid end to end from byte 52: S0 191,496 bytes (models), S1 1,920, S2 8,192, S3 8,192, S4 12, S5 204, S6 100,308; the seventh boundary is the file's end exactly. Words 0 to 5 (10, 7, 10, 44, 32, 13) are summed cumulatively by the parser into six category bounds, 10, 17, 27, 71, 103, 116, which is the shape of a model list in categories; words 13 and 14 (8 and 408) place two tables inside S0.
- **Two model tables.** At byte 60 a table of 25 entries of four `u32`, and at byte 460 one of 225 (3,600 bytes, which words 15 to 17 repeat). An entry is up to four byte offsets, `-1` for absent, relative to byte 460, so the first model starts right after the second table. The routine at `0x80023258` indexes the first as `[model][variant]` and the second as `[model][variant][word]` with strides 64, 16 and 4; its only caller is the parser, which at load runs it over the second table's first three models and three variants, building nine 348-byte records: the ball, at three sizes. Everything else is reached some other way, still to be traced; the parser also keeps each section's address in `gp` slots and calls `0x80022fd8(base, ?, 180)` first.
- **A model** is a 24-byte header, `u32 0, u16, u16, i16, u16` and three block offsets, always 24 and two more, then three blocks: quads of four `u8` vertex indices, terminated by `(1,0,0,0)(0,0,0,0)`; the vertices, packed three at a time as three `(x, z)` `i16` pairs followed by three `y` `i16` and a pad, 20 bytes per three, after an 8-byte prefix; and 16 bytes per quad of `u0 v0, word, u1 v1, word, u2 v2, 0, u3 v3, 0`, the POLY_FT4 layout, with the first word `0x2800` on the one decoded so far and the second 0. The decoded one (second table offset 122,636) is five octagonal rings of radius 142 and 177 alternating at heights 0 to 120, capped, which reads as the rolling stone; the first table's fourteen singles are about 4 KB each and untried.
- **Textures and palettes** are not an upload list like the TGI's section 10 (tried, it does not walk). S6 at 100 KB is the size of a page, and S2 and S3 at 8 KB each are the size of sixteen 256-colour palettes; the UVs being bytes says one 256-wide page.

## What is still to find

1. Which model each of the 32 object types draws, and which variant a colour or tier selects. The category bounds and the annotations' `by` fields are the hooks; the drawing code that indexes the tables by type has not been located, and `0x80022fd8` is the next function to read.
2. The page in S6 and its palettes in S2 and S3, and what the per-quad words select. `tools/kula_tgi.py` has the palette and 4/8bpp machinery to reuse.
3. Whether the first table's 14 large models are the other things the game draws in 3D that are not level objects: the HUD, the hourglass, the digits.

## Sketch

`tools/kula_ggi.py`: parse the header and both tables, decode every model into vertices, quads and UVs, write a contact sheet of each rendered flat so a person can name which type each is (the way the object catalogue was named), then the page and palettes, then `public/objects.json` and an atlas for the viewer. In the viewer, objects drawn as sprites pre-rendered per model and view bucket by a small software rasteriser, behind a toggle beside the markers, keeps the page dependency-free and the frame cheap; a WebGL path is the alternative if sprites read badly.

```bash
python3 tools/kula_tgi.py --world HIRO --sections
```
