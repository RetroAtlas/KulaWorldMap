# The .TGI files: the artwork format

Each world keeps its artwork in one `.TGI`, between 628 KB and 664 KB. The container is decoded, read off the game's own parser rather than guessed at, and `tools/kula_tgi.py` reads it. What is left is which palette belongs to which texture.

```bash
python3 tools/kula_tgi.py --world HIRO --sections
python3 tools/kula_tgi.py --world HIRO --vram        # the whole VRAM page
python3 tools/kula_tgi.py --world HIRO --textures    # the 56 textures
```

## How it was found

The filenames are built at `0x0004ccf8`, which takes a world index, an extension index into a table of five at `0x00073504` (`.TGI` is the first), and a destination address. `0x0004034c` calls it with extension 0 and destination `0x8013a000`, and `0x000403a0` then hands that address to `0x000253e0`, which is the parser.

## Settled

**A 400-byte header, then eleven sections.** The parser reads eleven `u32` at header offsets 356 to 396, each a count of `u16`, and walks cumulative pointers from `base + 400`. The eleventh boundary lands exactly on the file size in all ten worlds, which is what says the reading is right.

**The last section is not a picture, it is a list of VRAM uploads.** The loop at `0x000254e0` reads `u16 x, y, w, h`, hands the four of them and the bytes that follow to the Psy-Q `LoadImage` at `0x0005c580`, then skips `w * h * 2` bytes and goes round again. So `w` counts 16-bit VRAM words, not pixels, and an 8bpp texture is twice that many pixels wide. The walk consumes every section-10 byte exactly, with nothing left over, in every world.

**Each world ships 56 textures.** They arrive as 32x64-word uploads, which is 64x64 pixels at 8bpp, and each carries three smaller levels: 8x32, 4x16 and 2x8 words. Those only make sense as 32x32, 16x16 and 8x8 at 4bpp, so the mip levels are half-depth. 56 of each, four levels, 224 uploads.

**Palettes are two uploads parked off the side of the page**, 256 words wide at VRAM x=768, one 72 rows tall and one 25, giving 96 palettes of 256 colours. They are ordinary VRAM writes like anything else, which is why looking for them by scanning the file for smooth 16-bit runs found impostors: pixel data read as colour is smooth too.

## Not settled

**Which palette belongs to which texture.** There are 96 palettes and 56 textures, so it is not a plain pairing. Rendering texture *i* with palette *i* is visibly right for roughly the first third of them, sandstone hieroglyph blocks and hazard chevrons and a gold orb in Hiro's tomb world, and visibly wrong after that. The mapping is presumably in one of the nine sections ahead of the artwork, or carried on the geometry with the usual PS1 texture attributes. Note that a CLUT id of `(y << 6) | (x >> 4)` for these palettes would have `id & 63 == 48`, and none of the values that recur in the level records (`386`, `256`, `500`, `416`) do, so those fields are not it.

**Sections 0 to 9 are unread.** Section 9 is 225 KB and the largest after the artwork; the four 2 KB sections at 1 to 4 are suspiciously uniform. The geometry the game draws these textures on lives somewhere in there.
