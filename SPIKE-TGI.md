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

**Section 6 pairs each texture with its palettes.** A CLUT id for a palette at VRAM x=768 is `(row << 6) | 48`, so `id & 63 == 48` is a fingerprint, and section 6 is 16.5% such values against a fraction of a percent everywhere else. Its record is 20 `u16`, 427 of them, and the fingerprint falls on fixed slots within that stride.

A record opens with three CLUT ids, and the same three palettes appear again as bare VRAM rows next to the position of each of the texture's four levels: `clut[3]`, then four times over a level's `x, y` and those rows again. Keying on the level-0 position pairs **all 56 textures with exactly one palette triple, in all ten worlds**, and that lack of any contradiction is what says the reading is right rather than merely possible. The 50 records whose position matches no texture point elsewhere in VRAM and are not needed for this.

**The three palettes are three lighting levels.** The header's three fixed-point triples are `0.7 0.6 0.6`, `0.9 0.8 0.8` and `1.2 1.1 1.1`, and the three palettes come out at mean luminance `0.87 : 1.00 : 1.18` in the same order. The measured spread is narrower than the multipliers because 15-bit colour clamps at both ends, but the ordering and the count match, so the game ships each texture pre-shaded three ways rather than lighting it at runtime.

**Section 5 is a table of 119 models, and it is byte-identical in all ten worlds.** Each entry is `i16 first, i16 count` naming a run of section-6 quads, so a model index means the same thing everywhere and only the pixels behind it change. The copy loop at `0x0002569c` walks it, and for each quad works out `u = (x mod 64) * 2` and `v = y mod 256` before calling `getTPage(1, 0, ...)`, whose `tp` of 1 is what says the textures are 8bpp.

Models 7, 8, 9 and 10 are single quads onto textures 0 to 3, which are the four the world changes and the lattice's plain block styles draw. Model 11 is the shared panel at texture 8.

## Not settled

**Which model a cell carrying a record picks.** The four plain styles are settled, but an entity's `type` runs to 56 against 119 models and nothing yet proves the index. Those blocks draw the world's stone in the meantime.

**Which texture goes on which block face.** That is the level records' problem, not the artwork's: a face's texture has to be named somewhere in the 32-byte entities, and nothing yet ties one of their fields to a texture index.

**Sections 0 to 5 and 7 to 9 are unread.** Section 9 is 225 KB and the largest after the artwork, and the four 2 KB sections at 1 to 4 are suspiciously uniform. The geometry lives somewhere in there.
